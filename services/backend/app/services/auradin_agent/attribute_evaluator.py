"""Tri-state attribute knowledge evaluator used by the F11 reducers.

The evaluator deliberately separates whether the catalog *knows* an attribute
from whether the observed value matches.  Consumers can therefore keep unknown
items for hard clarification filters while counting actual values for soft
question estimates.
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict


class AttributeEvaluation(TypedDict):
  knowledge: Literal["known", "unknown"]
  valueMatches: bool


def _clean(value: Any) -> str:
  return str(value or "").strip()


def _values(value: Any) -> list[str]:
  if isinstance(value, list):
    return [_clean(item) for item in value if _clean(item)]
  cleaned = _clean(value)
  return [cleaned] if cleaned else []


def _attribute_value(item: dict[str, Any], attribute: str) -> Any:
  attrs = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
  if attribute == "category":
    return item.get("category")
  if attribute == "priceTier":
    live_offer = item.get("liveOffer") if isinstance(item.get("liveOffer"), dict) else {}
    return live_offer.get("priceTier")
  if attribute in {"suitableFor", "sellingPoints"}:
    return attrs.get(attribute, [])
  if attribute == "occasion":
    return [*(_values(attrs.get("suitableFor"))), *(_values(attrs.get("sellingPoints")))]
  return attrs.get(attribute)


def _channel_evaluation(item: dict[str, Any], expected: list[str]) -> AttributeEvaluation:
  retail = item.get("retailPresence") if isinstance(item.get("retailPresence"), dict) else {}
  live_offer = item.get("liveOffer") if isinstance(item.get("liveOffer"), dict) else {}
  known_results: list[bool] = []
  has_unknown = False
  for channel in expected:
    if channel == "oliveyoung":
      value = (retail.get("oliveYoung") or {}).get("listed")
    elif channel == "department_store":
      value = (retail.get("departmentStore") or {}).get("listed")
    elif channel == "naver":
      if live_offer.get("purchaseUrl"):
        value = True
      else:
        value = None
    else:
      value = None
    if isinstance(value, bool):
      known_results.append(value)
    else:
      has_unknown = True

  if any(known_results):
    return {"knowledge": "known", "valueMatches": True}
  if known_results and not has_unknown:
    return {"knowledge": "known", "valueMatches": False}
  return {"knowledge": "unknown", "valueMatches": False}


def evaluate_attribute(
  item: dict[str, Any],
  attribute: str,
  expected_values: list[str] | None,
) -> AttributeEvaluation:
  attribute = _clean(attribute)
  expected = _values(expected_values)
  if attribute == "channel":
    return _channel_evaluation(item, expected)

  raw_value = _attribute_value(item, attribute)
  actual = _values(raw_value)
  value_matches = bool(expected) and any(value in actual for value in expected)
  if attribute in {"category", "priceTier"}:
    known = bool(actual)
  else:
    eligible = item.get("hardFilterEligible") if isinstance(item.get("hardFilterEligible"), dict) else {}
    known = bool(actual) and eligible.get(attribute) is True
  return {
    "knowledge": "known" if known else "unknown",
    "valueMatches": value_matches,
  }


def hard_question_keeps(evaluation: AttributeEvaluation) -> bool:
  return evaluation["knowledge"] == "unknown" or evaluation["valueMatches"]


def soft_expected_matches(evaluation: AttributeEvaluation) -> bool:
  return evaluation["valueMatches"]
