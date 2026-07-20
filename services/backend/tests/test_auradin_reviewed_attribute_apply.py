"""apply_auradin_reviewed_attributes — gate and invariant tests.

Verifies the honesty contract when writing reviewed color attributes into the
seed: evidenceSpan re-validation, confidence-gated overwrite, hardFilter
promotion rules (incl. undertone ban), structured-detail fill-when-missing, and
row-count/id invariance.
"""

from __future__ import annotations

from typing import Any

import scripts.apply_auradin_reviewed_attributes as apply_mod


def _seed_row(item_id: str, **overrides: Any) -> dict[str, Any]:
  row = {
    "catalogItemId": item_id,
    "category": "lip",
    "brandName": "롬앤",
    "productName": "쥬시 래스팅 틴트 핑크",
    "rawTitle": "롬앤 쥬시 래스팅 틴트 핑크 pink",
    "attributes": {},
    "attributeConfidence": {},
    "hardFilterEligible": {},
    "evidence": [],
    "liveOffer": {"imageUrl": "https://img/x.jpg", "priceKrw": 12000},
  }
  row.update(overrides)
  return row


def _decision(item_id: str, field: str, value: str, conf: float, span: str, *, promo: bool) -> dict[str, Any]:
  return {
    "catalogItemId": item_id,
    "field": field,
    "value": value,
    "confidence": conf,
    "evidenceSpan": span,
    "promotionCandidate": promo,
  }


# text fn that returns each row's rawTitle (so evidenceSpan checks are deterministic)
def _text(row: dict[str, Any]) -> str:
  return str(row.get("rawTitle") or "")


def test_apply_sets_value_and_promotes_high_confidence() -> None:
  rows = [_seed_row("a")]
  decisions = [_decision("a", "colorFamily", "pink", 0.82, "pink", promo=True)]
  new_rows, report = apply_mod.apply_reviewed_to_seed(rows, decisions, run_date="20260720", input_text_fn=_text)
  assert new_rows[0]["attributes"]["colorFamily"] == "pink"
  assert new_rows[0]["attributeConfidence"]["colorFamily"] == 0.82
  assert new_rows[0]["hardFilterEligible"]["colorFamily"] is True
  assert report["applied"] == 1 and report["hardFilterPromoted"] == 1
  # original row is untouched (deep-copied)
  assert rows[0]["attributes"] == {}


def test_low_confidence_accepted_but_not_promoted() -> None:
  rows = [_seed_row("a")]
  decisions = [_decision("a", "colorFamily", "pink", 0.66, "pink", promo=False)]
  new_rows, report = apply_mod.apply_reviewed_to_seed(rows, decisions, run_date="20260720", input_text_fn=_text)
  assert new_rows[0]["attributes"]["colorFamily"] == "pink"
  assert new_rows[0]["hardFilterEligible"]["colorFamily"] is False
  assert report["hardFilterPromoted"] == 0


def test_undertone_never_promoted_even_at_high_confidence() -> None:
  rows = [_seed_row("a", rawTitle="롬앤 쿨 웜 warm 립")]
  decisions = [_decision("a", "undertone", "warm", 0.95, "warm", promo=True)]
  new_rows, _ = apply_mod.apply_reviewed_to_seed(rows, decisions, run_date="20260720", input_text_fn=_text)
  assert new_rows[0]["attributes"]["undertone"] == "warm"
  assert new_rows[0]["hardFilterEligible"]["undertone"] is False


def test_evidence_span_not_substring_is_skipped() -> None:
  rows = [_seed_row("a")]
  decisions = [_decision("a", "colorFamily", "coral", 0.9, "coral", promo=True)]  # 'coral' not in rawTitle
  new_rows, report = apply_mod.apply_reviewed_to_seed(rows, decisions, run_date="20260720", input_text_fn=_text)
  assert "colorFamily" not in new_rows[0]["attributes"]
  assert report["skippedEvidenceSpan"] == 1


def test_overwrite_only_when_confidence_higher() -> None:
  rows = [_seed_row("a", attributes={"colorFamily": "red"}, attributeConfidence={"colorFamily": 0.8})]
  decisions = [_decision("a", "colorFamily", "pink", 0.75, "pink", promo=True)]
  new_rows, report = apply_mod.apply_reviewed_to_seed(rows, decisions, run_date="20260720", input_text_fn=_text)
  assert new_rows[0]["attributes"]["colorFamily"] == "red"  # kept — new conf lower
  assert report["skippedLowerConfidence"] == 1


def test_unknown_row_is_counted_not_fatal() -> None:
  rows = [_seed_row("a")]
  decisions = [_decision("ghost", "colorFamily", "pink", 0.9, "pink", promo=True)]
  _, report = apply_mod.apply_reviewed_to_seed(rows, decisions, run_date="20260720", input_text_fn=_text)
  assert report["skippedUnknownRow"] == 1
  assert report["applied"] == 0


def test_merge_review_decisions_requires_approval() -> None:
  review = [
    {
      "catalogItemId": "a",
      "fields": {
        "colorFamily": {"status": "accepted", "value": "pink", "confidence": 0.8, "evidenceSpan": "pink", "promotionCandidate": True},
        "finish": {"status": "accepted", "value": "glossy", "confidence": 0.8, "evidenceSpan": "glossy", "promotionCandidate": True},
      },
    },
  ]
  verdicts = {("a", "colorFamily"): True, ("a", "finish"): False}
  decisions = apply_mod.merge_review_decisions(review, verdicts)
  assert [d["field"] for d in decisions] == ["colorFamily"]


def test_accepted_values_as_decisions_forces_value_only() -> None:
  review = [
    {
      "catalogItemId": "a",
      "fields": {
        "colorFamily": {"status": "accepted", "value": "pink", "confidence": 0.9, "evidenceSpan": "pink", "promotionCandidate": True},
        "finish": {"status": "empty"},
      },
    },
  ]
  decisions = apply_mod.accepted_values_as_decisions(review)
  assert len(decisions) == 1
  # promotionCandidate is forced False so hardFilter is never granted without human review
  assert decisions[0]["promotionCandidate"] is False
  assert decisions[0]["value"] == "pink"


def test_accepted_values_only_fields_filter() -> None:
  review = [
    {
      "catalogItemId": "a",
      "fields": {
        "colorFamily": {"status": "accepted", "value": "pink", "confidence": 0.9, "evidenceSpan": "pink", "promotionCandidate": True},
        "texture": {"status": "accepted", "value": "tint", "confidence": 0.9, "evidenceSpan": "tint", "promotionCandidate": True},
      },
    },
  ]
  decisions = apply_mod.accepted_values_as_decisions(review, only_fields={"colorFamily"})
  assert [d["field"] for d in decisions] == ["colorFamily"]  # texture excluded


def test_auto_fill_applies_value_but_never_promotes() -> None:
  rows = [_seed_row("a")]
  decisions = apply_mod.accepted_values_as_decisions(
    [{"catalogItemId": "a", "fields": {"colorFamily": {"status": "accepted", "value": "pink", "confidence": 0.92, "evidenceSpan": "pink", "promotionCandidate": True}}}]
  )
  new_rows, _ = apply_mod.apply_reviewed_to_seed(
    rows, decisions, run_date="20260720", input_text_fn=_text, source_label="llm_b3_autofilled"
  )
  assert new_rows[0]["attributes"]["colorFamily"] == "pink"
  assert new_rows[0]["hardFilterEligible"]["colorFamily"] is False  # value-only
  assert new_rows[0]["evidence"][-1]["sourceType"] == "llm_b3_autofilled"


def test_spotcheck_verdict_parsing() -> None:
  rows = [
    {"catalogItemId": "a", "field": "colorFamily", "verdict": "approve"},
    {"catalogItemId": "b", "field": "colorFamily", "verdict": "reject"},
    {"catalogItemId": "c", "field": "colorFamily", "verdict": ""},
  ]
  verdicts = apply_mod.load_spotcheck_verdicts(rows)
  assert verdicts == {("a", "colorFamily"): True, ("b", "colorFamily"): False, ("c", "colorFamily"): False}


def test_structured_detail_fills_missing_only_no_promotion() -> None:
  rows = [
    _seed_row("a"),  # missing colorFamily
    _seed_row("b", attributes={"colorFamily": "red"}),  # already has one
  ]
  index = apply_mod.index_structured_color(
    [{"imageUrl": "https://img/x.jpg", "colorFamily": "mauve"}]
  )
  new_rows, report = apply_mod.apply_structured_detail(rows, index, run_date="20260720")
  assert new_rows[0]["attributes"]["colorFamily"] == "mauve"
  assert new_rows[0]["hardFilterEligible"]["colorFamily"] is False
  assert new_rows[1]["attributes"]["colorFamily"] == "red"  # unchanged
  assert report["filled"] == 1


def test_structured_detail_brand_name_fallback_join() -> None:
  # imageUrl differs (detail CDN vs offer CDN), so only brand+productName matches.
  rows = [_seed_row("a")]
  rows[0]["liveOffer"]["imageUrl"] = "https://offer-cdn/a.jpg"
  index = apply_mod.index_structured_color(
    [{"imageUrl": "https://detail-cdn/z.jpg", "brand": "롬앤", "productName": "쥬시 래스팅 틴트 핑크", "colorFamily": "pink"}]
  )
  new_rows, report = apply_mod.apply_structured_detail(rows, index, run_date="20260720")
  assert new_rows[0]["attributes"]["colorFamily"] == "pink"
  assert report["filled"] == 1


def test_structured_detail_image_join_takes_precedence() -> None:
  rows = [_seed_row("a")]  # imageUrl https://img/x.jpg, brand 롬앤
  index = apply_mod.index_structured_color(
    [
      {"imageUrl": "https://img/x.jpg", "colorFamily": "coral"},
      {"brand": "롬앤", "productName": "쥬시 래스팅 틴트 핑크", "colorFamily": "pink"},
    ]
  )
  new_rows, _ = apply_mod.apply_structured_detail(rows, index, run_date="20260720")
  assert new_rows[0]["attributes"]["colorFamily"] == "coral"  # image match wins


def test_coverage_and_invariant() -> None:
  rows = [_seed_row("a", attributes={"colorFamily": "pink"}, hardFilterEligible={"colorFamily": True}), _seed_row("b")]
  cov = apply_mod.color_family_coverage(rows)
  assert cov == {"present": 1, "eligible": 1, "total": 2}
  # invariant holds for equal-length, same-id lists
  apply_mod._assert_invariant(rows, [dict(r) for r in rows])
