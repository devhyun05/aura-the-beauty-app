from __future__ import annotations

from typing import Any

from .brand_aliases import BRAND_PRIORITY
from .category_queries import COLLECTABLE_CATEGORIES


CATEGORY_TARGET_FIELDS: dict[str, tuple[str, ...]] = {
  "lip": ("shadeName", "colorFamily", "undertone", "finish", "texture", "intensity"),
  "shadow": ("palette", "colorFamily", "finish", "texture"),
  "base": ("shadeName", "undertone", "finish", "coverage", "skinTypeTags"),
  "cheek": ("colorFamily", "finish", "texture"),
  "liner": ("colorFamily", "texture", "intensity"),
  "brow": ("colorFamily", "texture", "intensity"),
}


def _candidate_sort_key(candidate: dict[str, Any]) -> tuple[float, int, str]:
  return (
    -float(candidate.get("popularityScore") or 0),
    int(candidate.get("queryRank") or 999),
    str(candidate.get("title") or ""),
  )


def _queue_row(
  candidate: dict[str, Any],
  *,
  fetched_at: str,
  parser_version: str,
  priority: int,
  rank_in_group: int | None = None,
  per_group_limit: int | None = None,
) -> dict[str, Any]:
  category = str(candidate.get("category") or "other")
  target_fields = CATEGORY_TARGET_FIELDS.get(category, ("shadeName", "finish", "texture"))
  row = {
    "id": f"enrich-{candidate['id']}",
    "candidateId": candidate["id"],
    "source": "candidate_queue",
    "brand": candidate.get("brandNormalized"),
    "productName": candidate.get("title"),
    "category": category,
    "targetFields": list(target_fields),
    "sourceUrls": [candidate.get("link")],
    "allowedSourceHints": ["brand_official", "oliveyoung", "naver_detail", "manual"],
    "liveOffer": {
      "source": "naver_shopping",
      "link": candidate.get("link"),
      "image": candidate.get("imageUrl"),
      "lprice": candidate.get("lprice"),
      "mallName": candidate.get("mallName"),
      "fetchedAt": fetched_at,
      "ttlSeconds": 86400,
    },
    "evidence": [
      {
        "field": "candidate",
        "value": candidate.get("title"),
        "sourceType": "naver_api",
        "sourceUrl": candidate.get("link"),
        "rawLabel": "title",
        "rawText": candidate.get("title"),
      },
    ],
    "confidence": {
      "brand": 0.7,
      "category": 0.65,
      "liveOffer": 0.8,
    },
    "needsManualReview": True,
    "fetchedAt": fetched_at,
    "parserVersion": parser_version,
    "priority": priority,
    "popularityScore": candidate.get("popularityScore"),
  }

  if rank_in_group is not None and per_group_limit is not None:
    row["coverageTarget"] = {
      "brand": candidate.get("brandNormalized"),
      "category": category,
      "rankInGroup": rank_in_group,
      "perGroupLimit": per_group_limit,
    }

  return row


def build_enrichment_queue(
  candidates: list[dict[str, Any]],
  *,
  fetched_at: str,
  parser_version: str = "auradin-catalog-fixture-v0",
  per_category_limit: int = 20,
) -> list[dict[str, Any]]:
  category_counts: dict[str, int] = {}
  queue: list[dict[str, Any]] = []

  for candidate in candidates:
    category = str(candidate.get("category") or "other")
    category_counts[category] = category_counts.get(category, 0)

    if category_counts[category] >= per_category_limit:
      continue

    category_counts[category] += 1
    queue.append(
      _queue_row(
        candidate,
        fetched_at=fetched_at,
        parser_version=parser_version,
        priority=len(queue) + 1,
      ),
    )

  return queue


def build_brand_category_top_queue(
  candidates: list[dict[str, Any]],
  *,
  fetched_at: str,
  parser_version: str = "auradin-brand-category-top-v1",
  per_group_limit: int = 10,
  brands: list[str] | None = None,
  categories: list[str] | None = None,
) -> list[dict[str, Any]]:
  if per_group_limit <= 0:
    raise ValueError("per_group_limit must be greater than 0")

  ordered_brands = sorted(
    brands or list(BRAND_PRIORITY),
    key=lambda brand: BRAND_PRIORITY.get(brand, 999),
  )
  ordered_categories = categories or list(COLLECTABLE_CATEGORIES)
  grouped: dict[tuple[str, str], list[dict[str, Any]]] = {
    (brand, category): []
    for brand in ordered_brands
    for category in ordered_categories
  }

  for candidate in candidates:
    brand = str(candidate.get("brandNormalized") or "")
    category = str(candidate.get("category") or "")
    key = (brand, category)

    if key in grouped:
      grouped[key].append(candidate)

  queue: list[dict[str, Any]] = []

  for brand in ordered_brands:
    for category in ordered_categories:
      ranked = sorted(grouped[(brand, category)], key=_candidate_sort_key)

      for rank_in_group, candidate in enumerate(ranked[:per_group_limit], start=1):
        queue.append(
          _queue_row(
            candidate,
            fetched_at=fetched_at,
            parser_version=parser_version,
            priority=len(queue) + 1,
            rank_in_group=rank_in_group,
            per_group_limit=per_group_limit,
          ),
        )

  return queue
