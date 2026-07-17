from datetime import datetime, timezone
from itertools import combinations
from math import ceil
from uuid import uuid4

import pytest

from app.core.settings import Settings
from app.services.product_external_catalog import (
  AURADIN_CATALOG_SOURCE,
  get_auradin_catalog_products,
  get_auradin_catalog_readiness,
  resolve_auradin_catalog_product,
)
from app.services.product_color import srgb_hex_to_lab
from app.services.product_recommendations import (
  _section_popular_fallback_products,
  get_cohort_recommendations,
  get_personalized_recommendations,
  get_seasonal_recommendations,
)


class _OfflineDatabase:
  is_connected = False


class _PublishedSeasonalDatabase:
  is_connected = True

  def __init__(self) -> None:
    self.collection_id = uuid4()
    self.product_id = uuid4()

  async def fetchrow(self, query: str, *_args):
    if "from product_seasonal_collections" in query:
      now = datetime.now(timezone.utc)
      return {
        "id": self.collection_id,
        "slug": "glossy-lip-flushed-cheek",
        "title": "에디터 여름 컬렉션",
        "summary": "에디터 검수 컬렉션",
        "valid_from": now,
        "valid_until": now,
        "reviewed_at": now,
        "source_labels": ["editorial"],
        "source_payload": {"sourceUpdatedAt": now.isoformat()},
        "trend_window": "2026-summer",
        "revision": 1,
      }
    raise AssertionError(query)

  async def fetch(self, query: str, *_args):
    if "from product_seasonal_collection_items" in query:
      now = datetime.now(timezone.utc)
      return [{
        "product_id": self.product_id,
        "brand_name": "Editorial Brand",
        "product_name": "Editorial Lip",
        "category": "lip",
        "catalog_version": "test-v1",
        "source_updated_at": now,
        "shade_id": uuid4(),
        "shade_name": "Rose",
        "srgb_hex": "#CC7788",
        "finish": "glossy",
        "image_url": "https://cdn.example.com/editorial.png",
        "offer_id": uuid4(),
        "seller_name": "Editorial Seller",
        "seller_domain": "seller.example.com",
        "currency": "KRW",
        "price_amount": 23000,
        "price_updated_at": now,
        "availability_status": "in_stock",
        "affiliate_type": "none",
        "disclosure_label": None,
        "reason_code": "EDITOR_REVIEWED",
        "sponsorship_type": "organic",
        "liked": bool(_args[4]) if len(_args) > 4 else False,
      }]
    if "count(distinct user_id)" in query and "from external_product_likes" in query:
      return []
    raise AssertionError(query)


def _identities(items: list[dict]) -> set[tuple[str, str]]:
  return {
    (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
    for item in items
  }


def test_packaged_catalog_readiness_has_full_canonical_category_coverage() -> None:
  # 카탈로그 크기는 승인된 스냅샷 승격마다 커진다(20260719 보충 등) — 정확한 카운트
  # 딕셔너리를 하드코딩하지 않고, 6종 전 카테고리 커버리지 + 총합·displayable 정합을 단언한다.
  canonical_categories = {"base", "shadow", "brow", "cheek", "lip", "liner"}
  readiness = get_auradin_catalog_readiness()

  assert readiness["auradinCatalogReady"] is True
  assert readiness["auradinCatalogProducts"] >= 618  # 최초 6카테고리 시드 하한
  category_counts = readiness["auradinCatalogCategoryCounts"]
  displayable_counts = readiness["auradinCatalogDisplayableCategoryCounts"]
  assert set(category_counts) == canonical_categories
  assert set(displayable_counts) == canonical_categories
  assert sum(category_counts.values()) == readiness["auradinCatalogProducts"]
  assert sum(displayable_counts.values()) == readiness["auradinCatalogDisplayableProducts"]
  assert readiness["auradinCatalogDisplayableProducts"] <= readiness["auradinCatalogProducts"]
  for category in canonical_categories:
    assert category_counts[category] > 0
    assert 0 <= displayable_counts[category] <= category_counts[category]


def test_packaged_product_is_mapped_as_external_with_safe_offer_contract() -> None:
  readiness_item = resolve_auradin_catalog_product("auradin-seed-3f16a4750d11b658")
  assert readiness_item is not None
  assert readiness_item["externalSource"] == AURADIN_CATALOG_SOURCE
  assert readiness_item["imageUrl"].startswith("https://")
  assert readiness_item["purchaseUrl"].startswith("https://")
  assert set(readiness_item["offer"]) == {
    "offerId",
    "sellerName",
    "sellerDomain",
    "availability",
    "affiliateType",
    "disclosureLabel",
  }
  assert readiness_item["viewerState"] == {"liked": False}
  assert isinstance(readiness_item["sourceUpdatedAt"], datetime)
  assert resolve_auradin_catalog_product("not-a-server-owned-id") is None


@pytest.mark.asyncio
async def test_popular_catalog_results_are_unique_balanced_and_diverse() -> None:
  items = await get_auradin_catalog_products(
    _OfflineDatabase(),  # type: ignore[arg-type]
    user_id=None,
    limit=18,
    strategy="popular",
  )
  assert len(items) == 18
  assert len(_identities(items)) == 18
  assert {item["category"] for item in items} == {"base", "shadow", "brow", "cheek", "lip", "liner"}
  brands = {item["brandName"] for item in items}
  assert max(sum(item["brandName"] == brand for item in items) for brand in brands) <= ceil(18 / len(brands))


@pytest.mark.asyncio
async def test_brand_search_is_not_limited_by_recommendation_brand_cap() -> None:
  items = await get_auradin_catalog_products(
    _OfflineDatabase(),  # type: ignore[arg-type]
    user_id=None,
    limit=10,
    strategy="search",
    query="3CE",
  )
  assert len(items) >= 3
  assert sum(item["brandName"] == "3CE" for item in items) >= 3


@pytest.mark.asyncio
async def test_ar_external_color_claim_respects_configured_delta_e_threshold() -> None:
  items = await get_auradin_catalog_products(
    _OfflineDatabase(),  # type: ignore[arg-type]
    user_id=None,
    limit=12,
    categories=["lip"],
    strategy="ar",
    target_lab=srgb_hex_to_lab("#00FF00"),
    target_finish="gloss",
    max_delta_e=5.0,
  )
  assert items == []


@pytest.mark.asyncio
async def test_generic_section_variants_do_not_return_identical_product_sets() -> None:
  settings = Settings(auradin_live_discovery_enabled=False)
  variants = {}
  for variant in ("ar", "seasonal", "personalized", "cohort"):
    variants[variant] = _identities(
      await _section_popular_fallback_products(
        _OfflineDatabase(),  # type: ignore[arg-type]
        settings,
        user_id=None,
        limit=12,
        variant=variant,
      )
    )
    assert len(variants[variant]) == 12
  for first, second in combinations(variants, 2):
    assert variants[first] != variants[second]


@pytest.mark.asyncio
async def test_missing_published_seasonal_uses_diverse_local_fallback() -> None:
  result = await get_seasonal_recommendations(
    _OfflineDatabase(),  # type: ignore[arg-type]
    Settings(auradin_live_discovery_enabled=True),
    locale="ko-KR",
    limit=18,
  )
  assert result["status"] == "ready"
  assert len(result["items"]) == 18
  assert len(_identities(result["items"])) == 18
  assert len({item["category"] for item in result["items"]}) >= 4
  assert result["collection"]["providerStatus"] == "popularFallback"
  assert all(item["reasonCodes"] == ["POPULAR_FALLBACK"] for item in result["items"])


@pytest.mark.asyncio
async def test_region_fallback_keeps_requested_coarse_region_without_coordinates() -> None:
  result = await get_seasonal_recommendations(
    _OfflineDatabase(),  # type: ignore[arg-type]
    Settings(auradin_live_discovery_enabled=False),
    locale="ko-KR",
    region_code="KR-11",
    limit=12,
  )
  assert result["status"] == "ready"
  assert result["collection"]["regionCode"] == "KR-11"
  assert result["collection"]["regionLabel"] == "서울"
  assert result["collection"]["freshnessStatus"] == "fallback"


@pytest.mark.asyncio
async def test_sparse_published_seasonal_preserves_editorial_item_and_fills_shelf() -> None:
  db = _PublishedSeasonalDatabase()
  result = await get_seasonal_recommendations(
    db,  # type: ignore[arg-type]
    Settings(auradin_live_discovery_enabled=False),
    locale="ko-KR",
    limit=18,
  )
  assert result["status"] == "ready"
  assert str(result["collection"]["id"]) == str(db.collection_id)
  assert len(result["items"]) == 18
  assert len(_identities(result["items"])) == 18
  assert result["items"][0]["productId"] == str(db.product_id)
  assert result["items"][0]["reasonCodes"] == ["EDITOR_REVIEWED"]
  assert result["collection"]["editorialItemCount"] == 1
  assert result["collection"]["catalogSupplemented"] is True
  assert (
    result["collection"]["editorialItemCount"]
    + result["collection"]["attributeMatchedItemCount"]
    + result["collection"]["genericCoverageItemCount"]
  ) == 18


@pytest.mark.asyncio
async def test_published_seasonal_maps_authenticated_viewer_like_state() -> None:
  db = _PublishedSeasonalDatabase()
  result = await get_seasonal_recommendations(
    db,  # type: ignore[arg-type]
    Settings(auradin_live_discovery_enabled=False),
    user_id=uuid4(),
    locale="ko-KR",
    limit=1,
  )
  assert result["items"][0]["productId"] == str(db.product_id)
  assert result["items"][0]["viewerState"] == {"liked": True}


@pytest.mark.asyncio
async def test_more_section_category_filters_can_fill_sixty_products() -> None:
  db = _OfflineDatabase()
  seasonal = await get_seasonal_recommendations(
    db,  # type: ignore[arg-type]
    Settings(auradin_live_discovery_enabled=False),
    locale="ko-KR",
    limit=60,
    category="lip",
  )
  personalized = await get_personalized_recommendations(
    db,  # type: ignore[arg-type]
    Settings(engagement_personalization_v1=False, auradin_live_discovery_enabled=False),
    user_id=uuid4(),
    nickname="회원",
    limit=60,
    category="brow",
  )
  cohort = await get_cohort_recommendations(
    db,  # type: ignore[arg-type]
    Settings(cohort_recommendations_v1=False, auradin_live_discovery_enabled=False),
    user_id=uuid4(),
    limit=60,
    category="shadow",
  )
  for response, category in ((seasonal, "lip"), (personalized, "brow"), (cohort, "shadow")):
    assert len(response["items"]) == 60
    assert {item["category"] for item in response["items"]} == {category}
    assert len(_identities(response["items"])) == 60
