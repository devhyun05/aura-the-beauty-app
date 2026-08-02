from uuid import UUID

import pytest

from app.api import analysis as analysis_api
from app.api import feedback as feedback_api
from app.api import filter_extractions as filter_extractions_api
from app.core.errors import AppError
from app.services import private_media_delivery


USER_ID = UUID("10000000-0000-0000-0000-000000000001")
MEDIA_ID = UUID("20000000-0000-0000-0000-000000000001")
PREVIEW_MEDIA_ID = UUID("20000000-0000-0000-0000-000000000002")
FOREIGN_MEDIA_ID = UUID("20000000-0000-0000-0000-000000000003")


class OwnedMediaDatabase:
  def __init__(self) -> None:
    self.args = ()
    self.query = ""

  async def fetch(self, query, *args):
    self.query = query
    self.args = args
    requested = {str(item) for item in args[0]}
    rows = [
      {
        "id": MEDIA_ID,
        "bucket": "private-media",
        "object_key": "uploads/face-analysis-source/source.jpg",
      },
      {
        "id": PREVIEW_MEDIA_ID,
        "bucket": "private-media",
        "object_key": "uploads/capture/preview.jpg",
      },
    ]
    return [row for row in rows if str(row["id"]) in requested]


class FakeS3Service:
  counter = 0
  asserted: list[tuple[str, str]] = []

  def __init__(self, _settings) -> None:
    pass

  def assert_managed_media_location(self, *, bucket, object_key) -> None:
    self.asserted.append((bucket, object_key))

  def create_presigned_download(self, *, bucket, object_key, expires_in) -> str:
    type(self).counter += 1
    return f"https://signed.example/{object_key}?generation={self.counter}&ttl={expires_in}"


@pytest.fixture(autouse=True)
def reset_fake_s3(monkeypatch):
  FakeS3Service.counter = 0
  FakeS3Service.asserted = []
  monkeypatch.setattr(private_media_delivery, "S3Service", FakeS3Service)


@pytest.mark.asyncio
async def test_delivery_urls_are_owner_scoped_fresh_and_response_only():
  db = OwnedMediaDatabase()

  first = await private_media_delivery.create_owned_media_delivery_urls(
    db,
    object(),
    owner_user_id=USER_ID,
    media_ids=[MEDIA_ID, FOREIGN_MEDIA_ID],
  )
  second = await private_media_delivery.create_owned_media_delivery_urls(
    db,
    object(),
    owner_user_id=USER_ID,
    media_ids=[MEDIA_ID],
  )

  normalized_query = " ".join(db.query.split()).lower()
  assert "owner_user_id = $2" in normalized_query
  assert "status = 'active'" in normalized_query
  assert "deleted_at is null" in normalized_query
  assert db.args[1] == USER_ID
  assert str(MEDIA_ID) in first
  assert str(FOREIGN_MEDIA_ID) not in first
  assert first[str(MEDIA_ID)] != second[str(MEDIA_ID)]
  assert all(call[0] == "private-media" for call in FakeS3Service.asserted)


@pytest.mark.asyncio
async def test_delivery_skips_only_unmanaged_legacy_rows(monkeypatch):
  class MixedDatabase:
    async def fetch(self, _query, *_args):
      return [
        {
          "id": FOREIGN_MEDIA_ID,
          "bucket": "attacker-bucket",
          "object_key": "outside/owner-photo.jpg",
        },
        {
          "id": MEDIA_ID,
          "bucket": "private-media",
          "object_key": "private/user-media/users/owner/capture/upload/media.jpg",
        },
      ]

  original_assert = FakeS3Service.assert_managed_media_location

  def reject_unmanaged(self, *, bucket, object_key):
    if bucket == "attacker-bucket":
      raise AppError(403, "S3_TARGET_NOT_MANAGED", "outside managed media")
    return original_assert(self, bucket=bucket, object_key=object_key)

  monkeypatch.setattr(FakeS3Service, "assert_managed_media_location", reject_unmanaged)

  urls = await private_media_delivery.create_owned_media_delivery_urls(
    MixedDatabase(),
    object(),
    owner_user_id=USER_ID,
    media_ids=[FOREIGN_MEDIA_ID, MEDIA_ID],
  )

  assert str(FOREIGN_MEDIA_ID) not in urls
  assert str(MEDIA_ID) in urls


@pytest.mark.asyncio
async def test_delivery_does_not_hide_private_media_configuration_failures(monkeypatch):
  def fail_configuration(_self, *, bucket, object_key):
    raise AppError(503, "PRIVATE_MEDIA_BUCKET_NOT_CONFIGURED", "missing private bucket")

  monkeypatch.setattr(FakeS3Service, "assert_managed_media_location", fail_configuration)

  with pytest.raises(AppError, match="missing private bucket") as exc_info:
    await private_media_delivery.create_owned_media_delivery_urls(
      OwnedMediaDatabase(),
      object(),
      owner_user_id=USER_ID,
      media_ids=[MEDIA_ID],
    )

  assert exc_info.value.status_code == 503


def test_payload_projection_removes_storage_locations_without_mutating_source():
  payload = {
    "request": {
      "bucket": "private-media",
      "objectKey": "uploads/capture/original.jpg",
      "cdnUrl": "https://public.example/original.jpg",
      "sourceUrl": "https://public.example/original.jpg",
      "contentType": "image/jpeg",
    },
    "result": {"score": 90},
  }

  projected = private_media_delivery.project_payload_with_private_media(
    payload,
    delivery_url="https://signed.example/original.jpg?signature=one",
  )

  assert projected["request"]["cdnUrl"].startswith("https://signed.example/")
  assert "bucket" not in projected["request"]
  assert "objectKey" not in projected["request"]
  assert "sourceUrl" not in projected["request"]
  assert payload["request"]["bucket"] == "private-media"
  assert payload["request"]["cdnUrl"].startswith("https://public.example/")


def test_projection_fails_closed_when_no_signed_url_is_available():
  media = {
    "id": str(MEDIA_ID),
    "bucket": "legacy-bucket",
    "object_key": "uploads/legacy.jpg",
    "cdn_url": "https://legacy.example/image.jpg",
    "thumbnail_object_key": "uploads/legacy-thumb.jpg",
    "thumbnail_cdn_url": "https://legacy.example/thumb.jpg",
  }
  payload = {
    "request": {
      "bucket": "legacy-bucket",
      "objectKey": "uploads/legacy.jpg",
      "cdnUrl": "https://legacy.example/image.jpg",
      "storageBucket": "legacy-bucket",
      "thumbnailUrl": "https://legacy.example/thumb.jpg",
    },
  }

  assert private_media_delivery.project_private_media_reference(media, None) == {
    "id": str(MEDIA_ID),
  }
  assert private_media_delivery.project_payload_with_private_media(
    payload,
    delivery_url=None,
  ) == {"request": {}}


@pytest.mark.asyncio
async def test_face_report_projects_signed_urls_and_hides_s3_locations(monkeypatch):
  async def fake_urls(_db, _settings, *, owner_user_id, media_ids, expires_in=900):
    assert owner_user_id == USER_ID
    assert {str(item) for item in media_ids if item} == {
      str(MEDIA_ID),
      str(PREVIEW_MEDIA_ID),
    }
    return {
      str(MEDIA_ID): "https://signed.example/source",
      str(PREVIEW_MEDIA_ID): "https://signed.example/preview",
    }

  monkeypatch.setattr(analysis_api, "create_owned_media_delivery_urls", fake_urls)
  report = {
    "source_media_id": MEDIA_ID,
    "preview_media_id": PREVIEW_MEDIA_ID,
    "source_media": {
      "id": str(MEDIA_ID),
      "bucket": "private-media",
      "object_key": "uploads/face-analysis-source/source.jpg",
      "cdn_url": "https://public.example/source.jpg",
    },
    "preview_media": {
      "id": str(PREVIEW_MEDIA_ID),
      "bucket": "private-media",
      "object_key": "uploads/capture/preview.jpg",
      "cdn_url": "https://public.example/preview.jpg",
    },
    "detail_payload": {
      "request": {
        "bucket": "private-media",
        "objectKey": "uploads/face-analysis-source/source.jpg",
        "cdnUrl": "https://public.example/source.jpg",
      },
    },
  }

  projected = (
    await analysis_api.project_analysis_reports_with_private_media(
      object(),
      object(),
      owner_user_id=USER_ID,
      reports=[report],
    )
  )[0]

  assert projected["source_media"] == {
    "id": str(MEDIA_ID),
    "cdn_url": "https://signed.example/source",
  }
  assert projected["preview_media"] == {
    "id": str(PREVIEW_MEDIA_ID),
    "cdn_url": "https://signed.example/preview",
  }
  assert projected["detail_payload"]["request"] == {
    "cdnUrl": "https://signed.example/source",
    "previewUrl": "https://signed.example/preview",
  }


@pytest.mark.asyncio
@pytest.mark.parametrize(
  ("module", "project", "media_field", "payload_field"),
  [
    (
      feedback_api,
      feedback_api.project_feedback_reports_with_private_media,
      "uploaded_media_id",
      "feedback_payload",
    ),
    (
      filter_extractions_api,
      filter_extractions_api.project_filter_extraction_reports_with_private_media,
      "result_media_id",
      "result_payload",
    ),
  ],
)
async def test_report_payloads_receive_only_short_lived_delivery_url(
  monkeypatch,
  module,
  project,
  media_field,
  payload_field,
):
  async def fake_urls(_db, _settings, *, owner_user_id, media_ids, expires_in=900):
    assert owner_user_id == USER_ID
    assert [str(item) for item in media_ids] == [str(MEDIA_ID)]
    return {str(MEDIA_ID): "https://signed.example/report-photo"}

  monkeypatch.setattr(module, "create_owned_media_delivery_urls", fake_urls)
  report = {
    media_field: MEDIA_ID,
    payload_field: {
      "request": {
        "bucket": "private-media",
        "objectKey": "uploads/capture/report.jpg",
        "cdnUrl": "https://public.example/report.jpg",
      },
      "result": {"ok": True},
    },
  }

  projected = (
    await project(
      object(),
      object(),
      owner_user_id=USER_ID,
      reports=[report],
    )
  )[0]

  request = projected[payload_field]["request"]
  assert request == {"cdnUrl": "https://signed.example/report-photo"}
  assert report[payload_field]["request"]["bucket"] == "private-media"
