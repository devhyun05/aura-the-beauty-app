"""세부 카테고리(subcategory) 1급 필드 — 추론·질의 템플릿·정규화 부여 계약."""

from app.services.auradin_catalog.candidate_normalizer import normalize_naver_item
from app.services.auradin_catalog.category_queries import (
  COLLECTABLE_CATEGORIES,
  SUBCATEGORIES,
  SUBCATEGORIES_BY_CATEGORY,
  infer_subcategory,
  subcategory_query_templates,
)


def test_every_subcategory_belongs_to_a_collectable_category() -> None:
  for sub_id, meta in SUBCATEGORIES.items():
    assert meta["category"] in COLLECTABLE_CATEGORIES, sub_id
    assert meta["queries"] and meta["terms"], sub_id


def test_infer_subcategory_matches_terms_then_falls_back_to_primary() -> None:
  assert infer_subcategory("lip", "롬앤 쥬시 래스팅 립틴트") == "lip_tint"
  assert infer_subcategory("lip", "롬앤 글래스팅 립밤") == "lip_balm"
  assert infer_subcategory("shadow", "클리오 9색 아이팔레트") == "shadow_palette"
  assert infer_subcategory("cheek", "무드 리퀴드 블러셔") == "cheek_cream"
  # 매치 없으면 대분류의 대표(선언 순서 첫) 세부 카테고리로 폴백한다.
  assert infer_subcategory("lip", "그냥 립 제품") == SUBCATEGORIES_BY_CATEGORY["lip"][0]
  # 미지원 대분류는 None.
  assert infer_subcategory("other", "무언가") is None


def test_subcategory_query_templates_are_deduped_and_ordered() -> None:
  lip_templates = subcategory_query_templates("lip")
  assert "{brand} 립밤" in lip_templates
  assert len(lip_templates) == len(set(lip_templates))
  assert subcategory_query_templates("other") == ()


def test_normalizer_assigns_subcategory_field() -> None:
  candidate, reason = normalize_naver_item(
    {
      "title": "롬앤 제로벨벳 립틴트 로즈",
      "link": "https://example.com/p/1",
      "image": "https://example.com/i/1.jpg",
      "productId": "12345",
      "lprice": "12000",
      "brand": "롬앤",
    },
    collected_at="2026-07-08T00:00:00+09:00",
    query="롬앤 립틴트",
    query_rank=1,
    requested_category="lip",
  )
  assert reason is None
  assert candidate is not None
  assert candidate["category"] == "lip"
  assert candidate["subcategory"] == "lip_tint"
