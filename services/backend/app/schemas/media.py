from uuid import UUID

from pydantic import Field

from app.schemas.base import CamelModel


class PresignedUploadRequest(CamelModel):
  media_kind: str = Field(alias="mediaKind", pattern=r"^[a-zA-Z0-9_-]+$")
  content_type: str = Field(alias="contentType", min_length=3, max_length=100)
  source: str = "camera"
  original_filename: str | None = Field(default=None, alias="originalFilename", max_length=255)
  byte_size: int | None = Field(default=None, alias="byteSize", ge=0)
  width: int | None = Field(default=None, gt=0)
  height: int | None = Field(default=None, gt=0)


class CompleteUploadRequest(CamelModel):
  media_kind: str = Field(alias="mediaKind", pattern=r"^[a-zA-Z0-9_-]+$")
  source: str = "camera"
  bucket: str = Field(min_length=3, max_length=255)
  object_key: str = Field(alias="objectKey", min_length=1, max_length=1024)
  cdn_url: str | None = Field(default=None, alias="cdnUrl", max_length=2048)
  content_type: str | None = Field(default=None, alias="contentType", max_length=100)
  byte_size: int | None = Field(default=None, alias="byteSize", ge=0)
  width: int | None = Field(default=None, gt=0)
  height: int | None = Field(default=None, gt=0)
  checksum_sha256: str | None = Field(default=None, alias="checksumSha256", max_length=64)
  original_filename: str | None = Field(default=None, alias="originalFilename", max_length=255)


class PhotoCaptureCreate(CamelModel):
  media_id: UUID = Field(alias="mediaId")
  capture_type: str = Field(alias="captureType")
  source: str = "camera"
  device_payload: dict = Field(default_factory=dict, alias="devicePayload")