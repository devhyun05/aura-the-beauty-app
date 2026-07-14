import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, get_database, require_database
from app.services.shopping_products import build_product_recommendation_data, _map_db_product
from app.services.users import ensure_user


router = APIRouter(prefix="/products", tags=["products"])


def _clean_text(value: Any) -> str:
  return str(value or "").strip()


def _normalize_category(value: Any) -> str:
  # R1: product_category enum(schema.sql:product-category-brow-v1)과 동기 —
  # brow가 빠지면 Auradin 브로우 찜이 lip으로 저장되는 카테고리 손실이 재발한다.
  category = _clean_text(value)

  return category if category in {"lip", "cheek", "shadow", "liner", "base", "brow"} else "lip"


def _as_text_list(value: Any) -> list[str]:
  if not isinstance(value, list):
    return []

  return [_clean_text(item) for item in value if _clean_text(item)]


def _parse_price(value: Any) -> int:
  try:
    return max(0, int(str(value or "0").replace(",", "")))
  except ValueError:
    return 0


def _extract_liked_product_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
  product = payload.get("product") if isinstance(payload, dict) else None

  return product if isinstance(product, dict) else {}


async def _resolve_product_id_for_like(
  db: Database,
  product_id: str,
  product_payload: dict[str, Any],
) -> UUID:
  try:
    return UUID(product_id)
  except ValueError:
    pass

  external_key = _clean_text(product_payload.get("id")) or product_id
  brand_name = _clean_text(product_payload.get("brandName")) or "NAVER 쇼핑"
  product_name = _clean_text(product_payload.get("productName"))

  if not external_key or not product_name:
    raise AppError(
      400,
      "PRODUCT_PAYLOAD_REQUIRED",
      "Product payload is required when liking an external shopping product.",
    )

  row = await db.fetchrow(
    """
    insert into products (
      external_key,
      brand_name,
      product_name,
      shade_name,
      category,
      price_krw,
      tags,
      palette,
      product_payload,
      is_active
    )
    values ($1, $2, $3, $4, $5::product_category, $6, $7, $8, $9::jsonb, true)
    on conflict (external_key) do update set
      brand_name = excluded.brand_name,
      product_name = excluded.product_name,
      shade_name = excluded.shade_name,
      category = excluded.category,
      price_krw = excluded.price_krw,
      tags = excluded.tags,
      palette = excluded.palette,
      product_payload = products.product_payload || excluded.product_payload,
      is_active = true,
      updated_at = now()
    returning id
    """,
    external_key,
    brand_name,
    product_name,
    _clean_text(product_payload.get("shadeName")),
    _normalize_category(product_payload.get("category")),
    _parse_price(product_payload.get("price")),
    _as_text_list(product_payload.get("tags")),
    _as_text_list(product_payload.get("palette")),
    json.dumps(
      {
        "imageUrl": _clean_text(product_payload.get("imageUrl")),
        "matchRate": product_payload.get("matchRate"),
        "productInfo": (
          product_payload.get("productInfo")
          if isinstance(product_payload.get("productInfo"), dict)
          else {}
        ),
        "purchaseUrl": _clean_text(product_payload.get("purchaseUrl")),
        "reason": _clean_text(product_payload.get("reason")),
      },
      ensure_ascii=False,
    ),
  )

  if not row:
    raise AppError(500, "PRODUCT_UPSERT_FAILED", "Could not save liked product.")

  return row["id"]


async def _resolve_product_id_for_unlike(db: Database, product_id: str) -> UUID | None:
  try:
    return UUID(product_id)
  except ValueError:
    row = await db.fetchrow(
      "select id from products where external_key = $1 limit 1",
      product_id,
    )

    return row["id"] if row else None


@router.get("/recommendations")
async def get_product_recommendations(
  category: str | None = None,
  look_index: int | None = None,
  report_id: str | None = None,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(get_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  data, source = await build_product_recommendation_data(
    db,
    settings,
    category,
    auth_provider=auth.provider,
    look_index=look_index,
    oauth_sub=auth.subject,
    report_id=report_id,
  )

  return success(data, {"source": source})


@router.get("/liked")
async def get_liked_products(
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  products = await db.fetch(
    """
    select p.*, l.liked_at
    from user_product_likes l
    join products p on p.id = l.product_id
    where l.user_id = $1
    order by l.liked_at desc
    """,
    user["id"],
  )
  mapped_products = [
    product
    for index, row in enumerate(products)
    if (product := _map_db_product(row, index))
  ]

  return success({"products": mapped_products})


@router.post("/{product_id}/like")
async def like_product(
  product_id: str,
  payload: dict[str, Any] | None = Body(default=None),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  resolved_product_id = await _resolve_product_id_for_like(
    db,
    product_id,
    _extract_liked_product_payload(payload),
  )
  await db.execute(
    """
    insert into user_product_likes (user_id, product_id)
    values ($1, $2)
    on conflict (user_id, product_id) do nothing
    """,
    user["id"],
    resolved_product_id,
  )

  return success({"productId": product_id, "liked": True})


@router.delete("/{product_id}/like")
async def unlike_product(
  product_id: str,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  resolved_product_id = await _resolve_product_id_for_unlike(db, product_id)

  if resolved_product_id:
    await db.execute(
      "delete from user_product_likes where user_id = $1 and product_id = $2",
      user["id"],
      resolved_product_id,
    )

  return success({"productId": product_id, "liked": False})
