"""Current-season discovery backed by trend signals and real shopping results.

The live shelf is a local-development bridge until licensed catalog ingestion is
configured.  It never represents external products as trusted catalog records.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import time
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.settings import Settings
from app.services.product_trends import NaverShoppingInsightProvider, TrendRequest
from app.services.shopping_products import fetch_live_naver_products_for_queries


@dataclass(frozen=True)
class SeasonalTheme:
  slug: str
  title: str
  summary: str
  signal_keyword: str
  queries: dict[str, str]
  reason: str


DEFAULT_CATEGORY_QUERIES = {
  "base": "쿠션 파운데이션 베이스 화장품",
  "shadow": "아이섀도우 팔레트 화장품",
  "brow": "아이브로우 펜슬 화장품",
  "cheek": "블러셔 치크 화장품",
  "lip": "립틴트 립스틱 화장품",
  "liner": "아이라이너 화장품",
}


THEMES = (
  SeasonalTheme(
    slug="glossy-lip-flushed-cheek",
    title="글로시 립 & 플러시 치크",
    summary="맑게 빛나는 립과 자연스럽게 달아오른 치크를 중심으로 고른 2026 여름 메이크업 상품이에요.",
    signal_keyword="립글로스",
    queries={
      "lip": "2026 여름 립글로스 글로시 틴트",
      "cheek": "크림 블러셔 촉촉 치크",
      "base": "글로우 쿠션 파운데이션",
      "shadow": "쉬머 아이섀도우 글리터",
      "brow": "여름 지속력 아이브로우 펜슬",
      "liner": "여름 지속력 브라운 아이라이너",
    },
    reason="2026 여름의 글로시 립·플러시 치크 흐름과 맞는 상품이에요.",
  ),
  SeasonalTheme(
    slug="waterproof-reflective-eye",
    title="워터프루프 & 리플렉티브 아이",
    summary="습도와 땀에 강한 아이 메이크업에 빛을 받는 쉬머 포인트를 더한 여름 상품이에요.",
    signal_keyword="워터프루프 마스카라",
    queries={
      "liner": "워터프루프 아이라이너 여름",
      "shadow": "쉬머 글리터 아이섀도우",
      "base": "롱래스팅 쿠션 여름",
      "lip": "워터 틴트 글로시",
      "brow": "워터프루프 아이브로우 마스카라",
      "cheek": "여름 지속력 크림 블러셔",
    },
    reason="여름철 지속력과 반사광 포인트 흐름에 맞는 상품이에요.",
  ),
  SeasonalTheme(
    slug="soft-blur-skin",
    title="소프트 블러 스킨",
    summary="두껍지 않은 세미매트 베이스와 부드러운 블러 립으로 완성하는 여름 피부 표현이에요.",
    signal_keyword="세미매트 쿠션",
    queries={
      "base": "세미매트 쿠션 블러 파운데이션",
      "lip": "블러 틴트 소프트 매트",
      "cheek": "파우더 블러셔 블러 치크",
      "shadow": "매트 아이섀도우 팔레트",
      "brow": "내추럴 브로우 펜슬",
      "liner": "소프트 브라운 아이라이너",
    },
    reason="얇은 세미매트 피부와 소프트 블러 메이크업 흐름에 맞는 상품이에요.",
  ),
)

SOURCE_LABELS = ["Allure Summer Makeup Trends 2026", "Who What Wear Summer Beauty 2026"]
SOURCE_LINKS = [
  "https://www.allure.com/story/summer-makeup-trends-2026",
  "https://www.whowhatwear.com/beauty/makeup/summer-makeup-trends-2026",
]
_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


def _series_score(series: dict[str, Any]) -> float:
  points = series.get("data") if isinstance(series, dict) else None
  ratios = [float(point.get("ratio", 0)) for point in points or [] if isinstance(point, dict)]
  if not ratios:
    return float("-inf")
  recent = ratios[-7:]
  previous = ratios[-14:-7]
  recent_average = sum(recent) / len(recent)
  previous_average = sum(previous) / len(previous) if previous else recent_average
  return recent_average + (recent_average - previous_average) * 2


async def _select_theme(settings: Settings, now: datetime) -> tuple[SeasonalTheme, str]:
  provider = NaverShoppingInsightProvider(settings)
  try:
    result = await provider.get_keyword_trends(
      TrendRequest(
        keywords=tuple(theme.signal_keyword for theme in THEMES),
        start_date=(now - timedelta(days=28)).date().isoformat(),
        end_date=now.date().isoformat(),
        category="50000002",
      )
    )
  except (httpx.HTTPError, ValueError):
    return THEMES[0], "editorialFallback"
  if result.get("status") != "ready":
    return THEMES[0], "editorialFallback"
  scores: dict[str, float] = {}
  for series in result.get("series", []):
    keyword = str(series.get("title") or series.get("keyword") or "").strip()
    scores[keyword] = _series_score(series)
  selected = max(THEMES, key=lambda theme: scores.get(theme.signal_keyword, float("-inf")))
  if scores.get(selected.signal_keyword, float("-inf")) == float("-inf"):
    return THEMES[0], "editorialFallback"
  return selected, "shoppingInsight"


def _map_product(product: dict[str, Any], *, theme: SeasonalTheme, generated_at: datetime) -> dict[str, Any]:
  purchase_url = str(product.get("purchaseUrl") or "")
  seller_domain = (urlparse(purchase_url).hostname or "").lower()
  return {
    "productId": product["id"],
    "shadeId": None,
    "brandName": product["brandName"],
    "productName": product["productName"],
    "category": product["category"],
    "shadeName": None,
    "shadeHex": None,
    "finish": None,
    "imageUrl": product.get("imageUrl"),
    "price": {
      "amount": product.get("price") or None,
      "currency": "KRW",
      "updatedAt": generated_at,
    },
    "offer": {
      "offerId": f"external-{product['id']}",
      "sellerName": product.get("sellerName") or seller_domain,
      "sellerDomain": seller_domain,
      "availability": "external",
      "affiliateType": "none",
      "disclosureLabel": None,
    },
    "viewerState": {"liked": False},
    "sourceUpdatedAt": generated_at,
    "sponsored": False,
    "sponsorshipType": "organic",
    "reasonCodes": ["CURRENT_SEASON_TREND"],
    "reasonLabels": [theme.reason],
    "status": "active",
    "purchaseUrl": purchase_url,
    "canLike": True,
    "externalSource": "naver_shopping_search",
  }


async def get_live_seasonal_recommendations(
  settings: Settings,
  *,
  locale: str,
  limit: int,
  now: datetime | None = None,
) -> dict[str, Any]:
  generated_at = now or datetime.now(timezone.utc)
  cache_key = f"{locale}:{limit}"
  cached = _CACHE.get(cache_key)
  if cached and cached[0] > time.monotonic():
    return cached[1]
  theme, provider_status = await _select_theme(settings, generated_at)
  queries = {**DEFAULT_CATEGORY_QUERIES, **theme.queries}
  products = await fetch_live_naver_products_for_queries(settings, queries, per_category=3)
  items = [_map_product(product, theme=theme, generated_at=generated_at) for product in products[:limit]]
  response = {
    "status": "ready" if items else "empty",
    "collection": {
      "id": f"live-{theme.slug}",
      "slug": theme.slug,
      "title": theme.title,
      "summary": theme.summary,
      "validFrom": datetime(generated_at.year, 6, 1, tzinfo=timezone.utc),
      "validUntil": datetime(generated_at.year, 9, 1, tzinfo=timezone.utc),
      "reviewedAt": datetime(2026, 7, 13, tzinfo=timezone.utc),
      "sourceLabels": SOURCE_LABELS,
      "sourceLinks": SOURCE_LINKS,
      "sourceUpdatedAt": generated_at,
      "trendWindow": "최근 28일 쇼핑 클릭 변화" if provider_status == "shoppingInsight" else "2026 여름 에디토리얼 흐름",
      "revision": 1,
      "isStale": False,
      "isLive": True,
      "providerStatus": provider_status,
      "refreshAfterSeconds": settings.product_live_seasonal_cache_seconds,
    },
    "items": items,
    "nextCursor": None,
  }
  _CACHE[cache_key] = (time.monotonic() + settings.product_live_seasonal_cache_seconds, response)
  return response


async def resolve_live_external_product(
  settings: Settings,
  *,
  external_source: str,
  external_product_id: str,
  locale: str = "ko-KR",
) -> dict[str, Any] | None:
  """Resolve bookmark metadata from server-owned live results, never client payload."""
  if external_source != "naver_shopping_search":
    return None
  for _, response in _CACHE.values():
    for item in response.get("items", []):
      if item.get("externalSource") == external_source and item.get("productId") == external_product_id:
        return item
  response = await get_live_seasonal_recommendations(settings, locale=locale, limit=30)
  return next(
    (
      item for item in response.get("items", [])
      if item.get("externalSource") == external_source and item.get("productId") == external_product_id
    ),
    None,
  )
