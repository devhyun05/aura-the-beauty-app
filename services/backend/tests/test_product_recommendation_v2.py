from datetime import datetime, timezone
import json
from uuid import UUID, uuid4

import pytest

from app.core.errors import AppError
from app.core.settings import Settings
from app.schemas.product_recommendation import ProductEvent
from app.services.product_color import delta_e_ciede2000, srgb_hex_to_lab
from app.services.product_recommendations import (
  get_ar_recommendations,
  get_cohort_recommendations,
  get_personalized_recommendations,
  get_popular_fallback_products,
  get_seasonal_recommendations,
  validate_event_source,
  verify_exposure_token,
)
from app.services.saved_ar_looks import normalize_saved_ar_look


def _recipe_payload() -> dict:
  return {
    "schemaVersion": "saved_ar_look_v1",
    "recipeContract": "FullFaceMakeupRecipe",
    "sourceFrameMetadata": {"capturePairId": "must-not-persist"},
    "recipe": {
      "version": 2,
      "rendererMode": "smooth-region-mask",
      "sourceFrameMetadata": {"landmarks": [1, 2, 3]},
      "layers": [
        {
          "region": "lip",
          "enabled": True,
          "color": "#b96872",
          "finish": "gloss",
          "intensity": 0.72,
          "opacity": 0.78,
          "blendMode": "multiply",
        },
        {
          "region": "blush",
          "enabled": True,
          "color": "#D88E91",
          "finish": "sheer-glow",
          "intensity": 0.46,
          "opacity": 0.52,
          "blendMode": "multiply",
        },
      ],
    },
  }


def test_saved_ar_look_is_minimized_and_projected_by_server() -> None:
  payload = _recipe_payload()
  payload["portraitBlob"] = "client-authored data must not persist"
  payload["recipe"]["layers"][0]["arbitraryNestedPayload"] = {"photo": "not allowed"}
  normalized = normalize_saved_ar_look(payload)
  assert "sourceFrameMetadata" not in normalized
  assert "portraitBlob" not in normalized
  assert "sourceFrameMetadata" not in normalized["recipe"]
  assert "arbitraryNestedPayload" not in normalized["recipe"]["layers"][0]
  regions = normalized["recommendationProjection"]["regions"]
  assert [region["productRegion"] for region in regions] == ["lip", "cheek"]
  assert regions[0]["authoringColorHex"] == "#B96872"
  assert regions[1]["canonicalFinish"] == "sheer_glow"
  assert normalized["recommendationProjection"]["colorSemantics"] == "authoring_color"
  assert normalized["thumbnailRepresentation"] == {
    "version": "saved_ar_swatch_mosaic_v1",
    "kind": "swatch_mosaic",
    "colors": ["#B96872", "#D88E91"],
  }


def test_saved_ar_look_projects_base_and_brow_for_product_matching() -> None:
  payload = _recipe_payload()
  payload["recipe"]["layers"].extend(
    [
      {
        "region": "foundation",
        "enabled": True,
        "color": "#D8A287",
        "finish": "glow",
        "texture": "foundation_glow",
        "intensity": 0.55,
        "opacity": 0.68,
        "blendMode": "normal",
      },
      {
        "region": "brow",
        "enabled": True,
        "color": "#6A5146",
        "finish": "soft-powder-brow",
        "texture": "natural_brow",
        "intensity": 0.64,
        "opacity": 0.74,
        "blendMode": "multiply",
      },
    ]
  )

  normalized = normalize_saved_ar_look(payload)
  regions = normalized["recommendationProjection"]["regions"]

  assert [region["productRegion"] for region in regions] == ["lip", "cheek", "base", "brow"]
  assert regions[2]["canonicalFinish"] == "glow"
  assert regions[2]["canonicalTexture"] == "cushion"
  assert regions[3]["canonicalFinish"] == "powder"
  assert regions[3]["canonicalTexture"] == "pencil"


def test_saved_ar_look_normalization_is_round_trip_stable() -> None:
  normalized = normalize_saved_ar_look(_recipe_payload())
  assert normalize_saved_ar_look(normalized) == normalized


def test_saved_ar_look_rejects_out_of_range_intensity() -> None:
  payload = _recipe_payload()
  payload["recipe"]["layers"][0]["intensity"] = 1.1
  with pytest.raises(AppError) as error:
    normalize_saved_ar_look(payload)
  assert error.value.code == "INVALID_AR_RECIPE"


def test_color_conversion_and_ciede2000_reference_vector() -> None:
  white = srgb_hex_to_lab("#FFFFFF")
  assert white[0] == pytest.approx(100, abs=0.01)
  # Sharma et al. CIEDE2000 supplementary test pair 1.
  assert delta_e_ciede2000((50, 2.6772, -79.7751), (50, 0, -82.7485)) == pytest.approx(2.0425, abs=0.0001)


def test_private_event_requires_a_run_and_exposure_token() -> None:
  event = ProductEvent(
    eventId=uuid4(),
    eventType="impression",
    occurredAt=datetime.now(timezone.utc),
    section="ar",
    productId=uuid4(),
  )
  with pytest.raises(AppError) as error:
    validate_event_source(event)
  assert error.value.code == "EVENT_SOURCE_REQUIRED"


def _external_popular_row(category: str = "lip") -> dict:
  return {
    "external_source": "naver_shopping_search",
    "external_product_id": f"popular-{category}",
    "brand_name": "Aura Popular",
    "product_name": f"Popular {category}",
    "category": category,
    "image_url": f"https://cdn.example.com/{category}.png",
    "purchase_url": f"https://shop.example.com/{category}",
    "price_amount": 18000,
    "price_currency": "KRW",
    "source_updated_at": datetime.now(timezone.utc),
    "liked": True,
  }


class _PopularFallbackDatabase:
  is_connected = True

  def __init__(self, *, external_categories: set[str] | None = None) -> None:
    self.external_categories = {"lip"} if external_categories is None else set(external_categories)

  async def fetchrow(self, query: str, *_args):
    if "from saved_makeup_styles" in query:
      return None
    if "from product_seasonal_collections" in query:
      return None
    raise AssertionError(f"unexpected fetchrow: {query}")

  async def fetch(self, query: str, *args):
    if "with candidates as" in query:
      return []
    if "with ranked as" in query:
      categories = set(args[1])
      matched = sorted(categories & self.external_categories)
      return [_external_popular_row(category) for category in matched]
    if "select external_product_id from external_product_likes" in query:
      return []
    if "count(distinct user_id)" in query and "from external_product_likes" in query:
      return []
    raise AssertionError(f"unexpected fetch: {query}")


class _ExternalArDatabase:
  is_connected = True

  def __init__(self) -> None:
    self.run_args = None

  async def fetchrow(self, query: str, *_args):
    if "from saved_makeup_styles" in query:
      return {"id": uuid4(), "title": "저장 룩", "style_payload": normalize_saved_ar_look(_recipe_payload())}
    raise AssertionError(query)

  async def fetch(self, query: str, *_args):
    if "from product_shades s" in query or "with candidates as" in query or "with ranked as" in query:
      return []
    if "select external_product_id from external_product_likes" in query:
      return []
    if "count(distinct user_id)" in query and "from external_product_likes" in query:
      return []
    raise AssertionError(query)

  async def execute(self, query: str, *args):
    if "insert into product_recommendation_runs" in query:
      self.run_args = args
      return "INSERT 0 1"
    raise AssertionError(query)


class _NoSignalPersonalizationDatabase:
  is_connected = True

  def __init__(self) -> None:
    self.run_args = None

  async def fetchrow(self, query: str, *_args):
    if "from user_consents" in query:
      return {"accepted": True}
    raise AssertionError(query)

  async def fetch(self, query: str, *_args):
    if "from (" in query and "product_engagement_events" in query:
      return []
    if "with candidates as" in query or "with ranked as" in query:
      return []
    if "select external_product_id from external_product_likes" in query:
      return []
    if "count(distinct user_id)" in query and "from external_product_likes" in query:
      return []
    raise AssertionError(query)

  async def execute(self, query: str, *args):
    if "insert into product_recommendation_runs" in query:
      self.run_args = args
      return "INSERT 0 1"
    raise AssertionError(query)


class _ExternalCohortDatabase:
  is_connected = True

  def __init__(self) -> None:
    self.external_query = ""

  async def fetchrow(self, query: str, *_args):
    if "from user_consents" in query:
      return {"accepted": True}
    if "from product_color_cohort_memberships where user_id" in query:
      return {"cohort_key": "color-warm"}
    if "select count(*)::int as count" in query:
      return {"count": 100}
    raise AssertionError(query)

  async def fetch(self, query: str, *_args):
    if "join products p on p.id=l.product_id" in query:
      return []
    if "with eligible_likes as" in query:
      self.external_query = query
      return [{
        "external_source": "auradin_catalog",
        "external_product_id": "auradin-seed-3f16a4750d11b658",
        "brand_name": "3CE",
        "product_name": "External Cohort Product",
        "category": "lip",
        "image_url": "https://cdn.example.com/cohort.png",
        "purchase_url": "https://shop.example.com/cohort",
        "price_amount": 21000,
        "price_currency": "KRW",
        "source_updated_at": datetime.now(timezone.utc),
        "like_count": 2,
      }]
    raise AssertionError(query)


@pytest.mark.asyncio
async def test_popular_fallback_uses_verified_external_snapshots_when_catalog_is_empty() -> None:
  user_id = uuid4()
  items = await get_popular_fallback_products(
    _PopularFallbackDatabase(),  # type: ignore[arg-type]
    Settings(),
    user_id=user_id,
    limit=6,
  )
  assert len(items) == 6
  assert items[0]["externalSource"] == "naver_shopping_search"
  assert items[0]["viewerState"] == {"liked": True}
  assert items[0]["reasonCodes"] == ["POPULAR_FALLBACK"]
  assert items[0]["category"] == "lip"


@pytest.mark.asyncio
async def test_popular_fallback_uses_packaged_catalog_when_database_sources_are_empty() -> None:
  items = await get_popular_fallback_products(
    _PopularFallbackDatabase(external_categories=set()),  # type: ignore[arg-type]
    Settings(),
    user_id=uuid4(),
    limit=6,
  )
  assert len(items) == 6
  assert {item["category"] for item in items} == {"base", "shadow", "brow", "cheek", "lip", "liner"}
  assert {item["externalSource"] for item in items} == {"auradin_catalog"}


@pytest.mark.asyncio
async def test_popular_fallback_uses_validated_live_seasonal_items_as_opt_in_last_resort(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  cached_lip = {
    "productId": "live-lip",
    "brandName": "Live Brand",
    "productName": "Live Lip",
    "category": "lip",
    "imageUrl": "https://cdn.example.com/live-lip.png",
    "purchaseUrl": "https://shop.example.com/live-lip",
    "viewerState": {"liked": False},
    "externalSource": "naver_shopping_search",
    "reasonCodes": ["CURRENT_SEASON_TREND"],
    "reasonLabels": ["여름 트렌드"],
  }
  cached_items = [
    cached_lip,
    dict(cached_lip),  # duplicate identity
    {**cached_lip, "productId": "live-base", "category": "base"},
    {**cached_lip, "productId": "unsafe-url", "purchaseUrl": "http://shop.example.com/unsafe"},
    {**cached_lip, "productId": "wrong-source", "externalSource": "client_payload"},
  ]

  async def fake_live_seasonal(_settings: Settings, *, locale: str, limit: int) -> dict:
    assert locale == "ko-KR"
    assert limit >= 12
    return {"status": "ready", "items": cached_items}

  monkeypatch.setattr(
    "app.services.product_recommendations.get_live_seasonal_recommendations",
    fake_live_seasonal,
  )

  async def no_packaged_products(*_args, **_kwargs) -> list[dict]:
    return []

  monkeypatch.setattr(
    "app.services.product_recommendations.get_auradin_catalog_products",
    no_packaged_products,
  )
  items = await get_popular_fallback_products(
    _PopularFallbackDatabase(external_categories=set()),  # type: ignore[arg-type]
    Settings(auradin_live_discovery_enabled=True),
    user_id=uuid4(),
    limit=4,
    categories=["lip"],
  )

  assert [item["productId"] for item in items] == ["live-lip"]
  assert items[0]["viewerState"] == {"liked": False}
  assert items[0]["reasonCodes"] == ["POPULAR_FALLBACK"]
  assert items[0]["recommendationBasis"] == "popularFallback"
  # The seasonal provider caches dictionaries, so fallback labelling must only
  # affect a copy and leave the seasonal explanation intact.
  assert cached_lip["reasonCodes"] == ["CURRENT_SEASON_TREND"]
  assert cached_lip["reasonLabels"] == ["여름 트렌드"]


@pytest.mark.asyncio
async def test_each_recommendation_section_returns_popular_items_when_its_basis_is_missing() -> None:
  user_id = uuid4()
  db = _PopularFallbackDatabase(external_categories={"base", "shadow", "brow", "cheek", "lip", "liner"})
  settings = Settings(
    engagement_personalization_v1=False,
    cohort_recommendations_v1=False,
    legacy_naver_product_search=False,
  )

  ar = await get_ar_recommendations(
    db,  # type: ignore[arg-type]
    settings,
    user_id=user_id,
    style_id=None,
    regions=["lip", "cheek", "liner"],
    per_region_limit=6,
  )
  assert ar["status"] == "noArStyle"
  assert {group["region"] for group in ar["groups"]} == {"cheek", "lip", "liner"}
  assert all(group["items"] for group in ar["groups"])

  personalized = await get_personalized_recommendations(
    db,  # type: ignore[arg-type]
    settings,
    user_id=user_id,
    nickname="서진",
    limit=12,
  )
  assert personalized["status"] == "ready"
  assert personalized["personalizationStatus"] == "unavailable"
  assert personalized["items"]

  seasonal = await get_seasonal_recommendations(
    db,  # type: ignore[arg-type]
    settings,
    locale="ko-KR",
    limit=12,
  )
  assert seasonal["status"] == "ready"
  assert seasonal["collection"]["providerStatus"] == "editorialFallback"
  assert seasonal["collection"]["catalogSupplemented"] is True
  assert seasonal["items"]

  cohort = await get_cohort_recommendations(
    db,  # type: ignore[arg-type]
    settings,
    user_id=user_id,
    limit=12,
  )
  assert cohort["status"] == "ready"
  assert cohort["cohortStatus"] == "unavailable"
  assert cohort["items"]


@pytest.mark.asyncio
async def test_ar_external_matches_merge_into_one_unique_group_per_category() -> None:
  db = _ExternalArDatabase()
  user_id = uuid4()
  settings = Settings(product_event_signing_secret="test-signing-secret")
  result = await get_ar_recommendations(
    db,  # type: ignore[arg-type]
    settings,
    user_id=user_id,
    style_id=None,
    regions=["base", "shadow", "brow", "cheek", "lip", "liner"],
    per_region_limit=6,
  )
  assert result["status"] == "ready"
  assert [group["region"] for group in result["groups"]] == ["base", "shadow", "brow", "cheek", "lip", "liner"]
  assert len({group["region"] for group in result["groups"]}) == 6
  assert all(group["items"] for group in result["groups"])
  displayed_identities = [
    (str(item.get("externalSource") or "catalog"), str(item["productId"]))
    for group in result["groups"]
    for item in group["items"]
  ]
  assert len(displayed_identities) == len(set(displayed_identities))
  assert result["groups"][4]["items"][0]["externalSource"] == "auradin_catalog"
  assert result["groups"][4]["items"][0]["exposureToken"]
  assert result["groups"][4]["items"][0]["recommendationBasis"] == "auradinCatalog"
  assert db.run_args is not None
  run_payload = json.loads(db.run_args[4])
  displayed_external_identities = {
    f'{item["externalSource"]}:{item["productId"]}'
    for group in result["groups"]
    for item in group["items"]
    if item.get("externalSource")
  }
  assert set(run_payload["externalProductIdentities"]) == displayed_external_identities
  assert set(run_payload["fallbackCategories"]) == set(result["fallbackCategories"])
  assert all(
    item["exposureToken"]
    for group in result["groups"]
    for item in group["items"]
  )
  assert result["arMatchCount"] > 0
  verify_exposure_token(
    settings,
    token=result["groups"][4]["items"][0]["exposureToken"],
    run_id=UUID(result["runId"]),
    user_id=user_id,
    product_id=f"auradin_catalog:{result['groups'][4]['items'][0]['productId']}",
  )


@pytest.mark.asyncio
async def test_ar_single_category_request_only_returns_and_persists_that_category() -> None:
  db = _ExternalArDatabase()
  result = await get_ar_recommendations(
    db,  # type: ignore[arg-type]
    Settings(product_event_signing_secret="test-signing-secret"),
    user_id=uuid4(),
    style_id=None,
    regions=["lip"],
    per_region_limit=20,
  )
  assert [group["region"] for group in result["groups"]] == ["lip"]
  assert len(result["groups"][0]["items"]) == 20
  assert len({item["productId"] for item in result["groups"][0]["items"]}) == 20
  assert result["groups"][0]["arItemCount"] + result["groups"][0]["fallbackItemCount"] == 20
  assert db.run_args is not None
  run_payload = json.loads(db.run_args[4])
  assert run_payload["regions"] == ["lip"]
  assert set(result["fallbackCategories"]) <= {"lip"}


@pytest.mark.asyncio
async def test_no_signal_personalized_fallback_has_signed_trackable_run() -> None:
  db = _NoSignalPersonalizationDatabase()
  result = await get_personalized_recommendations(
    db,  # type: ignore[arg-type]
    Settings(
      engagement_personalization_v1=True,
      product_personalization_experiment_percent=100,
      product_event_signing_secret="test-signing-secret",
      auradin_live_discovery_enabled=False,
    ),
    user_id=uuid4(),
    nickname="서진",
    limit=12,
  )
  assert result["status"] == "ready"
  assert result["personalizationStatus"] == "insufficientData"
  assert result["algorithmVersion"] == "popular_fallback_signed_v1"
  assert result["runId"]
  assert len(result["items"]) == 12
  assert all(item["exposureToken"] for item in result["items"])
  assert db.run_args is not None
  run_payload = json.loads(db.run_args[3])
  displayed_external_identities = {
    f'{item["externalSource"]}:{item["productId"]}'
    for item in result["items"]
    if item.get("externalSource")
  }
  assert set(run_payload["externalProductIdentities"]) == displayed_external_identities


@pytest.mark.asyncio
async def test_external_cohort_aggregates_support_by_identity_before_latest_snapshot() -> None:
  db = _ExternalCohortDatabase()
  result = await get_cohort_recommendations(
    db,  # type: ignore[arg-type]
    Settings(
      cohort_recommendations_v1=True,
      product_cohort_experiment_percent=100,
      product_cohort_min_size=100,
      product_cohort_min_item_support=2,
    ),
    user_id=uuid4(),
    limit=1,
  )
  assert result["status"] == "ready"
  assert len(result["items"]) == 1
  assert result["items"][0]["externalSource"] == "auradin_catalog"
  assert result["items"][0]["reasonCodes"] == ["SIMILAR_PREFERENCE_COHORT"]
  normalized_query = " ".join(db.external_query.split())
  assert "group by external_source,external_product_id" in normalized_query
  assert "order by eligible_likes.liked_at desc" in normalized_query
  assert "l.external_source in ('naver_shopping_search','auradin_catalog')" in normalized_query
  assert "group by l.external_source,l.external_product_id,l.brand_name" not in normalized_query
