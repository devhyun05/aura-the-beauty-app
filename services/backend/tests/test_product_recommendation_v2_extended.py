from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import hashlib
import hmac
import json
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

import app.services.product_recommendations as product_recommendations_service

from app.api.products import (
  _is_at_least_14,
  _normalize_search_intent,
  _resolve_opaque_search_intent,
  _search_event_context,
)
from app.core.errors import AppError
from app.core.settings import Settings
from app.schemas.makeup import MakeupStyleCreate
from app.schemas.product_recommendation import ProductEvent, ProductLikeRequest
from app.services.auradin_agent.session_manager import (
  clear_sessions,
  create_session,
  get_session,
  purge_in_memory_owner_sessions,
)
from app.services.auradin_agent.enrichment import _enrich_live_discovery
from app.services.product_catalog_ingestion import (
  _expire_omitted_attribute_evidence,
  apply_catalog_manifest,
  canonical_manifest_bytes,
  validate_catalog_manifest,
  verify_manifest_signature,
)
from app.services.product_catalog_operations import rollback_catalog_import
from app.services.product_cohorts import broad_color_bucket, broad_preference_bucket
from app.services.product_operators import CATALOG_ADMIN, require_product_operator
from app.services.product_rate_limit import enforce_product_rate_limit
from app.services.product_recommendations import (
  _in_experiment,
  _is_seasonal_source_stale,
  _sign_exposure,
  delete_product_personalization,
  revoke_all_product_consents,
  set_product_consent,
  validate_event_reference,
  validate_event_source,
  verify_exposure_token,
)
from app.services.product_seasonal import (
  expire_seasonal_collections,
  rollback_seasonal_collection,
  suspend_seasonal_collection,
  validate_seasonal_manifest,
)
from app.services.product_live_seasonal import DEFAULT_CATEGORY_QUERIES, THEMES, _series_score
from app.services.product_trends import NaverShoppingInsightProvider, TrendRequest
from app.services.saved_ar_looks import normalize_saved_ar_look


NOW = datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
  return value.isoformat().replace("+00:00", "Z")


class _AsyncContext:
  def __init__(self, value) -> None:
    self.value = value

  async def __aenter__(self):
    return self.value

  async def __aexit__(self, *_args) -> None:
    return None


class _MissingCatalogActorConnection:
  def transaction(self):
    return _AsyncContext(self)

  async def fetchrow(self, _query: str, *_args):
    return None


class _MissingCatalogActorPool:
  def acquire(self):
    return _AsyncContext(_MissingCatalogActorConnection())


class _MissingCatalogActorDb:
  pool = _MissingCatalogActorPool()


class _GrantedOperatorConnection:
  async def fetchrow(self, _query: str, user_id: UUID, roles: list[str]):
    return {"user_id": user_id, "roles": roles} if CATALOG_ADMIN in roles else None


@pytest.mark.asyncio
async def test_product_operator_rbac_requires_an_explicit_matching_grant() -> None:
  actor_id = uuid4()
  granted = await require_product_operator(
    _GrantedOperatorConnection(),
    user_id=actor_id,
    roles={CATALOG_ADMIN},
    error_code="INVALID_CATALOG_ACTOR",
    message="catalog role required",
  )
  assert granted["user_id"] == actor_id

  with pytest.raises(AppError) as error:
    await require_product_operator(
      _MissingCatalogActorConnection(),
      user_id=actor_id,
      roles={CATALOG_ADMIN},
      error_code="INVALID_CATALOG_ACTOR",
      message="catalog role required",
    )
  assert error.value.code == "INVALID_CATALOG_ACTOR"


class _SeasonalExpiryConnection:
  def __init__(self, collection_ids: list[UUID]) -> None:
    self.collection_ids = collection_ids
    self.executed: list[tuple[str, tuple[object, ...]]] = []

  def transaction(self):
    return _AsyncContext(self)

  async def fetch(self, query: str, *_args):
    assert "valid_until<=now()" in query
    assert "for update" in query
    return [{"id": value} for value in self.collection_ids]

  async def execute(self, query: str, *args):
    self.executed.append((query, args))
    return "UPDATE 1"


class _SeasonalExpiryPool:
  def __init__(self, connection: _SeasonalExpiryConnection) -> None:
    self.connection = connection

  def acquire(self):
    return _AsyncContext(self.connection)


class _SeasonalExpiryDb:
  def __init__(self, connection: _SeasonalExpiryConnection) -> None:
    self.pool = _SeasonalExpiryPool(connection)


@pytest.mark.asyncio
async def test_seasonal_expiry_is_dry_run_by_default_and_audited_when_applied() -> None:
  collection_id = uuid4()
  dry_connection = _SeasonalExpiryConnection([collection_id])
  dry_result = await expire_seasonal_collections(  # type: ignore[arg-type]
    _SeasonalExpiryDb(dry_connection),
  )
  assert dry_result == {
    "mode": "dry-run",
    "expired": 1,
    "collectionIds": [str(collection_id)],
  }
  assert dry_connection.executed == []

  apply_connection = _SeasonalExpiryConnection([collection_id])
  apply_result = await expire_seasonal_collections(  # type: ignore[arg-type]
    _SeasonalExpiryDb(apply_connection),
    apply=True,
  )
  assert apply_result["mode"] == "apply"
  assert any("set status='expired'" in query for query, _ in apply_connection.executed)
  assert any("'seasonal.expired'" in query for query, _ in apply_connection.executed)


@pytest.mark.asyncio
async def test_privileged_product_rollbacks_require_an_active_actor() -> None:
  db = _MissingCatalogActorDb()
  with pytest.raises(AppError) as seasonal_error:
    await rollback_seasonal_collection(
      db,  # type: ignore[arg-type]
      collection_id=uuid4(),
      actor_user_id=uuid4(),
      reason="invalid actor must not mutate seasonal state",
    )
  assert seasonal_error.value.code == "INVALID_SEASONAL_ACTOR"

  with pytest.raises(AppError) as catalog_error:
    await rollback_catalog_import(
      db,  # type: ignore[arg-type]
      manifest_id=uuid4(),
      actor_user_id=uuid4(),
      reason="invalid actor must not mutate catalog state",
    )
  assert catalog_error.value.code == "INVALID_CATALOG_ACTOR"


@pytest.mark.asyncio
async def test_seasonal_suspension_requires_an_active_actor() -> None:
  with pytest.raises(AppError) as error:
    await suspend_seasonal_collection(
      _MissingCatalogActorDb(),  # type: ignore[arg-type]
      collection_id=uuid4(),
      actor_user_id=uuid4(),
      reason="operator suspension",
    )
  assert error.value.code == "INVALID_SEASONAL_ACTOR"


def _catalog_manifest() -> dict:
  product_id, shade_id, asset_id, offer_id = (uuid4() for _ in range(4))
  return {
    "schemaVersion": "product_catalog_manifest_v1",
    "manifestId": str(uuid4()),
    "sourceProvider": "licensed-partner",
    "catalogVersion": "partner-2026-07-13",
    "products": [
      {
        "id": str(product_id),
        "externalKey": "partner:lip:1",
        "brandName": "Licensed Brand",
        "productName": "Reviewed Lip",
        "category": "lip",
        "priceKrw": 21000,
        "tags": ["글로우", "여름", "글로우"],
        "productPayload": {"finish": "gloss", "features": ["lightweight"]},
        "attributeEvidence": [
          {
            "attributeKey": "lightweight",
            "attributeValue": True,
            "sourceType": "licensed_catalog",
            "sourceReference": "contract:attribute:1",
            "confidenceScore": 0.93,
            "observedAt": _iso(NOW - timedelta(days=2)),
            "reviewedAt": _iso(NOW - timedelta(days=1)),
            "expiresAt": _iso(NOW + timedelta(days=30)),
          }
        ],
        "licenseType": "partner_feed",
        "sourceReference": "contract:item:1",
        "licenseStatus": "valid",
        "catalogStatus": "published",
        "licenseValidFrom": _iso(NOW - timedelta(days=1)),
        "licenseValidUntil": _iso(NOW + timedelta(days=30)),
        "allowedUses": ["mobile_display", "recommendation"],
        "shades": [
          {
            "id": str(shade_id),
            "externalShadeKey": "rose-1",
            "shadeName": "Reviewed Rose",
            "productRegion": "lip",
            "srgbHex": "#B96872",
            "finish": "gloss",
            "evidenceType": "measured_swatch",
            "evidenceReference": "lab:measurement:1",
            "evidenceConfidence": 0.98,
            "measuredAt": _iso(NOW - timedelta(days=2)),
            "reviewedAt": _iso(NOW - timedelta(days=1)),
            "licenseValidFrom": _iso(NOW - timedelta(days=1)),
            "licenseValidUntil": _iso(NOW + timedelta(days=30)),
            "allowedUses": ["mobile_display", "recommendation"],
          }
        ],
        "assets": [
          {
            "id": str(asset_id),
            "shadeId": str(shade_id),
            "assetType": "packshot",
            "url": "https://cdn.example.com/products/1.png",
            "sourceReference": "asset:1",
            "licenseType": "partner_asset",
            "validFrom": _iso(NOW - timedelta(days=1)),
            "validUntil": _iso(NOW + timedelta(days=30)),
            "reviewedAt": _iso(NOW - timedelta(days=1)),
            "allowedUses": ["mobile_display", "recommendation"],
          }
        ],
        "offers": [
          {
            "id": str(offer_id),
            "shadeId": str(shade_id),
            "sellerName": "Approved Shop",
            "sellerDomain": "shop.example.com",
            "purchaseUrl": "https://shop.example.com/products/1",
            "sourceReference": "offer:1",
            "priceAmount": 19000,
            "availabilityStatus": "in_stock",
            "availabilityCheckedAt": _iso(NOW - timedelta(hours=1)),
            "priceUpdatedAt": _iso(NOW - timedelta(hours=1)),
            "affiliateType": "none",
            "validUntil": _iso(NOW + timedelta(days=2)),
            "allowedUses": ["mobile_display"],
          }
        ],
      }
    ],
  }


def _catalog_settings() -> Settings:
  return Settings(
    product_catalog_allowed_image_domains="example.com",
    product_catalog_allowed_seller_domains="example.com",
  )


def _ar_recipe() -> dict:
  return {
    "schemaVersion": "saved_ar_look_v1",
    "recipeContract": "FullFaceMakeupRecipe",
    "recipe": {
      "version": 2,
      "rendererMode": "smooth-region-mask",
      "halfFaceMode": "off",
      "layerCount": 1,
      "enabledLayerCount": 1,
      "layers": [
        {
          "region": "lip",
          "layer": "lip",
          "rendererMode": "smooth-region-mask",
          "enabled": True,
          "color": "#b96872",
          "finish": "gloss",
          "intensity": 0.7,
          "opacity": 0.8,
          "blendMode": "multiply",
        }
      ],
    },
  }


def _seasonal_manifest() -> dict:
  creator, reviewer, publisher = uuid4(), uuid4(), uuid4()
  return {
    "schemaVersion": "product_seasonal_manifest_v1",
    "id": str(uuid4()),
    "slug": "summer-glow",
    "title": "여름 글로우",
    "summary": "기간과 출처를 검수한 컬렉션",
    "revision": 1,
    "createdBy": str(creator),
    "reviewedBy": str(reviewer),
    "publishedBy": str(publisher),
    "validFrom": _iso(NOW - timedelta(hours=1)),
    "validUntil": _iso(NOW + timedelta(days=7)),
    "trendWindow": "2026-07-01/2026-07-12",
    "sourceLabels": ["승인된 상대 클릭 추이", "에디터 검수"],
    "sourcePayload": {
      "sourceUpdatedAt": _iso(NOW - timedelta(hours=2)),
      "contentReviewReference": "review-ticket-123",
      "trendMetric": "relative_click_ratio",
      "providerStatus": "reviewed",
    },
    "items": [{"productId": str(uuid4()), "position": 0, "reasonCode": "TREND_CLICK_RISE"}],
  }


def _seasonal_signature(manifest: dict, secret: str) -> str:
  canonical = json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
  return hmac.new(secret.encode(), canonical, hashlib.sha256).hexdigest()


def test_catalog_manifest_accepts_only_complete_rights_evidence() -> None:
  normalized = validate_catalog_manifest(_catalog_manifest(), _catalog_settings())
  assert normalized["products"][0]["shades"][0]["srgbHex"] == "#B96872"
  assert normalized["products"][0]["offers"][0]["sellerDomain"] == "shop.example.com"
  assert normalized["products"][0]["priceKrw"] == 21000
  assert normalized["products"][0]["tags"] == ["글로우", "여름"]
  assert normalized["products"][0]["productPayload"]["finish"] == "gloss"
  assert normalized["products"][0]["attributeEvidence"][0]["attributeKey"] == "lightweight"
  assert len(normalized["products"][0]["attributeEvidence"][0]["evidenceFingerprint"]) == 64
  assert normalized["products"][0]["_attributeEvidenceAuthoritative"] is True


class _AttributeEvidenceConnection:
  def __init__(self) -> None:
    self.executed: list[tuple[str, tuple[object, ...]]] = []

  async def execute(self, query: str, *args) -> str:
    self.executed.append((query, args))
    return "UPDATE 1"


@pytest.mark.asyncio
async def test_authoritative_attribute_evidence_snapshot_expires_omitted_verified_rows() -> None:
  connection = _AttributeEvidenceConnection()
  product_id = uuid4()
  active = ["a" * 64, "b" * 64]
  await _expire_omitted_attribute_evidence(
    connection,
    product_id=product_id,
    active_fingerprints=active,
  )
  query, args = connection.executed[0]
  assert "status='expired'" in query
  assert "status='verified'" in query
  assert "source_type='licensed_catalog'" in query
  assert "not (evidence_fingerprint=any($2::text[]))" in query
  assert args == (product_id, active)

  manifest = _catalog_manifest()
  manifest["products"][0].pop("attributeEvidence")
  normalized = validate_catalog_manifest(manifest, _catalog_settings())
  assert normalized["products"][0]["_attributeEvidenceAuthoritative"] is False


@pytest.mark.asyncio
async def test_explicit_empty_attribute_evidence_is_an_authoritative_revocation_snapshot() -> None:
  manifest = _catalog_manifest()
  manifest["products"][0]["attributeEvidence"] = []
  normalized = validate_catalog_manifest(manifest, _catalog_settings())
  assert normalized["products"][0]["_attributeEvidenceAuthoritative"] is True

  connection = _AttributeEvidenceConnection()
  await _expire_omitted_attribute_evidence(
    connection,
    product_id=normalized["products"][0]["id"],
    active_fingerprints=[],
  )
  assert connection.executed[0][1][1] == []


@pytest.mark.parametrize(
  ("field_value", "expected_code"),
  (
    ({"tags": "not-a-list"}, "INVALID_CATALOG_MANIFEST"),
    ({"productPayload": ["not-an-object"]}, "INVALID_CATALOG_MANIFEST"),
    ({"priceKrw": -1}, "INVALID_CATALOG_MANIFEST"),
    ({"attributeEvidence": [{"attributeKey": "season_magic"}]}, "INVALID_CATALOG_MANIFEST"),
  ),
)
def test_catalog_manifest_rejects_invalid_matching_attributes(field_value: dict, expected_code: str) -> None:
  manifest = _catalog_manifest()
  manifest["products"][0].update(field_value)
  with pytest.raises(AppError) as error:
    validate_catalog_manifest(manifest, _catalog_settings())
  assert error.value.code == expected_code


def test_catalog_manifest_accepts_brow_as_a_first_class_product_category() -> None:
  manifest = _catalog_manifest()
  manifest["products"][0]["externalKey"] = "partner:brow:1"
  manifest["products"][0]["productName"] = "Reviewed Brow"
  manifest["products"][0]["category"] = "brow"
  manifest["products"][0]["shades"][0]["productRegion"] = "brow"
  normalized = validate_catalog_manifest(manifest, _catalog_settings())
  assert normalized["products"][0]["category"] == "brow"
  assert normalized["products"][0]["shades"][0]["productRegion"] == "brow"


def test_brow_can_be_a_privacy_safe_broad_preference_bucket() -> None:
  assert broad_preference_bucket({"category:brow": 3}) == "category-brow"


def test_every_live_seasonal_theme_queries_all_commercial_makeup_categories() -> None:
  expected = {"base", "shadow", "brow", "cheek", "lip", "liner"}
  assert set(DEFAULT_CATEGORY_QUERIES) == expected
  for theme in THEMES:
    assert set({**DEFAULT_CATEGORY_QUERIES, **theme.queries}) == expected


@pytest.mark.parametrize(
  ("mutate", "code"),
  (
    (lambda value: value["products"][0].update({"licenseValidUntil": _iso(NOW - timedelta(days=1))}), "CATALOG_RIGHTS_EXPIRED"),
    (lambda value: value["products"][0]["assets"][0].update({"url": "https://example.com.evil.test/p.png"}), "UNAPPROVED_EXTERNAL_DOMAIN"),
    (lambda value: value["products"][0]["assets"][0].update({"assetType": "swatch"}), "CATALOG_DISPLAY_DATA_MISSING"),
    (lambda value: value["products"][0]["offers"][0].update({"sellerDomain": "evil.test"}), "INVALID_CATALOG_OFFER"),
    (lambda value: value["products"][0]["shades"][0].update({"evidenceType": "title_inferred"}), "SHADE_EVIDENCE_REQUIRED"),
    (lambda value: value.update({"sourceProvider": "naver-shopping-search"}), "UNTRUSTED_CATALOG_SOURCE"),
  ),
)
def test_catalog_manifest_rejects_untrusted_or_incomplete_data(mutate, code: str) -> None:
  manifest = _catalog_manifest()
  mutate(manifest)
  with pytest.raises(AppError) as error:
    validate_catalog_manifest(manifest, _catalog_settings())
  assert error.value.code == code


def test_catalog_signature_is_canonical_and_constant_time_checked() -> None:
  manifest = _catalog_manifest()
  digest = hmac.new(b"secret", canonical_manifest_bytes(manifest), hashlib.sha256).hexdigest()
  assert verify_manifest_signature(manifest, f"sha256={digest}", "secret") == digest
  with pytest.raises(AppError) as error:
    verify_manifest_signature(manifest, "sha256=bad", "secret")
  assert error.value.code == "INVALID_CATALOG_SIGNATURE"


@pytest.mark.asyncio
async def test_catalog_import_requires_an_active_internal_actor() -> None:
  manifest = _catalog_manifest()
  settings = _catalog_settings().model_copy(
    update={"product_catalog_manifest_signing_secret": "secret"}
  )
  signature = hmac.new(
    b"secret",
    canonical_manifest_bytes(manifest),
    hashlib.sha256,
  ).hexdigest()
  with pytest.raises(AppError) as error:
    await apply_catalog_manifest(
      _MissingCatalogActorDb(),  # type: ignore[arg-type]
      settings,
      manifest=manifest,
      signature=signature,
      actor_user_id=uuid4(),
    )
  assert error.value.code == "INVALID_CATALOG_ACTOR"


def test_catalog_manifest_rejects_stale_offer_freshness() -> None:
  manifest = _catalog_manifest()
  manifest["products"][0]["offers"][0]["priceUpdatedAt"] = _iso(NOW - timedelta(days=8))
  with pytest.raises(AppError) as error:
    validate_catalog_manifest(manifest, _catalog_settings())
  assert error.value.code == "INVALID_CATALOG_OFFER"


@pytest.mark.parametrize("domain", ("com", "co.kr", "*.example.com", "127.0.0.1", "https://example.com"))
def test_catalog_allowlists_reject_broad_or_non_dns_entries(domain: str) -> None:
  with pytest.raises(ValidationError):
    Settings(product_catalog_allowed_seller_domains=domain)


def test_saved_ar_recipe_validates_counts_renderer_and_payload_bounds() -> None:
  normalized = normalize_saved_ar_look(_ar_recipe())
  assert normalized["rendererVersion"] == "smooth-region-mask/recipe-v2"
  mismatch = _ar_recipe()
  mismatch["recipe"]["enabledLayerCount"] = 0
  with pytest.raises(AppError) as error:
    normalize_saved_ar_look(mismatch)
  assert error.value.code == "INVALID_AR_RECIPE"


def test_makeup_style_schema_bounds_storage_and_tags() -> None:
  payload = MakeupStyleCreate(
    clientRequestId=uuid4(),
    title="  AR 룩  ",
    tags=["AR", "AR"],
    stylePayload=_ar_recipe(),
  )
  assert payload.title == "AR 룩"
  assert payload.tags == ["AR"]
  with pytest.raises(ValidationError):
    MakeupStyleCreate(clientRequestId=uuid4(), title="x", stylePayload={"blob": "x" * (65 * 1024)})


def test_seasonal_manifest_requires_two_person_publish_and_source_review() -> None:
  secret = "seasonal-secret"
  manifest = _seasonal_manifest()
  normalized = validate_seasonal_manifest(
    manifest,
    Settings(product_seasonal_manifest_signing_secret=secret),
    _seasonal_signature(manifest, secret),
  )
  assert normalized["sourcePayload"]["trendMetric"] == "relative_click_ratio"

  invalid = _seasonal_manifest()
  invalid["publishedBy"] = invalid["createdBy"]
  with pytest.raises(AppError) as error:
    validate_seasonal_manifest(
      invalid,
      Settings(product_seasonal_manifest_signing_secret=secret),
      _seasonal_signature(invalid, secret),
    )
  assert error.value.code == "SEASONAL_TWO_PERSON_REQUIRED"


def test_seasonal_manifest_rejects_stale_trend_source() -> None:
  secret = "seasonal-secret"
  manifest = _seasonal_manifest()
  manifest["sourcePayload"]["sourceUpdatedAt"] = _iso(NOW - timedelta(days=31))
  with pytest.raises(AppError) as error:
    validate_seasonal_manifest(
      manifest,
      Settings(product_seasonal_manifest_signing_secret=secret),
      _seasonal_signature(manifest, secret),
    )
  assert error.value.code == "INVALID_SEASONAL_MANIFEST"


def test_seasonal_source_becomes_stale_after_publish_freshness_window() -> None:
  reference = datetime(2026, 7, 13, tzinfo=timezone.utc)
  assert not _is_seasonal_source_stale(
    _iso(reference - timedelta(days=30)),
    max_age_days=30,
    now=reference,
  )
  assert _is_seasonal_source_stale(
    _iso(reference - timedelta(days=30, seconds=1)),
    max_age_days=30,
    now=reference,
  )
  assert _is_seasonal_source_stale("invalid", max_age_days=30, now=reference)
  assert _is_seasonal_source_stale(
    _iso(reference + timedelta(seconds=1)),
    max_age_days=30,
    now=reference,
  )


def test_event_matrix_enforces_viewport_and_search_source() -> None:
  base = {
    "eventId": uuid4(),
    "eventType": "impression",
    "occurredAt": NOW,
    "section": "seasonal",
    "productId": uuid4(),
    "collectionId": uuid4(),
    "position": 0,
    "context": {"viewportRatio": 0.59, "visibleMs": 700},
  }
  with pytest.raises(AppError) as error:
    validate_event_source(ProductEvent(**base))
  assert error.value.code == "INVALID_IMPRESSION"
  base["context"] = {"viewportRatio": 0.6, "visibleMs": 700}
  validate_event_source(ProductEvent(**base))


def test_event_context_rejects_sensitive_or_oversized_client_metadata() -> None:
  base = {
    "eventId": uuid4(),
    "eventType": "product_open",
    "occurredAt": NOW,
    "section": "legacy",
    "productId": uuid4(),
    "position": 0,
  }
  with pytest.raises(ValidationError):
    ProductEvent(**base, context={"faceLandmarks": [1, 2, 3]})
  with pytest.raises(ValidationError):
    ProductEvent(**base, context={"source": "x" * 2100})
  with pytest.raises(ValidationError):
    ProductEvent(**base, context={"query": "사용자 원문 검색어"})
  with pytest.raises(ValidationError):
    ProductEvent(**base, context={"category": "unsupported"})
  accepted = ProductEvent(**base, context={"screen": "product_shelf", "category": "liner"})
  assert accepted.context == {"screen": "product_shelf", "category": "liner"}


def test_search_event_context_drops_raw_query_and_allows_only_known_category() -> None:
  assert _search_event_context("lip") == {"category": "lip"}
  assert _search_event_context("unknown") == {}
  assert _search_event_context(None) == {}


class _TrendIntentConnection:
  def __init__(self, rows: list[dict]) -> None:
    self.rows = rows

  async def fetch(self, query: str):
    assert "trend_keyword_candidates" in query
    assert "locale='ko-KR'" in query
    return self.rows


@pytest.mark.asyncio
async def test_search_intent_is_hmac_only_and_associates_a_known_candidate() -> None:
  candidate_id = uuid4()
  settings = Settings(product_event_signing_secret="test-intent-secret")
  intent = await _resolve_opaque_search_intent(
    _TrendIntentConnection([
      {
        "id": candidate_id,
        "normalized_keyword": "장마철 워터프루프",
        "category_codes": ["liner"],
        "status": "qualified",
        "confidence_score": 0.9,
      }
    ]),
    settings,
    query="  장마철, 워터프루프!  ",
    category="liner",
  )
  assert intent["trendCandidateId"] == str(candidate_id)
  assert len(intent["trendIntentHash"]) == 64
  assert "장마철" not in json.dumps(intent, ensure_ascii=False)
  context = _search_event_context("liner", opaque_intent=intent)
  assert context == {"category": "liner", **intent}


@pytest.mark.asyncio
async def test_search_intent_fails_closed_without_secret_and_never_returns_plaintext() -> None:
  connection = _TrendIntentConnection([])
  assert await _resolve_opaque_search_intent(
    connection,
    Settings(product_event_signing_secret=None),
    query="글로우 립",
    category="lip",
  ) == {}
  assert _normalize_search_intent("  글로우-립!! ") == "글로우 립"


@pytest.mark.asyncio
async def test_generic_one_token_search_does_not_attach_a_broader_trend_candidate() -> None:
  candidate_id = uuid4()
  intent = await _resolve_opaque_search_intent(
    _TrendIntentConnection([
      {
        "id": candidate_id,
        "normalized_keyword": "글로우 립",
        "category_codes": ["lip"],
        "status": "qualified",
        "confidence_score": 0.95,
      }
    ]),
    Settings(product_event_signing_secret="test-intent-secret"),
    query="립",
    category="lip",
  )

  assert "trendCandidateId" not in intent
  assert len(intent["trendIntentHash"]) == 64


def test_like_contract_rejects_client_authored_product_metadata() -> None:
  with pytest.raises(ValidationError):
    ProductLikeRequest(purchaseUrl="https://evil.test", productName="Injected")


@pytest.mark.asyncio
async def test_seasonal_viewer_cache_is_bounded_and_can_invalidate_one_user(monkeypatch) -> None:
  class _DisconnectedDb:
    is_connected = False

  async def fake_build(*_args, user_id=None, **_kwargs):
    return {"status": "ready", "viewer": str(user_id), "items": []}

  monkeypatch.setattr(product_recommendations_service, "_build_seasonal_recommendations", fake_build)
  product_recommendations_service.clear_seasonal_recommendation_cache()
  db = _DisconnectedDb()
  viewers = [uuid4() for _ in range(product_recommendations_service._SEASONAL_RESPONSE_CACHE_MAX_ENTRIES + 1)]
  for viewer in viewers:
    await product_recommendations_service.get_seasonal_recommendations(
      db,  # type: ignore[arg-type]
      Settings(),
      locale="ko-KR",
      limit=12,
      user_id=viewer,
    )

  assert len(product_recommendations_service._SEASONAL_RESPONSE_CACHE) == 512
  assert all(key[2] != str(viewers[0]) for key in product_recommendations_service._SEASONAL_RESPONSE_CACHE)
  product_recommendations_service.clear_seasonal_recommendation_cache(user_id=viewers[-1])
  assert all(key[2] != str(viewers[-1]) for key in product_recommendations_service._SEASONAL_RESPONSE_CACHE)
  product_recommendations_service.clear_seasonal_recommendation_cache()


def test_exposure_tokens_are_user_product_bound_and_expiring() -> None:
  settings = Settings(product_event_signing_secret="event-secret", product_exposure_token_ttl_seconds=60)
  user_id, product_id, run_id = uuid4(), uuid4(), uuid4()
  token = _sign_exposure(settings, run_id=run_id, user_id=user_id, product_id=str(product_id))
  assert token
  verify_exposure_token(settings, token=token, run_id=run_id, user_id=user_id, product_id=product_id)
  with pytest.raises(AppError):
    verify_exposure_token(settings, token=token, run_id=run_id, user_id=user_id, product_id=uuid4())


class _RateLimitDb:
  def __init__(self, count: int) -> None:
    self.count = count

  async def fetchrow(self, _query: str, *_args):
    return {"request_count": self.count, "retry_after": 12}


@pytest.mark.asyncio
async def test_rate_limit_is_atomic_and_returns_retry_hint() -> None:
  await enforce_product_rate_limit(_RateLimitDb(2), user_id=uuid4(), scope="search", limit=2)
  with pytest.raises(AppError) as error:
    await enforce_product_rate_limit(_RateLimitDb(3), user_id=uuid4(), scope="search", limit=2)
  assert error.value.code == "PRODUCT_RATE_LIMITED"
  assert error.value.details["retryAfterSeconds"] == 12


@pytest.mark.asyncio
async def test_trend_provider_is_disabled_without_external_configuration() -> None:
  result = await NaverShoppingInsightProvider(Settings()).get_keyword_trends(
    TrendRequest(keywords=("글로우 립",), start_date="2026-07-01", end_date="2026-07-12", category="lip")
  )
  assert result == {"status": "disabled", "series": []}


def test_trend_provider_builds_the_official_keyword_contract_for_legacy_credentials() -> None:
  provider = NaverShoppingInsightProvider(Settings(
    naver_shopping_insight_enabled=True,
    naver_shopping_insight_endpoint="https://openapi.naver.com/v1/datalab/shopping/category/keywords",
    naver_shopping_client_id="legacy-id",
    naver_shopping_client_secret="legacy-secret",
  ))
  _, headers, payload = provider._request_parts(TrendRequest(
    keywords=("립글로스", "크림 블러셔"),
    start_date="2026-06-15",
    end_date="2026-07-13",
    category="50000002",
  ))
  assert headers == {"X-Naver-Client-Id": "legacy-id", "X-Naver-Client-Secret": "legacy-secret"}
  assert payload["timeUnit"] == "date"
  assert payload["keyword"] == [
    {"name": "립글로스", "param": ["립글로스"]},
    {"name": "크림 블러셔", "param": ["크림 블러셔"]},
  ]
  assert "keywords" not in payload


def test_trend_provider_uses_api_hub_credentials_and_recent_momentum_scoring() -> None:
  provider = NaverShoppingInsightProvider(Settings(
    naver_shopping_insight_enabled=True,
    naver_shopping_insight_endpoint="https://naverapihub.apigw.ntruss.com/shopping/v1/category/keywords",
    naver_api_hub_client_id="hub-id",
    naver_api_hub_client_secret="hub-secret",
  ))
  _, headers, _ = provider._request_parts(TrendRequest(
    keywords=("립글로스",), start_date="2026-06-15", end_date="2026-07-13", category="50000002",
  ))
  assert headers == {"X-NCP-APIGW-API-KEY-ID": "hub-id", "X-NCP-APIGW-API-KEY": "hub-secret"}
  rising = {"data": [{"ratio": value} for value in [10] * 7 + [30] * 7]}
  flat = {"data": [{"ratio": 20} for _ in range(14)]}
  assert _series_score(rising) > _series_score(flat)


@pytest.mark.asyncio
@pytest.mark.parametrize(
  "endpoint",
  (
    "http://openapi.naver.com/v1/datalab/shopping/category/keywords",
    "https://127.0.0.1/v1/datalab/shopping/category/keywords",
    "https://openapi.naver.com.evil.test/collect",
  ),
)
async def test_trend_provider_rejects_unapproved_endpoint_before_sending_credentials(
  endpoint: str,
) -> None:
  provider = NaverShoppingInsightProvider(
    Settings(
      naver_shopping_insight_enabled=True,
      naver_shopping_insight_endpoint=endpoint,
      naver_shopping_client_id="client-id",
      naver_shopping_client_secret="client-secret",
    )
  )
  with pytest.raises(AppError) as error:
    await provider.get_keyword_trends(
      TrendRequest(
        keywords=("글로우 립",),
        start_date="2026-07-01",
        end_date="2026-07-12",
        category="lip",
      )
    )
  assert error.value.code in {"UNSAFE_EXTERNAL_URL", "UNAPPROVED_EXTERNAL_DOMAIN"}


@pytest.mark.asyncio
async def test_auradin_live_naver_discovery_is_blocked_on_trusted_catalog_path() -> None:
  result = await _enrich_live_discovery(
    {},
    Settings(
      legacy_naver_product_search=False,
      auradin_live_discovery_enabled=True,
      naver_shopping_client_id="client-id",
      naver_shopping_client_secret="client-secret",
    ),
    {"products": [{"id": "trusted-product", "category": "lip"}]},
    None,
  )
  assert result == {"status": "trusted_catalog_only"}


def test_cohort_uses_only_broad_positive_color_preferences() -> None:
  assert broad_color_bucket({"color_family:mauve": 3, "brand_name:Example": 100}) == "cool"
  assert broad_color_bucket({"color_family:coral": -5}) is None


def test_cohort_can_fall_back_to_a_broad_product_category_without_identity_data() -> None:
  assert broad_preference_bucket({"category:lip": 4, "brand_name:Example": 100}) == "category-lip"
  assert broad_preference_bucket({"color_family:mauve": 3, "category:base": 10}) == "color-cool"
  assert broad_preference_bucket({"brand_name:Example": 100}) is None


def test_deployed_cohort_feature_cannot_lower_privacy_threshold() -> None:
  with pytest.raises(ValidationError):
    Settings(
      environment="production",
      cohort_recommendations_v1=True,
      product_cohort_min_size=99,
    )
  with pytest.raises(ValidationError):
    Settings(
      environment="staging",
      cohort_recommendations_v1=True,
      product_cohort_min_item_support=4,
    )
  assert Settings(
    environment="production",
    cohort_recommendations_v1=True,
    product_cohort_min_size=100,
  ).product_cohort_min_size == 100


def test_deployed_environment_rejects_legacy_product_fixture_catalog() -> None:
  with pytest.raises(ValidationError):
    Settings(environment="production", legacy_naver_product_search=True)
  assert Settings(environment="local", legacy_naver_product_search=True).legacy_naver_product_search


class _InvalidEventShadeDb:
  async def fetchrow(self, query: str, *_args):
    assert "from product_shades" in query
    return {"valid": False}


class _SeasonalEventReferenceDb:
  def __init__(self) -> None:
    self.queries: list[str] = []

  async def fetchrow(self, query: str, *_args):
    self.queries.append(query)
    assert "superseded_by_trend_refresh" in query
    assert "automatic_health_rollback" not in query
    assert "interval '7 days'" in query
    return {"valid": True}


@pytest.mark.asyncio
async def test_event_shade_must_belong_to_the_event_product() -> None:
  event = ProductEvent(
    eventId=uuid4(),
    eventType="product_open",
    occurredAt=NOW,
    section="legacy",
    productId=uuid4(),
    shadeId=uuid4(),
  )
  with pytest.raises(AppError) as error:
    await validate_event_reference(  # type: ignore[arg-type]
      _InvalidEventShadeDb(),
      user_id=uuid4(),
      event=event,
    )
  assert error.value.code == "INVALID_EVENT_SHADE"


@pytest.mark.asyncio
@pytest.mark.parametrize("external", (False, True))
async def test_events_accept_the_exact_stale_seasonal_collection_serving_window(external: bool) -> None:
  db = _SeasonalEventReferenceDb()
  payload = {
    "eventId": uuid4(),
    "eventType": "product_open",
    "occurredAt": NOW,
    "section": "seasonal",
    "collectionId": uuid4(),
    "position": 0,
  }
  if external:
    payload.update({
      "externalSource": "auradin_catalog",
      "externalProductId": "auradin-seed-3f16a4750d11b658",
    })
  else:
    payload["productId"] = uuid4()

  await validate_event_reference(  # type: ignore[arg-type]
    db,
    user_id=uuid4(),
    event=ProductEvent(**payload),
  )

  assert len(db.queries) == 1


def test_experiment_assignment_is_deterministic_and_configurable() -> None:
  user_id = uuid4()
  assert _in_experiment(user_id, 100, "test") is True
  assert _in_experiment(user_id, 0, "test") is False
  assert _in_experiment(user_id, 50, "test") == _in_experiment(user_id, 50, "test")


def test_optional_personalization_rejects_unknown_or_under_14_age() -> None:
  today = date(2026, 7, 13)
  assert _is_at_least_14(date(2012, 7, 13), today=today)
  assert not _is_at_least_14(date(2012, 7, 14), today=today)
  assert not _is_at_least_14(None, today=today)


def test_account_session_purge_removes_only_matching_owner() -> None:
  clear_sessions()
  first = create_session(prompt="립", owner_subject="owner-a", catalog_items=[])
  second = create_session(prompt="립", owner_subject="owner-b", catalog_items=[])
  assert purge_in_memory_owner_sessions("owner-a") == 1
  assert get_session(first["sessionId"], owner_subject="owner-a") is None
  assert get_session(second["sessionId"], owner_subject="owner-b") is not None
  clear_sessions()


class _ConsentHistoryDb:
  def __init__(self) -> None:
    self.purposes: list[str] = []

  async def execute(self, _query: str, _user_id: UUID, purpose: str, _version: str):
    self.purposes.append(purpose)
    return "INSERT 0 1"


@pytest.mark.asyncio
async def test_privacy_delete_records_withdrawal_for_both_optional_purposes() -> None:
  db = _ConsentHistoryDb()
  await revoke_all_product_consents(db, user_id=uuid4())  # type: ignore[arg-type]
  assert db.purposes == ["color_cohort", "engagement_personalization"]


class _DerivedDeletionDb:
  def __init__(self) -> None:
    self.queries: list[str] = []

  async def execute(self, query: str, _user_id: UUID):
    self.queries.append(query)
    return "DELETE 1"


@pytest.mark.asyncio
async def test_engagement_withdrawal_deletes_downstream_cohort_membership() -> None:
  db = _DerivedDeletionDb()
  deleted = await delete_product_personalization(  # type: ignore[arg-type]
    db,
    user_id=uuid4(),
    target="engagement_consent",
  )
  assert deleted == {"events": 1, "profiles": 1, "runs": 1, "cohort": 1}
  assert any("product_color_cohort_memberships" in query for query in db.queries)


@pytest.mark.asyncio
async def test_unknown_consent_copy_version_is_not_accepted() -> None:
  with pytest.raises(AppError) as error:
    await set_product_consent(  # type: ignore[arg-type]
      object(),
      user_id=uuid4(),
      purpose="engagement_personalization",
      accepted=True,
      version="unreviewed-client-copy",
    )
  assert error.value.code == "INVALID_CONSENT_VERSION"
