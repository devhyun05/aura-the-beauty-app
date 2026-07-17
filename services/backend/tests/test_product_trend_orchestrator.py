from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from types import SimpleNamespace
from uuid import UUID

import pytest

from app.core.settings import Settings
import app.services.product_trend_orchestrator as orchestrator

from app.services.product_trend_orchestrator import (
  DATALAB_MEANINGFUL_RISE,
  _create_pipeline_run,
  _last_completed_times,
  _resolve_service_principal,
  load_cached_trend_snapshot,
  pipeline_idempotency_key,
  persist_daily_content_observations,
  persist_trend_momenta,
  ranking_aware_fingerprint,
  relevant_consensus_signal_groups,
  scheduled_slot,
)
from app.services.product_trend_discovery import BurstPhraseCandidate, DailyContentPhraseObservation
from app.services.product_trend_learning import ActiveRankingModel
from app.services.product_trend_sources import TrendSignal, TrendSnapshot
from app.services.product_trends import TrendMomentum


RUN_ID = UUID("22222222-2222-4222-8222-222222222222")
CANDIDATE_ID = UUID("33333333-3333-4333-8333-333333333333")


def test_three_hour_slot_and_idempotency_key_are_stable() -> None:
  now = datetime(2026, 7, 16, 8, 59, 59, tzinfo=timezone.utc)
  assert scheduled_slot(now) == datetime(2026, 7, 16, 6, tzinfo=timezone.utc)
  assert pipeline_idempotency_key("scheduled", now) == (
    "trend-now:scheduled:2026-07-16T06:00:00+00:00"
  )


def test_manual_and_scheduled_runs_do_not_share_an_idempotency_key() -> None:
  now = datetime(2026, 7, 16, 9, tzinfo=timezone.utc)
  assert pipeline_idempotency_key("manual", now) != pipeline_idempotency_key("scheduled", now)


def test_ranking_model_version_is_part_of_collection_fingerprint() -> None:
  base = "a" * 64
  assert ranking_aware_fingerprint(base, model_version="rrf_v1") == ranking_aware_fingerprint(
    base, model_version="rrf_v1"
  )
  assert ranking_aware_fingerprint(base, model_version="rrf_v1") != ranking_aware_fingerprint(
    base, model_version="logistic-v2"
  )


class _WatermarkDb:
  async def fetchrow(self, _query: str, *_args: Any) -> dict[str, Any] | None:
    return {"value": None}

  async def fetch(self, _query: str, *_args: Any) -> list[dict[str, Any]]:
    completed = datetime(2026, 7, 16, 9, tzinfo=timezone.utc)
    return [{
      "completed_at": completed,
      "step_results": {
        "content": {"status": "noQualifiedBurst", "candidateCount": 0},
        "datalab": {"status": "unavailable", "observationCount": 0},
        "weather": {"status": "ready", "stored": 0},
        "model": {"status": "skipped", "reason": "INSUFFICIENT_IMPRESSIONS"},
      },
    }]


@pytest.mark.asyncio
async def test_successful_empty_source_steps_advance_due_watermarks() -> None:
  watermarks = await _last_completed_times(_WatermarkDb())  # type: ignore[arg-type]
  expected = datetime(2026, 7, 16, 9, tzinfo=timezone.utc)
  assert watermarks == {
    "content": expected,
    "datalab": expected,
    "weather": expected,
    "model": expected,
  }


class _RunDb:
  def __init__(self, insert_result: dict[str, Any] | None, existing_status: str = "succeeded") -> None:
    self.insert_result = insert_result
    self.existing_status = existing_status
    self.calls: list[tuple[str, tuple[Any, ...]]] = []

  async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
    self.calls.append((query, args))
    if "insert into seasonal_pipeline_runs" in query:
      return self.insert_result
    return {"id": RUN_ID, "status": self.existing_status}


@pytest.mark.asyncio
async def test_failed_or_stale_slot_can_be_atomically_reopened() -> None:
  db = _RunDb({"id": RUN_ID, "status": "running"})
  now = datetime(2026, 7, 16, 9, tzinfo=timezone.utc)
  row, created = await _create_pipeline_run(
    db,  # type: ignore[arg-type]
    Settings(),
    trigger_type="scheduled",
    now=now,
    shadow_mode=True,
    service_principal_id=None,
  )
  query, args = db.calls[0]
  assert created is True and row["id"] == RUN_ID
  assert "seasonal_pipeline_runs.status='failed'" in query
  assert "seasonal_pipeline_runs.status='running'" in query
  assert "step_results='{}'::jsonb" in query
  assert args[-1] < now


@pytest.mark.asyncio
async def test_completed_slot_remains_an_idempotent_duplicate() -> None:
  db = _RunDb(None, existing_status="succeeded")
  row, created = await _create_pipeline_run(
    db,  # type: ignore[arg-type]
    Settings(),
    trigger_type="scheduled",
    now=datetime(2026, 7, 16, 9, tzinfo=timezone.utc),
    shadow_mode=True,
    service_principal_id=None,
  )
  assert created is False
  assert row == {"id": RUN_ID, "status": "succeeded"}


class _PrincipalDb:
  is_connected = True

  def __init__(self) -> None:
    self.args: tuple[Any, ...] | None = None

  async def fetchrow(self, _query: str, *args: Any) -> dict[str, Any]:
    self.args = args
    return {"id": RUN_ID, "external_subject": args[-1]}


@pytest.mark.asyncio
async def test_service_principal_is_bound_to_configured_task_role_arn() -> None:
  db = _PrincipalDb()
  assert await _resolve_service_principal(db, Settings()) is None  # type: ignore[arg-type]
  assert db.args is None
  task_role = "arn:aws:iam::123456789012:role/trend-now-task"
  principal = await _resolve_service_principal(
    db,  # type: ignore[arg-type]
    Settings(product_trend_task_role_arn=task_role),
  )
  assert principal is not None
  assert db.args == ("trend-now-orchestrator", task_role)


class _MomentumConnection:
  def __init__(self, *, distinct_user_count: int) -> None:
    self.distinct_user_count = distinct_user_count
    self.executed: list[tuple[str, tuple[Any, ...]]] = []

  async def fetchrow(self, query: str, *_args: Any) -> dict[str, Any]:
    if "from trend_keyword_candidates" in query:
      return {"id": CANDIDATE_ID, "status": "observed"}
    return {
      "action_count": 30 if self.distinct_user_count else 0,
      "distinct_user_count": self.distinct_user_count,
    }

  async def execute(self, query: str, *args: Any) -> str:
    self.executed.append((query, args))
    return "OK"


class _MomentumDb:
  pool = object()

  def __init__(self, connection: _MomentumConnection) -> None:
    self.connection = connection

  async def run_in_transaction(self, operation: Any) -> Any:
    return await operation(self.connection)


def _momentum(value: float) -> TrendMomentum:
  return TrendMomentum(
    keyword="글로우 립",
    source="naver_search",
    recent_average=100 * (1 + value),
    previous_average=100,
    momentum=value,
    latest_period="2026-07-15",
  )


@pytest.mark.asyncio
async def test_tiny_datalab_rise_does_not_promote_without_private_intent() -> None:
  connection = _MomentumConnection(distinct_user_count=0)
  await persist_trend_momenta(
    _MomentumDb(connection),  # type: ignore[arg-type]
    [_momentum(DATALAB_MEANINGFUL_RISE / 2)],
    locale="ko-KR",
    now=datetime(2026, 7, 16, 9, tzinfo=timezone.utc),
  )
  assert not any("update trend_keyword_candidates" in query for query, _args in connection.executed)


@pytest.mark.asyncio
@pytest.mark.parametrize(
  ("rise", "distinct_users", "meaningful", "intent_confirmed"),
  [
    (DATALAB_MEANINGFUL_RISE, 0, True, False),
    (DATALAB_MEANINGFUL_RISE / 2, 20, False, True),
  ],
)
async def test_meaningful_or_private_intent_confirmed_rise_promotes_candidate(
  rise: float,
  distinct_users: int,
  meaningful: bool,
  intent_confirmed: bool,
) -> None:
  connection = _MomentumConnection(distinct_user_count=distinct_users)
  await persist_trend_momenta(
    _MomentumDb(connection),  # type: ignore[arg-type]
    [_momentum(rise)],
    locale="ko-KR",
    now=datetime(2026, 7, 16, 9, tzinfo=timezone.utc),
  )
  update_query, update_args = next(
    (query, args) for query, args in connection.executed
    if "update trend_keyword_candidates" in query
  )
  assert "'datalabConfirmed',true" in update_query
  assert update_args[-2:] == (meaningful, intent_confirmed)
  confirmation_query, confirmation_args = next(
    (query, args) for query, args in connection.executed
    if "update search_intent_hourly" in query
  )
  assert "datalab_confirmed=true" in confirmation_query
  assert "is_privacy_eligible=true" in confirmation_query
  assert confirmation_args[0] == CANDIDATE_ID


class _DailyObservationConnection:
  def __init__(self) -> None:
    self.executed: list[tuple[str, tuple[Any, ...]]] = []
    self.candidate_query = ""

  async def fetchrow(self, query: str, *_args: Any) -> dict[str, Any]:
    self.candidate_query = query
    return {"id": CANDIDATE_ID, "status": "qualified"}

  async def execute(self, query: str, *args: Any) -> str:
    self.executed.append((query, args))
    return "OK"


@pytest.mark.asyncio
async def test_daily_content_baseline_persists_aggregate_only_without_downgrade() -> None:
  connection = _DailyObservationConnection()
  observation = DailyContentPhraseObservation(
    keyword="복숭아 글로우 립",
    document_count=3,
    source_count=2,
    baseline_7d=1.25,
    baseline_28d=0.75,
    daily_baseline_counts=tuple([0] * 27 + [3]),
    categories=("lip",),
    finishes=("glossy",),
    benefit_tags=(),
    evidence_ids=("opaque-hash-a", "opaque-hash-b"),
  )
  stored = await persist_daily_content_observations(
    _MomentumDb(connection),  # type: ignore[arg-type]
    [observation],
    locale="ko-KR",
    now=datetime(2026, 7, 16, 9, tzinfo=timezone.utc),
  )
  assert stored == 1
  assert "case when trend_keyword_candidates.status='qualified'" in connection.candidate_query
  observation_query, observation_args = connection.executed[0]
  assert "baseline_7d,baseline_28d" in observation_query
  assert observation_args[5:7] == (1.25, 0.75)
  serialized = " ".join(str(value) for value in observation_args)
  assert "opaque-hash-a" in serialized
  assert "복숭아 글로우 립" not in serialized


def test_consensus_groups_exclude_weather_catalog_and_do_not_double_count_app() -> None:
  groups = relevant_consensus_signal_groups(
    {"naver_content", "datalab", "app_intent", "kma_weather", "catalog_evidence"},
    [{
      "scoreComponents": {
        "content": 2.0,
        "datalab": 1.0,
        "app": 3.0,
        "weather": 1.0,
        "evidence": 0.95,
      },
    }],
  )
  assert groups == {"naver_content", "datalab", "app_privacy_safe"}


class _SnapshotDb:
  is_connected = True

  def __init__(self, row: dict[str, Any]) -> None:
    self.row = row
    self.query = ""

  async def fetch(self, query: str, *_args: Any) -> list[dict[str, Any]]:
    self.query = query
    return [self.row]


@pytest.mark.asyncio
async def test_cached_snapshot_only_counts_positive_candidate_related_groups() -> None:
  observed_at = datetime(2026, 7, 16, 8, tzinfo=timezone.utc)
  base_row = {
    "normalized_keyword": "글로우 립",
    "category_codes": ["lip"],
    "benefit_tags": [],
    "finish_tags": ["glossy"],
    "confidence_score": 0.8,
    "normalization_metadata": {},
    "last_observed_at": observed_at,
    "content_updated_at": observed_at,
    "datalab_updated_at": None,
    "search_positive": False,
    "shopping_positive": False,
    "content_momentum": 3.0,
    "datalab_momentum": 0.0,
    "intent_confirmed": False,
  }
  db = _SnapshotDb(base_row)
  snapshot = await load_cached_trend_snapshot(
    db,  # type: ignore[arg-type]
    locale="ko-KR",
    now=datetime(2026, 7, 16, 9, tzinfo=timezone.utc),
  )
  assert snapshot is not None
  assert snapshot.source_metadata["signalGroups"] == ["naver_content"]
  assert snapshot.signals[0].datalab_momentum == 0
  assert "extract(epoch from (now()-c.last_observed_at))" in db.query
  assert "aggregateOnly" in db.query
  assert "select distinct on (o.source_name)" in db.query
  assert "intent.is_privacy_eligible=true" in db.query
  assert "intent.datalab_confirmed=true" in db.query

  db = _SnapshotDb({
    **base_row,
    "datalab_updated_at": observed_at,
    "search_positive": True,
    "datalab_momentum": 0.2,
    "intent_confirmed": True,
  })
  snapshot = await load_cached_trend_snapshot(
    db,  # type: ignore[arg-type]
    locale="ko-KR",
    now=datetime(2026, 7, 16, 9, tzinfo=timezone.utc),
  )
  assert snapshot is not None
  assert snapshot.source_metadata["signalGroups"] == ["app_intent", "datalab", "naver_content"]


class _ExecuteDb:
  def __init__(self) -> None:
    self.executed: list[tuple[str, tuple[Any, ...]]] = []

  async def execute(self, query: str, *args: Any) -> str:
    self.executed.append((query, args))
    return "OK"


class _BlockedDecision:
  passed = False
  reasons = ("TEST_SHADOW_BLOCK",)

  def as_dict(self) -> dict[str, Any]:
    return {"passed": False, "reasons": list(self.reasons)}


@pytest.mark.asyncio
async def test_orchestrator_passes_active_model_and_persists_model_identity(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  now = datetime(2026, 7, 16, 9, tzinfo=timezone.utc)
  model = ActiveRankingModel(
    id=UUID("44444444-4444-4444-8444-444444444444"),
    model_version="logistic-live-v3",
    model_type="logistic",
    coefficients={},
  )
  snapshot = TrendSnapshot(
    title="요즘 트렌드",
    summary="테스트",
    trend_window="24h",
    locale="ko-KR",
    source_name="cached",
    source_updated_at=now,
    signals=(TrendSignal(
      keyword="글로우 립",
      categories=("lip",),
      color_families=(),
      finishes=("glossy",),
      tags=(),
      reason_codes=("NAVER_CONTENT_BURST",),
      confidence_score=0.9,
      content_momentum=3.0,
    ),),
    source_metadata={
      "signalGroups": ["naver_content", "datalab"],
      "contentUpdatedAt": now.isoformat(),
      "datalabUpdatedAt": now.isoformat(),
    },
  )
  captured: dict[str, Any] = {}

  async def none_principal(*_args: Any, **_kwargs: Any) -> None:
    return None

  async def create_run(*_args: Any, **_kwargs: Any) -> tuple[dict[str, Any], bool]:
    return {"id": RUN_ID, "status": "running"}, True

  async def due_times(*_args: Any, **_kwargs: Any) -> dict[str, datetime]:
    return {key: now for key in ("content", "datalab", "weather", "model")}

  async def aggregate(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
    return {"status": "ready", "bucketCount": 3}

  async def active_model(*_args: Any, **_kwargs: Any) -> ActiveRankingModel:
    return model

  async def cached_snapshot(*_args: Any, **_kwargs: Any) -> TrendSnapshot:
    return snapshot

  async def no_weather(*_args: Any, **_kwargs: Any) -> None:
    return None

  async def candidates(*_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
    return [{"product_id": "product-1"}]

  def match(*_args: Any, **kwargs: Any) -> list[dict[str, Any]]:
    captured.update(kwargs)
    return [{
      "productId": "product-1",
      "shadeId": None,
      "position": 0,
      "reasonCodes": ["TREND_CATEGORY_MATCH"],
      "scoreComponents": {"app": 1.0, "weather": 0.0, "evidence": 0.0},
      "rankingModelVersion": model.model_version,
      "brandName": "Brand",
      "category": "lip",
    }]

  async def previous(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
    return {"collectionId": None, "inputFingerprint": None, "productIds": [], "weather": None}

  async def usage(*_args: Any, **_kwargs: Any) -> dict[str, int]:
    return {}

  monkeypatch.setattr(orchestrator, "_resolve_service_principal", none_principal)
  monkeypatch.setattr(orchestrator, "_create_pipeline_run", create_run)
  monkeypatch.setattr(orchestrator, "_last_completed_times", due_times)
  monkeypatch.setattr(orchestrator, "aggregate_completed_signal_hours", aggregate)
  monkeypatch.setattr(orchestrator, "trend_collection_due", lambda *_args, **_kwargs: False)
  monkeypatch.setattr(orchestrator, "load_active_ranking_model", active_model)
  monkeypatch.setattr(orchestrator, "load_cached_trend_snapshot", cached_snapshot)
  monkeypatch.setattr(orchestrator, "fetch_region_weather", no_weather)
  monkeypatch.setattr(orchestrator, "fetch_seasonal_product_candidates", candidates)
  monkeypatch.setattr(orchestrator, "match_trends_to_products", match)
  monkeypatch.setattr(orchestrator, "_previous_collection_context", previous)
  monkeypatch.setattr(orchestrator, "evaluate_auto_publish_quality", lambda **_kwargs: _BlockedDecision())
  monkeypatch.setattr(orchestrator, "_source_usage", usage)
  monkeypatch.setattr(orchestrator, "TREND_REGION_CODES", ("KR-00",))

  db = _ExecuteDb()
  result = await orchestrator._execute_pipeline(
    db,  # type: ignore[arg-type]
    Settings(),
    trigger_type="scheduled",
    auto_publish=False,
    locale="ko-KR",
    now=now,
  )

  assert result["status"] == "succeeded"
  assert captured["ranking_model"] == model
  assert captured["exploration_key"] == f"{RUN_ID}:KR-00"
  final_query, final_args = db.executed[-1]
  assert "ranking_model_id=$9" in final_query
  assert "algorithm_version=$10" in final_query
  assert final_args[-2:] == (model.id, "trend_now_rrf_v1+logistic_v1")


@pytest.mark.asyncio
async def test_content_step_persists_daily_baseline_and_preserves_preinsert_vocabulary(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  now = datetime(2026, 7, 16, 9, tzinfo=timezone.utc)
  order: list[str] = []
  daily = DailyContentPhraseObservation(
    keyword="복숭아 글로우 립",
    document_count=3,
    source_count=2,
    baseline_7d=0.5,
    baseline_28d=0.25,
    daily_baseline_counts=tuple([0] * 28),
    categories=("lip",),
    finishes=("glossy",),
    benefit_tags=(),
    evidence_ids=("opaque-a",),
  )
  burst = BurstPhraseCandidate(
    keyword=daily.keyword,
    document_count=6,
    source_count=2,
    z_score=3.0,
    momentum=2.0,
    categories=daily.categories,
    finishes=daily.finishes,
    benefit_tags=daily.benefit_tags,
    evidence_ids=daily.evidence_ids,
  )

  class _Provider:
    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
      pass

    async def collect(self, *_args: Any, **_kwargs: Any) -> list[Any]:
      return [object()]

  class _Classifier:
    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
      pass

    async def classify_if_needed(self, *_args: Any, **kwargs: Any) -> Any:
      order.append("classifier")
      assert kwargs["known_vocabulary"] == {"기존 표현"}
      return SimpleNamespace(
        invoked=False,
        input_tokens=0,
        output_tokens=0,
        items=(),
        status="notNeeded",
      )

  async def none_principal(*_args: Any, **_kwargs: Any) -> None:
    return None

  async def create_run(*_args: Any, **_kwargs: Any) -> tuple[dict[str, Any], bool]:
    return {"id": RUN_ID, "status": "running"}, True

  async def due_times(*_args: Any, **_kwargs: Any) -> dict[str, None]:
    return {key: None for key in ("content", "datalab", "weather", "model")}

  async def aggregate(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
    return {"status": "ready", "bucketCount": 3}

  async def seeds(*_args: Any, **_kwargs: Any) -> tuple[str, ...]:
    return ("립 메이크업",)

  async def baseline(*_args: Any, **_kwargs: Any) -> dict[str, list[int]]:
    return {}

  async def vocabulary(*_args: Any, **_kwargs: Any) -> set[str]:
    order.append("vocabulary")
    return {"기존 표현"}

  async def persist_daily(*_args: Any, **_kwargs: Any) -> int:
    order.append("persist_daily")
    return 1

  async def persist_bursts(*_args: Any, **_kwargs: Any) -> int:
    order.append("persist_bursts")
    return 1

  async def no_model(*_args: Any, **_kwargs: Any) -> None:
    return None

  async def no_snapshot(*_args: Any, **_kwargs: Any) -> None:
    return None

  async def usage(*_args: Any, **_kwargs: Any) -> dict[str, int]:
    return {}

  settings = Settings()
  monkeypatch.setattr(orchestrator, "_resolve_service_principal", none_principal)
  monkeypatch.setattr(orchestrator, "_create_pipeline_run", create_run)
  monkeypatch.setattr(orchestrator, "_last_completed_times", due_times)
  monkeypatch.setattr(orchestrator, "aggregate_completed_signal_hours", aggregate)
  monkeypatch.setattr(
    orchestrator,
    "trend_collection_due",
    lambda _last, *, now, interval_hours: interval_hours == settings.naver_trend_content_interval_hours,
  )
  monkeypatch.setattr(orchestrator, "derive_trend_seed_queries", seeds)
  monkeypatch.setattr(orchestrator, "NaverContentTrendProvider", _Provider)
  monkeypatch.setattr(orchestrator, "load_baseline_phrase_counts", baseline)
  monkeypatch.setattr(orchestrator, "_known_vocabulary", vocabulary)
  monkeypatch.setattr(orchestrator, "extract_daily_content_phrase_observations", lambda *_args, **_kwargs: [daily])
  monkeypatch.setattr(orchestrator, "persist_daily_content_observations", persist_daily)
  monkeypatch.setattr(orchestrator, "extract_burst_phrases", lambda *_args, **_kwargs: [burst])
  monkeypatch.setattr(orchestrator, "BedrockTrendClassifier", _Classifier)
  monkeypatch.setattr(orchestrator, "persist_content_candidates", persist_bursts)
  monkeypatch.setattr(orchestrator, "load_active_ranking_model", no_model)
  monkeypatch.setattr(orchestrator, "load_cached_trend_snapshot", no_snapshot)
  monkeypatch.setattr(orchestrator, "_source_usage", usage)

  result = await orchestrator._execute_pipeline(
    _ExecuteDb(),  # type: ignore[arg-type]
    settings,
    trigger_type="scheduled",
    auto_publish=False,
    locale="ko-KR",
    now=now,
  )

  assert result["status"] == "skipped"
  assert order == ["vocabulary", "persist_daily", "classifier", "persist_bursts"]
  assert result["steps"]["content"]["dailyObservationCount"] == 1
  assert result["steps"]["content"]["dailyObservationStored"] == 1
