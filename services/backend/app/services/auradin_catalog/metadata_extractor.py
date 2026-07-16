from __future__ import annotations

import re
from typing import Any

from .brand_aliases import remove_brand_alias_spans
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
  "cool": (
    "그레이쉬쿨", "여름쿨", "겨울쿨", "쿨톤", "여쿨", "겨쿨", "앙쿨",
    "cool", "mauve", "berry", "plum",
  ),
  "neutral": ("뉴트럴", "neutral", "beige", "mlbb"),
}

# A few legacy catalog rows derived undertone from a shade family instead of an
# explicit tone word. Keep that compatibility mapping in one place so rebuild
# sanitization and snapshot validation make the same decision after the brand
# span has been blanked.
COLOR_FAMILY_UNDERTONE_SUPPORT: dict[str, str] = {
  "coral": "warm",
  "orange": "warm",
  "peach": "warm",
  "mauve": "cool",
  "nude": "neutral",
}


def _find_first(text: str, term_map: dict[str, tuple[str, ...]]) -> tuple[str, str, int, int] | None:
  for value, terms in term_map.items():
    for term in sorted(terms, key=lambda candidate: (-len(candidate), candidate.casefold())):
      for match in re.finditer(re.escape(term), text, flags=re.IGNORECASE):
        if term.casefold() == "cool":
          before = text[match.start() - 1:match.start()]
          after = text[match.end():match.end() + 1]
          if (before and before.isascii() and before.isalpha()) or (
            after and after.isascii() and after.isalpha()
          ):
            continue
        return value, match.group(0), match.start(), match.end()

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
  brand: str | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, float]]:
  cleaned_title = clean_text(title)
  searchable_title, removed_brand_spans = remove_brand_alias_spans(cleaned_title, brand)
  metadata: dict[str, Any] = {}
  evidence: list[dict[str, Any]] = []
  confidence: dict[str, float] = {}
  evidence_spans: dict[str, dict[str, Any]] = {}

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
    match = _find_first(searchable_title, term_map)

    if match:
      value, matched_token, start, end = match
      metadata[field] = value
      confidence[field] = score
      evidence_spans[field] = {
        "matchedToken": matched_token,
        "matchedStart": start,
        "matchedEnd": end,
      }

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
        **evidence_spans.get(field, {}),
        "removedBrandSpans": removed_brand_spans,
      },
    )

  return metadata, evidence, confidence


def infer_brand_clean_undertone_evidence(
  *,
  title: str,
  category: str,
  brand: str | None,
  source_url: str = "",
) -> list[dict[str, Any]]:
  """Return undertone support found outside the current product's brand span.

  ``infer_title_metadata`` already blanks only the selected brand aliases while
  preserving raw offsets. This adapter also preserves the legacy shade-family
  inference (for example, Korean ``코랄`` -> warm and ``베이지`` ->
  neutral) without changing the live extractor's public metadata contract.
  """

  metadata, evidence, _confidence = infer_title_metadata(
    title=title,
    category=category,
    source_url=source_url,
    brand=brand,
  )
  support: list[dict[str, Any]] = []
  direct = next((row for row in evidence if row.get("field") == "undertone"), None)
  if direct is not None:
    support.append(dict(direct))

  color_family = str(metadata.get("colorFamily") or "").strip()
  derived_undertone = COLOR_FAMILY_UNDERTONE_SUPPORT.get(color_family)
  if derived_undertone and not any(row.get("value") == derived_undertone for row in support):
    color_evidence = next((row for row in evidence if row.get("field") == "colorFamily"), {})
    support.append(
      {
        **dict(color_evidence),
        "field": "undertone",
        "value": derived_undertone,
        "sourceType": "title_color_undertone_derived",
        "derivedFrom": color_family,
      },
    )

  return support
