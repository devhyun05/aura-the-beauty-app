from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import os
import re
import subprocess
import sys
import time
from collections import Counter
from contextlib import nullcontext
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.auradin_catalog.domain_preflight import DEFAULT_USER_AGENT  # noqa: E402
from app.services.auradin_catalog.phase_c_enrichment import FORBIDDEN_URL_TERMS  # noqa: E402


RUNNER_VERSION = "auradin-phase-d-detail-v2"
TEXT_LIMIT = 9000
SNIPPET_LIMIT = 260

TARGET_BRAND_COUNTRY = {
  "3CE": "Korea",
  "VDL": "Korea",
  "네이밍": "Korea",
  "더샘": "Korea",
  "데이지크": "Korea",
  "라카": "Korea",
  "롬앤": "Korea",
  "뮤드": "Korea",
  "에뛰드": "Korea",
  "에스쁘아": "Korea",
  "웨이크메이크": "Korea",
  "정샘물 뷰티": "Korea",
  "컬러그램": "Korea",
  "클리오": "Korea",
  "투쿨포스쿨": "Korea",
  "페리페라": "Korea",
  "하트퍼센트": "Korea",
}

SELLING_POINT_RULES = {
  "long_lasting": ("지속", "롱래스팅", "long lasting", "lasting"),
  "moisturizing": ("보습", "촉촉", "수분", "moistur", "hydrating"),
  "adhesion": ("밀착", "착붙", "adhesion", "fit"),
  "glow": ("광택", "글로우", "윤광", "glow", "dewy", "glass"),
  "blur": ("블러", "blur", "모공", "포어"),
  "coverage": ("커버", "coverage"),
  "waterproof": ("워터프루프", "방수", "waterproof"),
  "smudge_proof": ("번짐", "스머지", "smudge"),
  "lightweight": ("가벼", "라이트", "lightweight"),
  "high_pigment": ("고발색", "선명", "vivid", "pigment"),
  "vegan": ("비건", "vegan"),
}

SUITABLE_FOR_RULES = {
  "warm_tone": ("웜톤", "봄웜", "가을웜", "warm tone"),
  "cool_tone": ("쿨톤", "여름쿨", "겨울쿨", "cool tone"),
  "spring_warm": ("봄웜", "spring warm"),
  "summer_cool": ("여름쿨", "summer cool"),
  "autumn_warm": ("가을웜", "autumn warm"),
  "winter_cool": ("겨울쿨", "winter cool"),
  "dry_skin": ("건성", "dry skin"),
  "oily_skin": ("지성", "oily skin"),
  "sensitive_skin": ("민감성", "sensitive"),
  "daily_makeup": ("데일리", "daily"),
  "natural_makeup": ("자연스러운", "내추럴", "natural"),
}

COLOR_RULES = {
  "pink": ("핑크", "pink", "피오니", "베이비핑크"),
  "rose": ("로즈", "로지", "rose", "말린장미"),
  "coral": ("코랄", "coral"),
  "red": ("레드", "red"),
  "orange": ("오렌지", "orange"),
  "mauve": ("모브", "mauve"),
  "brown": ("브라운", "brown", "초코", "카라멜", "토프"),
  "nude": ("누드", "nude", "베이지"),
  "peach": ("피치", "peach", "복숭아"),
  "plum": ("플럼", "plum", "베리", "berry"),
}

FINISH_RULES = {
  "matte": ("매트", "보송", "무광", "matte"),
  "velvet": ("벨벳", "velvet", "블러"),
  "satin": ("새틴", "satin", "세미매트", "semi-matte"),
  "sheer": ("쉬어", "투명", "맑은", "sheer"),
  "shimmer": ("쉬머", "펄", "글리터", "shimmer", "glitter"),
  "glossy": ("글로우", "광택", "글로스", "glossy", "gloss", "dewy"),
}

TEXTURE_RULES = {
  "tint": ("틴트", "tint"),
  "balm": ("밤", "balm"),
  "lipstick": ("립스틱", "lipstick", "립 매트"),
  "gloss": ("글로스", "gloss"),
  "cream": ("크림", "cream"),
  "powder": ("파우더", "powder", "팔레트", "섀도우"),
  "pencil": ("펜슬", "pencil"),
  "liquid": ("리퀴드", "liquid"),
  "cushion": ("쿠션", "cushion"),
  "mascara": ("마스카라", "mascara"),
  "liner": ("라이너", "liner"),
}

INTENSITY_RULES = {
  "sheer": ("쉬어", "투명", "맑은", "자연스러운", "은은한"),
  "medium": ("중간", "선명", "buildable"),
  "bold": ("고발색", "진한", "intense", "vivid", "딥"),
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
  return urlparse(url).netloc


def _primary_source_url(row: dict[str, Any]) -> str:
  source_urls = row.get("sourceUrls")

  if isinstance(source_urls, list) and source_urls:
    return str(source_urls[0])

  return ""


def _candidate_key(*parts: str) -> str:
  normalized = "|".join(re.sub(r"\s+", " ", part or "").strip().lower() for part in parts)
  return hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:16]


def _has_forbidden_url_term(url: str) -> str:
  lowered = url.lower()

  for term in FORBIDDEN_URL_TERMS:
    if term in lowered:
      return term

  return ""


def _html_unescape(value: str) -> str:
  return html.unescape(re.sub(r"<[^>]+>", " ", value or "")).strip()


def _squash(value: str) -> str:
  return re.sub(r"\s+", " ", value or "").strip()


def _short(value: str, limit: int = SNIPPET_LIMIT) -> str:
  squashed = _squash(value)
  return squashed[:limit]


def _first_match(patterns: list[str], text: str, flags: int = re.I | re.S) -> str:
  for pattern in patterns:
    match = re.search(pattern, text, flags)

    if match:
      return _html_unescape(match.group(1))

  return ""


def _extract_meta(page_text: str) -> dict[str, str]:
  return {
    "title": _first_match([r"<title[^>]*>(.*?)</title>"], page_text),
    "description": _first_match(
      [
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']description["\']',
        r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']',
      ],
      page_text,
    ),
    "ogTitle": _first_match(
      [r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']'],
      page_text,
    ),
    "ogImage": _first_match(
      [r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']'],
      page_text,
    ),
    "price": _first_match(
      [
        r'<meta[^>]+property=["\']product:price:amount["\'][^>]+content=["\']([^"\']+)["\']',
        r'"price"\s*:\s*"?([0-9][0-9,]*)"?',
      ],
      page_text,
    ),
  }


def _html_to_visible_text(page_text: str) -> str:
  without_scripts = re.sub(r"<script\b[^>]*>.*?</script>", " ", page_text, flags=re.I | re.S)
  without_styles = re.sub(r"<style\b[^>]*>.*?</style>", " ", without_scripts, flags=re.I | re.S)
  visible = _html_unescape(without_styles)
  return _squash(visible)[:TEXT_LIMIT]


def _extract_json_ld(page_text: str) -> list[dict[str, Any]]:
  objects: list[dict[str, Any]] = []

  for match in re.finditer(
    r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    page_text,
    flags=re.I | re.S,
  ):
    raw = match.group(1).strip()

    try:
      parsed = json.loads(raw)
    except json.JSONDecodeError:
      continue

    candidates = parsed if isinstance(parsed, list) else [parsed]

    for candidate in candidates:
      if isinstance(candidate, dict):
        objects.append(candidate)

  return objects[:8]


def _extract_product_json_ld(json_ld: list[dict[str, Any]]) -> dict[str, Any]:
  for item in json_ld:
    item_type = item.get("@type")

    if item_type == "Product" or (isinstance(item_type, list) and "Product" in item_type):
      offers = item.get("offers") if isinstance(item.get("offers"), dict) else {}
      return {
        "name": item.get("name"),
        "brand": (item.get("brand") or {}).get("name") if isinstance(item.get("brand"), dict) else item.get("brand"),
        "image": item.get("image"),
        "description": item.get("description"),
        "price": offers.get("price"),
      }

  return {}


def _fetch_text(url: str, *, user_agent: str, timeout_seconds: float) -> tuple[str, dict[str, Any]]:
  marker = "__AURADIN_CURL_META__"

  try:
    result = subprocess.run(
      [
        "curl",
        "-s",
        "-L",
        "--compressed",
        "--max-time",
        f"{timeout_seconds:g}",
        "--user-agent",
        user_agent,
        "-w",
        f"\n{marker}http=%{{http_code}} url=%{{url_effective}}",
        url,
      ],
      check=False,
      capture_output=True,
      text=True,
      timeout=timeout_seconds + 5,
    )
  except (OSError, subprocess.TimeoutExpired) as exc:
    return "", {
      "contentLength": 0,
      "error": f"{type(exc).__name__}: {exc}",
      "httpStatus": None,
      "urlEffective": url,
    }

  stdout = result.stdout
  body = stdout
  http_status = None
  url_effective = url

  if marker in stdout:
    body, meta = stdout.rsplit(marker, 1)
    status_match = re.search(r"http=(\d+)", meta)
    url_match = re.search(r"url=(.*)$", meta.strip())
    http_status = int(status_match.group(1)) if status_match else None
    url_effective = url_match.group(1) if url_match else url

  return body, {
    "contentLength": len(body.encode("utf-8")),
    "error": result.stderr.strip() or (f"curl_exit_code:{result.returncode}" if result.returncode else ""),
    "httpStatus": http_status,
    "urlEffective": url_effective,
  }


def _is_security_challenge(page_text: str) -> bool:
  challenge_markers = (
    "cf_chl_opt",
    "challenge-platform",
    "Enable JavaScript and cookies to continue",
    "보안 확인",
    "연결하고 있습니다",
    "captcha",
    "CAPTCHA",
  )

  return any(marker in page_text for marker in challenge_markers)


def _extract_js_assignment(page_text: str, variable_name: str) -> Any:
  match = re.search(rf"\bvar\s+{re.escape(variable_name)}\s*=\s*", page_text)

  if not match:
    return None

  index = match.end()

  while index < len(page_text) and page_text[index].isspace():
    index += 1

  if index >= len(page_text) or page_text[index] not in "[{":
    return None

  opener = page_text[index]
  closer = "]" if opener == "[" else "}"
  depth = 0
  in_string = False
  escaped = False

  for cursor in range(index, len(page_text)):
    char = page_text[cursor]

    if in_string:
      if escaped:
        escaped = False
      elif char == "\\":
        escaped = True
      elif char == '"':
        in_string = False
      continue

    if char == '"':
      in_string = True
    elif char == opener:
      depth += 1
    elif char == closer:
      depth -= 1

      if depth == 0:
        return json.loads(page_text[index : cursor + 1])

  return None


def _normalize_shade_name(option_name: str) -> dict[str, str]:
  decoded = html.unescape(option_name)
  undertone_match = re.search(r"\(([^)]+)\)", decoded)
  without_undertone = re.sub(r"\([^)]+\)", "", decoded).strip()
  shade_number = ""
  shade_name = without_undertone
  hashtag_match = re.search(r"#\s*([A-Za-z]?\d+[A-Za-z]?)\s*(.*)", without_undertone)

  if hashtag_match:
    shade_number = hashtag_match.group(1).strip()
    shade_name = hashtag_match.group(2).strip()
  else:
    token_match = re.search(r"^([A-Za-z]?\d+[A-Za-z]?)\s+(.+)$", without_undertone)

    if token_match:
      shade_number = token_match.group(1).strip()
      shade_name = token_match.group(2).strip()

  shade_name = re.sub(r"^\s*[-_:#]+", "", shade_name).strip()

  return {
    "rawOptionText": decoded,
    "shadeNumber": shade_number,
    "shadeName": shade_name,
    "undertoneLabel": undertone_match.group(1).strip() if undertone_match else "",
  }


def _infer_by_rules(text: str, rules: dict[str, tuple[str, ...]]) -> str | None:
  lowered = text.lower()

  for value, markers in rules.items():
    if any(marker.lower() in lowered for marker in markers):
      return value

  return None


def _collect_tags(text: str, rules: dict[str, tuple[str, ...]]) -> list[str]:
  lowered = text.lower()
  return [
    tag
    for tag, markers in rules.items()
    if any(marker.lower() in lowered for marker in markers)
  ]


def _extract_option_candidates(text: str) -> list[dict[str, Any]]:
  options: list[dict[str, Any]] = []
  seen: set[str] = set()
  patterns = [
    r"#\s*([A-Za-z]?\d{1,2}[A-Za-z]?\s*[가-힣A-Za-z][가-힣A-Za-z0-9\s]{1,20})",
    r"\b([A-Za-z]?\d{1,2}[A-Za-z]?\s+[가-힣A-Za-z][가-힣A-Za-z0-9\s]{1,20})",
  ]

  for pattern in patterns:
    for match in re.finditer(pattern, text):
      raw = _squash(match.group(1))

      if not _is_plausible_shade_option(raw) or raw in seen:
        continue

      seen.add(raw)
      normalized = _normalize_shade_name(raw)
      options.append(
        {
          "optionName": normalized["rawOptionText"],
          "shadeName": normalized["shadeName"] or None,
          "shadeNumber": normalized["shadeNumber"] or None,
          "rawOptionText": normalized["rawOptionText"],
          "colorFamily": _infer_by_rules(raw, COLOR_RULES),
          "undertone": _infer_undertone(raw),
          "depth": _infer_depth(raw),
          "saturation": _infer_saturation(raw),
          "intensity": _infer_by_rules(raw, INTENSITY_RULES),
          "colorHex": None,
          "colorLab": None,
          "finishOverride": _infer_by_rules(raw, FINISH_RULES),
          "recommendedToneTags": _collect_tags(raw, SUITABLE_FOR_RULES),
          "avoidToneTags": [],
        },
      )

  return options[:24]


def _is_plausible_shade_option(raw: str) -> bool:
  lowered = raw.lower()
  blocked_markers = (
    "color",
    "colors",
    "g ",
    " g",
    "ml",
    "%",
    "할인",
    "가격",
    "원",
    "개",
    "종",
    "단품",
    "기획",
    "본품",
    "리필",
    "헬스",
    "뷰티",
    "스토어",
    "회원",
    "로그인",
    "장바구니",
    "주문",
    "배송",
    "카테고리",
    "검색",
    "고객센터",
  )

  if len(raw) > 28 or any(marker in lowered for marker in blocked_markers):
    return False

  if re.fullmatch(r"[A-Za-z]?\d{1,2}[A-Za-z]?", raw):
    return False

  if re.search(r"\d{1,2}\s*(g|ml|개|종|color|colors)\b", lowered):
    return False

  if not re.search(r"[가-힣A-Za-z]", raw):
    return False

  return True


def _infer_undertone(text: str) -> str | None:
  lowered = text.lower()

  if any(marker in lowered for marker in ("웜톤", "봄웜", "가을웜", "warm", "코랄", "오렌지", "피치")):
    return "warm"

  if any(marker in lowered for marker in ("쿨톤", "여름쿨", "겨울쿨", "cool", "모브", "플럼", "베리")):
    return "cool"

  if any(marker in lowered for marker in ("뉴트럴", "neutral", "누드", "베이지", "mlbb")):
    return "neutral"

  return None


def _infer_depth(text: str) -> str | None:
  lowered = text.lower()

  if any(marker in lowered for marker in ("라이트", "light", "밝", "페일")):
    return "light"

  if any(marker in lowered for marker in ("딥", "deep", "다크", "dark")):
    return "deep"

  return None


def _infer_saturation(text: str) -> str | None:
  lowered = text.lower()

  if any(marker in lowered for marker in ("뮤트", "muted", "말린", "차분")):
    return "muted"

  if any(marker in lowered for marker in ("맑", "clear", "클리어")):
    return "clear"

  if any(marker in lowered for marker in ("비비드", "vivid", "선명")):
    return "vivid"

  return None


def _parse_chicor_page(page_text: str) -> dict[str, Any]:
  detail = _extract_js_assignment(page_text, "goosDtlInf")
  repr_option = _extract_js_assignment(page_text, "reprGoosOptn")
  options = _extract_js_assignment(page_text, "goosOptnList")
  shade_options: list[dict[str, Any]] = []

  if isinstance(options, list):
    for option in options:
      if not isinstance(option, dict):
        continue

      option_name = str(option.get("optnNm") or "")
      normalized = _normalize_shade_name(option_name)
      shade_options.append(
        {
          "optionName": normalized["rawOptionText"],
          "shadeName": normalized["shadeName"] or None,
          "shadeNumber": normalized["shadeNumber"] or None,
          "rawOptionText": normalized["rawOptionText"],
          "colorFamily": _infer_by_rules(option_name, COLOR_RULES),
          "undertone": _infer_undertone(option_name),
          "depth": _infer_depth(option_name),
          "saturation": _infer_saturation(option_name),
          "intensity": _infer_by_rules(option_name, INTENSITY_RULES),
          "colorHex": None,
          "colorLab": None,
          "finishOverride": _infer_by_rules(option_name, FINISH_RULES),
          "recommendedToneTags": _collect_tags(option_name, SUITABLE_FOR_RULES),
          "avoidToneTags": [],
          "dpCode": option.get("dpCode"),
          "stockQuantity": option.get("stocQty"),
          "soldOut": option.get("rostYn") == "Y",
          "price": option.get("disGoosAmt") or option.get("norMaega"),
        },
      )

  product_name = None
  brand = None
  review_count = None
  star_score = None

  if isinstance(detail, dict):
    product_name = str(detail.get("goosName") or detail.get("dispGoosNm") or "") or None
    brand = str(detail.get("dtlBranNm") or "") or None
    review_count = detail.get("rvwCnt")
    star_score = detail.get("starscore")

  representative_shade = None

  if isinstance(repr_option, dict) and repr_option.get("optnNm"):
    normalized = _normalize_shade_name(str(repr_option.get("optnNm")))
    representative_shade = {
      "optionName": normalized["rawOptionText"],
      "shadeName": normalized["shadeName"] or None,
      "shadeNumber": normalized["shadeNumber"] or None,
      "rawOptionText": normalized["rawOptionText"],
    }

  return {
    "brand": brand,
    "productName": product_name,
    "reviewCount": review_count,
    "starScore": star_score,
    "shadeOptions": shade_options,
    "representativeShade": representative_shade,
  }


def _number_or_none(value: Any) -> int | None:
  if value is None:
    return None

  digits = re.sub(r"\D", "", str(value))

  return int(digits) if digits else None


def _build_evidence(field: str, value: Any, source_url: str, source_type: str, raw_text: str, confidence: float) -> dict[str, Any]:
  return {
    "confidence": confidence,
    "field": field,
    "rawText": _short(str(raw_text)),
    "sourceType": source_type,
    "sourceUrl": source_url,
    "value": value,
  }


def _extract_from_page(
  row: dict[str, Any],
  source_url: str,
  page_text: str,
  fetch_summary: dict[str, Any],
) -> dict[str, Any]:
  domain = _domain(source_url)
  meta = _extract_meta(page_text)
  json_ld = _extract_json_ld(page_text)
  product_ld = _extract_product_json_ld(json_ld)
  visible_text = _html_to_visible_text(page_text)
  product_text = " ".join(
    str(value)
    for value in [
      row.get("productName"),
      meta.get("title"),
      meta.get("ogTitle"),
      meta.get("description"),
      product_ld.get("description"),
      visible_text[:2500],
    ]
    if value
  )
  option_source_text = " ".join(
    str(value)
    for value in [
      row.get("productName"),
      meta.get("title"),
      meta.get("ogTitle"),
      meta.get("description"),
      product_ld.get("description"),
    ]
    if value
  )
  shade_options: list[dict[str, Any]] = []
  parser_notes: list[str] = []
  extracted: dict[str, Any] = {}

  if domain == "chicor.com":
    extracted = _parse_chicor_page(page_text)
    shade_options = extracted.get("shadeOptions") or []
    parser_notes.append("chicor_js_assignment_parser")

  if not shade_options:
    shade_options = _extract_option_candidates(option_source_text)

    if shade_options:
      parser_notes.append("generic_option_text_parser")

  product_name = (
    extracted.get("productName")
    or product_ld.get("name")
    or meta.get("ogTitle")
    or meta.get("title")
    or row.get("productName")
  )
  brand = extracted.get("brand") or product_ld.get("brand") or row.get("brand")
  image = product_ld.get("image") or meta.get("ogImage") or (row.get("liveOffer") or {}).get("image")
  price = _number_or_none(product_ld.get("price") or meta.get("price") or (row.get("liveOffer") or {}).get("lprice"))
  finish = row.get("finish") or _infer_by_rules(product_text, FINISH_RULES)
  texture = row.get("texture") or _infer_by_rules(product_text, TEXTURE_RULES)
  intensity = _infer_by_rules(product_text, INTENSITY_RULES)
  color_family = _infer_by_rules(product_text, COLOR_RULES)
  selling_points = _collect_tags(product_text, SELLING_POINT_RULES)
  suitable_for = _collect_tags(product_text, SUITABLE_FOR_RULES)
  skin_type_hints = [tag for tag in suitable_for if tag.endswith("_skin")]
  claims = sorted(set(selling_points + _collect_tags(product_text, FINISH_RULES)))
  evidence: list[dict[str, Any]] = []

  if product_name:
    evidence.append(_build_evidence("productName", product_name, source_url, "meta_or_visible_text", product_name, 0.75))

  if image:
    evidence.append(_build_evidence("imageUrl", image, source_url, "meta_or_json_ld", str(image), 0.75))

  if finish:
    evidence.append(_build_evidence("finish", finish, source_url, "structured_extraction", product_text, 0.65))

  if texture:
    evidence.append(_build_evidence("texture", texture, source_url, "structured_extraction", product_text, 0.65))

  if shade_options:
    evidence.append(_build_evidence("shadeOptions", len(shade_options), source_url, "option_dom_or_visible_text", product_text, 0.7))

  return {
    "brand": brand,
    "claims": claims,
    "colorFamily": color_family,
    "evidence": evidence,
    "fetchSummary": fetch_summary,
    "finish": finish,
    "imageUrl": image[0] if isinstance(image, list) and image else image,
    "intensity": intensity,
    "meta": {key: value for key, value in meta.items() if value},
    "parserNotes": parser_notes,
    "price": price,
    "productName": product_name,
    "sellingPoints": selling_points,
    "shadeOptions": shade_options,
    "skinTypeHints": skin_type_hints,
    "suitableFor": suitable_for,
    "textSnippet": _short(product_text, 800),
    "textureType": texture,
  }


def _empty_retail_presence(domain: str, source_url: str, mall_name: str | None) -> dict[str, Any]:
  is_oliveyoung = "oliveyoung" in domain or mall_name == "올리브영"
  department_retailers = []
  department_status = "unknown"

  if any(marker in domain for marker in ("shinsegae", "lotteimall")):
    department_status = "listed"
    department_retailers.append("department_store_related_mall")

  return {
    "departmentStore": {
      "evidence": domain if department_status == "listed" else None,
      "retailers": department_retailers,
      "sourceUrl": source_url if department_status == "listed" else None,
      "status": department_status,
    },
    "oliveYoung": {
      "evidence": "oliveyoung domain or mallName" if is_oliveyoung else None,
      "sourceUrl": source_url if is_oliveyoung else None,
      "status": "listed" if is_oliveyoung else "unknown",
    },
  }


def _brand_origin(brand: str | None) -> dict[str, Any]:
  country = TARGET_BRAND_COUNTRY.get(brand or "")
  return {
    "brandCountry": country,
    "brandOwnerCompany": None,
    "madeInCountry": None,
    "manufacturerCountry": None,
    "manufacturerName": None,
  }


def _structured_from_prior(row: dict[str, Any], source_url: str) -> dict[str, Any]:
  product_text = f"{row.get('brand') or ''} {row.get('productName') or ''}"
  shade_options = _extract_option_candidates(product_text)
  evidence = list(row.get("evidence") or [])
  finish = row.get("finish") or _infer_by_rules(product_text, FINISH_RULES)
  texture = row.get("texture") or _infer_by_rules(product_text, TEXTURE_RULES)

  return {
    "brand": row.get("brand"),
    "claims": sorted(set(_collect_tags(product_text, SELLING_POINT_RULES))),
    "colorFamily": _infer_by_rules(product_text, COLOR_RULES),
    "evidence": evidence,
    "finish": finish,
    "imageUrl": (row.get("liveOffer") or {}).get("image"),
    "intensity": _infer_by_rules(product_text, INTENSITY_RULES),
    "meta": {},
    "parserNotes": ["phase_c_prior_fields"],
    "price": (row.get("liveOffer") or {}).get("lprice"),
    "productName": row.get("productName"),
    "sellingPoints": _collect_tags(product_text, SELLING_POINT_RULES),
    "shadeOptions": shade_options,
    "skinTypeHints": [],
    "suitableFor": _collect_tags(product_text, SUITABLE_FOR_RULES),
    "textSnippet": _short(product_text, 800),
    "textureType": texture,
  }


class _ReusablePlaywrightCollector:
  def __init__(self, *, timeout_seconds: float, user_agent: str) -> None:
    self.timeout_seconds = timeout_seconds
    self.user_agent = user_agent
    self._browser: Any = None
    self._context: Any = None
    self._manager: Any = None
    self._page: Any = None
    self._playwright: Any = None
    self._timeout_error: type[Exception] | None = None
    self.start_error = ""

  def __enter__(self) -> "_ReusablePlaywrightCollector":
    try:
      from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
      from playwright.sync_api import sync_playwright

      self._timeout_error = PlaywrightTimeoutError
      self._manager = sync_playwright()
      self._playwright = self._manager.start()
      self._browser = self._playwright.chromium.launch(headless=True)
      self._context = self._browser.new_context(user_agent=self.user_agent)
      self._page = self._context.new_page()
    except Exception as exc:  # pragma: no cover - environment dependent
      self.start_error = f"playwright_unavailable:{type(exc).__name__}: {exc}"
      self.close()

    return self

  def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
    self.close()

  def close(self) -> None:
    for resource_name in ("_page", "_context", "_browser"):
      resource = getattr(self, resource_name)

      if resource is None:
        continue

      try:
        resource.close()
      except Exception:
        pass

      setattr(self, resource_name, None)

    if self._manager is not None:
      try:
        self._manager.stop()
      except Exception:
        pass

      self._manager = None
      self._playwright = None

  def _reset_page(self) -> None:
    if self._page is not None:
      try:
        self._page.close()
      except Exception:
        pass

    self._page = None

    if self._context is not None:
      try:
        self._page = self._context.new_page()
      except Exception:
        self.start_error = "playwright_page_reset_failed"

  def collect(self, source_url: str) -> tuple[str, dict[str, Any]]:
    if self.start_error or self._page is None:
      return "", {
        "contentLength": 0,
        "error": self.start_error or "playwright_unavailable",
        "used": False,
      }

    try:
      self._page.goto(
        source_url,
        wait_until="domcontentloaded",
        timeout=self.timeout_seconds * 1000,
      )
      self._page.wait_for_timeout(700)
      text = self._page.content()
      title = self._page.title()
      return text, {
        "contentLength": len(text.encode("utf-8")),
        "error": "",
        "title": title,
        "used": True,
      }
    except Exception as exc:  # pragma: no cover - environment dependent
      self._reset_page()
      is_timeout = self._timeout_error is not None and isinstance(exc, self._timeout_error)
      status = "playwright_timeout" if is_timeout else "playwright_error"
      return "", {
        "contentLength": 0,
        "error": f"{status}:{exc}",
        "used": True,
      }


def _collect_with_playwright(
  source_url: str,
  *,
  timeout_seconds: float,
  user_agent: str,
) -> tuple[str, dict[str, Any]]:
  try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright
  except Exception as exc:  # pragma: no cover - environment dependent
    return "", {
      "contentLength": 0,
      "error": f"playwright_unavailable:{type(exc).__name__}: {exc}",
      "used": False,
    }

  try:
    with sync_playwright() as playwright:
      browser = playwright.chromium.launch(headless=True)
      page = browser.new_page(user_agent=user_agent)
      page.goto(source_url, wait_until="domcontentloaded", timeout=timeout_seconds * 1000)
      page.wait_for_timeout(700)
      text = page.content()
      title = page.title()
      browser.close()
      return text, {
        "contentLength": len(text.encode("utf-8")),
        "error": "",
        "title": title,
        "used": True,
      }
  except PlaywrightTimeoutError as exc:
    return "", {
      "contentLength": 0,
      "error": f"playwright_timeout:{exc}",
      "used": True,
    }
  except Exception as exc:  # pragma: no cover - environment dependent
    return "", {
      "contentLength": 0,
      "error": f"playwright_error:{type(exc).__name__}: {exc}",
      "used": True,
    }


def _should_use_playwright(fetch_result: dict[str, Any]) -> bool:
  status = fetch_result.get("fetchStatus")

  if status in {"security_challenge", "http_error", "fetch_error"}:
    return True

  extracted = fetch_result.get("extracted") or {}
  return not extracted.get("shadeOptions") and not extracted.get("meta")


def _collect_target(
  row: dict[str, Any],
  *,
  fetched_at: str,
  playwright_collector: _ReusablePlaywrightCollector | None,
  user_agent: str,
  timeout_seconds: float,
  use_playwright: bool,
) -> dict[str, Any]:
  source_url = _primary_source_url(row)
  domain = _domain(source_url) if source_url else ""
  forbidden_term = _has_forbidden_url_term(source_url)
  fetch_result: dict[str, Any] = {
    "candidateId": row.get("candidateId"),
    "domain": domain,
    "fetchStatus": "",
    "sourceUrl": source_url,
  }

  if not source_url:
    return {
      **fetch_result,
      "fetchStatus": "no_source_url",
      "failureReason": "no_source_url",
      "structured": _structured_from_prior(row, source_url),
    }

  if forbidden_term:
    return {
      **fetch_result,
      "fetchStatus": "blocked_explicit",
      "failureReason": f"forbidden_url_term:{forbidden_term}",
      "structured": _structured_from_prior(row, source_url),
    }

  page_text, fetch_summary = _fetch_text(source_url, user_agent=user_agent, timeout_seconds=timeout_seconds)
  fetch_result["fetchSummary"] = fetch_summary

  if fetch_summary.get("error"):
    fetch_result["fetchStatus"] = "fetch_error"
    fetch_result["failureReason"] = fetch_summary["error"]
    fetch_result["structured"] = _structured_from_prior(row, source_url)
  elif (fetch_summary.get("httpStatus") or 0) >= 400:
    fetch_result["fetchStatus"] = "http_error"
    fetch_result["failureReason"] = f"http_status:{fetch_summary.get('httpStatus')}"
    fetch_result["structured"] = _structured_from_prior(row, source_url)
  elif _is_security_challenge(page_text):
    fetch_result["fetchStatus"] = "security_challenge"
    fetch_result["failureReason"] = "security_challenge_no_bypass"
    fetch_result["structured"] = _structured_from_prior(row, source_url)
  else:
    extracted = _extract_from_page(row, source_url, page_text, fetch_summary)
    fetch_result["fetchStatus"] = "fetched"
    fetch_result["failureReason"] = ""
    fetch_result["extracted"] = {
      "meta": extracted.get("meta"),
      "parserNotes": extracted.get("parserNotes"),
      "shadeOptionCount": len(extracted.get("shadeOptions") or []),
      "textSnippet": extracted.get("textSnippet"),
    }
    fetch_result["structured"] = extracted

  playwright_result: dict[str, Any] | None = None

  if use_playwright and _should_use_playwright(fetch_result):
    if playwright_collector is not None:
      playwright_text, playwright_summary = playwright_collector.collect(source_url)
    else:
      playwright_text, playwright_summary = _collect_with_playwright(
        source_url,
        timeout_seconds=timeout_seconds,
        user_agent=user_agent,
      )
    playwright_result = {
      "candidateId": row.get("candidateId"),
      "domain": domain,
      "playwrightSummary": playwright_summary,
      "sourceUrl": source_url,
    }

    if playwright_summary.get("error"):
      playwright_result["playwrightStatus"] = "failed"
    elif _is_security_challenge(playwright_text):
      playwright_result["playwrightStatus"] = "security_challenge"
    else:
      playwright_extracted = _extract_from_page(row, source_url, playwright_text, fetch_result.get("fetchSummary") or {})
      playwright_result["playwrightStatus"] = "rendered"
      playwright_result["extracted"] = {
        "meta": playwright_extracted.get("meta"),
        "parserNotes": playwright_extracted.get("parserNotes"),
        "shadeOptionCount": len(playwright_extracted.get("shadeOptions") or []),
        "textSnippet": playwright_extracted.get("textSnippet"),
      }

      if (
        fetch_result.get("fetchStatus") in {"security_challenge", "http_error", "fetch_error"}
        or len(playwright_extracted.get("shadeOptions") or [])
        > len((fetch_result.get("structured") or {}).get("shadeOptions") or [])
      ):
        fetch_result["structured"] = playwright_extracted
        fetch_result["fetchStatus"] = "playwright_rendered"
        fetch_result["failureReason"] = ""

  if playwright_result is not None:
    fetch_result["playwright"] = playwright_result

  fetch_result["fetchedAt"] = fetched_at

  return fetch_result


def _normalize_result(row: dict[str, Any], fetch_result: dict[str, Any], *, fetched_at: str) -> dict[str, Any]:
  source_url = _primary_source_url(row)
  domain = _domain(source_url)
  structured = fetch_result.get("structured") or _structured_from_prior(row, source_url)
  mall_name = (row.get("liveOffer") or {}).get("mallName")
  evidence: list[dict[str, Any]] = []

  for item in structured.get("evidence") or []:
    if isinstance(item, dict):
      evidence.append(item)

  if structured.get("finish"):
    evidence.append(_build_evidence("finish", structured["finish"], source_url, "structured_extraction", structured.get("textSnippet") or row.get("productName") or "", 0.65))

  if structured.get("textureType"):
    evidence.append(_build_evidence("textureType", structured["textureType"], source_url, "structured_extraction", structured.get("textSnippet") or row.get("productName") or "", 0.65))

  shade_options = structured.get("shadeOptions") or []
  product_name = structured.get("productName") or row.get("productName")
  brand = structured.get("brand") or row.get("brand")
  enough_core = bool(product_name and brand and row.get("category"))
  useful_fields = [
    structured.get("finish"),
    structured.get("textureType"),
    structured.get("colorFamily"),
    structured.get("sellingPoints"),
    structured.get("suitableFor"),
    shade_options,
  ]
  has_useful_fields = any(bool(field) for field in useful_fields)
  fetch_status = str(fetch_result.get("fetchStatus") or "")
  failure_reason = str(fetch_result.get("failureReason") or "")

  if fetch_status in {"security_challenge", "http_error", "fetch_error", "blocked_explicit", "no_source_url"}:
    collection_status = "failed"
  elif enough_core and shade_options and has_useful_fields:
    collection_status = "collected_complete"
  elif enough_core and has_useful_fields:
    collection_status = "collected_partial"
  else:
    collection_status = "failed"
    failure_reason = failure_reason or "no_useful_data"

  if collection_status != "failed":
    failure_reason = ""

  product = {
    "brand": brand,
    "candidateId": row.get("candidateId"),
    "category": row.get("category"),
    "claims": structured.get("claims") or [],
    "finish": structured.get("finish"),
    "imageUrl": structured.get("imageUrl") or (row.get("liveOffer") or {}).get("image"),
    "price": structured.get("price") or (row.get("liveOffer") or {}).get("lprice"),
    "productLine": None,
    "productName": product_name,
    "purchaseUrl": source_url,
    "sellingPoints": structured.get("sellingPoints") or [],
    "skinTypeHints": structured.get("skinTypeHints") or [],
    "sourceUrl": source_url,
    "suitableFor": structured.get("suitableFor") or [],
    "textureType": structured.get("textureType"),
  }

  return {
    "brandOrigin": _brand_origin(brand),
    "candidateId": row.get("candidateId"),
    "collectionStatus": collection_status,
    "confidence": {
      "brand": 0.75 if brand else 0,
      "detailFetch": 0.8 if fetch_status in {"fetched", "playwright_rendered"} else 0.3,
      "finish": 0.65 if structured.get("finish") else 0,
      "retailPresence": 0.8 if "oliveyoung" in domain else 0.4,
      "shadeOptions": 0.75 if shade_options else 0,
      "textureType": 0.65 if structured.get("textureType") else 0,
    },
    "domain": domain,
    "evidence": evidence[:40],
    "failureReason": failure_reason,
    "fetchedAt": fetched_at,
    "fetchStatus": fetch_status,
    "openaiStructuredExtraction": {
      "status": "skipped_missing_api_key" if not os.environ.get("OPENAI_API_KEY") else "not_invoked_in_this_runner",
      "fallback": "rule_based_structured_extraction",
    },
    "parserVersion": RUNNER_VERSION,
    "product": product,
    "retailPresence": _empty_retail_presence(domain, source_url, mall_name),
    "shadeOptions": shade_options,
    "sourceUrl": source_url,
  }


def _catalog_items(normalized_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
  items: list[dict[str, Any]] = []

  for row in normalized_rows:
    if row.get("collectionStatus") == "failed":
      continue

    product = row.get("product") or {}
    shade_options = row.get("shadeOptions") or [None]

    for option in shade_options:
      option = option if isinstance(option, dict) else {}
      shade_name = option.get("shadeName") or option.get("optionName")
      catalog_id = _candidate_key(
        str(product.get("brand") or ""),
        str(product.get("productName") or ""),
        str(product.get("category") or ""),
        str(shade_name or ""),
      )
      item = {
        "brand": product.get("brand"),
        "brandOrigin": row.get("brandOrigin"),
        "catalogItemId": f"auradin-{catalog_id}",
        "category": product.get("category"),
        "claims": product.get("claims") or [],
        "colorFamily": option.get("colorFamily"),
        "confidence": row.get("confidence") or {},
        "evidence": row.get("evidence") or [],
        "finish": option.get("finishOverride") or product.get("finish"),
        "imageUrl": product.get("imageUrl"),
        "intensity": option.get("intensity"),
        "liveOffer": {
          "fetchedAt": row.get("fetchedAt"),
          "image": product.get("imageUrl"),
          "link": product.get("purchaseUrl"),
          "lprice": product.get("price"),
          "source": "naver_shopping_partner_url",
          "ttlSeconds": 86400,
        },
        "productName": product.get("productName"),
        "purchaseUrl": product.get("purchaseUrl"),
        "retailPresence": row.get("retailPresence"),
        "sellingPoints": product.get("sellingPoints") or [],
        "shadeName": shade_name,
        "shadeNumber": option.get("shadeNumber"),
        "sourceCandidateId": row.get("candidateId"),
        "sourceUrls": [row.get("sourceUrl")],
        "suitableFor": product.get("suitableFor") or [],
        "texture": product.get("textureType"),
        "undertone": option.get("undertone"),
        "updatedAt": row.get("fetchedAt"),
      }
      items.append(item)

  return items


def _doc_text(parts: list[str]) -> str:
  return _squash(". ".join(part for part in parts if part))


def _knowledge_documents(catalog_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
  docs: list[dict[str, Any]] = []

  for item in catalog_items:
    base_meta = {
      "brand": item.get("brand"),
      "brandCountry": (item.get("brandOrigin") or {}).get("brandCountry"),
      "category": item.get("category"),
      "colorFamily": item.get("colorFamily"),
      "confidence": min((item.get("confidence") or {}).values() or [0]),
      "departmentStoreStatus": ((item.get("retailPresence") or {}).get("departmentStore") or {}).get("status"),
      "finish": item.get("finish"),
      "intensity": item.get("intensity"),
      "oliveYoungStatus": ((item.get("retailPresence") or {}).get("oliveYoung") or {}).get("status"),
      "productName": item.get("productName"),
      "sellingPoints": item.get("sellingPoints") or [],
      "shadeName": item.get("shadeName"),
      "sourceUrls": item.get("sourceUrls") or [],
      "suitableFor": item.get("suitableFor") or [],
      "texture": item.get("texture"),
      "undertone": item.get("undertone"),
    }
    doc_specs = {
      "catalog_core": _doc_text(
        [
          f"{item.get('brand')} {item.get('productName')}",
          f"카테고리 {item.get('category')}",
          f"마감 {item.get('finish')}" if item.get("finish") else "",
          f"제형 {item.get('texture')}" if item.get("texture") else "",
        ],
      ),
      "shade_profile": _doc_text(
        [
          f"호수 {item.get('shadeName')}" if item.get("shadeName") else "",
          f"색상군 {item.get('colorFamily')}" if item.get("colorFamily") else "",
          f"언더톤 {item.get('undertone')}" if item.get("undertone") else "",
          f"발색 {item.get('intensity')}" if item.get("intensity") else "",
        ],
      ),
      "finish_texture": _doc_text(
        [
          f"{item.get('productName')}의 제형은 {item.get('texture')}" if item.get("texture") else "",
          f"마감은 {item.get('finish')}" if item.get("finish") else "",
          "소구점 " + ", ".join(item.get("sellingPoints") or []) if item.get("sellingPoints") else "",
        ],
      ),
      "suitability_claims": _doc_text(
        [
          "어울리는 대상 " + ", ".join(item.get("suitableFor") or []) if item.get("suitableFor") else "",
          "클레임 " + ", ".join(item.get("claims") or []) if item.get("claims") else "",
        ],
      ),
      "retail_origin": _doc_text(
        [
          f"올리브영 입점 상태 {base_meta['oliveYoungStatus']}",
          f"백화점 입점 상태 {base_meta['departmentStoreStatus']}",
          f"브랜드 국적 {base_meta['brandCountry']}" if base_meta.get("brandCountry") else "",
        ],
      ),
    }

    for doc_type, text in doc_specs.items():
      if not text:
        continue

      docs.append(
        {
          "candidateId": item.get("sourceCandidateId"),
          "catalogItemId": item.get("catalogItemId"),
          "chunkId": f"{item.get('catalogItemId')}:{doc_type}",
          "docType": doc_type,
          "metadata": base_meta,
          "text": text[:1200],
        },
      )

  return docs


def _write_targets_csv(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  fieldnames = [
    "candidateId",
    "brand",
    "productName",
    "category",
    "domain",
    "sourceUrl",
    "phaseCStatus",
    "blockedReason",
  ]

  with path.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=fieldnames)
    writer.writeheader()

    for row in rows:
      source_url = _primary_source_url(row)
      writer.writerow(
        {
          "blockedReason": row.get("blockedReason"),
          "brand": row.get("brand"),
          "candidateId": row.get("candidateId"),
          "category": row.get("category"),
          "domain": _domain(source_url),
          "phaseCStatus": row.get("phaseCStatus"),
          "productName": row.get("productName"),
          "sourceUrl": source_url,
        },
      )


def _write_quality_csv(path: Path, normalized_rows: list[dict[str, Any]], catalog_items: list[dict[str, Any]], docs: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  total = len(normalized_rows) or 1
  fields = [
    ("rows", len(normalized_rows), 1.0),
    ("collected_complete", sum(1 for row in normalized_rows if row.get("collectionStatus") == "collected_complete"), 0),
    ("collected_partial", sum(1 for row in normalized_rows if row.get("collectionStatus") == "collected_partial"), 0),
    ("failed", sum(1 for row in normalized_rows if row.get("collectionStatus") == "failed"), 0),
    ("with_product_name", sum(1 for row in normalized_rows if (row.get("product") or {}).get("productName")), 0),
    ("with_finish", sum(1 for row in normalized_rows if (row.get("product") or {}).get("finish")), 0),
    ("with_texture", sum(1 for row in normalized_rows if (row.get("product") or {}).get("textureType")), 0),
    ("with_shade_options", sum(1 for row in normalized_rows if row.get("shadeOptions")), 0),
    ("with_oliveyoung_listed", sum(1 for row in normalized_rows if ((row.get("retailPresence") or {}).get("oliveYoung") or {}).get("status") == "listed"), 0),
    ("catalog_items", len(catalog_items), 0),
    ("embedding_documents", len(docs), 0),
  ]

  with path.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=["metric", "count", "rate"])
    writer.writeheader()

    for metric, count, preset_rate in fields:
      rate = preset_rate if metric in {"rows", "catalog_items", "embedding_documents"} else count / total
      writer.writerow({"count": count, "metric": metric, "rate": f"{rate:.4f}"})


def _write_failures_csv(path: Path, normalized_rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  fieldnames = ["candidateId", "brand", "productName", "category", "domain", "collectionStatus", "failureReason", "sourceUrl"]

  with path.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=fieldnames)
    writer.writeheader()

    for row in normalized_rows:
      if row.get("collectionStatus") != "failed":
        continue

      product = row.get("product") or {}
      writer.writerow(
        {
          "brand": product.get("brand"),
          "candidateId": row.get("candidateId"),
          "category": product.get("category"),
          "collectionStatus": row.get("collectionStatus"),
          "domain": row.get("domain"),
          "failureReason": row.get("failureReason"),
          "productName": product.get("productName"),
          "sourceUrl": row.get("sourceUrl"),
        },
      )


def _write_report(
  path: Path,
  *,
  input_path: Path,
  target_path: Path,
  fetch_path: Path,
  playwright_path: Path,
  structured_path: Path,
  normalized_path: Path,
  catalog_path: Path,
  docs_path: Path,
  quality_path: Path,
  failures_path: Path,
  normalized_rows: list[dict[str, Any]],
  catalog_items: list[dict[str, Any]],
  docs: list[dict[str, Any]],
) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  status_counts = Counter(str(row.get("collectionStatus")) for row in normalized_rows)
  fetch_counts = Counter(str(row.get("fetchStatus")) for row in normalized_rows)
  domain_counts = Counter(str(row.get("domain")) for row in normalized_rows)
  failure_counts = Counter(str(row.get("failureReason")) for row in normalized_rows if row.get("failureReason"))
  lines = [
    "# Auradin Phase D Detail Collection Summary",
    "",
    f"- Input: `{input_path}`",
    f"- Targets: `{target_path}`",
    f"- Fetch output: `{fetch_path}`",
    f"- Playwright output: `{playwright_path}`",
    f"- Structured output: `{structured_path}`",
    f"- Normalized output: `{normalized_path}`",
    f"- Catalog candidates: `{catalog_path}`",
    f"- Product knowledge documents: `{docs_path}`",
    f"- Quality CSV: `{quality_path}`",
    f"- Failures CSV: `{failures_path}`",
    f"- Target rows attempted: {len(normalized_rows)}",
    f"- Catalog item candidates: {len(catalog_items)}",
    f"- Embedding-ready documents: {len(docs)}",
    f"- OpenAI Structured Extraction: {'configured but not invoked by this offline runner' if os.environ.get('OPENAI_API_KEY') else 'skipped, OPENAI_API_KEY missing; rule-based structured fallback used'}",
    "",
    "Collection status:",
    "",
  ]
  lines.extend(f"- `{status}`: {count}" for status, count in sorted(status_counts.items()))
  lines.extend(["", "Fetch status:", ""])
  lines.extend(f"- `{status}`: {count}" for status, count in sorted(fetch_counts.items()))
  lines.extend(["", "Domain counts:", ""])
  lines.extend(f"- `{domain}`: {count}" for domain, count in sorted(domain_counts.items()))
  lines.extend(["", "Failure reasons:", ""])
  lines.extend(f"- `{reason}`: {count}" for reason, count in sorted(failure_counts.items()))
  lines.extend(
    [
      "",
      "Safety notes:",
      "",
      "- Raw HTML was parsed in memory only and was not stored.",
      "- Raw reviews were not fetched or stored.",
      "- Original product images were not downloaded.",
      "- Login, captcha, and security challenge bypass was not attempted.",
      "- Missing values were left empty instead of invented.",
    ],
  )
  path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Run Auradin Phase D detail collection for all manual_review_required rows.",
  )
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument("--input", type=Path)
  parser.add_argument("--max-items", type=int, default=0)
  parser.add_argument("--start-index", type=int, default=0)
  parser.add_argument("--progress-every", type=int, default=10)
  parser.add_argument("--checkpoint-every", type=int, default=25)
  parser.add_argument("--request-delay-seconds", type=float, default=0.5)
  parser.add_argument("--timeout-seconds", type=float, default=10.0)
  parser.add_argument("--user-agent", default=DEFAULT_USER_AGENT)
  parser.add_argument("--skip-playwright", action="store_true")

  return parser.parse_args()


def main() -> int:
  args = parse_args()
  date = args.date
  input_path = args.input or REPO_ROOT / "data" / "auradin" / "enriched" / f"enriched_products_{date}_all.jsonl"
  target_path = REPO_ROOT / "data" / "auradin" / "detail" / "targets" / f"detail_collection_targets_{date}.csv"
  fetch_path = REPO_ROOT / "data" / "auradin" / "detail" / "raw_extracted" / f"detail_fetch_results_{date}.jsonl"
  playwright_path = REPO_ROOT / "data" / "auradin" / "detail" / "raw_extracted" / f"detail_playwright_results_{date}.jsonl"
  structured_path = REPO_ROOT / "data" / "auradin" / "detail" / "structured" / f"structured_extraction_{date}.jsonl"
  normalized_path = REPO_ROOT / "data" / "auradin" / "detail" / "normalized" / f"detail_collection_results_{date}.jsonl"
  catalog_path = REPO_ROOT / "data" / "auradin" / "catalog" / f"catalog_items_candidates_{date}.jsonl"
  docs_path = REPO_ROOT / "data" / "auradin" / "embeddings" / f"product_knowledge_documents_{date}.jsonl"
  quality_path = REPO_ROOT / "reports" / "auradin" / f"detail_collection_quality_{date}.csv"
  failures_path = REPO_ROOT / "reports" / "auradin" / f"detail_collection_failures_{date}.csv"
  report_path = REPO_ROOT / "reports" / "auradin" / f"detail_collection_summary_{date}.md"
  all_rows = _read_jsonl(input_path)
  all_target_rows = [row for row in all_rows if row.get("phaseCStatus") == "manual_review_required"]

  if args.start_index < 0:
    print("--start-index must be greater than or equal to 0", file=sys.stderr)
    return 2

  if args.progress_every < 0:
    print("--progress-every must be greater than or equal to 0", file=sys.stderr)
    return 2

  if args.checkpoint_every < 0:
    print("--checkpoint-every must be greater than or equal to 0", file=sys.stderr)
    return 2

  target_rows = all_target_rows[args.start_index :]

  if args.max_items > 0:
    target_rows = target_rows[: args.max_items]

  _write_targets_csv(target_path, target_rows)

  fetch_results: list[dict[str, Any]] = []
  playwright_results: list[dict[str, Any]] = []
  normalized_rows: list[dict[str, Any]] = []

  def write_outputs() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    catalog_items = _catalog_items(normalized_rows)
    docs = _knowledge_documents(catalog_items)

    _write_jsonl(fetch_path, fetch_results)
    _write_jsonl(playwright_path, playwright_results)
    _write_jsonl(structured_path, [row.get("structured") or {} for row in fetch_results])
    _write_jsonl(normalized_path, normalized_rows)
    _write_jsonl(catalog_path, catalog_items)
    _write_jsonl(docs_path, docs)
    _write_quality_csv(quality_path, normalized_rows, catalog_items, docs)
    _write_failures_csv(failures_path, normalized_rows)
    _write_report(
      report_path,
      input_path=input_path,
      target_path=target_path,
      fetch_path=fetch_path,
      playwright_path=playwright_path,
      structured_path=structured_path,
      normalized_path=normalized_path,
      catalog_path=catalog_path,
      docs_path=docs_path,
      quality_path=quality_path,
      failures_path=failures_path,
      normalized_rows=normalized_rows,
      catalog_items=catalog_items,
      docs=docs,
    )

    return catalog_items, docs

  print(
    json.dumps(
      {
        "allManualReviewTargets": len(all_target_rows),
        "playwright": not args.skip_playwright,
        "rowsSelected": len(target_rows),
        "startIndex": args.start_index,
      },
      ensure_ascii=False,
      sort_keys=True,
    ),
    flush=True,
  )

  playwright_context = (
    nullcontext(None)
    if args.skip_playwright
    else _ReusablePlaywrightCollector(
      timeout_seconds=args.timeout_seconds,
      user_agent=args.user_agent,
    )
  )

  with playwright_context as playwright_collector:
    for index, row in enumerate(target_rows):
      if index > 0 and args.request_delay_seconds > 0:
        time.sleep(args.request_delay_seconds)

      result = _collect_target(
        row,
        fetched_at=_default_fetched_at(date),
        playwright_collector=playwright_collector,
        timeout_seconds=args.timeout_seconds,
        use_playwright=not args.skip_playwright,
        user_agent=args.user_agent,
      )
      fetch_results.append(result)

      if result.get("playwright"):
        playwright_results.append(result["playwright"])

      normalized_rows.append(
        _normalize_result(row, result, fetched_at=_default_fetched_at(date)),
      )
      completed = index + 1

      if args.progress_every > 0 and completed % args.progress_every == 0:
        print(
          json.dumps(
            {
              "completed": completed,
              "fetchStatusCounts": dict(Counter(str(item.get("fetchStatus")) for item in normalized_rows)),
              "statusCounts": dict(Counter(str(item.get("collectionStatus")) for item in normalized_rows)),
              "total": len(target_rows),
            },
            ensure_ascii=False,
            sort_keys=True,
          ),
          flush=True,
        )

      if args.checkpoint_every > 0 and completed % args.checkpoint_every == 0:
        write_outputs()

  catalog_items, docs = write_outputs()

  print(
    json.dumps(
      {
        "catalogItems": len(catalog_items),
        "documents": len(docs),
        "normalizedOutput": str(normalized_path.relative_to(REPO_ROOT)),
        "report": str(report_path.relative_to(REPO_ROOT)),
        "rowsAttempted": len(normalized_rows),
        "statusCounts": dict(Counter(str(row.get("collectionStatus")) for row in normalized_rows)),
      },
      ensure_ascii=False,
      indent=2,
      sort_keys=True,
    ),
  )

  return 0


if __name__ == "__main__":
  raise SystemExit(main())
