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
from app.services.push_notifications import create_and_send_notification
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

  return success({"job": normalize_filter_extraction_report_row(report)})


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

  return success({"job": normalize_filter_extraction_report_row(report)})


@router.get("")
async def list_filter_extractions(
  limit: int = Query(default=20, ge=1, le=50),
  offset: int = Query(default=0, ge=0),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
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

  return success(
    {
      "reports": [
        normalized
        for report in reports
        if (normalized := normalize_filter_extraction_report_row(report)) is not None
      ],
      "limit": limit,
      "offset": offset,
    },
  )


@router.get("/{report_id}")
async def get_filter_extraction(
  report_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
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

  return success({"report": normalize_filter_extraction_report_row(report)})
