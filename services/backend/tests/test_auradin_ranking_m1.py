"""M1 Stage 3+4 — A4, F11, F18, and R2a ranking contracts."""

from __future__ import annotations

import pytest

from app.services.auradin_agent.attribute_evaluator import (
  evaluate_attribute,
  hard_question_keeps,
  soft_expected_matches,
)
from app.services.auradin_agent.preference_policy import resolve_preferences
from app.services.auradin_agent.ranking import (
  CAP_PROMPT,
  CAP_REPORT,
  W_PREFERENCE,
  build_slice_result,
  clamp01,
  compute_score_components,
  conditional_mmr_picks,
  evaluate_explicit_preference_match,
  guard_conflicting_candidates,
  passes_floor,
  preference_deltas,
  rank_candidates,
  top_score_gap,
)


def _item(
  item_id: str,
  *,
  brand: str = "브랜드",
  product: str | None = None,
  category: str = "lip",
  attributes: dict | None = None,
  confidence: dict | None = None,
  eligible: dict | None = None,
  evidence: list[str] | None = None,
) -> dict:
  return {
    "id": item_id,
    "brandName": brand,
    "productName": product or f"제품 {item_id}",
    "category": category,
    "attributes": attributes or {},
    "attributeConfidence": confidence or {},
    "hardFilterEligible": eligible or {},
    "evidenceSourceTypes": evidence or [],
    "liveOffer": {
      "priceKrw": 15000,
      "imageUrl": f"https://example.com/{item_id}.jpg",
      "purchaseUrl": f"https://example.com/{item_id}",
    },
  }


def _pref(
  attribute: str,
  value: str,
  *,
  source: str = "prompt",
  confidence: float | None = 1.0,
  weight: float = 1.0,
  avoid: bool = False,
) -> dict:
  result = {
    "attribute": attribute,
    "source": source,
    "confidence": confidence,
    "weight": weight,
  }
  result["avoidValues" if avoid else "values"] = [value]
  return result


def test_resolution_suppresses_report_dedupes_and_invalidates_same_value_conflict() -> None:
  preferences = [
    _pref("undertone", "warm", source="report"),
    _pref("undertone", "cool", source="prompt"),
    _pref("undertone", "cool", source="question", weight=0.7),
    _pref("finish", "glossy", source="prompt"),
    _pref("finish", "glossy", source="refine", avoid=True),
  ]
  resolved = resolve_preferences(preferences)

  assert resolved["resolvedPreferences"] == [
    {
      "preferenceId": resolved["resolvedPreferences"][0]["preferenceId"],
      "attribute": "undertone",
      "source": "question",
      "weight": 0.7,
      "confidence": 1.0,
      "groupId": resolved["resolvedPreferences"][0]["groupId"],
      "values": ["cool"],
    },
  ]
  # Resolution identity is independent of raw input order.
  assert resolve_preferences(list(reversed(preferences)))["resolutionId"] == resolved["resolutionId"]


def test_missing_source_does_not_gain_explicit_authority() -> None:
  preference = _pref("finish", "matte")
  preference.pop("source")
  resolution = resolve_preferences([preference])
  item = _item("unknown-source", attributes={"finish": "matte"}, confidence={"finish": 1.0})

  assert resolution["resolvedPreferences"][0]["source"] == "unknown"
  assert preference_deltas(item, resolution)["promptPreferenceDelta"] == 0.0
  assert evaluate_explicit_preference_match(item, resolution)["matchedExplicitPref"] is False


def test_r2a_caps_prompt_and_report_in_final_score_units() -> None:
  item = _item(
    "caps",
    attributes={"finish": "matte", "undertone": "warm"},
    confidence={"finish": 1.0, "undertone": 1.0},
  )
  resolved = resolve_preferences(
    [
      _pref("finish", "matte", weight=10.0),
      _pref("undertone", "warm", source="report", weight=10.0),
    ],
  )
  deltas = preference_deltas(item, resolved)

  assert deltas["promptPreferenceDelta"] == CAP_PROMPT
  assert deltas["reportPreferenceDelta"] == CAP_REPORT


def test_r2a_reference_examples_report_clip_and_avoid_penalty() -> None:
  report_item = _item(
    "report-example",
    attributes={"undertone": "warm"},
    confidence={"undertone": 0.62},
  )
  report_delta = preference_deltas(
    report_item,
    resolve_preferences(
      [_pref("undertone", "warm", source="report", weight=0.5, confidence=0.55)],
    ),
  )
  avoid_item = _item(
    "avoid-example",
    attributes={"finish": "glitter"},
    confidence={"finish": 0.7},
  )
  avoid_delta = preference_deltas(
    avoid_item,
    resolve_preferences(
      [_pref("finish", "glitter", weight=0.8, confidence=0.65, avoid=True)],
    ),
  )

  assert report_delta["rawReportPreference"] == pytest.approx(0.5 * 0.55 * 0.62)
  assert report_delta["reportPreferenceDelta"] == CAP_REPORT
  assert avoid_delta["promptPreferenceDelta"] == pytest.approx(-0.8 * 0.65 * 0.7 * W_PREFERENCE)
  assert avoid_delta["promptPreferenceDelta"] < -0.08  # minimum-effect canary


def test_r2a_prompt_overrides_conflicting_report_on_same_attribute() -> None:
  item = _item(
    "cool",
    attributes={"undertone": "cool"},
    confidence={"undertone": 0.62},
  )
  resolution = resolve_preferences(
    [
      _pref("undertone", "cool", weight=0.6, confidence=0.7),
      _pref("undertone", "warm", source="report", weight=0.5, confidence=0.55),
    ],
  )
  deltas = preference_deltas(item, resolution)

  assert deltas["promptPreferenceDelta"] == pytest.approx(0.6 * 0.7 * 0.62 * W_PREFERENCE)
  assert deltas["reportPreferenceDelta"] == 0.0
  assert all(pref["source"] != "report" for pref in resolution["resolvedPreferences"])


def test_explicit_zero_confidence_is_not_replaced_by_default() -> None:
  item = _item("zero", attributes={"finish": "matte"}, confidence={"finish": 1.0})
  explicit_zero = preference_deltas(item, resolve_preferences([_pref("finish", "matte", confidence=0.0)]))
  missing = preference_deltas(item, resolve_preferences([_pref("finish", "matte", confidence=None)]))
  item_zero = preference_deltas(
    _item("item-zero", attributes={"finish": "matte"}, confidence={"finish": 0.0}),
    resolve_preferences([_pref("finish", "matte")]),
  )

  assert explicit_zero["promptPreferenceDelta"] == 0.0
  assert item_zero["promptPreferenceDelta"] == 0.0
  assert missing["promptPreferenceDelta"] == pytest.approx(0.5 * W_PREFERENCE)


def test_unrounded_score_formula_and_final_clamp_are_single_source_of_truth() -> None:
  computed = compute_score_components(
    rule_score=1.0,
    semantic_score=1.0,
    evidence_score=1.0,
    live_offer_score=1.0,
    prompt_preference_delta=CAP_PROMPT,
    report_preference_delta=CAP_REPORT,
  )
  expected_before = 0.40 + 0.08 + 0.11 + CAP_PROMPT + CAP_REPORT + 0.20 + 0.10
  assert computed["scoreBeforeClamp"] == expected_before
  assert computed["scoreBeforeClamp"] == pytest.approx(1.02)
  assert computed["score"] == 1.0
  assert computed["answerScore"] == 1.0

  minimum = compute_score_components(
    rule_score=0.0,
    semantic_score=0.0,
    evidence_score=0.0,
    live_offer_score=0.0,
    prompt_preference_delta=-CAP_PROMPT,
    report_preference_delta=-CAP_REPORT,
  )
  assert minimum["scoreBeforeClamp"] == pytest.approx(-0.02)
  assert minimum["score"] == 0.0
  assert minimum["answerScore"] == 0.0


def test_ranked_components_preserve_resolution_id_provenance_and_derived_answer_score() -> None:
  item = _item("row", attributes={"finish": "matte"}, confidence={"finish": 1.0})
  row = rank_candidates(
    [item],
    hard_filters=[],
    soft_preferences=[_pref("finish", "matte", weight=0.5)],
    semantic_scores={item["id"]: 0.3},
  )[0]
  components = row["components"]

  assert components["matchedExplicitPref"] is True
  assert components["preferenceResolutionId"]
  assert components["preferenceProvenance"]["matchedPreferences"][0]["source"] == "prompt"
  assert components["preferenceConflict"]["directMatch"] is True
  assert "preferenceResolution" not in components
  assert components["answerScore"] == pytest.approx(
    clamp01(0.5 + components["promptPreferenceDelta"] / W_PREFERENCE),
  )
  assert row["score"] == round(clamp01(row["_scoreRaw"]), 6)


def test_cached_row_retains_unrounded_score_for_gap_calculation() -> None:
  rows = [
    {"item": _item("a"), "score": 0.5, "components": {"_scoreRaw": 0.50000049}},
    {"item": _item("b"), "score": 0.5, "components": {"_scoreRaw": 0.50000001}},
  ]

  assert top_score_gap(rows) == pytest.approx(0.00000048)


def test_a4_drops_confirmed_opposite_but_keeps_inferred_opposite_last() -> None:
  resolution = resolve_preferences([_pref("finish", "glossy")])
  items = [
    _item("direct", attributes={"finish": "glossy"}, eligible={"finish": True}),
    _item("confirmed", attributes={"finish": "matte"}, eligible={"finish": True}),
    _item("neutral", attributes={"finish": "satin"}, eligible={"finish": True}),
    _item("inferred", attributes={"finish": "matte"}, eligible={"finish": False}),
  ]
  rows = [{"item": item, "score": 0.8, "components": {"preferenceResolution": resolution}} for item in items]
  guarded = guard_conflicting_candidates(rows)

  assert [row["item"]["id"] for row in guarded] == ["direct", "neutral", "inferred"]
  assert guarded[-1]["guardCaveats"]


def test_a4_treats_opposites_in_one_multi_value_preference_as_alternatives() -> None:
  alternatives = _pref("finish", "glossy")
  alternatives["values"] = ["glossy", "matte"]
  resolution = resolve_preferences([alternatives])
  rows = [
    {
      "item": _item(item_id, attributes={"finish": finish}, eligible={"finish": True}),
      "score": 0.8,
      "components": {"preferenceResolution": resolution},
    }
    for item_id, finish in (("glossy", "glossy"), ("matte", "matte"))
  ]

  assert {row["item"]["id"] for row in guard_conflicting_candidates(rows)} == {"glossy", "matte"}


def test_a4_separate_opposite_requirements_remain_a_conservative_conflict() -> None:
  resolution = resolve_preferences(
    [_pref("finish", "glossy", source="prompt"), _pref("finish", "matte", source="refine")],
  )
  rows = [
    {
      "item": _item(item_id, attributes={"finish": finish}, eligible={"finish": True}),
      "score": 0.8,
      "components": {"preferenceResolution": resolution},
    }
    for item_id, finish in (("glossy", "glossy"), ("matte", "matte"))
  ]

  assert guard_conflicting_candidates(rows) == []


def test_a4_report_has_no_veto_and_top2_never_reinserts_conflict() -> None:
  report_rows = rank_candidates(
    [_item("report-matte", attributes={"finish": "matte"}, eligible={"finish": True}, evidence=["official_detail"])],
    hard_filters=[],
    soft_preferences=[_pref("finish", "glossy", source="report")],
  )
  assert len(guard_conflicting_candidates(report_rows)) == 1

  items = [
    _item("direct", attributes={"finish": "glossy"}, eligible={"finish": True}, evidence=["official_detail"]),
    _item("conflict", attributes={"finish": "matte"}, eligible={"finish": True}, evidence=["official_detail"]),
    _item("neutral", attributes={"finish": "satin"}, eligible={"finish": True}, evidence=["official_detail"]),
  ]
  ranked = rank_candidates(items, hard_filters=[], soft_preferences=[_pref("finish", "glossy")])
  result = build_slice_result(ranked, top_n=3)

  assert [product["id"] for product in result["products"]] == ["direct", "neutral"]
  assert [product["role"] for product in result["products"]] == ["anchor", "diverse"]
  assert result["guardedCount"] == 2


def test_floor_contract_report_only_cannot_open_and_known_topic_can() -> None:
  weak = _item("weak", attributes={"undertone": "warm"}, confidence={"undertone": 1.0})
  report_row = rank_candidates(
    [weak], hard_filters=[], soft_preferences=[_pref("undertone", "warm", source="report")],
  )[0]
  assert report_row["components"]["matchedExplicitPref"] is False
  assert passes_floor(report_row) is False

  explicit_row = rank_candidates(
    [weak], hard_filters=[], soft_preferences=[_pref("undertone", "warm")],
  )[0]
  assert passes_floor(explicit_row) is True

  category_filter = {
    "attribute": "category",
    "op": "eq",
    "values": ["lip"],
    "source": "prompt",
    "mode": "hard",
  }
  hard_row = rank_candidates([weak], hard_filters=[category_filter], soft_preferences=[])[0]
  assert hard_row["components"]["matchedKnownHardConstraint"] is True
  assert passes_floor(hard_row, hard_filters=[category_filter]) is True


def test_topic_lock_does_not_reinsert_a_row_that_failed_the_exact_floor_formula() -> None:
  category_filter = {
    "attribute": "category",
    "op": "eq",
    "values": ["lip"],
    "source": "prompt",
    "mode": "hard",
  }
  # Deliberately malformed/off-topic row proves build_slice_result cannot use
  # topic-lock alone as a blanket fallback after passes_floor rejects it.
  row = {
    "item": _item("off-topic", category="cheek"),
    "score": 0.3,
    "components": {
      "semanticScore": 0.0,
      "evidenceScore": 0.2,
      "matchedExplicitPref": False,
      "matchedKnownHardConstraint": False,
    },
  }
  result = build_slice_result([row], hard_filters=[category_filter])

  assert result["floorCount"] == 0
  assert result["floorFallback"] is False
  assert result["products"] == []


def test_known_non_topic_match_cannot_cross_wire_an_unmatched_topic_lock() -> None:
  item = _item("cross-wire", category="cheek", attributes={"finish": "matte"}, eligible={"finish": True})
  filters = [
    {
      "attribute": "category",
      "op": "eq",
      "values": ["lip"],
      "source": "prompt",
      "mode": "hard",
    },
    {
      "attribute": "finish",
      "op": "eq",
      "values": ["matte"],
      "source": "question",
      "mode": "hard",
    },
  ]
  row = rank_candidates([item], hard_filters=filters, soft_preferences=[])[0]

  assert row["components"]["matchedKnownHardConstraint"] is True
  assert passes_floor(row, hard_filters=filters) is False


def test_unknown_question_hard_constraint_is_not_known_floor_evidence() -> None:
  item = _item("unknown", attributes={"finish": "matte"}, eligible={"finish": False})
  hard_filter = {
    "attribute": "finish",
    "op": "eq",
    "values": ["matte"],
    "source": "question",
    "mode": "hard",
  }
  result = evaluate_explicit_preference_match(item, resolve_preferences([]), hard_filters=[hard_filter])
  assert result["matchedKnownHardConstraint"] is False


def test_unknown_question_hard_constraint_is_neutral_in_rule_score() -> None:
  item = _item("unknown-rule", attributes={"finish": "matte"}, eligible={"finish": False})
  question_filter = {
    "attribute": "finish",
    "op": "eq",
    "values": ["matte"],
    "source": "question",
    "mode": "hard",
  }
  category_filter = {
    "attribute": "category",
    "op": "eq",
    "values": ["lip"],
    "source": "prompt",
    "mode": "hard",
  }

  question_only = rank_candidates([item], hard_filters=[question_filter], soft_preferences=[])[0]
  with_category = rank_candidates(
    [item], hard_filters=[category_filter, question_filter], soft_preferences=[],
  )[0]
  assert question_only["components"]["ruleScore"] == 0.55
  assert with_category["components"]["ruleScore"] == 1.0


def test_conditional_mmr_dedupes_curated_seed_and_returns_only_new_pick_count() -> None:
  seed = {"item": _item("seed", brand="Brand A", product="Glow Lip"), "score": 0.9}
  candidates = [
    {"item": _item("duplicate", brand=" brand-a ", product="brand-a Glow-Lip"), "score": 0.99},
    {"item": _item("new-a", brand="Brand A", product="Velvet Lip", attributes={"finish": "matte"}), "score": 0.8},
    {"item": _item("new-b", brand="Brand B", product="Shine Lip", attributes={"finish": "glossy"}), "score": 0.79},
    {"item": _item("new-c", brand="Brand C", product="Balm", attributes={"texture": "balm"}), "score": 0.7},
  ]
  picks = conditional_mmr_picks(candidates, curated_seeds=[seed], lambda_=0.5, top_n=2)

  assert len(picks) == 2
  assert "seed" not in {row["item"]["id"] for row in picks}
  assert "duplicate" not in {row["item"]["id"] for row in picks}
  assert picks[0]["item"]["id"] == "new-b"  # curated Brand A seed affects the first live choice


def test_f11_unknown_and_value_match_have_independent_reducers() -> None:
  inferred_match = evaluate_attribute(
    _item("inferred", attributes={"finish": "glossy"}, eligible={"finish": False}),
    "finish",
    ["glossy"],
  )
  known_mismatch = evaluate_attribute(
    _item("known", attributes={"finish": "matte"}, eligible={"finish": True}),
    "finish",
    ["glossy"],
  )

  assert inferred_match == {"knowledge": "unknown", "valueMatches": True}
  assert hard_question_keeps(inferred_match) is True
  assert soft_expected_matches(inferred_match) is True
  assert known_mismatch == {"knowledge": "known", "valueMatches": False}
  assert hard_question_keeps(known_mismatch) is False
  assert soft_expected_matches(known_mismatch) is False


def test_f11_channel_knownness_is_field_specific() -> None:
  explicit_false = _item("false")
  explicit_false["retailPresence"] = {"oliveYoung": {"listed": False}}
  unknown = _item("unknown")
  naver = _item("naver")

  assert evaluate_attribute(explicit_false, "channel", ["oliveyoung"]) == {
    "knowledge": "known",
    "valueMatches": False,
  }
  assert evaluate_attribute(unknown, "channel", ["oliveyoung"])["knowledge"] == "unknown"
  assert evaluate_attribute(naver, "channel", ["naver"]) == {
    "knowledge": "known",
    "valueMatches": True,
  }


def test_f11_price_tier_uses_structured_live_offer_value() -> None:
  item = _item("price-tier")
  item["liveOffer"]["priceTier"] = "15k_25k"

  assert evaluate_attribute(item, "priceTier", ["15k_25k"]) == {
    "knowledge": "known",
    "valueMatches": True,
  }
