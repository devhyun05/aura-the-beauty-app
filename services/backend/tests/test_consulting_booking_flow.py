from datetime import datetime, timezone

import pytest

from app.api import consulting as consulting_api
from app.api import consulting_partner as partner_api
from app.core.errors import AppError
from app.core.security import AuthContext
from app.schemas.consulting import ConsultingTextMessageSend
from app.schemas.consulting_partner import PartnerBookingStatusUpdate
from app.services import consulting as consulting_service
from app.services import consulting_partner as consulting_partner_service


CUSTOMER_AUTH = AuthContext(
  subject="customer-subject",
  provider="dev",
  email="customer@example.com",
  name="고객",
  claims={},
)
PARTNER_ACCOUNT = {"id": "partner-account", "expert_id": "exp-sea", "expert_name": "김세아"}


class FakeConversationDatabase:
  def __init__(self, open_conversation_id=None) -> None:
    self.open_conversation_id = open_conversation_id
    self.executed: list[tuple[str, tuple]] = []

  async def fetchrow(self, query: str, *args):
    if "customer_left_at is null and expert_left_at is null" in query:
      assert args == ("customer-1", "exp-sea")
      return {"conversation_id": self.open_conversation_id} if self.open_conversation_id else None
    if "select coalesce(conversation_id, id)" in query:
      return {"conversation_id": "conversation-1"}
    return None

  async def execute(self, query: str, *args):
    self.executed.append((query, args))
    return "UPDATE 2"


@pytest.mark.asyncio
async def test_new_booking_reuses_open_conversation_and_starts_new_after_leave() -> None:
  existing = await consulting_service._conversation_id_for_new_booking(
    FakeConversationDatabase("conversation-1"),
    "customer-1",
    "exp-sea",
    "booking-new",
  )
  fresh = await consulting_service._conversation_id_for_new_booking(
    FakeConversationDatabase(),
    "customer-1",
    "exp-sea",
    "booking-new",
  )

  assert existing == "conversation-1"
  assert fresh == "booking-new"


@pytest.mark.asyncio
async def test_customer_leave_closes_every_booking_in_conversation() -> None:
  db = FakeConversationDatabase()

  result = await consulting_service.leave_booking_conversation(db, "customer-1", "booking-1")

  assert result == {"conversation_id": "conversation-1", "left": True}
  query, args = db.executed[0]
  assert "where conversation_id = $1" in query
  assert args == ("conversation-1", "customer-1")


@pytest.mark.asyncio
async def test_partner_leave_accepts_web_thread_prefix(monkeypatch: pytest.MonkeyPatch) -> None:
  executed: list[tuple[str, tuple]] = []

  class FakeDatabase:
    async def execute(self, query: str, *args):
      executed.append((query, args))
      return "UPDATE 2"

  async def fake_booking_row(_db, account: dict, booking_id: str):
    assert account == PARTNER_ACCOUNT
    assert booking_id == "booking-1"
    return {"id": "booking-1", "conversation_id": "conversation-1"}

  monkeypatch.setattr(consulting_partner_service, "_booking_row", fake_booking_row)

  result = await consulting_partner_service.leave_chat_thread(
    FakeDatabase(),  # type: ignore[arg-type]
    PARTNER_ACCOUNT,
    "thread-booking-1",
  )

  assert result == {
    "booking_id": "booking-1",
    "conversation_id": "conversation-1",
    "left": True,
  }
  assert executed[0][1] == ("conversation-1", "exp-sea")


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
    return {"id": "booking-1", "status": "confirmed", "chat_available": True}

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
async def test_unconfirmed_customer_booking_rejects_text_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_ensure_user(*_args):
    return {"id": "customer-1"}

  async def fake_get_booking(*_args):
    return {"id": "booking-1", "status": "requested", "chat_available": False}

  monkeypatch.setattr(consulting_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(consulting_api.consulting, "get_booking", fake_get_booking)

  with pytest.raises(AppError, match="CONSULTING_CHAT_NOT_CONFIRMED"):
    await consulting_api.send_consulting_text_message(
      "booking-1",
      ConsultingTextMessageSend(body="입금했어요", clientMessageId="mobile-message-1"),
      CUSTOMER_AUTH,
      object(),
    )


@pytest.mark.asyncio
async def test_closed_customer_booking_keeps_history_but_rejects_new_text(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_ensure_user(*_args):
    return {"id": "customer-1"}

  async def fake_get_booking(*_args):
    return {"id": "booking-1", "status": "canceled", "chat_available": True}

  monkeypatch.setattr(consulting_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(consulting_api.consulting, "get_booking", fake_get_booking)

  with pytest.raises(AppError, match="CONSULTING_BOOKING_CLOSED"):
    await consulting_api.send_consulting_text_message(
      "booking-1",
      ConsultingTextMessageSend(body="기록은 보이나요?", clientMessageId="mobile-message-2"),
      CUSTOMER_AUTH,
      object(),
    )


@pytest.mark.asyncio
async def test_partner_payment_confirmation_broadcasts_customer_completion_notice(monkeypatch: pytest.MonkeyPatch) -> None:
  broadcasts: list[tuple[str, dict]] = []
  confirmation_messages: list[tuple[object, dict, str]] = []

  async def fake_update_status(_db, account: dict, booking_id: str, status: str, note: str | None):
    assert account == PARTNER_ACCOUNT
    assert status == "confirmed"
    assert note == "입금 확인"
    return {"id": booking_id, "status": "confirmed"}

  async def fake_broadcast(booking_id: str, event: dict):
    broadcasts.append((booking_id, event))

  async def fake_send_confirmation(db, account: dict, booking_id: str):
    confirmation_messages.append((db, account, booking_id))

  monkeypatch.setattr(partner_api.consulting_partner, "update_booking_status", fake_update_status)
  monkeypatch.setattr(partner_api.consulting_realtime_manager, "broadcast", fake_broadcast)
  monkeypatch.setattr(partner_api, "_send_booking_confirmation_message", fake_send_confirmation)

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
  assert confirmation_messages[0][1:] == (PARTNER_ACCOUNT, "booking-1")


@pytest.mark.asyncio
async def test_partner_confirm_endpoint_atomically_confirms_and_creates_chat_notice(monkeypatch: pytest.MonkeyPatch) -> None:
  updates: list[dict] = []
  broadcasts: list[tuple[str, dict]] = []
  confirmation_messages: list[str] = []

  async def fake_update_details(_db, account: dict, booking_id: str, payload: dict):
    assert account == PARTNER_ACCOUNT
    updates.append(payload)
    return {"id": booking_id, "status": "confirmed"}

  async def fake_broadcast(booking_id: str, event: dict):
    broadcasts.append((booking_id, event))

  async def fake_send_confirmation(_db, _account: dict, booking_id: str):
    confirmation_messages.append(booking_id)

  monkeypatch.setattr(partner_api.consulting_partner, "update_booking_details", fake_update_details)
  monkeypatch.setattr(partner_api.consulting_realtime_manager, "broadcast", fake_broadcast)
  monkeypatch.setattr(partner_api, "_send_booking_confirmation_message", fake_send_confirmation)

  result = await partner_api.confirm_partner_booking("booking-1", PARTNER_ACCOUNT, object())

  assert updates == [{"mark_payment_paid": True, "status": "confirmed"}]
  assert result["data"]["booking"]["status"] == "confirmed"
  assert broadcasts[0][1]["status"] == "confirmed"
  assert confirmation_messages == ["booking-1"]


def _chat_booking_row(booking_id: str, status: str, created_at: datetime, confirmed_at=None) -> dict:
  return {
    "id": booking_id,
    "conversation_id": "conversation-1",
    "user_id": "customer-1",
    "expert_id": "exp-sea",
    "status": status,
    "created_at": created_at,
    "scheduled_at": created_at,
    "duration_minutes": 60,
    "session_mode": "online",
    "confirmed_at": confirmed_at,
  }


@pytest.mark.asyncio
async def test_partner_chat_hides_pending_rebooking_until_confirmation(monkeypatch: pytest.MonkeyPatch) -> None:
  confirmed_at = datetime(2026, 7, 10, tzinfo=timezone.utc)
  confirmed = _chat_booking_row("booking-confirmed", "completed", confirmed_at, confirmed_at)
  pending = _chat_booking_row(
    "booking-pending",
    "requested",
    datetime(2026, 7, 13, tzinfo=timezone.utc),
  )
  requested_message_booking_ids: list[list[str]] = []

  async def fake_booking_rows(_db, _account):
    return [pending, confirmed]

  async def fake_messages(_db, booking_ids: list[str], _thread_id: str):
    requested_message_booking_ids.append(booking_ids)
    return []

  async def fake_customer(*_args):
    return {"id": "customer-1", "name": "고객"}

  async def fake_expert(_account):
    return {"id": "exp-sea", "name": "김세아"}

  async def fake_reports(*_args):
    return []

  monkeypatch.setattr(consulting_partner_service, "_booking_rows", fake_booking_rows)
  monkeypatch.setattr(consulting_partner_service, "_messages_for_bookings", fake_messages)
  monkeypatch.setattr(consulting_partner_service, "customer_detail_for_user", fake_customer)
  monkeypatch.setattr(consulting_partner_service, "expert_profile", fake_expert)
  monkeypatch.setattr(consulting_partner_service, "shared_reports_for_booking", fake_reports)

  threads = await consulting_partner_service.chat_threads_for_account(object(), PARTNER_ACCOUNT)

  assert len(threads) == 1
  assert threads[0]["booking"]["id"] == "booking-confirmed"
  assert requested_message_booking_ids == [["booking-confirmed"]]


def test_partner_chat_visibility_requires_confirmed_reservation() -> None:
  now = datetime(2026, 7, 13, tzinfo=timezone.utc)

  assert consulting_partner_service._is_chat_visible_booking_row(_chat_booking_row("1", "requested", now)) is False
  assert consulting_partner_service._is_chat_visible_booking_row(_chat_booking_row("2", "contacting", now, now)) is False
  assert consulting_partner_service._is_chat_visible_booking_row(_chat_booking_row("3", "confirmed", now, now)) is True
  assert consulting_partner_service._is_chat_visible_booking_row(_chat_booking_row("4", "cancelled", now)) is False
  assert consulting_partner_service._is_chat_visible_booking_row(_chat_booking_row("5", "cancelled", now, now)) is True


def test_customer_chat_visibility_requires_confirmed_reservation() -> None:
  now = datetime(2026, 7, 13, tzinfo=timezone.utc)

  assert consulting_service.is_customer_chat_available(_chat_booking_row("1", "requested", now)) is False
  assert consulting_service.is_customer_chat_available(_chat_booking_row("2", "contacting", now, now)) is False
  assert consulting_service.is_customer_chat_available(_chat_booking_row("3", "confirmed", now, now)) is True
  assert consulting_service.is_customer_chat_available(_chat_booking_row("4", "cancelled", now)) is False
  assert consulting_service.is_customer_chat_available(_chat_booking_row("5", "cancelled", now, now)) is True


@pytest.mark.asyncio
async def test_booking_confirmation_message_is_idempotent_and_broadcast_once(monkeypatch: pytest.MonkeyPatch) -> None:
  created: list[dict] = []
  broadcasts: list[tuple[str, dict]] = []

  async def fake_create_message(_db, **kwargs):
    created.append(kwargs)
    return ({"type": "message.created", "body": kwargs["body"]}, len(created) == 1)

  async def fake_broadcast(booking_id: str, event: dict):
    broadcasts.append((booking_id, event))

  monkeypatch.setattr(partner_api, "create_consulting_message", fake_create_message)
  monkeypatch.setattr(partner_api.consulting_realtime_manager, "broadcast", fake_broadcast)

  await partner_api._send_booking_confirmation_message(object(), PARTNER_ACCOUNT, "booking-1")
  await partner_api._send_booking_confirmation_message(object(), PARTNER_ACCOUNT, "booking-1")

  assert created[0]["client_message_id"] == "booking-confirmed-booking-1"
  assert created[0]["body"] == partner_api.BOOKING_CONFIRMED_MESSAGE
  assert len(broadcasts) == 1


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
async def test_partner_text_fallback_allows_completed_conversation_and_broadcasts(monkeypatch: pytest.MonkeyPatch) -> None:
  broadcasts: list[tuple[str, dict]] = []

  async def fake_thread_detail(*_args):
    return {
      "booking": {"id": "booking-1", "status": "completed"},
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
