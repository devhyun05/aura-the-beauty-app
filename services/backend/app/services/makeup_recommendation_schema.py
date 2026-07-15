from app.db.session import Database


MAKEUP_RECOMMENDATION_SCHEMA_SQL = """
create table if not exists makeup_scenario_library (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  normalized_text text not null unique,
  seed_prompt text not null,
  tags jsonb not null default '[]'::jsonb,
  source text not null default 'ai',
  model_id text,
  prompt_version text not null default 'makeup-scenario-v2',
  status text not null default 'active',
  usage_count integer not null default 0,
  last_served_at timestamptz,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_makeup_scenario_library_source check (source in ('ai', 'curated')),
  constraint chk_makeup_scenario_library_status check (status in ('active', 'disabled')),
  constraint chk_makeup_scenario_library_usage_count check (usage_count >= 0),
  constraint chk_makeup_scenario_library_text_length check (char_length(text) between 1 and 60),
  constraint chk_makeup_scenario_library_seed_prompt_length check (char_length(seed_prompt) between 1 and 240)
);

alter table makeup_scenario_library add column if not exists last_served_at timestamptz;

create index if not exists idx_makeup_scenario_library_active_usage
  on makeup_scenario_library (status, usage_count, created_at desc);
create index if not exists idx_makeup_scenario_library_replacement
  on makeup_scenario_library (source, status, usage_count, last_served_at, created_at);

create table if not exists makeup_scenario_generation_limits (
  user_id uuid primary key references users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  constraint chk_makeup_scenario_generation_limit_count check (request_count between 0 and 4)
);

create table if not exists makeup_recommendation_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  parent_report_id uuid references makeup_recommendation_reports(id) on delete set null,
  refinement_type text,
  scenario_text text not null,
  scenario_tags jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  recommendation jsonb not null,
  image_status text not null default 'pending',
  image_url text,
  image_error text,
  scenario_model_id text,
  question_model_id text,
  recommendation_model_id text,
  image_model_id text,
  prompt_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_makeup_recommendation_reports_image_status
    check (image_status in ('pending', 'processing', 'completed', 'failed')),
  constraint chk_makeup_recommendation_reports_refinement_type
    check (refinement_type is null or refinement_type in ('natural', 'hip', 'differentColor', 'replaceProducts'))
);

alter table makeup_recommendation_reports add column if not exists parent_report_id uuid references makeup_recommendation_reports(id) on delete set null;
alter table makeup_recommendation_reports add column if not exists refinement_type text;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_makeup_recommendation_reports_refinement_type'
  ) then
    alter table makeup_recommendation_reports
      add constraint chk_makeup_recommendation_reports_refinement_type
      check (refinement_type is null or refinement_type in ('natural', 'hip', 'differentColor', 'replaceProducts'));
  end if;
end
$$;
alter table makeup_recommendation_reports add column if not exists image_error text;
alter table makeup_recommendation_reports add column if not exists scenario_model_id text;
alter table makeup_recommendation_reports add column if not exists question_model_id text;
alter table makeup_recommendation_reports add column if not exists image_model_id text;
alter table makeup_recommendation_reports add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_makeup_recommendation_reports_user_created
  on makeup_recommendation_reports (user_id, created_at desc);
create index if not exists idx_makeup_recommendation_reports_parent
  on makeup_recommendation_reports (parent_report_id);

drop trigger if exists trg_makeup_scenario_library_updated_at on makeup_scenario_library;
create trigger trg_makeup_scenario_library_updated_at
before update on makeup_scenario_library
for each row execute function set_updated_at();

drop trigger if exists trg_makeup_recommendation_reports_updated_at on makeup_recommendation_reports;
create trigger trg_makeup_recommendation_reports_updated_at
before update on makeup_recommendation_reports
for each row execute function set_updated_at();
"""


async def ensure_makeup_recommendation_schema(db: Database) -> None:
  if not db.is_connected:
    return
  await db.execute(MAKEUP_RECOMMENDATION_SCHEMA_SQL)
