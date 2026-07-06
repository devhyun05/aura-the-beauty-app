from __future__ import annotations

import hashlib
from collections import Counter
from typing import Any

from .brand_aliases import normalize_brand
from .category_queries import (
  CATEGORY_TERMS,
  COLLECTABLE_CATEGORIES,
  COSMETIC_CATEGORY_TERMS,
  NON_COSMETIC_EXCLUDE_TERMS,
)
from .text import clean_text, parse_price


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
  lowered = text.lower()

  return any(term.lower() in lowered for term in terms)


def _category_text(item: dict[str, Any]) -> str:
  return clean_text(
    " ".join(
      clean_text(item.get(key))
      for key in ("category1", "category2", "category3", "category4")
    ),
  )


def _searchable_text(item: dict[str, Any]) -> str:
  return clean_text(
    " ".join(
      [
        clean_text(item.get("title")),
        clean_text(item.get("brand")),
        clean_text(item.get("maker")),
        clean_text(item.get("mallName")),
        _category_text(item),
      ],
    ),
  )


def infer_category(item: dict[str, Any], requested_category: str | None = None) -> str:
  if requested_category in COLLECTABLE_CATEGORIES:
    return requested_category

  text = _searchable_text(item)

  for category, terms in CATEGORY_TERMS.items():
    if _contains_any(text, terms):
      return category

  return "other"


def _stable_candidate_id(product_id: str, link: str) -> str:
  if product_id:
    return f"naver-{product_id}"

  digest = hashlib.sha1(link.encode("utf-8")).hexdigest()[:12]

  return f"naver-link-{digest}"


def normalize_naver_item(
  item: dict[str, Any],
  *,
  collected_at: str,
  query: str,
  query_rank: int,
  requested_category: str | None = None,
) -> tuple[dict[str, Any] | None, str | None]:
  title = clean_text(item.get("title"))
  link = clean_text(item.get("link"))
  image_url = clean_text(item.get("image"))
  product_id = clean_text(item.get("productId"))
  price = parse_price(item.get("lprice"))

  if not title:
    return None, "missing_title"

  if not link:
    return None, "missing_link"

  if not image_url:
    return None, "missing_image"

  if not product_id:
    return None, "missing_product_id"

  if price <= 0:
    return None, "missing_price"

  searchable_text = _searchable_text(item)

  if _contains_any(searchable_text, NON_COSMETIC_EXCLUDE_TERMS):
    return None, "non_cosmetic_noise"

  brand_normalized = normalize_brand(
    item.get("brand"),
    item.get("maker"),
    item.get("mallName"),
    title,
  )

  if not brand_normalized:
    return None, "brand_not_whitelisted"

  category = infer_category(item, requested_category)
  category_text = _category_text(item)
  category_has_cosmetic_hint = _contains_any(category_text, COSMETIC_CATEGORY_TERMS)
  product_has_category_hint = (
    category in CATEGORY_TERMS and _contains_any(searchable_text, CATEGORY_TERMS[category])
  )

  if category == "other" or (category_text and not category_has_cosmetic_hint and not product_has_category_hint):
    return None, "category_not_cosmetic"

  return {
    "id": _stable_candidate_id(product_id, link),
    "source": "naver_api",
    "naverProductId": product_id,
    "rawTitle": clean_text(item.get("title")),
    "title": title,
    "link": link,
    "imageUrl": image_url,
    "lprice": price,
    "brandRaw": clean_text(item.get("brand")),
    "brandNormalized": brand_normalized,
    "maker": clean_text(item.get("maker")),
    "mallName": clean_text(item.get("mallName")),
    "category": category,
    "category1": clean_text(item.get("category1")),
    "category2": clean_text(item.get("category2")),
    "category3": clean_text(item.get("category3")),
    "category4": clean_text(item.get("category4")),
    "query": clean_text(query),
    "queryRank": query_rank,
    "collectedAt": collected_at,
  }, None


def normalize_naver_fixture(
  fixture: dict[str, Any],
  *,
  collected_at: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], Counter[str]]:
  raw_rows: list[dict[str, Any]] = []
  candidates: list[dict[str, Any]] = []
  rejects: Counter[str] = Counter()
  responses = fixture.get("responses")

  if not isinstance(responses, list):
    return raw_rows, candidates, rejects

  for response in responses:
    if not isinstance(response, dict):
      continue

    query = clean_text(response.get("query"))
    requested_category = clean_text(response.get("category"))
    items = response.get("items") if isinstance(response.get("items"), list) else []

    for index, item in enumerate(items, start=1):
      if not isinstance(item, dict):
        rejects["invalid_item"] += 1
        continue

      raw_rows.append(
        {
          **item,
          "query": query,
          "queryRank": index,
          "collectedAt": collected_at,
          "source": "naver_api_fixture",
        },
      )
      candidate, reason = normalize_naver_item(
        item,
        collected_at=collected_at,
        query=query,
        query_rank=index,
        requested_category=requested_category,
      )

      if candidate:
        candidates.append(candidate)
      elif reason:
        rejects[reason] += 1

  return raw_rows, candidates, rejects
