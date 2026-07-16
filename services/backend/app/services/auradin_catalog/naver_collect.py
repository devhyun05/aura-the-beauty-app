from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import httpx

from .brand_aliases import BRAND_PRIORITY
from .category_queries import DEFAULT_CATEGORY_QUERIES


NAVER_SHOPPING_API_URL = "https://openapi.naver.com/v1/search/shop.json"


@dataclass(frozen=True)
class NaverQuery:
  brand: str
  category: str
  query: str


def build_query_plan(
  *,
  brands: list[str] | None = None,
  categories: list[str] | None = None,
  max_queries: int | None = None,
  all_templates: bool = False,
) -> list[NaverQuery]:
  ordered_brands = sorted(
    brands or list(BRAND_PRIORITY),
    key=lambda brand: BRAND_PRIORITY.get(brand, 999),
  )
  ordered_categories = categories or ["lip", "shadow", "base", "cheek", "liner", "brow"]
  queries: list[NaverQuery] = []

  for brand in ordered_brands:
    for category in ordered_categories:
      templates = DEFAULT_CATEGORY_QUERIES.get(category, ())

      selected_templates = templates if all_templates else templates[:1]
      for template in selected_templates:
        queries.append(
          NaverQuery(
            brand=brand,
            category=category,
            query=template.format(brand=brand),
          ),
        )

        if max_queries and len(queries) >= max_queries:
          return queries

  return queries


async def collect_naver_shop_fixture_payload(
  *,
  client_id: str,
  client_secret: str,
  queries: list[NaverQuery],
  display: int = 100,
  filter_value: str | None = "naverpay",
  request_delay_seconds: float = 1.0,
  timeout_seconds: float = 10.0,
) -> dict[str, Any]:
  headers = {
    "X-Naver-Client-Id": client_id,
    "X-Naver-Client-Secret": client_secret,
  }
  responses: list[dict[str, Any]] = []

  async with httpx.AsyncClient(timeout=timeout_seconds) as client:
    for index, query in enumerate(queries):
      if index > 0 and request_delay_seconds > 0:
        await asyncio.sleep(request_delay_seconds)

      params = {
        "display": display,
        "exclude": "used:rental:cbshop",
        "query": query.query,
        "sort": "sim",
        "start": 1,
      }

      if filter_value:
        params["filter"] = filter_value

      response = await client.get(
        NAVER_SHOPPING_API_URL,
        headers=headers,
        params=params,
      )
      response.raise_for_status()
      payload = response.json()
      items = payload.get("items") if isinstance(payload.get("items"), list) else []
      responses.append(
        {
          "brand": query.brand,
          "category": query.category,
          "query": query.query,
          "items": items,
        },
      )

  return {"responses": responses}
