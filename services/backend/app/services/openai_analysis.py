import asyncio
import base64
from collections.abc import Awaitable, Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from ipaddress import ip_address
import json
import logging
import re
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import boto3
import httpx
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

try:
  from openai import OpenAI, OpenAIError
except ImportError:  # pragma: no cover - only hit before backend deps are installed.
  OpenAI = None
  OpenAIError = Exception

try:
  from PIL import Image, ImageOps, UnidentifiedImageError
except ImportError:  # pragma: no cover - fallback keeps local setup usable before deps install.
  Image = None
  ImageOps = None
  UnidentifiedImageError = Exception

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.face3d_calibration_receipts import (
  FACE3D_TRUSTED_PROFILE_SCHEMA_VERSION,
  is_face3d_profile_server_verified,
)
from app.services.face_analysis_measurements import (
  FACE3D_MODEL_VISIBLE_METRIC_NAMES,
  GEOMETRY2D_MODEL_VISIBLE_METRIC_NAMES,
  PERSONAL_COLOR_RESULT_STATUSES,
  PERSONAL_COLOR_SEASONS,
  PERSONAL_COLOR_TONE_CODES,
  PERSONAL_COLOR_TONE_TO_SEASON,
)


logger = logging.getLogger(__name__)

_AUTHORITATIVE_HAIRLINE_PROVIDERS = {
  "apple_semantic_matte",
  "mediapipe_hairline_boundary",
  "face_parsing",
}
_AUTHORITATIVE_HAIRLINE_MIN_CONFIDENCE = 0.7
_ANALYSIS_PROMPT_TASKS = {"face_makeup_recommendation_report_v1"}
_ANALYSIS_PROMPT_SOURCES = {"camera", "gallery"}
# makeup_recommendation_context.normalize_makeup_profile_gender 산출값과 일치.
_ANALYSIS_PROFILE_GENDERS = {"female", "male", "unspecified"}
_FACE_VERTICAL_THIRDS_STATUSES = {
  "full_success",
  "partial_success",
}
_FACE_VERTICAL_THIRDS_DOMINANT_PARTS = {
  "upper",
  "middle",
  "lower",
  "balanced",
  "unknown",
}
_FACE_LENGTH_VERDICTS = {
  "wide",
  "borderline_wide",
  "average",
  "borderline_long",
  "long",
  "indeterminate",
}
_FACE_LENGTH_JUDGMENT_VERSIONS = {
  "face-length-judgment/v2-provisional-20260717",
  "face-length-judgment/v3-pose-normalization-validation-20260717",
}
_FACE_VERTICAL_CORRECTION_METHODS = {
  "mediapipe_facial_transformation_matrix",
  "mediapipe_pose_roll",
  "none",
}
_FACE_VERTICAL_CORRECTION_SKIP_REASONS = {
  "disabled",
  "dimension_invalid",
  "landmark_count_invalid",
  "landmark_value_invalid",
  "matrix_missing",
  "matrix_non_affine",
  "matrix_non_orthogonal",
  "matrix_non_uniform_scale",
  "matrix_round_trip_invalid",
  "matrix_value_invalid",
  "matrix_singular",
  "matrix_reflection",
  "roll_unavailable",
  "roll_out_of_range",
}
_FACE_GEOMETRY_STATUSES = {
  "full_success",
  "partial_success",
}
_FACE_GEOMETRY_CORRECTION_SKIP_REASONS = {
  "dimension_invalid",
  "roll_out_of_range",
  "roll_unavailable",
}
_PERSONAL_COLOR_AXIS_NAMES = (
  "temperature",
  "value",
  "chroma",
  "clarity",
  "contrast",
)
_PERSONAL_COLOR_REGIONS = {"skin", "hair", "lip"}
_PERSONAL_COLOR_CORRECTION_SOURCES = {"sclera", "wb", "none"}
_PERSONAL_COLOR_RELATION_ALIASES = {
  "skinHairColorDelta": ("skinHairColorDelta", "dE00_skinHair", "dE00SkinHair"),
  "skinHairLightnessDelta": (
    "skinHairLightnessDelta",
    "dL_skinHair",
    "dLSkinHair",
  ),
  "skinLipColorDelta": ("skinLipColorDelta", "dE00_skinLip", "dE00SkinLip"),
  "skinLipLightnessDelta": (
    "skinLipLightnessDelta",
    "dL_skinLip",
    "dLSkinLip",
  ),
}


def _prompt_number(value: Any) -> float | None:
  if isinstance(value, bool) or not isinstance(value, (int, float)):
    return None
  number = float(value)
  return number if number == number and abs(number) != float("inf") else None


def _prompt_record(value: Any) -> dict[str, Any]:
  return value if isinstance(value, dict) else {}


def _prompt_enum(value: Any, allowed: set[str] | frozenset[str]) -> str | None:
  return value if isinstance(value, str) and value in allowed else None


def _prompt_bool(value: Any) -> bool | None:
  return value if isinstance(value, bool) else None


def _safe_numeric_record(
  value: Any,
  keys: tuple[str, ...],
) -> dict[str, float]:
  raw = _prompt_record(value)
  safe: dict[str, float] = {}
  for key in keys:
    number = _prompt_number(raw.get(key))
    if number is not None:
      safe[key] = number
  return safe


def _safe_face3d_prompt_metric(value: Any) -> dict[str, Any] | None:
  raw = _prompt_record(value)
  if not raw:
    return None

  metric_value = (
    None
    if raw.get("value") is None
    else _prompt_number(raw.get("value"))
  )
  confidence = _prompt_number(raw.get("confidence"))
  mad = None if raw.get("mad") is None else _prompt_number(raw.get("mad"))
  valid_frame_count = _prompt_number(raw.get("validFrameCount"))
  if (
    (raw.get("value") is not None and metric_value is None)
    or confidence is None
    or confidence < 0
    or confidence > 1
    or valid_frame_count is None
    or valid_frame_count < 0
    or (raw.get("mad") is not None and (mad is None or mad < 0))
  ):
    return None

  return {
    "confidence": confidence,
    "mad": mad,
    "unit": "normalized",
    "validFrameCount": int(valid_frame_count),
    "value": metric_value,
  }


def _safe_face3d_prompt_metrics(value: Any) -> dict[str, Any]:
  raw = _prompt_record(value)
  safe: dict[str, Any] = {}
  for key in FACE3D_MODEL_VISIBLE_METRIC_NAMES:
    metric = _safe_face3d_prompt_metric(raw.get(key))
    if metric is not None:
      safe[key] = metric
  return safe


def _safe_face_vertical_thirds_prompt_payload(value: Any) -> dict[str, Any] | None:
  raw = _prompt_record(value)
  if not raw:
    return None
  raw_status = raw.get("status")
  status = _prompt_enum(raw_status, _FACE_VERTICAL_THIRDS_STATUSES)
  if raw_status is not None and status is None:
    return None

  measurement_mode = raw.get("measurementMode")
  hairline = _prompt_record(raw.get("hairline"))
  provider = hairline.get("provider")
  hairline_confidence = _prompt_number(hairline.get("confidence"))
  display_ratio = _prompt_record(raw.get("displayRatio"))
  upper = _prompt_number(display_ratio.get("upper"))
  lower = _prompt_number(display_ratio.get("lower"))
  middle = _prompt_number(display_ratio.get("middle"))
  explicit_full = (
    measurement_mode == "full_vertical_thirds"
    and hairline.get("analysisEligible") is True
  )
  legacy_full = measurement_mode is None and raw.get("status") == "full_success"
  full_eligible = (
    (explicit_full or legacy_full)
    and provider in _AUTHORITATIVE_HAIRLINE_PROVIDERS
    and hairline_confidence is not None
    and hairline_confidence >= _AUTHORITATIVE_HAIRLINE_MIN_CONFIDENCE
    and upper is not None
    and lower is not None
    and middle is not None
  )

  common: dict[str, Any] = {
    "measurementMode": (
      "full_vertical_thirds" if full_eligible else "middle_lower_only"
    ),
  }
  if status is not None:
    common["status"] = status

  confidence = _prompt_number(raw.get("confidence"))
  if confidence is not None and 0 <= confidence <= 1:
    common["confidence"] = confidence

  post_correction = _prompt_record(raw.get("postCorrection"))
  applied = _prompt_bool(post_correction.get("applied"))
  correction_method = _prompt_enum(
    post_correction.get("method"),
    _FACE_VERTICAL_CORRECTION_METHODS,
  )
  roll_correction = _prompt_number(post_correction.get("rollCorrectionDeg"))
  correction_skip_reason = _prompt_enum(
    post_correction.get("skippedReason"),
    _FACE_VERTICAL_CORRECTION_SKIP_REASONS,
  )
  safe_post_correction: dict[str, Any] = {}
  if applied is not None:
    safe_post_correction["applied"] = applied
  if correction_method is not None:
    safe_post_correction["method"] = correction_method
  if roll_correction is not None:
    safe_post_correction["rollCorrectionDeg"] = roll_correction
  if correction_skip_reason is not None:
    safe_post_correction["skippedReason"] = correction_skip_reason
  if safe_post_correction:
    common["postCorrection"] = safe_post_correction

  quality = _prompt_record(raw.get("quality"))
  safe_quality: dict[str, Any] = _safe_numeric_record(
    quality,
    ("pitch", "roll", "yaw"),
  )
  quality_usable = _prompt_bool(quality.get("usable"))
  if quality_usable is not None:
    safe_quality["usable"] = quality_usable
  if safe_quality:
    common["quality"] = safe_quality

  # 측정 시점 동결 판정(3차 리뷰 BLOCKER 반영): 화이트리스트가 벗겨내면
  # 프롬프트의 verdict 추종 지시가 종단에서 무효가 된다 — 검증 후 보존.
  judgment = _prompt_record(raw.get("faceLengthJudgment"))
  judgment_band = _prompt_record(judgment.get("band"))
  judgment_verdict = judgment.get("verdict")
  band_hi = _prompt_number(judgment_band.get("hi"))
  band_lo = _prompt_number(judgment_band.get("lo"))
  safe_judgment = (
    {
      "band": {"hi": band_hi, "lo": band_lo},
      "verdict": judgment_verdict,
    }
    if judgment_verdict in _FACE_LENGTH_VERDICTS
    and band_hi is not None
    and band_lo is not None
    else None
  )
  safe_judgment_version = _prompt_enum(
    raw.get("judgmentVersion"),
    _FACE_LENGTH_JUDGMENT_VERSIONS,
  )

  if full_eligible:
    # 프롬프트 지시("원본 H 제외, 검증된 비율만")와 코드를 일치시킨다:
    # 픽셀 원본(heightPx/widthPx/*Px)은 데이터 최소화 원칙상 모델에 보내지
    # 않고, 무차원 비율/정규화 요약만 전달한다.
    face_length = _safe_numeric_record(
      raw.get("faceLength"),
      ("ratio",),
    )
    dominant_part = _prompt_enum(
      raw.get("dominantPart"),
      _FACE_VERTICAL_THIRDS_DOMINANT_PARTS,
    )
    ratio_detail = _safe_numeric_record(
      raw.get("ratioDetail"),
      (
        "lowerNormalized",
        "middleNormalized",
        "upperNormalized",
      ),
    )
    return {
      **common,
      "displayRatio": {"lower": lower, "middle": middle, "upper": upper},
      "dominantPart": dominant_part,
      "faceLength": face_length or None,
      "faceLengthJudgment": safe_judgment,
      "judgmentVersion": safe_judgment_version,
      "hairline": {
        "analysisEligible": True,
        "confidence": hairline_confidence,
        "provider": provider,
      },
      "ratioDetail": ratio_detail,
    }

  middle_lower = _prompt_record(raw.get("middleLowerRatio"))
  safe_lower = _prompt_number(middle_lower.get("lower"))
  safe_middle = _prompt_number(middle_lower.get("middle"))
  if safe_lower is None:
    safe_lower = lower
  if safe_middle is None:
    safe_middle = middle
  if safe_lower is None or safe_middle is None:
    return None

  # 픽셀 원본(lowerPx/middlePx) 제외 — 무차원 비율만 전달(위 주석과 동일 원칙).
  return {
    **common,
    "middleLowerRatio": {
      "lower": safe_lower,
      "middle": safe_middle,
    },
  }


def _safe_face_geometry_prompt_payload(value: Any) -> dict[str, Any] | None:
  raw = _prompt_record(value)
  if not raw:
    return None

  raw_status = raw.get("status")
  status = _prompt_enum(raw_status, _FACE_GEOMETRY_STATUSES)
  if raw_status is not None and status is None:
    return None

  metrics = _prompt_record(raw.get("metrics"))
  safe_metrics: dict[str, dict[str, Any]] = {}
  for key in GEOMETRY2D_MODEL_VISIBLE_METRIC_NAMES:
    metric = _prompt_record(metrics.get(key))
    if not metric:
      continue
    raw_value = metric.get("value")
    metric_value = None if raw_value is None else _prompt_number(raw_value)
    if raw_value is not None and metric_value is None:
      continue
    safe_metric: dict[str, Any] = {
      "unit": "deg" if key.endswith("Deg") else "ratio",
      "value": metric_value,
    }
    # per-metric confidence 전달 — LLM이 저신뢰 지표(눈꼬리 각도 등)를 확정
    # 사실로 서술하지 않도록. personalColor·face3d는 이미 전달, geometry만 누락이었음.
    confidence = _prompt_number(metric.get("confidence"))
    if confidence is not None and 0 <= confidence <= 1:
      safe_metric["confidence"] = confidence
    safe_metrics[key] = safe_metric
  if not safe_metrics:
    return None

  safe: dict[str, Any] = {"metrics": safe_metrics}
  if status is not None:
    safe["status"] = status

  pose = _safe_numeric_record(
    raw.get("pose"),
    ("pitchDeg", "rollDeg", "yawDeg"),
  )
  if pose:
    safe["pose"] = pose

  roll_correction = _prompt_record(raw.get("rollCorrection"))
  applied = _prompt_bool(roll_correction.get("applied"))
  correction_degrees = _prompt_number(roll_correction.get("rollCorrectionDeg"))
  skipped_reason = _prompt_enum(
    roll_correction.get("skippedReason"),
    _FACE_GEOMETRY_CORRECTION_SKIP_REASONS,
  )
  safe_roll_correction: dict[str, Any] = {}
  if applied is not None:
    safe_roll_correction["applied"] = applied
  if correction_degrees is not None:
    safe_roll_correction["rollCorrectionDeg"] = correction_degrees
  if skipped_reason is not None:
    safe_roll_correction["skippedReason"] = skipped_reason
  if safe_roll_correction:
    safe["rollCorrection"] = safe_roll_correction
  return safe


def _safe_personal_color_tone(
  value: Any,
  *,
  status: str | None,
) -> dict[str, Any] | None:
  raw = _prompt_record(value)
  if not raw or status == "insufficient":
    return None

  top = _prompt_enum(raw.get("top"), PERSONAL_COLOR_TONE_CODES)
  season = _prompt_enum(raw.get("season"), PERSONAL_COLOR_SEASONS)
  raw_secondary = raw.get("secondary")
  secondary = (
    None
    if raw_secondary is None
    else _prompt_enum(raw_secondary, PERSONAL_COLOR_TONE_CODES)
  )
  if (
    top is None
    or season is None
    or PERSONAL_COLOR_TONE_TO_SEASON[top] != season
    or raw_secondary is not None
    and secondary is None
  ):
    return None

  safe: dict[str, Any] = {
    "season": season,
    "secondary": secondary,
    "top": top,
  }
  is_mixed = _prompt_bool(raw.get("isMixed"))
  if is_mixed is not None:
    safe["isMixed"] = is_mixed
  for key in ("gap", "typeScore"):
    number = _prompt_number(raw.get(key))
    if number is not None:
      safe[key] = number
  return safe


def _safe_personal_color_correction(value: Any) -> dict[str, Any] | None:
  raw = _prompt_record(value)
  if not raw:
    return None

  safe: dict[str, Any] = {}
  for key in ("applied", "capped"):
    boolean = _prompt_bool(raw.get(key))
    if boolean is not None:
      safe[key] = boolean
  for key in ("confidence", "strength"):
    number = _prompt_number(raw.get(key))
    if number is not None:
      safe[key] = number

  source = _prompt_enum(raw.get("source"), _PERSONAL_COLOR_CORRECTION_SOURCES)
  if source is not None:
    safe["source"] = source

  gains = _safe_numeric_record(raw.get("gains"), ("r", "g", "b"))
  if gains:
    safe["gains"] = gains

  raw_sclera = _prompt_record(raw.get("scleraSummary"))
  if not raw_sclera:
    raw_sclera = _prompt_record(raw.get("sclera"))
  safe_sclera = _safe_numeric_record(
    raw_sclera,
    ("eyesUsed", "leftRightAgreement", "sampleCount"),
  )
  measured_lab = _safe_numeric_record(
    raw_sclera.get("measuredLab"),
    ("L", "a", "b"),
  )
  if measured_lab:
    safe_sclera["measuredLab"] = measured_lab
  if safe_sclera:
    safe["scleraSummary"] = safe_sclera

  raw_wb = _prompt_record(raw.get("wbRatio"))
  if not raw_wb:
    raw_wb = _prompt_record(raw.get("wb"))
  safe_wb = _safe_numeric_record(raw_wb, ("bg", "rg"))
  if safe_wb:
    safe["wbRatio"] = safe_wb
  return safe or None


def _safe_personal_color_prompt_payload(value: Any) -> dict[str, Any] | None:
  raw = _prompt_record(value)
  if not raw:
    return None
  reported = _prompt_record(raw.get("reported")) or raw

  safe: dict[str, Any] = {}
  raw_status = reported.get("status")
  status = _prompt_enum(raw_status, PERSONAL_COLOR_RESULT_STATUSES)
  if raw_status is not None and status is None:
    return None
  if status is not None:
    safe["status"] = status
  calibration_applied = _prompt_bool(reported.get("calibrationApplied"))
  if calibration_applied is not None:
    safe["calibrationApplied"] = calibration_applied
  measurement_confidence = _prompt_number(reported.get("measurementConfidence"))
  if measurement_confidence is not None and 0 <= measurement_confidence <= 1:
    safe["measurementConfidence"] = measurement_confidence

  axes = _prompt_record(reported.get("axes"))
  safe_axes: dict[str, dict[str, float | None]] = {}
  for axis_name in _PERSONAL_COLOR_AXIS_NAMES:
    axis = _prompt_record(axes.get(axis_name))
    if not axis:
      continue
    raw_value = axis.get("value")
    axis_value = None if raw_value is None else _prompt_number(raw_value)
    confidence = _prompt_number(axis.get("confidence"))
    if (
      raw_value is not None
      and axis_value is None
      or confidence is None
      or not 0 <= confidence <= 1
    ):
      continue
    safe_axes[axis_name] = {
      "confidence": confidence,
      "value": axis_value,
    }
  if safe_axes:
    safe["axes"] = safe_axes

  relations = _prompt_record(reported.get("relations"))
  safe_relations: dict[str, float] = {}
  for output_key, aliases in _PERSONAL_COLOR_RELATION_ALIASES.items():
    for alias in aliases:
      number = _prompt_number(relations.get(alias))
      if number is not None:
        safe_relations[output_key] = number
        break
  if safe_relations:
    safe["relations"] = safe_relations

  safe_regions: list[dict[str, Any]] = []
  raw_regions = reported.get("regions")
  if isinstance(raw_regions, list):
    for raw_region in raw_regions:
      region = _prompt_record(raw_region)
      region_name = _prompt_enum(region.get("region"), _PERSONAL_COLOR_REGIONS)
      if region_name is None:
        continue
      safe_region: dict[str, Any] = {"region": region_name}
      for key in ("areaRatio", "qEff"):
        number = _prompt_number(region.get(key))
        if number is not None:
          safe_region[key] = number
      lab = _safe_numeric_record(region.get("lab"), ("L", "a", "b"))
      lch = _safe_numeric_record(region.get("lch"), ("C", "h"))
      if lab:
        safe_region["lab"] = lab
      if lch:
        safe_region["lch"] = lch
      safe_regions.append(safe_region)
  if safe_regions:
    safe["regions"] = safe_regions

  tone = _safe_personal_color_tone(reported.get("tone"), status=status)
  if tone is not None:
    safe["tone"] = tone

  correction = _safe_personal_color_correction(
    raw.get("correction", raw.get("correctionReport")),
  )
  if correction is not None:
    safe["correction"] = correction
  return safe or None


# 모바일 TYPE_LABEL_KO(personalColorCore/constants.ts)와 문자열이 일치해야 한다 —
# 상세 화면 요약 칩과 DB 컬럼(리스트 태그·추천 스냅샷)이 같은 정본을 보게 하는 계약.
PERSONAL_COLOR_TONE_LABEL_KO: dict[str, str] = {
  "spring_light": "봄 라이트",
  "spring_bright": "봄 브라이트",
  "spring_true": "봄 트루",
  "summer_light": "여름 라이트",
  "summer_true": "여름 트루",
  "summer_muted": "여름 뮤트",
  "autumn_muted": "가을 뮤트",
  "autumn_true": "가을 트루",
  "autumn_deep": "가을 딥",
  "winter_bright": "겨울 브라이트",
  "winter_true": "겨울 트루",
  "winter_deep": "겨울 딥",
}

# 모바일 AXIS_BANDS(presentation.ts)의 (low, mid, high) 라벨. 밴드 경계도 동일(±1/3).
_PERSONAL_COLOR_AXIS_BAND_LABELS_KO: dict[str, tuple[str, str, str]] = {
  "temperature": ("쿨", "뉴트럴", "웜"),
  "value": ("밝은 색", "중간 밝기", "깊은 색"),
  "chroma": ("부드러운 색", "맑은 색", "선명한 색"),
}


def measured_personal_color_column_values(
  measurements: Any,
) -> tuple[str | None, str | None]:
  """기기 측정 퍼컬 → analysis_reports.personal_color/tone_summary 컬럼값.

  DB 정본은 기기 측정값 원칙: LLM 재판정 대신, 조명 보정·12톤/계절 정합성
  게이트(_safe_personal_color_prompt_payload)를 통과한 tone.top의 한국어
  라벨을 기록한다. 측정 실패(insufficient·게이트 탈락)는 (None, None) →
  coalesce로 컬럼 NULL 유지.
  """
  safe = _safe_personal_color_prompt_payload(
    _prompt_record(measurements).get("personalColor"),
  )
  if not safe:
    return None, None
  tone = safe.get("tone")
  if not isinstance(tone, dict):
    return None, None
  label = PERSONAL_COLOR_TONE_LABEL_KO.get(str(tone.get("top") or ""))
  if label is None:
    return None, None

  axes = safe.get("axes")
  axes = axes if isinstance(axes, dict) else {}

  def _band_label(axis_name: str) -> str:
    low, mid, high = _PERSONAL_COLOR_AXIS_BAND_LABELS_KO[axis_name]
    axis = axes.get(axis_name)
    value = axis.get("value") if isinstance(axis, dict) else None
    # 모바일 getAxisBandPresentation과 동일: null 또는 중간 밴드(±1/3)는 mid.
    if value is None or -1 / 3 <= value <= 1 / 3:
      return mid
    return low if value < -1 / 3 else high

  tone_summary = " · ".join(
    _band_label(axis_name) for axis_name in ("temperature", "value", "chroma")
  )
  return label, tone_summary


def _safe_face3d_prompt_payload(value: Any) -> dict[str, Any] | None:
  raw = _prompt_record(value)
  if not raw:
    return None

  schema_version = raw.get("schemaVersion")
  if schema_version is not None and not isinstance(schema_version, str):
    return None
  metrics = _safe_face3d_prompt_metrics(raw.get("metrics"))
  if not metrics:
    return None

  if schema_version in {None, "aura.face3d-profile.v1"}:
    # Legacy payloads remain useful for normalized geometry, but their dict is
    # untrusted. Reconstruct an allowlisted numeric view so receipt/provenance,
    # valueMm*, raw landmarks, and prompt-injection strings cannot cross the
    # external-model boundary.
    return {
      "metrics": metrics,
      "schemaVersion": schema_version or "aura.face3d-profile.v1",
      "source": "arkit_face_mesh",
    }
  if schema_version != FACE3D_TRUSTED_PROFILE_SCHEMA_VERSION:
    return None

  if (
    not is_face3d_profile_server_verified(raw)
    or raw.get("sampleMode") != "micro_burst"
    or raw.get("aggregation") != "median_mad"
  ):
    return None

  sensor_provenance = _prompt_record(raw.get("sensorProvenance"))
  depth_ratio = _prompt_number(sensor_provenance.get("depthDataObservedRatio"))

  # 서버 검증이 끝난 v3도 원본 dict를 전달하지 않는다. Receipt/nonce/context,
  # valueMm*, device model, unknown fields는 제외하고 모델에 필요한 수치만 재구성한다.
  return {
    "aggregation": "median_mad",
    "collectionPolicyId": raw.get("collectionPolicyId"),
    "confidenceCalibrationStatus": "calibrated",
    "metrics": metrics,
    "sampleMode": "micro_burst",
    "schemaVersion": FACE3D_TRUSTED_PROFILE_SCHEMA_VERSION,
    "sensorProvenance": {
      "depthDataObservedRatio": depth_ratio,
      "faceTrackingSupported": sensor_provenance.get("faceTrackingSupported") is True,
      "trueDepthHardware": sensor_provenance.get("trueDepthHardware") is True,
    },
    "source": "arkit_face_mesh",
  }


def _safe_analysis_prompt_metadata(payload: dict[str, Any]) -> dict[str, Any]:
  # External model input is reconstructed from typed primitives only. The raw
  # request remains stored for report replay, but no arbitrary client prose,
  # identifiers, media paths, warnings, or unknown keys cross this boundary.
  metadata: dict[str, Any] = {}
  task = _prompt_enum(payload.get("task"), _ANALYSIS_PROMPT_TASKS)
  if task is not None:
    metadata["task"] = task
  source = _prompt_enum(payload.get("source"), _ANALYSIS_PROMPT_SOURCES)
  if source is not None:
    metadata["source"] = source
  # 계정 성별(서버가 create_analysis_job에서 주입). 사진 성별 추론 대신 사용.
  profile_gender = _prompt_enum(
    payload.get("profileGender"),
    _ANALYSIS_PROFILE_GENDERS,
  )
  if profile_gender is not None:
    metadata["profileGender"] = profile_gender

  raw_measurements = payload.get("measurements")
  measurements = _prompt_record(raw_measurements)
  measurement_face3d = measurements.get("face3d")
  top_level_face3d = payload.get("face3d")
  face3d_from_measurements = isinstance(measurement_face3d, dict)
  primary_face3d = (
    measurement_face3d
    if face3d_from_measurements
    else top_level_face3d
    if isinstance(top_level_face3d, dict)
    else None
  )
  safe_face3d = _safe_face3d_prompt_payload(primary_face3d)

  if isinstance(raw_measurements, dict):
    # DB 저장·과거 복원에는 raw payload를 보존하되, AI에는 검증된 숫자·enum
    # 요약만 제공한다. Raw H, 경고, statusReason, 식별자는 포함하지 않는다.
    safe_measurements: dict[str, Any] = {}
    if measurements.get("schemaVersion") == "aura-face-analysis-measurements-v1":
      safe_measurements["schemaVersion"] = "aura-face-analysis-measurements-v1"
    if face3d_from_measurements and safe_face3d is not None:
      safe_measurements["face3d"] = safe_face3d
    safe_geometry = _safe_face_geometry_prompt_payload(
      measurements.get("faceGeometry2d"),
    )
    if safe_geometry is not None:
      safe_measurements["faceGeometry2d"] = safe_geometry
    safe_personal_color = _safe_personal_color_prompt_payload(
      measurements.get("personalColor"),
    )
    if safe_personal_color is not None:
      safe_measurements["personalColor"] = safe_personal_color
    if safe_measurements:
      metadata["measurements"] = safe_measurements

  raw_vertical = payload.get("face_vertical_thirds")
  safe_vertical = _safe_face_vertical_thirds_prompt_payload(
    payload.get("faceVerticalThirds", raw_vertical),
  )
  if safe_vertical is not None:
    metadata["faceVerticalThirds"] = safe_vertical

  safe_geometry = _safe_face_geometry_prompt_payload(payload.get("faceGeometry2d"))
  if safe_geometry is not None:
    metadata["faceGeometry2d"] = safe_geometry

  safe_personal_color = _safe_personal_color_prompt_payload(
    payload.get("measuredPersonalColor"),
  )
  if safe_personal_color is not None:
    metadata["measuredPersonalColor"] = safe_personal_color

  if not face3d_from_measurements and safe_face3d is not None:
    metadata["face3d"] = safe_face3d
  return metadata


def append_analysis_metric(metrics_path: str | None, record: dict[str, Any]) -> None:
  """최적화 실험 지표를 JSONL 한 줄로 append. 경로 없으면 no-op. 실패해도 요청을
  깨지 않는다(수집은 부가 기능). append 모드라 로컬 다중 요청에도 안전.
  """
  if not metrics_path:
    return
  try:
    with open(metrics_path, "a", encoding="utf-8") as sink:
      sink.write(json.dumps({"ts": time.time(), **record}, ensure_ascii=False) + "\n")
  except OSError as exc:  # noqa: BLE001 - 지표 기록 실패는 서빙을 깨지 않는다.
    logger.warning("[aura:metrics] append failed reason=%s", exc.__class__.__name__)


RECOMMENDED_MAKEUP_COUNT = 1

# Bedrock forced tool use로 단일호출 출력을 강제하는 스키마. required 목록은
# _validate_analysis_result_before_normalization의 필수 필드와 일치해야 하며,
# test_analysis_tool_schema_matches_validator가 드리프트를 막는다. additionalProperties는
# 열어둔다 — 모델이 beautyGuide 등 선택 필드를 함께 채울 수 있게.
FACE_ANALYSIS_TOOL_NAME = "return_face_analysis_report"

_STR = {"type": "string", "minLength": 1}


def _obj(properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
  return {"type": "object", "properties": properties, "required": required}


# 구조화 피부 상세(#5) — 각 관찰 부면을 {label, description}로. V2 SkinPerception의
# 사용자 노출 축(내부 confidence/sensitivity 제외)에 대응.
SKIN_PERCEPTION_ASPECTS = (
  "texture",
  "pores",
  "sebumDryness",
  "shineDistribution",
  "shineType",
  "pigmentation",
  "redness",
  "darkCircles",
  "toneUniformity",
)


# 1층 프로파일의 사진 판정(VLM) 부면 — 랜드마크로 불가한 속성만(쌍꺼풀 유형·상/하
# 안검 처짐·애교살·눈썹 숱·광대 위치/볼륨·입술 혈색 대비). 각 부면은 {value(enum),
# confidence(0..1), evidence(한 줄 근거)}. 'unclear'는 정직한 판정 보류값 — 모바일
# faceFeatureProfile 빌더가 unclear·저confidence를 슬롯 null(생략)로 매핑한다.
# 참고: docs/faceData_WEI/AURA_FACE_FEATURE_PROFILE_PLAN_KO_v0.1.md §2.2
FEATURE_OBSERVATION_ENUMS: dict[str, tuple[str, ...]] = {
  "eyelidType": ("monolid", "inner", "outer", "hooded", "unclear"),
  "upperLidHooding": ("none", "mild", "pronounced", "unclear"),
  "lowerLidSagging": ("none", "mild", "pronounced", "unclear"),
  "aegyoSal": ("present", "absent", "unclear"),
  "browDensity": ("sparse", "medium", "dense", "unclear"),
  "cheekboneHeight": ("low", "mid", "high", "unclear"),
  "cheekVolume": ("flat", "medium", "full", "unclear"),
  # 부위별 대비(주변 피부 대비 명도/색 대비) — 2층 시각 무게 지도의 입력.
  # lip은 lipColorContrast로 이미 있고 brow는 browDensity를 프록시로 쓴다. 눈·볼만
  # 신설해 4부위 대비를 완성한다(리서치 W-1/W-3: 시각 무게 = 부위별 대비).
  "eyeContrast": ("low", "medium", "high", "unclear"),
  "cheekContrast": ("low", "medium", "high", "unclear"),
  "lipColorContrast": ("low", "medium", "high", "unclear"),
}
FEATURE_OBSERVATION_KEYS = tuple(FEATURE_OBSERVATION_ENUMS.keys())


def _feature_observation(values: tuple[str, ...]) -> dict[str, Any]:
  return _obj(
    {
      "value": {"type": "string", "enum": list(values)},
      "confidence": {"type": "number", "minimum": 0, "maximum": 1},
      "evidence": _STR,
    },
    ["value", "confidence", "evidence"],
  )


def _build_feature_observations_schema() -> dict[str, Any]:
  return _obj(
    {
      key: _feature_observation(values)
      for key, values in FEATURE_OBSERVATION_ENUMS.items()
    },
    list(FEATURE_OBSERVATION_KEYS),
  )


# AR 필터 색 개인화(B)용 — 부위별 메이크업 색을 hex로. makeupGuideline(텍스트)은
# 그대로 두고 색만 담는 병렬 필드라 기존 파서를 깨지 않는다. 값은 사용자의
# measuredPersonalColor에 근거한, 해당 부위에 실제로 어울리는 메이크업 색.
# AR 레시피 부위(lip/blush/eyeshadow/brow/eyeliner)와 매칭 — foundation은 스킨-세이프라 제외.
MAKEUP_COLOR_KEYS = ("lip", "blush", "eyeshadow", "brow", "eyeliner")
_HEX_COLOR = {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$"}


def _build_face_analysis_tool_schema() -> dict[str, Any]:
  guideline_keys = ["brow", "blush", "highlight", "eyeshadow", "eyeliner", "lip"]
  region_note = _obj(
    {"insight": _STR, "evidence": _STR, "recommendation": _STR},
    ["insight", "evidence", "recommendation"],
  )
  styling_row = _obj(
    {"category": _STR, "note": _STR, "why": _STR},
    ["category", "note", "why"],
  )
  styling_look = _obj(
    {
      "title": _STR,
      "subtitle": _STR,
      "description": _STR,
      "rows": {
        "type": "array",
        "minItems": 4,
        "maxItems": 6,
        "items": styling_row,
      },
    },
    ["title", "subtitle", "description", "rows"],
  )
  axis = _obj(
    {"key": _STR, "leftLabel": _STR, "rightLabel": _STR, "value": {"type": "number"}},
    ["key", "leftLabel", "rightLabel", "value"],
  )
  skin_aspect = _obj({"label": _STR, "description": _STR}, ["label", "description"])
  skin_perception = _obj(
    {aspect: skin_aspect for aspect in SKIN_PERCEPTION_ASPECTS},
    list(SKIN_PERCEPTION_ASPECTS),
  )
  return _obj(
    {
      "faceShape": _STR,
      "skinType": _STR,
      "recommendedMood": _STR,
      "summary": _STR,
      "shortSummary": _STR,
      "skinAnalysisSummary": _STR,
      "skinPerception": skin_perception,
      "baseMakeupGuide": _STR,
      "makeupGuideline": _obj({key: _STR for key in guideline_keys}, guideline_keys),
      "makeupColors": _obj(
        {key: _HEX_COLOR for key in MAKEUP_COLOR_KEYS},
        list(MAKEUP_COLOR_KEYS),
      ),
      "recommendedMakeups": {
        "type": "array",
        "minItems": RECOMMENDED_MAKEUP_COUNT,
        "maxItems": RECOMMENDED_MAKEUP_COUNT,
        "items": _obj(
          {
            "title": _STR,
            "subtitle": _STR,
            "description": _STR,
            "tags": {
              "type": "array",
              "minItems": 2,
              "maxItems": 2,
              "items": _STR,
            },
          },
          ["title", "subtitle", "description", "tags"],
        ),
      },
      "regionNotes": _obj(
        {region: region_note for region in ("upper", "mid", "lower", "jaw")},
        ["upper", "mid", "lower", "jaw"],
      ),
      "impressionNotes": _obj(
        {
          "overallMood": _STR,
          "paragraph": _STR,
          "keywords": {
            "type": "array",
            "minItems": 3,
            "maxItems": 5,
            "items": _STR,
          },
          "axes": {"type": "array", "minItems": 2, "maxItems": 2, "items": axis},
        },
        ["overallMood", "paragraph", "keywords", "axes"],
      ),
      "stylingLooks": _obj(
        {"natural": styling_look, "glam": styling_look},
        ["natural", "glam"],
      ),
      "featureObservations": _build_feature_observations_schema(),
    },
    [
      "faceShape",
      "skinType",
      "recommendedMood",
      "summary",
      "shortSummary",
      "skinAnalysisSummary",
      "skinPerception",
      "baseMakeupGuide",
      "makeupGuideline",
      "makeupColors",
      "recommendedMakeups",
      "regionNotes",
      "impressionNotes",
      "stylingLooks",
      "featureObservations",
    ],
  )


FACE_ANALYSIS_TOOL_SCHEMA = _build_face_analysis_tool_schema()

# ── 팬아웃(Phase 4) 스키마 스캐폴딩 ─────────────────────────────────────────
# 단일 소스(FACE_ANALYSIS_TOOL_SCHEMA)에서 부분집합으로 파생해 드리프트를 원천 차단.
# 앵커 콜이 공유값(faceShape/skinType/recommendedMood)을 단독 저작하고, A/B는 그 3필드를
# 빼서 top-level 키가 disjoint → merge는 shallow update로 자명. 검증은 merge 후 전체
# 결과에 기존 _validate_analysis_result_before_normalization 1회로 재사용한다.
ANCHOR_FIELD_KEYS = ("faceShape", "skinType", "recommendedMood")
PERCEPTION_FIELD_KEYS = (
  "summary",
  "shortSummary",
  "skinAnalysisSummary",
  "regionNotes",
  "impressionNotes",
)
# prescription을 처방(makeup)과 스타일링으로 분할해 병목 레그를 낮춘다(5분할).
PRESCRIPTION_FIELD_KEYS = (
  "baseMakeupGuide",
  "makeupGuideline",
  "makeupColors",
  "recommendedMakeups",
)
STYLING_FIELD_KEYS = ("stylingLooks",)
# 구조화 피부(#5)는 독립 병렬 레그로 둔다 — perception/prescription이 이미 ~23s라
# 어느 쪽에 붙이면 30s를 넘긴다. 별도 레그면 max(레그)에 흡수돼 지연 flat.
SKIN_FIELD_KEYS = ("skinPerception",)
# 사진 판정(VLM) 특징 부면도 skin과 같은 이유로 독립 레그 — 짧은 enum이라 지연은
# max(레그)에 흡수. skin(피부)과 성격이 달라 별도 레그로 분리한다.
FEATURE_FIELD_KEYS = ("featureObservations",)


def _subset_face_analysis_schema(keys: tuple[str, ...]) -> dict[str, Any]:
  properties = FACE_ANALYSIS_TOOL_SCHEMA["properties"]
  return _obj({key: properties[key] for key in keys}, list(keys))


ANCHOR_TOOL_SCHEMA = _subset_face_analysis_schema(ANCHOR_FIELD_KEYS)
PERCEPTION_TOOL_SCHEMA = _subset_face_analysis_schema(PERCEPTION_FIELD_KEYS)
PRESCRIPTION_TOOL_SCHEMA = _subset_face_analysis_schema(PRESCRIPTION_FIELD_KEYS)
STYLING_TOOL_SCHEMA = _subset_face_analysis_schema(STYLING_FIELD_KEYS)
SKIN_TOOL_SCHEMA = _subset_face_analysis_schema(SKIN_FIELD_KEYS)
FEATURE_TOOL_SCHEMA = _subset_face_analysis_schema(FEATURE_FIELD_KEYS)

# 드리프트 가드(임포트 시 즉시 실패): 그룹 키가 서로 겹치지 않고 합집합이 전체 required와
# 정확히 일치해야 한다. 전체 스키마에 필드를 추가하고 그룹 배정을 빠뜨리면 여기서 잡힌다.
_FANOUT_GROUP_KEYS = (
  ANCHOR_FIELD_KEYS
  + PERCEPTION_FIELD_KEYS
  + PRESCRIPTION_FIELD_KEYS
  + STYLING_FIELD_KEYS
  + SKIN_FIELD_KEYS
  + FEATURE_FIELD_KEYS
)
if len(_FANOUT_GROUP_KEYS) != len(set(_FANOUT_GROUP_KEYS)):
  raise RuntimeError("fan-out 스키마 그룹 키가 겹칩니다(anchor/perception/prescription).")
if set(_FANOUT_GROUP_KEYS) != set(FACE_ANALYSIS_TOOL_SCHEMA["required"]):
  raise RuntimeError(
    "fan-out 스키마 그룹의 합집합이 FACE_ANALYSIS_TOOL_SCHEMA required와 불일치합니다. "
    "전체 스키마에 필드를 추가했다면 anchor/perception/prescription 중 하나에 배정하세요.",
  )

# 그룹별 스코프 지시문 — forced tool use가 출력 형태를 강제하지만, 지시문으로 어떤
# 파트를 쓸지 명시해 모델 혼선을 줄인다(A/B는 앵커값 재판정 금지도 함께).
_FANOUT_ANCHOR_DIRECTIVE = (
  "이번 호출에서는 faceShape, skinType, recommendedMood 세 값만 판정해서 반환해. "
  "다른 필드는 만들지 마."
)
_FANOUT_PERCEPTION_DIRECTIVE = (
  "이번 호출에서는 summary, shortSummary, skinAnalysisSummary, regionNotes, "
  "impressionNotes만 작성해. 메이크업 가이드·추천·스타일링은 만들지 마."
)
_FANOUT_PRESCRIPTION_DIRECTIVE = (
  "이번 호출에서는 baseMakeupGuide, makeupGuideline, recommendedMakeups만 작성해. "
  "스타일링 룩·얼굴형·피부타입·무드·요약·부위노트·인상노트는 만들지 마."
)
_FANOUT_STYLING_DIRECTIVE = (
  "이번 호출에서는 stylingLooks 하나만 작성해(natural·glam). 얼굴형·피부타입·무드·"
  "요약·부위노트·인상노트·메이크업 가이드는 만들지 마."
)
_FANOUT_SKIN_DIRECTIVE = (
  "이번 호출에서는 skinPerception 하나만 작성해. 사진에서 관찰 가능한 피부 부면을 "
  "각각 {label(짧은 상태명), description(한 문장 관찰 설명)}으로. 의학적 진단은 하지 마."
)
_FANOUT_FEATURE_DIRECTIVE = (
  "이번 호출에서는 featureObservations 하나만 작성해. 사진에서만 판정 가능한 이목구비 "
  "형태 부면을 각각 {value(정해진 enum 중 하나), confidence(0..1), evidence(한 줄 근거)}로. "
  "확실하지 않으면 value를 반드시 'unclear'로 두고 confidence를 낮게. 지어내지 마."
)

DEFAULT_IMPRESSION_AXES = (
  {"key": "softness", "leftLabel": "부드러움", "rightLabel": "또렷함", "value": 0.0},
  {"key": "vividness", "leftLabel": "차분함", "rightLabel": "화사함", "value": 0.0},
)

ANALYSIS_OUTPUT_FIELD_GUIDE = (
  "Top-level JSON keys: faceShape, skinType, "
  "recommendedMood, tags, summary, shortSummary, skinAnalysisSummary, "
  "baseMakeupGuide, makeupGuideline, recommendedMakeups, beautyGuide, "
  "regionNotes, impressionNotes, stylingLooks. "
  "makeupGuideline keys: brow, blush, highlight, eyeshadow, eyeliner, lip. "
  "makeupColors keys: lip, blush, eyeshadow, brow, eyeliner. Each value is a "
  "'#RRGGBB' hex color grounded in the user's measuredPersonalColor and "
  "consistent with makeupGuideline, natural makeup saturation (no neon). "
  "recommendedMakeups must be exactly 1 object. The object keys: title, "
  "subtitle, description, tags. tags must contain exactly 2 strings. "
  "beautyGuide is optional but recommended. beautyGuide keys: bestColors, "
  "bestNeutrals, bestAccentColors, avoidColors, hairColorDirection, "
  "hairstyleDirection, finalFormula. "
  "skinPerception keys: texture, pores, sebumDryness, shineDistribution, "
  "shineType, pigmentation, redness, darkCircles, toneUniformity. Each value "
  "is an object with keys label (short Korean status name) and description "
  "(one short Korean observation sentence, no medical diagnosis). "
  "regionNotes keys: upper, mid, lower, jaw. Each value is an object with "
  "keys insight, evidence, recommendation (all short Korean sentences): "
  "insight = the impression conclusion for that region, evidence = which "
  "measured signals make it read that way (interpreted, never raw numbers), "
  "recommendation = the concrete makeup move that follows. "
  "impressionNotes keys: overallMood (<=18 chars), keywords (array of 3-5 "
  "short Korean strings), paragraph (<=2 sentences), axes (array of exactly "
  "2 objects, each with keys key, leftLabel, rightLabel, value(-1..1)). "
  "stylingLooks keys: natural, glam. Each is an object with title (<=12 "
  "chars), subtitle (<=16 chars), description (<=2 sentences), and rows "
  "(array of 4-6 objects). Each row object has keys category (one of base, "
  "brow, eyeshadow, eyeliner, blush, lip), note (how that category is "
  "styled for this look), why (why it suits this user). natural and glam "
  "must be grounded in the same face/personal-color analysis but differ in "
  "intensity — natural is a light daily version, glam is a stronger, more "
  "defined version. "
  "featureObservations keys: eyelidType, upperLidHooding, lowerLidSagging, "
  "aegyoSal, browDensity, cheekboneHeight, cheekVolume, eyeContrast, "
  "cheekContrast, lipColorContrast. "
  "Each value is an object with keys value (one of the allowed enum options, "
  "or 'unclear' when the photo does not permit a confident call), confidence "
  "(0..1), evidence (one short Korean sentence citing the photo). Never invent "
  "a definite value when unsure — use 'unclear'."
)

# ── 지시문 모듈화 (레그별 슬림 프롬프트용) ────────────────────────────────────
# 모든 레그가 공유하는 코어(성별·측정 해석·한국어·중복금지)와 섹션별 지시문으로
# 분리. 단일 경로는 코어+전 섹션+필드가이드를 합쳐 쓰고(동일 내용), 팬아웃은 각
# 레그가 코어+자기 섹션만 받아 입력 토큰을 줄인다(사진·측정값은 전 레그 유지).
_ANALYSIS_CORE_INSTRUCTIONS = (
  "Act as a professional personal color analyst, makeup artist, hairstylist, and image consultant. "
  "사용자의 얼굴 사진을 분석해서 개인 맞춤 뷰티 분석 보고서를 만들어줘. "
  "피부 톤, 언더톤, 대비감, 눈동자와 머리 색, 얼굴형, 눈매, 광대/볼 구조, 눈썹, 입술, 전체 분위기를 함께 판단해. "
  "전문 퍼스널 컬러 컨설턴트와 메이크업 아티스트가 실제 고객을 상담하듯, 사진 속 실제 얼굴 특징과 컬러링을 근거로 판단해. "
  "사진 조명이나 안경/그림자 때문에 확정이 어려운 내용은 과하게 단정하지 말고 가장 가능성 높은 방향으로 표현해. "
  "요청 메타데이터의 profileGender는 계정에 저장된 성별이다. 사진으로 성별을 추정하지 말고 이 값을 따라. "
  "female이면 여성 메이크업 중심으로, male이면 남성 그루밍 메이크업 중심으로 추천하고, "
  "unspecified거나 값이 없으면 성별을 추정하지 않는 중성적인 표현을 기본 방향으로 사용해. "
  "사진 속 사용자의 스타일은 보존하고, 메이크업 추천이 사용자의 성별 표현을 바꾸거나 다른 성별처럼 보이게 만들면 안 돼. "
  "반드시 한국어 JSON 객체 하나만 반환해. "
  "퍼스널 컬러와 톤 요약은 절대 새로 판정하거나 출력하지 마. 기기 측정값은 메이크업 색 선택의 근거로만 사용해. "
  "간결하게 써 — 같은 내용을 필드 간·문장 간 반복하지 말고, 라벨(label)을 설명(description)에서 그대로 재서술하지 마. "
  "요청 메타데이터의 faceVerticalThirds.measurementMode가 full_vertical_thirds이면 검증된 상안부/중안부/하안부 실측값을 "
  "faceShape 판단과 summary, makeupGuideline의 음영/블러셔/눈썹 배치에 자연스럽게 반영해. "
  "faceVerticalThirds.faceLengthJudgment가 있으면 얼굴 가로/세로 길이 분류는 그 verdict를 그대로 따라 "
  "(wide=가로 폭이 있는 편, average=평균 범위, long=세로로 긴 편, borderline_wide/borderline_long=경계라 단정 금지, "
  "indeterminate=판정 보류) 비율 숫자나 사진으로 재판정하지 마. "
  "measurementMode가 middle_lower_only이면 중안부와 하안부의 상대 길이만 사용할 수 있고, 헤어라인·이마·상안부·전체 얼굴 길이·3분할 우세를 사진이나 평균값으로 추론하지 마. "
  "요청 메타데이터에 face3d(기기 ARKit 얼굴 메시로 실측한 정규화 3D 지표)가 있으면 얼굴 입체감 표현과 "
  "makeupGuideline의 음영/하이라이트 배치에 근거로 반영해. 기본 지표는 noseTipProjection 코끝 돌출, "
  "chinProjection 턱 전방 볼록면(Pogonion) 돌출, upperLipToELine/lowerLipToELine 입술-E라인 signed 거리 "
  "(양수는 앞, 음수는 뒤), centralProjectionScore 얼굴 중앙부 입체감이야. Tier-2 지표는 noseLength 코뿌리-코끝 길이, "
  "nasalBridgeStraightness 코뿌리-코끝 선에 대한 콧대 RMS 이탈량(작을수록 기준선에 가까움), nasalAxisDeviation 코축 좌우 편위 "
  "(피사체 기준 음수=Left, 양수=Right), alarWidth alare-alare 콧볼 폭, malarProjectionLeft/Right 좌우 앞광대의 전방 돌출이야. "
  "face3d 각 metric의 value는 얼굴 크기로 나눈 무차원 상대값이야. 사용자 출력은 절대 mm·임상 진단·모집단 백분위가 아니고 "
  "숫자로 노출하면 안 되며, value가 null이면 미측정이야. "
  "요청 메타데이터에 faceGeometry2d(정면 사진에서 실측한 2D 기하 지표: 눈 폭·눈 개방도·미간 비율·눈꼬리 기울기 canthalTilt(도)·"
  "눈-눈썹 간격·눈썹 기울기 browSlope(도)·눈썹 봉우리(산) 위치 browApexRatio(0=앞머리..1=꼬리, 이상 ~0.66/안쪽 2/3 지점; "
  "profileGender가 female이면 뚜렷한 아치가 이상, male이면 낮고 평평·직선이 자연스러움)·입 폭·윗입술/아랫입술 두께비·하관 폭 비율·입꼬리 비대칭 — 비율은 무차원, 각도는 도 단위, "
  "Left/Right는 피사체 기준, value가 null이면 미측정)가 있으면 눈매/눈썹/입술 판단과 makeupGuideline의 아이라이너·눈썹·립 배치에 근거로 반영해. "
  "각 지표의 confidence가 낮으면(예: 0.5 미만) 그 지표만으로 인상을 단정하지 말고 사진 관찰을 우선하거나 표현을 완화해. "
  "요청 메타데이터에 measuredPersonalColor(기기에서 조명 보정 후 실측한 퍼스널 컬러: tone.top/secondary 12톤 코드, "
  "axes 5축 -1..1(temperature 쿨→웜, value 라이트→딥, chroma 뮤트→비비드, clarity 소프트→클리어, contrast 저→고대비), "
  "부위별 평균 Lab 색값 regions, 부위 간 명도·색차 relations, measurementConfidence 0..1, correction.applied 조명 보정 여부)가 있으면 "
  "makeupGuideline과 색 선택의 근거로 사진 관찰과 함께 사용하고, 실측과 사진이 다르면 실측 축을 우선해. "
  "단 status가 insufficient이거나 measurementConfidence가 낮으면 사진 관찰을 우선하고, 영문 톤 코드(autumn_muted 등)는 그대로 쓰지 말고 한국어로 풀어 써. "
  "요청 메타데이터의 measurements는 위 실측 지표들의 저장 기록이지만, faceVerticalThirds 원본 H는 AI 입력에서 제외돼 있어. 세로 비율은 검증된 요약 필드만 사용해. "
  "실측 지표(faceVerticalThirds, face3d, faceGeometry2d, measuredPersonalColor)가 사진 관찰과 다르면 실측 지표를 우선하되, "
  "수치를 그대로 나열하지 말고 해석해서 문장에 녹여 써. "
  "단일 지표 하나만으로 성격이나 인상을 단정하지 마. 예를 들어 중안부 길이만으로 '온화한 인상'이라고 쓰지 말고, "
  "눈꼬리 방향·입꼬리 곡선·볼륨·윤곽 흐름처럼 둘 이상의 관찰이 함께 있을 때만 인상어를 연결해. "
)
_ANALYSIS_SEC_ANCHOR = (
  "앱 상단 요약에 바로 쓰이도록 faceShape와 recommendedMood를 정확하고 짧게 채워. "
  "faceShape는 얼굴형과 인상 특징을 짧게 작성해. "
  "skinType은 사진에서 관찰한 피부 타입을 짧은 한국어(예: 중성, 복합성, 건성 등)로 작성해. "
  "recommendedMood는 18자 이내의 짧은 무드명으로 작성하고, 긴 설명 문장이나 이유, 쉼표로 이어지는 긴 문구를 쓰지 마. "
)
_ANALYSIS_SEC_PERCEPTION = (
  "summary는 컬러/메이크업/헤어 방향을 한 번에 이해할 수 있게 두 문장 이내로 작성해. "
  "shortSummary와 skinAnalysisSummary도 각각 두 문장 이내로 제한해. "
  "skinAnalysisSummary는 피부 결, 광, 붉은기, 톤 균일감처럼 사진에서 관찰 가능한 표현만 다루고 의학적 진단은 하지 마. "
  "regionNotes는 top-level 필드로 상안부(upper: 이마·눈썹·눈)·중안부(mid: 코·인중·볼)·하안부(lower: 입술)·"
  "광대와 턱(jaw) 4개 부위 각각을 {insight, evidence, recommendation} 객체로 채워. "
  "insight는 그 부위의 인상 결론을 한 문장, evidence는 위에서 설명한 실측 지표 중 무엇 때문에 그렇게 보이는지를 "
  "숫자 없이 해석해서 한 문장(지표가 없으면 사진 관찰 근거), recommendation은 그래서 어떤 메이크업을 어떻게 하면 "
  "좋은지 한 문장으로 써. 세 문장 모두 숫자·mm·백분위를 노출하지 마. "
  "impressionNotes는 top-level 필드로 overallMood(전체 인상을 18자 이내로), keywords(전체 인상 키워드 3~5개 배열), "
  "paragraph(전체 인상을 종합하는 두 문장 이내 설명)를 포함해. impressionNotes는 전체 결론만 쓰고, "
  "regionNotes는 그 결론의 부위별 근거와 실행 가이드만 써서 같은 문장을 반복하지 마. "
  "axes는 인상을 2개 축으로 배치: 각 {key, leftLabel, rightLabel, value(-1..1)}. "
  "예: 부드러움↔또렷함, 차분함↔화사함. 숫자는 사용자에게 노출되지 않으니 인상 위치만 정직하게. "
)
_ANALYSIS_SEC_SKIN = (
  "skinPerception은 top-level 필드로 texture(피부결), pores(모공), sebumDryness(유수분), "
  "shineDistribution(유분 분포), shineType(광 타입), pigmentation(색소), redness(붉은기), "
  "darkCircles(다크서클), toneUniformity(톤 균일감) 9개 부면 각각을 {label(짧은 상태명), "
  "description(사진에서 관찰 가능한 한 문장, 의학적 진단 금지)}로 채워. "
)
_ANALYSIS_SEC_FEATURE = (
  "featureObservations는 top-level 필드로, 사진에서만 판정 가능한 이목구비 형태 부면을 "
  "각각 {value, confidence, evidence}로 채워. value는 정해진 enum 중 하나여야 해: "
  "eyelidType(monolid 무쌍/inner 속쌍/outer 겉쌍/hooded 헐린눈/unclear), "
  "upperLidHooding 상안검 처짐(none/mild/pronounced/unclear), "
  "lowerLidSagging 하안검 처짐(none/mild/pronounced/unclear) — 상안검과 하안검을 각각 따로 판정해, "
  "aegyoSal 애교살(present/absent/unclear), browDensity 눈썹 숱(sparse/medium/dense/unclear), "
  "cheekboneHeight 광대 위치(low/mid/high/unclear), cheekVolume 볼 볼륨(flat/medium/full/unclear), "
  "eyeContrast 눈매 대비(주변 피부 대비 눈·속눈썹·라인의 명도 대비, low/medium/high/unclear), "
  "cheekContrast 볼 대비(주변 피부 대비 볼 혈색·음영 대비, low/medium/high/unclear), "
  "lipColorContrast 입술 혈색 대비(low/medium/high/unclear). "
  "confidence는 0..1 확신도, evidence는 그렇게 본 사진 근거 한 줄. "
  "조명·각도·안경·그림자로 확실치 않으면 value를 'unclear'로 두고 confidence를 낮춰 — 절대 지어내지 마. "
  "이 필드는 사진 형태 판정만 담고 색·메이크업 처방은 만들지 마. "
)
_ANALYSIS_SEC_PRESCRIPTION = (
  "baseMakeupGuide는 top-level 필드로 작성하고, makeupGuideline 안에는 brow, eyeshadow, lip, highlight, eyeliner, blush만 작성해. "
  "makeupGuideline의 각 항목은 촬영 사진과 보고서 판단을 바탕으로 한 문장으로 짧게 작성해. "
  "makeupGuideline에는 단순 색상 추천뿐 아니라 배치 가이드도 포함해. "
  "makeupColors는 top-level 필드로 lip, blush, eyeshadow, brow, eyeliner 각각에 대해 "
  "'#RRGGBB' 6자리 hex 색을 하나씩 채워. 이 색은 요청 메타데이터의 measuredPersonalColor "
  "(실측 퍼스널 컬러 톤·축)에 근거해서, 그 부위에 실제로 어울리는 메이크업 제품 색이어야 해 "
  "— makeupGuideline 텍스트에서 말한 색과 일관되게. 립은 실제 립 제품 색, 블러셔는 볼 발색, "
  "eyeshadow는 눈두덩 색, brow는 눈썹 색, eyeliner는 라인 색. measuredPersonalColor가 "
  "insufficient거나 없으면 사진 관찰에 근거한 무난한 색으로. AR 필터에 그대로 쓰이니 "
  "실물 메이크업으로 자연스러운 채도·명도를 지켜(형광·순색 금지). "
  "brow는 눈썹 모양/결/두께 방향, eyeshadow는 색과 눈두덩이 배치, lip은 립 컬러와 립라인 방향, "
  "highlight는 T존/눈밑/광대 등 위치, eyeliner는 점막/꼬리/두께, blush는 광대/볼 위치와 확산 방향을 설명해. "
  "추천 메이크업은 위 보고서에서 판단한 퍼스널 컬러, 얼굴형, 톤 요약, 추천 무드, 눈매, 입술 톤, 헤어 방향에 근거해서 정확히 1개만 작성해. "
  "recommendedMakeups는 단순 텍스트 추천이 아니라, 이후 같은 사용자 얼굴 사진에 적용할 데일리 메이크업 이미지 1장의 콘셉트가 되어야 해. "
  "recommendedMakeups 항목은 보고서의 어떤 판단 때문에 그 데일리 룩이 어울리는지 description에 명확히 반영해. "
  "추천은 민낯이나 기본 보정 사진처럼 보이면 안 되지만, 사용자의 성별 표현과 일상 스타일에 맞는 자연스러운 데일리 강도여야 해. "
  "남성 사용자라면 피부 톤 보정, 눈썹 결 정리, 자연스러운 음영, 립밤/톤 보정, 유분 정돈처럼 남성 그루밍에 어울리는 방식으로 작성해. "
  "여성 사용자라면 퍼스널 컬러에 맞춘 베이스, 아이, 블러셔, 립 포인트를 자연스럽게 제안해. "
  "다른 사람이나 일반 모델 기준이 아니라 업로드된 사용자 얼굴에 어울리는 추천으로만 작성해. "
  "추천명은 클리어 & 글로시, 과즙상, 깔끔한 또렷함 같은 고정 예시를 반복하지 말고 사진 분석 결과에 맞춰 새롭게 판단해. "
  "비추천 메이크업, 피해야 할 메이크업, avoidedMakeups는 절대 생성하지 마. "
  "각 추천은 앱 카드에 들어갈 수 있게 title은 12자 이내, subtitle은 16자 이내, description은 두 줄 이내, tags는 2개만 포함해. "
  "텍스트는 짧고 실용적으로 작성하고, 일반론이나 누구에게나 맞는 조언을 쓰지 마. "
)
_ANALYSIS_SEC_STYLING = (
  "stylingLooks는 top-level 필드로 natural과 glam 두 키를 포함해. 같은 사용자 얼굴 특징과 퍼스널 컬러에 근거하되, "
  "natural과 glam은 강도가 아니라 전략을 다르게 해 — natural은 본연의 결을 살려 은은하게 정돈하는 방향, "
  "glam은 눈·입 등 한두 곳에 포인트를 집중해 대비를 끌어올리는 방향으로, 무엇을 강조하고 무엇을 덜어낼지가 서로 달라야 해. "
  "각각 title, subtitle, description과 rows(4~6개, category는 base/brow/eyeshadow/eyeliner/blush/lip 중 하나, "
  "note는 그 부위를 구체적으로 어떻게 표현하는지 제품 질감·기법까지, "
  "why는 이 사용자의 실측 특징(눈꼬리 방향·입술 두께·퍼스널컬러 등)과 연결해 왜 어울리는지 한 문장)을 채워. "
)
# 팬아웃 레그별 섹션 매핑 — stage → 지시문 섹션.
_ANALYSIS_STAGE_SECTIONS = {
  "anchor": _ANALYSIS_SEC_ANCHOR,
  "perception": _ANALYSIS_SEC_PERCEPTION,
  "skin": _ANALYSIS_SEC_SKIN,
  "feature": _ANALYSIS_SEC_FEATURE,
  "prescription": _ANALYSIS_SEC_PRESCRIPTION,
  "styling": _ANALYSIS_SEC_STYLING,
}

MAKEUP_RECOMMENDATION_ROLES = ("anchor",)
MAKEUP_RECOMMENDATION_AR_FILTERS = {
  "anchor": "filter-milky-strawberry-pink",
  "bold": "filter-clean-smoky-city",
  "discovery": "filter-plum-syrup-gloss",
}
MAKEUP_RECOMMENDATION_OUTPUT_SCHEMA = {
  "type": "object",
  "properties": {
    "looks": {
      "type": "array",
      "minItems": 1,
      "maxItems": 1,
      "items": {
        "type": "object",
        "properties": {
          "role": {"type": "string", "enum": list(MAKEUP_RECOMMENDATION_ROLES)},
          "title": {"type": "string"},
          "subtitle": {"type": "string"},
          "summary": {"type": "string"},
          "tags": {
            "type": "array",
            "minItems": 2,
            "maxItems": 4,
            "items": {"type": "string"},
          },
          "reasons": {
            "type": "array",
            "minItems": 2,
            "maxItems": 3,
            "items": {"type": "string"},
          },
          "durationMinutes": {"type": "integer", "minimum": 5, "maximum": 60},
          "difficulty": {"type": "string", "enum": ["easy", "medium", "advanced"]},
          "steps": {
            "type": "array",
            "minItems": 5,
            "maxItems": 5,
            "items": {
              "type": "object",
              "properties": {
                "area": {"type": "string", "enum": ["base", "brow", "eye", "cheek", "lip"]},
                "instruction": {"type": "string"},
                "order": {"type": "integer", "minimum": 1, "maximum": 5},
              },
              "required": ["area", "instruction", "order"],
              "additionalProperties": False,
            },
          },
          "products": {
            "type": "array",
            "minItems": 5,
            "maxItems": 5,
            "items": {
              "type": "object",
              "properties": {
                "area": {"type": "string", "enum": ["base", "brow", "eye", "cheek", "lip"]},
                "brandName": {"type": "string"},
                "productName": {"type": "string"},
                "shadeName": {"type": "string"},
                "reason": {"type": "string"},
              },
              "required": ["area", "brandName", "productName", "shadeName", "reason"],
              "additionalProperties": False,
            },
          },
        },
        "required": [
          "role",
          "title",
          "subtitle",
          "summary",
          "tags",
          "reasons",
          "durationMinutes",
          "difficulty",
          "steps",
          "products",
        ],
        "additionalProperties": False,
      },
    },
  },
  "required": ["looks"],
  "additionalProperties": False,
}


class OpenAIAnalysisService:
  def __init__(self, settings: Settings) -> None:
    self.settings = settings
    # boto3 client는 생성 비용(서비스 모델 로딩·엔드포인트 리졸브)이 커서
    # 인스턴스 수명 동안 재사용한다(설정 불변 전제, boto3 client는 thread-safe).
    self._s3_client_cache: Any = None
    self._bedrock_runtime_client_cache: Any = None

  def _client(self):
    if OpenAI is None:
      raise AppError(
        503,
        "OPENAI_SDK_NOT_INSTALLED",
        "The openai package is required for AI analysis.",
      )

    if not self.settings.openai_api_key:
      raise AppError(503, "OPENAI_NOT_CONFIGURED", "OPENAI_API_KEY is required.")

    # 이미지 생성은 반드시 실제 OpenAI를 호출한다. OPENAI_BASE_URL(예: bedrock-mantle
    # 채팅 전용 게이트웨이)이 프로세스 환경으로 새어들어오면 이미지 모델이 404가 나므로,
    # base_url을 명시해 환경변수 오염과 무관하게 api.openai.com으로 고정한다.
    return OpenAI(
      api_key=self.settings.openai_api_key,
      base_url="https://api.openai.com/v1",
    )

  def _s3_client(self):
    if self._s3_client_cache is not None:
      return self._s3_client_cache

    client_kwargs = {
      "region_name": self.settings.aws_region,
      "config": Config(
        connect_timeout=30,
        read_timeout=60,
        retries={"max_attempts": 1},
      ),
    }

    if self.settings.aws_access_key_id and self.settings.aws_secret_access_key:
      client_kwargs.update(
        {
          "aws_access_key_id": self.settings.aws_access_key_id,
          "aws_secret_access_key": self.settings.aws_secret_access_key,
        },
      )

    self._s3_client_cache = boto3.client("s3", **client_kwargs)
    return self._s3_client_cache

  def _bedrock_runtime_client(self):
    if self._bedrock_runtime_client_cache is not None:
      return self._bedrock_runtime_client_cache

    client_kwargs = {
      "region_name": self.settings.effective_bedrock_analysis_region,
      "config": Config(
        connect_timeout=30,
        read_timeout=120,
        retries={"max_attempts": 1},
      ),
    }

    if self.settings.aws_access_key_id and self.settings.aws_secret_access_key:
      client_kwargs.update(
        {
          "aws_access_key_id": self.settings.aws_access_key_id,
          "aws_secret_access_key": self.settings.aws_secret_access_key,
        },
      )

    self._bedrock_runtime_client_cache = boto3.client(
      "bedrock-runtime",
      **client_kwargs,
    )
    return self._bedrock_runtime_client_cache
  def _extract_remote_image_url(self, payload: dict[str, Any]) -> str | None:
    bucket = payload.get("bucket")
    object_key = payload.get("objectKey") or payload.get("object_key")

    if isinstance(bucket, str) and isinstance(object_key, str) and bucket and object_key:
      return f"s3://{bucket}/{object_key.lstrip('/')}"

    for key in ("imageUrl", "cdnUrl", "image_url", "previewUrl"):
      value = payload.get(key)

      if isinstance(value, str) and value.startswith(("s3://", "http://", "https://")):
        return value

    return None

  def _infer_content_type(self, payload: dict[str, Any]) -> str:
    content_type = payload.get("contentType") or payload.get("content_type")

    if isinstance(content_type, str) and content_type.startswith("image/"):
      return content_type

    image_url = self._extract_remote_image_url(payload) or ""
    normalized_url = image_url.split("?", 1)[0].lower()

    if normalized_url.endswith(".png"):
      return "image/png"

    if normalized_url.endswith(".webp"):
      return "image/webp"

    return "image/jpeg"

  def _source_file_suffix(self, content_type: str) -> str:
    if content_type == "image/png":
      return ".png"

    if content_type == "image/webp":
      return ".webp"

    return ".jpg"

  def _clamp_image_quality(self, value: int | None, fallback: int = 82) -> int:
    try:
      quality = int(value if value is not None else fallback)
    except (TypeError, ValueError):
      quality = fallback

    return max(1, min(100, quality))

  def _clamp_image_max_edge(self, value: int | None) -> int:
    try:
      max_edge = int(value if value is not None else 0)
    except (TypeError, ValueError):
      return 0

    return max(0, max_edge)

  def _convert_image_for_speed(
    self,
    image_bytes: bytes,
    *,
    source_content_type: str,
    output_format: str,
    max_edge: int,
    quality: int,
    context: str,
  ) -> tuple[bytes, str]:
    if Image is None or ImageOps is None:
      logger.warning("[aura:openai] image-optimization:skipped context=%s reason=pillow-missing", context)
      return image_bytes, source_content_type

    normalized_output_format = output_format.strip().lower()

    if normalized_output_format == "jpg":
      normalized_output_format = "jpeg"

    if normalized_output_format not in {"jpeg", "png", "webp"}:
      normalized_output_format = "jpeg"

    output_content_type = f"image/{normalized_output_format}"
    max_edge = self._clamp_image_max_edge(max_edge)
    quality = self._clamp_image_quality(quality)
    started_at = time.monotonic()

    try:
      with Image.open(BytesIO(image_bytes)) as opened_image:
        image = ImageOps.exif_transpose(opened_image)
        original_width, original_height = image.size
        resized = False

        if max_edge and max(original_width, original_height) > max_edge:
          scale = max_edge / max(original_width, original_height)
          next_size = (
            max(1, round(original_width * scale)),
            max(1, round(original_height * scale)),
          )
          resampling = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
          image = image.resize(next_size, resampling)
          resized = True

        if normalized_output_format in {"jpeg", "webp"}:
          if image.mode in {"RGBA", "LA"} or (
            image.mode == "P" and "transparency" in image.info
          ):
            rgba_image = image.convert("RGBA")
            background = Image.new("RGB", rgba_image.size, (255, 255, 255))
            background.paste(rgba_image, mask=rgba_image.getchannel("A"))
            image = background
          elif image.mode != "RGB":
            image = image.convert("RGB")

        output_buffer = BytesIO()

        if normalized_output_format == "jpeg":
          image.save(
            output_buffer,
            format="JPEG",
            quality=quality,
            optimize=True,
            progressive=True,
          )
        elif normalized_output_format == "webp":
          image.save(output_buffer, format="WEBP", quality=quality, method=4)
        else:
          image.save(output_buffer, format="PNG", optimize=True)

      optimized_bytes = output_buffer.getvalue()

      if (
        not resized
        and output_content_type == source_content_type
        and len(optimized_bytes) >= len(image_bytes)
      ):
        return image_bytes, source_content_type

      logger.info(
        "[aura:openai] image-optimization:success context=%s format=%s maxEdge=%s quality=%s size=%sx%s->%sx%s bytes=%s->%s durationMs=%s",
        context,
        normalized_output_format,
        max_edge or "original",
        quality,
        original_width,
        original_height,
        image.size[0],
        image.size[1],
        len(image_bytes),
        len(optimized_bytes),
        round((time.monotonic() - started_at) * 1000),
      )

      return optimized_bytes, output_content_type
    except (UnidentifiedImageError, OSError, ValueError) as exc:
      logger.warning(
        "[aura:openai] image-optimization:skipped context=%s reason=%s",
        context,
        exc.__class__.__name__,
      )
      return image_bytes, source_content_type

  def _prepare_source_image_for_generation(
    self,
    image_bytes: bytes,
    source_content_type: str,
  ) -> tuple[bytes, str]:
    return self._convert_image_for_speed(
      image_bytes,
      source_content_type=source_content_type,
      output_format="jpeg",
      max_edge=self.settings.openai_image_input_max_edge,
      quality=self.settings.openai_image_input_quality,
      context="source-input",
    )

  # Bedrock Claude 이미지 상한(약 5MB) 여유치. 최적화 후에도 초과하면
  # 조용한 invoke 실패 대신 명시적 오류로 돌린다.
  _ANALYSIS_IMAGE_MAX_BYTES = 4_500_000

  def _prepare_source_image_for_analysis(
    self,
    image_bytes: bytes,
    source_content_type: str,
  ) -> tuple[bytes, str]:
    """분석용 사진을 모델 전송 전에 다운스케일한다.

    기존에는 이미지 생성 경로만 최적화하고 분석 경로는 S3 원본을 그대로
    base64로 보냈다 — 대형 사진이면 비용·지연을 넘어 Bedrock 이미지 한도
    초과로 분석 자체가 실패한다. 생성 경로와 동일한 변환기를 재사용한다.
    """
    optimized_bytes, optimized_content_type = self._convert_image_for_speed(
      image_bytes,
      source_content_type=source_content_type,
      output_format="jpeg",
      max_edge=self.settings.openai_image_input_max_edge,
      quality=self.settings.openai_image_input_quality,
      context="analysis-input",
    )

    if len(optimized_bytes) > self._ANALYSIS_IMAGE_MAX_BYTES:
      raise AppError(
        413,
        "SOURCE_IMAGE_TOO_LARGE",
        "분석용 사진이 너무 커요. 다시 촬영해 주세요.",
        {
          "bytes": len(optimized_bytes),
          "maxBytes": self._ANALYSIS_IMAGE_MAX_BYTES,
        },
      )

    return optimized_bytes, optimized_content_type

  def _optimize_generated_image_for_upload(self, image_bytes: bytes) -> bytes:
    output_format, output_compression, _, content_type = self._resolve_makeup_image_output()
    optimized_bytes, _ = self._convert_image_for_speed(
      image_bytes,
      source_content_type=content_type,
      output_format=output_format,
      max_edge=self.settings.openai_image_output_max_edge,
      quality=output_compression if output_compression is not None else 82,
      context="generated-output",
    )

    return optimized_bytes

  def _read_source_image_bytes(self, payload: dict[str, Any]) -> bytes:
    image_url = self._extract_remote_image_url(payload)

    if not image_url:
      raise AppError(
        400,
        "SOURCE_IMAGE_REQUIRED",
        "A source face image is required for makeup recommendation generation.",
      )

    if not image_url.startswith("s3://"):
      raise AppError(
        400,
        "SOURCE_IMAGE_MUST_BE_S3",
        "The source face image must be uploaded to S3 before analysis.",
      )

    bucket, object_key = image_url.removeprefix("s3://").split("/", 1)
    started_at = time.monotonic()
    logger.info("[aura:openai] source-image:read-start bucket=%s key=%s", bucket, object_key)
    image_object = self._s3_client().get_object(Bucket=bucket, Key=object_key)
    image_bytes = image_object["Body"].read()
    logger.info(
      "[aura:openai] source-image:read-success bytes=%s durationMs=%s",
      len(image_bytes),
      round((time.monotonic() - started_at) * 1000),
    )

    return image_bytes

  def _allowed_makeup_recommendation_source_hosts(self) -> set[str]:
    hosts = {
      host.strip().lower()
      for host in (self.settings.makeup_recommendation_source_hosts or "").split(",")
      if host.strip()
    }

    for value in (self.settings.cdn_base_url, self.settings.cloudfront_domain):
      normalized = str(value or "").strip()

      if not normalized:
        continue

      parsed = urlparse(normalized if "://" in normalized else f"https://{normalized}")

      if parsed.hostname:
        hosts.add(parsed.hostname.lower())

    return hosts

  def _read_makeup_recommendation_source(
    self,
    source_image_url: str,
  ) -> tuple[bytes, str]:
    normalized_url = str(source_image_url or "").strip()

    if normalized_url.startswith("s3://"):
      payload = {"imageUrl": normalized_url}
      return self._read_source_image_bytes(payload), self._infer_content_type(payload)

    parsed = urlparse(normalized_url)
    hostname = (parsed.hostname or "").lower()
    allowed_hosts = self._allowed_makeup_recommendation_source_hosts()

    try:
      ip_address(hostname)
    except ValueError:
      is_ip_address = False
    else:
      is_ip_address = True

    if parsed.scheme != "https" or not hostname or is_ip_address or hostname not in allowed_hosts:
      raise AppError(
        400,
        "MAKEUP_RECOMMENDATION_SOURCE_NOT_ALLOWED",
        "The source image must use an approved HTTPS media host.",
      )

    try:
      response = httpx.get(normalized_url, timeout=30, follow_redirects=False)
      response.raise_for_status()
    except httpx.HTTPError as exc:
      raise AppError(
        502,
        "MAKEUP_RECOMMENDATION_SOURCE_UNAVAILABLE",
        "The source face image could not be downloaded.",
      ) from exc

    content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()

    if not content_type.startswith("image/"):
      raise AppError(
        400,
        "MAKEUP_RECOMMENDATION_SOURCE_INVALID",
        "The source URL did not return an image.",
      )

    if not response.content or len(response.content) > 15 * 1024 * 1024:
      raise AppError(
        400,
        "MAKEUP_RECOMMENDATION_SOURCE_SIZE_INVALID",
        "The source image must be between 1 byte and 15 MB.",
      )

    return response.content, content_type

  def _build_personalized_makeup_recommendation_prompt(
    self,
    payload: dict[str, Any],
  ) -> str:
    profile = payload.get("profile") if isinstance(payload.get("profile"), dict) else {}
    refinement = str(payload.get("refinement") or "").strip()
    refinement_guide = {
      "natural": "이전보다 색과 음영을 한 단계 덜어 자연스럽게 조정해.",
      "hip": "질감이나 라인에 감각적인 포인트를 더해 힙하게 조정해.",
      "differentColor": "기존 조건을 유지하면서 주조색을 다른 계열로 바꿔.",
      "replaceProducts": "룩 방향은 유지하되 제품 타입과 색상 제안을 새롭게 바꿔.",
    }.get(refinement, "")
    context = {
      "request": payload.get("prompt"),
      "conditions": payload.get("conditions") if isinstance(payload.get("conditions"), list) else [],
      "personalColor": payload.get("personalColor"),
      "profile": profile,
      "refinement": refinement or None,
    }

    return (
      "사진 속 동일 사용자에게 가장 잘 어울리는 실제 적용 가능한 K-뷰티 메이크업 룩을 정확히 1개만 추천해. "
      "룩의 role은 반드시 anchor로 반환해. 여러 대안이나 비교용 룩을 만들지 말고 가장 적합한 한 가지를 선택해. "
      "사진 속 얼굴 특징, 성별 표현, 피부 표현과 사용자 조건을 보존해. "
      "title은 12자 이내, subtitle은 20자 이내, summary는 두 문장 이내로 한국어로 작성해. "
      "각 룩은 base, brow, eye, cheek, lip 순서의 단계 5개와 제품 타입 5개를 포함해. "
      "실재 여부를 확인할 수 없는 브랜드나 상품을 만들지 말고 모든 brandName은 반드시 '추천 타입'으로 써. "
      "productName에는 쿠션, 팔레트, 브로우, 블러셔, 립처럼 일반 제품 유형을 작성하고 shadeName에는 구체적인 색조를 써. "
      "의학적 진단이나 피부 치료 주장은 하지 마. JSON Schema에 정확히 맞는 결과만 반환해. "
      f"{refinement_guide} "
      f"사용자 컨텍스트: {json.dumps(context, ensure_ascii=False)}"
    )

  def _generate_personalized_makeup_text_sync(
    self,
    payload: dict[str, Any],
    source_image_bytes: bytes,
    source_content_type: str,
  ) -> list[dict[str, Any]]:
    source_image_base64 = base64.b64encode(source_image_bytes).decode("utf-8")
    response = self._client().responses.create(
      model=self.settings.openai_analysis_model_id,
      input=[
        {
          "role": "developer",
          "content": "You are a concise professional K-beauty makeup artist. Return schema-valid Korean recommendations only.",
        },
        {
          "role": "user",
          "content": [
            {"type": "input_text", "text": self._build_personalized_makeup_recommendation_prompt(payload)},
            {
              "type": "input_image",
              "image_url": f"data:{source_content_type};base64,{source_image_base64}",
            },
          ],
        },
      ],
      text={
        "format": {
          "type": "json_schema",
          "name": "makeup_recommendations",
          "strict": True,
          "schema": MAKEUP_RECOMMENDATION_OUTPUT_SCHEMA,
        },
      },
    )
    output_text = getattr(response, "output_text", "")

    if not output_text:
      raise AppError(
        502,
        "OPENAI_MAKEUP_RECOMMENDATION_EMPTY",
        "OpenAI returned no makeup recommendations.",
      )

    parsed = self._parse_json_output(output_text)
    looks = parsed.get("looks")

    if not isinstance(looks, list):
      raise AppError(
        502,
        "OPENAI_MAKEUP_RECOMMENDATION_INVALID",
        "OpenAI returned an invalid makeup recommendation payload.",
      )

    by_role = {
      str(look.get("role")): look
      for look in looks
      if isinstance(look, dict) and str(look.get("role")) in MAKEUP_RECOMMENDATION_ROLES
    }

    if any(role not in by_role for role in MAKEUP_RECOMMENDATION_ROLES):
      raise AppError(
        502,
        "OPENAI_MAKEUP_RECOMMENDATION_INCOMPLETE",
        "OpenAI must return one anchor makeup look.",
      )

    return [dict(by_role[role]) for role in MAKEUP_RECOMMENDATION_ROLES]

  def _build_analysis_prompt(self, payload: dict[str, Any]) -> str:
    # 정적 지시문 + 동적 메타데이터를 이어붙인 최종 프롬프트(바이트 동일 유지).
    # 캐싱(Phase 3)·팬아웃(Phase 4)이 두 조각을 각각 재사용할 수 있게 분리했다.
    return (
      f"{self._analysis_static_instructions()}"
      f"{self._analysis_dynamic_metadata(payload)}"
    )

  def _analysis_dynamic_metadata(self, payload: dict[str, Any]) -> str:
    # 요청별로 바뀌는 측정 메타데이터(사진 축소본은 별도 이미지 블록). 캐시 불가 서픽스.
    metadata = _safe_analysis_prompt_metadata(payload)
    return f"요청 메타데이터: {json.dumps(metadata, ensure_ascii=False)}"

  def _analysis_static_instructions(self) -> str:
    # 단일 경로(전체 스키마)용 — 코어 + 전 섹션 + 필드 가이드를 모듈에서 조립.
    # 팬아웃은 _fanout_group_prompt가 코어 + 해당 레그 섹션만 쓴다(입력 토큰 절감).
    return (
      f"{_ANALYSIS_CORE_INSTRUCTIONS}"
      f"{_ANALYSIS_SEC_ANCHOR}"
      f"{_ANALYSIS_SEC_PERCEPTION}"
      f"{_ANALYSIS_SEC_SKIN}"
      f"{_ANALYSIS_SEC_PRESCRIPTION}"
      f"{_ANALYSIS_SEC_STYLING}"
      "아래는 값 예시가 아니라 필드 구조 설명이야. 설명 문구를 복사하지 말고, 반드시 사진을 분석해서 실제 값으로 채워:\n"
      f"{ANALYSIS_OUTPUT_FIELD_GUIDE}\n"
    )

  def _parse_json_output(self, output_text: str) -> dict[str, Any]:
    normalized = output_text.strip()
    fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", normalized, re.DOTALL)

    if fence_match:
      normalized = fence_match.group(1).strip()

    try:
      result = json.loads(normalized)
    except json.JSONDecodeError as exc:
      raise AppError(
        502,
        "OPENAI_OUTPUT_PARSE_FAILED",
        "OpenAI analysis did not return valid JSON.",
      ) from exc

    if not isinstance(result, dict):
      raise AppError(
        502,
        "OPENAI_OUTPUT_INVALID",
        "OpenAI analysis returned an unexpected result shape.",
      )

    return result

  def _structured_image_content_type(self, source_image_bytes: bytes) -> str:
    return "image/png" if source_image_bytes.startswith(b"\x89PNG\r\n\x1a\n") else "image/jpeg"

  def _analyze_structured_json_sync(
    self,
    developer_prompt: str,
    user_prompt: str,
    json_schema: dict[str, Any],
    source_image_bytes: bytes | None,
    max_tokens: int,
    stage: str | None = None,
  ) -> dict[str, Any]:
    provider = self.settings.analysis_provider
    schema_instruction = json.dumps(json_schema, ensure_ascii=False, separators=(",", ":"))
    started_at = time.monotonic()

    # V2 스테이지도 동일 원본을 base64로 실어 보낸다 — analyze_text와 같은
    # 이유(비용·Bedrock 이미지 한도)로 전송 전에 다운스케일한다.
    if source_image_bytes is not None:
      source_image_bytes, _ = self._prepare_source_image_for_analysis(
        source_image_bytes,
        self._structured_image_content_type(source_image_bytes),
      )

    tool_result: dict[str, Any] | None = None
    if provider == "bedrock":
      model_id = self.settings.effective_analysis_model_id
      if not model_id:
        raise AppError(
          503,
          "BEDROCK_ANALYSIS_NOT_CONFIGURED",
          "A Bedrock Claude model ID or inference profile ID is required for AI analysis.",
        )
      tool_enforced = self.settings.bedrock_analysis_tool_enforcement
      # 스키마 강제 시엔 프롬프트에 스키마 텍스트를 중복으로 싣지 않는다(도구가
      # 강제하므로) — 거대한 입력 토큰(5천대)도 줄인다.
      prompt_text = (
        user_prompt
        if tool_enforced
        else f"{user_prompt}\nRequired JSON schema: {schema_instruction}"
      )
      content: list[dict[str, Any]] = [{"type": "text", "text": prompt_text}]
      if source_image_bytes is not None:
        content.append(
          {
            "type": "image",
            "source": {
              "type": "base64",
              "media_type": self._structured_image_content_type(source_image_bytes),
              "data": base64.b64encode(source_image_bytes).decode("utf-8"),
            },
          },
        )
      request_body: dict[str, Any] = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": 0.1,
        "system": developer_prompt,
        "messages": [{"role": "user", "content": content}],
      }
      if tool_enforced:
        # 각 스테이지 스키마(measure/perceive/consult)를 도구로 강제 — 필드 누락·
        # 장황한 출력으로 인한 파싱/검증 실패를 근본 차단.
        request_body["tools"] = [
          {
            "name": "return_structured_output",
            "description": "Return the structured analysis stage output.",
            "input_schema": json_schema,
          },
        ]
        request_body["tool_choice"] = {"type": "tool", "name": "return_structured_output"}

      response = self._bedrock_runtime_client().invoke_model(
        modelId=model_id,
        body=json.dumps(request_body, ensure_ascii=False),
        accept="application/json",
        contentType="application/json",
      )
      response_payload = json.loads(response["body"].read())
      stop_reason = self._observe_bedrock_stop_reason(
        response_payload,
        context="stage",
        max_tokens=max_tokens,
      )
      self._log_bedrock_call_metrics(
        response_payload,
        context="stage",
        started_at=started_at,
        stage=stage,
      )
      if tool_enforced:
        # 조용한 fallback 없음 — 도구 응답이 없으면 명시적으로 실패.
        tool_result = self._extract_bedrock_tool_input(
          response_payload, "return_structured_output",
        )
        if tool_result is None:
          raise AppError(
            502,
            "BEDROCK_TOOL_USE_MISSING",
            "AI structured analysis did not return the enforced tool output.",
            {"stopReason": stop_reason or "unknown"},
          )
        output_text = ""
      else:
        output_text = self._extract_bedrock_output_text(response_payload)
        if not output_text and stop_reason == "max_tokens":
          raise AppError(
            502,
            "AI_EMPTY_OUTPUT",
            "AI structured analysis returned an empty response.",
            {"stopReason": "max_tokens"},
          )
    elif provider == "openai":
      content = [{"type": "input_text", "text": user_prompt}]
      if source_image_bytes is not None:
        content.append(
          {
            "type": "input_image",
            "image_url": (
              f"data:{self._structured_image_content_type(source_image_bytes)};base64,"
              f"{base64.b64encode(source_image_bytes).decode('utf-8')}"
            ),
          },
        )
      response = self._client().responses.create(
        model=self.settings.openai_analysis_model_id,
        input=[
          {"role": "developer", "content": developer_prompt},
          {"role": "user", "content": content},
        ],
        text={
          "format": {
            "type": "json_schema",
            "name": "face_analysis_stage",
            "strict": True,
            "schema": json_schema,
          },
          "verbosity": "low",
        },
      )
      output_text = getattr(response, "output_text", "")
      stop_reason = ""
    else:
      raise AppError(503, "AI_PROVIDER_UNSUPPORTED", f"Unsupported AI_PROVIDER: {provider}")

    # tool use(강제)면 구조화 input을 바로 반환, 아니면 텍스트를 파싱.
    if tool_result is not None:
      return tool_result
    if not output_text:
      raise AppError(502, "AI_EMPTY_OUTPUT", "AI structured analysis returned an empty response.")
    try:
      return self._parse_json_output(output_text)
    except AppError as exc:
      # 절단된 부분 JSON이 파싱 불가일 때 원인(max_tokens)을 details에 남긴다.
      if stop_reason == "max_tokens":
        raise AppError(
          exc.status_code,
          exc.code,
          exc.message,
          {**exc.details, "stopReason": "max_tokens"},
        ) from exc
      raise

  async def read_source_image_bytes(self, payload: dict[str, Any]) -> bytes:
    return await asyncio.to_thread(self._read_source_image_bytes, payload)

  async def analyze_structured_json(
    self,
    *,
    developer_prompt: str,
    user_prompt: str,
    json_schema: dict[str, Any],
    source_image_bytes: bytes | None,
    max_tokens: int,
    stage: str | None = None,
  ) -> dict[str, Any]:
    try:
      return await asyncio.to_thread(
        self._analyze_structured_json_sync,
        developer_prompt,
        user_prompt,
        json_schema,
        source_image_bytes,
        max_tokens,
        stage,
      )
    except AppError:
      raise
    except (OpenAIError, BotoCoreError, ClientError) as exc:
      raise AppError(
        502,
        "AI_INVOCATION_FAILED",
        "AI structured analysis invocation failed.",
        {"reason": exc.__class__.__name__},
      ) from exc

  def _trim_text_field(self, value: Any, max_length: int) -> Any:
    if not isinstance(value, str):
      return value

    normalized = " ".join(value.split()).strip(" ,，.。")

    if len(normalized) <= max_length:
      return normalized

    return normalized[:max_length].rstrip(" ,，.。")

  def _first_normalized_text(self, *values: Any) -> str:
    for value in values:
      if isinstance(value, str) and value.strip():
        return " ".join(value.split()).strip()

    return ""

  def _ensure_makeup_guideline(self, result: dict[str, Any]) -> dict[str, str]:
    guideline = result.get("makeupGuideline")
    normalized_guideline = guideline if isinstance(guideline, dict) else {}
    personal_color = self._first_normalized_text(result.get("personalColor"), "분석 톤")
    face_shape = self._first_normalized_text(result.get("faceShape"), "얼굴형")
    tone_summary = self._first_normalized_text(result.get("toneSummary"), personal_color)
    recommended_mood = self._first_normalized_text(result.get("recommendedMood"), tone_summary)

    report_based_defaults = {
      "brow": f"{face_shape} 균형에 맞춰 눈썹 결을 자연스럽게 정돈해요.",
      "blush": f"{tone_summary}에 맞는 블러셔를 광대 주변에 얇게 연결해요.",
      "highlight": f"{recommended_mood}가 살아나도록 T존과 눈밑에 은은한 광만 더해요.",
      "eyeshadow": f"{personal_color}에 어울리는 음영을 눈두덩이에 얇게 쌓아요.",
      "eyeliner": f"{face_shape} 인상이 무겁지 않게 점막과 꼬리만 또렷하게 정리해요.",
      "lip": f"{recommended_mood}에 맞는 립 컬러를 입술 중심부터 선명하게 올려요.",
    }

    return {
      key: self._first_normalized_text(normalized_guideline.get(key), fallback)
      for key, fallback in report_based_defaults.items()
    }

  def _ensure_base_makeup_guide(self, result: dict[str, Any]) -> str:
    personal_color = self._first_normalized_text(result.get("personalColor"), "분석 톤")
    tone_summary = self._first_normalized_text(result.get("toneSummary"), personal_color)
    recommended_mood = self._first_normalized_text(result.get("recommendedMood"), tone_summary)
    fallback = (
      f"{tone_summary}와 {recommended_mood}가 자연스럽게 보이도록 베이스는 얇게 정돈하고 "
      "얼굴 중앙의 밝기와 볼의 생기를 중심으로 표현해요."
    )

    return self._first_normalized_text(result.get("baseMakeupGuide"), fallback)

  def _default_recommended_makeup_card(
    self,
    result: dict[str, Any],
    index: int,
  ) -> dict[str, Any]:
    personal_color = self._first_normalized_text(result.get("personalColor"), "분석 톤")
    face_shape = self._first_normalized_text(result.get("faceShape"), "얼굴 균형")
    tone_summary = self._first_normalized_text(result.get("toneSummary"), personal_color)
    recommended_mood = self._first_normalized_text(result.get("recommendedMood"), tone_summary)
    tone_keyword = self._trim_text_field(tone_summary.replace(" ", ""), 6) or "맞춤톤"
    mood_keyword = self._trim_text_field(recommended_mood.replace(" ", ""), 6) or "추천무드"
    face_keyword = self._trim_text_field(face_shape.replace(" ", ""), 6) or "얼굴균형"
    templates = [
      {
        "title": f"{tone_keyword} 베이스",
        "subtitle": f"{mood_keyword} 피부",
        "description": (
          f"{personal_color}와 {tone_summary}에 맞춰 피부 결, 볼 생기, 립 광을 "
          "자연스럽게 살린 메이크업이에요."
        ),
        "tags": [tone_keyword, "베이스"],
      },
      {
        "title": f"{face_keyword} 아이",
        "subtitle": "눈매 균형 포인트",
        "description": (
          f"{face_shape} 인상을 바탕으로 눈썹 결, 아이 음영, 아이라인을 "
          "선명하지만 무겁지 않게 잡은 룩이에요."
        ),
        "tags": [face_keyword, "아이"],
      },
      {
        "title": f"{mood_keyword} 립",
        "subtitle": "립 블러셔 조화",
        "description": (
          f"{recommended_mood} 방향에 맞춰 립 컬러와 블러셔 위치를 연결해 "
          "얼굴 분위기를 또렷하게 만든 룩이에요."
        ),
        "tags": [mood_keyword, "립"],
      },
    ]

    return templates[index % len(templates)]

  def _ensure_recommended_makeups(self, result: dict[str, Any]) -> list[dict[str, Any]]:
    recommended_makeups = result.get("recommendedMakeups")
    cards: list[dict[str, Any]] = []

    if isinstance(recommended_makeups, list):
      cards = [card for card in recommended_makeups if isinstance(card, dict)]

    while len(cards) < RECOMMENDED_MAKEUP_COUNT:
      cards.append(self._default_recommended_makeup_card(result, len(cards)))

    normalized_cards: list[dict[str, Any]] = []

    for index, card in enumerate(cards[:RECOMMENDED_MAKEUP_COUNT]):
      fallback = self._default_recommended_makeup_card(result, index)
      raw_tags = card.get("tags")
      tags = [
        str(tag).strip()
        for tag in raw_tags
        if isinstance(raw_tags, list) and str(tag).strip()
      ] if isinstance(raw_tags, list) else []
      fallback_tags = fallback["tags"] if isinstance(fallback["tags"], list) else []
      tags = (tags + fallback_tags)[:2]

      normalized_cards.append(
        {
          **card,
          "title": self._trim_text_field(
            self._first_normalized_text(card.get("title"), fallback["title"]),
            12,
          ),
          "subtitle": self._trim_text_field(
            self._first_normalized_text(card.get("subtitle"), fallback["subtitle"]),
            16,
          ),
          "description": self._trim_text_field(
            self._first_normalized_text(card.get("description"), fallback["description"]),
            82,
          ),
          "tags": tags,
        },
      )

    return normalized_cards

  def _ensure_region_notes(self, result: dict[str, Any]) -> dict[str, dict[str, str]]:
    notes = result.get("regionNotes")
    normalized_notes = notes if isinstance(notes, dict) else {}
    face_shape = self._first_normalized_text(result.get("faceShape"), "얼굴형")
    recommended_mood = self._first_normalized_text(result.get("recommendedMood"), "은은한 분위기")

    insight_defaults = {
      "upper": f"{face_shape} 인상 안에서 눈매와 눈썹이 표정의 시작점이 돼요.",
      "mid": "코와 볼의 흐름이 완만하게 이어지는 구획이에요.",
      "lower": f"{recommended_mood} 분위기를 입술이 자연스럽게 마무리해요.",
      "jaw": "광대에서 턱끝으로 내려오는 선이 전체 윤곽을 정리해요.",
    }

    normalized: dict[str, dict[str, str]] = {}
    for key, insight_fallback in insight_defaults.items():
      raw = normalized_notes.get(key)
      if isinstance(raw, dict):
        normalized[key] = {
          "insight": self._first_normalized_text(raw.get("insight"), insight_fallback),
          "evidence": self._first_normalized_text(raw.get("evidence")),
          "recommendation": self._first_normalized_text(raw.get("recommendation")),
        }
      else:
        # 구버전(단문 string)·부재 응답은 insight로 승격하고 근거·조언은 비운다.
        normalized[key] = {
          "insight": self._first_normalized_text(raw, insight_fallback),
          "evidence": "",
          "recommendation": "",
        }
    return normalized

  def _ensure_impression_notes(self, result: dict[str, Any]) -> dict[str, Any]:
    notes = result.get("impressionNotes")
    normalized_notes = notes if isinstance(notes, dict) else {}
    recommended_mood = self._first_normalized_text(result.get("recommendedMood"), "정돈된 분위기")
    summary = self._first_normalized_text(result.get("shortSummary"), result.get("summary"))
    raw_tags = result.get("tags")
    tag_keywords = [
      str(tag).strip()
      for tag in raw_tags
      if isinstance(raw_tags, list) and str(tag).strip()
    ] if isinstance(raw_tags, list) else []

    raw_keywords = normalized_notes.get("keywords")
    keywords = [
      str(keyword).strip()
      for keyword in raw_keywords
      if isinstance(raw_keywords, list) and str(keyword).strip()
    ] if isinstance(raw_keywords, list) else []
    if not keywords:
      keywords = (tag_keywords + [recommended_mood])[:5] or [recommended_mood]

    raw_axes = normalized_notes.get("axes")
    axes = []
    for i, default in enumerate(DEFAULT_IMPRESSION_AXES):
      raw = (
        raw_axes[i]
        if isinstance(raw_axes, list) and i < len(raw_axes) and isinstance(raw_axes[i], dict)
        else {}
      )
      value = raw.get("value")
      value = float(value) if isinstance(value, (int, float)) else 0.0
      axes.append({
        "key": self._first_normalized_text(raw.get("key"), default["key"]),
        "leftLabel": self._first_normalized_text(raw.get("leftLabel"), default["leftLabel"]),
        "rightLabel": self._first_normalized_text(raw.get("rightLabel"), default["rightLabel"]),
        "value": max(-1.0, min(1.0, value)),
      })

    return {
      "overallMood": self._trim_text_field(
        self._first_normalized_text(normalized_notes.get("overallMood"), recommended_mood),
        18,
      ),
      "keywords": keywords[:5],
      "paragraph": self._first_normalized_text(
        normalized_notes.get("paragraph"),
        summary,
        f"{recommended_mood} 인상이 전체적으로 자연스럽게 이어져요.",
      ),
      "axes": axes,
    }

  def _default_styling_look_rows(
    self,
    result: dict[str, Any],
    intensity: str,
  ) -> list[dict[str, str]]:
    guideline = self._ensure_makeup_guideline(result)
    intensity_prefix = "은은하게" if intensity == "natural" else "또렷하게"
    categories = ("base", "brow", "eyeshadow", "eyeliner", "blush", "lip")

    return [
      {
        "category": category,
        "note": guideline.get("blush" if category == "base" else category, ""),
        "why": f"{intensity_prefix} 표현해도 사용자 얼굴 특징과 자연스럽게 어울려요.",
      }
      for category in categories
    ]

  def _default_styling_look(self, result: dict[str, Any], intensity: str) -> dict[str, Any]:
    recommended_mood = self._first_normalized_text(result.get("recommendedMood"), "데일리 무드")
    label = "데일리" if intensity == "natural" else "포인트"

    return {
      "title": self._trim_text_field(f"{label} {recommended_mood}", 12),
      "subtitle": self._trim_text_field(
        "은은한 데일리 강도" if intensity == "natural" else "또렷한 포인트 강도",
        16,
      ),
      "description": (
        f"{recommended_mood} 방향을 {'가볍게' if intensity == 'natural' else '진하게'} 풀어낸 룩이에요."
      ),
      "rows": self._default_styling_look_rows(result, intensity),
    }

  def _ensure_styling_look(
    self,
    result: dict[str, Any],
    looks: dict[str, Any],
    intensity: str,
  ) -> dict[str, Any]:
    look = looks.get(intensity)
    normalized_look = look if isinstance(look, dict) else {}
    fallback = self._default_styling_look(result, intensity)

    raw_rows = normalized_look.get("rows")
    rows = [row for row in raw_rows if isinstance(row, dict)] if isinstance(raw_rows, list) else []
    normalized_rows = [
      {
        "category": self._first_normalized_text(row.get("category"), fallback_row["category"]),
        "note": self._first_normalized_text(row.get("note"), fallback_row["note"]),
        "why": self._first_normalized_text(row.get("why"), fallback_row["why"]),
      }
      for row, fallback_row in zip(
        rows or fallback["rows"],
        fallback["rows"],
      )
    ]

    return {
      "title": self._trim_text_field(
        self._first_normalized_text(normalized_look.get("title"), fallback["title"]),
        12,
      ),
      "subtitle": self._trim_text_field(
        self._first_normalized_text(normalized_look.get("subtitle"), fallback["subtitle"]),
        16,
      ),
      "description": self._first_normalized_text(
        normalized_look.get("description"), fallback["description"],
      ),
      "rows": normalized_rows,
    }

  def _ensure_styling_looks(self, result: dict[str, Any]) -> dict[str, Any]:
    looks = result.get("stylingLooks")
    normalized_looks = looks if isinstance(looks, dict) else {}

    return {
      "natural": self._ensure_styling_look(result, normalized_looks, "natural"),
      "glam": self._ensure_styling_look(result, normalized_looks, "glam"),
    }

  def _validate_analysis_result_before_normalization(
    self,
    result: dict[str, Any],
  ) -> None:
    missing: list[str] = []

    def require_text(value: Any, path: str) -> None:
      if not isinstance(value, str) or not value.strip():
        missing.append(path)

    for key in (
      "faceShape",
      "skinType",
      "recommendedMood",
      "summary",
      "shortSummary",
      "skinAnalysisSummary",
      "baseMakeupGuide",
    ):
      require_text(result.get(key), key)

    skin_perception = result.get("skinPerception")
    if not isinstance(skin_perception, dict):
      missing.append("skinPerception")
    else:
      for aspect in SKIN_PERCEPTION_ASPECTS:
        entry = skin_perception.get(aspect)
        if not isinstance(entry, dict):
          missing.append(f"skinPerception.{aspect}")
          continue
        for key in ("label", "description"):
          require_text(entry.get(key), f"skinPerception.{aspect}.{key}")

    guideline = result.get("makeupGuideline")
    if not isinstance(guideline, dict):
      missing.append("makeupGuideline")
    else:
      for key in ("brow", "blush", "highlight", "eyeshadow", "eyeliner", "lip"):
        require_text(guideline.get(key), f"makeupGuideline.{key}")

    cards = result.get("recommendedMakeups")
    if not isinstance(cards, list) or len(cards) != RECOMMENDED_MAKEUP_COUNT:
      missing.append("recommendedMakeups")
    else:
      card = cards[0] if isinstance(cards[0], dict) else {}
      for key in ("title", "subtitle", "description"):
        require_text(card.get(key), f"recommendedMakeups[0].{key}")
      tags = card.get("tags")
      if not isinstance(tags, list) or len([tag for tag in tags if str(tag).strip()]) < 2:
        missing.append("recommendedMakeups[0].tags")

    region_notes = result.get("regionNotes")
    if not isinstance(region_notes, dict):
      missing.append("regionNotes")
    else:
      for region in ("upper", "mid", "lower", "jaw"):
        note = region_notes.get(region)
        if not isinstance(note, dict):
          missing.append(f"regionNotes.{region}")
          continue
        for key in ("insight", "evidence", "recommendation"):
          require_text(note.get(key), f"regionNotes.{region}.{key}")

    impression = result.get("impressionNotes")
    if not isinstance(impression, dict):
      missing.append("impressionNotes")
    else:
      require_text(impression.get("overallMood"), "impressionNotes.overallMood")
      require_text(impression.get("paragraph"), "impressionNotes.paragraph")
      keywords = impression.get("keywords")
      if not isinstance(keywords, list) or len([item for item in keywords if str(item).strip()]) < 3:
        missing.append("impressionNotes.keywords")
      axes = impression.get("axes")
      if not isinstance(axes, list) or len(axes) != 2:
        missing.append("impressionNotes.axes")
      else:
        for index, axis in enumerate(axes):
          if not isinstance(axis, dict):
            missing.append(f"impressionNotes.axes[{index}]")
            continue
          for key in ("key", "leftLabel", "rightLabel"):
            require_text(axis.get(key), f"impressionNotes.axes[{index}].{key}")
          if not isinstance(axis.get("value"), (int, float)):
            missing.append(f"impressionNotes.axes[{index}].value")

    styling = result.get("stylingLooks")
    if not isinstance(styling, dict):
      missing.append("stylingLooks")
    else:
      for variant in ("natural", "glam"):
        look = styling.get(variant)
        if not isinstance(look, dict):
          missing.append(f"stylingLooks.{variant}")
          continue
        for key in ("title", "subtitle", "description"):
          require_text(look.get(key), f"stylingLooks.{variant}.{key}")
        rows = look.get("rows")
        if not isinstance(rows, list) or len(rows) < 4:
          missing.append(f"stylingLooks.{variant}.rows")
          continue
        for index, row in enumerate(rows):
          if not isinstance(row, dict):
            missing.append(f"stylingLooks.{variant}.rows[{index}]")
            continue
          for key in ("category", "note", "why"):
            require_text(row.get(key), f"stylingLooks.{variant}.rows[{index}].{key}")

    if missing:
      raise AppError(
        502,
        "FACE_ANALYSIS_AI_INCOMPLETE",
        "얼굴 분석을 완료하지 못했어요. 다시 촬영해 주세요.",
        {"missingFields": sorted(set(missing))},
      )

  def _normalize_analysis_result(self, result: dict[str, Any]) -> dict[str, Any]:
    # AI가 누락한 분석을 고정 문구로 채우지 않는다. 불완전한 응답은
    # 보고서 생성 실패로 돌려 사용자가 재촬영할 수 있게 한다.
    self._validate_analysis_result_before_normalization(result)
    result["toneSummary"] = self._trim_text_field(result.get("toneSummary"), 18)
    result["recommendedMood"] = self._trim_text_field(result.get("recommendedMood"), 18)
    result["baseMakeupGuide"] = self._ensure_base_makeup_guide(result)
    result["makeupGuideline"] = self._ensure_makeup_guideline(result)
    result["recommendedMakeups"] = self._ensure_recommended_makeups(result)
    result["regionNotes"] = self._ensure_region_notes(result)
    result["impressionNotes"] = self._ensure_impression_notes(result)
    result["stylingLooks"] = self._ensure_styling_looks(result)

    return result

  def _observe_bedrock_stop_reason(
    self,
    response_payload: dict[str, Any],
    *,
    context: str,
    max_tokens: int,
  ) -> str:
    """양 경로 공유 절단 관측. dev=V2 라이브·프로드=analyze_text 모두 커버한다.

    max_tokens 절단은 파싱/스키마 검증 실패로 이어지는데, stop_reason을 남기지
    않으면 "왜 실패했는지"가 로그에서 사라진다. 새 방어가 아니라 관측성 목적.
    """
    stop_reason = str(response_payload.get("stop_reason") or "")
    if stop_reason == "max_tokens":
      logger.warning(
        "[aura:bedrock] %s:truncated maxTokens=%s",
        context,
        max_tokens,
      )
    return stop_reason

  def _log_bedrock_call_metrics(
    self,
    response_payload: dict[str, Any],
    *,
    context: str,
    started_at: float,
    stage: str | None = None,
  ) -> None:
    """토큰·지연 계측(Stage 7). analyze_text(프로드)와 V2 스테이지(dev)를 동일
    포맷으로 남겨, dev 트래픽만으로 라이브 vs V2 A/B(비용·지연)를 비교할 수 있게 한다.

    stage(measure|perceive|consult)를 함께 남겨 스테이지별 지연·재시도(같은 stage가
    2줄이면 1회 재검증)를 토큰 순서 추정 없이 정확히 집계한다.
    로그 grep 키: `[aura:bedrock] <context>:metrics`.
    """
    usage = response_payload.get("usage")
    usage = usage if isinstance(usage, dict) else {}
    duration_ms = round((time.monotonic() - started_at) * 1000)
    stop_reason = str(response_payload.get("stop_reason") or "")
    logger.info(
      "[aura:bedrock] %s:metrics stage=%s durationMs=%s inputTokens=%s outputTokens=%s",
      context,
      stage or "-",
      duration_ms,
      usage.get("input_tokens"),
      usage.get("output_tokens"),
    )
    # 실험 지표 sink(로그 레벨 무관). context: analysis=단일호출, stage=V2 스테이지.
    append_analysis_metric(
      self.settings.analysis_metrics_path,
      {
        "kind": "call",
        "context": context,
        "stage": stage,
        "durationMs": duration_ms,
        "inputTokens": usage.get("input_tokens"),
        "outputTokens": usage.get("output_tokens"),
        "stopReason": stop_reason or "end_turn",
      },
    )

  def _extract_bedrock_tool_input(
    self,
    response_payload: dict[str, Any],
    tool_name: str,
  ) -> dict[str, Any] | None:
    """forced tool use 응답에서 구조화 input(dict)을 꺼낸다. 없으면 None."""
    content = response_payload.get("content")
    if not isinstance(content, list):
      return None
    for part in content:
      if (
        isinstance(part, dict)
        and part.get("type") == "tool_use"
        and part.get("name") == tool_name
        and isinstance(part.get("input"), dict)
      ):
        return part["input"]
    return None

  def _extract_bedrock_output_text(self, response_payload: dict[str, Any]) -> str:
    content = response_payload.get("content")

    if isinstance(content, list):
      return "\n".join(
        str(part.get("text") or "")
        for part in content
        if isinstance(part, dict) and part.get("type") == "text"
      ).strip()

    completion = response_payload.get("completion")

    if isinstance(completion, str):
      return completion.strip()

    return ""

  def _analyze_image_with_bedrock_sync(
    self,
    payload: dict[str, Any],
    source_image_bytes: bytes,
  ) -> dict[str, Any]:
    started_at = time.monotonic()
    model_id = self.settings.effective_analysis_model_id

    if not model_id:
      raise AppError(
        503,
        "BEDROCK_ANALYSIS_NOT_CONFIGURED",
        "A Bedrock Claude model ID or inference profile ID is required for AI analysis.",
      )

    content_type = self._infer_content_type(payload)
    source_image_bytes, content_type = self._prepare_source_image_for_analysis(
      source_image_bytes,
      content_type,
    )
    source_image_base64 = base64.b64encode(source_image_bytes).decode("utf-8")
    tool_enforced = self.settings.bedrock_analysis_tool_enforcement
    logger.info(
      "[aura:bedrock] analysis:start model=%s region=%s toolEnforced=%s",
      model_id,
      self.settings.effective_bedrock_analysis_region,
      tool_enforced,
    )
    request_body: dict[str, Any] = {
      "anthropic_version": "bedrock-2023-05-31",
      "max_tokens": self.settings.bedrock_analysis_max_tokens,
      "temperature": 0.2,
      "system": "You are a concise, practical K-beauty makeup analyst. Return JSON only.",
      "messages": [
        {
          "role": "user",
          "content": [
            {"type": "text", "text": self._build_analysis_prompt(payload)},
            {
              "type": "image",
              "source": {
                "type": "base64",
                "media_type": content_type,
                "data": source_image_base64,
              },
            },
          ],
        },
      ],
    }
    if tool_enforced:
      # 강제 tool use — 모델이 스키마의 required 필드를 모두 채우게 강제한다.
      request_body["tools"] = [
        {
          "name": FACE_ANALYSIS_TOOL_NAME,
          "description": "Return the complete K-beauty face analysis report.",
          "input_schema": FACE_ANALYSIS_TOOL_SCHEMA,
        },
      ]
      request_body["tool_choice"] = {"type": "tool", "name": FACE_ANALYSIS_TOOL_NAME}

    response = self._bedrock_runtime_client().invoke_model(
      modelId=model_id,
      body=json.dumps(request_body, ensure_ascii=False),
      accept="application/json",
      contentType="application/json",
    )
    response_payload = json.loads(response["body"].read())
    stop_reason = self._observe_bedrock_stop_reason(
      response_payload,
      context="analysis",
      max_tokens=self.settings.bedrock_analysis_max_tokens,
    )
    self._log_bedrock_call_metrics(
      response_payload,
      context="analysis",
      started_at=started_at,
    )

    if tool_enforced:
      # 강제 tool use — 도구 응답이 없으면 조용히 텍스트로 넘어가지 않고 명시적으로
      # 실패시킨다(스키마 강제가 안 걸린 걸 숨기지 않음).
      tool_input = self._extract_bedrock_tool_input(response_payload, FACE_ANALYSIS_TOOL_NAME)
      if tool_input is None:
        raise AppError(
          502,
          "BEDROCK_TOOL_USE_MISSING",
          "Bedrock analysis did not return the enforced tool output.",
          {"stopReason": stop_reason or "unknown"},
        )
      raw_result = tool_input
    else:
      output_text = self._extract_bedrock_output_text(response_payload)
      if not output_text:
        raise AppError(
          502,
          "BEDROCK_EMPTY_OUTPUT",
          "Bedrock Claude analysis returned an empty response.",
        )
      raw_result = self._parse_json_output(output_text)

    try:
      parsed = self._normalize_analysis_result(raw_result)
    except AppError as exc:
      if stop_reason == "max_tokens":
        raise AppError(
          exc.status_code,
          exc.code,
          exc.message,
          {**exc.details, "stopReason": "max_tokens"},
        ) from exc
      raise
    logger.info(
      "[aura:bedrock] analysis:success durationMs=%s stopReason=%s",
      round((time.monotonic() - started_at) * 1000),
      stop_reason or "end_turn",
    )

    return parsed

  # ── 팬아웃(Phase 4): 앵커 → A(perception) ∥ B(prescription) ──────────────
  def _bedrock_invoke_tool_sync(
    self,
    *,
    prompt_text: str,
    image_base64: str | None,
    content_type: str,
    tool_name: str,
    tool_schema: dict[str, Any],
    max_tokens: int,
    stage: str,
  ) -> dict[str, Any]:
    """강제 tool use로 부분 스키마 하나를 채워 raw tool_input(dict)을 반환한다.
    정규화·검증은 하지 않는다(merge 후 1회). 스테이지 지표를 남긴다."""
    started_at = time.monotonic()
    model_id = self.settings.effective_analysis_model_id
    if not model_id:
      raise AppError(
        503,
        "BEDROCK_ANALYSIS_NOT_CONFIGURED",
        "A Bedrock Claude model ID or inference profile ID is required for AI analysis.",
      )
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt_text}]
    if image_base64 is not None:
      content.append(
        {
          "type": "image",
          "source": {"type": "base64", "media_type": content_type, "data": image_base64},
        },
      )
    request_body: dict[str, Any] = {
      "anthropic_version": "bedrock-2023-05-31",
      "max_tokens": max_tokens,
      "temperature": 0.2,
      "system": "You are a concise, practical K-beauty makeup analyst. Return JSON only.",
      "messages": [{"role": "user", "content": content}],
      "tools": [
        {
          "name": tool_name,
          "description": "Return the requested K-beauty analysis fields.",
          "input_schema": tool_schema,
        },
      ],
      "tool_choice": {"type": "tool", "name": tool_name},
    }
    response = self._bedrock_runtime_client().invoke_model(
      modelId=model_id,
      body=json.dumps(request_body, ensure_ascii=False),
      accept="application/json",
      contentType="application/json",
    )
    response_payload = json.loads(response["body"].read())
    stop_reason = self._observe_bedrock_stop_reason(
      response_payload,
      context="analysis",
      max_tokens=max_tokens,
    )
    self._log_bedrock_call_metrics(
      response_payload,
      context="analysis",
      started_at=started_at,
      stage=stage,
    )
    tool_input = self._extract_bedrock_tool_input(response_payload, tool_name)
    if tool_input is None:
      raise AppError(
        502,
        "BEDROCK_TOOL_USE_MISSING",
        "Bedrock analysis did not return the enforced tool output.",
        {"stopReason": stop_reason or "unknown", "stage": stage},
      )
    return tool_input

  def _fanout_group_prompt(
    self,
    payload: dict[str, Any],
    *,
    stage: str,
    directive: str,
    anchor_values: dict[str, Any] | None = None,
  ) -> str:
    # 레그별 슬림 프롬프트: 공유 코어 + 이 레그 섹션 지시문 + 스코프 지시문 + 앵커
    # 확정값 주입 + 동적 메타데이터. 전체 필드 가이드는 싣지 않는다(도구 스키마가
    # 구조를 강제하므로) — 입력 토큰을 크게 줄인다. 사진·측정값은 그대로 유지.
    section = _ANALYSIS_STAGE_SECTIONS.get(stage, "")
    dynamic = self._analysis_dynamic_metadata(payload)
    anchor_block = ""
    if anchor_values:
      anchor_block = (
        "다음 값은 이미 확정됐으니 다시 판정하지 말고 근거로만 사용해: "
        f"faceShape={anchor_values.get('faceShape')}, "
        f"skinType={anchor_values.get('skinType')}, "
        f"recommendedMood={anchor_values.get('recommendedMood')}. "
      )
    return f"{_ANALYSIS_CORE_INSTRUCTIONS}{section}{directive} {anchor_block}{dynamic}"

  async def _analyze_image_bedrock_fanout(
    self,
    payload: dict[str, Any],
    source_image_bytes: bytes,
    on_anchor: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
  ) -> dict[str, Any]:
    """앵커 콜로 공유값을 확정한 뒤 A(인식/인상)·B(처방/스타일링)를 병렬 실행하고,
    disjoint 키를 merge해 기존 정규화/검증을 1회 적용한다.

    on_anchor: 앵커 확정 직후(~4s) 호출 — 잡이 컬럼을 조기 기록해 로딩 화면이
    핵심 프리뷰를 먼저 보여줄 수 있게 한다(Phase 5). 실패해도 본 분석은 안 깨진다."""
    started = time.monotonic()
    content_type = self._infer_content_type(payload)
    prepared_bytes, content_type = await asyncio.to_thread(
      self._prepare_source_image_for_analysis,
      source_image_bytes,
      content_type,
    )
    image_base64 = base64.b64encode(prepared_bytes).decode("utf-8")
    max_tokens = self.settings.bedrock_analysis_max_tokens

    # 1) 앵커: 공유값(faceShape/skinType/recommendedMood) 단독 확정 → 발산 원천 차단.
    anchor_raw = await asyncio.to_thread(
      self._bedrock_invoke_tool_sync,
      prompt_text=self._fanout_group_prompt(
        payload, stage="anchor", directive=_FANOUT_ANCHOR_DIRECTIVE,
      ),
      image_base64=image_base64,
      content_type=content_type,
      tool_name="return_face_analysis_anchor",
      tool_schema=ANCHOR_TOOL_SCHEMA,
      max_tokens=512,
      stage="anchor",
    )
    anchor_values = {key: anchor_raw.get(key) for key in ANCHOR_FIELD_KEYS}
    logger.info(
      "[aura:bedrock] analysis:anchor-ready durationMs=%s faceShape=%s",
      round((time.monotonic() - started) * 1000),
      anchor_values.get("faceShape"),
    )

    # 앵커 확정 즉시 콜백(로딩 프리뷰용) — 실패해도 본 분석은 계속.
    if on_anchor is not None:
      try:
        await on_anchor(anchor_values)
      except Exception as exc:  # noqa: BLE001 - 프리뷰 부가기능은 분석을 깨지 않는다.
        logger.warning("[aura:bedrock] anchor-callback failed: %s", exc.__class__.__name__)

    # 2) perception ∥ prescription ∥ styling ∥ skin ∥ feature — 앵커 주입, 동시
    #    실행(6분할). 독립 병렬 레그라 지연은 max(레그)에 흡수. prescription에서
    #    스타일링을 떼어 병목 레그를 낮췄고, feature(사진 형태 판정)는 짧은 enum이라
    #    max에 묻힌다.
    def leg(stage: str, directive: str, schema: dict[str, Any]):
      return asyncio.to_thread(
        self._bedrock_invoke_tool_sync,
        prompt_text=self._fanout_group_prompt(
          payload, stage=stage, directive=directive, anchor_values=anchor_values,
        ),
        image_base64=image_base64,
        content_type=content_type,
        tool_name=f"return_face_analysis_{stage}",
        tool_schema=schema,
        max_tokens=max_tokens,
        stage=stage,
      )

    results = await asyncio.gather(
      leg("perception", _FANOUT_PERCEPTION_DIRECTIVE, PERCEPTION_TOOL_SCHEMA),
      leg("prescription", _FANOUT_PRESCRIPTION_DIRECTIVE, PRESCRIPTION_TOOL_SCHEMA),
      leg("styling", _FANOUT_STYLING_DIRECTIVE, STYLING_TOOL_SCHEMA),
      leg("skin", _FANOUT_SKIN_DIRECTIVE, SKIN_TOOL_SCHEMA),
      leg("feature", _FANOUT_FEATURE_DIRECTIVE, FEATURE_TOOL_SCHEMA),
      return_exceptions=True,
    )
    # fail-closed: 한쪽이라도 실패하면 전체 실패(현행 all-or-nothing 시맨틱 보존).
    for result in results:
      if isinstance(result, BaseException):
        raise result
    perception_raw, prescription_raw, styling_raw, skin_raw, feature_raw = results

    merged: dict[str, Any] = {}
    for key in ANCHOR_FIELD_KEYS:
      merged[key] = anchor_values.get(key)
    for key in PERCEPTION_FIELD_KEYS:
      merged[key] = perception_raw.get(key)
    for key in PRESCRIPTION_FIELD_KEYS:
      merged[key] = prescription_raw.get(key)
    for key in STYLING_FIELD_KEYS:
      merged[key] = styling_raw.get(key)
    for key in SKIN_FIELD_KEYS:
      merged[key] = skin_raw.get(key)
    for key in FEATURE_FIELD_KEYS:
      merged[key] = feature_raw.get(key)

    parsed = self._normalize_analysis_result(merged)
    logger.info(
      "[aura:bedrock] analysis:fanout-success durationMs=%s",
      round((time.monotonic() - started) * 1000),
    )
    return parsed

  def _analyze_image_sync(
    self,
    payload: dict[str, Any],
    source_image_bytes: bytes,
  ) -> dict[str, Any]:
    provider = self.settings.analysis_provider
    if provider == "bedrock":
      return self._analyze_image_with_bedrock_sync(payload, source_image_bytes)

    if provider != "openai":
      raise AppError(
        503,
        "AI_PROVIDER_UNSUPPORTED",
        f"Unsupported AI_PROVIDER: {provider}",
      )

    started_at = time.monotonic()
    content_type = self._infer_content_type(payload)
    source_image_bytes, content_type = self._prepare_source_image_for_analysis(
      source_image_bytes,
      content_type,
    )
    source_image_base64 = base64.b64encode(source_image_bytes).decode("utf-8")
    logger.info(
      "[aura:openai] analysis:start model=%s",
      self.settings.openai_analysis_model_id,
    )
    response = self._client().responses.create(
      model=self.settings.openai_analysis_model_id,
      input=[
        {
          "role": "developer",
          "content": "You are a concise, practical K-beauty makeup analyst. Return JSON only.",
        },
        {
          "role": "user",
          "content": [
            {"type": "input_text", "text": self._build_analysis_prompt(payload)},
            {
              "type": "input_image",
              "image_url": f"data:{content_type};base64,{source_image_base64}",
            },
          ],
        },
      ],
      text={"verbosity": "low"},
    )
    output_text = getattr(response, "output_text", "")

    if not output_text:
      raise AppError(
        502,
        "OPENAI_EMPTY_OUTPUT",
        "OpenAI analysis returned an empty response.",
      )

    parsed = self._normalize_analysis_result(self._parse_json_output(output_text))
    logger.info(
      "[aura:openai] analysis:success durationMs=%s",
      round((time.monotonic() - started_at) * 1000),
    )

    return parsed

  def _build_makeup_image_prompt(
    self,
    analysis_result: dict[str, Any],
    card: dict[str, Any],
  ) -> str:
    title = str(card.get("title") or "custom K-beauty makeup")
    subtitle = str(card.get("subtitle") or "")
    description = str(card.get("description") or "")
    tags = card.get("tags") if isinstance(card.get("tags"), list) else []
    tag_text = ", ".join(str(tag) for tag in tags[:4])
    personal_color = str(analysis_result.get("personalColor") or "")
    face_shape = str(analysis_result.get("faceShape") or "")
    tone_summary = str(analysis_result.get("toneSummary") or "")
    recommended_mood = str(analysis_result.get("recommendedMood") or "")

    prompt = (
      "Realistically edit the uploaded photo. Generate exactly one final makeup-applied photo only: the same original photo with makeup applied directly to the face. "
      "The app displays the source photo separately, so do not include any comparison, duplicate, or extra version inside this output. "
      "Forbidden: split-screen, side-by-side comparison, collage, duplicated face, inset image, frame, UI mockup, comparison layout, labels, captions, arrows, dividers, text, logos, or watermarks. "
      "Preserve the exact same canvas, camera distance, face size, head position, crop, framing, angle, perspective, background, clothing, hairstyle, glasses, and lighting. "
      "Do not zoom in, zoom out, crop tighter, pan, rotate, upscale or shift the face, change pose, replace background, or change composition. "
      "Preserve identity: face shape, jawline, cheek volume, eyes, nose, mouth, lip shape, skin tone, age, natural asymmetry, and gender presentation. "
      "Use a polished K-beauty idol makeup direction, not a bare-face retouch. Apply at least three visible makeup changes across complexion finish, eye definition, cheek color, and lip color with realistic blending. "
      "Male-presenting user: male idol grooming only: tone-up base, oil-control, brows, soft contour, subtle eyes, natural tinted lip; no glam lashes, heavy blush, glossy colored lips, or dramatic shadow. "
      "Female-presenting user: idol makeup with tone-up base, brows, blended shadow, clean liner, curled lashes, blush, and gradient/glossy lip. "
      "Do not slim the face, enlarge eyes, reshape features, change gender or age, plastic-smooth skin, celebrity-look, or studio model style. "
      f"Apply a makeup look named '{title}'. "
      f"Makeup mood: {subtitle}. Details: {description}. Tags: {tag_text}. "
      f"Personal color: {personal_color}. Face shape: {face_shape}. Tone summary: {tone_summary}. "
      f"Recommended mood: {recommended_mood}. "
      "Reflect these colors, textures, and placement while staying the same user's own photo. "
      "Do not leave the face bare, no-makeup, lightly retouched, or visually unchanged. No extra people, accessories, or distorted facial features."
    )

    return " ".join(prompt.split())[:2200]

  def _resolve_makeup_image_size(self) -> str:
    configured_size = (self.settings.openai_image_size or "auto").strip()

    if configured_size != "auto":
      logger.info(
        "[aura:openai] image-generation:size-override configured=%s effective=auto reason=preserve_source_composition",
        configured_size,
      )

    return "auto"

  def _supports_input_fidelity_option(self) -> bool:
    model_id = (self.settings.openai_image_model_id or "").strip().lower()

    return model_id == "gpt-image-1"

  def _resolve_makeup_image_output(self) -> tuple[str, int | None, str, str]:
    output_format = (self.settings.openai_image_output_format or "jpeg").strip().lower()

    if output_format == "jpg":
      output_format = "jpeg"

    if output_format not in {"jpeg", "png", "webp"}:
      logger.warning(
        "[aura:openai] image-generation:unsupported-output-format configured=%s effective=jpeg",
        output_format,
      )
      output_format = "jpeg"

    extension = ".jpg" if output_format == "jpeg" else f".{output_format}"
    content_type = f"image/{output_format}"
    compression = None

    if output_format in {"jpeg", "webp"}:
      compression = max(0, min(100, int(self.settings.openai_image_output_compression)))

    return output_format, compression, extension, content_type

  def _build_image_edit_params(self, image_file: Any, prompt: str, edit_size: str) -> dict[str, Any]:
    output_format, output_compression, _, _ = self._resolve_makeup_image_output()
    params = {
      "model": self.settings.openai_image_model_id,
      "image": image_file,
      "prompt": prompt,
      "background": "opaque",
      "n": 1,
      "quality": self.settings.openai_image_quality,
      "size": edit_size,
      "output_format": output_format,
    }

    if output_compression is not None:
      params["output_compression"] = output_compression

    if self._supports_input_fidelity_option():
      params["input_fidelity"] = "high"

    return params

  def _upload_generated_image(self, image_bytes: bytes, index: int) -> dict[str, str]:
    if not self.settings.s3_bucket_name:
      raise AppError(
        503,
        "S3_NOT_CONFIGURED",
        "S3_BUCKET_NAME is required for generated makeup images.",
      )

    _, _, extension, content_type = self._resolve_makeup_image_output()
    object_key = f"uploads/generated-makeup/{uuid4()}-{index}{extension}"
    self._s3_client().put_object(
      Bucket=self.settings.s3_bucket_name,
      Key=object_key,
      Body=image_bytes,
      ContentType=content_type,
      CacheControl="public, max-age=31536000, immutable",
    )
    cdn_base_url = self.settings.effective_cdn_base_url

    return {
      "bucket": self.settings.s3_bucket_name,
      "objectKey": object_key,
      "imageUrl": f"{cdn_base_url}/{object_key}" if cdn_base_url else f"s3://{self.settings.s3_bucket_name}/{object_key}",
    }

  def _edit_makeup_image_bytes(
    self,
    source_image_bytes: bytes,
    source_content_type: str,
    analysis_result: dict[str, Any],
    card: dict[str, Any],
    index: int,
  ) -> dict[str, Any]:
    started_at = time.monotonic()
    prompt = self._build_makeup_image_prompt(analysis_result, card)
    edit_size = self._resolve_makeup_image_size()
    suffix = self._source_file_suffix(source_content_type)
    logger.info(
      "[aura:openai] image-generation:item-start index=%s title=%s model=%s size=%s",
      index + 1,
      card.get("title"),
      self.settings.openai_image_model_id,
      edit_size,
    )

    temp_path: str | None = None

    try:
      with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as image_file:
        image_file.write(source_image_bytes)
        temp_path = image_file.name

      with open(temp_path, "rb") as image_file:
        response = self._client().images.edit(
          **self._build_image_edit_params(image_file, prompt, edit_size),
        )
    finally:
      if temp_path:
        Path(temp_path).unlink(missing_ok=True)

    image_base64 = response.data[0].b64_json if response.data else None

    if not image_base64:
      raise AppError(
        502,
        "OPENAI_IMAGE_EMPTY_OUTPUT",
        "OpenAI image generation returned no image.",
      )

    generated_image_bytes = base64.b64decode(image_base64)
    generated_image_bytes = self._optimize_generated_image_for_upload(generated_image_bytes)
    duration_ms = round((time.monotonic() - started_at) * 1000)

    return generated_image_bytes, duration_ms

  def _generate_single_makeup_image(
    self,
    source_image_bytes: bytes,
    source_content_type: str,
    analysis_result: dict[str, Any],
    card: dict[str, Any],
    index: int,
  ) -> dict[str, Any]:
    generated_image_bytes, duration_ms = self._edit_makeup_image_bytes(
      source_image_bytes,
      source_content_type,
      analysis_result,
      card,
      index,
    )
    upload = self._upload_generated_image(generated_image_bytes, index + 1)
    logger.info(
      "[aura:openai] image-generation:item-success index=%s bytes=%s durationMs=%s imageUrl=%s",
      index + 1,
      len(generated_image_bytes),
      duration_ms,
      upload["imageUrl"],
    )

    return {
      **card,
      "imageUrl": upload["imageUrl"],
      "imageBucket": upload["bucket"],
      "imageObjectKey": upload["objectKey"],
      "_imageGenerationDurationMs": duration_ms,
    }

  def _generate_recommended_makeup_images_sync(
    self,
    payload: dict[str, Any],
    source_image_bytes: bytes,
    analysis_result: dict[str, Any],
  ) -> dict[str, Any]:
    recommended_makeups = analysis_result.get("recommendedMakeups")

    if not isinstance(recommended_makeups, list) or not recommended_makeups:
      raise AppError(
        502,
        "RECOMMENDED_MAKEUPS_REQUIRED",
        "AI analysis must return recommendedMakeups before image generation.",
      )

    cards = [
      card
      for card in recommended_makeups[:RECOMMENDED_MAKEUP_COUNT]
      if isinstance(card, dict)
    ]

    if len(cards) < RECOMMENDED_MAKEUP_COUNT:
      raise AppError(
        502,
        "RECOMMENDED_MAKEUPS_INCOMPLETE",
        "AI analysis must return exactly 1 recommended makeup card.",
      )

    started_at = time.monotonic()
    source_content_type = self._infer_content_type(payload)
    source_image_bytes, source_content_type = self._prepare_source_image_for_generation(
      source_image_bytes,
      source_content_type,
    )
    generated_cards: list[dict[str, Any] | None] = [None] * len(cards)
    logger.info(
      "[aura:openai] image-generation:batch-start count=%s model=%s",
      len(cards),
      self.settings.openai_image_model_id,
    )

    with ThreadPoolExecutor(max_workers=len(cards)) as executor:
      futures = {
        executor.submit(
          self._generate_single_makeup_image,
          source_image_bytes,
          source_content_type,
          analysis_result,
          card,
          index,
        ): index
        for index, card in enumerate(cards)
      }

      for future in as_completed(futures):
        index = futures[future]
        generated_cards[index] = future.result()

    missing_image_indexes = [
      index + 1
      for index, card in enumerate(generated_cards)
      if not isinstance(card, dict) or not self._first_normalized_text(card.get("imageUrl"))
    ]

    if missing_image_indexes:
      raise AppError(
        502,
        "RECOMMENDED_MAKEUP_IMAGES_INCOMPLETE",
        "Recommended makeup image generation must return exactly 1 image URL.",
        details={"missingIndexes": missing_image_indexes},
      )

    image_generation_batch_ms = round((time.monotonic() - started_at) * 1000)
    logger.info(
      "[aura:openai] image-generation:batch-success count=%s durationMs=%s",
      len(generated_cards),
      image_generation_batch_ms,
    )
    image_generation_items = [
      {
        "index": index + 1,
        "durationMs": card.pop("_imageGenerationDurationMs", None),
      }
      for index, card in enumerate(generated_cards)
      if isinstance(card, dict)
    ]

    return {
      **analysis_result,
      "recommendedMakeups": generated_cards,
      "timing": {
        **(
          analysis_result.get("timing")
          if isinstance(analysis_result.get("timing"), dict)
          else {}
        ),
        "imageGenerationBatchMs": image_generation_batch_ms,
        "imageGenerationItems": image_generation_items,
      },
    }

  def _validate_completed_analysis_result(self, result: dict[str, Any]) -> None:
    recommended_makeups = result.get("recommendedMakeups")

    if (
      not isinstance(recommended_makeups, list)
      or len(recommended_makeups) != RECOMMENDED_MAKEUP_COUNT
    ):
      raise AppError(
        502,
        "RECOMMENDED_MAKEUPS_REQUIRED",
        "Completed analysis must include exactly 1 recommended makeup card.",
        details={
          "receivedCount": len(recommended_makeups) if isinstance(recommended_makeups, list) else 0,
        },
      )

    missing_image_indexes = [
      index + 1
      for index, card in enumerate(recommended_makeups)
      if not isinstance(card, dict) or not self._first_normalized_text(card.get("imageUrl"))
    ]

    if missing_image_indexes:
      raise AppError(
        502,
        "RECOMMENDED_MAKEUP_IMAGES_REQUIRED",
        "Completed analysis must include 1 generated makeup image URL.",
        details={"missingIndexes": missing_image_indexes},
      )

  async def analyze_text(
    self,
    payload: dict[str, Any],
    on_anchor: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
  ) -> dict[str, Any]:
    try:
      source_read_started_at = time.monotonic()
      source_image_bytes = await asyncio.to_thread(self._read_source_image_bytes, payload)
      source_image_read_ms = round((time.monotonic() - source_read_started_at) * 1000)

      text_analysis_started_at = time.monotonic()
      if (
        self.settings.analysis_provider == "bedrock"
        and self.settings.bedrock_analysis_fanout_enabled
      ):
        # 팬아웃: 앵커∥A∥B로 출력 decode 병렬화(async gather는 여기서).
        analysis_result = await self._analyze_image_bedrock_fanout(
          payload,
          source_image_bytes,
          on_anchor=on_anchor,
        )
      else:
        analysis_result = await asyncio.to_thread(
          self._analyze_image_sync,
          payload,
          source_image_bytes,
        )
      text_analysis_ms = round((time.monotonic() - text_analysis_started_at) * 1000)
      analysis_result["analysisProvider"] = self.settings.analysis_provider
      analysis_result["analysisModel"] = self.settings.effective_analysis_model_id
      analysis_result["embeddingProvider"] = "bedrock"
      analysis_result["embeddingModel"] = self.settings.effective_embedding_model_id
      analysis_result["imageGenerationProvider"] = self.settings.image_generation_provider_normalized
      analysis_result["imageGenerationModel"] = (
        self.settings.openai_image_model_id
        if self.settings.image_generation_provider_normalized == "openai"
        else None
      )
      analysis_result["imageGenerationStatus"] = "pending"
      analysis_result["timing"] = {
        **(
          analysis_result.get("timing")
          if isinstance(analysis_result.get("timing"), dict)
          else {}
        ),
        "sourceImageReadMs": source_image_read_ms,
        "textAnalysisMs": text_analysis_ms,
      }

      return analysis_result
    except AppError:
      raise
    except (OpenAIError, BotoCoreError, ClientError) as exc:
      logger.exception("[aura:ai] text-analysis:failed")
      raise AppError(
        502,
        "AI_INVOCATION_FAILED",
        "AI text analysis invocation failed.",
        details={"reason": exc.__class__.__name__, "message": str(exc)},
      ) from exc
    except Exception as exc:
      logger.exception("[aura:ai] text-analysis:failed")
      raise AppError(
        502,
        "AI_INVOCATION_FAILED",
        "AI text analysis invocation failed.",
        details={"reason": exc.__class__.__name__},
      ) from exc

  async def prepare_generation_source(
    self,
    payload: dict[str, Any],
    source_image_bytes: bytes | None = None,
  ) -> tuple[bytes, str]:
    """Read the source photo (if not already supplied) and downscale/re-encode
    it for image generation.

    This is safe to run concurrently with text analysis so the slow OpenAI
    image edit can start as soon as the report text is ready, instead of paying
    for the S3 read and resize on the image-generation critical path.
    """
    if source_image_bytes is None:
      source_image_bytes = await asyncio.to_thread(self._read_source_image_bytes, payload)

    source_content_type = self._infer_content_type(payload)

    return await asyncio.to_thread(
      self._prepare_source_image_for_generation,
      source_image_bytes,
      source_content_type,
    )

  async def generate_recommended_makeup_images(
    self,
    payload: dict[str, Any],
    analysis_result: dict[str, Any],
    on_card_generated: Any | None = None,
    *,
    prepared_source: tuple[bytes, str] | None = None,
  ) -> dict[str, Any]:
    if self.settings.image_generation_provider_normalized != "openai":
      raise AppError(
        503,
        "IMAGE_GENERATION_PROVIDER_UNSUPPORTED",
        "Only OpenAI image generation is currently supported.",
      )

    recommended_makeups = analysis_result.get("recommendedMakeups")

    if not isinstance(recommended_makeups, list) or not recommended_makeups:
      raise AppError(
        502,
        "RECOMMENDED_MAKEUPS_REQUIRED",
        "AI analysis must return recommendedMakeups before image generation.",
      )

    cards = [
      card
      for card in recommended_makeups[:RECOMMENDED_MAKEUP_COUNT]
      if isinstance(card, dict)
    ]

    if len(cards) < RECOMMENDED_MAKEUP_COUNT:
      raise AppError(
        502,
        "RECOMMENDED_MAKEUPS_INCOMPLETE",
        "AI analysis must return exactly 1 recommended makeup card.",
      )

    started_at = time.monotonic()

    if prepared_source is not None:
      # Source was read and downscaled ahead of time (overlapped with text
      # analysis), so image generation starts without extra S3/CPU work.
      source_image_bytes, source_content_type = prepared_source
      image_source_read_ms = 0
      image_source_prepare_ms = 0
    else:
      source_read_started_at = time.monotonic()
      source_image_bytes = await asyncio.to_thread(self._read_source_image_bytes, payload)
      image_source_read_ms = round((time.monotonic() - source_read_started_at) * 1000)
      source_content_type = self._infer_content_type(payload)
      source_prepare_started_at = time.monotonic()
      source_image_bytes, source_content_type = await asyncio.to_thread(
        self._prepare_source_image_for_generation,
        source_image_bytes,
        source_content_type,
      )
      image_source_prepare_ms = round((time.monotonic() - source_prepare_started_at) * 1000)

    generated_cards: list[dict[str, Any]] = [dict(card) for card in cards]
    image_generation_items: list[dict[str, Any]] = []
    image_generation_errors: list[dict[str, Any]] = []
    logger.info(
      "[aura:openai] image-generation:background-start count=%s model=%s",
      len(cards),
      self.settings.openai_image_model_id,
    )

    async def generate_card(index: int, card: dict[str, Any]):
      try:
        generated_card = await asyncio.to_thread(
          self._generate_single_makeup_image,
          source_image_bytes,
          source_content_type,
          analysis_result,
          card,
          index,
        )
        return index, generated_card, None
      except Exception as exc:  # noqa: BLE001 - keep other image tasks alive.
        return index, None, exc

    tasks = [asyncio.create_task(generate_card(index, card)) for index, card in enumerate(cards)]

    for task in asyncio.as_completed(tasks):
      index, generated_card, error = await task

      if error is not None:
        error_message = str(error)
        error_detail = {
          "index": index + 1,
          "message": error_message,
          "reason": error.__class__.__name__,
        }

        if isinstance(error, AppError):
          error_detail.update({"code": error.code, "message": error.message})

        image_generation_errors.append(error_detail)
        generated_cards[index] = {**generated_cards[index], "imageStatus": "failed"}
        logger.warning(
          "[aura:openai] image-generation:item-failed index=%s reason=%s message=%s",
          index + 1,
          error.__class__.__name__,
          error_message,
        )
        continue

      if not isinstance(generated_card, dict):
        continue

      duration_ms = generated_card.pop("_imageGenerationDurationMs", None)
      generated_cards[index] = {**generated_card, "imageStatus": "ready"}
      image_generation_items.append({"index": index + 1, "durationMs": duration_ms})
      partial_result = {
        **analysis_result,
        "recommendedMakeups": generated_cards,
        "imageGenerationStatus": "processing",
        "timing": {
          **(
            analysis_result.get("timing")
            if isinstance(analysis_result.get("timing"), dict)
            else {}
          ),
          "imageSourceReadMs": image_source_read_ms,
          "imageSourcePrepareMs": image_source_prepare_ms,
          "imageGenerationItems": sorted(image_generation_items, key=lambda item: item["index"]),
          "imageGenerationStatus": "processing",
        },
      }

      if on_card_generated:
        await on_card_generated(index, generated_cards[index], partial_result)

    image_generation_status = "failed" if image_generation_errors else "completed"
    image_generation_total_ms = round((time.monotonic() - started_at) * 1000)
    result = {
      **analysis_result,
      "recommendedMakeups": generated_cards,
      "imageGenerationStatus": image_generation_status,
      "timing": {
        **(
          analysis_result.get("timing")
          if isinstance(analysis_result.get("timing"), dict)
          else {}
        ),
        "imageSourceReadMs": image_source_read_ms,
        "imageSourcePrepareMs": image_source_prepare_ms,
        "imageGenerationItems": sorted(image_generation_items, key=lambda item: item["index"]),
        "imageGenerationStatus": image_generation_status,
        "imageGenerationTotalMs": image_generation_total_ms,
      },
    }

    if image_generation_errors:
      result["imageGenerationErrors"] = image_generation_errors

    logger.info(
      "[aura:openai] image-generation:background-finished status=%s generated=%s failed=%s durationMs=%s",
      image_generation_status,
      len(image_generation_items),
      len(image_generation_errors),
      image_generation_total_ms,
    )

    return result

  def _generate_personalized_makeup_recommendations_sync(
    self,
    payload: dict[str, Any],
  ) -> dict[str, Any]:
    total_started_at = time.monotonic()
    source_image_bytes, source_content_type = self._read_makeup_recommendation_source(
      str(payload.get("sourceImageUrl") or ""),
    )
    source_image_bytes, source_content_type = self._prepare_source_image_for_generation(
      source_image_bytes,
      source_content_type,
    )
    text_started_at = time.monotonic()
    looks = self._generate_personalized_makeup_text_sync(
      payload,
      source_image_bytes,
      source_content_type,
    )
    text_duration_ms = round((time.monotonic() - text_started_at) * 1000)
    profile = payload.get("profile") if isinstance(payload.get("profile"), dict) else {}
    analysis_result = {
      "personalColor": payload.get("personalColor"),
      "faceShape": profile.get("faceShape"),
      "toneSummary": profile.get("toneSummary"),
      "recommendedMood": profile.get("recommendedMood"),
    }
    image_cards = [
      {
        **look,
        "description": look.get("summary"),
      }
      for look in looks
    ]
    generated: list[tuple[bytes, int] | None] = [None] * len(image_cards)
    image_started_at = time.monotonic()

    with ThreadPoolExecutor(max_workers=len(image_cards)) as executor:
      futures = {
        executor.submit(
          self._edit_makeup_image_bytes,
          source_image_bytes,
          source_content_type,
          analysis_result,
          card,
          index,
        ): index
        for index, card in enumerate(image_cards)
      }

      for future in as_completed(futures):
        index = futures[future]
        generated[index] = future.result()

    results: list[dict[str, Any]] = []
    conditions = [
      str(condition).strip()
      for condition in payload.get("conditions", [])
      if str(condition).strip()
    ] if isinstance(payload.get("conditions"), list) else []
    _, _, _, output_content_type = self._resolve_makeup_image_output()

    for index, look in enumerate(looks):
      generated_item = generated[index]

      if generated_item is None:
        raise AppError(
          502,
          "OPENAI_MAKEUP_IMAGE_INCOMPLETE",
          "OpenAI did not generate every requested makeup image.",
        )

      image_bytes, image_duration_ms = generated_item

      if self.settings.s3_bucket_name:
        upload = self._upload_generated_image(image_bytes, index + 1)
        image_url = upload["imageUrl"]
      else:
        image_url = f"data:{output_content_type};base64,{base64.b64encode(image_bytes).decode('ascii')}"

      role = str(look.get("role") or MAKEUP_RECOMMENDATION_ROLES[index])
      products = [
        {
          **product,
          "id": f"openai-{role}-{product.get('area')}-{product_index + 1}",
        }
        for product_index, product in enumerate(look.get("products", []))
        if isinstance(product, dict)
      ]
      results.append(
        {
          "id": f"openai-{role}-{uuid4()}",
          "arFilterId": MAKEUP_RECOMMENDATION_AR_FILTERS[role],
          "role": role,
          "title": look.get("title"),
          "summary": look.get("summary"),
          "imageUrl": image_url,
          "reasons": look.get("reasons", []),
          "appliedConditions": conditions,
          "durationMinutes": look.get("durationMinutes"),
          "difficulty": look.get("difficulty"),
          "steps": look.get("steps", []),
          "products": products,
          "imageGenerationDurationMs": image_duration_ms,
        },
      )

    return {
      "results": results,
      "provider": "openai",
      "textModel": self.settings.openai_analysis_model_id,
      "imageModel": self.settings.openai_image_model_id,
      "timing": {
        "textMs": text_duration_ms,
        "imagesMs": round((time.monotonic() - image_started_at) * 1000),
        "totalMs": round((time.monotonic() - total_started_at) * 1000),
      },
    }

  async def generate_personalized_makeup_recommendations(
    self,
    payload: dict[str, Any],
  ) -> dict[str, Any]:
    try:
      return await asyncio.to_thread(
        self._generate_personalized_makeup_recommendations_sync,
        payload,
      )
    except AppError:
      raise
    except (OpenAIError, BotoCoreError, ClientError, httpx.HTTPError) as exc:
      logger.exception("[aura:openai] makeup-recommendation:failed")
      raise AppError(
        502,
        "OPENAI_MAKEUP_RECOMMENDATION_FAILED",
        "OpenAI makeup recommendation generation failed.",
        details={"reason": exc.__class__.__name__, "message": str(exc)},
      ) from exc
    except Exception as exc:
      logger.exception("[aura:openai] makeup-recommendation:failed")
      raise AppError(
        502,
        "OPENAI_MAKEUP_RECOMMENDATION_FAILED",
        "OpenAI makeup recommendation generation failed.",
        details={"reason": exc.__class__.__name__},
      ) from exc

  async def analyze_image(self, payload: dict[str, Any]) -> dict[str, Any]:
    try:
      total_started_at = time.monotonic()
      analysis_result = await self.analyze_text(payload)
      result = await self.generate_recommended_makeup_images(payload, analysis_result)
      result["timing"] = {
        **(result.get("timing") if isinstance(result.get("timing"), dict) else {}),
        "totalMs": round((time.monotonic() - total_started_at) * 1000),
      }
      self._validate_completed_analysis_result(result)

      return result
    except AppError:
      raise
    except (OpenAIError, BotoCoreError, ClientError) as exc:
      logger.exception("[aura:ai] invocation:failed")
      raise AppError(
        502,
        "AI_INVOCATION_FAILED",
        "AI analysis or image generation failed.",
        details={"reason": exc.__class__.__name__, "message": str(exc)},
      ) from exc
    except Exception as exc:
      logger.exception("[aura:ai] invocation:failed")
      raise AppError(
        502,
        "AI_INVOCATION_FAILED",
        "AI analysis or image generation failed.",
        details={"reason": exc.__class__.__name__},
      ) from exc
