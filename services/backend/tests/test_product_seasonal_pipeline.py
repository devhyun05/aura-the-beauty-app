from datetime import datetime, timedelta, timezone

import pytest

from app.core.settings import Settings
from app.services.product_seasonal_pipeline import match_trends_to_products
from app.services.product_trend_sources import (
  MCPTrendSourceAdapter,
  TrendSignal,
  TrendSnapshot,
  collect_trend_snapshot,
  normalize_trend_snapshot,
)


NOW = datetime(2026, 7, 16, 12, tzinfo=timezone.utc)


def _snapshot(*signals: TrendSignal) -> TrendSnapshot:
  return TrendSnapshot(
    title="실시간 뷰티 트렌드",
    summary="검증된 트렌드",
    trend_window="최근 28일",
    locale="ko-KR",
    source_name="test-source",
    source_updated_at=NOW,
    signals=signals,
    source_metadata={"provider": "test"},
  )


def test_mcp_trend_normalize_filters_unsafe_and_infers_attributes() -> None:
  snapshot = normalize_trend_snapshot(
    {
      "sourceUpdatedAt": NOW.isoformat(),
      "trends": [
        {"keyword": "글로우 립", "confidenceScore": 1.4},
        {"keyword": "장마철 워터프루프", "categories": ["liner", "unknown"]},
        {"keyword": "성인 광고 공동구매", "categories": ["lip"]},
        {"keyword": "노트북 특가"},
      ],
    },
    adapter_name="mcp",
    locale="ko-KR",
    now=NOW,
    max_age_days=30,
  )
  assert snapshot is not None
  assert snapshot.trend_keywords == ["글로우 립", "장마철 워터프루프"]
  assert snapshot.signals[0].categories == ("lip",)
  assert snapshot.signals[0].finishes == ("glossy",)
  assert snapshot.signals[0].confidence_score == 1.0
  assert snapshot.signals[1].categories == ("liner",)


@pytest.mark.asyncio
async def test_mcp_adapter_accepts_structured_tool_content() -> None:
  calls = []

  async def call_tool(name: str, arguments: dict) -> dict:
    calls.append((name, arguments))
    return {
      "structuredContent": {
        "sourceUpdatedAt": NOW.isoformat(),
        "trends": [{"keyword": "아이돌 물광 피부", "confidenceScore": 0.88}],
      }
    }

  adapter = MCPTrendSourceAdapter(
    Settings(
      product_trend_mcp_url="https://trends.example.com/mcp",
      product_trend_mcp_allowed_hosts="trends.example.com",
    ),
    tool_caller=call_tool,
  )
  payload = await adapter.collect(locale="ko-KR", now=NOW)
  assert payload is not None
  assert payload["sourceName"] == "MCP:collect_beauty_trends"
  assert calls[0][0] == "collect_beauty_trends"
  assert calls[0][1]["category"] == "beauty/makeup"


@pytest.mark.asyncio
async def test_mcp_failure_and_stale_source_fall_through_to_fresh_adapter() -> None:
  class Broken:
    name = "broken-mcp"

    async def collect(self, *, locale: str, now: datetime):
      raise ValueError("tool unavailable")

  class Stale:
    name = "stale-source"

    async def collect(self, *, locale: str, now: datetime):
      return {
        "sourceUpdatedAt": (now - timedelta(days=31)).isoformat(),
        "trends": [{"keyword": "글로우 립"}],
      }

  class Fresh:
    name = "curated-fallback"

    async def collect(self, *, locale: str, now: datetime):
      return {
        "sourceUpdatedAt": now.isoformat(),
        "sourceName": self.name,
        "trends": [{"keyword": "여름 지속력 베이스", "confidenceScore": 0.6}],
      }

  snapshot = await collect_trend_snapshot(
    Settings(product_seasonal_source_max_age_days=30),
    now=NOW,
    adapters=(Broken(), Stale(), Fresh()),  # type: ignore[arg-type]
  )
  assert snapshot.source_name == "curated-fallback"
  assert snapshot.is_stale is False
  assert snapshot.trend_keywords == ["여름 지속력 베이스"]


def test_trend_matching_uses_product_attributes_and_enforces_diversity() -> None:
  snapshot = _snapshot(TrendSignal(
    keyword="글로우 립 로즈",
    categories=("lip",),
    color_families=("rose",),
    finishes=("glossy",),
    tags=("longwear",),
    reason_codes=("SOCIAL_TREND_RISE",),
    confidence_score=0.9,
  ))
  candidates = [
    {
      "product_id": f"product-{index}",
      "brand_name": "Same Brand" if index < 4 else f"Brand {index}",
      "product_name": f"로즈 글로우 틴트 {index}",
      "category": "lip" if index < 5 else "base",
      "color_family": "rose",
      "finish": "glossy",
      "tags": ["longwear"],
      "liked_count": 10 - index,
      "open_count": 4,
      "outbound_count": 2,
    }
    for index in range(7)
  ]
  items = match_trends_to_products(snapshot, candidates, limit=5)
  assert len(items) == 5
  assert len({item["productId"] for item in items}) == 5
  assert all(item["reasonCode"].startswith("TREND_") for item in items[:4])
  selected_same_brand = sum(item["productId"] in {"product-0", "product-1", "product-2", "product-3"} for item in items)
  assert selected_same_brand <= 2


def test_product_shortage_is_filled_with_popular_products() -> None:
  snapshot = _snapshot(TrendSignal(
    keyword="글로우 립",
    categories=("lip",),
    color_families=(),
    finishes=("glossy",),
    tags=(),
    reason_codes=("SHOPPING_CLICK_RISE",),
    confidence_score=0.8,
  ))
  candidates = [
    {"product_id": "trend-lip", "brand_name": "A", "product_name": "글로우 립", "category": "lip", "finish": "glossy"},
    {"product_id": "popular-base", "brand_name": "B", "product_name": "쿠션", "category": "base", "liked_count": 40},
    {"product_id": "popular-brow", "brand_name": "C", "product_name": "브로우", "category": "brow", "outbound_count": 20},
  ]
  items = match_trends_to_products(snapshot, candidates, limit=3)
  assert len(items) == 3
  assert items[0]["productId"] == "trend-lip"
  assert {item["reasonCode"] for item in items[1:]} == {"POPULAR_FALLBACK"}
