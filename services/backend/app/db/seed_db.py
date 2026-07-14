import argparse
import asyncio
from pathlib import Path

import asyncpg

from app.core.settings import get_settings
from app.db.connection_config import DatabaseConfigurationError, connect_database


SEED_VERSION = "seed.sql:v7"


def get_seed_path() -> Path:
  current_file = Path(__file__).resolve()
  candidates = [
    Path.cwd() / "docs" / "backend" / "seed.sql",
    Path.cwd().parent.parent / "docs" / "backend" / "seed.sql",
  ]

  for parent in current_file.parents:
    candidates.append(parent / "docs" / "backend" / "seed.sql")

  for candidate in candidates:
    if candidate.exists():
      return candidate

  raise FileNotFoundError("Could not find docs/backend/seed.sql")


async def ensure_migration_table(connection: asyncpg.Connection) -> None:
  await connection.execute(
    """
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
    """,
  )


async def has_seed_version(connection: asyncpg.Connection, version: str) -> bool:
  row = await connection.fetchrow(
    "select version from schema_migrations where version = $1",
    version,
  )

  return row is not None


async def record_seed_version(connection: asyncpg.Connection, version: str) -> None:
  await connection.execute(
    """
    insert into schema_migrations (version)
    values ($1)
    on conflict (version) do update set applied_at = now()
    """,
    version,
  )


async def apply_seed(database_url: str | None = None, force: bool = False) -> str:
  settings = get_settings()
  dsn = database_url or settings.database_url

  if dsn:
    connection = await asyncpg.connect(dsn=dsn)
  else:
    try:
      connection, _ = await connect_database(settings)
    except DatabaseConfigurationError as error:
      raise RuntimeError("DATABASE_URL or DATABASE_SECRET_ID is required to apply seed data.") from error

  seed = get_seed_path().read_text(encoding="utf-8")
  try:
    await ensure_migration_table(connection)

    if not force and await has_seed_version(connection, SEED_VERSION):
      return f"Skipped {SEED_VERSION}; already applied."

    async with connection.transaction():
      await connection.execute(seed)
      await record_seed_version(connection, SEED_VERSION)

    return f"Applied {SEED_VERSION}."
  finally:
    await connection.close()


async def main() -> None:
  parser = argparse.ArgumentParser(description="Apply backend development seed data.")
  parser.add_argument("--force", action="store_true", help="Apply seed data even when the marker exists.")
  args = parser.parse_args()
  result = await apply_seed(force=args.force)
  print(result)


if __name__ == "__main__":
  asyncio.run(main())
