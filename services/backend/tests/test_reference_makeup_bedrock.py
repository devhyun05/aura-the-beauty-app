import json

import pytest

import app.services.reference_makeup_extraction as reference_makeup_extraction
from app.core.errors import AppError
from app.core.settings import Settings
from app.schemas.analysis import FilterExtractionAnalyzeRequest
from app.services.reference_makeup_extraction import (
  REFERENCE_BEDROCK_MAX_TOKENS,
  ReferenceMakeupBedrockService,
  build_reference_makeup_extraction_payload,
  build_reference_makeup_extraction_payload_for_request,
  _normalize_bedrock_payload,
)


class FakeBody:
  def __init__(self, payload: dict) -> None:
    self.payload = payload

  def read(self) -> bytes:
    return json.dumps(self.payload).encode("utf-8")


class FakeBedrockClient:
  def __init__(self, responses: list[dict]) -> None:
    self.responses = list(responses)
    self.calls: list[dict] = []

  def invoke_model(self, **kwargs):
    self.calls.append(kwargs)
    return {"body": FakeBody(self.responses.pop(0))}


def _complete_tool_response(payload: FilterExtractionAnalyzeRequest) -> dict:
  look = build_reference_makeup_extraction_payload(payload)["extracted_makeup_look"]
  for guide in look["area_guides"]:
    guide.update(
      {
        "goal": f"{guide['label']} 표현 목표",
        "placement": f"{guide['label']} 적용 위치와 범위",
        "technique": f"{guide['label']} 적용 기법",
        "steps": [
          {"order": 1, "instruction": "얇게 첫 단계를 적용해요."},
          {"order": 2, "instruction": "경계를 부드럽게 연결해요."},
          {"order": 3, "instruction": "농도와 마무리를 확인해요."},
        ],
        "reason": f"이미지에서 관찰한 {guide['label']} 표현 근거",
        "avoid": ["한 번에 진하게 올리지 않기"],
      },
    )
  return {
    "content": [
      {
        "type": "tool_use",
        "name": "submit_reference_makeup_report",
        "input": {"extractedMakeupLook": look},
      },
    ],
    "stop_reason": "tool_use",
    "usage": {"input_tokens": 5000, "output_tokens": 5200},
  }


def _empty_max_tokens_response() -> dict:
  return {
    "content": [
      {
        "type": "tool_use",
        "name": "submit_reference_makeup_report",
        "input": {},
      },
    ],
    "stop_reason": "max_tokens",
    "usage": {"input_tokens": 5000, "output_tokens": 8192},
  }


def test_reference_bedrock_uses_larger_default_output_limit(monkeypatch) -> None:
  payload = FilterExtractionAnalyzeRequest(runAi=True)
  client = FakeBedrockClient([_complete_tool_response(payload)])
  service = ReferenceMakeupBedrockService(Settings(bedrock_analysis_model_id="test-model"))
  monkeypatch.setattr(service, "_bedrock_runtime_client", lambda: client)

  result = service._analyze_sync(payload, b"image", "image/jpeg")

  request = json.loads(client.calls[0]["body"])
  assert request["max_tokens"] == REFERENCE_BEDROCK_MAX_TOKENS
  assert result["extracted_makeup_look"]["accuracy"] == 91


def test_reference_bedrock_max_tokens_invokes_provider_exactly_once(monkeypatch) -> None:
  payload = FilterExtractionAnalyzeRequest(runAi=True)
  client = FakeBedrockClient([
    _empty_max_tokens_response(),
    _complete_tool_response(payload),
  ])
  service = ReferenceMakeupBedrockService(Settings(bedrock_analysis_model_id="test-model"))
  monkeypatch.setattr(service, "_bedrock_runtime_client", lambda: client)

  with pytest.raises(AppError) as error:
    service._analyze_sync(payload, b"image", "image/jpeg")

  assert error.value.code == "REFERENCE_BEDROCK_OUTPUT_INCOMPLETE"
  assert error.value.details["stopReason"] == "max_tokens"
  assert error.value.details["attempt"] == 1
  assert len(client.calls) == 1
  assert json.loads(client.calls[0]["body"])["max_tokens"] == REFERENCE_BEDROCK_MAX_TOKENS


def test_reference_bedrock_incomplete_output_invokes_provider_exactly_once(monkeypatch) -> None:
  payload = FilterExtractionAnalyzeRequest(runAi=True)
  incomplete = _empty_max_tokens_response()
  incomplete["stop_reason"] = "tool_use"
  client = FakeBedrockClient([
    incomplete,
    _complete_tool_response(payload),
  ])
  service = ReferenceMakeupBedrockService(Settings(bedrock_analysis_model_id="test-model"))
  monkeypatch.setattr(service, "_bedrock_runtime_client", lambda: client)

  with pytest.raises(AppError) as error:
    service._analyze_sync(payload, b"image", "image/jpeg")

  assert error.value.code == "REFERENCE_BEDROCK_OUTPUT_INCOMPLETE"
  assert error.value.details["stopReason"] == "tool_use"
  assert len(client.calls) == 1


def test_reference_bedrock_sdk_disables_automatic_retries(monkeypatch) -> None:
  captured: dict = {}

  def fake_client(service_name: str, **kwargs):
    captured.update({"serviceName": service_name, **kwargs})
    return object()

  monkeypatch.setattr(reference_makeup_extraction.boto3, "client", fake_client)
  settings = Settings(
    bedrock_analysis_model_id="test-model",
    aws_access_key_id="test-key",
    aws_secret_access_key="test-secret",
  )

  ReferenceMakeupBedrockService(settings)._bedrock_runtime_client()

  assert captured["serviceName"] == "bedrock-runtime"
  assert captured["config"].retries == {
    "mode": "standard",
    "total_max_attempts": 1,
  }


@pytest.mark.parametrize(
  ("remove_path", "missing_field"),
  [
    (("look_dna",), "lookDna"),
    (("area_guides", 0, "placement"), "areaGuides.skin.placement"),
    (("points", 0, "description"), "points.0.description"),
  ],
)
def test_reference_bedrock_rejects_results_that_need_fixture_content(
  monkeypatch,
  remove_path,
  missing_field,
) -> None:
  payload = FilterExtractionAnalyzeRequest(runAi=True)
  response = _complete_tool_response(payload)
  look = response["content"][0]["input"]["extractedMakeupLook"]
  target = look
  for segment in remove_path[:-1]:
    target = target[segment]
  target.pop(remove_path[-1])
  client = FakeBedrockClient([response])
  service = ReferenceMakeupBedrockService(Settings(bedrock_analysis_model_id="test-model"))
  monkeypatch.setattr(service, "_bedrock_runtime_client", lambda: client)

  with pytest.raises(AppError) as error:
    service._analyze_sync(payload, b"image", "image/jpeg")

  assert error.value.code == "REFERENCE_BEDROCK_OUTPUT_INCOMPLETE"
  assert missing_field in error.value.details["missingFields"]


@pytest.mark.asyncio
async def test_incomplete_reference_output_is_not_converted_to_fallback(monkeypatch) -> None:
  payload = FilterExtractionAnalyzeRequest(runAi=True)

  async def fail_analyze(_self, _payload):
    raise AppError(
      502,
      "REFERENCE_BEDROCK_OUTPUT_INCOMPLETE",
      "Incomplete output.",
    )

  monkeypatch.setattr(ReferenceMakeupBedrockService, "analyze", fail_analyze)

  with pytest.raises(AppError) as error:
    await build_reference_makeup_extraction_payload_for_request(payload, Settings())

  assert error.value.code == "REFERENCE_BEDROCK_OUTPUT_INCOMPLETE"


@pytest.mark.asyncio
async def test_disabled_reference_ai_is_rejected_instead_of_returning_fixture() -> None:
  payload = FilterExtractionAnalyzeRequest(runAi=False)

  with pytest.raises(AppError) as error:
    await build_reference_makeup_extraction_payload_for_request(payload, Settings())

  assert error.value.code == "REFERENCE_MAKEUP_AI_REQUIRED"


@pytest.mark.asyncio
async def test_reference_provider_app_error_is_not_converted_to_fallback(monkeypatch) -> None:
  payload = FilterExtractionAnalyzeRequest(runAi=True)

  async def fail_analyze(_self, _payload):
    raise AppError(
      503,
      "BEDROCK_ANALYSIS_NOT_CONFIGURED",
      "Provider is unavailable.",
    )

  monkeypatch.setattr(ReferenceMakeupBedrockService, "analyze", fail_analyze)

  with pytest.raises(AppError) as error:
    await build_reference_makeup_extraction_payload_for_request(payload, Settings())

  assert error.value.code == "BEDROCK_ANALYSIS_NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_unknown_reference_provider_error_becomes_stable_api_error(monkeypatch) -> None:
  payload = FilterExtractionAnalyzeRequest(runAi=True)

  async def fail_analyze(_self, _payload):
    raise RuntimeError("provider secret must not reach the report")

  monkeypatch.setattr(ReferenceMakeupBedrockService, "analyze", fail_analyze)

  with pytest.raises(AppError) as error:
    await build_reference_makeup_extraction_payload_for_request(payload, Settings())

  assert error.value.code == "REFERENCE_BEDROCK_FAILED"
  assert error.value.details == {"reason": "RuntimeError"}


def test_bedrock_normalization_does_not_attach_fixture_products() -> None:
  payload = FilterExtractionAnalyzeRequest(runAi=True)
  look = _complete_tool_response(payload)["content"][0]["input"]["extractedMakeupLook"]

  normalized = _normalize_bedrock_payload(
    {"extractedMakeupLook": look},
    payload,
  )

  recommendations = [
    guide["product_recommendation"]
    for guide in normalized["extracted_makeup_look"]["area_guides"]
  ]
  assert all("product" not in recommendation for recommendation in recommendations)


@pytest.mark.parametrize(
  ("mutate", "missing_field"),
  [
    (
      lambda look: look.update({"look_dna": "not-an-object"}),
      "lookDna.type",
    ),
    (
      lambda look: look["area_guides"][0].update(
        {"product_recommendation": "not-an-object"},
      ),
      "areaGuides.skin.productRecommendation.type",
    ),
    (
      lambda look: look["look_dna"]["texture_balance"].pop(),
      "lookDna.textureBalance.items",
    ),
    (
      lambda look: look["look_dna"]["texture_balance"][0].update({"value": 101}),
      "lookDna.textureBalance.0.value",
    ),
    (
      lambda look: look["look_dna"]["texture_balance"][0].update({"value": 59}),
      "lookDna.textureBalance.total",
    ),
    (
      lambda look: look.update({"title": 123}),
      "title",
    ),
  ],
)
def test_reference_bedrock_rejects_malformed_structures_without_normalization_fallback(
  mutate,
  missing_field,
) -> None:
  payload = FilterExtractionAnalyzeRequest(runAi=True)
  look = _complete_tool_response(payload)["content"][0]["input"]["extractedMakeupLook"]
  mutate(look)

  with pytest.raises(AppError) as error:
    _normalize_bedrock_payload({"extractedMakeupLook": look}, payload)

  assert error.value.code == "REFERENCE_BEDROCK_OUTPUT_INCOMPLETE"
  assert missing_field in error.value.details["missingFields"]


def test_reference_bedrock_does_not_retry_other_incomplete_responses(monkeypatch) -> None:
  payload = FilterExtractionAnalyzeRequest(runAi=True)
  response = _empty_max_tokens_response()
  response["stop_reason"] = "tool_use"
  client = FakeBedrockClient([response])
  service = ReferenceMakeupBedrockService(Settings(bedrock_analysis_model_id="test-model"))
  monkeypatch.setattr(service, "_bedrock_runtime_client", lambda: client)

  with pytest.raises(AppError) as error:
    service._analyze_sync(payload, b"image", "image/jpeg")

  assert error.value.code == "REFERENCE_BEDROCK_OUTPUT_INCOMPLETE"
  assert len(client.calls) == 1
