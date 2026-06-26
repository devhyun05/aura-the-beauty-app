import argparse
import asyncio
from pathlib import Path

import asyncpg

from app.core.settings import get_settings


SCHEMA_VERSION = "schema.sql:v1"


def get_schema_path() -> Path:
  current_file = Path(__file__).resolve()
  candidates = [
    Path.cwd() / "docs" / "backend" / "schema.sql",
    Path.cwd().parent.parent / "docs" / "backend" / "schema.sql",
  ]

  for parent in current_file.parents:
    candidates.append(parent / "docs" / "backend" / "schema.sql")

  for candidate in candidates:
    if candidate.exists():
      return candidate

  raise FileNotFoundError("Could not find docs/backend/schema.sql")


async def ensure_migration_table(connection: asyncpg.Connection) -> None:
  await connection.execute(
    """
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
    """,
  )


async def has_schema_version(connection: asyncpg.Connection, version: str) -> bool:
  row = await connection.fetchrow(
    "select version from schema_migrations where version = $1",
    version,
  )

  return row is not None


async def record_schema_version(connection: asyncpg.Connection, version: str) -> None:
  await connection.execute(
    """
    insert into schema_migrations (version)
    values ($1)
    on conflict (version) do update set applied_at = now()
    """,
    version,
  )


async def apply_schema(database_url: str | None = None, force: bool = False) -> str:
  settings = get_settings()
  dsn = database_url or settings.database_url

  if not dsn:
    raise RuntimeError("DATABASE_URL is required to apply the schema.")

  schema = get_schema_path().read_text(encoding="utf-8")
  connection = await asyncpg.connect(dsn=dsn)

  try:
    await ensure_migration_table(connection)

    if not force and await has_schema_version(connection, SCHEMA_VERSION):
      return f"Skipped {SCHEMA_VERSION}; already applied."

    async with connection.transaction():
      await connection.execute(schema)
      await record_schema_version(connection, SCHEMA_VERSION)

    return f"Applied {SCHEMA_VERSION}."
  finally:
    await connection.close()


async def main() -> None:
  parser = argparse.ArgumentParser(description="Apply backend PostgreSQL schema.")
  parser.add_argument("--force", action="store_true", help="Apply schema even when the marker exists.")
  args = parser.parse_args()
  result = await apply_schema(force=args.force)
  print(result)


if __name__ == "__main__":
  asyncio.run(main())