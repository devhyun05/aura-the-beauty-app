import pytest

from app.core.settings import Settings
from app.schemas.report_lab import ReportLabOverrides
from app.services.report_lab_fixtures import load_report_lab_fixture
from app.services.report_lab_fixtures import ReportLabFixture
from app.services.report_lab_runner import run_report_lab_fixture_stage


def overrides(version: str = "fixture-test-v1") -> ReportLabOverrides:
  return ReportLabOverrides(promptVersion=version)


@pytest.mark.asyncio
async def test_provider_disabled_runner_is_deterministic_and_reports_zero_external_runs() -> None:
  fixture = load_report_lab_fixture(Settings(_env_file=None), "synthetic-balanced-v1")

  first = await run_report_lab_fixture_stage(
    fixture,
    stage="perceive",
    overrides=overrides(),
  )
  second = await run_report_lab_fixture_stage(
    fixture,
    stage="perceive",
    overrides=overrides(),
  )

  assert first.status == second.status == "completed"
  assert first.input_hash == second.input_hash
  assert first.normalized_output == second.normalized_output
  assert first.normalized_output["schemaVersion"] == "aura-face-report-view-v1"
  assert first.provider == first.model == "disabled"
  assert first.external_provider_runs == 0
  assert first.token_usage is None


@pytest.mark.asyncio
async def test_consult_stage_never_reads_an_image() -> None:
  fixture = load_report_lab_fixture(Settings(_env_file=None), "synthetic-balanced-v1")

  result = await run_report_lab_fixture_stage(
    fixture,
    stage="consult",
    overrides=overrides(),
  )

  assert result.status == "completed"
  assert result.normalized_output["styling"]["directions"][0]["key"] == "natural"
  assert result.normalized_output["styling"]["directions"][1]["key"] == "glam"


@pytest.mark.asyncio
async def test_prompt_change_changes_hash_without_enabling_a_provider() -> None:
  fixture = load_report_lab_fixture(Settings(_env_file=None), "synthetic-balanced-v1")

  first = await run_report_lab_fixture_stage(
    fixture,
    stage="consult",
    overrides=ReportLabOverrides(promptVersion="a-v1", promptUser="첫 프롬프트"),
  )
  second = await run_report_lab_fixture_stage(
    fixture,
    stage="consult",
    overrides=ReportLabOverrides(promptVersion="b-v1", promptUser="둘째 프롬프트"),
  )

  assert first.input_hash != second.input_hash
  assert first.normalized_output == second.normalized_output
  assert first.external_provider_runs == second.external_provider_runs == 0


@pytest.mark.asyncio
async def test_fixture_payload_and_build_identity_invalidate_the_cache_hash() -> None:
  fixture = load_report_lab_fixture(Settings(_env_file=None), "synthetic-balanced-v1")
  baseline = await run_report_lab_fixture_stage(
    fixture,
    stage="consult",
    overrides=overrides(),
    build_sha="a" * 40,
  )
  changed_payload = ReportLabFixture(
    fixture_id=fixture.fixture_id,
    schema_version=fixture.schema_version,
    provenance=fixture.provenance,
    request_payload={**fixture.request_payload, "contractProbe": "changed"},
    stage_outputs=fixture.stage_outputs,
    report_view=fixture.report_view,
    report_view_sha256=fixture.report_view_sha256,
  )
  payload_changed = await run_report_lab_fixture_stage(
    changed_payload,
    stage="consult",
    overrides=overrides(),
    build_sha="a" * 40,
  )
  build_changed = await run_report_lab_fixture_stage(
    fixture,
    stage="consult",
    overrides=overrides(),
    build_sha="b" * 40,
  )

  assert baseline.input_hash != payload_changed.input_hash
  assert baseline.input_hash != build_changed.input_hash
