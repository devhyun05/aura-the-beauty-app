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


async def find_expired_auradin_sessions(db: Any) -> ExpiredAuradinSessionCleanupResult:
  await ensure_postgres_session_table(db)
  rows = await db.fetch(
    """
    select session_id
    from auradin_search_sessions
    where expires_at < now()
    order by expires_at
    """,
  )
  return ExpiredAuradinSessionCleanupResult(session_ids=_session_ids(rows))


async def cleanup_expired_auradin_sessions(db: Any) -> ExpiredAuradinSessionCleanupResult:
  await ensure_postgres_session_table(db)
  rows = await db.fetch(
    """
    delete from auradin_search_sessions
    where expires_at < now()
    returning session_id
    """,
  )
  return ExpiredAuradinSessionCleanupResult(session_ids=_session_ids(rows))


def print_expired_auradin_session_result(
  result: ExpiredAuradinSessionCleanupResult,
  *,
  dry_run: bool,
) -> None:
  mode = "dry-run" if dry_run else "execute"
  print(f"[aura:auradin-session-cleanup] mode={mode} expired={result.total}")
