from __future__ import annotations

import re
from typing import Any


SUPPORTED_CATEGORIES = {"lip", "cheek", "shadow"}
KNOWN_CATEGORIES = SUPPORTED_CATEGORIES | {"base", "brow", "liner"}

CATEGORY_TERMS = {
  "lip": ("립", "틴트", "립스틱", "글로스", "입술", "lip", "tint", "gloss"),
  "cheek": ("블러셔", "블러쉬", "치크", "볼터치", "blush", "cheek"),
  # 글리터/반짝/스파클은 아이섀도우 의도로 해석한다 (완료정의: shadow로 잠금).
  # 카테고리 잠금은 완화가 아니라 추론이므로 §9 위배 아님 — caveat로 투명하게 노출.
  "shadow": ("섀도우", "쉐도우", "아이섀도", "아이섀도우", "팔레트", "글리터", "반짝", "스파클", "shadow", "palette", "glitter", "sparkle"),
  "base": ("베이스", "쿠션", "파운데이션", "파데", "foundation", "cushion", "base"),
  "brow": ("브로우", "아이브로우", "눈썹", "brow", "eyebrow"),
  "liner": ("아이라이너", "라이너", "아이라인", "liner", "eyeliner"),
}

COLOR_TERMS = {
  "pink": ("핑크", "pink"),
  "rose": ("로즈", "rose"),
  "coral": ("코랄", "coral", "자몽"),
  "red": ("레드", "red", "체리"),
  "orange": ("오렌지", "orange"),
  "mauve": ("모브", "mauve", "뮤트"),
  "brown": ("브라운", "brown", "라떼"),
  "nude": ("누드", "nude", "베이지"),
  "peach": ("피치", "peach", "살구"),
  "burgundy": ("버건디", "burgundy"),
  # data 카논은 "plum"(35개), "burgundy"는 0개 — 플럼/베리/와인은 plum으로 정렬해야 매칭된다.
  "plum": ("플럼", "plum", "베리", "berry", "와인", "wine"),
}

FINISH_TERMS = {
  "glossy": ("글로시", "광택", "촉촉", "물먹", "탕후루", "gloss", "glossy"),
  "matte": ("매트", "보송", "matte"),
  "velvet": ("벨벳", "블러", "velvet", "blur"),
  "satin": ("새틴", "satin"),
  "shimmer": ("쉬머", "펄", "은은한 펄", "글리터", "반짝", "스파클", "shimmer", "pearl", "glitter", "sparkle"),
}

TEXTURE_TERMS = {
  "tint": ("틴트", "tint"),
  "balm": ("밤", "balm"),
  "gloss": ("글로스", "gloss"),
  "cream": ("크림", "cream"),
  "powder": ("파우더", "powder"),
  "liquid": ("리퀴드", "liquid"),
  "palette": ("팔레트", "palette"),
}

UNDERTONE_TERMS = {
  "cool": ("쿨톤", "쿨", "cool"),
  "warm": ("웜톤", "웜", "warm"),
  "neutral": ("뉴트럴", "neutral"),
}

INTENSITY_TERMS = {
  "sheer": ("진하지", "은은", "자연", "맑", "시어", "연한", "sheer", "light"),
  "medium": ("데일리", "daily", "무난"),
  "bold": ("고발색", "선명", "강한", "딥", "bold", "deep"),
}

OCCASION_TERMS = {
  "daily": ("데일리", "매일", "daily"),
  "interview": ("면접", "출근", "오피스", "interview", "office"),
}


def _contains(text: str, terms: tuple[str, ...]) -> bool:
  lowered = text.lower()
  return any(term.lower() in lowered for term in terms)


def _filter(attribute: str, op: str, *, values: list[str] | None = None, number_value: int | None = None) -> dict[str, Any]:
  payload: dict[str, Any] = {
    "attribute": attribute,
    "op": op,
    "source": "prompt",
    "locked": True,
    "confidence": 0.9,
    "mode": "hard",
  }
  if values is not None:
    payload["values"] = values
  if number_value is not None:
    payload["numberValue"] = number_value
  return payload


def _soft(attribute: str, values: list[str], *, weight: float = 1.0, confidence: float = 0.7, avoid_values: list[str] | None = None) -> dict[str, Any]:
  payload: dict[str, Any] = {
    "attribute": attribute,
    "values": values,
    "source": "prompt",
    "confidence": confidence,
    "weight": weight,
  }
  if avoid_values:
    payload["avoidValues"] = avoid_values
  return payload


def _parse_category(text: str) -> str | None:
  for category, terms in CATEGORY_TERMS.items():
    if _contains(text, terms):
      return category
  return None


def _parse_price_lte(text: str) -> int | None:
  normalized = text.replace(",", "")
  match = re.search(r"(\d+(?:\.\d+)?)\s*만\s*원?\s*(?:이하|까지|안쪽|미만|under)?", normalized)
  if match:
    return int(float(match.group(1)) * 10000)

  match = re.search(r"(\d+)\s*천\s*원?\s*(?:이하|까지|안쪽|미만|under)?", normalized)
  if match:
    return int(match.group(1)) * 1000

  match = re.search(r"(\d{4,6})\s*원?\s*(?:이하|까지|안쪽|미만|under)", normalized)
  if match:
    return int(match.group(1))

  return None


def _append_soft_matches(text: str, mapping: dict[str, tuple[str, ...]], attribute: str, output: list[dict[str, Any]], *, weight: float = 1.0) -> None:
  values = [value for value, terms in mapping.items() if _contains(text, terms)]
  if values:
    output.append(_soft(attribute, values, weight=weight))


def parse_intent(
  prompt: str,
  *,
  report_id: str | None = None,
  source: str | None = None,
  context: dict[str, Any] | None = None,
) -> dict[str, Any]:
  text = str(prompt or "").strip()
  locked_filters: list[dict[str, Any]] = []
  soft_preferences: list[dict[str, Any]] = []
  category = _parse_category(text)
  unsupported_category = category if category in KNOWN_CATEGORIES - SUPPORTED_CATEGORIES else None

  if category in SUPPORTED_CATEGORIES:
    locked_filters.append(_filter("category", "eq", values=[category]))

  price_lte = _parse_price_lte(text)
  if price_lte:
    locked_filters.append(_filter("priceKrw", "lte", number_value=price_lte))

  if _contains(text, ("올리브영", "olive young", "oliveyoung")):
    locked_filters.append(_filter("channel", "eq", values=["oliveyoung"]))
  elif _contains(text, ("백화점", "department", "현대", "롯데백화점", "신세계")):
    locked_filters.append(_filter("channel", "eq", values=["department_store"]))

  _append_soft_matches(text, COLOR_TERMS, "colorFamily", soft_preferences, weight=0.9)
  _append_soft_matches(text, UNDERTONE_TERMS, "undertone", soft_preferences, weight=0.6)
  _append_soft_matches(text, FINISH_TERMS, "finish", soft_preferences, weight=0.9)
  _append_soft_matches(text, TEXTURE_TERMS, "texture", soft_preferences, weight=0.75)
  _append_soft_matches(text, INTENSITY_TERMS, "intensity", soft_preferences, weight=0.7)
  _append_soft_matches(text, OCCASION_TERMS, "occasion", soft_preferences, weight=0.65)

  if _contains(text, ("글리터 강한", "강한 글리터", "과한 글리터")):
    soft_preferences.append(
      _soft("finish", ["shimmer"], weight=0.8, confidence=0.65, avoid_values=["glitter"]),
    )

  has_hard_detail = any(filter_["attribute"] in {"category", "priceKrw", "channel"} for filter_ in locked_filters)
  has_descriptive_detail = bool(soft_preferences)
  broad = not has_hard_detail and not has_descriptive_detail
  if category is None and _contains(text, ("추천", "제품", "데일리", "쓸 만한", "찾아")):
    broad = True

  return {
    "prompt": text,
    "reportId": report_id,
    "source": source or "freePrompt",
    "context": context or {},
    "category": category,
    "unsupportedCategory": unsupported_category,
    "lockedFilters": locked_filters,
    "softPreferences": soft_preferences,
    "broad": broad,
    "requiresQuestion": broad or bool(soft_preferences),
  }

