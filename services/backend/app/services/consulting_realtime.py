from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from fastapi import WebSocket


ParticipantType = Literal["user", "expert", "operator"]

MAX_MESSAGE_BODY_LENGTH = 1000
MAX_MESSAGE_MEDIA_COUNT = 10


def utc_now_iso() -> str:
  return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass(eq=False)
class RealtimeConnection:
  websocket: WebSocket
  booking_id: str
  participant_type: ParticipantType
  participant_name: str
  connection_id: str = field(default_factory=lambda: str(uuid4()))


class ConsultingRealtimeManager:
  def __init__(self) -> None:
    self._lock = asyncio.Lock()
    self._rooms: dict[str, set[RealtimeConnection]] = {}
    self._message_ids_by_client_id: dict[str, dict[str, dict[str, str]]] = {}

  async def connect(
    self,
    websocket: WebSocket,
    *,
    booking_id: str,
    participant_name: str,
    participant_type: ParticipantType,
  ) -> RealtimeConnection:
    await websocket.accept()
    connection = RealtimeConnection(
      websocket=websocket,
      booking_id=booking_id,
      participant_name=participant_name,
      participant_type=participant_type,
    )

    async with self._lock:
      self._rooms.setdefault(booking_id, set()).add(connection)

    try:
      await self.send(
        connection,
        {
          "type": "connected",
          "bookingId": booking_id,
          "connectionId": connection.connection_id,
          "participantType": participant_type,
        },
      )
      await self.broadcast_presence(booking_id)
    except Exception:
      await self._remove_connections([connection])
      raise
    return connection

  async def disconnect(self, connection: RealtimeConnection) -> None:
    async with self._lock:
      room = self._rooms.get(connection.booking_id)
      if room is not None:
        room.discard(connection)
        if not room:
          self._rooms.pop(connection.booking_id, None)
          self._message_ids_by_client_id.pop(connection.booking_id, None)

    await self.broadcast_presence(connection.booking_id)

  async def send(self, connection: RealtimeConnection, payload: dict[str, Any]) -> None:
    await connection.websocket.send_json(payload)

  async def send_error(
    self,
    connection: RealtimeConnection,
    *,
    code: str,
    message: str,
    client_message_id: str | None = None,
  ) -> None:
    payload: dict[str, Any] = {
      "type": "error",
      "code": code,
      "message": message,
    }
    if client_message_id:
      payload["clientMessageId"] = client_message_id

    await self.send(connection, payload)

  async def broadcast(self, booking_id: str, payload: dict[str, Any]) -> None:
    async with self._lock:
      connections = list(self._rooms.get(booking_id, set()))

    async def safe_send(connection: RealtimeConnection) -> RealtimeConnection | None:
      try:
        await self.send(connection, payload)
        return None
      except Exception:
        return connection

    results = await asyncio.gather(*(safe_send(connection) for connection in connections))
    failed_connections = [connection for connection in results if connection is not None]

    if failed_connections:
      await self._remove_connections(failed_connections)

  async def _remove_connections(self, connections: list[RealtimeConnection]) -> None:
    async with self._lock:
      for connection in connections:
        room = self._rooms.get(connection.booking_id)
        if room is None:
          continue
        room.discard(connection)
        if not room:
          self._rooms.pop(connection.booking_id, None)
          self._message_ids_by_client_id.pop(connection.booking_id, None)

  async def broadcast_presence(self, booking_id: str) -> None:
    async with self._lock:
      connections = list(self._rooms.get(booking_id, set()))

    if not connections:
      return

    counts: dict[ParticipantType, int] = {"user": 0, "expert": 0, "operator": 0}
    for connection in connections:
      counts[connection.participant_type] += 1

    participants = [
      {
        "participantType": participant_type,
        "connectionCount": count,
      }
      for participant_type, count in counts.items()
      if count > 0
    ]

    await self.broadcast(
      booking_id,
      {
        "type": "presence",
        "bookingId": booking_id,
        "participants": participants,
      },
    )

  async def accept_message_send(
    self,
    connection: RealtimeConnection,
    *,
    body: str,
    client_message_id: str,
    media_ids: list[str],
    media: list[dict[str, Any]] | None = None,
  ) -> None:
    async with self._lock:
      room_messages = self._message_ids_by_client_id.setdefault(connection.booking_id, {})
      existing = room_messages.get(client_message_id)
      should_broadcast = existing is None
      if existing is None:
        existing = {
          "messageId": str(uuid4()),
          "sentAt": utc_now_iso(),
        }
        room_messages[client_message_id] = existing

    await self.send(
      connection,
      {
        "type": "message.ack",
        "bookingId": connection.booking_id,
        "clientMessageId": client_message_id,
        "messageId": existing["messageId"],
        "sentAt": existing["sentAt"],
      },
    )

    if not should_broadcast:
      return

    await self.broadcast(
      connection.booking_id,
      {
        "type": "message.new",
        "id": existing["messageId"],
        "bookingId": connection.booking_id,
        "clientMessageId": client_message_id,
        "senderType": connection.participant_type,
        "senderName": connection.participant_name,
        "body": body,
        "media": media or [],
        "mediaIds": media_ids,
        "sentAt": existing["sentAt"],
      },
    )

  async def deliver_message(
    self,
    connection: RealtimeConnection,
    *,
    message: dict[str, Any],
    should_broadcast: bool = True,
  ) -> None:
    client_message_id = message.get("clientMessageId")
    if isinstance(client_message_id, str) and client_message_id:
      await self.send(
        connection,
        {
          "type": "message.ack",
          "bookingId": connection.booking_id,
          "clientMessageId": client_message_id,
          "messageId": message["id"],
          "sentAt": message["sentAt"],
        },
      )

    if should_broadcast:
      await self.broadcast(connection.booking_id, message)

  def room_size(self, booking_id: str) -> int:
    return len(self._rooms.get(booking_id, set()))

  async def reset(self) -> None:
    async with self._lock:
      self._rooms.clear()
      self._message_ids_by_client_id.clear()


consulting_realtime_manager = ConsultingRealtimeManager()
