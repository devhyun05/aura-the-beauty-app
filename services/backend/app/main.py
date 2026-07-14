from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.health import router as health_router
from app.api.router import api_router
from app.core.errors import AppError, app_error_handler, http_error_handler, validation_error_handler
from app.core.settings import Settings, get_settings
from app.db.session import database
from app.services.consulting_schema import ensure_consulting_runtime_schema
from app.services.account_deletion import ensure_account_deletion_schema
from app.services.media_deletion import ensure_media_deletion_schema
from app.services.hair_schema import ensure_hair_schema
from app.services.product_recommendation_schema import ensure_product_recommendation_runtime_schema


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
  await database.connect()
  await ensure_consulting_runtime_schema(database)
  await ensure_media_deletion_schema(database)
  await ensure_account_deletion_schema(database)
  await ensure_hair_schema(database)
  await ensure_product_recommendation_runtime_schema(database)

  try:
    yield
  finally:
    await database.close()


def create_app(settings: Settings | None = None) -> FastAPI:
  provided_settings = settings
  settings = provided_settings or get_settings()
  app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    lifespan=lifespan,
  )

  if settings.cors_enabled:
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

  app.include_router(health_router)
  app.include_router(api_router, prefix=settings.api_prefix)

  return app


app = create_app()
