from __future__ import annotations

import hashlib
import json
import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Mapping, Protocol, Sequence
from uuid import UUID

NATIONAL_REGION_CODE = "KR-00"
PRIVACY_MIN_DISTINCT_USERS = 20
TRAINING_WINDOW_DAYS = 28
MIN_TRAINING_IMPRESSIONS = 2_000
MIN_TRAINING_QUALIFIED_ACTIONS = 100
MIN_VALIDATION_UPLIFT = 0.03
MAX_EXPLORATION_RATE = 0.05
NDCG_CUTOFF = 12

FEATURE_NAMES = (
  "logImpressions",
  "openRate",
  "likeRate",
  "outboundRate",
  "negativeRate",
  "positionAdjustedRate",
)


class TrendLearningDatabase(Protocol):
  async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]: ...

  async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None: ...

  async def run_in_transaction(
    self,
    operation: Callable[[Any], Awaitable[Any]],
  ) -> Any: ...


@dataclass(frozen=True)
class HourlySignalAggregationResult:
  bucket_started_at: datetime
  bucket_ended_at: datetime
  product_count: int
  privacy_eligible_product_count: int


@dataclass(frozen=True)
class HourlySearchIntentAggregationResult:
  bucket_started_at: datetime
  bucket_ended_at: datetime
  intent_count: int
  privacy_eligible_intent_count: int


@dataclass(frozen=True)
class LogisticTrainingResult:
  status: str
  reason: str
  impression_count: int
  qualified_action_count: int
  model_version: str | None = None
  candidate_ndcg_at_12: float | None = None
  baseline_ndcg_at_12: float | None = None
  validation_uplift: float | None = None
  promoted: bool = False


@dataclass(frozen=True)
class ActiveRankingModel:
  id: UUID | None
  model_version: str
  model_type: str
  coefficients: dict[str, Any]


@dataclass(frozen=True)
class _TrainingExample:
  bucket_started_at: datetime
  product_id: str
  features: tuple[float, ...]
  target: float
  relevance: float
  sample_weight: float


def _utc(value: datetime) -> datetime:
  if value.tzinfo is None:
    return value.replace(tzinfo=timezone.utc)
  return value.astimezone(timezone.utc)


def completed_hour_window(now: datetime | None = None) -> tuple[datetime, datetime]:
  """Return the most recent fully completed UTC hour, never the open bucket."""
  bucket_ended_at = _utc(now or datetime.now(timezone.utc)).replace(
    minute=0,
    second=0,
    microsecond=0,
  )
  return bucket_ended_at - timedelta(hours=1), bucket_ended_at


def position_bias_multiplier(position: int | None) -> float:
  """Inverse-rank propensity approximation, capped to avoid tail amplification."""
  normalized_position = max(int(position or 0), 0)
  return min(math.sqrt(normalized_position + 1.0), 4.0)


async def aggregate_completed_product_signal_hour(
  db: TrendLearningDatabase,
  *,
  now: datetime | None = None,
) -> HourlySignalAggregationResult:
  """Aggregate consented product events into a privacy-gated national hour.

  The query intentionally does not read event ``context``. Device coordinates and
  client-authored region values therefore cannot enter the learning table; regional
  recommendation context is handled separately from behavioral learning.
  """
  bucket_started_at, bucket_ended_at = completed_hour_window(now)
  rows = await db.fetch(
    """
    with latest_personalization_consent as (
      select distinct on (user_id)
        user_id,
        accepted,
        revoked_at
      from user_consents
      where consent_type::text = 'engagement_personalization'
      order by user_id, recorded_at desc, id desc
    ), eligible_events as (
      select
        event.user_id,
        event.product_id,
        event.event_type,
        event.position
      from product_engagement_events event
      join latest_personalization_consent consent on consent.user_id = event.user_id
      where consent.accepted = true
        and consent.revoked_at is null
        and event.product_id is not null
        and event.occurred_at >= $1
        and event.occurred_at < $2
    ), hourly as (
      select
        $1::timestamptz as bucket_started_at,
        'KR-00'::text as region_code,
        product_id,
        count(*) filter (where event_type = 'impression')::int as impression_count,
        count(*) filter (where event_type in ('product_open', 'search_result_open'))::int
          as product_open_count,
        count(*) filter (where event_type = 'like')::int as like_count,
        count(*) filter (where event_type = 'unlike')::int as unlike_count,
        count(*) filter (where event_type = 'seller_outbound')::int as seller_outbound_count,
        count(*) filter (where event_type = 'hide')::int as hide_count,
        count(distinct user_id)::int as distinct_user_count,
        coalesce(sum(
          case event_type
            when 'product_open' then 1.0
            when 'search_result_open' then 1.0
            when 'like' then 2.5
            when 'seller_outbound' then 4.0
            when 'unlike' then -2.0
            when 'hide' then -3.0
            else 0.0
          end
          * least(sqrt(greatest(coalesce(position, 0), 0)::double precision + 1.0), 4.0)
        ), 0)::double precision as position_adjusted_score
      from eligible_events
      group by product_id
    )
    insert into product_signal_hourly (
      bucket_started_at,
      region_code,
      product_id,
      impression_count,
      product_open_count,
      like_count,
      unlike_count,
      seller_outbound_count,
      hide_count,
      distinct_user_count,
      position_adjusted_score,
      is_privacy_eligible,
      updated_at
    )
    select
      bucket_started_at,
      region_code,
      product_id,
      impression_count,
      product_open_count,
      like_count,
      unlike_count,
      seller_outbound_count,
      hide_count,
      distinct_user_count,
      position_adjusted_score,
      distinct_user_count >= $3,
      now()
    from hourly
    on conflict (bucket_started_at, region_code, product_id) do update set
      impression_count = excluded.impression_count,
      product_open_count = excluded.product_open_count,
      like_count = excluded.like_count,
      unlike_count = excluded.unlike_count,
      seller_outbound_count = excluded.seller_outbound_count,
      hide_count = excluded.hide_count,
      distinct_user_count = excluded.distinct_user_count,
      position_adjusted_score = excluded.position_adjusted_score,
      is_privacy_eligible = excluded.is_privacy_eligible,
      updated_at = now()
    returning product_id, is_privacy_eligible
    """,
    bucket_started_at,
    bucket_ended_at,
    PRIVACY_MIN_DISTINCT_USERS,
  )
  return HourlySignalAggregationResult(
    bucket_started_at=bucket_started_at,
    bucket_ended_at=bucket_ended_at,
    product_count=len(rows),
    privacy_eligible_product_count=sum(bool(row.get("is_privacy_eligible")) for row in rows),
  )


async def aggregate_completed_search_intent_hour(
  db: TrendLearningDatabase,
  *,
  now: datetime | None = None,
) -> HourlySearchIntentAggregationResult:
  """Aggregate opaque, server-authored search intent IDs without raw queries."""

  bucket_started_at, bucket_ended_at = completed_hour_window(now)
  rows = await db.fetch(
    """
    with latest_personalization_consent as (
      select distinct on (user_id) user_id,accepted,revoked_at
      from user_consents
      where consent_type::text='engagement_personalization'
      order by user_id,recorded_at desc,id desc
    ), submissions as (
      select e.user_id,e.search_request_id,
        e.context->>'trendIntentHash' as intent_hash,
        nullif(e.context->>'trendCandidateId','')::uuid as candidate_id,
        1::int as search_count,0::int as result_open_count
      from product_engagement_events e
      join latest_personalization_consent consent on consent.user_id=e.user_id
      where consent.accepted=true and consent.revoked_at is null
        and e.event_type='search_submit'
        and e.occurred_at>=$1 and e.occurred_at<$2
        and e.context->>'trendIntentHash' ~ '^[0-9a-f]{64}$'
    ), opens as (
      select e.user_id,e.search_request_id,
        submit.context->>'trendIntentHash' as intent_hash,
        nullif(submit.context->>'trendCandidateId','')::uuid as candidate_id,
        0::int as search_count,1::int as result_open_count
      from product_engagement_events e
      join latest_personalization_consent consent on consent.user_id=e.user_id
      join lateral (
        select source.context from product_engagement_events source
        where source.user_id=e.user_id and source.search_request_id=e.search_request_id
          and source.event_type='search_submit'
        order by source.occurred_at desc limit 1
      ) submit on true
      where consent.accepted=true and consent.revoked_at is null
        and e.event_type='search_result_open'
        and e.occurred_at>=$1 and e.occurred_at<$2
        and submit.context->>'trendIntentHash' ~ '^[0-9a-f]{64}$'
    ), combined as (
      select * from submissions union all select * from opens
    ), hourly as (
      select $1::timestamptz as bucket_started_at,'ko-KR'::text as locale,
        'KR-00'::text as region_code,intent_hash,
        (array_agg(candidate_id) filter (where candidate_id is not null))[1] as candidate_id,
        sum(search_count)::int as search_count,
        sum(result_open_count)::int as result_open_count,
        count(distinct user_id)::int as distinct_user_count
      from combined group by intent_hash
    )
    insert into search_intent_hourly (
      bucket_started_at,locale,region_code,intent_hash,candidate_id,
      search_count,result_open_count,distinct_user_count,is_privacy_eligible,updated_at
    )
    select bucket_started_at,locale,region_code,intent_hash,candidate_id,
      search_count,result_open_count,distinct_user_count,
      distinct_user_count >= $3,now()
    from hourly
    on conflict (bucket_started_at,locale,region_code,intent_hash) do update set
      candidate_id=excluded.candidate_id,
      search_count=excluded.search_count,
      result_open_count=excluded.result_open_count,
      distinct_user_count=excluded.distinct_user_count,
      is_privacy_eligible=excluded.is_privacy_eligible,
      updated_at=now()
    returning intent_hash,is_privacy_eligible
    """,
    bucket_started_at,
    bucket_ended_at,
    PRIVACY_MIN_DISTINCT_USERS,
  )
  return HourlySearchIntentAggregationResult(
    bucket_started_at=bucket_started_at,
    bucket_ended_at=bucket_ended_at,
    intent_count=len(rows),
    privacy_eligible_intent_count=sum(bool(row.get("is_privacy_eligible")) for row in rows),
  )


async def aggregate_completed_signal_hours(
  db: TrendLearningDatabase,
  *,
  now: datetime,
  hours: int = 3,
) -> dict[str, Any]:
  """Catch up every completed hourly bucket covered by the three-hour scheduler."""

  references = [now - timedelta(hours=offset) for offset in reversed(range(max(1, hours)))]
  products: list[HourlySignalAggregationResult] = []
  searches: list[HourlySearchIntentAggregationResult] = []
  for reference in references:
    products.append(await aggregate_completed_product_signal_hour(db, now=reference))
    searches.append(await aggregate_completed_search_intent_hour(db, now=reference))
  return {
    "status": "ready",
    "bucketCount": len(references),
    "productCount": sum(value.product_count for value in products),
    "privacyEligibleProductCount": sum(value.privacy_eligible_product_count for value in products),
    "intentCount": sum(value.intent_count for value in searches),
    "privacyEligibleIntentCount": sum(value.privacy_eligible_intent_count for value in searches),
    "firstBucketStartedAt": products[0].bucket_started_at if products else None,
    "lastBucketEndedAt": products[-1].bucket_ended_at if products else None,
  }


def ndcg_at_k(scored_relevances: Sequence[tuple[float, float]], *, k: int = NDCG_CUTOFF) -> float:
  if k <= 0 or not scored_relevances:
    return 0.0

  def dcg(relevances: Sequence[float]) -> float:
    return sum(
      (math.pow(2.0, max(relevance, 0.0)) - 1.0) / math.log2(rank + 2.0)
      for rank, relevance in enumerate(relevances[:k])
    )

  ranked = sorted(scored_relevances, key=lambda pair: pair[0], reverse=True)
  ideal = sorted((max(pair[1], 0.0) for pair in scored_relevances), reverse=True)
  ideal_dcg = dcg(ideal)
  if ideal_dcg <= 0:
    return 0.0
  return dcg([pair[1] for pair in ranked]) / ideal_dcg


def select_deterministic_exploration(
  allocation_key: str,
  *,
  model_version: str,
  exploration_rate: float = MAX_EXPLORATION_RATE,
) -> bool:
  """Deterministically allocate at most five percent of traffic to exploration."""
  if not 0.0 <= exploration_rate <= MAX_EXPLORATION_RATE:
    raise ValueError(f"exploration_rate must be between 0 and {MAX_EXPLORATION_RATE}")
  if exploration_rate == 0.0:
    return False
  digest = hashlib.sha256(
    f"trend-exploration-v1:{model_version}:{allocation_key}".encode("utf-8")
  ).digest()
  bucket = int.from_bytes(digest[:8], "big") / float(1 << 64)
  return bucket < exploration_rate


def _json_object(value: Any) -> dict[str, Any]:
  if isinstance(value, Mapping):
    return dict(value)
  if isinstance(value, str):
    try:
      parsed = json.loads(value)
    except (TypeError, ValueError):
      return {}
    return dict(parsed) if isinstance(parsed, Mapping) else {}
  return {}


def _number(row: Mapping[str, Any], key: str) -> float:
  value = row.get(key, 0)
  try:
    return float(value or 0)
  except (TypeError, ValueError):
    return 0.0


def _features_from_row(row: Mapping[str, Any]) -> tuple[float, ...]:
  impressions = max(_number(row, "history_impression_count"), 1.0)
  return (
    math.log1p(impressions),
    _number(row, "history_product_open_count") / impressions,
    _number(row, "history_like_count") / impressions,
    _number(row, "history_seller_outbound_count") / impressions,
    (
      _number(row, "history_unlike_count")
      + _number(row, "history_hide_count")
    ) / impressions,
    max(min(_number(row, "history_position_adjusted_score") / impressions, 5.0), -5.0),
  )


def _example_from_row(row: Mapping[str, Any]) -> _TrainingExample | None:
  current_impressions = int(_number(row, "impression_count"))
  history_impressions = int(_number(row, "history_impression_count"))
  bucket = row.get("bucket_started_at")
  if current_impressions <= 0 or history_impressions <= 0 or not isinstance(bucket, datetime):
    return None
  open_count = _number(row, "product_open_count")
  like_count = _number(row, "like_count")
  outbound_count = _number(row, "seller_outbound_count")
  negative_count = _number(row, "unlike_count") + _number(row, "hide_count")
  qualified_count = open_count + like_count + outbound_count
  target = min(max(qualified_count / current_impressions, 0.0), 1.0)
  relevance = max(
    (open_count + 2.0 * like_count + 3.0 * outbound_count - negative_count)
    / current_impressions,
    0.0,
  )
  return _TrainingExample(
    bucket_started_at=_utc(bucket),
    product_id=str(row.get("product_id") or ""),
    features=_features_from_row(row),
    target=target,
    relevance=min(relevance, 3.0),
    sample_weight=float(min(current_impressions, 100)),
  )


def _weighted_feature_stats(
  examples: Sequence[_TrainingExample],
) -> tuple[tuple[float, ...], tuple[float, ...]]:
  total_weight = sum(example.sample_weight for example in examples) or 1.0
  means = tuple(
    sum(example.features[index] * example.sample_weight for example in examples) / total_weight
    for index in range(len(FEATURE_NAMES))
  )
  variances = tuple(
    sum(
      math.pow(example.features[index] - means[index], 2.0) * example.sample_weight
      for example in examples
    ) / total_weight
    for index in range(len(FEATURE_NAMES))
  )
  scales = tuple(max(math.sqrt(variance), 1e-6) for variance in variances)
  return means, scales


def _sigmoid(value: float) -> float:
  if value >= 0:
    inverse = math.exp(-min(value, 35.0))
    return 1.0 / (1.0 + inverse)
  exponent = math.exp(max(value, -35.0))
  return exponent / (1.0 + exponent)


def _fit_logistic(
  examples: Sequence[_TrainingExample],
) -> dict[str, Any]:
  means, scales = _weighted_feature_stats(examples)
  total_weight = sum(example.sample_weight for example in examples) or 1.0
  positive_rate = sum(
    example.target * example.sample_weight for example in examples
  ) / total_weight
  positive_rate = min(max(positive_rate, 1e-4), 1.0 - 1e-4)
  intercept = math.log(positive_rate / (1.0 - positive_rate))
  weights = [0.0] * len(FEATURE_NAMES)

  for iteration in range(350):
    intercept_gradient = 0.0
    gradients = [0.0] * len(FEATURE_NAMES)
    for example in examples:
      standardized = tuple(
        (example.features[index] - means[index]) / scales[index]
        for index in range(len(FEATURE_NAMES))
      )
      prediction = _sigmoid(
        intercept + sum(weight * value for weight, value in zip(weights, standardized))
      )
      error = (prediction - example.target) * example.sample_weight
      intercept_gradient += error
      for index, value in enumerate(standardized):
        gradients[index] += error * value
    learning_rate = 0.15 / (1.0 + iteration * 0.01)
    intercept -= learning_rate * intercept_gradient / total_weight
    for index in range(len(weights)):
      regularized = gradients[index] / total_weight + 0.01 * weights[index]
      weights[index] -= learning_rate * regularized

  return {
    "intercept": intercept,
    "weights": dict(zip(FEATURE_NAMES, weights)),
    "means": dict(zip(FEATURE_NAMES, means)),
    "scales": dict(zip(FEATURE_NAMES, scales)),
  }


def _coefficient_scorer(coefficients: Mapping[str, Any]) -> Callable[[_TrainingExample], float] | None:
  weights = _json_object(coefficients.get("weights"))
  means = _json_object(coefficients.get("means"))
  scales = _json_object(coefficients.get("scales"))
  if not weights or any(name not in weights for name in FEATURE_NAMES):
    return None
  try:
    intercept = float(coefficients.get("intercept", 0.0))
    resolved_weights = tuple(float(weights[name]) for name in FEATURE_NAMES)
    resolved_means = tuple(float(means.get(name, 0.0)) for name in FEATURE_NAMES)
    resolved_scales = tuple(max(float(scales.get(name, 1.0)), 1e-6) for name in FEATURE_NAMES)
  except (TypeError, ValueError):
    return None

  def score(example: _TrainingExample) -> float:
    logit = intercept + sum(
      resolved_weights[index]
      * ((example.features[index] - resolved_means[index]) / resolved_scales[index])
      for index in range(len(FEATURE_NAMES))
    )
    return _sigmoid(logit)

  return score


def score_ranking_candidate(
  candidate: Mapping[str, Any],
  model: ActiveRankingModel | None,
) -> float | None:
  """Apply the active behavioral model to privacy-thresholded aggregate fields."""

  if model is None or model.model_type != "logistic":
    return None
  impressions = _number(candidate, "history_impression_count")
  if impressions <= 0:
    return None
  coefficients = model.coefficients
  weights = _json_object(coefficients.get("weights"))
  means = _json_object(coefficients.get("means"))
  scales = _json_object(coefficients.get("scales"))
  if any(name not in weights for name in FEATURE_NAMES):
    return None
  features = (
    math.log1p(impressions),
    _number(candidate, "history_product_open_count") / impressions,
    _number(candidate, "history_like_count") / impressions,
    _number(candidate, "history_seller_outbound_count") / impressions,
    (
      _number(candidate, "history_unlike_count")
      + _number(candidate, "history_hide_count")
    ) / impressions,
    max(min(_number(candidate, "history_position_adjusted_score") / impressions, 5.0), -5.0),
  )
  try:
    logit = float(coefficients.get("intercept", 0.0)) + sum(
      float(weights[name])
      * ((features[index] - float(means.get(name, 0.0))) / max(float(scales.get(name, 1.0)), 1e-6))
      for index, name in enumerate(FEATURE_NAMES)
    )
  except (TypeError, ValueError, ZeroDivisionError):
    return None
  return _sigmoid(logit)


async def load_active_ranking_model(db: TrendLearningDatabase) -> ActiveRankingModel | None:
  row = await db.fetchrow(
    """select id,model_version,model_type,coefficients from seasonal_ranking_models
    where status='active' order by activated_at desc nulls last,created_at desc limit 1"""
  )
  if not row:
    return None
  return ActiveRankingModel(
    id=row.get("id"),
    model_version=str(row.get("model_version") or ""),
    model_type=str(row.get("model_type") or ""),
    coefficients=_json_object(row.get("coefficients")),
  )


def _mean_grouped_ndcg(
  examples: Sequence[_TrainingExample],
  scorer: Callable[[_TrainingExample], float],
) -> float:
  grouped: dict[datetime, list[_TrainingExample]] = defaultdict(list)
  for example in examples:
    grouped[example.bucket_started_at].append(example)
  if not grouped:
    return 0.0
  return sum(
    ndcg_at_k([(scorer(example), example.relevance) for example in group])
    for group in grouped.values()
  ) / len(grouped)


async def _load_training_rows(
  db: TrendLearningDatabase,
  *,
  window_started_at: datetime,
  window_ended_at: datetime,
) -> list[dict[str, Any]]:
  return await db.fetch(
    """
    with signal_window as (
      select
        bucket_started_at,
        product_id,
        impression_count,
        product_open_count,
        like_count,
        unlike_count,
        seller_outbound_count,
        hide_count,
        position_adjusted_score
      from product_signal_hourly
      where region_code = 'KR-00'
        and is_privacy_eligible = true
        and bucket_started_at >= $1
        and bucket_started_at < $2
    )
    select
      *,
      coalesce(sum(impression_count) over history, 0)::bigint as history_impression_count,
      coalesce(sum(product_open_count) over history, 0)::bigint as history_product_open_count,
      coalesce(sum(like_count) over history, 0)::bigint as history_like_count,
      coalesce(sum(unlike_count) over history, 0)::bigint as history_unlike_count,
      coalesce(sum(seller_outbound_count) over history, 0)::bigint
        as history_seller_outbound_count,
      coalesce(sum(hide_count) over history, 0)::bigint as history_hide_count,
      coalesce(sum(position_adjusted_score) over history, 0)::double precision
        as history_position_adjusted_score
    from signal_window
    window history as (
      partition by product_id
      order by bucket_started_at
      rows between 24 preceding and 1 preceding
    )
    order by bucket_started_at, product_id
    """,
    window_started_at,
    window_ended_at,
  )


async def _persist_model_candidate(
  db: TrendLearningDatabase,
  *,
  model_version: str,
  status: str,
  feature_schema: Mapping[str, Any],
  coefficients: Mapping[str, Any],
  window_started_at: datetime,
  window_ended_at: datetime,
  impression_count: int,
  qualified_action_count: int,
  validation_metrics: Mapping[str, Any],
  candidate_ndcg: float,
  baseline_ndcg: float,
  uplift: float,
  service_principal_id: UUID,
) -> None:
  async def operation(connection: Any) -> None:
    if status == "active":
      await connection.execute(
        """
        update seasonal_ranking_models
        set status = 'retired', updated_at = now()
        where status = 'active' and model_version <> $1
        """,
        model_version,
      )
    await connection.execute(
      """
      insert into seasonal_ranking_models (
        model_version,
        model_type,
        status,
        feature_schema,
        coefficients,
        training_window_started_at,
        training_window_ended_at,
        training_impression_count,
        training_action_count,
        validation_metrics,
        ndcg_at_12,
        baseline_ndcg_at_12,
        validation_uplift,
        activated_by_service_principal_id,
        activated_at
      ) values (
        $1, 'logistic', $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8,
        $9::jsonb, $10, $11, $12,
        case when $2 = 'active' then $13::uuid else null end,
        case when $2 = 'active' then now() else null end
      )
      on conflict (model_version) do update set
        status = excluded.status,
        feature_schema = excluded.feature_schema,
        coefficients = excluded.coefficients,
        training_impression_count = excluded.training_impression_count,
        training_action_count = excluded.training_action_count,
        validation_metrics = excluded.validation_metrics,
        ndcg_at_12 = excluded.ndcg_at_12,
        baseline_ndcg_at_12 = excluded.baseline_ndcg_at_12,
        validation_uplift = excluded.validation_uplift,
        activated_by_service_principal_id = excluded.activated_by_service_principal_id,
        activated_at = excluded.activated_at,
        updated_at = now()
      """,
      model_version,
      status,
      json.dumps(dict(feature_schema), ensure_ascii=False),
      json.dumps(dict(coefficients), ensure_ascii=False),
      window_started_at,
      window_ended_at,
      impression_count,
      qualified_action_count,
      json.dumps(dict(validation_metrics), ensure_ascii=False),
      candidate_ndcg,
      baseline_ndcg,
      uplift,
      service_principal_id,
    )

  await db.run_in_transaction(operation)


async def train_and_maybe_activate_logistic_ranker(
  db: TrendLearningDatabase,
  *,
  service_principal_id: UUID,
  now: datetime | None = None,
) -> LogisticTrainingResult:
  """Train a daily lightweight ranker and activate only after an offline +3% gate."""
  window_ended_at = _utc(now or datetime.now(timezone.utc)).replace(
    minute=0,
    second=0,
    microsecond=0,
  )
  window_started_at = window_ended_at - timedelta(days=TRAINING_WINDOW_DAYS)
  rows = await _load_training_rows(
    db,
    window_started_at=window_started_at,
    window_ended_at=window_ended_at,
  )
  impression_count = sum(int(_number(row, "impression_count")) for row in rows)
  qualified_action_count = sum(
    int(
      _number(row, "product_open_count")
      + _number(row, "like_count")
      + _number(row, "seller_outbound_count")
    )
    for row in rows
  )
  if impression_count < MIN_TRAINING_IMPRESSIONS:
    return LogisticTrainingResult(
      status="skipped",
      reason="INSUFFICIENT_IMPRESSIONS",
      impression_count=impression_count,
      qualified_action_count=qualified_action_count,
    )
  if qualified_action_count < MIN_TRAINING_QUALIFIED_ACTIONS:
    return LogisticTrainingResult(
      status="skipped",
      reason="INSUFFICIENT_QUALIFIED_ACTIONS",
      impression_count=impression_count,
      qualified_action_count=qualified_action_count,
    )

  active_baseline = await db.fetchrow(
    """
    select model_version, model_type, coefficients, ndcg_at_12
    from seasonal_ranking_models
    where status = 'active'
    order by activated_at desc nulls last, created_at desc
    limit 1
    """
  )
  # A fresh database starts with the deterministic RRF policy as its implicit
  # baseline. It does not need a fabricated model row before the first learned
  # candidate can be evaluated.
  active_baseline = active_baseline or {
    "model_version": "rrf_v1",
    "model_type": "rrf",
    "coefficients": {},
    "ndcg_at_12": None,
  }

  examples = [example for row in rows if (example := _example_from_row(row)) is not None]
  time_buckets = sorted({example.bucket_started_at for example in examples})
  if len(time_buckets) < 2:
    return LogisticTrainingResult(
      status="skipped",
      reason="INSUFFICIENT_TIME_BUCKETS",
      impression_count=impression_count,
      qualified_action_count=qualified_action_count,
    )
  split_index = max(1, min(len(time_buckets) - 1, int(len(time_buckets) * 0.8)))
  split_at = time_buckets[split_index]
  training_examples = [example for example in examples if example.bucket_started_at < split_at]
  validation_examples = [example for example in examples if example.bucket_started_at >= split_at]
  if not training_examples or not validation_examples:
    return LogisticTrainingResult(
      status="skipped",
      reason="EMPTY_TIME_SPLIT",
      impression_count=impression_count,
      qualified_action_count=qualified_action_count,
    )

  coefficients = _fit_logistic(training_examples)
  candidate_scorer = _coefficient_scorer(coefficients)
  if candidate_scorer is None:
    return LogisticTrainingResult(
      status="skipped",
      reason="INVALID_CANDIDATE_MODEL",
      impression_count=impression_count,
      qualified_action_count=qualified_action_count,
    )

  baseline_coefficients = _json_object(active_baseline.get("coefficients"))
  baseline_scorer = _coefficient_scorer(baseline_coefficients)
  if baseline_scorer is None:
    position_feature_index = FEATURE_NAMES.index("positionAdjustedRate")
    baseline_scorer = lambda example: example.features[position_feature_index]

  candidate_ndcg = _mean_grouped_ndcg(validation_examples, candidate_scorer)
  baseline_ndcg = _mean_grouped_ndcg(validation_examples, baseline_scorer)
  if baseline_ndcg > 1e-12:
    uplift = (candidate_ndcg - baseline_ndcg) / baseline_ndcg
  else:
    uplift = 1.0 if candidate_ndcg > 0 else 0.0
  promoted = uplift >= MIN_VALIDATION_UPLIFT and candidate_ndcg > baseline_ndcg
  status = "active" if promoted else "shadow"

  coefficient_hash = hashlib.sha256(
    json.dumps(coefficients, sort_keys=True, separators=(",", ":")).encode("utf-8")
  ).hexdigest()[:10]
  model_version = f"logistic-{window_ended_at:%Y%m%d%H}-{coefficient_hash}"
  if str(active_baseline.get("model_version") or "") == model_version:
    return LogisticTrainingResult(
      status="active",
      reason="MODEL_ALREADY_ACTIVE",
      impression_count=impression_count,
      qualified_action_count=qualified_action_count,
      model_version=model_version,
      candidate_ndcg_at_12=candidate_ndcg,
      baseline_ndcg_at_12=baseline_ndcg,
      validation_uplift=0.0,
      promoted=False,
    )
  validation_metrics = {
    "metric": "ndcg@12",
    "timeSplitAt": split_at.isoformat(),
    "trainingExampleCount": len(training_examples),
    "validationExampleCount": len(validation_examples),
    "candidateNdcgAt12": candidate_ndcg,
    "baselineNdcgAt12": baseline_ndcg,
    "uplift": uplift,
    "requiredUplift": MIN_VALIDATION_UPLIFT,
    "baselineModelVersion": str(active_baseline.get("model_version") or ""),
  }
  await _persist_model_candidate(
    db,
    model_version=model_version,
    status=status,
    feature_schema={
      "version": "trend-logistic-features-v1",
      "features": list(FEATURE_NAMES),
      "historyWindowHours": 24,
      "target": "qualified_action_rate",
      "validation": "chronological_80_20",
    },
    coefficients=coefficients,
    window_started_at=window_started_at,
    window_ended_at=window_ended_at,
    impression_count=impression_count,
    qualified_action_count=qualified_action_count,
    validation_metrics=validation_metrics,
    candidate_ndcg=candidate_ndcg,
    baseline_ndcg=baseline_ndcg,
    uplift=uplift,
    service_principal_id=service_principal_id,
  )
  return LogisticTrainingResult(
    status=status,
    reason="VALIDATION_GATE_PASSED" if promoted else "VALIDATION_UPLIFT_BELOW_THRESHOLD",
    impression_count=impression_count,
    qualified_action_count=qualified_action_count,
    model_version=model_version,
    candidate_ndcg_at_12=candidate_ndcg,
    baseline_ndcg_at_12=baseline_ndcg,
    validation_uplift=uplift,
    promoted=promoted,
  )
