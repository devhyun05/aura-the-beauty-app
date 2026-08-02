import asyncio
import io
import logging
from dataclasses import dataclass
from typing import Any

from botocore.exceptions import ClientError
from PIL import Image, UnidentifiedImageError

from app.services.s3 import media_location_log_token


logger = logging.getLogger(__name__)

SUPPORTED_SOURCE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")
POSTPROCESS_SOURCE_PREFIXES = (
  "uploads/capture/",
  "uploads/makeup_feedback/",
  "uploads/filter-extraction/",
)
DEFAULT_RETRY_DELAYS_SECONDS = (0.25, 0.75, 1.5)


@dataclass(frozen=True)
class ThumbnailMetadata:
  bucket: str
  object_key: str
  cdn_url: str | None
  content_type: str | None
  byte_size: int | None
  width: int | None
  height: int | None


def thumbnail_key_for(object_key: str) -> str:
  directory, _, filename = object_key.rpartition("/")
  stem, _, _extension = filename.rpartition(".")
  thumbnail_filename = f"{stem or filename}.jpg"

  if directory:
    return f"{directory}/thumbnails/{thumbnail_filename}"

  return f"thumbnails/{thumbnail_filename}"


def should_resolve_postprocessed_thumbnail(object_key: str) -> bool:
  lowered = object_key.lower()

  if not any(lowered.startswith(prefix) for prefix in POSTPROCESS_SOURCE_PREFIXES):
    return False

  if "/thumbnails/" in lowered:
    return False

  return lowered.endswith(SUPPORTED_SOURCE_EXTENSIONS)


def _is_not_found_error(error: ClientError) -> bool:
  code = str(error.response.get("Error", {}).get("Code", "")).lower()
  status_code = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
  return code in {"404", "nosuchkey", "notfound"} or status_code == 404


def _cdn_url(cdn_base_url: str | None, object_key: str) -> str | None:
  if not cdn_base_url:
    return None

  return f"{cdn_base_url.rstrip('/')}/{object_key}"


def expected_postprocessed_thumbnail_metadata(
  *,
  bucket: str,
  source_object_key: str,
  cdn_base_url: str | None,
) -> ThumbnailMetadata | None:
  if not should_resolve_postprocessed_thumbnail(source_object_key):
    return None

  object_key = thumbnail_key_for(source_object_key)

  return ThumbnailMetadata(
    bucket=bucket,
    object_key=object_key,
    cdn_url=_cdn_url(cdn_base_url, object_key),
    content_type="image/jpeg",
    byte_size=None,
    width=None,
    height=None,
  )


def read_thumbnail_metadata(
  s3_client: Any,
  *,
  bucket: str,
  object_key: str,
  cdn_base_url: str | None,
) -> ThumbnailMetadata | None:
  try:
    head = s3_client.head_object(Bucket=bucket, Key=object_key)
    response = s3_client.get_object(Bucket=bucket, Key=object_key)
    body = response["Body"].read()

    with Image.open(io.BytesIO(body)) as image:
      image.load()
      width, height = image.size
  except ClientError as exc:
    if _is_not_found_error(exc):
      return None

    logger.warning(
      "[aura:media-api] thumbnail:head-failed location=%s reason=%s",
      media_location_log_token(bucket=bucket, object_key=object_key),
      exc.__class__.__name__,
    )
    return None
  except (UnidentifiedImageError, OSError) as exc:
    logger.warning(
      "[aura:media-api] thumbnail:inspect-failed location=%s reason=%s",
      media_location_log_token(bucket=bucket, object_key=object_key),
      exc.__class__.__name__,
    )
    return None

  return ThumbnailMetadata(
    bucket=bucket,
    object_key=object_key,
    cdn_url=_cdn_url(cdn_base_url, object_key),
    content_type=head.get("ContentType"),
    byte_size=head.get("ContentLength"),
    width=width,
    height=height,
  )


async def resolve_postprocessed_thumbnail_metadata(
  s3_client: Any,
  *,
  bucket: str,
  source_object_key: str,
  cdn_base_url: str | None,
  retry_delays_seconds: tuple[float, ...] = DEFAULT_RETRY_DELAYS_SECONDS,
) -> ThumbnailMetadata | None:
  if not should_resolve_postprocessed_thumbnail(source_object_key):
    return None

  thumbnail_key = thumbnail_key_for(source_object_key)

  for delay in (0.0, *retry_delays_seconds):
    if delay > 0:
      await asyncio.sleep(delay)

    metadata = await asyncio.to_thread(
      read_thumbnail_metadata,
      s3_client,
      bucket=bucket,
      object_key=thumbnail_key,
      cdn_base_url=cdn_base_url,
    )

    if metadata is not None:
      return metadata

  return None
