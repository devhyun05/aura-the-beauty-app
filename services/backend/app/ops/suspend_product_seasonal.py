import argparse
import asyncio
import json
from uuid import UUID

from app.db.session import Database
from app.services.product_seasonal import suspend_seasonal_collection


async def main() -> None:
  parser = argparse.ArgumentParser(description="Suspend a published seasonal collection immediately.")
  parser.add_argument("collection_id", type=UUID)
  parser.add_argument("--actor-user-id", required=True, type=UUID)
  parser.add_argument("--reason", required=True)
  args = parser.parse_args()
  db = Database()
  await db.connect()
  try:
    await suspend_seasonal_collection(
      db,
      collection_id=args.collection_id,
      actor_user_id=args.actor_user_id,
      reason=args.reason,
    )
    print(json.dumps({"suspendedCollectionId": str(args.collection_id)}))
  finally:
    await db.close()


if __name__ == "__main__":
  asyncio.run(main())
