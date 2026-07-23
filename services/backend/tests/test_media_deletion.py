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
