"""Consulting feature data access and business logic.

Raw asyncpg SQL following the existing backend conventions. All dict keys are
snake_case and get converted to camelCase by ``app.core.responses.success``.
"""

import asyncio
from calendar import monthrange
import asyncpg
import json
from datetime import date, datetime, timedelta
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from app.core.errors import AppError
from app.db.session import Database


def _decode_json_list(value: Any) -> list[Any]:
  """asyncpg returns jsonb columns as raw strings (no codec configured)."""
  if isinstance(value, list):
    return value
  if isinstance(value, str) and value.strip():
    try:
      decoded = json.loads(value)
    except json.JSONDecodeError:
      return []
    return decoded if isinstance(decoded, list) else []
  return []


# Static concern labels (mirrors the mobile consultingConcerns mock).
CONCERN_LABELS: dict[str, str] = {
  "concern_tone": "퍼스널컬러가 헷갈려요",
  "concern_makeup": "메이크업 피드백 심화",
  "concern_product": "골격에 맞는 옷 스타일",
  "concern_hair": "헤어 · 스타일 고민",
}

_WEEKDAYS_KO = ["월", "화", "수", "목", "금", "토", "일"]
_KST = ZoneInfo("Asia/Seoul")
_DEFAULT_BOOKING_OPEN_MONTHS = 1
_MAX_BOOKING_OPEN_MONTHS = 3
_BOOKING_DAY_START_MINUTE = 0
_BOOKING_DAY_END_MINUTE = 24 * 60
_BOOKING_INTERVAL_MINUTES = 30
_DEFAULT_OPEN_MINUTE = 10 * 60
_DEFAULT_CLOSE_MINUTE = 19 * 60
ACTIVE_BOOKING_STATUSES = ("requested", "contacting", "confirmed", "scheduled", "in_progress")
EDITABLE_BOOKING_STATUSES = ("requested", "contacting")
SLOT_BLOCKING_STATUSES = ("contacting", "confirmed", "scheduled", "in_progress")
ScheduleSettings = dict[str, Any]


def _weekday_label(value: Any) -> str:
  return _WEEKDAYS_KO[value.weekday()]


def _today_kst() -> date:
  return datetime.now(_KST).date()


def _booking_slot_labels() -> tuple[str, ...]:
  return tuple(
    f"{minute_offset // 60:02d}:{minute_offset % 60:02d}"
    for minute_offset in range(
      _BOOKING_DAY_START_MINUTE,
      _BOOKING_DAY_END_MINUTE,
      _BOOKING_INTERVAL_MINUTES,
    )
  )


def _format_slot_label(minute_offset: int) -> str:
  return f"{minute_offset // 60:02d}:{minute_offset % 60:02d}"


def _decode_json_value(value: Any, fallback: Any) -> Any:
  if isinstance(value, (dict, list)):
    return value
  if isinstance(value, str) and value.strip():
    try:
      return json.loads(value)
    except json.JSONDecodeError:
      return fallback
  return fallback


def _payload_get(value: dict[str, Any], snake_key: str, camel_key: str | None = None) -> Any:
  if snake_key in value:
    return value[snake_key]
  if camel_key and camel_key in value:
    return value[camel_key]
  return None


def _bool(value: Any) -> bool:
  if isinstance(value, bool):
    return value
  if isinstance(value, str):
    return value.strip().lower() in {"1", "true", "yes", "y"}
  return bool(value)


def _time_to_minutes(value: Any, fallback: int) -> int:
  raw = str(value or "").strip()
  parts = raw.split(":")
  if len(parts) < 2:
    return fallback
  try:
    hour = int(parts[0])
    minute = int(parts[1])
  except ValueError:
    return fallback
  if hour < 0 or hour > 23 or minute < 0 or minute > 59:
    return fallback
  return hour * 60 + minute


def _default_operating_hours() -> list[dict[str, Any]]:
  return [
    {
      "day_of_week": day,
      "label": label,
      "opens_at": _format_slot_label(_DEFAULT_OPEN_MINUTE),
      "closes_at": _format_slot_label(_DEFAULT_CLOSE_MINUTE),
      "is_closed": day >= 5,
    }
    for day, label in enumerate(_WEEKDAYS_KO)
  ]


def _normalize_operating_hours(value: Any) -> list[dict[str, Any]]:
  raw_hours = _decode_json_value(value, [])
  defaults = _default_operating_hours()
  by_day: dict[int, dict[str, Any]] = {}
  if not isinstance(raw_hours, list):
    raw_hours = []

  for raw in raw_hours:
    if not isinstance(raw, dict):
      continue
    try:
      day = int(_payload_get(raw, "day_of_week", "dayOfWeek"))
    except (TypeError, ValueError):
      continue
    if day < 0 or day > 6:
      continue

    default = defaults[day]
    raw_closed = _payload_get(raw, "is_closed", "isClosed")
    is_closed = bool(default["is_closed"]) if raw_closed is None else _bool(raw_closed)
    opens_at = str(_payload_get(raw, "opens_at", "opensAt") or default["opens_at"])
    closes_at = str(_payload_get(raw, "closes_at", "closesAt") or default["closes_at"])
    open_minutes = _time_to_minutes(opens_at, _DEFAULT_OPEN_MINUTE)
    close_minutes = _time_to_minutes(closes_at, _DEFAULT_CLOSE_MINUTE)
    if not is_closed and open_minutes >= close_minutes:
      open_minutes = _DEFAULT_OPEN_MINUTE
      close_minutes = _DEFAULT_CLOSE_MINUTE

    normalized: dict[str, Any] = {
      "day_of_week": day,
      "label": str(_payload_get(raw, "label") or default["label"]),
      "opens_at": _format_slot_label(open_minutes),
      "closes_at": _format_slot_label(close_minutes),
      "is_closed": is_closed,
    }
    lunch_start = _payload_get(raw, "lunch_start", "lunchStart")
    lunch_end = _payload_get(raw, "lunch_end", "lunchEnd")
    if lunch_start and lunch_end:
      lunch_start_minutes = _time_to_minutes(lunch_start, -1)
      lunch_end_minutes = _time_to_minutes(lunch_end, -1)
      if open_minutes < lunch_start_minutes < lunch_end_minutes < close_minutes:
        normalized["lunch_start"] = _format_slot_label(lunch_start_minutes)
        normalized["lunch_end"] = _format_slot_label(lunch_end_minutes)
    by_day[day] = normalized

  return [by_day.get(day, defaults[day]) for day in range(7)]


def _normalize_holidays(value: Any) -> list[str]:
  raw_holidays = _decode_json_value(value, [])
  if not isinstance(raw_holidays, list):
    return []
  holidays: list[str] = []
  for item in raw_holidays:
    raw = str(item or "").strip()
    if not raw:
      continue
    try:
      normalized = datetime.fromisoformat(raw).date().isoformat()
    except ValueError:
      continue
    if normalized not in holidays:
      holidays.append(normalized)
  return sorted(holidays)


def _normalize_booking_open_months(value: Any) -> int:
  try:
    months = int(value)
  except (TypeError, ValueError):
    months = _DEFAULT_BOOKING_OPEN_MONTHS
  return min(max(months, 1), _MAX_BOOKING_OPEN_MONTHS)


def _schedule_settings_from_row(row: dict[str, Any] | None) -> ScheduleSettings:
  if row is None:
    return {
      "operating_hours": _default_operating_hours(),
      "holidays": [],
      "booking_open_months": _DEFAULT_BOOKING_OPEN_MONTHS,
    }
  return {
    "operating_hours": _normalize_operating_hours(row.get("operating_hours")),
    "holidays": _normalize_holidays(row.get("holiday_dates")),
    "booking_open_months": _normalize_booking_open_months(row.get("booking_open_months")),
  }


def _add_calendar_months(value: date, months: int) -> date:
  month_index = value.month - 1 + months
  year = value.year + month_index // 12
  month = month_index % 12 + 1
  day = min(value.day, monthrange(year, month)[1])
  return date(year, month, day)


def _booking_window_end(start_day: date, schedule_settings: ScheduleSettings) -> date:
  return _add_calendar_months(
    start_day,
    _normalize_booking_open_months(schedule_settings.get("booking_open_months")),
  )


def _operating_windows_for_day(
  schedule_settings: ScheduleSettings,
  slot_date: date,
) -> tuple[tuple[int, int], ...]:
  if slot_date.isoformat() in schedule_settings.get("holidays", []):
    return ()

  operating_hours = schedule_settings.get("operating_hours") or _default_operating_hours()
  weekday = slot_date.weekday()
  day_config = (
    operating_hours[weekday]
    if isinstance(operating_hours, list) and len(operating_hours) > weekday
    else _default_operating_hours()[weekday]
  )
  if _bool(day_config.get("is_closed")):
    return ()

  open_minutes = _time_to_minutes(day_config.get("opens_at"), _DEFAULT_OPEN_MINUTE)
  close_minutes = _time_to_minutes(day_config.get("closes_at"), _DEFAULT_CLOSE_MINUTE)
  if open_minutes >= close_minutes:
    return ()

  lunch_start = day_config.get("lunch_start") or day_config.get("lunchStart")
  lunch_end = day_config.get("lunch_end") or day_config.get("lunchEnd")
  if lunch_start and lunch_end:
    lunch_start_minutes = _time_to_minutes(lunch_start, -1)
    lunch_end_minutes = _time_to_minutes(lunch_end, -1)
    if open_minutes < lunch_start_minutes < lunch_end_minutes < close_minutes:
      windows: list[tuple[int, int]] = []
      if open_minutes < lunch_start_minutes:
        windows.append((open_minutes, lunch_start_minutes))
      if lunch_end_minutes < close_minutes:
        windows.append((lunch_end_minutes, close_minutes))
      return tuple(windows)

  return ((open_minutes, close_minutes),)


def _booking_slot_labels_for_day(
  schedule_settings: ScheduleSettings,
  slot_date: date,
  duration_minutes: int,
) -> tuple[str, ...]:
  labels: list[str] = []
  for start_minute, end_minute in _operating_windows_for_day(schedule_settings, slot_date):
    latest_start_minute = end_minute - duration_minutes
    if latest_start_minute < start_minute:
      continue

    labels.extend(
      _format_slot_label(minute_offset)
      for minute_offset in range(
        start_minute,
        latest_start_minute + 1,
        _BOOKING_INTERVAL_MINUTES,
      )
    )

  return tuple(dict.fromkeys(labels))


def _slot_label_to_minutes(slot_id: str) -> int:
  hour, minute = slot_id.split(":", 1)
  return int(hour) * 60 + int(minute)


def _intervals_overlap(
  start_minute: int,
  duration_minutes: int,
  booked_start_minute: int,
  booked_duration_minutes: int,
) -> bool:
  end_minute = start_minute + duration_minutes
  booked_end_minute = booked_start_minute + booked_duration_minutes
  return start_minute < booked_end_minute and end_minute > booked_start_minute


def _coerce_booking_slot_id(slot_id: str) -> str:
  value = (slot_id or "").strip()
  if value not in _booking_slot_labels():
    raise AppError(400, "CONSULTING_SLOT_INVALID", "선택한 시간을 확인해 주세요.")
  return value


def _validate_booking_day(day_id: date, schedule_settings: ScheduleSettings | None = None) -> date:
  today = _today_kst()
  settings = schedule_settings or _schedule_settings_from_row(None)
  last_day = _booking_window_end(today, settings)
  if day_id < today or day_id > last_day:
    months = settings["booking_open_months"]
    raise AppError(400, "CONSULTING_DAY_OUT_OF_RANGE", f"예약은 오늘부터 {months}개월 안에서 선택해 주세요.")
  return day_id


def _build_booking_days(
  booked_intervals_by_day: dict[str, list[tuple[int, int]]] | None = None,
  duration_minutes: int = 30,
  start_day: date | None = None,
  schedule_settings: ScheduleSettings | None = None,
) -> list[dict[str, Any]]:
  booked_intervals_by_day = booked_intervals_by_day or {}
  first_day = start_day or _today_kst()
  settings = schedule_settings or _schedule_settings_from_row(None)
  last_day = _booking_window_end(first_day, settings)
  day_count = (last_day - first_day).days + 1

  days: list[dict[str, Any]] = []
  for day_offset in range(day_count):
    slot_date = first_day + timedelta(days=day_offset)
    day_id = slot_date.isoformat()
    booked_intervals = booked_intervals_by_day.get(day_id, [])
    slot_labels = _booking_slot_labels_for_day(
      settings,
      slot_date,
      duration_minutes,
    )
    days.append(
      {
        "id": day_id,
        "weekday": _weekday_label(slot_date),
        "day": slot_date.day,
        "slots": [
          {
            "id": slot_label,
            "label": slot_label,
            "available": _slot_available_for_duration(
              slot_label,
              duration_minutes,
              booked_intervals,
            ),
          }
          for slot_label in slot_labels
        ],
      },
    )
  return days


def _slot_available_for_duration(
  slot_id: str,
  duration_minutes: int,
  booked_intervals: list[tuple[int, int]],
) -> bool:
  start_minute = _slot_label_to_minutes(slot_id)
  if start_minute + duration_minutes > _BOOKING_DAY_END_MINUTE:
    return False

  return not any(
    _intervals_overlap(
      start_minute,
      duration_minutes,
      booked_start_minute,
      booked_duration_minutes,
    )
    for booked_start_minute, booked_duration_minutes in booked_intervals
  )


def _slot_in_expert_operating_hours(
  schedule_settings: ScheduleSettings,
  day_id: date,
  slot_id: str,
  duration_minutes: int,
) -> bool:
  return slot_id in _booking_slot_labels_for_day(
    schedule_settings,
    day_id,
    duration_minutes,
  )


async def _slot_overlaps_booking(
  db: Database,
  expert_id: str,
  day_id: date,
  slot_id: str,
  duration_minutes: int,
  exclude_booking_id: str | None = None,
) -> bool:
  if exclude_booking_id:
    rows = await db.fetch(
      """
      select slot_id, duration_minutes
      from consulting_bookings
      where expert_id = $1
        and coalesce(scheduled_date, scheduled_at::date) = $2::date
        and status = any($4::text[])
        and slot_id is not null
        and id <> $3::uuid
      """,
      expert_id,
      day_id,
      exclude_booking_id,
      list(SLOT_BLOCKING_STATUSES),
    )
  else:
    rows = await db.fetch(
      """
      select slot_id, duration_minutes
      from consulting_bookings
      where expert_id = $1
        and coalesce(scheduled_date, scheduled_at::date) = $2::date
        and status = any($3::text[])
        and slot_id is not null
      """,
      expert_id,
      day_id,
      list(SLOT_BLOCKING_STATUSES),
    )

  start_minute = _slot_label_to_minutes(slot_id)
  for row in rows:
    booked_slot_id = row.get("slot_id")
    if not booked_slot_id:
      continue
    booked_start_minute = _slot_label_to_minutes(booked_slot_id)
    booked_duration_minutes = int(row.get("duration_minutes") or 30)
    if _intervals_overlap(
      start_minute,
      duration_minutes,
      booked_start_minute,
      booked_duration_minutes,
    ):
      return True

  return False


# -----------------------------------------------------------------------------
# Categories
# -----------------------------------------------------------------------------
async def list_categories(db: Database) -> list[dict[str, Any]]:
  return await db.fetch(
    """
    select id, title, description, icon
    from consulting_categories
    where is_active = true
    order by sort_order, title
    """,
  )


# -----------------------------------------------------------------------------
# Experts
# -----------------------------------------------------------------------------
def _offline_duration_price(online_price: int) -> int:
  offline_prices = {
    49000: 79000,
    59000: 89000,
    89000: 129000,
    99000: 139000,
    109000: 149000,
  }
  return offline_prices.get(online_price, round(online_price * 1.45 / 1000) * 1000)


def _duration_option(row: dict[str, Any]) -> dict[str, Any]:
  option = {key: value for key, value in row.items() if key != "expert_id"}
  online_price = int(option.get("price") or 0)
  option["prices"] = {
    "online": online_price,
    "offline": _offline_duration_price(online_price),
  }
  return option


async def _durations_for(db: Database, expert_id: str) -> list[dict[str, Any]]:
  rows = await db.fetch(
    """
    select code as id, label, minutes, price, description, recommended
    from consulting_expert_durations
    where expert_id = $1
    order by sort_order, minutes
    """,
    expert_id,
  )
  return [_duration_option(row) for row in rows]


async def _duration_minutes_for(
  db: Database,
  expert_id: str,
  duration_id: str | None = None,
) -> int:
  if duration_id:
    row = await db.fetchrow(
      """
      select minutes
      from consulting_expert_durations
      where expert_id = $1 and code = $2
      """,
      expert_id,
      duration_id,
    )
  else:
    row = await db.fetchrow(
      """
      select minutes
      from consulting_expert_durations
      where expert_id = $1
      order by minutes asc
      limit 1
      """,
      expert_id,
    )

  if row is None:
    raise AppError(400, "CONSULTING_DURATION_INVALID", "선택한 상담 시간을 확인해 주세요.")

  return int(row["minutes"])


async def _category_ids_for(db: Database, expert_id: str) -> list[str]:
  rows = await db.fetch(
    """
    select ec.category_id
    from consulting_expert_categories ec
    join consulting_categories c on c.id = ec.category_id
    where ec.expert_id = $1
    order by c.sort_order
    """,
    expert_id,
  )
  return [row["category_id"] for row in rows]


async def _durations_for_many(
  db: Database,
  expert_ids: list[str],
) -> dict[str, list[dict[str, Any]]]:
  if not expert_ids:
    return {}

  rows = await db.fetch(
    """
    select expert_id, code as id, label, minutes, price, description, recommended
    from consulting_expert_durations
    where expert_id = any($1::text[])
    order by expert_id, sort_order, minutes
    """,
    expert_ids,
  )
  grouped: dict[str, list[dict[str, Any]]] = {expert_id: [] for expert_id in expert_ids}
  for row in rows:
    expert_id = row["expert_id"]
    grouped.setdefault(expert_id, []).append(_duration_option(row))
  return grouped


async def _category_ids_for_many(
  db: Database,
  expert_ids: list[str],
) -> dict[str, list[str]]:
  if not expert_ids:
    return {}

  rows = await db.fetch(
    """
    select ec.expert_id, ec.category_id
    from consulting_expert_categories ec
    join consulting_categories c on c.id = ec.category_id
    where ec.expert_id = any($1::text[])
    order by ec.expert_id, c.sort_order
    """,
    expert_ids,
  )
  grouped: dict[str, list[str]] = {expert_id: [] for expert_id in expert_ids}
  for row in rows:
    grouped.setdefault(row["expert_id"], []).append(row["category_id"])
  return grouped


def _expert_card(row: dict[str, Any]) -> dict[str, Any]:
  return {
    "id": row["id"],
    "name": row["name"],
    "title": row["title"],
    "signature_line": row["signature_line"],
    "initials": row["initials"],
    "avatar_tone": row["avatar_tone"],
    "image_url": row.get("image_url"),
    "studio_name": row.get("studio_name"),
    "career_years": row["career_years"],
    "rating": row["rating"],
    "review_count": row["review_count"],
    "session_count": row["session_count"],
    "rebook_rate": row["rebook_rate"],
    "response_minutes": row["response_minutes"],
    "tags": row["tags"],
    "intro": row["intro"],
    "availability_note": row["availability_note"],
    "certifications": row["certifications"],
  }


async def list_experts(db: Database, category_id: str | None = None) -> list[dict[str, Any]]:
  if category_id and category_id != "all":
    rows = await db.fetch(
      """
      select e.*
      from consulting_experts e
      join consulting_expert_categories ec on ec.expert_id = e.id
      where e.is_active = true and ec.category_id = $1
      order by e.sort_order, e.id
      """,
      category_id,
    )
  else:
    rows = await db.fetch(
      """
      select *
      from consulting_experts
      where is_active = true
      order by sort_order, id
      """,
    )

  experts: list[dict[str, Any]] = []
  expert_ids = [row["id"] for row in rows]
  categories_by_expert, durations_by_expert = await asyncio.gather(
    _category_ids_for_many(db, expert_ids),
    _durations_for_many(db, expert_ids),
  )

  for row in rows:
    card = _expert_card(row)
    card["category_ids"] = categories_by_expert.get(row["id"], [])
    card["durations"] = durations_by_expert.get(row["id"], [])
    experts.append(card)
  return experts


async def get_expert(db: Database, expert_id: str) -> dict[str, Any]:
  row = await db.fetchrow(
    "select * from consulting_experts where id = $1 and is_active = true",
    expert_id,
  )
  if row is None:
    raise AppError(404, "CONSULTING_EXPERT_NOT_FOUND", "전문가를 찾을 수 없어요.")

  expert = _expert_card(row)
  expert["category_ids"] = await _category_ids_for(db, expert_id)
  expert["durations"] = await _durations_for(db, expert_id)
  expert["career_history"] = await db.fetch(
    """
    select code as id, period, role
    from consulting_expert_career
    where expert_id = $1
    order by sort_order
    """,
    expert_id,
  )
  expert["reviews"] = await db.fetch(
    """
    select id, author, category, body, rating, date_label
    from consulting_expert_reviews
    where expert_id = $1
    order by created_at desc
    """,
    expert_id,
  )
  return expert


async def get_expert_slots(
  db: Database,
  expert_id: str,
  duration_id: str | None = None,
) -> list[dict[str, Any]]:
  expert = await db.fetchrow(
    """
    select id, operating_hours, holiday_dates, booking_open_months
    from consulting_experts
    where id = $1 and is_active = true
    """,
    expert_id,
  )
  if expert is None:
    raise AppError(404, "CONSULTING_EXPERT_NOT_FOUND", "전문가를 찾을 수 없어요.")

  schedule_settings = _schedule_settings_from_row(expert)
  duration_minutes = await _duration_minutes_for(db, expert_id, duration_id)
  first_day = _today_kst()
  last_day = _booking_window_end(first_day, schedule_settings)
  rows = await db.fetch(
    """
    select coalesce(scheduled_date, scheduled_at::date) as booked_date,
           slot_id,
           duration_minutes
    from consulting_bookings
    where expert_id = $1
      and status = any($4::text[])
      and coalesce(scheduled_date, scheduled_at::date) between $2::date and $3::date
      and slot_id is not null
    order by scheduled_at
    """,
    expert_id,
    first_day,
    last_day,
    list(SLOT_BLOCKING_STATUSES),
  )

  booked_intervals_by_day: dict[str, list[tuple[int, int]]] = {}
  for row in rows:
    day_id = row["booked_date"].isoformat()
    booked_intervals_by_day.setdefault(day_id, []).append(
      (
        _slot_label_to_minutes(row["slot_id"]),
        int(row.get("duration_minutes") or 30),
      ),
    )
  return _build_booking_days(
    booked_intervals_by_day,
    duration_minutes,
    first_day,
    schedule_settings=schedule_settings,
  )


# -----------------------------------------------------------------------------
# Home aggregate
# -----------------------------------------------------------------------------
async def get_home(db: Database, user_id: str) -> dict[str, Any]:
  categories, experts, active_records = await asyncio.gather(
    list_categories(db),
    list_experts(db),
    _active_bookings(db, user_id),
  )
  active = active_records[0] if active_records else None
  return {
    "categories": categories,
    "experts": experts,
    "active_record": active,
    "active_records": active_records,
    "upcoming_record": active,
    "upcoming_records": active_records,
  }


# -----------------------------------------------------------------------------
# Bookings
# -----------------------------------------------------------------------------
def _record(row: dict[str, Any]) -> dict[str, Any]:
  scheduled_at = row.get("scheduled_at")
  scheduled_date = row.get("scheduled_date")
  shared_report_ids = row.get("shared_report_ids") or []
  price = row.get("price")
  return {
    "id": str(row["id"]),
    "conversation_id": str(row.get("conversation_id") or row["id"]),
    "customer_left_at": row.get("customer_left_at"),
    "expert_left_at": row.get("expert_left_at"),
    "expert_id": row["expert_id"],
    "duration_id": row.get("duration_code"),
    "day_id": scheduled_date.isoformat()
    if scheduled_date is not None
    else scheduled_at.date().isoformat()
    if scheduled_at is not None
    else None,
    "slot_id": row.get("slot_id"),
    "status": _public_booking_status(str(row["status"])),
    "category_label": row["category_label"],
    "date_label": row["date_label"],
    "duration_label": row["duration_label"],
    "session_mode": row.get("session_mode") or "online",
    "estimated_price": int(price) if price is not None else None,
    "shared_report_ids": [str(report_id) for report_id in shared_report_ids],
    "review_id": row.get("review_id"),
    "contact_name": row.get("contact_name"),
    "contact_phone": row.get("contact_phone"),
    "preferred_contact_method": row.get("preferred_contact_method"),
    # The mobile inbox uses the latest expert message timestamp to distinguish
    # a real incoming chat from an unchanged booking status.  Keep this
    # metadata on the booking payload so the header can refresh its badge
    # without opening every conversation.
    "last_expert_message_at": row.get("last_expert_message_at"),
  }


def _public_booking_status(status: str) -> str:
  if status in {"requested", "contacting"}:
    return "requested"
  if status in {"confirmed", "scheduled", "in_progress"}:
    return "confirmed"
  if status == "completed":
    return "completed"
  return "canceled"


def _booking_price(payload: Any, duration: dict[str, Any]) -> int:
  if payload.estimated_price is not None:
    return int(payload.estimated_price)
  return int(duration["price"] or 0)


async def _attach_summary(db: Database, record: dict[str, Any], booking_id: Any) -> dict[str, Any]:
  summary = await db.fetchrow(
    """
    select expert_id, duration_label, date_label, notes, products
    from consulting_summaries
    where booking_id = $1
    """,
    booking_id,
  )
  if summary is not None:
    record["summary"] = {
      "expert_id": summary["expert_id"],
      "duration_label": summary["duration_label"],
      "date_label": summary["date_label"],
      "notes": _decode_json_list(summary["notes"]),
      "products": _decode_json_list(summary["products"]),
    }
  return record


async def _active_booking(db: Database, user_id: str) -> dict[str, Any] | None:
  records = await _active_bookings(db, user_id, limit=1)
  return records[0] if records else None


async def _active_bookings(
  db: Database,
  user_id: str,
  limit: int = 10,
) -> list[dict[str, Any]]:
  rows = await db.fetch(
    """
    select b.*, r.id as review_id,
      (
        select max(m.created_at)
        from consulting_messages m
        where m.booking_id = b.id
          and m.sender_type = 'expert'
          and m.deleted_at is null
      ) as last_expert_message_at
    from consulting_bookings b
    left join consulting_expert_reviews r
      on r.booking_id = b.id and r.author_user_id = $1
    where b.user_id = $1 and b.status = any($2::text[])
    order by b.created_at desc, b.scheduled_at desc nulls last
    limit $3
    """,
    user_id,
    list(ACTIVE_BOOKING_STATUSES),
    limit,
  )
  return [_record(record) for record in rows]


async def list_bookings(
  db: Database,
  user_id: str,
  status: str | None = None,
) -> list[dict[str, Any]]:
  if status and status != "all":
    rows = await db.fetch(
      """
      select b.*, r.id as review_id,
        (
          select max(m.created_at)
          from consulting_messages m
          where m.booking_id = b.id
            and m.sender_type = 'expert'
            and m.deleted_at is null
        ) as last_expert_message_at
      from consulting_bookings b
      left join consulting_expert_reviews r
        on r.booking_id = b.id and r.author_user_id = $1
      where b.user_id = $1 and b.status = $2
      order by b.scheduled_at desc nulls last, b.created_at desc
      """,
      user_id,
      status,
    )
  else:
    rows = await db.fetch(
      """
      select b.*, r.id as review_id,
        (
          select max(m.created_at)
          from consulting_messages m
          where m.booking_id = b.id
            and m.sender_type = 'expert'
            and m.deleted_at is null
        ) as last_expert_message_at
      from consulting_bookings b
      left join consulting_expert_reviews r
        on r.booking_id = b.id and r.author_user_id = $1
      where b.user_id = $1
      order by b.scheduled_at desc nulls last, b.created_at desc
      """,
      user_id,
    )

  records: list[dict[str, Any]] = []
  for row in rows:
    record = _record(row)
    if row["status"] == "completed":
      record = await _attach_summary(db, record, row["id"])
    records.append(record)
  return records


async def get_booking(db: Database, user_id: str, booking_id: str) -> dict[str, Any]:
  row = await db.fetchrow(
    """
    select b.*, r.id as review_id,
      (
        select max(m.created_at)
        from consulting_messages m
        where m.booking_id = b.id
          and m.sender_type = 'expert'
          and m.deleted_at is null
      ) as last_expert_message_at
    from consulting_bookings b
    left join consulting_expert_reviews r
      on r.booking_id = b.id and r.author_user_id = $2
    where b.id = $1 and b.user_id = $2
    """,
    booking_id,
    user_id,
  )
  if row is None:
    raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")
  return await _attach_summary(db, _record(row), row["id"])


async def leave_booking_conversation(db: Database, user_id: str, booking_id: str) -> dict[str, Any]:
  row = await db.fetchrow(
    """
    select coalesce(conversation_id, id) as conversation_id
    from consulting_bookings
    where id::text = $1 and user_id = $2::uuid
    """,
    booking_id,
    user_id,
  )
  if row is None:
    raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")

  await db.execute(
    """
    update consulting_bookings
    set customer_left_at = coalesce(customer_left_at, now()), updated_at = now()
    where conversation_id = $1 and user_id = $2::uuid
    """,
    row["conversation_id"],
    user_id,
  )
  return {"conversation_id": str(row["conversation_id"]), "left": True}


async def _conversation_id_for_new_booking(
  db: Database,
  user_id: str,
  expert_id: str,
  booking_id: Any,
) -> Any:
  row = await db.fetchrow(
    """
    select coalesce(conversation_id, id) as conversation_id
    from consulting_bookings
    where user_id = $1::uuid and expert_id = $2
      and customer_left_at is null and expert_left_at is null
    order by created_at desc
    limit 1
    """,
    user_id,
    expert_id,
  )
  return row["conversation_id"] if row is not None else booking_id


async def create_booking(db: Database, user_id: str, payload: Any) -> dict[str, Any]:
  expert = await db.fetchrow(
    """
    select id, title, operating_hours, holiday_dates, booking_open_months
    from consulting_experts
    where id = $1 and is_active = true
    """,
    payload.expert_id,
  )
  if expert is None:
    raise AppError(404, "CONSULTING_EXPERT_NOT_FOUND", "전문가를 찾을 수 없어요.")

  duration = await db.fetchrow(
    """
    select code, label, minutes, price
    from consulting_expert_durations
    where expert_id = $1 and code = $2
    """,
    payload.expert_id,
    payload.duration_id,
  )
  if duration is None:
    raise AppError(400, "CONSULTING_DURATION_INVALID", "선택한 상담 시간을 확인해 주세요.")

  schedule_settings = _schedule_settings_from_row(expert)
  booking_day = _validate_booking_day(payload.day_id, schedule_settings)
  slot_id = _coerce_booking_slot_id(payload.slot_id)
  slot_start_minutes = _slot_label_to_minutes(slot_id)
  duration_minutes = int(duration["minutes"])
  if not _slot_available_for_duration(slot_id, duration_minutes, []):
    raise AppError(400, "CONSULTING_SLOT_INVALID", "선택한 시간은 상담 길이에 맞지 않아요.")
  if not _slot_in_expert_operating_hours(
    schedule_settings,
    booking_day,
    slot_id,
    duration_minutes,
  ):
    raise AppError(
      400,
      "CONSULTING_SLOT_OUTSIDE_OPERATING_HOURS",
      "선택한 시간은 프리랜서 상담 가능 시간이 아니에요.",
    )
  if await _slot_overlaps_booking(
    db,
    payload.expert_id,
    booking_day,
    slot_id,
    duration_minutes,
  ):
    raise AppError(409, "CONSULTING_SLOT_TAKEN", "이미 예약된 시간이에요.")

  category_ids = await _category_ids_for(db, payload.expert_id)
  category_label = None
  if category_ids:
    category_row = await db.fetchrow(
      "select title from consulting_categories where id = $1",
      category_ids[0],
    )
    category_label = category_row["title"] if category_row else None

  concern_label = CONCERN_LABELS.get(payload.concern_id or "")
  scheduled_at = datetime.combine(
    booking_day,
    datetime.strptime(slot_id, "%H:%M").time(),
  )
  weekday = _weekday_label(booking_day)
  date_label = (
    f"{booking_day.month}월 {booking_day.day}일 "
    f"({weekday}) {slot_id}"
  )
  shared_report_ids = list(payload.shared_report_ids or [])
  booking_price = _booking_price(payload, duration)
  booking_id = uuid4()
  conversation_id = await _conversation_id_for_new_booking(
    db,
    user_id,
    payload.expert_id,
    booking_id,
  )

  try:
    row = await db.fetchrow(
      """
      insert into consulting_bookings (
        id, conversation_id, user_id, expert_id, duration_code, duration_label, duration_minutes,
        category_label, scheduled_at, scheduled_date, slot_start_minutes,
        date_label, slot_id, concern_id, concern_label,
        share_reports, shared_report_ids, question,
        contact_name, contact_phone, preferred_contact_method,
        session_mode,
        status, price
      )
      values (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17::uuid[], $18,
        $19, $20, $21,
        $22,
        'requested', $23
      )
      returning *
      """,
      booking_id,
      conversation_id,
      user_id,
      payload.expert_id,
      duration["code"],
      duration["label"],
      duration_minutes,
      category_label,
      scheduled_at,
      booking_day,
      slot_start_minutes,
      date_label,
      slot_id,
      payload.concern_id,
      concern_label,
      payload.share_reports,
      shared_report_ids,
      (payload.question or "").strip() or None,
      (payload.contact_name or "").strip() or None,
      (payload.contact_phone or "").strip() or None,
      (payload.preferred_contact_method or "").strip() or None,
      payload.session_mode,
      booking_price,
    )
  except asyncpg.exceptions.ExclusionViolationError as error:
    raise AppError(409, "CONSULTING_SLOT_TAKEN", "이미 예약된 시간이에요.") from error

  return _record(row)


async def update_booking(
  db: Database,
  user_id: str,
  booking_id: str,
  payload: Any,
) -> dict[str, Any]:
  current = await db.fetchrow(
    "select * from consulting_bookings where id = $1 and user_id = $2",
    booking_id,
    user_id,
  )
  if current is None:
    raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")
  if current["status"] not in EDITABLE_BOOKING_STATUSES:
    raise AppError(409, "CONSULTING_BOOKING_NOT_EDITABLE", "확정 전 신청만 수정할 수 있어요.")
  if current["expert_id"] != payload.expert_id:
    raise AppError(400, "CONSULTING_EXPERT_CHANGE_UNSUPPORTED", "전문가 변경은 새 예약으로 진행해 주세요.")

  expert = await db.fetchrow(
    """
    select id, operating_hours, holiday_dates, booking_open_months
    from consulting_experts
    where id = $1 and is_active = true
    """,
    payload.expert_id,
  )
  if expert is None:
    raise AppError(404, "CONSULTING_EXPERT_NOT_FOUND", "전문가를 찾을 수 없어요.")
  schedule_settings = _schedule_settings_from_row(expert)

  duration = await db.fetchrow(
    """
    select code, label, minutes, price
    from consulting_expert_durations
    where expert_id = $1 and code = $2
    """,
    payload.expert_id,
    payload.duration_id,
  )
  if duration is None:
    raise AppError(400, "CONSULTING_DURATION_INVALID", "선택한 상담 시간을 확인해 주세요.")

  booking_day = _validate_booking_day(payload.day_id, schedule_settings)
  slot_id = _coerce_booking_slot_id(payload.slot_id)
  slot_start_minutes = _slot_label_to_minutes(slot_id)
  duration_minutes = int(duration["minutes"])
  if not _slot_available_for_duration(slot_id, duration_minutes, []):
    raise AppError(400, "CONSULTING_SLOT_INVALID", "선택한 시간은 상담 길이에 맞지 않아요.")
  if not _slot_in_expert_operating_hours(
    schedule_settings,
    booking_day,
    slot_id,
    duration_minutes,
  ):
    raise AppError(
      400,
      "CONSULTING_SLOT_OUTSIDE_OPERATING_HOURS",
      "선택한 시간은 프리랜서 상담 가능 시간이 아니에요.",
    )
  if await _slot_overlaps_booking(
    db,
    payload.expert_id,
    booking_day,
    slot_id,
    duration_minutes,
    booking_id,
  ):
    raise AppError(409, "CONSULTING_SLOT_TAKEN", "이미 예약된 시간이에요.")

  category_ids = await _category_ids_for(db, payload.expert_id)
  category_label = None
  if category_ids:
    category_row = await db.fetchrow(
      "select title from consulting_categories where id = $1",
      category_ids[0],
    )
    category_label = category_row["title"] if category_row else None

  concern_label = CONCERN_LABELS.get(payload.concern_id or "")
  scheduled_at = datetime.combine(
    booking_day,
    datetime.strptime(slot_id, "%H:%M").time(),
  )
  weekday = _weekday_label(booking_day)
  date_label = (
    f"{booking_day.month}월 {booking_day.day}일 "
    f"({weekday}) {slot_id}"
  )
  shared_report_ids = list(payload.shared_report_ids or [])
  booking_price = _booking_price(payload, duration)

  try:
    row = await db.fetchrow(
      """
      update consulting_bookings set
        duration_code = $3,
        duration_label = $4,
        duration_minutes = $5,
        category_label = $6,
        scheduled_at = $7,
        scheduled_date = $8,
        slot_start_minutes = $9,
        date_label = $10,
        slot_id = $11,
        concern_id = $12,
        concern_label = $13,
        share_reports = $14,
        shared_report_ids = $15::uuid[],
        question = $16,
        contact_name = $17,
        contact_phone = $18,
        preferred_contact_method = $19,
        session_mode = $20,
        price = $21,
        updated_at = now()
      where id = $1 and user_id = $2
      returning *
      """,
      booking_id,
      user_id,
      duration["code"],
      duration["label"],
      duration_minutes,
      category_label,
      scheduled_at,
      booking_day,
      slot_start_minutes,
      date_label,
      slot_id,
      payload.concern_id,
      concern_label,
      payload.share_reports,
      shared_report_ids,
      (payload.question or "").strip() or None,
      (payload.contact_name or "").strip() or None,
      (payload.contact_phone or "").strip() or None,
      (payload.preferred_contact_method or "").strip() or None,
      payload.session_mode,
      booking_price,
    )
  except asyncpg.exceptions.ExclusionViolationError as error:
    raise AppError(409, "CONSULTING_SLOT_TAKEN", "이미 예약된 시간이에요.") from error

  return _record(row)


async def cancel_booking(db: Database, user_id: str, booking_id: str) -> dict[str, Any]:
  row = await db.fetchrow(
    "select * from consulting_bookings where id = $1 and user_id = $2",
    booking_id,
    user_id,
  )
  if row is None:
    raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")
  if row["status"] == "canceled":
    return _record(row)
  if row["status"] == "completed":
    raise AppError(409, "CONSULTING_BOOKING_COMPLETED", "이미 완료된 상담은 취소할 수 없어요.")

  updated = await db.fetchrow(
    "update consulting_bookings set status = 'canceled' where id = $1 returning *",
    booking_id,
  )
  return _record(updated)


async def update_booking_status(db: Database, booking_id: str, payload: Any) -> dict[str, Any]:
  row = await db.fetchrow(
    "select * from consulting_bookings where id = $1",
    booking_id,
  )
  if row is None:
    raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")

  next_status = payload.status
  if next_status == "completed":
    return await complete_booking(db, booking_id)

  if row["status"] == "completed" and next_status != "completed":
    raise AppError(409, "CONSULTING_BOOKING_COMPLETED", "완료된 상담 상태는 되돌릴 수 없어요.")

  try:
    updated = await db.fetchrow(
      """
      update consulting_bookings
      set status = $2,
          operator_note = $3,
          confirmed_at = case
            when $2 in ('confirmed', 'scheduled', 'in_progress') and confirmed_at is null then now()
            else confirmed_at
          end,
          updated_at = now()
      where id = $1
      returning *
      """,
      booking_id,
      next_status,
      (payload.operator_note or "").strip() or None,
    )
  except asyncpg.exceptions.ExclusionViolationError as error:
    raise AppError(409, "CONSULTING_SLOT_TAKEN", "이미 확정 또는 확인 중인 시간이에요.") from error
  return _record(updated)


async def complete_booking(db: Database, booking_id: str) -> dict[str, Any]:
  row = await db.fetchrow(
    "select * from consulting_bookings where id = $1",
    booking_id,
  )
  if row is None:
    raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")
  if row["status"] == "canceled":
    raise AppError(409, "CONSULTING_BOOKING_CANCELED", "취소된 상담은 완료 처리할 수 없어요.")
  if row["status"] == "completed":
    return await _attach_summary(db, _record(row), row["id"])
  if row["status"] not in {"confirmed", "scheduled", "in_progress"}:
    raise AppError(409, "CONSULTING_BOOKING_NOT_CONFIRMED", "확정 또는 진행 중인 상담만 완료 처리할 수 있어요.")

  updated = await db.fetchrow(
    """
    update consulting_bookings
    set status = 'completed'
    where id = $1
    returning *
    """,
    booking_id,
  )
  await db.execute(
    """
    update consulting_experts
    set session_count = session_count + 1
    where id = $1
    """,
    row["expert_id"],
  )
  return await _attach_summary(db, _record(updated), updated["id"])


def _summary_notes_from_payload(payload: Any) -> list[dict[str, Any]]:
  return [
    {
      "id": note.id or f"note_{index + 1}",
      "label": note.label.strip(),
      "body": note.body.strip(),
    }
    for index, note in enumerate(payload.notes or [])
  ]


def _summary_products_from_payload(payload: Any) -> list[dict[str, Any]]:
  return [
    {
      "id": product.id or f"product_{index + 1}",
      "name": product.name.strip(),
      "category": product.category.strip(),
      "price": product.price,
      "tone": product.tone.strip() or "sand",
    }
    for index, product in enumerate(payload.products or [])
  ]


async def upsert_booking_summary(db: Database, booking_id: str, payload: Any) -> dict[str, Any]:
  row = await db.fetchrow(
    "select * from consulting_bookings where id = $1",
    booking_id,
  )
  if row is None:
    raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")
  if row["status"] == "canceled":
    raise AppError(409, "CONSULTING_BOOKING_CANCELED", "취소된 상담에는 요약을 저장할 수 없어요.")
  if row["status"] not in {"confirmed", "scheduled", "in_progress", "completed"}:
    raise AppError(409, "CONSULTING_BOOKING_NOT_CONFIRMED", "확정 또는 진행 중인 상담에만 요약을 저장할 수 있어요.")

  notes = _summary_notes_from_payload(payload)
  products = _summary_products_from_payload(payload)
  duration_label = (payload.duration_label or row["duration_label"] or "").strip()
  date_label = (payload.date_label or row["date_label"] or "").strip()

  await db.execute(
    """
    insert into consulting_summaries (
      booking_id,
      expert_id,
      duration_label,
      date_label,
      notes,
      products
    )
    values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
    on conflict (booking_id) do update set
      expert_id = excluded.expert_id,
      duration_label = excluded.duration_label,
      date_label = excluded.date_label,
      notes = excluded.notes,
      products = excluded.products
    """,
    booking_id,
    row["expert_id"],
    duration_label,
    date_label,
    json.dumps(notes, ensure_ascii=False),
    json.dumps(products, ensure_ascii=False),
  )

  if row["status"] != "completed":
    updated = await db.fetchrow(
      """
      update consulting_bookings
      set status = 'completed'
      where id = $1
      returning *
      """,
      booking_id,
    )
    await db.execute(
      """
      update consulting_experts
      set session_count = session_count + 1
      where id = $1
      """,
      row["expert_id"],
    )
    return await _attach_summary(db, _record(updated), updated["id"])

  return await _attach_summary(db, _record(row), row["id"])


async def get_booking_summary(db: Database, user_id: str, booking_id: str) -> dict[str, Any]:
  booking = await db.fetchrow(
    "select id from consulting_bookings where id = $1 and user_id = $2",
    booking_id,
    user_id,
  )
  if booking is None:
    raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")

  summary = await db.fetchrow(
    """
    select expert_id, duration_label, date_label, notes, products
    from consulting_summaries
    where booking_id = $1
    """,
    booking_id,
  )
  if summary is None:
    raise AppError(404, "CONSULTING_SUMMARY_NOT_FOUND", "상담 요약이 아직 준비되지 않았어요.")
  return {
    "expert_id": summary["expert_id"],
    "duration_label": summary["duration_label"],
    "date_label": summary["date_label"],
    "notes": _decode_json_list(summary["notes"]),
    "products": _decode_json_list(summary["products"]),
  }


# -----------------------------------------------------------------------------
# Reviews
# -----------------------------------------------------------------------------
async def create_review(
  db: Database,
  user_id: str,
  author_name: str,
  booking_id: str,
  payload: Any,
) -> dict[str, Any]:
  booking = await db.fetchrow(
    "select expert_id, status, category_label from consulting_bookings where id = $1 and user_id = $2",
    booking_id,
    user_id,
  )
  if booking is None:
    raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")
  if booking["status"] != "completed":
    raise AppError(409, "CONSULTING_REVIEW_NOT_ALLOWED", "완료된 상담만 리뷰를 남길 수 있어요.")

  body = payload.body.strip()
  if not body:
    raise AppError(400, "CONSULTING_REVIEW_BODY_REQUIRED", "리뷰 내용을 입력해 주세요.")

  existing = await db.fetchrow(
    """
    select id, author, category, body, rating, date_label
    from consulting_expert_reviews
    where booking_id = $1
    """,
    booking_id,
  )
  if existing is not None:
    raise AppError(409, "CONSULTING_REVIEW_ALREADY_EXISTS", "이미 리뷰를 남긴 상담이에요.")

  review_id = str(uuid4())
  category = (payload.category or booking["category_label"] or "").strip()
  created_date = datetime.now()
  date_label = f"{created_date.month}월 {created_date.day}일"
  review = await db.fetchrow(
    """
    insert into consulting_expert_reviews (
      id, expert_id, booking_id, author, author_user_id, category, body, rating, date_label
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    returning id, author, category, body, rating, date_label
    """,
    review_id,
    booking["expert_id"],
    booking_id,
    author_name,
    user_id,
    category,
    body,
    payload.rating,
    date_label,
  )

  await db.execute(
    """
    update consulting_experts set
      review_count = (select count(*) from consulting_expert_reviews where expert_id = $1),
      rating = coalesce(
        (select round(avg(rating)::numeric, 1) from consulting_expert_reviews where expert_id = $1),
        0
      )
    where id = $1
    """,
    booking["expert_id"],
  )
  return dict(review)


# -----------------------------------------------------------------------------
# Admin operations
# -----------------------------------------------------------------------------
def _resolve_initials(name: str, initials: str | None) -> str:
  value = (initials or "").strip()
  if value:
    return value[:3]

  compact_name = "".join(name.split())
  return compact_name[-2:] if len(compact_name) >= 2 else compact_name or "A"


async def create_admin_expert(db: Database, payload: Any) -> dict[str, Any]:
  if not payload.durations:
    raise AppError(400, "CONSULTING_DURATION_REQUIRED", "상담 시간 옵션을 1개 이상 입력해 주세요.")

  expert_id = (payload.id or f"exp_{uuid4().hex[:8]}").strip()
  if not expert_id:
    raise AppError(400, "CONSULTING_EXPERT_ID_INVALID", "상담사 ID를 확인해 주세요.")

  order_row = await db.fetchrow(
    "select coalesce(max(sort_order) + 1, 0) as sort_order from consulting_experts",
  )
  sort_order = order_row["sort_order"] if order_row else 0
  initials = _resolve_initials(payload.name, payload.initials)

  await db.fetchrow(
    """
    insert into consulting_experts (
      id, name, title, signature_line, initials, avatar_tone, image_url,
      studio_name, career_years, rating, review_count, session_count,
      rebook_rate, response_minutes, intro, availability_note, tags,
      certifications, sort_order, is_active
    )
    values (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, 0, 0, 0,
      0, $10, $11, $12, $13,
      $14, $15, true
    )
    on conflict (id) do update set
      name = excluded.name,
      title = excluded.title,
      signature_line = excluded.signature_line,
      initials = excluded.initials,
      avatar_tone = excluded.avatar_tone,
      image_url = excluded.image_url,
      studio_name = excluded.studio_name,
      career_years = excluded.career_years,
      response_minutes = excluded.response_minutes,
      intro = excluded.intro,
      availability_note = excluded.availability_note,
      tags = excluded.tags,
      certifications = excluded.certifications,
      is_active = true
    returning id
    """,
    expert_id,
    payload.name.strip(),
    payload.title.strip(),
    payload.signature_line.strip(),
    initials,
    payload.avatar_tone,
    (payload.image_url or "").strip() or None,
    (payload.studio_name or "").strip() or None,
    payload.career_years,
    payload.response_minutes,
    payload.intro.strip(),
    payload.availability_note.strip(),
    [tag.strip() for tag in payload.tags if tag.strip()],
    [item.strip() for item in payload.certifications if item.strip()],
    sort_order,
  )

  await db.execute("delete from consulting_expert_categories where expert_id = $1", expert_id)
  category_ids = payload.category_ids or ["personalColor"]
  for category_id in category_ids:
    await db.execute(
      """
      insert into consulting_expert_categories (expert_id, category_id)
      values ($1, $2)
      on conflict (expert_id, category_id) do nothing
      """,
      expert_id,
      category_id,
    )

  await db.execute("delete from consulting_expert_durations where expert_id = $1", expert_id)
  for index, duration in enumerate(payload.durations):
    await db.execute(
      """
      insert into consulting_expert_durations (
        expert_id, code, label, minutes, price, description, recommended, sort_order
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      """,
      expert_id,
      duration.code.strip(),
      duration.label.strip(),
      duration.minutes,
      duration.price,
      duration.description.strip(),
      duration.recommended,
      index,
    )

  await db.execute("delete from consulting_expert_career where expert_id = $1", expert_id)
  for index, career in enumerate(payload.career_history):
    await db.execute(
      """
      insert into consulting_expert_career (expert_id, code, period, role, sort_order)
      values ($1, $2, $3, $4, $5)
      """,
      expert_id,
      career.code.strip() or f"c{index + 1}",
      career.period.strip(),
      career.role.strip(),
      index,
    )

  return await get_expert(db, expert_id)
