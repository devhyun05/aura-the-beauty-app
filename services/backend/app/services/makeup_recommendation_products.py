"""Attach verified catalog products to generated makeup area guides."""

import asyncio
from copy import deepcopy
import logging
from typing import Any

from app.core.settings import Settings
from app.db.session import Database
from app.schemas.makeup_recommendation import GeneratedMakeupRecommendationV2
from app.services.shopping_products import build_product_recommendation_data


logger = logging.getLogger(__name__)

AREA_CATEGORY = {
  "base": "base",
  "brow": "brow",
  "eye": "shadow",
  "cheek": "cheek",
  "lip": "lip",
}
MAX_PRODUCTS_PER_AREA = 1


def _clean_text(value: Any) -> str:
  return " ".join(str(value or "").split()).strip()


def _text_list(value: Any) -> list[str]:
  return [_clean_text(item) for item in value if _clean_text(item)] if isinstance(value, list) else []


def _build_product_profile(
  context_snapshot: dict[str, Any],
  answers: list[dict[str, Any]],
  look: dict[str, Any],
  guide: dict[str, Any],
) -> dict[str, Any]:
  selection = context_snapshot.get("selection") if isinstance(context_snapshot.get("selection"), dict) else {}
  situation = selection.get("situation") if isinstance(selection.get("situation"), dict) else {}
  keyword = selection.get("keyword") if isinstance(selection.get("keyword"), dict) else {}
  color = guide.get("color") if isinstance(guide.get("color"), dict) else {}
  analysis = context_snapshot.get("analysisReport") if isinstance(context_snapshot.get("analysisReport"), dict) else {}
  answer_text = " ".join(
    part
    for answer in answers
    if isinstance(answer, dict)
    for part in (
      _clean_text(answer.get("optionLabel")),
      _clean_text(answer.get("freeText")),
    )
    if part
  )
  title = _clean_text(look.get("title"))
  guide_copy = " ".join(
    part for part in (
      _clean_text(guide.get("label")),
      _clean_text(guide.get("goal")),
      _clean_text(color.get("name")),
      _clean_text(guide.get("texture")),
      _clean_text(guide.get("placement")),
      _clean_text(guide.get("technique")),
      _clean_text(guide.get("reason")),
    ) if part
  )
  context_copy = " ".join(
    part for part in (
      _clean_text(situation.get("label")),
      _clean_text(keyword.get("label")),
      _clean_text(selection.get("customSituationText")),
      _clean_text(look.get("summary")),
      guide_copy,
      answer_text,
      _clean_text(analysis.get("personalColor")),
      _clean_text(analysis.get("skinType")),
    ) if part
  )
  tags = [
    *_text_list(look.get("appliedConditions")),
    *_text_list(keyword.get("tags")),
    _clean_text(color.get("name")),
    _clean_text(guide.get("texture")),
  ]
  tags = [tag for tag in tags if tag]
  return {
    "recommendedMood": title,
    "summary": context_copy,
    "shortSummary": guide_copy,
    "tags": tags,
    "makeupGuideline": {
      "area": _clean_text(guide.get("label")),
      "title": _clean_text(guide.get("goal")),
      "color": _clean_text(color.get("name")),
      "texture": _clean_text(guide.get("texture")),
      "howTo": _clean_text(guide.get("technique")),
      "professionalPoint": _clean_text(guide.get("placement")),
      "productReason": _clean_text(guide.get("reason")),
    },
    "recommendedMakeups": [{
      "title": title,
      "description": context_copy,
      "tags": tags,
      "palette": [_clean_text(color.get("hex"))] if _clean_text(color.get("hex")) else [],
    }],
  }


def _map_product(product: dict[str, Any], area: str, guide: dict[str, Any]) -> dict[str, Any] | None:
  product_id = _clean_text(product.get("id"))
  product_name = _clean_text(product.get("productName"))
  if not product_id or not product_name:
    return None
  price = product.get("price")
  match_rate = product.get("matchRate")
  return {
    "id": product_id[:160],
    "area": area,
    "brandName": (_clean_text(product.get("brandName")) or "브랜드 정보 없음")[:100],
    "productName": product_name[:200],
    "shadeName": (_clean_text(product.get("shadeName")) or None),
    "reason": (_clean_text(product.get("reason")) or _clean_text(guide.get("reason")) or "추천 룩의 색감과 질감에 맞는 제품이에요.")[:240],
    "price": max(0, int(price)) if isinstance(price, int | float) else None,
    "imageUrl": _clean_text(product.get("imageUrl")) or None,
    "purchaseUrl": _clean_text(product.get("purchaseUrl")) or None,
    "matchRate": max(0, min(100, int(match_rate))) if isinstance(match_rate, int | float) else None,
  }


async def enrich_makeup_recommendation_products(
  db: Database,
  settings: Settings,
  recommendation: dict[str, Any],
  context_snapshot: dict[str, Any],
  answers: list[dict[str, Any]],
) -> dict[str, Any]:
  """Match each generated area guide to verified catalog records without inventing products."""
  enriched = deepcopy(recommendation)
  looks = enriched.get("looks") if isinstance(enriched.get("looks"), list) else []
  jobs: list[tuple[dict[str, Any], dict[str, Any], str, Any]] = []

  # Deterministic catalog scoring consumes the generated profile. Disabling per-product
  # embeddings avoids dozens of extra Bedrock calls for a single recommendation.
  catalog_settings = settings.model_copy(update={"bedrock_embedding_model_id": None})
  for look in looks:
    if not isinstance(look, dict):
      continue
    guides = look.get("areaGuides") if isinstance(look.get("areaGuides"), list) else []
    for guide in guides:
      if not isinstance(guide, dict):
        continue
      area = _clean_text(guide.get("area"))
      category = AREA_CATEGORY.get(area)
      if not category:
        guide["products"] = []
        continue
      profile = _build_product_profile(context_snapshot, answers, look, guide)
      color = guide.get("color") if isinstance(guide.get("color"), dict) else {}
      query = " ".join(
        part for part in (
          _clean_text(color.get("name")),
          _clean_text(guide.get("texture")),
          _clean_text(guide.get("label")),
        ) if part
      )
      job = build_product_recommendation_data(
        db,
        catalog_settings,
        category,
        profile_override=profile,
        query_override=query or None,
      )
      jobs.append((look, guide, area, job))

  if not jobs:
    return GeneratedMakeupRecommendationV2.model_validate(enriched).model_dump(by_alias=True)

  results = await asyncio.gather(*(job for *_metadata, job in jobs), return_exceptions=True)
  sources: set[str] = set()
  for (look, guide, area, _job), result in zip(jobs, results):
    products: list[dict[str, Any]] = []
    if isinstance(result, Exception):
      logger.warning(
        "[aura:makeup-recommendation] product-enrichment:failed area=%s error=%s",
        area,
        result.__class__.__name__,
      )
    else:
      recommendation_data, source = result
      sources.add(source)
      raw_products = recommendation_data.get("products") if isinstance(recommendation_data, dict) else []
      if isinstance(raw_products, list):
        products = [
          mapped
          for raw in raw_products[:MAX_PRODUCTS_PER_AREA]
          if isinstance(raw, dict)
          if (mapped := _map_product(raw, area, guide)) is not None
        ]
    guide["products"] = products
    look["products"] = [
      product
      for item in look.get("areaGuides", [])
      if isinstance(item, dict)
      for product in item.get("products", [])
      if isinstance(product, dict)
    ][:12]

  logger.info(
    "[aura:makeup-recommendation] product-enrichment:completed sources=%s products=%s",
    sorted(sources),
    sum(
      len(guide.get("products", []))
      for look in looks if isinstance(look, dict)
      for guide in look.get("areaGuides", []) if isinstance(guide, dict)
    ),
  )
  return GeneratedMakeupRecommendationV2.model_validate(enriched).model_dump(by_alias=True)