"""Three-hour scheduler orchestration for automated "trend now" products.

All external calls terminate here. Consumer API handlers read only published DB
collections and never import this module.
"""

from __future__ import annotations

import asyncio
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import logging
from math import sqrt
from typing import Any
from uuid import UUID

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.services.product_seasonal_pipeline import (
  fetch_region_weather,
  fetch_seasonal_product_candidates,
  match_trends_to_products,
  persist_trend_collection,
)
from app.services.product_trend_bedrock import BedrockTrendClassifier
from app.services.product_trend_discovery import (
  BurstPhraseCandidate,
  DailyContentPhraseObservation,
  NaverContentTrendProvider,
  extract_burst_phrases,
  extract_daily_content_phrase_observations,
  trend_collection_due,
)
from app.services.product_trend_learning import (
  aggregate_completed_signal_hours,
  load_active_ranking_model,
  train_and_maybe_activate_logistic_ranker,
)
from app.services.product_trend_quality import (
  collection_input_fingerprint,
  evaluate_auto_publish_quality,
  weather_changed_meaningfully,
)
from app.services.product_trend_quota import PostgresTrendCallQuotaLedger
from app.services.product_trend_regions import TREND_REGION_CODES
from app.services.product_trend_sources import TrendSignal, TrendSnapshot
from app.services.product_trends import NaverTrendMomentumService, TrendMomentum
from app.services.product_weather import KmaWeatherProvider, WeatherRegionSnapshot


logger = logging.getLogger(__name__)
PIPELINE_ALGORITHM_VERSION = "trend_now_rrf_v1"
DATALAB_MEANINGFUL_RISE = 0.10
_LOCK_KEY = "product-trend-now-orchestrator-v1"


def _aware(value: datetime | None) -> datetime | None:
  if value is None:
    return None
  return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _json(value: Any) -> dict[str, Any]:
  if isinstance(value, dict):
    return value
  if isinstance(value, str):
    try:
      decoded = json.loads(value)
      return decoded if isinstance(decoded, dict) else {}
    except json.JSONDecodeError:
      return {}
  return {}


def scheduled_slot(now: datetime, *, hours: int = 3) -> datetime:
  current = _aware(now) or datetime.now(timezone.utc)
  return current.replace(hour=current.hour - current.hour % hours, minute=0, second=0, microsecond=0)


def pipeline_idempotency_key(trigger_type: str, now: datetime) -> str:
  return f"trend-now:{trigger_type}:{scheduled_slot(now).isoformat()}"


def ranking_aware_fingerprint(base_fingerprint: str, *, model_version: str) -> str:
  """Bind a collection revision to the exact ranking policy that produced it."""

  return hashlib.sha256(
    f"{base_fingerprint}\0{model_version}".encode("utf-8")
  ).hexdigest()


def relevant_consensus_signal_groups(
  source_signal_groups: list[str] | tuple[str, ...] | set[str],
  items: list[dict[str, Any]],
) -> set[str]:
  """Return only independent trend-consensus sources relevant to selected items.

  Weather and catalog evidence are ranking/eligibility inputs, not independent
  evidence that a trend exists. Candidate intent and selected-product app rise
  share one privacy-safe app group so they can never be double-counted.
  """

  source_groups = set(source_signal_groups)

  def has_component(name: str) -> bool:
    return any(
      float((item.get("scoreComponents") or {}).get(name) or 0) > 0
      for item in items
    )

  groups: set[str] = set()
  if "naver_content" in source_groups and has_component("content"):
    groups.add("naver_content")
  if "datalab" in source_groups and has_component("datalab"):
    groups.add("datalab")
  has_matched_trend = has_component("content") or has_component("datalab")
  if has_component("app") or ("app_intent" in source_groups and has_matched_trend):
    groups.add("app_privacy_safe")
  return groups


async def derive_trend_seed_queries(db: Database, *, limit: int = 5) -> tuple[str, ...]:
  """Use catalog, prior candidates and opaque intent links; never a trend fixture."""

  if not db.is_connected or limit <= 0:
    return ()
  rows = await db.fetch(
    """
    with seed_candidates as (
      select c.normalized_keyword as seed,
        100.0+coalesce(sum(i.search_count+i.result_open_count),0) as score
      from trend_keyword_candidates c
      left join search_intent_hourly i on i.candidate_id=c.id
        and i.is_privacy_eligible=true and i.bucket_started_at>=now()-interval '28 days'
      where c.status='qualified' and (c.expires_at is null or c.expires_at>now())
      group by c.id,c.normalized_keyword
      union all
      select case p.category::text
        when 'base' then '베이스 메이크업'
        when 'shadow' then '아이섀도우 메이크업'
        when 'brow' then '아이브로우 메이크업'
        when 'cheek' then '블러셔 메이크업'
        when 'lip' then '립 메이크업'
        when 'liner' then '아이라이너 메이크업'
      end || case when tag.value is null then '' else ' '||tag.value end as seed,
        10.0+count(*)::double precision as score
      from products p
      left join lateral unnest(coalesce(p.tags,'{}'::text[])) tag(value) on true
      where p.is_active=true and p.catalog_status='published' and p.license_status='valid'
      group by p.category,tag.value
    )
    select seed,max(score) as score from seed_candidates
    where seed is not null and char_length(seed) between 2 and 48
    group by seed order by max(score) desc,seed limit $1
    """,
    limit,
  )
  return tuple(dict.fromkeys(str(row.get("seed") or "").strip() for row in rows if str(row.get("seed") or "").strip()))


async def load_baseline_phrase_counts(
  db: Database,
  *,
  now: datetime,
  baseline_days: int = 28,
) -> dict[str, list[int]]:
  if not db.is_connected:
    return {}
  baseline_end = now - timedelta(hours=24)
  baseline_start = baseline_end - timedelta(days=baseline_days)
  rows = await db.fetch(
    """
    select c.normalized_keyword,date_trunc('day',o.observed_at) as observed_day,
      max(o.document_count)::int as document_count
    from trend_source_observations o
    join trend_keyword_candidates c on c.id=o.candidate_id
    where o.source_kind='content' and o.observed_at>=$1 and o.observed_at<$2
    group by c.normalized_keyword,date_trunc('day',o.observed_at)
    """,
    baseline_start,
    baseline_end,
  )
  counts: dict[str, list[int]] = {}
  start_day = baseline_start.date()
  for row in rows:
    keyword = str(row.get("normalized_keyword") or "").strip().casefold()
    observed = row.get("observed_day")
    observed_day = observed.date() if isinstance(observed, datetime) else observed if isinstance(observed, date) else None
    if not keyword or observed_day is None:
      continue
    index = (observed_day - start_day).days
    if 0 <= index < baseline_days:
      counts.setdefault(keyword, [0] * baseline_days)[index] = max(0, int(row.get("document_count") or 0))
  return counts


async def persist_daily_content_observations(
  db: Database,
  observations: list[DailyContentPhraseObservation],
  *,
  locale: str,
  now: datetime,
) -> int:
  """Persist aggregate-only baseline phrases without downgrading qualified rows."""

  if db.pool is None or not observations:
    return 0

  async def operation(connection: Any) -> int:
    stored = 0
    for observation in observations:
      confidence = min(
        0.6,
        0.15 + min(observation.document_count, 12) / 30 + min(observation.source_count, 3) / 20,
      )
      candidate = await connection.fetchrow(
        """
        insert into trend_keyword_candidates (
          normalized_keyword,locale,status,category_codes,benefit_tags,finish_tags,
          confidence_score,first_observed_at,last_observed_at,expires_at,
          normalization_metadata
        ) values ($1,$2,'observed',$3,$4,$5,$6,$7,$7,$8,$9::jsonb)
        on conflict (locale,normalized_keyword) do update set
          status=case when trend_keyword_candidates.status='qualified'
            then 'qualified' else 'observed' end,
          category_codes=case when trend_keyword_candidates.status='qualified'
            then trend_keyword_candidates.category_codes else excluded.category_codes end,
          benefit_tags=case when trend_keyword_candidates.status='qualified'
            then trend_keyword_candidates.benefit_tags else excluded.benefit_tags end,
          finish_tags=case when trend_keyword_candidates.status='qualified'
            then trend_keyword_candidates.finish_tags else excluded.finish_tags end,
          confidence_score=case when trend_keyword_candidates.status='qualified'
            then trend_keyword_candidates.confidence_score
            else greatest(trend_keyword_candidates.confidence_score,excluded.confidence_score) end,
          last_observed_at=case when trend_keyword_candidates.status='qualified'
            then trend_keyword_candidates.last_observed_at else excluded.last_observed_at end,
          expires_at=case when trend_keyword_candidates.status='qualified'
            then trend_keyword_candidates.expires_at else excluded.expires_at end,
          normalization_metadata=trend_keyword_candidates.normalization_metadata||excluded.normalization_metadata,
          updated_at=now()
        returning id,status
        """,
        observation.keyword,
        locale,
        list(observation.categories),
        list(observation.benefit_tags),
        list(observation.finishes),
        confidence,
        now,
        now + timedelta(days=28),
        json.dumps({
          "normalizer": "local-daily-baseline-v1",
          "aggregateOnly": True,
        }, ensure_ascii=False),
      )
      counts = observation.daily_baseline_counts
      mean = observation.baseline_28d
      variance = sum((count - mean) ** 2 for count in counts) / max(1, len(counts))
      z_score = (observation.document_count - mean) / max(
        1.0,
        sqrt(variance),
        sqrt(mean + 1.0),
      )
      change_ratio = (
        observation.document_count - observation.baseline_7d
      ) / max(1.0, observation.baseline_7d)
      evidence_hash = hashlib.sha256(
        json.dumps({
          "kind": "daily_content_baseline",
          "candidate": observation.keyword.casefold(),
          "evidenceIds": sorted(observation.evidence_ids),
          "windowEnd": now.replace(minute=0, second=0, microsecond=0).isoformat(),
        }, sort_keys=True, separators=(",", ":")).encode("utf-8")
      ).hexdigest()
      await connection.execute(
        """
        insert into trend_source_observations (
          candidate_id,source_name,source_kind,observed_at,window_started_at,window_ended_at,
          document_count,distinct_content_type_count,baseline_7d,baseline_28d,current_value,
          change_ratio,z_score,evidence_hash,source_metadata
        ) values ($1,'naver_content','content',$2,$3,$2,$4,$5,$6,$7,$4,$8,$9,$10,$11::jsonb)
        on conflict (candidate_id,source_name,evidence_hash) do nothing
        """,
        candidate["id"],
        now,
        now - timedelta(hours=24),
        observation.document_count,
        observation.source_count,
        observation.baseline_7d,
        observation.baseline_28d,
        change_ratio,
        z_score,
        evidence_hash,
        json.dumps({
          "aggregateOnly": True,
          "evidenceIds": list(observation.evidence_ids),
        }, ensure_ascii=False),
      )
      stored += 1
    return stored

  return await db.run_in_transaction(operation)


async def _known_vocabulary(db: Database) -> set[str]:
  rows = await db.fetch(
    """select normalized_keyword from trend_keyword_candidates
    where status in ('observed','qualified') and (expires_at is null or expires_at>now())"""
  ) if db.is_connected else []
  return {str(row.get("normalized_keyword") or "").strip().casefold() for row in rows if row.get("normalized_keyword")}


async def persist_content_candidates(
  db: Database,
  candidates: list[BurstPhraseCandidate],
  *,
  locale: str,
  now: datetime,
  semantic_items: dict[str, Any] | None = None,
) -> int:
  if db.pool is None or not candidates:
    return 0
  semantic_items = semantic_items or {}

  async def operation(connection: Any) -> int:
    stored = 0
    for candidate in candidates:
      semantic = semantic_items.get(candidate.keyword.casefold())
      categories = list(semantic.categories if semantic is not None else candidate.categories)
      finishes = list(semantic.finishes if semantic is not None else candidate.finishes)
      benefits = list(semantic.benefit_tags if semantic is not None else candidate.benefit_tags)
      confidence = max(candidate.confidence_score, float(semantic.confidence if semantic is not None else 0))
      metadata = {
        "normalizer": "local-burst-v1",
        "bedrockUsed": semantic is not None,
        "evidenceIds": list(candidate.evidence_ids),
      }
      row = await connection.fetchrow(
        """
        insert into trend_keyword_candidates (
          normalized_keyword,locale,status,category_codes,benefit_tags,finish_tags,
          confidence_score,first_observed_at,last_observed_at,qualified_at,expires_at,
          normalization_metadata
        ) values ($1,$2,'qualified',$3,$4,$5,$6,$7,$7,$7,$8,$9::jsonb)
        on conflict (locale,normalized_keyword) do update set
          status='qualified',category_codes=excluded.category_codes,
          benefit_tags=excluded.benefit_tags,finish_tags=excluded.finish_tags,
          confidence_score=greatest(trend_keyword_candidates.confidence_score,excluded.confidence_score),
          last_observed_at=excluded.last_observed_at,
          qualified_at=coalesce(trend_keyword_candidates.qualified_at,excluded.qualified_at),
          expires_at=excluded.expires_at,
          normalization_metadata=trend_keyword_candidates.normalization_metadata||excluded.normalization_metadata,
          updated_at=now()
        returning id
        """,
        candidate.keyword,
        locale,
        categories,
        benefits,
        finishes,
        min(1.0, confidence),
        now,
        now + timedelta(days=28),
        json.dumps(metadata, ensure_ascii=False),
      )
      baseline = candidate.document_count / max(1.0, 1.0 + candidate.momentum)
      evidence_hash = hashlib.sha256(
        json.dumps(
          {
            "candidate": candidate.keyword.casefold(),
            "evidenceIds": sorted(candidate.evidence_ids),
            "windowEnd": now.replace(minute=0, second=0, microsecond=0).isoformat(),
          },
          sort_keys=True,
          separators=(",", ":"),
        ).encode()
      ).hexdigest()
      await connection.execute(
        """
        insert into trend_source_observations (
          candidate_id,source_name,source_kind,observed_at,window_started_at,window_ended_at,
          document_count,distinct_content_type_count,baseline_28d,current_value,
          change_ratio,z_score,evidence_hash,source_metadata
        ) values ($1,'naver_content','content',$2,$3,$2,$4,$5,$6,$4,$7,$8,$9,$10::jsonb)
        on conflict (candidate_id,source_name,evidence_hash) do nothing
        """,
        row["id"],
        now,
        now - timedelta(hours=24),
        candidate.document_count,
        candidate.source_count,
        baseline,
        candidate.momentum,
        candidate.z_score,
        evidence_hash,
        json.dumps({"evidenceIds": list(candidate.evidence_ids)}, ensure_ascii=False),
      )
      stored += 1
    return stored

  return await db.run_in_transaction(operation)


async def _candidate_keywords(db: Database, *, limit: int = 24) -> tuple[str, ...]:
  rows = await db.fetch(
    """
    select normalized_keyword from trend_keyword_candidates
    where status in ('observed','qualified') and (expires_at is null or expires_at>now())
    order by confidence_score desc,last_observed_at desc limit $1
    """,
    limit,
  ) if db.is_connected else []
  return tuple(str(row["normalized_keyword"]) for row in rows)


async def persist_trend_momenta(
  db: Database,
  momenta: list[TrendMomentum],
  *,
  locale: str,
  now: datetime,
) -> int:
  if db.pool is None or not momenta:
    return 0

  async def operation(connection: Any) -> int:
    stored = 0
    for momentum in momenta:
      candidate = await connection.fetchrow(
        """select id,status from trend_keyword_candidates
        where locale=$1 and lower(normalized_keyword)=lower($2) for update""",
        locale,
        momentum.keyword,
      )
      if not candidate:
        continue
      source_kind = "search_trend" if momentum.source == "naver_search" else "shopping_insight"
      evidence_hash = hashlib.sha256(
        f"{momentum.source}\0{momentum.keyword.casefold()}\0{momentum.latest_period}\0{momentum.recent_average}\0{momentum.previous_average}".encode()
      ).hexdigest()
      await connection.execute(
        """
        insert into trend_source_observations (
          candidate_id,source_name,source_kind,observed_at,window_started_at,window_ended_at,
          document_count,distinct_content_type_count,baseline_7d,current_value,
          change_ratio,evidence_hash,source_metadata
        ) values ($1,$2,$3,$4,$5,$4,0,0,$6,$7,$8,$9,$10::jsonb)
        on conflict (candidate_id,source_name,evidence_hash) do nothing
        """,
        candidate["id"],
        momentum.source,
        source_kind,
        now,
        now - timedelta(days=14),
        momentum.previous_average,
        momentum.recent_average,
        momentum.momentum,
        evidence_hash,
        json.dumps({"latestPeriod": momentum.latest_period}),
      )
      intent = await connection.fetchrow(
        """select coalesce(sum(search_count+result_open_count),0)::int as action_count,
          coalesce(max(distinct_user_count),0)::int as distinct_user_count
        from search_intent_hourly
        where candidate_id=$1 and is_privacy_eligible=true
          and bucket_started_at>=$2::timestamptz-interval '28 days'
          and bucket_started_at<$2::timestamptz""",
        candidate["id"],
        now,
      )
      has_private_intent = bool(
        int((intent or {}).get("distinct_user_count") or 0) >= 20
        and int((intent or {}).get("action_count") or 0) > 0
      )
      if momentum.momentum > 0:
        await connection.execute(
          """update search_intent_hourly set datalab_confirmed=true,updated_at=now()
          where candidate_id=$1 and is_privacy_eligible=true and distinct_user_count>=20
            and bucket_started_at>=$2::timestamptz-interval '28 days'
            and bucket_started_at<$2::timestamptz""",
          candidate["id"],
          now,
        )
      meaningful_rise = momentum.momentum >= DATALAB_MEANINGFUL_RISE
      intent_confirmed_rise = bool(
        candidate.get("status") == "observed"
        and momentum.momentum > 0
        and has_private_intent
      )
      if meaningful_rise or intent_confirmed_rise:
        await connection.execute(
          """update trend_keyword_candidates set status='qualified',
            confidence_score=least(1,confidence_score+0.05),
            qualified_at=coalesce(qualified_at,$2),
            last_observed_at=greatest(last_observed_at,$2),
            expires_at=greatest(coalesce(expires_at,$2),$2+interval '28 days'),
            normalization_metadata=normalization_metadata||jsonb_build_object(
              'datalabConfirmed',true,
              'datalabMeaningfulRise',$3::boolean,
              'privacyEligibleIntent',$4::boolean
            ),updated_at=now() where id=$1""",
          candidate["id"],
          now,
          meaningful_rise,
          intent_confirmed_rise,
        )
      stored += 1
    return stored

  return await db.run_in_transaction(operation)


async def persist_weather_snapshots(
  db: Database,
  snapshots: list[WeatherRegionSnapshot],
) -> int:
  if db.pool is None or not snapshots:
    return 0

  async def operation(connection: Any) -> int:
    for snapshot in snapshots:
      expires_at = max(
        snapshot.forecast_at + timedelta(hours=3),
        snapshot.source_updated_at + timedelta(hours=4),
      )
      await connection.execute(
        """
        insert into weather_region_snapshots (
          region_code,region_label,source_name,source_updated_at,forecast_at,expires_at,
          temperature_c,humidity_percent,precipitation_probability_percent,
          precipitation_mm,wind_speed_mps,weather_code,weather_summary
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        on conflict (region_code,source_name,forecast_at) do update set
          source_updated_at=excluded.source_updated_at,expires_at=excluded.expires_at,
          temperature_c=excluded.temperature_c,humidity_percent=excluded.humidity_percent,
          precipitation_probability_percent=excluded.precipitation_probability_percent,
          precipitation_mm=excluded.precipitation_mm,wind_speed_mps=excluded.wind_speed_mps,
          weather_code=excluded.weather_code,weather_summary=excluded.weather_summary
        """,
        snapshot.region_code,
        snapshot.region_label,
        snapshot.source_name,
        snapshot.source_updated_at,
        snapshot.forecast_at,
        expires_at,
        snapshot.temperature_c,
        round(snapshot.humidity_percent) if snapshot.humidity_percent is not None else None,
        round(snapshot.precipitation_probability) if snapshot.precipitation_probability is not None else None,
        snapshot.precipitation_mm,
        snapshot.wind_speed_mps,
        snapshot.weather_code,
        snapshot.summary,
      )
    return len(snapshots)

  return await db.run_in_transaction(operation)


async def load_cached_trend_snapshot(
  db: Database,
  *,
  locale: str,
  now: datetime,
  limit: int = 24,
) -> TrendSnapshot | None:
  if not db.is_connected:
    return None
  rows = await db.fetch(
    """
    select c.normalized_keyword,c.category_codes,c.benefit_tags,c.finish_tags,
      greatest(0.0,least(1.0,c.confidence_score*greatest(
        0.5,
        1.0-extract(epoch from (now()-c.last_observed_at))/extract(epoch from interval '56 days')
      )))::double precision as confidence_score,
      c.normalization_metadata,c.last_observed_at,
      content.content_updated_at,
      datalab.datalab_updated_at,
      coalesce(datalab.search_positive,false) as search_positive,
      coalesce(datalab.shopping_positive,false) as shopping_positive,
      coalesce(content.content_momentum,0)::double precision as content_momentum,
      coalesce(datalab.datalab_momentum,0)::double precision as datalab_momentum,
      exists(select 1 from search_intent_hourly intent
        where intent.candidate_id=c.id and intent.is_privacy_eligible=true
          and intent.datalab_confirmed=true
          and intent.distinct_user_count>=20
          and intent.bucket_started_at>=now()-interval '28 days'
          and intent.search_count+intent.result_open_count>0
      ) as intent_confirmed
    from trend_keyword_candidates c
    left join lateral (
      select max(o.observed_at) filter (where coalesce(o.z_score,0)>0)
          as content_updated_at,
        greatest(0.0,coalesce(max(o.z_score),0))::double precision
          as content_momentum
      from trend_source_observations o
      where o.candidate_id=c.id and o.source_kind='content'
        and o.observed_at>=now()-interval '36 days'
        and (o.source_metadata->>'aggregateOnly') is distinct from 'true'
    ) content on true
    left join lateral (
      select max(latest.observed_at) filter (where latest.change_ratio>0)
          as datalab_updated_at,
        coalesce(bool_or(latest.change_ratio>0) filter (
          where latest.source_kind='search_trend'
        ),false) as search_positive,
        coalesce(bool_or(latest.change_ratio>0) filter (
          where latest.source_kind='shopping_insight'
        ),false) as shopping_positive,
        greatest(0.0,coalesce(max(latest.change_ratio) filter (
          where latest.change_ratio>0
        ),0))::double precision as datalab_momentum
      from (
        select distinct on (o.source_name)
          o.source_name,o.source_kind,o.observed_at,o.change_ratio
        from trend_source_observations o
        where o.candidate_id=c.id
          and o.source_kind in ('search_trend','shopping_insight')
          and o.observed_at>=now()-interval '36 days'
        order by o.source_name,o.observed_at desc,o.id desc
      ) latest
    ) datalab on true
    where c.locale=$1 and c.status='qualified'
      and c.last_observed_at>=now()-interval '28 days'
      and (c.expires_at is null or c.expires_at>now())
    order by confidence_score desc,c.last_observed_at desc limit $2
    """,
    locale,
    limit,
  )
  if not rows:
    return None
  signals: list[TrendSignal] = []
  content_updates: list[datetime] = []
  datalab_updates: list[datetime] = []
  signal_groups: set[str] = set()
  bedrock_used = False
  for row in rows:
    reasons: list[str] = []
    content_momentum = max(0.0, float(row.get("content_momentum") or 0))
    datalab_momentum = max(0.0, float(row.get("datalab_momentum") or 0))
    if content_momentum > 0:
      reasons.append("NAVER_CONTENT_BURST")
    if row.get("search_positive"):
      reasons.append("SEARCH_INTEREST_RISE")
    if row.get("shopping_positive"):
      reasons.append("SHOPPING_CLICK_RISE")
    content_at = _aware(row.get("content_updated_at"))
    datalab_at = _aware(row.get("datalab_updated_at"))
    if content_at:
      content_updates.append(content_at)
      signal_groups.add("naver_content")
    if datalab_at and (row.get("search_positive") or row.get("shopping_positive")):
      datalab_updates.append(datalab_at)
      signal_groups.add("datalab")
    if row.get("intent_confirmed"):
      signal_groups.add("app_intent")
    metadata = _json(row.get("normalization_metadata"))
    bedrock_used = bedrock_used or bool(metadata.get("bedrockUsed"))
    signals.append(TrendSignal(
      keyword=str(row["normalized_keyword"]),
      categories=tuple(row.get("category_codes") or ()),
      color_families=(),
      finishes=tuple(row.get("finish_tags") or ()),
      tags=tuple(row.get("benefit_tags") or ()),
      reason_codes=tuple(reasons),
      confidence_score=float(row.get("confidence_score") or 0),
      content_momentum=content_momentum,
      datalab_momentum=datalab_momentum,
    ))
  source_updated_at = max(content_updates or [_aware(rows[0].get("last_observed_at")) or now])
  top_keyword = signals[0].keyword
  return TrendSnapshot(
    title=f"{top_keyword} 중심 요즘 트렌드",
    summary="최근 뷰티 콘텐츠 급상승과 검색·쇼핑 클릭, 앱 반응을 함께 확인했어요.",
    trend_window="최근 24시간 급상승 · 28일 기준선",
    locale=locale,
    source_name="Naver + KMA + app signals",
    source_updated_at=source_updated_at,
    signals=tuple(signals),
    source_metadata={
      "provider": "cached_batch_signals",
      "signalGroups": sorted(signal_groups),
      "contentUpdatedAt": max(content_updates).isoformat() if content_updates else None,
      "datalabUpdatedAt": max(datalab_updates).isoformat() if datalab_updates else None,
      "bedrockUsed": bedrock_used,
      "metric": "rrf_independent_ranks",
    },
  )


async def _last_completed_times(db: Database) -> dict[str, datetime | None]:
  content = await db.fetchrow(
    "select max(observed_at) as value from trend_source_observations where source_kind='content'"
  )
  datalab = await db.fetchrow(
    """select max(observed_at) as value from trend_source_observations
    where source_kind in ('search_trend','shopping_insight')"""
  )
  weather = await db.fetchrow("select max(source_updated_at) as value from weather_region_snapshots")
  model = await db.fetchrow("select max(created_at) as value from seasonal_ranking_models")
  watermarks = {
    "content": _aware((content or {}).get("value")),
    "datalab": _aware((datalab or {}).get("value")),
    "weather": _aware((weather or {}).get("value")),
    "model": _aware((model or {}).get("value")),
  }
  # Observation timestamps alone are not a sufficient watermark: a valid
  # provider call can return no rows. Completed step metadata advances the due
  # clock in that case and prevents repeating a paid call every scheduler tick.
  completed_runs = await db.fetch(
    """select completed_at,step_results from seasonal_pipeline_runs
    where status in ('succeeded','skipped','failed') and completed_at is not null
    order by completed_at desc limit 100"""
  )
  failed_statuses = {"failed", "notdue", "noserviceprincipal"}
  for run in completed_runs:
    completed_at = _aware(run.get("completed_at"))
    if completed_at is None:
      continue
    steps = _json(run.get("step_results"))
    for source in watermarks:
      step = steps.get(source)
      if not isinstance(step, dict):
        continue
      status = str(step.get("status") or "").replace("_", "").casefold()
      if not status or status in failed_statuses:
        continue
      if watermarks[source] is None or completed_at > watermarks[source]:  # type: ignore[operator]
        watermarks[source] = completed_at
  return watermarks


async def _resolve_service_principal(db: Database, settings: Settings) -> dict[str, Any] | None:
  task_role_arn = str(settings.product_trend_task_role_arn or "").strip()
  if not task_role_arn:
    return None
  return await db.fetchrow(
    """
    select id,principal_key,external_subject from product_recommendation_service_principals
    where principal_key=$1 and status='active' and 'seasonal_auto_publisher'=any(roles)
      and external_subject=$2
    """,
    settings.product_trend_service_principal_key,
    task_role_arn,
  ) if db.is_connected else None


async def _previous_collection_context(
  db: Database,
  *,
  locale: str,
  region_code: str,
) -> dict[str, Any]:
  collection = await db.fetchrow(
    """
    select id,input_fingerprint,source_payload from product_seasonal_collections
    where locale=$1 and region_code=$2 and status='published'
    order by published_at desc limit 1
    """,
    locale,
    region_code,
  )
  if not collection:
    return {"collectionId": None, "inputFingerprint": None, "productIds": [], "weather": None}
  items = await db.fetch(
    """select product_id from product_seasonal_collection_items
    where collection_id=$1 order by position limit 12""",
    collection["id"],
  )
  source_payload = _json(collection.get("source_payload"))
  return {
    "collectionId": collection["id"],
    "inputFingerprint": collection.get("input_fingerprint"),
    "productIds": [str(row["product_id"]) for row in items],
    "weather": source_payload.get("weather") if isinstance(source_payload.get("weather"), dict) else None,
  }


async def _record_nonpublish_decision(
  db: Database,
  *,
  run_id: UUID,
  principal_id: UUID | None,
  previous_collection_id: UUID | None,
  policy_version: str,
  input_fingerprint: str,
  decision: str,
  gate_results: dict[str, Any],
) -> None:
  if principal_id is None:
    return
  await db.execute(
    """
    insert into seasonal_auto_publish_audit_log (
      pipeline_run_id,previous_collection_id,service_principal_id,policy_version,
      decision,input_fingerprint,gate_results,reason_codes
    ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
    """,
    run_id,
    previous_collection_id,
    principal_id,
    policy_version,
    decision,
    input_fingerprint,
    json.dumps(gate_results, ensure_ascii=False, default=str),
    list(gate_results.get("reasons") or []),
  )
  await db.execute(
    """update product_recommendation_service_principals
    set last_used_at=now(),updated_at=now() where id=$1""",
    principal_id,
  )


async def _create_pipeline_run(
  db: Database,
  settings: Settings,
  *,
  trigger_type: str,
  now: datetime,
  shadow_mode: bool,
  service_principal_id: UUID | None,
) -> tuple[dict[str, Any], bool]:
  key = pipeline_idempotency_key(trigger_type, now)
  row = await db.fetchrow(
    """
    insert into seasonal_pipeline_runs (
      idempotency_key,trigger_type,status,shadow_mode,scheduled_for,started_at,
      algorithm_version,auto_publish_policy_version,service_principal_id
    ) values ($1,$2,'running',$3,$4,$5,$6,$7,$8)
    on conflict (idempotency_key) do update set
      status='running',shadow_mode=excluded.shadow_mode,
      scheduled_for=excluded.scheduled_for,started_at=excluded.started_at,
      completed_at=null,algorithm_version=excluded.algorithm_version,
      auto_publish_policy_version=excluded.auto_publish_policy_version,
      input_fingerprint=null,service_principal_id=excluded.service_principal_id,
      ranking_model_id=null,step_results='{}'::jsonb,source_usage='{}'::jsonb,
      bedrock_invocation_count=0,bedrock_input_tokens=0,bedrock_output_tokens=0,
      estimated_cost_usd=0,error_code=null,error_message=null
    where seasonal_pipeline_runs.status='failed'
      or (seasonal_pipeline_runs.status='running' and (
        seasonal_pipeline_runs.started_at is null or seasonal_pipeline_runs.started_at<$9
      ))
    returning id,status
    """,
    key,
    trigger_type,
    shadow_mode,
    scheduled_slot(now),
    now,
    PIPELINE_ALGORITHM_VERSION,
    settings.product_trend_auto_publish_policy_version,
    service_principal_id,
    now - timedelta(seconds=settings.product_trend_pipeline_max_runtime_seconds),
  )
  if row:
    return row, True
  existing = await db.fetchrow(
    "select id,status from seasonal_pipeline_runs where idempotency_key=$1",
    key,
  )
  if not existing:
    raise RuntimeError("Pipeline idempotency row disappeared after conflict.")
  return existing, False


async def _source_usage(db: Database, *, now: datetime) -> dict[str, int]:
  rows = await db.fetch(
    """select provider,sum(call_count)::int as count from trend_external_call_quotas
    where period_kind='month' and period_start=date_trunc('month',$1::timestamptz)
    group by provider order by provider""",
    now,
  )
  return {str(row["provider"]): int(row.get("count") or 0) for row in rows}


async def _execute_pipeline(
  db: Database,
  settings: Settings,
  *,
  trigger_type: str,
  auto_publish: bool,
  locale: str,
  now: datetime,
) -> dict[str, Any]:
  shadow_mode = bool(settings.product_trend_shadow_mode or not settings.trend_now_recommendations_v2)
  principal = await _resolve_service_principal(db, settings)
  live_publish_requested = bool(
    auto_publish
    and settings.product_trend_auto_publish_enabled
    and settings.trend_now_recommendations_v2
    and not shadow_mode
  )
  if live_publish_requested and principal is None:
    raise AppError(
      503,
      "SEASONAL_SERVICE_PRINCIPAL_REQUIRED",
      "Live trend publishing requires an active service principal bound to the configured ECS task role ARN.",
    )
  run, created = await _create_pipeline_run(
    db,
    settings,
    trigger_type=trigger_type,
    now=now,
    shadow_mode=shadow_mode,
    service_principal_id=(principal or {}).get("id"),
  )
  run_id = run["id"]
  if not created:
    return {"status": "duplicate", "runId": str(run_id), "existingStatus": run.get("status")}

  quota = PostgresTrendCallQuotaLedger(db)
  steps: dict[str, Any] = {}
  bedrock_usage = {"invocations": 0, "inputTokens": 0, "outputTokens": 0}
  try:
    due = await _last_completed_times(db)
    try:
      aggregation = await aggregate_completed_signal_hours(db, now=now, hours=3)
      steps["appAggregation"] = aggregation
    except Exception as error:  # Existing cached signals remain usable.
      logger.warning("Trend app aggregation failed", exc_info=True)
      steps["appAggregation"] = {"status": "failed", "error": type(error).__name__}

    if trend_collection_due(due["weather"], now=now, interval_hours=settings.kma_weather_interval_hours):
      try:
        weather = await KmaWeatherProvider(settings, quota_ledger=quota).collect_regions(now=now)
        steps["weather"] = {"status": "ready" if weather else "unavailable", "stored": await persist_weather_snapshots(db, weather)}
      except Exception as error:
        logger.warning("KMA trend weather collection failed", exc_info=True)
        steps["weather"] = {"status": "failed", "error": type(error).__name__}
    else:
      steps["weather"] = {"status": "notDue"}

    if trend_collection_due(due["content"], now=now, interval_hours=settings.naver_trend_content_interval_hours):
      try:
        seeds = await derive_trend_seed_queries(db, limit=settings.naver_trend_content_max_seed_queries)
        documents = await NaverContentTrendProvider(settings, quota_ledger=quota).collect(seeds, now=now)
        baseline_counts = await load_baseline_phrase_counts(db, now=now)
        # Snapshot vocabulary before inserting today's observations. Otherwise a
        # genuinely new ambiguous phrase would immediately look "known" and
        # incorrectly bypass the once-daily semantic classifier.
        known_vocabulary = await _known_vocabulary(db)
        daily_observations = extract_daily_content_phrase_observations(
          documents,
          [],
          now=now,
          baseline_phrase_counts=baseline_counts,
        )
        daily_observations_stored = await persist_daily_content_observations(
          db,
          daily_observations,
          locale=locale,
          now=now,
        )
        candidates = extract_burst_phrases(
          documents,
          [],
          now=now,
          min_documents=settings.product_trend_burst_min_documents,
          min_sources=settings.product_trend_burst_min_sources,
          min_z_score=settings.product_trend_burst_min_z_score,
          baseline_phrase_counts=baseline_counts,
        )
        classifier = BedrockTrendClassifier(settings, quota_ledger=quota)
        semantic = await classifier.classify_if_needed(
          candidates,
          documents,
          known_vocabulary=known_vocabulary,
          now=now,
        )
        bedrock_usage = {
          "invocations": int(semantic.invoked),
          "inputTokens": semantic.input_tokens,
          "outputTokens": semantic.output_tokens,
        }
        semantic_map = {item.keyword.casefold(): item for item in semantic.items}
        stored = await persist_content_candidates(
          db,
          candidates,
          locale=locale,
          now=now,
          semantic_items=semantic_map,
        )
        steps["content"] = {
          "status": "ready" if candidates else "noQualifiedBurst",
          "seedCount": len(seeds),
          "documentCount": len(documents),
          "dailyObservationCount": len(daily_observations),
          "dailyObservationStored": daily_observations_stored,
          "candidateCount": len(candidates),
          "stored": stored,
          "bedrockStatus": semantic.status,
        }
      except Exception as error:
        logger.warning("Naver content trend collection failed", exc_info=True)
        steps["content"] = {"status": "failed", "error": type(error).__name__}
    else:
      steps["content"] = {"status": "notDue"}

    if trend_collection_due(due["datalab"], now=now, interval_hours=settings.naver_trend_validation_interval_hours):
      try:
        keywords = await _candidate_keywords(db)
        momenta = await NaverTrendMomentumService(settings, quota_ledger=quota).collect(
          keywords,
          start_date=(now - timedelta(days=28)).date().isoformat(),
          end_date=now.date().isoformat(),
          shopping_category="50000002",
          now=now,
        )
        steps["datalab"] = {
          "status": "ready" if momenta else "unavailable",
          "keywordCount": len(keywords),
          "observationCount": await persist_trend_momenta(db, momenta, locale=locale, now=now),
        }
      except Exception as error:
        logger.warning("Naver DataLab trend validation failed", exc_info=True)
        steps["datalab"] = {"status": "failed", "error": type(error).__name__}
    else:
      steps["datalab"] = {"status": "notDue"}

    if principal and trend_collection_due(due["model"], now=now, interval_hours=24):
      try:
        trained = await train_and_maybe_activate_logistic_ranker(
          db,
          service_principal_id=principal["id"],
          now=now,
        )
        steps["model"] = asdict(trained)
      except Exception as error:
        logger.warning("Trend logistic ranker training failed", exc_info=True)
        steps["model"] = {"status": "failed", "error": type(error).__name__}
    else:
      steps["model"] = {"status": "notDue" if principal else "noServicePrincipal"}

    try:
      ranking_model = await load_active_ranking_model(db)
    except Exception as error:
      logger.warning("Active trend ranking model load failed", exc_info=True)
      ranking_model = None
      steps["rankingModel"] = {"status": "failed", "error": type(error).__name__}
    else:
      steps["rankingModel"] = {
        "status": "active" if ranking_model is not None else "rrfBaseline",
        "id": str(ranking_model.id) if ranking_model and ranking_model.id else None,
        "modelVersion": ranking_model.model_version if ranking_model else "rrf_v1",
      }
    ranking_model_version = ranking_model.model_version if ranking_model else "rrf_v1"
    algorithm_version = (
      f"{PIPELINE_ALGORITHM_VERSION}+logistic_v1"
      if ranking_model is not None and ranking_model.model_type == "logistic"
      else PIPELINE_ALGORITHM_VERSION
    )

    snapshot = await load_cached_trend_snapshot(db, locale=locale, now=now)
    if snapshot is None:
      source_usage = await _source_usage(db, now=now)
      await db.execute(
        """update seasonal_pipeline_runs set status='skipped',completed_at=$2,
          step_results=$3::jsonb,source_usage=$4::jsonb,
          bedrock_invocation_count=$5,bedrock_input_tokens=$6,bedrock_output_tokens=$7,
          ranking_model_id=$8,algorithm_version=$9
        where id=$1""",
        run_id,
        now,
        json.dumps(steps, ensure_ascii=False, default=str),
        json.dumps(source_usage),
        bedrock_usage["invocations"],
        bedrock_usage["inputTokens"],
        bedrock_usage["outputTokens"],
        ranking_model.id if ranking_model else None,
        algorithm_version,
      )
      return {"status": "skipped", "runId": str(run_id), "reason": "NO_QUALIFIED_TRENDS", "steps": steps}

    region_results: list[dict[str, Any]] = []
    fingerprints: list[str] = []
    for region_code in TREND_REGION_CODES:
      weather = await fetch_region_weather(db, region_code=region_code)
      candidates = await fetch_seasonal_product_candidates(
        db,
        settings,
        region_code=region_code,
      )
      items = match_trends_to_products(
        snapshot,
        candidates,
        limit=settings.product_trend_target_items,
        weather=weather,
        ranking_model=ranking_model,
        exploration_key=f"{run_id}:{region_code}",
      )
      base_fingerprint = collection_input_fingerprint(
        locale=locale,
        region_code=region_code,
        trend_keywords=snapshot.trend_keywords,
        source_updated_at=snapshot.source_updated_at,
        weather=weather,
        items=items,
      )
      fingerprint = ranking_aware_fingerprint(
        base_fingerprint,
        model_version=ranking_model_version,
      )
      fingerprints.append(fingerprint)
      previous = await _previous_collection_context(db, locale=locale, region_code=region_code)
      source_meta = snapshot.source_metadata
      signal_groups = relevant_consensus_signal_groups(
        source_meta.get("signalGroups") or [],
        items,
      )

      def parsed_time(value: Any) -> datetime | None:
        if isinstance(value, datetime):
          return _aware(value)
        if isinstance(value, str):
          try:
            return _aware(datetime.fromisoformat(value.replace("Z", "+00:00")))
          except ValueError:
            return None
        return None

      current_weather_context = {
        key: (weather or {}).get(key)
        for key in (
          "temperatureC",
          "humidityPercent",
          "precipitationProbabilityPercent",
          "windSpeedMps",
          "weatherCode",
        )
      } if weather else None
      decision = evaluate_auto_publish_quality(
        items=items,
        signal_groups=signal_groups,
        source_updated_at=parsed_time(source_meta.get("contentUpdatedAt")),
        datalab_updated_at=parsed_time(source_meta.get("datalabUpdatedAt")),
        weather_updated_at=parsed_time((weather or {}).get("sourceUpdatedAt")),
        average_confidence=snapshot.confidence_score,
        input_fingerprint=fingerprint,
        previous_fingerprint=previous["inputFingerprint"],
        previous_product_ids=previous["productIds"],
        weather_context_changed=weather_changed_meaningfully(current_weather_context, previous["weather"]),
        shadow_mode=shadow_mode,
        now=now,
        minimum_items=settings.product_trend_min_items,
        policy_version=settings.product_trend_auto_publish_policy_version,
      )
      gate = decision.as_dict()
      published_collection_id = None
      if decision.passed and live_publish_requested:
        published_collection_id = await persist_trend_collection(
          db,
          snapshot,
          items,
          publish=True,
          region_code=region_code,
          algorithm_version=algorithm_version,
          input_fingerprint=fingerprint,
          auto_publish_policy_version=settings.product_trend_auto_publish_policy_version,
          pipeline_run_id=run_id,
          service_principal_id=principal["id"],  # type: ignore[index]
          weather=weather,
          quality_gate_results=gate,
          offer_max_age_hours=settings.product_offer_max_age_hours,
          now=now,
        )
      else:
        skipped_for_unchanged_input = bool(decision.reasons) and set(decision.reasons) <= {
          "NEW_FINGERPRINT",
          "MEANINGFUL_CHANGE",
        }
        if skipped_for_unchanged_input and previous["collectionId"] is not None:
          await db.execute(
            """update product_seasonal_collections
            set freshness_status='fresh',next_evaluation_at=$2,updated_at=now()
            where id=$1 and status='published'""",
            previous["collectionId"],
            now + timedelta(hours=3),
          )
        await _record_nonpublish_decision(
          db,
          run_id=run_id,
          principal_id=(principal or {}).get("id"),
          previous_collection_id=previous["collectionId"],
          policy_version=settings.product_trend_auto_publish_policy_version,
          input_fingerprint=fingerprint,
          decision="skipped" if decision.passed or skipped_for_unchanged_input else "blocked",
          gate_results=gate,
        )
      region_results.append({
        "regionCode": region_code,
        "itemCount": len(items),
        "qualityPassed": decision.passed,
        "published": published_collection_id is not None,
        "collectionId": str(published_collection_id) if published_collection_id else None,
        "reasonCodes": list(decision.reasons),
        "inputFingerprint": fingerprint,
      })

    combined_fingerprint = hashlib.sha256("\n".join(sorted(fingerprints)).encode()).hexdigest()
    steps["regions"] = region_results
    source_usage = await _source_usage(db, now=now)
    await db.execute(
      """update seasonal_pipeline_runs set status='succeeded',completed_at=$2,
        input_fingerprint=$3,step_results=$4::jsonb,source_usage=$5::jsonb,
        bedrock_invocation_count=$6,bedrock_input_tokens=$7,bedrock_output_tokens=$8,
        ranking_model_id=$9,algorithm_version=$10
      where id=$1""",
      run_id,
      now,
      combined_fingerprint,
      json.dumps(steps, ensure_ascii=False, default=str),
      json.dumps(source_usage),
      bedrock_usage["invocations"],
      bedrock_usage["inputTokens"],
      bedrock_usage["outputTokens"],
      ranking_model.id if ranking_model else None,
      algorithm_version,
    )
    return {
      "status": "succeeded",
      "runId": str(run_id),
      "shadowMode": shadow_mode,
      "autoPublishEnabled": live_publish_requested,
      "publishedRegionCount": sum(1 for row in region_results if row["published"]),
      "qualityPassedRegionCount": sum(1 for row in region_results if row["qualityPassed"]),
      "regions": region_results,
      "steps": steps,
    }
  except asyncio.CancelledError:
    await asyncio.shield(db.execute(
      """update seasonal_pipeline_runs set status='failed',completed_at=$2,
        step_results=$3::jsonb,error_code='PIPELINE_TIMEOUT',
        error_message='Trend pipeline exceeded its configured runtime limit.' where id=$1""",
      run_id,
      datetime.now(timezone.utc),
      json.dumps(steps, ensure_ascii=False, default=str),
    ))
    raise
  except Exception as error:
    await db.execute(
      """update seasonal_pipeline_runs set status='failed',completed_at=$2,
        step_results=$3::jsonb,error_code=$4,error_message=$5 where id=$1""",
      run_id,
      now,
      json.dumps(steps, ensure_ascii=False, default=str),
      getattr(error, "code", type(error).__name__)[:80],
      str(error)[:500],
    )
    raise


async def run_trend_now_pipeline(
  db: Database,
  settings: Settings,
  *,
  trigger_type: str = "scheduled",
  auto_publish: bool = False,
  locale: str = "ko-KR",
  now: datetime | None = None,
) -> dict[str, Any]:
  if trigger_type not in {"scheduled", "manual", "retry"}:
    raise AppError(422, "INVALID_PIPELINE_TRIGGER", "Unsupported trend pipeline trigger.")
  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Trend automation requires PostgreSQL.")
  current = _aware(now) or datetime.now(timezone.utc)
  async with db.pool.acquire() as lock_connection:
    acquired = await lock_connection.fetchval(
      "select pg_try_advisory_lock(hashtextextended($1,0))",
      _LOCK_KEY,
    )
    if not acquired:
      return {"status": "locked", "reason": "ANOTHER_PIPELINE_RUN_IS_ACTIVE"}
    try:
      return await asyncio.wait_for(
        _execute_pipeline(
          db,
          settings,
          trigger_type=trigger_type,
          auto_publish=auto_publish,
          locale=locale,
          now=current,
        ),
        timeout=settings.product_trend_pipeline_max_runtime_seconds,
      )
    finally:
      await lock_connection.fetchval(
        "select pg_advisory_unlock(hashtextextended($1,0))",
        _LOCK_KEY,
      )
