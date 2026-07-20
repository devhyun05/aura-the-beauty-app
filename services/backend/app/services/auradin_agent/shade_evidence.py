"""Fail-closed shade-option evidence for the active Auradin catalog.

The active snapshot owns product identity and current offer freshness.  This
module may only add shade names and broad color families from the immutable,
reviewed refinement artifact when its exact digest and product identity still
match.  It deliberately does not expose swatch hex values or claim a measured
color distance.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import hashlib
import hmac
import json
import logging
import math
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlparse

from .catalog_loader import get_catalog
from .snapshot_manifest import resolve_repo_root


logger = logging.getLogger(__name__)

REFINED_SHADE_EVIDENCE_PATH = Path(
  "data/auradin/catalog/catalog_items_seed_20260706_refined.jsonl",
)
REFINED_SHADE_EVIDENCE_SHA256 = (
  "134b7a3ed81b1bc1525fb000ed116aabe77dba2e032fd7ef0e34b26bdb3820de"
)
MIN_SHADE_OPTION_CONFIDENCE = 0.80
MIN_COLOR_FAMILY_CONFIDENCE = 0.62

# Exact source types only. Inferred Naver titles, title rules and prior-detail
# carry-forwards are intentionally absent even when a row claims confidence.
TRUSTED_SHADE_OPTION_SOURCE_TYPES = frozenset({
  "chicor_product_option_json",
  "gsshop_product_option_html",
  "hmall_next_stock_option",
  "lotteon_product_api_option",
  "official_brand_page_option_html",
  "official_brand_page_option_json",
  "oliveyoung_product_option_json",
  "thehyundai_next_option",
  "wconcept_color_option_select",
})
VERIFIED_COLOR_FAMILIES = frozenset({
  "black",
  "brown",
  "coral",
  "gray",
  "mauve",
  "nude",
  "orange",
  "peach",
  "pink",
  "plum",
  "red",
  "rose",
})


@dataclass(frozen=True)
class VerifiedShadeOption:
  shade_name: str
  option_name: str
  shade_number: str | None
  color_family: str
  source_type: str
  confidence: float
  color_family_confidence: float


@dataclass(frozen=True)
class VerifiedProductShadeEvidence:
  product_id: str
  category: str
  brand_name: str
  product_name: str
  options: tuple[VerifiedShadeOption, ...]


def _confidence(value: Any) -> float | None:
  if isinstance(value, bool):
    return None
  try:
    parsed = float(value)
  except (TypeError, ValueError):
    return None
  return parsed if math.isfinite(parsed) and 0 <= parsed <= 1 else None


def _https_url(value: Any) -> bool:
  candidate = str(value or "").strip()
  parsed = urlparse(candidate)
  return parsed.scheme == "https" and bool(parsed.netloc) and not parsed.username and not parsed.password


def _option_identity(value: Mapping[str, Any]) -> tuple[str, str, str, str]:
  return (
    str(value.get("sourceType") or ""),
    str(value.get("optionName") or ""),
    str(value.get("shadeName") or ""),
    str(value.get("shadeNumber") or ""),
  )


def _trusted_evidence_option_ids(row: Mapping[str, Any]) -> set[tuple[str, str, str, str]]:
  option_ids: set[tuple[str, str, str, str]] = set()
  evidence = row.get("evidence")
  if not isinstance(evidence, list):
    return option_ids
  for item in evidence:
    if not isinstance(item, dict):
      continue
    source_type = str(item.get("sourceType") or "")
    confidence = _confidence(item.get("confidence"))
    values = item.get("value")
    if (
      item.get("field") != "shadeOptions"
      or source_type not in TRUSTED_SHADE_OPTION_SOURCE_TYPES
      or confidence is None
      or confidence < MIN_SHADE_OPTION_CONFIDENCE
      or not _https_url(item.get("sourceUrl"))
      or not isinstance(values, list)
    ):
      continue
    for value in values:
      if isinstance(value, dict) and str(value.get("sourceType") or "") == source_type:
        option_ids.add(_option_identity(value))
  return option_ids


def _verified_options(row: Mapping[str, Any]) -> tuple[VerifiedShadeOption, ...]:
  hard_filter = row.get("hardFilterEligible")
  attribute_confidence = row.get("attributeConfidence")
  options = row.get("shadeOptions")
  if (
    not isinstance(hard_filter, dict)
    or hard_filter.get("shadeOptions") is not True
    or not isinstance(attribute_confidence, dict)
    or (_confidence(attribute_confidence.get("shadeOptions")) or 0) < MIN_SHADE_OPTION_CONFIDENCE
    or not isinstance(options, list)
  ):
    return ()
  evidence_option_ids = _trusted_evidence_option_ids(row)
  verified: list[VerifiedShadeOption] = []
  seen: set[tuple[str, str, str]] = set()
  for option in options:
    if not isinstance(option, dict) or _option_identity(option) not in evidence_option_ids:
      continue
    source_type = str(option.get("sourceType") or "")
    shade_name = str(option.get("shadeName") or "").strip()[:120]
    option_name = str(option.get("optionName") or "").strip()[:160]
    shade_number = str(option.get("shadeNumber") or "").strip()[:40] or None
    color_family = str(option.get("colorFamily") or "").strip().casefold()
    confidence = _confidence(option.get("confidence"))
    color_confidence = _confidence(option.get("colorFamilyConfidence"))
    if (
      source_type not in TRUSTED_SHADE_OPTION_SOURCE_TYPES
      or not shade_name
      or not option_name
      or color_family not in VERIFIED_COLOR_FAMILIES
      or confidence is None
      or confidence < MIN_SHADE_OPTION_CONFIDENCE
      or color_confidence is None
      or color_confidence < MIN_COLOR_FAMILY_CONFIDENCE
    ):
      continue
    identity = (source_type, option_name, shade_name)
    if identity in seen:
      continue
    seen.add(identity)
    verified.append(VerifiedShadeOption(
      shade_name=shade_name,
      option_name=option_name,
      shade_number=shade_number,
      color_family=color_family,
      source_type=source_type,
      confidence=confidence,
      color_family_confidence=color_confidence,
    ))
  return tuple(sorted(
    verified,
    key=lambda option: (
      option.color_family,
      -option.confidence,
      -option.color_family_confidence,
      option.shade_name.casefold(),
      option.option_name.casefold(),
      option.source_type,
    ),
  ))


def _load_refined_shade_evidence(
  path: Path,
  expected_sha256: str,
) -> dict[str, VerifiedProductShadeEvidence]:
  """Read one immutable evidence artifact; any trust-root error returns empty."""

  try:
    payload = path.read_bytes()
  except OSError:
    logger.warning("[aura:products] shade-evidence:artifact-unavailable", exc_info=True)
    return {}
  actual_sha256 = hashlib.sha256(payload).hexdigest()
  if not hmac.compare_digest(actual_sha256, expected_sha256):
    logger.error(
      "[aura:products] shade-evidence:digest-mismatch expected=%s actual=%s",
      expected_sha256,
      actual_sha256,
    )
    return {}

  loaded: dict[str, VerifiedProductShadeEvidence] = {}
  seen_product_ids: set[str] = set()
  try:
    lines = payload.decode("utf-8").splitlines()
    for line in lines:
      if not line.strip():
        continue
      row = json.loads(line)
      if not isinstance(row, dict):
        return {}
      product_id = str(row.get("catalogItemId") or "")
      category = str(row.get("category") or "")
      brand_name = str(row.get("brandName") or "")
      product_name = str(row.get("productName") or "")
      if (
        not product_id.strip()
        or not category.strip()
        or not brand_name.strip()
        or not product_name.strip()
        or product_id in seen_product_ids
      ):
        return {}
      seen_product_ids.add(product_id)
      options = _verified_options(row)
      if not options:
        continue
      loaded[product_id] = VerifiedProductShadeEvidence(
        product_id=product_id,
        category=category,
        brand_name=brand_name,
        product_name=product_name,
        options=options,
      )
  except (UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError):
    logger.warning("[aura:products] shade-evidence:invalid-artifact", exc_info=True)
    return {}
  return loaded


@lru_cache(maxsize=1)
def load_refined_shade_evidence() -> dict[str, VerifiedProductShadeEvidence]:
  path = (resolve_repo_root() / REFINED_SHADE_EVIDENCE_PATH).resolve()
  return _load_refined_shade_evidence(path, REFINED_SHADE_EVIDENCE_SHA256)


def verified_shade_options_for_current_offer(
  item: Mapping[str, Any],
) -> tuple[VerifiedShadeOption, ...]:
  """Join verified options to one fresh mapped item from the active snapshot."""

  if item.get("_freshnessVerified") is not True or not item.get("_offerVerifiedAt"):
    return ()
  product_id = str(item.get("productId") or "")
  try:
    catalog = get_catalog()
  except Exception:  # noqa: BLE001 - optional enrichment must fail closed.
    logger.warning("[aura:products] shade-evidence:active-snapshot-unavailable", exc_info=True)
    return ()
  snapshot = catalog.snapshot
  active = catalog.get(product_id)
  if (
    snapshot is None
    or active is None
    or str(item.get("_snapshotRunDate") or "") != str(snapshot.run_date or "")
  ):
    return ()

  mapped_identity = (
    product_id,
    str(item.get("category") or ""),
    str(item.get("brandName") or ""),
    str(item.get("productName") or ""),
  )
  active_mapped_identity = (
    str(active.get("id") or "").strip(),
    str(active.get("category") or "").strip(),
    str(active.get("brandName") or "").strip(),
    str(active.get("productName") or active.get("normalizedProductName") or "").strip(),
  )
  if mapped_identity != active_mapped_identity:
    return ()

  evidence = load_refined_shade_evidence().get(product_id)
  active_seed_identity = (
    str(active.get("id") or ""),
    str(active.get("category") or ""),
    str(active.get("brandName") or ""),
    str(active.get("productName") or ""),
  )
  if evidence is None or active_seed_identity != (
    evidence.product_id,
    evidence.category,
    evidence.brand_name,
    evidence.product_name,
  ):
    return ()
  return evidence.options
