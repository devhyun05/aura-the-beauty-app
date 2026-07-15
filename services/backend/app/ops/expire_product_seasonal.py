import argparse
import asyncio
import json

from app.db.session import Database
from app.services.product_seasonal import expire_seasonal_collections


async def main() -> None:
  parser = argparse.ArgumentParser(description="Find or expire seasonal collections past their validity window.")
  parser.add_argument("--apply", action="store_true", help="Persist expiry transitions; default is dry-run.")
  args = parser.parse_args()
  db = Database()
  await db.connect()
  try:
    result = await expire_seasonal_collections(db, apply=args.apply)
    print(json.dumps(result, ensure_ascii=False))
  finally:
    await db.close()


if __name__ == "__main__":
  asyncio.run(main())
