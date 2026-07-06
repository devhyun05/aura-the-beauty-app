from __future__ import annotations

from collections import defaultdict
from typing import Any

from .brand_aliases import BRAND_PRIORITY
from .category_queries import CATEGORY_PRIORITY


def _rank_score(query_rank: int) -> float:
  return max(0.0, 100.0 - (query_rank - 1) * 8.0)


def _brand_score(brand: str) -> float:
  priority = BRAND_PRIORITY.get(brand, 99)

  return max(0.0, 100.0 - (priority - 1) * 4.0)


def _category_score(category: str) -> float:
  priority = CATEGORY_PRIORITY.get(category, 9)

  return max(0.0, 100.0 - priority * 18.0)


def dedupe_and_rank_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
  grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)

  for candidate in candidates:
    grouped[str(candidate.get("id"))].append(candidate)

  ranked: list[dict[str, Any]] = []

  for candidate_id, items in grouped.items():
    best = sorted(
      items,
      key=lambda item: (
        item.get("queryRank", 999),
        -int(item.get("lprice") or 0),
      ),
    )[0]
    repeat_score = min(100.0, 70.0 + (len(items) - 1) * 15.0)
    naver_score = _rank_score(int(best.get("queryRank") or 999))
    brand_priority_score = _brand_score(str(best.get("brandNormalized") or ""))
    category_priority_score = _category_score(str(best.get("category") or "other"))
    offer_score = 100.0 if best.get("link") and best.get("imageUrl") and best.get("lprice") else 0.0
    popularity_score = round(
      0.45 * naver_score +
      0.20 * repeat_score +
      0.15 * brand_priority_score +
      0.15 * category_priority_score +
      0.05 * offer_score,
      2,
    )
    ranked.append(
      {
        **best,
        "id": candidate_id,
        "popularityScore": popularity_score,
        "popularityEvidence": {
          "bestQuery": best.get("query"),
          "bestQueryRank": best.get("queryRank"),
          "duplicateCount": len(items),
          "naverRankScore": round(naver_score, 2),
          "brandPriorityScore": round(brand_priority_score, 2),
          "categoryPriorityScore": round(category_priority_score, 2),
        },
      },
    )

  return sorted(
    ranked,
    key=lambda item: (
      -float(item.get("popularityScore") or 0),
      str(item.get("category") or ""),
      str(item.get("brandNormalized") or ""),
      str(item.get("title") or ""),
    ),
  )
