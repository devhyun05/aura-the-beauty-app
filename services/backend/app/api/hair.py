from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, require_database
from app.schemas.hair import HairAnalysisCreate, HairSimulationCreate, HairSimulationSave
from app.services.hair_catalog import (
  HAIR_CATALOG_VERSION,
  get_hair_style,
  list_hair_styles,
  serialize_hair_style,
)
from app.services.hair_jobs import HairJobQueue
from app.services.hair_observability import emit_hair_metric
from app.services.s3 import S3Service
from app.services.users import ensure_user


router = APIRouter(tags=["hair"])


def _json_dict(value: object) -> dict[str, Any]:
  if isinstance(value, dict):
    return value
  if isinstance(value, str) and value:
    try:
      parsed = json.loads(value)
    except json.JSONDecodeError:
      return {}
    return parsed if isinstance(parsed, dict) else {}
  return {}


def _iso(value: object) -> str | None:
  return value.isoformat() if isinstance(value, datetime) else None


def _deadline_passed(value: object) -> bool:
  if not isinstance(value, datetime):
    return False
  deadline = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
  return deadline <= datetime.now(timezone.utc)


def _normalize_analysis(row: dict, settings: Settings) -> dict:
  status = "expired" if _deadline_passed(row.get("expires_at")) else row["status"]
  analysis = _json_dict(row.get("analysis_payload"))
  recommendations = []
  for recommendation in analysis.get("recommendations") or []:
    if not isinstance(recommendation, dict):
      continue
    style = get_hair_style(str(recommendation.get("styleId") or ""))
    if style is None:
      continue
    recommendations.append(
      {
        **recommendation,
        "style": serialize_hair_style(style, settings),
      },
    )
  if recommendations:
    analysis["recommendations"] = recommendations

  return {
    "id": row["id"],
    "status": status,
    "analysis": analysis if status == "completed" else None,
    "error": (
      {"code": row.get("error_code"), "message": row.get("error_message")}
      if row.get("error_code")
      else None
    ),
    "expiresAt": _iso(row.get("expires_at")),
    "createdAt": _iso(row.get("created_at")),
    "completedAt": _iso(row.get("completed_at")),
  }


def _normalize_simulation(row: dict, settings: Settings) -> dict:
  status = row["status"]
  if row.get("saved_at") is None and _deadline_passed(row.get("expires_at")):
    status = "expired"
  result_url = None
  if row.get("result_bucket") and row.get("result_object_key") and status == "completed":
    result_url = S3Service(settings).create_presigned_download(
      bucket=row["result_bucket"],
      object_key=row["result_object_key"],
    )
  style = get_hair_style(row["style_id"])
  return {
    "id": row["id"],
    "analysisId": row["analysis_id"],
    "styleId": row["style_id"],
    "style": serialize_hair_style(style, settings) if style else None,
    "status": status,
    "resultUrl": result_url,
    "resultUrlExpiresIn": 900 if result_url else None,
    "saved": row.get("saved_at") is not None,
    "quality": _json_dict(row.get("quality_payload")),
    "error": (
      {"code": row.get("error_code"), "message": row.get("error_message")}
      if row.get("error_code")
      else None
    ),
    "expiresAt": _iso(row.get("expires_at")),
    "createdAt": _iso(row.get("created_at")),
    "completedAt": _iso(row.get("completed_at")),
  }


HAIR_SIMULATION_SELECT = """
select simulation.*,
       result.bucket as result_bucket,
       result.object_key as result_object_key
from hair_simulations simulation
left join media_assets result on result.id = simulation.result_media_id and result.deleted_at is null
"""


async def _owned_media(
  connection,
  *,
  media_id: UUID,
  user_id: UUID,
  allowed_kinds: tuple[str, ...],
) -> dict:
  media = await connection.fetchrow(
    """
    select * from media_assets
    where id = $1 and owner_user_id = $2 and deleted_at is null and media_kind = any($3::text[])
    """,
    media_id,
    user_id,
    list(allowed_kinds),
  )
  if media is None:
    raise AppError(404, "HAIR_MEDIA_NOT_FOUND", "Hair media was not found or is not owned by this user.")
  return dict(media)


@router.get("/hair-styles")
async def get_hair_styles(
  _: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
) -> dict:
  return success({"catalogVersion": HAIR_CATALOG_VERSION, "styles": list_hair_styles(settings)})


@router.post("/hair-analyses")
async def create_hair_analysis(
  payload: HairAnalysisCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Database is not configured.")

  async with db.pool.acquire() as connection:
    async with connection.transaction():
      await connection.fetchval("select pg_advisory_xact_lock(hashtextextended($1, 0))", str(user["id"]))
      existing = await connection.fetchrow(
        "select * from hair_analyses where user_id = $1 and client_request_id = $2",
        user["id"],
        payload.client_request_id,
      )
      if existing is not None:
        if existing["status"] == "failed" and existing["expires_at"] > datetime.now(timezone.utc):
          retried = await connection.fetchrow(
            """
            update hair_analyses
            set status = 'queued', error_code = null, error_message = null, updated_at = now()
            where id = $1
            returning *
            """,
            existing["id"],
          )
          row = dict(retried or existing)
        else:
          row = dict(existing)
      else:
        await _owned_media(
          connection,
          media_id=payload.source_media_id,
          user_id=user["id"],
          allowed_kinds=("hair-analysis-source",),
        )
        if payload.mask_media_id is not None:
          await _owned_media(
            connection,
            media_id=payload.mask_media_id,
            user_id=user["id"],
            allowed_kinds=("hair-analysis-mask",),
          )
        if payload.photo_capture_id is not None:
          capture_exists = await connection.fetchval(
            "select exists(select 1 from photo_captures where id = $1 and user_id = $2)",
            payload.photo_capture_id,
            user["id"],
          )
          if not capture_exists:
            raise AppError(
              404,
              "HAIR_CAPTURE_NOT_FOUND",
              "Hair photo capture was not found or is not owned by this user.",
            )
        inserted = await connection.fetchrow(
          """
          insert into hair_analyses (
            user_id, client_request_id, photo_capture_id, source_media_id, mask_media_id,
            status, analysis_payload, expires_at
          )
          values ($1, $2, $3, $4, $5, 'queued', $6::jsonb,
                  now() + make_interval(hours => $7))
          returning *
          """,
          user["id"],
          payload.client_request_id,
          payload.photo_capture_id,
          payload.source_media_id,
          payload.mask_media_id,
          json.dumps(payload.device_payload),
          settings.hair_source_retention_hours,
        )
        if inserted is None:
          raise AppError(500, "HAIR_ANALYSIS_CREATE_FAILED", "Hair analysis could not be created.")
        row = dict(inserted)

  if row["status"] == "queued":
    await asyncio.to_thread(HairJobQueue(settings).enqueue, "analysis", row["id"])
    emit_hair_metric("api", "HairJobQueued", 1, properties={"jobType": "analysis"})
  return success({"analysis": _normalize_analysis(row, settings)})


@router.get("/hair-analyses/{analysis_id}")
async def get_hair_analysis(
  analysis_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  row = await db.fetchrow(
    "select * from hair_analyses where id = $1 and user_id = $2",
    analysis_id,
    user["id"],
  )
  if row is None:
    raise AppError(404, "HAIR_ANALYSIS_NOT_FOUND", "Hair analysis was not found.")
  return success({"analysis": _normalize_analysis(row, settings)})


@router.post("/hair-analyses/{analysis_id}/simulations")
async def create_hair_simulation(
  analysis_id: UUID,
  payload: HairSimulationCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  if get_hair_style(payload.style_id) is None:
    raise AppError(422, "HAIR_STYLE_NOT_FOUND", "The requested hair style does not exist.")
  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Database is not configured.")

  async with db.pool.acquire() as connection:
    async with connection.transaction():
      await connection.fetchval("select pg_advisory_xact_lock(hashtextextended($1, 0))", str(user["id"]))
      existing = await connection.fetchrow(
        f"{HAIR_SIMULATION_SELECT} where simulation.user_id = $1 and simulation.client_request_id = $2",
        user["id"],
        payload.client_request_id,
      )
      if existing is not None:
        if (
          existing["status"] == "failed"
          and existing["expires_at"] is not None
          and existing["expires_at"] > datetime.now(timezone.utc)
        ):
          retried = await connection.fetchrow(
            """
            update hair_simulations
            set status = 'queued', error_code = null, error_message = null,
                quality_payload = '{}'::jsonb, quality_attempt_count = 0,
                completed_at = null, updated_at = now()
            where id = $1
            returning *
            """,
            existing["id"],
          )
          row = {**dict(retried or existing), "result_bucket": None, "result_object_key": None}
        else:
          row = dict(existing)
      else:
        analysis = await connection.fetchrow(
          "select * from hair_analyses where id = $1 and user_id = $2 for update",
          analysis_id,
          user["id"],
        )
        if analysis is None:
          raise AppError(404, "HAIR_ANALYSIS_NOT_FOUND", "Hair analysis was not found.")
        if analysis["status"] != "completed":
          raise AppError(409, "HAIR_ANALYSIS_NOT_READY", "Hair analysis is not ready.")
        if payload.style_id not in list(analysis["recommended_style_ids"] or []):
          raise AppError(422, "HAIR_STYLE_NOT_RECOMMENDED", "Choose one of the three recommended styles.")

        same_style = await connection.fetchrow(
          f"{HAIR_SIMULATION_SELECT} where simulation.analysis_id = $1 and simulation.style_id = $2",
          analysis_id,
          payload.style_id,
        )
        if same_style is not None and same_style["status"] != "failed":
          row = dict(same_style)
        elif (
          same_style is not None
          and same_style["expires_at"] is not None
          and same_style["expires_at"] > datetime.now(timezone.utc)
        ):
          retried = await connection.fetchrow(
            """
            update hair_simulations
            set client_request_id = $2, status = 'queued', error_code = null,
                error_message = null, quality_payload = '{}'::jsonb,
                quality_attempt_count = 0, completed_at = null, updated_at = now()
            where id = $1
            returning *
            """,
            same_style["id"],
            payload.client_request_id,
          )
          row = {**dict(retried or same_style), "result_bucket": None, "result_object_key": None}
        elif same_style is not None:
          row = dict(same_style)
        else:
          per_analysis_count = await connection.fetchval(
            """
            select count(*) from hair_simulations
            where analysis_id = $1 and status in ('queued', 'processing', 'completed')
            """,
            analysis_id,
          )
          if (
            settings.user_feature_usage_limits_enabled
            and int(per_analysis_count or 0) >= settings.hair_simulations_per_analysis
          ):
            emit_hair_metric(
              "api",
              "HairQuotaRejected",
              1,
              properties={"limitType": "per_analysis"},
            )
            raise AppError(429, "HAIR_ANALYSIS_LIMIT_REACHED", "This analysis has used all simulation attempts.")

          daily_count = await connection.fetchval(
            """
            select count(*) from hair_simulations
            where user_id = $1 and status in ('queued', 'processing', 'completed')
              and created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
            """,
            user["id"],
          )
          if (
            settings.user_feature_usage_limits_enabled
            and int(daily_count or 0) >= settings.hair_simulations_per_day
          ):
            emit_hair_metric(
              "api",
              "HairQuotaRejected",
              1,
              properties={"limitType": "per_user_day_kst"},
            )
            raise AppError(429, "HAIR_DAILY_LIMIT_REACHED", "Today's hairstyle simulation limit has been reached.")

          inserted = await connection.fetchrow(
            """
            insert into hair_simulations (
              analysis_id, user_id, client_request_id, style_id, status, expires_at
            )
            values ($1, $2, $3, $4, 'queued', now() + make_interval(hours => $5))
            returning *
            """,
            analysis_id,
            user["id"],
            payload.client_request_id,
            payload.style_id,
            settings.hair_source_retention_hours,
          )
          if inserted is None:
            raise AppError(500, "HAIR_SIMULATION_CREATE_FAILED", "Hair simulation could not be created.")
          row = {**dict(inserted), "result_bucket": None, "result_object_key": None}

  if row["status"] == "queued":
    await asyncio.to_thread(HairJobQueue(settings).enqueue, "simulation", row["id"])
    emit_hair_metric("api", "HairJobQueued", 1, properties={"jobType": "simulation"})
  return success({"simulation": _normalize_simulation(row, settings)})


@router.get("/hair-simulations/{simulation_id}")
async def get_hair_simulation(
  simulation_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  row = await db.fetchrow(
    f"{HAIR_SIMULATION_SELECT} where simulation.id = $1 and simulation.user_id = $2",
    simulation_id,
    user["id"],
  )
  if row is None:
    raise AppError(404, "HAIR_SIMULATION_NOT_FOUND", "Hair simulation was not found.")
  return success({"simulation": _normalize_simulation(row, settings)})


@router.post("/hair-simulations/{simulation_id}/save")
async def save_hair_simulation(
  simulation_id: UUID,
  payload: HairSimulationSave,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Database is not configured.")

  async def set_retention_tag(current: dict, value: str) -> None:
    if not current.get("result_bucket") or not current.get("result_object_key"):
      raise AppError(409, "HAIR_RESULT_NOT_READY", "Hair simulation result media is unavailable.")
    try:
      await asyncio.to_thread(
        S3Service(settings).put_object_tags,
        bucket=current["result_bucket"],
        object_key=current["result_object_key"],
        tags={"aura-retention": value},
      )
    except AppError:
      raise
    except Exception as error:  # noqa: BLE001 - normalize provider-specific S3 errors.
      raise AppError(503, "HAIR_RESULT_TAG_FAILED", "Hair result retention could not be updated.") from error

  async with db.pool.acquire() as connection:
    async with connection.transaction():
      locked = await connection.fetchrow(
        f"""
        {HAIR_SIMULATION_SELECT}
        where simulation.id = $1 and simulation.user_id = $2
          and simulation.status = 'completed'
          and (simulation.saved_at is not null or simulation.expires_at > now())
        for update of simulation
        """,
        simulation_id,
        user["id"],
      )
      if locked is None:
        raise AppError(404, "HAIR_SIMULATION_NOT_FOUND", "Completed hair simulation was not found.")
      current = dict(locked)

      if payload.saved:
        await set_retention_tag(current, "saved")

      updated = await connection.fetchrow(
        """
        update hair_simulations
        set saved_at = case when $3 then coalesce(saved_at, now()) else null end,
            expires_at = case
              when $3 then null
              when saved_at is not null then now() + make_interval(hours => $4)
              else expires_at
            end,
            updated_at = now()
        where id = $1 and user_id = $2 and status = 'completed'
        returning *
        """,
        simulation_id,
        user["id"],
        payload.saved,
        settings.hair_source_retention_hours,
      )
      if updated is None:
        raise AppError(404, "HAIR_SIMULATION_NOT_FOUND", "Completed hair simulation was not found.")

      if not payload.saved:
        await set_retention_tag(current, "ephemeral")
      row = {
        **dict(updated),
        "result_bucket": current["result_bucket"],
        "result_object_key": current["result_object_key"],
      }
  return success({"simulation": _normalize_simulation(row, settings)})


@router.get("/hair-simulations")
async def list_hair_simulations(
  saved: bool = Query(False),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  saved_clause = "and simulation.saved_at is not null" if saved else ""
  rows = await db.fetch(
    f"""
    {HAIR_SIMULATION_SELECT}
    where simulation.user_id = $1 and simulation.status = 'completed'
      and (simulation.saved_at is not null or simulation.expires_at > now()) {saved_clause}
    order by coalesce(simulation.saved_at, simulation.completed_at) desc
    limit 100
    """,
    user["id"],
  )
  return success({"simulations": [_normalize_simulation(row, settings) for row in rows]})


async def _delete_result_media(db: Database, settings: Settings, row: dict) -> None:
  if row.get("result_bucket") and row.get("result_object_key"):
    await asyncio.to_thread(
      S3Service(settings).delete_object_permanently,
      bucket=row["result_bucket"],
      object_key=row["result_object_key"],
    )
  if row.get("result_media_id"):
    await db.execute(
      "update media_assets set status = 'deleted', deleted_at = coalesce(deleted_at, now()) where id = $1",
      row["result_media_id"],
    )


@router.delete("/hair-simulations/{simulation_id}")
async def delete_hair_simulation(
  simulation_id: UUID,
  background_tasks: BackgroundTasks,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  row = await db.fetchrow(
    f"""
    with updated as (
      update hair_simulations
      set status = 'expired', saved_at = null, expires_at = now(), updated_at = now()
      where id = $1 and user_id = $2 and status <> 'expired'
      returning *
    )
    select updated.*, result.bucket as result_bucket, result.object_key as result_object_key
    from updated left join media_assets result on result.id = updated.result_media_id
    """,
    simulation_id,
    user["id"],
  )
  if row is None:
    raise AppError(404, "HAIR_SIMULATION_NOT_FOUND", "Hair simulation was not found.")
  background_tasks.add_task(_delete_result_media, db, settings, row)
  return success({"deleted": True, "deletedAt": datetime.now(timezone.utc)})
