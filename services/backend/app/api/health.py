from fastapi import APIRouter, Depends

from app.core.responses import success
from app.core.settings import Settings, get_settings
from app.db.session import Database, get_database


router = APIRouter(tags=["health"])


@router.get("/health")
async def health(
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> dict:
  return success(
    {
      "status": "ok",
      "service": settings.app_name,
      "environment": settings.environment,
      "database": "connected" if db.is_connected else "not_configured",
      "auth": "required" if settings.auth_required else "dev_optional",
    },
  )


@router.get("/health/db")
async def health_db(db: Database = Depends(get_database)) -> dict:
  if not db.is_connected:
    return success({"status": "not_configured"})

  row = await db.fetchrow("select 1 as ok")

  return success({"status": "ok", "result": row})


@router.get("/health/config")
async def health_config(settings: Settings = Depends(get_settings)) -> dict:
  return success(settings.public_config_status())