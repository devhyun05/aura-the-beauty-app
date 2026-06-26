import json

from fastapi import APIRouter, Depends

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, require_database
from app.schemas.media import CompleteUploadRequest, PhotoCaptureCreate, PresignedUploadRequest
from app.services.s3 import S3Service
from app.services.users import ensure_user


router = APIRouter(tags=["media"])


@router.post("/media/presigned-upload")
async def create_presigned_upload(
  payload: PresignedUploadRequest,
  _: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
) -> dict:
  presigned = S3Service(settings).create_presigned_upload(
    media_kind=payload.media_kind,
    content_type=payload.content_type,
    original_filename=payload.original_filename,
  )

  return success({"upload": presigned})


@router.post("/media/complete-upload")
async def complete_upload(
  payload: CompleteUploadRequest,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  media = await db.fetchrow(
    """
    insert into media_assets (
      owner_user_id,
      media_kind,
      source,
      bucket,
      object_key,
      cdn_url,
      content_type,
      byte_size,
      width,
      height,
      checksum_sha256,
      original_filename
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    returning *
    """,
    user["id"],
    payload.media_kind,
    payload.source,
    payload.bucket,
    payload.object_key,
    payload.cdn_url,
    payload.content_type,
    payload.byte_size,
    payload.width,
    payload.height,
    payload.checksum_sha256,
    payload.original_filename,
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
    values ($1, $2, $3, $4, $5::jsonb)
    returning *
    """,
    user["id"],
    payload.media_id,
    payload.capture_type,
    payload.source,
    json.dumps(payload.device_payload),
  )

  return success({"photoCapture": capture})
