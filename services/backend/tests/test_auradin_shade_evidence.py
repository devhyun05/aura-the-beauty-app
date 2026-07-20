from __future__ import annotations

from datetime import datetime, timezone
import hashlib

import pytest

from app.services.auradin_agent import shade_evidence
from app.services import makeup_report_product_recommendations as recommendations
from app.services import product_external_catalog


VERIFIED_ROSE_LIP_ID = "auradin-seed-7e2b5600678a4be3"


def test_refined_shade_evidence_digest_and_sources_are_fail_closed(tmp_path) -> None:
  artifact = (
    shade_evidence.resolve_repo_root()
    / shade_evidence.REFINED_SHADE_EVIDENCE_PATH
  )
  assert hashlib.sha256(artifact.read_bytes()).hexdigest() == (
    shade_evidence.REFINED_SHADE_EVIDENCE_SHA256
  )
  loaded = shade_evidence.load_refined_shade_evidence()
  rose_lip = loaded[VERIFIED_ROSE_LIP_ID]
  assert rose_lip.options
  assert all(
    option.source_type in shade_evidence.TRUSTED_SHADE_OPTION_SOURCE_TYPES
    and option.confidence >= shade_evidence.MIN_SHADE_OPTION_CONFIDENCE
    and option.color_family_confidence >= shade_evidence.MIN_COLOR_FAMILY_CONFIDENCE
    for option in rose_lip.options
  )
  assert not {
    "lotteon_product_api_title",
    "naver_offer_title_option_inferred",
    "official_brand_page_meta_keywords",
    "prior_detail_option",
    "title_rule_inferred",
  } & shade_evidence.TRUSTED_SHADE_OPTION_SOURCE_TYPES

  tampered = tmp_path / "tampered.jsonl"
  tampered.write_bytes(artifact.read_bytes() + b"\n")
  assert shade_evidence._load_refined_shade_evidence(
    tampered,
    shade_evidence.REFINED_SHADE_EVIDENCE_SHA256,
  ) == {}


@pytest.mark.asyncio
async def test_active_offer_identity_selects_verified_shade_without_delta_e_claim() -> None:
  class OfflineDatabase:
    is_connected = False

  items = await product_external_catalog.get_auradin_catalog_products_by_ids(
    OfflineDatabase(),
    user_id=None,
    product_ids=[VERIFIED_ROSE_LIP_ID],
    verified_offer_max_age_hours=168,
    verified_offer_now=datetime(2026, 7, 20, tzinfo=timezone.utc),
  )
  assert len(items) == 1
  item = items[0]
  options = shade_evidence.verified_shade_options_for_current_offer(item)
  assert any(option.color_family == "rose" for option in options)
  assert shade_evidence.verified_shade_options_for_current_offer({
    **item,
    "brandName": "identity-mismatch",
  }) == ()
  assert shade_evidence.verified_shade_options_for_current_offer({
    **item,
    "_freshnessVerified": False,
  }) == ()

  target = recommendations._guide_target(
    {
      "area": "lip",
      "color": {"name": "로즈", "hex": "#B85E6D"},
      "texture": "촉촉한 글로우 크림",
      "applicationPlan": {
        "steps": [{"productType": "글로우 틴트", "finishCheck": "글로우"}],
      },
    },
    {},
    "lip",
  )
  candidate = recommendations._external_candidate(item, target)
  assert candidate is not None
  assert candidate["shadeName"]
  assert candidate["shadeHex"] is None
  assert candidate["colorDistance"] is None
  assert candidate["palette"] == []
  assert candidate["recommendationBasis"] == "verifiedExternalShadeFamily"
  assert candidate["degradedReason"] == "external_catalog_no_measured_swatch"
  assert "VERIFIED_EXTERNAL_SHADE_OPTION" in candidate["reasonCodes"]
  assert candidate["shadeName"] in candidate["reasonLabels"][0]
  assert "보고서와 일치" in candidate["reasonLabels"][0]
  assert not any("색차" in label or "ΔE" in label for label in candidate["reasonLabels"])


def test_verified_option_prefers_exact_family_before_higher_confidence_adjacent() -> None:
  adjacent = shade_evidence.VerifiedShadeOption(
    shade_name="피치 옵션",
    option_name="피치 옵션",
    shade_number=None,
    color_family="peach",
    source_type="official_brand_page_option_json",
    confidence=0.99,
    color_family_confidence=0.99,
  )
  exact = shade_evidence.VerifiedShadeOption(
    shade_name="로즈 옵션",
    option_name="로즈 옵션",
    shade_number=None,
    color_family="rose",
    source_type="official_brand_page_option_json",
    confidence=0.80,
    color_family_confidence=0.62,
  )
  selected = recommendations._verified_shade_option_match(
    [adjacent, exact],
    {"colorFamily": "rose", "colorFamilies": ["rose"]},
  )
  assert selected == (exact, "exact")


def test_external_brand_diversity_defers_only_third_product_per_brand() -> None:
  candidates = [
    {"productId": "a1", "brandName": "A"},
    {"productId": "a2", "brandName": "A"},
    {"productId": "a3", "brandName": "A"},
    {"productId": "b1", "brandName": "B"},
    {"productId": "c1", "brandName": "C"},
  ]
  diversified = recommendations._brand_diverse_external_order(candidates)
  assert [item["productId"] for item in diversified] == ["a1", "a2", "b1", "c1", "a3"]
