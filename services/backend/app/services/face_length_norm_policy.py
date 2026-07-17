from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path
import re
from typing import Any, Literal

from app.core.settings import Settings


FACE_LENGTH_NORM_STATUS_SCHEMA_VERSION = "aura.face-length-norm-status.v1"
FACE_LENGTH_NORM_CANDIDATE_SCHEMA_VERSION = "aura.face-length-norm-candidate.v1"
FACE_LENGTH_NORM_APPROVAL_SCHEMA_VERSION = "aura.face-length-norm-approval.v1"

_HEX_64 = re.compile(r"^[0-9a-f]{64}$")
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$")
_SAFE_REVIEWER_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$")
_LOCALE_CODE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$")
_PROHIBITED_STRING_VALUE = re.compile(
  r"^[A-Za-z][A-Za-z0-9+.-]*:",
  re.IGNORECASE,
)
_PROHIBITED_FACE_DATA_KEY = re.compile(
  r"(?:^|_)(?:image|photo|landmark|landmarks|keypoint|keypoints|mesh|vertex|vertices|"
  r"raw_frame|raw_face|embedding|embeddings|biometric|biometrics|vector|vectors|"
  r"coordinate|coordinates|descriptor|descriptors|template|templates)(?:$|_)",
)

_REGISTRY_KEYS = {
  "schemaVersion",
  "status",
  "featureFlagDefault",
  "activeModel",
  "approval",
}
_ARTIFACT_REFERENCE_KEYS = {"artifactPath", "artifactSha256"}
_MODEL_KEYS = {
  "schemaVersion",
  "status",
  "activationEligible",
  "featureFlagDefault",
  "rawFaceDataIncluded",
  "evidenceProvenance",
  "productHistoryIncluded",
  "evidenceAttestationSha256",
  "locale",
  "localeSelectionSource",
  "measurementContractId",
  "datasetManifestSha256",
  "estimatorSourceSha256",
  "subjectCount",
  "captureCount",
  "statisticsUnit",
  "mean",
  "sampleStandardDeviation",
}
_APPROVAL_KEYS = {
  "schemaVersion",
  "decision",
  "locale",
  "localeSelectionSource",
  "measurementContractId",
  "modelArtifactSha256",
  "datasetManifestSha256",
  "estimatorSourceSha256",
  "evidenceAttestationSha256",
  "reviewer",
  "reviewedAtUtc",
}


NormPolicyStatus = Literal["disabled", "unavailable", "active"]


@dataclass(frozen=True)
class FaceLengthNormResolution:
  status: NormPolicyStatus
  reason: str
  locale: str | None = None
  measurement_contract_id: str | None = None
  mean: float | None = None
  sample_standard_deviation: float | None = None

  def public_projection(self) -> dict[str, str]:
    # Product API intentionally exposes no mean, SD, percentile, or bands.
    return {"status": self.status, "reason": self.reason}


@dataclass(frozen=True)
class _JsonArtifact:
  payload: dict[str, Any]
  sha256: str


def _record(value: Any) -> dict[str, Any]:
  return value if isinstance(value, dict) else {}


def _non_empty_text(value: Any) -> str | None:
  if not isinstance(value, str):
    return None
  normalized = value.strip()
  return normalized or None


def _finite(value: Any) -> float | None:
  if isinstance(value, bool) or not isinstance(value, (int, float)):
    return None
  number = float(value)
  return number if math.isfinite(number) else None


def _valid_utc(value: Any) -> bool:
  normalized = _non_empty_text(value)
  if normalized is None or not normalized.endswith("Z"):
    return False
  try:
    parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
  except ValueError:
    return False
  return parsed.tzinfo is not None


def _read_json_artifact(path: Path) -> _JsonArtifact | None:
  """Read once so the digest and decoded JSON bind to identical bytes."""

  try:
    raw = path.read_bytes()
    decoded = json.loads(raw.decode("utf-8"))
  except (OSError, UnicodeError, json.JSONDecodeError):
    return None
  if not isinstance(decoded, dict):
    return None
  return _JsonArtifact(
    payload=decoded,
    sha256=hashlib.sha256(raw).hexdigest(),
  )


def _resolve_bundle_file(registry_path: Path, relative_path: Any) -> Path | None:
  relative = _non_empty_text(relative_path)
  if relative is None:
    return None
  candidate = Path(relative)
  if candidate.is_absolute():
    return None
  bundle_root = registry_path.parent.resolve()
  try:
    resolved = (bundle_root / candidate).resolve(strict=True)
  except OSError:
    return None
  try:
    resolved.relative_to(bundle_root)
  except ValueError:
    return None
  return resolved if resolved.is_file() else None


def _contains_prohibited_face_data(value: Any) -> bool:
  if isinstance(value, dict):
    for key, item in value.items():
      normalized_key = re.sub(r"(?<!^)(?=[A-Z])", "_", str(key)).lower()
      if normalized_key == "raw_face_data_included" and item is False:
        continue
      if _PROHIBITED_FACE_DATA_KEY.search(normalized_key):
        return True
      if _contains_prohibited_face_data(item):
        return True
  elif isinstance(value, list):
    return any(_contains_prohibited_face_data(item) for item in value)
  elif isinstance(value, str):
    return _PROHIBITED_STRING_VALUE.match(value.strip()) is not None
  return False


def _has_exact_keys(
  value: dict[str, Any],
  required: set[str],
  *,
  optional: set[str] | None = None,
) -> bool:
  keys = set(value)
  allowed = required | (optional or set())
  return required <= keys and keys <= allowed


def _safe_identifier(value: Any) -> str | None:
  normalized = _non_empty_text(value)
  if normalized is None or not _SAFE_ID.fullmatch(normalized):
    return None
  return normalized


def _safe_reviewer_identifier(value: Any) -> str | None:
  normalized = _non_empty_text(value)
  if normalized is None or not _SAFE_REVIEWER_ID.fullmatch(normalized):
    return None
  return normalized


def _safe_locale(value: Any) -> str | None:
  normalized = _non_empty_text(value)
  if normalized is None or not _LOCALE_CODE.fullmatch(normalized):
    return None
  return normalized


def _unavailable(reason: str) -> FaceLengthNormResolution:
  return FaceLengthNormResolution(status="unavailable", reason=reason)


def resolve_face_length_norm(
  settings: Settings,
  *,
  self_selected_locale: str | None,
  locale_selection_source: str,
  measurement_contract_id: str | None,
) -> FaceLengthNormResolution:
  if not settings.face_length_norm_enabled:
    return FaceLengthNormResolution(status="disabled", reason="feature_flag_off")
  locale = _safe_locale(self_selected_locale)
  if locale_selection_source != "self_selected" or locale is None:
    return _unavailable("self_selected_locale_required")
  contract_id = _safe_identifier(measurement_contract_id)
  if contract_id is None:
    return _unavailable("measurement_contract_required")

  registry_setting = _non_empty_text(settings.face_length_norm_registry_path)
  expected_approval_sha = _non_empty_text(
    settings.face_length_norm_approval_artifact_sha256,
  )
  if registry_setting is None or expected_approval_sha is None:
    return _unavailable("activation_configuration_incomplete")
  try:
    registry_path = Path(registry_setting).expanduser().resolve(strict=True)
  except OSError:
    return _unavailable("registry_missing")
  if not registry_path.is_file():
    return _unavailable("registry_missing")
  registry_artifact = _read_json_artifact(registry_path)
  registry = registry_artifact.payload if registry_artifact is not None else None
  if registry is not None and _contains_prohibited_face_data(registry):
    return _unavailable("raw_face_data_prohibited")
  if (
    registry is None
    or registry.get("schemaVersion") != FACE_LENGTH_NORM_STATUS_SCHEMA_VERSION
    or registry.get("status") != "approved"
  ):
    return _unavailable("registry_not_approved")
  if (
    not _has_exact_keys(registry, _REGISTRY_KEYS)
    or registry.get("featureFlagDefault") != "off"
  ):
    return _unavailable("registry_contract_invalid")

  active_model = _record(registry.get("activeModel"))
  approval_ref = _record(registry.get("approval"))
  if (
    not _has_exact_keys(active_model, _ARTIFACT_REFERENCE_KEYS)
    or not _has_exact_keys(approval_ref, _ARTIFACT_REFERENCE_KEYS)
  ):
    return _unavailable("artifact_reference_invalid")
  model_path = _resolve_bundle_file(registry_path, active_model.get("artifactPath"))
  approval_path = _resolve_bundle_file(registry_path, approval_ref.get("artifactPath"))
  model_sha = _non_empty_text(active_model.get("artifactSha256"))
  approval_sha = _non_empty_text(approval_ref.get("artifactSha256"))
  if (
    model_path is None
    or approval_path is None
    or model_sha is None
    or approval_sha is None
    or not _HEX_64.fullmatch(model_sha)
    or not _HEX_64.fullmatch(approval_sha)
  ):
    return _unavailable("artifact_reference_invalid")
  model_artifact = _read_json_artifact(model_path)
  approval_artifact = _read_json_artifact(approval_path)
  if model_artifact is None or approval_artifact is None:
    return _unavailable("artifact_json_invalid")
  if model_artifact.sha256 != model_sha:
    return _unavailable("model_sha_mismatch")
  if approval_artifact.sha256 != approval_sha or approval_sha != expected_approval_sha:
    return _unavailable("approval_sha_mismatch")

  model = model_artifact.payload
  approval = approval_artifact.payload
  if _contains_prohibited_face_data(model) or _contains_prohibited_face_data(approval):
    return _unavailable("raw_face_data_prohibited")
  if (
    not _has_exact_keys(model, _MODEL_KEYS)
    or model.get("schemaVersion") != FACE_LENGTH_NORM_CANDIDATE_SCHEMA_VERSION
    or model.get("status") != "candidate_flag_off"
    or model.get("activationEligible") is not False
    or model.get("featureFlagDefault") != "off"
    or model.get("rawFaceDataIncluded") is not False
    or model.get("evidenceProvenance") != "approved_attested_collection"
    or model.get("productHistoryIncluded") is not False
    or model.get("localeSelectionSource") != "self_selected"
  ):
    return _unavailable("model_contract_invalid")
  model_locale = _safe_locale(model.get("locale"))
  model_contract = _safe_identifier(model.get("measurementContractId"))
  mean = _finite(model.get("mean"))
  sample_sd = _finite(model.get("sampleStandardDeviation"))
  dataset_sha = _non_empty_text(model.get("datasetManifestSha256"))
  estimator_sha = _non_empty_text(model.get("estimatorSourceSha256"))
  evidence_attestation_sha = _non_empty_text(
    model.get("evidenceAttestationSha256"),
  )
  subject_count = model.get("subjectCount")
  capture_count = model.get("captureCount")
  if (
    model_locale != locale
    or model_contract != contract_id
    or mean is None
    or mean <= 0
    or sample_sd is None
    or sample_sd <= 0
    or dataset_sha is None
    or estimator_sha is None
    or not _HEX_64.fullmatch(dataset_sha)
    or not _HEX_64.fullmatch(estimator_sha)
    or evidence_attestation_sha is None
    or not _HEX_64.fullmatch(evidence_attestation_sha)
    or isinstance(subject_count, bool)
    or not isinstance(subject_count, int)
    or subject_count < 2
    or isinstance(capture_count, bool)
    or not isinstance(capture_count, int)
    or capture_count != subject_count
    or model.get("statisticsUnit") != "one_subject_one_sample"
  ):
    return _unavailable("model_scope_or_provenance_mismatch")

  if (
    not _has_exact_keys(approval, _APPROVAL_KEYS)
    or approval.get("schemaVersion") != FACE_LENGTH_NORM_APPROVAL_SCHEMA_VERSION
    or approval.get("decision") != "approved"
    or approval.get("localeSelectionSource") != "self_selected"
    or approval.get("locale") != model_locale
    or approval.get("measurementContractId") != model_contract
    or approval.get("modelArtifactSha256") != model_sha
    or approval.get("datasetManifestSha256") != dataset_sha
    or approval.get("estimatorSourceSha256") != estimator_sha
    or approval.get("evidenceAttestationSha256")
    != evidence_attestation_sha
    or _safe_reviewer_identifier(approval.get("reviewer")) is None
    or not _valid_utc(approval.get("reviewedAtUtc"))
  ):
    return _unavailable("approval_binding_invalid")

  return FaceLengthNormResolution(
    status="active",
    reason="approved_artifacts_verified",
    locale=model_locale,
    measurement_contract_id=model_contract,
    mean=mean,
    sample_standard_deviation=sample_sd,
  )


def public_face_length_norm_policy(
  settings: Settings,
  *,
  self_selected_locale: str | None,
  locale_selection_source: str,
) -> dict[str, str]:
  # A report-specific measurement contract is required before any model can be
  # resolved. The preferences API therefore exposes only the safe readiness
  # state, never a population statistic or classification.
  return resolve_face_length_norm(
    settings,
    self_selected_locale=self_selected_locale,
    locale_selection_source=locale_selection_source,
    measurement_contract_id=None,
  ).public_projection()
