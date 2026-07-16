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


async def ensure_face_analysis_schema(db: Database) -> None:
  if not db.is_connected:
    return
  await db.execute(FACE_ANALYSIS_STAGE_SCHEMA_SQL)
