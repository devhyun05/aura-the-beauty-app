from datetime import datetime, timezone
import json

import pytest

from app.core.errors import AppError
from app.services.consulting_partner import (
  complete_consultation_summary,
  generate_consultation_summary,
  update_booking_status,
)


ACCOUNT = {"id": "account-1", "expert_id": "exp_sea"}


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
