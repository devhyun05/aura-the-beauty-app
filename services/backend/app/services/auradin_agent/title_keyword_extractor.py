from __future__ import annotations

import re
from typing import Any


TITLE_INFERENCE_SOURCE = "title_residual_rule_inferred"

FIELD_KEYWORDS: dict[str, dict[str, tuple[str, ...]]] = {
  "colorFamily": {
    "pink": ("핑크", "pink", "피오니", "로지", "베리", "berry"),
    "rose": ("로즈", "rose", "장미", "rosewood"),
    "coral": ("코랄", "coral", "자몽", "grapefruit"),
    "red": ("레드", "red", "체리", "cherry"),
    "orange": ("오렌지", "orange", "탠저린", "tangerine"),
    "mauve": ("모브", "mauve", "뮤트", "mute"),
    "brown": ("브라운", "brown", "라떼", "latte"),
    "nude": ("누드", "nude", "베이지", "beige"),
    "peach": ("피치", "peach", "복숭아", "살구", "apricot"),
    "burgundy": ("버건디", "burgundy", "와인", "wine", "플럼", "plum"),
  },
  "undertone": {
    "cool": ("쿨톤", "cool", "cooltone", "쿨"),
    "warm": ("웜톤", "warm", "warmtone", "웜"),
    "neutral": ("뉴트럴", "neutral", "내추럴", "natural"),
  },
  "intensity": {
    "sheer": ("시어", "sheer", "맑은", "투명", "은은", "라이트", "light"),
    "medium": ("미디엄", "medium", "데일리", "daily"),
    "bold": ("고발색", "bold", "딥", "deep", "강한", "선명"),
  },
  "finish": {
    "matte": ("매트", "matte", "보송"),
    "glossy": ("글로시", "gloss", "glossy", "광택", "물먹", "탕후루"),
    "satin": ("새틴", "satin"),
    "sheer": ("시어", "sheer", "투명"),
    "velvet": ("벨벳", "velvet", "블러", "blur"),
    "shimmer": ("쉬머", "shimmer", "펄", "pearl", "글리터", "glitter"),
  },
  "texture": {
    "balm": ("밤", "balm"),
    "tint": ("틴트", "tint"),
    "cream": ("크림", "cream"),
    "powder": ("파우더", "powder"),
    "gel": ("젤", "gel"),
    "stick": ("스틱", "stick"),
    "pencil": ("펜슬", "pencil"),
    "liquid": ("리퀴드", "liquid"),
    "gloss": ("글로스", "gloss"),
    "palette": ("팔레트", "palette"),
  },
  "sellingPoints": {
    "glow": ("글로우", "glow", "광", "윤광", "물광"),
    "blur": ("블러", "blur", "모공", "소프트포커스"),
    "longwear": ("롱웨어", "longwear", "지속", "lasting"),
    "moisturizing": ("촉촉", "moist", "보습", "수분"),
    "lightweight": ("가벼운", "lightweight", "라이트"),
    "daily": ("데일리", "daily", "자연스러운", "내추럴"),
    "vegan": ("비건", "vegan"),
  },
}

GENERIC_TITLE_TERMS = (
  "단품",
  "기획",
  "세트",
  "리필",
  "본품",
  "증정",
  "브러쉬",
  "브러시",
  "택",
  "옵션",
  "new",
  "only",
  "set",
  "refill",
)


def clean_text(value: Any) -> str:
  text = str(value or "")
  text = re.sub(r"<[^>]+>", " ", text)
  text = re.sub(r"[\[\]{}()/_+|·,:;!?'\"“”‘’]", " ", text)
  text = re.sub(r"\s+", " ", text)
  return text.strip()


def normalize_for_match(value: Any) -> str:
  text = clean_text(value).lower()
  text = re.sub(r"[^0-9a-z가-힣]+", " ", text)
  return re.sub(r"\s+", " ", text).strip()


def normalize_product_name(raw_title: str, brand_name: str | None = None) -> str:
  normalized = clean_text(raw_title)
  if brand_name:
    normalized = re.sub(re.escape(brand_name), " ", normalized, flags=re.IGNORECASE)
  normalized = re.sub(r"\b(new|only|set|refill)\b", " ", normalized, flags=re.IGNORECASE)
  normalized = re.sub(r"\s+", " ", normalized).strip()
  return normalized or clean_text(raw_title)


def _residual_text(raw_title: str, product_name: str, brand_name: str | None) -> str:
  residual = normalize_for_match(raw_title)
  product = normalize_for_match(product_name)
  brand = normalize_for_match(brand_name)

  for token in [brand, product]:
    if token:
      residual = residual.replace(token, " ")

  for token in GENERIC_TITLE_TERMS:
    residual = residual.replace(token.lower(), " ")

  return re.sub(r"\s+", " ", residual).strip()


def extract_residual_keywords(
  raw_title: str,
  product_name: str,
  brand_name: str | None = None,
) -> list[dict[str, Any]]:
  residual = _residual_text(raw_title, product_name, brand_name)
  searchable = f"{normalize_for_match(raw_title)} {residual}"
  keywords: list[dict[str, Any]] = []
  seen: set[tuple[str, str, str]] = set()

  for field, values in FIELD_KEYWORDS.items():
    for value, terms in values.items():
      for term in terms:
        normalized_term = normalize_for_match(term)
        if normalized_term and normalized_term in searchable:
          key = (field, value, normalized_term)
          if key in seen:
            continue
          seen.add(key)
          keywords.append(
            {
              "field": field,
              "value": value,
              "matchedToken": term,
              "normalizedToken": normalized_term,
              "confidence": 0.56 if field in {"finish", "texture"} else 0.5,
              "sourceType": TITLE_INFERENCE_SOURCE,
              "hardFilterEligible": False,
            },
          )
          break

  return keywords

