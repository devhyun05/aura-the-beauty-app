import json

import pytest

from app.core.errors import AppError
from app.core.settings import Settings
from app.schemas.analysis import FilterExtractionAnalyzeRequest
from app.services.reference_makeup_extraction import (
  REFERENCE_BEDROCK_MAX_TOKENS,
  REFERENCE_BEDROCK_RETRY_MAX_TOKENS,
  ReferenceMakeupBedrockService,
  build_reference_makeup_extraction_payload,
  build_reference_makeup_extraction_payload_for_request,
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


def test_reference_bedrock_retries_only_after_max_tokens(monkeypatch) -> None:
  payload = FilterExtractionAnalyzeRequest(runAi=True)
  client = FakeBedrockClient([
    _empty_max_tokens_response(),
    _complete_tool_response(payload),
  ])
  service = ReferenceMakeupBedrockService(Settings(bedrock_analysis_model_id="test-model"))
  monkeypatch.setattr(service, "_bedrock_runtime_client", lambda: client)

  result = service._analyze_sync(payload, b"image", "image/jpeg")

  token_limits = [json.loads(call["body"])["max_tokens"] for call in client.calls]
  assert token_limits == [REFERENCE_BEDROCK_MAX_TOKENS, REFERENCE_BEDROCK_RETRY_MAX_TOKENS]
  assert result["extracted_makeup_look"]["area_guides"]


def test_reference_bedrock_rejects_incomplete_retry(monkeypatch) -> None:
  payload = FilterExtractionAnalyzeRequest(runAi=True)
  client = FakeBedrockClient([
    _empty_max_tokens_response(),
    _empty_max_tokens_response(),
  ])
  service = ReferenceMakeupBedrockService(Settings(bedrock_analysis_model_id="test-model"))
  monkeypatch.setattr(service, "_bedrock_runtime_client", lambda: client)

  with pytest.raises(AppError) as error:
    service._analyze_sync(payload, b"image", "image/jpeg")

  assert error.value.code == "REFERENCE_BEDROCK_OUTPUT_INCOMPLETE"
  assert len(client.calls) == 2


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
