from typing import Any

import pytest

from app.ops.cleanup_expired_media_uploads import (
  cleanup_expired_media_uploads,
  find_expired_media_uploads,
)


class FakeDB:
  def __init__(self, rows: list[dict[str, Any]]) -> None:
    self.rows = rows
    self.fetch_calls: list[tuple[str, tuple[object, ...]]] = []
    self.update_calls: list[tuple[str, tuple[object, ...]]] = []

  async def fetch(self, query: str, *args: object) -> list[dict[str, Any]]:
    self.fetch_calls.append((" ".join(query.split()), args))
    return self.rows

  async def fetchrow(self, query: str, *args: object) -> dict[str, str]:
    self.update_calls.append((" ".join(query.split()), args))
    return {"id": str(args[0])}


class FakeS3:
  def __init__(self, *, fail_on: str | None = None) -> None:
    self.fail_on = fail_on
    self.deleted: list[tuple[str, str]] = []

  def delete_object(self, *, bucket: str, object_key: str) -> None:
    self.deleted.append((bucket, object_key))
    if object_key == self.fail_on:
      raise RuntimeError("delete failed")


def _expired_row(upload_id: str = "upload-1") -> dict[str, Any]:
  return {
    "id": upload_id,
    "bucket": "aura-mobile-media-dev",
    "object_key": "uploads/capture/face.jpg",
    "thumbnail_bucket": "aura-mobile-media-dev",
    "thumbnail_object_key": "uploads/capture-thumbnail/client.jpg",
  }


@pytest.mark.asyncio
async def test_find_expired_uploads_only_reads_pending_expired_rows() -> None:
  db = FakeDB([_expired_row()])

  result = await find_expired_media_uploads(db)

  assert result.candidate_upload_ids == ("upload-1",)
  assert result.cleaned_upload_ids == ()
  assert "status = 'pending'" in db.fetch_calls[0][0]
  assert "expires_at <= now()" in db.fetch_calls[0][0]
  assert db.fetch_calls[0][1] == (500,)
  assert db.update_calls == []


@pytest.mark.asyncio
async def test_cleanup_deletes_original_and_both_thumbnail_sources_before_expiring_row() -> None:
  db = FakeDB([_expired_row()])
  s3 = FakeS3()

  result = await cleanup_expired_media_uploads(db, s3=s3)

  assert result.cleaned_upload_ids == ("upload-1",)
  assert result.failed_upload_ids == ()
  assert s3.deleted == [
    ("aura-mobile-media-dev", "uploads/capture/face.jpg"),
    ("aura-mobile-media-dev", "uploads/capture/thumbnails/face.jpg"),
    ("aura-mobile-media-dev", "uploads/capture-thumbnail/client.jpg"),
  ]
  assert "set status = 'expired'" in db.update_calls[0][0]
  assert "status = 'pending'" in db.update_calls[0][0]
  assert db.update_calls[0][1] == ("upload-1",)


@pytest.mark.asyncio
async def test_cleanup_leaves_failed_upload_pending_for_next_retry() -> None:
  db = FakeDB([_expired_row()])
  s3 = FakeS3(fail_on="uploads/capture/thumbnails/face.jpg")

  result = await cleanup_expired_media_uploads(db, s3=s3)

  assert result.cleaned_upload_ids == ()
  assert result.failed_upload_ids == ("upload-1",)
  assert result.has_failures is True
  assert db.update_calls == []
