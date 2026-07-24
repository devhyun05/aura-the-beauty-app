import hashlib
import json
from typing import Any
from uuid import UUID

from app.db.session import Database
from app.schemas.face_analysis_v2 import StageName, StageStatus


def compute_stage_input_hash(value: object) -> str:
  encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
  return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


async def find_completed_stage_run(
  db: Database,
  *,
  report_id: UUID,
  stage: StageName,
  input_hash: str,
  schema_version: str,
  prompt_version: str,
  model: str,
) -> dict[str, Any] | None:
  return await db.fetchrow(
    """
    select *
    from analysis_stage_runs
    where report_id = $1
      and stage = $2
      and input_hash = $3
      and schema_version = $4
      and prompt_version = $5
      and model = $6
      and status = 'completed'
    order by completed_at desc nulls last, created_at desc
    limit 1
    """,
    report_id,
    stage.value,
    input_hash,
    schema_version,
    prompt_version,
    model,
  )


async def start_stage_run(
  db: Database,
  *,
  report_id: UUID,
  stage: StageName,
  input_hash: str,
  schema_version: str,
  prompt_version: str,
  model: str,
) -> dict[str, Any] | None:
  row = await db.fetchrow(
    """
    insert into analysis_stage_runs (
      report_id, stage, status, schema_version, prompt_version, model,
      input_hash, attempt_count, started_at
    )
    values (
      $1, $2, 'processing', $3, $4, $5, $6,
      (
        select coalesce(max(attempt_count), 0) + 1
        from analysis_stage_runs
        where report_id = $1 and stage = $2
      ),
      now()
    )
    on conflict (report_id, stage) where status = 'processing' do nothing
    returning *
    """,
    report_id,
    stage.value,
    schema_version,
    prompt_version,
    model,
    input_hash,
  )
  if row is not None:
    return row
  return await db.fetchrow(
    """
    select * from analysis_stage_runs
    where report_id = $1 and stage = $2 and status = 'processing'
    order by created_at desc
    limit 1
    """,
    report_id,
    stage.value,
  )


async def complete_stage_run(
  db: Database,
  run_id: UUID,
  normalized_output: dict[str, Any],
  raw_response: dict[str, Any],
  *,
  status: StageStatus = StageStatus.COMPLETED,
  duration_ms: int,
  duration_source: str,
  input_tokens: int,
  output_tokens: int,
  provider_call_count: int,
  validation_retry_count: int,
  total_tokens: int,
) -> dict[str, Any] | None:
  if status not in {StageStatus.COMPLETED, StageStatus.PARTIAL}:
    raise ValueError("Completed stage run status must be completed or partial")
  if total_tokens != input_tokens + output_tokens:
    raise ValueError("Stage total tokens must equal input plus output tokens")
  return await db.fetchrow(
    """
    update analysis_stage_runs
    set status = $2,
        normalized_output = $3::jsonb,
        raw_response = $4::jsonb,
        error_payload = '{}'::jsonb,
        duration_ms = $5,
        duration_source = $6,
        input_tokens = $7,
        output_tokens = $8,
        provider_call_count = $9,
        validation_retry_count = $10,
        completed_at = now(),
        updated_at = now()
    where id = $1 and status = 'processing'
    returning *
    """,
    run_id,
    status.value,
    json.dumps(normalized_output, ensure_ascii=False),
    json.dumps(raw_response, ensure_ascii=False),
    duration_ms,
    duration_source,
    input_tokens,
    output_tokens,
    provider_call_count,
    validation_retry_count,
  )


async def fail_stage_run(
  db: Database,
  run_id: UUID,
  error_payload: dict[str, Any],
  *,
  duration_ms: int,
  duration_source: str,
  input_tokens: int,
  output_tokens: int,
  provider_call_count: int,
  validation_retry_count: int,
  total_tokens: int,
) -> dict[str, Any] | None:
  if total_tokens != input_tokens + output_tokens:
    raise ValueError("Stage total tokens must equal input plus output tokens")
  return await db.fetchrow(
    """
    update analysis_stage_runs
    set status = 'failed',
        error_payload = $2::jsonb,
        duration_ms = $3,
        duration_source = $4,
        input_tokens = $5,
        output_tokens = $6,
        provider_call_count = $7,
        validation_retry_count = $8,
        completed_at = now(),
        updated_at = now()
    where id = $1 and status = 'processing'
    returning *
    """,
    run_id,
    json.dumps(error_payload, ensure_ascii=False),
    duration_ms,
    duration_source,
    input_tokens,
    output_tokens,
    provider_call_count,
    validation_retry_count,
  )
