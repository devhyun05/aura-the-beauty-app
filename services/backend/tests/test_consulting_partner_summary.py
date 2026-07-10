from datetime import datetime, timezone
import json

import pytest

from app.core.errors import AppError
from app.services.consulting_partner import (
  _settings_payload,
  _map_booking_status,
  _map_partner_status,
  _booking_to_web,
  complete_consultation_summary,
  generate_consultation_summary,
  update_booking_status,
  update_manager_settings,
)


ACCOUNT = {"id": "account-1", "expert_id": "exp_sea"}


@pytest.mark.parametrize("status", ["scheduled", "in_progress"])
def test_partner_status_mapping_preserves_video_call_runtime_statuses(status: str) -> None:
  assert _map_partner_status(status) == status
  assert _map_booking_status(status) == status


@pytest.mark.parametrize(
  ("session_mode", "channel"),
  [("online", "video"), ("offline", "offline")],
)
def test_partner_booking_channel_follows_session_mode(session_mode: str, channel: str) -> None:
  row = {
    "id": "booking-1",
    "user_id": "user-1",
    "expert_id": "exp_sea",
    "status": "scheduled",
    "session_mode": session_mode,
    "duration_minutes": 30,
    "price": 49000,
    "category_label": "퍼스널컬러 진단",
    "concern_label": None,
    "question": "",
    "shared_report_ids": [],
    "summary_id": None,
    "review_id": None,
    "operator_note": None,
    "preferred_contact_method": "sms",
    "contact_phone": "010-0000-0000",
    "phone": None,
    "created_at": datetime(2026, 7, 9, 4, tzinfo=timezone.utc),
    "scheduled_at": datetime(2026, 7, 10, 9, tzinfo=timezone.utc),
  }

  assert _booking_to_web(row)["channel"] == channel


def test_partner_settings_payload_maps_expert_schedule_to_manager_contract() -> None:
  settings = _settings_payload(
    {**ACCOUNT, "email": "seah.kim@aura-partner.local", "role": "expert", "workspace_scope": "expert_personal"},
    {
      "id": "exp_sea",
      "operating_hours": [
        {"day_of_week": 0, "label": "월", "opens_at": "18:00", "closes_at": "20:00", "is_closed": False},
      ],
      "holiday_dates": ["2026-07-15"],
      "booking_open_months": 1,
    },
  )

  assert settings["operatingHours"][0] == {
    "dayOfWeek": 0,
    "label": "월",
    "opensAt": "18:00",
    "closesAt": "20:00",
    "isClosed": False,
  }
  assert settings["holidays"] == ["2026-07-15"]
  assert settings["bookingOpenMonths"] == 1
  assert settings["integrations"]["chatProvider"] == "websocket"


class FakePartnerSettingsDatabase:
  def __init__(self) -> None:
    self.expert = {
      "id": "exp_sea",
      "operating_hours": [
        {"day_of_week": 0, "label": "월", "opens_at": "10:00", "closes_at": "19:00", "is_closed": False},
      ],
      "holiday_dates": ["2026-07-15"],
      "booking_open_months": 1,
    }
    self.update_args = None

  async def fetchrow(self, query: str, *args):
    if "select id, operating_hours, holiday_dates, booking_open_months" in query:
      return dict(self.expert)
    if "update consulting_experts" in query:
      self.update_args = args
      self.expert["operating_hours"] = json.loads(args[1])
      self.expert["holiday_dates"] = json.loads(args[2])
      self.expert["booking_open_months"] = args[3]
      return dict(self.expert)
    return None


@pytest.mark.asyncio
async def test_update_partner_settings_accepts_web_manager_payload() -> None:
  db = FakePartnerSettingsDatabase()

  settings = await update_manager_settings(
    db,
    {**ACCOUNT, "email": "seah.kim@aura-partner.local", "role": "expert", "workspace_scope": "expert_personal"},
    {
      "operatingHours": [
        {"dayOfWeek": 0, "label": "월", "opensAt": "18:00", "closesAt": "20:30", "isClosed": False},
        {"dayOfWeek": 2, "label": "수", "opensAt": "11:00", "closesAt": "17:00", "isClosed": False},
      ],
      "holidays": ["2026-08-15T00:00:00Z", "2026-08-15", "2026-09-01"],
      "bookingOpenMonths": 4,
    },
  )

  assert settings["operatingHours"][0]["opensAt"] == "18:00"
  assert settings["operatingHours"][0]["closesAt"] == "20:30"
  assert settings["operatingHours"][2]["opensAt"] == "11:00"
  assert settings["holidays"] == ["2026-08-15", "2026-09-01"]
  assert settings["bookingOpenMonths"] == 3
  assert db.update_args[3] == 3


class FakePartnerSummaryDatabase:
  def __init__(self, status: str = "confirmed") -> None:
    self.booking = {
      "id": "booking-1",
      "user_id": "user-1",
      "expert_id": "exp_sea",
      "status": status,
      "duration_label": "30분 상담",
      "date_label": "7월 9일 (목) 14:00",
      "category_label": "퍼스널컬러 진단",
      "concern_label": "퍼스널컬러가 헷갈려요",
      "contact_name": "이두치",
      "contact_phone": "010-0000-0000",
      "email": "du822623@gmail.com",
      "nickname": "이두치",
      "user_name": "이두치",
      "phone": "010-0000-0000",
      "created_at": datetime(2026, 7, 9, tzinfo=timezone.utc),
      "scheduled_at": datetime(2026, 7, 9, 5, tzinfo=timezone.utc),
      "shared_report_ids": [],
      "summary_id": None,
      "review_id": None,
    }
    self.summary = None
    self.executed: list[tuple[str, tuple]] = []

  async def fetchrow(self, query: str, *args):
    if "from consulting_bookings b" in query and "join users u" in query:
      return dict(self.booking)
    if "from consulting_summaries s" in query:
      return dict(self.summary) if self.summary is not None else None
    return None

  async def execute(self, query: str, *args):
    self.executed.append((query, args))
    if "insert into consulting_summaries" in query:
      self.summary = {
        "id": "summary-1",
        "booking_id": args[0],
        "expert_id": args[1],
        "duration_label": args[2],
        "date_label": args[3],
        "notes": args[4],
        "products": json.dumps([], ensure_ascii=False),
        "customer_id": self.booking["user_id"],
        "created_at": datetime(2026, 7, 9, 6, tzinfo=timezone.utc),
      }
      self.booking["summary_id"] = "summary-1"
    if "update consulting_bookings" in query:
      self.booking["status"] = "completed"
    return "OK"


@pytest.mark.asyncio
async def test_generate_consultation_summary_uses_transcript_not_expert_comment() -> None:
  db = FakePartnerSummaryDatabase()

  result = await generate_consultation_summary(
    db,
    ACCOUNT,
    "booking-1",
    "고객은 립 컬러가 얼굴에서 튀는 점을 고민했고 전문가는 채도 조절을 안내했습니다.",
    expert_comment="다음 상담에서 베이스 톤 확인",
  )

  assert result["job"]["source"] == "phone_transcript"
  assert result["summary"]["ai_status"] == "succeeded"
  assert "립 컬러" in result["summary"]["customer_summary"]
  assert result["summary"]["internal_memo"] == "다음 상담에서 베이스 톤 확인"
  assert db.summary is None


@pytest.mark.asyncio
async def test_complete_consultation_summary_saves_ai_notes_and_completes_booking() -> None:
  db = FakePartnerSummaryDatabase()

  summary = await complete_consultation_summary(
    db,
    ACCOUNT,
    "booking-1",
    transcript="고객은 블러셔 위치가 낮아 보이는 점을 상담했고 전문가는 광대 위쪽 배치를 안내했습니다.",
    expert_comment="일주일 후 적용 사진 확인 예정",
  )

  assert db.booking["status"] == "completed"
  assert summary["source"] == "phone_ai"
  assert summary["ai_status"] == "succeeded"
  assert "블러셔 위치" in summary["customer_summary"]
  assert summary["internal_memo"] == "일주일 후 적용 사진 확인 예정"
  saved_notes = json.loads(db.summary["notes"])
  assert [note["id"] for note in saved_notes] == ["ai_summary", "ai_recommendations", "expert_comment"]


@pytest.mark.asyncio
async def test_partner_status_update_cannot_complete_without_ai_summary() -> None:
  db = FakePartnerSummaryDatabase()

  with pytest.raises(AppError) as exc_info:
    await update_booking_status(db, ACCOUNT, "booking-1", "completed")

  assert exc_info.value.code == "CONSULTING_SUMMARY_REQUIRED"
  assert db.executed == []
