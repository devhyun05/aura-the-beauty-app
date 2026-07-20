"""Entry point: sync the active Auradin catalog snapshot into the DB mirror.

Runs standalone (``python -m app.db.sync_auradin_catalog``) — used by the deploy
CI one-off task after ``init_db``/``check_schema``, and runnable locally with a
DATABASE_URL. Uses the same raw-asyncpg bootstrap as ``app.db.init_db`` (no
FastAPI lifespan, so the pooled ``Database`` singleton is intentionally NOT used).
"""

from __future__ import annotations

import argparse
import asyncio
import json

import asyncpg

from app.core.settings import get_settings
from app.db.connection_config import DatabaseConfigurationError, connect_database
from app.services.auradin_catalog.db_sync import (
  rollback_to,
  sync_active_snapshot,
  verify_active_snapshot,
)


async def _connect() -> asyncpg.Connection:
  settings = get_settings()
  if settings.database_url:
    return await asyncpg.connect(dsn=settings.database_url)
  try:
    connection, _ = await connect_database(settings)
  except DatabaseConfigurationError as error:
    raise RuntimeError(
      "DATABASE_URL or DATABASE_SECRET_ID is required to sync the Auradin catalog."
    ) from error
  return connection


async def run(args: argparse.Namespace) -> dict:
  connection = await _connect()
  try:
    if args.rollback_to:
      return await rollback_to(connection, args.rollback_to)
    if args.verify_only:
      return await verify_active_snapshot(connection)
    return await sync_active_snapshot(connection, mark_active=not args.no_activate)
  finally:
    await connection.close()


async def main() -> None:
  parser = argparse.ArgumentParser(
    description="Sync the active Auradin catalog snapshot into the Postgres mirror."
  )
  parser.add_argument(
    "--verify-only",
    action="store_true",
    help="Compare the DB active snapshot against the local JSONL; make no changes.",
  )
  parser.add_argument(
    "--no-activate",
    action="store_true",
    help="Upload rows but do not flip this snapshot to active.",
  )
  parser.add_argument(
    "--rollback-to",
    metavar="SNAPSHOT_ID",
    help="Re-activate a previously synced snapshot (e.g. snapshot_20260717).",
  )
  args = parser.parse_args()
  result = await run(args)
  print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
  if args.verify_only and not result.get("ok", True):
    raise SystemExit(1)


if __name__ == "__main__":
  asyncio.run(main())
