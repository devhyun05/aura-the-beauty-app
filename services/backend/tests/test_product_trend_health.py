from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest

from app.core.settings import Settings
from app.services.product_trend_health import (
  health_bucket_start,
  health_idempotency_key,
  record_seasonal_serving_outcome,
  run_trend_now_health_check,
)


NOW = datetime(2026, 7, 16, 12, 37, 42, tzinfo=timezone.utc)
RUN_ID = UUID("10000000-0000-4000-8000-000000000001")
PRINCIPAL_ID = UUID("10000000-0000-4000-8000-000000000002")
CURRENT_ID = UUID("10000000-0000-4000-8000-000000000003")
PRIOR_ID = UUID("10000000-0000-4000-8000-000000000004")
CURRENT_FINGERPRINT = "a" * 64
PRIOR_FINGERPRINT = "b" * 64


def _settings() -> Settings:
  return Settings(
    trend_now_recommendations_v2=True,
    product_trend_auto_publish_enabled=True,
    product_trend_shadow_mode=False,
    product_trend_task_role_arn="arn:aws:iam::123456789012:role/aura-trend-now-task",
  )


class _RecordingDb:
  is_connected = True

  def __init__(self, *, fail: bool = False) -> None:
    self.fail = fail
    self.calls: list[tuple[str, tuple[Any, ...]]] = []

  async def execute(self, query: str, *args: Any) -> str:
    self.calls.append((query, args))
    if self.fail:
      raise RuntimeError("database unavailable")
    return "OK"


class _HealthConnection:
  def __init__(
    self,
    *,
    current_eligible: int,
    prior_eligible: int | None,
    duplicate_status: str | None = None,
    current_published_at: datetime | None = None,
    prior_sources_fresh: bool = True,
    current_freshness: str = "fresh",
  ) -> None:
    self.current_eligible = current_eligible
    self.prior_eligible = prior_eligible
    self.duplicate_status = duplicate_status
    self.current_published_at = current_published_at or NOW - timedelta(hours=1)
    self.prior_sources_fresh = prior_sources_fresh
    self.current_freshness = current_freshness
    self.executed: list[tuple[str, tuple[Any, ...]]] = []
    self.claimed_windows: list[datetime] = []

  async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
    if "from product_recommendation_service_principals" in query:
      assert "for update" in query.lower()
      assert "external_subject=$2" in query
      assert args[1] == "arn:aws:iam::123456789012:role/aura-trend-now-task"
      return {"id": PRINCIPAL_ID, "principal_key": "trend-now-orchestrator"}
    if "insert into seasonal_pipeline_runs" in query:
      assert "'health'" in query
      self.claimed_windows.append(args[1])
      if self.duplicate_status is None:
        return {"id": RUN_ID, "status": "running"}
      return None
    if "from seasonal_pipeline_runs" in query:
      return {
        "id": RUN_ID,
        "status": self.duplicate_status,
        "started_at": NOW,
        "step_results": {"rolledBackCount": 0, "blockedCount": 0},
      }
    if "from product_seasonal_collections" in query and "where id=$1" in query:
      assert "for update" in query.lower()
      return {
        "id": CURRENT_ID,
        "slug": "trend-now-ko-kr-kr-00",
        "locale": "ko-KR",
        "region_code": "KR-00",
        "revision": 2,
        "input_fingerprint": CURRENT_FINGERPRINT,
        "published_at": self.current_published_at,
        "freshness_status": self.current_freshness,
      }
    raise AssertionError(f"Unexpected fetchrow query: {query}")

  async def fetchval(self, query: str, *args: Any) -> Any:
    if "seasonal_auto_publish_audit_log" in query:
      return False
    if "from product_seasonal_collection_items i" in query:
      assert "i.sponsorship_type<>'sponsored'" in query
      assert "o.affiliate_type<>'sponsored'" in query
      assert "product_shades" in query and "product_assets" in query and "product_offers" in query
      assert "a.shade_id=i.shade_id" in query and "o.shade_id=i.shade_id" in query
      return self.current_eligible if args[0] == CURRENT_ID else self.prior_eligible
    raise AssertionError(f"Unexpected fetchval query: {query}")

  async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
    if "c.status='suspended'" in query:
      assert "for update" in query.lower()
      assert "prior_rollback.previous_collection_id=c.id" in query
      if self.prior_eligible is None:
        return []
      content_age = timedelta(hours=2 if self.prior_sources_fresh else 7)
      return [{
        "id": PRIOR_ID,
        "revision": 1,
        "input_fingerprint": PRIOR_FINGERPRINT,
        "source_updated_at": NOW - content_age,
        "source_payload": {
          "collector": {"datalabUpdatedAt": (NOW - timedelta(hours=12)).isoformat()},
          "weatherUpdatedAt": (NOW - timedelta(hours=1)).isoformat(),
        },
        "published_at": NOW - timedelta(days=1),
      }]
    raise AssertionError(f"Unexpected fetch query: {query}")

  async def execute(self, query: str, *args: Any) -> str:
    self.executed.append((query, args))
    return "OK"


class _HealthDb:
  is_connected = True

  def __init__(
    self,
    *,
    current_eligible: int,
    prior_eligible: int | None,
    request_count: int = 100,
    fallback_count: int = 0,
    duplicate_status: str | None = None,
    current_published_at: datetime | None = None,
    prior_sources_fresh: bool = True,
    current_freshness: str = "fresh",
    retry_windows: list[datetime] | None = None,
  ) -> None:
    self.connection = _HealthConnection(
      current_eligible=current_eligible,
      prior_eligible=prior_eligible,
      duplicate_status=duplicate_status,
      current_published_at=current_published_at,
      prior_sources_fresh=prior_sources_fresh,
      current_freshness=current_freshness,
    )
    self.request_count = request_count
    self.fallback_count = fallback_count
    self.retry_windows = retry_windows or []
    self.executed: list[tuple[str, tuple[Any, ...]]] = []
    self.transaction_count = 0

  async def run_in_transaction(self, operation: Any) -> Any:
    self.transaction_count += 1
    return await operation(self.connection)

  async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
    if "from seasonal_pipeline_runs" in query and "trigger_type='health'" in query:
      assert "status='failed'" in query and "status='running'" in query
      assert "missing_runs_with_traffic" in query
      assert "seasonal_serving_health_buckets" in query
      assert "limit 3" in query
      assert args[3] == "ko-KR"
      return [{"scheduled_for": value} for value in self.retry_windows]
    if "status='published'" in query:
      assert "slug like 'trend-now-%'" in query
      return [{"id": CURRENT_ID, "region_code": "KR-00"}]
    if "seasonal_serving_health_buckets" in query:
      assert args[2] - args[1] == timedelta(minutes=15)
      return [{
        "region_code": "KR-00",
        "request_count": self.request_count,
        "fallback_count": self.fallback_count,
      }]
    raise AssertionError(f"Unexpected db.fetch query: {query}")

  async def execute(self, query: str, *args: Any) -> str:
    self.executed.append((query, args))
    return "OK"


def test_health_bucket_and_idempotency_are_fixed_to_15_minutes() -> None:
  assert health_bucket_start(NOW) == datetime(2026, 7, 16, 12, 30, tzinfo=timezone.utc)
  assert health_idempotency_key(NOW) == "trend-now:health:2026-07-16T12:30:00+00:00"


@pytest.mark.asyncio
async def test_serving_outcome_is_a_single_best_effort_bucket_upsert() -> None:
  db = _RecordingDb()
  stored = await record_seasonal_serving_outcome(
    db,  # type: ignore[arg-type]
    locale="ko-KR",
    region_code="KR-11",
    used_fallback=True,
    now=NOW,
  )

  assert stored is True
  assert len(db.calls) == 1
  query, args = db.calls[0]
  assert "on conflict (bucket_started_at,locale,region_code) do update" in query
  assert args == (health_bucket_start(NOW), "ko-KR", "KR-11", 1)

  failing = _RecordingDb(fail=True)
  assert await record_seasonal_serving_outcome(
    failing,  # type: ignore[arg-type]
    locale="ko-KR",
    region_code="KR-00",
    used_fallback=False,
    now=NOW,
  ) is False


@pytest.mark.asyncio
async def test_low_eligible_count_rolls_back_atomically_and_clears_cache(monkeypatch) -> None:
  db = _HealthDb(current_eligible=8, prior_eligible=15, fallback_count=2)
  cleared: list[bool] = []
  monkeypatch.setattr(
    "app.services.product_recommendations.clear_seasonal_recommendation_cache",
    lambda: cleared.append(True),
  )

  result = await run_trend_now_health_check(db, _settings(), now=NOW)  # type: ignore[arg-type]

  assert result["status"] == "succeeded"
  assert result["rolledBackCount"] == 1
  assert result["blockedCount"] == 0
  assert db.transaction_count == 2  # idempotent run claim + locked region decision
  region = result["regions"][0]
  assert region["status"] == "rolledBack"
  assert region["restoredCollectionId"] == str(PRIOR_ID)
  assert region["eligibleItemCount"] == 8
  assert cleared == [True]

  statements = [query for query, _ in db.connection.executed]
  suspend_index = next(index for index, query in enumerate(statements) if "automatic_health_rollback" in query)
  restore_index = next(
    index
    for index, query in enumerate(statements)
    if "status='published',freshness_status=$2" in query
  )
  audit_index = next(index for index, query in enumerate(statements) if "seasonal_auto_publish_audit_log" in query)
  assert suspend_index < restore_index < audit_index
  restore_query, restore_args = db.connection.executed[restore_index]
  assert "published_at=" not in restore_query
  assert restore_args[1] == "fresh"
  audit_args = db.connection.executed[audit_index][1]
  assert audit_args[0] == RUN_ID
  assert audit_args[1] == PRIOR_ID
  assert audit_args[2] == CURRENT_ID
  assert audit_args[5] == PRIOR_FINGERPRINT
  assert "ELIGIBLE_ITEM_COUNT_BELOW_FLOOR" in audit_args[-1]


@pytest.mark.asyncio
async def test_fallback_ratio_above_ten_percent_triggers_rollback() -> None:
  db = _HealthDb(
    current_eligible=18,
    prior_eligible=14,
    request_count=100,
    fallback_count=11,
  )

  result = await run_trend_now_health_check(db, _settings(), now=NOW)  # type: ignore[arg-type]

  region = result["regions"][0]
  assert region["status"] == "rolledBack"
  assert region["fallbackRatio"] == 0.11
  assert region["reasons"] == ["FALLBACK_RATIO_ABOVE_LIMIT"]


@pytest.mark.asyncio
async def test_fallback_ratio_requires_minimum_sample() -> None:
  db = _HealthDb(
    current_eligible=18,
    prior_eligible=14,
    request_count=1,
    fallback_count=1,
  )

  result = await run_trend_now_health_check(db, _settings(), now=NOW)  # type: ignore[arg-type]

  region = result["regions"][0]
  assert region["status"] == "healthy"
  assert region["fallbackRatio"] == 1.0
  assert region["fallbackRatioEligible"] is False


@pytest.mark.asyncio
async def test_fallback_ratio_ignores_bucket_started_before_current_revision() -> None:
  db = _HealthDb(
    current_eligible=18,
    prior_eligible=14,
    request_count=100,
    fallback_count=100,
    current_published_at=datetime(2026, 7, 16, 12, 20, tzinfo=timezone.utc),
  )

  result = await run_trend_now_health_check(db, _settings(), now=NOW)  # type: ignore[arg-type]

  region = result["regions"][0]
  assert region["status"] == "healthy"
  assert region["fallbackRatioEligible"] is False


@pytest.mark.asyncio
async def test_rollback_preserves_original_publish_time_and_marks_old_sources_stale() -> None:
  db = _HealthDb(
    current_eligible=8,
    prior_eligible=15,
    prior_sources_fresh=False,
  )

  result = await run_trend_now_health_check(db, _settings(), now=NOW)  # type: ignore[arg-type]

  assert result["regions"][0]["rollbackFreshnessStatus"] == "stale"
  restore = next(
    (query, args)
    for query, args in db.connection.executed
    if "status='published',freshness_status=$2" in query
  )
  assert "published_at=" not in restore[0]
  assert restore[1][1] == "stale"


@pytest.mark.asyncio
async def test_fallback_only_rollback_rejects_a_stale_candidate() -> None:
  db = _HealthDb(
    current_eligible=18,
    prior_eligible=15,
    request_count=100,
    fallback_count=11,
    prior_sources_fresh=False,
  )

  result = await run_trend_now_health_check(db, _settings(), now=NOW)  # type: ignore[arg-type]

  region = result["regions"][0]
  assert region["status"] == "blocked"
  assert region["rollbackCandidateStatus"] == "noEligiblePriorRevision"
  assert not any("status='published',freshness_status=$2" in query for query, _ in db.connection.executed)


@pytest.mark.asyncio
async def test_stale_current_revision_does_not_chain_on_fallback_ratio() -> None:
  db = _HealthDb(
    current_eligible=18,
    prior_eligible=15,
    request_count=100,
    fallback_count=100,
    current_freshness="stale",
  )

  result = await run_trend_now_health_check(db, _settings(), now=NOW)  # type: ignore[arg-type]

  region = result["regions"][0]
  assert region["status"] == "healthy"
  assert region["fallbackRatioEligible"] is False


@pytest.mark.asyncio
async def test_exact_health_thresholds_are_healthy_and_do_not_mutate_collection() -> None:
  db = _HealthDb(
    current_eligible=12,
    prior_eligible=15,
    request_count=100,
    fallback_count=10,
  )

  result = await run_trend_now_health_check(db, _settings(), now=NOW)  # type: ignore[arg-type]

  assert result["regions"][0]["status"] == "healthy"
  assert result["rolledBackCount"] == 0
  assert result["blockedCount"] == 0
  assert not any("product_seasonal_collections set" in query for query, _ in db.connection.executed)
  assert not any("seasonal_auto_publish_audit_log" in query for query, _ in db.connection.executed)


@pytest.mark.asyncio
async def test_missing_valid_prior_revision_records_immutable_blocked_decision() -> None:
  db = _HealthDb(current_eligible=7, prior_eligible=None)

  result = await run_trend_now_health_check(db, _settings(), now=NOW)  # type: ignore[arg-type]

  assert result["rolledBackCount"] == 0
  assert result["blockedCount"] == 1
  assert result["regions"][0]["status"] == "blocked"
  audit = next(
    (query, args)
    for query, args in db.connection.executed
    if "seasonal_auto_publish_audit_log" in query
  )
  assert "'blocked'" in audit[0]
  assert audit[1][1] == CURRENT_ID
  assert audit[1][-1][-1] == "NO_ELIGIBLE_ROLLBACK_REVISION"
  assert not any("automatic_health_rollback" in query for query, _ in db.connection.executed)


@pytest.mark.asyncio
async def test_completed_health_slot_is_idempotent() -> None:
  db = _HealthDb(
    current_eligible=1,
    prior_eligible=15,
    duplicate_status="succeeded",
  )

  result = await run_trend_now_health_check(db, _settings(), now=NOW)  # type: ignore[arg-type]

  assert result == {
    "status": "duplicate",
    "runId": str(RUN_ID),
    "existingStatus": "succeeded",
    "rolledBackCount": 0,
    "blockedCount": 0,
  }
  assert db.transaction_count == 1


@pytest.mark.asyncio
async def test_failed_health_slot_is_reclaimed_without_duplicate_rollback() -> None:
  db = _HealthDb(
    current_eligible=12,
    prior_eligible=15,
    duplicate_status="failed",
  )

  result = await run_trend_now_health_check(db, _settings(), now=NOW)  # type: ignore[arg-type]

  assert result["status"] == "succeeded"
  assert result["regions"][0]["status"] == "healthy"
  assert db.transaction_count == 2
  retry_update = next(
    query
    for query, _ in db.connection.executed
    if "step_results='{}'::jsonb" in query
  )
  assert "error_code=null" in retry_update and "error_message=null" in retry_update


@pytest.mark.asyncio
async def test_failed_prior_window_is_recovered_before_current_window() -> None:
  failed_window = datetime(2026, 7, 16, 12, 15, tzinfo=timezone.utc)
  db = _HealthDb(
    current_eligible=12,
    prior_eligible=15,
    retry_windows=[failed_window],
  )

  result = await run_trend_now_health_check(db, _settings(), now=NOW)  # type: ignore[arg-type]

  assert result["status"] == "succeeded"
  assert result["recoveredWindowCount"] == 1
  assert [window["windowEndedAt"] for window in result["windows"]] == [
    failed_window.isoformat(),
    datetime(2026, 7, 16, 12, 30, tzinfo=timezone.utc).isoformat(),
  ]
  assert db.connection.claimed_windows == [
    failed_window,
    datetime(2026, 7, 16, 12, 30, tzinfo=timezone.utc),
  ]
  assert db.transaction_count == 4


def test_aws_schedule_uses_same_digest_pinned_task_for_15_minute_health_override() -> None:
  script = (
    Path(__file__).resolve().parents[3] / "scripts/aws/configure_trend_now_schedule.ps1"
  ).read_text(encoding="utf-8")

  assert '[string]$HealthScheduleExpression = "rate(15 minutes)"' in script
  assert '"app.ops.check_trend_now_health"' in script
  assert "containerOverrides" in script
  assert "InputTransformer" in script and "InputTemplate = $healthInput" in script
  assert script.count("TaskDefinitionArn = $taskDefinitionArn") == 2
  assert "$runningTask.taskDefinitionArn -ne $service.taskDefinition" in script
  assert "pass SourceContainerName explicitly" in script
  assert '"iam:PassedToService" = "ecs-tasks.amazonaws.com"' in script
  assert "aws iam update-assume-role-policy" in script
  assert 'name = "PRODUCT_TREND_TASK_ROLE_ARN"' in script
  assert "value = $sourceTask.taskRoleArn" in script
  assert "AWS_SECRET_ACCESS_KEY" in script and "container.secrets" in script
  assert "[guid]::NewGuid()" in script
  assert "aws logs put-metric-filter" in script
  assert "trend_now_health_task_failed" in script
  assert '"cloudwatch", "put-metric-alarm"' in script
  assert '"--treat-missing-data", "notBreaching"' in script
  assert "AlarmSnsTopicArn" in script
  assert "Remove-Item -Recurse -Force $tempDir" in script

  command = (
    Path(__file__).resolve().parents[1] / "app/ops/check_trend_now_health.py"
  ).read_text(encoding="utf-8")
  assert command.count('"event": "trend_now_health_task_failed"') == 2
