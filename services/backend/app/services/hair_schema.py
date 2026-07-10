import asyncpg

from app.db.session import Database


HAIR_SCHEMA_SQL = """
do $$
begin
  if exists (select 1 from pg_type where typname = 'capture_type') then
    alter type capture_type add value if not exists 'hair_analysis';
  end if;
end
$$;

create table if not exists hair_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  client_request_id uuid not null,
  photo_capture_id uuid references photo_captures(id) on delete set null,
  source_media_id uuid not null references media_assets(id) on delete restrict,
  mask_media_id uuid references media_assets(id) on delete set null,
  status text not null default 'queued',
  analysis_payload jsonb not null default '{}'::jsonb,
  recommended_style_ids text[] not null default '{}',
  error_code text,
  error_message text,
  attempt_count integer not null default 0,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_hair_analyses_user_request unique (user_id, client_request_id),
  constraint chk_hair_analyses_status check (status in ('queued', 'processing', 'completed', 'failed', 'expired')),
  constraint chk_hair_analyses_attempt_count check (attempt_count >= 0)
);

create table if not exists hair_simulations (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references hair_analyses(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  client_request_id uuid not null,
  style_id text not null,
  status text not null default 'queued',
  result_media_id uuid references media_assets(id) on delete set null,
  provider text,
  model text,
  attempt_count integer not null default 0,
  quality_attempt_count integer not null default 0,
  quality_payload jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  saved_at timestamptz,
  expires_at timestamptz default (now() + interval '24 hours'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_hair_simulations_user_request unique (user_id, client_request_id),
  constraint uq_hair_simulations_analysis_style unique (analysis_id, style_id),
  constraint chk_hair_simulations_status check (status in ('queued', 'processing', 'completed', 'failed', 'expired')),
  constraint chk_hair_simulations_attempt_count check (attempt_count >= 0),
  constraint chk_hair_simulations_quality_attempt_count check (quality_attempt_count >= 0)
);

create index if not exists idx_hair_analyses_user_created on hair_analyses (user_id, created_at desc);
create index if not exists idx_hair_analyses_status_created on hair_analyses (status, created_at);
create index if not exists idx_hair_analyses_expires on hair_analyses (expires_at) where status <> 'expired';
create index if not exists idx_hair_simulations_analysis_created on hair_simulations (analysis_id, created_at desc);
create index if not exists idx_hair_simulations_user_created on hair_simulations (user_id, created_at desc);
create index if not exists idx_hair_simulations_expires on hair_simulations (expires_at) where saved_at is null and status <> 'expired';
"""


async def ensure_hair_schema(db: Database) -> None:
  if db.pool is None:
    return

  async with db.pool.acquire() as connection:
    await ensure_hair_schema_connection(connection)


async def ensure_hair_schema_connection(connection: asyncpg.Connection) -> None:
  await connection.execute(HAIR_SCHEMA_SQL)
