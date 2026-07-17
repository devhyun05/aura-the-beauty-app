"""Reviewed reverse-question templates for curated editorial trend cards.

Editorial cards are trusted product copy, not free-form user input.  Resolving
them by a stable preset id keeps the tap-to-question transition fast and avoids
running the custom-situation guardrail and question model for every tap.
"""

from __future__ import annotations

from typing import Any

from app.schemas.makeup_recommendation import GeneratedQuestions
from app.services.makeup_keyword_question_templates import PREP_TIME_QUESTION


EDITORIAL_PRESET_VERSION = "makeup-editorial-questions-reviewed-v1"


def _option(option_id: str, label: str) -> dict[str, str]:
  return {"id": option_id, "label": label}


def _question(
  question_id: str,
  title: str,
  first: tuple[str, str],
  second: tuple[str, str],
  third: tuple[str, str],
) -> dict[str, Any]:
  return {
    "id": question_id,
    "title": title,
    "options": [
      _option(*first),
      _option(*second),
      _option(*third),
      _option("ai_pick", "AI가 골라줘"),
    ],
  }


def _preset(
  display_text: str,
  seed_prompt: str,
  context_question: dict[str, Any],
) -> dict[str, Any]:
  validated = GeneratedQuestions.model_validate(
    {"questions": [context_question, PREP_TIME_QUESTION]},
  )
  return {
    "displayText": display_text,
    "seedPrompt": seed_prompt,
    "questions": validated.model_dump(by_alias=True)["questions"],
  }


EDITORIAL_QUESTION_PRESETS: dict[str, dict[str, Any]] = {
  "baseball-camera": _preset(
    "야구장 전광판에 잡히고 싶은 날",
    "야외 야구장에서 생기 있고 또렷하며 오래 유지되는 메이크업",
    _question(
      "stadium_timing",
      "야구장에서 가장 기대하는 시간대는 언제예요?",
      ("day", "햇빛이 강한 낮 경기"),
      ("sunset", "자연광이 바뀌는 오후 경기"),
      ("night", "조명과 전광판이 밝은 밤 경기"),
    ),
  ),
  "wanghong-glass": _preset(
    "왕홍 레드 글래스",
    "레드 음영과 루비 글로스 립으로 화면 속 선명도를 높인 왕홍 무드 룩",
    _question(
      "wanghong_camera",
      "이 룩이 가장 선명하게 남아야 하는 장면은 어디예요?",
      ("selfie", "가까이 찍는 셀카"),
      ("video", "움직임이 있는 숏폼 영상"),
      ("night", "플래시와 야간 조명"),
    ),
  ),
  "trend-my-way": _preset(
    "SNS에 저장만 해둔 그 메이크업, 이번엔 직접",
    "최근 메이크업 무드를 나에게 자연스럽게 적용한 메이크업",
    _question(
      "trend_expression",
      "저장해 둔 트렌드를 어느 정도로 가져오고 싶나요?",
      ("hint", "내 평소 룩에 힌트만"),
      ("balanced", "나답게 절반 정도 변주"),
      ("full", "트렌드 포인트를 확실하게"),
    ),
  ),
  "neon-two-am": _preset(
    "을지로 새벽 네온을 닮은 메이크업",
    "네온 조명에서 색과 광택이 매력적으로 보이는 메이크업",
    _question(
      "neon_light",
      "가장 오래 머물 조명은 어디에 가까워요?",
      ("dark", "어두운 실내 조명"),
      ("color", "컬러 네온과 무빙 라이트"),
      ("flash", "플래시 사진과 영상"),
    ),
  ),
  "saved-look": _preset(
    "숏폼으로만 저장해 둔 메이크업",
    "온라인에서 저장한 트렌디한 메이크업을 현실적으로 적용한 메이크업",
    _question(
      "saved_look_focus",
      "저장한 룩에서 꼭 가져오고 싶은 포인트는 무엇인가요?",
      ("color", "눈과 입술의 색 조합"),
      ("texture", "피부와 광택의 질감"),
      ("mood", "전체적인 분위기"),
    ),
  ),
  "hip-point": _preset(
    "성수동 느좋 감성",
    "전체는 정돈하고 한 부위에 감각적인 포인트를 준 메이크업",
    _question(
      "hip_point_area",
      "감각적인 포인트를 어디에 두고 싶나요?",
      ("eye", "라인이나 컬러가 보이는 눈"),
      ("cheek", "질감이 살아나는 치크"),
      ("lip", "한 번에 시선이 가는 립"),
    ),
  ),
  "ex-wedding": _preset(
    "전 애인 결혼식, 말없이 완승",
    "결혼식 하객 예절을 지키면서 우아하고 여유로워 보이는 메이크업",
    _question(
      "wedding_setting",
      "참석할 예식은 어떤 분위기에 가까워요?",
      ("day_indoor", "밝은 낮 실내 예식"),
      ("outdoor", "자연광이 있는 야외 예식"),
      ("evening_hotel", "조명이 깊은 저녁·호텔 예식"),
    ),
  ),
  "art-student": _preset(
    "느낌 좋은 미대생 전시 오프닝 메이크업",
    "색감과 질감에 취향이 느껴지는 힘 뺀 메이크업",
    _question(
      "opening_moment",
      "전시 오프닝에서 어떤 시간을 가장 많이 보낼까요?",
      ("viewing", "작품과 공간을 둘러보기"),
      ("conversation", "사람들과 가까이 대화하기"),
      ("photo", "사진과 기록 남기기"),
    ),
  ),
  "camera-first": _preset(
    "공항 출국 레전드",
    "사진과 조명에서 이목구비가 선명하게 살아나는 메이크업",
    _question(
      "airport_camera",
      "출국 날 가장 많이 마주할 카메라는 무엇인가요?",
      ("daylight", "자연광 속 휴대폰 카메라"),
      ("indoor", "공항 실내 조명과 영상"),
      ("flash", "플래시가 터지는 사진"),
    ),
  ),
  "concert-encore": _preset(
    "앵콜까지 살아남는 콘서트 메이크업",
    "열기와 긴 시간에도 포인트가 유지되는 콘서트 메이크업",
    _question(
      "concert_environment",
      "공연을 즐길 환경은 어디에 가까워요?",
      ("indoor", "조명이 강한 실내 공연"),
      ("outdoor", "햇빛과 바람이 있는 야외 공연"),
      ("all_day", "낮부터 밤까지 이어지는 일정"),
    ),
  ),
  "not-a-blind-date": _preset(
    "소개팅은 아니지만 첫인상은 중요하니까",
    "과하지 않지만 첫인상이 좋은 약속 메이크업",
    _question(
      "first_impression",
      "상대에게 어떤 첫인상을 남기고 싶나요?",
      ("friendly", "편안하고 다정하게"),
      ("confident", "또렷하고 자신감 있게"),
      ("chic", "세련되고 살짝 거리감 있게"),
    ),
  ),
  "one-lip": _preset(
    "립 하나로 약속 있는 사람 되기",
    "립을 중심으로 최소 단계로 분위기를 완성하는 메이크업",
    _question(
      "lip_impression",
      "립으로 어떤 분위기를 만들고 싶나요?",
      ("clear", "맑고 생기 있게"),
      ("soft", "부드럽고 차분하게"),
      ("deep", "깊고 선명하게"),
    ),
  ),
}


def resolve_reviewed_editorial_preset(preset_id: str) -> dict[str, Any] | None:
  normalized_id = preset_id.strip()
  preset = EDITORIAL_QUESTION_PRESETS.get(normalized_id)
  if preset is None:
    return None
  validated = GeneratedQuestions.model_validate({"questions": preset["questions"]})
  return {
    "id": normalized_id,
    "displayText": preset["displayText"],
    "seedPrompt": preset["seedPrompt"],
    "questions": validated.model_dump(by_alias=True)["questions"],
    "source": "reviewed_editorial_preset",
    "version": EDITORIAL_PRESET_VERSION,
  }
