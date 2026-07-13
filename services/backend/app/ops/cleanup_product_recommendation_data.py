import argparse
import asyncio
from datetime import timedelta

from app.core.settings import get_settings
from app.db.session import Database


async def cleanup_product_recommendation_data(db: Database, *, dry_run: bool = True) -> dict[str, int]:
  settings = get_settings()
  targets = {
    "events": ("product_engagement_events", "occurred_at", settings.product_event_retention_days),
    "profiles": ("product_preference_profiles", "expires_at", 0),
    "runs": ("product_recommendation_runs", "expires_at", 0),
    "cohorts": ("product_color_cohort_memberships", "expires_at", 0),
    "auradinSessions": ("auradin_search_sessions", "expires_at", 0),
  }
  result: dict[str, int] = {}
  for name, (table, column, days) in targets.items():
    interval = timedelta(days=days)
    row = await db.fetchrow(
      f"select count(*)::int as count from {table} where {column} < now() - $1::interval",
      interval,
    )
    result[name] = int((row or {}).get("count") or 0)
    if not dry_run:
      await db.execute(f"delete from {table} where {column} < now() - $1::interval", interval)
  row = await db.fetchrow(
    """
    select count(*)::int as count from product_engagement_events
    where context ? 'query'
    """,
  )
  result["rawSearchQueries"] = int((row or {}).get("count") or 0)
  if not dry_run:
    await db.execute(
      """
      update product_engagement_events set context=context - 'query'
      where context ? 'query'
      """,
    )
  return result


async def main() -> None:
  parser = argparse.ArgumentParser(description="Delete expired product recommendation data.")
  parser.add_argument("--apply", action="store_true")
  args = parser.parse_args()
  db = Database()
  await db.connect()
  try:
    print(await cleanup_product_recommendation_data(db, dry_run=not args.apply))
  finally:
    await db.close()


if __name__ == "__main__":
  asyncio.run(main())
