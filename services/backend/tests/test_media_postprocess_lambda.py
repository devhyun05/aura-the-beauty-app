import io

import pytest
from PIL import Image

import app.lambdas.media_postprocess as media_postprocess
from app.core.settings import Settings
from app.lambdas.media_postprocess import (
  AURA_POSTPROCESSED_METADATA_KEY,
  MediaPostprocessError,
  S3ObjectRef,
  handle_s3_event,
  iter_s3_object_created_records,
  process_image_bytes,
  process_s3_object,
  should_process_object_key,
  thumbnail_key_for,
  update_media_asset_postprocess_metadata,
)
from app.schemas.analysis import FilterExtractionAnalyzeRequest
from app.services.makeup_feedback_analysis import MakeupFeedbackBedrockService
from app.services.reference_makeup_extraction import ReferenceMakeupBedrockService


def _jpeg_with_exif(width: int = 1200, height: int = 800) -> bytes:
  image = Image.new("RGB", (width, height), color=(240, 120, 80))
  exif = Image.Exif()
  exif[0x010F] = "AURA test camera"
  output = io.BytesIO()
  image.save(output, format="JPEG", exif=exif)
  return output.getvalue()


def _jpeg_with_orientation(width: int = 80, height: int = 40) -> bytes:
  image = Image.new("RGB", (width, height), color=(80, 140, 220))
  exif = Image.Exif()
  exif[0x0112] = 6
  output = io.BytesIO()
  image.save(output, format="JPEG", exif=exif)
  return output.getvalue()


def test_iter_s3_object_created_records_decodes_s3_keys() -> None:
  event = {
    "Records": [
      {
        "eventSource": "aws:s3",
        "s3": {
          "bucket": {"name": "aura-dev-bucket"},
          "object": {"key": "uploads/capture/face+one%20two.jpg"},
        },
      },
      {"eventSource": "aws:sqs"},
    ],
  }

  refs = iter_s3_object_created_records(event)

  assert refs == [
    S3ObjectRef(
      bucket="aura-dev-bucket",
      object_key="uploads/capture/face one two.jpg",
    ),
  ]


def test_should_process_object_key_only_allows_user_analysis_images() -> None:
  assert should_process_object_key("uploads/capture/photo.jpg") is True
  assert should_process_object_key("uploads/makeup_feedback/photo.webp") is True
  assert should_process_object_key("uploads/filter-extraction/photo.png") is True
  assert should_process_object_key("uploads/capture/thumbnails/photo.jpg") is False
  assert should_process_object_key("uploads/makeup-filters/filter.png") is False
  assert should_process_object_key("uploads/generated-makeup/photo.jpg") is False
  assert should_process_object_key("uploads/capture/readme.txt") is False


def test_thumbnail_key_for_preserves_directory() -> None:
  assert thumbnail_key_for("uploads/capture/photo.jpg") == "uploads/capture/thumbnails/photo.jpg"
  assert thumbnail_key_for("photo.png") == "thumbnails/photo.jpg"


def test_process_image_bytes_removes_exif_and_creates_thumbnail() -> None:
  processed = process_image_bytes(_jpeg_with_exif())

  sanitized = Image.open(io.BytesIO(processed.body))
  thumbnail = Image.open(io.BytesIO(processed.thumbnail_body))

  assert processed.content_type == "image/jpeg"
  assert processed.width == 1200
  assert processed.height == 800
  assert processed.exif_removed is True
  assert not sanitized.getexif()
  assert max(thumbnail.size) <= 512
  assert processed.thumbnail_content_type == "image/jpeg"


def test_process_image_bytes_rejects_images_above_pixel_limit(monkeypatch) -> None:
  monkeypatch.setattr(media_postprocess, "MAX_IMAGE_PIXELS", 100)

  with pytest.raises(MediaPostprocessError, match="maximum pixel count"):
    process_image_bytes(_jpeg_with_exif(width=20, height=20))


class FakeBody:
  def __init__(self, body: bytes) -> None:
    self.body = body

  def read(self) -> bytes:
    return self.body


class FakeS3Client:
  def __init__(
    self,
    *,
    body: bytes | None = None,
    content_type: str = "image/jpeg",
    metadata: dict | None = None,
  ) -> None:
    self.body = body or _jpeg_with_exif()
    self.content_type = content_type
    self.metadata = metadata or {}
    self.puts: list[dict] = []

  def get_object(self, **kwargs):
    self.get_object_kwargs = kwargs
    return {
      "Body": FakeBody(self.body),
      "ContentType": self.content_type,
      "Metadata": self.metadata,
    }

  def put_object(self, **kwargs):
    self.puts.append(kwargs)
    return {}


def test_process_s3_object_overwrites_original_and_writes_thumbnail() -> None:
  s3_client = FakeS3Client(metadata={"existing": "value"})

  result = process_s3_object(
    s3_client,
    S3ObjectRef("aura-dev-bucket", "uploads/capture/photo.jpg"),
  )

  assert result is not None
  assert s3_client.get_object_kwargs == {
    "Bucket": "aura-dev-bucket",
    "Key": "uploads/capture/photo.jpg",
  }
  assert len(s3_client.puts) == 2
  assert s3_client.puts[0]["Key"] == "uploads/capture/photo.jpg"
  assert s3_client.puts[0]["ContentType"] == "image/jpeg"
  assert s3_client.puts[0]["Metadata"]["existing"] == "value"
  assert s3_client.puts[0]["Metadata"][AURA_POSTPROCESSED_METADATA_KEY] == "true"
  assert s3_client.puts[1]["Key"] == "uploads/capture/thumbnails/photo.jpg"
  assert result.thumbnail_object_key == "uploads/capture/thumbnails/photo.jpg"
  assert result.width == 1200
  assert result.height == 800


def test_process_s3_object_skips_already_processed_object() -> None:
  s3_client = FakeS3Client(metadata={AURA_POSTPROCESSED_METADATA_KEY: "true"})

  result = process_s3_object(
    s3_client,
    S3ObjectRef("aura-dev-bucket", "uploads/capture/photo.jpg"),
  )

  assert result is None
  assert s3_client.puts == []


def test_handle_s3_event_returns_processed_results() -> None:
  event = {
    "Records": [
      {
        "eventSource": "aws:s3",
        "s3": {
          "bucket": {"name": "aura-dev-bucket"},
          "object": {"key": "uploads/capture/photo.jpg"},
        },
      },
    ],
  }

  results = handle_s3_event(event, s3_client=FakeS3Client())

  assert len(results) == 1
  assert results[0].object_key == "uploads/capture/photo.jpg"


class FakeDB:
  def __init__(self, row: dict | None = None) -> None:
    self.row = row or {"id": "media-id"}
    self.calls: list[tuple] = []

  async def fetchrow(self, query: str, *args):
    self.calls.append((query, *args))
    return self.row


@pytest.mark.asyncio
async def test_update_media_asset_postprocess_metadata_updates_thumbnail_fields() -> None:
  result = process_s3_object(
    FakeS3Client(),
    S3ObjectRef("aura-dev-bucket", "uploads/capture/photo.jpg"),
  )
  db = FakeDB()

  updated = await update_media_asset_postprocess_metadata(
    db,
    result,
    cdn_base_url="https://cdn.example.com",
  )

  call = db.calls[0]

  assert updated is True
  assert "update media_assets" in call[0]
  assert call[1] == "aura-dev-bucket"
  assert call[2] == "uploads/capture/photo.jpg"
  assert call[8] == "uploads/capture/thumbnails/photo.jpg"
  assert call[9] == "https://cdn.example.com/uploads/capture/thumbnails/photo.jpg"

def test_process_image_bytes_applies_exif_orientation_before_removal() -> None:
  processed = process_image_bytes(_jpeg_with_orientation())

  with Image.open(io.BytesIO(processed.body)) as sanitized:
    assert sanitized.size == (40, 80)
    assert not sanitized.getexif()

  assert processed.width == 40
  assert processed.height == 80
  assert processed.exif_removed is True


@pytest.mark.asyncio
async def test_feedback_worker_sanitizes_image_before_bedrock(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  service = MakeupFeedbackBedrockService(Settings())
  captured: dict[str, object] = {}

  monkeypatch.setattr(service, "_read_image_bytes", lambda _payload: _jpeg_with_orientation())

  def fake_analyze(payload, image_bytes, content_type):
    captured["payload"] = payload
    captured["content_type"] = content_type

    with Image.open(io.BytesIO(image_bytes)) as image:
      captured["size"] = image.size
      captured["has_exif"] = bool(image.getexif())

    return {"status": "ok"}

  monkeypatch.setattr(service, "_analyze_sync", fake_analyze)

  result = await service.analyze({"contentType": "image/jpeg"})

  assert result == {"status": "ok"}
  assert captured["content_type"] == "image/jpeg"
  assert captured["size"] == (40, 80)
  assert captured["has_exif"] is False


@pytest.mark.asyncio
async def test_reference_worker_sanitizes_image_before_bedrock(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  service = ReferenceMakeupBedrockService(Settings())
  captured: dict[str, object] = {}
  payload = FilterExtractionAnalyzeRequest(runAi=True)

  monkeypatch.setattr(
    service,
    "_read_reference_image_bytes",
    lambda _payload: _jpeg_with_orientation(),
  )

  def fake_analyze(received_payload, image_bytes, content_type):
    captured["payload"] = received_payload
    captured["content_type"] = content_type

    with Image.open(io.BytesIO(image_bytes)) as image:
      captured["size"] = image.size
      captured["has_exif"] = bool(image.getexif())

    return {"status": "ok"}

  monkeypatch.setattr(service, "_analyze_sync", fake_analyze)

  result = await service.analyze(payload)

  assert result == {"status": "ok"}
  assert captured["payload"] is payload
  assert captured["content_type"] == "image/jpeg"
  assert captured["size"] == (40, 80)
  assert captured["has_exif"] is False
