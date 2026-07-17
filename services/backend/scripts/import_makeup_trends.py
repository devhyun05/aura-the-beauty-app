from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import Database  # noqa: E402
from app.services.makeup_trend_import import (  # noqa: E402
  TrendImportValidationError,
  import_trend_items,
  parse_trend_import_payload,
)


async def _run(args: argparse.Namespace) -> int:
  payload = json.loads(args.input.read_text(encoding="utf-8"))
  items = parse_trend_import_payload(payload, approve=args.approve)
  if args.validate_only:
    print(json.dumps({"status": items[0].review_status, "validated": len(items)}))
    return 0
  db = Database()
  await db.connect()
  try:
    if not db.is_connected:
      raise RuntimeError("DATABASE_URL or DATABASE_SECRET_ID is required")
    result = await import_trend_items(db, items)
    print(json.dumps(result, ensure_ascii=False))
    return 0
  finally:
    await db.close()


def main() -> int:
  parser = argparse.ArgumentParser(description="Import human-reviewed makeup trend JSON (draft by default).")
  parser.add_argument("--input", type=Path, required=True)
  parser.add_argument("--approve", action="store_true", help="Explicitly approve and activate imported mappings.")
  parser.add_argument("--validate-only", action="store_true")
  args = parser.parse_args()
  try:
    return asyncio.run(_run(args))
  except (OSError, json.JSONDecodeError, TrendImportValidationError, RuntimeError) as exc:
    print(f"trend import failed: {exc}", file=sys.stderr)
    return 2


if __name__ == "__main__":
  raise SystemExit(main())
