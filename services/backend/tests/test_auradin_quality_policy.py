from app.services.auradin_agent.catalog_loader import AuradinCatalog
from app.services.auradin_agent.enrichment import _live_catalog_item
from app.services.auradin_agent.quality_policy import (
  BUNDLE_CAVEAT,
  is_quality_cut,
  quality_caveats,
)
from app.services.auradin_agent.ranking import _build_reason
from app.services.auradin_agent.vector_index import FileVectorIndex


def _catalog_item(item_id: str, quality_flags: list[str]) -> dict:
  return {
    "id": item_id,
    "brandName": "브랜드",
    "productName": item_id,
    "category": "base",
    "attributes": {},
    "attributeConfidence": {},
    "hardFilterEligible": {},
    "qualityFlags": quality_flags,
    "liveOffer": {
      "priceKrw": 20000,
      "purchaseUrl": f"https://example.test/{item_id}",
      "imageUrl": f"https://example.test/{item_id}.jpg",
    },
  }


def _raw_naver(product_id: str, title: str) -> dict:
  return {
    "title": title,
    "link": f"https://example.test/{product_id}",
    "image": f"https://example.test/{product_id}.jpg",
    "lprice": "20000",
    "productId": product_id,
    "brand": "클리오",
    "maker": "클리오",
    "mallName": "클리오몰",
    "category1": "화장품/미용",
    "category2": "색조메이크업",
    "category3": "베이스메이크업",
    "category4": "쿠션",
  }


def test_per_flag_cut_policy_keeps_bundle_as_badged_item() -> None:
  for flag in ("refill_copy", "mini_or_sample_copy", "bonus_tool_copy", "case_copy"):
    assert is_quality_cut({"qualityFlags": [flag]})

  bundle = {"qualityFlags": ["bundle_or_set_copy"]}
  assert not is_quality_cut(bundle)
  assert quality_caveats(bundle) == [BUNDLE_CAVEAT]


def test_missing_none_or_non_list_flags_are_neither_cut_nor_badged() -> None:
  # qualityFlags 없음/None/비리스트 — 컷 대상도 아니고 caveat도 붙지 않는다
  for item in ({}, {"qualityFlags": None}, {"qualityFlags": "refill_copy"}, {"qualityFlags": 3}):
    assert not is_quality_cut(item)
    assert quality_caveats(item) == []


def test_bundle_reason_adds_caveat_without_changing_reason_keys() -> None:
  reason = _build_reason(_catalog_item("bundle", ["bundle_or_set_copy"]))

  assert set(reason) == {"matchedOn", "inferred", "caveat"}
  assert BUNDLE_CAVEAT in reason["caveat"]


def test_catalog_and_chunks_share_the_same_survivor_set() -> None:
  # 로드 필터: 컷 플래그는 제거, bundle·무플래그는 잔존, chunks는 생존 id 집합으로 동기화
  kept = _catalog_item("kept", ["bundle_or_set_copy"])
  plain = _catalog_item("plain", [])
  cut = _catalog_item("cut", ["refill_copy"])
  chunks = [
    {"chunkId": "kept:overview", "catalogItemId": "kept", "text": "쿠션 세트"},
    {"chunkId": "plain:overview", "catalogItemId": "plain", "text": "쿠션 단품"},
    {"chunkId": "cut:overview", "catalogItemId": "cut", "text": "쿠션 리필"},
  ]

  catalog = AuradinCatalog([kept, plain, cut], chunks)
  semantic_scores = FileVectorIndex(catalog.chunks).search("쿠션 리필 세트")

  assert set(catalog.by_id) == {"kept", "plain"}
  assert {chunk["catalogItemId"] for chunk in catalog.chunks} == {"kept", "plain"}
  assert set(semantic_scores) <= {"kept", "plain"}
  assert "cut" not in semantic_scores


def test_live_policy_is_symmetric_for_bundle_and_refill() -> None:
  common = {
    "query": "클리오 쿠션",
    "query_rank": 1,
    "category": "base",
    "collected_at": "2026-07-18T00:00:00+09:00",
  }

  bundle = _live_catalog_item(_raw_naver("1001", "클리오 쿠션 기획 세트"), **common)
  refill = _live_catalog_item(_raw_naver("1002", "클리오 쿠션 리필"), **common)

  assert bundle is not None
  assert bundle["qualityFlags"] == ["bundle_or_set_copy"]
  assert refill is None
