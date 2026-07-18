import asyncio
import copy
import json
import logging
import time
from uuid import UUID


from fastapi import APIRouter, BackgroundTasks, Depends, Query



from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, database, require_database
from app.schemas.analysis import AnalysisJobCreate
from app.schemas.face_analysis_v2 import FaceAnalysisStageRetryRequest
from app.services.ai_job_queue import AIJobQueuePublisher
from app.services.embeddings import embed_text, format_pgvector, report_embedding_text
from app.services.face_analysis_ai import FaceAnalysisAI
from app.services.face_analysis_pipeline import (
  FaceAnalysisPipeline,
  initialize_face_analysis_v2,
  project_legacy_analysis_result,
)
from app.services.face3d_calibration_receipts import (
  FACE3D_TRUSTED_PROFILE_SCHEMA_VERSION,
  build_face3d_calibration_receipt_request_context,
  verify_face3d_calibration_receipt,
  verify_and_consume_face3d_calibration_receipt,
)
from app.services.media_deletion import (
  collect_report_media_refs,
  enqueue_unreferenced_report_media_deletions,
  ensure_media_deletion_schema,
  process_media_deletion_outbox_items,
)
from app.services.makeup_recommendation_context import normalize_makeup_profile_gender
from app.services.openai_analysis import (
  OpenAIAnalysisService,
  measured_personal_color_column_values,
)
from app.services.owned_media import (
  require_owned_media,
  resolve_owned_source_media,
  trusted_media_request_payload,
)
from app.services.push_notifications import create_and_send_notification
from app.services.users import ensure_user


router = APIRouter(prefix="/analysis", tags=["analysis"])
logger = logging.getLogger(__name__)
analysis_image_tasks: set[asyncio.Task] = set()

async def update_analysis_report_embedding(db: Database, report: dict) -> bool:
  embedding = await asyncio.to_thread(embed_text, report_embedding_text(report))
  if embedding is None:
    return False

  try:
    await db.execute(
      "update analysis_reports set embedding = $2::vector where id = $1",
      report["id"],
      format_pgvector(embedding),
    )
  except Exception:
    return False
  return True

ANALYSIS_MEDIA_SELECT = """
  r.*,
  source_media.id as source_media_ref_id,
  source_media.bucket as source_media_ref_bucket,
  source_media.object_key as source_media_ref_object_key,
  source_media.cdn_url as source_media_ref_cdn_url,
  source_media.content_type as source_media_ref_content_type,
  source_media.width as source_media_ref_width,
  source_media.height as source_media_ref_height,
  preview_media.id as preview_media_ref_id,
  preview_media.bucket as preview_media_ref_bucket,
  preview_media.object_key as preview_media_ref_object_key,
  preview_media.cdn_url as preview_media_ref_cdn_url,
  preview_media.content_type as preview_media_ref_content_type,
  preview_media.width as preview_media_ref_width,
  preview_media.height as preview_media_ref_height
"""

# 목록 응답 경량화: 측정 원본(request.measurements)은 목록 SQL에서도 제외한다.
# 상세 응답은 아래 response projection에서 mm/receipt 같은 내부 전용 필드를
# 제거한다. DB에는 검증·감사를 위해 원본 detail_payload를 그대로 보존한다.
ANALYSIS_MEDIA_LIST_SELECT = (
  ANALYSIS_MEDIA_SELECT
  + ",\n  (r.detail_payload"
  " #- '{request,measurements}'"
  " #- '{result,faceAnalysisV2,coverage}'"
  " #- '{result,faceAnalysisV2,aiMeasurements}'"
  " #- '{result,faceAnalysisV2,faceProfile}'"
  " #- '{result,faceAnalysisV2,derived}'"
  " #- '{result,faceAnalysisV2,perception}'"
  " #- '{result,faceAnalysisV2,consulting}') as detail_payload"
)


def decode_json_object(value: object) -> dict:
  if isinstance(value, dict):
    return value

  if isinstance(value, str) and value.strip():
    try:
      decoded = json.loads(value)
    except json.JSONDecodeError:
      return {}

    return decoded if isinstance(decoded, dict) else {}

  return {}


_FACE3D_INTERNAL_PROFILE_FIELDS = {
  "calibrationReceipt",
  "captureNonce",
  "profileBindingSha256",
  "sensorProvenance",
  "serverCalibrationReceiptStatus",
}
_INTERNAL_ONLY = object()


def _project_face3d_profile_for_response(value: object) -> object:
  if not isinstance(value, dict):
    return value
  projected = copy.deepcopy(value)
  for field in _FACE3D_INTERNAL_PROFILE_FIELDS:
    projected.pop(field, None)
  metrics = projected.get("metrics")
  if isinstance(metrics, dict):
    for metric in metrics.values():
      if isinstance(metric, dict):
        for field in list(metric):
          if field.startswith("valueMm"):
            metric.pop(field, None)
  return projected


def _project_internal_only_records(value: object) -> object:
  if isinstance(value, dict):
    sensitivity = value.get("sensitivity")
    if (
      not isinstance(sensitivity, bool)
      and isinstance(sensitivity, (int, float))
      and sensitivity >= 3
    ):
      return _INTERNAL_ONLY
    projected: dict = {}
    for key, item in value.items():
      if isinstance(key, str) and key.endswith(".mm"):
        continue
      if key == "rationaleMetricKeys" and isinstance(item, list):
        projected[key] = [
          metric_key
          for metric_key in item
          if isinstance(metric_key, str) and not metric_key.endswith(".mm")
        ]
        continue
      child = _project_internal_only_records(item)
      if child is not _INTERNAL_ONLY:
        projected[key] = child
    return projected
  if isinstance(value, list):
    projected_items = []
    for item in value:
      child = _project_internal_only_records(item)
      if child is not _INTERNAL_ONLY:
        projected_items.append(child)
    return projected_items
  return value


def project_analysis_detail_payload_for_response(detail_payload: dict) -> dict:
  projected = copy.deepcopy(detail_payload)
  request = projected.get("request")
  if isinstance(request, dict):
    if "face3d" in request:
      request["face3d"] = _project_face3d_profile_for_response(request["face3d"])
    measurements = request.get("measurements")
    if isinstance(measurements, dict) and "face3d" in measurements:
      measurements["face3d"] = _project_face3d_profile_for_response(
        measurements["face3d"],
      )

  result = projected.get("result")
  if isinstance(result, dict):
    filtered_result = _project_internal_only_records(result)
    if isinstance(filtered_result, dict):
      projected["result"] = filtered_result
  return projected


def normalize_analysis_report_row(row: dict | None) -> dict | None:
  if row is None:
    return None

  normalized = dict(row)
  normalized["detail_payload"] = project_analysis_detail_payload_for_response(
    decode_json_object(normalized.get("detail_payload")),
  )
  attach_analysis_media_reference(normalized, "source_media_ref", "source_media")
  attach_analysis_media_reference(normalized, "preview_media_ref", "preview_media")

  return normalized


def attach_analysis_media_reference(row: dict, prefix: str, target_key: str) -> None:
  media_id = row.pop(f"{prefix}_id", None)
  bucket = row.pop(f"{prefix}_bucket", None)
  object_key = row.pop(f"{prefix}_object_key", None)
  cdn_url = row.pop(f"{prefix}_cdn_url", None)
  content_type = row.pop(f"{prefix}_content_type", None)
  width = row.pop(f"{prefix}_width", None)
  height = row.pop(f"{prefix}_height", None)

  if media_id is None:
    row[target_key] = None
    return

  row[target_key] = {
    "id": str(media_id),
    "bucket": bucket,
    "object_key": object_key,
    "cdn_url": cdn_url,
    "content_type": content_type,
    "width": width,
    "height": height,
  }


def normalize_analysis_report_rows(rows: list[dict]) -> list[dict]:
  return [
    normalized
    for row in rows
    if (normalized := normalize_analysis_report_row(row)) is not None
  ]


def count_generated_makeup_images(result: dict | None) -> int:
  if not isinstance(result, dict):
    return 0

  recommended_makeups = result.get("recommendedMakeups")

  if not isinstance(recommended_makeups, list):
    return 0

  return sum(
    1
    for card in recommended_makeups
    if isinstance(card, dict)
    and any(
      isinstance(card.get(key), str) and card.get(key, "").strip()
      for key in ("imageUrl", "cdnUrl", "previewUrl")
    )
  )


def require_complete_makeup_recommendations(result: dict | None) -> None:
  recommended_makeups = result.get("recommendedMakeups") if isinstance(result, dict) else None
  recommended_count = len(recommended_makeups) if isinstance(recommended_makeups, list) else 0
  generated_image_count = count_generated_makeup_images(result)

  if recommended_count != 1 or generated_image_count != 1:
    raise AppError(
      502,
      "RECOMMENDED_MAKEUP_IMAGES_REQUIRED",
      "Analysis cannot be completed until exactly 1 recommended makeup image is generated.",
      details={
        "recommendedCount": recommended_count,
        "generatedImageCount": generated_image_count,
      },
    )




def build_analysis_detail_payload(payload: AnalysisJobCreate, result: dict) -> dict:
  request_payload = {
    key: value
    for key, value in payload.request_payload.items()
    if not key.startswith("_faceAnalysis")
  }
  return {"request": request_payload, "result": result}


def build_initial_analysis_detail_payload(
  payload: AnalysisJobCreate,
  *,
  face_analysis_v2_enabled: bool,
) -> dict:
  measurements = payload.request_payload.get("measurements")
  if not (
    face_analysis_v2_enabled
    and isinstance(measurements, dict)
    and measurements.get("schemaVersion") == "aura-face-analysis-measurements-v1"
  ):
    return {"request": payload.request_payload}

  face_analysis_v2 = initialize_face_analysis_v2(payload.request_payload)
  # AI 단계가 끝나기 전에는 규칙 기반 파생값을 완성된 얼굴 분석처럼 투영하지 않는다.
  result = {
    "faceAnalysisV2": face_analysis_v2.model_dump(by_alias=True, mode="json"),
  }
  return build_analysis_detail_payload(payload, result)


def mark_recommended_makeup_images_failed(result: dict) -> list[dict]:
  recommended_makeups = result.get("recommendedMakeups") if isinstance(result, dict) else None

  if not isinstance(recommended_makeups, list):
    return []

  return [
    {**card, "imageStatus": "failed"}
    for card in recommended_makeups
    if isinstance(card, dict)
  ]


async def update_analysis_image_progress(
  db: Database,
  report_id: UUID,
  payload: AnalysisJobCreate,
  result: dict,
) -> None:
  await db.execute(
    """
    update analysis_reports
    set detail_payload = $2::jsonb
    where id = $1
    """,
    report_id,
    json.dumps(build_analysis_detail_payload(payload, result)),
  )


async def generate_analysis_images_background(
  report_id: UUID,
  payload: AnalysisJobCreate,
  initial_result: dict,
  settings: Settings,
  prepared_source: tuple[bytes, str] | None = None,
  db: Database = database,
) -> None:
  service = OpenAIAnalysisService(settings)

  async def on_card_generated(index: int, generated_card: dict, partial_result: dict) -> None:
    await update_analysis_image_progress(db, report_id, payload, partial_result)
    logger.info(
      "[aura:analysis-api] image-generation:progress reportId=%s index=%s generatedImageCount=%s",
      report_id,
      index + 1,
      count_generated_makeup_images(partial_result),
    )

  try:
    result = await service.generate_recommended_makeup_images(
      payload.request_payload,
      initial_result,
      on_card_generated=on_card_generated,
      prepared_source=prepared_source,
    )
  except AppError as exc:
    logger.warning(
      "[aura:analysis-api] image-generation:app-error reportId=%s code=%s details=%s",
      report_id,
      exc.code,
      exc.details,
    )
    result = {
      **initial_result,
      "recommendedMakeups": mark_recommended_makeup_images_failed(initial_result),
      "imageGenerationStatus": "failed",
      "imageGenerationErrors": [
        {"reason": exc.__class__.__name__, "code": exc.code, "message": exc.message}
      ],
      "timing": {
        **(
          initial_result.get("timing")
          if isinstance(initial_result.get("timing"), dict)
          else {}
        ),
        "imageGenerationStatus": "failed",
      },
    }
  except Exception as exc:
    logger.exception(
      "[aura:analysis-api] image-generation:failed reportId=%s",
      report_id,
    )
    result = {
      **initial_result,
      "recommendedMakeups": mark_recommended_makeup_images_failed(initial_result),
      "imageGenerationStatus": "failed",
      "imageGenerationErrors": [{"reason": exc.__class__.__name__}],
      "timing": {
        **(
          initial_result.get("timing")
          if isinstance(initial_result.get("timing"), dict)
          else {}
        ),
        "imageGenerationStatus": "failed",
      },
    }

  generated_image_count = count_generated_makeup_images(result)

  await db.execute(
    """
    update analysis_reports
    set status = 'completed',
        error_message = null,
        detail_payload = $2::jsonb
    where id = $1
    """,
    report_id,
    json.dumps(build_analysis_detail_payload(payload, result)),
  )
  logger.info(
    "[aura:analysis-api] image-generation:finalized reportId=%s jobStatus=%s imageStatus=%s generatedImageCount=%s",
    report_id,
    "completed",
    result.get("imageGenerationStatus"),
    generated_image_count,
  )


def schedule_analysis_images_background(
  report_id: UUID,
  payload: AnalysisJobCreate,
  initial_result: dict,
  settings: Settings,
  prepared_source: tuple[bytes, str] | None = None,
  db: Database = database,
) -> None:
  task = asyncio.create_task(
    generate_analysis_images_background(
      report_id,
      payload,
      initial_result,
      settings,
      prepared_source,
      db,
    ),
  )
  analysis_image_tasks.add(task)

  def log_unhandled_error(completed_task: asyncio.Task) -> None:
    analysis_image_tasks.discard(completed_task)

    try:
      completed_task.result()
    except Exception:  # noqa: BLE001 - this is the last safety net for detached work.
      logger.exception(
        "[aura:analysis-api] image-generation:task-crashed reportId=%s",
        report_id,
      )

  task.add_done_callback(log_unhandled_error)
  logger.info("[aura:analysis-api] image-generation:scheduled reportId=%s", report_id)


async def mark_analysis_failed(
  db: Database,
  report_id: UUID,
  message: str,
  payload: AnalysisJobCreate,
  details: dict | None = None,
) -> None:
  await db.execute(
    """
    update analysis_reports
    set status = 'failed',
        error_message = $2,
        detail_payload = $3::jsonb
    where id = $1
    """,
    report_id,
    message,
    json.dumps(
      {
        "request": payload.request_payload,
        "error": {"message": message, "details": details or {}},
      },
    ),
  )


async def run_analysis_job_background(
  report_id: UUID,
  payload: AnalysisJobCreate,
  settings: Settings,
  *,
  db: Database = database,
  await_image_generation: bool = False,
) -> None:
  started_at = time.monotonic()
  logger.info(
    "[aura:analysis-api] background:start reportId=%s",
    report_id,
  )
  await db.execute(
    "update analysis_reports set status = 'processing' where id = $1",
    report_id,
  )

  analysis_service = OpenAIAnalysisService(settings)
  generates_images = settings.image_generation_provider_normalized == "openai"
  prepare_source_task: asyncio.Task | None = None

  if generates_images:
    # Warm the generation source (S3 read + downscale) while the slower text
    # analysis runs, so image generation starts without that work on its path.
    prepare_source_task = asyncio.create_task(
      analysis_service.prepare_generation_source(payload.request_payload),
    )

  try:
    logger.info(
      "[aura:analysis-api] text:start reportId=%s provider=%s model=%s",
      report_id,
      settings.analysis_provider,
      settings.effective_analysis_model_id,
    )
    if settings.face_analysis_v2_enabled:
      source_image_bytes = await analysis_service.read_source_image_bytes(
        payload.request_payload,
      )
      face_analysis_v2 = await FaceAnalysisPipeline(
        db=db,
        settings=settings,
        ai=FaceAnalysisAI(analysis_service),
      ).run(
        report_id=report_id,
        request_payload=payload.request_payload,
        source_image_bytes=source_image_bytes,
      )
      missing_stages = [
        stage
        for stage, value in (
          ("aiPerception", face_analysis_v2.perception),
          ("aiConsulting", face_analysis_v2.consulting),
        )
        if value is None
      ]
      if missing_stages:
        raise AppError(
          502,
          "FACE_ANALYSIS_AI_INCOMPLETE",
          "얼굴 분석을 완료하지 못했어요. 다시 촬영해 주세요.",
          {
            "missingStages": missing_stages,
            "pipeline": face_analysis_v2.pipeline.model_dump(
              by_alias=True,
              mode="json",
            ),
          },
        )
      try:
        result = project_legacy_analysis_result(face_analysis_v2)
      except ValueError as exc:
        raise AppError(
          502,
          "FACE_ANALYSIS_AI_INCOMPLETE",
          "얼굴 분석을 완료하지 못했어요. 다시 촬영해 주세요.",
          {"reason": str(exc)},
        ) from exc
      result["faceAnalysisV2"] = face_analysis_v2.model_dump(
        by_alias=True,
        mode="json",
      )
    else:
      result = await analysis_service.analyze_text(payload.request_payload)
    image_generation_status = (
      "processing"
      if generates_images
      else "disabled"
    )
    result["imageGenerationStatus"] = image_generation_status
    result["timing"] = {
      **(result.get("timing") if isinstance(result.get("timing"), dict) else {}),
      "imageGenerationStatus": image_generation_status,
    }
    logger.info(
      "[aura:analysis-api] text:success reportId=%s provider=%s model=%s durationMs=%s",
      report_id,
      settings.analysis_provider,
      settings.effective_analysis_model_id,
      round((time.monotonic() - started_at) * 1000),
    )
  except AppError as exc:
    if prepare_source_task is not None:
      prepare_source_task.cancel()
    logger.warning(
      "[aura:analysis-api] text:app-error reportId=%s code=%s details=%s",
      report_id,
      exc.code,
      exc.details,
    )
    await mark_analysis_failed(db, report_id, exc.message, payload, exc.details)
    return
  except Exception as exc:
    if prepare_source_task is not None:
      prepare_source_task.cancel()
    message = "AI analysis invocation failed."
    details = {"reason": exc.__class__.__name__}
    logger.exception("[aura:analysis-api] text:failed reportId=%s", report_id)
    await mark_analysis_failed(db, report_id, message, payload, details)
    return

  # DB 정본은 기기 측정값 원칙: personal_color/tone_summary 컬럼은 LLM 산출이
  # 아니라 조명 보정·정합성 게이트를 통과한 측정 퍼컬의 한국어 라벨을 쓴다.
  # (라이브 프롬프트는 애초에 퍼컬 재판정을 금지 — LLM 값은 폴백으로도 안 쓴다.)
  # 측정 실패면 (None, None) → coalesce가 NULL 유지 → 리스트 태그도 표시 안 함.
  measured_personal_color, measured_tone_summary = (
    measured_personal_color_column_values(
      payload.request_payload.get("measurements"),
    )
  )
  report_status = "completed"
  report = await db.fetchrow(
    """
    update analysis_reports
    set status = $2::job_status,
        ai_provider = $3,
        ai_model = $4,
        analyzed_at = now(),
        personal_color = coalesce($5, personal_color),
        face_shape = coalesce($6, face_shape),
        skin_type = coalesce($7, skin_type),
        tone_summary = coalesce($8, tone_summary),
        recommended_mood = coalesce($9, recommended_mood),
        summary = coalesce($10, summary),
        short_summary = coalesce($11, short_summary),
        skin_analysis_summary = coalesce($12, skin_analysis_summary),
        base_makeup_guide = coalesce($13, base_makeup_guide),
        tags = coalesce($14, tags),
        detail_payload = $15::jsonb
    where id = $1
    returning *
    """,
    report_id,
    report_status,
    settings.analysis_provider,
    settings.effective_analysis_model_id,
    measured_personal_color,
    result.get("faceShape") if isinstance(result, dict) else None,
    result.get("skinType") if isinstance(result, dict) else None,
    measured_tone_summary,
    result.get("recommendedMood") if isinstance(result, dict) else None,
    result.get("summary") if isinstance(result, dict) else None,
    result.get("shortSummary") if isinstance(result, dict) else None,
    result.get("skinAnalysisSummary") if isinstance(result, dict) else None,
    result.get("baseMakeupGuide") if isinstance(result, dict) else None,
    result.get("tags") if isinstance(result, dict) else None,
    json.dumps(build_analysis_detail_payload(payload, result)),
  )

  if report is None:
    if prepare_source_task is not None:
      prepare_source_task.cancel()
    logger.warning(
      "[aura:analysis-api] background:missing-report reportId=%s",
      report_id,
    )
    return

  # The report text is already renderable at this point. Publish its completion
  # event before the slower recommended-image generation so users outside the
  # loading/result screen receive the notification as soon as My Page can show
  # the completed report.
  await create_and_send_notification(
    db,
    settings,
    user_id=report["user_id"],
    notification_type="analysis_report_completed",
    title="맞춤 분석 보고서가 완성됐어요",
    body="AURA에서 얼굴 분석 결과를 확인해 보세요.",
    data={
      "reportId": str(report_id),
      "route": "FaceAnalysisReportDetail",
    },
    dedupe_key=f"analysis-report:{report_id}:completed",
  )

  # 임베딩 실패는 보고서 완료를 막지 않지만, 조용히 삼키면 벡터 검색에서
  # 해당 보고서가 소리 없이 빠진다 — 최소한 로그로 드러낸다.
  if not await update_analysis_report_embedding(db, report):
    logger.warning(
      "[aura:analysis-api] embedding:failed reportId=%s",
      report_id,
    )

  if generates_images:
    prepared_source: tuple[bytes, str] | None = None

    if prepare_source_task is not None:
      try:
        prepared_source = await prepare_source_task
      except Exception:  # noqa: BLE001 - fall back to reading inside generation.
        logger.warning(
          "[aura:analysis-api] image-source:prepare-failed reportId=%s",
          report_id,
          exc_info=True,
        )
        prepared_source = None
    if await_image_generation:
      await generate_analysis_images_background(
        report_id,
        payload,
        result,
        settings,
        prepared_source,
        db,
      )
      return

    schedule_analysis_images_background(
      report_id,
      payload,
      result,
      settings,
      prepared_source,
      db,
    )
    return

  logger.info(
    "[aura:analysis-api] background:completed reportId=%s durationMs=%s",
    report_id,
    round((time.monotonic() - started_at) * 1000),
  )


async def dispatch_analysis_job(
  db: Database,
  background_tasks: BackgroundTasks,
  report_id: UUID,
  user_id: UUID,
  payload: AnalysisJobCreate,
  settings: Settings,
) -> None:
  execution_mode = settings.ai_job_execution_mode_normalized

  if execution_mode == "inline":
    background_tasks.add_task(
      run_analysis_job_background,
      report_id,
      payload,
      settings,
    )
    return

  if execution_mode != "sqs":
    raise AppError(
      500,
      "AI_JOB_EXECUTION_MODE_INVALID",
      "AI_JOB_EXECUTION_MODE must be either inline or sqs.",
      {"executionMode": execution_mode},
    )

  publisher = AIJobQueuePublisher(settings)

  try:
    result = await asyncio.to_thread(publisher.publish_analysis_job, report_id, user_id)
  except AppError as exc:
    await mark_analysis_failed(db, report_id, exc.message, payload, exc.details)
    raise

  logger.info(
    "[aura:analysis-api] job:queued reportId=%s messageId=%s",
    report_id,
    result.get("messageId"),
  )


@router.post("/jobs")
async def create_analysis_job(
  payload: AnalysisJobCreate,
  background_tasks: BackgroundTasks,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  # 계정 성별을 서버가 주입한다(클라이언트 값은 신뢰하지 않고 덮어씀).
  # 분석 프롬프트가 사진으로 성별을 추론하는 대신 이 값을 쓰게 하는 근거 —
  # 메이크업 추천 V2의 "성별 재추론 금지" 원칙과 정합.
  payload.request_payload["profileGender"] = normalize_makeup_profile_gender(
    user.get("gender"),
  )
  execution_mode = settings.ai_job_execution_mode_normalized

  if payload.run_immediately and execution_mode not in {"inline", "sqs"}:
    raise AppError(
      500,
      "AI_JOB_EXECUTION_MODE_INVALID",
      "AI_JOB_EXECUTION_MODE must be either inline or sqs.",
      {"executionMode": execution_mode},
    )

  source_media = await resolve_owned_source_media(
    db,
    owner_user_id=user["id"],
    media_id=payload.source_media_id,
    photo_capture_id=payload.photo_capture_id,
    required=payload.run_immediately,
  )
  if payload.preview_media_id is not None and (
    source_media is None or payload.preview_media_id != source_media["id"]
  ):
    await require_owned_media(
      db,
      media_id=payload.preview_media_id,
      owner_user_id=user["id"],
    )
  payload = payload.model_copy(
    update={
      "request_payload": trusted_media_request_payload(
        settings,
        payload.request_payload,
        source_media,
      ),
    },
  )
  logger.info(
    "[aura:analysis-api] job:create-start userSub=%s runImmediately=%s executionMode=%s",
    auth.subject,
    payload.run_immediately,
    execution_mode,
  )
  async def insert_report(executor) -> dict | None:
    row = await executor.fetchrow(
      """
      insert into analysis_reports (
        user_id,
        photo_capture_id,
        source_media_id,
        preview_media_id,
        status,
        title,
        report_title,
        environment_label,
        detail_payload
      )
      values ($1, $2, $3, $4, 'pending', $5, $6, $7, $8::jsonb)
      returning *
      """,
      user["id"],
      payload.photo_capture_id,
      payload.source_media_id,
      payload.preview_media_id,
      payload.title,
      payload.report_title or payload.title,
      payload.environment_label,
      json.dumps(
        build_initial_analysis_detail_payload(
          payload,
          face_analysis_v2_enabled=settings.face_analysis_v2_enabled,
        ),
      ),
    )
    return dict(row) if row else None

  measurements = payload.request_payload.get("measurements")
  measurement_face3d = (
    measurements.get("face3d")
    if isinstance(measurements, dict)
    else None
  )
  primary_face3d = (
    measurement_face3d
    if isinstance(measurement_face3d, dict)
    else payload.request_payload.get("face3d")
  )
  receipt_request_context = build_face3d_calibration_receipt_request_context(
    user_id=user["id"],
    photo_capture_id=payload.photo_capture_id,
    source_media_id=payload.source_media_id,
  )
  receipt_verification = (
    verify_face3d_calibration_receipt(
      primary_face3d,
      settings,
      expected_report_context_id=receipt_request_context.report_context_id,
      expected_subject_context_id=receipt_request_context.subject_context_id,
    )
    if isinstance(primary_face3d, dict)
    and primary_face3d.get("schemaVersion") == FACE3D_TRUSTED_PROFILE_SCHEMA_VERSION
    and primary_face3d.get("confidenceCalibrationStatus") == "calibrated"
    else None
  )

  if receipt_verification is not None and receipt_verification.verified:
    async def consume_and_insert(connection) -> dict | None:
      await verify_and_consume_face3d_calibration_receipt(
        connection,
        settings,
        payload.request_payload,
        expected_report_context_id=receipt_request_context.report_context_id,
        expected_subject_context_id=receipt_request_context.subject_context_id,
      )
      return await insert_report(connection)

    report = await db.run_in_transaction(consume_and_insert)
  else:
    await verify_and_consume_face3d_calibration_receipt(
      db,
      settings,
      payload.request_payload,
      expected_report_context_id=receipt_request_context.report_context_id,
      expected_subject_context_id=receipt_request_context.subject_context_id,
    )
    report = await insert_report(db)

  if payload.run_immediately:
    await dispatch_analysis_job(
      db,
      background_tasks,
      report["id"],
      user["id"],
      payload,
      settings,
    )

  return success({"job": normalize_analysis_report_row(report)})

@router.get("/jobs/{job_id}")
async def get_analysis_job(
  job_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  job = await db.fetchrow(
    f"""
    select {ANALYSIS_MEDIA_SELECT}
    from analysis_reports r
    left join media_assets source_media on source_media.id = r.source_media_id
    left join media_assets preview_media on preview_media.id = r.preview_media_id
    where r.id = $1 and r.user_id = $2 and r.deleted_at is null
    """,
    job_id,
    user["id"],
  )

  if not job:
    raise AppError(404, "ANALYSIS_JOB_NOT_FOUND", "Analysis job was not found.")

  return success({"job": normalize_analysis_report_row(job)})


@router.post("/jobs/{job_id}/retry")
async def retry_analysis_job_stage(
  job_id: UUID,
  retry: FaceAnalysisStageRetryRequest,
  background_tasks: BackgroundTasks,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  if not settings.face_analysis_v2_enabled:
    raise AppError(
      409,
      "FACE_ANALYSIS_V2_DISABLED",
      "Progressive face analysis is not enabled.",
    )

  user = await ensure_user(db, auth)
  existing = await db.fetchrow(
    """
    select *
    from analysis_reports
    where id = $1 and user_id = $2 and deleted_at is null
    """,
    job_id,
    user["id"],
  )
  if existing is None:
    raise AppError(404, "ANALYSIS_JOB_NOT_FOUND", "Analysis job was not found.")

  row = dict(existing)
  detail = decode_json_object(row.get("detail_payload"))
  request_payload = decode_json_object(detail.get("request"))
  measurements = request_payload.get("measurements")
  if not (
    isinstance(measurements, dict)
    and measurements.get("schemaVersion") == "aura-face-analysis-measurements-v1"
  ):
    raise AppError(
      409,
      "FACE_ANALYSIS_V2_RETRY_UNAVAILABLE",
      "This report does not contain retryable face measurements.",
    )

  retry_payload = {
    **request_payload,
    "_faceAnalysisRetryStage": retry.stage.value,
  }
  payload = AnalysisJobCreate(
    photo_capture_id=row.get("photo_capture_id"),
    source_media_id=row.get("source_media_id"),
    preview_media_id=row.get("preview_media_id"),
    title=row.get("title") or "AI makeup analysis",
    report_title=row.get("report_title"),
    environment_label=row.get("environment_label"),
    run_immediately=True,
    request_payload=retry_payload,
  )
  updated = await db.fetchrow(
    """
    update analysis_reports
    set status = 'pending',
        error_message = null,
        detail_payload = jsonb_set(
          detail_payload,
          '{result,faceAnalysisV2,pipeline,retryRequestedStage}',
          to_jsonb($2::text),
          true
        )
    where id = $1
    returning *
    """,
    job_id,
    retry.stage.value,
  )
  await dispatch_analysis_job(
    db,
    background_tasks,
    job_id,
    user["id"],
    payload,
    settings,
  )
  return success({"job": normalize_analysis_report_row(updated)})


@router.get("/reports")
async def list_analysis_reports(
  with_recommended_makeups: bool = Query(False, alias="withRecommendedMakeups"),
  limit: int | None = Query(None, ge=1, le=200),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  filters = [
    "r.user_id = $1",
    "r.status = 'completed'",
    """
    (
      jsonb_typeof(r.detail_payload->'result'->'faceAnalysisV2') is null
      or (
        jsonb_typeof(r.detail_payload->'result'->'faceAnalysisV2') = 'object'
        and jsonb_typeof(
          r.detail_payload->'result'->'faceAnalysisV2'->'perception'
        ) = 'object'
        and jsonb_typeof(
          r.detail_payload->'result'->'faceAnalysisV2'->'consulting'
        ) = 'object'
      )
    )
    """,
  ]
  values: list[object] = [user["id"]]

  if with_recommended_makeups:
    filters.append(
      """
      jsonb_typeof(r.detail_payload->'result'->'recommendedMakeups') = 'array'
      and jsonb_array_length(r.detail_payload->'result'->'recommendedMakeups') > 0
      """,
    )

  query = f"""
    select {ANALYSIS_MEDIA_LIST_SELECT}
    from analysis_reports r
    left join media_assets source_media on source_media.id = r.source_media_id
    left join media_assets preview_media on preview_media.id = r.preview_media_id
    where {' and '.join(filters)}
      and r.deleted_at is null
    order by r.created_at desc
  """

  if limit is not None:
    values.append(limit)
    query += f" limit ${len(values)}"

  reports = await db.fetch(
    query,
    *values,
  )

  return success({"reports": normalize_analysis_report_rows(reports)})


@router.get("/reports/{report_id}")
async def get_analysis_report(
  report_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  report = await db.fetchrow(
    f"""
    select {ANALYSIS_MEDIA_SELECT}
    from analysis_reports r
    left join media_assets source_media on source_media.id = r.source_media_id
    left join media_assets preview_media on preview_media.id = r.preview_media_id
    where r.id = $1 and r.user_id = $2 and r.deleted_at is null
    """,
    report_id,
    user["id"],
  )

  if not report:
    raise AppError(404, "ANALYSIS_REPORT_NOT_FOUND", "Analysis report was not found.")

  return success({"report": normalize_analysis_report_row(report)})


@router.delete("/reports/{report_id}")
async def delete_analysis_report(
  report_id: UUID,
  background_tasks: BackgroundTasks,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  await ensure_media_deletion_schema(db)
  user = await ensure_user(db, auth)

  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Database is not connected.")

  outbox_ids: list[UUID] = []
  skipped_referenced_count = 0
  already_deleted = False

  async with db.pool.acquire() as connection:
    async with connection.transaction():
      report = await connection.fetchrow(
        """
        select
          r.*,
          source_media.bucket as source_media_bucket,
          source_media.object_key as source_media_object_key,
          preview_media.bucket as preview_media_bucket,
          preview_media.object_key as preview_media_object_key,
          capture_media.id as capture_media_id,
          capture_media.bucket as capture_media_bucket,
          capture_media.object_key as capture_media_object_key
        from analysis_reports r
        left join media_assets source_media on source_media.id = r.source_media_id
        left join media_assets preview_media on preview_media.id = r.preview_media_id
        left join photo_captures pc on pc.id = r.photo_capture_id
        left join media_assets capture_media on capture_media.id = pc.media_id
        where r.id = $1 and r.user_id = $2
        for update of r
        """,
        report_id,
        user["id"],
      )

      if not report:
        raise AppError(404, "ANALYSIS_REPORT_NOT_FOUND", "Analysis report was not found.")

      already_deleted = report["deleted_at"] is not None
      refs = collect_report_media_refs(
        dict(report),
        cdn_base_url=settings.effective_cdn_base_url,
        default_bucket=settings.s3_bucket_name,
      )

      await connection.execute(
        """
        update analysis_reports
        set deleted_at = coalesce(deleted_at, now()),
            status = case
              when status in ('pending', 'processing') then 'cancelled'::job_status
              else status
            end
        where id = $1 and user_id = $2
        """,
        report_id,
        user["id"],
      )

      outbox_ids, skipped_referenced_count = (
        await enqueue_unreferenced_report_media_deletions(
          connection,
          report_id=report_id,
          refs=refs,
        )
      )

  if outbox_ids:
    background_tasks.add_task(
      process_media_deletion_outbox_items,
      database,
      settings,
      outbox_ids,
    )

  return success({
    "alreadyDeleted": already_deleted,
    "deleted": True,
    "outboxCount": len(outbox_ids),
    "reportId": str(report_id),
    "skippedReferencedCount": skipped_referenced_count,
  })


@router.delete("/reports/{report_id}/recommended-makeups/{makeup_index}")
async def delete_analysis_report_recommended_makeup(
  report_id: UUID,
  makeup_index: int,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  if makeup_index < 0:
    raise AppError(
      400,
      "INVALID_RECOMMENDED_MAKEUP_INDEX",
      "Recommended makeup index must be zero or greater.",
    )

  user = await ensure_user(db, auth)
  report = await db.fetchrow(
    """
    select detail_payload
    from analysis_reports
    where id = $1 and user_id = $2 and deleted_at is null
    """,
    report_id,
    user["id"],
  )

  if not report:
    raise AppError(404, "ANALYSIS_REPORT_NOT_FOUND", "Analysis report was not found.")

  detail_payload = decode_json_object(report.get("detail_payload"))
  result = detail_payload.get("result")
  recommended_makeups = result.get("recommendedMakeups") if isinstance(result, dict) else None

  if not isinstance(recommended_makeups, list) or makeup_index >= len(recommended_makeups):
    raise AppError(
      404,
      "RECOMMENDED_MAKEUP_NOT_FOUND",
      "Recommended makeup was not found.",
      details={"makeupIndex": makeup_index},
    )

  updated_makeups = [
    makeup
    for index, makeup in enumerate(recommended_makeups)
    if index != makeup_index
  ]
  result["recommendedMakeups"] = updated_makeups
  detail_payload["result"] = result

  updated_report = await db.fetchrow(
    """
    update analysis_reports
    set detail_payload = $3::jsonb
    where id = $1 and user_id = $2 and deleted_at is null
    returning *
    """,
    report_id,
    user["id"],
    json.dumps(detail_payload),
  )

  return success({"report": normalize_analysis_report_row(updated_report)})
