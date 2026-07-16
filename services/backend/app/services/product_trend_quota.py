"""Atomic call quotas for batch-only trend integrations.

External providers are never called from mobile request handlers.  Batch jobs
must inject a durable ledger in production; AI calls deliberately fail closed
when a ledger cannot prove that the daily/monthly reservation succeeded.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
import logging
from typing import Protocol

import asyncpg

from app.db.session import Database


logger = logging.getLogger(__name__)


class TrendCallQuotaLedger(Protocol):
  async def reserve(
    self,
    provider: str,
    *,
    at: datetime,
    daily_limit: int | None = None,
    monthly_limit: int | None = None,
    amount: int = 1,
  ) -> bool: ...


def _period_starts(at: datetime) -> tuple[datetime, datetime]:
  current = at if at.tzinfo else at.replace(tzinfo=timezone.utc)
  current = current.astimezone(timezone.utc)
  return (
    current.replace(hour=0, minute=0, second=0, microsecond=0),
    current.replace(day=1, hour=0, minute=0, second=0, microsecond=0),
  )


@dataclass
class InMemoryTrendCallQuotaLedger:
  """Deterministic local/test ledger; production should use PostgreSQL."""

  _counts: dict[tuple[str, str, datetime], int] = field(default_factory=dict)
  _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

  async def reserve(
    self,
    provider: str,
    *,
    at: datetime,
    daily_limit: int | None = None,
    monthly_limit: int | None = None,
    amount: int = 1,
  ) -> bool:
    provider = provider.strip().casefold()
    if not provider or amount <= 0:
      return False
    day_start, month_start = _period_starts(at)
    requested = []
    if daily_limit is not None:
      requested.append(("day", day_start, daily_limit))
    if monthly_limit is not None:
      requested.append(("month", month_start, monthly_limit))
    if not requested or any(limit <= 0 for _, _, limit in requested):
      return False
    async with self._lock:
      if any(self._counts.get((provider, kind, start), 0) + amount > limit for kind, start, limit in requested):
        return False
      for kind, start, _ in requested:
        key = (provider, kind, start)
        self._counts[key] = self._counts.get(key, 0) + amount
    return True


class PostgresTrendCallQuotaLedger:
  """Distributed quota ledger backed by ``trend_external_call_quotas``.

  Missing schema is treated as quota denial.  This keeps a partially deployed
  batch from creating unbounded external/Bedrock spend.
  """

  def __init__(self, db: Database) -> None:
    self.db = db

  async def reserve(
    self,
    provider: str,
    *,
    at: datetime,
    daily_limit: int | None = None,
    monthly_limit: int | None = None,
    amount: int = 1,
  ) -> bool:
    provider = provider.strip().casefold()
    if not provider or amount <= 0 or not self.db.is_connected:
      return False
    day_start, month_start = _period_starts(at)
    periods: list[tuple[str, datetime, int]] = []
    if daily_limit is not None:
      periods.append(("day", day_start, daily_limit))
    if monthly_limit is not None:
      periods.append(("month", month_start, monthly_limit))
    if not periods or any(limit <= 0 for _, _, limit in periods):
      return False

    async def operation(connection: asyncpg.Connection) -> bool:
      await connection.execute(
        "select pg_advisory_xact_lock(hashtextextended($1,0))",
        f"trend-call-quota:{provider}",
      )
      for kind, period_start, limit in periods:
        count = await connection.fetchval(
          """select call_count from trend_external_call_quotas
          where provider=$1 and period_start=$2 and period_kind=$3""",
          provider,
          period_start,
          kind,
        )
        if int(count or 0) + amount > limit:
          return False
      for kind, period_start, _ in periods:
        await connection.execute(
          """insert into trend_external_call_quotas (
            provider,period_start,period_kind,call_count,updated_at
          ) values ($1,$2,$3,$4,now())
          on conflict (provider,period_start,period_kind) do update
          set call_count=trend_external_call_quotas.call_count+$4,updated_at=now()""",
          provider,
          period_start,
          kind,
          amount,
        )
      return True

    try:
      return await self.db.run_in_transaction(operation)
    except Exception:  # noqa: BLE001 - quota storage failure must deny external spend.
      logger.warning("Trend call quota is unavailable; denying provider=%s", provider, exc_info=True)
      return False
