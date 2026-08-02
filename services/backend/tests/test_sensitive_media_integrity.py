from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.account_identity import log_identifier_token
from app.services.media_uploads import (
  _sensitive_final_object_key,
  complete_upload_session,
  sanitize_sensitive_image,
)
from app.services.s3 import PRIVATE_USER_MEDIA_STAGING_PREFIX, S3Service


def _image_bytes(*, image_format: str = "JPEG", size: tuple[int, int] = (320, 240)) -> bytes:
  output = BytesIO()
  Image.new("RGB", size, (184, 136, 112)).save(output, format=image_format)
  return output.getvalue()


def test_log_identifier_token_is_stable_and_does_not_expose_uuid() -> None:
  identifier = uuid4()
  first = log_identifier_token(identifier)

  assert first == log_identifier_token(identifier)
  assert str(identifier) not in first
  assert len(first) == 16


def test_sensitive_image_is_decoded_and_reencoded_without_metadata() -> None:
  source = BytesIO()
  image = Image.new("RGB", (320, 240), (184, 136, 112))
  exif = Image.Exif()
  exif[0x010E] = "private test metadata"
  image.save(source, format="JPEG", exif=exif)

  result = sanitize_sensitive_image(source.getvalue(), expected_content_type="image/jpeg")

  assert result.content_type == "image/jpeg"
  assert result.source_format == "JPEG"
  assert (result.width, result.height) == (320, 240)
  with Image.open(BytesIO(result.body)) as sanitized:
    assert sanitized.format == "JPEG"
    assert sanitized.getexif() == {}


def test_sensitive_image_rejects_declared_type_that_does_not_match_bytes() -> None:
  with pytest.raises(AppError) as exc_info:
    sanitize_sensitive_image(_image_bytes(), expected_content_type="image/png")

  assert exc_info.value.code == "UPLOAD_IMAGE_FORMAT_MISMATCH"


def test_sensitive_image_rejects_multi_frame_image() -> None:
  output = BytesIO()
  first = Image.new("RGB", (64, 64), "red")
  second = Image.new("RGB", (64, 64), "blue")
  first.save(output, format="PNG", save_all=True, append_images=[second], duration=100, loop=0)

  with pytest.raises(AppError) as exc_info:
    sanitize_sensitive_image(output.getvalue(), expected_content_type="image/png")

  assert exc_info.value.code == "UPLOAD_IMAGE_ANIMATED"


def test_sensitive_image_rejects_excessive_pixel_count(monkeypatch) -> None:
  monkeypatch.setattr("app.services.media_uploads.SENSITIVE_IMAGE_MAX_PIXELS", 1_000)

  with pytest.raises(AppError) as exc_info:
    sanitize_sensitive_image(_image_bytes(size=(100, 100)), expected_content_type="image/jpeg")

  assert exc_info.value.code == "UPLOAD_IMAGE_PIXELS_EXCEEDED"


def test_sensitive_presign_uses_isolated_staging_bucket_and_encryption(monkeypatch) -> None:
  captured: dict = {}

  class FakeClient:
    def generate_presigned_url(self, operation: str, *, Params: dict, ExpiresIn: int) -> str:
      captured.update({"operation": operation, "params": Params, "expires": ExpiresIn})
      return "https://upload.example.com/signed"

  service = S3Service(
    Settings(
      environment="production",
      s3_bucket_name="public-media",
      private_media_bucket_name="private-user-media",
      cdn_base_url="https://cdn.example.com",
    ),
  )
  monkeypatch.setattr(service, "_client", lambda: FakeClient())

  result = service.create_presigned_upload("capture", "image/jpeg", "face.jpg")

  assert result["bucket"] == "private-user-media"
  assert result["object_key"].startswith(PRIVATE_USER_MEDIA_STAGING_PREFIX)
  assert result["cdn_url"] is None
  assert result["cache_control"] == "private, no-store"
  assert result["headers"]["x-amz-server-side-encryption"] == "AES256"
  assert captured["params"]["ServerSideEncryption"] == "AES256"


def test_sensitive_presign_fails_closed_without_private_production_bucket() -> None:
  service = S3Service(Settings(environment="production", s3_bucket_name="public-media"))

  with pytest.raises(AppError) as exc_info:
    service.create_presigned_upload("capture", "image/jpeg", "face.jpg")

  assert exc_info.value.code == "PRIVATE_MEDIA_BUCKET_NOT_CONFIGURED"


def test_concurrent_finalization_attempts_get_distinct_immutable_keys() -> None:
  owner_id = uuid4()
  upload_id = uuid4()
  session = {"owner_user_id": owner_id, "partner_account_id": None, "media_kind": "capture"}

  first = _sensitive_final_object_key(session, upload_id, uuid4())
  second = _sensitive_final_object_key(session, upload_id, uuid4())

  assert first != second
  assert first.startswith(f"private/user-media/users/{owner_id}/capture/{upload_id}/")


def test_production_private_bucket_cannot_reuse_cdn_bucket() -> None:
  service = S3Service(
    Settings(
      environment="production",
      s3_bucket_name="shared-media",
      private_media_bucket_name="shared-media",
    ),
  )

  with pytest.raises(AppError) as exc_info:
    service.create_presigned_upload("capture", "image/jpeg", "face.jpg")

  assert exc_info.value.code == "PRIVATE_MEDIA_BUCKET_NOT_ISOLATED"


@pytest.mark.asyncio
async def test_final_object_has_durable_guard_before_put_and_atomic_completion() -> None:
  owner_id = uuid4()
  upload_id = uuid4()
  guard_id = uuid4()
  source_bytes = _image_bytes()
  staging_key = f"{PRIVATE_USER_MEDIA_STAGING_PREFIX}{upload_id}.jpg"
  events: list[str] = []
  session = {
    "id": upload_id,
    "owner_user_id": owner_id,
    "partner_account_id": None,
    "media_kind": "capture",
    "source": "camera",
    "bucket": "private-user-media",
    "object_key": staging_key,
    "cdn_url": None,
    "content_type": "image/jpeg",
    "expected_byte_size": len(source_bytes),
    "width": 320,
    "height": 240,
    "original_filename": "face.jpg",
    "thumbnail_bucket": None,
    "thumbnail_object_key": None,
    "thumbnail_cdn_url": None,
    "thumbnail_content_type": None,
    "thumbnail_expected_byte_size": None,
    "thumbnail_width": None,
    "thumbnail_height": None,
    "status": "pending",
    "is_active": True,
  }

  class GuardedDatabase:
    # A pool marks this as the production Database path without needing a real
    # connection for this focused service-level test.
    pool = object()

    async def fetchrow(self, query: str, *args):
      if "from media_upload_sessions\n    where id" in query:
        return session
      if "insert into media_deletion_outbox" in query:
        events.append("guard-created")
        assert args[2] == "sensitive_upload_unclaimed_final"
        return {"id": guard_id}
      if "with claimed as" in query:
        events.append("claim-and-guard-complete")
        normalized = " ".join(query.split()).lower()
        assert "guard_completed as" in normalized
        assert "where id = $13" in normalized
        assert args[12] == guard_id
        return {
          "id": args[3],
          "owner_user_id": owner_id,
          "bucket": args[4],
          "object_key": args[5],
        }
      raise AssertionError(f"Unexpected query: {query}")

  class GuardedS3:
    def get_object_metadata(self, **_kwargs):
      return {"byte_size": len(source_bytes), "content_type": "image/jpeg"}

    def get_object_bytes(self, **_kwargs):
      return source_bytes, "image/jpeg"

    def private_media_bucket(self) -> str:
      return "private-user-media"

    def put_private_object(self, **_kwargs) -> None:
      events.append("final-object-put")

    def delete_object_permanently(self, **_kwargs) -> None:
      events.append("staging-deleted")

  result = await complete_upload_session(
    GuardedDatabase(),
    Settings(
      environment="production",
      s3_bucket_name="public-media",
      private_media_bucket_name="private-user-media",
    ),
    upload_id,
    owner_user_id=owner_id,
    s3_service=GuardedS3(),
  )

  assert result["owner_user_id"] == owner_id
  assert events == [
    "guard-created",
    "final-object-put",
    "claim-and-guard-complete",
    "staging-deleted",
  ]


@pytest.mark.asyncio
async def test_invalid_sensitive_bytes_are_deleted_before_session_claim() -> None:
  owner_id = uuid4()
  upload_id = uuid4()
  invalid_bytes = b"this is not an image"
  session = {
    "id": upload_id,
    "owner_user_id": owner_id,
    "partner_account_id": None,
    "media_kind": "capture",
    "source": "camera",
    "bucket": "private-user-media",
    "object_key": f"{PRIVATE_USER_MEDIA_STAGING_PREFIX}{upload_id}.jpg",
    "cdn_url": None,
    "content_type": "image/jpeg",
    "expected_byte_size": len(invalid_bytes),
    "width": 320,
    "height": 240,
    "original_filename": "face.jpg",
    "thumbnail_bucket": None,
    "thumbnail_object_key": None,
    "thumbnail_cdn_url": None,
    "thumbnail_content_type": None,
    "thumbnail_expected_byte_size": None,
    "thumbnail_width": None,
    "thumbnail_height": None,
    "status": "pending",
    "is_active": True,
  }

  class FakeDatabase:
    claimed = False

    async def fetchrow(self, query: str, *args):
      if "from media_upload_sessions\n    where id" in query:
        return session
      if "with claimed as" in query:
        self.claimed = True
      raise AssertionError("Invalid media must not be claimed.")

  class FakeS3:
    def __init__(self) -> None:
      self.deleted: list[tuple[str, str]] = []

    def get_object_metadata(self, **_kwargs):
      return {"byte_size": len(invalid_bytes), "content_type": "image/jpeg"}

    def get_object_bytes(self, **_kwargs):
      return invalid_bytes, "image/jpeg"

    def delete_object_permanently(self, *, bucket: str, object_key: str) -> None:
      self.deleted.append((bucket, object_key))

  db = FakeDatabase()
  s3 = FakeS3()
  with pytest.raises(AppError) as exc_info:
    await complete_upload_session(
      db,
      Settings(
        environment="production",
        s3_bucket_name="public-media",
        private_media_bucket_name="private-user-media",
      ),
      upload_id,
      owner_user_id=owner_id,
      s3_service=s3,
    )

  assert exc_info.value.code == "UPLOAD_IMAGE_INVALID"
  assert db.claimed is False
  assert s3.deleted == [("private-user-media", session["object_key"])]

  class MismatchedMetadataS3(FakeS3):
    def get_object_metadata(self, **_kwargs):
      return {"byte_size": len(invalid_bytes), "content_type": "image/png"}

  mismatched_s3 = MismatchedMetadataS3()
  with pytest.raises(AppError) as metadata_error:
    await complete_upload_session(
      db,
      Settings(
        environment="production",
        s3_bucket_name="public-media",
        private_media_bucket_name="private-user-media",
      ),
      upload_id,
      owner_user_id=owner_id,
      s3_service=mismatched_s3,
    )

  assert metadata_error.value.code == "UPLOAD_CONTENT_TYPE_MISMATCH"
  assert mismatched_s3.deleted == [("private-user-media", session["object_key"])]


@pytest.mark.asyncio
async def test_losing_concurrent_finalization_deletes_only_its_unclaimed_final_object() -> None:
  owner_id = uuid4()
  upload_id = uuid4()
  source_bytes = _image_bytes()
  staging_key = f"{PRIVATE_USER_MEDIA_STAGING_PREFIX}{upload_id}.jpg"
  winner_key = f"private/user-media/users/{owner_id}/capture/{upload_id}/winner.jpg"
  winner = {
    "id": uuid4(),
    "owner_user_id": owner_id,
    "bucket": "private-user-media",
    "object_key": winner_key,
  }
  session = {
    "id": upload_id,
    "owner_user_id": owner_id,
    "partner_account_id": None,
    "media_kind": "capture",
    "source": "camera",
    "bucket": "private-user-media",
    "object_key": staging_key,
    "cdn_url": None,
    "content_type": "image/jpeg",
    "expected_byte_size": len(source_bytes),
    "width": 320,
    "height": 240,
    "original_filename": "face.jpg",
    "thumbnail_bucket": None,
    "thumbnail_object_key": None,
    "thumbnail_cdn_url": None,
    "thumbnail_content_type": None,
    "thumbnail_expected_byte_size": None,
    "thumbnail_width": None,
    "thumbnail_height": None,
    "status": "pending",
    "is_active": True,
  }

  class LostClaimDatabase:
    async def fetchrow(self, query: str, *args):
      if "from media_upload_sessions\n    where id" in query:
        return session
      if "with claimed as" in query:
        return None
      if "join media_assets media on media.id = upload.media_asset_id" in query:
        return winner
      raise AssertionError(f"Unexpected query: {query}")

  class FakeS3:
    def __init__(self) -> None:
      self.puts: list[dict] = []
      self.deleted: list[tuple[str, str]] = []

    def get_object_metadata(self, **_kwargs):
      return {"byte_size": len(source_bytes), "content_type": "image/jpeg"}

    def get_object_bytes(self, **_kwargs):
      return source_bytes, "image/jpeg"

    def private_media_bucket(self) -> str:
      return "private-user-media"

    def put_private_object(self, **kwargs) -> None:
      self.puts.append(kwargs)

    def delete_object_permanently(self, *, bucket: str, object_key: str) -> None:
      self.deleted.append((bucket, object_key))

  s3 = FakeS3()
  completed = await complete_upload_session(
    LostClaimDatabase(),
    Settings(
      environment="production",
      s3_bucket_name="public-media",
      private_media_bucket_name="private-user-media",
    ),
    upload_id,
    owner_user_id=owner_id,
    s3_service=s3,
  )

  assert completed == winner
  assert len(s3.puts) == 1
  loser_key = s3.puts[0]["object_key"]
  assert loser_key != winner_key
  assert ("private-user-media", loser_key) in s3.deleted
  assert ("private-user-media", staging_key) in s3.deleted
  assert ("private-user-media", winner_key) not in s3.deleted

  class ClaimFailureDatabase:
    async def fetchrow(self, query: str, *args):
      if "from media_upload_sessions\n    where id" in query:
        return session
      if "with claimed as" in query:
        raise RuntimeError("database temporarily unavailable")
      if "join media_assets media on media.id = upload.media_asset_id" in query:
        return None
      raise AssertionError(f"Unexpected query: {query}")

  failed_s3 = FakeS3()
  with pytest.raises(RuntimeError, match="database temporarily unavailable"):
    await complete_upload_session(
      ClaimFailureDatabase(),
      Settings(
        environment="production",
        s3_bucket_name="public-media",
        private_media_bucket_name="private-user-media",
      ),
      upload_id,
      owner_user_id=owner_id,
      s3_service=failed_s3,
    )

  failed_final_key = failed_s3.puts[0]["object_key"]
  assert ("private-user-media", failed_final_key) in failed_s3.deleted
  # The source remains retryable when the database definitively did not claim it.
  assert ("private-user-media", staging_key) not in failed_s3.deleted
