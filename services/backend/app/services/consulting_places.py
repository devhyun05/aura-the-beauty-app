"""External beauty place discovery through Naver Local Search.

This intentionally does not persist Naver results. The consulting MVP uses
external places as read-only discovery cards, while in-app booking stays limited
to directly recruited AURA freelancers.
"""

from __future__ import annotations

import asyncio
import hashlib
import html
import math
import re
from typing import Any
from urllib.parse import quote

import httpx

from app.core.settings import Settings


NAVER_LOCAL_SEARCH_URL = "https://openapi.naver.com/v1/search/local.json"

LOCAL_PLACE_CATEGORY_QUERIES: dict[str, str] = {
  "hair": "헤어샵",
  "makeup": "메이크업샵",
  "personalColor": "퍼스널컬러 진단",
  "fashion": "패션 골격진단",
}

LOCAL_PLACE_CATEGORY_QUERY_VARIANTS: dict[str, tuple[str, ...]] = {
  "hair": ("헤어샵", "미용실", "헤어살롱", "네이버예약 미용실"),
  "makeup": ("메이크업샵", "메이크업 스튜디오", "메이크업 아티스트", "네이버예약 메이크업"),
  "personalColor": ("퍼스널컬러 진단", "퍼스널컬러 컨설팅", "컬러 진단", "네이버예약 퍼스널컬러"),
  "fashion": ("패션 골격진단", "골격진단", "이미지 컨설팅", "체형 진단"),
}

LOCAL_PLACE_CATEGORY_LABELS: dict[str, str] = {
  "hair": "헤어",
  "makeup": "메이크업",
  "personalColor": "퍼스널컬러",
  "fashion": "패션 골격진단",
}

LOCAL_PLACE_CATEGORY_HIGHLIGHTS: dict[str, tuple[str, ...]] = {
  "hair": ("컷/펌/염색", "두상·얼굴형 상담", "플레이스 정보 확인"),
  "makeup": ("데일리/촬영 메이크업", "웨딩·행사 스타일링", "예약 운영 여부 확인"),
  "personalColor": ("톤 진단", "컬러 팔레트", "후기·가격 확인"),
  "fashion": ("골격 진단", "체형별 실루엣", "스타일링 상담"),
}

LOCAL_PLACE_PRICE_HINTS: dict[str, str] = {
  "hair": "컷·펌·염색 가격은 네이버 플레이스에서 확인",
  "makeup": "메이크업 상품과 예약금은 네이버 플레이스에서 확인",
  "personalColor": "진단 코스와 소요 시간은 네이버 플레이스에서 확인",
  "fashion": "골격진단·스타일링 코스 가격은 네이버 플레이스에서 확인",
}

LOCAL_PLACE_THUMBNAILS: dict[str, tuple[str, ...]] = {
  "hair": (
    "consulting-hero-hair.jpg",
    "consulting-hero-online.jpg",
    "consulting-hero-fashion.jpg",
  ),
  "makeup": (
    "consulting-hero-makeup.jpg",
    "consulting-hero-color.jpg",
    "expert-sea.jpg",
  ),
  "personalColor": (
    "consulting-hero-color.jpg",
    "consulting-hero-makeup.jpg",
    "expert-doa.jpg",
  ),
  "fashion": (
    "consulting-hero-fashion.jpg",
    "consulting-hero-hair.jpg",
    "expert-lian.jpg",
  ),
}

_TAG_RE = re.compile(r"<[^>]+>")


def _clean_text(value: Any) -> str:
  if value is None:
    return ""

  without_tags = _TAG_RE.sub("", str(value))
  return html.unescape(without_tags).strip()


def _place_id_from(item: dict[str, Any]) -> str:
  raw = "|".join(
    [
      _clean_text(item.get("title")),
      _clean_text(item.get("roadAddress") or item.get("address")),
      _clean_text(item.get("link")),
      _clean_text(item.get("telephone")),
    ],
  )
  digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]
  return f"naver-local-{digest}"


def _thumbnail_key_for(*, category: str, place_id: str) -> str:
  thumbnails = LOCAL_PLACE_THUMBNAILS.get(
    category,
    ("consulting-hero-online.jpg",),
  )
  digest = int(hashlib.sha1(place_id.encode("utf-8")).hexdigest()[:8], 16)
  return thumbnails[digest % len(thumbnails)]


def _coordinate(value: Any) -> float | None:
  text = _clean_text(value)
  if not text:
    return None

  try:
    number = float(text)
  except ValueError:
    return None

  return number / 10_000_000 if abs(number) > 1_000 else number


def _distance_km(
  *,
  latitude: float | None,
  longitude: float | None,
  place_latitude: float | None,
  place_longitude: float | None,
) -> float | None:
  if (
    latitude is None or
    longitude is None or
    place_latitude is None or
    place_longitude is None
  ):
    return None

  radius_km = 6371.0
  lat1 = math.radians(latitude)
  lat2 = math.radians(place_latitude)
  delta_lat = math.radians(place_latitude - latitude)
  delta_lon = math.radians(place_longitude - longitude)
  a = (
    math.sin(delta_lat / 2) ** 2 +
    math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
  )
  return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _distance_label(distance_km: float | None) -> str:
  if distance_km is None:
    return ""
  if distance_km < 1:
    return f"{round(distance_km * 1000):,}m"
  return f"{distance_km:.1f}km"


def _naver_map_url(
  *,
  name: str,
  longitude: float | None,
  latitude: float | None,
) -> str:
  encoded = quote(name or "뷰티샵")
  if longitude is not None and latitude is not None:
    return f"https://map.naver.com/p/search/{encoded}?c={longitude:.7f},{latitude:.7f},15,0,0,0,dh&searchType=place"
  return f"https://map.naver.com/p/search/{encoded}?searchType=place"


def _naver_place_search_url(*, name: str, address: str, link: str) -> str:
  if "place.naver.com" in link:
    return link

  # Address-heavy queries often miss exact Naver Place matches. Use the business
  # name first so the external page opens closer to the native Place experience.
  keyword = (name or address or "뷰티샵").strip()
  return f"https://m.place.naver.com/place/list?query={quote(keyword)}"


def _is_naver_map_url(url: str) -> bool:
  return "map.naver.com" in url or "m.place.naver.com" in url


def _place_summary(
  *,
  category: str,
  description: str,
  name: str,
) -> str:
  if description:
    return description
  label = LOCAL_PLACE_CATEGORY_LABELS.get(category, "뷰티")
  return f"{name}의 {label} 네이버 지역 등록 정보예요. 앱에서는 위치와 상담 분야를 먼저 확인하고, 사진·리뷰·예약 운영 여부는 네이버에서 이어서 확인해 주세요."


def _detail_lines(
  *,
  category: str,
  category_text: str,
  address: str,
) -> list[str]:
  lines = [
    f"{LOCAL_PLACE_CATEGORY_LABELS.get(category, '뷰티')} 업체",
    "네이버 지역 검색 기반 추천",
  ]

  if category_text:
    lines.append(category_text)
  if address:
    lines.append(address)
  lines.append(LOCAL_PLACE_PRICE_HINTS.get(category, "가격은 네이버 플레이스에서 확인"))
  return lines


def _map_naver_local_item(
  item: dict[str, Any],
  *,
  category: str = "hair",
  latitude: float | None = None,
  longitude: float | None = None,
) -> dict[str, Any]:
  name = _clean_text(item.get("title"))
  address = _clean_text(item.get("roadAddress")) or _clean_text(item.get("address"))
  link = _clean_text(item.get("link"))
  place_longitude = _coordinate(item.get("mapx"))
  place_latitude = _coordinate(item.get("mapy"))
  distance_km = _distance_km(
    latitude=latitude,
    longitude=longitude,
    place_latitude=place_latitude,
    place_longitude=place_longitude,
  )
  naver_map_url = link if _is_naver_map_url(link) else _naver_map_url(
    name=name,
    longitude=place_longitude,
    latitude=place_latitude,
  )
  description = _clean_text(item.get("description"))
  category_text = _clean_text(item.get("category"))
  category_label = LOCAL_PLACE_CATEGORY_LABELS.get(category, "뷰티")
  reservation_search_keyword = f"{name} {category_label} 예약 가능 여부".strip()
  place_id = _place_id_from(item)

  return {
    "id": place_id,
    "source": "naver_local",
    "name": name,
    "category": category_text,
    "category_label": category_label,
    "description": description,
    "summary": _place_summary(category=category, description=description, name=name),
    "telephone": _clean_text(item.get("telephone")),
    "address": _clean_text(item.get("address")),
    "road_address": _clean_text(item.get("roadAddress")),
    "map_x": _clean_text(item.get("mapx")),
    "map_y": _clean_text(item.get("mapy")),
    "latitude": place_latitude,
    "longitude": place_longitude,
    "distance_km": distance_km,
    "distance_label": _distance_label(distance_km),
    "website_url": "" if _is_naver_map_url(link) else link,
    "naver_map_url": naver_map_url,
    "naver_reservation_url": "",
    "naver_place_search_url": _naver_place_search_url(
      name=name,
      address=address,
      link=link,
    ),
    "reservation_search_keyword": reservation_search_keyword,
    "booking_hint": "예약 버튼이 보이지 않는 업체도 있어요. 네이버 플레이스에서 실제 예약 운영 여부를 확인해 주세요.",
    "detail_lines": _detail_lines(
      category=category,
      category_text=category_text,
      address=address,
    ),
    "rating_hint": "평점·사진·실시간 리뷰는 네이버에서 확인",
    "price_hint": LOCAL_PLACE_PRICE_HINTS.get(category, "가격은 네이버 플레이스에서 확인"),
    "service_highlights": list(LOCAL_PLACE_CATEGORY_HIGHLIGHTS.get(category, ())),
    "thumbnail_key": _thumbnail_key_for(
      category=category,
      place_id=place_id,
    ),
    "naver_url": naver_map_url,
  }


def build_local_place_query(
  *,
  category: str,
  region: str | None,
  query: str | None,
) -> str:
  base_query = _clean_text(query)
  if not base_query:
    base_query = LOCAL_PLACE_CATEGORY_QUERIES.get(category, LOCAL_PLACE_CATEGORY_QUERIES["hair"])

  region_text = _clean_text(region)
  if region_text and region_text not in base_query:
    return f"{region_text} {base_query}"

  return base_query


def build_local_place_queries(
  *,
  category: str,
  region: str | None,
  query: str | None,
) -> list[str]:
  base_query = _clean_text(query)
  if base_query:
    queries = [base_query]
  else:
    queries = list(
      LOCAL_PLACE_CATEGORY_QUERY_VARIANTS.get(
        category,
        (LOCAL_PLACE_CATEGORY_QUERIES["hair"],),
      ),
    )

  region_text = _clean_text(region)
  if region_text:
    return [
      search_query if region_text in search_query else f"{region_text} {search_query}"
      for search_query in queries
    ]

  return queries


async def _fetch_local_items(
  client: httpx.AsyncClient,
  *,
  headers: dict[str, str],
  query: str,
  display: int,
) -> list[dict[str, Any]]:
  params = {
    "display": max(1, min(display, 5)),
    "query": query,
    "sort": "comment",
    "start": 1,
  }
  response = await client.get(NAVER_LOCAL_SEARCH_URL, headers=headers, params=params)
  response.raise_for_status()
  payload = response.json()
  items = payload.get("items") if isinstance(payload.get("items"), list) else []
  return [item for item in items if isinstance(item, dict)]


async def search_local_places(
  settings: Settings,
  *,
  category: str,
  region: str | None = None,
  query: str | None = None,
  latitude: float | None = None,
  longitude: float | None = None,
  display: int = 5,
  limit: int = 15,
) -> dict[str, Any]:
  client_id = settings.naver_shopping_client_id
  client_secret = settings.naver_shopping_client_secret
  normalized_category = category if category in LOCAL_PLACE_CATEGORY_QUERIES else "hair"
  search_queries = build_local_place_queries(
    category=normalized_category,
    region=region,
    query=query,
  )
  search_query = search_queries[0]

  if not client_id or not client_secret:
    return {
      "places": [],
      "query": search_query,
      "queries": search_queries,
      "category": normalized_category,
      "category_label": LOCAL_PLACE_CATEGORY_LABELS.get(normalized_category, "뷰티"),
      "source": "empty_not_configured",
    }

  headers = {
    "X-Naver-Client-Id": client_id,
    "X-Naver-Client-Secret": client_secret,
  }

  async with httpx.AsyncClient(timeout=8.0) as client:
    raw_items_nested = await asyncio.gather(
      *[
        _fetch_local_items(
          client,
          headers=headers,
          query=search_query_item,
          display=display,
        )
        for search_query_item in search_queries
      ],
    )

  seen_ids: set[str] = set()
  places: list[dict[str, Any]] = []
  for raw_items in raw_items_nested:
    for item in raw_items:
      place_id = _place_id_from(item)
      if place_id in seen_ids:
        continue
      seen_ids.add(place_id)
      places.append(
        _map_naver_local_item(
          item,
          category=normalized_category,
          latitude=latitude,
          longitude=longitude,
        ),
      )

  if latitude is not None and longitude is not None:
    places.sort(
      key=lambda place: (
        place["distance_km"] is None,
        place["distance_km"] if place["distance_km"] is not None else 999999,
      ),
    )

  normalized_limit = max(1, min(limit, 20))
  return {
    "places": places[:normalized_limit],
    "query": search_query,
    "queries": search_queries,
    "category": normalized_category,
    "category_label": LOCAL_PLACE_CATEGORY_LABELS.get(normalized_category, "뷰티"),
    "source": "naver_local",
  }
