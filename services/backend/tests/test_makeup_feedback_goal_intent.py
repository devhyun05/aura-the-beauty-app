import pytest

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.makeup_feedback_goal_intent import (
  DEFAULT_MAKEUP_FEEDBACK_GOAL,
  classify_makeup_feedback_goal_text,
  normalize_feedback_goal_context,
  normalize_feedback_goal_context_for_request,
)


@pytest.mark.parametrize(
  "value",
  ["\u3157\u3157\u3157\u3157\u3157\u3157", "\u314b\u314b\u314b\u314b\u314b\u314b", "\u314e\u314e\u314e\u314e\u314e\u314e", "\u3131\u3131\u3131\u3131", "....", "!!!", "asdfasdf", "qwerqwer", "qwerty", "sdfghj", "123123", "a", "."],
)
def test_goal_intent_rejects_noise(value: str) -> None:
  result = classify_makeup_feedback_goal_text(value)

  assert result["intentType"] == "noise"
  assert result["normalizedGoalText"] == ""


@pytest.mark.parametrize(
  "value",
  [
    "\uc5ec\uce5c",
    "\uc5ec\uc790\uce5c\uad6c",
    "\uc5ec\uc790\uce5c\uad6c\ub791",
    "\uc774\uac70",
    "\uadf8\uac70",
    "\ub098 \uc5b4\ub5bb\uac8c",
    "\uc5b4\ub5a1\ud560\uac74\ub370 \uc5d0\ubca0\ubca0",
    "\ubab0\ub77c",
    "\ubab0\ub77c \u314b\u314b",
    "\uc800\ub807\uac8c",
  ],
)
def test_goal_intent_requests_more_detail_for_ambiguous_context(value: str) -> None:
  result = classify_makeup_feedback_goal_text(value)

  assert result["intentType"] == "needs_detail"
  assert result["normalizedGoalText"] == ""


@pytest.mark.parametrize(
  "value",
  [
    "\ud3c9\uac00\ud574\uc918",
    "\ubd84\uc11d\ud574\uc918",
    "\uc54c\uc544\uc11c \ud574\uc918",
    "\uc544\ubb34\uac70\ub098",
    "\uadf8\ub0e5",
    "\ubd10\uc918",
    "\uc5b4\ub54c",
    "\uc804\uccb4\uc801\uc73c\ub85c \ubd10\uc918",
    "\ub098 \uc5b4\ub5bb\uac8c \ubcf4\uc5ec?",
  ],
)
def test_goal_intent_maps_generic_request_to_default_goal(value: str) -> None:
  result = classify_makeup_feedback_goal_text(value)

  assert result == {
    "intentType": "generic_default",
    "normalizedGoalText": DEFAULT_MAKEUP_FEEDBACK_GOAL,
    "originalGoalText": value,
  }


@pytest.mark.parametrize(
  "value",
  [
    "\uc5ec\uc790\uce5c\uad6c\ub791 \uce74\ud398\uac00\uc57c\ud558\ub294 \uc0c1\ud669",
    "\uba74\uc811\uc6a9\uc73c\ub85c \uae54\ub054\ud55c\uc9c0 \ubd10\uc918",
    "\ub9bd \ucd94\ucc9c\ud574\uc918",
    "\uce74\ud398 \uba54\uc774\ud06c\uc5c5 \ucd94\ucc9c",
    "cafe date",
    "job interview",
    "id photo",
  ],
)
def test_goal_intent_keeps_valid_context(value: str) -> None:
  result = classify_makeup_feedback_goal_text(value)

  assert result == {
    "intentType": "valid_context",
    "normalizedGoalText": value,
    "originalGoalText": value,
  }


def test_goal_intent_does_not_domain_block_locally() -> None:
  result = classify_makeup_feedback_goal_text("\uce74\ud398 \ucd94\ucc9c")

  assert result["intentType"] == "valid_context"


def test_normalize_feedback_goal_context_updates_payload() -> None:
  payload = {"feedbackContext": {"userGoalText": "\uc804\uccb4\uc801\uc73c\ub85c \ubd10\uc918"}}

  normalize_feedback_goal_context(payload)

  assert payload["feedbackContext"]["goalIntentType"] == "generic_default"
  assert payload["feedbackContext"]["originalGoalText"] == "\uc804\uccb4\uc801\uc73c\ub85c \ubd10\uc918"
  assert payload["feedbackContext"]["userGoalText"] == DEFAULT_MAKEUP_FEEDBACK_GOAL
  assert payload["feedbackContext"]["normalizedGoalText"] == DEFAULT_MAKEUP_FEEDBACK_GOAL


def test_normalize_feedback_goal_context_uses_original_goal_when_frontend_sends_normalized_generic() -> None:
  payload = {
    "feedbackContext": {
      "goalIntentType": "generic_default",
      "normalizedGoalText": DEFAULT_MAKEUP_FEEDBACK_GOAL,
      "originalGoalText": "\ubd84\uc11d\ud574\uc918",
      "userGoalText": DEFAULT_MAKEUP_FEEDBACK_GOAL,
    },
  }

  normalize_feedback_goal_context(payload)

  assert payload["feedbackContext"]["goalIntentType"] == "generic_default"
  assert payload["feedbackContext"]["originalGoalText"] == "\ubd84\uc11d\ud574\uc918"
  assert payload["feedbackContext"]["userGoalText"] == DEFAULT_MAKEUP_FEEDBACK_GOAL


def test_normalize_feedback_goal_context_raises_for_noise_goal() -> None:
  payload = {"feedbackContext": {"userGoalText": "asdfasdf"}}

  with pytest.raises(AppError) as exc_info:
    normalize_feedback_goal_context(payload)

  assert exc_info.value.code == "FEEDBACK_GOAL_INVALID"


def test_normalize_feedback_goal_context_raises_for_ambiguous_goal() -> None:
  payload = {"feedbackContext": {"userGoalText": "\uc5ec\uce5c"}}

  with pytest.raises(AppError) as exc_info:
    normalize_feedback_goal_context(payload)

  assert exc_info.value.code == "FEEDBACK_GOAL_NEEDS_DETAIL"

def _guardrail_block_error(topic_name: str) -> AppError:
  return AppError(
    400,
    "FEEDBACK_GOAL_GUARDRAIL_BLOCKED",
    "blocked",
    {"detected": [{"policy": "topic", "name": topic_name, "action": "BLOCKED"}]},
  )


@pytest.mark.asyncio
async def test_normalize_request_allows_general_search_guardrail_false_positive_for_makeup_context(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def fake_guardrail_block(*_args, **_kwargs) -> None:
    raise _guardrail_block_error("General Search And Recommendations")

  monkeypatch.setattr(
    "app.services.makeup_feedback_goal_intent.assert_bedrock_guardrail_input_allowed",
    fake_guardrail_block,
  )
  payload = {"feedbackContext": {"userGoalText": "\uc5ec\uc790\uce5c\uad6c\ub791 \uce74\ud398\uac00\uc57c\ud558\ub294 \uc0c1\ud669"}}

  await normalize_feedback_goal_context_for_request(payload, Settings(bedrock_guardrail_id="gr-123", bedrock_guardrail_version="1"))

  assert payload["feedbackContext"]["goalIntentType"] == "valid_context"
  assert payload["feedbackContext"]["userGoalText"] == "\uc5ec\uc790\uce5c\uad6c\ub791 \uce74\ud398\uac00\uc57c\ud558\ub294 \uc0c1\ud669"


@pytest.mark.asyncio
async def test_normalize_request_keeps_general_search_block_for_recommendation_request(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def fake_guardrail_block(*_args, **_kwargs) -> None:
    raise _guardrail_block_error("General Search And Recommendations")

  monkeypatch.setattr(
    "app.services.makeup_feedback_goal_intent.assert_bedrock_guardrail_input_allowed",
    fake_guardrail_block,
  )
  payload = {"feedbackContext": {"userGoalText": "\uce74\ud398 \ucd94\ucc9c"}}

  with pytest.raises(AppError) as exc_info:
    await normalize_feedback_goal_context_for_request(payload, Settings(bedrock_guardrail_id="gr-123", bedrock_guardrail_version="1"))

  assert exc_info.value.code == "FEEDBACK_GOAL_GUARDRAIL_BLOCKED"


@pytest.mark.asyncio
async def test_normalize_request_does_not_override_other_denied_topics(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_guardrail_block(*_args, **_kwargs) -> None:
    raise _guardrail_block_error("Financial Advice")

  monkeypatch.setattr(
    "app.services.makeup_feedback_goal_intent.assert_bedrock_guardrail_input_allowed",
    fake_guardrail_block,
  )
  payload = {"feedbackContext": {"userGoalText": "\uce74\ud398 \uac08 \ub54c \uc790\uc5f0\uc2a4\ub7ec\uc6b4 \uba54\uc774\ud06c\uc5c5"}}

  with pytest.raises(AppError) as exc_info:
    await normalize_feedback_goal_context_for_request(payload, Settings(bedrock_guardrail_id="gr-123", bedrock_guardrail_version="1"))

  assert exc_info.value.code == "FEEDBACK_GOAL_GUARDRAIL_BLOCKED"
