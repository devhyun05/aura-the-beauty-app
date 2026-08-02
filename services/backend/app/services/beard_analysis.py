from __future__ import annotations

import asyncio
import base64
from io import BytesIO
import json
import logging
import re
import time
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

try:
  from PIL import Image, ImageOps, UnidentifiedImageError
except ImportError:  # pragma: no cover - fallback keeps local setup usable before deps install.
  Image = None
  ImageOps = None
  UnidentifiedImageError = Exception

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.bedrock_guardrails import build_bedrock_guardrail_invoke_kwargs


logger = logging.getLogger(__name__)

MODEL_VERSION = "beard-report:bedrock-v1-sonnet"

# 사진에서 판단하기 어려운 이미지의 긴 변 상한 (base64 전 다운스케일 기준).
BEARD_IMAGE_MAX_EDGE = 1568

# 설문 라벨 (apps/mobile/.../SurveyScreen.tsx 와 인덱스가 정확히 일치해야 함).
A1_LABELS = [
  "푸른 수염 자국을 줄이고 싶어요",
  "전체적인 수염 밀도를 줄이고 싶어요",
  "수염이 많이 줄어든 모습을 보고 싶어요",
]
SHAVE_LABELS = ["면도 직후", "까슬한 수염", "짧게 자란 수염", "비교적 짙은 수염"]
AREAS_LABELS = ["인중", "턱", "입 양쪽", "턱선"]
FREQ_LABELS = ["매일", "2~3일에 한 번", "가끔"]
COVER_LABELS = ["자주 있어요", "가끔 있어요", "아니요"]
PLAN_LABELS = ["알아보고 있어요", "고민 중이에요", "아니요"]
NO_ANSWER_LABEL = "응답 없음"

# 결정론적 고정값 — 실제로 생성된 보고서 안에서만 붙인다.
FIXED_CELL = {"k": "원본 보존", "v": "확인됨"}
FIXED_SAFETY_TIP = "자극이나 피부 이상이 있을 때는 앱이 판단하지 않아요. 전문가와 상담해 주세요."

# 모델이 채워야 하는 정의 그리드 항목 (정확히 이 5개 키, 각 1회).
MODEL_CELL_KEYS = ["수염 타입 요약", "밀도", "푸른 그림자", "주요 분포", "촬영 품질"]

# 3중 안전장치의 마지막 층: 모델 출력에 이 표현이 있으면 보고서 전체를 실패로 취급한다.
FORBIDDEN_TERMS = ["진단", "영구제모", "영구 제모", "회차", "효과보장", "효과 보장"]

BEARD_REPORT_SYSTEM_PROMPT = (
  'You are the report writer for AURA Beauty Lab\'s beard-simulation detailed report ("상세 보고서"). '
  "This feature is a self-reference simulation tool, NOT a medical device, and gives NO medical diagnosis. "
  "You look at a user's face photo and their survey answers and write grounded, kind Korean report content. "
  "Output valid JSON only — no markdown, no code fences, no text outside the JSON."
)


def _clean_text(value: Any, fallback: str = "") -> str:
  if isinstance(value, str):
    normalized = " ".join(value.split()).strip()
    return normalized or fallback

  return fallback


def _is_index(value: Any) -> bool:
  return isinstance(value, int) and not isinstance(value, bool)


def _label_from_index(labels: list[str], index: Any) -> str:
  if _is_index(index) and 0 <= index < len(labels):
    return labels[index]

  return NO_ANSWER_LABEL


def _areas_label(indices: Any) -> str:
  if not isinstance(indices, list):
    return NO_ANSWER_LABEL

  selected = [
    AREAS_LABELS[index]
    for index in indices
    if _is_index(index) and 0 <= index < len(AREAS_LABELS)
  ]

  return " · ".join(selected) if selected else NO_ANSWER_LABEL


def _survey_labels(survey: Any) -> dict[str, str]:
  data = survey if isinstance(survey, dict) else {}

  return {
    "a1": _label_from_index(A1_LABELS, data.get("a1")),
    "shave": _label_from_index(SHAVE_LABELS, data.get("shave")),
    "areas": _areas_label(data.get("areas")),
    "freq": _label_from_index(FREQ_LABELS, data.get("freq")),
    "cover": _label_from_index(COVER_LABELS, data.get("cover")),
    "plan": _label_from_index(PLAN_LABELS, data.get("plan")),
  }


def _take_str_list(value: Any, expected_len: int, field: str) -> list[str]:
  items = value if isinstance(value, list) else []
  cleaned = [text for item in items if (text := _clean_text(item))]

  if len(cleaned) < expected_len:
    raise AppError(
      502,
      "BEARD_ANALYSIS_INVALID_OUTPUT",
      "Bedrock beard report returned an incomplete result.",
      {"field": field, "expected": expected_len, "received": len(cleaned)},
    )

  return cleaned[:expected_len]


def _build_cells(raw_cells: Any) -> list[dict[str, str]]:
  items = raw_cells if isinstance(raw_cells, list) else []
  value_by_key: dict[str, str] = {}

  for item in items:
    if not isinstance(item, dict):
      continue

    key = _clean_text(item.get("k"))
    value = _clean_text(item.get("v"))

    if key in MODEL_CELL_KEYS and value and key not in value_by_key:
      value_by_key[key] = value

  cells: list[dict[str, str]] = []

  for key in MODEL_CELL_KEYS:
    value = value_by_key.get(key)

    if not value:
      raise AppError(
        502,
        "BEARD_ANALYSIS_INVALID_OUTPUT",
        "Bedrock beard report is missing a required definition cell.",
        {"field": "cells", "missingKey": key},
      )

    cells.append({"k": key, "v": value})

  cells.append(dict(FIXED_CELL))

  return cells


def _assert_no_forbidden_terms(texts: list[str]) -> None:
  joined = " ".join(texts)

  for term in FORBIDDEN_TERMS:
    if term in joined:
      raise AppError(
        502,
        "BEARD_ANALYSIS_FORBIDDEN_TERM",
        "Bedrock beard report contained a forbidden term and was rejected.",
        {"term": term},
      )


def normalize_beard_analysis_result(result: dict[str, Any] | None) -> dict[str, Any]:
  """Strictly validate a genuinely-generated beard report.

  This NEVER fabricates missing model content. If the model output does not
  satisfy the contract (wrong counts, missing cells) or leaks a forbidden term,
  it raises so the caller can surface a real error instead of a fake report.
  """
  raw_result = result if isinstance(result, dict) else {}

  summary_sentences = _take_str_list(
    raw_result.get("summarySentences") or raw_result.get("summary_sentences"),
    2,
    "summarySentences",
  )
  cells = _build_cells(raw_result.get("cells"))
  consults = _take_str_list(raw_result.get("consults"), 2, "consults")
  tips = _take_str_list(raw_result.get("tips"), 4, "tips") + [FIXED_SAFETY_TIP]

  analysis = {
    "summarySentences": summary_sentences,
    "cells": cells,
    "consults": consults,
    "tips": tips,
  }

  _assert_no_forbidden_terms(
    [
      *summary_sentences,
      *(cell["v"] for cell in cells),
      *consults,
      *tips,
    ],
  )

  return analysis


class BeardAnalysisBedrockService:
  def __init__(self, settings: Settings) -> None:
    self.settings = settings

  def _s3_client(self, region_name: str | None = None):
    client_kwargs = {
      "region_name": region_name or self.settings.aws_region,
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

    object_key = _clean_text(payload.get("imageKey") or payload.get("image_key"))
    normalized = object_key.lower()

    if normalized.endswith(".png"):
      return "image/png"

    if normalized.endswith(".webp"):
      return "image/webp"

    return "image/jpeg"

  def _read_image_bytes(self, payload: dict[str, Any]) -> bytes:
    bucket = _clean_text(payload.get("bucket")) or _clean_text(self.settings.s3_bucket_name)
    object_key = _clean_text(payload.get("imageKey") or payload.get("image_key")).lstrip("/")

    if not bucket:
      raise AppError(
        502,
        "BEARD_ANALYSIS_UNAVAILABLE",
        "No S3 bucket is configured for the beard detailed report.",
        {"reason": "s3_bucket_not_configured"},
      )

    if not object_key:
      raise AppError(
        502,
        "BEARD_ANALYSIS_UNAVAILABLE",
        "A source image key is required for the beard detailed report.",
        {"reason": "image_key_missing"},
      )

    bucket_region = _clean_text(payload.get("bucketRegion")) or None
    started_at = time.monotonic()
    logger.info("[aura:beard-bedrock] image-read:start source=managed-media region=%s", bucket_region)
    image_object = self._s3_client(bucket_region).get_object(Bucket=bucket, Key=object_key)
    image_bytes = image_object["Body"].read()
    logger.info(
      "[aura:beard-bedrock] image-read:success bytes=%s durationMs=%s",
      len(image_bytes),
      round((time.monotonic() - started_at) * 1000),
    )

    return image_bytes

  def _downscale_image(self, image_bytes: bytes, content_type: str) -> tuple[bytes, str]:
    if Image is None or ImageOps is None:
      return image_bytes, content_type

    try:
      with Image.open(BytesIO(image_bytes)) as opened_image:
        image = ImageOps.exif_transpose(opened_image)
        width, height = image.size

        if max(width, height) <= BEARD_IMAGE_MAX_EDGE:
          return image_bytes, content_type

        scale = BEARD_IMAGE_MAX_EDGE / max(width, height)
        next_size = (max(1, round(width * scale)), max(1, round(height * scale)))
        resampling = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
        image = image.resize(next_size, resampling)

        if image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info):
          rgba_image = image.convert("RGBA")
          background = Image.new("RGB", rgba_image.size, (255, 255, 255))
          background.paste(rgba_image, mask=rgba_image.getchannel("A"))
          image = background
        elif image.mode != "RGB":
          image = image.convert("RGB")

        output_buffer = BytesIO()
        image.save(output_buffer, format="JPEG", quality=82, optimize=True, progressive=True)

      optimized_bytes = output_buffer.getvalue()
      logger.info(
        "[aura:beard-bedrock] image-downscale:success size=%sx%s->%sx%s bytes=%s->%s",
        width,
        height,
        next_size[0],
        next_size[1],
        len(image_bytes),
        len(optimized_bytes),
      )

      return optimized_bytes, "image/jpeg"
    except (UnidentifiedImageError, OSError, ValueError) as exc:
      logger.warning("[aura:beard-bedrock] image-downscale:skipped reason=%s", exc.__class__.__name__)
      return image_bytes, content_type

  def _build_prompt(self, payload: dict[str, Any]) -> str:
    labels = _survey_labels(payload.get("survey"))
    output_contract = {
      "summarySentences": ["첫 번째 요약 문장", "두 번째 요약 문장"],
      "cells": [
        {"k": "수염 타입 요약", "v": "짧은 표현"},
        {"k": "밀도", "v": "짧은 표현"},
        {"k": "푸른 그림자", "v": "짧은 표현"},
        {"k": "주요 분포", "v": "짧은 표현"},
        {"k": "촬영 품질", "v": "짧은 표현"},
      ],
      "consults": ["복사해서 쓸 수 있는 첫 번째 상담 문장", "복사해서 쓸 수 있는 두 번째 상담 문장"],
      "tips": ["첫 번째 팁", "두 번째 팁", "세 번째 팁", "네 번째 팁"],
    }

    return f"""
Analyze the attached face photo together with the survey answers, and write "상세 보고서" content that helps the user understand their beard / shaving-shadow state and, if they wish, prepare for a professional consultation.

CRITICAL RULES:
- This app is not a medical device and gives no medical diagnosis; it is a self-reference/simulation tool.
- NEVER use these Korean words/expressions in the output: "진단", "영구제모"/"영구 제모", "회차" or any wording implying a number of treatment sessions, "효과보장"/"효과 보장" or any wording that promises or guarantees results.
- Do not name specific procedures, clinics, brands, or prices, and do not assert treatment outcomes.
- Do not infer skin diseases, inflammation, or pigmentation that are not clearly visible in the photo.
- Ground EVERY statement in what is actually visible in THIS photo. The survey is context only — never invent something the photo does not show. If the photo and survey conflict, trust the photo. If hair, angle, or lighting hides the beard area, say the photo makes it hard to judge rather than guessing.
- Keep a calm, kind, plain Korean tone. Do not exaggerate, alarm, or judge the user's appearance.
- ALL output text values MUST be natural KOREAN. These instructions are English for you; the content you write is Korean.

OBSERVE IN THE PHOTO:
1. Beard / shaving marks around chin (턱), philtrum (인중), both mouth sides (입 양쪽), jawline (턱선).
2. Prioritize the areas the user marked bothersome, but trust the photo over the survey.
3. Whether the bluish shadow of shaved follicles showing through skin (푸른 그림자) is more prominent than actual hair length/density.
4. Whether the photo's brightness/angle/focus/occlusion are good enough to analyze (for "촬영 품질").

USER SURVEY (context only):
- Most desired change: {labels["a1"]}
- Shaving state: {labels["shave"]}
- Bothersome areas: {labels["areas"]}
- Shaving frequency: {labels["freq"]}
- Makeup cover frequency: {labels["cover"]}
- Consultation plan: {labels["plan"]}

WRITE (all values in Korean):
1) summarySentences — exactly 2 sentences. Which area shows what most, and what is relatively less prominent, plainly.
2) cells — exactly 5, each k used once: "수염 타입 요약","밀도","푸른 그림자","주요 분포","촬영 품질". v = one word or short phrase.
3) consults — exactly 2 first-person sentences the user can copy-paste into a real consultation. Reflect their specific concern, but only ask to "확인하고 싶다" / "무엇을 먼저 알아보면 좋을지" — never request specific procedures, session counts, prices, or guaranteed results.
4) tips — exactly 4 practical, non-medical self-management/recording tips (how to photograph, how to compare, shaving-tool hygiene). No product recommendations, no medical efficacy claims.

Return ONLY this JSON (exact shape, no extra fields):
{json.dumps(output_contract, ensure_ascii=False, indent=2)}

Return JSON only. No markdown, no commentary. Do not copy any example strings; write fresh content grounded in the actual photo and survey.
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
      raise AppError(
        502,
        "BEARD_ANALYSIS_OUTPUT_PARSE_FAILED",
        "Bedrock beard report did not return valid JSON.",
      ) from exc

    if not isinstance(parsed, dict):
      raise AppError(
        502,
        "BEARD_ANALYSIS_INVALID_OUTPUT",
        "Bedrock beard report returned an unexpected result shape.",
      )

    return parsed

  def _analyze_sync(self, payload: dict[str, Any], image_bytes: bytes) -> dict[str, Any]:
    model_id = self.settings.effective_analysis_model_id

    if not model_id:
      raise AppError(503, "BEDROCK_ANALYSIS_NOT_CONFIGURED", "A Bedrock Claude model ID or inference profile ID is required.")

    content_type = self._infer_content_type(payload)
    image_bytes, content_type = self._downscale_image(image_bytes, content_type)
    image_base64 = base64.b64encode(image_bytes).decode("utf-8")
    started_at = time.monotonic()
    logger.info(
      "[aura:beard-bedrock] analyze:start model=%s region=%s",
      model_id,
      self.settings.effective_bedrock_analysis_region,
    )
    guardrail_kwargs = build_bedrock_guardrail_invoke_kwargs(self.settings)
    response = self._bedrock_runtime_client().invoke_model(
      modelId=model_id,
      body=json.dumps(
        {
          "anthropic_version": "bedrock-2023-05-31",
          "max_tokens": 1800,
          "temperature": 0.25,
          "system": BEARD_REPORT_SYSTEM_PROMPT,
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
      raise AppError(502, "BEARD_ANALYSIS_EMPTY_OUTPUT", "Bedrock beard report returned an empty response.")

    parsed = self._parse_json_output(output_text)
    analysis = normalize_beard_analysis_result(parsed)
    logger.info(
      "[aura:beard-bedrock] analyze:success durationMs=%s",
      round((time.monotonic() - started_at) * 1000),
    )

    return analysis

  async def analyze(self, payload: dict[str, Any]) -> dict[str, Any]:
    image_bytes = await asyncio.to_thread(self._read_image_bytes, payload)
    return await asyncio.to_thread(self._analyze_sync, payload, image_bytes)


async def build_beard_analysis_result_for_request(
  payload: dict[str, Any],
  settings: Settings,
) -> dict[str, Any]:
  """Generate a genuine beard report or raise an explicit AppError.

  There is NO silent fallback: on any failure this raises so the endpoint can
  return a real error / retry signal instead of showing fabricated analysis.
  """
  if settings.analysis_provider != "bedrock" or not settings.effective_analysis_model_id:
    raise AppError(
      502,
      "BEARD_ANALYSIS_UNAVAILABLE",
      "Beard detailed report requires a configured Bedrock analysis model.",
      {"reason": "provider_not_configured", "provider": settings.analysis_provider},
    )

  try:
    return await BeardAnalysisBedrockService(settings).analyze(payload)
  except AppError:
    raise
  except (BotoCoreError, ClientError) as exc:
    logger.warning(
      "[aura:beard-bedrock] analyze:aws-error reason=%s",
      exc.__class__.__name__,
    )
    raise AppError(
      502,
      "BEARD_ANALYSIS_UNAVAILABLE",
      "Beard detailed report generation failed.",
      {"reason": "bedrock_invocation_failed", "providerError": exc.__class__.__name__},
    ) from exc
  except Exception as exc:  # noqa: BLE001 - loud, explicit failure; never a silent fabricated report.
    logger.warning(
      "[aura:beard-bedrock] analyze:failed reason=%s",
      exc.__class__.__name__,
    )
    raise AppError(
      502,
      "BEARD_ANALYSIS_UNAVAILABLE",
      "Beard detailed report generation failed.",
      {"reason": exc.__class__.__name__},
    ) from exc
