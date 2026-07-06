from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[1]

PARSER_VERSION = "auradin-limited-detail-v1"
HARD_FILTER_CONFIDENCE_CUTOFF = 0.65
TEXT_SNIPPET_LIMIT = 220

HIGH_VALUE_CATEGORIES = {"lip", "cheek", "shadow"}
CORE_DEMO_FIELDS = ("colorFamily", "undertone", "finish", "texture", "shadeOptions")
ACCESSORY_TITLE_MARKERS = (
  "브러쉬",
  "브러시",
  "퍼프",
  "공용기",
  "케이스",
  "파우치",
  "샤프너",
  "스펀지",
)

BRAND_COUNTRY = {
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

COUNTRY_NORMALIZATION = {
  "kr": "Korea",
  "korea": "Korea",
  "south korea": "Korea",
  "국내": "Korea",
  "국내산": "Korea",
  "대한민국": "Korea",
  "제조국:대한민국": "Korea",
  "제조국:한국": "Korea",
  "한국": "Korea",
  "china": "China",
  "중국": "China",
  "japan": "Japan",
  "일본": "Japan",
  "italy": "Italy",
  "이탈리아": "Italy",
  "france": "France",
  "프랑스": "France",
  "usa": "United States",
  "united states": "United States",
  "미국": "United States",
}

COUNTRY_REJECT_MARKERS = (
  "etc",
  "별도",
  "상세",
  "상품",
  "색상",
  "선택",
  "없음",
  "참조",
  "쿠션",
  "표기",
  "해당",
)

DEPARTMENT_DOMAIN_MARKERS = (
  "department.ssg.com",
  "hi.thehyundai.com",
  "hmall.com",
  "lotteimall.com",
  "shinsegae",
)

COLOR_RULES = {
  "pink": ("핑크", "pink", "피오니", "베이비핑크", "페탈", "petal"),
  "rose": ("로즈", "로지", "rose", "말린장미", "장미"),
  "coral": ("코랄", "coral", "살구", "파파야", "papaya", "salmon", "소프트살몬"),
  "red": ("레드", "red"),
  "orange": ("오렌지", "orange", "브릭", "brick", "탠저린", "tangerine", "홍시", "칠리", "chili"),
  "mauve": ("모브", "mauve"),
  "brown": ("브라운", "brown", "초코", "카카오", "카라멜", "토프", "도토리", "땅콩", "토스트", "toast", "tan", "hazel", "acorn", "mocha", "chestnut", "blonde", "갈색", "흑갈색"),
  "nude": ("누드", "nude", "베이지", "beige", "아이보리", "ivory", "포슬린", "porcelain", "바닐라", "vanilla", "리넨", "linen", "란제리", "lingerie", "샌드", "sand", "페어", "fair", "내추럴", "natural", "오트", "oat"),
  "peach": ("피치", "peach", "복숭아"),
  "plum": ("플럼", "plum", "베리", "berry", "와인", "포도", "그레이프", "grape", "라벤더", "lavender", "라일락", "lilac", "퍼플", "purple", "violet"),
  "black": ("블랙", "black", "흑색", "흑심", "느와르", "noir", "ebony"),
  "gray": ("그레이", "gray", "grey", "애쉬", "ash", "회갈색"),
}

UNDERTONE_RULES = {
  "warm": ("웜톤", "봄웜", "가을웜", "웜블랜딩", "웜 블랜딩", "warm", "코랄", "오렌지", "피치", "브릭", "살구", "파파야", "탠저린", "홍시", "허니", "카라멜", "샌드", "진저"),
  "cool": ("쿨톤", "여름쿨", "겨울쿨", "쿨블랜딩", "쿨 블랜딩", "cool", "모브", "플럼", "베리", "포도", "그레이프", "라벤더", "라일락", "페탈", "로지", "애쉬", "그레이"),
  "neutral": ("뉴트럴", "neutral", "누드", "베이지", "mlbb", "도토리", "땅콩", "토스트", "브라운", "아이보리", "내추럴", "포슬린", "바닐라", "리넨", "오트", "토프"),
}

FINISH_RULES = {
  "matte": ("매트", "보송", "무광", "matte"),
  "velvet": ("벨벳", "velvet", "블러", "blur"),
  "satin": ("새틴", "satin", "세미매트", "semi-matte"),
  "sheer": ("쉬어", "투명", "맑은", "sheer"),
  "shimmer": ("쉬머", "펄", "글리터", "shimmer", "glitter"),
  "glossy": ("글로우", "광택", "글로스", "glossy", "gloss", "dewy", "듀이", "물먹"),
}

TEXTURE_RULES = {
  "tint": ("틴트", "tint"),
  "balm": ("밤", "balm"),
  "lipstick": ("립스틱", "lipstick", "립 매트"),
  "gloss": ("글로스", "gloss"),
  "cream": ("크림", "cream", "컨실러", "concealer", "프라이머", "primer", "파운데이션", "foundation", "선 베이스", "선베이스"),
  "powder": ("파우더", "powder", "팔레트", "섀도우", "팩트", "블러셔", "블러쉬", "치크", "blush", "cheek", "쉐이더", "셰이더", "shader"),
  "pencil": ("펜슬", "pencil"),
  "liquid": ("리퀴드", "liquid"),
  "cushion": ("쿠션", "cushion"),
  "mascara": ("마스카라", "mascara", "브로우 카라", "brow cara", "brow mascara"),
  "liner": ("라이너", "liner", "아이라이너"),
}

INTENSITY_RULES = {
  "sheer": ("쉬어", "투명", "맑은", "자연스러운", "은은한", "데일리"),
  "medium": ("중간", "선명", "buildable"),
  "bold": ("고발색", "진한", "intense", "vivid", "딥", "볼드"),
}

SELLING_POINT_RULES = {
  "long_lasting": ("지속", "롱래스팅", "롱웨어", "픽싱", "고정", "long lasting", "lasting", "fixing", "fix"),
  "moisturizing": ("보습", "촉촉", "수분", "moistur", "hydrating"),
  "adhesion": ("밀착", "착붙", "adhesion", "fit"),
  "glow": ("광택", "글로우", "윤광", "glow", "dewy", "glass"),
  "blur": ("블러", "blur", "모공", "포어"),
  "coverage": ("커버", "coverage"),
  "waterproof": ("워터프루프", "파워프루프", "수퍼프루프", "슈퍼프루프", "프루프", "방수", "waterproof", "proof"),
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

FIELD_GROUPS = {
  "shade_options": ("shadeOptions",),
  "color_tone_intensity": ("colorFamily", "undertone", "intensity"),
  "finish_texture": ("finish", "texture"),
  "suitable_selling": ("suitableFor", "sellingPoints"),
  "live_offer": ("priceKrw", "purchaseUrl", "imageUrl"),
  "retail_presence": ("oliveYoungListed", "departmentStoreListed"),
  "brand_origin": ("brandCountry", "madeInCountry"),
}
UTC = timezone.utc


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


def _display_path(path: Path) -> str:
  try:
    return str(path.relative_to(REPO_ROOT))
  except ValueError:
    return str(path)


def _read_retail_metadata(path: Path, run_date: str) -> list[dict[str, Any]]:
  if path.is_file():
    return _read_jsonl(path)

  if path.is_dir():
    rows: list[dict[str, Any]] = []

    for file_path in sorted(path.glob(f"*_metadata_{run_date}.jsonl")):
      rows.extend(_read_jsonl(file_path))

    return rows

  return []


def _write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)

  with path.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)


def _domain(url: str | None) -> str:
  return urlparse(url or "").netloc


def _squash(value: Any) -> str:
  return re.sub(r"\s+", " ", str(value or "")).strip()


def _short(value: Any, limit: int = TEXT_SNIPPET_LIMIT) -> str:
  return _squash(value)[:limit]


def _non_empty(value: Any) -> bool:
  return value not in (None, "", [])


def _normalize_country_value(value: Any) -> str | None:
  text = _squash(value)
  text = re.sub(r"^(제조국|원산지)\s*[:：]?\s*", "", text).strip()
  text = re.split(r"[,/·|]", text)[0].strip()

  if not text:
    return None

  lowered = text.lower()
  compact = re.sub(r"\s+", "", lowered)

  if any(marker in compact for marker in COUNTRY_REJECT_MARKERS):
    return None

  return COUNTRY_NORMALIZATION.get(lowered) or COUNTRY_NORMALIZATION.get(compact) or text


def _stable_id(prefix: str, *parts: Any) -> str:
  text = "|".join(_squash(part).lower() for part in parts)
  return f"{prefix}-{hashlib.sha1(text.encode('utf-8')).hexdigest()[:16]}"


def _source_url(row: dict[str, Any], queue_row: dict[str, Any] | None = None) -> str:
  if queue_row:
    urls = queue_row.get("sourceUrls")

    if isinstance(urls, list) and urls:
      return str(urls[0])

  return str(row.get("sourceUrl") or "")


def _infer_by_rules(text: str, rules: dict[str, tuple[str, ...]]) -> str | None:
  lowered = text.lower()

  for value, markers in rules.items():
    if any(_marker_in_text(lowered, marker) for marker in markers):
      return value

  return None


def _collect_tags(text: str, rules: dict[str, tuple[str, ...]]) -> list[str]:
  lowered = text.lower()
  return [
    tag
    for tag, markers in rules.items()
    if any(_marker_in_text(lowered, marker) for marker in markers)
  ]


def _marker_in_text(lowered_text: str, marker: str) -> bool:
  lowered_marker = marker.lower()

  if lowered_marker == "블러":
    return bool(re.search(r"블러(?!쉬)", lowered_text))

  return lowered_marker in lowered_text


def _normalize_shade_name(raw: str) -> dict[str, str]:
  text = _squash(raw)
  text = re.sub(r"^\s*[-_:#]+", "", text).strip()
  shade_number = ""
  shade_name = text
  token_match = re.search(r"^([A-Za-z]?\d{1,2}[A-Za-z]?)\s+(.+)$", text)

  if token_match:
    shade_number = token_match.group(1).strip()
    shade_name = token_match.group(2).strip()

  return {
    "optionName": text,
    "shadeName": shade_name,
    "shadeNumber": shade_number,
  }


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

  if len(raw) > 30 or any(marker in lowered for marker in blocked_markers):
    return False

  if re.fullmatch(r"[A-Za-z]?\d{1,2}[A-Za-z]?", raw):
    return False

  if re.search(r"\d{1,2}\s*(g|ml|개|종|color|colors)\b", lowered):
    return False

  return bool(re.search(r"[가-힣A-Za-z]", raw))


def _clean_shade_option_name(raw: Any) -> str:
  text = _squash(raw)
  text = re.sub(r"^\s*(?:본품|리필)\s+", "", text)
  text = re.sub(r"\s*\(?(?:본품|리필)\s*\d*\)?\s*$", "", text)
  text = re.sub(r"\s+\d+\s*개\s*$", "", text)
  text = _squash(text)

  if re.search(r"(브러쉬|브러시|brush|샤프너|sharpener)", text, flags=re.I):
    return ""

  return text


def _extract_title_shade_options(text: str) -> list[dict[str, Any]]:
  options: list[dict[str, Any]] = []
  seen: set[str] = set()
  patterns = (
    r"#\s*([A-Za-z]?\d{1,2}[A-Za-z]?\s*[가-힣A-Za-z][가-힣A-Za-z0-9\s]{1,18})",
    r"(?:no\.?|호)\s*([A-Za-z]?\d{1,2}[A-Za-z]?\s*[가-힣A-Za-z][가-힣A-Za-z0-9\s]{1,18})",
    r"\b([A-Za-z]?\d{1,2}[A-Za-z]?\s+[가-힣A-Za-z][가-힣A-Za-z0-9\s]{1,18})",
  )

  for pattern in patterns:
    for match in re.finditer(pattern, text, flags=re.I):
      raw = _squash(match.group(1))

      if raw in seen or not _is_plausible_shade_option(raw):
        continue

      seen.add(raw)
      normalized = _normalize_shade_name(raw)
      options.append(
        {
          "optionName": normalized["optionName"],
          "shadeName": normalized["shadeName"] or None,
          "shadeNumber": normalized["shadeNumber"] or None,
          "colorFamily": _infer_by_rules(raw, COLOR_RULES),
          "undertone": _infer_by_rules(raw, UNDERTONE_RULES),
          "intensity": _infer_by_rules(raw, INTENSITY_RULES),
          "confidence": 0.5,
          "sourceType": "title_rule_inferred",
        },
      )

  return options[:12]


def _base_undertone_from_shade_code(text: str) -> tuple[str | None, float]:
  compact = re.sub(r"\s+", "", text.upper())

  if re.search(r"(?:^|[^A-Z0-9])(?:#?\d{1,2}C|C\d{1,2}|[A-Z]?C\d)(?:[^A-Z0-9]|$)", compact):
    return "cool", 0.68

  if re.search(r"(?:^|[^A-Z0-9])(?:#?\d{1,2}W|W\d{1,2}|[A-Z]?W\d|#?\d{1,2}Y)(?:[^A-Z0-9]|$)", compact):
    return "warm", 0.68

  if re.search(r"(?:^|[^A-Z0-9])(?:#?\d{1,2}N|N\d{1,2}|[A-Z]?N\d|#?\d{1,2}NN)(?:[^A-Z0-9]|$)", compact):
    return "neutral", 0.68

  if re.search(r"(?:^|[^A-Z0-9])(?:#?\d{1,2}P|P\d{1,2})(?:[^A-Z0-9]|$)", compact):
    return "cool", 0.64

  return None, 0


def _intensity_from_option_text(text: str) -> tuple[str | None, float]:
  lowered = text.lower()

  if any(marker in lowered for marker in ("딥", "deep", "dark", "다크", "블랙", "black", "흑색", "흑심", "진저", "ginger")):
    return "bold", 0.58

  if any(marker in lowered for marker in ("라이트", "light", "pale", "페어", "fair", "포슬린", "porcelain", "클리어", "clear", "투명")):
    return "sheer", 0.58

  if any(marker in lowered for marker in ("내추럴", "natural", "미디엄", "medium", "베이지", "beige", "리넨", "linen")):
    return "medium", 0.56

  return None, 0


def _enhance_shade_options_from_text(
  shade_options: list[dict[str, Any]],
  *,
  category: str,
) -> list[dict[str, Any]]:
  enhanced: list[dict[str, Any]] = []

  for raw_option in shade_options:
    if not isinstance(raw_option, dict):
      continue

    option = dict(raw_option)
    option_text = _squash(
      " ".join(
        str(value or "")
        for value in (
          option.get("optionName"),
          option.get("shadeName"),
          option.get("shadeNumber"),
        )
      ),
    )

    if not option_text:
      enhanced.append(option)
      continue

    if not option.get("colorFamily"):
      color_family = _infer_by_rules(option_text, COLOR_RULES)

      if color_family:
        option["colorFamily"] = color_family
        option.setdefault("colorFamilyConfidence", 0.62)

    if not option.get("undertone"):
      undertone = _infer_by_rules(option_text, UNDERTONE_RULES)
      confidence = 0.62 if undertone else 0

      if category == "base":
        code_undertone, code_confidence = _base_undertone_from_shade_code(option_text)

        if code_undertone:
          undertone = code_undertone
          confidence = code_confidence

      if undertone:
        option["undertone"] = undertone
        option.setdefault("undertoneConfidence", confidence)

    if not option.get("intensity"):
      intensity = _infer_by_rules(option_text, INTENSITY_RULES)
      confidence = 0.56 if intensity else 0

      if not intensity:
        intensity, confidence = _intensity_from_option_text(option_text)

      if intensity:
        option["intensity"] = intensity
        option.setdefault("intensityConfidence", confidence)

    enhanced.append(option)

  return enhanced


def _aggregate_from_shade_options(
  shade_options: list[dict[str, Any]],
  field: str,
) -> tuple[Any, float]:
  values = [option.get(field) for option in shade_options if isinstance(option, dict) and option.get(field)]

  if not values:
    return None, 0

  value, count = Counter(values).most_common(1)[0]
  coverage = count / max(1, len(shade_options))

  if field == "undertone":
    confidences = [
      float(option.get("undertoneConfidence") or option.get("confidence") or 0.6)
      for option in shade_options
      if option.get("undertone") == value
    ]
    return value, max(confidences or [0.6])

  if field == "intensity":
    confidences = [
      float(option.get("intensityConfidence") or 0.56)
      for option in shade_options
      if option.get("intensity") == value
    ]
    return value, max(confidences or [0.56])

  confidences = [
    float(option.get("colorFamilyConfidence") or option.get("confidence") or 0.62)
    for option in shade_options
    if option.get("colorFamily") == value
  ]
  default_confidence = 0.64 if coverage >= 0.35 else 0.6
  return value, max(confidences or [default_confidence], default=default_confidence)


def _suitable_for_from_shade_options(shade_options: list[dict[str, Any]]) -> list[str]:
  undertones = {
    str(option.get("undertone") or "")
    for option in shade_options
    if isinstance(option, dict) and option.get("undertone")
  }
  tags: list[str] = []

  if "warm" in undertones:
    tags.append("warm_tone")

  if "cool" in undertones:
    tags.append("cool_tone")

  return tags


def _title_attribute_inference_allowed(title: str) -> bool:
  lowered = title.lower()
  return not any(marker in lowered for marker in ACCESSORY_TITLE_MARKERS)


def _sanitize_detail_shade_options(options: Any) -> list[dict[str, Any]]:
  if not isinstance(options, list):
    return []

  sanitized: list[dict[str, Any]] = []

  for option in options[:24]:
    if not isinstance(option, dict):
      continue

    option_name = _clean_shade_option_name(option.get("optionName") or option.get("rawOptionText"))

    if not option_name:
      continue

    normalized = _normalize_shade_name(option_name)
    shade = {
      "optionName": normalized["optionName"],
      "shadeName": normalized["shadeName"] or option.get("shadeName"),
      "shadeNumber": normalized["shadeNumber"] or option.get("shadeNumber"),
      "colorFamily": option.get("colorFamily"),
      "undertone": option.get("undertone"),
      "intensity": option.get("intensity"),
      "finishOverride": option.get("finishOverride"),
      "recommendedToneTags": option.get("recommendedToneTags") or [],
      "confidence": 0.7,
      "sourceType": "prior_detail_option",
    }
    sanitized.append({key: value for key, value in shade.items() if _non_empty(value)})

  return sanitized


def _sanitize_metadata_shade_options(options: Any) -> list[dict[str, Any]]:
  if not isinstance(options, list):
    return []

  sanitized: list[dict[str, Any]] = []
  seen: set[str] = set()

  for option in options[:40]:
    if not isinstance(option, dict):
      continue

    option_name = _clean_shade_option_name(option.get("optionName") or option.get("shadeName") or "")
    lowered = option_name.lower()
    compact = re.sub(r"\s+", "", lowered)

    if not option_name or compact in seen:
      continue

    if option_name == "단일":
      continue

    if re.search(r"https?://|www\.|\.com|\.co\.kr|\.net|\.shop", lowered):
      continue

    if len(option_name) > 48:
      continue

    if any(marker in lowered for marker in ("배송", "리뷰", "구매", "장바구니", "로그인", "회원", "스토어", "공식몰")):
      continue

    normalized = _normalize_shade_name(option_name)
    option = dict(option)
    option["optionName"] = normalized["optionName"]

    if not _squash(option.get("shadeName")) or _squash(option.get("shadeName")) == _squash(option_name):
      option["shadeName"] = normalized["shadeName"]

    if normalized["shadeNumber"]:
      option["shadeNumber"] = normalized["shadeNumber"]

    seen.add(compact)
    sanitized.append(option)

  return sanitized


def _make_evidence(
  evidence_id: str,
  *,
  field: str,
  value: Any,
  source_type: str,
  source_url: str,
  raw_text: Any,
  confidence: float,
) -> dict[str, Any]:
  return {
    "confidence": confidence,
    "field": field,
    "id": evidence_id,
    "rawText": _short(raw_text),
    "sourceType": source_type,
    "sourceUrl": source_url,
    "value": value,
  }


def _append_evidence(
  evidence: list[dict[str, Any]],
  *,
  field: str,
  value: Any,
  source_type: str,
  source_url: str,
  raw_text: Any,
  confidence: float,
) -> str:
  evidence_id = f"ev{len(evidence) + 1:03d}"
  evidence.append(
    _make_evidence(
      evidence_id,
      field=field,
      value=value,
      source_type=source_type,
      source_url=source_url,
      raw_text=raw_text,
      confidence=confidence,
    ),
  )
  return evidence_id


def _detail_evidence_for_field(detail: dict[str, Any] | None, field: str) -> list[dict[str, Any]]:
  if not detail:
    return []

  aliases = {
    "texture": {"texture", "textureType"},
    "priceKrw": {"price", "priceKrw"},
    "purchaseUrl": {"sourceUrl", "purchaseUrl"},
  }.get(field, {field})

  evidence = detail.get("evidence")

  if not isinstance(evidence, list):
    return []

  return [
    item
    for item in evidence
    if isinstance(item, dict) and str(item.get("field") or "") in aliases
  ]


def _detail_confidence(detail: dict[str, Any] | None, field: str) -> float:
  if not detail or not isinstance(detail.get("confidence"), dict):
    return 0

  confidence = detail["confidence"]
  aliases = {
    "texture": ("texture", "textureType"),
    "shadeOptions": ("shadeOptions",),
    "finish": ("finish",),
    "brandCountry": ("brand",),
    "retailPresence": ("retailPresence",),
  }.get(field, (field,))

  values = [
    float(confidence.get(alias) or 0)
    for alias in aliases
    if isinstance(confidence.get(alias), (int, float))
  ]
  return max(values) if values else 0


def _field_payload(
  *,
  value: Any,
  confidence: float,
  status: str,
  evidence_ids: list[str],
  source_types: list[str],
  failure_reason: str = "",
) -> dict[str, Any]:
  usable = _non_empty(value) and confidence >= HARD_FILTER_CONFIDENCE_CUTOFF
  return {
    "confidence": round(confidence, 2),
    "evidenceIds": evidence_ids,
    "failureReason": failure_reason,
    "hardFilterEligible": usable,
    "sourceTypes": sorted(set(source_types)),
    "status": status,
    "value": value,
  }


def _missing_core_count(row: dict[str, Any]) -> int:
  missing = 0

  for field in CORE_DEMO_FIELDS:
    value = row.get(field)

    if field == "shadeOptions":
      value = row.get("shadeOptions") or []

    if not _non_empty(value):
      missing += 1

  return missing


def _priority_score(row: dict[str, Any]) -> float:
  category = str(row.get("category") or "")
  rank = int(row.get("rankInBrandCategory") or 999)
  category_score = {"lip": 100, "cheek": 85, "shadow": 85, "base": 45, "liner": 30, "brow": 25}.get(category, 0)
  rank_score = max(0, 11 - rank) * 4
  missing_score = _missing_core_count(row) * 7
  status_score = {"collected_complete": 12, "collected_partial": 10, "failed": 4, "not_attempted": 2}.get(
    str(row.get("detailCollectionStatus") or ""),
    0,
  )
  return round(category_score + rank_score + missing_score + status_score + float(row.get("popularityScore") or 0) / 20, 2)


def _selected_for_batch(
  row: dict[str, Any],
  batch_rank_limit: int,
  *,
  selected_categories: set[str],
  min_missing_core: int,
) -> bool:
  return (
    str(row.get("category") or "") in selected_categories
    and int(row.get("rankInBrandCategory") or 999) <= batch_rank_limit
    and _missing_core_count(row) >= min_missing_core
  )


def _source_strategy(row: dict[str, Any]) -> str:
  status = str(row.get("detailCollectionStatus") or "")
  fetch_status = str(row.get("fetchStatus") or "")
  domain = str(row.get("domain") or "")

  if status in {"collected_complete", "collected_partial"}:
    return "prior_detail_adapter"

  if fetch_status in {"http_error", "security_challenge"} or str(row.get("detailFailureReason") or "").startswith("http_status:403"):
    return "do_not_retry_generic_fetch_manual_review"

  if "oliveyoung" in domain:
    return "oliveyoung_presence_from_live_offer_manual_detail_needed"

  return "naver_live_offer_title_rule_adapter"


def _blocked_or_not_found_status(row: dict[str, Any]) -> tuple[str, str]:
  source_url = str(row.get("sourceUrl") or "")
  detail_status = str(row.get("detailCollectionStatus") or "")
  fetch_status = str(row.get("fetchStatus") or "")
  failure = str(row.get("detailFailureReason") or "")

  if not source_url:
    return "not_found", "no_source_url"

  if fetch_status in {"http_error", "security_challenge"} or failure.startswith("http_status:403"):
    return "blocked", failure or fetch_status

  if detail_status == "not_attempted":
    return "manual_review_needed", "detail_not_attempted"

  if detail_status == "failed":
    return "not_found", failure or "no_useful_data"

  return "not_found", "no_field_evidence"


def _official_field(official: dict[str, Any] | None, field: str) -> dict[str, Any] | None:
  if not official:
    return None

  fields = official.get("fields")

  if not isinstance(fields, dict):
    return None

  payload = fields.get(field)

  if not isinstance(payload, dict) or not _non_empty(payload.get("value")):
    return None

  return payload


def _adjusted_metadata_confidence(
  payload: dict[str, Any] | None,
  *,
  match_score: float | None = None,
) -> float:
  if not payload:
    return 0

  confidence = float(payload.get("confidence") or 0)

  if match_score is not None and match_score < 0.6:
    confidence = min(confidence, 0.6)

  return confidence


def _payload_value_strength(payload: dict[str, Any] | None) -> int:
  if not payload:
    return 0

  value = payload.get("value")

  if isinstance(value, list):
    return len(value)

  return 1 if _non_empty(value) else 0


def _metadata_payload_rank(payload: dict[str, Any] | None) -> tuple[float, int]:
  if not payload:
    return (0, 0)

  return (float(payload.get("confidence") or 0), _payload_value_strength(payload))


def _merge_metadata_rows_by_candidate(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
  merged_by_id: dict[str, dict[str, Any]] = {}

  for row in rows:
    candidate_id = str(row.get("candidateId") or "")

    if not candidate_id or not isinstance(row.get("fields"), dict) or not row.get("fields"):
      continue

    merged = merged_by_id.setdefault(
      candidate_id,
      {
        "brand": row.get("brand"),
        "candidateId": candidate_id,
        "category": row.get("category"),
        "collectionStatus": "not_collected",
        "fields": {},
        "metadataSourceRows": 0,
        "productName": row.get("productName"),
      },
    )
    merged["metadataSourceRows"] = int(merged.get("metadataSourceRows") or 0) + 1
    merged["collectionStatus"] = "collected_partial"

    for key in (
      "officialSourceUrl",
      "retailSourceUrl",
      "oliveYoungSourceUrl",
      "lotteOnSourceUrl",
      "matchScore",
    ):
      if not _non_empty(merged.get(key)) and _non_empty(row.get(key)):
        merged[key] = row.get(key)

    fields = merged.setdefault("fields", {})

    for field, payload in row.get("fields", {}).items():
      if not isinstance(payload, dict) or not _non_empty(payload.get("value")):
        continue

      current_payload = fields.get(field)

      if not current_payload or _metadata_payload_rank(payload) > _metadata_payload_rank(current_payload):
        fields[field] = payload

  return merged_by_id


def _best_metadata_field(
  official: dict[str, Any] | None,
  retail: dict[str, Any] | None,
  field: str,
) -> tuple[dict[str, Any] | None, float | None]:
  official_payload = _official_field(official, field)
  retail_payload = _official_field(retail, field)
  official_match_score = float(official.get("matchScore") or 0) if official_payload and official else None
  candidates = [
    (
      _adjusted_metadata_confidence(official_payload, match_score=official_match_score),
      _payload_value_strength(official_payload),
      1,
      official_payload,
      official_match_score,
    ),
    (
      _adjusted_metadata_confidence(retail_payload),
      _payload_value_strength(retail_payload),
      0,
      retail_payload,
      None,
    ),
  ]
  candidates = [candidate for candidate in candidates if candidate[3]]

  if not candidates:
    return None, None

  best = max(candidates, key=lambda candidate: (candidate[0], candidate[1], candidate[2]))
  return best[3], best[4]


def _append_official_evidence(
  evidence: list[dict[str, Any]],
  *,
  field: str,
  payload: dict[str, Any],
  match_score: float | None = None,
) -> tuple[list[str], list[str], float, Any]:
  confidence = float(payload.get("confidence") or 0)

  if match_score is not None and match_score < 0.6:
    confidence = min(confidence, 0.6)

  value = payload.get("value")
  source_type = str(payload.get("sourceType") or "official_brand_page")
  source_url = str(payload.get("sourceUrl") or "")
  evidence_id = _append_evidence(
    evidence,
    field=field,
    value=value,
    source_type=source_type,
    source_url=source_url,
    raw_text=payload.get("rawText") or value,
    confidence=confidence,
  )
  return [evidence_id], [source_type], confidence, value


def _build_targets(
  snapshot_rows: list[dict[str, Any]],
  *,
  batch_rank_limit: int,
  selected_categories: set[str],
  min_missing_core: int,
) -> list[dict[str, Any]]:
  targets = []

  for row in sorted(snapshot_rows, key=lambda item: (-_priority_score(item), str(item.get("brand")), str(item.get("category")), int(item.get("rankInBrandCategory") or 999))):
    missing_groups = []

    if not row.get("shadeOptions"):
      missing_groups.append("shade_options")

    if not (row.get("colorFamily") and row.get("undertone") and row.get("intensity")):
      missing_groups.append("color_tone_intensity")

    if not (row.get("finish") and row.get("texture")):
      missing_groups.append("finish_texture")

    if not (row.get("suitableFor") and row.get("sellingPoints")):
      missing_groups.append("suitable_selling")

    if row.get("oliveYoungStatus") == "unknown" and row.get("departmentStoreStatus") == "unknown":
      missing_groups.append("retail_presence")

    targets.append(
      {
        "brand": row.get("brand"),
        "candidateId": row.get("candidateId"),
        "category": row.get("category"),
        "detailCollectionStatus": row.get("detailCollectionStatus"),
        "domain": row.get("domain"),
        "fetchStatus": row.get("fetchStatus"),
        "missingCoreFieldCount": _missing_core_count(row),
        "missingFieldGroups": "|".join(missing_groups),
        "priorityScore": _priority_score(row),
        "productName": row.get("productName"),
        "rankInBrandCategory": row.get("rankInBrandCategory"),
        "selectedForBatch": "yes"
        if _selected_for_batch(
          row,
          batch_rank_limit,
          selected_categories=selected_categories,
          min_missing_core=min_missing_core,
        )
        else "no",
        "sourceStrategy": _source_strategy(row),
        "sourceUrl": row.get("sourceUrl"),
      },
    )

  return targets


def _build_field_results(
  row: dict[str, Any],
  queue_row: dict[str, Any] | None,
  detail: dict[str, Any] | None,
  official: dict[str, Any] | None,
  retail: dict[str, Any] | None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
  evidence: list[dict[str, Any]] = []
  fields: dict[str, Any] = {}
  source_url = _source_url(row, queue_row)
  product_name = str(row.get("productName") or "")
  title_text = _squash(f"{row.get('brand') or ''} {product_name}")
  detail_product = detail.get("product") if isinstance(detail, dict) else {}
  detail_product = detail_product if isinstance(detail_product, dict) else {}
  live_offer = queue_row.get("liveOffer") if isinstance(queue_row, dict) and isinstance(queue_row.get("liveOffer"), dict) else {}
  live_offer = live_offer or {
    "image": row.get("imageUrl"),
    "link": row.get("sourceUrl"),
    "lprice": row.get("price"),
    "mallName": row.get("mallName"),
    "source": "top10_snapshot",
  }
  allow_title_inference = _title_attribute_inference_allowed(product_name)

  def from_detail_or_title(field: str, rules: dict[str, tuple[str, ...]], title_confidence: float) -> tuple[Any, float, list[str], list[str], str]:
    metadata_payload, metadata_match_score = _best_metadata_field(official, retail, field)

    if metadata_payload:
      evidence_ids, source_types, confidence, value = _append_official_evidence(
        evidence,
        field=field,
        payload=metadata_payload,
        match_score=metadata_match_score,
      )
      return value, confidence, evidence_ids, source_types, "collected"

    value = detail_product.get(field)
    detail_conf = _detail_confidence(detail, field)
    detail_evidence = _detail_evidence_for_field(detail, field)
    evidence_ids: list[str] = []
    source_types: list[str] = []

    if _non_empty(value):
      confidence = detail_conf or 0.65

      for item in detail_evidence[:3]:
        evidence_ids.append(
          _append_evidence(
            evidence,
            field=field,
            value=value,
            source_type=str(item.get("sourceType") or "prior_detail"),
            source_url=str(item.get("sourceUrl") or source_url),
            raw_text=item.get("rawText") or product_name,
            confidence=float(item.get("confidence") or confidence),
          ),
        )
        source_types.append(str(item.get("sourceType") or "prior_detail"))

      if not evidence_ids:
        evidence_ids.append(
          _append_evidence(
            evidence,
            field=field,
            value=value,
            source_type="prior_detail",
            source_url=source_url,
            raw_text=product_name,
            confidence=confidence,
          ),
        )
        source_types.append("prior_detail")

      return value, confidence, evidence_ids, source_types, "collected"

    if not allow_title_inference:
      status, reason = _blocked_or_not_found_status(row)
      return None, 0, [], [], status if status != "manual_review_needed" else "missing"

    value = row.get(field)

    if not _non_empty(value):
      value = _infer_by_rules(title_text, rules)

    if _non_empty(value):
      evidence_ids.append(
        _append_evidence(
          evidence,
          field=field,
          value=value,
          source_type="title_rule_inferred",
          source_url=source_url,
          raw_text=product_name,
          confidence=title_confidence,
        ),
      )
      source_types.append("title_rule_inferred")
      return value, title_confidence, evidence_ids, source_types, "inferred"

    status, reason = _blocked_or_not_found_status(row)
    return None, 0, [], [], status if status != "manual_review_needed" else "missing"

  metadata_shades, metadata_shades_match_score = _best_metadata_field(official, retail, "shadeOptions")
  shade_options = metadata_shades.get("value") if metadata_shades else []
  shade_options = _sanitize_metadata_shade_options(shade_options)

  if metadata_shades and shade_options:
    metadata_shades = dict(metadata_shades)
    metadata_shades["value"] = shade_options
    metadata_shades["rawText"] = ", ".join(str(option.get("optionName") or "") for option in shade_options[:24])
  elif metadata_shades and not shade_options:
    metadata_shades = None

  shade_confidence = float((metadata_shades or {}).get("confidence") or 0)
  shade_evidence_ids: list[str] = []
  shade_source_types: list[str] = []

  if shade_options:
    shade_evidence_ids, shade_source_types, shade_confidence, shade_options = _append_official_evidence(
      evidence,
      field="shadeOptions",
      payload=metadata_shades or {},
      match_score=metadata_shades_match_score,
    )
    shade_status = "collected"
  else:
    shade_options = _sanitize_detail_shade_options(detail.get("shadeOptions") if isinstance(detail, dict) else [])
    shade_confidence = _detail_confidence(detail, "shadeOptions") or (0.7 if shade_options else 0)

  if shade_options and not shade_evidence_ids:
    shade_evidence_ids.append(
      _append_evidence(
        evidence,
        field="shadeOptions",
        value=len(shade_options),
        source_type="prior_detail_option",
        source_url=source_url,
        raw_text=", ".join(str(item.get("optionName") or "") for item in shade_options[:8]),
        confidence=shade_confidence,
      ),
    )
    shade_source_types.append("prior_detail_option")
    shade_status = "collected"
  elif not shade_options:
    shade_options = _extract_title_shade_options(title_text) if allow_title_inference else []

    if shade_options:
      shade_confidence = 0.5
      shade_evidence_ids.append(
        _append_evidence(
          evidence,
          field="shadeOptions",
          value=len(shade_options),
          source_type="title_rule_inferred",
          source_url=source_url,
          raw_text=product_name,
          confidence=shade_confidence,
        ),
      )
      shade_source_types.append("title_rule_inferred")
      shade_status = "inferred"
    else:
      shade_status, _ = _blocked_or_not_found_status(row)
      shade_confidence = 0

  shade_options = _enhance_shade_options_from_text(
    shade_options,
    category=str(row.get("category") or ""),
  )

  fields["shadeOptions"] = _field_payload(
    value=shade_options,
    confidence=shade_confidence,
    status=shade_status,
    evidence_ids=shade_evidence_ids,
    source_types=shade_source_types,
  )

  for field, rules, title_confidence in (
    ("colorFamily", COLOR_RULES, 0.52),
    ("undertone", UNDERTONE_RULES, 0.5),
    ("finish", FINISH_RULES, 0.58),
    ("texture", TEXTURE_RULES, 0.58),
    ("intensity", INTENSITY_RULES, 0.5),
  ):
    value, confidence, evidence_ids, source_types, status = from_detail_or_title(field, rules, title_confidence)
    fields[field] = _field_payload(
      value=value,
      confidence=confidence,
      status=status,
      evidence_ids=evidence_ids,
      source_types=source_types,
    )

  for option_field in ("colorFamily", "undertone", "intensity"):
    if _non_empty(fields[option_field]["value"]) or not shade_options:
      continue

    value, confidence = _aggregate_from_shade_options(shade_options, option_field)

    if value:
      evidence_id = _append_evidence(
        evidence,
        field=option_field,
        value=value,
        source_type="shade_option_text_inferred",
        source_url=source_url,
        raw_text=", ".join(str(item.get("optionName") or "") for item in shade_options[:8]),
        confidence=confidence,
      )
      fields[option_field] = _field_payload(
        value=value,
        confidence=confidence,
        status="inferred",
        evidence_ids=[evidence_id],
        source_types=["shade_option_text_inferred"],
      )

  for field, rules in (("sellingPoints", SELLING_POINT_RULES), ("suitableFor", SUITABLE_FOR_RULES)):
    metadata_payload, metadata_match_score = _best_metadata_field(official, retail, field)

    if metadata_payload:
      evidence_ids, source_types, confidence, value = _append_official_evidence(
        evidence,
        field=field,
        payload=metadata_payload,
        match_score=metadata_match_score,
      )
      fields[field] = _field_payload(
        value=value,
        confidence=confidence,
        status="collected",
        evidence_ids=evidence_ids,
        source_types=source_types,
      )
      continue

    detail_value = detail_product.get(field)
    title_value = _collect_tags(title_text, rules) if allow_title_inference else []

    if _non_empty(detail_value):
      confidence = 0.65
      evidence_id = _append_evidence(
        evidence,
        field=field,
        value=detail_value,
        source_type="prior_detail",
        source_url=source_url,
        raw_text=product_name,
        confidence=confidence,
      )
      fields[field] = _field_payload(
        value=detail_value,
        confidence=confidence,
        status="collected",
        evidence_ids=[evidence_id],
        source_types=["prior_detail"],
      )
    elif title_value:
      confidence = 0.5
      evidence_id = _append_evidence(
        evidence,
        field=field,
        value=title_value,
        source_type="title_rule_inferred",
        source_url=source_url,
        raw_text=product_name,
        confidence=confidence,
      )
      fields[field] = _field_payload(
        value=title_value,
        confidence=confidence,
        status="inferred",
        evidence_ids=[evidence_id],
        source_types=["title_rule_inferred"],
      )
    else:
      status, reason = _blocked_or_not_found_status(row)
      fields[field] = _field_payload(
        value=[],
        confidence=0,
        status=status if status != "manual_review_needed" else "missing",
        evidence_ids=[],
        source_types=[],
        failure_reason=reason,
      )

  if not _non_empty(fields["suitableFor"]["value"]):
    shade_tone_tags = _suitable_for_from_shade_options(shade_options)

    if shade_tone_tags:
      evidence_id = _append_evidence(
        evidence,
        field="suitableFor",
        value=shade_tone_tags,
        source_type="shade_option_tone_inferred",
        source_url=source_url,
        raw_text=", ".join(str(item.get("optionName") or "") for item in shade_options[:12]),
        confidence=0.58,
      )
      fields["suitableFor"] = _field_payload(
        value=shade_tone_tags,
        confidence=0.58,
        status="inferred",
        evidence_ids=[evidence_id],
        source_types=["shade_option_tone_inferred"],
      )

  price = live_offer.get("lprice") or row.get("price")
  purchase_url = live_offer.get("link") or source_url
  image_url = live_offer.get("image") or row.get("imageUrl")

  for field, value in (("priceKrw", price), ("purchaseUrl", purchase_url), ("imageUrl", image_url)):
    evidence_id = ""

    if _non_empty(value):
      evidence_id = _append_evidence(
        evidence,
        field=field,
        value=value,
        source_type="naver_live_offer",
        source_url=purchase_url,
        raw_text=value,
        confidence=0.8,
      )

    fields[field] = _field_payload(
      value=value,
      confidence=0.8 if _non_empty(value) else 0,
      status="collected" if _non_empty(value) else "not_found",
      evidence_ids=[evidence_id] if evidence_id else [],
      source_types=["naver_live_offer"] if evidence_id else [],
    )

  domain = _domain(purchase_url)
  mall_name = str(live_offer.get("mallName") or row.get("mallName") or "")
  olive_listed = row.get("oliveYoungStatus") == "listed" or "oliveyoung" in domain or mall_name == "올리브영"
  department_listed = row.get("departmentStoreStatus") == "listed" or any(marker in domain for marker in DEPARTMENT_DOMAIN_MARKERS)

  for field, listed, status_name in (
    ("oliveYoungListed", olive_listed, row.get("oliveYoungStatus")),
    ("departmentStoreListed", department_listed, row.get("departmentStoreStatus")),
  ):
    retail_payload = _official_field(retail, field)

    if retail_payload:
      evidence_ids, source_types, confidence, value = _append_official_evidence(
        evidence,
        field=field,
        payload=retail_payload,
      )
      fields[field] = _field_payload(
        value=value,
        confidence=confidence,
        status="collected",
        evidence_ids=evidence_ids,
        source_types=source_types,
      )
      continue

    status = "collected" if listed else "unknown"
    confidence = 0.8 if listed else 0
    evidence_ids = []
    source_types = []

    if listed:
      evidence_ids.append(
        _append_evidence(
          evidence,
          field=field,
          value=True,
          source_type="retail_presence_from_live_offer",
          source_url=purchase_url,
          raw_text=f"domain={domain}; mallName={mall_name}; status={status_name}",
          confidence=confidence,
        ),
      )
      source_types.append("retail_presence_from_live_offer")

    fields[field] = _field_payload(
      value=True if listed else None,
      confidence=confidence,
      status=status,
      evidence_ids=evidence_ids,
      source_types=source_types,
      failure_reason="" if listed else "no_positive_listing_evidence",
    )

  brand = str(row.get("brand") or "")
  brand_country = ((detail or {}).get("brandOrigin") or {}).get("brandCountry") or row.get("brandCountry") or BRAND_COUNTRY.get(brand)
  made_in_country_payload, made_in_country_match_score = _best_metadata_field(official, retail, "madeInCountry")
  made_in_country = ((detail or {}).get("brandOrigin") or {}).get("madeInCountry")

  if brand_country:
    evidence_id = _append_evidence(
      evidence,
      field="brandCountry",
      value=brand_country,
      source_type="brand_whitelist_config",
      source_url="AURADIN_PRODUCT_CATALOG_CRAWLING_PLAN_KO.md",
      raw_text=f"{brand} configured brand country",
      confidence=0.7,
    )
    fields["brandCountry"] = _field_payload(
      value=brand_country,
      confidence=0.7,
      status="collected",
      evidence_ids=[evidence_id],
      source_types=["brand_whitelist_config"],
    )
  else:
    fields["brandCountry"] = _field_payload(
      value=None,
      confidence=0,
      status="not_found",
      evidence_ids=[],
      source_types=[],
      failure_reason="brand_not_in_config",
    )

  if made_in_country_payload:
    made_in_country_value = _normalize_country_value(made_in_country_payload.get("value"))

    if made_in_country_value:
      made_in_country_payload = dict(made_in_country_payload)
      made_in_country_payload["value"] = made_in_country_value
    else:
      made_in_country_payload = None

  if made_in_country:
    made_in_country = _normalize_country_value(made_in_country)

  if made_in_country_payload:
    evidence_ids, source_types, confidence, value = _append_official_evidence(
      evidence,
      field="madeInCountry",
      payload=made_in_country_payload,
      match_score=made_in_country_match_score,
    )
    fields["madeInCountry"] = _field_payload(
      value=value,
      confidence=confidence,
      status="collected",
      evidence_ids=evidence_ids,
      source_types=source_types,
    )
  elif made_in_country:
    evidence_id = _append_evidence(
      evidence,
      field="madeInCountry",
      value=made_in_country,
      source_type="prior_detail",
      source_url=source_url,
      raw_text=product_name,
      confidence=0.65,
    )
    fields["madeInCountry"] = _field_payload(
      value=made_in_country,
      confidence=0.65,
      status="collected",
      evidence_ids=[evidence_id],
      source_types=["prior_detail"],
    )
  else:
    fields["madeInCountry"] = _field_payload(
      value=None,
      confidence=0,
      status="not_found",
      evidence_ids=[],
      source_types=[],
      failure_reason="no_manufacturing_country_evidence",
    )

  return fields, evidence


def _group_status(fields: dict[str, Any], group_fields: tuple[str, ...]) -> dict[str, Any]:
  filled = [field for field in group_fields if _non_empty(fields.get(field, {}).get("value"))]
  hard_eligible = [
    field
    for field in group_fields
    if bool(fields.get(field, {}).get("hardFilterEligible"))
  ]
  statuses = Counter(str(fields.get(field, {}).get("status") or "missing") for field in group_fields)

  if len(filled) == len(group_fields):
    status = "complete"
  elif filled:
    status = "partial"
  elif statuses.get("blocked"):
    status = "blocked"
  elif statuses.get("not_found"):
    status = "not_found"
  else:
    status = "missing"

  return {
    "filledFields": filled,
    "hardFilterEligibleFields": hard_eligible,
    "status": status,
  }


def _row_collection_status(fields: dict[str, Any], row: dict[str, Any]) -> str:
  groups = {_name: _group_status(fields, group_fields) for _name, group_fields in FIELD_GROUPS.items()}
  statuses = Counter(group["status"] for group in groups.values())

  if statuses.get("complete") == len(groups):
    return "complete"

  if statuses.get("complete") or statuses.get("partial"):
    return "partial"

  status, _ = _blocked_or_not_found_status(row)
  return status


def _build_limited_results(
  snapshot_rows: list[dict[str, Any]],
  queue_rows: list[dict[str, Any]],
  detail_rows: list[dict[str, Any]],
  official_rows: list[dict[str, Any]],
  retail_rows: list[dict[str, Any]],
  *,
  batch_rank_limit: int,
  selected_categories: set[str],
  min_missing_core: int,
  fetched_at: str,
) -> list[dict[str, Any]]:
  queue_by_id = {str(row.get("candidateId") or ""): row for row in queue_rows}
  detail_by_id = {str(row.get("candidateId") or ""): row for row in detail_rows}
  official_by_id = _merge_metadata_rows_by_candidate(official_rows)
  retail_by_id = _merge_metadata_rows_by_candidate(retail_rows)
  selected_rows = [
    row
    for row in snapshot_rows
    if _selected_for_batch(
      row,
      batch_rank_limit,
      selected_categories=selected_categories,
      min_missing_core=min_missing_core,
    )
  ]
  results: list[dict[str, Any]] = []

  for row in sorted(selected_rows, key=lambda item: (str(item.get("brand")), str(item.get("category")), int(item.get("rankInBrandCategory") or 999))):
    candidate_id = str(row.get("candidateId") or "")
    queue_row = queue_by_id.get(candidate_id)
    detail = detail_by_id.get(candidate_id)
    official = official_by_id.get(candidate_id)
    retail = retail_by_id.get(candidate_id)
    fields, evidence = _build_field_results(row, queue_row, detail, official, retail)
    field_groups = {
      group: _group_status(fields, group_fields)
      for group, group_fields in FIELD_GROUPS.items()
    }
    hard_filter_blocked = sorted(
      field
      for field, payload in fields.items()
      if field
      in {
        "shadeOptions",
        "colorFamily",
        "undertone",
        "finish",
        "texture",
        "intensity",
        "suitableFor",
        "sellingPoints",
      }
      and _non_empty(payload.get("value"))
      and not payload.get("hardFilterEligible")
    )
    missing_core = sorted(
      field
      for field in CORE_DEMO_FIELDS
      if not _non_empty(fields.get(field, {}).get("value"))
    )
    status, failure = _blocked_or_not_found_status(row)

    results.append(
      {
        "brand": row.get("brand"),
        "candidateId": candidate_id,
        "category": row.get("category"),
        "collectionStatus": _row_collection_status(fields, row),
        "detailSourceStatus": {
          "detailCollectionStatus": row.get("detailCollectionStatus"),
          "detailFailureReason": row.get("detailFailureReason"),
          "domain": row.get("domain"),
          "fetchStatus": row.get("fetchStatus"),
          "priorFailureClass": status,
          "priorFailureReason": failure,
          "sourceStrategy": _source_strategy(row),
          "sourceUrl": row.get("sourceUrl"),
          "officialMetadataStatus": (official or {}).get("collectionStatus") or "not_collected",
          "officialSourceUrl": (official or {}).get("officialSourceUrl"),
          "officialMatchScore": (official or {}).get("matchScore"),
          "retailMetadataStatus": (retail or {}).get("collectionStatus") or "not_collected",
          "retailSourceUrl": (retail or {}).get("oliveYoungSourceUrl")
          or (retail or {}).get("lotteOnSourceUrl")
          or (retail or {}).get("retailSourceUrl"),
          "titleAttributeInference": "allowed"
          if _title_attribute_inference_allowed(str(row.get("productName") or ""))
          else "suppressed_accessory_title",
        },
        "evidence": evidence,
        "fetchedAt": fetched_at,
        "fieldGroups": field_groups,
        "fields": fields,
        "hardFilterBlockedFields": hard_filter_blocked,
        "manualReview": {
          "needed": bool(missing_core),
          "reason": "missing_core_demo_fields" if missing_core else "",
          "targetFields": missing_core,
        },
        "parserVersion": PARSER_VERSION,
        "priorityScore": _priority_score(row),
        "productName": row.get("productName"),
        "rankInBrandCategory": row.get("rankInBrandCategory"),
        "sourceGrain": "naver_brand_category_top10_candidate",
      },
    )

  return results


def _price_tier(price: Any) -> str | None:
  if not isinstance(price, int):
    return None

  if price < 15000:
    return "under_15k"

  if price < 25000:
    return "15k_25k"

  if price < 40000:
    return "25k_40k"

  return "over_40k"


def _catalog_items(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
  items = []

  for result in results:
    fields = result["fields"]
    catalog_item_id = _stable_id("auradin-seed", result.get("candidateId"), result.get("productName"))
    confidence = {
      field: payload.get("confidence")
      for field, payload in fields.items()
      if field
      in {
        "shadeOptions",
        "colorFamily",
        "undertone",
        "finish",
        "texture",
        "intensity",
        "suitableFor",
        "sellingPoints",
        "priceKrw",
        "purchaseUrl",
        "imageUrl",
        "oliveYoungListed",
        "departmentStoreListed",
        "brandCountry",
        "madeInCountry",
      }
    }
    hard_filter_eligible = {
      field: bool(payload.get("hardFilterEligible"))
      for field, payload in fields.items()
      if field
      in {
        "shadeOptions",
        "colorFamily",
        "undertone",
        "finish",
        "texture",
        "intensity",
        "suitableFor",
        "sellingPoints",
        "brandCountry",
        "madeInCountry",
      }
    }

    for retail_field in ("oliveYoungListed", "departmentStoreListed"):
      if bool(fields.get(retail_field, {}).get("hardFilterEligible")):
        hard_filter_eligible[retail_field] = True
    price = fields["priceKrw"]["value"]

    items.append(
      {
        "attributeConfidence": confidence,
        "attributes": {
          "colorFamily": fields["colorFamily"]["value"],
          "finish": fields["finish"]["value"],
          "intensity": fields["intensity"]["value"],
          "sellingPoints": fields["sellingPoints"]["value"] or [],
          "suitableFor": fields["suitableFor"]["value"] or [],
          "texture": fields["texture"]["value"],
          "undertone": fields["undertone"]["value"],
        },
        "brandName": result.get("brand"),
        "brandOrigin": {
          "brandCountry": fields["brandCountry"]["value"],
          "madeInCountry": fields["madeInCountry"]["value"],
        },
        "catalogItemId": catalog_item_id,
        "category": result.get("category"),
        "collectionStatus": result.get("collectionStatus"),
        "evidence": [
          {
            "confidence": ev.get("confidence"),
            "field": ev.get("field"),
            "id": ev.get("id"),
            "sourceType": ev.get("sourceType"),
            "sourceUrl": ev.get("sourceUrl"),
            "value": ev.get("value"),
          }
          for ev in result.get("evidence", [])
        ],
        "hardFilterEligible": hard_filter_eligible,
        "liveOffer": {
          "imageUrl": fields["imageUrl"]["value"],
          "priceKrw": price,
          "priceTier": _price_tier(price),
          "purchaseUrl": fields["purchaseUrl"]["value"],
        },
        "parserVersion": PARSER_VERSION,
        "productName": result.get("productName"),
        "productPrecision": "product",
        "retailPresence": {
          "departmentStore": {
            "confidence": fields["departmentStoreListed"]["confidence"],
            "listed": fields["departmentStoreListed"]["value"],
            "status": fields["departmentStoreListed"]["status"],
          },
          "oliveYoung": {
            "confidence": fields["oliveYoungListed"]["confidence"],
            "listed": fields["oliveYoungListed"]["value"],
            "status": fields["oliveYoungListed"]["status"],
          },
        },
        "schema": "ProductCatalogItemSeed.limitedDetail.v1",
        "shadeOptions": fields["shadeOptions"]["value"] or [],
        "sourceCandidateId": result.get("candidateId"),
        "sourceGrain": result.get("sourceGrain"),
        "updatedAt": result.get("fetchedAt"),
      },
    )

  return items


def _doc_text(parts: list[str]) -> str:
  return ". ".join(part for part in parts if part)


def _knowledge_docs(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
  docs: list[dict[str, Any]] = []

  for item in items:
    attrs = item.get("attributes") or {}
    live = item.get("liveOffer") or {}
    retail = item.get("retailPresence") or {}
    origin = item.get("brandOrigin") or {}
    hard = item.get("hardFilterEligible") or {}
    core_text = _doc_text(
      [
        f"{item.get('brandName')} {item.get('productName')}",
        f"카테고리 {item.get('category')}",
        f"가격 {live.get('priceKrw')}원" if live.get("priceKrw") else "",
        "구매 URL과 이미지 URL은 Naver live offer 근거가 있다" if live.get("purchaseUrl") and live.get("imageUrl") else "",
        f"브랜드 국적 {origin.get('brandCountry')}" if origin.get("brandCountry") else "",
        "올리브영 입점 확인" if (retail.get("oliveYoung") or {}).get("listed") else "",
        "백화점/백화점 계열몰 입점 확인" if (retail.get("departmentStore") or {}).get("listed") else "",
      ],
    )
    docs.append(
      {
        "catalogItemId": item.get("catalogItemId"),
        "docId": f"{item.get('catalogItemId')}:limited_core",
        "docType": "limited_detail_core",
        "metadata": {
          "brand": item.get("brandName"),
          "category": item.get("category"),
          "collectionStatus": item.get("collectionStatus"),
          "hardFilterEligible": {
            key: value
            for key, value in hard.items()
            if key in {"oliveYoungListed", "departmentStoreListed", "brandCountry", "madeInCountry"}
          },
          "sourceCandidateId": item.get("sourceCandidateId"),
        },
        "sourceGrain": item.get("sourceGrain"),
        "text": core_text[:1200],
      },
    )
    attribute_parts = [
      f"마감 {attrs.get('finish')}" if attrs.get("finish") and hard.get("finish") else "",
      f"제형 {attrs.get('texture')}" if attrs.get("texture") and hard.get("texture") else "",
      f"색상군 {attrs.get('colorFamily')}" if attrs.get("colorFamily") and hard.get("colorFamily") else "",
      f"언더톤 {attrs.get('undertone')}" if attrs.get("undertone") and hard.get("undertone") else "",
      f"강도 {attrs.get('intensity')}" if attrs.get("intensity") and hard.get("intensity") else "",
      "소구점 " + ", ".join(attrs.get("sellingPoints") or []) if attrs.get("sellingPoints") and hard.get("sellingPoints") else "",
      "적합 대상 " + ", ".join(attrs.get("suitableFor") or []) if attrs.get("suitableFor") and hard.get("suitableFor") else "",
      f"호수/옵션 {len(item.get('shadeOptions') or [])}개" if item.get("shadeOptions") and hard.get("shadeOptions") else "",
    ]
    uncertain_parts = [
      f"{key}={attrs.get(key)}"
      for key in ("colorFamily", "undertone", "finish", "texture", "intensity", "sellingPoints", "suitableFor")
      if attrs.get(key) and not hard.get(key)
    ]

    if attribute_parts or uncertain_parts:
      text = _doc_text(attribute_parts)

      if uncertain_parts:
        text = _doc_text(
          [
            text,
            "아래 속성은 confidence 0.65 미만이므로 hard filter에는 쓰지 않는다: " + ", ".join(uncertain_parts),
          ],
        )

      docs.append(
        {
          "catalogItemId": item.get("catalogItemId"),
          "docId": f"{item.get('catalogItemId')}:limited_attributes",
          "docType": "limited_detail_attributes",
          "metadata": {
            "attributeConfidence": item.get("attributeConfidence"),
            "brand": item.get("brandName"),
            "category": item.get("category"),
            "hardFilterEligible": {
              key: value
              for key, value in hard.items()
              if key
              in {
                "shadeOptions",
                "colorFamily",
                "undertone",
                "finish",
                "texture",
                "intensity",
                "suitableFor",
                "sellingPoints",
              }
            },
            "sourceCandidateId": item.get("sourceCandidateId"),
          },
          "sourceGrain": item.get("sourceGrain"),
          "text": text[:1200],
        },
      )

  return docs


def _snapshot_baseline_counts(snapshot_rows: list[dict[str, Any]]) -> dict[str, int]:
  return {
    "brandCountry": sum(1 for row in snapshot_rows if _non_empty(row.get("brandCountry"))),
    "departmentStoreListed": sum(1 for row in snapshot_rows if row.get("departmentStoreStatus") == "listed"),
    "finish": sum(1 for row in snapshot_rows if _non_empty(row.get("finish"))),
    "imageUrl": sum(1 for row in snapshot_rows if _non_empty(row.get("imageUrl"))),
    "oliveYoungListed": sum(1 for row in snapshot_rows if row.get("oliveYoungStatus") == "listed"),
    "price": sum(1 for row in snapshot_rows if _non_empty(row.get("price"))),
    "purchaseUrl": sum(1 for row in snapshot_rows if _non_empty(row.get("sourceUrl"))),
    "sellingPoints": sum(1 for row in snapshot_rows if _non_empty(row.get("sellingPoints"))),
    "shadeOptions": sum(1 for row in snapshot_rows if _non_empty(row.get("shadeOptions"))),
    "suitableFor": sum(1 for row in snapshot_rows if _non_empty(row.get("suitableFor"))),
    "texture": sum(1 for row in snapshot_rows if _non_empty(row.get("texture"))),
  }


def _result_fill_counts(results: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
  summary: dict[str, dict[str, int]] = {}

  for group, group_fields in FIELD_GROUPS.items():
    complete = 0
    partial = 0
    any_hard = 0

    for result in results:
      status = (result.get("fieldGroups") or {}).get(group, {}).get("status")
      hard_fields = (result.get("fieldGroups") or {}).get(group, {}).get("hardFilterEligibleFields") or []

      if status == "complete":
        complete += 1
      elif status == "partial":
        partial += 1

      if hard_fields:
        any_hard += 1

    summary[group] = {
      "anyHardFilterEligible": any_hard,
      "complete": complete,
      "partial": partial,
      "total": len(results),
    }

  return summary


def _source_counts(results: list[dict[str, Any]]) -> dict[str, int]:
  counter: Counter[str] = Counter()

  for result in results:
    for field in (result.get("fields") or {}).values():
      for source_type in field.get("sourceTypes") or []:
        counter[str(source_type)] += 1

  return dict(sorted(counter.items()))


def _status_counts(results: list[dict[str, Any]]) -> dict[str, int]:
  return dict(sorted(Counter(str(result.get("collectionStatus")) for result in results).items()))


def _write_audit_report(
  path: Path,
  *,
  snapshot_path: Path,
  detail_path: Path,
  targets_path: Path,
  snapshot_rows: list[dict[str, Any]],
  targets: list[dict[str, Any]],
  batch_rank_limit: int,
  selected_categories: set[str],
  min_missing_core: int,
) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  baseline = _snapshot_baseline_counts(snapshot_rows)
  category_counts = Counter(str(row.get("category")) for row in snapshot_rows)
  detail_counts = Counter(str(row.get("detailCollectionStatus")) for row in snapshot_rows)
  selected_count = sum(1 for row in targets if row["selectedForBatch"] == "yes")
  category_label = ", ".join(sorted(selected_categories))
  missing_group_counts = Counter(
    group
    for row in targets
    for group in str(row.get("missingFieldGroups") or "").split("|")
    if group
  )
  lines = [
    f"# Auradin Limited Detail Field Audit ({path.stem[-8:]})",
    "",
    "## Input Grain",
    "",
    f"- Top10 input: `{snapshot_path}`",
    f"- Prior detail input: `{detail_path}`",
    "- Grain: brand x category x rank candidate product, not a completed product-detail catalog.",
    f"- Rows: {len(snapshot_rows)}",
    f"- Category counts: `{json.dumps(dict(sorted(category_counts.items())), ensure_ascii=False)}`",
    f"- Detail collection status: `{json.dumps(dict(sorted(detail_counts.items())), ensure_ascii=False)}`",
    "",
    "## Current 7-Field Baseline",
    "",
    "| Field | Filled rows | Fill rate | Notes |",
    "|---|---:|---:|---|",
    f"| shadeOptions | {baseline['shadeOptions']} | {baseline['shadeOptions'] / len(snapshot_rows):.1%} | option/shade evidence only |",
    f"| colorFamily / undertone / intensity | 0 | 0.0% | absent in current snapshot |",
    f"| finish | {baseline['finish']} | {baseline['finish'] / len(snapshot_rows):.1%} | mixed prior detail/title extraction |",
    f"| texture | {baseline['texture']} | {baseline['texture'] / len(snapshot_rows):.1%} | mixed prior detail/title extraction |",
    f"| suitableFor | {baseline['suitableFor']} | {baseline['suitableFor'] / len(snapshot_rows):.1%} | sparse |",
    f"| sellingPoints | {baseline['sellingPoints']} | {baseline['sellingPoints'] / len(snapshot_rows):.1%} | sparse |",
    f"| price / purchase URL / image | {min(baseline['price'], baseline['purchaseUrl'], baseline['imageUrl'])} | {min(baseline['price'], baseline['purchaseUrl'], baseline['imageUrl']) / len(snapshot_rows):.1%} | Naver live-offer level |",
    f"| Olive Young listed | {baseline['oliveYoungListed']} | {baseline['oliveYoungListed'] / len(snapshot_rows):.1%} | positive evidence only; unknown is not negative evidence |",
    f"| department-store-related listed | {baseline['departmentStoreListed']} | {baseline['departmentStoreListed'] / len(snapshot_rows):.1%} | positive evidence only; unknown is not negative evidence |",
    f"| brandCountry | {baseline['brandCountry']} | {baseline['brandCountry'] / len(snapshot_rows):.1%} | configured brand whitelist |",
    "",
    "## Target Priority",
    "",
    f"- Target CSV: `{targets_path}`",
    f"- Selected batch: rank <= {batch_rank_limit}; categories `{category_label}`; at least {min_missing_core} missing core demo fields.",
    f"- Selected rows: {selected_count}",
    f"- Missing field-group counts in full target queue: `{json.dumps(dict(sorted(missing_group_counts.items())), ensure_ascii=False)}`",
    "",
    "## Safety Rules Applied",
    "",
    f"- Core fields below confidence {HARD_FILTER_CONFIDENCE_CUTOFF} are marked `hardFilterEligible=false`.",
    "- Existing Top10 rows remain labeled as Naver brand/category candidate slots.",
    "- Generic fetch is not retried for prior 403/security-challenge rows.",
    "- Unknown retail presence is not converted into a negative listing claim.",
    "- No review text, ingredients, raw HTML, raw images, colorHex, or colorLab are produced.",
  ]
  path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_summary_report(
  path: Path,
  *,
  audit_path: Path,
  targets_path: Path,
  official_path: Path,
  retail_path: Path,
  extra_retail_paths: list[Path],
  results_path: Path,
  catalog_path: Path,
  docs_path: Path,
  results: list[dict[str, Any]],
  items: list[dict[str, Any]],
  docs: list[dict[str, Any]],
  selected_categories: set[str],
  batch_rank_limit: int,
  min_missing_core: int,
) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  fill_counts = _result_fill_counts(results)
  source_counts = _source_counts(results)
  status_counts = _status_counts(results)
  blocked_fields = Counter(
    field
    for result in results
    for field in result.get("hardFilterBlockedFields") or []
  )
  manual_needed = sum(1 for result in results if (result.get("manualReview") or {}).get("needed"))
  source_status = Counter(str((result.get("detailSourceStatus") or {}).get("priorFailureClass")) for result in results)
  official_status = Counter(
    str((result.get("detailSourceStatus") or {}).get("officialMetadataStatus") or "not_collected")
    for result in results
  )
  retail_status = Counter(
    str((result.get("detailSourceStatus") or {}).get("retailMetadataStatus") or "not_collected")
    for result in results
  )
  official_source_urls = {
    str((result.get("detailSourceStatus") or {}).get("officialSourceUrl") or "")
    for result in results
    if (result.get("detailSourceStatus") or {}).get("officialSourceUrl")
  }
  category_counts = Counter(str(result.get("category") or "") for result in results)
  category_label = ", ".join(sorted(selected_categories))
  retail_source_urls = {
    str((result.get("detailSourceStatus") or {}).get("retailSourceUrl") or "")
    for result in results
    if (result.get("detailSourceStatus") or {}).get("retailSourceUrl")
  }
  official_field_counts = Counter(
    field
    for result in results
    for field, payload in (result.get("fields") or {}).items()
    if _non_empty((payload or {}).get("value"))
    and any(str(source_type).startswith("official_brand_page") for source_type in ((payload or {}).get("sourceTypes") or []))
  )
  retail_source_prefixes = (
    "ably_",
    "chicor_",
    "elevenst_",
    "gsshop_",
    "hmall_",
    "lotteon_",
    "musinsa_",
    "naver_offer_",
    "oliveyoung_",
    "poom_",
    "retail_presence_",
    "shinsegaetv_",
    "thehyundai_",
    "wconcept_",
  )
  retail_field_counts = Counter(
    field
    for result in results
    for field, payload in (result.get("fields") or {}).items()
    if _non_empty((payload or {}).get("value"))
    and any(
      str(source_type).startswith(retail_source_prefixes)
      for source_type in ((payload or {}).get("sourceTypes") or [])
    )
  )
  lines = [
    f"# Auradin Limited Detail Collection Summary ({path.stem[-8:]})",
    "",
    "## Outputs",
    "",
    f"- Field audit: `{audit_path}`",
    f"- Target queue: `{targets_path}`",
    f"- Official metadata input: `{official_path}`",
    f"- Retail metadata input: `{retail_path}`",
    f"- Extra retail metadata inputs: `{', '.join(_display_path(item) for item in extra_retail_paths)}`",
    f"- Normalized limited results: `{results_path}`",
    f"- ProductCatalogItem seed: `{catalog_path}`",
    f"- ProductKnowledgeDocument seed: `{docs_path}`",
    "",
    "## Batch Scope",
    "",
    f"- Normalized result rows: {len(results)}",
    f"- Catalog seed rows: {len(items)}",
    f"- Knowledge docs: {len(docs)}",
    f"- Scope: selected categories `{category_label}` from the Naver brand/category Top10 list; rank <= {batch_rank_limit}; missing core demo fields >= {min_missing_core}; source grain remains Naver brand/category Top10 candidate, not a completed detail catalog.",
    f"- Category rows: `{json.dumps(dict(sorted(category_counts.items())), ensure_ascii=False)}`",
    f"- Collection row status: `{json.dumps(status_counts, ensure_ascii=False)}`",
    f"- Prior source class: `{json.dumps(dict(sorted(source_status.items())), ensure_ascii=False)}`",
    f"- Official metadata status: `{json.dumps(dict(sorted(official_status.items())), ensure_ascii=False)}`",
    f"- Retail metadata status: `{json.dumps(dict(sorted(retail_status.items())), ensure_ascii=False)}`",
    f"- Official source URLs used: {len(official_source_urls)}",
    f"- Retail source URLs used: {len(retail_source_urls)}",
    f"- Manual review needed: {manual_needed}",
    "",
    "## 7 Field-Group Fill Rates",
    "",
    "| Field group | Complete | Partial | Any hard-filter eligible | Total |",
    "|---|---:|---:|---:|---:|",
  ]

  for group in FIELD_GROUPS:
    counts = fill_counts[group]
    lines.append(
      f"| {group} | {counts['complete']} ({counts['complete'] / max(1, counts['total']):.1%}) | "
      f"{counts['partial']} ({counts['partial'] / max(1, counts['total']):.1%}) | "
      f"{counts['anyHardFilterEligible']} ({counts['anyHardFilterEligible'] / max(1, counts['total']):.1%}) | {counts['total']} |",
    )

  lines.extend(
    [
      "",
      "## Evidence Source Mix",
      "",
      f"`{json.dumps(source_counts, ensure_ascii=False, sort_keys=True)}`",
      "",
      "## Official Metadata Contribution",
      "",
      f"- Official field counts: `{json.dumps(dict(sorted(official_field_counts.items())), ensure_ascii=False)}`",
      "- Official metadata came from public brand sitemaps and product-page meta/keyword content only.",
      "- Generic promotional keywords were filtered out of `shadeOptions`; removed examples include makeup-use copy, mascara cross-sell keywords, and non-option tone labels.",
      "",
      "## Retail Metadata Contribution",
      "",
      f"- Retail field counts: `{json.dumps(dict(sorted(retail_field_counts.items())), ensure_ascii=False)}`",
      "- Retail metadata came from public OliveYoung, LotteON, W Concept, Chicor, GS Shop, Hmall, Ably, TheHyundai, Shinsegae TV Shopping, Musinsa, POOM, 11st, and Naver Shopping API alternative offer metadata reachable from existing candidate product names.",
      "- Retail HTML/API payloads are parsed in memory only; raw pages, reviews, ingredients, and images are not stored.",
      "",
      "## Fields Not Safe For Hard Filters",
      "",
      f"`{json.dumps(dict(sorted(blocked_fields.items())), ensure_ascii=False)}`",
      "",
      "## Collection Notes",
      "",
      "- Price, purchase URL, image, and positive channel listing evidence come from existing Naver live-offer/source URL metadata.",
      "- Official brand pages are used for limited metadata enrichment when matched by public sitemap/product URL; raw HTML is parsed in memory only and not stored.",
      "- Prior detail extraction is reused only where already available; previous 403/security-challenge paths are marked blocked/manual-review instead of retried.",
      "- Title-rule values are retained as low-confidence inferred evidence and are excluded from hard filters when confidence is below cutoff.",
      "- Brand country is from the configured brand whitelist; manufacturing country is not newly collected by the OliveYoung-focused collector.",
      "- This output is a search/retrieval seed, not a completed shade-level product catalog.",
    ],
  )
  path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Build limited Auradin detail metadata targets, normalized results, catalog seed, and knowledge docs.",
  )
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument("--snapshot", type=Path)
  parser.add_argument("--queue", type=Path)
  parser.add_argument("--detail", type=Path)
  parser.add_argument("--official-metadata", type=Path)
  parser.add_argument("--retail-metadata", type=Path)
  parser.add_argument(
    "--extra-retail-metadata",
    action="append",
    default=[],
    type=Path,
    help="Additional retail metadata file or directory to merge after the primary retail metadata input.",
  )
  parser.add_argument("--batch-rank-limit", type=int, default=5)
  parser.add_argument(
    "--categories",
    default=",".join(sorted(HIGH_VALUE_CATEGORIES)),
    help="Comma-separated categories to include in the limited-detail batch.",
  )
  parser.add_argument(
    "--min-missing-core",
    type=int,
    default=3,
    help="Minimum missing core demo fields required for batch selection.",
  )
  parser.add_argument("--audit-report", type=Path)
  parser.add_argument("--targets-output", type=Path)
  parser.add_argument("--results-output", type=Path)
  parser.add_argument("--catalog-output", type=Path)
  parser.add_argument("--knowledge-output", type=Path)
  parser.add_argument("--summary-report", type=Path)
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  selected_categories = {
    category.strip()
    for category in str(args.categories or "").split(",")
    if category.strip()
  }

  if not selected_categories:
    raise ValueError("--categories must include at least one category")

  snapshot_path = args.snapshot or REPO_ROOT / "data" / "auradin" / "catalog" / "brand_category_top10_products_20260702.jsonl"
  queue_path = args.queue or REPO_ROOT / "data" / "auradin" / "processed" / "enrichment_queue_brand_category_top10_20260702.jsonl"
  detail_path = args.detail or REPO_ROOT / "data" / "auradin" / "detail" / "normalized" / "detail_collection_results_20260702_brand_category_top10.jsonl"
  official_path = args.official_metadata or REPO_ROOT / "data" / "auradin" / "detail" / "official" / f"official_metadata_{args.date}.jsonl"
  retail_path = args.retail_metadata or REPO_ROOT / "data" / "auradin" / "detail" / "retail"
  audit_path = args.audit_report or REPO_ROOT / "reports" / "auradin" / f"limited_detail_field_audit_{args.date}.md"
  targets_path = args.targets_output or REPO_ROOT / "data" / "auradin" / "detail" / "targets" / f"limited_detail_targets_{args.date}.csv"
  results_path = args.results_output or REPO_ROOT / "data" / "auradin" / "detail" / "normalized" / f"limited_detail_results_{args.date}.jsonl"
  catalog_path = args.catalog_output or REPO_ROOT / "data" / "auradin" / "catalog" / f"catalog_items_seed_{args.date}.jsonl"
  knowledge_path = args.knowledge_output or REPO_ROOT / "data" / "auradin" / "knowledge" / f"product_knowledge_docs_{args.date}.jsonl"
  summary_path = args.summary_report or REPO_ROOT / "reports" / "auradin" / f"limited_detail_collection_summary_{args.date}.md"

  snapshot_rows = _read_jsonl(snapshot_path)
  queue_rows = _read_jsonl(queue_path)
  detail_rows = _read_jsonl(detail_path)
  official_rows = _read_jsonl(official_path) if official_path.exists() else []
  retail_rows = _read_retail_metadata(retail_path, args.date)

  for extra_retail_path in args.extra_retail_metadata:
    retail_rows.extend(_read_retail_metadata(extra_retail_path, args.date))

  targets = _build_targets(
    snapshot_rows,
    batch_rank_limit=args.batch_rank_limit,
    selected_categories=selected_categories,
    min_missing_core=args.min_missing_core,
  )
  results = _build_limited_results(
    snapshot_rows,
    queue_rows,
    detail_rows,
    official_rows,
    retail_rows,
    batch_rank_limit=args.batch_rank_limit,
    selected_categories=selected_categories,
    min_missing_core=args.min_missing_core,
    fetched_at=_default_fetched_at(args.date),
  )
  items = _catalog_items(results)
  docs = _knowledge_docs(items)

  _write_csv(
    targets_path,
    targets,
    [
      "candidateId",
      "brand",
      "category",
      "rankInBrandCategory",
      "productName",
      "priorityScore",
      "selectedForBatch",
      "missingCoreFieldCount",
      "missingFieldGroups",
      "detailCollectionStatus",
      "fetchStatus",
      "domain",
      "sourceStrategy",
      "sourceUrl",
    ],
  )
  _write_jsonl(results_path, results)
  _write_jsonl(catalog_path, items)
  _write_jsonl(knowledge_path, docs)
  _write_audit_report(
    audit_path,
    snapshot_path=snapshot_path,
    detail_path=detail_path,
    targets_path=targets_path,
    snapshot_rows=snapshot_rows,
    targets=targets,
    batch_rank_limit=args.batch_rank_limit,
    selected_categories=selected_categories,
    min_missing_core=args.min_missing_core,
  )
  _write_summary_report(
    summary_path,
    audit_path=audit_path,
    targets_path=targets_path,
    official_path=official_path,
    retail_path=retail_path,
    extra_retail_paths=args.extra_retail_metadata,
    results_path=results_path,
    catalog_path=catalog_path,
    docs_path=knowledge_path,
    results=results,
    items=items,
    docs=docs,
    selected_categories=selected_categories,
    batch_rank_limit=args.batch_rank_limit,
    min_missing_core=args.min_missing_core,
  )
  print(
    json.dumps(
      {
        "auditReport": _display_path(audit_path),
        "catalogItems": len(items),
        "catalogOutput": _display_path(catalog_path),
        "knowledgeDocs": len(docs),
        "knowledgeOutput": _display_path(knowledge_path),
        "limitedResults": len(results),
        "minMissingCore": args.min_missing_core,
        "resultsOutput": _display_path(results_path),
        "selectedCategories": sorted(selected_categories),
        "summaryReport": _display_path(summary_path),
        "targets": len(targets),
        "targetsOutput": _display_path(targets_path),
      },
      ensure_ascii=False,
      indent=2,
      sort_keys=True,
    ),
  )
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
