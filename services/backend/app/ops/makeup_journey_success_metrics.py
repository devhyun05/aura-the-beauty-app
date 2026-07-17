"""Read-only MakeupJourney launch metrics from existing logs and PostgreSQL.

Run from ``services/backend`` after exporting the application log stream as
newline-delimited text (raw lines or CloudWatch JSONL)::

  python -m app.ops.makeup_journey_success_metrics \
    --start-date 2026-07-01 --end-date 2026-08-01 \
    --analytics-log /tmp/makeup-journey.log

The end date is exclusive. Weeks are Monday-based in the selected reporting
timezone. No actor identifier is emitted; only aggregate counts are printed.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.db.connection_config import connect_database


ANALYTICS_MARKER = "[aura:makeup-journey-analytics]"
CALENDAR_OPENED_EVENT = "makeup_journey_opened"
CORRECTION_STARTED_EVENT = "makeup_journey_correction_started"
CORRECTION_COMPLETED_EVENT = "makeup_journey_correction_completed"

DATABASE_METRICS_QUERY = """
with record_days_by_user as (
  select user_id, count(distinct entry_date)::int as record_days
  from makeup_feedback_reports
  where entry_date >= $1
    and entry_date < $2
    and status = 'completed'
    and score is not null
  group by user_id
), mission_totals as (
  select
    count(*) filter (where is_completed)::int as completed_missions,
    count(*)::int as total_missions
  from makeup_journey_missions
  where entry_date >= $1
    and entry_date < $2
)
select
  coalesce((select count(*) from record_days_by_user), 0)::int as recording_users,
  coalesce((select sum(record_days) from record_days_by_user), 0)::int
    as total_record_days,
  coalesce((select completed_missions from mission_totals), 0)::int
    as completed_missions,
  coalesce((select total_missions from mission_totals), 0)::int as total_missions
"""


@dataclass(frozen=True)
class AnalyticsEvent:
  actor_id: str
  event_name: str
  occurred_at: datetime


def _rate(numerator: int, denominator: int) -> float | None:
  if denominator == 0:
    return None
  return round(numerator / denominator, 4)


def _parse_timestamp(value: object) -> datetime | None:
  if not isinstance(value, str):
    return None
  try:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
  except ValueError:
    return None
  return parsed if parsed.tzinfo is not None else None


def _message_from_log_line(line: str) -> str | None:
  stripped = line.strip()
  if not stripped:
    return None
  try:
    envelope = json.loads(stripped)
  except json.JSONDecodeError:
    return stripped
  if not isinstance(envelope, dict):
    return None
  for key in ("message", "@message"):
    value = envelope.get(key)
    if isinstance(value, str):
      return value
  if {"actorId", "eventName", "occurredAt"} <= envelope.keys():
    return json.dumps(envelope, separators=(",", ":"))
  return None


def parse_analytics_log_lines(lines: Iterable[str]) -> list[AnalyticsEvent]:
  """Extract only the three aggregate fields needed from accepted event logs."""
  events: list[AnalyticsEvent] = []
  for line in lines:
    message = _message_from_log_line(line)
    if message is None:
      continue
    payload_text = (
      message.split(ANALYTICS_MARKER, 1)[1].strip()
      if ANALYTICS_MARKER in message
      else message
    )
    try:
      payload = json.loads(payload_text)
    except json.JSONDecodeError:
      continue
    if not isinstance(payload, dict):
      continue
    actor_id = payload.get("actorId")
    event_name = payload.get("eventName")
    occurred_at = _parse_timestamp(payload.get("occurredAt"))
    if (
      not isinstance(actor_id, str)
      or not actor_id
      or not isinstance(event_name, str)
      or occurred_at is None
    ):
      continue
    events.append(
      AnalyticsEvent(
        actor_id=actor_id,
        event_name=event_name,
        occurred_at=occurred_at,
      ),
    )
  return events


def _complete_week_window(
  start_date: date,
  end_date: date,
) -> tuple[list[date], list[tuple[date, date]]]:
  days_until_monday = (-start_date.weekday()) % 7
  first_monday = start_date + timedelta(days=days_until_monday)
  complete_weeks: list[date] = []
  excluded_ranges: list[tuple[date, date]] = []

  leading_end = min(first_monday, end_date)
  if start_date < leading_end:
    excluded_ranges.append((start_date, leading_end))

  cursor = first_monday
  while cursor + timedelta(days=7) <= end_date:
    complete_weeks.append(cursor)
    cursor += timedelta(days=7)

  if cursor < end_date:
    excluded_ranges.append((cursor, end_date))

  return complete_weeks, excluded_ranges


def calculate_log_metrics(
  events: Iterable[AnalyticsEvent],
  *,
  start_date: date,
  end_date: date,
  timezone: ZoneInfo,
) -> dict[str, Any]:
  if end_date <= start_date:
    raise ValueError("end_date must be later than start_date")

  complete_weeks, excluded_ranges = _complete_week_window(start_date, end_date)
  complete_week_set = set(complete_weeks)
  open_days: dict[tuple[date, str], set[date]] = defaultdict(set)
  correction_events: list[AnalyticsEvent] = []

  for event in events:
    local_date = event.occurred_at.astimezone(timezone).date()
    if event.event_name in {CORRECTION_STARTED_EVENT, CORRECTION_COMPLETED_EVENT}:
      if start_date <= local_date < end_date:
        correction_events.append(event)
    if event.event_name != CALENDAR_OPENED_EVENT:
      continue
    week_start = date.fromordinal(local_date.toordinal() - local_date.weekday())
    if week_start not in complete_week_set:
      continue
    open_days[(week_start, event.actor_id)].add(local_date)

  week_totals = {week_start: [0, 0] for week_start in complete_weeks}
  for (week_start, _actor_id), distinct_days in open_days.items():
    week_totals[week_start][0] += 1
    if len(distinct_days) >= 2:
      week_totals[week_start][1] += 1

  weeks = [
    {
      "weekStart": week_start.isoformat(),
      "openers": counts[0],
      "revisitors": counts[1],
      "rate": _rate(counts[1], counts[0]),
    }
    for week_start, counts in sorted(week_totals.items())
  ]
  opener_user_weeks = sum(item[0] for item in week_totals.values())
  revisitor_user_weeks = sum(item[1] for item in week_totals.values())

  pending_starts: dict[str, int] = defaultdict(int)
  started_attempts = 0
  completed_attempts = 0
  for event in sorted(
    correction_events,
    key=lambda item: (
      item.occurred_at,
      0 if item.event_name == CORRECTION_STARTED_EVENT else 1,
    ),
  ):
    if event.event_name == CORRECTION_STARTED_EVENT:
      pending_starts[event.actor_id] += 1
      started_attempts += 1
    elif pending_starts[event.actor_id] > 0:
      pending_starts[event.actor_id] -= 1
      completed_attempts += 1

  return {
    "calendarWeeklyRevisit": {
      "source": "analyticsLogs",
      "definition": (
        "actor-user-weeks opened on at least two distinct local dates / "
        "actor-user-weeks opened on at least one local date; only complete "
        "Monday-through-Sunday weeks wholly inside the window are included"
      ),
      "completeWeeksIncluded": [value.isoformat() for value in complete_weeks],
      "edgePartialWeeksExcluded": bool(excluded_ranges),
      "excludedEdgeRanges": [
        {
          "startDate": range_start.isoformat(),
          "endDateExclusive": range_end.isoformat(),
        }
        for range_start, range_end in excluded_ranges
      ],
      "openerUserWeeks": opener_user_weeks,
      "revisitorUserWeeks": revisitor_user_weeks,
      "rate": _rate(revisitor_user_weeks, opener_user_weeks),
      "weeks": weeks,
    },
    "correctionFeedbackCompletion": {
      "source": "analyticsLogs",
      "definition": (
        "one-to-one actor-ordered completion events matched to correction starts "
        "inside the reporting local-date window / correction starts inside the "
        "same window; orphan completion events are ignored"
      ),
      "startedAttempts": started_attempts,
      "completedAttempts": completed_attempts,
      "incompleteOrCancelledAttempts": started_attempts - completed_attempts,
      "rate": _rate(completed_attempts, started_attempts),
    },
  }


async def fetch_database_metrics(
  db: Any,
  *,
  start_date: date,
  end_date: date,
) -> dict[str, Any]:
  if end_date <= start_date:
    raise ValueError("end_date must be later than start_date")
  row = await db.fetchrow(
    DATABASE_METRICS_QUERY,
    start_date,
    end_date,
  )
  if row is None:
    raise RuntimeError("MakeupJourney success metric query returned no row")

  recording_users = int(row["recording_users"])
  total_record_days = int(row["total_record_days"])
  completed_missions = int(row["completed_missions"])
  total_missions = int(row["total_missions"])
  return {
    "recordDaysPerUser": {
      "source": "postgresql",
      "definition": (
        "distinct valid entry dates / users with at least one valid entry date"
      ),
      "recordingUsers": recording_users,
      "totalRecordDays": total_record_days,
      "average": _rate(total_record_days, recording_users),
    },
    "missionCompletion": {
      "source": "postgresql",
      "definition": (
        "currently completed missions / all missions whose entry date is in the window"
      ),
      "completedMissions": completed_missions,
      "totalMissions": total_missions,
      "rate": _rate(completed_missions, total_missions),
    },
  }


async def build_success_metrics(
  db: Any,
  *,
  log_lines: Iterable[str],
  start_date: date,
  end_date: date,
  timezone: ZoneInfo,
) -> dict[str, Any]:
  log_metrics = calculate_log_metrics(
    parse_analytics_log_lines(log_lines),
    start_date=start_date,
    end_date=end_date,
    timezone=timezone,
  )
  database_metrics = await fetch_database_metrics(
    db,
    start_date=start_date,
    end_date=end_date,
  )
  return {
    "window": {
      "startDate": start_date.isoformat(),
      "endDateExclusive": end_date.isoformat(),
      "timezone": timezone.key,
    },
    **log_metrics,
    **database_metrics,
  }


def _date_argument(value: str) -> date:
  try:
    return date.fromisoformat(value)
  except ValueError as exc:
    raise argparse.ArgumentTypeError("date must use valid YYYY-MM-DD format") from exc


def _timezone_argument(value: str) -> ZoneInfo:
  try:
    return ZoneInfo(value)
  except ZoneInfoNotFoundError as exc:
    raise argparse.ArgumentTypeError("timezone must be a valid IANA name") from exc


async def run(args: argparse.Namespace) -> int:
  db, _ = await connect_database()
  try:
    with args.analytics_log.open("r", encoding="utf-8") as log_file:
      result = await build_success_metrics(
        db,
        log_lines=log_file,
        start_date=args.start_date,
        end_date=args.end_date,
        timezone=args.timezone,
      )
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0
  finally:
    await db.close()


def main() -> None:
  parser = argparse.ArgumentParser(
    description="Aggregate the four initial MakeupJourney success metrics.",
  )
  parser.add_argument("--start-date", type=_date_argument, required=True)
  parser.add_argument(
    "--end-date",
    type=_date_argument,
    required=True,
    help="Exclusive reporting end date.",
  )
  parser.add_argument(
    "--timezone",
    type=_timezone_argument,
    default=ZoneInfo("Asia/Seoul"),
  )
  parser.add_argument(
    "--analytics-log",
    type=Path,
    required=True,
    help="Raw application log or CloudWatch JSONL export.",
  )
  args = parser.parse_args()
  if args.end_date <= args.start_date:
    parser.error("--end-date must be later than --start-date")
  raise SystemExit(asyncio.run(run(args)))


if __name__ == "__main__":
  main()
