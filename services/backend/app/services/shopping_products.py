import asyncio
import hashlib
import html
import re
from typing import Any

import httpx

from app.core.settings import Settings
from app.db.session import Database


PRODUCT_CATEGORIES = ("lip", "cheek", "shadow", "liner", "base")

TABS = [
  {"id": "all", "label": "전체"},
  {"id": "lip", "label": "립"},
  {"id": "cheek", "label": "블러셔"},
  {"id": "shadow", "label": "아이섀도우"},
  {"id": "liner", "label": "아이라이너"},
  {"id": "base", "label": "베이스"},
]

CATEGORY_CONFIG = {
  "lip": {
    "query": "국내 립틴트 립스틱 화장품",
    "label": "립",
    "palette": ["#C95E68", "#E79196"],
    "reason": "추천 룩의 생기와 톤을 맞추기 좋은 립 컬러 후보예요.",
  },
  "cheek": {
    "query": "국내 블러셔 치크 화장품",
    "label": "블러셔",
    "palette": ["#D77A75", "#F0AAA0"],
    "reason": "얼굴 중심에 자연스러운 혈색을 더하기 좋은 치크 후보예요.",
  },
  "shadow": {
    "query": "국내 아이섀도우 팔레트 화장품",
    "label": "아이섀도우",
    "palette": ["#D6A394", "#C98082", "#8B5F55", "#5F4039"],
    "reason": "눈매 음영과 추천 무드를 같이 살리기 좋은 아이 제품이에요.",
  },
  "liner": {
    "query": "국내 아이라이너 브로우 화장품",
    "label": "아이라이너",
    "palette": ["#4B3028", "#786356"],
    "reason": "눈매를 또렷하게 정리하면서 과하지 않게 맞추기 좋은 후보예요.",
  },
  "base": {
    "query": "국내 쿠션 파운데이션 베이스 화장품",
    "label": "베이스",
    "palette": ["#E4C5A8", "#F4DDC8"],
    "reason": "추천 메이크업의 피부 표현을 맞추기 좋은 베이스 후보예요.",
  },
}

DEFAULT_MAKEUP_LOOK = {
  "title": "내추럴 K-뷰티 데일리 룩",
  "description": "분석된 톤과 어울리는 국내 구매 가능 제품을 중심으로 추천해드려요.",
  "imageUrl": None,
  "tags": ["K-뷰티", "데일리", "톤 맞춤"],
  "palette": ["#C96F72", "#E49C90", "#A77A69", "#5A3D34"],
}


def _clean_text(value: Any) -> str:
  text = html.unescape(str(value or ""))
  text = re.sub(r"<[^>]+>", "", text)
  text = re.sub(r"\s+", " ", text).strip()

  return text


def _dedupe(values: list[str]) -> list[str]:
  seen = set()
  result = []

  for value in values:
    normalized = value.strip()

    if not normalized or normalized in seen:
      continue

    seen.add(normalized)
    result.append(normalized)

  return result


def _parse_price(value: Any) -> int:
  try:
    return max(0, int(str(value or "0").replace(",", "")))
  except ValueError:
    return 0


def _stable_external_id(prefix: str, value: str) -> str:
  digest = hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]

  return f"{prefix}-{digest}"


def _normalize_category(category: str | None) -> str | None:
  if category in PRODUCT_CATEGORIES:
    return category

  return None


def _has_korean(value: str) -> bool:
  return bool(re.search(r"[가-힣]", value))


def _localized_product_name(title: str, category: str) -> str:
  if _has_korean(title):
    return title

  return f"{CATEGORY_CONFIG[category]['label']} 추천 상품"


def _build_sets(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
  by_category = {
    category: [product for product in products if product["category"] == category]
    for category in PRODUCT_CATEGORIES
  }

  daily_ids = [
    *(product["id"] for product in by_category["lip"][:1]),
    *(product["id"] for product in by_category["cheek"][:1]),
    *(product["id"] for product in by_category["shadow"][:1]),
  ]
  clear_ids = [
    *(product["id"] for product in by_category["base"][:1]),
    *(product["id"] for product in by_category["liner"][:1]),
    *(product["id"] for product in by_category["lip"][1:2]),
  ]

  sets = []

  if len(daily_ids) >= 2:
    sets.append(
      {
        "id": "daily-k-beauty-set",
        "title": "데일리 K-뷰티 조합",
        "description": "립, 치크, 아이섀도우를 한 번에 맞춰 데일리 룩으로 쓰기 좋은 조합",
        "productIds": daily_ids,
      },
    )

  if len(clear_ids) >= 2:
    sets.append(
      {
        "id": "clear-base-point-set",
        "title": "맑은 베이스 포인트 조합",
        "description": "베이스를 깨끗하게 잡고 립이나 라인으로 포인트를 주는 조합",
        "productIds": clear_ids,
      },
    )

  return sets


def _fallback_products(category: str | None = None) -> list[dict[str, Any]]:
  return []


def _map_naver_item(item: dict[str, Any], category: str, index: int) -> dict[str, Any] | None:
  title = _clean_text(item.get("title"))
  link = _clean_text(item.get("link"))
  image_url = _clean_text(item.get("image"))
  product_id = _clean_text(item.get("productId"))

  if not title or not link or not image_url or not product_id:
    return None

  config = CATEGORY_CONFIG[category]
  mall_name = _clean_text(item.get("mallName"))
  brand = _clean_text(item.get("brand"))
  maker = _clean_text(item.get("maker"))
  brand_name = brand or maker or mall_name or "NAVER 쇼핑"
  category_tags = _dedupe(
    [
      _clean_text(item.get("category2")),
      _clean_text(item.get("category3")),
      _clean_text(item.get("category4")),
      mall_name,
    ],
  )

  return {
    "id": f"naver-{product_id}" if product_id else _stable_external_id("naver", link),
    "brandName": brand_name,
    "productName": _localized_product_name(title, category),
    "shadeName": "",
    "category": category,
    "matchRate": max(82, 96 - index * 2),
    "price": _parse_price(item.get("lprice")),
    "tags": category_tags[:3] or ["국내 쇼핑", config["label"]],
    "imageUrl": image_url,
    "purchaseUrl": link,
    "palette": config["palette"],
    "reason": config["reason"],
  }


async def _fetch_naver_category_products(
  client: httpx.AsyncClient,
  settings: Settings,
  category: str,
) -> list[dict[str, Any]]:
  response = await client.get(
    "https://openapi.naver.com/v1/search/shop.json",
    headers={
      "X-Naver-Client-Id": settings.naver_shopping_client_id,
      "X-Naver-Client-Secret": settings.naver_shopping_client_secret,
    },
    params={
      "display": 4,
      "exclude": "used:rental:cbshop",
      "filter": "naverpay",
      "query": CATEGORY_CONFIG[category]["query"],
      "sort": "sim",
      "start": 1,
    },
  )
  response.raise_for_status()
  data = response.json()
  products = []

  for item_index, item in enumerate(data.get("items", [])):
    product = _map_naver_item(item, category, item_index)

    if product:
      products.append(product)

  return products


async def _fetch_naver_products(
  settings: Settings,
  category: str | None = None,
) -> list[dict[str, Any]]:
  if not settings.naver_shopping_client_id or not settings.naver_shopping_client_secret:
    return []

  categories = [_normalize_category(category)] if _normalize_category(category) else list(PRODUCT_CATEGORIES)
  products: list[dict[str, Any]] = []

  async with httpx.AsyncClient(timeout=6.0) as client:
    results = await asyncio.gather(
      *(
        _fetch_naver_category_products(client, settings, product_category)
        for product_category in categories
        if product_category
      ),
      return_exceptions=True,
    )

  for result in results:
    if isinstance(result, Exception):
      continue

    products.extend(result)

  unique_products = []
  seen_ids = set()

  for product in products:
    if product["id"] in seen_ids:
      continue

    seen_ids.add(product["id"])
    unique_products.append(product)

  return unique_products


def _map_db_product(row: dict[str, Any], index: int) -> dict[str, Any] | None:
  category = _normalize_category(row.get("category"))

  if not category:
    return None

  payload = row.get("product_payload") or {}
  if not isinstance(payload, dict):
    payload = {}

  config = CATEGORY_CONFIG[category]
  brand_name = _clean_text(row.get("brand_name")) or "AURA"
  product_name = _clean_text(row.get("product_name"))
  shade_name = _clean_text(row.get("shade_name"))
  purchase_url = _clean_text(payload.get("purchaseUrl") or payload.get("purchase_url"))

  if not purchase_url:
    return None

  return {
    "id": str(row.get("id") or row.get("external_key") or _stable_external_id("db", purchase_url)),
    "brandName": brand_name,
    "productName": _localized_product_name(product_name, category),
    "shadeName": shade_name,
    "category": category,
    "matchRate": _parse_price(payload.get("matchRate")) or max(82, 92 - index),
    "price": _parse_price(row.get("price_krw")),
    "tags": row.get("tags") or [config["label"]],
    "imageUrl": payload.get("imageUrl") or payload.get("image_url"),
    "purchaseUrl": purchase_url,
    "palette": row.get("palette") or config["palette"],
    "reason": payload.get("reason") or config["reason"],
  }


async def _fetch_db_products(db: Database, category: str | None = None) -> list[dict[str, Any]]:
  if not db.is_connected:
    return []

  normalized_category = _normalize_category(category)

  if normalized_category:
    rows = await db.fetch(
      """
      select *
      from products
      where is_active = true and category = $1
      order by created_at desc
      limit 50
      """,
      normalized_category,
    )
  else:
    rows = await db.fetch(
      """
      select *
      from products
      where is_active = true
      order by created_at desc
      limit 50
      """,
    )

  products = []

  for index, row in enumerate(rows):
    product = _map_db_product(row, index)

    if product:
      products.append(product)

  return products


async def build_product_recommendation_data(
  db: Database,
  settings: Settings,
  category: str | None = None,
) -> tuple[dict[str, Any], str]:
  source = "fallback"
  products: list[dict[str, Any]] = []

  try:
    products = await _fetch_naver_products(settings, category)
    if products:
      source = "naver_shopping"
  except (httpx.HTTPError, ValueError):
    products = []

  if not products:
    products = await _fetch_db_products(db, category)
    if products:
      source = "database"

  if not products:
    products = _fallback_products(category)

  return (
    {
      "userNickname": "고객",
      "makeupLook": DEFAULT_MAKEUP_LOOK,
      "tabs": TABS,
      "products": products,
      "sets": _build_sets(products),
    },
    source,
  )
