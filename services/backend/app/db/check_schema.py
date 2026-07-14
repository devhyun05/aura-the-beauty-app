import argparse
import asyncio
import json

import asyncpg

from app.core.settings import get_settings
from app.db.connection_config import DatabaseConfigurationError, connect_database
from app.db.init_db import POST_SCHEMA_MIGRATIONS, SCHEMA_VERSION
from app.db.seed_db import SEED_VERSION


EXPECTED_TABLES = {
  "users",
  "media_assets",
  "media_upload_sessions",
  "photo_captures",
  "analysis_reports",
  "saved_makeup_styles",
  "products",
  "user_product_likes",
  "auradin_search_sessions",
  "product_recommendation_runs",
  "ar_filters",
  "user_ar_filter_states",
  "filter_extraction_reports",
  "makeup_feedback_reports",
  "community_threads",
  "community_thread_media",
  "community_replies",
  "community_thread_likes",
  "community_thread_saves",
  "community_reply_likes",
  "community_reports",
  "community_events",
  "consulting_categories",
  "consulting_experts",
  "consulting_expert_categories",
  "consulting_expert_durations",
  "consulting_expert_career",
  "consulting_expert_reviews",
  "consulting_bookings",
  "consulting_summaries",
  "consulting_membership_plans",
  "user_consulting_memberships",
  "consulting_payments",
  "home_hero_banners",
  "home_notices",
  "home_trend_items",
  "home_filter_store_items",
  "home_recommended_looks",
  "user_consents",
  "data_deletion_requests",
  "account_deletion_tombstones",
  "audit_logs",
  "schema_migrations",
}

EXPECTED_EXTENSIONS = {"btree_gist", "pg_trgm", "vector"}

EXPECTED_COLUMNS = {
  "analysis_reports": {"embedding"},
  "community_threads": {"embedding"},
  "auradin_search_sessions": {
    "state",
    "expires_at",
    # A9 v2 (schema.sql:auradin-sessions-v2) — 멱등성·CAS 컬럼
    "owner_subject",
    "version",
    "client_request_id",
    "request_fingerprint",
    "idempotency_expires_at",
  },
  "media_upload_sessions": {"media_asset_id", "owner_user_id", "partner_account_id"},
}

EXPECTED_COLUMN_CONTRACTS = {
  "auradin_search_sessions.owner_subject": {"is_nullable": "NO"},
  "auradin_search_sessions.version": {"is_nullable": "NO", "default_contains": "0"},
}

EXPECTED_CONSTRAINT_CONTRACTS = {
  "chk_auradin_sessions_idempotency_fields": (
    "(client_request_id is null) = (request_fingerprint is null)",
    "(client_request_id is null) = (idempotency_expires_at is null)",
    " and ",
  ),
}

EXPECTED_INDEX_CONTRACTS = {
  "idx_auradin_search_sessions_expires_at": ("expires_at",),
  "uq_auradin_sessions_owner_client_request": (
    "unique",
    "owner_subject",
    "client_request_id",
    "where (client_request_id is not null)",
  ),
  "idx_auradin_sessions_idempotency_expires": (
    "idempotency_expires_at",
    "where (idempotency_expires_at is not null)",
  ),
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

async def fetch_table_columns(connection: asyncpg.Connection) -> dict[str, set[str]]:
  rows = await connection.fetch(
    """
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
    """,
  )

  columns: dict[str, set[str]] = {}
  for row in rows:
    columns.setdefault(row["table_name"], set()).add(row["column_name"])
  return columns


async def fetch_column_contracts(connection: asyncpg.Connection) -> dict[str, dict[str, str | None]]:
  rows = await connection.fetch(
    """
    select table_name, column_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public'
    """,
  )
  return {
    f"{row['table_name']}.{row['column_name']}": {
      "is_nullable": row["is_nullable"],
      "column_default": row["column_default"],
    }
    for row in rows
  }


async def fetch_constraints(connection: asyncpg.Connection) -> dict[str, str]:
  rows = await connection.fetch(
    """
    select conname, pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'public.auradin_search_sessions'::regclass
    """,
  )
  return {str(row["conname"]): str(row["definition"]).lower() for row in rows}


async def fetch_indexes(connection: asyncpg.Connection) -> dict[str, str]:
  rows = await connection.fetch(
    """
    select indexname, indexdef
    from pg_indexes
    where schemaname = 'public'
    """,
  )
  return {str(row["indexname"]): str(row["indexdef"]).lower() for row in rows}


async def fetch_extensions(connection: asyncpg.Connection) -> set[str]:
  rows = await connection.fetch("select extname from pg_extension")
  return {row["extname"] for row in rows}

async def fetch_applied_versions(connection: asyncpg.Connection) -> set[str]:
  if "schema_migrations" not in await fetch_table_names(connection):
    return set()

  rows = await connection.fetch("select version from schema_migrations")

  return {row["version"] for row in rows}


def build_schema_report(
  table_names: set[str],
  applied_versions: set[str],
  require_seed: bool = False,
  table_columns: dict[str, set[str]] | None = None,
  installed_extensions: set[str] | None = None,
  column_contracts: dict[str, dict[str, str | None]] | None = None,
  constraints: set[str] | dict[str, str] | None = None,
  indexes: dict[str, str] | None = None,
) -> dict[str, object]:
  expected_versions = {SCHEMA_VERSION, *POST_SCHEMA_MIGRATIONS}

  if require_seed:
    expected_versions.add(SEED_VERSION)

  missing_tables = sorted(EXPECTED_TABLES - table_names)
  missing_versions = sorted(expected_versions - applied_versions)
  missing_extensions = []
  if installed_extensions is not None:
    missing_extensions = sorted(EXPECTED_EXTENSIONS - installed_extensions)
  missing_columns = {}
  if table_columns is not None:
    missing_columns = {
      table: sorted(columns - table_columns.get(table, set()))
      for table, columns in EXPECTED_COLUMNS.items()
      if columns - table_columns.get(table, set())
    }
  invalid_column_contracts = []
  if column_contracts is not None:
    for column, expected in EXPECTED_COLUMN_CONTRACTS.items():
      actual = column_contracts.get(column, {})
      nullable = expected.get("is_nullable")
      default_contains = expected.get("default_contains")
      if nullable and actual.get("is_nullable") != nullable:
        invalid_column_contracts.append(f"{column}.nullability")
      if default_contains and default_contains not in str(actual.get("column_default") or ""):
        invalid_column_contracts.append(f"{column}.default")
  missing_constraints = []
  invalid_constraints = []
  if constraints is not None:
    constraint_names = set(constraints)
    missing_constraints = sorted(set(EXPECTED_CONSTRAINT_CONTRACTS) - constraint_names)
    if isinstance(constraints, dict):
      for name, fragments in EXPECTED_CONSTRAINT_CONTRACTS.items():
        definition = constraints.get(name, "")
        if definition and any(fragment not in definition for fragment in fragments):
          invalid_constraints.append(name)
  invalid_indexes = []
  if indexes is not None:
    for name, fragments in EXPECTED_INDEX_CONTRACTS.items():
      definition = indexes.get(name, "")
      if not definition or any(fragment not in definition for fragment in fragments):
        invalid_indexes.append(name)

  return {
    "ok": not any((
      missing_tables,
      missing_versions,
      missing_columns,
      missing_extensions,
      invalid_column_contracts,
      missing_constraints,
      invalid_constraints,
      invalid_indexes,
    )),
    "expectedTables": sorted(EXPECTED_TABLES),
    "missingTables": missing_tables,
    "expectedExtensions": sorted(EXPECTED_EXTENSIONS),
    "missingExtensions": missing_extensions,
    "expectedColumns": {table: sorted(columns) for table, columns in EXPECTED_COLUMNS.items()},
    "missingColumns": missing_columns,
    "invalidColumnContracts": sorted(invalid_column_contracts),
    "missingConstraints": missing_constraints,
    "invalidConstraints": sorted(invalid_constraints),
    "invalidIndexes": sorted(invalid_indexes),
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
    table_columns = await fetch_table_columns(connection)
    column_contracts = await fetch_column_contracts(connection)
    constraints = await fetch_constraints(connection)
    indexes = await fetch_indexes(connection)
    installed_extensions = await fetch_extensions(connection)
    applied_versions = await fetch_applied_versions(connection)
  finally:
    await connection.close()

  return build_schema_report(
    table_names,
    applied_versions,
    require_seed=require_seed,
    table_columns=table_columns,
    installed_extensions=installed_extensions,
    column_contracts=column_contracts,
    constraints=constraints,
    indexes=indexes,
  )


def format_schema_report(report: dict[str, object]) -> str:
  status = "ok" if report["ok"] else "failed"
  lines = [f"Schema check: {status}"]

  missing_tables = report["missingTables"]
  missing_extensions = report["missingExtensions"]
  missing_columns = report["missingColumns"]
  invalid_column_contracts = report["invalidColumnContracts"]
  missing_constraints = report["missingConstraints"]
  invalid_indexes = report["invalidIndexes"]
  invalid_constraints = report["invalidConstraints"]
  missing_versions = report["missingVersions"]

  if missing_tables:
    lines.append("Missing tables:")
    lines.extend(f"- {name}" for name in missing_tables)

  if missing_extensions:
    lines.append("Missing extensions:")
    lines.extend(f"- {name}" for name in missing_extensions)

  if missing_columns:
    lines.append("Missing columns:")
    for table, columns in missing_columns.items():
      lines.extend(f"- {table}.{column}" for column in columns)

  if missing_versions:
    lines.append("Missing migration markers:")
    lines.extend(f"- {version}" for version in missing_versions)

  if invalid_column_contracts:
    lines.append("Invalid column contracts:")
    lines.extend(f"- {name}" for name in invalid_column_contracts)

  if missing_constraints:
    lines.append("Missing constraints:")
    lines.extend(f"- {name}" for name in missing_constraints)

  if invalid_constraints:
    lines.append("Invalid constraints:")
    lines.extend(f"- {name}" for name in invalid_constraints)

  if invalid_indexes:
    lines.append("Missing or invalid indexes:")
    lines.extend(f"- {name}" for name in invalid_indexes)

  if not any((
    missing_tables,
    missing_versions,
    missing_columns,
    missing_extensions,
    invalid_column_contracts,
    missing_constraints,
    invalid_constraints,
    invalid_indexes,
  )):
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
