from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from app.api import media as media_api
from app.core.errors import AppError
from app.core.media_policy import GOLDEN_MASK_CONTENT_TYPE
from app.core.security import AuthContext
from app.core.settings import Settings
from app.schemas.media import CompleteUploadRequest, PhotoCaptureCreate, PresignedUploadRequest
from app.services.media_uploads import (
  complete_upload_session,
  issue_upload_session,
  resolve_legacy_upload_session_id,
)
from app.services.s3 import S3Service


class FakeS3Service:
  def __init__(self) -> None:
    self.created_kinds: list[str] = []
    self.metadata_calls: list[tuple[str, str]] = []

  def create_presigned_upload(
    self,
    media_kind: str,
    content_type: str,
    original_filename: str | None,
    expires_in: int = 900,
  ) -> dict:
    self.created_kinds.append(media_kind)
    object_key = f"uploads/{media_kind}/{len(self.created_kinds)}.jpg"
    return {
      "bucket": "media-bucket",
      "cache_control": "private, no-store",
      "cdn_url": f"https://cdn.example.com/{object_key}",
      "content_type": content_type,
      "expires_in": expires_in,
      "method": "PUT",
      "object_key": object_key,
      "upload_url": f"https://upload.example.com/{object_key}",
    }

  def get_object_metadata(self, *, bucket: str, object_key: str) -> dict[str, str | int]:
    self.metadata_calls.append((bucket, object_key))
    size = 123 if object_key.endswith("main.jpg") else 45
    return {"byte_size": size, "content_type": "image/jpeg"}

  def assert_managed_media_location(self, *, bucket: str, object_key: str) -> None:
    if bucket != "media-bucket" or not object_key.startswith("uploads/"):
      raise AppError(403, "S3_TARGET_NOT_MANAGED", "Not managed")


class IssueUploadDatabase:
  def __init__(self) -> None:
    self.query = ""
    self.args: tuple = ()

  async def fetchrow(self, query: str, *args):
    self.query = query
    self.args = args
    return {"id": args[0]}


class CompleteUploadDatabase:
  def __init__(self, session: dict, *, allowed_owner_id: UUID, completed_media: dict | None = None) -> None:
    self.allowed_owner_id = allowed_owner_id
    self.completed_media = completed_media
    self.session = session
    self.claim_args: tuple | None = None

  async def fetchrow(self, query: str, *args):
    if "from media_upload_sessions\n    where id" in query:
      return self.session if args[1] == self.allowed_owner_id else None
    if "join media_assets media on media.id = upload.media_asset_id" in query:
      return self.completed_media
    if "with claimed as" in query:
      self.claim_args = args
      return {
        "id": uuid4(),
        "owner_user_id": self.allowed_owner_id,
        "bucket": self.session["bucket"],
        "object_key": self.session["object_key"],
      }
    raise AssertionError(f"Unexpected query: {query}")


def make_upload_session(owner_user_id: UUID) -> dict:
  return {
    "id": uuid4(),
    "owner_user_id": owner_user_id,
    "partner_account_id": None,
    "media_kind": "capture",
    "source": "camera",
    "bucket": "media-bucket",
    "object_key": "uploads/capture/main.jpg",
    "cdn_url": "https://cdn.example.com/uploads/capture/main.jpg",
    "content_type": "image/jpeg",
    "expected_byte_size": 123,
    "width": 100,
    "height": 100,
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


@pytest.mark.parametrize("media_kind", ["capture", "face-analysis-source"])
def test_presign_accepts_current_and_app_store_face_capture_media_kinds(media_kind: str) -> None:
  payload = PresignedUploadRequest.model_validate(
    {
      "mediaKind": media_kind,
      "contentType": "image/jpeg",
      "source": "camera",
    },
  )

  assert payload.media_kind == media_kind


def test_presign_still_rejects_unknown_media_kind() -> None:
  with pytest.raises(ValidationError, match="Unsupported upload media kind"):
    PresignedUploadRequest.model_validate(
      {
        "mediaKind": "unknown-face-capture",
        "contentType": "image/jpeg",
        "source": "camera",
      },
    )


@pytest.mark.asyncio
async def test_presign_binds_server_generated_locations_to_user_and_single_upload_id() -> None:
  owner_user_id = uuid4()
  db = IssueUploadDatabase()
  s3 = FakeS3Service()
  payload = PresignedUploadRequest.model_validate(
    {
      "mediaKind": "community-thread",
      "source": "gallery",
      "contentType": "image/jpeg",
      "byteSize": 123,
      "originalFilename": "look.jpg",
      "thumbnail": {
        "contentType": "image/jpeg",
        "byteSize": 45,
        "originalFilename": "look-thumb.jpg",
      },
    },
  )

  upload = await issue_upload_session(
    db,
    Settings(s3_bucket_name="media-bucket"),
    payload,
    owner_user_id=owner_user_id,
    s3_service=s3,
  )

  assert isinstance(upload["upload_id"], UUID)
  assert upload["thumbnail_upload"]["object_key"].startswith("uploads/community-thread-thumbnail/")
  assert s3.created_kinds == ["community-thread", "community-thread-thumbnail"]
  assert "insert into media_upload_sessions" in db.query
  assert "status,\n      expires_at" in db.query
  assert "'pending',\n      now()" in db.query
  assert db.args[1] == owner_user_id
  assert db.args[5:8] == (
    "media-bucket",
    "uploads/community-thread/1.jpg",
    "https://cdn.example.com/uploads/community-thread/1.jpg",
  )


def test_presign_rejects_golden_mask_content_type_for_community_thumbnail() -> None:
  with pytest.raises(ValidationError, match="Unsupported upload content type"):
    PresignedUploadRequest.model_validate(
      {
        "mediaKind": "community-thread",
        "source": "gallery",
        "contentType": "image/jpeg",
        "byteSize": 123,
        "originalFilename": "look.jpg",
        "thumbnail": {
          "contentType": GOLDEN_MASK_CONTENT_TYPE,
          "byteSize": 45,
          "originalFilename": "private-mask.auragm",
        },
      },
    )


@pytest.mark.asyncio
async def test_other_user_cannot_complete_upload_session() -> None:
  owner_user_id = uuid4()
  attacker_user_id = uuid4()
  session = make_upload_session(owner_user_id)
  db = CompleteUploadDatabase(session, allowed_owner_id=owner_user_id)
  s3 = FakeS3Service()

  with pytest.raises(AppError) as exc_info:
    await complete_upload_session(
      db,
      Settings(s3_bucket_name="media-bucket"),
      session["id"],
      owner_user_id=attacker_user_id,
      s3_service=s3,
    )

  assert exc_info.value.code == "UPLOAD_SESSION_INVALID"
  assert s3.metadata_calls == []
  assert db.claim_args is None


@pytest.mark.asyncio
async def test_legacy_target_only_resolves_for_issuing_user() -> None:
  owner_user_id = uuid4()
  attacker_user_id = uuid4()
  upload_id = uuid4()

  class LegacyResolveDatabase:
    async def fetchrow(self, query: str, *args):
      assert "select id\n    from media_upload_sessions" in query
      return {"id": upload_id} if args[2] == owner_user_id else None

  db = LegacyResolveDatabase()
  s3 = FakeS3Service()
  with pytest.raises(AppError) as attacker_error:
    await resolve_legacy_upload_session_id(
      db,
      Settings(s3_bucket_name="media-bucket"),
      bucket="media-bucket",
      object_key="uploads/capture/main.jpg",
      owner_user_id=attacker_user_id,
      s3_service=s3,
    )

  resolved = await resolve_legacy_upload_session_id(
    db,
    Settings(s3_bucket_name="media-bucket"),
    bucket="media-bucket",
    object_key="uploads/capture/main.jpg",
    owner_user_id=owner_user_id,
    s3_service=s3,
  )

  assert attacker_error.value.code == "UPLOAD_SESSION_INVALID"
  assert resolved == upload_id


@pytest.mark.asyncio
async def test_other_partner_cannot_complete_upload_session() -> None:
  owner_partner_id = uuid4()
  attacker_partner_id = uuid4()
  session = make_upload_session(uuid4())
  session.update({"owner_user_id": None, "partner_account_id": owner_partner_id})

  class PartnerUploadDatabase:
    async def fetchrow(self, query: str, *args):
      if "from media_upload_sessions\n    where id" in query:
        return session if args[2] == owner_partner_id else None
      raise AssertionError("A rejected partner upload must not reach media creation.")

  s3 = FakeS3Service()
  with pytest.raises(AppError) as exc_info:
    await complete_upload_session(
      PartnerUploadDatabase(),
      Settings(s3_bucket_name="media-bucket"),
      session["id"],
      partner_account_id=attacker_partner_id,
      s3_service=s3,
    )

  assert exc_info.value.code == "UPLOAD_SESSION_INVALID"
  assert s3.metadata_calls == []


@pytest.mark.asyncio
async def test_complete_uses_bound_location_and_s3_metadata() -> None:
  owner_user_id = uuid4()
  session = make_upload_session(owner_user_id)
  db = CompleteUploadDatabase(session, allowed_owner_id=owner_user_id)
  s3 = FakeS3Service()

  media = await complete_upload_session(
    db,
    Settings(s3_bucket_name="media-bucket"),
    session["id"],
    owner_user_id=owner_user_id,
    s3_service=s3,
  )

  assert media["bucket"] == "media-bucket"
  assert media["object_key"] == "uploads/capture/main.jpg"
  assert s3.metadata_calls == [("media-bucket", "uploads/capture/main.jpg")]
  assert db.claim_args is not None
  assert db.claim_args[0:3] == (session["id"], owner_user_id, None)
  assert isinstance(db.claim_args[3], UUID)
  assert db.claim_args[4:6] == (None, 123)


@pytest.mark.asyncio
async def test_completed_upload_is_idempotent_for_same_user() -> None:
  owner_user_id = uuid4()
  session = make_upload_session(owner_user_id)
  session.update({"status": "completed", "media_asset_id": uuid4()})
  completed_media = {
    "id": session["media_asset_id"],
    "owner_user_id": owner_user_id,
    "bucket": session["bucket"],
    "object_key": session["object_key"],
  }
  db = CompleteUploadDatabase(session, allowed_owner_id=owner_user_id, completed_media=completed_media)
  s3 = FakeS3Service()

  media = await complete_upload_session(
    db,
    Settings(s3_bucket_name="media-bucket"),
    session["id"],
    owner_user_id=owner_user_id,
    s3_service=s3,
  )

  assert media == completed_media
  assert s3.metadata_calls == []
  assert db.claim_args is None


@pytest.mark.asyncio
async def test_thumbnail_metadata_mismatch_does_not_claim_session() -> None:
  owner_user_id = uuid4()
  session = make_upload_session(owner_user_id)
  session.update(
    {
      "thumbnail_bucket": "media-bucket",
      "thumbnail_object_key": "uploads/community-thread-thumbnail/thumb.jpg",
      "thumbnail_content_type": "image/jpeg",
      "thumbnail_expected_byte_size": 999,
    },
  )
  db = CompleteUploadDatabase(session, allowed_owner_id=owner_user_id)
  s3 = FakeS3Service()

  with pytest.raises(AppError) as exc_info:
    await complete_upload_session(
      db,
      Settings(s3_bucket_name="media-bucket"),
      session["id"],
      owner_user_id=owner_user_id,
      s3_service=s3,
    )

  assert exc_info.value.code == "UPLOAD_SIZE_MISMATCH"
  assert db.claim_args is None


def test_complete_contract_does_not_accept_client_storage_location() -> None:
  upload_id = uuid4()
  with pytest.raises(ValidationError):
    CompleteUploadRequest.model_validate(
      {
        "uploadId": str(upload_id),
        "bucket": "victim-bucket",
        "objectKey": "private/victim.jpg",
      },
    )

  payload = CompleteUploadRequest.model_validate({"uploadId": str(upload_id)})
  assert payload.model_dump(exclude_none=True) == {"upload_id": upload_id}


def test_s3_rejects_bucket_or_prefix_outside_managed_media_location() -> None:
  service = S3Service(Settings(s3_bucket_name="media-bucket"))

  with pytest.raises(AppError) as bucket_error:
    service.assert_managed_media_location(bucket="other-bucket", object_key="uploads/capture/a.jpg")
  with pytest.raises(AppError) as prefix_error:
    service.assert_managed_media_location(bucket="media-bucket", object_key="backups/database.sql")

  assert bucket_error.value.code == "S3_TARGET_NOT_MANAGED"
  assert prefix_error.value.code == "S3_TARGET_NOT_MANAGED"


@pytest.mark.asyncio
async def test_photo_capture_rejects_media_not_owned_by_current_user(monkeypatch) -> None:
  owner_user_id = uuid4()

  class MissingOwnedMediaDatabase:
    async def fetchrow(self, query: str, *args):
      assert "media.owner_user_id = $1" in query
      assert args[0] == owner_user_id
      return None

  async def fake_ensure_user(_db, _auth):
    return {"id": owner_user_id}

  monkeypatch.setattr(media_api, "ensure_user", fake_ensure_user)
  auth = AuthContext(subject="owner", provider="google", email=None, name=None, claims={})
  payload = PhotoCaptureCreate.model_validate(
    {
      "mediaId": str(uuid4()),
      "captureType": "face_analysis",
      "source": "camera",
    },
  )

  with pytest.raises(AppError) as exc_info:
    await media_api.create_photo_capture(payload, auth, MissingOwnedMediaDatabase())

  assert exc_info.value.code == "MEDIA_NOT_FOUND"
