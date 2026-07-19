import json
from copy import deepcopy
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.core.settings import Settings
from app.schemas.makeup_recommendation import GeneratedMakeupRecommendationV2
from app.services import makeup_recommendation as recommendation_service
from app.services import makeup_recommendation_image as image_service
from app.services import makeup_recommendation_products as product_service
from app.services.makeup_recommendation_prompt import adapt_v1_recommendation
from app.services.makeup_recommendation_recipe import enrich_makeup_application_plans
from app.services.makeup_recommendation_session import complete_generation


USER_ID = UUID("11111111-1111-1111-1111-111111111111")
SESSION_ID = UUID("55555555-5555-5555-5555-555555555555")
ANALYSIS_REPORT_ID = UUID("22222222-2222-2222-2222-222222222222")
REPORT_ID = UUID("66666666-6666-6666-6666-666666666666")
AREA_MIN_STEPS = {"base": 4, "brow": 3, "eye": 5, "cheek": 3, "lip": 3}
STEP_FIELDS = {
  "title",
  "productType",
  "tool",
  "colors",
  "amount",
  "placement",
  "technique",
  "blending",
  "finishCheck",
}


def _recommendation() -> dict:
  return recommendation_service.deterministic_recommendation_v2(
    {
      "analysisReport": {"personalColor": "summer mute"},
      "selection": {"situation": {"label": "중요한 발표"}},
    },
    [],
  )


def _distinct_colors(guide: dict) -> set[tuple[str, str]]:
  return {
    (color["name"], color["hex"])
    for step in guide["applicationPlan"]["steps"]
    for color in step["colors"]
  }


def test_deterministic_recipe_has_shop_order_and_area_specific_detail() -> None:
  result = _recommendation()

  for look in result["looks"]:
    assert [guide["area"] for guide in look["areaGuides"]] == [
      "base", "brow", "eye", "cheek", "lip",
    ]
    assert [guide["applicationOrder"] for guide in look["areaGuides"]] == [1, 2, 3, 4, 5]
    for guide in look["areaGuides"]:
      plan = guide["applicationPlan"]
      assert plan["recipeVersion"] == "makeup-application-v1"
      assert len(plan["steps"]) >= AREA_MIN_STEPS[guide["area"]]
      assert [step["order"] for step in plan["steps"]] == list(range(1, len(plan["steps"]) + 1))
      assert all(STEP_FIELDS.issubset(step) for step in plan["steps"])
      assert all(
        all(step[field] for field in STEP_FIELDS - {"colors"}) and step["colors"]
        for step in plan["steps"]
      )
      assert all(
        color["role"] and color["name"] and color["hex"].startswith("#")
        for step in plan["steps"]
        for color in step["colors"]
      )

  anchor_by_area = {guide["area"]: guide for guide in result["looks"][0]["areaGuides"]}
  base_copy = json.dumps(anchor_by_area["base"]["applicationPlan"], ensure_ascii=False)
  eye_copy = json.dumps(anchor_by_area["eye"]["applicationPlan"], ensure_ascii=False)
  lip_copy = json.dumps(anchor_by_area["lip"]["applicationPlan"], ensure_ascii=False)
  assert "파우더" in base_copy and "광대 윗면" in base_copy and "올리지" in base_copy
  assert len(_distinct_colors(anchor_by_area["eye"])) >= 3
  assert all(token in eye_copy for token in ("베이스", "전이", "음영", "아이라이너", "포인트"))
  assert len(_distinct_colors(anchor_by_area["lip"])) >= 2
  assert all(token in lip_copy for token in ("바탕", "안쪽", "그라데이션", "글로스"))


def test_recipe_enricher_replaces_unsupported_or_noncontiguous_plan_without_mutation() -> None:
  source = _recommendation()
  eye = next(guide for guide in source["looks"][0]["areaGuides"] if guide["area"] == "eye")
  eye["applicationPlan"]["recipeVersion"] = "unsupported-v9"
  eye["applicationPlan"]["steps"][1]["order"] = 1
  before = deepcopy(source)

  enriched = enrich_makeup_application_plans(source)

  assert source == before
  replaced_eye = next(
    guide for guide in enriched["looks"][0]["areaGuides"] if guide["area"] == "eye"
  )
  plan = replaced_eye["applicationPlan"]
  assert plan["recipeVersion"] == "makeup-application-v1"
  assert [step["order"] for step in plan["steps"]] == list(range(1, len(plan["steps"]) + 1))
  assert len(_distinct_colors(replaced_eye)) >= 3


def test_recipe_enricher_canonicalizes_snake_case_provider_looks_without_mutation() -> None:
  source = _recommendation()
  for look in source["looks"]:
    guides = look.pop("areaGuides")
    look["area_guides"] = guides
    look["duration_minutes"] = look.pop("durationMinutes")
    for guide in guides:
      guide.pop("applicationOrder")
      guide.pop("applicationPlan")
  before = deepcopy(source)

  enriched = enrich_makeup_application_plans(source)

  assert source == before
  for look in enriched["looks"]:
    assert "area_guides" not in look
    assert [guide["area"] for guide in look["areaGuides"]] == [
      "base", "brow", "eye", "cheek", "lip",
    ]
    assert [guide["applicationOrder"] for guide in look["areaGuides"]] == [1, 2, 3, 4, 5]
    assert all(
      guide["applicationPlan"]["recipeVersion"] == "makeup-application-v1"
      for guide in look["areaGuides"]
    )

  canonical = GeneratedMakeupRecommendationV2.model_validate(enriched).model_dump(by_alias=True)
  assert all(
    guide["applicationPlan"] is not None
    for look in canonical["looks"]
    for guide in look["areaGuides"]
  )


def test_recipe_enricher_replaces_duplicate_completion_criteria() -> None:
  source = _recommendation()
  lip = next(guide for guide in source["looks"][0]["areaGuides"] if guide["area"] == "lip")
  repeated = lip["applicationPlan"]["completionCriteria"][0]
  lip["applicationPlan"]["completionCriteria"] = [repeated, f" {repeated} "]

  enriched = enrich_makeup_application_plans(source)

  enriched_lip = next(
    guide for guide in enriched["looks"][0]["areaGuides"] if guide["area"] == "lip"
  )
  criteria = enriched_lip["applicationPlan"]["completionCriteria"]
  assert len({item.strip().casefold() for item in criteria}) == len(criteria)


def test_schema_rejects_noncontiguous_detailed_step_order() -> None:
  invalid = _recommendation()
  invalid["looks"][0]["areaGuides"][0]["applicationPlan"]["steps"][1]["order"] = 1

  with pytest.raises(ValidationError, match="contiguous order"):
    GeneratedMakeupRecommendationV2.model_validate(invalid)


@pytest.mark.parametrize("invalid_kind", ["duplicate_completion", "blank_step", "same_eye_hex"])
def test_schema_rejects_incomplete_application_detail(invalid_kind: str) -> None:
  invalid = _recommendation()
  eye = next(guide for guide in invalid["looks"][0]["areaGuides"] if guide["area"] == "eye")
  if invalid_kind == "duplicate_completion":
    criterion = eye["applicationPlan"]["completionCriteria"][0]
    eye["applicationPlan"]["completionCriteria"] = [criterion, f"  {criterion}  "]
  elif invalid_kind == "blank_step":
    eye["applicationPlan"]["steps"][0]["tool"] = "   "
  else:
    for step in eye["applicationPlan"]["steps"]:
      for color in step["colors"]:
        color["hex"] = "#777777"

  with pytest.raises(ValidationError):
    GeneratedMakeupRecommendationV2.model_validate(invalid)


def test_saved_v2_adapter_does_not_invent_recipe_for_an_older_image() -> None:
  saved = _recommendation()
  for look in saved["looks"]:
    for guide in look["areaGuides"]:
      guide.pop("applicationOrder")
      guide.pop("applicationPlan")
  before = deepcopy(saved)

  projected = adapt_v1_recommendation(saved)

  assert saved == before
  assert all(
    "applicationPlan" not in guide and "applicationOrder" not in guide
    for look in projected["looks"]
    for guide in look["areaGuides"]
  )


def test_image_prompt_keeps_all_area_layers_and_multicolor_tokens() -> None:
  anchor = _recommendation()["looks"][0]

  prompt = image_service._prompt(
    "중요한 발표",
    anchor,
    personalized=True,
  )

  assert len(prompt) <= 7000
  assert all(f"{area}:" in prompt for area in ("base", "brow", "eye", "cheek", "lip"))
  assert all(token in prompt for token in ("베이스", "전이", "깊이", "라인"))
  assert all(token in prompt for token in ("바탕", "안쪽 포인트", "광택"))


def test_replace_products_refinement_preserves_application_recipe() -> None:
  previous = _recommendation()
  generated = deepcopy(previous)
  expected_plans = [
    deepcopy(guide["applicationPlan"])
    for look in previous["looks"]
    for guide in look["areaGuides"]
  ]
  for look in generated["looks"]:
    for guide in look["areaGuides"]:
      guide["products"] = [{"area": guide["area"], "productName": "replacement"}]

  refined = recommendation_service.apply_refinement_contract(
    previous,
    generated,
    "replaceProducts",
  )

  assert [
    guide["applicationPlan"]
    for look in refined["looks"]
    for guide in look["areaGuides"]
  ] == expected_plans


@pytest.mark.asyncio
async def test_product_matching_uses_application_layers_and_preserves_recipe(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: list[dict] = []

  async def fake_build(_db, _settings, category, **kwargs):
    calls.append({"category": category, **kwargs})
    return ({"products": []}, "database")

  monkeypatch.setattr(product_service, "build_product_recommendation_data", fake_build)
  recommendation = _recommendation()
  original_plans = [
    deepcopy(guide["applicationPlan"])
    for look in recommendation["looks"]
    for guide in look["areaGuides"]
  ]

  enriched = await product_service.enrich_makeup_recommendation_products(
    object(), Settings(), recommendation, {}, [],
  )

  shadow_call = next(call for call in calls if call["category"] == "shadow")
  query = shadow_call["query_override"]
  profile = shadow_call["profile_override"]
  assert all(token in query for token in ("아이섀도", "아이라이너", "레이어색", "범위", "기법"))
  assert len(profile["makeupGuideline"]["applicationPlan"]["colors"]) >= 3
  assert "눈꼬리" in profile["makeupGuideline"]["professionalPoint"]
  assert [
    guide["applicationPlan"]
    for look in enriched["looks"]
    for guide in look["areaGuides"]
  ] == original_plans


@pytest.mark.asyncio
async def test_complete_generation_persists_application_plan_json() -> None:
  recommendation = _recommendation()
  captured: dict = {}

  class DB:
    async def fetchrow(self, query: str, *args):
      assert "insert into makeup_recommendation_reports" in query
      captured["recommendation"] = json.loads(args[5])
      return {
        "id": REPORT_ID,
        "recommendation": captured["recommendation"],
        "image_status": "pending",
      }

  session = {
    "id": SESSION_ID,
    "analysis_report_id": ANALYSIS_REPORT_ID,
    "situation_id": None,
    "keyword_id": None,
    "context_snapshot": {"selection": {"customSituationText": "중요한 발표"}},
    "questions": [],
    "answers": [],
    "image_mode": "generic",
  }

  result = await complete_generation(DB(), Settings(), USER_ID, session, recommendation)

  saved_guide = captured["recommendation"]["looks"][0]["areaGuides"][0]
  assert saved_guide["applicationOrder"] == 1
  assert saved_guide["applicationPlan"]["recipeVersion"] == "makeup-application-v1"
  assert result["recommendation"]["looks"][0]["areaGuides"][0]["applicationPlan"] == saved_guide["applicationPlan"]
