import hashlib
import json
import struct
from io import BytesIO
from uuid import UUID, uuid4

import pytest
from PIL import Image

from app.ops.optimize_analysis_previews import CACHE_CONTROL, object_key_for
from app.core.media_policy import GOLDEN_MASK_CONTENT_TYPE
from app.core.settings import Settings
from app.services.private_media_migration import (
  MEDIA_ASSET_RESOURCE,
  MAKEUP_RECOMMENDATION_ASSET_RESOURCE,
  MigrationCandidate,
  batch_cloudfront_paths,
  build_plan_report,
  cleanup_private_media_batch,
  migrate_candidate,
  plan_private_media_migration,
  rollback_private_media_batch,
  target_object_key,
  verify_private_media_batch,
)


OWNER_ID = UUID("10000000-0000-0000-0000-000000000001")
MEDIA_ID = UUID("20000000-0000-0000-0000-000000000001")
BATCH_ID = UUID("30000000-0000-0000-0000-000000000001")
LEDGER_ID = UUID("40000000-0000-0000-0000-000000000001")


def _image_bytes() -> bytes:
  output = BytesIO()
  image = Image.new("RGB", (48, 40), (184, 126, 104))
  image.save(output, format="PNG")
  return output.getvalue()


def _golden_mask_bytes() -> bytes:
  schema_version = b"aura.golden-mask.v1"
  payload = (
    b"AUGM"
    + struct.pack("<i", 1)
    + bytes([len(schema_version)])
    + schema_version
    + b"migration-test-payload"
  )
  return payload + hashlib.sha256(payload).digest()


def _media_candidate(
  *,
  media_kind: str,
  body: bytes,
  content_type: str,
  extension: str,
  width: int | None,
  height: int | None,
) -> MigrationCandidate:
  object_key = f"uploads/{media_kind}/{MEDIA_ID}{extension}"
  return MigrationCandidate(
    resource_type=MEDIA_ASSET_RESOURCE,
    resource_id=MEDIA_ID,
    owner_user_id=OWNER_ID,
    media_kind=media_kind,
    source_bucket="legacy-public",
    source_object_key=object_key,
    source_cdn_url=f"https://cdn.example.com/{object_key}",
    source_state={
      "owner_user_id": OWNER_ID,
      "bucket": "legacy-public",
      "object_key": object_key,
      "cdn_url": f"https://cdn.example.com/{object_key}",
      "thumbnail_bucket": None,
      "thumbnail_object_key": None,
      "thumbnail_cdn_url": None,
      "thumbnail_content_type": None,
      "thumbnail_byte_size": None,
      "thumbnail_width": None,
      "thumbnail_height": None,
      "content_type": content_type,
      "byte_size": len(body),
      "width": width,
      "height": height,
      "checksum_sha256": None,
    },
    byte_size=len(body),
  )


def _candidate() -> MigrationCandidate:
  return MigrationCandidate(
    resource_type=MEDIA_ASSET_RESOURCE,
    resource_id=MEDIA_ID,
    owner_user_id=OWNER_ID,
    media_kind="face-analysis-source",
    source_bucket="legacy-public",
    source_object_key=f"uploads/face-analysis-source/{MEDIA_ID}.png",
    source_cdn_url=f"https://cdn.example.com/uploads/face-analysis-source/{MEDIA_ID}.png",
    source_state={
      "owner_user_id": OWNER_ID,
      "bucket": "legacy-public",
      "object_key": f"uploads/face-analysis-source/{MEDIA_ID}.png",
      "cdn_url": f"https://cdn.example.com/uploads/face-analysis-source/{MEDIA_ID}.png",
      "thumbnail_bucket": None,
      "thumbnail_object_key": None,
      "thumbnail_cdn_url": None,
      "content_type": "image/png",
      "byte_size": len(_image_bytes()),
      "width": 48,
      "height": 40,
      "checksum_sha256": None,
    },
    byte_size=len(_image_bytes()),
  )


class MemoryObjectStore:
  def __init__(
    self,
    candidate: MigrationCandidate,
    *,
    body: bytes | None = None,
    content_type: str | None = None,
  ) -> None:
    self.bucket = "private-media"
    self.objects = {
      (candidate.source_bucket, candidate.source_object_key): (
        body if body is not None else _image_bytes(),
        content_type or "image/png",
      ),
    }
    self.put_count = 0
    self.deleted: list[tuple[str, str]] = []

  def private_media_bucket(self) -> str:
    return self.bucket

  def get_object_bytes(self, *, bucket, object_key, max_bytes=None):
    body, content_type = self.objects[(bucket, object_key)]
    if max_bytes is not None and len(body) > max_bytes:
      raise RuntimeError("object too large")
    return body, content_type

  def get_object_identity(self, *, bucket, object_key):
    if (bucket, object_key) not in self.objects:
      return {"etag": None, "version_id": None, "exists": "false"}
    body, _ = self.objects[(bucket, object_key)]
    return {
      "etag": hashlib.sha256(body).hexdigest()[:32],
      "version_id": "version-1",
      "exists": "true",
    }

  def put_private_object(self, *, bucket, object_key, body, content_type, tags=None):
    assert bucket == self.bucket
    assert object_key.startswith(f"private/user-media/users/{OWNER_ID}/")
    assert tags and tags["aura-migration-batch"] == str(BATCH_ID)
    self.put_count += 1
    self.objects[(bucket, object_key)] = (body, content_type)

  def delete_object_permanently(self, *, bucket, object_key):
    self.deleted.append((bucket, object_key))
    self.objects.pop((bucket, object_key), None)


class CompletedInvalidation:
  def __init__(self) -> None:
    self.calls: list[tuple[str, str, tuple[str, ...]]] = []

  def require_completed(self, *, distribution_id, invalidation_id, expected_paths):
    self.calls.append((distribution_id, invalidation_id, expected_paths))


class FlakyDeleteStore(MemoryObjectStore):
  def __init__(self, candidate: MigrationCandidate) -> None:
    super().__init__(candidate)
    self.fail_next_delete = True

  def delete_object_permanently(self, *, bucket, object_key):
    if self.fail_next_delete:
      self.fail_next_delete = False
      raise RuntimeError("temporary delete failure")
    super().delete_object_permanently(bucket=bucket, object_key=object_key)


class FailSecondDeleteOnceStore(MemoryObjectStore):
  def __init__(self, candidate: MigrationCandidate) -> None:
    super().__init__(candidate)
    self.delete_calls = 0

  def delete_object_permanently(self, *, bucket, object_key):
    self.delete_calls += 1
    if self.delete_calls == 2:
      raise RuntimeError("temporary thumbnail delete failure")
    super().delete_object_permanently(bucket=bucket, object_key=object_key)


class _Transaction:
  async def __aenter__(self):
    return self

  async def __aexit__(self, exc_type, exc, traceback):
    return False


class MigrationConnection:
  def __init__(self, candidate: MigrationCandidate) -> None:
    self.candidate = candidate
    self.ledger: dict | None = None
    self.media = dict(candidate.source_state)
    self.media["id"] = candidate.resource_id
    self.media["media_kind"] = candidate.media_kind
    self.is_referenced = False

  def transaction(self):
    return _Transaction()

  async def fetch(self, query, *args):
    normalized = " ".join(query.lower().split())
    if "from private_media_migration_items" in normalized:
      if self.ledger is None:
        return []
      if "group by status" in normalized:
        return [{"status": self.ledger["status"], "item_count": 1}]
      batch_id, statuses = args
      return [dict(self.ledger)] if self.ledger["batch_id"] == batch_id and self.ledger["status"] in statuses else []
    raise AssertionError(normalized)

  async def fetchrow(self, query, *args):
    normalized = " ".join(query.lower().split())
    if normalized.startswith("insert into private_media_migration_items"):
      if self.ledger is not None:
        return None
      self.ledger = {
        "id": LEDGER_ID,
        "batch_id": args[0],
        "resource_type": args[1],
        "resource_id": args[2],
        "owner_user_id": args[3],
        "media_kind": args[4],
        "source_bucket": args[5],
        "source_object_key": args[6],
        "source_cdn_url": args[7],
        "source_state": args[8],
        "target_bucket": None,
        "target_object_key": None,
        "source_checksum_sha256": None,
        "target_checksum_sha256": None,
        "status": "planned",
        "attempts": 0,
      }
      return dict(self.ledger)
    if "from private_media_migration_items" in normalized:
      return dict(self.ledger) if self.ledger is not None else None
    if "as is_referenced" in normalized:
      return {"is_referenced": self.is_referenced}
    if "from media_assets" in normalized:
      return dict(self.media)
    raise AssertionError(normalized)

  async def execute(self, query, *args):
    normalized = " ".join(query.lower().split())
    if "update private_media_migration_items" in normalized:
      assert self.ledger is not None
      if "attempts = attempts + 1" in normalized:
        self.ledger["attempts"] += 1
      elif "target_bucket = $2" in normalized:
        self.ledger.update(
          {
            "target_bucket": args[1],
            "target_object_key": args[2],
            "source_checksum_sha256": args[3],
            "source_etag": args[4],
            "source_version_id": args[5],
            "target_checksum_sha256": args[6],
          },
        )
        if "status = 'copied'" in normalized:
          self.ledger["status"] = "copied"
      elif "status = 'switched'" in normalized:
        self.ledger["status"] = "switched"
      elif "status = 'verified'" in normalized:
        self.ledger["status"] = "verified"
      elif "status = 'cleanup_pending'" in normalized:
        self.ledger["status"] = "cleanup_pending"
        if len(args) > 2:
          self.ledger["cloudfront_distribution_id"] = args[1]
          self.ledger["cloudfront_invalidation_id"] = args[2]
          self.ledger["cloudfront_path_manifest_sha256"] = args[3]
      elif "status = 'completed'" in normalized:
        self.ledger["status"] = "completed"
      elif "status = 'rolled_back'" in normalized:
        self.ledger["status"] = "rolled_back"
      elif "status = 'rollback_pending'" in normalized:
        self.ledger["status"] = "rollback_pending"
      elif "status = 'failed'" in normalized:
        self.ledger["status"] = "failed"
      return "UPDATE 1"
    if normalized.startswith("update media_assets"):
      if "owner_user_id = $2" in normalized and len(args) == 9:
        self.media.update(
          {
            "owner_user_id": args[1],
            "bucket": args[2],
            "object_key": args[3],
            "cdn_url": None,
            "thumbnail_bucket": None,
            "thumbnail_object_key": None,
            "thumbnail_cdn_url": None,
            "content_type": args[4],
            "byte_size": args[5],
            "width": args[6],
            "height": args[7],
            "checksum_sha256": args[8],
          },
        )
      else:
        self.media.update(
          {
            "owner_user_id": args[1],
            "bucket": args[2],
            "object_key": args[3],
            "cdn_url": args[4],
            "thumbnail_bucket": args[5],
            "thumbnail_object_key": args[6],
            "thumbnail_cdn_url": args[7],
            "content_type": args[12],
            "byte_size": args[13],
            "width": args[14],
            "height": args[15],
            "checksum_sha256": args[16],
          },
        )
      return "UPDATE 1"
    if normalized.startswith("update media_upload_sessions"):
      return "UPDATE 1"
    raise AssertionError(normalized)


class PlanningConnection:
  def __init__(self) -> None:
    self.fetch_count = 0
    self.write_count = 0
    self.queries: list[tuple[str, tuple]] = []

  async def fetch(self, query, *args):
    self.fetch_count += 1
    self.queries.append((query, args))
    if "from media_assets media" in query:
      conflict_owner = uuid4()
      return [
        {
          **_candidate().source_state,
          "id": MEDIA_ID,
          "media_kind": "face-analysis-source",
          "reference_owner_ids": [OWNER_ID],
        },
        {
          **_candidate().source_state,
          "id": uuid4(),
          "media_kind": "capture",
          "reference_owner_ids": [conflict_owner],
        },
      ]
    if "from makeup_recommendation_assets asset" in query:
      return [
        {
          "id": uuid4(),
          "owner_user_id": OWNER_ID,
          "storage_bucket": "legacy-public",
          "object_key": "private/generated-makeup-recommendations/report/look.jpg",
          "image_url": "https://cdn.example.com/look.jpg",
          "content_type": "image/jpeg",
          "is_private": True,
        },
      ]
    raise AssertionError(query)

  async def execute(self, *_args):
    self.write_count += 1
    raise AssertionError("planning must not write")


def _settings() -> Settings:
  return Settings(
    environment="test",
    s3_bucket_name="legacy-public",
    private_media_bucket_name="private-media",
  )


@pytest.mark.asyncio
async def test_plan_is_read_only_and_excludes_ambiguous_owners() -> None:
  connection = PlanningConnection()

  plan = await plan_private_media_migration(connection, _settings(), limit=10)
  report = build_plan_report(plan)

  assert [candidate.resource_type for candidate in plan.candidates] == [
    MEDIA_ASSET_RESOURCE,
    MAKEUP_RECOMMENDATION_ASSET_RESOURCE,
  ]
  assert [skipped.reason for skipped in plan.skipped] == ["owner_conflict"]
  assert report["mode"] == "dry-run"
  assert report["candidateCount"] == 2
  assert "source_bucket" not in json.dumps(report)
  assert connection.fetch_count == 2
  assert connection.write_count == 0

  media_query, media_args = connection.queries[0]
  normalized_query = " ".join(media_query.lower().split())
  for owner_reference in (
    "report.golden_mask_media_id = media.id",
    "media.id in (analysis.source_media_id, analysis.mask_media_id)",
    "simulation.result_media_id = media.id",
  ):
    assert owner_reference in normalized_query
  assert {
    "golden-mask",
    "hair-analysis-mask",
    "hair-analysis-source",
    "hair-simulation-result",
  }.issubset(set(media_args[0]))


def test_target_key_is_owner_scoped_and_content_addressed() -> None:
  checksum = "a" * 64

  key = target_object_key(_candidate(), checksum)

  assert key == (
    f"private/user-media/users/{OWNER_ID}/face-analysis-source/legacy/"
    f"media_asset/{MEDIA_ID}/{checksum}.jpg"
  )


def test_target_key_preserves_non_jpeg_private_formats() -> None:
  checksum = "b" * 64
  hair_mask = _media_candidate(
    media_kind="hair-analysis-mask",
    body=_image_bytes(),
    content_type="image/png",
    extension=".png",
    width=48,
    height=40,
  )
  golden_mask = _media_candidate(
    media_kind="golden-mask",
    body=_golden_mask_bytes(),
    content_type=GOLDEN_MASK_CONTENT_TYPE,
    extension=".auragm",
    width=None,
    height=None,
  )

  assert target_object_key(hair_mask, checksum).endswith(f"/{checksum}.png")
  assert target_object_key(golden_mask, checksum).endswith(f"/{checksum}.auragm")


@pytest.mark.asyncio
async def test_hair_mask_migration_preserves_png_bytes_and_dimensions() -> None:
  body = _image_bytes()
  candidate = _media_candidate(
    media_kind="hair-analysis-mask",
    body=body,
    content_type="image/png",
    extension=".png",
    width=48,
    height=40,
  )
  connection = MigrationConnection(candidate)
  store = MemoryObjectStore(candidate, body=body, content_type="image/png")

  assert await migrate_candidate(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    candidate=candidate,
    object_store=store,
  ) == "switched"

  target_key = str(connection.ledger["target_object_key"])
  target_body, target_content_type = store.objects[(store.bucket, target_key)]
  assert target_key.endswith(".png")
  assert target_body == body
  assert target_content_type == "image/png"
  assert connection.media["content_type"] == "image/png"
  assert connection.media["width"] == 48
  assert connection.media["height"] == 40


@pytest.mark.asyncio
async def test_golden_mask_migration_preserves_validated_artifact_bytes() -> None:
  body = _golden_mask_bytes()
  candidate = _media_candidate(
    media_kind="golden-mask",
    body=body,
    content_type=GOLDEN_MASK_CONTENT_TYPE,
    extension=".auragm",
    width=None,
    height=None,
  )
  connection = MigrationConnection(candidate)
  store = MemoryObjectStore(candidate, body=body, content_type=GOLDEN_MASK_CONTENT_TYPE)

  assert await migrate_candidate(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    candidate=candidate,
    object_store=store,
  ) == "switched"

  target_key = str(connection.ledger["target_object_key"])
  target_body, target_content_type = store.objects[(store.bucket, target_key)]
  assert target_key.endswith(".auragm")
  assert target_body == body
  assert target_content_type == GOLDEN_MASK_CONTENT_TYPE
  assert connection.media["width"] is None
  assert connection.media["height"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
  ("body", "s3_content_type"),
  [
    (b"not-a-golden-mask", GOLDEN_MASK_CONTENT_TYPE),
    (_golden_mask_bytes(), "text/plain"),
  ],
)
async def test_golden_mask_migration_rejects_invalid_artifacts(
  body: bytes,
  s3_content_type: str,
) -> None:
  candidate = _media_candidate(
    media_kind="golden-mask",
    body=body,
    content_type=GOLDEN_MASK_CONTENT_TYPE,
    extension=".auragm",
    width=None,
    height=None,
  )
  connection = MigrationConnection(candidate)
  store = MemoryObjectStore(candidate, body=body, content_type=s3_content_type)

  with pytest.raises(RuntimeError):
    await migrate_candidate(
      connection,
      _settings(),
      batch_id=BATCH_ID,
      candidate=candidate,
      object_store=store,
    )

  assert connection.ledger["status"] == "failed"
  assert store.put_count == 0


def test_new_analysis_previews_are_private_and_owner_scoped() -> None:
  assert CACHE_CONTROL == "private, no-store"
  assert object_key_for(str(OWNER_ID), str(MEDIA_ID)) == (
    f"private/user-media/users/{OWNER_ID}/analysis-preview/{MEDIA_ID}.jpg"
  )


@pytest.mark.asyncio
async def test_execute_verify_cleanup_is_resumable_and_version_delete_ready() -> None:
  candidate = _candidate()
  connection = MigrationConnection(candidate)
  store = MemoryObjectStore(candidate)

  assert await migrate_candidate(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    candidate=candidate,
    object_store=store,
  ) == "switched"
  assert connection.media["bucket"] == "private-media"
  assert connection.media["cdn_url"] is None
  assert store.put_count == 1

  # A retry after the atomic switch does not copy or mutate the object again.
  assert await migrate_candidate(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    candidate=candidate,
    object_store=store,
  ) == "switched"
  assert store.put_count == 1

  verified = await verify_private_media_batch(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    object_store=store,
  )
  assert verified.succeeded == 1
  assert connection.ledger["status"] == "verified"
  assert await batch_cloudfront_paths(connection, BATCH_ID) == (
    f"/uploads/face-analysis-source/{MEDIA_ID}.png",
  )

  cleaned, paths = await cleanup_private_media_batch(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    cloudfront_distribution_id="E123456789",
    cloudfront_invalidation_id="I-COMPLETED-123",
    object_store=store,
    invalidation_verifier=(invalidation := CompletedInvalidation()),
  )
  assert cleaned.succeeded == 1
  assert paths == (f"/uploads/face-analysis-source/{MEDIA_ID}.png",)
  assert store.deleted == [(candidate.source_bucket, candidate.source_object_key)]
  assert connection.ledger["status"] == "completed"
  assert invalidation.calls == [
    (
      "E123456789",
      "I-COMPLETED-123",
      (f"/uploads/face-analysis-source/{MEDIA_ID}.png",),
    ),
  ]


@pytest.mark.asyncio
async def test_rollback_restores_database_before_source_cleanup() -> None:
  candidate = _candidate()
  connection = MigrationConnection(candidate)
  store = MemoryObjectStore(candidate)

  await migrate_candidate(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    candidate=candidate,
    object_store=store,
  )
  target_location = (connection.ledger["target_bucket"], connection.ledger["target_object_key"])

  result = await rollback_private_media_batch(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    object_store=store,
  )

  assert result.succeeded == 1
  assert connection.media["bucket"] == candidate.source_bucket
  assert connection.media["object_key"] == candidate.source_object_key
  assert connection.media["cdn_url"] == candidate.source_cdn_url
  assert connection.ledger["status"] == "rolled_back"
  assert store.deleted == [target_location]


@pytest.mark.asyncio
async def test_rollback_retries_target_cleanup_without_restoring_twice() -> None:
  candidate = _candidate()
  connection = MigrationConnection(candidate)
  store = FlakyDeleteStore(candidate)
  await migrate_candidate(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    candidate=candidate,
    object_store=store,
  )

  first = await rollback_private_media_batch(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    object_store=store,
  )
  assert first.failed == 1
  assert connection.ledger["status"] == "rollback_pending"
  assert connection.media["bucket"] == candidate.source_bucket

  second = await rollback_private_media_batch(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    object_store=store,
  )
  assert second.succeeded == 1
  assert connection.ledger["status"] == "rolled_back"


@pytest.mark.asyncio
async def test_cleanup_requires_completed_invalidation_evidence() -> None:
  with pytest.raises(ValueError, match="CloudFront invalidation"):
    await cleanup_private_media_batch(
      object(),
      _settings(),
      batch_id=BATCH_ID,
      cloudfront_distribution_id="E123456789",
      cloudfront_invalidation_id="",
      object_store=object(),
    )


@pytest.mark.asyncio
async def test_verify_rejects_unknown_or_partial_batches() -> None:
  candidate = _candidate()
  unknown = MigrationConnection(candidate)
  with pytest.raises(RuntimeError, match="unknown or empty"):
    await verify_private_media_batch(
      unknown,
      _settings(),
      batch_id=BATCH_ID,
      object_store=MemoryObjectStore(candidate),
    )

  partial = MigrationConnection(candidate)
  partial.ledger = {
    "id": LEDGER_ID,
    "batch_id": BATCH_ID,
    "status": "failed",
  }
  with pytest.raises(RuntimeError, match="partial batch"):
    await verify_private_media_batch(
      partial,
      _settings(),
      batch_id=BATCH_ID,
      object_store=MemoryObjectStore(candidate),
    )


@pytest.mark.asyncio
async def test_cleanup_refuses_to_delete_a_shared_legacy_object() -> None:
  candidate = _candidate()
  connection = MigrationConnection(candidate)
  store = MemoryObjectStore(candidate)
  await migrate_candidate(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    candidate=candidate,
    object_store=store,
  )
  await verify_private_media_batch(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    object_store=store,
  )
  connection.is_referenced = True

  result, _ = await cleanup_private_media_batch(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    cloudfront_distribution_id="E123456789",
    cloudfront_invalidation_id="I-COMPLETED-123",
    object_store=store,
    invalidation_verifier=CompletedInvalidation(),
  )

  assert result.failed == 1
  assert store.deleted == []
  assert connection.ledger["status"] == "cleanup_pending"


@pytest.mark.asyncio
async def test_cleanup_retry_succeeds_after_source_was_already_deleted() -> None:
  base = _candidate()
  thumbnail_key = f"uploads/face-analysis-source-thumbnail/{MEDIA_ID}.jpg"
  state = {**base.source_state, "thumbnail_bucket": base.source_bucket, "thumbnail_object_key": thumbnail_key}
  candidate = MigrationCandidate(
    resource_type=base.resource_type,
    resource_id=base.resource_id,
    owner_user_id=base.owner_user_id,
    media_kind=base.media_kind,
    source_bucket=base.source_bucket,
    source_object_key=base.source_object_key,
    source_cdn_url=base.source_cdn_url,
    source_state=state,
    byte_size=base.byte_size,
  )
  connection = MigrationConnection(candidate)
  store = FailSecondDeleteOnceStore(candidate)
  store.objects[(candidate.source_bucket, thumbnail_key)] = (_image_bytes(), "image/jpeg")
  await migrate_candidate(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    candidate=candidate,
    object_store=store,
  )
  await verify_private_media_batch(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    object_store=store,
  )

  first, _ = await cleanup_private_media_batch(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    cloudfront_distribution_id="E123456789",
    cloudfront_invalidation_id="I-COMPLETED-123",
    object_store=store,
    invalidation_verifier=CompletedInvalidation(),
  )
  assert first.failed == 1
  assert (candidate.source_bucket, candidate.source_object_key) not in store.objects
  assert (candidate.source_bucket, thumbnail_key) in store.objects

  second, _ = await cleanup_private_media_batch(
    connection,
    _settings(),
    batch_id=BATCH_ID,
    cloudfront_distribution_id="E123456789",
    cloudfront_invalidation_id="I-COMPLETED-123",
    object_store=store,
    invalidation_verifier=CompletedInvalidation(),
  )
  assert second.failed == 0
  assert second.succeeded == 1
  assert connection.ledger["status"] == "completed"
  assert (candidate.source_bucket, thumbnail_key) not in store.objects


@pytest.mark.asyncio
async def test_resource_cannot_be_silently_adopted_by_another_batch() -> None:
  candidate = _candidate()
  connection = MigrationConnection(candidate)
  connection.ledger = {
    "id": LEDGER_ID,
    "batch_id": BATCH_ID,
    "resource_type": candidate.resource_type,
    "resource_id": candidate.resource_id,
    "owner_user_id": candidate.owner_user_id,
    "media_kind": candidate.media_kind,
    "source_bucket": candidate.source_bucket,
    "source_object_key": candidate.source_object_key,
    "source_cdn_url": candidate.source_cdn_url,
    "source_state": json.dumps(candidate.source_state, default=str),
    "status": "failed",
    "attempts": 1,
  }

  with pytest.raises(RuntimeError, match="original batch id"):
    await migrate_candidate(
      connection,
      _settings(),
      batch_id=uuid4(),
      candidate=candidate,
      object_store=MemoryObjectStore(candidate),
    )
