import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.health import router as health_router
from app.api.lab_analysis import router as report_lab_router
from app.api.router import api_router
from app.core.errors import AppError, app_error_handler, http_error_handler, validation_error_handler
from app.core.settings import Settings, get_settings
from app.db.connection_config import resolve_database_connection_config
from app.db.session import database
from app.services.consulting_schema import ensure_consulting_runtime_schema
from app.services.account_deletion import ensure_account_deletion_schema
from app.services.face_analysis_schema import ensure_face_analysis_schema
from app.services.media_deletion import ensure_media_deletion_schema
from app.services.hair_schema import ensure_hair_schema
from app.services.auradin_agent.catalog_loader import reset_catalog_cache
from app.services.auradin_agent.event_logger import (
  EVENT_SHUTDOWN_FLUSH_TIMEOUT,
  flush_search_turn_event_tasks,
)
from app.services.auradin_agent.snapshot_manifest import bind_process_snapshot, resolve_and_validate_snapshot
from app.services.media_upload_schema import ensure_media_upload_schema
from app.services.notification_schema import ensure_notification_schema
from app.services.notification_realtime import notification_database_listener
from app.services.product_recommendation_schema import ensure_product_recommendation_runtime_schema
from app.services.report_lab_schema import ensure_report_lab_schema


logger = logging.getLogger(__name__)


async def _connect_report_lab_database(settings: Settings) -> None:
  """Connect the shared dependency to the already-validated local Lab DSN.

  Database.connect() resolves the process-global settings cache, which is right
  for the normal module-level app but unsafe for an explicitly constructed Lab
  app. Lab mode forbids secret-backed connections, so creating the pool from
  this exact Settings object remains local and cannot trigger AWS resolution.
  """

  # Never inherit an already-open pool from another app instance.
  await database.close()
  config = resolve_database_connection_config(settings)
  if config is None:
    return
  database.pool = await database._create_pool(config)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
  if app.state.settings.lab_mode:
    # The local Lab process intentionally excludes every production startup
    # service (snapshot binding, listeners, queues and provider-backed APIs).
    try:
      await _connect_report_lab_database(app.state.settings)
      await ensure_report_lab_schema(database)
      yield
    finally:
      await database.close()
    return

  # Snapshot integrity is a startup invariant and must fail before opening a DB
  # connection. This prevents a catalog-only deploy from silently degrading to
  # lexical retrieval or lazy runtime regeneration.
  app.state.auradin_snapshot = resolve_and_validate_snapshot(app.state.settings)
  bind_process_snapshot(app.state.auradin_snapshot)
  reset_catalog_cache()
  try:
    await database.connect()
    await ensure_consulting_runtime_schema(database)
    await ensure_media_upload_schema(database)
    await ensure_media_deletion_schema(database)
    await ensure_account_deletion_schema(database)
    await ensure_hair_schema(database)
    await ensure_face_analysis_schema(database)
    await ensure_notification_schema(database)
    await ensure_product_recommendation_runtime_schema(database)
    await notification_database_listener.start(database)
    yield
  finally:
    # graceful shutdown — DB를 닫기 전에 대기 중인 A5 이벤트 insert를 상한 내에서 flush한다.
    # 상한(EVENT_SHUTDOWN_FLUSH_TIMEOUT) 초과분은 event_logger가 cancel + drop + 카운터로
    # 남기고 종료를 진행시킨다 — flush가 종료를 무한정 막지 않는다(fail-open).
    try:
      await flush_search_turn_event_tasks(timeout=EVENT_SHUTDOWN_FLUSH_TIMEOUT)
    except Exception:  # noqa: BLE001 — flush 실패도 종료를 막지 않는다
      logger.warning("[aura:auradin-events] shutdown flush failed (fail-open)", exc_info=True)
    await notification_database_listener.stop()
    await database.close()
    bind_process_snapshot(None)
    reset_catalog_cache()


def create_app(settings: Settings | None = None) -> FastAPI:
  provided_settings = settings
  settings = provided_settings or get_settings()
  app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    lifespan=lifespan,
  )
  app.state.settings = settings

  if settings.lab_mode:
    app.add_middleware(
      CORSMiddleware,
      allow_origins=[settings.report_lab_cors_origin],
      allow_credentials=True,
      allow_methods=["GET", "POST", "OPTIONS"],
      allow_headers=["Authorization", "Content-Type", "X-Aura-Lab-Admin-Token"],
    )
  elif settings.cors_enabled:
    app.add_middleware(
      CORSMiddleware,
      allow_origins=settings.cors_origins or ["*"],
      allow_credentials=True,
      allow_methods=["*"],
      allow_headers=["*"],
    )

  app.add_exception_handler(AppError, app_error_handler)
  app.add_exception_handler(StarletteHTTPException, http_error_handler)
  app.add_exception_handler(RequestValidationError, validation_error_handler)

  if provided_settings is not None:
    app.dependency_overrides[get_settings] = lambda: settings

  if settings.lab_mode:
    app.include_router(report_lab_router, prefix=settings.api_prefix)
  else:
    app.include_router(health_router)
    app.include_router(api_router, prefix=settings.api_prefix)

  return app


app = create_app()
