import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from ipaddress import ip_address
import json
import logging
import re
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import boto3
import httpx
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

try:
  from openai import OpenAI, OpenAIError
except ImportError:  # pragma: no cover - only hit before backend deps are installed.
  OpenAI = None
  OpenAIError = Exception

try:
  from PIL import Image, ImageOps, UnidentifiedImageError
except ImportError:  # pragma: no cover - fallback keeps local setup usable before deps install.
  Image = None
  ImageOps = None
  UnidentifiedImageError = Exception

from app.core.errors import AppError
from app.core.settings import Settings


logger = logging.getLogger(__name__)

_AUTHORITATIVE_HAIRLINE_PROVIDERS = {
  "apple_semantic_matte",
  "mediapipe_hairline_boundary",
  "face_parsing",
}
_AUTHORITATIVE_HAIRLINE_MIN_CONFIDENCE = 0.7


def _prompt_number(value: Any) -> float | None:
  if isinstance(value, bool) or not isinstance(value, (int, float)):
    return None
  number = float(value)
  return number if number == number and abs(number) != float("inf") else None


def _prompt_record(value: Any) -> dict[str, Any]:
  return value if isinstance(value, dict) else {}


def _safe_face_vertical_thirds_prompt_payload(value: Any) -> dict[str, Any] | None:
  raw = _prompt_record(value)
  if not raw:
    return None

  measurement_mode = raw.get("measurementMode")
  hairline = _prompt_record(raw.get("hairline"))
  provider = hairline.get("provider")
  hairline_confidence = _prompt_number(hairline.get("confidence"))
  display_ratio = _prompt_record(raw.get("displayRatio"))
  upper = _prompt_number(display_ratio.get("upper"))
  lower = _prompt_number(display_ratio.get("lower"))
  middle = _prompt_number(display_ratio.get("middle"))
  explicit_full = (
    measurement_mode == "full_vertical_thirds"
    and hairline.get("analysisEligible") is True
  )
  legacy_full = measurement_mode is None and raw.get("status") == "full_success"
  full_eligible = (
    (explicit_full or legacy_full)
    and provider in _AUTHORITATIVE_HAIRLINE_PROVIDERS
    and hairline_confidence is not None
    and hairline_confidence >= _AUTHORITATIVE_HAIRLINE_MIN_CONFIDENCE
    and upper is not None
    and lower is not None
    and middle is not None
  )

  common = {
    "measurementMode": (
      "full_vertical_thirds" if full_eligible else "middle_lower_only"
    ),
    "status": raw.get("status"),
    "statusReason": raw.get("statusReason"),
    "title": raw.get("title"),
  }

  if full_eligible:
    return {
      **common,
      "confidence": _prompt_number(raw.get("confidence")),
      "displayRatio": {"lower": lower, "middle": middle, "upper": upper},
      "dominantPart": raw.get("dominantPart"),
      "faceLength": _prompt_record(raw.get("faceLength")) or None,
      "hairline": {
        "analysisEligible": True,
        "confidence": hairline_confidence,
        "provider": provider,
      },
      "postCorrection": _prompt_record(raw.get("postCorrection")) or None,
      "quality": _prompt_record(raw.get("quality")),
      "ratioDetail": _prompt_record(raw.get("ratioDetail")),
      "summary": raw.get("summary"),
    }

  middle_lower = _prompt_record(raw.get("middleLowerRatio"))
  safe_lower = _prompt_number(middle_lower.get("lower"))
  safe_middle = _prompt_number(middle_lower.get("middle"))
  safe_lower_px = _prompt_number(middle_lower.get("lowerPx"))
  safe_middle_px = _prompt_number(middle_lower.get("middlePx"))
  if safe_lower is None:
    safe_lower = lower
  if safe_middle is None:
    safe_middle = middle
  if safe_lower is None or safe_middle is None:
    return None

  return {
    **common,
    "middleLowerRatio": {
      "lower": safe_lower,
      "lowerPx": safe_lower_px,
      "middle": safe_middle,
      "middlePx": safe_middle_px,
    },
    "summary": "헤어라인이 충분히 확인되지 않아 중안부와 하안부만 반영했어요.",
  }


def _safe_face3d_prompt_payload(value: Any) -> dict[str, Any] | None:
  raw = _prompt_record(value)
  if not raw:
    return None

  schema_version = raw.get("schemaVersion")
  if schema_version in {None, "aura.face3d-profile.v1"}:
    return raw
  if schema_version != "aura.face3d-profile.v2":
    return None

  collection_policy_id = raw.get("collectionPolicyId")
  if (
    raw.get("confidenceCalibrationStatus") != "calibrated"
    or raw.get("sampleMode") != "micro_burst"
    or raw.get("aggregation") != "median_mad"
    or not isinstance(collection_policy_id, str)
    or collection_policy_id.startswith("diagnostics-")
  ):
    return None

  return raw


def _safe_analysis_prompt_metadata(payload: dict[str, Any]) -> dict[str, Any]:
  metadata = {
    key: value
    for key, value in payload.items()
    if key not in {"imageUrl", "image_url", "cdnUrl", "previewUrl", "sourceUri"}
  }
  measurements = _prompt_record(metadata.get("measurements"))
  if measurements:
    # DB 저장·과거 복원에는 raw H를 보존하되 AI에는 별도 검증된 요약만 제공한다.
    safe_measurements = dict(measurements)
    safe_measurements.pop("faceVerticalThirds", None)
    safe_measurements.pop("face_vertical_thirds", None)
    safe_measurements_face3d = _safe_face3d_prompt_payload(
      safe_measurements.get("face3d"),
    )
    if safe_measurements_face3d is None:
      safe_measurements.pop("face3d", None)
    else:
      safe_measurements["face3d"] = safe_measurements_face3d
    metadata["measurements"] = safe_measurements

  raw_vertical = metadata.pop("face_vertical_thirds", None)
  safe_vertical = _safe_face_vertical_thirds_prompt_payload(
    metadata.get("faceVerticalThirds", raw_vertical),
  )
  if safe_vertical is None:
    metadata.pop("faceVerticalThirds", None)
  else:
    metadata["faceVerticalThirds"] = safe_vertical
  safe_face3d = _safe_face3d_prompt_payload(metadata.get("face3d"))
  if safe_face3d is None:
    metadata.pop("face3d", None)
  else:
    metadata["face3d"] = safe_face3d
  return metadata
RECOMMENDED_MAKEUP_COUNT = 1

ANALYSIS_OUTPUT_FIELD_GUIDE = (
  "Top-level JSON keys: faceShape, skinType, "
  "recommendedMood, tags, summary, shortSummary, skinAnalysisSummary, "
  "baseMakeupGuide, makeupGuideline, recommendedMakeups, beautyGuide. "
  "makeupGuideline keys: brow, blush, highlight, eyeshadow, eyeliner, lip. "
  "recommendedMakeups must be exactly 1 object. The object keys: title, "
  "subtitle, description, tags. tags must contain exactly 2 strings. "
  "beautyGuide is optional but recommended. beautyGuide keys: bestColors, "
  "bestNeutrals, bestAccentColors, avoidColors, hairColorDirection, "
  "hairstyleDirection, finalFormula."
)

MAKEUP_RECOMMENDATION_ROLES = ("anchor",)
MAKEUP_RECOMMENDATION_AR_FILTERS = {
  "anchor": "filter-milky-strawberry-pink",
  "bold": "filter-clean-smoky-city",
  "discovery": "filter-plum-syrup-gloss",
}
MAKEUP_RECOMMENDATION_OUTPUT_SCHEMA = {
  "type": "object",
  "properties": {
    "looks": {
      "type": "array",
      "minItems": 1,
      "maxItems": 1,
      "items": {
        "type": "object",
        "properties": {
          "role": {"type": "string", "enum": list(MAKEUP_RECOMMENDATION_ROLES)},
          "title": {"type": "string"},
          "subtitle": {"type": "string"},
          "summary": {"type": "string"},
          "tags": {
            "type": "array",
            "minItems": 2,
            "maxItems": 4,
            "items": {"type": "string"},
          },
          "reasons": {
            "type": "array",
            "minItems": 2,
            "maxItems": 3,
            "items": {"type": "string"},
          },
          "durationMinutes": {"type": "integer", "minimum": 5, "maximum": 60},
          "difficulty": {"type": "string", "enum": ["easy", "medium", "advanced"]},
          "steps": {
            "type": "array",
            "minItems": 5,
            "maxItems": 5,
            "items": {
              "type": "object",
              "properties": {
                "area": {"type": "string", "enum": ["base", "brow", "eye", "cheek", "lip"]},
                "instruction": {"type": "string"},
                "order": {"type": "integer", "minimum": 1, "maximum": 5},
              },
              "required": ["area", "instruction", "order"],
              "additionalProperties": False,
            },
          },
          "products": {
            "type": "array",
            "minItems": 5,
            "maxItems": 5,
            "items": {
              "type": "object",
              "properties": {
                "area": {"type": "string", "enum": ["base", "brow", "eye", "cheek", "lip"]},
                "brandName": {"type": "string"},
                "productName": {"type": "string"},
                "shadeName": {"type": "string"},
                "reason": {"type": "string"},
              },
              "required": ["area", "brandName", "productName", "shadeName", "reason"],
              "additionalProperties": False,
            },
          },
        },
        "required": [
          "role",
          "title",
          "subtitle",
          "summary",
          "tags",
          "reasons",
          "durationMinutes",
          "difficulty",
          "steps",
          "products",
        ],
        "additionalProperties": False,
      },
    },
  },
  "required": ["looks"],
  "additionalProperties": False,
}


class OpenAIAnalysisService:
  def __init__(self, settings: Settings) -> None:
    self.settings = settings

  def _client(self):
    if OpenAI is None:
      raise AppError(
        503,
        "OPENAI_SDK_NOT_INSTALLED",
        "The openai package is required for AI analysis.",
      )

    if not self.settings.openai_api_key:
      raise AppError(503, "OPENAI_NOT_CONFIGURED", "OPENAI_API_KEY is required.")

    # 이미지 생성은 반드시 실제 OpenAI를 호출한다. OPENAI_BASE_URL(예: bedrock-mantle
    # 채팅 전용 게이트웨이)이 프로세스 환경으로 새어들어오면 이미지 모델이 404가 나므로,
    # base_url을 명시해 환경변수 오염과 무관하게 api.openai.com으로 고정한다.
    return OpenAI(
      api_key=self.settings.openai_api_key,
      base_url="https://api.openai.com/v1",
    )

  def _s3_client(self):
    client_kwargs = {
      "region_name": self.settings.aws_region,
      "config": Config(
        connect_timeout=30,
        read_timeout=60,
        retries={"max_attempts": 1},
      ),
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
      "config": Config(
        connect_timeout=30,
        read_timeout=120,
        retries={"max_attempts": 1},
      ),
    }

    if self.settings.aws_access_key_id and self.settings.aws_secret_access_key:
      client_kwargs.update(
        {
          "aws_access_key_id": self.settings.aws_access_key_id,
          "aws_secret_access_key": self.settings.aws_secret_access_key,
        },
      )

    return boto3.client("bedrock-runtime", **client_kwargs)
  def _extract_remote_image_url(self, payload: dict[str, Any]) -> str | None:
    bucket = payload.get("bucket")
    object_key = payload.get("objectKey") or payload.get("object_key")

    if isinstance(bucket, str) and isinstance(object_key, str) and bucket and object_key:
      return f"s3://{bucket}/{object_key.lstrip('/')}"

    for key in ("imageUrl", "cdnUrl", "image_url", "previewUrl"):
      value = payload.get(key)

      if isinstance(value, str) and value.startswith(("s3://", "http://", "https://")):
        return value

    return None

  def _infer_content_type(self, payload: dict[str, Any]) -> str:
    content_type = payload.get("contentType") or payload.get("content_type")

    if isinstance(content_type, str) and content_type.startswith("image/"):
      return content_type

    image_url = self._extract_remote_image_url(payload) or ""
    normalized_url = image_url.split("?", 1)[0].lower()

    if normalized_url.endswith(".png"):
      return "image/png"

    if normalized_url.endswith(".webp"):
      return "image/webp"

    return "image/jpeg"

  def _source_file_suffix(self, content_type: str) -> str:
    if content_type == "image/png":
      return ".png"

    if content_type == "image/webp":
      return ".webp"

    return ".jpg"

  def _clamp_image_quality(self, value: int | None, fallback: int = 82) -> int:
    try:
      quality = int(value if value is not None else fallback)
    except (TypeError, ValueError):
      quality = fallback

    return max(1, min(100, quality))

  def _clamp_image_max_edge(self, value: int | None) -> int:
    try:
      max_edge = int(value if value is not None else 0)
    except (TypeError, ValueError):
      return 0

    return max(0, max_edge)

  def _convert_image_for_speed(
    self,
    image_bytes: bytes,
    *,
    source_content_type: str,
    output_format: str,
    max_edge: int,
    quality: int,
    context: str,
  ) -> tuple[bytes, str]:
    if Image is None or ImageOps is None:
      logger.warning("[aura:openai] image-optimization:skipped context=%s reason=pillow-missing", context)
      return image_bytes, source_content_type

    normalized_output_format = output_format.strip().lower()

    if normalized_output_format == "jpg":
      normalized_output_format = "jpeg"

    if normalized_output_format not in {"jpeg", "png", "webp"}:
      normalized_output_format = "jpeg"

    output_content_type = f"image/{normalized_output_format}"
    max_edge = self._clamp_image_max_edge(max_edge)
    quality = self._clamp_image_quality(quality)
    started_at = time.monotonic()

    try:
      with Image.open(BytesIO(image_bytes)) as opened_image:
        image = ImageOps.exif_transpose(opened_image)
        original_width, original_height = image.size
        resized = False

        if max_edge and max(original_width, original_height) > max_edge:
          scale = max_edge / max(original_width, original_height)
          next_size = (
            max(1, round(original_width * scale)),
            max(1, round(original_height * scale)),
          )
          resampling = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
          image = image.resize(next_size, resampling)
          resized = True

        if normalized_output_format in {"jpeg", "webp"}:
          if image.mode in {"RGBA", "LA"} or (
            image.mode == "P" and "transparency" in image.info
          ):
            rgba_image = image.convert("RGBA")
            background = Image.new("RGB", rgba_image.size, (255, 255, 255))
            background.paste(rgba_image, mask=rgba_image.getchannel("A"))
            image = background
          elif image.mode != "RGB":
            image = image.convert("RGB")

        output_buffer = BytesIO()

        if normalized_output_format == "jpeg":
          image.save(
            output_buffer,
            format="JPEG",
            quality=quality,
            optimize=True,
            progressive=True,
          )
        elif normalized_output_format == "webp":
          image.save(output_buffer, format="WEBP", quality=quality, method=4)
        else:
          image.save(output_buffer, format="PNG", optimize=True)

      optimized_bytes = output_buffer.getvalue()

      if (
        not resized
        and output_content_type == source_content_type
        and len(optimized_bytes) >= len(image_bytes)
      ):
        return image_bytes, source_content_type

      logger.info(
        "[aura:openai] image-optimization:success context=%s format=%s maxEdge=%s quality=%s size=%sx%s->%sx%s bytes=%s->%s durationMs=%s",
        context,
        normalized_output_format,
        max_edge or "original",
        quality,
        original_width,
        original_height,
        image.size[0],
        image.size[1],
        len(image_bytes),
        len(optimized_bytes),
        round((time.monotonic() - started_at) * 1000),
      )

      return optimized_bytes, output_content_type
    except (UnidentifiedImageError, OSError, ValueError) as exc:
      logger.warning(
        "[aura:openai] image-optimization:skipped context=%s reason=%s",
        context,
        exc.__class__.__name__,
      )
      return image_bytes, source_content_type

  def _prepare_source_image_for_generation(
    self,
    image_bytes: bytes,
    source_content_type: str,
  ) -> tuple[bytes, str]:
    return self._convert_image_for_speed(
      image_bytes,
      source_content_type=source_content_type,
      output_format="jpeg",
      max_edge=self.settings.openai_image_input_max_edge,
      quality=self.settings.openai_image_input_quality,
      context="source-input",
    )

  def _optimize_generated_image_for_upload(self, image_bytes: bytes) -> bytes:
    output_format, output_compression, _, content_type = self._resolve_makeup_image_output()
    optimized_bytes, _ = self._convert_image_for_speed(
      image_bytes,
      source_content_type=content_type,
      output_format=output_format,
      max_edge=self.settings.openai_image_output_max_edge,
      quality=output_compression if output_compression is not None else 82,
      context="generated-output",
    )

    return optimized_bytes

  def _read_source_image_bytes(self, payload: dict[str, Any]) -> bytes:
    image_url = self._extract_remote_image_url(payload)

    if not image_url:
      raise AppError(
        400,
        "SOURCE_IMAGE_REQUIRED",
        "A source face image is required for makeup recommendation generation.",
      )

    if not image_url.startswith("s3://"):
      raise AppError(
        400,
        "SOURCE_IMAGE_MUST_BE_S3",
        "The source face image must be uploaded to S3 before analysis.",
      )

    bucket, object_key = image_url.removeprefix("s3://").split("/", 1)
    started_at = time.monotonic()
    logger.info("[aura:openai] source-image:read-start bucket=%s key=%s", bucket, object_key)
    image_object = self._s3_client().get_object(Bucket=bucket, Key=object_key)
    image_bytes = image_object["Body"].read()
    logger.info(
      "[aura:openai] source-image:read-success bytes=%s durationMs=%s",
      len(image_bytes),
      round((time.monotonic() - started_at) * 1000),
    )

    return image_bytes

  def _allowed_makeup_recommendation_source_hosts(self) -> set[str]:
    hosts = {
      host.strip().lower()
      for host in (self.settings.makeup_recommendation_source_hosts or "").split(",")
      if host.strip()
    }

    for value in (self.settings.cdn_base_url, self.settings.cloudfront_domain):
      normalized = str(value or "").strip()

      if not normalized:
        continue

      parsed = urlparse(normalized if "://" in normalized else f"https://{normalized}")

      if parsed.hostname:
        hosts.add(parsed.hostname.lower())

    return hosts

  def _read_makeup_recommendation_source(
    self,
    source_image_url: str,
  ) -> tuple[bytes, str]:
    normalized_url = str(source_image_url or "").strip()

    if normalized_url.startswith("s3://"):
      payload = {"imageUrl": normalized_url}
      return self._read_source_image_bytes(payload), self._infer_content_type(payload)

    parsed = urlparse(normalized_url)
    hostname = (parsed.hostname or "").lower()
    allowed_hosts = self._allowed_makeup_recommendation_source_hosts()

    try:
      ip_address(hostname)
    except ValueError:
      is_ip_address = False
    else:
      is_ip_address = True

    if parsed.scheme != "https" or not hostname or is_ip_address or hostname not in allowed_hosts:
      raise AppError(
        400,
        "MAKEUP_RECOMMENDATION_SOURCE_NOT_ALLOWED",
        "The source image must use an approved HTTPS media host.",
      )

    try:
      response = httpx.get(normalized_url, timeout=30, follow_redirects=False)
      response.raise_for_status()
    except httpx.HTTPError as exc:
      raise AppError(
        502,
        "MAKEUP_RECOMMENDATION_SOURCE_UNAVAILABLE",
        "The source face image could not be downloaded.",
      ) from exc

    content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()

    if not content_type.startswith("image/"):
      raise AppError(
        400,
        "MAKEUP_RECOMMENDATION_SOURCE_INVALID",
        "The source URL did not return an image.",
      )

    if not response.content or len(response.content) > 15 * 1024 * 1024:
      raise AppError(
        400,
        "MAKEUP_RECOMMENDATION_SOURCE_SIZE_INVALID",
        "The source image must be between 1 byte and 15 MB.",
      )

    return response.content, content_type

  def _build_personalized_makeup_recommendation_prompt(
    self,
    payload: dict[str, Any],
  ) -> str:
    profile = payload.get("profile") if isinstance(payload.get("profile"), dict) else {}
    refinement = str(payload.get("refinement") or "").strip()
    refinement_guide = {
      "natural": "이전보다 색과 음영을 한 단계 덜어 자연스럽게 조정해.",
      "hip": "질감이나 라인에 감각적인 포인트를 더해 힙하게 조정해.",
      "differentColor": "기존 조건을 유지하면서 주조색을 다른 계열로 바꿔.",
      "replaceProducts": "룩 방향은 유지하되 제품 타입과 색상 제안을 새롭게 바꿔.",
    }.get(refinement, "")
    context = {
      "request": payload.get("prompt"),
      "conditions": payload.get("conditions") if isinstance(payload.get("conditions"), list) else [],
      "personalColor": payload.get("personalColor"),
      "profile": profile,
      "refinement": refinement or None,
    }

    return (
      "사진 속 동일 사용자에게 가장 잘 어울리는 실제 적용 가능한 K-뷰티 메이크업 룩을 정확히 1개만 추천해. "
      "룩의 role은 반드시 anchor로 반환해. 여러 대안이나 비교용 룩을 만들지 말고 가장 적합한 한 가지를 선택해. "
      "사진 속 얼굴 특징, 성별 표현, 피부 표현과 사용자 조건을 보존해. "
      "title은 12자 이내, subtitle은 20자 이내, summary는 두 문장 이내로 한국어로 작성해. "
      "각 룩은 base, brow, eye, cheek, lip 순서의 단계 5개와 제품 타입 5개를 포함해. "
      "실재 여부를 확인할 수 없는 브랜드나 상품을 만들지 말고 모든 brandName은 반드시 '추천 타입'으로 써. "
      "productName에는 쿠션, 팔레트, 브로우, 블러셔, 립처럼 일반 제품 유형을 작성하고 shadeName에는 구체적인 색조를 써. "
      "의학적 진단이나 피부 치료 주장은 하지 마. JSON Schema에 정확히 맞는 결과만 반환해. "
      f"{refinement_guide} "
      f"사용자 컨텍스트: {json.dumps(context, ensure_ascii=False)}"
    )

  def _generate_personalized_makeup_text_sync(
    self,
    payload: dict[str, Any],
    source_image_bytes: bytes,
    source_content_type: str,
  ) -> list[dict[str, Any]]:
    source_image_base64 = base64.b64encode(source_image_bytes).decode("utf-8")
    response = self._client().responses.create(
      model=self.settings.openai_analysis_model_id,
      input=[
        {
          "role": "developer",
          "content": "You are a concise professional K-beauty makeup artist. Return schema-valid Korean recommendations only.",
        },
        {
          "role": "user",
          "content": [
            {"type": "input_text", "text": self._build_personalized_makeup_recommendation_prompt(payload)},
            {
              "type": "input_image",
              "image_url": f"data:{source_content_type};base64,{source_image_base64}",
            },
          ],
        },
      ],
      text={
        "format": {
          "type": "json_schema",
          "name": "makeup_recommendations",
          "strict": True,
          "schema": MAKEUP_RECOMMENDATION_OUTPUT_SCHEMA,
        },
      },
    )
    output_text = getattr(response, "output_text", "")

    if not output_text:
      raise AppError(
        502,
        "OPENAI_MAKEUP_RECOMMENDATION_EMPTY",
        "OpenAI returned no makeup recommendations.",
      )

    parsed = self._parse_json_output(output_text)
    looks = parsed.get("looks")

    if not isinstance(looks, list):
      raise AppError(
        502,
        "OPENAI_MAKEUP_RECOMMENDATION_INVALID",
        "OpenAI returned an invalid makeup recommendation payload.",
      )

    by_role = {
      str(look.get("role")): look
      for look in looks
      if isinstance(look, dict) and str(look.get("role")) in MAKEUP_RECOMMENDATION_ROLES
    }

    if any(role not in by_role for role in MAKEUP_RECOMMENDATION_ROLES):
      raise AppError(
        502,
        "OPENAI_MAKEUP_RECOMMENDATION_INCOMPLETE",
        "OpenAI must return one anchor makeup look.",
      )

    return [dict(by_role[role]) for role in MAKEUP_RECOMMENDATION_ROLES]

  def _build_analysis_prompt(self, payload: dict[str, Any]) -> str:
    metadata = _safe_analysis_prompt_metadata(payload)

    return (
      "Act as a professional personal color analyst, makeup artist, hairstylist, and image consultant. "
      "사용자의 얼굴 사진을 분석해서 개인 맞춤 뷰티 분석 보고서를 만들어줘. "
      "피부 톤, 언더톤, 대비감, 눈동자와 머리 색, 얼굴형, 눈매, 광대/볼 구조, 눈썹, 입술, 전체 분위기를 함께 판단해. "
      "전문 퍼스널 컬러 컨설턴트와 메이크업 아티스트가 실제 고객을 상담하듯, 사진 속 실제 얼굴 특징과 컬러링을 근거로 판단해. "
      "사진 조명이나 안경/그림자 때문에 확정이 어려운 내용은 과하게 단정하지 말고 가장 가능성 높은 방향으로 표현해. "
      "사진 속 사용자의 성별 표현과 스타일을 반드시 보존해. 남성으로 보이는 사용자는 남성 그루밍 메이크업 중심으로, 여성으로 보이는 사용자는 여성 메이크업 중심으로 추천해. "
      "메이크업 추천이 사용자의 성별 표현을 바꾸거나 다른 성별처럼 보이게 만들면 안 돼. "
      "반드시 한국어 JSON 객체 하나만 반환해. "
      "앱 상단 요약에 바로 쓰이도록 faceShape와 recommendedMood를 정확하고 짧게 채워. "
      "퍼스널 컬러와 톤 요약은 절대 새로 판정하거나 출력하지 마. 기기 측정값은 메이크업 색 선택의 근거로만 사용해. "
      "faceShape는 얼굴형과 인상 특징을 짧게 작성해. "
      "recommendedMood는 18자 이내의 짧은 무드명으로 작성하고, 긴 설명 문장이나 이유, 쉼표로 이어지는 긴 문구를 쓰지 마. "
      "summary는 컬러/메이크업/헤어 방향을 한 번에 이해할 수 있게 두 문장 이내로 작성해. "
      "shortSummary와 skinAnalysisSummary도 각각 두 문장 이내로 제한해. "
      "skinAnalysisSummary는 피부 결, 광, 붉은기, 톤 균일감처럼 사진에서 관찰 가능한 표현만 다루고 의학적 진단은 하지 마. "
      "baseMakeupGuide는 top-level 필드로 작성하고, makeupGuideline 안에는 brow, eyeshadow, lip, highlight, eyeliner, blush만 작성해. "
      "makeupGuideline의 각 항목은 촬영 사진과 보고서 판단을 바탕으로 한 문장으로 짧게 작성해. "
      "makeupGuideline에는 단순 색상 추천뿐 아니라 배치 가이드도 포함해. "
      "brow는 눈썹 모양/결/두께 방향, eyeshadow는 색과 눈두덩이 배치, lip은 립 컬러와 립라인 방향, "
      "highlight는 T존/눈밑/광대 등 위치, eyeliner는 점막/꼬리/두께, blush는 광대/볼 위치와 확산 방향을 설명해. "
      "beautyGuide에는 bestColors, bestNeutrals, bestAccentColors, avoidColors, hairColorDirection, hairstyleDirection, finalFormula를 포함해. "
      "각 beautyGuide 값은 앱이나 문서에서 시각화하기 쉬운 짧은 배열 또는 짧은 문장으로 작성해. "
      "추천 메이크업은 위 보고서에서 판단한 퍼스널 컬러, 얼굴형, 톤 요약, 추천 무드, 눈매, 입술 톤, 헤어 방향에 근거해서 정확히 1개만 작성해. "
      "recommendedMakeups는 단순 텍스트 추천이 아니라, 이후 같은 사용자 얼굴 사진에 적용할 데일리 메이크업 이미지 1장의 콘셉트가 되어야 해. "
      "recommendedMakeups 항목은 보고서의 어떤 판단 때문에 그 데일리 룩이 어울리는지 description에 명확히 반영해. "
      "추천은 민낯이나 기본 보정 사진처럼 보이면 안 되지만, 사용자의 성별 표현과 일상 스타일에 맞는 자연스러운 데일리 강도여야 해. "
      "남성 사용자라면 피부 톤 보정, 눈썹 결 정리, 자연스러운 음영, 립밤/톤 보정, 유분 정돈처럼 남성 그루밍에 어울리는 방식으로 작성해. "
      "여성 사용자라면 퍼스널 컬러에 맞춘 베이스, 아이, 블러셔, 립 포인트를 자연스럽게 제안해. "
      "다른 사람이나 일반 모델 기준이 아니라 업로드된 사용자 얼굴에 어울리는 추천으로만 작성해. "
      "추천명은 클리어 & 글로시, 과즙상, 깔끔한 또렷함 같은 고정 예시를 반복하지 말고 사진 분석 결과에 맞춰 새롭게 판단해. "
      "비추천 메이크업, 피해야 할 메이크업, avoidedMakeups는 절대 생성하지 마. "
      "각 추천은 앱 카드에 들어갈 수 있게 title은 12자 이내, subtitle은 16자 이내, description은 두 줄 이내, tags는 2개만 포함해. "
      "텍스트는 짧고 실용적으로 작성하고, 일반론이나 누구에게나 맞는 조언을 쓰지 마. "
      "요청 메타데이터의 faceVerticalThirds.measurementMode가 full_vertical_thirds이면 검증된 상안부/중안부/하안부 실측값을 "
      "faceShape 판단과 summary, makeupGuideline의 음영/블러셔/눈썹 배치에 자연스럽게 반영해. "
      "faceVerticalThirds.faceLengthJudgment가 있으면 얼굴 가로/세로 길이 분류는 그 verdict를 그대로 따라 "
      "(wide=가로 폭이 있는 편, average=평균 범위, long=세로로 긴 편, borderline_wide/borderline_long=경계라 단정 금지, "
      "indeterminate=판정 보류) 비율 숫자나 사진으로 재판정하지 마. "
      "measurementMode가 middle_lower_only이면 중안부와 하안부의 상대 길이만 사용할 수 있고, 헤어라인·이마·상안부·전체 얼굴 길이·3분할 우세를 사진이나 평균값으로 추론하지 마. "
      "요청 메타데이터에 face3d(기기 ARKit 얼굴 메시로 실측한 정규화 3D 지표)가 있으면 얼굴 입체감 표현과 "
      "makeupGuideline의 음영/하이라이트 배치에 근거로 반영해. 기본 지표는 noseTipProjection 코끝 돌출, "
      "chinProjection 턱 전방 볼록면(Pogonion) 돌출, upperLipToELine/lowerLipToELine 입술-E라인 signed 거리 "
      "(양수는 앞, 음수는 뒤), centralProjectionScore 얼굴 중앙부 입체감이야. Tier-2 지표는 noseLength 코뿌리-코끝 길이, "
      "nasalBridgeStraightness 코뿌리-코끝 선에 대한 콧대 RMS 이탈량(작을수록 기준선에 가까움), nasalAxisDeviation 코축 좌우 편위 "
      "(피사체 기준 음수=Left, 양수=Right), alarWidth alare-alare 콧볼 폭, malarProjectionLeft/Right 좌우 앞광대의 전방 돌출이야. "
      "모든 face3d 값은 얼굴 크기로 나눈 무차원 상대값이며 절대 mm·임상 진단·모집단 백분위가 아니고, value가 null이면 미측정이야. "
      "요청 메타데이터에 faceGeometry2d(정면 사진에서 실측한 2D 기하 지표: 눈 폭·눈 개방도·미간 비율·눈꼬리 기울기 canthalTilt(도)·"
      "눈-눈썹 간격·눈썹 기울기 browSlope(도)·입 폭·윗입술/아랫입술 두께비·하관 폭 비율·입꼬리 비대칭 — 비율은 무차원, 각도는 도 단위, "
      "Left/Right는 피사체 기준, value가 null이면 미측정)가 있으면 눈매/눈썹/입술 판단과 makeupGuideline의 아이라이너·눈썹·립 배치에 근거로 반영해. "
      "요청 메타데이터에 measuredPersonalColor(기기에서 조명 보정 후 실측한 퍼스널 컬러: tone.top/secondary 12톤 코드, "
      "axes 5축 -1..1(temperature 쿨→웜, value 라이트→딥, chroma 뮤트→비비드, clarity 소프트→클리어, contrast 저→고대비), "
      "부위별 평균 Lab 색값 regions, 부위 간 명도·색차 relations, measurementConfidence 0..1, correction.applied 조명 보정 여부)가 있으면 "
      "makeupGuideline과 색 선택의 근거로 사진 관찰과 함께 사용하고, 실측과 사진이 다르면 실측 축을 우선해. "
      "단 status가 insufficient이거나 measurementConfidence가 낮으면 사진 관찰을 우선하고, 영문 톤 코드(autumn_muted 등)는 그대로 쓰지 말고 한국어로 풀어 써. "
      "요청 메타데이터의 measurements는 위 실측 지표들의 저장 기록이지만, faceVerticalThirds 원본 H는 AI 입력에서 제외돼 있어. 세로 비율은 검증된 요약 필드만 사용해. "
      "실측 지표(faceVerticalThirds, face3d, faceGeometry2d, measuredPersonalColor)가 사진 관찰과 다르면 실측 지표를 우선하되, "
      "수치를 그대로 나열하지 말고 해석해서 문장에 녹여 써. "
      "아래는 값 예시가 아니라 필드 구조 설명이야. 설명 문구를 복사하지 말고, 반드시 사진을 분석해서 실제 값으로 채워:\n"
      f"{ANALYSIS_OUTPUT_FIELD_GUIDE}\n"
      f"요청 메타데이터: {json.dumps(metadata, ensure_ascii=False)}"
    )

  def _parse_json_output(self, output_text: str) -> dict[str, Any]:
    normalized = output_text.strip()
    fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", normalized, re.DOTALL)

    if fence_match:
      normalized = fence_match.group(1).strip()

    try:
      result = json.loads(normalized)
    except json.JSONDecodeError as exc:
      raise AppError(
        502,
        "OPENAI_OUTPUT_PARSE_FAILED",
        "OpenAI analysis did not return valid JSON.",
      ) from exc

    if not isinstance(result, dict):
      raise AppError(
        502,
        "OPENAI_OUTPUT_INVALID",
        "OpenAI analysis returned an unexpected result shape.",
      )

    return result

  def _structured_image_content_type(self, source_image_bytes: bytes) -> str:
    return "image/png" if source_image_bytes.startswith(b"\x89PNG\r\n\x1a\n") else "image/jpeg"

  def _analyze_structured_json_sync(
    self,
    developer_prompt: str,
    user_prompt: str,
    json_schema: dict[str, Any],
    source_image_bytes: bytes | None,
    max_tokens: int,
  ) -> dict[str, Any]:
    provider = self.settings.analysis_provider
    schema_instruction = json.dumps(json_schema, ensure_ascii=False, separators=(",", ":"))

    if provider == "bedrock":
      model_id = self.settings.effective_analysis_model_id
      if not model_id:
        raise AppError(
          503,
          "BEDROCK_ANALYSIS_NOT_CONFIGURED",
          "A Bedrock Claude model ID or inference profile ID is required for AI analysis.",
        )
      content: list[dict[str, Any]] = [
        {
          "type": "text",
          "text": f"{user_prompt}\nRequired JSON schema: {schema_instruction}",
        },
      ]
      if source_image_bytes is not None:
        content.append(
          {
            "type": "image",
            "source": {
              "type": "base64",
              "media_type": self._structured_image_content_type(source_image_bytes),
              "data": base64.b64encode(source_image_bytes).decode("utf-8"),
            },
          },
        )
      response = self._bedrock_runtime_client().invoke_model(
        modelId=model_id,
        body=json.dumps(
          {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": 0.1,
            "system": developer_prompt,
            "messages": [{"role": "user", "content": content}],
          },
          ensure_ascii=False,
        ),
        accept="application/json",
        contentType="application/json",
      )
      response_payload = json.loads(response["body"].read())
      output_text = self._extract_bedrock_output_text(response_payload)
    elif provider == "openai":
      content = [{"type": "input_text", "text": user_prompt}]
      if source_image_bytes is not None:
        content.append(
          {
            "type": "input_image",
            "image_url": (
              f"data:{self._structured_image_content_type(source_image_bytes)};base64,"
              f"{base64.b64encode(source_image_bytes).decode('utf-8')}"
            ),
          },
        )
      response = self._client().responses.create(
        model=self.settings.openai_analysis_model_id,
        input=[
          {"role": "developer", "content": developer_prompt},
          {"role": "user", "content": content},
        ],
        text={
          "format": {
            "type": "json_schema",
            "name": "face_analysis_stage",
            "strict": True,
            "schema": json_schema,
          },
          "verbosity": "low",
        },
      )
      output_text = getattr(response, "output_text", "")
    else:
      raise AppError(503, "AI_PROVIDER_UNSUPPORTED", f"Unsupported AI_PROVIDER: {provider}")

    if not output_text:
      raise AppError(502, "AI_EMPTY_OUTPUT", "AI structured analysis returned an empty response.")
    return self._parse_json_output(output_text)

  async def read_source_image_bytes(self, payload: dict[str, Any]) -> bytes:
    return await asyncio.to_thread(self._read_source_image_bytes, payload)

  async def analyze_structured_json(
    self,
    *,
    developer_prompt: str,
    user_prompt: str,
    json_schema: dict[str, Any],
    source_image_bytes: bytes | None,
    max_tokens: int,
  ) -> dict[str, Any]:
    try:
      return await asyncio.to_thread(
        self._analyze_structured_json_sync,
        developer_prompt,
        user_prompt,
        json_schema,
        source_image_bytes,
        max_tokens,
      )
    except AppError:
      raise
    except (OpenAIError, BotoCoreError, ClientError) as exc:
      raise AppError(
        502,
        "AI_INVOCATION_FAILED",
        "AI structured analysis invocation failed.",
        {"reason": exc.__class__.__name__},
      ) from exc

  def _trim_text_field(self, value: Any, max_length: int) -> Any:
    if not isinstance(value, str):
      return value

    normalized = " ".join(value.split()).strip(" ,，.。")

    if len(normalized) <= max_length:
      return normalized

    return normalized[:max_length].rstrip(" ,，.。")

  def _first_normalized_text(self, *values: Any) -> str:
    for value in values:
      if isinstance(value, str) and value.strip():
        return " ".join(value.split()).strip()

    return ""

  def _ensure_makeup_guideline(self, result: dict[str, Any]) -> dict[str, str]:
    guideline = result.get("makeupGuideline")
    normalized_guideline = guideline if isinstance(guideline, dict) else {}
    personal_color = self._first_normalized_text(result.get("personalColor"), "분석 톤")
    face_shape = self._first_normalized_text(result.get("faceShape"), "얼굴형")
    tone_summary = self._first_normalized_text(result.get("toneSummary"), personal_color)
    recommended_mood = self._first_normalized_text(result.get("recommendedMood"), tone_summary)

    report_based_defaults = {
      "brow": f"{face_shape} 균형에 맞춰 눈썹 결을 자연스럽게 정돈해요.",
      "blush": f"{tone_summary}에 맞는 블러셔를 광대 주변에 얇게 연결해요.",
      "highlight": f"{recommended_mood}가 살아나도록 T존과 눈밑에 은은한 광만 더해요.",
      "eyeshadow": f"{personal_color}에 어울리는 음영을 눈두덩이에 얇게 쌓아요.",
      "eyeliner": f"{face_shape} 인상이 무겁지 않게 점막과 꼬리만 또렷하게 정리해요.",
      "lip": f"{recommended_mood}에 맞는 립 컬러를 입술 중심부터 선명하게 올려요.",
    }

    return {
      key: self._first_normalized_text(normalized_guideline.get(key), fallback)
      for key, fallback in report_based_defaults.items()
    }

  def _ensure_base_makeup_guide(self, result: dict[str, Any]) -> str:
    personal_color = self._first_normalized_text(result.get("personalColor"), "분석 톤")
    tone_summary = self._first_normalized_text(result.get("toneSummary"), personal_color)
    recommended_mood = self._first_normalized_text(result.get("recommendedMood"), tone_summary)
    fallback = (
      f"{tone_summary}와 {recommended_mood}가 자연스럽게 보이도록 베이스는 얇게 정돈하고 "
      "얼굴 중앙의 밝기와 볼의 생기를 중심으로 표현해요."
    )

    return self._first_normalized_text(result.get("baseMakeupGuide"), fallback)

  def _default_recommended_makeup_card(
    self,
    result: dict[str, Any],
    index: int,
  ) -> dict[str, Any]:
    personal_color = self._first_normalized_text(result.get("personalColor"), "분석 톤")
    face_shape = self._first_normalized_text(result.get("faceShape"), "얼굴 균형")
    tone_summary = self._first_normalized_text(result.get("toneSummary"), personal_color)
    recommended_mood = self._first_normalized_text(result.get("recommendedMood"), tone_summary)
    tone_keyword = self._trim_text_field(tone_summary.replace(" ", ""), 6) or "맞춤톤"
    mood_keyword = self._trim_text_field(recommended_mood.replace(" ", ""), 6) or "추천무드"
    face_keyword = self._trim_text_field(face_shape.replace(" ", ""), 6) or "얼굴균형"
    templates = [
      {
        "title": f"{tone_keyword} 베이스",
        "subtitle": f"{mood_keyword} 피부",
        "description": (
          f"{personal_color}와 {tone_summary}에 맞춰 피부 결, 볼 생기, 립 광을 "
          "자연스럽게 살린 메이크업이에요."
        ),
        "tags": [tone_keyword, "베이스"],
      },
      {
        "title": f"{face_keyword} 아이",
        "subtitle": "눈매 균형 포인트",
        "description": (
          f"{face_shape} 인상을 바탕으로 눈썹 결, 아이 음영, 아이라인을 "
          "선명하지만 무겁지 않게 잡은 룩이에요."
        ),
        "tags": [face_keyword, "아이"],
      },
      {
        "title": f"{mood_keyword} 립",
        "subtitle": "립 블러셔 조화",
        "description": (
          f"{recommended_mood} 방향에 맞춰 립 컬러와 블러셔 위치를 연결해 "
          "얼굴 분위기를 또렷하게 만든 룩이에요."
        ),
        "tags": [mood_keyword, "립"],
      },
    ]

    return templates[index % len(templates)]

  def _ensure_recommended_makeups(self, result: dict[str, Any]) -> list[dict[str, Any]]:
    recommended_makeups = result.get("recommendedMakeups")
    cards: list[dict[str, Any]] = []

    if isinstance(recommended_makeups, list):
      cards = [card for card in recommended_makeups if isinstance(card, dict)]

    while len(cards) < RECOMMENDED_MAKEUP_COUNT:
      cards.append(self._default_recommended_makeup_card(result, len(cards)))

    normalized_cards: list[dict[str, Any]] = []

    for index, card in enumerate(cards[:RECOMMENDED_MAKEUP_COUNT]):
      fallback = self._default_recommended_makeup_card(result, index)
      raw_tags = card.get("tags")
      tags = [
        str(tag).strip()
        for tag in raw_tags
        if isinstance(raw_tags, list) and str(tag).strip()
      ] if isinstance(raw_tags, list) else []
      fallback_tags = fallback["tags"] if isinstance(fallback["tags"], list) else []
      tags = (tags + fallback_tags)[:2]

      normalized_cards.append(
        {
          **card,
          "title": self._trim_text_field(
            self._first_normalized_text(card.get("title"), fallback["title"]),
            12,
          ),
          "subtitle": self._trim_text_field(
            self._first_normalized_text(card.get("subtitle"), fallback["subtitle"]),
            16,
          ),
          "description": self._trim_text_field(
            self._first_normalized_text(card.get("description"), fallback["description"]),
            82,
          ),
          "tags": tags,
        },
      )

    return normalized_cards

  def _normalize_analysis_result(self, result: dict[str, Any]) -> dict[str, Any]:
    result["toneSummary"] = self._trim_text_field(result.get("toneSummary"), 18)
    result["recommendedMood"] = self._trim_text_field(result.get("recommendedMood"), 18)
    result["baseMakeupGuide"] = self._ensure_base_makeup_guide(result)
    result["makeupGuideline"] = self._ensure_makeup_guideline(result)
    result["recommendedMakeups"] = self._ensure_recommended_makeups(result)

    return result

  def _extract_bedrock_output_text(self, response_payload: dict[str, Any]) -> str:
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

  def _analyze_image_with_bedrock_sync(
    self,
    payload: dict[str, Any],
    source_image_bytes: bytes,
  ) -> dict[str, Any]:
    started_at = time.monotonic()
    model_id = self.settings.effective_analysis_model_id

    if not model_id:
      raise AppError(
        503,
        "BEDROCK_ANALYSIS_NOT_CONFIGURED",
        "A Bedrock Claude model ID or inference profile ID is required for AI analysis.",
      )

    content_type = self._infer_content_type(payload)
    source_image_base64 = base64.b64encode(source_image_bytes).decode("utf-8")
    logger.info(
      "[aura:bedrock] analysis:start model=%s region=%s",
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
          "system": "You are a concise, practical K-beauty makeup analyst. Return JSON only.",
          "messages": [
            {
              "role": "user",
              "content": [
                {"type": "text", "text": self._build_analysis_prompt(payload)},
                {
                  "type": "image",
                  "source": {
                    "type": "base64",
                    "media_type": content_type,
                    "data": source_image_base64,
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
    output_text = self._extract_bedrock_output_text(response_payload)

    if not output_text:
      raise AppError(
        502,
        "BEDROCK_EMPTY_OUTPUT",
        "Bedrock Claude analysis returned an empty response.",
      )

    parsed = self._normalize_analysis_result(self._parse_json_output(output_text))
    logger.info(
      "[aura:bedrock] analysis:success durationMs=%s",
      round((time.monotonic() - started_at) * 1000),
    )

    return parsed
  def _analyze_image_sync(
    self,
    payload: dict[str, Any],
    source_image_bytes: bytes,
  ) -> dict[str, Any]:
    provider = self.settings.analysis_provider
    if provider == "bedrock":
      return self._analyze_image_with_bedrock_sync(payload, source_image_bytes)

    if provider != "openai":
      raise AppError(
        503,
        "AI_PROVIDER_UNSUPPORTED",
        f"Unsupported AI_PROVIDER: {provider}",
      )

    started_at = time.monotonic()
    content_type = self._infer_content_type(payload)
    source_image_base64 = base64.b64encode(source_image_bytes).decode("utf-8")
    logger.info(
      "[aura:openai] analysis:start model=%s",
      self.settings.openai_analysis_model_id,
    )
    response = self._client().responses.create(
      model=self.settings.openai_analysis_model_id,
      input=[
        {
          "role": "developer",
          "content": "You are a concise, practical K-beauty makeup analyst. Return JSON only.",
        },
        {
          "role": "user",
          "content": [
            {"type": "input_text", "text": self._build_analysis_prompt(payload)},
            {
              "type": "input_image",
              "image_url": f"data:{content_type};base64,{source_image_base64}",
            },
          ],
        },
      ],
      text={"verbosity": "low"},
    )
    output_text = getattr(response, "output_text", "")

    if not output_text:
      raise AppError(
        502,
        "OPENAI_EMPTY_OUTPUT",
        "OpenAI analysis returned an empty response.",
      )

    parsed = self._normalize_analysis_result(self._parse_json_output(output_text))
    logger.info(
      "[aura:openai] analysis:success durationMs=%s",
      round((time.monotonic() - started_at) * 1000),
    )

    return parsed

  def _build_makeup_image_prompt(
    self,
    analysis_result: dict[str, Any],
    card: dict[str, Any],
  ) -> str:
    title = str(card.get("title") or "custom K-beauty makeup")
    subtitle = str(card.get("subtitle") or "")
    description = str(card.get("description") or "")
    tags = card.get("tags") if isinstance(card.get("tags"), list) else []
    tag_text = ", ".join(str(tag) for tag in tags[:4])
    personal_color = str(analysis_result.get("personalColor") or "")
    face_shape = str(analysis_result.get("faceShape") or "")
    tone_summary = str(analysis_result.get("toneSummary") or "")
    recommended_mood = str(analysis_result.get("recommendedMood") or "")

    prompt = (
      "Realistically edit the uploaded photo. Generate exactly one final makeup-applied photo only: the same original photo with makeup applied directly to the face. "
      "The app displays the source photo separately, so do not include any comparison, duplicate, or extra version inside this output. "
      "Forbidden: split-screen, side-by-side comparison, collage, duplicated face, inset image, frame, UI mockup, comparison layout, labels, captions, arrows, dividers, text, logos, or watermarks. "
      "Preserve the exact same canvas, camera distance, face size, head position, crop, framing, angle, perspective, background, clothing, hairstyle, glasses, and lighting. "
      "Do not zoom in, zoom out, crop tighter, pan, rotate, upscale or shift the face, change pose, replace background, or change composition. "
      "Preserve identity: face shape, jawline, cheek volume, eyes, nose, mouth, lip shape, skin tone, age, natural asymmetry, and gender presentation. "
      "Use a polished K-beauty idol makeup direction, not a bare-face retouch. Apply at least three visible makeup changes across complexion finish, eye definition, cheek color, and lip color with realistic blending. "
      "Male-presenting user: male idol grooming only: tone-up base, oil-control, brows, soft contour, subtle eyes, natural tinted lip; no glam lashes, heavy blush, glossy colored lips, or dramatic shadow. "
      "Female-presenting user: idol makeup with tone-up base, brows, blended shadow, clean liner, curled lashes, blush, and gradient/glossy lip. "
      "Do not slim the face, enlarge eyes, reshape features, change gender or age, plastic-smooth skin, celebrity-look, or studio model style. "
      f"Apply a makeup look named '{title}'. "
      f"Makeup mood: {subtitle}. Details: {description}. Tags: {tag_text}. "
      f"Personal color: {personal_color}. Face shape: {face_shape}. Tone summary: {tone_summary}. "
      f"Recommended mood: {recommended_mood}. "
      "Reflect these colors, textures, and placement while staying the same user's own photo. "
      "Do not leave the face bare, no-makeup, lightly retouched, or visually unchanged. No extra people, accessories, or distorted facial features."
    )

    return " ".join(prompt.split())[:2200]

  def _resolve_makeup_image_size(self) -> str:
    configured_size = (self.settings.openai_image_size or "auto").strip()

    if configured_size != "auto":
      logger.info(
        "[aura:openai] image-generation:size-override configured=%s effective=auto reason=preserve_source_composition",
        configured_size,
      )

    return "auto"

  def _supports_input_fidelity_option(self) -> bool:
    model_id = (self.settings.openai_image_model_id or "").strip().lower()

    return model_id == "gpt-image-1"

  def _resolve_makeup_image_output(self) -> tuple[str, int | None, str, str]:
    output_format = (self.settings.openai_image_output_format or "jpeg").strip().lower()

    if output_format == "jpg":
      output_format = "jpeg"

    if output_format not in {"jpeg", "png", "webp"}:
      logger.warning(
        "[aura:openai] image-generation:unsupported-output-format configured=%s effective=jpeg",
        output_format,
      )
      output_format = "jpeg"

    extension = ".jpg" if output_format == "jpeg" else f".{output_format}"
    content_type = f"image/{output_format}"
    compression = None

    if output_format in {"jpeg", "webp"}:
      compression = max(0, min(100, int(self.settings.openai_image_output_compression)))

    return output_format, compression, extension, content_type

  def _build_image_edit_params(self, image_file: Any, prompt: str, edit_size: str) -> dict[str, Any]:
    output_format, output_compression, _, _ = self._resolve_makeup_image_output()
    params = {
      "model": self.settings.openai_image_model_id,
      "image": image_file,
      "prompt": prompt,
      "background": "opaque",
      "n": 1,
      "quality": self.settings.openai_image_quality,
      "size": edit_size,
      "output_format": output_format,
    }

    if output_compression is not None:
      params["output_compression"] = output_compression

    if self._supports_input_fidelity_option():
      params["input_fidelity"] = "high"

    return params

  def _upload_generated_image(self, image_bytes: bytes, index: int) -> dict[str, str]:
    if not self.settings.s3_bucket_name:
      raise AppError(
        503,
        "S3_NOT_CONFIGURED",
        "S3_BUCKET_NAME is required for generated makeup images.",
      )

    _, _, extension, content_type = self._resolve_makeup_image_output()
    object_key = f"uploads/generated-makeup/{uuid4()}-{index}{extension}"
    self._s3_client().put_object(
      Bucket=self.settings.s3_bucket_name,
      Key=object_key,
      Body=image_bytes,
      ContentType=content_type,
      CacheControl="public, max-age=31536000, immutable",
    )
    cdn_base_url = self.settings.effective_cdn_base_url

    return {
      "bucket": self.settings.s3_bucket_name,
      "objectKey": object_key,
      "imageUrl": f"{cdn_base_url}/{object_key}" if cdn_base_url else f"s3://{self.settings.s3_bucket_name}/{object_key}",
    }

  def _edit_makeup_image_bytes(
    self,
    source_image_bytes: bytes,
    source_content_type: str,
    analysis_result: dict[str, Any],
    card: dict[str, Any],
    index: int,
  ) -> dict[str, Any]:
    started_at = time.monotonic()
    prompt = self._build_makeup_image_prompt(analysis_result, card)
    edit_size = self._resolve_makeup_image_size()
    suffix = self._source_file_suffix(source_content_type)
    logger.info(
      "[aura:openai] image-generation:item-start index=%s title=%s model=%s size=%s",
      index + 1,
      card.get("title"),
      self.settings.openai_image_model_id,
      edit_size,
    )

    temp_path: str | None = None

    try:
      with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as image_file:
        image_file.write(source_image_bytes)
        temp_path = image_file.name

      with open(temp_path, "rb") as image_file:
        response = self._client().images.edit(
          **self._build_image_edit_params(image_file, prompt, edit_size),
        )
    finally:
      if temp_path:
        Path(temp_path).unlink(missing_ok=True)

    image_base64 = response.data[0].b64_json if response.data else None

    if not image_base64:
      raise AppError(
        502,
        "OPENAI_IMAGE_EMPTY_OUTPUT",
        "OpenAI image generation returned no image.",
      )

    generated_image_bytes = base64.b64decode(image_base64)
    generated_image_bytes = self._optimize_generated_image_for_upload(generated_image_bytes)
    duration_ms = round((time.monotonic() - started_at) * 1000)

    return generated_image_bytes, duration_ms

  def _generate_single_makeup_image(
    self,
    source_image_bytes: bytes,
    source_content_type: str,
    analysis_result: dict[str, Any],
    card: dict[str, Any],
    index: int,
  ) -> dict[str, Any]:
    generated_image_bytes, duration_ms = self._edit_makeup_image_bytes(
      source_image_bytes,
      source_content_type,
      analysis_result,
      card,
      index,
    )
    upload = self._upload_generated_image(generated_image_bytes, index + 1)
    logger.info(
      "[aura:openai] image-generation:item-success index=%s bytes=%s durationMs=%s imageUrl=%s",
      index + 1,
      len(generated_image_bytes),
      duration_ms,
      upload["imageUrl"],
    )

    return {
      **card,
      "imageUrl": upload["imageUrl"],
      "imageBucket": upload["bucket"],
      "imageObjectKey": upload["objectKey"],
      "_imageGenerationDurationMs": duration_ms,
    }

  def _generate_recommended_makeup_images_sync(
    self,
    payload: dict[str, Any],
    source_image_bytes: bytes,
    analysis_result: dict[str, Any],
  ) -> dict[str, Any]:
    recommended_makeups = analysis_result.get("recommendedMakeups")

    if not isinstance(recommended_makeups, list) or not recommended_makeups:
      raise AppError(
        502,
        "RECOMMENDED_MAKEUPS_REQUIRED",
        "AI analysis must return recommendedMakeups before image generation.",
      )

    cards = [
      card
      for card in recommended_makeups[:RECOMMENDED_MAKEUP_COUNT]
      if isinstance(card, dict)
    ]

    if len(cards) < RECOMMENDED_MAKEUP_COUNT:
      raise AppError(
        502,
        "RECOMMENDED_MAKEUPS_INCOMPLETE",
        "AI analysis must return exactly 1 recommended makeup card.",
      )

    started_at = time.monotonic()
    source_content_type = self._infer_content_type(payload)
    source_image_bytes, source_content_type = self._prepare_source_image_for_generation(
      source_image_bytes,
      source_content_type,
    )
    generated_cards: list[dict[str, Any] | None] = [None] * len(cards)
    logger.info(
      "[aura:openai] image-generation:batch-start count=%s model=%s",
      len(cards),
      self.settings.openai_image_model_id,
    )

    with ThreadPoolExecutor(max_workers=len(cards)) as executor:
      futures = {
        executor.submit(
          self._generate_single_makeup_image,
          source_image_bytes,
          source_content_type,
          analysis_result,
          card,
          index,
        ): index
        for index, card in enumerate(cards)
      }

      for future in as_completed(futures):
        index = futures[future]
        generated_cards[index] = future.result()

    missing_image_indexes = [
      index + 1
      for index, card in enumerate(generated_cards)
      if not isinstance(card, dict) or not self._first_normalized_text(card.get("imageUrl"))
    ]

    if missing_image_indexes:
      raise AppError(
        502,
        "RECOMMENDED_MAKEUP_IMAGES_INCOMPLETE",
        "Recommended makeup image generation must return exactly 1 image URL.",
        details={"missingIndexes": missing_image_indexes},
      )

    image_generation_batch_ms = round((time.monotonic() - started_at) * 1000)
    logger.info(
      "[aura:openai] image-generation:batch-success count=%s durationMs=%s",
      len(generated_cards),
      image_generation_batch_ms,
    )
    image_generation_items = [
      {
        "index": index + 1,
        "durationMs": card.pop("_imageGenerationDurationMs", None),
      }
      for index, card in enumerate(generated_cards)
      if isinstance(card, dict)
    ]

    return {
      **analysis_result,
      "recommendedMakeups": generated_cards,
      "timing": {
        **(
          analysis_result.get("timing")
          if isinstance(analysis_result.get("timing"), dict)
          else {}
        ),
        "imageGenerationBatchMs": image_generation_batch_ms,
        "imageGenerationItems": image_generation_items,
      },
    }

  def _validate_completed_analysis_result(self, result: dict[str, Any]) -> None:
    recommended_makeups = result.get("recommendedMakeups")

    if (
      not isinstance(recommended_makeups, list)
      or len(recommended_makeups) != RECOMMENDED_MAKEUP_COUNT
    ):
      raise AppError(
        502,
        "RECOMMENDED_MAKEUPS_REQUIRED",
        "Completed analysis must include exactly 1 recommended makeup card.",
        details={
          "receivedCount": len(recommended_makeups) if isinstance(recommended_makeups, list) else 0,
        },
      )

    missing_image_indexes = [
      index + 1
      for index, card in enumerate(recommended_makeups)
      if not isinstance(card, dict) or not self._first_normalized_text(card.get("imageUrl"))
    ]

    if missing_image_indexes:
      raise AppError(
        502,
        "RECOMMENDED_MAKEUP_IMAGES_REQUIRED",
        "Completed analysis must include 1 generated makeup image URL.",
        details={"missingIndexes": missing_image_indexes},
      )

  async def analyze_text(self, payload: dict[str, Any]) -> dict[str, Any]:
    try:
      source_read_started_at = time.monotonic()
      source_image_bytes = await asyncio.to_thread(self._read_source_image_bytes, payload)
      source_image_read_ms = round((time.monotonic() - source_read_started_at) * 1000)

      text_analysis_started_at = time.monotonic()
      analysis_result = await asyncio.to_thread(
        self._analyze_image_sync,
        payload,
        source_image_bytes,
      )
      text_analysis_ms = round((time.monotonic() - text_analysis_started_at) * 1000)
      analysis_result["analysisProvider"] = self.settings.analysis_provider
      analysis_result["analysisModel"] = self.settings.effective_analysis_model_id
      analysis_result["embeddingProvider"] = "bedrock"
      analysis_result["embeddingModel"] = self.settings.effective_embedding_model_id
      analysis_result["imageGenerationProvider"] = self.settings.image_generation_provider_normalized
      analysis_result["imageGenerationModel"] = (
        self.settings.openai_image_model_id
        if self.settings.image_generation_provider_normalized == "openai"
        else None
      )
      analysis_result["imageGenerationStatus"] = "pending"
      analysis_result["timing"] = {
        **(
          analysis_result.get("timing")
          if isinstance(analysis_result.get("timing"), dict)
          else {}
        ),
        "sourceImageReadMs": source_image_read_ms,
        "textAnalysisMs": text_analysis_ms,
      }

      return analysis_result
    except AppError:
      raise
    except (OpenAIError, BotoCoreError, ClientError) as exc:
      logger.exception("[aura:ai] text-analysis:failed")
      raise AppError(
        502,
        "AI_INVOCATION_FAILED",
        "AI text analysis invocation failed.",
        details={"reason": exc.__class__.__name__, "message": str(exc)},
      ) from exc
    except Exception as exc:
      logger.exception("[aura:ai] text-analysis:failed")
      raise AppError(
        502,
        "AI_INVOCATION_FAILED",
        "AI text analysis invocation failed.",
        details={"reason": exc.__class__.__name__},
      ) from exc

  async def prepare_generation_source(
    self,
    payload: dict[str, Any],
    source_image_bytes: bytes | None = None,
  ) -> tuple[bytes, str]:
    """Read the source photo (if not already supplied) and downscale/re-encode
    it for image generation.

    This is safe to run concurrently with text analysis so the slow OpenAI
    image edit can start as soon as the report text is ready, instead of paying
    for the S3 read and resize on the image-generation critical path.
    """
    if source_image_bytes is None:
      source_image_bytes = await asyncio.to_thread(self._read_source_image_bytes, payload)

    source_content_type = self._infer_content_type(payload)

    return await asyncio.to_thread(
      self._prepare_source_image_for_generation,
      source_image_bytes,
      source_content_type,
    )

  async def generate_recommended_makeup_images(
    self,
    payload: dict[str, Any],
    analysis_result: dict[str, Any],
    on_card_generated: Any | None = None,
    *,
    prepared_source: tuple[bytes, str] | None = None,
  ) -> dict[str, Any]:
    if self.settings.image_generation_provider_normalized != "openai":
      raise AppError(
        503,
        "IMAGE_GENERATION_PROVIDER_UNSUPPORTED",
        "Only OpenAI image generation is currently supported.",
      )

    recommended_makeups = analysis_result.get("recommendedMakeups")

    if not isinstance(recommended_makeups, list) or not recommended_makeups:
      raise AppError(
        502,
        "RECOMMENDED_MAKEUPS_REQUIRED",
        "AI analysis must return recommendedMakeups before image generation.",
      )

    cards = [
      card
      for card in recommended_makeups[:RECOMMENDED_MAKEUP_COUNT]
      if isinstance(card, dict)
    ]

    if len(cards) < RECOMMENDED_MAKEUP_COUNT:
      raise AppError(
        502,
        "RECOMMENDED_MAKEUPS_INCOMPLETE",
        "AI analysis must return exactly 1 recommended makeup card.",
      )

    started_at = time.monotonic()

    if prepared_source is not None:
      # Source was read and downscaled ahead of time (overlapped with text
      # analysis), so image generation starts without extra S3/CPU work.
      source_image_bytes, source_content_type = prepared_source
      image_source_read_ms = 0
      image_source_prepare_ms = 0
    else:
      source_read_started_at = time.monotonic()
      source_image_bytes = await asyncio.to_thread(self._read_source_image_bytes, payload)
      image_source_read_ms = round((time.monotonic() - source_read_started_at) * 1000)
      source_content_type = self._infer_content_type(payload)
      source_prepare_started_at = time.monotonic()
      source_image_bytes, source_content_type = await asyncio.to_thread(
        self._prepare_source_image_for_generation,
        source_image_bytes,
        source_content_type,
      )
      image_source_prepare_ms = round((time.monotonic() - source_prepare_started_at) * 1000)

    generated_cards: list[dict[str, Any]] = [dict(card) for card in cards]
    image_generation_items: list[dict[str, Any]] = []
    image_generation_errors: list[dict[str, Any]] = []
    logger.info(
      "[aura:openai] image-generation:background-start count=%s model=%s",
      len(cards),
      self.settings.openai_image_model_id,
    )

    async def generate_card(index: int, card: dict[str, Any]):
      try:
        generated_card = await asyncio.to_thread(
          self._generate_single_makeup_image,
          source_image_bytes,
          source_content_type,
          analysis_result,
          card,
          index,
        )
        return index, generated_card, None
      except Exception as exc:  # noqa: BLE001 - keep other image tasks alive.
        return index, None, exc

    tasks = [asyncio.create_task(generate_card(index, card)) for index, card in enumerate(cards)]

    for task in asyncio.as_completed(tasks):
      index, generated_card, error = await task

      if error is not None:
        error_message = str(error)
        error_detail = {
          "index": index + 1,
          "message": error_message,
          "reason": error.__class__.__name__,
        }

        if isinstance(error, AppError):
          error_detail.update({"code": error.code, "message": error.message})

        image_generation_errors.append(error_detail)
        generated_cards[index] = {**generated_cards[index], "imageStatus": "failed"}
        logger.warning(
          "[aura:openai] image-generation:item-failed index=%s reason=%s message=%s",
          index + 1,
          error.__class__.__name__,
          error_message,
        )
        continue

      if not isinstance(generated_card, dict):
        continue

      duration_ms = generated_card.pop("_imageGenerationDurationMs", None)
      generated_cards[index] = {**generated_card, "imageStatus": "ready"}
      image_generation_items.append({"index": index + 1, "durationMs": duration_ms})
      partial_result = {
        **analysis_result,
        "recommendedMakeups": generated_cards,
        "imageGenerationStatus": "processing",
        "timing": {
          **(
            analysis_result.get("timing")
            if isinstance(analysis_result.get("timing"), dict)
            else {}
          ),
          "imageSourceReadMs": image_source_read_ms,
          "imageSourcePrepareMs": image_source_prepare_ms,
          "imageGenerationItems": sorted(image_generation_items, key=lambda item: item["index"]),
          "imageGenerationStatus": "processing",
        },
      }

      if on_card_generated:
        await on_card_generated(index, generated_cards[index], partial_result)

    image_generation_status = "failed" if image_generation_errors else "completed"
    image_generation_total_ms = round((time.monotonic() - started_at) * 1000)
    result = {
      **analysis_result,
      "recommendedMakeups": generated_cards,
      "imageGenerationStatus": image_generation_status,
      "timing": {
        **(
          analysis_result.get("timing")
          if isinstance(analysis_result.get("timing"), dict)
          else {}
        ),
        "imageSourceReadMs": image_source_read_ms,
        "imageSourcePrepareMs": image_source_prepare_ms,
        "imageGenerationItems": sorted(image_generation_items, key=lambda item: item["index"]),
        "imageGenerationStatus": image_generation_status,
        "imageGenerationTotalMs": image_generation_total_ms,
      },
    }

    if image_generation_errors:
      result["imageGenerationErrors"] = image_generation_errors

    logger.info(
      "[aura:openai] image-generation:background-finished status=%s generated=%s failed=%s durationMs=%s",
      image_generation_status,
      len(image_generation_items),
      len(image_generation_errors),
      image_generation_total_ms,
    )

    return result

  def _generate_personalized_makeup_recommendations_sync(
    self,
    payload: dict[str, Any],
  ) -> dict[str, Any]:
    total_started_at = time.monotonic()
    source_image_bytes, source_content_type = self._read_makeup_recommendation_source(
      str(payload.get("sourceImageUrl") or ""),
    )
    source_image_bytes, source_content_type = self._prepare_source_image_for_generation(
      source_image_bytes,
      source_content_type,
    )
    text_started_at = time.monotonic()
    looks = self._generate_personalized_makeup_text_sync(
      payload,
      source_image_bytes,
      source_content_type,
    )
    text_duration_ms = round((time.monotonic() - text_started_at) * 1000)
    profile = payload.get("profile") if isinstance(payload.get("profile"), dict) else {}
    analysis_result = {
      "personalColor": payload.get("personalColor"),
      "faceShape": profile.get("faceShape"),
      "toneSummary": profile.get("toneSummary"),
      "recommendedMood": profile.get("recommendedMood"),
    }
    image_cards = [
      {
        **look,
        "description": look.get("summary"),
      }
      for look in looks
    ]
    generated: list[tuple[bytes, int] | None] = [None] * len(image_cards)
    image_started_at = time.monotonic()

    with ThreadPoolExecutor(max_workers=len(image_cards)) as executor:
      futures = {
        executor.submit(
          self._edit_makeup_image_bytes,
          source_image_bytes,
          source_content_type,
          analysis_result,
          card,
          index,
        ): index
        for index, card in enumerate(image_cards)
      }

      for future in as_completed(futures):
        index = futures[future]
        generated[index] = future.result()

    results: list[dict[str, Any]] = []
    conditions = [
      str(condition).strip()
      for condition in payload.get("conditions", [])
      if str(condition).strip()
    ] if isinstance(payload.get("conditions"), list) else []
    _, _, _, output_content_type = self._resolve_makeup_image_output()

    for index, look in enumerate(looks):
      generated_item = generated[index]

      if generated_item is None:
        raise AppError(
          502,
          "OPENAI_MAKEUP_IMAGE_INCOMPLETE",
          "OpenAI did not generate every requested makeup image.",
        )

      image_bytes, image_duration_ms = generated_item

      if self.settings.s3_bucket_name:
        upload = self._upload_generated_image(image_bytes, index + 1)
        image_url = upload["imageUrl"]
      else:
        image_url = f"data:{output_content_type};base64,{base64.b64encode(image_bytes).decode('ascii')}"

      role = str(look.get("role") or MAKEUP_RECOMMENDATION_ROLES[index])
      products = [
        {
          **product,
          "id": f"openai-{role}-{product.get('area')}-{product_index + 1}",
        }
        for product_index, product in enumerate(look.get("products", []))
        if isinstance(product, dict)
      ]
      results.append(
        {
          "id": f"openai-{role}-{uuid4()}",
          "arFilterId": MAKEUP_RECOMMENDATION_AR_FILTERS[role],
          "role": role,
          "title": look.get("title"),
          "summary": look.get("summary"),
          "imageUrl": image_url,
          "reasons": look.get("reasons", []),
          "appliedConditions": conditions,
          "durationMinutes": look.get("durationMinutes"),
          "difficulty": look.get("difficulty"),
          "steps": look.get("steps", []),
          "products": products,
          "imageGenerationDurationMs": image_duration_ms,
        },
      )

    return {
      "results": results,
      "provider": "openai",
      "textModel": self.settings.openai_analysis_model_id,
      "imageModel": self.settings.openai_image_model_id,
      "timing": {
        "textMs": text_duration_ms,
        "imagesMs": round((time.monotonic() - image_started_at) * 1000),
        "totalMs": round((time.monotonic() - total_started_at) * 1000),
      },
    }

  async def generate_personalized_makeup_recommendations(
    self,
    payload: dict[str, Any],
  ) -> dict[str, Any]:
    try:
      return await asyncio.to_thread(
        self._generate_personalized_makeup_recommendations_sync,
        payload,
      )
    except AppError:
      raise
    except (OpenAIError, BotoCoreError, ClientError, httpx.HTTPError) as exc:
      logger.exception("[aura:openai] makeup-recommendation:failed")
      raise AppError(
        502,
        "OPENAI_MAKEUP_RECOMMENDATION_FAILED",
        "OpenAI makeup recommendation generation failed.",
        details={"reason": exc.__class__.__name__, "message": str(exc)},
      ) from exc
    except Exception as exc:
      logger.exception("[aura:openai] makeup-recommendation:failed")
      raise AppError(
        502,
        "OPENAI_MAKEUP_RECOMMENDATION_FAILED",
        "OpenAI makeup recommendation generation failed.",
        details={"reason": exc.__class__.__name__},
      ) from exc

  async def analyze_image(self, payload: dict[str, Any]) -> dict[str, Any]:
    try:
      total_started_at = time.monotonic()
      analysis_result = await self.analyze_text(payload)
      result = await self.generate_recommended_makeup_images(payload, analysis_result)
      result["timing"] = {
        **(result.get("timing") if isinstance(result.get("timing"), dict) else {}),
        "totalMs": round((time.monotonic() - total_started_at) * 1000),
      }
      self._validate_completed_analysis_result(result)

      return result
    except AppError:
      raise
    except (OpenAIError, BotoCoreError, ClientError) as exc:
      logger.exception("[aura:ai] invocation:failed")
      raise AppError(
        502,
        "AI_INVOCATION_FAILED",
        "AI analysis or image generation failed.",
        details={"reason": exc.__class__.__name__, "message": str(exc)},
      ) from exc
    except Exception as exc:
      logger.exception("[aura:ai] invocation:failed")
      raise AppError(
        502,
        "AI_INVOCATION_FAILED",
        "AI analysis or image generation failed.",
        details={"reason": exc.__class__.__name__},
      ) from exc
