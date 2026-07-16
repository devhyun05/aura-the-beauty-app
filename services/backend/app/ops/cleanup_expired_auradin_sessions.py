from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.auradin_agent.session_manager import ensure_postgres_session_table


@dataclass(frozen=True)
class ExpiredAuradinSessionCleanupResult:
  session_ids: tuple[str, ...]

  @property
  def total(self) -> int:
    return len(self.session_ids)


def _session_ids(rows: list[dict[str, Any]]) -> tuple[str, ...]:
  return tuple(str(row["session_id"]) for row in rows)


async def find_expired_auradin_sessions(
  db: Any,
  *,
  limit: int = 500,
) -> ExpiredAuradinSessionCleanupResult:
  # A9: idempotency retention이 살아 있는 행은 세션 TTL이 지나도 보존한다 —
  # 같은 clientRequestId 재전송의 410 귀속(tombstone)이 이 행에 의존한다.
  await ensure_postgres_session_table(db)
  rows = await db.fetch(
    """
    select session_id
    from auradin_search_sessions
    where expires_at < now()
      and (idempotency_expires_at is null or idempotency_expires_at < now())
    order by expires_at
    limit $1
    """,
    max(1, int(limit)),
  )
  return ExpiredAuradinSessionCleanupResult(session_ids=_session_ids(rows))


async def cleanup_expired_auradin_sessions(
  db: Any,
  *,
  limit: int = 500,
) -> ExpiredAuradinSessionCleanupResult:
  await ensure_postgres_session_table(db)
  rows = await db.fetch(
    """
    with expired as (
      select session_id
      from auradin_search_sessions
      where expires_at < now()
        and (idempotency_expires_at is null or idempotency_expires_at < now())
      order by expires_at
      limit $1
      for update skip locked
    )
    delete from auradin_search_sessions as sessions
    using expired
    where sessions.session_id = expired.session_id
    returning sessions.session_id
    """,
    max(1, int(limit)),
  )
  return ExpiredAuradinSessionCleanupResult(session_ids=_session_ids(rows))


def print_expired_auradin_session_result(
  result: ExpiredAuradinSessionCleanupResult,
  *,
  dry_run: bool,
) -> None:
  mode = "dry-run" if dry_run else "execute"
  print(f"[aura:auradin-session-cleanup] mode={mode} expired={result.total}")
