import argparse
import asyncio
import json

import asyncpg

from app.core.settings import get_settings
from app.db.connection_config import DatabaseConfigurationError, connect_database
from app.db.init_db import SCHEMA_VERSION
from app.db.seed_db import SEED_VERSION


EXPECTED_TABLES = {
  "users",
  "media_assets",
  "photo_captures",
  "analysis_reports",
  "saved_makeup_styles",
  "products",
  "user_product_likes",
  "product_recommendation_runs",
  "ar_filters",
  "user_ar_filter_states",
  "filter_extraction_reports",
  "makeup_feedback_reports",
  "home_hero_banners",
  "home_notices",
  "home_trend_items",
  "home_filter_store_items",
  "home_recommended_looks",
  "user_consents",
  "data_deletion_requests",
  "audit_logs",
  "schema_migrations",
}


async def fetch_table_names(connection: asyncpg.Connection) -> set[str]:
  rows = await connection.fetch(
    """
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    """,
  )

  return {row["table_name"] for row in rows}


async def fetch_applied_versions(connection: asyncpg.Connection) -> set[str]:
  if "schema_migrations" not in await fetch_table_names(connection):
    return set()

  rows = await connection.fetch("select version from schema_migrations")

  return {row["version"] for row in rows}


def build_schema_report(
  table_names: set[str],
  applied_versions: set[str],
  require_seed: bool = False,
) -> dict[str, object]:
  expected_versions = {SCHEMA_VERSION}

  if require_seed:
    expected_versions.add(SEED_VERSION)

  missing_tables = sorted(EXPECTED_TABLES - table_names)
  missing_versions = sorted(expected_versions - applied_versions)

  return {
    "ok": not missing_tables and not missing_versions,
    "expectedTables": sorted(EXPECTED_TABLES),
    "missingTables": missing_tables,
    "appliedVersions": sorted(applied_versions),
    "missingVersions": missing_versions,
  }


async def check_schema(database_url: str | None = None, require_seed: bool = False) -> dict[str, object]:
  settings = get_settings()
  dsn = database_url or settings.database_url

  if dsn:
    connection = await asyncpg.connect(dsn=dsn)
  else:
    try:
      connection, _ = await connect_database(settings)
    except DatabaseConfigurationError as error:
      raise RuntimeError("DATABASE_URL or DATABASE_SECRET_ID is required to check the schema.") from error

  try:
    table_names = await fetch_table_names(connection)
    applied_versions = await fetch_applied_versions(connection)
  finally:
    await connection.close()

  return build_schema_report(table_names, applied_versions, require_seed=require_seed)


def format_schema_report(report: dict[str, object]) -> str:
  status = "ok" if report["ok"] else "failed"
  lines = [f"Schema check: {status}"]

  missing_tables = report["missingTables"]
  missing_versions = report["missingVersions"]

  if missing_tables:
    lines.append("Missing tables:")
    lines.extend(f"- {name}" for name in missing_tables)

  if missing_versions:
    lines.append("Missing migration markers:")
    lines.extend(f"- {version}" for version in missing_versions)

  if not missing_tables and not missing_versions:
    lines.append("All expected tables and migration markers are present.")

  return "\n".join(lines)


async def main() -> None:
  parser = argparse.ArgumentParser(description="Check backend PostgreSQL schema readiness.")
  parser.add_argument("--require-seed", action="store_true", help="Require the seed.sql marker too.")
  parser.add_argument("--json", action="store_true", help="Print the full report as JSON.")
  args = parser.parse_args()

  report = await check_schema(require_seed=args.require_seed)

  if args.json:
    print(json.dumps(report, indent=2))
  else:
    print(format_schema_report(report))

  if not report["ok"]:
    raise SystemExit(1)


if __name__ == "__main__":
  asyncio.run(main())
