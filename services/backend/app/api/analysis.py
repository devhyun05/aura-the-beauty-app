import asyncio
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
from app.services.media_deletion import (
  collect_report_media_refs,
  enqueue_unreferenced_report_media_deletions,
  ensure_media_deletion_schema,
  process_media_deletion_outbox_items,
)
from app.services.openai_analysis import OpenAIAnalysisService
from app.services.users import ensure_user


router = APIRouter(prefix="/analysis", tags=["analysis"])
logger = logging.getLogger(__name__)
analysis_image_tasks: set[asyncio.Task] = set()


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


def normalize_analysis_report_row(row: dict | None) -> dict | None:
  if row is None:
    return None

  normalized = dict(row)
  normalized["detail_payload"] = decode_json_object(normalized.get("detail_payload"))

  return normalized


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

  if recommended_count != 3 or generated_image_count != 3:
    raise AppError(
      502,
      "RECOMMENDED_MAKEUP_IMAGES_REQUIRED",
      "Analysis cannot be completed until exactly 3 recommended makeup images are generated.",
      details={
        "recommendedCount": recommended_count,
        "generatedImageCount": generated_image_count,
      },
    )




def build_analysis_detail_payload(payload: AnalysisJobCreate, result: dict) -> dict:
  return {"request": payload.request_payload, "result": result}


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
  report_id: UUID,
  payload: AnalysisJobCreate,
  result: dict,
) -> None:
  await database.execute(
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
) -> None:
  service = OpenAIAnalysisService(settings)

  async def on_card_generated(index: int, generated_card: dict, partial_result: dict) -> None:
    await update_analysis_image_progress(report_id, payload, partial_result)
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

  await database.execute(
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
) -> None:
  task = asyncio.create_task(
    generate_analysis_images_background(report_id, payload, initial_result, settings),
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
) -> None:
  started_at = time.monotonic()
  logger.info(
    "[aura:analysis-api] background:start reportId=%s",
    report_id,
  )
  await database.execute(
    "update analysis_reports set status = 'processing' where id = $1",
    report_id,
  )

  try:
    analysis_service = OpenAIAnalysisService(settings)
    logger.info(
      "[aura:analysis-api] text:start reportId=%s provider=%s model=%s",
      report_id,
      settings.analysis_provider,
      settings.effective_analysis_model_id,
    )
    result = await analysis_service.analyze_text(payload.request_payload)
    image_generation_status = (
      "processing"
      if settings.image_generation_provider_normalized == "openai"
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
    logger.warning(
      "[aura:analysis-api] text:app-error reportId=%s code=%s details=%s",
      report_id,
      exc.code,
      exc.details,
    )
    await mark_analysis_failed(database, report_id, exc.message, payload, exc.details)
    return
  except Exception as exc:
    message = "AI analysis invocation failed."
    details = {"reason": exc.__class__.__name__}
    logger.exception("[aura:analysis-api] text:failed reportId=%s", report_id)
    await mark_analysis_failed(database, report_id, message, payload, details)
    return

  report_status = "completed"
  report = await database.fetchrow(
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
    result.get("personalColor") if isinstance(result, dict) else None,
    result.get("faceShape") if isinstance(result, dict) else None,
    result.get("skinType") if isinstance(result, dict) else None,
    result.get("toneSummary") if isinstance(result, dict) else None,
    result.get("recommendedMood") if isinstance(result, dict) else None,
    result.get("summary") if isinstance(result, dict) else None,
    result.get("shortSummary") if isinstance(result, dict) else None,
    result.get("skinAnalysisSummary") if isinstance(result, dict) else None,
    result.get("baseMakeupGuide") if isinstance(result, dict) else None,
    result.get("tags") if isinstance(result, dict) else None,
    json.dumps(build_analysis_detail_payload(payload, result)),
  )

  if report is None:
    logger.warning(
      "[aura:analysis-api] background:missing-report reportId=%s",
      report_id,
    )
    return

  if settings.image_generation_provider_normalized == "openai":
    schedule_analysis_images_background(
      report_id,
      payload,
      result,
      settings,
    )
    return

  logger.info(
    "[aura:analysis-api] background:completed reportId=%s durationMs=%s",
    report_id,
    round((time.monotonic() - started_at) * 1000),
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
  logger.info(
    "[aura:analysis-api] job:create-start userSub=%s runImmediately=%s",
    auth.subject,
    payload.run_immediately,
  )
  report = await db.fetchrow(
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
    json.dumps({"request": payload.request_payload}),
  )

  if payload.run_immediately:
    background_tasks.add_task(
      run_analysis_job_background,
      report["id"],
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
    """
    select *
    from analysis_reports
    where id = $1 and user_id = $2 and deleted_at is null
    """,
    job_id,
    user["id"],
  )

  if not job:
    raise AppError(404, "ANALYSIS_JOB_NOT_FOUND", "Analysis job was not found.")

  return success({"job": normalize_analysis_report_row(job)})


@router.get("/reports")
async def list_analysis_reports(
  with_recommended_makeups: bool = Query(False, alias="withRecommendedMakeups"),
  limit: int | None = Query(None, ge=1, le=200),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  filters = ["user_id = $1"]
  values: list[object] = [user["id"]]

  if with_recommended_makeups:
    filters.append(
      """
      jsonb_typeof(detail_payload->'result'->'recommendedMakeups') = 'array'
      and jsonb_array_length(detail_payload->'result'->'recommendedMakeups') > 0
      """,
    )

  query = f"""
    select *
    from analysis_reports
    where {' and '.join(filters)}
      and deleted_at is null
    order by created_at desc
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
    """
    select *
    from analysis_reports
    where id = $1 and user_id = $2 and deleted_at is null
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
