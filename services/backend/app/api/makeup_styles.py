import json
from uuid import UUID

from fastapi import APIRouter, Depends, Response

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, require_database
from app.schemas.makeup import MakeupStyleCreate, MakeupStyleUpdate
from app.services.saved_ar_looks import (
  SAVED_AR_LOOK_SCHEMA,
  normalize_saved_ar_look,
  strip_sensitive_recipe_data,
)
from app.services.users import ensure_user


router = APIRouter(prefix="/makeup-styles", tags=["makeup-styles"])


def _style_payload(value):
  if isinstance(value, dict):
    return value
  if isinstance(value, str):
    try:
      parsed = json.loads(value)
      return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
      return {}
  return {}


def _public_style(value) -> dict:
  style = dict(value)
  style["style_payload"] = strip_sensitive_recipe_data(_style_payload(style.get("style_payload")))
  return style


async def _owned_style(db: Database, user_id: UUID, style_id: UUID) -> dict:
  style = await db.fetchrow(
    "select * from saved_makeup_styles where id=$1 and user_id=$2",
    style_id,
    user_id,
  )
  if not style:
    raise AppError(404, "MAKEUP_STYLE_NOT_FOUND", "Saved makeup style was not found.")
  return style


async def _validate_media_ownership(db: Database, user_id: UUID, media_id: UUID | None) -> None:
  if not media_id:
    return
  row = await db.fetchrow(
    "select id from media_assets where id=$1 and owner_user_id=$2 and deleted_at is null",
    media_id,
    user_id,
  )
  if not row:
    raise AppError(422, "INVALID_STYLE_MEDIA", "Style media must belong to the current user.")


@router.get("")
async def list_makeup_styles(
  response: Response,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  styles = await db.fetch(
    """
    select * from saved_makeup_styles
    where user_id=$1 and archived_at is null
    order by saved_at desc
    """,
    user["id"],
  )
  response.headers["Cache-Control"] = "private, no-store"
  return success({"styles": [_public_style(style) for style in styles]})


@router.get("/{style_id}")
async def get_makeup_style(
  style_id: UUID,
  response: Response,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  response.headers["Cache-Control"] = "private, no-store"
  return success({"style": _public_style(await _owned_style(db, user["id"], style_id))})


@router.post("")
async def create_makeup_style(
  payload: MakeupStyleCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  await _validate_media_ownership(db, user["id"], payload.source_media_id)
  await _validate_media_ownership(db, user["id"], payload.thumbnail_media_id)

  incoming = payload.style_payload
  source_media_id = payload.source_media_id
  if incoming.get("schemaVersion") == SAVED_AR_LOOK_SCHEMA:
    if not settings.ar_recipe_persistence_v1:
      raise AppError(403, "AR_RECIPE_PERSISTENCE_DISABLED", "AR look storage is disabled.")
    normalized_payload = normalize_saved_ar_look(incoming)
    # Face thumbnails are opt-in only. V1 has no such consent field, so the
    # server persists only the recipe-derived non-face swatch representation.
    # A client-authored media reference cannot become part of this contract.
    source_media_id = None
    thumbnail_media_id = None
  else:
    normalized_payload = strip_sensitive_recipe_data(incoming)
    thumbnail_media_id = payload.thumbnail_media_id

  style = await db.fetchrow(
    """
    insert into saved_makeup_styles (
      user_id,client_request_id,style_type,source_analysis_report_id,
      source_filter_extraction_id,source_media_id,thumbnail_media_id,title,
      mood_label,short_description,tags,style_payload
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
    on conflict (user_id,client_request_id) do update set
      updated_at=saved_makeup_styles.updated_at
    returning *
    """,
    user["id"],
    payload.client_request_id,
    payload.style_type,
    payload.source_analysis_report_id,
    payload.source_filter_extraction_id,
    source_media_id,
    thumbnail_media_id,
    payload.title.strip(),
    payload.mood_label,
    payload.short_description,
    payload.tags,
    json.dumps(normalized_payload),
  )
  if not style:
    raise AppError(500, "MAKEUP_STYLE_SAVE_FAILED", "Saved makeup style could not be created.")
  return success({"style": _public_style(style)})


@router.patch("/{style_id}")
async def update_makeup_style(
  style_id: UUID,
  payload: MakeupStyleUpdate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  await _owned_style(db, user["id"], style_id)
  if payload.title is None and payload.archived is None:
    raise AppError(422, "EMPTY_STYLE_UPDATE", "Provide title or archived.")
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      style = await connection.fetchrow(
        """
        update saved_makeup_styles set
          title=coalesce($3,title),
          archived_at=case when $4::boolean is null then archived_at
            when $4 then coalesce(archived_at,now()) else null end,
          updated_at=now()
        where id=$1 and user_id=$2 returning *
        """,
        style_id,
        user["id"],
        payload.title,
        payload.archived,
      )
      if payload.archived:
        await connection.execute("delete from product_recommendation_runs where source_style_id=$1", style_id)
  return success({"style": _public_style(style)})


@router.delete("/{style_id}")
async def delete_makeup_style(
  style_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  style = await _owned_style(db, user["id"], style_id)
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      await connection.execute("delete from product_recommendation_runs where source_style_id=$1", style_id)
      await connection.execute("delete from saved_makeup_styles where id=$1 and user_id=$2", style_id, user["id"])
      thumbnail_media_id = style.get("thumbnail_media_id")
      if thumbnail_media_id:
        await connection.execute(
          """
          update media_assets set status='deletion_pending',cdn_url=null,thumbnail_cdn_url=null,deleted_at=now()
          where id=$1 and owner_user_id=$2
          """,
          thumbnail_media_id,
          user["id"],
        )
  return success({"styleId": str(style_id), "deleted": True})
