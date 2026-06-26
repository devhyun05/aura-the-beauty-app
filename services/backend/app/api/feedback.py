import json

from fastapi import APIRouter, Depends

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.db.session import Database, require_database
from app.schemas.analysis import FeedbackJobCreate
from app.services.users import ensure_user


router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("/jobs")
async def create_feedback_job(
  payload: FeedbackJobCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
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
    json.dumps({"request": payload.request_payload}),
  )

  return success({"job": report})


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

  return success({"reports": reports})
