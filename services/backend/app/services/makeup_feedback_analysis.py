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


logger = logging.getLogger(__name__)

MODEL_VERSION = "makeup-feedback:bedrock-v1"

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
DEFAULT_IMPROVEMENT_TOPIC_IDS = {"lash", "eyeliner", "blush", "shading"}

FALLBACK_DESCRIPTIONS = {
  "brow": "눈썹 결이 얼굴형과 잘 맞게 정리돼 있어요. 앞머리는 부드럽고 꼬리는 깔끔해서 전체 인상이 또렷해 보여요.",
  "lash": "속눈썹 중앙 볼륨은 좋지만 바깥쪽 컬이 조금 처져 보여요. 끝부분만 한 번 더 집어 올리면 눈매가 더 선명해져요.",
  "lens": "렌즈 직경과 컬러가 메이크업 톤을 방해하지 않고 자연스럽게 어울려요. 눈동자 선명도도 잘 살아나요.",
  "eyeliner": "눈꼬리 끝 각도가 양쪽에서 살짝 달라 보여요. 끝점 높이를 먼저 맞춘 뒤 얇게 연결하면 인상이 안정적으로 정리돼요.",
  "eyeshadow": "아이섀도 음영이 과하지 않고 눈두덩에 자연스럽게 깔려 있어요. 데일리 무드와 깊이감이 균형 있게 잡혔어요.",
  "aegyosal": "애교살 밝기가 과하지 않아 눈 밑이 깨끗해 보여요. 하이라이트가 필요한 부분에만 잘 올라가 있어요.",
  "foundation": "파운데이션 톤과 피부 표현이 안정적이에요. 목선과의 차이가 크지 않고 베이스가 얇게 밀착돼 보여요.",
  "blush": "블러셔가 광대 아래로 조금 내려와 보여요. 광대 중심보다 반 마디 위에서 바깥쪽으로 퍼뜨리면 얼굴이 더 또렷해져요.",
  "highlight": "하이라이터 위치가 좋아요. 콧대와 앞광대에 필요한 만큼만 빛이 올라와 얼굴 윤곽이 맑게 살아나요.",
  "shading": "섀딩 경계가 살짝 강하게 남아 있어요. 턱선과 코 옆은 브러시에 남은 양으로만 쓸어 주면 입체감이 자연스러워져요.",
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


def _normalize_status(value: Any) -> str:
  return "strength" if value == "strength" else "improvement"


def _score_from_counts(strength_count: int, improvement_count: int) -> int:
  return max(0, min(100, 70 + strength_count * 4 - improvement_count * 2))


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
    status = _normalize_status(
      raw_item.get("status")
      if raw_item
      else ("improvement" if topic_id in DEFAULT_IMPROVEMENT_TOPIC_IDS else "strength"),
    )
    description = _clean_text(raw_item.get("description"), FALLBACK_DESCRIPTIONS[topic_id])

    normalized.append(
      {
        "id": _clean_text(raw_item.get("id"), f"{topic_id}-{status}"),
        "topicId": topic_id,
        "topicLabel": topic["label"],
        "status": status,
        "title": _clean_text(raw_item.get("title"), topic["label"]),
        "description": description,
        "kind": topic["kind"],
        "confidence": raw_item.get("confidence") if isinstance(raw_item.get("confidence"), (int, float)) else None,
      },
    )

  return normalized


def normalize_makeup_feedback_result(result: dict[str, Any] | None, payload: dict[str, Any]) -> dict[str, Any]:
  source = _clean_text(payload.get("source"), "camera")
  evaluations = _normalize_evaluations(result.get("evaluations") if isinstance(result, dict) else None)
  points = _build_points(evaluations)
  strengths = _build_strengths(evaluations)
  score = result.get("score") if isinstance(result, dict) else None

  if not isinstance(score, int):
    score = _score_from_counts(len(strengths), len(points))

  return {
    "score": max(0, min(100, score)),
    "photoSourceLabel": "앨범 사진" if source == "gallery" else "촬영 사진",
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
    metadata = {
      key: value
      for key, value in payload.items()
      if key not in {"imageUrl", "cdnUrl", "sourceUri"}
    }
    topic_text = ", ".join(f"{topic['id']}={topic['label']}" for topic in FEEDBACK_TOPICS)

    return (
      "Analyze the provided makeup photo as a practical K-beauty makeup artist. "
      "Evaluate exactly these 10 topics: "
      f"{topic_text}. "
      "For every topic, decide whether it is a strength or an improvement. "
      "Return JSON only. Top-level keys: score, evaluations. "
      "evaluations must contain exactly 10 objects in the same topic order. "
      "Each evaluation keys: topicId, status, title, description, confidence. "
      "status must be either strength or improvement. "
      "description must be Korean, concrete, kind, and based only on visible makeup cues. "
      "Do not diagnose skin or identity. Do not mention uncertainty unless the image is unusable. "
      f"Request metadata: {json.dumps(metadata, ensure_ascii=False)}"
    )

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
    response = self._bedrock_runtime_client().invoke_model(
      modelId=model_id,
      body=json.dumps(
        {
          "anthropic_version": "bedrock-2023-05-31",
          "max_tokens": 2400,
          "temperature": 0.2,
          "system": "You are a concise K-beauty makeup feedback analyst. Return JSON only.",
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