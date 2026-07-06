from app.db.check_schema import EXPECTED_TABLES, build_schema_report
from app.db.init_db import SCHEMA_VERSION, get_schema_path
from app.db.seed_db import SEED_VERSION, get_seed_path


def test_schema_path_exists() -> None:
  path = get_schema_path()

  assert path.name == "schema.sql"
  assert path.exists()
  assert SCHEMA_VERSION == "schema.sql:v1"


def test_seed_path_exists() -> None:
  path = get_seed_path()

  assert path.name == "seed.sql"
  assert path.exists()
  assert SEED_VERSION == "seed.sql:v2"


def test_schema_report_passes_when_expected_tables_and_schema_marker_exist() -> None:
  report = build_schema_report(set(EXPECTED_TABLES), {SCHEMA_VERSION})

  assert report["ok"] is True
  assert report["missingTables"] == []
  assert report["missingVersions"] == []


def test_schema_report_can_require_seed_marker() -> None:
  report = build_schema_report(set(EXPECTED_TABLES), {SCHEMA_VERSION}, require_seed=True)

  assert report["ok"] is False
  assert report["missingTables"] == []
  assert report["missingVersions"] == [SEED_VERSION]


def test_schema_report_lists_missing_tables_and_schema_marker() -> None:
  report = build_schema_report({"users"}, set())

  assert report["ok"] is False
  assert "media_assets" in report["missingTables"]
  assert report["missingVersions"] == [SCHEMA_VERSION]