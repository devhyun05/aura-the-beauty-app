from __future__ import annotations

import pytest

from app.services.auradin_catalog.enrichment_queue import build_brand_category_top_queue


def _candidate(
  candidate_id: str,
  *,
  brand: str,
  category: str,
  score: float,
  query_rank: int,
) -> dict[str, object]:
  return {
    "brandNormalized": brand,
    "category": category,
    "id": candidate_id,
    "imageUrl": f"https://example.com/{candidate_id}.jpg",
    "link": f"https://example.com/{candidate_id}",
    "lprice": 10000 + query_rank,
    "mallName": "테스트몰",
    "popularityScore": score,
    "queryRank": query_rank,
    "title": f"{brand} {category} {candidate_id}",
  }


def test_build_brand_category_top_queue_limits_each_brand_category_group() -> None:
  candidates = [
    _candidate("romand-lip-1", brand="롬앤", category="lip", score=95, query_rank=1),
    _candidate("romand-lip-2", brand="롬앤", category="lip", score=90, query_rank=2),
    _candidate("romand-lip-3", brand="롬앤", category="lip", score=85, query_rank=3),
    _candidate("romand-shadow-1", brand="롬앤", category="shadow", score=80, query_rank=1),
    _candidate("clio-lip-1", brand="클리오", category="lip", score=88, query_rank=1),
  ]

  queue = build_brand_category_top_queue(
    candidates,
    fetched_at="2026-07-02T00:00:00+09:00",
    per_group_limit=2,
    brands=["롬앤", "클리오"],
    categories=["lip", "shadow"],
  )

  assert [row["candidateId"] for row in queue] == [
    "romand-lip-1",
    "romand-lip-2",
    "romand-shadow-1",
    "clio-lip-1",
  ]
  assert queue[0]["coverageTarget"] == {
    "brand": "롬앤",
    "category": "lip",
    "rankInGroup": 1,
    "perGroupLimit": 2,
  }
  assert all(row["parserVersion"] == "auradin-brand-category-top-v1" for row in queue)


def test_build_brand_category_top_queue_requires_positive_limit() -> None:
  with pytest.raises(ValueError, match="per_group_limit"):
    build_brand_category_top_queue(
      [],
      fetched_at="2026-07-02T00:00:00+09:00",
      per_group_limit=0,
    )
