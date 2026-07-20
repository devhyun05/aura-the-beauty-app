"""Local wrapper: sync the active Auradin catalog snapshot into the Postgres mirror.

Thin convenience wrapper around ``app.db.sync_auradin_catalog`` for running from
a checkout (requires DATABASE_URL / DATABASE_SECRET_ID). In deploy CI the
``python -m app.db.sync_auradin_catalog`` module runs directly inside the backend
image. Serving is unaffected — this only mirrors the JSONL snapshot to the DB.

Examples:
  python scripts/sync_auradin_snapshot_to_db.py               # upload + activate
  python scripts/sync_auradin_snapshot_to_db.py --dry-run     # show what would sync
  python scripts/sync_auradin_snapshot_to_db.py --verify-only # DB vs JSONL diff
  python scripts/sync_auradin_snapshot_to_db.py --rollback-to snapshot_20260717
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.settings import get_settings  # noqa: E402
from app.services.auradin_agent.catalog_loader import read_jsonl  # noqa: E402
from app.services.auradin_agent.snapshot_manifest import (  # noqa: E402
  process_snapshot,
  resolve_and_validate_snapshot,
)
from app.services.auradin_catalog.db_sync import build_snapshot_summary  # noqa: E402


def _dry_run() -> dict:
  settings = get_settings()
  descriptor = process_snapshot() or resolve_and_validate_snapshot(settings)
  rows = read_jsonl(descriptor.catalog_path)
  summary = build_snapshot_summary(descriptor, rows)
  return {
    "dryRun": True,
    "snapshotId": summary["snapshot_id"],
    "manifestSha256": summary["manifest_sha256"],
    "itemCount": summary["item_count"],
    "colorFamilyCount": summary["color_family_count"],
    "invalidCoolCount": summary["quality_summary"].get("invalidCoolCount"),
  }


async def _run_db(args: argparse.Namespace) -> dict:
  # Imported lazily so --dry-run works without a DB driver connection.
  from app.db.sync_auradin_catalog import run as run_sync

  return await run_sync(args)


def main() -> None:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--dry-run", action="store_true", help="Validate + count only; no DB writes.")
  parser.add_argument("--verify-only", action="store_true", help="Compare DB active snapshot vs JSONL.")
  parser.add_argument("--no-activate", action="store_true", help="Upload but do not activate.")
  parser.add_argument("--rollback-to", metavar="SNAPSHOT_ID", help="Re-activate a synced snapshot.")
  args = parser.parse_args()

  if args.dry_run:
    result = _dry_run()
  else:
    result = asyncio.run(_run_db(args))

  print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
  if args.verify_only and not result.get("ok", True):
    raise SystemExit(1)


if __name__ == "__main__":
  main()
