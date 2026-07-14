from app.db.check_schema import EXPECTED_TABLES, build_schema_report
from app.db.init_db import POST_SCHEMA_MIGRATIONS, SCHEMA_VERSION, get_schema_path
from app.db.seed_db import SEED_VERSION, get_seed_path


EXPECTED_SCHEMA_VERSIONS = {SCHEMA_VERSION, *POST_SCHEMA_MIGRATIONS}


def test_schema_path_exists() -> None:
  path = get_schema_path()

  assert path.name == "schema.sql"
  assert path.exists()
  assert SCHEMA_VERSION == "schema.sql:v3"


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
      "analysis_reports": set(),
      "community_threads": {"embedding"},
      "auradin_search_sessions": {"state", "expires_at"},
      "media_upload_sessions": {"media_asset_id", "owner_user_id", "partner_account_id"},
      "makeup_recommendation_reports": {
        "recommendation",
        "image_status",
        "image_url",
        "recommendation_model_id",
        "parent_report_id",
        "refinement_type",
      },
    },
  )

  assert report["ok"] is False
  assert report["missingColumns"] == {"analysis_reports": ["embedding"]}

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
