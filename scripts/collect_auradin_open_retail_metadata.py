from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.parse
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
  sys.path.insert(0, str(SCRIPT_DIR))

from collect_auradin_official_metadata import (  # noqa: E402
  FINISH_RULES,
  INTENSITY_RULES,
  REPO_ROOT,
  SELLING_POINT_RULES,
  SUITABLE_FOR_RULES,
  TEXTURE_RULES,
  _aggregate_from_options,
  _clean_option_name,
  _collect_tags,
  _fetch_text,
  _field_payload,
  _infer_by_rules,
  _merge_shade_options,
  _plausible_structured_option,
  _shade_payload_from_name,
  _squash,
  _tokens,
)


COLLECTOR_VERSION = "auradin-open-retail-metadata-v1"
SUPPORTED_DOMAINS = {
  "hi.thehyundai.com",
  "www.shinsegaetvshopping.com",
  "www.musinsa.com",
  "link.musinsa.com",
  "www.poom.co.kr",
  "www.11st.co.kr",
}
COUNTRY_MAP = {
  "대한민국": "Korea",
  "한국": "Korea",
  "국내": "Korea",
  "korea": "Korea",
  "south korea": "Korea",
  "중국": "China",
  "china": "China",
  "일본": "Japan",
  "japan": "Japan",
  "이탈리아": "Italy",
  "italy": "Italy",
  "프랑스": "France",
  "france": "France",
  "미국": "United States",
  "usa": "United States",
  "united states": "United States",
}


def _default_run_date() -> str:
  return (datetime.now(tz=UTC) + timedelta(hours=9)).strftime("%Y%m%d")


def _default_fetched_at(run_date: str) -> str:
  return f"{run_date[:4]}-{run_date[4:6]}-{run_date[6:8]}T00:00:00+09:00"


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
  rows: list[dict[str, Any]] = []

  for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
    stripped = line.strip()

    if not stripped:
      continue

    row = json.loads(stripped)

    if not isinstance(row, dict):
      raise ValueError(f"Expected JSON object at {path}:{line_number}")

    rows.append(row)

  return rows


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(
    "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
    encoding="utf-8",
  )


def _domain(url: str) -> str:
  return urllib.parse.urlparse(str(url or "")).netloc.lower()


def _source_url(row: dict[str, Any]) -> str:
  fields = row.get("fields") if isinstance(row.get("fields"), dict) else {}
  purchase_url = (fields.get("purchaseUrl") or {}).get("value")

  if purchase_url:
    return str(purchase_url)

  return str((row.get("detailSourceStatus") or {}).get("sourceUrl") or "")


def _normalize_country(raw: str) -> str:
  text = _squash(raw)
  text = re.split(r"[,/·|]", text)[0].strip()
  lowered = text.lower()

  if not text or any(marker in lowered for marker in ("상세", "별도", "참조", "표기", "상품상세")):
    return ""

  return COUNTRY_MAP.get(lowered) or COUNTRY_MAP.get(text) or text


def _extract_made_in_country(text: str) -> tuple[str | None, str]:
  decoded = html.unescape(text)
  decoded = decoded.replace("\\u003C", "<").replace("\\u003E", ">")
  plain = re.sub(r"<[^>]+>", " ", decoded)
  plain = _squash(plain)
  match = re.search(
    r"(제조국|제조\s*국가|원산지)\s*[:：]?\s*(대한민국|한국|국내|Korea|South Korea|중국|China|일본|Japan|이탈리아|Italy|프랑스|France|미국|USA|United States)",
    plain,
    flags=re.I,
  )

  if not match:
    match = re.search(
      r'"name"\s*:\s*"제조국"\s*,\s*"value"\s*:\s*"([^"]+)"',
      decoded,
      flags=re.I,
    )

    if match:
      normalized_country = _normalize_country(match.group(1))
      return (normalized_country, f"제조국 {match.group(1)}") if normalized_country else (None, "")

  if not match:
    return None, ""

  normalized_country = _normalize_country(match.group(2))
  return (normalized_country, f"{match.group(1)} {match.group(2)}") if normalized_country else (None, "")


def _brand_aliases(row: dict[str, Any]) -> tuple[str, ...]:
  brand = str(row.get("brand") or "")
  aliases = {brand, brand.lower()}

  if brand == "3CE":
    aliases.update({"3ce", "stylenanda", "쓰리씨이"})
  elif brand == "VDL":
    aliases.update({"vdl", "브이디엘"})
  elif brand == "정샘물 뷰티":
    aliases.update({"정샘물", "jungsaemmool", "jsmbeauty"})

  return tuple(alias for alias in aliases if alias)


def _options_from_names(
  names: list[str],
  *,
  product_name: str,
  brand_aliases: tuple[str, ...],
  source_type: str,
  confidence: float,
) -> list[dict[str, Any]]:
  product_tokens = _tokens(product_name, brand_aliases)
  options: list[dict[str, Any]] = []

  for raw_name in names:
    cleaned = _clean_option_name(raw_name)

    if not cleaned:
      continue

    if not _plausible_structured_option(cleaned, product_tokens, brand_aliases):
      continue

    options.append(_shade_payload_from_name(cleaned, source_type=source_type, confidence=confidence))

  return _merge_shade_options(options)


def _attach_option_fields(
  fields: dict[str, Any],
  *,
  shade_options: list[dict[str, Any]],
  raw_text: str,
  source_url: str,
  source_type: str,
  confidence: float,
) -> None:
  if not shade_options:
    return

  fields["shadeOptions"] = _field_payload(
    shade_options,
    confidence,
    raw_text,
    source_url,
    source_type=source_type,
  )
  color_family, color_confidence = _aggregate_from_options(shade_options, "colorFamily")

  if color_family:
    fields["colorFamily"] = _field_payload(
      color_family,
      color_confidence,
      raw_text,
      source_url,
      source_type=source_type,
    )

  undertone, undertone_confidence = _aggregate_from_options(shade_options, "undertone")

  if undertone:
    fields["undertone"] = _field_payload(
      undertone,
      undertone_confidence,
      raw_text,
      source_url,
      source_type=source_type,
    )


def _attach_text_fields(
  fields: dict[str, Any],
  *,
  evidence_text: str,
  source_url: str,
  source_type: str,
  confidence: float = 0.66,
) -> None:
  for field, rules in (
    ("finish", FINISH_RULES),
    ("texture", TEXTURE_RULES),
    ("intensity", INTENSITY_RULES),
  ):
    value = _infer_by_rules(evidence_text, rules)

    if value:
      fields[field] = _field_payload(
        value,
        confidence,
        evidence_text,
        source_url,
        source_type=source_type,
      )

  selling_points = _collect_tags(evidence_text, SELLING_POINT_RULES)

  if selling_points:
    fields["sellingPoints"] = _field_payload(
      selling_points,
      confidence,
      evidence_text,
      source_url,
      source_type=source_type,
    )

  suitable_for = _collect_tags(evidence_text, SUITABLE_FOR_RULES)

  if suitable_for:
    fields["suitableFor"] = _field_payload(
      suitable_for,
      confidence,
      evidence_text,
      source_url,
      source_type=source_type,
    )


def _single_shade_from_title(
  title: str,
  *,
  product_name: str,
  brand_aliases: tuple[str, ...],
  source_type: str,
) -> list[dict[str, Any]]:
  matches = re.findall(r"\b([A-Z]?\d{1,2}[A-Z]?\s*호?\s*[가-힣A-Za-z][가-힣A-Za-z0-9\s]{1,18})", title, flags=re.I)
  return _options_from_names(
    matches,
    product_name=product_name,
    brand_aliases=brand_aliases,
    source_type=source_type,
    confidence=0.74,
  )


def _parse_hyundai(row: dict[str, Any], page_text: str, source_url: str) -> tuple[dict[str, Any], str]:
  names = [
    _squash(match)
    for match in re.findall(r'\\"uitm(?:Tot)?Nm\\"\s*:\s*\\"([^\\"]+)\\"', page_text)
  ]
  title_match = re.search(r'\\"slitmNm\\"\s*:\s*\\"([^\\"]+)\\"', page_text)
  title = _squash(title_match.group(1)) if title_match else str(row.get("productName") or "")
  shade_options = _options_from_names(
    names,
    product_name=f"{title} {row.get('productName') or ''}",
    brand_aliases=_brand_aliases(row),
    source_type="thehyundai_next_option",
    confidence=0.84,
  )
  evidence_text = _squash(" ".join([title, ", ".join(option["optionName"] for option in shade_options[:16])]))
  fields: dict[str, Any] = {
    "departmentStoreListed": _field_payload(
      True,
      0.88,
      "더현대Hi 공개 상품 상세",
      source_url,
      source_type="thehyundai_public_product_page",
    ),
  }
  _attach_option_fields(
    fields,
    shade_options=shade_options,
    raw_text=", ".join(option["optionName"] for option in shade_options[:16]),
    source_url=source_url,
    source_type="thehyundai_next_option",
    confidence=0.84,
  )
  _attach_text_fields(
    fields,
    evidence_text=evidence_text,
    source_url=source_url,
    source_type="thehyundai_product_text",
    confidence=0.66,
  )
  made_in_country, made_raw = _extract_made_in_country(page_text)

  if made_in_country:
    fields["madeInCountry"] = _field_payload(
      made_in_country,
      0.72,
      made_raw,
      source_url,
      source_type="thehyundai_product_text",
    )

  return fields, title


def _parse_shinsegae(row: dict[str, Any], page_text: str, source_url: str) -> tuple[dict[str, Any], str]:
  product_match = re.search(r'ENP_VAR\.collect\.productName\s*=\s*"([^"]+)"', page_text)
  brand_match = re.search(r'item_brand:\s*"([^"]+)"', page_text)
  category_match = re.search(r'item_category:\s*"([^"]+)"', page_text)
  title = _squash(product_match.group(1)) if product_match else str(row.get("productName") or "")
  evidence_text = _squash(" ".join([title, brand_match.group(1) if brand_match else "", category_match.group(1) if category_match else ""]))
  fields: dict[str, Any] = {}

  if "신세계" in str(row.get("productName") or "") or "신세계" in page_text[:50000]:
    fields["departmentStoreListed"] = _field_payload(
      True,
      0.82,
      str(row.get("productName") or title),
      source_url,
      source_type="shinsegaetv_public_product_page",
    )

  _attach_text_fields(
    fields,
    evidence_text=evidence_text,
    source_url=source_url,
    source_type="shinsegaetv_product_text",
    confidence=0.66,
  )
  made_in_country, made_raw = _extract_made_in_country(page_text)

  if made_in_country:
    fields["madeInCountry"] = _field_payload(
      made_in_country,
      0.76,
      made_raw,
      source_url,
      source_type="shinsegaetv_property_value",
    )

  return fields, title


def _parse_musinsa(row: dict[str, Any], page_text: str, source_url: str) -> tuple[dict[str, Any], str]:
  state_match = re.search(r"window\.__MSS_FE__\.product\.state\s*=\s*(\{.*?\});", page_text, flags=re.S)
  state: dict[str, Any] = {}

  if state_match:
    try:
      state = json.loads(html.unescape(state_match.group(1)))
    except json.JSONDecodeError:
      state = {}

  title = _squash(state.get("goodsNm")) or str(row.get("productName") or "")
  brand_info = state.get("brandInfo") if isinstance(state.get("brandInfo"), dict) else {}
  category = _squash(state.get("baseCategoryName") or "")
  detail_text = _squash(html.unescape(str(state.get("goodsContents") or "")))
  evidence_text = _squash(" ".join([title, category, detail_text]))
  fields: dict[str, Any] = {}
  brand_nation = _squash(brand_info.get("brandNationName") or brand_info.get("brandNationEnglishName") or "")

  if brand_nation:
    fields["brandCountry"] = _field_payload(
      _normalize_country(brand_nation),
      0.72,
      f"brandNationName {brand_nation}",
      source_url,
      source_type="musinsa_product_state",
    )

  _attach_text_fields(
    fields,
    evidence_text=evidence_text,
    source_url=source_url,
    source_type="musinsa_product_state",
    confidence=0.66,
  )
  made_in_country, made_raw = _extract_made_in_country(evidence_text)

  if made_in_country:
    fields["madeInCountry"] = _field_payload(
      made_in_country,
      0.74,
      made_raw,
      source_url,
      source_type="musinsa_product_state",
    )

  return fields, title


def _parse_poom(row: dict[str, Any], page_text: str, source_url: str) -> tuple[dict[str, Any], str]:
  info_match = re.search(r'GOODS\s*=\s*\$\.extend\(true,\s*GOODS,\s*(\{.*?\})\s*\);', page_text, flags=re.S)
  info: dict[str, Any] = {}

  if info_match:
    try:
      payload = json.loads(info_match.group(1))
      info = payload.get("info") if isinstance(payload.get("info"), dict) else {}
    except json.JSONDecodeError:
      info = {}

  title = _squash(info.get("goods_nm")) or str(row.get("productName") or "")
  category_match = re.search(r'item_category3:\s*"([^"]+)"', page_text)
  evidence_text = _squash(" ".join([title, category_match.group(1) if category_match else ""]))
  fields: dict[str, Any] = {}
  shade_options = _single_shade_from_title(
    title,
    product_name=str(row.get("productName") or title),
    brand_aliases=_brand_aliases(row),
    source_type="poom_product_title",
  )
  _attach_option_fields(
    fields,
    shade_options=shade_options,
    raw_text=", ".join(option["optionName"] for option in shade_options[:8]),
    source_url=source_url,
    source_type="poom_product_title",
    confidence=0.74,
  )
  _attach_text_fields(
    fields,
    evidence_text=evidence_text,
    source_url=source_url,
    source_type="poom_product_text",
    confidence=0.66,
  )
  made_in_country, made_raw = _extract_made_in_country(page_text)

  if made_in_country:
    fields["madeInCountry"] = _field_payload(
      made_in_country,
      0.7,
      made_raw,
      source_url,
      source_type="poom_product_text",
    )

  return fields, title


def _parse_11st(row: dict[str, Any], page_text: str, source_url: str) -> tuple[dict[str, Any], str]:
  product_match = re.search(r'"product_name"\s*:\s*"([^"]+)"', page_text)
  category_match = re.search(r'"small_category_no"\s*:\s*"([^"]+)"', page_text)
  title = _squash(product_match.group(1)) if product_match else str(row.get("productName") or "")
  evidence_text = _squash(" ".join([title, category_match.group(1) if category_match else ""]))
  fields: dict[str, Any] = {}
  _attach_text_fields(
    fields,
    evidence_text=evidence_text,
    source_url=source_url,
    source_type="elevenst_product_text",
    confidence=0.64,
  )
  made_in_country, made_raw = _extract_made_in_country(page_text)

  if made_in_country:
    fields["madeInCountry"] = _field_payload(
      made_in_country,
      0.7,
      made_raw,
      source_url,
      source_type="elevenst_product_text",
    )

  return fields, title


def _parse_page(row: dict[str, Any], page_text: str, source_url: str) -> tuple[dict[str, Any], str]:
  domain = _domain(source_url)

  if domain == "hi.thehyundai.com":
    return _parse_hyundai(row, page_text, source_url)

  if domain == "www.shinsegaetvshopping.com":
    return _parse_shinsegae(row, page_text, source_url)

  if domain in {"www.musinsa.com", "link.musinsa.com"}:
    return _parse_musinsa(row, page_text, source_url)

  if domain == "www.poom.co.kr":
    return _parse_poom(row, page_text, source_url)

  if domain == "www.11st.co.kr":
    return _parse_11st(row, page_text, source_url)

  return {}, ""


def collect_open_retail_metadata(
  *,
  limited_results_path: Path,
  output_path: Path,
  report_path: Path,
  max_rows: int,
  timeout_seconds: float,
  delay_seconds: float,
  user_agent: str,
  fetched_at: str,
  merge_existing: bool,
  skip_existing_with_fields: bool,
) -> dict[str, Any]:
  rows = _read_jsonl(limited_results_path)
  existing_with_fields: set[str] = set()

  if skip_existing_with_fields and output_path.exists():
    existing_with_fields = {
      str(row.get("candidateId") or "")
      for row in _read_jsonl(output_path)
      if isinstance(row.get("fields"), dict) and row.get("fields")
    }

  candidates = []

  for row in rows:
    candidate_id = str(row.get("candidateId") or "")

    if candidate_id in existing_with_fields:
      continue

    source_url = _source_url(row)

    if _domain(source_url) in SUPPORTED_DOMAINS:
      candidates.append(row)

  candidates = candidates[:max_rows] if max_rows > 0 else candidates
  outputs: list[dict[str, Any]] = []
  fetch_counts: Counter[str] = Counter()
  last_fetch_at = 0.0

  for row in candidates:
    source_url = _source_url(row)
    elapsed = time.monotonic() - last_fetch_at

    if elapsed < delay_seconds:
      time.sleep(delay_seconds - elapsed)

    page_text, fetch_summary = _fetch_text(
      source_url,
      timeout_seconds=timeout_seconds,
      user_agent=user_agent,
    )
    last_fetch_at = time.monotonic()
    http_status = fetch_summary.get("httpStatus")
    fetch_counts[str(http_status or fetch_summary.get("error") or "unknown")] += 1

    if not page_text:
      outputs.append(
        {
          "brand": row.get("brand"),
          "candidateId": row.get("candidateId"),
          "category": row.get("category"),
          "collectionStatus": "blocked",
          "collectorVersion": COLLECTOR_VERSION,
          "fetchSummary": fetch_summary,
          "fields": {},
          "fetchedAt": fetched_at,
          "productName": row.get("productName"),
          "rawStored": False,
          "retailSourceUrl": source_url,
        },
      )
      continue

    fields, retail_product_name = _parse_page(row, page_text, source_url)
    outputs.append(
      {
        "brand": row.get("brand"),
        "candidateId": row.get("candidateId"),
        "category": row.get("category"),
        "collectionStatus": "collected_partial" if fields else "not_found",
        "collectorVersion": COLLECTOR_VERSION,
        "fetchSummary": fetch_summary,
        "fields": fields,
        "fetchedAt": fetched_at,
        "productName": row.get("productName"),
        "rawStored": False,
        "retailProductName": retail_product_name,
        "retailSourceUrl": source_url,
      },
    )

  if merge_existing and output_path.exists():
    refreshed_ids = {str(row.get("candidateId") or "") for row in outputs}
    preserved = [
      row
      for row in _read_jsonl(output_path)
      if str(row.get("candidateId") or "") not in refreshed_ids
    ]
    outputs = preserved + outputs

  outputs = sorted(
    outputs,
    key=lambda row: (str(row.get("brand") or ""), str(row.get("category") or ""), str(row.get("productName") or "")),
  )
  _write_jsonl(output_path, outputs)
  _write_report(report_path, output_path, outputs, candidates, fetch_counts)

  return {
    "candidateRows": len(candidates),
    "output": str(output_path.relative_to(REPO_ROOT)),
    "report": str(report_path.relative_to(REPO_ROOT)),
    "rows": len(outputs),
    "withFields": sum(1 for row in outputs if row.get("fields")),
  }


def _write_report(
  report_path: Path,
  output_path: Path,
  rows: list[dict[str, Any]],
  candidates: list[dict[str, Any]],
  fetch_counts: Counter[str],
) -> None:
  report_path.parent.mkdir(parents=True, exist_ok=True)
  status_counts = Counter(str(row.get("collectionStatus")) for row in rows)
  field_counts = Counter(field for row in rows for field in (row.get("fields") or {}))
  domain_counts = Counter(_domain(str(row.get("retailSourceUrl") or "")) for row in rows)
  lines = [
    "# Auradin Open Retail Metadata Collection",
    "",
    f"- Output: `{output_path}`",
    f"- Candidate rows attempted this run: {len(candidates)}",
    f"- Rows: {len(rows)}",
    f"- Rows with fields: {sum(1 for row in rows if row.get('fields'))}",
    f"- Collection status: `{json.dumps(dict(sorted(status_counts.items())), ensure_ascii=False)}`",
    f"- Fetch status: `{json.dumps(dict(sorted(fetch_counts.items())), ensure_ascii=False)}`",
    f"- Field counts: `{json.dumps(dict(sorted(field_counts.items())), ensure_ascii=False)}`",
    "",
    "## Domain Rows",
    "",
    "| Domain | Rows |",
    "|---|---:|",
  ]

  for domain, count in sorted(domain_counts.items()):
    lines.append(f"| {domain} | {count} |")

  lines.extend(
    [
      "",
      "## Notes",
      "",
      "- Sources are public product pages reached from existing Naver live-offer URLs.",
      "- The adapter covers TheHyundai, Shinsegae TV Shopping, Musinsa, POOM, and 11st when public metadata is directly available.",
      "- Only structured fields and short evidence snippets are retained; raw HTML, reviews, ingredients, and images are not stored.",
      "- Lotteimall direct detail pages returned 403 in smoke and are intentionally not included here.",
    ],
  )
  report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Collect limited Auradin metadata from small public retail sources.")
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument("--limited-results", type=Path)
  parser.add_argument("--output", type=Path)
  parser.add_argument("--report", type=Path)
  parser.add_argument("--max-rows", type=int, default=80)
  parser.add_argument("--timeout-seconds", type=float, default=25.0)
  parser.add_argument("--delay-seconds", type=float, default=0.8)
  parser.add_argument(
    "--user-agent",
    default="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  )
  parser.add_argument("--merge-existing", action="store_true")
  parser.add_argument("--skip-existing-with-fields", action="store_true")
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  limited_results_path = args.limited_results or REPO_ROOT / "data" / "auradin" / "detail" / "normalized" / f"limited_detail_results_{args.date}.jsonl"
  output_path = args.output or REPO_ROOT / "data" / "auradin" / "detail" / "retail" / f"open_retail_metadata_{args.date}.jsonl"
  report_path = args.report or REPO_ROOT / "reports" / "auradin" / f"open_retail_metadata_collection_{args.date}.md"
  result = collect_open_retail_metadata(
    limited_results_path=limited_results_path,
    output_path=output_path,
    report_path=report_path,
    max_rows=args.max_rows,
    timeout_seconds=args.timeout_seconds,
    delay_seconds=args.delay_seconds,
    user_agent=args.user_agent,
    fetched_at=_default_fetched_at(args.date),
    merge_existing=args.merge_existing,
    skip_existing_with_fields=args.skip_existing_with_fields,
  )
  print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
