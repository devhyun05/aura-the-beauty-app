from __future__ import annotations

import argparse
import asyncio
import json
from uuid import UUID

from app.core.settings import get_settings
from app.db.session import Database
from app.services.product_seasonal_pipeline import refresh_seasonal_trend_collection


async def main() -> None:
  parser = argparse.ArgumentParser(description="Collect MCP/fallback trends and refresh a cached seasonal collection.")
  parser.add_argument("--locale", default="ko-KR")
  parser.add_argument("--limit", default=18, type=int)
  parser.add_argument("--apply", action="store_true", help="Persist a draft collection. Default is dry-run.")
  parser.add_argument("--publish", action="store_true", help="Publish immediately after actor/RBAC validation.")
  parser.add_argument("--created-by", type=UUID)
  parser.add_argument("--reviewed-by", type=UUID)
  parser.add_argument("--published-by", type=UUID)
  args = parser.parse_args()
  if args.publish and not args.apply:
    parser.error("--publish requires --apply")
  db = Database()
  await db.connect()
  try:
    result = await refresh_seasonal_trend_collection(
      db,
      get_settings(),
      locale=args.locale,
      limit=max(1, min(60, args.limit)),
      apply=args.apply,
      publish=args.publish,
      created_by=args.created_by,
      reviewed_by=args.reviewed_by,
      published_by=args.published_by,
    )
    print(json.dumps(result, ensure_ascii=False))
  finally:
    await db.close()


if __name__ == "__main__":
  asyncio.run(main())
