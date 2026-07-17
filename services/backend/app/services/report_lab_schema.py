from app.db.session import Database


ANALYSIS_LAB_RUNS_SCHEMA_SQL = """
create table if not exists analysis_lab_sessions (
  id uuid primary key,
  principal_id uuid not null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists analysis_lab_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references analysis_lab_sessions(id) on delete cascade,
  client_request_id uuid not null,
  batch_ordinal integer not null,
  fixture_id text not null,
  principal_id uuid not null,
  stage text not null check (stage in ('measure', 'perceive', 'consult')),
  status text not null check (status in ('processing', 'completed', 'failed', 'cancelled')),
  schema_version text not null,
  prompt_version text not null,
  provider text not null default 'disabled' check (provider = 'disabled'),
  model text not null default 'disabled' check (model = 'disabled'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  overrides jsonb not null default '{}'::jsonb,
  normalized_output jsonb not null default '{}'::jsonb,
  raw_response jsonb not null default '{}'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  error_payload jsonb not null default '{}'::jsonb,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  token_usage jsonb,
  external_provider_runs integer not null default 0 check (external_provider_runs = 0),
  cache_hit boolean not null default false,
  cached_from_run_id uuid,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_analysis_lab_runs_fixture_id
    check (fixture_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  constraint chk_analysis_lab_runs_batch_ordinal
    check (batch_ordinal between 1 and 5),
  constraint chk_analysis_lab_runs_cache_provenance check (
    (cache_hit and cached_from_run_id is not null)
    or (not cache_hit and cached_from_run_id is null)
  ),
  constraint chk_analysis_lab_runs_json_shapes check (
    jsonb_typeof(overrides) = 'object'
    and jsonb_typeof(normalized_output) = 'object'
    and jsonb_typeof(raw_response) = 'object'
    and jsonb_typeof(validation_errors) = 'array'
    and jsonb_typeof(error_payload) = 'object'
    and (token_usage is null or jsonb_typeof(token_usage) = 'object')
  )
);

alter table analysis_lab_runs
  drop column if exists source_report_id,
  add column if not exists cache_hit boolean not null default false,
  add column if not exists cached_from_run_id uuid,
  add column if not exists client_request_id uuid,
  add column if not exists batch_ordinal integer;

update analysis_lab_runs
set client_request_id = gen_random_uuid()
where client_request_id is null;
update analysis_lab_runs
set batch_ordinal = 1
where batch_ordinal is null;

alter table analysis_lab_runs
  alter column client_request_id set not null,
  alter column batch_ordinal set not null;

alter table analysis_lab_runs
  drop constraint if exists analysis_lab_runs_cached_from_run_id_fkey;

insert into analysis_lab_sessions (id, principal_id, status, expires_at)
select session_id, (array_agg(principal_id order by principal_id::text))[1], 'active', max(expires_at)
from analysis_lab_runs
group by session_id
on conflict (id) do update
set expires_at = greatest(analysis_lab_sessions.expires_at, excluded.expires_at);

do $report_lab_session_contract$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'analysis_lab_runs'::regclass
      and conname = 'analysis_lab_runs_session_id_fkey'
  ) then
    alter table analysis_lab_runs
      add constraint analysis_lab_runs_session_id_fkey
      foreign key (session_id) references analysis_lab_sessions(id) on delete cascade;
  end if;
end
$report_lab_session_contract$;

alter table analysis_lab_runs
  drop constraint if exists analysis_lab_runs_status_check;
alter table analysis_lab_runs
  add constraint analysis_lab_runs_status_check
    check (status in ('processing', 'completed', 'failed', 'cancelled'));

do $report_lab_cache_contract$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'analysis_lab_runs'::regclass
      and conname = 'chk_analysis_lab_runs_cache_provenance'
  ) then
    alter table analysis_lab_runs
      add constraint chk_analysis_lab_runs_cache_provenance check (
        (cache_hit and cached_from_run_id is not null)
        or (not cache_hit and cached_from_run_id is null)
      );
  end if;
end
$report_lab_cache_contract$;

do $report_lab_batch_contract$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'analysis_lab_runs'::regclass
      and conname = 'chk_analysis_lab_runs_batch_ordinal'
  ) then
    alter table analysis_lab_runs
      add constraint chk_analysis_lab_runs_batch_ordinal
      check (batch_ordinal between 1 and 5);
  end if;
end
$report_lab_batch_contract$;

create index if not exists idx_analysis_lab_runs_session_created
  on analysis_lab_runs (session_id, created_at desc);
create index if not exists idx_analysis_lab_runs_fixture_stage_created
  on analysis_lab_runs (fixture_id, stage, created_at desc);
create index if not exists idx_analysis_lab_runs_completed_cache
  on analysis_lab_runs (fixture_id, principal_id, stage, schema_version, input_hash, completed_at desc)
  where status = 'completed' and external_provider_runs = 0;
create index if not exists idx_analysis_lab_runs_expires
  on analysis_lab_runs (expires_at);
create unique index if not exists uq_analysis_lab_runs_batch_ordinal
  on analysis_lab_runs (session_id, client_request_id, batch_ordinal);
create index if not exists idx_analysis_lab_sessions_expires
  on analysis_lab_sessions (expires_at);
"""


async def ensure_report_lab_schema(db: Database) -> None:
  if not db.is_connected:
    return
  await db.execute(ANALYSIS_LAB_RUNS_SCHEMA_SQL)
