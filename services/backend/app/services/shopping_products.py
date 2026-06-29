import asyncio
import hashlib
import html
import json
import re
from typing import Any
from uuid import UUID

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

COLOR_TERMS = [
  "베이지",
  "핑크",
  "코랄",
  "로즈",
  "피치",
  "브라운",
  "누드",
  "모브",
  "플럼",
  "레드",
  "오렌지",
  "아이보리",
  "라벤더",
]
FINISH_TERMS = [
  "매트",
  "세미매트",
  "글로우",
  "글로시",
  "윤광",
  "촉촉",
  "벨벳",
  "새틴",
  "쉬어",
]
TONE_TERMS = ["웜톤", "쿨톤", "뉴트럴", "뮤트", "라이트", "브라이트", "딥"]
SKIN_TYPE_TERMS = ["모든피부용", "건성", "지성", "복합성", "민감성", "중성"]
FEATURE_TERMS = [
  "웜톤용",
  "쿨톤용",
  "지속력",
  "롱래스팅",
  "수분",
  "보송",
  "블러",
  "톤업",
  "커버",
  "밀착",
]
CONTAINER_TERMS = ["뚜껑형", "스틱", "튜브", "팔레트", "쿠션", "펜슬", "리퀴드", "팟"]
CATEGORY_GUIDE_KEYS = {
  "base": ("baseMakeupGuide",),
  "cheek": ("makeupGuideline.blush",),
  "liner": ("makeupGuideline.eyeliner", "makeupGuideline.brow"),
  "lip": ("makeupGuideline.lip",),
  "shadow": ("makeupGuideline.eyeshadow",),
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


def _as_list(value: Any) -> list[str]:
  if isinstance(value, list):
    return [_clean_text(item) for item in value if _clean_text(item)]

  if isinstance(value, str):
    return [_clean_text(item) for item in re.split(r"[,/|·]", value) if _clean_text(item)]

  return []


def _contains_any(text: str, values: list[str]) -> list[str]:
  normalized_text = text.lower()

  return [
    value
    for value in values
    if value.lower() in normalized_text
  ]


def _decode_json_object(value: Any) -> dict[str, Any]:
  if isinstance(value, dict):
    return value

  if isinstance(value, str) and value.strip():
    try:
      decoded = json.loads(value)
    except json.JSONDecodeError:
      return {}

    return decoded if isinstance(decoded, dict) else {}

  return {}


def _get_nested_text(payload: dict[str, Any], path: str) -> str:
  current: Any = payload

  for key in path.split("."):
    if not isinstance(current, dict):
      return ""

    current = current.get(key)

  return _clean_text(current)


def _normalize_report_payload(row: dict[str, Any] | None) -> dict[str, Any] | None:
  if not row:
    return None

  detail_payload = _decode_json_object(row.get("detail_payload"))
  result = _decode_json_object(detail_payload.get("result"))

  return {
    "baseMakeupGuide": _clean_text(
      row.get("base_makeup_guide") or result.get("baseMakeupGuide"),
    ),
    "faceShape": _clean_text(row.get("face_shape") or result.get("faceShape")),
    "makeupGuideline": (
      result.get("makeupGuideline")
      if isinstance(result.get("makeupGuideline"), dict)
      else {}
    ),
    "personalColor": _clean_text(row.get("personal_color") or result.get("personalColor")),
    "recommendedMood": _clean_text(row.get("recommended_mood") or result.get("recommendedMood")),
    "shortSummary": _clean_text(row.get("short_summary") or result.get("shortSummary")),
    "skinAnalysisSummary": _clean_text(
      row.get("skin_analysis_summary") or result.get("skinAnalysisSummary"),
    ),
    "skinType": _clean_text(row.get("skin_type") or result.get("skinType")),
    "summary": _clean_text(row.get("summary") or result.get("summary")),
    "tags": _as_list(row.get("tags") or result.get("tags")),
    "toneSummary": _clean_text(row.get("tone_summary") or result.get("toneSummary")),
  }


def _profile_text(profile: dict[str, Any] | None, category: str | None = None) -> str:
  if not profile:
    return ""

  text_parts = [
    profile.get("personalColor"),
    profile.get("skinType"),
    profile.get("toneSummary"),
    profile.get("recommendedMood"),
    profile.get("summary"),
    profile.get("shortSummary"),
    profile.get("skinAnalysisSummary"),
    profile.get("baseMakeupGuide"),
    *profile.get("tags", []),
  ]
  guideline = profile.get("makeupGuideline")

  if isinstance(guideline, dict):
    text_parts.extend(guideline.values())

  if category:
    for key in CATEGORY_GUIDE_KEYS.get(category, ()):
      text_parts.append(_get_nested_text(profile, key))

  return " ".join(_clean_text(part) for part in text_parts if _clean_text(part))


def _target_terms(
  profile: dict[str, Any] | None,
  category: str | None = None,
) -> dict[str, list[str]]:
  text = _profile_text(profile, category)
  personal_color = _clean_text(profile.get("personalColor") if profile else "")
  skin_type = _clean_text(profile.get("skinType") if profile else "")

  colors = _contains_any(text, COLOR_TERMS)
  finishes = _contains_any(text, FINISH_TERMS)
  tones = _contains_any(text, TONE_TERMS)
  skin_types = _contains_any(text, SKIN_TYPE_TERMS)

  if "봄" in personal_color or "가을" in personal_color or "warm" in personal_color.lower():
    tones.append("웜톤")

  if "여름" in personal_color or "겨울" in personal_color or "cool" in personal_color.lower():
    tones.append("쿨톤")

  if "건성" in skin_type:
    finishes.extend(["촉촉", "글로우", "윤광"])
    skin_types.append("건성")

  if "지성" in skin_type or "복합성" in skin_type:
    finishes.extend(["세미매트", "매트", "보송"])
    skin_types.append("복합성" if "복합성" in skin_type else "지성")

  return {
    "colors": _dedupe(colors),
    "features": _dedupe(_contains_any(text, FEATURE_TERMS)),
    "finishes": _dedupe(finishes),
    "skinTypes": _dedupe(skin_types),
    "tones": _dedupe(tones),
  }


def _extract_product_specs(
  *,
  brand: str = "",
  category: str,
  maker: str = "",
  product_id: str = "",
  raw_text: str = "",
  source: dict[str, Any] | None = None,
) -> dict[str, Any]:
  source = source or {}
  searchable_text = " ".join(
    [
      raw_text,
      _clean_text(source.get("title")),
      _clean_text(source.get("category2")),
      _clean_text(source.get("category3")),
      _clean_text(source.get("category4")),
      _clean_text(source.get("mallName")),
      brand,
      maker,
    ],
  )
  origin = _clean_text(source.get("origin") or source.get("originArea"))
  colors = _dedupe(_as_list(source.get("colors")) + _contains_any(searchable_text, COLOR_TERMS))
  finishes = _dedupe(_as_list(source.get("effects")) + _contains_any(searchable_text, FINISH_TERMS))
  tones = _dedupe(_contains_any(searchable_text, TONE_TERMS))
  skin_types = _dedupe(
    _as_list(source.get("skinTypes")) +
    _contains_any(searchable_text, SKIN_TYPE_TERMS),
  )
  features = _dedupe(
    _as_list(source.get("features")) +
    _contains_any(searchable_text, FEATURE_TERMS) +
    [f"{tone}용" for tone in tones if tone in {"웜톤", "쿨톤"}],
  )
  containers = _dedupe(_contains_any(searchable_text, CONTAINER_TERMS))

  if category == "base" and not skin_types:
    skin_types = ["모든피부용"]

  return {
    "brand": brand,
    "colors": colors,
    "containerTypes": containers,
    "effects": finishes,
    "features": features,
    "maker": maker,
    "origin": origin,
    "productNumber": product_id,
    "skinTypes": skin_types,
    "tones": tones,
  }


def _score_product_match(
  specs: dict[str, Any],
  category: str,
  index: int,
  profile: dict[str, Any] | None,
) -> tuple[int, list[str]]:
  if not profile:
    return max(82, 96 - index * 2), []

  targets = _target_terms(profile, category)
  matched_terms: list[str] = []
  score = 74

  for product_field, target_field, weight, limit in (
    ("colors", "colors", 5, 15),
    ("effects", "finishes", 4, 12),
    ("skinTypes", "skinTypes", 4, 8),
    ("features", "features", 3, 9),
    ("tones", "tones", 7, 14),
  ):
    product_terms = set(specs.get(product_field) or [])
    target_terms = set(targets.get(target_field) or [])
    matches = sorted(product_terms & target_terms)

    if matches:
      matched_terms.extend(matches)
      score += min(len(matches) * weight, limit)

  product_tones = set(specs.get("tones") or [])
  target_tones = set(targets.get("tones") or [])

  if "웜톤" in product_tones and "쿨톤" in target_tones:
    score -= 8

  if "쿨톤" in product_tones and "웜톤" in target_tones:
    score -= 8

  if category == "lip" and not set(specs.get("colors") or []) & set(targets.get("colors") or []):
    score -= 4

  score -= min(index, 6)

  return min(99, max(62, score)), _dedupe(matched_terms)


def _match_reason(
  category: str,
  matched_terms: list[str],
  profile: dict[str, Any] | None,
) -> str:
  config_reason = CATEGORY_CONFIG[category]["reason"]

  if not profile or not matched_terms:
    return config_reason

  profile_label = _clean_text(profile.get("personalColor")) or _clean_text(
    profile.get("recommendedMood"),
  )
  matched_label = ", ".join(matched_terms[:4])

  if profile_label:
    return f"{profile_label} 보고서에서 강조된 {matched_label} 조건과 상품 특징이 맞아 추천해요."

  return f"보고서의 {matched_label} 조건과 상품 정보가 잘 맞아 추천해요."


def _product_tags(
  category_tags: list[str],
  specs: dict[str, Any],
  matched_terms: list[str],
  fallback: list[str],
) -> list[str]:
  return _dedupe(
    [
      *matched_terms,
      *(specs.get("colors") or []),
      *(specs.get("effects") or []),
      *(specs.get("features") or []),
      *category_tags,
      *fallback,
    ],
  )[:5]


def _build_category_query(category: str, profile: dict[str, Any] | None = None) -> str:
  base_query = CATEGORY_CONFIG[category]["query"]

  if not profile:
    return base_query

  targets = _target_terms(profile, category)
  profile_terms = _dedupe(
    [
      *targets["colors"],
      *targets["tones"],
      *targets["finishes"],
    ],
  )[:4]

  if not profile_terms:
    return base_query

  return " ".join([base_query, *profile_terms])


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


def _build_makeup_look(profile: dict[str, Any] | None) -> dict[str, Any]:
  if not profile:
    return DEFAULT_MAKEUP_LOOK

  targets = _target_terms(profile)
  title = (
    _clean_text(profile.get("recommendedMood")) or
    _clean_text(profile.get("personalColor")) or
    DEFAULT_MAKEUP_LOOK["title"]
  )
  description = (
    _clean_text(profile.get("skinAnalysisSummary")) or
    _clean_text(profile.get("summary")) or
    _clean_text(profile.get("shortSummary")) or
    DEFAULT_MAKEUP_LOOK["description"]
  )
  tags = _dedupe(
    [
      _clean_text(profile.get("personalColor")),
      _clean_text(profile.get("skinType")),
      *targets["colors"],
      *targets["finishes"],
    ],
  )[:4]

  return {
    **DEFAULT_MAKEUP_LOOK,
    "description": description,
    "tags": tags or DEFAULT_MAKEUP_LOOK["tags"],
    "title": title,
  }


def _fallback_products(category: str | None = None) -> list[dict[str, Any]]:
  return []


def _map_naver_item(
  item: dict[str, Any],
  category: str,
  index: int,
  profile: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
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
  specs = _extract_product_specs(
    brand=brand,
    category=category,
    maker=maker,
    product_id=product_id,
    raw_text=title,
    source=item,
  )
  match_rate, matched_terms = _score_product_match(specs, category, index, profile)

  return {
    "id": f"naver-{product_id}" if product_id else _stable_external_id("naver", link),
    "brandName": brand_name,
    "productName": _localized_product_name(title, category),
    "shadeName": "",
    "category": category,
    "matchRate": match_rate,
    "price": _parse_price(item.get("lprice")),
    "tags": _product_tags(category_tags, specs, matched_terms, ["국내 쇼핑", config["label"]]),
    "imageUrl": image_url,
    "purchaseUrl": link,
    "palette": config["palette"],
    "productInfo": specs,
    "reason": _match_reason(category, matched_terms, profile),
  }


async def _fetch_naver_category_products(
  client: httpx.AsyncClient,
  settings: Settings,
  category: str,
  profile: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
  query = _build_category_query(category, profile)
  response = await client.get(
    "https://openapi.naver.com/v1/search/shop.json",
    headers={
      "X-Naver-Client-Id": settings.naver_shopping_client_id,
      "X-Naver-Client-Secret": settings.naver_shopping_client_secret,
    },
    params={
      "display": 20,
      "exclude": "used:rental:cbshop",
      "filter": "naverpay",
      "query": query,
      "sort": "sim",
      "start": 1,
    },
  )
  response.raise_for_status()
  data = response.json()
  products = []

  for item_index, item in enumerate(data.get("items", [])):
    product = _map_naver_item(item, category, item_index, profile)

    if product:
      products.append(product)

  return sorted(products, key=lambda product: product["matchRate"], reverse=True)[:8]


async def _fetch_naver_products(
  settings: Settings,
  category: str | None = None,
  profile: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
  if not settings.naver_shopping_client_id or not settings.naver_shopping_client_secret:
    return []

  categories = [_normalize_category(category)] if _normalize_category(category) else list(PRODUCT_CATEGORIES)
  products: list[dict[str, Any]] = []

  async with httpx.AsyncClient(timeout=6.0) as client:
    results = await asyncio.gather(
      *(
        _fetch_naver_category_products(client, settings, product_category, profile)
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


def _map_db_product(
  row: dict[str, Any],
  index: int,
  profile: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
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

  specs = _extract_product_specs(
    brand=brand_name,
    category=category,
    maker=_clean_text(payload.get("maker") or payload.get("manufacturer")),
    product_id=_clean_text(payload.get("productNumber") or payload.get("product_number") or row.get("external_key")),
    raw_text=" ".join(
      [
        product_name,
        shade_name,
        " ".join(row.get("tags") or []),
        " ".join(row.get("palette") or []),
        json.dumps(payload, ensure_ascii=False),
      ],
    ),
    source=payload,
  )
  match_rate, matched_terms = _score_product_match(specs, category, index, profile)

  return {
    "id": str(row.get("id") or row.get("external_key") or _stable_external_id("db", purchase_url)),
    "brandName": brand_name,
    "productName": _localized_product_name(product_name, category),
    "shadeName": shade_name,
    "category": category,
    "matchRate": _parse_price(payload.get("matchRate")) or match_rate,
    "price": _parse_price(row.get("price_krw")),
    "tags": _product_tags(row.get("tags") or [], specs, matched_terms, [config["label"]]),
    "imageUrl": payload.get("imageUrl") or payload.get("image_url"),
    "purchaseUrl": purchase_url,
    "palette": row.get("palette") or config["palette"],
    "productInfo": specs,
    "reason": payload.get("reason") or _match_reason(category, matched_terms, profile),
  }


async def _fetch_db_products(
  db: Database,
  category: str | None = None,
  profile: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
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
    product = _map_db_product(row, index, profile)

    if product:
      products.append(product)

  return sorted(products, key=lambda product: product["matchRate"], reverse=True)


async def _fetch_report_profile(
  db: Database,
  *,
  auth_provider: str | None = None,
  oauth_sub: str | None = None,
  report_id: str | None = None,
) -> dict[str, Any] | None:
  if not db.is_connected or not oauth_sub:
    return None

  if report_id:
    try:
      UUID(report_id)
    except ValueError:
      report_id = None

  if report_id:
    row = await db.fetchrow(
      """
      select r.*
      from analysis_reports r
      join users u on u.id = r.user_id
      where r.id = $1::uuid
        and u.auth_provider = $2
        and u.oauth_sub = $3
        and u.deleted_at is null
      limit 1
      """,
      report_id,
      auth_provider,
      oauth_sub,
    )
  else:
    row = await db.fetchrow(
      """
      select r.*
      from analysis_reports r
      join users u on u.id = r.user_id
      where u.auth_provider = $1
        and u.oauth_sub = $2
        and u.deleted_at is null
        and r.status = 'completed'
      order by coalesce(r.analyzed_at, r.created_at) desc
      limit 1
      """,
      auth_provider,
      oauth_sub,
    )

  return _normalize_report_payload(row)


async def build_product_recommendation_data(
  db: Database,
  settings: Settings,
  category: str | None = None,
  auth_provider: str | None = None,
  oauth_sub: str | None = None,
  report_id: str | None = None,
) -> tuple[dict[str, Any], str]:
  source = "fallback"
  products: list[dict[str, Any]] = []
  profile = await _fetch_report_profile(
    db,
    auth_provider=auth_provider,
    oauth_sub=oauth_sub,
    report_id=report_id,
  )

  try:
    products = await _fetch_naver_products(settings, category, profile)
    if products:
      source = "naver_shopping_matched" if profile else "naver_shopping"
  except (httpx.HTTPError, ValueError):
    products = []

  if not products:
    products = await _fetch_db_products(db, category, profile)
    if products:
      source = "database_matched" if profile else "database"

  if not products:
    products = _fallback_products(category)

  return (
    {
      "userNickname": "고객",
      "makeupLook": _build_makeup_look(profile),
      "tabs": TABS,
      "products": products,
      "sets": _build_sets(products),
    },
    source,
  )
