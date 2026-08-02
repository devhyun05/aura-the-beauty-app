import asyncio
import json
import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, database, require_database
from app.schemas.analysis import FilterExtractionAnalyzeRequest, FilterExtractionJobCreate
from app.services.ai_job_queue import AIJobQueuePublisher
from app.services.reference_makeup_extraction import (
  MODEL_VERSION,
  build_reference_makeup_extraction_payload_for_request,
  enrich_reference_makeup_products,
)
from app.services.owned_media import resolve_owned_source_media, trusted_media_request_payload
from app.services.media_deletion import (
  MediaObjectRef,
  enqueue_unreferenced_report_media_deletions,
  ensure_media_deletion_schema,
  process_media_deletion_outbox_items,
)
from app.services.private_media_delivery import (
  create_owned_media_delivery_urls,
  project_payload_with_private_media,
)
from app.services.push_notifications import create_and_send_notification
from app.services.report_rate_limit import enforce_report_generation_limit
from app.services.users import ensure_user


router = APIRouter(prefix="/filter-extractions", tags=["filter-extractions"])
logger = logging.getLogger(__name__)


def decode_json_object(value: object) -> dict[str, Any]:
  if isinstance(value, dict):
    return value

  if isinstance(value, str) and value.strip():
    try:
      decoded = json.loads(value)
    except json.JSONDecodeError:
      return {}

    return decoded if isinstance(decoded, dict) else {}

  return {}


def normalize_filter_extraction_report_row(row: dict | None) -> dict | None:
  if row is None:
    return None

  normalized = dict(row)
  normalized["result_payload"] = decode_json_object(normalized.get("result_payload"))
  return normalized


async def project_filter_extraction_reports_with_private_media(
  db: Database,
  settings: Settings,
  *,
  owner_user_id: UUID | str,
  reports: list[dict],
) -> list[dict]:
  delivery_urls = await create_owned_media_delivery_urls(
    db,
    settings,
    owner_user_id=owner_user_id,
    media_ids=[report.get("result_media_id") for report in reports],
  )
  projected_reports: list[dict] = []
  for report in reports:
    projected = dict(report)
    media_id = projected.get("result_media_id")
    delivery_url = delivery_urls.get(str(media_id)) if media_id else None
    projected["result_payload"] = project_payload_with_private_media(
      decode_json_object(projected.get("result_payload")),
      delivery_url=delivery_url,
    )
    projected_reports.append(projected)
  return projected_reports


async def project_filter_extraction_report_with_private_media(
  db: Database,
  settings: Settings,
  *,
  owner_user_id: UUID | str,
  report: dict | None,
) -> dict | None:
  normalized = normalize_filter_extraction_report_row(report)
  if normalized is None:
    return None
  return (
    await project_filter_extraction_reports_with_private_media(
      db,
      settings,
      owner_user_id=owner_user_id,
      reports=[normalized],
    )
  )[0]


def build_filter_extraction_request_state(payload: FilterExtractionAnalyzeRequest) -> dict[str, Any]:
  return {
    "request": payload.request_payload,
    "referenceImageId": payload.reference_image_id,
    "runAi": payload.run_ai,
  }


async def mark_filter_extraction_failed(
  db: Database,
  report_id: UUID,
  payload: FilterExtractionAnalyzeRequest,
  message: str,
  details: dict[str, Any] | None = None,
) -> None:
  await db.execute(
    """
    update filter_extraction_reports
    set status = 'failed',
        completed_at = now(),
        result_payload = $2::jsonb
    where id = $1
    """,
    report_id,
    json.dumps(
      {
        **build_filter_extraction_request_state(payload),
        "error": {"message": message, "details": details or {}},
      },
      ensure_ascii=False,
    ),
  )


async def run_filter_extraction_job_background(
  report_id: UUID,
  payload: FilterExtractionAnalyzeRequest,
  settings: Settings,
  *,
  db: Database = database,
) -> None:
  logger.info("[aura:filter-extraction-api] background:start reportId=%s", report_id)
  await db.execute(
    "update filter_extraction_reports set status = 'processing' where id = $1",
    report_id,
  )

  try:
    extraction_payload, ai_status, ai_error = (
      await build_reference_makeup_extraction_payload_for_request(payload, settings)
    )
    extraction_payload, product_source = await enrich_reference_makeup_products(
      db,
      settings,
      extraction_payload,
    )
    extracted_look = extraction_payload["extracted_makeup_look"]
  except AppError as exc:
    logger.warning(
      "[aura:filter-extraction-api] background:app-error reportId=%s code=%s details=%s",
      report_id,
      exc.code,
      exc.details,
    )
    await mark_filter_extraction_failed(db, report_id, payload, exc.message, exc.details)
    return
  except Exception as exc:
    message = "Reference makeup extraction failed."
    details = {"reason": exc.__class__.__name__}
    logger.exception("[aura:filter-extraction-api] background:failed reportId=%s", report_id)
    await mark_filter_extraction_failed(db, report_id, payload, message, details)
    return

  completed_report = await db.fetchrow(
    """
    update filter_extraction_reports
    set status = 'completed',
        title = $2,
        subtitle = $3,
        tags = $4,
        accuracy = $5,
        model_version = $6,
        result_payload = $7::jsonb,
        completed_at = now()
    where id = $1
    returning *
    """,
    report_id,
    extracted_look["title"],
    extracted_look.get("subtitle"),
    extracted_look.get("tags"),
    extracted_look.get("accuracy"),
    MODEL_VERSION,
    json.dumps(
      {
        **build_filter_extraction_request_state(payload),
        "result": extraction_payload,
        "productSource": product_source,
        "aiStatus": ai_status,
        "aiError": ai_error,
      },
      ensure_ascii=False,
    ),
  )

  if completed_report is None:
    logger.warning("[aura:filter-extraction-api] background:missing-report reportId=%s", report_id)
    return

  logger.info(
    "[aura:filter-extraction-api] background:completed reportId=%s aiStatus=%s productSource=%s",
    report_id,
    ai_status,
    product_source,
  )
  await create_and_send_notification(
    db,
    settings,
    user_id=completed_report["user_id"],
    notification_type="filter_extraction_completed",
    title="메이크업 필터 분석이 완성됐어요",
    body="추출된 메이크업 룩을 확인하고 AR에 적용해 보세요.",
    data={
      "reportId": str(report_id),
      "route": "ReferenceMakeupExtractionResult",
    },
    dedupe_key=f"filter-extraction:{report_id}:completed",
  )


async def dispatch_filter_extraction_job(
  db: Database,
  background_tasks: BackgroundTasks,
  report_id: UUID,
  user_id: UUID,
  payload: FilterExtractionAnalyzeRequest,
  settings: Settings,
) -> None:
  execution_mode = settings.ai_job_execution_mode_normalized

  if execution_mode == "inline":
    background_tasks.add_task(
      run_filter_extraction_job_background,
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
    result = await asyncio.to_thread(
      publisher.publish_filter_extraction_job,
      report_id,
      user_id,
    )
  except AppError as exc:
    await mark_filter_extraction_failed(db, report_id, payload, exc.message, exc.details)
    raise

  logger.info(
    "[aura:filter-extraction-api] job:queued reportId=%s messageId=%s",
    report_id,
    result.get("messageId"),
  )


@router.post("/jobs")
async def create_filter_extraction_job(
  payload: FilterExtractionJobCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  media = await resolve_owned_source_media(
    db,
    owner_user_id=user["id"],
    media_id=payload.result_media_id,
    photo_capture_id=payload.photo_capture_id,
    required=False,
  )
  request_payload = trusted_media_request_payload(settings, payload.request_payload, media)
  await enforce_report_generation_limit(
    db,
    user_id=user["id"],
    feature="filter_extraction",
    per_minute=settings.filter_extraction_generation_limit_per_minute,
    per_day=settings.filter_extraction_generation_limit_per_day,
  )
  report = await db.fetchrow(
    """
    insert into filter_extraction_reports (
      user_id,
      photo_capture_id,
      result_media_id,
      status,
      title,
      subtitle,
      result_payload
    )
    values ($1, $2, $3, 'pending', $4, $5, $6::jsonb)
    returning *
    """,
    user["id"],
    payload.photo_capture_id,
    payload.result_media_id,
    payload.title,
    payload.subtitle,
    json.dumps({"request": request_payload}),
  )

  projected_report = await project_filter_extraction_report_with_private_media(
    db,
    settings,
    owner_user_id=user["id"],
    report=report,
  )
  return success({"job": projected_report})


@router.post("/analyze")
async def analyze_filter_extraction(
  payload: FilterExtractionAnalyzeRequest,
  background_tasks: BackgroundTasks,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  execution_mode = settings.ai_job_execution_mode_normalized

  if execution_mode not in {"inline", "sqs"}:
    raise AppError(
      500,
      "AI_JOB_EXECUTION_MODE_INVALID",
      "AI_JOB_EXECUTION_MODE must be either inline or sqs.",
      {"executionMode": execution_mode},
    )
  media = await resolve_owned_source_media(
    db,
    owner_user_id=user["id"],
    media_id=payload.result_media_id,
    photo_capture_id=payload.photo_capture_id,
    required=payload.run_ai,
  )
  payload = payload.model_copy(
    update={
      "request_payload": trusted_media_request_payload(
        settings,
        payload.request_payload,
        media,
      ),
    },
  )
  await enforce_report_generation_limit(
    db,
    user_id=user["id"],
    feature="filter_extraction",
    per_minute=settings.filter_extraction_generation_limit_per_minute,
    per_day=settings.filter_extraction_generation_limit_per_day,
  )

  report = await db.fetchrow(
    """
    insert into filter_extraction_reports (
      user_id,
      photo_capture_id,
      result_media_id,
      status,
      title,
      subtitle,
      result_payload
    )
    values ($1, $2, $3, 'pending', $4, $5, $6::jsonb)
    returning *
    """,
    user["id"],
    payload.photo_capture_id,
    payload.result_media_id,
    payload.title,
    payload.subtitle,
    json.dumps(build_filter_extraction_request_state(payload), ensure_ascii=False),
  )

  await dispatch_filter_extraction_job(
    db,
    background_tasks,
    report["id"],
    user["id"],
    payload,
    settings,
  )

  projected_report = await project_filter_extraction_report_with_private_media(
    db,
    settings,
    owner_user_id=user["id"],
    report=report,
  )
  return success({"job": projected_report})


@router.get("")
async def list_filter_extractions(
  limit: int = Query(default=20, ge=1, le=50),
  offset: int = Query(default=0, ge=0),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  reports = await db.fetch(
    """
    select *
    from filter_extraction_reports
    where user_id = $1
      and status = 'completed'
    order by created_at desc
    limit $2 offset $3
    """,
    user["id"],
    limit,
    offset,
  )

  normalized_reports = [
    normalized
    for report in reports
    if (normalized := normalize_filter_extraction_report_row(report)) is not None
  ]
  projected_reports = await project_filter_extraction_reports_with_private_media(
    db,
    settings,
    owner_user_id=user["id"],
    reports=normalized_reports,
  )
  return success(
    {
      "reports": projected_reports,
      "limit": limit,
      "offset": offset,
    },
  )


@router.get("/{report_id}")
async def get_filter_extraction(
  report_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  report = await db.fetchrow(
    """
    select *
    from filter_extraction_reports
    where id = $1 and user_id = $2
    """,
    report_id,
    user["id"],
  )

  if not report:
    from app.core.errors import AppError

    raise AppError(404, "FILTER_EXTRACTION_NOT_FOUND", "Filter extraction report was not found.")

  projected_report = await project_filter_extraction_report_with_private_media(
    db,
    settings,
    owner_user_id=user["id"],
    report=report,
  )
  return success({"report": projected_report})


@router.delete("/{report_id}")
async def delete_filter_extraction(
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

  async def delete_and_queue(connection) -> tuple[list[UUID], int]:
    report = await connection.fetchrow(
      """
      select id
      from filter_extraction_reports
      where id = $1 and user_id = $2
      for update
      """,
      report_id,
      user["id"],
    )
    if report is None:
      raise AppError(404, "FILTER_EXTRACTION_NOT_FOUND", "Filter extraction report was not found.")

    media_rows = await connection.fetch(
      """
      select distinct
        media.id as media_asset_id,
        media.bucket,
        media.object_key
      from filter_extraction_reports report
      left join photo_captures capture on capture.id = report.photo_capture_id
      cross join lateral (
        values (report.result_media_id), (capture.media_id)
      ) as candidate(media_id)
      join media_assets media on media.id = candidate.media_id
      where report.id = $1
        and report.user_id = $2
        and media.owner_user_id = $2
        and media.deleted_at is null
        and media.bucket is not null
        and media.object_key is not null
      """,
      report_id,
      user["id"],
    )

    await connection.execute(
      """
      delete from filter_extraction_reports
      where id = $1 and user_id = $2
      """,
      report_id,
      user["id"],
    )

    refs = [
      MediaObjectRef(
        bucket=str(row["bucket"]),
        object_key=str(row["object_key"]),
        media_asset_id=row["media_asset_id"],
      )
      for row in media_rows
    ]
    return await enqueue_unreferenced_report_media_deletions(
      connection,
      report_id=report_id,
      refs=refs,
      reason="filter_extraction_report_deleted",
    )

  outbox_ids, skipped_referenced_count = await db.run_in_transaction(delete_and_queue)
  if outbox_ids:
    background_tasks.add_task(
      process_media_deletion_outbox_items,
      db,
      settings,
      outbox_ids,
    )

  return success({
    "deleted": True,
    "outboxCount": len(outbox_ids),
    "reportId": str(report_id),
    "skippedReferencedCount": skipped_referenced_count,
  })
