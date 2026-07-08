"""Validates the Python contract mirror against the shared TS fixtures."""

import json
from pathlib import Path

import pytest

from engine.contracts import VALIDATORS

FIXTURES_DIR = (
    Path(__file__).resolve().parents[3]
    / "apps/mobile/src/features/beard-simulation/contracts/fixtures"
)

FIXTURE_FILES = sorted(FIXTURES_DIR.glob("*.json"))


def test_fixture_dir_present() -> None:
    assert len(FIXTURE_FILES) >= 5, f"expected >=5 fixtures in {FIXTURES_DIR}"


@pytest.mark.parametrize("fixture_path", FIXTURE_FILES, ids=lambda p: p.stem)
def test_contract_fixture(fixture_path: Path) -> None:
    fixture = json.loads(fixture_path.read_text())
    validator = VALIDATORS[fixture["kind"]]
    valid, errors = validator(fixture["payload"])
    assert valid == fixture["expectValid"], (
        f"expected valid={fixture['expectValid']}, got {valid}; errors={errors}"
    )
    expected_fragment = fixture.get("expectErrorContains")
    if expected_fragment:
        haystack = "\n".join(errors).lower()
        assert expected_fragment.lower() in haystack, (
            f'expected an error containing "{expected_fragment}", got: {errors}'
        )
