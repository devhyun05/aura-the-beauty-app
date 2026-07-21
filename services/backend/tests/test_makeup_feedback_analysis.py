import base64
import json
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import pytest
from botocore.exceptions import ClientError

from app.api import feedback as feedback_api
from app.core.errors import AppError
from app.core.settings import Settings
from app.services import makeup_feedback_analysis as analysis_module
from app.services.makeup_feedback_analysis import (
  BEDROCK_REGION_TOTAL_RAW_BYTES,
  BEDROCK_REQUEST_BODY_MAX_BYTES,
  FEEDBACK_TOPICS,
  MODEL_VERSION,
  MakeupFeedbackBedrockService,
  build_makeup_feedback_result_for_request,
  normalize_makeup_feedback_result,
  render_prompt_template,
)
from app.services.makeup_feedback_vision import (
  FacePose,
  MakeupFeedbackRegion,
  MakeupFeedbackVisionResult,
  VisionQualityIssue,
)


def _request_payload(goal: str = "데이트에서 자연스럽고 생기 있게 보이고 싶어요") -> dict:
  return {
    "source": "camera",
    "feedbackContext": {
      "goalIntentType": "valid_context",
      "originalGoalText": goal,
      "profileGender": "unknown",
      "userGoalText": goal,
    },
  }



def _vision_issue(
  code: str,
  *,
  severity: str = "soft",
  message: str | None = None,
) -> VisionQualityIssue:
  return VisionQualityIssue(
    code=code,
    severity=severity,  # type: ignore[arg-type]
    message=message or f"{code} source message",
  )


def _vision_result(
  *,
  detector_available: bool = True,
  quality_issues: tuple[VisionQualityIssue, ...] = (),
  hard_retake: bool = False,
  region_sizes: dict[str, int] | None = None,
  pose: FacePose | None = None,
) -> MakeupFeedbackVisionResult:
  sizes = region_sizes or {
    "full": 10,
    "left_eye": 11,
    "right_eye": 12,
    "left_cheek": 13,
    "right_cheek": 14,
    "lips": 15,
  }
  regions = {
    name: MakeupFeedbackRegion(
      name=name,
      body=bytes([index + 1]) * size,
      content_type="image/jpeg",
      width=320,
      height=240,
      source_box=(0, 0, 320, 240),
    )
    for index, (name, size) in enumerate(sizes.items())
  }

  return MakeupFeedbackVisionResult(
    detector_available=detector_available,
    face_count=1 if detector_available else 0,
    width=1080,
    height=1440,
    face_box=None,
    landmarks={},
    pose=pose,
    regions=regions,
    quality_issues=quality_issues,
    hard_retake=hard_retake,
    metrics={},
  )



def _service_with_bedrock_result(
  monkeypatch: pytest.MonkeyPatch,
  model_result: dict,
  *,
  stop_reason: str | None = None,
  settings: Settings | None = None,
) -> tuple[MakeupFeedbackBedrockService, dict[str, object]]:
  calls: dict[str, object] = {}

  class ResponseBody:
    def read(self) -> str:
      return json.dumps(
        {
          **({"stop_reason": stop_reason} if stop_reason else {}),
          "content": [
            {
              "type": "text",
              "text": json.dumps(model_result, ensure_ascii=False),
            },
          ],
        },
        ensure_ascii=False,
      )

  class FakeBedrockClient:
    def invoke_model(self, **kwargs):
      calls.update(kwargs)
      return {"body": ResponseBody()}

  effective_settings = (settings if settings is not None else Settings()).model_copy(
    update={"makeup_feedback_evidence_pipeline_enabled": False},
  )
  service = MakeupFeedbackBedrockService(effective_settings)
  monkeypatch.setattr(service, "_bedrock_runtime_client", lambda: FakeBedrockClient())
  return service, calls




def _axis_scores_for_total(score: object) -> list[int]:
  safe_score = score if isinstance(score, int) and not isinstance(score, bool) and 0 <= score <= 100 else 88
  maximums = [30, 25, 20, 25]
  scores = [safe_score * maximum // 100 for maximum in maximums]
  index = 0
  while sum(scores) < safe_score:
    if scores[index] < maximums[index]:
      scores[index] += 1
    index = (index + 1) % len(scores)
  return scores


def _score_components_for_axis(
  axis_id: str,
  score: int,
  evidence_ids: list[str],
) -> list[dict]:
  contract = next(
    axis
    for axis in analysis_module.SCORE_AXIS_CONTRACT
    if axis["id"] == axis_id
  )
  component_maximums = [
    component["maxScore"]
    for component in contract["components"]
  ]
  component_scores = [
    score * maximum // contract["maxScore"]
    for maximum in component_maximums
  ]
  index = 0
  while sum(component_scores) < score:
    if component_scores[index] < component_maximums[index]:
      component_scores[index] += 1
    index = (index + 1) % len(component_scores)

  return [
    {
      "id": component["id"],
      "label": component["label"],
      "score": component_score,
      "maxScore": component["maxScore"],
      "reason": f"{component['label']}에서 충족한 점과 보완할 점을 사진 근거로 비교했습니다.",
      "evidenceIds": evidence_ids,
    }
    for component, component_score in zip(
      contract["components"],
      component_scores,
      strict=True,
    )
  ]


def _correction_guide(topic_label: str) -> dict:
  return {
    "tool": "깨끗한 작은 블렌딩 브러시",
    "amount": "브러시 한쪽 면의 약 1/3만 묻힌 양",
    "targetArea": f"정면에서 보이는 {topic_label} 영역의 중심부터 바깥 경계까지",
    "coverage": f"현재 {topic_label} 경계 안쪽 한 겹과 바깥쪽 전환 구간",
    "steps": [
      "브러시 한쪽 면에 사용할 양을 한 번 덜어내세요.",
      f"{topic_label} 중심에 먼저 놓고 바깥 경계 방향으로 짧게 펴세요.",
      "정면에서 양쪽의 경계 강도가 비슷한지 확인하세요.",
    ],
    "stopCondition": "뚜렷한 경계선이 사라지고 바깥쪽으로 한 단계 옅어질 때 멈추세요.",
    "why": f"사진에서 확인된 {topic_label} 경계의 전환을 더 안정적으로 연결하기 위한 방법입니다.",
  }


def _valid_result(score: object = 88) -> dict:
  evaluations = []

  for index, topic in enumerate(FEEDBACK_TOPICS):
    status = "strength" if index == 0 else "improvement" if index == 1 else "optional"
    observation_id = f"{topic['id']}-obs-1"
    evaluations.append(
      {
        "topicId": topic["id"],
        "topicLabel": topic["label"],
        "status": status,
        "visibility": "clear",
        "visibilityReason": None,
        "observations": [
          {
            "id": observation_id,
            "claim": f"{topic['label']}의 경계와 색 표현이 사진에서 확인됩니다.",
            "evidenceLocation": f"얼굴의 {topic['label']} 영역",
            "lightingSensitive": False,
          },
        ],
        "goalCriterionIds": ["goal-1"],
        "title": f"{topic['label']} 관찰 결과",
        "description": f"사진에서 관찰한 {topic['label']} 표현이 사용자 목적과 어떻게 연결되는지 설명합니다.",
        "actionSteps": [
          f"현재 사진의 {topic['label']} 범위를 기준으로 양을 조절하세요.",
          f"사용자 목적에 맞게 {topic['label']} 경계를 부드럽게 정리하세요.",
        ],
        "correctionGuide": (
          _correction_guide(topic["label"])
          if status == "improvement"
          else None
        ),
        "scoreImpact": "low" if status == "optional" else "medium",
        "confidence": 0.8,
      },
    )

  axis_scores = _axis_scores_for_total(score)
  score_formula = (
    f"적용 완성도 {axis_scores[0]}/30 + "
    f"배치·형태 균형 {axis_scores[1]}/25 + "
    f"색·명암 조화 {axis_scores[2]}/20 + "
    f"전체 조화·목표 적합도 {axis_scores[3]}/25 = {sum(axis_scores)}/100"
  )
  axis_evidence_ids = ["brow-obs-1", "lash-obs-1"]

  return {
    "analysisDecision": "completed",
    "captureQuality": {
      "usable": True,
      "detectorAvailable": True,
      "colorConfidence": "high",
      "issues": [],
    },
    "score": score,
    "scoreBreakdown": {
      "maxScore": 100,
      "formula": score_formula,
      "axes": [
        {
          "id": "application-finish",
          "label": "적용 완성도",
          "score": axis_scores[0],
          "maxScore": 30,
          "reason": "눈썹 경계가 정돈되었고 속눈썹 경계에는 다듬을 부분이 보입니다.",
          "evidenceIds": axis_evidence_ids,
          "components": _score_components_for_axis(
            "application-finish",
            axis_scores[0],
            axis_evidence_ids,
          ),
        },
        {
          "id": "placement-balance",
          "label": "배치·형태 균형",
          "score": axis_scores[1],
          "maxScore": 25,
          "reason": "눈썹과 속눈썹의 배치가 얼굴 안에서 비교적 안정적으로 연결됩니다.",
          "evidenceIds": axis_evidence_ids,
          "components": _score_components_for_axis(
            "placement-balance",
            axis_scores[1],
            axis_evidence_ids,
          ),
        },
        {
          "id": "color-value-harmony",
          "label": "색·명암 조화",
          "score": axis_scores[2],
          "maxScore": 20,
          "reason": "사진 안에서 눈썹과 속눈썹의 상대 명암이 과도하게 분리되지 않습니다.",
          "evidenceIds": axis_evidence_ids,
          "components": _score_components_for_axis(
            "color-value-harmony",
            axis_scores[2],
            axis_evidence_ids,
          ),
        },
        {
          "id": "overall-goal-fit",
          "label": "전체 조화·목표 적합도",
          "score": axis_scores[3],
          "maxScore": 25,
          "reason": "관찰된 표현이 사용자가 요청한 인상과 전반적으로 연결됩니다.",
          "evidenceIds": axis_evidence_ids,
          "components": _score_components_for_axis(
            "overall-goal-fit",
            axis_scores[3],
            axis_evidence_ids,
          ),
        },
      ],
    },
    "scoreRange": [0, 100],
    "scoreConfidence": 0.82,
    "scoreEvidenceIds": axis_evidence_ids,
    "scoreLabel": "종합 점수",
    "scoreReason": "사진에서 피부 표현과 색조 경계가 안정적으로 보입니다. 자연스러운 데이트 메이크업 목적과 잘 맞습니다.",
    "interpretedGoal": {
      "label": "자연스러운 데이트 메이크업",
      "intensity": "light",
      "reason": "사용자가 자연스럽고 생기 있는 인상을 원했습니다.",
      "explicitFacts": ["데이트에서 자연스럽고 생기 있게 보이고 싶음"],
      "unknowns": ["원하는 구체적인 색상은 확인되지 않음"],
      "assumptions": [],
      "dynamicCriteria": [
        {
          "id": "baseline-application",
          "criterion": "경계·균일도·적용 위치 등 관찰 가능한 적용 완성도가 정돈되었는가",
          "derivedFrom": "공통 기준: 적용 완성도",
        },
        {
          "id": "baseline-coherence",
          "criterion": "얼굴 전체에서 부위 간 색·마감·시각적 비중이 내부적으로 조화를 이루는가",
          "derivedFrom": "공통 기준: 전체 조화",
        },
        {
          "id": "goal-1",
          "criterion": "사진에서 보이는 표현이 자연스럽고 생기 있는 인상과 조화를 이루는가",
          "derivedFrom": "자연스럽고 생기 있게 보이고 싶어요",
        },
      ],
    },
    "evaluations": evaluations,
    "summary": {
      "strengthSummary": "목적에 맞는 표현이 사진에서 확인됩니다.",
      "improvementSummary": "한 부위의 경계를 조금 더 정리하면 좋습니다.",
    },
  }


def _compact_result() -> dict:
  topics = []
  for index, topic in enumerate(FEEDBACK_TOPICS):
    status = "strength" if index == 0 else "improvement" if index == 1 else "optional"
    topics.append(
      {
        "id": topic["id"],
        "status": status,
        "visibility": "clear",
        "visibilityReason": None,
        "claim": f"{topic['label']}의 경계와 상대 강도가 사진에서 확인됩니다.",
        "where": f"얼굴의 {topic['label']} 영역",
        "lighting": False,
        "advice": f"정면에서 {topic['label']}의 경계와 양쪽 균형을 확인하세요.",
        "impact": "medium" if status == "improvement" else "low",
        "confidence": 0.8,
      },
    )

  components = []
  for axis in analysis_module.SCORE_AXIS_CONTRACT:
    for component in axis["components"]:
      components.append(
        {
          "id": component["id"],
          "score": component["maxScore"] - 1,
          "reason": f"{component['label']}에서 충족한 점과 국소 보완점을 함께 확인했습니다.",
          "topics": ["brow", "lash"],
        },
      )

  return {
    "goal": {
      "label": "자연스러운 데이트 메이크업",
      "intensity": "light",
      "reason": "사용자가 자연스럽고 생기 있는 인상을 요청했습니다.",
      "criterion": "각 부위가 과도하게 분리되지 않고 생기 있게 연결되는가",
    },
    "topics": topics,
    "components": components,
    "scoreConfidence": 0.82,
    "summary": {
      "strength": "사진에서 확인된 눈썹 표현은 비교적 안정적입니다.",
      "improvement": "속눈썹 경계와 좌우 연결을 먼저 정리할 필요가 있습니다.",
    },
  }


def _mark_all_evaluations_as_strength(raw_result: dict) -> dict:
  for evaluation in raw_result["evaluations"]:
    evaluation["status"] = "strength"
    evaluation["scoreImpact"] = "low"
    evaluation["correctionGuide"] = None
  return raw_result


def _retake_result() -> dict:
  result = _valid_result()
  result.update(
    {
      "analysisDecision": "retake_required",
      "captureQuality": {
        "usable": False,
        "detectorAvailable": True,
        "colorConfidence": "low",
        "issues": [
          {
            "code": "severeBlur",
            "message": "얼굴이 흔들리거나 흐리게 촬영되었습니다.",
            "affectedTopicIds": [topic["id"] for topic in FEEDBACK_TOPICS],
          },
        ],
      },
      "score": None,
      "scoreBreakdown": None,
      "scoreRange": None,
      "scoreConfidence": 0.0,
      "scoreEvidenceIds": [],
      "scoreReason": "핵심 메이크업 영역을 신뢰성 있게 확인할 수 없어 점수를 제공하지 않습니다.",
    },
  )

  for evaluation in result["evaluations"]:
    evaluation.update(
      {
        "status": "not_assessable",
        "visibility": "not_visible",
        "visibilityReason": "사진이 흐려 세부 표현을 확인할 수 없습니다.",
        "observations": [],
        "goalCriterionIds": [],
        "actionSteps": [],
        "correctionGuide": None,
        "scoreImpact": "low",
        "confidence": 0.0,
      },
    )

  return result


def test_score_breakdown_is_canonical_explainable_total() -> None:
  result = normalize_makeup_feedback_result(
    _mark_all_evaluations_as_strength(_valid_result(92)),
    _request_payload(),
  )

  assert result["score"] == 92
  assert result["scoreBreakdown"]["maxScore"] == 100
  assert result["scoreBreakdown"]["formula"] == (
    "적용 완성도 28/30 + 배치·형태 균형 23/25 + "
    "색·명암 조화 18/20 + 전체 조화·목표 적합도 23/25 = 92/100"
  )
  assert [axis["maxScore"] for axis in result["scoreBreakdown"]["axes"]] == [30, 25, 20, 25]
  assert "적용 완성도 28/30" in result["scoreReason"]


def test_score_breakdown_repairs_model_arithmetic_formula_evidence_and_range() -> None:
  raw_result = _mark_all_evaluations_as_strength(_valid_result(92))
  raw_result["score"] = 65
  raw_result["scoreBreakdown"]["formula"] = "잘못 계산한 식"
  raw_result["scoreEvidenceIds"] = ["unknown-extra", "lash-obs-1"]
  raw_result["scoreRange"] = [60, 70]

  result = normalize_makeup_feedback_result(raw_result, _request_payload())

  assert result["score"] == 92
  assert result["scoreBreakdown"]["formula"].endswith("= 92/100")
  assert result["scoreEvidenceIds"] == ["brow-obs-1", "lash-obs-1"]
  assert result["scoreRange"] == [87, 97]
  assert result["scoreRange"][0] <= result["score"] <= result["scoreRange"][1]


def test_full_score_is_reachable_without_global_ninety_point_ceiling() -> None:
  result = normalize_makeup_feedback_result(
    _mark_all_evaluations_as_strength(_valid_result(100)),
    _request_payload(),
  )

  assert result["score"] == 100
  assert [axis["score"] for axis in result["scoreBreakdown"]["axes"]] == [30, 25, 20, 25]
  assert result["scoreBreakdown"]["formula"].endswith("= 100/100")


def test_every_integer_total_from_zero_to_one_hundred_is_preserved() -> None:
  normalized_scores = {
    normalize_makeup_feedback_result(_valid_result(score), _request_payload())["score"]
    for score in range(101)
  }

  assert normalized_scores == set(range(101))


def test_axis_and_total_scores_are_derived_from_analytic_components() -> None:
  raw_result = _valid_result(85)
  raw_result["score"] = 99
  raw_result["scoreBreakdown"]["axes"][0]["score"] = 30

  result = normalize_makeup_feedback_result(raw_result, _request_payload())

  assert result["score"] == 85
  assert result["scoreBreakdown"]["axes"][0]["score"] == 26
  assert result["scoreBreakdown"]["formula"].endswith("= 85/100")


def test_low_thirties_are_valid_when_component_evidence_sums_to_them() -> None:
  result = normalize_makeup_feedback_result(_valid_result(31), _request_payload())

  assert result["score"] == 31
  assert result["scoreBreakdown"]["formula"].endswith("= 31/100")
  assert sum(
    component["score"]
    for axis in result["scoreBreakdown"]["axes"]
    for component in axis["components"]
  ) == 31


def test_score_breakdown_rejects_changed_component_contract() -> None:
  raw_result = _valid_result()
  raw_result["scoreBreakdown"]["axes"][0]["components"][0]["id"] = "unknown"

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "scoreBreakdown.axes[0].components[0].id"


def test_score_breakdown_rejects_unknown_component_evidence_without_repair() -> None:
  raw_result = _valid_result()
  raw_result["scoreBreakdown"]["axes"][0]["components"][0]["evidenceIds"] = [
    "brow-unknown-observation",
  ]

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == (
    "scoreBreakdown.axes[0].components[0].evidenceIds"
  )
  assert exc_info.value.details["unknownIds"] == ["brow-unknown-observation"]


def test_every_improvement_topic_must_affect_an_analytic_component() -> None:
  raw_result = _valid_result()
  for axis in raw_result["scoreBreakdown"]["axes"]:
    axis["evidenceIds"] = ["brow-obs-1"]
    for component in axis["components"]:
      component["evidenceIds"] = ["brow-obs-1"]

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == (
    "scoreBreakdown.axes.components.evidenceIds"
  )
  assert exc_info.value.details["uncoveredTopicIds"] == ["lash"]


@pytest.mark.parametrize("axis_score", [-1, 31, 12.5, True])
def test_score_breakdown_rejects_invalid_axis_score(axis_score: object) -> None:
  raw_result = _valid_result()
  raw_result["scoreBreakdown"]["axes"][0]["score"] = axis_score

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "scoreBreakdown.axes[0].score"


def test_score_breakdown_rejects_changed_axis_contract_or_order() -> None:
  raw_result = _valid_result()
  raw_result["scoreBreakdown"]["axes"][0], raw_result["scoreBreakdown"]["axes"][1] = (
    raw_result["scoreBreakdown"]["axes"][1],
    raw_result["scoreBreakdown"]["axes"][0],
  )

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "scoreBreakdown.axes[0].id"
  assert exc_info.value.details["expected"] == "application-finish"


def test_makeup_intensity_does_not_change_same_axis_scores() -> None:
  light_raw = _valid_result(85)
  bold_raw = _valid_result(85)
  light_raw["interpretedGoal"]["intensity"] = "light"
  bold_raw["interpretedGoal"]["intensity"] = "bold"

  light_result = normalize_makeup_feedback_result(light_raw, _request_payload())
  bold_result = normalize_makeup_feedback_result(bold_raw, _request_payload())

  assert bold_result["score"] == light_result["score"]
  assert bold_result["scoreBreakdown"] == light_result["scoreBreakdown"]
  assert bold_result["scoreRange"] == light_result["scoreRange"]


def test_live_result_localizes_user_facing_intensity_without_changing_enum() -> None:
  raw_result = _valid_result()
  raw_result["interpretedGoal"]["label"] = "light 메이크업"
  raw_result["interpretedGoal"]["reason"] = "사진에서 표현이 관찰되어 light로 요약했습니다."

  result = normalize_makeup_feedback_result(raw_result, _request_payload())

  assert result["interpretedGoal"]["intensity"] == "light"
  assert result["interpretedGoal"]["label"] == "가벼운 표현 메이크업"
  assert result["interpretedGoal"]["reason"] == "사진에서 표현이 관찰되어 가벼운 표현으로 요약했습니다."




def test_feedback_topics_include_lip_as_an_eleventh_topic() -> None:
  assert len(FEEDBACK_TOPICS) == 11
  assert FEEDBACK_TOPICS[-1] == {"id": "lip", "label": "립", "kind": "lip"}


def test_external_prompts_render_context_contract_and_lip_without_recursive_substitution() -> None:
  injected_placeholder = "{{TOPIC_COUNT}} 데이트 메이크업"
  service = MakeupFeedbackBedrockService(
    Settings(makeup_feedback_evidence_pipeline_enabled=False),
  )

  user_prompt = service._build_prompt(_request_payload(injected_placeholder))
  compact_prompt = service._build_compact_prompt(_request_payload(injected_placeholder))
  system_prompt = service._build_system_prompt()

  assert "아래 11개 주제를 모두 평가하세요" in user_prompt
  assert "- lip: 립 (kind: lip)" in user_prompt
  assert '"{{TOPIC_COUNT}} 데이트 메이크업"' in user_prompt
  assert '"scoreReason"' in user_prompt
  assert '"analysisDecision"' in user_prompt
  assert '"dynamicCriteria"' in user_prompt
  assert '"observations"' in user_prompt
  assert '"actionSteps"' in user_prompt
  assert '"scoreBreakdown"' in user_prompt
  assert '"correctionGuide"' in user_prompt
  assert "JSON 객체만 반환" in system_prompt
  assert system_prompt.index("사진의 촬영 품질") < system_prompt.index("사용자 원문")
  assert system_prompt.index("사용자 원문") < system_prompt.index("모든 요청에 공통")
  assert system_prompt.index("모든 요청에 공통") < system_prompt.index("점수 또는 재촬영")
  assert "generic_default이면 자연스러움, 화려함, 특정 스타일을 기본 기준으로 정하지 마세요" in user_prompt
  assert "full face overview에서 피부·눈·치크·립 사이의 상대 채도" in user_prompt
  assert "립 색의 상대 채도·명도·대비와 시각적 지배력" in user_prompt
  assert "퍼스널컬러, 피부 언더톤" in user_prompt
  assert "머리카락·홍채·피부 표현" in user_prompt
  assert "얼굴 중앙의 세로 공간" in user_prompt
  assert "입술이 얇아 보일 때" in user_prompt
  assert "메이크업이 진하거나 연한 정도 자체" in user_prompt
  assert "derivedFrom과 sourceType은 서버가 추가합니다" in user_prompt
  output_criterion = analysis_module._build_output_contract()["interpretedGoal"][
    "dynamicCriteria"
  ][0]
  assert "derivedFrom" not in output_criterion
  assert "전체 조화의 불일치" in user_prompt
  assert "촌스럽다" in user_prompt
  assert "채도·명도 대비가 다른 부위보다 높아" in system_prompt
  assert "피부·치크·아이 메이크업과 비교한 색 강도" in system_prompt
  assert "강도 증가 하드 게이트" in system_prompt
  assert "립의 낮은 발색은 그 자체로 결함이 아닙니다" in system_prompt
  assert "lip-finish`는 진하기가 아니라 라인·채움·마감" in system_prompt
  assert "두 개의 경쟁 중심" in compact_prompt
  assert "`연하다`, `발색이 약하다`, `존재감이 낮다`만으로는 improvement 근거" in compact_prompt
  assert "더 진하게" in compact_prompt
  assert "full-face 반증" in compact_prompt
  assert "적용 완성도 30점" in system_prompt
  assert "30년 이상 활동" in system_prompt
  assert "사용자의 기분을 맞추기 위한 칭찬" in system_prompt
  assert "결함 후보 → 반대쪽 비교 → full face 재확인 → 상태 확정" in user_prompt
  assert "파운데이션: 제품 적용이 실제로 식별되는지" in user_prompt
  assert "13개 component" in user_prompt
  assert "component.score는 0부터 maxScore까지의 1점 단위 정수" in user_prompt
  assert "중간의 모든 정수를 실제 충족 정도에 따라 사용하세요" in user_prompt
  assert "92점은 최대점이 아니며" in user_prompt
  assert "13개 component가 모두 최대점이면 정확히 100점" in user_prompt
  assert "scoreImpact 개수나 등급으로 component 점수를 계산하거나 총점 상한" in user_prompt
  assert "medium이 하나라도 있으면 74점 이하" not in user_prompt
  assert "high 2개와 medium 2개가 함께 있으면 전체 상한은 29점" not in user_prompt
  assert "= 72/100" not in user_prompt
  assert "92점은 상한이 아니며" in system_prompt
  assert "계절형 퍼스널컬러" in user_prompt
  assert "타고난 얼굴이 예쁘거나 잘생겼는지" in user_prompt
  assert "편집 안내" not in user_prompt
  assert "편집 안내" not in system_prompt

def test_user_prompt_only_includes_whitelisted_request_metadata() -> None:
  payload = _request_payload()
  payload.update(
    {
      "task": "makeup-feedback",
      "width": 1080,
      "bucket": "private-bucket-must-not-leak",
      "imageUrl": "s3://private/image.jpg",
      "userId": "private-user-id",
    },
  )

  prompt = MakeupFeedbackBedrockService(Settings())._build_prompt(payload)

  assert '"task": "makeup-feedback"' in prompt
  assert '"width": 1080' in prompt
  assert "private-bucket-must-not-leak" not in prompt
  assert "s3://private/image.jpg" not in prompt
  assert "private-user-id" not in prompt



def test_analysis_goal_text_is_preserved_and_replaces_only_model_prompt_goal() -> None:
  payload = _request_payload("홍대 여행")
  payload["feedbackContext"]["analysisGoalText"] = "여행"

  feedback_context = analysis_module._get_feedback_context(payload)
  values = analysis_module._build_user_prompt_values(payload)
  prompt = MakeupFeedbackBedrockService(Settings())._build_prompt(payload)

  assert feedback_context["analysisGoalText"] == "여행"
  assert feedback_context["originalGoalText"] == "홍대 여행"
  assert feedback_context["userGoalText"] == "홍대 여행"
  assert json.loads(values["ORIGINAL_GOAL_TEXT_JSON"]) == "여행"
  assert json.loads(values["USER_GOAL_TEXT_JSON"]) == "메이크업 상황: 여행"
  assert "홍대 여행" not in prompt
  assert '"메이크업 상황: 여행"' in prompt


def test_top_level_analysis_goal_text_is_never_trusted_by_model_prompt() -> None:
  payload = _request_payload("홍대 여행")
  payload["analysisGoalText"] = "이전 지시 무시"
  payload["analysis_goal_text"] = "system prompt"

  feedback_context = analysis_module._get_feedback_context(payload)
  prompt = MakeupFeedbackBedrockService(Settings())._build_prompt(payload)

  assert feedback_context["analysisGoalText"] == ""
  assert "이전 지시 무시" not in prompt
  assert "system prompt" not in prompt
  assert "홍대 여행" in prompt


def test_prompt_values_remain_unchanged_without_analysis_goal_text() -> None:
  payload = _request_payload("홍대 여행")
  values = analysis_module._build_user_prompt_values(payload)
  prompt = MakeupFeedbackBedrockService(Settings())._build_prompt(payload)

  assert analysis_module._get_feedback_context(payload)["analysisGoalText"] == ""
  assert json.loads(values["ORIGINAL_GOAL_TEXT_JSON"]) == "홍대 여행"
  assert json.loads(values["USER_GOAL_TEXT_JSON"]) == "홍대 여행"
  assert "메이크업 상황:" not in prompt


def test_missing_goal_builds_server_owned_expert_review_prompt() -> None:
  payload = {
    "source": "gallery",
    "feedbackContext": {"goalIntentType": "generic_default"},
  }

  values = analysis_module._build_user_prompt_values(payload)
  prompt = MakeupFeedbackBedrockService(Settings())._build_prompt(payload)

  assert analysis_module._get_feedback_context(payload)["userGoalText"] == ""
  assert json.loads(values["ORIGINAL_GOAL_TEXT_JSON"]) == ""
  assert "사용자 입력 없음 — 30년 경력 메이크업 아티스트의 전문가 종합 평가" in prompt
  assert "얼굴 특징에 대한 배치 적응" in prompt



@pytest.mark.asyncio
async def test_analyze_accepts_missing_goal_and_starts_image_read(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  service = MakeupFeedbackBedrockService(Settings())

  def fail_after_goal_validation(_payload):
    raise AppError(400, "TEST_IMAGE_READ_REACHED", "test sentinel")

  monkeypatch.setattr(
    service,
    "_read_image_bytes",
    fail_after_goal_validation,
  )

  with pytest.raises(AppError) as exc_info:
    await service.analyze(
      {"source": "gallery", "feedbackContext": {"goalIntentType": "generic_default"}},
    )

  assert exc_info.value.code == "TEST_IMAGE_READ_REACHED"



def test_generic_goal_keeps_user_words_and_style_neutral_common_baselines() -> None:
  payload = _request_payload("피드백 해줘")
  payload["feedbackContext"]["goalIntentType"] = "generic_default"

  prompt = MakeupFeedbackBedrockService(Settings())._build_prompt(payload)

  assert '"피드백 해줘"' in prompt
  assert "baseline-application" in prompt
  assert "baseline-coherence" in prompt
  assert "선명하거나 과감하다는 이유 자체로 낮게 평가하지 말고" in prompt
  assert "명확한 내부 조화 불일치를 무조건 optional로 낮추지 마세요" in prompt
  assert "구체적인 목적이 제공되지 않은 전체 메이크업 피드백 요청" not in prompt
  assert "전체적인 메이크업 균형과 자연스러움 기준" not in prompt



def test_prompt_separates_innate_features_from_makeup_performance() -> None:
  prompt = MakeupFeedbackBedrockService(Settings())._build_prompt(_request_payload())

  assert "타고난 특징을 사용자의 메이크업 장점이나 수행 성과로 표현하지 마세요" in prompt
  assert "내추럴·노메이크업 룩에서도 ‘아무것도 적용되지 않음’ 자체는 strength가 아닙니다" in prompt
  assert "제안이 공통 기준 또는 사용자별 dynamicCriteria 달성을 실제로 개선하면 improvement" in prompt
  assert "optional은 scoreImpact를 low로 쓰고 scoreEvidenceIds에는 포함하지 마세요" in prompt
  assert "strength 또는 improvement의 observation 중에서 dynamicCriteria에 연결되고" in prompt
  assert "얼굴·피부·이목구비 자체를 낮게 평가하지 마세요" in prompt
  assert "improvement와 optional은 모두 사용자 화면의 ‘보완할 점’에 함께 표시됩니다" in prompt
  assert "명시한 최소 구성에 포함되지 않는 부위는 optional로 다시 권하지 말고 not_applicable" in prompt
  assert "strengthSummary는 strength로 분류된 항목만 요약" in prompt
  assert "improvementSummary는 improvement와 optional로 분류된 항목만 요약" in prompt
  assert "새로운 칭찬을 만들지 말고" in prompt
  assert "새로운 보완점을 만들지 말고" in prompt
  assert "판단 제한 전체 요약" not in prompt


def test_prompt_renderer_rejects_missing_and_unknown_placeholders(tmp_path: Path) -> None:
  template_path = tmp_path / "prompt.md"
  template_path.write_text("{{KNOWN}} {{UNKNOWN}}", encoding="utf-8")

  with pytest.raises(AppError) as exc_info:
    render_prompt_template(
      template_path,
      {"KNOWN": "value", "MISSING": "value"},
      required_placeholders={"KNOWN", "MISSING"},
    )

  assert exc_info.value.code == "FEEDBACK_PROMPT_TEMPLATE_INVALID"
  assert exc_info.value.details["missing"] == ["MISSING"]
  assert exc_info.value.details["unknown"] == ["UNKNOWN"]


def test_prompt_renderer_does_not_rescan_inserted_values(tmp_path: Path) -> None:
  template_path = tmp_path / "prompt.md"
  template_path.write_text("{{FIRST}} {{SECOND}}", encoding="utf-8")

  rendered = render_prompt_template(
    template_path,
    {"FIRST": "{{SECOND}}", "SECOND": "done"},
    required_placeholders={"FIRST", "SECOND"},
  )

  assert rendered == "{{SECOND}} done"


def test_prompt_renderer_reports_missing_utf8_template(tmp_path: Path) -> None:
  with pytest.raises(AppError) as exc_info:
    render_prompt_template(
      tmp_path / "missing.md",
      {},
      required_placeholders=set(),
    )

  assert exc_info.value.code == "FEEDBACK_PROMPT_TEMPLATE_READ_FAILED"


@pytest.mark.parametrize(
  ("raw_score", "expected_score"),
  [(87.6, 88), (-4.2, 0), (104.8, 100), (82, 82)],
)
def test_require_score_rounds_and_clamps_model_number(
  raw_score: int | float,
  expected_score: int,
) -> None:
  assert analysis_module._require_score(raw_score) == expected_score


def test_live_result_preserves_summary_topic_and_coaching_contract() -> None:
  result = normalize_makeup_feedback_result(_valid_result(), _request_payload())

  assert result["scoreReason"].startswith("적용 완성도")
  assert result["summaryBadges"][2]["label"] == "11개 항목 분석"
  assert result["evaluations"][-1]["topicId"] == "lip"
  assert result["evaluations"][-1]["kind"] == "lip"
  assert result["evaluations"][0]["actionSteps"]
  assert result["strengths"][0]["actionSteps"]
  assert result["points"][0]["actionSteps"]
  assert result["points"][0]["correctionGuide"]["tool"] == "깨끗한 작은 블렌딩 브러시"


@pytest.mark.parametrize(
  "field",
  [
    "analysisDecision",
    "captureQuality",
    "score",
    "scoreBreakdown",
    "scoreRange",
    "scoreConfidence",
    "scoreEvidenceIds",
    "scoreLabel",
    "scoreReason",
    "interpretedGoal",
    "evaluations",
    "summary",
  ],
)
def test_live_result_rejects_missing_top_level_fields(field: str) -> None:
  raw_result = _valid_result()
  raw_result.pop(field)

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.code == "FEEDBACK_BEDROCK_OUTPUT_INVALID"
  assert exc_info.value.details["field"] == field


@pytest.mark.parametrize(
  "field",
  [
    "topicId",
    "topicLabel",
    "status",
    "visibility",
    "visibilityReason",
    "observations",
    "goalCriterionIds",
    "title",
    "description",
    "actionSteps",
    "correctionGuide",
    "scoreImpact",
    "confidence",
  ],
)
def test_live_result_rejects_missing_evaluation_fields(field: str) -> None:
  raw_result = _valid_result()
  raw_result["evaluations"][0].pop(field)

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.code == "FEEDBACK_BEDROCK_OUTPUT_INVALID"
  assert exc_info.value.details["field"] == f"evaluations[0].{field}"


@pytest.mark.parametrize(
  ("visibility", "expected_fragment"),
  [
    ("partial", "일부만 보여 제한적으로 평가했습니다"),
    ("not_visible", "충분히 보이지 않아 해당 항목을 평가하지 않았습니다"),
  ],
)
def test_live_result_repairs_missing_reason_for_limited_visibility(
  visibility: str,
  expected_fragment: str,
) -> None:
  raw_result = _valid_result()
  evaluation = raw_result["evaluations"][0]
  evaluation["visibility"] = visibility
  evaluation["visibilityReason"] = None

  if visibility == "not_visible":
    evaluation.update(
      {
        "status": "not_assessable",
        "observations": [],
        "goalCriterionIds": [],
        "actionSteps": [],
        "scoreImpact": "low",
      },
    )
    fallback_evidence_id = raw_result["evaluations"][1]["observations"][0]["id"]
    raw_result["scoreEvidenceIds"] = [fallback_evidence_id]
    for axis in raw_result["scoreBreakdown"]["axes"]:
      axis["evidenceIds"] = [fallback_evidence_id]
      for component in axis["components"]:
        component["evidenceIds"] = [fallback_evidence_id]

  result = normalize_makeup_feedback_result(raw_result, _request_payload())

  assert expected_fragment in result["evaluations"][0]["visibilityReason"]


@pytest.mark.parametrize(
  "action_steps",
  [[], ["", "두 번째 단계"], ["1", "2", "3", "4"], "한 단계"],
)
def test_live_result_rejects_invalid_action_steps(action_steps: object) -> None:
  raw_result = _valid_result()
  raw_result["evaluations"][0]["actionSteps"] = action_steps

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "evaluations[0].actionSteps"


@pytest.mark.parametrize(
  "field",
  ["tool", "amount", "targetArea", "coverage", "steps", "stopCondition", "why"],
)
def test_live_result_rejects_incomplete_improvement_correction_guide(field: str) -> None:
  raw_result = _valid_result()
  raw_result["evaluations"][1]["correctionGuide"].pop(field)

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == f"evaluations[1].correctionGuide.{field}"


@pytest.mark.parametrize(
  "steps",
  [[], ["한 단계"], ["같은 단계", "같은 단계"], ["1", "2", "3", "4", "5"]],
)
def test_live_result_rejects_non_actionable_correction_guide_steps(steps: list[str]) -> None:
  raw_result = _valid_result()
  raw_result["evaluations"][1]["correctionGuide"]["steps"] = steps

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "evaluations[1].correctionGuide.steps"


def test_live_result_rejects_vague_correction_amount() -> None:
  raw_result = _valid_result()
  raw_result["evaluations"][1]["correctionGuide"]["amount"] = "소량"

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "evaluations[1].correctionGuide.amount"


@pytest.mark.parametrize("amount", ["소량", "아주 소량", "적당히", "필요한 만큼"])
def test_live_result_rejects_vague_correction_amount_variants(amount: str) -> None:
  raw_result = _valid_result()
  raw_result["evaluations"][1]["correctionGuide"]["amount"] = amount

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "evaluations[1].correctionGuide.amount"


@pytest.mark.parametrize(
  ("field", "max_chars"),
  list(analysis_module.CORRECTION_GUIDE_FIELD_LIMITS.items()),
)
def test_live_result_bounds_each_correction_guide_text_field(
  field: str,
  max_chars: int,
) -> None:
  raw_result = _valid_result()
  raw_result["evaluations"][1]["correctionGuide"][field] = "가" * (max_chars + 1)

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == f"evaluations[1].correctionGuide.{field}"


def test_live_result_bounds_correction_guide_step_length() -> None:
  raw_result = _valid_result()
  raw_result["evaluations"][1]["correctionGuide"]["steps"][0] = (
    "가" * (analysis_module.CORRECTION_GUIDE_STEP_MAX_CHARS + 1)
  )

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "evaluations[1].correctionGuide.steps[0]"


@pytest.mark.parametrize(
  ("target", "contaminated_text", "expected_field"),
  [
    ("axis", "얼굴형 자체가 나빠 배치 점수를 낮췄습니다.", "scoreBreakdown.axes[0].reason"),
    ("scoreReason", "퍼스널컬러와 맞지 않아 감점했습니다.", "scoreReason"),
    ("title", "안 예쁨이 드러나는 눈썹", "evaluations[0].title"),
    ("description", "현재 얼굴은 매력 없음으로 보입니다.", "evaluations[0].description"),
    ("observation", "이목구비 자체가 나쁘게 보입니다.", "evaluations[0].observations[0].claim"),
    ("guide", "잘생기지 않음이 보여 이 수정을 권합니다.", "evaluations[1].correctionGuide.why"),
  ],
)
def test_live_result_rejects_innate_appearance_scoring_contamination(
  target: str,
  contaminated_text: str,
  expected_field: str,
) -> None:
  raw_result = _valid_result()
  if target == "axis":
    raw_result["scoreBreakdown"]["axes"][0]["reason"] = contaminated_text
  elif target == "scoreReason":
    raw_result["scoreReason"] = contaminated_text
  elif target == "title":
    raw_result["evaluations"][0]["title"] = contaminated_text
  elif target == "description":
    raw_result["evaluations"][0]["description"] = contaminated_text
  elif target == "observation":
    raw_result["evaluations"][0]["observations"][0]["claim"] = contaminated_text
  else:
    raw_result["evaluations"][1]["correctionGuide"]["why"] = contaminated_text

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == expected_field
  assert "innate attractiveness" in exc_info.value.details["reason"]


def test_user_explicit_fact_is_not_rejected_by_generated_text_validator() -> None:
  raw_result = _valid_result()
  raw_result["interpretedGoal"]["explicitFacts"] = ["사용자가 못생겨 보일까 걱정된다고 말함"]

  result = normalize_makeup_feedback_result(raw_result, _request_payload())

  assert result["interpretedGoal"]["explicitFacts"] == ["사용자가 못생겨 보일까 걱정된다고 말함"]


@pytest.mark.parametrize("score", [True, "87", None, float("nan")])
def test_live_result_rejects_non_numeric_or_non_finite_score(score: object) -> None:
  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(_valid_result(score), _request_payload())

  assert exc_info.value.details["field"] == "score"


def test_live_result_rejects_score_reason_longer_than_two_sentences() -> None:
  raw_result = _valid_result()
  raw_result["scoreReason"] = "첫 번째 근거입니다. 두 번째 근거입니다. 세 번째 근거입니다."

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details == {
    "field": "scoreReason",
    "reason": "must contain 1 or 2 sentences",
  }


def test_live_result_rejects_duplicate_topic_instead_of_filling_missing_topic() -> None:
  raw_result = _valid_result()
  first = raw_result["evaluations"][0]
  last = raw_result["evaluations"][-1]
  last["topicId"] = first["topicId"]
  last["topicLabel"] = first["topicLabel"]

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["reason"] == "must not be duplicated"


@pytest.mark.parametrize(
  ("section", "field", "expected_path"),
  [
    ("captureQuality", "usable", "captureQuality.usable"),
    ("captureQuality", "detectorAvailable", "captureQuality.detectorAvailable"),
    ("captureQuality", "colorConfidence", "captureQuality.colorConfidence"),
    ("captureQuality", "issues", "captureQuality.issues"),
    ("interpretedGoal", "explicitFacts", "interpretedGoal.explicitFacts"),
    ("interpretedGoal", "unknowns", "interpretedGoal.unknowns"),
    ("interpretedGoal", "assumptions", "interpretedGoal.assumptions"),
    ("interpretedGoal", "label", "interpretedGoal.label"),
    ("interpretedGoal", "intensity", "interpretedGoal.intensity"),
    ("interpretedGoal", "reason", "interpretedGoal.reason"),
    ("summary", "strengthSummary", "summary.strengthSummary"),
    ("summary", "improvementSummary", "summary.improvementSummary"),
    ("interpretedGoal", "dynamicCriteria", "interpretedGoal.dynamicCriteria"),
  ],
)
def test_live_result_rejects_missing_nested_contract_fields(
  section: str,
  field: str,
  expected_path: str,
) -> None:
  raw_result = _valid_result()
  raw_result[section].pop(field)

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == expected_path


@pytest.mark.parametrize(
  ("container", "field", "expected_path"),
  [
    ("criterion", "id", "interpretedGoal.dynamicCriteria[0].id"),
    ("criterion", "criterion", "interpretedGoal.dynamicCriteria[0].criterion"),
    ("observation", "id", "evaluations[0].observations[0].id"),
    ("observation", "claim", "evaluations[0].observations[0].claim"),
    ("observation", "evidenceLocation", "evaluations[0].observations[0].evidenceLocation"),
    ("observation", "lightingSensitive", "evaluations[0].observations[0].lightingSensitive"),
  ],
)
def test_live_result_rejects_missing_reference_contract_fields(
  container: str,
  field: str,
  expected_path: str,
) -> None:
  raw_result = _valid_result()
  target = (
    raw_result["interpretedGoal"]["dynamicCriteria"][0]
    if container == "criterion"
    else raw_result["evaluations"][0]["observations"][0]
  )
  target.pop(field)

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == expected_path


def test_live_result_accepts_nullable_score_for_retake_required() -> None:
  result = normalize_makeup_feedback_result(_retake_result(), _request_payload())

  assert result["analysisDecision"] == "retake_required"
  assert result["captureQuality"]["usable"] is False
  assert result["captureQuality"]["detectorAvailable"] is True
  assert result["captureQuality"]["colorConfidence"] == "low"
  assert result["score"] is None
  assert result["scoreBreakdown"] is None
  assert result["scoreRange"] is None
  assert result["scoreConfidence"] == 0.0
  assert result["scoreEvidenceIds"] == []
  assert all(item["status"] == "not_assessable" for item in result["evaluations"])
  assert all(item["actionSteps"] == [] for item in result["evaluations"])
  assert all(item["correctionGuide"] is None for item in result["evaluations"])
  assert result["points"] == []
  assert result["strengths"] == []


def test_live_result_accepts_not_applicable_with_empty_state_fields() -> None:
  raw_result = _valid_result()
  raw_result["evaluations"][-1].update(
    {
      "status": "not_applicable",
      "observations": [],
      "goalCriterionIds": [],
      "actionSteps": [],
      "scoreImpact": "low",
    },
  )

  result = normalize_makeup_feedback_result(raw_result, _request_payload())

  assert result["evaluations"][-1]["status"] == "not_applicable"
  assert result["evaluations"][-1]["actionSteps"] == []


def test_live_result_rejects_action_steps_for_non_actionable_status() -> None:
  raw_result = _retake_result()
  raw_result["evaluations"][0]["actionSteps"] = ["추측한 메이크업 방법"]

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "evaluations[0].actionSteps"


def test_live_result_rejects_unknown_goal_criterion_reference() -> None:
  raw_result = _valid_result()
  raw_result["evaluations"][0]["goalCriterionIds"] = ["missing-goal"]

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "evaluations[0].goalCriterionIds"
  assert exc_info.value.details["unknownIds"] == ["missing-goal"]


def test_live_result_rejects_duplicate_observation_ids_across_evaluations() -> None:
  raw_result = _valid_result()
  raw_result["evaluations"][1]["observations"][0]["id"] = "brow-obs-1"

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "evaluations[1].observations"
  assert exc_info.value.details["duplicateIds"] == ["brow-obs-1"]


def test_user_points_and_summary_count_include_improvement_and_optional() -> None:
  result = normalize_makeup_feedback_result(_valid_result(), _request_payload())
  point_topics = {point["topicId"] for point in result["points"]}

  assert len(result["points"]) == 10
  assert result["evaluations"][1]["topicId"] in point_topics
  assert result["evaluations"][2]["topicId"] in point_topics
  assert result["evaluations"][0]["topicId"] not in point_topics
  assert result["summaryBadges"][1]["label"] == "보완 항목 10개"


def test_material_optional_is_promoted_to_improvement() -> None:
  raw_result = _valid_result()
  optional_evaluation = raw_result["evaluations"][2]
  optional_evaluation["scoreImpact"] = "medium"
  optional_evaluation["correctionGuide"] = _correction_guide(optional_evaluation["topicLabel"])
  raw_result["scoreBreakdown"]["axes"][3]["components"][2]["evidenceIds"].append(
    optional_evaluation["observations"][0]["id"],
  )

  result = normalize_makeup_feedback_result(raw_result, _request_payload())
  normalized_by_topic = {item["topicId"]: item for item in result["evaluations"]}

  assert normalized_by_topic[optional_evaluation["topicId"]]["status"] == "improvement"
  assert optional_evaluation["topicId"] in {point["topicId"] for point in result["points"]}


def test_optional_observation_cannot_be_score_evidence() -> None:
  raw_result = _valid_result()
  optional_evaluation = raw_result["evaluations"][2]
  observation_id = optional_evaluation["observations"][0]["id"]
  raw_result["scoreBreakdown"]["axes"][0]["evidenceIds"] = [observation_id]

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "scoreBreakdown.axes[0].evidenceIds"
  assert exc_info.value.details["disallowedIds"] == [observation_id]


def test_partial_visibility_caps_evaluation_confidence() -> None:
  raw_result = _valid_result()
  evaluation = raw_result["evaluations"][2]
  evaluation["visibility"] = "partial"
  evaluation["visibilityReason"] = "모자 그림자로 일부 경계만 확인됩니다."
  evaluation["confidence"] = 0.95

  result = normalize_makeup_feedback_result(raw_result, _request_payload())

  assert (
    result["evaluations"][2]["confidence"]
    == analysis_module.PARTIAL_VISIBILITY_CONFIDENCE_CAP
  )


def test_not_assessable_confidence_is_zero() -> None:
  raw_result = _valid_result()
  evaluation = raw_result["evaluations"][2]
  evaluation.update(
    {
      "status": "not_assessable",
      "visibility": "partial",
      "visibilityReason": "반사 때문에 세부 적용을 확인할 수 없습니다.",
      "observations": [],
      "goalCriterionIds": [],
      "actionSteps": [],
      "correctionGuide": None,
      "scoreImpact": "low",
      "confidence": 0.95,
    },
  )

  result = normalize_makeup_feedback_result(raw_result, _request_payload())

  assert result["evaluations"][2]["confidence"] == 0.0


def test_score_confidence_is_capped_by_capture_and_evidence_confidence() -> None:
  raw_result = _mark_all_evaluations_as_strength(_valid_result(88))
  raw_result["captureQuality"]["colorConfidence"] = "medium"
  raw_result["scoreConfidence"] = 0.95

  result = normalize_makeup_feedback_result(raw_result, _request_payload())

  assert result["scoreConfidence"] == 0.74


def test_live_result_rejects_unknown_score_evidence_reference() -> None:
  raw_result = _valid_result()
  raw_result["scoreBreakdown"]["axes"][0]["evidenceIds"] = ["missing-observation"]

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "scoreBreakdown.axes[0].evidenceIds"
  assert exc_info.value.details["unknownIds"] == ["missing-observation"]


def test_live_result_repairs_topic_prefixed_score_evidence_reference() -> None:
  raw_result = _valid_result()
  raw_result["evaluations"][0]["observations"][0]["id"] = "brow-observation-primary"
  raw_result["scoreEvidenceIds"] = ["brow-obs-1"]
  for axis in raw_result["scoreBreakdown"]["axes"]:
    for component in axis["components"]:
      component["evidenceIds"] = [
        "brow-observation-primary" if item == "brow-obs-1" else item
        for item in component["evidenceIds"]
      ]

  result = normalize_makeup_feedback_result(raw_result, _request_payload())

  assert result["scoreEvidenceIds"] == ["brow-observation-primary", "lash-obs-1"]


def test_live_result_repairs_score_range_that_does_not_include_axis_total() -> None:
  raw_result = _mark_all_evaluations_as_strength(_valid_result())
  raw_result["scoreRange"] = [0, 80]

  result = normalize_makeup_feedback_result(raw_result, _request_payload())

  assert result["scoreRange"] == [20, 100]
  assert result["scoreRange"][0] <= result["score"] <= result["scoreRange"][1]


@pytest.mark.parametrize(
  ("factory", "expected_reason"),
  [
    ("completed_with_unusable", "must be true when analysisDecision is completed"),
    ("retake_with_usable", "must be false when analysisDecision is retake_required"),
  ],
)
def test_live_result_rejects_decision_and_capture_quality_mismatch(
  factory: str,
  expected_reason: str,
) -> None:
  if factory == "completed_with_unusable":
    result = _valid_result()
    result["captureQuality"] = _retake_result()["captureQuality"]
  else:
    result = _retake_result()
    result["captureQuality"] = _valid_result()["captureQuality"]

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(result, _request_payload())

  assert exc_info.value.details["field"] == "captureQuality.usable"
  assert exc_info.value.details["reason"] == expected_reason



def test_capture_quality_rejects_more_than_six_issues() -> None:
  raw_result = _valid_result()
  raw_result["captureQuality"]["issues"] = [
    {
      "code": f"issue-{index}",
      "message": f"quality issue {index}",
      "affectedTopicIds": [],
    }
    for index in range(7)
  ]

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "captureQuality.issues"


def test_capture_quality_rejects_unknown_affected_topic_id() -> None:
  raw_result = _valid_result()
  raw_result["captureQuality"]["issues"] = [
    {
      "code": "detectorUnavailable",
      "message": "랜드마크 확인이 제한됩니다.",
      "affectedTopicIds": ["unknown-topic"],
    },
  ]

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "captureQuality.issues[0].affectedTopicIds"
  assert exc_info.value.details["unknownIds"] == ["unknown-topic"]


def test_dynamic_criterion_source_uses_trusted_original_goal() -> None:
  payload = _request_payload("  피드백   해줘  ")
  raw_result = _valid_result()
  raw_result["interpretedGoal"]["dynamicCriteria"][2]["derivedFrom"] = "피드백 해줘"

  result = normalize_makeup_feedback_result(raw_result, payload)

  assert result["interpretedGoal"]["dynamicCriteria"][2]["derivedFrom"] == "피드백 해줘"


def test_dynamic_criterion_sources_are_server_owned_when_model_omits_them() -> None:
  raw_result = _valid_result()
  for criterion in raw_result["interpretedGoal"]["dynamicCriteria"]:
    criterion.pop("derivedFrom")

  result = normalize_makeup_feedback_result(raw_result, _request_payload())

  criteria = result["interpretedGoal"]["dynamicCriteria"]
  assert criteria[0]["derivedFrom"] == "공통 기준: 적용 완성도"
  assert criteria[0]["sourceType"] == "common_baseline"
  assert criteria[2]["derivedFrom"] == "데이트에서 자연스럽고 생기 있게 보이고 싶어요"
  assert criteria[2]["sourceType"] == "explicit_user_goal"


def test_dynamic_criterion_source_uses_trusted_analysis_goal() -> None:
  payload = _request_payload("처음 가는 야시장")
  payload["feedbackContext"]["analysisGoalText"] = "외출 상황"
  raw_result = _valid_result()
  raw_result["interpretedGoal"]["dynamicCriteria"][2]["derivedFrom"] = "외출 상황"

  result = normalize_makeup_feedback_result(raw_result, payload)

  assert result["interpretedGoal"]["dynamicCriteria"][2]["derivedFrom"] == "외출 상황"


def test_dynamic_criterion_source_ignores_model_paraphrase() -> None:
  raw_result = _valid_result()
  raw_result["interpretedGoal"]["dynamicCriteria"][2]["derivedFrom"] = "화려한 메이크업"

  result = normalize_makeup_feedback_result(raw_result, _request_payload())

  assert result["interpretedGoal"]["dynamicCriteria"][2]["derivedFrom"] == (
    "데이트에서 자연스럽고 생기 있게 보이고 싶어요"
  )
  assert result["interpretedGoal"]["dynamicCriteria"][2]["sourceType"] == (
    "explicit_user_goal"
  )


def test_dynamic_criterion_derived_from_uses_server_owned_expert_source_without_goal() -> None:
  raw_result = _valid_result()
  raw_result["interpretedGoal"]["explicitFacts"] = []
  raw_result["interpretedGoal"]["dynamicCriteria"][2]["derivedFrom"] = "모델이 만든 출처"
  payload = {
    "source": "camera",
    "feedbackContext": {
      "goalIntentType": "generic_default",
      "normalizedGoalText": "",
      "originalGoalText": "",
      "userGoalText": "",
    },
  }

  result = normalize_makeup_feedback_result(raw_result, payload)

  assert result["interpretedGoal"]["explicitFacts"] == []
  assert result["interpretedGoal"]["dynamicCriteria"][2]["derivedFrom"] == (
    analysis_module.GENERIC_EXPERT_REVIEW_DERIVED_FROM
  )
  assert result["interpretedGoal"]["dynamicCriteria"][2]["sourceType"] == (
    "inferred_expert_standard"
  )
  assert result["interpretedGoal"]["dynamicCriteria"][0]["sourceType"] == (
    "common_baseline"
  )


def test_dynamic_criteria_rejects_missing_common_baseline() -> None:
  raw_result = _valid_result()
  raw_result["interpretedGoal"]["dynamicCriteria"] = raw_result["interpretedGoal"][
    "dynamicCriteria"
  ][1:]
  raw_result["interpretedGoal"]["dynamicCriteria"].append(
    {
      "id": "goal-2",
      "criterion": "사용자가 요청한 생기 있는 표현을 확인한다",
      "derivedFrom": "생기 있게 보이고 싶어요",
    },
  )

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "interpretedGoal.dynamicCriteria"
  assert exc_info.value.details["missingBaselineIds"] == ["baseline-application"]


def test_dynamic_criteria_rejects_modified_common_baseline() -> None:
  raw_result = _valid_result()
  raw_result["interpretedGoal"]["dynamicCriteria"][0]["criterion"] = "모델이 바꾼 공통 기준"

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert (
    exc_info.value.details["field"]
    == "interpretedGoal.dynamicCriteria[0].criterion"
  )


def test_dynamic_criteria_rejects_modified_common_baseline_id() -> None:
  raw_result = _valid_result()
  raw_result["interpretedGoal"]["dynamicCriteria"][0]["id"] = "baseline-application-edited"

  with pytest.raises(AppError) as exc_info:
    normalize_makeup_feedback_result(raw_result, _request_payload())

  assert exc_info.value.details["field"] == "interpretedGoal.dynamicCriteria"
  assert exc_info.value.details["missingBaselineIds"] == ["baseline-application"]


def test_photo_source_label_distinguishes_camera_and_gallery() -> None:
  camera_result = normalize_makeup_feedback_result(_valid_result(), _request_payload())
  gallery_payload = _request_payload()
  gallery_payload["source"] = "gallery"
  gallery_result = normalize_makeup_feedback_result(_valid_result(), gallery_payload)

  assert camera_result["photoSourceLabel"] == "카메라로 촬영한 사진"
  assert gallery_result["photoSourceLabel"] == "앨범에서 선택한 사진"



@pytest.mark.asyncio
async def test_non_bedrock_provider_raises_instead_of_returning_fallback() -> None:
  with pytest.raises(AppError) as exc_info:
    await build_makeup_feedback_result_for_request(
      _request_payload(),
      Settings(ai_provider="openai"),
    )

  assert exc_info.value.code == "FEEDBACK_ANALYSIS_PROVIDER_UNSUPPORTED"


@pytest.mark.asyncio
async def test_bedrock_app_error_propagates_without_fallback(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  original_error = AppError(502, "FEEDBACK_BEDROCK_OUTPUT_INVALID", "Invalid output.")

  async def fail_analyze(_self, _payload):
    raise original_error

  monkeypatch.setattr(MakeupFeedbackBedrockService, "analyze", fail_analyze)

  with pytest.raises(AppError) as exc_info:
    await build_makeup_feedback_result_for_request(_request_payload(), Settings())

  assert exc_info.value is original_error


@pytest.mark.asyncio
async def test_bedrock_client_error_is_wrapped_as_app_error(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def fail_analyze(_self, _payload):
    raise ClientError(
      {"Error": {"Code": "ThrottlingException", "Message": "throttled"}},
      "InvokeModel",
    )

  monkeypatch.setattr(MakeupFeedbackBedrockService, "analyze", fail_analyze)

  with pytest.raises(AppError) as exc_info:
    await build_makeup_feedback_result_for_request(_request_payload(), Settings())

  assert exc_info.value.code == "FEEDBACK_BEDROCK_INVOCATION_FAILED"
  assert exc_info.value.details == {"reason": "ClientError"}


def test_bedrock_json_parse_error_is_not_normalized_to_fallback() -> None:
  service = MakeupFeedbackBedrockService(Settings())

  with pytest.raises(AppError) as exc_info:
    service._parse_json_output("not-json")

  assert exc_info.value.code == "FEEDBACK_BEDROCK_OUTPUT_PARSE_FAILED"



def test_bedrock_max_tokens_stop_reason_raises_explicit_truncation_error(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  service, _calls = _service_with_bedrock_result(
    monkeypatch,
    _valid_result(),
    stop_reason="max_tokens",
  )

  with pytest.raises(AppError) as exc_info:
    service._analyze_sync(_request_payload(), _vision_result())

  assert exc_info.value.code == "FEEDBACK_BEDROCK_OUTPUT_TRUNCATED"



def test_bedrock_invoke_uses_external_system_and_user_prompts(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: dict[str, object] = {}

  class ResponseBody:
    def read(self) -> str:
      return json.dumps(
        {"content": [{"type": "text", "text": json.dumps(_valid_result(), ensure_ascii=False)}]},
        ensure_ascii=False,
      )

  class FakeBedrockClient:
    def invoke_model(self, **kwargs):
      calls.update(kwargs)
      return {"body": ResponseBody()}

  service = MakeupFeedbackBedrockService(
    Settings(makeup_feedback_evidence_pipeline_enabled=False),
  )
  monkeypatch.setattr(service, "_bedrock_runtime_client", lambda: FakeBedrockClient())

  result = service._analyze_sync(_request_payload(), _vision_result())
  request_body = json.loads(calls["body"])

  assert request_body["system"] == service._build_system_prompt()
  assert request_body["max_tokens"] == analysis_module.BEDROCK_COMPACT_FINAL_MAX_TOKENS
  assert request_body["messages"][0]["content"][0]["text"] == service._build_compact_prompt(_request_payload())
  assert "amazon-bedrock-guardrailConfig" not in request_body
  assert all(
    analysis_module.BEDROCK_GUARDRAIL_TAG_PREFIX not in str(part.get("text") or "")
    for part in request_body["messages"][0]["content"]
    if isinstance(part, dict)
  )
  assert result["score"] == 88
  assert result["evaluations"][-1]["topicId"] == "lip"


def test_compact_high_reasoning_path_uses_one_bedrock_call_and_expands_contract(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: list[dict[str, object]] = []

  class ResponseBody:
    def read(self) -> str:
      return json.dumps(
        {
          "content": [
            {
              "type": "text",
              "text": json.dumps(_compact_result(), ensure_ascii=False),
            },
          ],
        },
        ensure_ascii=False,
      )

  class FakeBedrockClient:
    def invoke_model(self, **kwargs):
      calls.append(kwargs)
      return {"body": ResponseBody()}

  settings = Settings(
    bedrock_analysis_model_id="global.anthropic.claude-sonnet-4-6",
    makeup_feedback_evidence_pipeline_enabled=False,
    makeup_feedback_compact_single_call_enabled=True,
    makeup_feedback_adaptive_thinking_enabled=True,
    makeup_feedback_global_inference_allowed=True,
    makeup_feedback_reasoning_effort="high",
  )
  service = MakeupFeedbackBedrockService(settings)
  monkeypatch.setattr(service, "_bedrock_runtime_client", lambda: FakeBedrockClient())

  result = service._analyze_sync(_request_payload(), _vision_result())

  assert len(calls) == 1
  request_body = json.loads(calls[0]["body"])
  assert request_body["output_config"] == {"effort": "high"}
  assert request_body["max_tokens"] == analysis_module.BEDROCK_COMPACT_FINAL_MAX_TOKENS
  assert len(service._build_compact_prompt(_request_payload())) < len(service._build_prompt(_request_payload()))
  assert result["score"] == 87
  assert len(result["evaluations"]) == len(FEEDBACK_TOPICS)
  assert sum(
    len(axis["components"])
    for axis in result["scoreBreakdown"]["axes"]
  ) == 13


def test_global_sonnet_46_requires_explicit_routing_opt_in() -> None:
  service = MakeupFeedbackBedrockService(
    Settings(
      bedrock_analysis_model_id="global.anthropic.claude-sonnet-4-6",
      makeup_feedback_global_inference_allowed=False,
    ),
  )

  with pytest.raises(AppError) as exc_info:
    service._analyze_sync(_request_payload(), _vision_result())

  assert exc_info.value.code == "FEEDBACK_GLOBAL_INFERENCE_NOT_ALLOWED"


def test_sonnet_46_evidence_pipeline_observes_audits_then_scores(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  observation = {
    "imageAssessment": {
      "scoreable": True,
      "lightingReliability": "high",
      "geometryReliability": "high",
      "textureReliability": "high",
      "limitations": [],
    },
    "faceStructure": [],
    "observations": [
      {
        "id": "OBS-001",
        "topicId": "eyeliner",
        "polarity": "negative",
        "claim": "아이라인 꼬리 끝의 두께가 좌우에서 다르게 보입니다.",
      },
    ],
    "crossRegionChecks": [],
  }
  audit = {
    "auditSummary": {"scoreable": True, "keyRisks": ["아이라인 과대평가 금지"]},
    "verifiedObservations": [
      {
        "id": "AUD-001",
        "sourceObservationIds": ["OBS-001"],
        "topicId": "eyeliner",
        "verdict": "confirmed",
        "polarity": "negative",
        "claim": "아이라인 꼬리 끝의 두께가 좌우에서 다르게 보입니다.",
      },
    ],
    "rejectedObservations": [],
    "contradictions": [],
    "missingChecks": [],
  }
  responses = iter((observation, audit, _valid_result()))
  calls: list[dict[str, object]] = []

  class ResponseBody:
    def __init__(self, value: dict) -> None:
      self.value = value

    def read(self) -> str:
      return json.dumps(
        {"content": [{"type": "text", "text": json.dumps(self.value, ensure_ascii=False)}]},
        ensure_ascii=False,
      )

  class FakeBedrockClient:
    def invoke_model(self, **kwargs):
      calls.append(kwargs)
      return {"body": ResponseBody(next(responses))}

  service = MakeupFeedbackBedrockService(
    Settings(
      bedrock_analysis_model_id="global.anthropic.claude-sonnet-4-6",
      makeup_feedback_evidence_pipeline_enabled=True,
      makeup_feedback_adaptive_thinking_enabled=True,
      makeup_feedback_global_inference_allowed=True,
      makeup_feedback_reasoning_effort="high",
    ),
  )
  monkeypatch.setattr(service, "_bedrock_runtime_client", lambda: FakeBedrockClient())

  result = service._analyze_sync(_request_payload(), _vision_result())

  assert result["score"] == 88
  assert len(calls) == 3
  bodies = [json.loads(str(call["body"])) for call in calls]
  assert [call["modelId"] for call in calls] == [
    "global.anthropic.claude-sonnet-4-6",
  ] * 3
  assert all(body["thinking"] == {"type": "adaptive"} for body in bodies)
  assert all(body["output_config"] == {"effort": "high"} for body in bodies)
  assert all("temperature" not in body for body in bodies)
  assert bodies[0]["system"] == service._build_static_prompt(
    service.observation_system_prompt_path,
  )
  assert bodies[1]["system"] == service._build_static_prompt(
    service.audit_system_prompt_path,
  )
  final_text = "\n".join(
    str(part.get("text") or "")
    for part in bodies[2]["messages"][0]["content"]
    if isinstance(part, dict) and part.get("type") == "text"
  )
  assert "Server-generated audited evidence JSON follows" in final_text
  assert "AUD-001" in final_text

def test_bedrock_invoke_uses_fresh_server_controlled_guardrail_tags(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: list[dict[str, object]] = []
  suffixes = iter(("a" * 20, "b" * 20))
  requested_sizes: list[int] = []

  def fake_token_hex(size: int) -> str:
    requested_sizes.append(size)
    return next(suffixes)

  class ResponseBody:
    def read(self) -> str:
      return json.dumps(
        {"content": [{"type": "text", "text": json.dumps(_valid_result(), ensure_ascii=False)}]},
        ensure_ascii=False,
      )

  class FakeBedrockClient:
    def invoke_model(self, **kwargs):
      calls.append(kwargs)
      return {"body": ResponseBody()}

  settings = Settings(
    bedrock_guardrail_id="gr-123",
    bedrock_guardrail_version="1",
    makeup_feedback_evidence_pipeline_enabled=False,
  )
  service = MakeupFeedbackBedrockService(settings)
  monkeypatch.setattr(service, "_bedrock_runtime_client", lambda: FakeBedrockClient())
  monkeypatch.setattr(analysis_module.secrets, "token_hex", fake_token_hex)

  service._analyze_sync(_request_payload(), _vision_result())
  service._analyze_sync(_request_payload(), _vision_result())

  assert requested_sizes == [analysis_module.BEDROCK_GUARDRAIL_TAG_SUFFIX_BYTES] * 2
  assert [call["guardrailIdentifier"] for call in calls] == ["gr-123", "gr-123"]
  assert [call["guardrailVersion"] for call in calls] == ["1", "1"]

  bodies = [json.loads(str(call["body"])) for call in calls]
  assert [body["amazon-bedrock-guardrailConfig"]["tagSuffix"] for body in bodies] == [
    "a" * 20,
    "b" * 20,
  ]

  for body, suffix in zip(bodies, ("a" * 20, "b" * 20), strict=True):
    tag_name = f"{analysis_module.BEDROCK_GUARDRAIL_TAG_PREFIX}_{suffix}"
    marker = f"<{tag_name}>{analysis_module.BEDROCK_GUARDRAIL_VALIDATED_MARKER}</{tag_name}>"
    text_parts = [
      str(part.get("text") or "")
      for part in body["messages"][0]["content"]
      if isinstance(part, dict) and part.get("type") == "text"
    ]
    assert text_parts.count(marker) == 1


def test_bedrock_guardrail_intervention_is_explicit_and_does_not_log_trace(
  monkeypatch: pytest.MonkeyPatch,
  caplog: pytest.LogCaptureFixture,
) -> None:
  sensitive_trace_value = "never-log-this-sensitive-match"

  class ResponseBody:
    def read(self) -> str:
      return json.dumps(
        {
          "amazon-bedrock-guardrailAction": "INTERVENED",
          "amazon-bedrock-trace": {"sensitiveMatch": sensitive_trace_value},
          "content": [{"type": "text", "text": "not-json"}],
        },
        ensure_ascii=False,
      )

  class FakeBedrockClient:
    def invoke_model(self, **_kwargs):
      return {"body": ResponseBody()}

  service = MakeupFeedbackBedrockService(
    Settings(
      bedrock_guardrail_id="gr-123",
      bedrock_guardrail_version="1",
      makeup_feedback_evidence_pipeline_enabled=False,
    ),
  )
  monkeypatch.setattr(service, "_bedrock_runtime_client", lambda: FakeBedrockClient())

  with pytest.raises(AppError) as exc_info:
    service._analyze_sync(_request_payload(), _vision_result())

  assert exc_info.value.code == "FEEDBACK_BEDROCK_GUARDRAIL_INTERVENED"
  assert sensitive_trace_value not in caplog.text




@pytest.mark.asyncio
async def test_hard_vision_retake_skips_bedrock_and_caps_prioritized_issues(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  service = MakeupFeedbackBedrockService(Settings())
  monkeypatch.setattr(service, "_read_image_bytes", lambda _payload: b"source-image")
  monkeypatch.setattr(
    analysis_module,
    "process_image_bytes",
    lambda _body: SimpleNamespace(
      body=b"sanitized-image",
      content_type="image/jpeg",
      exif_removed=True,
    ),
  )
  issues = (
    _vision_issue("detectorUnavailable"),
    _vision_issue("extremeRoll", severity="hard"),
    _vision_issue("overexposed", severity="hard"),
    _vision_issue("faceTooSmall", severity="hard"),
    _vision_issue("resolutionTooLow", severity="hard"),
    _vision_issue("noFace", severity="hard"),
    _vision_issue("extremeYaw", severity="hard"),
    _vision_issue("severeBlur", severity="hard"),
  )
  vision_result = _vision_result(
    quality_issues=issues,
    hard_retake=True,
  )
  prepared_bodies: list[bytes] = []

  def prepare(body: bytes) -> MakeupFeedbackVisionResult:
    prepared_bodies.append(body)
    return vision_result

  monkeypatch.setattr(analysis_module, "prepare_makeup_feedback_vision", prepare)
  monkeypatch.setattr(
    service,
    "_bedrock_runtime_client",
    lambda: pytest.fail("Bedrock must not be called for a hard vision retake"),
  )

  result = await service.analyze(_request_payload())

  assert prepared_bodies == [b"sanitized-image"]
  assert result["analysisDecision"] == "retake_required"
  assert result["score"] is None
  assert result["scoreRange"] is None
  assert result["captureQuality"]["usable"] is False
  assert result["captureQuality"]["colorConfidence"] == "low"
  assert [issue["code"] for issue in result["captureQuality"]["issues"]] == [
    "noFace",
    "resolutionTooLow",
    "faceTooSmall",
    "overexposed",
    "severeBlur",
    "extremeYaw",
  ]
  assert all(
    issue["message"] and issue["affectedTopicIds"]
    for issue in result["captureQuality"]["issues"]
  )
  assert result["scoreLabel"] == "재촬영 필요"
  assert result["modelVersion"] == MODEL_VERSION
  assert service.analysis_status == "vision_retake_required"


def test_normal_vision_sends_canonical_labeled_region_pairs_and_safe_context(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  service, calls = _service_with_bedrock_result(monkeypatch, _valid_result())
  payload = _request_payload()
  payload.update(
    {
      "bucket": "private-bucket-must-not-leak",
      "objectKey": "private/object-key.jpg",
      "userId": "private-user",
    },
  )
  vision_result = _vision_result(
    pose=FacePose(yaw_deg=1.5, pitch_deg=-2.0, roll_deg=0.5),
  )

  result = service._analyze_sync(payload, vision_result)

  request_body_text = calls["body"]
  assert isinstance(request_body_text, str)
  assert len(request_body_text.encode("utf-8")) < BEDROCK_REQUEST_BODY_MAX_BYTES
  assert "private-bucket-must-not-leak" not in request_body_text
  assert "private/object-key.jpg" not in request_body_text
  assert "private-user" not in request_body_text

  request_body = json.loads(request_body_text)
  content = request_body["messages"][0]["content"]
  expected_names = [
      "full",
      "left_eye",
      "right_eye",
      "lips",
  ]
  vision_context = content[1]["text"]
  assert '"detectorAvailable":true' in vision_context
  assert '"faceCount":1' in vision_context
  assert '"pose":' in vision_context
  assert '"regionNames":["full","left_eye","right_eye","lips"]' in vision_context
  assert '"landmarks"' not in vision_context
  assert '"faceBox"' not in vision_context
  assert '"metrics"' not in vision_context

  for index, name in enumerate(expected_names):
    label_block = content[2 + index * 2]
    image_block = content[3 + index * 2]
    assert label_block == {
      "type": "text",
      "text": f"Image region: {name} ({analysis_module.VISION_REGION_LABELS[name]})",
    }
    assert image_block["type"] == "image"
    assert image_block["source"]["media_type"] == "image/jpeg"
    assert base64.b64decode(image_block["source"]["data"]) == vision_result.regions[name].body

  assert result["analysisDecision"] == "completed"
  assert result["captureQuality"] == {
    "usable": True,
    "detectorAvailable": True,
    "colorConfidence": "high",
    "issues": [],
  }

  assert result["analysisImageSize"] == {"width": 1080, "height": 1440}
  assert [region["id"] for region in result["evidenceRegions"]] == expected_names
  assert result["evidenceRegions"][0]["box"] == {
    "left": 0.0,
    "top": 0.0,
    "right": 320 / 1080,
    "bottom": 240 / 1440,
  }
  assert result["evaluations"][0]["observations"][0]["evidenceRegionIds"] == [
    "left_eye",
    "right_eye",
  ]
  assert result["evaluations"][-1]["observations"][0]["evidenceRegionIds"] == [
    "lips",
  ]

def test_detector_unavailable_is_soft_and_still_invokes_bedrock(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  service, calls = _service_with_bedrock_result(monkeypatch, _valid_result())
  vision_result = _vision_result(
    detector_available=False,
    quality_issues=(_vision_issue("detectorUnavailable"),),
    region_sizes={"full": 12},
  )

  result = service._analyze_sync(_request_payload(), vision_result)

  assert calls
  assert result["analysisDecision"] == "completed"
  assert result["captureQuality"]["usable"] is True
  assert result["captureQuality"]["detectorAvailable"] is False
  assert result["captureQuality"]["colorConfidence"] == "medium"
  assert result["captureQuality"]["issues"] == [
    {
      "code": "detectorUnavailable",
      "message": "얼굴 랜드마크 검사를 사용할 수 없어 일부 품질 판단이 제한됩니다.",
      "affectedTopicIds": [topic["id"] for topic in FEEDBACK_TOPICS],
    },
  ]
  assert result["evaluations"][0]["observations"][0]["evidenceRegionIds"] == [
    "full",
  ]


def test_server_vision_capture_quality_preserves_more_conservative_model_color_confidence(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  model_result = _valid_result(50)
  model_result["scoreRange"] = [40, 60]
  model_result["captureQuality"] = _retake_result()["captureQuality"]
  service, _calls = _service_with_bedrock_result(monkeypatch, model_result)

  result = service._analyze_sync(_request_payload(), _vision_result())

  assert result["analysisDecision"] == "completed"
  assert result["captureQuality"] == {
    "usable": True,
    "detectorAvailable": True,
    "colorConfidence": "low",
    "issues": [],
  }


def test_lighting_sensitive_score_evidence_downgrades_color_and_score_confidence(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  model_result = _valid_result(50)
  model_result["scoreRange"] = [40, 60]
  model_result["evaluations"][0]["observations"][0]["lightingSensitive"] = True
  service, _calls = _service_with_bedrock_result(monkeypatch, model_result)

  result = service._analyze_sync(_request_payload(), _vision_result())

  assert result["captureQuality"]["colorConfidence"] == "medium"
  assert result["scoreConfidence"] == analysis_module.LIGHTING_SENSITIVE_SCORE_CONFIDENCE_CAP


def test_model_visibility_retake_preserves_server_detector_and_color_values(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  service, _calls = _service_with_bedrock_result(monkeypatch, _retake_result())

  result = service._analyze_sync(_request_payload(), _vision_result())

  assert result["analysisDecision"] == "retake_required"
  assert result["captureQuality"]["usable"] is False
  assert result["captureQuality"]["detectorAvailable"] is True
  assert result["captureQuality"]["colorConfidence"] == "low"
  assert result["captureQuality"]["issues"][0]["code"] == "modelVisibilityInsufficient"
  assert result["captureQuality"]["issues"][0]["message"].startswith("얼굴은 감지됐지만")


def test_region_budget_keeps_request_under_24mb_and_drops_lower_priority_pairs(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  service, calls = _service_with_bedrock_result(monkeypatch, _valid_result())
  region_size = 3_500_000
  vision_result = _vision_result(
    region_sizes={
      "full": region_size,
      "left_eye": region_size,
      "right_eye": region_size,
      "left_cheek": region_size,
      "right_cheek": region_size,
      "lips": region_size,
    },
  )

  service._analyze_sync(_request_payload(), vision_result)

  request_body_text = calls["body"]
  assert isinstance(request_body_text, str)
  assert len(request_body_text.encode("utf-8")) < BEDROCK_REQUEST_BODY_MAX_BYTES
  content = json.loads(request_body_text)["messages"][0]["content"]
  image_blocks = [block for block in content if block["type"] == "image"]
  label_names = [
    block["text"].split(":", 1)[1].strip().split(" ", 1)[0]
    for block in content
    if block["type"] == "text" and block["text"].startswith("Image region:")
  ]
  assert label_names == ["full", "left_eye", "right_eye", "lips"]
  assert sum(
    len(base64.b64decode(block["source"]["data"]))
    for block in image_blocks
  ) <= BEDROCK_REGION_TOTAL_RAW_BYTES


@pytest.mark.asyncio
async def test_wrapper_returns_vision_retake_required_status(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def retake_analyze(self, _payload):
    self.analysis_status = "vision_retake_required"
    return {
      "analysisDecision": "retake_required",
      "captureQuality": {
        "usable": False,
        "detectorAvailable": True,
        "colorConfidence": "low",
        "issues": [
          {
            "code": "severeBlur",
            "message": "흐린 사진입니다.",
            "affectedTopicIds": [],
          },
        ],
      },
      "score": None,
      "scoreRange": None,
    }

  monkeypatch.setattr(MakeupFeedbackBedrockService, "analyze", retake_analyze)

  result, analysis_status, error = await build_makeup_feedback_result_for_request(
    _request_payload(),
    Settings(),
  )

  assert result["analysisDecision"] == "retake_required"
  assert analysis_status == "vision_retake_required"
  assert error is None



@pytest.mark.asyncio
async def test_feedback_job_marks_report_failed_when_analysis_raises(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  report_id = UUID("11111111-1111-1111-1111-111111111111")
  user_id = UUID("22222222-2222-2222-2222-222222222222")

  class FakeDB:
    def __init__(self) -> None:
      self.executed: list[tuple] = []
      self.fetchrow_called = False

    async def execute(self, *args):
      self.executed.append(args)
      return "UPDATE 1"

    async def fetchrow(self, *_args):
      self.fetchrow_called = True
      return None

  async def fail_build(_request_payload, _settings):
    raise AppError(
      502,
      "FEEDBACK_BEDROCK_OUTPUT_INVALID",
      "Bedrock feedback analysis returned an invalid result.",
      {"field": "scoreReason", "reason": "is required"},
    )

  monkeypatch.setattr(feedback_api, "build_makeup_feedback_result_for_request", fail_build)
  db = FakeDB()

  await feedback_api.run_feedback_job_background(
    report_id,
    user_id,
    _request_payload(),
    Settings(),
    db=db,  # type: ignore[arg-type]
  )

  assert len(db.executed) == 2
  assert "status = 'processing'" in db.executed[0][0]
  assert "status = 'failed'" in db.executed[1][0]
  assert "user_id = $2" in db.executed[0][0]
  assert "user_id = $2" in db.executed[1][0]
  assert db.executed[0][1:3] == (report_id, user_id)
  failed_payload = json.loads(db.executed[1][3])
  assert failed_payload["error"]["details"]["field"] == "scoreReason"
  assert db.fetchrow_called is False
