from app.services.report_lab_schema import ANALYSIS_LAB_RUNS_SCHEMA_SQL


def test_analysis_lab_runs_schema_is_separate_repeatable_and_provider_disabled() -> None:
  normalized = " ".join(ANALYSIS_LAB_RUNS_SCHEMA_SQL.split()).lower()

  assert "create table if not exists analysis_lab_runs" in normalized
  assert "create table if not exists analysis_lab_sessions" in normalized
  assert "fixture_id text not null" in normalized
  assert "source_report_id uuid" not in normalized
  assert "drop column if exists source_report_id" in normalized
  assert "principal_id uuid not null" in normalized
  assert "cached_from_run_id uuid" in normalized
  assert "cached_from_run_id uuid references" not in normalized
  assert "session_id uuid not null references analysis_lab_sessions(id) on delete cascade" in normalized
  assert "client_request_id uuid not null" in normalized
  assert "batch_ordinal integer not null" in normalized
  assert "chk_analysis_lab_runs_batch_ordinal" in normalized
  assert "uq_analysis_lab_runs_batch_ordinal" in normalized
  assert "status in ('processing', 'completed', 'failed', 'cancelled')" in normalized
  assert "external_provider_runs integer not null default 0 check (external_provider_runs = 0)" in normalized
  assert "provider text not null default 'disabled' check (provider = 'disabled')" in normalized
  assert "unique (input_hash" not in normalized
  assert "unique (fixture_id" not in normalized
  assert "analysis_stage_runs" not in normalized


def test_cache_source_expiry_cannot_violate_cache_hit_provenance_check() -> None:
  normalized = " ".join(ANALYSIS_LAB_RUNS_SCHEMA_SQL.split()).lower()
  assert "cached_from_run_id uuid references" not in normalized
  assert "drop constraint if exists analysis_lab_runs_cached_from_run_id_fkey" in normalized
  assert "cache_hit and cached_from_run_id is not null" in normalized
