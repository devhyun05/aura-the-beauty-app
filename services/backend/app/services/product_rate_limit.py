from __future__ import annotations

from uuid import UUID

from app.core.errors import AppError
from app.db.session import Database


PRODUCT_RATE_SCOPES = {"recommendation", "search", "like", "event", "detail", "outbound", "privacy"}


async def enforce_product_rate_limit(
  db: Database,
  *,
  user_id: UUID,
  scope: str,
  limit: int,
  window_seconds: int = 60,
) -> None:
  if scope not in PRODUCT_RATE_SCOPES:
    raise ValueError("Unsupported product rate-limit scope.")
  row = await db.fetchrow(
    """
    insert into product_request_rate_limits (user_id,scope,window_started_at,request_count)
    values ($1,$2,now(),1)
    on conflict (user_id,scope) do update set
      window_started_at=case
        when product_request_rate_limits.window_started_at <= now()-($3::int * interval '1 second')
        then now() else product_request_rate_limits.window_started_at end,
      request_count=case
        when product_request_rate_limits.window_started_at <= now()-($3::int * interval '1 second')
        then 1 else product_request_rate_limits.request_count+1 end
    returning request_count,
      greatest(0,ceil(extract(epoch from (window_started_at+($3::int * interval '1 second')-now()))))::int as retry_after
    """,
    user_id,
    scope,
    window_seconds,
  )
  if int((row or {}).get("request_count") or 0) > limit:
    raise AppError(
      429,
      "PRODUCT_RATE_LIMITED",
      "Too many product requests. Please try again shortly.",
      {"scope": scope, "retryAfterSeconds": int((row or {}).get("retry_after") or window_seconds)},
    )
