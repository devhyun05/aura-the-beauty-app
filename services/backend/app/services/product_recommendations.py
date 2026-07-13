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
from app.services.product_catalog import ELIGIBLE_EVIDENCE_TYPES, map_catalog_product, offer_freshness_sql
from app.services.product_color import delta_e_ciede2000
from app.services.product_live_seasonal import get_live_seasonal_recommendations


REGION_LABELS = {"lip": "립", "cheek": "블러셔", "liner": "아이라이너"}
CONSENT_VERSION_DEFAULT = "product-personalization-v1"
CONSENT_TYPES = {"engagement_personalization", "color_cohort"}
PERSONALIZATION_SIGNAL_WEIGHTS = {
  "like": 4.0,
  "seller_outbound": 3.0,
  "product_open": 1.0,
  "search_result_open": 1.0,
  "unlike": -3.0,
  "hide": -5.0,
}


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
  product_id: UUID,
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
  if not settings.ar_product_recommendations_v1:
    return {"status": "unavailable", "basedOn": None, "groups": []}

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
    return {"status": "noArStyle", "basedOn": None, "groups": []}

  projection_regions = _projection_regions(style.get("style_payload"))
  if not projection_regions:
    return {"status": "unsupportedRecipe", "basedOn": {"styleId": str(style["id"])}, "groups": []}

  requested = [region for region in regions if region in REGION_LABELS]
  groups: list[dict[str, Any]] = []
  run_id = uuid4()
  result_ids: list[UUID] = []
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
    for item in items:
      item["exposureToken"] = _sign_exposure(
        settings,
        run_id=run_id,
        user_id=user_id,
        product_id=item["productId"],
      )
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
    result_ids,
    json.dumps({"regions": [group["region"] for group in groups]}),
    settings.product_run_retention_days,
  )
  return {
    "status": "ready" if any(group["items"] for group in groups) else "noEligibleProducts",
    "runId": str(run_id),
    "basedOn": {
      "styleId": str(style["id"]),
      "styleTitle": style.get("title"),
      "envelopeVersion": "saved_ar_look_v1",
      "recipeVersion": 2,
      "colorSemantics": "authoring_color",
    },
    "groups": groups,
  }


async def get_seasonal_recommendations(db: Database, settings: Settings, *, locale: str, limit: int) -> dict[str, Any]:
  if not settings.seasonal_recommendations_v1:
    return {"status": "unavailable", "collection": None, "items": [], "nextCursor": None}
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
    if settings.legacy_naver_product_search:
      return await get_live_seasonal_recommendations(settings, locale=locale, limit=limit)
    return {"status": "empty", "collection": None, "items": [], "nextCursor": None}
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
      and p.license_status = 'valid'
      and p.allowed_uses @> array['mobile_display', 'recommendation']::text[]
      and (p.license_valid_from is null or p.license_valid_from <= now())
      and (p.license_valid_until is null or p.license_valid_until > now())
    order by i.position limit $2
    """,
    collection["id"],
    limit,
    settings.product_offer_max_age_hours,
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
      "isStale": _is_seasonal_source_stale(
        source_updated_at,
        max_age_days=settings.product_seasonal_source_max_age_days,
      ),
    },
    "items": items,
    "nextCursor": None,
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


async def validate_event_reference(db: Database, *, user_id: UUID, event: ProductEvent) -> None:
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
    row = await db.fetchrow(
      """select exists(select 1 from product_recommendation_runs
        where id=$1 and user_id=$2 and expires_at>now() and $3=any(product_ids)) as valid""",
      event.run_id,
      user_id,
      event.product_id,
    )
  elif event.section == "seasonal":
    row = await db.fetchrow(
      """select exists(select 1 from product_seasonal_collection_items i
        join product_seasonal_collections c on c.id=i.collection_id
        where i.collection_id=$1 and i.product_id=$2 and c.status='published'
          and c.valid_from<=now() and c.valid_until>now()) as valid""",
      event.collection_id,
      event.product_id,
    )
  elif event.section == "search":
    row = await db.fetchrow(
      """select exists(select 1 from product_engagement_events
        where user_id=$1 and search_request_id=$2 and event_type='search_submit') as valid""",
      user_id,
      event.search_request_id,
    )
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
      verify_exposure_token(
        settings,
        token=str(event.exposure_token),
        run_id=event.run_id,  # type: ignore[arg-type]
        user_id=user_id,
        product_id=event.product_id,
      )
    await validate_event_reference(db, user_id=user_id, event=event)
    occurred_at = event.occurred_at if event.occurred_at.tzinfo else event.occurred_at.replace(tzinfo=timezone.utc)
    if abs((now - occurred_at).total_seconds()) > settings.product_event_clock_skew_hours * 3600:
      raise AppError(422, "EVENT_CLOCK_SKEW", "Event timestamp is outside the accepted window.")
    status = await db.execute(
      """
      insert into product_engagement_events (
        event_id, user_id, run_id, collection_id, search_request_id, product_id,
        shade_id, event_type, section, position, occurred_at, context
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
      on conflict (user_id, event_id) do nothing
      """,
      event.event_id,
      user_id,
      event.run_id,
      event.collection_id,
      event.search_request_id,
      event.product_id,
      event.shade_id,
      event.event_type,
      event.section,
      event.position,
      occurred_at,
      json.dumps(event.context),
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


async def get_personalized_recommendations(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  nickname: str,
  limit: int,
) -> dict[str, Any]:
  title = f"{nickname}님만을 위한"
  if not settings.engagement_personalization_v1:
    return {"status": "unavailable", "title": title, "items": []}
  if not await consent_is_active(db, user_id=user_id, purpose="engagement_personalization"):
    return {"status": "personalizationOff", "title": title, "items": []}
  if not _in_experiment(user_id, settings.product_personalization_experiment_percent, "engagement-v1"):
    return {"status": "control", "title": title, "experiment": "engagement_personalization_v1", "items": []}
  signals = await db.fetch(
    """
    select signal.event_type,signal.category,signal.finish,signal.color_family,
      signal.brand_name,greatest(0,extract(epoch from (now()-signal.occurred_at))/86400) as age_days
    from (
      select e.event_type::text as event_type,p.category::text as category,s.finish,
        coalesce(s.color_family,'unknown') as color_family,p.brand_name,e.occurred_at
      from product_engagement_events e
      left join products p on p.id=e.product_id
      left join product_shades s on s.id=e.shade_id
      where e.user_id=$1 and e.occurred_at>=now()-interval '180 days'
        and e.event_type in ('like','unlike','seller_outbound','product_open','search_result_open','hide')
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
    return {"status": "insufficientData", "title": title, "items": []}
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
    limit 200
    """,
    user_id,
    settings.product_offer_max_age_hours,
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
  for score, row in scored:
    brand = str(row.get("brand_name") or "")
    category = str(row.get("category") or "")
    if score <= 0 or brands[brand] >= 2 or categories[category] >= 4:
      continue
    item = map_catalog_product(row, liked=bool(row.get("liked")))
    item.update({"reasonCodes": ["ENGAGEMENT_PREFERENCE"], "reasonLabels": ["좋아요와 최근 본 제품을 반영했어요"]})
    items.append(item)
    brands[brand] += 1
    categories[category] += 1
    if len(items) >= limit:
      break
  if not items and settings.legacy_naver_product_search:
    live = await get_live_seasonal_recommendations(settings, locale="ko-KR", limit=max(limit * 2, 12))
    liked_rows = await db.fetch(
      "select external_product_id from external_product_likes where user_id=$1",
      user_id,
    )
    liked_external_ids = {str(row["external_product_id"]) for row in liked_rows}
    live_scored: list[tuple[float, dict[str, Any]]] = []
    for candidate in live.get("items", []):
      if candidate.get("productId") in liked_external_ids:
        continue
      score = (
        preferences.get(("category", str(candidate.get("category") or "")), 0)
        + preferences.get(("brand_name", str(candidate.get("brandName") or "")), 0) * 0.5
      )
      if score > 0:
        live_scored.append((score, candidate))
    live_scored.sort(key=lambda value: (-value[0], str(value[1].get("productId") or "")))
    for _, candidate in live_scored[:limit]:
      item = dict(candidate)
      item.update({
        "viewerState": {"liked": False},
        "reasonCodes": ["ENGAGEMENT_PREFERENCE"],
        "reasonLabels": ["좋아요한 카테고리와 브랜드 취향을 반영했어요"],
      })
      items.append(item)
  external_live = any(item.get("externalSource") for item in items)
  run_id = None if external_live else uuid4()
  if run_id:
    for item in items:
      item["exposureToken"] = _sign_exposure(
        settings,
        run_id=run_id,
        user_id=user_id,
        product_id=item["productId"],
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
      [UUID(item["productId"]) for item in items],
      json.dumps({"sourceEventCount": len(signals)}),
      json.dumps({"engagementPersonalization": True, "version": CONSENT_VERSION_DEFAULT}),
      settings.product_run_retention_days,
    )
  return {
    "status": "ready" if items else "insufficientData",
    "title": f"{nickname}님만을 위한",
    "description": "좋아요·검색·최근 본 제품을 반영했어요",
    "algorithmVersion": "engagement_decay_live_v1" if external_live else "engagement_decay_v1",
    "runId": str(run_id) if run_id else None,
    "items": items,
  }


async def get_cohort_recommendations(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  limit: int,
) -> dict[str, Any]:
  if not settings.cohort_recommendations_v1:
    return {"status": "unavailable", "items": []}
  if not await consent_is_active(db, user_id=user_id, purpose="color_cohort"):
    return {"status": "personalizationOff", "items": []}
  if not _in_experiment(user_id, settings.product_cohort_experiment_percent, "cohort-v1"):
    return {"status": "control", "experiment": "color_cohort_v1", "items": []}
  membership = await db.fetchrow(
    "select cohort_key from product_color_cohort_memberships where user_id=$1 and expires_at>now()",
    user_id,
  )
  if not membership:
    return {"status": "insufficientData", "items": []}
  cohort_size = await db.fetchrow(
    "select count(*)::int as count from product_color_cohort_memberships where cohort_key=$1 and expires_at>now()",
    membership["cohort_key"],
  )
  size = int((cohort_size or {}).get("count") or 0)
  if size < settings.product_cohort_min_size:
    return {"status": "insufficientData", "items": [], "minimumCohortSize": settings.product_cohort_min_size}
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
  )
  items = []
  brands: Counter[str] = Counter()
  categories: Counter[str] = Counter()
  for row in rows:
    brand = str(row.get("brand_name") or "")
    category = str(row.get("category") or "")
    if brands[brand] >= 2 or categories[category] >= 4:
      continue
    item = map_catalog_product(row)
    item.update({"reasonCodes": ["SIMILAR_COLOR_COHORT"], "reasonLabels": ["비슷한 컬러 취향이 좋아해요"]})
    items.append(item)
    brands[brand] += 1
    categories[category] += 1
  if len(items) < limit:
    external_rows = await db.fetch(
      """
      select l.external_source,l.external_product_id,l.brand_name,l.product_name,l.category,
        l.image_url,l.purchase_url,l.price_amount,l.price_currency,l.source_updated_at,
        count(distinct l.user_id)::int as like_count
      from product_color_cohort_memberships m
      join external_product_likes l on l.user_id=m.user_id
        and l.liked_at>=now()-interval '180 days'
      where m.cohort_key=$1 and m.expires_at>now() and m.user_id<>$2
        and m.contribution_count>0
        and not exists (
          select 1 from external_product_likes viewer
          where viewer.user_id=$2 and viewer.external_source=l.external_source
            and viewer.external_product_id=l.external_product_id
        )
      group by l.external_source,l.external_product_id,l.brand_name,l.product_name,l.category,
        l.image_url,l.purchase_url,l.price_amount,l.price_currency,l.source_updated_at
      having count(distinct l.user_id)>=$4
      order by like_count desc,l.external_product_id limit $3
      """,
      membership["cohort_key"],
      user_id,
      limit - len(items),
      settings.product_cohort_min_item_support,
    )
    for row in external_rows:
      brand = str(row.get("brand_name") or "")
      category = str(row.get("category") or "")
      if brands[brand] >= 2 or categories[category] >= 4:
        continue
      items.append({
        "productId": row["external_product_id"],
        "shadeId": None,
        "brandName": brand,
        "productName": row["product_name"],
        "category": category,
        "imageUrl": row["image_url"],
        "purchaseUrl": row["purchase_url"],
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
  return {
    "status": "ready" if items else "insufficientData",
    "description": "별도 동의한 넓은 컬러·제품 취향 집계에서 많이 저장한 제품이에요",
    "cohortSizeBand": f"{settings.product_cohort_min_size}+",
    "minimumCohortSize": settings.product_cohort_min_size,
    "minimumItemSupport": settings.product_cohort_min_item_support,
    "items": items,
  }
