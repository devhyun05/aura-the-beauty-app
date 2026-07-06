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
  SUITABLE_FOR_RULES,
  _aggregate_from_options,
  _collect_tags,
  _clean_option_name,
  _fetch_text,
  _field_payload,
  _infer_by_rules,
  _merge_shade_options,
  _shade_payload_from_name,
  _short,
  _squash,
)


COLLECTOR_VERSION = "auradin-lotteon-metadata-v2"
LOTTEON_API_SOURCE_TYPE = "lotteon_product_api"
LOTTEON_OPTION_SOURCE_TYPE = "lotteon_product_api_option"
LOTTEON_TITLE_SOURCE_TYPE = "lotteon_product_api_title"
ALLOWED_PROPERTY_NAMES = {
  "제형",
  "종류",
  "특징",
  "연출효과",
  "제품 주요 사양",
  "제조국",
}
ALLOWED_ARTICLE_NAMES = {
  "제품 주요 사양",
  "제조국",
}
OPTION_CONTEXT_MARKERS = ("색상", "컬러", "color")
OPTION_REJECT_MARKERS = (
  "단일상품",
  "단일 상품",
  "본품",
  "리필",
  "세트",
  "기획",
  "증정",
  "사은품",
  "추가구매",
  "단일",
  "브러쉬",
  "브러시",
  "퍼프",
  "케이스",
  "공용기",
  "파우치",
  "선택",
  "옵션",
)
TITLE_OPTION_REJECT_PATTERNS = (
  r"\b\d+\s*colors?\b",
  r"\d+\s*컬러",
  r"\d+\s*종",
  r"종\s*택\s*1",
  r"택\s*1",
  r"단품\s*/\s*기획",
  r"기획\s*/\s*단품",
)
TITLE_PRODUCT_MARKERS = (
  "블러셔",
  "블러쉬",
  "틴트",
  "립",
  "치크",
  "팔레트",
  "아이섀도우",
  "아이섀도",
  "섀도우",
  "메이커",
)
SUITABLE_EXTRA_MARKERS = {
  "all_skin": ("모든피부", "모든 피부", "all skin"),
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


def _extract_lotteon_product_id(source_url: str) -> str:
  parsed = urllib.parse.urlparse(source_url)
  match = re.search(r"/p/product/([^/?#]+)", parsed.path)

  if match:
    return urllib.parse.unquote(match.group(1))

  query = urllib.parse.parse_qs(parsed.query)
  sitm_no = (query.get("sitmNo") or [""])[0]
  return sitm_no.split("_")[0]


def _api_url(product_id: str) -> str:
  return f"https://pbf.lotteon.com/product/v2/detail/search/base/pd/{product_id}"


def _json_payload(text: str) -> dict[str, Any]:
  try:
    payload = json.loads(text)
  except json.JSONDecodeError:
    return {}

  return payload if isinstance(payload, dict) else {}


def _api_data(payload: dict[str, Any]) -> dict[str, Any]:
  data = payload.get("data")
  return data if isinstance(data, dict) else {}


def _extract_jsonld_products(page_text: str) -> list[dict[str, Any]]:
  products: list[dict[str, Any]] = []

  for match in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', page_text, flags=re.I | re.S):
    raw_json = html.unescape(match.group(1))

    try:
      payload = json.loads(raw_json)
    except json.JSONDecodeError:
      continue

    nodes = payload if isinstance(payload, list) else [payload]

    for node in nodes:
      if isinstance(node, dict) and node.get("@type") == "Product":
        products.append(node)

  return products


def _allowed_properties(product: dict[str, Any]) -> dict[str, str]:
  properties: dict[str, str] = {}

  for item in product.get("additionalProperty") or []:
    if not isinstance(item, dict):
      continue

    name = _squash(item.get("name"))
    value = _squash(item.get("value"))

    if name in ALLOWED_PROPERTY_NAMES and value:
      properties[name] = value

  return properties


def _normalize_country(value: str) -> str:
  normalized = _squash(value).split("/")[0].split(",")[0]
  lowered = normalized.lower()

  if not normalized or any(marker in lowered for marker in ("상세", "별도", "참조", "표기", "상품상세")):
    return ""

  return COUNTRY_MAP.get(lowered) or COUNTRY_MAP.get(normalized) or normalized


def _plausible_lotteon_option(
  label: str,
  *,
  product_name: str,
  title: str,
  allow_in_product_name: bool = False,
) -> bool:
  cleaned = _clean_option_name(label)
  lowered = cleaned.lower()
  product_compact = re.sub(r"\s+", "", product_name.lower())
  option_compact = re.sub(r"\s+", "", lowered)

  if not cleaned or len(cleaned) > 48:
    return False

  if not allow_in_product_name and option_compact and option_compact in product_compact:
    return False

  if any(marker.lower() in lowered for marker in OPTION_REJECT_MARKERS):
    return False

  if re.search(r"\b\d+(?:\.\d+)?\s*(?:g|ml|개|종|set|ea)\b", lowered, flags=re.I):
    return False

  if re.fullmatch(r"[-_#\d\s]+", cleaned):
    return False

  has_color_context = any(marker.lower() in title.lower() for marker in OPTION_CONTEXT_MARKERS)
  return has_color_context and bool(re.search(r"[가-힣A-Za-z]", cleaned))


def _extract_api_shade_options(data: dict[str, Any], *, product_name: str) -> list[dict[str, Any]]:
  option_info = data.get("optionInfo")

  if not isinstance(option_info, dict):
    return []

  options: list[dict[str, Any]] = []

  for option_group in option_info.get("optionList") or []:
    if not isinstance(option_group, dict):
      continue

    title = _squash(option_group.get("title") or option_group.get("name"))

    for option in option_group.get("options") or []:
      if not isinstance(option, dict):
        continue

      label = _squash(option.get("label"))

      if not _plausible_lotteon_option(label, product_name=product_name, title=title):
        continue

      options.append(
        _shade_payload_from_name(
          _clean_option_name(label),
          source_type=LOTTEON_OPTION_SOURCE_TYPE,
          confidence=0.84,
        ),
      )

  return _merge_shade_options(options)


def _reject_title_shade_source(text: str) -> bool:
  lowered = text.lower()
  return any(re.search(pattern, lowered, flags=re.I) for pattern in TITLE_OPTION_REJECT_PATTERNS)


def _clean_title_tail(raw: str) -> str:
  text = _squash(raw)
  text = re.sub(r"\b(?:BNS|MNS)\b", " ", text, flags=re.I)
  text = re.sub(r"\b[Xx]\s*\d+\s*개?\b", " ", text)
  text = re.sub(r"\b\d+\s*개\b", " ", text)
  text = re.sub(r"\b\d{6,}\b", " ", text)
  return _squash(text)


def _strip_product_marker_prefix(raw: str) -> str:
  text = _squash(raw)

  for marker in TITLE_PRODUCT_MARKERS:
    if marker in text:
      text = _squash(text.split(marker)[-1])

  return text


def _title_shade_candidates(text: str) -> list[str]:
  if not text or _reject_title_shade_source(text):
    return []

  cleaned = _clean_title_tail(text)
  candidates: list[str] = []
  patterns = (
    r"(?:색상|컬러)\s+([가-힣A-Za-z][가-힣A-Za-z\s]{1,24})$",
    r"([A-Z]{1,3}\d{1,3}|#?\d{1,3})\s*([가-힣A-Za-z][가-힣A-Za-z\s]{1,24})$",
    r"([가-힣A-Za-z][가-힣A-Za-z\s]{1,24})\s+(\d{1,3})호$",
    r"([가-힣A-Za-z][가-힣A-Za-z\s]{1,24})\s+([A-Z]\d{1,3})$",
    r"\b([A-Z]{3,}(?:\s+[가-힣A-Za-z]{2,})?)$",
  )

  for pattern in patterns:
    match = re.search(pattern, cleaned, flags=re.I)

    if not match:
      continue

    if len(match.groups()) == 2:
      first, second = (_squash(part) for part in match.groups())

      if re.fullmatch(r"\d{1,3}", second):
        raw = f"{second} {_strip_product_marker_prefix(first)}"
      elif re.fullmatch(r"[A-Z]\d{1,3}", second, flags=re.I):
        raw = f"{second.upper()} {_strip_product_marker_prefix(first)}"
      else:
        raw = f"{first} {second}"
    else:
      raw = _squash(match.group(1))

    if raw and not any(marker.lower() in raw.lower() for marker in OPTION_REJECT_MARKERS):
      candidates.append(raw)

  return candidates[:2]


def _extract_api_title_shade_options(data: dict[str, Any], *, product_name: str) -> list[dict[str, Any]]:
  basic_info = data.get("basicInfo") if isinstance(data.get("basicInfo"), dict) else {}
  raw_candidates: list[str] = []
  product_names = {
    _squash(basic_info.get("pdNm")),
    _squash(basic_info.get("spdNm")),
    _squash(product_name),
  }

  for item_key in ("itmNm", "sitmNm"):
    item_name = _squash(basic_info.get(item_key))

    if item_name and item_name not in product_names and _plausible_lotteon_option(
      item_name,
      product_name=product_name,
      title="색상",
      allow_in_product_name=True,
    ):
      raw_candidates.append(item_name)

  for title_key in ("pdNm", "spdNm"):
    raw_candidates.extend(_title_shade_candidates(_squash(basic_info.get(title_key))))

  options = [
    _shade_payload_from_name(
      _clean_option_name(raw),
      source_type=LOTTEON_TITLE_SOURCE_TYPE,
      confidence=0.72,
    )
    for raw in raw_candidates
    if _clean_option_name(raw)
  ]
  return _merge_shade_options(options)


def _api_attributes(data: dict[str, Any]) -> dict[str, str]:
  attributes: dict[str, str] = {}
  attr_info = data.get("attrInfo")

  if isinstance(attr_info, dict):
    for item in attr_info.get("attrList") or []:
      if not isinstance(item, dict):
        continue

      name = _squash(item.get("attrDispNm"))
      value = _squash(item.get("attrValDispNm"))

      if name and value:
        attributes[name] = value

  artl_info = data.get("artlInfo")

  if isinstance(artl_info, dict):
    for item in artl_info.get("pdItmsArtlJsn") or []:
      if not isinstance(item, dict):
        continue

      name = _squash(item.get("pdArtlCdNm"))
      value = _squash(item.get("pdArtlCnts"))

      if name in ALLOWED_ARTICLE_NAMES and value:
        attributes[name] = value

  return attributes


def _parse_lotteon_api(
  row: dict[str, Any],
  *,
  payload: dict[str, Any],
  source_url: str,
  api_source_url: str,
  fetched_at: str,
) -> dict[str, Any]:
  data = _api_data(payload)
  basic_info = data.get("basicInfo") if isinstance(data.get("basicInfo"), dict) else {}
  title = _squash(basic_info.get("pdNm") or basic_info.get("spdNm") or row.get("productName") or "")
  category = _squash(
    " ".join(
      part
      for part in [
        basic_info.get("stdCatLevel1Nm"),
        basic_info.get("stdCatLevel2Nm"),
        basic_info.get("stdCatLevel3Nm"),
        basic_info.get("stdCatLevel4Nm"),
      ]
      if part
    ),
  )
  attributes = _api_attributes(data)
  evidence_text = _squash(
    "; ".join(
      part
      for part in [
        title,
        category,
        *(f"{name} {value}" for name, value in attributes.items()),
      ]
      if part
    ),
  )
  fields: dict[str, Any] = {}
  shade_options = _extract_api_shade_options(data, product_name=f"{title} {row.get('productName') or ''}")
  shade_source_type = LOTTEON_OPTION_SOURCE_TYPE
  shade_confidence = 0.84

  if not shade_options:
    shade_options = _extract_api_title_shade_options(data, product_name=f"{title} {row.get('productName') or ''}")
    shade_source_type = LOTTEON_TITLE_SOURCE_TYPE
    shade_confidence = 0.72

  if shade_options:
    raw_options = ", ".join(str(option.get("optionName") or "") for option in shade_options[:24])
    fields["shadeOptions"] = _field_payload(
      shade_options,
      shade_confidence,
      raw_options,
      api_source_url,
      source_type=shade_source_type,
    )
    color_family, color_confidence = _aggregate_from_options(shade_options, "colorFamily")

    if color_family:
      fields["colorFamily"] = _field_payload(
        color_family,
        color_confidence,
        raw_options,
        api_source_url,
        source_type=shade_source_type,
      )

    undertone, undertone_confidence = _aggregate_from_options(shade_options, "undertone")

    if undertone:
      fields["undertone"] = _field_payload(
        undertone,
        undertone_confidence,
        raw_options,
        api_source_url,
        source_type=shade_source_type,
      )

  made_in_country = (
    attributes.get("제조국")
    or _squash(basic_info.get("oplcCdNm"))
    or _squash(", ".join(basic_info.get("oplcCdNmList") or []))
  )

  if made_in_country:
    normalized_country = _normalize_country(made_in_country)

  if made_in_country and normalized_country:
    fields["madeInCountry"] = _field_payload(
      normalized_country,
      0.78,
      f"제조국 {made_in_country}",
      api_source_url,
      source_type=LOTTEON_API_SOURCE_TYPE,
    )

  for field, rules, confidence, preferred_text in (
    ("texture", TEXTURE_RULES, 0.76, attributes.get("제형") or evidence_text),
    ("finish", FINISH_RULES, 0.76, attributes.get("연출효과") or evidence_text),
    ("intensity", INTENSITY_RULES, 0.6, evidence_text),
  ):
    value = _infer_by_rules(preferred_text, rules)

    if value:
      fields[field] = _field_payload(
        value,
        confidence,
        preferred_text,
        api_source_url,
        source_type=LOTTEON_API_SOURCE_TYPE,
      )

  suitable_for = _collect_tags(evidence_text, SUITABLE_FOR_RULES)
  suitable_for.extend(tag for tag in _collect_tags(evidence_text, SUITABLE_EXTRA_MARKERS) if tag not in suitable_for)

  if suitable_for:
    fields["suitableFor"] = _field_payload(
      suitable_for,
      0.68,
      evidence_text,
      api_source_url,
      source_type=LOTTEON_API_SOURCE_TYPE,
    )

  selling_points = _collect_tags(evidence_text, SELLING_POINT_RULES)

  if selling_points:
    fields["sellingPoints"] = _field_payload(
      selling_points,
      0.7,
      evidence_text,
      api_source_url,
      source_type=LOTTEON_API_SOURCE_TYPE,
    )

  return {
    "brand": row.get("brand"),
    "candidateId": row.get("candidateId"),
    "category": row.get("category"),
    "collectionStatus": "collected_partial" if fields else "not_found",
    "collectorVersion": COLLECTOR_VERSION,
    "fetchedAt": fetched_at,
    "fields": fields,
    "lotteOnApiSourceUrl": api_source_url,
    "lotteOnProductName": title,
    "lotteOnSourceUrl": source_url,
    "productName": row.get("productName"),
    "rawStored": False,
  }


def _parse_lotteon_page(
  row: dict[str, Any],
  *,
  page_text: str,
  source_url: str,
  fetched_at: str,
) -> dict[str, Any]:
  products = _extract_jsonld_products(page_text)
  product = products[0] if products else {}
  properties = _allowed_properties(product)
  title = _squash(product.get("name") or row.get("productName") or "")
  category = _squash(product.get("category") or "")
  evidence_text = _squash(
    "; ".join(
      part
      for part in [
        title,
        category,
        *(f"{name} {value}" for name, value in properties.items()),
      ]
      if part
    ),
  )
  fields: dict[str, Any] = {}

  made_in_country = properties.get("제조국")

  if made_in_country:
    normalized_country = _normalize_country(made_in_country)

  if made_in_country and normalized_country:
    fields["madeInCountry"] = _field_payload(
      normalized_country,
      0.72,
      f"제조국 {made_in_country}",
      source_url,
      source_type="lotteon_jsonld_product_property",
    )

  for field, rules, confidence in (
    ("texture", TEXTURE_RULES, 0.72),
    ("finish", FINISH_RULES, 0.68),
    ("intensity", INTENSITY_RULES, 0.6),
  ):
    value = _infer_by_rules(evidence_text, rules)

    if value:
      fields[field] = _field_payload(
        value,
        confidence,
        evidence_text,
        source_url,
        source_type="lotteon_jsonld_product_property",
      )

  selling_points = _collect_tags(evidence_text, SELLING_POINT_RULES)

  if selling_points:
    fields["sellingPoints"] = _field_payload(
      selling_points,
      0.68,
      evidence_text,
      source_url,
      source_type="lotteon_jsonld_product_property",
    )

  return {
    "brand": row.get("brand"),
    "candidateId": row.get("candidateId"),
    "category": row.get("category"),
    "collectionStatus": "collected_partial" if fields else "not_found",
    "collectorVersion": COLLECTOR_VERSION,
    "fetchedAt": fetched_at,
    "fields": fields,
    "lotteOnProductName": title,
    "lotteOnSourceUrl": source_url,
    "productName": row.get("productName"),
    "rawStored": False,
  }


def collect_lotteon_metadata(
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

    if _domain(source_url) == "www.lotteon.com":
      candidates.append(row)

  candidates = candidates[:max_rows] if max_rows > 0 else candidates
  outputs: list[dict[str, Any]] = []
  fetch_counts: Counter[str] = Counter()
  api_cache: dict[str, tuple[str, dict[str, Any]]] = {}
  last_fetch_at = 0.0

  for row in candidates:
    fields = row.get("fields") if isinstance(row.get("fields"), dict) else {}
    source_url = str((fields.get("purchaseUrl") or {}).get("value") or "")
    product_id = _extract_lotteon_product_id(source_url)
    api_source_url = _api_url(product_id) if product_id else ""
    elapsed = time.monotonic() - last_fetch_at

    if elapsed < delay_seconds:
      time.sleep(delay_seconds - elapsed)

    if api_source_url in api_cache:
      api_text, fetch_summary = api_cache[api_source_url]
    else:
      api_text, fetch_summary = _fetch_text(
        api_source_url or source_url,
        timeout_seconds=timeout_seconds,
        user_agent=user_agent,
      )
      api_cache[api_source_url] = (api_text, fetch_summary)

    last_fetch_at = time.monotonic()
    http_status = fetch_summary.get("httpStatus")
    fetch_counts[str(http_status or fetch_summary.get("error") or "unknown")] += 1

    api_payload = _json_payload(api_text)

    if api_payload.get("returnCode") == "200":
      parsed = _parse_lotteon_api(
        row,
        payload=api_payload,
        source_url=source_url,
        api_source_url=api_source_url,
        fetched_at=fetched_at,
      )
      parsed["fetchSummary"] = fetch_summary
      outputs.append(parsed)
      continue

    page_text = ""

    if source_url:
      page_text, fetch_summary = _fetch_text(
        source_url,
        timeout_seconds=timeout_seconds,
        user_agent=user_agent,
      )
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
          "lotteOnApiSourceUrl": api_source_url,
          "lotteOnSourceUrl": source_url,
          "productName": row.get("productName"),
          "rawStored": False,
        },
      )
      continue

    parsed = _parse_lotteon_page(
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
    "# Auradin LotteON Metadata Collection",
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
      "- Source is public LotteON product base-detail JSON and JSON-LD fallback from existing Naver live-offer URLs.",
      "- Only allowed product properties are retained: option labels, explicit single-shade title tails, form/type/effect/feature/spec/manufacturing country.",
      "- Review summaries in LotteON payloads are ignored and not stored.",
      "- Ingredient text, review text, raw HTML, and images are not stored.",
    ],
  )
  report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Collect limited Auradin metadata from public LotteON product JSON-LD.")
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument("--limited-results", type=Path)
  parser.add_argument("--output", type=Path)
  parser.add_argument("--report", type=Path)
  parser.add_argument("--max-rows", type=int, default=80)
  parser.add_argument("--timeout-seconds", type=float, default=20.0)
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
  output_path = args.output or REPO_ROOT / "data" / "auradin" / "detail" / "retail" / f"lotteon_metadata_{args.date}.jsonl"
  report_path = args.report or REPO_ROOT / "reports" / "auradin" / f"lotteon_metadata_collection_{args.date}.md"
  result = collect_lotteon_metadata(
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
