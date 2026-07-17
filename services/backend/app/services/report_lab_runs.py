from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from app.core.errors import AppError
from app.db.session import Database
from app.schemas.report_lab import ReportLabOverrides, ReportLabStage
from app.services.report_lab_runner import ReportLabRunnerResult


REPORT_LAB_PRUNE_EXPIRED_RUNS_SQL = "delete from analysis_lab_runs where expires_at <= now()"
REPORT_LAB_PRUNE_SESSIONS_SQL = """
delete from analysis_lab_sessions session_row
where session_row.expires_at <= now()
   or (
     session_row.status = 'cancelled'
     and not exists (
       select 1 from analysis_lab_runs run_row
       where run_row.session_id = session_row.id
     )
   )
"""


async def issue_report_lab_session(
  db: Database,
  *,
  session_id: UUID,
  principal_id: UUID,
  retention_days: int,
) -> dict[str, Any]:
  row = await db.fetchrow(
    """
    insert into analysis_lab_sessions (id, principal_id, status, expires_at)
    values ($1, $2, 'active', now() + ($3::integer * interval '1 day'))
    returning id, principal_id, status, expires_at
    """,
    session_id,
    principal_id,
    retention_days,
  )
  if row is None:
    raise RuntimeError("Report Lab failed to issue a local session.")
  return dict(row)


async def reserve_report_lab_runs(
  db: Database,
  *,
  session_id: UUID,
  client_request_id: UUID,
  repeat_count: int,
  session_budget_runs: int,
  fixture_id: str,
  principal_id: UUID,
  stage: ReportLabStage,
  schema_version: str,
  input_hash: str,
  overrides: ReportLabOverrides,
  retention_days: int,
) -> list[dict[str, Any]]:
  """Atomically reserve N rows below a per-session budget.

  The advisory transaction lock and budget check live in one statement, so
  concurrent local browser requests cannot both reserve the final slot.
  """

  async def reserve(connection: Any) -> list[dict[str, Any]]:
    # READ COMMITTED takes a fresh snapshot per statement. Acquire the advisory
    # transaction lock first, then count in a separate statement so a waiter
    # observes rows committed by the previous lock holder.
    await connection.execute(
      "select pg_advisory_xact_lock(hashtextextended($1::text, 0))",
      session_id,
    )
    session = await connection.fetchrow(
      """
      select id
      from analysis_lab_sessions
      where id = $1
        and principal_id = $2
        and status = 'active'
        and expires_at > now()
      """,
      session_id,
      principal_id,
    )
    if session is None:
      raise AppError(
        403,
        "REPORT_LAB_SESSION_INVALID",
        "Report Lab requires an active server-issued session.",
      )
    await connection.execute(
      """
      update analysis_lab_sessions
      set expires_at = greatest(expires_at, now() + ($2::integer * interval '1 day')),
          updated_at = now()
      where id = $1
      """,
      session_id,
      retention_days,
    )
    reused = await connection.fetchrow(
      """
      select id
      from analysis_lab_runs
      where session_id = $1 and client_request_id = $2
      limit 1
      """,
      session_id,
      client_request_id,
    )
    if reused is not None:
      raise AppError(
        409,
        "REPORT_LAB_CLIENT_REQUEST_REUSED",
        "Report Lab clientRequestId must identify exactly one batch attempt.",
      )
    used = await connection.fetchval(
      """
      select count(*)::integer
      from analysis_lab_runs
      where session_id = $1 and expires_at > now()
      """,
      session_id,
    )
    if int(used or 0) + repeat_count > session_budget_runs:
      raise AppError(
        429,
        "REPORT_LAB_SESSION_BUDGET_EXCEEDED",
        "The Report Lab session run budget has been exhausted.",
        {"sessionBudgetRuns": session_budget_runs},
      )
    rows = await connection.fetch(
      """
    insert into analysis_lab_runs (
      session_id, client_request_id, batch_ordinal, fixture_id, principal_id, stage, status,
      schema_version, prompt_version, provider, model, input_hash, overrides,
      expires_at
    )
    select
      $1, $4, requested.ordinal, $5, $6, $7, 'processing', $8, $9, 'disabled', 'disabled',
      $10, $11::jsonb, now() + ($12::integer * interval '1 day')
    from generate_series(1, $2::integer) as requested(ordinal)
    where $3::integer >= $2::integer
    returning *
      """,
      session_id,
      repeat_count,
      session_budget_runs,
      client_request_id,
      fixture_id,
      principal_id,
      stage,
      schema_version,
      overrides.prompt_version,
      input_hash,
      json.dumps(overrides.model_dump(by_alias=True, mode="json"), ensure_ascii=False),
      retention_days,
    )
    if len(rows) != repeat_count:
      raise RuntimeError("Report Lab reservation inserted an unexpected row count.")
    return [dict(row) for row in rows]

  return await db.run_in_transaction(reserve)


async def find_cached_report_lab_run(
  db: Database,
  *,
  fixture_id: str,
  principal_id: UUID,
  stage: ReportLabStage,
  schema_version: str,
  input_hash: str,
) -> dict[str, Any] | None:
  """Find one unexpired validated output with the exact experiment identity."""

  row = await db.fetchrow(
    """
    select
      id, status, schema_version, input_hash, raw_response, normalized_output,
      validation_errors, latency_ms, token_usage, external_provider_runs,
      provider, model
    from analysis_lab_runs
    where fixture_id = $1
      and principal_id = $2
      and stage = $3
      and schema_version = $4
      and input_hash = $5
      and status = 'completed'
      and external_provider_runs = 0
      and expires_at > now()
    order by completed_at desc nulls last, created_at desc
    limit 1
    """,
    fixture_id,
    principal_id,
    stage,
    schema_version,
    input_hash,
  )
  return dict(row) if row is not None else None


def cached_report_lab_result(row: dict[str, Any]) -> ReportLabRunnerResult:
  def json_object(value: object) -> dict[str, Any]:
    if isinstance(value, dict):
      return value
    if isinstance(value, str):
      try:
        parsed = json.loads(value)
      except json.JSONDecodeError:
        return {}
      return parsed if isinstance(parsed, dict) else {}
    return {}

  def json_array(value: object) -> list[dict[str, Any]]:
    if isinstance(value, str):
      try:
        value = json.loads(value)
      except json.JSONDecodeError:
        return []
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []

  return ReportLabRunnerResult(
    status="completed",
    schema_version=str(row["schema_version"]),
    input_hash=str(row["input_hash"]),
    raw_response=json_object(row.get("raw_response")),
    normalized_output=json_object(row.get("normalized_output")),
    validation_errors=json_array(row.get("validation_errors")),
    latency_ms=int(row.get("latency_ms") or 0),
    token_usage=None,
  )


async def complete_report_lab_run(
  db: Database,
  run_id: UUID,
  result: ReportLabRunnerResult,
  *,
  cached_from_run_id: UUID | None = None,
) -> dict[str, Any] | None:
  return await db.fetchrow(
    """
    update analysis_lab_runs
    set status = $2,
        normalized_output = $3::jsonb,
        raw_response = $4::jsonb,
        validation_errors = $5::jsonb,
        latency_ms = $6,
        token_usage = null,
        external_provider_runs = 0,
        cache_hit = $7,
        cached_from_run_id = $8,
        error_payload = case
          when $2 = 'failed' then jsonb_build_object('code', 'REPORT_LAB_OUTPUT_INVALID')
          else '{}'::jsonb
        end,
        completed_at = now(),
        updated_at = now()
    where id = $1 and status = 'processing'
    returning *
    """,
    run_id,
    result.status,
    json.dumps(result.normalized_output, ensure_ascii=False),
    json.dumps(result.raw_response, ensure_ascii=False),
    json.dumps(result.validation_errors, ensure_ascii=False),
    result.latency_ms,
    cached_from_run_id is not None,
    cached_from_run_id,
  )


async def list_report_lab_runs(
  db: Database,
  *,
  session_id: UUID,
  limit: int,
  client_request_id: UUID | None = None,
) -> list[dict[str, Any]]:
  """Return a raw-response-free, prompt-body-free session history."""

  rows = await db.fetch(
    """
    select
      id, session_id, client_request_id, batch_ordinal, fixture_id, stage, status, schema_version,
      prompt_version, provider, model, normalized_output, validation_errors,
      input_hash, cache_hit, cached_from_run_id, latency_ms, token_usage,
      external_provider_runs, started_at, completed_at
    from analysis_lab_runs
    where session_id = $1
      and expires_at > now()
      and ($3::uuid is null or client_request_id = $3)
    order by created_at desc
    limit $2
    """,
    session_id,
    limit,
    client_request_id,
  )
  return [dict(row) for row in rows]


async def fail_report_lab_run(
  db: Database,
  run_id: UUID,
  *,
  code: str,
) -> None:
  await db.execute(
    """
    update analysis_lab_runs
    set status = 'failed',
        error_payload = jsonb_build_object('code', $2::text),
        token_usage = null,
        external_provider_runs = 0,
        completed_at = now(),
        updated_at = now()
    where id = $1 and status = 'processing'
    """,
    run_id,
    code,
  )


async def cancel_report_lab_session(
  db: Database,
  session_id: UUID,
  *,
  principal_id: UUID,
) -> int:
  async def cancel(connection: Any) -> int:
    await connection.execute(
      "select pg_advisory_xact_lock(hashtextextended($1::text, 0))",
      session_id,
    )
    session = await connection.fetchrow(
      """
      update analysis_lab_sessions
      set status = 'cancelled', updated_at = now()
      where id = $1 and principal_id = $2 and expires_at > now()
      returning id
      """,
      session_id,
      principal_id,
    )
    if session is None:
      raise AppError(
        403,
        "REPORT_LAB_SESSION_INVALID",
        "Report Lab requires an active server-issued session.",
      )
    status = await connection.execute(
      """
      update analysis_lab_runs
      set status = 'cancelled',
          error_payload = jsonb_build_object('code', 'REPORT_LAB_RUN_CANCELLED'),
          token_usage = null,
          external_provider_runs = 0,
          completed_at = now(),
          updated_at = now()
      where session_id = $1 and status = 'processing'
      """,
      session_id,
    )
    try:
      return int(status.rsplit(" ", 1)[-1])
    except (AttributeError, ValueError):
      return 0

  return await db.run_in_transaction(cancel)


async def prune_expired_report_lab_runs(db: Database) -> int:
  status = await db.execute(REPORT_LAB_PRUNE_EXPIRED_RUNS_SQL)
  # Preserve unexpired cancelled-session history through its TTL. Only expired
  # sessions (FK cascade) and cancelled shells with no remaining runs are pruned.
  await db.execute(REPORT_LAB_PRUNE_SESSIONS_SQL)
  try:
    return int(status.rsplit(" ", 1)[-1])
  except (AttributeError, ValueError):
    return 0
