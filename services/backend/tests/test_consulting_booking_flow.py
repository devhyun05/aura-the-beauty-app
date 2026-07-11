import pytest

from app.api import consulting as consulting_api
from app.api import consulting_partner as partner_api
from app.core.errors import AppError
from app.core.security import AuthContext
from app.schemas.consulting import ConsultingTextMessageSend
from app.schemas.consulting_partner import PartnerBookingStatusUpdate


CUSTOMER_AUTH = AuthContext(
  subject="customer-subject",
  provider="dev",
  email="customer@example.com",
  name="고객",
  claims={},
)
PARTNER_ACCOUNT = {"id": "partner-account", "expert_id": "exp-sea", "expert_name": "김세아"}


@pytest.mark.asyncio
async def test_customer_cancellation_broadcasts_status_without_deleting_record(monkeypatch: pytest.MonkeyPatch) -> None:
  broadcasts: list[tuple[str, dict]] = []

  async def fake_ensure_user(*_args):
    return {"id": "customer-1"}

  async def fake_cancel_booking(_db, user_id: str, booking_id: str):
    assert user_id == "customer-1"
    return {"id": booking_id, "status": "cancelled", "userId": user_id}

  async def fake_broadcast(booking_id: str, event: dict):
    broadcasts.append((booking_id, event))

  monkeypatch.setattr(consulting_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(consulting_api.consulting, "cancel_booking", fake_cancel_booking)
  monkeypatch.setattr(consulting_api.consulting_realtime_manager, "broadcast", fake_broadcast)

  result = await consulting_api.cancel_consulting_booking("booking-1", CUSTOMER_AUTH, object())

  assert result["data"]["record"]["status"] == "cancelled"
  assert broadcasts == [
    (
      "booking-1",
      {
        "type": "booking.status",
        "bookingId": "booking-1",
        "status": "cancelled",
        "message": "고객이 예약을 취소했습니다. 이 예약은 취소 기록으로 보관됩니다.",
      },
    ),
  ]


@pytest.mark.asyncio
async def test_customer_delete_endpoint_returns_retained_cancellation_record(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_ensure_user(*_args):
    return {"id": "customer-1"}

  async def fake_get_booking(_db, user_id: str, booking_id: str):
    assert user_id == "customer-1"
    return {"id": booking_id, "status": "cancelled"}

  monkeypatch.setattr(consulting_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(consulting_api.consulting, "get_booking", fake_get_booking)

  result = await consulting_api.delete_consulting_booking("booking-1", CUSTOMER_AUTH, object())

  assert result["data"] == {
    "deleted": False,
    "bookingId": "booking-1",
    "record": {"id": "booking-1", "status": "cancelled"},
    "message": "취소된 예약은 전문가와 고객의 확인 기록으로 보관되며 삭제할 수 없습니다.",
  }


@pytest.mark.asyncio
async def test_customer_text_fallback_persists_then_broadcasts(monkeypatch: pytest.MonkeyPatch) -> None:
  broadcasts: list[tuple[str, dict]] = []

  async def fake_ensure_user(*_args):
    return {"id": "customer-1"}

  async def fake_get_booking(*_args):
    return {"id": "booking-1", "status": "requested"}

  async def fake_create_message(_db, **kwargs):
    assert kwargs["booking_id"] == "booking-1"
    assert kwargs["sender_type"] == "user"
    assert kwargs["body"] == "입금했어요"
    return (
      {
        "id": "message-1",
        "bookingId": "booking-1",
        "body": "입금했어요",
        "senderType": "user",
        "senderName": "고객",
        "sentAt": "2026-07-11T08:00:00Z",
      },
      True,
    )

  async def fake_broadcast(booking_id: str, event: dict):
    broadcasts.append((booking_id, event))

  monkeypatch.setattr(consulting_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(consulting_api.consulting, "get_booking", fake_get_booking)
  monkeypatch.setattr(consulting_api, "create_consulting_message", fake_create_message)
  monkeypatch.setattr(consulting_api.consulting_realtime_manager, "broadcast", fake_broadcast)

  result = await consulting_api.send_consulting_text_message(
    "booking-1",
    ConsultingTextMessageSend(body="입금했어요", clientMessageId="mobile-message-1"),
    CUSTOMER_AUTH,
    object(),
  )

  assert result["data"]["message"]["id"] == "message-1"
  assert broadcasts[0][0] == "booking-1"
  assert broadcasts[0][1]["body"] == "입금했어요"


@pytest.mark.asyncio
async def test_closed_customer_booking_rejects_text_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_ensure_user(*_args):
    return {"id": "customer-1"}

  async def fake_get_booking(*_args):
    return {"id": "booking-1", "status": "canceled"}

  monkeypatch.setattr(consulting_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(consulting_api.consulting, "get_booking", fake_get_booking)

  with pytest.raises(AppError, match="CONSULTING_BOOKING_CLOSED"):
    await consulting_api.send_consulting_text_message(
      "booking-1",
      ConsultingTextMessageSend(body="입금했어요", clientMessageId="mobile-message-1"),
      CUSTOMER_AUTH,
      object(),
    )


@pytest.mark.asyncio
async def test_partner_payment_confirmation_broadcasts_customer_completion_notice(monkeypatch: pytest.MonkeyPatch) -> None:
  broadcasts: list[tuple[str, dict]] = []

  async def fake_update_status(_db, account: dict, booking_id: str, status: str, note: str | None):
    assert account == PARTNER_ACCOUNT
    assert status == "confirmed"
    assert note == "입금 확인"
    return {"id": booking_id, "status": "confirmed"}

  async def fake_broadcast(booking_id: str, event: dict):
    broadcasts.append((booking_id, event))

  monkeypatch.setattr(partner_api.consulting_partner, "update_booking_status", fake_update_status)
  monkeypatch.setattr(partner_api.consulting_realtime_manager, "broadcast", fake_broadcast)

  result = await partner_api.update_partner_booking_status(
    "booking-1",
    PartnerBookingStatusUpdate(status="confirmed", operatorNote="입금 확인"),
    PARTNER_ACCOUNT,
    object(),
  )

  assert result["data"]["booking"]["status"] == "confirmed"
  assert broadcasts[0][1] == {
    "type": "booking.status",
    "bookingId": "booking-1",
    "status": "confirmed",
    "message": "예약이 완료되었습니다. 예약일에 전문가가 먼저 화상 상담을 시작하니, 안내된 시간에 연락을 기다려 주세요.",
  }


@pytest.mark.asyncio
async def test_partner_generic_booking_update_supports_cancel_and_broadcast(monkeypatch: pytest.MonkeyPatch) -> None:
  broadcasts: list[tuple[str, dict]] = []

  async def fake_update_details(_db, account: dict, booking_id: str, payload: dict):
    assert account == PARTNER_ACCOUNT
    assert payload == {"status": "cancelled", "cancel_reason": "전문가가 예약을 취소함"}
    return {"id": booking_id, "status": "cancelled"}

  async def fake_broadcast(booking_id: str, event: dict):
    broadcasts.append((booking_id, event))

  monkeypatch.setattr(partner_api.consulting_partner, "update_booking_details", fake_update_details)
  monkeypatch.setattr(partner_api.consulting_realtime_manager, "broadcast", fake_broadcast)

  result = await partner_api.update_partner_booking(
    "booking-1",
    {"status": "cancelled", "cancel_reason": "전문가가 예약을 취소함"},
    PARTNER_ACCOUNT,
    object(),
  )

  assert result["data"]["booking"]["status"] == "cancelled"
  assert broadcasts[0][1]["type"] == "booking.status"
  assert broadcasts[0][1]["status"] == "cancelled"


@pytest.mark.asyncio
async def test_partner_payment_endpoint_marks_payment_and_notifies_customer(monkeypatch: pytest.MonkeyPatch) -> None:
  broadcasts: list[tuple[str, dict]] = []

  async def fake_mark_paid(_db, account: dict, booking_id: str):
    assert account == PARTNER_ACCOUNT
    return {"id": booking_id, "status": "contacting"}

  async def fake_broadcast(booking_id: str, event: dict):
    broadcasts.append((booking_id, event))

  monkeypatch.setattr(partner_api.consulting_partner, "mark_booking_payment_paid", fake_mark_paid)
  monkeypatch.setattr(partner_api.consulting_realtime_manager, "broadcast", fake_broadcast)

  result = await partner_api.mark_partner_booking_payment_paid(
    "booking-1",
    PARTNER_ACCOUNT,
    object(),
  )

  assert result["data"]["booking"]["status"] == "contacting"
  assert broadcasts[0][1]["message"] == "입금 확인이 완료되었습니다. 전문가의 예약 확정을 기다려 주세요."


@pytest.mark.asyncio
async def test_partner_text_fallback_persists_and_broadcasts(monkeypatch: pytest.MonkeyPatch) -> None:
  broadcasts: list[tuple[str, dict]] = []

  async def fake_thread_detail(*_args):
    return {
      "booking": {"id": "booking-1", "status": "requested"},
      "expert": {"name": "김세아"},
    }

  async def fake_create_message(_db, **kwargs):
    assert kwargs["sender_type"] == "expert"
    assert kwargs["body"] == "입금 계좌를 안내드립니다."
    return (
      {
        "id": "message-2",
        "bookingId": "booking-1",
        "body": kwargs["body"],
        "senderType": "expert",
        "senderName": "김세아",
        "sentAt": "2026-07-11T08:01:00Z",
      },
      True,
    )

  async def fake_broadcast(booking_id: str, event: dict):
    broadcasts.append((booking_id, event))

  monkeypatch.setattr(partner_api.consulting_partner, "chat_thread_detail", fake_thread_detail)
  monkeypatch.setattr(partner_api, "create_consulting_message", fake_create_message)
  monkeypatch.setattr(partner_api.consulting_realtime_manager, "broadcast", fake_broadcast)

  result = await partner_api.send_partner_chat_text_message(
    "booking-1",
    ConsultingTextMessageSend(body="입금 계좌를 안내드립니다.", clientMessageId="web-message-1"),
    PARTNER_ACCOUNT,
    object(),
  )

  assert result["data"]["message"]["senderType"] == "expert"
  assert broadcasts[0][0] == "booking-1"
