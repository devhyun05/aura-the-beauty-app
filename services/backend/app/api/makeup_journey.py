from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, Query, Response

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, require_database
from app.schemas.makeup_journey import (
  MakeupJourneyAnalyticsEvent,
  MakeupJourneyAnalyticsResponse,
  MakeupJourneyCalendarResponse,
  MakeupJourneyDayResponse,
  MakeupJourneyDeleteMissionResponse,
  MakeupJourneyMissionCreate,
  MakeupJourneyMissionGenerate,
  MakeupJourneyMissionResponse,
  MakeupJourneyMissionsResponse,
  MakeupJourneyMissionUpdate,
  MakeupJourneyNoteUpdate,
  MakeupJourneyNoteResponse,
  MakeupJourneyScoreSelectionResponse,
  MakeupJourneyScoreSelectionUpdate,
  MakeupJourneySettingsResponse,
  MakeupJourneySettingsUpdate,
  MakeupJourneyTrendResponse,
)
from app.services.makeup_journey_missions import (
  curated_daily_missions,
)
from app.services.makeup_feedback_goal_intent import extract_feedback_goal_context
from app.services.s3 import S3Service
from app.services.users import ensure_user


logger = logging.getLogger(__name__)
MONTH_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
DATE_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$")
RANGE_DAYS = {"7d": 7, "30d": 30, "90d": 90}
MAKEUP_JOURNEY_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024
MAKEUP_JOURNEY_THUMBNAIL_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


def require_makeup_journey_enabled(
  settings: Settings = Depends(get_settings),
) -> None:
  if not settings.makeup_journey_enabled:
    raise AppError(
      404,
      "MAKEUP_JOURNEY_DISABLED",
      "Makeup journey is not available.",
    )


router = APIRouter(
  prefix="/makeup-journey",
  tags=["makeup-journey"],
  dependencies=[Depends(require_makeup_journey_enabled)],
)


@router.post("/analytics/events", response_model=MakeupJourneyAnalyticsResponse)
async def record_makeup_journey_analytics_event(
  payload: MakeupJourneyAnalyticsEvent,
  auth: AuthContext = Depends(get_current_user),
) -> dict:
  actor_id = hashlib.sha256(
    f"aura:makeup-journey:{auth.subject}".encode("utf-8")
  ).hexdigest()[:24]
  event = {
    "actorId": actor_id,
    "eventName": payload.name,
    "occurredAt": datetime.now(ZoneInfo("UTC")).isoformat(timespec="seconds"),
    "properties": payload.properties.model_dump(by_alias=True),
  }
  logger.info(
    "[aura:makeup-journey-analytics] %s",
    json.dumps(event, ensure_ascii=False, separators=(",", ":")),
  )
  return success({"accepted": True, "event_name": payload.name})


def _decode_object(value: object) -> dict[str, Any]:
  decoded: object = value
  # asyncpg returns jsonb as text. A legacy jsonb root string therefore needs
  # one additional, bounded unwrap after the normal jsonb decode.
  for _ in range(2):
    if isinstance(decoded, dict):
      return decoded
    if not isinstance(decoded, str) or not decoded.strip():
      return {}
    try:
      decoded = json.loads(decoded)
    except json.JSONDecodeError:
      return {}
  return decoded if isinstance(decoded, dict) else {}


def _clean_text(value: object, *, max_length: int = 240) -> str | None:
  if not isinstance(value, str):
    return None
  normalized = " ".join(value.split())
  return normalized[:max_length] or None


def _parse_date(value: str) -> date:
  if not DATE_PATTERN.fullmatch(value):
    raise AppError(422, "MAKEUP_JOURNEY_DATE_INVALID", "Date must use YYYY-MM-DD format.")
  try:
    return date.fromisoformat(value)
  except ValueError as exc:
    raise AppError(422, "MAKEUP_JOURNEY_DATE_INVALID", "Date is not valid.") from exc


def _month_bounds(value: str) -> tuple[date, date]:
  if not MONTH_PATTERN.fullmatch(value):
    raise AppError(422, "MAKEUP_JOURNEY_MONTH_INVALID", "month must use YYYY-MM format.")
  try:
    start = date.fromisoformat(f"{value}-01")
    end = date(
      start.year + (start.month == 12),
      1 if start.month == 12 else start.month + 1,
      1,
    )
  except ValueError as exc:
    raise AppError(
      422,
      "MAKEUP_JOURNEY_MONTH_INVALID",
      "month must be a valid queryable calendar month.",
    ) from exc
  return start, end


def _today(timezone_name: str | None) -> date:
  try:
    timezone = ZoneInfo(timezone_name or "Asia/Seoul")
  except Exception:  # Defensive fallback for legacy invalid rows.
    timezone = ZoneInfo("Asia/Seoul")
  return datetime.now(timezone).date()


def _iso(value: object) -> str | None:
  if isinstance(value, (date, datetime)):
    return value.isoformat()
  return str(value) if value is not None else None


def _rounded_average(values: list[int]) -> int | None:
  if not values:
    return None
  average = Decimal(sum(values)) / Decimal(len(values))
  return int(average.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _settings_data(row: dict[str, Any] | None) -> dict[str, Any] | None:
  if row is None:
    return None
  return {
    "goal_score": row["goal_score"],
    "mission_level": row["mission_level"],
    "timezone_name": row["timezone_name"],
    "created_at": row.get("created_at"),
    "updated_at": row.get("updated_at"),
  }


def _mission_data(row: dict[str, Any]) -> dict[str, Any]:
  return {
    "id": row["id"],
    "source": row["source"],
    "difficulty": row["difficulty"],
    "title": row["title"],
    "is_completed": bool(row["is_completed"]),
    "completed_at": row.get("completed_at"),
    "sort_order": row.get("sort_order", 0),
    "created_at": row.get("created_at"),
    "updated_at": row.get("updated_at"),
  }


def _note_data(row: dict[str, Any] | None) -> dict[str, Any] | None:
  if row is None:
    return None
  return {
    "content": row["content"],
    "created_at": row.get("created_at"),
    "updated_at": row.get("updated_at"),
  }


def _result_from_report(row: dict[str, Any]) -> dict[str, Any]:
  payload = _decode_object(row.get("feedback_payload"))
  return _decode_object(payload.get("result"))


def _goal_context_from_report(row: dict[str, Any]) -> dict[str, Any]:
  if "goal_context" in row:
    projected_context = extract_feedback_goal_context(
      _decode_object(row.get("goal_context")),
    )
    if projected_context:
      return projected_context
  payload = _decode_object(row.get("feedback_payload"))
  request_payload = _decode_object(payload.get("request"))
  return extract_feedback_goal_context(request_payload)


def build_feedback_digest(row: dict[str, Any] | None) -> dict[str, Any] | None:
  if row is None:
    return None
  result = _result_from_report(row)
  summary = _decode_object(result.get("summary"))
  headline = _clean_text(summary.get("strengthSummary")) or _clean_text(result.get("scoreReason"))

  def titles(raw_items: object) -> tuple[list[str], int]:
    if not isinstance(raw_items, list):
      return [], 0
    cleaned = [
      title
      for item in raw_items
      if isinstance(item, dict)
      if (title := _clean_text(item.get("title"), max_length=120)) is not None
    ]
    return cleaned, len(cleaned)

  strengths, strength_count = titles(result.get("strengths"))
  improvements, improvement_count = titles(result.get("points"))
  next_action = None
  points = result.get("points")
  if isinstance(points, list) and points and isinstance(points[0], dict):
    action_steps = points[0].get("actionSteps") or points[0].get("action_steps")
    if isinstance(action_steps, list) and action_steps:
      next_action = _clean_text(action_steps[0])
    if next_action is None:
      next_action = _clean_text(points[0].get("description"))

  return {
    "report_id": row["id"],
    "headline": headline,
    "strength_count": strength_count,
    "strengths": strengths,
    "improvement_count": improvement_count,
    "improvements": improvements,
    "next_action": next_action,
  }


def _report_data(row: dict[str, Any]) -> dict[str, Any]:
  note = None
  if row.get("note_content") is not None:
    note = _note_data(
      {
        "content": row["note_content"],
        "created_at": row.get("note_created_at"),
        "updated_at": row.get("note_updated_at"),
      },
    )
  return {
    "report_id": row["id"],
    "score": row["score"],
    "feedback_kind": row.get("feedback_kind") or "initial",
    "parent_feedback_report_id": row.get("parent_feedback_report_id"),
    "completed_at": row.get("completed_at") or row.get("created_at"),
    "image_url": row.get("image_url"),
    "goal_context": _goal_context_from_report(row),
    "feedback_digest": build_feedback_digest(row),
    "note": note,
  }


async def _get_settings(db: Database, user_id: UUID) -> dict[str, Any] | None:
  return await db.fetchrow(
    """
    select goal_score, mission_level, timezone_name, created_at, updated_at
    from makeup_journey_settings
    where user_id = $1
    """,
    user_id,
  )


def _require_settings(row: dict[str, Any] | None) -> dict[str, Any]:
  if row is None:
    raise AppError(
      409,
      "MAKEUP_JOURNEY_SETTINGS_REQUIRED",
      "Makeup journey settings must be saved first.",
    )
  return row


def _ensure_writable_date(entry_date: date, settings_row: dict[str, Any]) -> None:
  if entry_date > _today(settings_row.get("timezone_name")):
    raise AppError(
      422,
      "MAKEUP_JOURNEY_FUTURE_DATE_READ_ONLY",
      "Future journey dates are read-only.",
    )


@router.get("/settings", response_model=MakeupJourneySettingsResponse)
async def get_makeup_journey_settings(
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  row = await _get_settings(db, user["id"])
  return success({"settings": _settings_data(row), "requires_onboarding": row is None})


@router.put("/settings", response_model=MakeupJourneySettingsResponse)
async def update_makeup_journey_settings(
  payload: MakeupJourneySettingsUpdate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  row = await db.fetchrow(
    """
    insert into makeup_journey_settings (user_id, goal_score, mission_level, timezone_name)
    values ($1, $2, $3, $4)
    on conflict (user_id) do update set
      goal_score = excluded.goal_score,
      mission_level = excluded.mission_level,
      timezone_name = excluded.timezone_name,
      updated_at = now()
    returning goal_score, mission_level, timezone_name, created_at, updated_at
    """,
    user["id"],
    payload.goal_score,
    payload.mission_level,
    payload.timezone_name,
  )
  return success({"settings": _settings_data(row), "requires_onboarding": False})


@router.get("/calendar", response_model=MakeupJourneyCalendarResponse)
async def get_makeup_journey_calendar(
  month: str,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  month_start, month_end = _month_bounds(month)
  user = await ensure_user(db, auth)
  settings_row = await _get_settings(db, user["id"])
  if settings_row is None:
    return success(
      {
        "month": month,
        "goal_score": None,
        "summary": {"average_score": None, "recorded_days": 0, "current_streak": 0},
        "days": [],
      },
    )

  rows = await db.fetch(
    """
    with eligible_reports as (
      select reports.entry_date, reports.id, reports.score,
        reports.created_at, reports.completed_at,
        (
          media.thumbnail_bucket is not null
          and media.thumbnail_object_key is not null
        ) as has_thumbnail,
        selections.report_id as selected_report_id,
        row_number() over (
          partition by reports.entry_date
          order by coalesce(reports.completed_at, reports.created_at), reports.id
        ) as first_rank,
        row_number() over (
          partition by reports.entry_date
          order by coalesce(reports.completed_at, reports.created_at) desc, reports.id desc
        ) as latest_rank
      from makeup_feedback_reports reports
      left join media_assets media
        on media.id = reports.uploaded_media_id
        and media.owner_user_id = reports.user_id
        and media.status = 'active'
        and media.deleted_at is null
      left join makeup_journey_day_score_selections selections
        on selections.user_id = reports.user_id
        and selections.entry_date = reports.entry_date
      where reports.user_id = $1
        and reports.entry_date >= $2 and reports.entry_date < $3
        and reports.status = 'completed' and reports.score is not null
    ), report_days as (
      select entry_date,
        max(score) filter (where first_rank = 1) as first_score,
        max(score) filter (where latest_rank = 1) as latest_score,
        max(score) filter (where id = selected_report_id) as selected_score,
        count(*)::int as report_count
      from eligible_reports
      group by entry_date
    ), representative_reports as (
      select distinct on (entry_date)
        entry_date,
        id as representative_report_id,
        has_thumbnail as representative_thumbnail_available
      from eligible_reports
      order by entry_date,
        coalesce(id = selected_report_id, false) desc,
        coalesce(completed_at, created_at) desc,
        id desc
    ), note_days as (
      select entry_date, bool_or(true) as has_note
      from makeup_journey_day_notes
      where user_id = $1 and entry_date >= $2 and entry_date < $3
      group by entry_date
    ), mission_days as (
      select entry_date,
        count(*) filter (where is_completed)::int as completed_missions,
        count(*)::int as total_missions
      from makeup_journey_missions
      where user_id = $1 and entry_date >= $2 and entry_date < $3
      group by entry_date
    ), date_keys as (
      select entry_date from report_days
      union select entry_date from note_days
      union select entry_date from mission_days
    )
    select keys.entry_date, reports.first_score, reports.latest_score,
      reports.selected_score,
      representatives.representative_report_id,
      representatives.representative_thumbnail_available,
      coalesce(reports.report_count, 0)::int as report_count,
      coalesce(notes.has_note, false) as has_note,
      coalesce(missions.completed_missions, 0)::int as completed_missions,
      coalesce(missions.total_missions, 0)::int as total_missions
    from date_keys keys
    left join report_days reports using (entry_date)
    left join representative_reports representatives using (entry_date)
    left join note_days notes using (entry_date)
    left join mission_days missions using (entry_date)
    order by keys.entry_date
    """,
    user["id"],
    month_start,
    month_end,
  )

  today = _today(settings_row.get("timezone_name"))
  streak_row = await db.fetchrow(
    """
    with recorded as (
      select distinct entry_date
      from makeup_feedback_reports
      where user_id = $1 and status = 'completed' and score is not null and entry_date <= $2
    ), numbered as (
      select entry_date,
        entry_date - (row_number() over (order by entry_date))::int as island_key
      from recorded
    ), anchor as (
      select case
        when exists (select 1 from recorded where entry_date = $2) then $2::date
        else ($2::date - 1)
      end as entry_date
    )
    select count(*)::int as current_streak
    from numbered
    where island_key = (
      select island_key from numbered where entry_date = (select entry_date from anchor)
    )
    """,
    user["id"],
    today,
  )

  goal_score = int(settings_row["goal_score"])
  days: list[dict[str, Any]] = []
  representative_scores: list[int] = []
  for row in rows:
    latest_score = row.get("latest_score")
    first_score = row.get("first_score")
    selected_score = row.get("selected_score")
    if latest_score is not None:
      latest_score = int(latest_score)
      first_score = int(first_score)
    representative_score = (
      int(selected_score) if selected_score is not None else latest_score
    )
    representative_report_id = row.get("representative_report_id")
    representative_thumbnail_url = (
      f"/makeup-journey/reports/{representative_report_id}/thumbnail"
      if representative_report_id is not None
      and bool(row.get("representative_thumbnail_available"))
      else None
    )
    if representative_score is not None:
      representative_scores.append(representative_score)
    days.append(
      {
        "date": _iso(row["entry_date"]),
        "status": (
          "empty"
          if representative_score is None
          else "success" if representative_score >= goal_score else "failure"
        ),
        "first_score": first_score,
        "latest_score": latest_score,
        "representative_report_id": representative_report_id,
        "representative_score": representative_score,
        "representative_thumbnail_url": representative_thumbnail_url,
        "score_delta": (
          representative_score - first_score
          if representative_score is not None and first_score is not None
          else None
        ),
        "report_count": int(row["report_count"]),
        "has_note": bool(row["has_note"]),
        "mission_summary": {
          "completed": int(row["completed_missions"]),
          "total": int(row["total_missions"]),
        },
      },
    )

  return success(
    {
      "month": month,
      "goal_score": goal_score,
      "summary": {
        "average_score": _rounded_average(representative_scores),
        "recorded_days": len(representative_scores),
        "current_streak": int((streak_row or {}).get("current_streak") or 0),
      },
      "days": days,
    },
  )


@router.get("/reports/{report_id}/thumbnail")
async def get_makeup_journey_report_thumbnail(
  report_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> Response:
  user = await ensure_user(db, auth)
  media = await db.fetchrow(
    """
    select media.thumbnail_bucket, media.thumbnail_object_key
    from makeup_feedback_reports reports
    join media_assets media
      on media.id = reports.uploaded_media_id
      and media.owner_user_id = reports.user_id
      and media.status = 'active'
      and media.deleted_at is null
    where reports.id = $1
      and reports.user_id = $2
      and reports.status = 'completed'
      and reports.score is not null
      and media.thumbnail_bucket is not null
      and media.thumbnail_object_key is not null
    limit 1
    """,
    report_id,
    user["id"],
  )
  if media is None:
    raise AppError(
      404,
      "MAKEUP_JOURNEY_THUMBNAIL_NOT_FOUND",
      "Feedback thumbnail was not found.",
    )

  bucket = str(media["thumbnail_bucket"])
  object_key = str(media["thumbnail_object_key"])
  s3 = S3Service(settings)
  try:
    s3.assert_managed_media_location(bucket=bucket, object_key=object_key)
    content, content_type = await asyncio.to_thread(
      s3.get_object_bytes,
      bucket=bucket,
      object_key=object_key,
      max_bytes=MAKEUP_JOURNEY_THUMBNAIL_MAX_BYTES,
    )
  except AppError:
    raise
  except ClientError as exc:
    error_code = str(exc.response.get("Error", {}).get("Code") or "")
    if error_code in {"404", "NoSuchKey", "NotFound"}:
      raise AppError(
        404,
        "MAKEUP_JOURNEY_THUMBNAIL_NOT_FOUND",
        "Feedback thumbnail was not found.",
      ) from exc
    raise AppError(
      503,
      "MAKEUP_JOURNEY_THUMBNAIL_UNAVAILABLE",
      "Feedback thumbnail is temporarily unavailable.",
    ) from exc
  except Exception as exc:
    raise AppError(
      503,
      "MAKEUP_JOURNEY_THUMBNAIL_UNAVAILABLE",
      "Feedback thumbnail is temporarily unavailable.",
    ) from exc

  resolved_content_type = content_type.split(";", 1)[0].strip().lower()
  if resolved_content_type not in MAKEUP_JOURNEY_THUMBNAIL_CONTENT_TYPES:
    raise AppError(
      415,
      "MAKEUP_JOURNEY_THUMBNAIL_TYPE_INVALID",
      "Feedback thumbnail has an unsupported media type.",
    )
  return Response(
    content=content,
    media_type=resolved_content_type,
    headers={
      "Cache-Control": "private, no-store",
      "Pragma": "no-cache",
      "Vary": "Authorization",
      "X-Content-Type-Options": "nosniff",
    },
  )


@router.get("/days/{entry_date}", response_model=MakeupJourneyDayResponse)
async def get_makeup_journey_day(
  entry_date: str,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  resolved_date = _parse_date(entry_date)
  user = await ensure_user(db, auth)
  settings_row = await _get_settings(db, user["id"])
  reports = await db.fetch(
    """
    with ranked_reports as (
      select reports.id, reports.score, reports.feedback_kind,
        reports.parent_feedback_report_id, reports.feedback_payload,
        reports.created_at, reports.completed_at,
        notes.content as note_content,
        notes.created_at as note_created_at,
        notes.updated_at as note_updated_at,
        coalesce(
          nullif(media.thumbnail_cdn_url, ''),
          nullif(media.cdn_url, '')
        ) as media_image_url,
        selections.report_id as selected_report_id,
        row_number() over (
          order by coalesce(reports.completed_at, reports.created_at) desc, reports.id desc
        ) as latest_rank
      from makeup_feedback_reports reports
      left join media_assets media
        on media.id = reports.uploaded_media_id
        and media.owner_user_id = reports.user_id
        and media.deleted_at is null
      left join makeup_journey_day_score_selections selections
        on selections.user_id = reports.user_id
        and selections.entry_date = reports.entry_date
      left join makeup_journey_day_notes notes
        on notes.user_id = reports.user_id
        and notes.entry_date = reports.entry_date
        and notes.report_id = reports.id
      where reports.user_id = $1 and reports.entry_date = $2
        and reports.status = 'completed' and reports.score is not null
    ), request_payloads as (
      select *,
        case
          when jsonb_typeof(feedback_payload) = 'object'
            and jsonb_typeof(feedback_payload -> 'request') = 'object'
          then feedback_payload -> 'request'
          else '{}'::jsonb
        end as request_payload
      from ranked_reports
    ), projected_reports as (
      select *,
        case
          when jsonb_typeof(request_payload -> 'feedbackContext') = 'object'
          then request_payload -> 'feedbackContext'
          when jsonb_typeof(request_payload -> 'feedback_context') = 'object'
          then request_payload -> 'feedback_context'
          else '{}'::jsonb
        end as raw_goal_context
      from request_payloads
    )
    select id, score, feedback_kind, parent_feedback_report_id,
      coalesce(
        media_image_url,
        nullif(request_payload ->> 'cdnUrl', ''),
        nullif(request_payload ->> 'sourceUrl', '')
      ) as image_url,
      jsonb_strip_nulls(jsonb_build_object(
        'userGoalText', coalesce(
          nullif(raw_goal_context -> 'userGoalText', 'null'::jsonb),
          nullif(raw_goal_context -> 'user_goal_text', 'null'::jsonb),
          nullif(request_payload -> 'userGoalText', 'null'::jsonb),
          nullif(request_payload -> 'user_goal_text', 'null'::jsonb)
        ),
        'originalGoalText', coalesce(
          nullif(raw_goal_context -> 'originalGoalText', 'null'::jsonb),
          nullif(raw_goal_context -> 'original_goal_text', 'null'::jsonb),
          nullif(request_payload -> 'originalGoalText', 'null'::jsonb),
          nullif(request_payload -> 'original_goal_text', 'null'::jsonb)
        ),
        'normalizedGoalText', coalesce(
          nullif(raw_goal_context -> 'normalizedGoalText', 'null'::jsonb),
          nullif(raw_goal_context -> 'normalized_goal_text', 'null'::jsonb),
          nullif(request_payload -> 'normalizedGoalText', 'null'::jsonb),
          nullif(request_payload -> 'normalized_goal_text', 'null'::jsonb)
        ),
        'analysisGoalText', coalesce(
          nullif(raw_goal_context -> 'analysisGoalText', 'null'::jsonb),
          nullif(raw_goal_context -> 'analysis_goal_text', 'null'::jsonb),
          nullif(request_payload -> 'analysisGoalText', 'null'::jsonb),
          nullif(request_payload -> 'analysis_goal_text', 'null'::jsonb)
        ),
        'goalIntentType', coalesce(
          nullif(raw_goal_context -> 'goalIntentType', 'null'::jsonb),
          nullif(raw_goal_context -> 'goal_intent_type', 'null'::jsonb),
          nullif(request_payload -> 'goalIntentType', 'null'::jsonb),
          nullif(request_payload -> 'goal_intent_type', 'null'::jsonb)
        ),
        'profileGender', coalesce(
          nullif(raw_goal_context -> 'profileGender', 'null'::jsonb),
          nullif(raw_goal_context -> 'profile_gender', 'null'::jsonb),
          nullif(request_payload -> 'profileGender', 'null'::jsonb),
          nullif(request_payload -> 'profile_gender', 'null'::jsonb)
        )
      )) as goal_context,
      selected_report_id, feedback_payload,
      note_content, note_created_at, note_updated_at,
      created_at, completed_at
    from projected_reports
    order by coalesce(completed_at, created_at), id
    """,
    user["id"],
    resolved_date,
  )
  missions = await db.fetch(
    """
    select id, source, difficulty, title, is_completed, completed_at,
      sort_order, created_at, updated_at
    from makeup_journey_missions
    where user_id = $1 and entry_date = $2
    order by sort_order, created_at, id
    """,
    user["id"],
    resolved_date,
  )
  note = await db.fetchrow(
    """
    select content, created_at, updated_at
    from makeup_journey_day_notes
    where user_id = $1 and entry_date = $2 and report_id is null
    """,
    user["id"],
    resolved_date,
  )

  goal_score = int(settings_row["goal_score"]) if settings_row else None
  first_score = int(reports[0]["score"]) if reports else None
  latest_score = int(reports[-1]["score"]) if reports else None
  selected_report_id = reports[0].get("selected_report_id") if reports else None
  representative_report = next(
    (report for report in reports if report["id"] == selected_report_id),
    reports[-1] if reports else None,
  )
  representative_report_id = representative_report["id"] if representative_report else None
  representative_score = int(representative_report["score"]) if representative_report else None
  status = (
    "empty"
    if representative_score is None or goal_score is None
    else "success" if representative_score >= goal_score else "failure"
  )
  return success(
    {
      "date": entry_date,
      "goal_score": goal_score,
      "status": status,
      "first_score": first_score,
      "latest_score": latest_score,
      "representative_report_id": representative_report_id,
      "representative_score": representative_score,
      "score_delta": (
        representative_score - first_score
        if representative_score is not None and first_score is not None and len(reports) > 1
        else None
      ),
      "report_count": len(reports),
      "feedback_digest": build_feedback_digest(representative_report),
      "reports": [_report_data(report) for report in reports],
      "missions": [_mission_data(mission) for mission in missions],
      "note": (
        _report_data(representative_report)["note"]
        if representative_report is not None
        else _note_data(note)
      ),
    },
  )


@router.get("/trends", response_model=MakeupJourneyTrendResponse)
async def get_makeup_journey_trends(
  range_value: str = Query(default="30d", alias="range"),
  end_date: str | None = Query(default=None, alias="endDate"),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  if range_value not in RANGE_DAYS:
    raise AppError(422, "MAKEUP_JOURNEY_RANGE_INVALID", "range must be 7d, 30d, or 90d.")
  user = await ensure_user(db, auth)
  settings_row = await _get_settings(db, user["id"])
  goal_score = int(settings_row["goal_score"]) if settings_row else None
  resolved_end = _parse_date(end_date) if end_date else _today((settings_row or {}).get("timezone_name"))
  start_date = resolved_end - timedelta(days=RANGE_DAYS[range_value] - 1)
  if settings_row is None:
    return success(
      {
        "range": range_value,
        "goal_score": None,
        "points": [],
        "summary": {
          "first_score": None,
          "latest_score": None,
          "highest_score": None,
          "average_score": None,
        },
      },
    )

  rows = await db.fetch(
    """
    with ranked as (
      select reports.entry_date, reports.id, reports.score,
        selections.report_id as selected_report_id,
        row_number() over (
          partition by reports.entry_date
          order by coalesce(reports.completed_at, reports.created_at) desc, reports.id desc
        ) as latest_rank
      from makeup_feedback_reports reports
      left join makeup_journey_day_score_selections selections
        on selections.user_id = reports.user_id
        and selections.entry_date = reports.entry_date
      where reports.user_id = $1 and reports.entry_date between $2 and $3
        and reports.status = 'completed' and reports.score is not null
    ), daily_scores as (
      select entry_date,
        coalesce(
          max(score) filter (where id = selected_report_id),
          max(score) filter (where latest_rank = 1)
        ) as score
      from ranked
      group by entry_date
    )
    select entry_date, score
    from daily_scores
    order by entry_date
    """,
    user["id"],
    start_date,
    resolved_end,
  )
  scores = [int(row["score"]) for row in rows]
  return success(
    {
      "range": range_value,
      "goal_score": goal_score,
      "points": [
        {
          "date": _iso(row["entry_date"]),
          "score": int(row["score"]),
          "status": "success" if int(row["score"]) >= goal_score else "failure",
        }
        for row in rows
      ],
      "summary": {
        "first_score": scores[0] if scores else None,
        "latest_score": scores[-1] if scores else None,
        "highest_score": max(scores) if scores else None,
        "average_score": _rounded_average(scores),
      },
    },
  )


@router.put(
  "/days/{entry_date}/score-selection",
  response_model=MakeupJourneyScoreSelectionResponse,
)
async def update_makeup_journey_score_selection(
  entry_date: str,
  payload: MakeupJourneyScoreSelectionUpdate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  resolved_date = _parse_date(entry_date)
  user = await ensure_user(db, auth)
  row = await db.fetchrow(
    """
    with eligible_report as (
      select id, score
      from makeup_feedback_reports
      where id = $3 and user_id = $1 and entry_date = $2
        and status = 'completed' and score is not null
    )
    insert into makeup_journey_day_score_selections (
      user_id, entry_date, report_id
    )
    select $1, $2, id from eligible_report
    on conflict (user_id, entry_date) do update set
      report_id = excluded.report_id,
      updated_at = now()
    returning report_id,
      (select score from eligible_report) as score,
      updated_at
    """,
    user["id"],
    resolved_date,
    payload.report_id,
  )
  if row is None:
    raise AppError(
      404,
      "MAKEUP_JOURNEY_REPORT_NOT_FOUND",
      "Completed feedback report was not found for this date.",
    )
  return success(
    {
      "date": entry_date,
      "report_id": row["report_id"],
      "score": int(row["score"]),
      "updated_at": row["updated_at"],
    },
  )


@router.put("/days/{entry_date}/note", response_model=MakeupJourneyNoteResponse)
async def update_makeup_journey_note(
  entry_date: str,
  payload: MakeupJourneyNoteUpdate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  resolved_date = _parse_date(entry_date)
  user = await ensure_user(db, auth)
  settings_row = _require_settings(await _get_settings(db, user["id"]))
  _ensure_writable_date(resolved_date, settings_row)
  if payload.report_id is not None:
    owned_report = await db.fetchrow(
      """
      select id
      from makeup_feedback_reports
      where id = $3 and user_id = $1 and entry_date = $2
        and status = 'completed' and score is not null
      """,
      user["id"],
      resolved_date,
      payload.report_id,
    )
    if owned_report is None:
      raise AppError(
        404,
        "MAKEUP_JOURNEY_REPORT_NOT_FOUND",
        "Completed feedback report was not found for this date.",
      )
  content = payload.content.strip()
  if not content:
    await db.execute(
      """
      delete from makeup_journey_day_notes
      where user_id = $1 and entry_date = $2
        and report_id is not distinct from $3
      """,
      user["id"],
      resolved_date,
      payload.report_id,
    )
    return success({"note": None})

  if payload.report_id is None:
    row = await db.fetchrow(
      """
      insert into makeup_journey_day_notes (user_id, entry_date, report_id, content)
      values ($1, $2, null, $3)
      on conflict (user_id, entry_date) where report_id is null do update set
        content = excluded.content,
        updated_at = now()
      returning content, created_at, updated_at
      """,
      user["id"],
      resolved_date,
      content,
    )
  else:
    row = await db.fetchrow(
      """
      insert into makeup_journey_day_notes (user_id, entry_date, report_id, content)
      values ($1, $2, $3, $4)
      on conflict (user_id, entry_date, report_id) where report_id is not null do update set
        content = excluded.content,
        updated_at = now()
      returning content, created_at, updated_at
      """,
      user["id"],
      resolved_date,
      payload.report_id,
      content,
    )
  return success({"note": _note_data(row)})


@router.post(
  "/days/{entry_date}/missions",
  response_model=MakeupJourneyMissionResponse,
)
async def create_makeup_journey_mission(
  entry_date: str,
  payload: MakeupJourneyMissionCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  resolved_date = _parse_date(entry_date)
  user = await ensure_user(db, auth)
  settings_row = _require_settings(await _get_settings(db, user["id"]))
  _ensure_writable_date(resolved_date, settings_row)
  try:
    row = await db.fetchrow(
      """
      insert into makeup_journey_missions (
        user_id, entry_date, source, difficulty, title, sort_order
      )
      select $1, $2, 'user', $3, $4,
        coalesce((select max(sort_order) + 1 from makeup_journey_missions where user_id = $1 and entry_date = $2), 0)
      where not exists (
        select 1 from makeup_journey_missions
        where user_id = $1 and entry_date = $2 and lower(title) = lower($4)
      )
      returning id, source, difficulty, title, is_completed, completed_at,
        sort_order, created_at, updated_at
      """,
      user["id"],
      resolved_date,
      settings_row["mission_level"],
      payload.title,
    )
  except asyncpg.UniqueViolationError as exc:
    raise AppError(409, "MAKEUP_JOURNEY_MISSION_DUPLICATE", "Mission title already exists for this date.") from exc
  if row is None:
    raise AppError(409, "MAKEUP_JOURNEY_MISSION_DUPLICATE", "Mission title already exists for this date.")
  return success({"mission": _mission_data(row)})


@router.post(
  "/days/{entry_date}/missions/generate",
  response_model=MakeupJourneyMissionsResponse,
)
async def generate_makeup_journey_missions(
  entry_date: str,
  payload: MakeupJourneyMissionGenerate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  resolved_date = _parse_date(entry_date)
  user = await ensure_user(db, auth)
  settings_row = _require_settings(await _get_settings(db, user["id"]))
  _ensure_writable_date(resolved_date, settings_row)
  existing_rows = await db.fetch(
    """
    select title, is_completed
    from makeup_journey_missions
    where user_id = $1 and entry_date = $2
    order by sort_order, created_at, id
    """,
    user["id"],
    resolved_date,
  )
  recent_rows = await db.fetch(
    """
    select title
    from makeup_journey_missions
    where user_id = $1 and entry_date <> $2
      and source in ('ai', 'curated')
    order by created_at desc, id desc
    limit 45
    """,
    user["id"],
    resolved_date,
  )
  recent_titles = {
    str(row["title"])
    for row in recent_rows
    if row.get("title")
  }
  existing_titles = {str(row["title"]) for row in existing_rows}
  excluded_titles = existing_titles | recent_titles
  curated_missions = curated_daily_missions(
    excluded_titles=excluded_titles,
  )
  titles = [title for title, _difficulty in curated_missions]
  difficulties = [difficulty for _title, difficulty in curated_missions]
  source = "curated"

  if not titles:
    return success({"missions": []})
  generation_payload = json.dumps(
    {
      "generationStatus": "curated_random",
      "missionSet": "daily_three",
      "poolVersion": "daily-v2",
    },
    ensure_ascii=False,
  )
  try:
    rows = await db.fetch(
      """
      with base as (
        select coalesce(max(sort_order) + 1, 0) as next_order
        from makeup_journey_missions
        where user_id = $1 and entry_date = $2
      ), candidates as (
        select title, difficulty, ordinality::int - 1 as sort_offset
        from unnest($4::text[], $5::text[]) with ordinality
          as generated(title, difficulty, ordinality)
      )
      insert into makeup_journey_missions (
        user_id, entry_date, source, difficulty, title, sort_order, generation_payload
      )
      select $1, $2, $3, candidates.difficulty, candidates.title,
        base.next_order + candidates.sort_offset, $6::jsonb
      from candidates cross join base
      on conflict do nothing
      returning id, source, difficulty, title, is_completed, completed_at,
        sort_order, created_at, updated_at
      """,
      user["id"],
      resolved_date,
      source,
      titles,
      difficulties,
      generation_payload,
    )
  except asyncpg.UniqueViolationError:
    rows = []
  return success({"missions": [_mission_data(row) for row in rows]})


async def _require_writable_owned_mission_date(
  db: Database,
  *,
  mission_id: UUID,
  user_id: UUID,
) -> date:
  mission = await db.fetchrow(
    """
    select entry_date
    from makeup_journey_missions
    where id = $1 and user_id = $2
    """,
    mission_id,
    user_id,
  )
  if mission is None:
    raise AppError(404, "MAKEUP_JOURNEY_MISSION_NOT_FOUND", "Mission was not found.")

  settings_row = _require_settings(await _get_settings(db, user_id))
  entry_date = mission.get("entry_date")
  if not isinstance(entry_date, date):
    raise AppError(409, "MAKEUP_JOURNEY_MISSION_DATE_MISSING", "Mission date is invalid.")
  _ensure_writable_date(entry_date, settings_row)
  return entry_date


@router.patch(
  "/missions/{mission_id}",
  response_model=MakeupJourneyMissionResponse,
)
async def update_makeup_journey_mission(
  mission_id: UUID,
  payload: MakeupJourneyMissionUpdate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  entry_date = await _require_writable_owned_mission_date(
    db,
    mission_id=mission_id,
    user_id=user["id"],
  )
  try:
    row = await db.fetchrow(
      """
      update makeup_journey_missions
      set title = coalesce($3, title),
          is_completed = coalesce($4, is_completed),
          completed_at = case
            when $4::boolean is null then completed_at
            when $4 then coalesce(completed_at, now())
            else null
          end,
          updated_at = now()
      where id = $1 and user_id = $2 and entry_date = $5
      returning id, source, difficulty, title, is_completed, completed_at,
        sort_order, created_at, updated_at
      """,
      mission_id,
      user["id"],
      payload.title,
      payload.is_completed,
      entry_date,
    )
  except asyncpg.UniqueViolationError as exc:
    raise AppError(409, "MAKEUP_JOURNEY_MISSION_DUPLICATE", "Mission title already exists for this date.") from exc
  if row is None:
    raise AppError(404, "MAKEUP_JOURNEY_MISSION_NOT_FOUND", "Mission was not found.")
  return success({"mission": _mission_data(row)})


@router.delete(
  "/missions/{mission_id}",
  response_model=MakeupJourneyDeleteMissionResponse,
)
async def delete_makeup_journey_mission(
  mission_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  entry_date = await _require_writable_owned_mission_date(
    db,
    mission_id=mission_id,
    user_id=user["id"],
  )
  row = await db.fetchrow(
    """
    delete from makeup_journey_missions
    where id = $1 and user_id = $2 and entry_date = $3
    returning id
    """,
    mission_id,
    user["id"],
    entry_date,
  )
  if row is None:
    raise AppError(404, "MAKEUP_JOURNEY_MISSION_NOT_FOUND", "Mission was not found.")
  return success({"deleted": True, "mission_id": row["id"]})
