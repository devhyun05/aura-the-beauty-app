from __future__ import annotations

import logging
import re
import unicodedata
from typing import Any, Literal, TypedDict

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.bedrock_guardrails import assert_bedrock_guardrail_input_allowed


logger = logging.getLogger(__name__)

MAX_CUSTOM_SITUATION_LENGTH = 240
GENERAL_SEARCH_DENIED_TOPIC_NAME = "General Search And Recommendations"

CustomSituationIntentType = Literal["noise", "valid_context"]


class CustomSituationIntentResult(TypedDict):
  intentType: CustomSituationIntentType
  normalizedText: str
  originalText: str


NOISE_MESSAGE = "원하는 메이크업 상황이나 분위기를 적어주세요."
OUT_OF_SCOPE_MESSAGE = "메이크업 상황, 역할 또는 원하는 분위기를 중심으로 적어주세요."
PII_MESSAGE = "개인정보는 빼고 원하는 메이크업 상황이나 분위기만 적어주세요."
MEDICAL_MESSAGE = "진단·치료 요청 대신 메이크업을 사용할 상황만 적어주세요."
UNSAFE_MESSAGE = "모델 지시가 아닌 메이크업 상황만 설명해 주세요."
GUARDRAIL_MESSAGE = OUT_OF_SCOPE_MESSAGE

EMAIL_PATTERN = re.compile(
  r"(?<![A-Za-z0-9_.+-])[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![A-Za-z0-9_.-])",
)
PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+?82|0)\s*[-.)]?\s*\d{1,3}(?:\s*[-.]?\s*\d){6,10}(?!\d)")
RESIDENT_ID_PATTERN = re.compile(r"(?<!\d)\d{6}\s*[-.]?\s*\d{7}(?!\d)")
LONG_IDENTIFIER_PATTERN = re.compile(r"(?<!\d)(?:\d[\s-]?){12,18}\d(?!\d)")
PASSPORT_PATTERN = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]\d{8}(?![A-Za-z0-9])")

PROMPT_CONTROL_PATTERN = re.compile(
  r"(?:ignore|forget|disregard|override).{0,40}(?:instruction|rule|prompt|message)|"
  r"(?:respond|output)\s+only|"
  r"(?:이전|모든|시스템|개발자).{0,24}(?:지시|명령|프롬프트|메시지).{0,24}(?:무시|공개|출력|보여|알려)|"
  r"(?:지시|명령|규칙|프롬프트).{0,24}(?:무시|변경|제거)",
  re.IGNORECASE,
)
ROLE_TAG_PATTERN = re.compile(r"<\s*/?\s*(?:script|system|assistant|developer)\b", re.IGNORECASE)
MEDICAL_CONTEXT_PATTERN = re.compile(
  r"(?:복용|수술|약물|여드름약|진료|처방|치료).{0,10}(?:받은|예정|중|때문|후)",
)

MAKEUP_TERMS = {
  "메이크업",
  "화장",
  "꾸안꾸",
  "내추럴",
  "립",
  "베이스",
  "블러셔",
  "섀도",
  "아이라인",
  "마스카라",
  "눈썹",
  "피부표현",
  "톤",
}

PII_TERMS = {
  "계좌번호",
  "면허번호",
  "여권번호",
  "이메일",
  "주민번호",
  "주소",
  "카드번호",
  "휴대폰번호",
  "전화번호",
}

MEDICAL_ADVICE_PHRASES = {
  "무슨 약",
  "병원 어디",
  "병원 찾아",
  "병원 추천",
  "복용법",
  "약 골라",
  "약 먹어도",
  "약 발라도",
  "약 추천",
  "어떤 약",
  "의사 찾아",
  "의사 추천",
  "진단해",
  "처방해",
  "치료법",
}
MEDICAL_ACTION_TERMS = {"복용", "수술", "약물", "여드름약", "진단", "진료", "처방", "치료"}
MEDICAL_REQUEST_MARKERS = {
  "가능",
  "괜찮아",
  "골라",
  "뭐",
  "방법",
  "알려",
  "어떻게",
  "추천",
  "해도 돼",
  "해줘",
}

EXTERNAL_SEARCH_TERMS = {
  "가격",
  "검색",
  "날씨",
  "뉴스",
  "맛집",
  "메뉴",
  "숙소",
  "시세",
  "식당",
  "예약",
  "영업시간",
  "주가",
  "주문",
  "코인",
  "투자",
  "항공권",
  "환율",
}

NON_MAKEUP_TASK_TERMS = {
  "가방",
  "데이트 장소",
  "드라마",
  "레시피",
  "매물",
  "번역",
  "부동산",
  "신발",
  "스킨케어",
  "여행지",
  "옷",
  "의상",
  "영화",
  "유튜브",
  "장소",
  "카페",
  "cafe",
  "코디",
  "클립",
  "향수",
  "호텔",
}

EXTERNAL_REQUEST_TERMS = {
  "계산",
  "골라줘",
  "구매",
  "만들어",
  "번역",
  "써줘",
  "알려",
  "링크",
  "알려줘",
  "어디",
  "얼마",
  "예약",
  "요약",
  "주문",
  "작성",
  "추천",
  "추천해줘",
  "찾아",
  "찾아줘",
  "풀어",
  "해결",
}

OUT_OF_SCOPE_DOMAIN_TERMS = {
  "논문",
  "레시피",
  "번역",
  "수학",
  "숙제",
  "코드",
  "코딩",
}

SITUATION_CONTEXT_TERMS = {
  "결혼식",
  "기념일",
  "내일",
  "데이트",
  "등교",
  "로판",
  "메이크업",
  "모임",
  "무도회",
  "분위기",
  "생일",
  "상황",
  "아무거나",
  "약속",
  "역할",
  "예쁘",
  "여행",
  "일정",
  "자연스럽",
  "장면",
  "주인공",
  "출근",
  "촬영",
  "코스프레",
  "트렌디",
  "파티",
  "페스티벌",
  "회사",
}

STRONG_SITUATION_DIRECTION_TERMS = {
  "갈 때",
  "가는 날",
  "같은 분위기",
  "결혼식",
  "맞게",
  "발표",
  "분위기로",
  "어울",
  "연출",
  "처럼",
  "촬영",
  "하는 날",
  "할 때",
}

MAKEUP_TERM_FALSE_POSITIVES = {"베이스볼", "마라톤", "스크립트", "클립"}


def clean_custom_situation_text(value: Any) -> str:
  if not isinstance(value, str):
    return ""
  normalized = unicodedata.normalize("NFKC", value)
  normalized = normalized.replace("\t", " ").replace("\n", " ").replace("\r", " ")
  normalized = "".join(
    character
    for character in normalized
    if unicodedata.category(character) not in {"Cc", "Cf", "Cs"}
  )
  return " ".join(normalized.split()).strip()


def _compact_text(value: str) -> str:
  return re.sub(r"[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]+", "", value.casefold())


def _contains_any(value: str, terms: set[str]) -> bool:
  compact = _compact_text(value)
  return any(_compact_text(term) in compact for term in terms)


def _contains_makeup_context(value: str) -> bool:
  compact = _compact_text(value)
  for term in MAKEUP_TERM_FALSE_POSITIVES:
    compact = compact.replace(_compact_text(term), "")
  return any(_compact_text(term) in compact for term in MAKEUP_TERMS)


def _looks_like_medical_advice_request(value: str) -> bool:
  if _contains_any(value, MEDICAL_ADVICE_PHRASES):
    return True
  has_action_request = _contains_any(value, MEDICAL_ACTION_TERMS) and _contains_any(
    value,
    MEDICAL_REQUEST_MARKERS,
  )
  if not has_action_request:
    return False
  return not (_contains_any(value, MAKEUP_TERMS) and MEDICAL_CONTEXT_PATTERN.search(value))


def _looks_like_explicit_non_makeup_task(value: str) -> bool:
  """Separate an external task request from a makeup situation described in endpoint context."""
  has_request = _contains_any(value, EXTERNAL_REQUEST_TERMS)
  has_makeup_context = _contains_makeup_context(value)
  if not has_request or has_makeup_context:
    return False

  has_strong_situation_direction = _contains_any(
    value,
    STRONG_SITUATION_DIRECTION_TERMS,
  )
  known_non_makeup_topic = _contains_any(
    value,
    EXTERNAL_SEARCH_TERMS | NON_MAKEUP_TASK_TERMS | OUT_OF_SCOPE_DOMAIN_TERMS,
  )
  if has_strong_situation_direction:
    return False

  if known_non_makeup_topic:
    return True

  return not _contains_any(value, SITUATION_CONTEXT_TERMS)


def classify_custom_situation_text(value: Any) -> CustomSituationIntentResult:
  original = clean_custom_situation_text(value)
  if not original:
    return {"intentType": "noise", "normalizedText": "", "originalText": ""}
  return {
    "intentType": "valid_context",
    "normalizedText": original,
    "originalText": original,
  }


def _local_block_reason(value: str) -> Literal["medical", "out_of_scope", "pii", "unsafe"] | None:
  if (
    EMAIL_PATTERN.search(value)
    or PHONE_PATTERN.search(value)
    or RESIDENT_ID_PATTERN.search(value)
    or LONG_IDENTIFIER_PATTERN.search(value)
    or PASSPORT_PATTERN.search(value)
    or _contains_any(value, PII_TERMS)
  ):
    return "pii"

  if PROMPT_CONTROL_PATTERN.search(value) or ROLE_TAG_PATTERN.search(value) or "```" in value:
    return "unsafe"

  if _looks_like_medical_advice_request(value):
    return "medical"

  if _looks_like_explicit_non_makeup_task(value):
    return "out_of_scope"
  return None


def _raise_local_error(reason: str, *, field: str) -> None:
  if reason == "pii":
    raise AppError(422, "MAKEUP_CUSTOM_SITUATION_PII", PII_MESSAGE, {"field": field})
  if reason == "medical":
    raise AppError(422, "MAKEUP_CUSTOM_SITUATION_MEDICAL", MEDICAL_MESSAGE, {"field": field})
  if reason == "unsafe":
    raise AppError(422, "MAKEUP_CUSTOM_SITUATION_UNSAFE", UNSAFE_MESSAGE, {"field": field})
  raise AppError(422, "MAKEUP_CUSTOM_SITUATION_OUT_OF_SCOPE", OUT_OF_SCOPE_MESSAGE, {"field": field})


def validate_custom_situation_text(value: Any, *, field: str = "customSituationText") -> str:
  classification = classify_custom_situation_text(value)
  original = classification["originalText"]
  if not original:
    raise AppError(422, "MAKEUP_CUSTOM_SITUATION_EMPTY", NOISE_MESSAGE, {"field": field})
  if len(original) > MAX_CUSTOM_SITUATION_LENGTH:
    raise AppError(
      422,
      "MAKEUP_CUSTOM_SITUATION_TOO_LONG",
      f"상황은 {MAX_CUSTOM_SITUATION_LENGTH}자 이내로 적어주세요.",
      {"field": field, "maxLength": MAX_CUSTOM_SITUATION_LENGTH},
    )
  reason = _local_block_reason(original)
  if reason:
    logger.warning(
      "[aura:makeup-recommendation] custom-situation:blocked reason=%s length=%s",
      reason,
      len(original),
    )
    _raise_local_error(reason, field=field)
  return classification["normalizedText"]


def _is_only_general_search_denied_topic(details: dict[str, Any]) -> bool:
  detected = details.get("detected")
  if not isinstance(detected, list) or not detected:
    return False
  items = [item for item in detected if isinstance(item, dict)]
  return len(items) == len(detected) and all(
    item.get("policy") == "topic"
    and item.get("name") == GENERAL_SEARCH_DENIED_TOPIC_NAME
    and item.get("action") == "BLOCKED"
    for item in items
  )


async def validate_custom_situation_for_request(
  value: Any,
  settings: Settings,
  *,
  field: str = "customSituationText",
) -> str:
  normalized = validate_custom_situation_text(value, field=field)
  try:
    await assert_bedrock_guardrail_input_allowed(
      normalized,
      settings,
      context="makeup_recommendation_custom_situation",
    )
  except AppError as exc:
    if exc.code != "FEEDBACK_GOAL_GUARDRAIL_BLOCKED":
      raise
    if (
      _is_only_general_search_denied_topic(exc.details)
      and not _looks_like_explicit_non_makeup_task(normalized)
    ):
      logger.warning(
        "[aura:makeup-recommendation] custom-situation:guardrail-bypass "
        "reason=general-search-false-positive length=%s",
        len(normalized),
      )
      return normalized
    raise AppError(
      400,
      "MAKEUP_CUSTOM_SITUATION_GUARDRAIL_BLOCKED",
      GUARDRAIL_MESSAGE,
      exc.details,
    ) from exc
  return normalized
