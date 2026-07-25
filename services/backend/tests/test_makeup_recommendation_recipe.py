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
from app.services.makeup_recommendation_recipe import (
  allows_unconventional_area_colors,
  enrich_makeup_application_plans,
  harmonize_flush_area_colors,
)
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


@pytest.mark.parametrize(
  ("duration", "expected_minutes"),
  [
    (15, [4, 2, 5, 2, 2]),
    (20, [6, 3, 6, 2, 3]),
    (25, [7, 4, 7, 3, 4]),
    (30, [8, 4, 9, 4, 5]),
    (60, [16, 9, 18, 7, 10]),
  ],
)
def test_recipe_enricher_allocates_exact_integer_total_without_mutation(
  duration: int,
  expected_minutes: list[int],
) -> None:
  source = _recommendation()
  for look in source["looks"]:
    look["durationMinutes"] = duration
  before = deepcopy(source)

  enriched = enrich_makeup_application_plans(source)

  assert source == before
  for look in enriched["looks"]:
    actual_minutes = [
      guide["applicationPlan"]["estimatedMinutes"]
      for guide in look["areaGuides"]
    ]
    assert actual_minutes == expected_minutes
    assert sum(actual_minutes) == duration


def test_recipe_enricher_overrides_existing_minutes_with_selected_budget() -> None:
  source = _recommendation()
  for look in source["looks"]:
    look["durationMinutes"] = 120
    for guide in look["areaGuides"]:
      guide["applicationPlan"]["estimatedMinutes"] = 60
  before = deepcopy(source)

  enriched = enrich_makeup_application_plans(source, max_total_minutes=15)

  assert source == before
  for look_index, look in enumerate(enriched["looks"]):
    assert look["durationMinutes"] == 15
    assert sum(
      guide["applicationPlan"]["estimatedMinutes"]
      for guide in look["areaGuides"]
    ) == 15
    assert [
      guide["applicationPlan"]["steps"]
      for guide in look["areaGuides"]
    ] == [
      guide["applicationPlan"]["steps"]
      for guide in source["looks"][look_index]["areaGuides"]
    ]


def test_schema_rejects_area_time_above_look_duration() -> None:
  invalid = _recommendation()
  invalid["looks"][0]["durationMinutes"] -= 1

  with pytest.raises(ValidationError, match="Area application time"):
    GeneratedMakeupRecommendationV2.model_validate(invalid)


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
  first_step = anchor["areaGuides"][0]["applicationPlan"]["steps"][0]
  first_step["tool"] = "납작 파운데이션 브러시"
  first_step["amount"] = "진주 한 알 크기"
  first_step["blending"] = "얼굴 중앙에서 바깥으로 눌러 블렌딩"

  prompt = image_service._prompt(
    "중요한 발표",
    anchor,
    personalized=True,
  )

  assert len(prompt) <= 7000
  assert all(f"{area}:" in prompt for area in ("base", "brow", "eye", "cheek", "lip"))
  assert all(token in prompt for token in ("베이스", "전이", "깊이", "라인"))
  assert all(token in prompt for token in ("바탕", "안쪽 포인트", "광택"))
  assert all(
    token in prompt
    for token in (
      "납작 파운데이션 브러시",
      "진주 한 알 크기",
      "얼굴 중앙에서 바깥으로 눌러 블렌딩",
    )
  )


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


def test_harmonize_clamps_mint_cheek_and_keeps_flush_and_eye_colors() -> None:
  recommendation = {
    "looks": [
      {
        "areaGuides": [
          {"area": "cheek", "color": {"name": "라이트 민트", "hex": "#B8E6D0"}},
          {"area": "lip", "color": {"name": "뮤티드 로즈", "hex": "#A85D68"}},
          {"area": "eye", "color": {"name": "카키 스모키", "hex": "#6B7A4F"}},
        ],
      },
    ],
  }

  harmonized, adjustments = harmonize_flush_area_colors(recommendation)
  guides = {guide["area"]: guide for guide in harmonized["looks"][0]["areaGuides"]}

  assert [adjustment["area"] for adjustment in adjustments] == ["cheek"]
  assert adjustments[0]["fromHex"] == "#B8E6D0"
  assert guides["cheek"]["color"]["hex"] != "#B8E6D0"
  assert "민트" not in guides["cheek"]["color"]["name"]
  assert guides["lip"]["color"] == {"name": "뮤티드 로즈", "hex": "#A85D68"}
  assert guides["eye"]["color"] == {"name": "카키 스모키", "hex": "#6B7A4F"}
  # 클램프 결과는 혈색 범위 안이어야 한다 — 재적용 시 무보정(멱등).
  again, second_pass = harmonize_flush_area_colors(harmonized)
  assert second_pass == []
  assert again == harmonized


def test_harmonize_allows_low_saturation_neutrals() -> None:
  recommendation = {
    "looks": [
      {"areaGuides": [{"area": "lip", "color": {"name": "그레이지", "hex": "#B8AEB0"}}]},
    ],
  }

  harmonized, adjustments = harmonize_flush_area_colors(recommendation)

  assert adjustments == []
  assert harmonized["looks"][0]["areaGuides"][0]["color"]["hex"] == "#B8AEB0"


def test_harmonize_clamps_plan_step_colors_in_flush_areas() -> None:
  recommendation = {
    "looks": [
      {
        "areaGuides": [
          {
            "area": "lip",
            "color": {"name": "로즈", "hex": "#A85D68"},
            "applicationPlan": {
              "steps": [
                {
                  "colors": [
                    {"role": "메인", "name": "로즈", "hex": "#A85D68"},
                    {"role": "광택", "name": "민트 글로스", "hex": "#7FE0C3"},
                    {"role": "광택", "name": "클리어", "hex": "#FFFFFF"},
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  }

  harmonized, adjustments = harmonize_flush_area_colors(recommendation)
  colors = harmonized["looks"][0]["areaGuides"][0]["applicationPlan"]["steps"][0]["colors"]

  assert [adjustment["fromHex"] for adjustment in adjustments] == ["#7FE0C3"]
  assert colors[0]["hex"] == "#A85D68"
  assert colors[1]["hex"] != "#7FE0C3"
  assert "민트" not in colors[1]["name"]
  assert colors[1]["role"] == "광택"
  assert colors[2]["hex"] == "#FFFFFF"


def test_unconventional_concept_context_bypasses_flush_clamp() -> None:
  assert allows_unconventional_area_colors(
    {"selection": {"keyword": {"label": "페스티벌 헤드라이너"}}},
  )
  assert allows_unconventional_area_colors(
    {"selection": {}},
    [{"label": "무대 위에서 돋보이게"}],
  )
  # 사용자가 비혈색 색을 직접 지목하면 요청이 안전망보다 우선한다.
  assert allows_unconventional_area_colors(
    {"selection": {"customSituationText": "옐로우 메이크업 해보고 싶어"}},
  )
  assert not allows_unconventional_area_colors(
    {"selection": {"situation": {"label": "소개팅"}, "customSituationText": "첫 데이트"}},
    [{"label": "자연스럽게"}],
  )
