import argparse
import asyncio

import asyncpg

from app.core.settings import get_settings
from app.db.connection_config import DatabaseConfigurationError, connect_database
from app.services.embeddings import embed_text, format_pgvector, report_embedding_text, thread_embedding_text


async def _connect(database_url: str | None = None) -> asyncpg.Connection:
  settings = get_settings()
  dsn = database_url or settings.database_url
  if dsn:
    return await asyncpg.connect(dsn=dsn)

  try:
    connection, _ = await connect_database(settings)
  except DatabaseConfigurationError as error:
    raise RuntimeError("DATABASE_URL or DATABASE_SECRET_ID is required to backfill embeddings.") from error
  return connection


async def backfill_community_thread_embeddings(connection: asyncpg.Connection, limit: int) -> int:
  rows = await connection.fetch(
    """
    select id, title, body, mood_tags, situation_tags, product_usage
    from community_threads
    where embedding is null and deleted_at is null and status = 'active'
    order by created_at desc
    limit $1
    """,
    limit,
  )
  updated = 0
  for row in rows:
    embedding = await asyncio.to_thread(embed_text, thread_embedding_text(dict(row)))
    if embedding is None:
      continue
    await connection.execute(
      "update community_threads set embedding = $2::vector where id = $1",
      row["id"],
      format_pgvector(embedding),
    )
    updated += 1
  return updated


async def backfill_analysis_report_embeddings(connection: asyncpg.Connection, limit: int) -> int:
  rows = await connection.fetch(
    """
    select id, personal_color, skin_type, recommended_mood, tone_summary, tags
    from analysis_reports
    where embedding is null and status = 'completed'
    order by analyzed_at desc nulls last, created_at desc
    limit $1
    """,
    limit,
  )
  updated = 0
  for row in rows:
    embedding = await asyncio.to_thread(embed_text, report_embedding_text(dict(row)))
    if embedding is None:
      continue
    await connection.execute(
      "update analysis_reports set embedding = $2::vector where id = $1",
      row["id"],
      format_pgvector(embedding),
    )
    updated += 1
  return updated


async def backfill_embeddings(database_url: str | None = None, limit: int = 100) -> dict[str, int]:
  connection = await _connect(database_url)
  try:
    thread_count = await backfill_community_thread_embeddings(connection, limit)
    report_count = await backfill_analysis_report_embeddings(connection, limit)
  finally:
    await connection.close()

  return {"communityThreads": thread_count, "analysisReports": report_count}


def main() -> None:
  parser = argparse.ArgumentParser(description="Backfill community/report embeddings.")
  parser.add_argument("--database-url", default=None)
  parser.add_argument("--limit", type=int, default=100)
  args = parser.parse_args()
  result = asyncio.run(backfill_embeddings(database_url=args.database_url, limit=args.limit))
  print(result)


if __name__ == "__main__":
  main()