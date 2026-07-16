"""Batch pipeline that turns normalized trends into cached seasonal rows."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
import json
from math import ceil, log1p
import re
from typing import Any
from uuid import UUID, uuid4

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.services.product_catalog import offer_freshness_sql
from app.services.product_operators import (
  SEASONAL_EDITOR,
  SEASONAL_PUBLISHER,
  SEASONAL_REVIEWER,
  require_product_operator,
)
from app.services.product_trend_sources import TrendSnapshot, TrendSourceAdapter, collect_trend_snapshot


_TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣+#&-]+")
_GENERIC_TOKENS = {"메이크업", "화장품", "상품", "제품", "여름", "겨울", "트렌드", "추천"}
_REASON_LABELS = {
  "TREND_CATEGORY_MATCH": "주목받는 메이크업 카테고리와 맞아요",
  "TREND_KEYWORD_MATCH": "최근 트렌드 키워드와 상품 정보가 맞아요",
  "TREND_FINISH_MATCH": "트렌드 피니시와 맞아요",
  "TREND_COLOR_MATCH": "트렌드 색상 계열과 맞아요",
  "TREND_TAG_MATCH": "트렌드 특성과 상품 태그가 맞아요",
  "POPULAR_FALLBACK": "트렌드 상품이 부족해 앱 인기 상품으로 채웠어요",
}


def _text(value: Any) -> str:
  return " ".join(str(value or "").strip().split())


def _tokens(*values: Any) -> set[str]:
  return {
    token.casefold()
    for value in values
    for token in _TOKEN_PATTERN.findall(_text(value))
    if token and token.casefold() not in _GENERIC_TOKENS
  }


def _list(value: Any) -> list[str]:
  if isinstance(value, str):
    try:
      decoded = json.loads(value)
    except json.JSONDecodeError:
      decoded = None
    value = decoded if isinstance(decoded, list) else [value]
  return [_text(item) for item in value or [] if _text(item)] if isinstance(value, (list, tuple)) else []


def _payload_tags(value: Any) -> list[str]:
  if isinstance(value, str):
    try:
      value = json.loads(value)
    except json.JSONDecodeError:
      return []
  if not isinstance(value, dict):
    return []
  attributes = value.get("attributes") if isinstance(value.get("attributes"), dict) else {}
  return _list(value.get("tags")) + _list(value.get("features")) + [
    _text(attributes.get("texture")),
    _text(attributes.get("undertone")),
  ]


def _engagement_score(candidate: dict[str, Any]) -> float:
  likes = max(0, int(candidate.get("liked_count") or candidate.get("likedCount") or 0))
  opens = max(0, int(candidate.get("open_count") or candidate.get("openCount") or 0))
  outbounds = max(0, int(candidate.get("outbound_count") or candidate.get("outboundCount") or 0))
  return log1p(likes) * 0.55 + log1p(opens) * 0.2 + log1p(outbounds) * 0.4


def _score_candidate(snapshot: TrendSnapshot, candidate: dict[str, Any]) -> tuple[float, list[str]]:
  category = _text(candidate.get("category"))
  product_name = _text(candidate.get("product_name") or candidate.get("productName"))
  brand_name = _text(candidate.get("brand_name") or candidate.get("brandName"))
  finish = _text(candidate.get("finish")).casefold()
  color_family = _text(candidate.get("color_family") or candidate.get("colorFamily")).casefold()
  tags = _list(candidate.get("tags")) + _payload_tags(candidate.get("product_payload"))
  searchable_tokens = _tokens(product_name, brand_name, *tags, finish, color_family)
  best_score = 0.0
  best_reasons: list[str] = []
  for signal in snapshot.signals:
    score = 0.0
    reasons: list[str] = []
    if category in signal.categories:
      score += 4.0
      reasons.append("TREND_CATEGORY_MATCH")
    keyword_tokens = _tokens(signal.keyword)
    overlap = keyword_tokens & searchable_tokens
    if overlap:
      score += min(3.0, len(overlap) * 1.25)
      reasons.append("TREND_KEYWORD_MATCH")
    if finish and finish in {value.casefold() for value in signal.finishes}:
      score += 1.8
      reasons.append("TREND_FINISH_MATCH")
    if color_family and color_family in {value.casefold() for value in signal.color_families}:
      score += 1.4
      reasons.append("TREND_COLOR_MATCH")
    if _tokens(*signal.tags) & searchable_tokens:
      score += 1.2
      reasons.append("TREND_TAG_MATCH")
    score *= 0.55 + signal.confidence_score * 0.45
    if score > best_score:
      best_score = score
      best_reasons = reasons
  return best_score + _engagement_score(candidate), best_reasons


def _diversify(
  ranked: list[tuple[float, dict[str, Any], list[str]]],
  *,
  limit: int,
  initial: list[tuple[float, dict[str, Any], list[str]]] | None = None,
) -> list[tuple[float, dict[str, Any], list[str]]]:
  if limit <= 0:
    return []
  initial = list(initial or [])[:limit]
  if not ranked:
    return initial
  categories = list(dict.fromkeys(_text(candidate.get("category")) for _, candidate, _ in ranked))
  brands = {
    _text(candidate.get("brand_name") or candidate.get("brandName"))
    for _, candidate, _ in [*initial, *ranked]
  }
  brand_limit = max(2, ceil(limit / max(1, min(len(brands), 6))))
  by_category: defaultdict[str, list[tuple[float, dict[str, Any], list[str]]]] = defaultdict(list)
  for row in ranked:
    by_category[_text(row[1].get("category"))].append(row)
  selected = initial
  product_ids = {
    _text(candidate.get("product_id") or candidate.get("productId"))
    for _, candidate, _ in selected
  }
  brand_counts = Counter(
    _text(candidate.get("brand_name") or candidate.get("brandName"))
    for _, candidate, _ in selected
  )
  positions: Counter[str] = Counter()

  def take(row: tuple[float, dict[str, Any], list[str]], enforce_brand: bool = True) -> bool:
    candidate = row[1]
    product_id = _text(candidate.get("product_id") or candidate.get("productId"))
    brand = _text(candidate.get("brand_name") or candidate.get("brandName"))
    if not product_id or product_id in product_ids or (enforce_brand and brand_counts[brand] >= brand_limit):
      return False
    selected.append(row)
    product_ids.add(product_id)
    brand_counts[brand] += 1
    return True

  while len(selected) < limit:
    added = False
    for category in categories:
      rows = by_category[category]
      while positions[category] < len(rows):
        row = rows[positions[category]]
        positions[category] += 1
        if take(row):
          added = True
          break
      if len(selected) >= limit:
        break
    if not added:
      break
  if len(selected) < limit:
    for row in ranked:
      take(row, enforce_brand=False)
      if len(selected) >= limit:
        break
  return selected


def match_trends_to_products(
  snapshot: TrendSnapshot,
  candidates: list[dict[str, Any]],
  *,
  limit: int,
) -> list[dict[str, Any]]:
  """Rank eligible rows, enforce brand/category diversity, then fill by popularity."""

  matched: list[tuple[float, dict[str, Any], list[str]]] = []
  popular: list[tuple[float, dict[str, Any], list[str]]] = []
  for candidate in candidates:
    score, reasons = _score_candidate(snapshot, candidate)
    row = (score, candidate, reasons)
    if reasons:
      matched.append(row)
    popular.append((_engagement_score(candidate), candidate, ["POPULAR_FALLBACK"]))
  matched.sort(key=lambda row: (-row[0], _text(row[1].get("product_id") or row[1].get("productId"))))
  selected = _diversify(matched, limit=limit)
  selected_ids = {_text(row[1].get("product_id") or row[1].get("productId")) for row in selected}
  if len(selected) < limit:
    popular = [row for row in popular if _text(row[1].get("product_id") or row[1].get("productId")) not in selected_ids]
    popular.sort(key=lambda row: (-row[0], _text(row[1].get("product_id") or row[1].get("productId"))))
    selected = _diversify(popular, limit=limit, initial=selected)
  items = []
  for position, (score, candidate, reasons) in enumerate(selected[:limit]):
    reason_codes = list(dict.fromkeys(reasons)) or ["POPULAR_FALLBACK"]
    items.append({
      "productId": _text(candidate.get("product_id") or candidate.get("productId")),
      "shadeId": _text(candidate.get("shade_id") or candidate.get("shadeId")) or None,
      "position": position,
      "reasonCode": reason_codes[0],
      "reasonCodes": reason_codes,
      "reasonLabels": [_REASON_LABELS[code] for code in reason_codes if code in _REASON_LABELS],
      "matchScore": round(score, 4),
      "sponsorshipType": "organic",
    })
  return items


async def fetch_seasonal_product_candidates(
  db: Database,
  settings: Settings,
  *,
  limit: int = 500,
) -> list[dict[str, Any]]:
  if not db.is_connected:
    return []
  rows = await db.fetch(
    f"""
    select p.id as product_id,p.brand_name,p.product_name,p.category::text as category,
      p.tags,p.product_payload,s.id as shade_id,s.color_family,s.finish,
      coalesce(l.liked_count,0)::int as liked_count,
      coalesce(e.open_count,0)::int as open_count,
      coalesce(e.outbound_count,0)::int as outbound_count
    from products p
    left join lateral (
      select x.id,x.color_family,x.finish from product_shades x
      where x.product_id=p.id and x.is_active=true and x.license_status='valid'
        and x.allowed_uses @> array['mobile_display','recommendation']::text[]
        and (x.license_valid_from is null or x.license_valid_from<=now())
        and (x.license_valid_until is null or x.license_valid_until>now())
      order by x.reviewed_at desc nulls last,x.id limit 1
    ) s on true
    left join lateral (
      select count(*)::int as liked_count from user_product_likes x where x.product_id=p.id
    ) l on true
    left join lateral (
      select count(*) filter (where x.event_type in ('product_open','search_result_open'))::int as open_count,
        count(*) filter (where x.event_type='seller_outbound')::int as outbound_count
      from product_engagement_events x where x.product_id=p.id and x.occurred_at>=now()-interval '90 days'
    ) e on true
    where p.is_active=true and p.catalog_status='published' and p.license_status='valid'
      and p.allowed_uses @> array['mobile_display','recommendation']::text[]
      and (p.license_valid_from is null or p.license_valid_from<=now())
      and (p.license_valid_until is null or p.license_valid_until>now())
      and exists (
        select 1 from product_assets a where a.product_id=p.id and a.is_active=true
          and a.asset_type='packshot' and a.license_status='valid'
          and a.allowed_uses @> array['mobile_display','recommendation']::text[]
          and (a.valid_from is null or a.valid_from<=now()) and (a.valid_until is null or a.valid_until>now())
      )
      and exists (
        select 1 from product_offers o where o.product_id=p.id and o.is_active=true
          and o.availability_status in ('in_stock','limited') and o.license_status='valid'
          and o.allowed_uses @> array['mobile_display']::text[]
          and (o.valid_until is null or o.valid_until>now())
          {offer_freshness_sql("o", "$1")}
      )
    order by (coalesce(l.liked_count,0)*3+coalesce(e.outbound_count,0)*2+coalesce(e.open_count,0)) desc,p.id
    limit $2
    """,
    settings.product_offer_max_age_hours,
    limit,
  )
  return [dict(row) for row in rows]


async def _require_publish_actors(connection: Any, *, created_by: UUID, reviewed_by: UUID, published_by: UUID) -> None:
  if published_by in {created_by, reviewed_by}:
    raise AppError(422, "SEASONAL_TWO_PERSON_REQUIRED", "Seasonal reviewer/publisher separation is required.")
  for actor_id, role in ((created_by, SEASONAL_EDITOR), (reviewed_by, SEASONAL_REVIEWER), (published_by, SEASONAL_PUBLISHER)):
    await require_product_operator(
      connection,
      user_id=actor_id,
      roles={role},
      error_code="INVALID_SEASONAL_ACTOR",
      message=f"Seasonal trend publishing requires an active {role} grant.",
    )


async def persist_trend_collection(
  db: Database,
  snapshot: TrendSnapshot,
  items: list[dict[str, Any]],
  *,
  publish: bool,
  created_by: UUID | None = None,
  reviewed_by: UUID | None = None,
  published_by: UUID | None = None,
  now: datetime | None = None,
) -> UUID:
  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Seasonal trend collection persistence requires a database.")
  generated_at = now or datetime.now(timezone.utc)
  if snapshot.is_stale:
    raise AppError(422, "STALE_TREND_SOURCE", "A stale trend source cannot create a collection.")
  if publish and not items:
    raise AppError(422, "SEASONAL_PRODUCTS_REQUIRED", "A published trend collection requires eligible products.")
  if publish and not all((created_by, reviewed_by, published_by)):
    raise AppError(422, "SEASONAL_ACTORS_REQUIRED", "Publishing requires editor, reviewer and publisher actor IDs.")
  collection_id = uuid4()
  slug = f"seasonal-trends-{snapshot.locale.casefold().replace('_', '-')}"
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      previous = await connection.fetchrow(
        "select id,revision,status from product_seasonal_collections where slug=$1 order by revision desc limit 1 for update",
        slug,
      )
      revision = int((previous or {}).get("revision") or 0) + 1
      if publish:
        await _require_publish_actors(
          connection,
          created_by=created_by,  # type: ignore[arg-type]
          reviewed_by=reviewed_by,  # type: ignore[arg-type]
          published_by=published_by,  # type: ignore[arg-type]
        )
      status = "published" if publish else "draft"
      source_payload = {
        "sourceName": snapshot.source_name,
        "sourceUpdatedAt": snapshot.source_updated_at.isoformat(),
        "providerStatus": "collected",
        "trendMetric": snapshot.source_metadata.get("metric", "trend_signal"),
        "collector": snapshot.source_metadata,
        "contentReviewReference": "automated-normalize-validate-v1",
      }
      await connection.execute(
        """insert into product_seasonal_collections (
          id,slug,title,summary,locale,trend_window,source_name,source_updated_at,
          source_labels,source_payload,trend_keywords,reason_codes,confidence_score,
          valid_from,valid_until,reviewed_at,published_at,status,revision,
          created_by,reviewed_by,published_by,previous_revision_id
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,
          case when $16::text='published' then now() else null end,
          case when $16::text='published' then now() else null end,$16,$17,$18,$19,$20,$21)""",
        collection_id,
        slug,
        snapshot.title,
        snapshot.summary,
        snapshot.locale,
        snapshot.trend_window,
        snapshot.source_name,
        snapshot.source_updated_at,
        [snapshot.source_name],
        json.dumps(source_payload),
        snapshot.trend_keywords,
        snapshot.reason_codes,
        snapshot.confidence_score,
        generated_at,
        generated_at + timedelta(days=7),
        status,
        revision,
        created_by,
        reviewed_by if publish else None,
        published_by if publish else None,
        previous.get("id") if previous else None,
      )
      for item in items:
        await connection.execute(
          """insert into product_seasonal_collection_items (
            collection_id,product_id,shade_id,position,reason_code,reason_codes,match_score,sponsorship_type
          ) values ($1,$2,$3,$4,$5,$6,$7,$8)""",
          collection_id,
          UUID(item["productId"]),
          UUID(item["shadeId"]) if item.get("shadeId") else None,
          item["position"],
          item["reasonCode"],
          item["reasonCodes"],
          item["matchScore"],
          item["sponsorshipType"],
        )
      if publish and previous and previous.get("status") == "published":
        await connection.execute(
          """update product_seasonal_collections set status='suspended',
            suspension_reason='superseded_by_trend_refresh',updated_at=now() where id=$1""",
          previous["id"],
        )
  from app.services.product_recommendations import clear_seasonal_recommendation_cache
  clear_seasonal_recommendation_cache()
  return collection_id


async def refresh_seasonal_trend_collection(
  db: Database,
  settings: Settings,
  *,
  locale: str = "ko-KR",
  limit: int = 18,
  apply: bool = False,
  publish: bool = False,
  created_by: UUID | None = None,
  reviewed_by: UUID | None = None,
  published_by: UUID | None = None,
  adapters: tuple[TrendSourceAdapter, ...] | None = None,
  now: datetime | None = None,
) -> dict[str, Any]:
  snapshot = await collect_trend_snapshot(settings, locale=locale, now=now, adapters=adapters)
  candidates = await fetch_seasonal_product_candidates(db, settings)
  items = match_trends_to_products(snapshot, candidates, limit=limit)
  collection_id = None
  if apply:
    collection_id = await persist_trend_collection(
      db,
      snapshot,
      items,
      publish=publish,
      created_by=created_by,
      reviewed_by=reviewed_by,
      published_by=published_by,
      now=now,
    )
  return {
    "mode": "apply" if apply else "dry-run",
    "status": "published" if apply and publish else "draft" if apply else "preview",
    "collectionId": str(collection_id) if collection_id else None,
    "slug": f"seasonal-trends-{snapshot.locale.casefold().replace('_', '-')}",
    "title": snapshot.title,
    "summary": snapshot.summary,
    "trendWindow": snapshot.trend_window,
    "locale": snapshot.locale,
    "sourceName": snapshot.source_name,
    "sourceUpdatedAt": snapshot.source_updated_at.isoformat(),
    "trendKeywords": snapshot.trend_keywords,
    "reasonCodes": snapshot.reason_codes,
    "confidenceScore": snapshot.confidence_score,
    "candidateCount": len(candidates),
    "itemCount": len(items),
    "items": items,
  }
