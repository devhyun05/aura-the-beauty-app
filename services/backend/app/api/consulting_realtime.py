import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.core.security import AuthContext, verify_cognito_token
from app.core.settings import Settings, get_settings
from app.db.session import database
from app.services.consulting_message_store import (
  create_consulting_message,
  list_consulting_conversation_messages,
)
from app.services.consulting_partner import auth_context_for_partner_token
from app.services.consulting_realtime import (
  MAX_MESSAGE_BODY_LENGTH,
  MAX_MESSAGE_MEDIA_COUNT,
  ParticipantType,
  RealtimeConnection,
  consulting_realtime_manager,
)
from app.services.users import ensure_user


router = APIRouter(prefix="/consulting", tags=["consulting"])
logger = logging.getLogger(__name__)


def _parse_client_datetime(value: Any) -> datetime | None:
  if not isinstance(value, str) or not value.strip():
    return None

  try:
    parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
  except ValueError:
    return None

  if parsed.tzinfo is None:
    return parsed.replace(tzinfo=timezone.utc)

  return parsed.astimezone(timezone.utc)


def _dev_auth_context(settings: Settings) -> AuthContext:
  return AuthContext(
    subject=settings.dev_user_sub,
    provider="google",
    email=settings.dev_user_email,
    name=settings.dev_user_name,
    claims={"token_use": "dev", "sub": settings.dev_user_sub},
  )


def _extract_token(websocket: WebSocket) -> str | None:
  authorization = websocket.headers.get("authorization")
  if authorization and authorization.lower().startswith("bearer "):
    return authorization.split(" ", 1)[1].strip() or None

  token = websocket.query_params.get("token")
  return token.strip() if token else None


async def _get_auth_context(websocket: WebSocket, settings: Settings) -> AuthContext | None:
  token = _extract_token(websocket)
  if token and database.is_connected:
    partner_auth = await auth_context_for_partner_token(database, token)
    if partner_auth is not None:
      return partner_auth

  if not settings.auth_required:
    return _dev_auth_context(settings)

  if not token:
    return None

  return await verify_cognito_token(token, settings)


def _get_requested_participant_type(websocket: WebSocket) -> ParticipantType:
  value = websocket.query_params.get("participantType") or websocket.query_params.get("participant_type")
  if value in {"user", "expert", "operator"}:
    return value

  return "user"


def _get_claim_expert_id(auth: AuthContext) -> str | None:
  for key in ("custom:expert_id", "expert_id", "expertId"):
    value = auth.claims.get(key)
    if isinstance(value, str) and value.strip():
      return value.strip()

  return None


def _has_operator_claim(auth: AuthContext) -> bool:
  groups = auth.claims.get("cognito:groups")
  if isinstance(groups, str):
    groups = [groups]

  if not isinstance(groups, list):
    return False

  normalized = {str(group).strip().lower() for group in groups}
  return bool(normalized.intersection({"admin", "operator", "business_manager"}))


def _participant_name(auth: AuthContext, participant_type: ParticipantType) -> str:
  if participant_type == "user":
    return auth.name or auth.email or "고객"

  if participant_type == "expert":
    return auth.name or auth.email or "상담사"

  return auth.name or auth.email or "운영팀"


async def _authorize_socket(
  *,
  auth: AuthContext,
  booking_id: str,
  participant_type: ParticipantType,
  settings: Settings,
) -> ParticipantType | None:
  if not database.is_connected:
    return participant_type if not settings.auth_required else None

  user = await ensure_user(database, auth)
  booking = await database.fetchrow(
    """
    select id::text as id, user_id, expert_id
    from consulting_bookings
    where id::text = $1
    limit 1
    """,
    booking_id,
  )

  if booking is None:
    return participant_type if not settings.auth_required else None

  if participant_type == "user":
    return "user" if str(booking["user_id"]) == str(user["id"]) else None

  if participant_type == "expert":
    if not settings.auth_required:
      return "expert"

    return "expert" if _get_claim_expert_id(auth) == booking["expert_id"] else None

  if participant_type == "operator":
    if not settings.auth_required:
      return "operator"

    return "operator" if _has_operator_claim(auth) else None

  return None


def _clean_string_list(value: Any) -> list[str]:
  if not isinstance(value, list):
    return []

  cleaned: list[str] = []
  for item in value:
    if isinstance(item, str) and item.strip():
      cleaned.append(item.strip())

  return cleaned


async def _validate_media_ids(
  *,
  connection: RealtimeConnection,
  media_ids: list[str],
  sender_user_id: UUID | None,
) -> tuple[bool, str | None, list[dict[str, Any]]]:
  if len(media_ids) > MAX_MESSAGE_MEDIA_COUNT:
    return False, f"메시지에는 이미지를 최대 {MAX_MESSAGE_MEDIA_COUNT}개까지 첨부할 수 있어요.", []

  for media_id in media_ids:
    try:
      UUID(media_id)
    except ValueError:
      return False, "첨부 이미지 식별자가 올바르지 않아요.", []

  if not database.is_connected or not media_ids:
    return True, None, [{"id": media_id} for media_id in media_ids]

  if connection.participant_type == "user" and sender_user_id is not None:
    rows = await database.fetch(
      """
      select
        id::text as id,
        cdn_url,
        thumbnail_cdn_url,
        content_type
      from media_assets
      where id::text = any($1::text[])
        and owner_user_id = $2
        and deleted_at is null
      """,
      media_ids,
      sender_user_id,
    )
  else:
    rows = await database.fetch(
      """
      select
        id::text as id,
        cdn_url,
        thumbnail_cdn_url,
        content_type
      from media_assets
      where id::text = any($1::text[])
        and deleted_at is null
      """,
      media_ids,
    )

  found = {row["id"] for row in rows}
  if any(media_id not in found for media_id in media_ids):
    return False, "첨부 이미지 권한을 확인하지 못했어요.", []

  rows_by_id = {row["id"]: row for row in rows}
  media = [
    {
      "id": media_id,
      "cdnUrl": rows_by_id[media_id].get("cdn_url"),
      "thumbnailUrl": rows_by_id[media_id].get("thumbnail_cdn_url"),
      "contentType": rows_by_id[media_id].get("content_type"),
    }
    for media_id in media_ids
  ]

  return True, None, media


async def _booking_accepts_new_messages(booking_id: str) -> bool:
  if not database.is_connected:
    return True
  row = await database.fetchrow(
    """
    select status, customer_left_at, expert_left_at
    from consulting_bookings
    where id::text = $1
    limit 1
    """,
    booking_id,
  )
  if row is None:
    return True
  return (
    str(row["status"]) not in {"canceled", "cancelled", "unavailable"}
    and row.get("customer_left_at") is None
    and row.get("expert_left_at") is None
  )


async def _handle_client_event(
  *,
  auth: AuthContext,
  connection: RealtimeConnection,
  payload: dict[str, Any],
  settings: Settings,
) -> None:
  event_type = payload.get("type")

  if event_type == "ping":
    await consulting_realtime_manager.send(
      connection,
      {
        "type": "pong",
        "at": payload.get("at"),
      },
    )
    return

  if event_type == "message.send":
    client_message_id = payload.get("clientMessageId")
    if not isinstance(client_message_id, str) or not client_message_id.strip():
      await consulting_realtime_manager.send_error(
        connection,
        code="CLIENT_MESSAGE_ID_REQUIRED",
        message="clientMessageId is required.",
      )
      return

    body = payload.get("body")
    body_text = body.strip() if isinstance(body, str) else ""
    media_ids = _clean_string_list(payload.get("mediaIds"))

    if not await _booking_accepts_new_messages(connection.booking_id):
      await consulting_realtime_manager.send_error(
        connection,
        code="BOOKING_CLOSED",
        message="취소된 예약에는 새 메시지를 보낼 수 없어요.",
        client_message_id=client_message_id,
      )
      return

    if not body_text and not media_ids:
      await consulting_realtime_manager.send_error(
        connection,
        code="EMPTY_MESSAGE",
        message="메시지 내용을 입력해 주세요.",
        client_message_id=client_message_id,
      )
      return

    if len(body_text) > MAX_MESSAGE_BODY_LENGTH:
      await consulting_realtime_manager.send_error(
        connection,
        code="MESSAGE_TOO_LONG",
        message="메시지는 1000자 이하로 입력해 주세요.",
        client_message_id=client_message_id,
      )
      return

    sender_user_id = None
    if database.is_connected:
      user = await ensure_user(database, auth)
      sender_user_id = user.get("id")

    valid_media, media_error, media = await _validate_media_ids(
      connection=connection,
      media_ids=media_ids,
      sender_user_id=sender_user_id,
    )
    if not valid_media:
      await consulting_realtime_manager.send_error(
        connection,
        code="INVALID_MEDIA",
        message=media_error or "첨부 이미지를 확인하지 못했어요.",
        client_message_id=client_message_id,
      )
      return

    if database.is_connected:
      try:
        message, was_inserted = await create_consulting_message(
          database,
          booking_id=connection.booking_id,
          body=body_text,
          client_message_id=client_message_id.strip(),
          media=media,
          sender_name=connection.participant_name,
          sender_type=connection.participant_type,
          sender_user_id=sender_user_id,
        )
      except Exception:
        logger.exception("Failed to persist consulting message.")
        await consulting_realtime_manager.send_error(
          connection,
          code="PERSISTENCE_FAILED",
          message="메시지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
          client_message_id=client_message_id,
        )
        return

      await consulting_realtime_manager.deliver_message(
        connection,
        message=message,
        should_broadcast=was_inserted,
      )
      return

    if settings.auth_required:
      await consulting_realtime_manager.send_error(
        connection,
        code="PERSISTENCE_UNAVAILABLE",
        message="메시지 저장소에 연결되지 않아 전송할 수 없어요.",
        client_message_id=client_message_id,
      )
      return

    await consulting_realtime_manager.accept_message_send(
      connection,
      body=body_text,
      client_message_id=client_message_id.strip(),
      media=media,
      media_ids=media_ids,
    )
    return

  if event_type == "typing":
    await consulting_realtime_manager.broadcast(
      connection.booking_id,
      {
        "type": "typing",
        "bookingId": connection.booking_id,
        "senderType": connection.participant_type,
        "isTyping": bool(payload.get("isTyping")),
      },
    )
    return

  if event_type == "read":
    read_at = payload.get("readAt")
    read_datetime = _parse_client_datetime(read_at)
    if database.is_connected and connection.participant_type in {"expert", "operator"}:
      await database.execute(
        """
        update consulting_bookings
        set expert_read_at = coalesce($2::timestamptz, now())
        where id::text = $1
        """,
        connection.booking_id,
        read_datetime,
      )
    await consulting_realtime_manager.broadcast(
      connection.booking_id,
      {
        "type": "read",
        "bookingId": connection.booking_id,
        "senderType": connection.participant_type,
        "readAt": read_at if isinstance(read_at, str) else None,
      },
    )
    return

  await consulting_realtime_manager.send_error(
    connection,
    code="UNSUPPORTED_EVENT",
    message="지원하지 않는 소켓 이벤트예요.",
  )


@router.websocket("/ws/bookings/{booking_id}")
async def consulting_booking_socket(
  websocket: WebSocket,
  booking_id: str,
  settings: Settings = Depends(get_settings),
) -> None:
  try:
    auth = await _get_auth_context(websocket, settings)
  except Exception:
    await websocket.close(code=1008)
    return

  if auth is None:
    await websocket.close(code=1008)
    return

  requested_participant_type = _get_requested_participant_type(websocket)
  participant_type = await _authorize_socket(
    auth=auth,
    booking_id=booking_id,
    participant_type=requested_participant_type,
    settings=settings,
  )

  if participant_type is None:
    await websocket.close(code=1008)
    return

  connection = await consulting_realtime_manager.connect(
    websocket,
    booking_id=booking_id,
    participant_name=_participant_name(auth, participant_type),
    participant_type=participant_type,
  )

  history: list[dict[str, Any]] = []
  if database.is_connected:
    try:
      history = await list_consulting_conversation_messages(database, booking_id=booking_id)
    except Exception:
      logger.exception("Failed to load consulting message history.")

  await consulting_realtime_manager.send(
    connection,
    {
      "type": "message.history",
      "bookingId": booking_id,
      "messages": history,
    },
  )

  try:
    while True:
      raw_payload = await websocket.receive_text()
      try:
        payload = json.loads(raw_payload)
      except json.JSONDecodeError:
        await consulting_realtime_manager.send_error(
          connection,
          code="INVALID_EVENT",
          message="소켓 이벤트 JSON을 해석하지 못했어요.",
        )
        continue

      if not isinstance(payload, dict):
        await consulting_realtime_manager.send_error(
          connection,
          code="INVALID_EVENT",
          message="소켓 이벤트 형식이 올바르지 않아요.",
        )
        continue

      await _handle_client_event(
        auth=auth,
        connection=connection,
        payload=payload,
        settings=settings,
      )
  except WebSocketDisconnect:
    pass
  finally:
    await consulting_realtime_manager.disconnect(connection)
