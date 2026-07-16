from __future__ import annotations

import random

import pytest

from app.services.auradin_agent.intent_parser import parse_intent
from app.services.auradin_agent.question_engine import analyze_attributes, build_question, propose_question
from app.services.auradin_agent.ranking import price_delta_matches, price_filter_label
from app.services.auradin_agent.retrieval_service import (
  FilterDeltaContractViolation,
  split_answer_deltas,
  validate_filter_delta,
  validate_hard_filters,
)


def _item(
  item_id: str,
  *,
  category: str = "lip",
  price_tier: str = "under_15k",
  finish: str | None = None,
  color: str | None = None,
) -> dict:
  attributes = {}
  if finish is not None:
    attributes["finish"] = finish
  if color is not None:
    attributes["colorFamily"] = color
  return {
    "id": item_id,
    "category": category,
    "attributes": attributes,
    "attributeConfidence": {"finish": 0.9, "colorFamily": 0.9},
    "hardFilterEligible": {"finish": True, "colorFamily": False},
    "liveOffer": {"priceTier": price_tier},
    "retailPresence": {},
  }


def _ranked(items: list[dict]) -> list[dict]:
  return [
    {"item": item, "score": round(0.8 - index * 0.001, 6)}
    for index, item in enumerate(items)
  ]


@pytest.mark.parametrize(
  ("prompt", "category", "avoid", "unsupported"),
  [
    ("립 말고 다른 제품", None, ["lip"], None),
    ("립이나 블러셔", None, [], None),
    ("립 말고 향수", None, ["lip"], "perfume"),
    ("립 말고 블러셔도 싫어", None, ["lip", "cheek"], None),
    ("립 말고는 다 싫어", "lip", [], None),
    ("립 말고는 다 괜찮아", None, ["lip"], None),
  ],
)
def test_category_negation_contract(
  prompt: str,
  category: str | None,
  avoid: list[str],
  unsupported: str | None,
) -> None:
  intent = parse_intent(prompt)

  assert intent["category"] == category
  assert intent["avoidCategories"] == avoid
  assert intent["unsupportedCategory"] == unsupported
  if category is None:
    assert not any(delta.get("attribute") == "category" for delta in intent["lockedFilters"])
  assert intent["positiveResidual"] not in {"아", "어"}


@pytest.mark.parametrize(
  ("prompt", "op", "amount"),
  [
    ("2만원 이하", "lte", 20_000),
    ("2만원보다 싸게", "lt", 20_000),
    ("2만원 이상", "gte", 20_000),
    ("2만원 넘는", "gt", 20_000),
    ("2만원 이상은 부담돼", "lt", 20_000),
    ("2만원 넘는 건 싫어", "lte", 20_000),
    ("2만원 이하 말고", "gt", 20_000),
    ("2만원 미만은 싫어", "gte", 20_000),
    ("1만5천원 이하", "lte", 15_000),
  ],
)
def test_korean_price_direction_and_complement(prompt: str, op: str, amount: int) -> None:
  price_filters = [
    delta for delta in parse_intent(prompt)["lockedFilters"] if delta.get("attribute") == "priceKrw"
  ]

  assert len(price_filters) == 1
  assert price_filters[0]["op"] == op
  assert price_filters[0]["numberValue"] == amount


@pytest.mark.parametrize(
  ("prompt", "lower", "upper", "upper_inclusive"),
  [
    ("1만원대", 10_000, 20_000, False),
    ("1~2만원", 10_000, 20_000, True),
    ("1만원부터 2만원까지", 10_000, 20_000, True),
    ("1만원에서 2만원", 10_000, 20_000, True),
  ],
)
def test_korean_price_range(
  prompt: str,
  lower: int,
  upper: int,
  upper_inclusive: bool,
) -> None:
  delta = next(
    delta for delta in parse_intent(prompt)["lockedFilters"] if delta.get("attribute") == "priceKrw"
  )

  assert delta["op"] == "between"
  assert delta["priceRange"] == {
    "lowerKrw": lower,
    "upperKrw": upper,
    "lowerInclusive": True,
    "upperInclusive": upper_inclusive,
  }


def test_directionless_and_price_or_do_not_create_hard_filter() -> None:
  for prompt in ("3만원", "3만원쯤"):
    intent = parse_intent(prompt)
    assert not any(delta.get("attribute") == "priceKrw" for delta in intent["lockedFilters"])

  for prompt in (
    "2만원 이하나 3만원 이상",
    "2만원 이하도 괜찮고 3만원 이상도 괜찮아",
    "2만원 이하, 아니면 3만원 이상",
    "2만원 이하 혹은 3만원 이상",
  ):
    intent = parse_intent(prompt)
    assert intent["priceOrDetected"] is True
    assert not any(delta.get("attribute") == "priceKrw" for delta in intent["lockedFilters"])
    assert intent["requiresQuestion"] is True


def test_category_or_does_not_erase_single_price_hard_filter() -> None:
  intent = parse_intent("립 또는 블러셔 중 2만원 이하")
  price_filters = [
    delta for delta in intent["lockedFilters"] if delta.get("attribute") == "priceKrw"
  ]

  assert intent["category"] is None
  assert intent["priceOrDetected"] is False
  assert [(delta["op"], delta["numberValue"]) for delta in price_filters] == [("lte", 20_000)]


@pytest.mark.parametrize(
  "prompt",
  [
    "2만원 이상은 부담돼",
    "2만원 이하, 아니면 3만원 이상",
  ],
)
def test_price_grammar_is_fully_removed_from_canonical_residual(prompt: str) -> None:
  assert parse_intent(prompt)["positiveResidual"] == ""


@pytest.mark.parametrize(
  ("prompt", "category"),
  [
    ("글리터 강한 아이섀도우 말고 은은한 쉬머", "shadow"),
    ("진하지 않은 글로시 핑크 립", "lip"),
  ],
)
def test_inflected_attribute_phrase_does_not_leave_orphan_suffix_in_residual(
  prompt: str,
  category: str,
) -> None:
  intent = parse_intent(prompt)

  assert intent["category"] == category
  assert intent["positiveResidual"] == ""


def test_price_range_label_distinguishes_open_lower_and_inclusive_upper() -> None:
  assert price_filter_label(
    {
      "attribute": "priceKrw",
      "op": "between",
      "priceRange": {
        "lowerKrw": 10_000,
        "upperKrw": 20_000,
        "lowerInclusive": False,
        "upperInclusive": True,
      },
    },
  ) == "10,000원 초과~20,000원"


def test_filter_delta_rejects_mutually_exclusive_fields_and_soft_is_validated() -> None:
  validate_filter_delta({"attribute": "finish", "op": "eq", "values": ["matte"], "mode": "soft"})
  validate_filter_delta(
    {
      "attribute": "priceKrw",
      "op": "between",
      "priceRange": {
        "lowerKrw": 10_000,
        "upperKrw": 20_000,
        "lowerInclusive": True,
        "upperInclusive": False,
      },
    },
  )

  invalid = [
    {"attribute": "priceKrw", "op": "gte", "numberValue": 30_000, "values": ["junk"]},
    {"attribute": "finish", "op": "eq", "values": ["matte"], "numberValue": 1},
    {
      "attribute": "priceKrw",
      "op": "between",
      "priceRange": {
        "lowerKrw": 10_000,
        "upperKrw": 20_000,
        "lowerInclusive": True,
        "upperInclusive": True,
      },
      "values": ["junk"],
    },
    {"attribute": "priceKrw", "op": "lte", "numberValue": True},
    {"attribute": "finish", "op": "eq", "values": [], "mode": "soft"},
  ]
  for delta in invalid:
    with pytest.raises(FilterDeltaContractViolation):
      validate_filter_delta(delta)

  with pytest.raises(FilterDeltaContractViolation):
    split_answer_deltas([{"filterDelta": invalid[-1]}])


def test_merged_price_filters_reject_empty_intersection() -> None:
  validate_hard_filters(
    [
      {"attribute": "priceKrw", "op": "gte", "numberValue": 20_000},
      {"attribute": "priceKrw", "op": "lte", "numberValue": 20_000},
    ],
  )

  with pytest.raises(FilterDeltaContractViolation, match="empty range"):
    validate_hard_filters(
      [
        {"attribute": "priceKrw", "op": "gte", "numberValue": 30_000},
        {"attribute": "priceKrw", "op": "lte", "numberValue": 20_000},
      ],
    )
  with pytest.raises(FilterDeltaContractViolation, match="empty range"):
    validate_hard_filters(
      [
        {"attribute": "priceKrw", "op": "gt", "numberValue": 20_000},
        {"attribute": "priceKrw", "op": "lte", "numberValue": 20_000},
      ],
    )


def test_price_filter_property_suite_10_000_cases() -> None:
  rng = random.Random(20_260_715)
  category_axes = (
    ("", None, []),
    ("립 ", "lip", []),
    ("립 말고 블러셔 ", "cheek", ["lip"]),
    ("립이나 블러셔 ", None, []),
  )
  direct_surfaces = {
    "lt": lambda value: f"{value}원 미만",
    "lte": lambda value: f"{value}원 이하",
    "gt": lambda value: f"{value}원 초과",
    "gte": lambda value: f"{value}원 이상",
  }
  complement_surfaces = {
    "lt": lambda value: f"{value}원 이상은 부담돼",
    "lte": lambda value: f"{value}원 넘는 건 싫어",
    "gt": lambda value: f"{value}원 이하 말고",
    "gte": lambda value: f"{value}원 미만은 싫어",
  }

  for case in range(10_000):
    boundary = rng.randint(1, 500) * 1_000
    price = max(1, boundary + rng.randint(-2, 2) * 1_000)
    op = rng.choice(("lt", "lte", "gt", "gte", "between"))
    if op == "between":
      width = rng.randint(1, 20) * 1_000
      lower = max(1, boundary - width)
      upper = boundary + width
      lower_inclusive = bool(rng.getrandbits(1))
      upper_inclusive = bool(rng.getrandbits(1))
      delta = {
        "attribute": "priceKrw",
        "op": "between",
        "priceRange": {
          "lowerKrw": lower,
          "upperKrw": upper,
          "lowerInclusive": lower_inclusive,
          "upperInclusive": upper_inclusive,
        },
      }
      expected = (price >= lower if lower_inclusive else price > lower) and (
        price <= upper if upper_inclusive else price < upper
      )
    else:
      delta = {"attribute": "priceKrw", "op": op, "numberValue": boundary}
      expected = {
        "lt": price < boundary,
        "lte": price <= boundary,
        "gt": price > boundary,
        "gte": price >= boundary,
      }[op]
    validate_filter_delta(delta)
    assert price_delta_matches(delta, price) is expected

    # 같은 10,000건에 가격 방향/보수 부정과 카테고리 직접/치환/복수 축을
    # 교차시켜, 파서가 잘못된 hard를 생성하지 않는지도 동시에 검증한다.
    category_prefix, expected_category, expected_avoid = category_axes[case % len(category_axes)]
    if op == "between":
      # 상품 가격 문법은 천 원 단위를 최소로 본다. evaluator의
      # 1원 하한 edge는 위에서 별도 검증하고, parser 표면에서는 1,000원으로 정규화한다.
      parsed_lower = max(1_000, lower)
      price_surface = f"{parsed_lower}원~{upper}원"
      expected_parsed = {
        "op": "between",
        "priceRange": {
          "lowerKrw": parsed_lower,
          "upperKrw": upper,
          "lowerInclusive": True,
          "upperInclusive": True,
        },
      }
    else:
      surface_map = complement_surfaces if case % 2 else direct_surfaces
      price_surface = surface_map[op](boundary)
      expected_parsed = {"op": op, "numberValue": boundary}

    intent = parse_intent(category_prefix + price_surface)
    parsed_prices = [
      parsed for parsed in intent["lockedFilters"] if parsed.get("attribute") == "priceKrw"
    ]
    assert len(parsed_prices) == 1
    assert parsed_prices[0]["op"] == expected_parsed["op"]
    if op == "between":
      assert parsed_prices[0]["priceRange"] == expected_parsed["priceRange"]
    else:
      assert parsed_prices[0]["numberValue"] == expected_parsed["numberValue"]
    assert intent["category"] == expected_category
    assert intent["avoidCategories"] == expected_avoid


def test_broad_category_question_has_six_labels_and_removes_avoided_category() -> None:
  # top-window에 없는 카테고리도 broad 질문의 정본 6종 option에는 남는다.
  # expectedCandidateCount=0은 countBasis가 추정 창임을 정직하게 드러낸다.
  categories = ("lip", "cheek")
  items = [
    _item(f"{category}-{index}", category=category, price_tier=("under_15k", "15k_25k")[index % 2])
    for category in categories
    for index in range(2)
  ]
  intent = {
    "broad": True,
    "requiresQuestion": True,
    "lockedFilters": [],
    "softPreferences": [],
    "avoidCategories": ["lip"],
  }

  question, _log = propose_question(
    _ranked(items),
    asked_attributes=[],
    intent=intent,
    question_count=0,
    last_answer_was_noop=False,
  )

  assert question is not None
  assert question["attribute"] == "category"
  option_values = [
    option["filterDelta"].get("values", [None])[0]
    for option in question["options"]
    if option["filterDelta"]["op"] != "noop"
  ]
  assert option_values == ["cheek", "shadow", "base", "brow", "liner"]
  assert question["countBasis"] == {"kind": "top_window", "estimated": True, "windowSize": 40}


def test_price_or_forces_all_four_price_options_despite_small_decisive_set() -> None:
  tiers = ("under_15k", "15k_25k", "25k_40k", "over_40k")
  items = [
    _item(f"item-{index}", category=("lip", "cheek")[index % 2], price_tier=tiers[index % 4])
    for index in range(4)
  ]
  intent = parse_intent("2만원 이하나 3만원 이상")
  ranked = _ranked(items)
  ranked[0]["score"] = 0.99
  ranked[1]["score"] = 0.10

  question, log = propose_question(
    ranked,
    asked_attributes=[],
    intent=intent,
    question_count=0,
    last_answer_was_noop=False,
    score_gap_threshold=0.0,
  )

  assert question is not None
  assert question["attribute"] == "priceTier"
  assert [
    option["filterDelta"]["values"][0]
    for option in question["options"]
    if option["filterDelta"]["op"] != "noop"
  ] == ["under_15k", "15k_25k", "25k_40k", "over_40k"]
  assert log["clarificationReason"] == "unsupported_price_disjunction"
  assert "earlyTermination" not in log


def test_prompt_soft_attribute_is_not_asked_again_but_report_does_not_veto() -> None:
  items = [
    _item(
      f"item-{index}",
      category=("lip", "cheek")[index % 2],
      finish=("matte", "glossy")[index % 2],
    )
    for index in range(10)
  ]

  prompt_analyses = analyze_attributes(
    _ranked(items),
    asked_attributes=[],
    intent={
      "lockedFilters": [],
      "softPreferences": [{"attribute": "finish", "source": "prompt", "values": ["matte"]}],
    },
  )
  report_analyses = analyze_attributes(
    _ranked(items),
    asked_attributes=[],
    intent={
      "lockedFilters": [],
      "softPreferences": [{"attribute": "finish", "source": "report", "values": ["matte"]}],
    },
  )

  prompt_finish = next(row for row in prompt_analyses if row["attribute"] == "finish")
  report_finish = next(row for row in report_analyses if row["attribute"] == "finish")
  assert prompt_finish["excludedReason"] == "locked_by_prompt"
  assert report_finish["excludedReason"] is None


def test_soft_question_expected_count_is_actual_value_match() -> None:
  items = [
    _item("pink-1", color="pink"),
    _item("pink-2", color="pink"),
    _item("rose-1", color="rose"),
  ]
  question = build_question(
    _ranked(items),
    {
      "attribute": "colorFamily",
      "questionMode": "soft",
      "confidence": 0.9,
      "valueDistribution": {"pink": 2, "rose": 1},
    },
    question_count=0,
  )

  assert question is not None
  counts = {
    option["filterDelta"].get("values", ["noop"])[0]: option["expectedCandidateCount"]
    for option in question["options"]
  }
  assert counts["pink"] == 2
  assert counts["rose"] == 1


def test_question_builder_falls_back_to_next_viable_attribute() -> None:
  items = [
    _item(
      f"item-{index}",
      category=("lip", "cheek")[index % 2],
      finish=("custom_a", "custom_b")[index % 2],
    )
    for index in range(10)
  ]
  intent = {
    "broad": False,
    "requiresQuestion": True,
    "lockedFilters": [],
    "softPreferences": [],
  }

  question, log = propose_question(
    _ranked(items),
    asked_attributes=[],
    intent=intent,
    question_count=0,
    last_answer_was_noop=False,
  )

  assert question is not None
  assert question["attribute"] == "category"
  assert log["questionBuildFailures"][0] == {
    "attribute": "finish",
    "reason": "insufficient_options",
  }
