from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlparse

import httpx

from app.core.settings import Settings
from app.services.product_catalog import validate_external_https_url


@dataclass(frozen=True)
class TrendRequest:
  keywords: tuple[str, ...]
  start_date: str
  end_date: str
  category: str
  time_unit: str = "date"


class TrendSignalProvider(Protocol):
  async def get_keyword_trends(self, request: TrendRequest) -> dict: ...


class NaverShoppingInsightProvider:
  """Trend-only adapter. It never returns or ingests product catalog rows."""

  def __init__(self, settings: Settings) -> None:
    self.settings = settings

  def _request_parts(self, request: TrendRequest) -> tuple[str, dict[str, str], dict]:
    endpoint = validate_external_https_url(
      str(self.settings.naver_shopping_insight_endpoint),
      ("openapi.naver.com", "naverapihub.apigw.ntruss.com"),
      kind="Naver Shopping Insight",
    )
    host = (urlparse(endpoint).hostname or "").lower()
    if host == "naverapihub.apigw.ntruss.com":
      client_id = self.settings.naver_api_hub_client_id
      client_secret = self.settings.naver_api_hub_client_secret
      headers = {
        "X-NCP-APIGW-API-KEY-ID": client_id or "",
        "X-NCP-APIGW-API-KEY": client_secret or "",
      }
    else:
      client_id = self.settings.naver_shopping_client_id
      client_secret = self.settings.naver_shopping_client_secret
      headers = {
        "X-Naver-Client-Id": client_id or "",
        "X-Naver-Client-Secret": client_secret or "",
      }
    if not client_id or not client_secret:
      return endpoint, {}, {}
    keywords = tuple(dict.fromkeys(value.strip() for value in request.keywords if value.strip()))[:5]
    if not keywords:
      return endpoint, {}, {}
    payload = {
      "startDate": request.start_date,
      "endDate": request.end_date,
      "timeUnit": request.time_unit,
      "category": request.category,
      "keyword": [{"name": keyword, "param": [keyword]} for keyword in keywords],
    }
    return endpoint, headers, payload

  async def get_keyword_trends(self, request: TrendRequest) -> dict:
    if not self.settings.naver_shopping_insight_enabled or not self.settings.naver_shopping_insight_endpoint:
      return {"status": "disabled", "series": []}
    endpoint, headers, payload = self._request_parts(request)
    if not headers or not payload:
      return {"status": "disabled", "series": []}
    async with httpx.AsyncClient(timeout=5.0) as client:
      response = await client.post(
        endpoint,
        headers=headers,
        json=payload,
      )
      response.raise_for_status()
      result = response.json()
      series = result.get("results", []) if isinstance(result, dict) else []
      return {"status": "ready", "series": series, "metric": "relative_click_ratio"}
