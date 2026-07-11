from __future__ import annotations

import asyncio
import base64
from copy import deepcopy
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
from app.db.session import Database
from app.schemas.analysis import FilterExtractionAnalyzeRequest
from app.lambdas.media_postprocess import MediaPostprocessError, process_image_bytes
from app.services.shopping_products import build_product_recommendation_data


logger = logging.getLogger(__name__)
MODEL_VERSION = "reference-makeup-extraction:bedrock-v1"
AREA_IDS = ("skin", "eye", "brow", "cheek", "lip", "contour")
PRODUCT_CATEGORIES = {"base", "shadow", "liner", "cheek", "lip"}
DEFAULT_CATEGORY_BY_AREA = {
  "skin": "base",
  "eye": "shadow",
  "brow": "liner",
  "cheek": "cheek",
  "lip": "lip",
  "contour": "shadow",
}

REFERENCE_BEDROCK_MAX_TOKENS = 8192
REFERENCE_BEDROCK_RETRY_MAX_TOKENS = 12288
REFERENCE_BEDROCK_INPUT_USD_PER_MILLION_TOKENS = 3.0
REFERENCE_BEDROCK_OUTPUT_USD_PER_MILLION_TOKENS = 15.0
REFERENCE_BEDROCK_FATAL_OUTPUT_CODES = {
  "REFERENCE_BEDROCK_EMPTY_OUTPUT",
  "REFERENCE_BEDROCK_OUTPUT_INCOMPLETE",
  "REFERENCE_BEDROCK_OUTPUT_INVALID",
  "REFERENCE_BEDROCK_OUTPUT_PARSE_FAILED",
}

REFERENCE_MAKEUP_REPORT_TOOL_NAME = "submit_reference_makeup_report"
REFERENCE_MAKEUP_REPORT_TOOL = {
  "name": REFERENCE_MAKEUP_REPORT_TOOL_NAME,
  "description": "Submit the complete reference makeup report as structured JSON.",
  "input_schema": {
    "type": "object",
    "properties": {
      "extractedMakeupLook": {
        "type": "object",
        "description": "Report object with title, subtitle, tags, accuracy, points, palette, and areaGuides.",
      },
    },
    "required": ["extractedMakeupLook"],
  },
}

LOADING_STEPS = [
  {"id": "reference-read", "label": "레퍼런스 사진 정보 확인", "status": "done"},
  {"id": "core-points", "label": "메이크업 핵심 포인트 정리", "status": "done"},
  {"id": "area-guides", "label": "부위별 메이크업 방법 구성", "status": "done"},
  {"id": "product-criteria", "label": "추천 제품 검색 기준 생성", "status": "done"},
  {"id": "ar-filter-ready", "label": "AR 필터 연결 준비", "status": "done"},
]

BASE_POINTS = [
  {
    "id": "thin-skin-layer",
    "title": "얇고 맑은 피부결",
    "description": "커버를 두껍게 올리기보다 얼굴 중앙을 얇게 밝혀 투명한 인상을 먼저 만들어요.",
  },
  {
    "id": "soft-eye-line",
    "title": "부드러운 눈매 정리",
    "description": "강한 스모키보다 로즈 브라운 음영과 얇은 라인으로 또렷함을 만들어요.",
  },
  {
    "id": "pink-balance",
    "title": "핑크 계열의 연결감",
    "description": "볼과 입술의 핑크 톤을 맞춰 얼굴 전체가 한 가지 무드로 보이게 해요.",
  },
]

BASE_PALETTE = [
  {
    "id": "skin-semi-glow",
    "label": "피부",
    "hex": "#F0D6C8",
    "description": "얇고 맑은 아이보리 베이지의 투명한 윤기",
  },
  {
    "id": "eye-rose-brown",
    "label": "눈",
    "hex": "#B7776E",
    "description": "로즈 브라운 음영으로 눈매를 부드럽게 정리",
  },
  {
    "id": "cheek-clear-pink",
    "label": "볼",
    "hex": "#E59AA6",
    "description": "볼 중앙을 환하게 만드는 맑은 핑크 혈색",
  },
  {
    "id": "lip-clear-rose",
    "label": "입술",
    "hex": "#D96F83",
    "description": "중앙은 생기 있게, 외곽은 가볍게 번지는 로즈 핑크",
  },
]

BASE_AREA_GUIDES = [
  {
    "id": "skin",
    "label": "피부",
    "title": "얇고 맑은 세미 글로우 피부",
    "color": {"name": "아이보리 베이지", "hex": "#F0D6C8"},
    "texture": "얇게 밀착되고 은은한 윤기가 남는 세미 글로우",
    "quick_tip": "얼굴 중앙은 얇게 밝히고, 파우더는 무너지는 부분에만 소량 사용해요.",
    "analysis": "레퍼런스에서는 피부가 두껍게 덮인 느낌보다 맑고 균일하게 정돈된 느낌이 강해요.",
    "how_to": "스킨케어가 흡수된 뒤 쿠션이나 파운데이션을 얼굴 중앙부터 얇게 펴 발라 주세요. 잡티가 보이는 부분만 컨실러로 눌러 주고, 마지막에 파우더는 코 옆과 턱처럼 쉽게 무너지는 부분에만 소량 사용하면 투명함이 유지됩니다.",
    "professional_point": "한 번에 많이 올리면 레퍼런스의 맑은 결이 사라져요. 퍼프에 남은 양으로 가장자리를 풀고, 광은 콧대와 볼 앞처럼 빛이 닿는 면에만 남기는 게 핵심입니다.",
    "product_recommendation": {
      "category": "base",
      "search_query": "얇은 세미 글로우 쿠션 파운데이션",
      "reason": "피부결을 가리지 않고 맑게 정돈해야 하므로 얇게 밀착되는 글로우 베이스가 잘 맞아요.",
      "product": {
        "id": "product-hera-satin-glow-cushion",
        "brand_name": "헤라",
        "product_name": "새틴 글로우 쿠션",
        "price": 36000,
      },
    },
  },
  {
    "id": "eye",
    "label": "눈",
    "title": "로즈 브라운으로 여린 음영",
    "color": {"name": "로즈 브라운", "hex": "#B7776E"},
    "texture": "무펄 베이스 위에 아주 얇은 새틴 포인트 질감",
    "quick_tip": "베이지를 넓게 깔고 로즈 브라운은 쌍꺼풀 라인과 삼각존에만 얇게 얹어요.",
    "analysis": "눈두덩 전체가 진하게 칠해진 룩이 아니라 속눈썹 가까운 라인과 삼각존에 부드러운 음영이 모여 있어요.",
    "how_to": "밝은 베이지 톤을 눈두덩에 먼저 깔고, 로즈 브라운을 쌍꺼풀 라인과 삼각존 위주로 두 번 얇게 쌓아 주세요. 아이라인은 점막 가까이 얇게 그리고, 삼각존은 길게 빼기보다 살짝만 정리하면 부드러운 인상이 유지됩니다.",
    "professional_point": "경계가 보이면 성숙한 음영 메이크업처럼 보여요. 브러시에 남은 양으로 위쪽 경계를 풀어 눈을 뜬 상태에서도 색이 자연스럽게 이어지게 만들어 주세요.",
    "product_recommendation": {
      "category": "shadow",
      "search_query": "로즈 브라운 데일리 아이섀도우 팔레트",
      "reason": "베이스, 중간 음영, 삼각존 포인트를 한 팔레트에서 단계적으로 쌓기 좋아요.",
      "product": {
        "id": "product-dasique-neutral-palette",
        "brand_name": "데이지크",
        "product_name": "뉴트럴 브라운 팔레트",
        "price": 34000,
      },
    },
  },
  {
    "id": "brow",
    "label": "눈썹",
    "title": "결을 살린 소프트 브라운 눈썹",
    "color": {"name": "애쉬 브라운", "hex": "#6F5148"},
    "texture": "파우더리하고 뭉침 없는 자연스러운 결 표현",
    "quick_tip": "앞머리는 과하게 채우지 말고, 빈 곳만 짧은 선으로 메워 주세요.",
    "analysis": "눈썹은 각을 세우기보다 본래 결을 따라 부드럽게 채운 형태예요.",
    "how_to": "눈썹 앞머리는 브러시에 남은 양으로만 쓸어 주고, 비어 보이는 중간 부분부터 짧은 선을 여러 번 그려 채워 주세요. 꼬리는 아래로 꺾지 말고 눈매 흐름에 맞춰 살짝 길게 정리합니다.",
    "professional_point": "눈썹 색이 너무 검으면 핑크 계열의 맑은 분위기가 무거워져요. 머리색보다 반 톤 밝거나 회색빛이 도는 브라운을 고르면 전체 룩과 잘 이어집니다.",
    "product_recommendation": {
      "category": "liner",
      "search_query": "애쉬 브라운 슬림 아이브로우 펜슬",
      "reason": "눈썹 결을 한 올씩 채우는 룩이라 두꺼운 파우더보다 얇은 펜슬 타입이 잘 맞아요.",
      "product": {
        "id": "product-clio-slim-brow-pencil",
        "brand_name": "클리오",
        "product_name": "슬림 브로우 펜슬",
        "price": 12000,
      },
    },
  },
  {
    "id": "cheek",
    "label": "볼",
    "title": "맑게 퍼지는 핑크 혈색",
    "color": {"name": "클리어 핑크", "hex": "#E59AA6"},
    "texture": "경계가 흐린 파우더 블러 또는 크림을 얇게 섞은 질감",
    "quick_tip": "볼 중앙보다 살짝 위에 첫 터치를 두고 바깥쪽으로 넓게 풀어요.",
    "analysis": "볼은 동그랗게 찍힌 치크가 아니라 얼굴 중앙을 밝혀 주는 정도로 넓고 얇게 번져 있어요.",
    "how_to": "웃었을 때 올라오는 볼 중앙보다 살짝 위쪽에 첫 터치를 두고, 바깥쪽과 아래쪽으로 힘을 빼며 넓게 풀어 주세요. 한 번에 진하게 바르지 말고 거울에서 한 발 물러나 보며 두 번 정도만 얇게 쌓는 게 좋아요.",
    "professional_point": "치크 시작점이 코에 너무 가까우면 답답해 보여요. 눈동자 바깥 라인 근처부터 시작하면 사진처럼 맑고 정돈된 인상이 납니다.",
    "product_recommendation": {
      "category": "cheek",
      "search_query": "라이트 핑크 블러 치크",
      "reason": "볼 위에 뭉치지 않고 넓게 퍼져야 하므로 입자가 고운 라이트 핑크 블러셔가 잘 맞아요.",
      "product": {
        "id": "product-clio-lilac-cheek",
        "brand_name": "클리오",
        "product_name": "라일락 블러 치크",
        "price": 22000,
      },
    },
  },
  {
    "id": "lip",
    "label": "입술",
    "title": "맑은 로즈 핑크 생기 립",
    "color": {"name": "클리어 로즈 핑크", "hex": "#D96F83"},
    "texture": "촉촉하지만 과한 유리광이 아닌 수분 틴트 질감",
    "quick_tip": "입술 안쪽은 선명하게 채우고, 외곽은 손끝으로 부드럽게 흐려요.",
    "analysis": "입술은 얼굴에서 가장 생기가 모이는 포인트예요. 중앙 컬러가 살아 있고 외곽은 부드럽게 풀려 있습니다.",
    "how_to": "입술 안쪽에 먼저 컬러를 찍고 음파음파로 퍼뜨린 뒤, 면봉이나 손끝으로 외곽 경계를 가볍게 흐려 주세요. 입술선을 딱 맞춰 그리기보다 본래 라인을 살짝 따라가면 러블리한 분위기가 유지됩니다.",
    "professional_point": "치크와 같은 핑크 계열이지만 립은 한 단계 더 선명해야 얼굴 중심이 살아나요. 다만 외곽선을 딱 끊어 그리면 레퍼런스의 부드러움이 줄어듭니다.",
    "product_recommendation": {
      "category": "lip",
      "search_query": "맑은 로즈 핑크 촉촉한 틴트",
      "reason": "중앙은 선명하고 외곽은 자연스럽게 번지는 표현이 필요해서 수분감 있는 로즈 핑크 틴트가 좋아요.",
      "product": {
        "id": "product-amuse-dew-tint",
        "brand_name": "어뮤즈",
        "product_name": "듀 틴트",
        "price": 20000,
      },
    },
  },
  {
    "id": "contour",
    "label": "윤곽",
    "title": "거의 티 나지 않는 소프트 윤곽",
    "color": {"name": "라이트 토프 베이지", "hex": "#B99B8B"},
    "texture": "피부 위에 얇게 녹는 매트 파우더 질감",
    "quick_tip": "얼굴 외곽은 큰 브러시로 한 번만 쓸고, 하이라이트는 작은 면에만 얹어요.",
    "analysis": "윤곽은 강하게 깎는 방식이 아니라 얼굴 바깥 라인을 약하게 정리하는 정도예요.",
    "how_to": "쉐딩은 턱 끝이나 광대 아래를 진하게 칠하기보다 얼굴 외곽을 큰 브러시로 한 번 쓸어 주세요. 하이라이트는 콧대 전체가 아니라 콧등 중앙, 눈 밑 앞쪽, 입술산처럼 작은 면에만 살짝 얹는 게 좋습니다.",
    "professional_point": "핑크 러블리 룩에서 윤곽이 진하면 분위기가 무거워져요. 회색보다 베이지가 섞인 라이트 토프 계열을 고르고, 브러시에 묻은 양을 손등에서 한 번 털어낸 뒤 올리세요.",
    "product_recommendation": {
      "category": "shadow",
      "search_query": "라이트 토프 베이지 쉐딩 팔레트",
      "reason": "강한 컨투어보다 자연스러운 음영 정리가 필요해서 붉지 않은 라이트 토프 컬러가 잘 맞아요.",
      "product": {
        "id": "product-soft-contour-palette",
        "brand_name": "데이지크",
        "product_name": "소프트 컨투어 팔레트",
        "price": 26000,
      },
    },
  },
]


def _clean_text(value: Any) -> str:
  return " ".join(str(value or "").split()).strip()


def _get_value(source: dict[str, Any], *keys: str) -> Any:
  for key in keys:
    if key in source:
      return source[key]

  return None


def _fallback_area_by_id() -> dict[str, dict[str, Any]]:
  return {guide["id"]: guide for guide in BASE_AREA_GUIDES}


def _reference_text(payload: FilterExtractionAnalyzeRequest) -> str:
  request_payload = payload.request_payload if isinstance(payload.request_payload, dict) else {}
  parts = [
    payload.title,
    payload.reference_image_id,
    request_payload.get("referenceTitle"),
    request_payload.get("referenceImageId"),
  ]

  return " ".join(_clean_text(part) for part in parts if _clean_text(part)).lower()


def _resolve_look_title(payload: FilterExtractionAnalyzeRequest) -> str:
  reference_text = _reference_text(payload)

  if "뮤트" in reference_text or "muted" in reference_text:
    return "뮤트 로즈 인플루언서 메이크업"

  if "러블리" in reference_text or "배우" in reference_text or "lovely" in reference_text:
    return "맑은 핑크 배우상 메이크업"

  return "레퍼런스 이미지 메이크업"


def _resolve_tags(payload: FilterExtractionAnalyzeRequest) -> list[str]:
  reference_text = _reference_text(payload)

  if "뮤트" in reference_text or "muted" in reference_text:
    return ["#레퍼런스분석", "#뮤트로즈", "#세미글로우", "#부드러운음영"]

  return ["#레퍼런스분석", "#러블리핑크", "#세미글로우", "#부드러운눈매"]


def build_reference_makeup_extraction_payload(
  payload: FilterExtractionAnalyzeRequest,
) -> dict[str, Any]:
  title = _resolve_look_title(payload)
  tags = _resolve_tags(payload)

  extracted_makeup_look = {
    "id": f"reference-makeup-look-{_clean_text(payload.reference_image_id) or 'uploaded'}",
    "title": title,
    "subtitle": payload.subtitle or title,
    "tags": tags,
    "accuracy": 91,
    "look_dna": {
      "mood_keywords": ["러블리", "맑음", "부드러움"],
      "difficulty": "보통",
      "key_areas": ["볼", "입술", "눈"],
      "texture_balance": [
        {"id": "glow", "label": "세미 글로우", "value": 60, "color": "#F0D6C8"},
        {"id": "powder", "label": "파우더 블러", "value": 25, "color": "#E59AA6"},
        {"id": "watery", "label": "수분광", "value": 15, "color": "#D96F83"},
      ],
    },
    "palette": deepcopy(BASE_PALETTE),
    "points": deepcopy(BASE_POINTS),
    "area_guides": deepcopy(BASE_AREA_GUIDES),
  }

  return {
    "loading_steps": deepcopy(LOADING_STEPS),
    "extracted_makeup_look": extracted_makeup_look,
  }


def _normalize_tags(value: Any, fallback: list[str]) -> list[str]:
  raw_tags = value if isinstance(value, list) else []
  tags = []

  for tag in raw_tags:
    normalized = _clean_text(tag)

    if not normalized:
      continue

    tags.append(normalized if normalized.startswith("#") else f"#{normalized}")

  return (tags or fallback)[:4]


def _normalize_points(value: Any, fallback: list[dict[str, Any]]) -> list[dict[str, str]]:
  points = value if isinstance(value, list) else []
  normalized_points = []

  for index in range(3):
    raw = points[index] if index < len(points) and isinstance(points[index], dict) else {}
    fallback_point = fallback[index]
    normalized_points.append(
      {
        "id": _clean_text(_get_value(raw, "id")) or fallback_point["id"],
        "title": _clean_text(_get_value(raw, "title")) or fallback_point["title"],
        "description": _clean_text(_get_value(raw, "description")) or fallback_point["description"],
      },
    )

  return normalized_points


def _normalize_color(value: Any, fallback: dict[str, str]) -> dict[str, str]:
  color = value if isinstance(value, dict) else {}
  hex_value = _clean_text(_get_value(color, "hex")) or fallback["hex"]

  if not re.fullmatch(r"#[0-9A-Fa-f]{6}", hex_value):
    hex_value = fallback["hex"]

  return {
    "name": _clean_text(_get_value(color, "name")) or fallback["name"],
    "hex": hex_value.upper(),
  }


def _normalize_product_recommendation(
  value: Any,
  fallback: dict[str, Any],
  area_id: str,
) -> dict[str, Any]:
  recommendation = value if isinstance(value, dict) else {}
  fallback_category = fallback.get("category") or DEFAULT_CATEGORY_BY_AREA[area_id]
  category = _clean_text(_get_value(recommendation, "category")) or fallback_category

  if category not in PRODUCT_CATEGORIES:
    category = fallback_category

  return {
    **fallback,
    "category": category,
    "search_query": (
      _clean_text(_get_value(recommendation, "searchQuery", "search_query"))
      or fallback["search_query"]
    ),
    "reason": _clean_text(_get_value(recommendation, "reason")) or fallback["reason"],
  }


def _normalize_area_guide(raw: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
  area_id = fallback["id"]

  return {
    **fallback,
    "label": _clean_text(_get_value(raw, "label")) or fallback["label"],
    "title": _clean_text(_get_value(raw, "title")) or fallback["title"],
    "color": _normalize_color(_get_value(raw, "color"), fallback["color"]),
    "texture": _clean_text(_get_value(raw, "texture")) or fallback["texture"],
    "quick_tip": _clean_text(_get_value(raw, "quickTip", "quick_tip")) or fallback["quick_tip"],
    "analysis": _clean_text(_get_value(raw, "analysis")) or fallback["analysis"],
    "how_to": _clean_text(_get_value(raw, "howTo", "how_to")) or fallback["how_to"],
    "professional_point": (
      _clean_text(_get_value(raw, "professionalPoint", "professional_point"))
      or fallback["professional_point"]
    ),
    "product_recommendation": _normalize_product_recommendation(
      _get_value(raw, "productRecommendation", "product_recommendation"),
      fallback["product_recommendation"],
      area_id,
    ),
  }


def _normalize_area_guides(value: Any) -> list[dict[str, Any]]:
  raw_guides = value if isinstance(value, list) else []
  raw_by_id = {
    _clean_text(_get_value(guide, "id")): guide
    for guide in raw_guides
    if isinstance(guide, dict) and _clean_text(_get_value(guide, "id")) in AREA_IDS
  }
  fallback_by_id = _fallback_area_by_id()

  return [
    _normalize_area_guide(raw_by_id.get(area_id, {}), fallback_by_id[area_id])
    for area_id in AREA_IDS
  ]


def _normalize_palette(value: Any) -> list[dict[str, str]]:
  raw_palette = value if isinstance(value, list) else []
  normalized_palette = []

  for index, fallback in enumerate(BASE_PALETTE):
    raw = raw_palette[index] if index < len(raw_palette) and isinstance(raw_palette[index], dict) else {}
    hex_value = _clean_text(_get_value(raw, "hex")) or fallback["hex"]

    if not re.fullmatch(r"#[0-9A-Fa-f]{6}", hex_value):
      hex_value = fallback["hex"]

    normalized_palette.append(
      {
        "id": _clean_text(_get_value(raw, "id")) or fallback["id"],
        "label": _clean_text(_get_value(raw, "label")) or fallback["label"],
        "hex": hex_value.upper(),
        "description": _clean_text(_get_value(raw, "description")) or fallback["description"],
      },
    )

  return normalized_palette


def _normalize_accuracy(value: Any) -> int:
  try:
    accuracy = int(value)
  except (TypeError, ValueError):
    return 91

  return min(99, max(60, accuracy))


def _normalize_bedrock_payload(
  parsed: dict[str, Any],
  request_payload: FilterExtractionAnalyzeRequest,
) -> dict[str, Any]:
  fallback_payload = build_reference_makeup_extraction_payload(request_payload)
  fallback_look = fallback_payload["extracted_makeup_look"]
  raw_look = _get_value(parsed, "extractedMakeupLook", "extracted_makeup_look")
  raw_look = raw_look if isinstance(raw_look, dict) else parsed
  title = _clean_text(_get_value(raw_look, "title")) or fallback_look["title"]

  extracted_makeup_look = {
    **fallback_look,
    "title": title,
    "subtitle": _clean_text(_get_value(raw_look, "subtitle")) or title,
    "tags": _normalize_tags(_get_value(raw_look, "tags"), fallback_look["tags"]),
    "accuracy": _normalize_accuracy(_get_value(raw_look, "accuracy")),
    "palette": _normalize_palette(_get_value(raw_look, "palette")),
    "points": _normalize_points(_get_value(raw_look, "points"), fallback_look["points"]),
    "area_guides": _normalize_area_guides(
      _get_value(raw_look, "areaGuides", "area_guides"),
    ),
  }

  return {
    "loading_steps": deepcopy(LOADING_STEPS),
    "extracted_makeup_look": extracted_makeup_look,
  }


def _missing_bedrock_output_fields(parsed: dict[str, Any]) -> list[str]:
  if not parsed:
    return ["extractedMakeupLook"]

  raw_look = _get_value(parsed, "extractedMakeupLook", "extracted_makeup_look")

  if not isinstance(raw_look, dict) or not raw_look:
    return ["extractedMakeupLook"]

  missing: list[str] = []

  for field, aliases in (
    ("title", ("title",)),
    ("tags", ("tags",)),
    ("accuracy", ("accuracy",)),
    ("points", ("points",)),
    ("palette", ("palette",)),
    ("areaGuides", ("areaGuides", "area_guides")),
  ):
    value = _get_value(raw_look, *aliases)

    if value is None or value == "" or value == [] or value == {}:
      missing.append(field)

  area_guides = _get_value(raw_look, "areaGuides", "area_guides")
  guide_by_id = {
    _clean_text(guide.get("id")): guide
    for guide in area_guides
    if isinstance(guide, dict) and _clean_text(guide.get("id"))
  } if isinstance(area_guides, list) else {}

  for area_id in AREA_IDS:
    guide = guide_by_id.get(area_id)

    if not guide:
      missing.append(f"areaGuides.{area_id}")
      continue

    for field, aliases in (
      ("title", ("title",)),
      ("analysis", ("analysis",)),
      ("howTo", ("howTo", "how_to")),
      ("professionalPoint", ("professionalPoint", "professional_point")),
      ("productRecommendation", ("productRecommendation", "product_recommendation")),
    ):
      value = _get_value(guide, *aliases)

      if value is None or value == "" or value == {}:
        missing.append(f"areaGuides.{area_id}.{field}")

  return missing


def _bedrock_usage(response_payload: dict[str, Any]) -> tuple[int, int, float]:
  usage = response_payload.get("usage")
  usage = usage if isinstance(usage, dict) else {}
  input_tokens = int(usage.get("input_tokens") or usage.get("inputTokens") or 0)
  output_tokens = int(usage.get("output_tokens") or usage.get("outputTokens") or 0)
  estimated_cost_usd = (
    input_tokens * REFERENCE_BEDROCK_INPUT_USD_PER_MILLION_TOKENS
    + output_tokens * REFERENCE_BEDROCK_OUTPUT_USD_PER_MILLION_TOKENS
  ) / 1_000_000
  return input_tokens, output_tokens, estimated_cost_usd


class ReferenceMakeupBedrockService:
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
      "config": Config(connect_timeout=30, read_timeout=150, retries={"max_attempts": 1}),
    }

    if self.settings.aws_access_key_id and self.settings.aws_secret_access_key:
      client_kwargs.update(
        {
          "aws_access_key_id": self.settings.aws_access_key_id,
          "aws_secret_access_key": self.settings.aws_secret_access_key,
        },
      )

    return boto3.client("bedrock-runtime", **client_kwargs)

  def _extract_s3_location(self, payload: dict[str, Any]) -> tuple[str, str]:
    bucket = _clean_text(payload.get("bucket"))
    object_key = _clean_text(payload.get("objectKey") or payload.get("object_key"))

    if bucket and object_key:
      return bucket, object_key.lstrip("/")

    for key in ("imageUrl", "cdnUrl", "image_url", "previewUrl"):
      image_url = _clean_text(payload.get(key))

      if image_url.startswith("s3://"):
        bucket_key = image_url.removeprefix("s3://")
        if "/" in bucket_key:
          return tuple(bucket_key.split("/", 1))  # type: ignore[return-value]

    raise AppError(
      400,
      "REFERENCE_IMAGE_S3_REQUIRED",
      "Reference makeup extraction requires an uploaded S3 image.",
    )

  def _infer_content_type(self, payload: dict[str, Any]) -> str:
    content_type = _clean_text(payload.get("contentType") or payload.get("content_type"))

    if content_type.startswith("image/"):
      return content_type

    object_key = _clean_text(payload.get("objectKey") or payload.get("object_key")).lower()

    if object_key.endswith(".png"):
      return "image/png"

    if object_key.endswith(".webp"):
      return "image/webp"

    return "image/jpeg"

  def _read_reference_image_bytes(self, payload: FilterExtractionAnalyzeRequest) -> bytes:
    request_payload = payload.request_payload if isinstance(payload.request_payload, dict) else {}
    bucket, object_key = self._extract_s3_location(request_payload)
    started_at = time.monotonic()
    logger.info("[aura:reference-bedrock] image-read:start bucket=%s key=%s", bucket, object_key)
    image_object = self._s3_client().get_object(Bucket=bucket, Key=object_key)
    image_bytes = image_object["Body"].read()
    logger.info(
      "[aura:reference-bedrock] image-read:success bytes=%s durationMs=%s",
      len(image_bytes),
      round((time.monotonic() - started_at) * 1000),
    )

    return image_bytes

  def _build_prompt(self, payload: FilterExtractionAnalyzeRequest) -> str:
    metadata = {
      key: value
      for key, value in (payload.request_payload or {}).items()
      if key not in {"sourceUri"}
    }
    requested_title = _resolve_look_title(payload)

    return f"""
너는 K-뷰티 메이크업 아티스트이자 뷰티 컨설턴트다.

입력된 이미지는 사용자의 얼굴이 아니라 메이크업 레퍼런스 이미지다.
절대 사용자 얼굴 맞춤 처방을 하지 말고, 이미지에 보이는 메이크업을 기준으로 따라 하는 방법만 분석한다.

분석 목표:
- 레퍼런스 이미지의 메이크업 무드, 색감, 질감, 부위별 표현 방식을 추출한다.
- 초보자도 순서대로 따라 할 수 있게 설명한다.
- 동시에 전문 메이크업 아티스트도 납득할 수 있도록 순서, 위치, 농도, 질감, 메이크업 마무리, 제품 선택 기준을 구체적으로 쓴다.

금지:
- 실존 인물 닮은꼴 판정 금지.
- 사용자 얼굴에 맞는 처방 금지.
- 피부톤/얼굴형 개인 맞춤 추천 금지.
- '이 사람에게 어울린다' 식 표현 금지.
- 이미지에 보이지 않는 내용을 단정하지 말 것.
- '처방'이라는 단어를 쓰지 말 것.
- 실제 제품명은 만들지 말 것. 제품은 searchQuery와 reason만 작성한다.

문체:
- 뷰티 컨설턴트형.
- 친절하지만 과장 광고처럼 쓰지 말 것.
- 문장은 짧게, 정보는 구체적으로.
- 한국어로만 작성한다.

반드시 JSON 객체 하나만 반환한다. 마크다운 코드블록, 설명 문장, 주석은 금지한다.
Top-level key는 extractedMakeupLook 하나만 둔다.

출력 스키마:
{{
  "extractedMakeupLook": {{
    "title": "{requested_title}",
    "subtitle": "{requested_title}",
    "tags": ["#레퍼런스분석"],
    "accuracy": 90,
    "points": [
      {{"id": "point-1", "title": "핵심 제목", "description": "핵심 설명"}},
      {{"id": "point-2", "title": "핵심 제목", "description": "핵심 설명"}},
      {{"id": "point-3", "title": "핵심 제목", "description": "핵심 설명"}}
    ],
    "palette": [
      {{"id": "skin", "label": "피부", "hex": "#F0D6C8", "description": "대표 색감 설명"}},
      {{"id": "eye", "label": "눈", "hex": "#B7776E", "description": "대표 색감 설명"}},
      {{"id": "cheek", "label": "볼", "hex": "#E59AA6", "description": "대표 색감 설명"}},
      {{"id": "lip", "label": "입술", "hex": "#D96F83", "description": "대표 색감 설명"}}
    ],
    "areaGuides": [
      {{
        "id": "skin",
        "label": "피부",
        "title": "부위별 제목",
        "color": {{"name": "색상명", "hex": "#F0D6C8"}},
        "texture": "질감 설명",
        "quickTip": "한 줄 핵심",
        "analysis": "이미지 기준으로 보이는 표현 방식",
        "howTo": "1. 첫 단계 설명\\n2. 두 번째 단계 설명\\n3. 세 번째 단계 설명\\n4. 마무리 단계 설명",
        "professionalPoint": "메이크업 마무리에서 완성도를 높이는 위치, 농도, 질감, 도구 사용 포인트",
        "productRecommendation": {{
          "category": "base",
          "searchQuery": "추천 제품 검색어",
          "reason": "이 기준으로 제품을 고르는 이유"
        }}
      }}
    ]
  }}
}}

areaGuides는 반드시 이 순서와 id로 6개를 모두 작성한다:
1. skin / 피부 / category base
2. eye / 눈 / category shadow
3. brow / 눈썹 / category liner
4. cheek / 볼 / category cheek
5. lip / 입술 / category lip
6. contour / 윤곽 / category shadow

각 부위의 howTo와 professionalPoint는 서로 다른 내용을 써라.
howTo는 반드시 1. 2. 3. 4. 번호가 붙은 4단계 순서 가이드로 작성한다. professionalPoint는 '메이크업 마무리' 관점에서 완성도를 높이는 디테일을 작성한다.
메이크업 핵심 points는 정확히 3개만 작성한다.
tags는 1개에서 4개 사이로 작성한다.
색상 hex는 이미지에서 관찰되는 색을 근사한다.

요청 메타데이터:
{json.dumps(metadata, ensure_ascii=False)}
""".strip()

  def _extract_bedrock_tool_input(self, response_payload: dict[str, Any]) -> dict[str, Any] | None:
    content = response_payload.get("content")

    if not isinstance(content, list):
      return None

    for part in content:
      if not isinstance(part, dict):
        continue

      if part.get("type") != "tool_use" or part.get("name") != REFERENCE_MAKEUP_REPORT_TOOL_NAME:
        continue

      tool_input = part.get("input")
      if isinstance(tool_input, dict):
        return tool_input

    return None

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

  def _parse_json_output(self, output_text: str) -> dict[str, Any]:
    normalized = output_text.strip()
    fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", normalized, re.DOTALL)

    if fence_match:
      normalized = fence_match.group(1).strip()

    if not normalized.startswith("{"):
      object_match = re.search(r"\{.*\}", normalized, re.DOTALL)
      if object_match:
        normalized = object_match.group(0).strip()

    try:
      parsed = json.loads(normalized)
    except json.JSONDecodeError as exc:
      preview = normalized[:600]
      logger.warning(
        "[aura:reference-bedrock] output:parse-failed length=%s error=%s preview=%s",
        len(normalized),
        str(exc),
        preview,
      )
      raise AppError(
        502,
        "REFERENCE_BEDROCK_OUTPUT_PARSE_FAILED",
        "Bedrock reference makeup extraction did not return valid JSON.",
        {
          "jsonError": str(exc),
          "outputLength": len(normalized),
          "outputPreview": preview,
        },
      ) from exc

    if not isinstance(parsed, dict):
      raise AppError(
        502,
        "REFERENCE_BEDROCK_OUTPUT_INVALID",
        "Bedrock reference makeup extraction returned an unexpected result shape.",
      )

    return parsed

  def _analyze_sync(
    self,
    payload: FilterExtractionAnalyzeRequest,
    image_bytes: bytes,
    content_type: str | None = None,
  ) -> dict[str, Any]:
    model_id = self.settings.effective_analysis_model_id

    if not model_id:
      raise AppError(
        503,
        "BEDROCK_ANALYSIS_NOT_CONFIGURED",
        "A Bedrock Claude model ID or inference profile ID is required.",
      )

    request_payload = payload.request_payload if isinstance(payload.request_payload, dict) else {}
    content_type = content_type or self._infer_content_type(request_payload)
    image_base64 = base64.b64encode(image_bytes).decode("utf-8")
    started_at = time.monotonic()
    logger.info(
      "[aura:reference-bedrock] analyze:start model=%s region=%s",
      model_id,
      self.settings.effective_bedrock_analysis_region,
    )
    prompt = self._build_prompt(payload)
    token_limits = (REFERENCE_BEDROCK_MAX_TOKENS, REFERENCE_BEDROCK_RETRY_MAX_TOKENS)

    for attempt, max_tokens in enumerate(token_limits, start=1):
      retry_instruction = ""

      if attempt > 1:
        retry_instruction = (
          "\n\nThe previous response exceeded the output limit. "
          "Return every required field, but keep each string concise."
        )

      response = self._bedrock_runtime_client().invoke_model(
        modelId=model_id,
        body=json.dumps(
          {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": 0.2,
            "system": "You are a practical K-beauty reference makeup analyst. Use the provided tool to submit structured JSON only.",
            "tools": [REFERENCE_MAKEUP_REPORT_TOOL],
            "tool_choice": {"type": "tool", "name": REFERENCE_MAKEUP_REPORT_TOOL_NAME},
            "messages": [
              {
                "role": "user",
                "content": [
                  {"type": "text", "text": prompt + retry_instruction},
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
      parsed = self._extract_bedrock_tool_input(response_payload)
      output_text = self._extract_bedrock_output_text(response_payload)
      stop_reason = response_payload.get("stop_reason") or response_payload.get("stopReason")
      input_tokens, output_tokens, estimated_cost_usd = _bedrock_usage(response_payload)
      output_length = len(json.dumps(parsed, ensure_ascii=False)) if parsed is not None else len(output_text)
      logger.info(
        "[aura:reference-bedrock] output:received attempt=%s chars=%s stopReason=%s mode=%s",
        attempt,
        output_length,
        stop_reason,
        "tool" if parsed is not None else "text",
      )
      logger.info(
        "[aura:reference-bedrock] usage attempt=%s inputTokens=%s outputTokens=%s estimatedCostUsd=%.6f",
        attempt,
        input_tokens,
        output_tokens,
        estimated_cost_usd,
      )

      if parsed is None and output_text:
        try:
          parsed = self._parse_json_output(output_text)
        except AppError:
          if attempt == 1 and stop_reason == "max_tokens":
            logger.warning(
              "[aura:reference-bedrock] output:retry attempt=%s reason=max_tokens nextMaxTokens=%s",
              attempt,
              token_limits[1],
            )
            continue
          raise

      missing_fields = (
        ["extractedMakeupLook"]
        if parsed is None
        else _missing_bedrock_output_fields(parsed)
      )

      if not missing_fields:
        logger.info(
          "[aura:reference-bedrock] analyze:success attempts=%s durationMs=%s",
          attempt,
          round((time.monotonic() - started_at) * 1000),
        )
        return _normalize_bedrock_payload(parsed, payload)

      if attempt == 1 and stop_reason == "max_tokens":
        logger.warning(
          "[aura:reference-bedrock] output:retry attempt=%s reason=max_tokens missingFields=%s nextMaxTokens=%s",
          attempt,
          missing_fields,
          token_limits[1],
        )
        continue

      raise AppError(
        502,
        "REFERENCE_BEDROCK_OUTPUT_INCOMPLETE",
        "Bedrock reference makeup extraction returned an incomplete response.",
        {
          "attempt": attempt,
          "stopReason": stop_reason,
          "missingFields": missing_fields,
          "inputTokens": input_tokens,
          "outputTokens": output_tokens,
        },
      )

    raise AssertionError("Reference Bedrock retry loop exited unexpectedly.")

  async def analyze(self, payload: FilterExtractionAnalyzeRequest) -> dict[str, Any]:
    image_bytes = await asyncio.to_thread(self._read_reference_image_bytes, payload)

    try:
      processed = await asyncio.to_thread(process_image_bytes, image_bytes)
    except MediaPostprocessError as exc:
      raise AppError(
        400,
        "REFERENCE_SOURCE_IMAGE_INVALID",
        "The reference source image is invalid or unsupported.",
      ) from exc

    logger.info(
      "[aura:reference-bedrock] image-sanitize:success bytes=%s->%s contentType=%s exifRemoved=%s",
      len(image_bytes),
      len(processed.body),
      processed.content_type,
      processed.exif_removed,
    )
    return await asyncio.to_thread(
      self._analyze_sync,
      payload,
      processed.body,
      processed.content_type,
    )

async def build_reference_makeup_extraction_payload_for_request(
  payload: FilterExtractionAnalyzeRequest,
  settings: Settings,
) -> tuple[dict[str, Any], str, dict[str, Any] | None]:
  if not payload.run_ai:
    return build_reference_makeup_extraction_payload(payload), "disabled_fallback", None

  try:
    return await ReferenceMakeupBedrockService(settings).analyze(payload), "bedrock_completed", None
  except AppError as exc:
    logger.warning(
      "[aura:reference-bedrock] analyze:app-error code=%s details=%s",
      exc.code,
      exc.details,
    )
    if exc.code in REFERENCE_BEDROCK_FATAL_OUTPUT_CODES:
      raise
    return (
      build_reference_makeup_extraction_payload(payload),
      "bedrock_failed_fallback",
      {"code": exc.code, "message": exc.message, "details": exc.details},
    )
  except (BotoCoreError, ClientError) as exc:
    logger.warning(
      "[aura:reference-bedrock] analyze:aws-error reason=%s message=%s",
      exc.__class__.__name__,
      str(exc),
    )
    return (
      build_reference_makeup_extraction_payload(payload),
      "bedrock_failed_fallback",
      {"code": "BEDROCK_INVOCATION_FAILED", "message": str(exc)},
    )
  except Exception as exc:  # noqa: BLE001 - keep the mobile flow alive during prompt iteration.
    logger.exception("[aura:reference-bedrock] analyze:failed")
    return (
      build_reference_makeup_extraction_payload(payload),
      "bedrock_failed_fallback",
      {"code": "REFERENCE_BEDROCK_FAILED", "message": exc.__class__.__name__},
    )


def _map_shopping_product(product: dict[str, Any]) -> dict[str, Any] | None:
  product_id = _clean_text(product.get("id"))
  product_name = _clean_text(product.get("productName"))

  if not product_id or not product_name:
    return None

  return {
    "id": product_id,
    "brand_name": _clean_text(product.get("brandName")) or "NAVER 쇼핑",
    "product_name": product_name,
    "price": int(product.get("price") or 0),
    "image_url": _clean_text(product.get("imageUrl")) or None,
    "purchase_url": _clean_text(product.get("purchaseUrl")) or None,
  }


def _text_list(value: Any) -> list[str]:
  values = value if isinstance(value, list) else []
  return [_clean_text(item) for item in values if _clean_text(item)]


def _build_reference_product_profile(
  extracted_look: dict[str, Any],
  guide: dict[str, Any],
) -> dict[str, Any]:
  recommendation = guide.get("product_recommendation")
  recommendation = recommendation if isinstance(recommendation, dict) else {}
  color = guide.get("color")
  color = color if isinstance(color, dict) else {}
  points = extracted_look.get("points") if isinstance(extracted_look, dict) else []
  palette = extracted_look.get("palette") if isinstance(extracted_look, dict) else []
  point_texts = []

  if isinstance(points, list):
    for point in points:
      if isinstance(point, dict):
        point_texts.append(" ".join(
          part for part in (
            _clean_text(point.get("title")),
            _clean_text(point.get("description")),
          ) if part
        ))

  palette_hexes = []
  if isinstance(palette, list):
    for item in palette:
      if isinstance(item, dict) and _clean_text(item.get("hex")):
        palette_hexes.append(_clean_text(item.get("hex")))

  search_query = _clean_text(
    recommendation.get("search_query") or recommendation.get("searchQuery"),
  )
  guide_label = _clean_text(guide.get("label"))
  guide_title = _clean_text(guide.get("title"))
  color_name = _clean_text(color.get("name"))
  texture = _clean_text(guide.get("texture"))
  quick_tip = _clean_text(guide.get("quick_tip") or guide.get("quickTip"))
  analysis = _clean_text(guide.get("analysis"))
  how_to = _clean_text(guide.get("how_to") or guide.get("howTo"))
  professional_point = _clean_text(
    guide.get("professional_point") or guide.get("professionalPoint"),
  )
  reason = _clean_text(recommendation.get("reason"))
  title = _clean_text(extracted_look.get("title"))
  subtitle = _clean_text(extracted_look.get("subtitle"))
  tags = _text_list(extracted_look.get("tags"))
  profile_text = " ".join(
    part for part in (
      title,
      subtitle,
      guide_label,
      guide_title,
      color_name,
      texture,
      quick_tip,
      analysis,
      how_to,
      professional_point,
      search_query,
      reason,
      *point_texts,
      *tags,
    ) if part
  )

  return {
    "recommendedMood": title,
    "summary": profile_text,
    "shortSummary": " ".join(part for part in (guide_title, quick_tip, search_query) if part),
    "tags": [*tags, guide_label, color_name, texture, search_query],
    "makeupGuideline": {
      "area": guide_label,
      "title": guide_title,
      "color": color_name,
      "texture": texture,
      "howTo": how_to,
      "professionalPoint": professional_point,
      "productReason": reason,
    },
    "recommendedMakeups": [
      {
        "title": title,
        "subtitle": subtitle,
        "description": profile_text,
        "tags": [*tags, search_query, color_name, texture],
        "palette": palette_hexes,
      },
    ],
  }


async def enrich_reference_makeup_products(
  db: Database,
  settings: Settings,
  extraction_payload: dict[str, Any],
) -> tuple[dict[str, Any], str]:
  extracted_look = extraction_payload.get("extracted_makeup_look")
  area_guides = extracted_look.get("area_guides") if isinstance(extracted_look, dict) else None

  if not isinstance(area_guides, list) or not isinstance(extracted_look, dict):
    return extraction_payload, "fallback"

  product_source = "fallback"
  recommendation_cache: dict[tuple[str, str], dict[str, Any] | None] = {}

  for guide in area_guides:
    if not isinstance(guide, dict):
      continue

    recommendation = guide.get("product_recommendation")
    if not isinstance(recommendation, dict):
      continue

    category = _clean_text(recommendation.get("category"))
    search_query = _clean_text(
      recommendation.get("search_query") or recommendation.get("searchQuery"),
    )

    if not category:
      continue

    cache_key = (category, search_query)
    mapped_product = recommendation_cache.get(cache_key)

    if cache_key not in recommendation_cache:
      try:
        recommendation_data, source = await build_product_recommendation_data(
          db,
          settings,
          category,
          profile_override=_build_reference_product_profile(extracted_look, guide),
          query_override=search_query,
        )
      except Exception as exc:  # noqa: BLE001 - product enrichment must not fail report generation.
        logger.warning(
          "[aura:reference-products] enrich:failed category=%s query=%s error=%s",
          category,
          search_query,
          exc.__class__.__name__,
        )
        recommendation_cache[cache_key] = None
        continue

      products = recommendation_data.get("products")
      first_product = products[0] if isinstance(products, list) and products else None
      mapped_product = _map_shopping_product(first_product or {}) if isinstance(first_product, dict) else None
      recommendation_cache[cache_key] = mapped_product

      if mapped_product and source != "fallback":
        product_source = source

    if mapped_product:
      recommendation["product"] = mapped_product

  return extraction_payload, product_source