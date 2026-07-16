from app.schemas.face_analysis_v2 import MetricEnvelope
from app.services.face_analysis_rules import derive_face_analysis


def metric(value: float | str, *, source: str = "pixel") -> MetricEnvelope:
  return MetricEnvelope.model_validate(
    {
      "value": value,
      "confidence": 0.9,
      "source": source,
      "status": "measured" if source != "ai" else "estimated",
      "shots": ["FACE3D" if source == "depth" else "S1"],
      "sensitivity": 1,
      "warnings": [],
    },
  )


def test_face_shape_uses_camera_width_and_length_ratios() -> None:
  profile = {
    "verticalThirds.faceRatio": metric(1.42),
    "geometry2d.jawWidthRatio": metric(0.72),
    "geometry2d.lowerJawWidthRatio": metric(0.78),
  }

  result = derive_face_analysis(profile)

  assert result.rules_version == "s1-l1-v1"
  assert result.face_shape.label == "긴 타원형"
  assert set(result.face_shape.rationale_metric_keys) == set(profile)


def test_vertical_balance_uses_measured_thirds() -> None:
  result = derive_face_analysis(
    {
      "verticalThirds.upperNormalized": metric(0.31),
      "verticalThirds.middleNormalized": metric(0.34),
      "verticalThirds.lowerNormalized": metric(0.35),
    },
  )

  assert result.vertical_balance.label == "하안부 우세"
  assert result.vertical_balance.confidence > 0


def test_face_shape_follows_measurement_time_verdict_over_legacy_threshold() -> None:
  # 판정 단일 정본(2026-07-17): aspect 1.42는 레거시 임계(>=1.38)로는
  # '긴 타원형'이지만, 측정 시점 모바일 verdict가 average면 그것을 따른다.
  profile = {
    "verticalThirds.faceRatio": metric(1.42),
    "verticalThirds.faceLengthVerdict": metric("average"),
    "geometry2d.jawWidthRatio": metric(0.72),
    "geometry2d.lowerJawWidthRatio": metric(0.78),
  }

  result = derive_face_analysis(profile)

  assert result.face_shape.label == "타원형"
  assert "verticalThirds.faceLengthVerdict" in result.face_shape.rationale_metric_keys


def test_face_shape_borderline_verdict_does_not_assert_long() -> None:
  # 유보(borderline_long)는 단정하지 않는다 — long 분기로 가지 않음.
  profile = {
    "verticalThirds.faceRatio": metric(1.50),
    "verticalThirds.faceLengthVerdict": metric("borderline_long"),
    "geometry2d.jawWidthRatio": metric(0.72),
  }

  result = derive_face_analysis(profile)

  assert result.face_shape.label != "긴 타원형"


def test_face_shape_indeterminate_verdict_withholds_instead_of_legacy_threshold() -> None:
  # 2차 리뷰 B-1 종단 반례: ratio 1.50 + 판정 보류 → 레거시 임계(>=1.38)로
  # '긴 타원형'을 복원하지 않고 서버도 함께 보류한다.
  profile = {
    "verticalThirds.faceRatio": metric(1.50),
    "verticalThirds.faceLengthVerdict": metric("indeterminate"),
    "geometry2d.jawWidthRatio": metric(0.72),
  }

  result = derive_face_analysis(profile)

  assert result.face_shape.label == "측정 보류"


def test_vertical_balance_follows_measurement_time_dominant_part() -> None:
  # 정규화 0.31/0.34/0.35는 레거시 규칙(0.025)으로는 '하안부 우세'지만,
  # 측정 시점 모바일 판정(자기내부 0.08 임계)이 balanced면 그것을 따른다.
  result = derive_face_analysis(
    {
      "verticalThirds.upperNormalized": metric(0.31),
      "verticalThirds.middleNormalized": metric(0.34),
      "verticalThirds.lowerNormalized": metric(0.35),
      "verticalThirds.dominantPart": metric("balanced"),
    },
  )

  assert result.vertical_balance.label == "세로 비율 균형형"
  assert "측정 시점 판정" in result.vertical_balance.description


def test_l1_is_deterministic_and_internal_asymmetry_is_hidden() -> None:
  profile = {"face3d.centralProjectionScore": metric(0.61, source="depth")}

  first = derive_face_analysis(profile)
  second = derive_face_analysis(profile)

  assert first.model_dump() == second.model_dump()
  assert first.asymmetry.sensitivity == 3
  assert first.cheekbone_and_eline.label == "중앙부 입체감이 또렷한 편"


def test_missing_evidence_is_not_invented() -> None:
  result = derive_face_analysis({})

  assert result.face_shape.label == "측정 보류"
  assert result.face_shape.confidence == 0
  assert result.color_axes.label == "측정 보류"

# ── 종단 체인(3차 리뷰): normalizer 발행 → 규칙 소비까지 연결 검증 ──────────

from app.services.face_analysis_measurements import normalize_camera_measurements


def _thirds_payload(*, verdict: str | None, eligible: bool = True, usable: bool = True):
  thirds = {
    "hairlineAnalysis": {
      "analysisEligible": eligible,
      "confidence": 0.87,
      "outcome": "detected_high_confidence" if eligible else "omitted",
      "provider": "apple_semantic_matte",
    },
    "keypoints": {"H": {"confidence": 0.87, "provider": "apple_semantic_matte"}} if eligible else {},
    "measurementMode": "full_vertical_thirds" if eligible else "middle_lower_only",
    "status": "full_success" if usable else "blocked",
    "quality": {"usable": usable, "warnings": []},
    "verticalThirds": {
      "confidence": 0.9,
      "upperNormalized": 0.31,
      "middleNormalized": 0.34,
      "lowerNormalized": 0.35,
      "warnings": [],
    },
    "faceLength": {"heightPx": 900, "widthPx": 600, "ratio": 1.50},
  }
  if verdict is not None:
    thirds["faceLengthJudgment"] = {"band": {"hi": 1.53, "lo": 1.49}, "verdict": verdict}
  return {
    "schemaVersion": "aura-face-analysis-measurements-v1",
    "faceVerticalThirds": thirds,
  }


def test_chain_indeterminate_full_session_withholds_face_shape() -> None:
  profile = normalize_camera_measurements(_thirds_payload(verdict="indeterminate"))
  result = derive_face_analysis(profile)
  # ratio 1.50은 레거시 임계(>=1.38)로 '긴 타원형'이지만 보류가 이겨야 한다.
  assert result.face_shape.label == "측정 보류"


def test_chain_missing_hairline_stays_withheld() -> None:
  profile = normalize_camera_measurements(_thirds_payload(verdict="long", eligible=False))
  result = derive_face_analysis(profile)
  # H 부재: verdict envelope는 unusable(value=None) → 규칙은 근거 부족 보류.
  assert result.face_shape.label == "측정 보류"


def test_chain_unusable_quality_stays_withheld() -> None:
  profile = normalize_camera_measurements(_thirds_payload(verdict="long", usable=False))
  result = derive_face_analysis(profile)
  assert result.face_shape.label == "측정 보류"

