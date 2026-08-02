from uuid import UUID, uuid4

import pytest
from fastapi import BackgroundTasks
from pydantic import ValidationError
from starlette.responses import Response

from app.api import analysis as analysis_api
from app.core.errors import AppError
from app.core.media_policy import (
  GOLDEN_MASK_CONTENT_TYPE,
  GOLDEN_MASK_MAX_BYTES,
  GOLDEN_MASK_MEDIA_KIND,
  GOLDEN_MASK_SCHEMA_VERSION,
)
from app.core.settings import Settings
from app.schemas.analysis import GoldenMaskAttachRequest
from app.schemas.media import PresignedUploadRequest
from app.services.s3 import S3Service, is_private_golden_mask_object_key


def golden_mask_payload(media_id: UUID, *, byte_size: int = 4096) -> GoldenMaskAttachRequest:
  return GoldenMaskAttachRequest.model_validate(
    {
      "mediaId": str(media_id),
      "schemaVersion": GOLDEN_MASK_SCHEMA_VERSION,
      "byteSize": byte_size,
      "vertexCount": 1220,
      "indexCount": 6912,
      "uvCount": 1220,
      "topologyFingerprint": "A" * 64,
      "captureId": "capture-01",
      "createdAt": "2026-07-23T10:30:00+09:00",
      "trueDepthHardware": True,
    },
  )


class GoldenMaskAttachDatabase:
  def __init__(
    self,
    *,
    report_id: UUID,
    user_id: UUID,
    media_id: UUID,
    attached_media_id: UUID | None = None,
    media_kind: str = GOLDEN_MASK_MEDIA_KIND,
    content_type: str = GOLDEN_MASK_CONTENT_TYPE,
    byte_size: int = 4096,
    cdn_url: str | None = None,
    report_status: str = "completed",
  ) -> None:
    self.report_id = report_id
    self.user_id = user_id
    self.media_id = media_id
    self.attached_media_id = attached_media_id
    self.media_kind = media_kind
    self.content_type = content_type
    self.byte_size = byte_size
    self.cdn_url = cdn_url
    self.report_status = report_status
    self.update_args: tuple | None = None
    self.stored_metadata: dict | None = None

  async def run_in_transaction(self, operation):
    return await operation(self)

  async def fetchrow(self, query: str, *args):
    if "select id, status, golden_mask_media_id, golden_mask_metadata" in query:
      if args != (self.report_id, self.user_id):
        return None
      return {
        "id": self.report_id,
        "status": self.report_status,
        "golden_mask_media_id": self.attached_media_id,
        "golden_mask_metadata": self.stored_metadata or {},
      }
    if "select id, media_kind, bucket, object_key" in query:
      if args != (self.media_id, self.user_id):
        return None
      return {
        "id": self.media_id,
        "media_kind": self.media_kind,
        "bucket": "private-bucket",
        "object_key": f"uploads/golden-mask/{self.media_id}.auragm",
        "cdn_url": self.cdn_url,
        "content_type": self.content_type,
        "byte_size": self.byte_size,
      }
    if "update analysis_reports" in query:
      self.update_args = args
      if self.attached_media_id not in (None, self.media_id):
        return None
      if self.attached_media_id is None:
        import json

        self.attached_media_id = self.media_id
        self.stored_metadata = json.loads(args[3])
      return {
        "golden_mask_media_id": self.attached_media_id,
        "golden_mask_metadata": self.stored_metadata,
      }
    raise AssertionError(f"Unexpected query: {query}")


class GoldenMaskDeleteDatabase:
  def __init__(self, media: dict | None) -> None:
    self.pool = object()
    self.media = media
    self.fetchrow_calls: list[tuple[str, tuple]] = []
    self.execute_calls: list[tuple[str, tuple]] = []

  async def run_in_transaction(self, operation):
    return await operation(self)

  async def fetchrow(self, query: str, *args):
    self.fetchrow_calls.append((query, args))
    return self.media

  async def execute(self, query: str, *args):
    self.execute_calls.append((query, args))
    return "UPDATE 1"


def golden_mask_media_row(
  media_id: UUID,
  *,
  media_kind: str = GOLDEN_MASK_MEDIA_KIND,
  status: str = "active",
  deleted_at: object | None = None,
) -> dict:
  return {
    "id": media_id,
    "media_kind": media_kind,
    "bucket": "private-bucket",
    "object_key": f"uploads/golden-mask/{media_id}.auragm",
    "cdn_url": None,
    "content_type": GOLDEN_MASK_CONTENT_TYPE,
    "status": status,
    "deleted_at": deleted_at,
  }


@pytest.mark.asyncio
async def test_attach_golden_mask_validates_and_returns_flat_descriptor(monkeypatch) -> None:
  report_id = uuid4()
  user_id = uuid4()
  media_id = uuid4()
  db = GoldenMaskAttachDatabase(
    report_id=report_id,
    user_id=user_id,
    media_id=media_id,
  )

  async def fake_ensure_user(_db, _auth):
    return {"id": user_id}

  monkeypatch.setattr(analysis_api, "ensure_user", fake_ensure_user)
  result = await analysis_api.attach_analysis_report_golden_mask(
    report_id,
    golden_mask_payload(media_id),
    auth=object(),
    db=db,
  )

  descriptor = result["data"]["goldenMask"]
  assert descriptor == {
    "available": True,
    "mediaId": str(media_id),
    "contentType": GOLDEN_MASK_CONTENT_TYPE,
    "byteSize": 4096,
    "schemaVersion": GOLDEN_MASK_SCHEMA_VERSION,
    "captureId": "capture-01",
    "vertexCount": 1220,
    "indexCount": 6912,
    "uvCount": 1220,
    "topologyFingerprint": "a" * 64,
    "createdAt": "2026-07-23T10:30:00+09:00",
    "trueDepthHardware": True,
    "source": "arkit_face_mesh",
  }
  assert db.update_args is not None


@pytest.mark.asyncio
async def test_attach_golden_mask_is_idempotent_for_same_media(monkeypatch) -> None:
  report_id = uuid4()
  user_id = uuid4()
  media_id = uuid4()
  db = GoldenMaskAttachDatabase(
    report_id=report_id,
    user_id=user_id,
    media_id=media_id,
    attached_media_id=media_id,
  )
  db.stored_metadata = golden_mask_payload(media_id).metadata_payload()

  async def fake_ensure_user(_db, _auth):
    return {"id": user_id}

  monkeypatch.setattr(analysis_api, "ensure_user", fake_ensure_user)
  result = await analysis_api.attach_analysis_report_golden_mask(
    report_id,
    golden_mask_payload(media_id),
    auth=object(),
    db=db,
  )

  assert result["data"]["goldenMask"]["mediaId"] == str(media_id)
  assert db.update_args is None


@pytest.mark.asyncio
async def test_attach_golden_mask_rejects_replacement(monkeypatch) -> None:
  report_id = uuid4()
  user_id = uuid4()
  media_id = uuid4()
  db = GoldenMaskAttachDatabase(
    report_id=report_id,
    user_id=user_id,
    media_id=media_id,
    attached_media_id=uuid4(),
  )

  async def fake_ensure_user(_db, _auth):
    return {"id": user_id}

  monkeypatch.setattr(analysis_api, "ensure_user", fake_ensure_user)
  with pytest.raises(AppError) as exc_info:
    await analysis_api.attach_analysis_report_golden_mask(
      report_id,
      golden_mask_payload(media_id),
      auth=object(),
      db=db,
    )

  assert exc_info.value.status_code == 409
  assert exc_info.value.code == "GOLDEN_MASK_ATTACHMENT_CONFLICT"
  assert db.update_args is None


@pytest.mark.asyncio
@pytest.mark.parametrize("report_status", ["pending", "processing"])
async def test_attach_golden_mask_retries_until_report_is_completed(
  monkeypatch,
  report_status: str,
) -> None:
  report_id = uuid4()
  user_id = uuid4()
  media_id = uuid4()
  db = GoldenMaskAttachDatabase(
    report_id=report_id,
    user_id=user_id,
    media_id=media_id,
    report_status=report_status,
  )

  async def fake_ensure_user(_db, _auth):
    return {"id": user_id}

  monkeypatch.setattr(analysis_api, "ensure_user", fake_ensure_user)
  with pytest.raises(AppError) as exc_info:
    await analysis_api.attach_analysis_report_golden_mask(
      report_id,
      golden_mask_payload(media_id),
      auth=object(),
      db=db,
    )

  assert exc_info.value.status_code == 425
  assert exc_info.value.code == "GOLDEN_MASK_REPORT_NOT_READY"
  assert db.update_args is None
  assert db.attached_media_id is None


@pytest.mark.asyncio
@pytest.mark.parametrize("report_status", ["failed", "cancelled"])
async def test_attach_golden_mask_rejects_terminal_report_without_persisting_mesh(
  monkeypatch,
  report_status: str,
) -> None:
  report_id = uuid4()
  user_id = uuid4()
  media_id = uuid4()
  db = GoldenMaskAttachDatabase(
    report_id=report_id,
    user_id=user_id,
    media_id=media_id,
    report_status=report_status,
  )

  async def fake_ensure_user(_db, _auth):
    return {"id": user_id}

  monkeypatch.setattr(analysis_api, "ensure_user", fake_ensure_user)
  with pytest.raises(AppError) as exc_info:
    await analysis_api.attach_analysis_report_golden_mask(
      report_id,
      golden_mask_payload(media_id),
      auth=object(),
      db=db,
    )

  assert exc_info.value.status_code == 409
  assert exc_info.value.code == "GOLDEN_MASK_REPORT_NOT_ATTACHABLE"
  assert db.update_args is None
  assert db.attached_media_id is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
  ("overrides", "expected_code"),
  [
    ({"media_kind": "capture"}, "GOLDEN_MASK_MEDIA_KIND_INVALID"),
    ({"content_type": "application/octet-stream"}, "GOLDEN_MASK_CONTENT_TYPE_INVALID"),
    ({"cdn_url": "https://cdn.example.com/mask.auragm"}, "GOLDEN_MASK_MEDIA_NOT_PRIVATE"),
    ({"byte_size": 4095}, "GOLDEN_MASK_BYTE_SIZE_MISMATCH"),
  ],
)
async def test_attach_golden_mask_rejects_invalid_media(
  monkeypatch,
  overrides: dict,
  expected_code: str,
) -> None:
  report_id = uuid4()
  user_id = uuid4()
  media_id = uuid4()
  db = GoldenMaskAttachDatabase(
    report_id=report_id,
    user_id=user_id,
    media_id=media_id,
    **overrides,
  )

  async def fake_ensure_user(_db, _auth):
    return {"id": user_id}

  monkeypatch.setattr(analysis_api, "ensure_user", fake_ensure_user)
  with pytest.raises(AppError) as exc_info:
    await analysis_api.attach_analysis_report_golden_mask(
      report_id,
      golden_mask_payload(media_id),
      auth=object(),
      db=db,
    )

  assert exc_info.value.code == expected_code


@pytest.mark.asyncio
async def test_delete_unattached_golden_mask_is_owner_scoped_and_schedules_cleanup(
  monkeypatch,
) -> None:
  user_id = uuid4()
  media_id = uuid4()
  outbox_id = uuid4()
  db = GoldenMaskDeleteDatabase(golden_mask_media_row(media_id))
  background_tasks = BackgroundTasks()
  settings = Settings(s3_bucket_name="private-bucket")
  processed: list[tuple[object, Settings, list[UUID]]] = []

  async def fake_ensure_schema(_db) -> None:
    pass

  async def fake_ensure_user(_db, _auth):
    return {"id": user_id}

  async def fake_is_referenced(
    connection,
    *,
    bucket: str,
    object_key: str,
    excluding_report_id=None,
  ) -> bool:
    assert connection is db
    assert bucket == "private-bucket"
    assert object_key == f"uploads/golden-mask/{media_id}.auragm"
    assert excluding_report_id is None
    return False

  async def fake_enqueue(connection, *, ref, reason: str):
    assert connection is db
    assert ref.media_asset_id == media_id
    assert ref.bucket == "private-bucket"
    assert ref.object_key == f"uploads/golden-mask/{media_id}.auragm"
    assert reason == "golden_mask_unattached_deleted"
    return outbox_id, True

  async def fake_process(database, passed_settings, outbox_ids) -> None:
    processed.append((database, passed_settings, outbox_ids))

  monkeypatch.setattr(analysis_api, "ensure_media_deletion_schema", fake_ensure_schema)
  monkeypatch.setattr(analysis_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(analysis_api, "is_media_object_referenced", fake_is_referenced)
  monkeypatch.setattr(analysis_api, "enqueue_unattached_media_deletion", fake_enqueue)
  monkeypatch.setattr(analysis_api, "process_media_deletion_outbox_items", fake_process)

  result = await analysis_api.delete_unattached_golden_mask_media(
    media_id,
    background_tasks,
    auth=object(),
    db=db,
    settings=settings,
  )

  assert result["data"] == {
    "alreadyDeleted": False,
    "deleted": True,
    "mediaId": str(media_id),
    "outboxCount": 1,
  }
  select_query, select_args = db.fetchrow_calls[0]
  assert "where id = $1 and owner_user_id = $2" in " ".join(select_query.split()).lower()
  assert select_args == (media_id, user_id)
  update_query, update_args = db.execute_calls[0]
  normalized_update = " ".join(update_query.split()).lower()
  assert "set status = 'deletion_pending'" in normalized_update
  assert "owner_user_id = $2" in normalized_update
  assert update_args == (media_id, user_id)
  assert len(background_tasks.tasks) == 1

  await background_tasks()

  assert processed == [(analysis_api.database, settings, [outbox_id])]


@pytest.mark.asyncio
@pytest.mark.parametrize("media_case", ["missing", "foreign", "non-golden"])
async def test_delete_unattached_golden_mask_hides_unowned_or_wrong_kind(
  monkeypatch,
  media_case: str,
) -> None:
  user_id = uuid4()
  media_id = uuid4()
  media = (
    golden_mask_media_row(media_id, media_kind="capture")
    if media_case == "non-golden"
    else None
  )
  db = GoldenMaskDeleteDatabase(media)

  async def fake_ensure_schema(_db) -> None:
    pass

  async def fake_ensure_user(_db, _auth):
    return {"id": user_id}

  async def should_not_check_references(*_args, **_kwargs):
    raise AssertionError("Hidden media must not reach reference validation.")

  monkeypatch.setattr(analysis_api, "ensure_media_deletion_schema", fake_ensure_schema)
  monkeypatch.setattr(analysis_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(
    analysis_api,
    "is_media_object_referenced",
    should_not_check_references,
  )

  background_tasks = BackgroundTasks()
  with pytest.raises(AppError) as exc_info:
    await analysis_api.delete_unattached_golden_mask_media(
      media_id,
      background_tasks,
      auth=object(),
      db=db,
      settings=Settings(s3_bucket_name="private-bucket"),
    )

  assert exc_info.value.status_code == 404
  assert exc_info.value.code == "GOLDEN_MASK_MEDIA_NOT_FOUND"
  select_query, select_args = db.fetchrow_calls[0]
  assert "owner_user_id = $2" in select_query
  assert select_args == (media_id, user_id)
  assert db.execute_calls == []
  assert background_tasks.tasks == []


@pytest.mark.asyncio
async def test_delete_unattached_golden_mask_rejects_referenced_media(
  monkeypatch,
) -> None:
  user_id = uuid4()
  media_id = uuid4()
  db = GoldenMaskDeleteDatabase(golden_mask_media_row(media_id))

  async def fake_ensure_schema(_db) -> None:
    pass

  async def fake_ensure_user(_db, _auth):
    return {"id": user_id}

  async def fake_is_referenced(*_args, **_kwargs) -> bool:
    return True

  async def should_not_enqueue(*_args, **_kwargs):
    raise AssertionError("Referenced media must not enter the deletion outbox.")

  monkeypatch.setattr(analysis_api, "ensure_media_deletion_schema", fake_ensure_schema)
  monkeypatch.setattr(analysis_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(analysis_api, "is_media_object_referenced", fake_is_referenced)
  monkeypatch.setattr(
    analysis_api,
    "enqueue_unattached_media_deletion",
    should_not_enqueue,
  )

  background_tasks = BackgroundTasks()
  with pytest.raises(AppError) as exc_info:
    await analysis_api.delete_unattached_golden_mask_media(
      media_id,
      background_tasks,
      auth=object(),
      db=db,
      settings=Settings(s3_bucket_name="private-bucket"),
    )

  assert exc_info.value.status_code == 409
  assert exc_info.value.code == "GOLDEN_MASK_MEDIA_REFERENCED"
  assert db.execute_calls == []
  assert background_tasks.tasks == []


@pytest.mark.asyncio
async def test_delete_unattached_golden_mask_retries_pending_outbox_idempotently(
  monkeypatch,
) -> None:
  user_id = uuid4()
  media_id = uuid4()
  outbox_id = uuid4()
  db = GoldenMaskDeleteDatabase(
    golden_mask_media_row(media_id, status="deletion_pending"),
  )

  async def fake_ensure_schema(_db) -> None:
    pass

  async def fake_ensure_user(_db, _auth):
    return {"id": user_id}

  async def fake_is_referenced(*_args, **_kwargs) -> bool:
    return False

  async def fake_enqueue(*_args, **_kwargs):
    return outbox_id, True

  monkeypatch.setattr(analysis_api, "ensure_media_deletion_schema", fake_ensure_schema)
  monkeypatch.setattr(analysis_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(analysis_api, "is_media_object_referenced", fake_is_referenced)
  monkeypatch.setattr(analysis_api, "enqueue_unattached_media_deletion", fake_enqueue)

  background_tasks = BackgroundTasks()
  result = await analysis_api.delete_unattached_golden_mask_media(
    media_id,
    background_tasks,
    auth=object(),
    db=db,
    settings=Settings(s3_bucket_name="private-bucket"),
  )

  assert result["data"]["alreadyDeleted"] is True
  assert result["data"]["outboxCount"] == 1
  assert db.execute_calls == []
  assert len(background_tasks.tasks) == 1


@pytest.mark.asyncio
async def test_delete_unattached_golden_mask_completed_delete_is_idempotent(
  monkeypatch,
) -> None:
  user_id = uuid4()
  media_id = uuid4()
  db = GoldenMaskDeleteDatabase(
    golden_mask_media_row(media_id, status="deleted", deleted_at=object()),
  )

  async def fake_ensure_schema(_db) -> None:
    pass

  async def fake_ensure_user(_db, _auth):
    return {"id": user_id}

  async def should_not_continue(*_args, **_kwargs):
    raise AssertionError("Completed deletion must not create another outbox item.")

  monkeypatch.setattr(analysis_api, "ensure_media_deletion_schema", fake_ensure_schema)
  monkeypatch.setattr(analysis_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(
    analysis_api,
    "is_media_object_referenced",
    should_not_continue,
  )
  monkeypatch.setattr(
    analysis_api,
    "enqueue_unattached_media_deletion",
    should_not_continue,
  )

  background_tasks = BackgroundTasks()
  result = await analysis_api.delete_unattached_golden_mask_media(
    media_id,
    background_tasks,
    auth=object(),
    db=db,
    settings=Settings(s3_bucket_name="private-bucket"),
  )

  assert result["data"] == {
    "alreadyDeleted": True,
    "deleted": True,
    "mediaId": str(media_id),
    "outboxCount": 0,
  }
  assert db.execute_calls == []
  assert background_tasks.tasks == []


def test_golden_mask_request_rejects_non_triangle_index_count() -> None:
  media_id = uuid4()
  payload = golden_mask_payload(media_id).model_dump(by_alias=True, mode="json")
  payload["indexCount"] = 6911

  with pytest.raises(ValidationError):
    GoldenMaskAttachRequest.model_validate(payload)


@pytest.mark.parametrize(
  ("field", "value"),
  [
    ("vertexCount", 4097),
    ("indexCount", 32769),
    ("uvCount", 1219),
    ("trueDepthHardware", False),
    ("captureId", "c" * 201),
    ("byteSize", GOLDEN_MASK_MAX_BYTES + 1),
  ],
)
def test_golden_mask_request_rejects_mesh_outside_capture_contract(
  field: str,
  value: object,
) -> None:
  media_id = uuid4()
  payload = golden_mask_payload(media_id).model_dump(by_alias=True, mode="json")
  payload[field] = value

  with pytest.raises(ValidationError):
    GoldenMaskAttachRequest.model_validate(payload)


@pytest.mark.parametrize("field", ["uvCount", "trueDepthHardware"])
def test_golden_mask_request_requires_mesh_integrity_fields(field: str) -> None:
  media_id = uuid4()
  payload = golden_mask_payload(media_id).model_dump(by_alias=True, mode="json")
  payload.pop(field)

  with pytest.raises(ValidationError):
    GoldenMaskAttachRequest.model_validate(payload)


def test_golden_mask_request_accepts_supported_mesh_boundaries() -> None:
  media_id = uuid4()
  payload = golden_mask_payload(media_id).model_dump(by_alias=True, mode="json")
  payload.update(
    {
      "vertexCount": 4096,
      "indexCount": 32766,
      "uvCount": 4096,
      "captureId": "c" * 200,
      "byteSize": GOLDEN_MASK_MAX_BYTES,
      "trueDepthHardware": True,
    },
  )

  validated = GoldenMaskAttachRequest.model_validate(payload)

  assert validated.vertex_count == 4096
  assert validated.index_count == 32766
  assert validated.uv_count == 4096
  assert validated.byte_size == GOLDEN_MASK_MAX_BYTES


def test_golden_mask_upload_policy_requires_matching_kind_and_content_type() -> None:
  request = PresignedUploadRequest.model_validate(
    {
      "mediaKind": GOLDEN_MASK_MEDIA_KIND,
      "contentType": GOLDEN_MASK_CONTENT_TYPE,
      "source": "generated",
      "byteSize": 4096,
    },
  )
  assert request.media_kind == GOLDEN_MASK_MEDIA_KIND

  for invalid in (
    {
      "mediaKind": GOLDEN_MASK_MEDIA_KIND,
      "contentType": "image/jpeg",
      "source": "generated",
    },
    {
      "mediaKind": "capture",
      "contentType": GOLDEN_MASK_CONTENT_TYPE,
      "source": "camera",
    },
  ):
    with pytest.raises(ValidationError):
      PresignedUploadRequest.model_validate(invalid)


@pytest.mark.parametrize("byte_size", [None, GOLDEN_MASK_MAX_BYTES + 1])
def test_golden_mask_presign_requires_bounded_byte_size(
  byte_size: int | None,
) -> None:
  payload = {
    "mediaKind": GOLDEN_MASK_MEDIA_KIND,
    "contentType": GOLDEN_MASK_CONTENT_TYPE,
    "source": "generated",
  }
  if byte_size is not None:
    payload["byteSize"] = byte_size

  with pytest.raises(ValidationError):
    PresignedUploadRequest.model_validate(payload)


def test_golden_mask_presign_accepts_one_mib_boundary() -> None:
  request = PresignedUploadRequest.model_validate(
    {
      "mediaKind": GOLDEN_MASK_MEDIA_KIND,
      "contentType": GOLDEN_MASK_CONTENT_TYPE,
      "source": "generated",
      "byteSize": GOLDEN_MASK_MAX_BYTES,
    },
  )

  assert request.byte_size == GOLDEN_MASK_MAX_BYTES


def test_report_normalization_exposes_availability_without_storage_location() -> None:
  media_id = uuid4()
  normalized = analysis_api.normalize_analysis_report_row(
    {
      "id": uuid4(),
      "detail_payload": {},
      "golden_mask_media_id": media_id,
      "golden_mask_metadata": {
        "schemaVersion": GOLDEN_MASK_SCHEMA_VERSION,
        "captureId": "capture-01",
      },
      "golden_mask_ref_id": media_id,
      "golden_mask_ref_content_type": GOLDEN_MASK_CONTENT_TYPE,
      "golden_mask_ref_byte_size": 4096,
    },
  )

  assert normalized is not None
  assert normalized["golden_mask"] == {
    "available": True,
    "media_id": str(media_id),
    "content_type": GOLDEN_MASK_CONTENT_TYPE,
    "byte_size": 4096,
    "schemaVersion": GOLDEN_MASK_SCHEMA_VERSION,
    "captureId": "capture-01",
  }
  assert "golden_mask_media_id" not in normalized
  assert "golden_mask_metadata" not in normalized


@pytest.mark.asyncio
async def test_get_golden_mask_returns_private_presigned_download(monkeypatch) -> None:
  report_id = uuid4()
  user_id = uuid4()
  media_id = uuid4()

  class Database:
    async def fetchrow(self, _query: str, *args):
      assert args == (
        report_id,
        user_id,
        GOLDEN_MASK_MEDIA_KIND,
        GOLDEN_MASK_CONTENT_TYPE,
      )
      return {
        "report_id": report_id,
        "golden_mask_metadata": {
          "schemaVersion": GOLDEN_MASK_SCHEMA_VERSION,
          "captureId": "capture-01",
        },
        "media_id": media_id,
        "bucket": "private-bucket",
        "object_key": f"uploads/golden-mask/{media_id}.auragm",
        "content_type": GOLDEN_MASK_CONTENT_TYPE,
        "byte_size": 4096,
      }

  class FakeS3:
    def __init__(self, _settings):
      pass

    def assert_managed_media_location(self, *, bucket: str, object_key: str) -> None:
      assert bucket == "private-bucket"
      assert is_private_golden_mask_object_key(object_key)

    def create_presigned_download(self, **kwargs) -> str:
      assert kwargs["expires_in"] == 900
      return "https://download.example.com/signed"

  async def fake_ensure_user(_db, _auth):
    return {"id": user_id}

  monkeypatch.setattr(analysis_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(analysis_api, "S3Service", FakeS3)
  response = Response()
  result = await analysis_api.get_analysis_report_golden_mask(
    report_id,
    response,
    auth=object(),
    db=Database(),
    settings=Settings(s3_bucket_name="private-bucket"),
  )

  assert response.headers["Cache-Control"] == "private, no-store"
  assert result["data"]["goldenMask"]["downloadUrl"] == "https://download.example.com/signed"
  assert result["data"]["goldenMask"]["expiresInSeconds"] == 900


def test_golden_mask_presign_is_private_encrypted_and_has_no_cdn(monkeypatch) -> None:
  captured: dict = {}

  class Client:
    def generate_presigned_url(self, operation: str, *, Params: dict, ExpiresIn: int) -> str:
      assert operation == "put_object"
      assert ExpiresIn == 900
      captured.update(Params)
      return "https://upload.example.com/signed"

  service = S3Service(
    Settings(
      environment="production",
      s3_bucket_name="public-media",
      private_media_bucket_name="private-media",
      cdn_base_url="https://cdn.example.com",
    ),
  )
  monkeypatch.setattr(service, "_client", lambda: Client())
  upload = service.create_presigned_upload(
    media_kind=GOLDEN_MASK_MEDIA_KIND,
    content_type=GOLDEN_MASK_CONTENT_TYPE,
    original_filename="mask.bin",
  )

  assert upload["object_key"].endswith(".auragm")
  assert upload["bucket"] == "private-media"
  assert upload["cdn_url"] is None
  assert upload["cache_control"] == "private, no-store"
  assert upload["server_side_encryption"] == "AES256"
  assert upload["headers"]["x-amz-server-side-encryption"] == "AES256"
  assert captured["CacheControl"] == "private, no-store"
  assert captured["Bucket"] == "private-media"
  assert captured["ServerSideEncryption"] == "AES256"


def test_migrated_golden_mask_owner_path_is_recognized_as_private() -> None:
  owner_id = uuid4()
  media_id = uuid4()
  checksum = "a" * 64

  assert is_private_golden_mask_object_key(
    f"private/user-media/users/{owner_id}/golden-mask/legacy/"
    f"media_asset/{media_id}/{checksum}.auragm",
  )
  assert not is_private_golden_mask_object_key(
    f"private/user-media/users/{owner_id}/face-analysis-source/legacy/"
    f"media_asset/{media_id}/{checksum}.auragm",
  )
