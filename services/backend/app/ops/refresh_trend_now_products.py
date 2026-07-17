from __future__ import annotations

import argparse
import asyncio
import json

from app.core.settings import get_settings
from app.db.session import Database
from app.services.product_trend_orchestrator import run_trend_now_pipeline


async def main() -> None:
  parser = argparse.ArgumentParser(
    description="Collect live trend/weather/app signals and refresh cached regional product collections.",
  )
  parser.add_argument("--trigger", choices=("scheduled", "manual", "retry"), default="manual")
  parser.add_argument("--auto-publish", action="store_true")
  parser.add_argument("--locale", default="ko-KR")
  args = parser.parse_args()

  db = Database()
  await db.connect()
  try:
    result = await run_trend_now_pipeline(
      db,
      get_settings(),
      trigger_type=args.trigger,
      auto_publish=args.auto_publish,
      locale=args.locale,
    )
    print(json.dumps(result, ensure_ascii=False, default=str))
  finally:
    await db.close()


if __name__ == "__main__":
  asyncio.run(main())
