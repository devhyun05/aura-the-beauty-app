import argparse
import asyncio
import json
from uuid import UUID

from app.core.settings import get_settings
from app.db.session import Database
from app.services.product_catalog_operations import audit_product_catalog


def catalog_audit_has_failures(result: dict) -> bool:
  return bool(
    int(result.get("invalid") or 0) > 0
    or any(int(value or 0) > 0 for value in (result.get("relationshipMismatches") or {}).values())
  )


async def main() -> int:
  parser = argparse.ArgumentParser(description="Audit public catalog provenance and optionally quarantine failures.")
  parser.add_argument("--apply-quarantine", action="store_true")
  parser.add_argument("--actor-user-id", type=UUID)
  parser.add_argument("--fail-on-invalid", action="store_true", help="Exit 2 when monitoring finds invalid catalog rows.")
  args = parser.parse_args()
  if args.apply_quarantine and args.actor_user_id is None:
    parser.error("--actor-user-id is required with --apply-quarantine")
  db = Database()
  await db.connect()
  try:
    result = await audit_product_catalog(
      db,
      get_settings(),
      apply_quarantine=args.apply_quarantine,
      actor_user_id=args.actor_user_id,
    )
    print(json.dumps(result, ensure_ascii=False))
    return 2 if args.fail_on_invalid and catalog_audit_has_failures(result) else 0
  finally:
    await db.close()


if __name__ == "__main__":
  raise SystemExit(asyncio.run(main()))
