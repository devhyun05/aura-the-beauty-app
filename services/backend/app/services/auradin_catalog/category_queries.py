from __future__ import annotations

from typing import Any


PRODUCT_CATEGORIES = ("lip", "shadow", "base", "cheek", "liner", "brow", "other")
COLLECTABLE_CATEGORIES = ("lip", "shadow", "base", "cheek", "liner", "brow")

CATEGORY_PRIORITY: dict[str, int] = {
  "lip": 0,
  "shadow": 1,
  "base": 1,
  "cheek": 2,
  "liner": 3,
  "brow": 3,
  "other": 9,
}

CATEGORY_TERMS: dict[str, tuple[str, ...]] = {
  "lip": ("lip", "gloss", "tint", "립", "립틴트", "틴트", "립스틱", "립글로스", "립밤"),
  "shadow": ("shadow", "palette", "섀도우", "섀도", "아이섀도우", "아이팔레트", "팔레트"),
  "base": ("base", "cushion", "foundation", "쿠션", "파운데이션", "베이스", "컨실러", "톤업"),
  "cheek": ("cheek", "blush", "블러셔", "블러쉬", "치크", "볼터치"),
  "liner": ("liner", "eyeliner", "라이너", "아이라이너", "젤라이너", "펜라이너"),
  "brow": ("brow", "eyebrow", "브로우", "아이브로우", "눈썹", "브로우카라"),
}

NON_COSMETIC_EXCLUDE_TERMS = (
  "가방",
  "구두",
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

COSMETIC_CATEGORY_TERMS = ("beauty", "뷰티", "미용", "색조", "화장품", "메이크업")

DEFAULT_CATEGORY_QUERIES: dict[str, tuple[str, ...]] = {
  "lip": ("{brand} 립틴트", "{brand} 립스틱", "{brand} 글로스"),
  "shadow": ("{brand} 아이섀도우", "{brand} 섀도우 팔레트"),
  "base": ("{brand} 쿠션", "{brand} 파운데이션", "{brand} 베이스"),
  "cheek": ("{brand} 블러셔", "{brand} 치크"),
  "liner": ("{brand} 아이라이너", "{brand} 라이너"),
  "brow": ("{brand} 아이브로우", "{brand} 브로우"),
}


# 세부 카테고리(subcategory) — "질의 템플릿 기준 세분"의 1급 슬롯. 대분류(category)를
# 텍스처/폼팩터로 나눈다. 각 항목:
#   category: 부모 대분류
#   label   : 한국어 표시 라벨
#   queries : NAVER 수집 질의 템플릿 ({brand} 치환) — 매니페스트 생성기가 소비
#   terms   : 제목/질의에서 이 세부 카테고리를 식별하는 키워드 (subcategory 추론용)
# 슬롯 순서 = 대분류 내 대표도(첫 항목이 폴백 기본값).
SUBCATEGORIES: dict[str, dict[str, Any]] = {
  "lip_tint": {
    "category": "lip",
    "label": "립틴트",
    "queries": ("{brand} 립틴트", "{brand} 틴트"),
    "terms": ("립틴트", "틴트", "tint"),
  },
  "lip_stick": {
    "category": "lip",
    "label": "립스틱",
    "queries": ("{brand} 립스틱",),
    "terms": ("립스틱", "lipstick", "립 매트"),
  },
  "lip_gloss": {
    "category": "lip",
    "label": "립글로스",
    "queries": ("{brand} 립글로스", "{brand} 글로스"),
    "terms": ("립글로스", "글로스", "gloss"),
  },
  "lip_balm": {
    "category": "lip",
    "label": "립밤",
    "queries": ("{brand} 립밤",),
    "terms": ("립밤", "balm"),
  },
  "shadow_palette": {
    "category": "shadow",
    "label": "섀도우 팔레트",
    "queries": ("{brand} 아이섀도우 팔레트", "{brand} 아이팔레트"),
    "terms": ("팔레트", "palette", "아이팔레트"),
  },
  "shadow_single": {
    "category": "shadow",
    "label": "싱글 섀도우",
    "queries": ("{brand} 싱글 아이섀도우", "{brand} 아이섀도우"),
    "terms": ("싱글", "single"),
  },
  "base_cushion": {
    "category": "base",
    "label": "쿠션",
    "queries": ("{brand} 쿠션",),
    "terms": ("쿠션", "cushion"),
  },
  "base_foundation": {
    "category": "base",
    "label": "파운데이션",
    "queries": ("{brand} 파운데이션", "{brand} 파데"),
    "terms": ("파운데이션", "파데", "foundation"),
  },
  "base_concealer": {
    "category": "base",
    "label": "컨실러",
    "queries": ("{brand} 컨실러",),
    "terms": ("컨실러", "concealer"),
  },
  "cheek_blush": {
    "category": "cheek",
    "label": "블러셔",
    "queries": ("{brand} 블러셔", "{brand} 볼터치"),
    "terms": ("블러셔", "블러쉬", "볼터치", "blush"),
  },
  "cheek_cream": {
    "category": "cheek",
    "label": "크림/리퀴드 블러셔",
    "queries": ("{brand} 크림 블러셔", "{brand} 리퀴드 블러셔"),
    "terms": ("크림 블러", "리퀴드 블러", "cream blush"),
  },
  "liner_liquid": {
    "category": "liner",
    "label": "리퀴드 아이라이너",
    "queries": ("{brand} 아이라이너", "{brand} 붓펜 아이라이너"),
    "terms": ("리퀴드", "붓펜", "펜라이너", "liquid"),
  },
  "liner_gel": {
    "category": "liner",
    "label": "젤/펜슬 아이라이너",
    "queries": ("{brand} 젤라이너", "{brand} 펜슬 아이라이너"),
    "terms": ("젤라이너", "펜슬", "gel"),
  },
  "brow_pencil": {
    "category": "brow",
    "label": "브로우 펜슬",
    "queries": ("{brand} 아이브로우", "{brand} 브로우 펜슬", "{brand} 오토브로우"),
    "terms": ("펜슬", "오토", "자동", "pencil"),
  },
  "brow_cara": {
    "category": "brow",
    "label": "브로우 카라/틴트",
    "queries": ("{brand} 브로우카라", "{brand} 브로우 틴트"),
    "terms": ("카라", "브로우틴트", "염색"),
  },
}


def _subcategories_by_category() -> dict[str, tuple[str, ...]]:
  out: dict[str, list[str]] = {}
  for sub_id, sub in SUBCATEGORIES.items():
    out.setdefault(str(sub["category"]), []).append(sub_id)
  return {category: tuple(ids) for category, ids in out.items()}


# category → 세부 카테고리 id 목록 (선언 순서 = 대표도, [0] = 폴백 기본값).
SUBCATEGORIES_BY_CATEGORY: dict[str, tuple[str, ...]] = _subcategories_by_category()


def subcategory_query_templates(category: str) -> tuple[str, ...]:
  """대분류에 속한 모든 세부 카테고리 질의 템플릿을 순서 유지·중복 제거해 돌려준다."""
  templates: list[str] = []
  for sub_id in SUBCATEGORIES_BY_CATEGORY.get(category, ()):
    for template in SUBCATEGORIES[sub_id]["queries"]:
      if template not in templates:
        templates.append(template)
  return tuple(templates)


def infer_subcategory(category: str, title: str, query: str = "") -> str | None:
  """대분류 안에서 제목/질의 키워드로 세부 카테고리를 고른다.

  가장 **긴(구체적인)** 매치 키워드를 가진 세부 카테고리를 선택한다 — "리퀴드 블러셔"가
  일반 "블러셔"보다 우선하도록. 매치가 전혀 없으면 대분류의 대표 세부 카테고리
  (선언 순서 첫 항목)로 폴백한다 — 수집 질의가 이미 세부 지향이라 폴백이 크게 어긋나지 않는다.
  """
  sub_ids = SUBCATEGORIES_BY_CATEGORY.get(category)
  if not sub_ids:
    return None
  haystack = f"{title} {query}".lower()
  best_id: str | None = None
  best_len = 0
  for sub_id in sub_ids:
    for term in SUBCATEGORIES[sub_id]["terms"]:
      needle = str(term).lower()
      if needle in haystack and len(needle) > best_len:
        best_len = len(needle)
        best_id = sub_id
  return best_id or sub_ids[0]
