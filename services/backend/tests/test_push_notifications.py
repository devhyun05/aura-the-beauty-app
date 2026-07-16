from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.api import notifications as notifications_api
from app.core.settings import Settings
from app.services.push_notifications import (
  create_and_send_notification,
  is_expo_push_token,
)


def test_expo_push_token_validation() -> None:
  assert is_expo_push_token("ExpoPushToken[valid-token]")
  assert is_expo_push_token("ExponentPushToken[legacy-token]")
  assert not is_expo_push_token("not-an-expo-token")
  assert not is_expo_push_token("ExpoPushToken[]")


class FakeNotificationDatabase:
  def __init__(self) -> None:
    self.notification_id = uuid4()
    self.executed_queries: list[str] = []
    self.report_notification_suppressed = False

  async def fetchrow(self, query: str, *args):
    normalized_query = " ".join(query.split())

    if normalized_query.startswith("select 1 as suppressed"):
      return {"suppressed": 1} if self.report_notification_suppressed else None

    if normalized_query.startswith("insert into app_notifications"):
      return {
        "id": self.notification_id,
        "user_id": self.user_id,
        "notification_type": "analysis_report_completed",
        "title": "얼굴 분석 보고서가 완성됐어요",
        "body": "결과를 확인해 보세요.",
        "data": {"reportId": str(self.report_id)},
        "created_at": datetime.now(timezone.utc),
      }

    if normalized_query.startswith("update notification_outbox"):
      return {"id": uuid4(), "attempts": 1}

    if normalized_query.startswith("select id, user_id, notification_type"):
      return {
        "id": self.notification_id,
        "user_id": self.user_id,
        "notification_type": "analysis_report_completed",
        "title": "얼굴 분석 보고서가 완성됐어요",
        "body": "결과를 확인해 보세요.",
        "data": {"reportId": str(self.report_id)},
      }

    raise AssertionError(f"Unexpected fetchrow query: {normalized_query}")

  async def fetch(self, query: str, *args):
    normalized_query = " ".join(query.split())
    if normalized_query.startswith("select expo_push_token"):
      return []
    raise AssertionError(f"Unexpected fetch query: {normalized_query}")

  async def execute(self, query: str, *args):
    self.executed_queries.append(" ".join(query.split()))
    return "OK"


@pytest.mark.asyncio
async def test_report_notification_persists_when_push_is_disabled() -> None:
  database = FakeNotificationDatabase()
  database.user_id = uuid4()
  database.report_id = uuid4()
  settings = Settings(push_notifications_enabled=False)

  await create_and_send_notification(
    database,
    settings,
    user_id=database.user_id,
    notification_type="analysis_report_completed",
    title="얼굴 분석 보고서가 완성됐어요",
    body="결과를 확인해 보세요.",
    data={"reportId": str(database.report_id)},
    dedupe_key=f"analysis-report:{database.report_id}:completed",
  )

  assert any(
    query.startswith("insert into notification_outbox")
    for query in database.executed_queries
  )
  assert any(
    query.startswith("select pg_notify")
    for query in database.executed_queries
  )
  assert any(
    "set status = 'completed'" in query
    for query in database.executed_queries
  )


@pytest.mark.asyncio
async def test_non_report_notification_is_skipped() -> None:
  database = FakeNotificationDatabase()
  database.user_id = uuid4()
  database.report_id = uuid4()

  await create_and_send_notification(
    database,
    Settings(push_notifications_enabled=False),
    user_id=database.user_id,
    notification_type="consulting_completed",
    title="상담이 완료됐어요",
    body="상담 내역을 확인해 보세요.",
    data={},
    dedupe_key="consulting:completed",
  )

  assert database.executed_queries == []


@pytest.mark.asyncio
async def test_viewed_report_notification_is_skipped() -> None:
  database = FakeNotificationDatabase()
  database.user_id = uuid4()
  database.report_id = uuid4()
  database.report_notification_suppressed = True

  await create_and_send_notification(
    database,
    Settings(push_notifications_enabled=True),
    user_id=database.user_id,
    notification_type="analysis_report_completed",
    title="얼굴 분석 보고서가 완성됐어요",
    body="결과를 확인해 보세요.",
    data={"reportId": str(database.report_id)},
    dedupe_key=f"analysis-report:{database.report_id}:completed",
  )

  assert database.executed_queries == []


class FakeDeleteNotificationDatabase:
  def __init__(self) -> None:
    self.deleted_notification_id = uuid4()
    self.query_args: tuple | None = None

  async def fetchrow(self, query: str, *args):
    normalized_query = " ".join(query.split())
    assert normalized_query.startswith("delete from app_notifications")
    self.query_args = args
    return {"id": self.deleted_notification_id}


@pytest.mark.asyncio
async def test_delete_notification_is_scoped_to_current_user(monkeypatch) -> None:
  database = FakeDeleteNotificationDatabase()
  user_id = uuid4()
  notification_id = uuid4()

  async def fake_ensure_user(db, auth):
    assert db is database
    return {"id": user_id}

  monkeypatch.setattr(notifications_api, "ensure_user", fake_ensure_user)

  response = await notifications_api.delete_notification(
    notification_id,
    auth=object(),
    db=database,
  )

  assert response["data"]["deleted"] is True
  assert database.query_args is not None
  assert database.query_args[0] == notification_id
  assert database.query_args[1] == user_id
