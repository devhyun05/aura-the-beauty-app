import pytest

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.bedrock_guardrails import (
  BedrockGuardrailService,
  assert_bedrock_guardrail_input_allowed,
  build_bedrock_guardrail_invoke_kwargs,
)


class FakeGuardrailClient:
  def __init__(self, response: dict):
    self.response = response
    self.calls = []

  def apply_guardrail(self, **kwargs):
    self.calls.append(kwargs)
    return self.response


def test_build_bedrock_guardrail_invoke_kwargs_returns_empty_when_not_configured() -> None:
  assert build_bedrock_guardrail_invoke_kwargs(Settings()) == {}


def test_build_bedrock_guardrail_invoke_kwargs_uses_configured_guardrail() -> None:
  kwargs = build_bedrock_guardrail_invoke_kwargs(
    Settings(
      bedrock_guardrail_id="gr-123",
      bedrock_guardrail_version="7",
      bedrock_guardrail_trace=True,
    ),
  )

  assert kwargs == {
    "guardrailIdentifier": "gr-123",
    "guardrailVersion": "7",
    "trace": "ENABLED",
  }


@pytest.mark.asyncio
async def test_guardrail_allows_input_when_action_is_none(monkeypatch: pytest.MonkeyPatch) -> None:
  fake_client = FakeGuardrailClient({"action": "NONE"})
  monkeypatch.setattr(BedrockGuardrailService, "_client", lambda _self: fake_client)

  await assert_bedrock_guardrail_input_allowed(
    "여자친구랑 카페가야하는 상황",
    Settings(bedrock_guardrail_id="gr-123", bedrock_guardrail_version="1"),
    context="makeup_feedback_goal",
  )

  assert fake_client.calls[0]["guardrailIdentifier"] == "gr-123"
  assert fake_client.calls[0]["guardrailVersion"] == "1"
  assert fake_client.calls[0]["source"] == "INPUT"
  assert fake_client.calls[0]["content"][0]["text"]["qualifiers"] == ["guard_content"]
  del fake_client.calls[0]["content"][0]["text"]["qualifiers"]
  assert fake_client.calls[0]["content"] == [
    {"text": {"text": "여자친구랑 카페가야하는 상황"}},
  ]


@pytest.mark.asyncio
async def test_guardrail_blocks_intervened_input(monkeypatch: pytest.MonkeyPatch) -> None:
  fake_client = FakeGuardrailClient(
    {
      "action": "GUARDRAIL_INTERVENED",
      "actionReason": "Denied topic detected",
      "assessments": [
        {
          "topicPolicy": {
            "topics": [
              {"name": "Off-topic", "type": "DENY", "action": "BLOCKED"},
            ],
          },
        },
      ],
    },
  )
  monkeypatch.setattr(BedrockGuardrailService, "_client", lambda _self: fake_client)

  with pytest.raises(AppError) as exc_info:
    await assert_bedrock_guardrail_input_allowed(
      "코인 시세 알려줘",
      Settings(bedrock_guardrail_id="gr-123", bedrock_guardrail_version="1"),
      context="makeup_feedback_goal",
    )

  assert exc_info.value.code == "FEEDBACK_GOAL_GUARDRAIL_BLOCKED"
  assert exc_info.value.details["action"] == "GUARDRAIL_INTERVENED"
  assert exc_info.value.details["detected"] == [
    {"policy": "topic", "name": "Off-topic", "action": "BLOCKED"},
  ]


@pytest.mark.asyncio
async def test_guardrail_required_requires_id_and_version() -> None:
  with pytest.raises(AppError) as exc_info:
    await assert_bedrock_guardrail_input_allowed(
      "여자친구랑 카페가야하는 상황",
      Settings(bedrock_guardrail_required=True),
      context="makeup_feedback_goal",
    )

  assert exc_info.value.code == "BEDROCK_GUARDRAIL_NOT_CONFIGURED"