from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, require_database
from app.schemas.report_exports import LongImageExportSessionRequest
from app.services.report_export_sessions import (
  complete_long_image_export_session,
  create_long_image_export_session,
  delete_long_image_export_session,
)
from app.services.s3 import S3Service
from app.services.users import ensure_user


router = APIRouter(tags=["report-exports"])


@router.post("/report-exports/long-image/sessions")
async def create_long_image_session(
  payload: LongImageExportSessionRequest,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  result = await create_long_image_export_session(
    db,
    payload,
    owner_user_id=user["id"],
    s3=S3Service(settings),
  )
  return success(result)


@router.post("/report-exports/long-image/sessions/{session_id}/complete")
async def complete_long_image_session(
  session_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  result = await complete_long_image_export_session(
    db,
    session_id,
    owner_user_id=user["id"],
    s3=S3Service(settings),
  )
  return success(result)


@router.delete("/report-exports/long-image/sessions/{session_id}")
async def delete_long_image_session(
  session_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  deleted = await delete_long_image_export_session(
    db,
    session_id,
    owner_user_id=user["id"],
    s3=S3Service(settings),
  )
  return success({"deleted": deleted})
