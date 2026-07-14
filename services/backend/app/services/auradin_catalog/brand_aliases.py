from __future__ import annotations

import re
from typing import Any

from .text import clean_text


BRAND_ALIASES: dict[str, tuple[str, ...]] = {
  "데이지크": ("데이지크", "dasique"),
  "롬앤": ("롬앤", "romand", "rom&nd", "rom nd"),
  "페리페라": ("페리페라", "peripera"),
  "웨이크메이크": ("웨이크메이크", "wakemake"),
  "클리오": ("클리오", "clio"),
  "투쿨포스쿨": ("투쿨포스쿨", "too cool for school", "toocoolforschool"),
  "컬러그램": ("컬러그램", "colorgram"),
  "하트퍼센트": ("하트퍼센트", "heart percent", "heartpercent"),
  "에뛰드": ("에뛰드", "etude"),
  "3CE": ("3CE", "쓰리씨이", "stylenanda 3ce"),
  "뮤드": ("뮤드", "mude"),
  "정샘물 뷰티": ("정샘물", "정샘물 뷰티", "jungsaemmool", "jung saem mool"),
  "에스쁘아": ("에스쁘아", "espoir"),
  "VDL": ("VDL", "브이디엘"),
  "더샘": ("더샘", "the saem", "thesaem"),
  "네이밍": ("네이밍", "naming"),
  "라카": ("라카", "laka"),
}

BRAND_PRIORITY: dict[str, int] = {
  "롬앤": 1,
  "페리페라": 2,
  "컬러그램": 3,
  "웨이크메이크": 4,
  "데이지크": 5,
  "클리오": 6,
  "정샘물 뷰티": 7,
  "3CE": 8,
  "에뛰드": 9,
  "더샘": 10,
  "VDL": 11,
  "라카": 12,
  "네이밍": 13,
  "투쿨포스쿨": 14,
  "하트퍼센트": 15,
  "에스쁘아": 16,
  "뮤드": 17,
}


_WORD_CHARACTER = r"0-9A-Za-z가-힣"


def _canonical_aliases(canonical_brand: str | None) -> tuple[str, ...]:
  requested = clean_text(canonical_brand)
  if not requested:
    return ()
  for brand, aliases in BRAND_ALIASES.items():
    if brand.casefold() == requested.casefold():
      # The canonical spelling is also a valid removable token even when an
      # alias table is accidentally incomplete. Longest-first is essential for
      # overlapping entries such as "정샘물 뷰티" / "정샘물".
      return tuple(sorted({brand, *aliases}, key=lambda value: (-len(value), value.casefold())))
  return ()


def find_brand_alias_spans(text: str, canonical_brand: str | None) -> list[dict[str, Any]]:
  """Find only *this product's* brand aliases in raw-title coordinates.

  A global alias scan would delete legitimate product words that happen to be
  another brand. Matches therefore come solely from ``canonical_brand``'s
  whitelist entry. Alphanumeric/Hangul boundaries prevent partial-word
  deletion; overlaps are resolved longest-first and returned in source order.
  """

  raw = str(text or "")
  candidates: list[tuple[int, int, str]] = []
  for alias in _canonical_aliases(canonical_brand):
    pattern = re.compile(
      rf"(?<![{_WORD_CHARACTER}]){re.escape(alias)}(?![{_WORD_CHARACTER}])",
      flags=re.IGNORECASE,
    )
    for match in pattern.finditer(raw):
      candidates.append((match.start(), match.end(), match.group(0)))

  # Prefer the longest candidate at a shared/overlapping location, then emit
  # non-overlapping spans in raw-title order.
  selected: list[tuple[int, int, str]] = []
  for start, end, token in sorted(candidates, key=lambda row: (-(row[1] - row[0]), row[0], row[1])):
    if any(start < kept_end and end > kept_start for kept_start, kept_end, _ in selected):
      continue
    selected.append((start, end, token))

  return [
    {"matchedToken": token, "start": start, "end": end}
    for start, end, token in sorted(selected, key=lambda row: (row[0], row[1]))
  ]


def remove_brand_alias_spans(text: str, canonical_brand: str | None) -> tuple[str, list[dict[str, Any]]]:
  """Blank brand spans without changing raw offsets."""

  raw = str(text or "")
  spans = find_brand_alias_spans(raw, canonical_brand)
  if not spans:
    return raw, []
  characters = list(raw)
  for span in spans:
    characters[int(span["start"]):int(span["end"])] = " " * (int(span["end"]) - int(span["start"]))
  return "".join(characters), spans


def normalize_brand(*values: object) -> str | None:
  searchable = " ".join(clean_text(value).lower() for value in values if clean_text(value))

  if not searchable:
    return None

  compact = searchable.replace(" ", "")

  for brand, aliases in BRAND_ALIASES.items():
    for alias in aliases:
      normalized_alias = alias.lower()

      if normalized_alias in searchable or normalized_alias.replace(" ", "") in compact:
        return brand

  return None
