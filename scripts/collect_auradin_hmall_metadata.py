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
  TEXTURE_RULES,
  _aggregate_from_options,
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


COLLECTOR_VERSION = "auradin-hmall-metadata-v1"


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


def _brand_aliases(row: dict[str, Any]) -> tuple[str, ...]:
  brand = str(row.get("brand") or "")
  aliases = {brand, brand.lower()}

  if brand == "3CE":
    aliases.update({"3ce", "stylenanda"})

  return tuple(alias for alias in aliases if alias)


def _extract_next_data(page_text: str) -> dict[str, Any]:
  match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', page_text, flags=re.S)

  if not match:
    return {}

  try:
    payload = json.loads(html.unescape(match.group(1)))
  except json.JSONDecodeError:
    return {}

  return payload if isinstance(payload, dict) else {}


def _extract_hmall_options(next_data: dict[str, Any]) -> list[str]:
  item = (
    ((next_data.get("props") or {}).get("pageProps") or {})
    .get("respData", {})
    .get("itemPtc", {})
  )

  if not isinstance(item, dict):
    return []

  names: list[str] = []
  seen: set[str] = set()

  for stock in item.get("stockList") or []:
    if not isinstance(stock, dict):
      continue

    for key in ("uitmAttrNm", "uitmTotNm"):
      value = _squash(stock.get(key))

      if value and value not in seen:
        seen.add(value)
        names.append(value)
        break

  return names


def _extract_title(next_data: dict[str, Any], fallback: str) -> str:
  item = (
    ((next_data.get("props") or {}).get("pageProps") or {})
    .get("respData", {})
    .get("itemPtc", {})
  )

  if isinstance(item, dict) and item.get("slitmNm"):
    return _squash(item.get("slitmNm"))

  return fallback


def _extract_hmall_shades(
  *,
  next_data: dict[str, Any],
  product_name: str,
  brand_aliases: tuple[str, ...],
) -> list[dict[str, Any]]:
  product_tokens = _tokens(product_name, brand_aliases)
  options: list[dict[str, Any]] = []

  for option_name in _extract_hmall_options(next_data):
    if not _plausible_structured_option(option_name, product_tokens, brand_aliases):
      continue

    options.append(
      _shade_payload_from_name(
        option_name,
        source_type="hmall_next_stock_option",
        confidence=0.82,
      ),
    )

  return _merge_shade_options(options)


def _parse_hmall_page(
  row: dict[str, Any],
  *,
  page_text: str,
  source_url: str,
  fetched_at: str,
) -> dict[str, Any]:
  next_data = _extract_next_data(page_text)
  title = _extract_title(next_data, str(row.get("productName") or ""))
  shade_options = _extract_hmall_shades(
    next_data=next_data,
    product_name=f"{title} {row.get('productName') or ''}",
    brand_aliases=_brand_aliases(row),
  )
  evidence_text = _squash(" ".join([title, ", ".join(str(option.get("optionName") or "") for option in shade_options[:12])]))
  fields: dict[str, Any] = {}

  if shade_options:
    fields["shadeOptions"] = _field_payload(
      shade_options,
      0.82,
      ", ".join(str(option.get("optionName") or "") for option in shade_options[:16]),
      source_url,
      source_type="hmall_next_stock_option",
    )
    color_family, color_confidence = _aggregate_from_options(shade_options, "colorFamily")

    if color_family:
      fields["colorFamily"] = _field_payload(
        color_family,
        color_confidence,
        ", ".join(str(option.get("optionName") or "") for option in shade_options[:16]),
        source_url,
        source_type="hmall_next_stock_option",
      )

    undertone, undertone_confidence = _aggregate_from_options(shade_options, "undertone")

    if undertone:
      fields["undertone"] = _field_payload(
        undertone,
        undertone_confidence,
        ", ".join(str(option.get("optionName") or "") for option in shade_options[:16]),
        source_url,
        source_type="hmall_next_stock_option",
      )

  for field, rules, confidence in (
    ("finish", FINISH_RULES, 0.64),
    ("texture", TEXTURE_RULES, 0.64),
    ("intensity", INTENSITY_RULES, 0.58),
  ):
    value = _infer_by_rules(evidence_text, rules)

    if value:
      fields[field] = _field_payload(
        value,
        confidence,
        evidence_text,
        source_url,
        source_type="hmall_product_text",
      )

  selling_points = _collect_tags(evidence_text, SELLING_POINT_RULES)

  if selling_points:
    fields["sellingPoints"] = _field_payload(
      selling_points,
      0.64,
      evidence_text,
      source_url,
      source_type="hmall_product_text",
    )

  return {
    "brand": row.get("brand"),
    "candidateId": row.get("candidateId"),
    "category": row.get("category"),
    "collectionStatus": "collected_partial" if fields else "not_found",
    "collectorVersion": COLLECTOR_VERSION,
    "fetchedAt": fetched_at,
    "fields": fields,
    "hmallProductName": title,
    "productName": row.get("productName"),
    "rawStored": False,
    "retailSourceUrl": source_url,
  }


def collect_hmall_metadata(
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

  candidates: list[dict[str, Any]] = []

  for row in rows:
    candidate_id = str(row.get("candidateId") or "")

    if candidate_id in existing_with_fields:
      continue

    fields = row.get("fields") if isinstance(row.get("fields"), dict) else {}
    source_url = str((fields.get("purchaseUrl") or {}).get("value") or "")

    if _domain(source_url) == "www.hmall.com":
      candidates.append(row)

  candidates = candidates[:max_rows] if max_rows > 0 else candidates
  outputs: list[dict[str, Any]] = []
  fetch_counts: Counter[str] = Counter()
  last_fetch_at = 0.0

  for row in candidates:
    fields = row.get("fields") if isinstance(row.get("fields"), dict) else {}
    source_url = str((fields.get("purchaseUrl") or {}).get("value") or "")
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

    parsed = _parse_hmall_page(
      row,
      page_text=page_text,
      source_url=source_url,
      fetched_at=fetched_at,
    )
    parsed["fetchSummary"] = fetch_summary
    outputs.append(parsed)

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
  brand_counts = Counter(str(row.get("brand") or "") for row in rows)
  lines = [
    "# Auradin Hmall Metadata Collection",
    "",
    f"- Output: `{output_path}`",
    f"- Candidate rows attempted this run: {len(candidates)}",
    f"- Rows: {len(rows)}",
    f"- Rows with fields: {sum(1 for row in rows if row.get('fields'))}",
    f"- Collection status: `{json.dumps(dict(sorted(status_counts.items())), ensure_ascii=False)}`",
    f"- Fetch status: `{json.dumps(dict(sorted(fetch_counts.items())), ensure_ascii=False)}`",
    f"- Field counts: `{json.dumps(dict(sorted(field_counts.items())), ensure_ascii=False)}`",
    "",
    "## Brand Rows",
    "",
    "| Brand | Rows |",
    "|---|---:|",
  ]

  for brand, count in sorted(brand_counts.items()):
    lines.append(f"| {brand} | {count} |")

  lines.extend(
    [
      "",
      "## Notes",
      "",
      "- Source is public Hmall Next.js product data from existing Naver live-offer URLs.",
      "- Only stock option names and short product-title evidence are retained.",
      "- Review text, ingredient text, raw HTML, and images are not stored.",
    ],
  )
  report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Collect limited Auradin metadata from public Hmall product pages.")
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
  output_path = args.output or REPO_ROOT / "data" / "auradin" / "detail" / "retail" / f"hmall_metadata_{args.date}.jsonl"
  report_path = args.report or REPO_ROOT / "reports" / "auradin" / f"hmall_metadata_collection_{args.date}.md"
  result = collect_hmall_metadata(
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
