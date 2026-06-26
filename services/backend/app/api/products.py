from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.db.session import Database, require_database
from app.services.users import ensure_user


router = APIRouter(prefix="/products", tags=["products"])


@router.get("/recommendations")
async def get_product_recommendations(
  category: str | None = None,
  db: Database = Depends(require_database),
) -> dict:
  if category:
    products = await db.fetch(
      """
      select *
      from products
      where is_active = true and category = $1
      order by created_at desc
      limit 50
      """,
      category,
    )
  else:
    products = await db.fetch(
      """
      select *
      from products
      where is_active = true
      order by created_at desc
      limit 50
      """,
    )

  return success({"products": products})


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

  return success({"products": products})


@router.post("/{product_id}/like")
async def like_product(
  product_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  await db.execute(
    """
    insert into user_product_likes (user_id, product_id)
    values ($1, $2)
    on conflict (user_id, product_id) do nothing
    """,
    user["id"],
    product_id,
  )

  return success({"productId": product_id, "liked": True})


@router.delete("/{product_id}/like")
async def unlike_product(
  product_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  await db.execute(
    "delete from user_product_likes where user_id = $1 and product_id = $2",
    user["id"],
    product_id,
  )

  return success({"productId": product_id, "liked": False})
