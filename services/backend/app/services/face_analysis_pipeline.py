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
  ConsultingAdvice,
  ConsultingResult,
  FaceAnalysisPipelineState,
  FaceAnalysisV2,
  Insight,
  MeasurementStageOutput,
  MakeupConsulting,
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


def _region_conclusion(
  region_name: str,
  primary: Insight,
  secondary: Insight | None = None,
) -> str:
  sentences = [
    f"{region_name}의 핵심 인상은 ‘{primary.label.strip()}’입니다.",
    primary.description,
    secondary.description if secondary is not None else "",
  ]
  return _compact_join(sentences, " ")


def _region_evidence(*insights: Insight | None) -> str:
  evidence = [
    f"‘{insight.label.strip()}’ 관찰은 {insight.description.strip()}"
    for insight in insights
    if insight is not None
    and insight.label.strip()
    and insight.description.strip()
  ]
  if not evidence:
    return ""
  return " ".join(
    [
      "사진과 측정 근거를 함께 보면 다음 특징이 연결됩니다.",
      _compact_join(evidence, " "),
    ],
  )


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
  return {
    "upper": {
      "insight": _region_conclusion(
        "눈과 눈썹",
        feature.eye_impression,
        feature.brow_impression,
      ),
      "evidence": _region_evidence(
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
      "insight": _region_conclusion(
        "코와 볼",
        planes.nose_cheek_connection,
        planes.dimensionality,
      ),
      "evidence": _region_evidence(
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
      "insight": _region_conclusion(
        "입술과 입 주변",
        feature.lip_impression,
        volume.mouth_corner_impression,
      ),
      "evidence": _region_evidence(
        feature.lip_impression,
        volume.mouth_corner_impression,
        planes.lower_face_impression,
      ),
      "recommendation": makeup.lip,
    },
    "jaw": {
      "insight": _region_conclusion(
        "턱과 윤곽",
        planes.lower_face_impression,
        planes.jawline_definition,
      ),
      "evidence": _region_evidence(
        planes.lower_face_impression,
        planes.jawline_definition,
        planes.contour_definition,
        planes.line_shape,
        planes.line_weight,
      ),
      "recommendation": makeup.contour,
    },
  }


def _build_impression_notes(
  gestalt: Any,
  planes: Any,
  feature: Any,
  volume: Any,
  axes: list[Any],
) -> dict[str, Any]:
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
  result = {
    "overallMood": gestalt.overall_mood.label,
    "keywords": keywords[:6] or [gestalt.overall_mood.label],
    "paragraph": paragraph or gestalt.overall_mood.description,
  }
  if axes:
    result["axes"] = [
      axis.model_dump(by_alias=True, mode="json")
      if isinstance(axis, BaseModel)
      else axis
      for axis in axes
    ]
  return result


def _fallback_styling_looks(consulting: ConsultingResult) -> dict[str, Any]:
  makeup = consulting.makeup
  rows = [
    ("base", makeup.base),
    ("brow", makeup.brow),
    ("eyeshadow", makeup.eyeshadow),
    ("eyeliner", makeup.eyeliner),
    ("blush", makeup.blush),
    ("lip", makeup.lip),
  ]

  def build_look(title: str, description: str) -> dict[str, Any]:
    return {
      "title": title,
      "subtitle": consulting.short_summary,
      "description": description,
      "rows": [
        {
          "category": category,
          "note": note,
          "why": "측정된 얼굴 비율과 이목구비의 시선 흐름을 해치지 않도록 연결한 선택입니다.",
        }
        for category, note in rows
      ],
    }

  return {
    "natural": build_look(
      "결을 살린 내추럴 룩",
      consulting.color_and_product.summary,
    ),
    "glam": build_look(
      "선명도를 더한 포인트 룩",
      consulting.summary,
    ),
  }


def _template_consulting(result: FaceAnalysisV2) -> ConsultingResult:
  face = result.derived.face_shape
  vertical = result.derived.vertical_balance
  eye_brow = result.derived.eye_brow
  color = result.derived.color_axes
  mood = (
    result.anchor.get("recommendedMood")
    or f"{face.label}의 선을 살린 차분한 무드"
  )
  summary = _compact_join(
    [face.description, vertical.description, eye_brow.description],
    " ",
  )
  advice = ConsultingAdvice(
    summary="측정된 얼굴 비율과 선의 흐름을 유지하는 방향이 잘 맞아요.",
    items=[
      "한 부위를 과하게 바꾸기보다 현재 선을 따라 강약을 조절해 보세요.",
    ],
    rationale_metric_keys=face.rationale_metric_keys,
  )
  return ConsultingResult(
    makeup=MakeupConsulting(
      base="피부 표현은 얇게 겹쳐 본래의 결을 남겨 주세요.",
      brow="눈썹의 실제 결 방향을 따라 빈 곳만 가볍게 정돈해 주세요.",
      eyeshadow="눈매의 현재 기울기와 간격이 유지되도록 경계를 부드럽게 풀어 주세요.",
      eyeliner="눈꼬리의 실제 방향을 따라 짧고 얇게 연결해 주세요.",
      blush="볼의 돌출 중심을 확인하며 넓게 번지지 않도록 얹어 주세요.",
      contour="턱과 광대의 실제 윤곽선을 따라 옅게 연결해 주세요.",
      highlight="코와 볼의 돌출 중심에만 소량 사용해 입체감을 정리해 주세요.",
      lip="입술의 현재 비율을 유지하며 안쪽부터 색을 겹쳐 주세요.",
    ),
    color_and_product=ConsultingAdvice(
      summary=color.description,
      items=["측정된 컬러 축과 가까운 색부터 얼굴 옆에서 비교해 보세요."],
      rationale_metric_keys=color.rationale_metric_keys,
    ),
    hair=advice,
    fashion=advice,
    photography=advice,
    overall_mood=mood[:18],
    summary=summary,
    short_summary=face.description,
    tags=[face.label, vertical.label, color.label],
  )


def _template_region_notes(
  result: FaceAnalysisV2,
  makeup: MakeupConsulting,
) -> dict[str, dict[str, str]]:
  derived = result.derived
  return {
    "upper": {
      "insight": _region_conclusion("눈과 눈썹", derived.eye_brow),
      "evidence": _region_evidence(derived.eye_brow, derived.iris_exposure),
      "recommendation": _compact_join(
        [makeup.brow, makeup.eyeshadow, makeup.eyeliner],
        " ",
      ),
    },
    "mid": {
      "insight": _region_conclusion(
        "코와 볼",
        derived.cheekbone_and_eline,
        derived.nose_philtrum_lips,
      ),
      "evidence": _region_evidence(
        derived.cheekbone_and_eline,
        derived.nose_philtrum_lips,
      ),
      "recommendation": _compact_join(
        [makeup.blush, makeup.contour, makeup.highlight],
        " ",
      ),
    },
    "lower": {
      "insight": _region_conclusion("입술과 입 주변", derived.nose_philtrum_lips),
      "evidence": _region_evidence(derived.nose_philtrum_lips),
      "recommendation": makeup.lip,
    },
    "jaw": {
      "insight": _region_conclusion(
        "턱과 윤곽",
        derived.face_shape,
        derived.cheekbone_and_eline,
      ),
      "evidence": _region_evidence(
        derived.face_shape,
        derived.cheekbone_and_eline,
      ),
      "recommendation": makeup.contour,
    },
  }


def _template_impression_notes(result: FaceAnalysisV2) -> dict[str, Any]:
  derived = result.derived
  mood = (
    result.anchor.get("recommendedMood")
    or f"{derived.face_shape.label}의 선을 살린 무드"
  )
  return {
    "overallMood": mood,
    "keywords": [
      derived.face_shape.label,
      derived.vertical_balance.label,
      derived.eye_brow.label,
    ],
    "paragraph": _compact_join(
      [
        derived.face_shape.description,
        derived.vertical_balance.description,
        derived.eye_brow.description,
      ],
      " ",
    ),
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
    core_ready_at=_now(),
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
  consulting = result.consulting or _template_consulting(result)
  color = perception.personal_color if perception is not None else None
  personal_color = (
    " ".join(value for value in (color.season, color.subtype) if value)
    if color is not None and color.status == "provisional"
    else result.derived.color_axes.label
  )
  skin_type = (
    perception.skin.sebum_dryness.label
    if perception is not None
    else result.anchor.get("skinType", "피부 세부 관찰 보류")
  )
  skin_summary = (
    perception.skin.texture.description
    if perception is not None
    else "피부 세부 관찰은 확정하지 않고, 측정된 얼굴 비율과 이목구비 결과를 먼저 제공해요."
  )
  makeup = consulting.makeup
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
    "tags": consulting.tags,
    "stylingLooks": (
      consulting.styling_looks.model_dump(by_alias=True, mode="json")
      if consulting.styling_looks is not None
      else _fallback_styling_looks(consulting)
    ),
    "consultingAdvice": {
      "colorAndProduct": consulting.color_and_product.model_dump(
        by_alias=True,
        mode="json",
      ),
      "hair": consulting.hair.model_dump(by_alias=True, mode="json"),
      "fashion": consulting.fashion.model_dump(by_alias=True, mode="json"),
      "photography": consulting.photography.model_dump(by_alias=True, mode="json"),
    },
    "contentRevision": 2,
    "contentStatus": {
      "coreReadyAt": result.core_ready_at,
      "narrativeStatus": result.pipeline.ai_perception.status.value,
      "stylingStatus": result.pipeline.ai_consulting.status.value,
      "sources": {
        "core": "template",
        "narrative": "llm" if perception is not None else "template",
        "styling": (
          "llm" if consulting.styling_looks is not None else "template"
        ),
      },
    },
  }
  if perception is not None:
    legacy["skinPerception"] = perception.skin.model_dump(
      by_alias=True,
      mode="json",
    )
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
      perception.impression_axes,
    )
  else:
    legacy["regionNotes"] = _template_region_notes(result, makeup)
    legacy["impressionNotes"] = _template_impression_notes(result)
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
    anchor_values: Awaitable[dict[str, Any] | None] | None = None,
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

    resolved_anchor = await anchor_values if anchor_values is not None else None
    if resolved_anchor is not None:
      result.anchor = {
        key: value.strip()
        for key in ("faceShape", "skinType", "recommendedMood")
        if isinstance((value := resolved_anchor.get(key)), str) and value.strip()
      }
      anchor_face_shape = resolved_anchor.get("faceShape")
      if isinstance(anchor_face_shape, str) and anchor_face_shape.strip():
        result.derived = result.derived.model_copy(
          update={
            "face_shape": result.derived.face_shape.model_copy(
              update={"label": anchor_face_shape.strip()},
            ),
          },
        )

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
        "anchor": resolved_anchor or {},
      },
    )
    consulting_profile = filter_metrics_for_model(
      filter_metrics_for_audience(
        result.face_profile,
        include_sensitive=False,
      ),
    )
    raw_profile_gender = request_payload.get("profileGender")
    profile_gender = raw_profile_gender if isinstance(raw_profile_gender, str) else None
    consulting_model_input = filter_internal_only_payload(
      {
        "faceProfile": {
          key: value.model_dump(by_alias=True, mode="json")
          for key, value in consulting_profile.items()
        },
        "derived": result.derived.model_dump(by_alias=True, mode="json"),
        # 캐시 키에 포함. 스테이지 캐시는 report_id로 스코프되므로 사용자간
        # 공유는 원래 불가하나, 동일 report 재시도 중 계정 성별이 바뀌면
        # 캐시 무효화가 필요해 키에 넣는다(성별별 방향이 다르므로).
        "profileGender": profile_gender,
        **({"anchor": resolved_anchor} if resolved_anchor else {}),
      },
    )
    consulting_kwargs = self._stage_kwargs(
      report_id=report_id,
      stage=StageName.AI_CONSULTING,
      prompt_version=CONSULTING_PROMPT_VERSION,
      input_value=consulting_model_input,
    )

    async def run_perception_stage() -> tuple[str, BaseModel | None, StageState]:
      output, state = await self._execute_stage(
        model_type=PerceptionResult,
        kwargs=perception_kwargs,
        invoke=lambda: self.ai.perceive(
          source_image_bytes=source_image_bytes,
          profile=model_face_profile,
          derived=model_derived,
          anchor=resolved_anchor,
        ),
      )
      return "perception", output, state

    async def run_consulting_stage() -> tuple[str, BaseModel | None, StageState]:
      output, state = await self._execute_stage(
        model_type=ConsultingResult,
        kwargs=consulting_kwargs,
        invoke=lambda: self.ai.consult(
          profile=consulting_model_input["faceProfile"],
          derived=consulting_model_input["derived"],
          profile_gender=profile_gender,
          anchor=resolved_anchor,
        ),
      )
      return "consulting", output, state

    # 두 콘텐츠 스트림은 동일한 정본 fact sheet를 읽고 서로를 기다리지 않는다.
    # 완료된 쪽부터 저장해 폴링 응답이 진행 상태를 즉시 반영하게 한다.
    tasks = [
      asyncio.create_task(run_perception_stage()),
      asyncio.create_task(run_consulting_stage()),
    ]
    for completed in asyncio.as_completed(tasks):
      stage_kind, stage_output, stage_state = await completed
      if stage_kind == "perception":
        result.pipeline.ai_perception = stage_state
        perception = (
          stage_output if isinstance(stage_output, PerceptionResult) else None
        )
        if perception is not None:
          anchor_skin_type = (resolved_anchor or {}).get("skinType")
          anchor_mood = (resolved_anchor or {}).get("recommendedMood")
          if isinstance(anchor_skin_type, str) and anchor_skin_type.strip():
            perception = perception.model_copy(
              update={
                "skin": perception.skin.model_copy(
                  update={
                    "sebum_dryness": perception.skin.sebum_dryness.model_copy(
                      update={"label": anchor_skin_type.strip()},
                    ),
                  },
                ),
              },
            )
          if isinstance(anchor_mood, str) and anchor_mood.strip():
            perception = perception.model_copy(
              update={
                "gestalt": perception.gestalt.model_copy(
                  update={
                    "overall_mood": perception.gestalt.overall_mood.model_copy(
                      update={"label": anchor_mood.strip()},
                    ),
                  },
                ),
              },
            )
          result.perception = perception
      else:
        result.pipeline.ai_consulting = stage_state
        consulting = (
          stage_output if isinstance(stage_output, ConsultingResult) else None
        )
        if consulting is not None:
          anchor_mood = (resolved_anchor or {}).get("recommendedMood")
          if isinstance(anchor_mood, str) and anchor_mood.strip():
            consulting = consulting.model_copy(
              update={"overall_mood": anchor_mood.strip()},
            )
          result.consulting = consulting

      self._update_overall(result)
      await self.persist_callback(report_id, result)

    return result
