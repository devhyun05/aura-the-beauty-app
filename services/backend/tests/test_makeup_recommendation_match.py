from copy import deepcopy

from app.services.makeup_recommendation_match import build_match_assessment


QUESTIONS = [
  {
    "id": "intensity",
    "title": "원하는 표현 강도는?",
    "options": [
      {"id": "balanced", "label": "또렷하지만 과하지 않게"},
      {"id": "ai_pick", "label": "AI가 골라줘"},
    ],
  },
]


def _step(text: str, *colors: str) -> dict:
  return {
    "title": text,
    "productType": text,
    "tool": "브러시",
    "amount": "소량",
    "placement": text,
    "technique": text,
    "blending": text,
    "finishCheck": text,
    "colors": [
      {"role": f"색상 {index}", "name": f"추천색 {index}", "hex": color}
      for index, color in enumerate(colors, start=1)
    ],
  }


def _guide(area: str, name: str, color: str, texture: str, text: str) -> dict:
  return {
    "area": area,
    "label": area,
    "goal": text,
    "color": {"name": name, "hex": color},
    "texture": texture,
    "placement": text,
    "technique": text,
    "reason": text,
    "avoid": [],
    "steps": [{"order": 1, "instruction": text}],
    "applicationPlan": {
      "steps": [_step(text, color)],
      "completionCriteria": [text],
    },
  }


def _recommendation(
  *,
  situation: str = "중요한 발표에 맞는 정돈된 메이크업",
  preference: str = "또렷하지만 과하지 않게",
  base_text: str = "T존만 파우더로 고정하고 광대의 수분광은 유지",
  eye_hex: str = "#987583",
  cheek_hex: str = "#B07D87",
  lip_hex: str = "#9E6E78",
) -> dict:
  return {
    "generationSource": "claude",
    "contextSummary": [situation, preference],
    "looks": [
      {
        "id": "anchor",
        "role": "anchor",
        "title": situation,
        "summary": f"{preference} 표현한 차분한 로즈 룩",
        "reasons": [situation, preference],
        "appliedConditions": [situation, preference],
        "imageBrief": f"{situation}, {preference}",
        "areaGuides": [
          _guide("base", "뉴트럴 베이지", "#D9B49A", "세미 매트", base_text),
          _guide("brow", "소프트 브라운", "#795548", "내추럴", preference),
          _guide("eye", "뮤트 모브", eye_hex, "소프트 매트", preference),
          _guide("cheek", "뮤트 로즈", cheek_hex, "은은한 새틴", preference),
          _guide("lip", "뮤트 로즈", lip_hex, "소프트 글로우", preference),
        ],
        "products": [{"matchRate": 99, "name": "ignored"}],
        "imageAlignmentMetadata": {"score": 100},
        "imageCropRegions": {"lip": [{"left": 0.1}]},
      },
    ],
  }


def _context(
  *,
  situation: str = "중요한 발표",
  personal_color: str | None = "여름 뮤트",
  skin_type: str | None = "복합성",
) -> dict:
  analysis = {
    "faceShape": "oval",
    "measurementInsights": {"faceStructure": {"usable": True, "score": 100}},
  }
  if personal_color is not None:
    analysis["personalColor"] = personal_color
  if skin_type is not None:
    analysis["skinType"] = skin_type
  return {
    "selection": {
      "situation": {"label": situation, "tags": ["격식"]},
      "keyword": {"label": "균형 있게"},
    },
    "analysisReport": analysis,
    "image": {"alignment": 100, "crop": "ignored"},
  }


def _answers(**overrides) -> list[dict]:
  answer = {"questionId": "intensity", "optionId": "balanced"}
  answer.update(overrides)
  return [answer]


def _component(assessment: dict, key: str) -> dict:
  return next(item for item in assessment["components"] if item["key"] == key)


def _resolve(root: object, path: str) -> object:
  current = root
  for segment in path.replace("]", "").split("."):
    if "[" in segment:
      key, index = segment.split("[")
      current = current[key][int(index)]
    else:
      current = current[segment]
  return current


def test_same_input_and_result_are_deterministic_and_source_independent() -> None:
  recommendation = _recommendation()
  context = _context()
  answers = _answers()
  first = build_match_assessment(
    recommendation,
    context,
    answers,
    QUESTIONS,
    generation_source="claude",
  )
  second = build_match_assessment(
    deepcopy(recommendation),
    deepcopy(context),
    deepcopy(answers),
    deepcopy(QUESTIONS),
    generation_source="claude",
  )
  fallback = build_match_assessment(
    recommendation,
    context,
    answers,
    QUESTIONS,
    generation_source="deterministic_fallback",
  )

  assert first == second
  assert first["score"] == fallback["score"]
  assert first["components"] == fallback["components"]
  assert first["generationSource"] == "claude"
  assert fallback["generationSource"] == "deterministic_fallback"


def test_canonical_label_wins_and_manual_text_is_preserved_while_ai_pick_is_not_preference() -> None:
  recommendation = _recommendation(preference="세미 매트로 얇게")
  context = _context(personal_color=None, skin_type=None)
  canonical = build_match_assessment(
    recommendation,
    context,
    _answers(label="세미 매트로 얇게", optionLabel="강한 글로우"),
    QUESTIONS,
    generation_source="claude",
  )
  preference = _component(canonical, "preference")
  assert any("세미 매트로 얇게" in item for item in preference["evidence"])
  assert all("강한 글로우" not in item for item in preference["evidence"])

  legacy = build_match_assessment(
    recommendation,
    context,
    _answers(optionId="legacy", optionLabel="세미 매트로 얇게"),
    QUESTIONS,
    generation_source="claude",
  )
  assert _component(legacy, "preference")["evidence"] == [
    "원하는 표현 강도는?: 세미 매트로 얇게",
  ]

  delegated = build_match_assessment(
    recommendation,
    context,
    _answers(
      optionId="ai_pick",
      label="AI가 골라줘",
      freeText="눈매는 부드럽게",
      additionalConstraints="펄은 제외하고 얇게",
    ),
    QUESTIONS,
    generation_source="claude",
  )
  delegated_evidence = _component(delegated, "preference")["evidence"]
  assert delegated_evidence == [
    "추가 요청: 펄은 제외하고 얇게",
    "직접 입력: 눈매는 부드럽게",
  ]


def test_face_geometry_image_and_products_do_not_change_match() -> None:
  recommendation = _recommendation()
  context = _context()
  baseline = build_match_assessment(
    recommendation,
    context,
    _answers(),
    QUESTIONS,
    generation_source="claude",
  )
  changed_recommendation = deepcopy(recommendation)
  changed_recommendation["looks"][0]["products"] = [{"matchRate": 1, "name": "other"}]
  changed_recommendation["looks"][0]["imageAlignmentMetadata"] = {"score": 0}
  changed_recommendation["looks"][0]["imageCropRegions"] = {"brow": [{"left": 0.99}]}
  changed_context = deepcopy(context)
  changed_context["analysisReport"]["faceShape"] = "square"
  changed_context["analysisReport"]["measurementInsights"]["faceStructure"] = {
    "usable": False,
    "score": 0,
    "faceGeometry2d": {"brow": 0.99, "eye": -0.99},
    "face3d": {"depth": 999},
    "insights": {"faceContour": {"label": "완전히 다른 얼굴 구조"}},
  }

  changed = build_match_assessment(
    changed_recommendation,
    changed_context,
    _answers(),
    QUESTIONS,
    generation_source="claude",
  )
  assert baseline["score"] == changed["score"]
  assert baseline["components"] == changed["components"]
  assert baseline["reflectedInputs"] == changed["reflectedInputs"]


def test_opposite_situation_scores_lower() -> None:
  context = _context(situation="중요한 발표")
  matching = build_match_assessment(
    _recommendation(situation="중요한 발표에 맞는 정돈된 메이크업"),
    context,
    _answers(),
    QUESTIONS,
    generation_source="claude",
  )
  opposite = build_match_assessment(
    _recommendation(situation="클럽 파티를 위한 화려하고 과감한 글램 메이크업"),
    context,
    _answers(),
    QUESTIONS,
    generation_source="claude",
  )
  assert _component(matching, "situation")["score"] > _component(opposite, "situation")["score"]


def test_personal_color_palette_and_skin_finish_conflicts_change_components() -> None:
  context = _context(personal_color="여름 뮤트", skin_type="복합성")
  matching = build_match_assessment(
    _recommendation(),
    context,
    _answers(),
    QUESTIONS,
    generation_source="claude",
  )
  clashing = build_match_assessment(
    _recommendation(
      eye_hex="#F47F6B",
      cheek_hex="#F49A42",
      lip_hex="#E85A7A",
      base_text="얼굴 전체에 파우더를 두껍게 올려 모든 광을 제거",
    ),
    context,
    _answers(),
    QUESTIONS,
    generation_source="claude",
  )
  assert _component(matching, "colorHarmony")["score"] > _component(clashing, "colorHarmony")["score"]
  assert _component(matching, "skinFinish")["score"] > _component(clashing, "skinFinish")["score"]


def test_missing_components_reweight_and_below_threshold_has_null_score() -> None:
  recommendation = _recommendation()
  no_analysis = _context(personal_color=None, skin_type=None)
  enough = build_match_assessment(
    recommendation,
    no_analysis,
    _answers(),
    QUESTIONS,
    generation_source="claude",
  )
  assert enough["evaluatedWeight"] == 60
  assert enough["score"] == round(
    (
      _component(enough, "preference")["score"] * 35
      + _component(enough, "situation")["score"] * 25
    ) / 60,
  )

  no_situation = {"selection": {}, "analysisReport": {}}
  too_little = build_match_assessment(
    recommendation,
    no_situation,
    _answers(),
    QUESTIONS,
    generation_source="claude",
  )
  assert too_little["evaluatedWeight"] == 35
  assert too_little["score"] is None


def test_every_reflected_decision_path_exists_and_matches_saved_value() -> None:
  recommendation = _recommendation()
  assessment = build_match_assessment(
    recommendation,
    _context(),
    _answers(additionalConstraints="과한 펄은 제외"),
    QUESTIONS,
    generation_source="claude",
  )
  assert assessment["reflectedInputs"]
  for item in assessment["reflectedInputs"]:
    assert str(_resolve(recommendation, item["decisionPath"])) == item["reflectedValue"]
