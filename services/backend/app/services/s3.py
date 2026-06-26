from uuid import uuid4

import boto3
from botocore.config import Config

from app.core.errors import AppError
from app.core.settings import Settings


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

    if self.settings.aws_access_key_id and self.settings.aws_secret_access_key:
      client_kwargs.update(
        {
          "aws_access_key_id": self.settings.aws_access_key_id,
          "aws_secret_access_key": self.settings.aws_secret_access_key,
        },
      )

    return boto3.client("s3", **client_kwargs)

  def create_presigned_upload(
    self,
    media_kind: str,
    content_type: str,
    original_filename: str | None,
    expires_in: int = 900,
  ) -> dict[str, str | int]:
    if not self.settings.s3_bucket_name:
      raise AppError(503, "S3_NOT_CONFIGURED", "S3_BUCKET_NAME is required for uploads.")

    extension = ""

    if original_filename and "." in original_filename:
      extension = "." + original_filename.rsplit(".", 1)[1].lower()

    object_key = f"uploads/{media_kind}/{uuid4()}{extension}"
    upload_url = self._client().generate_presigned_url(
      "put_object",
      Params={
        "Bucket": self.settings.s3_bucket_name,
        "Key": object_key,
        "ContentType": content_type,
      },
      ExpiresIn=expires_in,
    )

    cdn_base_url = self.settings.effective_cdn_base_url

    return {
      "bucket": self.settings.s3_bucket_name,
      "object_key": object_key,
      "upload_url": upload_url,
      "cdn_url": f"{cdn_base_url}/{object_key}" if cdn_base_url else "",
      "method": "PUT",
      "expires_in": expires_in,
      "content_type": content_type,
    }
