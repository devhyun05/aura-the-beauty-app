import asyncio
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
import hashlib
import json
from typing import Any, Protocol, TypeVar
from uuid import UUID

from pydantic import BaseModel

from app.core.errors import AppError
from app.db.session import Database
from app.schemas.face_analysis_v2 import (
  ConsultingResult,
  FaceAnalysisPipelineState,
  FaceAnalysisV2,
  Insight,
  MeasurementStageOutput,
  PerceptionResult,
  StageName,
  StageState,
  StageStatus,
)
from app.services.face_analysis_ai import (
  CONSULTING_PROMPT_VERSION,
  MEASUREMENT_PROMPT_VERSION,
  PERCEPTION_PROMPT_VERSION,
  FaceAnalysisAI,
)
from app.services.face_analysis_measurements import (
  build_measurement_coverage,
  filter_internal_only_payload,
  filter_metrics_for_audience,
  filter_metrics_for_model,
  merge_measurements,
  normalize_camera_measurements,
  with_explicit_unmeasured,
)
from app.services.face_analysis_rules import derive_face_analysis
from app.services.face_analysis_stage_runs import (
  complete_stage_run,
  compute_stage_input_hash,
  fail_stage_run,
  find_completed_stage_run,
  start_stage_run,
)


FACE_ANALYSIS_SCHEMA_VERSION = "aura-face-analysis-v2"


class StageStore(Protocol):
  async def find(self, *, stage: StageName, **kwargs: Any) -> dict[str, Any] | None: ...
  async def start(self, *, stage: StageName, **kwargs: Any) -> dict[str, Any] | None: ...
  async def complete(
    self,
    run_id: UUID,
    output: dict[str, Any],
    raw: dict[str, Any],
    **kwargs: Any,
  ) -> dict[str, Any] | None: ...
  async def fail(
    self,
    run_id: UUID,
    error: dict[str, Any],
  ) -> dict[str, Any] | None: ...


class DatabaseStageStore:
  def __init__(self, db: Database) -> None:
    self.db = db

  async def find(self, **kwargs: Any) -> dict[str, Any] | None:
    return await find_completed_stage_run(self.db, **kwargs)

  async def start(self, **kwargs: Any) -> dict[str, Any] | None:
    return await start_stage_run(self.db, **kwargs)

  async def complete(
    self,
    run_id: UUID,
    output: dict[str, Any],
    raw: dict[str, Any],
    **kwargs: Any,
  ) -> dict[str, Any] | None:
    return await complete_stage_run(self.db, run_id, output, raw, **kwargs)

  async def fail(
    self,
    run_id: UUID,
    error: dict[str, Any],
  ) -> dict[str, Any] | None:
    return await fail_stage_run(self.db, run_id, error)


PersistCallback = Callable[[UUID, FaceAnalysisV2], Awaitable[None]]
StageOutput = TypeVar("StageOutput", bound=BaseModel)


def _compact_join(parts: list[str], separator: str = " · ") -> str:
  seen: set[str] = set()
  compacted: list[str] = []
  for part in parts:
    normalized = " ".join(str(part).strip().split())
    if not normalized or normalized in seen:
      continue
    seen.add(normalized)
    compacted.append(normalized)
  return separator.join(compacted)


def _insight_labels(*insights: Insight | None) -> str:
  return _compact_join([insight.label for insight in insights if insight is not None])


def _insight_evidence(*insights: Insight | None) -> str:
  sentences: list[str] = []
  for insight in insights:
    if insight is None:
      continue
    label = insight.label.strip()
    description = insight.description.strip()
    if not label and not description:
      continue
    if label and description:
      sentences.append(f"{label}: {description}")
    else:
      sentences.append(label or description)
  return _compact_join(sentences, " ")


def _feature_ranking_text(gestalt: Any) -> str:
  labels = [
    item.label
    for item in [gestalt.feature_presence_ranking, *gestalt.standout_features[:3]]
    if item.label
  ]
  return _compact_join(labels)


def _build_region_notes(
  feature: Any,
  planes: Any,
  gestalt: Any,
  volume: Any,
  makeup: Any,
) -> dict[str, dict[str, str]]:
  upper_insight = _insight_labels(
    feature.eye_impression,
    feature.brow_impression,
    feature.eyelid_weight,
  )
  mid_insight = _insight_labels(
    volume.upper_lower_distribution,
    planes.nose_cheek_connection,
    planes.dimensionality,
  )
  lower_insight = _insight_labels(
    feature.lip_impression,
    volume.mouth_corner_impression,
    planes.lower_face_impression,
  )
  jaw_insight = _insight_labels(
    planes.lower_face_impression,
    planes.jawline_definition,
    planes.contour_definition,
  )

  return {
    "upper": {
      "insight": upper_insight or feature.eye_impression.label,
      "evidence": _insight_evidence(
        feature.eye_impression,
        feature.brow_impression,
        feature.eyelid_weight,
        feature.under_eye_zone,
      ),
      "recommendation": _compact_join(
        [makeup.brow, makeup.eyeshadow, makeup.eyeliner],
        " ",
      ),
    },
    "mid": {
      "insight": mid_insight or planes.nose_cheek_connection.label,
      "evidence": _insight_evidence(
        volume.upper_lower_distribution,
        planes.nose_cheek_connection,
        planes.nose_shadow_effect,
        planes.dimensionality,
      ),
      "recommendation": _compact_join(
        [makeup.blush, makeup.contour, makeup.highlight],
        " ",
      ),
    },
    "lower": {
      "insight": lower_insight or feature.lip_impression.label,
      "evidence": _insight_evidence(
        feature.lip_impression,
        volume.mouth_corner_impression,
        planes.lower_face_impression,
      ),
      "recommendation": makeup.lip,
    },
    "jaw": {
      "insight": jaw_insight or planes.lower_face_impression.label,
      "evidence": _insight_evidence(
        planes.lower_face_impression,
        planes.jawline_definition,
        planes.contour_definition,
        planes.line_shape,
        planes.line_weight,
      ),
      "recommendation": makeup.contour,
    },
  }


def _build_impression_notes(gestalt: Any, planes: Any, feature: Any, volume: Any) -> dict[str, Any]:
  keywords = [
    item.label
    for item in (
      gestalt.standout_features[:3]
      + [
        gestalt.overall_mood,
        gestalt.perceptual_center,
        gestalt.clarity_vs_softness,
        gestalt.center_vs_outer,
      ]
    )
    if item.label
  ]
  paragraph = _compact_join(
    [
      f"전체 무드는 {gestalt.overall_mood.label} 쪽으로 읽혀요. {gestalt.overall_mood.description}",
      f"시선 중심은 {gestalt.perceptual_center.label}에 가까워요. {gestalt.perceptual_center.description}",
      f"이목구비 존재감은 {_feature_ranking_text(gestalt)} 흐름으로 보이고, {gestalt.detail_density.description}",
      f"선과 면은 {planes.line_shape.label}, {planes.dimensionality.label} 쪽이라 {planes.line_shape.description}",
      f"눈·입술 포인트는 {feature.eye_impression.label}, {feature.lip_impression.label}로 읽히고 {volume.upper_lower_distribution.description}",
    ],
    " ",
  )
  return {
    "overallMood": gestalt.overall_mood.label,
    "keywords": keywords[:6] or [gestalt.overall_mood.label],
    "paragraph": paragraph or gestalt.overall_mood.description,
  }


def _now() -> str:
  return datetime.now(UTC).isoformat()


def _row_value(row: Any, key: str) -> Any:
  if isinstance(row, dict):
    return row.get(key)
  try:
    return row[key]
  except (KeyError, TypeError):
    return getattr(row, key, None)


def _json_object(value: Any) -> dict[str, Any]:
  if isinstance(value, dict):
    return value
  if isinstance(value, str):
    decoded = json.loads(value)
    return decoded if isinstance(decoded, dict) else {}
  return {}


def initialize_face_analysis_v2(request_payload: dict[str, Any]) -> FaceAnalysisV2:
  measurements = request_payload.get("measurements")
  camera_profile = normalize_camera_measurements(measurements)
  coverage = build_measurement_coverage(camera_profile)
  face_profile = with_explicit_unmeasured(camera_profile, coverage.out_of_scope_keys)
  pipeline = FaceAnalysisPipelineState.pending()
  requested_stage = request_payload.get("_faceAnalysisRetryStage")
  if isinstance(requested_stage, str):
    try:
      pipeline.retry_requested_stage = StageName(requested_stage)
    except ValueError:
      pass
  return FaceAnalysisV2(
    coverage=coverage,
    ai_measurements={},
    face_profile=face_profile,
    derived=derive_face_analysis(face_profile),
    pipeline=pipeline,
  )


async def persist_face_analysis_v2(
  db: Database,
  report_id: UUID,
  result: FaceAnalysisV2,
) -> None:
  await db.execute(
    """
    update analysis_reports
    set detail_payload = jsonb_set(
      jsonb_set(
        coalesce(detail_payload, '{}'::jsonb),
        '{result}',
        coalesce(detail_payload->'result', '{}'::jsonb),
        true
      ),
      '{result,faceAnalysisV2}',
      $2::jsonb,
      true
    )
    where id = $1
    """,
    report_id,
    json.dumps(result.model_dump(by_alias=True, mode="json"), ensure_ascii=False),
  )


def project_legacy_analysis_result(result: FaceAnalysisV2) -> dict[str, Any]:
  perception = result.perception
  consulting = result.consulting
  if perception is None or consulting is None:
    raise ValueError("AI perception and consulting are required for a face analysis report")

  color = perception.personal_color
  personal_color = " ".join(
    value for value in (color.season, color.subtype) if value
  )
  if color.status != "provisional" or not personal_color:
    raise ValueError("AI personal color analysis is incomplete")
  skin_type = perception.skin.sebum_dryness.label
  skin_summary = perception.skin.texture.description
  makeup = consulting.makeup
  look = consulting.recommended_look

  legacy: dict[str, Any] = {
    "faceShape": result.derived.face_shape.label,
    "personalColor": personal_color,
    "skinType": skin_type,
    "toneSummary": result.derived.color_axes.label,
    "recommendedMood": consulting.overall_mood,
    "summary": consulting.summary,
    "shortSummary": consulting.short_summary,
    "skinAnalysisSummary": skin_summary,
    "baseMakeupGuide": makeup.base,
    "makeupGuideline": {
      "brow": makeup.brow,
      "eyeshadow": makeup.eyeshadow,
      "eyeliner": makeup.eyeliner,
      "blush": makeup.blush,
      "contour": makeup.contour,
      "highlight": makeup.highlight,
      "lip": makeup.lip,
    },
    "recommendedMakeups": [
      {
        "title": look.title,
        "subtitle": look.subtitle,
        "description": look.description,
        "tags": look.tags,
      },
    ],
    "tags": consulting.tags,
  }
  feature = perception.feature_impression
  planes = perception.lines_and_planes
  gestalt = perception.gestalt
  volume = perception.volume
  legacy["regionNotes"] = _build_region_notes(
    feature,
    planes,
    gestalt,
    volume,
    makeup,
  )
  legacy["impressionNotes"] = _build_impression_notes(
    gestalt,
    planes,
    feature,
    volume,
  )
  return legacy


class FaceAnalysisPipeline:
  def __init__(
    self,
    *,
    db: Database,
    settings: Any,
    ai: FaceAnalysisAI,
    stage_store: StageStore | None = None,
    persist_callback: PersistCallback | None = None,
  ) -> None:
    self.db = db
    self.settings = settings
    self.ai = ai
    self.stage_store = stage_store or DatabaseStageStore(db)
    self.persist_callback = persist_callback or self._persist

  async def _persist(self, report_id: UUID, result: FaceAnalysisV2) -> None:
    await persist_face_analysis_v2(self.db, report_id, result)

  def _stage_kwargs(
    self,
    *,
    report_id: UUID,
    stage: StageName,
    prompt_version: str,
    input_value: dict[str, Any],
  ) -> dict[str, Any]:
    return {
      "report_id": report_id,
      "stage": stage,
      "input_hash": compute_stage_input_hash(input_value),
      "schema_version": FACE_ANALYSIS_SCHEMA_VERSION,
      "prompt_version": prompt_version,
      "model": self.settings.effective_analysis_model_id,
    }

  async def _execute_stage(
    self,
    *,
    model_type: type[StageOutput],
    kwargs: dict[str, Any],
    invoke: Callable[[], Awaitable[StageOutput]],
  ) -> tuple[StageOutput | None, StageState]:
    cached = await self.stage_store.find(**kwargs)
    if cached is not None:
      output = model_type.model_validate(
        _json_object(_row_value(cached, "normalized_output")),
      )
      return output, StageState(
        status=StageStatus.COMPLETED,
        run_id=str(_row_value(cached, "id")),
        updated_at=_now(),
        cache_hit=True,
      )

    run = await self.stage_store.start(**kwargs)
    run_id = _row_value(run, "id")
    if run_id is None:
      return None, StageState(
        status=StageStatus.FAILED,
        error_code="STAGE_RUN_UNAVAILABLE",
        updated_at=_now(),
      )

    try:
      async with asyncio.timeout(self.settings.face_analysis_stage_timeout_seconds):
        output = await invoke()
      payload = output.model_dump(by_alias=True, mode="json")
      status = StageStatus.COMPLETED
      if isinstance(output, MeasurementStageOutput) and not output.photo_quality.usable:
        status = StageStatus.PARTIAL
      await self.stage_store.complete(
        run_id,
        payload,
        payload,
        status=status,
      )
      return output, StageState(
        status=status,
        run_id=str(run_id),
        updated_at=_now(),
      )
    except TimeoutError:
      error = {"code": "FACE_ANALYSIS_STAGE_TIMEOUT", "reason": "timeout"}
    except AppError as exc:
      error = {"code": exc.code, "reason": exc.message}
    except Exception as exc:  # noqa: BLE001 - stage failures must preserve the camera report.
      error = {"code": "FACE_ANALYSIS_STAGE_FAILED", "reason": exc.__class__.__name__}

    await self.stage_store.fail(run_id, error)
    return None, StageState(
      status=StageStatus.FAILED,
      run_id=str(run_id),
      error_code=error["code"],
      updated_at=_now(),
    )

  @staticmethod
  def _update_overall(result: FaceAnalysisV2) -> None:
    states = (
      result.pipeline.ai_measurement,
      result.pipeline.ai_perception,
      result.pipeline.ai_consulting,
    )
    if all(state.status is StageStatus.COMPLETED for state in states):
      result.pipeline.overall = "completed"
    elif any(state.status in {StageStatus.FAILED, StageStatus.PARTIAL} for state in states):
      result.pipeline.overall = "partial"
    else:
      result.pipeline.overall = "processing"

  async def run(
    self,
    *,
    report_id: UUID,
    request_payload: dict[str, Any],
    source_image_bytes: bytes,
  ) -> FaceAnalysisV2:
    result = initialize_face_analysis_v2(request_payload)
    await self.persist_callback(report_id, result)
    source_hash = hashlib.sha256(source_image_bytes).hexdigest()
    camera_profile = normalize_camera_measurements(request_payload.get("measurements"))
    model_camera_profile = filter_metrics_for_model(camera_profile)

    measurement_kwargs = self._stage_kwargs(
      report_id=report_id,
      stage=StageName.AI_MEASUREMENT,
      prompt_version=MEASUREMENT_PROMPT_VERSION,
      input_value={
        "sourceImageSha256": source_hash,
        "coverage": result.coverage.model_dump(by_alias=True, mode="json"),
        "cameraProfile": {
          key: value.model_dump(by_alias=True, mode="json")
          for key, value in model_camera_profile.items()
        },
      },
    )
    measurement, result.pipeline.ai_measurement = await self._execute_stage(
      model_type=MeasurementStageOutput,
      kwargs=measurement_kwargs,
      invoke=lambda: self.ai.measure(
        source_image_bytes=source_image_bytes,
        coverage=result.coverage,
        camera_profile=model_camera_profile,
      ),
    )
    if measurement is not None:
      result.ai_measurements = measurement.metrics
      merged = merge_measurements(camera_profile, measurement.metrics, result.coverage)
      result.face_profile = with_explicit_unmeasured(
        merged.profile,
        result.coverage.out_of_scope_keys,
      )
      result.derived = derive_face_analysis(result.face_profile)
    self._update_overall(result)
    await self.persist_callback(report_id, result)

    model_face_profile = filter_metrics_for_model(result.face_profile)
    model_derived = filter_internal_only_payload(
      result.derived.model_dump(by_alias=True, mode="json"),
    )
    perception_kwargs = self._stage_kwargs(
      report_id=report_id,
      stage=StageName.AI_PERCEPTION,
      prompt_version=PERCEPTION_PROMPT_VERSION,
      input_value={
        "sourceImageSha256": source_hash,
        "faceProfile": {
          key: value.model_dump(by_alias=True, mode="json")
          for key, value in model_face_profile.items()
        },
        "derived": model_derived,
      },
    )
    perception, result.pipeline.ai_perception = await self._execute_stage(
      model_type=PerceptionResult,
      kwargs=perception_kwargs,
      invoke=lambda: self.ai.perceive(
        source_image_bytes=source_image_bytes,
        profile=model_face_profile,
        derived=model_derived,
      ),
    )
    if perception is not None:
      result.perception = perception
    self._update_overall(result)
    await self.persist_callback(report_id, result)

    if result.perception is None:
      result.pipeline.ai_consulting = StageState(
        status=StageStatus.FAILED,
        error_code="DEPENDENCY_FAILED",
        updated_at=_now(),
      )
    else:
      consulting_profile = filter_metrics_for_model(
        filter_metrics_for_audience(
          result.face_profile,
          include_sensitive=False,
        ),
      )
      consulting_model_input = filter_internal_only_payload(
        {
          "faceProfile": {
            key: value.model_dump(by_alias=True, mode="json")
            for key, value in consulting_profile.items()
          },
          "derived": result.derived.model_dump(by_alias=True, mode="json"),
          "perception": result.perception.model_dump(by_alias=True, mode="json"),
        },
      )
      consulting_kwargs = self._stage_kwargs(
        report_id=report_id,
        stage=StageName.AI_CONSULTING,
        prompt_version=CONSULTING_PROMPT_VERSION,
        input_value=consulting_model_input,
      )
      consulting, result.pipeline.ai_consulting = await self._execute_stage(
        model_type=ConsultingResult,
        kwargs=consulting_kwargs,
        invoke=lambda: self.ai.consult(
          profile=consulting_model_input["faceProfile"],
          derived=consulting_model_input["derived"],
          perception=consulting_model_input["perception"],
        ),
      )
      if consulting is not None:
        result.consulting = consulting

    self._update_overall(result)
    await self.persist_callback(report_id, result)
    return result
