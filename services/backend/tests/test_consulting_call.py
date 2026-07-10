from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from botocore.exceptions import ClientError

from app.core.errors import AppError
from app.core.settings import Settings
from app.services import chime_meetings
from app.services.chime_meetings import ChimeMeetingsService
from app.services import consulting_call


class FakeChimeMeetingsService:
  created_external_meeting_ids: list[str] = []
  attendee_external_user_ids: list[str] = []
  deleted_meeting_ids: list[str] = []
  get_meeting_ids: list[str] = []
  operation_events: list[str] = []
  stopped_transcription_meeting_ids: list[str] = []
  stale_delete_meeting_ids: set[str] = set()
  stale_get_meeting_ids: set[str] = set()
  stale_attendee_meeting_ids: set[str] = set()
  stale_stop_transcription_meeting_ids: set[str] = set()

  def __init__(self, settings: Settings) -> None:
    self.settings = settings

  async def create_meeting(self, *, external_meeting_id: str) -> dict:
    self.created_external_meeting_ids.append(external_meeting_id)
    meeting_id = f"meeting-{len(self.created_external_meeting_ids)}"
    return {
      "MeetingId": meeting_id,
      "ExternalMeetingId": external_meeting_id,
      "MediaRegion": self.settings.effective_chime_media_region,
    }

  async def get_meeting(self, *, meeting_id: str) -> dict:
    self.get_meeting_ids.append(meeting_id)
    if meeting_id in self.stale_get_meeting_ids:
      raise AppError(
        502,
        "CHIME_MEETING_GET_FAILED",
        "Chime 미팅 정보를 가져오지 못했습니다.",
        {"awsCode": "NotFoundException"},
      )
    return {
      "MeetingId": meeting_id,
      "ExternalMeetingId": "consulting-booking-1",
      "MediaRegion": self.settings.effective_chime_media_region,
    }

  async def create_attendee(self, *, meeting_id: str, external_user_id: str) -> dict:
    if meeting_id in self.stale_attendee_meeting_ids:
      raise AppError(
        502,
        "CHIME_ATTENDEE_CREATE_FAILED",
        "Chime 참가자 생성에 실패했습니다.",
        {"awsCode": "NotFoundException"},
      )
    self.attendee_external_user_ids.append(external_user_id)
    return {
      "AttendeeId": f"attendee-{external_user_id}",
      "ExternalUserId": external_user_id,
      "JoinToken": f"token-{meeting_id}",
    }

  async def delete_meeting(self, *, meeting_id: str) -> None:
    if meeting_id in self.stale_delete_meeting_ids:
      raise AppError(
        502,
        "CHIME_MEETING_END_FAILED",
        "Chime 미팅 종료에 실패했습니다.",
        {"awsCode": "NotFoundException"},
      )
    self.deleted_meeting_ids.append(meeting_id)
    self.operation_events.append(f"delete:{meeting_id}")
    return None

  async def start_transcription(self, *, meeting_id: str, participant_languages: dict[str, str]) -> tuple[str, str | None]:
    self.operation_events.append(f"start-transcription:{meeting_id}")
    if participant_languages.get("customer") == participant_languages.get("partner"):
      return "fixed", participant_languages.get("customer")
    return "identify", None

  async def stop_transcription(self, *, meeting_id: str) -> None:
    if meeting_id in self.stale_stop_transcription_meeting_ids:
      raise AppError(
        502,
        "CHIME_TRANSCRIPTION_STOP_FAILED",
        "실시간 자막 중지에 실패했습니다.",
        {"awsCode": "NotFoundException"},
      )
    self.stopped_transcription_meeting_ids.append(meeting_id)
    self.operation_events.append(f"stop-transcription:{meeting_id}")
    return None

  async def translate_final_caption(self, *, source_language_code: str, content: str) -> dict[str, str]:
    target_language_code = "en" if source_language_code == "ko-KR" else "ko"
    return {
      "source_language_code": source_language_code,
      "target_language_code": target_language_code,
      "translated_content": f"{target_language_code}:{content}",
    }


class FakeDatabase:
  def __init__(self, booking: dict) -> None:
    self.booking = booking
    self.session: dict | None = None
    self.transcript_insert_count = 0
    self.transcript_select_count = 0
    self.transcript_segments: list[dict] = []

  async def fetchrow(self, query: str, *args):
    normalized_query = " ".join(query.lower().split())
    if "from consulting_bookings" in normalized_query:
      if "user_id = $2" in normalized_query and args[1] != self.booking["user_id"]:
        return None
      return self.booking

    if normalized_query.startswith("select * from consulting_call_sessions"):
      return self.session

    if normalized_query.startswith("select result_id, source_language_code, target_language_code, translated_content from consulting_transcript_segments"):
      self.transcript_select_count += 1
      call_session_id = args[0]
      result_id = args[1]
      for segment in self.transcript_segments:
        if segment["call_session_id"] == call_session_id and segment["result_id"] == result_id:
          return segment
      return None

    if normalized_query.startswith("insert into consulting_call_sessions"):
      self.session = {
        "id": "call-1",
        "booking_id": args[0],
        "user_id": args[1],
        "expert_id": args[2],
        "provider": "chime",
        "provider_meeting_id": args[3],
        "provider_external_meeting_id": args[4],
        "media_region": args[5],
        "status": "active",
        "transcription_status": args[6],
        "transcription_mode": "fixed",
        "transcription_language_code": None,
        "customer_language_code": "ko-KR",
        "expert_language_code": "ko-KR",
        "started_at": datetime.now(timezone.utc),
        "ended_at": None,
        "expires_at": args[7],
      }
      return self.session

    if normalized_query.startswith("insert into consulting_transcript_segments"):
      self.transcript_insert_count += 1
      segment = {
        "call_session_id": args[0],
        "booking_id": args[1],
        "participant_id": args[2],
        "source_language_code": args[3],
        "content": args[4],
        "translated_content": args[5],
        "result_id": args[6],
        "target_language_code": args[7],
      }
      self.transcript_segments = [
        item
        for item in self.transcript_segments
        if not (item["call_session_id"] == segment["call_session_id"] and item["result_id"] == segment["result_id"])
      ]
      self.transcript_segments.append(segment)
      return segment

    if normalized_query.startswith("update consulting_call_sessions"):
      assert self.session is not None
      if "provider_meeting_id = $2" in normalized_query:
        self.session["provider"] = "chime"
        self.session["provider_meeting_id"] = args[1]
        self.session["provider_external_meeting_id"] = args[2]
        self.session["media_region"] = args[3]
        self.session["transcription_status"] = args[4]
        self.session["transcription_mode"] = "fixed"
        self.session["transcription_language_code"] = None
        self.session["expires_at"] = args[5]
      if "set customer_language_code = $2" in normalized_query:
        self.session["customer_language_code"] = args[1]
      if "set expert_language_code = $2" in normalized_query:
        self.session["expert_language_code"] = args[1]
      if "transcription_status = 'starting'" in normalized_query:
        self.session["transcription_status"] = "starting"
      if "set transcription_status = 'active'" in normalized_query:
        self.session["transcription_status"] = "active"
        self.session["transcription_language_code"] = args[1]
        self.session["transcription_mode"] = args[2]
      if "transcription_status = 'failed'" in normalized_query:
        self.session["transcription_status"] = "failed"
      if "transcription_status = 'stopping'" in normalized_query:
        self.session["transcription_status"] = "stopping"
      if "set transcription_status = 'stopped'" in normalized_query:
        self.session["transcription_status"] = "stopped"
      if "set status = 'ended'" in normalized_query:
        self.session["status"] = "ended"
        self.session["transcription_status"] = "disabled" if self.session.get("transcription_status") == "disabled" else "stopped"
        self.session["ended_at"] = datetime.now(timezone.utc)
      else:
        self.session["status"] = "active"
        self.session["ended_at"] = None
      return self.session

    raise AssertionError(f"unexpected query: {query}")


class RacingSessionFakeDatabase(FakeDatabase):
  def __init__(self, booking: dict) -> None:
    super().__init__(booking)
    self.session = {
      "id": "call-existing",
      "booking_id": booking["id"],
      "user_id": booking["user_id"],
      "expert_id": booking["expert_id"],
      "provider": "chime",
      "provider_meeting_id": "meeting-existing",
      "provider_external_meeting_id": f"consulting-{booking['id']}",
      "media_region": "ap-northeast-2",
      "status": "active",
      "transcription_status": "stopped",
      "transcription_mode": "fixed",
      "transcription_language_code": None,
      "customer_language_code": "ko-KR",
      "expert_language_code": "ko-KR",
      "started_at": datetime.now(timezone.utc),
      "ended_at": None,
      "expires_at": datetime.now(timezone.utc) + timedelta(hours=2),
    }
    self.session_select_count = 0

  async def fetchrow(self, query: str, *args):
    normalized_query = " ".join(query.lower().split())
    if normalized_query.startswith("select * from consulting_call_sessions"):
      self.session_select_count += 1
      return None if self.session_select_count == 1 else self.session

    if normalized_query.startswith("insert into consulting_call_sessions"):
      return self.session

    return await super().fetchrow(query, *args)


def make_booking(**overrides) -> dict:
  booking = {
    "id": "booking-1",
    "user_id": "user-1",
    "expert_id": "exp_sea",
    "status": "confirmed",
    "session_mode": "online",
    "scheduled_at": datetime.now(timezone.utc) + timedelta(minutes=5),
    "duration_minutes": 30,
  }
  booking.update(overrides)
  return booking


def make_existing_call_session(booking: dict, **overrides) -> dict:
  session = {
    "id": "call-existing",
    "booking_id": booking["id"],
    "user_id": booking["user_id"],
    "expert_id": booking["expert_id"],
    "provider": "chime",
    "provider_meeting_id": "meeting-existing",
    "provider_external_meeting_id": f"consulting-{booking['id']}",
    "media_region": "ap-northeast-2",
    "status": "active",
    "transcription_status": "stopped",
    "transcription_mode": "fixed",
    "transcription_language_code": None,
    "customer_language_code": "ko-KR",
    "expert_language_code": "ko-KR",
    "started_at": datetime.now(timezone.utc),
    "ended_at": None,
    "expires_at": datetime.now(timezone.utc) + timedelta(hours=2),
  }
  session.update(overrides)
  return session


def reset_fake_chime() -> None:
  FakeChimeMeetingsService.created_external_meeting_ids = []
  FakeChimeMeetingsService.attendee_external_user_ids = []
  FakeChimeMeetingsService.deleted_meeting_ids = []
  FakeChimeMeetingsService.get_meeting_ids = []
  FakeChimeMeetingsService.operation_events = []
  FakeChimeMeetingsService.stopped_transcription_meeting_ids = []
  FakeChimeMeetingsService.stale_delete_meeting_ids = set()
  FakeChimeMeetingsService.stale_get_meeting_ids = set()
  FakeChimeMeetingsService.stale_attendee_meeting_ids = set()
  FakeChimeMeetingsService.stale_stop_transcription_meeting_ids = set()


@pytest.mark.asyncio
async def test_customer_join_call_creates_chime_session(monkeypatch: pytest.MonkeyPatch) -> None:
  reset_fake_chime()
  monkeypatch.setattr(consulting_call, "ChimeMeetingsService", FakeChimeMeetingsService)
  settings = Settings(chime_enabled=True, consulting_call_transcription_enabled=True)
  db = FakeDatabase(make_booking())

  result = await consulting_call.join_customer_call(db, "user-1", "booking-1", "en-US", settings)

  assert result["call_session_id"] == "call-1"
  assert result["meeting"]["MeetingId"] == "meeting-1"
  assert result["attendee"]["JoinToken"] == "token-meeting-1"
  assert result["participant_type"] == "user"
  assert result["participant_language_code"] == "en-US"
  assert result["participant"] == {
    "id": "user-1",
    "type": "customer",
    "language_code": "en-US",
  }
  assert db.session is not None
  assert db.session["transcription_status"] == "stopped"
  assert db.session["customer_language_code"] == "en-US"
  assert FakeChimeMeetingsService.created_external_meeting_ids == ["consulting-booking-1"]
  assert FakeChimeMeetingsService.attendee_external_user_ids == ["customer:booking-1"]


@pytest.mark.asyncio
async def test_customer_and_partner_join_reuse_same_chime_meeting(monkeypatch: pytest.MonkeyPatch) -> None:
  reset_fake_chime()
  monkeypatch.setattr(consulting_call, "ChimeMeetingsService", FakeChimeMeetingsService)
  settings = Settings(chime_enabled=True)
  db = FakeDatabase(make_booking(status="scheduled"))

  customer_result = await consulting_call.join_customer_call(db, "user-1", "booking-1", "en-US", settings)
  partner_result = await consulting_call.join_partner_call(
    db,
    {
      "id": "partner-1",
      "role": "expert",
      "expert_id": "exp_sea",
    },
    "booking-1",
    "ko-KR",
    settings,
  )

  assert customer_result["call_session_id"] == partner_result["call_session_id"] == "call-1"
  assert customer_result["meeting"]["MeetingId"] == partner_result["meeting"]["MeetingId"] == "meeting-1"
  assert FakeChimeMeetingsService.created_external_meeting_ids == ["consulting-booking-1"]
  assert FakeChimeMeetingsService.attendee_external_user_ids == ["customer:booking-1", "partner:booking-1"]
  assert db.session is not None
  assert db.session["customer_language_code"] == "en-US"
  assert db.session["expert_language_code"] == "ko-KR"


@pytest.mark.asyncio
async def test_raced_first_join_uses_existing_session_meeting(monkeypatch: pytest.MonkeyPatch) -> None:
  reset_fake_chime()
  monkeypatch.setattr(consulting_call, "ChimeMeetingsService", FakeChimeMeetingsService)
  settings = Settings(chime_enabled=True)
  db = RacingSessionFakeDatabase(make_booking())

  result = await consulting_call.join_customer_call(db, "user-1", "booking-1", "en-US", settings)

  assert result["call_session_id"] == "call-existing"
  assert result["meeting"]["MeetingId"] == "meeting-existing"
  assert result["attendee"]["JoinToken"] == "token-meeting-existing"
  assert FakeChimeMeetingsService.created_external_meeting_ids == ["consulting-booking-1"]
  assert FakeChimeMeetingsService.attendee_external_user_ids == ["customer:booking-1"]
  assert db.session is not None
  assert db.session["customer_language_code"] == "en-US"


@pytest.mark.asyncio
async def test_join_recreates_stale_stored_chime_meeting(monkeypatch: pytest.MonkeyPatch) -> None:
  reset_fake_chime()
  FakeChimeMeetingsService.stale_get_meeting_ids = {"meeting-stale"}
  monkeypatch.setattr(consulting_call, "ChimeMeetingsService", FakeChimeMeetingsService)
  settings = Settings(chime_enabled=True, consulting_call_transcription_enabled=True)
  booking = make_booking(status="in_progress")
  db = FakeDatabase(booking)
  db.session = make_existing_call_session(
    booking,
    id="call-stale",
    provider_meeting_id="meeting-stale",
    transcription_status="active",
    transcription_language_code="ko-KR",
  )

  result = await consulting_call.join_partner_call(
    db,
    {
      "id": "partner-1",
      "role": "expert",
      "expert_id": "exp_sea",
    },
    "booking-1",
    "en-US",
    settings,
  )

  assert result["call_session_id"] == "call-stale"
  assert result["meeting"]["MeetingId"] == "meeting-1"
  assert result["attendee"]["JoinToken"] == "token-meeting-1"
  assert FakeChimeMeetingsService.get_meeting_ids == ["meeting-stale"]
  assert len(FakeChimeMeetingsService.created_external_meeting_ids) == 1
  assert FakeChimeMeetingsService.created_external_meeting_ids[0].startswith("consulting-booking-1-r")
  assert FakeChimeMeetingsService.attendee_external_user_ids == ["partner:booking-1"]
  assert db.session is not None
  assert db.session["provider_meeting_id"] == "meeting-1"
  assert db.session["provider_external_meeting_id"].startswith("consulting-booking-1-r")
  assert db.session["transcription_status"] == "stopped"
  assert db.session["transcription_language_code"] is None
  assert db.session["expert_language_code"] == "en-US"


@pytest.mark.asyncio
async def test_join_recreates_meeting_when_attendee_create_sees_stale_meeting(monkeypatch: pytest.MonkeyPatch) -> None:
  reset_fake_chime()
  FakeChimeMeetingsService.stale_attendee_meeting_ids = {"meeting-stale"}
  monkeypatch.setattr(consulting_call, "ChimeMeetingsService", FakeChimeMeetingsService)
  settings = Settings(chime_enabled=True)
  booking = make_booking()
  db = FakeDatabase(booking)
  db.session = make_existing_call_session(
    booking,
    id="call-stale",
    provider_meeting_id="meeting-stale",
  )

  result = await consulting_call.join_customer_call(db, "user-1", "booking-1", "ko-KR", settings)

  assert result["call_session_id"] == "call-stale"
  assert result["meeting"]["MeetingId"] == "meeting-1"
  assert result["attendee"]["JoinToken"] == "token-meeting-1"
  assert FakeChimeMeetingsService.get_meeting_ids == ["meeting-stale"]
  assert FakeChimeMeetingsService.created_external_meeting_ids[0].startswith("consulting-booking-1-r")
  assert FakeChimeMeetingsService.attendee_external_user_ids == ["customer:booking-1"]
  assert db.session is not None
  assert db.session["provider_meeting_id"] == "meeting-1"


@pytest.mark.asyncio
async def test_customer_end_call_does_not_delete_shared_meeting(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(consulting_call, "ChimeMeetingsService", FakeChimeMeetingsService)
  reset_fake_chime()
  settings = Settings(chime_enabled=True)
  db = FakeDatabase(make_booking())

  await consulting_call.join_customer_call(db, "user-1", "booking-1", "ko-KR", settings)
  result = await consulting_call.end_customer_call(db, "user-1", "booking-1", settings)

  assert result["status"] == "active"
  assert db.session is not None
  assert db.session["status"] == "active"
  assert FakeChimeMeetingsService.deleted_meeting_ids == []


@pytest.mark.asyncio
async def test_partner_end_call_stops_active_transcription_before_deleting_meeting(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  monkeypatch.setattr(consulting_call, "ChimeMeetingsService", FakeChimeMeetingsService)
  reset_fake_chime()
  settings = Settings(chime_enabled=True, consulting_call_transcription_enabled=True)
  booking = make_booking()
  db = FakeDatabase(booking)
  db.session = make_existing_call_session(
    booking,
    provider_meeting_id="meeting-active",
    transcription_status="active",
  )

  result = await consulting_call.end_partner_call(
    db,
    {"id": "partner-1", "role": "expert", "expert_id": "exp_sea"},
    "booking-1",
    settings,
  )

  assert result["status"] == "ended"
  assert result["transcription"]["status"] == "stopped"
  assert FakeChimeMeetingsService.stopped_transcription_meeting_ids == ["meeting-active"]
  assert FakeChimeMeetingsService.deleted_meeting_ids == ["meeting-active"]
  assert FakeChimeMeetingsService.operation_events == [
    "stop-transcription:meeting-active",
    "delete:meeting-active",
  ]


@pytest.mark.asyncio
async def test_partner_end_call_marks_stale_chime_meeting_ended(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  monkeypatch.setattr(consulting_call, "ChimeMeetingsService", FakeChimeMeetingsService)
  reset_fake_chime()
  FakeChimeMeetingsService.stale_stop_transcription_meeting_ids = {"meeting-stale"}
  FakeChimeMeetingsService.stale_delete_meeting_ids = {"meeting-stale"}
  settings = Settings(chime_enabled=True, consulting_call_transcription_enabled=True)
  booking = make_booking()
  db = FakeDatabase(booking)
  db.session = make_existing_call_session(
    booking,
    provider_meeting_id="meeting-stale",
    transcription_status="active",
  )

  result = await consulting_call.end_partner_call(
    db,
    {"id": "partner-1", "role": "expert", "expert_id": "exp_sea"},
    "booking-1",
    settings,
  )

  assert result["status"] == "ended"
  assert result["transcription"]["status"] == "stopped"
  assert FakeChimeMeetingsService.stopped_transcription_meeting_ids == []
  assert FakeChimeMeetingsService.deleted_meeting_ids == []


@pytest.mark.asyncio
async def test_customer_join_call_rejects_offline_booking() -> None:
  settings = Settings(chime_enabled=True)
  db = FakeDatabase(make_booking(session_mode="offline"))

  with pytest.raises(AppError) as error:
    await consulting_call.join_customer_call(db, "user-1", "booking-1", "ko-KR", settings)

  assert error.value.code == "CONSULTING_CALL_OFFLINE_BOOKING"


@pytest.mark.asyncio
async def test_customer_call_state_reports_not_started_without_session() -> None:
  settings = Settings(chime_enabled=True)
  db = FakeDatabase(make_booking())

  result = await consulting_call.get_customer_call_state(db, "user-1", "booking-1", settings)

  assert result["booking_id"] == "booking-1"
  assert result["status"] == "not_started"
  assert result["chime_enabled"] is True


@pytest.mark.asyncio
async def test_partner_transcription_start_requires_explicit_consent(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(consulting_call, "ChimeMeetingsService", FakeChimeMeetingsService)
  reset_fake_chime()
  settings = Settings(chime_enabled=True, consulting_call_transcription_enabled=True)
  booking = make_booking()
  db = FakeDatabase(booking)
  db.session = make_existing_call_session(booking, provider_meeting_id="meeting-1")

  with pytest.raises(AppError) as error:
    await consulting_call.start_partner_transcription(
      db,
      {"id": "partner-1", "role": "expert", "expert_id": "exp_sea"},
      "booking-1",
      "ko-KR",
      False,
      settings,
    )

  assert error.value.code == "CONSULTING_CALL_TRANSCRIPTION_CONSENT_REQUIRED"
  assert FakeChimeMeetingsService.operation_events == []


@pytest.mark.asyncio
async def test_partner_transcription_start_uses_explicit_consent(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(consulting_call, "ChimeMeetingsService", FakeChimeMeetingsService)
  reset_fake_chime()
  settings = Settings(chime_enabled=True, consulting_call_transcription_enabled=True)
  booking = make_booking()
  db = FakeDatabase(booking)
  db.session = make_existing_call_session(booking, provider_meeting_id="meeting-1")

  result = await consulting_call.start_partner_transcription(
    db,
    {"id": "partner-1", "role": "expert", "expert_id": "exp_sea"},
    "booking-1",
    "en-US",
    True,
    settings,
  )

  assert result["transcription"]["status"] == "active"
  assert FakeChimeMeetingsService.operation_events == ["start-transcription:meeting-1"]


@pytest.mark.asyncio
async def test_caption_translation_does_not_store_transcript_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
  reset_fake_chime()
  monkeypatch.setattr(consulting_call, "ChimeMeetingsService", FakeChimeMeetingsService)
  settings = Settings(chime_enabled=True, consulting_call_translation_enabled=True)
  db = FakeDatabase(make_booking())
  await consulting_call.join_customer_call(db, "user-1", "booking-1", "ko-KR", settings)

  result = await consulting_call.translate_partner_caption(
    db,
    {"id": "partner-1", "role": "expert", "expert_id": "exp_sea"},
    "booking-1",
    result_id="caption-1",
    source_language_code="ko-KR",
    content="안녕하세요",
    settings=settings,
  )

  assert result == {
    "result_id": "caption-1",
    "source_language_code": "ko-KR",
    "target_language_code": "en",
    "translated_content": "en:안녕하세요",
  }
  assert db.transcript_select_count == 0
  assert db.transcript_insert_count == 0
  assert db.transcript_segments == []


@pytest.mark.asyncio
async def test_caption_translation_can_store_when_retention_is_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
  reset_fake_chime()
  monkeypatch.setattr(consulting_call, "ChimeMeetingsService", FakeChimeMeetingsService)
  settings = Settings(
    chime_enabled=True,
    consulting_call_translation_enabled=True,
    consulting_transcript_retention_days=7,
  )
  db = FakeDatabase(make_booking())
  await consulting_call.join_customer_call(db, "user-1", "booking-1", "ko-KR", settings)

  result = await consulting_call.translate_partner_caption(
    db,
    {"id": "partner-1", "role": "expert", "expert_id": "exp_sea"},
    "booking-1",
    result_id="caption-1",
    source_language_code="en-US",
    content="hello",
    settings=settings,
  )

  assert result["translated_content"] == "ko:hello"
  assert db.transcript_select_count == 1
  assert db.transcript_insert_count == 1
  assert db.transcript_segments == [
    {
      "booking_id": "booking-1",
      "call_session_id": "call-1",
      "content": "hello",
      "participant_id": "partner-1",
      "result_id": "caption-1",
      "source_language_code": "en-US",
      "target_language_code": "ko",
      "translated_content": "ko:hello",
    },
  ]


def test_chime_transcription_config_uses_fixed_language_for_same_language() -> None:
  service = ChimeMeetingsService(Settings(chime_transcription_enabled=True))

  config, mode, language_code = service._transcription_configuration(
    {"customer": "ko-KR", "partner": "ko-KR"},
  )

  assert mode == "fixed"
  assert language_code == "ko-KR"
  assert config["EngineTranscribeSettings"]["LanguageCode"] == "ko-KR"


def test_chime_transcription_config_identifies_mixed_languages() -> None:
  service = ChimeMeetingsService(Settings(chime_transcription_enabled=True))

  config, mode, language_code = service._transcription_configuration(
    {"customer": "ko-KR", "partner": "en-US"},
  )

  assert mode == "identify"
  assert language_code is None
  assert config["EngineTranscribeSettings"]["IdentifyLanguage"] is True
  assert config["EngineTranscribeSettings"]["LanguageOptions"] == "ko-KR,en-US"


def test_chime_translate_client_uses_settings_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
  calls: dict[str, object] = {}

  def fake_client(service_name: str, **kwargs):
    calls["service_name"] = service_name
    calls["kwargs"] = kwargs
    return object()

  monkeypatch.setattr(chime_meetings.boto3, "client", fake_client)

  service = ChimeMeetingsService(
    Settings(
      aws_access_key_id="test-access-key",
      aws_secret_access_key="test-secret-key",
      aws_use_iam_role=False,
      chime_region="ap-northeast-2",
    ),
  )

  service._translate_client()

  assert calls["service_name"] == "translate"
  assert calls["kwargs"] == {
    "region_name": "ap-northeast-2",
    "aws_access_key_id": "test-access-key",
    "aws_secret_access_key": "test-secret-key",
  }


@pytest.mark.asyncio
async def test_chime_create_meeting_uses_deterministic_client_request_token(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: list[dict] = []

  class FakeClient:
    def create_meeting(self, **kwargs):
      calls.append(kwargs)
      return {
        "Meeting": {
          "MeetingId": f"meeting-{len(calls)}",
          "ExternalMeetingId": kwargs["ExternalMeetingId"],
          "MediaRegion": kwargs["MediaRegion"],
        },
      }

  monkeypatch.setattr(chime_meetings.boto3, "client", lambda *_args, **_kwargs: FakeClient())

  service = ChimeMeetingsService(Settings(chime_enabled=True, chime_region="ap-northeast-2"))

  await service.create_meeting(external_meeting_id="consulting-booking-1")
  await service.create_meeting(external_meeting_id="consulting-booking-1")

  assert len(calls) == 2
  assert calls[0]["ClientRequestToken"] == calls[1]["ClientRequestToken"]
  assert calls[0]["ExternalMeetingId"] == "consulting-booking-1"
  assert len(calls[0]["ClientRequestToken"]) <= 64


@pytest.mark.asyncio
async def test_chime_call_aws_maps_access_denied_to_actionable_error() -> None:
  service = ChimeMeetingsService(Settings())

  def denied_operation():
    raise ClientError(
      {"Error": {"Code": "AccessDeniedException", "Message": "denied"}},
      "CreateMeeting",
    )

  with pytest.raises(AppError) as exc_info:
    await service._call_aws(
      denied_operation,
      error_code="CHIME_MEETING_CREATE_FAILED",
      error_message="Chime 미팅 생성에 실패했습니다.",
    )

  assert exc_info.value.code == "CHIME_AWS_ACCESS_DENIED"
  assert exc_info.value.details == {"awsCode": "AccessDeniedException"}
