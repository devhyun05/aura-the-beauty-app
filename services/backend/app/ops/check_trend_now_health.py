from __future__ import annotations

import argparse
import asyncio
import json
import sys

from app.core.settings import get_settings
from app.db.session import Database
from app.services.product_trend_health import run_trend_now_health_check


async def main() -> None:
  parser = argparse.ArgumentParser(
    description="Check the prior 15-minute trend-now serving window and safely roll back unhealthy revisions.",
  )
  parser.add_argument("--locale", default="ko-KR")
  args = parser.parse_args()

  db = Database()
  await db.connect()
  try:
    result = await run_trend_now_health_check(db, get_settings(), locale=args.locale)
    print(json.dumps(result, ensure_ascii=False, default=str))
    if int(result.get("blockedCount") or 0) > 0:
      print(
        json.dumps(
          {
            "event": "trend_now_health_task_failed",
            "reason": "rollback_blocked",
            "blockedCount": int(result.get("blockedCount") or 0),
          },
          ensure_ascii=False,
        ),
        file=sys.stderr,
      )
      raise SystemExit(2)
  except Exception as error:
    print(
      json.dumps(
        {
          "event": "trend_now_health_task_failed",
          "reason": type(error).__name__,
          "message": str(error)[:300],
        },
        ensure_ascii=False,
      ),
      file=sys.stderr,
    )
    raise
  finally:
    await db.close()


if __name__ == "__main__":
  asyncio.run(main())
