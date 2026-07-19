from fastapi import APIRouter, Depends, Request

from app.core.errors import AppError
from app.core.responses import success
from app.core.settings import Settings, get_settings
from app.db.session import Database, get_database
from app.services.auradin_agent.snapshot_manifest import (
  SnapshotValidationError,
  resolve_and_validate_snapshot,
)
from app.services.bedrock_credential_readiness import BedrockCredentialReadinessProbe


router = APIRouter(tags=["health"])


@router.get("/health")
async def health(
  request: Request,
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> dict:
  descriptor = getattr(request.app.state, "auradin_snapshot", None)
  if descriptor is None:
    descriptor = resolve_and_validate_snapshot(settings)
  return success(
    {
      "status": "ok",
      "service": settings.app_name,
      "environment": settings.environment,
      "database": "connected" if db.is_connected else "not_configured",
      "auth": "required" if settings.auth_required else "dev_optional",
      **descriptor.public_status(),
    },
  )


@router.get("/health/ready")
async def health_ready(
  request: Request,
  settings: Settings = Depends(get_settings),
) -> dict:
  try:
    descriptor = getattr(request.app.state, "auradin_snapshot", None)
    if descriptor is None:
      descriptor = resolve_and_validate_snapshot(settings)
  except SnapshotValidationError as exc:
    raise AppError(503, "AURADIN_SNAPSHOT_NOT_READY", "Auradin snapshot validation failed.") from exc
  readiness: dict[str, object] = {"status": "ready", **descriptor.public_status()}
  if settings.makeup_recommendation_v2_enabled:
    probe = getattr(request.app.state, "makeup_recommendation_bedrock_credential_probe", None)
    if probe is None:
      probe = BedrockCredentialReadinessProbe(
        timeout_seconds=settings.bedrock_credential_readiness_timeout_seconds,
      )
      request.app.state.makeup_recommendation_bedrock_credential_probe = probe

    bedrock = await probe.check(settings)
    if not bedrock.ready:
      raise AppError(
        503,
        "MAKEUP_RECOMMENDATION_BEDROCK_NOT_READY",
        "Makeup recommendation Bedrock credentials are not ready.",
        {"component": "makeup_recommendation_bedrock", **bedrock.public_status()},
      )
    readiness["makeup_recommendation_bedrock"] = bedrock.public_status()

  return success(readiness)


@router.get("/health/db")
async def health_db(db: Database = Depends(get_database)) -> dict:
  if not db.is_connected:
    return success({"status": "not_configured"})

  row = await db.fetchrow("select 1 as ok")

  return success({"status": "ok", "result": row})


@router.get("/health/config")
async def health_config(settings: Settings = Depends(get_settings)) -> dict:
  return success(settings.public_config_status())
