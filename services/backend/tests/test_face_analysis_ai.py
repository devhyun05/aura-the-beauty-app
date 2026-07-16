import json
from typing import Any

import pytest

from app.core.errors import AppError
from app.schemas.face_analysis_v2 import MeasurementCoveragePlan, MetricEnvelope
from app.services.face_analysis_ai import FaceAnalysisAI


def ai_metric(value: str = "smooth") -> dict[str, Any]:
  return {
    "value": value,
    "unit": "label",
    "confidence": 0.82,
    "source": "ai",
    "status": "estimated",
    "shots": ["S1"],
    "sensitivity": 1,
    "warnings": [],
  }


class FakeStructuredClient:
  def __init__(self, responses: list[dict[str, Any]]) -> None:
    self.responses = list(responses)
    self.calls: list[dict[str, Any]] = []

  async def analyze_structured_json(self, **kwargs) -> dict[str, Any]:
    self.calls.append(kwargs)
    return self.responses.pop(0)


class CapturingFaceAnalysisAI(FaceAnalysisAI):
  def __init__(self) -> None:
    super().__init__(FakeStructuredClient([]))
    self.invocation: dict[str, Any] | None = None

  async def _invoke_validated(self, **kwargs):
    self.invocation = kwargs
    return kwargs


COVERAGE = MeasurementCoveragePlan(
  authoritative_keys=["face3d.noseTipProjection"],
  missing_observable_keys=["skin.texture"],
  out_of_scope_keys=["profile.fullSideProfile"],
  blocked_keys=[],
)
PROFILE = {
  "face3d.noseTipProjection": MetricEnvelope.model_validate(
    {
      "value": 0.14,
      "unit": "ratio",
      "confidence": 0.93,
      "source": "depth",
      "status": "measured",
      "shots": ["FACE3D"],
      "sensitivity": 0,
      "warnings": [],
    },
  ),
}


def internal_metric(value: float = 2.8) -> MetricEnvelope:
  return MetricEnvelope.model_validate(
    {
      "value": value,
      "unit": "mm",
      "confidence": 0.91,
      "source": "depth",
      "status": "measured",
      "shots": ["FACE3D"],
      "sensitivity": 3,
      "warnings": [],
    },
  )


@pytest.mark.asyncio
async def test_measurement_rejects_authoritative_and_unknown_keys() -> None:
  client = FakeStructuredClient(
    [
      {
        "metrics": {
          "face3d.noseTipProjection": ai_metric("high"),
          "unknown.metric": ai_metric(),
          "skin.texture": ai_metric(),
        },
        "photoQuality": {"usable": True, "warnings": []},
      },
    ],
  )

  result = await FaceAnalysisAI(client).measure(
    source_image_bytes=b"jpeg",
    coverage=COVERAGE,
    camera_profile=PROFILE,
  )

  assert list(result.metrics) == ["skin.texture"]
  assert result.rejected_authoritative_keys == ["face3d.noseTipProjection"]
  assert result.rejected_unknown_keys == ["unknown.metric"]
  assert client.calls[0]["source_image_bytes"] == b"jpeg"


@pytest.mark.asyncio
async def test_measurement_prompt_omits_internal_only_camera_evidence() -> None:
  client = FakeStructuredClient(
    [{"metrics": {}, "photoQuality": {"usable": True, "warnings": []}}],
  )
  profile = {**PROFILE, "face3d.noseTipProjection.mm": internal_metric()}

  await FaceAnalysisAI(client).measure(
    source_image_bytes=b"jpeg",
    coverage=MeasurementCoveragePlan(
      authoritative_keys=sorted(profile),
      missing_observable_keys=[],
      out_of_scope_keys=[],
      blocked_keys=[],
    ),
    camera_profile=profile,
  )

  payload = json.loads(client.calls[0]["user_prompt"].split("\n")[-1])
  assert "face3d.noseTipProjection" in payload["cameraEvidence"]
  assert "face3d.noseTipProjection.mm" not in payload["cameraEvidence"]
  assert "face3d.noseTipProjection.mm" not in payload["authoritativeKeys"]


@pytest.mark.asyncio
async def test_perception_prompt_omits_internal_metrics_and_insights() -> None:
  ai = CapturingFaceAnalysisAI()
  profile = {**PROFILE, "face3d.noseTipProjection.mm": internal_metric()}

  await ai.perceive(
    source_image_bytes=b"jpeg",
    profile=profile,
    derived={
      "faceShape": {
        "label": "oval",
        "description": "public",
        "confidence": 0.8,
        "rationaleMetricKeys": ["face3d.noseTipProjection"],
        "sensitivity": 1,
      },
      "asymmetry": {
        "label": "internal",
        "description": "internal",
        "confidence": 0.8,
        "rationaleMetricKeys": ["face3d.noseTipProjection.mm"],
        "sensitivity": 3,
      },
    },
  )

  assert ai.invocation is not None
  payload = json.loads(ai.invocation["user_prompt"])
  assert "face3d.noseTipProjection" in payload["faceProfile"]
  assert "face3d.noseTipProjection.mm" not in payload["faceProfile"]
  assert "faceShape" in payload["derived"]
  assert "asymmetry" not in payload["derived"]


@pytest.mark.asyncio
async def test_consulting_never_sends_image() -> None:
  response = {
    "makeup": {
      "base": "base", "brow": "brow", "eyeshadow": "shadow", "eyeliner": "liner",
      "blush": "blush", "contour": "contour", "highlight": "highlight", "lip": "lip",
    },
    "colorAndProduct": {"summary": "color", "items": ["item"], "rationaleMetricKeys": []},
    "hair": {"summary": "hair", "items": ["item"], "rationaleMetricKeys": []},
    "fashion": {"summary": "fashion", "items": ["item"], "rationaleMetricKeys": []},
    "photography": {"summary": "photo", "items": ["item"], "rationaleMetricKeys": []},
    "recommendedLook": {
      "title": "데일리", "subtitle": "차분한 룩", "description": "균형을 살린 룩",
      "tags": ["차분", "데일리"],
    },
    "overallMood": "차분한 균형",
    "summary": "맞춤 요약",
    "shortSummary": "짧은 요약",
    "tags": ["차분"],
  }
  client = FakeStructuredClient([response])

  await FaceAnalysisAI(client).consult(profile={}, derived={}, perception={})

  assert client.calls[0]["source_image_bytes"] is None


@pytest.mark.asyncio
async def test_invalid_stage_output_gets_one_repair_attempt() -> None:
  client = FakeStructuredClient([{"metrics": []}, {"metrics": []}])

  with pytest.raises(AppError) as error:
    await FaceAnalysisAI(client).measure(
      source_image_bytes=b"jpeg",
      coverage=COVERAGE,
      camera_profile=PROFILE,
    )

  assert error.value.code == "FACE_ANALYSIS_STAGE_OUTPUT_INVALID"
  assert len(client.calls) == 2
  assert "validation" in client.calls[1]["user_prompt"].lower()
