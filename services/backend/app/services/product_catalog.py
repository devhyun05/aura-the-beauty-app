"""Trusted catalog reads and outbound URL validation for recommendation V2."""

from __future__ import annotations

from datetime import datetime, timezone
from ipaddress import ip_address
from typing import Any, Iterable
from urllib.parse import urlparse
from uuid import UUID

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database


DISPLAY_USE = "mobile_display"
RECOMMENDATION_USE = "recommendation"
ELIGIBLE_EVIDENCE_TYPES = {
  "measured_swatch",
  "licensed_partner_feed",
  "brand_official_swatch",
  "manual_review",
}


async def get_catalog_readiness(db: Database, *, offer_max_age_hours: int = 168) -> dict[str, Any]:
  """Report only evidence-backed readiness; configured DB alone is not data readiness."""

  empty = {
    "eligibleProducts": 0,
    "arEligibleProducts": 0,
    "publishedSeasonalCollections": 0,
  }
  if not db.is_connected:
    return empty
  row = await db.fetchrow(
    f"""
    select
      count(*) filter (where exists (
        select 1
        from product_assets a
        join product_offers o on o.product_id=a.product_id
          and (a.shade_id is null or o.shade_id is null or a.shade_id=o.shade_id)
        where a.product_id=p.id and a.is_active=true and a.asset_type='packshot'
          and a.license_status='valid' and a.allowed_uses @> array['mobile_display']::text[]
          and (a.valid_from is null or a.valid_from<=now())
          and (a.valid_until is null or a.valid_until>now())
          and o.is_active=true and o.availability_status in ('in_stock','limited')
          and o.license_status='valid' and o.allowed_uses @> array['mobile_display']::text[]
          and (o.valid_until is null or o.valid_until>now())
          {offer_freshness_sql("o", "$2")}
          and ((a.shade_id is null and o.shade_id is null) or exists (
            select 1 from product_shades display_shade
            where display_shade.id=coalesce(a.shade_id,o.shade_id)
              and display_shade.product_id=p.id and display_shade.is_active=true
              and display_shade.license_status='valid'
              and display_shade.allowed_uses @> array['mobile_display']::text[]
              and (display_shade.license_valid_from is null or display_shade.license_valid_from<=now())
              and (display_shade.license_valid_until is null or display_shade.license_valid_until>now())
          ))
      ))::int as eligible_products,
      count(*) filter (where exists (
        select 1 from product_shades s where s.product_id=p.id and s.is_active=true
          and s.evidence_type = any($1::text[]) and s.lab_l is not null
          and s.lab_a is not null and s.lab_b is not null
          and s.license_status='valid'
          and s.allowed_uses @> array['mobile_display','recommendation']::text[]
          and (s.license_valid_from is null or s.license_valid_from<=now())
          and (s.license_valid_until is null or s.license_valid_until>now())
          and exists (select 1 from product_assets a where a.product_id=p.id and a.is_active=true
            and a.asset_type='packshot' and a.license_status='valid'
            and a.allowed_uses @> array['mobile_display','recommendation']::text[]
            and (a.shade_id is null or a.shade_id=s.id)
            and (a.valid_from is null or a.valid_from<=now())
            and (a.valid_until is null or a.valid_until>now()))
          and exists (select 1 from product_offers o where o.product_id=p.id and o.is_active=true
            and o.availability_status in ('in_stock','limited') and o.license_status='valid'
            and o.allowed_uses @> array['mobile_display']::text[]
            and (o.shade_id is null or o.shade_id=s.id)
            and (o.valid_until is null or o.valid_until>now())
            {offer_freshness_sql("o", "$2")})
      ))::int as ar_eligible_products,
      (select count(*)::int from product_seasonal_collections c
        where c.status='published' and c.valid_from<=now() and c.valid_until>now()
          and c.reviewed_at is not null and c.published_at is not null
      ) as published_seasonal_collections
    from products p
    where p.is_active=true and p.catalog_status='published' and p.license_status='valid'
      and p.allowed_uses @> array['mobile_display','recommendation']::text[]
      and (p.license_valid_from is null or p.license_valid_from<=now())
      and (p.license_valid_until is null or p.license_valid_until>now())
    """,
    sorted(ELIGIBLE_EVIDENCE_TYPES),
    offer_max_age_hours,
  )
  return {
    "eligibleProducts": int((row or {}).get("eligible_products") or 0),
    "arEligibleProducts": int((row or {}).get("ar_eligible_products") or 0),
    "publishedSeasonalCollections": int((row or {}).get("published_seasonal_collections") or 0),
  }


def domain_is_allowed(hostname: str, allowlist: Iterable[str]) -> bool:
  host = hostname.rstrip(".").lower()
  return any(host == domain or host.endswith(f".{domain}") for domain in allowlist)


def validate_external_https_url(url: str, allowlist: Iterable[str], *, kind: str) -> str:
  parsed = urlparse(str(url or "").strip())
  host = (parsed.hostname or "").lower()
  if parsed.scheme != "https" or not host or parsed.username or parsed.password:
    raise AppError(422, "UNSAFE_EXTERNAL_URL", f"{kind} URL must be an approved HTTPS URL.")
  try:
    address = ip_address(host)
  except ValueError:
    address = None
  if address and (address.is_private or address.is_loopback or address.is_link_local or address.is_reserved):
    raise AppError(422, "UNSAFE_EXTERNAL_URL", f"{kind} URL cannot use a private or reserved address.")
  allowed = tuple(domain.strip().lower() for domain in allowlist if domain.strip())
  if not allowed or not domain_is_allowed(host, allowed):
    raise AppError(422, "UNAPPROVED_EXTERNAL_DOMAIN", f"{kind} domain is not approved.")
  return parsed.geturl()


def _iso(value: Any) -> str | None:
  if isinstance(value, datetime):
    normalized = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return normalized.isoformat()
  return str(value) if value else None


def _uuid(value: Any) -> str | None:
  try:
    return str(UUID(str(value))) if value else None
  except ValueError:
    return None


def map_catalog_product(row: dict[str, Any], *, liked: bool | None = None) -> dict[str, Any]:
  price = row.get("price_amount")
  return {
    "productId": str(row["product_id"]),
    "shadeId": _uuid(row.get("shade_id")),
    "brandName": str(row.get("brand_name") or ""),
    "productName": str(row.get("product_name") or ""),
    "category": str(row.get("category") or ""),
    "shadeName": str(row.get("shade_name") or "") or None,
    "shadeHex": str(row.get("srgb_hex") or "") or None,
    "finish": str(row.get("finish") or "") or None,
    "imageUrl": str(row.get("image_url") or "") or None,
    "price": {
      "amount": int(price) if isinstance(price, (int, float)) else None,
      "currency": str(row.get("currency") or "KRW"),
      "updatedAt": _iso(row.get("price_updated_at")),
    },
    "offer": (
      {
        "offerId": _uuid(row.get("offer_id")),
        "sellerName": str(row.get("seller_name") or ""),
        "sellerDomain": str(row.get("seller_domain") or ""),
        "availability": str(row.get("availability_status") or "unknown"),
        "affiliateType": str(row.get("affiliate_type") or "none"),
        "disclosureLabel": str(row.get("disclosure_label") or "") or None,
      }
      if row.get("offer_id")
      else None
    ),
    "viewerState": {"liked": bool(liked if liked is not None else row.get("liked"))},
    "catalogVersion": str(row.get("catalog_version") or "catalog_v2"),
    "sourceUpdatedAt": _iso(row.get("source_updated_at") or row.get("updated_at")),
    "sponsored": str(row.get("sponsorship_type") or "organic") != "organic",
    "canUnlike": True,
  }


def offer_freshness_sql(alias: str, max_age_placeholder: str) -> str:
  return f"""
    and {alias}.availability_checked_at is not null
    and {alias}.price_updated_at is not null
    and {alias}.availability_checked_at <= now()
    and {alias}.price_updated_at <= now()
    and {alias}.availability_checked_at >= now() - ({max_age_placeholder}::int * interval '1 hour')
    and {alias}.price_updated_at >= now() - ({max_age_placeholder}::int * interval '1 hour')
  """


def catalog_select(
  *,
  preferred_shade_placeholder: str | None = None,
  offer_max_age_placeholder: str = "168",
) -> str:
  shade_filter = (
    f"and ({preferred_shade_placeholder}::uuid is null or candidate.id = {preferred_shade_placeholder}::uuid)"
    if preferred_shade_placeholder
    else ""
  )
  shade_offer_freshness = offer_freshness_sql("shade_offer", offer_max_age_placeholder)
  offer_freshness = offer_freshness_sql("candidate", offer_max_age_placeholder)
  return f"""
  select
    p.id as product_id,
    p.brand_name,
    p.product_name,
    p.category::text as category,
    p.catalog_version,
    p.updated_at as source_updated_at,
    s.id as shade_id,
    s.shade_name,
    s.srgb_hex,
    s.lab_l,
    s.lab_a,
    s.lab_b,
    s.color_family,
    s.finish,
    s.coverage,
    s.opacity,
    s.evidence_type,
    s.evidence_confidence,
    a.asset_url as image_url,
    o.id as offer_id,
    o.seller_name,
    o.seller_domain,
    o.currency,
    o.price_amount,
    o.price_updated_at,
    o.availability_status,
    o.affiliate_type,
    o.disclosure_label
  from products p
  left join lateral (
    select candidate.*
    from product_shades candidate
    where candidate.product_id = p.id
      and candidate.is_active = true
      and candidate.license_status = 'valid'
      and candidate.allowed_uses @> array['mobile_display']::text[]
      and (candidate.license_valid_from is null or candidate.license_valid_from <= now())
      and (candidate.license_valid_until is null or candidate.license_valid_until > now())
      and exists (
        select 1 from product_assets shade_asset
        where shade_asset.product_id = candidate.product_id and shade_asset.is_active = true
          and shade_asset.asset_type = 'packshot' and shade_asset.license_status = 'valid'
          and shade_asset.allowed_uses @> array['mobile_display']::text[]
          and (shade_asset.shade_id is null or shade_asset.shade_id = candidate.id)
          and (shade_asset.valid_from is null or shade_asset.valid_from <= now())
          and (shade_asset.valid_until is null or shade_asset.valid_until > now())
      )
      and exists (
        select 1 from product_offers shade_offer
        where shade_offer.product_id = candidate.product_id and shade_offer.is_active = true
          and shade_offer.availability_status in ('in_stock', 'limited')
          and shade_offer.license_status = 'valid'
          and shade_offer.allowed_uses @> array['mobile_display']::text[]
          and (shade_offer.shade_id is null or shade_offer.shade_id = candidate.id)
          and (shade_offer.valid_until is null or shade_offer.valid_until > now())
          {shade_offer_freshness}
      )
      {shade_filter}
    order by candidate.reviewed_at desc nulls last, candidate.created_at
    limit 1
  ) s on true
  left join lateral (
    select candidate.*
    from product_assets candidate
    where candidate.product_id = p.id
      and candidate.is_active = true
      and candidate.asset_type = 'packshot'
      and candidate.license_status = 'valid'
      and candidate.allowed_uses @> array['mobile_display']::text[]
      and (candidate.valid_from is null or candidate.valid_from <= now())
      and (candidate.valid_until is null or candidate.valid_until > now())
      and (candidate.shade_id is null or candidate.shade_id = s.id)
    order by case when candidate.shade_id = s.id then 0 else 1 end,
      candidate.reviewed_at desc nulls last, candidate.created_at
    limit 1
  ) a on true
  left join lateral (
    select candidate.*
    from product_offers candidate
    where candidate.product_id = p.id
      and candidate.is_active = true
      and candidate.availability_status in ('in_stock', 'limited')
      and candidate.license_status = 'valid'
      and candidate.allowed_uses @> array['mobile_display']::text[]
      and (candidate.valid_until is null or candidate.valid_until > now())
      and (candidate.shade_id is null or candidate.shade_id = s.id)
      {offer_freshness}
    order by case when candidate.shade_id = s.id then 0 else 1 end,
      candidate.price_updated_at desc nulls last, candidate.created_at
    limit 1
  ) o on true
"""


CATALOG_SELECT = catalog_select()


ELIGIBLE_PRODUCT_WHERE = """
  p.is_active = true
  and p.catalog_status = 'published'
  and p.license_status = 'valid'
  and p.allowed_uses @> array['mobile_display', 'recommendation']::text[]
  and (p.license_valid_from is null or p.license_valid_from <= now())
  and (p.license_valid_until is null or p.license_valid_until > now())
"""


def displayable_product_where(offer_max_age_placeholder: str = "168") -> str:
  display_offer_freshness = offer_freshness_sql("display_offer", offer_max_age_placeholder)
  return f"""
  {ELIGIBLE_PRODUCT_WHERE}
  and exists (
    select 1
    from product_assets display_asset
    join product_offers display_offer
      on display_offer.product_id = display_asset.product_id
      and (
        display_asset.shade_id is null
        or display_offer.shade_id is null
        or display_offer.shade_id = display_asset.shade_id
      )
    where display_asset.product_id = p.id
      and display_asset.is_active = true
      and display_asset.asset_type = 'packshot'
      and display_asset.license_status = 'valid'
      and display_asset.allowed_uses @> array['mobile_display']::text[]
      and (display_asset.valid_from is null or display_asset.valid_from <= now())
      and (display_asset.valid_until is null or display_asset.valid_until > now())
      and display_offer.is_active = true
      and display_offer.availability_status in ('in_stock', 'limited')
      and display_offer.license_status = 'valid'
      and display_offer.allowed_uses @> array['mobile_display']::text[]
      and (display_offer.valid_until is null or display_offer.valid_until > now())
      {display_offer_freshness}
      and (
        (display_asset.shade_id is null and display_offer.shade_id is null)
        or exists (
          select 1 from product_shades display_shade
          where display_shade.id = coalesce(display_asset.shade_id, display_offer.shade_id)
            and display_shade.product_id = p.id
            and display_shade.is_active = true
            and display_shade.license_status = 'valid'
            and display_shade.allowed_uses @> array['mobile_display']::text[]
            and (display_shade.license_valid_from is null or display_shade.license_valid_from <= now())
            and (display_shade.license_valid_until is null or display_shade.license_valid_until > now())
        )
      )
  )
"""


DISPLAYABLE_PRODUCT_WHERE = displayable_product_where()


async def search_catalog(
  db: Database,
  *,
  query: str,
  category: str | None,
  limit: int,
  offer_max_age_hours: int = 168,
) -> list[dict[str, Any]]:
  normalized = " ".join(query.strip().split())
  if len(normalized) < 1 or len(normalized) > 80:
    raise AppError(422, "INVALID_SEARCH_QUERY", "Search text must be between 1 and 80 characters.")
  rows = await db.fetch(
    f"""
    {catalog_select(offer_max_age_placeholder="$4")}
    where {displayable_product_where("$4")}
      and a.id is not null and o.id is not null
      and ($2::text is null or p.category::text = $2)
      and (
        p.product_name ilike '%' || $1 || '%'
        or p.brand_name ilike '%' || $1 || '%'
        or coalesce(s.shade_name, '') ilike '%' || $1 || '%'
        or case p.category::text
          when 'lip' then 'lip 립 립스틱 틴트 글로스'
          when 'cheek' then 'cheek 치크 블러셔 볼터치'
          when 'shadow' then 'shadow 아이섀도 아이섀도우 눈화장'
          when 'liner' then 'liner 아이라이너 아이라인'
          when 'base' then 'base 베이스 파운데이션 쿠션'
          else p.category::text
        end ilike '%' || $1 || '%'
      )
    order by
      case when lower(p.product_name) = lower($1) then 0
           when lower(p.brand_name) = lower($1) then 1 else 2 end,
      greatest(similarity(p.product_name, $1), similarity(p.brand_name, $1)) desc,
      p.updated_at desc
    limit $3
    """,
    normalized,
    category,
    limit,
    offer_max_age_hours,
  )
  return [map_catalog_product(row) for row in rows]


async def get_catalog_product(
  db: Database,
  product_id: UUID,
  *,
  user_id: UUID | None,
  shade_id: UUID | None = None,
  offer_max_age_hours: int = 168,
) -> dict[str, Any] | None:
  row = await db.fetchrow(
    f"""
    {catalog_select(preferred_shade_placeholder="$2", offer_max_age_placeholder="$3")}
    where p.id = $1 and {displayable_product_where("$3")}
      and ($2::uuid is null or s.id = $2)
      and a.id is not null and o.id is not null
    """,
    product_id,
    shade_id,
    offer_max_age_hours,
  )
  if not row:
    return None
  liked = False
  if user_id:
    like = await db.fetchrow(
      "select 1 as liked from user_product_likes where user_id=$1 and product_id=$2",
      user_id,
      product_id,
    )
    liked = bool(like)
  return map_catalog_product(row, liked=liked)


async def ensure_like_eligible(
  db: Database,
  *,
  product_id: UUID,
  source_shade_id: UUID | None,
  offer_max_age_hours: int = 168,
) -> None:
  row = await db.fetchrow(
    f"""
    select p.id
    from products p
    where p.id = $1 and {displayable_product_where("$2")}
    """,
    product_id,
    offer_max_age_hours,
  )
  if not row:
    raise AppError(404, "PRODUCT_NOT_ELIGIBLE", "Product is not available for new likes.")
  if source_shade_id:
    shade = await db.fetchrow(
      f"""
      select id from product_shades
      where id = $1 and product_id = $2 and is_active = true
        and license_status = 'valid'
        and allowed_uses @> array['mobile_display']::text[]
        and (license_valid_from is null or license_valid_from <= now())
        and (license_valid_until is null or license_valid_until > now())
        and exists (
          select 1 from product_assets a
          where a.product_id = product_shades.product_id and a.is_active = true
            and a.asset_type = 'packshot' and a.license_status = 'valid'
            and a.allowed_uses @> array['mobile_display']::text[]
            and (a.shade_id is null or a.shade_id = product_shades.id)
            and (a.valid_from is null or a.valid_from <= now())
            and (a.valid_until is null or a.valid_until > now())
        )
        and exists (
          select 1 from product_offers o
          where o.product_id = product_shades.product_id and o.is_active = true
            and o.availability_status in ('in_stock', 'limited')
            and o.license_status = 'valid'
            and o.allowed_uses @> array['mobile_display']::text[]
            and (o.shade_id is null or o.shade_id = product_shades.id)
            and (o.valid_until is null or o.valid_until > now())
            {offer_freshness_sql("o", "$3")}
        )
      """,
      source_shade_id,
      product_id,
      offer_max_age_hours,
    )
    if not shade:
      raise AppError(422, "INVALID_SOURCE_SHADE", "sourceShadeId is not eligible for this product.")


async def resolve_outbound_offer(
  db: Database,
  settings: Settings,
  *,
  offer_id: UUID,
  product_id: UUID,
) -> dict[str, Any]:
  row = await db.fetchrow(
    f"""
    select id, shade_id, purchase_url, seller_domain, affiliate_type, disclosure_label
    from product_offers
    where id = $1 and product_id = $2 and is_active = true
      and availability_status in ('in_stock', 'limited')
      and license_status = 'valid'
      and allowed_uses @> array['mobile_display']::text[]
      and (valid_until is null or valid_until > now())
      {offer_freshness_sql("product_offers", "$3")}
    """,
    offer_id,
    product_id,
    settings.product_offer_max_age_hours,
  )
  if not row:
    raise AppError(404, "OFFER_NOT_AVAILABLE", "This seller offer is not available.")
  url = validate_external_https_url(
    str(row.get("purchase_url") or ""),
    settings.product_allowed_seller_domains,
    kind="Seller",
  )
  return {
    "offerId": str(row["id"]),
    "shadeId": _uuid(row.get("shade_id")),
    "url": url,
    "affiliateType": str(row.get("affiliate_type") or "none"),
    "disclosureLabel": str(row.get("disclosure_label") or "") or None,
  }
