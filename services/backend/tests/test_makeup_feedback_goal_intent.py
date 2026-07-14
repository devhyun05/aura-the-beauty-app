import pytest

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.makeup_feedback_goal_intent import (
  classify_makeup_feedback_goal_text,
  localize_makeup_feedback_intensity_terms,
  normalize_feedback_goal_context,
  normalize_feedback_goal_context_for_request,
)
@pytest.mark.parametrize(
  ("raw", "expected"),
  [
    ("사진에서 관찰되어 light로 요약했습니다.", "사진에서 관찰되어 가벼운 표현으로 요약했습니다."),
    ("현재 강도는 medium입니다.", "현재 강도는 적당한 강도입니다."),
    ("bold한 색조지만 highlight는 유지합니다.", "선명한 색조지만 highlight는 유지합니다."),
  ],
)
def test_localize_makeup_feedback_intensity_terms(raw: str, expected: str) -> None:
  assert localize_makeup_feedback_intensity_terms(raw) == expected




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
def test_goal_intent_preserves_generic_request_text(value: str) -> None:
  result = classify_makeup_feedback_goal_text(value)

  assert result == {
    "intentType": "generic_default",
    "normalizedGoalText": value,
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
  assert payload["feedbackContext"]["userGoalText"] == "\uc804\uccb4\uc801\uc73c\ub85c \ubd10\uc918"
  assert payload["feedbackContext"]["normalizedGoalText"] == "\uc804\uccb4\uc801\uc73c\ub85c \ubd10\uc918"


def test_normalize_feedback_goal_context_restores_original_goal_when_frontend_sends_legacy_default() -> None:
  legacy_default = "전체적인 메이크업 균형과 자연스러움 기준으로 피드백"
  payload = {
    "feedbackContext": {
      "goalIntentType": "generic_default",
      "normalizedGoalText": legacy_default,
      "originalGoalText": "\ubd84\uc11d\ud574\uc918",
      "userGoalText": legacy_default,
    },
  }

  normalize_feedback_goal_context(payload)

  assert payload["feedbackContext"]["goalIntentType"] == "generic_default"
  assert payload["feedbackContext"]["originalGoalText"] == "\ubd84\uc11d\ud574\uc918"
  assert payload["feedbackContext"]["userGoalText"] == "\ubd84\uc11d\ud574\uc918"
  assert payload["feedbackContext"]["normalizedGoalText"] == "\ubd84\uc11d\ud574\uc918"


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
