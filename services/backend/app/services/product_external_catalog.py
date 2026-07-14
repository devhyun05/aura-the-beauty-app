"""Display-safe adapter for the packaged Auradin product discovery catalog.

The packaged catalog is a curated external discovery pool backed by validated
Naver offer evidence.  It is deliberately kept separate from the licensed V2
catalog: cards are always marked with ``externalSource=auradin_catalog`` and
must never be inserted into, or described as, the trusted catalog.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from math import ceil, log1p
import re
from typing import Any, Iterable, Mapping
from urllib.parse import urlparse
from uuid import UUID

from app.db.session import Database
from app.services.auradin_agent.catalog_loader import get_catalog
from app.services.product_color import delta_e_ciede2000, normalize_hex_color, srgb_hex_to_lab
from app.services.shopping_products import _safe_naver_result_url


AURADIN_CATALOG_SOURCE = "auradin_catalog"
PRODUCT_CATEGORIES = ("base", "shadow", "brow", "cheek", "lip", "liner")
PRODUCT_CATEGORY_LABELS = {
  "base": "베이스",
  "shadow": "아이섀도우",
  "brow": "아이브로우",
  "cheek": "블러셔",
  "lip": "립",
  "liner": "아이라이너",
}
_SEARCH_CATEGORY_ALIASES = {
  "base": ("base", "베이스", "쿠션", "파운데이션", "컨실러", "프라이머"),
  "shadow": ("shadow", "아이섀도우", "섀도우", "팔레트"),
  "brow": ("brow", "아이브로우", "브로우", "눈썹"),
  "cheek": ("cheek", "블러셔", "치크", "블러쉬"),
  "lip": ("lip", "립", "틴트", "립스틱", "립글로스"),
  "liner": ("liner", "아이라이너", "라이너", "아이라인"),
}
_TOKEN_PATTERN = re.compile(r"[0-9a-zA-Z가-힣]+")


def external_product_identity(external_source: str, product_id: str) -> str:
  return f"{external_source}:{product_id}"


def external_catalog_identity(product_id: str) -> str:
  return external_product_identity(AURADIN_CATALOG_SOURCE, product_id)


def _text(value: Any) -> str:
  return str(value or "").strip()


def _attributes(item: Mapping[str, Any]) -> dict[str, Any]:
  value = item.get("attributes")
  return value if isinstance(value, dict) else {}


def _timestamp(value: Any) -> datetime | None:
  if isinstance(value, datetime):
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
  if not isinstance(value, str) or not value.strip():
    return None
  try:
    parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
  except ValueError:
    return None
  return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _palette(item: Mapping[str, Any]) -> list[str]:
  values = item.get("palette")
  if not isinstance(values, list):
    return []
  colors: list[str] = []
  for value in values[:8]:
    try:
      color = normalize_hex_color(_text(value))
    except ValueError:
      continue
    if color not in colors:
      colors.append(color)
  return colors


def _map_catalog_item(item: Mapping[str, Any], *, liked: bool) -> dict[str, Any] | None:
  product_id = _text(item.get("id"))
  category = _text(item.get("category"))
  brand_name = _text(item.get("brandName"))
  product_name = _text(item.get("productName") or item.get("normalizedProductName"))
  offer = item.get("liveOffer") if isinstance(item.get("liveOffer"), dict) else {}
  purchase_url = _safe_naver_result_url(offer.get("purchaseUrl"))
  image_url = _safe_naver_result_url(offer.get("imageUrl"))
  try:
    price_amount = int(offer.get("priceKrw") or 0)
  except (TypeError, ValueError):
    price_amount = 0
  if (
    not product_id
    or category not in PRODUCT_CATEGORIES
    or not brand_name
    or not product_name
    or not purchase_url
    or not image_url
    or price_amount <= 0
  ):
    return None
  attributes = _attributes(item)
  palette = _palette(item)
  finish = _text(attributes.get("finish")) or None
  color_family = _text(attributes.get("colorFamily")) or None
  undertone = _text(attributes.get("undertone")) or None
  texture = _text(attributes.get("texture")) or None
  updated_at = _timestamp(item.get("updatedAt"))
  seller_domain = (urlparse(purchase_url).hostname or "").lower()
  return {
    "productId": product_id,
    "shadeId": None,
    "brandName": brand_name,
    "productName": product_name,
    "category": category,
    "categoryLabel": PRODUCT_CATEGORY_LABELS[category],
    "shadeName": None,
    "shadeHex": palette[0] if palette else None,
    "palette": palette,
    "finish": finish,
    "colorFamily": color_family,
    "undertone": undertone,
    "texture": texture,
    "imageUrl": image_url,
    "purchaseUrl": purchase_url,
    "price": {"amount": price_amount, "currency": "KRW", "updatedAt": updated_at},
    "offer": {
      "offerId": f"external-{product_id}",
      "sellerName": seller_domain,
      "sellerDomain": seller_domain,
      "availability": "external",
      "affiliateType": "none",
      "disclosureLabel": "외부 판매처",
    },
    "viewerState": {"liked": liked},
    "status": "active",
    "canLike": True,
    "canUnlike": liked,
    "externalSource": AURADIN_CATALOG_SOURCE,
    "sourceUpdatedAt": updated_at,
    "recommendationBasis": "auradinCatalog",
    "sponsored": False,
  }


def resolve_auradin_catalog_product(product_id: str) -> dict[str, Any] | None:
  """Resolve a server-owned external identity and revalidate its offer URLs."""

  item = get_catalog().get(_text(product_id))
  return _map_catalog_item(item, liked=False) if item else None


def get_auradin_catalog_readiness() -> dict[str, Any]:
  packaged_counts = Counter(
    _text(item.get("category"))
    for item in get_catalog().items
    if _text(item.get("category")) in PRODUCT_CATEGORIES
  )
  displayable_counts = Counter(
    _text(item.get("category"))
    for item in get_catalog().items
    if _text(item.get("category")) in PRODUCT_CATEGORIES and _map_catalog_item(item, liked=False)
  )
  packaged_total = sum(packaged_counts.values())
  displayable_total = sum(displayable_counts.values())
  return {
    "auradinCatalogReady": displayable_total > 0 and all(displayable_counts[category] > 0 for category in PRODUCT_CATEGORIES),
    "auradinCatalogProducts": packaged_total,
    "auradinCatalogCategoryCounts": {category: packaged_counts[category] for category in PRODUCT_CATEGORIES},
    "auradinCatalogDisplayableProducts": displayable_total,
    "auradinCatalogDisplayableCategoryCounts": {
      category: displayable_counts[category] for category in PRODUCT_CATEGORIES
    },
  }


def auradin_catalog_event_features(product_id: str) -> dict[str, str] | None:
  product = resolve_auradin_catalog_product(product_id)
  if not product:
    return None
  features = {
    "catalogCategory": _text(product.get("category")),
    "catalogBrand": _text(product.get("brandName")),
    "catalogFinish": _text(product.get("finish")),
    "catalogColorFamily": _text(product.get("colorFamily")),
    "catalogUndertone": _text(product.get("undertone")),
  }
  return {key: value for key, value in features.items() if value}


def _quality_score(item: Mapping[str, Any]) -> float:
  confidence = item.get("attributeConfidence")
  confidence = confidence if isinstance(confidence, dict) else {}
  retail = item.get("retailPresence")
  retail = retail if isinstance(retail, dict) else {}
  department = retail.get("departmentStore")
  department = department if isinstance(department, dict) else {}
  flags = item.get("qualityFlags")
  flag_count = len(flags) if isinstance(flags, list) else 0
  return (
    1.0
    + (0.25 if department.get("listed") is True else 0.0)
    + min(0.3, max(0.0, float(confidence.get("purchaseUrl") or 0)) * 0.15)
    + min(0.3, max(0.0, float(confidence.get("imageUrl") or 0)) * 0.15)
    - min(0.4, flag_count * 0.08)
  )


def _preference_score(item: Mapping[str, Any], preferences: Mapping[tuple[str, str], float]) -> float:
  attributes = _attributes(item)
  values = {
    "category": _text(item.get("category")),
    "brand_name": _text(item.get("brandName")),
    "finish": _text(attributes.get("finish")),
    "color_family": _text(attributes.get("colorFamily")),
  }
  return sum(
    preferences.get((feature, value), 0.0) * (0.5 if feature == "brand_name" else 1.0)
    for feature, value in values.items()
    if value
  )


def _ar_score(
  item: Mapping[str, Any],
  *,
  target_lab: tuple[float, float, float] | None,
  target_finish: str | None,
  target_texture: str | None,
) -> tuple[float, float | None]:
  distance: float | None = None
  if target_lab is not None:
    distances = []
    for color in _palette(item):
      try:
        distances.append(delta_e_ciede2000(target_lab, srgb_hex_to_lab(color)))
      except ValueError:
        continue
    distance = min(distances) if distances else None
  attributes = _attributes(item)
  candidate_finish = _text(attributes.get("finish"))
  normalized_finish = {"gloss": "glossy", "glow": "glossy", "sheer_glow": "sheer"}.get(
    _text(target_finish),
    _text(target_finish),
  )
  finish_score = 1.0 if normalized_finish and candidate_finish == normalized_finish else 0.35 if normalized_finish and candidate_finish else 0.0
  candidate_texture = _text(attributes.get("texture"))
  texture_score = 1.0 if target_texture and candidate_texture == _text(target_texture) else 0.25 if target_texture and candidate_texture else 0.0
  color_score = max(0.0, 1.0 - min(distance or 50.0, 50.0) / 50.0) if distance is not None else 0.0
  return color_score * 3.0 + finish_score + texture_score * 0.75 + _quality_score(item) * 0.15, distance


def _search_score(item: Mapping[str, Any], query: str) -> float:
  normalized_query = " ".join(_TOKEN_PATTERN.findall(query.casefold()))
  tokens = [token for token in normalized_query.split() if token]
  if not tokens:
    return 0.0
  category = _text(item.get("category"))
  searchable = " ".join(
    (
      _text(item.get("brandName")),
      _text(item.get("productName")),
      _text(item.get("normalizedProductName")),
      category,
      " ".join(_SEARCH_CATEGORY_ALIASES.get(category, ())),
      " ".join(_text(value) for value in item.get("residualTitleKeywords", []) if _text(value)),
    )
  ).casefold()
  compact = searchable.replace(" ", "")
  if not all(token in searchable or token.replace(" ", "") in compact for token in tokens):
    return 0.0
  name = _text(item.get("productName")).casefold()
  brand = _text(item.get("brandName")).casefold()
  score = sum(1.0 for token in tokens if token in searchable)
  if normalized_query in name:
    score += 3.0
  if normalized_query in brand:
    score += 2.0
  if normalized_query in _SEARCH_CATEGORY_ALIASES.get(category, ()):
    score += 1.5
  return score + _quality_score(item) * 0.1


def _seasonal_score(item: Mapping[str, Any], theme_slug: str) -> float:
  attributes = _attributes(item)
  finish = _text(attributes.get("finish")).casefold()
  texture = _text(attributes.get("texture")).casefold()
  category = _text(item.get("category"))
  searchable = " ".join(
    (_text(item.get("productName")), _text(item.get("normalizedProductName")), finish, texture)
  ).casefold()
  score = 0.0
  matched = False
  if theme_slug == "glossy-lip-flushed-cheek":
    if finish in {"glossy", "sheer", "shimmer"}:
      score += 2.5
      matched = True
    if texture in {"gloss", "cream", "balm", "liquid", "gel"}:
      score += 1.25
      matched = True
    if any(token in searchable for token in ("글로", "glow", "gloss", "듀이", "광채", "촉촉", "쉬머", "shimmer")):
      score += 1.5
      matched = True
    if category in {"lip", "cheek", "base", "shadow"}:
      score += 0.4
  elif theme_slug == "waterproof-reflective-eye":
    if any(token in searchable for token in ("워터프루프", "waterproof", "롱래스팅", "longlasting", "픽싱", "지속력")):
      score += 2.5
      matched = True
    if finish == "shimmer":
      score += 1.5
      matched = True
    if category in {"liner", "brow", "shadow", "base"}:
      score += 0.5
  elif theme_slug == "soft-blur-skin":
    if finish in {"matte", "velvet"}:
      score += 2.5
      matched = True
    if any(token in searchable for token in ("블러", "blur", "매트", "matte", "벨벳", "velvet", "소프트")):
      score += 1.5
      matched = True
    if texture == "powder":
      score += 0.75
      matched = True
    if category in {"base", "lip", "cheek", "shadow"}:
      score += 0.4
  return score + _quality_score(item) * 0.1 if matched else 0.0


async def _viewer_liked_ids(db: Database, user_id: UUID | None) -> set[str]:
  if user_id is None or getattr(db, "is_connected", True) is False:
    return set()
  rows = await db.fetch(
    """select external_product_id from external_product_likes
    where user_id=$1 and (
      external_source=$2
      or (external_source='auradin_search' and external_product_id like 'auradin-seed-%')
    )""",
    user_id,
    AURADIN_CATALOG_SOURCE,
  )
  return {str(row["external_product_id"]) for row in rows}


async def _catalog_popularity_counts(db: Database) -> Counter[str]:
  if getattr(db, "is_connected", True) is False:
    return Counter()
  rows = await db.fetch(
    """select external_product_id,count(distinct user_id)::int as like_count
    from external_product_likes
    where external_source='auradin_catalog'
      or (external_source='auradin_search' and external_product_id like 'auradin-seed-%')
    group by external_product_id"""
  )
  return Counter({str(row["external_product_id"]): int(row.get("like_count") or 0) for row in rows})


def _diversified(
  ranked: list[tuple[float, str, dict[str, Any]]],
  *,
  categories: list[str],
  limit: int,
) -> list[dict[str, Any]]:
  if limit <= 0:
    return []
  by_category: defaultdict[str, list[tuple[float, str, dict[str, Any]]]] = defaultdict(list)
  for candidate in ranked:
    by_category[str(candidate[2]["category"])].append(candidate)
  selected: list[dict[str, Any]] = []
  selected_ids: set[str] = set()
  brand_counts: Counter[str] = Counter()
  available_brands = {str(candidate[2]["brandName"]) for candidate in ranked}
  brand_limit = max(2, ceil(limit / max(1, len(available_brands))))

  def take(candidate: tuple[float, str, dict[str, Any]], *, enforce_brand_limit: bool = True) -> bool:
    item = candidate[2]
    product_id = str(item["productId"])
    brand = str(item["brandName"])
    if product_id in selected_ids or (enforce_brand_limit and brand_counts[brand] >= brand_limit):
      return False
    selected.append(item)
    selected_ids.add(product_id)
    brand_counts[brand] += 1
    return True

  # Round-robin produces deterministic category coverage for hub and fallback
  # shelves. A single-category request retains the global score ordering.
  if len(categories) > 1:
    positions: Counter[str] = Counter()
    while len(selected) < limit:
      added = False
      for category in categories:
        candidates = by_category.get(category, [])
        while positions[category] < len(candidates):
          candidate = candidates[positions[category]]
          positions[category] += 1
          if take(candidate):
            added = True
            break
        if len(selected) >= limit:
          break
      if not added:
        break
  else:
    for candidate in ranked:
      take(candidate)
      if len(selected) >= limit:
        break
  # A small source catalog can have fewer brands than a large shelf requests.
  # Product uniqueness and a full shelf take precedence over an impossible cap.
  if len(selected) < limit:
    for candidate in ranked:
      take(candidate, enforce_brand_limit=False)
      if len(selected) >= limit:
        break
  return selected


async def get_auradin_catalog_products(
  db: Database,
  *,
  user_id: UUID | None,
  limit: int,
  categories: Iterable[str] | None = None,
  strategy: str = "popular",
  target_lab: tuple[float, float, float] | None = None,
  target_finish: str | None = None,
  target_texture: str | None = None,
  max_delta_e: float | None = None,
  preferences: Mapping[tuple[str, str], float] | None = None,
  undertone: str | None = None,
  query: str | None = None,
  seasonal_theme: str | None = None,
  exclude_identities: set[tuple[str, str]] | None = None,
  exclude_liked: bool = False,
) -> list[dict[str, Any]]:
  """Rank and adapt server-owned external catalog rows for a recommendation use."""

  if limit <= 0:
    return []
  requested_categories = list(
    dict.fromkeys(category for category in (categories or PRODUCT_CATEGORIES) if category in PRODUCT_CATEGORIES)
  ) or list(PRODUCT_CATEGORIES)
  liked_ids = await _viewer_liked_ids(db, user_id)
  popularity_counts = await _catalog_popularity_counts(db) if strategy == "popular" else Counter()
  excluded = exclude_identities or set()
  ranked: list[tuple[float, str, dict[str, Any]]] = []
  for raw_item in get_catalog().items:
    product_id = _text(raw_item.get("id"))
    category = _text(raw_item.get("category"))
    if (
      category not in requested_categories
      or (AURADIN_CATALOG_SOURCE, product_id) in excluded
      or (exclude_liked and product_id in liked_ids)
    ):
      continue
    mapped = _map_catalog_item(raw_item, liked=product_id in liked_ids)
    if not mapped:
      continue
    distance: float | None = None
    if strategy == "ar":
      score, distance = _ar_score(
        raw_item,
        target_lab=target_lab,
        target_finish=target_finish,
        target_texture=target_texture,
      )
      if target_lab is not None and distance is None:
        continue
      if distance is not None and max_delta_e is not None and distance > max_delta_e:
        continue
      reasons = ["CLOSE_AUTHORING_COLOR"] if distance is not None else []
      labels = ["저장한 AR 색상과 가까운 외부 상품이에요"] if distance is not None else []
      candidate_finish = _text(_attributes(raw_item).get("finish"))
      normalized_finish = {"gloss": "glossy", "glow": "glossy", "sheer_glow": "sheer"}.get(
        _text(target_finish),
        _text(target_finish),
      )
      if normalized_finish and candidate_finish == normalized_finish:
        reasons.append("MATCHING_FINISH")
        labels.append("저장한 AR 피니시와 같아요")
      if target_texture and _text(_attributes(raw_item).get("texture")) == _text(target_texture):
        reasons.append("MATCHING_TEXTURE")
        labels.append("저장한 AR 텍스처와 같아요")
      if not reasons:
        continue
      mapped.update({"reasonCodes": reasons, "reasonLabels": labels})
      if distance is not None:
        mapped["colorDistance"] = round(distance, 4)
    elif strategy == "personalized":
      score = _preference_score(raw_item, preferences or {})
      if score <= 0:
        continue
      mapped.update(
        {
          "reasonCodes": ["ENGAGEMENT_PREFERENCE"],
          "reasonLabels": ["좋아요·검색·최근 본 제품 취향을 반영했어요"],
        }
      )
    elif strategy == "tone":
      candidate_undertone = _text(_attributes(raw_item).get("undertone"))
      if undertone not in {"warm", "cool", "neutral"} or candidate_undertone != undertone:
        continue
      score = 3.0 + _quality_score(raw_item)
      mapped.update(
        {
          "reasonCodes": ["REPORT_UNDERTONE_FALLBACK"],
          "reasonLabels": ["분석 리포트의 넓은 톤 범주와 맞는 외부 상품이에요"],
        }
      )
    elif strategy == "search":
      score = _search_score(raw_item, query or "")
      if score <= 0:
        continue
      mapped.update({"reasonCodes": ["SEARCH_MATCH"], "reasonLabels": ["검색어와 관련된 상품이에요"]})
    elif strategy == "seasonal":
      score = _seasonal_score(raw_item, seasonal_theme or "")
      if score <= 0:
        continue
      mapped.update(
        {
          "reasonCodes": ["CURRENT_SEASON_TREND"],
          "reasonLabels": ["상품 색감·피니시·텍스처가 이번 시즌 테마와 맞아요"],
          "recommendationBasis": "seasonalAttributeMatch",
        }
      )
    else:
      score = _quality_score(raw_item) + log1p(popularity_counts[product_id]) * 0.6
      mapped.update(
        {
          "reasonCodes": ["POPULAR_FALLBACK"],
          "reasonLabels": ["추천 데이터가 쌓이는 동안 인기 상품을 보여드려요"],
          "recommendationBasis": "popularFallback",
        }
      )
    ranked.append((score, product_id, mapped))
  ranked.sort(key=lambda candidate: (-candidate[0], candidate[1]))
  if strategy == "search":
    return [candidate[2] for candidate in ranked[:limit]]
  return _diversified(ranked, categories=requested_categories, limit=limit)
