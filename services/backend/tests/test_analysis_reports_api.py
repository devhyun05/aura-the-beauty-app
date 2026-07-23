from uuid import uuid4

import pytest
from fastapi import BackgroundTasks

from app.api import analysis as analysis_api
from app.core.settings import Settings


class FakeDatabase:
  def __init__(self) -> None:
    self.query = ""
    self.args = ()

  async def fetch(self, query, *args):
    self.query = query
    self.args = args
    return []


class _AsyncContext:
  def __init__(self, value) -> None:
    self.value = value

  async def __aenter__(self):
    return self.value

  async def __aexit__(self, _exc_type, _exc, _traceback):
    return False


class DeleteReportConnection:
  def __init__(self, report: dict) -> None:
    self.executions: list[tuple[str, tuple]] = []
    self.report = report

  def transaction(self):
    return _AsyncContext(self)

  async def fetchrow(self, _query, *_args):
    return self.report

  async def execute(self, query, *args):
    self.executions.append((query, args))
    return "OK"

  async def fetchval(self, query, *args):
    self.executions.append((query, args))
    return self.report["photo_capture_id"]


class DeleteReportDatabase:
  def __init__(self, connection: DeleteReportConnection) -> None:
    self.pool = type(
      "DeleteReportPool",
      (),
      {"acquire": lambda _self: _AsyncContext(connection)},
    )()


@pytest.mark.asyncio
async def test_list_analysis_reports_only_exposes_completed_reports(monkeypatch):
  db = FakeDatabase()

  async def fake_ensure_user(_db, _auth):
    return {"id": "user-1"}

  monkeypatch.setattr(analysis_api, "ensure_user", fake_ensure_user)

  await analysis_api.list_analysis_reports(
    with_recommended_makeups=False,
    limit=3,
    auth=object(),
    db=db,
  )

  normalized_query = " ".join(db.query.split()).lower()
  assert "r.status = 'completed'" in normalized_query
  assert "'faceanalysisv2'->'perception'" in normalized_query
  assert "'faceanalysisv2'->'consulting'" in normalized_query
  assert db.args == ("user-1", 3)


@pytest.mark.asyncio
async def test_delete_analysis_report_scrubs_sensitive_data_and_collects_thumbnails(
  monkeypatch,
):
  user_id = uuid4()
  report_id = uuid4()
  photo_capture_id = uuid4()
  media_id = uuid4()
  report = {
    "capture_media_bucket": "media-bucket",
    "capture_media_id": media_id,
    "capture_media_object_key": "uploads/capture/capture.jpg",
    "capture_thumbnail_media_bucket": "media-bucket",
    "capture_thumbnail_media_object_key": "uploads/capture/capture-thumb.jpg",
    "deleted_at": None,
    "detail_payload": {"request": {"measurements": {"face3d": {"metrics": {}}}}},
    "photo_capture_id": photo_capture_id,
    "preview_media_bucket": None,
    "preview_media_id": None,
    "preview_media_object_key": None,
    "preview_thumbnail_media_bucket": None,
    "preview_thumbnail_media_object_key": None,
    "source_media_bucket": "media-bucket",
    "source_media_id": media_id,
    "source_media_object_key": "uploads/capture/source.jpg",
    "source_thumbnail_media_bucket": "media-bucket",
    "source_thumbnail_media_object_key": "uploads/capture/source-thumb.jpg",
  }
  connection = DeleteReportConnection(report)
  db = DeleteReportDatabase(connection)
  captured_refs = []

  async def fake_ensure_media_deletion_schema(_db):
    return None

  async def fake_ensure_user(_db, _auth):
    return {"id": user_id}

  async def fake_enqueue(_connection, *, report_id: object, refs):
    captured_refs.extend(refs)
    return [], 0

  monkeypatch.setattr(
    analysis_api,
    "ensure_media_deletion_schema",
    fake_ensure_media_deletion_schema,
  )
  monkeypatch.setattr(analysis_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(
    analysis_api,
    "enqueue_unreferenced_report_media_deletions",
    fake_enqueue,
  )

  response = await analysis_api.delete_analysis_report(
    report_id=report_id,
    background_tasks=BackgroundTasks(),
    auth=object(),
    db=db,
    settings=Settings(s3_bucket_name="media-bucket"),
  )

  executed_sql = " ".join(
    " ".join(query.split()).lower()
    for query, _args in connection.executions
  )
  assert "delete from analysis_stage_runs" in executed_sql
  assert "delete from face_length_measurement_snapshots" in executed_sql
  assert "detail_payload = '{}'::jsonb" in executed_sql
  assert "embedding = null" in executed_sql
  assert "source_media_id = null" in executed_sql
  assert "delete from photo_captures" in executed_sql
  assert "set device_payload = '{}'::jsonb" not in executed_sql
  assert sorted(ref.object_key for ref in captured_refs) == [
    "uploads/capture/capture-thumb.jpg",
    "uploads/capture/capture.jpg",
    "uploads/capture/source-thumb.jpg",
    "uploads/capture/source.jpg",
  ]
  assert response["data"]["deleted"] is True
