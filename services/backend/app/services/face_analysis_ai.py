import json
from collections.abc import Mapping
from typing import Any, Protocol, TypeVar

from pydantic import BaseModel, ValidationError

from app.core.errors import AppError
from app.schemas.face_analysis_v2 import (
  ConsultingResult,
  DerivedResult,
  MeasurementCoveragePlan,
  MeasurementStageOutput,
  MetricEnvelope,
  PerceptionResult,
)
from app.services.face_analysis_measurements import (
  filter_metric_keys_for_model,
  filter_internal_only_payload,
  filter_metrics_for_model,
)


MEASUREMENT_PROMPT_VERSION = "s1-measurement-v1"
PERCEPTION_PROMPT_VERSION = "s1-perception-v1"
CONSULTING_PROMPT_VERSION = "s1-consulting-v1"
FORBIDDEN_INFERENCES = (
  "medical diagnosis, disease, age, ethnicity, health status, cosmetic procedures, "
  "attractiveness score"
)


class StructuredAnalysisClient(Protocol):
  async def analyze_structured_json(
    self,
    *,
    developer_prompt: str,
    user_prompt: str,
    json_schema: dict[str, Any],
    source_image_bytes: bytes | None,
    max_tokens: int,
  ) -> dict[str, Any]: ...


OutputModel = TypeVar("OutputModel", bound=BaseModel)


def _jsonable(value: Any) -> Any:
  if isinstance(value, BaseModel):
    return value.model_dump(by_alias=True, mode="json")
  if isinstance(value, dict):
    return {key: _jsonable(item) for key, item in value.items()}
  if isinstance(value, list):
    return [_jsonable(item) for item in value]
  return value


class FaceAnalysisAI:
  def __init__(self, client: StructuredAnalysisClient) -> None:
    self.client = client

  async def _invoke_validated(
    self,
    *,
    model_type: type[OutputModel],
    developer_prompt: str,
    user_prompt: str,
    source_image_bytes: bytes | None,
    max_tokens: int,
  ) -> OutputModel:
    validation_errors: list[dict[str, Any]] = []
    current_prompt = user_prompt
    for attempt in range(2):
      response = await self.client.analyze_structured_json(
        developer_prompt=developer_prompt,
        user_prompt=current_prompt,
        json_schema=model_type.model_json_schema(by_alias=True),
        source_image_bytes=source_image_bytes,
        max_tokens=max_tokens,
      )
      try:
        return model_type.model_validate(response)
      except ValidationError as exc:
        validation_errors = [
          {"location": list(error["loc"]), "type": error["type"]}
          for error in exc.errors(include_input=False, include_url=False)
        ]
        if attempt == 0:
          current_prompt = (
            f"{user_prompt}\nThe previous JSON failed validation. Correct only the structure and return "
            f"one JSON object. Validation errors: {json.dumps(validation_errors)}"
          )
    raise AppError(
      502,
      "FACE_ANALYSIS_STAGE_OUTPUT_INVALID",
      "Face analysis stage returned invalid structured output.",
      {"validationErrors": validation_errors},
    )

  async def measure(
    self,
    *,
    source_image_bytes: bytes,
    coverage: MeasurementCoveragePlan,
    camera_profile: dict[str, MetricEnvelope],
  ) -> MeasurementStageOutput:
    model_profile = filter_metrics_for_model(camera_profile)
    prompt_payload = {
      "missingObservableKeys": coverage.missing_observable_keys,
      "authoritativeKeys": filter_metric_keys_for_model(
        coverage.authoritative_keys,
      ),
      "cameraEvidence": _jsonable(model_profile),
    }
    output = await self._invoke_validated(
      model_type=MeasurementStageOutput,
      developer_prompt=(
        "You measure only explicitly requested visible beauty attributes in one neutral front S1 "
        f"photo. Never infer {FORBIDDEN_INFERENCES}. Return schema-valid JSON only."
      ),
      user_prompt=(
        "Estimate only missingObservableKeys. Never remeasure authoritativeKeys. Use source=ai, "
        "status=estimated, shots=[S1], or return unmeasured when visibility is insufficient.\n"
        + json.dumps(prompt_payload, ensure_ascii=False, separators=(",", ":"))
      ),
      source_image_bytes=source_image_bytes,
      max_tokens=2800,
    )
    authoritative = set(coverage.authoritative_keys)
    allowed = set(coverage.missing_observable_keys)
    accepted: dict[str, MetricEnvelope] = {}
    rejected_authoritative: list[str] = []
    rejected_unknown: list[str] = []
    for key, metric in output.metrics.items():
      if key in authoritative:
        rejected_authoritative.append(key)
      elif key not in allowed:
        rejected_unknown.append(key)
      else:
        accepted[key] = metric
    return output.model_copy(
      update={
        "metrics": accepted,
        "rejected_authoritative_keys": sorted(rejected_authoritative),
        "rejected_unknown_keys": sorted(rejected_unknown),
      },
    )

  async def perceive(
    self,
    *,
    source_image_bytes: bytes,
    profile: dict[str, MetricEnvelope],
    derived: DerivedResult | dict[str, Any],
  ) -> PerceptionResult:
    model_profile = filter_metrics_for_model(profile)
    model_derived = filter_internal_only_payload(_jsonable(derived))
    return await self._invoke_validated(
      model_type=PerceptionResult,
      developer_prompt=(
        "You provide non-medical beauty perception from an S1 photo and supplied measurements. "
        f"Never infer {FORBIDDEN_INFERENCES}. Do not create measurements. Return JSON only."
      ),
      user_prompt=json.dumps(
        {"faceProfile": _jsonable(model_profile), "derived": model_derived},
        ensure_ascii=False,
        separators=(",", ":"),
      ),
      source_image_bytes=source_image_bytes,
      max_tokens=3200,
    )

  async def consult(
    self,
    *,
    profile: Mapping[str, MetricEnvelope | dict[str, Any]],
    derived: DerivedResult | dict[str, Any],
    perception: PerceptionResult | dict[str, Any],
  ) -> ConsultingResult:
    model_profile = filter_metrics_for_model(profile)
    model_payload = filter_internal_only_payload(
      {
        "faceProfile": _jsonable(model_profile),
        "derived": _jsonable(derived),
        "perception": _jsonable(perception),
      },
    )
    return await self._invoke_validated(
      model_type=ConsultingResult,
      developer_prompt=(
        "You are a practical K-beauty, hair, fashion, and photography consultant. Base every "
        f"recommendation on supplied evidence. Never infer {FORBIDDEN_INFERENCES}. Return JSON only."
      ),
      user_prompt=json.dumps(
        model_payload,
        ensure_ascii=False,
        separators=(",", ":"),
      ),
      source_image_bytes=None,
      max_tokens=2800,
    )
