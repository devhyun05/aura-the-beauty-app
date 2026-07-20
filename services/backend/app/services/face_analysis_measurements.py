from collections.abc import Iterable, Mapping
from dataclasses import dataclass
import math
from typing import Any

from pydantic import ValidationError

from app.schemas.face_analysis_v2 import (
  BlockedMetricKey,
  MeasurementCoveragePlan,
  MeasurementShot,
  MeasurementSource,
  MeasurementStatus,
  MetricEnvelope,
)
from app.services.face3d_calibration_receipts import (
  FACE3D_PRODUCT_POLICY_GATES,
  FACE3D_SERVER_RECEIPT_STATUS_FIELD,
  FACE3D_TRUSTED_PROFILE_SCHEMA_VERSION,
  is_face3d_profile_server_verified,
)


FACE3D_MODEL_VISIBLE_METRIC_NAMES = (
  "noseTipProjection",
  "chinProjection",
  "upperLipToELine",
  "lowerLipToELine",
  "centralProjectionScore",
  "noseLength",
  "nasalBridgeStraightness",
  "nasalAxisDeviation",
  "alarWidth",
  "malarProjectionLeft",
  "malarProjectionRight",
)
FACE3D_MODEL_VISIBLE_PROFILE_KEYS = frozenset(
  f"face3d.{name}"
  for name in FACE3D_MODEL_VISIBLE_METRIC_NAMES
)

# Model-visible camera keys are explicit trust-boundary allowlists. Keep the
# geometry tuple synchronized with mobile FACE_GEOMETRY_METRIC_KEYS; a backend
# test reads the TypeScript source and fails when the contracts drift.
VERTICAL_THIRDS_MODEL_VISIBLE_PROFILE_KEYS = frozenset(
  {
    "verticalThirds.upperNormalized",
    "verticalThirds.middleNormalized",
    "verticalThirds.lowerNormalized",
    "verticalThirds.faceHeightPx",
    "verticalThirds.faceWidthPx",
    "verticalThirds.faceRatio",
    "verticalThirds.dominantPart",
    "verticalThirds.faceLengthVerdict",
  },
)
GEOMETRY2D_MODEL_VISIBLE_METRIC_NAMES = (
  "browApexRatioLeft",
  "browApexRatioRight",
  "browSlopeLeftDeg",
  "browSlopeRightDeg",
  "canthalTiltLeftDeg",
  "canthalTiltRightDeg",
  "eyeBrowGapLeft",
  "eyeBrowGapRight",
  "eyeOpennessLeft",
  "eyeOpennessRight",
  "eyeWidthRatioLeft",
  "eyeWidthRatioRight",
  "interCanthalRatio",
  "jawWidthRatio",
  "lipThicknessRatio",
  "lowerJawWidthRatio",
  "mouthCornerAsymmetry",
  "mouthWidthRatio",
)
GEOMETRY2D_MODEL_VISIBLE_PROFILE_KEYS = frozenset(
  f"geometry2d.{name}"
  for name in GEOMETRY2D_MODEL_VISIBLE_METRIC_NAMES
)
PERSONAL_COLOR_TONE_TO_SEASON = {
  "spring_light": "spring",
  "spring_bright": "spring",
  "spring_true": "spring",
  "summer_light": "summer",
  "summer_true": "summer",
  "summer_muted": "summer",
  "autumn_muted": "autumn",
  "autumn_true": "autumn",
  "autumn_deep": "autumn",
  "winter_bright": "winter",
  "winter_true": "winter",
  "winter_deep": "winter",
}
PERSONAL_COLOR_TONE_CODES = frozenset(PERSONAL_COLOR_TONE_TO_SEASON)
PERSONAL_COLOR_SEASONS = frozenset(PERSONAL_COLOR_TONE_TO_SEASON.values())
PERSONAL_COLOR_RESULT_STATUSES = frozenset(
  {"definitive", "mixed", "provisional", "insufficient"},
)
PERSONAL_COLOR_USABLE_STATUSES = PERSONAL_COLOR_RESULT_STATUSES - {"insufficient"}
PERSONAL_COLOR_TONE_PROFILE_KEYS = frozenset(
  {
    "personalColor.tone.top",
    "personalColor.tone.secondary",
    "personalColor.tone.season",
  },
)
PERSONAL_COLOR_MODEL_VISIBLE_PROFILE_KEYS = frozenset(
  {
    *(
      f"personalColor.axes.{name}"
      for name in ("temperature", "value", "chroma", "clarity", "contrast")
    ),
    *(
      f"personalColor.tone.{name}"
      for name in ("top", "secondary", "season")
    ),
    *(
      f"personalColor.relations.{name}"
      for name in ("dL_skinHair", "dL_skinLip", "dE00_skinHair", "dE00_skinLip")
    ),
  },
)
CAMERA_MODEL_VISIBLE_PROFILE_KEYS = (
  VERTICAL_THIRDS_MODEL_VISIBLE_PROFILE_KEYS
  | GEOMETRY2D_MODEL_VISIBLE_PROFILE_KEYS
  | PERSONAL_COLOR_MODEL_VISIBLE_PROFILE_KEYS
  | FACE3D_MODEL_VISIBLE_PROFILE_KEYS
)


AI_OBSERVABLE_METRICS: dict[str, tuple[int, str]] = {
  "eyes.innerCornerOpenness": (1, "label"),
  "eyes.irisExposure": (1, "label"),
  "eyes.irisToAperture": (1, "label"),
  "eyes.upperLidCurve": (1, "label"),
  "eyes.lowerLidCurve": (1, "label"),
  "eyes.scleraIrisContrast": (1, "score"),
  "eyes.heightAsymmetry": (2, "label"),
  "eyes.eyelidType": (1, "label"),
  "eyes.eyelidThickness": (1, "label"),
  "eyes.eyelidStability": (2, "label"),
  "eyes.epicanthalFold": (2, "label"),
  "eyes.aegyoSal": (1, "label"),
  "brows.lengthType": (0, "label"),
  "brows.archPosition": (0, "label"),
  "brows.archHeight": (0, "label"),
  "brows.heightAsymmetry": (2, "label"),
  "brows.hairTexture": (1, "label"),
  "brows.density": (1, "label"),
  "lashes.direction": (1, "label"),
  "lashes.density": (1, "label"),
  "lips.upperThicknessType": (0, "label"),
  "lips.lowerThicknessType": (0, "label"),
  "lips.cupidsBowShape": (0, "label"),
  "lips.cornerImpression": (1, "label"),
  "nose.nostrilExposure": (1, "label"),
  "nose.nostrilAsymmetry": (2, "label"),
  "nose.tipSkinThickness": (2, "label"),
  "nose.alarFleshiness": (2, "label"),
  "philtrum.visualLength": (1, "label"),
  "philtrum.definition": (1, "label"),
  "contour.foreheadWidthType": (1, "label"),
  "contour.cheekboneWidthType": (1, "label"),
  "contour.chinWidthType": (1, "label"),
  "contour.jawAngleType": (1, "label"),
  "contour.outlineStrength": (1, "label"),
  "contour.fiveEyeBalanceSupplement": (2, "label"),
  "asymmetry.regionalObservations": (2, "label"),
  "color.browTone": (1, "label"),
  "color.irisTone": (1, "label"),
  "skin.toneUniformity": (1, "score"),
  "skin.rednessMap": (2, "label"),
  "skin.darkCircleColor": (1, "label"),
  "skin.lipLineColor": (1, "label"),
  "skin.relativeContrast": (1, "label"),
  "skin.texture": (1, "label"),
  "skin.pores": (1, "label"),
  "skin.sebumDryness": (1, "label"),
  "skin.shineDistribution": (1, "label"),
  "skin.shineType": (1, "label"),
  "skin.thicknessImpression": (2, "label"),
  "skin.elasticityImpression": (2, "label"),
  "skin.pigmentationDistribution": (2, "label"),
  "skin.marksAndScarsMap": (2, "label"),
}
MODEL_VISIBLE_PROFILE_KEYS = (
  CAMERA_MODEL_VISIBLE_PROFILE_KEYS
  | frozenset(AI_OBSERVABLE_METRICS)
)


def filter_metric_keys_for_model(keys: Iterable[str]) -> list[str]:
  """Return only known metric keys that may cross the external-model boundary."""
  return sorted(set(keys) & MODEL_VISIBLE_PROFILE_KEYS)


def _metric_value(raw_metric: MetricEnvelope | dict[str, Any] | None) -> Any:
  if isinstance(raw_metric, MetricEnvelope):
    return raw_metric.value
  if isinstance(raw_metric, dict):
    return raw_metric.get("value")
  return None


def _personal_color_tone_profile_is_safe(
  metrics: Mapping[str, MetricEnvelope | dict[str, Any]],
) -> bool:
  present_keys = PERSONAL_COLOR_TONE_PROFILE_KEYS & metrics.keys()
  if not present_keys:
    return True
  if {
    "personalColor.tone.top",
    "personalColor.tone.season",
  } - present_keys:
    return False

  top = _metric_value(metrics.get("personalColor.tone.top"))
  season = _metric_value(metrics.get("personalColor.tone.season"))
  secondary = _metric_value(metrics.get("personalColor.tone.secondary"))
  return (
    isinstance(top, str)
    and top in PERSONAL_COLOR_TONE_CODES
    and isinstance(season, str)
    and season in PERSONAL_COLOR_SEASONS
    and PERSONAL_COLOR_TONE_TO_SEASON[top] == season
    and (
      "personalColor.tone.secondary" not in present_keys
      or isinstance(secondary, str)
      and secondary in PERSONAL_COLOR_TONE_CODES
    )
  )


OUT_OF_SCOPE_METRICS = frozenset(
  {
    "profile.fullSideProfile",
    "profile.hairlineGeometry",
    "head.cranialRatios",
    "ears.sizeAndAngle",
    "neck.lengthAndThickness",
    "neck.trapezius",
    "neck.jawConnection",
    "body.faceToHeightRatio",
    "smile.eyeChange",
    "smile.mouthCornerChange",
    "teeth.dynamicExposure",
    "gums.dynamicExposure",
    "draping.temperatureResponse",
    "draping.valueResponse",
    "draping.chromaResponse",
    "draping.clarityResponse",
  },
)

SUCCESS_STATUSES = {"full_success", "partial_success", "completed", "definitive"}
AUTHORITATIVE_HAIRLINE_PROVIDERS = {
  "apple_semantic_matte",
  "mediapipe_hairline_boundary",
  "face_parsing",
}
AUTHORITATIVE_HAIRLINE_MIN_CONFIDENCE = 0.7


@dataclass(frozen=True)
class MergeResult:
  profile: dict[str, MetricEnvelope]
  rejected_authoritative_keys: list[str]
  rejected_unknown_keys: list[str]


def _record(value: Any) -> dict[str, Any]:
  return value if isinstance(value, dict) else {}


def _finite(value: Any) -> float | None:
  if isinstance(value, bool) or not isinstance(value, (int, float)):
    return None
  number = float(value)
  return number if math.isfinite(number) else None


def _warnings(*values: Any) -> list[str]:
  result: list[str] = []
  for value in values:
    if isinstance(value, list):
      result.extend(str(item) for item in value if isinstance(item, str) and item.strip())
  return list(dict.fromkeys(result))


def _vertical_has_authoritative_hairline(raw: dict[str, Any]) -> bool:
  measurement_mode = raw.get("measurementMode")
  explicit_full = measurement_mode == "full_vertical_thirds"
  legacy_full = (
    measurement_mode is None
    and raw.get("schemaVersion") == "aura-face-vertical-thirds-v1"
    and raw.get("status") == "full_success"
  )
  if not explicit_full and not legacy_full:
    return False
  analysis = _record(raw.get("hairlineAnalysis"))
  keypoint = _record(_record(raw.get("keypoints")).get("H"))
  provider = analysis.get("provider") or keypoint.get("provider")
  confidence = _finite(analysis.get("confidence"))
  if confidence is None:
    confidence = _finite(keypoint.get("confidence"))
  return (
    (analysis.get("analysisEligible") is True if explicit_full else True)
    and provider in AUTHORITATIVE_HAIRLINE_PROVIDERS
    and confidence is not None
    and confidence >= AUTHORITATIVE_HAIRLINE_MIN_CONFIDENCE
  )


def _camera_metric(
  *,
  value: float | str | dict[str, float] | None,
  confidence: float,
  source: MeasurementSource,
  shot: MeasurementShot,
  unit: str | None,
  usable: bool,
  reason: str | None = None,
  warnings: list[str] | None = None,
  sensitivity: int = 0,
) -> MetricEnvelope:
  has_value = value is not None and (not isinstance(value, str) or bool(value.strip()))
  measured = usable and has_value and confidence >= 0.5
  return MetricEnvelope.model_validate(
    {
      "value": value if measured else None,
      "unit": unit,
      "confidence": max(0.0, min(1.0, confidence)),
      "source": source.value,
      "status": "measured" if measured else "blocked",
      "shots": [shot.value],
      "sensitivity": sensitivity,
      "reason": None if measured else (reason or "camera_measurement_unavailable"),
      "warnings": warnings or [],
    },
  )


def _normalize_vertical(
  output: dict[str, MetricEnvelope],
  raw: dict[str, Any],
) -> None:
  if not raw:
    return
  ratio = _record(raw.get("verticalThirds"))
  quality = _record(raw.get("quality"))
  confidence = _finite(ratio.get("confidence")) or 0.0
  base_usable = raw.get("status") in SUCCESS_STATUSES and quality.get("usable", True) is not False
  full_vertical_usable = base_usable and _vertical_has_authoritative_hairline(raw)
  warnings = _warnings(ratio.get("warnings"), quality.get("warnings"))
  status_reason = raw.get("statusReason") if isinstance(raw.get("statusReason"), str) else None
  reason = status_reason or (
    None if full_vertical_usable else "hairline_not_analysis_eligible"
  )
  for key in ("upperNormalized", "middleNormalized", "lowerNormalized"):
    output[f"verticalThirds.{key}"] = _camera_metric(
      value=_finite(ratio.get(key)), confidence=confidence, source=MeasurementSource.LANDMARK,
      shot=MeasurementShot.S1, unit="ratio", usable=full_vertical_usable, reason=reason,
      warnings=warnings,
    )
  face_length = _record(raw.get("faceLength"))
  for key, unit in (("heightPx", "score"), ("widthPx", "score"), ("ratio", "ratio")):
    value = _finite(face_length.get(key))
    if value is not None:
      output[f"verticalThirds.face{key[0].upper()}{key[1:]}"] = _camera_metric(
        value=value, confidence=confidence, source=MeasurementSource.PIXEL,
        shot=MeasurementShot.S1, unit=unit, usable=full_vertical_usable, reason=reason,
        warnings=warnings,
      )
  # 판정 단일 정본(2026-07-17, 계획 §B3 해소): 측정 시점의 모바일 판정
  # (자기내부 dominantPart·길이비 verdict)이 payload에 있으면 profile로
  # 올려 서버 derived 규칙이 이를 따르게 한다 — 모바일(임계 0.08)과 서버
  # (임계 0.025/1.38)가 같은 얼굴을 다르게 판정하던 불일치 제거.
  interpretation = _record(raw.get("interpretation"))
  dominant = interpretation.get("dominantPart")
  # 'unknown'(2구간 측정)은 의도적 미발행 — H 의존 normalized 값도 함께
  # blocked라 서버 규칙은 근거 부족으로 보류된다. full 모드에서 unknown이
  # 생기는 순간 이 가정이 깨지므로, 그때는 unknown도 발행해 규칙에서
  # 명시적으로 보류 처리해야 한다(faceLengthVerdict의 indeterminate와 대칭).
  if isinstance(dominant, str) and dominant in {"balanced", "upper", "middle", "lower"}:
    output["verticalThirds.dominantPart"] = _camera_metric(
      value=dominant, confidence=confidence, source=MeasurementSource.LANDMARK,
      shot=MeasurementShot.S1, unit="label", usable=full_vertical_usable, reason=reason,
      warnings=warnings,
    )
  judgment = _record(raw.get("faceLengthJudgment"))
  verdict = judgment.get("verdict")
  if isinstance(verdict, str) and verdict in {
    "wide", "borderline_wide", "average", "borderline_long", "long", "indeterminate",
  }:
    # indeterminate(판정 보류)도 발행한다(2차 리뷰 B-1): 키를 안 내면 서버
    # 규칙이 스냅샷 부재(구 payload)로 오인해 레거시 임계로 단정을 복원한다
    # — 모바일 "보류"가 서버 "긴 타원형"으로 뒤집히는 종단 불일치.
    output["verticalThirds.faceLengthVerdict"] = _camera_metric(
      value=verdict, confidence=confidence, source=MeasurementSource.PIXEL,
      shot=MeasurementShot.S1, unit="label", usable=full_vertical_usable, reason=reason,
      warnings=warnings,
    )
  if not full_vertical_usable:
    # H가 없는 세션에서는 이미지 AI가 이마 폭을 별도로 "보완 추정"하지 못하게
    # camera-owned blocked key로 선점한다.
    output["contour.foreheadWidthType"] = _camera_metric(
      value=None, confidence=confidence, source=MeasurementSource.LANDMARK,
      shot=MeasurementShot.S1, unit="label", usable=False, reason=reason,
      warnings=warnings,
    )


def _normalize_geometry(
  output: dict[str, MetricEnvelope],
  raw: dict[str, Any],
) -> None:
  if not raw:
    return
  usable = raw.get("status") in SUCCESS_STATUSES
  reason = raw.get("statusReason") if isinstance(raw.get("statusReason"), str) else None
  for key, metric_value in _record(raw.get("metrics")).items():
    metric = _record(metric_value)
    output[f"geometry2d.{key}"] = _camera_metric(
      value=_finite(metric.get("value")), confidence=1.0,
      source=MeasurementSource.PIXEL, shot=MeasurementShot.S1,
      unit=metric.get("unit") if metric.get("unit") in {"ratio", "deg"} else "ratio",
      usable=usable, reason=reason, warnings=_warnings(metric.get("warnings")),
    )


def _normalize_face3d(
  output: dict[str, MetricEnvelope],
  raw: dict[str, Any],
) -> None:
  if not raw:
    return
  profile_warnings = _warnings(raw.get("warnings"))
  usable = True
  reason = None
  schema_version = raw.get("schemaVersion")
  if schema_version is not None and not isinstance(schema_version, str):
    usable = False
    reason = "face3d_schema_unsupported"
  elif schema_version == FACE3D_TRUSTED_PROFILE_SCHEMA_VERSION:
    policy_id = raw.get("collectionPolicyId")
    gate_version = raw.get("gateVersion")
    if raw.get("sampleMode") == "single_frame":
      usable = False
      reason = "face3d_single_frame_not_product_eligible"
    elif isinstance(policy_id, str) and policy_id.startswith("diagnostics-"):
      usable = False
      reason = "face3d_diagnostics_policy_not_product_eligible"
    elif raw.get("confidenceCalibrationStatus") != "calibrated":
      usable = False
      reason = "face3d_confidence_uncalibrated"
    elif (
      not isinstance(policy_id, str)
      or FACE3D_PRODUCT_POLICY_GATES.get(policy_id) != gate_version
    ):
      usable = False
      reason = "face3d_policy_gate_not_approved"
    elif not is_face3d_profile_server_verified(raw):
      usable = False
      server_reason = raw.get(FACE3D_SERVER_RECEIPT_STATUS_FIELD)
      reason = (
        server_reason
        if isinstance(server_reason, str) and server_reason != "verified"
        else "face3d_calibration_receipt_unverified"
      )
    elif raw.get("sampleMode") != "micro_burst" or raw.get("aggregation") != "median_mad":
      usable = False
      reason = "face3d_profile_policy_invalid"
  elif schema_version == "aura.face3d-profile.v2":
    usable = False
    reason = "face3d_legacy_v2_not_product_eligible"
  elif schema_version not in (None, "aura.face3d-profile.v1"):
    usable = False
    reason = "face3d_schema_unsupported"
  for key, metric_value in _record(raw.get("metrics")).items():
    metric = _record(metric_value)
    output[f"face3d.{key}"] = _camera_metric(
      value=_finite(metric.get("value")), confidence=_finite(metric.get("confidence")) or 0.0,
      source=MeasurementSource.DEPTH, shot=MeasurementShot.FACE3D, unit="ratio",
      usable=usable, reason=reason,
      warnings=_warnings(profile_warnings, metric.get("warnings")),
    )
    if schema_version == FACE3D_TRUSTED_PROFILE_SCHEMA_VERSION and "valueMm" in metric:
      output[f"face3d.{key}.mm"] = _camera_metric(
        value=_finite(metric.get("valueMm")),
        confidence=_finite(metric.get("valueMmConfidence")) or 0.0,
        source=MeasurementSource.DEPTH,
        shot=MeasurementShot.FACE3D,
        unit="mm",
        usable=usable,
        reason=reason,
        warnings=_warnings(profile_warnings, metric.get("warnings")),
        sensitivity=3,
      )


def _normalize_personal_color(
  output: dict[str, MetricEnvelope],
  raw: dict[str, Any],
) -> None:
  reported = _record(raw.get("reported"))
  if not reported:
    return
  overall_confidence = _finite(reported.get("measurementConfidence")) or 0.0
  reported_status = reported.get("status")
  usable = reported_status in PERSONAL_COLOR_USABLE_STATUSES
  warnings = _warnings(reported.get("warnings"))
  for key, axis_value in _record(reported.get("axes")).items():
    axis = _record(axis_value)
    output[f"personalColor.axes.{key}"] = _camera_metric(
      value=_finite(axis.get("value")), confidence=_finite(axis.get("confidence")) or overall_confidence,
      source=MeasurementSource.PIXEL, shot=MeasurementShot.S1, unit="score",
      usable=usable, warnings=warnings,
    )
  tone = _record(reported.get("tone"))
  tone_top = tone.get("top")
  tone_secondary = tone.get("secondary")
  tone_season = tone.get("season")
  tone_is_safe = (
    usable
    and reported_status != "insufficient"
    and isinstance(tone_top, str)
    and tone_top in PERSONAL_COLOR_TONE_CODES
    and isinstance(tone_season, str)
    and tone_season in PERSONAL_COLOR_SEASONS
    and PERSONAL_COLOR_TONE_TO_SEASON[tone_top] == tone_season
    and (
      tone_secondary is None
      or isinstance(tone_secondary, str)
      and tone_secondary in PERSONAL_COLOR_TONE_CODES
    )
  )
  if tone_is_safe:
    for key, value in (
      ("top", tone_top),
      ("secondary", tone_secondary),
      ("season", tone_season),
    ):
      if isinstance(value, str):
        output[f"personalColor.tone.{key}"] = _camera_metric(
          value=value, confidence=overall_confidence, source=MeasurementSource.PIXEL,
          shot=MeasurementShot.S1, unit="label", usable=True, warnings=warnings,
        )
  for key, value in _record(reported.get("relations")).items():
    numeric = _finite(value)
    if numeric is not None:
      output[f"personalColor.relations.{key}"] = _camera_metric(
        value=numeric, confidence=overall_confidence, source=MeasurementSource.PIXEL,
        shot=MeasurementShot.S1, unit="score", usable=usable, warnings=warnings,
      )


def normalize_camera_measurements(measurements: Any) -> dict[str, MetricEnvelope]:
  raw = _record(measurements)
  if raw.get("schemaVersion") != "aura-face-analysis-measurements-v1":
    return {}
  output: dict[str, MetricEnvelope] = {}
  _normalize_vertical(output, _record(raw.get("faceVerticalThirds")))
  _normalize_geometry(output, _record(raw.get("faceGeometry2d")))
  _normalize_face3d(output, _record(raw.get("face3d")))
  _normalize_personal_color(output, _record(raw.get("personalColor")))
  return output


def build_measurement_coverage(
  profile: dict[str, MetricEnvelope],
) -> MeasurementCoveragePlan:
  authoritative = set(profile)
  blocked = [
    BlockedMetricKey(key=key, reason=metric.reason or "camera_measurement_unavailable")
    for key, metric in sorted(profile.items())
    if metric.status is MeasurementStatus.BLOCKED
  ]
  return MeasurementCoveragePlan(
    authoritative_keys=sorted(authoritative),
    missing_observable_keys=sorted(set(AI_OBSERVABLE_METRICS) - authoritative),
    out_of_scope_keys=sorted(OUT_OF_SCOPE_METRICS),
    blocked_keys=blocked,
  )


def merge_measurements(
  camera: dict[str, MetricEnvelope],
  ai: dict[str, Any],
  coverage: MeasurementCoveragePlan,
) -> MergeResult:
  merged = dict(camera)
  rejected_authoritative: list[str] = []
  rejected_unknown: list[str] = []
  authoritative = set(coverage.authoritative_keys)
  allowed = set(coverage.missing_observable_keys)

  for key, raw_metric in ai.items():
    if key in authoritative:
      rejected_authoritative.append(key)
      continue
    if key not in allowed:
      rejected_unknown.append(key)
      continue
    metric = MetricEnvelope.model_validate(raw_metric)
    if metric.confidence < 0.55:
      metric = MetricEnvelope.model_validate(
        {
          **metric.model_dump(by_alias=True, mode="json"),
          "value": None,
          "status": "blocked",
          "reason": "confidence_below_threshold",
        },
      )
    merged[key] = metric

  return MergeResult(
    profile=merged,
    rejected_authoritative_keys=sorted(rejected_authoritative),
    rejected_unknown_keys=sorted(rejected_unknown),
  )


def with_explicit_unmeasured(
  profile: dict[str, MetricEnvelope],
  keys: list[str],
) -> dict[str, MetricEnvelope]:
  result = dict(profile)
  for key in keys:
    result.setdefault(
      key,
      MetricEnvelope.model_validate(
        {
          "value": None,
          "confidence": 0,
          "source": "ai",
          "status": "unmeasured",
          "shots": [],
          "sensitivity": 1,
          "reason": "required_shot_missing",
          "warnings": [],
        },
      ),
    )
  return result


def filter_metrics_for_audience(
  metrics: dict[str, MetricEnvelope],
  include_sensitive: bool,
) -> dict[str, MetricEnvelope]:
  sensitivity_limit = 2 if include_sensitive else 1
  return {
    key: metric
    for key, metric in metrics.items()
    if metric.status not in {MeasurementStatus.UNMEASURED, MeasurementStatus.BLOCKED}
    and metric.sensitivity <= sensitivity_limit
    and metric.sensitivity < 3
  }


def filter_metrics_for_model(
  metrics: Mapping[str, MetricEnvelope | dict[str, Any]],
) -> dict[str, MetricEnvelope]:
  """Project only allowlisted evidence into a provenance-free model envelope."""
  model_visible: dict[str, MetricEnvelope] = {}
  tone_profile_is_safe = _personal_color_tone_profile_is_safe(metrics)
  for key, raw_metric in metrics.items():
    if key not in MODEL_VISIBLE_PROFILE_KEYS:
      continue
    if key in PERSONAL_COLOR_TONE_PROFILE_KEYS and not tone_profile_is_safe:
      continue

    try:
      metric = (
        raw_metric
        if isinstance(raw_metric, MetricEnvelope)
        else MetricEnvelope.model_validate(raw_metric)
      )
    except (TypeError, ValidationError):
      continue

    if (
      metric.sensitivity >= 3
      or metric.status in {
        MeasurementStatus.BLOCKED,
        MeasurementStatus.UNMEASURED,
      }
    ):
      continue

    # Camera envelopes contain client-owned warnings/reasons/provenance, and
    # AI envelopes may contain prior model prose. Rebuild the minimum typed
    # evidence needed by the next external-model stage.
    model_visible[key] = MetricEnvelope.model_validate(
      {
        "value": metric.value,
        "unit": metric.unit,
        "confidence": metric.confidence,
        "source": metric.source.value,
        "status": metric.status.value,
        "shots": [shot.value for shot in metric.shots],
        "sensitivity": metric.sensitivity,
        "reason": None,
        "warnings": [],
        "derivedFrom": [],
      },
    )
  return model_visible


_INTERNAL_ONLY = object()


def filter_internal_only_payload(value: Any) -> Any:
  """Remove sensitivity-3 insight records before any external model call."""
  if isinstance(value, dict):
    if value.get("sensitivity") == 3:
      return _INTERNAL_ONLY
    filtered: dict[str, Any] = {}
    for key, item in value.items():
      projected = filter_internal_only_payload(item)
      if projected is not _INTERNAL_ONLY:
        filtered[key] = projected
    return filtered
  if isinstance(value, list):
    return [
      projected
      for item in value
      if (projected := filter_internal_only_payload(item)) is not _INTERNAL_ONLY
    ]
  return value
