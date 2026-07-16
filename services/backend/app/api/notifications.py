from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.db.session import Database, require_database
from app.schemas.notifications import (
  PushDeviceRegistration,
  PushDeviceUnregistration,
)
from app.services.push_notifications import (
  REPORT_NOTIFICATION_TYPES,
  is_expo_push_token,
)
from app.services.users import ensure_user


router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/devices")
async def register_push_device(
  payload: PushDeviceRegistration,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  token = payload.expo_push_token.strip()
  if not is_expo_push_token(token):
    raise AppError(
      422,
      "EXPO_PUSH_TOKEN_INVALID",
      "A valid Expo push token is required.",
    )

  user = await ensure_user(db, auth)
  device = await db.fetchrow(
    """
    insert into user_push_devices (
      user_id, expo_push_token, platform, app_version
    )
    values ($1, $2, $3, $4)
    on conflict (expo_push_token) do update set
      user_id = excluded.user_id,
      platform = excluded.platform,
      app_version = excluded.app_version,
      enabled = true,
      last_seen_at = now(),
      updated_at = now()
    returning id, expo_push_token, platform, enabled, last_seen_at
    """,
    user["id"],
    token,
    payload.platform,
    payload.app_version,
  )
  return success({"device": device})


@router.delete("/devices")
async def unregister_push_device(
  payload: PushDeviceUnregistration,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  await db.execute(
    """
    update user_push_devices
    set enabled = false, updated_at = now()
    where user_id = $1 and expo_push_token = $2
    """,
    user["id"],
    payload.expo_push_token.strip(),
  )
  return success({"disabled": True})


@router.get("")
async def list_notifications(
  limit: int = Query(default=50, ge=1, le=100),
  offset: int = Query(default=0, ge=0),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  notifications = await db.fetch(
    """
    select id, notification_type, title, body, data, read_at, created_at
    from app_notifications
    where user_id = $1
      and notification_type = any($2::text[])
    order by created_at desc
    limit $3 offset $4
    """,
    user["id"],
    list(REPORT_NOTIFICATION_TYPES),
    limit,
    offset,
  )
  unread = await db.fetchrow(
    """
    select count(*)::integer as count
    from app_notifications
    where user_id = $1
      and notification_type = any($2::text[])
      and read_at is null
    """,
    user["id"],
    list(REPORT_NOTIFICATION_TYPES),
  )
  return success(
    {
      "notifications": notifications,
      "unread_count": int((unread or {}).get("count") or 0),
      "limit": limit,
      "offset": offset,
    },
  )


@router.get("/unread-count")
async def get_unread_notification_count(
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  row = await db.fetchrow(
    """
    select count(*)::integer as count
    from app_notifications
    where user_id = $1
      and notification_type = any($2::text[])
      and read_at is null
    """,
    user["id"],
    list(REPORT_NOTIFICATION_TYPES),
  )
  return success({"count": int((row or {}).get("count") or 0)})


@router.post("/read-all")
async def mark_all_notifications_read(
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  await db.execute(
    """
    update app_notifications
    set read_at = coalesce(read_at, now())
    where user_id = $1
      and notification_type = any($2::text[])
      and read_at is null
    """,
    user["id"],
    list(REPORT_NOTIFICATION_TYPES),
  )
  return success({"read": True})


@router.post("/{notification_id}/read")
async def mark_notification_read(
  notification_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  notification = await db.fetchrow(
    """
    update app_notifications
    set read_at = coalesce(read_at, now())
    where id = $1
      and user_id = $2
      and notification_type = any($3::text[])
    returning id, read_at
    """,
    notification_id,
    user["id"],
    list(REPORT_NOTIFICATION_TYPES),
  )
  if notification is None:
    raise AppError(404, "NOTIFICATION_NOT_FOUND", "Notification was not found.")
  return success({"notification": notification})
