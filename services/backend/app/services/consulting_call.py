from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.services.chime_meetings import ChimeMeetingsService


SUPPORTED_LANGUAGE_CODES = {"ko-KR", "en-US"}
JOINABLE_BOOKING_STATUSES = {"confirmed", "scheduled", "in_progress"}
STALE_MEETING_AWS_CODES = {"NotFoundException", "ResourceNotFoundException", "NotFound"}
_DEFAULT_DURATION_MINUTES = 30
logger = logging.getLogger(__name__)


def _log_call_event(event: str, **fields: Any) -> None:
  safe_fields = {
    key: str(value)
    for key, value in fields.items()
    if value is not None
  }
  field_text = " ".join(f"{key}={value}" for key, value in sorted(safe_fields.items()))
  logger.info("consulting_call.%s %s", event, field_text)


def _iso(value: Any) -> str | None:
  if value is None:
    return None
  if isinstance(value, datetime):
    if value.tzinfo is None:
      value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
  return str(value)


def _parse_datetime(value: Any) -> datetime:
  if isinstance(value, datetime):
    result = value
  else:
    try:
      result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as error:
      raise AppError(409, "CONSULTING_CALL_TIME_INVALID", "예약 시간이 올바르지 않아 화상상담을 열 수 없습니다.") from error

  if result.tzinfo is None:
    result = result.replace(tzinfo=timezone.utc)
  return result.astimezone(timezone.utc)


def _duration_minutes(booking: dict[str, Any]) -> int:
  try:
    value = int(booking.get("duration_minutes") or _DEFAULT_DURATION_MINUTES)
  except (TypeError, ValueError):
    value = _DEFAULT_DURATION_MINUTES
  return value if value > 0 else _DEFAULT_DURATION_MINUTES


def _language_code(value: str | None) -> str:
  language_code = (value or "ko-KR").strip()
  if language_code not in SUPPORTED_LANGUAGE_CODES:
    raise AppError(400, "CONSULTING_CALL_LANGUAGE_UNSUPPORTED", "화상상담 언어는 ko-KR 또는 en-US만 지원합니다.")
  return language_code


def _transcription_status(settings: Settings, status: str | None = None) -> str:
  if not settings.effective_consulting_call_transcription_enabled:
    return "disabled"
  return status or "stopped"


def _transcription_mode(row: dict[str, Any] | None) -> str:
  mode = row.get("transcription_mode") if row else None
  return mode if mode in {"fixed", "identify"} else "fixed"


def _is_stale_chime_meeting_error(error: AppError) -> bool:
  if error.code not in {"CHIME_MEETING_GET_FAILED", "CHIME_ATTENDEE_CREATE_FAILED"}:
    return False
  return str(error.details.get("awsCode") or "") in STALE_MEETING_AWS_CODES


def _is_stale_cleanup_error(error: AppError) -> bool:
  if error.code not in {"CHIME_TRANSCRIPTION_STOP_FAILED", "CHIME_MEETING_END_FAILED"}:
    return False
  return str(error.details.get("awsCode") or "") in STALE_MEETING_AWS_CODES


def _external_meeting_id(booking_id: Any, *, recovery: bool = False) -> str:
  base = f"consulting-{booking_id}"
  if not recovery:
    return base

  suffix = datetime.now(timezone.utc).strftime("r%Y%m%d%H%M%S%f")
  max_base_length = max(1, 64 - len(suffix) - 1)
  return f"{base[:max_base_length]}-{suffix}"


def _validate_joinable_booking(
  booking: dict[str, Any],
  *,
  now: datetime,
  settings: Settings,
) -> None:
  if booking.get("status") not in JOINABLE_BOOKING_STATUSES:
    raise AppError(409, "CONSULTING_CALL_BOOKING_NOT_CONFIRMED", "확정 또는 진행 중인 온라인 예약만 화상상담을 시작할 수 있습니다.")

  if booking.get("session_mode") != "online":
    raise AppError(409, "CONSULTING_CALL_OFFLINE_BOOKING", "오프라인 예약은 화상상담을 시작할 수 없습니다.")

  scheduled_at = booking.get("scheduled_at")
  if scheduled_at is None:
    raise AppError(409, "CONSULTING_CALL_TIME_MISSING", "예약 시간이 없어 화상상담을 열 수 없습니다.")

  is_local_environment = settings.environment.strip().lower() in {"local", "dev", "development", "test"}
  if settings.consulting_call_allow_outside_window and is_local_environment:
    return

  starts_at = _parse_datetime(scheduled_at)
  if now.tzinfo is None:
    now = now.replace(tzinfo=timezone.utc)
  now = now.astimezone(timezone.utc)

  latest_at = starts_at + timedelta(
    minutes=_duration_minutes(booking) + settings.consulting_call_join_late_minutes,
  )

  if settings.consulting_call_enforce_early_window:
    earliest_at = starts_at - timedelta(minutes=settings.consulting_call_join_early_minutes)
    if now < earliest_at:
      raise AppError(
        409,
        "CONSULTING_CALL_TOO_EARLY",
        f"예약 시작 {settings.consulting_call_join_early_minutes}분 전부터 화상상담에 입장할 수 있습니다.",
      )
  if now > latest_at:
    raise AppError(409, "CONSULTING_CALL_WINDOW_CLOSED", "화상상담 입장 가능 시간이 지났습니다.")


def _authorize_partner_booking(account: dict[str, Any], booking: dict[str, Any]) -> None:
  role = str(account.get("role") or "expert")
  if role in {"operator", "business_manager"}:
    return

  if str(account.get("expert_id") or "") != str(booking.get("expert_id") or ""):
    raise AppError(403, "CONSULTING_CALL_PARTNER_FORBIDDEN", "해당 예약의 상담사만 화상상담에 입장할 수 있습니다.")


def _session_payload(row: dict[str, Any] | None, settings: Settings, booking_id: str) -> dict[str, Any]:
  return {
    "call_session_id": str(row["id"]) if row else None,
    "booking_id": booking_id,
    "provider": row.get("provider") if row else "chime",
    "provider_meeting_id": row.get("provider_meeting_id") if row else None,
    "media_region": row.get("media_region") if row else settings.effective_chime_media_region,
    "status": row.get("status") if row else "not_started",
    "started_at": _iso(row.get("started_at")) if row else None,
    "ended_at": _iso(row.get("ended_at")) if row else None,
    "chime_enabled": settings.chime_enabled,
    "transcription": _transcription_payload(row, settings),
  }


def _transcription_payload(row: dict[str, Any] | None, settings: Settings) -> dict[str, Any]:
  status = row.get("transcription_status") if row else None
  return {
    "enabled": settings.effective_consulting_call_transcription_enabled,
    "translation_enabled": settings.effective_consulting_call_translation_enabled,
    "status": _transcription_status(settings, status),
    "mode": _transcription_mode(row),
    "language_code": row.get("transcription_language_code") if row else None,
    "customer_language_code": row.get("customer_language_code") if row else "ko-KR",
    "expert_language_code": row.get("expert_language_code") if row else "ko-KR",
  }


async def _customer_booking(db: Database, user_id: str, booking_id: str) -> dict[str, Any]:
  booking = await db.fetchrow(
    """
    select id, user_id, expert_id, status, session_mode, scheduled_at, duration_minutes
    from consulting_bookings
    where id = $1 and user_id = $2
    """,
    booking_id,
    user_id,
  )
  if booking is None:
    raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")
  return booking


async def _partner_booking(db: Database, account: dict[str, Any], booking_id: str) -> dict[str, Any]:
  booking = await db.fetchrow(
    """
    select id, user_id, expert_id, status, session_mode, scheduled_at, duration_minutes
    from consulting_bookings
    where id = $1
    """,
    booking_id,
  )
  if booking is None:
    raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")
  _authorize_partner_booking(account, booking)
  return booking


async def _call_session(db: Database, booking_id: str) -> dict[str, Any] | None:
  return await db.fetchrow(
    """
    select *
    from consulting_call_sessions
    where booking_id = $1
    """,
    booking_id,
  )


async def _create_or_activate_session(
  db: Database,
  booking: dict[str, Any],
  meeting: dict[str, Any],
  settings: Settings,
) -> dict[str, Any]:
  provider_meeting_id = str(meeting["MeetingId"])
  external_meeting_id = str(meeting.get("ExternalMeetingId") or f"consulting-{booking['id']}")
  return await db.fetchrow(
    """
    insert into consulting_call_sessions (
      booking_id, user_id, expert_id, provider, provider_meeting_id,
      provider_external_meeting_id, media_region, status, transcription_status,
      transcription_mode, started_at, expires_at
    )
    values (
      $1, $2, $3, 'chime', $4,
      $5, $6, 'active', $7, 'fixed', now(), $8
    )
    on conflict (booking_id) do update set
      provider_meeting_id = coalesce(consulting_call_sessions.provider_meeting_id, excluded.provider_meeting_id),
      provider_external_meeting_id = coalesce(
        consulting_call_sessions.provider_external_meeting_id,
        excluded.provider_external_meeting_id
      ),
      media_region = coalesce(consulting_call_sessions.media_region, excluded.media_region),
      status = 'active',
      transcription_status = excluded.transcription_status,
      transcription_mode = excluded.transcription_mode,
      started_at = coalesce(consulting_call_sessions.started_at, now()),
      ended_at = null,
      updated_at = now()
    returning *
    """,
    booking["id"],
    booking["user_id"],
    booking["expert_id"],
    provider_meeting_id,
    external_meeting_id,
    settings.effective_chime_media_region,
    "stopped" if settings.effective_consulting_call_transcription_enabled else "disabled",
    _parse_datetime(booking["scheduled_at"]) + timedelta(minutes=_duration_minutes(booking) + 60),
  )


async def _replace_session_meeting(
  db: Database,
  *,
  row: dict[str, Any],
  booking: dict[str, Any],
  meeting: dict[str, Any],
  settings: Settings,
) -> dict[str, Any]:
  provider_meeting_id = str(meeting["MeetingId"])
  external_meeting_id = str(meeting.get("ExternalMeetingId") or _external_meeting_id(booking["id"], recovery=True))
  return await db.fetchrow(
    """
    update consulting_call_sessions
    set provider = 'chime',
        provider_meeting_id = $2,
        provider_external_meeting_id = $3,
        media_region = $4,
        status = 'active',
        transcription_status = $5,
        transcription_mode = 'fixed',
        transcription_language_code = null,
        started_at = case when status = 'ended' then now() else coalesce(started_at, now()) end,
        ended_at = null,
        expires_at = $6,
        updated_at = now()
    where id = $1
    returning *
    """,
    row["id"],
    provider_meeting_id,
    external_meeting_id,
    settings.effective_chime_media_region,
    "stopped" if settings.effective_consulting_call_transcription_enabled else "disabled",
    _parse_datetime(booking["scheduled_at"]) + timedelta(minutes=_duration_minutes(booking) + 60),
  ) or row


async def _recreate_stale_meeting(
  db: Database,
  *,
  booking: dict[str, Any],
  row: dict[str, Any],
  settings: Settings,
  chime: ChimeMeetingsService,
) -> tuple[dict[str, Any], dict[str, Any]]:
  old_provider_meeting_id = row.get("provider_meeting_id")
  meeting = await chime.create_meeting(external_meeting_id=_external_meeting_id(booking["id"], recovery=True))
  updated = await _replace_session_meeting(db, row=row, booking=booking, meeting=meeting, settings=settings)
  _log_call_event(
    "meeting_recreated_after_stale",
    booking_id=booking["id"],
    call_session_id=row.get("id"),
    old_provider_meeting_id=old_provider_meeting_id,
    provider_meeting_id=meeting.get("MeetingId"),
  )
  return meeting, updated


async def _meeting_for_session(
  db: Database,
  booking: dict[str, Any],
  settings: Settings,
  *,
  allow_create: bool,
) -> tuple[dict[str, Any], dict[str, Any]]:
  if not settings.chime_enabled:
    raise AppError(503, "CHIME_NOT_ENABLED", "화상상담 서버 설정이 아직 켜져 있지 않습니다.")

  chime = ChimeMeetingsService(settings)
  row = await _call_session(db, str(booking["id"]))
  if row and row.get("status") == "ended":
    if not allow_create:
      raise AppError(409, "CONSULTING_CALL_WAITING_FOR_EXPERT", "전문가가 새 화상통화를 시작할 때까지 기다려 주세요.")
    return await _recreate_stale_meeting(
      db,
      booking=booking,
      row=row,
      settings=settings,
      chime=chime,
    )

  if row and row.get("provider_meeting_id"):
    _log_call_event(
      "meeting_reuse",
      booking_id=booking["id"],
      call_session_id=row.get("id"),
      status=row.get("status"),
    )
    try:
      meeting = await chime.get_meeting(meeting_id=str(row["provider_meeting_id"]))
    except AppError as error:
      if not _is_stale_chime_meeting_error(error):
        raise
      if not allow_create:
        raise AppError(
          409,
          "CONSULTING_CALL_WAITING_FOR_EXPERT",
          "전문가가 화상통화를 다시 시작할 때까지 기다려 주세요.",
        ) from error
      return await _recreate_stale_meeting(
        db,
        booking=booking,
        row=row,
        settings=settings,
        chime=chime,
      )
    updated = await db.fetchrow(
      """
      update consulting_call_sessions
      set status = 'active',
          started_at = coalesce(started_at, now()),
          ended_at = null,
          updated_at = now()
      where id = $1
      returning *
      """,
      row["id"],
    )
    return meeting, updated or row

  if not allow_create:
    raise AppError(409, "CONSULTING_CALL_WAITING_FOR_EXPERT", "전문가가 화상통화를 시작하면 입장할 수 있어요.")

  meeting = await chime.create_meeting(external_meeting_id=_external_meeting_id(booking["id"]))
  _log_call_event("meeting_created", booking_id=booking["id"])
  session = await _create_or_activate_session(db, booking, meeting, settings)
  session_meeting_id = str(session.get("provider_meeting_id") or "")
  if session_meeting_id and session_meeting_id != str(meeting["MeetingId"]):
    _log_call_event(
      "meeting_race_reused_existing",
      booking_id=booking["id"],
      call_session_id=session.get("id"),
    )
    try:
      meeting = await chime.get_meeting(meeting_id=session_meeting_id)
    except AppError as error:
      if not _is_stale_chime_meeting_error(error):
        raise
      session = await _replace_session_meeting(db, row=session, booking=booking, meeting=meeting, settings=settings)
      _log_call_event(
        "meeting_race_replaced_stale",
        booking_id=booking["id"],
        call_session_id=session.get("id"),
        provider_meeting_id=meeting.get("MeetingId"),
      )
  return meeting, session


async def join_customer_call(
  db: Database,
  user_id: str,
  booking_id: str,
  language_code: str | None,
  settings: Settings,
) -> dict[str, Any]:
  booking = await _customer_booking(db, user_id, booking_id)
  _validate_joinable_booking(booking, now=datetime.now(timezone.utc), settings=settings)
  return await _join_call(
    db,
    booking,
    participant_type="customer",
    participant_id=user_id,
    language_code=language_code,
    settings=settings,
  )


async def join_partner_call(
  db: Database,
  account: dict[str, Any],
  booking_id: str,
  language_code: str | None,
  settings: Settings,
) -> dict[str, Any]:
  booking = await _partner_booking(db, account, booking_id)
  _validate_joinable_booking(booking, now=datetime.now(timezone.utc), settings=settings)
  return await _join_call(
    db,
    booking,
    participant_type="partner",
    participant_id=str(account.get("id") or account.get("account_id") or account.get("expert_id") or "partner"),
    language_code=language_code,
    settings=settings,
  )


async def _join_call(
  db: Database,
  booking: dict[str, Any],
  *,
  participant_type: str,
  participant_id: str,
  language_code: str | None,
  settings: Settings,
) -> dict[str, Any]:
  normalized_language_code = _language_code(language_code)
  allow_create = participant_type == "partner"
  meeting, session = await _meeting_for_session(db, booking, settings, allow_create=allow_create)
  language_column = "customer_language_code" if participant_type == "customer" else "expert_language_code"
  session = await db.fetchrow(
    f"""
    update consulting_call_sessions
    set {language_column} = $2,
        updated_at = now()
    where id = $1
    returning *
    """,
    session["id"],
    normalized_language_code,
  ) or session
  chime = ChimeMeetingsService(settings)
  external_user_id = f"{participant_type}:{booking['id']}"
  try:
    attendee = await chime.create_attendee(
      meeting_id=str(meeting["MeetingId"]),
      external_user_id=external_user_id,
    )
  except AppError as error:
    if not _is_stale_chime_meeting_error(error):
      raise
    if not allow_create:
      raise AppError(
        409,
        "CONSULTING_CALL_WAITING_FOR_EXPERT",
        "전문가가 화상통화를 다시 시작할 때까지 기다려 주세요.",
      ) from error
    meeting, session = await _recreate_stale_meeting(
      db,
      booking=booking,
      row=session,
      settings=settings,
      chime=chime,
    )
    attendee = await chime.create_attendee(
      meeting_id=str(meeting["MeetingId"]),
      external_user_id=external_user_id,
    )
  _log_call_event(
    "participant_joined",
    booking_id=booking["id"],
    call_session_id=session.get("id"),
    language_code=normalized_language_code,
    participant_type=participant_type,
    transcription_status=_transcription_payload(session, settings)["status"],
  )
  plan_participant_type = "user" if participant_type == "customer" else "expert"
  return {
    "call_session_id": str(session["id"]),
    "booking_id": str(booking["id"]),
    "participant_type": plan_participant_type,
    "participant_language_code": normalized_language_code,
    "supported_language_codes": sorted(SUPPORTED_LANGUAGE_CODES),
    "participant": {
      "id": participant_id,
      "type": participant_type,
      "language_code": normalized_language_code,
    },
    "meeting": meeting,
    "attendee": attendee,
    "transcription": _transcription_payload(session, settings),
    "transcription_status": _transcription_payload(session, settings)["status"],
    "transcription_mode": _transcription_mode(session),
  }


async def get_customer_call_state(db: Database, user_id: str, booking_id: str, settings: Settings) -> dict[str, Any]:
  await _customer_booking(db, user_id, booking_id)
  return _session_payload(await _call_session(db, booking_id), settings, booking_id)


async def get_partner_call_state(db: Database, account: dict[str, Any], booking_id: str, settings: Settings) -> dict[str, Any]:
  await _partner_booking(db, account, booking_id)
  return _session_payload(await _call_session(db, booking_id), settings, booking_id)


async def end_customer_call(db: Database, user_id: str, booking_id: str, settings: Settings) -> dict[str, Any]:
  booking = await _customer_booking(db, user_id, booking_id)
  call = await _end_call(db, booking_id, settings)
  account = await db.fetchrow(
    """
    select a.*, e.name as expert_name
    from consulting_partner_accounts a
    join consulting_experts e on e.id = a.expert_id
    where a.expert_id = $1 and a.status in ('invited', 'active')
    order by a.created_at asc
    limit 1
    """,
    booking["expert_id"],
  )
  if account is not None:
    try:
      call["summary_status"] = await _complete_booking_after_call(
        db,
        dict(account),
        booking_id,
      )
    except Exception:
      logger.exception("consulting_call.customer_summary_after_end_failed booking_id=%s", booking_id)
      call["summary_status"] = "failed"
      await db.execute(
        "update consulting_bookings set status = 'completed', updated_at = now() where id = $1",
        booking_id,
      )
  else:
    call["summary_status"] = "failed"
    await db.execute(
      "update consulting_bookings set status = 'completed', updated_at = now() where id = $1",
      booking_id,
    )
  _log_call_event(
    "customer_ended",
    booking_id=booking_id,
    call_session_id=call.get("call_session_id"),
    status=call.get("status"),
  )
  return call


async def end_partner_call(
  db: Database,
  account: dict[str, Any],
  booking_id: str,
  settings: Settings,
  *,
  transcript: str | None = None,
) -> dict[str, Any]:
  await _partner_booking(db, account, booking_id)
  call = await _end_call(db, booking_id, settings)
  try:
    call["summary_status"] = await _complete_booking_after_call(
      db,
      account,
      booking_id,
      transcript=transcript,
    )
  except Exception:  # Call teardown must succeed even if summary persistence fails.
    logger.exception("consulting_call.summary_after_end_failed booking_id=%s", booking_id)
    call["summary_status"] = "failed"
  return call


async def _complete_booking_after_call(
  db: Database,
  account: dict[str, Any],
  booking_id: str,
  *,
  transcript: str | None = None,
) -> str:
  from app.services import consulting_partner

  existing_summary = await consulting_partner.consultation_summary_for_booking(db, booking_id)
  if existing_summary is not None:
    return "succeeded"

  completed = await db.fetchrow(
    """
    update consulting_bookings
    set status = 'completed',
        updated_at = now()
    where id = $1
      and status in ('confirmed', 'scheduled', 'in_progress')
    returning expert_id
    """,
    booking_id,
  )
  if completed is not None:
    await db.execute(
      """
      update consulting_experts
      set session_count = session_count + 1
      where id = $1
      """,
      completed["expert_id"],
    )

  clean_transcript = (transcript or "").strip()
  if not clean_transcript:
    transcript_rows = await db.fetch(
      """
      select coalesce(nullif(content, ''), nullif(source_text, '')) as content
      from consulting_transcript_segments
      where booking_id = $1 and is_partial = false
      order by created_at asc
      """,
      booking_id,
    )
    clean_transcript = "\n".join(
      str(row["content"]).strip()
      for row in transcript_rows
      if row.get("content") and str(row["content"]).strip()
    )
  if not clean_transcript:
    clean_transcript = "화상 상담이 정상적으로 완료되었습니다. 상담사가 확인한 내용을 기준으로 후속 안내를 제공합니다."

  await consulting_partner.complete_consultation_summary(
    db,
    account,
    booking_id,
    transcript=clean_transcript,
    visible_to_customer=True,
    send_review_request=True,
  )
  return "succeeded"


async def _end_call(db: Database, booking_id: str, settings: Settings) -> dict[str, Any]:
  session = await _call_session(db, booking_id)
  if session is None:
    return _session_payload(None, settings, booking_id)

  provider_meeting_id = session.get("provider_meeting_id")
  if settings.chime_enabled and provider_meeting_id and session.get("status") != "ended":
    chime = ChimeMeetingsService(settings)
    if session.get("transcription_status") == "active":
      try:
        await chime.stop_transcription(meeting_id=str(provider_meeting_id))
        _log_call_event("transcription_stopped_for_end", booking_id=booking_id, call_session_id=session.get("id"))
      except AppError as error:
        if not _is_stale_cleanup_error(error):
          raise
        _log_call_event(
          "transcription_stop_skipped_stale_meeting",
          booking_id=booking_id,
          call_session_id=session.get("id"),
          provider_meeting_id=provider_meeting_id,
        )

    try:
      await chime.delete_meeting(meeting_id=str(provider_meeting_id))
      _log_call_event("meeting_deleted", booking_id=booking_id, call_session_id=session.get("id"))
    except AppError as error:
      if not _is_stale_cleanup_error(error):
        raise
      _log_call_event(
        "meeting_delete_skipped_stale_meeting",
        booking_id=booking_id,
        call_session_id=session.get("id"),
        provider_meeting_id=provider_meeting_id,
      )

  updated = await db.fetchrow(
    """
    update consulting_call_sessions
    set status = 'ended',
        transcription_status = case
          when transcription_status = 'disabled' then 'disabled'
          else 'stopped'
        end,
        ended_at = coalesce(ended_at, now()),
        updated_at = now()
    where booking_id = $1
    returning *
    """,
    booking_id,
  )
  _log_call_event(
    "ended",
    booking_id=booking_id,
    call_session_id=(updated or session).get("id"),
    status=(updated or session).get("status"),
  )
  return _session_payload(updated or session, settings, booking_id)


async def start_partner_transcription(
  db: Database,
  account: dict[str, Any],
  booking_id: str,
  language_code: str | None,
  transcription_consent_accepted: bool,
  settings: Settings,
) -> dict[str, Any]:
  await _partner_booking(db, account, booking_id)
  if not transcription_consent_accepted:
    raise AppError(
      400,
      "CONSULTING_CALL_TRANSCRIPTION_CONSENT_REQUIRED",
      "실시간 자막을 시작하려면 고객과 상담사의 음성 인식 동의 확인이 필요합니다.",
    )

  session = await _call_session(db, booking_id)
  if session is None or not session.get("provider_meeting_id"):
    raise AppError(409, "CONSULTING_CALL_NOT_STARTED", "화상상담 입장 후 실시간 자막을 시작할 수 있습니다.")
  if session.get("transcription_status") in {"active", "starting"}:
    return _session_payload(session, settings, booking_id)

  normalized_language_code = _language_code(language_code)
  _log_call_event(
    "transcription_start_requested",
    booking_id=booking_id,
    call_session_id=session.get("id"),
    expert_language_code=normalized_language_code,
  )
  session = await db.fetchrow(
    """
    update consulting_call_sessions
    set expert_language_code = $2,
        transcription_status = 'starting',
        updated_at = now()
    where booking_id = $1
    returning *
    """,
    booking_id,
    normalized_language_code,
  ) or session
  try:
    transcription_mode, transcription_language_code = await ChimeMeetingsService(settings).start_transcription(
      meeting_id=str(session["provider_meeting_id"]),
      participant_languages={
        "customer": str(session.get("customer_language_code") or "ko-KR"),
        "partner": str(session.get("expert_language_code") or normalized_language_code),
      },
    )
  except AppError:
    await db.fetchrow(
      """
      update consulting_call_sessions
      set transcription_status = 'failed',
          updated_at = now()
      where booking_id = $1
      returning *
      """,
      booking_id,
    )
    _log_call_event(
      "transcription_start_failed",
      booking_id=booking_id,
      call_session_id=session.get("id"),
    )
    raise
  updated = await db.fetchrow(
    """
    update consulting_call_sessions
    set transcription_status = 'active',
        transcription_language_code = $2,
        transcription_mode = $3,
        updated_at = now()
    where booking_id = $1
    returning *
    """,
    booking_id,
    transcription_language_code,
    transcription_mode,
  )
  _log_call_event(
    "transcription_active",
    booking_id=booking_id,
    call_session_id=(updated or session).get("id"),
    mode=transcription_mode,
    language_code=transcription_language_code,
  )
  return _session_payload(updated or session, settings, booking_id)


async def start_customer_transcription(
  db: Database,
  user_id: str,
  booking_id: str,
  language_code: str | None,
  source_language_code: str | None,
  transcription_consent_accepted: bool,
  settings: Settings,
) -> dict[str, Any]:
  await _customer_booking(db, user_id, booking_id)
  if not transcription_consent_accepted:
    raise AppError(
      400,
      "CONSULTING_CALL_TRANSCRIPTION_CONSENT_REQUIRED",
      "실시간 번역을 시작하려면 음성 인식 동의가 필요합니다.",
    )

  session = await _call_session(db, booking_id)
  if session is None or not session.get("provider_meeting_id"):
    raise AppError(409, "CONSULTING_CALL_NOT_STARTED", "화상상담 입장 후 실시간 번역을 시작할 수 있습니다.")
  if session.get("transcription_status") in {"active", "starting"}:
    return _session_payload(session, settings, booking_id)

  customer_language_code = _language_code(language_code)
  expert_language_code = _language_code(
    source_language_code or str(session.get("expert_language_code") or "ko-KR")
  )
  _log_call_event(
    "customer_transcription_start_requested",
    booking_id=booking_id,
    call_session_id=session.get("id"),
    customer_language_code=customer_language_code,
    expert_language_code=expert_language_code,
  )
  session = await db.fetchrow(
    """
    update consulting_call_sessions
    set customer_language_code = $2,
        expert_language_code = $3,
        transcription_status = 'starting',
        updated_at = now()
    where booking_id = $1
    returning *
    """,
    booking_id,
    customer_language_code,
    expert_language_code,
  ) or session
  try:
    transcription_mode, transcription_language_code = await ChimeMeetingsService(settings).start_transcription(
      meeting_id=str(session["provider_meeting_id"]),
      participant_languages={
        "customer": customer_language_code,
        "partner": expert_language_code,
      },
    )
  except AppError:
    await db.fetchrow(
      """
      update consulting_call_sessions
      set transcription_status = 'failed',
          updated_at = now()
      where booking_id = $1
      returning *
      """,
      booking_id,
    )
    _log_call_event(
      "customer_transcription_start_failed",
      booking_id=booking_id,
      call_session_id=session.get("id"),
    )
    raise
  updated = await db.fetchrow(
    """
    update consulting_call_sessions
    set transcription_status = 'active',
        transcription_language_code = $2,
        transcription_mode = $3,
        updated_at = now()
    where booking_id = $1
    returning *
    """,
    booking_id,
    transcription_language_code,
    transcription_mode,
  )
  _log_call_event(
    "customer_transcription_active",
    booking_id=booking_id,
    call_session_id=(updated or session).get("id"),
    mode=transcription_mode,
    language_code=transcription_language_code,
  )
  return _session_payload(updated or session, settings, booking_id)


async def stop_partner_transcription(
  db: Database,
  account: dict[str, Any],
  booking_id: str,
  settings: Settings,
) -> dict[str, Any]:
  await _partner_booking(db, account, booking_id)
  session = await _call_session(db, booking_id)
  if session is None or not session.get("provider_meeting_id"):
    raise AppError(409, "CONSULTING_CALL_NOT_STARTED", "화상상담 입장 후 실시간 자막을 중지할 수 있습니다.")

  await db.fetchrow(
    """
    update consulting_call_sessions
    set transcription_status = 'stopping',
        updated_at = now()
    where booking_id = $1
    returning *
    """,
    booking_id,
  )
  _log_call_event("transcription_stop_requested", booking_id=booking_id, call_session_id=session.get("id"))
  try:
    await ChimeMeetingsService(settings).stop_transcription(meeting_id=str(session["provider_meeting_id"]))
  except AppError:
    await db.fetchrow(
      """
      update consulting_call_sessions
      set transcription_status = 'failed',
          updated_at = now()
      where booking_id = $1
      returning *
      """,
      booking_id,
    )
    _log_call_event(
      "transcription_stop_failed",
      booking_id=booking_id,
      call_session_id=session.get("id"),
    )
    raise
  updated = await db.fetchrow(
    """
    update consulting_call_sessions
    set transcription_status = 'stopped',
        updated_at = now()
    where booking_id = $1
    returning *
    """,
    booking_id,
  )
  _log_call_event(
    "transcription_stopped",
    booking_id=booking_id,
    call_session_id=(updated or session).get("id"),
  )
  return _session_payload(updated or session, settings, booking_id)


async def translate_partner_caption(
  db: Database,
  account: dict[str, Any],
  booking_id: str,
  *,
  result_id: str,
  source_language_code: str,
  content: str,
  is_partial: bool = False,
  settings: Settings,
) -> dict[str, Any]:
  await _partner_booking(db, account, booking_id)
  return await _translate_caption(
    db,
    booking_id,
    participant_type="partner",
    participant_id=str(account.get("id") or account.get("account_id") or account.get("expert_id") or "partner"),
    result_id=result_id,
    source_language_code=source_language_code,
    content=content,
    is_partial=is_partial,
    settings=settings,
  )


async def translate_customer_caption(
  db: Database,
  user_id: str,
  booking_id: str,
  *,
  result_id: str,
  source_language_code: str,
  content: str,
  is_partial: bool = False,
  settings: Settings,
) -> dict[str, Any]:
  await _customer_booking(db, user_id, booking_id)
  return await _translate_caption(
    db,
    booking_id,
    participant_type="customer",
    participant_id=user_id,
    result_id=result_id,
    source_language_code=source_language_code,
    content=content,
    is_partial=is_partial,
    settings=settings,
  )


async def _translate_caption(
  db: Database,
  booking_id: str,
  *,
  participant_type: str,
  participant_id: str,
  result_id: str,
  source_language_code: str,
  content: str,
  is_partial: bool,
  settings: Settings,
) -> dict[str, Any]:
  session = await _call_session(db, booking_id)
  if session is None:
    raise AppError(409, "CONSULTING_CALL_NOT_STARTED", "화상상담 입장 후 자막을 번역할 수 있습니다.")

  normalized_language_code = _language_code(source_language_code)
  retain_transcript = not is_partial and settings.consulting_transcript_retention_days > 0
  if not retain_transcript:
    translated = await ChimeMeetingsService(settings).translate_final_caption(
      source_language_code=normalized_language_code,
      content=content,
    )
    _log_call_event(
      "caption_partial_translated" if is_partial else "caption_translated",
      booking_id=booking_id,
      call_session_id=session.get("id"),
      result_id=result_id,
      retained=False,
      is_partial=is_partial,
      source_language_code=normalized_language_code,
      target_language_code=translated["target_language_code"],
    )
    return {
      "result_id": result_id,
      "source_language_code": normalized_language_code,
      "target_language_code": translated["target_language_code"],
      "translated_content": translated["translated_content"],
    }

  existing = await db.fetchrow(
    """
    select result_id, source_language_code, target_language_code, translated_content
    from consulting_transcript_segments
    where call_session_id = $1 and result_id = $2 and is_partial = false
    """,
    session["id"],
    result_id,
  )
  if existing and existing.get("translated_content"):
    _log_call_event(
      "caption_translation_reused",
      booking_id=booking_id,
      call_session_id=session.get("id"),
      result_id=result_id,
      source_language_code=existing.get("source_language_code"),
      target_language_code=existing.get("target_language_code"),
    )
    return {
      "result_id": str(existing["result_id"]),
      "source_language_code": str(existing["source_language_code"]),
      "target_language_code": str(existing["target_language_code"]),
      "translated_content": str(existing["translated_content"]),
    }

  translated = await ChimeMeetingsService(settings).translate_final_caption(
    source_language_code=normalized_language_code,
    content=content,
  )
  stored = await db.fetchrow(
    f"""
    insert into consulting_transcript_segments (
      call_session_id, booking_id, participant_type, participant_id,
      language_code, source_text, translated_text, is_partial,
      result_id, speaker_type, source_language_code, content,
      target_language_code, translated_content
    )
    values (
      $1, $2, '{participant_type}', $3,
      $4, $5, $6, false,
      $7, 'unknown', $4, $5,
      $8, $6
    )
    on conflict (call_session_id, result_id) where result_id is not null do update set
      translated_text = excluded.translated_text,
      translated_content = excluded.translated_content
    returning result_id, source_language_code, target_language_code, translated_content
    """,
    session["id"],
    booking_id,
    participant_id,
    normalized_language_code,
    content,
    translated["translated_content"],
    result_id,
    translated["target_language_code"],
  )
  row = stored or {
    "result_id": result_id,
    "source_language_code": normalized_language_code,
    "target_language_code": translated["target_language_code"],
    "translated_content": translated["translated_content"],
  }
  _log_call_event(
    "caption_translated",
    booking_id=booking_id,
    call_session_id=session.get("id"),
    result_id=result_id,
    source_language_code=row["source_language_code"],
    target_language_code=row["target_language_code"],
  )
  return {
    "result_id": str(row["result_id"]),
    "source_language_code": str(row["source_language_code"]),
    "target_language_code": str(row["target_language_code"]),
    "translated_content": str(row["translated_content"]),
  }
