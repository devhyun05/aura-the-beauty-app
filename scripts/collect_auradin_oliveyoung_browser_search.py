from __future__ import annotations

import argparse
import csv
import json
import random
import re
import sys
import time
import urllib.parse
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
  sys.path.insert(0, str(SCRIPT_DIR))

from collect_auradin_naver_offer_metadata import _match_score  # noqa: E402
from collect_auradin_oliveyoung_metadata import (  # noqa: E402
  REPO_ROOT,
  _display_path,
  _extract_goods_no,
  _is_security_challenge_page,
  _oliveyoung_url,
  _parse_oliveyoung_page,
  _read_jsonl,
  _short,
  _squash,
  _write_jsonl,
)


COLLECTOR_VERSION = "auradin-oliveyoung-browser-search-v1"
UTC = timezone.utc
CORE_DETAIL_FIELDS = (
  "shadeOptions",
  "colorFamily",
  "undertone",
  "intensity",
  "finish",
  "texture",
  "suitableFor",
  "sellingPoints",
)


def _default_run_date() -> str:
  return (datetime.now(tz=UTC) + timedelta(hours=9)).strftime("%Y%m%d")


def _default_fetched_at(run_date: str) -> str:
  return f"{run_date[:4]}-{run_date[4:6]}-{run_date[6:8]}T00:00:00+09:00"


def _write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)

  with path.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)


def _browser_search_query(row: dict[str, Any]) -> str:
  brand = str(row.get("brand") or "")
  product_name = _squash(row.get("productName"))
  product_name = re.sub(r"\([^)]*(?:점|백화점|신세계|롯데|현대|증정|무료배송)[^)]*\)", " ", product_name)
  product_name = re.sub(r"\[[^]]*(?:점|백화점|신세계|롯데|현대|증정|무료배송)[^]]*\]", " ", product_name)
  product_name = re.sub(r"^\([^)]*\)\s*", "", product_name)
  product_name = re.sub(r"^\[[^]]*\]\s*", "", product_name)
  product_name = product_name.replace("이런 상품 어때요?", "")
  product_name = re.sub(r"\[(?:NEW|단독|컬러출시|기획|증정|올영픽)[^]]*\]", " ", product_name, flags=re.I)
  product_name = re.sub(r"\b(?:본품|리필|증정|기획|단독|택1|세트|무료배송)\b", " ", product_name, flags=re.I)
  product_name = re.sub(r"\s+\d+(?:\.\d+)?\s*(?:g|ml)\s*$", " ", product_name, flags=re.I)

  if brand and product_name.lower().startswith(brand.lower()):
    product_name = product_name[len(brand):]

  return _squash(f"{brand} {product_name}")[:80]


def _search_url(query: str) -> str:
  return "https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=" + urllib.parse.quote(query)


def _result_text(item: dict[str, Any]) -> str:
  return _squash(
    " ".join(
      str(item.get(key) or "")
      for key in ("title", "anchorText", "ariaLabel", "parentText", "href")
    ),
  )


def _score_search_result(row: dict[str, Any], item: dict[str, Any]) -> float:
  title = _result_text(item)
  offer = {
    "productId": item.get("productId"),
    "title": title,
  }
  score = _match_score(row, offer)

  if _extract_goods_no(str(item.get("href") or "")):
    score = min(1.0, score + 0.06)

  return round(score, 2)


def _dedupe_results(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
  seen: set[str] = set()
  deduped: list[dict[str, Any]] = []

  for item in items:
    goods_no = str(item.get("goodsNo") or "")
    href = str(item.get("href") or "")
    key = goods_no or href

    if not key or key in seen:
      continue

    seen.add(key)
    deduped.append(item)

  return deduped


def _extract_search_results(page: Any) -> list[dict[str, Any]]:
  items = page.evaluate(
    """
    () => Array.from(document.querySelectorAll('a[href*="goodsNo="], a[href*="goods/getGoodsDetail"], a[href*="partner.do"]'))
      .map((anchor) => {
        const parent = anchor.closest('li, .prd_info, .goodsList, .prod, .item, div');
        const image = anchor.querySelector('img') || (parent && parent.querySelector('img'));
        return {
          ariaLabel: anchor.getAttribute('aria-label') || '',
          anchorText: anchor.innerText || '',
          href: anchor.href || anchor.getAttribute('href') || '',
          imageAlt: image ? (image.getAttribute('alt') || '') : '',
          parentText: parent ? (parent.innerText || '') : '',
          title: anchor.getAttribute('title') || (image ? (image.getAttribute('alt') || '') : ''),
        };
      })
      .filter((item) => item.href && item.href.includes('goodsNo='))
      .slice(0, 80)
    """,
  )

  normalized: list[dict[str, Any]] = []

  for item in items:
    if not isinstance(item, dict):
      continue

    href = str(item.get("href") or "")
    goods_no = _extract_goods_no(href)

    if not goods_no:
      continue

    normalized.append(
      {
        "anchorText": _short(item.get("anchorText"), 180),
        "ariaLabel": _short(item.get("ariaLabel"), 180),
        "goodsNo": goods_no,
        "href": _oliveyoung_url(goods_no),
        "imageAlt": _short(item.get("imageAlt"), 180),
        "parentText": _short(item.get("parentText"), 260),
        "title": _short(item.get("title"), 180),
      },
    )

  return _dedupe_results(normalized)


def _extract_detail_from_browser(
  *,
  page: Any,
  row: dict[str, Any],
  search_item: dict[str, Any],
  fetched_at: str,
  min_match_score: float,
  page_settle_ms: int,
) -> dict[str, Any]:
  goods_no = str(search_item.get("goodsNo") or "")
  detail_url = str(search_item.get("href") or _oliveyoung_url(goods_no))
  match_score = _score_search_result(row, search_item)
  discovery = {
    "discoverySource": "oliveyoung_browser_search",
    "goodsNo": goods_no,
    "matchScore": match_score,
    "rawText": _result_text(search_item),
    "sourceUrl": detail_url,
  }

  if match_score < min_match_score:
    return {
      "brand": row.get("brand"),
      "candidateId": row.get("candidateId"),
      "category": row.get("category"),
      "collectionStatus": "low_match_score",
      "collectorVersion": COLLECTOR_VERSION,
      "failureReason": f"match_score_below_{min_match_score}",
      "fields": {},
      "fetchedAt": fetched_at,
      "goodsNo": goods_no,
      "matchScore": match_score,
      "oliveYoungSourceUrl": detail_url,
      "productName": row.get("productName"),
      "rawStored": False,
      "searchResult": search_item,
    }

  try:
    response = page.goto(detail_url, wait_until="domcontentloaded")
    page.wait_for_timeout(page_settle_ms)
    content = page.content()
    http_status = response.status if response else None
  except Exception as exc:  # noqa: BLE001
    return {
      "brand": row.get("brand"),
      "candidateId": row.get("candidateId"),
      "category": row.get("category"),
      "collectionStatus": "blocked",
      "collectorVersion": COLLECTOR_VERSION,
      "failureReason": f"{type(exc).__name__}: {exc}",
      "fields": {},
      "fetchedAt": fetched_at,
      "goodsNo": goods_no,
      "matchScore": match_score,
      "oliveYoungSourceUrl": detail_url,
      "productName": row.get("productName"),
      "rawStored": False,
      "searchResult": search_item,
    }

  if http_status in {401, 403, 429} or _is_security_challenge_page(content):
    return {
      "brand": row.get("brand"),
      "candidateId": row.get("candidateId"),
      "category": row.get("category"),
      "collectionStatus": "blocked",
      "collectorVersion": COLLECTOR_VERSION,
      "failureReason": "security_challenge" if _is_security_challenge_page(content) else f"http_status:{http_status}",
      "fields": {},
      "fetchedAt": fetched_at,
      "goodsNo": goods_no,
      "matchScore": match_score,
      "oliveYoungSourceUrl": detail_url,
      "productName": row.get("productName"),
      "rawStored": False,
      "searchResult": search_item,
      "browserFetchSummary": {
        "contentLength": len(content),
        "httpStatus": http_status,
        "urlEffective": page.url,
      },
    }

  parsed = _parse_oliveyoung_page(
    row,
    page_text=content,
    source_url=detail_url,
    goods_no=goods_no,
    fetched_at=fetched_at,
    discovery=discovery,
    fetch_method="browser_search_click",
  )
  parsed["browserFetchSummary"] = {
    "contentLength": len(content),
    "httpStatus": http_status,
    "urlEffective": page.url,
  }
  parsed["collectorVersion"] = COLLECTOR_VERSION
  parsed["matchScore"] = match_score
  parsed["searchResult"] = search_item
  return parsed


def _candidate_sort_key(row: dict[str, Any]) -> tuple[int, int, int, str, str]:
  category = str(row.get("category") or "")
  fields = row.get("fields") if isinstance(row.get("fields"), dict) else {}
  missing_core = sum(
    1
    for field in ("shadeOptions", "colorFamily", "undertone", "finish", "texture")
    if not ((fields.get(field) or {}).get("value"))
  )
  return (
    -int(category in {"lip", "cheek", "shadow"}),
    -missing_core,
    int(row.get("rankInBrandCategory") or 999),
    str(row.get("brand") or ""),
    str(row.get("productName") or ""),
  )


def collect_browser_search(
  *,
  limited_results_path: Path,
  output_path: Path,
  report_path: Path,
  targets_output_path: Path,
  max_rows: int,
  min_match_score: float,
  headless: bool,
  user_data_dir: Path,
  page_settle_ms: int,
  timeout_seconds: float,
  delay_seconds: float,
  delay_jitter_seconds: float,
  fetched_at: str,
) -> dict[str, Any]:
  try:
    from playwright.sync_api import sync_playwright  # type: ignore
  except Exception as exc:  # noqa: BLE001
    raise RuntimeError(f"Playwright is not available: {exc}") from exc

  rows = sorted(_read_jsonl(limited_results_path), key=_candidate_sort_key)
  candidates = rows[:max_rows] if max_rows > 0 else rows
  outputs: list[dict[str, Any]] = []
  targets: list[dict[str, Any]] = []
  user_data_dir.mkdir(parents=True, exist_ok=True)

  with sync_playwright() as playwright:
    context = playwright.chromium.launch_persistent_context(
      str(user_data_dir),
      headless=headless,
      locale="ko-KR",
      user_agent=(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
      ),
      viewport={"height": 900, "width": 1365},
    )
    page = context.new_page()
    page.set_default_timeout(int(timeout_seconds * 1000))

    try:
      for index, row in enumerate(candidates, start=1):
        query = _browser_search_query(row)
        url = _search_url(query)

        if index > 1:
          sleep_seconds = delay_seconds + (random.uniform(0, delay_jitter_seconds) if delay_jitter_seconds > 0 else 0)
          time.sleep(sleep_seconds)

        try:
          response = page.goto(url, wait_until="domcontentloaded")
          page.wait_for_timeout(page_settle_ms)
          content = page.content()
          search_status = response.status if response else None
        except Exception as exc:  # noqa: BLE001
          outputs.append(
            {
              "brand": row.get("brand"),
              "candidateId": row.get("candidateId"),
              "category": row.get("category"),
              "collectionStatus": "blocked",
              "collectorVersion": COLLECTOR_VERSION,
              "failureReason": f"search_navigation_{type(exc).__name__}: {exc}",
              "fields": {},
              "fetchedAt": fetched_at,
              "productName": row.get("productName"),
              "query": query,
              "rawStored": False,
              "searchUrl": url,
            },
          )
          continue

        if search_status in {401, 403, 429} or _is_security_challenge_page(content):
          outputs.append(
            {
              "brand": row.get("brand"),
              "candidateId": row.get("candidateId"),
              "category": row.get("category"),
              "collectionStatus": "blocked",
              "collectorVersion": COLLECTOR_VERSION,
              "failureReason": "search_security_challenge" if _is_security_challenge_page(content) else f"search_http_status:{search_status}",
              "fields": {},
              "fetchedAt": fetched_at,
              "productName": row.get("productName"),
              "query": query,
              "rawStored": False,
              "searchFetchSummary": {
                "contentLength": len(content),
                "httpStatus": search_status,
                "urlEffective": page.url,
              },
              "searchUrl": url,
            },
          )
          continue

        search_results = _extract_search_results(page)
        scored_results = sorted(
          (
            {
              **item,
              "matchScore": _score_search_result(row, item),
            }
            for item in search_results
          ),
          key=lambda item: float(item.get("matchScore") or 0),
          reverse=True,
        )
        selected = scored_results[0] if scored_results else None
        targets.append(
          {
            "candidateId": row.get("candidateId"),
            "brand": row.get("brand"),
            "category": row.get("category"),
            "productName": row.get("productName"),
            "query": query,
            "resultCount": len(scored_results),
            "selectedGoodsNo": (selected or {}).get("goodsNo") or "",
            "selectedMatchScore": (selected or {}).get("matchScore") or "",
            "selectedTitle": _short(_result_text(selected or {}), 180),
            "selectedUrl": (selected or {}).get("href") or "",
          },
        )

        if not selected:
          outputs.append(
            {
              "brand": row.get("brand"),
              "candidateId": row.get("candidateId"),
              "category": row.get("category"),
              "collectionStatus": "not_found",
              "collectorVersion": COLLECTOR_VERSION,
              "failureReason": "no_search_results_with_goods_no",
              "fields": {},
              "fetchedAt": fetched_at,
              "productName": row.get("productName"),
              "query": query,
              "rawStored": False,
              "searchFetchSummary": {
                "contentLength": len(content),
                "httpStatus": search_status,
                "urlEffective": page.url,
              },
              "searchUrl": url,
            },
          )
          continue

        outputs.append(
          _extract_detail_from_browser(
            page=page,
            row=row,
            search_item=selected,
            fetched_at=fetched_at,
            min_match_score=min_match_score,
            page_settle_ms=page_settle_ms,
          ),
        )

        print(
          json.dumps(
            {
              "processed": index,
              "status": outputs[-1].get("collectionStatus"),
              "candidateId": row.get("candidateId"),
              "query": query,
              "selectedGoodsNo": selected.get("goodsNo"),
              "matchScore": selected.get("matchScore"),
              "fieldCount": len(outputs[-1].get("fields") or {}),
            },
            ensure_ascii=False,
            sort_keys=True,
          ),
          file=sys.stderr,
          flush=True,
        )
    finally:
      context.close()

  _write_jsonl(output_path, outputs)
  _write_csv(
    targets_output_path,
    targets,
    [
      "candidateId",
      "brand",
      "category",
      "productName",
      "query",
      "resultCount",
      "selectedGoodsNo",
      "selectedMatchScore",
      "selectedTitle",
      "selectedUrl",
    ],
  )
  _write_report(report_path, output_path, targets_output_path, outputs)

  return {
    "output": _display_path(output_path),
    "report": _display_path(report_path),
    "rows": len(outputs),
    "targetsOutput": _display_path(targets_output_path),
    "withNonPresenceDetailFields": sum(
      1
      for row in outputs
      if any(((row.get("fields") or {}).get(field) or {}).get("value") not in (None, [], "") for field in CORE_DETAIL_FIELDS)
    ),
  }


def _write_report(
  report_path: Path,
  output_path: Path,
  targets_output_path: Path,
  outputs: list[dict[str, Any]],
) -> None:
  report_path.parent.mkdir(parents=True, exist_ok=True)
  status_counts = Counter(str(row.get("collectionStatus")) for row in outputs)
  field_counts = Counter(field for row in outputs for field in (row.get("fields") or {}))
  failure_counts = Counter(str(row.get("failureReason") or "") for row in outputs if row.get("failureReason"))
  non_presence_rows = sum(
    1
    for row in outputs
    if any(((row.get("fields") or {}).get(field) or {}).get("value") not in (None, [], "") for field in CORE_DETAIL_FIELDS)
  )
  lines = [
    "# Auradin OliveYoung Browser Search Collection",
    "",
    f"- Output: `{_display_path(output_path)}`",
    f"- Target queue: `{_display_path(targets_output_path)}`",
    f"- Rows: {len(outputs)}",
    f"- Rows with fields: {sum(1 for row in outputs if row.get('fields'))}",
    f"- Rows with non-presence detail fields: {non_presence_rows}",
    f"- Collection status: `{json.dumps(dict(sorted(status_counts.items())), ensure_ascii=False)}`",
    f"- Failure reasons: `{json.dumps(dict(sorted(failure_counts.items())), ensure_ascii=False)}`",
    f"- Field counts: `{json.dumps(dict(sorted(field_counts.items())), ensure_ascii=False)}`",
    "",
    "## Notes",
    "",
    "- Flow: open OliveYoung search page in a normal Playwright Chromium session, extract visible goods links, click the best match, then parse public product-page DOM/embedded option data.",
    "- Login, captcha, security challenge, 403, and 429 pages are recorded as `blocked`; no bypass flow is implemented.",
    "- Raw HTML, reviews, ingredients, images, colorHex/colorLab, and manufacturing country are not stored.",
    "- `oliveYoungListed=false` is not emitted; absence of evidence remains unknown.",
  ]
  report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Collect OliveYoung metadata by browser search -> product detail click.")
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument("--limited-results", type=Path)
  parser.add_argument("--output", type=Path)
  parser.add_argument("--report", type=Path)
  parser.add_argument("--targets-output", type=Path)
  parser.add_argument("--max-rows", type=int, default=5)
  parser.add_argument("--min-match-score", type=float, default=0.5)
  parser.add_argument("--headful", action="store_true")
  parser.add_argument("--user-data-dir", type=Path, default=Path("/private/tmp/auradin-oliveyoung-browser-search-profile"))
  parser.add_argument("--page-settle-ms", type=int, default=5000)
  parser.add_argument("--timeout-seconds", type=float, default=35.0)
  parser.add_argument("--delay-seconds", type=float, default=20.0)
  parser.add_argument("--delay-jitter-seconds", type=float, default=5.0)
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  limited_results_path = args.limited_results or REPO_ROOT / "data" / "auradin" / "detail" / "normalized" / f"limited_detail_results_{args.date}.jsonl"
  output_path = args.output or REPO_ROOT / "data" / "auradin" / "detail" / "retail_expanded" / f"oliveyoung_browser_search_metadata_{args.date}.jsonl"
  report_path = args.report or REPO_ROOT / "reports" / "auradin" / f"oliveyoung_browser_search_metadata_{args.date}.md"
  targets_output_path = args.targets_output or REPO_ROOT / "data" / "auradin" / "detail" / "targets" / f"oliveyoung_browser_search_targets_{args.date}.csv"
  result = collect_browser_search(
    limited_results_path=limited_results_path,
    output_path=output_path,
    report_path=report_path,
    targets_output_path=targets_output_path,
    max_rows=args.max_rows,
    min_match_score=args.min_match_score,
    headless=not args.headful,
    user_data_dir=args.user_data_dir,
    page_settle_ms=args.page_settle_ms,
    timeout_seconds=args.timeout_seconds,
    delay_seconds=args.delay_seconds,
    delay_jitter_seconds=args.delay_jitter_seconds,
    fetched_at=_default_fetched_at(args.date),
  )
  print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
