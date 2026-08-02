from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import asdict
from uuid import UUID, uuid4

import asyncpg

from app.core.settings import get_settings
from app.db.connection_config import DatabaseConfigurationError, connect_database
from app.services.private_media_migration import (
  batch_cloudfront_paths,
  build_plan_report,
  cleanup_private_media_batch,
  discard_invalid_private_media_item,
  execute_private_media_migration,
  plan_private_media_migration,
  rollback_private_media_batch,
  verify_private_media_batch,
)


def _parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(
    description=(
      "Move legacy user-face media from CDN-backed storage to private S3 with a resumable ledger. "
      "The default command is a read-only plan."
    ),
  )
  parser.add_argument(
    "command",
    nargs="?",
    default="plan",
    choices=("plan", "execute", "verify", "cleanup", "discard-invalid", "rollback"),
  )
  parser.add_argument("--database-url", default=None)
  parser.add_argument("--batch-id", type=UUID)
  parser.add_argument("--limit", type=int, default=500)
  parser.add_argument(
    "--exclude-personalized-recommendations",
    action="store_true",
    help="Migrate only media_assets rows; personalized recommendation assets remain unchanged.",
  )
  parser.add_argument("--confirm-copy", action="store_true")
  parser.add_argument("--confirm-source-deletion", action="store_true")
  parser.add_argument("--confirm-rollback", action="store_true")
  parser.add_argument("--cloudfront-distribution-id")
  parser.add_argument("--cloudfront-invalidation-id")
  return parser


async def _connect(database_url: str | None):
  if database_url:
    return await asyncpg.connect(dsn=database_url)
  try:
    connection, _ = await connect_database(get_settings())
  except DatabaseConfigurationError as error:
    raise RuntimeError("DATABASE_URL or DATABASE_SECRET_ID is required.") from error
  return connection


def _result_payload(result) -> dict:
  payload = asdict(result)
  payload["batch_id"] = str(payload["batch_id"])
  return payload


async def run(args: argparse.Namespace) -> int:
  settings = get_settings()
  connection = await _connect(args.database_url)
  try:
    if args.command == "plan":
      plan = await plan_private_media_migration(
        connection,
        settings,
        limit=args.limit,
        include_personalized_recommendations=not args.exclude_personalized_recommendations,
      )
      print(json.dumps(build_plan_report(plan), ensure_ascii=False, sort_keys=True))
      return 0

    if args.command == "execute":
      if not args.confirm_copy:
        raise RuntimeError("execute requires --confirm-copy after reviewing the dry-run plan")
      batch_id = args.batch_id or uuid4()
      plan = await plan_private_media_migration(
        connection,
        settings,
        limit=args.limit,
        include_personalized_recommendations=not args.exclude_personalized_recommendations,
      )
      result = await execute_private_media_migration(
        connection,
        settings,
        batch_id=batch_id,
        plan=plan,
      )
      print(json.dumps(_result_payload(result), ensure_ascii=False, sort_keys=True))
      return 1 if result.failed else 0

    if args.batch_id is None:
      raise RuntimeError(f"{args.command} requires --batch-id")

    if args.command == "verify":
      result = await verify_private_media_batch(
        connection,
        settings,
        batch_id=args.batch_id,
      )
      payload = _result_payload(result)
      payload["cloudfrontInvalidationPaths"] = list(
        await batch_cloudfront_paths(connection, args.batch_id),
      )
      print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
      return 1 if result.failed else 0

    if args.command == "cleanup":
      if not args.confirm_source_deletion:
        raise RuntimeError("cleanup requires --confirm-source-deletion")
      if not args.cloudfront_invalidation_id:
        raise RuntimeError("cleanup requires --cloudfront-invalidation-id from a completed invalidation")
      if not args.cloudfront_distribution_id:
        raise RuntimeError("cleanup requires --cloudfront-distribution-id")
      result, invalidated_paths = await cleanup_private_media_batch(
        connection,
        settings,
        batch_id=args.batch_id,
        cloudfront_distribution_id=args.cloudfront_distribution_id,
        cloudfront_invalidation_id=args.cloudfront_invalidation_id,
      )
      payload = _result_payload(result)
      payload["invalidatedPaths"] = list(invalidated_paths)
      print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
      return 1 if result.failed else 0

    if args.command == "discard-invalid":
      if not args.confirm_source_deletion:
        raise RuntimeError("discard-invalid requires --confirm-source-deletion")
      if not args.cloudfront_invalidation_id:
        raise RuntimeError(
          "discard-invalid requires --cloudfront-invalidation-id from a completed invalidation",
        )
      if not args.cloudfront_distribution_id:
        raise RuntimeError("discard-invalid requires --cloudfront-distribution-id")
      result, invalidated_paths = await discard_invalid_private_media_item(
        connection,
        settings,
        batch_id=args.batch_id,
        cloudfront_distribution_id=args.cloudfront_distribution_id,
        cloudfront_invalidation_id=args.cloudfront_invalidation_id,
      )
      payload = _result_payload(result)
      payload["invalidatedPaths"] = list(invalidated_paths)
      print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
      return 1 if result.failed else 0

    if not args.confirm_rollback:
      raise RuntimeError("rollback requires --confirm-rollback")
    result = await rollback_private_media_batch(
      connection,
      settings,
      batch_id=args.batch_id,
    )
    print(json.dumps(_result_payload(result), ensure_ascii=False, sort_keys=True))
    return 1 if result.failed else 0
  finally:
    await connection.close()


def main() -> None:
  args = _parser().parse_args()
  raise SystemExit(asyncio.run(run(args)))


if __name__ == "__main__":
  main()
