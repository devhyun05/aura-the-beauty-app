import asyncio
from typing import Any
from uuid import UUID, uuid4

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.schemas.media import MAX_MEDIA_UPLOAD_BYTES, PresignedUploadRequest
from app.services.s3 import S3Service


UPLOAD_SESSION_TTL_SECONDS = 900


def _require_principal(owner_user_id: UUID | None, partner_account_id: UUID | None) -> None:
  if (owner_user_id is None) == (partner_account_id is None):
    raise ValueError("Exactly one upload principal is required.")


def _normalized_content_type(value: str) -> str:
  return value.split(";", 1)[0].strip().lower()


def _validate_uploaded_object(
  *,
  actual: dict[str, str | int],
  expected_byte_size: int | None,
  expected_content_type: str,
) -> None:
  actual_byte_size = int(actual["byte_size"])
  if actual_byte_size <= 0 or actual_byte_size > MAX_MEDIA_UPLOAD_BYTES:
    raise AppError(413, "UPLOAD_SIZE_INVALID", "The uploaded object size is not allowed.")
  if expected_byte_size is not None and actual_byte_size != expected_byte_size:
    raise AppError(409, "UPLOAD_SIZE_MISMATCH", "The uploaded object size does not match the upload session.")
  if _normalized_content_type(str(actual["content_type"])) != _normalized_content_type(expected_content_type):
    raise AppError(409, "UPLOAD_CONTENT_TYPE_MISMATCH", "The uploaded object type does not match the upload session.")


async def _completed_upload_media(
  db: Database,
  upload_id: UUID,
  *,
  owner_user_id: UUID | None,
  partner_account_id: UUID | None,
) -> dict[str, Any] | None:
  return await db.fetchrow(
    """
    select media.*
    from media_upload_sessions upload
    join media_assets media on media.id = upload.media_asset_id
    where upload.id = $1
      and (
        ($2::uuid is not null and upload.owner_user_id = $2 and upload.partner_account_id is null)
        or ($3::uuid is not null and upload.partner_account_id = $3 and upload.owner_user_id is null)
      )
      and upload.status = 'completed'
      and media.deleted_at is null
    limit 1
    """,
    upload_id,
    owner_user_id,
    partner_account_id,
  )


async def issue_upload_session(
  db: Database,
  settings: Settings,
  payload: PresignedUploadRequest,
  *,
  owner_user_id: UUID | None = None,
  partner_account_id: UUID | None = None,
  s3_service: S3Service | None = None,
) -> dict[str, Any]:
  _require_principal(owner_user_id, partner_account_id)
  s3 = s3_service or S3Service(settings)
  upload_id = uuid4()
  upload = s3.create_presigned_upload(
    media_kind=payload.media_kind,
    content_type=payload.content_type,
    original_filename=payload.original_filename,
    expires_in=UPLOAD_SESSION_TTL_SECONDS,
  )

  thumbnail_upload = None
  if payload.thumbnail is not None:
    thumbnail_upload = s3.create_presigned_upload(
      media_kind=f"{payload.media_kind}-thumbnail",
      content_type=payload.thumbnail.content_type,
      original_filename=payload.thumbnail.original_filename,
      expires_in=UPLOAD_SESSION_TTL_SECONDS,
    )

  session = await db.fetchrow(
    """
    insert into media_upload_sessions (
      id,
      owner_user_id,
      partner_account_id,
      media_kind,
      source,
      bucket,
      object_key,
      cdn_url,
      content_type,
      expected_byte_size,
      width,
      height,
      original_filename,
      thumbnail_bucket,
      thumbnail_object_key,
      thumbnail_cdn_url,
      thumbnail_content_type,
      thumbnail_expected_byte_size,
      thumbnail_width,
      thumbnail_height,
      status,
      expires_at
    )
    values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
      $14, $15, $16, $17, $18, $19, $20,
      'pending',
      now() + ($21::int * interval '1 second')
    )
    returning id
    """,
    upload_id,
    owner_user_id,
    partner_account_id,
    payload.media_kind,
    payload.source,
    upload["bucket"],
    upload["object_key"],
    upload["cdn_url"],
    payload.content_type,
    payload.byte_size,
    payload.width,
    payload.height,
    payload.original_filename,
    thumbnail_upload["bucket"] if thumbnail_upload else None,
    thumbnail_upload["object_key"] if thumbnail_upload else None,
    thumbnail_upload["cdn_url"] if thumbnail_upload else None,
    payload.thumbnail.content_type if payload.thumbnail else None,
    payload.thumbnail.byte_size if payload.thumbnail else None,
    payload.thumbnail.width if payload.thumbnail else None,
    payload.thumbnail.height if payload.thumbnail else None,
    UPLOAD_SESSION_TTL_SECONDS,
  )
  if session is None:
    raise AppError(503, "UPLOAD_SESSION_CREATE_FAILED", "The upload session could not be created.")

  result = dict(upload)
  result["upload_id"] = upload_id
  result["thumbnail_upload"] = thumbnail_upload
  return result


async def resolve_legacy_upload_session_id(
  db: Database,
  settings: Settings,
  *,
  bucket: str,
  object_key: str,
  owner_user_id: UUID | None = None,
  partner_account_id: UUID | None = None,
  s3_service: S3Service | None = None,
) -> UUID:
  _require_principal(owner_user_id, partner_account_id)
  s3 = s3_service or S3Service(settings)
  s3.assert_managed_media_location(bucket=bucket, object_key=object_key)
  session = await db.fetchrow(
    """
    select id
    from media_upload_sessions
    where bucket = $1
      and object_key = $2
      and (
        ($3::uuid is not null and owner_user_id = $3 and partner_account_id is null)
        or ($4::uuid is not null and partner_account_id = $4 and owner_user_id is null)
      )
      and (
        (status = 'pending' and expires_at > now())
        or (status = 'completed' and media_asset_id is not null)
      )
    limit 1
    """,
    bucket,
    object_key,
    owner_user_id,
    partner_account_id,
  )
  if session is None:
    raise AppError(409, "UPLOAD_SESSION_INVALID", "No server-issued upload session matches this object.")
  return UUID(str(session["id"]))


async def bind_legacy_thumbnail_session(
  db: Database,
  settings: Settings,
  upload_id: UUID,
  *,
  thumbnail_bucket: str,
  thumbnail_object_key: str,
  owner_user_id: UUID | None = None,
  partner_account_id: UUID | None = None,
  s3_service: S3Service | None = None,
) -> None:
  _require_principal(owner_user_id, partner_account_id)
  s3 = s3_service or S3Service(settings)
  s3.assert_managed_media_location(bucket=thumbnail_bucket, object_key=thumbnail_object_key)
  current = await db.fetchrow(
    """
    select thumbnail_bucket, thumbnail_object_key
    from media_upload_sessions
    where id = $1
      and (
        ($2::uuid is not null and owner_user_id = $2 and partner_account_id is null)
        or ($3::uuid is not null and partner_account_id = $3 and owner_user_id is null)
      )
    limit 1
    """,
    upload_id,
    owner_user_id,
    partner_account_id,
  )
  if current is None:
    raise AppError(409, "UPLOAD_SESSION_INVALID", "The primary upload session is invalid.")
  if current.get("thumbnail_bucket") or current.get("thumbnail_object_key"):
    if (
      current.get("thumbnail_bucket") == thumbnail_bucket
      and current.get("thumbnail_object_key") == thumbnail_object_key
    ):
      return
    raise AppError(409, "UPLOAD_THUMBNAIL_CONFLICT", "A different thumbnail is already bound to this upload.")

  bound = await db.fetchrow(
    """
    with bound as (
      update media_upload_sessions primary_upload
      set thumbnail_bucket = thumbnail_upload.bucket,
          thumbnail_object_key = thumbnail_upload.object_key,
          thumbnail_cdn_url = thumbnail_upload.cdn_url,
          thumbnail_content_type = thumbnail_upload.content_type,
          thumbnail_expected_byte_size = thumbnail_upload.expected_byte_size,
          thumbnail_width = thumbnail_upload.width,
          thumbnail_height = thumbnail_upload.height
      from media_upload_sessions thumbnail_upload
      where primary_upload.id = $1
        and (
          ($2::uuid is not null and primary_upload.owner_user_id = $2 and primary_upload.partner_account_id is null)
          or ($3::uuid is not null and primary_upload.partner_account_id = $3 and primary_upload.owner_user_id is null)
        )
        and primary_upload.media_kind = 'community-thread'
        and primary_upload.status = 'pending'
        and primary_upload.expires_at > now()
        and thumbnail_upload.bucket = $4
        and thumbnail_upload.object_key = $5
        and (
          ($2::uuid is not null and thumbnail_upload.owner_user_id = $2 and thumbnail_upload.partner_account_id is null)
          or ($3::uuid is not null and thumbnail_upload.partner_account_id = $3 and thumbnail_upload.owner_user_id is null)
        )
        and thumbnail_upload.media_kind = 'community-thread-thumbnail'
        and thumbnail_upload.status = 'pending'
        and thumbnail_upload.expires_at > now()
      returning thumbnail_upload.id
    )
    update media_upload_sessions thumbnail_upload
    set status = 'completed', completed_at = now()
    from bound
    where thumbnail_upload.id = bound.id
    returning thumbnail_upload.id
    """,
    upload_id,
    owner_user_id,
    partner_account_id,
    thumbnail_bucket,
    thumbnail_object_key,
  )
  if bound is None:
    raise AppError(409, "UPLOAD_SESSION_INVALID", "The thumbnail upload session is invalid or expired.")


async def complete_upload_session(
  db: Database,
  settings: Settings,
  upload_id: UUID,
  *,
  owner_user_id: UUID | None = None,
  partner_account_id: UUID | None = None,
  s3_service: S3Service | None = None,
) -> dict[str, Any]:
  _require_principal(owner_user_id, partner_account_id)
  session = await db.fetchrow(
    """
    select *, expires_at > now() as is_active
    from media_upload_sessions
    where id = $1
      and (
        ($2::uuid is not null and owner_user_id = $2 and partner_account_id is null)
        or ($3::uuid is not null and partner_account_id = $3 and owner_user_id is null)
      )
    limit 1
    """,
    upload_id,
    owner_user_id,
    partner_account_id,
  )
  if session is None:
    raise AppError(409, "UPLOAD_SESSION_INVALID", "The upload session is invalid, expired, or already completed.")
  if session["status"] == "completed":
    completed_media = await _completed_upload_media(
      db,
      upload_id,
      owner_user_id=owner_user_id,
      partner_account_id=partner_account_id,
    )
    if completed_media is not None:
      return completed_media
    raise AppError(409, "UPLOAD_SESSION_INVALID", "The completed upload no longer has an available media asset.")
  if session["status"] != "pending" or not session["is_active"]:
    raise AppError(409, "UPLOAD_SESSION_INVALID", "The upload session is invalid, expired, or already completed.")

  s3 = s3_service or S3Service(settings)
  primary_metadata = await asyncio.to_thread(
    s3.get_object_metadata,
    bucket=session["bucket"],
    object_key=session["object_key"],
  )
  _validate_uploaded_object(
    actual=primary_metadata,
    expected_byte_size=session.get("expected_byte_size"),
    expected_content_type=session["content_type"],
  )

  thumbnail_metadata: dict[str, str | int] | None = None
  if session.get("thumbnail_bucket") and session.get("thumbnail_object_key"):
    thumbnail_metadata = await asyncio.to_thread(
      s3.get_object_metadata,
      bucket=session["thumbnail_bucket"],
      object_key=session["thumbnail_object_key"],
    )
    _validate_uploaded_object(
      actual=thumbnail_metadata,
      expected_byte_size=session.get("thumbnail_expected_byte_size"),
      expected_content_type=session["thumbnail_content_type"],
    )

  media_asset_id = uuid4()
  media = await db.fetchrow(
    """
    with claimed as (
      update media_upload_sessions
      set status = 'completed', completed_at = now(), media_asset_id = $4
      where id = $1
        and (
          ($2::uuid is not null and owner_user_id = $2 and partner_account_id is null)
          or ($3::uuid is not null and partner_account_id = $3 and owner_user_id is null)
        )
        and status = 'pending'
        and expires_at > now()
      returning *
    )
    insert into media_assets (
        id,
        owner_user_id,
        media_kind,
        source,
        bucket,
        object_key,
        cdn_url,
        thumbnail_bucket,
        thumbnail_object_key,
        thumbnail_cdn_url,
        thumbnail_content_type,
        thumbnail_byte_size,
        thumbnail_width,
        thumbnail_height,
        content_type,
        byte_size,
        width,
        height,
        original_filename
    )
    select
        media_asset_id,
        owner_user_id,
        media_kind,
        source,
        bucket,
        object_key,
        cdn_url,
        thumbnail_bucket,
        thumbnail_object_key,
        thumbnail_cdn_url,
        thumbnail_content_type,
        $5,
        thumbnail_width,
        thumbnail_height,
        content_type,
        $6,
        width,
        height,
        original_filename
      from claimed
    returning *
    """,
    upload_id,
    owner_user_id,
    partner_account_id,
    media_asset_id,
    int(thumbnail_metadata["byte_size"]) if thumbnail_metadata else None,
    int(primary_metadata["byte_size"]),
  )
  if media is None:
    completed_media = await _completed_upload_media(
      db,
      upload_id,
      owner_user_id=owner_user_id,
      partner_account_id=partner_account_id,
    )
    if completed_media is not None:
      return completed_media
    raise AppError(409, "UPLOAD_SESSION_INVALID", "The upload session is invalid, expired, or already completed.")
  return media
