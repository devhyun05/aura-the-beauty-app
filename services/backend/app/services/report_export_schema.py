from app.db.session import Database


REPORT_EXPORT_SCHEMA_SQL = """
create table if not exists report_export_sessions (
  id uuid primary key,
  owner_user_id uuid not null references users(id) on delete cascade,
  report_type text not null,
  target_width integer not null default 1440,
  page_manifest jsonb not null,
  status text not null default 'pending',
  result_bucket text,
  result_object_key text,
  result_width integer,
  result_height integer,
  result_byte_size bigint,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null,
  check (status in ('pending', 'processing', 'completed', 'failed')),
  check (target_width between 720 and 2160)
);
create index if not exists idx_report_export_sessions_owner_created
  on report_export_sessions (owner_user_id, created_at desc);
create index if not exists idx_report_export_sessions_expires
  on report_export_sessions (expires_at);
"""


async def ensure_report_export_schema(db: Database) -> None:
  if not db.is_connected:
    return
  await db.execute(REPORT_EXPORT_SCHEMA_SQL)
