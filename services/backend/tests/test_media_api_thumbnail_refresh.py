import pytest

from app.api import media as media_api
from app.services.media_thumbnail_metadata import ThumbnailMetadata


class FakeSettings:
  effective_cdn_base_url = "https://cdn.example.com"


class FakeS3Service:
  def __init__(self, settings) -> None:
    self.settings = settings

  def client(self):
    return "s3-client"


@pytest.mark.asyncio
async def test_refresh_postprocessed_thumbnail_metadata_updates_when_thumbnail_exists(
  monkeypatch,
) -> None:
  calls = {}
  thumbnail = ThumbnailMetadata(
    bucket="aura-dev-bucket",
    object_key="uploads/capture/thumbnails/photo.jpg",
    cdn_url="https://cdn.example.com/uploads/capture/thumbnails/photo.jpg",
    content_type="image/jpeg",
    byte_size=1234,
    width=384,
    height=512,
  )

  async def fake_resolve(s3_client, **kwargs):
    calls["resolve"] = {"s3_client": s3_client, **kwargs}
    return thumbnail

  async def fake_update(db, media_id, resolved_thumbnail):
    calls["update"] = {
      "db": db,
      "media_id": media_id,
      "thumbnail": resolved_thumbnail,
    }

  monkeypatch.setattr(media_api, "S3Service", FakeS3Service)
  monkeypatch.setattr(media_api, "resolve_postprocessed_thumbnail_metadata", fake_resolve)
  monkeypatch.setattr(media_api, "update_media_thumbnail_metadata", fake_update)

  await media_api.refresh_postprocessed_thumbnail_metadata(
    "db",
    FakeSettings(),
    media_id="media-1",
    bucket="aura-dev-bucket",
    object_key="uploads/capture/photo.jpg",
  )

  assert calls["resolve"] == {
    "s3_client": "s3-client",
    "bucket": "aura-dev-bucket",
    "source_object_key": "uploads/capture/photo.jpg",
    "cdn_base_url": "https://cdn.example.com",
    "retry_delays_seconds": media_api.BACKGROUND_THUMBNAIL_RETRY_DELAYS_SECONDS,
  }
  assert calls["update"] == {
    "db": "db",
    "media_id": "media-1",
    "thumbnail": thumbnail,
  }


@pytest.mark.asyncio
async def test_refresh_postprocessed_thumbnail_metadata_skips_update_when_missing(
  monkeypatch,
) -> None:
  calls = {"updated": False}

  async def fake_resolve(*_args, **_kwargs):
    return None

  async def fake_update(*_args, **_kwargs):
    calls["updated"] = True

  monkeypatch.setattr(media_api, "S3Service", FakeS3Service)
  monkeypatch.setattr(media_api, "resolve_postprocessed_thumbnail_metadata", fake_resolve)
  monkeypatch.setattr(media_api, "update_media_thumbnail_metadata", fake_update)

  await media_api.refresh_postprocessed_thumbnail_metadata(
    "db",
    FakeSettings(),
    media_id="media-1",
    bucket="aura-dev-bucket",
    object_key="uploads/capture/photo.jpg",
  )

  assert calls["updated"] is False
