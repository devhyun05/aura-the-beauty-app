import io

import pytest
from botocore.exceptions import ClientError
from PIL import Image

from app.services.media_thumbnail_metadata import (
  expected_postprocessed_thumbnail_metadata,
  read_thumbnail_metadata,
  resolve_postprocessed_thumbnail_metadata,
  should_resolve_postprocessed_thumbnail,
  thumbnail_key_for,
)


def _jpeg(width: int = 512, height: int = 341) -> bytes:
  image = Image.new("RGB", (width, height), color=(210, 120, 90))
  output = io.BytesIO()
  image.save(output, format="JPEG")
  return output.getvalue()


class FakeBody:
  def __init__(self, body: bytes) -> None:
    self.body = body

  def read(self) -> bytes:
    return self.body


class FakeS3Client:
  def __init__(self, *, body: bytes | None = None, exists: bool = True) -> None:
    self.body = body or _jpeg()
    self.exists = exists

  def head_object(self, **kwargs):
    self.head_kwargs = kwargs

    if not self.exists:
      raise ClientError(
        {
          "Error": {"Code": "404", "Message": "Not Found"},
          "ResponseMetadata": {"HTTPStatusCode": 404},
        },
        "HeadObject",
      )

    return {
      "ContentLength": len(self.body),
      "ContentType": "image/jpeg",
    }

  def get_object(self, **kwargs):
    self.get_kwargs = kwargs
    return {"Body": FakeBody(self.body)}


def test_thumbnail_key_for_capture_object() -> None:
  assert (
    thumbnail_key_for("uploads/capture/photo.jpg")
    == "uploads/capture/thumbnails/photo.jpg"
  )


def test_should_resolve_postprocessed_thumbnail_only_for_user_analysis_images() -> None:
  assert should_resolve_postprocessed_thumbnail("uploads/capture/photo.jpg") is True
  assert should_resolve_postprocessed_thumbnail("uploads/makeup_feedback/photo.jpg") is True
  assert should_resolve_postprocessed_thumbnail("uploads/filter-extraction/photo.jpg") is True
  assert should_resolve_postprocessed_thumbnail("uploads/capture/thumbnails/photo.jpg") is False
  assert should_resolve_postprocessed_thumbnail("uploads/makeup-filters/filter.png") is False
  assert should_resolve_postprocessed_thumbnail("uploads/generated-makeup/photo.jpg") is False
  assert should_resolve_postprocessed_thumbnail("uploads/capture/readme.txt") is False


def test_read_thumbnail_metadata_returns_image_dimensions_and_cdn_url() -> None:
  s3_client = FakeS3Client(body=_jpeg(320, 240))

  metadata = read_thumbnail_metadata(
    s3_client,
    bucket="aura-dev-bucket",
    object_key="uploads/capture/thumbnails/photo.jpg",
    cdn_base_url="https://cdn.example.com",
  )

  assert metadata is not None
  assert metadata.bucket == "aura-dev-bucket"
  assert metadata.object_key == "uploads/capture/thumbnails/photo.jpg"
  assert metadata.cdn_url == "https://cdn.example.com/uploads/capture/thumbnails/photo.jpg"
  assert metadata.content_type == "image/jpeg"
  assert metadata.byte_size == len(s3_client.body)
  assert metadata.width == 320
  assert metadata.height == 240


def test_read_thumbnail_metadata_returns_none_when_object_is_missing() -> None:
  metadata = read_thumbnail_metadata(
    FakeS3Client(exists=False),
    bucket="aura-dev-bucket",
    object_key="uploads/capture/thumbnails/photo.jpg",
    cdn_base_url=None,
  )

  assert metadata is None


def test_expected_postprocessed_thumbnail_metadata_returns_stable_location_without_s3_head() -> None:
  metadata = expected_postprocessed_thumbnail_metadata(
    bucket="aura-dev-bucket",
    source_object_key="uploads/capture/photo.jpg",
    cdn_base_url="https://cdn.example.com",
  )

  assert metadata is not None
  assert metadata.bucket == "aura-dev-bucket"
  assert metadata.object_key == "uploads/capture/thumbnails/photo.jpg"
  assert metadata.cdn_url == "https://cdn.example.com/uploads/capture/thumbnails/photo.jpg"
  assert metadata.content_type == "image/jpeg"
  assert metadata.byte_size is None
  assert metadata.width is None
  assert metadata.height is None


@pytest.mark.asyncio
async def test_resolve_postprocessed_thumbnail_metadata_uses_expected_key() -> None:
  s3_client = FakeS3Client(body=_jpeg(512, 341))

  metadata = await resolve_postprocessed_thumbnail_metadata(
    s3_client,
    bucket="aura-dev-bucket",
    source_object_key="uploads/capture/photo.jpg",
    cdn_base_url=None,
    retry_delays_seconds=(),
  )

  assert metadata is not None
  assert metadata.object_key == "uploads/capture/thumbnails/photo.jpg"
  assert s3_client.head_kwargs == {
    "Bucket": "aura-dev-bucket",
    "Key": "uploads/capture/thumbnails/photo.jpg",
  }
