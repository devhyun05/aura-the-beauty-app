from uuid import UUID

import pytest
from fastapi import BackgroundTasks

from app.api import feedback as feedback_api
from app.api import filter_extractions as filter_extractions_api
from app.api import makeup_recommendations as makeup_recommendations_api
from app.core.errors import AppError
from app.core.settings import Settings


REPORT_ID = UUID("12345678-1234-5678-1234-567812345678")
MEDIA_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
OUTBOX_ID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")


class DeleteDatabase:
  def __init__(self, *, found: bool = True) -> None:
    self.args = ()
    self.found = found
    self.query = ""

  async def fetchrow(self, query, *args):
    self.query = query
    self.args = args
    return {"id": REPORT_ID} if self.found else None


@pytest.mark.parametrize(
  ("module", "delete_report", "table_name"),
  [
    (
      makeup_recommendations_api,
      makeup_recommendations_api.delete_recommendation_report,
      "makeup_recommendation_reports",
    ),
  ],
)
@pytest.mark.asyncio
async def test_report_deletion_is_scoped_to_authenticated_owner(
  monkeypatch,
  module,
  delete_report,
  table_name,
):
  db = DeleteDatabase()

  async def fake_ensure_user(_db, _auth):
    return {"id": "user-1"}

  monkeypatch.setattr(module, "ensure_user", fake_ensure_user)
  response = await delete_report(REPORT_ID, auth=object(), db=db)

  normalized_query = " ".join(db.query.split()).lower()
  assert f"delete from {table_name}" in normalized_query
  assert "where id = $1 and user_id = $2" in normalized_query
  assert db.args == (REPORT_ID, "user-1")
  assert response["data"]["deleted"] is True
  assert response["data"]["reportId"] == str(REPORT_ID)


@pytest.mark.parametrize(
  ("module", "delete_report"),
  [
    (makeup_recommendations_api, makeup_recommendations_api.delete_recommendation_report),
  ],
)
@pytest.mark.asyncio
async def test_report_deletion_hides_missing_or_foreign_report(
  monkeypatch,
  module,
  delete_report,
):
  db = DeleteDatabase(found=False)

  async def fake_ensure_user(_db, _auth):
    return {"id": "user-1"}

  monkeypatch.setattr(module, "ensure_user", fake_ensure_user)

  with pytest.raises(AppError) as exc_info:
    await delete_report(REPORT_ID, auth=object(), db=db)

  assert exc_info.value.status_code == 404


class TransactionalDeleteConnection:
  def __init__(self, table_name: str, *, found: bool = True) -> None:
    self.table_name = table_name
    self.found = found
    self.queries: list[tuple[str, tuple]] = []

  async def fetchrow(self, query: str, *args):
    normalized = " ".join(query.split()).lower()
    self.queries.append((normalized, args))
    assert f"from {self.table_name}" in normalized
    assert "for update" in normalized
    return {"id": REPORT_ID} if self.found else None

  async def fetch(self, query: str, *args):
    normalized = " ".join(query.split()).lower()
    self.queries.append((normalized, args))
    assert f"from {self.table_name}" in normalized
    return [
      {
        "media_asset_id": MEDIA_ID,
        "bucket": "aura-private-media",
        "object_key": f"private/user-media/users/user-1/{MEDIA_ID}.jpg",
      },
    ]

  async def execute(self, query: str, *args):
    normalized = " ".join(query.split()).lower()
    self.queries.append((normalized, args))
    assert f"delete from {self.table_name}" in normalized
    return "DELETE 1"


class TransactionalDeleteDatabase:
  def __init__(self, table_name: str, *, found: bool = True) -> None:
    self.pool = object()
    self.connection = TransactionalDeleteConnection(table_name, found=found)

  async def run_in_transaction(self, operation):
    return await operation(self.connection)


@pytest.mark.parametrize(
  ("module", "delete_report", "table_name", "reason"),
  [
    (
      feedback_api,
      feedback_api.delete_feedback_report,
      "makeup_feedback_reports",
      "makeup_feedback_report_deleted",
    ),
    (
      filter_extractions_api,
      filter_extractions_api.delete_filter_extraction,
      "filter_extraction_reports",
      "filter_extraction_report_deleted",
    ),
  ],
)
@pytest.mark.asyncio
async def test_sensitive_report_deletion_queues_owned_private_media_transactionally(
  monkeypatch,
  module,
  delete_report,
  table_name,
  reason,
):
  db = TransactionalDeleteDatabase(table_name)
  background_tasks = BackgroundTasks()
  captured: dict = {}

  async def fake_ensure_user(_db, _auth):
    return {"id": "user-1"}

  async def fake_ensure_schema(_db):
    return None

  async def fake_enqueue(connection, *, report_id, refs, reason):
    captured.update(
      connection=connection,
      report_id=report_id,
      refs=list(refs),
      reason=reason,
    )
    return [OUTBOX_ID], 0

  monkeypatch.setattr(module, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(module, "ensure_media_deletion_schema", fake_ensure_schema)
  monkeypatch.setattr(module, "enqueue_unreferenced_report_media_deletions", fake_enqueue)

  response = await delete_report(
    REPORT_ID,
    background_tasks,
    auth=object(),
    db=db,
    settings=Settings(s3_bucket_name="aura-media", private_media_bucket_name="aura-private-media"),
  )

  delete_queries = [
    (query, args)
    for query, args in db.connection.queries
    if f"delete from {table_name}" in query
  ]
  assert len(delete_queries) == 1
  assert "where id = $1 and user_id = $2" in delete_queries[0][0]
  assert delete_queries[0][1] == (REPORT_ID, "user-1")
  assert captured["connection"] is db.connection
  assert captured["report_id"] == REPORT_ID
  assert captured["reason"] == reason
  assert len(captured["refs"]) == 1
  assert captured["refs"][0].media_asset_id == MEDIA_ID
  assert captured["refs"][0].object_key.startswith("private/user-media/")
  assert len(background_tasks.tasks) == 1
  assert response["data"]["deleted"] is True
  assert response["data"]["outboxCount"] == 1


@pytest.mark.parametrize(
  ("module", "delete_report", "table_name"),
  [
    (feedback_api, feedback_api.delete_feedback_report, "makeup_feedback_reports"),
    (
      filter_extractions_api,
      filter_extractions_api.delete_filter_extraction,
      "filter_extraction_reports",
    ),
  ],
)
@pytest.mark.asyncio
async def test_sensitive_report_deletion_hides_missing_or_foreign_report(
  monkeypatch,
  module,
  delete_report,
  table_name,
):
  db = TransactionalDeleteDatabase(table_name, found=False)

  async def fake_ensure_user(_db, _auth):
    return {"id": "user-1"}

  async def fake_ensure_schema(_db):
    return None

  monkeypatch.setattr(module, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(module, "ensure_media_deletion_schema", fake_ensure_schema)

  with pytest.raises(AppError) as exc_info:
    await delete_report(
      REPORT_ID,
      BackgroundTasks(),
      auth=object(),
      db=db,
      settings=Settings(s3_bucket_name="aura-media", private_media_bucket_name="aura-private-media"),
    )

  assert exc_info.value.status_code == 404
