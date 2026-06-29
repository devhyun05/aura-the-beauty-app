import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import logging
import re
import tempfile
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

try:
  from openai import OpenAI, OpenAIError
except ImportError:  # pragma: no cover - only hit before backend deps are installed.
  OpenAI = None
  OpenAIError = Exception

from app.core.errors import AppError
from app.core.settings import Settings


logger = logging.getLogger(__name__)

ANALYSIS_OUTPUT_FIELD_GUIDE = (
  "Top-level JSON keys: personalColor, faceShape, skinType, toneSummary, "
  "recommendedMood, tags, summary, shortSummary, skinAnalysisSummary, "
  "baseMakeupGuide, makeupGuideline, recommendedMakeups, beautyGuide. "
  "makeupGuideline keys: brow, blush, highlight, eyeshadow, eyeliner, lip. "
  "recommendedMakeups must be exactly 3 objects. Each object keys: title, "
  "subtitle, description, tags. tags must contain exactly 2 strings. "
  "beautyGuide is optional but recommended. beautyGuide keys: bestColors, "
  "bestNeutrals, bestAccentColors, avoidColors, hairColorDirection, "
  "hairstyleDirection, finalFormula."
)


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

    return OpenAI(api_key=self.settings.openai_api_key)

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

  def _build_analysis_prompt(self, payload: dict[str, Any]) -> str:
    metadata = {
      key: value
      for key, value in payload.items()
      if key not in {"imageUrl", "image_url", "cdnUrl", "previewUrl", "sourceUri"}
    }

    return (
      "Act as a professional personal color analyst, makeup artist, hairstylist, and image consultant. "
      "사용자의 얼굴 사진을 분석해서 개인 맞춤 뷰티 분석 보고서를 만들어줘. "
      "피부 톤, 언더톤, 대비감, 눈동자와 머리 색, 얼굴형, 눈매, 광대/볼 구조, 눈썹, 입술, 전체 분위기를 함께 판단해. "
      "전문 퍼스널 컬러 컨설턴트와 메이크업 아티스트가 실제 고객을 상담하듯, 사진 속 실제 얼굴 특징과 컬러링을 근거로 판단해. "
      "사진 조명이나 안경/그림자 때문에 확정이 어려운 내용은 과하게 단정하지 말고 가장 가능성 높은 방향으로 표현해. "
      "사진 속 사용자의 성별 표현과 스타일을 반드시 보존해. 남성으로 보이는 사용자는 남성 그루밍 메이크업 중심으로, 여성으로 보이는 사용자는 여성 메이크업 중심으로 추천해. "
      "메이크업 추천이 사용자의 성별 표현을 바꾸거나 다른 성별처럼 보이게 만들면 안 돼. "
      "반드시 한국어 JSON 객체 하나만 반환해. "
      "앱 상단 요약에 바로 쓰이도록 personalColor, faceShape, toneSummary, recommendedMood를 가장 먼저 정확하고 짧게 채워. "
      "personalColor는 가장 가능성 높은 시즌/톤 방향으로 작성해. 예: 뉴트럴 웜, 소프트 가을, 라이트 봄처럼 짧게. "
      "faceShape는 얼굴형과 인상 특징을 짧게 작성해. "
      "toneSummary는 18자 이내의 짧은 명사구로 작성하고, recommendedMood는 18자 이내의 짧은 무드명으로 작성해. "
      "toneSummary와 recommendedMood에는 긴 설명 문장, 이유, 쉼표로 이어지는 긴 문구를 쓰지 마. "
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
      "추천 메이크업은 위 보고서에서 판단한 퍼스널 컬러, 얼굴형, 톤 요약, 추천 무드, 눈매, 입술 톤, 헤어 방향에 근거해서 정확히 3개만 작성해. "
      "recommendedMakeups는 단순 텍스트 추천이 아니라, 이후 같은 사용자 얼굴 사진에 메이크업을 적용한 업데이트 이미지 3장의 콘셉트가 되어야 해. "
      "각 recommendedMakeups 항목은 보고서의 어떤 판단 때문에 그 룩이 어울리는지 description에 명확히 반영해. "
      "각 추천은 서로 다른 새 사진 결과가 나오도록 색감, 질감, 분위기, 립/아이/블러셔 포인트가 분명히 구분되어야 해. "
      "각 추천은 민낯이나 기본 보정 사진처럼 보이면 안 되지만, 사용자의 성별 표현과 일상 스타일에 맞는 자연스러운 강도여야 해. "
      "남성 사용자라면 피부 톤 보정, 눈썹 결 정리, 자연스러운 음영, 립밤/톤 보정, 유분 정돈처럼 남성 그루밍에 어울리는 방식으로 작성해. "
      "여성 사용자라면 퍼스널 컬러에 맞춘 베이스, 아이, 블러셔, 립 포인트를 자연스럽게 제안해. "
      "다른 사람이나 일반 모델 기준이 아니라 업로드된 사용자 얼굴에 어울리는 추천으로만 작성해. "
      "추천명은 클리어 & 글로시, 과즙상, 깔끔한 또렷함 같은 고정 예시를 반복하지 말고 사진 분석 결과에 맞춰 새롭게 판단해. "
      "비추천 메이크업, 피해야 할 메이크업, avoidedMakeups는 절대 생성하지 마. "
      "각 추천은 앱 카드에 들어갈 수 있게 title은 12자 이내, subtitle은 16자 이내, description은 두 줄 이내, tags는 2개만 포함해. "
      "텍스트는 짧고 실용적으로 작성하고, 일반론이나 누구에게나 맞는 조언을 쓰지 마. "
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

    while len(cards) < 3:
      cards.append(self._default_recommended_makeup_card(result, len(cards)))

    normalized_cards: list[dict[str, Any]] = []

    for index, card in enumerate(cards[:3]):
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

  def _build_image_edit_params(self, image_file: Any, prompt: str, edit_size: str) -> dict[str, Any]:
    params = {
      "model": self.settings.openai_image_model_id,
      "image": image_file,
      "prompt": prompt,
      "background": "opaque",
      "n": 1,
      "quality": self.settings.openai_image_quality,
      "size": edit_size,
    }

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

    object_key = f"uploads/generated-makeup/{uuid4()}-{index}.png"
    self._s3_client().put_object(
      Bucket=self.settings.s3_bucket_name,
      Key=object_key,
      Body=image_bytes,
      ContentType="image/png",
    )
    cdn_base_url = self.settings.effective_cdn_base_url

    return {
      "bucket": self.settings.s3_bucket_name,
      "objectKey": object_key,
      "imageUrl": f"{cdn_base_url}/{object_key}" if cdn_base_url else f"s3://{self.settings.s3_bucket_name}/{object_key}",
    }

  def _generate_single_makeup_image(
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
    upload = self._upload_generated_image(generated_image_bytes, index + 1)
    duration_ms = round((time.monotonic() - started_at) * 1000)
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
      for card in recommended_makeups[:3]
      if isinstance(card, dict)
    ]

    if len(cards) < 3:
      raise AppError(
        502,
        "RECOMMENDED_MAKEUPS_INCOMPLETE",
        "AI analysis must return exactly 3 recommended makeup cards.",
      )

    started_at = time.monotonic()
    source_content_type = self._infer_content_type(payload)
    generated_cards: list[dict[str, Any] | None] = [None, None, None]
    logger.info(
      "[aura:openai] image-generation:batch-start count=%s model=%s",
      len(cards),
      self.settings.openai_image_model_id,
    )

    with ThreadPoolExecutor(max_workers=3) as executor:
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
        "Recommended makeup image generation must return exactly 3 image URLs.",
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

    if not isinstance(recommended_makeups, list) or len(recommended_makeups) != 3:
      raise AppError(
        502,
        "RECOMMENDED_MAKEUPS_REQUIRED",
        "Completed analysis must include exactly 3 recommended makeup cards.",
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
        "Completed analysis must include 3 generated makeup image URLs.",
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

  async def generate_recommended_makeup_images(
    self,
    payload: dict[str, Any],
    analysis_result: dict[str, Any],
    on_card_generated: Any | None = None,
  ) -> dict[str, Any]:
    if self.settings.image_generation_provider_normalized != "openai":
      raise AppError(
        503,
        "IMAGE_GENERATION_PROVIDER_UNSUPPORTED",
        "Only OpenAI image generation is currently supported.",
      )

    source_read_started_at = time.monotonic()
    source_image_bytes = await asyncio.to_thread(self._read_source_image_bytes, payload)
    image_source_read_ms = round((time.monotonic() - source_read_started_at) * 1000)
    recommended_makeups = analysis_result.get("recommendedMakeups")

    if not isinstance(recommended_makeups, list) or not recommended_makeups:
      raise AppError(
        502,
        "RECOMMENDED_MAKEUPS_REQUIRED",
        "AI analysis must return recommendedMakeups before image generation.",
      )

    cards = [card for card in recommended_makeups[:3] if isinstance(card, dict)]

    if len(cards) < 3:
      raise AppError(
        502,
        "RECOMMENDED_MAKEUPS_INCOMPLETE",
        "AI analysis must return exactly 3 recommended makeup cards.",
      )

    started_at = time.monotonic()
    source_content_type = self._infer_content_type(payload)
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
        error_detail = {"index": index + 1, "reason": error.__class__.__name__}

        if isinstance(error, AppError):
          error_detail.update({"code": error.code, "message": error.message})

        image_generation_errors.append(error_detail)
        generated_cards[index] = {**generated_cards[index], "imageStatus": "failed"}
        logger.warning(
          "[aura:openai] image-generation:item-failed index=%s reason=%s",
          index + 1,
          error.__class__.__name__,
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
