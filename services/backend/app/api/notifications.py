from uuid import UUID

from fastapi import (
  APIRouter,
  BackgroundTasks,
  Depends,
  Query,
  WebSocket,
  WebSocketDisconnect,
)

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import (
  AuthContext,
  get_current_user,
  verify_cognito_token,
)
from app.core.settings import Settings, get_settings
from app.db.session import Database, database, require_database
from app.schemas.notifications import (
  PushDeviceRegistration,
  PushDeviceUnregistration,
  ReportNotificationSuppression,
)
from app.services.notification_realtime import (
  NotificationRealtimeConnection,
  notification_realtime_manager,
)
from app.services.push_notifications import (
  REPORT_NOTIFICATION_TYPES,
  is_expo_push_token,
  retry_recent_notifications_for_user,
)
from app.services.users import ensure_user


router = APIRouter(prefix="/notifications", tags=["notifications"])


def _extract_socket_token(websocket: WebSocket) -> str | None:
  authorization = websocket.headers.get("authorization")
  if authorization and authorization.lower().startswith("bearer "):
    return authorization.split(" ", 1)[1].strip() or None

  token = websocket.query_params.get("token")
  return token.strip() if token else None


async def _get_socket_auth_context(
  websocket: WebSocket,
  settings: Settings,
) -> AuthContext | None:
  if not settings.auth_required:
    return AuthContext(
      subject=settings.dev_user_sub,
      provider="google",
      email=settings.dev_user_email,
      name=settings.dev_user_name,
      claims={"token_use": "dev", "sub": settings.dev_user_sub},
    )

  token = _extract_socket_token(websocket)
  if not token:
    return None
  return await verify_cognito_token(token, settings)


@router.websocket("/ws")
async def notification_socket(
  websocket: WebSocket,
  settings: Settings = Depends(get_settings),
) -> None:
  connection: NotificationRealtimeConnection | None = None
  try:
    auth = await _get_socket_auth_context(websocket, settings)
    if auth is None or not database.is_connected:
      await websocket.close(code=1008)
      return

    user = await ensure_user(database, auth)
    connection = await notification_realtime_manager.connect(
      websocket,
      user_id=user["id"],
    )

    while True:
      message = await websocket.receive_text()
      if '"type":"ping"' in message.replace(" ", ""):
        await notification_realtime_manager.send(
          connection,
          {"type": "pong"},
        )
  except WebSocketDisconnect:
    pass
  except Exception:
    if connection is None:
      await websocket.close(code=1008)
  finally:
    if connection is not None:
      await notification_realtime_manager.disconnect(connection)


@router.post("/devices")
async def register_push_device(
  payload: PushDeviceRegistration,
  background_tasks: BackgroundTasks,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
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
  background_tasks.add_task(
    retry_recent_notifications_for_user,
    db,
    settings,
    user_id=user["id"],
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


@router.post("/report-suppressions")
async def suppress_report_notification(
  payload: ReportNotificationSuppression,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  report_id = str(payload.report_id)
  await db.execute(
    """
    insert into report_notification_suppressions (
      user_id, notification_type, report_id, expires_at
    )
    values ($1, $2, $3, now() + interval '30 minutes')
    on conflict (user_id, notification_type, report_id) do update set
      expires_at = excluded.expires_at
    """,
    user["id"],
    payload.notification_type,
    report_id,
  )
  await db.execute(
    """
    delete from app_notifications
    where user_id = $1
      and notification_type = $2
      and coalesce(data->>'reportId', data->>'report_id') = $3
    """,
    user["id"],
    payload.notification_type,
    report_id,
  )
  return success({"suppressed": True})


@router.delete("/report-suppressions")
async def release_report_notification_suppression(
  payload: ReportNotificationSuppression,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  await db.execute(
    """
    delete from report_notification_suppressions
    where user_id = $1
      and notification_type = $2
      and report_id = $3
    """,
    user["id"],
    payload.notification_type,
    str(payload.report_id),
  )
  return success({"suppressed": False})


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


@router.delete("/{notification_id}")
async def delete_notification(
  notification_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  notification = await db.fetchrow(
    """
    delete from app_notifications
    where id = $1
      and user_id = $2
      and notification_type = any($3::text[])
    returning id
    """,
    notification_id,
    user["id"],
    list(REPORT_NOTIFICATION_TYPES),
  )
  if notification is None:
    raise AppError(404, "NOTIFICATION_NOT_FOUND", "Notification was not found.")
  return success({"deleted": True})
