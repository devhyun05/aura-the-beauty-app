import json
from pathlib import Path

import pytest

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.report_lab_fixtures import (
  list_report_lab_fixtures,
  load_report_lab_fixture,
)


NO_IMAGE_VISUAL_EVIDENCE = (
  "이미지 미포함 상태의 결정적 fixture 문장이므로 실제 시각 관찰을 주장하지 않아요."
)


def nested_field_values(value: object, field: str) -> list[object]:
  if isinstance(value, dict):
    current = [value[field]] if field in value else []
    return current + [
      nested
      for child in value.values()
      for nested in nested_field_values(child, field)
    ]
  if isinstance(value, list):
    return [
      nested
      for child in value
      for nested in nested_field_values(child, field)
    ]
  return []


def test_committed_report_lab_catalog_contains_only_synthetic_fixture_metadata() -> None:
  settings = Settings(_env_file=None)
  fixtures = list_report_lab_fixtures(settings)

  assert fixtures == [
    {
      "fixtureId": "synthetic-balanced-v1",
      "label": "결정적 균형형 얼굴 보고서",
      "synthetic": True,
      "syntheticScope": "numeric-free-json-only",
      "provenance": {
        "kind": "deterministic-json-fixture",
        "imageState": "omitted-no-approved-provenance",
        "containsUserData": False,
        "externalProviderSource": False,
      },
    },
  ]
  fixture = load_report_lab_fixture(settings, "synthetic-balanced-v1")
  assert fixture.provenance["imageState"] == "omitted-no-approved-provenance"
  assert not hasattr(fixture, "image_path")
  assert fixture.report_view["schemaVersion"] == "aura-face-report-view-v1"
  assert fixture.report_view_sha256 == (
    "8a0886474cc3a167480a12abe67fd16c3e7e121c498dec88c9f5742a59c31320"
  )


def test_image_omitted_fixture_never_claims_visual_observation() -> None:
  fixture = load_report_lab_fixture(Settings(_env_file=None), "synthetic-balanced-v1")
  evidence = nested_field_values(fixture.stage_outputs.get("perceive"), "visualEvidence")

  assert len(evidence) == 32
  assert set(evidence) == {NO_IMAGE_VISUAL_EVIDENCE}


def test_fixture_catalog_rejects_path_traversal(tmp_path: Path) -> None:
  root = tmp_path / "fixtures"
  root.mkdir()
  (root / "catalog.json").write_text(
    json.dumps(
      {
        "schemaVersion": "aura-report-lab-fixture-catalog-v1",
        "fixtures": [
          {
            "fixtureId": "escape-v1",
            "file": "../outside.json",
            "synthetic": True,
            "syntheticScope": "numeric-free-json-only",
          },
        ],
      },
    ),
    encoding="utf-8",
  )
  settings = Settings(_env_file=None, report_lab_fixture_root=str(root))

  with pytest.raises(AppError) as error:
    load_report_lab_fixture(settings, "escape-v1")

  assert error.value.code == "REPORT_LAB_FIXTURE_PATH_INVALID"


def test_fixture_catalog_rejects_an_unscoped_synthetic_label(tmp_path: Path) -> None:
  root = tmp_path / "fixtures"
  root.mkdir()
  (root / "catalog.json").write_text(
    json.dumps(
      {
        "schemaVersion": "aura-report-lab-fixture-catalog-v1",
        "fixtures": [
          {
            "fixtureId": "ambiguous-image-v1",
            "file": "missing.json",
            "synthetic": True,
          },
        ],
      },
    ),
    encoding="utf-8",
  )
  settings = Settings(_env_file=None, report_lab_fixture_root=str(root))

  with pytest.raises(AppError) as error:
    load_report_lab_fixture(settings, "ambiguous-image-v1")

  assert error.value.code == "REPORT_LAB_FIXTURE_NOT_SYNTHETIC"


def test_json_only_fixture_contract_rejects_even_a_local_image_file_field(tmp_path: Path) -> None:
  source_root = Path(__file__).parents[1] / "app" / "lab_fixtures" / "face-report"
  root = tmp_path / "fixtures"
  root.mkdir()
  catalog = json.loads((source_root / "catalog.json").read_text(encoding="utf-8"))
  fixture = json.loads((source_root / "synthetic-balanced-v1.json").read_text(encoding="utf-8"))
  fixture["imageFile"] = "self-attested.png"
  (root / "catalog.json").write_text(json.dumps(catalog), encoding="utf-8")
  (root / "synthetic-balanced-v1.json").write_text(json.dumps(fixture), encoding="utf-8")

  with pytest.raises(AppError) as error:
    load_report_lab_fixture(
      Settings(_env_file=None, report_lab_fixture_root=str(root)),
      "synthetic-balanced-v1",
    )

  assert error.value.code == "REPORT_LAB_FIXTURE_IMAGE_FORBIDDEN"
