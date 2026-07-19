"""Build model-safe makeup recommendation evidence from face-analysis measurements.

The analysis report keeps the full capture payload for audit/debugging.  A makeup
recommendation must not copy that payload across the model boundary: capture IDs,
image URIs, raw landmarks, sensor metadata, calibration receipts, and raw metric
values are deliberately excluded here.  Only quality-gated semantic summaries and
curated personal-colour palette labels are returned.
"""

from __future__ import annotations

import math
import re
from typing import Any

from app.services.face_analysis_measurements import (
  GEOMETRY2D_MODEL_VISIBLE_METRIC_NAMES,
  PERSONAL_COLOR_RESULT_STATUSES,
  PERSONAL_COLOR_TONE_CODES,
  PERSONAL_COLOR_TONE_TO_SEASON,
  PERSONAL_COLOR_USABLE_STATUSES,
  normalize_camera_measurements,
)
from app.services.face_analysis_rules import RULES_VERSION, derive_face_analysis
from app.services.makeup_recommendation_geometry_guidance import (
  compile_actionable_geometry_guidance,
)


MEASUREMENT_INSIGHTS_SCHEMA_VERSION = "makeup-recommendation-measurement-insights-v1"
FACE_GEOMETRY_SCHEMA_VERSION = "aura-face-geometry-v1"
MEASUREMENTS_SCHEMA_VERSION = "aura-face-analysis-measurements-v1"

# Mirrors apps/mobile/.../facePoseGates.ts POST_CAPTURE_POSE_GATE.  Measurements
# outside the capture contract are not allowed to influence a recommendation.
POST_CAPTURE_POSE_LIMITS = {
  "yawDeg": 8.0,
  "pitchDeg": 12.0,
  "rollDeg": 5.0,
}

MIN_MODEL_CONFIDENCE = 0.5
WARNING_CODE_RE = re.compile(r"^[a-z0-9][a-z0-9_.:-]{0,79}$", re.IGNORECASE)

TONE_LABELS_KO = {
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

AXIS_LABELS = {
  "temperature": {
    "low": ("cool", "쿨"),
    "mid": ("neutral", "뉴트럴"),
    "high": ("warm", "웜"),
  },
  "value": {
    "low": ("light", "라이트"),
    "mid": ("medium", "미디엄"),
    "high": ("deep", "딥"),
  },
  "chroma": {
    "low": ("soft", "소프트"),
    "mid": ("medium", "중간 채도"),
    "high": ("vivid", "비비드"),
  },
  "clarity": {
    "low": ("muted", "뮤트"),
    "mid": ("balanced", "중간 선명도"),
    "high": ("clear", "클리어"),
  },
  "contrast": {
    "low": ("low", "저대비"),
    "mid": ("medium", "중간 대비"),
    "high": ("high", "고대비"),
  },
}

PALETTE_ENUMS = {
  "undertone": {"warm", "neutral", "cool"},
  "valueBand": {"light", "mid", "deep"},
  "chromaBand": {"soft", "clear", "vivid"},
}


def _record(value: Any) -> dict[str, Any]:
  return value if isinstance(value, dict) else {}


def _finite(value: Any) -> float | None:
  if isinstance(value, bool) or not isinstance(value, (int, float)):
    return None
  numeric = float(value)
  return numeric if math.isfinite(numeric) else None


def _clean_text(value: Any, limit: int = 100) -> str | None:
  if not isinstance(value, str):
    return None
  cleaned = " ".join(value.split())
  return cleaned[:limit] or None


def _warning_codes(*values: Any, limit: int = 12) -> list[str]:
  result: list[str] = []
  for value in values:
    items = value if isinstance(value, list) else [value]
    for item in items:
      cleaned = _clean_text(item, 80)
      if not cleaned or not WARNING_CODE_RE.fullmatch(cleaned) or cleaned in result:
        continue
      result.append(cleaned)
      if len(result) >= limit:
        return result
  return result


def _confidence_level(confidence: float, *, provisional: bool = False) -> str:
  confidence = max(0.0, min(1.0, confidence))
  # A provisional colour result stays supporting evidence even when its numeric
  # measurement quality is high.
  if confidence >= 0.8 and not provisional:
    return "high"
  if confidence >= MIN_MODEL_CONFIDENCE:
    return "medium"
  return "low"


def _pose_gate(geometry: dict[str, Any]) -> tuple[bool, list[str]]:
  pose = _record(geometry.get("pose"))
  warnings: list[str] = []
  for key, limit in POST_CAPTURE_POSE_LIMITS.items():
    value = _finite(pose.get(key))
    if value is None:
      warnings.append(f"pose_{key}_unavailable")
    elif abs(value) > limit:
      warnings.append(f"pose_{key}_out_of_range")
  return not warnings, warnings


def _semantic_insight(value: Any) -> dict[str, Any] | None:
  payload = value.model_dump(by_alias=True) if hasattr(value, "model_dump") else {}
  confidence = _finite(payload.get("confidence")) or 0.0
  label = _clean_text(payload.get("label"), 120)
  description = _clean_text(payload.get("description"), 240)
  if confidence < MIN_MODEL_CONFIDENCE or not label or not description:
    return None
  derived_from = [
    key
    for key in payload.get("rationaleMetricKeys", [])
    if isinstance(key, str)
    and (
      key.startswith("geometry2d.")
      or key.startswith("personalColor.")
    )
  ][:8]
  if not derived_from:
    return None
  return {
    "label": label,
    "description": description,
    "confidence": round(confidence, 3),
    "derivedFrom": derived_from,
  }


def _valid_geometry_metric_names(geometry: dict[str, Any]) -> list[str]:
  metrics = _record(geometry.get("metrics"))
  accepted: list[str] = []
  for name in GEOMETRY2D_MODEL_VISIBLE_METRIC_NAMES:
    metric = _record(metrics.get(name))
    if _finite(metric.get("value")) is None:
      continue
    if _warning_codes(metric.get("warnings")):
      continue
    accepted.append(name)
  return accepted


def _compile_face_structure(
  measurements: dict[str, Any],
  normalized_profile: dict[str, Any],
) -> dict[str, Any] | None:
  geometry = _record(measurements.get("faceGeometry2d"))
  if not geometry:
    return None

  status = geometry.get("status") if isinstance(geometry.get("status"), str) else "unknown"
  schema_ok = geometry.get("schemaVersion") == FACE_GEOMETRY_SCHEMA_VERSION
  status_ok = status in {"full_success", "partial_success"}
  pose_ok, pose_warnings = _pose_gate(geometry)
  accepted_metrics = _valid_geometry_metric_names(geometry)
  metric_warnings = _warning_codes(
    *(
      _record(metric).get("warnings")
      for metric in _record(geometry.get("metrics")).values()
    ),
  )
  warnings = _warning_codes(geometry.get("warnings"), metric_warnings, pose_warnings)
  usable = schema_ok and status_ok and pose_ok and bool(accepted_metrics)
  quality_score = 1.0 if status == "full_success" else 0.75 if status_ok else 0.0
  if not pose_ok or not schema_ok:
    quality_score = 0.0

  result: dict[str, Any] = {
    "source": "faceGeometry2d",
    "status": status,
    "usable": usable,
    "confidence": quality_score,
    "confidenceLevel": _confidence_level(quality_score),
    "warnings": warnings,
    "acceptedMetricCount": len(accepted_metrics),
    "acceptedMetrics": accepted_metrics,
    "availableMetricGroups": sorted({
      "brow" if name.startswith(("brow", "eyeBrow")) else
      "eye" if name.startswith(("canthal", "eye", "interCanthal")) else
      "lip" if name.startswith(("lip", "mouth")) else
      "contour"
      for name in accepted_metrics
    }),
  }
  if not usable:
    result["reason"] = (
      "unsupported_schema" if not schema_ok else
      "measurement_status_not_usable" if not status_ok else
      "pose_quality_gate_failed" if not pose_ok else
      "no_clean_metrics"
    )
    return result

  derived = derive_face_analysis(normalized_profile)
  insights = {
    key: insight
    for key, candidate in (
      ("faceContour", derived.face_shape),
      ("eyeDirection", derived.eye_brow),
      ("leftRightBalance", derived.asymmetry),
    )
    if (insight := _semantic_insight(candidate)) is not None
  }
  if insights:
    result["insights"] = insights
  actionable_guidance = compile_actionable_geometry_guidance(normalized_profile)
  if actionable_guidance:
    result["actionableGuidance"] = actionable_guidance
  result["rulesVersion"] = RULES_VERSION
  return result


def _axis_payload(axis_name: str, metric: Any) -> dict[str, Any] | None:
  if getattr(getattr(metric, "status", None), "value", None) != "measured":
    return None
  value = _finite(getattr(metric, "value", None))
  confidence = _finite(getattr(metric, "confidence", None)) or 0.0
  if value is None or confidence < MIN_MODEL_CONFIDENCE or axis_name not in AXIS_LABELS:
    return None
  band = "low" if value < -0.15 else "high" if value > 0.15 else "mid"
  code, label = AXIS_LABELS[axis_name][band]
  return {
    "direction": code,
    "label": label,
    "confidence": round(confidence, 3),
  }


def _palette_family(value: Any) -> dict[str, Any] | None:
  item = _record(value)
  family = _record(item.get("family")) or item
  undertone = family.get("undertone")
  value_band = family.get("valueBand")
  chroma_band = family.get("chromaBand")
  if (
    undertone not in PALETTE_ENUMS["undertone"]
    or value_band not in PALETTE_ENUMS["valueBand"]
    or chroma_band not in PALETTE_ENUMS["chromaBand"]
  ):
    return None
  exemplars = [
    cleaned
    for raw in (family.get("exemplars") if isinstance(family.get("exemplars"), list) else [])[:4]
    if (cleaned := _clean_text(raw, 40))
  ]
  return {
    "label": _clean_text(family.get("labelKo"), 80),
    "undertone": undertone,
    "valueBand": value_band,
    "chromaBand": chroma_band,
    "exemplars": exemplars,
  }


def _palette_list(value: Any) -> list[dict[str, Any]]:
  if not isinstance(value, list):
    return []
  return [
    family
    for item in value[:4]
    if (family := _palette_family(item)) is not None
  ]


def _compile_personal_color(
  measurements: dict[str, Any],
  normalized_profile: dict[str, Any],
) -> dict[str, Any] | None:
  reported = _record(_record(measurements.get("personalColor")).get("reported"))
  if not reported:
    return None

  status = reported.get("status") if isinstance(reported.get("status"), str) else "unknown"
  confidence = _finite(reported.get("measurementConfidence")) or 0.0
  warnings = _warning_codes(reported.get("warnings"))
  usable = (
    status in PERSONAL_COLOR_USABLE_STATUSES
    and confidence >= MIN_MODEL_CONFIDENCE
  )
  result: dict[str, Any] = {
    "source": "personalColor.reported",
    "status": status,
    "usable": usable,
    "confidence": round(max(0.0, min(1.0, confidence)), 3),
    "confidenceLevel": _confidence_level(confidence, provisional=status != "definitive"),
    "warnings": warnings,
    "evidenceLevel": "primary" if status == "definitive" else "supporting",
  }
  if not usable:
    result["reason"] = (
      "measurement_status_not_usable"
      if status in PERSONAL_COLOR_RESULT_STATUSES
      else "unsupported_status"
    )
    return result

  tone = _record(reported.get("tone"))
  top = tone.get("top")
  season = tone.get("season")
  secondary = tone.get("secondary")
  tone_is_safe = (
    isinstance(top, str)
    and top in PERSONAL_COLOR_TONE_CODES
    and isinstance(season, str)
    and PERSONAL_COLOR_TONE_TO_SEASON[top] == season
    and (
      secondary is None
      or isinstance(secondary, str) and secondary in PERSONAL_COLOR_TONE_CODES
    )
  )
  if tone_is_safe:
    result["tone"] = {
      "topCode": top,
      "topLabel": TONE_LABELS_KO[top],
      "season": season,
      "secondaryCode": secondary,
      "secondaryLabel": TONE_LABELS_KO.get(secondary) if isinstance(secondary, str) else None,
    }

  axes: dict[str, Any] = {}
  for axis_name in AXIS_LABELS:
    metric = normalized_profile.get(f"personalColor.axes.{axis_name}")
    if metric is not None and (axis := _axis_payload(axis_name, metric)) is not None:
      axes[axis_name] = axis
  if axes:
    result["axes"] = axes

  palette = _record(reported.get("palette"))
  best = _palette_list(palette.get("best"))
  avoid = _palette_list(palette.get("worst"))
  if best:
    result["bestPalettes"] = best
  if avoid:
    result["avoidPalettes"] = avoid
  return result


def compile_makeup_measurement_insights(measurements: Any) -> dict[str, Any]:
  """Return bounded, semantic evidence safe for prompts and saved reports."""
  raw = _record(measurements)
  if raw.get("schemaVersion") != MEASUREMENTS_SCHEMA_VERSION:
    return {}

  normalized_profile = normalize_camera_measurements(raw)
  face_structure = _compile_face_structure(raw, normalized_profile)
  personal_color = _compile_personal_color(raw, normalized_profile)
  if face_structure is None and personal_color is None:
    return {}
  result: dict[str, Any] = {
    "schemaVersion": MEASUREMENT_INSIGHTS_SCHEMA_VERSION,
  }
  if face_structure is not None:
    result["faceStructure"] = face_structure
  if personal_color is not None:
    result["personalColor"] = personal_color
  return result
