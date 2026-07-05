from __future__ import annotations

import hashlib
from collections import Counter
from typing import Any

from .title_keyword_extractor import (
  TITLE_INFERENCE_SOURCE,
  extract_residual_keywords,
  normalize_product_name,
)


SUPPORTED_CATEGORIES = {"lip", "cheek", "shadow"}

COLOR_PALETTE = {
  "pink": "#EFA3B4",
  "rose": "#B85E68",
  "coral": "#EF8A73",
  "red": "#C8454D",
  "orange": "#E8844A",
  "mauve": "#A96D82",
  "brown": "#8B5E4E",
  "nude": "#D8A287",
  "peach": "#F0A488",
  "burgundy": "#7F3048",
}

DEFAULT_PALETTE_BY_CATEGORY = {
  "lip": ["#B85E68", "#EFA3B4"],
  "cheek": ["#EF8A73", "#F4B3A5"],
  "shadow": ["#8B6A55", "#D7BFA8"],
}

PRICE_TIERS = (
  ("under_15k", 0, 14999),
  ("15k_25k", 15000, 24999),
  ("25k_40k", 25000, 39999),
  ("over_40k", 40000, 10**9),
)


def _clean(value: Any) -> str:
  return str(value or "").strip()


def _as_list(value: Any) -> list[Any]:
  return value if isinstance(value, list) else []


def _as_text_list(value: Any) -> list[str]:
  return [_clean(item) for item in _as_list(value) if _clean(item)]


def _as_bool(value: Any) -> bool:
  return value is True


def price_tier_for(price_krw: int) -> str:
  for tier, lower, upper in PRICE_TIERS:
    if lower <= price_krw <= upper:
      return tier
  return "over_40k"


def _stable_id(seed: dict[str, Any]) -> str:
  existing_id = _clean(seed.get("catalogItemId"))
  if existing_id:
    return existing_id

  key = "|".join(
    [
      _clean(seed.get("sourceCandidateId")),
      _clean(seed.get("brandName")),
      _clean(seed.get("productName")),
    ],
  )
  digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
  return f"auradin-mvp-{digest}"


def _quality_flags(product_name: str) -> list[str]:
  lowered = product_name.lower()
  flags: list[str] = []
  checks = {
    "bundle_or_set_copy": ("세트", "기획", "set"),
    "refill_copy": ("리필", "refill"),
    "bonus_tool_copy": ("브러쉬", "브러시", "증정"),
    "mini_or_sample_copy": ("미니", "mini", "샘플"),
    "case_copy": ("케이스", "case"),
  }
  for flag, terms in checks.items():
    if any(term in lowered for term in terms):
      flags.append(flag)
  return flags


def _merge_residual_keywords(
  attributes: dict[str, Any],
  confidence: dict[str, float],
  hard_filter_eligible: dict[str, bool],
  residual_keywords: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, float], dict[str, bool]]:
  next_attributes = dict(attributes)
  next_confidence = dict(confidence)
  next_hard = dict(hard_filter_eligible)

  for keyword in residual_keywords:
    field = _clean(keyword.get("field"))
    value = keyword.get("value")
    keyword_confidence = float(keyword.get("confidence") or 0)

    if field == "sellingPoints":
      current = _as_text_list(next_attributes.get("sellingPoints"))
      if _clean(value) and value not in current:
        current.append(_clean(value))
      next_attributes["sellingPoints"] = current
    elif field in {"suitableFor"}:
      current = _as_text_list(next_attributes.get(field))
      if _clean(value) and value not in current:
        current.append(_clean(value))
      next_attributes[field] = current
    elif field and not next_attributes.get(field) and _clean(value):
      next_attributes[field] = _clean(value)
      next_confidence[field] = max(float(next_confidence.get(field) or 0), keyword_confidence)
      next_hard[field] = False

  return next_attributes, next_confidence, next_hard


def _evidence_source_types(evidence: list[dict[str, Any]]) -> list[str]:
  return sorted({_clean(item.get("sourceType")) for item in evidence if _clean(item.get("sourceType"))})


def _retail_status(retail_presence: dict[str, Any], key: str) -> dict[str, Any]:
  value = retail_presence.get(key)
  return value if isinstance(value, dict) else {"listed": None, "status": "unknown", "confidence": 0}


def _palette_for_item(item: dict[str, Any]) -> list[str]:
  values = []
  color_family = item.get("attributes", {}).get("colorFamily")
  if color_family in COLOR_PALETTE:
    values.append(COLOR_PALETTE[color_family])

  for shade in _as_list(item.get("shadeOptions")):
    shade_color = shade.get("colorFamily") if isinstance(shade, dict) else None
    if shade_color in COLOR_PALETTE and COLOR_PALETTE[shade_color] not in values:
      values.append(COLOR_PALETTE[shade_color])
    if len(values) >= 3:
      break

  return values or DEFAULT_PALETTE_BY_CATEGORY.get(item.get("category"), ["#B85E68"])


def build_mvp_catalog_item(seed: dict[str, Any]) -> dict[str, Any] | None:
  category = _clean(seed.get("category"))
  if category not in SUPPORTED_CATEGORIES:
    return None

  live_offer = seed.get("liveOffer") if isinstance(seed.get("liveOffer"), dict) else {}
  price_krw = int(live_offer.get("priceKrw") or 0)
  purchase_url = _clean(live_offer.get("purchaseUrl"))
  image_url = _clean(live_offer.get("imageUrl"))

  if price_krw <= 0 or not purchase_url or not image_url:
    return None

  brand_name = _clean(seed.get("brandName"))
  raw_title = _clean(seed.get("rawTitle")) or _clean(seed.get("productName"))
  product_name = _clean(seed.get("productName")) or raw_title
  normalized_name = normalize_product_name(product_name, brand_name)
  residual_keywords = extract_residual_keywords(raw_title, normalized_name, brand_name)
  attributes = seed.get("attributes") if isinstance(seed.get("attributes"), dict) else {}
  confidence = seed.get("attributeConfidence") if isinstance(seed.get("attributeConfidence"), dict) else {}
  hard_filter_eligible = (
    seed.get("hardFilterEligible") if isinstance(seed.get("hardFilterEligible"), dict) else {}
  )
  attributes, confidence, hard_filter_eligible = _merge_residual_keywords(
    attributes,
    confidence,
    hard_filter_eligible,
    residual_keywords,
  )

  price_tier = _clean(live_offer.get("priceTier")) or price_tier_for(price_krw)
  hard_filter_eligible = {
    **hard_filter_eligible,
    "category": True,
    "priceKrw": True,
    "priceTier": True,
    "purchaseUrl": True,
    "imageUrl": True,
  }
  confidence = {
    **confidence,
    "category": max(float(confidence.get("category") or 0), 0.9),
    "priceKrw": max(float(confidence.get("priceKrw") or 0), 0.9),
    "priceTier": max(float(confidence.get("priceTier") or 0), 0.9),
  }
  evidence = _as_list(seed.get("evidence"))
  residual_evidence = [
    {
      "field": keyword["field"],
      "value": keyword["value"],
      "confidence": keyword["confidence"],
      "sourceType": TITLE_INFERENCE_SOURCE,
      "matchedToken": keyword["matchedToken"],
      "hardFilterEligible": False,
    }
    for keyword in residual_keywords
  ]
  retail_presence = seed.get("retailPresence") if isinstance(seed.get("retailPresence"), dict) else {}
  catalog_item = {
    "id": _stable_id(seed),
    "sourceCandidateId": _clean(seed.get("sourceCandidateId")),
    "sourceGrain": _clean(seed.get("sourceGrain")) or "naver_brand_category_top10_candidate",
    "productPrecision": _clean(seed.get("productPrecision")) or "product",
    "brandName": brand_name,
    "productName": product_name,
    "normalizedProductName": normalized_name,
    "rawTitle": raw_title,
    "residualTitleKeywords": residual_keywords,
    "category": category,
    "shadeOptions": _as_list(seed.get("shadeOptions")),
    "attributes": {
      "colorFamily": attributes.get("colorFamily"),
      "undertone": attributes.get("undertone"),
      "intensity": attributes.get("intensity"),
      "finish": attributes.get("finish"),
      "texture": attributes.get("texture"),
      "suitableFor": _as_text_list(attributes.get("suitableFor")),
      "sellingPoints": _as_text_list(attributes.get("sellingPoints")),
    },
    "liveOffer": {
      "priceKrw": price_krw,
      "priceTier": price_tier,
      "purchaseUrl": purchase_url,
      "imageUrl": image_url,
    },
    "retailPresence": {
      "oliveYoung": _retail_status(retail_presence, "oliveYoung"),
      "departmentStore": _retail_status(retail_presence, "departmentStore"),
    },
    "brandOrigin": seed.get("brandOrigin") if isinstance(seed.get("brandOrigin"), dict) else {},
    "attributeConfidence": confidence,
    "hardFilterEligible": hard_filter_eligible,
    "evidence": evidence + residual_evidence,
    "evidenceSourceTypes": _evidence_source_types(evidence + residual_evidence),
    "qualityFlags": _quality_flags(product_name),
    "palette": _palette_for_item(
      {
        "attributes": attributes,
        "shadeOptions": _as_list(seed.get("shadeOptions")),
        "category": category,
      },
    ),
    "collectionStatus": _clean(seed.get("collectionStatus")) or "partial",
    "schema": "AuradinMvpCatalogItem.20260703.v1",
    "updatedAt": _clean(seed.get("updatedAt")) or "2026-07-03T00:00:00+09:00",
  }
  return catalog_item


def build_mvp_catalog(seed_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
  items = [item for row in seed_rows if (item := build_mvp_catalog_item(row))]
  return sorted(items, key=lambda item: (item["category"], item["brandName"], item["productName"], item["id"]))


def _confidence_subset(item: dict[str, Any], fields: list[str]) -> dict[str, float]:
  confidence = item.get("attributeConfidence") if isinstance(item.get("attributeConfidence"), dict) else {}
  return {field: float(confidence.get(field) or 0) for field in fields}


def _hard_subset(item: dict[str, Any], fields: list[str]) -> dict[str, bool]:
  hard = item.get("hardFilterEligible") if isinstance(item.get("hardFilterEligible"), dict) else {}
  return {field: bool(hard.get(field)) for field in fields}


def _soft_only_fields(item: dict[str, Any], fields: list[str]) -> list[str]:
  hard = _hard_subset(item, fields)
  values = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
  soft_fields: list[str] = []
  for field in fields:
    value = values.get(field)
    has_value = bool(value) if isinstance(value, list) else value not in {None, ""}
    if has_value and not hard.get(field):
      soft_fields.append(field)
  return soft_fields


def _base_chunk(item: dict[str, Any], chunk_type: str, text: str, fields: list[str]) -> dict[str, Any]:
  return {
    "chunkId": f"{item['id']}:{chunk_type}",
    "catalogItemId": item["id"],
    "sourceCandidateId": item.get("sourceCandidateId"),
    "chunkType": chunk_type,
    "text": text,
    "fields": fields,
    "confidence": _confidence_subset(item, fields),
    "hardFilterEligible": _hard_subset(item, fields),
    "softOnlyFields": _soft_only_fields(item, fields),
    "evidenceSourceTypes": item.get("evidenceSourceTypes", []),
    "category": item.get("category"),
    "brandName": item.get("brandName"),
    "priceKrw": item.get("liveOffer", {}).get("priceKrw"),
    "priceTier": item.get("liveOffer", {}).get("priceTier"),
    "updatedAt": item.get("updatedAt"),
  }


def build_knowledge_chunks_for_item(item: dict[str, Any]) -> list[dict[str, Any]]:
  attrs = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
  live_offer = item.get("liveOffer") if isinstance(item.get("liveOffer"), dict) else {}
  retail = item.get("retailPresence") if isinstance(item.get("retailPresence"), dict) else {}
  brand_origin = item.get("brandOrigin") if isinstance(item.get("brandOrigin"), dict) else {}
  shade_options = _as_list(item.get("shadeOptions"))
  residual = item.get("residualTitleKeywords") if isinstance(item.get("residualTitleKeywords"), list) else []
  chunks = [
    _base_chunk(
      item,
      "product_overview",
      (
        f"{item['brandName']} {item['productName']}. "
        f"카테고리 {item['category']}. 가격대 {live_offer.get('priceTier')} "
        f"({live_offer.get('priceKrw')}원). 구매 가능한 이미지와 링크가 확인된 상품."
      ),
      ["category", "priceKrw", "priceTier", "imageUrl", "purchaseUrl"],
    ),
  ]

  color_bits = [
    f"대표 색상군 {attrs.get('colorFamily')}" if attrs.get("colorFamily") else "",
    f"톤 단서 {attrs.get('undertone')}" if attrs.get("undertone") else "",
    f"발색 단서 {attrs.get('intensity')}" if attrs.get("intensity") else "",
    f"옵션 {len(shade_options)}개" if shade_options else "",
  ]
  shade_names = [
    _clean(shade.get("shadeName") or shade.get("optionName"))
    for shade in shade_options[:8]
    if isinstance(shade, dict) and _clean(shade.get("shadeName") or shade.get("optionName"))
  ]
  if any(color_bits) or shade_names:
    chunks.append(
      _base_chunk(
        item,
        "shade_color",
        " ".join(
          [
            f"{item['brandName']} {item['productName']} 색상 단서.",
            " ".join(bit for bit in color_bits if bit),
            f"확인된 옵션 예: {', '.join(shade_names)}." if shade_names else "",
            "title residual 값은 soft preference 근거로만 사용.",
          ],
        ).strip(),
        ["colorFamily", "undertone", "intensity", "shadeOptions"],
      ),
    )

  finish_bits = [
    f"마무리감 {attrs.get('finish')}" if attrs.get("finish") else "",
    f"제형 {attrs.get('texture')}" if attrs.get("texture") else "",
  ]
  if any(finish_bits):
    chunks.append(
      _base_chunk(
        item,
        "finish_texture",
        f"{item['brandName']} {item['productName']} 질감 단서. {' '.join(bit for bit in finish_bits if bit)}.",
        ["finish", "texture"],
      ),
    )

  suitable = _as_text_list(attrs.get("suitableFor"))
  selling = _as_text_list(attrs.get("sellingPoints"))
  residual_values = [f"{kw.get('field')}={kw.get('value')}" for kw in residual[:8]]
  if suitable or selling or residual_values:
    chunks.append(
      _base_chunk(
        item,
        "suitability_claims",
        " ".join(
          [
            f"{item['brandName']} {item['productName']} 사용 맥락 단서.",
            f"추천 맥락 {', '.join(suitable)}." if suitable else "",
            f"판매 문구 단서 {', '.join(selling)}." if selling else "",
            f"제품명 residual soft keyword {', '.join(residual_values)}." if residual_values else "",
          ],
        ).strip(),
        ["suitableFor", "sellingPoints"],
      ),
    )

  olive = retail.get("oliveYoung") if isinstance(retail.get("oliveYoung"), dict) else {}
  department = retail.get("departmentStore") if isinstance(retail.get("departmentStore"), dict) else {}
  retail_bits = ["현재 확인된 구매 링크, 이미지, 가격이 있음."]
  if _as_bool(olive.get("listed")):
    retail_bits.append("올리브영 positive listing 근거가 있음.")
  if _as_bool(department.get("listed")):
    retail_bits.append("백화점 또는 백화점 계열몰 positive listing 근거가 있음.")
  if brand_origin.get("brandCountry"):
    retail_bits.append(f"브랜드 국가 단서 {brand_origin.get('brandCountry')}.")
  if brand_origin.get("madeInCountry"):
    retail_bits.append(f"제조국 근거 {brand_origin.get('madeInCountry')}.")
  chunks.append(
    _base_chunk(
      item,
      "retail_origin",
      f"{item['brandName']} {item['productName']} 구매/출처 단서. {' '.join(retail_bits)}",
      ["oliveYoungListed", "departmentStoreListed", "brandCountry", "madeInCountry"],
    ),
  )

  return chunks


def build_knowledge_chunks(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
  chunks: list[dict[str, Any]] = []
  for item in items:
    chunks.extend(build_knowledge_chunks_for_item(item))
  return chunks


def build_quality_summary(seed_count: int, items: list[dict[str, Any]], chunks: list[dict[str, Any]]) -> dict[str, Any]:
  field_counts: Counter[str] = Counter()
  hard_counts: Counter[str] = Counter()
  residual_counts: Counter[str] = Counter()
  flag_counts: Counter[str] = Counter()
  category_counts: Counter[str] = Counter()

  for item in items:
    category_counts[item.get("category", "unknown")] += 1
    attrs = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
    hard = item.get("hardFilterEligible") if isinstance(item.get("hardFilterEligible"), dict) else {}
    for field in ("colorFamily", "undertone", "intensity", "finish", "texture"):
      if attrs.get(field):
        field_counts[field] += 1
      if hard.get(field):
        hard_counts[field] += 1
    for field in ("suitableFor", "sellingPoints"):
      if _as_text_list(attrs.get(field)):
        field_counts[field] += 1
    for keyword in item.get("residualTitleKeywords", []):
      if isinstance(keyword, dict):
        residual_counts[_clean(keyword.get("field"))] += 1
    for flag in item.get("qualityFlags", []):
      flag_counts[flag] += 1

  return {
    "seedRows": seed_count,
    "mvpCatalogRows": len(items),
    "chunkRows": len(chunks),
    "categoryCounts": dict(category_counts),
    "fieldCounts": dict(field_counts),
    "hardFilterEligibleCounts": dict(hard_counts),
    "residualKeywordCounts": dict(residual_counts),
    "qualityFlagCounts": dict(flag_counts),
  }
