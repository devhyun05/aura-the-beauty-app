from app.db.check_schema import EXPECTED_COLUMNS, EXPECTED_CONSTRAINTS, EXPECTED_TABLES, build_schema_report
from app.db.init_db import POST_SCHEMA_MIGRATIONS, SCHEMA_VERSION, get_schema_path
from app.db.seed_db import SEED_VERSION, get_seed_path


EXPECTED_SCHEMA_VERSIONS = {SCHEMA_VERSION, *POST_SCHEMA_MIGRATIONS}


def test_schema_path_exists() -> None:
  path = get_schema_path()

  assert path.name == "schema.sql"
  assert path.exists()
  assert SCHEMA_VERSION == "schema.sql:v5-external-product-likes"


def test_seed_path_exists() -> None:
  path = get_seed_path()

  assert path.name == "seed.sql"
  assert path.exists()
  assert SEED_VERSION == "seed.sql:v7"


def test_schema_report_passes_when_expected_tables_and_schema_marker_exist() -> None:
  report = build_schema_report(set(EXPECTED_TABLES), EXPECTED_SCHEMA_VERSIONS)

  assert report["ok"] is True
  assert report["missingTables"] == []
  assert report["missingVersions"] == []


def test_schema_report_can_require_seed_marker() -> None:
  report = build_schema_report(set(EXPECTED_TABLES), EXPECTED_SCHEMA_VERSIONS, require_seed=True)

  assert report["ok"] is False
  assert report["missingTables"] == []
  assert report["missingVersions"] == [SEED_VERSION]


def test_schema_report_lists_missing_tables_and_schema_marker() -> None:
  report = build_schema_report({"users"}, set())

  assert report["ok"] is False
  assert "media_assets" in report["missingTables"]
  assert report["missingVersions"] == sorted(EXPECTED_SCHEMA_VERSIONS)


def test_schema_report_lists_missing_embedding_columns() -> None:
  report = build_schema_report(
    set(EXPECTED_TABLES),
    EXPECTED_SCHEMA_VERSIONS,
    table_columns={
      **{table: set(columns) for table, columns in EXPECTED_COLUMNS.items()},
      "analysis_reports": set(),
    },
  )

  assert report["ok"] is False
  assert report["missingColumns"] == {"analysis_reports": ["embedding"]}


def test_schema_report_requires_external_product_event_identity_columns() -> None:
  columns = {table: set(values) for table, values in EXPECTED_COLUMNS.items()}
  columns["product_engagement_events"] = {"external_source"}
  report = build_schema_report(
    set(EXPECTED_TABLES),
    EXPECTED_SCHEMA_VERSIONS,
    table_columns=columns,
  )

  assert report["ok"] is False
  assert report["missingColumns"] == {"product_engagement_events": ["external_product_id"]}


def test_schema_report_lists_missing_product_shade_parent_constraint() -> None:
  constraints = {table: set(values) for table, values in EXPECTED_CONSTRAINTS.items()}
  constraints["product_offers"] = set()
  report = build_schema_report(
    set(EXPECTED_TABLES),
    EXPECTED_SCHEMA_VERSIONS,
    table_constraints=constraints,
  )

  assert report["ok"] is False
  assert report["missingConstraints"] == {
    "product_offers": ["fk_product_offers_shade_product"],
  }


def test_user_product_like_shade_parent_migration_is_registered() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:user-product-like-shade-parent-v1"]
  assert "fk_user_product_likes_shade_product" in migration_sql
  assert "foreign key (source_shade_id, product_id)" in migration_sql
  assert "not valid" in migration_sql


def test_product_event_shade_parent_migration_is_registered() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:product-event-shade-parent-v1"]
  assert "fk_product_engagement_shade_product" in migration_sql
  assert "foreign key (shade_id, product_id)" in migration_sql
  assert "not valid" in migration_sql


def test_product_brow_category_migration_is_registered() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:product-category-brow-v1"]
  assert "alter type product_category add value if not exists 'brow'" in migration_sql


def test_product_event_query_minimization_migration_removes_raw_query_context() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:product-event-query-minimization-v1"]
  normalized = " ".join(migration_sql.lower().split())
  assert "update product_engagement_events" in normalized
  assert "context = context - 'query'" in normalized
  assert "where context ? 'query'" in normalized


def test_external_catalog_event_identity_migration_is_registered() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:external-product-catalog-events-v1"]
  normalized = " ".join(migration_sql.lower().split())
  assert "add column if not exists external_source text" in normalized
  assert "add column if not exists external_product_id text" in normalized
  assert "'auradin_catalog'" in normalized
  assert "drop constraint if exists chk_product_engagement_source" in normalized
  assert "idx_product_engagement_external_product_type" in normalized


def test_legacy_auradin_seed_likes_migrate_to_packaged_catalog_identity() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS[
    "schema.sql:external-product-legacy-auradin-seed-likes-v1"
  ]
  normalized = " ".join(migration_sql.lower().split())
  assert "select user_id,'auradin_catalog',external_product_id" in normalized
  assert "external_source='auradin_search'" in normalized
  assert "external_product_id like 'auradin-seed-%'" in normalized
  assert "on conflict (user_id,external_source,external_product_id) do nothing" in normalized
  assert "delete from external_product_likes" in normalized


def test_existing_consulting_call_session_orphans_do_not_block_schema_upgrade() -> None:
  schema = get_schema_path().read_text(encoding="utf-8")
  constraint_sql = schema.split(
    "add constraint fk_consulting_call_sessions_booking",
    maxsplit=1,
  )[1].split(";", maxsplit=1)[0]
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:consulting-call-sessions-v1"]
  migration_constraint_sql = migration_sql.split(
    "add constraint fk_consulting_call_sessions_booking",
    maxsplit=1,
  )[1].split(";", maxsplit=1)[0]

  assert "not valid" in constraint_sql
  assert "not valid" in migration_constraint_sql


def test_product_operator_rbac_migration_is_idempotent_and_role_bounded() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:product-operator-rbac-v1"]
  assert "create table if not exists product_recommendation_operators" in migration_sql
  assert "catalog_admin" in migration_sql
  assert "seasonal_publisher" in migration_sql
  assert "references users(id) on delete cascade" in migration_sql

def test_schema_report_lists_missing_vector_extension() -> None:
  report = build_schema_report(
    set(EXPECTED_TABLES),
    EXPECTED_SCHEMA_VERSIONS,
    installed_extensions={"btree_gist", "pgcrypto", "citext", "pg_trgm"},
  )

  assert report["ok"] is False
  assert report["missingExtensions"] == ["vector"]


def test_schema_report_lists_missing_booking_overlap_extension() -> None:
  report = build_schema_report(
    set(EXPECTED_TABLES),
    EXPECTED_SCHEMA_VERSIONS,
    installed_extensions={"pgcrypto", "citext", "pg_trgm", "vector"},
  )

  assert report["ok"] is False
  assert report["missingExtensions"] == ["btree_gist"]


def test_pending_community_core_migration_is_registered() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:community-core-v1"]

  assert "create table if not exists community_threads" in migration_sql
  assert "create table if not exists community_events" in migration_sql
  assert "fk_community_threads_author" in migration_sql
  assert "idx_community_threads_category_created" in migration_sql
  assert "trg_community_threads_updated_at" in migration_sql


def test_media_upload_session_migration_enforces_principal_and_object_binding() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:media-upload-sessions-v1"]

  assert "chk_media_upload_sessions_principal" in migration_sql
  assert "uq_media_upload_sessions_bucket_key" in migration_sql
  assert "fk_media_upload_sessions_owner_user" in migration_sql
  assert "fk_media_upload_sessions_partner_account" in migration_sql
  assert "fk_media_upload_sessions_media_asset" in migration_sql
  assert "idx_media_upload_sessions_pending_expires" in migration_sql


def test_pending_embedding_migration_is_registered() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:community-embeddings-v1"]

  assert "create extension if not exists vector" in migration_sql
  assert "alter table community_threads add column if not exists embedding" in migration_sql
  assert "alter table analysis_reports add column if not exists embedding" in migration_sql

def test_pending_search_migration_is_registered() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:community-search-v1"]

  assert "create extension if not exists pg_trgm" in migration_sql
  assert "idx_community_threads_title_trgm" in migration_sql
  assert "idx_community_threads_body_trgm" in migration_sql


def test_pending_auradin_session_migration_is_registered() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:auradin-sessions-v1"]

  assert "create table if not exists auradin_search_sessions" in migration_sql
  assert "state jsonb not null" in migration_sql
  assert "expires_at timestamptz not null" in migration_sql
  assert "idx_auradin_search_sessions_expires_at" in migration_sql
