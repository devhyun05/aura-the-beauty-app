import asyncio
import json
import logging
from typing import Any

import boto3
from botocore.exceptions import ClientError
from pydantic import ValidationError

from app.core.errors import AppError
from app.core.settings import Settings
from app.schemas.makeup_recommendation import GeneratedMakeupRecommendation, GeneratedQuestions


logger = logging.getLogger(__name__)


def apply_refinement_contract(
  previous: dict[str, Any],
  generated: dict[str, Any],
  refinement: str,
) -> dict[str, Any]:
  generated_looks = generated.get("looks") if isinstance(generated.get("looks"), list) else []
  clean_generated = [{key: value for key, value in look.items() if key != "imageUrl"} for look in generated_looks if isinstance(look, dict)]
  if refinement != "replaceProducts":
    return {**generated, "looks": clean_generated}

  previous_looks = previous.get("looks") if isinstance(previous.get("looks"), list) else []
  generated_by_role = {look.get("role"): look for look in clean_generated}
  merged = []
  for previous_look in previous_looks:
    if not isinstance(previous_look, dict):
      continue
    replacement = generated_by_role.get(previous_look.get("role"), {})
    preserved = {key: value for key, value in previous_look.items() if key not in {"imageUrl", "products"}}
    merged.append({**preserved, "products": replacement.get("products", previous_look.get("products", []))})
  return {**generated, "looks": merged}


def _converse(settings: Settings, model_id: str, system: str, prompt: str) -> dict[str, Any]:
  client = boto3.client("bedrock-runtime", region_name=settings.aws_region)
  response = client.converse(
    modelId=model_id,
    system=[{"text": system}],
    messages=[{"role": "user", "content": [{"text": prompt}]}],
    inferenceConfig={"maxTokens": 1800, "temperature": 0.7},
  )
  text = "".join(
    block.get("text", "")
    for block in response.get("output", {}).get("message", {}).get("content", [])
    if isinstance(block, dict)
  ).strip()
  if text.startswith("```") and text.endswith("```"):
    first_newline = text.find("\n")
    text = text[first_newline + 1 : -3].strip() if first_newline >= 0 else text[3:-3].strip()
  try:
    value = json.loads(text)
  except json.JSONDecodeError as exc:
    raise AppError(502, "BEDROCK_INVALID_JSON", "Bedrock returned an invalid recommendation response.") from exc
  if not isinstance(value, dict):
    raise AppError(502, "BEDROCK_INVALID_JSON", "Bedrock returned an invalid recommendation response.")
  return value


async def generate_json(settings: Settings, model_id: str, system: str, prompt: str) -> dict[str, Any]:
  if not model_id:
    raise AppError(503, "BEDROCK_MODEL_NOT_CONFIGURED", "The Bedrock model is not configured.")
  try:
    return await asyncio.to_thread(_converse, settings, model_id, system, prompt)
  except AppError:
    raise
  except Exception as exc:
    error = _bedrock_app_error(exc)
    logger.exception(
      "[aura:makeup-recommendation] bedrock:failed modelId=%s providerCode=%s providerRequestId=%s",
      model_id,
      error.details.get("providerCode"),
      error.details.get("providerRequestId"),
    )
    raise error from exc


def _bedrock_app_error(exc: Exception) -> AppError:
  if not isinstance(exc, ClientError):
    return AppError(502, "BEDROCK_REQUEST_FAILED", "The Bedrock request failed.")

  error = exc.response.get("Error", {})
  metadata = exc.response.get("ResponseMetadata", {})
  provider_code = str(error.get("Code") or "ClientError")
  request_id = str(metadata.get("RequestId") or "")
  details = {
    "providerCode": provider_code,
    **({"providerRequestId": request_id} if request_id else {}),
  }
  if provider_code in {"AccessDeniedException", "UnauthorizedException"}:
    return AppError(
      503,
      "BEDROCK_ACCESS_DENIED",
      "Bedrock access is not configured for this service.",
      details,
    )
  if provider_code in {"ThrottlingException", "ServiceUnavailableException"}:
    return AppError(
      503,
      "BEDROCK_TEMPORARILY_UNAVAILABLE",
      "Bedrock is temporarily unavailable.",
      details,
    )
  if provider_code in {"ValidationException", "ResourceNotFoundException"}:
    return AppError(
      502,
      "BEDROCK_MODEL_REQUEST_INVALID",
      "The configured Bedrock model request is invalid.",
      details,
    )
  return AppError(502, "BEDROCK_REQUEST_FAILED", "The Bedrock request failed.", details)


async def generate_scenarios(settings: Settings, count: int, exclude_texts: list[str]) -> dict[str, Any]:
  excluded = [text.strip()[:60] for text in exclude_texts if text.strip()][:100]
  seen = {text.casefold() for text in excluded}
  items: list[dict[str, Any]] = []

  for _attempt in range(3):
    remaining = count - len(items)
    if remaining <= 0:
      break
    response = await generate_json(
      settings,
      settings.effective_scenario_model_id,
      "Generate concise, inclusive Korean makeup situation cards. Return JSON only.",
      f"Return {{\"items\":[{{\"id\":\"string\",\"text\":\"short display copy\",\"seedPrompt\":\"specific makeup intent\",\"tags\":[\"string\"]}}]}} with exactly {remaining} items. Keep each text under 18 Korean characters and avoid the words 룩 and 메이크업. seedPrompt must clearly describe the makeup direction without relying on the display copy. Do not repeat any of these previously shown texts: {json.dumps([*excluded, *[item['text'] for item in items]], ensure_ascii=False)}",
    )
    for raw_item in response.get("items", []):
      if not isinstance(raw_item, dict):
        continue
      text = str(raw_item.get("text") or "").strip()[:60]
      seed_prompt = str(raw_item.get("seedPrompt") or "").strip()[:240]
      normalized = text.casefold()
      if not text or not seed_prompt or normalized in seen:
        continue
      tags = raw_item.get("tags")
      items.append(
        {
          "id": str(raw_item.get("id") or f"scenario-{len(items) + 1}"),
          "text": text,
          "seedPrompt": seed_prompt,
          "tags": [str(tag).strip() for tag in tags[:8] if str(tag).strip()] if isinstance(tags, list) else [],
        },
      )
      seen.add(normalized)
      if len(items) >= count:
        break

  if not items:
    raise AppError(502, "BEDROCK_EMPTY_SCENARIOS", "Bedrock did not return any usable makeup scenarios.")
  return {"items": items[:count]}


async def generate_questions(settings: Settings, scenario_text: str, tags: list[str]) -> dict[str, Any]:
  for _attempt in range(2):
    response = await generate_json(
      settings,
      settings.effective_question_model_id,
      "Generate simple, non-overlapping Korean multiple-choice questions for makeup discovery. Return JSON only.",
      f"Scenario: {scenario_text}\nTags: {', '.join(tags)}\nReturn {{\"questions\":[{{\"id\":\"string\",\"title\":\"string\",\"options\":[{{\"id\":\"string\",\"label\":\"string\"}}]}}]}} with 1 to 3 questions and 4 to 6 options each. Every question must include an option equivalent to 'AI가 골라줘'. Ask only for important information not already clear from the scenario.",
    )
    try:
      return GeneratedQuestions.model_validate(response).model_dump(by_alias=True)
    except ValidationError:
      continue
  raise AppError(502, "BEDROCK_INVALID_QUESTIONS", "Bedrock returned invalid makeup questions.")


async def generate_recommendation(settings: Settings, scenario_text: str, tags: list[str], questions: list[dict[str, Any]], answers: list[dict[str, Any]]) -> dict[str, Any]:
  output_contract = (
    '{"looks":[{"id":"string","role":"anchor|bold|discovery","title":"string",'
    '"summary":"string","reasons":["string"],"appliedConditions":["string"],'
    '"durationMinutes":15,"difficulty":"easy|medium|advanced",'
    '"steps":[{"order":1,"area":"base|brow|eye|cheek|lip","instruction":"string"}],'
    '"products":[{"area":"base|brow|eye|cheek|lip","brandName":"string",'
    '"productName":"string","shadeName":"string","reason":"string"}]}]}'
  )
  for _attempt in range(2):
    response = await generate_json(
      settings,
      settings.effective_recommendation_model_id,
      "Generate practical, inclusive Korean makeup recommendations. Do not use face analysis or personal color data. Return JSON only.",
      f"Scenario: {scenario_text}\nTags: {tags}\nQuestions: {json.dumps(questions, ensure_ascii=False)}\nAnswers: {json.dumps(answers, ensure_ascii=False)}\nReturn exactly this shape: {output_contract}. Return exactly three meaningfully different looks in this order: anchor (safe and balanced), bold (clearer and more expressive), discovery (unexpected but wearable). Each look must include one step for every area: base, brow, eye, cheek, lip, plus 3 to 8 realistic Korean-market product suggestions. Direct user answers and constraints take priority.",
    )
    try:
      return GeneratedMakeupRecommendation.model_validate(response).model_dump(by_alias=True)
    except ValidationError:
      continue
  raise AppError(502, "BEDROCK_INVALID_RECOMMENDATION", "Bedrock returned an invalid makeup recommendation.")
