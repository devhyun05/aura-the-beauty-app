import json

from fastapi import APIRouter, Depends

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, get_database, require_database
from app.schemas.media import CompleteUploadRequest, PhotoCaptureCreate, PresignedUploadRequest
from app.services.media_uploads import (
  bind_legacy_thumbnail_session,
  complete_upload_session,
  issue_upload_session,
  resolve_legacy_upload_session_id,
)
from app.services.users import ensure_user


router = APIRouter(tags=["media"])


@router.post("/media/presigned-upload")
async def create_presigned_upload(
  payload: PresignedUploadRequest,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(get_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  if not settings.s3_bucket_name:
    raise AppError(503, "S3_NOT_CONFIGURED", "S3_BUCKET_NAME is required for uploads.")
  db = await require_database(db)
  user = await ensure_user(db, auth)
  upload = await issue_upload_session(
    db,
    settings,
    payload,
    owner_user_id=user["id"],
  )
  return success({"upload": upload})


@router.post("/media/complete-upload")
async def complete_upload(
  payload: CompleteUploadRequest,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  upload_id = payload.upload_id
  if upload_id is None:
    upload_id = await resolve_legacy_upload_session_id(
      db,
      settings,
      bucket=payload.bucket or "",
      object_key=payload.object_key or "",
      owner_user_id=user["id"],
    )
    if payload.thumbnail_bucket and payload.thumbnail_object_key:
      await bind_legacy_thumbnail_session(
        db,
        settings,
        upload_id,
        thumbnail_bucket=payload.thumbnail_bucket,
        thumbnail_object_key=payload.thumbnail_object_key,
        owner_user_id=user["id"],
      )
  media = await complete_upload_session(
    db,
    settings,
    upload_id,
    owner_user_id=user["id"],
  )
  return success({"media": media})


@router.post("/photo-captures")
async def create_photo_capture(
  payload: PhotoCaptureCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  capture = await db.fetchrow(
    """
    insert into photo_captures (user_id, media_id, capture_type, source, device_payload)
    select $1, media.id, $3, $4, $5::jsonb
    from media_assets media
    where media.id = $2
      and media.owner_user_id = $1
      and media.status = 'active'
      and media.deleted_at is null
    returning *
    """,
    user["id"],
    payload.media_id,
    payload.capture_type,
    payload.source,
    json.dumps(payload.device_payload),
  )
  if capture is None:
    raise AppError(404, "MEDIA_NOT_FOUND", "The media asset was not found for this user.")

  return success({"photoCapture": capture})
