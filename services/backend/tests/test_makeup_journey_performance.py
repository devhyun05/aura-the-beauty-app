import json
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

import pytest

from app.api import makeup_journey as journey_api


USER_ID = UUID("11111111-1111-1111-1111-111111111111")
PRIVATE_MARKER = "must-not-leak:" + ("x" * 2_000_000)


async def _ensure_user(_db, _auth):
  return {"id": USER_ID, "gender": None}


def _settings() -> dict:
  timestamp = datetime(2026, 7, 1, tzinfo=timezone.utc)
  return {
    "goal_score": 80,
    "mission_level": "beginner",
    "timezone_name": "Asia/Seoul",
    "created_at": timestamp,
    "updated_at": timestamp,
  }


def _normalize(query: str) -> str:
  return " ".join(query.lower().split())


class QueryCountingDatabase:
  def __init__(
    self,
    *,
    calendar_rows: list[dict] | None = None,
    reports: list[dict] | None = None,
    missions: list[dict] | None = None,
    trend_rows: list[dict] | None = None,
  ) -> None:
    self.calendar_rows = calendar_rows
    self.reports = reports
    self.missions = missions
    self.trend_rows = trend_rows
    self.calls: list[tuple[str, str]] = []

  async def fetchrow(self, query, *_args):
    normalized = _normalize(query)
    self.calls.append(("fetchrow", normalized))
    if "from makeup_journey_settings" in normalized:
      return _settings()
    if "from makeup_journey_day_notes" in normalized:
      return {
        "content": "경계 연습",
        "created_at": datetime(2026, 7, 17, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 7, 17, tzinfo=timezone.utc),
      }
    if "from numbered" in normalized:
      return {"current_streak": 31}
    raise AssertionError(f"Unexpected fetchrow query: {normalized}")

  async def fetch(self, query, *_args):
    normalized = _normalize(query)
    self.calls.append(("fetch", normalized))
    if "date_keys as" in normalized:
      assert self.calendar_rows is not None
      return self.calendar_rows
    if "select id, score, feedback_kind" in normalized:
      assert self.reports is not None
      return self.reports
    if "select id, source, difficulty" in normalized:
      assert self.missions is not None
      return self.missions
    if "with ranked as" in normalized:
      assert self.trend_rows is not None
      return self.trend_rows
    raise AssertionError(f"Unexpected fetch query: {normalized}")


def _calendar_rows(count: int) -> list[dict]:
  return [
    {
      "entry_date": date(2026, 7, day),
      "first_score": 70,
      "latest_score": 70 + (day % 20),
      "selected_score": None,
      "report_count": 100,
      "has_note": True,
      "completed_missions": 50,
      "total_missions": 100,
      # Deliberately shaped like sensitive report data. The aggregate mapper
      # must ignore fields outside the calendar allow-list.
      "feedback_payload": {"rawReport": PRIVATE_MARKER},
      "image_url": "https://private.example/calendar-photo.jpg",
    }
    for day in range(1, count + 1)
  ]


def _report_payload() -> dict:
  return {
    "request": {
      "feedbackContext": {"userGoalText": "출근 메이크업"},
      "uploadedMediaUrl": "https://private.example/upload.jpg",
    },
    "result": {
      "summary": {"strengthSummary": "가" * 400},
      "strengths": [{"title": f"강점 {index}"} for index in range(8)],
      "points": [
        {
          "title": f"보완 {index}",
          "actionSteps": ["나" * 400],
        }
        for index in range(7)
      ],
      "imageUrl": "https://private.example/result.jpg",
      "fullReport": PRIVATE_MARKER,
    },
  }


def _reports(count: int) -> list[dict]:
  payload = _report_payload()
  started_at = datetime(2026, 7, 17, tzinfo=timezone.utc)
  return [
    {
      "id": UUID(int=index + 1),
      "score": 60 + (index % 41),
      "feedback_kind": "initial" if index == 0 else "correction",
      "parent_feedback_report_id": None if index == 0 else UUID(int=1),
      "goal_context": {"userGoalText": "출근 메이크업"},
      # Every report needs its own allow-listed digest so feedback follows the
      # photo selected in the client gallery.
      "feedback_payload": payload,
      "created_at": started_at + timedelta(minutes=index),
      "completed_at": started_at + timedelta(minutes=index),
    }
    for index in range(count)
  ]


def _missions(count: int) -> list[dict]:
  timestamp = datetime(2026, 7, 17, tzinfo=timezone.utc)
  return [
    {
      "id": UUID(int=10_000 + index),
      "source": "user",
      "difficulty": "beginner",
      "title": f"연습 {index}",
      "is_completed": index % 2 == 0,
      "completed_at": timestamp if index % 2 == 0 else None,
      "sort_order": index,
      "created_at": timestamp,
      "updated_at": timestamp,
    }
    for index in range(count)
  ]


def _trend_rows(count: int) -> list[dict]:
  start = date(2026, 4, 19)
  return [
    {
      "entry_date": start + timedelta(days=index),
      "score": 50 + (index % 51),
      "feedback_payload": {"fullReport": PRIVATE_MARKER},
      "image_url": "https://private.example/trend.jpg",
    }
    for index in range(count)
  ]


@pytest.mark.asyncio
async def test_calendar_query_count_is_constant_and_month_payload_is_allow_listed(
  monkeypatch,
) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  databases: list[QueryCountingDatabase] = []

  for day_count in (1, 31):
    db = QueryCountingDatabase(calendar_rows=_calendar_rows(day_count))
    response = await journey_api.get_makeup_journey_calendar(
      "2026-07",
      auth=object(),
      db=db,
    )
    databases.append(db)

    assert len(response["data"]["days"]) == day_count
    assert all(
      set(day) == {
        "date",
        "status",
        "firstScore",
        "latestScore",
        "representativeScore",
        "scoreDelta",
        "reportCount",
        "hasNote",
        "missionSummary",
      }
      for day in response["data"]["days"]
    )
    serialized = json.dumps(response, ensure_ascii=False)
    assert "must-not-leak" not in serialized
    assert "private.example" not in serialized
    assert "feedbackPayload" not in serialized
    assert len(serialized) < 20_000

  assert [[method for method, _query in db.calls] for db in databases] == [
    ["fetchrow", "fetch", "fetchrow"],
    ["fetchrow", "fetch", "fetchrow"],
  ]
  aggregate_query = databases[-1].calls[1][1]
  assert "from makeup_feedback_reports" in aggregate_query
  assert "from makeup_journey_day_notes" in aggregate_query
  assert "from makeup_journey_missions" in aggregate_query
  assert "group by entry_date" in aggregate_query


@pytest.mark.asyncio
async def test_day_query_count_is_constant_for_large_report_and_mission_sets(
  monkeypatch,
) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  databases: list[QueryCountingDatabase] = []

  for item_count in (1, 501):
    db = QueryCountingDatabase(
      reports=_reports(item_count),
      missions=_missions(item_count),
    )
    response = await journey_api.get_makeup_journey_day(
      "2026-07-17",
      auth=object(),
      db=db,
    )
    databases.append(db)

    data = response["data"]
    assert data["reportCount"] == item_count
    assert len(data["reports"]) == item_count
    assert len(data["missions"]) == item_count
    assert sum(row["feedback_payload"] is not None for row in db.reports) == item_count
    assert all(
      set(row) == {
        "id",
        "score",
        "feedback_kind",
        "parent_feedback_report_id",
        "goal_context",
        "feedback_payload",
        "created_at",
        "completed_at",
      }
      for row in db.reports
    )
    assert all(
      set(report) == {
        "reportId",
        "score",
          "feedbackKind",
          "parentFeedbackReportId",
          "completedAt",
          "imageUrl",
          "goalContext",
          "feedbackDigest",
          "note",
      }
      for report in data["reports"]
    )
    assert set(data["feedbackDigest"]) == {
      "reportId",
      "headline",
      "strengthCount",
      "strengths",
      "improvementCount",
      "improvements",
      "nextAction",
    }
    assert data["feedbackDigest"]["strengthCount"] == 8
    assert len(data["feedbackDigest"]["strengths"]) == 8
    assert data["feedbackDigest"]["improvementCount"] == 7
    assert len(data["feedbackDigest"]["improvements"]) == 7
    assert len(data["feedbackDigest"]["headline"]) == 240
    assert len(data["feedbackDigest"]["nextAction"]) == 240

    serialized = json.dumps(response, ensure_ascii=False)
    assert "must-not-leak" not in serialized
    assert "private.example" not in serialized
    assert "feedbackPayload" not in serialized
    assert len(serialized) < 1_000_000

  assert [[method for method, _query in db.calls] for db in databases] == [
    ["fetchrow", "fetch", "fetch", "fetchrow"],
    ["fetchrow", "fetch", "fetch", "fetchrow"],
  ]
  report_query = databases[-1].calls[1][1]
  assert "row_number() over" in report_query
  assert "selected_report_id, feedback_payload" in report_query
  assert "left join makeup_journey_day_score_selections" in report_query
  assert "jsonb_strip_nulls(jsonb_build_object" in report_query
  assert "from makeup_feedback_reports" in report_query


@pytest.mark.asyncio
async def test_trend_query_count_is_constant_and_points_exclude_report_payload(
  monkeypatch,
) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  databases: list[QueryCountingDatabase] = []

  for point_count in (1, 90):
    db = QueryCountingDatabase(trend_rows=_trend_rows(point_count))
    response = await journey_api.get_makeup_journey_trends(
      range_value="90d",
      end_date="2026-07-17",
      auth=object(),
      db=db,
    )
    databases.append(db)

    points = response["data"]["points"]
    assert len(points) == point_count
    assert all(set(point) == {"date", "score", "status"} for point in points)
    serialized = json.dumps(response, ensure_ascii=False)
    assert "must-not-leak" not in serialized
    assert "private.example" not in serialized
    assert "feedbackPayload" not in serialized

  assert [[method for method, _query in db.calls] for db in databases] == [
    ["fetchrow", "fetch"],
    ["fetchrow", "fetch"],
  ]
  trend_query = databases[-1].calls[1][1]
  assert "row_number() over" in trend_query
  assert "left join makeup_journey_day_score_selections" in trend_query
  assert "coalesce(" in trend_query
