"""Rotate partner credentials without exposing an account-issuance HTTP endpoint.

Run from services/backend:
  .venv/bin/python scripts/rotate_partner_credentials.py \
    --confirm rotate-partner-credentials \
    --output ./partner-credentials.json

The generated credentials are written once to a new owner-readable file. Deliver
them through an approved secret-sharing channel, then securely remove the file.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path


sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import Database  # noqa: E402
from app.services.consulting_partner import rotate_existing_partner_credentials  # noqa: E402


CONFIRMATION = "rotate-partner-credentials"


async def rotate_credentials() -> list[dict]:
  db = Database()
  await db.connect()
  if not db.is_connected:
    raise RuntimeError("DATABASE_URL or DATABASE_SECRET_ID must be configured.")
  try:
    return await rotate_existing_partner_credentials(db)
  finally:
    await db.close()


def main() -> int:
  parser = argparse.ArgumentParser(description="Rotate all active consulting partner credentials.")
  parser.add_argument("--confirm", required=True, choices=[CONFIRMATION])
  parser.add_argument("--output", required=True, type=Path)
  args = parser.parse_args()
  if args.confirm != CONFIRMATION:
    return 2

  output_path = args.output.expanduser().resolve()
  descriptor = os.open(output_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
  try:
    accounts = asyncio.run(rotate_credentials())
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
      descriptor = -1
      json.dump({"accounts": accounts}, output, ensure_ascii=False, indent=2)
      output.write("\n")
  except Exception:
    if descriptor >= 0:
      os.close(descriptor)
    output_path.unlink(missing_ok=True)
    raise
  print(f"Rotated {len(accounts)} partner account(s); credentials written to {output_path}.")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
