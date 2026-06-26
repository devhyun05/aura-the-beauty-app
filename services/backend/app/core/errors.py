from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.responses import failure


class AppError(Exception):
  def __init__(
    self,
    status_code: int,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
  ) -> None:
    self.status_code = status_code
    self.code = code
    self.message = message
    self.details = details or {}


def get_request_id(request: Request) -> str | None:
  return request.headers.get("x-request-id") or request.headers.get("x-amzn-trace-id")


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
  return JSONResponse(
    status_code=exc.status_code,
    content=failure(exc.code, exc.message, exc.details, get_request_id(request)),
  )


async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
  return JSONResponse(
    status_code=exc.status_code,
    content=failure("HTTP_ERROR", str(exc.detail), request_id=get_request_id(request)),
  )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
  return JSONResponse(
    status_code=422,
    content=failure(
      "VALIDATION_ERROR",
      "Request validation failed.",
      {"errors": exc.errors()},
      get_request_id(request),
    ),
  )
