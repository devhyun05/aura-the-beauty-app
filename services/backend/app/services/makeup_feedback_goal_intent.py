from __future__ import annotations

import json
import logging
import re
import unicodedata
from collections import Counter
from typing import Any, Literal, TypedDict


from app.core.errors import AppError
from app.core.settings import Settings
from app.services.bedrock_guardrails import (
  GUARDRAIL_BLOCKED_MESSAGE,
  assert_bedrock_guardrail_input_allowed,
)


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
  "강렬",
  "글램",
  "글로우",
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
  "러블리",
  "립",
  "맑",
  "매트",
  "마스카라",
  "면접",
  "모임",
  "무대",
  "발색",
  "발표",
  "부드러",
  "블러셔",
  "사진",
  "색감",
  "생기",
  "섀도",
  "소개팅",
  "수업",
  "약속",
  "은은",
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
  "청순",
  "촬영",
  "출근",
  "축제",
  "치크",
  "촉촉",
  "클럽",
  "카페",
  "커버",
  "톤",
  "투명",
  "파티",
  "피부",
  "학교",
  "화사",
  "화려",
  "시크",
  "힙",
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

  if _has_keyword(lowered, CONTEXT_ANCHOR_KEYWORDS) or _contains_compact_term(
    value,
    OCCASION_CONTEXT_TERMS,
  ):
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

  # A goal is optional. An empty value deliberately selects the server-owned
  # expert review mode instead of masquerading a fixed default as user input.
  if not original_goal_text:
    return {
      "intentType": "generic_default",
      "normalizedGoalText": "",
      "originalGoalText": "",
    }

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


FEEDBACK_GOAL_CONTEXT_KEYS = (
  ("userGoalText", "user_goal_text"),
  ("originalGoalText", "original_goal_text"),
  ("normalizedGoalText", "normalized_goal_text"),
  ("analysisGoalText", "analysis_goal_text"),
  ("goalIntentType", "goal_intent_type"),
  ("profileGender", "profile_gender"),
)


def extract_feedback_goal_context(request_payload: dict[str, Any]) -> dict[str, Any]:
  """Return the canonical goal context for current and legacy feedback payloads."""
  raw_context = request_payload.get("feedbackContext") or request_payload.get("feedback_context")
  feedback_context = dict(raw_context) if isinstance(raw_context, dict) else {}

  for camel_key, snake_key in FEEDBACK_GOAL_CONTEXT_KEYS:
    value = feedback_context.get(camel_key)
    if value is None:
      value = feedback_context.get(snake_key)
    if value is None:
      value = request_payload.get(camel_key)
    if value is None:
      value = request_payload.get(snake_key)
    if value is not None:
      feedback_context[camel_key] = value
    feedback_context.pop(snake_key, None)

  return feedback_context


def _extract_feedback_goal_input(request_payload: dict[str, Any]) -> tuple[dict[str, Any], str]:
  feedback_context = extract_feedback_goal_context(request_payload)
  raw_goal_text = clean_goal_text(
    feedback_context.get("originalGoalText")
    or feedback_context.get("userGoalText")
  )
  return feedback_context, raw_goal_text


def _apply_goal_classification(
  request_payload: dict[str, Any],
  feedback_context: dict[str, Any],
  classification: GoalIntentResult,
  *,
  analysis_goal_text: str | None = None,
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
  feedback_context.pop("analysisGoalText", None)
  feedback_context.pop("analysis_goal_text", None)
  request_payload.pop("analysisGoalText", None)
  request_payload.pop("analysis_goal_text", None)
  if analysis_goal_text:
    feedback_context["analysisGoalText"] = analysis_goal_text
  request_payload["feedbackContext"] = feedback_context


GENERAL_SEARCH_DENIED_TOPIC_NAME = "General Search And Recommendations"
GENERIC_ANALYSIS_GOAL_TEXT = "외출 상황"
GENERIC_DEFAULT_ANALYSIS_GOAL_TEXT = "메이크업 피드백"
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
UNAMBIGUOUS_MAKEUP_DOMAIN_TERMS = {"메이크업", "블러셔", "치크"}
SAFE_TOKEN_SUFFIXES = {
  "",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "에",
  "의",
  "도",
  "만",
  "과",
  "와",
  "로",
  "으로",
  "처럼",
  "인지",
  "인가",
  "이다",
  "입니다",
}
MAKEUP_DOMAIN_COMPOUND_CANONICAL = {
  "립밤": "립",
  "립컬러": "립",
  "립메이크업": "립",
  "톤업": "톤",
  "피부표현": "피부",
  "피부톤": "피부",
  "피부메이크업": "피부",
  "눈썹메이크업": "눈썹",
  "아이라인": "아이",
  "아이라이너": "아이",
  "아이섀도": "아이",
  "아이섀도우": "아이",
  "아이메이크업": "아이",
  "베이스메이크업": "베이스",
  "메이크업베이스": "메이크업",
}
MAKEUP_DOMAIN_FALSE_FRIENDS = {"화장실", "아이돌", "베이스기타"}
GENERAL_SEARCH_TERMS = {
  "카페",
  "공연",
  "기타",
  "클럽",
  "코스",
  "숙소",
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
OCCASION_CONTEXT_TERMS = {
  "게하",
  "게스트하우스",
  "호스텔",
  "호텔",
  "펜션",
  "리조트",
  "캠핑",
  "캠핑장",
  "글램핑",
  "팝업",
  "팝업스토어",
  "피크닉",
  "술집",
  "바",
  "라운지",
  "호캉스",
  "전시",
  "전시회",
  "콘서트",
  "페스티벌",
  "북토크",
  "미술관",
  "박물관",
  "바다",
  "해변",
  "공항",
  "놀이공원",
  "워크숍",
  "세미나",
  "기념일",
}
ANALYSIS_GOAL_CATEGORY_BY_TERM = {
  "게하": "여행",
  "게스트하우스": "여행",
  "호스텔": "여행",
  "호텔": "여행",
  "펜션": "여행",
  "리조트": "여행",
  "호캉스": "여행",
  "공항": "여행",
  "캠핑": "야외 활동",
  "캠핑장": "야외 활동",
  "글램핑": "야외 활동",
  "피크닉": "야외 활동",
  "바다": "야외 활동",
  "해변": "야외 활동",
  "놀이공원": "야외 활동",
  "팝업": "행사",
  "팝업스토어": "행사",
  "전시": "행사",
  "전시회": "행사",
  "콘서트": "행사",
  "페스티벌": "행사",
  "북토크": "행사",
  "미술관": "행사",
  "박물관": "행사",
  "워크숍": "행사",
  "세미나": "행사",
  "술집": "모임",
  "바": "모임",
  "라운지": "모임",
  "기념일": "모임",
  "클럽": "모임",
}
EXTERNAL_QUERY_SIGNAL_TERMS = {
  "순위",
  "랭킹",
  "베스트",
  "best",
  "top5",
  "top10",
  "리스트",
  "일정",
  "가격",
  "시세",
  "전망",
  "후기",
  "리뷰",
  "평점",
  "영업시간",
  "운영시간",
  "오픈시간",
  "마감시간",
  "몇시",
  "메뉴",
  "예약",
  "링크",
  "구매",
  "주문",
  "갈만한곳",
  "가볼만한곳",
  "몇군데",
  "뭐가좋아",
  "어느",
  "무슨",
  "어떤",
}
EXTERNAL_QUERY_TOKEN_TERMS = {"코스", "몇"}
EXTERNAL_QUERY_ENDING_TERMS = {
  "정보", "위치", "픽", "가면돼", "괜찮니", "있나",
}
EXTERNAL_REQUEST_TERMS = GENERAL_REQUEST_TERMS | {
  "골라",
  "정해",
  "예약",
  "구매",
  "주문",
}
FINANCIAL_CONTEXT_TERMS = {
  "비트코인",
  "코인",
  "주식",
  "주가",
  "회사채",
  "채권",
  "투자",
  "환율",
  "금리",
  "금융",
  "예금",
  "적금",
  "펀드",
  "etf",
  "보험",
  "부동산",
  "나스닥",
  "코스피",
  "배당",
  "매수",
  "가상자산",
  "암호화폐",
  "재테크",
  "세금",
  "대출",
}
FINANCIAL_EXACT_TOKEN_TERMS = {"연금"}
PROMPT_CONTROL_TERMS = {
  "이전지시",
  "지시무시",
  "지시를무시",
  "모든지시무시",
  "규칙무시",
  "규칙을무시",
  "명령무시",
  "명령을무시",
  "시스템프롬프트",
  "developer메시지",
  "assistant메시지",
  "명령을따라",
}
DECLARATIVE_CONTEXT_PATTERN = re.compile(
  r"^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9][가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9\s&+/'()·,._-]*$",
)
EMAIL_PATTERN = re.compile(r"(?<![\w.+-])[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}(?![\w.-])")
PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+?82|0)\s*[-.)]?\s*\d{1,3}(?:\s*[-.]?\s*\d){6,10}(?!\d)")
LONG_IDENTIFIER_PATTERN = re.compile(r"(?<!\d)(?:\d[\s-]?){12,18}\d(?!\d)")
PASSPORT_PATTERN = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]\d{8}(?![A-Za-z0-9])")
PROMPT_CONTROL_PATTERN = re.compile(
  r"(?:규칙|지시|명령|프롬프트|비밀|제한|문장).{0,24}(?:무시|출력|변경|공개|보여|알려|제거)",
)
ENGLISH_PROMPT_CONTROL_PATTERN = re.compile(
  r"(?:ignore|forget|disregard|override).{0,40}(?:instruction|rule|prompt|message)|"
  r"(?:act|behave).{0,20}\bas\b|(?:respond|output)\s+only",
  re.IGNORECASE,
)
KOREAN_ROLE_CONTROL_PATTERN = re.compile(
  r"(?:시스템|관리자|개발자|루트).{0,16}(?:권한|역할|행동)|역할.{0,12}행동",
)
DIRECT_PII_TERMS = {
  "이메일",
  "연락처",
  "전화번호",
  "주소",
  "주민번호",
  "카드번호",
  "계좌번호",
  "여권번호",
  "면허번호",
}
IDENTITY_LOOKUP_TERMS = {"계정", "신원", "이름"}
SOCIAL_IDENTITY_TERMS = {"sns", "인스타", "인스타그램", "instagram"}
PERSON_IDENTITY_TERMS = {"사람", "인물"}
MEDICAL_ADVICE_TERMS = {
  "진단",
  "처방",
  "치료",
  "감기약",
  "진통제",
  "약물",
  "복용",
  "무슨약",
  "어떤약",
  "진료",
  "병원",
  "수술",
}
MEDICAL_CONDITION_TERMS = {
  "발진",
  "질환",
  "증상",
  "종양",
  "감염",
  "당뇨",
  "고혈압",
  "심장병",
  "우울증",
  "아토피",
  "피부염",
  "알레르기",
  "편두통",
  "백혈병",
  "천식",
  "간염",
}
MEDICAL_EXACT_TOKEN_TERMS = {"암"}
MEDICAL_DIAGNOSIS_REQUEST_FRAGMENTS = {"인지", "맞는지", "진단", "판단", "추측", "확인", "봐줘"}
SENSITIVE_ATTRIBUTE_TERMS = {
  "나이",
  "인종",
  "민족",
  "성정체성",
  "성적지향",
  "성적취향",
  "동성애",
  "양성애",
  "성소수자",
  "트랜스젠더",
  "레즈비언",
  "정치",
  "정치성향",
  "임신",
  "성별",
  "종교",
  "장애",
  "국적",
}
SENSITIVE_EXACT_TOKEN_TERMS = {"게이"}
SENSITIVE_INFERENCE_REQUEST_TERMS = GENERAL_REQUEST_TERMS | {"추측", "판단", "확인", "맞혀", "알아내"}
MEDICAL_REQUEST_FRAGMENTS = {
  "진단해",
  "처방해",
  "치료법",
  "치료방법",
  "복용법",
  "먹어도",
  "먹어야",
  "무슨약",
  "어떤약",
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


def _security_normalized_text(value: str) -> str:
  normalized = unicodedata.normalize("NFKC", value)
  return "".join(
    character
    for character in normalized
    if unicodedata.category(character) not in {"Cc", "Cf", "Cs"}
  )


def _security_compact_text(value: str) -> str:
  return re.sub(
    r"[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]+",
    "",
    _security_normalized_text(value).casefold(),
  )


def _contains_compact_term(value: str, terms: set[str]) -> bool:
  compact = _security_compact_text(value)
  return any(_security_compact_text(term) in compact for term in terms)


def _contains_token_term(value: str, terms: set[str]) -> bool:
  normalized = _security_normalized_text(value).casefold()
  tokens = re.findall(r"[0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]+", normalized)

  for term in terms:
    compact_term = _security_compact_text(term)
    if not compact_term:
      continue
    if any(
      token == f"{compact_term}{suffix}"
      for token in tokens
      for suffix in SAFE_TOKEN_SUFFIXES
    ):
      return True

  return False


def _compact_without_makeup_false_friends(value: str) -> str:
  compact = _security_compact_text(value)
  for false_friend in sorted(
    MAKEUP_DOMAIN_FALSE_FRIENDS,
    key=lambda term: len(_security_compact_text(term)),
    reverse=True,
  ):
    compact = compact.replace(_security_compact_text(false_friend), "")
  return compact


def _find_makeup_domain_term(value: str) -> str | None:
  normalized = _security_normalized_text(value).casefold()
  compact = _compact_without_makeup_false_friends(value)
  matches: list[tuple[int, int, str]] = []

  for compound, canonical in MAKEUP_DOMAIN_COMPOUND_CANONICAL.items():
    compact_compound = _security_compact_text(compound)
    start = compact.find(compact_compound)
    if start >= 0:
      matches.append((start, len(compact_compound), canonical))

  for term in UNAMBIGUOUS_MAKEUP_DOMAIN_TERMS:
    compact_term = _security_compact_text(term)
    start = compact.find(compact_term)
    if start >= 0:
      matches.append((start, len(compact_term), term))

  ambiguous_terms = MAKEUP_DOMAIN_TERMS - UNAMBIGUOUS_MAKEUP_DOMAIN_TERMS
  for token_match in re.finditer(r"[0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]+", normalized):
    token = token_match.group(0)
    token_start = len(_security_compact_text(normalized[: token_match.start()]))
    for term in ambiguous_terms:
      compact_term = _security_compact_text(term)
      if token not in {
        f"{compact_term}{suffix}"
        for suffix in SAFE_TOKEN_SUFFIXES
      }:
        continue
      matches.append((token_start, len(compact_term), term))

  if not matches:
    return None

  return min(matches, key=lambda candidate: (candidate[0], -candidate[1], candidate[2]))[2]


def _contains_makeup_domain_term(value: str) -> bool:
  return _find_makeup_domain_term(value) is not None


def _find_developer_owned_term(value: str, terms: set[str]) -> str | None:
  compact = _compact_without_makeup_false_friends(value)
  normalized = _security_normalized_text(value).casefold()
  matches: list[tuple[int, int, str]] = []

  for term in terms:
    compact_term = _security_compact_text(term)
    if not compact_term:
      continue

    if re.fullmatch(r"[a-z0-9]+", compact_term):
      word_match = re.search(
        rf"(?<![a-z0-9]){re.escape(compact_term)}(?![a-z0-9])",
        normalized,
      )
      if word_match is None:
        continue
      start = len(_security_compact_text(normalized[: word_match.start()]))
    else:
      start = compact.find(compact_term)

    if start >= 0:
      matches.append((start, len(compact_term), term))

  if not matches:
    return None

  return min(matches, key=lambda candidate: (candidate[0], -candidate[1], candidate[2]))[2]


def _select_safe_analysis_goal_text(value: str) -> str | None:
  occasion_term = _find_developer_owned_term(
    value,
    set(ANALYSIS_GOAL_CATEGORY_BY_TERM),
  )
  if occasion_term:
    return ANALYSIS_GOAL_CATEGORY_BY_TERM[occasion_term]

  for terms in (
    CONTEXT_ANCHOR_KEYWORDS - MAKEUP_DOMAIN_TERMS - {"눈"},
    MAKEUP_CONTEXT_STATEMENT_TERMS,
  ):
    selected = _find_developer_owned_term(value, terms)
    if selected:
      return selected

  makeup_term = _find_makeup_domain_term(value)
  if makeup_term:
    return makeup_term

  return None


def _term_spans(value: str, terms: set[str]) -> list[tuple[int, int]]:
  compact = _security_compact_text(value)
  spans: list[tuple[int, int]] = []

  for term in terms:
    compact_term = _security_compact_text(term)
    if not compact_term:
      continue

    start = compact.find(compact_term)
    while start >= 0:
      spans.append((start, start + len(compact_term)))
      start = compact.find(compact_term, start + 1)

  return spans


def _looks_like_high_risk_goal_request(value: str) -> bool:
  normalized = _security_normalized_text(value)
  compact = _security_compact_text(value)

  if (
    EMAIL_PATTERN.search(normalized)
    or PHONE_PATTERN.search(normalized)
    or LONG_IDENTIFIER_PATTERN.search(normalized)
    or PASSPORT_PATTERN.search(normalized)
  ):
    return True

  if re.search(r"(?<!\d)\d{6}\s*[-.]?\s*\d{7}(?!\d)", normalized):
    return True

  if _contains_compact_term(value, DIRECT_PII_TERMS):
    return True

  finance_compact = compact.replace("코인노래방", "")
  if any(_security_compact_text(term) in finance_compact for term in FINANCIAL_CONTEXT_TERMS):
    return True

  if _contains_token_term(value, FINANCIAL_EXACT_TOKEN_TERMS):
    return True

  prompt_terms = PROMPT_CONTROL_TERMS | {
    "ignorepreviousinstructions",
    "ignoreallinstructions",
    "systemmessage",
    "developermessage",
  }
  if _contains_compact_term(value, prompt_terms):
    return True

  if ENGLISH_PROMPT_CONTROL_PATTERN.search(normalized) or KOREAN_ROLE_CONTROL_PATTERN.search(compact):
    return True

  if PROMPT_CONTROL_PATTERN.search(compact):
    return True

  if re.search(r"<\s*/?\s*(?:system|assistant|developer)\b", normalized, re.IGNORECASE):
    return True

  if _contains_compact_term(value, SENSITIVE_ATTRIBUTE_TERMS):
    return True

  if _contains_token_term(value, SENSITIVE_EXACT_TOKEN_TERMS):
    return True

  medical_deny_terms = MEDICAL_ADVICE_TERMS | MEDICAL_CONDITION_TERMS | {"피부병"}
  if _contains_compact_term(value, medical_deny_terms):
    return True

  if _contains_token_term(value, MEDICAL_EXACT_TOKEN_TERMS):
    return True

  has_lookup_request = _contains_compact_term(
    value,
    EXTERNAL_REQUEST_TERMS | {"확인", "조회"},
  )
  has_identity_target = _contains_compact_term(value, IDENTITY_LOOKUP_TERMS)
  has_social_target = _contains_compact_term(value, SOCIAL_IDENTITY_TERMS)
  has_person_target = _contains_compact_term(value, PERSON_IDENTITY_TERMS)
  has_photo_target = "사진속" in compact

  if "누구" in compact and (has_person_target or has_photo_target):
    return True

  if (has_identity_target or has_social_target) and (
    has_person_target or has_photo_target or (has_identity_target and has_social_target)
  ):
    return True

  return has_lookup_request and has_identity_target


def _looks_like_general_search_request(value: str) -> bool:
  if _contains_compact_term(value, EXTERNAL_QUERY_SIGNAL_TERMS):
    return True

  has_makeup_domain = _contains_makeup_domain_term(value)
  if not has_makeup_domain and _contains_token_term(value, EXTERNAL_QUERY_TOKEN_TERMS):
    return True

  compact = _security_compact_text(value)
  if not has_makeup_domain and compact.endswith(tuple(EXTERNAL_QUERY_ENDING_TERMS)):
    return True

  request_spans = _term_spans(value, EXTERNAL_REQUEST_TERMS)
  if not request_spans:
    return False

  if not has_makeup_domain:
    return True

  makeup_spans = _term_spans(value, MAKEUP_DOMAIN_TERMS)
  if not makeup_spans:
    return True

  first_makeup_start = min(start for start, _end in makeup_spans)
  if any(request_start < first_makeup_start for request_start, _end in request_spans):
    return True

  for request_start, _request_end in request_spans:
    if not any(
      0 <= request_start - makeup_end <= 6
      for _makeup_start, makeup_end in makeup_spans
    ):
      return True

  search_terms = GENERAL_SEARCH_TERMS | OCCASION_CONTEXT_TERMS
  for search_start, search_end in _term_spans(value, search_terms):
    for request_start, request_end in request_spans:
      segment_start = min(search_start, request_start)
      segment_end = max(search_end, request_end)
      if not _contains_makeup_domain_term(compact[segment_start:segment_end]):
        return True

  return False


def _looks_like_declarative_context_label(
  value: str,
  classification: GoalIntentResult,
) -> bool:
  if classification["intentType"] != "valid_context":
    return False

  normalized = _security_normalized_text(value).strip()
  compact = _security_compact_text(value)
  if not 2 <= len(compact) <= 60:
    return False

  if not DECLARATIVE_CONTEXT_PATTERN.fullmatch(normalized):
    return False

  if any(mark in normalized for mark in ("?", "!", "？", "！")):
    return False

  if _contains_compact_term(value, EXTERNAL_REQUEST_TERMS | EXTERNAL_QUERY_SIGNAL_TERMS):
    return False

  question_endings = (
    "나요",
    "인가요",
    "인가",
    "어때",
    "어떻게",
    "할까",
    "할까요",
    "갈까",
    "갈까요",
    "될까",
    "되나요",
    "가능한지",
    "괜찮아",
    "나아",
    "맞아",
    "맞나요",
    "몇시",
    "왜",
    "언제",
    "어디",
    "누구",
    "가도돼",
    "맞지",
    "좋아",
    "좋을까",
    "줘",
    "주세요",
  )
  return not compact.endswith(question_endings)


def _is_makeup_context_statement(value: str, classification: GoalIntentResult) -> bool:
  if classification["intentType"] not in {"valid_context", "generic_default"}:
    return False

  if _looks_like_high_risk_goal_request(value) or _looks_like_general_search_request(value):
    return False

  if _contains_makeup_domain_term(value):
    return True

  if classification["intentType"] == "generic_default":
    return False

  return _looks_like_declarative_context_label(value, classification)


def _should_reject_goal_locally(
  value: str,
  classification: GoalIntentResult,
) -> bool:
  if _looks_like_high_risk_goal_request(value) or _looks_like_general_search_request(value):
    return True

  if classification["intentType"] != "valid_context":
    return False

  if _contains_makeup_domain_term(value):
    return False

  return not _looks_like_declarative_context_label(value, classification)


def _local_goal_guardrail_error() -> AppError:
  return AppError(
    400,
    "FEEDBACK_GOAL_GUARDRAIL_BLOCKED",
    GUARDRAIL_BLOCKED_MESSAGE,
    {
      "detected": [
        {
          "policy": "local",
          "name": "Unsafe Or External Request",
          "action": "BLOCKED",
        },
      ],
    },
  )


def _is_only_general_search_denied_topic(details: dict[str, Any]) -> bool:
  detected = details.get("detected")
  if not isinstance(detected, list) or not detected:
    return False

  detected_items = [item for item in detected if isinstance(item, dict)]
  return len(detected_items) == len(detected) and all(
    item.get("action") == "BLOCKED"
    and item.get("policy") == "topic"
    and item.get("name") == GENERAL_SEARCH_DENIED_TOPIC_NAME
    for item in detected_items
  )


def _resolve_guardrail_general_search_analysis_goal_text(
  raw_goal_text: str,
  classification: GoalIntentResult,
  exc: AppError,
) -> str | None:
  if exc.code != "FEEDBACK_GOAL_GUARDRAIL_BLOCKED":
    return None

  if not _is_only_general_search_denied_topic(exc.details):
    return None

  if not _is_makeup_context_statement(raw_goal_text, classification):
    return None

  if classification["intentType"] == "generic_default":
    return GENERIC_DEFAULT_ANALYSIS_GOAL_TEXT

  return _select_safe_analysis_goal_text(raw_goal_text) or GENERIC_ANALYSIS_GOAL_TEXT


def _safe_blocked_topic_names(details: dict[str, Any]) -> tuple[str, ...]:
  detected = details.get("detected")
  if not isinstance(detected, list):
    return ()

  return tuple(
    sorted(
      {
        str(item["name"])
        for item in detected
        if isinstance(item, dict)
        and item.get("action") == "BLOCKED"
        and item.get("policy") == "topic"
        and isinstance(item.get("name"), str)
      },
    ),
  )


def _log_guardrail_decision(
  *,
  allowed: bool,
  raw_goal_text: str,
  classification: GoalIntentResult,
  details: dict[str, Any],
) -> None:
  diagnostic = {
    "blockedTopics": list(_safe_blocked_topic_names(details)),
    "decision": "bypass" if allowed else "block",
    "goalLength": len(raw_goal_text),
    "hasMakeupDomain": _contains_makeup_domain_term(raw_goal_text),
    "intentType": classification["intentType"],
  }
  logger.warning(
    "[aura:feedback-goal] guardrail:decision %s",
    json.dumps(diagnostic, ensure_ascii=True, sort_keys=True),
  )

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

  if not raw_goal_text:
    _apply_goal_classification(request_payload, feedback_context, classification)
    return

  if _should_reject_goal_locally(raw_goal_text, classification):
    local_error = _local_goal_guardrail_error()
    _log_guardrail_decision(
      allowed=False,
      raw_goal_text=raw_goal_text,
      classification=classification,
      details=local_error.details,
    )
    raise local_error

  # Preserve the complete normalized request after both the local policy check
  # above and the Bedrock input guardrail below approve it.  Reducing every
  # valid request to one allow-listed token (for example, "립") discards
  # qualifiers such as desired intensity and whole-face harmony that the
  # feedback model needs in order to judge the user's actual goal.
  analysis_goal_text = classification["normalizedGoalText"]
  try:
    await assert_bedrock_guardrail_input_allowed(
      raw_goal_text,
      settings,
      context="makeup_feedback_goal",
    )
  except AppError as exc:
    blocked_analysis_goal_text = _resolve_guardrail_general_search_analysis_goal_text(
      raw_goal_text,
      classification,
      exc,
    )
    allowed = blocked_analysis_goal_text is not None
    analysis_goal_text = blocked_analysis_goal_text
    if exc.code == "FEEDBACK_GOAL_GUARDRAIL_BLOCKED":
      _log_guardrail_decision(
        allowed=allowed,
        raw_goal_text=raw_goal_text,
        classification=classification,
        details=exc.details,
      )
    if not allowed:
      raise

  _apply_goal_classification(
    request_payload,
    feedback_context,
    classification,
    analysis_goal_text=analysis_goal_text,
  )
