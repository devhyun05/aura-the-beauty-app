import asyncio
from difflib import SequenceMatcher
from hashlib import sha256
import json
import logging
import re
import threading
import time
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import (
  ClientError,
  ParamValidationError,
  ReadTimeoutError,
  UnauthorizedSSOTokenError,
)
from pydantic import ValidationError

from app.core.errors import AppError
from app.core.settings import Settings
from app.schemas.makeup_recommendation import (
  AI_PICK_OPTION_ID,
  AI_PICK_OPTION_LABEL,
  GeneratedMakeupRecommendation,
  GeneratedMakeupRecommendationV2,
  GeneratedQuestions,
  NormalizedCustomSituation,
)
from app.services.makeup_ai_observability import emit_ai_metric
from app.services.makeup_recommendation_fit import (
  finalize_recommendation_metadata,
)
from app.services.makeup_recommendation_prompt import (
  CUSTOM_NORMALIZATION_SYSTEM_PROMPT,
  QUESTION_V2_SYSTEM_PROMPT,
  RECOMMENDATION_V2_SYSTEM_PROMPT,
  build_custom_normalization_prompt,
  build_question_prompt,
  build_recommendation_prompt,
  sanitize_recommendation_context,
)
from app.services.makeup_recommendation_recipe import enrich_makeup_application_plans
from app.services.makeup_recommendation_timing import (
  resolve_prep_time_budget_minutes,
)


logger = logging.getLogger(__name__)

BEDROCK_CONVERSE_CONFIG = Config(
  read_timeout=50,
  connect_timeout=10,
  retries={"max_attempts": 1, "mode": "standard"},
)
BEDROCK_LONG_FORM_CONVERSE_CONFIG = Config(
  # A three-look recommendation streams a substantially larger tool payload
  # than scenario normalization or follow-up questions. Keep the short-form
  # fail-fast boundary while allowing the report request to finish inside the
  # mobile client's existing 180-second generation timeout.
  read_timeout=110,
  connect_timeout=10,
  retries={"max_attempts": 1, "mode": "standard"},
)


STRUCTURED_RESPONSE_MODELS = {
  CUSTOM_NORMALIZATION_SYSTEM_PROMPT: (
    "normalize_makeup_situation",
    NormalizedCustomSituation,
  ),
  QUESTION_V2_SYSTEM_PROMPT: (
    "generate_makeup_questions",
    GeneratedQuestions,
  ),
  RECOMMENDATION_V2_SYSTEM_PROMPT: (
    "generate_makeup_recommendation",
    GeneratedMakeupRecommendationV2,
  ),
}

BEDROCK_TOOL_SCHEMA_UNSUPPORTED_KEYS = {
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "maxItems",
  "maxLength",
  "maximum",
  "minItems",
  "minLength",
  "minimum",
  "multipleOf",
  "pattern",
}
MAKEUP_RECOMMENDATION_REQUIRED_AREAS = ("base", "brow", "eye", "cheek", "lip")
MAKEUP_RECOMMENDATION_ROLE_ORDER = ("anchor",)
MAKEUP_RECOMMENDATION_AREA_LABELS = {
  "base": "베이스",
  "brow": "브로우",
  "eye": "아이",
  "cheek": "치크",
  "lip": "립",
}
MAKEUP_RECOMMENDATION_AREA_FALLBACK_COLORS = {
  "base": ("뉴트럴 베이지", "#D9B49A"),
  "brow": ("내추럴 브라운", "#795548"),
  "eye": ("소프트 토프", "#9B7F74"),
  "cheek": ("로지 피치", "#D98E8E"),
  "lip": ("뮤티드 로즈", "#A85D68"),
}


QUESTION_SYSTEM_PROMPT = """너는 사용자가 직접 메이크업을 설계하게 만드는 설문지가 아니라, 사용자가 원하는 장면과 캐릭터를 발견하도록 돕는 재치 있는 에디토리얼 디렉터다.

질문의 목적은 색상, 제품, 제형, 아이라인 형태 같은 메이크업 사양을 사용자에게 결정시키는 것이 아니다. 사용자는 원하는 서사만 고르고, 구체적인 메이크업 방법은 AI가 나중에 스스로 설계해야 한다.

다음 네 가지 큰 방향에서, 선택한 카드에 이미 답이 없는 것만 골라 보통 1~2개, 최대 3개의 질문을 만든다.
- 어디에서 어떻게 보이고 싶은지
- 어떤 분위기가 끌리는지
- 평소보다 얼마나 과감해지고 싶은지
- 시간과 난이도를 어느 정도 감수할지

질문 규칙:
- 선택한 카드의 설정을 이어 다음 장면을 고르는 느낌이 들게 한다. 분류표나 피부 문진표가 아니라 짧은 인터뷰처럼 재미있어야 한다.
- 각 질문의 선택지 세 개는 단 하나의 의미 기준을 공유하고 서로 배타적이어야 한다. 사용자가 두 선택지에 동시에 해당하지 않게 한다.
- 선택지는 구체적인 장면, 태도, 캐릭터 또는 변화 폭을 짧고 생생하게 쓴다.
- 답에 따라 최종 추천 세 가지의 콘셉트와 서사가 크게 달라져야 한다.
- 색상, 질감, 강조 부위, 제품 종류, 도구와 테크닉을 직접 고르게 하지 않는다.
- '워터프루프 아이라이너 + 롱래스팅 섀도우'처럼 완성 레시피를 선택지로 제시하지 않는다.
- '입술 색상은 어떤 톤'처럼 사용자가 컬러 디렉터 역할을 하게 만들지 않는다.
- 피부톤, 피부 밝기, 언더톤, 퍼스널컬러, 얼굴형, 피부 고민을 묻지 않는다. 이것은 추천을 설계할 AI의 일이다.
- '밝은 톤/중간 톤/어두운 톤/쿨 톤/웜 톤'은 밝기와 언더톤이라는 다른 기준을 섞은 금지 예시다.
- 선택한 카드 문구와 내부 의도에 이미 드러난 상황은 반복해서 묻지 않는다.
- 자연스럽게/은은하게/부드럽게처럼 의미가 겹치는 선택지를 함께 쓰지 않는다.
- '어떤 톤이 좋아요?', '어디를 강조할까요?' 같은 예측 가능한 메이크업 설문을 금지한다.
- 성별, 나이, 외모 결점, 피부색의 우열을 추정하거나 암시하지 않는다.
- 질문은 짧고 자연스러운 한국어 존댓말로 쓴다.
- 선택지는 질문당 정확히 4개다. id와 label이 중복되지 않는 서로 배타적인 서사 선택지 3개 다음, 마지막은 반드시 {\"id\":\"ai_pick\",\"label\":\"AI가 골라줘\"} 하나뿐이어야 한다.
- id는 고유한 영문 snake_case로 쓴다.

좋은 질문 예시:
- 어디에서 어떻게 보이고 싶어요?
- 어떤 분위기가 끌리나요?
- 평소보다 얼마나 과감해질까요?
- 오늘은 어느 정도 공들일 수 있어요?

재미있는 선택지 예시:
- 오늘의 반전은 어느 쪽이에요? / '조용히 시선 끌기', '등장부터 장면 만들기', '돌아선 뒤 여운 남기기'
- 사진 속 나는 어떤 인물이었으면 해요? / '여유 있는 주인공', '조용한 신스틸러', '우연히 잡힌 슈퍼스타'

설명이나 마크다운 없이 유효한 JSON 객체만 반환한다."""


SCENARIO_COPY_EXAMPLES = (
  "공항 출국 레전드",
  "점 하나 찍고 컴백",
  "증명사진 잘 나오기",
  "나다운 프로필 사진",
  "성수동 느좋 감성",
  "출근길에 번따",
  "내 얼굴에 서사 한 방울",
  "밤샘의 흔적만 지우고 출근",
  "첫 출근인데 이미 에이스",
  "약속 없이도 특별한 기분",
)
SCENARIO_GENERIC_WORDS = ("메이크업", "스타일", "분위기", "느낌", "감성", "무드", "사진", "오늘", "하루", "룩")
SCENARIO_UNSAFE_PATTERNS = (
  "못생",
  "추한",
  "추해",
  "뚱뚱",
  "살빼",
  "하얗게바꿔",
  "얼굴을작게",
  "성형",
  "남자답",
  "여자답",
  "여신",
  "남신",
  "인종",
  "민족",
  "장애",
  "효과보장",
  "반드시예뻐",
)


def _scenario_copy_key(text: str) -> str:
  normalized = text.casefold()
  for word in SCENARIO_GENERIC_WORDS:
    normalized = normalized.replace(word, "")
  return re.sub(r"[^0-9a-z가-힣]", "", normalized)


def _scenario_copy_is_similar(left: str, right: str) -> bool:
  raw_left = re.sub(r"[^0-9a-z가-힣]", "", left.casefold())
  raw_right = re.sub(r"[^0-9a-z가-힣]", "", right.casefold())
  if raw_left and raw_left == raw_right:
    return True
  left_key = _scenario_copy_key(left)
  right_key = _scenario_copy_key(right)
  if not left_key or not right_key:
    return False
  if left_key == right_key:
    return True
  shorter, longer = sorted((left_key, right_key), key=len)
  if len(shorter) >= 4 and shorter in longer:
    return True
  return SequenceMatcher(None, left_key, right_key).ratio() >= 0.78


def _scenario_copy_is_safe(text: str, seed_prompt: str, tags: list[Any] | None = None) -> bool:
  combined = "".join([text, seed_prompt, *[str(tag) for tag in tags or []]]).casefold()
  normalized = re.sub(r"\s+", "", combined)
  return not any(pattern in normalized for pattern in SCENARIO_UNSAFE_PATTERNS)


def apply_refinement_contract(
  previous: dict[str, Any],
  generated: dict[str, Any],
  refinement: str,
) -> dict[str, Any]:
  image_fields = {"imageUrl", "imageAsset", "imageStatus", "imageError"}
  generated_looks = generated.get("looks") if isinstance(generated.get("looks"), list) else []
  clean_generated = [
    {key: value for key, value in look.items() if key not in image_fields}
    for look in generated_looks
    if isinstance(look, dict)
  ]
  if refinement != "replaceProducts":
    return {**generated, "looks": clean_generated}

  previous_looks = previous.get("looks") if isinstance(previous.get("looks"), list) else []
  generated_by_role = {look.get("role"): look for look in clean_generated}
  merged = []
  for previous_look in previous_looks:
    if not isinstance(previous_look, dict):
      continue
    replacement = generated_by_role.get(previous_look.get("role"), {})
    preserved = {
      key: value
      for key, value in previous_look.items()
      if key not in image_fields | {"products", "areaGuides"}
    }
    previous_guides = (
      previous_look.get("areaGuides")
      if isinstance(previous_look.get("areaGuides"), list)
      else []
    )
    replacement_guides = (
      replacement.get("areaGuides")
      if isinstance(replacement.get("areaGuides"), list)
      else []
    )
    replacement_by_area = {
      guide.get("area"): guide
      for guide in replacement_guides
      if isinstance(guide, dict)
    }
    merged_guides: list[dict[str, Any]] = []
    for previous_guide in previous_guides:
      if not isinstance(previous_guide, dict):
        continue
      guide_replacement = replacement_by_area.get(previous_guide.get("area"), {})
      guide_base = {
        key: value
        for key, value in previous_guide.items()
        if key not in {"products", "alternatives"}
      }
      merged_guides.append(
        {
          **guide_base,
          "products": guide_replacement.get("products", previous_guide.get("products", [])),
          "alternatives": guide_replacement.get(
            "alternatives",
            previous_guide.get("alternatives", []),
          ),
        },
      )
    merged.append(
      {
        **preserved,
        **({"areaGuides": merged_guides} if previous_guides else {}),
        "products": replacement.get("products", previous_look.get("products", [])),
      },
    )
  return {**generated, "looks": merged}

def _strict_json_schema(value: Any) -> Any:
  """Close object schemas while preserving the Pydantic contract structure."""
  if isinstance(value, list):
    return [_strict_json_schema(item) for item in value]
  if not isinstance(value, dict):
    return value

  normalized = {
    key: _strict_json_schema(item)
    for key, item in value.items()
    if key not in BEDROCK_TOOL_SCHEMA_UNSUPPORTED_KEYS
  }
  if normalized.get("type") == "object" and isinstance(normalized.get("properties"), dict):
    normalized["additionalProperties"] = False
  return normalized


def _recommendation_v2_tool_schema() -> dict[str, Any]:
  """Keep Bedrock's strict grammar small; server-side Pydantic still validates."""
  text = {"type": "string"}
  color = {
    "type": "object",
    "additionalProperties": False,
    "required": ["name", "hex"],
    "properties": {
      "name": text,
      "hex": text,
    },
  }
  area_guide = {
    "type": "object",
    "additionalProperties": False,
    "required": ["goal", "color", "texture"],
    "properties": {
      "goal": text,
      "color": color,
      "texture": text,
    },
  }
  area_guides = {
    "type": "object",
    "additionalProperties": False,
    "required": list(MAKEUP_RECOMMENDATION_REQUIRED_AREAS),
    "properties": {area: area_guide for area in MAKEUP_RECOMMENDATION_REQUIRED_AREAS},
  }
  look = {
    "type": "object",
    "additionalProperties": False,
    "required": [
      "title",
      "summary",
      "areaGuides",
    ],
    "properties": {
      "title": text,
      "summary": text,
      "areaGuides": area_guides,
      "imageBrief": text,
    },
  }
  return {
    "type": "object",
    "additionalProperties": False,
    "required": ["contextSummary", "looks"],
    "properties": {
      "contextSummary": {"type": "array", "items": text},
      "looks": {
        "type": "object",
        "additionalProperties": False,
        "required": list(MAKEUP_RECOMMENDATION_ROLE_ORDER),
        "properties": {role: look for role in MAKEUP_RECOMMENDATION_ROLE_ORDER},
      },
    },
  }


def _fallback_area_guide(area: str, raw_guide: dict[str, Any], look_title: str) -> dict[str, Any]:
  label = MAKEUP_RECOMMENDATION_AREA_LABELS[area]
  fallback_color_name, fallback_hex = MAKEUP_RECOMMENDATION_AREA_FALLBACK_COLORS[area]
  raw_color = raw_guide.get("color") if isinstance(raw_guide.get("color"), dict) else {}
  color_name = str(raw_color.get("name") or fallback_color_name).strip()[:80] or fallback_color_name
  color_hex = str(raw_color.get("hex") or fallback_hex).strip()
  if not re.fullmatch(r"#[0-9A-Fa-f]{6}", color_hex):
    color_hex = fallback_hex
  texture = str(raw_guide.get("texture") or "얇고 자연스럽게 밀착되는 질감").strip()
  goal = str(raw_guide.get("goal") or f"{look_title}에 어울리는 {label} 균형").strip()
  technique = str(
    raw_guide.get("technique")
    or f"{color_name} 계열을 소량씩 얇게 쌓아 {label} 경계가 자연스럽게 이어지게 합니다."
  ).strip()
  placement = str(raw_guide.get("placement") or f"{label}의 필요한 범위에만 얇게 적용").strip()
  steps = raw_guide.get("steps")
  normalized_steps = (
    steps
    if isinstance(steps, list) and steps
    else [{"order": 1, "instruction": technique}]
  )
  avoid = raw_guide.get("avoid")
  return {
    "area": area,
    "label": str(raw_guide.get("label") or label).strip()[:80] or label,
    "goal": goal[:180],
    "color": {"name": color_name, "hex": color_hex.upper()},
    "texture": texture[:100],
    "placement": placement[:300],
    "technique": technique[:300],
    "steps": normalized_steps,
    "reason": str(raw_guide.get("reason") or f"{look_title}의 색상 계획과 연결했습니다.").strip()[:300],
    "avoid": avoid if isinstance(avoid, list) else ["한 번에 두껍게 올리지 않기"],
    "products": [],
    "arSupported": bool(raw_guide.get("arSupported", True)),
  }


def _normalize_provider_area_guides(value: Any, look_title: str) -> list[dict[str, Any]]:
  if isinstance(value, dict):
    return [
      _fallback_area_guide(area, guide if isinstance(guide, dict) else {}, look_title)
      for area in MAKEUP_RECOMMENDATION_REQUIRED_AREAS
      for guide in [value.get(area)]
    ]
  if isinstance(value, list):
    by_area = {
      str(guide.get("area") or ""): guide
      for guide in value
      if isinstance(guide, dict)
    }
    return [
      _fallback_area_guide(area, by_area.get(area, {}), look_title)
      for area in MAKEUP_RECOMMENDATION_REQUIRED_AREAS
    ]
  return [
    _fallback_area_guide(area, {}, look_title)
    for area in MAKEUP_RECOMMENDATION_REQUIRED_AREAS
  ]


def _normalize_provider_look(role: str, value: Any) -> dict[str, Any]:
  raw = value if isinstance(value, dict) else {}
  title = str(raw.get("title") or f"{role} 룩").strip()[:100] or f"{role} 룩"
  summary = str(raw.get("summary") or f"{title} 색상 계획을 중심으로 구성한 메이크업입니다.").strip()[:300]
  durations = {"anchor": 20, "bold": 30, "discovery": 25}
  difficulties = {"anchor": "easy", "bold": "advanced", "discovery": "medium"}
  reasons = raw.get("reasons")
  applied_conditions = raw.get("appliedConditions")
  return {
    "id": str(raw.get("id") or role).strip()[:80] or role,
    "role": role,
    "title": title,
    "summary": summary,
    "reasons": reasons if isinstance(reasons, list) and reasons else ["상황과 얼굴 분석 맥락을 반영했습니다."],
    "appliedConditions": (
      applied_conditions
      if isinstance(applied_conditions, list) and applied_conditions
      else [title]
    ),
    "durationMinutes": raw.get("durationMinutes") if isinstance(raw.get("durationMinutes"), int) else durations[role],
    "difficulty": raw.get("difficulty") if raw.get("difficulty") in {"easy", "medium", "advanced"} else difficulties[role],
    "areaGuides": _normalize_provider_area_guides(raw.get("areaGuides"), title),
    "imageBrief": str(
      raw.get("imageBrief")
      or f"인물의 얼굴 특징은 유지하고 {title}의 색상과 질감만 자연스럽게 적용"
    ).strip()[:800],
  }


def _is_complete_role_keyed_provider_look(value: Any) -> bool:
  if not isinstance(value, dict):
    return False
  if any(
    not isinstance(value.get(key), str) or not value[key].strip()
    for key in ("title", "summary")
  ):
    return False
  area_guides = value.get("areaGuides")
  if not isinstance(area_guides, dict):
    return False
  for area in MAKEUP_RECOMMENDATION_REQUIRED_AREAS:
    guide = area_guides.get(area)
    if not isinstance(guide, dict):
      return False
    color = guide.get("color")
    if not isinstance(color, dict):
      return False
    if any(
      not isinstance(guide.get(key), str) or not guide[key].strip()
      for key in ("goal", "texture")
    ):
      return False
    if any(
      not isinstance(color.get(key), str) or not color[key].strip()
      for key in ("name", "hex")
    ):
      return False
  return True


def _normalize_recommendation_tool_response(value: dict[str, Any]) -> dict[str, Any]:
  normalized = dict(value)
  looks = normalized.get("looks")
  if isinstance(looks, dict):
    normalized["looks"] = [
      _normalize_provider_look(role, looks.get(role))
      for role in MAKEUP_RECOMMENDATION_ROLE_ORDER
      if _is_complete_role_keyed_provider_look(looks.get(role))
    ]
    return normalized
  if not isinstance(looks, list):
    return normalized

  normalized_looks: list[Any] = []
  for look in looks:
    if not isinstance(look, dict):
      normalized_looks.append(look)
      continue
    role = str(look.get("role") or "")
    if role in MAKEUP_RECOMMENDATION_ROLE_ORDER and isinstance(look.get("areaGuides"), dict):
      normalized_looks.append(_normalize_provider_look(role, look))
    else:
      normalized_looks.append(look)
  normalized["looks"] = normalized_looks
  return normalized


def _structured_response_contract(system: str) -> tuple[str, dict[str, Any]] | None:
  contract = STRUCTURED_RESPONSE_MODELS.get(system)
  if contract is None:
    return None
  tool_name, response_model = contract
  if response_model is GeneratedMakeupRecommendationV2:
    return tool_name, _recommendation_v2_tool_schema()

  schema = response_model.model_json_schema(by_alias=True)

  return tool_name, _strict_json_schema(schema)


def _escape_unescaped_json_text_whitespace(text: str) -> str:
  """Escape raw line whitespace only when it occurs inside a JSON string.

  ConverseStream tool input occasionally contains a literal newline, carriage
  return, or tab in generated prose instead of the JSON escape sequence. These
  characters are meaningful text whitespace, but RFC-compliant JSON requires
  them to be escaped. Keep the repair deliberately narrow: other control
  characters and every other kind of malformed JSON must still fail closed.
  """
  escaped_text: list[str] = []
  inside_string = False
  previous_was_escape = False
  replacements = {"\n": r"\n", "\r": r"\r", "\t": r"\t"}

  for character in text:
    if not inside_string:
      escaped_text.append(character)
      if character == '"':
        inside_string = True
      continue

    if previous_was_escape:
      escaped_text.append(character)
      previous_was_escape = False
      continue
    if character == "\\":
      escaped_text.append(character)
      previous_was_escape = True
      continue
    if character == '"':
      escaped_text.append(character)
      inside_string = False
      continue
    escaped_text.append(replacements.get(character, character))

  return "".join(escaped_text)


def _parse_json_object(text: str) -> dict[str, Any]:
  text = text.strip()
  if text.startswith("```") and text.endswith("```"):
    first_newline = text.find("\n")
    text = text[first_newline + 1 : -3].strip() if first_newline >= 0 else text[3:-3].strip()
  start_idx = text.find("{")
  end_idx = text.rfind("}")
  if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
    text = text[start_idx : end_idx + 1]
  try:
    value = json.loads(text)
  except json.JSONDecodeError as exc:
    if exc.msg.startswith("Invalid control character"):
      repaired_text = _escape_unescaped_json_text_whitespace(text)
      try:
        value = json.loads(repaired_text)
      except json.JSONDecodeError as repaired_exc:
        raise AppError(
          502,
          "BEDROCK_INVALID_JSON",
          "Bedrock returned an invalid recommendation response.",
        ) from repaired_exc
    else:
      raise AppError(
        502,
        "BEDROCK_INVALID_JSON",
        "Bedrock returned an invalid recommendation response.",
      ) from exc
  if not isinstance(value, dict):
    raise AppError(
      502,
      "BEDROCK_INVALID_JSON",
      "Bedrock returned an invalid recommendation response.",
    )
  return value


def _message_content(response: dict[str, Any]) -> list[dict[str, Any]]:
  output = response.get("output", {})
  message = output.get("message", {}) if isinstance(output, dict) else {}
  content = message.get("content", []) if isinstance(message, dict) else []
  return [item for item in content if isinstance(item, dict)] if isinstance(content, list) else []


def _tool_input_from_message(
  response: dict[str, Any],
  tool_name: str,
) -> dict[str, Any] | None:
  for item in _message_content(response):
    tool_use = item.get("toolUse")
    if not isinstance(tool_use, dict) or tool_use.get("name") != tool_name:
      continue
    tool_input = tool_use.get("input")
    if isinstance(tool_input, dict):
      return tool_input
    if isinstance(tool_input, str):
      return _parse_json_object(tool_input)
  return None


def _tool_input_from_stream(
  events: list[dict[str, Any]],
  tool_name: str,
) -> dict[str, Any] | None:
  blocks: dict[int, dict[str, Any]] = {}
  for event in events:
    block_start = event.get("contentBlockStart")
    if isinstance(block_start, dict):
      block_index = block_start.get("contentBlockIndex")
      start = block_start.get("start")
      tool_use = start.get("toolUse") if isinstance(start, dict) else None
      if isinstance(block_index, int) and isinstance(tool_use, dict):
        blocks[block_index] = {
          "name": str(tool_use.get("name") or ""),
          "chunks": [],
        }
        initial_input = tool_use.get("input")
        if isinstance(initial_input, str):
          blocks[block_index]["chunks"].append(initial_input)

    block_delta = event.get("contentBlockDelta")
    if not isinstance(block_delta, dict):
      continue
    block_index = block_delta.get("contentBlockIndex")
    delta = block_delta.get("delta")
    tool_use = delta.get("toolUse") if isinstance(delta, dict) else None
    if not isinstance(block_index, int) or not isinstance(tool_use, dict):
      continue
    block = blocks.setdefault(block_index, {"name": tool_name, "chunks": []})
    chunk = tool_use.get("input")
    if isinstance(chunk, str):
      block["chunks"].append(chunk)

  for block in blocks.values():
    if block.get("name") != tool_name:
      continue
    text = "".join(block.get("chunks") or []).strip()
    if text:
      return _parse_json_object(text)
  return None


def _response_text(
  response: dict[str, Any],
  events: list[dict[str, Any]],
) -> str:
  text = "".join(
    str(delta.get("text") or "")
    for event in events
    if isinstance((content_delta := event.get("contentBlockDelta")), dict)
    if isinstance((delta := content_delta.get("delta")), dict)
  ).strip()
  if text:
    return text
  return "".join(str(item.get("text") or "") for item in _message_content(response)).strip()


def _strict_tool_schema_is_unsupported(exc: Exception) -> bool:
  if isinstance(exc, ParamValidationError):
    return "strict" in str(exc).casefold()
  if not isinstance(exc, ClientError):
    return False
  error = exc.response.get("Error", {})
  return (
    str(error.get("Code") or "") == "ValidationException"
    and "strict" in str(error.get("Message") or "").casefold()
  )


def _forced_tool_use_is_unsupported(exc: Exception) -> bool:
  if isinstance(exc, ParamValidationError):
    return not _strict_tool_schema_is_unsupported(exc)
  if not isinstance(exc, ClientError):
    return False
  error = exc.response.get("Error", {})
  provider_code = str(error.get("Code") or "")
  if provider_code != "ValidationException":
    return False
  provider_message = str(error.get("Message") or "").casefold()
  return any(
    marker in provider_message
    for marker in ("toolconfig", "tool config", "toolchoice", "tool choice", "tool use")
  )


def _client_supports_strict_tool_schema(client: Any) -> bool:
  """Check the installed Bedrock service model before sending the newer field."""
  try:
    operation = client.meta.service_model.operation_model("ConverseStream")
    tool_config = operation.input_shape.members["toolConfig"]
    tools = tool_config.members["tools"]
    tool_spec = tools.member.members["toolSpec"]
    return "strict" in tool_spec.members
  except (AttributeError, KeyError, TypeError):
    return False


def _converse(
  settings: Settings,
  model_id: str,
  system: str,
  prompt: str,
  *,
  max_tokens: int = 3500,
  response_schema: dict[str, Any] | None = None,
  tool_name: str | None = None,
  use_strict_tool_schema: bool | None = None,
  timeout_seconds: float | None = None,
  allow_provider_retries: bool = True,
) -> dict[str, Any]:
  request_deadline = (
    time.monotonic() + max(0.0, float(timeout_seconds))
    if timeout_seconds is not None
    else None
  )
  converse_config = (
    BEDROCK_LONG_FORM_CONVERSE_CONFIG
    if max_tokens >= 8000
    else BEDROCK_CONVERSE_CONFIG
  )
  if timeout_seconds is not None:
    # Keep the socket timeout inside the caller's total provider deadline. The
    # asyncio deadline in generate_json is still authoritative, but bounding
    # botocore as well prevents a cancelled worker thread from lingering for
    # the static 50/110 second read timeout.
    bounded_timeout = max(0.1, float(timeout_seconds))
    converse_config = converse_config.merge(Config(
      read_timeout=bounded_timeout,
      connect_timeout=min(10.0, bounded_timeout),
    ))
  if not allow_provider_retries:
    # `total_max_attempts=1` includes the initial request, so botocore cannot
    # silently repeat a billable recommendation invocation.
    converse_config = converse_config.merge(Config(
      retries={"total_max_attempts": 1, "mode": "standard"},
    ))
  client_kwargs = {"region_name": settings.aws_region, "config": converse_config}
  if settings.aws_profile_name:
    client = boto3.Session(profile_name=settings.aws_profile_name).client("bedrock-runtime", **client_kwargs)
  else:
    client = boto3.client("bedrock-runtime", **client_kwargs)
  request: dict[str, Any] = {
    "modelId": model_id,
    "system": [{"text": system}],
    "messages": [{"role": "user", "content": [{"text": prompt}]}],
    "inferenceConfig": {"maxTokens": max_tokens, "temperature": 0.35},
  }
  if response_schema is not None and tool_name:
    tool_spec: dict[str, Any] = {
      "name": tool_name,
      "description": "Return the response as JSON that satisfies this schema.",
      "inputSchema": {"json": response_schema},
    }
    strict_supported = (
      _client_supports_strict_tool_schema(client)
      if use_strict_tool_schema is None
      else use_strict_tool_schema
    )
    if strict_supported:
      tool_spec["strict"] = True
    request["toolConfig"] = {
      "tools": [{"toolSpec": tool_spec}],
      "toolChoice": {"tool": {"name": tool_name}},
    }
  response = client.converse_stream(**request)
  if request_deadline is not None and time.monotonic() >= request_deadline:
    raise AppError(
      504,
      "BEDROCK_REQUEST_TIMEOUT",
      "The Bedrock request timed out.",
      {"providerCode": "ProviderDeadlineExceeded"},
    )
  raw_stream = response.get("stream", [])
  events: list[dict[str, Any]] = []
  for event in raw_stream:
    if request_deadline is not None and time.monotonic() >= request_deadline:
      raise AppError(
        504,
        "BEDROCK_REQUEST_TIMEOUT",
        "The Bedrock request timed out.",
        {"providerCode": "ProviderDeadlineExceeded"},
      )
    if isinstance(event, dict):
      events.append(event)

  if response_schema is not None and tool_name:
    tool_input = _tool_input_from_stream(events, tool_name)
    if tool_input is None:
      tool_input = _tool_input_from_message(response, tool_name)
    if tool_input is not None:
      return tool_input

  text = _response_text(response, events)
  return _parse_json_object(text)


async def generate_json(
  settings: Settings,
  model_id: str,
  system: str,
  prompt: str,
  *,
  max_tokens: int = 3500,
  timeout_seconds: float | None = None,
  allow_provider_retries: bool = True,
) -> dict[str, Any]:
  started_at = time.perf_counter()
  provider_deadline = (
    time.monotonic() + max(0.0, float(timeout_seconds))
    if timeout_seconds is not None
    else None
  )
  structured_contract = _structured_response_contract(system)
  structured_enabled = structured_contract is not None

  async def invoke_converse(**kwargs: Any) -> dict[str, Any]:
    remaining_seconds = (
      provider_deadline - time.monotonic()
      if provider_deadline is not None
      else None
    )
    if remaining_seconds is not None and remaining_seconds <= 0:
      raise AppError(
        504,
        "BEDROCK_REQUEST_TIMEOUT",
        "The Bedrock request timed out.",
        {"providerCode": "ProviderDeadlineExceeded"},
      )
    if remaining_seconds is not None:
      kwargs["timeout_seconds"] = remaining_seconds
    kwargs["allow_provider_retries"] = allow_provider_retries
    worker = asyncio.to_thread(
      _converse,
      settings,
      model_id,
      system,
      prompt,
      **kwargs,
    )
    try:
      if remaining_seconds is None:
        return await worker
      return await asyncio.wait_for(worker, timeout=remaining_seconds)
    except TimeoutError as exc:
      raise AppError(
        504,
        "BEDROCK_REQUEST_TIMEOUT",
        "The Bedrock request timed out.",
        {"providerCode": "ProviderDeadlineExceeded"},
      ) from exc

  try:
    if not model_id:
      raise AppError(503, "BEDROCK_MODEL_NOT_CONFIGURED", "The Bedrock model is not configured.")
    for attempt in range(2):
      try:
        if structured_enabled and structured_contract is not None:
          tool_name, response_schema = structured_contract
          prefer_strict_tool_schema = tool_name != "generate_makeup_recommendation"
          try:
            result = await invoke_converse(
              max_tokens=max_tokens,
              response_schema=response_schema,
              tool_name=tool_name,
              use_strict_tool_schema=prefer_strict_tool_schema,
            )
          except Exception as exc:
            if not allow_provider_retries:
              raise
            if _strict_tool_schema_is_unsupported(exc):
              logger.warning(
                "[aura:makeup-recommendation] bedrock:strict-tool-schema-unsupported "
                "modelId=%s errorType=%s retrying forced tool use without strict",
                model_id,
                type(exc).__name__,
              )
              try:
                result = await invoke_converse(
                  max_tokens=max_tokens,
                  response_schema=response_schema,
                  tool_name=tool_name,
                  use_strict_tool_schema=False,
                )
              except Exception as tool_exc:
                if not _forced_tool_use_is_unsupported(tool_exc):
                  raise
                structured_enabled = False
                logger.warning(
                  "[aura:makeup-recommendation] bedrock:structured-output-unsupported "
                  "modelId=%s errorType=%s falling back to text JSON",
                  model_id,
                  type(tool_exc).__name__,
                )
                result = await invoke_converse(
                  max_tokens=max_tokens,
                )
            elif _forced_tool_use_is_unsupported(exc):
              structured_enabled = False
              logger.warning(
                "[aura:makeup-recommendation] bedrock:structured-output-unsupported "
                "modelId=%s errorType=%s falling back to text JSON",
                model_id,
                type(exc).__name__,
              )
              result = await invoke_converse(
                max_tokens=max_tokens,
              )
            else:
              raise
        else:
          result = await invoke_converse(
            max_tokens=max_tokens,
          )
        break
      except AppError as exc:
        if (
          allow_provider_retries
          and exc.code == "BEDROCK_INVALID_JSON"
          and attempt == 0
          and max_tokens < 8000
        ):
          logger.warning(
            "[aura:makeup-recommendation] bedrock:invalid-json-retry "
            "modelId=%s attempt=%s",
            model_id,
            attempt + 1,
          )
          continue
        raise
  except AppError as exc:
    emit_ai_metric(
      provider="bedrock", operation="generate_json", model_id=model_id,
      status="error", latency_ms=(time.perf_counter() - started_at) * 1000,
      error_code=exc.code,
    )
    raise
  except Exception as exc:
    error = _bedrock_app_error(exc)
    logger.exception(
      "[aura:makeup-recommendation] bedrock:failed modelId=%s providerCode=%s providerRequestId=%s",
      model_id,
      error.details.get("providerCode"),
      error.details.get("providerRequestId"),
    )
    emit_ai_metric(
      provider="bedrock", operation="generate_json", model_id=model_id,
      status="error", latency_ms=(time.perf_counter() - started_at) * 1000,
      error_code=error.code,
    )
    raise error from exc
  emit_ai_metric(
    provider="bedrock", operation="generate_json", model_id=model_id,
    status="success", latency_ms=(time.perf_counter() - started_at) * 1000,
  )
  return result


def _bedrock_app_error(exc: Exception) -> AppError:
  if isinstance(exc, UnauthorizedSSOTokenError):
    return AppError(
      503,
      "BEDROCK_CREDENTIALS_EXPIRED",
      "Bedrock credentials have expired and must be refreshed.",
      {"providerCode": "UnauthorizedSSOTokenError"},
    )

  if isinstance(exc, ReadTimeoutError):
    return AppError(
      504,
      "BEDROCK_REQUEST_TIMEOUT",
      "The Bedrock request timed out.",
      {"providerCode": "ReadTimeoutError"},
    )

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
  seen = list(excluded)
  items: list[dict[str, Any]] = []

  for _attempt in range(3):
    remaining = count - len(items)
    if remaining <= 0:
      break
    response = await generate_json(
      settings,
      settings.effective_scenario_model_id,
      "Write sharp Korean editorial situation cards for makeup discovery. Avoid generic beauty copy, bland category labels, paraphrases, stereotypes, and repeated ideas. Return JSON only.",
      f"Return {{\"items\":[{{\"id\":\"string\",\"text\":\"short display copy\",\"seedPrompt\":\"specific makeup intent\",\"tags\":[\"string\"]}}]}} with exactly {remaining} items. "
      "Write natural Korean display copy, usually 5 to 18 characters, without the words 룩 or 메이크업. Mix concise scenes, character, place, camera, work, everyday, and small-transformation ideas. Every card must point to a distinct makeup direction rather than merely sounding poetic. "
      f"Use this quality and rhythm as reference only; do not copy or lightly paraphrase them: {json.dumps(SCENARIO_COPY_EXAMPLES, ensure_ascii=False)}. "
      "seedPrompt must clearly describe color, texture, emphasis, and occasion without relying on the display copy. "
      f"Do not repeat, reorder, extend, or paraphrase any previously shown idea: {json.dumps([*excluded, *[item['text'] for item in items]], ensure_ascii=False)}",
    )
    raw_items = response.get("items")
    if not isinstance(raw_items, list):
      continue
    for raw_item in raw_items:
      if not isinstance(raw_item, dict):
        continue
      text = str(raw_item.get("text") or "").strip()[:60]
      seed_prompt = str(raw_item.get("seedPrompt") or "").strip()[:240]
      if not text or not seed_prompt or any(_scenario_copy_is_similar(text, previous) for previous in seen):
        continue
      tags = raw_item.get("tags")
      clean_tags = [str(tag).strip() for tag in tags[:8] if str(tag).strip()] if isinstance(tags, list) else []
      if not _scenario_copy_is_safe(text, seed_prompt, clean_tags):
        continue
      items.append(
        {
          "id": f"generated-{sha256(text.encode('utf-8')).hexdigest()[:16]}",
          "text": text,
          "seedPrompt": seed_prompt,
          "tags": clean_tags,
        },
      )
      seen.append(text)
      if len(items) >= count:
        break

  if not items:
    raise AppError(502, "BEDROCK_EMPTY_SCENARIOS", "Bedrock did not return any usable makeup scenarios.")
  return {"items": items[:count]}


def _scenario_library_item(row: dict[str, Any]) -> dict[str, Any]:
  tags = row.get("tags")
  if isinstance(tags, str):
    try:
      tags = json.loads(tags)
    except json.JSONDecodeError:
      tags = []
  return {
    "id": str(row.get("id") or ""),
    "text": str(row.get("text") or "").strip(),
    "seedPrompt": str(row.get("seed_prompt") or "").strip(),
    "tags": [str(tag).strip() for tag in tags if str(tag).strip()] if isinstance(tags, list) else [],
  }


async def enforce_scenario_generation_limit(db: Any, user_id: Any) -> None:
  row = await db.fetchrow(
    """
    insert into makeup_scenario_generation_limits (user_id, window_started_at, request_count)
    values ($1, now(), 1)
    on conflict (user_id) do update set
      window_started_at = case
        when makeup_scenario_generation_limits.window_started_at <= now() - interval '60 seconds' then now()
        else makeup_scenario_generation_limits.window_started_at
      end,
      request_count = case
        when makeup_scenario_generation_limits.window_started_at <= now() - interval '60 seconds' then 1
        else least(makeup_scenario_generation_limits.request_count + 1, 4)
      end
    returning request_count
    """,
    user_id,
  )
  if row is None or int(row.get("request_count") or 0) > 3:
    raise AppError(
      429,
      "MAKEUP_SCENARIO_RATE_LIMITED",
      "잠시 후 카드를 더 만들어 주세요.",
      {"limit": 3, "windowSeconds": 60},
    )


async def _persist_generated_scenario(
  db: Any,
  item: dict[str, Any],
  model_id: str,
  created_by_user_id: Any,
) -> dict[str, Any] | None:
  text = str(item.get("text") or "").strip()[:60]
  seed_prompt = str(item.get("seedPrompt") or "").strip()[:240]
  normalized_text = _scenario_copy_key(text) or re.sub(r"[^0-9a-z가-힣]", "", text.casefold())
  tags = item.get("tags") if isinstance(item.get("tags"), list) else []
  return await db.fetchrow(
    """
    with capacity_lock as materialized (
      select pg_advisory_xact_lock(73120451)
    ), existing as materialized (
      select id, status
      from makeup_scenario_library, capacity_lock
      where normalized_text = $2
        and locale = 'ko-KR'
        and coalesce(market_scope, '') = ''
      limit 1
    ), reused as (
      update makeup_scenario_library
      set usage_count = usage_count + 1,
          last_served_at = now(),
          updated_at = now()
      where id = (select id from existing where status = 'active')
      returning id, text, seed_prompt, tags, status
    ), capacity as materialized (
      select count(*)::integer as ai_count
      from makeup_scenario_library, capacity_lock
      where source = 'ai'
        and locale = 'ko-KR'
        and coalesce(market_scope, '') = ''
    ), inserted as (
      insert into makeup_scenario_library
        (text, normalized_text, seed_prompt, tags, source, model_id, prompt_version,
         status, usage_count, last_served_at, created_by_user_id, locale, market_scope)
      select $1, $2, $3, $4::jsonb, 'ai', $5, 'makeup-scenario-v2',
             'active', 1, now(), $6, 'ko-KR', null
      from capacity
      where ai_count < 2000
        and not exists (select 1 from existing)
      on conflict (normalized_text, locale, (coalesce(market_scope, ''))) do nothing
      returning id, text, seed_prompt, tags, status
    ), replacement_candidate as materialized (
      select library.id
      from makeup_scenario_library library, capacity
      where capacity.ai_count >= 2000
        and library.source = 'ai'
        and library.locale = 'ko-KR'
        and coalesce(library.market_scope, '') = ''
        and library.status = 'active'
        and (
          library.last_served_at is null
          or library.last_served_at < now() - interval '7 days'
        )
        and not exists (select 1 from existing)
      order by library.usage_count asc,
               library.last_served_at asc nulls first,
               library.created_at asc
      limit 1
      for update skip locked
    ), replaced as (
      update makeup_scenario_library
      set text = $1,
          normalized_text = $2,
          seed_prompt = $3,
          tags = $4::jsonb,
          source = 'ai',
          model_id = $5,
          prompt_version = 'makeup-scenario-v2',
          status = 'active',
          usage_count = 1,
          last_served_at = now(),
          created_by_user_id = $6,
          created_at = now(),
          updated_at = now()
      where id = (select id from replacement_candidate)
      returning id, text, seed_prompt, tags, status
    ), existing_blocked as (
      select library.id, library.text, library.seed_prompt, library.tags, library.status
      from makeup_scenario_library library
      where library.id = (select id from existing where status = 'disabled')
    )
    select * from reused
    union all select * from inserted
    union all select * from replaced
    union all select * from existing_blocked
    limit 1
    """,
    text,
    normalized_text,
    seed_prompt,
    json.dumps(tags, ensure_ascii=False),
    model_id,
    created_by_user_id,
  )


async def generate_shared_scenarios(
  settings: Settings,
  db: Any,
  count: int,
  exclude_texts: list[str],
  created_by_user_id: Any,
) -> dict[str, Any]:
  candidates = await db.fetch(
    """
    select id, text, seed_prompt, tags, status
    from makeup_scenario_library
    where locale = 'ko-KR'
      and coalesce(market_scope, '') = ''
      and keyword_kind = 'legacy_scenario'
    order by (status = 'active') desc, usage_count asc, random()
    limit $1
    """,
    max(100, count * 20),
  )
  excluded = [text.strip()[:60] for text in exclude_texts if text.strip()][:100]
  shared_target = max(0, count - min(4, count))
  eligible: list[dict[str, Any]] = []
  seen = list(excluded)
  for row in candidates:
    if str(row.get("status") or "active") != "active":
      continue
    item = _scenario_library_item(row)
    if not item["id"] or not item["text"] or not item["seedPrompt"]:
      continue
    if any(_scenario_copy_is_similar(item["text"], previous) for previous in seen):
      continue
    eligible.append(item)
    seen.append(item["text"])
  selected = eligible[:shared_target]

  generation_count = count - len(selected)
  generated_items: list[dict[str, Any]] = []
  if generation_count > 0:
    generation_exclusions = [*excluded, *[str(row.get("text") or "") for row in candidates]]
    try:
      generated = await generate_scenarios(settings, generation_count, generation_exclusions)
    except Exception:
      if not selected:
        raise
      logger.exception("[aura:makeup-recommendation] shared-scenarios:generation-failed")
      generated = {"items": []}

    for item in generated.get("items", []):
      text = str(item.get("text") or "").strip()[:60]
      seed_prompt = str(item.get("seedPrompt") or "").strip()[:240]
      if not text or not seed_prompt or any(_scenario_copy_is_similar(text, previous) for previous in seen):
        continue
      try:
        stored = await _persist_generated_scenario(
          db,
          {**item, "text": text, "seedPrompt": seed_prompt},
          settings.effective_scenario_model_id,
          created_by_user_id,
        )
      except Exception:
        logger.exception("[aura:makeup-recommendation] shared-scenarios:persist-failed")
        stored = None
      if stored is not None and str(stored.get("status") or "active") != "active":
        continue
      stored_item = _scenario_library_item(stored) if stored is not None else {
        "id": str(item.get("id") or f"generated-{sha256(text.encode('utf-8')).hexdigest()[:16]}"),
        "text": text,
        "seedPrompt": seed_prompt,
        "tags": [str(tag).strip() for tag in item.get("tags", []) if str(tag).strip()][:8]
        if isinstance(item.get("tags"), list)
        else [],
      }
      if any(_scenario_copy_is_similar(stored_item["text"], previous) for previous in seen):
        continue
      generated_items.append(stored_item)
      seen.append(stored_item["text"])
      if len(selected) + len(generated_items) >= count:
        break

  if len(generated_items) < generation_count:
    raise AppError(
      502,
      "BEDROCK_INSUFFICIENT_SCENARIOS",
      "Bedrock did not return enough distinct makeup scenarios.",
      {"requestedFresh": generation_count, "generatedFresh": len(generated_items)},
    )

  combined = [*selected, *generated_items]

  generated_ids = {item["id"] for item in generated_items}
  shared_ids = [item["id"] for item in combined if item["id"] not in generated_ids]
  if shared_ids:
    await db.execute(
      "update makeup_scenario_library set usage_count = usage_count + 1, last_served_at = now(), updated_at = now() where id::text = any($1::text[])",
      shared_ids,
    )
  return {"items": combined[:count]}


async def generate_questions(
  settings: Settings,
  scenario_text: str,
  tags: list[str],
  scenario_label: str | None = None,
) -> dict[str, Any]:
  for _attempt in range(2):
    response = await generate_json(
      settings,
      settings.effective_question_model_id,
      QUESTION_SYSTEM_PROMPT,
      f"선택한 카드 문구: {scenario_label or '(자유 입력)'}\n"
      f"카드가 담은 내부 의도 또는 사용자 입력: {scenario_text}\n"
      f"태그: {', '.join(tags) or '(없음)'}\n\n"
      "카드 문구와 내부 의도를 질문 생성의 출발점으로 함께 고려하라. 내부 의도에 적힌 색이나 테크닉을 사용자에게 되묻지 말고, AI가 나중에 알아서 구현해야 할 정보로 취급하라. "
      "Return {\"questions\":[{\"id\":\"string\",\"title\":\"string\",\"options\":[{\"id\":\"string\",\"label\":\"string\"}]}]} with 1 to 3 questions and exactly 4 options each: 3 mutually exclusive story choices with unique ids and labels, plus exactly one ai_pick last.",
    )
    try:
      normalized = normalize_generated_questions_response(response)
      return GeneratedQuestions.model_validate(normalized).model_dump(by_alias=True)
    except ValidationError as exc:
      logger.warning(
        "[aura:makeup-recommendation] questions:validation-failed modelId=%s errors=%s",
        settings.effective_question_model_id,
        exc.errors(include_input=False),
      )
      continue
  raise AppError(502, "BEDROCK_INVALID_QUESTIONS", "Bedrock returned invalid makeup questions.")


async def generate_recommendation(
  settings: Settings,
  scenario_text: str,
  tags: list[str],
  questions: list[dict[str, Any]],
  answers: list[dict[str, Any]],
  scenario_label: str | None = None,
) -> dict[str, Any]:
  output_contract = (
    '{"looks":[{"id":"string","role":"anchor|bold|discovery","title":"string",'
    '"summary":"string","reasons":["string"],"appliedConditions":["string"],'
    '"durationMinutes":15,"difficulty":"easy|medium|advanced",'
    '"steps":[{"order":1,"area":"base|brow|eye|cheek|lip","instruction":"string"}],'
    '"products":[{"area":"base|brow|eye|cheek|lip","brandName":"string",'
    '"productName":"string","shadeName":"string","reason":"string"}]}]}'
  )
  validation_errors: list[dict[str, Any]] = []
  for _attempt in range(1):
    response = await generate_json(
      settings,
      settings.effective_recommendation_model_id,
      "Generate practical, inclusive Korean makeup recommendations. The AI must do the makeup design work: translate the user's chosen story and answers into colors, textures, emphasis, techniques, and products without asking the user to design the recipe. Do not use face analysis or personal color data. Return JSON only. The response must be valid against the exact schema in the user message.",
      f"Selected scenario card: {scenario_label or '(free input)'}\nScenario intent: {scenario_text}\nTags: {tags}\nQuestions: {json.dumps(questions, ensure_ascii=False)}\nAnswers: {json.dumps(answers, ensure_ascii=False)}\nReturn exactly this shape: {output_contract}. Treat both the initially selected card and every answer as binding creative context. Return exactly three meaningfully different looks in this order: anchor (safe and balanced), bold (clearer and more expressive), discovery (unexpected but wearable). The three looks must differ in overall character and story, not merely in one shade or intensity. Each look must include one step for every area: base, brow, eye, cheek, lip, plus 3 to 8 realistic Korean-market product suggestions. Direct user answers and constraints take priority.",
    )
    try:
      return GeneratedMakeupRecommendation.model_validate(response).model_dump(by_alias=True)
    except ValidationError as exc:
      validation_errors = exc.errors(include_input=False)
      logger.warning(
        "[aura:makeup-recommendation] recommendation:validation-failed modelId=%s errors=%s",
        settings.effective_recommendation_model_id,
        validation_errors,
      )
      continue
  raise AppError(
    502,
    "BEDROCK_INVALID_RECOMMENDATION",
    "Bedrock returned an invalid makeup recommendation.",
    {
      "modelId": settings.effective_recommendation_model_id,
      "validationErrors": validation_errors[:12],
    },
  )

async def normalize_custom_situation_v2(settings: Settings, text: str) -> dict[str, Any]:
  try:
    response = await generate_json(
      settings,
      settings.effective_question_model_id,
      CUSTOM_NORMALIZATION_SYSTEM_PROMPT,
      build_custom_normalization_prompt(text),
      max_tokens=900,
      timeout_seconds=settings.makeup_recommendation_provider_timeout_seconds,
      allow_provider_retries=False,
    )
  except AppError:
    raise
  except Exception as exc:
    logger.warning(
      "[aura:makeup-recommendation] custom-normalization:provider-failed modelId=%s",
      settings.effective_question_model_id,
      exc_info=True,
    )
    raise AppError(
      502,
      "MAKEUP_CUSTOM_SITUATION_PROVIDER_FAILED",
      "The custom makeup situation could not be normalized by the AI provider.",
      {"modelId": settings.effective_question_model_id},
    ) from exc

  try:
    normalized = NormalizedCustomSituation.model_validate(response).model_dump(by_alias=True)
  except ValidationError as exc:
    validation_errors = exc.errors(include_input=False)
    logger.warning(
      "[aura:makeup-recommendation] custom-normalization:validation-failed modelId=%s errors=%s",
      settings.effective_question_model_id,
      validation_errors,
    )
    raise AppError(
      502,
      "MAKEUP_CUSTOM_SITUATION_OUTPUT_INVALID",
      "The AI provider returned an invalid custom makeup situation.",
      {
        "modelId": settings.effective_question_model_id,
        "validationErrors": validation_errors[:12],
      },
    ) from exc
  return {**normalized, "normalizationSource": "claude"}


def _normalized_generated_text(value: Any) -> str:
  return " ".join(value.split()) if isinstance(value, str) else ""


def normalize_generated_questions_response(response: Any) -> Any:
  """Repair harmless provider shape drift before strict schema validation.

  Collapse only AI delegation variants into one canonical final choice. Normal
  choices, including duplicates or surplus choices, remain present so strict
  Pydantic validation can reject ambiguous model output. Missing choices are
  never padded. Copy is only whitespace-normalized; forbidden question axes are
  still rejected by ``GeneratedQuestion`` after this step.
  """
  if not isinstance(response, dict):
    return response
  raw_questions = response.get("questions")
  if not isinstance(raw_questions, list):
    return response

  normalized_questions: list[Any] = []
  for raw_question in raw_questions:
    if not isinstance(raw_question, dict):
      normalized_questions.append(raw_question)
      continue

    question = dict(raw_question)
    question_id = _normalized_generated_text(question.get("id"))
    question_title = _normalized_generated_text(question.get("title"))
    if question_id:
      question["id"] = question_id
    if question_title:
      question["title"] = question_title

    raw_options = question.get("options")
    if isinstance(raw_options, list):
      ordinary_options: list[Any] = []
      for raw_option in raw_options:
        if not isinstance(raw_option, dict):
          ordinary_options.append(raw_option)
          continue
        option_id = _normalized_generated_text(raw_option.get("id"))
        option_label = _normalized_generated_text(raw_option.get("label"))
        if (
          option_id.casefold() == AI_PICK_OPTION_ID.casefold()
          or option_label.casefold() == AI_PICK_OPTION_LABEL.casefold()
        ):
          continue
        ordinary_options.append({**raw_option, "id": option_id, "label": option_label})

      question["options"] = [
        *ordinary_options,
        {"id": AI_PICK_OPTION_ID, "label": AI_PICK_OPTION_LABEL},
      ]
    normalized_questions.append(question)

  return {**response, "questions": normalized_questions}


PREP_TIME_OPTION_LABELS = (
  "15분 안에 빠르게",
  "30분 정도 여유 있게",
  "60분 이상 디테일까지",
)


def normalize_prep_time_question_options(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
  normalized_questions: list[dict[str, Any]] = []
  for question in questions:
    normalized_question = {**question}
    options = [dict(option) for option in question.get("options", [])]
    searchable = " ".join(
      [
        str(question.get("id") or ""),
        str(question.get("title") or ""),
        *[str(option.get("label") or "") for option in options[:3]],
      ],
    ).casefold()
    is_prep_time = (
      "prep_time" in searchable
      or "time_skill" in searchable
      or "공들일" in searchable
      or "준비 시간" in searchable
      or sum("분" in str(option.get("label") or "") for option in options[:3]) >= 2
    )
    if is_prep_time and len(options) == 4:
      for index, label in enumerate(PREP_TIME_OPTION_LABELS):
        options[index]["label"] = label
      normalized_question["options"] = options
    normalized_questions.append(normalized_question)
  return normalized_questions

async def generate_questions_v2(
  settings: Settings,
  context_snapshot: dict[str, Any],
) -> dict[str, Any]:
  try:
    response = await generate_json(
      settings,
      settings.effective_question_model_id,
      QUESTION_V2_SYSTEM_PROMPT,
      build_question_prompt(context_snapshot),
      max_tokens=1800,
      timeout_seconds=settings.makeup_recommendation_provider_timeout_seconds,
      allow_provider_retries=False,
    )
  except AppError:
    raise
  except Exception as exc:
    logger.warning(
      "[aura:makeup-recommendation] questions-v2:provider-failed modelId=%s",
      settings.effective_question_model_id,
      exc_info=True,
    )
    raise AppError(
      502,
      "MAKEUP_QUESTIONS_PROVIDER_FAILED",
      "The makeup questions could not be generated by the AI provider.",
      {"modelId": settings.effective_question_model_id},
    ) from exc

  try:
    normalized = normalize_generated_questions_response(response)
    questions = GeneratedQuestions.model_validate(normalized).model_dump(by_alias=True)["questions"]
    questions = normalize_prep_time_question_options(questions)
    questions = GeneratedQuestions.model_validate({"questions": questions}).model_dump(by_alias=True)["questions"]
  except ValidationError as exc:
    validation_errors = exc.errors(include_input=False)
    logger.warning(
      "[aura:makeup-recommendation] questions-v2:validation-failed modelId=%s errors=%s",
      settings.effective_question_model_id,
      validation_errors,
    )
    raise AppError(
      502,
      "MAKEUP_QUESTIONS_OUTPUT_INVALID",
      "The AI provider returned invalid makeup questions.",
      {
        "modelId": settings.effective_question_model_id,
        "validationErrors": validation_errors[:12],
      },
    ) from exc
  return {"questions": questions, "source": "claude", "version": "makeup-questions-v2"}


FALLBACK_SEMANTIC_PALETTES: dict[str, dict[str, dict[str, tuple[str, str, str]]]] = {
  "warm_bright": {
    "anchor": {
      "brow": ("소프트 웜 브라운", "#806052", "보송한 파우더"),
      "eye": ("피치 토프", "#A87D6E", "은은한 새틴"),
      "cheek": ("코랄 베이지", "#D78F7E", "맑은 쉬어"),
      "lip": ("코랄 로즈", "#B96662", "편안한 세미 글로우"),
    },
    "bold": {
      "brow": ("딥 체스트넛", "#68483D", "선명한 소프트 매트"),
      "eye": ("코퍼 로즈 브라운", "#8D574B", "밀도 있는 새틴"),
      "cheek": ("클리어 코랄", "#D87568", "선명한 쉬어"),
      "lip": ("브릭 코랄", "#B84F45", "또렷한 벨벳"),
    },
    "discovery": {
      "brow": ("캐러멜 브라운", "#76513F", "가벼운 파우더"),
      "eye": ("애프리콧 브론즈", "#B87955", "잔잔한 쉬머"),
      "cheek": ("애프리콧 코랄", "#E09570", "부드러운 쉬어"),
      "lip": ("테라코타 로즈", "#B9634C", "촉촉한 블러"),
    },
  },
  "cool_mauve": {
    "anchor": {
      "brow": ("소프트 애쉬 브라운", "#6F5D5E", "보송한 파우더"),
      "eye": ("쿨 모브 토프", "#8D7486", "은은한 새틴"),
      "cheek": ("쿨 로즈", "#CC8496", "맑은 쉬어"),
      "lip": ("쿨 로즈", "#A45572", "편안한 세미 글로우"),
    },
    "bold": {
      "brow": ("딥 애쉬 브라운", "#544649", "선명한 소프트 매트"),
      "eye": ("플럼 브라운", "#694B61", "밀도 있는 새틴"),
      "cheek": ("베리 로즈", "#C36180", "선명한 쉬어"),
      "lip": ("베리 플럼", "#8D315B", "또렷한 벨벳"),
    },
    "discovery": {
      "brow": ("그레이시 브라운", "#66585D", "가벼운 파우더"),
      "eye": ("라벤더 토프", "#88758F", "잔잔한 쉬머"),
      "cheek": ("오키드 로즈", "#C17D9B", "부드러운 쉬어"),
      "lip": ("모브 플럼", "#925472", "촉촉한 블러"),
    },
  },
  "natural_neutral": {
    "anchor": {
      "brow": ("내추럴 뉴트럴 브라운", "#76605A", "보송한 파우더"),
      "eye": ("베이지 토프", "#A08B82", "은은한 새틴"),
      "cheek": ("로즈 베이지", "#C99185", "맑은 쉬어"),
      "lip": ("로즈 베이지", "#9B6D68", "편안한 세미 글로우"),
    },
    "bold": {
      "brow": ("딥 뉴트럴 브라운", "#5E4B47", "선명한 소프트 매트"),
      "eye": ("코코아 토프", "#755D58", "밀도 있는 새틴"),
      "cheek": ("뮤티드 로즈", "#B97878", "선명도를 낮춘 쉬어"),
      "lip": ("브릭 로즈", "#87504F", "부드러운 벨벳"),
    },
    "discovery": {
      "brow": ("애쉬 뉴트럴 브라운", "#695A58", "가벼운 파우더"),
      "eye": ("머시룸 토프", "#8B7773", "잔잔한 쉬머"),
      "cheek": ("더스티 로즈 베이지", "#B98983", "부드러운 쉬어"),
      "lip": ("뮤티드 로즈 브라운", "#88615F", "촉촉한 블러"),
    },
  },
  "dramatic_berry": {
    "anchor": {
      "brow": ("딥 애쉬 브라운", "#604E50", "정돈된 소프트 매트"),
      "eye": ("로즈 플럼 토프", "#7F626E", "선명한 새틴"),
      "cheek": ("베리 로즈", "#C37489", "맑은 쉬어"),
      "lip": ("클리어 베리", "#A94366", "또렷한 세미 글로우"),
    },
    "bold": {
      "brow": ("에스프레소 브라운", "#493A3D", "선명한 소프트 매트"),
      "eye": ("딥 플럼 브라운", "#5D3D4E", "밀도 있는 새틴"),
      "cheek": ("딥 베리", "#AD526E", "선명한 쉬어"),
      "lip": ("딥 와인 베리", "#7B2847", "또렷한 벨벳"),
    },
    "discovery": {
      "brow": ("스모키 브라운", "#58494D", "가벼운 파우더"),
      "eye": ("블랙베리 모브", "#705168", "잔잔한 쉬머"),
      "cheek": ("플럼 로즈", "#B26382", "부드러운 쉬어"),
      "lip": ("플럼 마젠타", "#8F3E67", "촉촉한 블러"),
    },
  },
}


def _semantic_text(*values: Any) -> str:
  flattened: list[str] = []
  for value in values:
    if isinstance(value, (list, tuple, set)):
      flattened.extend(str(item) for item in value if item is not None)
    elif value is not None:
      flattened.append(str(value))
  return " ".join(flattened).casefold()


def _resolved_answer_signals(
  answers: list[dict[str, Any]],
  questions: list[dict[str, Any]] | None,
) -> tuple[list[str], list[str], str]:
  option_labels: dict[tuple[str, str], str] = {}
  for question in questions or []:
    if not isinstance(question, dict):
      continue
    question_id = str(question.get("id") or "")
    options = question.get("options")
    if not isinstance(options, list):
      continue
    for option in options:
      if not isinstance(option, dict):
        continue
      option_id = str(option.get("id") or "")
      label = str(option.get("label") or "").strip()
      if question_id and option_id and label:
        option_labels[(question_id, option_id)] = label

  display_labels: list[str] = []
  option_ids: list[str] = []
  semantic_parts: list[str] = []
  for answer in answers:
    if not isinstance(answer, dict):
      continue
    question_id = str(answer.get("questionId") or "")
    option_id = str(answer.get("optionId") or "")
    explicit_label = str(answer.get("label") or answer.get("freeText") or "").strip()
    resolved_label = explicit_label or option_labels.get((question_id, option_id), "")
    additional_constraints = str(answer.get("additionalConstraints") or "").strip()
    if resolved_label:
      display_labels.append(resolved_label[:80])
    if additional_constraints:
      display_labels.append(additional_constraints[:80])
    if option_id:
      option_ids.append(option_id.casefold())
    semantic_parts.extend(
      part
      for part in (question_id, option_id, resolved_label, additional_constraints)
      if part
    )
  return display_labels, option_ids, _semantic_text(semantic_parts)


def _signal_count(text: str, signals: tuple[str, ...]) -> int:
  return sum(1 for signal in signals if signal in text)


def _fallback_palette_key(
  analysis: dict[str, Any],
  selection: dict[str, Any],
  answers: list[dict[str, Any]],
  questions: list[dict[str, Any]] | None,
) -> str | None:
  situation = selection.get("situation") if isinstance(selection.get("situation"), dict) else {}
  keyword = selection.get("keyword") if isinstance(selection.get("keyword"), dict) else {}
  normalized_custom = (
    selection.get("normalizedCustom")
    if isinstance(selection.get("normalizedCustom"), dict)
    else {}
  )
  editorial_preset = (
    selection.get("editorialPreset")
    if isinstance(selection.get("editorialPreset"), dict)
    else {}
  )
  situation_key = str(situation.get("key") or "").casefold()
  scenario_text = _semantic_text(
    situation.get("label"),
    situation.get("description"),
    keyword.get("label"),
    keyword.get("tags"),
    selection.get("customSituationText"),
    selection.get("customSituationLabel"),
    normalized_custom.get("situationIntent"),
    normalized_custom.get("desiredImpression"),
    normalized_custom.get("constraints"),
    editorial_preset.get("id"),
    editorial_preset.get("displayText"),
    editorial_preset.get("seedPrompt"),
    editorial_preset.get("label"),
    editorial_preset.get("tags"),
  )
  _answer_labels, option_ids, answer_text = _resolved_answer_signals(answers, questions)

  direction_scores = {
    "warm_bright": 0,
    "cool_mauve": 0,
    "natural_neutral": 0,
    "dramatic_berry": 0,
  }
  personal_color = _semantic_text(analysis.get("personalColor"))
  if _signal_count(personal_color, ("warm", "웜", "spring", "봄", "autumn", "가을")):
    direction_scores["warm_bright"] += 3
  if _signal_count(personal_color, ("cool", "쿨", "summer", "여름", "winter", "겨울")):
    direction_scores["cool_mauve"] += 3

  key_directions = {
    "travel_outdoor": "warm_bright",
    "festival_performance": "warm_bright",
    "camera_content": "cool_mauve",
    "formal_event": "cool_mauve",
    "daily": "natural_neutral",
    "work_school": "natural_neutral",
    "interview": "natural_neutral",
  }
  keyed_direction = key_directions.get(situation_key)
  if keyed_direction:
    direction_scores[keyed_direction] += 5

  editorial_directions = {
    "baseball-camera": "warm_bright",
    "concert-encore": "warm_bright",
    "camera-first": "cool_mauve",
    "ex-wedding": "cool_mauve",
    "not-a-blind-date": "natural_neutral",
    "one-lip": "natural_neutral",
    "art-student": "natural_neutral",
    "trend-my-way": "natural_neutral",
    "saved-look": "natural_neutral",
    "wanghong-glass": "dramatic_berry",
    "neon-two-am": "dramatic_berry",
    "hip-point": "dramatic_berry",
  }
  editorial_direction = editorial_directions.get(
    str(editorial_preset.get("id") or "").casefold(),
  )
  if editorial_direction:
    direction_scores[editorial_direction] += 7

  direction_scores["warm_bright"] += 2 * min(
    _signal_count(
      scenario_text,
      (
        "festival", "페스티벌", "outdoor", "야외", "travel", "여행", "vacation", "휴가",
        "축제", "코랄", "피치", "활기", "생기", "햇살", "sunset", "노을",
      ),
    ),
    3,
  )
  direction_scores["cool_mauve"] += 2 * min(
    _signal_count(
      scenario_text,
      (
        "camera", "카메라", "촬영", "photo", "사진", "night", "야간", "formal", "격식",
        "모브", "플럼", "시크", "도시", "데이트", "date",
      ),
    ),
    3,
  )
  direction_scores["natural_neutral"] += 2 * min(
    _signal_count(
      scenario_text,
      (
        "daily", "일상", "출근", "등교", "interview", "면접", "work", "office", "오피스",
        "quick", "빠르게", "자연", "내추럴", "단정",
      ),
    ),
    3,
  )
  direction_scores["dramatic_berry"] += 2 * min(
    _signal_count(
      scenario_text,
      (
        "wanghong", "왕홍", "neon", "네온", "ruby", "루비", "레드", "와인", "딥",
        "dramatic", "드라마틱", "무대", "flash", "플래시",
      ),
    ),
    3,
  )

  answer_direction_signals = {
    "warm_bright": ("warm", "웜", "코랄", "피치", "활기", "생기"),
    "cool_mauve": ("cool", "쿨", "모브", "플럼", "시크", "차분"),
    "natural_neutral": ("natural", "내추럴", "자연", "익숙", "편안", "단정"),
  }
  for direction, signals in answer_direction_signals.items():
    direction_scores[direction] += min(_signal_count(answer_text, signals), 2) * 3

  highest_score = max(direction_scores.values())
  highest_directions = [
    direction for direction, score in direction_scores.items() if score == highest_score
  ]
  direction = highest_directions[0] if highest_score >= 3 and len(highest_directions) == 1 else None

  bold_option_ids = {
    "bold", "different", "moment", "dramatic", "statement", "clear", "photo", "video",
  }
  soft_option_ids = {"familiar", "quick", "natural", "quiet", "lasting", "standard"}
  bold_signal = bool(bold_option_ids.intersection(option_ids)) or _signal_count(
    answer_text,
    ("확실한 반전", "과감", "강한", "선명", "등장부터", "장면 만들기", "드라마틱"),
  ) > 0
  soft_signal = bool(soft_option_ids.intersection(option_ids)) or _signal_count(
    answer_text,
    ("익숙한", "빠르게", "자연스럽", "조용", "편안", "은은"),
  ) > 0

  if bold_signal and direction in {None, "natural_neutral"}:
    return "dramatic_berry"
  if direction:
    return direction
  if soft_signal:
    return "natural_neutral"
  return None


def deterministic_recommendation_v2(
  context_snapshot: dict[str, Any],
  answers: list[dict[str, Any]],
  questions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
  context_snapshot = sanitize_recommendation_context(context_snapshot)
  analysis = context_snapshot.get("analysisReport")
  if not isinstance(analysis, dict):
    analysis = {}
  profile = context_snapshot.get("profile")
  if not isinstance(profile, dict):
    profile = {}
  presentation = str(profile.get("presentation") or "neutral")
  if presentation not in {"feminine", "masculine", "neutral"}:
    presentation = "neutral"
  profile_direction = {
    "feminine": "여성적인 선과 생기를 살린",
    "masculine": "색조를 절제하고 윤곽과 결을 정돈한",
    "neutral": "성별에 치우치지 않는 균형과 정돈을 살린",
  }[presentation]
  selection = context_snapshot.get("selection")
  if not isinstance(selection, dict):
    selection = {}
  situation = selection.get("situation") if isinstance(selection.get("situation"), dict) else {}
  keyword = selection.get("keyword") if isinstance(selection.get("keyword"), dict) else {}

  scenario = str(
    keyword.get("label")
    or selection.get("customSituationLabel")
    or selection.get("customSituationText")
    or situation.get("label")
    or "선택한 상황"
  ).strip()[:40] or "선택한 상황"
  answer_labels, _option_ids, _answer_text = _resolved_answer_signals(answers, questions)
  context_summary = [scenario]
  for label, value in (
    ("퍼스널 컬러", analysis.get("personalColor")),
    ("얼굴형 참고", analysis.get("faceShape")),
  ):
    if value:
      context_summary.append(f"{label}: {str(value).strip()[:80]}")
  context_summary.extend(f"응답: {value}" for value in answer_labels[:4])

  area_specs = {
    "base": ("베이스", "얇고 균일한 피부 표현", "얼굴 중심에서 바깥쪽으로 얇게", "소량씩 두드려 경계를 정리"),
    "brow": ("브로우", "인상을 정돈하는 자연스러운 눈썹", "본래 눈썹 결을 따라 빈 곳만 채우기", "앞머리는 옅게, 꼬리는 짧고 선명하게"),
    "eye": ("아이", "눈매의 깊이와 선명도 조절", "쌍꺼풀 선 안쪽과 눈꼬리 중심", "경계를 충분히 풀어 한 겹씩 쌓기"),
    "cheek": ("치크", "얼굴에 생기와 입체감 더하기", "볼 중심에서 관자 방향으로 얇게", "남은 양으로 가장자리부터 연결"),
    "lip": ("립", "전체 인상을 마무리하는 입술 표현", "입술 안쪽부터 외곽으로 번지듯", "얇게 한 번 바른 뒤 중심만 덧바르기"),
  }
  role_specs = (
    ("anchor", "밸런스 룩", "정돈되고 편안한 균형", 15, "easy", {
      "base": ("뉴트럴 베이지", "#D9B49A", "얇은 세미 글로우"),
      "brow": ("내추럴 브라운", "#795548", "보송한 파우더"),
      "eye": ("소프트 토프", "#9B7F74", "은은한 새틴"),
      "cheek": ("로지 피치", "#D98E8E", "맑은 쉬어"),
      "lip": ("뮤티드 로즈", "#A85D68", "편안한 세미 글로우"),
    }),
  )
  presentation_palette_overrides = {
    "feminine": {},
    "masculine": {
      "anchor": {
        "eye": ("뮤티드 토프", "#85766F", "차분한 소프트 매트"),
        "cheek": ("뉴트럴 베이지", "#B9937F", "색감을 절제한 쉬어"),
        "lip": ("로즈 베이지", "#916B63", "자연스러운 세미 매트"),
      },
      "bold": {
        "eye": ("코코아 브라운", "#684E46", "밀도 있는 소프트 매트"),
        "cheek": ("웜 탄", "#A97862", "얇은 새틴"),
        "lip": ("뮤티드 브릭", "#824F47", "정돈된 벨벳"),
      },
      "discovery": {
        "eye": ("스모키 토프", "#756866", "잔잔한 새틴"),
        "cheek": ("더스티 베이지", "#B18D80", "부드러운 쉬어"),
        "lip": ("모브 브라운", "#80615F", "가벼운 블러"),
      },
    },
    "neutral": {
      "anchor": {
        "eye": ("뉴트럴 토프", "#8B7B75", "은은한 새틴"),
        "cheek": ("피치 베이지", "#C08E7C", "맑고 얇은 쉬어"),
        "lip": ("뉴트럴 로즈", "#986C6B", "편안한 세미 글로우"),
      },
      "bold": {
        "eye": ("딥 토프", "#6F5756", "밀도 있는 새틴"),
        "cheek": ("뮤티드 로즈 베이지", "#B47D78", "선명도를 낮춘 쉬어"),
        "lip": ("딥 뉴트럴 로즈", "#815054", "부드러운 벨벳"),
      },
      "discovery": {
        "eye": ("모브 토프", "#817078", "잔잔한 쉬머"),
        "cheek": ("더스티 로즈 베이지", "#B98A86", "부드러운 쉬어"),
        "lip": ("뮤티드 모브", "#85656F", "촉촉한 블러"),
      },
    },
  }[presentation]
  semantic_palette_key = _fallback_palette_key(
    analysis,
    selection,
    answers,
    questions,
  )
  semantic_palette_overrides = (
    FALLBACK_SEMANTIC_PALETTES[semantic_palette_key]
    if semantic_palette_key is not None
    else {}
  )


  applied_conditions = context_summary[:8] or [scenario]
  looks: list[dict[str, Any]] = []
  for role, title_suffix, direction, duration, difficulty, palette in role_specs:
    palette = {
      **palette,
      **presentation_palette_overrides.get(role, {}),
      **semantic_palette_overrides.get(role, {}),
    }
    direction = f"{profile_direction} {direction}"
    guides = []
    for area, (label, goal, placement, technique) in area_specs.items():
      color_name, color_hex, texture = palette[area]
      guides.append({
        "area": area,
        "label": label,
        "goal": f"{direction}을 살리는 {goal}",
        "color": {"name": color_name, "hex": color_hex},
        "texture": texture,
        "placement": placement,
        "technique": technique,
        "steps": [{"order": 1, "instruction": technique}],
        "reason": f"{scenario} 상황과 선택한 답변을 함께 반영했습니다.",
        "avoid": ["한 번에 많은 양을 올려 경계가 두꺼워지지 않게 해주세요."],
        "products": [],
        "arSupported": True,
      })
    looks.append({
      "id": role,
      "role": role,
      "title": f"{scenario} {title_suffix}"[:100],
      "summary": f"{scenario}에 맞춰 {direction}을 중심으로 구성한 메이크업입니다.",
      "reasons": [
        f"선택한 {scenario} 상황을 기준으로 구성했습니다.",
        "얼굴 분석 보고서와 역질문 답변을 함께 참고했습니다.",
      ],
      "appliedConditions": applied_conditions,
      "durationMinutes": duration,
      "difficulty": difficulty,
      "areaGuides": guides,
      "imageBrief": (
        f"인물의 고유한 얼굴 특징은 유지하고 {scenario}에 어울리는 "
        f"{direction} 메이크업만 자연스럽게 적용"
      ),
    })

  time_budget_minutes = resolve_prep_time_budget_minutes(questions, answers)
  detailed = enrich_makeup_application_plans(
    {
      "contextSummary": context_summary[:8] or [scenario],
      "looks": looks,
    },
    max_total_minutes=time_budget_minutes,
  )
  finalized = finalize_recommendation_metadata(
    detailed,
    context_snapshot,
    answers,
    questions,
    generation_source="deterministic_fallback",
  )
  return GeneratedMakeupRecommendationV2.model_validate(finalized).model_dump(by_alias=True)


def require_claude_recommendation_v2(recommendation: dict[str, Any]) -> dict[str, Any]:
  """Reject non-provider recipes before they can become user-visible reports."""
  match_assessment = (
    recommendation.get("matchAssessment")
    if isinstance(recommendation.get("matchAssessment"), dict)
    else {}
  )
  if (
    recommendation.get("generationSource") != "claude"
    or match_assessment.get("generationSource") != "claude"
  ):
    raise AppError(
      502,
      "MAKEUP_RECOMMENDATION_GENERATION_SOURCE_INVALID",
      "Only a validated AI-generated makeup recommendation can be saved as a report.",
    )
  return recommendation


async def generate_recommendation_v2(
  settings: Settings,
  context_snapshot: dict[str, Any],
  questions: list[dict[str, Any]],
  answers: list[dict[str, Any]],
) -> dict[str, Any]:
  context_snapshot = sanitize_recommendation_context(context_snapshot)
  time_budget_minutes = resolve_prep_time_budget_minutes(questions, answers)
  try:
    response = await generate_json(
      settings,
      settings.effective_recommendation_model_id,
      RECOMMENDATION_V2_SYSTEM_PROMPT,
      build_recommendation_prompt(context_snapshot, questions, answers),
      max_tokens=settings.makeup_recommendation_max_tokens,
      timeout_seconds=settings.makeup_recommendation_provider_timeout_seconds,
      # A report generation is one billable provider request. Invalid JSON is a
      # failed attempt, not permission to make a second hidden model call.
      allow_provider_retries=False,
    )
  except AppError:
    logger.warning(
      "[aura:makeup-recommendation] recommendation-v2:provider-failed modelId=%s",
      settings.effective_recommendation_model_id,
      exc_info=True,
    )
    raise
  except Exception as exc:
    logger.exception(
      "[aura:makeup-recommendation] recommendation-v2:provider-failed-unexpected modelId=%s",
      settings.effective_recommendation_model_id,
    )
    raise AppError(
      502,
      "MAKEUP_RECOMMENDATION_PROVIDER_FAILED",
      "The AI makeup recommendation provider failed.",
      {"errorType": type(exc).__name__},
    ) from exc

  try:
    response = _normalize_recommendation_tool_response(response)
    enriched = enrich_makeup_application_plans(
      response,
      max_total_minutes=time_budget_minutes,
    )
    finalized = finalize_recommendation_metadata(
      enriched,
      context_snapshot,
      answers,
      questions,
      generation_source="claude",
    )
    validated = GeneratedMakeupRecommendationV2.model_validate(finalized).model_dump(by_alias=True)
    return require_claude_recommendation_v2(validated)
  except ValidationError as exc:
    validation_errors = exc.errors(include_input=False)
    logger.warning(
      "[aura:makeup-recommendation] recommendation-v2:validation-failed modelId=%s errors=%s",
      settings.effective_recommendation_model_id,
      validation_errors,
    )
    raise AppError(
      502,
      "MAKEUP_RECOMMENDATION_OUTPUT_INVALID",
      "The AI makeup recommendation response did not satisfy the report contract.",
      {
        "modelId": settings.effective_recommendation_model_id,
        "validationErrors": [
          {
            "field": ".".join(str(part) for part in error.get("loc", ())),
            "type": str(error.get("type") or "validation_error"),
          }
          for error in validation_errors[:16]
        ],
      },
    ) from exc
