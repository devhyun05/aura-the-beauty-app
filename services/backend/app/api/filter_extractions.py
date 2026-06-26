import json
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.db.session import Database, require_database
from app.schemas.analysis import FilterExtractionJobCreate
from app.services.users import ensure_user


router = APIRouter(prefix="/filter-extractions", tags=["filter-extractions"])


@router.post("/jobs")
async def create_filter_extraction_job(
  payload: FilterExtractionJobCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
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
    json.dumps({"request": payload.request_payload}),
  )

  return success({"job": report})


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

  return success({"report": report})
