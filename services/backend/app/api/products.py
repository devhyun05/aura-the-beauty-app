from __future__ import annotations

from datetime import date, datetime, timezone
import hashlib
import hmac
import json
import re
from typing import Annotated, Any, Literal
import unicodedata
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Header, Query, Response

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user, get_optional_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, get_database, require_database
from app.schemas.product_recommendation import (
  PRODUCT_EVENT_CATEGORIES,
  ProductConsentUpdate,
  ProductEventBatch,
  ProductLikeRequest,
  ProductPrivacyDeleteRequest,
)
from app.services.product_catalog import (
  ensure_like_eligible,
  get_catalog_readiness,
  get_catalog_product,
  map_catalog_product,
  offer_freshness_sql,
  resolve_outbound_offer,
  search_catalog,
)
from app.services.product_external_catalog import (
  AURADIN_CATALOG_SOURCE,
  get_auradin_catalog_products,
  get_auradin_catalog_readiness,
  resolve_auradin_catalog_product,
)
from app.services.product_recommendations import (
  clear_seasonal_recommendation_cache,
  consent_is_active,
  delete_product_personalization,
  feature_status,
  get_ar_recommendations,
  get_cohort_recommendations,
  get_popular_fallback_products,
  get_personalized_recommendations,
  get_product_consents,
  get_seasonal_recommendations,
  record_client_events,
  record_server_event,
  revoke_all_product_consents,
  set_product_consent,
)
from app.services.product_rate_limit import enforce_product_rate_limit
from app.services.product_live_seasonal import resolve_live_external_product
from app.services.makeup_report_product_recommendations import (
  list_owned_makeup_reports,
  parse_categories,
)
from app.services.makeup_report_product_snapshots import (
  dispatch_makeup_report_product_snapshot_jobs,
  makeup_report_product_snapshot_response,
)
from app.services.product_trend_regions import NATIONAL_REGION_CODE, TREND_REGION_LABELS
from app.services.product_trend_health import record_seasonal_serving_outcome
from app.services.auradin_agent.session_manager import resolve_auradin_result_product
from app.services.shopping_products import _safe_naver_result_url, build_product_recommendation_data
from app.services.users import ensure_user


router = APIRouter(prefix="/products", tags=["products"])
RecommendationCategory = Literal["base", "shadow", "brow", "cheek", "lip", "liner"]
_SEARCH_INTENT_NON_WORD = re.compile(r"[^0-9a-zA-Z\u3131-\u318e\uac00-\ud7a3]+")


def _normalize_search_intent(value: str) -> str:
  normalized = unicodedata.normalize("NFKC", value).casefold()
  return " ".join(_SEARCH_INTENT_NON_WORD.sub(" ", normalized).split())[:80]


def _search_intent_similarity(query: str, candidate: str) -> float:
  if not query or not candidate:
    return 0.0
  if query == candidate:
    return 1.0
  query_tokens = set(query.split())
  candidate_tokens = set(candidate.split())
  if not query_tokens or not candidate_tokens:
    return 0.0
  overlap = len(query_tokens & candidate_tokens) / len(query_tokens | candidate_tokens)
  smaller_size = min(len(query_tokens), len(candidate_tokens))
  containment = 0.85 if (
    smaller_size >= 2
    and (query_tokens <= candidate_tokens or candidate_tokens <= query_tokens)
  ) else 0.0
  return max(overlap, containment)


async def _resolve_opaque_search_intent(
  connection: Any,
  settings: Settings,
  *,
  query: str,
  category: str | None,
) -> dict[str, str]:
  """Return a server-authored opaque intent and optional known trend candidate.

  The query text and its normalized representation are deliberately never
  persisted.  Known candidates provide a stable canonical intent; otherwise
  only a domain-separated HMAC digest leaves this function.
  """

  secret = (settings.product_event_signing_secret or "").strip()
  normalized_query = _normalize_search_intent(query)
  if not secret or not normalized_query:
    return {}

  rows = await connection.fetch(
    """
    select id,normalized_keyword,category_codes,status,confidence_score
    from trend_keyword_candidates
    where locale='ko-KR' and status in ('observed','qualified')
      and last_observed_at >= now()-interval '28 days'
    order by case when status='qualified' then 0 else 1 end,
      confidence_score desc,last_observed_at desc
    limit 200
    """
  )
  best_row = None
  best_score = 0.0
  best_category_match = False
  for row in rows:
    candidate = _normalize_search_intent(str(row.get("normalized_keyword") or ""))
    score = _search_intent_similarity(normalized_query, candidate)
    category_codes = {str(value) for value in (row.get("category_codes") or [])}
    category_match = bool(category and category in category_codes)
    if (score, category_match) > (best_score, best_category_match):
      best_row = row
      best_score = score
      best_category_match = category_match

  # Candidate association is intentionally conservative: unrelated queries
  # must not inflate a trend merely because they share one generic token.
  candidate_id = str(best_row["id"]) if best_row is not None and best_score >= 0.67 else None
  canonical_intent = (
    _normalize_search_intent(str(best_row.get("normalized_keyword") or ""))
    if candidate_id and best_row is not None
    else normalized_query
  )
  digest = hmac.new(
    secret.encode("utf-8"),
    b"trend-search-intent-v1\0" + canonical_intent.encode("utf-8"),
    hashlib.sha256,
  ).hexdigest()
  result = {"trendIntentHash": digest}
  if candidate_id:
    result["trendCandidateId"] = candidate_id
  return result


def _search_event_context(
  category: str | None,
  items: list[dict[str, Any]] | None = None,
  *,
  opaque_intent: dict[str, str] | None = None,
) -> dict[str, Any]:
  """Keep search analytics useful without persisting the user's raw query."""
  items = items or []
  context: dict[str, Any] = {"category": category} if category in PRODUCT_EVENT_CATEGORIES else {}
  result_product_ids = [
    str(item["productId"])
    for item in items
    if not item.get("externalSource") and item.get("productId")
  ]
  result_external_identities = [
    f"{item['externalSource']}:{item['productId']}"
    for item in items
    if item.get("externalSource") and item.get("productId")
  ]
  if result_product_ids:
    context["resultProductIds"] = result_product_ids
  if result_external_identities:
    context["resultExternalIdentities"] = result_external_identities
  if items:
    top_result = items[0]
    derived = {
      "catalogCategory": str(top_result.get("category") or "").strip(),
      "catalogBrand": str(top_result.get("brandName") or "").strip(),
      "catalogFinish": str(top_result.get("finish") or "").strip(),
      "catalogColorFamily": str(top_result.get("colorFamily") or "").strip(),
    }
    context.update({key: value for key, value in derived.items() if value})
  if opaque_intent:
    context.update(opaque_intent)
  return context


def _liked_product_display_allowed(row: Any, *, now: datetime) -> bool:
  return bool(
    row.get("is_active")
    and row.get("image_url")
    and row.get("license_status") == "valid"
    and row.get("catalog_status") == "published"
    and "mobile_display" in (row.get("allowed_uses") or [])
    and (not row.get("license_valid_from") or row["license_valid_from"] <= now)
    and (not row.get("license_valid_until") or row["license_valid_until"] > now)
  )


def _map_external_like_snapshot(row: Any) -> dict[str, Any]:
  """Never replay an unsafe persisted seller snapshot to a device."""
  purchase_url = _safe_naver_result_url(row.get("purchase_url"))
  image_url = _safe_naver_result_url(row.get("image_url"))
  identity = {
    "productId": row["external_product_id"],
    "externalSource": row["external_source"],
    "viewerState": {"liked": True},
    "canUnlike": True,
  }
  if not purchase_url or not image_url:
    return {
      **identity,
      "status": "unavailable",
      "brandName": None,
      "productName": None,
      "imageUrl": None,
      "purchaseUrl": None,
      "offer": None,
    }
  return {
    **identity,
    "shadeId": None,
    "brandName": row["brand_name"],
    "productName": row["product_name"],
    "category": row["category"],
    "imageUrl": image_url,
    "purchaseUrl": purchase_url,
    "price": {"amount": row.get("price_amount"), "currency": row["price_currency"], "updatedAt": row.get("source_updated_at")},
    "status": "active",
    "canLike": True,
  }


async def _resolve_external_product_for_like(
  db: Database,
  settings: Settings,
  *,
  external_source: str,
  external_product_id: str,
  owner_subject: str | None = None,
) -> dict[str, Any] | None:
  """Resolve a current item, then a re-validated server-stored snapshot.

  Popular fallback cards can outlive the short live-discovery cache.  The stored
  row was originally written only after server verification, but its URLs are
  checked again before it can be copied into another user's likes.
  """

  product = None
  if external_source == AURADIN_CATALOG_SOURCE:
    product = resolve_auradin_catalog_product(external_product_id)
  elif external_source == "auradin_search" and owner_subject:
    product = await resolve_auradin_result_product(
      owner_subject=owner_subject,
      product_id=external_product_id,
      settings=settings,
      db=db,
    )
  elif external_source == "naver_shopping_search":
    product = await resolve_live_external_product(
      settings,
      external_source=external_source,
      external_product_id=external_product_id,
    )
  if product:
    purchase_url = _safe_naver_result_url(product.get("purchaseUrl"))
    image_url = _safe_naver_result_url(product.get("imageUrl"))
    category = str(product.get("category") or "")
    if purchase_url and image_url and category in PRODUCT_EVENT_CATEGORIES - {"all"}:
      return {
        **product,
        "productId": str(product.get("productId") or product.get("id") or external_product_id),
        "externalSource": external_source,
        "purchaseUrl": purchase_url,
        "imageUrl": image_url,
      }

  if external_source != "naver_shopping_search":
    return None
  row = await db.fetchrow(
    """
    select external_source,external_product_id,brand_name,product_name,category,
      image_url,purchase_url,price_amount,price_currency,source_updated_at
    from external_product_likes
    where external_source=$1 and external_product_id=$2
    order by liked_at desc,user_id
    limit 1
    """,
    external_source,
    external_product_id,
  )
  if not row:
    return None
  purchase_url = _safe_naver_result_url(row.get("purchase_url"))
  image_url = _safe_naver_result_url(row.get("image_url"))
  category = str(row.get("category") or "")
  if not purchase_url or not image_url or category not in PRODUCT_EVENT_CATEGORIES - {"all"}:
    return None
  return {
    "productId": str(row["external_product_id"]),
    "externalSource": str(row["external_source"]),
    "brandName": str(row.get("brand_name") or ""),
    "productName": str(row.get("product_name") or ""),
    "category": category,
    "imageUrl": image_url,
    "purchaseUrl": purchase_url,
    "price": {
      "amount": row.get("price_amount"),
      "currency": str(row.get("price_currency") or "KRW"),
    },
    "sourceUpdatedAt": row.get("source_updated_at"),
  }


def _external_product_price(product: dict[str, Any]) -> tuple[int | float | None, str]:
  price = product.get("price")
  if isinstance(price, dict):
    raw_amount = price.get("amount")
    currency = str(price.get("currency") or "KRW")
  else:
    raw_amount = price if isinstance(price, (int, float)) else product.get("priceKrw")
    currency = "KRW"
  try:
    amount = float(raw_amount) if raw_amount is not None else None
  except (TypeError, ValueError):
    amount = None
  if amount is None or amount < 0:
    return None, currency
  return int(amount) if amount.is_integer() else amount, currency


def _external_product_source_timestamp(product: dict[str, Any]) -> datetime | None:
  value = product.get("sourceUpdatedAt")
  if value is None and isinstance(product.get("price"), dict):
    value = product["price"].get("updatedAt")
  if isinstance(value, datetime):
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
  if not isinstance(value, str) or not value.strip():
    return None
  try:
    parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
  except ValueError:
    return None
  return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _is_at_least_14(birth_date: date | None, *, today: date | None = None) -> bool:
  if birth_date is None:
    return False
  current = today or datetime.now(timezone.utc).date()
  years = current.year - birth_date.year - ((current.month, current.day) < (birth_date.month, birth_date.day))
  return years >= 14


@router.get("/features")
async def get_product_features(
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> dict:
  readiness = await get_catalog_readiness(
    db,
    offer_max_age_hours=settings.product_offer_max_age_hours,
  )
  readiness.update(get_auradin_catalog_readiness())
  popular_fallback = await get_popular_fallback_products(
    db,
    settings,
    user_id=None,
    limit=1,
  )
  readiness["popularFallbackReady"] = bool(popular_fallback)
  fallback_external_source = str((popular_fallback[0] if popular_fallback else {}).get("externalSource") or "")
  readiness["popularFallbackSource"] = (
    fallback_external_source
    if fallback_external_source
    else "trustedCatalog"
    if popular_fallback
    else None
  )
  return success(
    {
      "flags": feature_status(settings),
      "catalogConfigured": db.is_connected,
      "externalDataReady": bool(popular_fallback),
      "readiness": readiness,
    },
    {"source": "server-config"},
  )


@router.get("/recommendations")
async def get_product_recommendations(
  category: str | None = None,
  look_index: int | None = None,
  report_id: str | None = None,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(get_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  """Compatibility endpoint retained while section APIs roll out."""

  data, source = await build_product_recommendation_data(
    db,
    settings,
    category,
    auth_provider=auth.provider,
    look_index=look_index,
    oauth_sub=auth.subject,
    report_id=report_id,
  )
  return success(data, {"source": source, "deprecated": False, "contractVersion": "v1-compatible"})


@router.get("/recommendations/makeup-reports")
async def get_makeup_report_picker(
  response: Response,
  limit: int = Query(default=20, ge=1, le=50),
  offset: int = Query(default=0, ge=0),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(
    db,
    user_id=user["id"],
    scope="recommendation",
    limit=settings.product_recommendation_rate_limit_per_minute,
  )
  data = await list_owned_makeup_reports(
    db,
    settings,
    user_id=user["id"],
    limit=limit,
    offset=offset,
  )
  response.headers["Cache-Control"] = "private, no-store"
  return success(data, {"source": "owned-makeup-recommendations", "contractVersion": "makeup-report-v1"})


@router.get("/recommendations/makeup-reports/{report_id}")
async def get_makeup_report_products(
  report_id: UUID,
  response: Response,
  background_tasks: BackgroundTasks,
  look_id: str | None = Query(default=None, alias="lookId", min_length=1, max_length=80),
  categories: str | None = Query(default=None, max_length=120),
  per_category_limit: int = Query(default=6, alias="perCategoryLimit", ge=1, le=8),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(
    db,
    user_id=user["id"],
    scope="recommendation",
    limit=settings.product_recommendation_rate_limit_per_minute,
  )
  runs = await dispatch_makeup_report_product_snapshot_jobs(
    db=db,
    background_tasks=background_tasks,
    user_id=user["id"],
    report_id=report_id,
    look_id=look_id,
    settings=settings,
    all_looks=False,
  )
  data = await makeup_report_product_snapshot_response(
    db,
    settings,
    user_id=user["id"],
    run=runs[0],
    categories=parse_categories(categories),
    per_category_limit=per_category_limit,
  )
  response.headers["Cache-Control"] = "private, no-store"
  return success(
    data,
    {
      "source": "makeup-report-snapshot",
      "algorithmVersion": data.get("algorithmVersion"),
      "contractVersion": "makeup-report-snapshot-v1",
    },
  )


@router.post("/recommendations/makeup-reports/{report_id}/refresh")
async def refresh_makeup_report_products(
  report_id: UUID,
  response: Response,
  background_tasks: BackgroundTasks,
  look_id: str | None = Query(default=None, alias="lookId", min_length=1, max_length=80),
  categories: str | None = Query(default=None, max_length=120),
  per_category_limit: int = Query(default=6, alias="perCategoryLimit", ge=1, le=8),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  """Create an explicit new revision; ordinary GETs never re-rank a report."""

  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(
    db,
    user_id=user["id"],
    scope="recommendation",
    limit=settings.product_recommendation_rate_limit_per_minute,
  )
  runs = await dispatch_makeup_report_product_snapshot_jobs(
    db=db,
    background_tasks=background_tasks,
    user_id=user["id"],
    report_id=report_id,
    look_id=look_id,
    settings=settings,
    all_looks=False,
    force=True,
  )
  data = await makeup_report_product_snapshot_response(
    db,
    settings,
    user_id=user["id"],
    run=runs[0],
    categories=parse_categories(categories),
    per_category_limit=per_category_limit,
  )
  response.headers["Cache-Control"] = "private, no-store"
  return success(
    data,
    {
      "source": "makeup-report-snapshot-refresh",
      "algorithmVersion": data.get("algorithmVersion"),
      "contractVersion": "makeup-report-snapshot-v1",
    },
  )


@router.get("/recommendations/ar")
async def get_ar_product_recommendations(
  response: Response,
  style_id: UUID | None = None,
  regions: str = "base,shadow,brow,cheek,lip,liner",
  per_region_limit: int = Query(default=6, ge=1, le=20),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(db, user_id=user["id"], scope="recommendation", limit=settings.product_recommendation_rate_limit_per_minute)
  requested_regions = list(dict.fromkeys(value.strip() for value in regions.split(",") if value.strip()))
  data = await get_ar_recommendations(
    db,
    settings,
    user_id=user["id"],
    style_id=style_id,
    regions=requested_regions,
    per_region_limit=per_region_limit,
  )
  response.headers["Cache-Control"] = "private, no-store"
  return success(
    data,
    {
      "source": "popular-fallback" if data.get("fallback") else "licensed-catalog",
      "generatedAt": datetime.now(timezone.utc),
      "algorithmVersion": "ar_authoring_color_ciede2000_v1",
    },
  )


@router.get("/recommendations/seasonal")
async def get_seasonal_product_recommendations(
  response: Response,
  background_tasks: BackgroundTasks,
  locale: Literal["ko-KR"] = Query(default="ko-KR"),
  limit: int = Query(default=12, ge=1, le=60),
  category: RecommendationCategory | None = Query(default=None),
  region_code: str = Query(
    default=NATIONAL_REGION_CODE,
    alias="regionCode",
    min_length=5,
    max_length=5,
    pattern=r"^KR-[0-9]{2}$",
  ),
  db: Database = Depends(get_database),
  settings: Settings = Depends(get_settings),
  auth: AuthContext | None = Depends(get_optional_current_user),
  if_none_match: str | None = Header(default=None, alias="If-None-Match"),
) -> Any:
  if region_code not in TREND_REGION_LABELS:
    raise AppError(422, "INVALID_REGION_CODE", "regionCode must be KR-00 or a supported Korean region code.")
  viewer_id = None
  if auth is not None and db.is_connected:
    viewer_id = (await ensure_user(db, auth))["id"]
  data = await get_seasonal_recommendations(
    db,
    settings,
    user_id=viewer_id,
    locale=locale,
    region_code=region_code,
    limit=limit,
    category=category,
  )
  collection = data.get("collection") or {}
  used_fallback = bool(data.get("fallback")) or bool(
    collection.get("id") == "popular-fallback"
    or collection.get("regionCode") != region_code
    or collection.get("freshnessStatus") in {"stale", "fallback"}
  )
  if category is None and limit == 12:
    background_tasks.add_task(
      record_seasonal_serving_outcome,
      db,
      locale=locale,
      region_code=region_code,
      used_fallback=used_fallback,
    )
  etag_payload = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str).encode()
  etag = f'"{hashlib.sha256(etag_payload).hexdigest()}"'
  cache_control = "private, max-age=120, stale-if-error=300" if viewer_id else "public, max-age=120, stale-if-error=300"
  response_headers = {"ETag": etag, "Cache-Control": cache_control, "Vary": "Authorization"}
  if if_none_match and etag in {value.strip() for value in if_none_match.split(",")}:
    return Response(status_code=304, headers=response_headers)
  response.headers["ETag"] = etag
  response.headers["Cache-Control"] = cache_control
  response.headers["Vary"] = "Authorization"
  source = (
    "popular-fallback"
    if collection.get("id") == "popular-fallback" or (not collection and data.get("fallback"))
    else "cached-trend-collection+auradin-catalog"
    if collection.get("catalogSupplemented")
    else "cached-trend-collection"
  )
  return success(data, {
    "source": source,
    "trendSource": collection.get("sourceName"),
    "productSource": (
      "db-popular+auradin-catalog"
      if collection.get("id") == "popular-fallback"
      else
      "licensed-catalog+auradin-catalog"
      if collection.get("catalogSupplemented")
      else "licensed-catalog"
      if collection
      else "popular-fallback"
    ),
  })


@router.get("/recommendations/personalized")
async def get_personalized_product_recommendations(
  response: Response,
  limit: int = Query(default=12, ge=1, le=60),
  category: RecommendationCategory | None = Query(default=None),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(db, user_id=user["id"], scope="recommendation", limit=settings.product_recommendation_rate_limit_per_minute)
  data = await get_personalized_recommendations(
    db,
    settings,
    user_id=user["id"],
    nickname=str(user.get("nickname") or "회원"),
    limit=limit,
    category=category,
  )
  response.headers["Cache-Control"] = "private, no-store"
  return success(
    data,
    {
      "source": "popular-fallback" if data.get("fallback") else "consented-engagement",
      "algorithmVersion": data.get("algorithmVersion") or "engagement_decay_v1",
    },
  )


@router.get("/recommendations/cohort")
async def get_cohort_product_recommendations(
  response: Response,
  limit: int = Query(default=12, ge=1, le=60),
  category: RecommendationCategory | None = Query(default=None),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(db, user_id=user["id"], scope="recommendation", limit=settings.product_recommendation_rate_limit_per_minute)
  data = await get_cohort_recommendations(
    db, settings, user_id=user["id"], limit=limit, category=category
  )
  response.headers["Cache-Control"] = "private, no-store"
  return success(
    data,
    {"source": "popular-fallback" if data.get("fallback") else "privacy-thresholded-cohort-v1"},
  )


@router.get("/search")
async def search_products(
  response: Response,
  q: Annotated[str, Query(min_length=1, max_length=80)],
  category: str | None = Query(default=None),
  limit: int = Query(default=20, ge=1, le=50),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(get_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  response.headers["Cache-Control"] = "private, no-store"
  request_id = uuid4()
  if not db.is_connected:
    items = await get_auradin_catalog_products(
      db,
      user_id=None,
      limit=limit,
      categories=[category] if category in PRODUCT_EVENT_CATEGORIES - {"all"} else None,
      strategy="search",
      query=q,
    )
    return success(
      {"status": "ready" if items else "empty", "searchRequestId": str(request_id), "items": items, "nextCursor": None},
      {"source": AURADIN_CATALOG_SOURCE, "catalogVersion": "auradin_mvp_20260708"},
    )
  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(db, user_id=user["id"], scope="search", limit=settings.product_search_rate_limit_per_minute)
  source = "trusted-catalog"
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      items = await search_catalog(
        connection,  # type: ignore[arg-type]
        query=q,
        category=category,
        limit=limit,
        offer_max_age_hours=settings.product_offer_max_age_hours,
      )
      if len(items) < limit:
        external_items = await get_auradin_catalog_products(
          connection,  # type: ignore[arg-type]
          user_id=user["id"],
          limit=limit - len(items),
          categories=[category] if category in PRODUCT_EVENT_CATEGORIES - {"all"} else None,
          strategy="search",
          query=q,
          exclude_identities={
            (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
            for item in items
          },
        )
        if external_items:
          source = (
            f"trusted-catalog+{AURADIN_CATALOG_SOURCE}"
            if items
            else AURADIN_CATALOG_SOURCE
          )
          items.extend(external_items)
      consent_granted = bool(
        settings.engagement_personalization_v1
        and await consent_is_active(
          connection,  # type: ignore[arg-type]
          user_id=user["id"],
          purpose="engagement_personalization",
        )
      )
      opaque_intent = (
        await _resolve_opaque_search_intent(
          connection,
          settings,
          query=q,
          category=category,
        )
        if consent_granted else {}
      )
      await record_server_event(
        connection,  # type: ignore[arg-type]
        settings,
        user_id=user["id"],
        event_type="search_submit",
        section="search",
        search_request_id=request_id,
        context=_search_event_context(category, items, opaque_intent=opaque_intent),
        consent_granted=consent_granted,
      )
  return success(
    {"status": "ready" if items else "empty", "searchRequestId": str(request_id), "items": items, "nextCursor": None},
    {
      "source": source,
      "catalogVersion": (
        "catalog_v2"
        if source == "trusted-catalog"
        else "catalog_v2+auradin_mvp_20260708"
        if source.startswith("trusted-catalog+")
        else "auradin_mvp_20260708"
      ),
    },
  )


@router.get("/liked")
async def get_liked_products(
  response: Response,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(db, user_id=user["id"], scope="detail", limit=settings.product_recommendation_rate_limit_per_minute)
  rows = await db.fetch(
    f"""
    select p.id as product_id, p.brand_name, p.product_name, p.category::text as category,
      p.catalog_version, p.updated_at as source_updated_at, p.is_active, p.catalog_status, p.license_status,
      p.license_valid_from,p.license_valid_until,p.allowed_uses,
      s.id as shade_id, s.shade_name, s.srgb_hex, s.finish,
      a.asset_url as image_url,
      o.id as offer_id, o.seller_name, o.seller_domain, o.currency, o.price_amount,
      o.price_updated_at, o.availability_status, o.affiliate_type, o.disclosure_label,
      l.liked_at
    from user_product_likes l
    join products p on p.id=l.product_id
    left join lateral (select * from product_shades x where x.product_id=p.id and x.is_active=true
      and x.license_status='valid' and x.allowed_uses @> array['mobile_display']::text[]
      and (x.license_valid_from is null or x.license_valid_from<=now())
      and (x.license_valid_until is null or x.license_valid_until>now())
      order by case when x.id=l.source_shade_id then 0 else 1 end,
        x.reviewed_at desc nulls last limit 1) s on true
    left join lateral (select * from product_assets x where x.product_id=p.id and x.is_active=true
      and x.asset_type='packshot' and x.license_status='valid' and x.allowed_uses @> array['mobile_display']::text[]
      and (x.valid_from is null or x.valid_from<=now())
      and (x.valid_until is null or x.valid_until>now())
      and (x.shade_id is null or x.shade_id=s.id)
      order by case when x.shade_id=s.id then 0 else 1 end,
        x.reviewed_at desc nulls last limit 1) a on true
    left join lateral (select * from product_offers x where x.product_id=p.id and x.is_active=true
      and x.availability_status in ('in_stock','limited') and x.license_status='valid'
      and x.allowed_uses @> array['mobile_display']::text[]
      and (x.valid_until is null or x.valid_until>now())
      and (x.shade_id is null or x.shade_id=s.id)
      {offer_freshness_sql("x", "$2")}
      order by case when x.shade_id=s.id then 0 else 1 end,
        x.price_updated_at desc nulls last limit 1) o on true
    where l.user_id=$1 order by l.liked_at desc
    """,
    user["id"],
    settings.product_offer_max_age_hours,
  )
  items = []
  now = datetime.now(timezone.utc)
  for row in rows:
    if not _liked_product_display_allowed(row, now=now):
      items.append(
        {
          "productId": str(row["product_id"]),
          "status": "unavailable",
          "brandName": None,
          "productName": None,
          "imageUrl": None,
          "offer": None,
          "viewerState": {"liked": True},
          "canUnlike": True,
        }
      )
      continue
    item = map_catalog_product(row, liked=True)
    item["status"] = "active" if row.get("offer_id") else "soldOut"
    items.append(item)
  external_rows = await db.fetch(
    """
    select external_source,external_product_id,brand_name,product_name,category,
      image_url,purchase_url,price_amount,price_currency,source_updated_at,liked_at
    from external_product_likes where user_id=$1 order by liked_at desc
    """,
    user["id"],
  )
  for row in external_rows:
    items.append(_map_external_like_snapshot(row))
  response.headers["Cache-Control"] = "private, no-store"
  return success({"products": items})


@router.post("/external/{external_source}/{external_product_id}/like")
async def like_external_product(
  external_source: str,
  external_product_id: str,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(db, user_id=user["id"], scope="like", limit=settings.product_write_rate_limit_per_minute)
  product = await _resolve_external_product_for_like(
    db,
    settings,
    external_source=external_source,
    external_product_id=external_product_id,
    owner_subject=auth.subject,
  )
  if not product:
    raise AppError(404, "EXTERNAL_PRODUCT_NOT_FOUND", "External product is no longer available from the verified source.")
  purchase_url = str(product["purchaseUrl"])
  image_url = str(product["imageUrl"])
  price_amount, price_currency = _external_product_price(product)
  await db.execute(
    """
    insert into external_product_likes (
      user_id,external_source,external_product_id,brand_name,product_name,category,
      image_url,purchase_url,price_amount,price_currency,source_updated_at,liked_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
    on conflict (user_id,external_source,external_product_id) do update set
      brand_name=excluded.brand_name,product_name=excluded.product_name,
      category=excluded.category,image_url=excluded.image_url,purchase_url=excluded.purchase_url,
      price_amount=excluded.price_amount,price_currency=excluded.price_currency,
      source_updated_at=excluded.source_updated_at,liked_at=now()
    """,
    user["id"],
    external_source,
    external_product_id,
    product["brandName"],
    product["productName"],
    product["category"],
    image_url,
    purchase_url,
    price_amount,
    price_currency,
    _external_product_source_timestamp(product),
  )
  if external_source == AURADIN_CATALOG_SOURCE and external_product_id.startswith("auradin-seed-"):
    await db.execute(
      """delete from external_product_likes
      where user_id=$1 and external_source='auradin_search' and external_product_id=$2""",
      user["id"],
      external_product_id,
    )
  clear_seasonal_recommendation_cache(user_id=user["id"])
  return success({"productId": external_product_id, "externalSource": external_source, "liked": True})


@router.delete("/external/{external_source}/{external_product_id}/like")
async def unlike_external_product(
  external_source: str,
  external_product_id: str,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(db, user_id=user["id"], scope="like", limit=settings.product_write_rate_limit_per_minute)
  if external_source == AURADIN_CATALOG_SOURCE and external_product_id.startswith("auradin-seed-"):
    await db.execute(
      """delete from external_product_likes where user_id=$1 and external_product_id=$2
      and external_source in ('auradin_catalog','auradin_search')""",
      user["id"],
      external_product_id,
    )
  else:
    await db.execute(
      "delete from external_product_likes where user_id=$1 and external_source=$2 and external_product_id=$3",
      user["id"], external_source, external_product_id,
    )
  clear_seasonal_recommendation_cache(user_id=user["id"])
  return success({"productId": external_product_id, "externalSource": external_source, "liked": False})


@router.post("/events")
async def create_product_events(
  payload: ProductEventBatch,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(db, user_id=user["id"], scope="event", limit=settings.product_event_rate_limit_per_minute)
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      result = await record_client_events(connection, settings, user_id=user["id"], events=payload.events)  # type: ignore[arg-type]
  return success(result)


@router.get("/consents")
async def read_product_consents(
  response: Response,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  response.headers["Cache-Control"] = "private, no-store"
  return success(await get_product_consents(db, user_id=user["id"]))


@router.put("/consents")
async def update_product_consent(
  payload: ProductConsentUpdate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(db, user_id=user["id"], scope="privacy", limit=settings.product_write_rate_limit_per_minute)
  if payload.accepted and settings.product_personalization_require_age_14 and not _is_at_least_14(user.get("birth_date")):
    raise AppError(403, "PERSONALIZATION_AGE_RESTRICTED", "Optional product personalization requires a verified age of 14 or older.")
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      consent = await set_product_consent(
        connection,  # type: ignore[arg-type]
        user_id=user["id"],
        purpose=payload.purpose,
        accepted=payload.accepted,
        version=payload.version,
      )
  return success({"consent": consent})


@router.post("/privacy/delete")
async def delete_product_privacy_data(
  payload: ProductPrivacyDeleteRequest,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(db, user_id=user["id"], scope="privacy", limit=settings.product_write_rate_limit_per_minute)
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      counts = await delete_product_personalization(connection, user_id=user["id"], target=payload.target)  # type: ignore[arg-type]
      if payload.target == "all_product_personalization":
        await revoke_all_product_consents(connection, user_id=user["id"])  # type: ignore[arg-type]
      await connection.execute(
        """
        insert into data_deletion_requests (user_id,target_type,status,completed_at,reason)
        values ($1,'product_personalization','completed',now(),$2)
        """,
        user["id"],
        payload.target,
      )
  return success({"status": "completed", "deleted": counts})


@router.get("/{product_id}")
async def get_product_detail(
  product_id: UUID,
  response: Response,
  shade_id: UUID | None = Query(default=None),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(db, user_id=user["id"], scope="detail", limit=settings.product_recommendation_rate_limit_per_minute)
  product = await get_catalog_product(
    db,
    product_id,
    user_id=user["id"],
    shade_id=shade_id,
    offer_max_age_hours=settings.product_offer_max_age_hours,
  )
  if not product:
    raise AppError(404, "PRODUCT_NOT_FOUND", "Product was not found.")
  response.headers["Cache-Control"] = "private, no-store"
  return success({"product": product}, {"source": "trusted-catalog"})


@router.post("/{product_id}/like")
async def like_product(
  product_id: UUID,
  payload: ProductLikeRequest | None = Body(default=None),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(db, user_id=user["id"], scope="like", limit=settings.product_write_rate_limit_per_minute)
  source_shade_id = payload.source_shade_id if payload else None
  await ensure_like_eligible(
    db,
    product_id=product_id,
    source_shade_id=source_shade_id,
    offer_max_age_hours=settings.product_offer_max_age_hours,
  )
  await db.fetchrow(
    """
    with changed as (
      insert into user_product_likes (user_id,product_id,source_shade_id)
      values ($1,$2,$3) on conflict (user_id,product_id) do update set
        source_shade_id=coalesce(excluded.source_shade_id,user_product_likes.source_shade_id)
      where user_product_likes.source_shade_id is distinct from
        coalesce(excluded.source_shade_id,user_product_likes.source_shade_id)
      returning product_id,source_shade_id
    ), recorded as (
      insert into product_engagement_events (
        event_id,user_id,product_id,shade_id,event_type,section,occurred_at,context
      )
      select $4,$1,product_id,source_shade_id,'like','legacy',now(),'{}'::jsonb from changed
      where $5::boolean and coalesce((
        select accepted from user_consents where user_id=$1
          and consent_type::text='engagement_personalization'
        order by recorded_at desc,id desc limit 1
      ),false)
      on conflict (user_id,event_id) do nothing returning 1
    )
    select exists(select 1 from changed) as changed
    """,
    user["id"],
    product_id,
    source_shade_id,
    uuid4(),
    settings.engagement_personalization_v1,
  )
  clear_seasonal_recommendation_cache(user_id=user["id"])
  return success({"productId": str(product_id), "liked": True})


@router.delete("/{product_id}/like")
async def unlike_product(
  product_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(db, user_id=user["id"], scope="like", limit=settings.product_write_rate_limit_per_minute)
  await db.fetchrow(
    """
    with changed as (
      delete from user_product_likes where user_id=$1 and product_id=$2
      returning product_id,source_shade_id
    ), recorded as (
      insert into product_engagement_events (
        event_id,user_id,product_id,shade_id,event_type,section,occurred_at,context
      )
      select $3,$1,product_id,source_shade_id,'unlike','legacy',now(),'{}'::jsonb from changed
      where $4::boolean and coalesce((
        select accepted from user_consents where user_id=$1
          and consent_type::text='engagement_personalization'
        order by recorded_at desc,id desc limit 1
      ),false)
      on conflict (user_id,event_id) do nothing returning 1
    )
    select exists(select 1 from changed) as changed
    """,
    user["id"],
    product_id,
    uuid4(),
    settings.engagement_personalization_v1,
  )
  clear_seasonal_recommendation_cache(user_id=user["id"])
  return success({"productId": str(product_id), "liked": False})


@router.post("/{product_id}/offers/{offer_id}/outbound")
async def open_product_offer(
  product_id: UUID,
  offer_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  await enforce_product_rate_limit(db, user_id=user["id"], scope="outbound", limit=settings.product_outbound_rate_limit_per_minute)
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      outbound = await resolve_outbound_offer(connection, settings, offer_id=offer_id, product_id=product_id)  # type: ignore[arg-type]
      await record_server_event(
        connection,  # type: ignore[arg-type]
        settings,
        user_id=user["id"],
        event_type="seller_outbound",
        section="legacy",
        product_id=product_id,
        shade_id=UUID(outbound["shadeId"]) if outbound.get("shadeId") else None,
      )
  return success(outbound)
