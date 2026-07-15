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
