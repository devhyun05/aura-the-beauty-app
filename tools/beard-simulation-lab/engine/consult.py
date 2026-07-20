"""Template-based consult-question generation (no LLM).

Questions are user-voiced questions to bring to a clinician. The module
self-checks its output against the contract validator so a template edit that
introduces recommendation/guarantee phrasing fails loudly at generation time.
"""

from __future__ import annotations

from .contracts import validate_consult_questions

_BASE = [
    "제 피부톤과 모발 굵기를 기준으로 어떤 시술 방식이 고려될 수 있는지 여쭤봐도 될까요?",
    "일반적으로 몇 회 정도의 시술과 어느 정도의 간격을 고려하게 되는지 궁금합니다. 제 경우는 어떨까요?",
    "시술 전후에 주의해야 할 점이나 관리 방법이 있을까요?",
]

_BY_GOAL = {
    "shadow_reduction": "면도 후 푸른 그림자가 고민인데, 레이저 제모로 어느 정도 개선을 기대할 수 있을까요?",
    "density_reduction": "수염 밀도를 전체 제거가 아니라 부분적으로만 줄이는 것도 가능할까요?",
    "full_visualization": "수염 전체를 제모할 경우 진행 과정과 중간 단계의 모습은 어떻게 되나요?",
}

_BY_SHAVING_STATE = {
    "clean": "면도를 매일 하는데도 그림자가 남는 편입니다. 이런 경우 시술 계획이 달라질까요?",
    "stubble": "짧은 수염이 자주 올라오는 편인데, 시술 주기에 영향이 있을까요?",
    "short": "수염을 짧게 유지하는 편인데, 시술 전에 어느 정도 길이로 준비해야 하나요?",
    "dense": "수염이 굵고 밀도가 높은 편인데, 이런 경우 시술 횟수나 방식이 달라지나요?",
}

_MAKEUP_COVER = "지금은 메이크업으로 그림자를 커버하고 있는데, 시술 기간 중에도 병행해도 괜찮을까요?"


def build_consult_questions(survey: dict) -> list[str]:
    questions = list(_BASE)
    goal_q = _BY_GOAL.get(survey.get("goal"))
    if goal_q:
        questions.append(goal_q)
    state_q = _BY_SHAVING_STATE.get(survey.get("shavingState"))
    if state_q:
        questions.append(state_q)
    if survey.get("makeupCoverUsed"):
        questions.append(_MAKEUP_COVER)

    valid, errors = validate_consult_questions(questions)
    if not valid:
        raise ValueError(f"consult template violates contract: {errors}")
    return questions


DISCLAIMERS = [
    "이 이미지는 참고용 합성 이미지이며 실제 시술 결과를 예측하지 않습니다.",
    "시술 결과는 개인의 모발·피부 상태에 따라 다릅니다. 정확한 상담은 의료 전문가와 진행하세요.",
    "사진은 시뮬레이션 생성에만 사용되며, 삭제를 요청하면 원본과 결과물이 모두 삭제됩니다.",
]
