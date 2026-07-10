from uuid import uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.errors import AppError
from app.core.media_policy import ALLOWED_UPLOAD_MEDIA_KINDS, upload_extension_for_content_type
from app.core.settings import Settings


PRIVATE_HAIR_MEDIA_KINDS = {
  "hair-analysis-source",
  "hair-analysis-mask",
  "hair-simulation-result",
}
PRIVATE_HAIR_OBJECT_PREFIXES = tuple(f"uploads/{kind}/" for kind in PRIVATE_HAIR_MEDIA_KINDS)
SERVER_MANAGED_MEDIA_KINDS = {
  "face-analysis",
  "generated-makeup",
  "hair-simulation-result",
  "optimized",
  "photo-captures",
  "recommended-makeups",
}
MANAGED_MEDIA_OBJECT_PREFIXES = tuple(
  f"uploads/{kind}/"
  for kind in sorted(
    ALLOWED_UPLOAD_MEDIA_KINDS
    | {f"{kind}-thumbnail" for kind in ALLOWED_UPLOAD_MEDIA_KINDS}
    | SERVER_MANAGED_MEDIA_KINDS,
  )
)


def is_private_hair_object_key(object_key: str) -> bool:
  return object_key.startswith(PRIVATE_HAIR_OBJECT_PREFIXES)


class S3Service:
  def __init__(self, settings: Settings) -> None:
    self.settings = settings

  def _client(self):
    region = self.settings.aws_region
    client_kwargs = {
      "config": Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
      "endpoint_url": f"https://s3.{region}.amazonaws.com",
      "region_name": region,
    }

    if self.settings.aws_profile_name:
      return boto3.Session(profile_name=self.settings.aws_profile_name).client("s3", **client_kwargs)

    if (
      self.settings.aws_access_key_id
      and self.settings.aws_secret_access_key
      and not self.settings.aws_use_iam_role
    ):
      client_kwargs.update(
        {
          "aws_access_key_id": self.settings.aws_access_key_id,
          "aws_secret_access_key": self.settings.aws_secret_access_key,
        },
      )

    return boto3.client("s3", **client_kwargs)

  def assert_managed_media_location(self, *, bucket: str, object_key: str) -> None:
    configured_bucket = self.settings.s3_bucket_name
    if not configured_bucket:
      raise AppError(503, "S3_NOT_CONFIGURED", "S3_BUCKET_NAME is required for media access.")
    if bucket != configured_bucket or not object_key.startswith(MANAGED_MEDIA_OBJECT_PREFIXES):
      raise AppError(403, "S3_TARGET_NOT_MANAGED", "The requested object is outside the managed media location.")

  def create_presigned_upload(
    self,
    media_kind: str,
    content_type: str,
    original_filename: str | None,
    expires_in: int = 900,
  ) -> dict[str, str | int | None]:
    if not self.settings.s3_bucket_name:
      raise AppError(503, "S3_NOT_CONFIGURED", "S3_BUCKET_NAME is required for uploads.")

    extension = upload_extension_for_content_type(content_type)

    object_key = f"uploads/{media_kind}/{uuid4()}{extension}"
    is_private_hair_media = media_kind in PRIVATE_HAIR_MEDIA_KINDS
    cache_control = "private, no-store" if is_private_hair_media else "public, max-age=31536000, immutable"
    upload_url = self._client().generate_presigned_url(
      "put_object",
      Params={
        "Bucket": self.settings.s3_bucket_name,
        "ContentType": content_type,
        "Key": object_key,
        "CacheControl": cache_control,
      },
      ExpiresIn=expires_in,
    )

    cdn_base_url = self.settings.effective_cdn_base_url

    return {
      "bucket": self.settings.s3_bucket_name,
      "object_key": object_key,
      "upload_url": upload_url,
      "cdn_url": None if is_private_hair_media else (f"{cdn_base_url}/{object_key}" if cdn_base_url else ""),
      "method": "PUT",
      "expires_in": expires_in,
      "content_type": content_type,
      "cache_control": cache_control,
    }

  def delete_object(self, *, bucket: str, object_key: str) -> None:
    if not bucket or not object_key:
      raise AppError(400, "S3_DELETE_TARGET_REQUIRED", "S3 bucket and object key are required.")

    self.assert_managed_media_location(bucket=bucket, object_key=object_key)
    self._client().delete_object(Bucket=bucket, Key=object_key)

  def get_object_metadata(self, *, bucket: str, object_key: str) -> dict[str, str | int]:
    self.assert_managed_media_location(bucket=bucket, object_key=object_key)
    try:
      response = self._client().head_object(Bucket=bucket, Key=object_key)
    except ClientError as exc:
      error_code = str(exc.response.get("Error", {}).get("Code") or "")
      if error_code in {"404", "NoSuchKey", "NotFound"}:
        raise AppError(409, "UPLOAD_OBJECT_NOT_FOUND", "The uploaded object was not found.") from exc
      raise AppError(503, "S3_METADATA_UNAVAILABLE", "The uploaded object could not be verified.") from exc

    return {
      "byte_size": int(response.get("ContentLength") or 0),
      "content_type": str(response.get("ContentType") or "application/octet-stream").split(";", 1)[0].lower(),
    }
