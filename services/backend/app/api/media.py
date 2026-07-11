import json
import logging

from fastapi import APIRouter, BackgroundTasks, Depends

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, get_database, require_database
from app.schemas.media import CompleteUploadRequest, PhotoCaptureCreate, PresignedUploadRequest
from app.services.media_thumbnail_metadata import (
  ThumbnailMetadata,
  expected_postprocessed_thumbnail_metadata,
  resolve_postprocessed_thumbnail_metadata,
)
from app.services.media_uploads import (
  bind_legacy_thumbnail_session,
  complete_upload_session,
  issue_upload_session,
  resolve_legacy_upload_session_id,
)
from app.services.s3 import S3Service
from app.services.users import ensure_user


router = APIRouter(tags=["media"])
logger = logging.getLogger(__name__)
BACKGROUND_THUMBNAIL_RETRY_DELAYS_SECONDS = (1.0, 2.0, 4.0, 8.0)


async def update_media_thumbnail_metadata(
  db: Database,
  media_id: object,
  thumbnail: ThumbnailMetadata,
) -> dict | None:
  return await db.fetchrow(
    """
    update media_assets
    set thumbnail_bucket = $2,
        thumbnail_object_key = $3,
        thumbnail_cdn_url = $4,
        thumbnail_content_type = $5,
        thumbnail_byte_size = $6,
        thumbnail_width = $7,
        thumbnail_height = $8
    where id = $1
      and deleted_at is null
    returning *
    """,
    media_id,
    thumbnail.bucket,
    thumbnail.object_key,
    thumbnail.cdn_url,
    thumbnail.content_type,
    thumbnail.byte_size,
    thumbnail.width,
    thumbnail.height,
  )


async def refresh_postprocessed_thumbnail_metadata(
  db: Database,
  settings: Settings,
  *,
  media_id: object,
  bucket: str,
  object_key: str,
) -> None:
  thumbnail = await resolve_postprocessed_thumbnail_metadata(
    S3Service(settings).client(),
    bucket=bucket,
    source_object_key=object_key,
    cdn_base_url=settings.effective_cdn_base_url,
    retry_delays_seconds=BACKGROUND_THUMBNAIL_RETRY_DELAYS_SECONDS,
  )

  if thumbnail is None:
    logger.info(
      "[aura:media-api] thumbnail:background-missing mediaId=%s key=%s",
      media_id,
      object_key,
    )
    return

  await update_media_thumbnail_metadata(db, media_id, thumbnail)
  logger.info(
    "[aura:media-api] thumbnail:background-updated mediaId=%s thumbnailKey=%s",
    media_id,
    thumbnail.object_key,
  )


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
  background_tasks: BackgroundTasks,
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

  if not media.get("thumbnail_object_key"):
    source_bucket = str(media["bucket"])
    source_object_key = str(media["object_key"])
    should_refresh_thumbnail = False
    thumbnail = await resolve_postprocessed_thumbnail_metadata(
      S3Service(settings).client(),
      bucket=source_bucket,
      source_object_key=source_object_key,
      cdn_base_url=settings.effective_cdn_base_url,
    )

    if thumbnail is None:
      thumbnail = expected_postprocessed_thumbnail_metadata(
        bucket=source_bucket,
        source_object_key=source_object_key,
        cdn_base_url=settings.effective_cdn_base_url,
      )
      should_refresh_thumbnail = thumbnail is not None

    if thumbnail is not None:
      media = await update_media_thumbnail_metadata(db, media["id"], thumbnail) or media

    if should_refresh_thumbnail:
      background_tasks.add_task(
        refresh_postprocessed_thumbnail_metadata,
        db,
        settings,
        media_id=media["id"],
        bucket=source_bucket,
        object_key=source_object_key,
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
