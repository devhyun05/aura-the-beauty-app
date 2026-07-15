"""Section-oriented product recommendations, consent and event collection."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from typing import Any, Iterable
from uuid import UUID, uuid4

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.schemas.product_recommendation import ProductEvent
from app.services.auradin_agent.session_manager import resolve_auradin_result_product
from app.services.product_catalog import (
  ELIGIBLE_EVIDENCE_TYPES,
  catalog_select,
  displayable_product_where,
  map_catalog_product,
  offer_freshness_sql,
)
from app.services.product_color import delta_e_ciede2000
from app.services.product_cohorts import broad_personal_color_bucket
from app.services.product_external_catalog import (
  AURADIN_CATALOG_SOURCE,
  auradin_catalog_event_features,
  external_product_identity,
  get_auradin_catalog_products,
)
from app.services.product_live_seasonal import get_live_seasonal_recommendations, resolve_live_external_product
from app.services.saved_ar_looks import normalize_saved_ar_look
from app.services.shopping_products import _safe_naver_result_url


REGION_LABELS = {
  "base": "베이스",
  "shadow": "아이섀도우",
  "brow": "아이브로우",
  "cheek": "블러셔",
  "lip": "립",
  "liner": "아이라이너",
}
PRODUCT_CATEGORY_LABELS = {
  "base": "베이스",
  "shadow": "아이섀도우",
  "brow": "아이브로우",
  "cheek": "블러셔",
  "lip": "립",
  "liner": "아이라이너",
}
POPULAR_FALLBACK_REASON_CODE = "POPULAR_FALLBACK"
POPULAR_FALLBACK_REASON_LABEL = "추천 데이터가 쌓이는 동안 인기 상품을 보여드려요"
CONSENT_VERSION_DEFAULT = "product-personalization-v1"
CONSENT_TYPES = {"engagement_personalization", "color_cohort"}
PERSONALIZATION_SIGNAL_WEIGHTS = {
  "like": 4.0,
  "seller_outbound": 3.0,
  "product_open": 1.0,
  "search_result_open": 1.0,
  "search_submit": 0.75,
  "unlike": -3.0,
  "hide": -5.0,
}


def _fallback_category_values(categories: Iterable[str] | None) -> list[str]:
  requested = list(dict.fromkeys(str(value).strip() for value in (categories or []) if str(value).strip()))
  return [value for value in requested if value in PRODUCT_CATEGORY_LABELS] or list(PRODUCT_CATEGORY_LABELS)


def _mark_popular_fallback(item: dict[str, Any]) -> dict[str, Any]:
  item.update(
    {
      "reasonCodes": [POPULAR_FALLBACK_REASON_CODE],
      "reasonLabels": [POPULAR_FALLBACK_REASON_LABEL],
      "recommendationBasis": "popularFallback",
    }
  )
  return item


async def get_popular_fallback_products(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID | None,
  limit: int,
  categories: Iterable[str] | None = None,
) -> list[dict[str, Any]]:
  """Return display-safe popular products without claiming personal relevance.

  Licensed catalog rows are preferred. When that catalog has not been loaded yet,
  the helper uses server-verified external-like snapshots, the packaged Auradin
  external catalog, and finally validated live seasonal results.
  Every external URL is re-validated and every item is labelled as a generic
  popularity fallback.
  """

  if limit <= 0:
    return []
  category_values = _fallback_category_values(categories)
  if not db.is_connected:
    packaged = await get_auradin_catalog_products(
      db,
      user_id=None,
      limit=limit,
      categories=category_values,
      strategy="popular",
    )
    if len(packaged) >= limit:
      return packaged
    packaged.extend(await _live_popular_fallback_products(
      settings,
      limit=limit - len(packaged),
      categories=category_values,
      existing_identities={
        (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
        for item in packaged
      },
    ))
    return packaged
  rows = await db.fetch(
    f"""
    with candidates as (
      {catalog_select(offer_max_age_placeholder="$4")}
      where {displayable_product_where("$4")}
        and a.id is not null and o.id is not null
        and p.category::text=any($2::text[])
    )
    select candidates.*,(viewer_like.product_id is not null) as liked
    from candidates
    left join user_product_likes viewer_like
      on $1::uuid is not null and viewer_like.user_id=$1
        and viewer_like.product_id=candidates.product_id
    left join lateral (
      select count(*)::int as like_count
      from user_product_likes popularity_like
      where popularity_like.product_id=candidates.product_id
        and popularity_like.liked_at>=now()-interval '180 days'
    ) popularity_likes on true
    left join lateral (
      select coalesce(sum(case
        when popularity_event.event_type='seller_outbound' then 3
        when popularity_event.event_type in ('product_open','search_result_open') then 1
        else 0 end),0)::int as engagement_score
      from product_engagement_events popularity_event
      where popularity_event.product_id=candidates.product_id
        and popularity_event.occurred_at>=now()-interval '90 days'
    ) popularity_events on true
    order by
      (coalesce(popularity_likes.like_count,0)*4 + coalesce(popularity_events.engagement_score,0)) desc,
      candidates.source_updated_at desc,
      candidates.product_id
    limit $3
    """,
    user_id,
    category_values,
    limit,
    settings.product_offer_max_age_hours,
  )
  items = [
    _mark_popular_fallback(map_catalog_product(row, liked=bool(row.get("liked"))))
    for row in rows
  ]
  remaining = limit - len(items)
  if remaining <= 0:
    return items

  external_rows = await db.fetch(
    """
    with ranked as (
      select snapshot.*,
        count(*) over (
          partition by snapshot.external_source,snapshot.external_product_id
        )::int as popularity_count,
        row_number() over (
          partition by snapshot.external_source,snapshot.external_product_id
          order by snapshot.liked_at desc,snapshot.user_id
        ) as snapshot_rank
      from external_product_likes snapshot
      where (
          snapshot.external_source='naver_shopping_search'
          or (
            snapshot.external_source='auradin_search'
            and $1::uuid is not null
            and snapshot.user_id=$1
          )
        )
        and snapshot.category=any($2::text[])
        and snapshot.liked_at>=now()-interval '365 days'
    )
    select ranked.external_source,ranked.external_product_id,ranked.brand_name,
      ranked.product_name,ranked.category,ranked.image_url,ranked.purchase_url,
      ranked.price_amount,ranked.price_currency,ranked.source_updated_at,
      exists(
        select 1 from external_product_likes viewer_like
        where $1::uuid is not null and viewer_like.user_id=$1
          and viewer_like.external_source=ranked.external_source
          and viewer_like.external_product_id=ranked.external_product_id
      ) as liked
    from ranked
    where ranked.snapshot_rank=1
    order by ranked.popularity_count desc,ranked.liked_at desc,ranked.external_product_id
    limit $3
    """,
    user_id,
    category_values,
    remaining,
  )
  for row in external_rows:
    purchase_url = _safe_naver_result_url(row.get("purchase_url"))
    image_url = _safe_naver_result_url(row.get("image_url"))
    category = str(row.get("category") or "")
    if not purchase_url or not image_url or category not in PRODUCT_CATEGORY_LABELS:
      continue
    items.append(
      _mark_popular_fallback(
        {
          "productId": str(row["external_product_id"]),
          "shadeId": None,
          "brandName": str(row.get("brand_name") or ""),
          "productName": str(row.get("product_name") or ""),
          "category": category,
          "shadeName": None,
          "shadeHex": None,
          "finish": None,
          "imageUrl": image_url,
          "purchaseUrl": purchase_url,
          "price": {
            "amount": row.get("price_amount"),
            "currency": str(row.get("price_currency") or "KRW"),
            "updatedAt": row.get("source_updated_at"),
          },
          "offer": None,
          "viewerState": {"liked": bool(row.get("liked"))},
          "status": "active",
          "canLike": True,
          "canUnlike": True,
          "externalSource": str(row["external_source"]),
          "sponsored": False,
        }
      )
    )
  remaining = limit - len(items)
  if remaining <= 0:
    return items
  existing_identities = {
    (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
    for item in items
  }
  items.extend(
    await get_auradin_catalog_products(
      db,
      user_id=user_id,
      limit=remaining,
      categories=category_values,
      strategy="popular",
      exclude_identities=existing_identities,
    )
  )
  remaining = limit - len(items)
  if remaining <= 0:
    return items
  existing_identities = {
    (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
    for item in items
  }
  items.extend(
    await _live_popular_fallback_products(
      settings,
      limit=remaining,
      categories=category_values,
      existing_identities=existing_identities,
    )
  )
  return items


async def _section_popular_fallback_products(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID | None,
  limit: int,
  variant: str,
  categories: Iterable[str] | None = None,
) -> list[dict[str, Any]]:
  """Return a stable section-specific slice so generic shelves are not clones."""

  if limit <= 0:
    return []
  variant_slots = {"ar": 0, "seasonal": 1, "personalized": 2, "cohort": 3}
  slot = variant_slots.get(variant, 0)
  pool = await get_popular_fallback_products(
    db,
    settings,
    user_id=user_id,
    limit=limit * 8,
    categories=categories,
  )
  if variant in {"personalized", "cohort"}:
    pool = [item for item in pool if not bool((item.get("viewerState") or {}).get("liked"))]
  if len(pool) <= limit:
    return pool
  offset = (slot * limit) % len(pool)
  rotated = pool[offset:] + pool[:offset]
  return rotated[:limit]


async def _live_popular_fallback_products(
  settings: Settings,
  *,
  limit: int,
  categories: Iterable[str],
  existing_identities: set[tuple[str, str]],
) -> list[dict[str, Any]]:
  """Use the server-validated live seasonal feed as an opt-in final fallback."""

  if not settings.auradin_live_discovery_enabled or limit <= 0:
    return []
  category_values = set(_fallback_category_values(categories))
  live = await get_live_seasonal_recommendations(
    settings,
    locale="ko-KR",
    # The provider is category-balanced. Twelve results include two rounds
    # across all six categories for category-specific AR shelves.
    limit=max(limit, 12),
  )
  items: list[dict[str, Any]] = []
  seen = set(existing_identities)
  for candidate in live.get("items", []):
    if not isinstance(candidate, dict):
      continue
    external_source = str(candidate.get("externalSource") or "")
    product_id = str(candidate.get("productId") or "")
    category = str(candidate.get("category") or "")
    identity = (external_source, product_id)
    if (
      external_source != "naver_shopping_search"
      or not product_id
      or category not in category_values
      or identity in seen
    ):
      continue
    purchase_url = _safe_naver_result_url(candidate.get("purchaseUrl"))
    image_url = _safe_naver_result_url(candidate.get("imageUrl"))
    if not purchase_url or not image_url:
      continue
    # Do not mutate a cached seasonal item: that shelf must retain its original
    # CURRENT_SEASON_TREND explanation after this fallback is assembled.
    item = dict(candidate)
    item.update(
      {
        "purchaseUrl": purchase_url,
        "imageUrl": image_url,
        "viewerState": {"liked": False},
        "canLike": True,
        "canUnlike": False,
      }
    )
    items.append(_mark_popular_fallback(item))
    seen.add(identity)
    if len(items) >= limit:
      break
  return items


async def _popular_fallback_groups(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  per_category_limit: int,
  categories: Iterable[str] | None = None,
) -> list[dict[str, Any]]:
  groups: list[dict[str, Any]] = []
  category_values = _fallback_category_values(categories)
  for category in category_values:
    label = PRODUCT_CATEGORY_LABELS[category]
    items = await _section_popular_fallback_products(
      db,
      settings,
      user_id=user_id,
      limit=per_category_limit,
      variant="ar",
      categories=[category],
    )
    if items:
      groups.append(
        {
          "region": category,
          "label": label,
          "status": "ready",
          "items": items,
          "nextCursor": None,
          "recommendationBasis": "popularFallback",
        }
      )
  return groups


def _in_experiment(user_id: UUID, percent: int, namespace: str) -> bool:
  digest = hashlib.sha256(f"{namespace}:{user_id}".encode()).digest()
  return int.from_bytes(digest[:4], "big") % 100 < percent


def feature_status(settings: Settings) -> dict[str, bool]:
  return {
    "productHubV2": settings.product_hub_v2,
    "seasonalRecommendationsV1": settings.seasonal_recommendations_v1,
    "arRecipePersistenceV1": settings.ar_recipe_persistence_v1,
    "arProductRecommendationsV1": settings.ar_product_recommendations_v1,
    "engagementPersonalizationV1": settings.engagement_personalization_v1,
    "cohortRecommendationsV1": settings.cohort_recommendations_v1,
    "auradinLiveDiscoveryEnabled": settings.auradin_live_discovery_enabled,
    "legacyNaverProductSearch": settings.legacy_naver_product_search,
    "naverShoppingInsightEnabled": settings.naver_shopping_insight_enabled,
  }


def _json(value: Any) -> dict[str, Any]:
  if isinstance(value, dict):
    return value
  if isinstance(value, str):
    try:
      parsed = json.loads(value)
      return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
      return {}
  return {}


def _is_seasonal_source_stale(
  value: Any,
  *,
  max_age_days: int,
  now: datetime | None = None,
) -> bool:
  if isinstance(value, datetime):
    source_updated_at = value
  elif isinstance(value, str):
    try:
      source_updated_at = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
      return True
  else:
    return True
  if source_updated_at.tzinfo is None:
    source_updated_at = source_updated_at.replace(tzinfo=timezone.utc)
  reference = now or datetime.now(timezone.utc)
  return source_updated_at > reference or source_updated_at < reference - timedelta(days=max_age_days)


def _projection_regions(style_payload: Any) -> list[dict[str, Any]]:
  payload = _json(style_payload)
  projection = payload.get("recommendationProjection")
  if not isinstance(projection, dict) or projection.get("version") != "ar_recommendation_projection_v1":
    return []
  regions = projection.get("regions")
  return [region for region in regions if isinstance(region, dict)] if isinstance(regions, list) else []


def _lab_from_projection(region: dict[str, Any]) -> tuple[float, float, float] | None:
  lab = region.get("authoringColorLab")
  if not isinstance(lab, dict):
    return None
  try:
    return float(lab["l"]), float(lab["a"]), float(lab["b"])
  except (KeyError, TypeError, ValueError):
    return None


def _finish_score(target: str, candidate: str) -> float:
  if not target or not candidate:
    return 0
  if target == candidate:
    return 1
  groups = (
    {"gloss", "glow", "sheer_glow", "shimmer"},
    {"matte", "powder"},
    {"cream", "satin", "natural"},
    {"soft_line", "defined_line"},
  )
  return 0.5 if any(target in group and candidate in group for group in groups) else 0


def rank_ar_candidates(
  projection: dict[str, Any],
  rows: Iterable[dict[str, Any]],
  *,
  limit: int,
  max_delta_e: float = 18.0,
) -> list[dict[str, Any]]:
  """Rank eligible shade rows without presenting the score as a match percentage."""

  target_lab = _lab_from_projection(projection)
  if target_lab is None:
    return []
  target_finish = str(projection.get("canonicalFinish") or "")
  ranked: list[tuple[float, float, dict[str, Any]]] = []
  for row in rows:
    if row.get("evidence_type") not in ELIGIBLE_EVIDENCE_TYPES:
      continue
    try:
      candidate_lab = (float(row["lab_l"]), float(row["lab_a"]), float(row["lab_b"]))
    except (KeyError, TypeError, ValueError):
      continue
    distance = delta_e_ciede2000(target_lab, candidate_lab)
    if distance > max_delta_e:
      continue
    color_score = max(0.0, 1.0 - min(distance, 50.0) / 50.0)
    finish_score = _finish_score(target_finish, str(row.get("finish") or ""))
    evidence_score = max(0.0, min(1.0, float(row.get("evidence_confidence") or 0)))
    score = color_score * 0.55 + finish_score * 0.25 + evidence_score * 0.20
    ranked.append((score, distance, row))
  ranked.sort(key=lambda item: (-item[0], item[1], str(item[2].get("product_id"))))

  results: list[dict[str, Any]] = []
  brand_counts: Counter[str] = Counter()
  for _, distance, row in ranked:
    brand = str(row.get("brand_name") or "")
    if brand_counts[brand] >= 2:
      continue
    item = map_catalog_product(row, liked=bool(row.get("liked")))
    reasons = ["CLOSE_AUTHORING_COLOR"]
    labels = ["선택한 AR 색과 가까워요"]
    if _finish_score(target_finish, str(row.get("finish") or "")) >= 1:
      reasons.append("MATCHING_FINISH")
      labels.append("피니시가 같아요")
    item.update(
      {
        "reasonCodes": reasons,
        "reasonLabels": labels,
        "basedOnRegion": str(projection.get("productRegion") or ""),
        "colorDistance": round(distance, 4),
      }
    )
    results.append(item)
    brand_counts[brand] += 1
    if len(results) >= limit:
      break
  return results


def _sign_exposure(settings: Settings, *, run_id: UUID, user_id: UUID, product_id: str) -> str | None:
  secret = getattr(settings, "product_event_signing_secret", None)
  if not secret:
    return None
  expires_at = int((datetime.now(timezone.utc) + timedelta(seconds=settings.product_exposure_token_ttl_seconds)).timestamp())
  message = f"{run_id}:{user_id}:{product_id}:{expires_at}".encode()
  digest = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
  return f"v1.{run_id}.{expires_at}.{digest}"


def verify_exposure_token(
  settings: Settings,
  *,
  token: str,
  run_id: UUID,
  user_id: UUID,
  product_id: UUID | str,
) -> None:
  secret = getattr(settings, "product_event_signing_secret", None)
  if not secret:
    raise AppError(503, "EVENT_SIGNING_NOT_CONFIGURED", "Private recommendation event signing is unavailable.")
  parts = token.split(".")
  if len(parts) != 4 or parts[0] != "v1" or parts[1] != str(run_id):
    raise AppError(422, "INVALID_EXPOSURE_TOKEN", "Recommendation exposure token is invalid.")
  try:
    expires_at = int(parts[2])
  except ValueError as error:
    raise AppError(422, "INVALID_EXPOSURE_TOKEN", "Recommendation exposure token is invalid.") from error
  if expires_at < int(datetime.now(timezone.utc).timestamp()):
    raise AppError(422, "EXPIRED_EXPOSURE_TOKEN", "Recommendation exposure token has expired.")
  message = f"{run_id}:{user_id}:{product_id}:{expires_at}".encode()
  expected = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
  if not hmac.compare_digest(expected, parts[3]):
    raise AppError(422, "INVALID_EXPOSURE_TOKEN", "Recommendation exposure token is invalid.")


async def get_ar_recommendations(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  style_id: UUID | None,
  regions: list[str],
  per_region_limit: int,
) -> dict[str, Any]:
  requested = list(dict.fromkeys(region for region in regions if region in REGION_LABELS))
  if not requested:
    requested = list(PRODUCT_CATEGORY_LABELS)
  if not settings.ar_product_recommendations_v1:
    fallback_groups = await _popular_fallback_groups(
      db,
      settings,
      user_id=user_id,
      per_category_limit=per_region_limit,
      categories=requested,
    )
    return {
      "status": "unavailable",
      "basedOn": None,
      "groups": fallback_groups,
      "fallback": {"type": "popular", "reason": "AR_RECOMMENDATIONS_DISABLED"},
    }

  style = await db.fetchrow(
    """
    select id, title, style_payload
    from saved_makeup_styles
    where user_id = $1 and archived_at is null
      and ($2::uuid is null or id = $2)
      and style_payload ->> 'schemaVersion' = 'saved_ar_look_v1'
    order by case when id = $2 then 0 else 1 end, saved_at desc
    limit 1
    """,
    user_id,
    style_id,
  )
  if not style:
    if style_id:
      # Do not reveal whether a style belongs to another account.
      raise AppError(404, "AR_STYLE_NOT_FOUND", "Saved AR look was not found.")
    fallback_groups = await _popular_fallback_groups(
      db,
      settings,
      user_id=user_id,
      per_category_limit=per_region_limit,
      categories=requested,
    )
    return {
      "status": "noArStyle",
      "basedOn": None,
      "groups": fallback_groups,
      "fallback": {"type": "popular", "reason": "NO_SAVED_AR_LOOK"},
    }

  try:
    normalized_style_payload = normalize_saved_ar_look(_json(style.get("style_payload")))
  except AppError:
    normalized_style_payload = _json(style.get("style_payload"))
  projection_regions = _projection_regions(normalized_style_payload)
  if not projection_regions:
    fallback_groups = await _popular_fallback_groups(
      db,
      settings,
      user_id=user_id,
      per_category_limit=per_region_limit,
      categories=requested,
    )
    return {
      "status": "unsupportedRecipe",
      "basedOn": {"styleId": str(style["id"])},
      "groups": fallback_groups,
      "fallback": {"type": "popular", "reason": "UNSUPPORTED_AR_RECIPE"},
    }

  groups: list[dict[str, Any]] = []
  run_id = uuid4()
  result_ids: list[UUID] = []
  external_result_identities: list[str] = []
  for region in projection_regions:
    product_region = str(region.get("productRegion") or "")
    if product_region not in requested:
      continue
    rows = await db.fetch(
      f"""
      select
        p.id as product_id, p.brand_name, p.product_name, p.category::text as category,
        p.catalog_version, p.updated_at as source_updated_at,
        s.id as shade_id, s.shade_name, s.srgb_hex, s.lab_l, s.lab_a, s.lab_b,
        s.finish, s.coverage, s.opacity, s.evidence_type, s.evidence_confidence,
        a.asset_url as image_url,
        o.id as offer_id, o.seller_name, o.seller_domain, o.currency, o.price_amount,
        o.price_updated_at, o.availability_status, o.affiliate_type, o.disclosure_label,
        (viewer_like.product_id is not null) as liked
      from product_shades s
      join products p on p.id = s.product_id
      join lateral (
        select candidate.* from product_assets candidate
        where candidate.product_id = p.id and candidate.is_active = true
          and candidate.asset_type = 'packshot'
          and candidate.license_status = 'valid'
          and candidate.allowed_uses @> array['mobile_display', 'recommendation']::text[]
          and (candidate.valid_from is null or candidate.valid_from <= now())
          and (candidate.valid_until is null or candidate.valid_until > now())
          and (candidate.shade_id is null or candidate.shade_id = s.id)
        order by case when candidate.shade_id = s.id then 0 else 1 end, candidate.reviewed_at desc nulls last
        limit 1
      ) a on true
      join lateral (
        select candidate.* from product_offers candidate
        where candidate.product_id = p.id and candidate.is_active = true
          and candidate.availability_status in ('in_stock', 'limited')
          and candidate.license_status = 'valid'
          and candidate.allowed_uses @> array['mobile_display']::text[]
          and (candidate.valid_until is null or candidate.valid_until > now())
          and (candidate.shade_id is null or candidate.shade_id = s.id)
          {offer_freshness_sql("candidate", "$4")}
        order by case when candidate.shade_id = s.id then 0 else 1 end,
          candidate.price_updated_at desc nulls last
        limit 1
      ) o on true
      left join user_product_likes viewer_like on viewer_like.user_id = $2 and viewer_like.product_id = p.id
      where p.is_active = true and p.catalog_status = 'published'
        and p.license_status = 'valid'
        and p.allowed_uses @> array['mobile_display', 'recommendation']::text[]
        and (p.license_valid_from is null or p.license_valid_from <= now())
        and (p.license_valid_until is null or p.license_valid_until > now())
        and s.is_active = true and s.product_region = $1
        and s.license_status = 'valid'
        and s.allowed_uses @> array['mobile_display', 'recommendation']::text[]
        and s.evidence_type = any($3::text[])
        and s.lab_l is not null and s.lab_a is not null and s.lab_b is not null
        and (s.license_valid_from is null or s.license_valid_from <= now())
        and (s.license_valid_until is null or s.license_valid_until > now())
      limit 200
      """,
      product_region,
      user_id,
      sorted(ELIGIBLE_EVIDENCE_TYPES),
      settings.product_offer_max_age_hours,
    )
    items = rank_ar_candidates(
      region,
      rows,
      limit=per_region_limit,
      max_delta_e=settings.product_ar_max_delta_e,
    )
    if len(items) < per_region_limit:
      external_items = await get_auradin_catalog_products(
        db,
        user_id=user_id,
        limit=per_region_limit - len(items),
        categories=[product_region],
        strategy="ar",
        target_lab=_lab_from_projection(region),
        target_finish=str(region.get("canonicalFinish") or "") or None,
        target_texture=str(region.get("canonicalTexture") or "") or None,
        max_delta_e=settings.product_ar_max_delta_e,
        exclude_identities={
          (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
          for item in items
        },
      )
      for item in external_items:
        item["basedOnRegion"] = product_region
      items.extend(external_items)
    for item in items:
      exposure_identity = (
        external_product_identity(str(item["externalSource"]), str(item["productId"]))
        if item.get("externalSource")
        else str(item["productId"])
      )
      item["exposureToken"] = _sign_exposure(
        settings,
        run_id=run_id,
        user_id=user_id,
        product_id=exposure_identity,
      )
      if item.get("externalSource"):
        external_result_identities.append(
          external_product_identity(str(item["externalSource"]), str(item["productId"]))
        )
      else:
        result_ids.append(UUID(item["productId"]))
    groups.append(
      {
        "region": product_region,
        "label": REGION_LABELS[product_region],
        "status": "ready" if items else "noEligibleProducts",
        "items": items,
        "nextCursor": None,
      }
    )

  ar_match_count = len(result_ids) + len(external_result_identities)
  ar_match_categories = [str(group["region"]) for group in groups if group.get("items")]
  fallback_groups = await _popular_fallback_groups(
    db,
    settings,
    user_id=user_id,
    per_category_limit=per_region_limit * 2,
    categories=requested,
  )
  ar_by_category = {str(group["region"]): group for group in groups}
  fallback_by_category = {str(group["region"]): group for group in fallback_groups}
  merged_groups: list[dict[str, Any]] = []
  fallback_categories: list[str] = []
  for category in requested:
    label = PRODUCT_CATEGORY_LABELS[category]
    ar_group = ar_by_category.get(category)
    fallback_group = fallback_by_category.get(category)
    if ar_group and ar_group.get("items"):
      ar_items = list(ar_group["items"])
      existing_identities = {
        (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
        for item in ar_items
      }
      fallback_item_count = 0
      for item in (fallback_group or {}).get("items") or []:
        if len(ar_items) >= per_region_limit:
          break
        identity = (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
        if identity in existing_identities:
          continue
        ar_items.append(item)
        existing_identities.add(identity)
        fallback_item_count += 1
      merged_groups.append(
        {
          **ar_group,
          "items": ar_items,
          "arItemCount": len(ar_group["items"]),
          "fallbackItemCount": fallback_item_count,
          "recommendationBasis": "mixed" if fallback_item_count else "arMatch",
        }
      )
      if fallback_item_count:
        fallback_categories.append(category)
    elif fallback_group and fallback_group.get("items"):
      fallback_items = list(fallback_group["items"])[:per_region_limit]
      merged_groups.append(
        {
          **fallback_group,
          "items": fallback_items,
          "arItemCount": 0,
          "fallbackItemCount": len(fallback_items),
        }
      )
      fallback_categories.append(category)
    elif ar_group:
      merged_groups.append(ar_group)
    else:
      merged_groups.append(
        {
          "region": category,
          "label": label,
          "status": "noEligibleProducts",
          "items": [],
          "nextCursor": None,
        }
      )
  groups = merged_groups
  run_product_ids: list[UUID] = []
  run_external_identities: list[str] = []
  seen_internal_ids: set[UUID] = set()
  seen_external_identities: set[str] = set()
  for group in groups:
    for item in group.get("items") or []:
      if item.get("externalSource"):
        identity = external_product_identity(str(item["externalSource"]), str(item["productId"]))
        if identity not in seen_external_identities:
          run_external_identities.append(identity)
          seen_external_identities.add(identity)
        exposure_identity = identity
      else:
        product_id = UUID(str(item["productId"]))
        if product_id not in seen_internal_ids:
          run_product_ids.append(product_id)
          seen_internal_ids.add(product_id)
        exposure_identity = str(product_id)
      item["exposureToken"] = _sign_exposure(
        settings,
        run_id=run_id,
        user_id=user_id,
        product_id=exposure_identity,
      )
  await db.execute(
    """
    insert into product_recommendation_runs (
      id, user_id, source_style_id, strategy, algorithm_version,
      product_ids, recommendation_payload, consent_snapshot, expires_at
    ) values ($1, $2, $3, 'ar_v1', 'ar_authoring_color_ciede2000_v1', $4, $5::jsonb,
      '{}'::jsonb, now() + ($6::int * interval '1 day'))
    """,
    run_id,
    user_id,
    style["id"],
    run_product_ids,
    json.dumps(
      {
        "regions": [group["region"] for group in groups],
        "arMatchCategories": ar_match_categories,
        "fallbackCategories": fallback_categories,
        "externalProductIdentities": run_external_identities,
      }
    ),
    settings.product_run_retention_days,
  )
  has_ar_matches = ar_match_count > 0
  return {
    "status": "ready" if has_ar_matches else "noEligibleProducts",
    "runId": str(run_id),
    "basedOn": {
      "styleId": str(style["id"]),
      "styleTitle": style.get("title"),
      "envelopeVersion": "saved_ar_look_v1",
      "recipeVersion": 2,
      "colorSemantics": "authoring_color",
    },
    "arMatchCount": ar_match_count,
    "arMatchCategories": ar_match_categories,
    "fallbackCategories": fallback_categories,
    "groups": groups,
    "fallback": (
      {"type": "popular", "reason": "AR_CATEGORY_COVERAGE" if has_ar_matches else "NO_ELIGIBLE_AR_MATCHES"}
      if fallback_categories else None
    ),
  }


async def get_seasonal_recommendations(
  db: Database,
  settings: Settings,
  *,
  locale: str,
  limit: int,
  category: str | None = None,
) -> dict[str, Any]:
  category_filter = category if category in PRODUCT_CATEGORY_LABELS else None
  category_values = [category_filter] if category_filter else list(PRODUCT_CATEGORY_LABELS)
  if not settings.seasonal_recommendations_v1:
    items = await _section_popular_fallback_products(
      db, settings, user_id=None, limit=limit, variant="seasonal", categories=category_values
    )
    return _seasonal_fallback_response(items, reason="SEASONAL_RECOMMENDATIONS_DISABLED", unavailable=True)
  collection = await db.fetchrow(
    """
    select * from product_seasonal_collections
    where locale = $1 and status = 'published'
      and valid_from <= now() and valid_until > now()
      and reviewed_at is not null and published_at is not null
    order by published_at desc limit 1
    """,
    locale,
  ) if db.is_connected else None
  if not collection:
    if settings.auradin_live_discovery_enabled:
      live = await get_live_seasonal_recommendations(settings, locale=locale, limit=limit)
      live = dict(live)
      live["collection"] = dict(live.get("collection") or {})
      live_items: list[dict[str, Any]] = []
      identities: set[tuple[str, str]] = set()
      for candidate in live.get("items", []):
        if not isinstance(candidate, dict):
          continue
        identity = (
          str(candidate.get("externalSource") or "catalog"),
          str(candidate.get("productId") or ""),
        )
        if (
          not identity[1]
          or identity in identities
          or (category_filter and candidate.get("category") != category_filter)
        ):
          continue
        live_items.append(candidate)
        identities.add(identity)
        if len(live_items) >= limit:
          break
      live_item_count = len(live_items)
      theme_slug = str(live["collection"].get("slug") or "")
      seasonal_items: list[dict[str, Any]] = []
      if len(live_items) < limit:
        seasonal_items = await get_auradin_catalog_products(
          db,
          user_id=None,
          limit=limit - len(live_items),
          categories=category_values,
          strategy="seasonal",
          seasonal_theme=theme_slug,
          exclude_identities=identities,
        )
        live_items.extend(seasonal_items)
        identities.update(
          (str(item["externalSource"]), str(item["productId"])) for item in seasonal_items
        )
      generic_items: list[dict[str, Any]] = []
      if len(live_items) < limit:
        remaining = limit - len(live_items)
        generic_pool = await get_auradin_catalog_products(
          db,
          user_id=None,
          limit=remaining * 2,
          categories=category_values,
          strategy="popular",
          exclude_identities=identities,
        )
        generic_items = (generic_pool[remaining:] + generic_pool[:remaining])[:remaining]
        live_items.extend(generic_items)
      if live_items:
        live["collection"].update(
          {
            "catalogSupplemented": bool(seasonal_items or generic_items),
            "liveItemCount": live_item_count,
            "attributeMatchedItemCount": len(seasonal_items),
            "genericCoverageItemCount": len(generic_items),
          }
        )
        if generic_items:
          live["fallback"] = {"type": "popular", "reason": "LIVE_SEASONAL_COVERAGE"}
        live["items"] = live_items
        live["status"] = "ready"
        return live
    items = await _section_popular_fallback_products(
      db, settings, user_id=None, limit=limit, variant="seasonal", categories=category_values
    )
    return _seasonal_fallback_response(items, reason="NO_PUBLISHED_SEASONAL_COLLECTION")
  rows = await db.fetch(
    f"""
    select
      p.id as product_id, p.brand_name, p.product_name, p.category::text as category,
      p.catalog_version, p.updated_at as source_updated_at,
      s.id as shade_id, s.shade_name, s.srgb_hex, s.finish,
      a.asset_url as image_url,
      o.id as offer_id, o.seller_name, o.seller_domain, o.currency, o.price_amount,
      o.price_updated_at, o.availability_status, o.affiliate_type, o.disclosure_label,
      i.reason_code, i.sponsorship_type, i.position
    from product_seasonal_collection_items i
    join products p on p.id = i.product_id
    left join product_shades s on s.id = i.shade_id and s.product_id = p.id and s.is_active = true
      and s.license_status='valid' and s.allowed_uses @> array['mobile_display','recommendation']::text[]
      and (s.license_valid_from is null or s.license_valid_from<=now())
      and (s.license_valid_until is null or s.license_valid_until>now())
    join lateral (
      select candidate.* from product_assets candidate
      where candidate.product_id = p.id and candidate.is_active = true
        and candidate.asset_type = 'packshot' and candidate.license_status = 'valid'
        and candidate.allowed_uses @> array['mobile_display', 'recommendation']::text[]
        and (candidate.valid_from is null or candidate.valid_from <= now())
        and (candidate.valid_until is null or candidate.valid_until > now())
        and (candidate.shade_id is null or candidate.shade_id = s.id)
      order by case when candidate.shade_id = s.id then 0 else 1 end,
        candidate.reviewed_at desc nulls last limit 1
    ) a on true
    join lateral (
      select candidate.* from product_offers candidate
      where candidate.product_id = p.id and candidate.is_active = true
        and candidate.availability_status in ('in_stock', 'limited')
        and candidate.license_status = 'valid'
        and candidate.allowed_uses @> array['mobile_display']::text[]
        and (candidate.valid_until is null or candidate.valid_until > now())
        and (candidate.shade_id is null or candidate.shade_id = s.id)
        {offer_freshness_sql("candidate", "$3")}
      order by case when candidate.shade_id = s.id then 0 else 1 end,
        candidate.price_updated_at desc nulls last limit 1
    ) o on true
    where i.collection_id = $1 and p.is_active = true and p.catalog_status = 'published'
      and ($4::text is null or p.category::text=$4)
      and p.license_status = 'valid'
      and p.allowed_uses @> array['mobile_display', 'recommendation']::text[]
      and (p.license_valid_from is null or p.license_valid_from <= now())
      and (p.license_valid_until is null or p.license_valid_until > now())
    order by i.position limit $2
    """,
    collection["id"],
    limit,
    settings.product_offer_max_age_hours,
    category_filter,
  )
  items = []
  for row in rows:
    item = map_catalog_product(row)
    item["reasonCodes"] = [str(row.get("reason_code") or "EDITOR_REVIEWED")]
    item["reasonLabels"] = ["에디터가 검수했어요"]
    sponsorship_type = str(row.get("sponsorship_type") or "organic")
    item["sponsored"] = sponsorship_type != "organic"
    item["sponsorshipType"] = sponsorship_type
    item["disclosureLabel"] = "광고" if sponsorship_type == "sponsored" else "제휴 링크" if sponsorship_type == "affiliate" else None
    items.append(item)
  editorial_item_count = len(items)
  identities = {
    (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
    for item in items
  }
  attribute_matched_items: list[dict[str, Any]] = []
  if len(items) < limit:
    attribute_matched_items = await get_auradin_catalog_products(
      db,
      user_id=None,
      limit=limit - len(items),
      categories=category_values,
      strategy="seasonal",
      seasonal_theme=str(collection.get("slug") or ""),
      exclude_identities=identities,
    )
    items.extend(attribute_matched_items)
    identities.update(
      (str(item["externalSource"]), str(item["productId"]))
      for item in attribute_matched_items
    )
  generic_coverage_items: list[dict[str, Any]] = []
  if len(items) < limit:
    generic_coverage_items = await get_auradin_catalog_products(
      db,
      user_id=None,
      limit=limit - len(items),
      categories=category_values,
      strategy="popular",
      exclude_identities=identities,
    )
    items.extend(generic_coverage_items)
  if not items:
    fallback_items = await _section_popular_fallback_products(
      db, settings, user_id=None, limit=limit, variant="seasonal", categories=category_values
    )
    return _seasonal_fallback_response(fallback_items, reason="SEASONAL_COLLECTION_HAS_NO_ELIGIBLE_ITEMS")
  source_payload = _json(collection.get("source_payload"))
  source_updated_at = source_payload.get("sourceUpdatedAt")
  return {
    "status": "ready" if items else "empty",
    "collection": {
      "id": str(collection["id"]),
      "slug": collection["slug"],
      "title": collection["title"],
      "summary": collection["summary"],
      "validFrom": collection["valid_from"],
      "validUntil": collection["valid_until"],
      "reviewedAt": collection["reviewed_at"],
      "sourceLabels": collection.get("source_labels") or [],
      "sourceUpdatedAt": source_updated_at,
      "trendWindow": collection.get("trend_window"),
      "revision": collection.get("revision"),
      "catalogSupplemented": bool(attribute_matched_items or generic_coverage_items),
      "editorialItemCount": editorial_item_count,
      "attributeMatchedItemCount": len(attribute_matched_items),
      "genericCoverageItemCount": len(generic_coverage_items),
      "isStale": _is_seasonal_source_stale(
        source_updated_at,
        max_age_days=settings.product_seasonal_source_max_age_days,
      ),
    },
    "items": items,
    "nextCursor": None,
    "fallback": (
      {"type": "popular", "reason": "EDITORIAL_SEASONAL_COVERAGE"}
      if generic_coverage_items else None
    ),
  }


def _seasonal_fallback_response(
  items: list[dict[str, Any]],
  *,
  reason: str,
  unavailable: bool = False,
) -> dict[str, Any]:
  if not items:
    return {
      "status": "unavailable" if unavailable else "empty",
      "collection": None,
      "items": [],
      "nextCursor": None,
      "fallback": {"type": "popular", "reason": reason},
    }
  now = datetime.now(timezone.utc)
  return {
    "status": "ready",
    "collection": {
      "id": "popular-fallback",
      "slug": "popular-now",
      "title": "지금 많이 저장한 제품",
      "summary": "최신 시즌 컬렉션을 준비하는 동안 앱에서 많이 저장한 인기 상품을 보여드려요.",
      "validFrom": now,
      "validUntil": now + timedelta(minutes=5),
      "reviewedAt": now,
      "sourceLabels": ["앱 내 인기"],
      "sourceUpdatedAt": now,
      "trendWindow": "최근 180일",
      "revision": 1,
      "isStale": False,
      "isLive": True,
      "providerStatus": "popularFallback",
      "refreshAfterSeconds": 300,
    },
    "items": items,
    "nextCursor": None,
    "fallback": {"type": "popular", "reason": reason},
  }


async def consent_is_active(db: Database, *, user_id: UUID, purpose: str) -> bool:
  if purpose not in CONSENT_TYPES:
    return False
  row = await db.fetchrow(
    f"""
    select accepted from user_consents
    where user_id = $1 and consent_type::text = $2
    order by recorded_at desc, id desc limit 1
    """,
    user_id,
    purpose,
  )
  return bool(row and row.get("accepted"))


async def get_product_consents(db: Database, *, user_id: UUID) -> dict[str, Any]:
  rows = await db.fetch(
    """
    select distinct on (consent_type) consent_type::text as purpose, accepted, version, accepted_at, revoked_at
    from user_consents
    where user_id = $1 and consent_type::text = any($2::text[])
    order by consent_type, recorded_at desc, id desc
    """,
    user_id,
    sorted(CONSENT_TYPES),
  )
  states = {purpose: {"accepted": False, "version": None, "acceptedAt": None, "revokedAt": None} for purpose in CONSENT_TYPES}
  for row in rows:
    states[str(row["purpose"])] = {
      "accepted": bool(row["accepted"]),
      "version": row["version"],
      "acceptedAt": row.get("accepted_at"),
      "revokedAt": row.get("revoked_at"),
    }
  return {"purposes": states}


async def set_product_consent(
  db: Database,
  *,
  user_id: UUID,
  purpose: str,
  accepted: bool,
  version: str,
) -> dict[str, Any]:
  if purpose not in CONSENT_TYPES:
    raise AppError(422, "INVALID_CONSENT_PURPOSE", "Unsupported product consent purpose.")
  if version != CONSENT_VERSION_DEFAULT:
    raise AppError(422, "INVALID_CONSENT_VERSION", "Unsupported product consent text version.")
  row = await db.fetchrow(
    """
    insert into user_consents (user_id, consent_type, version, accepted, accepted_at, revoked_at, metadata)
    values ($1, $2::consent_type, $3, $4, case when $4 then now() else null end,
      case when $4 then null else now() end, '{"source":"product_settings"}'::jsonb)
    returning consent_type::text as purpose, accepted, version, accepted_at, revoked_at
    """,
    user_id,
    purpose,
    version,
    accepted,
  )
  if not accepted:
    await delete_product_personalization(
      db,
      user_id=user_id,
      target="engagement_consent" if purpose == "engagement_personalization" else "cohort",
    )
  return dict(row or {})


async def revoke_all_product_consents(
  db: Database,
  *,
  user_id: UUID,
  version: str = "product-personalization-v1",
) -> None:
  """Record explicit withdrawal for both optional product-personalization purposes."""

  for purpose in sorted(CONSENT_TYPES):
    await db.execute(
      """
      insert into user_consents (user_id,consent_type,version,accepted,accepted_at,revoked_at,metadata)
      values ($1,$2::consent_type,$3,false,null,now(),'{"source":"product_privacy_delete"}'::jsonb)
      """,
      user_id,
      purpose,
      version,
    )


async def delete_product_personalization(db: Database, *, user_id: UUID, target: str) -> dict[str, int]:
  counts = {"events": 0, "profiles": 0, "runs": 0, "cohort": 0}
  if target in {"engagement", "engagement_consent", "all_product_personalization"}:
    status = await db.execute("delete from product_engagement_events where user_id = $1", user_id)
    counts["events"] = int(status.rsplit(" ", 1)[-1]) if status.rsplit(" ", 1)[-1].isdigit() else 0
  if target in {"profile", "engagement_consent", "all_product_personalization"}:
    status = await db.execute("delete from product_preference_profiles where user_id = $1", user_id)
    counts["profiles"] = int(status.rsplit(" ", 1)[-1]) if status.rsplit(" ", 1)[-1].isdigit() else 0
    status = await db.execute("delete from product_recommendation_runs where user_id = $1 and strategy = 'personalized_v1'", user_id)
    counts["runs"] = int(status.rsplit(" ", 1)[-1]) if status.rsplit(" ", 1)[-1].isdigit() else 0
  if target in {"cohort", "engagement_consent", "all_product_personalization"}:
    status = await db.execute("delete from product_color_cohort_memberships where user_id = $1", user_id)
    counts["cohort"] = int(status.rsplit(" ", 1)[-1]) if status.rsplit(" ", 1)[-1].isdigit() else 0
  return counts


def validate_event_source(event: ProductEvent) -> None:
  if event.section in {"ar", "personalized"} and (not event.run_id or not event.exposure_token):
    raise AppError(422, "EVENT_SOURCE_REQUIRED", "Private recommendations require runId and exposureToken.")
  if event.section == "seasonal" and not event.collection_id:
    raise AppError(422, "EVENT_SOURCE_REQUIRED", "Seasonal events require collectionId.")
  if event.section == "search" and not event.search_request_id:
    raise AppError(422, "EVENT_SOURCE_REQUIRED", "Search events require searchRequestId.")
  if event.event_type == "search_result_open" and event.section != "search":
    raise AppError(422, "INVALID_EVENT_MATRIX", "search_result_open is only valid for search results.")
  if event.event_type == "impression":
    try:
      viewport_ratio = float(event.context.get("viewportRatio"))
      visible_ms = int(event.context.get("visibleMs"))
    except (TypeError, ValueError) as error:
      raise AppError(422, "INVALID_IMPRESSION", "Impressions require viewportRatio and visibleMs.") from error
    if viewport_ratio < 0.6 or viewport_ratio > 1 or visible_ms < 700 or visible_ms > 60000:
      raise AppError(422, "INVALID_IMPRESSION", "Impression visibility does not meet the collection threshold.")


async def validate_event_reference(
  db: Database,
  *,
  user_id: UUID,
  event: ProductEvent,
  settings: Settings | None = None,
) -> None:
  if event.shade_id is not None:
    shade_pair = await db.fetchrow(
      """
      select exists(
        select 1 from product_shades
        where id=$1 and product_id=$2 and is_active=true
      ) as valid
      """,
      event.shade_id,
      event.product_id,
    )
    if not shade_pair or not shade_pair.get("valid"):
      raise AppError(422, "INVALID_EVENT_SHADE", "Event shade does not belong to its product.")
  if event.section in {"ar", "personalized"}:
    if event.product_id is not None:
      row = await db.fetchrow(
        """select exists(select 1 from product_recommendation_runs
          where id=$1 and user_id=$2 and expires_at>now() and $3=any(product_ids)) as valid""",
        event.run_id,
        user_id,
        event.product_id,
      )
    else:
      identity = external_product_identity(
        str(event.external_source or ""),
        str(event.external_product_id or ""),
      )
      row = await db.fetchrow(
        """select exists(select 1 from product_recommendation_runs
          where id=$1 and user_id=$2 and expires_at>now()
            and recommendation_payload->'externalProductIdentities' ? $3) as valid""",
        event.run_id,
        user_id,
        identity,
      )
  elif event.section == "seasonal":
    if event.product_id is not None:
      row = await db.fetchrow(
        """select exists(select 1 from product_seasonal_collection_items i
          join product_seasonal_collections c on c.id=i.collection_id
          where i.collection_id=$1 and i.product_id=$2 and c.status='published'
            and c.valid_from<=now() and c.valid_until>now()) as valid""",
        event.collection_id,
        event.product_id,
      )
    else:
      collection = await db.fetchrow(
        """select exists(select 1 from product_seasonal_collections
          where id=$1 and status='published'
            and valid_from<=now() and valid_until>now()) as valid""",
        event.collection_id,
      )
      # A published editorial collection can be supplemented at response time
      # with the packaged, server-owned Auradin catalog. Keep the collection
      # validity check while accepting only an identity we can resolve locally.
      row = {
        "valid": bool(
          collection
          and collection.get("valid")
          and event.external_source == AURADIN_CATALOG_SOURCE
          and auradin_catalog_event_features(str(event.external_product_id or ""))
        )
      }
  elif event.section == "search":
    identity = (
      external_product_identity(str(event.external_source), str(event.external_product_id))
      if event.external_source and event.external_product_id
      else None
    )
    row = await db.fetchrow(
      """select exists(select 1 from product_engagement_events
        where user_id=$1 and search_request_id=$2 and event_type='search_submit'
          and (
            ($3::uuid is not null and context->'resultProductIds' ? $3::text)
            or ($4::text is not null and context->'resultExternalIdentities' ? $4)
          )) as valid""",
      user_id,
      event.search_request_id,
      event.product_id,
      identity,
    )
  elif event.external_source is not None and event.external_product_id:
    row = {
      "valid": await _external_event_features(
        db,
        user_id=user_id,
        external_source=str(event.external_source),
        external_product_id=event.external_product_id,
        settings=settings,
      ) is not None
    }
  else:
    row = await db.fetchrow(
      """select exists(select 1 from products where id=$1 and is_active=true
        and catalog_status='published' and license_status='valid'
        and allowed_uses @> array['mobile_display','recommendation']::text[]
        and (license_valid_from is null or license_valid_from<=now())
        and (license_valid_until is null or license_valid_until>now())) as valid""",
      event.product_id,
    )
  if not row or not row.get("valid"):
    raise AppError(422, "INVALID_EVENT_REFERENCE", "Event source does not contain this eligible product.")


async def _external_event_features(
  db: Database,
  *,
  user_id: UUID,
  external_source: str,
  external_product_id: str,
  settings: Settings | None = None,
) -> dict[str, str] | None:
  if external_source == AURADIN_CATALOG_SOURCE:
    return auradin_catalog_event_features(external_product_id)
  row = await db.fetchrow(
    """select category,brand_name from external_product_likes
    where external_source=$1 and external_product_id=$2
      and (external_source='naver_shopping_search' or user_id=$3)
    order by liked_at desc limit 1""",
    external_source,
    external_product_id,
    user_id,
  )
  if row:
    features = {
      "catalogCategory": str(row.get("category") or "").strip(),
      "catalogBrand": str(row.get("brand_name") or "").strip(),
    }
    return {key: value for key, value in features.items() if value}
  active_product: dict[str, Any] | None = None
  resolved_settings = settings or Settings()
  if external_source == "naver_shopping_search":
    active_product = await resolve_live_external_product(
      resolved_settings,
      external_source=external_source,
      external_product_id=external_product_id,
    )
  elif external_source == "auradin_search":
    owner = await db.fetchrow(
      "select oauth_sub from users where id=$1 and deleted_at is null",
      user_id,
    )
    owner_subject = str((owner or {}).get("oauth_sub") or "").strip()
    if owner_subject:
      active_product = await resolve_auradin_result_product(
        owner_subject=owner_subject,
        product_id=external_product_id,
        settings=resolved_settings,
        db=db,
      )
  if active_product:
    active_features = {
      "catalogCategory": str(active_product.get("category") or "").strip(),
      "catalogBrand": str(active_product.get("brandName") or "").strip(),
      "catalogFinish": str(active_product.get("finish") or "").strip(),
      "catalogColorFamily": str(active_product.get("colorFamily") or "").strip(),
    }
    if active_features["catalogCategory"] in PRODUCT_CATEGORY_LABELS:
      return {key: value for key, value in active_features.items() if value}
  return None


async def record_client_events(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  events: list[ProductEvent],
) -> dict[str, int]:
  if not settings.engagement_personalization_v1:
    raise AppError(403, "EVENT_COLLECTION_DISABLED", "Product event collection is disabled.")
  if not await consent_is_active(db, user_id=user_id, purpose="engagement_personalization"):
    raise AppError(403, "PERSONALIZATION_CONSENT_REQUIRED", "Optional product personalization is off.")
  if len(events) > settings.product_event_batch_limit:
    raise AppError(422, "EVENT_BATCH_TOO_LARGE", "Event batch exceeds the configured limit.")
  now = datetime.now(timezone.utc)
  accepted = 0
  duplicate = 0
  for event in events:
    validate_event_source(event)
    if event.section in {"ar", "personalized"}:
      event_identity = (
        event.product_id
        if event.product_id is not None
        else external_product_identity(
          str(event.external_source or ""),
          str(event.external_product_id or ""),
        )
      )
      verify_exposure_token(
        settings,
        token=str(event.exposure_token),
        run_id=event.run_id,  # type: ignore[arg-type]
        user_id=user_id,
        product_id=event_identity,
      )
    await validate_event_reference(db, user_id=user_id, event=event, settings=settings)
    context = dict(event.context)
    if event.external_source and event.external_product_id:
      external_features = await _external_event_features(
        db,
        user_id=user_id,
        external_source=str(event.external_source),
        external_product_id=event.external_product_id,
        settings=settings,
      )
      if not external_features:
        raise AppError(422, "INVALID_EVENT_REFERENCE", "External product is no longer available.")
      # Never trust client-authored catalog attributes for learning. These
      # dimensions are resolved from the server-owned packaged item.
      context.update(external_features)
    occurred_at = event.occurred_at if event.occurred_at.tzinfo else event.occurred_at.replace(tzinfo=timezone.utc)
    if abs((now - occurred_at).total_seconds()) > settings.product_event_clock_skew_hours * 3600:
      raise AppError(422, "EVENT_CLOCK_SKEW", "Event timestamp is outside the accepted window.")
    status = await db.execute(
      """
      insert into product_engagement_events (
        event_id, user_id, run_id, collection_id, search_request_id, product_id,
        external_source, external_product_id, shade_id, event_type, section,
        position, occurred_at, context
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
      on conflict (user_id, event_id) do nothing
      """,
      event.event_id,
      user_id,
      event.run_id,
      event.collection_id,
      event.search_request_id,
      event.product_id,
      event.external_source,
      event.external_product_id,
      event.shade_id,
      event.event_type,
      event.section,
      event.position,
      occurred_at,
      json.dumps(context),
    )
    if status.endswith(" 1"):
      accepted += 1
    else:
      duplicate += 1
  return {"accepted": accepted, "duplicates": duplicate}


async def record_server_event(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  event_type: str,
  section: str,
  product_id: UUID | None = None,
  shade_id: UUID | None = None,
  search_request_id: UUID | None = None,
  context: dict[str, Any] | None = None,
) -> None:
  if not settings.engagement_personalization_v1:
    return
  if not await consent_is_active(db, user_id=user_id, purpose="engagement_personalization"):
    return
  await db.execute(
    """
    insert into product_engagement_events (
      event_id, user_id, search_request_id, product_id, shade_id,
      event_type, section, occurred_at, context
    ) values ($1,$2,$3,$4,$5,$6,$7,now(),$8::jsonb)
    on conflict (user_id, event_id) do nothing
    """,
    uuid4(),
    user_id,
    search_request_id,
    product_id,
    shade_id,
    event_type,
    section,
    json.dumps(context or {}),
  )


def _popular_personalized_response(
  *,
  items: list[dict[str, Any]],
  title: str,
  reason: str,
  original_status: str,
) -> dict[str, Any]:
  return {
    "status": "ready" if items else original_status,
    "title": title,
    "description": (
      "취향 데이터가 더 쌓이는 동안 앱에서 많이 저장한 인기 상품을 보여드려요."
      if items else None
    ),
    "algorithmVersion": "popular_fallback_v1",
    "runId": None,
    "items": items,
    "fallback": {"type": "popular", "reason": reason},
    "personalizationStatus": original_status,
  }


async def get_personalized_recommendations(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  nickname: str,
  limit: int,
  category: str | None = None,
) -> dict[str, Any]:
  category_filter = category if category in PRODUCT_CATEGORY_LABELS else None
  category_values = [category_filter] if category_filter else list(PRODUCT_CATEGORY_LABELS)
  title = f"{nickname}님만을 위한"
  if not settings.engagement_personalization_v1:
    items = await _section_popular_fallback_products(
      db, settings, user_id=user_id, limit=limit, variant="personalized", categories=category_values
    )
    return _popular_personalized_response(
      items=items,
      title=title,
      reason="PERSONALIZATION_DISABLED",
      original_status="unavailable",
    )
  if not await consent_is_active(db, user_id=user_id, purpose="engagement_personalization"):
    items = await _section_popular_fallback_products(
      db, settings, user_id=user_id, limit=limit, variant="personalized", categories=category_values
    )
    return _popular_personalized_response(
      items=items,
      title=title,
      reason="PERSONALIZATION_CONSENT_OFF",
      original_status="personalizationOff",
    )
  if not _in_experiment(user_id, settings.product_personalization_experiment_percent, "engagement-v1"):
    items = await _section_popular_fallback_products(
      db, settings, user_id=user_id, limit=limit, variant="personalized", categories=category_values
    )
    response = _popular_personalized_response(
      items=items,
      title=title,
      reason="PERSONALIZATION_CONTROL_GROUP",
      original_status="control",
    )
    response["experiment"] = "engagement_personalization_v1"
    return response
  signals = await db.fetch(
    """
    select signal.event_type,signal.category,signal.finish,signal.color_family,
      signal.brand_name,greatest(0,extract(epoch from (now()-signal.occurred_at))/86400) as age_days
    from (
      select e.event_type::text as event_type,
        coalesce(p.category::text,e.context->>'catalogCategory',e.context->>'category') as category,
        coalesce(s.finish,e.context->>'catalogFinish') as finish,
        coalesce(s.color_family,e.context->>'catalogColorFamily','unknown') as color_family,
        coalesce(p.brand_name,e.context->>'catalogBrand') as brand_name,e.occurred_at
      from product_engagement_events e
      left join products p on p.id=e.product_id
      left join product_shades s on s.id=e.shade_id
      where e.user_id=$1 and e.occurred_at>=now()-interval '180 days'
        and e.event_type in ('unlike','seller_outbound','product_open','search_result_open','search_submit','hide')
      union all
      select 'like'::text,p.category::text,s.finish,
        coalesce(s.color_family,'unknown')::text,p.brand_name,l.liked_at
      from user_product_likes l
      join products p on p.id=l.product_id
      left join product_shades s on s.id=l.source_shade_id and s.product_id=p.id
      where l.user_id=$1 and l.liked_at>=now()-interval '180 days'
      union all
      select 'like'::text,category,null::text,'unknown'::text,brand_name,liked_at
      from external_product_likes
      where user_id=$1 and liked_at>=now()-interval '180 days'
    ) signal
    order by signal.occurred_at desc limit 1000
    """,
    user_id,
  )
  if not signals:
    items = await _section_popular_fallback_products(
      db, settings, user_id=user_id, limit=limit, variant="personalized", categories=category_values
    )
    response = _popular_personalized_response(
      items=items,
      title=title,
      reason="INSUFFICIENT_ENGAGEMENT_DATA",
      original_status="insufficientData",
    )
    if not items:
      return response
    run_id = uuid4()
    external_identities: list[str] = []
    product_ids: list[UUID] = []
    for item in items:
      if item.get("externalSource"):
        identity = external_product_identity(str(item["externalSource"]), str(item["productId"]))
        external_identities.append(identity)
      else:
        product_id = UUID(str(item["productId"]))
        product_ids.append(product_id)
        identity = str(product_id)
      item["exposureToken"] = _sign_exposure(
        settings,
        run_id=run_id,
        user_id=user_id,
        product_id=identity,
      )
    await db.execute(
      """
      insert into product_recommendation_runs (
        id,user_id,strategy,algorithm_version,product_ids,recommendation_payload,
        consent_snapshot,expires_at
      ) values ($1,$2,'personalized_v1','popular_fallback_signed_v1',$3,$4::jsonb,$5::jsonb,
        now() + ($6::int * interval '1 day'))
      """,
      run_id,
      user_id,
      product_ids,
      json.dumps(
        {
          "sourceEventCount": 0,
          "fallbackReason": "INSUFFICIENT_ENGAGEMENT_DATA",
          "externalProductIdentities": external_identities,
        }
      ),
      json.dumps({"engagementPersonalization": True, "version": CONSENT_VERSION_DEFAULT}),
      settings.product_run_retention_days,
    )
    response["runId"] = str(run_id)
    response["algorithmVersion"] = "popular_fallback_signed_v1"
    return response
  preferences: defaultdict[tuple[str, str], float] = defaultdict(float)
  for signal in signals:
    weight = PERSONALIZATION_SIGNAL_WEIGHTS.get(str(signal.get("event_type")), 0)
    decay = 2 ** (-float(signal.get("age_days") or 0) / 30)
    for feature in ("category", "finish", "color_family", "brand_name"):
      value = str(signal.get(feature) or "").strip()
      if value and value != "unknown":
        preferences[(feature, value)] += weight * decay
  await db.execute(
    """
    insert into product_preference_profiles (user_id, profile_version, preference_payload, source_event_count, refreshed_at, expires_at)
    values ($1, 'decay_v1', $2::jsonb, $3, now(), now() + ($4::int * interval '1 day'))
    on conflict (user_id) do update set preference_payload = excluded.preference_payload,
      source_event_count = excluded.source_event_count, refreshed_at = now(), expires_at = excluded.expires_at
    """,
    user_id,
    json.dumps({f"{key[0]}:{key[1]}": value for key, value in preferences.items()}),
    len(signals),
    settings.product_profile_retention_days,
  )
  # Candidate selection remains catalog-grounded.  It never creates fixture products.
  rows = await db.fetch(
    f"""
    select p.id as product_id, p.brand_name, p.product_name, p.category::text as category,
      p.catalog_version, p.updated_at as source_updated_at,
      s.id as shade_id, s.shade_name, s.srgb_hex, s.finish, s.color_family,
      a.asset_url as image_url,
      o.id as offer_id, o.seller_name, o.seller_domain, o.currency, o.price_amount,
      o.price_updated_at, o.availability_status, o.affiliate_type, o.disclosure_label,
      (l.product_id is not null) as liked
    from products p
    join lateral (select * from product_shades x where x.product_id=p.id and x.is_active=true
      and x.license_status='valid' and x.allowed_uses @> array['mobile_display','recommendation']::text[]
      and (x.license_valid_from is null or x.license_valid_from<=now())
      and (x.license_valid_until is null or x.license_valid_until>now())
      and exists (select 1 from product_assets xa where xa.product_id=x.product_id
        and xa.is_active=true and xa.asset_type='packshot' and xa.license_status='valid'
        and xa.allowed_uses @> array['mobile_display','recommendation']::text[]
        and (xa.shade_id is null or xa.shade_id=x.id)
        and (xa.valid_from is null or xa.valid_from<=now())
        and (xa.valid_until is null or xa.valid_until>now()))
      and exists (select 1 from product_offers xo where xo.product_id=x.product_id
        and xo.is_active=true and xo.availability_status in ('in_stock','limited')
        and xo.license_status='valid' and xo.allowed_uses @> array['mobile_display']::text[]
        and (xo.shade_id is null or xo.shade_id=x.id)
        and (xo.valid_until is null or xo.valid_until>now())
        {offer_freshness_sql("xo", "$2")})
      order by x.reviewed_at desc nulls last limit 1) s on true
    join lateral (select * from product_assets x where x.product_id=p.id and x.is_active=true
      and x.asset_type='packshot' and x.license_status='valid'
      and x.allowed_uses @> array['mobile_display','recommendation']::text[]
      and (x.valid_from is null or x.valid_from<=now())
      and (x.valid_until is null or x.valid_until>now())
      and (x.shade_id is null or x.shade_id=s.id)
      order by case when x.shade_id=s.id then 0 else 1 end,
        x.reviewed_at desc nulls last limit 1) a on true
    join lateral (select * from product_offers x where x.product_id=p.id and x.is_active=true
      and x.availability_status in ('in_stock','limited') and x.license_status='valid'
      and x.allowed_uses @> array['mobile_display']::text[]
      and (x.valid_until is null or x.valid_until>now())
      and (x.shade_id is null or x.shade_id=s.id)
      {offer_freshness_sql("x", "$2")}
      order by case when x.shade_id=s.id then 0 else 1 end,
        x.price_updated_at desc nulls last limit 1) o on true
    left join user_product_likes l on l.user_id=$1 and l.product_id=p.id
    where p.is_active=true and p.catalog_status='published' and p.license_status='valid'
      and p.allowed_uses @> array['mobile_display','recommendation']::text[]
      and (p.license_valid_from is null or p.license_valid_from<=now())
      and (p.license_valid_until is null or p.license_valid_until>now())
      and l.product_id is null
      and ($3::text is null or p.category::text=$3)
    limit 200
    """,
    user_id,
    settings.product_offer_max_age_hours,
    category_filter,
  )
  scored = []
  for row in rows:
    score = (
      preferences.get(("category", str(row.get("category") or "")), 0)
      + preferences.get(("finish", str(row.get("finish") or "")), 0)
      + preferences.get(("color_family", str(row.get("color_family") or "")), 0)
      + preferences.get(("brand_name", str(row.get("brand_name") or "")), 0) * 0.5
    )
    scored.append((score, row))
  scored.sort(key=lambda item: (-item[0], str(item[1]["product_id"])))
  items = []
  brands: Counter[str] = Counter()
  categories: Counter[str] = Counter()
  category_diversity_limit = limit if category_filter else 4
  for score, row in scored:
    brand = str(row.get("brand_name") or "")
    category = str(row.get("category") or "")
    if score <= 0 or brands[brand] >= 2 or categories[category] >= category_diversity_limit:
      continue
    item = map_catalog_product(row, liked=bool(row.get("liked")))
    item.update({"reasonCodes": ["ENGAGEMENT_PREFERENCE"], "reasonLabels": ["좋아요와 최근 본 제품을 반영했어요"]})
    items.append(item)
    brands[brand] += 1
    categories[category] += 1
    if len(items) >= limit:
      break
  if len(items) < limit:
    items.extend(
      await get_auradin_catalog_products(
        db,
        user_id=user_id,
        limit=limit - len(items),
        strategy="personalized",
        preferences=preferences,
        exclude_liked=True,
        categories=category_values,
        exclude_identities={
          (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
          for item in items
        },
      )
    )
  personalized_count = len(items)
  fallback_added = False
  if len(items) < limit:
    existing_keys = {
      (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
      for item in items
    }
    popular_items = await _section_popular_fallback_products(
      db,
      settings,
      user_id=user_id,
      limit=limit,
      variant="personalized",
      categories=category_values,
    )
    for item in popular_items:
      key = (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
      if key in existing_keys:
        continue
      items.append(item)
      existing_keys.add(key)
      fallback_added = True
      if len(items) >= limit:
        break
  run_id = uuid4() if items else None
  external_identities = [
    external_product_identity(str(item["externalSource"]), str(item["productId"]))
    for item in items
    if item.get("externalSource")
  ]
  if run_id:
    for item in items:
      product_identity = (
        external_product_identity(str(item["externalSource"]), str(item["productId"]))
        if item.get("externalSource")
        else str(item["productId"])
      )
      item["exposureToken"] = _sign_exposure(
        settings,
        run_id=run_id,
        user_id=user_id,
        product_id=product_identity,
      )
  if items and run_id:
    await db.execute(
      """
      insert into product_recommendation_runs (
        id,user_id,strategy,algorithm_version,product_ids,recommendation_payload,
        consent_snapshot,expires_at
      ) values ($1,$2,'personalized_v1','engagement_decay_v1',$3,$4::jsonb,$5::jsonb,
        now() + ($6::int * interval '1 day'))
      """,
      run_id,
      user_id,
      [UUID(item["productId"]) for item in items if not item.get("externalSource")],
      json.dumps(
        {
          "sourceEventCount": len(signals),
          "externalProductIdentities": external_identities,
        }
      ),
      json.dumps({"engagementPersonalization": True, "version": CONSENT_VERSION_DEFAULT}),
      settings.product_run_retention_days,
    )
  return {
    "status": "ready" if items else "insufficientData",
    "title": f"{nickname}님만을 위한",
    "description": (
      "좋아요·검색·최근 본 제품을 반영하고, 부족한 자리는 인기 상품으로 채웠어요"
      if fallback_added and personalized_count
      else "취향 데이터가 더 쌓이는 동안 인기 상품을 보여드려요"
      if fallback_added
      else "좋아요·검색·최근 본 제품을 반영했어요"
    ),
    "algorithmVersion": "engagement_decay_external_v2" if external_identities else "engagement_decay_v1",
    "runId": str(run_id) if run_id else None,
    "items": items,
    "fallback": ({"type": "popular", "reason": "PERSONALIZED_COVERAGE"} if fallback_added else None),
  }


async def _report_tone_fallback_items(
  db: Database,
  *,
  user_id: UUID,
  limit: int,
  exclude_identities: set[tuple[str, str]] | None = None,
  categories: Iterable[str] | None = None,
) -> list[dict[str, Any]]:
  if limit <= 0:
    return []
  report = await db.fetchrow(
    """select personal_color from analysis_reports
    where user_id=$1 and status='completed'
    order by analyzed_at desc nulls last,created_at desc,id desc limit 1""",
    user_id,
  )
  bucket = broad_personal_color_bucket((report or {}).get("personal_color"))
  undertone = bucket.removeprefix("undertone-") if bucket and bucket.startswith("undertone-") else None
  if not undertone:
    return []
  return await get_auradin_catalog_products(
    db,
    user_id=user_id,
    limit=limit,
    strategy="tone",
    undertone=undertone,
    categories=categories,
    exclude_identities=exclude_identities,
    exclude_liked=True,
  )


async def _tone_then_popular_cohort_response(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  limit: int,
  reason: str,
  original_status: str,
  category: str | None = None,
) -> dict[str, Any]:
  category_values = [category] if category in PRODUCT_CATEGORY_LABELS else list(PRODUCT_CATEGORY_LABELS)
  items = await _report_tone_fallback_items(
    db, user_id=user_id, limit=limit, categories=category_values
  )
  tone_count = len(items)
  if len(items) < limit:
    existing = {
      (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
      for item in items
    }
    for item in await _section_popular_fallback_products(
      db, settings, user_id=user_id, limit=limit, variant="cohort", categories=category_values
    ):
      identity = (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
      if identity in existing:
        continue
      items.append(item)
      existing.add(identity)
      if len(items) >= limit:
        break
  return {
    "status": "ready" if items else original_status,
    "title": "분석 리포트 퍼스널컬러 추천제품" if tone_count else "지금 많이 저장한 추천제품",
    "description": (
      "분석 리포트의 넓은 톤 범주와 맞는 상품을 먼저 보여드리고, 부족한 자리는 인기 상품으로 채웠어요."
      if tone_count and len(items) > tone_count
      else "분석 리포트의 넓은 톤 범주와 맞는 상품을 보여드려요."
      if tone_count
      else "익명 집계 추천을 준비하는 동안 앱에서 많이 저장한 인기 상품을 보여드려요."
      if items
      else None
    ),
    "cohortSizeBand": None,
    "minimumCohortSize": settings.product_cohort_min_size,
    "minimumItemSupport": settings.product_cohort_min_item_support,
    "items": items,
    "fallback": {
      "type": "reportTone" if tone_count else "popular",
      "reason": reason,
      "popularCoverage": len(items) > tone_count if tone_count else bool(items),
    },
    "cohortStatus": original_status,
  }


async def get_cohort_recommendations(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  limit: int,
  category: str | None = None,
) -> dict[str, Any]:
  category_filter = category if category in PRODUCT_CATEGORY_LABELS else None
  category_values = [category_filter] if category_filter else list(PRODUCT_CATEGORY_LABELS)
  if not settings.cohort_recommendations_v1:
    items = await _section_popular_fallback_products(
      db, settings, user_id=user_id, limit=limit, variant="cohort", categories=category_values
    )
    return _popular_cohort_response(
      items=items,
      settings=settings,
      reason="COHORT_RECOMMENDATIONS_DISABLED",
      original_status="unavailable",
    )
  if not await consent_is_active(db, user_id=user_id, purpose="color_cohort"):
    items = await _section_popular_fallback_products(
      db, settings, user_id=user_id, limit=limit, variant="cohort", categories=category_values
    )
    return _popular_cohort_response(
      items=items,
      settings=settings,
      reason="COHORT_CONSENT_OFF",
      original_status="personalizationOff",
    )
  if not _in_experiment(user_id, settings.product_cohort_experiment_percent, "cohort-v1"):
    items = await _section_popular_fallback_products(
      db, settings, user_id=user_id, limit=limit, variant="cohort", categories=category_values
    )
    response = _popular_cohort_response(
      items=items,
      settings=settings,
      reason="COHORT_CONTROL_GROUP",
      original_status="control",
    )
    response["experiment"] = "color_cohort_v1"
    return response
  membership = await db.fetchrow(
    "select cohort_key from product_color_cohort_memberships where user_id=$1 and expires_at>now()",
    user_id,
  )
  if not membership:
    return await _tone_then_popular_cohort_response(
      db,
      settings=settings,
      user_id=user_id,
      limit=limit,
      reason="NO_COLOR_COHORT",
      original_status="insufficientData",
      category=category_filter,
    )
  if str(membership.get("cohort_key") or "") == "preference-v3:other":
    return await _tone_then_popular_cohort_response(
      db,
      settings=settings,
      user_id=user_id,
      limit=limit,
      reason="MERGED_COHORT_NOT_SIMILAR_ENOUGH",
      original_status="insufficientData",
      category=category_filter,
    )
  cohort_size = await db.fetchrow(
    "select count(*)::int as count from product_color_cohort_memberships where cohort_key=$1 and expires_at>now()",
    membership["cohort_key"],
  )
  size = int((cohort_size or {}).get("count") or 0)
  if size < settings.product_cohort_min_size:
    return await _tone_then_popular_cohort_response(
      db,
      settings=settings,
      user_id=user_id,
      limit=limit,
      reason="COHORT_BELOW_PRIVACY_THRESHOLD",
      original_status="insufficientData",
      category=category_filter,
    )
  rows = await db.fetch(
    f"""
    select p.id as product_id, p.brand_name, p.product_name, p.category::text as category,
      p.catalog_version, p.updated_at as source_updated_at,
      s.id as shade_id, s.shade_name, s.srgb_hex, s.finish,
      a.asset_url as image_url, o.id as offer_id, o.seller_name, o.seller_domain,
      o.currency, o.price_amount, o.price_updated_at, o.availability_status,
      o.affiliate_type, o.disclosure_label, count(distinct l.user_id) as like_count
    from product_color_cohort_memberships m
    join lateral (
      select candidate.product_id,candidate.user_id from user_product_likes candidate
      where candidate.user_id=m.user_id and candidate.liked_at>=now()-interval '180 days'
      order by candidate.liked_at desc limit 20
    ) l on true
    join products p on p.id=l.product_id and p.is_active=true and p.catalog_status='published'
    join lateral (select * from product_shades x where x.product_id=p.id and x.is_active=true
      and x.license_status='valid' and x.allowed_uses @> array['mobile_display','recommendation']::text[]
      and (x.license_valid_from is null or x.license_valid_from<=now())
      and (x.license_valid_until is null or x.license_valid_until>now())
      and exists (select 1 from product_assets xa where xa.product_id=x.product_id
        and xa.is_active=true and xa.asset_type='packshot' and xa.license_status='valid'
        and xa.allowed_uses @> array['mobile_display','recommendation']::text[]
        and (xa.shade_id is null or xa.shade_id=x.id)
        and (xa.valid_from is null or xa.valid_from<=now())
        and (xa.valid_until is null or xa.valid_until>now()))
      and exists (select 1 from product_offers xo where xo.product_id=x.product_id
        and xo.is_active=true and xo.availability_status in ('in_stock','limited')
        and xo.license_status='valid' and xo.allowed_uses @> array['mobile_display']::text[]
        and (xo.shade_id is null or xo.shade_id=x.id)
        and (xo.valid_until is null or xo.valid_until>now())
        {offer_freshness_sql("xo", "$5")})
      limit 1) s on true
    join lateral (select * from product_assets x where x.product_id=p.id and x.is_active=true
      and x.asset_type='packshot' and x.license_status='valid'
      and x.allowed_uses @> array['mobile_display','recommendation']::text[]
      and (x.valid_from is null or x.valid_from<=now())
      and (x.valid_until is null or x.valid_until>now())
      and (x.shade_id is null or x.shade_id=s.id)
      order by case when x.shade_id=s.id then 0 else 1 end,
        x.reviewed_at desc nulls last limit 1) a on true
    join lateral (select * from product_offers x where x.product_id=p.id and x.is_active=true
      and x.availability_status in ('in_stock','limited') and x.license_status='valid'
      and x.allowed_uses @> array['mobile_display']::text[]
      and (x.valid_until is null or x.valid_until>now())
      and (x.shade_id is null or x.shade_id=s.id)
      {offer_freshness_sql("x", "$5")}
      order by case when x.shade_id=s.id then 0 else 1 end,
        x.price_updated_at desc nulls last limit 1) o on true
    left join user_product_likes viewer_like on viewer_like.user_id=$2 and viewer_like.product_id=p.id
    where m.cohort_key=$1 and m.expires_at>now() and m.user_id<>$2
      and m.contribution_count>0 and viewer_like.product_id is null
      and p.license_status='valid' and p.allowed_uses @> array['mobile_display','recommendation']::text[]
      and (p.license_valid_from is null or p.license_valid_from<=now())
      and (p.license_valid_until is null or p.license_valid_until>now())
      and ($6::text is null or p.category::text=$6)
    group by
      p.id,p.brand_name,p.product_name,p.category,p.catalog_version,p.updated_at,
      s.id,s.shade_name,s.srgb_hex,s.finish,
      a.id,a.asset_url,
      o.id,o.seller_name,o.seller_domain,o.currency,o.price_amount,o.price_updated_at,
      o.availability_status,o.affiliate_type,o.disclosure_label
    having count(distinct l.user_id) >= $4
    order by like_count desc,p.id limit $3
    """,
    membership["cohort_key"],
    user_id,
    limit,
    settings.product_cohort_min_item_support,
    settings.product_offer_max_age_hours,
    category_filter,
  )
  items = []
  brands: Counter[str] = Counter()
  categories: Counter[str] = Counter()
  category_diversity_limit = limit if category_filter else 4
  for row in rows:
    brand = str(row.get("brand_name") or "")
    category = str(row.get("category") or "")
    if brands[brand] >= 2 or categories[category] >= category_diversity_limit:
      continue
    item = map_catalog_product(row)
    item.update({"reasonCodes": ["SIMILAR_COLOR_COHORT"], "reasonLabels": ["비슷한 컬러 취향이 좋아해요"]})
    items.append(item)
    brands[brand] += 1
    categories[category] += 1
  if len(items) < limit:
    external_rows = await db.fetch(
      """
      with eligible_likes as (
        select l.external_source,l.external_product_id,l.user_id,l.brand_name,
          l.product_name,l.category,l.image_url,l.purchase_url,l.price_amount,
          l.price_currency,l.source_updated_at,l.liked_at
        from product_color_cohort_memberships m
        join external_product_likes l on l.user_id=m.user_id
          and l.liked_at>=now()-interval '180 days'
        where m.cohort_key=$1 and m.expires_at>now() and m.user_id<>$2
          and m.contribution_count>0
          and l.external_source in ('naver_shopping_search','auradin_catalog')
          and ($5::text is null or l.category=$5)
          and not exists (
            select 1 from external_product_likes viewer
            where viewer.user_id=$2 and viewer.external_source=l.external_source
              and viewer.external_product_id=l.external_product_id
          )
      ), aggregated as (
        select external_source,external_product_id,
          count(distinct user_id)::int as like_count
        from eligible_likes
        group by external_source,external_product_id
        having count(distinct user_id)>=$4
      )
      select aggregated.external_source,aggregated.external_product_id,
        snapshot.brand_name,snapshot.product_name,snapshot.category,snapshot.image_url,
        snapshot.purchase_url,snapshot.price_amount,snapshot.price_currency,
        snapshot.source_updated_at,aggregated.like_count
      from aggregated
      join lateral (
        select eligible_likes.brand_name,eligible_likes.product_name,
          eligible_likes.category,eligible_likes.image_url,eligible_likes.purchase_url,
          eligible_likes.price_amount,eligible_likes.price_currency,
          eligible_likes.source_updated_at
        from eligible_likes
        where eligible_likes.external_source=aggregated.external_source
          and eligible_likes.external_product_id=aggregated.external_product_id
        order by eligible_likes.liked_at desc,eligible_likes.user_id
        limit 1
      ) snapshot on true
      order by aggregated.like_count desc,aggregated.external_product_id limit $3
      """,
      membership["cohort_key"],
      user_id,
      limit - len(items),
      settings.product_cohort_min_item_support,
      category_filter,
    )
    for row in external_rows:
      brand = str(row.get("brand_name") or "")
      category = str(row.get("category") or "")
      if brands[brand] >= 2 or categories[category] >= category_diversity_limit:
        continue
      purchase_url = _safe_naver_result_url(row.get("purchase_url"))
      image_url = _safe_naver_result_url(row.get("image_url"))
      if not purchase_url or not image_url:
        continue
      items.append({
        "productId": row["external_product_id"],
        "shadeId": None,
        "brandName": brand,
        "productName": row["product_name"],
        "category": category,
        "imageUrl": image_url,
        "purchaseUrl": purchase_url,
        "price": {"amount": row.get("price_amount"), "currency": row["price_currency"], "updatedAt": row.get("source_updated_at")},
        "viewerState": {"liked": False},
        "status": "active",
        "canLike": True,
        "externalSource": row["external_source"],
        "reasonCodes": ["SIMILAR_PREFERENCE_COHORT"],
        "reasonLabels": ["비슷한 취향 사용자들이 많이 좋아해요"],
      })
      brands[brand] += 1
      categories[category] += 1
  cohort_item_count = len(items)
  tone_added = False
  if len(items) < limit:
    existing_keys = {
      (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
      for item in items
    }
    tone_items = await _report_tone_fallback_items(
      db,
      user_id=user_id,
      limit=limit - len(items),
      exclude_identities=existing_keys,
      categories=category_values,
    )
    for item in tone_items:
      identity = (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
      if identity in existing_keys:
        continue
      items.append(item)
      existing_keys.add(identity)
      tone_added = True
  fallback_added = False
  if len(items) < limit:
    existing_keys = {
      (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
      for item in items
    }
    popular_items = await _section_popular_fallback_products(
      db,
      settings,
      user_id=user_id,
      limit=limit,
      variant="cohort",
      categories=category_values,
    )
    for item in popular_items:
      key = (str(item.get("externalSource") or "catalog"), str(item.get("productId") or ""))
      if key in existing_keys:
        continue
      items.append(item)
      existing_keys.add(key)
      fallback_added = True
      if len(items) >= limit:
        break
  return {
    "status": "ready" if items else "insufficientData",
    "title": (
      "나와 비슷한 분들이 많이 좋아해요"
      if cohort_item_count
      else "분석 리포트 퍼스널컬러 추천제품"
      if tone_added
      else "지금 많이 저장한 추천제품"
    ),
    "description": (
      "익명 컬러 취향 집계 결과와 리포트 톤, 인기 상품을 함께 보여드려요"
      if fallback_added and tone_added and cohort_item_count
      else "익명 컬러 취향 집계 결과와 리포트 톤 상품을 함께 보여드려요"
      if tone_added and cohort_item_count
      else "리포트의 넓은 톤 범주와 인기 상품을 함께 보여드려요"
      if tone_added and fallback_added
      else "분석 리포트의 넓은 톤 범주와 맞는 상품을 보여드려요"
      if tone_added
      else "익명 컬러 취향 집계 결과와 인기 상품을 함께 보여드려요"
      if fallback_added and cohort_item_count
      else "익명 집계 추천을 준비하는 동안 인기 상품을 보여드려요"
      if fallback_added
      else "별도 동의한 넓은 컬러·제품 취향 집계에서 많이 저장한 제품이에요"
    ),
    "cohortSizeBand": f"{settings.product_cohort_min_size}+",
    "minimumCohortSize": settings.product_cohort_min_size,
    "minimumItemSupport": settings.product_cohort_min_item_support,
    "items": items,
    "fallback": (
      {
        "type": "reportTone" if tone_added else "popular",
        "reason": "COHORT_COVERAGE",
        "popularCoverage": fallback_added,
      }
      if fallback_added or tone_added
      else None
    ),
  }


def _popular_cohort_response(
  *,
  items: list[dict[str, Any]],
  settings: Settings,
  reason: str,
  original_status: str,
) -> dict[str, Any]:
  return {
    "status": "ready" if items else original_status,
    "title": "지금 많이 저장한 추천제품",
    "description": (
      "익명 집계 추천을 준비하는 동안 앱에서 많이 저장한 인기 상품을 보여드려요."
      if items else None
    ),
    "cohortSizeBand": None,
    "minimumCohortSize": settings.product_cohort_min_size,
    "minimumItemSupport": settings.product_cohort_min_item_support,
    "items": items,
    "fallback": {"type": "popular", "reason": reason},
    "cohortStatus": original_status,
  }
