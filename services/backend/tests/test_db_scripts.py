from app.db.check_schema import (
  EXPECTED_COLUMN_CONTRACTS,
  EXPECTED_COLUMNS,
  EXPECTED_CONSTRAINT_CONTRACTS,
  EXPECTED_CONSTRAINTS,
  EXPECTED_ENUM_VALUES,
  EXPECTED_INDEX_CONTRACTS,
  EXPECTED_TABLES,
  EXPECTED_TRIGGER_CONTRACTS,
  build_schema_report,
)
from app.db.init_db import POST_SCHEMA_MIGRATIONS, SCHEMA_VERSION, get_schema_path
from app.db.seed_db import SEED_VERSION, get_seed_path


EXPECTED_SCHEMA_VERSIONS = {SCHEMA_VERSION, *POST_SCHEMA_MIGRATIONS}


def _valid_column_contracts() -> dict[str, dict[str, str | None]]:
  return {
    column: {
      "is_nullable": expected.get("is_nullable"),
      "column_default": expected.get("default_contains"),
    }
    for column, expected in EXPECTED_COLUMN_CONTRACTS.items()
  }


def _valid_index_contracts() -> dict[str, str]:
  return {
    name: " ".join(fragments)
    for name, fragments in EXPECTED_INDEX_CONTRACTS.items()
  }


def test_schema_path_exists() -> None:
  path = get_schema_path()

  assert path.name == "schema.sql"
  assert path.exists()
  assert SCHEMA_VERSION == "schema.sql:v8-makeup-journey"


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
  assert report["missingColumns"] == {
    "analysis_reports": [
      "deleted_at",
      "embedding",
      "golden_mask_media_id",
      "golden_mask_metadata",
    ],
  }


def test_schema_report_validates_auradin_v2_constraints_and_partial_indexes() -> None:
  report = build_schema_report(
    set(EXPECTED_TABLES),
    EXPECTED_SCHEMA_VERSIONS,
    column_contracts={
      **_valid_column_contracts(),
      "auradin_search_sessions.owner_subject": {"is_nullable": "YES", "column_default": None},
      "auradin_search_sessions.version": {"is_nullable": "NO", "column_default": None},
      # A5 auradin_events 계약 컬럼은 유효값으로 채워 세션 계약 위반만 검출한다.
      "auradin_events.client_event_id": {"is_nullable": "NO", "column_default": None},
      "auradin_events.owner_subject": {"is_nullable": "NO", "column_default": None},
      "auradin_events.event_type": {"is_nullable": "NO", "column_default": None},
      "auradin_events.schema_version": {"is_nullable": "NO", "column_default": "1"},
      "auradin_events.data_manifest_id": {"is_nullable": "NO", "column_default": None},
      "auradin_events.release_manifest_id": {"is_nullable": "NO", "column_default": None},
      "auradin_events.occurred_at": {"is_nullable": "NO", "column_default": None},
      "auradin_events.received_at": {"is_nullable": "NO", "column_default": "now()"},
    },
    constraints=set(),
    indexes={
      **_valid_index_contracts(),
      "idx_auradin_sessions_idempotency_expires": "",
      "idx_auradin_events_owner_time": "",
      "idx_auradin_events_session": "",
      "idx_auradin_events_manifest": "",
      "idx_auradin_events_received": "",
      "idx_auradin_search_sessions_expires_at": "create index on auradin_search_sessions (expires_at)",
      "uq_auradin_sessions_owner_client_request": (
        "create unique index on auradin_search_sessions (owner_subject, client_request_id)"
      ),
    },
  )

  assert report["ok"] is False
  assert report["invalidColumnContracts"] == [
    "auradin_search_sessions.owner_subject.nullability",
    "auradin_search_sessions.version.default",
  ]
  assert report["missingConstraints"] == sorted(EXPECTED_CONSTRAINT_CONTRACTS)
  assert report["invalidIndexes"] == sorted({
    "idx_auradin_sessions_idempotency_expires",
    "idx_auradin_events_owner_time",
    "idx_auradin_events_session",
    "idx_auradin_events_manifest",
    "idx_auradin_events_received",
    "uq_auradin_sessions_owner_client_request",
  })


def test_schema_report_rejects_or_connected_idempotency_constraint() -> None:
  report = build_schema_report(
    set(EXPECTED_TABLES),
    EXPECTED_SCHEMA_VERSIONS,
    constraints={
      **{
        name: " ".join(fragments)
        for name, fragments in EXPECTED_CONSTRAINT_CONTRACTS.items()
      },
      "chk_auradin_sessions_idempotency_fields": (
        "check (((client_request_id is null) = (request_fingerprint is null)) "
        "or ((client_request_id is null) = (idempotency_expires_at is null)))"
      ),
      "auradin_events_event_type_check": (
        "check ((event_type = any (array['session_start'::text, 'question_answered'::text, "
        "'impression'::text, 'product_open'::text, 'save'::text, 'unsave'::text, "
        "'purchase_click'::text, 'refine_dial'::text, 'refine_prompt'::text, "
        "'hide'::text, 'unhide'::text])))"
      ),
      "auradin_events_owner_subject_client_event_id_key": (
        "unique (owner_subject, client_event_id)"
      ),
      "chk_makeup_scenario_library_trend_evidence": (
        "check (((keyword_kind <> 'trend'::text) or ((source_name is not null) and "
        "(source_url is not null) and (source_published_at is not null) and "
        "(market_scope is not null) and (as_of is not null) and (expires_at is not null))))"
      ),
    },
  )

  assert report["ok"] is False
  assert report["missingConstraints"] == []
  assert report["invalidConstraints"] == ["chk_auradin_sessions_idempotency_fields"]


def test_schema_report_requires_immutable_auto_publish_audit_triggers() -> None:
  valid_triggers = {
    name: " ".join(fragments)
    for name, fragments in EXPECTED_TRIGGER_CONTRACTS.items()
  }
  missing = dict(valid_triggers)
  missing.pop("trg_seasonal_auto_publish_audit_no_truncate")
  report = build_schema_report(
    set(EXPECTED_TABLES),
    EXPECTED_SCHEMA_VERSIONS,
    triggers=missing,
  )
  assert report["ok"] is False
  assert report["invalidTriggers"] == ["trg_seasonal_auto_publish_audit_no_truncate"]

def test_schema_report_rejects_old_trend_constraint_that_requires_approval() -> None:
  report = build_schema_report(
    set(EXPECTED_TABLES),
    EXPECTED_SCHEMA_VERSIONS,
    constraints={
      "chk_makeup_scenario_library_trend_evidence": (
        "check (((keyword_kind <> 'trend'::text) or ((source_name is not null) and "
        "(source_url is not null) and (source_published_at is not null) and "
        "(market_scope is not null) and (as_of is not null) and (expires_at is not null) "
        "and (review_status = 'approved'::text))))"
      ),
    },
  )
  assert report["invalidConstraints"] == ["chk_makeup_scenario_library_trend_evidence"]


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
  assert report["missingTableConstraints"] == {
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


def test_makeup_trend_draft_evidence_migration_is_registered() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:makeup-trend-draft-evidence-v1"]
  normalized = " ".join(migration_sql.lower().split())
  assert "drop constraint if exists chk_makeup_scenario_library_trend_evidence" in normalized
  assert "add constraint chk_makeup_scenario_library_trend_evidence check" in normalized
  assert "source_url is not null" in normalized
  assert "source_published_at is not null" in normalized
  assert "market_scope is not null" in normalized
  assert "as_of is not null" in normalized
  assert "expires_at is not null" in normalized
  assert "review_status = 'approved'" not in normalized


def test_product_event_query_minimization_migration_removes_raw_query_context() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:product-event-query-minimization-v1"]
  normalized = " ".join(migration_sql.lower().split())
  assert "update product_engagement_events" in normalized
  assert "context = context - 'query'" in normalized
  assert "where context ? 'query'" in normalized


def test_seasonal_unique_publish_index_repairs_legacy_duplicates_first() -> None:
  schema = " ".join(get_schema_path().read_text(encoding="utf-8").lower().split())
  repair = schema.index("with duplicate_published as")
  unique_index = schema.index("create unique index if not exists uq_product_seasonal_single_published")

  assert repair < unique_index
  repair_sql = schema[repair:unique_index]
  assert "partition by slug" in repair_sql
  assert "order by revision desc" in repair_sql
  assert "status='suspended'" in repair_sql
  assert "suspension_reason='superseded_by_schema_repair'" in repair_sql
  assert "duplicate.published_rank>1" in repair_sql


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


def test_private_media_migration_ledger_is_registered_for_resumable_cutover() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:private-media-migration-v1"]
  normalized = " ".join(migration_sql.lower().split())

  assert "create table if not exists private_media_migration_items" in normalized
  assert "uq_private_media_migration_resource" in normalized
  assert "source_state jsonb not null" in normalized
  assert "cloudfront_invalidation_id" in normalized
  assert "cleanup_pending" in normalized
  assert "rollback_pending" in normalized
  assert "rolled_back" in normalized
  assert "chk_private_media_migration_completed_state" in normalized
  assert "idx_private_media_migration_batch_status" in normalized
  assert "idx_private_media_migration_status_retry" in normalized

  discarded_sql = POST_SCHEMA_MIGRATIONS["schema.sql:private-media-migration-discarded-v2"]
  discarded_normalized = " ".join(discarded_sql.lower().split())
  assert "add column if not exists discard_pending_at timestamptz" in discarded_normalized
  assert "add column if not exists discarded_at timestamptz" in discarded_normalized
  assert "'discard_pending'" in discarded_normalized
  assert "'discarded'" in discarded_normalized
  assert "chk_private_media_migration_discarded_state" in discarded_normalized
  assert "32461d5bd1773012acef0ba15636752949bd7c2ce50f9172159d9f56cf0dd9af" in discarded_normalized


def test_golden_mask_constraint_accepts_legacy_and_owner_scoped_private_paths() -> None:
  for version in (
    "schema.sql:golden-mask-private-user-path-v1",
    "schema.sql:golden-mask-private-constraint-v2",
  ):
    migration_sql = POST_SCHEMA_MIGRATIONS[version]
    normalized = " ".join(migration_sql.lower().split())

    assert "drop constraint if exists chk_media_assets_golden_mask_private" in normalized
    assert "content_type is not null" in normalized
    assert "uploads/golden-mask/%.auragm" in normalized
    assert (
      "private/user-media/users/%/golden-mask/legacy/media_asset/%/%.auragm"
      in normalized
    )
  constraint_contract = EXPECTED_CONSTRAINT_CONTRACTS[
    "chk_media_assets_golden_mask_private"
  ]
  assert any("uploads/golden-mask/%.auragm" in item for item in constraint_contract)
  assert any("private/user-media/users/%/golden-mask" in item for item in constraint_contract)


def test_pending_embedding_migration_is_registered() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:community-embeddings-v1"]

  assert "create extension if not exists vector" in migration_sql
  assert "alter table community_threads add column if not exists embedding" in migration_sql
  assert "alter table analysis_reports add column if not exists embedding" in migration_sql


def test_face_analysis_stage_run_migration_is_registered() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:analysis-stage-runs-v1"]

  assert "create table if not exists analysis_stage_runs" in migration_sql
  assert "on delete cascade" in migration_sql
  assert "idx_analysis_stage_runs_completed_cache" in migration_sql
  assert "uq_analysis_stage_runs_one_processing" in migration_sql


def test_obsolete_analysis_lab_tables_are_removed() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:remove-analysis-lab-v1"]

  assert "drop table if exists analysis_lab_runs" in migration_sql
  assert "drop table if exists analysis_lab_sessions" in migration_sql
  assert "schema.sql:analysis-lab-runs-v3" in migration_sql
  assert "analysis_lab_runs" not in EXPECTED_TABLES
  assert "analysis_lab_sessions" not in EXPECTED_TABLES


def test_pending_search_migration_is_registered() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:community-search-v1"]

  assert "create extension if not exists pg_trgm" in migration_sql
  assert "idx_community_threads_title_trgm" in migration_sql
  assert "idx_community_threads_body_trgm" in migration_sql


def test_pending_product_category_brow_migration_is_registered() -> None:
  """R1: brow enum 마이그레이션(멱등) 등록 + schema.sql 정본과 동기."""
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:product-category-brow-v1"]

  assert "alter type product_category add value if not exists 'brow'" in migration_sql

  schema = get_schema_path().read_text(encoding="utf-8")
  # 신규 설치(enum create)와 기존 DB 소급(alter ... if not exists) 모두 brow 포함.
  assert "'lip', 'cheek', 'shadow', 'liner', 'base', 'brow'" in schema
  assert "alter type product_category add value if not exists 'brow';" in schema


def test_schema_report_lists_missing_brow_enum_value() -> None:
  report = build_schema_report(
    set(EXPECTED_TABLES),
    EXPECTED_SCHEMA_VERSIONS,
    enum_values={"product_category": {"lip", "cheek", "shadow", "liner", "base"}},
  )

  assert report["ok"] is False
  assert report["missingEnumValues"] == {"product_category": ["brow"]}


def test_schema_report_passes_with_full_product_category_enum() -> None:
  report = build_schema_report(
    set(EXPECTED_TABLES),
    EXPECTED_SCHEMA_VERSIONS,
    enum_values={name: set(values) for name, values in EXPECTED_ENUM_VALUES.items()},
  )

  assert report["ok"] is True
  assert report["missingEnumValues"] == {}


def test_pending_auradin_session_migration_is_registered() -> None:
  migration_v1 = POST_SCHEMA_MIGRATIONS["schema.sql:auradin-sessions-v1"]
  migration_v2 = POST_SCHEMA_MIGRATIONS["schema.sql:auradin-sessions-v2"]

  assert "create table if not exists auradin_search_sessions" in migration_v1
  assert "state jsonb not null" in migration_v1
  assert "expires_at timestamptz not null" in migration_v1
  assert "idx_auradin_search_sessions_expires_at" in migration_v1
  assert "alter column owner_subject set not null" in migration_v2
  assert "alter column version set default 0" in migration_v2
  assert "chk_auradin_sessions_idempotency_fields" in migration_v2
  assert "uq_auradin_sessions_owner_client_request" in migration_v2
  assert "idx_auradin_sessions_idempotency_expires" in migration_v2
