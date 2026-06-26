import json
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.db.session import Database, require_database
from app.schemas.ar import ARFilterStateUpsert
from app.services.users import ensure_user


router = APIRouter(prefix="/ar", tags=["ar"])


@router.get("/filters")
async def list_ar_filters(
  category: str | None = None,
  db: Database = Depends(require_database),
) -> dict:
  if category:
    filters = await db.fetch(
      """
      select *
      from ar_filters
      where is_public = true and category = $1
      order by created_at desc
      """,
      category,
    )
  else:
    filters = await db.fetch(
      """
      select *
      from ar_filters
      where is_public = true
      order by created_at desc
      """,
    )

  return success({"filters": filters})


@router.get("/filter-states")
async def list_ar_filter_states(
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  states = await db.fetch(
    """
    select *
    from user_ar_filter_states
    where user_id = $1
    order by updated_at desc
    """,
    user["id"],
  )

  return success({"states": states})


@router.put("/filter-states/{filter_id}")
async def upsert_ar_filter_state(
  filter_id: UUID,
  payload: ARFilterStateUpsert,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  existing = await db.fetchrow(
    """
    select *
    from user_ar_filter_states
    where user_id = $1 and filter_id = $2
    order by updated_at desc
    limit 1
    """,
    user["id"],
    filter_id,
  )

  if existing:
    state = await db.fetchrow(
      """
      update user_ar_filter_states
      set selected_face_part = $3,
          selected_color_id = $4,
          selected_type_id = $5,
          selected_texture_id = $6,
          guide_mode = $7,
          comparison_mode = $8,
          is_overlay_visible = $9,
          landmarks = $10::jsonb,
          adjustments = $11::jsonb,
          saved_at = now()
      where id = $1 and user_id = $2
      returning *
      """,
      existing["id"],
      user["id"],
      payload.selected_face_part,
      payload.selected_color_id,
      payload.selected_type_id,
      payload.selected_texture_id,
      payload.guide_mode,
      payload.comparison_mode,
      payload.is_overlay_visible,
      json.dumps(payload.landmarks),
      json.dumps(payload.adjustments),
    )
  else:
    state = await db.fetchrow(
      """
      insert into user_ar_filter_states (
        user_id,
        filter_id,
        selected_face_part,
        selected_color_id,
        selected_type_id,
        selected_texture_id,
        guide_mode,
        comparison_mode,
        is_overlay_visible,
        landmarks,
        adjustments,
        saved_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, now())
      returning *
      """,
      user["id"],
      filter_id,
      payload.selected_face_part,
      payload.selected_color_id,
      payload.selected_type_id,
      payload.selected_texture_id,
      payload.guide_mode,
      payload.comparison_mode,
      payload.is_overlay_visible,
      json.dumps(payload.landmarks),
      json.dumps(payload.adjustments),
    )

  return success({"state": state})
