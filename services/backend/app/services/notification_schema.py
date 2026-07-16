from app.db.session import Database


NOTIFICATION_SCHEMA_SQL = """
create table if not exists user_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  expo_push_token text not null,
  platform text not null,
  app_version text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_user_push_devices_token unique (expo_push_token),
  constraint chk_user_push_devices_platform check (platform in ('ios', 'android'))
);

create table if not exists app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint uq_app_notifications_user_dedupe unique (user_id, dedupe_key)
);

create table if not exists notification_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references app_notifications(id) on delete cascade,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_notification_outbox_notification unique (notification_id),
  constraint chk_notification_outbox_status
    check (status in ('pending', 'sending', 'completed', 'failed')),
  constraint chk_notification_outbox_attempts check (attempts >= 0)
);

create index if not exists idx_user_push_devices_user_enabled
  on user_push_devices (user_id, enabled, last_seen_at desc);
create index if not exists idx_app_notifications_user_created
  on app_notifications (user_id, created_at desc);
create index if not exists idx_app_notifications_user_unread
  on app_notifications (user_id, created_at desc) where read_at is null;
create index if not exists idx_notification_outbox_pending
  on notification_outbox (status, next_attempt_at)
  where status in ('pending', 'failed');
"""


async def ensure_notification_schema(db: Database) -> None:
  if not db.is_connected:
    return

  await db.execute(NOTIFICATION_SCHEMA_SQL)
