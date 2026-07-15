from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
import scripts.promote_auradin_snapshot as promotion

from app.core.settings import Settings
from app.services.auradin_agent.snapshot_manifest import (
  SNAPSHOT_SCHEMA_VERSION,
  SnapshotValidationError,
  reset_snapshot_cache,
  resolve_and_validate_snapshot,
  validate_snapshot_manifest,
)


def _write_json(path: Path, payload: object) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def _write_jsonl(path: Path, rows: list[dict]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text("".join(json.dumps(row, sort_keys=True) + "\n" for row in rows), encoding="utf-8")


def _sha(path: Path) -> str:
  return hashlib.sha256(path.read_bytes()).hexdigest()


def _snapshot_fixture(tmp_path: Path) -> tuple[Path, Path]:
  repo_root = tmp_path / "repo"
  root = repo_root / "data" / "auradin"
  catalog = root / "catalog/catalog_items_mvp_20260715.jsonl"
  chunks = root / "knowledge/product_knowledge_chunks_mvp_20260715.jsonl"
  vector = root / "vector/product_knowledge_vector_index_mvp_20260715.json"
  seed = root / "catalog/catalog_items_seed_20260708.jsonl"
  _write_jsonl(catalog, [{"id": "p1", "liveOffer": {"priceKrw": 1, "purchaseUrl": "u", "imageUrl": "i"}}])
  _write_jsonl(chunks, [{"chunkId": "p1:overview", "catalogItemId": "p1", "text": "x"}])
  _write_jsonl(seed, [{"id": "seed-1"}])
  _write_json(
    vector,
    {
      "metadata": {
        "backend": "hash",
        "chunkCount": 1,
        "dimension": 2,
        "modelId": "hash-fallback",
        "runDate": "20260715",
      },
      "vectors": [{"chunkId": "p1:overview", "vector": [0.1, 0.2]}],
    },
  )
  manifest = root / "manifests/snapshot_20260715.json"
  payload = {
    "schemaVersion": SNAPSHOT_SCHEMA_VERSION,
    "runDate": "20260715",
    "catalogPath": "catalog/catalog_items_mvp_20260715.jsonl",
    "catalogSha256": _sha(catalog),
    "chunksPath": "knowledge/product_knowledge_chunks_mvp_20260715.jsonl",
    "chunksSha256": _sha(chunks),
    "vectorPath": "vector/product_knowledge_vector_index_mvp_20260715.json",
    "vectorSha256": _sha(vector),
    "seedPath": "catalog/catalog_items_seed_20260708.jsonl",
    "seedSha256": _sha(seed),
    "backend": "hash",
    "modelId": "hash-fallback",
    "dimension": 2,
    "catalogCount": 1,
    "chunkCount": 1,
    "vectorCount": 1,
  }
  _write_json(manifest, payload)
  _write_json(
    root / "active_snapshot.json",
    {
      "manifestPath": "manifests/snapshot_20260715.json",
      "manifestSha256": _sha(manifest),
    },
  )
  return repo_root, manifest


def _approval_evidence(path: Path, manifest_sha: str, **overrides) -> Path:
  payload = {
    "runId": "20260715-test0001",
    "runDate": "20260715",
    "snapshotManifestSha256": manifest_sha,
    "golden": {"status": "PASS", "passed": 6, "total": 6},
    "a8": {"status": "PASS"},
    "coverageClassification": {"allQueries": "expected"},
    "resultsSha": "1" * 64,
    "reviewDecisionsSha": "2" * 64,
    "approvedBy": "test-reviewer",
    "reviewedAt": "2026-07-15T12:00:00+09:00",
    "approvalConclusion": "approved",
  }
  payload.update(overrides)
  _write_json(path, payload)
  return path


def _staging_fixture(
  tmp_path: Path,
  monkeypatch: pytest.MonkeyPatch,
) -> tuple[Path, Path, Path]:
  repo_root = tmp_path / "repo"
  root = repo_root / "data" / "auradin"
  staging = root / ".staging" / "20260715"
  catalog = staging / "catalog/catalog_items_mvp_20260715.jsonl"
  chunks = staging / "knowledge/product_knowledge_chunks_mvp_20260715.jsonl"
  vector = staging / "vector/product_knowledge_vector_index_mvp_20260715.json"
  seed = root / "catalog/catalog_items_seed_20260708.jsonl"
  _write_jsonl(catalog, [{"id": "p1", "liveOffer": {"priceKrw": 1, "purchaseUrl": "u", "imageUrl": "i"}}])
  _write_jsonl(chunks, [{"chunkId": "p1:overview", "catalogItemId": "p1", "text": "x"}])
  _write_jsonl(seed, [{"id": "seed-1"}])
  _write_json(
    vector,
    {
      "metadata": {
        "backend": "hash",
        "chunkCount": 1,
        "dimension": 2,
        "modelId": "hash-fallback",
        "runDate": "20260715",
      },
      "vectors": [{"chunkId": "p1:overview", "vector": [0.1, 0.2]}],
    },
  )
  _write_json(
    staging / ".auradin_preprocessing.json",
    {
      "runDate": "20260715",
      "seedPath": str(seed.relative_to(repo_root)),
      "seedSha256": _sha(seed),
      "catalogPath": str(catalog.relative_to(repo_root)),
      "chunksPath": str(chunks.relative_to(repo_root)),
      "catalogCount": 1,
      "chunkCount": 1,
    },
  )
  monkeypatch.setenv("AURADIN_DATA_ROOT", str(repo_root))
  monkeypatch.setattr(promotion, "REPO_ROOT", repo_root)
  monkeypatch.setattr(promotion, "validate_a8_quality", lambda _path: {"status": "PASS"})
  return repo_root, staging, seed


def test_manifest_validates_hashes_ids_dimensions_and_counts(tmp_path: Path) -> None:
  repo_root, manifest = _snapshot_fixture(tmp_path)

  descriptor = validate_snapshot_manifest(
    manifest,
    data_root=repo_root / "data/auradin",
  )

  assert descriptor.run_date == "20260715"
  assert descriptor.catalog_count == descriptor.chunk_count == descriptor.vector_count == 1
  assert descriptor.dimension == 2


def test_manifest_rejects_hash_drift_and_path_escape(tmp_path: Path) -> None:
  repo_root, manifest = _snapshot_fixture(tmp_path)
  payload = json.loads(manifest.read_text(encoding="utf-8"))
  payload["catalogPath"] = "../outside.jsonl"
  _write_json(manifest, payload)
  with pytest.raises(SnapshotValidationError, match="relative to data/auradin"):
    validate_snapshot_manifest(manifest, data_root=repo_root / "data/auradin")


def test_active_pointer_resolution_and_production_override_guard(
  tmp_path: Path,
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  repo_root, manifest = _snapshot_fixture(tmp_path)
  monkeypatch.setenv("AURADIN_DATA_ROOT", str(repo_root))
  reset_snapshot_cache()

  descriptor = resolve_and_validate_snapshot(Settings(environment="test"), force=True)

  assert descriptor.source == "active_pointer"
  assert descriptor.manifest_path == manifest

  with pytest.raises(SnapshotValidationError, match="active_snapshot.json"):
    resolve_and_validate_snapshot(
      Settings(environment="production", auradin_snapshot_manifest=str(manifest)),
      force=True,
    )


def test_missing_pointer_regenerates_only_with_explicit_dev_opt_in(
  tmp_path: Path,
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  repo_root = tmp_path / "repo"
  seed = repo_root / "data/auradin/catalog/catalog_items_seed_20260715.jsonl"
  _write_jsonl(
    seed,
    [
      {
        "sourceCandidateId": "seed-1",
        "brandName": "롬앤",
        "productName": "롬앤 글로시 핑크 립",
        "category": "lip",
        "attributes": {},
        "liveOffer": {
          "priceKrw": 12000,
          "purchaseUrl": "https://example.test/buy",
          "imageUrl": "https://example.test/image.jpg",
        },
      },
    ],
  )
  monkeypatch.setenv("AURADIN_DATA_ROOT", str(repo_root))
  monkeypatch.setenv("AURADIN_RUN_DATE", "20260715")
  reset_snapshot_cache()

  with pytest.raises(SnapshotValidationError, match="active snapshot pointer"):
    resolve_and_validate_snapshot(Settings(environment="test"), force=True)

  descriptor = resolve_and_validate_snapshot(
    Settings(
      environment="test",
      auradin_snapshot_dev_regeneration=True,
      embedding_dimension=16,
    ),
    force=True,
  )

  assert descriptor.source == "dev_regenerated"
  assert descriptor.catalog_count == 1
  assert descriptor.chunk_count == descriptor.vector_count


def test_production_rejects_legacy_selection_and_runtime_autobuild(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  monkeypatch.setenv("AURADIN_RUN_DATE", "20260708")
  reset_snapshot_cache()

  with pytest.raises(SnapshotValidationError, match="legacy snapshot overrides"):
    resolve_and_validate_snapshot(Settings(environment="production"), force=True)

  monkeypatch.delenv("AURADIN_RUN_DATE")
  with pytest.raises(SnapshotValidationError, match="path override"):
    resolve_and_validate_snapshot(
      Settings(environment="production", auradin_vector_index_path="/tmp/index.json"),
      force=True,
    )

  with pytest.raises(SnapshotValidationError, match="autobuild"):
    resolve_and_validate_snapshot(
      Settings(environment="production", auradin_vector_index_autobuild=True),
      force=True,
    )


def test_activation_requires_complete_preflight_and_uses_pointer_cas(
  tmp_path: Path,
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  repo_root, manifest = _snapshot_fixture(tmp_path)
  monkeypatch.setenv("AURADIN_DATA_ROOT", str(repo_root))
  monkeypatch.setattr(promotion, "validate_a8_quality", lambda _path: {})
  evidence = _approval_evidence(tmp_path / "approval.json", _sha(manifest))
  evidence_sha = _sha(evidence)

  with pytest.raises(SnapshotValidationError, match="preflight"):
    promotion.activate_snapshot(
      manifest_path=manifest,
      approved_manifest_sha=None,
      approval_evidence_path=None,
      approval_evidence_sha=None,
      expected_active_manifest_sha=_sha(manifest),
      worker_count=None,
      artifact_filesystem_mode=None,
      restart_mechanism=None,
      active_pointer_persistence=None,
    )

  activated = promotion.activate_snapshot(
    manifest_path=manifest,
    approved_manifest_sha=_sha(manifest),
    approval_evidence_path=evidence,
    approval_evidence_sha=evidence_sha,
    expected_active_manifest_sha=_sha(manifest),
    worker_count=1,
    artifact_filesystem_mode="mutable_shared",
    restart_mechanism="test_restart",
    active_pointer_persistence="persistent_shared",
  )
  assert activated["mode"] == "activated"

  with pytest.raises(SnapshotValidationError, match="CAS conflict"):
    promotion.activate_snapshot(
      manifest_path=manifest,
      approved_manifest_sha=_sha(manifest),
      approval_evidence_path=evidence,
      approval_evidence_sha=evidence_sha,
      expected_active_manifest_sha="0" * 64,
      worker_count=1,
      artifact_filesystem_mode="mutable_shared",
      restart_mechanism="test_restart",
      active_pointer_persistence="persistent_shared",
    )


@pytest.mark.parametrize(
  ("overrides", "message"),
  [
    ({"snapshotManifestSha256": "0" * 64}, "manifest SHA"),
    ({"golden": {"status": "FAIL", "passed": 5, "total": 6}}, "golden"),
    ({"a8": {"status": "FAIL"}}, "A8"),
    ({"coverageClassification": {}}, "coverageClassification"),
    ({"approvedBy": ""}, "approvedBy"),
    ({"approvalConclusion": "pending"}, "conclusion"),
  ],
)
def test_approval_evidence_rejects_incomplete_or_failed_gates(
  tmp_path: Path,
  overrides: dict,
  message: str,
) -> None:
  manifest_sha = "a" * 64
  evidence = _approval_evidence(tmp_path / "approval.json", manifest_sha, **overrides)

  with pytest.raises(SnapshotValidationError, match=message):
    promotion.validate_approval_evidence(
      evidence,
      expected_evidence_sha256=_sha(evidence),
      expected_manifest_sha256=manifest_sha,
    )


def test_approval_evidence_requires_exact_file_sha(tmp_path: Path) -> None:
  manifest_sha = "a" * 64
  evidence = _approval_evidence(tmp_path / "approval.json", manifest_sha)

  with pytest.raises(SnapshotValidationError, match="evidence SHA"):
    promotion.validate_approval_evidence(
      evidence,
      expected_evidence_sha256="0" * 64,
      expected_manifest_sha256=manifest_sha,
    )


@pytest.mark.parametrize(
  ("field", "bad_value", "message"),
  [
    ("runDate", "20260716", "runDate"),
    ("seedPath", "data/auradin/catalog/other_seed.jsonl", "seedPath"),
    ("seedSha256", "0" * 64, "seedSha256"),
    ("catalogPath", "data/auradin/elsewhere.jsonl", "catalogPath"),
    ("chunksPath", "data/auradin/elsewhere.jsonl", "chunksPath"),
    ("catalogCount", 2, "catalogCount"),
    ("chunkCount", 2, "chunkCount"),
  ],
)
def test_prepare_rejects_preprocessing_sidecar_drift(
  tmp_path: Path,
  monkeypatch: pytest.MonkeyPatch,
  field: str,
  bad_value: object,
  message: str,
) -> None:
  _, staging, seed = _staging_fixture(tmp_path, monkeypatch)
  sidecar = staging / ".auradin_preprocessing.json"
  payload = json.loads(sidecar.read_text(encoding="utf-8"))
  payload[field] = bad_value
  _write_json(sidecar, payload)

  with pytest.raises(SnapshotValidationError, match=message):
    promotion.prepare_snapshot(staging_root=staging, run_date="20260715", seed_path=seed)


def test_prepare_resumes_after_one_immutable_artifact_was_moved(
  tmp_path: Path,
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  repo_root, staging, seed = _staging_fixture(tmp_path, monkeypatch)
  original_move = promotion._move_immutable
  calls = 0

  def interrupt_after_first_move(source: Path, target: Path, *, expected_sha256: str) -> None:
    nonlocal calls
    original_move(source, target, expected_sha256=expected_sha256)
    calls += 1
    if calls == 1:
      raise RuntimeError("simulated interruption")

  monkeypatch.setattr(promotion, "_move_immutable", interrupt_after_first_move)
  with pytest.raises(RuntimeError, match="simulated interruption"):
    promotion.prepare_snapshot(staging_root=staging, run_date="20260715", seed_path=seed)

  assert not (staging / "catalog/catalog_items_mvp_20260715.jsonl").exists()
  assert (repo_root / "data/auradin/catalog/catalog_items_mvp_20260715.jsonl").is_file()

  monkeypatch.setattr(promotion, "_move_immutable", original_move)
  result = promotion.prepare_snapshot(staging_root=staging, run_date="20260715", seed_path=seed)

  assert result["mode"] == "prepare_only"
  assert (repo_root / "data/auradin/manifests/snapshot_20260715.json").is_file()


def test_prepare_reuses_an_identical_completed_snapshot(
  tmp_path: Path,
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  _, staging, seed = _staging_fixture(tmp_path, monkeypatch)

  first = promotion.prepare_snapshot(staging_root=staging, run_date="20260715", seed_path=seed)
  second = promotion.prepare_snapshot(staging_root=staging, run_date="20260715", seed_path=seed)

  assert first["mode"] == "prepare_only"
  assert second["mode"] == "prepare_reused"
  assert second["snapshotManifestSha256"] == first["snapshotManifestSha256"]
