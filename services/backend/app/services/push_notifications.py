from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Iterable
from typing import Any
from uuid import UUID

import httpx

from app.core.settings import Settings
from app.db.session import Database
from app.services.notification_realtime import publish_notification_created


logger = logging.getLogger(__name__)
EXPO_PUSH_TOKEN_PATTERN = re.compile(r"^(?:Expo|Exponent)PushToken\[[^\]]+\]$")
EXPO_PUSH_BATCH_SIZE = 100
MAX_PUSH_ATTEMPTS = 3
PUSH_SUPPRESSION_GRACE_SECONDS = 1.0
REPORT_NOTIFICATION_TYPES = frozenset(
  {
    "analysis_report_completed",
    "makeup_recommendation_completed",
    "makeup_feedback_completed",
    "filter_extraction_completed",
  },
)


def is_expo_push_token(value: str) -> bool:
  return bool(EXPO_PUSH_TOKEN_PATTERN.fullmatch(value.strip()))


def _chunks(values: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
  for index in range(0, len(values), size):
    yield values[index:index + size]


def _ticket_items(payload: object) -> list[dict[str, Any]]:
  if not isinstance(payload, dict):
    return []

  data = payload.get("data")

  if isinstance(data, dict):
    return [data]

  if isinstance(data, list):
    return [item for item in data if isinstance(item, dict)]

  return []


async def _disable_unregistered_tokens(
  db: Database,
  tokens: list[str],
  tickets: list[dict[str, Any]],
) -> None:
  invalid_tokens = [
    token
    for token, ticket in zip(tokens, tickets, strict=False)
    if ticket.get("status") == "error"
    and isinstance(ticket.get("details"), dict)
    and ticket["details"].get("error") == "DeviceNotRegistered"
  ]

  if not invalid_tokens:
    return

  await db.execute(
    """
    update user_push_devices
    set enabled = false, updated_at = now()
    where expo_push_token = any($1::text[])
    """,
    invalid_tokens,
  )


async def _send_expo_messages(
  db: Database,
  settings: Settings,
  messages: list[dict[str, Any]],
) -> tuple[int, list[str]]:
  accepted_count = 0
  errors: list[str] = []
  headers = {
    "Accept": "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  }

  if settings.expo_push_access_token:
    headers["Authorization"] = f"Bearer {settings.expo_push_access_token}"

  async with httpx.AsyncClient(timeout=15) as client:
    for batch in _chunks(messages, EXPO_PUSH_BATCH_SIZE):
      response = await client.post(
        settings.expo_push_endpoint,
        headers=headers,
        json=batch,
      )
      response.raise_for_status()
      tickets = _ticket_items(response.json())
      tokens = [str(message["to"]) for message in batch]
      await _disable_unregistered_tokens(db, tokens, tickets)

      for index, ticket in enumerate(tickets):
        if ticket.get("status") == "ok":
          accepted_count += 1
          continue

        message = ticket.get("message")
        details = ticket.get("details")
        errors.append(
          json.dumps(
            {
              "token": tokens[index] if index < len(tokens) else None,
              "message": message,
              "details": details,
            },
            ensure_ascii=False,
          ),
        )

      if len(tickets) < len(batch):
        errors.append("Expo Push Service returned fewer tickets than messages.")

  return accepted_count, errors


async def _deliver_notification(
  db: Database,
  settings: Settings,
  notification_id: UUID,
) -> None:
  notification = await db.fetchrow(
    """
    select id, user_id, notification_type, title, body, data
    from app_notifications
    where id = $1
      and read_at is null
    """,
    notification_id,
  )

  if notification is None:
    await db.execute(
      """
      update notification_outbox
      set status = 'completed',
          completed_at = now(),
          last_error = 'notification-viewed-before-push',
          updated_at = now()
      where notification_id = $1
        and status in ('pending', 'failed', 'sending')
      """,
      notification_id,
    )
    return

  outbox = await db.fetchrow(
    """
    update notification_outbox
    set status = 'sending',
        attempts = attempts + 1,
        updated_at = now()
    where notification_id = $1
      and status in ('pending', 'failed')
      and attempts < $2
      and next_attempt_at <= now()
    returning id, attempts
    """,
    notification_id,
    MAX_PUSH_ATTEMPTS,
  )

  if outbox is None:
    return

  devices = await db.fetch(
    """
    select expo_push_token
    from user_push_devices
    where user_id = $1 and enabled = true
    order by last_seen_at desc
    """,
    notification["user_id"],
  )
  tokens = [
    str(device["expo_push_token"])
    for device in devices
    if is_expo_push_token(str(device.get("expo_push_token") or ""))
  ]

  if not settings.push_notifications_enabled or not tokens:
    await db.execute(
      """
      update notification_outbox
      set status = 'completed',
          completed_at = now(),
          last_error = $2,
          updated_at = now()
      where notification_id = $1
      """,
      notification_id,
      "push-disabled" if not settings.push_notifications_enabled else "no-active-devices",
    )
    return

  notification_data = notification.get("data")
  if isinstance(notification_data, str):
    try:
      notification_data = json.loads(notification_data)
    except json.JSONDecodeError:
      notification_data = {}
  if not isinstance(notification_data, dict):
    notification_data = {}

  messages = [
    {
      "to": token,
      "sound": "default",
      "title": notification["title"],
      "body": notification["body"],
      "data": {
        **notification_data,
        "notificationId": str(notification_id),
        "type": notification["notification_type"],
      },
      "priority": "high",
      "channelId": "reports",
    }
    for token in tokens
  ]

  try:
    accepted_count, errors = await _send_expo_messages(db, settings, messages)
  except Exception as exc:  # noqa: BLE001 - report completion must remain successful.
    logger.warning(
      "[aura:notifications] push-send-failed notificationId=%s",
      notification_id,
      exc_info=True,
    )
    await db.execute(
      """
      update notification_outbox
      set status = 'failed',
          last_error = $2,
          next_attempt_at = now() + interval '5 minutes',
          updated_at = now()
      where notification_id = $1
      """,
      notification_id,
      str(exc)[:1000],
    )
    return

  status = "completed" if accepted_count > 0 or not errors else "failed"
  await db.execute(
    """
    update notification_outbox
    set status = $2,
        completed_at = case when $2 = 'completed' then now() else completed_at end,
        last_error = $3,
        next_attempt_at = case
          when $2 = 'failed' then now() + interval '5 minutes'
          else next_attempt_at
        end,
        updated_at = now()
    where notification_id = $1
    """,
    notification_id,
    status,
    "\n".join(errors)[:1000] if errors else None,
  )


async def create_and_send_notification(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  notification_type: str,
  title: str,
  body: str,
  data: dict[str, Any],
  dedupe_key: str,
) -> None:
  """Persist an in-app notification and best-effort its remote push.

  Notification failures are deliberately isolated from the report job that
  triggered them. The unique dedupe key makes completion retries safe.
  """

  if notification_type not in REPORT_NOTIFICATION_TYPES:
    logger.info(
      "[aura:notifications] unsupported-type-skipped type=%s userId=%s",
      notification_type,
      user_id,
    )
    return

  try:
    notification = await db.fetchrow(
      """
      insert into app_notifications (
        user_id, notification_type, title, body, data, dedupe_key
      )
      values ($1, $2, $3, $4, $5::jsonb, $6)
      on conflict (user_id, dedupe_key) do nothing
      returning
        id,
        user_id,
        notification_type,
        title,
        body,
        data,
        created_at
      """,
      user_id,
      notification_type,
      title,
      body,
      json.dumps(data, ensure_ascii=False),
      dedupe_key,
    )
    notification_created = notification is not None

    if notification is None:
      notification = await db.fetchrow(
        """
        select
          id,
          user_id,
          notification_type,
          title,
          body,
          data,
          created_at
        from app_notifications
        where user_id = $1 and dedupe_key = $2
        """,
        user_id,
        dedupe_key,
      )

    if notification is None:
      return

    await db.execute(
      """
      insert into notification_outbox (notification_id)
      values ($1)
      on conflict (notification_id) do nothing
      """,
      notification["id"],
    )
    if notification_created:
      try:
        await publish_notification_created(db, notification)
      except Exception:  # noqa: BLE001 - remote push must still be attempted.
        logger.warning(
          "[aura:notifications] realtime-publish-failed notificationId=%s",
          notification["id"],
          exc_info=True,
        )
      if settings.push_notifications_enabled:
        # The foreground app removes or marks this notification as read when
        # the user is already waiting for or viewing the matching report.
        # Give that realtime acknowledgement a short window before APNs/Expo
        # delivery, then _deliver_notification rechecks the unread row.
        await asyncio.sleep(PUSH_SUPPRESSION_GRACE_SECONDS)
    await _deliver_notification(db, settings, notification["id"])
  except Exception:  # noqa: BLE001 - notification delivery is fail-open.
    logger.warning(
      "[aura:notifications] create-or-send-failed type=%s userId=%s dedupeKey=%s",
      notification_type,
      user_id,
      dedupe_key,
      exc_info=True,
    )
