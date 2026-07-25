import asyncio
import base64
import logging
import re
from dataclasses import dataclass, field
from io import BytesIO
import time
from typing import Any, Literal
from uuid import UUID

import boto3

try:
  from openai import OpenAI
except ImportError:  # pragma: no cover
  OpenAI = None

try:
  from PIL import Image, ImageOps
except ImportError:  # pragma: no cover
  Image = None
  ImageOps = None

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.makeup_ai_observability import emit_ai_metric
from app.services.makeup_feedback_vision import (
  extract_makeup_face_crop_metadata,
  extract_personalized_makeup_face_metadata,
)
from app.services.makeup_recommendation_semantic import (
  build_semantic_makeup_color_metadata,
)


IMAGE_PROMPT_VERSION = "makeup-image-v2"
IMAGE_ROLES = ("anchor", "bold", "discovery")
OUTPUT_FORMATS = {
  "jpeg": ("jpg", "image/jpeg"),
  "png": ("png", "image/png"),
  "webp": ("webp", "image/webp"),
}
PROVIDER_OUTPUT_FORMATS = {"JPEG": "jpeg", "PNG": "png", "WEBP": "webp"}
MAX_PROVIDER_OUTPUT_PIXELS = 16_777_216
logger = logging.getLogger(__name__)
REQUIRED_CROP_AREA_COUNTS = {
  "base": 1,
  "brow": 2,
  "eye": 2,
  "cheek": 2,
  "lip": 1,
}


@dataclass(frozen=True)
class ValidatedImageOutput:
  content: bytes
  source_format: str
  output_format: str
  width: int
  height: int
  resized: bool


@dataclass(frozen=True)
class PersonalizedImageInput:
  media_id: UUID
  owner_user_id: UUID
  requested_user_id: UUID
  content: bytes
  content_type: str
  consent: bool
  filename: str = "source.jpg"


@dataclass(frozen=True)
class GeneratedRecommendationAsset:
  image_url: str | None
  storage_bucket: str
  object_key: str
  content_type: str
  is_private: bool
  input_media_id: UUID | None
  model_id: str
  prompt_version: str = IMAGE_PROMPT_VERSION
  provenance: dict[str, Any] = field(default_factory=dict)

  def payload(self) -> dict[str, Any]:
    return {
      "imageUrl": self.image_url,
      "storageBucket": self.storage_bucket,
      "objectKey": self.object_key,
      "contentType": self.content_type,
      "isPrivate": self.is_private,
      "inputMediaId": str(self.input_media_id) if self.input_media_id else None,
      "modelId": self.model_id,
      "promptVersion": self.prompt_version,
      "provenance": dict(self.provenance),
    }


def _generation_object_key(
  prefix: str,
  report_id: UUID,
  image_key: str,
  extension: str,
  generation_attempt: int | None,
) -> str:
  if generation_attempt is None:
    return f"{prefix}/{report_id}/{image_key}.{extension}"
  if generation_attempt < 1:
    raise ValueError("generation_attempt must be at least 1")
  return f"{prefix}/{report_id}/{image_key}/attempt-{generation_attempt}.{extension}"


def _prompt_text(value: Any, max_chars: int) -> str:
  return " ".join(str(value or "").split())[:max_chars]


def _application_plan_contract(guide: dict[str, Any]) -> str:
  plan = guide.get("applicationPlan")
  if not isinstance(plan, dict) or not isinstance(plan.get("steps"), list):
    return ""
  contracts: list[str] = []
  for step in plan["steps"][:8]:
    if not isinstance(step, dict):
      continue
    colors = step.get("colors") if isinstance(step.get("colors"), list) else []
    color_copy = "/".join(
      " ".join(
        part for part in (
          _prompt_text(color.get("role"), 12),
          _prompt_text(color.get("name"), 20),
          _prompt_text(color.get("hex"), 7),
        ) if part
      )
      for color in colors[:4]
      if isinstance(color, dict)
    )
    contracts.append(
      f"#{step.get('order')} {_prompt_text(step.get('title'), 24)}"
      f"[{color_copy}]@{_prompt_text(step.get('placement'), 36)}>"
      f"{_prompt_text(step.get('technique'), 36)};"
      f"finish:{_prompt_text(step.get('finishCheck'), 30)}"
    )
  return " | ".join(contracts)[:820]


def _area_color_texture_contract(recommendation: dict[str, Any]) -> str:
  area_guides = recommendation.get("areaGuides")
  if not isinstance(area_guides, list):
    area_guides = recommendation.get("area_guides")
  if not isinstance(area_guides, list):
    area_guides = recommendation.get("steps")
  if not isinstance(area_guides, list):
    return ""

  contracts: list[str] = []
  for item in area_guides[:6]:
    if not isinstance(item, dict):
      continue
    area = _prompt_text(item.get("area") or item.get("label"), 40)
    color = item.get("color") if isinstance(item.get("color"), dict) else {}
    color_name = _prompt_text(color.get("name"), 60)
    color_hex = _prompt_text(color.get("hex"), 16)
    if not re.fullmatch(r"#[0-9A-Fa-f]{6}", color_hex):
      color_hex = ""
    texture = _prompt_text(item.get("texture"), 80)
    details = []
    if color_name or color_hex:
      details.append(f"color {color_name} {color_hex}".strip())
    if texture:
      details.append(f"texture {texture}")
    application_plan = _application_plan_contract(item)
    if application_plan:
      details.append(f"layers {application_plan}")
    if area and details:
      contracts.append(f"{area}: {', '.join(details)}")
  return "; ".join(contracts)


def _profile_presentation_instruction(value: Any) -> str:
  presentation = str(value or "neutral").strip().casefold()
  instructions = {
    "feminine": (
      "Use a feminine makeup presentation with refined definition and balanced color, "
      "unless the explicit makeup brief asks for a different expression."
    ),
    "masculine": (
      "Use a masculine makeup presentation with restrained color and polished skin, brow, "
      "and contour definition, unless the explicit makeup brief asks for a different expression."
    ),
    "neutral": (
      "Use a gender-neutral makeup presentation with balanced definition and color, without "
      "assuming a feminine or masculine expression."
    ),
  }
  instruction = instructions.get(presentation, instructions["neutral"])
  return (
    f"{instruction} Treat this only as makeup styling direction; do not infer gender from the "
    "face or change identity, facial structure, or sex characteristics."
  )


def _prompt(
  scenario_text: str,
  recommendation: dict[str, Any],
  *,
  personalized: bool,
  profile_presentation: str = "neutral",
) -> str:
  title = _prompt_text(recommendation.get("title") or "K-beauty makeup", 160)
  summary = _prompt_text(recommendation.get("summary"), 400)
  image_brief = _prompt_text(
    recommendation.get("imageBrief") or recommendation.get("image_brief"),
    800,
  )
  color_texture = _area_color_texture_contract(recommendation)
  mode_instruction = (
    "Edit only the makeup. Preserve the same adult person's identity, facial geometry, "
    "skin texture, hair, expression, pose, clothing, lighting, camera angle, and background. "
    "Preserve the exact crop and framing, head size, face center and pixel position; "
      "do not zoom, reframe, recrop, rotate, or translate the subject."
    if personalized
    else (
      "Show a fictional, non-identifiable adult model in a clean head-and-shoulders beauty "
      "portrait with realistic skin texture and clearly visible makeup."
    )
  )
  presentation_instruction = _profile_presentation_instruction(profile_presentation)
  parts = [
    "Create one polished editorial K-beauty reference image for a mobile makeup recommendation report.",
    mode_instruction,
    presentation_instruction,
    "Keep the result photorealistic and achievable with cosmetics; do not reshape facial features.",
    "No text, labels, logos, watermark, collage, before-and-after layout, or product packaging.",
    f"Situation: {_prompt_text(scenario_text, 300)}.",
    f"Makeup direction: {title}. {summary}.",
  ]
  if color_texture:
    parts.append(f"Required area colors, textures, and application layers: {color_texture}.")
  if image_brief:
    parts.append(f"Claude image brief: {image_brief}.")
  return " ".join(parts)[:7000]


def _output_contract(settings: Settings) -> tuple[str, str, str]:
  output_format = str(settings.openai_image_output_format or "jpeg").strip().lower()
  if output_format == "jpg":
    output_format = "jpeg"
  contract = OUTPUT_FORMATS.get(output_format)
  if contract is None:
    raise AppError(
      500,
      "OPENAI_IMAGE_OUTPUT_FORMAT_INVALID",
      "OPENAI_IMAGE_OUTPUT_FORMAT must be jpeg, png, or webp.",
    )
  extension, content_type = contract
  return output_format, extension, content_type


def _openai_output_args(settings: Settings) -> dict[str, Any]:
  output_format, _extension, _content_type = _output_contract(settings)
  args: dict[str, Any] = {"output_format": output_format}
  if output_format in {"jpeg", "webp"}:
    args["output_compression"] = settings.openai_image_output_compression
  return args


def _validate_personalized_input(
  settings: Settings,
  source: PersonalizedImageInput | None,
) -> PersonalizedImageInput:
  if not settings.makeup_personalized_image_enabled:
    raise AppError(
      409,
      "MAKEUP_PERSONALIZED_IMAGE_DISABLED",
      "Personalized makeup image generation is disabled.",
    )
  if source is None or not source.consent:
    raise AppError(
      400,
      "MAKEUP_IMAGE_CONSENT_REQUIRED",
      "Explicit consent is required before sending a face image to the image provider.",
    )
  if source.owner_user_id != source.requested_user_id:
    raise AppError(
      404,
      "MAKEUP_SOURCE_MEDIA_NOT_FOUND",
      "The owned source media was not found.",
    )
  if source.content_type.lower() not in {"image/jpeg", "image/png", "image/webp"}:
    raise AppError(
      400,
      "MAKEUP_SOURCE_MEDIA_TYPE_INVALID",
      "The source media must be JPEG, PNG, or WebP.",
    )
  if not source.content:
    raise AppError(400, "MAKEUP_SOURCE_MEDIA_EMPTY", "The source media is empty.")
  return source


def _normalize_source_image(settings: Settings, source: PersonalizedImageInput) -> BytesIO:
  if Image is None or ImageOps is None:
    raise AppError(
      503,
      "IMAGE_PROCESSING_NOT_INSTALLED",
      "Pillow is required for personalized image generation.",
    )
  try:
    with Image.open(BytesIO(source.content)) as opened:
      image = ImageOps.exif_transpose(opened).convert("RGB")
      max_edge = settings.openai_image_input_max_edge
      image.thumbnail((max_edge, max_edge))
      normalized = BytesIO()
      image.save(
        normalized,
        format="JPEG",
        quality=settings.openai_image_input_quality,
        optimize=True,
      )
  except AppError:
    raise
  except Exception as exc:
    raise AppError(
      400,
      "MAKEUP_SOURCE_MEDIA_INVALID",
      "The source media could not be decoded as an image.",
    ) from exc
  normalized.seek(0)
  normalized.name = "owned-source.jpg"
  return normalized


def _decode_response(response: Any) -> bytes:
  encoded = response.data[0].b64_json if getattr(response, "data", None) else None
  if not encoded:
    raise AppError(
      502,
      "OPENAI_IMAGE_EMPTY_OUTPUT",
      "OpenAI image generation returned no image.",
    )
  try:
    return base64.b64decode(encoded, validate=True)
  except (ValueError, TypeError) as exc:
    raise AppError(
      502,
      "OPENAI_IMAGE_INVALID_OUTPUT",
      "OpenAI image generation returned invalid image data.",
    ) from exc


def _validate_and_normalize_output(
  settings: Settings,
  content: bytes,
  output_format: str,
) -> ValidatedImageOutput:
  if Image is None or ImageOps is None:
    raise AppError(
      503,
      "IMAGE_PROCESSING_NOT_INSTALLED",
      "Pillow is required to validate generated images.",
    )
  try:
    with Image.open(BytesIO(content)) as opened:
      source_format = PROVIDER_OUTPUT_FORMATS.get(str(opened.format or "").upper())
      if source_format is None:
        raise AppError(
          502,
          "OPENAI_IMAGE_OUTPUT_FORMAT_INVALID",
          "OpenAI returned an unsupported image format.",
        )
      source_width, source_height = opened.size
      if (
        source_width <= 0
        or source_height <= 0
        or source_width * source_height > MAX_PROVIDER_OUTPUT_PIXELS
      ):
        raise AppError(
          502,
          "OPENAI_IMAGE_OUTPUT_DIMENSIONS_INVALID",
          "OpenAI returned invalid image dimensions.",
        )
      opened.load()
      rendered = ImageOps.exif_transpose(opened)
      max_edge = settings.openai_image_output_max_edge
      resized = max(rendered.size) > max_edge
      if resized:
        resampling = getattr(Image, "Resampling", Image)
        rendered.thumbnail((max_edge, max_edge), resampling.LANCZOS)

      has_alpha = rendered.mode in {"RGBA", "LA"} or (
        rendered.mode == "P" and "transparency" in rendered.info
      )
      if output_format == "jpeg":
        rendered = rendered.convert("RGB")
      elif rendered.mode not in {"RGB", "RGBA"}:
        rendered = rendered.convert("RGBA" if has_alpha else "RGB")

      width, height = rendered.size
      can_reuse_provider_bytes = (
        output_format == "jpeg"
        and source_format == "jpeg"
        and not resized
        and opened.mode == "RGB"
        and not opened.getexif()
      )
      if can_reuse_provider_bytes:
        # The provider already encoded the requested JPEG quality. Re-encoding an
        # unchanged image would only add a second lossy pass, which is especially
        # visible when eye and brow regions are enlarged in the mobile guide.
        normalized_content = content
      else:
        normalized = BytesIO()
        if output_format == "jpeg":
          rendered.save(
            normalized,
            format="JPEG",
            quality=max(1, settings.openai_image_output_compression),
            optimize=True,
          )
        elif output_format == "webp":
          rendered.save(
            normalized,
            format="WEBP",
            quality=max(1, settings.openai_image_output_compression),
            method=6,
          )
        else:
          rendered.save(normalized, format="PNG", optimize=True)
        normalized_content = normalized.getvalue()

    with Image.open(BytesIO(normalized_content)) as verified:
      actual_format = PROVIDER_OUTPUT_FORMATS.get(str(verified.format or "").upper())
      if actual_format != output_format or verified.size != (width, height):
        raise AppError(
          502,
          "OPENAI_IMAGE_OUTPUT_NORMALIZATION_FAILED",
          "The generated image could not be normalized to the storage contract.",
        )
      verified.verify()
    return ValidatedImageOutput(
      content=normalized_content,
      source_format=source_format,
      output_format=output_format,
      width=width,
      height=height,
      resized=resized,
    )
  except AppError:
    raise
  except Exception as exc:
    raise AppError(
      502,
      "OPENAI_IMAGE_INVALID_OUTPUT",
      "OpenAI image generation returned undecodable image data.",
    ) from exc


def _put_recommendation_image(
  settings: Settings,
  put_args: dict[str, Any],
) -> None:
  try:
    client_kwargs: dict[str, Any] = {'region_name': settings.aws_region}
    if (
      settings.aws_access_key_id
      and settings.aws_secret_access_key
      and not settings.aws_use_iam_role
    ):
      client = boto3.client(
        's3',
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        **client_kwargs,
      )
    elif settings.aws_profile_name:
      client = boto3.Session(profile_name=settings.aws_profile_name).client(
        's3',
        **client_kwargs,
      )
    else:
      client = boto3.client('s3', **client_kwargs)
    client.put_object(**put_args)
  except Exception as exc:
    raise AppError(
      503,
      'MAKEUP_IMAGE_STORAGE_FAILED',
      '생성된 추천 이미지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
    ) from exc


def _has_required_makeup_crops(crop_metadata: Any) -> bool:
  if not isinstance(crop_metadata, dict):
    return False
  areas = crop_metadata.get("areas")
  if not isinstance(areas, dict):
    return False
  for area, required_count in REQUIRED_CROP_AREA_COUNTS.items():
    regions = areas.get(area)
    if not isinstance(regions, list) or len(regions) < required_count:
      return False
    if any(not isinstance(region, dict) or not isinstance(region.get("box"), dict) for region in regions):
      return False
  return True


def _extract_personalized_face_metadata(
  source_image_bytes: bytes,
  generated_image_bytes: bytes,
) -> dict[str, dict[str, Any]]:
  metadata = extract_personalized_makeup_face_metadata(
    source_image_bytes,
    generated_image_bytes,
  )
  if not isinstance(metadata, dict):
    metadata = {}
  if not _has_required_makeup_crops(metadata.get("cropMetadata")):
    retry_crop_metadata = extract_makeup_face_crop_metadata(generated_image_bytes)
    if isinstance(retry_crop_metadata, dict):
      metadata["cropMetadata"] = retry_crop_metadata
  if not _has_required_makeup_crops(metadata.get("cropMetadata")):
    raise AppError(
      502,
      "MAKEUP_IMAGE_CROP_METADATA_MISSING",
      "생성 이미지의 얼굴 부위를 확인하지 못했어요. 다시 시도해 주세요.",
    )
  return metadata


def _generate_asset_sync(
  settings: Settings,
  report_id: UUID,
  scenario_text: str,
  recommendation: dict[str, Any],
  image_key: str,
  *,
  image_mode: Literal["generic", "personalized"],
  source_image: PersonalizedImageInput | None,
  generation_attempt: int | None,
  profile_presentation: str,
) -> GeneratedRecommendationAsset:
  if OpenAI is None:
    raise AppError(503, "OPENAI_SDK_NOT_INSTALLED", "The openai package is required for image generation.")
  if settings.image_generation_provider_normalized != "openai":
    raise AppError(
      503,
      "MAKEUP_IMAGE_PROVIDER_INVALID",
      "Makeup recommendation images require IMAGE_GENERATION_PROVIDER=openai.",
    )
  if not settings.openai_api_key:
    raise AppError(503, "OPENAI_NOT_CONFIGURED", "OPENAI_API_KEY is required for image generation.")
  if not settings.s3_bucket_name:
    raise AppError(503, "S3_NOT_CONFIGURED", "S3_BUCKET_NAME is required for image generation.")
  if image_mode not in {"generic", "personalized"}:
    raise AppError(400, "MAKEUP_IMAGE_MODE_INVALID", "Image mode must be generic or personalized.")

  output_format, extension, content_type = _output_contract(settings)
  client = OpenAI(api_key=settings.openai_api_key, base_url="https://api.openai.com/v1")
  sent_prompt = _prompt(
    scenario_text,
    recommendation,
    personalized=image_mode == "personalized",
    profile_presentation=profile_presentation,
  )
  common_args: dict[str, Any] = {
    "model": settings.openai_image_model_id,
    "prompt": sent_prompt,
    "n": 1,
    "size": settings.openai_image_size or "auto",
    "quality": settings.openai_image_quality,
    **_openai_output_args(settings),
  }

  input_media_id: UUID | None = None
  personalized_source: PersonalizedImageInput | None = None
  if image_mode == "personalized":
    source = _validate_personalized_input(settings, source_image)
    personalized_source = source
    input_media_id = source.media_id
    normalized = _normalize_source_image(settings, source)
    response = client.images.edit(image=normalized, **common_args)
  else:
    response = client.images.generate(**common_args)

  validated_output = _validate_and_normalize_output(
    settings,
    _decode_response(response),
    output_format,
  )
  image_bytes = validated_output.content
  face_metadata: dict[str, dict[str, Any]] = {}
  try:
    if personalized_source is not None:
      face_metadata = _extract_personalized_face_metadata(
        personalized_source.content,
        image_bytes,
      )
    else:
      crop_metadata = extract_makeup_face_crop_metadata(image_bytes)
      if crop_metadata is not None:
        face_metadata["cropMetadata"] = crop_metadata
    crop_metadata = face_metadata.get("cropMetadata")
    if isinstance(crop_metadata, dict):
      semantic_color_metadata = build_semantic_makeup_color_metadata(
        image_bytes,
        crop_metadata=crop_metadata,
        look=recommendation,
      )
      if semantic_color_metadata is not None:
        face_metadata["semanticColorMetadata"] = semantic_color_metadata
  except AppError as exc:
    if exc.code == "MAKEUP_IMAGE_CROP_METADATA_MISSING":
      raise
    logger.warning(
      "[aura:makeup-recommendation] face-metadata:skipped reportId=%s imageKey=%s",
      report_id,
      image_key,
      exc_info=True,
    )
  except Exception:  # noqa: BLE001 - generic face metadata remains best-effort.
    logger.warning(
      "[aura:makeup-recommendation] face-metadata:skipped reportId=%s imageKey=%s",
      report_id,
      image_key,
      exc_info=True,
    )
  is_private = image_mode == "personalized"
  consent_status = "explicit" if is_private else "not-required"
  rights_status = "source-owner-verified" if is_private else "synthetic-reference"
  provenance = {
    "prompt": sent_prompt,
    "modelId": settings.openai_image_model_id,
    "promptVersion": IMAGE_PROMPT_VERSION,
    "consentStatus": consent_status,
    "rightsStatus": rights_status,
    "sourceMediaId": str(input_media_id) if input_media_id else None,
    "sourceFormat": validated_output.source_format,
    "outputFormat": validated_output.output_format,
    "width": validated_output.width,
    "height": validated_output.height,
    "resized": validated_output.resized,
  }
  for metadata_key in ("cropMetadata", "alignmentMetadata", "semanticColorMetadata"):
    metadata_value = face_metadata.get(metadata_key)
    if isinstance(metadata_value, dict):
      provenance[metadata_key] = metadata_value
  if generation_attempt is not None:
    provenance["generationAttempt"] = generation_attempt
  prefix = (
    settings.makeup_private_asset_prefix.strip("/")
    if is_private
    else "uploads/generated-makeup-recommendations"
  )
  object_key = _generation_object_key(
    prefix,
    report_id,
    image_key,
    extension,
    generation_attempt,
  )
  metadata = {
    "image-model": settings.openai_image_model_id,
    "image-prompt-version": IMAGE_PROMPT_VERSION,
    "consent-status": consent_status,
    "rights-status": rights_status,
    "source-format": validated_output.source_format,
    "output-format": validated_output.output_format,
    "output-width": str(validated_output.width),
    "output-height": str(validated_output.height),
  }
  put_args: dict[str, Any] = {
    "Bucket": settings.s3_bucket_name,
    "Key": object_key,
    "Body": image_bytes,
    "ContentType": content_type,
    "Metadata": metadata,
  }
  if is_private:
    metadata["data-classification"] = "user-face-derived"
    put_args.update(
      {
        "CacheControl": "private, no-store",
        "ServerSideEncryption": "AES256",
      },
    )
  else:
    put_args["CacheControl"] = "public, max-age=31536000, immutable"
  if generation_attempt is not None:
    metadata["generation-attempt"] = str(generation_attempt)
  _put_recommendation_image(settings, put_args)

  image_url: str | None = None
  if not is_private:
    cdn_base_url = settings.effective_cdn_base_url
    image_url = (
      f"{cdn_base_url}/{object_key}"
      if cdn_base_url
      else f"s3://{settings.s3_bucket_name}/{object_key}"
    )
  return GeneratedRecommendationAsset(
    image_url=image_url,
    storage_bucket=settings.s3_bucket_name,
    object_key=object_key,
    content_type=content_type,
    is_private=is_private,
    input_media_id=input_media_id,
    model_id=settings.openai_image_model_id,
    provenance=provenance,
  )


async def generate_recommendation_asset(
  settings: Settings,
  report_id: UUID,
  scenario_text: str,
  recommendation: dict[str, Any],
  image_key: str,
  *,
  image_mode: Literal["generic", "personalized"] = "generic",
  source_image: PersonalizedImageInput | None = None,
  generation_attempt: int | None = None,
  profile_presentation: str = "neutral",
) -> GeneratedRecommendationAsset:
  started_at = time.perf_counter()
  try:
    asset = await asyncio.to_thread(
      _generate_asset_sync,
      settings,
      report_id,
      scenario_text,
      recommendation,
      image_key,
      image_mode=image_mode,
      source_image=source_image,
      generation_attempt=generation_attempt,
      profile_presentation=profile_presentation,
    )
  except AppError as exc:
    logger.exception(
      "[aura:makeup-recommendation] image-asset:failed reportId=%s imageKey=%s code=%s",
      report_id, image_key, exc.code,
    )
    emit_ai_metric(
      provider="openai", operation="generate_recommendation_asset",
      model_id=settings.openai_image_model_id, status="error",
      latency_ms=(time.perf_counter() - started_at) * 1000, error_code=exc.code,
    )
    raise
  except Exception as exc:
    logger.exception(
      "[aura:makeup-recommendation] image-asset:unexpected reportId=%s imageKey=%s",
      report_id, image_key,
    )
    error = AppError(502, "OPENAI_IMAGE_GENERATION_FAILED", "OpenAI image generation failed.")
    emit_ai_metric(
      provider="openai", operation="generate_recommendation_asset",
      model_id=settings.openai_image_model_id, status="error",
      latency_ms=(time.perf_counter() - started_at) * 1000, error_code=error.code,
    )
    raise error from exc
  emit_ai_metric(
    provider="openai", operation="generate_recommendation_asset",
    model_id=settings.openai_image_model_id, status="success",
    latency_ms=(time.perf_counter() - started_at) * 1000,
  )
  return asset


async def generate_recommendation_image(
  settings: Settings,
  report_id: UUID,
  scenario_text: str,
  recommendation: dict[str, Any],
  image_key: str | None = None,
) -> str:
  """V1-compatible generic generation wrapper."""
  asset = await generate_recommendation_asset(
    settings,
    report_id,
    scenario_text,
    recommendation,
    image_key or "anchor",
  )
  if asset.image_url is None:  # pragma: no cover - generic contract guard
    raise AppError(502, "MAKEUP_IMAGE_DELIVERY_MISSING", "The generated image has no delivery URL.")
  return asset.image_url


async def generate_recommendation_images(
  settings: Settings,
  report_id: UUID,
  scenario_text: str,
  looks: list[dict[str, Any]],
  *,
  image_mode: Literal["generic", "personalized"] = "generic",
  source_image: PersonalizedImageInput | None = None,
  look_id: str | None = None,
  continue_on_error: bool = False,
  generation_attempt: int | None = None,
  profile_presentation: str = "neutral",
) -> list[dict[str, Any]]:
  """Generate anchor first and return per-look asset state for V2 persistence."""
  indexed_looks = list(enumerate(looks[:3]))
  selected = [
    item
    for item in indexed_looks
    if (str(item[1].get("role") or "") == "anchor" if look_id is None else str(item[1].get("id") or item[1].get("role") or "") == look_id)
  ]
  if look_id is not None and not selected:
    raise AppError(404, "MAKEUP_LOOK_NOT_FOUND", "The requested recommendation look was not found.")
  selected.sort(
    key=lambda item: (
      IMAGE_ROLES.index(str(item[1].get("role")))
      if str(item[1].get("role")) in IMAGE_ROLES
      else len(IMAGE_ROLES),
      item[0],
    ),
  )

  generated_by_index: dict[int, dict[str, Any]] = {}
  for index, look in selected:
    role = str(look.get("role") or f"look-{index + 1}")
    stable_look_id = str(look.get("id") or role)
    try:
      asset = await generate_recommendation_asset(
        settings,
        report_id,
        scenario_text,
        look,
        f"{index + 1}-{role}",
        image_mode=image_mode,
        source_image=source_image,
        generation_attempt=generation_attempt,
        profile_presentation=profile_presentation,
      )
      payload = {
        **look,
        "imageStatus": "completed",
        "imageAsset": asset.payload(),
      }
      if asset.image_url is not None:
        payload["imageUrl"] = asset.image_url
      generated_by_index[index] = payload
    except AppError as exc:
      if not continue_on_error:
        raise
      generated_by_index[index] = {
        **look,
        "imageStatus": "failed",
        "imageError": exc.message,
        "imageAsset": {
          "imageUrl": None,
          "isPrivate": image_mode == "personalized",
          "inputMediaId": str(source_image.media_id) if source_image else None,
          "modelId": settings.openai_image_model_id,
          "promptVersion": IMAGE_PROMPT_VERSION,
          "lookId": stable_look_id,
        },
      }

  if look_id is not None:
    return [generated_by_index[index] for index, _look in selected]
  return [generated_by_index.get(index, look) for index, look in indexed_looks]
