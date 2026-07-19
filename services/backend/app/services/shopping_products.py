import asyncio
import hashlib
import html
from ipaddress import ip_address
import json
import logging
import math
import re
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
import httpx

from app.core.settings import Settings
from app.db.session import Database


logger = logging.getLogger(__name__)

PRODUCT_CATEGORIES = ("base", "shadow", "brow", "cheek", "lip", "liner")
# R1: 저장 카탈로그(products.category enum)와 동기 — Auradin 브로우 찜의 like→liked 왕복이
# 여기서 유실되면 안 된다. dev Shelf 추천 fan-out도 brow 포함 6종을 쓴다(별칭 유지).
STORED_PRODUCT_CATEGORIES = PRODUCT_CATEGORIES
SEMANTIC_MATCH_WEIGHT = 0.35
STRUCTURED_SEMANTIC_MATCH_WEIGHT = 0.10
MAX_EMBEDDING_TEXT_LENGTH = 6000
COLOR_MATCH_BONUS = 10
COLOR_MISMATCH_PENALTY = 12
MAKEUP_AREA_MATCH_BASE = 25
MAKEUP_AREA_MATCH_WEIGHTS = {
  # Generated recipe evidence is dominant because it describes the actual product
  # needed to reproduce the recommended area result.
  "recipeColors": 22,
  "recipeProductType": 16,
  "recipeFinish": 12,
  # Report/context evidence refines a recipe match; it must not overrule it.
  "personalColor": 8,
  "skinType": 6,
  "situationAnswers": 6,
}


def _safe_naver_result_url(value: Any) -> str | None:
  """Accept only public HTTPS URLs before a Naver result reaches a device."""
  parsed = urlparse(str(value or "").strip())
  host = (parsed.hostname or "").lower().rstrip(".")
  if parsed.scheme != "https" or not host or parsed.username or parsed.password:
    return None
  try:
    ip_address(host)
  except ValueError:
    pass
  else:
    return None
  if "." not in host or host.endswith(".local"):
    return None
  return parsed.geturl()

TABS = [
  {"id": "all", "label": "전체"},
  {"id": "base", "label": "베이스"},
  {"id": "shadow", "label": "아이섀도우"},
  {"id": "brow", "label": "아이브로우"},
  {"id": "cheek", "label": "치크"},
  {"id": "lip", "label": "립"},
  {"id": "liner", "label": "아이라이너"},
]

CATEGORY_CONFIG = {
  "lip": {
    "query": "립틴트 립스틱 화장품",
    "label": "립",
    "palette": ["#C95E68", "#E79196"],
    "reason": "추천 룩의 생기와 톤을 맞추기 좋은 립 컬러 후보예요.",
  },
  "cheek": {
    "query": "블러셔 치크 화장품",
    "label": "블러셔",
    "palette": ["#D77A75", "#F0AAA0"],
    "reason": "얼굴 중심에 자연스러운 혈색을 더하기 좋은 치크 후보예요.",
  },
  "shadow": {
    "query": "아이섀도우 팔레트 화장품",
    "label": "아이섀도우",
    "palette": ["#D6A394", "#C98082", "#8B5F55", "#5F4039"],
    "reason": "눈매 음영과 추천 무드를 같이 살리기 좋은 아이 제품이에요.",
  },
  "brow": {
    "query": "아이브로우 브로우 펜슬 화장품",
    "label": "아이브로우",
    "palette": ["#6A5146", "#8A7165"],
    "reason": "눈썹 결을 자연스럽게 채우고 전체 인상을 정돈하기 좋은 브로우 후보예요.",
  },
  "liner": {
    "query": "아이라이너 화장품",
    "label": "아이라이너",
    "palette": ["#4B3028", "#786356"],
    "reason": "눈매를 또렷하게 정리하면서 과하지 않게 맞추기 좋은 후보예요.",
  },
  "base": {
    "query": "쿠션 파운데이션 베이스 화장품",
    "label": "베이스",
    "palette": ["#E4C5A8", "#F4DDC8"],
    "reason": "추천 메이크업의 피부 표현을 맞추기 좋은 베이스 후보예요.",
  },
}

DEFAULT_MAKEUP_LOOK = {
  "title": "내추럴 K-뷰티 데일리 룩",
  "description": "분석된 톤과 어울리는 국내 구매 가능 제품을 중심으로 추천해드려요.",
  "imageUrl": None,
  "tags": ["K-뷰티", "데일리", "톤 맞춤"],
  "palette": ["#C96F72", "#E49C90", "#A77A69", "#5A3D34"],
}
MAKEUP_LOOK_PALETTES_BY_TERM = {
  "코랄": ["#E87564", "#F2A184", "#C95E55", "#F7C7B8"],
  "피치": ["#ED8F73", "#F4B09A", "#D97161", "#F8CFC2"],
  "로즈": ["#C96F72", "#E49C90", "#B56B75", "#F1B6AD"],
  "핑크": ["#D97891", "#F2A2B5", "#C85E7A", "#F8CCD7"],
  "브라운": ["#8B5F55", "#A77A69", "#5F4039", "#D6A394"],
  "베이지": ["#D6A394", "#E4C5A8", "#B88B72", "#F4DDC8"],
  "누드": ["#C98F7B", "#E1B7A5", "#A87564", "#F1D2C4"],
  "모브": ["#A56B86", "#C78FA4", "#87556F", "#E1B8C6"],
  "플럼": ["#8A4E63", "#B06C83", "#633749", "#D2A0AE"],
  "레드": ["#C8424B", "#E46D72", "#9F3039", "#F2A1A4"],
  "오렌지": ["#E6784F", "#F0A077", "#C75C3C", "#F6C4A8"],
  "라벤더": ["#A988C9", "#C7B0E0", "#7F65A8", "#E0D3F0"],
  "아이보리": ["#F0D7BE", "#F7E6D4", "#D8B893", "#FFF1E2"],
  "혈색": ["#D86F70", "#F0A09A", "#BE5A64", "#F3C1B8"],
  "글로우": ["#ECA789", "#F5C3AA", "#D58A70", "#F8DAC8"],
  "글로시": ["#ECA789", "#F5C3AA", "#D58A70", "#F8DAC8"],
  "윤광": ["#E9B18F", "#F5C9AE", "#D19776", "#F8DDC8"],
  "매트": ["#B97367", "#D49887", "#875A50", "#E5B9A8"],
}

COLOR_TERMS = [
  "베이지",
  "핑크",
  "코랄",
  "로즈",
  "피치",
  "브라운",
  "누드",
  "모브",
  "플럼",
  "레드",
  "오렌지",
  "아이보리",
  "라벤더",
]
FINISH_TERMS = [
  "매트",
  "세미매트",
  "글로우",
  "글로시",
  "윤광",
  "촉촉",
  "벨벳",
  "새틴",
  "쉬어",
]
TONE_TERMS = ["웜톤", "쿨톤", "뉴트럴", "뮤트", "라이트", "브라이트", "딥"]
SKIN_TYPE_TERMS = ["모든피부용", "건성", "지성", "복합성", "민감성", "중성"]
FEATURE_TERMS = [
  "웜톤용",
  "쿨톤용",
  "지속력",
  "롱래스팅",
  "수분",
  "보송",
  "블러",
  "톤업",
  "커버",
  "밀착",
]
CONTAINER_TERMS = ["뚜껑형", "스틱", "튜브", "팔레트", "쿠션", "펜슬", "리퀴드", "팟"]
PRODUCT_TYPE_ALIASES = {
  "foundation": "파운데이션",
  "cushion": "쿠션",
  "concealer": "컨실러",
  "powder": "파우더",
  "primer": "프라이머",
  "브로우 펜슬": "브로우펜슬",
  "브로우 마스카라": "브로우마스카라",
  "아이 섀도우": "아이섀도우",
  "립 틴트": "립틴트",
  "립 글로스": "립글로스",
  "brow pencil": "브로우펜슬",
  "eyebrow pencil": "브로우펜슬",
  "brow mascara": "브로우마스카라",
  "eyeshadow": "아이섀도우",
  "eye shadow": "아이섀도우",
  "palette": "팔레트",
  "eyeliner": "아이라이너",
  "mascara": "마스카라",
  "blusher": "블러셔",
  "blush": "블러셔",
  "lip tint": "립틴트",
  "tint": "립틴트",
  "lipstick": "립스틱",
  "lip gloss": "립글로스",
  "gloss": "립글로스",
}
PRODUCT_TYPE_TERMS = [
  "파운데이션",
  "쿠션",
  "컨실러",
  "파우더",
  "프라이머",
  "브로우펜슬",
  "브로우마스카라",
  "아이브로우",
  "아이섀도우",
  "섀도우",
  "팔레트",
  "아이라이너",
  "마스카라",
  "블러셔",
  "치크",
  "립틴트",
  "틴트",
  "립스틱",
  "립글로스",
]
CATEGORY_GUIDE_KEYS = {
  "base": ("baseMakeupGuide",),
  "cheek": ("makeupGuideline.blush",),
  "liner": ("makeupGuideline.eyeliner",),
  "lip": ("makeupGuideline.lip",),
  "shadow": ("makeupGuideline.eyeshadow",),
  "brow": ("makeupGuideline.brow",),
}
CATEGORY_MATCH_TERMS = {
  "base": (
    "베이스",
    "베이스메이크업",
    "비비",
    "비비크림",
    "씨씨",
    "씨씨크림",
    "컨실러",
    "쿠션",
    "톤업",
    "파운데이션",
    "파우더",
  ),
  "cheek": ("blush", "블러셔", "블러쉬", "볼터치", "치크"),
  "brow": ("brow", "eyebrow", "브로우", "아이브로우", "눈썹", "브로우펜슬"),
  "liner": ("eyeliner", "라이너", "리퀴드라이너", "아이라이너", "젤라이너", "펜라이너"),
  "lip": ("gloss", "lip", "립", "립글로스", "립밤", "립스틱", "립틴트", "틴트"),
  "shadow": ("eyeshadow", "섀도우", "아이섀도우", "아이팔레트", "팔레트"),
}
CATEGORY_STRICT_PRODUCT_TERMS = {
  "base": (
    "bb크림",
    "cc크림",
    "메이크업베이스",
    "비비크림",
    "씨씨크림",
    "컨실러",
    "쿠션 파운데이션",
    "톤업크림",
    "파운데이션",
  ),
  "cheek": ("blusher", "블러셔", "볼터치", "치크 팝", "치크팝"),
  "brow": ("brow pencil", "eyebrow", "브로우 마스카라", "브로우펜슬", "아이브로우", "아이브로우 펜슬"),
  "liner": (
    "eyeliner",
    "리퀴드 아이라이너",
    "아이라이너",
    "오토 젤 아이라이너",
    "젤 아이라이너",
    "펜 아이라이너",
  ),
  "lip": ("lip gloss", "lip tint", "lipstick", "립글로스", "립밤", "립스틱", "립틴트"),
  "shadow": (
    "eye palette",
    "eyeshadow",
    "아이 섀도우",
    "아이섀도",
    "아이섀도우",
    "아이팔레트",
    "섀도우 팔레트",
  ),
}
CATEGORY_FALLBACK_QUERIES = {
  "base": ("쿠션 파운데이션 화장품", "베이스메이크업 파운데이션", "톤업 쿠션 화장품"),
  "cheek": ("블러셔 화장품", "치크 블러셔", "볼터치 블러셔"),
  "brow": ("아이브로우 화장품", "브로우 펜슬", "아이브로우 마스카라"),
  "liner": ("아이라이너 화장품", "리퀴드 아이라이너", "젤 아이라이너"),
  "lip": ("립틴트 화장품", "립스틱 화장품", "립글로스 화장품"),
  "shadow": ("아이섀도우 화장품", "아이섀도우 팔레트", "섀도우 팔레트"),
}
COSMETIC_CATEGORY_TERMS = ("beauty", "뷰티", "미용", "색조", "화장품")
NON_COSMETIC_EXCLUDE_TERMS = (
  "가방",
  "구두",
  "국내매장판",
  "남성의류",
  "나이키",
  "뉴발란스",
  "목걸이",
  "바지",
  "반스",
  "부츠",
  "샌들",
  "셔츠",
  "슈즈",
  "슬리퍼",
  "신발",
  "아디다스",
  "여성의류",
  "운동화",
  "의류",
  "잡화",
  "주얼리",
  "쥬얼리",
  "컨버스",
  "크록스",
  "티셔츠",
  "패션",
  "푸마",
)


def _clean_text(value: Any) -> str:
  text = html.unescape(str(value or ""))
  text = re.sub(r"<[^>]+>", "", text)
  text = re.sub(r"\s+", " ", text).strip()

  return text


def _dedupe(values: list[str]) -> list[str]:
  seen = set()
  result = []

  for value in values:
    normalized = value.strip()

    if not normalized or normalized in seen:
      continue

    seen.add(normalized)
    result.append(normalized)

  return result


def _parse_price(value: Any) -> int:
  try:
    return max(0, int(str(value or "0").replace(",", "")))
  except ValueError:
    return 0


def _stable_external_id(prefix: str, value: str) -> str:
  digest = hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]

  return f"{prefix}-{digest}"


def _normalize_category(category: str | None) -> str | None:
  if category in PRODUCT_CATEGORIES:
    return category

  return None


def _normalize_stored_category(category: str | None) -> str | None:
  # R1: DB에 저장된 행(찜 포함)은 brow까지 유효 — liked 목록에서 브로우가 유실되면 안 된다.
  if category in STORED_PRODUCT_CATEGORIES:
    return category

  return None


def _as_list(value: Any) -> list[str]:
  if isinstance(value, list):
    return [_clean_text(item) for item in value if _clean_text(item)]

  if isinstance(value, str):
    return [_clean_text(item) for item in re.split(r"[,/|·]", value) if _clean_text(item)]

  return []


def _contains_any(text: str, values: list[str]) -> list[str]:
  normalized_text = text.lower()

  return [
    value
    for value in values
    if value.lower() in normalized_text
  ]


def _product_type_terms(text: str) -> list[str]:
  normalized_text = text.lower()
  aliases = [
    canonical
    for alias, canonical in PRODUCT_TYPE_ALIASES.items()
    if alias in normalized_text
  ]
  return _dedupe([*_contains_any(text, PRODUCT_TYPE_TERMS), *aliases])


def _context_feature_terms(text: str) -> list[str]:
  normalized_text = text.lower()
  aliases = [
    ("지속력", ("오래 지속", "오래가", "오래 유지", "무너지지", "long lasting", "long-lasting")),
    ("수분", ("건조하지", "촉촉하게", "hydrating")),
    ("보송", ("번들거리지", "보송하게", "oil control")),
  ]
  inferred = [
    canonical
    for canonical, phrases in aliases
    if any(phrase in normalized_text for phrase in phrases)
  ]
  return _dedupe([*_contains_any(text, FEATURE_TERMS), *inferred])


def _text_has_any(text: str, values: tuple[str, ...]) -> bool:
  normalized_text = text.lower()

  return any(value.lower() in normalized_text for value in values)


def _naver_category_text(item: dict[str, Any]) -> str:
  return _clean_text(
    " ".join(
      [
        _clean_text(item.get("category1")),
        _clean_text(item.get("category2")),
        _clean_text(item.get("category3")),
        _clean_text(item.get("category4")),
      ],
    ),
  )


def _naver_searchable_text(item: dict[str, Any]) -> str:
  return _clean_text(
    " ".join(
      [
        _naver_category_text(item),
        _clean_text(item.get("title")),
        _clean_text(item.get("brand")),
        _clean_text(item.get("maker")),
        _clean_text(item.get("mallName")),
      ],
    ),
  )


def _has_strict_product_term(text: str, category: str) -> bool:
  return _text_has_any(text, CATEGORY_STRICT_PRODUCT_TERMS[category])


def _has_category_match_term(text: str, category: str) -> bool:
  return _text_has_any(text, CATEGORY_MATCH_TERMS[category])


def _is_category_metadata_reliable(category_text: str) -> bool:
  return bool(category_text) and _text_has_any(category_text, COSMETIC_CATEGORY_TERMS)


def _is_uncategorized_cosmetic_item(text: str, category: str) -> bool:
  # NAVER occasionally returns blank category fields. In that case, only accept
  # unmistakable cosmetic product names; broad words such as "라이너" or
  # "블러쉬" can also be fashion/color names.
  return _has_strict_product_term(text, category)


def _is_naver_cosmetic_item_for_category(
  item: dict[str, Any],
  category: str,
) -> bool:
  category_text = _naver_category_text(item)
  searchable_text = _naver_searchable_text(item)

  if _text_has_any(searchable_text, NON_COSMETIC_EXCLUDE_TERMS):
    return False

  if _is_category_metadata_reliable(category_text):
    return (
      _has_category_match_term(category_text, category) or
      _has_strict_product_term(searchable_text, category)
    )

  if category_text:
    return False

  return _is_uncategorized_cosmetic_item(searchable_text, category)


def _decode_json_object(value: Any) -> dict[str, Any]:
  if isinstance(value, dict):
    return value

  if isinstance(value, str) and value.strip():
    try:
      decoded = json.loads(value)
    except json.JSONDecodeError:
      return {}

    return decoded if isinstance(decoded, dict) else {}

  return {}


def _get_nested_text(payload: dict[str, Any], path: str) -> str:
  current: Any = payload

  for key in path.split("."):
    if not isinstance(current, dict):
      return ""

    current = current.get(key)

  return _clean_text(current)


def _first_makeup_image_url(card: dict[str, Any]) -> str:
  return _clean_text(
    card.get("imageUrl") or
    card.get("image_url") or
    card.get("cdnUrl") or
    card.get("previewUrl"),
  )


def _normalize_recommended_makeup_card(card: Any) -> dict[str, Any] | None:
  if not isinstance(card, dict):
    return None

  title = _clean_text(card.get("title"))
  image_url = _first_makeup_image_url(card)

  if not title and not image_url:
    return None

  return {
    "description": _clean_text(card.get("description")),
    "imageUrl": image_url,
    "palette": _as_list(card.get("palette")),
    "subtitle": _clean_text(card.get("subtitle")),
    "tags": _as_list(card.get("tags")),
    "title": title,
  }


def _normalize_recommended_makeups(result: dict[str, Any]) -> list[dict[str, Any]]:
  recommended_makeups = result.get("recommendedMakeups")

  if not isinstance(recommended_makeups, list):
    return []

  return [
    normalized
    for card in recommended_makeups[:3]
    if (normalized := _normalize_recommended_makeup_card(card)) is not None
  ]


def _primary_recommended_makeup(profile: dict[str, Any] | None) -> dict[str, Any] | None:
  recommended_makeups = profile.get("recommendedMakeups") if isinstance(profile, dict) else None

  if not isinstance(recommended_makeups, list):
    return None

  selected_index = profile.get("selectedRecommendedMakeupIndex") if isinstance(profile, dict) else None

  if isinstance(selected_index, int) and 0 <= selected_index < len(recommended_makeups):
    selected_card = recommended_makeups[selected_index]

    if (
      isinstance(selected_card, dict)
      and (_clean_text(selected_card.get("title")) or _clean_text(selected_card.get("imageUrl")))
    ):
      return selected_card

  return next(
    (
      card
      for card in recommended_makeups
      if isinstance(card, dict)
      and (_clean_text(card.get("title")) or _clean_text(card.get("imageUrl")))
    ),
    None,
  )


def _makeup_card_text(card: dict[str, Any] | None) -> str:
  if not isinstance(card, dict):
    return ""

  text_parts = [
    card.get("title"),
    card.get("subtitle"),
    card.get("description"),
    *_as_list(card.get("tags")),
  ]

  return " ".join(_clean_text(part) for part in text_parts if _clean_text(part))


def _palette_for_makeup(
  profile: dict[str, Any] | None,
  makeup: dict[str, Any] | None,
) -> list[str]:
  explicit_palette = _as_list(makeup.get("palette") if isinstance(makeup, dict) else None)

  if explicit_palette:
    return explicit_palette[:4]

  searchable_text = _makeup_card_text(makeup) or _profile_text(profile)
  matched_colors: list[str] = []

  for term, palette in MAKEUP_LOOK_PALETTES_BY_TERM.items():
    if term.lower() in searchable_text.lower():
      matched_colors.extend(palette[:2])

  return (_dedupe(matched_colors) or DEFAULT_MAKEUP_LOOK["palette"])[:4]


def _build_makeup_look_options(profile: dict[str, Any] | None) -> list[dict[str, Any]]:
  recommended_makeups = profile.get("recommendedMakeups") if isinstance(profile, dict) else None

  if not isinstance(recommended_makeups, list):
    return []

  options = []

  for index, card in enumerate(recommended_makeups):
    if not isinstance(card, dict):
      continue

    image_url = _first_makeup_image_url(card)
    title = _clean_text(card.get("title"))

    if not image_url and not title:
      continue

    options.append(
      {
        "description": _clean_text(card.get("description")),
        "imageUrl": image_url,
        "index": index,
        "palette": _palette_for_makeup(profile, card),
        "subtitle": _clean_text(card.get("subtitle")),
        "tags": _as_list(card.get("tags")) or DEFAULT_MAKEUP_LOOK["tags"],
        "title": title or f"추천 메이크업 {index + 1}",
      },
    )

  return options


def _normalize_report_payload(row: dict[str, Any] | None) -> dict[str, Any] | None:
  if not row:
    return None

  detail_payload = _decode_json_object(row.get("detail_payload"))
  result = _decode_json_object(detail_payload.get("result"))

  return {
    "baseMakeupGuide": _clean_text(
      row.get("base_makeup_guide") or result.get("baseMakeupGuide"),
    ),
    "faceShape": _clean_text(row.get("face_shape") or result.get("faceShape")),
    "makeupGuideline": (
      result.get("makeupGuideline")
      if isinstance(result.get("makeupGuideline"), dict)
      else {}
    ),
    "personalColor": _clean_text(row.get("personal_color") or result.get("personalColor")),
    "recommendedMood": _clean_text(row.get("recommended_mood") or result.get("recommendedMood")),
    "recommendedMakeups": _normalize_recommended_makeups(result),
    "shortSummary": _clean_text(row.get("short_summary") or result.get("shortSummary")),
    "skinAnalysisSummary": _clean_text(
      row.get("skin_analysis_summary") or result.get("skinAnalysisSummary"),
    ),
    "skinType": _clean_text(row.get("skin_type") or result.get("skinType")),
    "summary": _clean_text(row.get("summary") or result.get("summary")),
    "tags": _as_list(row.get("tags") or result.get("tags")),
    "toneSummary": _clean_text(row.get("tone_summary") or result.get("toneSummary")),
  }


def _profile_text(profile: dict[str, Any] | None, category: str | None = None) -> str:
  if not profile:
    return ""

  primary_makeup = _primary_recommended_makeup(profile)
  text_parts = [
    primary_makeup.get("title") if primary_makeup else "",
    primary_makeup.get("subtitle") if primary_makeup else "",
    primary_makeup.get("description") if primary_makeup else "",
    *(primary_makeup.get("tags", []) if primary_makeup else []),
    profile.get("personalColor"),
    profile.get("skinType"),
    profile.get("toneSummary"),
    profile.get("recommendedMood"),
    profile.get("summary"),
    profile.get("shortSummary"),
    profile.get("skinAnalysisSummary"),
    profile.get("baseMakeupGuide"),
    *profile.get("tags", []),
  ]
  guideline = profile.get("makeupGuideline")

  if isinstance(guideline, dict):
    text_parts.extend(guideline.values())

  if category:
    for key in CATEGORY_GUIDE_KEYS.get(category, ()):
      text_parts.append(_get_nested_text(profile, key))

  return " ".join(_clean_text(part) for part in text_parts if _clean_text(part))


def _target_terms(
  profile: dict[str, Any] | None,
  category: str | None = None,
) -> dict[str, list[str]]:
  text = _profile_text(profile, category)
  personal_color = _clean_text(profile.get("personalColor") if profile else "")
  skin_type = _clean_text(profile.get("skinType") if profile else "")

  colors = _contains_any(text, COLOR_TERMS)
  finishes = _contains_any(text, FINISH_TERMS)
  tones = _contains_any(text, TONE_TERMS)
  skin_types = _contains_any(text, SKIN_TYPE_TERMS)

  if "봄" in personal_color or "가을" in personal_color or "warm" in personal_color.lower():
    tones.append("웜톤")

  if "여름" in personal_color or "겨울" in personal_color or "cool" in personal_color.lower():
    tones.append("쿨톤")

  if "건성" in skin_type:
    finishes.extend(["촉촉", "글로우", "윤광"])
    skin_types.append("건성")

  if "지성" in skin_type or "복합성" in skin_type:
    finishes.extend(["세미매트", "매트", "보송"])
    skin_types.append("복합성" if "복합성" in skin_type else "지성")

  return {
    "colors": _dedupe(colors),
    "features": _dedupe(_contains_any(text, FEATURE_TERMS)),
    "finishes": _dedupe(finishes),
    "skinTypes": _dedupe(skin_types),
    "tones": _dedupe(tones),
  }


def _extract_product_specs(
  *,
  brand: str = "",
  category: str,
  maker: str = "",
  product_id: str = "",
  raw_text: str = "",
  source: dict[str, Any] | None = None,
) -> dict[str, Any]:
  source = source or {}
  searchable_text = " ".join(
    [
      raw_text,
      _clean_text(source.get("title")),
      _clean_text(source.get("category2")),
      _clean_text(source.get("category3")),
      _clean_text(source.get("category4")),
      _clean_text(source.get("mallName")),
      brand,
      maker,
    ],
  )
  origin = _clean_text(source.get("origin") or source.get("originArea"))
  colors = _dedupe(_as_list(source.get("colors")) + _contains_any(searchable_text, COLOR_TERMS))
  finishes = _dedupe(_as_list(source.get("effects")) + _contains_any(searchable_text, FINISH_TERMS))
  tones = _dedupe(_contains_any(searchable_text, TONE_TERMS))
  skin_types = _dedupe(
    _as_list(source.get("skinTypes")) +
    _contains_any(searchable_text, SKIN_TYPE_TERMS),
  )
  features = _dedupe(
    _as_list(source.get("features")) +
    _contains_any(searchable_text, FEATURE_TERMS) +
    [f"{tone}용" for tone in tones if tone in {"웜톤", "쿨톤"}],
  )
  containers = _dedupe(_contains_any(searchable_text, CONTAINER_TERMS))
  product_types = _product_type_terms(searchable_text)

  if category == "base" and not skin_types:
    skin_types = ["모든피부용"]

  return {
    "brand": brand,
    "colors": colors,
    "containerTypes": containers,
    "effects": finishes,
    "features": features,
    "maker": maker,
    "origin": origin,
    "productNumber": product_id,
    "productTypes": product_types,
    "skinTypes": skin_types,
    "tones": tones,
  }


def _score_makeup_area_product_match(
  specs: dict[str, Any],
  signals: dict[str, Any],
) -> tuple[int, list[str]]:
  """Score a verified catalog item against explicit generated-area evidence."""
  recipe = signals.get("recipe") if isinstance(signals.get("recipe"), dict) else {}
  personal_color = (
    signals.get("personalColor")
    if isinstance(signals.get("personalColor"), dict)
    else {}
  )
  context = signals.get("context") if isinstance(signals.get("context"), dict) else {}

  recipe_color_text = " ".join(_as_list(recipe.get("colors")))
  recipe_finish_text = " ".join(_as_list(recipe.get("finishes")))
  recipe_type_text = " ".join(_as_list(recipe.get("productTypes")))
  target_colors = set(_contains_any(recipe_color_text, COLOR_TERMS))
  target_finishes = set(_contains_any(recipe_finish_text, FINISH_TERMS))
  target_product_types = set(_product_type_terms(recipe_type_text))

  personal_text = (
    " ".join(_as_list(personal_color.get("terms")))
    if personal_color.get("usable") is True
    else ""
  )
  personal_normalized = personal_text.lower()
  personal_colors = set(_contains_any(personal_text, COLOR_TERMS))
  personal_tones = set(_contains_any(personal_text, TONE_TERMS))
  if any(term in personal_normalized for term in ("봄", "가을", "warm", "웜")):
    personal_tones.add("웜톤")
  if any(term in personal_normalized for term in ("여름", "겨울", "cool", "쿨")):
    personal_tones.add("쿨톤")

  target_skin_types = set(_contains_any(_clean_text(signals.get("skinType")), SKIN_TYPE_TERMS))
  context_text = " ".join([
    *_as_list(context.get("situation")),
    *_as_list(context.get("answers")),
  ])
  context_features = set(_context_feature_terms(context_text))

  product_colors = set(_as_list(specs.get("colors")))
  product_finishes = set(_as_list(specs.get("effects")))
  product_types = set(_as_list(specs.get("productTypes")))
  product_tones = set(_as_list(specs.get("tones")))
  product_skin_types = set(_as_list(specs.get("skinTypes")))
  product_features = set(_as_list(specs.get("features")))

  score = MAKEUP_AREA_MATCH_BASE
  matched_terms: list[str] = []

  color_matches = sorted(product_colors & target_colors)
  if color_matches:
    color_weight = MAKEUP_AREA_MATCH_WEIGHTS["recipeColors"]
    score += color_weight if len(target_colors) <= 1 else min(color_weight, 18 + 2 * (len(color_matches) - 1))
    matched_terms.extend(f"\ub808\uc2dc\ud53c \uc0c9\uc0c1: {term}" for term in color_matches)
  elif product_colors and target_colors:
    score -= 10

  type_matches = sorted(product_types & target_product_types)
  if type_matches:
    score += MAKEUP_AREA_MATCH_WEIGHTS["recipeProductType"]
    matched_terms.extend(f"\uc81c\ud488 \uc720\ud615: {term}" for term in type_matches)
  elif product_types and target_product_types:
    score -= 8

  finish_matches = sorted(product_finishes & target_finishes)
  if finish_matches:
    score += MAKEUP_AREA_MATCH_WEIGHTS["recipeFinish"]
    matched_terms.extend(f"\ub808\uc2dc\ud53c \uc9c8\uac10: {term}" for term in finish_matches)
  elif product_finishes and target_finishes:
    score -= 6

  if personal_color.get("usable") is True:
    tone_matches = sorted(product_tones & personal_tones)
    palette_matches = sorted(product_colors & personal_colors)
    if tone_matches:
      score += 5
      matched_terms.extend(f"\ud37c\uc2a4\ub110\uceec\ub7ec \ud1a4: {term}" for term in tone_matches)
    if palette_matches:
      score += 3
      matched_terms.extend(f"\ud37c\uc2a4\ub110\uceec\ub7ec \ud314\ub808\ud2b8: {term}" for term in palette_matches)
    if ("웜톤" in product_tones and "쿨톤" in personal_tones) or (
      "쿨톤" in product_tones and "웜톤" in personal_tones
    ):
      score -= 6

  skin_matches = sorted(product_skin_types & target_skin_types)
  if skin_matches:
    score += MAKEUP_AREA_MATCH_WEIGHTS["skinType"]
    matched_terms.extend(f"\ud53c\ubd80 \ud0c0\uc785: {term}" for term in skin_matches)
  elif target_skin_types and "모든피부용" in product_skin_types:
    score += MAKEUP_AREA_MATCH_WEIGHTS["skinType"] // 2
    matched_terms.append("모든피부용")

  feature_matches = sorted(product_features & context_features)
  if feature_matches:
    score += MAKEUP_AREA_MATCH_WEIGHTS["situationAnswers"]
    matched_terms.extend(f"\uc0c1\ud669\u00b7\ub2f5\ubcc0: {term}" for term in feature_matches)

  return min(95, max(20, score)), _dedupe(matched_terms)


def _score_product_match(
  specs: dict[str, Any],
  category: str,
  index: int,
  profile: dict[str, Any] | None,
) -> tuple[int, list[str]]:
  if not profile:
    # F7: 프로필(리포트)이 없으면 매치 근거가 없다 — 과거의 max(82, 96-2·index)는
    # 근거 없는 82~96%를 "매치율"로 표시하는 과잉 확신이었다. 순위 기반임을 나타내는
    # 보수적 값(프로필 기본치 74 미만에서 시작, 순위당 -2, 전역 하한 62)으로 낮춘다.
    return max(62, 70 - index * 2), []

  match_signals = profile.get("matchSignals")
  if isinstance(match_signals, dict):
    return _score_makeup_area_product_match(specs, match_signals)

  targets = _target_terms(profile, category)
  matched_terms: list[str] = []
  score = 74

  for product_field, target_field, weight, limit in (
    ("colors", "colors", 12, 36),
    ("effects", "finishes", 4, 12),
    ("skinTypes", "skinTypes", 4, 8),
    ("features", "features", 3, 9),
    ("tones", "tones", 7, 14),
  ):
    product_terms = set(specs.get(product_field) or [])
    target_terms = set(targets.get(target_field) or [])
    matches = sorted(product_terms & target_terms)

    if matches:
      matched_terms.extend(matches)
      score += min(len(matches) * weight, limit)

  product_tones = set(specs.get("tones") or [])
  target_tones = set(targets.get("tones") or [])

  if "웜톤" in product_tones and "쿨톤" in target_tones:
    score -= 8

  if "쿨톤" in product_tones and "웜톤" in target_tones:
    score -= 8

  product_colors = set(specs.get("colors") or [])
  target_colors = set(targets.get("colors") or [])
  has_color_target = bool(target_colors)
  has_color_match = bool(product_colors & target_colors)

  if has_color_match:
    score += COLOR_MATCH_BONUS
  elif has_color_target and category in {"lip", "cheek", "shadow", "base", "brow"}:
    score -= COLOR_MISMATCH_PENALTY

  score -= min(index, 6)

  return min(99, max(62, score)), _dedupe(matched_terms)


def _match_reason(
  category: str,
  matched_terms: list[str],
  profile: dict[str, Any] | None,
) -> str:
  config_reason = CATEGORY_CONFIG[category]["reason"]

  if not profile or not matched_terms:
    return config_reason

  profile_label = _clean_text(profile.get("personalColor")) or _clean_text(
    profile.get("recommendedMood"),
  )
  matched_label = ", ".join(matched_terms[:4])

  if isinstance(profile.get("matchSignals"), dict):
    return f"\ucd94\ucc9c \ub808\uc2dc\ud53c \uae30\uc900\uc73c\ub85c {matched_label} \uadfc\uac70\uac00 \ub9de\ub294 \uac80\uc99d\ub41c \uc81c\ud488\uc774\uc5d0\uc694."

  if profile_label:
    return f"{profile_label} 보고서에서 강조된 {matched_label} 조건과 상품 특징이 맞아 추천해요."

  return f"보고서의 {matched_label} 조건과 상품 정보가 잘 맞아 추천해요."


def _product_tags(
  category_tags: list[str],
  specs: dict[str, Any],
  matched_terms: list[str],
  fallback: list[str],
) -> list[str]:
  return _dedupe(
    [
      *matched_terms,
      *(specs.get("colors") or []),
      *(specs.get("effects") or []),
      *(specs.get("features") or []),
      *category_tags,
      *fallback,
    ],
  )[:5]


def _build_category_query(category: str, profile: dict[str, Any] | None = None) -> str:
  base_query = CATEGORY_CONFIG[category]["query"]

  if not profile:
    return base_query

  targets = _target_terms(profile, category)
  profile_terms = _dedupe(
    [
      *targets["colors"],
      *targets["tones"],
      *targets["finishes"],
    ],
  )[:4]

  if not profile_terms:
    return base_query

  return " ".join([base_query, *profile_terms])


def _bedrock_embedding_client(settings: Settings):
  client_kwargs = {
    "region_name": settings.effective_bedrock_embedding_region,
    "config": Config(
      connect_timeout=15,
      read_timeout=45,
      retries={"max_attempts": 1},
    ),
  }

  if settings.aws_access_key_id and settings.aws_secret_access_key:
    client_kwargs.update(
      {
        "aws_access_key_id": settings.aws_access_key_id,
        "aws_secret_access_key": settings.aws_secret_access_key,
      },
    )

  if settings.aws_profile_name:
    return boto3.Session(profile_name=settings.aws_profile_name).client("bedrock-runtime", **client_kwargs)

  return boto3.client("bedrock-runtime", **client_kwargs)


def _invoke_bedrock_text_embedding(
  client: Any,
  settings: Settings,
  text: str,
) -> list[float]:
  model_id = settings.effective_embedding_model_id
  normalized_text = _clean_text(text)[:MAX_EMBEDDING_TEXT_LENGTH]

  if not model_id or not normalized_text:
    return []

  body: dict[str, Any] = {"inputText": normalized_text}

  if "titan-embed-text-v2" in model_id:
    body.update(
      {
        "dimensions": settings.embedding_dimension,
        "normalize": True,
      },
    )

  response = client.invoke_model(
    modelId=model_id,
    body=json.dumps(body, ensure_ascii=False),
    accept="application/json",
    contentType="application/json",
  )
  payload = json.loads(response["body"].read())
  embedding = payload.get("embedding")

  if not isinstance(embedding, list):
    return []

  return [
    float(value)
    for value in embedding
    if isinstance(value, int | float)
  ]


def _cosine_similarity(left: list[float], right: list[float]) -> float:
  if not left or not right or len(left) != len(right):
    return 0.0

  dot = sum(left_value * right_value for left_value, right_value in zip(left, right))
  left_norm = math.sqrt(sum(value * value for value in left))
  right_norm = math.sqrt(sum(value * value for value in right))

  if left_norm == 0 or right_norm == 0:
    return 0.0

  return dot / (left_norm * right_norm)


def _semantic_match_rate(similarity: float) -> int:
  return min(100, max(0, round(max(0.0, similarity) * 100)))


def _combine_match_rate(
  rule_score: int,
  semantic_rate: int,
  *,
  semantic_weight: float = SEMANTIC_MATCH_WEIGHT,
  minimum: int = 62,
) -> int:
  weighted_score = (
    rule_score * (1 - semantic_weight) +
    semantic_rate * semantic_weight
  )

  return min(99, max(minimum, round(weighted_score)))


def _semantic_profile_text(profile: dict[str, Any], category: str) -> str:
  targets = _target_terms(profile, category)
  color_text = " ".join(targets["colors"])
  target_text = " ".join(
    [
      *targets["colors"],
      *targets["finishes"],
      *targets["skinTypes"],
      *targets["features"],
      *targets["tones"],
    ],
  )

  return "\n".join(
    part
    for part in [
      f"추천 카테고리: {CATEGORY_CONFIG[category]['label']}",
      f"핵심 색상 조건: {color_text} {color_text} {color_text}",
      f"분석 보고서: {_profile_text(profile, category)}",
      f"추천 타깃 특징: {target_text}",
    ]
    if _clean_text(part)
  )


def _semantic_product_text(product: dict[str, Any]) -> str:
  specs = product.get("productInfo")
  specs = specs if isinstance(specs, dict) else {}
  category = _normalize_category(product.get("category")) or "lip"
  spec_parts: list[str] = []
  color_parts: list[str] = []

  for key in (
    "colors",
    "effects",
    "features",
    "skinTypes",
    "tones",
    "containerTypes",
  ):
    values = specs.get(key)

    if isinstance(values, list):
      spec_parts.extend(_clean_text(value) for value in values if _clean_text(value))

      if key == "colors":
        color_parts.extend(_clean_text(value) for value in values if _clean_text(value))

  color_text = " ".join(color_parts)

  return "\n".join(
    part
    for part in [
      f"상품 카테고리: {CATEGORY_CONFIG[category]['label']}",
      f"상품 핵심 색상: {color_text} {color_text} {color_text}",
      f"브랜드: {_clean_text(product.get('brandName'))}",
      f"상품명: {_clean_text(product.get('productName'))} {_clean_text(product.get('shadeName'))}",
      f"태그: {' '.join(product.get('tags') or [])}",
      f"상품정보: {' '.join(spec_part for spec_part in spec_parts if spec_part)}",
      f"추천 이유: {_clean_text(product.get('reason'))}",
    ]
    if _clean_text(part)
  )


def _semantic_reason(
  product: dict[str, Any],
  semantic_rate: int,
) -> str:
  reason = _clean_text(product.get("reason"))

  if semantic_rate < 72:
    return reason

  semantic_copy = "\ucd94\ucc9c \ub808\uc2dc\ud53c\uc640 \uc0c1\ud488 \uc815\ubcf4\uc758 \uc758\ubbf8 \uc720\uc0ac\ub3c4\ub3c4 \ub192\uac8c \ub098\uc654\uc5b4\uc694."

  if not reason:
    return semantic_copy

  return f"{reason} {semantic_copy}"


async def _embed_text(
  client: Any,
  settings: Settings,
  text: str,
) -> list[float]:
  return await asyncio.to_thread(_invoke_bedrock_text_embedding, client, settings, text)


async def _apply_semantic_product_scores(
  products: list[dict[str, Any]],
  settings: Settings,
  profile: dict[str, Any] | None,
) -> tuple[list[dict[str, Any]], bool]:
  if not products or not profile or not settings.effective_embedding_model_id:
    return products, False

  try:
    client = _bedrock_embedding_client(settings)
    product_categories = _dedupe(
      [
        category
        for product in products
        if (category := _normalize_category(product.get("category")))
      ],
    )
    profile_embeddings = await asyncio.gather(
      *(
        _embed_text(client, settings, _semantic_profile_text(profile, category))
        for category in product_categories
      ),
    )
    profile_embedding_by_category = dict(zip(product_categories, profile_embeddings))

    semaphore = asyncio.Semaphore(8)

    async def embed_product(product: dict[str, Any]) -> list[float]:
      async with semaphore:
        return await _embed_text(client, settings, _semantic_product_text(product))

    product_embeddings = await asyncio.gather(*(embed_product(product) for product in products))
  except (BotoCoreError, ClientError, ValueError, json.JSONDecodeError) as exc:
    logger.warning(
      "[aura:products] semantic-match:embedding-failed reason=%s",
      exc.__class__.__name__,
    )
    return products, False

  ranked_products: list[dict[str, Any]] = []
  has_semantic_score = False
  has_structured_signals = isinstance(profile.get("matchSignals"), dict)
  semantic_weight = (
    STRUCTURED_SEMANTIC_MATCH_WEIGHT
    if has_structured_signals
    else SEMANTIC_MATCH_WEIGHT
  )
  minimum_match_rate = 20 if has_structured_signals else 62

  for product, product_embedding in zip(products, product_embeddings):
    category = _normalize_category(product.get("category"))
    profile_embedding = profile_embedding_by_category.get(category or "")

    if not profile_embedding or not product_embedding:
      ranked_products.append(product)
      continue

    similarity = _cosine_similarity(profile_embedding or [], product_embedding)
    semantic_rate = _semantic_match_rate(similarity)
    has_semantic_score = True
    rule_score = product.get("matchRate")
    rule_score = rule_score if isinstance(rule_score, int) else _parse_price(rule_score)
    next_product = {
      **product,
      # F7: 색상 가산·감산은 rule 단계(_score_product_match)에서 이미 반영됐다 —
      # 시맨틱 결합 뒤 _color_match_adjustment로 재가산하던 이중 가산은 제거.
      "matchRate": _combine_match_rate(
        rule_score or 74,
        semantic_rate,
        semantic_weight=semantic_weight,
        minimum=minimum_match_rate,
      ),
      "semanticScore": round(similarity, 4),
      "semanticMatchRate": semantic_rate,
      "reason": _semantic_reason(product, semantic_rate),
    }
    ranked_products.append(next_product)

  if not has_semantic_score:
    return products, False

  return (
    sorted(ranked_products, key=lambda product: product["matchRate"], reverse=True),
    True,
  )


def _has_korean(value: str) -> bool:
  return bool(re.search(r"[가-힣]", value))


def _localized_product_name(title: str, category: str) -> str:
  if _has_korean(title):
    return title

  return f"{CATEGORY_CONFIG[category]['label']} 추천 상품"


def _build_sets(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
  by_category = {
    category: [product for product in products if product["category"] == category]
    for category in PRODUCT_CATEGORIES
  }

  daily_ids = [
    *(product["id"] for product in by_category["lip"][:1]),
    *(product["id"] for product in by_category["cheek"][:1]),
    *(product["id"] for product in by_category["shadow"][:1]),
  ]
  clear_ids = [
    *(product["id"] for product in by_category["base"][:1]),
    *(product["id"] for product in by_category["liner"][:1]),
    *(product["id"] for product in by_category["lip"][1:2]),
  ]

  sets = []

  if len(daily_ids) >= 2:
    sets.append(
      {
        "id": "daily-k-beauty-set",
        "title": "데일리 K-뷰티 조합",
        "description": "립, 치크, 아이섀도우를 한 번에 맞춰 데일리 룩으로 쓰기 좋은 조합",
        "productIds": daily_ids,
      },
    )

  if len(clear_ids) >= 2:
    sets.append(
      {
        "id": "clear-base-point-set",
        "title": "맑은 베이스 포인트 조합",
        "description": "베이스를 깨끗하게 잡고 립이나 라인으로 포인트를 주는 조합",
        "productIds": clear_ids,
      },
    )

  return sets


def _build_makeup_look(profile: dict[str, Any] | None) -> dict[str, Any]:
  if not profile:
    return DEFAULT_MAKEUP_LOOK

  primary_makeup = _primary_recommended_makeup(profile)
  targets = _target_terms(profile)
  title = (
    _clean_text(primary_makeup.get("title") if primary_makeup else "") or
    _clean_text(profile.get("recommendedMood")) or
    _clean_text(profile.get("personalColor")) or
    DEFAULT_MAKEUP_LOOK["title"]
  )
  description = (
    _clean_text(primary_makeup.get("description") if primary_makeup else "") or
    _clean_text(primary_makeup.get("subtitle") if primary_makeup else "") or
    _clean_text(profile.get("skinAnalysisSummary")) or
    _clean_text(profile.get("summary")) or
    _clean_text(profile.get("shortSummary")) or
    DEFAULT_MAKEUP_LOOK["description"]
  )
  palette = _palette_for_makeup(profile, primary_makeup)
  tags = _dedupe(
    [
      *(_as_list(primary_makeup.get("tags") if primary_makeup else None)),
      _clean_text(profile.get("personalColor")),
      _clean_text(profile.get("skinType")),
      *targets["colors"],
      *targets["finishes"],
    ],
  )[:4]

  return {
    **DEFAULT_MAKEUP_LOOK,
    "description": description,
    "imageUrl": (
      _first_makeup_image_url(primary_makeup)
      if primary_makeup
      else DEFAULT_MAKEUP_LOOK["imageUrl"]
    ),
    "palette": palette,
    "tags": tags or DEFAULT_MAKEUP_LOOK["tags"],
    "title": title,
  }


def _fallback_products(category: str | None = None) -> list[dict[str, Any]]:
  return []


def _map_naver_item(
  item: dict[str, Any],
  category: str,
  index: int,
  profile: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
  title = _clean_text(item.get("title"))
  link = _clean_text(item.get("link"))
  image_url = _clean_text(item.get("image"))
  product_id = _clean_text(item.get("productId"))

  if not title or not link or not image_url or not product_id:
    return None
  link = _safe_naver_result_url(link)
  image_url = _safe_naver_result_url(image_url)
  if not link or not image_url:
    return None

  if not _is_naver_cosmetic_item_for_category(item, category):
    return None

  config = CATEGORY_CONFIG[category]
  mall_name = _clean_text(item.get("mallName"))
  brand = _clean_text(item.get("brand"))
  maker = _clean_text(item.get("maker"))
  brand_name = brand or maker or mall_name or "NAVER 쇼핑"
  category_tags = _dedupe(
    [
      _clean_text(item.get("category2")),
      _clean_text(item.get("category3")),
      _clean_text(item.get("category4")),
      mall_name,
    ],
  )
  specs = _extract_product_specs(
    brand=brand,
    category=category,
    maker=maker,
    product_id=product_id,
    raw_text=title,
    source=item,
  )
  match_rate, matched_terms = _score_product_match(specs, category, index, profile)

  return {
    "id": f"naver-{product_id}" if product_id else _stable_external_id("naver", link),
    "brandName": brand_name,
    "sellerName": mall_name or (urlparse(link).hostname or "외부 판매처"),
    "productName": _localized_product_name(title, category),
    "shadeName": "",
    "category": category,
    "matchRate": match_rate,
    "price": _parse_price(item.get("lprice")),
    "tags": _product_tags(category_tags, specs, matched_terms, ["국내 쇼핑", config["label"]]),
    "imageUrl": image_url,
    "purchaseUrl": link,
    "palette": config["palette"],
    "productInfo": specs,
    "reason": _match_reason(category, matched_terms, profile),
  }


async def _fetch_naver_category_products(
  client: httpx.AsyncClient,
  settings: Settings,
  category: str,
  profile: dict[str, Any] | None = None,
  query_override: str | None = None,
) -> list[dict[str, Any]]:
  queries = _dedupe(
    [
      _clean_text(query_override),
      _build_category_query(category, profile),
      CATEGORY_CONFIG[category]["query"],
      *CATEGORY_FALLBACK_QUERIES.get(category, ()),
    ],
  )
  products: list[dict[str, Any]] = []
  seen_product_ids: set[str] = set()
  headers = {
    "X-Naver-Client-Id": settings.naver_shopping_client_id,
    "X-Naver-Client-Secret": settings.naver_shopping_client_secret,
  }

  for query in queries:
    response = await client.get(
      "https://openapi.naver.com/v1/search/shop.json",
      headers=headers,
      params={
        "display": 40,
        "exclude": "used:rental:cbshop",
        "filter": "naverpay",
        "query": query,
        "sort": "sim",
        "start": 1,
      },
    )
    response.raise_for_status()
    data = response.json()

    for item_index, item in enumerate(data.get("items", [])):
      product = _map_naver_item(item, category, len(products) + item_index, profile)

      if not product or product["id"] in seen_product_ids:
        continue

      seen_product_ids.add(product["id"])
      products.append(product)

    if len(products) >= 8:
      break

  return sorted(products, key=lambda product: product["matchRate"], reverse=True)[:8]


async def _fetch_naver_products(
  settings: Settings,
  category: str | None = None,
  profile: dict[str, Any] | None = None,
  query_override: str | None = None,
) -> list[dict[str, Any]]:
  if not settings.naver_shopping_client_id or not settings.naver_shopping_client_secret:
    return []

  categories = [_normalize_category(category)] if _normalize_category(category) else list(PRODUCT_CATEGORIES)
  products: list[dict[str, Any]] = []

  async with httpx.AsyncClient(timeout=6.0) as client:
    results = await asyncio.gather(
      *(
        _fetch_naver_category_products(
          client,
          settings,
          product_category,
          profile,
          query_override=query_override,
        )
        for product_category in categories
        if product_category
      ),
      return_exceptions=True,
    )

  for result in results:
    if isinstance(result, Exception):
      continue

    products.extend(result)

  unique_products = []
  seen_ids = set()

  for product in products:
    if product["id"] in seen_ids:
      continue

    seen_ids.add(product["id"])
    unique_products.append(product)

  return unique_products


async def fetch_live_naver_products_for_queries(
  settings: Settings,
  queries_by_category: dict[str, str],
  *,
  per_category: int = 3,
) -> list[dict[str, Any]]:
  """Fetch real Naver Shopping items for a local live-discovery shelf.

  This stays behind the production-safe Auradin discovery flag and never writes
  external records into the trusted catalog.
  """
  if not (
    settings.auradin_live_discovery_enabled
    and settings.naver_shopping_client_id
    and settings.naver_shopping_client_secret
  ):
    return []
  category_queries = [
    (category, query.strip())
    for category, query in queries_by_category.items()
    if category in PRODUCT_CATEGORIES and query.strip()
  ]
  if not category_queries:
    return []
  async with httpx.AsyncClient(timeout=6.0) as client:
    results = await asyncio.gather(
      *(
        _fetch_naver_category_products(
          client,
          settings,
          category,
          None,
          query_override=query,
        )
        for category, query in category_queries
      ),
      return_exceptions=True,
    )
  products: list[dict[str, Any]] = []
  seen_ids: set[str] = set()
  successful_results: list[list[dict[str, Any]]] = []
  for result in results:
    if isinstance(result, Exception):
      logger.info("live seasonal product query failed", exc_info=result)
      continue
    successful_results.append(result[:per_category])
  # Round-robin keeps a 12-item hub shelf balanced across all six categories
  # instead of exhausting the first four category queries before truncation.
  for position in range(per_category):
    for result in successful_results:
      if position >= len(result):
        continue
      product = result[position]
      if product["id"] in seen_ids:
        continue
      seen_ids.add(product["id"])
      products.append(product)
  return products


def _map_db_product(
  row: dict[str, Any],
  index: int,
  profile: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
  category = _normalize_stored_category(row.get("category"))

  if not category:
    return None

  payload = row.get("product_payload") or {}
  if isinstance(payload, str):
    # asyncpg는 jsonb를 코덱 미설정 시 str로 돌려준다 — 실DB에서 liked 목록이
    # 통째로 비던 원인(purchaseUrl을 못 읽어 전 행 drop). fake DB dict 테스트만 있었음.
    try:
      payload = json.loads(payload)
    except (TypeError, ValueError):
      payload = {}
  if not isinstance(payload, dict):
    payload = {}

  config = CATEGORY_CONFIG[category]
  brand_name = _clean_text(row.get("brand_name")) or "AURA"
  product_name = _clean_text(row.get("product_name"))
  shade_name = _clean_text(row.get("shade_name"))
  purchase_url = _clean_text(row.get("trusted_purchase_url"))
  image_url = _clean_text(row.get("trusted_image_url"))

  if not purchase_url or not image_url:
    return None

  specs = _extract_product_specs(
    brand=brand_name,
    category=category,
    maker=_clean_text(payload.get("maker") or payload.get("manufacturer")),
    product_id=_clean_text(payload.get("productNumber") or payload.get("product_number") or row.get("external_key")),
    raw_text=" ".join(
      [
        product_name,
        shade_name,
        " ".join(row.get("tags") or []),
        " ".join(row.get("palette") or []),
        json.dumps(payload, ensure_ascii=False),
      ],
    ),
    source=payload,
  )
  match_rate, matched_terms = _score_product_match(specs, category, index, profile)
  has_structured_signals = bool(
    profile and isinstance(profile.get("matchSignals"), dict)
  )
  match_reason = _match_reason(category, matched_terms, profile)

  return {
    "id": str(row.get("id") or _stable_external_id("db", purchase_url)),
    "brandName": brand_name,
    "productName": _localized_product_name(product_name, category),
    "shadeName": shade_name,
    "category": category,
    "matchRate": match_rate if has_structured_signals else (_parse_price(payload.get("matchRate")) or match_rate),
    "price": _parse_price(row.get("price_krw")),
    "tags": _product_tags(row.get("tags") or [], specs, matched_terms, [config["label"]]),
    "imageUrl": image_url,
    "purchaseUrl": purchase_url,
    "palette": row.get("palette") or config["palette"],
    "productInfo": specs,
    "reason": match_reason if has_structured_signals else (payload.get("reason") or match_reason),
  }


async def _fetch_db_products(
  db: Database,
  category: str | None = None,
  profile: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
  if not db.is_connected:
    return []

  normalized_category = _normalize_category(category)

  if normalized_category:
    rows = await db.fetch(
      """
      select p.*, asset.asset_url as trusted_image_url,
        offer.purchase_url as trusted_purchase_url
      from products p
      join lateral (
        select a.asset_url from product_assets a
        where a.product_id=p.id and a.is_active=true and a.asset_type='packshot'
          and a.license_status='valid' and a.allowed_uses @> array['mobile_display']::text[]
          and (a.valid_from is null or a.valid_from<=now())
          and (a.valid_until is null or a.valid_until>now())
        order by a.reviewed_at desc nulls last limit 1
      ) asset on true
      join lateral (
        select o.purchase_url from product_offers o
        where o.product_id=p.id and o.is_active=true
          and o.availability_status in ('in_stock','limited')
          and o.license_status='valid' and o.allowed_uses @> array['mobile_display']::text[]
          and (o.valid_until is null or o.valid_until>now())
        order by o.price_updated_at desc nulls last limit 1
      ) offer on true
      where p.is_active = true and p.category = $1
        and p.catalog_status = 'published' and p.license_status = 'valid'
        and p.allowed_uses @> array['mobile_display', 'recommendation']::text[]
        and (p.license_valid_from is null or p.license_valid_from <= now())
        and (p.license_valid_until is null or p.license_valid_until > now())
      order by p.created_at desc
      limit 50
      """,
      normalized_category,
    )
  else:
    rows = await db.fetch(
      """
      select p.*, asset.asset_url as trusted_image_url,
        offer.purchase_url as trusted_purchase_url
      from products p
      join lateral (
        select a.asset_url from product_assets a
        where a.product_id=p.id and a.is_active=true and a.asset_type='packshot'
          and a.license_status='valid' and a.allowed_uses @> array['mobile_display']::text[]
          and (a.valid_from is null or a.valid_from<=now())
          and (a.valid_until is null or a.valid_until>now())
        order by a.reviewed_at desc nulls last limit 1
      ) asset on true
      join lateral (
        select o.purchase_url from product_offers o
        where o.product_id=p.id and o.is_active=true
          and o.availability_status in ('in_stock','limited')
          and o.license_status='valid' and o.allowed_uses @> array['mobile_display']::text[]
          and (o.valid_until is null or o.valid_until>now())
        order by o.price_updated_at desc nulls last limit 1
      ) offer on true
      where p.is_active = true
        and p.catalog_status = 'published' and p.license_status = 'valid'
        and p.allowed_uses @> array['mobile_display', 'recommendation']::text[]
        and (p.license_valid_from is null or p.license_valid_from <= now())
        and (p.license_valid_until is null or p.license_valid_until > now())
      order by p.created_at desc
      limit 50
      """,
    )

  products = []

  for index, row in enumerate(rows):
    product = _map_db_product(row, index, profile)

    if product:
      products.append(product)

  return sorted(products, key=lambda product: product["matchRate"], reverse=True)


async def _fetch_packaged_auradin_products(
  db: Database,
  category: str | None = None,
  profile: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
  """Adapt the packaged external catalog to the compatibility endpoint shape."""

  # Local import avoids making the adapter -> URL validator dependency circular.
  from app.services.product_external_catalog import get_auradin_catalog_products

  normalized_category = _normalize_category(category)
  categories = [normalized_category] if normalized_category else list(PRODUCT_CATEGORIES)
  cards = await get_auradin_catalog_products(
    db,
    user_id=None,
    limit=48,
    categories=categories,
    strategy="popular",
  )
  products: list[dict[str, Any]] = []
  for index, card in enumerate(cards):
    product_category = _normalize_category(card.get("category"))
    if not product_category:
      continue
    specs = _extract_product_specs(
      brand=_clean_text(card.get("brandName")),
      category=product_category,
      maker="",
      product_id=_clean_text(card.get("productId")),
      raw_text=" ".join(
        [
          _clean_text(card.get("productName")),
          _clean_text(card.get("finish")),
          _clean_text(card.get("colorFamily")),
          _clean_text(card.get("texture")),
        ]
      ),
      source=card,
    )
    match_rate, matched_terms = _score_product_match(specs, product_category, index, profile)
    price = card.get("price") if isinstance(card.get("price"), dict) else {}
    products.append(
      {
        "id": card["productId"],
        "externalSource": card["externalSource"],
        "brandName": card["brandName"],
        "productName": card["productName"],
        "shadeName": "",
        "category": product_category,
        "matchRate": match_rate,
        "price": _parse_price(price.get("amount")),
        "tags": _product_tags([], specs, matched_terms, [CATEGORY_CONFIG[product_category]["label"]]),
        "imageUrl": card["imageUrl"],
        "purchaseUrl": card["purchaseUrl"],
        "palette": card.get("palette") or CATEGORY_CONFIG[product_category]["palette"],
        "productInfo": specs,
        "reason": _match_reason(product_category, matched_terms, profile),
      }
    )
  return products


async def _fetch_report_profile(
  db: Database,
  *,
  auth_provider: str | None = None,
  oauth_sub: str | None = None,
  report_id: str | None = None,
) -> dict[str, Any] | None:
  if not db.is_connected or not oauth_sub:
    return None

  if report_id:
    try:
      UUID(report_id)
    except ValueError:
      report_id = None

  if report_id:
    row = await db.fetchrow(
      """
      select r.*
      from analysis_reports r
      join users u on u.id = r.user_id
      where r.id = $1::uuid
        and u.auth_provider = $2
        and u.oauth_sub = $3
        and u.deleted_at is null
        and r.deleted_at is null
      limit 1
      """,
      report_id,
      auth_provider,
      oauth_sub,
    )
  else:
    row = await db.fetchrow(
      """
      select r.*
      from analysis_reports r
      join users u on u.id = r.user_id
      where u.auth_provider = $1
        and u.oauth_sub = $2
        and u.deleted_at is null
        and r.deleted_at is null
        and r.status = 'completed'
      order by coalesce(r.analyzed_at, r.created_at) desc
      limit 1
      """,
      auth_provider,
      oauth_sub,
    )

  return _normalize_report_payload(row)


async def build_product_recommendation_data(
  db: Database,
  settings: Settings,
  category: str | None = None,
  auth_provider: str | None = None,
  look_index: int | None = None,
  oauth_sub: str | None = None,
  report_id: str | None = None,
  profile_override: dict[str, Any] | None = None,
  query_override: str | None = None,
) -> tuple[dict[str, Any], str]:
  source = "fallback"
  products: list[dict[str, Any]] = []
  profile = profile_override if isinstance(profile_override, dict) else await _fetch_report_profile(
    db,
    auth_provider=auth_provider,
    oauth_sub=oauth_sub,
    report_id=report_id,
  )
  if profile is not None and isinstance(look_index, int) and look_index >= 0:
    profile["selectedRecommendedMakeupIndex"] = look_index

  if settings.legacy_naver_product_search:
    try:
      products = await _fetch_naver_products(
        settings,
        category,
        profile,
        query_override=query_override,
      )
      if products:
        source = "naver_shopping_matched" if profile else "naver_shopping"
    except (httpx.HTTPError, ValueError):
      products = []

  if not products:
    products = await _fetch_db_products(db, category, profile)
    if products:
      source = "database_matched" if profile else "database"

  if not products:
    products = await _fetch_packaged_auradin_products(db, category, profile)
    if products:
      source = "auradin_catalog_matched" if profile else "auradin_catalog"

  if products and profile:
    products, semantic_applied = await _apply_semantic_product_scores(
      products,
      settings,
      profile,
    )

    if semantic_applied:
      source = f"{source}_semantic"

  return (
    {
      "userNickname": "고객",
      "makeupLook": _build_makeup_look(profile) if profile else {
        "title": "분석 기준 없음",
        "description": "연결된 분석이나 추천 기준 룩이 없어요.",
        "imageUrl": None,
        "palette": [],
        "tags": [],
      },
      "makeupLookOptions": _build_makeup_look_options(profile) if profile else [],
      "tabs": TABS,
      "products": products,
      "sets": _build_sets(products),
    },
    source,
  )
