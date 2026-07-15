"""Catalog integrity audit, quarantine and import rollback operations."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.services.product_catalog import validate_external_https_url
from app.services.product_operators import CATALOG_ADMIN, require_product_operator


def _json(value: Any) -> dict[str, Any]:
  if isinstance(value, dict):
    return value
  if isinstance(value, str):
    try:
      parsed = json.loads(value)
      return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
      return {}
  return {}


def _rights_valid(row: dict[str, Any], *, now: datetime) -> bool:
  valid_from = row.get("license_valid_from")
  valid_until = row.get("license_valid_until")
  return bool(
    row.get("source_provider")
    and row.get("source_license_type")
    and row.get("source_reference")
    and row.get("license_status") == "valid"
    and {"mobile_display", "recommendation"}.issubset(set(row.get("allowed_uses") or []))
    and (valid_from is None or valid_from <= now)
    and valid_until is not None
    and valid_until > now
  )


async def _require_active_catalog_actor(connection: Any, actor_user_id: UUID) -> None:
  await require_product_operator(
    connection,
    user_id=actor_user_id,
    roles={CATALOG_ADMIN},
    error_code="INVALID_CATALOG_ACTOR",
    message="Catalog operations require an active catalog administrator.",
  )


async def audit_product_shade_relationships(db: Database) -> dict[str, int]:
  rows = await db.fetch(
    """
    select 'assets' as relation, count(*)::int as count
    from product_assets value join product_shades shade on shade.id=value.shade_id
    where value.shade_id is not null and value.product_id<>shade.product_id
    union all
    select 'offers', count(*)::int
    from product_offers value join product_shades shade on shade.id=value.shade_id
    where value.shade_id is not null and value.product_id<>shade.product_id
    union all
    select 'seasonalItems', count(*)::int
    from product_seasonal_collection_items value join product_shades shade on shade.id=value.shade_id
    where value.shade_id is not null and value.product_id<>shade.product_id
    union all
    select 'likes', count(*)::int
    from user_product_likes value join product_shades shade on shade.id=value.source_shade_id
    where value.source_shade_id is not null and value.product_id<>shade.product_id
    union all
    select 'events', count(*)::int
    from product_engagement_events value join product_shades shade on shade.id=value.shade_id
    where value.shade_id is not null and value.product_id<>shade.product_id
    """
  )
  return {str(row["relation"]): int(row.get("count") or 0) for row in rows}


async def audit_product_catalog(
  db: Database,
  settings: Settings,
  *,
  apply_quarantine: bool = False,
  actor_user_id: UUID | None = None,
) -> dict[str, Any]:
  """Find public rows that fail provenance, rights, asset or seller boundaries."""

  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Catalog audit requires a database.")
  if apply_quarantine:
    if actor_user_id is None:
      raise AppError(403, "INVALID_CATALOG_ACTOR", "Catalog quarantine requires an active internal actor.")
    await require_product_operator(
      db,
      user_id=actor_user_id,
      roles={CATALOG_ADMIN},
      error_code="INVALID_CATALOG_ACTOR",
      message="Catalog quarantine requires an active catalog administrator.",
    )
  relationship_mismatches = await audit_product_shade_relationships(db)
  products = await db.fetch(
    """select id,source_provider,source_license_type,source_reference,license_status,
      license_valid_from,license_valid_until,allowed_uses
      from products where is_active=true and catalog_status='published'"""
  )
  product_ids = [row["id"] for row in products]
  if not product_ids:
    return {
      "scanned": 0,
      "invalid": 0,
      "quarantined": 0,
      "productIds": [],
      "relationshipMismatches": relationship_mismatches,
    }
  assets = await db.fetch(
    """select product_id,asset_url,license_status,allowed_uses,valid_from,valid_until,
      source_provider,source_reference,license_type,reviewed_at
      from product_assets where product_id=any($1::uuid[]) and is_active=true""",
    product_ids,
  )
  offers = await db.fetch(
    """select product_id,purchase_url,seller_domain,license_status,allowed_uses,valid_until,
      source_provider,source_reference,availability_status,availability_checked_at,price_updated_at,
      affiliate_type,disclosure_label
      from product_offers where product_id=any($1::uuid[]) and is_active=true""",
    product_ids,
  )
  now = datetime.now(timezone.utc)
  valid_assets: set[UUID] = set()
  for raw in assets:
    row = dict(raw)
    try:
      validate_external_https_url(str(row.get("asset_url") or ""), settings.product_allowed_image_domains, kind="Image")
    except AppError:
      continue
    if (
      row.get("source_provider")
      and row.get("source_reference")
      and row.get("license_type")
      and row.get("reviewed_at")
      and row.get("license_status") == "valid"
      and {"mobile_display", "recommendation"}.issubset(set(row.get("allowed_uses") or []))
      and (row.get("valid_from") is None or row["valid_from"] <= now)
      and row.get("valid_until") is not None
      and row["valid_until"] > now
    ):
      valid_assets.add(row["product_id"])
  valid_offers: set[UUID] = set()
  for raw in offers:
    row = dict(raw)
    try:
      url = validate_external_https_url(str(row.get("purchase_url") or ""), settings.product_allowed_seller_domains, kind="Seller")
    except AppError:
      continue
    hostname = (urlparse(url).hostname or "").lower().rstrip(".")
    if (
      hostname == str(row.get("seller_domain") or "").lower().rstrip(".")
      and row.get("source_provider")
      and row.get("source_reference")
      and row.get("license_status") == "valid"
      and "mobile_display" in set(row.get("allowed_uses") or [])
      and row.get("valid_until") is not None
      and row["valid_until"] > now
      and row.get("availability_status") in {"in_stock", "limited"}
      and row.get("availability_checked_at")
      and row.get("price_updated_at")
      and row["availability_checked_at"] <= now
      and row["price_updated_at"] <= now
      and row["availability_checked_at"].timestamp() >= now.timestamp() - settings.product_offer_max_age_hours * 3600
      and row["price_updated_at"].timestamp() >= now.timestamp() - settings.product_offer_max_age_hours * 3600
      and (row.get("affiliate_type") == "none" or row.get("disclosure_label"))
    ):
      valid_offers.add(row["product_id"])
  invalid_ids = [
    row["id"]
    for row in products
    if not _rights_valid(dict(row), now=now) or row["id"] not in valid_assets or row["id"] not in valid_offers
  ]
  quarantined = 0
  if apply_quarantine and invalid_ids:
    async with db.pool.acquire() as connection:
      async with connection.transaction():
        await _require_active_catalog_actor(connection, actor_user_id)  # type: ignore[arg-type]
        status = await connection.execute(
          "update products set catalog_status='blocked',is_active=false,updated_at=now() where id=any($1::uuid[])",
          invalid_ids,
        )
        quarantined = int(status.rsplit(" ", 1)[-1]) if status.rsplit(" ", 1)[-1].isdigit() else 0
        await connection.execute("update product_shades set is_active=false,updated_at=now() where product_id=any($1::uuid[])", invalid_ids)
        await connection.execute("update product_assets set is_active=false,updated_at=now() where product_id=any($1::uuid[])", invalid_ids)
        await connection.execute("update product_offers set is_active=false,updated_at=now() where product_id=any($1::uuid[])", invalid_ids)
        await connection.execute(
          """insert into audit_logs (actor_user_id,action,entity_type,metadata)
            values ($1,'product_catalog.integrity_quarantine','product_catalog',$2::jsonb)""",
          actor_user_id,
          json.dumps({"productIds": [str(value) for value in invalid_ids], "count": len(invalid_ids)}),
        )
  return {
    "scanned": len(products),
    "invalid": len(invalid_ids),
    "quarantined": quarantined,
    "productIds": [str(value) for value in invalid_ids],
    "relationshipMismatches": relationship_mismatches,
  }


async def rollback_catalog_import(
  db: Database,
  *,
  manifest_id: UUID,
  actor_user_id: UUID,
  reason: str,
) -> dict[str, int]:
  """Safely disable one imported version; a corrected signed manifest restores it."""

  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Catalog rollback requires a database.")
  if not reason.strip():
    raise AppError(422, "ROLLBACK_REASON_REQUIRED", "A rollback reason is required.")
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      await _require_active_catalog_actor(connection, actor_user_id)
      imported = await connection.fetchrow(
        "select source_provider,catalog_version,status,summary from product_catalog_imports where manifest_id=$1 for update",
        manifest_id,
      )
      if not imported or imported["status"] != "applied":
        raise AppError(409, "CATALOG_ROLLBACK_UNAVAILABLE", "This catalog import cannot be rolled back.")
      raw_ids = _json(imported.get("summary")).get("productIds") or []
      try:
        product_ids = [UUID(str(value)) for value in raw_ids]
      except ValueError as error:
        raise AppError(409, "CATALOG_ROLLBACK_UNAVAILABLE", "This import does not have a safe rollback inventory.") from error
      if not product_ids:
        raise AppError(409, "CATALOG_ROLLBACK_UNAVAILABLE", "This import does not have a safe rollback inventory.")
      status = await connection.execute(
        """update products set catalog_status='blocked',is_active=false,updated_at=now()
          where id=any($1::uuid[]) and source_provider=$2 and catalog_version=$3""",
        product_ids,
        imported["source_provider"],
        imported["catalog_version"],
      )
      products = int(status.rsplit(" ", 1)[-1]) if status.rsplit(" ", 1)[-1].isdigit() else 0
      await connection.execute("update product_shades set is_active=false,updated_at=now() where product_id=any($1::uuid[])", product_ids)
      await connection.execute("update product_assets set is_active=false,updated_at=now() where product_id=any($1::uuid[])", product_ids)
      await connection.execute("update product_offers set is_active=false,updated_at=now() where product_id=any($1::uuid[])", product_ids)
      await connection.execute(
        """update product_catalog_imports set status='rolled_back',
          summary=summary || $2::jsonb where manifest_id=$1""",
        manifest_id,
        json.dumps({"rollbackReason": reason.strip(), "rolledBackBy": str(actor_user_id)}),
      )
      await connection.execute(
        """insert into audit_logs (actor_user_id,action,entity_type,entity_id,metadata)
          values ($1,'product_catalog.rolled_back','product_catalog_import',$2,$3::jsonb)""",
        actor_user_id,
        manifest_id,
        json.dumps({"reason": reason.strip(), "productCount": products}),
      )
  return {"products": products}
