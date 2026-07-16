from app.schemas.face_analysis_v2 import MeasurementStatus, MetricEnvelope
from app.services.face_analysis_measurements import (
  build_measurement_coverage,
  filter_metrics_for_audience,
  merge_measurements,
  normalize_camera_measurements,
  with_explicit_unmeasured,
)

REQUIRED_FACE3D_METRIC_KEYS = (
  "noseTipProjection",
  "chinProjection",
  "upperLipToELine",
  "lowerLipToELine",
  "centralProjectionScore",
)


def ai_metric(
  value: str,
  *,
  confidence: float = 0.9,
  sensitivity: int = 1,
) -> dict:
  return {
    "value": value,
    "unit": "label",
    "confidence": confidence,
    "source": "ai",
    "status": "estimated",
    "shots": ["S1"],
    "sensitivity": sensitivity,
    "warnings": [],
  }


def test_normalizes_current_camera_sections_with_provenance() -> None:
  result = normalize_camera_measurements(
    {
      "schemaVersion": "aura-face-analysis-measurements-v1",
      "faceVerticalThirds": {
        "hairlineAnalysis": {
          "analysisEligible": True,
          "confidence": 0.87,
          "outcome": "detected_high_confidence",
          "provider": "apple_semantic_matte",
        },
        "keypoints": {
          "H": {"confidence": 0.87, "provider": "apple_semantic_matte"},
        },
        "measurementMode": "full_vertical_thirds",
        "status": "full_success",
        "quality": {"usable": True, "warnings": []},
        "verticalThirds": {
          "confidence": 0.87,
          "upperNormalized": 0.31,
          "middleNormalized": 0.34,
          "lowerNormalized": 0.35,
          "warnings": [],
        },
        "faceLength": {"heightPx": 900, "widthPx": 700, "ratio": 1.286},
        "interpretation": {"dominantPart": "balanced", "summary": "s", "title": "t"},
        "faceLengthJudgment": {"band": {"hi": 1.30, "lo": 1.28}, "verdict": "wide"},
      },
      "faceGeometry2d": {
        "status": "full_success",
        "metrics": {
          "jawWidthRatio": {"value": 0.72, "unit": "ratio", "warnings": []},
        },
      },
      "face3d": {
        "warnings": [],
        "metrics": {
          "noseTipProjection": {
            "value": 0.14,
            "unit": "normalized",
            "confidence": 0.93,
            "validFrameCount": 30,
            "mad": 0.001,
          },
        },
      },
      "personalColor": {
        "reported": {
          "status": "definitive",
          "measurementConfidence": 0.81,
          "warnings": [],
          "axes": {"temperature": {"value": 0.32, "confidence": 0.8}},
          "tone": {"top": "autumn_muted", "season": "autumn"},
        },
      },
    },
  )

  assert result["verticalThirds.upperNormalized"].source.value == "landmark"
  assert result["geometry2d.jawWidthRatio"].source.value == "pixel"
  assert result["face3d.noseTipProjection"].source.value == "depth"
  assert result["personalColor.axes.temperature"].source.value == "pixel"
  assert result["face3d.noseTipProjection"].value == 0.14
  # 판정 단일 정본 키(2026-07-17): 측정 시점 판정이 profile로 올라온다.
  assert result["verticalThirds.dominantPart"].value == "balanced"
  assert result["verticalThirds.dominantPart"].unit == "label"
  assert result["verticalThirds.faceLengthVerdict"].value == "wide"


def test_middle_lower_only_does_not_authorize_h_dependent_metrics() -> None:
  result = normalize_camera_measurements(
    {
      "schemaVersion": "aura-face-analysis-measurements-v1",
      "faceVerticalThirds": {
        "hairlineAnalysis": {
          "analysisEligible": False,
          "confidence": 0.58,
          "outcome": "detected_low_confidence",
          "provider": "apple_semantic_matte",
        },
        "keypoints": {
          "H": {"confidence": 0.58, "provider": "apple_semantic_matte"},
        },
        "measurementMode": "middle_lower_only",
        "status": "partial_success",
        "quality": {"usable": True, "warnings": ["hairline_low_confidence"]},
        "verticalThirds": {
          "confidence": 0.9,
          "upperNormalized": 0.31,
          "middleNormalized": 0.34,
          "lowerNormalized": 0.35,
          "warnings": [],
        },
        # DB raw에는 과거/보정용 값이 남아도 정규화 결과는 fail-closed여야 한다.
        "faceLength": {"heightPx": 900, "widthPx": 700, "ratio": 1.286},
      },
    },
  )

  for key in (
    "contour.foreheadWidthType",
    "verticalThirds.upperNormalized",
    "verticalThirds.middleNormalized",
    "verticalThirds.lowerNormalized",
    "verticalThirds.faceHeightPx",
    "verticalThirds.faceWidthPx",
    "verticalThirds.faceRatio",
  ):
    assert result[key].value is None
    assert result[key].status is MeasurementStatus.BLOCKED
    assert result[key].reason == "hairline_not_analysis_eligible"


def test_uncalibrated_v2_face3d_is_preserved_but_blocked_from_product_use() -> None:
  result = normalize_camera_measurements(
    {
      "schemaVersion": "aura-face-analysis-measurements-v1",
      "face3d": {
        "aggregation": "median_mad",
        "collectionPolicyId": "unified-micro-burst-5of8-v1",
        "confidenceCalibrationStatus": "uncalibrated",
        "sampleMode": "micro_burst",
        "schemaVersion": "aura.face3d-profile.v2",
        "warnings": [],
        "metrics": {
          "noseTipProjection": {
            "value": 0.14,
            "unit": "normalized",
            "confidence": 0.7,
          },
        },
      },
    },
  )

  metric = result["face3d.noseTipProjection"]
  assert metric.value is None
  assert metric.status is MeasurementStatus.BLOCKED
  assert metric.reason == "face3d_confidence_uncalibrated"


def test_verified_v2_face3d_preserves_internal_mm_envelope() -> None:
  result = normalize_camera_measurements(
    {
      "schemaVersion": "aura-face-analysis-measurements-v1",
      "face3d": {
        "aggregation": "median_mad",
        "calibrationReceipt": {
          "captureNonce": "capture-1",
          "collectionPolicyId": "unified-micro-burst-5of8-v1",
          "gateVersion": "face3d-gate-v2",
          "profileBindingSha256": "b" * 64,
        },
        "captureNonce": "capture-1",
        "captureWindowMs": 280,
        "collectionPolicyId": "unified-micro-burst-5of8-v1",
        "completionRatio": 1.0,
        "confidenceCalibrationStatus": "calibrated",
        "gateVersion": "face3d-gate-v2",
        "profileBindingSha256": "b" * 64,
        "sampleMode": "micro_burst",
        "schemaVersion": "aura.face3d-profile.v2",
        "sensorProvenance": {
          "depthDataObservedRatio": 1.0,
          "deviceModel": "test-device",
          "faceTrackingSupported": True,
          "trueDepthHardware": True,
        },
        "serverCalibrationReceiptStatus": "verified",
        "targetFrameCount": 8,
        "topologyFingerprint": "test-topology",
        "validFrameCount": 8,
        "warnings": [],
        "metrics": {
          key: {
            "value": 0.14 + (index * 0.01),
            "valueMm": 2.8 + index,
            "valueMmConfidence": 0.62,
            "valueMmMad": 0.04,
            "valueMmValidFrameCount": 7,
            "unit": "normalized",
            "confidence": 0.7,
            "mad": 0.002,
            "validFrameCount": 8,
          }
          for index, key in enumerate(REQUIRED_FACE3D_METRIC_KEYS)
        },
      },
    },
  )

  ratio = result["face3d.noseTipProjection"]
  millimeters = result["face3d.noseTipProjection.mm"]
  assert ratio.value == 0.14
  assert ratio.unit == "ratio"
  assert millimeters.value == 2.8
  assert millimeters.confidence == 0.62
  assert millimeters.unit == "mm"
  assert millimeters.sensitivity == 3


def test_calibrated_v2_without_server_receipt_verification_stays_blocked() -> None:
  result = normalize_camera_measurements(
    {
      "schemaVersion": "aura-face-analysis-measurements-v1",
      "face3d": {
        "aggregation": "median_mad",
        "captureWindowMs": 280,
        "collectionPolicyId": "unified-micro-burst-5of8-v1",
        "completionRatio": 1.0,
        "confidenceCalibrationStatus": "calibrated",
        "gateVersion": "face3d-gate-v2",
        "sampleMode": "micro_burst",
        "schemaVersion": "aura.face3d-profile.v2",
        "warnings": [],
        "metrics": {
          "noseTipProjection": {
            "value": 0.14,
            "valueMm": 2.8,
            "unit": "normalized",
            "confidence": 0.7,
          },
        },
      },
    },
  )

  assert result["face3d.noseTipProjection"].value is None
  assert (
    result["face3d.noseTipProjection"].reason
    == "face3d_calibration_receipt_unverified"
  )
  assert result["face3d.noseTipProjection.mm"].value is None


def test_single_frame_face3d_is_never_product_eligible() -> None:
  result = normalize_camera_measurements(
    {
      "schemaVersion": "aura-face-analysis-measurements-v1",
      "face3d": {
        "aggregation": "none",
        "collectionPolicyId": "diagnostics-exact-1-v1",
        "confidenceCalibrationStatus": "calibrated",
        "sampleMode": "single_frame",
        "schemaVersion": "aura.face3d-profile.v2",
        "warnings": ["single_frame_unaggregated"],
        "metrics": {
          "noseTipProjection": {
            "value": 0.14,
            "unit": "normalized",
            "confidence": 0.0,
          },
        },
      },
    },
  )

  metric = result["face3d.noseTipProjection"]
  assert metric.status is MeasurementStatus.BLOCKED
  assert metric.reason == "face3d_single_frame_not_product_eligible"


def test_legacy_proxy_h_is_never_authoritative() -> None:
  result = normalize_camera_measurements(
    {
      "schemaVersion": "aura-face-analysis-measurements-v1",
      "faceVerticalThirds": {
        "status": "partial_success",
        "quality": {"usable": True, "warnings": ["hairline_approximated_mediapipe"]},
        "keypoints": {
          "H": {"confidence": 0.99, "provider": "mediapipe_forehead_approx"},
        },
        "verticalThirds": {
          "confidence": 0.99,
          "upperNormalized": 0.31,
          "middleNormalized": 0.34,
          "lowerNormalized": 0.35,
          "warnings": [],
        },
        "faceLength": {"heightPx": 900, "widthPx": 700, "ratio": 1.286},
      },
    },
  )

  assert result["verticalThirds.upperNormalized"].value is None
  assert result["verticalThirds.faceRatio"].value is None
  assert result["contour.foreheadWidthType"].value is None

  coverage = build_measurement_coverage(result)
  assert "contour.foreheadWidthType" in coverage.authoritative_keys
  assert "contour.foreheadWidthType" not in coverage.missing_observable_keys


def test_legacy_full_success_with_actual_h_remains_authoritative() -> None:
  result = normalize_camera_measurements(
    {
      "schemaVersion": "aura-face-analysis-measurements-v1",
      "faceVerticalThirds": {
        "schemaVersion": "aura-face-vertical-thirds-v1",
        "status": "full_success",
        "quality": {"usable": True, "warnings": []},
        "keypoints": {
          "H": {"confidence": 0.91, "provider": "apple_semantic_matte"},
        },
        "verticalThirds": {
          "confidence": 0.91,
          "upperNormalized": 0.31,
          "middleNormalized": 0.34,
          "lowerNormalized": 0.35,
          "warnings": [],
        },
        "faceLength": {"heightPx": 900, "widthPx": 700, "ratio": 1.286},
      },
    },
  )

  assert result["verticalThirds.upperNormalized"].value == 0.31
  assert result["verticalThirds.faceRatio"].value == 1.286


def test_unknown_face3d_schema_is_preserved_but_blocked() -> None:
  result = normalize_camera_measurements(
    {
      "schemaVersion": "aura-face-analysis-measurements-v1",
      "face3d": {
        "schemaVersion": "aura.face3d-profile.v3",
        "warnings": [],
        "metrics": {
          "noseTipProjection": {
            "value": 0.14,
            "unit": "normalized",
            "confidence": 0.93,
          },
        },
      },
    },
  )

  metric = result["face3d.noseTipProjection"]
  assert metric.value is None
  assert metric.status is MeasurementStatus.BLOCKED
  assert metric.reason == "face3d_schema_unsupported"


def test_camera_metric_cannot_be_overwritten_by_ai() -> None:
  camera = normalize_camera_measurements(
    {
      "schemaVersion": "aura-face-analysis-measurements-v1",
      "face3d": {
        "warnings": [],
        "metrics": {
          "noseTipProjection": {
            "value": 0.14,
            "unit": "normalized",
            "confidence": 0.93,
          },
        },
      },
    },
  )
  coverage = build_measurement_coverage(camera)
  result = merge_measurements(
    camera,
    {"face3d.noseTipProjection": ai_metric("high")},
    coverage,
  )

  assert result.profile["face3d.noseTipProjection"].value == 0.14
  assert result.profile["face3d.noseTipProjection"].source.value == "depth"
  assert result.rejected_authoritative_keys == ["face3d.noseTipProjection"]


def test_coverage_keeps_blocked_camera_owned_and_s2_to_s7_out_of_scope() -> None:
  blocked = MetricEnvelope.model_validate(
    {
      "value": None,
      "confidence": 0.2,
      "source": "pixel",
      "status": "blocked",
      "shots": ["S1"],
      "sensitivity": 1,
      "reason": "pose_gate_failed",
      "warnings": [],
    },
  )
  coverage = build_measurement_coverage({"geometry2d.eyeOpennessLeft": blocked})

  assert "geometry2d.eyeOpennessLeft" in coverage.authoritative_keys
  assert coverage.blocked_keys[0].reason == "pose_gate_failed"
  assert "geometry2d.eyeOpennessLeft" not in coverage.missing_observable_keys
  assert "profile.fullSideProfile" in coverage.out_of_scope_keys
  assert "profile.fullSideProfile" not in coverage.missing_observable_keys


def test_merge_blocks_low_confidence_and_rejects_unknown_ai_key() -> None:
  coverage = build_measurement_coverage({})
  result = merge_measurements(
    {},
    {
      "skin.texture": ai_metric("smooth", confidence=0.2),
      "unknown.metric": ai_metric("value"),
    },
    coverage,
  )

  assert result.profile["skin.texture"].status is MeasurementStatus.BLOCKED
  assert result.profile["skin.texture"].value is None
  assert result.rejected_unknown_keys == ["unknown.metric"]


def test_unmeasured_and_sensitive_metrics_are_filtered_safely() -> None:
  coverage = build_measurement_coverage({})
  profile = with_explicit_unmeasured({}, coverage.out_of_scope_keys)
  profile["public"] = MetricEnvelope.model_validate(ai_metric("shown", sensitivity=1))
  profile["optIn"] = MetricEnvelope.model_validate(ai_metric("detail", sensitivity=2))
  profile["internal"] = MetricEnvelope.model_validate(ai_metric("hidden", sensitivity=3))

  assert profile["profile.fullSideProfile"].status is MeasurementStatus.UNMEASURED
  assert set(filter_metrics_for_audience(profile, include_sensitive=False)) == {"public"}
  assert set(filter_metrics_for_audience(profile, include_sensitive=True)) == {"public", "optIn"}
