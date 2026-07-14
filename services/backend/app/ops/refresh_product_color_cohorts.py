import asyncio
import json

from app.core.settings import get_settings
from app.db.session import Database
from app.services.product_cohorts import refresh_color_cohort_memberships


async def main() -> None:
  db = Database()
  await db.connect()
  try:
    print(json.dumps(await refresh_color_cohort_memberships(db, get_settings())))
  finally:
    await db.close()


if __name__ == "__main__":
  asyncio.run(main())
