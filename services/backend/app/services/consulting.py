"""Consulting feature data access and business logic.

Raw asyncpg SQL following the existing backend conventions. All dict keys are
snake_case and get converted to camelCase by ``app.core.responses.success``.
"""

import asyncio
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
_BOOKING_WINDOW_DAYS = 31
_BOOKING_START_MINUTE = 10 * 60
_BOOKING_END_MINUTE = 20 * 60
_BOOKING_INTERVAL_MINUTES = 30


def _weekday_label(value: Any) -> str:
  return _WEEKDAYS_KO[value.weekday()]


def _today_kst() -> date:
  return datetime.now(_KST).date()


def _booking_slot_labels() -> tuple[str, ...]:
  return tuple(
    f"{minute_offset // 60:02d}:{minute_offset % 60:02d}"
    for minute_offset in range(
      _BOOKING_START_MINUTE,
      _BOOKING_END_MINUTE + 1,
      _BOOKING_INTERVAL_MINUTES,
    )
  )


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


def _validate_booking_day(day_id: date) -> date:
  today = _today_kst()
  last_day = today + timedelta(days=_BOOKING_WINDOW_DAYS - 1)
  if day_id < today or day_id > last_day:
    raise AppError(400, "CONSULTING_DAY_OUT_OF_RANGE", "예약은 오늘부터 한 달 안에서 선택해 주세요.")
  return day_id


def _build_booking_days(
  booked_intervals_by_day: dict[str, list[tuple[int, int]]] | None = None,
  duration_minutes: int = 30,
  start_day: date | None = None,
) -> list[dict[str, Any]]:
  booked_intervals_by_day = booked_intervals_by_day or {}
  first_day = start_day or _today_kst()
  slot_labels = _booking_slot_labels()

  days: list[dict[str, Any]] = []
  for day_offset in range(_BOOKING_WINDOW_DAYS):
    slot_date = first_day + timedelta(days=day_offset)
    day_id = slot_date.isoformat()
    booked_intervals = booked_intervals_by_day.get(day_id, [])
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
  if start_minute + duration_minutes > _BOOKING_END_MINUTE:
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
        and status = 'upcoming'
        and slot_id is not null
        and id <> $3::uuid
      """,
      expert_id,
      day_id,
      exclude_booking_id,
    )
  else:
    rows = await db.fetch(
      """
      select slot_id, duration_minutes
      from consulting_bookings
      where expert_id = $1
        and coalesce(scheduled_date, scheduled_at::date) = $2::date
        and status = 'upcoming'
        and slot_id is not null
      """,
      expert_id,
      day_id,
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
async def _durations_for(db: Database, expert_id: str) -> list[dict[str, Any]]:
  return await db.fetch(
    """
    select code as id, label, minutes, price, description, recommended
    from consulting_expert_durations
    where expert_id = $1
    order by sort_order, minutes
    """,
    expert_id,
  )


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
    grouped.setdefault(expert_id, []).append(
      {key: value for key, value in row.items() if key != "expert_id"},
    )
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
  exists = await db.fetchrow(
    "select 1 from consulting_experts where id = $1 and is_active = true",
    expert_id,
  )
  if exists is None:
    raise AppError(404, "CONSULTING_EXPERT_NOT_FOUND", "전문가를 찾을 수 없어요.")

  duration_minutes = await _duration_minutes_for(db, expert_id, duration_id)
  first_day = _today_kst()
  last_day = first_day + timedelta(days=_BOOKING_WINDOW_DAYS - 1)
  rows = await db.fetch(
    """
    select coalesce(scheduled_date, scheduled_at::date) as booked_date,
           slot_id,
           duration_minutes
    from consulting_bookings
    where expert_id = $1
      and status = 'upcoming'
      and coalesce(scheduled_date, scheduled_at::date) between $2::date and $3::date
      and slot_id is not null
    order by scheduled_at
    """,
    expert_id,
    first_day,
    last_day,
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
  return _build_booking_days(booked_intervals_by_day, duration_minutes, first_day)


# -----------------------------------------------------------------------------
# Home aggregate
# -----------------------------------------------------------------------------
async def get_home(db: Database, user_id: str) -> dict[str, Any]:
  categories, experts, upcoming = await asyncio.gather(
    list_categories(db),
    list_experts(db),
    _upcoming_booking(db, user_id),
  )
  return {
    "categories": categories,
    "experts": experts,
    "upcoming_record": upcoming,
  }


# -----------------------------------------------------------------------------
# Bookings
# -----------------------------------------------------------------------------
def _record(row: dict[str, Any]) -> dict[str, Any]:
  scheduled_at = row.get("scheduled_at")
  scheduled_date = row.get("scheduled_date")
  shared_report_ids = row.get("shared_report_ids") or []
  return {
    "id": str(row["id"]),
    "expert_id": row["expert_id"],
    "duration_id": row.get("duration_code"),
    "day_id": scheduled_date.isoformat()
    if scheduled_date is not None
    else scheduled_at.date().isoformat()
    if scheduled_at is not None
    else None,
    "slot_id": row.get("slot_id"),
    "status": row["status"],
    "category_label": row["category_label"],
    "date_label": row["date_label"],
    "duration_label": row["duration_label"],
    "shared_report_ids": [str(report_id) for report_id in shared_report_ids],
    "review_id": row.get("review_id"),
  }


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


async def _upcoming_booking(db: Database, user_id: str) -> dict[str, Any] | None:
  row = await db.fetchrow(
    """
    select b.*, r.id as review_id
    from consulting_bookings b
    left join consulting_expert_reviews r
      on r.booking_id = b.id and r.author_user_id = $1
    where b.user_id = $1 and b.status = 'upcoming'
    order by b.scheduled_at asc nulls last, b.created_at asc
    limit 1
    """,
    user_id,
  )
  return _record(row) if row else None


async def list_bookings(
  db: Database,
  user_id: str,
  status: str | None = None,
) -> list[dict[str, Any]]:
  if status and status != "all":
    rows = await db.fetch(
      """
      select b.*, r.id as review_id
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
      select b.*, r.id as review_id
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
    select b.*, r.id as review_id
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


async def create_booking(db: Database, user_id: str, payload: Any) -> dict[str, Any]:
  expert = await db.fetchrow(
    "select id, title from consulting_experts where id = $1 and is_active = true",
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

  booking_day = _validate_booking_day(payload.day_id)
  slot_id = _coerce_booking_slot_id(payload.slot_id)
  slot_start_minutes = _slot_label_to_minutes(slot_id)
  duration_minutes = int(duration["minutes"])
  if not _slot_available_for_duration(slot_id, duration_minutes, []):
    raise AppError(400, "CONSULTING_SLOT_INVALID", "선택한 시간은 상담 길이에 맞지 않아요.")
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

  try:
    row = await db.fetchrow(
      """
      insert into consulting_bookings (
        user_id, expert_id, duration_code, duration_label, duration_minutes,
        category_label, scheduled_at, scheduled_date, slot_start_minutes,
        date_label, slot_id, concern_id, concern_label,
        share_reports, shared_report_ids, question, status, price
      )
      values (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15::uuid[], $16, 'upcoming', $17
      )
      returning *
      """,
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
      duration["price"],
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
  if current["status"] != "upcoming":
    raise AppError(409, "CONSULTING_BOOKING_NOT_UPCOMING", "예정된 상담만 수정할 수 있어요.")
  if current["expert_id"] != payload.expert_id:
    raise AppError(400, "CONSULTING_EXPERT_CHANGE_UNSUPPORTED", "전문가 변경은 새 예약으로 진행해 주세요.")

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

  booking_day = _validate_booking_day(payload.day_id)
  slot_id = _coerce_booking_slot_id(payload.slot_id)
  slot_start_minutes = _slot_label_to_minutes(slot_id)
  duration_minutes = int(duration["minutes"])
  if not _slot_available_for_duration(slot_id, duration_minutes, []):
    raise AppError(400, "CONSULTING_SLOT_INVALID", "선택한 시간은 상담 길이에 맞지 않아요.")
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
        price = $17,
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
      duration["price"],
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


async def delete_canceled_booking(db: Database, user_id: str, booking_id: str) -> None:
  row = await db.fetchrow(
    "select id, status from consulting_bookings where id = $1 and user_id = $2",
    booking_id,
    user_id,
  )
  if row is None:
    raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")
  if row["status"] != "canceled":
    raise AppError(409, "CONSULTING_BOOKING_DELETE_REQUIRES_CANCELED", "취소된 예약만 삭제할 수 있어요.")

  await db.execute(
    "delete from consulting_bookings where id = $1 and user_id = $2 and status = 'canceled'",
    booking_id,
    user_id,
  )


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


# -----------------------------------------------------------------------------
# Membership
# -----------------------------------------------------------------------------
async def list_membership_plans(db: Database) -> list[dict[str, Any]]:
  return await db.fetch(
    """
    select id, name, tagline, price_per_month, original_price_per_month,
           benefits, badge, highlight
    from consulting_membership_plans
    where is_active = true
    order by sort_order, price_per_month
    """,
  )


async def get_my_membership(db: Database, user_id: str) -> dict[str, Any] | None:
  return await db.fetchrow(
    """
    select m.id, m.plan_id, m.status, m.started_at, m.current_period_end,
           p.name as plan_name, p.price_per_month
    from user_consulting_memberships m
    join consulting_membership_plans p on p.id = m.plan_id
    where m.user_id = $1 and m.status = 'active'
    order by m.created_at desc
    limit 1
    """,
    user_id,
  )


async def subscribe_membership(db: Database, user_id: str, payload: Any) -> dict[str, Any]:
  plan = await db.fetchrow(
    "select id, name, price_per_month from consulting_membership_plans where id = $1 and is_active = true",
    payload.plan_id,
  )
  if plan is None:
    raise AppError(404, "CONSULTING_PLAN_NOT_FOUND", "멤버십 플랜을 찾을 수 없어요.")

  # Deactivate any existing active membership before subscribing to a new one.
  await db.execute(
    "update user_consulting_memberships set status = 'canceled' where user_id = $1 and status = 'active'",
    user_id,
  )

  period_end = datetime.now() + timedelta(days=30)
  membership = await db.fetchrow(
    """
    insert into user_consulting_memberships (user_id, plan_id, status, current_period_end)
    values ($1, $2, 'active', $3)
    returning id, plan_id, status, started_at, current_period_end
    """,
    user_id,
    plan["id"],
    period_end,
  )

  payment = await _record_payment(
    db,
    user_id=user_id,
    kind="membership",
    option_id=plan["id"],
    amount=plan["price_per_month"],
    booking_id=None,
    membership_id=membership["id"],
    method=payload.method,
  )

  result = dict(membership)
  result["plan_name"] = plan["name"]
  result["payment"] = payment
  return result


# -----------------------------------------------------------------------------
# Payments (records the payment; the real PG charge is a stub for now)
# -----------------------------------------------------------------------------
_OPTION_MULTIPLIER = {"single": 1, "package3": 3}


async def _record_payment(
  db: Database,
  *,
  user_id: str,
  kind: str,
  option_id: str | None,
  amount: int,
  booking_id: Any,
  membership_id: Any,
  method: str | None,
) -> dict[str, Any]:
  # NOTE: This marks the payment as paid without calling a real payment
  # gateway. Wire a PG provider (Toss/PortOne) here and set status from its
  # result once merchant credentials are available.
  row = await db.fetchrow(
    """
    insert into consulting_payments (
      user_id, kind, option_id, booking_id, membership_id,
      amount, currency, status, method, pg_provider
    )
    values ($1, $2, $3, $4, $5, $6, 'KRW', 'paid', $7, 'stub')
    returning id, kind, option_id, amount, currency, status, method, created_at
    """,
    user_id,
    kind,
    option_id,
    booking_id,
    membership_id,
    amount,
    method,
  )
  result = dict(row)
  result["id"] = str(result["id"])
  return result


async def create_payment(db: Database, user_id: str, payload: Any) -> dict[str, Any]:
  if payload.kind == "booking":
    if payload.booking_id is None:
      raise AppError(400, "CONSULTING_PAYMENT_INVALID", "결제할 예약이 필요해요.")
    booking = await db.fetchrow(
      "select id, price from consulting_bookings where id = $1 and user_id = $2",
      str(payload.booking_id),
      user_id,
    )
    if booking is None:
      raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")
    multiplier = _OPTION_MULTIPLIER.get(payload.option_id or "single", 1)
    amount = booking["price"] * multiplier
    return await _record_payment(
      db,
      user_id=user_id,
      kind="booking",
      option_id=payload.option_id or "single",
      amount=amount,
      booking_id=booking["id"],
      membership_id=None,
      method=payload.method,
    )

  if payload.kind == "membership":
    if payload.plan_id is None:
      raise AppError(400, "CONSULTING_PAYMENT_INVALID", "결제할 멤버십 플랜이 필요해요.")
    plan = await db.fetchrow(
      "select id, price_per_month from consulting_membership_plans where id = $1 and is_active = true",
      payload.plan_id,
    )
    if plan is None:
      raise AppError(404, "CONSULTING_PLAN_NOT_FOUND", "멤버십 플랜을 찾을 수 없어요.")
    return await _record_payment(
      db,
      user_id=user_id,
      kind="membership",
      option_id=plan["id"],
      amount=plan["price_per_month"],
      booking_id=None,
      membership_id=None,
      method=payload.method,
    )

  raise AppError(400, "CONSULTING_PAYMENT_INVALID", "결제 종류를 확인해 주세요.")
