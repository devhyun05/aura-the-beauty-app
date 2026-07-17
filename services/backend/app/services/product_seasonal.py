from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from typing import Any
from uuid import UUID

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.services.product_catalog import offer_freshness_sql
from app.services.product_operators import (
  SEASONAL_EDITOR,
  SEASONAL_OPERATOR,
  SEASONAL_PUBLISHER,
  SEASONAL_REVIEWER,
  require_product_operator,
)


ALLOWED_TRANSITIONS = {
  "draft": {"in_review"},
  "in_review": {"published", "draft"},
  "published": {"suspended", "expired"},
  "suspended": {"in_review", "expired"},
  "expired": set(),
}


async def _require_active_seasonal_actor(connection: Any, actor_user_id: UUID) -> None:
  await require_product_operator(
    connection,
    user_id=actor_user_id,
    roles={SEASONAL_OPERATOR, SEASONAL_PUBLISHER},
    error_code="INVALID_SEASONAL_ACTOR",
    message="Seasonal operations require an active seasonal operator or publisher.",
  )


def validate_seasonal_transition(current: str, target: str) -> None:
  if target not in ALLOWED_TRANSITIONS.get(current, set()):
    raise AppError(409, "INVALID_SEASONAL_TRANSITION", f"Cannot move seasonal collection from {current} to {target}.")


def validate_seasonal_manifest(manifest: dict[str, Any], settings: Settings, signature: str) -> dict[str, Any]:
  secret = settings.product_seasonal_manifest_signing_secret
  if not secret:
    raise AppError(503, "SEASONAL_SIGNING_SECRET_MISSING", "Seasonal signing secret is not configured.")
  canonical = json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
  expected = hmac.new(secret.encode(), canonical, hashlib.sha256).hexdigest()
  if not hmac.compare_digest(expected, signature.removeprefix("sha256=").lower()):
    raise AppError(403, "INVALID_SEASONAL_SIGNATURE", "Seasonal manifest signature is invalid.")
  if manifest.get("schemaVersion") != "product_seasonal_manifest_v1":
    raise AppError(422, "INVALID_SEASONAL_MANIFEST", "product_seasonal_manifest_v1 is required.")
  try:
    created_by = UUID(str(manifest["createdBy"]))
    reviewed_by = UUID(str(manifest["reviewedBy"]))
    published_by = UUID(str(manifest["publishedBy"]))
    valid_from = datetime.fromisoformat(str(manifest["validFrom"]).replace("Z", "+00:00"))
    valid_until = datetime.fromisoformat(str(manifest["validUntil"]).replace("Z", "+00:00"))
  except (KeyError, ValueError) as error:
    raise AppError(422, "INVALID_SEASONAL_MANIFEST", "Actors and validity must be present and valid.") from error
  if created_by == published_by or reviewed_by == published_by:
    raise AppError(422, "SEASONAL_TWO_PERSON_REQUIRED", "Reviewer and publisher must be different people.")
  if valid_until <= valid_from or valid_until <= datetime.now(timezone.utc):
    raise AppError(422, "INVALID_SEASONAL_WINDOW", "Seasonal validity must end in the future after it starts.")
  source_labels = list(dict.fromkeys(str(item).strip() for item in manifest.get("sourceLabels") or [] if str(item).strip()))
  if len(source_labels) > 10 or any(len(label) > 100 for label in source_labels):
    raise AppError(422, "INVALID_SEASONAL_MANIFEST", "Seasonal sources are too large.")
  source_payload = manifest.get("sourcePayload")
  if not isinstance(source_payload, dict):
    raise AppError(422, "INVALID_SEASONAL_MANIFEST", "Structured source metadata is required.")
  try:
    source_updated_at = datetime.fromisoformat(str(source_payload["sourceUpdatedAt"]).replace("Z", "+00:00"))
  except (KeyError, ValueError) as error:
    raise AppError(422, "INVALID_SEASONAL_MANIFEST", "sourcePayload.sourceUpdatedAt is required.") from error
  if source_updated_at.tzinfo is None:
    source_updated_at = source_updated_at.replace(tzinfo=timezone.utc)
  content_review_reference = str(source_payload.get("contentReviewReference") or "").strip()
  now = datetime.now(timezone.utc)
  if (
    source_updated_at > now
    or source_updated_at < now - timedelta(days=settings.product_seasonal_source_max_age_days)
    or not content_review_reference
    or len(content_review_reference) > 200
  ):
    raise AppError(422, "INVALID_SEASONAL_MANIFEST", "Source freshness and content review evidence are invalid.")
  source_payload = {
    "sourceUpdatedAt": source_updated_at.isoformat(),
    "contentReviewReference": content_review_reference,
    "trendMetric": str(source_payload.get("trendMetric") or "editorial_signal")[:80],
    "providerStatus": str(source_payload.get("providerStatus") or "reviewed")[:40],
  }
  source_name = str(manifest.get("sourceName") or (source_labels[0] if source_labels else "editorial")).strip()[:80]
  trend_keywords = list(dict.fromkeys(
    str(item).strip()[:48] for item in manifest.get("trendKeywords") or [] if str(item).strip()
  ))[:24]
  reason_codes = list(dict.fromkeys(
    str(item).strip().upper().replace(" ", "_")[:40]
    for item in manifest.get("reasonCodes") or []
    if str(item).strip()
  ))[:24]
  try:
    confidence_score = float(manifest.get("confidenceScore", 0.5))
  except (TypeError, ValueError) as error:
    raise AppError(422, "INVALID_SEASONAL_MANIFEST", "confidenceScore must be numeric.") from error
  if not 0 <= confidence_score <= 1:
    raise AppError(422, "INVALID_SEASONAL_MANIFEST", "confidenceScore must be between 0 and 1.")
  items = manifest.get("items")
  if not source_labels or not manifest.get("trendWindow") or not isinstance(items, list) or not items:
    raise AppError(422, "INVALID_SEASONAL_MANIFEST", "Trend window, sources and products are required.")
  positions = [item.get("position") for item in items if isinstance(item, dict)]
  if len(items) != len(positions) or len(set(positions)) != len(positions) or any(not isinstance(position, int) or position < 0 for position in positions):
    raise AppError(422, "INVALID_SEASONAL_ITEMS", "Seasonal item positions must be unique non-negative integers.")
  product_ids = [str(item.get("productId") or "") for item in items]
  if len(set(product_ids)) != len(product_ids):
    raise AppError(422, "INVALID_SEASONAL_ITEMS", "A product can appear only once per collection.")
  for item in items:
    if str(item.get("sponsorshipType") or "organic") not in {"organic", "affiliate", "sponsored"}:
      raise AppError(422, "INVALID_SEASONAL_ITEMS", "Unsupported sponsorship type.")
    if str(item.get("reasonCode") or "EDITOR_REVIEWED") not in {
      "EDITOR_REVIEWED", "TREND_CLICK_RISE", "SEASONAL_FIT", "TREND_CATEGORY_MATCH",
      "TREND_KEYWORD_MATCH", "TREND_FINISH_MATCH", "TREND_COLOR_MATCH", "TREND_TAG_MATCH",
      "POPULAR_FALLBACK",
    }:
      raise AppError(422, "INVALID_SEASONAL_ITEMS", "Seasonal reason code is not approved.")
  try:
    previous_revision_id = UUID(str(manifest["previousRevisionId"])) if manifest.get("previousRevisionId") else None
    revision = int(manifest.get("revision") or 1)
  except ValueError as error:
    raise AppError(422, "INVALID_SEASONAL_MANIFEST", "Revision metadata is invalid.") from error
  if revision < 1:
    raise AppError(422, "INVALID_SEASONAL_MANIFEST", "Revision must be positive.")
  return {
    **manifest,
    "createdBy": created_by,
    "reviewedBy": reviewed_by,
    "publishedBy": published_by,
    "validFrom": valid_from,
    "validUntil": valid_until,
    "sourceLabels": source_labels,
    "sourceName": source_name,
    "sourceUpdatedAt": source_updated_at,
    "trendKeywords": trend_keywords,
    "reasonCodes": reason_codes,
    "confidenceScore": confidence_score,
    "sourcePayload": source_payload,
    "previousRevisionId": previous_revision_id,
    "revision": revision,
  }


async def publish_seasonal_manifest(db: Database, settings: Settings, *, manifest: dict[str, Any], signature: str) -> UUID:
  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Seasonal publishing requires a database.")
  normalized = validate_seasonal_manifest(manifest, settings, signature)
  collection_id = UUID(str(normalized["id"]))
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      for item in normalized["items"]:
        product_id = UUID(str(item["productId"]))
        eligible = await connection.fetchrow(
          f"""select p.id from products p where p.id=$1 and p.is_active=true and p.catalog_status='published'
            and license_status='valid' and allowed_uses @> array['mobile_display','recommendation']::text[]
            and (license_valid_from is null or license_valid_from<=now())
            and (license_valid_until is null or license_valid_until>now())
            and exists (
              select 1 from product_assets a where a.product_id=p.id and a.is_active=true
                and a.asset_type='packshot' and a.license_status='valid'
                and a.allowed_uses @> array['mobile_display','recommendation']::text[]
                and (($2::uuid is null and a.shade_id is null)
                  or ($2::uuid is not null and (a.shade_id is null or a.shade_id=$2)))
                and (a.valid_from is null or a.valid_from<=now())
                and (a.valid_until is null or a.valid_until>now())
            )
            and exists (
              select 1 from product_offers o where o.product_id=p.id and o.is_active=true
                and o.availability_status in ('in_stock','limited') and o.license_status='valid'
                and o.allowed_uses @> array['mobile_display']::text[]
                and (($2::uuid is null and o.shade_id is null)
                  or ($2::uuid is not null and (o.shade_id is null or o.shade_id=$2)))
                and (o.valid_until is null or o.valid_until>now())
                {offer_freshness_sql("o", "$3")}
            )
            and ($2::uuid is null or exists (
              select 1 from product_shades s where s.id=$2 and s.product_id=p.id and s.is_active=true
                and s.license_status='valid'
                and s.allowed_uses @> array['mobile_display','recommendation']::text[]
                and (s.license_valid_from is null or s.license_valid_from<=now())
                and (s.license_valid_until is null or s.license_valid_until>now())
            ))""",
          product_id,
          UUID(str(item["shadeId"])) if item.get("shadeId") else None,
          settings.product_offer_max_age_hours,
        )
        if not eligible:
          raise AppError(422, "SEASONAL_PRODUCT_NOT_ELIGIBLE", "Seasonal manifest contains an ineligible product.")
      if normalized["previousRevisionId"]:
        previous = await connection.fetchrow(
          "select id,revision from product_seasonal_collections where id=$1 and slug=$2",
          normalized["previousRevisionId"],
          normalized["slug"],
        )
        if not previous or int(previous["revision"]) + 1 != normalized["revision"]:
          raise AppError(422, "INVALID_SEASONAL_REVISION", "previousRevisionId must reference the same collection series.")
      elif normalized["revision"] != 1:
        raise AppError(422, "INVALID_SEASONAL_REVISION", "Revisions after 1 require previousRevisionId.")
      for actor_id, role, label in (
        (normalized["createdBy"], SEASONAL_EDITOR, "editor"),
        (normalized["reviewedBy"], SEASONAL_REVIEWER, "reviewer"),
        (normalized["publishedBy"], SEASONAL_PUBLISHER, "publisher"),
      ):
        await require_product_operator(
          connection,
          user_id=actor_id,
          roles={role},
          error_code="INVALID_SEASONAL_ACTOR",
          message=f"Seasonal {label} requires an active {role} grant.",
        )
      inserted = await connection.fetchrow(
        """insert into product_seasonal_collections (id,slug,title,summary,locale,trend_window,
          source_name,source_updated_at,source_labels,source_payload,trend_keywords,reason_codes,
          confidence_score,valid_from,valid_until,reviewed_at,published_at,status,revision,
          created_by,reviewed_by,published_by,previous_revision_id)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,
            now(),now(),'published',$16,$17,$18,$19,$20)
          on conflict (slug,revision) do nothing returning id""",
        collection_id,normalized["slug"],normalized["title"],normalized["summary"],
        normalized.get("locale","ko-KR"),normalized["trendWindow"],normalized["sourceName"],
        normalized["sourceUpdatedAt"],normalized["sourceLabels"],json.dumps(normalized["sourcePayload"]),
        normalized["trendKeywords"],normalized["reasonCodes"],normalized["confidenceScore"],
        normalized["validFrom"],normalized["validUntil"],normalized["revision"],
        normalized["createdBy"],normalized["reviewedBy"],normalized["publishedBy"],
        normalized["previousRevisionId"],
      )
      if not inserted:
        existing = await connection.fetchrow(
          "select id from product_seasonal_collections where slug=$1 and revision=$2",
          normalized["slug"],
          normalized["revision"],
        )
        if existing and existing["id"] == collection_id:
          return collection_id
        raise AppError(409, "SEASONAL_REVISION_CONFLICT", "This seasonal revision already exists.")
      if normalized["previousRevisionId"]:
        await connection.execute(
          """update product_seasonal_collections set status='suspended',
            suspension_reason='superseded_by_revision',updated_at=now() where id=$1""",
          normalized["previousRevisionId"],
        )
      for item in normalized["items"]:
        await connection.execute(
          """insert into product_seasonal_collection_items
            (collection_id,product_id,shade_id,position,reason_code,reason_codes,match_score,sponsorship_type)
            values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (collection_id,product_id) do nothing""",
          collection_id,UUID(str(item["productId"])),UUID(str(item["shadeId"])) if item.get("shadeId") else None,
          item["position"],item.get("reasonCode","EDITOR_REVIEWED"),
          item.get("reasonCodes") or [item.get("reasonCode","EDITOR_REVIEWED")],
          max(0.0, float(item.get("matchScore") or 0)),item.get("sponsorshipType","organic"),
        )
      await connection.execute(
        """insert into audit_logs (actor_user_id,action,entity_type,entity_id,metadata)
          values ($1,'seasonal.published','product_seasonal_collection',$2,$3::jsonb)""",
        normalized["publishedBy"],collection_id,json.dumps({"revision":normalized.get("revision",1),"sourceLabels":normalized["sourceLabels"]}),
      )
  return collection_id


async def rollback_seasonal_collection(
  db: Database,
  *,
  collection_id: UUID,
  actor_user_id: UUID,
  reason: str,
) -> UUID:
  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Seasonal rollback requires a database.")
  if not reason.strip():
    raise AppError(422, "ROLLBACK_REASON_REQUIRED", "A rollback reason is required.")
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      await _require_active_seasonal_actor(connection, actor_user_id)
      current = await connection.fetchrow(
        "select id,status,previous_revision_id from product_seasonal_collections where id=$1 for update",
        collection_id,
      )
      if not current or current["status"] != "published" or not current["previous_revision_id"]:
        raise AppError(409, "SEASONAL_ROLLBACK_UNAVAILABLE", "This collection cannot be rolled back.")
      previous = await connection.fetchrow(
        "select id,status,valid_from,valid_until from product_seasonal_collections where id=$1 for update",
        current["previous_revision_id"],
      )
      if not previous or previous["valid_from"] > datetime.now(timezone.utc) or previous["valid_until"] <= datetime.now(timezone.utc):
        raise AppError(409, "SEASONAL_ROLLBACK_UNAVAILABLE", "The previous revision is outside its validity window.")
      await connection.execute(
        "update product_seasonal_collections set status='suspended',suspension_reason=$2,updated_at=now() where id=$1",
        collection_id,
        reason.strip(),
      )
      await connection.execute(
        "update product_seasonal_collections set status='published',published_at=now(),updated_at=now() where id=$1",
        previous["id"],
      )
      await connection.execute(
        """insert into audit_logs (actor_user_id,action,entity_type,entity_id,metadata)
          values ($1,'seasonal.rolled_back','product_seasonal_collection',$2,$3::jsonb)""",
        actor_user_id,
        collection_id,
        json.dumps({"reason": reason.strip(), "restoredCollectionId": str(previous["id"])}),
      )
      return previous["id"]


async def suspend_seasonal_collection(db: Database, *, collection_id: UUID, actor_user_id: UUID, reason: str) -> None:
  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Seasonal suspension requires a database.")
  if not reason.strip():
    raise AppError(422, "SUSPENSION_REASON_REQUIRED", "A suspension reason is required.")
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      await _require_active_seasonal_actor(connection, actor_user_id)
      row = await connection.fetchrow(
        "select status from product_seasonal_collections where id=$1 for update",
        collection_id,
      )
      if not row:
        raise AppError(404, "SEASONAL_COLLECTION_NOT_FOUND", "Seasonal collection was not found.")
      validate_seasonal_transition(str(row["status"]), "suspended")
      await connection.execute(
        "update product_seasonal_collections set status='suspended',suspension_reason=$2,updated_at=now() where id=$1",
        collection_id,
        reason.strip(),
      )
      await connection.execute(
        """insert into audit_logs (actor_user_id,action,entity_type,entity_id,metadata)
          values ($1,'seasonal.suspended','product_seasonal_collection',$2,$3::jsonb)""",
        actor_user_id,
        collection_id,
        json.dumps({"reason": reason.strip()}),
      )


async def expire_seasonal_collections(db: Database, *, apply: bool = False) -> dict[str, Any]:
  """Find elapsed active revisions and optionally expire them atomically.

  Expiry is a deterministic system transition, so its audit rows intentionally
  use a null actor instead of impersonating an operator.
  """

  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Seasonal expiry requires a database.")
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      rows = await connection.fetch(
        """select id from product_seasonal_collections
          where status in ('published','suspended') and valid_until<=now()
          order by valid_until,id for update"""
      )
      collection_ids = [UUID(str(row["id"])) for row in rows]
      if apply and collection_ids:
        await connection.execute(
          """update product_seasonal_collections
            set status='expired',suspension_reason=coalesce(suspension_reason,'validity_window_elapsed'),
              updated_at=now()
            where id=any($1::uuid[])""",
          collection_ids,
        )
        await connection.execute(
          """insert into audit_logs (actor_user_id,action,entity_type,entity_id,metadata)
            select null,'seasonal.expired','product_seasonal_collection',value,
              jsonb_build_object('reason','validity_window_elapsed','automated',true)
            from unnest($1::uuid[]) value""",
          collection_ids,
        )
  return {
    "mode": "apply" if apply else "dry-run",
    "expired": len(collection_ids),
    "collectionIds": [str(value) for value in collection_ids],
  }
