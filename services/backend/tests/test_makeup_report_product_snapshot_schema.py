from pathlib import Path

from app.db.check_schema import (
  EXPECTED_COLUMN_CONTRACTS,
  EXPECTED_COLUMNS,
  EXPECTED_CONSTRAINT_CONTRACTS,
  EXPECTED_CONSTRAINTS,
  EXPECTED_INDEX_CONTRACTS,
)
from app.db.init_db import POST_SCHEMA_MIGRATIONS, get_schema_path


MIGRATION_VERSION = "schema.sql:makeup-report-product-snapshots-v1"
SNAPSHOT_COLUMNS = {
  "source_makeup_report_id",
  "source_look_id",
  "recipe_hash",
  "catalog_version",
  "status",
  "revision",
  "started_at",
  "completed_at",
  "error_code",
}
SNAPSHOT_CONSTRAINTS = {
  "fk_product_recommendation_runs_source_makeup_report",
  "chk_product_recommendation_runs_strategy",
  "chk_product_recommendation_runs_status",
  "chk_product_recommendation_runs_revision",
  "chk_product_recommendation_runs_makeup_snapshot",
  "chk_product_recommendation_runs_makeup_completion",
}
SNAPSHOT_INDEXES = {
  "idx_product_recommendation_runs_source_makeup_report",
  "uq_product_recommendation_runs_makeup_snapshot_revision",
  "uq_product_recommendation_runs_makeup_look_revision",
  "idx_product_recommendation_runs_makeup_ready_revision",
  "idx_product_recommendation_runs_makeup_work_queue",
}


def _normalized(value: str) -> str:
  return " ".join(value.lower().split())


def test_snapshot_schema_checker_covers_columns_constraints_and_indexes() -> None:
  assert SNAPSHOT_COLUMNS <= EXPECTED_COLUMNS["product_recommendation_runs"]
  assert SNAPSHOT_CONSTRAINTS <= EXPECTED_CONSTRAINTS["product_recommendation_runs"]
  assert SNAPSHOT_CONSTRAINTS <= EXPECTED_CONSTRAINT_CONTRACTS.keys()
  assert SNAPSHOT_INDEXES <= EXPECTED_INDEX_CONTRACTS.keys()
  assert EXPECTED_COLUMN_CONTRACTS["product_recommendation_runs.status"] == {
    "is_nullable": "NO",
    "default_contains": "ready",
  }
  assert EXPECTED_COLUMN_CONTRACTS["product_recommendation_runs.revision"] == {
    "is_nullable": "NO",
    "default_contains": "1",
  }


def test_snapshot_forward_migration_is_idempotent_and_revisioned() -> None:
  migration = _normalized(POST_SCHEMA_MIGRATIONS[MIGRATION_VERSION])

  for column in SNAPSHOT_COLUMNS:
    assert f"add column if not exists {column}" in migration
  assert "'makeup_report_v1'" in migration
  assert "foreign key (source_makeup_report_id) references makeup_recommendation_reports(id) on delete cascade" in migration
  assert "create unique index if not exists uq_product_recommendation_runs_makeup_snapshot_revision" in migration
  unique_index = migration.split(
    "create unique index if not exists uq_product_recommendation_runs_makeup_snapshot_revision",
    1,
  )[1].split(";", 1)[0]
  assert all(
    column in unique_index
    for column in (
      "source_makeup_report_id",
      "source_look_id",
      "recipe_hash",
      "algorithm_version",
      "catalog_version",
      "revision",
    )
  )
  assert "where strategy = 'makeup_report_v1'" in unique_index
  assert "create unique index if not exists uq_product_recommendation_runs_makeup_look_revision" in migration
  look_revision_index = migration.split(
    "create unique index if not exists uq_product_recommendation_runs_makeup_look_revision",
    1,
  )[1].split(";", 1)[0]
  assert all(
    column in look_revision_index
    for column in ("source_makeup_report_id", "source_look_id", "revision")
  )
  assert "where strategy = 'makeup_report_v1'" in look_revision_index


def test_snapshot_state_contract_supports_worker_reclaim_and_old_ready_revision() -> None:
  migration = _normalized(POST_SCHEMA_MIGRATIONS[MIGRATION_VERSION])

  assert "status in ('pending','processing','ready','partial','failed')" in migration
  assert "status = 'processing' and started_at is not null and completed_at is null" in migration
  assert "completed_at >= started_at" in migration
  assert "status = 'failed'" in migration
  assert "error_code is not null" in migration
  assert "idx_product_recommendation_runs_makeup_ready_revision" in migration
  assert "status in ('ready','partial')" in migration
  assert "idx_product_recommendation_runs_makeup_work_queue" in migration
  assert "status in ('pending','processing')" in migration


def test_schema_sql_and_dbml_keep_snapshot_contract_in_sync() -> None:
  schema = _normalized(get_schema_path().read_text(encoding="utf-8"))
  dbml_path = Path(__file__).resolve().parents[3] / "docs" / "backend" / "aws-postgresql-schema.dbml"
  dbml = _normalized(dbml_path.read_text(encoding="utf-8"))

  assert schema.index("create table if not exists makeup_recommendation_reports") < schema.index(
    "add constraint fk_product_recommendation_runs_source_makeup_report"
  )
  for token in (*SNAPSHOT_COLUMNS, *SNAPSHOT_INDEXES):
    assert token in schema
    assert token in dbml
  for constraint in SNAPSHOT_CONSTRAINTS:
    assert constraint in schema
  assert "makeup_report_v1" in dbml
  assert "pending | processing | ready | partial | failed" in dbml
  assert "ref: product_recommendation_runs.source_makeup_report_id > makeup_recommendation_reports.id [delete: cascade]" in dbml
