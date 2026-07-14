from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.settings import Settings, get_settings

from .knowledge_chunk_builder import build_knowledge_chunks, build_mvp_catalog
from .snapshot_manifest import (
  NON_PRODUCTION_ENVIRONMENTS,
  SnapshotDescriptor,
  SnapshotValidationError,
  reset_snapshot_cache,
  resolve_and_validate_snapshot,
  resolve_repo_root,
  process_snapshot,
)


def _resolve_data_root() -> Path:
  """Compatibility wrapper around the snapshot trust-root resolver."""

  return resolve_repo_root()


REPO_ROOT = _resolve_data_root()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
  rows: list[dict[str, Any]] = []
  if not path.exists():
    return rows

  for line in path.read_text(encoding="utf-8").splitlines():
    if not line.strip():
      continue
    rows.append(json.loads(line))
  return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(
    "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
    encoding="utf-8",
  )


def is_purchasable(item: dict[str, Any]) -> bool:
  live_offer = item.get("liveOffer") if isinstance(item.get("liveOffer"), dict) else {}
  return bool(
    int(live_offer.get("priceKrw") or 0) > 0
    and str(live_offer.get("purchaseUrl") or "").strip()
    and str(live_offer.get("imageUrl") or "").strip()
  )


class AuradinCatalog:
  def __init__(
    self,
    items: list[dict[str, Any]],
    chunks: list[dict[str, Any]] | None = None,
    *,
    snapshot: SnapshotDescriptor | None = None,
  ) -> None:
    self.items = [item for item in items if is_purchasable(item)]
    self.chunks = chunks or []
    self.by_id = {item["id"]: item for item in self.items}
    self.snapshot = snapshot

  def get(self, item_id: str) -> dict[str, Any] | None:
    return self.by_id.get(item_id)

  def by_ids(self, item_ids: list[str]) -> list[dict[str, Any]]:
    return [item for item_id in item_ids if (item := self.by_id.get(item_id))]


def load_mvp_catalog(
  catalog_path: Path | None = None,
  seed_path: Path | None = None,
  chunk_path: Path | None = None,
  *,
  settings: Settings | None = None,
  descriptor: SnapshotDescriptor | None = None,
) -> AuradinCatalog:
  settings = settings or get_settings()
  explicit_paths = catalog_path is not None or chunk_path is not None or seed_path is not None
  if explicit_paths:
    if catalog_path is None or chunk_path is None:
      raise SnapshotValidationError("explicit catalog loading requires catalog_path and chunk_path")
    items = read_jsonl(catalog_path)
    chunks = read_jsonl(chunk_path)
    if not items or not chunks:
      environment = str(settings.environment or "").strip().lower()
      allow_regeneration = (
        environment in NON_PRODUCTION_ENVIRONMENTS
        and bool(settings.auradin_snapshot_dev_regeneration)
        and seed_path is not None
      )
      if not allow_regeneration:
        raise SnapshotValidationError("catalog/chunk artifacts are missing or empty")
      if not items:
        items = build_mvp_catalog(read_jsonl(seed_path))
        write_jsonl(catalog_path, items)
      if not chunks:
        chunks = build_knowledge_chunks(items)
        write_jsonl(chunk_path, chunks)
    return AuradinCatalog(items, chunks)

  descriptor = descriptor or resolve_and_validate_snapshot(settings)
  catalog_path = descriptor.catalog_path
  chunk_path = descriptor.chunks_path
  items = read_jsonl(catalog_path)
  chunks = read_jsonl(chunk_path)
  if not items or not chunks:
    # Resolver has already validated hashes/counts. Reaching this branch means
    # the artifact changed after validation, so fail closed rather than rebuild.
    raise SnapshotValidationError("validated snapshot became empty during load")
  return AuradinCatalog(items, chunks, snapshot=descriptor)


@lru_cache(maxsize=1)
def get_catalog() -> AuradinCatalog:
  settings = get_settings()
  descriptor = process_snapshot() or resolve_and_validate_snapshot(settings)
  return load_mvp_catalog(settings=settings, descriptor=descriptor)


def reset_catalog_cache() -> None:
  get_catalog.cache_clear()
  reset_snapshot_cache()
