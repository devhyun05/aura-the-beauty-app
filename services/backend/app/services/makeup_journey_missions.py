from __future__ import annotations

import asyncio
import json
import logging
import random
import re
from typing import Annotated, Any

import boto3
from botocore.config import Config
from openai import OpenAI
from pydantic import (
  BaseModel,
  ConfigDict,
  StringConstraints,
  ValidationError,
  ValidationInfo,
  field_validator,
)

from app.core.settings import Settings


logger = logging.getLogger(__name__)

DAILY_MISSION_LEVELS = ("beginner", "intermediate", "advanced")

CURATED_MISSIONS: dict[str, tuple[str, ...]] = {
  "beginner": (
    "물 한 잔 마시기",
    "립밤 한 번 바르기",
    "선크림 챙겨 바르기",
    "눈썹 빗어 정리하기",
    "메이크업 브러시 하나 닦기",
    "저장한 메이크업 하나 구경하기",
    "오늘 쓸 마스크팩 꺼내두기",
    "세안 후 보습제 바르기",
    "목과 어깨 가볍게 펴기",
    "평소 안 쓰던 립 컬러 발라보기",
    "아우라딘에게 립 제품 물어보기",
    "오늘 피부 컨디션 한 줄 남기기",
    "화장대 위 제품 하나 정리하기",
    "파우치 거울 한 번 닦기",
    "내일 쓸 선크림 꺼내두기",
    "손목에 립 컬러 하나 발라보기",
    "마음에 든 메이크업 하나 저장하기",
    "잠들기 전 립밤 바르기",
  ),
  "intermediate": (
    "팩하기",
    "괄사로 얼굴 가볍게 마사지하기",
    "저장해둔 메이크업 하나 따라해보기",
    "메이크업 추출 기능 써보기",
    "메이크업 피드백 한 번 받기",
    "아우라딘으로 새 제품 찾아보기",
    "나만의 메이크업 룩 하나 저장하기",
    "오늘 사용한 브러시 씻기",
    "블러셔 위치 바꿔보기",
    "메이크업 전 사진 한 장 남기기",
    "자기 전 5분 스트레칭하기",
    "얼굴 분석 결과 다시 보기",
    "메이크업 필터 하나 써보기",
    "오늘 쓰고 싶은 립 조합 찾아보기",
    "메이크업 퍼프 깨끗이 씻기",
    "아우라딘에게 쿠션 추천받기",
    "저장한 메이크업 하나 다시 보기",
    "피부 컨디션에 맞는 팩 골라보기",
  ),
  "advanced": (
    "메이크업 피드백 70점 달성하기",
    "지난 피드백보다 5점 높이기",
    "저장한 메이크업으로 피드백 받기",
    "메이크업 추출 룩 직접 따라해보기",
    "새로운 메이크업 룩 완성해 저장하기",
    "피드백 개선점 하나 고쳐보기",
    "베이스부터 립까지 풀 메이크업 해보기",
    "같은 룩을 다른 색 조합으로 완성하기",
    "메이크업 전후 사진 남기기",
    "얼굴 분석 결과에 맞춘 메이크업 해보기",
    "오늘의 뷰티 루틴 세 가지 완료하기",
    "아우라딘 추천으로 새 조합 찾아보기",
    "메이크업 추출 결과로 룩 완성하기",
    "새 립 조합 완성해 저장하기",
    "저장한 룩과 비슷하게 메이크업 해보기",
    "얼굴 분석 추천 포인트 적용해보기",
    "오늘 메이크업 사진 세 장 남기기",
    "메이크업 피드백 다시 받기",
  ),
}

DIFFICULTY_PROMPT_RULES: dict[str, str] = {
  "beginner": "초급: 준비 없이 1~5분 안에 바로 할 수 있는 작은 습관.",
  "intermediate": "중급: 5~15분 정도의 앱 기능 체험 또는 뷰티 루틴 한 가지.",
  "advanced": "고급: 결과나 기록을 남기는 15~30분 정도의 오늘의 도전.",
  "daily_mix": (
    "세 개를 정확히 이 순서로 만드세요. "
    "첫 번째는 준비 없이 바로 하는 가벼운 습관, "
    "두 번째는 앱 기능 또는 뷰티 루틴 한 가지, "
    "세 번째는 점수·완성·기록처럼 결과를 남기는 오늘의 도전."
  ),
}

MISSION_COACH_SYSTEM_PROMPT = (
  "당신은 메이크업 기술을 가르치는 강사가 아닙니다. "
  "사용자가 '이 정도면 오늘 한 번 해볼까?'라고 느끼는 작은 뷰티 습관을 제안하는 "
  "친근한 데일리 뷰티 코치입니다. 외모 불안을 자극하지 말고 가볍고 다정하게 제안하세요."
)

_UNFRIENDLY_MISSION_PATTERN = re.compile(
  r"(정돈감|볼륨감|레이어링|터치업|블렌딩|대칭|명암 단계|교차 확인|농도 조절|경계 교정|자연스럽게 개선하기|신경 쓰기)",
)
_MULTI_SENTENCE_PATTERN = re.compile(r"[,.;:!?]|\n|\r")
_MULTI_ACTION_PATTERN = re.compile(r"(한 뒤|한 후|하고 나서|그리고|그다음|바르고|마시고|받고|찍고)")
_ROUTINE_MISSION_PATTERN = re.compile(
  r"(메이크업|팩|괄사|마사지|브러시|아우라딘|얼굴 분석|피드백|립|블러셔|스킨|스트레칭)",
)
_CHALLENGE_MISSION_PATTERN = re.compile(
  r"(점 달성|점 높이기|완성|전후 사진|세 가지|피드백 받기|저장하기|따라해보기)",
)

MissionTitle = Annotated[str, StringConstraints(min_length=1, max_length=120)]


class GeneratedMissionResponse(BaseModel):
  model_config = ConfigDict(extra="forbid", strict=True)

  missions: list[MissionTitle]

  @field_validator("missions", mode="before")
  @classmethod
  def normalize_whitespace(cls, value: object) -> object:
    if not isinstance(value, list):
      return value
    return [" ".join(item.split()) if isinstance(item, str) else item for item in value]

  @field_validator("missions")
  @classmethod
  def validate_count_and_uniqueness(
    cls,
    value: list[str],
    info: ValidationInfo,
  ) -> list[str]:
    expected_count = (info.context or {}).get("count")
    if len(value) != expected_count:
      raise ValueError("missions must contain exactly the requested count")
    if len({title.casefold() for title in value}) != len(value):
      raise ValueError("missions must not contain duplicate titles")
    return value


def curated_mission_titles(
  difficulty: str,
  count: int,
  *,
  excluded_titles: set[str] | None = None,
  rng: random.Random | None = None,
) -> list[str]:
  excluded = {title.casefold() for title in (excluded_titles or set())}
  candidates = [
    title
    for title in CURATED_MISSIONS.get(difficulty, CURATED_MISSIONS["beginner"])
    if title.casefold() not in excluded
  ]
  if not candidates or count <= 0:
    return []
  return (rng or random.SystemRandom()).sample(candidates, k=min(count, len(candidates)))


def curated_daily_missions(
  *,
  excluded_titles: set[str] | None = None,
  rng: random.Random | None = None,
) -> list[tuple[str, str]]:
  excluded = set(excluded_titles or set())
  missions: list[tuple[str, str]] = []
  for level in DAILY_MISSION_LEVELS:
    titles = curated_mission_titles(
      level,
      1,
      excluded_titles=excluded,
      rng=rng,
    )
    if not titles:
      return []
    title = titles[0]
    missions.append((title, level))
    excluded.add(title)
  return missions


def _validate_generated_titles(value: object, count: int) -> list[str]:
  if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= 3:
    return []
  try:
    response = GeneratedMissionResponse.model_validate(value, context={"count": count})
  except ValidationError:
    return []
  return response.missions


def _parse_json_text(text: str) -> object:
  normalized = text.strip()
  fence = re.search(r"```(?:json)?\s*(.*?)\s*```", normalized, re.DOTALL)
  if fence:
    normalized = fence.group(1).strip()
  return json.loads(normalized)


def _validate_generated_json(text: object, count: int) -> list[str]:
  if not isinstance(text, str):
    return []
  try:
    value = _parse_json_text(text)
  except json.JSONDecodeError:
    return []
  return _validate_generated_titles(value, count)


def _mission_prompt(
  *,
  weakness_topics: list[str],
  latest_score: int | None,
  completed_titles: list[str],
  difficulty: str,
  count: int,
) -> str:
  # This deliberately excludes notes, user-entered journal text, photos, and URLs.
  context = {
    "weaknessTopics": weakness_topics[:3],
    "latestScore": latest_score,
    "completedMissionTitles": completed_titles[-5:],
    "difficulty": difficulty,
    "count": count,
  }
  difficulty_rule = DIFFICULTY_PROMPT_RULES.get(
    difficulty,
    DIFFICULTY_PROMPT_RULES["beginner"],
  )
  return (
    "오늘 체크하고 끝낼 수 있는 짧은 뷰티 데일리 미션 제목을 한국어로 생성하세요. "
    "메이크업 추출, 저장한 메이크업, 메이크업 피드백, 얼굴 분석, 아우라딘 같은 앱 기능과 "
    "메이크업, 스킨케어, 가벼운 웰니스 습관을 고르게 활용하세요. "
    "최근 개선점은 개인화 힌트일 뿐이며 전문적인 기술 훈련만 만들지 마세요. "
    f"난이도 기준: {difficulty_rule} "
    "제목 하나에는 행동 하나만 넣고 3~24자 안에서 '~하기', '~해보기', '~받기'처럼 끝내세요. "
    "제목에 이유, 준비물 설명, 세부 순서, 여러 완료 기준을 붙이지 마세요. "
    "친근한 일상어를 쓰고 어려운 메이크업 전문 용어, 의학적 효능, 외모 비하 표현은 금지합니다. "
    "예시 톤: '물 한 잔 마시기', '메이크업 추출 기능 써보기', '저장한 메이크업 따라해보기'. "
    "JSON 객체 {\"missions\":[\"...\"]}만 반환하세요.\n"
    f"입력: {json.dumps(context, ensure_ascii=False)}"
  )


def _is_actionable_generated_title(title: str, difficulty: str) -> bool:
  del difficulty
  normalized = " ".join(title.split())
  if not 3 <= len(normalized) <= 24:
    return False
  if not normalized.endswith("기"):
    return False
  if _MULTI_SENTENCE_PATTERN.search(normalized):
    return False
  if _MULTI_ACTION_PATTERN.search(normalized):
    return False
  return _UNFRIENDLY_MISSION_PATTERN.search(normalized) is None


def _validated_generated_mission_set(
  titles: list[str],
  *,
  difficulty: str,
  count: int,
) -> list[str]:
  if len(titles) != count:
    return []
  if not all(_is_actionable_generated_title(title, difficulty) for title in titles):
    return []
  if difficulty != "daily_mix":
    return titles
  if count != len(DAILY_MISSION_LEVELS):
    return []
  if not _ROUTINE_MISSION_PATTERN.search(titles[1]):
    return []
  if not _CHALLENGE_MISSION_PATTERN.search(titles[2]):
    return []
  return titles


def _bedrock_titles_sync(prompt: str, count: int, settings: Settings) -> list[str]:
  client_kwargs: dict[str, Any] = {
    "region_name": settings.effective_bedrock_analysis_region,
    "config": Config(connect_timeout=3, read_timeout=8, retries={"max_attempts": 1}),
  }
  if settings.aws_profile_name:
    client = boto3.Session(profile_name=settings.aws_profile_name).client(
      "bedrock-runtime",
      **client_kwargs,
    )
  else:
    if settings.aws_access_key_id and settings.aws_secret_access_key:
      client_kwargs.update(
        {
          "aws_access_key_id": settings.aws_access_key_id,
          "aws_secret_access_key": settings.aws_secret_access_key,
        },
      )
    client = boto3.client("bedrock-runtime", **client_kwargs)

  response = client.invoke_model(
    modelId=settings.effective_scenario_model_id,
    body=json.dumps(
      {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 300,
        "temperature": 0.2,
        "system": MISSION_COACH_SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
      },
      ensure_ascii=False,
    ),
    accept="application/json",
    contentType="application/json",
  )
  payload = json.loads(response["body"].read())
  content = payload.get("content") if isinstance(payload, dict) else None
  text = "".join(
    item.get("text", "")
    for item in (content or [])
    if isinstance(item, dict) and item.get("type") == "text"
  )
  return _validate_generated_json(text, count)


def _openai_titles_sync(prompt: str, count: int, settings: Settings) -> list[str]:
  response = OpenAI(api_key=settings.openai_api_key).responses.create(
    model=settings.openai_analysis_model_id,
    instructions=MISSION_COACH_SYSTEM_PROMPT,
    input=prompt,
    text={
      "format": {
        "type": "json_schema",
        "name": "makeup_journey_missions",
        "strict": True,
        "schema": {
          "type": "object",
          "properties": {
            "missions": {
              "type": "array",
              "minItems": count,
              "maxItems": count,
              "items": {"type": "string", "minLength": 1, "maxLength": 120},
            },
          },
          "required": ["missions"],
          "additionalProperties": False,
        },
      },
    },
  )
  return _validate_generated_json(response.output_text, count)


async def generate_personalized_mission_titles(
  *,
  weakness_topics: list[str],
  latest_score: int | None,
  completed_titles: list[str],
  difficulty: str,
  count: int,
  settings: Settings,
) -> list[str]:
  prompt = _mission_prompt(
    weakness_topics=weakness_topics,
    latest_score=latest_score,
    completed_titles=completed_titles,
    difficulty=difficulty,
    count=count,
  )
  try:
    if (
      settings.analysis_provider == "bedrock"
      and settings.aws_credentials_configured
      and settings.effective_scenario_model_id
    ):
      titles = await asyncio.to_thread(_bedrock_titles_sync, prompt, count, settings)
      return _validated_generated_mission_set(
        titles,
        difficulty=difficulty,
        count=count,
      )
    if (
      settings.analysis_provider == "openai"
      and settings.openai_enabled
      and settings.openai_api_key
    ):
      titles = await asyncio.to_thread(_openai_titles_sync, prompt, count, settings)
      return _validated_generated_mission_set(
        titles,
        difficulty=difficulty,
        count=count,
      )
  except Exception as exc:  # noqa: BLE001 - curated missions are the availability fallback.
    logger.warning("[aura:makeup-journey] mission-ai-fallback reason=%s", exc.__class__.__name__)

  return []
