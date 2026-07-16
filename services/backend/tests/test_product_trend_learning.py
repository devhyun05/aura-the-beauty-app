from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import pytest

from app.services.product_trend_learning import (
  ActiveRankingModel,
  MAX_EXPLORATION_RATE,
  aggregate_completed_product_signal_hour,
  aggregate_completed_signal_hours,
  ndcg_at_k,
  position_bias_multiplier,
  score_ranking_candidate,
  select_deterministic_exploration,
  train_and_maybe_activate_logistic_ranker,
)


NOW = datetime(2026, 7, 16, 12, 34, 56, tzinfo=timezone.utc)
SERVICE_PRINCIPAL_ID = UUID("11111111-1111-4111-8111-111111111111")


class _AggregationDb:
  def __init__(self) -> None:
    self.query = ""
    self.args: tuple[Any, ...] = ()

  async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
    self.query = query
    self.args = args
    return [
      {"product_id": "a", "is_privacy_eligible": True},
      {"product_id": "b", "is_privacy_eligible": False},
    ]


@pytest.mark.asyncio
async def test_hourly_aggregation_uses_completed_bucket_consent_and_national_only() -> None:
  db = _AggregationDb()
  result = await aggregate_completed_product_signal_hour(db, now=NOW)  # type: ignore[arg-type]

  assert result.bucket_started_at == datetime(2026, 7, 16, 11, tzinfo=timezone.utc)
  assert result.bucket_ended_at == datetime(2026, 7, 16, 12, tzinfo=timezone.utc)
  assert result.product_count == 2
  assert result.privacy_eligible_product_count == 1
  assert db.args == (result.bucket_started_at, result.bucket_ended_at, 20)
  assert "distinct on (user_id)" in db.query
  assert "consent.accepted = true" in db.query
  assert "consent.revoked_at is null" in db.query
  assert "'KR-00'::text as region_code" in db.query
  assert "distinct_user_count >= $3" in db.query
  assert "on conflict (bucket_started_at, region_code, product_id)" in db.query
  assert "event.context" not in db.query
  assert "latitude" not in db.query.lower()
  assert "longitude" not in db.query.lower()


def test_position_bias_multiplier_is_monotonic_and_capped() -> None:
  assert position_bias_multiplier(None) == 1.0
  assert position_bias_multiplier(0) == 1.0
  assert position_bias_multiplier(3) == 2.0
  assert position_bias_multiplier(15) == 4.0
  assert position_bias_multiplier(999) == 4.0


def test_active_model_does_not_fabricate_a_score_without_private_history() -> None:
  model = ActiveRankingModel(
    id=None,
    model_version="logistic-v1",
    model_type="logistic",
    coefficients={
      "intercept": 1.0,
      "weights": {name: 0.0 for name in (
        "logImpressions",
        "openRate",
        "likeRate",
        "outboundRate",
        "negativeRate",
        "positionAdjustedRate",
      )},
      "means": {},
      "scales": {},
    },
  )
  assert score_ranking_candidate({"history_impression_count": 0}, model) is None


class _CatchupAggregationDb:
  def __init__(self) -> None:
    self.product_windows: list[tuple[datetime, datetime]] = []
    self.search_windows: list[tuple[datetime, datetime]] = []

  async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
    window = (args[0], args[1])
    if "insert into product_signal_hourly" in query:
      self.product_windows.append(window)
      return []
    if "insert into search_intent_hourly" in query:
      self.search_windows.append(window)
      return []
    raise AssertionError("unexpected aggregation query")


@pytest.mark.asyncio
async def test_three_hour_scheduler_catches_up_all_completed_hour_buckets() -> None:
  db = _CatchupAggregationDb()
  result = await aggregate_completed_signal_hours(db, now=NOW, hours=3)  # type: ignore[arg-type]

  expected = [
    (
      datetime(2026, 7, 16, hour, tzinfo=timezone.utc),
      datetime(2026, 7, 16, hour + 1, tzinfo=timezone.utc),
    )
    for hour in (9, 10, 11)
  ]
  assert db.product_windows == expected
  assert db.search_windows == expected
  assert result["bucketCount"] == 3
  assert result["firstBucketStartedAt"] == expected[0][0]
  assert result["lastBucketEndedAt"] == expected[-1][1]


class _TrainingConnection:
  def __init__(self) -> None:
    self.calls: list[tuple[str, tuple[Any, ...]]] = []

  async def execute(self, query: str, *args: Any) -> str:
    self.calls.append((query, args))
    return "OK"


class _TrainingDb:
  def __init__(self, rows: list[dict[str, Any]], baseline: dict[str, Any] | None) -> None:
    self.rows = rows
    self.baseline = baseline
    self.fetch_args: tuple[Any, ...] = ()
    self.connection = _TrainingConnection()
    self.fetchrow_called = False
    self.transaction_called = False

  async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
    assert "from product_signal_hourly" in query
    assert "region_code = 'KR-00'" in query
    assert "is_privacy_eligible = true" in query
    assert "rows between 24 preceding and 1 preceding" in query
    self.fetch_args = args
    return self.rows

  async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
    self.fetchrow_called = True
    assert "where status = 'active'" in query
    return self.baseline

  async def run_in_transaction(self, operation: Any) -> Any:
    self.transaction_called = True
    return await operation(self.connection)


def _learning_rows() -> list[dict[str, Any]]:
  rows: list[dict[str, Any]] = []
  start = datetime(2026, 7, 10, tzinfo=timezone.utc)
  product_profiles = (
    ("strong", 30, 12, 8, 2, 2, 240, 80, 50, 1, 2, -30.0),
    ("medium", 15, 5, 2, 2, 3, 130, 30, 15, 3, 4, 0.0),
    ("weak", 3, 1, 0, 4, 6, 30, 5, 1, 7, 9, 30.0),
  )
  for hour in range(10):
    bucket = start + timedelta(hours=hour)
    for (
      product_id,
      opens,
      likes,
      outbounds,
      unlikes,
      hides,
      history_opens,
      history_likes,
      history_outbounds,
      history_unlikes,
      history_hides,
      history_position_score,
    ) in product_profiles:
      rows.append({
        "bucket_started_at": bucket,
        "product_id": product_id,
        "impression_count": 100,
        "product_open_count": opens,
        "like_count": likes,
        "unlike_count": unlikes,
        "seller_outbound_count": outbounds,
        "hide_count": hides,
        "position_adjusted_score": 0.0,
        "history_impression_count": 1_000,
        "history_product_open_count": history_opens,
        "history_like_count": history_likes,
        "history_unlike_count": history_unlikes,
        "history_seller_outbound_count": history_outbounds,
        "history_hide_count": history_hides,
        # Deliberately inverse to relevance so the active RRF fallback loses.
        "history_position_adjusted_score": history_position_score,
      })
  return rows


@pytest.mark.asyncio
async def test_training_skips_before_minimum_impressions_without_touching_models() -> None:
  rows = _learning_rows()[:3]
  db = _TrainingDb(rows, baseline=None)

  result = await train_and_maybe_activate_logistic_ranker(
    db,  # type: ignore[arg-type]
    service_principal_id=SERVICE_PRINCIPAL_ID,
    now=NOW,
  )

  assert result.status == "skipped"
  assert result.reason == "INSUFFICIENT_IMPRESSIONS"
  assert result.impression_count == 300
  assert db.fetchrow_called is False
  assert db.transaction_called is False


@pytest.mark.asyncio
async def test_training_skips_before_minimum_qualified_actions() -> None:
  rows = _learning_rows()
  for row in rows:
    row["product_open_count"] = 0
    row["like_count"] = 0
    row["seller_outbound_count"] = 0
  db = _TrainingDb(rows, baseline=None)

  result = await train_and_maybe_activate_logistic_ranker(
    db,  # type: ignore[arg-type]
    service_principal_id=SERVICE_PRINCIPAL_ID,
    now=NOW,
  )

  assert result.status == "skipped"
  assert result.reason == "INSUFFICIENT_QUALIFIED_ACTIONS"
  assert result.impression_count == 3_000
  assert result.qualified_action_count == 0
  assert db.fetchrow_called is False
  assert db.transaction_called is False


@pytest.mark.asyncio
async def test_logistic_ranker_uses_time_split_and_activates_only_after_uplift_gate() -> None:
  db = _TrainingDb(
    _learning_rows(),
    baseline={
      "model_version": "rrf-v1",
      "model_type": "rrf",
      "coefficients": {},
      "ndcg_at_12": 0.5,
    },
  )

  result = await train_and_maybe_activate_logistic_ranker(
    db,  # type: ignore[arg-type]
    service_principal_id=SERVICE_PRINCIPAL_ID,
    now=NOW,
  )

  assert result.status == "active"
  assert result.promoted is True
  assert result.validation_uplift is not None and result.validation_uplift >= 0.03
  assert result.candidate_ndcg_at_12 is not None
  assert result.baseline_ndcg_at_12 is not None
  assert result.candidate_ndcg_at_12 > result.baseline_ndcg_at_12
  assert result.model_version is not None and result.model_version.startswith("logistic-2026071612-")
  assert db.transaction_called is True
  assert len(db.connection.calls) == 2
  retire_query, retire_args = db.connection.calls[0]
  insert_query, insert_args = db.connection.calls[1]
  assert "set status = 'retired'" in retire_query
  assert retire_args == (result.model_version,)
  assert "insert into seasonal_ranking_models" in insert_query
  assert insert_args[1] == "active"
  assert insert_args[-1] == SERVICE_PRINCIPAL_ID
  metrics = json.loads(str(insert_args[8]))
  assert metrics["metric"] == "ndcg@12"
  assert metrics["requiredUplift"] == 0.03
  assert metrics["timeSplitAt"].startswith("2026-07-10T08:00:00")


@pytest.mark.asyncio
async def test_candidate_stays_shadow_when_active_baseline_is_not_beaten_by_three_percent() -> None:
  feature_names = (
    "logImpressions",
    "openRate",
    "likeRate",
    "outboundRate",
    "negativeRate",
    "positionAdjustedRate",
  )
  baseline_weights = {name: 0.0 for name in feature_names}
  baseline_weights.update({"openRate": 10.0, "likeRate": 5.0, "outboundRate": 3.0})
  db = _TrainingDb(
    _learning_rows(),
    baseline={
      "model_version": "logistic-current",
      "model_type": "logistic",
      "coefficients": {
        "intercept": 0.0,
        "weights": baseline_weights,
        "means": {name: 0.0 for name in feature_names},
        "scales": {name: 1.0 for name in feature_names},
      },
      "ndcg_at_12": 1.0,
    },
  )

  result = await train_and_maybe_activate_logistic_ranker(
    db,  # type: ignore[arg-type]
    service_principal_id=SERVICE_PRINCIPAL_ID,
    now=NOW,
  )

  assert result.status == "shadow"
  assert result.promoted is False
  assert result.reason == "VALIDATION_UPLIFT_BELOW_THRESHOLD"
  assert result.validation_uplift is not None and result.validation_uplift < 0.03
  assert len(db.connection.calls) == 1
  insert_query, insert_args = db.connection.calls[0]
  assert "insert into seasonal_ranking_models" in insert_query
  assert insert_args[1] == "shadow"


def test_ndcg_and_exploration_are_deterministic_and_capped() -> None:
  assert ndcg_at_k([(0.9, 3.0), (0.2, 0.0), (0.1, 1.0)]) > ndcg_at_k(
    [(0.1, 3.0), (0.9, 0.0), (0.2, 1.0)]
  )
  allocations = [
    select_deterministic_exploration(
      f"request-{index}",
      model_version="logistic-v1",
    )
    for index in range(10_000)
  ]
  assert allocations == [
    select_deterministic_exploration(
      f"request-{index}",
      model_version="logistic-v1",
    )
    for index in range(10_000)
  ]
  assert 400 <= sum(allocations) <= 600
  assert select_deterministic_exploration(
    "request-1", model_version="logistic-v1", exploration_rate=0.0
  ) is False
  with pytest.raises(ValueError):
    select_deterministic_exploration(
      "request-1",
      model_version="logistic-v1",
      exploration_rate=MAX_EXPLORATION_RATE + 0.001,
    )
