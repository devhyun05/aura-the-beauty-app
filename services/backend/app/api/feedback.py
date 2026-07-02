import json
import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, require_database
from app.schemas.analysis import FeedbackJobCreate
from app.services.makeup_feedback_analysis import (
  MODEL_VERSION,
  build_makeup_feedback_result_for_request,
)
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


def build_feedback_payload(payload: FeedbackJobCreate, request_payload: dict[str, Any]) -> dict:
  return {"request": request_payload or payload.request_payload}


async def resolve_feedback_request_payload(
  db: Database,
  user_id: UUID,
  payload: FeedbackJobCreate,
) -> dict[str, Any]:
  request_payload = dict(payload.request_payload or {})
  request_payload.setdefault("source", payload.source)
  request_payload.setdefault("sourceLabel", payload.source_label)

  media = None

  if payload.uploaded_media_id:
    media = await db.fetchrow(
      """
      select id, bucket, object_key, cdn_url, content_type, width, height
      from media_assets
      where id = $1 and owner_user_id = $2
      """,
      payload.uploaded_media_id,
      user_id,
    )

  if media is None and payload.photo_capture_id:
    media = await db.fetchrow(
      """
      select m.id, m.bucket, m.object_key, m.cdn_url, m.content_type, m.width, m.height
      from photo_captures pc
      join media_assets m on m.id = pc.media_id
      where pc.id = $1 and pc.user_id = $2
      """,
      payload.photo_capture_id,
      user_id,
    )

  if media:
    request_payload.update(
      {
        "mediaId": str(media["id"]),
        "bucket": media["bucket"],
        "objectKey": media["object_key"],
        "cdnUrl": media["cdn_url"],
        "contentType": media["content_type"],
        "width": media["width"],
        "height": media["height"],
      },
    )

  return request_payload


@router.post("/jobs")
async def create_feedback_job(
  payload: FeedbackJobCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  request_payload = await resolve_feedback_request_payload(db, user["id"], payload)
  logger.info(
    "[aura:feedback-api] job:create-start userSub=%s runImmediately=%s source=%s",
    auth.subject,
    payload.run_immediately,
    payload.source,
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

  if not payload.run_immediately:
    return success({"job": normalize_feedback_report_row(report)})

  await db.execute(
    "update makeup_feedback_reports set status = 'processing' where id = $1",
    report["id"],
  )

  result, analysis_status, analysis_error = await build_makeup_feedback_result_for_request(
    request_payload,
    settings,
  )
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
    report["id"],
    score,
    result.get("modelVersion") or MODEL_VERSION,
    json.dumps(completed_payload, ensure_ascii=False),
  )

  logger.info(
    "[aura:feedback-api] job:completed reportId=%s analysisStatus=%s score=%s",
    report["id"],
    analysis_status,
    score,
  )

  return success({"job": normalize_feedback_report_row(completed_report)})


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