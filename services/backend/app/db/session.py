from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

import asyncpg
from fastapi import Depends

from app.core.errors import AppError
from app.core.settings import Settings, get_settings
from app.db.connection_config import (
  DatabaseConnectionConfig,
  resolve_database_connection_config,
)


T = TypeVar("T")


class Database:
  def __init__(self) -> None:
    self.pool: asyncpg.Pool | None = None
    self._uses_secret = False

  @property
  def is_connected(self) -> bool:
    return self.pool is not None

  async def connect(self, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    config = resolve_database_connection_config(settings)

    if config is None:
      return

    try:
      self.pool = await self._create_pool(config)
      self._uses_secret = config.uses_secret
    except asyncpg.InvalidPasswordError:
      if not config.uses_secret:
        raise

      refreshed_config = resolve_database_connection_config(settings, refresh_secret=True)

      if refreshed_config is None:
        raise

      self.pool = await self._create_pool(refreshed_config)
      self._uses_secret = refreshed_config.uses_secret

  async def close(self) -> None:
    if self.pool is not None:
      await self.pool.close()
      self.pool = None
      self._uses_secret = False

  async def execute(self, query: str, *args: Any) -> str:
    async def operation() -> str:
      if self.pool is None:
        raise RuntimeError("Database is not connected.")

      async with self.pool.acquire() as connection:
        return await connection.execute(query, *args)

    return await self._run_with_secret_refresh(operation)

  async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
    async def operation() -> list[dict[str, Any]]:
      if self.pool is None:
        raise RuntimeError("Database is not connected.")

      async with self.pool.acquire() as connection:
        rows = await connection.fetch(query, *args)

      return [dict(row) for row in rows]

    return await self._run_with_secret_refresh(operation)

  async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
    async def operation() -> dict[str, Any] | None:
      if self.pool is None:
        raise RuntimeError("Database is not connected.")

      async with self.pool.acquire() as connection:
        row = await connection.fetchrow(query, *args)

      return dict(row) if row else None

    return await self._run_with_secret_refresh(operation)

  async def run_in_transaction(
    self,
    operation: Callable[[asyncpg.Connection], Awaitable[T]],
  ) -> T:
    """한 connection의 실제 PostgreSQL transaction 안에서 복수 문장을 원자 실행한다."""
    async def run() -> T:
      if self.pool is None:
        raise RuntimeError("Database is not connected.")

      async with self.pool.acquire() as connection:
        async with connection.transaction():
          return await operation(connection)

    return await self._run_with_secret_refresh(run)

  async def _run_with_secret_refresh(self, operation: Callable[[], Awaitable[T]]) -> T:
    try:
      return await operation()
    except asyncpg.InvalidPasswordError:
      if not self._uses_secret:
        raise

      await self._reconnect_with_refreshed_secret()
      return await operation()

  async def _reconnect_with_refreshed_secret(self) -> None:
    settings = get_settings()
    config = resolve_database_connection_config(settings, refresh_secret=True)

    if config is None or not config.uses_secret:
      raise RuntimeError("Database secret refresh was requested, but DATABASE_SECRET_ID is not configured.")

    next_pool = await self._create_pool(config)
    current_pool = self.pool
    self.pool = next_pool
    self._uses_secret = True

    if current_pool is not None:
      await current_pool.close()

  async def _create_pool(self, config: DatabaseConnectionConfig) -> asyncpg.Pool:
    pool = await asyncpg.create_pool(
      **config.asyncpg_kwargs(),
      min_size=1,
      max_size=5,
      command_timeout=30,
    )

    try:
      async with pool.acquire() as connection:
        await connection.fetchrow("select 1")
    except Exception:
      await pool.close()
      raise

    return pool


database = Database()


async def get_database() -> Database:
  return database


async def require_database(db: Database = Depends(get_database)) -> Database:
  if not db.is_connected:
    raise AppError(
      status_code=503,
      code="DATABASE_NOT_CONFIGURED",
      message="DATABASE_URL or DATABASE_SECRET_ID is not configured, or the database connection is not available.",
    )

  return db
