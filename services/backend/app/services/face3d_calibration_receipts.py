from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import json
import math
import re
from typing import Any

from app.core.settings import Settings
from app.db.session import Database


FACE3D_PRODUCT_POLICY_GATES = {
  "unified-micro-burst-5of8-v1": "face3d-gate-v2",
}
FACE3D_PRODUCT_POLICY_TUPLES = {
  "unified-micro-burst-5of8-v1": {
    "aggregation": "median_mad",
    "maximumCaptureWindowMs": 500.0,
    "minimumValidFrames": 5,
    "sampleMode": "micro_burst",
    "targetFrameCount": 8,
  },
}
FACE3D_REQUIRED_METRIC_KEYS = frozenset(
  {
    "centralProjectionScore",
    "chinProjection",
    "lowerLipToELine",
    "noseTipProjection",
    "upperLipToELine",
  },
)
FACE3D_RECEIPT_SIGNATURE_ALGORITHM = "hmac-sha256-v1"
FACE3D_SERVER_RECEIPT_STATUS_FIELD = "serverCalibrationReceiptStatus"
FACE3D_TRUSTED_PROFILE_SCHEMA_VERSION = "aura.face3d-profile.v3"

_HEX_64 = re.compile(r"^[0-9a-f]{64}$")
_SIGNED_RECEIPT_FIELDS = (
  "appBuild",
  "approvalArtifactSha256",
  "captureNonce",
  "collectionPolicyId",
  "expiresAtUtc",
  "gateVersion",
  "issuedAtUtc",
  "profileBindingSha256",
  "receiptId",
  "reportContextId",
  "subjectContextId",
)
_PROFILE_BINDING_EXCLUDED_FIELDS = {
  "calibrationReceipt",
  "profileBindingSha256",
  FACE3D_SERVER_RECEIPT_STATUS_FIELD,
}


@dataclass(frozen=True)
class Face3DCalibrationReceiptVerification:
  reason: str | None
  receipt: dict[str, Any] | None
  verified: bool


@dataclass(frozen=True)
class Face3DCalibrationReceiptRequestContext:
  report_context_id: str | None
  subject_context_id: str


def build_face3d_calibration_receipt_request_context(
  *,
  user_id: Any,
  photo_capture_id: Any | None,
  source_media_id: Any | None,
) -> Face3DCalibrationReceiptRequestContext:
  report_context_id: str | None = None
  if photo_capture_id is not None:
    report_context_id = f"report_photo_capture_{photo_capture_id}"
  elif source_media_id is not None:
    report_context_id = f"report_source_media_{source_media_id}"

  return Face3DCalibrationReceiptRequestContext(
    report_context_id=report_context_id,
    subject_context_id=f"subj_user_{user_id}",
  )


def _record(value: Any) -> dict[str, Any]:
  return value if isinstance(value, dict) else {}


def _non_empty_string(value: Any) -> str | None:
  if not isinstance(value, str):
    return None
  normalized = value.strip()
  return normalized or None


def _parse_utc(value: Any) -> datetime | None:
  normalized = _non_empty_string(value)
  if not normalized:
    return None
  try:
    parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
  except ValueError:
    return None
  if parsed.tzinfo is None:
    return None
  return parsed.astimezone(UTC)


def _canonical_json(value: dict[str, Any]) -> str:
  return json.dumps(
    value,
    ensure_ascii=False,
    separators=(",", ":"),
    sort_keys=True,
  )


def _canonicalize_profile_value(value: Any) -> Any:
  if isinstance(value, dict):
    return {
      key: _canonicalize_profile_value(item)
      for key, item in value.items()
    }
  if isinstance(value, list):
    return [_canonicalize_profile_value(item) for item in value]
  if isinstance(value, bool) or value is None or isinstance(value, str):
    return value
  if isinstance(value, (int, float)):
    number = float(value)
    if not math.isfinite(number):
      raise ValueError("Face3D profile binding cannot contain non-finite numbers.")
    normalized = f"{number:.12f}".rstrip("0").rstrip(".")
    if normalized in {"", "-0"}:
      normalized = "0"
    return {"$face3dNumber": normalized}
  raise ValueError(
    f"Face3D profile binding contains unsupported value type: {type(value).__name__}",
  )


def compute_face3d_profile_binding_sha256(profile: dict[str, Any]) -> str:
  binding_payload = {
    key: value
    for key, value in profile.items()
    if key not in _PROFILE_BINDING_EXCLUDED_FIELDS
  }
  canonical_payload = _canonicalize_profile_value(binding_payload)
  return hashlib.sha256(_canonical_json(canonical_payload).encode("utf-8")).hexdigest()


def canonical_face3d_receipt_payload(receipt: dict[str, Any]) -> dict[str, str]:
  return {
    field: _non_empty_string(receipt.get(field)) or ""
    for field in _SIGNED_RECEIPT_FIELDS
  }


def _has_product_sensor_provenance(profile: dict[str, Any]) -> bool:
  provenance = _record(profile.get("sensorProvenance"))
  depth_ratio = provenance.get("depthDataObservedRatio")
  device_model = _non_empty_string(provenance.get("deviceModel"))
  return (
    provenance.get("trueDepthHardware") is True
    and provenance.get("faceTrackingSupported") is True
    and not isinstance(depth_ratio, bool)
    and isinstance(depth_ratio, (int, float))
    and math.isfinite(float(depth_ratio))
    and 0 < float(depth_ratio) <= 1
    and device_model is not None
  )


def _has_immutable_product_policy_tuple(
  profile: dict[str, Any],
  policy_id: str,
) -> bool:
  policy = FACE3D_PRODUCT_POLICY_TUPLES.get(policy_id)
  if policy is None:
    return False

  valid_frame_count = profile.get("validFrameCount")
  target_frame_count = profile.get("targetFrameCount")
  completion_ratio = profile.get("completionRatio")
  capture_window_ms = profile.get("captureWindowMs")
  if (
    profile.get("sampleMode") != policy["sampleMode"]
    or profile.get("aggregation") != policy["aggregation"]
    or isinstance(valid_frame_count, bool)
    or not isinstance(valid_frame_count, int)
    or valid_frame_count < policy["minimumValidFrames"]
    or valid_frame_count > policy["targetFrameCount"]
    or isinstance(target_frame_count, bool)
    or target_frame_count != policy["targetFrameCount"]
    or isinstance(completion_ratio, bool)
    or not isinstance(completion_ratio, (int, float))
    or not math.isfinite(float(completion_ratio))
    or abs(
      float(completion_ratio)
      - (valid_frame_count / policy["targetFrameCount"])
    ) > 1e-6
    or isinstance(capture_window_ms, bool)
    or not isinstance(capture_window_ms, (int, float))
    or not math.isfinite(float(capture_window_ms))
    or float(capture_window_ms) < 0
    or float(capture_window_ms) > policy["maximumCaptureWindowMs"]
  ):
    return False

  metrics = profile.get("metrics")
  if (
    not isinstance(metrics, dict)
    or not FACE3D_REQUIRED_METRIC_KEYS.issubset(metrics)
  ):
    return False
  for metric in metrics.values():
    if not isinstance(metric, dict):
      return False
    metric_frame_count = metric.get("validFrameCount")
    if (
      isinstance(metric_frame_count, bool)
      or not isinstance(metric_frame_count, int)
      or metric_frame_count < 0
      or metric_frame_count > valid_frame_count
    ):
      return False
    value_mm = metric.get("valueMm")
    value_mm_confidence = metric.get("valueMmConfidence")
    value_mm_frame_count = metric.get("valueMmValidFrameCount")
    value_mm_mad = metric.get("valueMmMad")
    if (
      value_mm is not None
      and (
        isinstance(value_mm, bool)
        or not isinstance(value_mm, (int, float))
        or not math.isfinite(float(value_mm))
      )
    ):
      return False
    if (
      isinstance(value_mm_confidence, bool)
      or not isinstance(value_mm_confidence, (int, float))
      or not math.isfinite(float(value_mm_confidence))
      or not 0 <= float(value_mm_confidence) <= 1
      or isinstance(value_mm_frame_count, bool)
      or not isinstance(value_mm_frame_count, int)
      or value_mm_frame_count < 0
      or value_mm_frame_count > valid_frame_count
      or isinstance(value_mm_mad, bool)
      or not isinstance(value_mm_mad, (int, float))
      or not math.isfinite(float(value_mm_mad))
      or float(value_mm_mad) < 0
      or (
        value_mm is not None
        and value_mm_frame_count < policy["minimumValidFrames"]
      )
    ):
      return False
  return True


def sign_face3d_calibration_receipt(
  receipt: dict[str, Any],
  secret: str,
) -> str:
  return hmac.new(
    secret.encode("utf-8"),
    _canonical_json(canonical_face3d_receipt_payload(receipt)).encode("utf-8"),
    hashlib.sha256,
  ).hexdigest()


def is_face3d_profile_server_verified(profile: dict[str, Any]) -> bool:
  policy_id = _non_empty_string(profile.get("collectionPolicyId"))
  gate_version = _non_empty_string(profile.get("gateVersion"))
  receipt = _record(profile.get("calibrationReceipt"))
  return (
    profile.get("schemaVersion") == FACE3D_TRUSTED_PROFILE_SCHEMA_VERSION
    and profile.get("confidenceCalibrationStatus") == "calibrated"
    and profile.get(FACE3D_SERVER_RECEIPT_STATUS_FIELD) == "verified"
    and policy_id is not None
    and not policy_id.startswith("diagnostics-")
    and FACE3D_PRODUCT_POLICY_GATES.get(policy_id) == gate_version
    and _has_immutable_product_policy_tuple(profile, policy_id)
    and receipt.get("collectionPolicyId") == policy_id
    and receipt.get("gateVersion") == gate_version
    and receipt.get("profileBindingSha256") == profile.get("profileBindingSha256")
    and receipt.get("captureNonce") == profile.get("captureNonce")
    and _has_product_sensor_provenance(profile)
  )


def verify_face3d_calibration_receipt(
  profile: dict[str, Any],
  settings: Settings,
  *,
  expected_report_context_id: str | None,
  expected_subject_context_id: str,
  now: datetime | None = None,
) -> Face3DCalibrationReceiptVerification:
  if profile.get("schemaVersion") != FACE3D_TRUSTED_PROFILE_SCHEMA_VERSION:
    return Face3DCalibrationReceiptVerification(
      reason="face3d_schema_unsupported",
      receipt=None,
      verified=False,
    )

  if profile.get("confidenceCalibrationStatus") != "calibrated":
    return Face3DCalibrationReceiptVerification(
      reason="face3d_confidence_uncalibrated",
      receipt=None,
      verified=False,
    )

  policy_id = _non_empty_string(profile.get("collectionPolicyId"))
  gate_version = _non_empty_string(profile.get("gateVersion"))
  if not policy_id or policy_id.startswith("diagnostics-"):
    return Face3DCalibrationReceiptVerification(
      reason="face3d_policy_not_product_eligible",
      receipt=None,
      verified=False,
    )
  if FACE3D_PRODUCT_POLICY_GATES.get(policy_id) != gate_version:
    return Face3DCalibrationReceiptVerification(
      reason="face3d_policy_gate_not_approved",
      receipt=None,
      verified=False,
    )

  if not _has_immutable_product_policy_tuple(profile, policy_id):
    return Face3DCalibrationReceiptVerification(
      reason="face3d_profile_policy_invalid",
      receipt=None,
      verified=False,
    )

  if not _has_product_sensor_provenance(profile):
    return Face3DCalibrationReceiptVerification(
      reason="face3d_sensor_provenance_not_product_eligible",
      receipt=None,
      verified=False,
    )

  if not settings.face3d_calibration_promotion_enabled:
    return Face3DCalibrationReceiptVerification(
      reason="face3d_calibration_promotion_disabled",
      receipt=None,
      verified=False,
    )

  expected_artifact_sha = _non_empty_string(
    settings.face3d_calibration_approval_artifact_sha256,
  )
  expected_key_id = _non_empty_string(
    settings.face3d_calibration_receipt_signing_key_id,
  )
  signing_secret = _non_empty_string(
    settings.face3d_calibration_receipt_hmac_secret,
  )
  if (
    not expected_artifact_sha
    or not _HEX_64.fullmatch(expected_artifact_sha)
    or not expected_key_id
    or not signing_secret
  ):
    return Face3DCalibrationReceiptVerification(
      reason="face3d_calibration_server_not_configured",
      receipt=None,
      verified=False,
    )

  capture_nonce = _non_empty_string(profile.get("captureNonce"))
  stored_binding = _non_empty_string(profile.get("profileBindingSha256"))
  receipt = _record(profile.get("calibrationReceipt"))
  if not capture_nonce or not stored_binding or not _HEX_64.fullmatch(stored_binding):
    return Face3DCalibrationReceiptVerification(
      reason="face3d_profile_binding_missing",
      receipt=receipt or None,
      verified=False,
    )
  if not receipt:
    return Face3DCalibrationReceiptVerification(
      reason="face3d_calibration_receipt_missing",
      receipt=None,
      verified=False,
    )

  try:
    actual_binding = compute_face3d_profile_binding_sha256(profile)
  except ValueError:
    return Face3DCalibrationReceiptVerification(
      reason="face3d_profile_binding_invalid",
      receipt=receipt,
      verified=False,
    )
  if not hmac.compare_digest(stored_binding, actual_binding):
    return Face3DCalibrationReceiptVerification(
      reason="face3d_profile_binding_mismatch",
      receipt=receipt,
      verified=False,
    )

  canonical_receipt = canonical_face3d_receipt_payload(receipt)
  if any(not value for value in canonical_receipt.values()):
    return Face3DCalibrationReceiptVerification(
      reason="face3d_calibration_receipt_incomplete",
      receipt=receipt,
      verified=False,
    )

  if (
    canonical_receipt["captureNonce"] != capture_nonce
    or canonical_receipt["profileBindingSha256"] != stored_binding
    or canonical_receipt["collectionPolicyId"] != policy_id
    or canonical_receipt["gateVersion"] != gate_version
  ):
    return Face3DCalibrationReceiptVerification(
      reason="face3d_calibration_receipt_binding_mismatch",
      receipt=receipt,
      verified=False,
    )

  if (
    expected_report_context_id is None
    or canonical_receipt["subjectContextId"] != expected_subject_context_id
    or canonical_receipt["reportContextId"] != expected_report_context_id
  ):
    return Face3DCalibrationReceiptVerification(
      reason="face3d_calibration_receipt_context_mismatch",
      receipt=receipt,
      verified=False,
    )

  if canonical_receipt["approvalArtifactSha256"] != expected_artifact_sha:
    return Face3DCalibrationReceiptVerification(
      reason="face3d_calibration_artifact_not_approved",
      receipt=receipt,
      verified=False,
    )

  if (
    receipt.get("signatureAlgorithm") != FACE3D_RECEIPT_SIGNATURE_ALGORITHM
    or receipt.get("signingKeyId") != expected_key_id
  ):
    return Face3DCalibrationReceiptVerification(
      reason="face3d_calibration_signature_key_not_approved",
      receipt=receipt,
      verified=False,
    )

  signature = _non_empty_string(receipt.get("signature"))
  if not signature or not _HEX_64.fullmatch(signature):
    return Face3DCalibrationReceiptVerification(
      reason="face3d_calibration_signature_invalid",
      receipt=receipt,
      verified=False,
    )
  expected_signature = sign_face3d_calibration_receipt(receipt, signing_secret)
  if not hmac.compare_digest(signature, expected_signature):
    return Face3DCalibrationReceiptVerification(
      reason="face3d_calibration_signature_invalid",
      receipt=receipt,
      verified=False,
    )

  issued_at = _parse_utc(receipt.get("issuedAtUtc"))
  expires_at = _parse_utc(receipt.get("expiresAtUtc"))
  current_time = (now or datetime.now(UTC)).astimezone(UTC)
  if (
    issued_at is None
    or expires_at is None
    or expires_at <= issued_at
    or issued_at > current_time + timedelta(minutes=5)
    or current_time >= expires_at
  ):
    return Face3DCalibrationReceiptVerification(
      reason="face3d_calibration_receipt_expired",
      receipt=receipt,
      verified=False,
    )

  return Face3DCalibrationReceiptVerification(
    reason=None,
    receipt=receipt,
    verified=True,
  )


async def ensure_face3d_calibration_receipt_schema(db: Database) -> None:
  await db.execute(
    """
    create table if not exists face3d_calibration_receipt_consumptions (
      receipt_id text primary key,
      capture_nonce text not null unique,
      profile_binding_sha256 text not null,
      collection_policy_id text not null,
      gate_version text not null,
      signing_key_id text not null,
      approval_artifact_sha256 text not null,
      subject_context_id text not null,
      report_context_id text not null,
      issued_at timestamptz not null,
      expires_at timestamptz not null,
      consumed_at timestamptz not null default now(),
      constraint chk_face3d_receipt_profile_sha
        check (profile_binding_sha256 ~ '^[0-9a-f]{64}$'),
      constraint chk_face3d_receipt_artifact_sha
        check (approval_artifact_sha256 ~ '^[0-9a-f]{64}$'),
      constraint chk_face3d_receipt_expiry
        check (expires_at > issued_at)
    )
    """,
  )
  await db.execute(
    """
    create index if not exists idx_face3d_calibration_receipts_context
      on face3d_calibration_receipt_consumptions (
        subject_context_id,
        report_context_id
      )
    """,
  )


def _face3d_profile_candidates(
  request_payload: dict[str, Any],
) -> list[dict[str, Any]]:
  candidates: list[dict[str, Any]] = []
  measurements = _record(request_payload.get("measurements"))
  for value in (measurements.get("face3d"), request_payload.get("face3d")):
    if isinstance(value, dict) and all(value is not item for item in candidates):
      candidates.append(value)
  return candidates


async def verify_and_consume_face3d_calibration_receipt(
  db: Database,
  settings: Settings,
  request_payload: dict[str, Any],
  *,
  expected_report_context_id: str | None,
  expected_subject_context_id: str,
) -> str | None:
  candidates = _face3d_profile_candidates(request_payload)
  if not candidates:
    return None

  primary = candidates[0]
  if primary.get("schemaVersion") != FACE3D_TRUSTED_PROFILE_SCHEMA_VERSION:
    for candidate in candidates[1:]:
      if candidate.get("schemaVersion") == FACE3D_TRUSTED_PROFILE_SCHEMA_VERSION:
        candidate[FACE3D_SERVER_RECEIPT_STATUS_FIELD] = (
          "face3d_profile_not_authoritative"
        )
    return None

  verification = verify_face3d_calibration_receipt(
    primary,
    settings,
    expected_report_context_id=expected_report_context_id,
    expected_subject_context_id=expected_subject_context_id,
  )
  status = verification.reason or "verified"

  if verification.verified and verification.receipt is not None:
    await ensure_face3d_calibration_receipt_schema(db)
    receipt = verification.receipt
    consumed = await db.fetchrow(
      """
      insert into face3d_calibration_receipt_consumptions (
        receipt_id,
        capture_nonce,
        profile_binding_sha256,
        collection_policy_id,
        gate_version,
        signing_key_id,
        approval_artifact_sha256,
        subject_context_id,
        report_context_id,
        issued_at,
        expires_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11::timestamptz)
      on conflict do nothing
      returning receipt_id
      """,
      receipt["receiptId"],
      receipt["captureNonce"],
      receipt["profileBindingSha256"],
      receipt["collectionPolicyId"],
      receipt["gateVersion"],
      receipt["signingKeyId"],
      receipt["approvalArtifactSha256"],
      receipt["subjectContextId"],
      receipt["reportContextId"],
      receipt["issuedAtUtc"],
      receipt["expiresAtUtc"],
    )
    if consumed is None:
      status = "face3d_calibration_receipt_replayed"

  try:
    primary_binding = compute_face3d_profile_binding_sha256(primary)
  except ValueError:
    primary_binding = ""
  primary_receipt_json = _canonical_json(_record(primary.get("calibrationReceipt")))
  for candidate in candidates:
    if candidate.get("schemaVersion") != FACE3D_TRUSTED_PROFILE_SCHEMA_VERSION:
      continue
    try:
      candidate_binding = compute_face3d_profile_binding_sha256(candidate)
    except ValueError:
      candidate_binding = "invalid"
    candidate_receipt_json = _canonical_json(
      _record(candidate.get("calibrationReceipt")),
    )
    candidate[FACE3D_SERVER_RECEIPT_STATUS_FIELD] = (
      status
      if (
        hmac.compare_digest(candidate_binding, primary_binding)
        and hmac.compare_digest(candidate_receipt_json, primary_receipt_json)
        and candidate.get("profileBindingSha256")
        == primary.get("profileBindingSha256")
        and candidate.get("captureNonce") == primary.get("captureNonce")
      )
      else "face3d_profile_duplicate_mismatch"
    )

  return status
