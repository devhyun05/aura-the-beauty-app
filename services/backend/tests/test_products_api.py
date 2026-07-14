from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import Response

from app.api.products import (
  _external_product_price,
  _external_product_source_timestamp,
  _liked_product_display_allowed,
  _map_external_like_snapshot,
  _resolve_external_product_for_like,
  like_external_product,
  search_products,
)
from app.core.settings import Settings
from app.core.errors import AppError
from app.services.product_catalog import ensure_like_eligible, offer_freshness_sql, validate_external_https_url
from app.services.product_recommendations import rank_ar_candidates
from app.services.shopping_products import _map_db_product, _safe_naver_result_url


class ProductLikeDatabase:
  def __init__(self, *, eligible: bool = True, shade_eligible: bool = True) -> None:
    self.eligible = eligible
    self.shade_eligible = shade_eligible
    self.calls = 0

  async def fetchrow(self, _query: str, *_args):
    self.calls += 1
    if self.calls == 1:
      return {"id": uuid4()} if self.eligible else None
    return {"id": uuid4()} if self.shade_eligible else None


def test_external_product_source_timestamp_normalizes_iso_and_naive_values() -> None:
  iso_value = _external_product_source_timestamp({"sourceUpdatedAt": "2026-07-15T03:00:00Z"})
  assert iso_value == datetime(2026, 7, 15, 3, tzinfo=timezone.utc)
  naive_value = _external_product_source_timestamp(
    {"price": {"updatedAt": datetime(2026, 7, 15, 3)}}
  )
  assert naive_value == datetime(2026, 7, 15, 3, tzinfo=timezone.utc)
  assert _external_product_source_timestamp({"sourceUpdatedAt": "invalid"}) is None


class _AsyncContext:
  def __init__(self, value) -> None:
    self.value = value

  async def __aenter__(self):
    return self.value

  async def __aexit__(self, *_args) -> None:
    return None


class _SearchConnection:
  def transaction(self):
    return _AsyncContext(self)

  async def fetch(self, _query: str, *_args):
    return []


class _SearchPool:
  def acquire(self):
    return _AsyncContext(_SearchConnection())


class _SearchDatabase:
  is_connected = True
  pool = _SearchPool()


@pytest.mark.asyncio
async def test_like_requires_an_eligible_internal_catalog_product() -> None:
  product_id = uuid4()
  await ensure_like_eligible(ProductLikeDatabase(), product_id=product_id, source_shade_id=None)

  with pytest.raises(AppError) as error:
    await ensure_like_eligible(
      ProductLikeDatabase(eligible=False),
      product_id=product_id,
      source_shade_id=None,
    )
  assert error.value.code == "PRODUCT_NOT_ELIGIBLE"


def test_offer_freshness_gate_rejects_missing_future_and_old_checks() -> None:
  sql = offer_freshness_sql("offer", "$4")
  assert "offer.availability_checked_at is not null" in sql
  assert "offer.price_updated_at is not null" in sql
  assert "offer.availability_checked_at <= now()" in sql
  assert "offer.price_updated_at <= now()" in sql
  assert "now() - ($4::int * interval '1 hour')" in sql


@pytest.mark.asyncio
async def test_like_rejects_a_shade_from_outside_the_eligible_product() -> None:
  with pytest.raises(AppError) as error:
    await ensure_like_eligible(
      ProductLikeDatabase(shade_eligible=False),
      product_id=uuid4(),
      source_shade_id=uuid4(),
    )
  assert error.value.code == "INVALID_SOURCE_SHADE"


@pytest.mark.asyncio
async def test_authenticated_search_response_is_private_and_not_cacheable(monkeypatch) -> None:
  user_id = uuid4()
  recorded_event = {}

  async def return_user(*_args, **_kwargs):
    return {"id": user_id}

  async def no_op(*_args, **_kwargs):
    return None

  async def no_products(*_args, **_kwargs):
    return []

  async def capture_event(*_args, **kwargs):
    recorded_event.update(kwargs)

  monkeypatch.setattr("app.api.products.ensure_user", return_user)
  monkeypatch.setattr("app.api.products.enforce_product_rate_limit", no_op)
  monkeypatch.setattr("app.api.products.record_server_event", capture_event)
  monkeypatch.setattr("app.api.products.search_catalog", no_products)
  response = Response()
  result = await search_products(
    response=response,
    q="립",
    category=None,
    limit=20,
    auth=object(),  # type: ignore[arg-type]
    db=_SearchDatabase(),  # type: ignore[arg-type]
    settings=Settings(),
  )
  assert response.headers["Cache-Control"] == "private, no-store"
  assert result["data"]["status"] == "ready"
  assert result["data"]["items"]
  assert {item["externalSource"] for item in result["data"]["items"]} == {"auradin_catalog"}
  assert result["meta"]["source"] == "auradin_catalog"
  assert recorded_event["context"]["catalogCategory"] == "lip"
  assert recorded_event["context"]["catalogBrand"]
  assert recorded_event["context"]["resultExternalIdentities"]


@pytest.mark.asyncio
async def test_packaged_auradin_product_is_resolved_server_side_for_like() -> None:
  product = await _resolve_external_product_for_like(
    db=object(),  # type: ignore[arg-type]
    settings=Settings(),
    external_source="auradin_catalog",
    external_product_id="auradin-seed-3f16a4750d11b658",
  )
  assert product is not None
  assert product["externalSource"] == "auradin_catalog"
  assert product["purchaseUrl"].startswith("https://")


@pytest.mark.asyncio
async def test_packaged_like_passes_timezone_aware_timestamp_to_database(monkeypatch) -> None:
  class _LikeDatabase:
    def __init__(self) -> None:
      self.calls = []

    async def execute(self, _query: str, *args):
      self.calls.append(args)
      return "INSERT 0 1"

  async def return_user(*_args, **_kwargs):
    return {"id": uuid4()}

  async def no_op(*_args, **_kwargs):
    return None

  monkeypatch.setattr("app.api.products.ensure_user", return_user)
  monkeypatch.setattr("app.api.products.enforce_product_rate_limit", no_op)
  db = _LikeDatabase()
  result = await like_external_product(
    external_source="auradin_catalog",
    external_product_id="auradin-seed-3f16a4750d11b658",
    auth=SimpleNamespace(subject="owner"),  # type: ignore[arg-type]
    db=db,  # type: ignore[arg-type]
    settings=Settings(),
  )
  assert result["data"]["liked"] is True
  assert db.calls
  assert isinstance(db.calls[0][10], datetime)
  assert db.calls[0][10].tzinfo is not None


def test_liked_product_details_are_hidden_outside_active_published_rights_window() -> None:
  now = datetime(2026, 7, 13, tzinfo=timezone.utc)
  row = {
    "is_active": True,
    "image_url": "https://cdn.example.com/product.png",
    "license_status": "valid",
    "catalog_status": "published",
    "allowed_uses": ["mobile_display", "recommendation"],
    "license_valid_from": now - timedelta(days=1),
    "license_valid_until": now + timedelta(days=1),
  }
  assert _liked_product_display_allowed(row, now=now)
  for update in (
    {"is_active": False},
    {"catalog_status": "draft"},
    {"catalog_status": "blocked"},
    {"license_status": "expired"},
    {"license_valid_until": now},
    {"image_url": None},
  ):
    assert not _liked_product_display_allowed({**row, **update}, now=now)


def test_seller_url_requires_https_and_an_allowlisted_domain() -> None:
  assert (
    validate_external_https_url(
      "https://shop.example.com/products/1",
      ["example.com"],
      kind="Seller",
    )
    == "https://shop.example.com/products/1"
  )
  for unsafe in (
    "http://shop.example.com/products/1",
    "https://example.com.evil.test/products/1",
    "https://127.0.0.1/products/1",
  ):
    with pytest.raises(AppError):
      validate_external_https_url(unsafe, ["example.com"], kind="Seller")


def test_live_naver_result_urls_reject_http_credentials_and_ip_hosts() -> None:
  assert _safe_naver_result_url("https://shop.example.com/products/1") == "https://shop.example.com/products/1"
  for unsafe in (
    "http://shop.example.com/products/1",
    "https://user:password@shop.example.com/products/1",
    "https://127.0.0.1/products/1",
    "https://localhost/products/1",
  ):
    assert _safe_naver_result_url(unsafe) is None


def test_persisted_external_like_snapshot_becomes_an_unlikeable_tombstone_when_url_is_unsafe() -> None:
  row = {
    "external_source": "naver_shopping_search",
    "external_product_id": "naver-1",
    "brand_name": "Brand",
    "product_name": "Brow",
    "category": "brow",
    "image_url": "https://cdn.example.com/brow.png",
    "purchase_url": "http://127.0.0.1/internal",
    "price_amount": 12000,
    "price_currency": "KRW",
    "source_updated_at": datetime.now(timezone.utc),
  }
  mapped = _map_external_like_snapshot(row)
  assert mapped["status"] == "unavailable"
  assert mapped["purchaseUrl"] is None
  assert mapped["imageUrl"] is None
  assert mapped["canUnlike"] is True
  assert mapped["externalSource"] == "naver_shopping_search"


class _ExternalSnapshotDatabase:
  def __init__(self, row) -> None:
    self.row = row

  async def fetchrow(self, _query: str, *_args):
    return self.row


@pytest.mark.asyncio
async def test_external_popular_fallback_can_be_liked_after_live_cache_expires(monkeypatch) -> None:
  async def live_cache_miss(*_args, **_kwargs):
    return None

  monkeypatch.setattr("app.api.products.resolve_live_external_product", live_cache_miss)
  product = await _resolve_external_product_for_like(
    _ExternalSnapshotDatabase(
      {
        "external_source": "naver_shopping_search",
        "external_product_id": "popular-1",
        "brand_name": "Aura Demo",
        "product_name": "Glow Lip",
        "category": "lip",
        "image_url": "https://cdn.example.com/glow-lip.png",
        "purchase_url": "https://shop.example.com/glow-lip",
        "price_amount": 15000,
        "price_currency": "KRW",
        "source_updated_at": datetime.now(timezone.utc),
      }
    ),  # type: ignore[arg-type]
    Settings(),
    external_source="naver_shopping_search",
    external_product_id="popular-1",
  )
  assert product is not None
  assert product["productId"] == "popular-1"
  assert product["purchaseUrl"] == "https://shop.example.com/glow-lip"


@pytest.mark.asyncio
async def test_external_popular_fallback_snapshot_is_rejected_when_url_is_unsafe(monkeypatch) -> None:
  async def live_cache_miss(*_args, **_kwargs):
    return None

  monkeypatch.setattr("app.api.products.resolve_live_external_product", live_cache_miss)
  product = await _resolve_external_product_for_like(
    _ExternalSnapshotDatabase(
      {
        "external_source": "naver_shopping_search",
        "external_product_id": "unsafe-1",
        "brand_name": "Unsafe",
        "product_name": "Unsafe Lip",
        "category": "lip",
        "image_url": "https://cdn.example.com/lip.png",
        "purchase_url": "http://127.0.0.1/private",
        "price_amount": 15000,
        "price_currency": "KRW",
        "source_updated_at": datetime.now(timezone.utc),
      }
    ),  # type: ignore[arg-type]
    Settings(),
    external_source="naver_shopping_search",
    external_product_id="unsafe-1",
  )
  assert product is None


@pytest.mark.asyncio
async def test_auradin_external_like_resolves_only_server_owned_session_product(monkeypatch) -> None:
  calls = []

  async def resolve_owner_product(**kwargs):
    calls.append(kwargs)
    return {
      "id": "auradin-product-1",
      "brandName": "Owner Result",
      "productName": "Glow Tint",
      "category": "lip",
      "imageUrl": "https://cdn.example.com/glow.png",
      "purchaseUrl": "https://shop.example.com/glow",
      "priceKrw": 17000,
    }

  monkeypatch.setattr("app.api.products.resolve_auradin_result_product", resolve_owner_product)
  product = await _resolve_external_product_for_like(
    _ExternalSnapshotDatabase(None),  # type: ignore[arg-type]
    Settings(),
    external_source="auradin_search",
    external_product_id="auradin-product-1",
    owner_subject="owner-subject",
  )
  assert product is not None
  assert product["externalSource"] == "auradin_search"
  assert product["productId"] == "auradin-product-1"
  assert calls[0]["owner_subject"] == "owner-subject"
  assert calls[0]["product_id"] == "auradin-product-1"


def test_external_product_price_accepts_auradin_number_or_price_krw() -> None:
  assert _external_product_price({"price": 12345}) == (12345, "KRW")
  assert _external_product_price({"priceKrw": 23456}) == (23456, "KRW")
  assert _external_product_price({"price": {"amount": 34567, "currency": "KRW"}}) == (34567, "KRW")


def test_legacy_recommendation_mapping_uses_only_trusted_asset_and_offer_urls() -> None:
  row = {
    "id": uuid4(),
    "brand_name": "Licensed",
    "product_name": "Lip",
    "shade_name": "Rose",
    "category": "lip",
    "price_krw": 1000,
    "product_payload": {
      "imageUrl": "https://evil.test/injected.png",
      "purchaseUrl": "https://evil.test/injected",
    },
    "trusted_image_url": "https://cdn.example.com/reviewed.png",
    "trusted_purchase_url": "https://shop.example.com/reviewed",
  }
  mapped = _map_db_product(row, 0)
  assert mapped is not None
  assert mapped["imageUrl"] == "https://cdn.example.com/reviewed.png"
  assert mapped["purchaseUrl"] == "https://shop.example.com/reviewed"
  assert _map_db_product(
    {**row, "trusted_image_url": None, "trusted_purchase_url": None},
    0,
  ) is None


def test_ar_ranking_excludes_title_inferred_shades_and_returns_reasons() -> None:
  product_id = uuid4()
  far_product_id = uuid4()
  shade_id = uuid4()
  projection = {
    "productRegion": "lip",
    "canonicalFinish": "gloss",
    "authoringColorLab": {"l": 50, "a": 20, "b": 10},
  }
  base = {
    "product_id": product_id,
    "shade_id": shade_id,
    "brand_name": "Trusted",
    "product_name": "Lip",
    "category": "lip",
    "shade_name": "Rose",
    "srgb_hex": "#AA6677",
    "lab_l": 50.2,
    "lab_a": 20.1,
    "lab_b": 10.1,
    "finish": "gloss",
    "evidence_confidence": 0.9,
    "image_url": "https://cdn.example.com/p.png",
  }
  ranked = rank_ar_candidates(
    projection,
    [
      {**base, "evidence_type": "title_inferred"},
      {
        **base,
        "product_id": far_product_id,
        "shade_id": uuid4(),
        "lab_l": 90,
        "lab_a": -50,
        "lab_b": -50,
        "evidence_type": "measured_swatch",
      },
      {**base, "evidence_type": "measured_swatch"},
    ],
    limit=5,
  )
  assert len(ranked) == 1
  assert ranked[0]["productId"] == str(product_id)
  assert ranked[0]["reasonCodes"] == ["CLOSE_AUTHORING_COLOR", "MATCHING_FINISH"]
  assert "matchRate" not in ranked[0]
