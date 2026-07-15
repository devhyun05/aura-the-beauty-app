from datetime import datetime, timezone
import json
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.product_recommendation import ProductEvent
from app.core.errors import AppError
from app.core.settings import Settings
from app.services.product_recommendations import record_client_events, validate_event_reference


def _event_payload() -> dict:
  return {
    "eventId": uuid4(),
    "eventType": "product_open",
    "occurredAt": datetime.now(timezone.utc),
    "section": "legacy",
  }


def test_product_event_accepts_one_internal_product_identity() -> None:
  product_id = uuid4()
  event = ProductEvent(**_event_payload(), productId=product_id)

  assert event.product_id == product_id
  assert event.external_source is None
  assert event.external_product_id is None


def test_product_event_accepts_complete_server_verified_external_identity() -> None:
  event = ProductEvent(
    **_event_payload(),
    externalSource="auradin_catalog",
    externalProductId="catalog-item-123",
  )

  assert event.product_id is None
  assert event.external_source == "auradin_catalog"
  assert event.external_product_id == "catalog-item-123"


@pytest.mark.parametrize(
  "identity",
  [
    {},
    {"externalSource": "auradin_catalog"},
    {"externalProductId": "catalog-item-123"},
    {
      "productId": uuid4(),
      "externalSource": "auradin_catalog",
      "externalProductId": "catalog-item-123",
    },
  ],
)
def test_product_event_rejects_missing_partial_or_ambiguous_identity(identity: dict) -> None:
  with pytest.raises(ValidationError):
    ProductEvent(**_event_payload(), **identity)


def test_product_event_rejects_internal_shade_for_external_product() -> None:
  with pytest.raises(ValidationError):
    ProductEvent(
      **_event_payload(),
      externalSource="auradin_catalog",
      externalProductId="catalog-item-123",
      shadeId=uuid4(),
    )


def test_product_event_rejects_unverified_external_source() -> None:
  with pytest.raises(ValidationError):
    ProductEvent(
      **_event_payload(),
      externalSource="client_supplied_marketplace",
      externalProductId="catalog-item-123",
    )


class _ExternalEventDatabase:
  def __init__(self) -> None:
    self.insert_args = None
    self.reference_args = None

  async def fetchrow(self, query: str, *args):
    if "from user_consents" in query:
      return {"accepted": True}
    if "from product_engagement_events" in query:
      self.reference_args = args
      return {"valid": True}
    raise AssertionError(query)

  async def execute(self, query: str, *args):
    assert "insert into product_engagement_events" in query
    self.insert_args = args
    return "INSERT 0 1"


@pytest.mark.asyncio
async def test_external_search_event_persists_server_resolved_catalog_features() -> None:
  db = _ExternalEventDatabase()
  event = ProductEvent(
    eventId=uuid4(),
    eventType="search_result_open",
    occurredAt=datetime.now(timezone.utc),
    section="search",
    searchRequestId=uuid4(),
    externalSource="auradin_catalog",
    externalProductId="auradin-seed-3f16a4750d11b658",
    context={"screen": "ProductSearchResult"},
  )
  result = await record_client_events(
    db,  # type: ignore[arg-type]
    Settings(engagement_personalization_v1=True),
    user_id=uuid4(),
    events=[event],
  )
  assert result == {"accepted": 1, "duplicates": 0}
  assert db.insert_args is not None
  assert db.insert_args[5] is None
  assert db.insert_args[6] == "auradin_catalog"
  assert db.insert_args[7] == "auradin-seed-3f16a4750d11b658"
  assert db.reference_args is not None
  assert db.reference_args[3] == "auradin_catalog:auradin-seed-3f16a4750d11b658"
  stored_context = json.loads(db.insert_args[13])
  assert stored_context["catalogCategory"] == "base"
  assert stored_context["catalogBrand"] == "3CE"


class _ActiveExternalDatabase:
  async def fetchrow(self, query: str, *_args):
    if "from external_product_likes" in query:
      return None
    if "select oauth_sub from users" in query:
      return {"oauth_sub": "owner-subject"}
    raise AssertionError(query)


class _ActiveSeasonalCollectionDatabase:
  async def fetchrow(self, query: str, *_args):
    if "from product_seasonal_collections" in query:
      return {"valid": True}
    raise AssertionError(query)


@pytest.mark.asyncio
async def test_published_seasonal_accepts_server_owned_catalog_supplement_event() -> None:
  event = ProductEvent(
    **{**_event_payload(), "section": "seasonal"},
    collectionId=uuid4(),
    externalSource="auradin_catalog",
    externalProductId="auradin-seed-3f16a4750d11b658",
  )
  await validate_event_reference(
    _ActiveSeasonalCollectionDatabase(),  # type: ignore[arg-type]
    user_id=uuid4(),
    event=event,
    settings=Settings(),
  )


@pytest.mark.asyncio
async def test_published_seasonal_rejects_unknown_external_supplement_event() -> None:
  event = ProductEvent(
    **{**_event_payload(), "section": "seasonal"},
    collectionId=uuid4(),
    externalSource="auradin_catalog",
    externalProductId="invented-product",
  )
  with pytest.raises(AppError) as error:
    await validate_event_reference(
      _ActiveSeasonalCollectionDatabase(),  # type: ignore[arg-type]
      user_id=uuid4(),
      event=event,
      settings=Settings(),
    )
  assert error.value.code == "INVALID_EVENT_REFERENCE"


@pytest.mark.asyncio
async def test_active_auradin_search_product_event_is_valid_before_like_snapshot(monkeypatch) -> None:
  async def resolve_active(**kwargs):
    assert kwargs["owner_subject"] == "owner-subject"
    assert kwargs["product_id"] == "active-auradin-product"
    return {"id": "active-auradin-product", "category": "lip", "brandName": "AURA"}

  monkeypatch.setattr(
    "app.services.product_recommendations.resolve_auradin_result_product",
    resolve_active,
  )
  event = ProductEvent(
    **{**_event_payload(), "section": "auradin"},
    externalSource="auradin_search",
    externalProductId="active-auradin-product",
  )
  await validate_event_reference(
    _ActiveExternalDatabase(),  # type: ignore[arg-type]
    user_id=uuid4(),
    event=event,
    settings=Settings(),
  )


@pytest.mark.asyncio
async def test_active_live_naver_product_event_is_valid_before_like_snapshot(monkeypatch) -> None:
  async def resolve_active(*_args, **_kwargs):
    return {"productId": "active-live-product", "category": "cheek", "brandName": "Live"}

  monkeypatch.setattr(
    "app.services.product_recommendations.resolve_live_external_product",
    resolve_active,
  )
  event = ProductEvent(
    **{**_event_payload(), "section": "legacy"},
    externalSource="naver_shopping_search",
    externalProductId="active-live-product",
  )
  await validate_event_reference(
    _ActiveExternalDatabase(),  # type: ignore[arg-type]
    user_id=uuid4(),
    event=event,
    settings=Settings(),
  )


@pytest.mark.asyncio
async def test_unknown_external_product_event_is_still_rejected(monkeypatch) -> None:
  async def missing(**_kwargs):
    return None

  monkeypatch.setattr(
    "app.services.product_recommendations.resolve_auradin_result_product",
    missing,
  )
  event = ProductEvent(
    **{**_event_payload(), "section": "auradin"},
    externalSource="auradin_search",
    externalProductId="invented-product",
  )
  with pytest.raises(AppError) as error:
    await validate_event_reference(
      _ActiveExternalDatabase(),  # type: ignore[arg-type]
      user_id=uuid4(),
      event=event,
      settings=Settings(),
    )
  assert error.value.code == "INVALID_EVENT_REFERENCE"
