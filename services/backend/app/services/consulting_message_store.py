from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.db.session import Database
from app.services.consulting_realtime import ParticipantType


DEFAULT_CONSULTING_MESSAGE_HISTORY_LIMIT = 50


def _decode_json(value: Any, fallback: Any) -> Any:
  if value is None:
    return fallback

  if isinstance(value, str):
    try:
      return json.loads(value)
    except json.JSONDecodeError:
      return fallback

  return value


def _iso_datetime(value: Any) -> str:
  if isinstance(value, datetime):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

  if isinstance(value, str):
    return value

  return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _message_media(value: Any) -> list[dict[str, Any]]:
  raw_media = _decode_json(value, [])
  if not isinstance(raw_media, list):
    return []

  media: list[dict[str, Any]] = []
  for item in raw_media:
    if not isinstance(item, dict):
      continue

    media_id = item.get("id")
    if not isinstance(media_id, str) or not media_id:
      continue

    media.append(
      {
        "id": media_id,
        "cdnUrl": item.get("cdnUrl"),
        "thumbnailUrl": item.get("thumbnailUrl"),
        "contentType": item.get("contentType"),
      },
    )

  return media


def message_row_to_event(row: dict[str, Any]) -> dict[str, Any]:
  media = _message_media(row.get("media"))
  return {
    "type": "message.new",
    "id": str(row["id"]),
    "bookingId": str(row["booking_id"]),
    "clientMessageId": row.get("client_message_id"),
    "senderType": row["sender_type"],
    "senderName": row.get("sender_name") or "상담",
    "body": row.get("body") or "",
    "media": media,
    "mediaIds": [item["id"] for item in media],
    "sentAt": _iso_datetime(row.get("created_at")),
  }


async def list_consulting_messages(
  db: Database,
  *,
  booking_id: str,
  booking_ids: list[str] | None = None,
  limit: int = DEFAULT_CONSULTING_MESSAGE_HISTORY_LIMIT,
) -> list[dict[str, Any]]:
  bounded_limit = min(max(limit, 1), 100)
  conversation_booking_ids = booking_ids or [booking_id]
  rows = await db.fetch(
    """
    select
      m.id::text as id,
      m.booking_id::text as booking_id,
      m.client_message_id,
      m.sender_type,
      m.sender_name,
      m.body,
      m.created_at,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', cmm.media_id::text,
            'cdnUrl', media.cdn_url,
            'thumbnailUrl', media.thumbnail_cdn_url,
            'contentType', media.content_type
          )
          order by cmm.sort_order asc
        ) filter (where cmm.media_id is not null),
        '[]'::jsonb
      ) as media
    from consulting_messages m
    left join consulting_message_media cmm on cmm.message_id = m.id
    left join media_assets media on media.id = cmm.media_id and media.deleted_at is null
    where m.booking_id::text = any($1::text[])
      and m.deleted_at is null
    group by
      m.id,
      m.booking_id,
      m.client_message_id,
      m.sender_type,
      m.sender_name,
      m.body,
      m.created_at
    order by m.created_at desc, m.id desc
    limit $2
    """,
    conversation_booking_ids,
    bounded_limit,
  )

  return [message_row_to_event(row) for row in reversed(rows)]


async def list_consulting_conversation_messages(
  db: Database,
  *,
  booking_id: str,
  limit: int = DEFAULT_CONSULTING_MESSAGE_HISTORY_LIMIT,
) -> list[dict[str, Any]]:
  booking = await db.fetchrow(
    "select coalesce(conversation_id, id) as conversation_id from consulting_bookings where id::text = $1",
    booking_id,
  )
  if booking is None:
    return await list_consulting_messages(db, booking_id=booking_id, limit=limit)

  rows = await db.fetch(
    """
    select id::text as id
    from consulting_bookings
    where coalesce(conversation_id, id) = $1
    order by created_at desc
    """,
    booking["conversation_id"],
  )
  booking_ids = [str(row["id"]) for row in rows] or [booking_id]
  return await list_consulting_messages(
    db,
    booking_id=booking_id,
    booking_ids=booking_ids,
    limit=limit,
  )


async def get_consulting_message(db: Database, message_id: str) -> dict[str, Any] | None:
  row = await db.fetchrow(
    """
    select
      m.id::text as id,
      m.booking_id::text as booking_id,
      m.client_message_id,
      m.sender_type,
      m.sender_name,
      m.body,
      m.created_at,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', cmm.media_id::text,
            'cdnUrl', media.cdn_url,
            'thumbnailUrl', media.thumbnail_cdn_url,
            'contentType', media.content_type
          )
          order by cmm.sort_order asc
        ) filter (where cmm.media_id is not null),
        '[]'::jsonb
      ) as media
    from consulting_messages m
    left join consulting_message_media cmm on cmm.message_id = m.id
    left join media_assets media on media.id = cmm.media_id and media.deleted_at is null
    where m.id::text = $1
      and m.deleted_at is null
    group by
      m.id,
      m.booking_id,
      m.client_message_id,
      m.sender_type,
      m.sender_name,
      m.body,
      m.created_at
    limit 1
    """,
    message_id,
  )

  return message_row_to_event(row) if row else None


async def create_consulting_message(
  db: Database,
  *,
  booking_id: str,
  body: str,
  client_message_id: str,
  media: list[dict[str, Any]],
  sender_name: str,
  sender_type: ParticipantType,
  sender_user_id: UUID | None,
) -> tuple[dict[str, Any], bool]:
  row = await db.fetchrow(
    """
    insert into consulting_messages (
      booking_id,
      client_message_id,
      sender_type,
      sender_user_id,
      sender_name,
      body
    )
    values ($1::uuid, $2, $3, $4, $5, $6)
    on conflict (booking_id, sender_type, client_message_id)
    do update set client_message_id = consulting_messages.client_message_id
    returning
      id::text as id,
      booking_id::text as booking_id,
      client_message_id,
      sender_type,
      sender_name,
      body,
      created_at,
      (xmax = 0) as inserted
    """,
    booking_id,
    client_message_id,
    sender_type,
    sender_user_id,
    sender_name,
    body,
  )

  if row is None:
    raise RuntimeError("Consulting message insert did not return a row.")

  was_inserted = bool(row.get("inserted"))
  if was_inserted:
    for sort_order, media_item in enumerate(media):
      await db.execute(
        """
        insert into consulting_message_media (message_id, media_id, sort_order)
        values ($1::uuid, $2::uuid, $3)
        on conflict do nothing
        """,
        row["id"],
        media_item["id"],
        sort_order,
      )

  stored_message = await get_consulting_message(db, row["id"])
  if stored_message is not None:
    return stored_message, was_inserted

  return message_row_to_event({**row, "media": media}), was_inserted
