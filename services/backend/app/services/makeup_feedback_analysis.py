import asyncio
import base64
import json
import logging
import re
import time
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.bedrock_guardrails import build_bedrock_guardrail_invoke_kwargs


logger = logging.getLogger(__name__)

MODEL_VERSION = "makeup-feedback:bedrock-v2-goal-context"

FEEDBACK_TOPICS: list[dict[str, str]] = [
  {"id": "brow", "label": "눈썹", "kind": "eye"},
  {"id": "lash", "label": "속눈썹", "kind": "eye"},
  {"id": "lens", "label": "렌즈", "kind": "eye"},
  {"id": "eyeliner", "label": "아이라인", "kind": "eye"},
  {"id": "eyeshadow", "label": "아이섀도", "kind": "eye"},
  {"id": "aegyosal", "label": "애교살", "kind": "eye"},
  {"id": "foundation", "label": "파운데이션", "kind": "cheek"},
  {"id": "blush", "label": "블러셔", "kind": "cheek"},
  {"id": "highlight", "label": "하이라이터", "kind": "cheek"},
  {"id": "shading", "label": "섀딩", "kind": "cheek"},
]

TOPIC_BY_ID = {topic["id"]: topic for topic in FEEDBACK_TOPICS}
DEFAULT_STRENGTH_TOPIC_IDS = {"brow", "foundation", "blush", "highlight"}
DEFAULT_IMPROVEMENT_TOPIC_IDS = {"eyeliner", "shading"}
VALID_STATUSES = {"strength", "improvement", "optional"}
VALID_SCORE_IMPACTS = {"high", "medium", "low"}
VALID_INTENSITIES = {"light", "medium", "bold"}

FALLBACK_DESCRIPTIONS = {
  "brow": "목적에 맞게 눈썹 결과 농도를 함께 보면 인상 정리에 도움이 됩니다. 앞머리와 꼬리 경계가 자연스러우면 전체 완성도가 더 좋아집니다.",
  "lash": "이번 목적에서 속눈썹은 선택적으로 조절할 수 있는 항목입니다. 강조가 필요하다면 뭉침 없이 결만 살리는 방향이 안정적입니다.",
  "lens": "렌즈는 목적과 표현 강도에 따라 선택할 수 있습니다. 자연스러운 목적이라면 눈동자 색감이 과하게 튀지 않는 쪽이 잘 맞습니다.",
  "eyeliner": "아이라인은 끝 각도와 두께가 인상에 큰 영향을 줍니다. 목적에 맞게 선명도와 자연스러움 사이의 균형을 맞추면 좋습니다.",
  "eyeshadow": "아이섀도는 눈매 깊이를 만들되 전체 톤과 어긋나지 않는 것이 중요합니다. 경계가 부드러우면 목적에 맞는 완성도가 올라갑니다.",
  "aegyosal": "애교살은 목적에 따라 선택적으로 조절할 수 있습니다. 필요하다면 눈 밑 중앙에만 밝기를 얇게 더하는 정도가 안전합니다.",
  "foundation": "피부톤이 고르게 정리되면 사진에서 깔끔한 인상을 줍니다. 목선과의 톤 차이와 베이스 경계가 적을수록 완성도가 좋아집니다.",
  "blush": "블러셔는 얼굴에 생기를 주는 핵심 포인트입니다. 목적에 맞는 색감과 위치라면 부담 없이 분위기를 살릴 수 있습니다.",
  "highlight": "하이라이터는 입체감을 만드는 항목입니다. 번들거림보다 필요한 부위에만 은은하게 살아나는 표현이 안정적입니다.",
  "shading": "섀딩은 경계가 부드러울수록 자연스럽게 입체감을 만듭니다. 턱선과 코 옆은 양을 줄여 블렌딩하면 완성도가 올라갑니다.",
}


def _clean_text(value: Any, fallback: str = "") -> str:
  if isinstance(value, str):
    normalized = " ".join(value.split()).strip()
    return normalized or fallback

  return fallback


def _clean_topic_id(value: Any) -> str | None:
  if isinstance(value, str) and value in TOPIC_BY_ID:
    return value

  return None


def _clamp_score(value: int) -> int:
  return max(0, min(100, value))


def _clamp_confidence(value: Any) -> float | None:
  if isinstance(value, bool) or not isinstance(value, (int, float)):
    return None

  return max(0.0, min(1.0, float(value)))


def _normalize_status(value: Any, fallback: str = "optional") -> str:
  return value if isinstance(value, str) and value in VALID_STATUSES else fallback


def _normalize_score_impact(value: Any, fallback: str = "medium") -> str:
  return value if isinstance(value, str) and value in VALID_SCORE_IMPACTS else fallback


def _normalize_intensity(value: Any, fallback: str = "medium") -> str:
  return value if isinstance(value, str) and value in VALID_INTENSITIES else fallback


def _get_feedback_context(payload: dict[str, Any]) -> dict[str, str]:
  raw_context = payload.get("feedbackContext") or payload.get("feedback_context")
  context = raw_context if isinstance(raw_context, dict) else {}
  user_goal_text = _clean_text(
    context.get("normalizedGoalText")
    or context.get("normalized_goal_text")
    or context.get("userGoalText")
    or context.get("user_goal_text")
    or payload.get("userGoalText")
    or payload.get("user_goal_text"),
    "전체적인 메이크업 균형과 자연스러움 기준으로 피드백",
  )
  original_goal_text = _clean_text(
    context.get("originalGoalText")
    or context.get("original_goal_text")
    or payload.get("originalGoalText")
    or payload.get("original_goal_text"),
    user_goal_text,
  )
  goal_intent_type = _clean_text(
    context.get("goalIntentType")
    or context.get("goal_intent_type")
    or payload.get("goalIntentType")
    or payload.get("goal_intent_type"),
    "valid_context",
  )
  profile_gender = _clean_text(
    context.get("profileGender")
    or context.get("profile_gender")
    or payload.get("profileGender")
    or payload.get("profile_gender"),
    "unknown",
  )

  return {
    "goalIntentType": goal_intent_type,
    "originalGoalText": original_goal_text,
    "profileGender": profile_gender,
    "userGoalText": user_goal_text,
  }

def _infer_goal_intensity(user_goal_text: str) -> str:
  normalized = user_goal_text.lower()

  if any(keyword in normalized for keyword in ["아이돌", "무대", "화려", "bold", "강하게", "커버", "공연"]):
    return "bold"

  if any(keyword in normalized for keyword in ["내추럴", "자연", "데일리", "면접", "증명", "티 안", "깔끔"]):
    return "light"

  return "medium"


def _fallback_goal_label(user_goal_text: str) -> str:
  if len(user_goal_text) <= 28:
    return user_goal_text

  return f"{user_goal_text[:28]}..."


def _default_status_for_topic(topic_id: str) -> str:
  if topic_id in DEFAULT_STRENGTH_TOPIC_IDS:
    return "strength"

  if topic_id in DEFAULT_IMPROVEMENT_TOPIC_IDS:
    return "improvement"

  return "optional"


def _score_from_counts(strength_count: int, improvement_count: int) -> int:
  return _clamp_score(72 + strength_count * 4 - improvement_count * 3)


def _build_points(evaluations: list[dict[str, Any]]) -> list[dict[str, Any]]:
  return [
    {
      "id": f"{item['topicId']}-point",
      "topicId": item["topicId"],
      "topicLabel": item["topicLabel"],
      "title": item["title"],
      "description": item["description"],
      "actionLabel": "보완 포인트",
      "kind": item["kind"],
    }
    for item in evaluations
    if item["status"] == "improvement"
  ]


def _build_strengths(evaluations: list[dict[str, Any]]) -> list[dict[str, Any]]:
  strengths = []

  for index, item in enumerate(evaluations):
    if item["status"] != "strength":
      continue

    strengths.append(
      {
        "id": f"{item['topicId']}-strength",
        "topicId": item["topicId"],
        "topicLabel": item["topicLabel"],
        "title": item["title"],
        "description": item["description"],
        "icon": "sparkle" if index % 2 == 0 else "heart",
        "kind": item["kind"],
      },
    )

  return strengths


def _normalize_evaluations(raw_evaluations: Any) -> list[dict[str, Any]]:
  raw_items = raw_evaluations if isinstance(raw_evaluations, list) else []
  item_by_topic: dict[str, dict[str, Any]] = {}

  for raw_item in raw_items:
    if not isinstance(raw_item, dict):
      continue

    topic_id = _clean_topic_id(raw_item.get("topicId") or raw_item.get("topic_id"))

    if topic_id:
      item_by_topic[topic_id] = raw_item

  normalized = []

  for topic in FEEDBACK_TOPICS:
    topic_id = topic["id"]
    raw_item = item_by_topic.get(topic_id, {})
    fallback_status = _default_status_for_topic(topic_id)
    status = _normalize_status(raw_item.get("status") if raw_item else fallback_status, fallback_status)
    description = _clean_text(raw_item.get("description"), FALLBACK_DESCRIPTIONS[topic_id])
    score_impact = _normalize_score_impact(raw_item.get("scoreImpact") or raw_item.get("score_impact"), "medium")

    normalized.append(
      {
        "id": _clean_text(raw_item.get("id"), f"{topic_id}-{status}"),
        "topicId": topic_id,
        "topicLabel": topic["label"],
        "status": status,
        "title": _clean_text(raw_item.get("title"), topic["label"]),
        "description": description,
        "scoreImpact": score_impact,
        "kind": topic["kind"],
        "confidence": _clamp_confidence(raw_item.get("confidence")),
      },
    )

  return normalized


def _normalize_interpreted_goal(raw_goal: Any, payload: dict[str, Any]) -> dict[str, str]:
  feedback_context = _get_feedback_context(payload)
  user_goal_text = feedback_context["userGoalText"]

  if isinstance(raw_goal, dict):
    intensity = _normalize_intensity(raw_goal.get("intensity"), _infer_goal_intensity(user_goal_text))

    return {
      "label": _clean_text(raw_goal.get("label"), _fallback_goal_label(user_goal_text)),
      "intensity": intensity,
      "reason": _clean_text(raw_goal.get("reason"), "사용자가 입력한 목적과 사진의 표현 강도를 함께 참고했습니다."),
    }

  return {
    "label": _fallback_goal_label(user_goal_text),
    "intensity": _infer_goal_intensity(user_goal_text),
    "reason": "사용자가 입력한 목적을 최우선 기준으로 해석했습니다.",
  }


def _normalize_summary(raw_summary: Any) -> dict[str, str]:
  summary = raw_summary if isinstance(raw_summary, dict) else {}

  return {
    "strengthSummary": _clean_text(
      summary.get("strengthSummary") or summary.get("strength_summary"),
      "목적에 맞는 표현이 잘 살아난 항목이 있습니다.",
    ),
    "improvementSummary": _clean_text(
      summary.get("improvementSummary") or summary.get("improvement_summary"),
      "조금만 정리하면 목적에 더 잘 맞는 완성도로 보일 수 있습니다.",
    ),
  }


def normalize_makeup_feedback_result(result: dict[str, Any] | None, payload: dict[str, Any]) -> dict[str, Any]:
  raw_result = result if isinstance(result, dict) else {}
  source = _clean_text(payload.get("source"), "camera")
  evaluations = _normalize_evaluations(raw_result.get("evaluations"))
  points = _build_points(evaluations)
  strengths = _build_strengths(evaluations)
  score = raw_result.get("score")

  if isinstance(score, bool) or not isinstance(score, int):
    score = _score_from_counts(len(strengths), len(points))

  return {
    "score": _clamp_score(score),
    "scoreLabel": _clean_text(raw_result.get("scoreLabel") or raw_result.get("score_label"), "종합 점수"),
    "interpretedGoal": _normalize_interpreted_goal(
      raw_result.get("interpretedGoal") or raw_result.get("interpreted_goal"),
      payload,
    ),
    "summary": _normalize_summary(raw_result.get("summary")),
    "photoSourceLabel": "선택한 사진" if source == "gallery" else "선택한 사진",
    "summaryBadges": [
      {"id": "strength-count", "label": f"잘한 항목 {len(strengths)}개"},
      {"id": "improvement-count", "label": f"보완 항목 {len(points)}개"},
      {"id": "topic-count", "label": "10개 항목 분석"},
    ],
    "annotations": [],
    "evaluations": evaluations,
    "points": points,
    "strengths": strengths,
    "modelVersion": MODEL_VERSION,
  }


def build_fallback_makeup_feedback_result(payload: dict[str, Any]) -> dict[str, Any]:
  return normalize_makeup_feedback_result({}, payload)


class MakeupFeedbackBedrockService:
  def __init__(self, settings: Settings) -> None:
    self.settings = settings

  def _s3_client(self):
    client_kwargs = {
      "region_name": self.settings.aws_region,
      "config": Config(connect_timeout=30, read_timeout=60, retries={"max_attempts": 1}),
    }

    if self.settings.aws_access_key_id and self.settings.aws_secret_access_key:
      client_kwargs.update(
        {
          "aws_access_key_id": self.settings.aws_access_key_id,
          "aws_secret_access_key": self.settings.aws_secret_access_key,
        },
      )

    return boto3.client("s3", **client_kwargs)

  def _bedrock_runtime_client(self):
    client_kwargs = {
      "region_name": self.settings.effective_bedrock_analysis_region,
      "config": Config(connect_timeout=30, read_timeout=120, retries={"max_attempts": 1}),
    }

    if self.settings.aws_access_key_id and self.settings.aws_secret_access_key:
      client_kwargs.update(
        {
          "aws_access_key_id": self.settings.aws_access_key_id,
          "aws_secret_access_key": self.settings.aws_secret_access_key,
        },
      )

    return boto3.client("bedrock-runtime", **client_kwargs)

  def _infer_content_type(self, payload: dict[str, Any]) -> str:
    content_type = payload.get("contentType") or payload.get("content_type")

    if isinstance(content_type, str) and content_type.startswith("image/"):
      return content_type

    object_key = _clean_text(payload.get("objectKey") or payload.get("object_key"))
    normalized = object_key.lower()

    if normalized.endswith(".png"):
      return "image/png"

    if normalized.endswith(".webp"):
      return "image/webp"

    return "image/jpeg"

  def _read_image_bytes(self, payload: dict[str, Any]) -> bytes:
    bucket = _clean_text(payload.get("bucket"))
    object_key = _clean_text(payload.get("objectKey") or payload.get("object_key")).lstrip("/")

    if not bucket or not object_key:
      raise AppError(400, "FEEDBACK_SOURCE_IMAGE_REQUIRED", "A feedback source image must be uploaded before analysis.")

    started_at = time.monotonic()
    logger.info("[aura:feedback-bedrock] image-read:start bucket=%s key=%s", bucket, object_key)
    image_object = self._s3_client().get_object(Bucket=bucket, Key=object_key)
    image_bytes = image_object["Body"].read()
    logger.info(
      "[aura:feedback-bedrock] image-read:success bytes=%s durationMs=%s",
      len(image_bytes),
      round((time.monotonic() - started_at) * 1000),
    )

    return image_bytes

  def _build_prompt(self, payload: dict[str, Any]) -> str:
    feedback_context = _get_feedback_context(payload)
    profile_gender = feedback_context["profileGender"]
    user_goal_text = feedback_context["userGoalText"]
    original_goal_text = feedback_context.get("originalGoalText", user_goal_text)
    goal_intent_type = feedback_context.get("goalIntentType", "valid_context")
    metadata = {
      key: value
      for key, value in payload.items()
      if key not in {"imageUrl", "cdnUrl", "sourceUri"}
    }
    output_contract = {
      "score": 0,
      "scoreLabel": "종합 점수",
      "interpretedGoal": {
        "label": "사용자 목적을 짧게 요약",
        "intensity": "light | medium | bold",
        "reason": "이렇게 해석한 이유를 짧게 설명",
      },
      "evaluations": [
        {
          "topicId": "brow",
          "topicLabel": "눈썹",
          "status": "strength | improvement | optional",
          "title": "짧은 제목",
          "description": "사용자 목적에 맞춰 평가한 한국어 피드백",
          "scoreImpact": "high | medium | low",
          "confidence": 0.0,
        },
      ],
      "summary": {
        "strengthSummary": "잘한 점 전체 요약 1문장",
        "improvementSummary": "보완하면 좋은 점 전체 요약 1문장",
      },
    }
    topic_id_text = "\n".join(f"- {topic['id']}: {topic['label']}" for topic in FEEDBACK_TOPICS)

    return f"""
당신은 K-뷰티 메이크업 피드백 전문가입니다.
사용자가 업로드한 얼굴/메이크업 사진을 분석하고, 사용자가 입력한 “메이크업 상황/목적”에 맞는 메이크업 퀄리티를 평가하세요.

입력 정보:
- profileGender: {profile_gender}
- userGoalText: {json.dumps(user_goal_text, ensure_ascii=False)}
- originalGoalText: {json.dumps(original_goal_text, ensure_ascii=False)}
- goalIntentType: {goal_intent_type}

가장 중요한 원칙:
- 사용자가 입력한 userGoalText를 최우선 기준으로 평가하세요.
- profileGender는 참고 정보로만 사용하세요.
- gender를 고정관념적으로 해석하지 마세요.
- 남성이라고 무조건 내추럴 메이크업 기준으로 평가하지 마세요.
- 여성이라고 무조건 데일리/화려한 메이크업 기준으로 평가하지 마세요.
- 사용자가 원하는 상황, 목적, 표현 강도에 맞는지 평가하세요.
- 메이크업을 많이 했는지보다, 목적에 맞는 완성도와 퀄리티를 평가하세요.

점수 기준:
- score는 0~100 정수입니다.
- 화면에는 “종합 점수”로 표시됩니다.
- 단, 점수 산정 기준은 단순한 메이크업 양이나 화려함이 아니라, 사용자가 입력한 목적/상황에 얼마나 잘 맞는지에 대한 종합 평가입니다.
- 목적이 내추럴/데일리라면 자연스러움, 피부 표현, 경계 정리, 과하지 않음이 중요합니다.
- 목적이 면접/증명사진이라면 깔끔함, 인상 정리, 피부톤 균일감, 과하지 않음이 중요합니다.
- 목적이 데이트/꾸안꾸라면 자연스러운 생기, 조화로운 톤, 부담 없는 포인트가 중요합니다.
- 목적이 아이돌/무대라면 선명도, 존재감, 카메라에서 보이는 균형감, 디테일 완성도가 중요합니다.
- 목적이 촬영/화보라면 조명 아래 입체감, 색감 전달력, 사진에서의 완성도가 중요합니다.
- 목적이 커버 메이크업이라면 원본 스타일과의 유사성, 핵심 포인트 재현도, 분위기 일치도가 중요합니다.

사용자 목적 해석:
1. userGoalText를 읽고 사용자가 원하는 상황/목적을 짧게 해석하세요.
2. goalIntentType이 generic_default라면 사용자가 구체 목적을 맡긴 것이므로 전체적인 균형, 자연스러움, 완성도 기준으로 평가하세요.
3. goalIntentType이 valid_context라면 userGoalText의 장소, 일정, 대상, 원하는 인상을 분석 기준에 반영하세요.
4. 표현 강도를 light, medium, bold 중 하나로 판단하세요.
5. userGoalText가 모호하면 사진에서 보이는 메이크업 강도와 profileGender를 참고하되, 성별 고정관념으로 판단하지 마세요.
6. 사용자의 목적과 맞지 않는 과한 조언을 하지 마세요.
   예: “남자 데일리 메이크업인데 티 안 나게 자연스러운지 보고 싶어”라면 속눈썹을 진하게 하라고 하지 말고, 피부 표현, 눈썹 정리, 톤 차이, 경계 흐림, 자연스러움을 중심으로 평가하세요.
5. 반대로 “아이돌 무대 메이크업처럼 화려한지 봐줘”라면 속눈썹, 아이라인, 렌즈, 아이섀도, 하이라이터, 섀딩도 적극 평가할 수 있습니다.

평가 주제:
아래 10개 주제를 모두 확인하세요.

- 눈썹
- 속눈썹
- 렌즈
- 아이라인
- 아이섀도
- 애교살
- 파운데이션
- 블러셔
- 하이라이터
- 섀딩

각 주제는 아래 3가지 중 하나로 분류하세요:

1. strength
- 사용자의 목적에 잘 맞고, 현재 표현이 좋은 항목입니다.
- 결과 화면의 “잘한 포인트”에 표시됩니다.

2. improvement
- 사용자의 목적에 비해 보완하면 더 좋아질 항목입니다.
- 결과 화면의 “보완 포인트”에 표시됩니다.

3. optional
- 이번 목적에서는 필수 평가/강화 항목은 아니지만, 원하면 조절할 수 있는 항목입니다.
- 결과 화면에는 크게 표시하지 않습니다.
- 내부 JSON에는 포함하세요.
- optional 항목을 억지로 잘한 포인트나 보완 포인트로 만들지 마세요.

중요한 피드백 원칙:
- 모든 항목을 억지로 보완시키지 마세요.
- 모든 항목을 억지로 칭찬하지 마세요.
- 사용자의 목적에 맞는 완성도, 자연스러움, 표현 강도, 과함 여부, 균형감을 기준으로 판단하세요.
- 사진에서 보이지 않거나 확실하지 않은 부분은 단정하지 마세요.
- 속눈썹, 렌즈, 아이라인, 아이섀도, 애교살은 목적에 따라 선택항목이 될 수 있습니다.
- 특히 자연스러운 남성 데일리, 면접, 증명사진 목적에서는 속눈썹/렌즈/아이라인을 강하게 권하지 마세요.
- 다만 사용자가 무대, 촬영, 아이돌, 커버 메이크업을 원하면 해당 항목도 적극 평가하세요.
- 의학적 피부 진단, 외모 비하, 성별 고정관념, 정체성 추정은 하지 마세요.
- 피드백은 친절하고 실용적인 한국어로 작성하세요.
- 각 설명은 1~2문장으로 작성하세요.

출력 JSON 형식:
반드시 JSON만 반환하세요.
마크다운, 설명 문장, 코드블록은 반환하지 마세요.

{json.dumps(output_contract, ensure_ascii=False, indent=2)}

topicId는 반드시 아래 값만 사용하세요:
{topic_id_text}

evaluations 배열에는 위 10개 topicId가 모두 정확히 한 번씩 포함되어야 합니다.
각 topic의 status는 strength, improvement, optional 중 하나여야 합니다.
confidence는 0.0 이상 1.0 이하 숫자여야 합니다.
scoreImpact는 high, medium, low 중 하나여야 합니다.

출력 예시의 문장을 그대로 복사하지 말고, 반드시 실제 사진과 userGoalText에 맞춰 작성하세요.

Request metadata:
{json.dumps(metadata, ensure_ascii=False)}
""".strip()

  def _extract_output_text(self, response_payload: dict[str, Any]) -> str:
    content = response_payload.get("content")

    if isinstance(content, list):
      return "\n".join(
        str(part.get("text") or "")
        for part in content
        if isinstance(part, dict) and part.get("type") == "text"
      ).strip()

    completion = response_payload.get("completion")

    if isinstance(completion, str):
      return completion.strip()

    return ""

  def _parse_json_output(self, output_text: str) -> dict[str, Any]:
    normalized = output_text.strip()
    fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", normalized, re.DOTALL)

    if fence_match:
      normalized = fence_match.group(1).strip()

    try:
      parsed = json.loads(normalized)
    except json.JSONDecodeError as exc:
      raise AppError(502, "FEEDBACK_BEDROCK_OUTPUT_PARSE_FAILED", "Bedrock feedback analysis did not return valid JSON.") from exc

    if not isinstance(parsed, dict):
      raise AppError(502, "FEEDBACK_BEDROCK_OUTPUT_INVALID", "Bedrock feedback analysis returned an unexpected result shape.")

    return parsed

  def _analyze_sync(self, payload: dict[str, Any], image_bytes: bytes) -> dict[str, Any]:
    model_id = self.settings.effective_analysis_model_id

    if not model_id:
      raise AppError(503, "BEDROCK_ANALYSIS_NOT_CONFIGURED", "A Bedrock Claude model ID or inference profile ID is required.")

    content_type = self._infer_content_type(payload)
    image_base64 = base64.b64encode(image_bytes).decode("utf-8")
    started_at = time.monotonic()
    logger.info(
      "[aura:feedback-bedrock] analyze:start model=%s region=%s",
      model_id,
      self.settings.effective_bedrock_analysis_region,
    )
    guardrail_kwargs = build_bedrock_guardrail_invoke_kwargs(self.settings)
    response = self._bedrock_runtime_client().invoke_model(
      modelId=model_id,
      body=json.dumps(
        {
          "anthropic_version": "bedrock-2023-05-31",
          "max_tokens": 3600,
          "temperature": 0.2,
          "system": "당신은 K-뷰티 메이크업 피드백 전문가입니다. 반드시 JSON만 반환하세요.",
          "messages": [
            {
              "role": "user",
              "content": [
                {"type": "text", "text": self._build_prompt(payload)},
                {
                  "type": "image",
                  "source": {
                    "type": "base64",
                    "media_type": content_type,
                    "data": image_base64,
                  },
                },
              ],
            },
          ],
        },
        ensure_ascii=False,
      ),
      accept="application/json",
      contentType="application/json",
      **guardrail_kwargs,
    )
    response_payload = json.loads(response["body"].read())
    output_text = self._extract_output_text(response_payload)

    if not output_text:
      raise AppError(502, "FEEDBACK_BEDROCK_EMPTY_OUTPUT", "Bedrock feedback analysis returned an empty response.")

    parsed = self._parse_json_output(output_text)
    logger.info(
      "[aura:feedback-bedrock] analyze:success durationMs=%s",
      round((time.monotonic() - started_at) * 1000),
    )

    return normalize_makeup_feedback_result(parsed, payload)

  async def analyze(self, payload: dict[str, Any]) -> dict[str, Any]:
    image_bytes = await asyncio.to_thread(self._read_image_bytes, payload)
    return await asyncio.to_thread(self._analyze_sync, payload, image_bytes)


async def build_makeup_feedback_result_for_request(
  payload: dict[str, Any],
  settings: Settings,
) -> tuple[dict[str, Any], str, dict[str, Any] | None]:
  if settings.analysis_provider != "bedrock":
    return build_fallback_makeup_feedback_result(payload), "provider_fallback", None

  try:
    return await MakeupFeedbackBedrockService(settings).analyze(payload), "bedrock_completed", None
  except AppError as exc:
    logger.warning("[aura:feedback-bedrock] analyze:app-error code=%s details=%s", exc.code, exc.details)
    return build_fallback_makeup_feedback_result(payload), "bedrock_failed_fallback", {"code": exc.code, "message": exc.message, "details": exc.details}
  except (BotoCoreError, ClientError) as exc:
    logger.warning("[aura:feedback-bedrock] analyze:aws-error reason=%s message=%s", exc.__class__.__name__, str(exc))
    return build_fallback_makeup_feedback_result(payload), "bedrock_failed_fallback", {"code": "BEDROCK_INVOCATION_FAILED", "message": str(exc)}
  except Exception as exc:  # noqa: BLE001 - keep the mobile flow alive during prompt iteration.
    logger.exception("[aura:feedback-bedrock] analyze:failed")
    return build_fallback_makeup_feedback_result(payload), "bedrock_failed_fallback", {"code": "FEEDBACK_BEDROCK_FAILED", "message": exc.__class__.__name__}