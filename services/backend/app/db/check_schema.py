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
  "product_recommendation_operators",
  "products",
  "user_product_likes",
  "external_product_likes",
  "auradin_search_sessions",
  "product_recommendation_runs",
  "product_shades",
  "product_assets",
  "product_offers",
  "product_seasonal_collections",
  "product_seasonal_collection_items",
  "product_catalog_imports",
  "product_engagement_events",
  "product_preference_profiles",
  "product_request_rate_limits",
  "product_color_cohort_memberships",
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

EXPECTED_CONSTRAINTS = {
  "product_recommendation_operators": {
    "fk_product_recommendation_operator_user",
    "fk_product_recommendation_operator_granted_by",
  },
  "user_product_likes": {"fk_user_product_likes_shade_product"},
  "product_shades": {"uq_product_shades_id_product"},
  "product_assets": {"fk_product_assets_shade_product"},
  "product_offers": {"fk_product_offers_shade_product"},
  "product_seasonal_collection_items": {"fk_product_seasonal_items_shade_product"},
  "product_engagement_events": {"fk_product_engagement_shade_product"},
}

EXPECTED_COLUMNS = {
  "analysis_reports": {"embedding"},
  "community_threads": {"embedding"},
  "auradin_search_sessions": {"state", "expires_at"},
  "media_upload_sessions": {"media_asset_id", "owner_user_id", "partner_account_id"},
  "saved_makeup_styles": {"client_request_id", "style_payload", "archived_at"},
  "products": {"catalog_status", "catalog_version", "license_status", "allowed_uses"},
  "product_recommendation_operators": {"roles", "is_active", "granted_by"},
  "user_product_likes": {"source_shade_id"},
  "external_product_likes": {"external_source", "external_product_id", "purchase_url", "liked_at"},
  "product_recommendation_runs": {"source_style_id", "strategy", "algorithm_version", "expires_at"},
  "user_consents": {"recorded_at"},
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
async def fetch_extensions(connection: asyncpg.Connection) -> set[str]:
  rows = await connection.fetch("select extname from pg_extension")
  return {row["extname"] for row in rows}

async def fetch_table_constraints(connection: asyncpg.Connection) -> dict[str, set[str]]:
  rows = await connection.fetch(
    """
    select relation.relname as table_name, constraint_row.conname as constraint_name
    from pg_constraint constraint_row
    join pg_class relation on relation.oid=constraint_row.conrelid
    join pg_namespace namespace_row on namespace_row.oid=relation.relnamespace
    where namespace_row.nspname='public'
    """,
  )
  constraints: dict[str, set[str]] = {}
  for row in rows:
    constraints.setdefault(row["table_name"], set()).add(row["constraint_name"])
  return constraints

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
  table_constraints: dict[str, set[str]] | None = None,
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
  missing_constraints = {}
  if table_constraints is not None:
    missing_constraints = {
      table: sorted(constraints - table_constraints.get(table, set()))
      for table, constraints in EXPECTED_CONSTRAINTS.items()
      if constraints - table_constraints.get(table, set())
    }

  return {
    "ok": not missing_tables and not missing_versions and not missing_columns and not missing_extensions and not missing_constraints,
    "expectedTables": sorted(EXPECTED_TABLES),
    "missingTables": missing_tables,
    "expectedExtensions": sorted(EXPECTED_EXTENSIONS),
    "missingExtensions": missing_extensions,
    "expectedColumns": {table: sorted(columns) for table, columns in EXPECTED_COLUMNS.items()},
    "missingColumns": missing_columns,
    "expectedConstraints": {table: sorted(constraints) for table, constraints in EXPECTED_CONSTRAINTS.items()},
    "missingConstraints": missing_constraints,
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
    installed_extensions = await fetch_extensions(connection)
    table_constraints = await fetch_table_constraints(connection)
    applied_versions = await fetch_applied_versions(connection)
  finally:
    await connection.close()

  return build_schema_report(
    table_names,
    applied_versions,
    require_seed=require_seed,
    table_columns=table_columns,
    installed_extensions=installed_extensions,
    table_constraints=table_constraints,
  )


def format_schema_report(report: dict[str, object]) -> str:
  status = "ok" if report["ok"] else "failed"
  lines = [f"Schema check: {status}"]

  missing_tables = report["missingTables"]
  missing_extensions = report["missingExtensions"]
  missing_columns = report["missingColumns"]
  missing_versions = report["missingVersions"]
  missing_constraints = report["missingConstraints"]

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

  if missing_constraints:
    lines.append("Missing constraints:")
    for table, constraints in missing_constraints.items():
      lines.extend(f"- {table}.{constraint}" for constraint in constraints)

  if not missing_tables and not missing_versions and not missing_columns and not missing_extensions and not missing_constraints:
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
