import io
import json
import random
from types import SimpleNamespace

import pytest

from app.core.settings import Settings
from app.services import makeup_journey_missions as mission_service


def test_generated_mission_schema_accepts_only_an_exact_normalized_object() -> None:
  assert mission_service._validate_generated_titles(
    {"missions": ["  블러셔 경계를 한 번 풀기  ", "아이라인 길이를 좌우 비교하기"]},
    2,
  ) == [
    "블러셔 경계를 한 번 풀기",
    "아이라인 길이를 좌우 비교하기",
  ]
  assert mission_service._validate_generated_titles({"missions": ["x" * 120]}, 1) == [
    "x" * 120,
  ]


@pytest.mark.parametrize(
  "payload",
  [
    ["블러셔 경계 풀기", "아이라인 비교하기"],
    {"missions": "invalid"},
    {"missions": ["블러셔 경계 풀기"]},
    {"missions": ["하나", "둘", "셋"]},
    {"missions": [{"title": "하나"}, "둘"]},
    {"missions": [1, "둘"]},
    {"missions": ["   ", "둘"]},
    {"missions": ["x" * 121, "둘"]},
    {"missions": ["Blend once", "  blend once  "]},
    {"missions": ["하나", "둘"], "unexpected": True},
  ],
)
def test_generated_mission_schema_rejects_the_entire_invalid_response(payload: object) -> None:
  assert mission_service._validate_generated_titles(payload, 2) == []


def test_generated_mission_json_validation_rejects_invalid_json() -> None:
  assert mission_service._validate_generated_json("not-json", 2) == []
  assert mission_service._validate_generated_json(None, 2) == []
  assert mission_service._validate_generated_json(
    '```json\n{"missions":["하나","둘"]}\n```',
    2,
  ) == ["하나", "둘"]


def test_bedrock_and_openai_outputs_share_the_strict_schema(monkeypatch) -> None:
  invalid_response = {"missions": ["하나"], "unexpected": True}
  bedrock_requests: list[dict] = []
  openai_requests: list[dict] = []

  class BedrockClient:
    def invoke_model(self, **kwargs):
      bedrock_requests.append(json.loads(kwargs["body"]))
      payload = {
        "content": [
          {"type": "text", "text": json.dumps(invalid_response, ensure_ascii=False)},
        ],
      }
      return {"body": io.BytesIO(json.dumps(payload, ensure_ascii=False).encode())}

  def create_openai_response(**kwargs):
    openai_requests.append(kwargs)
    return SimpleNamespace(
        output_text=json.dumps(invalid_response, ensure_ascii=False),
    )

  class OpenAIClient:
    responses = SimpleNamespace(create=create_openai_response)

  monkeypatch.setattr(
    mission_service.boto3,
    "client",
    lambda *_args, **_kwargs: BedrockClient(),
  )
  monkeypatch.setattr(mission_service, "OpenAI", lambda **_kwargs: OpenAIClient())
  settings = Settings(openai_api_key="test-key")

  assert mission_service._bedrock_titles_sync("prompt", 2, settings) == []
  assert mission_service._openai_titles_sync("prompt", 2, settings) == []
  assert bedrock_requests[0]["system"] == mission_service.MISSION_COACH_SYSTEM_PROMPT
  assert openai_requests[0]["instructions"] == mission_service.MISSION_COACH_SYSTEM_PROMPT


def test_mission_prompt_contains_only_the_minimal_structured_context() -> None:
  prompt = mission_service._mission_prompt(
    weakness_topics=["블러셔", "아이섀도"],
    latest_score=74,
    completed_titles=["립 경계 정리"],
    difficulty="intermediate",
    count=2,
  )

  assert '"weaknessTopics": ["블러셔", "아이섀도"]' in prompt
  assert '"latestScore": 74' in prompt
  assert '"completedMissionTitles": ["립 경계 정리"]' in prompt
  assert "중급: 5~15분" in prompt
  assert "행동 하나만" in prompt
  assert "3~24자" in prompt
  assert "세부 순서" in prompt
  assert "메이크업 추출" in prompt
  assert "가벼운 웰니스 습관" in prompt
  assert "photo" not in prompt.casefold()
  assert "image" not in prompt.casefold()
  assert "note" not in prompt.casefold()
  assert "http" not in prompt.casefold()


def test_daily_mix_prompt_and_curated_set_cover_three_distinct_purposes() -> None:
  prompt = mission_service._mission_prompt(
    weakness_topics=[],
    latest_score=None,
    completed_titles=[],
    difficulty="daily_mix",
    count=3,
  )
  curated = mission_service.curated_daily_missions()

  assert "세 개를 정확히 이 순서" in prompt
  assert "가벼운 습관" in prompt
  assert "앱 기능 또는 뷰티 루틴" in prompt
  assert "결과를 남기는 오늘의 도전" in prompt
  assert [difficulty for _title, difficulty in curated] == [
    "beginner",
    "intermediate",
    "advanced",
  ]
  assert mission_service._validated_generated_mission_set(
    [
      "물 한 잔 마시기",
      "메이크업 추출 기능 써보기",
      "메이크업 피드백 70점 달성하기",
    ],
    difficulty="daily_mix",
    count=3,
  )
  assert not mission_service._validated_generated_mission_set(
    ["물 한 잔 마시기", "립밤 바르기", "선크림 바르기"],
    difficulty="daily_mix",
    count=3,
  )


def test_curated_daily_set_is_randomized_and_excludes_recent_titles() -> None:
  first = mission_service.curated_daily_missions(rng=random.Random(11))
  first_titles = {title for title, _difficulty in first}
  second = mission_service.curated_daily_missions(
    excluded_titles=first_titles,
    rng=random.Random(11),
  )

  assert len(first) == 3
  assert len(second) == 3
  assert first_titles.isdisjoint(title for title, _difficulty in second)
  assert all(len(titles) >= 18 for titles in mission_service.CURATED_MISSIONS.values())


def test_curated_missions_have_distinct_actionable_difficulty_contracts() -> None:
  beginner = mission_service.CURATED_MISSIONS["beginner"]
  intermediate = mission_service.CURATED_MISSIONS["intermediate"]
  advanced = mission_service.CURATED_MISSIONS["advanced"]

  assert all(mission_service._is_actionable_generated_title(title, "beginner") for title in beginner)
  assert all(
    mission_service._is_actionable_generated_title(title, "intermediate")
    for title in intermediate
  )
  assert all(mission_service._is_actionable_generated_title(title, "advanced") for title in advanced)
  assert all(len(titles) >= 10 for titles in (beginner, intermediate, advanced))
  assert "물 한 잔 마시기" in beginner
  assert "메이크업 추출 기능 써보기" in intermediate
  assert "메이크업 피드백 70점 달성하기" in advanced
  assert "팩하기" in intermediate


def test_actionable_title_gate_keeps_missions_short_and_friendly() -> None:
  assert not mission_service._is_actionable_generated_title(
    "블러셔를 자연스럽게 개선하기",
    "beginner",
  )
  assert not mission_service._is_actionable_generated_title(
    "아이섀도 블렌딩 연습하기",
    "intermediate",
  )
  assert not mission_service._is_actionable_generated_title(
    "립밤을 바르고 물 한 잔 마시기",
    "advanced",
  )
  assert mission_service._is_actionable_generated_title(
    "메이크업 추출 기능 써보기",
    "advanced",
  )
  assert mission_service._is_actionable_generated_title("팩하기", "beginner")


@pytest.mark.asyncio
async def test_bedrock_mission_generation_accepts_validated_titles(monkeypatch) -> None:
  monkeypatch.setattr(
    mission_service,
    "_bedrock_titles_sync",
    lambda _prompt, _count, _settings: ["물 한 잔 마시기"],
  )

  titles = await mission_service.generate_personalized_mission_titles(
    weakness_topics=[],
    latest_score=None,
    completed_titles=[],
    difficulty="beginner",
    count=1,
    settings=Settings(ai_provider="bedrock", aws_use_iam_role=True),
  )

  assert titles == ["물 한 잔 마시기"]


@pytest.mark.asyncio
async def test_mission_provider_failure_returns_immediate_curated_fallback_signal(
  monkeypatch,
) -> None:
  def fail_provider(_prompt, _count, _settings):
    raise RuntimeError("provider unavailable")

  monkeypatch.setattr(mission_service, "_bedrock_titles_sync", fail_provider)
  titles = await mission_service.generate_personalized_mission_titles(
    weakness_topics=["블러셔"],
    latest_score=74,
    completed_titles=[],
    difficulty="beginner",
    count=2,
    settings=Settings(ai_provider="bedrock", aws_use_iam_role=True),
  )

  assert titles == []


@pytest.mark.asyncio
async def test_vague_ai_mission_returns_curated_fallback_signal(monkeypatch) -> None:
  monkeypatch.setattr(
    mission_service,
    "_bedrock_titles_sync",
    lambda _prompt, _count, _settings: ["블러셔를 자연스럽게 개선하기"],
  )

  titles = await mission_service.generate_personalized_mission_titles(
    weakness_topics=["블러셔"],
    latest_score=74,
    completed_titles=[],
    difficulty="beginner",
    count=1,
    settings=Settings(ai_provider="bedrock", aws_use_iam_role=True),
  )

  assert titles == []
