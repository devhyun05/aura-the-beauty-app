from __future__ import annotations

from datetime import datetime, timezone
import hashlib

import pytest

from app.services.auradin_agent import shade_evidence
from app.services import product_external_catalog


# The retired recommendation fallback is covered by the verified live-discovery
# color-evidence and offer-dedupe contracts in test_makeup_report_product_discovery.py.


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
async def test_active_offer_identity_gates_verified_shade_options() -> None:
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
