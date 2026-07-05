import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.db.session import Database, require_database
from app.schemas.ar import ARFilterStateUpsert
from app.services.users import ensure_user


router = APIRouter(prefix="/ar", tags=["ar"])


def _decode_json_object(value: object) -> dict[str, Any]:
  if isinstance(value, dict):
    return value

  if isinstance(value, str) and value.strip():
    try:
      decoded = json.loads(value)
    except json.JSONDecodeError:
      return {}

    return decoded if isinstance(decoded, dict) else {}

  return {}


def _clean_text(value: object) -> str:
  return str(value or "").strip()


def _map_ar_filter(row: dict[str, Any]) -> dict[str, Any]:
  payload = _decode_json_object(row.get("filter_payload"))
  external_key = _clean_text(row.get("external_key"))
  row_id = _clean_text(row.get("id"))
  filter_id = external_key or row_id
  title = _clean_text(row.get("title"))
  subtitle = _clean_text(row.get("subtitle"))
  match_score = payload.get("matchScore")
  mapped = {
    "id": filter_id,
    "databaseId": row_id,
    "externalKey": external_key or None,
    "categoryId": _clean_text(row.get("category")),
    "title": title,
    "subtitle": subtitle,
    "intensityLabel": _clean_text(row.get("intensity_label")),
    "headline": _clean_text(payload.get("headline")),
    "displayTitle": _clean_text(payload.get("displayTitle")) or title,
    "description": _clean_text(payload.get("description")) or subtitle,
    "categoryTags": payload.get("categoryTags") if isinstance(payload.get("categoryTags"), list) else [],
    "keywords": payload.get("keywords") if isinstance(payload.get("keywords"), list) else [],
    "embeddingVector": payload.get("embeddingVector") if isinstance(payload.get("embeddingVector"), list) else [],
    "matchScore": match_score if isinstance(match_score, (int, float)) else 0,
    "makeupAreas": payload.get("makeupAreas") if isinstance(payload.get("makeupAreas"), list) else [],
    "colorOptions": payload.get("colorOptions") if isinstance(payload.get("colorOptions"), list) else [],
    "typeOptions": payload.get("typeOptions") if isinstance(payload.get("typeOptions"), list) else [],
    "textureOptions": payload.get("textureOptions") if isinstance(payload.get("textureOptions"), list) else [],
    "presetValues": payload.get("presetValues") if isinstance(payload.get("presetValues"), dict) else {},
    "filterPayload": payload,
  }

  return mapped


@router.get("/filters")
async def list_ar_filters(
  category: str | None = None,
  kind: str | None = None,
  db: Database = Depends(require_database),
) -> dict:
  conditions = ["f.is_public = true"]
  args: list[str] = []

  if category:
    args.append(category)
    conditions.append(f"f.category = ${len(args)}::filter_category")

  if kind:
    args.append(kind)
    conditions.append(f"f.filter_payload->>'kind' = ${len(args)}")

  filters = await db.fetch(
    f"""
    select
      f.*
    from ar_filters f
    where {" and ".join(conditions)}
    order by
      case
        when f.filter_payload->>'sortOrder' ~ '^[0-9]+$'
        then (f.filter_payload->>'sortOrder')::integer
        else 9999
      end asc,
      f.created_at desc
    """,
    *args,
  )

  return success({"filters": [_map_ar_filter(filter_row) for filter_row in filters]})


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
