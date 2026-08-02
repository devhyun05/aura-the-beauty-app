from uuid import uuid4

import pytest

from app.core.errors import AppError
from app.core.settings import Settings
from app.services import media_deletion as media_deletion_service
from app.services.media_deletion import collect_report_media_refs
from app.services.s3 import S3Service, is_makeup_recommendation_object_key


def test_collect_report_media_refs_limits_to_report_owned_objects() -> None:
  source_media_id = uuid4()
  golden_mask_media_id = uuid4()
  refs = collect_report_media_refs(
    {
      "source_media_bucket": "aura-mobile-media-dev",
      "source_media_id": source_media_id,
      "source_media_object_key": "uploads/capture/source-face.jpg",
      "golden_mask_media_bucket": "aura-mobile-media-dev",
      "golden_mask_media_id": golden_mask_media_id,
      "golden_mask_media_object_key": "uploads/golden-mask/mask.auragm",
      "detail_payload": {
        "result": {
          "recommendedMakeups": [
            {
              "imageUrl": (
                "https://d3t1pbvtir1lj.cloudfront.net/"
                "uploads/generated-makeup/look-1.jpg"
              ),
            },
            {
              "imageUrl": (
                "https://d3t1pbvtir1lj.cloudfront.net/"
                "uploads/app-assets/logo/aura-mark-placeholder.png"
              ),
            },
            {"objectKey": "uploads/products/shared-product.png"},
          ],
        },
      },
    },
    cdn_base_url="https://d3t1pbvtir1lj.cloudfront.net",
    default_bucket="aura-mobile-media-dev",
  )

  object_keys = sorted(ref.object_key for ref in refs)

  assert object_keys == [
    "uploads/capture/source-face.jpg",
    "uploads/generated-makeup/look-1.jpg",
    "uploads/golden-mask/mask.auragm",
  ]
  refs_by_key = {ref.object_key: ref for ref in refs}
  assert refs_by_key["uploads/capture/source-face.jpg"].media_asset_id == source_media_id
  assert refs_by_key["uploads/golden-mask/mask.auragm"].media_asset_id == golden_mask_media_id

def test_legacy_face_analysis_source_is_report_owned_object() -> None:
  assert media_deletion_service.is_report_owned_object_key(
    "uploads/face-analysis-source/source-face.jpg",
  ) is True


def test_private_user_media_is_report_owned_object() -> None:
  assert media_deletion_service.is_report_owned_object_key(
    "private/user-media/users/user-id/capture/media-id.jpg",
  ) is True


def test_makeup_recommendation_objects_are_managed_s3_targets() -> None:
  settings = Settings(
    s3_bucket_name="aura-media",
    makeup_private_asset_prefix="private/generated-makeup-recommendations",
  )
  service = S3Service(settings)
  public_key = "uploads/generated-makeup-recommendations/report/look.webp"
  private_key = "private/generated-makeup-recommendations/report/look.webp"

  service.assert_managed_media_location(bucket="aura-media", object_key=public_key)
  service.assert_managed_media_location(bucket="aura-media", object_key=private_key)
  assert is_makeup_recommendation_object_key(public_key, settings) is True
  assert is_makeup_recommendation_object_key(private_key, settings) is True

  with pytest.raises(AppError):
    service.assert_managed_media_location(bucket="other-bucket", object_key=private_key)
  with pytest.raises(AppError):
    service.assert_managed_media_location(bucket="aura-media", object_key="private/unmanaged/look.webp")


@pytest.mark.asyncio
async def test_schema_installs_active_media_reference_guards() -> None:
  statements: list[str] = []

  class Connection:
    async def execute(self, query: str, *_args):
      statements.append(" ".join(query.split()).lower())
      return "OK"

  await media_deletion_service.ensure_media_deletion_schema_connection(Connection())

  combined = " ".join(statements)
  assert "create or replace function aura_require_active_media_reference" in combined
  assert "create or replace function aura_require_active_photo_capture_media" in combined
  assert "status = 'active'" in combined
  assert "for key share" in combined
  assert "for key share of media" in combined
  for reference in (
    "('analysis_reports', 'source_media_id')",
    "('hair_analyses', 'mask_media_id')",
    "('makeup_recommendation_assets', 'input_media_id')",
    "('community_thread_media', 'media_id')",
    "('consulting_message_media', 'media_id')",
  ):
    assert reference in combined
  for capture_reference in (
    "('analysis_reports', 'photo_capture_id')",
    "('filter_extraction_reports', 'photo_capture_id')",
    "('makeup_feedback_reports', 'photo_capture_id')",
  ):
    assert capture_reference in combined


@pytest.mark.asyncio
async def test_enqueue_transitions_media_to_deletion_pending_before_outbox(monkeypatch) -> None:
  report_id = uuid4()
  media_id = uuid4()
  outbox_id = uuid4()
  events: list[str] = []

  async def unreferenced(*_args, **_kwargs):
    events.append("reference-check")
    return False

  monkeypatch.setattr(media_deletion_service, "is_media_object_referenced", unreferenced)

  class Connection:
    async def fetch(self, query: str, *_args):
      assert "for update" in query.lower()
      events.append("media-lock")
      return [{"id": media_id}]

    async def execute(self, query: str, *_args):
      normalized = " ".join(query.split()).lower()
      assert "set status = 'deletion_pending'" in normalized
      events.append("media-pending")
      return "UPDATE 1"

    async def fetchrow(self, query: str, *_args):
      assert "insert into media_deletion_outbox" in query.lower()
      events.append("outbox-insert")
      return {"id": outbox_id, "status": "pending"}

  ids, skipped = await media_deletion_service.enqueue_unreferenced_report_media_deletions(
    Connection(),
    report_id=report_id,
    refs=[
      media_deletion_service.MediaObjectRef(
        bucket="private-media",
        object_key="private/user-media/users/token/capture/file.jpg",
        media_asset_id=media_id,
      ),
    ],
  )

  assert ids == [outbox_id]
  assert skipped == 0
  assert events == ["media-lock", "reference-check", "media-pending", "outbox-insert"]


@pytest.mark.asyncio
async def test_reference_check_covers_every_media_fk_family() -> None:
  media_id = uuid4()
  checked_queries: list[str] = []

  class Connection:
    async def fetch(self, _query: str, *_args):
      return [{"id": media_id}]

    async def fetchval(self, query: str, *_args):
      checked_queries.append(" ".join(query.split()).lower())
      return False

  assert await media_deletion_service.is_media_object_referenced(
    Connection(),
    bucket="private-media",
    object_key="private/user-media/users/token/capture/file.jpg",
  ) is False

  media_query = checked_queries[0]
  for table in (
    "users",
    "analysis_reports",
    "hair_analyses",
    "hair_simulations",
    "saved_makeup_styles",
    "products",
    "product_recommendation_runs",
    "product_assets",
    "ar_filters",
    "filter_extraction_reports",
    "makeup_feedback_reports",
    "makeup_recommendation_assets",
    "home_hero_banners",
    "home_trend_items",
    "home_filter_store_items",
    "home_recommended_looks",
    "community_thread_media",
    "consulting_message_media",
    "photo_captures",
  ):
    assert f"from {table}" in media_query


@pytest.mark.asyncio
async def test_blocked_deletion_restores_delivery_eligibility() -> None:
  outbox_id = uuid4()
  executed: list[tuple[str, tuple]] = []

  class AsyncContext:
    async def __aenter__(self):
      return self

    async def __aexit__(self, _exc_type, _exc, _traceback):
      return False

  class Connection(AsyncContext):
    def transaction(self):
      return AsyncContext()

    async def fetchrow(self, query: str, *args):
      assert "for update" in query.lower()
      assert args == (outbox_id,)
      return {"bucket": "private-media", "object_key": "private/user-media/file.jpg"}

    async def execute(self, query: str, *args):
      executed.append((" ".join(query.split()).lower(), args))
      return "UPDATE 1"

  connection = Connection()

  class Pool:
    def acquire(self):
      return connection

  class Database:
    pool = Pool()

  await media_deletion_service.mark_media_deletion_outbox_blocked(
    Database(),
    outbox_id,
    "MEDIA_OBJECT_STILL_REFERENCED",
  )

  assert "set status = 'active'" in executed[0][0]
  assert executed[0][1] == ("private-media", "private/user-media/file.jpg")
  assert "set status = 'blocked'" in executed[1][0]


@pytest.mark.asyncio
async def test_golden_mask_outbox_permanently_deletes_s3_and_completes(
  monkeypatch,
) -> None:
  outbox_id = uuid4()
  media_id = uuid4()
  object_key = f"uploads/golden-mask/{media_id}.auragm"
  executed: list[tuple[str, tuple]] = []
  deleted_objects: list[tuple[str, str]] = []

  class AsyncContext:
    def __init__(self, value):
      self.value = value

    async def __aenter__(self):
      return self.value

    async def __aexit__(self, _exc_type, _exc, _traceback):
      return False

  class Connection:
    def transaction(self):
      return AsyncContext(self)

    async def fetchrow(self, query: str, *args):
      normalized = " ".join(query.split()).lower()
      if "update media_deletion_outbox" in normalized and "status = 'processing'" in normalized:
        assert args == (outbox_id,)
        return {
          "id": outbox_id,
          "report_id": None,
          "media_asset_id": media_id,
          "bucket": "private-bucket",
          "object_key": object_key,
        }
      raise AssertionError(f"Unexpected fetchrow: {query}")

    async def fetch(self, query: str, *args):
      assert "from media_assets" in query
      assert args == ("private-bucket", object_key)
      return []

    async def fetchval(self, query: str, *args):
      assert "position($2 in coalesce" in query
      assert args == (None, object_key)
      return False

    async def execute(self, query: str, *args):
      executed.append((query, args))
      return "UPDATE 1"

  connection = Connection()

  class Pool:
    def acquire(self):
      return AsyncContext(connection)

  class Database:
    pool = Pool()

  class FakeS3:
    def __init__(self, _settings):
      pass

    def delete_object(self, **_kwargs) -> None:
      raise AssertionError("Golden Mask objects must bypass recoverable S3 deletion.")

    def delete_object_permanently(self, *, bucket: str, object_key: str) -> None:
      deleted_objects.append((bucket, object_key))

  monkeypatch.setattr(media_deletion_service, "S3Service", FakeS3)

  await media_deletion_service.process_media_deletion_outbox_item(
    Database(),
    Settings(s3_bucket_name="private-bucket"),
    outbox_id,
  )

  assert deleted_objects == [("private-bucket", object_key)]
  normalized_updates = [" ".join(query.split()).lower() for query, _args in executed]
  assert any("update media_assets set status = 'deleted'" in query for query in normalized_updates)
  assert any(
    "update media_deletion_outbox set status = 'completed'" in query
    for query in normalized_updates
  )
