import asyncio
import json
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.core.errors import AppError
from app.schemas.face_analysis_v2 import (
  ConsultingResult,
  MeasurementStageOutput,
  PerceptionResult,
  StageName,
)
from app.services.face_analysis_pipeline import (
  FaceAnalysisPipeline,
  initialize_face_analysis_v2,
  persist_face_analysis_v2,
  project_legacy_analysis_result,
)
from app.services.face_analysis_ai import FaceAnalysisAI
from app.services.face_analysis_stage_runs import compute_stage_input_hash


REPORT_ID = UUID("11111111-1111-1111-1111-111111111111")
REQUEST = {
  "measurements": {
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
}


def insight(label: str = "균형") -> dict:
  return {
    "label": label,
    "description": "측정 근거 설명",
    "confidence": 0.8,
    "rationaleMetricKeys": ["face3d.noseTipProjection"],
    "sensitivity": 1,
  }


def perception() -> PerceptionResult:
  item = insight()
  return PerceptionResult.model_validate(
    {
      "skin": {
        "texture": item, "pores": item, "sebumDryness": item,
        "shineDistribution": item, "shineType": item, "pigmentation": item,
        "redness": item, "darkCircles": item, "toneUniformity": item,
      },
      "featureImpression": {
        "eyeImpression": item, "eyelidWeight": item, "underEyeZone": item,
        "browImpression": item, "lipImpression": item,
      },
      "linesAndPlanes": {
        "lineShape": item, "lineWeight": item, "dimensionality": item,
        "contourDefinition": item, "noseShadowEffect": item,
        "noseCheekConnection": item, "lowerFaceImpression": item,
        "jawlineDefinition": item,
      },
      "gestalt": {
        "perceptualCenter": item, "featurePresenceRanking": item,
        "detailDensity": item, "negativeSpace": item, "centerVsOuter": item,
        "clarityVsSoftness": item, "overallMood": item, "standoutFeatures": [item],
      },
      "volume": {
        "upperLowerDistribution": item, "visibleHollows": [],
        "mouthCornerImpression": item,
      },
      "personalColor": {
        "status": "provisional", "season": "autumn", "subtype": "muted",
        "borderTone": None, "rationaleMetricKeys": ["personalColor.tone.top"],
      },
      "impressionAxes": [
        {
          "key": "clarity", "leftLabel": "부드러운", "rightLabel": "선명한",
          "value": 0.25,
        },
      ],
    },
  )


def consulting() -> ConsultingResult:
  advice = {"summary": "요약", "items": ["항목"], "rationaleMetricKeys": []}
  styling_rows = [
    {"category": "base", "note": "얇은 베이스", "why": "피부 결을 살려요"},
    {"category": "brow", "note": "결 눈썹", "why": "눈썹 흐름을 살려요"},
    {"category": "blush", "note": "볼 중앙", "why": "볼 중심을 살려요"},
    {"category": "lip", "note": "뮤트 립", "why": "색 축과 연결해요"},
  ]
  return ConsultingResult.model_validate(
    {
      "makeup": {
        "base": "얇은 베이스", "brow": "결 눈썹", "eyeshadow": "음영",
        "eyeliner": "얇은 라인", "blush": "볼 중앙", "contour": "외곽",
        "highlight": "중앙", "lip": "뮤트 립",
      },
      "colorAndProduct": advice, "hair": advice, "fashion": advice,
      "photography": advice,
      "overallMood": "차분한 균형", "summary": "전체 맞춤 요약",
      "shortSummary": "짧은 요약", "tags": ["뮤트", "균형"],
      "stylingLooks": {
        "natural": {
          "title": "결을 살린 룩",
          "subtitle": "차분한 방향",
          "description": "현재 선을 부드럽게 연결해요",
          "rows": styling_rows,
        },
        "glam": {
          "title": "선명도를 더한 룩",
          "subtitle": "또렷한 방향",
          "description": "같은 비율에 대비를 더해요",
          "rows": styling_rows,
        },
      },
    },
  )


class FakeAI:
  def __init__(self) -> None:
    self.measure_calls = 0
    self.perceive_calls = 0
    self.consult_calls = 0
    self.consult_error: Exception | None = None
    self.measure_error: Exception | None = None
    self.perceive_error: Exception | None = None

  async def measure(self, **_kwargs):
    self.measure_calls += 1
    if self.measure_error:
      raise self.measure_error
    return MeasurementStageOutput.model_validate(
      {
        "metrics": {},
        "photoQuality": {"usable": True, "warnings": []},
      },
    )

  async def perceive(self, **_kwargs):
    self.perceive_calls += 1
    if self.perceive_error:
      raise self.perceive_error
    return perception()

  async def consult(self, **_kwargs):
    self.consult_calls += 1
    if self.consult_error:
      raise self.consult_error
    return consulting()


class FakeStageStore:
  def __init__(self) -> None:
    self.cached: dict[StageName, dict] = {}
    self.completed: list[StageName] = []
    self.failed: list[StageName] = []
    self.started: dict[StageName, dict] = {}
    self._current_stage: StageName | None = None

  async def find(self, *, stage: StageName, **_kwargs):
    return self.cached.get(stage)

  async def start(self, *, stage: StageName, **kwargs):
    self._current_stage = stage
    self.started[stage] = kwargs
    return {"id": uuid4(), "attempt_count": 1}

  async def complete(self, _run_id, _output, _raw, **_kwargs):
    assert self._current_stage
    self.completed.append(self._current_stage)

  async def fail(self, _run_id, _error):
    assert self._current_stage
    self.failed.append(self._current_stage)


def settings():
  return SimpleNamespace(
    effective_analysis_model_id="model-a",
    face_analysis_stage_timeout_seconds=2.0,
  )


def test_initial_snapshot_contains_camera_profile_and_l1() -> None:
  result = initialize_face_analysis_v2(REQUEST)

  assert result.face_profile["face3d.noseTipProjection"].source.value == "depth"
  assert result.derived.rules_version == "s1-l1-v1"
  assert result.pipeline.overall == "processing"


@pytest.mark.asyncio
async def test_pipeline_persists_after_every_stage_and_projects_legacy() -> None:
  persisted = []

  async def persist(_report_id, result):
    persisted.append(result.model_copy(deep=True))

  ai = FakeAI()
  pipeline = FaceAnalysisPipeline(
    db=object(), settings=settings(), ai=ai, stage_store=FakeStageStore(),
    persist_callback=persist,
  )

  result = await pipeline.run(
    report_id=REPORT_ID, request_payload=REQUEST, source_image_bytes=b"jpeg",
  )

  assert len(persisted) == 4
  assert [
    project_legacy_analysis_result(snapshot)["contentRevision"]
    for snapshot in persisted
  ] == [0, 0, 1, 2]
  assert result.pipeline.overall == "completed"
  assert result.perception is not None
  assert result.consulting is not None
  legacy = project_legacy_analysis_result(result)
  assert legacy["faceShape"] == result.derived.face_shape.label
  assert "recommendedMakeups" not in legacy
  assert set(legacy["regionNotes"]) == {"upper", "mid", "lower", "jaw"}
  assert (
    result.perception.feature_impression.eye_impression.label
    in legacy["regionNotes"]["upper"]["insight"]
  )
  assert result.perception.feature_impression.brow_impression.label in legacy["regionNotes"]["upper"]["insight"]
  assert result.perception.lines_and_planes.nose_shadow_effect.label in legacy["regionNotes"]["mid"]["evidence"]
  assert result.perception.volume.mouth_corner_impression.label in legacy["regionNotes"]["lower"]["evidence"]
  assert (
    legacy["impressionNotes"]["overallMood"]
    == result.perception.gestalt.overall_mood.label
  )
  assert result.perception.gestalt.perceptual_center.label in legacy["impressionNotes"]["paragraph"]
  assert legacy["impressionNotes"]["axes"][0]["key"] == "clarity"
  assert legacy["regionNotes"]["upper"]["recommendation"] == "결 눈썹 음영 얇은 라인"
  assert legacy["regionNotes"]["lower"]["recommendation"] == "뮤트 립"
  assert legacy["stylingLooks"]["natural"]["rows"]
  assert legacy["skinPerception"]["texture"]["label"] == "균형"
  assert legacy["contentStatus"]["stylingStatus"] == "completed"
  assert legacy["contentStatus"]["sources"]["styling"] == "llm"
  assert legacy["contentRevision"] == 2


@pytest.mark.asyncio
async def test_partial_persistence_projects_renderable_report_content() -> None:
  class CaptureDatabase:
    def __init__(self) -> None:
      self.arguments: tuple | None = None

    async def execute(self, *_arguments):
      self.arguments = _arguments

  db = CaptureDatabase()
  result = initialize_face_analysis_v2(REQUEST)

  await persist_face_analysis_v2(db, REPORT_ID, result)

  assert db.arguments is not None
  persisted = json.loads(db.arguments[-1])
  assert persisted["faceShape"] == result.derived.face_shape.label
  assert persisted["regionNotes"]["upper"]["insight"]
  assert persisted["contentRevision"] == 0
  assert persisted["faceAnalysisV2"]["pipeline"]["aiPerception"]["status"] == "pending"


@pytest.mark.asyncio
async def test_perception_and_styling_start_in_parallel() -> None:
  class CoordinatedAI(FakeAI):
    def __init__(self) -> None:
      super().__init__()
      self.perception_started = asyncio.Event()
      self.consulting_started = asyncio.Event()
      self.release_content = asyncio.Event()

    async def perceive(self, **_kwargs):
      self.perceive_calls += 1
      self.perception_started.set()
      await self.release_content.wait()
      return perception()

    async def consult(self, **_kwargs):
      self.consult_calls += 1
      self.consulting_started.set()
      await self.release_content.wait()
      return consulting()

  ai = CoordinatedAI()
  pipeline = FaceAnalysisPipeline(
    db=object(), settings=settings(), ai=ai, stage_store=FakeStageStore(),
    persist_callback=lambda _report_id, _result: _async_none(),
  )
  task = asyncio.create_task(
    pipeline.run(
      report_id=REPORT_ID,
      request_payload=REQUEST,
      source_image_bytes=b"jpeg",
    ),
  )

  await asyncio.wait_for(ai.perception_started.wait(), timeout=1)
  await asyncio.wait_for(ai.consulting_started.wait(), timeout=1)
  ai.release_content.set()
  result = await task

  assert result.perception is not None
  assert result.consulting is not None


def test_legacy_projection_uses_measurement_templates_before_ai_content() -> None:
  result = initialize_face_analysis_v2(REQUEST)

  legacy = project_legacy_analysis_result(result)

  assert legacy["faceShape"] == result.derived.face_shape.label
  assert legacy["regionNotes"]["upper"]["insight"]
  assert legacy["impressionNotes"]["paragraph"]
  assert legacy["stylingLooks"]["natural"]["rows"]
  assert legacy["contentStatus"]["sources"] == {
    "core": "template",
    "narrative": "template",
    "styling": "template",
  }
  assert legacy["contentRevision"] == 0


@pytest.mark.asyncio
async def test_measurement_failure_keeps_camera_profile_and_runs_l2() -> None:
  ai = FakeAI()
  ai.measure_error = AppError(502, "BAD_STAGE", "bad")
  pipeline = FaceAnalysisPipeline(
    db=object(), settings=settings(), ai=ai, stage_store=FakeStageStore(),
    persist_callback=lambda _report_id, _result: _async_none(),
  )

  result = await pipeline.run(
    report_id=REPORT_ID, request_payload=REQUEST, source_image_bytes=b"jpeg",
  )

  assert result.face_profile["face3d.noseTipProjection"].source.value == "depth"
  assert result.pipeline.ai_measurement.status.value == "failed"
  assert ai.perceive_calls == 1
  assert result.pipeline.overall == "partial"


@pytest.mark.asyncio
async def test_perception_failure_does_not_block_independent_styling() -> None:
  ai = FakeAI()
  ai.perceive_error = AppError(502, "BAD_L2", "bad")
  pipeline = FaceAnalysisPipeline(
    db=object(), settings=settings(), ai=ai, stage_store=FakeStageStore(),
    persist_callback=lambda _report_id, _result: _async_none(),
  )

  result = await pipeline.run(
    report_id=REPORT_ID, request_payload=REQUEST, source_image_bytes=b"jpeg",
  )

  assert ai.consult_calls == 1
  assert result.pipeline.ai_consulting.status.value == "completed"
  assert result.consulting is not None
  legacy = project_legacy_analysis_result(result)
  assert "skinPerception" not in legacy
  assert legacy["regionNotes"]["mid"]["insight"]
  assert legacy["contentStatus"]["sources"]["narrative"] == "template"
  assert legacy["contentRevision"] == 2


@pytest.mark.asyncio
async def test_styling_failure_keeps_perception_and_template_styling() -> None:
  ai = FakeAI()
  ai.consult_error = AppError(502, "BAD_L3", "bad")
  pipeline = FaceAnalysisPipeline(
    db=object(), settings=settings(), ai=ai, stage_store=FakeStageStore(),
    persist_callback=lambda _report_id, _result: _async_none(),
  )

  result = await pipeline.run(
    report_id=REPORT_ID, request_payload=REQUEST, source_image_bytes=b"jpeg",
  )

  assert result.perception is not None
  assert result.consulting is None
  legacy = project_legacy_analysis_result(result)
  assert legacy["skinPerception"]["texture"]["label"] == "균형"
  assert legacy["stylingLooks"]["glam"]["rows"]
  assert legacy["contentStatus"]["sources"]["styling"] == "template"
  assert legacy["contentRevision"] == 2


@pytest.mark.asyncio
async def test_consulting_filters_internal_insights_and_hashes_model_visible_payload() -> None:
  class CapturingStructuredClient:
    def __init__(self) -> None:
      self.calls: list[dict] = []

    async def analyze_structured_json(self, **kwargs):
      self.calls.append(kwargs)
      return consulting().model_dump(by_alias=True, mode="json")

  class ConsultingPromptAI(FaceAnalysisAI):
    def __init__(self, client: CapturingStructuredClient) -> None:
      super().__init__(client)

    async def measure(self, **_kwargs):
      return MeasurementStageOutput.model_validate(
        {
          "metrics": {},
          "photoQuality": {"usable": True, "warnings": []},
        },
      )

    async def perceive(self, **_kwargs):
      payload = perception().model_dump(by_alias=True, mode="json")
      payload["volume"]["visibleHollows"] = [
        {
          "label": "internal hollow",
          "description": "must stay internal",
          "confidence": 0.8,
          "rationaleMetricKeys": ["face3d.noseTipProjection"],
          "sensitivity": 3,
        },
      ]
      return PerceptionResult.model_validate(payload)

  client = CapturingStructuredClient()
  ai = ConsultingPromptAI(client)
  store = FakeStageStore()
  pipeline = FaceAnalysisPipeline(
    db=object(),
    settings=settings(),
    ai=ai,
    stage_store=store,
    persist_callback=lambda _report_id, _result: _async_none(),
  )

  result = await pipeline.run(
    report_id=REPORT_ID,
    request_payload=REQUEST,
    source_image_bytes=b"jpeg",
  )

  assert result.consulting is not None
  assert len(client.calls) == 1
  model_payload = json.loads(client.calls[0]["user_prompt"])
  assert "faceShape" in model_payload["derived"]
  assert "asymmetry" not in model_payload["derived"]
  assert "perception" not in model_payload
  # consult 캐시 키는 성별별 방향 차이를 반영하려 profileGender를 포함한다
  # (모델 user_prompt에는 없고 developer_prompt로 반영되므로 해시 입력만 확장).
  assert (
    store.started[StageName.AI_CONSULTING]["input_hash"]
    == compute_stage_input_hash({**model_payload, "profileGender": None})
  )

  raw_derived = initialize_face_analysis_v2(REQUEST).derived
  raw_perception = await ai.perceive()
  await ai.consult(profile={}, derived=raw_derived, perception=raw_perception)
  direct_payload = json.loads(client.calls[1]["user_prompt"])
  assert "asymmetry" not in direct_payload["derived"]
  assert direct_payload["perception"]["volume"]["visibleHollows"] == []


async def _async_none() -> None:
  return None
