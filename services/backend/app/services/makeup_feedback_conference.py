import asyncio
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

VALID_AGENT_IDS = {"tone", "color", "style", "quality"}
DEFAULT_AGENT_SEQUENCE = ["tone", "color", "style", "quality", "tone", "style"]
MAX_CONFERENCE_MESSAGES = 7


def _clean_text(value: Any, fallback: str = "") -> str:
  if isinstance(value, str):
    normalized = " ".join(value.split()).strip()
    return normalized or fallback

  return fallback


def _shorten(value: str, max_length: int) -> str:
  normalized = _clean_text(value)

  if len(normalized) <= max_length:
    return normalized

  return f"{normalized[:max_length].rstrip()}..."


def _compact_feedback_result(result: dict[str, Any]) -> dict[str, Any]:
  interpreted_goal = result.get("interpretedGoal") or result.get("interpreted_goal")
  summary = result.get("summary") if isinstance(result.get("summary"), dict) else {}
  strengths = result.get("strengths") if isinstance(result.get("strengths"), list) else []
  points = result.get("points") if isinstance(result.get("points"), list) else []
  evaluations = result.get("evaluations") if isinstance(result.get("evaluations"), list) else []

  def compact_item(item: Any) -> dict[str, str] | None:
    if not isinstance(item, dict):
      return None

    return {
      "topicLabel": _shorten(_clean_text(item.get("topicLabel") or item.get("topic_label")), 18),
      "title": _shorten(_clean_text(item.get("title")), 28),
      "description": _shorten(_clean_text(item.get("description")), 90),
      "status": _clean_text(item.get("status")),
    }

  return {
    "score": result.get("score"),
    "scoreLabel": _clean_text(result.get("scoreLabel") or result.get("score_label"), "overall score"),
    "interpretedGoal": interpreted_goal if isinstance(interpreted_goal, dict) else {},
    "summary": {
      "strengthSummary": _shorten(_clean_text(summary.get("strengthSummary") or summary.get("strength_summary")), 100),
      "improvementSummary": _shorten(_clean_text(summary.get("improvementSummary") or summary.get("improvement_summary")), 100),
    },
    "strengths": [item for item in (compact_item(item) for item in strengths[:3]) if item],
    "points": [item for item in (compact_item(item) for item in points[:3]) if item],
    "topEvaluations": [item for item in (compact_item(item) for item in evaluations[:6]) if item],
  }


def _build_prompt(result: dict[str, Any], request_payload: dict[str, Any]) -> str:
  feedback_context = request_payload.get("feedbackContext") or request_payload.get("feedback_context")
  feedback_context = feedback_context if isinstance(feedback_context, dict) else {}
  user_goal_text = _clean_text(
    feedback_context.get("userGoalText")
    or feedback_context.get("user_goal_text")
    or request_payload.get("userGoalText")
    or request_payload.get("user_goal_text"),
    "general makeup feedback",
  )
  compact_result = _compact_feedback_result(result)
  output_contract = {
    "messages": [
      {
        "agentId": "tone | color | style | quality",
        "text": "natural Korean sentence",
      },
    ],
  }

  return f"""
You are the lead editor for AURA's AI Beauty Lab loading screen.
Write a short AI-agent roundtable conversation based on the real makeup feedback result below.
The user will see this while waiting, so it should feel like four specialists are aligning on the final advice.

Goals:
- Do not write status logs. This must feel like a conversation.
- Each agent should react to the previous agent and move the discussion toward a better final recommendation.
- Stay faithful to the provided result. Do not invent specific products, colors, skin diagnoses, or face-shape claims that are not present.
- Make the user feel the final report is being thoughtfully assembled from the analysis result.
- Keep the tone premium, friendly, and useful.

Agent roles:
- tone: skin tone, brightness, complexion balance.
- color: lip, cheek, eye, and overall color harmony.
- style: practical execution order and user-facing advice.
- quality: final consistency check and report readiness.

Rules:
- Return 5 to 7 messages.
- agentId must be one of tone, color, style, quality.
- text must be Korean, one sentence, 45 Korean characters or fewer when possible.
- Start with an observation that clearly reflects the result.
- The middle messages should build on strength and improvement points.
- The final message should naturally imply that the result screen is ready.
- Avoid phrases like "analyzing", "generating", "complete", "loading", or other log/status wording.
- Return JSON only. No markdown, no code fences, no explanation.

User goal:
{json.dumps(user_goal_text, ensure_ascii=False)}

Feedback result summary:
{json.dumps(compact_result, ensure_ascii=False, indent=2)}

Output contract:
{json.dumps(output_contract, ensure_ascii=False, indent=2)}
""".strip()


def _extract_output_text(response_payload: dict[str, Any]) -> str:
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


def _parse_json_output(output_text: str) -> dict[str, Any]:
  normalized = output_text.strip()
  fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", normalized, re.DOTALL)

  if fence_match:
    normalized = fence_match.group(1).strip()

  try:
    parsed = json.loads(normalized)
  except json.JSONDecodeError as exc:
    raise AppError(502, "FEEDBACK_CONFERENCE_OUTPUT_PARSE_FAILED", "Conference generation did not return valid JSON.") from exc

  if not isinstance(parsed, dict):
    raise AppError(502, "FEEDBACK_CONFERENCE_OUTPUT_INVALID", "Conference generation returned an unexpected result shape.")

  return parsed


def normalize_conference_messages(raw_messages: Any) -> list[dict[str, str]]:
  if not isinstance(raw_messages, list):
    return []

  messages: list[dict[str, str]] = []

  for index, raw_message in enumerate(raw_messages[:MAX_CONFERENCE_MESSAGES]):
    if not isinstance(raw_message, dict):
      continue

    agent_id = _clean_text(raw_message.get("agentId") or raw_message.get("agent_id"))

    if agent_id not in VALID_AGENT_IDS:
      agent_id = DEFAULT_AGENT_SEQUENCE[min(index, len(DEFAULT_AGENT_SEQUENCE) - 1)]

    text = _shorten(_clean_text(raw_message.get("text")), 72)

    if not text:
      continue

    messages.append({"agentId": agent_id, "text": text})

  return messages


class MakeupFeedbackConferenceBedrockService:
  def __init__(self, settings: Settings) -> None:
    self.settings = settings

  def _bedrock_runtime_client(self):
    client_kwargs = {
      "region_name": self.settings.effective_bedrock_analysis_region,
      "config": Config(connect_timeout=10, read_timeout=30, retries={"max_attempts": 1}),
    }

    if self.settings.aws_access_key_id and self.settings.aws_secret_access_key:
      client_kwargs.update(
        {
          "aws_access_key_id": self.settings.aws_access_key_id,
          "aws_secret_access_key": self.settings.aws_secret_access_key,
        },
      )

    return boto3.client("bedrock-runtime", **client_kwargs)

  def _generate_sync(self, result: dict[str, Any], request_payload: dict[str, Any]) -> list[dict[str, str]]:
    model_id = self.settings.effective_analysis_model_id

    if not model_id:
      raise AppError(503, "BEDROCK_ANALYSIS_NOT_CONFIGURED", "A Bedrock Claude model ID or inference profile ID is required.")

    started_at = time.monotonic()
    logger.info("[aura:feedback-conference] generate:start model=%s", model_id)
    response = self._bedrock_runtime_client().invoke_model(
      modelId=model_id,
      body=json.dumps(
        {
          "anthropic_version": "bedrock-2023-05-31",
          "max_tokens": 1200,
          "temperature": 0.55,
          "system": "You are a K-beauty AI roundtable editor. Return JSON only.",
          "messages": [
            {
              "role": "user",
              "content": [{"type": "text", "text": _build_prompt(result, request_payload)}],
            },
          ],
        },
        ensure_ascii=False,
      ),
      accept="application/json",
      contentType="application/json",
    )
    response_payload = json.loads(response["body"].read())
    output_text = _extract_output_text(response_payload)

    if not output_text:
      raise AppError(502, "FEEDBACK_CONFERENCE_EMPTY_OUTPUT", "Conference generation returned an empty response.")

    parsed = _parse_json_output(output_text)
    messages = normalize_conference_messages(parsed.get("messages"))

    if len(messages) < 3:
      raise AppError(502, "FEEDBACK_CONFERENCE_TOO_SHORT", "Conference generation returned too few messages.")

    logger.info(
      "[aura:feedback-conference] generate:success messages=%s durationMs=%s",
      len(messages),
      round((time.monotonic() - started_at) * 1000),
    )

    return messages

  async def generate(self, result: dict[str, Any], request_payload: dict[str, Any]) -> list[dict[str, str]]:
    return await asyncio.to_thread(self._generate_sync, result, request_payload)


async def build_makeup_feedback_conference_messages(
  result: dict[str, Any],
  request_payload: dict[str, Any],
  settings: Settings,
) -> tuple[list[dict[str, str]], str, dict[str, Any] | None]:
  if settings.analysis_provider != "bedrock":
    return [], "provider_fallback", None

  try:
    messages = await MakeupFeedbackConferenceBedrockService(settings).generate(result, request_payload)
    return messages, "bedrock_completed", None
  except AppError as exc:
    logger.warning("[aura:feedback-conference] generate:app-error code=%s details=%s", exc.code, exc.details)
    return [], "bedrock_failed_fallback", {"code": exc.code, "message": exc.message, "details": exc.details}
  except (BotoCoreError, ClientError) as exc:
    logger.warning("[aura:feedback-conference] generate:aws-error reason=%s message=%s", exc.__class__.__name__, str(exc))
    return [], "bedrock_failed_fallback", {"code": "BEDROCK_CONFERENCE_INVOCATION_FAILED", "message": str(exc)}
  except Exception as exc:  # noqa: BLE001 - keep the mobile loading flow alive.
    logger.exception("[aura:feedback-conference] generate:failed")
    return [], "bedrock_failed_fallback", {"code": "FEEDBACK_CONFERENCE_FAILED", "message": exc.__class__.__name__}