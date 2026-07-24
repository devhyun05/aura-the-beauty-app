from uuid import UUID

import pytest

from app.schemas.face_analysis_v2 import StageName
from app.services.face_analysis_stage_runs import (
  complete_stage_run,
  compute_stage_input_hash,
  fail_stage_run,
  find_completed_stage_run,
  start_stage_run,
)
from app.services.face_analysis_schema import (
  FACE_ANALYSIS_OBSERVABILITY_SCHEMA_SQL,
  FACE_ANALYSIS_STAGE_SCHEMA_SQL,
)


REPORT_ID = UUID("11111111-1111-1111-1111-111111111111")
RUN_ID = UUID("22222222-2222-2222-2222-222222222222")


class FakeDatabase:
  def __init__(self, rows: list[dict | None] | None = None) -> None:
    self.rows = list(rows or [])
    self.fetchrow_calls: list[tuple[str, tuple]] = []

  async def fetchrow(self, query: str, *args):
    self.fetchrow_calls.append((query, args))
    return self.rows.pop(0) if self.rows else None


def test_input_hash_is_key_order_independent() -> None:
  assert compute_stage_input_hash({"b": 2, "a": 1}) == compute_stage_input_hash(
    {"a": 1, "b": 2},
  )


@pytest.mark.asyncio
async def test_cache_is_scoped_to_report_and_versions() -> None:
  db = FakeDatabase()

  await find_completed_stage_run(
    db,
    report_id=REPORT_ID,
    stage=StageName.AI_MEASUREMENT,
    input_hash="abc",
    schema_version="aura-face-analysis-v2",
    prompt_version="measurement-v1",
    model="model-a",
  )

  query, args = db.fetchrow_calls[0]
  assert "report_id = $1" in query
  assert "status = 'completed'" in query
  assert args == (
    REPORT_ID,
    "ai_measurement",
    "abc",
    "aura-face-analysis-v2",
    "measurement-v1",
    "model-a",
  )


@pytest.mark.asyncio
async def test_start_appends_attempt_and_reuses_current_processing_row() -> None:
  processing = {"id": RUN_ID, "status": "processing", "attempt_count": 2}
  db = FakeDatabase([None, processing])

  row = await start_stage_run(
    db,
    report_id=REPORT_ID,
    stage=StageName.AI_PERCEPTION,
    input_hash="hash",
    schema_version="schema",
    prompt_version="prompt",
    model="model",
  )

  assert row == processing
  assert "max(attempt_count)" in db.fetchrow_calls[0][0]
  assert "status = 'processing'" in db.fetchrow_calls[1][0]


@pytest.mark.asyncio
async def test_completion_and_failure_update_only_processing_run() -> None:
  db = FakeDatabase([{"id": RUN_ID}, {"id": RUN_ID}])
  observability = {
    "duration_ms": 1250,
    "duration_source": "server_monotonic",
    "input_tokens": 120,
    "output_tokens": 45,
    "total_tokens": 165,
    "provider_call_count": 2,
    "validation_retry_count": 1,
  }

  await complete_stage_run(
    db,
    RUN_ID,
    {"ok": True},
    {"usage": {"outputTokens": 20}},
    **observability,
  )
  await fail_stage_run(db, RUN_ID, {"code": "STAGE_TIMEOUT"}, **observability)

  assert "status = 'processing'" in db.fetchrow_calls[0][0]
  assert db.fetchrow_calls[0][1][1] == "completed"
  assert db.fetchrow_calls[0][1][4:] == (1250, "server_monotonic", 120, 45, 2, 1)
  assert "status = 'processing'" in db.fetchrow_calls[1][0]
  assert "status = 'failed'" in db.fetchrow_calls[1][0]
  assert db.fetchrow_calls[1][1][2:] == (1250, "server_monotonic", 120, 45, 2, 1)


def test_schema_has_cache_and_single_processing_indexes() -> None:
  assert "create table if not exists analysis_stage_runs" in FACE_ANALYSIS_STAGE_SCHEMA_SQL
  assert "on delete cascade" in FACE_ANALYSIS_STAGE_SCHEMA_SQL
  assert "idx_analysis_stage_runs_completed_cache" in FACE_ANALYSIS_STAGE_SCHEMA_SQL
  assert "uq_analysis_stage_runs_one_processing" in FACE_ANALYSIS_STAGE_SCHEMA_SQL
  for column in (
    "duration_ms",
    "duration_source",
    "input_tokens",
    "output_tokens",
    "provider_call_count",
    "validation_retry_count",
  ):
    assert f"add column if not exists {column}" in FACE_ANALYSIS_OBSERVABILITY_SCHEMA_SQL
  assert "server_monotonic" in FACE_ANALYSIS_OBSERVABILITY_SCHEMA_SQL
