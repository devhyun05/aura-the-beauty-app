import asyncio
from dataclasses import dataclass
from io import BytesIO
import logging
import threading
from typing import Any
from uuid import UUID, uuid4

from PIL import Image, ImageOps, UnidentifiedImageError

try:
  from pillow_heif import register_heif_opener

  register_heif_opener()
except ImportError:  # pragma: no cover - production requirements include pillow-heif.
  pass

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.schemas.media import MAX_MEDIA_UPLOAD_BYTES, PresignedUploadRequest
from app.services.s3 import (
  PRIVATE_USER_MEDIA_OBJECT_PREFIX,
  SENSITIVE_USER_MEDIA_KINDS,
  S3Service,
  media_location_log_token,
)


UPLOAD_SESSION_TTL_SECONDS = 900
SENSITIVE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024
SENSITIVE_IMAGE_MAX_PIXELS = 16_000_000
SENSITIVE_IMAGE_MIN_EDGE = 32
SENSITIVE_IMAGE_MAX_EDGE = 8192
SANITIZED_IMAGE_QUALITY = 90
SENSITIVE_IMAGE_DECODE_SEMAPHORE = threading.BoundedSemaphore(value=1)
UNCLAIMED_FINAL_MEDIA_DELETION_REASON = "sensitive_upload_unclaimed_final"
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SanitizedSensitiveImage:
  body: bytes
  content_type: str
  width: int
  height: int
  source_format: str


_EXPECTED_PIL_FORMATS = {
  "image/heic": {"HEIC", "HEIF"},
  "image/heif": {"HEIC", "HEIF"},
  "image/jpeg": {"JPEG"},
  "image/jpg": {"JPEG"},
  "image/png": {"PNG"},
  "image/webp": {"WEBP"},
}


def _require_principal(owner_user_id: UUID | None, partner_account_id: UUID | None) -> None:
  if (owner_user_id is None) == (partner_account_id is None):
    raise ValueError("Exactly one upload principal is required.")


def _normalized_content_type(value: str) -> str:
  return value.split(";", 1)[0].strip().lower()


def _validate_image_shape(*, width: int, height: int) -> None:
  if width < SENSITIVE_IMAGE_MIN_EDGE or height < SENSITIVE_IMAGE_MIN_EDGE:
    raise AppError(409, "UPLOAD_IMAGE_DIMENSIONS_INVALID", "The uploaded image dimensions are too small.")
  if width > SENSITIVE_IMAGE_MAX_EDGE or height > SENSITIVE_IMAGE_MAX_EDGE:
    raise AppError(413, "UPLOAD_IMAGE_DIMENSIONS_INVALID", "The uploaded image dimensions are too large.")
  if width * height > SENSITIVE_IMAGE_MAX_PIXELS:
    raise AppError(413, "UPLOAD_IMAGE_PIXELS_EXCEEDED", "The uploaded image has too many pixels.")


def _assert_single_frame(image: Image.Image) -> None:
  if bool(getattr(image, "is_animated", False)) or int(getattr(image, "n_frames", 1)) != 1:
    raise AppError(409, "UPLOAD_IMAGE_ANIMATED", "Animated or multi-frame images are not supported.")


def _flatten_to_rgb(image: Image.Image) -> Image.Image:
  if image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info):
    rgba = image.convert("RGBA")
    background = Image.new("RGB", rgba.size, (255, 255, 255))
    background.paste(rgba, mask=rgba.getchannel("A"))
    return background
  return image.convert("RGB")


def sanitize_sensitive_image(image_bytes: bytes, *, expected_content_type: str) -> SanitizedSensitiveImage:
  if not image_bytes or len(image_bytes) > SENSITIVE_UPLOAD_MAX_BYTES:
    raise AppError(413, "UPLOAD_SIZE_INVALID", "The sensitive image size is not allowed.")

  expected_formats = _EXPECTED_PIL_FORMATS.get(_normalized_content_type(expected_content_type), set())
  try:
    with Image.open(BytesIO(image_bytes)) as probe:
      source_format = str(probe.format or "").upper()
      if source_format not in expected_formats:
        raise AppError(
          409,
          "UPLOAD_IMAGE_FORMAT_MISMATCH",
          "The uploaded bytes do not match the declared image type.",
          {"actualFormat": source_format or "unknown"},
        )
      _assert_single_frame(probe)
      _validate_image_shape(width=probe.width, height=probe.height)
      probe.verify()

    with Image.open(BytesIO(image_bytes)) as original:
      _assert_single_frame(original)
      _validate_image_shape(width=original.width, height=original.height)
      normalized = ImageOps.exif_transpose(original)
      normalized.load()
      _validate_image_shape(width=normalized.width, height=normalized.height)
      sanitized = _flatten_to_rgb(normalized)

    output = BytesIO()
    sanitized.save(output, format="JPEG", quality=SANITIZED_IMAGE_QUALITY, optimize=False)
    body = output.getvalue()
    if not body or len(body) > SENSITIVE_UPLOAD_MAX_BYTES:
      raise AppError(413, "UPLOAD_SANITIZED_SIZE_INVALID", "The sanitized image size is not allowed.")
    with Image.open(BytesIO(body)) as verified:
      if verified.format != "JPEG" or verified.size != sanitized.size:
        raise AppError(409, "UPLOAD_SANITIZATION_FAILED", "The sanitized image could not be verified.")
      verified.verify()
  except AppError:
    raise
  except (Image.DecompressionBombError, Image.DecompressionBombWarning, UnidentifiedImageError, OSError, ValueError) as exc:
    raise AppError(409, "UPLOAD_IMAGE_INVALID", "The uploaded object is not a valid supported image.") from exc

  return SanitizedSensitiveImage(
    body=body,
    content_type="image/jpeg",
    width=sanitized.width,
    height=sanitized.height,
    source_format=source_format,
  )


def _sanitize_sensitive_image_bounded(
  image_bytes: bytes,
  *,
  expected_content_type: str,
) -> SanitizedSensitiveImage:
  # A 16 MP RGB decode needs tens of MiB. Serializing this CPU/memory-heavy
  # section keeps the 512 MiB ECS task from decoding several images at once.
  with SENSITIVE_IMAGE_DECODE_SEMAPHORE:
    return sanitize_sensitive_image(image_bytes, expected_content_type=expected_content_type)


def _sensitive_final_object_key(
  session: dict[str, Any],
  upload_id: UUID,
  finalization_id: UUID,
) -> str:
  if session.get("owner_user_id"):
    principal = f"users/{session['owner_user_id']}"
  elif session.get("partner_account_id"):
    principal = f"partners/{session['partner_account_id']}"
  else:  # Database constraints should make this unreachable.
    raise AppError(409, "UPLOAD_SESSION_INVALID", "The upload session has no owner.")
  return (
    f"{PRIVATE_USER_MEDIA_OBJECT_PREFIX}{principal}/{session['media_kind']}/"
    f"{upload_id}/{finalization_id}.jpg"
  )


async def _delete_staging_object(s3: S3Service, *, bucket: str, object_key: str) -> None:
  try:
    await asyncio.to_thread(s3.delete_object_permanently, bucket=bucket, object_key=object_key)
  except Exception as exc:  # noqa: BLE001 - cleanup is retried by lifecycle/expired-upload cleanup.
    logger.warning(
      "[aura:media-upload] staging-delete-failed location=%s reason=%s",
      media_location_log_token(bucket=bucket, object_key=object_key),
      exc.__class__.__name__,
    )


async def _delete_unclaimed_final_object(s3: S3Service, *, bucket: str, object_key: str) -> bool:
  try:
    await asyncio.to_thread(s3.delete_object_permanently, bucket=bucket, object_key=object_key)
    return True
  except Exception as exc:  # noqa: BLE001 - a private-prefix lifecycle rule remains the final safety net.
    logger.warning(
      "[aura:media-upload] unclaimed-final-delete-failed location=%s reason=%s",
      media_location_log_token(bucket=bucket, object_key=object_key),
      exc.__class__.__name__,
    )
    return False


async def _create_unclaimed_final_object_guard(
  db: Database,
  *,
  bucket: str,
  object_key: str,
) -> UUID | None:
  """Persist cleanup intent before an immutable private object is written.

  The production Database owns a pool and the application startup creates the
  outbox schema. Lightweight database adapters used by offline tools/tests do
  not, so they retain the legacy direct-cleanup behavior.
  """
  if getattr(db, "pool", None) is None:
    return None

  guard = await db.fetchrow(
    """
    insert into media_deletion_outbox (
      report_id,
      media_asset_id,
      bucket,
      object_key,
      reason,
      status,
      next_attempt_at
    )
    values (null, null, $1, $2, $3, 'pending', now() + interval '1 hour')
    returning id
    """,
    bucket,
    object_key,
    UNCLAIMED_FINAL_MEDIA_DELETION_REASON,
  )
  if guard is None:
    raise RuntimeError("Private media finalization guard could not be created.")
  return guard["id"]


async def _complete_unclaimed_final_object_guard(
  db: Database,
  guard_id: UUID | None,
) -> None:
  if guard_id is None or getattr(db, "pool", None) is None:
    return
  await db.execute(
    """
    update media_deletion_outbox
    set status = 'completed',
        processed_at = now(),
        last_error = null,
        updated_at = now()
    where id = $1
      and status <> 'completed'
    """,
    guard_id,
  )


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
    raise AppError(
      409,
      "UPLOAD_SIZE_MISMATCH",
      "The uploaded object size does not match the upload session.",
      {"actualByteSize": actual_byte_size, "expectedByteSize": expected_byte_size},
    )
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
  is_sensitive_user_media = session["media_kind"] in SENSITIVE_USER_MEDIA_KINDS
  primary_metadata = await asyncio.to_thread(
    s3.get_object_metadata,
    bucket=session["bucket"],
    object_key=session["object_key"],
  )
  try:
    _validate_uploaded_object(
      actual=primary_metadata,
      expected_byte_size=session.get("expected_byte_size"),
      expected_content_type=session["content_type"],
    )
  except AppError:
    if is_sensitive_user_media:
      await _delete_staging_object(
        s3,
        bucket=str(session["bucket"]),
        object_key=str(session["object_key"]),
      )
    raise

  asset_bucket = str(session["bucket"])
  asset_object_key = str(session["object_key"])
  asset_cdn_url = session.get("cdn_url")
  asset_content_type = str(session["content_type"])
  asset_width = session.get("width")
  asset_height = session.get("height")
  asset_byte_size = int(primary_metadata["byte_size"])
  media_asset_id = uuid4()
  finalization_guard_id: UUID | None = None

  if is_sensitive_user_media:
    if asset_byte_size > SENSITIVE_UPLOAD_MAX_BYTES:
      await _delete_staging_object(s3, bucket=asset_bucket, object_key=asset_object_key)
      raise AppError(413, "UPLOAD_SIZE_INVALID", "The sensitive image size is not allowed.")
    try:
      source_bytes, _source_content_type = await asyncio.to_thread(
        s3.get_object_bytes,
        bucket=asset_bucket,
        object_key=asset_object_key,
        max_bytes=SENSITIVE_UPLOAD_MAX_BYTES,
      )
      sanitized = await asyncio.to_thread(
        _sanitize_sensitive_image_bounded,
        source_bytes,
        expected_content_type=asset_content_type,
      )
      final_bucket = s3.private_media_bucket()
      final_object_key = _sensitive_final_object_key(dict(session), upload_id, media_asset_id)
      finalization_guard_id = await _create_unclaimed_final_object_guard(
        db,
        bucket=final_bucket,
        object_key=final_object_key,
      )
      await asyncio.to_thread(
        s3.put_private_object,
        bucket=final_bucket,
        object_key=final_object_key,
        body=sanitized.body,
        content_type=sanitized.content_type,
        tags={"aura-media-kind": str(session["media_kind"]), "aura-upload-id": str(upload_id)},
      )
    except AppError:
      await _delete_staging_object(s3, bucket=asset_bucket, object_key=asset_object_key)
      raise

    asset_bucket = final_bucket
    asset_object_key = final_object_key
    asset_cdn_url = None
    asset_content_type = sanitized.content_type
    asset_width = sanitized.width
    asset_height = sanitized.height
    asset_byte_size = len(sanitized.body)

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

  try:
    guard_completion_cte = ""
    guard_completion_arg: tuple[UUID, ...] = ()
    if finalization_guard_id is not None:
      guard_completion_cte = """
      , guard_completed as (
        update media_deletion_outbox
        set status = 'completed',
            processed_at = now(),
            last_error = null,
            updated_at = now()
        where id = $13
          and exists (select 1 from inserted)
        returning id
      )
      """
      guard_completion_arg = (finalization_guard_id,)

    media = await db.fetchrow(
      f"""
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
    , inserted as (
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
        $5,
        $6,
        $7,
        thumbnail_bucket,
        thumbnail_object_key,
        thumbnail_cdn_url,
        thumbnail_content_type,
        $11,
        thumbnail_width,
        thumbnail_height,
        $8,
        $12,
        $9,
        $10,
        original_filename
      from claimed
      returning *
    )
    {guard_completion_cte}
    select inserted.*
    from inserted
      """,
      upload_id,
      owner_user_id,
      partner_account_id,
      media_asset_id,
      asset_bucket,
      asset_object_key,
      asset_cdn_url,
      asset_content_type,
      asset_width,
      asset_height,
      int(thumbnail_metadata["byte_size"]) if thumbnail_metadata else None,
      asset_byte_size,
      *guard_completion_arg,
    )
  except Exception:  # noqa: BLE001 - reconcile an ambiguous DB result before object cleanup.
    if not is_sensitive_user_media:
      raise
    try:
      completed_after_error = await _completed_upload_media(
        db,
        upload_id,
        owner_user_id=owner_user_id,
        partner_account_id=partner_account_id,
      )
    except Exception as reconciliation_error:  # noqa: BLE001 - ambiguous commit safety.
      logger.warning(
        "[aura:media-upload] claim-reconciliation-failed upload_id=%s location=%s reason=%s",
        upload_id,
        media_location_log_token(bucket=asset_bucket, object_key=asset_object_key),
        reconciliation_error.__class__.__name__,
      )
      raise
    if completed_after_error is not None:
      if (
        str(completed_after_error.get("bucket")) != asset_bucket
        or str(completed_after_error.get("object_key")) != asset_object_key
      ):
        deleted = await _delete_unclaimed_final_object(
          s3,
          bucket=asset_bucket,
          object_key=asset_object_key,
        )
        if deleted:
          await _complete_unclaimed_final_object_guard(db, finalization_guard_id)
      await _delete_staging_object(s3, bucket=str(session["bucket"]), object_key=str(session["object_key"]))
      return completed_after_error
    deleted = await _delete_unclaimed_final_object(s3, bucket=asset_bucket, object_key=asset_object_key)
    if deleted:
      await _complete_unclaimed_final_object_guard(db, finalization_guard_id)
    # Keep the valid staging object so a transient database failure can be retried.
    raise
  if media is None:
    completed_media = await _completed_upload_media(
      db,
      upload_id,
      owner_user_id=owner_user_id,
      partner_account_id=partner_account_id,
    )
    if completed_media is not None:
      if is_sensitive_user_media:
        if (
          str(completed_media.get("bucket")) != asset_bucket
          or str(completed_media.get("object_key")) != asset_object_key
        ):
          deleted = await _delete_unclaimed_final_object(
            s3,
            bucket=asset_bucket,
            object_key=asset_object_key,
          )
          if deleted:
            await _complete_unclaimed_final_object_guard(db, finalization_guard_id)
        await _delete_staging_object(s3, bucket=str(session["bucket"]), object_key=str(session["object_key"]))
      return completed_media
    if is_sensitive_user_media:
      deleted = await _delete_unclaimed_final_object(s3, bucket=asset_bucket, object_key=asset_object_key)
      if deleted:
        await _complete_unclaimed_final_object_guard(db, finalization_guard_id)
    raise AppError(409, "UPLOAD_SESSION_INVALID", "The upload session is invalid, expired, or already completed.")
  if is_sensitive_user_media:
    await _delete_staging_object(s3, bucket=str(session["bucket"]), object_key=str(session["object_key"]))
  return media
