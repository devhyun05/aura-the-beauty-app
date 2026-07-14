import io
import logging
import os
from dataclasses import dataclass
from typing import Any
from urllib.parse import unquote_plus

import boto3
from PIL import Image, ImageOps, UnidentifiedImageError

try:
  from pillow_heif import register_heif_opener

  register_heif_opener()
except ImportError:  # pragma: no cover - production requirements include pillow-heif.
  pass



AURA_POSTPROCESSED_METADATA_KEY = "aura-postprocessed"
MAX_IMAGE_PIXELS = 25_000_000
SUPPORTED_CONTENT_TYPES = {"image/heic", "image/heif", "image/jpeg", "image/png", "image/webp"}
SUPPORTED_EXTENSIONS = (".heic", ".heif", ".jpg", ".jpeg", ".png", ".webp")
POSTPROCESS_SOURCE_PREFIXES = (
  "uploads/capture/",
  "uploads/makeup_feedback/",
  "uploads/filter-extraction/",
)
THUMBNAIL_MAX_EDGE = 512
THUMBNAIL_QUALITY = 82
SANITIZED_JPEG_QUALITY = 90

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


@dataclass(frozen=True)
class S3ObjectRef:
  bucket: str
  object_key: str


@dataclass(frozen=True)
class ProcessedImage:
  body: bytes
  content_type: str
  width: int
  height: int
  thumbnail_body: bytes
  thumbnail_content_type: str
  thumbnail_width: int
  thumbnail_height: int
  exif_removed: bool


@dataclass(frozen=True)
class MediaPostprocessResult:
  bucket: str
  object_key: str
  content_type: str
  byte_size: int
  width: int
  height: int
  thumbnail_bucket: str
  thumbnail_object_key: str
  thumbnail_content_type: str
  thumbnail_byte_size: int
  thumbnail_width: int
  thumbnail_height: int
  exif_removed: bool


@dataclass(frozen=True)
class LambdaSettings:
  aws_region: str
  aws_profile_name: str | None
  aws_access_key_id: str | None
  aws_secret_access_key: str | None
  aws_use_iam_role: bool


class MediaPostprocessError(Exception):
  """Raised when a media object cannot be post-processed."""


def get_lambda_settings() -> LambdaSettings:
  return LambdaSettings(
    aws_region=os.getenv("AWS_REGION", "ap-northeast-2"),
    aws_profile_name=os.getenv("AWS_PROFILE_NAME") or None,
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID") or None,
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY") or None,
    aws_use_iam_role=(os.getenv("AWS_USE_IAM_ROLE") or "true").strip().lower() == "true",
  )


def build_s3_client(settings: LambdaSettings):
  client_kwargs = {"region_name": settings.aws_region}

  if settings.aws_profile_name:
    return boto3.Session(profile_name=settings.aws_profile_name).client("s3", **client_kwargs)

  if (
    settings.aws_access_key_id
    and settings.aws_secret_access_key
    and not settings.aws_use_iam_role
  ):
    client_kwargs.update(
      {
        "aws_access_key_id": settings.aws_access_key_id,
        "aws_secret_access_key": settings.aws_secret_access_key,
      },
    )

  return boto3.client("s3", **client_kwargs)


def iter_s3_object_created_records(event: dict[str, Any]) -> list[S3ObjectRef]:
  refs: list[S3ObjectRef] = []

  for record in event.get("Records", []):
    if record.get("eventSource") != "aws:s3":
      continue

    s3_payload = record.get("s3") if isinstance(record, dict) else None

    if not isinstance(s3_payload, dict):
      continue

    bucket = s3_payload.get("bucket", {}).get("name")
    object_key = s3_payload.get("object", {}).get("key")

    if isinstance(bucket, str) and isinstance(object_key, str):
      refs.append(S3ObjectRef(bucket=bucket, object_key=unquote_plus(object_key)))

  return refs


def should_process_object_key(object_key: str) -> bool:
  lowered = object_key.lower()

  if not any(lowered.startswith(prefix) for prefix in POSTPROCESS_SOURCE_PREFIXES):
    return False

  if "/thumbnails/" in lowered or lowered.startswith("thumbnails/"):
    return False

  if lowered.endswith("/"):
    return False

  return lowered.endswith(SUPPORTED_EXTENSIONS)


def thumbnail_key_for(object_key: str) -> str:
  directory, _, filename = object_key.rpartition("/")
  stem, _, _extension = filename.rpartition(".")
  thumbnail_filename = f"{stem or filename}.jpg"

  if directory:
    return f"{directory}/thumbnails/{thumbnail_filename}"

  return f"thumbnails/{thumbnail_filename}"


def _flatten_alpha(image: Image.Image) -> Image.Image:
  if image.mode not in {"RGBA", "LA"}:
    return image.convert("RGB")

  background = Image.new("RGB", image.size, (255, 255, 255))
  alpha = image.getchannel("A")
  background.paste(image.convert("RGB"), mask=alpha)
  return background


def _save_without_metadata(image: Image.Image) -> tuple[bytes, str]:
  output = io.BytesIO()

  if image.mode in {"RGBA", "LA"}:
    image.save(output, format="PNG", optimize=True)
    return output.getvalue(), "image/png"

  image.convert("RGB").save(
    output,
    format="JPEG",
    quality=SANITIZED_JPEG_QUALITY,
    optimize=True,
  )
  return output.getvalue(), "image/jpeg"


def _save_thumbnail(image: Image.Image) -> tuple[bytes, int, int]:
  thumbnail = _flatten_alpha(image)
  thumbnail.thumbnail((THUMBNAIL_MAX_EDGE, THUMBNAIL_MAX_EDGE))

  output = io.BytesIO()
  thumbnail.save(
    output,
    format="JPEG",
    quality=THUMBNAIL_QUALITY,
    optimize=True,
  )
  return output.getvalue(), thumbnail.width, thumbnail.height


def process_image_bytes(image_bytes: bytes) -> ProcessedImage:
  try:
    with Image.open(io.BytesIO(image_bytes)) as original:
      if original.width * original.height > MAX_IMAGE_PIXELS:
        raise MediaPostprocessError("Uploaded image exceeds the maximum pixel count.")
      exif_removed = bool(original.getexif())
      image = ImageOps.exif_transpose(original)
      image.load()
  except (Image.DecompressionBombError, UnidentifiedImageError, OSError) as exc:
    raise MediaPostprocessError("Uploaded object is not a supported image.") from exc

  sanitized_body, sanitized_content_type = _save_without_metadata(image)
  thumbnail_body, thumbnail_width, thumbnail_height = _save_thumbnail(image)

  return ProcessedImage(
    body=sanitized_body,
    content_type=sanitized_content_type,
    width=image.width,
    height=image.height,
    thumbnail_body=thumbnail_body,
    thumbnail_content_type="image/jpeg",
    thumbnail_width=thumbnail_width,
    thumbnail_height=thumbnail_height,
    exif_removed=exif_removed,
  )


def process_s3_object(s3_client: Any, ref: S3ObjectRef) -> MediaPostprocessResult | None:
  if not should_process_object_key(ref.object_key):
    logger.info("[aura:media-lambda] object:skip-key bucket=%s key=%s", ref.bucket, ref.object_key)
    return None

  response = s3_client.get_object(Bucket=ref.bucket, Key=ref.object_key)
  metadata = response.get("Metadata") or {}

  if metadata.get(AURA_POSTPROCESSED_METADATA_KEY) == "true":
    logger.info("[aura:media-lambda] object:skip-processed bucket=%s key=%s", ref.bucket, ref.object_key)
    return None

  content_type = (response.get("ContentType") or "").lower()

  if content_type and content_type not in SUPPORTED_CONTENT_TYPES:
    logger.info(
      "[aura:media-lambda] object:skip-content-type bucket=%s key=%s contentType=%s",
      ref.bucket,
      ref.object_key,
      content_type,
    )
    return None

  body = response["Body"].read()
  processed = process_image_bytes(body)
  thumbnail_object_key = thumbnail_key_for(ref.object_key)
  next_metadata = {
    **metadata,
    AURA_POSTPROCESSED_METADATA_KEY: "true",
  }

  s3_client.put_object(
    Bucket=ref.bucket,
    Key=ref.object_key,
    Body=processed.body,
    ContentType=processed.content_type,
    Metadata=next_metadata,
  )
  s3_client.put_object(
    Bucket=ref.bucket,
    Key=thumbnail_object_key,
    Body=processed.thumbnail_body,
    ContentType=processed.thumbnail_content_type,
    Metadata={
      AURA_POSTPROCESSED_METADATA_KEY: "true",
      "aura-derived-from": ref.object_key,
    },
  )

  return MediaPostprocessResult(
    bucket=ref.bucket,
    object_key=ref.object_key,
    content_type=processed.content_type,
    byte_size=len(processed.body),
    width=processed.width,
    height=processed.height,
    thumbnail_bucket=ref.bucket,
    thumbnail_object_key=thumbnail_object_key,
    thumbnail_content_type=processed.thumbnail_content_type,
    thumbnail_byte_size=len(processed.thumbnail_body),
    thumbnail_width=processed.thumbnail_width,
    thumbnail_height=processed.thumbnail_height,
    exif_removed=processed.exif_removed,
  )


def thumbnail_cdn_url(result: MediaPostprocessResult, cdn_base_url: str | None) -> str | None:
  if not cdn_base_url:
    return None

  return f"{cdn_base_url.rstrip('/')}/{result.thumbnail_object_key}"


async def update_media_asset_postprocess_metadata(
  db: Any,
  result: MediaPostprocessResult,
  *,
  cdn_base_url: str | None = None,
) -> bool:
  row = await db.fetchrow(
    """
    update media_assets
    set content_type = $3,
        byte_size = $4,
        width = $5,
        height = $6,
        thumbnail_bucket = $7,
        thumbnail_object_key = $8,
        thumbnail_cdn_url = $9,
        thumbnail_content_type = $10,
        thumbnail_byte_size = $11,
        thumbnail_width = $12,
        thumbnail_height = $13
    where bucket = $1
      and object_key = $2
      and deleted_at is null
    returning id
    """,
    result.bucket,
    result.object_key,
    result.content_type,
    result.byte_size,
    result.width,
    result.height,
    result.thumbnail_bucket,
    result.thumbnail_object_key,
    thumbnail_cdn_url(result, cdn_base_url),
    result.thumbnail_content_type,
    result.thumbnail_byte_size,
    result.thumbnail_width,
    result.thumbnail_height,
  )
  return row is not None


def handle_s3_event(event: dict[str, Any], *, s3_client: Any) -> list[MediaPostprocessResult]:
  results: list[MediaPostprocessResult] = []

  for ref in iter_s3_object_created_records(event):
    result = process_s3_object(s3_client, ref)

    if result is not None:
      results.append(result)

  return results


def lambda_handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
  settings = get_lambda_settings()
  results = handle_s3_event(event, s3_client=build_s3_client(settings))

  return {
    "processed": len(results),
    "objects": [
      {
        "bucket": result.bucket,
        "objectKey": result.object_key,
        "thumbnailObjectKey": result.thumbnail_object_key,
        "width": result.width,
        "height": result.height,
        "exifRemoved": result.exif_removed,
      }
      for result in results
    ],
  }
