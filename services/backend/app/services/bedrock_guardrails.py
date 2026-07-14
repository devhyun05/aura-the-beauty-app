from __future__ import annotations

import asyncio
import logging
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.errors import AppError
from app.core.settings import Settings


logger = logging.getLogger(__name__)

GUARDRAIL_BLOCKED_MESSAGE = "메이크업 피드백에 필요한 상황이나 목적을 적어주세요."


def build_bedrock_guardrail_invoke_kwargs(settings: Settings) -> dict[str, str]:
  if not settings.bedrock_guardrail_configured:
    return {}

  kwargs = {
    "guardrailIdentifier": (settings.bedrock_guardrail_id or "").strip(),
    "guardrailVersion": (settings.bedrock_guardrail_version or "").strip(),
  }

  if settings.bedrock_guardrail_trace:
    kwargs["trace"] = "ENABLED"

  return kwargs


def _safe_guardrail_details(response: dict[str, Any]) -> dict[str, Any]:
  details: dict[str, Any] = {
    "action": response.get("action"),
    "actionReason": response.get("actionReason"),
  }
  assessments = response.get("assessments")

  if isinstance(assessments, list):
    detected: list[dict[str, Any]] = []

    for assessment in assessments:
      if not isinstance(assessment, dict):
        continue

      topic_policy = assessment.get("topicPolicy")
      if isinstance(topic_policy, dict):
        for topic in topic_policy.get("topics") or []:
          if isinstance(topic, dict) and (topic.get("detected") or topic.get("action") == "BLOCKED"):
            detected.append({"policy": "topic", "name": topic.get("name"), "action": topic.get("action")})

      content_policy = assessment.get("contentPolicy")
      if isinstance(content_policy, dict):
        for content_filter in content_policy.get("filters") or []:
          if isinstance(content_filter, dict) and content_filter.get("detected"):
            detected.append({"policy": "content", "type": content_filter.get("type"), "action": content_filter.get("action")})

      word_policy = assessment.get("wordPolicy")
      if isinstance(word_policy, dict):
        for word in word_policy.get("customWords") or []:
          if isinstance(word, dict) and word.get("detected"):
            detected.append({"policy": "word", "action": word.get("action")})
        for word in word_policy.get("managedWordLists") or []:
          if isinstance(word, dict) and word.get("detected"):
            detected.append({"policy": "managed_word", "type": word.get("type"), "action": word.get("action")})

      sensitive_policy = assessment.get("sensitiveInformationPolicy")
      if isinstance(sensitive_policy, dict):
        for entity in sensitive_policy.get("piiEntities") or []:
          if isinstance(entity, dict) and entity.get("detected"):
            detected.append({"policy": "pii", "type": entity.get("type"), "action": entity.get("action")})
        for regex in sensitive_policy.get("regexes") or []:
          if isinstance(regex, dict) and regex.get("detected"):
            detected.append({"policy": "regex", "name": regex.get("name"), "action": regex.get("action")})

    if detected:
      details["detected"] = detected

  return details


class BedrockGuardrailService:
  def __init__(self, settings: Settings) -> None:
    self.settings = settings

  def _client(self):
    client_kwargs = {
      "region_name": self.settings.effective_bedrock_guardrail_region,
      "config": Config(connect_timeout=10, read_timeout=25, retries={"max_attempts": 1}),
    }

    if self.settings.aws_access_key_id and self.settings.aws_secret_access_key:
      client_kwargs.update(
        {
          "aws_access_key_id": self.settings.aws_access_key_id,
          "aws_secret_access_key": self.settings.aws_secret_access_key,
        },
      )

    return boto3.client("bedrock-runtime", **client_kwargs)

  def apply_input_text_sync(self, text: str, *, context: str) -> dict[str, Any] | None:
    if not text.strip():
      return None

    if not self.settings.bedrock_guardrail_configured:
      if self.settings.bedrock_guardrail_required:
        raise AppError(
          503,
          "BEDROCK_GUARDRAIL_NOT_CONFIGURED",
          "Bedrock guardrail ID and version are required for this environment.",
        )

      logger.info("[aura:bedrock-guardrail] skipped context=%s reason=not_configured", context)
      return None

    logger.info(
      "[aura:bedrock-guardrail] apply:start context=%s guardrailId=%s version=%s region=%s",
      context,
      self.settings.bedrock_guardrail_id,
      self.settings.bedrock_guardrail_version,
      self.settings.effective_bedrock_guardrail_region,
    )
    return self._client().apply_guardrail(
      guardrailIdentifier=(self.settings.bedrock_guardrail_id or "").strip(),
      guardrailVersion=(self.settings.bedrock_guardrail_version or "").strip(),
      source="INPUT",
      content=[{"text": {"text": text}}],
    )

  async def apply_input_text(self, text: str, *, context: str) -> dict[str, Any] | None:
    return await asyncio.to_thread(self.apply_input_text_sync, text, context=context)


async def assert_bedrock_guardrail_input_allowed(
  text: str,
  settings: Settings,
  *,
  context: str,
) -> None:
  try:
    response = await BedrockGuardrailService(settings).apply_input_text(text, context=context)
  except AppError:
    raise
  except (BotoCoreError, ClientError) as exc:
    logger.warning(
      "[aura:bedrock-guardrail] apply:aws-error context=%s reason=%s message=%s",
      context,
      exc.__class__.__name__,
      str(exc),
    )
    if settings.bedrock_guardrail_required:
      raise AppError(
        503,
        "BEDROCK_GUARDRAIL_CHECK_FAILED",
        "Bedrock guardrail check failed. Please try again.",
        {"context": context, "reason": exc.__class__.__name__},
      ) from exc
    return
  except Exception as exc:  # noqa: BLE001 - optional local guardrail should not break dev flows.
    logger.exception("[aura:bedrock-guardrail] apply:failed context=%s", context)
    if settings.bedrock_guardrail_required:
      raise AppError(
        503,
        "BEDROCK_GUARDRAIL_CHECK_FAILED",
        "Bedrock guardrail check failed. Please try again.",
        {"context": context, "reason": exc.__class__.__name__},
      ) from exc
    return

  if not response:
    return

  if response.get("action") == "GUARDRAIL_INTERVENED":
    details = _safe_guardrail_details(response)
    logger.warning(
      "[aura:bedrock-guardrail] apply:blocked context=%s reason=%s detected=%s",
      context,
      response.get("actionReason"),
      details.get("detected"),
    )
    raise AppError(
      400,
      "FEEDBACK_GOAL_GUARDRAIL_BLOCKED",
      GUARDRAIL_BLOCKED_MESSAGE,
      details,
    )

  logger.info("[aura:bedrock-guardrail] apply:allowed context=%s", context)
