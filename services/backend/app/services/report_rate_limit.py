from __future__ import annotations

from uuid import UUID

from app.db.session import Database


async def enforce_report_generation_limit(
  db: Database,
  *,
  user_id: UUID,
  feature: str,
  per_minute: int,
  per_day: int,
) -> None:
  """Keep the legacy call contract while report generation is unlimited.

  Report creation used to update ``report_request_rate_limits`` and reject
  requests with ``REPORT_RATE_LIMITED``. Generation is now intentionally
  unlimited across face analysis, extraction, feedback, and recommendation,
  so this compatibility hook must not read or mutate rate-limit state.
  """
  del db, user_id, feature, per_minute, per_day
