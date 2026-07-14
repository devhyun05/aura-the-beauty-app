from __future__ import annotations

import re
from typing import Any

from app.services.auradin_catalog.brand_aliases import remove_brand_alias_spans


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
  # A8: attributes may legitimately live in the product name itself. Removing
  # the whole product name loses controls such as 여쿨라/그레이쉬쿨/앙쿨모브;
  # re-attaching the original title, however, reintroduces the brand token and
  # made "투쿨포스쿨" infer undertone=cool. Search the complete title after
  # blanking only the canonical product brand aliases.
  del product_name  # kept in the public signature for compatibility/provenance.
  brand_cleaned, _spans = remove_brand_alias_spans(raw_title, brand_name)
  residual = normalize_for_match(brand_cleaned)
  for token in GENERIC_TITLE_TERMS:
    residual = residual.replace(token.lower(), " ")
  return re.sub(r"\s+", " ", residual).strip()


def _find_keyword_span(text: str, term: str) -> tuple[int, int, str] | None:
  """Return a raw-coordinate term match with narrow cooling false-positive guards."""

  for match in re.finditer(re.escape(term), text, flags=re.IGNORECASE):
    token = match.group(0)
    normalized = normalize_for_match(term)
    # Keep Korean compound controls (여쿨라, 그레이쉬쿨, 앙쿨모브), but never
    # turn the unrelated product-property word "쿨링" into an undertone.
    if normalized == "쿨" and text[match.end():match.end() + 1] == "링":
      continue
    # `cool` is meaningful as a token; `cooling` is not. `cooltone` has its
    # own longer alias and is evaluated first below.
    if normalized == "cool":
      before = text[match.start() - 1:match.start()]
      after = text[match.end():match.end() + 1]
      if (before and before.isascii() and before.isalpha()) or (after and after.isascii() and after.isalpha()):
        continue
    return match.start(), match.end(), token
  return None


def extract_residual_keywords(
  raw_title: str,
  product_name: str,
  brand_name: str | None = None,
) -> list[dict[str, Any]]:
  brand_cleaned_title, brand_spans = remove_brand_alias_spans(raw_title, brand_name)
  # Keep raw-title length/coordinates. `_residual_text` remains the normalized
  # compatibility surface, while extraction below records auditable raw spans.
  _residual_text(raw_title, product_name, brand_name)
  searchable = brand_cleaned_title
  keywords: list[dict[str, Any]] = []
  seen: set[tuple[str, str, str]] = set()

  for field, values in FIELD_KEYWORDS.items():
    for value, terms in values.items():
      for term in sorted(terms, key=lambda candidate: (-len(candidate), candidate.casefold())):
        normalized_term = normalize_for_match(term)
        span = _find_keyword_span(searchable, term) if normalized_term else None
        if span:
          key = (field, value, normalized_term)
          if key in seen:
            continue
          seen.add(key)
          start, end, matched_token = span
          keywords.append(
            {
              "field": field,
              "value": value,
              "matchedToken": matched_token,
              "normalizedToken": normalized_term,
              "matchedStart": start,
              "matchedEnd": end,
              "removedBrandSpans": brand_spans,
              "confidence": 0.56 if field in {"finish", "texture"} else 0.5,
              "sourceType": TITLE_INFERENCE_SOURCE,
              "hardFilterEligible": False,
            },
          )
          break

  return keywords
