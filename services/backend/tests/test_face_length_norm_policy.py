import hashlib
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.settings import Settings
from app.services.face_length_norm_policy import (
  FACE_LENGTH_NORM_APPROVAL_SCHEMA_VERSION,
  FACE_LENGTH_NORM_CANDIDATE_SCHEMA_VERSION,
  FACE_LENGTH_NORM_STATUS_SCHEMA_VERSION,
  _contains_prohibited_face_data,
  public_face_length_norm_policy,
  resolve_face_length_norm,
)


SHA_A = "a" * 64
SHA_B = "b" * 64


def write_json(path: Path, value: dict) -> str:
  payload = json.dumps(value, indent=2, sort_keys=True).encode("utf-8") + b"\n"
  path.write_bytes(payload)
  return hashlib.sha256(payload).hexdigest()


def build_synthetic_approved_bundle(tmp_path: Path) -> tuple[Path, str]:
  model = {
    "schemaVersion": FACE_LENGTH_NORM_CANDIDATE_SCHEMA_VERSION,
    "status": "candidate_flag_off",
    "activationEligible": False,
    "featureFlagDefault": "off",
    "rawFaceDataIncluded": False,
    "evidenceProvenance": "approved_attested_collection",
    "productHistoryIncluded": False,
    "evidenceAttestationSha256": SHA_A,
    "locale": "synthetic-AA",
    "localeSelectionSource": "self_selected",
    "measurementContractId": "synthetic-face-length/v1",
    "datasetManifestSha256": SHA_A,
    "estimatorSourceSha256": SHA_B,
    "subjectCount": 2,
    "captureCount": 2,
    "statisticsUnit": "one_subject_one_sample",
    "mean": 1.5,
    "sampleStandardDeviation": 0.1,
  }
  model_path = tmp_path / "candidate.json"
  model_sha = write_json(model_path, model)
  approval = {
    "schemaVersion": FACE_LENGTH_NORM_APPROVAL_SCHEMA_VERSION,
    "decision": "approved",
    "locale": model["locale"],
    "localeSelectionSource": "self_selected",
    "measurementContractId": model["measurementContractId"],
    "modelArtifactSha256": model_sha,
    "datasetManifestSha256": model["datasetManifestSha256"],
    "estimatorSourceSha256": model["estimatorSourceSha256"],
    "evidenceAttestationSha256": model["evidenceAttestationSha256"],
    "reviewer": "reviewer_synthetic",
    "reviewedAtUtc": "2026-07-17T01:00:00Z",
  }
  approval_path = tmp_path / "approval.json"
  approval_sha = write_json(approval_path, approval)
  registry = {
    "schemaVersion": FACE_LENGTH_NORM_STATUS_SCHEMA_VERSION,
    "status": "approved",
    "featureFlagDefault": "off",
    "activeModel": {
      "artifactPath": model_path.name,
      "artifactSha256": model_sha,
    },
    "approval": {
      "artifactPath": approval_path.name,
      "artifactSha256": approval_sha,
    },
  }
  registry_path = tmp_path / "status.json"
  write_json(registry_path, registry)
  return registry_path, approval_sha


def test_norm_flag_is_off_and_public_projection_contains_no_population_values() -> None:
  settings = Settings(_env_file=None)
  assert settings.face_length_norm_enabled is False

  resolution = resolve_face_length_norm(
    settings,
    self_selected_locale="synthetic-AA",
    locale_selection_source="self_selected",
    measurement_contract_id="synthetic-face-length/v1",
  )
  assert resolution.status == "disabled"
  assert resolution.reason == "feature_flag_off"
  projection = resolution.public_projection()
  assert projection == {"status": "disabled", "reason": "feature_flag_off"}
  assert "mean" not in projection
  assert "sampleStandardDeviation" not in projection


def test_raw_face_sentinel_allows_only_exact_false_and_rejects_raw_payload_keys() -> None:
  assert _contains_prohibited_face_data({"rawFaceDataIncluded": False}) is False
  assert _contains_prohibited_face_data({"rawFaceDataIncluded": True}) is True
  assert _contains_prohibited_face_data({"rawFaceVector": [0.1, 0.2]}) is True
  assert _contains_prohibited_face_data({"faceImageUri": "file:///raw.jpg"}) is True
  assert _contains_prohibited_face_data({"faceEmbedding": [0.1, 0.2]}) is True
  assert _contains_prohibited_face_data({"biometricVector": [0.1, 0.2]}) is True
  assert _contains_prohibited_face_data({"coordinates": [{"x": 1}]}) is True
  assert _contains_prohibited_face_data({"note": "data:image/jpeg;base64,AAAA"}) is True
  assert _contains_prohibited_face_data({"reviewer": "s3://private/raw-face.jpg"}) is True
  assert _contains_prohibited_face_data({"reviewer": "gs://private/raw-face.jpg"}) is True
  assert _contains_prohibited_face_data({"reviewer": "blob:private-raw-face"}) is True
  assert _contains_prohibited_face_data({"reviewer": "custom+raw:face-data"}) is True


def test_enabling_norm_requires_registry_and_approval_sha() -> None:
  with pytest.raises(ValidationError, match="REGISTRY_PATH"):
    Settings(
      _env_file=None,
      face_length_norm_enabled=True,
      face_length_norm_approval_artifact_sha256=SHA_A,
    )
  with pytest.raises(ValidationError, match="APPROVAL_ARTIFACT_SHA256"):
    Settings(
      _env_file=None,
      face_length_norm_enabled=True,
      face_length_norm_registry_path="/tmp/missing-status.json",
    )


def test_pending_registry_cannot_activate_even_when_flag_is_true(tmp_path: Path) -> None:
  registry_path = tmp_path / "pending.json"
  write_json(registry_path, {
    "schemaVersion": FACE_LENGTH_NORM_STATUS_SCHEMA_VERSION,
    "status": "pending",
    "featureFlagDefault": "off",
    "activeModel": None,
    "approval": None,
  })
  settings = Settings(
    _env_file=None,
    face_length_norm_enabled=True,
    face_length_norm_registry_path=str(registry_path),
    face_length_norm_approval_artifact_sha256=SHA_A,
  )

  resolution = resolve_face_length_norm(
    settings,
    self_selected_locale="synthetic-AA",
    locale_selection_source="self_selected",
    measurement_contract_id="synthetic-face-length/v1",
  )

  assert resolution.status == "unavailable"
  assert resolution.reason == "registry_not_approved"


def test_synthetic_approved_bundle_requires_exact_self_selected_locale_contract_and_hashes(
  tmp_path: Path,
) -> None:
  registry_path, approval_sha = build_synthetic_approved_bundle(tmp_path)
  settings = Settings(
    _env_file=None,
    face_length_norm_enabled=True,
    face_length_norm_registry_path=str(registry_path),
    face_length_norm_approval_artifact_sha256=approval_sha,
  )

  active = resolve_face_length_norm(
    settings,
    self_selected_locale="synthetic-AA",
    locale_selection_source="self_selected",
    measurement_contract_id="synthetic-face-length/v1",
  )
  assert active.status == "active"
  assert active.mean == 1.5
  assert active.sample_standard_deviation == 0.1
  assert active.public_projection() == {
    "status": "active",
    "reason": "approved_artifacts_verified",
  }

  inferred = resolve_face_length_norm(
    settings,
    self_selected_locale="synthetic-AA",
    locale_selection_source="device_inferred",
    measurement_contract_id="synthetic-face-length/v1",
  )
  assert inferred.reason == "self_selected_locale_required"

  wrong_locale = resolve_face_length_norm(
    settings,
    self_selected_locale="synthetic-BB",
    locale_selection_source="self_selected",
    measurement_contract_id="synthetic-face-length/v1",
  )
  assert wrong_locale.reason == "model_scope_or_provenance_mismatch"

  wrong_contract = resolve_face_length_norm(
    settings,
    self_selected_locale="synthetic-AA",
    locale_selection_source="self_selected",
    measurement_contract_id="synthetic-face-length/v2",
  )
  assert wrong_contract.reason == "model_scope_or_provenance_mismatch"

  wrong_sha_settings = Settings(
    _env_file=None,
    face_length_norm_enabled=True,
    face_length_norm_registry_path=str(registry_path),
    face_length_norm_approval_artifact_sha256=SHA_A,
  )
  wrong_sha = resolve_face_length_norm(
    wrong_sha_settings,
    self_selected_locale="synthetic-AA",
    locale_selection_source="self_selected",
    measurement_contract_id="synthetic-face-length/v1",
  )
  assert wrong_sha.reason == "approval_sha_mismatch"


def test_product_history_provenance_cannot_activate_even_with_rebound_hashes(
  tmp_path: Path,
) -> None:
  registry_path, _ = build_synthetic_approved_bundle(tmp_path)
  registry = json.loads(registry_path.read_text(encoding="utf-8"))
  model_path = tmp_path / registry["activeModel"]["artifactPath"]
  model = json.loads(model_path.read_text(encoding="utf-8"))
  model["evidenceProvenance"] = "client_observed_unverified"
  model["productHistoryIncluded"] = True
  model.pop("evidenceAttestationSha256")
  model_sha = write_json(model_path, model)
  registry["activeModel"]["artifactSha256"] = model_sha

  approval_path = tmp_path / registry["approval"]["artifactPath"]
  approval = json.loads(approval_path.read_text(encoding="utf-8"))
  approval["modelArtifactSha256"] = model_sha
  approval.pop("evidenceAttestationSha256")
  approval_sha = write_json(approval_path, approval)
  registry["approval"]["artifactSha256"] = approval_sha
  write_json(registry_path, registry)
  settings = Settings(
    _env_file=None,
    face_length_norm_enabled=True,
    face_length_norm_registry_path=str(registry_path),
    face_length_norm_approval_artifact_sha256=approval_sha,
  )

  resolution = resolve_face_length_norm(
    settings,
    self_selected_locale="synthetic-AA",
    locale_selection_source="self_selected",
    measurement_contract_id="synthetic-face-length/v1",
  )

  assert resolution.status == "unavailable"
  assert resolution.reason == "model_contract_invalid"


def test_norm_resolver_hashes_and_parses_each_artifact_from_one_read(
  tmp_path: Path,
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  registry_path, approval_sha = build_synthetic_approved_bundle(tmp_path)
  registry = json.loads(registry_path.read_text(encoding="utf-8"))
  model_path = tmp_path / registry["activeModel"]["artifactPath"]
  approval_path = tmp_path / registry["approval"]["artifactPath"]
  expected_paths = {registry_path.resolve(), model_path.resolve(), approval_path.resolve()}
  reads: dict[Path, int] = {}
  original_read_bytes = Path.read_bytes

  def counted_read_bytes(path: Path) -> bytes:
    resolved = path.resolve()
    reads[resolved] = reads.get(resolved, 0) + 1
    return original_read_bytes(path)

  monkeypatch.setattr(Path, "read_bytes", counted_read_bytes)
  resolution = resolve_face_length_norm(
    Settings(
      _env_file=None,
      face_length_norm_enabled=True,
      face_length_norm_registry_path=str(registry_path),
      face_length_norm_approval_artifact_sha256=approval_sha,
    ),
    self_selected_locale="synthetic-AA",
    locale_selection_source="self_selected",
    measurement_contract_id="synthetic-face-length/v1",
  )

  assert resolution.status == "active"
  assert reads == {path: 1 for path in expected_paths}


def test_approved_registry_rejects_unknown_or_biometric_fields(tmp_path: Path) -> None:
  registry_path, approval_sha = build_synthetic_approved_bundle(tmp_path)
  registry = json.loads(registry_path.read_text(encoding="utf-8"))
  registry["unexpected"] = "not allowlisted"
  write_json(registry_path, registry)
  settings = Settings(
    _env_file=None,
    face_length_norm_enabled=True,
    face_length_norm_registry_path=str(registry_path),
    face_length_norm_approval_artifact_sha256=approval_sha,
  )

  unknown = resolve_face_length_norm(
    settings,
    self_selected_locale="synthetic-AA",
    locale_selection_source="self_selected",
    measurement_contract_id="synthetic-face-length/v1",
  )
  assert unknown.reason == "registry_contract_invalid"

  registry.pop("unexpected")
  registry["faceEmbedding"] = [0.1, 0.2]
  write_json(registry_path, registry)
  biometric = resolve_face_length_norm(
    settings,
    self_selected_locale="synthetic-AA",
    locale_selection_source="self_selected",
    measurement_contract_id="synthetic-face-length/v1",
  )
  assert biometric.reason == "raw_face_data_prohibited"


def test_approved_bundle_rejects_raw_data_hidden_in_allowed_string_field(
  tmp_path: Path,
) -> None:
  registry_path, _ = build_synthetic_approved_bundle(tmp_path)
  registry = json.loads(registry_path.read_text(encoding="utf-8"))
  approval_path = tmp_path / registry["approval"]["artifactPath"]
  approval = json.loads(approval_path.read_text(encoding="utf-8"))
  approval["reviewer"] = "data:image/jpeg;base64,AAAA"
  approval_sha = write_json(approval_path, approval)
  registry["approval"]["artifactSha256"] = approval_sha
  write_json(registry_path, registry)
  settings = Settings(
    _env_file=None,
    face_length_norm_enabled=True,
    face_length_norm_registry_path=str(registry_path),
    face_length_norm_approval_artifact_sha256=approval_sha,
  )

  resolution = resolve_face_length_norm(
    settings,
    self_selected_locale="synthetic-AA",
    locale_selection_source="self_selected",
    measurement_contract_id="synthetic-face-length/v1",
  )

  assert resolution.reason == "raw_face_data_prohibited"


@pytest.mark.parametrize(
  "reviewer",
  (
    "s3://private/raw-face.jpg",
    "gs://private/raw-face.jpg",
    "blob:private-raw-face",
    "custom+raw:face-data",
  ),
)
def test_approved_bundle_rejects_any_uri_scheme_hidden_in_reviewer(
  tmp_path: Path,
  reviewer: str,
) -> None:
  registry_path, _ = build_synthetic_approved_bundle(tmp_path)
  registry = json.loads(registry_path.read_text(encoding="utf-8"))
  approval_path = tmp_path / registry["approval"]["artifactPath"]
  approval = json.loads(approval_path.read_text(encoding="utf-8"))
  approval["reviewer"] = reviewer
  approval_sha = write_json(approval_path, approval)
  registry["approval"]["artifactSha256"] = approval_sha
  write_json(registry_path, registry)
  settings = Settings(
    _env_file=None,
    face_length_norm_enabled=True,
    face_length_norm_registry_path=str(registry_path),
    face_length_norm_approval_artifact_sha256=approval_sha,
  )

  resolution = resolve_face_length_norm(
    settings,
    self_selected_locale="synthetic-AA",
    locale_selection_source="self_selected",
    measurement_contract_id="synthetic-face-length/v1",
  )

  assert resolution.reason == "raw_face_data_prohibited"


def test_public_preferences_policy_never_resolves_without_report_contract(tmp_path: Path) -> None:
  registry_path, approval_sha = build_synthetic_approved_bundle(tmp_path)
  settings = Settings(
    _env_file=None,
    face_length_norm_enabled=True,
    face_length_norm_registry_path=str(registry_path),
    face_length_norm_approval_artifact_sha256=approval_sha,
  )

  policy = public_face_length_norm_policy(
    settings,
    self_selected_locale="synthetic-AA",
    locale_selection_source="self_selected",
  )

  assert policy == {
    "status": "unavailable",
    "reason": "measurement_contract_required",
  }
