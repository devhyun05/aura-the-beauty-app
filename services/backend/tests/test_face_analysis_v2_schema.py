import pytest
from pydantic import ValidationError

from app.schemas.face_analysis_v2 import (
  FaceAnalysisStageRetryRequest,
  Insight,
  MetricEnvelope,
  PersonalColorPerception,
)


def test_ai_metric_must_be_estimated_from_s1() -> None:
  metric = MetricEnvelope.model_validate(
    {
      "value": "visible",
      "confidence": 0.82,
      "source": "ai",
      "status": "estimated",
      "shots": ["S1"],
      "sensitivity": 1,
      "warnings": [],
    },
  )

  assert metric.source.value == "ai"
  assert metric.status.value == "estimated"


@pytest.mark.parametrize(
  "patch",
  [
    {"status": "measured"},
    {"shots": ["FACE3D"]},
  ],
)
def test_ai_metric_rejects_invalid_provenance(patch: dict) -> None:
  payload = {
    "value": "visible",
    "confidence": 0.82,
    "source": "ai",
    "status": "estimated",
    "shots": ["S1"],
    "sensitivity": 1,
    "warnings": [],
    **patch,
  }

  with pytest.raises(ValidationError):
    MetricEnvelope.model_validate(payload)


def test_unavailable_metric_cannot_contain_value() -> None:
  with pytest.raises(ValidationError):
    MetricEnvelope.model_validate(
      {
        "value": "hidden",
        "confidence": 0,
        "source": "ai",
        "status": "unmeasured",
        "shots": [],
        "sensitivity": 1,
        "warnings": [],
      },
    )


def test_nested_contracts_reject_invalid_confidence_and_confirmed_color() -> None:
  with pytest.raises(ValidationError):
    Insight.model_validate(
      {
        "label": "soft",
        "description": "soft contour",
        "confidence": 1.1,
        "rationaleMetricKeys": ["contour.outlineStrength"],
        "sensitivity": 1,
      },
    )

  with pytest.raises(ValidationError):
    PersonalColorPerception.model_validate(
      {
        "status": "confirmed",
        "season": "spring",
        "subtype": None,
        "borderTone": None,
        "rationaleMetricKeys": ["personalColor.tone.top"],
      },
    )


def test_retry_accepts_only_ai_stage_aliases() -> None:
  retry = FaceAnalysisStageRetryRequest.model_validate({"stage": "aiConsulting"})

  assert retry.stage.value == "ai_consulting"

  with pytest.raises(ValidationError):
    FaceAnalysisStageRetryRequest.model_validate({"stage": "l1"})
