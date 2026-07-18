import asyncio
import json
import os
from collections.abc import Iterator
from datetime import date
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID, uuid4

import asyncpg
import pytest

from app.api import makeup_journey as journey_api
from app.core.errors import AppError
from app.db.check_schema import check_schema, format_schema_report
from app.db.init_db import POST_SCHEMA_MIGRATIONS, apply_schema
from app.schemas.makeup_journey import (
  MakeupJourneyMissionCreate,
  MakeupJourneyMissionUpdate,
  MakeupJourneyNoteUpdate,
  MakeupJourneyScoreSelectionUpdate,
)


DATABASE_URL = os.getenv("AURA_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(
  not DATABASE_URL,
  reason="AURA_TEST_DATABASE_URL is required for PostgreSQL integration coverage",
)


def _replace_database_name(database_url: str, database_name: str) -> str:
  parsed = urlsplit(database_url)
  if parsed.scheme not in {"postgres", "postgresql"} or not parsed.netloc:
    raise ValueError("AURA_TEST_DATABASE_URL must be a PostgreSQL URL with a host")
  return urlunsplit((parsed.scheme, parsed.netloc, f"/{database_name}", parsed.query, ""))


async def _create_database(admin_url: str, database_name: str) -> None:
  connection = await asyncpg.connect(admin_url)
  try:
    await connection.execute(f'create database "{database_name}"')
  finally:
    await connection.close()


async def _drop_database(admin_url: str, database_name: str) -> None:
  connection = await asyncpg.connect(admin_url)
  try:
    await connection.execute(
      "select pg_terminate_backend(pid) from pg_stat_activity "
      "where datname = $1 and pid <> pg_backend_pid()",
      database_name,
    )
    await connection.execute(f'drop database if exists "{database_name}"')
  finally:
    await connection.close()


@pytest.fixture(scope="module")
def isolated_database_url() -> Iterator[str]:
  assert DATABASE_URL is not None
  database_name = f"makeup_journey_test_{uuid4().hex}"
  isolated_url = _replace_database_name(DATABASE_URL, database_name)
  asyncio.run(_create_database(DATABASE_URL, database_name))
  try:
    asyncio.run(apply_schema(isolated_url))
    report = asyncio.run(check_schema(isolated_url))
    assert report["ok"], format_schema_report(report)
    yield isolated_url
  finally:
    asyncio.run(_drop_database(DATABASE_URL, database_name))


class ConnectionDatabase:
  def __init__(self, connection: asyncpg.Connection) -> None:
    self.connection = connection
    self.day_report_rows: list[dict] | None = None

  async def fetch(self, query, *args):
    rows = [dict(row) for row in await self.connection.fetch(query, *args)]
    if "from projected_reports" in query:
      self.day_report_rows = rows
    return rows

  async def fetchrow(self, query, *args):
    row = await self.connection.fetchrow(query, *args)
    return dict(row) if row else None

  async def execute(self, query, *args):
    return await self.connection.execute(query, *args)


@pytest.mark.asyncio
async def test_postgres_legacy_feedback_date_backfill_uses_kst_boundary(
  isolated_database_url: str,
) -> None:
  connection = await asyncpg.connect(isolated_database_url)
  transaction = connection.transaction()
  await transaction.start()
  user_id = UUID("10000000-0000-0000-0000-000000000010")
  before_midnight_report_id = UUID("20000000-0000-0000-0000-000000000010")
  midnight_report_id = UUID("20000000-0000-0000-0000-000000000012")
  legacy_insert_id = UUID("20000000-0000-0000-0000-000000000011")
  try:
    await connection.execute("insert into users (id, nickname) values ($1, 'legacy')", user_id)
    await connection.execute("alter table makeup_feedback_reports alter column entry_date drop not null")
    await connection.execute(
      """
      insert into makeup_feedback_reports (
        id, user_id, entry_date, source, score, status, feedback_payload, created_at, completed_at
      ) values
        ($1, $3, null, 'camera', 80, 'completed', '{}',
          '2026-07-17 14:59:00+00', '2026-07-17 14:59:00+00'),
        ($2, $3, null, 'camera', 81, 'completed', '{}',
          '2026-07-17 15:00:00+00', '2026-07-17 15:00:00+00')
      """,
      before_midnight_report_id,
      midnight_report_id,
      user_id,
    )

    await connection.execute(POST_SCHEMA_MIGRATIONS["schema.sql:makeup-journey-v1"])

    note_id = await connection.fetchval(
      """
      insert into makeup_journey_day_notes (user_id, entry_date, report_id, content)
      values ($1, '2026-07-18', null, '이관할 기존 메모')
      returning id
      """,
      user_id,
    )
    await connection.execute(
      POST_SCHEMA_MIGRATIONS["schema.sql:makeup-journey-report-notes-v1"],
    )
    assert await connection.fetchval(
      "select report_id from makeup_journey_day_notes where id = $1",
      note_id,
    ) == midnight_report_id

    boundary_rows = await connection.fetch(
      "select id, entry_date from makeup_feedback_reports where id = any($1::uuid[]) order by id",
      [before_midnight_report_id, midnight_report_id],
    )
    assert [dict(row) for row in boundary_rows] == [
      {"id": before_midnight_report_id, "entry_date": date(2026, 7, 17)},
      {"id": midnight_report_id, "entry_date": date(2026, 7, 18)},
    ]
    nullable = await connection.fetchval(
      """
      select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'makeup_feedback_reports'
        and column_name = 'entry_date'
      """,
    )
    assert nullable == "NO"

    # The production workflow applies the schema before replacing old API
    # tasks. Keep their pre-MakeupJourney INSERT shape valid during rollout
    # and after an API rollback.
    legacy_insert = await connection.fetchrow(
      """
      insert into makeup_feedback_reports (
        id, user_id, source, score, status, feedback_payload, created_at
      ) values ($1, $2, 'camera', 81, 'completed', '{}', now())
      returning entry_date, feedback_kind, parent_feedback_report_id
      """,
      legacy_insert_id,
      user_id,
    )
    assert legacy_insert["entry_date"] == await connection.fetchval(
      "select (now() at time zone 'Asia/Seoul')::date",
    )
    assert legacy_insert["feedback_kind"] == "initial"
    assert legacy_insert["parent_feedback_report_id"] is None
  finally:
    await transaction.rollback()
    await connection.close()


@pytest.mark.asyncio
async def test_postgres_journey_aggregation_ownership_crud_and_account_cascade(
  isolated_database_url: str,
  monkeypatch,
) -> None:
  connection = await asyncpg.connect(isolated_database_url)
  transaction = connection.transaction()
  await transaction.start()
  user_id = UUID("10000000-0000-0000-0000-000000000001")
  other_user_id = UUID("10000000-0000-0000-0000-000000000002")
  first_report_id = UUID("20000000-0000-0000-0000-000000000001")
  failed_report_id = UUID("20000000-0000-0000-0000-000000000002")
  correction_report_id = UUID("20000000-0000-0000-0000-000000000003")
  media_id = UUID("30000000-0000-0000-0000-000000000001")
  other_mission_id = UUID("40000000-0000-0000-0000-000000000001")
  try:
    await connection.execute(
      "insert into users (id, nickname) values ($1, 'owner'), ($2, 'other')",
      user_id,
      other_user_id,
    )
    await connection.execute(
      """
      insert into makeup_journey_settings (user_id, goal_score, mission_level)
      values ($1, 80, 'beginner')
      """,
      user_id,
    )
    await connection.execute(
      "insert into media_assets (id, owner_user_id, media_kind, source) values ($1, $2, 'makeup_feedback', 'camera')",
      media_id,
      user_id,
    )
    feedback_payload = json.dumps(
      {
        "request": {"feedbackContext": {"userGoalText": "출근 메이크업"}},
        "result": {
          "summary": {"strengthSummary": "피부 표현이 자연스러워요."},
          "strengths": [{"title": "피부 표현"}],
          "points": [{"title": "블러셔", "actionSteps": ["경계를 한 번 풀어보세요."]}],
        },
      },
      ensure_ascii=False,
    )
    await connection.execute(
      """
      insert into makeup_feedback_reports (
        id, user_id, entry_date, feedback_kind, parent_feedback_report_id,
        uploaded_media_id, source, score, status, feedback_payload, created_at, completed_at
      ) values
        ($1, $4, '2026-07-17', 'initial', null, $7, 'camera', 70, 'completed', $6::jsonb,
          '2026-07-17 01:00:00+00', '2026-07-17 01:00:00+00'),
        ($2, $4, '2026-07-17', 'initial', null, $7, 'camera', 99, 'failed', $6::jsonb,
          '2026-07-17 02:00:00+00', '2026-07-17 02:00:00+00'),
        ($3, $4, '2026-07-17', 'correction', $1, $7, 'camera', 85, 'completed', $6::jsonb,
          '2026-07-17 03:00:00+00', '2026-07-17 03:00:00+00'),
        ('20000000-0000-0000-0000-000000000004', $5, '2026-07-17', 'initial', null, null,
          'camera', 100, 'completed', $6::jsonb,
          '2026-07-17 04:00:00+00', '2026-07-17 04:00:00+00')
      """,
      first_report_id,
      failed_report_id,
      correction_report_id,
      user_id,
      other_user_id,
      feedback_payload,
      media_id,
    )
    await connection.execute(
      """
      insert into makeup_feedback_reports (
        id, user_id, entry_date, source, score, status, feedback_payload,
        created_at, completed_at
      ) values
        ('20000000-0000-0000-0000-000000000005', $1, '2026-07-17', 'camera', 98,
          'pending', '{}', '2026-07-17 05:00:00+00', null),
        ('20000000-0000-0000-0000-000000000006', $1, '2026-07-17', 'camera', null,
          'completed', '{}', '2026-07-17 06:00:00+00', '2026-07-17 06:00:00+00')
      """,
      user_id,
    )
    await connection.execute(
      "insert into makeup_journey_day_notes (user_id, entry_date, content) values ($1, '2026-07-17', '다른 사용자 메모')",
      other_user_id,
    )
    await connection.execute(
      """
      insert into makeup_journey_missions (
        id, user_id, entry_date, source, difficulty, title
      ) values ($1, $2, '2026-07-17', 'user', 'beginner', '다른 사용자 미션')
      """,
      other_mission_id,
      other_user_id,
    )

    async def ensure_owner(_db, _auth):
      return {"id": user_id}

    monkeypatch.setattr(journey_api, "ensure_user", ensure_owner)
    monkeypatch.setattr(journey_api, "_today", lambda _timezone: date(2026, 7, 17))
    db = ConnectionDatabase(connection)

    calendar = await journey_api.get_makeup_journey_calendar("2026-07", auth=object(), db=db)
    assert calendar["data"]["days"] == [
      {
        "date": "2026-07-17",
        "status": "success",
        "firstScore": 70,
        "latestScore": 85,
        "representativeScore": 85,
        "scoreDelta": 15,
        "reportCount": 2,
        "hasNote": False,
        "missionSummary": {"completed": 0, "total": 0},
      },
    ]
    assert calendar["data"]["summary"]["currentStreak"] == 1

    trend = await journey_api.get_makeup_journey_trends(
      range_value="7d",
      end_date="2026-07-17",
      auth=object(),
      db=db,
    )
    assert trend["data"]["points"] == [
      {"date": "2026-07-17", "score": 85, "status": "success"},
    ]

    day = await journey_api.get_makeup_journey_day("2026-07-17", auth=object(), db=db)
    assert [report["reportId"] for report in day["data"]["reports"]] == [
      str(first_report_id),
      str(correction_report_id),
    ]
    assert [report["feedbackDigest"]["reportId"] for report in day["data"]["reports"]] == [
      str(first_report_id),
      str(correction_report_id),
    ]
    assert day["data"]["feedbackDigest"]["nextAction"] == "경계를 한 번 풀어보세요."

    selection = await journey_api.update_makeup_journey_score_selection(
      "2026-07-17",
      MakeupJourneyScoreSelectionUpdate(reportId=first_report_id),
      auth=object(),
      db=db,
    )
    assert selection["data"]["reportId"] == str(first_report_id)
    assert selection["data"]["score"] == 70
    selected_calendar = await journey_api.get_makeup_journey_calendar(
      "2026-07",
      auth=object(),
      db=db,
    )
    assert selected_calendar["data"]["days"][0]["latestScore"] == 85
    assert selected_calendar["data"]["days"][0]["representativeScore"] == 70
    assert selected_calendar["data"]["days"][0]["status"] == "failure"
    selected_trend = await journey_api.get_makeup_journey_trends(
      range_value="7d",
      end_date="2026-07-17",
      auth=object(),
      db=db,
    )
    assert selected_trend["data"]["points"] == [
      {"date": "2026-07-17", "score": 70, "status": "failure"},
    ]
    selected_day = await journey_api.get_makeup_journey_day(
      "2026-07-17",
      auth=object(),
      db=db,
    )
    assert selected_day["data"]["representativeReportId"] == str(first_report_id)
    assert selected_day["data"]["representativeScore"] == 70

    await connection.execute(
      "update makeup_journey_settings set goal_score = 90 where user_id = $1",
      user_id,
    )
    changed = await journey_api.get_makeup_journey_calendar("2026-07", auth=object(), db=db)
    assert changed["data"]["days"][0]["status"] == "failure"
    assert changed["data"]["days"][0]["latestScore"] == 85
    assert changed["data"]["days"][0]["representativeScore"] == 70
    changed_trend = await journey_api.get_makeup_journey_trends(
      range_value="7d",
      end_date="2026-07-17",
      auth=object(),
      db=db,
    )
    assert changed_trend["data"]["points"] == [
      {"date": "2026-07-17", "score": 70, "status": "failure"},
    ]

    note = await journey_api.update_makeup_journey_note(
      "2026-07-17",
      MakeupJourneyNoteUpdate(content="  최초 기록 메모  ", reportId=first_report_id),
      auth=object(),
      db=db,
    )
    assert note["data"]["note"]["content"] == "최초 기록 메모"
    correction_note = await journey_api.update_makeup_journey_note(
      "2026-07-17",
      MakeupJourneyNoteUpdate(content="수정 기록 메모", reportId=correction_report_id),
      auth=object(),
      db=db,
    )
    assert correction_note["data"]["note"]["content"] == "수정 기록 메모"
    day_with_notes = await journey_api.get_makeup_journey_day(
      "2026-07-17",
      auth=object(),
      db=db,
    )
    assert [report["note"]["content"] for report in day_with_notes["data"]["reports"]] == [
      "최초 기록 메모",
      "수정 기록 메모",
    ]
    deleted_note = await journey_api.update_makeup_journey_note(
      "2026-07-17",
      MakeupJourneyNoteUpdate(content="  ", reportId=first_report_id),
      auth=object(),
      db=db,
    )
    assert deleted_note["data"]["note"] is None
    assert await connection.fetchval(
      "select count(*) from makeup_journey_day_notes where user_id = $1",
      user_id,
    ) == 1
    assert await connection.fetchval(
      "select content from makeup_journey_day_notes where user_id = $1",
      user_id,
    ) == "수정 기록 메모"

    with pytest.raises(AppError) as foreign_update:
      await journey_api.update_makeup_journey_mission(
        other_mission_id,
        MakeupJourneyMissionUpdate(isCompleted=True),
        auth=object(),
        db=db,
      )
    assert foreign_update.value.status_code == 404
    with pytest.raises(AppError) as foreign_delete:
      await journey_api.delete_makeup_journey_mission(
        other_mission_id,
        auth=object(),
        db=db,
      )
    assert foreign_delete.value.status_code == 404

    mission = await journey_api.create_makeup_journey_mission(
      "2026-07-17",
      MakeupJourneyMissionCreate(title="블러셔 경계 연습"),
      auth=object(),
      db=db,
    )
    mission_id = UUID(mission["data"]["mission"]["id"])
    with pytest.raises(AppError) as duplicate:
      await journey_api.create_makeup_journey_mission(
        "2026-07-17",
        MakeupJourneyMissionCreate(title="블러셔 경계 연습"),
        auth=object(),
        db=db,
      )
    assert duplicate.value.status_code == 409

    completed = await journey_api.update_makeup_journey_mission(
      mission_id,
      MakeupJourneyMissionUpdate(isCompleted=True),
      auth=object(),
      db=db,
    )
    assert completed["data"]["mission"]["isCompleted"] is True
    assert completed["data"]["mission"]["completedAt"] is not None
    deleted_mission = await journey_api.delete_makeup_journey_mission(
      mission_id,
      auth=object(),
      db=db,
    )
    assert deleted_mission["data"] == {
      "deleted": True,
      "missionId": str(mission_id),
    }

    # Media deletion SET NULL does not disturb the parent/correction chain.
    await connection.execute("delete from media_assets where id = $1", media_id)
    assert await connection.fetchval(
      "select count(*) from makeup_feedback_reports where user_id = $1",
      user_id,
    ) == 5
    assert await connection.fetchval(
      "select bool_and(uploaded_media_id is null) from makeup_feedback_reports where user_id = $1",
      user_id,
    ) is True

    # User cascade removes the self-referencing correction chain and all journey rows.
    await connection.execute("delete from users where id = $1", user_id)
    assert await connection.fetchval(
      "select count(*) from makeup_feedback_reports where user_id = $1",
      user_id,
    ) == 0
    assert await connection.fetchval(
      "select count(*) from makeup_journey_day_notes where user_id = $1",
      user_id,
    ) == 0
    assert await connection.fetchval(
      "select count(*) from makeup_journey_missions where user_id = $1",
      user_id,
    ) == 0
    assert await connection.fetchval(
      "select count(*) from makeup_journey_day_score_selections where user_id = $1",
      user_id,
    ) == 0
  finally:
    await transaction.rollback()
    await connection.close()


@pytest.mark.asyncio
async def test_postgres_day_detail_projects_historical_payloads_at_database_boundary(
  isolated_database_url: str,
  monkeypatch,
) -> None:
  connection = await asyncpg.connect(isolated_database_url)
  transaction = connection.transaction()
  await transaction.start()
  user_id = UUID("10000000-0000-0000-0000-000000000030")
  current_report_id = UUID("20000000-0000-0000-0000-000000000030")
  legacy_report_id = UUID("20000000-0000-0000-0000-000000000031")
  latest_report_id = UUID("20000000-0000-0000-0000-000000000032")
  private_blob = "private-history:" + ("x" * 2_000_000)
  try:
    await connection.execute(
      "insert into users (id, nickname) values ($1, 'projection-owner')",
      user_id,
    )
    await connection.execute(
      """
      insert into makeup_journey_settings (user_id, goal_score, mission_level)
      values ($1, 80, 'beginner')
      """,
      user_id,
    )

    current_payload = json.dumps(
      {
        "request": {
          "feedbackContext": {
            "userGoalText": "현재 데일리 메이크업",
            "analysisGoalText": "차분한 현재 데일리 메이크업",
          },
        },
        "result": {
          "scoreReason": "과거 결과는 digest 대상이 아니에요.",
          "imageUrl": "https://private.example/current-history.jpg",
          "privateBlob": private_blob,
        },
      },
      ensure_ascii=False,
    )
    legacy_payload = json.dumps(
      {
        "request": {
          "user_goal_text": "레거시 면접 메이크업",
          "analysisGoalText": "단정한 레거시 면접 메이크업",
          "goal_intent_type": "valid_context",
          "profileGender": "female",
        },
        "result": {
          "scoreReason": "두 번째 과거 결과",
          "imageUrl": "https://private.example/legacy-history.jpg",
          "privateBlob": private_blob,
        },
      },
      ensure_ascii=False,
    )
    latest_payload = json.dumps(
      {
        "request": {
          "user_goal_text": "레거시 최신 메이크업",
          "analysis_goal_text": "또렷한 레거시 최신 메이크업",
        },
        "result": {
          "summary": {"strengthSummary": "최신 리포트만 한눈 요약합니다."},
          "strengths": [{"title": "고른 피부 표현"}],
          "points": [
            {
              "title": "아이라인",
              "actionSteps": ["꼬리를 조금 짧게 정리하세요."],
            },
          ],
          "imageUrl": "https://private.example/latest.jpg",
          "privateBlob": private_blob,
        },
      },
      ensure_ascii=False,
    )
    await connection.execute(
      """
      insert into makeup_feedback_reports (
        id, user_id, entry_date, source, score, status, feedback_payload,
        created_at, completed_at
      ) values
        ($1, $4, '2026-07-15', 'camera', 61, 'completed', $5::jsonb,
          '2026-07-15 01:00:00+00', '2026-07-15 01:00:00+00'),
        ($2, $4, '2026-07-15', 'camera', 72, 'completed', $6::jsonb,
          '2026-07-15 02:00:00+00', '2026-07-15 02:00:00+00'),
        ($3, $4, '2026-07-15', 'camera', 85, 'completed', to_jsonb($7::text),
          '2026-07-15 03:00:00+00', '2026-07-15 03:00:00+00')
      """,
      current_report_id,
      legacy_report_id,
      latest_report_id,
      user_id,
      current_payload,
      legacy_payload,
      latest_payload,
    )

    async def ensure_owner(_db, _auth):
      return {"id": user_id}

    monkeypatch.setattr(journey_api, "ensure_user", ensure_owner)
    db = ConnectionDatabase(connection)
    day = await journey_api.get_makeup_journey_day(
      "2026-07-15",
      auth=object(),
      db=db,
    )

    assert db.day_report_rows is not None
    assert [row["id"] for row in db.day_report_rows] == [
      current_report_id,
      legacy_report_id,
      latest_report_id,
    ]
    assert all(row["feedback_payload"] is not None for row in db.day_report_rows)
    assert all(len(row["feedback_payload"]) > len(private_blob) for row in db.day_report_rows)

    projected_contexts = [
      json.loads(row["goal_context"])
      if isinstance(row["goal_context"], str)
      else row["goal_context"]
      for row in db.day_report_rows
    ]
    assert projected_contexts == [
      {
        "userGoalText": "현재 데일리 메이크업",
        "analysisGoalText": "차분한 현재 데일리 메이크업",
      },
      {
        "userGoalText": "레거시 면접 메이크업",
        "analysisGoalText": "단정한 레거시 면접 메이크업",
        "goalIntentType": "valid_context",
        "profileGender": "female",
      },
      {},
    ]

    assert day["data"]["reportCount"] == 3
    assert [report["goalContext"] for report in day["data"]["reports"]] == [
      projected_contexts[0],
      projected_contexts[1],
      {
        "userGoalText": "레거시 최신 메이크업",
        "analysisGoalText": "또렷한 레거시 최신 메이크업",
      },
    ]
    assert [report["feedbackDigest"]["headline"] for report in day["data"]["reports"]] == [
      "과거 결과는 digest 대상이 아니에요.",
      "두 번째 과거 결과",
      "최신 리포트만 한눈 요약합니다.",
    ]
    assert day["data"]["feedbackDigest"] == {
      "reportId": str(latest_report_id),
      "headline": "최신 리포트만 한눈 요약합니다.",
      "strengthCount": 1,
      "strengths": ["고른 피부 표현"],
      "improvementCount": 1,
      "improvements": ["아이라인"],
      "nextAction": "꼬리를 조금 짧게 정리하세요.",
    }
    encoded_day = json.dumps(day, ensure_ascii=False)
    assert "private-history" not in encoded_day
    assert "private.example" not in encoded_day
  finally:
    await transaction.rollback()
    await connection.close()


@pytest.mark.asyncio
async def test_postgres_daily_score_tie_break_uses_report_uuid(
  isolated_database_url: str,
  monkeypatch,
) -> None:
  connection = await asyncpg.connect(isolated_database_url)
  transaction = connection.transaction()
  await transaction.start()
  user_id = UUID("10000000-0000-0000-0000-000000000020")
  lower_report_id = UUID("20000000-0000-0000-0000-000000000020")
  higher_report_id = UUID("20000000-0000-0000-0000-000000000021")
  try:
    await connection.execute(
      "insert into users (id, nickname) values ($1, 'tie-break')",
      user_id,
    )
    await connection.execute(
      """
      insert into makeup_journey_settings (user_id, goal_score, mission_level)
      values ($1, 80, 'beginner')
      """,
      user_id,
    )
    await connection.execute(
      """
      insert into makeup_feedback_reports (
        id, user_id, entry_date, source, score, status, feedback_payload,
        created_at, completed_at
      ) values
        ($1, $3, '2026-07-16', 'camera', 61, 'completed', '{}',
          '2026-07-16 01:00:00+00', '2026-07-16 02:00:00+00'),
        ($2, $3, '2026-07-16', 'camera', 89, 'completed', '{}',
          '2026-07-16 01:00:00+00', '2026-07-16 02:00:00+00')
      """,
      lower_report_id,
      higher_report_id,
      user_id,
    )

    async def ensure_owner(_db, _auth):
      return {"id": user_id}

    monkeypatch.setattr(journey_api, "ensure_user", ensure_owner)
    monkeypatch.setattr(journey_api, "_today", lambda _timezone: date(2026, 7, 16))
    db = ConnectionDatabase(connection)

    calendar = await journey_api.get_makeup_journey_calendar(
      "2026-07",
      auth=object(),
      db=db,
    )
    assert calendar["data"]["days"] == [
      {
        "date": "2026-07-16",
        "status": "success",
        "firstScore": 61,
        "latestScore": 89,
        "representativeScore": 89,
        "scoreDelta": 28,
        "reportCount": 2,
        "hasNote": False,
        "missionSummary": {"completed": 0, "total": 0},
      },
    ]

    day = await journey_api.get_makeup_journey_day(
      "2026-07-16",
      auth=object(),
      db=db,
    )
    assert [report["reportId"] for report in day["data"]["reports"]] == [
      str(lower_report_id),
      str(higher_report_id),
    ]
  finally:
    await transaction.rollback()
    await connection.close()
