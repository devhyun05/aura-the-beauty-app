from typing import Any

from fastapi.encoders import jsonable_encoder

from app.core.casing import camelize


def success(data: Any = None, meta: dict[str, Any] | None = None) -> dict[str, Any]:
  return {
    "data": jsonable_encoder(camelize(data)),
    "meta": jsonable_encoder(camelize(meta or {})),
    "error": None,
  }


def failure(
  code: str,
  message: str,
  details: dict[str, Any] | None = None,
  request_id: str | None = None,
) -> dict[str, Any]:
  meta = {"request_id": request_id} if request_id else {}

  return {
    "data": None,
    "meta": jsonable_encoder(camelize(meta)),
    "error": jsonable_encoder(
      camelize(
        {
          "code": code,
          "message": message,
          "details": details or {},
        },
      ),
    ),
  }
