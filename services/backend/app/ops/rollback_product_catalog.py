import argparse
import asyncio
import json
from uuid import UUID

from app.db.session import Database
from app.services.product_catalog_operations import rollback_catalog_import


async def main() -> None:
  parser = argparse.ArgumentParser(description="Disable every product owned by one signed catalog import.")
  parser.add_argument("manifest_id", type=UUID)
  parser.add_argument("--actor-user-id", type=UUID, required=True)
  parser.add_argument("--reason", required=True)
  args = parser.parse_args()
  db = Database()
  await db.connect()
  try:
    result = await rollback_catalog_import(
      db,
      manifest_id=args.manifest_id,
      actor_user_id=args.actor_user_id,
      reason=args.reason,
    )
    print(json.dumps(result))
  finally:
    await db.close()


if __name__ == "__main__":
  asyncio.run(main())
