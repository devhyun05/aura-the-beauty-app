from typing import Any

import asyncpg
from fastapi import Depends

from app.core.errors import AppError
from app.core.settings import get_settings


class Database:
  def __init__(self) -> None:
    self.pool: asyncpg.Pool | None = None

  @property
  def is_connected(self) -> bool:
    return self.pool is not None

  async def connect(self) -> None:
    settings = get_settings()

    if not settings.database_url:
      return

    self.pool = await asyncpg.create_pool(
      dsn=settings.database_url,
      min_size=1,
      max_size=5,
      command_timeout=30,
    )

  async def close(self) -> None:
    if self.pool is not None:
      await self.pool.close()
      self.pool = None

  async def execute(self, query: str, *args: Any) -> str:
    if self.pool is None:
      raise RuntimeError("Database is not connected.")

    async with self.pool.acquire() as connection:
      return await connection.execute(query, *args)

  async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
    if self.pool is None:
      raise RuntimeError("Database is not connected.")

    async with self.pool.acquire() as connection:
      rows = await connection.fetch(query, *args)

    return [dict(row) for row in rows]

  async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
    if self.pool is None:
      raise RuntimeError("Database is not connected.")

    async with self.pool.acquire() as connection:
      row = await connection.fetchrow(query, *args)

    return dict(row) if row else None


database = Database()


async def get_database() -> Database:
  return database


async def require_database(db: Database = Depends(get_database)) -> Database:
  if not db.is_connected:
    raise AppError(
      status_code=503,
      code="DATABASE_NOT_CONFIGURED",
      message="DATABASE_URL is not configured or the database connection is not available.",
    )

  return db
