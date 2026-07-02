from __future__ import annotations

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
