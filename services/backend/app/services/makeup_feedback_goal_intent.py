from __future__ import annotations

import logging
import re
from collections import Counter
from typing import Any, Literal, TypedDict


from app.core.errors import AppError
from app.core.settings import Settings
from app.services.bedrock_guardrails import assert_bedrock_guardrail_input_allowed


logger = logging.getLogger(__name__)

GoalIntentType = Literal["generic_default", "needs_detail", "noise", "valid_context"]
NOISE_GOAL_MESSAGE = "의미 있는 상황을 한 문장으로 적어주세요."
NEEDS_DETAIL_GOAL_MESSAGE = "어떤 상황에서 보일 메이크업인지 한 문장만 더 적어주세요."
LATIN_KEYBOARD_MASH_PATTERN = re.compile(
  r"^(?:asdf|qwer|zxcv|hjkl|fdsa|rewq|vcxz|qwerty|asdfgh|zxcvbn)+$",
  re.IGNORECASE,
)

GENERIC_REQUEST_KEYWORDS = {
  "괜찮",
  "고쳐",
  "균형",
  "그냥",
  "대충",
  "문제",
  "봐줘",
  "봐 줘",
  "봐달",
  "보여",
  "분석",
  "아무거나",
  "알아서",
  "어때",
  "어떤지",
  "전체",
  "전반",
  "평가",
  "피드백",
}

CONTEXT_ANCHOR_KEYWORDS = {
  "가볍",
  "결혼식",
  "공연",
  "과하",
  "깔끔",
  "꾸안꾸",
  "내추럴",
  "눈",
  "눈썹",
  "데이트",
  "데일리",
  "들떠",
  "립",
  "마스카라",
  "면접",
  "모임",
  "무대",
  "발색",
  "발표",
  "블러셔",
  "사진",
  "색감",
  "섀도",
  "소개팅",
  "수업",
  "약속",
  "여행",
  "연말",
  "예식",
  "오피스",
  "외출",
  "운동",
  "입학",
  "자연",
  "증명",
  "차분",
  "촬영",
  "출근",
  "축제",
  "치크",
  "카페",
  "커버",
  "톤",
  "파티",
  "피부",
  "학교",
  "화사",
  "회사",
  "회식",
  "cafe",
  "date",
  "daily",
  "interview",
  "office",
  "party",
  "photo",
}


VAGUE_EXACT_TERMS = {
  "그거",
  "그것",
  "그냥해",
  "글쎄",
  "나어떻게",
  "남친",
  "남자친구",
  "몰라",
  "모르겠어",
  "모르겠음",
  "모름",
  "뭐",
  "뭐하지",
  "여자친구",
  "여친",
  "애인",
  "어떡해",
  "어떻게",
  "어떻게해",
  "어쩌라고",
  "이거",
  "이것",
  "이렇게",
  "저거",
  "저것",
  "저렇게",
  "친구",
}
VAGUE_FRAGMENTS = ["에베베", "메롱", "몰라", "모르겠", "어쩌라고", "어떡할건데", "나어떻게"]
RELATION_WORDS = ["여친", "남친", "여자친구", "남자친구", "친구", "애인", "썸남", "썸녀"]
ACTION_OR_PLACE_FRAGMENTS = [
  "가",
  "감",
  "갈",
  "가는",
  "가야",
  "나가",
  "만나",
  "만남",
  "보기",
  "볼",
  "찍",
  "카페",
  "회식",
  "약속",
  "데이트",
  "외출",
]
USER_FACING_INTENSITY_TERMS = {
  "light": ("가벼운", "가벼운 표현", "가벼운 표현으로"),
  "medium": ("적당한", "적당한 강도", "적당한 강도로"),
  "bold": ("선명한", "선명한 표현", "선명한 표현으로"),
}


def localize_makeup_feedback_intensity_terms(value: str) -> str:
  """Translate raw API intensity enums when they leak into Korean UI copy."""
  localized = value

  for raw, (adjective, noun, instrumental) in USER_FACING_INTENSITY_TERMS.items():
    token = re.escape(raw)
    localized = re.sub(
      rf"(?<![A-Za-z0-9_]){token}(?:으)?로(?![A-Za-z0-9_])",
      instrumental,
      localized,
      flags=re.IGNORECASE,
    )
    localized = re.sub(
      rf"(?<![A-Za-z0-9_]){token}한(?![A-Za-z0-9_])",
      adjective,
      localized,
      flags=re.IGNORECASE,
    )
    localized = re.sub(
      rf"(?<![A-Za-z0-9_]){token}인(?![A-Za-z0-9_])",
      f"{noun}인",
      localized,
      flags=re.IGNORECASE,
    )
    localized = re.sub(
      rf"(?<![A-Za-z0-9_]){token}(?![A-Za-z0-9_])",
      noun,
      localized,
      flags=re.IGNORECASE,
    )

  return localized




class GoalIntentResult(TypedDict):
  intentType: GoalIntentType
  normalizedGoalText: str
  originalGoalText: str


def clean_goal_text(value: Any) -> str:
  if not isinstance(value, str):
    return ""

  return " ".join(value.split()).strip()


def _compact_text(value: str) -> str:
  return re.sub(r"\s+", "", value).lower()


def _has_keyword(value: str, keywords: set[str]) -> bool:
  return any(keyword in value for keyword in keywords)


def _repeated_character_ratio(value: str) -> float:
  if not value:
    return 1.0

  counts = Counter(value)
  return max(counts.values()) / len(value)


def is_clearly_noise_goal_text(value: str) -> bool:
  compact = _compact_text(value)

  if len(compact) < 2:
    return True

  hangul_syllable_count = len(re.findall(r"[가-힣]", compact))
  hangul_jamo_count = len(re.findall(r"[ㄱ-ㅎㅏ-ㅣ]", compact))
  latin_letter_count = len(re.findall(r"[A-Za-z]", compact))
  meaningful_letter_count = hangul_syllable_count + latin_letter_count

  if meaningful_letter_count == 0:
    return True

  if hangul_syllable_count == 0 and hangul_jamo_count / len(compact) > 0.5:
    return True

  if len(compact) >= 4 and _repeated_character_ratio(compact) >= 0.7:
    return True

  if re.fullmatch(r"[A-Za-z]+", compact):
    return bool(LATIN_KEYBOARD_MASH_PATTERN.fullmatch(compact)) or (
      len(compact) >= 4 and not re.search(r"[aeiou]", compact, re.IGNORECASE)
    )

  return False


def has_context_anchor(value: str) -> bool:
  lowered = value.lower()
  compact = _compact_text(value)

  if _has_keyword(lowered, CONTEXT_ANCHOR_KEYWORDS):
    return True

  return any(relation in compact for relation in RELATION_WORDS) and any(
    fragment in compact for fragment in ACTION_OR_PLACE_FRAGMENTS
  )


def is_generic_default_request(value: str) -> bool:
  return _has_keyword(value.lower(), GENERIC_REQUEST_KEYWORDS)





def needs_more_detail(value: str) -> bool:
  compact = _compact_text(value)

  if has_context_anchor(value):
    return False

  if compact in VAGUE_EXACT_TERMS:
    return True

  if len(compact) <= 3:
    return True

  if any(fragment in compact for fragment in VAGUE_FRAGMENTS):
    return True

  if any(
    compact == relation or compact == f"{relation}랑" or compact == f"{relation}이랑"
    for relation in RELATION_WORDS
  ):
    return True

  return False


def classify_makeup_feedback_goal_text(value: Any) -> GoalIntentResult:
  original_goal_text = clean_goal_text(value)

  if is_clearly_noise_goal_text(original_goal_text):
    return {
      "intentType": "noise",
      "normalizedGoalText": "",
      "originalGoalText": original_goal_text,
    }


  if has_context_anchor(original_goal_text):
    return {
      "intentType": "valid_context",
      "normalizedGoalText": original_goal_text,
      "originalGoalText": original_goal_text,
    }

  if is_generic_default_request(original_goal_text):
    return {
      "intentType": "generic_default",
      "normalizedGoalText": original_goal_text,
      "originalGoalText": original_goal_text,
    }

  if needs_more_detail(original_goal_text):
    return {
      "intentType": "needs_detail",
      "normalizedGoalText": "",
      "originalGoalText": original_goal_text,
    }

  return {
    "intentType": "valid_context",
    "normalizedGoalText": original_goal_text,
    "originalGoalText": original_goal_text,
  }


def _extract_feedback_goal_input(request_payload: dict[str, Any]) -> tuple[dict[str, Any], str]:
  raw_context = request_payload.get("feedbackContext") or request_payload.get("feedback_context")
  feedback_context = dict(raw_context) if isinstance(raw_context, dict) else {}
  raw_goal_text = clean_goal_text(
    feedback_context.get("originalGoalText")
    or feedback_context.get("original_goal_text")
    or feedback_context.get("userGoalText")
    or feedback_context.get("user_goal_text")
    or request_payload.get("userGoalText")
    or request_payload.get("user_goal_text"),
  )
  return feedback_context, raw_goal_text


def _apply_goal_classification(
  request_payload: dict[str, Any],
  feedback_context: dict[str, Any],
  classification: GoalIntentResult,
) -> None:
  if classification["intentType"] == "noise":
    raise AppError(
      400,
      "FEEDBACK_GOAL_INVALID",
      NOISE_GOAL_MESSAGE,
      {"originalGoalText": classification["originalGoalText"]},
    )

  if classification["intentType"] == "needs_detail":
    raise AppError(
      400,
      "FEEDBACK_GOAL_NEEDS_DETAIL",
      NEEDS_DETAIL_GOAL_MESSAGE,
      {"originalGoalText": classification["originalGoalText"]},
    )


  feedback_context["goalIntentType"] = classification["intentType"]
  feedback_context["normalizedGoalText"] = classification["normalizedGoalText"]
  feedback_context["originalGoalText"] = classification["originalGoalText"]
  feedback_context["userGoalText"] = classification["normalizedGoalText"]
  request_payload["feedbackContext"] = feedback_context


GENERAL_SEARCH_DENIED_TOPIC_NAME = "General Search And Recommendations"
MAKEUP_DOMAIN_TERMS = {
  "메이크업",
  "화장",
  "립",
  "톤",
  "피부",
  "눈썹",
  "아이",
  "블러셔",
  "치크",
  "베이스",
}
GENERAL_SEARCH_TERMS = {
  "카페",
  "맛집",
  "근처",
  "장소",
  "여행",
  "날씨",
  "뉴스",
  "검색",
  "가격",
  "시세",
  "식당",
  "갈만한곳",
}
GENERAL_REQUEST_TERMS = {
  "추천",
  "추천해",
  "알려",
  "알려줘",
  "찾아",
  "찾아줘",
  "검색",
  "짜줘",
  "어디",
  "뭐야",
  "얼마",
}
MAKEUP_CONTEXT_STATEMENT_TERMS = {
  "상황",
  "목적",
  "때",
  "갈때",
  "가야",
  "만나는",
  "만나",
  "데이트",
  "면접",
  "사진",
  "촬영",
  "출근",
  "결혼식",
  "모임",
  "소개팅",
  "여자친구",
  "남자친구",
  "여친",
  "남친",
}


def _contains_compact_term(value: str, terms: set[str]) -> bool:
  compact = _compact_text(value)
  return any(_compact_text(term) in compact for term in terms)


def _looks_like_general_search_request(value: str) -> bool:
  if _contains_compact_term(value, MAKEUP_DOMAIN_TERMS):
    return False

  return _contains_compact_term(value, GENERAL_SEARCH_TERMS) and _contains_compact_term(value, GENERAL_REQUEST_TERMS)


def _is_makeup_context_statement(value: str, classification: GoalIntentResult) -> bool:
  if classification["intentType"] != "valid_context":
    return False

  if _looks_like_general_search_request(value):
    return False

  return _contains_compact_term(value, MAKEUP_DOMAIN_TERMS) or _contains_compact_term(
    value,
    MAKEUP_CONTEXT_STATEMENT_TERMS,
  )


def _is_only_general_search_denied_topic(details: dict[str, Any]) -> bool:
  detected = details.get("detected")
  if not isinstance(detected, list) or not detected:
    return False

  blocked_items = [item for item in detected if isinstance(item, dict) and item.get("action") == "BLOCKED"]
  return bool(blocked_items) and all(
    item.get("policy") == "topic" and item.get("name") == GENERAL_SEARCH_DENIED_TOPIC_NAME for item in blocked_items
  )


def _should_allow_guardrail_general_search_false_positive(
  raw_goal_text: str,
  classification: GoalIntentResult,
  exc: AppError,
) -> bool:
  if exc.code != "FEEDBACK_GOAL_GUARDRAIL_BLOCKED":
    return False

  return _is_only_general_search_denied_topic(exc.details) and _is_makeup_context_statement(raw_goal_text, classification)

def normalize_feedback_goal_context(request_payload: dict[str, Any]) -> None:
  feedback_context, raw_goal_text = _extract_feedback_goal_input(request_payload)
  classification = classify_makeup_feedback_goal_text(raw_goal_text)
  _apply_goal_classification(request_payload, feedback_context, classification)


async def normalize_feedback_goal_context_for_request(
  request_payload: dict[str, Any],
  settings: Settings,
) -> None:
  feedback_context, raw_goal_text = _extract_feedback_goal_input(request_payload)
  classification = classify_makeup_feedback_goal_text(raw_goal_text)

  if classification["intentType"] in {"noise", "needs_detail"}:
    _apply_goal_classification(request_payload, feedback_context, classification)

  try:
    await assert_bedrock_guardrail_input_allowed(
      raw_goal_text,
      settings,
      context="makeup_feedback_goal",
    )
  except AppError as exc:
    if not _should_allow_guardrail_general_search_false_positive(raw_goal_text, classification, exc):
      raise

  _apply_goal_classification(request_payload, feedback_context, classification)