import asyncio
import base64
from typing import Any
from uuid import UUID

import boto3

try:
  from openai import OpenAI
except ImportError:  # pragma: no cover
  OpenAI = None

from app.core.errors import AppError
from app.core.settings import Settings


def _prompt(scenario_text: str, recommendation: dict[str, Any]) -> str:
  title = str(recommendation.get("title") or "K-beauty makeup")
  summary = str(recommendation.get("summary") or "")
  steps = recommendation.get("steps") if isinstance(recommendation.get("steps"), list) else []
  instructions = "; ".join(
    str(step.get("instruction") or "")
    for step in steps[:8]
    if isinstance(step, dict) and step.get("instruction")
  )
  return " ".join(
    (
      "Create one polished editorial beauty reference image for a mobile makeup recommendation report.",
      "Show a diverse adult model in a clean head-and-shoulders beauty portrait with realistic skin texture and clearly visible makeup.",
      "No text, labels, logos, watermark, collage, before-and-after layout, or product packaging.",
      f"Situation: {scenario_text}.",
      f"Direction: {title}. {summary}. {instructions}",
    ),
  )[:1800]


def _generate_sync(
  settings: Settings,
  report_id: UUID,
  scenario_text: str,
  recommendation: dict[str, Any],
  image_key: str | None = None,
) -> str:
  if OpenAI is None:
    raise AppError(503, "OPENAI_SDK_NOT_INSTALLED", "The openai package is required for image generation.")
  if not settings.openai_api_key:
    raise AppError(503, "OPENAI_NOT_CONFIGURED", "OPENAI_API_KEY is required for image generation.")
  if not settings.s3_bucket_name:
    raise AppError(503, "S3_NOT_CONFIGURED", "S3_BUCKET_NAME is required for image generation.")

  client = OpenAI(api_key=settings.openai_api_key, base_url="https://api.openai.com/v1")
  response = client.images.generate(
    model=settings.openai_image_model_id,
    prompt=_prompt(scenario_text, recommendation),
    n=1,
    size=settings.openai_image_size or "auto",
    quality=settings.openai_image_quality,
    output_format="png",
  )
  encoded = response.data[0].b64_json if response.data else None
  if not encoded:
    raise AppError(502, "OPENAI_IMAGE_EMPTY_OUTPUT", "OpenAI image generation returned no image.")

  image_bytes = base64.b64decode(encoded)
  object_key = (
    f"uploads/generated-makeup-recommendations/{report_id}/{image_key}.png"
    if image_key
    else f"uploads/generated-makeup-recommendations/{report_id}.png"
  )
  boto3.client("s3", region_name=settings.aws_region).put_object(
    Bucket=settings.s3_bucket_name,
    Key=object_key,
    Body=image_bytes,
    ContentType="image/png",
    CacheControl="public, max-age=31536000, immutable",
  )
  cdn_base_url = settings.effective_cdn_base_url
  return f"{cdn_base_url}/{object_key}" if cdn_base_url else f"s3://{settings.s3_bucket_name}/{object_key}"


async def generate_recommendation_image(
  settings: Settings,
  report_id: UUID,
  scenario_text: str,
  recommendation: dict[str, Any],
  image_key: str | None = None,
) -> str:
  try:
    return await asyncio.to_thread(_generate_sync, settings, report_id, scenario_text, recommendation, image_key)
  except AppError:
    raise
  except Exception as exc:
    raise AppError(502, "OPENAI_IMAGE_GENERATION_FAILED", "OpenAI image generation failed.") from exc


async def generate_recommendation_images(
  settings: Settings,
  report_id: UUID,
  scenario_text: str,
  looks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
  generated: list[dict[str, Any]] = []
  for index, look in enumerate(looks[:3]):
    role = str(look.get("role") or f"look-{index + 1}")
    image_url = await generate_recommendation_image(
      settings,
      report_id,
      scenario_text,
      look,
      f"{index + 1}-{role}",
    )
    generated.append({**look, "imageUrl": image_url})
  return generated
