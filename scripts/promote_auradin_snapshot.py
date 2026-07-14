from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.auradin_agent.snapshot_manifest import (  # noqa: E402
  ACTIVE_POINTER_NAME,
  SNAPSHOT_SCHEMA_VERSION,
  SnapshotValidationError,
  auradin_data_root,
  sha256_file,
  validate_a8_quality,
  validate_snapshot_manifest,
)


def _read_json(path: Path) -> dict[str, Any]:
  payload = json.loads(path.read_text(encoding="utf-8"))
  if not isinstance(payload, dict):
    raise SnapshotValidationError(f"JSON object required: {path}")
  return payload


def _jsonl_count(path: Path) -> int:
  return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())


def _relative(data_root: Path, path: Path) -> str:
  resolved = path.expanduser().resolve()
  try:
    return resolved.relative_to(data_root.resolve()).as_posix()
  except ValueError as exc:
    raise SnapshotValidationError(f"artifact must live below data/auradin: {path}") from exc


def _fsync_directory(path: Path) -> None:
  descriptor = os.open(path, os.O_RDONLY)
  try:
    os.fsync(descriptor)
  finally:
    os.close(descriptor)


def _write_json_atomic(path: Path, payload: dict[str, Any], *, immutable: bool = False) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  content = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
  if immutable and path.exists():
    existing = path.read_text(encoding="utf-8")
    if existing != content:
      raise SnapshotValidationError(f"immutable file already exists with different content: {path}")
    return
  temp_path = path.with_name(f".{path.name}.{os.getpid()}.tmp")
  with temp_path.open("w", encoding="utf-8") as handle:
    handle.write(content)
    handle.flush()
    os.fsync(handle.fileno())
  os.replace(temp_path, path)
  _fsync_directory(path.parent)


def _manifest_payload(
  *,
  data_root: Path,
  run_date: str,
  catalog_path: Path,
  chunks_path: Path,
  vector_path: Path,
  seed_path: Path,
) -> dict[str, Any]:
  vector_payload = _read_json(vector_path)
  metadata = vector_payload.get("metadata")
  vectors = vector_payload.get("vectors")
  if not isinstance(metadata, dict) or not isinstance(vectors, list):
    raise SnapshotValidationError("vector artifact requires metadata and vectors")
  return {
    "schemaVersion": SNAPSHOT_SCHEMA_VERSION,
    "runDate": run_date,
    "catalogPath": _relative(data_root, catalog_path),
    "catalogSha256": sha256_file(catalog_path),
    "chunksPath": _relative(data_root, chunks_path),
    "chunksSha256": sha256_file(chunks_path),
    "vectorPath": _relative(data_root, vector_path),
    "vectorSha256": sha256_file(vector_path),
    "seedPath": _relative(data_root, seed_path),
    "seedSha256": sha256_file(seed_path),
    "backend": str(metadata.get("backend") or ""),
    "modelId": str(metadata.get("modelId") or ""),
    "dimension": int(metadata.get("dimension") or 0),
    "catalogCount": _jsonl_count(catalog_path),
    "chunkCount": _jsonl_count(chunks_path),
    "vectorCount": len(vectors),
  }


def _artifact_paths(data_root: Path, run_date: str) -> tuple[Path, Path, Path]:
  return (
    data_root / "catalog" / f"catalog_items_mvp_{run_date}.jsonl",
    data_root / "knowledge" / f"product_knowledge_chunks_mvp_{run_date}.jsonl",
    data_root / "vector" / f"product_knowledge_vector_index_mvp_{run_date}.json",
  )


def bootstrap_existing(
  *,
  run_date: str,
  catalog_path: Path,
  chunks_path: Path,
  vector_path: Path,
  seed_path: Path,
) -> dict[str, Any]:
  data_root = auradin_data_root()
  manifest_path = data_root / "manifests" / f"snapshot_{run_date}.json"
  payload = _manifest_payload(
    data_root=data_root,
    run_date=run_date,
    catalog_path=catalog_path,
    chunks_path=chunks_path,
    vector_path=vector_path,
    seed_path=seed_path,
  )
  _write_json_atomic(manifest_path, payload, immutable=True)
  descriptor = validate_snapshot_manifest(manifest_path, data_root=data_root, source="bootstrap")
  pointer_path = data_root / ACTIVE_POINTER_NAME
  pointer = {
    "manifestPath": _relative(data_root, manifest_path),
    "manifestSha256": descriptor.manifest_sha256,
  }
  if pointer_path.exists():
    current = _read_json(pointer_path)
    if current != pointer:
      raise SnapshotValidationError("active pointer already exists; bootstrap will not overwrite it")
  else:
    _write_json_atomic(pointer_path, pointer)
  return {**descriptor.public_status(), "manifestPath": str(manifest_path), "mode": "bootstrap"}


def _move_immutable(source: Path, target: Path, *, expected_sha256: str) -> None:
  target.parent.mkdir(parents=True, exist_ok=True)
  if not source.is_file():
    if not target.is_file():
      raise SnapshotValidationError(f"missing staged and prepared artifact: {source} -> {target}")
    if sha256_file(target) != expected_sha256:
      raise SnapshotValidationError(f"prepared artifact SHA does not match candidate manifest: {target}")
    with target.open("rb") as handle:
      os.fsync(handle.fileno())
    _fsync_directory(target.parent)
    return
  if sha256_file(source) != expected_sha256:
    raise SnapshotValidationError(f"staged artifact SHA does not match candidate manifest: {source}")
  if target.exists():
    if sha256_file(source) != sha256_file(target):
      raise SnapshotValidationError(f"dated artifact already exists with different SHA: {target}")
    source.unlink()
    return
  os.replace(source, target)
  with target.open("rb") as handle:
    os.fsync(handle.fileno())
  _fsync_directory(target.parent)


def _resolved_sidecar_path(value: Any, *, field: str) -> Path:
  raw = str(value or "").strip()
  if not raw:
    raise SnapshotValidationError(f"preprocessing sidecar {field} is required")
  path = Path(raw)
  resolved = path.resolve() if path.is_absolute() else (REPO_ROOT / path).resolve()
  try:
    resolved.relative_to(REPO_ROOT.resolve())
  except ValueError as exc:
    raise SnapshotValidationError(f"preprocessing sidecar {field} escapes repository: {raw!r}") from exc
  return resolved


def _validate_preprocessing_sidecar(
  payload: dict[str, Any],
  *,
  run_date: str,
  seed_path: Path,
  catalog_source: Path,
  chunks_source: Path,
  effective_catalog: Path,
  effective_chunks: Path,
) -> None:
  if str(payload.get("runDate") or "") != run_date:
    raise SnapshotValidationError("preprocessing sidecar runDate mismatch")
  recorded_seed = _resolved_sidecar_path(payload.get("seedPath"), field="seedPath")
  if recorded_seed != seed_path:
    raise SnapshotValidationError("preprocessing sidecar seedPath mismatch")
  if str(payload.get("seedSha256") or "") != sha256_file(seed_path):
    raise SnapshotValidationError("preprocessing sidecar seedSha256 mismatch")
  recorded_catalog = _resolved_sidecar_path(payload.get("catalogPath"), field="catalogPath")
  recorded_chunks = _resolved_sidecar_path(payload.get("chunksPath"), field="chunksPath")
  if recorded_catalog != catalog_source:
    raise SnapshotValidationError("preprocessing sidecar catalogPath mismatch")
  if recorded_chunks != chunks_source:
    raise SnapshotValidationError("preprocessing sidecar chunksPath mismatch")
  try:
    catalog_count = int(payload.get("catalogCount") or -1)
    chunk_count = int(payload.get("chunkCount") or -1)
  except (TypeError, ValueError) as exc:
    raise SnapshotValidationError("preprocessing sidecar counts must be integers") from exc
  if catalog_count != _jsonl_count(effective_catalog):
    raise SnapshotValidationError("preprocessing sidecar catalogCount mismatch")
  if chunk_count != _jsonl_count(effective_chunks):
    raise SnapshotValidationError("preprocessing sidecar chunkCount mismatch")


def _candidate_payload_for_effective_artifacts(
  *,
  data_root: Path,
  run_date: str,
  catalog_source: Path,
  chunks_source: Path,
  vector_source: Path,
  effective_catalog: Path,
  effective_chunks: Path,
  effective_vector: Path,
  seed_path: Path,
) -> dict[str, Any]:
  payload = _manifest_payload(
    data_root=data_root,
    run_date=run_date,
    catalog_path=effective_catalog,
    chunks_path=effective_chunks,
    vector_path=effective_vector,
    seed_path=seed_path,
  )
  # The candidate file doubles as a move journal. Keep the original staging
  # paths even when a retry reads one or more artifacts from their final dated
  # targets; hashes and counts are recomputed from the effective files.
  payload["catalogPath"] = _relative(data_root, catalog_source)
  payload["chunksPath"] = _relative(data_root, chunks_source)
  payload["vectorPath"] = _relative(data_root, vector_source)
  return payload


def _effective_artifact(
  source: Path,
  target: Path,
  *,
  candidate_payload: dict[str, Any] | None,
  sha_field: str,
) -> Path:
  if source.is_file():
    return source
  if not target.is_file() or candidate_payload is None:
    raise SnapshotValidationError(f"missing staged snapshot artifact: {source}")
  expected_sha = str(candidate_payload.get(sha_field) or "")
  if not expected_sha or sha256_file(target) != expected_sha:
    raise SnapshotValidationError(f"prepared artifact SHA does not match move journal: {target}")
  return target


def _nonempty_approval_value(value: Any) -> bool:
  if isinstance(value, str):
    return bool(value.strip())
  if isinstance(value, (list, dict)):
    return bool(value)
  return False


def validate_approval_evidence(
  evidence_path: Path,
  *,
  expected_evidence_sha256: str,
  expected_manifest_sha256: str,
) -> dict[str, Any]:
  evidence_path = evidence_path.expanduser().resolve()
  if not evidence_path.is_file():
    raise SnapshotValidationError(f"approval evidence not found: {evidence_path}")
  try:
    evidence_bytes = evidence_path.read_bytes()
    payload = json.loads(evidence_bytes)
  except (OSError, json.JSONDecodeError) as exc:
    raise SnapshotValidationError(f"invalid approval evidence: {evidence_path}: {exc}") from exc
  if not isinstance(payload, dict):
    raise SnapshotValidationError("approval evidence must be a JSON object")
  actual_sha = hashlib.sha256(evidence_bytes).hexdigest()
  if not expected_evidence_sha256 or actual_sha != expected_evidence_sha256:
    raise SnapshotValidationError("approval evidence SHA mismatch")
  if str(payload.get("snapshotManifestSha256") or "") != expected_manifest_sha256:
    raise SnapshotValidationError("approval evidence manifest SHA mismatch")

  golden = payload.get("golden")
  if not isinstance(golden, dict):
    raise SnapshotValidationError("approval evidence golden result is required")
  try:
    passed = int(golden.get("passed") or 0)
    total = int(golden.get("total") or 0)
  except (TypeError, ValueError) as exc:
    raise SnapshotValidationError("approval evidence golden counts must be integers") from exc
  if str(golden.get("status") or "").upper() != "PASS" or total != 6 or passed != total:
    raise SnapshotValidationError("approval evidence golden result is not a complete pass")

  a8 = payload.get("a8")
  if not isinstance(a8, dict) or not (
    a8.get("passed") is True or str(a8.get("status") or "").upper() == "PASS"
  ):
    raise SnapshotValidationError("approval evidence A8 result is not PASS")
  if not _nonempty_approval_value(payload.get("coverageClassification")):
    raise SnapshotValidationError("approval evidence coverageClassification is required")
  if not isinstance(payload.get("approvedBy"), str) or not payload["approvedBy"].strip():
    raise SnapshotValidationError("approval evidence approvedBy is required")
  if str(payload.get("approvalConclusion") or "").strip().lower() != "approved":
    raise SnapshotValidationError("approval evidence conclusion must be approved")
  return {"path": str(evidence_path), "sha256": actual_sha, "approvedBy": payload["approvedBy"]}


def prepare_snapshot(*, staging_root: Path, run_date: str, seed_path: Path | None) -> dict[str, Any]:
  data_root = auradin_data_root()
  staging_root = staging_root.resolve()
  try:
    staging_root.relative_to(data_root)
  except ValueError as exc:
    raise SnapshotValidationError("staging-root must live below data/auradin (same filesystem)") from exc
  catalog_source = staging_root / "catalog" / f"catalog_items_mvp_{run_date}.jsonl"
  chunks_source = staging_root / "knowledge" / f"product_knowledge_chunks_mvp_{run_date}.jsonl"
  vector_source = staging_root / "vector" / f"product_knowledge_vector_index_mvp_{run_date}.json"
  catalog_target, chunks_target, vector_target = _artifact_paths(data_root, run_date)
  manifest_path = data_root / "manifests" / f"snapshot_{run_date}.json"
  build_metadata_path = staging_root / ".auradin_preprocessing.json"
  if not build_metadata_path.is_file():
    # A completed prepare is idempotent. The staging sidecar is deliberately
    # removed only after the immutable manifest validates, so its absence is
    # reusable solely when every staged artifact is gone and the dated final
    # manifest is complete and hash-valid.
    if manifest_path.is_file() and not any(
      path.exists() for path in (catalog_source, chunks_source, vector_source)
    ):
      descriptor = validate_snapshot_manifest(manifest_path, data_root=data_root, source="prepared_reused")
      if descriptor.run_date != run_date:
        raise SnapshotValidationError("prepared manifest runDate mismatch")
      if seed_path is not None and descriptor.seed_path != seed_path.expanduser().resolve():
        raise SnapshotValidationError("prepared manifest seedPath mismatch")
      return {
        **descriptor.public_status(),
        "manifestPath": str(manifest_path),
        "mode": "prepare_reused",
        "a8": validate_a8_quality(descriptor.catalog_path),
      }
    raise SnapshotValidationError("preprocessing sidecar is required")
  build_metadata = _read_json(build_metadata_path)
  if seed_path is None:
    recorded_seed = str(build_metadata.get("seedPath") or "")
    if not recorded_seed:
      raise SnapshotValidationError("seed path required (or preprocessing sidecar missing)")
    seed_path = Path(recorded_seed)
    if not seed_path.is_absolute():
      seed_path = REPO_ROOT / seed_path
  seed_path = seed_path.resolve()

  candidate_manifest = staging_root / ".snapshot_candidate.json"
  recorded_candidate = _read_json(candidate_manifest) if candidate_manifest.is_file() else None
  effective_catalog = _effective_artifact(
    catalog_source,
    catalog_target,
    candidate_payload=recorded_candidate,
    sha_field="catalogSha256",
  )
  effective_chunks = _effective_artifact(
    chunks_source,
    chunks_target,
    candidate_payload=recorded_candidate,
    sha_field="chunksSha256",
  )
  effective_vector = _effective_artifact(
    vector_source,
    vector_target,
    candidate_payload=recorded_candidate,
    sha_field="vectorSha256",
  )
  _validate_preprocessing_sidecar(
    build_metadata,
    run_date=run_date,
    seed_path=seed_path,
    catalog_source=catalog_source,
    chunks_source=chunks_source,
    effective_catalog=effective_catalog,
    effective_chunks=effective_chunks,
  )

  candidate_payload = _candidate_payload_for_effective_artifacts(
    data_root=data_root,
    run_date=run_date,
    catalog_source=catalog_source,
    chunks_source=chunks_source,
    vector_source=vector_source,
    effective_catalog=effective_catalog,
    effective_chunks=effective_chunks,
    effective_vector=effective_vector,
    seed_path=seed_path,
  )
  if recorded_candidate is not None and recorded_candidate != candidate_payload:
    raise SnapshotValidationError("snapshot move journal does not match effective artifacts")
  _write_json_atomic(candidate_manifest, candidate_payload, immutable=True)
  if effective_catalog == catalog_source and effective_chunks == chunks_source and effective_vector == vector_source:
    validate_snapshot_manifest(candidate_manifest, data_root=data_root, source="staging")
  a8_summary = validate_a8_quality(effective_catalog)

  for source, target, sha_field in (
    (catalog_source, catalog_target, "catalogSha256"),
    (chunks_source, chunks_target, "chunksSha256"),
    (vector_source, vector_target, "vectorSha256"),
  ):
    _move_immutable(source, target, expected_sha256=str(candidate_payload[sha_field]))

  final_payload = _manifest_payload(
    data_root=data_root,
    run_date=run_date,
    catalog_path=catalog_target,
    chunks_path=chunks_target,
    vector_path=vector_target,
    seed_path=seed_path,
  )
  _write_json_atomic(manifest_path, final_payload, immutable=True)
  descriptor = validate_snapshot_manifest(manifest_path, data_root=data_root, source="prepared")
  candidate_manifest.unlink(missing_ok=True)
  build_metadata_path.unlink(missing_ok=True)
  for directory in (
    staging_root / "catalog",
    staging_root / "knowledge",
    staging_root / "vector",
    staging_root,
  ):
    try:
      directory.rmdir()
    except OSError:
      pass
  return {
    **descriptor.public_status(),
    "manifestPath": str(manifest_path),
    "mode": "prepare_only",
    "a8": a8_summary,
  }


def activate_snapshot(
  *,
  manifest_path: Path,
  approved_manifest_sha: str | None,
  approval_evidence_path: Path | None,
  approval_evidence_sha: str | None,
  expected_active_manifest_sha: str,
  worker_count: int | None,
  artifact_filesystem_mode: str | None,
  restart_mechanism: str | None,
  active_pointer_persistence: str | None,
) -> dict[str, Any]:
  if (
    not approved_manifest_sha
    or approval_evidence_path is None
    or not approval_evidence_sha
    or not worker_count
    or not artifact_filesystem_mode
    or not restart_mechanism
    or not active_pointer_persistence
  ):
    raise SnapshotValidationError("activation preflight is incomplete")
  if artifact_filesystem_mode == "mutable_per_worker":
    raise SnapshotValidationError("mutable_per_worker activation is forbidden")
  if artifact_filesystem_mode == "immutable_image":
    raise SnapshotValidationError("immutable_image activation must be performed by the release mechanism")
  if artifact_filesystem_mode != "mutable_shared":
    raise SnapshotValidationError(f"unknown artifact filesystem mode: {artifact_filesystem_mode}")

  data_root = auradin_data_root()
  descriptor = validate_snapshot_manifest(manifest_path, data_root=data_root, source="activation_target")
  if descriptor.manifest_sha256 != approved_manifest_sha:
    raise SnapshotValidationError("approved manifest SHA does not match activation target")
  approval = validate_approval_evidence(
    approval_evidence_path,
    expected_evidence_sha256=approval_evidence_sha,
    expected_manifest_sha256=descriptor.manifest_sha256,
  )
  validate_a8_quality(descriptor.catalog_path)
  pointer_path = data_root / ACTIVE_POINTER_NAME
  lock_path = data_root / ".active_snapshot.lock"
  lock_path.touch(exist_ok=True)
  with lock_path.open("r+") as lock_handle:
    fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX)
    current = _read_json(pointer_path)
    if str(current.get("manifestSha256") or "") != expected_active_manifest_sha:
      raise SnapshotValidationError("active snapshot CAS conflict")
    pointer = {
      "manifestPath": _relative(data_root, descriptor.manifest_path),
      "manifestSha256": descriptor.manifest_sha256,
    }
    _write_json_atomic(pointer_path, pointer)
    fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
  return {
    **descriptor.public_status(),
    "mode": "activated",
    "workerCount": worker_count,
    "restartMechanism": restart_mechanism,
    "activePointerPersistence": active_pointer_persistence,
    "approvalEvidenceSha256": approval["sha256"],
    "approvedBy": approval["approvedBy"],
  }


def _path_or_default(value: Path | None, default: Path) -> Path:
  return (value or default).expanduser().resolve()


def main() -> None:
  parser = argparse.ArgumentParser(description="Validate, prepare, and atomically activate Auradin snapshots.")
  mode = parser.add_mutually_exclusive_group(required=True)
  mode.add_argument("--bootstrap-existing", action="store_true")
  mode.add_argument("--prepare-only", action="store_true")
  mode.add_argument("--activate", action="store_true")
  parser.add_argument("--run-date", required=True)
  parser.add_argument("--staging-root", type=Path)
  parser.add_argument("--catalog-path", type=Path)
  parser.add_argument("--chunks-path", type=Path)
  parser.add_argument("--vector-path", type=Path)
  parser.add_argument("--seed-path", type=Path)
  parser.add_argument("--manifest-path", type=Path)
  parser.add_argument("--approved-manifest-sha")
  parser.add_argument("--approval-evidence", type=Path)
  parser.add_argument("--approval-evidence-sha")
  parser.add_argument("--expected-active-manifest-sha")
  parser.add_argument("--worker-count", type=int)
  parser.add_argument(
    "--artifact-filesystem-mode",
    choices=["mutable_shared", "mutable_per_worker", "immutable_image"],
  )
  parser.add_argument("--restart-mechanism")
  parser.add_argument("--active-pointer-persistence")
  args = parser.parse_args()

  data_root = auradin_data_root()
  catalog_default, chunks_default, vector_default = _artifact_paths(data_root, args.run_date)
  if args.bootstrap_existing:
    result = bootstrap_existing(
      run_date=args.run_date,
      catalog_path=_path_or_default(args.catalog_path, catalog_default),
      chunks_path=_path_or_default(args.chunks_path, chunks_default),
      vector_path=_path_or_default(args.vector_path, vector_default),
      seed_path=_path_or_default(
        args.seed_path,
        data_root / "catalog" / f"catalog_items_seed_{args.run_date}.jsonl",
      ),
    )
  elif args.prepare_only:
    if args.staging_root is None:
      parser.error("--prepare-only requires --staging-root")
    result = prepare_snapshot(
      staging_root=args.staging_root,
      run_date=args.run_date,
      seed_path=args.seed_path,
    )
  else:
    manifest_path = _path_or_default(
      args.manifest_path,
      data_root / "manifests" / f"snapshot_{args.run_date}.json",
    )
    if not args.expected_active_manifest_sha:
      parser.error("--activate requires --expected-active-manifest-sha")
    result = activate_snapshot(
      manifest_path=manifest_path,
      approved_manifest_sha=args.approved_manifest_sha,
      approval_evidence_path=args.approval_evidence,
      approval_evidence_sha=args.approval_evidence_sha,
      expected_active_manifest_sha=args.expected_active_manifest_sha,
      worker_count=args.worker_count,
      artifact_filesystem_mode=args.artifact_filesystem_mode,
      restart_mechanism=args.restart_mechanism,
      active_pointer_persistence=args.active_pointer_persistence,
    )
  print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
  main()
