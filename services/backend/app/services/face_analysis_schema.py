from app.db.session import Database


FACE_ANALYSIS_STAGE_SCHEMA_SQL = """
create table if not exists analysis_stage_runs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references analysis_reports(id) on delete cascade,
  stage text not null check (stage in ('ai_measurement', 'ai_perception', 'ai_consulting')),
  status text not null check (status in ('pending', 'processing', 'completed', 'partial', 'failed')),
  schema_version text not null,
  prompt_version text not null,
  model text not null,
  input_hash text not null,
  normalized_output jsonb not null default '{}'::jsonb,
  raw_response jsonb not null default '{}'::jsonb,
  error_payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 1 check (attempt_count >= 1),
  duration_ms bigint,
  duration_source text,
  input_tokens bigint,
  output_tokens bigint,
  provider_call_count integer,
  validation_retry_count integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_analysis_stage_runs_report_stage_created
  on analysis_stage_runs (report_id, stage, created_at desc);
create index if not exists idx_analysis_stage_runs_completed_cache
  on analysis_stage_runs (stage, input_hash, schema_version, prompt_version, model)
  where status = 'completed';
create unique index if not exists uq_analysis_stage_runs_one_processing
  on analysis_stage_runs (report_id, stage) where status = 'processing';
"""

FACE_ANALYSIS_OBSERVABILITY_SCHEMA_VERSION = (
  "schema.sql:analysis-stage-observability-v1"
)
FACE_ANALYSIS_OBSERVABILITY_SCHEMA_SQL = """
alter table analysis_stage_runs
  add column if not exists duration_ms bigint,
  add column if not exists duration_source text,
  add column if not exists input_tokens bigint,
  add column if not exists output_tokens bigint,
  add column if not exists provider_call_count integer,
  add column if not exists validation_retry_count integer;

do $migration$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_analysis_stage_runs_duration_ms'
  ) then
    alter table analysis_stage_runs
      add constraint chk_analysis_stage_runs_duration_ms
      check (duration_ms is null or duration_ms >= 0);
  end if;
end $migration$;

do $migration$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_analysis_stage_runs_duration_source'
  ) then
    alter table analysis_stage_runs
      add constraint chk_analysis_stage_runs_duration_source
      check (duration_source is null or duration_source = 'server_monotonic');
  end if;
end $migration$;

do $migration$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_analysis_stage_runs_token_usage'
  ) then
    alter table analysis_stage_runs
      add constraint chk_analysis_stage_runs_token_usage
      check (
        (input_tokens is null or input_tokens >= 0)
        and (output_tokens is null or output_tokens >= 0)
      );
  end if;
end $migration$;

do $migration$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_analysis_stage_runs_call_counts'
  ) then
    alter table analysis_stage_runs
      add constraint chk_analysis_stage_runs_call_counts
      check (
        (provider_call_count is null or provider_call_count >= 0)
        and (validation_retry_count is null or validation_retry_count >= 0)
        and (
          provider_call_count is null
          or validation_retry_count is null
          or validation_retry_count <= provider_call_count
        )
      );
  end if;
end $migration$;
"""


async def ensure_face_analysis_schema(db: Database) -> None:
  if not db.is_connected:
    return
  await db.execute(FACE_ANALYSIS_STAGE_SCHEMA_SQL)
  await db.execute(FACE_ANALYSIS_OBSERVABILITY_SCHEMA_SQL)
