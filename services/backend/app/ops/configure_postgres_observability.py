from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass
from typing import Any

from app.db.connection_config import connect_database


@dataclass(frozen=True)
class PostgresObservabilityStatus:
  extension_name: str
  extension_version: str
  shared_preload_libraries: str
  track_io_timing: str
  tracked_statement_count: int


async def configure_postgres_observability(db: Any) -> PostgresObservabilityStatus:
  await db.execute("create extension if not exists pg_stat_statements")
  row = await db.fetchrow(
    """
    select
      extname,
      extversion,
      current_setting('shared_preload_libraries') as shared_preload_libraries,
      current_setting('track_io_timing') as track_io_timing,
      (select count(*) from pg_stat_statements) as tracked_statement_count
    from pg_extension
    where extname = 'pg_stat_statements'
    """,
  )
  if row is None:
    raise RuntimeError("pg_stat_statements was not installed.")

  return PostgresObservabilityStatus(
    extension_name=str(row["extname"]),
    extension_version=str(row["extversion"]),
    shared_preload_libraries=str(row["shared_preload_libraries"]),
    track_io_timing=str(row["track_io_timing"]),
    tracked_statement_count=int(row["tracked_statement_count"]),
  )


async def run() -> int:
  db, _ = await connect_database()
  try:
    status = await configure_postgres_observability(db)
    print(
      "[aura:postgres-observability] "
      + json.dumps(asdict(status), ensure_ascii=True, sort_keys=True),
    )
    return 0
  finally:
    await db.close()


def main() -> None:
  raise SystemExit(asyncio.run(run()))


if __name__ == "__main__":
  main()
