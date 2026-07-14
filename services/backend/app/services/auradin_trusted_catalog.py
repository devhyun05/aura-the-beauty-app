"""Adapter from the rights-checked product catalog to AURADIN's ranker shape."""

from __future__ import annotations

from typing import Any

from app.db.session import Database
from app.services.auradin_agent.knowledge_chunk_builder import price_tier_for
from app.services.product_catalog import ELIGIBLE_PRODUCT_WHERE, catalog_select


async def load_trusted_auradin_items(
  db: Database,
  *,
  limit: int = 300,
  offer_max_age_hours: int = 168,
) -> list[dict[str, Any]]:
  if not db.is_connected or not callable(getattr(db, "fetch", None)):
    return []
  rows = await db.fetch(
    f"""
    {catalog_select(offer_max_age_placeholder="$2")}
    where {ELIGIBLE_PRODUCT_WHERE} and s.id is not null and a.id is not null and o.id is not null
    order by p.updated_at desc limit $1
    """,
    limit,
    offer_max_age_hours,
  )
  items: list[dict[str, Any]] = []
  for row in rows:
    price = int(row.get("price_amount") or 0)
    image_url = str(row.get("image_url") or "").strip()
    offer_id = str(row.get("offer_id") or "").strip()
    if price <= 0 or not image_url or not offer_id:
      continue
    color_family = str(row.get("color_family") or "").strip()
    finish = str(row.get("finish") or "").strip()
    evidence_confidence = max(0.0, min(1.0, float(row.get("evidence_confidence") or 0)))
    attributes = {
      "colorFamily": color_family or None,
      "finish": finish or None,
      "coverage": str(row.get("coverage") or "").strip() or None,
      "sellingPoints": [],
    }
    items.append(
      {
        "id": str(row["product_id"]),
        "brandName": str(row.get("brand_name") or ""),
        "productName": str(row.get("product_name") or ""),
        "category": str(row.get("category") or ""),
        "attributes": attributes,
        "attributeConfidence": {
          "colorFamily": evidence_confidence,
          "finish": evidence_confidence,
          "coverage": evidence_confidence,
        },
        "hardFilterEligible": {
          "category": True,
          "priceKrw": True,
          "colorFamily": bool(color_family and evidence_confidence >= 0.6),
          "finish": bool(finish and evidence_confidence >= 0.6),
          "coverage": bool(attributes["coverage"] and evidence_confidence >= 0.6),
        },
        "shadeOptions": [
          {
            "shadeId": str(row.get("shade_id") or ""),
            "shadeName": str(row.get("shade_name") or ""),
          }
        ],
        "palette": [str(row.get("srgb_hex"))] if row.get("srgb_hex") else [],
        "liveOffer": {
          "priceKrw": price,
          "priceTier": price_tier_for(price),
          "imageUrl": image_url,
          # The client never receives the raw seller URL. It routes through
          # ProductDetail and the validated outbound endpoint instead.
          "offerId": offer_id,
        },
        "sourceEvidence": {
          "catalogVersion": str(row.get("catalog_version") or "catalog_v2"),
          "shadeEvidenceType": str(row.get("evidence_type") or ""),
        },
      }
    )
  return items
