import copy
from collections.abc import Iterable, Mapping
from typing import Any
from uuid import UUID

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.services.s3 import S3Service


PRIVATE_MEDIA_DELIVERY_TTL_SECONDS = 5 * 60

_REQUEST_STORAGE_FIELDS = frozenset(
  {
    "bucket",
    "objectKey",
    "object_key",
    "sourceObjectKey",
    "source_object_key",
    "cdnUrl",
    "cdn_url",
    "imageUrl",
    "image_url",
    "previewUrl",
    "preview_url",
    "sourceUri",
    "source_uri",
    "sourceUrl",
    "source_url",
    "storageBucket",
    "storage_bucket",
    "storageObjectKey",
    "storage_object_key",
    "thumbnailBucket",
    "thumbnail_bucket",
    "thumbnailObjectKey",
    "thumbnail_object_key",
    "thumbnailUrl",
    "thumbnail_url",
  },
)

_MEDIA_REFERENCE_STORAGE_FIELDS = frozenset(
  {
    "bucket",
    "objectKey",
    "object_key",
    "cdnUrl",
    "cdn_url",
    "imageUrl",
    "image_url",
    "previewUrl",
    "preview_url",
    "sourceObjectKey",
    "source_object_key",
    "sourceUrl",
    "source_url",
    "storageBucket",
    "storage_bucket",
    "storageObjectKey",
    "storage_object_key",
    "thumbnailBucket",
    "thumbnail_bucket",
    "thumbnailObjectKey",
    "thumbnail_object_key",
    "thumbnailCdnUrl",
    "thumbnail_cdn_url",
    "thumbnailUrl",
    "thumbnail_url",
    "url",
  },
)


def _unique_media_ids(media_ids: Iterable[UUID | str | None]) -> list[UUID]:
  unique: list[UUID] = []
  seen: set[str] = set()
  for media_id in media_ids:
    if media_id is None:
      continue
    normalized = str(media_id)
    if not normalized or normalized in seen:
      continue
    try:
      parsed = media_id if isinstance(media_id, UUID) else UUID(normalized)
    except ValueError:
      continue
    seen.add(normalized)
    unique.append(parsed)
  return unique


async def create_owned_media_delivery_urls(
  db: Database,
  settings: Settings,
  *,
  owner_user_id: UUID | str,
  media_ids: Iterable[UUID | str | None],
  expires_in: int | None = None,
) -> dict[str, str]:
  """Create response-only URLs after selecting active media owned by the caller.

  The generated bearer URLs are deliberately never written to ``media_assets``
  or report JSON. Missing, deleted, or foreign media is omitted (fail closed).
  """
  requested_ids = _unique_media_ids(media_ids)
  if not requested_ids:
    return {}

  rows = await db.fetch(
    """
    select id, bucket, object_key
    from media_assets
    where id = any($1::uuid[])
      and owner_user_id = $2
      and status = 'active'
      and deleted_at is null
    """,
    requested_ids,
    owner_user_id,
  )

  s3 = S3Service(settings)
  delivery_ttl = (
    expires_in
    if expires_in is not None
    else int(
      getattr(
        settings,
        "private_media_url_ttl_seconds",
        PRIVATE_MEDIA_DELIVERY_TTL_SECONDS,
      ),
    )
  )
  delivery_urls: dict[str, str] = {}
  for raw_row in rows:
    row = dict(raw_row)
    bucket = str(row.get("bucket") or "")
    object_key = str(row.get("object_key") or "")
    if not bucket or not object_key:
      continue
    try:
      s3.assert_managed_media_location(bucket=bucket, object_key=object_key)
    except AppError as exc:
      # A stale or malformed legacy row must not make every otherwise valid
      # report image unavailable. Configuration/service failures still surface.
      if exc.status_code == 403 and exc.code == "S3_TARGET_NOT_MANAGED":
        continue
      raise
    delivery_urls[str(row["id"])] = s3.create_presigned_download(
      bucket=bucket,
      object_key=object_key,
      expires_in=delivery_ttl,
    )
  return delivery_urls


def project_private_media_reference(
  media: Mapping[str, Any] | None,
  delivery_url: str | None,
) -> dict[str, Any] | None:
  if media is None:
    return None
  # Storage coordinates and legacy durable URLs are never an authorization
  # fallback.  If ownership/status validation did not produce a delivery URL,
  # return only the non-location metadata (fail closed).
  projected = {
    key: copy.deepcopy(value)
    for key, value in media.items()
    if key not in _MEDIA_REFERENCE_STORAGE_FIELDS
  }
  if delivery_url:
    projected["cdn_url"] = delivery_url
  return projected


def project_payload_with_private_media(
  payload: Mapping[str, Any] | None,
  *,
  delivery_url: str | None,
  preview_delivery_url: str | None = None,
) -> dict[str, Any]:
  """Remove durable S3 locations and inject short-lived response URLs."""
  projected = copy.deepcopy(dict(payload or {}))
  request = projected.get("request")
  if not isinstance(request, dict):
    return projected

  for key in _REQUEST_STORAGE_FIELDS:
    request.pop(key, None)
  if delivery_url:
    request["cdnUrl"] = delivery_url
  if preview_delivery_url:
    request["previewUrl"] = preview_delivery_url
  return projected
