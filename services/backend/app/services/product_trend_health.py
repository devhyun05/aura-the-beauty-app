"""Serving-health accounting and transactional rollback for trend-now shelves.

The mobile request path only schedules :func:`record_seasonal_serving_outcome` as
background work.  Eligibility checks and rollback decisions run in the separate
15-minute ops task implemented by :func:`run_trend_now_health_check`.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
from typing import Any
from uuid import UUID

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.services.product_catalog import offer_freshness_sql
from app.services.product_trend_quality import collection_freshness_status
from app.services.product_trend_regions import normalize_trend_region_code


logger = logging.getLogger(__name__)

HEALTH_ALGORITHM_VERSION = "trend_now_serving_health_v1"
HEALTH_POLICY_VERSION = "trend-now-health-rollback-v1"
HEALTH_BUCKET_MINUTES = 15
SEASONAL_CACHE_SETTLE_SECONDS = 120
DEFAULT_MIN_ELIGIBLE_ITEMS = 12
DEFAULT_MAX_FALLBACK_RATIO = 0.10
DEFAULT_MIN_REQUESTS = 20
DEFAULT_BUCKET_RETENTION_DAYS = 8


def health_bucket_start(value: datetime) -> datetime:
  """Return the UTC start of the containing 15-minute health bucket."""
  aware = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
  utc = aware.astimezone(timezone.utc)
  return utc.replace(
    minute=(utc.minute // HEALTH_BUCKET_MINUTES) * HEALTH_BUCKET_MINUTES,
    second=0,
    microsecond=0,
  )


def health_idempotency_key(value: datetime) -> str:
  return f"trend-now:health:{health_bucket_start(value).isoformat()}"


async def record_seasonal_serving_outcome(
  db: Database,
  *,
  locale: str,
  region_code: str,
  used_fallback: bool,
  now: datetime | None = None,
) -> bool:
  """Best-effort serving counter intended for a FastAPI background task.

  Failures are logged and deliberately not propagated.  This keeps health
  telemetry from changing the seasonal recommendation response or its latency.
  """
  if not db.is_connected:
    return False
  bucket = health_bucket_start(now or datetime.now(timezone.utc))
  try:
    await db.execute(
      """
      insert into seasonal_serving_health_buckets (
        bucket_started_at,locale,region_code,request_count,fallback_count
      ) values ($1,$2,$3,1,$4)
      on conflict (bucket_started_at,locale,region_code) do update set
        request_count=seasonal_serving_health_buckets.request_count+1,
        fallback_count=seasonal_serving_health_buckets.fallback_count+excluded.fallback_count,
        updated_at=now()
      """,
      bucket,
      str(locale or "ko-KR").strip() or "ko-KR",
      normalize_trend_region_code(region_code),
      int(bool(used_fallback)),
    )
  except Exception:
    logger.warning("Failed to record seasonal serving health outcome", exc_info=True)
    return False
  return True


async def _resolve_service_principal(
  connection: Any,
  settings: Settings,
) -> dict[str, Any] | None:
  task_role_arn = str(settings.product_trend_task_role_arn or "").strip()
  if not task_role_arn:
    return None
  row = await connection.fetchrow(
    """
    select id,principal_key from product_recommendation_service_principals
    where principal_key=$1 and external_subject=$2 and status='active'
      and 'seasonal_auto_publisher'=any(roles)
    for update
    """,
    settings.product_trend_service_principal_key,
    task_role_arn,
  )
  return dict(row) if row else None


async def _create_health_run(
  db: Database,
  settings: Settings,
  *,
  now: datetime,
  scheduled_for: datetime,
) -> tuple[dict[str, Any], bool]:
  key = health_idempotency_key(scheduled_for)
  bucket = health_bucket_start(scheduled_for)
  stale_before = now - timedelta(
    seconds=max(HEALTH_BUCKET_MINUTES * 60, settings.product_trend_pipeline_max_runtime_seconds),
  )

  async def operation(connection: Any) -> tuple[dict[str, Any], bool]:
    principal = await _resolve_service_principal(connection, settings)
    if principal is None:
      raise AppError(
        503,
        "SEASONAL_SERVICE_PRINCIPAL_REQUIRED",
        "Trend serving-health rollback requires an active seasonal_auto_publisher service principal.",
      )
    inserted = await connection.fetchrow(
      """
      insert into seasonal_pipeline_runs (
        idempotency_key,trigger_type,status,shadow_mode,scheduled_for,started_at,
        algorithm_version,auto_publish_policy_version,service_principal_id
      ) values ($1,'health','running',false,$2,$3,$4,$5,$6)
      on conflict (idempotency_key) do nothing
      returning id,status
      """,
      key,
      bucket,
      now,
      HEALTH_ALGORITHM_VERSION,
      HEALTH_POLICY_VERSION,
      principal["id"],
    )
    if inserted:
      return dict(inserted), True

    existing = await connection.fetchrow(
      """select id,status,started_at,step_results from seasonal_pipeline_runs
      where idempotency_key=$1 for update""",
      key,
    )
    if not existing:
      raise RuntimeError("Health run disappeared after idempotency conflict.")
    retryable = existing["status"] == "failed" or (
      existing["status"] == "running"
      and existing.get("started_at") is not None
      and existing["started_at"] <= stale_before
    )
    if not retryable:
      return dict(existing), False
    await connection.execute(
      """
      update seasonal_pipeline_runs set
        status='running',started_at=$2,completed_at=null,service_principal_id=$3,
        step_results='{}'::jsonb,error_code=null,error_message=null
      where id=$1
      """,
      existing["id"],
      now,
      principal["id"],
    )
    return {"id": existing["id"], "status": "running"}, True

  return await db.run_in_transaction(operation)


async def _retryable_health_windows(
  db: Database,
  settings: Settings,
  *,
  locale: str,
  current_window_end: datetime,
  now: datetime,
) -> list[datetime]:
  """Find a bounded backlog of failed/stale slots before evaluating the current one."""
  retention_days = int(
    getattr(settings, "product_trend_health_bucket_retention_days", DEFAULT_BUCKET_RETENTION_DAYS),
  )
  stale_before = now - timedelta(
    seconds=max(HEALTH_BUCKET_MINUTES * 60, settings.product_trend_pipeline_max_runtime_seconds),
  )
  rows = await db.fetch(
    """
    with retryable_runs as (
      select scheduled_for
      from seasonal_pipeline_runs
      where trigger_type='health' and scheduled_for>=$1 and scheduled_for<$2
        and (
          status='failed'
          or (status='running' and started_at is not null and started_at<=$3)
        )
    ), missing_runs_with_traffic as (
      select distinct bucket.bucket_started_at+interval '15 minutes' as scheduled_for
      from seasonal_serving_health_buckets bucket
      where bucket.locale=$4
        and bucket.bucket_started_at+interval '15 minutes'>=$1
        and bucket.bucket_started_at+interval '15 minutes'<$2
        and not exists (
          select 1 from seasonal_pipeline_runs run
          where run.trigger_type='health'
            and run.scheduled_for=bucket.bucket_started_at+interval '15 minutes'
        )
    ), retryable_windows as (
      select scheduled_for from retryable_runs
      union
      select scheduled_for from missing_runs_with_traffic
    )
    select scheduled_for from retryable_windows
    order by scheduled_for
    limit 3
    """,
    current_window_end - timedelta(days=retention_days),
    current_window_end,
    stale_before,
    locale,
  )
  windows: list[datetime] = []
  for row in rows:
    value = row.get("scheduled_for")
    if not isinstance(value, datetime):
      continue
    bucket = health_bucket_start(value)
    if bucket not in windows:
      windows.append(bucket)
  return windows


async def _eligible_item_count(
  connection: Any,
  *,
  collection_id: UUID,
  offer_max_age_hours: int,
) -> int:
  value = await connection.fetchval(
    f"""
    select count(*)::int
    from product_seasonal_collection_items i
    join products p on p.id=i.product_id
    where i.collection_id=$1 and i.sponsorship_type<>'sponsored'
      and p.is_active=true and p.catalog_status='published' and p.license_status='valid'
      and p.allowed_uses @> array['mobile_display','recommendation']::text[]
      and (p.license_valid_from is null or p.license_valid_from<=now())
      and (p.license_valid_until is null or p.license_valid_until>now())
      and (
        i.shade_id is null or exists (
          select 1 from product_shades s
          where s.id=i.shade_id and s.product_id=p.id and s.is_active=true
            and s.license_status='valid'
            and s.allowed_uses @> array['mobile_display','recommendation']::text[]
            and (s.license_valid_from is null or s.license_valid_from<=now())
            and (s.license_valid_until is null or s.license_valid_until>now())
        )
      )
      and exists (
        select 1 from product_assets a where a.product_id=p.id and a.is_active=true
          and a.asset_type='packshot' and a.license_status='valid'
          and a.allowed_uses @> array['mobile_display','recommendation']::text[]
          and (a.valid_from is null or a.valid_from<=now())
          and (a.valid_until is null or a.valid_until>now())
          and (
            (i.shade_id is null and a.shade_id is null)
            or (i.shade_id is not null and (a.shade_id is null or a.shade_id=i.shade_id))
          )
      )
      and exists (
        select 1 from product_offers o where o.product_id=p.id and o.is_active=true
          and o.availability_status in ('in_stock','limited') and o.license_status='valid'
          and o.affiliate_type<>'sponsored'
          and o.allowed_uses @> array['mobile_display']::text[]
          and (o.valid_until is null or o.valid_until>now())
          and (
            (i.shade_id is null and o.shade_id is null)
            or (i.shade_id is not null and (o.shade_id is null or o.shade_id=i.shade_id))
          )
          {offer_freshness_sql("o", "$2")}
      )
    """,
    collection_id,
    offer_max_age_hours,
  )
  return int(value or 0)


def _audit_fingerprint(collection: dict[str, Any], run_id: UUID) -> str:
  fingerprint = str(collection.get("input_fingerprint") or "").strip().casefold()
  if len(fingerprint) == 64 and all(character in "0123456789abcdef" for character in fingerprint):
    return fingerprint
  return hashlib.sha256(f"health:{collection['id']}:{run_id}".encode()).hexdigest()


async def _evaluate_region(
  db: Database,
  settings: Settings,
  *,
  run_id: UUID,
  collection_id: UUID,
  region_code: str,
  window_started_at: datetime,
  window_ended_at: datetime,
  request_count: int,
  fallback_count: int,
  now: datetime,
) -> dict[str, Any]:
  min_items = int(getattr(settings, "product_trend_health_min_eligible_items", DEFAULT_MIN_ELIGIBLE_ITEMS))
  max_fallback_ratio = float(
    getattr(settings, "product_trend_health_max_fallback_ratio", DEFAULT_MAX_FALLBACK_RATIO),
  )
  min_requests = int(getattr(settings, "product_trend_health_min_requests", DEFAULT_MIN_REQUESTS))
  fallback_ratio = fallback_count / request_count if request_count > 0 else 0.0

  async def operation(connection: Any) -> dict[str, Any]:
    already_evaluated = await connection.fetchval(
      """
      select exists(
        select 1 from seasonal_auto_publish_audit_log
        where pipeline_run_id=$1 and gate_results->>'regionCode'=$2
          and decision in ('rolled_back','blocked')
      )
      """,
      run_id,
      region_code,
    )
    if already_evaluated:
      return {"regionCode": region_code, "status": "alreadyEvaluated"}

    current_row = await connection.fetchrow(
      """
      select id,slug,locale,region_code,revision,input_fingerprint,published_at,
        freshness_status
      from product_seasonal_collections
      where id=$1 and status='published'
      for update
      """,
      collection_id,
    )
    if not current_row:
      return {"regionCode": region_code, "status": "changedConcurrently"}
    current = dict(current_row)
    published_at = current.get("published_at")
    if isinstance(published_at, datetime) and published_at.tzinfo is None:
      published_at = published_at.replace(tzinfo=timezone.utc)
    fallback_ratio_eligible = bool(
      request_count >= min_requests
      and isinstance(published_at, datetime)
      and published_at <= window_started_at - timedelta(seconds=SEASONAL_CACHE_SETTLE_SECONDS)
      and str(current.get("freshness_status") or "fresh") == "fresh"
    )
    eligible_count = await _eligible_item_count(
      connection,
      collection_id=current["id"],
      offer_max_age_hours=settings.product_offer_max_age_hours,
    )
    reason_codes: list[str] = []
    if eligible_count < min_items:
      reason_codes.append("ELIGIBLE_ITEM_COUNT_BELOW_FLOOR")
    if fallback_ratio_eligible and fallback_ratio > max_fallback_ratio:
      reason_codes.append("FALLBACK_RATIO_ABOVE_LIMIT")
    if not reason_codes:
      return {
        "regionCode": region_code,
        "status": "healthy",
        "eligibleItemCount": eligible_count,
        "requestCount": request_count,
        "fallbackCount": fallback_count,
        "fallbackRatio": fallback_ratio,
        "fallbackRatioEligible": fallback_ratio_eligible,
      }

    candidates = await connection.fetch(
      """
      select c.id,c.revision,c.input_fingerprint,c.source_updated_at,
        c.source_payload,c.published_at
      from product_seasonal_collections c
      where c.slug=$1 and c.id<>$2 and c.status='suspended'
        and c.reviewed_at is not null and c.published_at is not null
        and c.valid_from<=$3 and c.valid_until>$3
        and c.published_at>=$3-interval '7 days'
        and not exists (
          select 1 from seasonal_auto_publish_audit_log prior_rollback
          where prior_rollback.decision='rolled_back'
            and prior_rollback.previous_collection_id=c.id
        )
      order by c.revision desc
      for update
      """,
      current["slug"],
      current["id"],
      now,
    )
    rollback_target: dict[str, Any] | None = None
    rollback_eligible_count = 0
    rollback_freshness: str | None = None
    for row in candidates:
      candidate = dict(row)
      candidate_count = await _eligible_item_count(
        connection,
        collection_id=candidate["id"],
        offer_max_age_hours=settings.product_offer_max_age_hours,
      )
      candidate_freshness = collection_freshness_status(
        source_updated_at=candidate.get("source_updated_at"),
        source_payload=candidate.get("source_payload"),
        now=now,
      )
      if reason_codes == ["FALLBACK_RATIO_ABOVE_LIMIT"] and candidate_freshness != "fresh":
        continue
      if candidate_count >= min_items:
        rollback_target = candidate
        rollback_eligible_count = candidate_count
        rollback_freshness = candidate_freshness
        break

    gate_results = {
      "healthPolicyVersion": HEALTH_POLICY_VERSION,
      "regionCode": region_code,
      "windowStartedAt": window_started_at.isoformat(),
      "windowEndedAt": window_ended_at.isoformat(),
      "eligibleItemCount": eligible_count,
      "minimumEligibleItemCount": min_items,
      "requestCount": request_count,
      "fallbackCount": fallback_count,
      "fallbackRatio": fallback_ratio,
      "maximumFallbackRatio": max_fallback_ratio,
      "minimumRequestCount": min_requests,
      "fallbackRatioEligible": fallback_ratio_eligible,
      "currentFreshnessStatus": str(current.get("freshness_status") or "fresh"),
      "reasons": reason_codes,
    }
    principal = await _resolve_service_principal(connection, settings)
    if principal is None:
      raise AppError(
        503,
        "SEASONAL_SERVICE_PRINCIPAL_REQUIRED",
        "The health rollback service principal became unavailable.",
      )
    if rollback_target is None:
      gate_results["rollbackCandidateStatus"] = "noEligiblePriorRevision"
      await connection.execute(
        """
        insert into seasonal_auto_publish_audit_log (
          pipeline_run_id,previous_collection_id,service_principal_id,policy_version,
          decision,input_fingerprint,gate_results,reason_codes
        ) values ($1,$2,$3,$4,'blocked',$5,$6::jsonb,$7)
        """,
        run_id,
        current["id"],
        principal["id"],
        HEALTH_POLICY_VERSION,
        _audit_fingerprint(current, run_id),
        json.dumps(gate_results, ensure_ascii=False),
        reason_codes + ["NO_ELIGIBLE_ROLLBACK_REVISION"],
      )
      await connection.execute(
        """update product_recommendation_service_principals
        set last_used_at=now(),updated_at=now() where id=$1""",
        principal["id"],
      )
      return {
        "regionCode": region_code,
        "status": "blocked",
        "currentCollectionId": str(current["id"]),
        **{key: value for key, value in gate_results.items() if key != "healthPolicyVersion"},
      }

    gate_results["rollbackEligibleItemCount"] = rollback_eligible_count
    gate_results["rollbackRevision"] = int(rollback_target["revision"])
    assert rollback_freshness is not None
    gate_results["rollbackFreshnessStatus"] = rollback_freshness
    await connection.execute(
      """
      update product_seasonal_collections set
        status='suspended',freshness_status='stale',
        suspension_reason='automatic_health_rollback',next_evaluation_at=$2,updated_at=now()
      where id=$1 and status='published'
      """,
      current["id"],
      now,
    )
    await connection.execute(
      """
      update product_seasonal_collections set
        status='published',freshness_status=$2,suspension_reason=null,
        next_evaluation_at=$3,updated_at=now()
      where id=$1 and status='suspended'
      """,
      rollback_target["id"],
      rollback_freshness,
      now + timedelta(hours=3),
    )
    await connection.execute(
      """
      insert into seasonal_auto_publish_audit_log (
        pipeline_run_id,collection_id,previous_collection_id,service_principal_id,
        policy_version,decision,input_fingerprint,gate_results,reason_codes
      ) values ($1,$2,$3,$4,$5,'rolled_back',$6,$7::jsonb,$8)
      """,
      run_id,
      rollback_target["id"],
      current["id"],
      principal["id"],
      HEALTH_POLICY_VERSION,
      _audit_fingerprint(rollback_target, run_id),
      json.dumps(gate_results, ensure_ascii=False),
      reason_codes,
    )
    await connection.execute(
      """update product_recommendation_service_principals
      set last_used_at=now(),updated_at=now() where id=$1""",
      principal["id"],
    )
    return {
      "regionCode": region_code,
      "status": "rolledBack",
      "currentCollectionId": str(current["id"]),
      "restoredCollectionId": str(rollback_target["id"]),
      **{key: value for key, value in gate_results.items() if key != "healthPolicyVersion"},
    }

  return await db.run_in_transaction(operation)


async def run_trend_now_health_check(
  db: Database,
  settings: Settings,
  *,
  locale: str = "ko-KR",
  now: datetime | None = None,
  _window_ended_at: datetime | None = None,
  _discover_retries: bool = True,
) -> dict[str, Any]:
  """Evaluate the last completed serving window and roll back unhealthy shelves."""
  if not db.is_connected:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Trend serving-health checks require a database.")
  if (
    not settings.trend_now_recommendations_v2
    or not settings.product_trend_auto_publish_enabled
    or settings.product_trend_shadow_mode
  ):
    return {"status": "disabled", "reason": "LIVE_AUTO_PUBLISH_DISABLED"}

  evaluated_at = now or datetime.now(timezone.utc)
  current_window_end = health_bucket_start(evaluated_at)
  if _discover_retries:
    retry_windows = await _retryable_health_windows(
      db,
      settings,
      locale=locale,
      current_window_end=current_window_end,
      now=evaluated_at,
    )
    if retry_windows:
      outcomes: list[dict[str, Any]] = []
      errors: list[Exception] = []
      for window_end in [*retry_windows, current_window_end]:
        try:
          outcomes.append(
            await run_trend_now_health_check(
              db,
              settings,
              locale=locale,
              now=evaluated_at,
              _window_ended_at=window_end,
              _discover_retries=False,
            )
          )
        except Exception as error:
          errors.append(error)
      if errors:
        raise errors[0]
      latest = outcomes[-1]
      return {
        **latest,
        "rolledBackCount": sum(int(outcome.get("rolledBackCount") or 0) for outcome in outcomes),
        "blockedCount": sum(int(outcome.get("blockedCount") or 0) for outcome in outcomes),
        "recoveredWindowCount": len(retry_windows),
        "windows": [
          {
            key: outcome.get(key)
            for key in (
              "status",
              "runId",
              "windowStartedAt",
              "windowEndedAt",
              "rolledBackCount",
              "blockedCount",
            )
          }
          for outcome in outcomes
        ],
      }

  window_ended_at = health_bucket_start(_window_ended_at or current_window_end)
  run, created = await _create_health_run(
    db,
    settings,
    now=evaluated_at,
    scheduled_for=window_ended_at,
  )
  run_id = run["id"]
  if not created:
    previous_summary = run.get("step_results")
    if isinstance(previous_summary, str):
      try:
        previous_summary = json.loads(previous_summary)
      except json.JSONDecodeError:
        previous_summary = {}
    previous_summary = previous_summary if isinstance(previous_summary, dict) else {}
    return {
      "status": "duplicate",
      "runId": str(run_id),
      "existingStatus": run.get("status"),
      "rolledBackCount": int(previous_summary.get("rolledBackCount") or 0),
      "blockedCount": int(previous_summary.get("blockedCount") or 0),
    }

  window_started_at = window_ended_at - timedelta(minutes=HEALTH_BUCKET_MINUTES)
  results: list[dict[str, Any]] = []
  try:
    published = await db.fetch(
      """
      select id,region_code from product_seasonal_collections
      where locale=$1 and status='published' and slug like 'trend-now-%'
      order by region_code
      """,
      locale,
    )
    health_rows = await db.fetch(
      """
      select region_code,sum(request_count)::bigint as request_count,
        sum(fallback_count)::bigint as fallback_count
      from seasonal_serving_health_buckets
      where locale=$1 and bucket_started_at>=$2 and bucket_started_at<$3
      group by region_code
      """,
      locale,
      window_started_at,
      window_ended_at,
    )
    counts = {
      str(row["region_code"]): (
        int(row.get("request_count") or 0),
        int(row.get("fallback_count") or 0),
      )
      for row in health_rows
    }
    for collection in published:
      region_code = normalize_trend_region_code(collection.get("region_code"))
      request_count, fallback_count = counts.get(region_code, (0, 0))
      result = await _evaluate_region(
        db,
        settings,
        run_id=run_id,
        collection_id=collection["id"],
        region_code=region_code,
        window_started_at=window_started_at,
        window_ended_at=window_ended_at,
        request_count=request_count,
        fallback_count=fallback_count,
        now=evaluated_at,
      )
      results.append(result)

    retention_days = int(
      getattr(settings, "product_trend_health_bucket_retention_days", DEFAULT_BUCKET_RETENTION_DAYS),
    )
    await db.execute(
      "delete from seasonal_serving_health_buckets where bucket_started_at<$1",
      window_ended_at - timedelta(days=retention_days),
    )
    digest = hashlib.sha256(
      json.dumps(results, sort_keys=True, default=str, ensure_ascii=False).encode(),
    ).hexdigest()
    status = "skipped" if not published else "succeeded"
    summary = {
      "windowStartedAt": window_started_at.isoformat(),
      "windowEndedAt": window_ended_at.isoformat(),
      "regions": results,
      "rolledBackCount": sum(row.get("status") == "rolledBack" for row in results),
      "blockedCount": sum(row.get("status") == "blocked" for row in results),
    }
    await db.execute(
      """
      update seasonal_pipeline_runs set status=$2,completed_at=$3,input_fingerprint=$4,
        step_results=$5::jsonb where id=$1
      """,
      run_id,
      status,
      evaluated_at,
      digest,
      json.dumps(summary, ensure_ascii=False),
    )
    if summary["rolledBackCount"]:
      from app.services.product_recommendations import clear_seasonal_recommendation_cache

      clear_seasonal_recommendation_cache()
    return {"status": status, "runId": str(run_id), **summary}
  except Exception as error:
    await db.execute(
      """
      update seasonal_pipeline_runs set status='failed',completed_at=$2,
        step_results=$3::jsonb,error_code=$4,error_message=$5 where id=$1
      """,
      run_id,
      evaluated_at,
      json.dumps({"regions": results}, ensure_ascii=False),
      getattr(error, "code", type(error).__name__)[:80],
      str(error)[:500],
    )
    raise
