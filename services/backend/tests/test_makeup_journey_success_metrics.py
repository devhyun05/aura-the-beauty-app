import json
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from app.ops.makeup_journey_success_metrics import (
  ANALYTICS_MARKER,
  AnalyticsEvent,
  build_success_metrics,
  calculate_log_metrics,
  fetch_database_metrics,
  parse_analytics_log_lines,
)


def _event(actor_id: str, name: str, occurred_at: str) -> AnalyticsEvent:
  return AnalyticsEvent(
    actor_id=actor_id,
    event_name=name,
    occurred_at=datetime.fromisoformat(occurred_at),
  )


def test_parse_analytics_logs_accepts_raw_cloudwatch_and_structured_lines() -> None:
  payload = {
    "actorId": "actor-a",
    "eventName": "makeup_journey_opened",
    "occurredAt": "2026-07-13T01:00:00+00:00",
    "properties": {"month": "2026-07", "hasRecords": True},
  }
  raw = f"INFO journey {ANALYTICS_MARKER} {json.dumps(payload)}"
  cloudwatch = json.dumps({"@message": raw, "@timestamp": 123})
  structured = json.dumps({**payload, "actorId": "actor-b"})

  parsed = parse_analytics_log_lines(
    [raw, cloudwatch, structured, "not-json", '{"message":"unrelated"}'],
  )

  assert [event.actor_id for event in parsed] == ["actor-a", "actor-a", "actor-b"]
  assert all(event.occurred_at.tzinfo is not None for event in parsed)
  assert not hasattr(parsed[0], "properties")


def test_log_metrics_use_distinct_local_days_and_monday_user_weeks() -> None:
  events = [
    _event("a", "makeup_journey_opened", "2026-07-13T00:00:00+00:00"),
    _event("a", "makeup_journey_opened", "2026-07-13T01:00:00+00:00"),
    _event("a", "makeup_journey_opened", "2026-07-14T00:00:00+00:00"),
    _event("b", "makeup_journey_opened", "2026-07-13T02:00:00+00:00"),
    _event("a", "makeup_journey_opened", "2026-07-20T00:00:00+00:00"),
    _event("c", "makeup_journey_opened", "2026-07-20T00:00:00+00:00"),
    _event("c", "makeup_journey_opened", "2026-07-21T00:00:00+00:00"),
    _event("a", "makeup_journey_correction_started", "2026-07-13T00:00:00+00:00"),
    _event("b", "makeup_journey_correction_started", "2026-07-14T00:00:00+00:00"),
    _event("c", "makeup_journey_correction_started", "2026-07-15T00:00:00+00:00"),
    _event("a", "makeup_journey_correction_completed", "2026-07-13T00:10:00+00:00"),
    _event("c", "makeup_journey_correction_completed", "2026-07-15T00:10:00+00:00"),
    _event("outside", "makeup_journey_opened", "2026-07-27T00:00:00+00:00"),
  ]

  result = calculate_log_metrics(
    events,
    start_date=date(2026, 7, 13),
    end_date=date(2026, 7, 27),
    timezone=ZoneInfo("Asia/Seoul"),
  )

  assert result["calendarWeeklyRevisit"] == {
    "source": "analyticsLogs",
    "definition": (
      "actor-user-weeks opened on at least two distinct local dates / "
      "actor-user-weeks opened on at least one local date; only complete "
      "Monday-through-Sunday weeks wholly inside the window are included"
    ),
    "completeWeeksIncluded": ["2026-07-13", "2026-07-20"],
    "edgePartialWeeksExcluded": False,
    "excludedEdgeRanges": [],
    "openerUserWeeks": 4,
    "revisitorUserWeeks": 2,
    "rate": 0.5,
    "weeks": [
      {
        "weekStart": "2026-07-13",
        "openers": 2,
        "revisitors": 1,
        "rate": 0.5,
      },
      {
        "weekStart": "2026-07-20",
        "openers": 2,
        "revisitors": 1,
        "rate": 0.5,
      },
    ],
  }
  assert result["correctionFeedbackCompletion"] == {
    "source": "analyticsLogs",
    "definition": (
      "one-to-one actor-ordered completion events matched to correction starts "
      "inside the reporting local-date window / correction starts inside the "
      "same window; orphan completion events are ignored"
    ),
    "startedAttempts": 3,
    "completedAttempts": 2,
    "incompleteOrCancelledAttempts": 1,
    "rate": 0.6667,
  }


def test_correction_completion_pairs_actor_events_and_respects_local_window() -> None:
  result = calculate_log_metrics(
    [
      # Input order does not matter; event time controls pairing.
      _event("a", "makeup_journey_correction_completed", "2026-07-01T01:10:00+00:00"),
      _event("a", "makeup_journey_correction_started", "2026-07-01T01:00:00+00:00"),
      # A second completion cannot consume a nonexistent start.
      _event("a", "makeup_journey_correction_completed", "2026-07-01T01:20:00+00:00"),
      # Exact local-window start boundary is included.
      _event("b", "makeup_journey_correction_started", "2026-06-30T15:00:00+00:00"),
      # A start just before the local window is excluded, so this completion is orphaned.
      _event("outside", "makeup_journey_correction_started", "2026-06-30T14:59:59+00:00"),
      _event("outside", "makeup_journey_correction_completed", "2026-06-30T15:01:00+00:00"),
      # Completion at the exclusive local-window end remains incomplete in this cohort.
      _event("c", "makeup_journey_correction_started", "2026-07-31T14:59:59+00:00"),
      _event("c", "makeup_journey_correction_completed", "2026-07-31T15:00:00+00:00"),
      # At identical timestamps, a start is deterministically considered first.
      _event("d", "makeup_journey_correction_completed", "2026-07-15T01:00:00+00:00"),
      _event("d", "makeup_journey_correction_started", "2026-07-15T01:00:00+00:00"),
    ],
    start_date=date(2026, 7, 1),
    end_date=date(2026, 8, 1),
    timezone=ZoneInfo("Asia/Seoul"),
  )

  assert result["correctionFeedbackCompletion"] == {
    "source": "analyticsLogs",
    "definition": (
      "one-to-one actor-ordered completion events matched to correction starts "
      "inside the reporting local-date window / correction starts inside the "
      "same window; orphan completion events are ignored"
    ),
    "startedAttempts": 4,
    "completedAttempts": 2,
    "incompleteOrCancelledAttempts": 2,
    "rate": 0.5,
  }


def test_log_metric_excludes_partial_july_edges_and_keeps_zero_opener_full_week() -> None:
  # 2026-07-05 15:00 UTC is exactly Monday 00:00 in Seoul.
  result = calculate_log_metrics(
    [
      _event("edge", "makeup_journey_opened", "2026-07-05T14:59:00+00:00"),
      _event("a", "makeup_journey_opened", "2026-07-05T15:00:00+00:00"),
      _event("a", "makeup_journey_opened", "2026-07-06T15:00:00+00:00"),
      _event("b", "makeup_journey_opened", "2026-07-12T15:00:00+00:00"),
      _event("edge", "makeup_journey_opened", "2026-07-26T15:00:00+00:00"),
    ],
    start_date=date(2026, 7, 1),
    end_date=date(2026, 8, 1),
    timezone=ZoneInfo("Asia/Seoul"),
  )

  metric = result["calendarWeeklyRevisit"]
  assert metric["completeWeeksIncluded"] == [
    "2026-07-06",
    "2026-07-13",
    "2026-07-20",
  ]
  assert metric["edgePartialWeeksExcluded"] is True
  assert metric["excludedEdgeRanges"] == [
    {"startDate": "2026-07-01", "endDateExclusive": "2026-07-06"},
    {"startDate": "2026-07-27", "endDateExclusive": "2026-08-01"},
  ]
  assert metric["openerUserWeeks"] == 2
  assert metric["revisitorUserWeeks"] == 1
  assert metric["rate"] == 0.5
  assert metric["weeks"][2] == {
    "weekStart": "2026-07-20",
    "openers": 0,
    "revisitors": 0,
    "rate": None,
  }


class FakeDatabase:
  def __init__(self, row) -> None:
    self.row = row
    self.calls = []

  async def fetchrow(self, query, *args):
    self.calls.append((query, args))
    return self.row


@pytest.mark.asyncio
async def test_database_metrics_query_only_valid_records_and_current_mission_state() -> None:
  db = FakeDatabase(
    {
      "recording_users": 2,
      "total_record_days": 5,
      "completed_missions": 3,
      "total_missions": 4,
    },
  )

  result = await fetch_database_metrics(
    db,
    start_date=date(2026, 7, 1),
    end_date=date(2026, 8, 1),
  )

  query, args = db.calls[0]
  normalized = " ".join(query.lower().split())
  assert args == (
    date(2026, 7, 1),
    date(2026, 8, 1),
  )
  assert "count(distinct entry_date)" in normalized
  assert "status = 'completed'" in normalized
  assert "score is not null" in normalized
  assert "count(*) filter (where is_completed)" in normalized
  assert "feedback_kind = 'correction'" not in normalized
  assert result == {
    "recordDaysPerUser": {
      "source": "postgresql",
      "definition": (
        "distinct valid entry dates / users with at least one valid entry date"
      ),
      "recordingUsers": 2,
      "totalRecordDays": 5,
      "average": 2.5,
    },
    "missionCompletion": {
      "source": "postgresql",
      "definition": (
        "currently completed missions / all missions whose entry date is in the window"
      ),
      "completedMissions": 3,
      "totalMissions": 4,
      "rate": 0.75,
    },
  }


@pytest.mark.asyncio
async def test_combined_report_has_one_window_and_all_four_initial_metrics() -> None:
  db = FakeDatabase(
    {
      "recording_users": 0,
      "total_record_days": 0,
      "completed_missions": 0,
      "total_missions": 0,
    },
  )
  line = json.dumps(
    {
      "actorId": "actor-a",
      "eventName": "makeup_journey_opened",
      "occurredAt": "2026-07-15T00:00:00+00:00",
    },
  )

  result = await build_success_metrics(
    db,
    log_lines=[line],
    start_date=date(2026, 7, 1),
    end_date=date(2026, 8, 1),
    timezone=ZoneInfo("Asia/Seoul"),
  )

  assert result["window"] == {
    "startDate": "2026-07-01",
    "endDateExclusive": "2026-08-01",
    "timezone": "Asia/Seoul",
  }
  assert {
    "calendarWeeklyRevisit",
    "recordDaysPerUser",
    "correctionFeedbackCompletion",
    "missionCompletion",
  } <= result.keys()
  assert result["recordDaysPerUser"]["average"] is None
  assert result["missionCompletion"]["rate"] is None
  assert result["correctionFeedbackCompletion"]["rate"] is None


def test_log_metrics_reject_invalid_window() -> None:
  with pytest.raises(ValueError, match="end_date"):
    calculate_log_metrics(
      [],
      start_date=date(2026, 7, 1),
      end_date=date(2026, 7, 1),
      timezone=timezone.utc,
    )
