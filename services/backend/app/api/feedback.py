import asyncio
import json
import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, database, require_database
from app.schemas.analysis import (
  FeedbackConferenceMessagesCreate,
  FeedbackConferencePreviewCreate,
  FeedbackJobCreate,
)
from app.services.ai_job_queue import AIJobQueuePublisher
from app.services.makeup_feedback_analysis import (
  MODEL_VERSION,
  build_makeup_feedback_result_for_request,
)
from app.services.makeup_feedback_conference import build_makeup_feedback_conference_messages
from app.services.makeup_feedback_conference_preview import (
  build_makeup_feedback_conference_preview,
)
from app.services.makeup_feedback_goal_intent import normalize_feedback_goal_context_for_request
from app.services.owned_media import resolve_owned_source_media, trusted_media_request_payload
from app.services.users import ensure_user


router = APIRouter(prefix="/feedback", tags=["feedback"])
logger = logging.getLogger(__name__)


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


def normalize_feedback_report_row(row: dict | None) -> dict | None:
  if row is None:
    return None

  normalized = dict(row)
  normalized["feedback_payload"] = decode_json_object(normalized.get("feedback_payload"))

  return normalized


def normalize_feedback_report_rows(rows: list[dict]) -> list[dict]:
  return [
    normalized
    for row in rows
    if (normalized := normalize_feedback_report_row(row)) is not None
  ]


async def get_owned_feedback_report(
  db: Database,
  *,
  report_id: UUID,
  user_id: UUID,
) -> dict[str, Any]:
  report = await db.fetchrow(
    """
    select *
    from makeup_feedback_reports
    where id = $1 and user_id = $2
    """,
    report_id,
    user_id,
  )
  if report is None:
    raise AppError(404, "FEEDBACK_REPORT_NOT_FOUND", "Feedback report was not found.")

  return normalize_feedback_report_row(report) or {}


def feedback_report_context(report: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any] | None]:
  feedback_payload = decode_json_object(report.get("feedback_payload"))
  request_payload = decode_json_object(feedback_payload.get("request"))
  raw_result = feedback_payload.get("result")
  result = dict(raw_result) if isinstance(raw_result, dict) else None
  return request_payload, result


def build_feedback_payload(payload: FeedbackJobCreate, request_payload: dict[str, Any]) -> dict:
  return {"request": request_payload or payload.request_payload}


def clean_optional_text(value: Any) -> str | None:
  if isinstance(value, str):
    normalized = value.strip()
    return normalized or None

  return None


def merge_profile_feedback_context(request_payload: dict[str, Any], user: dict[str, Any]) -> None:
  raw_context = request_payload.get("feedbackContext") or request_payload.get("feedback_context")
  feedback_context = dict(raw_context) if isinstance(raw_context, dict) else {}
  top_level_goal_text = clean_optional_text(
    request_payload.get("userGoalText") or request_payload.get("user_goal_text"),
  )

  if top_level_goal_text and not clean_optional_text(
    feedback_context.get("userGoalText") or feedback_context.get("user_goal_text"),
  ):
    feedback_context["userGoalText"] = top_level_goal_text

  if not clean_optional_text(
    feedback_context.get("profileGender") or feedback_context.get("profile_gender"),
  ):
    feedback_context["profileGender"] = clean_optional_text(user.get("gender"))

  request_payload["feedbackContext"] = feedback_context


async def resolve_feedback_request_payload(
  db: Database,
  user: dict[str, Any],
  payload: FeedbackJobCreate,
  settings: Settings,
) -> dict[str, Any]:
  user_id = user["id"]
  media = await resolve_owned_source_media(
    db,
    owner_user_id=user_id,
    media_id=payload.uploaded_media_id,
    photo_capture_id=payload.photo_capture_id,
    required=payload.run_immediately,
  )
  request_payload = trusted_media_request_payload(settings, payload.request_payload, media)
  request_payload.setdefault("source", payload.source)
  request_payload.setdefault("sourceLabel", payload.source_label)

  merge_profile_feedback_context(request_payload, user)
  await normalize_feedback_goal_context_for_request(request_payload, settings)

  return request_payload


async def mark_feedback_failed(
  db: Database,
  report_id: UUID,
  request_payload: dict[str, Any],
  message: str,
  details: dict[str, Any] | None = None,
) -> None:
  await db.execute(
    """
    update makeup_feedback_reports
    set status = 'failed',
        completed_at = now(),
        feedback_payload = $2::jsonb
    where id = $1
    """,
    report_id,
    json.dumps(
      {
        "request": request_payload,
        "error": {"message": message, "details": details or {}},
      },
      ensure_ascii=False,
    ),
  )


async def run_feedback_job_background(
  report_id: UUID,
  request_payload: dict[str, Any],
  settings: Settings,
  *,
  db: Database = database,
) -> None:
  logger.info("[aura:feedback-api] background:start reportId=%s", report_id)
  await db.execute(
    "update makeup_feedback_reports set status = 'processing' where id = $1",
    report_id,
  )

  try:
    result, analysis_status, analysis_error = await build_makeup_feedback_result_for_request(
      request_payload,
      settings,
    )
  except AppError as exc:
    logger.warning(
      "[aura:feedback-api] background:app-error reportId=%s code=%s details=%s",
      report_id,
      exc.code,
      exc.details,
    )
    await mark_feedback_failed(db, report_id, request_payload, exc.message, exc.details)
    return
  except Exception as exc:
    message = "Makeup feedback analysis failed."
    details = {"reason": exc.__class__.__name__}
    logger.exception("[aura:feedback-api] background:failed reportId=%s", report_id)
    await mark_feedback_failed(db, report_id, request_payload, message, details)
    return

  score = result.get("score") if isinstance(result.get("score"), int) else None
  completed_payload = {
    "request": request_payload,
    "result": result,
    "analysisStatus": analysis_status,
    "analysisError": analysis_error,
  }
  completed_report = await db.fetchrow(
    """
    update makeup_feedback_reports
    set status = 'completed',
        score = $2,
        model_version = $3,
        completed_at = now(),
        feedback_payload = $4::jsonb
    where id = $1
    returning *
    """,
    report_id,
    score,
    result.get("modelVersion") or MODEL_VERSION,
    json.dumps(completed_payload, ensure_ascii=False),
  )

  if completed_report is None:
    logger.warning("[aura:feedback-api] background:missing-report reportId=%s", report_id)
    return

  logger.info(
    "[aura:feedback-api] background:completed reportId=%s analysisStatus=%s score=%s",
    report_id,
    analysis_status,
    score,
  )


async def dispatch_feedback_job(
  db: Database,
  background_tasks: BackgroundTasks,
  report_id: UUID,
  user_id: UUID,
  request_payload: dict[str, Any],
  settings: Settings,
) -> None:
  execution_mode = settings.ai_job_execution_mode_normalized

  if execution_mode == "inline":
    background_tasks.add_task(
      run_feedback_job_background,
      report_id,
      request_payload,
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
    result = await asyncio.to_thread(publisher.publish_feedback_job, report_id, user_id)
  except AppError as exc:
    await mark_feedback_failed(db, report_id, request_payload, exc.message, exc.details)
    raise

  logger.info(
    "[aura:feedback-api] job:queued reportId=%s messageId=%s",
    report_id,
    result.get("messageId"),
  )


@router.post("/jobs")
async def create_feedback_job(
  payload: FeedbackJobCreate,
  background_tasks: BackgroundTasks,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  execution_mode = settings.ai_job_execution_mode_normalized

  if payload.run_immediately and execution_mode not in {"inline", "sqs"}:
    raise AppError(
      500,
      "AI_JOB_EXECUTION_MODE_INVALID",
      "AI_JOB_EXECUTION_MODE must be either inline or sqs.",
      {"executionMode": execution_mode},
    )

  request_payload = await resolve_feedback_request_payload(db, user, payload, settings)
  logger.info(
    "[aura:feedback-api] job:create-start userSub=%s runImmediately=%s source=%s executionMode=%s",
    auth.subject,
    payload.run_immediately,
    payload.source,
    execution_mode,
  )
  report = await db.fetchrow(
    """
    insert into makeup_feedback_reports (
      user_id,
      photo_capture_id,
      uploaded_media_id,
      source,
      source_label,
      status,
      feedback_payload
    )
    values ($1, $2, $3, $4, $5, 'pending', $6::jsonb)
    returning *
    """,
    user["id"],
    payload.photo_capture_id,
    payload.uploaded_media_id,
    payload.source,
    payload.source_label,
    json.dumps(build_feedback_payload(payload, request_payload), ensure_ascii=False),
  )

  if payload.run_immediately:
    await dispatch_feedback_job(
      db,
      background_tasks,
      report["id"],
      user["id"],
      request_payload,
      settings,
    )

  return success({"job": normalize_feedback_report_row(report)})


@router.post("/conference-preview-messages")
async def create_feedback_conference_preview_messages(
  payload: FeedbackConferencePreviewCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  request_payload = payload.request_payload
  if payload.report_id is not None:
    user = await ensure_user(db, auth)
    report = await get_owned_feedback_report(db, report_id=payload.report_id, user_id=user["id"])
    stored_request, _ = feedback_report_context(report)
    request_payload = stored_request
    if payload.request_payload.get("conversationSeed"):
      request_payload["conversationSeed"] = payload.request_payload["conversationSeed"]

  (
    messages,
    summary,
    last_speaker,
    generation_status,
    generation_error,
  ) = await build_makeup_feedback_conference_preview(
    request_payload,
    settings,
  )
  logger.info(
    "[aura:feedback-api] conference-preview:completed userSub=%s status=%s count=%s",
    auth.subject,
    generation_status,
    len(messages),
  )

  return success(
    {
      "messages": messages,
      "summary": summary,
      "lastSpeaker": last_speaker,
      "generationStatus": generation_status,
      "generationError": generation_error,
    },
  )


@router.post("/conference-messages")
async def create_feedback_conference_messages(
  payload: FeedbackConferenceMessagesCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  result = payload.result
  request_payload = payload.request_payload
  if payload.report_id is not None:
    user = await ensure_user(db, auth)
    report = await get_owned_feedback_report(db, report_id=payload.report_id, user_id=user["id"])
    stored_request, stored_result = feedback_report_context(report)
    if stored_result is None:
      raise AppError(
        409,
        "FEEDBACK_REPORT_NOT_COMPLETED",
        "Feedback report analysis has not completed yet.",
      )
    request_payload = stored_request
    result = stored_result

  messages, generation_status, generation_error = await build_makeup_feedback_conference_messages(
    result,
    request_payload,
    settings,
    preview_context=payload.preview_context,
  )
  logger.info(
    "[aura:feedback-api] conference-messages:completed userSub=%s status=%s count=%s",
    auth.subject,
    generation_status,
    len(messages),
  )

  return success(
    {
      "messages": messages,
      "generationStatus": generation_status,
      "generationError": generation_error,
    },
  )


@router.get("/reports")
async def list_feedback_reports(
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  reports = await db.fetch(
    """
    select *
    from makeup_feedback_reports
    where user_id = $1
      and status = 'completed'
      and score is not null
    order by created_at desc
    """,
    user["id"],
  )

  return success({"reports": normalize_feedback_report_rows(reports)})


@router.get("/reports/{report_id}")
async def get_feedback_report(
  report_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  report = await db.fetchrow(
    """
    select *
    from makeup_feedback_reports
    where id = $1 and user_id = $2
    """,
    report_id,
    user["id"],
  )

  if not report:
    raise AppError(404, "FEEDBACK_REPORT_NOT_FOUND", "Feedback report was not found.")

  return success({"report": normalize_feedback_report_row(report)})
