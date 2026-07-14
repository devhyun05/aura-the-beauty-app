import argparse
import asyncio
import json
from pathlib import Path

from app.core.settings import get_settings
from app.db.session import Database
from app.services.product_seasonal import publish_seasonal_manifest


async def main() -> None:
  parser = argparse.ArgumentParser(description="Publish a signed two-person-reviewed seasonal manifest.")
  parser.add_argument("manifest", type=Path)
  parser.add_argument("--signature-file", required=True, type=Path)
  args = parser.parse_args()
  manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
  signature = args.signature_file.read_text(encoding="utf-8").strip()
  db = Database()
  await db.connect()
  try:
    collection_id = await publish_seasonal_manifest(db, get_settings(), manifest=manifest, signature=signature)
    print(json.dumps({"collectionId": str(collection_id)}))
  finally:
    await db.close()


if __name__ == "__main__":
  asyncio.run(main())
