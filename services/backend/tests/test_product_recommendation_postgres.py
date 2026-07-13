"""PostgreSQL contract coverage for Product Recommendation V2.

The test data lives inside one rolled-back transaction.  It can therefore
exercise the production schema without ever becoming displayable catalog data.
"""

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import os
from uuid import UUID, uuid4

import asyncpg
import pytest
from fastapi import Response

from app.api.makeup_styles import (
  create_makeup_style,
  delete_makeup_style,
  get_makeup_style,
  update_makeup_style,
)
from app.api.products import (
  like_product as api_like_product,
  open_product_offer,
  search_products as api_search_products,
  unlike_product as api_unlike_product,
)
from app.core.errors import AppError
from app.core.security import AuthContext
from app.core.settings import Settings
from app.schemas.makeup import MakeupStyleCreate, MakeupStyleUpdate
from app.schemas.product_recommendation import ProductEvent, ProductLikeRequest
from app.services.product_catalog import (
  ensure_like_eligible,
  get_catalog_product,
  get_catalog_readiness,
  search_catalog,
)
from app.services.product_catalog_ingestion import apply_catalog_manifest
from app.services.product_recommendations import (
  CONSENT_VERSION_DEFAULT,
  delete_product_personalization,
  get_ar_recommendations,
  get_cohort_recommendations,
  get_personalized_recommendations,
  get_product_consents,
  get_seasonal_recommendations,
  record_client_events,
  revoke_all_product_consents,
  set_product_consent,
)
from app.services.product_cohorts import refresh_color_cohort_memberships
from app.services.product_rate_limit import enforce_product_rate_limit
from app.services.product_seasonal import expire_seasonal_collections, publish_seasonal_manifest
from app.services.shopping_products import build_product_recommendation_data


TEST_DATABASE_URL = os.getenv("AURA_PRODUCT_RECOMMENDATION_TEST_DATABASE_URL")


class ConnectionDatabase:
  """Minimal Database-compatible adapter bound to the test transaction."""

  def __init__(self, connection: asyncpg.Connection) -> None:
    self.connection = connection
    self.pool = SingleConnectionPool(connection)

  @property
  def is_connected(self) -> bool:
    return True

  async def execute(self, query: str, *args) -> str:
    return await self.connection.execute(query, *args)

  async def fetch(self, query: str, *args) -> list[dict]:
    return [dict(row) for row in await self.connection.fetch(query, *args)]

  async def fetchrow(self, query: str, *args) -> dict | None:
    row = await self.connection.fetchrow(query, *args)
    return dict(row) if row else None


class SingleConnectionAcquire:
  def __init__(self, connection: asyncpg.Connection) -> None:
    self.connection = connection

  async def __aenter__(self) -> asyncpg.Connection:
    return self.connection

  async def __aexit__(self, _error_type, _error, _traceback) -> None:
    return None


class SingleConnectionPool:
  def __init__(self, connection: asyncpg.Connection) -> None:
    self.connection = connection

  def acquire(self) -> SingleConnectionAcquire:
    return SingleConnectionAcquire(self.connection)


def saved_ar_payload() -> dict:
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
          "color": "#B85C68",
          "finish": "matte",
          "intensity": 0.72,
          "opacity": 0.78,
          "blendMode": "multiply",
        },
      ],
    },
  }


@pytest.mark.skipif(
  not TEST_DATABASE_URL,
  reason="AURA_PRODUCT_RECOMMENDATION_TEST_DATABASE_URL is not configured",
)
@pytest.mark.asyncio
async def test_product_recommendation_v2_contracts_in_postgres(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  connection = await asyncpg.connect(TEST_DATABASE_URL)
  transaction = connection.transaction()
  await transaction.start()
  try:
    db = ConnectionDatabase(connection)
    settings = Settings(
      ar_product_recommendations_v1=True,
      seasonal_recommendations_v1=True,
      engagement_personalization_v1=True,
      cohort_recommendations_v1=True,
          product_event_signing_secret="integration-only-secret",
          product_catalog_manifest_signing_secret="integration-catalog-secret",
          product_seasonal_manifest_signing_secret="integration-seasonal-secret",
      product_catalog_allowed_image_domains="example.com",
      product_catalog_allowed_seller_domains="example.com",
    )
    baseline_readiness = await get_catalog_readiness(db)  # type: ignore[arg-type]

    user_id, creator_id, reviewer_id, publisher_id = (uuid4() for _ in range(4))
    await connection.executemany(
      "insert into users (id,nickname) values ($1,$2)",
      [
        (user_id, "integration-user"),
        (creator_id, "integration-creator"),
        (reviewer_id, "integration-reviewer"),
        (publisher_id, "integration-publisher"),
      ],
    )
    owner_auth = AuthContext(
      subject="integration-owner",
      provider="google",
      email=None,
      name=None,
      claims={},
    )
    attacker_auth = AuthContext(
      subject="integration-attacker",
      provider="google",
      email=None,
      name=None,
      claims={},
    )

    async def fake_ensure_user(_db, auth: AuthContext) -> dict:
      return {"id": user_id if auth.subject == owner_auth.subject else creator_id}

    monkeypatch.setattr("app.api.makeup_styles.ensure_user", fake_ensure_user)
    monkeypatch.setattr("app.api.products.ensure_user", fake_ensure_user)

    marker = f"integration-only-{uuid4().hex}"
    product_id = await connection.fetchval(
      """
      insert into products (
        external_key,brand_name,product_name,category,source_provider,
        source_license_type,license_status,allowed_uses,catalog_status
      ) values ($1,'INTEGRATION ONLY','NOT FOR DISPLAY','lip','test-transaction',
        'integration_test','unverified','{}','draft') returning id
      """,
      marker,
    )
    assert await search_catalog(db, query=marker, category=None, limit=10) == []  # type: ignore[arg-type]

    await connection.execute(
      """
      update products set product_name=$2,license_status='valid',
        allowed_uses=array['mobile_display','recommendation'],catalog_status='published'
      where id=$1
      """,
      product_id,
      marker,
    )
    shade_id = await connection.fetchval(
      """
      insert into product_shades (
        product_id,external_shade_key,shade_name,product_region,srgb_hex,
        lab_l,lab_a,lab_b,color_family,finish,opacity,evidence_type,
        evidence_confidence,license_status,allowed_uses,reviewed_at
      ) values ($1,'integration-shade','Integration shade','lip','#B85C68',
        52.0,37.0,14.0,'rose','matte',0.9,'manual_review',1.0,'valid',
        array['mobile_display','recommendation'],now()) returning id
      """,
      product_id,
    )
    unavailable_shade_id = await connection.fetchval(
      """
      insert into product_shades (
        product_id,external_shade_key,shade_name,product_region,srgb_hex,
        lab_l,lab_a,lab_b,color_family,finish,opacity,evidence_type,
        evidence_confidence,license_status,allowed_uses,reviewed_at
      ) values ($1,'integration-shade-without-offer','No matching offer','lip','#8C4C7A',
        42.0,31.0,-12.0,'mauve','gloss',0.8,'manual_review',1.0,'valid',
        array['mobile_display','recommendation'],now()) returning id
      """,
      product_id,
    )
    other_product_id = await connection.fetchval(
      """
      insert into products (
        external_key,brand_name,product_name,category,source_provider,
        source_license_type,license_status,allowed_uses,catalog_status
      ) values ($1,'INTEGRATION ONLY','OTHER PRODUCT','lip','test-transaction',
        'integration_test','unverified','{}','draft') returning id
      """,
      f"{marker}-other-product",
    )
    with pytest.raises(asyncpg.ForeignKeyViolationError):
      async with connection.transaction():
        await connection.execute(
          """
          insert into product_assets (
            product_id,shade_id,asset_type,asset_url,source_provider,source_reference,
            license_type,license_status,allowed_uses
          ) values ($1,$2,'packshot','https://assets.example.com/mismatched.png',
            'test-transaction',$3,'integration_test','valid',array['mobile_display'])
          """,
          other_product_id,
          shade_id,
          f"{marker}-mismatched-asset",
        )
    with pytest.raises(asyncpg.ForeignKeyViolationError):
      async with connection.transaction():
        await connection.execute(
          """
          insert into product_offers (
            product_id,shade_id,seller_name,seller_domain,purchase_url,
            availability_status,source_provider,source_reference,license_status,allowed_uses
          ) values ($1,$2,'Integration seller','seller.example.com',
            'https://seller.example.com/mismatched','in_stock','test-transaction',$3,
            'valid',array['mobile_display'])
          """,
          other_product_id,
          shade_id,
          f"{marker}-mismatched-offer",
        )
    await connection.execute(
      """
      insert into product_assets (
        product_id,shade_id,asset_type,asset_url,source_provider,source_reference,
        license_type,license_status,allowed_uses,reviewed_at
      ) values ($1,$2,'packshot','https://assets.example.com/integration-only.png',
        'test-transaction',$3,'integration_test','valid',
        array['mobile_display','recommendation'],now())
      """,
      product_id,
      shade_id,
      marker,
    )
    offer_id = await connection.fetchval(
      """
      insert into product_offers (
        product_id,shade_id,seller_name,seller_domain,purchase_url,price_amount,
        availability_status,availability_checked_at,price_updated_at,source_provider,source_reference,
        license_status,allowed_uses
      ) values ($1,$2,'Integration seller','seller.example.com',
        'https://seller.example.com/integration-only',1000,'in_stock',now(),now(),
        'test-transaction',$3,'valid',array['mobile_display']) returning id
      """,
      product_id,
      shade_id,
      marker,
    )

    readiness = await get_catalog_readiness(db)  # type: ignore[arg-type]
    assert readiness["eligibleProducts"] == baseline_readiness["eligibleProducts"] + 1
    assert readiness["arEligibleProducts"] == baseline_readiness["arEligibleProducts"] + 1

    search_results = await search_catalog(db, query=marker, category="lip", limit=10)  # type: ignore[arg-type]
    assert len(search_results) == 1
    assert search_results[0]["productId"] == str(product_id)
    assert search_results[0]["shadeId"] == str(shade_id)
    assert search_results[0]["offer"]["offerId"] == str(offer_id)
    category_search = await search_catalog(db, query="립", category=None, limit=50)  # type: ignore[arg-type]
    assert any(item["productId"] == str(product_id) for item in category_search)
    preferred_detail = await get_catalog_product(  # type: ignore[arg-type]
      db,
      product_id,
      user_id=user_id,
      shade_id=shade_id,
    )
    assert preferred_detail is not None
    assert preferred_detail["shadeId"] == str(shade_id)
    assert preferred_detail["offer"]["offerId"] == str(offer_id)
    assert await get_catalog_product(  # type: ignore[arg-type]
      db,
      product_id,
      user_id=user_id,
      shade_id=unavailable_shade_id,
    ) is None
    with pytest.raises(AppError) as mismatched_shade_like:
      await ensure_like_eligible(  # type: ignore[arg-type]
        db,
        product_id=product_id,
        source_shade_id=unavailable_shade_id,
      )
    assert mismatched_shade_like.value.code == "INVALID_SOURCE_SHADE"

    await connection.execute(
      "update product_offers set availability_status='out_of_stock' where id=$1",
      offer_id,
    )
    assert await search_catalog(db, query=marker, category="lip", limit=10) == []  # type: ignore[arg-type]
    assert await get_catalog_product(db, product_id, user_id=user_id) is None  # type: ignore[arg-type]
    with pytest.raises(AppError) as unavailable_like:
      await ensure_like_eligible(  # type: ignore[arg-type]
        db,
        product_id=product_id,
        source_shade_id=shade_id,
      )
    assert unavailable_like.value.code == "PRODUCT_NOT_ELIGIBLE"
    await connection.execute(
      "update product_offers set availability_status='in_stock' where id=$1",
      offer_id,
    )
    await connection.execute(
      """update product_offers set availability_checked_at=now()-interval '8 days',
        price_updated_at=now()-interval '8 days' where id=$1""",
      offer_id,
    )
    assert await search_catalog(db, query=marker, category="lip", limit=10) == []  # type: ignore[arg-type]
    assert await get_catalog_product(db, product_id, user_id=user_id) is None  # type: ignore[arg-type]
    await connection.execute(
      "update product_offers set availability_checked_at=now(),price_updated_at=now() where id=$1",
      offer_id,
    )
    await connection.execute(
      "update product_assets set asset_type='swatch' where product_id=$1",
      product_id,
    )
    assert await search_catalog(db, query=marker, category="lip", limit=10) == []  # type: ignore[arg-type]
    assert await get_catalog_product(db, product_id, user_id=user_id) is None  # type: ignore[arg-type]
    await connection.execute(
      "update product_assets set asset_type='packshot' where product_id=$1",
      product_id,
    )

    with pytest.raises(asyncpg.ForeignKeyViolationError):
      async with connection.transaction():
        await connection.execute(
          """
          insert into user_product_likes (user_id,product_id,source_shade_id)
          values ($1,$2,$3)
          """,
          user_id,
          other_product_id,
          shade_id,
        )
    with pytest.raises(asyncpg.ForeignKeyViolationError):
      async with connection.transaction():
        await connection.execute(
          """
          insert into product_engagement_events (
            event_id,user_id,product_id,shade_id,event_type,section,occurred_at
          ) values ($1,$2,$3,$4,'product_open','legacy',now())
          """,
          uuid4(),
          user_id,
          other_product_id,
          shade_id,
        )

    like_payload = ProductLikeRequest(sourceShadeId=shade_id)
    await api_like_product(
      product_id,
      like_payload,
      auth=owner_auth,
      db=db,  # type: ignore[arg-type]
      settings=settings,
    )
    await api_like_product(
      product_id,
      like_payload,
      auth=owner_auth,
      db=db,  # type: ignore[arg-type]
      settings=settings,
    )
    assert await connection.fetchval(
      "select count(*) from user_product_likes where user_id=$1 and product_id=$2",
      user_id,
      product_id,
    ) == 1
    detail = await get_catalog_product(db, product_id, user_id=user_id)  # type: ignore[arg-type]
    assert detail is not None and detail["viewerState"]["liked"] is True
    await api_unlike_product(
      product_id,
      auth=owner_auth,
      db=db,  # type: ignore[arg-type]
      settings=settings,
    )
    await api_unlike_product(
      product_id,
      auth=owner_auth,
      db=db,  # type: ignore[arg-type]
      settings=settings,
    )
    assert await connection.fetchval(
      "select count(*) from user_product_likes where user_id=$1 and product_id=$2",
      user_id,
      product_id,
    ) == 0
    assert await connection.fetchval(
      "select count(*) from product_engagement_events where user_id=$1",
      user_id,
    ) == 0
    legacy_data, legacy_source = await build_product_recommendation_data(
      db,  # type: ignore[arg-type]
      settings,
      category="lip",
    )
    legacy_item = next(item for item in legacy_data["products"] if item["id"] == str(product_id))
    assert legacy_source == "database"
    assert legacy_item["imageUrl"] == "https://assets.example.com/integration-only.png"
    assert legacy_item["purchaseUrl"] == "https://seller.example.com/integration-only"

    style_request_id = uuid4()
    owned_face_media_id = uuid4()
    await connection.execute(
      """
      insert into media_assets (id,owner_user_id,media_kind,source,status)
      values ($1,$2,'ar-source-frame','camera','active')
      """,
      owned_face_media_id,
      user_id,
    )
    style_payload = MakeupStyleCreate.model_validate(
      {
        "clientRequestId": style_request_id,
        "sourceMediaId": owned_face_media_id,
        "thumbnailMediaId": owned_face_media_id,
        "title": "Integration AR look",
        "stylePayload": saved_ar_payload(),
      },
    )
    first_style = await create_makeup_style(
      style_payload,
      auth=owner_auth,
      db=db,  # type: ignore[arg-type]
      settings=settings,
    )
    second_style = await create_makeup_style(
      style_payload,
      auth=owner_auth,
      db=db,  # type: ignore[arg-type]
      settings=settings,
    )
    style_id = UUID(first_style["data"]["style"]["id"])
    assert second_style["data"]["style"]["id"] == str(style_id)
    assert await connection.fetchval(
      "select count(*) from saved_makeup_styles where user_id=$1 and client_request_id=$2",
      user_id,
      style_request_id,
    ) == 1
    persisted_media = await connection.fetchrow(
      "select source_media_id,thumbnail_media_id from saved_makeup_styles where id=$1",
      style_id,
    )
    assert persisted_media["source_media_id"] is None
    assert persisted_media["thumbnail_media_id"] is None
    persisted_payload = first_style["data"]["style"]["stylePayload"]
    assert "sourceFrameMetadata" not in persisted_payload
    assert "sourceFrameMetadata" not in persisted_payload["recipe"]
    style_response = Response()
    await get_makeup_style(
      style_id,
      response=style_response,
      auth=owner_auth,
      db=db,  # type: ignore[arg-type]
    )
    assert style_response.headers["Cache-Control"] == "private, no-store"
    with pytest.raises(AppError) as ownership_error:
      await get_makeup_style(
        style_id,
        response=Response(),
        auth=attacker_auth,
        db=db,  # type: ignore[arg-type]
      )
    assert ownership_error.value.code == "MAKEUP_STYLE_NOT_FOUND"
    ar_result = await get_ar_recommendations(
      db,  # type: ignore[arg-type]
      settings,
      user_id=user_id,
      style_id=style_id,
      regions=["lip"],
      per_region_limit=5,
    )
    assert ar_result["status"] == "ready"
    assert ar_result["groups"][0]["items"][0]["productId"] == str(product_id)
    assert ar_result["groups"][0]["items"][0]["shadeId"] == str(shade_id)
    assert ar_result["groups"][0]["items"][0]["reasonCodes"] == [
      "CLOSE_AUTHORING_COLOR",
      "MATCHING_FINISH",
    ]
    archived = await update_makeup_style(
      style_id,
      MakeupStyleUpdate(archived=True),
      auth=owner_auth,
      db=db,  # type: ignore[arg-type]
    )
    assert archived["data"]["style"]["archivedAt"] is not None
    assert await connection.fetchval(
      "select count(*) from product_recommendation_runs where source_style_id=$1",
      style_id,
    ) == 0
    with pytest.raises(AppError) as archived_error:
      await get_ar_recommendations(
        db,  # type: ignore[arg-type]
        settings,
        user_id=user_id,
        style_id=style_id,
        regions=["lip"],
        per_region_limit=5,
      )
    assert archived_error.value.code == "AR_STYLE_NOT_FOUND"
    await update_makeup_style(
      style_id,
      MakeupStyleUpdate(archived=False),
      auth=owner_auth,
      db=db,  # type: ignore[arg-type]
    )
    restored_ar = await get_ar_recommendations(
      db,  # type: ignore[arg-type]
      settings,
      user_id=user_id,
      style_id=style_id,
      regions=["lip"],
      per_region_limit=5,
    )
    assert restored_ar["status"] == "ready"
    deleted_style = await delete_makeup_style(
      style_id,
      auth=owner_auth,
      db=db,  # type: ignore[arg-type]
    )
    assert deleted_style["data"] == {"styleId": str(style_id), "deleted": True}
    assert await connection.fetchval(
      "select count(*) from product_recommendation_runs where source_style_id=$1",
      style_id,
    ) == 0

    with pytest.raises(asyncpg.CheckViolationError):
      async with connection.transaction():
        await connection.execute(
          """
          insert into product_seasonal_collections (
            slug,title,summary,trend_window,valid_from,valid_until,status,
            reviewed_at,published_at,created_by,reviewed_by,published_by
          ) values ($1,'Invalid','Invalid','test',now()-interval '1 day',
            now()+interval '1 day','published',now(),now(),$2,$3,$2)
          """,
          f"{marker}-invalid",
          creator_id,
          reviewer_id,
        )

    seasonal_now = datetime.now(timezone.utc)
    seasonal_locale = f"it-{uuid4().hex[:8]}"

    def seasonal_manifest(item_shade_id: UUID, *, slug_suffix: str) -> dict:
      return {
        "schemaVersion": "product_seasonal_manifest_v1",
        "id": str(uuid4()),
        "slug": f"{marker}-{slug_suffix}",
        "title": "Integration collection",
        "summary": "Transaction-only collection",
        "locale": seasonal_locale,
        "revision": 1,
        "createdBy": str(creator_id),
        "reviewedBy": str(reviewer_id),
        "publishedBy": str(publisher_id),
        "validFrom": (
          seasonal_now.replace(microsecond=0) - timedelta(minutes=1)
        ).isoformat(),
        "validUntil": (
          seasonal_now.replace(microsecond=0) + timedelta(days=1)
        ).isoformat(),
        "trendWindow": "integration-window",
        "sourceLabels": ["integration-test"],
        "sourcePayload": {
          "sourceUpdatedAt": seasonal_now.replace(microsecond=0).isoformat(),
          "contentReviewReference": "integration-review",
          "trendMetric": "editorial_signal",
          "providerStatus": "reviewed",
        },
        "items": [
          {
            "productId": str(product_id),
            "shadeId": str(item_shade_id),
            "position": 0,
            "reasonCode": "EDITOR_REVIEWED",
            "sponsorshipType": "organic",
          }
        ],
      }

    def seasonal_signature(manifest: dict) -> str:
      canonical = json.dumps(
        manifest,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
      ).encode()
      return hmac.new(
        b"integration-seasonal-secret",
        canonical,
        hashlib.sha256,
      ).hexdigest()

    invalid_manifest = seasonal_manifest(unavailable_shade_id, slug_suffix="unavailable")
    with pytest.raises(AppError) as invalid_seasonal_product:
      await publish_seasonal_manifest(  # type: ignore[arg-type]
        db,
        settings,
        manifest=invalid_manifest,
        signature=seasonal_signature(invalid_manifest),
      )
    assert invalid_seasonal_product.value.code == "SEASONAL_PRODUCT_NOT_ELIGIBLE"

    manifest = seasonal_manifest(shade_id, slug_suffix="published")
    with pytest.raises(AppError) as ungranted_seasonal_actor:
      await publish_seasonal_manifest(  # type: ignore[arg-type]
        db,
        settings,
        manifest=manifest,
        signature=seasonal_signature(manifest),
      )
    assert ungranted_seasonal_actor.value.code == "INVALID_SEASONAL_ACTOR"
    await connection.executemany(
      """insert into product_recommendation_operators (user_id,roles,granted_by)
        values ($1,$2::text[],$3)""",
      [
        (creator_id, ["seasonal_editor"], publisher_id),
        (reviewer_id, ["seasonal_reviewer"], publisher_id),
        (publisher_id, ["catalog_admin", "seasonal_publisher", "seasonal_operator"], publisher_id),
      ],
    )
    catalog_product_id, catalog_shade_id, catalog_asset_id, catalog_offer_id = (uuid4() for _ in range(4))
    catalog_now = datetime.now(timezone.utc).replace(microsecond=0)
    catalog_manifest = {
      "schemaVersion": "product_catalog_manifest_v1",
      "manifestId": str(uuid4()),
      "sourceProvider": "integration-licensed-partner",
      "catalogVersion": f"integration-{uuid4().hex}",
      "products": [
        {
          "id": str(catalog_product_id),
          "externalKey": f"integration-catalog-{uuid4().hex}",
          "brandName": "Integration Licensed Brand",
          "productName": "Integration Reviewed Lip",
          "category": "lip",
          "licenseType": "partner_feed",
          "sourceReference": "integration:item:1",
          "licenseStatus": "valid",
          "catalogStatus": "published",
          "licenseValidFrom": (catalog_now - timedelta(days=1)).isoformat(),
          "licenseValidUntil": (catalog_now + timedelta(days=30)).isoformat(),
          "allowedUses": ["mobile_display", "recommendation"],
          "shades": [
            {
              "id": str(catalog_shade_id),
              "externalShadeKey": "integration-rose",
              "shadeName": "Integration Rose",
              "productRegion": "lip",
              "srgbHex": "#B96872",
              "finish": "gloss",
              "evidenceType": "measured_swatch",
              "evidenceReference": "integration:measurement:1",
              "evidenceConfidence": 0.98,
              "measuredAt": (catalog_now - timedelta(days=2)).isoformat(),
              "reviewedAt": (catalog_now - timedelta(days=1)).isoformat(),
              "licenseValidFrom": (catalog_now - timedelta(days=1)).isoformat(),
              "licenseValidUntil": (catalog_now + timedelta(days=30)).isoformat(),
              "allowedUses": ["mobile_display", "recommendation"],
            }
          ],
          "assets": [
            {
              "id": str(catalog_asset_id),
              "shadeId": str(catalog_shade_id),
              "assetType": "packshot",
              "url": "https://assets.example.com/integration-catalog.png",
              "sourceReference": "integration:asset:1",
              "licenseType": "partner_asset",
              "validFrom": (catalog_now - timedelta(days=1)).isoformat(),
              "validUntil": (catalog_now + timedelta(days=30)).isoformat(),
              "reviewedAt": (catalog_now - timedelta(days=1)).isoformat(),
              "allowedUses": ["mobile_display", "recommendation"],
            }
          ],
          "offers": [
            {
              "id": str(catalog_offer_id),
              "shadeId": str(catalog_shade_id),
              "sellerName": "Integration Approved Shop",
              "sellerDomain": "seller.example.com",
              "purchaseUrl": "https://seller.example.com/integration-catalog",
              "sourceReference": "integration:offer:1",
              "priceAmount": 19000,
              "availabilityStatus": "in_stock",
              "availabilityCheckedAt": catalog_now.isoformat(),
              "priceUpdatedAt": catalog_now.isoformat(),
              "affiliateType": "none",
              "validUntil": (catalog_now + timedelta(days=2)).isoformat(),
              "allowedUses": ["mobile_display"],
            }
          ],
        }
      ],
    }
    catalog_signature = hmac.new(
      b"integration-catalog-secret",
      json.dumps(catalog_manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(),
      hashlib.sha256,
    ).hexdigest()
    imported_counts = await apply_catalog_manifest(  # type: ignore[arg-type]
      db,
      settings,
      manifest=catalog_manifest,
      signature=catalog_signature,
      actor_user_id=publisher_id,
    )
    assert imported_counts == {"products": 1, "shades": 1, "assets": 1, "offers": 1}
    assert await connection.fetchval(
      "select catalog_status from products where id=$1",
      catalog_product_id,
    ) == "published"
    collection_id = await publish_seasonal_manifest(  # type: ignore[arg-type]
      db,
      settings,
      manifest=manifest,
      signature=seasonal_signature(manifest),
    )
    assert str(collection_id) == manifest["id"]
    assert await connection.fetchval(
      "select count(*) from audit_logs where entity_id=$1 and action='seasonal.published'",
      collection_id,
    ) == 1
    seasonal = await get_seasonal_recommendations(db, settings, locale=seasonal_locale, limit=10)  # type: ignore[arg-type]
    assert seasonal["status"] == "ready"
    assert seasonal["items"][0]["productId"] == str(product_id)
    assert seasonal["items"][0]["sponsored"] is False

    elapsed_collection_id = uuid4()
    await connection.execute(
      """insert into product_seasonal_collections (
        id,slug,title,summary,locale,trend_window,source_labels,valid_from,valid_until,
        reviewed_at,published_at,status,created_by,reviewed_by,published_by
      ) values ($1,$2,'Elapsed integration season','Elapsed','en-expired','past-window',
        array['integration'],now()-interval '2 days',now()-interval '1 day',now(),now(),
        'published',$3,$4,$5)""",
      elapsed_collection_id,
      f"elapsed-{uuid4().hex}",
      creator_id,
      reviewer_id,
      publisher_id,
    )
    expiry = await expire_seasonal_collections(db, apply=True)  # type: ignore[arg-type]
    assert str(elapsed_collection_id) in expiry["collectionIds"]
    assert await connection.fetchval(
      "select status from product_seasonal_collections where id=$1",
      elapsed_collection_id,
    ) == "expired"
    assert await connection.fetchval(
      "select count(*) from audit_logs where entity_id=$1 and action='seasonal.expired'",
      elapsed_collection_id,
    ) == 1

    consent = await set_product_consent(
      db,  # type: ignore[arg-type]
      user_id=user_id,
      purpose="engagement_personalization",
      accepted=True,
      version=CONSENT_VERSION_DEFAULT,
    )
    assert consent["accepted"] is True
    search_http_response = Response()
    search_response = await api_search_products(
      response=search_http_response,
      q=marker,
      category="lip",
      limit=10,
      auth=owner_auth,
      db=db,  # type: ignore[arg-type]
      settings=settings,
    )
    assert search_http_response.headers["Cache-Control"] == "private, no-store"
    search_request_id = UUID(search_response["data"]["searchRequestId"])
    assert search_response["data"]["items"][0]["productId"] == str(product_id)
    event = ProductEvent.model_validate(
      {
        "eventId": str(uuid4()),
        "eventType": "search_result_open",
        "occurredAt": datetime.now(timezone.utc).isoformat(),
        "section": "search",
        "productId": str(product_id),
        "shadeId": str(shade_id),
        "searchRequestId": str(search_request_id),
        "position": 0,
        "context": {"screen": "integration-only"},
      },
    )
    assert await record_client_events(  # type: ignore[arg-type]
      db, settings, user_id=user_id, events=[event, event]
    ) == {"accepted": 1, "duplicates": 1}
    outbound = await open_product_offer(
      product_id,
      offer_id,
      auth=owner_auth,
      db=db,  # type: ignore[arg-type]
      settings=settings,
    )
    assert outbound["data"]["url"] == "https://seller.example.com/integration-only"
    assert outbound["data"]["shadeId"] == str(shade_id)
    assert await connection.fetchval(
      """
      select count(*) from product_engagement_events
      where user_id=$1 and event_type='seller_outbound' and shade_id=$2
      """,
      user_id,
      shade_id,
    ) == 1
    await api_like_product(
      product_id,
      like_payload,
      auth=owner_auth,
      db=db,  # type: ignore[arg-type]
      settings=settings,
    )
    await api_unlike_product(
      product_id,
      auth=owner_auth,
      db=db,  # type: ignore[arg-type]
      settings=settings,
    )
    assert await connection.fetchval(
      "select count(*) from product_engagement_events where user_id=$1",
      user_id,
    ) == 5
    personalized = await get_personalized_recommendations(
      db,  # type: ignore[arg-type]
      settings.model_copy(update={"product_personalization_experiment_percent": 100}),
      user_id=user_id,
      nickname="통합테스트",
      limit=10,
    )
    assert personalized["status"] == "ready"
    assert personalized["title"] == "통합테스트님만을 위한"
    assert personalized["items"][0]["productId"] == str(product_id)
    assert personalized["items"][0]["reasonCodes"] == ["ENGAGEMENT_PREFERENCE"]

    await enforce_product_rate_limit(db, user_id=user_id, scope="detail", limit=1)  # type: ignore[arg-type]
    with pytest.raises(AppError) as rate_error:
      await enforce_product_rate_limit(db, user_id=user_id, scope="detail", limit=1)  # type: ignore[arg-type]
    assert rate_error.value.code == "PRODUCT_RATE_LIMITED"

    await connection.execute(
      """
      insert into product_preference_profiles (
        user_id,profile_version,preference_payload,source_event_count,expires_at
      ) values ($1,'integration','{"color_family:rose":4.0}'::jsonb,1,now()+interval '1 day')
      on conflict (user_id) do update set
        profile_version=excluded.profile_version,
        preference_payload=excluded.preference_payload,
        source_event_count=excluded.source_event_count,
        expires_at=excluded.expires_at
      """,
      user_id,
    )
    await set_product_consent(
      db,  # type: ignore[arg-type]
      user_id=user_id,
      purpose="color_cohort",
      accepted=True,
      version=CONSENT_VERSION_DEFAULT,
    )
    cohort_refresh = await refresh_color_cohort_memberships(db, settings)  # type: ignore[arg-type]
    assert cohort_refresh == {"eligible": 1, "memberships": 1, "mergedRare": 1}
    assert await connection.fetchval(
      "select cohort_key from product_color_cohort_memberships where user_id=$1",
      user_id,
    ) == "color-v1:other"
    await connection.execute(
      """
      insert into product_color_cohort_memberships (
        user_id,cohort_key,bucket_version,contribution_count,expires_at
      ) values ($1,'color-v1:other','broad_color_v1',1,now()+interval '1 day')
      """,
      creator_id,
    )
    await connection.execute(
      "insert into user_product_likes (user_id,product_id,source_shade_id) values ($1,$2,$3)",
      creator_id,
      product_id,
      shade_id,
    )
    default_cohort = await get_cohort_recommendations(
      db,  # type: ignore[arg-type]
      settings.model_copy(update={"product_cohort_experiment_percent": 100}),
      user_id=user_id,
      limit=10,
    )
    assert default_cohort["status"] == "insufficientData"
    assert default_cohort["minimumCohortSize"] == 100
    cohort = await get_cohort_recommendations(
      db,  # type: ignore[arg-type]
      settings.model_copy(
        update={
          "product_cohort_experiment_percent": 100,
          "product_cohort_min_size": 2,
          "product_cohort_min_item_support": 1,
        },
      ),
      user_id=user_id,
      limit=10,
    )
    assert cohort["status"] == "ready"
    assert cohort["cohortSizeBand"] == "2+"
    assert cohort["items"][0]["productId"] == str(product_id)
    assert cohort["items"][0]["reasonCodes"] == ["SIMILAR_COLOR_COHORT"]
    deleted = await delete_product_personalization(  # type: ignore[arg-type]
      db, user_id=user_id, target="all_product_personalization"
    )
    assert deleted == {"events": 5, "profiles": 1, "runs": 1, "cohort": 1}
    await revoke_all_product_consents(db, user_id=user_id)  # type: ignore[arg-type]
    consent_states = await get_product_consents(db, user_id=user_id)  # type: ignore[arg-type]
    assert all(not state["accepted"] for state in consent_states["purposes"].values())
  finally:
    await transaction.rollback()
    await connection.close()
