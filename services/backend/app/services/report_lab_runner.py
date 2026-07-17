from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import time
from typing import Any

from pydantic import BaseModel, ValidationError

from app.schemas.face_analysis_v2 import ConsultingResult, MeasurementStageOutput, PerceptionResult
from app.schemas.report_lab import ReportLabOverrides, ReportLabStage
from app.services.face_analysis_stage_runs import compute_stage_input_hash
from app.services.report_lab_fixtures import ReportLabFixture


REPORT_LAB_RUNNER = "fixture"
REPORT_LAB_PROVIDER = "disabled"
REPORT_LAB_MODEL = "disabled"
REPORT_LAB_EXTERNAL_PROVIDER_RUNS = 0
REPORT_LAB_RUNNER_CONTRACT_VERSION = "fixture-validator-v2"


STAGE_OUTPUT_MODELS: dict[str, type[BaseModel]] = {
  "measure": MeasurementStageOutput,
  "perceive": PerceptionResult,
  "consult": ConsultingResult,
}


@dataclass(frozen=True)
class ReportLabRunnerResult:
  status: str
  schema_version: str
  input_hash: str
  raw_response: dict[str, Any]
  normalized_output: dict[str, Any]
  validation_errors: list[dict[str, Any]]
  latency_ms: int
  token_usage: None
  external_provider_runs: int = REPORT_LAB_EXTERNAL_PROVIDER_RUNS
  provider: str = REPORT_LAB_PROVIDER
  model: str = REPORT_LAB_MODEL
  runner: str = REPORT_LAB_RUNNER


def _validation_errors(exc: ValidationError) -> list[dict[str, Any]]:
  return [
    {
      "location": [str(part) for part in error["loc"]],
      "type": error["type"],
    }
    for error in exc.errors(include_input=False, include_url=False)
  ]


async def run_report_lab_fixture_stage(
  fixture: ReportLabFixture,
  *,
  stage: ReportLabStage,
  overrides: ReportLabOverrides,
  build_sha: str = "uncommitted",
) -> ReportLabRunnerResult:
  """Validate a committed synthetic response without constructing a provider client.

  Prompts and sampling controls remain first-class experiment inputs and affect
  the canonical input hash, but the disabled runner intentionally returns only
  the committed fixture response. This makes UI/validation experiments
  reproducible and structurally prevents network/model invocation.
  """

  started_at = time.monotonic()
  image_state = str(fixture.provenance["imageState"])

  input_hash = compute_stage_input_hash(
    {
      "fixtureId": fixture.fixture_id,
      "fixtureSchemaVersion": fixture.schema_version,
      "fixtureProvenance": fixture.provenance,
      "fixtureRequestPayload": fixture.request_payload,
      "fixtureStageOutput": fixture.stage_outputs.get(stage, {}),
      "reportViewSha256": fixture.report_view_sha256,
      "stage": stage,
      "imageState": image_state,
      "overrides": overrides.model_dump(by_alias=True, mode="json"),
      "runner": REPORT_LAB_RUNNER,
      "runnerContractVersion": REPORT_LAB_RUNNER_CONTRACT_VERSION,
      "buildSha": build_sha,
      "provider": REPORT_LAB_PROVIDER,
    },
  )
  raw_response = deepcopy(fixture.stage_outputs.get(stage, {}))
  output_model = STAGE_OUTPUT_MODELS[stage]
  validation_errors: list[dict[str, Any]] = []
  normalized_output: dict[str, Any] = {}
  status = "completed"
  try:
    output = output_model.model_validate(raw_response)
    # The metric-bearing stage output remains raw/admin-only. Both web and
    # mobile consume the same committed, numeric-free presentation contract.
    output.model_dump(by_alias=True, mode="json")
    normalized_output = deepcopy(fixture.report_view)
  except ValidationError as exc:
    validation_errors = _validation_errors(exc)
    status = "failed"

  return ReportLabRunnerResult(
    status=status,
    schema_version=str(fixture.report_view["schemaVersion"]),
    input_hash=input_hash,
    raw_response=raw_response,
    normalized_output=normalized_output,
    validation_errors=validation_errors,
    latency_ms=max(0, round((time.monotonic() - started_at) * 1000)),
    token_usage=None,
  )
