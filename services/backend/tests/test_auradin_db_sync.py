"""Auradin catalog DB mirror sync — unit tests.

Field-mapping and summary tests are pure. Sync/idempotency/rollback tests use an
in-memory fake connection that emulates just enough of the two mirror tables
(including transaction rollback) to exercise the real ``db_sync`` SQL flow.
"""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import pytest

from app.services.auradin_agent.snapshot_manifest import SnapshotDescriptor
from app.services.auradin_catalog import db_sync


# ── fixtures: descriptor + rows ───────────────────────────────────────────────

def _descriptor(sha: str = "sha-a") -> SnapshotDescriptor:
  root = Path("/repo/data/auradin")
  return SnapshotDescriptor(
    source="test",
    data_root=root,
    manifest_path=root / "manifests" / "snapshot_20260719.json",
    manifest_sha256=sha,
    run_date="20260719",
    catalog_path=root / "catalog" / "catalog_items_mvp_20260719.jsonl",
    catalog_sha256="catalog-sha",
    chunks_path=root / "knowledge" / "chunks.jsonl",
    chunks_sha256="chunks-sha",
    vector_path=root / "vector" / "index.json",
    vector_sha256="vector-sha",
    seed_path=root / "catalog" / "seed.jsonl",
    seed_sha256="seed-sha",
    backend="hash",
    model_id="hash-fallback",
    dimension=1024,
    catalog_count=2,
    chunk_count=4,
    vector_count=4,
  )


def _lip_row(item_id: str, color_family: str | None, *, price: int = 21000) -> dict[str, Any]:
  return {
    "id": item_id,
    "category": "lip",
    "brandName": "롬앤",
    "productName": f"쥬시 래스팅 틴트 {item_id}",
    "attributes": {"colorFamily": color_family, "finish": "glossy", "texture": "tint", "undertone": None},
    "attributeConfidence": ({"colorFamily": 0.72} if color_family else {}),
    "hardFilterEligible": {"category": True, "colorFamily": bool(color_family)},
    "liveOffer": {
      "priceKrw": price,
      "priceTier": "under_25k",
      "purchaseUrl": "https://smartstore.naver.com/x",
      "imageUrl": "https://img/x.jpg",
    },
  }


def _rows() -> list[dict[str, Any]]:
  return [_lip_row("auradin-seed-1", "pink"), _lip_row("auradin-seed-2", None)]


# ── pure mapping tests ────────────────────────────────────────────────────────

def test_extract_columns_reads_price_from_live_offer() -> None:
  cols = db_sync.extract_item_columns("snapshot_20260719", _lip_row("auradin-seed-1", "pink", price=18500))
  assert cols["price_krw"] == 18500
  assert cols["category"] == "lip"
  assert cols["color_family"] == "pink"
  assert cols["color_family_confidence"] == pytest.approx(0.72)
  assert cols["is_purchasable"] is True


def test_extract_columns_missing_confidence_is_none() -> None:
  cols = db_sync.extract_item_columns("snapshot_20260719", _lip_row("auradin-seed-2", None))
  assert cols["color_family"] is None
  # attributeConfidence has no colorFamily key -> must map to NULL, not 0.0
  assert cols["color_family_confidence"] is None


def test_extract_columns_not_purchasable_when_no_price() -> None:
  row = _lip_row("auradin-seed-3", "red")
  row["liveOffer"]["priceKrw"] = 0
  cols = db_sync.extract_item_columns("snapshot_20260719", row)
  assert cols["price_krw"] == 0  # stored faithfully; the mirror does not filter
  assert cols["is_purchasable"] is False


def test_build_summary_counts_color_family() -> None:
  summary = db_sync.build_snapshot_summary(_descriptor(), _rows())
  assert summary["snapshot_id"] == "snapshot_20260719"
  assert summary["item_count"] == 2
  assert summary["color_family_count"] == 1
  assert summary["manifest_path"] == "manifests/snapshot_20260719.json"


# ── in-memory fake connection ─────────────────────────────────────────────────

class _Txn:
  def __init__(self, db: "FakeCatalogDb") -> None:
    self._db = db

  async def __aenter__(self) -> "_Txn":
    self._db._checkpoint = (
      copy.deepcopy(self._db.snapshots),
      copy.deepcopy(self._db.items),
    )
    return self

  async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> bool:
    if exc_type is not None and self._db._checkpoint is not None:
      self._db.snapshots, self._db.items = self._db._checkpoint
    self._db._checkpoint = None
    return False


class FakeCatalogDb:
  """Emulates auradin_catalog_{snapshots,items} for the db_sync SQL flow."""

  def __init__(self, *, view_exists: bool = True, drop_one_on_insert: bool = False) -> None:
    self.snapshots: dict[str, dict[str, Any]] = {}
    self.items: dict[tuple[str, str], dict[str, Any]] = {}
    self.view_exists = view_exists
    self.drop_one_on_insert = drop_one_on_insert
    self._checkpoint: tuple[Any, Any] | None = None

  def transaction(self) -> _Txn:
    return _Txn(self)

  async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
    if "from auradin_catalog_snapshots where snapshot_id" in query:
      return self.snapshots.get(args[0])
    return None

  async def fetchval(self, query: str, *args: Any) -> Any:
    if "count(*) from auradin_catalog_items" in query:
      sid = args[0]
      return sum(1 for (s, _), _ in self.items.items() if s == sid)
    if "information_schema.views" in query:
      return self.view_exists
    return None

  async def execute(self, query: str, *args: Any) -> str:
    if query.startswith("\n        insert into auradin_catalog_snapshots") or "insert into auradin_catalog_snapshots" in query:
      sid = args[0]
      self.snapshots[sid] = {
        "snapshot_id": sid,
        "manifest_sha256": args[1],
        "catalog_sha256": args[2],
        "manifest_path": args[3],
        "item_count": args[4],
        "color_family_count": args[5],
        "status": "importing",
      }
      return "INSERT 0 1"
    if "delete from auradin_catalog_items" in query:
      sid = args[0]
      self.items = {k: v for k, v in self.items.items() if k[0] != sid}
      return "DELETE"
    if "set status = 'superseded'" in query:
      keep = args[0]
      for sid, snap in self.snapshots.items():
        if snap["status"] == "active" and sid != keep:
          snap["status"] = "superseded"
      return "UPDATE"
    if "set status = 'active'" in query:
      self.snapshots[args[0]]["status"] = "active"
      return "UPDATE"
    if "set status = 'imported'" in query:
      self.snapshots[args[0]]["status"] = "imported"
      return "UPDATE"
    if "set status = 'failed'" in query:
      self.snapshots[args[0]]["status"] = "failed"
      return "UPDATE"
    return "OK"

  async def executemany(self, query: str, args: Any) -> None:
    rows = list(args)
    if self.drop_one_on_insert and rows:
      rows = rows[:-1]  # simulate a lost row -> count mismatch
    for tup in rows:
      sid, item_id = tup[0], tup[1]
      self.items[(sid, item_id)] = {"snapshot_id": sid, "item_id": item_id}


# ── sync behaviour tests ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_first_sync_inserts_and_activates() -> None:
  db = FakeCatalogDb()
  result = await db_sync.sync_active_snapshot(db, descriptor=_descriptor("sha-a"), settings=_settings())
  assert result["action"] == "inserted"
  assert result["itemCount"] == 2
  assert result["colorFamilyCount"] == 1
  assert db.snapshots["snapshot_20260719"]["status"] == "active"
  assert len(db.items) == 2


@pytest.mark.asyncio
async def test_resync_same_sha_is_noop() -> None:
  db = FakeCatalogDb()
  await db_sync.sync_active_snapshot(db, descriptor=_descriptor("sha-a"), settings=_settings())
  result = await db_sync.sync_active_snapshot(db, descriptor=_descriptor("sha-a"), settings=_settings())
  assert result["action"] == "noop"
  assert len(db.items) == 2  # not duplicated


@pytest.mark.asyncio
async def test_changed_sha_replaces_in_place() -> None:
  db = FakeCatalogDb()
  await db_sync.sync_active_snapshot(db, descriptor=_descriptor("sha-a"), settings=_settings())
  result = await db_sync.sync_active_snapshot(db, descriptor=_descriptor("sha-b"), settings=_settings())
  assert result["action"] == "updated"
  assert db.snapshots["snapshot_20260719"]["manifest_sha256"] == "sha-b"
  assert len(db.items) == 2


@pytest.mark.asyncio
async def test_only_one_active_after_new_snapshot() -> None:
  db = FakeCatalogDb()
  # Pre-seed an older active snapshot.
  db.snapshots["snapshot_20260717"] = {
    "snapshot_id": "snapshot_20260717",
    "manifest_sha256": "old",
    "status": "active",
  }
  await db_sync.sync_active_snapshot(db, descriptor=_descriptor("sha-a"), settings=_settings())
  actives = [s for s in db.snapshots.values() if s["status"] == "active"]
  assert len(actives) == 1
  assert actives[0]["snapshot_id"] == "snapshot_20260719"
  assert db.snapshots["snapshot_20260717"]["status"] == "superseded"


@pytest.mark.asyncio
async def test_count_mismatch_rolls_back() -> None:
  db = FakeCatalogDb(drop_one_on_insert=True)
  with pytest.raises(RuntimeError, match="row-count mismatch"):
    await db_sync.sync_active_snapshot(db, descriptor=_descriptor("sha-a"), settings=_settings())
  # Transaction rolled back: nothing persisted.
  assert "snapshot_20260719" not in db.snapshots
  assert db.items == {}


@pytest.mark.asyncio
async def test_verify_ok_when_synced() -> None:
  db = FakeCatalogDb()
  await db_sync.sync_active_snapshot(db, descriptor=_descriptor("sha-a"), settings=_settings())
  report = await db_sync.verify_active_snapshot(db, descriptor=_descriptor("sha-a"), settings=_settings())
  assert report["ok"] is True
  assert report["reasons"] == []


@pytest.mark.asyncio
async def test_verify_flags_missing_view() -> None:
  db = FakeCatalogDb(view_exists=False)
  await db_sync.sync_active_snapshot(db, descriptor=_descriptor("sha-a"), settings=_settings())
  report = await db_sync.verify_active_snapshot(db, descriptor=_descriptor("sha-a"), settings=_settings())
  assert report["ok"] is False
  assert any("view is missing" in r for r in report["reasons"])


@pytest.mark.asyncio
async def test_verify_flags_sha_drift() -> None:
  db = FakeCatalogDb()
  await db_sync.sync_active_snapshot(db, descriptor=_descriptor("sha-a"), settings=_settings())
  report = await db_sync.verify_active_snapshot(db, descriptor=_descriptor("sha-b"), settings=_settings())
  assert report["ok"] is False
  assert any("sha256 differs" in r for r in report["reasons"])


@pytest.mark.asyncio
async def test_rollback_reactivates_target() -> None:
  db = FakeCatalogDb()
  db.snapshots["snapshot_20260717"] = {
    "snapshot_id": "snapshot_20260717", "manifest_sha256": "old", "status": "superseded",
  }
  await db_sync.sync_active_snapshot(db, descriptor=_descriptor("sha-a"), settings=_settings())
  await db_sync.rollback_to(db, "snapshot_20260717")
  assert db.snapshots["snapshot_20260717"]["status"] == "active"
  assert db.snapshots["snapshot_20260719"]["status"] == "superseded"


# ── helpers ───────────────────────────────────────────────────────────────────

def _settings() -> Any:
  """db_sync only touches read_jsonl via descriptor; monkeypatch that instead."""

  return None


@pytest.fixture(autouse=True)
def _patch_read_jsonl(monkeypatch: pytest.MonkeyPatch) -> None:
  # sync_active_snapshot reads the catalog rows from the descriptor's path; feed
  # the in-memory rows regardless of path so tests need no fixture files.
  monkeypatch.setattr(db_sync, "read_jsonl", lambda _path: _rows())
