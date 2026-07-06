from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
NAVER_SHOPPING_API_URL = "https://openapi.naver.com/v1/search/shop.json"
COLLECTOR_VERSION = "auradin-naver-offer-metadata-v1"
UTC = timezone.utc
TEXT_SNIPPET_LIMIT = 220

OLIVEYOUNG_MARKERS = ("올리브영", "oliveyoung")
DEPARTMENT_MARKERS = (
  "신세계백화점",
  "신세계",
  "현대백화점",
  "더현대",
  "롯데백화점",
  "갤러리아",
  "ak플라자",
  "ak plaza",
)
DEPARTMENT_DOMAIN_MARKERS = (
  "department.ssg.com",
  "hi.thehyundai.com",
  "hmall.com",
  "lotteimall.com",
  "shinsegae",
)
TOKEN_STOPWORDS = {
  "1개",
  "2개",
  "3개",
  "best",
  "gift",
  "new",
  "공식",
  "기획",
  "단독",
  "단품",
  "랜덤",
  "리필",
  "본품",
  "사은",
  "세트",
  "상품",
  "선물",
  "어때요",
  "이런",
  "증정",
  "택1",
}
FINISH_RULES = {
  "matte": ("매트", "보송", "무광", "matte"),
  "velvet": ("벨벳", "velvet", "블러", "blur"),
  "satin": ("새틴", "satin", "세미매트", "semi-matte"),
  "sheer": ("쉬어", "투명", "맑은", "sheer"),
  "shimmer": ("쉬머", "펄", "글리터", "shimmer", "glitter"),
  "glossy": ("글로우", "광택", "광채", "글로스", "glossy", "gloss", "dewy", "듀이", "물먹"),
}
TEXTURE_RULES = {
  "tint": ("틴트", "tint"),
  "balm": ("밤", "balm"),
  "lipstick": ("립스틱", "lipstick"),
  "gloss": ("글로스", "gloss"),
  "cream": ("크림", "cream", "컨실러", "concealer", "프라이머", "primer", "파운데이션", "foundation", "선 베이스", "선베이스"),
  "powder": ("파우더", "powder", "팔레트", "섀도우", "팩트", "블러셔", "블러쉬", "치크", "blush", "cheek", "쉐이더", "셰이더", "shader"),
  "pencil": ("펜슬", "pencil"),
  "liquid": ("리퀴드", "liquid"),
  "cushion": ("쿠션", "cushion"),
  "mascara": ("마스카라", "mascara", "브로우 카라", "brow cara", "brow mascara"),
  "liner": ("라이너", "liner", "아이라이너"),
}
SELLING_POINT_RULES = {
  "long_lasting": ("지속", "롱래스팅", "래스팅", "롱웨어", "픽싱", "고정", "long lasting", "lasting", "fixing", "fix"),
  "moisturizing": ("보습", "촉촉", "수분", "moistur", "hydrating"),
  "adhesion": ("밀착", "착붙", "adhesion", "fit"),
  "glow": ("광택", "광채", "글로우", "윤광", "glow", "dewy", "glass"),
  "blur": ("블러", "blur"),
  "waterproof": ("워터프루프", "파워프루프", "수퍼프루프", "슈퍼프루프", "프루프", "방수", "waterproof", "proof"),
  "smudge_proof": ("번짐", "스머지", "smudge"),
  "lightweight": ("가벼", "라이트", "lightweight"),
  "high_pigment": ("고발색", "선명", "vivid", "pigment"),
}
COLOR_RULES = {
  "pink": ("핑크", "pink", "피오니", "페탈", "petal"),
  "rose": ("로즈", "로지", "rose"),
  "coral": ("코랄", "coral", "살몬", "salmon"),
  "red": ("레드", "red"),
  "orange": ("오렌지", "orange", "브릭", "brick"),
  "mauve": ("모브", "mauve"),
  "brown": ("브라운", "brown", "초코", "카카오", "토프", "헤이즐", "hazel", "acorn", "모카", "mocha", "갈색", "흑갈색"),
  "nude": ("누드", "nude", "베이지", "beige", "아이보리", "ivory", "포슬린", "porcelain", "내추럴", "natural", "바닐라", "vanilla", "리넨", "linen", "피칸"),
  "peach": ("피치", "peach"),
  "plum": ("플럼", "plum", "베리", "berry", "라벤더", "lavender", "라일락", "lilac", "바이올렛", "violet"),
  "black": ("블랙", "black", "흑색", "흑심"),
  "gray": ("그레이", "gray", "grey", "애쉬", "ash", "회갈색"),
}
UNDERTONE_RULES = {
  "warm": ("웜톤", "웜 블렌딩", "웜블렌딩", "warm", "코랄", "오렌지", "피치", "브릭", "진저", "피칸"),
  "cool": ("쿨톤", "쿨 블렌딩", "쿨블렌딩", "cool", "모브", "플럼", "라벤더", "라일락", "바이올렛", "애쉬", "그레이", "페탈", "로지"),
  "neutral": ("뉴트럴", "neutral", "누드", "베이지", "브라운", "아이보리", "내추럴", "포슬린", "바닐라", "리넨", "토프"),
}
OPTION_REJECT_MARKERS = (
  "colors",
  "color",
  "g ",
  " g",
  "ml",
  "spf",
  "pa+++",
  "공식",
  "기획",
  "단품",
  "리필",
  "본품",
  "브러쉬",
  "브러시",
  "선물",
  "세트",
  "증정",
  "퍼프",
  "호수선택",
  "one option",
)


def _default_run_date() -> str:
  return (datetime.now(tz=UTC) + timedelta(hours=9)).strftime("%Y%m%d")


def _default_fetched_at(run_date: str) -> str:
  return f"{run_date[:4]}-{run_date[4:6]}-{run_date[6:8]}T00:00:00+09:00"


def _load_env_file(path: Path) -> None:
  if not path.exists():
    return

  for line in path.read_text(encoding="utf-8").splitlines():
    stripped = line.strip()

    if not stripped or stripped.startswith("#") or "=" not in stripped:
      continue

    key, value = stripped.split("=", 1)
    key = key.strip()

    if key and key not in os.environ:
      os.environ[key] = value.strip().strip('"').strip("'")


def _load_local_env() -> None:
  _load_env_file(REPO_ROOT / ".env")
  _load_env_file(REPO_ROOT / "services" / "backend" / ".env")


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


def _display_path(path: Path) -> str:
  try:
    return str(path.relative_to(REPO_ROOT))
  except ValueError:
    return str(path)


def _squash(value: Any) -> str:
  text = html.unescape(str(value or ""))
  text = re.sub(r"<[^>]+>", " ", text)
  return re.sub(r"\s+", " ", text).strip()


def _short(value: Any, limit: int = TEXT_SNIPPET_LIMIT) -> str:
  return _squash(value)[:limit]


def _domain(url: str) -> str:
  return urllib.parse.urlparse(str(url or "")).netloc.lower()


def _tokens(text: str, brand: str) -> set[str]:
  lowered = _squash(text).lower()
  lowered = lowered.replace(brand.lower(), " ")
  raw_tokens = re.findall(r"[가-힣a-zA-Z0-9]{2,}", lowered)
  return {
    token
    for token in raw_tokens
    if token not in TOKEN_STOPWORDS and not token.isdigit()
  }


def _match_score(row: dict[str, Any], offer: dict[str, Any]) -> float:
  candidate_product_id = str(row.get("candidateId") or "").replace("naver-", "")
  offer_product_id = str(offer.get("productId") or "")

  if candidate_product_id and offer_product_id and candidate_product_id == offer_product_id:
    return 1.0

  brand = str(row.get("brand") or "")
  title = _squash(offer.get("title"))
  product_name = str(row.get("productName") or "")
  query_tokens = _tokens(product_name, brand)
  offer_tokens = _tokens(title, brand)

  if not query_tokens or not offer_tokens:
    return 0

  overlap = len(query_tokens & offer_tokens)
  return round(overlap / max(1, min(len(query_tokens), len(offer_tokens))), 2)


def _query_for_row(row: dict[str, Any]) -> str:
  brand = str(row.get("brand") or "")
  product_name = _squash(row.get("productName"))
  product_name = re.sub(r"^\([^)]*\)\s*", "", product_name)
  product_name = re.sub(r"^\[[^]]*\]\s*", "", product_name)
  product_name = product_name.replace("이런 상품 어때요?", "").strip()
  return _squash(f"{brand} {product_name}")[:90]


def _field_payload(value: Any, confidence: float, raw_text: str, source_url: str, source_type: str) -> dict[str, Any]:
  return {
    "confidence": round(confidence, 2),
    "rawText": _short(raw_text),
    "sourceType": source_type,
    "sourceUrl": source_url,
    "value": value,
  }


def _marker_in_text(text: str, marker: str) -> bool:
  lowered_text = text.lower()
  lowered_marker = marker.lower()

  if lowered_marker == "블러":
    return bool(re.search(r"블러(?!쉬)", lowered_text))

  return lowered_marker in lowered_text


def _infer_by_rules(text: str, rules: dict[str, tuple[str, ...]]) -> str | None:
  for value, markers in rules.items():
    if any(_marker_in_text(text, marker) for marker in markers):
      return value

  return None


def _collect_tags(text: str, rules: dict[str, tuple[str, ...]]) -> list[str]:
  return [
    value
    for value, markers in rules.items()
    if any(_marker_in_text(text, marker) for marker in markers)
  ]


def _normalize_option_phrase(raw: str) -> str:
  text = _squash(raw)
  text = re.sub(r"^[,./:;|+\\-\\[\\](){}]+", "", text).strip()
  text = re.sub(r"[,./:;|+\\-\\[\\](){}]+$", "", text).strip()
  text = re.sub(r"\b\d+(?:\.\d+)?\s*(?:g|ml|개|종|호)\b", "", text, flags=re.I).strip()
  text = re.sub(r"\b(?:x\s*)?\d+\s*개\b", "", text, flags=re.I).strip()
  text = re.sub(r"\b\d{5,}\b", "", text).strip()
  return _squash(text)


def _is_plausible_option_phrase(raw: str) -> bool:
  text = _normalize_option_phrase(raw)
  lowered = text.lower()

  if not text or len(text) > 28:
    return False

  if any(marker in lowered for marker in OPTION_REJECT_MARKERS):
    return False

  if re.fullmatch(r"\d+|[a-z]{1,2}", lowered):
    return False

  if re.fullmatch(r"\d{1,2}\s*(?:c|n|p|w|y)", lowered):
    return True

  has_color_signal = any(_marker_in_text(lowered, marker) for markers in COLOR_RULES.values() for marker in markers)
  has_tone_code = bool(re.search(r"\b\d{1,2}\s*[CNPWY]\b", text, flags=re.I))

  return bool((has_color_signal or has_tone_code) and re.search(r"[가-힣A-Za-z0-9]", text))


def _base_undertone_from_code(text: str) -> str | None:
  compact = re.sub(r"\s+", "", text.upper())

  if re.search(r"\d{1,2}C\b|C\d{1,2}\b", compact):
    return "cool"

  if re.search(r"\d{1,2}[WY]\b|[WY]\d{1,2}\b", compact):
    return "warm"

  if re.search(r"\d{1,2}N\b|N\d{1,2}\b", compact):
    return "neutral"

  if re.search(r"\d{1,2}P\b|P\d{1,2}\b", compact):
    return "cool"

  return None


def _shade_payload_from_name(raw: str) -> dict[str, Any]:
  option_name = _normalize_option_phrase(raw)
  token_match = re.match(r"^([A-Za-z]?\d{1,3}[A-Za-z]?)\s+(.+)$", option_name)
  shade_number = ""
  shade_name = option_name

  if token_match:
    shade_number = token_match.group(1).strip()
    shade_name = token_match.group(2).strip()

  color_family = _infer_by_rules(option_name, COLOR_RULES)
  undertone = _base_undertone_from_code(option_name) or _infer_by_rules(option_name, UNDERTONE_RULES)
  payload = {
    "confidence": 0.55,
    "optionName": option_name,
    "shadeName": shade_name,
    "shadeNumber": shade_number,
    "sourceType": "naver_offer_title_option_inferred",
  }

  if color_family:
    payload["colorFamily"] = color_family
    payload["colorFamilyConfidence"] = 0.58

  if undertone:
    payload["undertone"] = undertone
    payload["undertoneConfidence"] = 0.58

  return {key: value for key, value in payload.items() if value not in (None, "", [])}


def _extract_offer_shade_options(matched_offers: list[dict[str, Any]]) -> list[dict[str, Any]]:
  options: list[dict[str, Any]] = []
  seen: set[str] = set()
  patterns = (
    r"(?:색상|컬러|옵션)\s*([A-Za-z]?\d{1,2}\s*[CNPWY]?(?:\s*[가-힣A-Za-z][가-힣A-Za-z\s]{0,12})?|[가-힣A-Za-z][가-힣A-Za-z\s]{1,16})",
    r"\b([A-Za-z]{0,3}\d{1,3}[A-Za-z]?\s*[가-힣A-Za-z][가-힣A-Za-z\s]{1,14})",
    r"([가-힣A-Za-z]{0,10}(?:베이지|브라운|블랙|그레이|핑크|피치|코랄|로즈|모브|라벤더|플럼|바이올렛|포슬린|아이보리|내추럴|피칸|애쉬|토프)[가-힣A-Za-z\s]{0,8})",
  )

  for offer in matched_offers:
    title = _squash(offer.get("title"))

    for pattern in patterns:
      for match in re.finditer(pattern, title, flags=re.I):
        option_name = _normalize_option_phrase(match.group(1))
        key = re.sub(r"\s+", "", option_name.lower())

        if key in seen or not _is_plausible_option_phrase(option_name):
          continue

        seen.add(key)
        options.append(_shade_payload_from_name(option_name))

        if len(options) >= 12:
          return options

  return options


def _fetch_naver_offers(
  *,
  client_id: str,
  client_secret: str,
  query: str,
  display: int,
  timeout_seconds: float,
) -> list[dict[str, Any]]:
  params = urllib.parse.urlencode(
    {
      "display": display,
      "exclude": "used:rental:cbshop",
      "query": query,
      "sort": "sim",
      "start": 1,
    },
  )
  request = urllib.request.Request(
    f"{NAVER_SHOPPING_API_URL}?{params}",
    headers={
      "X-Naver-Client-Id": client_id,
      "X-Naver-Client-Secret": client_secret,
      "User-Agent": f"{COLLECTOR_VERSION} (+metadata-only)",
    },
  )

  with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
    payload = json.loads(response.read().decode("utf-8"))

  items = payload.get("items")
  return items if isinstance(items, list) else []


def _offer_attribute_fields(matched_offers: list[dict[str, Any]]) -> dict[str, Any]:
  fields: dict[str, Any] = {}
  combined_text = " ".join(str(offer.get("title") or "") for offer in matched_offers)
  source_url = str((matched_offers[0] or {}).get("link") or "") if matched_offers else ""

  if not combined_text:
    return fields

  shade_options = _extract_offer_shade_options(matched_offers)

  if shade_options:
    fields["shadeOptions"] = _field_payload(
      shade_options,
      0.55,
      combined_text,
      source_url,
      "naver_offer_title_option_inferred",
    )

  finish = _infer_by_rules(combined_text, FINISH_RULES)

  if finish:
    fields["finish"] = _field_payload(
      finish,
      0.58,
      combined_text,
      source_url,
      "naver_offer_title_inferred",
    )

  texture = _infer_by_rules(combined_text, TEXTURE_RULES)

  if texture:
    fields["texture"] = _field_payload(
      texture,
      0.6,
      combined_text,
      source_url,
      "naver_offer_title_inferred",
    )

  selling_points = _collect_tags(combined_text, SELLING_POINT_RULES)

  if selling_points:
    fields["sellingPoints"] = _field_payload(
      selling_points,
      0.56,
      combined_text,
      source_url,
      "naver_offer_title_inferred",
    )

  return fields


def _positive_listing_fields(row: dict[str, Any], offers: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
  fields: dict[str, Any] = {}
  positives: list[dict[str, Any]] = []
  matched_offers: list[dict[str, Any]] = []

  for offer in offers:
    score = _match_score(row, offer)

    if score < 0.5:
      continue

    title = _squash(offer.get("title"))
    mall_name = _squash(offer.get("mallName"))
    link = str(offer.get("link") or "")
    domain = _domain(link)
    evidence_text = f"mallName={mall_name}; title={title}; productId={offer.get('productId')}; matchScore={score}"
    matched_offer = {
      "domain": domain,
      "link": link,
      "mallName": mall_name,
      "matchScore": score,
      "productId": offer.get("productId"),
      "title": title,
    }
    matched_offers.append(matched_offer)
    is_oliveyoung = any(marker.lower() in f"{mall_name} {domain}".lower() for marker in OLIVEYOUNG_MARKERS)
    is_department = (
      any(marker.lower() in mall_name.lower() for marker in DEPARTMENT_MARKERS)
      or any(marker in domain for marker in DEPARTMENT_DOMAIN_MARKERS)
    )

    if not is_oliveyoung and not is_department:
      continue

    positives.append(matched_offer)

    if is_oliveyoung and "oliveYoungListed" not in fields:
      fields["oliveYoungListed"] = _field_payload(
        True,
        0.72,
        evidence_text,
        link,
        "naver_offer_retail_presence",
      )

    if is_department and "departmentStoreListed" not in fields:
      fields["departmentStoreListed"] = _field_payload(
        True,
        0.7,
        evidence_text,
        link,
        "naver_offer_retail_presence",
      )

  fields.update(_offer_attribute_fields(matched_offers[:8]))
  return fields, positives[:5], matched_offers[:8]


def collect_naver_offer_metadata(
  *,
  limited_results_path: Path,
  output_path: Path,
  report_path: Path,
  max_rows: int,
  display: int,
  timeout_seconds: float,
  delay_seconds: float,
  fetched_at: str,
  merge_existing: bool,
  skip_existing_with_fields: bool,
) -> dict[str, Any]:
  _load_local_env()
  client_id = os.environ.get("NAVER_SHOPPING_CLIENT_ID") or os.environ.get("NAVER_CLIENT_ID")
  client_secret = os.environ.get("NAVER_SHOPPING_CLIENT_SECRET") or os.environ.get("NAVER_CLIENT_SECRET")

  if not client_id or not client_secret:
    raise RuntimeError("Missing NAVER_SHOPPING_CLIENT_ID/NAVER_SHOPPING_CLIENT_SECRET")

  existing_by_id: dict[str, dict[str, Any]] = {}

  if output_path.exists():
    existing_by_id = {str(row.get("candidateId") or ""): row for row in _read_jsonl(output_path)}

  candidates: list[dict[str, Any]] = []

  for row in _read_jsonl(limited_results_path):
    fields = row.get("fields") if isinstance(row.get("fields"), dict) else {}
    has_positive_retail = bool((fields.get("oliveYoungListed") or {}).get("value")) or bool(
      (fields.get("departmentStoreListed") or {}).get("value"),
    )

    if has_positive_retail:
      continue

    candidate_id = str(row.get("candidateId") or "")

    if skip_existing_with_fields and (existing_by_id.get(candidate_id) or {}).get("fields"):
      continue

    candidates.append(row)

  candidates = sorted(
    candidates,
    key=lambda row: (
      -int(bool((row.get("manualReview") or {}).get("needed"))),
      str(row.get("category") or ""),
      str(row.get("brand") or ""),
      str(row.get("productName") or ""),
    ),
  )

  if max_rows > 0:
    candidates = candidates[:max_rows]

  outputs: list[dict[str, Any]] = []
  fetch_counts: Counter[str] = Counter()

  for index, row in enumerate(candidates):
    if index > 0 and delay_seconds > 0:
      time.sleep(delay_seconds)

    candidate_id = str(row.get("candidateId") or "")
    query = _query_for_row(row)

    try:
      offers = _fetch_naver_offers(
        client_id=client_id,
        client_secret=client_secret,
        query=query,
        display=display,
        timeout_seconds=timeout_seconds,
      )
      fetch_counts["200"] += 1
    except Exception as exc:  # noqa: BLE001 - network failures are recorded as collection status.
      fetch_counts[type(exc).__name__] += 1
      outputs.append(
        {
          "brand": row.get("brand"),
          "candidateId": candidate_id,
          "category": row.get("category"),
          "collectionStatus": "blocked",
          "fields": {},
          "fetchedAt": fetched_at,
          "failureReason": f"{type(exc).__name__}: {_short(exc)}",
          "parserVersion": COLLECTOR_VERSION,
          "productName": row.get("productName"),
          "query": query,
        },
      )
      continue

    fields, positives, matched_offers = _positive_listing_fields(row, offers)
    retail_source_url = positives[0]["link"] if positives else ""
    outputs.append(
      {
        "brand": row.get("brand"),
        "candidateId": candidate_id,
        "category": row.get("category"),
        "collectionStatus": "collected_partial" if fields else "not_found",
        "fields": fields,
        "fetchedAt": fetched_at,
        "matchedOffers": matched_offers,
        "matchedPositiveOffers": positives,
        "parserVersion": COLLECTOR_VERSION,
        "productName": row.get("productName"),
        "query": query,
        "retailSourceUrl": retail_source_url,
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

  outputs = sorted(outputs, key=lambda row: (str(row.get("brand") or ""), str(row.get("category") or ""), str(row.get("candidateId") or "")))
  _write_jsonl(output_path, outputs)
  _write_report(report_path, output_path, outputs, candidates, fetch_counts)

  return {
    "candidateRows": len(candidates),
    "output": _display_path(output_path),
    "report": _display_path(report_path),
    "rows": len(outputs),
    "withFields": sum(1 for row in outputs if row.get("fields")),
  }


def refresh_existing_offer_metadata(
  *,
  output_path: Path,
  report_path: Path,
  fetched_at: str,
) -> dict[str, Any]:
  outputs: list[dict[str, Any]] = []

  for row in _read_jsonl(output_path):
    fields = dict(row.get("fields") or {})

    for field in ("shadeOptions", "finish", "texture", "sellingPoints"):
      source_type = str((fields.get(field) or {}).get("sourceType") or "")

      if source_type.startswith("naver_offer_title"):
        fields.pop(field, None)

    matched_offers = row.get("matchedOffers")

    if not isinstance(matched_offers, list) or not matched_offers:
      matched_offers = row.get("matchedPositiveOffers") if isinstance(row.get("matchedPositiveOffers"), list) else []

    fields.update(_offer_attribute_fields(matched_offers))
    row["fields"] = fields
    row["fetchedAt"] = row.get("fetchedAt") or fetched_at
    row["collectionStatus"] = "collected_partial" if fields else "not_found"
    outputs.append(row)

  outputs = sorted(outputs, key=lambda row: (str(row.get("brand") or ""), str(row.get("category") or ""), str(row.get("candidateId") or "")))
  _write_jsonl(output_path, outputs)
  _write_report(report_path, output_path, outputs, [], Counter({"reused_existing_offers": len(outputs)}))

  return {
    "candidateRows": 0,
    "output": _display_path(output_path),
    "report": _display_path(report_path),
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
  field_counts = Counter(
    field
    for row in rows
    for field, payload in (row.get("fields") or {}).items()
    if (payload or {}).get("value") not in (None, "", [])
  )
  status_counts = Counter(str(row.get("collectionStatus") or "") for row in rows)
  brand_counts = Counter(str(row.get("brand") or "") for row in rows)
  lines = [
    "# Auradin Naver Offer Metadata Collection",
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
      "- Source is the official Naver Shopping Search API, queried from existing Auradin candidate product names.",
      "- Only positive OliveYoung or department-store listing evidence is retained; missing offers do not become negative listing claims.",
      "- Matched offer titles can contribute low-confidence shadeOptions, finish, texture, and selling-point hints; these remain below the hard-filter cutoff unless another stronger source confirms them.",
      "- Offer title, mallName, productId, link, and matchScore are stored as short evidence only; raw API payloads, reviews, ingredients, and images are not stored.",
    ],
  )
  report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Collect positive retail-presence evidence from Naver Shopping API offers.")
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument("--limited-results", type=Path)
  parser.add_argument("--output", type=Path)
  parser.add_argument("--report", type=Path)
  parser.add_argument("--max-rows", type=int, default=120)
  parser.add_argument("--display", type=int, default=20)
  parser.add_argument("--timeout-seconds", type=float, default=10.0)
  parser.add_argument("--delay-seconds", type=float, default=0.2)
  parser.add_argument("--merge-existing", action="store_true")
  parser.add_argument("--skip-existing-with-fields", action="store_true")
  parser.add_argument(
    "--reuse-existing-offers",
    action="store_true",
    help="Recompute fields from matchedOffers already stored in the output file without calling the API.",
  )
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  limited_results_path = args.limited_results or REPO_ROOT / "data" / "auradin" / "detail" / "normalized" / f"limited_detail_results_{args.date}.jsonl"
  output_path = args.output or REPO_ROOT / "data" / "auradin" / "detail" / "retail" / f"naver_offer_metadata_{args.date}.jsonl"
  report_path = args.report or REPO_ROOT / "reports" / "auradin" / f"naver_offer_metadata_collection_{args.date}.md"

  if args.reuse_existing_offers:
    result = refresh_existing_offer_metadata(
      output_path=output_path,
      report_path=report_path,
      fetched_at=_default_fetched_at(args.date),
    )
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0

  result = collect_naver_offer_metadata(
    limited_results_path=limited_results_path,
    output_path=output_path,
    report_path=report_path,
    max_rows=args.max_rows,
    display=args.display,
    timeout_seconds=args.timeout_seconds,
    delay_seconds=args.delay_seconds,
    fetched_at=_default_fetched_at(args.date),
    merge_existing=args.merge_existing,
    skip_existing_with_fields=args.skip_existing_with_fields,
  )
  print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
