from pathlib import Path

from app.db.check_schema import (
  EXPECTED_COLUMN_CONTRACTS,
  EXPECTED_COLUMNS,
  EXPECTED_CONSTRAINT_CONTRACTS,
  EXPECTED_CONSTRAINTS,
  EXPECTED_INDEX_CONTRACTS,
  EXPECTED_TABLES,
  build_schema_report,
)
from app.db.init_db import POST_SCHEMA_MIGRATIONS, SCHEMA_VERSION


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_makeup_journey_schema_contract_is_present_in_all_schema_gates() -> None:
  schema = (REPO_ROOT / "docs/backend/schema.sql").read_text(encoding="utf-8").lower()
  dbml = (REPO_ROOT / "docs/backend/aws-postgresql-schema.dbml").read_text(encoding="utf-8").lower()

  assert {"makeup_journey_settings", "makeup_journey_day_notes", "makeup_journey_missions"} <= EXPECTED_TABLES
  assert {"entry_date", "feedback_kind", "parent_feedback_report_id"} <= EXPECTED_COLUMNS["makeup_feedback_reports"]
  assert EXPECTED_COLUMN_CONTRACTS["makeup_feedback_reports.entry_date"] == {
    "is_nullable": "NO",
    "default_contains": "Asia/Seoul",
  }
  assert EXPECTED_COLUMN_CONTRACTS["makeup_journey_settings.timezone_name"] == {
    "is_nullable": "NO",
    "default_contains": "Asia/Seoul",
  }
  assert EXPECTED_COLUMN_CONTRACTS["makeup_journey_day_notes.user_id"] == {
    "is_nullable": "NO",
  }
  assert EXPECTED_COLUMN_CONTRACTS["makeup_journey_day_notes.entry_date"] == {
    "is_nullable": "NO",
  }
  for column in ("user_id", "entry_date", "source", "difficulty", "title"):
    assert EXPECTED_COLUMN_CONTRACTS[f"makeup_journey_missions.{column}"] == {
      "is_nullable": "NO",
    }
  assert EXPECTED_COLUMN_CONTRACTS["makeup_journey_missions.is_completed"] == {
    "is_nullable": "NO",
    "default_contains": "false",
  }
  assert EXPECTED_COLUMN_CONTRACTS["makeup_journey_missions.sort_order"] == {
    "is_nullable": "NO",
    "default_contains": "0",
  }
  assert "fk_makeup_feedback_reports_parent" in EXPECTED_CONSTRAINTS["makeup_feedback_reports"]
  assert "chk_makeup_journey_timezone_name" in EXPECTED_CONSTRAINTS["makeup_journey_settings"]
  assert {
    "chk_makeup_journey_goal_score",
    "chk_makeup_journey_mission_level",
    "chk_makeup_journey_timezone_name",
    "chk_makeup_journey_day_note_length",
    "chk_makeup_journey_mission_source",
    "chk_makeup_journey_mission_difficulty",
    "chk_makeup_journey_mission_title",
    "chk_makeup_journey_mission_completion",
  } <= EXPECTED_CONSTRAINT_CONTRACTS.keys()
  assert "uq_makeup_journey_missions_user_date_title_ci" in EXPECTED_INDEX_CONTRACTS
  assert SCHEMA_VERSION == "schema.sql:v8-makeup-journey"
  assert "schema.sql:makeup-journey-v1" in POST_SCHEMA_MIGRATIONS

  assert "at time zone 'asia/seoul'" in schema
  assert "entry_date date not null default ((now() at time zone 'asia/seoul')::date)" in schema
  assert "alter column entry_date set default ((now() at time zone 'asia/seoul')::date)" in schema
  assert "alter column entry_date set not null" in schema
  assert "feedback_kind = 'initial' and parent_feedback_report_id is null" in schema
  assert "feedback_kind = 'correction' and parent_feedback_report_id is not null" in schema
  assert "foreign key (parent_feedback_report_id) references makeup_feedback_reports(id) on delete cascade" in schema
  assert "on makeup_journey_missions (user_id, entry_date, lower(title))" in schema
  assert "table makeup_journey_settings" in dbml
  assert "table makeup_journey_day_notes" in dbml
  assert "table makeup_journey_missions" in dbml
  assert "default: `((now() at time zone 'asia/seoul')::date)`" in dbml
  migration = POST_SCHEMA_MIGRATIONS["schema.sql:makeup-journey-v1"].lower()
  assert "alter column entry_date set default ((now() at time zone 'asia/seoul')::date)" in migration


def test_makeup_journey_schema_gate_rejects_weakened_required_columns_and_checks() -> None:
  valid_column_contracts = {
    name: {
      "is_nullable": expected.get("is_nullable"),
      "column_default": expected.get("default_contains"),
    }
    for name, expected in EXPECTED_COLUMN_CONTRACTS.items()
  }
  valid_constraints = {
    name: " ".join(fragments)
    for name, fragments in EXPECTED_CONSTRAINT_CONTRACTS.items()
  }
  valid_column_contracts["makeup_journey_settings.timezone_name"] = {
    "is_nullable": "YES",
    "column_default": None,
  }
  valid_column_contracts["makeup_journey_day_notes.entry_date"] = {
    "is_nullable": "YES",
    "column_default": None,
  }
  valid_column_contracts["makeup_journey_missions.is_completed"] = {
    "is_nullable": "NO",
    "column_default": None,
  }
  valid_constraints["chk_makeup_journey_mission_title"] = (
    "check (char_length(btrim(title)) >= 1)"
  )

  report = build_schema_report(
    set(EXPECTED_TABLES),
    {SCHEMA_VERSION, *POST_SCHEMA_MIGRATIONS},
    column_contracts=valid_column_contracts,
    constraints=valid_constraints,
  )

  assert report["ok"] is False
  assert report["invalidColumnContracts"] == [
    "makeup_journey_day_notes.entry_date.nullability",
    "makeup_journey_missions.is_completed.default",
    "makeup_journey_settings.timezone_name.default",
    "makeup_journey_settings.timezone_name.nullability",
  ]
  assert report["invalidConstraints"] == ["chk_makeup_journey_mission_title"]


def test_self_fk_and_journey_rows_cascade_before_account_media_cleanup() -> None:
  schema = (REPO_ROOT / "docs/backend/schema.sql").read_text(encoding="utf-8").lower()

  # The self edge cascades, so deleting a user cannot leave a correction that
  # blocks deletion of its parent. Media edges remain SET NULL for cleanup.
  assert "foreign key (parent_feedback_report_id) references makeup_feedback_reports(id) on delete cascade" in schema
  assert "foreign key (uploaded_media_id) references media_assets(id) on delete set null" in schema
  assert "foreign key (user_id) references users(id) on delete cascade" in schema
