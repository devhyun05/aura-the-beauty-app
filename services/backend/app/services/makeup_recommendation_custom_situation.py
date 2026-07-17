from __future__ import annotations

import logging
import re
import unicodedata
from collections import Counter
from typing import Any, Literal, TypedDict

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.bedrock_guardrails import assert_bedrock_guardrail_input_allowed


logger = logging.getLogger(__name__)

MAX_CUSTOM_SITUATION_LENGTH = 240
GENERAL_SEARCH_DENIED_TOPIC_NAME = "General Search And Recommendations"

CustomSituationIntentType = Literal["needs_detail", "noise", "valid_context"]


class CustomSituationIntentResult(TypedDict):
  intentType: CustomSituationIntentType
  normalizedText: str
  originalText: str


NOISE_MESSAGE = "의미 있는 상황을 한 문장으로 적어주세요."
NEEDS_DETAIL_MESSAGE = "어디에서 또는 언제 사용할 메이크업인지 조금만 더 적어주세요."
OUT_OF_SCOPE_MESSAGE = "메이크업을 사용할 때나 장소를 중심으로 적어주세요."
PII_MESSAGE = "개인정보는 빼고 언제 또는 어디에서 사용할지 적어주세요."
MEDICAL_MESSAGE = "진단·치료 요청 대신 메이크업을 사용할 상황만 적어주세요."
UNSAFE_MESSAGE = "모델 지시가 아닌 메이크업 상황만 설명해 주세요."
GUARDRAIL_MESSAGE = OUT_OF_SCOPE_MESSAGE

LATIN_KEYBOARD_MASH_PATTERN = re.compile(
  r"^(?:asdf|qwer|zxcv|hjkl|fdsa|rewq|vcxz|qwerty|asdfgh|zxcvbn)+$",
  re.IGNORECASE,
)
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
SITUATION_SYNTAX_PATTERN = re.compile(
  r"(?:[가-힣A-Za-z0-9]{2,}(?:에서|에\s*가|갈\s*때|가는\s*날|만나는\s*날|찍는\s*날|참석))|"
  r"(?:(?:친구|여친|남친|애인|썸남|썸녀).{0,12}(?:만나|약속|외출))",
  re.IGNORECASE,
)
GENERIC_ENVIRONMENT_PATTERN = re.compile(r"(?:야외|실내)(?:에서)?")
MEDICAL_CONTEXT_PATTERN = re.compile(
  r"(?:복용|수술|약물|여드름약|진료|처방|치료).{0,10}(?:받은|예정|중|때문|후)",
)

VAGUE_EXACT_TERMS = {
  "그거",
  "그냥",
  "그냥해",
  "글쎄",
  "몰라",
  "모르겠어",
  "뭐",
  "뭐하지",
  "아무거나",
  "알아서",
  "어떻게",
  "예쁘게",
  "이거",
  "자연스럽게",
  "저거",
  "화장",
  "메이크업",
  "야외",
  "야외에서",
  "실내",
  "실내에서",
}

SITUATION_ANCHORS = {
  "결혼식",
  "공연",
  "공항",
  "기념일",
  "중요한 날",
  "특별한 날",
  "놀이공원",
  "데이트",
  "등교",
  "면접",
  "모임",
  "북토크",
  "생일",
  "세미나",
  "술집",
  "무대",
  "발표",
  "소개팅",
  "수업",
  "약속",
  "야구장",
  "야시장",
  "여행",
  "연말",
  "예식",
  "오피스",
  "외출",
  "운동",
  "입학",
  "일상",
  "전시",
  "증명사진",
  "촬영",
  "출근",
  "축제",
  "카페",
  "클럽",
  "콘서트",
  "파티",
  "팝업",
  "페스티벌",
  "피크닉",
  "학교",
  "회사",
  "회식",
  "cafe",
  "date",
  "interview",
  "office",
  "party",
}

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

IMPRESSION_TERMS = {
  "가볍",
  "깔끔",
  "단정",
  "또렷",
  "맑게",
  "분위기",
  "예쁘",
  "사진발",
  "선명",
  "오래",
  "유지",
  "자연",
  "차분",
  "트렌디",
  "화사",
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

SAFETY_CONDITION_TERMS = {"눈시림", "라텍스", "민감", "알레르기", "자극", "향료"}
SAFETY_AVOIDANCE_TERMS = {"빼고", "사용하지", "안 쓰", "제외", "피하고", "피해", "avoid"}

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

EXTERNAL_REQUEST_TERMS = {
  "골라줘",
  "구매",
  "알려",
  "링크",
  "알려줘",
  "어디",
  "얼마",
  "예약",
  "주문",
  "추천",
  "추천해줘",
  "찾아",
  "찾아줘",
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


def _has_safety_constraint(value: str) -> bool:
  return _contains_any(value, SAFETY_CONDITION_TERMS) and _contains_any(
    value,
    SAFETY_AVOIDANCE_TERMS,
  )


def _has_explicit_situation_context(value: str) -> bool:
  situation_value = GENERIC_ENVIRONMENT_PATTERN.sub(" ", value)
  return _contains_any(situation_value, SITUATION_ANCHORS) or bool(SITUATION_SYNTAX_PATTERN.search(situation_value))


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


def _is_noise(value: str) -> bool:
  compact = _compact_text(value)
  if len(compact) < 2:
    return True

  hangul_syllables = len(re.findall(r"[가-힣]", compact))
  hangul_jamo = len(re.findall(r"[ㄱ-ㅎㅏ-ㅣ]", compact))
  latin_letters = len(re.findall(r"[a-z]", compact))
  if hangul_syllables + latin_letters == 0:
    return True
  if hangul_syllables == 0 and hangul_jamo / len(compact) > 0.5:
    return True

  if len(compact) >= 4:
    repeated_ratio = max(Counter(compact).values()) / len(compact)
    if repeated_ratio >= 0.7:
      return True

  if re.fullmatch(r"[a-z]+", compact):
    return bool(LATIN_KEYBOARD_MASH_PATTERN.fullmatch(compact)) or (
      len(compact) >= 4 and not re.search(r"[aeiou]", compact)
    )
  return False


def _has_context(value: str) -> bool:
  return _has_explicit_situation_context(value)


def classify_custom_situation_text(value: Any) -> CustomSituationIntentResult:
  original = clean_custom_situation_text(value)
  if _is_noise(original):
    return {"intentType": "noise", "normalizedText": "", "originalText": original}

  compact = _compact_text(original)
  if compact in {_compact_text(term) for term in VAGUE_EXACT_TERMS}:
    return {"intentType": "needs_detail", "normalizedText": "", "originalText": original}

  if _has_context(original):
    return {
      "intentType": "valid_context",
      "normalizedText": original,
      "originalText": original,
    }

  has_direction_only = _contains_any(original, MAKEUP_TERMS | IMPRESSION_TERMS)
  has_incomplete_safety_context = _contains_any(original, SAFETY_CONDITION_TERMS)
  if len(compact) <= 3 or has_direction_only or has_incomplete_safety_context:
    return {"intentType": "needs_detail", "normalizedText": "", "originalText": original}

  return {"intentType": "needs_detail", "normalizedText": "", "originalText": original}


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

  has_external_topic = _contains_any(value, EXTERNAL_SEARCH_TERMS)
  has_external_request = _contains_any(value, EXTERNAL_REQUEST_TERMS)
  has_makeup_context = _contains_any(value, MAKEUP_TERMS)
  has_situation_context = _contains_any(value, SITUATION_ANCHORS)
  has_impression_context = _contains_any(value, IMPRESSION_TERMS)
  if _contains_any(value, OUT_OF_SCOPE_DOMAIN_TERMS):
    return "out_of_scope"
  if has_external_topic and (has_external_request or not _has_context(value)):
    return "out_of_scope"
  if has_external_request and not has_makeup_context and not (
    has_situation_context and has_impression_context
  ):
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
  if classification["intentType"] == "noise":
    raise AppError(422, "MAKEUP_CUSTOM_SITUATION_INVALID", NOISE_MESSAGE, {"field": field})

  reason = _local_block_reason(original)
  if reason:
    logger.warning(
      "[aura:makeup-recommendation] custom-situation:blocked reason=%s length=%s",
      reason,
      len(original),
    )
    _raise_local_error(reason, field=field)
  if classification["intentType"] == "needs_detail":
    raise AppError(422, "MAKEUP_CUSTOM_SITUATION_NEEDS_DETAIL", NEEDS_DETAIL_MESSAGE, {"field": field})
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
    if _is_only_general_search_denied_topic(exc.details):
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
