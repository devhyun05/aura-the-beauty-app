from fastapi import APIRouter, Depends

from app.core.responses import success
from app.db.session import Database, get_database


router = APIRouter(prefix="/home", tags=["home"])


@router.get("")
async def get_home(db: Database = Depends(get_database)) -> dict:
  if not db.is_connected:
    return success(
      {
        "hero": None,
        "notices": [],
        "trends": [],
        "filterStore": [],
        "recommendedLooks": [],
      },
      {"source": "empty_not_configured"},
    )

  hero = await db.fetchrow(
    """
    select *
    from home_hero_banners
    where is_active = true
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at >= now())
    order by sort_order asc, created_at desc
    limit 1
    """,
  )
  hero_id = hero["id"] if hero else None
  notices = []
  trends = []

  if hero_id:
    notices = await db.fetch(
      """
      select *
      from home_notices
      where hero_banner_id = $1 and is_active = true
      order by sort_order asc, created_at desc
      """,
      hero_id,
    )
    trends = await db.fetch(
      """
      select *
      from home_trend_items
      where hero_banner_id = $1 and is_active = true
      order by sort_order asc, created_at desc
      """,
      hero_id,
    )

  filter_store = await db.fetch(
    """
    select *
    from home_filter_store_items
    where is_active = true
    order by sort_order asc, created_at desc
    """,
  )
  recommended_looks = await db.fetch(
    """
    select *
    from home_recommended_looks
    where is_active = true
    order by sort_order asc, created_at desc
    """,
  )

  return success(
    {
      "hero": hero,
      "notices": notices,
      "trends": trends,
      "filterStore": filter_store,
      "recommendedLooks": recommended_looks,
    },
  )
