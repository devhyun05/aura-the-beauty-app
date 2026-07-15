import argparse
import asyncio
import json
from pathlib import Path
from uuid import UUID

from app.core.settings import get_settings
from app.db.session import Database
from app.services.product_catalog_ingestion import apply_catalog_manifest


async def main() -> None:
  parser = argparse.ArgumentParser(description="Apply a signed licensed product catalog manifest.")
  parser.add_argument("manifest", type=Path)
  parser.add_argument("--signature-file", required=True, type=Path)
  parser.add_argument("--actor-user-id", required=True, type=UUID)
  args = parser.parse_args()
  manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
  signature = args.signature_file.read_text(encoding="utf-8").strip()
  db = Database()
  await db.connect()
  try:
    result = await apply_catalog_manifest(
      db,
      get_settings(),
      manifest=manifest,
      signature=signature,
      actor_user_id=args.actor_user_id,
    )
    print(json.dumps(result, ensure_ascii=False))
  finally:
    await db.close()


if __name__ == "__main__":
  asyncio.run(main())
