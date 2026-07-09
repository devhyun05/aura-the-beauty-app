import pytest
from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app
from app.services.consulting_message_store import create_consulting_message, message_row_to_event
from app.services.consulting_realtime import ConsultingRealtimeManager


class FakeWebSocket:
  def __init__(self) -> None:
    self.accepted = False
    self.sent: list[dict] = []

  async def accept(self) -> None:
    self.accepted = True

  async def send_json(self, payload: dict) -> None:
    self.sent.append(payload)


def _drain_connected(socket) -> None:
  assert socket.receive_json()["type"] == "connected"
  assert socket.receive_json()["type"] == "presence"
  history = socket.receive_json()
  assert history["type"] == "message.history"
  assert history["messages"] == []


@pytest.mark.asyncio
async def test_realtime_manager_broadcasts_only_within_booking_room() -> None:
  manager = ConsultingRealtimeManager()
  booking_a_user = FakeWebSocket()
  booking_a_expert = FakeWebSocket()
  booking_b_expert = FakeWebSocket()

  room_a_user = await manager.connect(
    booking_a_user,
    booking_id="booking-a",
    participant_name="고객",
    participant_type="user",
  )
  await manager.connect(
    booking_a_expert,
    booking_id="booking-a",
    participant_name="상담사",
    participant_type="expert",
  )
  await manager.connect(
    booking_b_expert,
    booking_id="booking-b",
    participant_name="다른 상담사",
    participant_type="expert",
  )

  await manager.accept_message_send(
    room_a_user,
    body="안녕하세요",
    client_message_id="client-1",
    media_ids=[],
  )

  assert any(event["type"] == "message.new" and event["body"] == "안녕하세요" for event in booking_a_user.sent)
  assert any(event["type"] == "message.new" and event["body"] == "안녕하세요" for event in booking_a_expert.sent)
  assert not any(event["type"] == "message.new" for event in booking_b_expert.sent)


@pytest.mark.asyncio
async def test_realtime_manager_acknowledges_duplicate_without_rebroadcast() -> None:
  manager = ConsultingRealtimeManager()
  sender_socket = FakeWebSocket()
  receiver_socket = FakeWebSocket()
  sender = await manager.connect(
    sender_socket,
    booking_id="booking-dup",
    participant_name="고객",
    participant_type="user",
  )
  await manager.connect(
    receiver_socket,
    booking_id="booking-dup",
    participant_name="상담사",
    participant_type="expert",
  )

  await manager.accept_message_send(sender, body="한 번만", client_message_id="same-id", media_ids=[])
  await manager.accept_message_send(sender, body="한 번만", client_message_id="same-id", media_ids=[])

  receiver_messages = [event for event in receiver_socket.sent if event["type"] == "message.new"]
  sender_acks = [event for event in sender_socket.sent if event["type"] == "message.ack"]
  assert len(receiver_messages) == 1
  assert len(sender_acks) == 2
  assert sender_acks[0]["messageId"] == sender_acks[1]["messageId"]


def test_consulting_websocket_relays_message_between_clients() -> None:
  client = TestClient(create_app(Settings(auth_required=False)))

  with client.websocket_connect("/api/consulting/ws/bookings/booking-1?participantType=user") as user_socket:
    _drain_connected(user_socket)

    with client.websocket_connect("/api/consulting/ws/bookings/booking-1?participantType=expert") as expert_socket:
      _drain_connected(expert_socket)
      assert user_socket.receive_json()["type"] == "presence"

      user_socket.send_json(
        {
          "type": "message.send",
          "bookingId": "booking-1",
          "clientMessageId": "mobile-1",
          "body": "상담 전에 질문 있어요.",
        },
      )

      ack = user_socket.receive_json()
      echoed = user_socket.receive_json()
      received = expert_socket.receive_json()

      assert ack["type"] == "message.ack"
      assert ack["clientMessageId"] == "mobile-1"
      assert echoed["type"] == "message.new"
      assert received["type"] == "message.new"
      assert received["body"] == "상담 전에 질문 있어요."
      assert received["senderType"] == "user"


def test_consulting_websocket_reports_invalid_json_event() -> None:
  client = TestClient(create_app(Settings(auth_required=False)))

  with client.websocket_connect("/api/consulting/ws/bookings/booking-1") as socket:
    _drain_connected(socket)
    socket.send_text("not-json")

    error = socket.receive_json()
    assert error["type"] == "error"
    assert error["code"] == "INVALID_EVENT"


def test_message_row_to_event_maps_persisted_message_contract() -> None:
  event = message_row_to_event(
    {
      "id": "message-1",
      "booking_id": "booking-1",
      "client_message_id": "client-1",
      "sender_type": "user",
      "sender_name": "고객",
      "body": "사진 확인 부탁드려요.",
      "created_at": "2026-07-08T00:00:00Z",
      "media": [
        {
          "id": "media-1",
          "cdnUrl": "https://cdn.example.com/image.jpg",
          "thumbnailUrl": "https://cdn.example.com/thumb.jpg",
          "contentType": "image/jpeg",
        },
      ],
    },
  )

  assert event == {
    "type": "message.new",
    "id": "message-1",
    "bookingId": "booking-1",
    "clientMessageId": "client-1",
    "senderType": "user",
    "senderName": "고객",
    "body": "사진 확인 부탁드려요.",
    "media": [
      {
        "id": "media-1",
        "cdnUrl": "https://cdn.example.com/image.jpg",
        "thumbnailUrl": "https://cdn.example.com/thumb.jpg",
        "contentType": "image/jpeg",
      },
    ],
    "mediaIds": ["media-1"],
    "sentAt": "2026-07-08T00:00:00Z",
  }


class FakeConsultingMessageDatabase:
  is_connected = True

  def __init__(self) -> None:
    self.executed: list[tuple[str, tuple]] = []

  async def fetchrow(self, query: str, *args):
    if "insert into consulting_messages" in query:
      return {
        "id": "11111111-1111-1111-1111-111111111111",
        "booking_id": args[0],
        "client_message_id": args[1],
        "sender_type": args[2],
        "sender_name": args[4],
        "body": args[5],
        "created_at": "2026-07-08T00:00:00Z",
        "inserted": True,
      }

    if "from consulting_messages m" in query:
      return {
        "id": args[0],
        "booking_id": "22222222-2222-2222-2222-222222222222",
        "client_message_id": "client-1",
        "sender_type": "user",
        "sender_name": "고객",
        "body": "저장되는 메시지",
        "created_at": "2026-07-08T00:00:00Z",
        "media": [
          {
            "id": "33333333-3333-3333-3333-333333333333",
            "cdnUrl": "https://cdn.example.com/image.jpg",
            "thumbnailUrl": None,
            "contentType": "image/jpeg",
          },
        ],
      }

    return None

  async def execute(self, query: str, *args):
    self.executed.append((query, args))
    return "INSERT 0 1"


@pytest.mark.asyncio
async def test_create_consulting_message_persists_media_links() -> None:
  db = FakeConsultingMessageDatabase()

  message, was_inserted = await create_consulting_message(
    db,
    booking_id="22222222-2222-2222-2222-222222222222",
    body="저장되는 메시지",
    client_message_id="client-1",
    media=[
      {
        "id": "33333333-3333-3333-3333-333333333333",
        "cdnUrl": "https://cdn.example.com/image.jpg",
      },
    ],
    sender_name="고객",
    sender_type="user",
    sender_user_id=None,
  )

  assert was_inserted is True
  assert message["id"] == "11111111-1111-1111-1111-111111111111"
  assert message["mediaIds"] == ["33333333-3333-3333-3333-333333333333"]
  assert len(db.executed) == 1
  assert db.executed[0][1] == (
    "11111111-1111-1111-1111-111111111111",
    "33333333-3333-3333-3333-333333333333",
    0,
  )
