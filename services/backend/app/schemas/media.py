from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.core.media_policy import (
  ALLOWED_UPLOAD_CONTENT_TYPES,
  ALLOWED_UPLOAD_MEDIA_KINDS,
  normalize_upload_content_type,
)
from app.schemas.base import CamelModel


MAX_MEDIA_UPLOAD_BYTES = 50 * 1024 * 1024


class PresignedThumbnailRequest(CamelModel):
  content_type: str = Field(alias="contentType", min_length=3, max_length=100)
  original_filename: str | None = Field(default=None, alias="originalFilename", max_length=255)
  byte_size: int | None = Field(default=None, alias="byteSize", ge=1, le=MAX_MEDIA_UPLOAD_BYTES)
  width: int | None = Field(default=None, gt=0)
  height: int | None = Field(default=None, gt=0)

  @field_validator("content_type")
  @classmethod
  def validate_content_type(cls, value: str) -> str:
    normalized = normalize_upload_content_type(value)
    if normalized not in ALLOWED_UPLOAD_CONTENT_TYPES:
      raise ValueError("Unsupported upload content type.")
    return normalized


class PresignedUploadRequest(CamelModel):
  media_kind: str = Field(alias="mediaKind", pattern=r"^[a-zA-Z0-9_-]+$")
  content_type: str = Field(alias="contentType", min_length=3, max_length=100)
  source: Literal["camera", "gallery", "generated"] = "camera"
  original_filename: str | None = Field(default=None, alias="originalFilename", max_length=255)
  byte_size: int | None = Field(default=None, alias="byteSize", ge=1, le=MAX_MEDIA_UPLOAD_BYTES)
  width: int | None = Field(default=None, gt=0)
  height: int | None = Field(default=None, gt=0)
  thumbnail: PresignedThumbnailRequest | None = None

  @field_validator("media_kind")
  @classmethod
  def validate_media_kind(cls, value: str) -> str:
    if value not in ALLOWED_UPLOAD_MEDIA_KINDS:
      raise ValueError("Unsupported upload media kind.")
    return value

  @field_validator("content_type")
  @classmethod
  def validate_content_type(cls, value: str) -> str:
    normalized = normalize_upload_content_type(value)
    if normalized not in ALLOWED_UPLOAD_CONTENT_TYPES:
      raise ValueError("Unsupported upload content type.")
    return normalized

  @model_validator(mode="after")
  def validate_upload_policy(self):
    if self.thumbnail is not None and self.media_kind != "community-thread":
      raise ValueError("Thumbnails are only supported for community uploads.")
    if self.source == "generated" and self.media_kind != "hair-analysis-mask":
      raise ValueError("Generated uploads are only supported for hair analysis masks.")
    return self


class CompleteUploadRequest(CamelModel):
  upload_id: UUID | None = Field(default=None, alias="uploadId")
  bucket: str | None = Field(default=None, min_length=3, max_length=255)
  object_key: str | None = Field(default=None, alias="objectKey", min_length=1, max_length=1024)
  thumbnail_bucket: str | None = Field(default=None, alias="thumbnailBucket", min_length=3, max_length=255)
  thumbnail_object_key: str | None = Field(
    default=None,
    alias="thumbnailObjectKey",
    min_length=1,
    max_length=1024,
  )

  @model_validator(mode="after")
  def validate_completion_reference(self):
    has_upload_id = self.upload_id is not None
    has_legacy_target = self.bucket is not None or self.object_key is not None
    if has_upload_id == has_legacy_target:
      raise ValueError("Provide either uploadId or the legacy bucket/objectKey pair.")
    if has_legacy_target and (self.bucket is None or self.object_key is None):
      raise ValueError("Legacy completion requires both bucket and objectKey.")
    if (self.thumbnail_bucket is None) != (self.thumbnail_object_key is None):
      raise ValueError("Legacy thumbnail completion requires both thumbnail bucket and object key.")
    if has_upload_id and self.thumbnail_bucket is not None:
      raise ValueError("uploadId completion cannot include a legacy thumbnail target.")
    return self


class PhotoCaptureCreate(CamelModel):
  media_id: UUID = Field(alias="mediaId")
  capture_type: str = Field(alias="captureType")
  source: str = "camera"
  device_payload: dict = Field(default_factory=dict, alias="devicePayload")
