import json

from fastapi import APIRouter, Depends

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.db.session import Database, require_database
from app.schemas.makeup import MakeupStyleCreate
from app.services.users import ensure_user


router = APIRouter(prefix="/makeup-styles", tags=["makeup-styles"])


@router.get("")
async def list_makeup_styles(
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  styles = await db.fetch(
    """
    select *
    from saved_makeup_styles
    where user_id = $1 and archived_at is null
    order by saved_at desc
    """,
    user["id"],
  )

  return success({"styles": styles})


@router.post("")
async def create_makeup_style(
  payload: MakeupStyleCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  style = await db.fetchrow(
    """
    insert into saved_makeup_styles (
      user_id,
      style_type,
      source_analysis_report_id,
      source_filter_extraction_id,
      source_media_id,
      thumbnail_media_id,
      title,
      mood_label,
      short_description,
      tags,
      style_payload
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
    returning *
    """,
    user["id"],
    payload.style_type,
    payload.source_analysis_report_id,
    payload.source_filter_extraction_id,
    payload.source_media_id,
    payload.thumbnail_media_id,
    payload.title,
    payload.mood_label,
    payload.short_description,
    payload.tags,
    json.dumps(payload.style_payload),
  )

  return success({"style": style})
