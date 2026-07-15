import asyncio
import json
import time
from pathlib import Path

import pytest

from app.core.errors import AppError
from app.core.settings import Settings
from app.services import makeup_feedback_conference as conference_service
from app.services.makeup_feedback_analysis import normalize_makeup_feedback_result
from app.services.makeup_feedback_conference import (
  CONFERENCE_PROMPT_PATH,
  DETAIL_TITLE_DIGEST_REF,
  MAX_DETAIL_TITLE_DIGEST_LENGTH,
  MAX_EVIDENCE_ITEMS,
  MAX_MESSAGE_TEXT_LENGTH,
  MakeupFeedbackConferenceBedrockService,
  _allowed_evidence_refs,
  _apply_detail_title_digest,
  _build_prompt,
  _compact_feedback_result,
  _detail_title_digest_text,
  _evidence_text_by_ref,
  _grounding_context_supports_roundtable,
  _is_final_non_claim_transition,
  _is_valid_conference_shape,
  build_makeup_feedback_conference_messages,
  normalize_conference_messages,
)


def _request_payload() -> dict:
  return {
    "feedbackContext": {
      "userGoalText": "여행 중 오래 유지되는 자연스러운 메이크업",
    },
  }


def _full_result() -> dict:
  return {
    "score": 72,
    "scoreLabel": "종합 점수",
    "scoreReason": "립 경계는 안정적이지만 치크 경계는 목적에 맞게 한 번 더 정리할 여지가 있습니다.",
    "interpretedGoal": {
      "label": "여행용 내추럴 메이크업",
      "intensity": "light",
      "dynamicCriteria": [
        {"id": "goal-1", "criterion": "오랜 이동에도 경계가 지저분해 보이지 않는지 확인합니다."},
        {"id": "goal-2", "criterion": "사진에서 과하지 않은 발색 균형을 확인합니다."},
      ],
    },
    "captureQuality": {
      "usable": True,
      "colorConfidence": "medium",
      "issues": [
        {
          "code": "side-shadow",
          "message": "한쪽 볼에 약한 그림자가 있어 색상 관찰은 조명을 감안했습니다.",
          "affectedTopicIds": ["blush"],
        },
      ],
    },
    "strengths": [
      {
        "id": "lip-strength",
        "topicId": "lip",
        "topicLabel": "립",
        "title": "경계가 안정적이에요",
        "description": "입술 외곽이 크게 번지지 않고 정돈되어 보여요.",
        "actionSteps": ["현재의 얇은 외곽 정리를 유지하세요."],
      },
    ],
    "points": [
      {
        "id": "blush-improvement",
        "topicId": "blush",
        "topicLabel": "치크",
        "title": "바깥 경계를 한 번 더 풀어주세요",
        "description": "볼 바깥쪽 경계가 목적에 비해 조금 또렷하게 보여요.",
        "actionSteps": ["남은 양이 거의 없는 브러시로 바깥 경계를 한 번 쓸어주세요."],
      },
    ],
    "evaluations": [
      {
        "id": "lip-strength",
        "topicId": "lip",
        "topicLabel": "립",
        "status": "strength",
        "observations": [
          {
            "id": "lip-obs-1",
            "claim": "입술 외곽선이 양쪽에서 고르게 이어져 보여요.",
            "evidenceLocation": "윗입술 산과 아랫입술 외곽",
          },
        ],
        "goalCriterionIds": ["goal-1"],
        "actionSteps": ["현재의 얇은 외곽 정리를 유지하세요."],
      },
      {
        "id": "blush-improvement",
        "topicId": "blush",
        "topicLabel": "치크",
        "status": "improvement",
        "visibilityReason": "오른쪽 볼은 그림자 영향으로 경계를 일부만 확인할 수 있어요.",
        "observations": [
          {
            "id": "blush-obs-1",
            "claim": "볼 바깥쪽에 색 경계가 한 줄 남아 보여요.",
            "evidenceLocation": "오른쪽 광대 바깥",
            "lightingSensitive": True,
          },
        ],
        "goalCriterionIds": ["goal-1", "goal-2"],
        "actionSteps": ["남은 양이 거의 없는 브러시로 바깥 경계를 한 번 쓸어주세요."],
      },
      {
        "id": "eye-optional",
        "topicId": "eye",
        "topicLabel": "아이",
        "status": "optional",
        "title": "HIDDEN_OPTIONAL",
        "description": "HIDDEN_OPTIONAL_DESCRIPTION",
        "observations": [
          {
            "id": "hidden-obs",
            "claim": "HIDDEN_OPTIONAL_OBSERVATION",
            "evidenceLocation": "HIDDEN_OPTIONAL_LOCATION",
          },
        ],
        "goalCriterionIds": [],
        "actionSteps": ["HIDDEN_OPTIONAL_ACTION"],
      },
    ],
  }


def _generated_messages() -> list[dict]:
  return [
    {
      "agentId": "photo",
      "text": "사진은 활용할 수 있지만 볼 색은 조명 영향을 함께 감안해 볼게요.",
      "evidenceRefs": ["capture:usable", "capture:color-confidence"],
    },
    {
      "agentId": "goal",
      "text": "그 조건이라면 여행 중에도 경계가 깔끔해 보이는지를 먼저 보죠.",
      "evidenceRefs": ["goal:goal-1", "capture:color-confidence"],
    },
    {
      "agentId": "detail",
      "text": "그 기준에서 립 외곽은 고르게 이어지고, 치크 바깥에는 한 줄이 남아 보여요.",
      "evidenceRefs": ["observation:lip-obs-1", "observation:blush-obs-1"],
    },
    {
      "agentId": "coach",
      "text": "립은 유지하고 치크 바깥만 남은 양 없는 브러시로 정리하는 순서가 좋겠어요.",
      "evidenceRefs": ["strength:lip-strength", "action:blush:1"],
    },
    {
      "agentId": "detail",
      "text": "그러면 잘된 립 경계는 건드리지 않으면서 변화도 또렷하게 느껴지겠네요.",
      "evidenceRefs": ["strength:lip-strength", "point:blush-improvement"],
    },
    {
      "agentId": "coach",
      "text": "이제 함께 정리한 피드백 결과를 확인해볼까요?",
      "evidenceRefs": [],
    },
  ]


def _preview_context(*, last_speaker: str = "goal") -> dict:
  last_text = (
    "사진 출처 정보까지만 바탕으로 실제 관찰 순서를 잡아볼게요."
    if last_speaker == "photo"
    else "조명 조건을 감안하면서 사용자 목적 기준을 함께 연결해볼게요."
  )
  return {
    "messages": [
      {
        "agentId": "detail",
        "text": "목적 기준으로 어떤 부위를 먼저 비교할지 정리해볼게요.",
      },
      {"agentId": last_speaker, "text": last_text},
    ],
    "summary": (
      "실제 사진 관찰 전, 사용자 목적과 이미지 출처를 바탕으로 "
      "확인 순서만 정리했습니다."
    ),
    "lastSpeaker": last_speaker,
  }


def _continuing_generated_messages() -> list[dict]:
  messages = _generated_messages()
  messages[0] = {
    **messages[0],
    "text": f"그 기준을 이어서 {messages[0]['text']}",
  }
  return messages


def test_compact_feedback_result_builds_bounded_visible_evidence_catalog():
  compact = _compact_feedback_result(_full_result(), _request_payload())
  evidence_catalog = compact["evidenceCatalog"]
  evidence_by_ref = {item["ref"]: item for item in evidence_catalog}

  assert set(compact) == {"evidenceCatalog"}
  assert {
    "score-reason",
    "goal:user-input",
    "goal:summary",
    "goal:goal-1",
    "goal:goal-2",
    "capture:usable",
    "capture:color-confidence",
    "capture:side-shadow",
    "strength:lip-strength",
    "point:blush-improvement",
    "action:lip:1",
    "action:blush:1",
    "observation:lip-obs-1",
    "observation:blush-obs-1",
  } <= set(evidence_by_ref)
  blush_observation = evidence_by_ref["observation:blush-obs-1"]
  assert blush_observation["goalCriterionIds"] == ["goal-1", "goal-2"]
  assert blush_observation["visibilityReason"] == "오른쪽 볼은 그림자 영향으로 경계를 일부만 확인할 수 있어요."
  assert blush_observation["lightingSensitive"] is True
  assert blush_observation["text"].startswith("가시성 제한:")
  assert "조명에 따라 다르게 보일 수 있는 관찰" in blush_observation["text"]
  assert len(evidence_catalog) <= MAX_EVIDENCE_ITEMS
  assert all(
    len(item["text"]) <= 240
    for item in evidence_catalog
    if item["ref"] != DETAIL_TITLE_DIGEST_REF
  )
  assert len(_detail_title_digest_text({"evidenceCatalog": evidence_catalog})) <= MAX_DETAIL_TITLE_DIGEST_LENGTH
  assert len(evidence_catalog) == len(evidence_by_ref)

  serialized = json.dumps(compact, ensure_ascii=False)
  assert "HIDDEN_OPTIONAL" not in serialized
  assert "HIDDEN_OPTIONAL_DESCRIPTION" not in serialized
  assert "HIDDEN_OPTIONAL_OBSERVATION" not in serialized
  assert "HIDDEN_OPTIONAL_ACTION" not in serialized
  assert '"intensity"' not in serialized
  assert '"status"' not in serialized


def test_compact_feedback_result_prefers_server_analysis_goal():
  payload = _request_payload()
  payload["feedbackContext"].update(
    {
      "analysisGoalText": "외출 상황",
      "userGoalText": "처음 가는 야시장",
    },
  )

  compact = _compact_feedback_result(_full_result(), payload)
  serialized = json.dumps(compact, ensure_ascii=False)
  goal_evidence = next(
    item
    for item in compact["evidenceCatalog"]
    if item["ref"] == "goal:user-input"
  )

  assert "외출 상황" in goal_evidence["text"]
  assert "처음 가는 야시장" not in serialized


def _many_title_result() -> dict:
  result = _full_result()
  result["strengths"] = [
    {
      "id": f"strength-{index}",
      "topicId": f"strength-topic-{index}",
      "topicLabel": f"HIDDEN_STRENGTH_TOPIC_{index}",
      "status": "strength",
      "title": f"강점 제목 {index}",
      "description": f"MUST_NOT_RENDER_STRENGTH_DESCRIPTION_{index}",
    }
    for index in range(3)
  ]
  result["points"] = [
    {
      "id": f"point-{index}",
      "topicId": f"point-topic-{index}",
      "topicLabel": f"HIDDEN_POINT_TOPIC_{index}",
      "status": "improvement",
      "title": f"보완 제목 {index}",
      "description": f"MUST_NOT_RENDER_POINT_DESCRIPTION_{index}",
    }
    for index in range(6)
  ]
  return result


def test_detail_digest_contains_all_nine_titles_without_descriptions_or_topics():
  result = _many_title_result()
  compact = _compact_feedback_result(result, _request_payload())
  digest = _detail_title_digest_text(compact)
  evidence_by_ref = _evidence_text_by_ref(compact)

  assert DETAIL_TITLE_DIGEST_REF in evidence_by_ref
  assert digest.count("\n") == 1
  assert digest.splitlines()[0].startswith("잘한 점은 ")
  assert digest.splitlines()[1].startswith("보완할 점은 ")
  for index in range(3):
    assert f"강점 제목 {index}" in digest
    assert f"MUST_NOT_RENDER_STRENGTH_DESCRIPTION_{index}" not in digest
    assert f"HIDDEN_STRENGTH_TOPIC_{index}" not in digest
  for index in range(6):
    assert f"보완 제목 {index}" in digest
    assert f"MUST_NOT_RENDER_POINT_DESCRIPTION_{index}" not in digest
    assert f"HIDDEN_POINT_TOPIC_{index}" not in digest


def test_detail_digest_replaces_all_detail_turns_with_one_grounded_bubble():
  result = _many_title_result()
  compact = _compact_feedback_result(result, _request_payload())
  evidence_by_ref = _evidence_text_by_ref(
    _compact_feedback_result(_full_result(), _request_payload()),
  )
  normalized = normalize_conference_messages(_generated_messages(), evidence_by_ref)

  assert sum(message["agentId"] == "detail" for message in normalized) == 2
  rendered = _apply_detail_title_digest(normalized, compact)
  detail_messages = [
    message for message in rendered if message["agentId"] == "detail"
  ]

  assert len(detail_messages) == 1
  assert detail_messages[0]["evidenceRefs"] == [DETAIL_TITLE_DIGEST_REF]
  assert detail_messages[0]["text"] == _detail_title_digest_text(compact)
  assert detail_messages[0]["text"].count("\n") == 1
  assert "강점 제목 2" in detail_messages[0]["text"]
  assert "보완 제목 5" in detail_messages[0]["text"]
  assert "MUST_NOT_RENDER" not in detail_messages[0]["text"]


def test_compact_feedback_result_caps_large_payloads_and_text():
  result = _full_result()
  result["strengths"] = [
    {
      "id": f"s-{index}",
      "topicId": f"s-{index}",
      "topicLabel": f"강점 {index}",
      "title": "S" * 500,
      "description": "D" * 500,
      "actionSteps": [f"{index}-{step}-" + ("A" * 500) for step in range(3)],
    }
    for index in range(4)
  ]
  result["points"] = [
    {
      "id": f"p-{index}",
      "topicId": f"p-{index}",
      "topicLabel": f"보완 {index}",
      "title": "P" * 500,
      "description": "D" * 500,
      "actionSteps": [f"{index}-{step}-" + ("B" * 500) for step in range(3)],
    }
    for index in range(4)
  ]
  result["evaluations"] = [
    {
      "id": f"e-{index}",
      "topicId": f"e-{index}",
      "status": "strength",
      "observations": [
        {
          "id": f"e-{index}-obs-{observation_index}",
          "claim": "C" * 500,
          "evidenceLocation": "L" * 500,
        }
        for observation_index in range(3)
      ],
      "goalCriterionIds": ["goal-1"],
      "actionSteps": [f"E-{index}-{step}-" + ("A" * 500) for step in range(3)],
    }
    for index in range(12)
  ]

  evidence_catalog = _compact_feedback_result(result, _request_payload())["evidenceCatalog"]

  assert len(evidence_catalog) == MAX_EVIDENCE_ITEMS
  assert len({item["ref"] for item in evidence_catalog}) == MAX_EVIDENCE_ITEMS
  assert all(
    len(item["text"]) <= 240
    for item in evidence_catalog
    if item["ref"] != DETAIL_TITLE_DIGEST_REF
  )
  assert len(_detail_title_digest_text({"evidenceCatalog": evidence_catalog})) <= MAX_DETAIL_TITLE_DIGEST_LENGTH


def test_external_prompt_loads_utf8_and_keeps_server_contract():
  prompt = _build_prompt(_full_result(), _request_payload())

  assert CONFERENCE_PROMPT_PATH.read_text(encoding="utf-8").startswith("<!--")
  assert "네 명의 리뷰 크루" in prompt
  assert "photo | goal | detail | coach" in prompt
  assert "SERVER-ENFORCED OUTPUT AND GROUNDING CONTRACT" in prompt
  assert "Every factual message must list one or more exact evidenceCatalog ref values" in prompt
  assert "가시성·조명 제한을 관찰보다 먼저 말하고" in prompt
  assert "visibilityReason or lightingSensitive=true" in prompt
  assert "{{EVIDENCE_CONTEXT_JSON}}" not in prompt
  assert "{{PREVIEW_HANDOFF_JSON}}" not in prompt
  assert "{{OUTPUT_CONTRACT_JSON}}" not in prompt
  assert "HIDDEN_OPTIONAL" not in prompt
  assert '"ref": "goal:goal-1"' in prompt


def test_prompt_template_placeholders_are_validated(tmp_path):
  invalid_template = tmp_path / "invalid-conference.md"
  invalid_template.write_text(
    "{{EVIDENCE_CONTEXT_JSON}}\n{{UNKNOWN_PLACEHOLDER}}",
    encoding="utf-8",
  )

  with pytest.raises(AppError) as exc_info:
    _build_prompt(
      _full_result(),
      _request_payload(),
      template_path=invalid_template,
    )

  assert exc_info.value.code == "FEEDBACK_CONFERENCE_PROMPT_TEMPLATE_INVALID"
  assert exc_info.value.details["missing"] == [
    "OUTPUT_CONTRACT_JSON",
    "PREVIEW_HANDOFF_JSON",
  ]
  assert exc_info.value.details["unknown"] == ["UNKNOWN_PLACEHOLDER"]


def test_prompt_uses_preview_context_only_as_a_conversation_handoff():
  request_payload = _request_payload()
  request_payload["previewContext"] = _preview_context()

  prompt = _build_prompt(_full_result(), request_payload)

  assert '"lastSpeaker":"goal"' in prompt
  assert "조명 조건을 감안하면서 사용자 목적 기준을 함께 연결해볼게요." in prompt
  assert "PREVIEW_HANDOFF_JSON" not in prompt
  assert "사진 사실의 근거가 아닙니다" in prompt
  evidence_context = prompt.split("# 입력 근거", 1)[1]
  assert "조명 조건을 감안하면서 사용자 목적 기준을 함께 연결해볼게요." not in evidence_context


def test_shape_requires_a_natural_preview_handoff():
  continuing_messages = _continuing_generated_messages()

  assert _is_valid_conference_shape(
    continuing_messages,
    preview_handoff=_preview_context(),
  ) is True
  assert _is_valid_conference_shape(
    continuing_messages,
    preview_handoff=_preview_context(last_speaker="photo"),
  ) is False
  assert _is_valid_conference_shape(
    _generated_messages(),
    preview_handoff=_preview_context(),
  ) is False


def test_preview_handoff_uses_last_displayed_message_over_stale_speaker():
  preview = _preview_context(last_speaker="goal")
  preview["lastSpeaker"] = "photo"

  prompt = _build_prompt(
    _full_result(),
    _request_payload(),
    preview_context=preview,
  )

  assert '"lastSpeaker":"goal"' in prompt


def test_normalizer_intersects_refs_and_preserves_natural_roundtable():
  compact = _compact_feedback_result(_full_result(), _request_payload())
  evidence_by_ref = _evidence_text_by_ref(compact)
  allowed_refs = set(evidence_by_ref)
  raw_messages = _generated_messages()
  raw_messages[0]["evidenceRefs"].append("capture:invented")

  messages = normalize_conference_messages(raw_messages, evidence_by_ref)

  assert _grounding_context_supports_roundtable(allowed_refs) is True
  assert _is_valid_conference_shape(messages) is True
  assert messages[0]["evidenceRefs"] == ["capture:usable", "capture:color-confidence"]
  assert messages[-1]["evidenceRefs"] == []
  assert {message["agentId"] for message in messages} == {"photo", "goal", "detail", "coach"}


@pytest.mark.parametrize(
  "hallucinated_text",
  [
    "입술 외곽은 고르게 보이지만 not_applicable 상태이며 피부 질환은 치료하면 낫습니다.",
    "입술 외곽은 고르게 보이지만 optional 상태입니다.",
    "입술 외곽은 고르게 보이니 샤넬 립 제품 추천을 확인하세요.",
  ],
)
def test_normalizer_rejects_forbidden_hallucination_even_with_valid_ref(
  hallucinated_text,
):
  evidence_by_ref = _evidence_text_by_ref(
    _compact_feedback_result(_full_result(), _request_payload()),
  )

  messages = normalize_conference_messages(
    [
      {
        "agentId": "detail",
        "text": hallucinated_text,
        "evidenceRefs": ["observation:lip-obs-1"],
      },
    ],
    evidence_by_ref,
  )

  assert messages == []


def test_normalizer_replaces_unrelated_claim_with_exact_evidence():
  evidence_by_ref = _evidence_text_by_ref(
    _compact_feedback_result(_full_result(), _request_payload()),
  )
  raw_text = "오늘 비가 오니 우산을 챙기고 지하철 시간을 확인하세요."

  messages = normalize_conference_messages(
    [
      {
        "agentId": "detail",
        "text": raw_text,
        "evidenceRefs": ["observation:lip-obs-1"],
      },
    ],
    evidence_by_ref,
  )

  assert len(messages) == 1
  assert raw_text not in messages[0]["text"]
  assert evidence_by_ref["observation:lip-obs-1"] in messages[0]["text"]
  assert messages[0]["evidenceRefs"] == ["observation:lip-obs-1"]


def test_normalizer_accepts_natural_inflection_grounded_in_observation():
  evidence_by_ref = _evidence_text_by_ref(
    _compact_feedback_result(_full_result(), _request_payload()),
  )

  messages = normalize_conference_messages(
    [
      {
        "agentId": "detail",
        "text": "입술 외곽은 양쪽에서 고르게 이어져 보여요.",
        "evidenceRefs": ["observation:lip-obs-1"],
      },
    ],
    evidence_by_ref,
  )

  assert len(messages) == 1
  assert evidence_by_ref["observation:lip-obs-1"] in messages[0]["text"]


def test_normalizer_never_displays_contradictory_model_clause_with_valid_ref():
  evidence_by_ref = _evidence_text_by_ref(
    _compact_feedback_result(_full_result(), _request_payload()),
  )
  raw_text = "입술 외곽은 검게 번졌고 심하게 비대칭이에요."

  messages = normalize_conference_messages(
    [{
      "agentId": "detail",
      "text": raw_text,
      "evidenceRefs": ["observation:lip-obs-1"],
    }],
    evidence_by_ref,
  )

  assert len(messages) == 1
  assert raw_text not in messages[0]["text"]
  assert evidence_by_ref["observation:lip-obs-1"] in messages[0]["text"]


def test_live_fixture_messages_pass_grounded_normalization():
  fixture_path = (
    Path(__file__).resolve().parents[3]
    / "contracts"
    / "makeup-feedback"
    / "camera-server-quality-v1.json"
  )
  fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
  result = normalize_makeup_feedback_result(
    fixture["bedrockResponse"],
    fixture["requestPayload"],
  )
  evidence_by_ref = _evidence_text_by_ref(
    _compact_feedback_result(result, fixture["requestPayload"]),
  )
  raw_messages = [
    {
      "agentId": "photo",
      "text": "사진 색상 정보는 비교적 안정적으로 관찰할 수 있어요.",
      "evidenceRefs": ["capture:color-confidence"],
    },
    {
      "agentId": "goal",
      "text": "Balanced color and edge intensity matter for an everyday finish.",
      "evidenceRefs": ["goal:goal-1"],
    },
    {
      "agentId": "detail",
      "text": "The brow shape remains visible at both brows.",
      "evidenceRefs": ["observation:brow-observation-1"],
    },
    {
      "agentId": "detail",
      "text": "The lash definition remains visible at the upper lash lines.",
      "evidenceRefs": ["observation:lash-observation-1"],
    },
    {
      "agentId": "coach",
      "text": "Separate the outer lashes with a clean spoolie, then show the result.",
      "evidenceRefs": ["action:lash:1"],
    },
  ]

  messages = normalize_conference_messages(raw_messages, evidence_by_ref)

  assert len(messages) == 5
  assert _is_valid_conference_shape(messages) is True


def test_shape_allows_adjacent_same_role_for_separate_grounded_observations():
  messages = [
    {"agentId": "photo"},
    {"agentId": "goal"},
    {"agentId": "detail"},
    {"agentId": "detail"},
    {"agentId": "coach"},
  ]

  assert _is_valid_conference_shape(messages) is True


def test_normalizer_rejects_invalid_agents_unsupported_claims_and_role_mismatch():
  allowed_refs = _allowed_evidence_refs(
    _compact_feedback_result(_full_result(), _request_payload()),
  )
  raw_messages = [
    {
      "agentId": "tone",
      "text": "구 역할은 허용되지 않아요.",
      "evidenceRefs": ["capture:usable"],
    },
    {
      "agentId": "photo",
      "text": "목적을 새로 판단해요.",
      "evidenceRefs": ["goal:goal-1"],
    },
    {
      "agentId": "detail",
      "text": "근거 없이 립을 평가해요.",
      "evidenceRefs": ["observation:invented"],
    },
    {
      "agentId": "coach",
      "text": "립 점수 결과를 확인해볼까요?",
      "evidenceRefs": [],
    },
  ]

  assert normalize_conference_messages(raw_messages, allowed_refs) == []
  assert _is_final_non_claim_transition("이제 정리한 피드백 결과를 확인해볼까요?") is True
  assert _is_final_non_claim_transition("립 점수 결과를 확인해볼까요?") is False


def test_normalizer_keeps_korean_text_within_total_length_limit():
  evidence_by_ref = {"observation:lip-obs-1": "가" * 240}
  messages = normalize_conference_messages(
    [
      {
        "agentId": "detail",
        "text": "가" * 300,
        "evidenceRefs": ["observation:lip-obs-1"],
      },
    ],
    evidence_by_ref,
  )

  assert len(messages[0]["text"]) == MAX_MESSAGE_TEXT_LENGTH
  assert messages[0]["text"].endswith("...")


class _FakeResponseBody:
  def __init__(self, payload: dict) -> None:
    self.payload = payload

  def read(self) -> bytes:
    return json.dumps(self.payload, ensure_ascii=False).encode("utf-8")


class _FakeBedrockClient:
  def __init__(self, messages: list[dict]) -> None:
    self.messages = messages
    self.calls: list[dict] = []

  def invoke_model(self, **kwargs):
    self.calls.append(kwargs)
    output_text = json.dumps({"messages": self.messages}, ensure_ascii=False)

    return {
      "body": _FakeResponseBody(
        {"content": [{"type": "text", "text": output_text}]},
      ),
    }


def test_bedrock_generation_uses_grounded_refs_and_returns_valid_shape(monkeypatch):
  settings = Settings(
    ai_provider="bedrock",
    bedrock_analysis_model_id="test-conference-model",
  )
  service = MakeupFeedbackConferenceBedrockService(settings)
  fake_client = _FakeBedrockClient(_generated_messages())
  monkeypatch.setattr(service, "_bedrock_runtime_client", lambda: fake_client)

  messages = service._generate_sync(_full_result(), _request_payload())
  detail_messages = [
    message for message in messages if message["agentId"] == "detail"
  ]
  assert len(detail_messages) == 1
  assert detail_messages[0]["evidenceRefs"] == [DETAIL_TITLE_DIGEST_REF]
  for item in [*_full_result()["strengths"], *_full_result()["points"]]:
    assert item["title"] in detail_messages[0]["text"]
    assert item["description"] not in detail_messages[0]["text"]
  assert detail_messages[0]["text"].count("\n") == 1

  assert _is_valid_conference_shape(messages) is True
  assert messages[-1] == {
    "agentId": "coach",
    "text": "이제 함께 정리한 피드백 결과를 확인해볼까요?",
    "evidenceRefs": [],
  }
  assert fake_client.calls[0]["modelId"] == "test-conference-model"

  request_body = json.loads(fake_client.calls[0]["body"])
  rendered_prompt = request_body["messages"][0]["content"][0]["text"]
  assert request_body["temperature"] == 0.62
  assert "goal:goal-1" in rendered_prompt
  assert "capture:usable" in rendered_prompt
  assert "HIDDEN_OPTIONAL" not in rendered_prompt


def test_bedrock_generation_continues_preview_with_a_different_first_speaker(
  monkeypatch,
):
  settings = Settings(
    ai_provider="bedrock",
    bedrock_analysis_model_id="test-conference-model",
  )
  service = MakeupFeedbackConferenceBedrockService(settings)
  preview_context = _preview_context()
  fake_client = _FakeBedrockClient(_continuing_generated_messages())
  monkeypatch.setattr(service, "_bedrock_runtime_client", lambda: fake_client)

  messages = service._generate_sync(
    _full_result(),
    _request_payload(),
    preview_context=preview_context,
  )

  assert messages[0]["agentId"] != preview_context["lastSpeaker"]
  assert messages[0]["text"].startswith("그 기준을 이어서")
  assert _is_valid_conference_shape(
    messages,
    preview_handoff=preview_context,
  ) is True

  request_body = json.loads(fake_client.calls[0]["body"])
  rendered_prompt = request_body["messages"][0]["content"][0]["text"]
  assert "조명 조건을 감안하면서 사용자 목적 기준을 함께 연결해볼게요." in rendered_prompt


def test_async_generation_has_a_total_deadline(monkeypatch):
  settings = Settings(
    ai_provider="bedrock",
    bedrock_analysis_model_id="test-conference-model",
  )
  service = MakeupFeedbackConferenceBedrockService(settings)

  def slow_generate_sync(*_args):
    time.sleep(0.05)
    return []

  monkeypatch.setattr(
    conference_service,
    "CONFERENCE_GENERATION_TIMEOUT_SECONDS",
    0.01,
  )
  monkeypatch.setattr(service, "_generate_sync", slow_generate_sync)

  with pytest.raises(AppError) as exc_info:
    asyncio.run(service.generate({}, {}))

  assert exc_info.value.code == "FEEDBACK_CONFERENCE_GENERATION_TIMEOUT"
  assert exc_info.value.details == {"timeoutSeconds": 0.01}


def test_legacy_payload_fails_gracefully_without_invoking_bedrock():
  settings = Settings(
    ai_provider="bedrock",
    bedrock_analysis_model_id="test-conference-model",
  )
  messages, status, error = asyncio.run(
    build_makeup_feedback_conference_messages(
      {"score": 80, "strengths": [], "points": []},
      {"feedbackContext": {"userGoalText": "minimal makeup"}},
      settings,
    ),
  )

  assert messages == []
  assert status == "bedrock_failed_fallback"
  assert error is not None
  assert error["code"] == "FEEDBACK_CONFERENCE_GROUNDING_INCOMPLETE"
