from __future__ import annotations

import pytest

from app.core.settings import Settings
from app.services.auradin_agent.preference_policy import resolve_preferences
from app.services.auradin_agent.ranking import (
  CAP_PROMPT,
  CAP_REPORT,
  SCORE_WEIGHTS,
  SCORE_WEIGHTS_V2,
  compute_score_components,
  preference_deltas,
  rank_candidates,
  score_weights,
  to_result_product,
)


def _item(
  item_id: str,
  *,
  category: str = "lip",
  finish: str = "glossy",
  evidence: list[str] | None = None,
) -> dict:
  return {
    "id": item_id,
    "brandName": "브랜드",
    "productName": f"제품 {item_id}",
    "category": category,
    "attributes": {"finish": finish},
    "attributeConfidence": {"finish": 1.0},
    "hardFilterEligible": {"finish": True},
    "evidenceSourceTypes": evidence or [],
    "liveOffer": {
      "priceKrw": 15000,
      "imageUrl": f"https://example.com/{item_id}.jpg",
      "purchaseUrl": f"https://example.com/{item_id}",
    },
  }


def _finish_preference(*, weight: float = 1.0) -> dict:
  return {
    "attribute": "finish",
    "values": ["matte"],
    "source": "prompt",
    "confidence": 1.0,
    "weight": weight,
  }


def _category_filter() -> dict:
  return {
    "attribute": "category",
    "op": "eq",
    "values": ["lip"],
    "source": "prompt",
    "mode": "hard",
  }


def test_flag_off_preserves_legacy_weights_and_match_rate_golden_canary() -> None:
  assert Settings(_env_file=None).auradin_score_weights_v2 is False
  assert score_weights() is SCORE_WEIGHTS
  assert SCORE_WEIGHTS == {
    "rule": 0.40,
    "semantic": 0.08,
    "preference": 0.22,
    "evidence": 0.20,
    "liveOffer": 0.10,
  }

  item = _item(
    "legacy-golden",
    finish="matte",
    evidence=["official_detail", "oliveyoung_detail", "structured_extraction"],
  )
  row = rank_candidates(
    [item],
    hard_filters=[_category_filter()],
    soft_preferences=[_finish_preference(weight=10.0)],
    semantic_scores={item["id"]: 1.0},
  )[0]
  product = to_result_product(row, 0, hard_filters=[_category_filter()])

  assert product["matchRate"] == round(row["score"] * 100)
  assert product["matchRate"] >= 80
  assert set(product["reason"]) == {"matchedOn", "inferred", "caveat"}


def test_flag_on_uses_v2_weights_and_keeps_r2a_caps_in_final_score_units() -> None:
  assert Settings(auradin_score_weights_v2=True, _env_file=None).auradin_score_weights_v2 is True
  assert score_weights(score_weights_v2=True) is SCORE_WEIGHTS_V2
  assert SCORE_WEIGHTS_V2 == {
    "rule": 0.15,
    "semantic": 0.10,
    "preference": 0.35,
    "evidence": 0.30,
    "liveOffer": 0.10,
  }
  assert sum(SCORE_WEIGHTS_V2.values()) == pytest.approx(1.0)

  item = _item("capped", finish="matte")
  resolution = resolve_preferences(
    [
      _finish_preference(weight=10.0),
      {
        "attribute": "texture",
        "values": ["tint"],
        "source": "report",
        "confidence": 1.0,
        "weight": 10.0,
      },
    ],
  )
  item["attributes"]["texture"] = "tint"
  item["attributeConfidence"]["texture"] = 1.0
  deltas = preference_deltas(item, resolution, score_weights_v2=True)

  assert deltas["promptPreferenceDelta"] == CAP_PROMPT
  assert deltas["reportPreferenceDelta"] == CAP_REPORT
  components = compute_score_components(
    rule_score=1.0,
    semantic_score=1.0,
    evidence_score=1.0,
    live_offer_score=1.0,
    prompt_preference_delta=0.0,
    report_preference_delta=0.0,
    score_weights_v2=True,
  )
  assert components["preferenceBase"] == pytest.approx(0.175)
  assert components["scoreBeforeClamp"] == pytest.approx(0.825)


def test_flag_on_can_change_rank_order() -> None:
  evidence_rich_preference_match = _item(
    "preference-first-v2",
    category="cheek",
    finish="matte",
    evidence=[
      "official_detail",
      "oliveyoung_detail",
      "structured_extraction",
      "shade_option_text_inferred",
    ],
  )
  rule_only = _item("rule-first-legacy", category="lip", finish="glossy")
  kwargs = {
    "items": [evidence_rich_preference_match, rule_only],
    "hard_filters": [_category_filter()],
    "soft_preferences": [_finish_preference(weight=10.0)],
  }

  legacy = rank_candidates(**kwargs)
  v2 = rank_candidates(**kwargs, score_weights_v2=True)

  assert legacy[0]["item"]["id"] == "rule-first-legacy"
  assert v2[0]["item"]["id"] == "preference-first-v2"


def test_flag_on_match_rate_is_score_independent_and_stays_in_contract_range() -> None:
  item = _item(
    "display-v2",
    finish="matte",
    evidence=["official_detail", "structured_extraction"],
  )
  row = rank_candidates(
    [item],
    hard_filters=[_category_filter()],
    soft_preferences=[_finish_preference()],
    semantic_scores={item["id"]: 0.9},
    score_weights_v2=True,
  )[0]
  low_rank_score = to_result_product(
    {**row, "score": 0.01},
    0,
    hard_filters=[_category_filter()],
  )
  high_rank_score = to_result_product(
    {**row, "score": 0.99},
    0,
    hard_filters=[_category_filter()],
  )

  assert low_rank_score["matchRate"] == high_rank_score["matchRate"]
  assert 0 <= low_rank_score["matchRate"] <= 100
  assert set(low_rank_score["reason"]) == {"matchedOn", "inferred", "caveat"}
