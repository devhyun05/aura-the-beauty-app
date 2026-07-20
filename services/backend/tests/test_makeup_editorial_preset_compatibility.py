import json

import pytest

from app.api import makeup_recommendations as makeup_api
from app.services import makeup_recommendation_session as session_service
from app.services.makeup_editorial_question_templates import EDITORIAL_PRESET_VERSION


OLD_LABEL = "숏폼으로만 저장해 둔 메이크업"
OLD_PROMPT = "온라인에서 저장한 트렌디한 메이크업을 현실적으로 적용한 메이크업"
CURRENT_LABEL = "음악프로그램 무대 접수 아이돌 메이크업"
CURRENT_PROMPT = "음악프로그램 무대 조명과 카메라에서 또렷하게 살아나는 아이돌 메이크업"
OLD_QUESTIONS = [{
  "id": "saved_look_focus",
  "title": "저장한 룩에서 꼭 가져오고 싶은 포인트는 무엇인가요?",
  "options": [
    {"id": "color", "label": "눈과 입술의 색 조합"},
    {"id": "texture", "label": "피부와 광택의 질감"},
    {"id": "mood", "label": "전체적인 분위기"},
    {"id": "ai_pick", "label": "AURA가 골라줘"},
  ],
}]


def _old_context() -> dict:
  return {
    "selection": {
      "customSituationText": OLD_PROMPT,
      "customSituationLabel": OLD_LABEL,
      "editorialPreset": {
        "id": "saved-look",
        "displayText": OLD_LABEL,
        "seedPrompt": OLD_PROMPT,
      },
    },
  }


def test_saved_look_session_response_uses_current_idol_stage_copy() -> None:
  response = session_service.session_response({
    "id": "11111111-1111-4111-8111-111111111111",
    "analysis_report_id": "22222222-2222-4222-8222-222222222222",
    "context_snapshot": _old_context(),
    "questions": OLD_QUESTIONS,
    "answers": [],
    "current_question_index": 0,
    "status": "questioning",
    "image_mode": "personalized",
  })

  assert EDITORIAL_PRESET_VERSION == "makeup-editorial-questions-reviewed-v2"
  assert response["customSituationLabel"] == CURRENT_LABEL
  assert response["customSituationText"] == CURRENT_PROMPT
  assert response["questions"][0]["id"] == "saved_look_focus"
  assert "음악프로그램 무대" in response["questions"][0]["title"]
  assert "저장" not in json.dumps(response["questions"], ensure_ascii=False)


@pytest.mark.asyncio
async def test_saved_look_report_response_canonicalizes_existing_snapshot() -> None:
  response = await makeup_api._recommendation_report_response({
    "id": "33333333-3333-4333-8333-333333333333",
    "schema_version": "makeup-recommendation-v1",
    "context_snapshot": _old_context(),
    "recommendation": {"looks": []},
    "questions": OLD_QUESTIONS,
    "answers": [],
  })

  selection = response["context_snapshot"]["selection"]
  assert selection["customSituationLabel"] == CURRENT_LABEL
  assert selection["customSituationText"] == CURRENT_PROMPT
  assert selection["editorialPreset"]["displayText"] == CURRENT_LABEL
  assert selection["editorialPreset"]["seedPrompt"] == CURRENT_PROMPT
  assert "저장" not in json.dumps(response["questions"], ensure_ascii=False)
