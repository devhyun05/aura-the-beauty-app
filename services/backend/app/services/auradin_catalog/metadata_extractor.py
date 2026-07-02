from __future__ import annotations

import re
from typing import Any

from .text import clean_text


COLOR_TERMS: dict[str, tuple[str, ...]] = {
  "pink": ("핑크", "pink", "피오니", "베이비핑크"),
  "rose": ("로즈", "rose", "로지", "말린장미"),
  "coral": ("코랄", "coral"),
  "red": ("레드", "red"),
  "orange": ("오렌지", "orange"),
  "mauve": ("모브", "mauve"),
  "brown": ("브라운", "brown", "초코", "카라멜"),
  "nude": ("누드", "nude", "베이지", "beige"),
  "peach": ("피치", "peach", "복숭아"),
  "burgundy": ("버건디", "burgundy", "와인"),
}

FINISH_TERMS: dict[str, tuple[str, ...]] = {
  "matte": ("매트", "보송", "무광", "matte"),
  "velvet": ("벨벳", "velvet", "블러", "blur"),
  "satin": ("새틴", "satin", "세미매트", "semi-matte"),
  "sheer": ("쉬어", "투명", "맑은", "sheer"),
  "shimmer": ("쉬머", "펄", "글리터", "shimmer", "glitter"),
  "glossy": ("글로우", "광택", "물먹", "glossy", "gloss", "dewy", "글로이"),
}

TEXTURE_TERMS: dict[str, tuple[str, ...]] = {
  "tint": ("틴트", "tint"),
  "balm": ("밤", "balm"),
  "lipstick": ("립스틱", "lipstick", "립 매트"),
  "gloss": ("글로스", "gloss"),
  "cream": ("크림", "cream"),
  "powder": ("파우더", "powder", "팔레트", "팩트"),
  "pencil": ("펜슬", "pencil"),
  "liquid": ("리퀴드", "liquid"),
  "cushion": ("쿠션", "cushion"),
}

INTENSITY_TERMS: dict[str, tuple[str, ...]] = {
  "sheer": ("쉬어", "투명", "맑은", "자연스러운", "데일리", "은은한"),
  "medium": ("선명", "buildable"),
  "bold": ("고발색", "진한", "intense", "vivid", "딥", "볼드"),
}

UNDERTONE_TERMS: dict[str, tuple[str, ...]] = {
  "warm": ("웜톤", "봄웜", "가을웜", "warm", "coral", "orange", "peach", "brick"),
  "cool": ("쿨톤", "여름쿨", "겨울쿨", "cool", "mauve", "berry", "plum"),
  "neutral": ("뉴트럴", "neutral", "beige", "mlbb"),
}


def _find_first(text: str, term_map: dict[str, tuple[str, ...]]) -> str | None:
  lowered = text.lower()

  for value, terms in term_map.items():
    if any(term.lower() in lowered for term in terms):
      return value

  return None


def _extract_shade_name(title: str) -> str | None:
  # Common Korean cosmetic titles use shade counts like "8COLOR" or shade numbers like "05 로즈".
  match = re.search(r"\b(?:no\.?\s*)?(\d{1,2})\s*([가-힣A-Za-z][가-힣A-Za-z0-9\s]{1,16})", title, re.IGNORECASE)

  if not match:
    return None

  shade = clean_text(f"{match.group(1)} {match.group(2)}")
  blocked_words = ("color", "colors", "컬러", "종", "개", "기획", "단품")

  if any(word in shade.lower() for word in blocked_words):
    return None

  return shade


def infer_title_metadata(
  *,
  title: str,
  category: str,
  source_url: str,
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, float]]:
  cleaned_title = clean_text(title)
  metadata: dict[str, Any] = {}
  evidence: list[dict[str, Any]] = []
  confidence: dict[str, float] = {}

  shade_name = _extract_shade_name(cleaned_title)

  if shade_name:
    metadata["shadeName"] = shade_name
    metadata["shadeSource"] = "title_inferred"
    confidence["shadeName"] = 0.45

  for field, term_map, score in (
    ("colorFamily", COLOR_TERMS, 0.5),
    ("undertone", UNDERTONE_TERMS, 0.45),
    ("finish", FINISH_TERMS, 0.55),
    ("texture", TEXTURE_TERMS, 0.55),
    ("intensity", INTENSITY_TERMS, 0.45),
  ):
    value = _find_first(cleaned_title, term_map)

    if value:
      metadata[field] = value
      confidence[field] = score

  if category == "shadow" and "팔레트" in cleaned_title:
    metadata.setdefault("texture", "powder")
    confidence.setdefault("texture", 0.55)

  if category == "base" and "커버" in cleaned_title:
    metadata["coverage"] = "coverage"
    confidence["coverage"] = 0.45

  for field, value in metadata.items():
    evidence.append(
      {
        "field": field,
        "value": value,
        "sourceType": "naver_api",
        "sourceUrl": source_url,
        "rawLabel": "productName",
        "rawText": cleaned_title,
      },
    )

  return metadata, evidence, confidence
