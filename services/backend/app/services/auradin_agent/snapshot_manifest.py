from __future__ import annotations

import hashlib
import json
import math
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.services.auradin_catalog.brand_aliases import find_brand_alias_spans
from app.services.auradin_catalog.metadata_extractor import infer_brand_clean_undertone_evidence


SNAPSHOT_SCHEMA_VERSION = 1
ACTIVE_POINTER_NAME = "active_snapshot.json"
NON_PRODUCTION_ENVIRONMENTS = {"local", "dev", "development", "test"}
REQUIRED_MANIFEST_FIELDS = {
  "schemaVersion",
  "runDate",
  "catalogPath",
  "catalogSha256",
  "chunksPath",
  "chunksSha256",
  "vectorPath",
  "vectorSha256",
  "seedPath",
  "seedSha256",
  "backend",
  "modelId",
  "dimension",
  "catalogCount",
  "chunkCount",
  "vectorCount",
}
A8_POSITIVE_CONTROLS = ("여쿨라", "그레이쉬쿨", "앙쿨모브")
_PROCESS_SNAPSHOT: SnapshotDescriptor | None = None


class SnapshotValidationError(RuntimeError):
  pass


@dataclass(frozen=True)
class SnapshotDescriptor:
  source: str
  data_root: Path
  manifest_path: Path
  manifest_sha256: str
  run_date: str
  catalog_path: Path
  catalog_sha256: str
  chunks_path: Path
  chunks_sha256: str
  vector_path: Path
  vector_sha256: str
  seed_path: Path
  seed_sha256: str
  backend: str
  model_id: str
  dimension: int
  catalog_count: int
  chunk_count: int
  vector_count: int

  def public_status(self) -> dict[str, Any]:
    return {
      "snapshotSource": self.source,
      "snapshotRunDate": self.run_date,
      "snapshotManifestSha256": self.manifest_sha256,
    }


def bind_process_snapshot(descriptor: SnapshotDescriptor | None) -> None:
  global _PROCESS_SNAPSHOT
  _PROCESS_SNAPSHOT = descriptor


def process_snapshot() -> SnapshotDescriptor | None:
  return _PROCESS_SNAPSHOT


def resolve_repo_root() -> Path:
  env_root = os.environ.get("AURADIN_DATA_ROOT")
  if env_root:
    return Path(env_root).expanduser().resolve()
  here = Path(__file__).resolve()
  for parent in here.parents:
    if (parent / "data" / "auradin").is_dir():
      return parent
  raise SnapshotValidationError("cannot locate data/auradin trust root")


def auradin_data_root() -> Path:
  return (resolve_repo_root() / "data" / "auradin").resolve()


def sha256_file(path: Path) -> str:
  digest = hashlib.sha256()
  with path.open("rb") as handle:
    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
      digest.update(chunk)
  return digest.hexdigest()


def _load_json(path: Path) -> dict[str, Any]:
  try:
    payload = json.loads(path.read_text(encoding="utf-8"))
  except (OSError, json.JSONDecodeError) as exc:
    raise SnapshotValidationError(f"invalid JSON artifact: {path}: {exc}") from exc
  if not isinstance(payload, dict):
    raise SnapshotValidationError(f"JSON object required: {path}")
  return payload


def _load_jsonl(path: Path) -> list[dict[str, Any]]:
  rows: list[dict[str, Any]] = []
  try:
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
      if not line.strip():
        continue
      row = json.loads(line)
      if not isinstance(row, dict):
        raise SnapshotValidationError(f"JSONL object required: {path}:{line_number}")
      rows.append(row)
  except (OSError, json.JSONDecodeError) as exc:
    raise SnapshotValidationError(f"invalid JSONL artifact: {path}: {exc}") from exc
  return rows


def _safe_relative_path(data_root: Path, value: Any, *, field: str) -> Path:
  raw = str(value or "").strip()
  relative = Path(raw)
  if not raw or relative.is_absolute() or ".." in relative.parts:
    raise SnapshotValidationError(f"{field} must be relative to data/auradin: {raw!r}")
  resolved = (data_root / relative).resolve()
  try:
    resolved.relative_to(data_root.resolve())
  except ValueError as exc:
    raise SnapshotValidationError(f"{field} escapes data/auradin: {raw!r}") from exc
  return resolved


def _unique_nonempty(rows: list[dict[str, Any]], field: str, *, artifact: str) -> set[str]:
  values = [str(row.get(field) or "").strip() for row in rows]
  if any(not value for value in values):
    raise SnapshotValidationError(f"{artifact}.{field} contains an empty value")
  if len(values) != len(set(values)):
    raise SnapshotValidationError(f"{artifact}.{field} contains duplicates")
  return set(values)


def _validate_hash(path: Path, expected: Any, *, field: str) -> str:
  if not path.is_file():
    raise SnapshotValidationError(f"missing snapshot artifact: {path}")
  actual = sha256_file(path)
  if actual != str(expected or ""):
    raise SnapshotValidationError(f"{field} mismatch for {path}: expected={expected} actual={actual}")
  return actual


def validate_snapshot_manifest(
  manifest_path: Path,
  *,
  data_root: Path | None = None,
  expected_manifest_sha256: str | None = None,
  source: str = "manifest_override",
) -> SnapshotDescriptor:
  root = (data_root or auradin_data_root()).resolve()
  manifest_path = manifest_path.expanduser().resolve()
  try:
    manifest_path.relative_to(root)
  except ValueError as exc:
    raise SnapshotValidationError("snapshot manifest must live below data/auradin") from exc
  if not manifest_path.is_file():
    raise SnapshotValidationError(f"snapshot manifest not found: {manifest_path}")

  manifest_sha = sha256_file(manifest_path)
  if expected_manifest_sha256 and manifest_sha != expected_manifest_sha256:
    raise SnapshotValidationError(
      f"manifest SHA mismatch: expected={expected_manifest_sha256} actual={manifest_sha}",
    )
  manifest = _load_json(manifest_path)
  missing = sorted(REQUIRED_MANIFEST_FIELDS - set(manifest))
  if missing:
    raise SnapshotValidationError(f"snapshot manifest missing fields: {', '.join(missing)}")
  if int(manifest.get("schemaVersion") or 0) != SNAPSHOT_SCHEMA_VERSION:
    raise SnapshotValidationError(f"unsupported snapshot schemaVersion: {manifest.get('schemaVersion')}")

  run_date = str(manifest.get("runDate") or "").strip()
  if len(run_date) != 8 or not run_date.isdigit():
    raise SnapshotValidationError(f"invalid runDate: {run_date!r}")
  catalog_path = _safe_relative_path(root, manifest["catalogPath"], field="catalogPath")
  chunks_path = _safe_relative_path(root, manifest["chunksPath"], field="chunksPath")
  vector_path = _safe_relative_path(root, manifest["vectorPath"], field="vectorPath")
  seed_path = _safe_relative_path(root, manifest["seedPath"], field="seedPath")
  for field, path in (
    ("catalogPath", catalog_path),
    ("chunksPath", chunks_path),
    ("vectorPath", vector_path),
  ):
    if run_date not in path.name:
      raise SnapshotValidationError(f"{field} does not carry runDate {run_date}: {path.name}")

  catalog_sha = _validate_hash(catalog_path, manifest["catalogSha256"], field="catalogSha256")
  chunks_sha = _validate_hash(chunks_path, manifest["chunksSha256"], field="chunksSha256")
  vector_sha = _validate_hash(vector_path, manifest["vectorSha256"], field="vectorSha256")
  seed_sha = _validate_hash(seed_path, manifest["seedSha256"], field="seedSha256")

  catalog_rows = _load_jsonl(catalog_path)
  chunk_rows = _load_jsonl(chunks_path)
  vector_payload = _load_json(vector_path)
  vector_rows = vector_payload.get("vectors")
  metadata = vector_payload.get("metadata")
  if not isinstance(vector_rows, list) or not all(isinstance(row, dict) for row in vector_rows):
    raise SnapshotValidationError("vector artifact requires an object-row vectors array")
  if not isinstance(metadata, dict):
    raise SnapshotValidationError("vector artifact metadata object required")

  catalog_ids = _unique_nonempty(catalog_rows, "id", artifact="catalog")
  chunk_ids = _unique_nonempty(chunk_rows, "chunkId", artifact="chunks")
  chunk_catalog_ids = {str(row.get("catalogItemId") or "").strip() for row in chunk_rows}
  if "" in chunk_catalog_ids or chunk_catalog_ids != catalog_ids:
    raise SnapshotValidationError("catalog/chunk catalogItemId sets differ")
  vector_ids = _unique_nonempty(vector_rows, "chunkId", artifact="vector")
  if vector_ids != chunk_ids:
    raise SnapshotValidationError("chunk/vector chunkId sets differ")

  dimension = int(manifest.get("dimension") or 0)
  if dimension <= 0:
    raise SnapshotValidationError("manifest dimension must be positive")
  for row in vector_rows:
    vector = row.get("vector")
    if not isinstance(vector, list) or len(vector) != dimension:
      raise SnapshotValidationError(f"vector dimension mismatch for chunkId={row.get('chunkId')}")
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in vector):
      raise SnapshotValidationError(f"non-finite/non-numeric vector for chunkId={row.get('chunkId')}")

  expected_counts = {
    "catalogCount": len(catalog_rows),
    "chunkCount": len(chunk_rows),
    "vectorCount": len(vector_rows),
  }
  for field, actual in expected_counts.items():
    if int(manifest.get(field) or -1) != actual:
      raise SnapshotValidationError(f"{field} mismatch: manifest={manifest.get(field)} actual={actual}")
  if len(chunk_rows) != len(vector_rows):
    raise SnapshotValidationError("vectorCount must equal chunkCount")

  expected_metadata = {
    "runDate": run_date,
    "backend": str(manifest.get("backend") or ""),
    "modelId": str(manifest.get("modelId") or ""),
    "dimension": dimension,
    "chunkCount": len(chunk_rows),
  }
  for field, expected in expected_metadata.items():
    actual = metadata.get(field)
    if field in {"dimension", "chunkCount"}:
      actual = int(actual or 0)
    else:
      actual = str(actual or "")
    if actual != expected:
      raise SnapshotValidationError(f"vector metadata {field} mismatch: expected={expected!r} actual={actual!r}")

  return SnapshotDescriptor(
    source=source,
    data_root=root,
    manifest_path=manifest_path,
    manifest_sha256=manifest_sha,
    run_date=run_date,
    catalog_path=catalog_path,
    catalog_sha256=catalog_sha,
    chunks_path=chunks_path,
    chunks_sha256=chunks_sha,
    vector_path=vector_path,
    vector_sha256=vector_sha,
    seed_path=seed_path,
    seed_sha256=seed_sha,
    backend=str(manifest["backend"]),
    model_id=str(manifest["modelId"]),
    dimension=dimension,
    catalog_count=len(catalog_rows),
    chunk_count=len(chunk_rows),
    vector_count=len(vector_rows),
  )


def a8_quality_summary(catalog_rows: list[dict[str, Any]]) -> dict[str, Any]:
  brand_contaminated_ids: list[str] = []
  cooling_contaminated_ids: list[str] = []
  controls: dict[str, bool] = {control: False for control in A8_POSITIVE_CONTROLS}
  for row in catalog_rows:
    raw_title = str(row.get("rawTitle") or row.get("productName") or "")
    brand_name = str(row.get("brandName") or "")
    attributes = row.get("attributes") if isinstance(row.get("attributes"), dict) else {}
    final_is_cool = str(attributes.get("undertone") or "").strip() == "cool"
    brand_spans = find_brand_alias_spans(raw_title, brand_name)
    inferred_support = infer_brand_clean_undertone_evidence(
      title=raw_title,
      category=str(row.get("category") or ""),
      brand=brand_name,
    )
    has_brand_clean_cool = any(
      support.get("field") == "undertone" and support.get("value") == "cool"
      for support in inferred_support
    )

    for control in controls:
      if control in raw_title and final_is_cool and has_brand_clean_cool:
        controls[control] = True

    if not final_is_cool or has_brand_clean_cool:
      continue

    evidence = row.get("evidence") if isinstance(row.get("evidence"), list) else []
    cool_evidence = [
      item
      for item in evidence
      if item.get("field") == "undertone" and item.get("value") == "cool"
    ]
    title_sources = {"title_rule_inferred", "title_residual_rule_inferred", "title_color_undertone_derived"}

    def is_title_evidence(item: dict[str, Any]) -> bool:
      source_type = str(item.get("sourceType") or "")
      return (
        source_type in title_sources
        or str(item.get("rawLabel") or "") == "productName"
        or (
          isinstance(item.get("matchedStart"), int)
          and isinstance(item.get("matchedEnd"), int)
          and bool(item.get("rawText"))
        )
      )

    has_non_title_evidence = any(
      not is_title_evidence(item)
      and str(item.get("sourceType") or "") != "brand_alias_sanitization"
      for item in cool_evidence
    )
    brand_carries_cool_marker = any(
      "쿨" in raw_title[int(span.get("start") or 0):int(span.get("end") or 0)].casefold()
      or "cool" in raw_title[int(span.get("start") or 0):int(span.get("end") or 0)].casefold()
      for span in brand_spans
    )
    item_id = str(row.get("id") or "")
    if brand_carries_cool_marker and not has_non_title_evidence:
      brand_contaminated_ids.append(item_id)
    # Legacy title parsing treated the generic syllable "쿨" inside "쿨링"
    # as personal cool undertone. Brand-clean inference intentionally excludes
    # it; reject a final cool value when cooling is its only title support.
    if "쿨링" in raw_title and not has_non_title_evidence:
      cooling_contaminated_ids.append(item_id)
  invalid_ids = sorted(set(brand_contaminated_ids) | set(cooling_contaminated_ids))
  return {
    "brandOnlyCoolCount": len(set(brand_contaminated_ids)),
    "brandOnlyCoolIds": sorted(set(brand_contaminated_ids)),
    "coolingOnlyCoolCount": len(set(cooling_contaminated_ids)),
    "coolingOnlyCoolIds": sorted(set(cooling_contaminated_ids)),
    "invalidCoolCount": len(invalid_ids),
    "invalidCoolIds": invalid_ids,
    "positiveControls": controls,
  }


def validate_a8_quality(catalog_path: Path) -> dict[str, Any]:
  summary = a8_quality_summary(_load_jsonl(catalog_path))
  if summary["invalidCoolCount"]:
    raise SnapshotValidationError(
      f"A8 contamination gate failed: {summary['invalidCoolCount']} invalid cool rows",
    )
  missing = [name for name, present in summary["positiveControls"].items() if not present]
  if missing:
    raise SnapshotValidationError(f"A8 positive controls missing: {', '.join(missing)}")
  return summary


def _strict_environment(settings: Any) -> bool:
  return str(getattr(settings, "environment", "") or "").strip().lower() not in NON_PRODUCTION_ENVIRONMENTS


def _resolve_manifest_selection(settings: Any, root: Path) -> tuple[Path, str | None, str]:
  override = str(getattr(settings, "auradin_snapshot_manifest", None) or "").strip()
  strict = _strict_environment(settings)
  legacy_overrides = {
    name: os.environ.get(name)
    for name in ("AURADIN_RUN_DATE", "AURADIN_VECTOR_INDEX_PATH")
    if os.environ.get(name)
  }
  if strict:
    if override or os.environ.get("AURADIN_SNAPSHOT_MANIFEST"):
      raise SnapshotValidationError("production snapshot selection must use active_snapshot.json")
    if legacy_overrides:
      raise SnapshotValidationError(f"production legacy snapshot overrides forbidden: {sorted(legacy_overrides)}")
    if str(getattr(settings, "auradin_vector_index_path", None) or "").strip():
      raise SnapshotValidationError("production vector index path override is forbidden")
    if bool(getattr(settings, "auradin_vector_index_autobuild", False)):
      raise SnapshotValidationError("production vector index autobuild is forbidden")
    if bool(getattr(settings, "auradin_snapshot_dev_regeneration", False)):
      raise SnapshotValidationError("production dev snapshot regeneration is forbidden")

  if override:
    override_path = Path(override).expanduser()
    if not override_path.is_absolute():
      override_path = resolve_repo_root() / override_path
    return override_path.resolve(), None, "manifest_override"

  pointer_path = root / ACTIVE_POINTER_NAME
  if not pointer_path.is_file():
    raise SnapshotValidationError(f"active snapshot pointer not found: {pointer_path}")
  pointer = _load_json(pointer_path)
  if set(pointer) != {"manifestPath", "manifestSha256"}:
    raise SnapshotValidationError("active snapshot pointer must contain only manifestPath and manifestSha256")
  manifest_path = _safe_relative_path(root, pointer["manifestPath"], field="manifestPath")
  return manifest_path, str(pointer["manifestSha256"]), "active_pointer"


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(
    "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
    encoding="utf-8",
  )


def _regenerate_dev_snapshot(settings: Any, root: Path) -> SnapshotDescriptor:
  """Explicit, non-production-only deterministic regeneration fallback."""

  if _strict_environment(settings) or not bool(getattr(settings, "auradin_snapshot_dev_regeneration", False)):
    raise SnapshotValidationError("dev snapshot regeneration is not enabled")
  from .embedding_client import HashEmbeddingClient
  from .knowledge_chunk_builder import build_knowledge_chunks, build_mvp_catalog
  from .vector_index import EmbeddingVectorIndex

  requested_run_date = str(os.environ.get("AURADIN_RUN_DATE") or "").strip()
  seed_candidates = sorted((root / "catalog").glob("catalog_items_seed_*.jsonl"))
  if requested_run_date:
    seed_path = root / "catalog" / f"catalog_items_seed_{requested_run_date}.jsonl"
  elif seed_candidates:
    seed_path = seed_candidates[-1]
    requested_run_date = seed_path.stem.rsplit("_", 1)[-1]
  else:
    raise SnapshotValidationError("no seed artifact available for dev regeneration")
  if not seed_path.is_file() or len(requested_run_date) != 8 or not requested_run_date.isdigit():
    raise SnapshotValidationError("dev regeneration requires an 8-digit seed run date")

  dev_root = root / ".dev"
  catalog_path = dev_root / "catalog" / f"catalog_items_mvp_{requested_run_date}.jsonl"
  chunks_path = dev_root / "knowledge" / f"product_knowledge_chunks_mvp_{requested_run_date}.jsonl"
  vector_path = dev_root / "vector" / f"product_knowledge_vector_index_mvp_{requested_run_date}.json"
  seed_rows = _load_jsonl(seed_path)
  catalog_rows = build_mvp_catalog(seed_rows)
  chunk_rows = build_knowledge_chunks(catalog_rows)
  _write_jsonl(catalog_path, catalog_rows)
  _write_jsonl(chunks_path, chunk_rows)
  dimension = max(16, min(int(getattr(settings, "embedding_dimension", 1024) or 1024), 1024))
  EmbeddingVectorIndex.build(
    chunk_rows,
    embedding_client=HashEmbeddingClient(dimension=dimension),
    metadata={
      "backend": "hash",
      "chunkCount": len(chunk_rows),
      "dimension": dimension,
      "modelId": "hash-fallback",
      "runDate": requested_run_date,
      "source": "explicit_dev_regeneration",
    },
  ).save(vector_path)
  manifest_path = dev_root / "manifests" / f"snapshot_{requested_run_date}.json"
  manifest_path.parent.mkdir(parents=True, exist_ok=True)
  manifest = {
    "schemaVersion": SNAPSHOT_SCHEMA_VERSION,
    "runDate": requested_run_date,
    "catalogPath": catalog_path.relative_to(root).as_posix(),
    "catalogSha256": sha256_file(catalog_path),
    "chunksPath": chunks_path.relative_to(root).as_posix(),
    "chunksSha256": sha256_file(chunks_path),
    "vectorPath": vector_path.relative_to(root).as_posix(),
    "vectorSha256": sha256_file(vector_path),
    "seedPath": seed_path.relative_to(root).as_posix(),
    "seedSha256": sha256_file(seed_path),
    "backend": "hash",
    "modelId": "hash-fallback",
    "dimension": dimension,
    "catalogCount": len(catalog_rows),
    "chunkCount": len(chunk_rows),
    "vectorCount": len(chunk_rows),
  }
  manifest_path.write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
  )
  return validate_snapshot_manifest(manifest_path, data_root=root, source="dev_regenerated")


@lru_cache(maxsize=16)
def _resolve_cached(
  data_root_value: str,
  manifest_value: str,
  expected_sha: str,
  source: str,
) -> SnapshotDescriptor:
  return validate_snapshot_manifest(
    Path(manifest_value),
    data_root=Path(data_root_value),
    expected_manifest_sha256=expected_sha or None,
    source=source,
  )


def resolve_and_validate_snapshot(settings: Any, *, force: bool = False) -> SnapshotDescriptor:
  root = auradin_data_root()
  try:
    manifest_path, expected_sha, source = _resolve_manifest_selection(settings, root)
  except SnapshotValidationError:
    if bool(getattr(settings, "auradin_snapshot_dev_regeneration", False)) and not _strict_environment(settings):
      return _regenerate_dev_snapshot(settings, root)
    raise
  if force:
    _resolve_cached.cache_clear()
  return _resolve_cached(str(root), str(manifest_path), expected_sha or "", source)


def reset_snapshot_cache() -> None:
  _resolve_cached.cache_clear()
