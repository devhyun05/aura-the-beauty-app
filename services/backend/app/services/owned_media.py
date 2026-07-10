from typing import Any
from uuid import UUID

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.services.s3 import S3Service


CLIENT_MEDIA_LOCATION_FIELDS = frozenset(
  {
    "bucket",
    "cdnUrl",
    "cdn_url",
    "contentType",
    "content_type",
    "height",
    "imageUrl",
    "image_url",
    "mediaId",
    "media_id",
    "objectKey",
    "object_key",
    "previewUrl",
    "preview_url",
    "sourceUri",
    "source_uri",
    "sourceUrl",
    "source_url",
    "width",
  },
)


async def require_owned_media(
  db: Database,
  *,
  media_id: UUID,
  owner_user_id: UUID,
) -> dict[str, Any]:
  media = await db.fetchrow(
    """
    select id, bucket, object_key, cdn_url, content_type, width, height
    from media_assets
    where id = $1
      and owner_user_id = $2
      and status = 'active'
      and deleted_at is null
    """,
    media_id,
    owner_user_id,
  )
  if media is None:
    raise AppError(404, "MEDIA_NOT_FOUND", "The media asset was not found for this user.")
  return dict(media)


async def require_owned_capture_media(
  db: Database,
  *,
  photo_capture_id: UUID,
  owner_user_id: UUID,
) -> dict[str, Any]:
  media = await db.fetchrow(
    """
    select media.id, media.bucket, media.object_key, media.cdn_url,
      media.content_type, media.width, media.height
    from photo_captures capture
    join media_assets media on media.id = capture.media_id
    where capture.id = $1
      and capture.user_id = $2
      and media.owner_user_id = $2
      and media.status = 'active'
      and media.deleted_at is null
    """,
    photo_capture_id,
    owner_user_id,
  )
  if media is None:
    raise AppError(404, "PHOTO_CAPTURE_NOT_FOUND", "The photo capture was not found for this user.")
  return dict(media)


async def resolve_owned_source_media(
  db: Database,
  *,
  owner_user_id: UUID,
  media_id: UUID | None,
  photo_capture_id: UUID | None,
  required: bool,
) -> dict[str, Any] | None:
  direct_media = None
  capture_media = None

  if media_id is not None:
    direct_media = await require_owned_media(
      db,
      media_id=media_id,
      owner_user_id=owner_user_id,
    )

  if photo_capture_id is not None:
    capture_media = await require_owned_capture_media(
      db,
      photo_capture_id=photo_capture_id,
      owner_user_id=owner_user_id,
    )

  if direct_media is not None and capture_media is not None:
    if direct_media["id"] != capture_media["id"]:
      raise AppError(
        409,
        "MEDIA_CAPTURE_MISMATCH",
        "The media asset does not match the supplied photo capture.",
      )

  media = direct_media or capture_media
  if required and media is None:
    raise AppError(
      400,
      "SOURCE_MEDIA_REQUIRED",
      "A server-registered media asset is required for AI processing.",
    )
  return media


def trusted_media_request_payload(
  settings: Settings,
  request_payload: dict[str, Any] | None,
  media: dict[str, Any] | None,
) -> dict[str, Any]:
  trusted_payload = {
    key: value
    for key, value in dict(request_payload or {}).items()
    if key not in CLIENT_MEDIA_LOCATION_FIELDS
  }
  if media is None:
    return trusted_payload

  S3Service(settings).assert_managed_media_location(
    bucket=str(media["bucket"]),
    object_key=str(media["object_key"]),
  )
  trusted_payload.update(
    {
      "mediaId": str(media["id"]),
      "bucket": media["bucket"],
      "objectKey": media["object_key"],
      "cdnUrl": media.get("cdn_url"),
      "contentType": media.get("content_type"),
      "width": media.get("width"),
      "height": media.get("height"),
    },
  )
  return trusted_payload
