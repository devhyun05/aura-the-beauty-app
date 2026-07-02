from __future__ import annotations


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
