"""측정 데이터 3-반영 규칙의 백엔드 계약.

- requestPayload.measurements/measuredPersonalColor 가 신뢰화 필터를 통과해 저장된다.
- 프롬프트가 두 필드를 메타데이터로 주입하고 해설 문장을 갖는다(measurements 제외 없음).
- worst-case 직렬화 크기가 상한 안에 있다(프롬프트 토큰 예산 고정).
- 목록 SELECT 만 measurements 를 제외하고 상세 SELECT 는 전량 유지한다.
"""

import json

from app.api.analysis import (
  ANALYSIS_MEDIA_LIST_SELECT,
  ANALYSIS_MEDIA_SELECT,
  build_analysis_detail_payload,
  build_initial_analysis_detail_payload,
)
from app.core.settings import Settings
from app.schemas.analysis import AnalysisJobCreate
from app.services.openai_analysis import OpenAIAnalysisService
from app.services.owned_media import trusted_media_request_payload


PERSONAL_COLOR_TYPES = [
  "spring_light", "spring_bright", "spring_true",
  "summer_light", "summer_true", "summer_muted",
  "autumn_muted", "autumn_true", "autumn_deep",
  "winter_bright", "winter_true", "winter_deep",
]

GEOMETRY_METRIC_KEYS = [
  "browSlopeLeftDeg", "browSlopeRightDeg", "canthalTiltLeftDeg", "canthalTiltRightDeg",
  "eyeBrowGapLeft", "eyeBrowGapRight", "eyeOpennessLeft", "eyeOpennessRight",
  "eyeWidthRatioLeft", "eyeWidthRatioRight", "interCanthalRatio", "jawWidthRatio",
  "lipThicknessRatio", "lowerJawWidthRatio", "mouthCornerAsymmetry", "mouthWidthRatio",
]

FACE3D_METRIC_KEYS = [
  "noseTipProjection", "chinProjection", "upperLipToELine", "lowerLipToELine",
  "centralProjectionScore", "noseLength", "nasalBridgeStraightness",
  "nasalAxisDeviation", "alarWidth", "malarProjectionLeft", "malarProjectionRight",
]


def build_worst_case_request_payload() -> dict:
  """RN 계약(faceAnalysisMeasurements)의 최대 형태 근사 — 모든 축·경고 포함."""
  tone_records = {key: 0.0833 for key in PERSONAL_COLOR_TYPES}
  keypoint = {"confidence": 0.9, "method": "mediapipe", "provider": "mediapipe", "x": 540.5, "y": 960.5}
  region = {
    "areaRatio": 0.123, "colorSpace": "srgb",
    "lab": {"L": 62.15, "a": 12.42, "b": 16.83}, "lch": {"C": 20.92, "h": 53.61},
    "overExposedRatio": 0.01, "qEff": 0.82, "qNative": 0.85,
    "region": "skin", "underExposedRatio": 0.02,
    "warnings": ["skin_matte_unavailable"],
  }
  measured_personal_color = {
    "axes": {axis: {"confidence": 0.8, "value": 0.32} for axis in
             ["temperature", "value", "chroma", "clarity", "contrast"]},
    "calibrationApplied": False,
    "correction": {
      "applied": True, "capped": False, "confidence": 0.6,
      "gains": {"r": 0.97, "g": 1.0, "b": 1.04},
      "reasons": ["wb_low_confidence"],
      "scleraSummary": {"eyesUsed": 2, "leftRightAgreement": 0.02,
                        "measuredLab": {"L": 78.2, "a": 3.1, "b": 5.4}, "sampleCount": 140},
      "source": "sclera", "strength": 0.05, "wbRatio": {"bg": 1.02, "rg": 0.98},
    },
    "measurementConfidence": 0.72,
    "regions": [dict(region, region=name) for name in ["skin", "hair", "lip"]],
    "relations": {"skinHairColorDelta": 21.3, "skinHairLightnessDelta": 18.2,
                  "skinLipColorDelta": 12.8, "skinLipLightnessDelta": 9.4},
    "status": "definitive",
    "tone": {"distances": tone_records, "gap": 0.13, "isMixed": False,
             "probabilities": tone_records, "season": "autumn",
             "secondary": "autumn_true", "top": "autumn_muted", "typeScore": 0.41},
    "warnings": ["skin_matte_unavailable"],
  }
  reported = dict(measured_personal_color)
  reported.pop("correction")
  measurements = {
    "captureId": "11111111-1111-1111-1111-111111111111",
    "schemaVersion": "aura-face-analysis-measurements-v1",
    "faceVerticalThirds": {
      "captureId": "11111111-1111-1111-1111-111111111111",
      "createdAt": "2026-07-13T00:00:00.000Z",
      "faceLength": {"heightPx": 975.2, "ratio": 1.383, "widthPx": 705.1},
      "faceLengthJudgment": {"band": {"hi": 1.4123, "lo": 1.3761}, "verdict": "borderline_wide"},
      "judgmentVersion": "face-length-judgment/v2-provisional-20260717",
      "hairlineAnalysis": {
        "analysisEligible": True, "confidence": 0.82,
        "outcome": "detected_high_confidence", "provider": "apple_semantic_matte",
      },
      "interpretation": {"dominantPart": "middle", "summary": "중안부가 비교적 긴 편이에요.",
                         "title": "중안부 우세"},
      "keypoints": {
        "G": keypoint,
        "H": {**keypoint, "confidence": 0.82, "provider": "apple_semantic_matte"},
        "Me": keypoint,
        "Sn": keypoint,
      },
      "measurementMode": "full_vertical_thirds",
      "postCorrection": {"applied": True, "center": {"x": 540, "y": 960},
                         "method": "mediapipe_pose_roll", "rollCorrectionDeg": 0.6},
      "quality": {"pitch": -2.8, "roll": 0.6, "usable": True,
                  "warnings": ["hairline_low_confidence"], "yaw": 1.2},
      "schemaVersion": "aura-face-vertical-thirds-v1",
      "sessionId": "s", "sourceImage": {"height": 1920, "width": 1080},
      "status": "partial_success", "statusReason": None,
      "verticalThirds": {"confidence": 0.82,
                         "displayRatio": {"lower": 1.08, "middle": 1.0, "upper": 0.97},
                         "lowerNormalized": 0.354, "lowerPx": 345.2,
                         "middleNormalized": 0.328, "middlePx": 320.4, "totalPx": 975.2,
                         "upperNormalized": 0.318, "upperPx": 310.1,
                         "warnings": ["upper_ratio_estimated"]},
    },
    "face3d": {
      "gateVersion": "face3d-gate-v1",
      "metrics": {key: {"confidence": 0.97, "mad": 0.0012, "unit": "normalized",
                        "validFrameCount": 30, "value": 0.2134}
                  for key in FACE3D_METRIC_KEYS},
      "schemaVersion": "aura.face3d-profile.v1", "source": "arkit_face_mesh",
      "targetFrameCount": 30, "topologyFingerprint": "v:1220|i:6912|u:abcd1234",
      "validFrameCount": 30, "warnings": ["target_frame_count_not_reached"],
    },
    "faceGeometry2d": {
      "captureId": "11111111-1111-1111-1111-111111111111",
      "createdAt": "2026-07-13T00:00:00.000Z",
      "metrics": {key: {"unit": "deg" if key.endswith("Deg") else "ratio",
                        "value": 0.512, "warnings": ["roll_out_of_range"]}
                  for key in GEOMETRY_METRIC_KEYS},
      "pose": {"pitchDeg": -2.8, "rollDeg": 0.6, "yawDeg": 1.2},
      "rollCorrection": {"applied": True, "rollCorrectionDeg": -0.6},
      "schemaVersion": "aura-face-geometry-v1", "sessionId": "s",
      "sourceImage": {"height": 1920, "width": 1080},
      "status": "partial_success", "statusReason": "some_metrics_unavailable",
    },
    "personalColor": {
      "correctionReport": {
        "applied": True, "capped": False, "confidence": 0.6,
        "gains": {"r": 0.97, "g": 1.0, "b": 1.04}, "reasons": [],
        "sclera": {"available": True, "eyesUsed": 2, "leftRightAgreement": 0.02,
                   "measuredLab": {"L": 78.2, "a": 3.1, "b": 5.4},
                   "measuredRgb": {"r": 201, "g": 196, "b": 188},
                   "rawGains": {"r": 0.96, "g": 1.0, "b": 1.05},
                   "reasons": [], "sampleCount": 140},
        "source": "sclera", "strength": 0.05,
        "wb": {"available": True, "bg": 1.02, "rawGains": None,
               "reasons": ["wb_low_confidence"], "rg": 0.98},
      },
      "correctionStatus": {"applied": True, "reasons": ["wb_low_confidence"]},
      "reported": reported,
    },
  }

  return {
    "bucket": "client-bucket",
    "contentType": "image/jpeg",
    "faceVerticalThirds": {
      "confidence": 0.82,
      "displayRatio": {"lower": 1.08, "middle": 1.0, "upper": 0.97},
      "dominantPart": "middle",
      "faceLength": {"heightPx": 975.2, "ratio": 1.383, "widthPx": 705.1},
      "faceLengthJudgment": {"band": {"hi": 1.4123, "lo": 1.3761}, "verdict": "borderline_wide"},
      "judgmentVersion": "face-length-judgment/v2-provisional-20260717",
      "hairline": {
        "analysisEligible": True,
        "confidence": 0.82,
        "provider": "apple_semantic_matte",
      },
      "measurementMode": "full_vertical_thirds",
      "ratioDetail": {
        "lowerNormalized": 0.354, "lowerPx": 345.2,
        "middleNormalized": 0.328, "middlePx": 320.4, "totalPx": 975.2,
        "upperNormalized": 0.318, "upperPx": 310.1, "warnings": [],
      },
      "status": "full_success",
      "summary": "중안부가 비교적 긴 편이에요.",
    },
    "faceGeometry2d": {"metrics": measurements["faceGeometry2d"]["metrics"],
                       "pose": measurements["faceGeometry2d"]["pose"],
                       "rollCorrection": {"applied": True, "rollCorrectionDeg": -0.6,
                                          "skippedReason": None},
                       "status": "partial_success", "statusReason": None},
    "face3d": measurements["face3d"],
    "measuredPersonalColor": measured_personal_color,
    "measurements": measurements,
    "objectKey": "client-key",
    "source": "camera",
    "task": "face_makeup_recommendation_report_v1",
  }


def test_trusted_media_payload_keeps_measurement_fields() -> None:
  payload = build_worst_case_request_payload()

  trusted = trusted_media_request_payload(Settings(), payload, None)

  # 미디어 위치 키만 제거되고 측정 필드는 전부 통과해 detail_payload 에 저장된다.
  assert "bucket" not in trusted
  assert "objectKey" not in trusted
  assert trusted["measurements"]["captureId"] == "11111111-1111-1111-1111-111111111111"
  assert trusted["measuredPersonalColor"]["tone"]["top"] == "autumn_muted"
  assert trusted["measurements"]["personalColor"]["correctionReport"]["sclera"]["sampleCount"] == 140
  assert list(trusted["measurements"]["face3d"]["metrics"].keys()) == FACE3D_METRIC_KEYS
  assert list(trusted["face3d"]["metrics"].keys()) == FACE3D_METRIC_KEYS


def test_prompt_injects_and_explains_measurements() -> None:
  payload = build_worst_case_request_payload()
  payload["imageUrl"] = "https://cdn.example.com/x.jpg"

  service = OpenAIAnalysisService(Settings())
  prompt = service._build_analysis_prompt(payload)

  # 해설 문장(모델 지시)과 메타데이터 주입(실제 값) 둘 다 있어야 한다.
  assert "measuredPersonalColor(" in prompt
  assert "measurements" in prompt
  assert '"measuredPersonalColor"' in prompt
  assert '"measurements"' in prompt
  assert '"autumn_muted"' in prompt
  # 세로비율은 검증된 요약만 들어가며 raw measurements 축은 제거된다.
  assert '"faceVerticalThirds"' in prompt
  metadata = json.loads(prompt.split("요청 메타데이터: ", 1)[1])
  assert "faceVerticalThirds" not in metadata["measurements"]
  assert metadata["faceVerticalThirds"]["measurementMode"] == "full_vertical_thirds"
  assert metadata["faceVerticalThirds"]["hairline"]["provider"] == "apple_semantic_matte"
  for metric_key in FACE3D_METRIC_KEYS:
    assert metric_key in prompt
  assert "작을수록 기준선에 가까움" in prompt
  assert "피사체 기준 음수=Left, 양수=Right" in prompt
  assert "alare-alare 콧볼 폭" in prompt
  assert "좌우 앞광대의 전방 돌출" in prompt
  assert "절대 mm·임상 진단·모집단 백분위가 아니고" in prompt
  # 이미지 위치 필드는 여전히 제외된다.
  assert "https://cdn.example.com/x.jpg" not in prompt


def test_prompt_omits_uncalibrated_v2_face3d_but_storage_payload_keeps_it() -> None:
  payload = build_worst_case_request_payload()
  v2_face3d = {
    **payload["face3d"],
    "aggregation": "median_mad",
    "captureWindowMs": 280,
    "collectionPolicyId": "unified-micro-burst-5of8-v1",
    "completionRatio": 1.0,
    "confidenceCalibrationStatus": "uncalibrated",
    "gateVersion": "face3d-gate-v2",
    "sampleMode": "micro_burst",
    "schemaVersion": "aura.face3d-profile.v2",
    "targetFrameCount": 8,
    "validFrameCount": 8,
  }
  payload["face3d"] = v2_face3d
  payload["measurements"] = {**payload["measurements"], "face3d": v2_face3d}

  trusted = trusted_media_request_payload(Settings(), payload, None)
  assert trusted["measurements"]["face3d"]["confidenceCalibrationStatus"] == "uncalibrated"

  service = OpenAIAnalysisService(Settings())
  prompt = service._build_analysis_prompt(payload)
  metadata = json.loads(prompt.split("요청 메타데이터: ", 1)[1])
  assert "face3d" not in metadata
  assert "face3d" not in metadata["measurements"]


def test_prompt_strips_ineligible_h_dependent_fields_but_keeps_middle_lower() -> None:
  payload = build_worst_case_request_payload()
  payload["faceVerticalThirds"] = {
    "confidence": 0.99,
    "displayRatio": {"lower": 1.08, "middle": 1.0, "upper": 0.97},
    "dominantPart": "upper",
    "faceLength": {"heightPx": 975.2, "ratio": 1.383, "widthPx": 705.1},
    "hairline": {"confidence": 0.99, "provider": "mediapipe_forehead_approx"},
    "measurementMode": "middle_lower_only",
    "middleLowerRatio": {
      "lower": 1.08, "lowerPx": 345.2, "middle": 1.0, "middlePx": 320.4,
    },
    "ratioDetail": {"upperPx": 310.1, "upperNormalized": 0.318},
    "status": "partial_success",
    "summary": "상안부가 길어요.",
  }

  prompt = OpenAIAnalysisService(Settings())._build_analysis_prompt(payload)
  metadata = json.loads(prompt.split("요청 메타데이터: ", 1)[1])
  thirds = metadata["faceVerticalThirds"]
  serialized = json.dumps(thirds)

  assert thirds["measurementMode"] == "middle_lower_only"
  assert thirds["middleLowerRatio"]["lower"] == 1.08
  for forbidden in (
    "mediapipe_forehead_approx",
    "hairline",
    "upper",
    "dominantPart",
    "faceLength",
    "ratioDetail",
  ):
    assert forbidden not in serialized
  assert "faceVerticalThirds" not in metadata["measurements"]


def test_prompt_keeps_legacy_full_success_with_actual_h() -> None:
  payload = build_worst_case_request_payload()
  legacy = dict(payload["faceVerticalThirds"])
  legacy.pop("measurementMode")
  legacy["hairline"] = {
    "confidence": 0.91,
    "provider": "apple_semantic_matte",
  }
  legacy["status"] = "full_success"
  payload["faceVerticalThirds"] = legacy

  prompt = OpenAIAnalysisService(Settings())._build_analysis_prompt(payload)
  metadata = json.loads(prompt.split("요청 메타데이터: ", 1)[1])

  assert metadata["faceVerticalThirds"]["measurementMode"] == "full_vertical_thirds"
  assert metadata["faceVerticalThirds"]["displayRatio"]["upper"] == 0.97
  assert metadata["faceVerticalThirds"]["hairline"]["provider"] == "apple_semantic_matte"


def test_prompt_rejects_unknown_face3d_schema() -> None:
  payload = build_worst_case_request_payload()
  unknown = {**payload["face3d"], "schemaVersion": "aura.face3d-profile.v3"}
  payload["face3d"] = unknown
  payload["measurements"] = {**payload["measurements"], "face3d": unknown}

  prompt = OpenAIAnalysisService(Settings())._build_analysis_prompt(payload)
  metadata = json.loads(prompt.split("요청 메타데이터: ", 1)[1])

  assert "face3d" not in metadata
  assert "face3d" not in metadata["measurements"]


def test_prompt_metadata_size_is_bounded() -> None:
  # worst-case 측정 payload 직렬화 상한 — 프롬프트 토큰 예산 고정. 계약이 커져
  # 이 값을 넘으면 상한을 올리기 전에 payload 설계를 재검토할 것.
  payload = build_worst_case_request_payload()
  serialized = json.dumps(payload, ensure_ascii=False)

  assert len(serialized) < 15_000, f"measurement payload too large: {len(serialized)} chars"


def test_list_select_strips_measurements_but_detail_keeps() -> None:
  assert "#- '{request,measurements}'" in ANALYSIS_MEDIA_LIST_SELECT
  assert "#- '{result,faceAnalysisV2,faceProfile}'" in ANALYSIS_MEDIA_LIST_SELECT
  assert "#- '{result,faceAnalysisV2,pipeline}'" not in ANALYSIS_MEDIA_LIST_SELECT
  assert "#- '{request,measurements}'" not in ANALYSIS_MEDIA_SELECT
  # 축약본이 dict(row) 변환에서 원본을 덮도록 같은 별칭으로 뒤에 온다.
  assert ANALYSIS_MEDIA_LIST_SELECT.rstrip().endswith("as detail_payload")


def test_detail_jsonb_round_trip_preserves_all_face3d_metrics() -> None:
  request_payload = build_worst_case_request_payload()
  job = AnalysisJobCreate(requestPayload=request_payload)

  # 실제 INSERT/UPDATE도 이 함수를 json.dumps 한 값을 jsonb로 저장한다.
  encoded = json.dumps(build_analysis_detail_payload(job, {"shortSummary": "ok"}))
  restored = json.loads(encoded)["request"]

  assert list(restored["face3d"]["metrics"].keys()) == FACE3D_METRIC_KEYS
  assert list(restored["measurements"]["face3d"]["metrics"].keys()) == FACE3D_METRIC_KEYS


def test_initial_v2_payload_makes_camera_report_immediately_renderable() -> None:
  request = AnalysisJobCreate(
    requestPayload=build_worst_case_request_payload(),
  )

  detail = build_initial_analysis_detail_payload(
    request,
    face_analysis_v2_enabled=True,
  )

  result = detail["result"]
  assert result["faceAnalysisV2"]["schemaVersion"] == "aura-face-analysis-v2"
  assert result["faceAnalysisV2"]["pipeline"]["overall"] == "processing"
  assert result["faceShape"]
