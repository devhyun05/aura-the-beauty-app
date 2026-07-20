"""Auradin catalog DB mirror sync.

Uploads the validated active catalog snapshot (git-tracked JSONL) into the
deployed Postgres as a *read-only mirror* so teammates can query the catalog —
including color attributes — from the DB. Serving is unaffected: the recommender
still reads JSONL via ``catalog_loader``. Populated by
``python -m app.db.sync_auradin_catalog`` (deploy CI one-off) or the
``scripts/sync_auradin_snapshot_to_db.py`` wrapper.

The sync is idempotent: re-running with the same manifest sha256 is a no-op
(optionally re-activating the snapshot). A snapshot rebuilt under the same id
(different sha) is replaced in place. Exactly one snapshot is ``active`` at a
time; the active one is what serving currently ships.
"""

from __future__ import annotations

import json
from typing import Any, Protocol

from app.core.settings import Settings, get_settings
from app.services.auradin_agent.catalog_loader import is_purchasable, read_jsonl
from app.services.auradin_agent.snapshot_manifest import (
  SnapshotDescriptor,
  a8_quality_summary,
  process_snapshot,
  resolve_and_validate_snapshot,
)


class _Connection(Protocol):
  """Minimal asyncpg.Connection surface used here (keeps tests fakeable)."""

  async def execute(self, query: str, *args: Any) -> Any: ...
  async def executemany(self, query: str, args: Any) -> Any: ...
  async def fetch(self, query: str, *args: Any) -> list[Any]: ...
  async def fetchrow(self, query: str, *args: Any) -> Any: ...
  async def fetchval(self, query: str, *args: Any) -> Any: ...
  def transaction(self) -> Any: ...


def snapshot_id_for(descriptor: SnapshotDescriptor) -> str:
  """Stable id matching the manifest basename, e.g. ``snapshot_20260719``."""

  return descriptor.manifest_path.stem


def _as_int_or_none(value: Any) -> int | None:
  try:
    if value is None or value == "":
      return None
    return int(value)
  except (TypeError, ValueError):
    return None


def _as_float_or_none(value: Any) -> float | None:
  try:
    if value is None or value == "":
      return None
    return float(value)
  except (TypeError, ValueError):
    return None


def _clean_str(value: Any) -> str | None:
  text = str(value).strip() if value is not None else ""
  return text or None


def extract_item_columns(snapshot_id: str, row: dict[str, Any]) -> dict[str, Any]:
  """Map one JSONL catalog row to the ``auradin_catalog_items`` columns.

  Field locations verified against catalog_items_mvp_20260719.jsonl:
    - price lives in ``liveOffer.priceKrw`` (there is no top-level priceKrw)
    - ``attributes.colorFamily`` is nullable
    - ``attributeConfidence.colorFamily`` is present only when known (optional)
  """

  attributes = row.get("attributes") if isinstance(row.get("attributes"), dict) else {}
  confidence = (
    row.get("attributeConfidence") if isinstance(row.get("attributeConfidence"), dict) else {}
  )
  hard_filter = (
    row.get("hardFilterEligible") if isinstance(row.get("hardFilterEligible"), dict) else {}
  )
  live_offer = row.get("liveOffer") if isinstance(row.get("liveOffer"), dict) else {}

  return {
    "snapshot_id": snapshot_id,
    "item_id": _clean_str(row.get("id")) or "",
    "category": _clean_str(row.get("category")),
    "brand_name": _clean_str(row.get("brandName")),
    "product_name": _clean_str(row.get("productName")),
    "color_family": _clean_str(attributes.get("colorFamily")),
    "color_family_confidence": _as_float_or_none(confidence.get("colorFamily")),
    "finish": _clean_str(attributes.get("finish")),
    "texture": _clean_str(attributes.get("texture")),
    "undertone": _clean_str(attributes.get("undertone")),
    "price_krw": _as_int_or_none(live_offer.get("priceKrw")),
    "is_purchasable": is_purchasable(row),
    "hard_filter_eligible": json.dumps(hard_filter, ensure_ascii=False, sort_keys=True),
    "payload": json.dumps(row, ensure_ascii=False, sort_keys=True),
  }


def build_snapshot_summary(
  descriptor: SnapshotDescriptor, catalog_rows: list[dict[str, Any]]
) -> dict[str, Any]:
  """Derive the ledger row fields for a snapshot (pure, DB-free)."""

  color_family_count = sum(
    1
    for row in catalog_rows
    if isinstance(row.get("attributes"), dict)
    and _clean_str(row["attributes"].get("colorFamily"))
  )
  try:
    manifest_path = descriptor.manifest_path.relative_to(descriptor.data_root).as_posix()
  except ValueError:
    manifest_path = descriptor.manifest_path.name
  return {
    "snapshot_id": snapshot_id_for(descriptor),
    "manifest_sha256": descriptor.manifest_sha256,
    "catalog_sha256": descriptor.catalog_sha256,
    "manifest_path": manifest_path,
    "item_count": len(catalog_rows),
    "color_family_count": color_family_count,
    "quality_summary": a8_quality_summary(catalog_rows),
  }


def _load_descriptor(
  settings: Settings, descriptor: SnapshotDescriptor | None
) -> SnapshotDescriptor:
  if descriptor is not None:
    return descriptor
  return process_snapshot() or resolve_and_validate_snapshot(settings)


_ITEM_INSERT_SQL = """
  insert into auradin_catalog_items (
    snapshot_id, item_id, category, brand_name, product_name,
    color_family, color_family_confidence, finish, texture, undertone,
    price_krw, is_purchasable, hard_filter_eligible, payload
  ) values (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb
  )
  on conflict (snapshot_id, item_id) do update set
    category = excluded.category,
    brand_name = excluded.brand_name,
    product_name = excluded.product_name,
    color_family = excluded.color_family,
    color_family_confidence = excluded.color_family_confidence,
    finish = excluded.finish,
    texture = excluded.texture,
    undertone = excluded.undertone,
    price_krw = excluded.price_krw,
    is_purchasable = excluded.is_purchasable,
    hard_filter_eligible = excluded.hard_filter_eligible,
    payload = excluded.payload
"""


async def sync_active_snapshot(
  connection: _Connection,
  *,
  settings: Settings | None = None,
  descriptor: SnapshotDescriptor | None = None,
  mark_active: bool = True,
) -> dict[str, Any]:
  """Upsert the active snapshot into the DB mirror. Idempotent by manifest sha.

  Returns a summary dict: ``{snapshotId, manifestSha256, itemCount,
  colorFamilyCount, action}`` where action is one of
  ``inserted | updated | reactivated | noop``.
  """

  settings = settings or get_settings()
  descriptor = _load_descriptor(settings, descriptor)
  catalog_rows = read_jsonl(descriptor.catalog_path)
  if not catalog_rows:
    raise ValueError("active snapshot catalog is empty; refusing to sync")

  summary = build_snapshot_summary(descriptor, catalog_rows)
  snapshot_id = summary["snapshot_id"]
  item_rows = [extract_item_columns(snapshot_id, row) for row in catalog_rows]

  async with connection.transaction():
    existing = await connection.fetchrow(
      "select manifest_sha256, status from auradin_catalog_snapshots where snapshot_id = $1",
      snapshot_id,
    )
    same_sha = existing is not None and existing["manifest_sha256"] == summary["manifest_sha256"]

    if same_sha:
      action = "noop"
      if mark_active and existing["status"] != "active":
        action = "reactivated"
    else:
      action = "updated" if existing is not None else "inserted"
      # Replace items and (re)write ledger fields for this snapshot.
      await connection.execute(
        "delete from auradin_catalog_items where snapshot_id = $1", snapshot_id
      )
      await connection.execute(
        """
        insert into auradin_catalog_snapshots (
          snapshot_id, manifest_sha256, catalog_sha256, manifest_path,
          item_count, color_family_count, quality_summary, status
        ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, 'importing')
        on conflict (snapshot_id) do update set
          manifest_sha256 = excluded.manifest_sha256,
          catalog_sha256 = excluded.catalog_sha256,
          manifest_path = excluded.manifest_path,
          item_count = excluded.item_count,
          color_family_count = excluded.color_family_count,
          quality_summary = excluded.quality_summary,
          status = 'importing'
        """,
        snapshot_id,
        summary["manifest_sha256"],
        summary["catalog_sha256"],
        summary["manifest_path"],
        summary["item_count"],
        summary["color_family_count"],
        json.dumps(summary["quality_summary"], ensure_ascii=False, sort_keys=True),
      )
      await connection.executemany(
        _ITEM_INSERT_SQL,
        [
          (
            r["snapshot_id"], r["item_id"], r["category"], r["brand_name"], r["product_name"],
            r["color_family"], r["color_family_confidence"], r["finish"], r["texture"],
            r["undertone"], r["price_krw"], r["is_purchasable"], r["hard_filter_eligible"],
            r["payload"],
          )
          for r in item_rows
        ],
      )

    # Fail closed: the DB must hold exactly the rows the JSONL declared.
    db_count = await connection.fetchval(
      "select count(*) from auradin_catalog_items where snapshot_id = $1", snapshot_id
    )
    if int(db_count) != summary["item_count"]:
      await connection.execute(
        "update auradin_catalog_snapshots set status = 'failed' where snapshot_id = $1",
        snapshot_id,
      )
      raise RuntimeError(
        f"row-count mismatch for {snapshot_id}: db={db_count} jsonl={summary['item_count']}"
      )

    if mark_active:
      await connection.execute(
        "update auradin_catalog_snapshots set status = 'superseded' "
        "where status = 'active' and snapshot_id <> $1",
        snapshot_id,
      )
      await connection.execute(
        "update auradin_catalog_snapshots set status = 'active', activated_at = now() "
        "where snapshot_id = $1",
        snapshot_id,
      )
    elif action in {"inserted", "updated"}:
      await connection.execute(
        "update auradin_catalog_snapshots set status = 'imported' where snapshot_id = $1",
        snapshot_id,
      )

  return {
    "snapshotId": snapshot_id,
    "manifestSha256": summary["manifest_sha256"],
    "itemCount": summary["item_count"],
    "colorFamilyCount": summary["color_family_count"],
    "action": action,
  }


async def verify_active_snapshot(
  connection: _Connection,
  *,
  settings: Settings | None = None,
  descriptor: SnapshotDescriptor | None = None,
) -> dict[str, Any]:
  """Compare the DB active snapshot against the local JSONL. Read-only.

  Returns ``{ok, reasons, ...}``. ``ok`` is False on any mismatch: missing
  snapshot, wrong sha, row-count drift, or the convenience view being absent.
  """

  settings = settings or get_settings()
  descriptor = _load_descriptor(settings, descriptor)
  catalog_rows = read_jsonl(descriptor.catalog_path)
  summary = build_snapshot_summary(descriptor, catalog_rows)
  snapshot_id = summary["snapshot_id"]
  reasons: list[str] = []

  ledger = await connection.fetchrow(
    "select manifest_sha256, item_count, status from auradin_catalog_snapshots "
    "where snapshot_id = $1",
    snapshot_id,
  )
  if ledger is None:
    reasons.append(f"snapshot {snapshot_id} not present in DB")
  else:
    if ledger["manifest_sha256"] != summary["manifest_sha256"]:
      reasons.append("manifest sha256 differs between DB and JSONL")
    if ledger["status"] != "active":
      reasons.append(f"snapshot status is {ledger['status']!r}, expected 'active'")
    db_count = await connection.fetchval(
      "select count(*) from auradin_catalog_items where snapshot_id = $1", snapshot_id
    )
    if int(db_count) != summary["item_count"]:
      reasons.append(f"row count db={db_count} jsonl={summary['item_count']}")

  view_ok = await connection.fetchval(
    "select exists (select 1 from information_schema.views where table_name = 'auradin_active_catalog')"
  )
  if not view_ok:
    reasons.append("auradin_active_catalog view is missing")

  return {
    "ok": not reasons,
    "snapshotId": snapshot_id,
    "expectedItemCount": summary["item_count"],
    "expectedColorFamilyCount": summary["color_family_count"],
    "reasons": reasons,
  }


async def rollback_to(connection: _Connection, snapshot_id: str) -> dict[str, Any]:
  """Re-activate a previously synced snapshot (demote the current active one)."""

  async with connection.transaction():
    target = await connection.fetchrow(
      "select status from auradin_catalog_snapshots where snapshot_id = $1", snapshot_id
    )
    if target is None:
      raise ValueError(f"snapshot {snapshot_id} is not present in DB; cannot roll back to it")
    await connection.execute(
      "update auradin_catalog_snapshots set status = 'superseded' "
      "where status = 'active' and snapshot_id <> $1",
      snapshot_id,
    )
    await connection.execute(
      "update auradin_catalog_snapshots set status = 'active', activated_at = now() "
      "where snapshot_id = $1",
      snapshot_id,
    )
  return {"snapshotId": snapshot_id, "action": "rolled_back"}
