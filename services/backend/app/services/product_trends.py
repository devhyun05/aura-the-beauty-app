"""Naver DataLab trend adapters used only by scheduled recommendation jobs."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime
import logging
from typing import Any, Awaitable, Callable, Protocol
from urllib.parse import urlparse

import httpx

from app.core.settings import Settings
from app.services.product_catalog import validate_external_https_url
from app.services.product_trend_quota import TrendCallQuotaLedger


NAVER_DATALAB_HOSTS = ("openapi.naver.com", "naverapihub.apigw.ntruss.com")
logger = logging.getLogger(__name__)
MAX_KEYWORDS_PER_REQUEST = 5
JsonPoster = Callable[[str, dict[str, str], dict[str, Any]], Awaitable[dict[str, Any]]]


@dataclass(frozen=True)
class TrendRequest:
  keywords: tuple[str, ...]
  start_date: str
  end_date: str
  category: str
  time_unit: str = "date"


@dataclass(frozen=True)
class SearchTrendRequest:
  keywords: tuple[str, ...]
  start_date: str
  end_date: str
  time_unit: str = "date"


@dataclass(frozen=True)
class TrendMomentum:
  keyword: str
  source: str
  recent_average: float
  previous_average: float
  momentum: float
  latest_period: str | None


class TrendSignalProvider(Protocol):
  async def get_keyword_trends(self, request: TrendRequest) -> dict[str, Any]: ...


def keyword_batches(keywords: tuple[str, ...], *, size: int = MAX_KEYWORDS_PER_REQUEST) -> tuple[tuple[str, ...], ...]:
  normalized = tuple(dict.fromkeys(value.strip()[:48] for value in keywords if value.strip()))
  return tuple(normalized[index:index + size] for index in range(0, len(normalized), size))


def _auth_headers(settings: Settings, endpoint: str) -> dict[str, str]:
  host = (urlparse(endpoint).hostname or "").lower()
  if host == "naverapihub.apigw.ntruss.com":
    client_id = settings.naver_api_hub_client_id
    client_secret = settings.naver_api_hub_client_secret
    return {
      "X-NCP-APIGW-API-KEY-ID": client_id or "",
      "X-NCP-APIGW-API-KEY": client_secret or "",
    } if client_id and client_secret else {}
  client_id = settings.naver_shopping_client_id
  client_secret = settings.naver_shopping_client_secret
  return {
    "X-Naver-Client-Id": client_id or "",
    "X-Naver-Client-Secret": client_secret or "",
  } if client_id and client_secret else {}


class _NaverPostProvider:
  def __init__(self, settings: Settings, *, poster: JsonPoster | None = None) -> None:
    self.settings = settings
    self._poster = poster or self._post_json

  async def _post_json(self, endpoint: str, headers: dict[str, str], payload: dict[str, Any]) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(self.settings.naver_trend_http_max_attempts):
      try:
        async with httpx.AsyncClient(timeout=self.settings.naver_trend_http_timeout_seconds) as client:
          response = await client.post(endpoint, headers=headers, json=payload)
          response.raise_for_status()
          result = response.json()
          return result if isinstance(result, dict) else {}
      except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as error:
        last_error = error
        status = error.response.status_code if isinstance(error, httpx.HTTPStatusError) else None
        retryable = status in {429, 500, 502, 503, 504, None}
        if not retryable or attempt + 1 >= self.settings.naver_trend_http_max_attempts:
          raise
        await asyncio.sleep(0.2 * (2 ** attempt))
    raise RuntimeError("Naver DataLab retry loop exited unexpectedly") from last_error


class NaverShoppingInsightProvider(_NaverPostProvider):
  """Shopping-click trend adapter; it never returns or ingests products."""

  def _request_parts(self, request: TrendRequest) -> tuple[str, dict[str, str], dict[str, Any]]:
    endpoint = validate_external_https_url(
      str(self.settings.naver_shopping_insight_endpoint),
      NAVER_DATALAB_HOSTS,
      kind="Naver Shopping Insight",
    )
    headers = _auth_headers(self.settings, endpoint)
    if not headers:
      return endpoint, {}, {}
    keywords = keyword_batches(request.keywords)
    selected = keywords[0] if keywords else ()
    if not selected:
      return endpoint, {}, {}
    payload = {
      "startDate": request.start_date,
      "endDate": request.end_date,
      "timeUnit": request.time_unit,
      "category": request.category,
      "keyword": [{"name": keyword, "param": [keyword]} for keyword in selected],
    }
    return endpoint, headers, payload

  async def get_keyword_trends(self, request: TrendRequest) -> dict[str, Any]:
    if not self.settings.naver_shopping_insight_enabled or not self.settings.naver_shopping_insight_endpoint:
      return {"status": "disabled", "series": []}
    endpoint, headers, payload = self._request_parts(request)
    if not headers or not payload:
      return {"status": "disabled", "series": []}
    result = await self._poster(endpoint, headers, payload)
    series = result.get("results", []) if isinstance(result.get("results"), list) else []
    return {"status": "ready", "series": series, "metric": "relative_click_ratio"}


class NaverSearchTrendProvider(_NaverPostProvider):
  """Search Trend adapter using candidate phrases discovered from content."""

  def _request_parts(self, request: SearchTrendRequest) -> tuple[str, dict[str, str], dict[str, Any]]:
    endpoint = validate_external_https_url(
      str(self.settings.naver_search_trend_endpoint),
      NAVER_DATALAB_HOSTS,
      kind="Naver Search Trend",
    )
    headers = _auth_headers(self.settings, endpoint)
    if not headers:
      return endpoint, {}, {}
    batches = keyword_batches(request.keywords)
    selected = batches[0] if batches else ()
    if not selected:
      return endpoint, {}, {}
    payload = {
      "startDate": request.start_date,
      "endDate": request.end_date,
      "timeUnit": request.time_unit,
      "keywordGroups": [
        {"groupName": keyword, "keywords": [keyword]}
        for keyword in selected
      ],
    }
    return endpoint, headers, payload

  async def get_keyword_trends(self, request: SearchTrendRequest) -> dict[str, Any]:
    if not self.settings.naver_search_trend_endpoint:
      return {"status": "disabled", "series": []}
    endpoint, headers, payload = self._request_parts(request)
    if not headers or not payload:
      return {"status": "disabled", "series": []}
    result = await self._poster(endpoint, headers, payload)
    series = result.get("results", []) if isinstance(result.get("results"), list) else []
    return {"status": "ready", "series": series, "metric": "relative_search_ratio"}


def series_momentum(series: dict[str, Any], *, source: str, window_days: int = 7) -> TrendMomentum | None:
  points = series.get("data")
  if not isinstance(points, list):
    return None
  normalized: list[tuple[str, float]] = []
  for point in points:
    if not isinstance(point, dict):
      continue
    try:
      ratio = max(0.0, float(point.get("ratio", 0)))
    except (TypeError, ValueError):
      continue
    normalized.append((str(point.get("period") or ""), ratio))
  if not normalized:
    return None
  normalized.sort(key=lambda value: value[0])
  recent = [value for _, value in normalized[-window_days:]]
  previous = [value for _, value in normalized[-window_days * 2:-window_days]]
  recent_average = sum(recent) / len(recent)
  previous_average = sum(previous) / len(previous) if previous else 0.0
  momentum = (recent_average - previous_average) / max(1.0, previous_average)
  keyword = str(series.get("title") or series.get("keyword") or series.get("groupName") or "").strip()
  if not keyword:
    keywords = series.get("keywords")
    keyword = str(keywords[0]).strip() if isinstance(keywords, list) and keywords else ""
  if not keyword:
    return None
  return TrendMomentum(
    keyword=keyword,
    source=source,
    recent_average=round(recent_average, 4),
    previous_average=round(previous_average, 4),
    momentum=round(momentum, 4),
    latest_period=normalized[-1][0] or None,
  )


class NaverTrendMomentumService:
  """Validate arbitrary discovered candidates in independent batches of five.

  Absolute ratios from different batches are never compared.  Every output is
  the same keyword's recent seven days versus its own previous seven days.
  """

  def __init__(
    self,
    settings: Settings,
    *,
    quota_ledger: TrendCallQuotaLedger | None,
    shopping_provider: NaverShoppingInsightProvider | None = None,
    search_provider: NaverSearchTrendProvider | None = None,
  ) -> None:
    self.settings = settings
    self.quota_ledger = quota_ledger
    self.shopping_provider = shopping_provider or NaverShoppingInsightProvider(settings)
    self.search_provider = search_provider or NaverSearchTrendProvider(settings)

  async def _reserve(self, at: datetime) -> bool:
    if self.quota_ledger is None:
      return False
    try:
      return await self.quota_ledger.reserve(
        "naver",
        at=at,
        monthly_limit=self.settings.naver_trend_monthly_call_limit,
        amount=self.settings.naver_trend_http_max_attempts,
      )
    except Exception:  # noqa: BLE001 - no quota proof means no external call.
      logger.warning("Naver DataLab quota reservation failed", exc_info=True)
      return False

  async def collect(
    self,
    keywords: tuple[str, ...],
    *,
    start_date: str,
    end_date: str,
    shopping_category: str,
    now: datetime,
  ) -> list[TrendMomentum]:
    evidence: list[TrendMomentum] = []
    for batch in keyword_batches(keywords):
      if self.settings.naver_search_trend_endpoint and await self._reserve(now):
        try:
          result = await self.search_provider.get_keyword_trends(SearchTrendRequest(
            keywords=batch,
            start_date=start_date,
            end_date=end_date,
          ))
        except (httpx.HTTPError, ValueError):
          logger.warning("Naver Search Trend batch failed after retry", exc_info=True)
          result = {"series": []}
        evidence.extend(
          momentum
          for series in result.get("series", [])
          if isinstance(series, dict) and (momentum := series_momentum(series, source="naver_search")) is not None
        )
      if self.settings.naver_shopping_insight_enabled and await self._reserve(now):
        try:
          result = await self.shopping_provider.get_keyword_trends(TrendRequest(
            keywords=batch,
            start_date=start_date,
            end_date=end_date,
            category=shopping_category,
          ))
        except (httpx.HTTPError, ValueError):
          logger.warning("Naver Shopping Insight batch failed after retry", exc_info=True)
          result = {"series": []}
        evidence.extend(
          momentum
          for series in result.get("series", [])
          if isinstance(series, dict) and (momentum := series_momentum(series, source="naver_shopping")) is not None
        )
    return evidence
