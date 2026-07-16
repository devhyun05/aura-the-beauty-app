from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import WebSocket

from app.db.session import Database


logger = logging.getLogger(__name__)
NOTIFICATION_EVENT_CHANNEL = "aura_app_notifications"
LISTENER_RECONNECT_DELAY_SECONDS = 1


@dataclass(eq=False)
class NotificationRealtimeConnection:
  websocket: WebSocket
  user_id: str


class NotificationRealtimeManager:
  def __init__(self) -> None:
    self._lock = asyncio.Lock()
    self._connections: dict[str, set[NotificationRealtimeConnection]] = {}

  async def connect(
    self,
    websocket: WebSocket,
    *,
    user_id: UUID | str,
  ) -> NotificationRealtimeConnection:
    await websocket.accept()
    connection = NotificationRealtimeConnection(
      websocket=websocket,
      user_id=str(user_id),
    )
    async with self._lock:
      self._connections.setdefault(connection.user_id, set()).add(connection)

    await websocket.send_json({"type": "connected"})
    return connection

  async def disconnect(self, connection: NotificationRealtimeConnection) -> None:
    async with self._lock:
      connections = self._connections.get(connection.user_id)
      if connections is None:
        return
      connections.discard(connection)
      if not connections:
        self._connections.pop(connection.user_id, None)

  async def send(
    self,
    connection: NotificationRealtimeConnection,
    payload: dict[str, Any],
  ) -> None:
    await connection.websocket.send_json(payload)

  async def broadcast(self, user_id: UUID | str, payload: dict[str, Any]) -> None:
    async with self._lock:
      connections = list(self._connections.get(str(user_id), set()))

    async def safe_send(
      connection: NotificationRealtimeConnection,
    ) -> NotificationRealtimeConnection | None:
      try:
        await self.send(connection, payload)
        return None
      except Exception:
        return connection

    results = await asyncio.gather(
      *(safe_send(connection) for connection in connections),
    )
    failed_connections = [
      connection for connection in results if connection is not None
    ]
    for connection in failed_connections:
      await self.disconnect(connection)


def _json_value(value: Any) -> Any:
  if isinstance(value, datetime):
    return value.isoformat()
  if isinstance(value, UUID):
    return str(value)
  return value


async def publish_notification_created(
  db: Database,
  notification: dict[str, Any],
) -> None:
  data = notification.get("data")
  if isinstance(data, str):
    try:
      data = json.loads(data)
    except json.JSONDecodeError:
      data = {}
  if not isinstance(data, dict):
    data = {}

  payload = {
    "type": "notification.created",
    "userId": str(notification["user_id"]),
    "notification": {
      "id": str(notification["id"]),
      "notificationType": str(notification["notification_type"]),
      "title": str(notification["title"]),
      "body": str(notification["body"]),
      "data": data,
      "readAt": None,
      "createdAt": _json_value(notification["created_at"]),
    },
  }
  await db.execute(
    "select pg_notify($1, $2)",
    NOTIFICATION_EVENT_CHANNEL,
    json.dumps(payload, ensure_ascii=False, default=_json_value),
  )


class NotificationDatabaseListener:
  def __init__(self) -> None:
    self._stop_event = asyncio.Event()
    self._task: asyncio.Task[None] | None = None

  async def start(self, db: Database) -> None:
    if self._task is not None or not db.is_connected:
      return
    self._stop_event.clear()
    self._task = asyncio.create_task(
      self._run(db),
      name="notification-database-listener",
    )

  async def stop(self) -> None:
    self._stop_event.set()
    task = self._task
    self._task = None
    if task is None:
      return
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)

  async def _run(self, db: Database) -> None:
    while not self._stop_event.is_set():
      pool = db.pool
      if pool is None:
        await asyncio.sleep(LISTENER_RECONNECT_DELAY_SECONDS)
        continue

      connection = None
      disconnected = asyncio.Event()

      def handle_notification(
        _connection: Any,
        _process_id: int,
        _channel: str,
        payload: str,
      ) -> None:
        asyncio.create_task(self._broadcast_payload(payload))

      def handle_termination(_connection: Any) -> None:
        disconnected.set()

      try:
        connection = await pool.acquire()
        await connection.add_listener(
          NOTIFICATION_EVENT_CHANNEL,
          handle_notification,
        )
        connection.add_termination_listener(handle_termination)

        stop_task = asyncio.create_task(self._stop_event.wait())
        disconnected_task = asyncio.create_task(disconnected.wait())
        _, pending = await asyncio.wait(
          {stop_task, disconnected_task},
          return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
          task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
      except asyncio.CancelledError:
        raise
      except Exception:
        logger.warning(
          "[aura:notifications] realtime-listener-reconnecting",
          exc_info=True,
        )
        await asyncio.sleep(LISTENER_RECONNECT_DELAY_SECONDS)
      finally:
        if connection is not None:
          try:
            await connection.remove_listener(
              NOTIFICATION_EVENT_CHANNEL,
              handle_notification,
            )
            connection.remove_termination_listener(handle_termination)
          except Exception:
            pass
          try:
            await pool.release(connection)
          except Exception:
            pass

  async def _broadcast_payload(self, raw_payload: str) -> None:
    try:
      payload = json.loads(raw_payload)
    except json.JSONDecodeError:
      return
    if not isinstance(payload, dict):
      return

    user_id = payload.pop("userId", None)
    if not isinstance(user_id, str) or not user_id:
      return
    await notification_realtime_manager.broadcast(user_id, payload)


notification_realtime_manager = NotificationRealtimeManager()
notification_database_listener = NotificationDatabaseListener()
