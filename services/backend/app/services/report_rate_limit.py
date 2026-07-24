from __future__ import annotations

from uuid import UUID

from app.core.errors import AppError
from app.core.settings import get_settings
from app.db.session import Database

# 비용이 발생하는 보고서/AI 생성 기능별 스코프.
REPORT_RATE_FEATURES = {
  "face_analysis",
  "filter_extraction",
  "makeup_feedback",
  "makeup_recommendation",
}

_MINUTE_SECONDS = 60
_DAY_SECONDS = 86400

# 서비스가 자기 테이블을 지연 생성한다(face_measurement_schema 패턴).
_TABLE_SQL = """
create table if not exists report_request_rate_limits (
  user_id uuid not null,
  scope text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, scope),
  constraint chk_report_request_rate_scope check (scope in (
    'face_analysis:1m','face_analysis:1d',
    'filter_extraction:1m','filter_extraction:1d',
    'makeup_feedback:1m','makeup_feedback:1d',
    'makeup_recommendation:1m','makeup_recommendation:1d'
  )),
  constraint chk_report_request_rate_count check (request_count >= 0)
)
"""

_table_ready = False


async def _ensure_table(db: Database) -> None:
  global _table_ready
  if _table_ready:
    return
  await db.execute(_TABLE_SQL)
  _table_ready = True


async def _enforce_window(
  db: Database,
  *,
  user_id: UUID,
  scope: str,
  limit: int,
  window_seconds: int,
  feature: str,
) -> None:
  row = await db.fetchrow(
    """
    insert into report_request_rate_limits (user_id,scope,window_started_at,request_count)
    values ($1,$2,now(),1)
    on conflict (user_id,scope) do update set
      window_started_at=case
        when report_request_rate_limits.window_started_at <= now()-($3::int * interval '1 second')
        then now() else report_request_rate_limits.window_started_at end,
      request_count=case
        when report_request_rate_limits.window_started_at <= now()-($3::int * interval '1 second')
        then 1 else report_request_rate_limits.request_count+1 end
    returning request_count,
      greatest(0,ceil(extract(epoch from (window_started_at+($3::int * interval '1 second')-now()))))::int as retry_after
    """,
    user_id,
    scope,
    window_seconds,
  )
  if int((row or {}).get("request_count") or 0) > limit:
    retry_after = int((row or {}).get("retry_after") or window_seconds)
    raise AppError(
      429,
      "REPORT_RATE_LIMITED",
      "요청이 많아 잠시 쉬어가요. 잠시 후 다시 시도해 주세요.",
      {
        "feature": feature,
        "retryAfterSeconds": retry_after,
        "window": "day" if window_seconds >= _DAY_SECONDS else "minute",
      },
    )


async def enforce_report_generation_limit(
  db: Database,
  *,
  user_id: UUID,
  feature: str,
  per_minute: int,
  per_day: int,
  enabled: bool | None = None,
) -> None:
  """비용이 나가는 생성 요청에 사용자별 분당·일일 한도를 함께 건다.

  분당 한도는 스팸/루프 방지, 일일 한도는 비용 상한이다. 조회·폴링 GET에는
  걸지 않는다(생성 POST 전용).
  """
  if feature not in REPORT_RATE_FEATURES:
    raise ValueError(f"Unsupported report rate-limit feature: {feature}")

  if enabled is None:
    enabled = get_settings().user_feature_usage_limits_enabled
  if not enabled:
    return

  await _ensure_table(db)
  await _enforce_window(
    db,
    user_id=user_id,
    scope=f"{feature}:1m",
    limit=per_minute,
    window_seconds=_MINUTE_SECONDS,
    feature=feature,
  )
  await _enforce_window(
    db,
    user_id=user_id,
    scope=f"{feature}:1d",
    limit=per_day,
    window_seconds=_DAY_SECONDS,
    feature=feature,
  )
