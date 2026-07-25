"""Migrate one local user's app-visible saved reports to deployed RDS."""

from __future__ import annotations

import argparse
import asyncio
from datetime import timezone
import hashlib
import json
from pathlib import Path
import sys
from typing import Any

import asyncpg
import boto3

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app.core.settings import Settings  # noqa: E402
from app.db.connection_config import connect_database  # noqa: E402
from app.ops.makeup_recommendation_migration import (  # noqa: E402
  MigrationPreconditionError,
  build_migration_plan,
  export_bundle,
  import_bundle,
  load_destination_state,
  read_bundle,
  verify_s3_objects,
  write_bundle_atomic,
)


DEFAULT_EMAIL = "du822623@gmail.com"
DEFAULT_PROFILE = "aura-dev"
DEFAULT_REGION = "ap-northeast-2"
DEFAULT_CONFIG_SECRET = "aura/backend/dev"
DEFAULT_RDS_INSTANCE = "aura-dev-postgres-1"
DEFAULT_BUNDLE = Path("/private/tmp/aura-makeup-migration.json")


def _session(args: argparse.Namespace) -> boto3.Session:
  return boto3.Session(profile_name=args.aws_profile, region_name=args.region)


def _secret_json(client: Any, secret_id: str) -> dict[str, Any]:
  response = client.get_secret_value(SecretId=secret_id)
  value = response.get("SecretString")
  if not value:
    raise MigrationPreconditionError(f"Secrets Manager value is empty: {secret_id}.")
  payload = json.loads(value)
  if not isinstance(payload, dict):
    raise MigrationPreconditionError(f"Secrets Manager value is not an object: {secret_id}.")
  return payload


async def _connect_local(args: argparse.Namespace) -> Any:
  settings = Settings(_env_file=args.local_env_file)
  connection, _ = await connect_database(settings)
  return connection


async def _connect_deployed(args: argparse.Namespace) -> Any:
  secrets = _session(args).client("secretsmanager")
  config = _secret_json(secrets, args.config_secret_id)
  database_secret_id = str(config.get("DATABASE_SECRET_ID") or "")
  if not database_secret_id:
    raise MigrationPreconditionError("Deployed config secret has no DATABASE_SECRET_ID.")
  database = _secret_json(secrets, database_secret_id)
  return await asyncpg.connect(
    user=database["username"],
    password=database["password"],
    host=database.get("host") or config["DB_HOST"],
    port=int(database.get("port") or config["DB_PORT"]),
    database=database.get("dbname") or database.get("database") or config["DB_NAME"],
    ssl="require",
    command_timeout=30,
  )


def _identity_fingerprint(provider: str, subject: str) -> str:
  return hashlib.sha256(f"{provider}\0{subject}".encode()).hexdigest()[:16]


def _summary(
  *,
  bundle: Any,
  destination: Any,
  plan: Any,
  s3: Any,
  bundle_digest: str | None,
) -> dict[str, Any]:
  return {
    "batchId": bundle.batch_id,
    "bundleSha256": bundle_digest,
    "identityFingerprint": _identity_fingerprint(
      bundle.auth_provider,
      bundle.oauth_sub,
    ),
    "sourceUserId": str(bundle.source_user_id),
    "destinationUserId": str(destination.user_id),
    "email": bundle.email,
    "insertCounts": dict(plan.insert_counts),
    "skipCounts": dict(plan.skip_counts),
    "s3": {
      "checked": s3.checked,
      "existing": s3.existing,
      "missing": list(s3.missing),
    },
  }


async def _dry_run(args: argparse.Namespace) -> None:
  local = await _connect_local(args)
  try:
    bundle = await export_bundle(local, email=args.email)
  finally:
    await local.close()

  s3 = verify_s3_objects(_session(args).client("s3"), bundle)
  if s3.missing:
    raise MigrationPreconditionError(
      f"Migration S3 objects are missing: {list(s3.missing)}.",
    )
  deployed = await _connect_deployed(args)
  try:
    destination = await load_destination_state(deployed, bundle)
    plan = build_migration_plan(bundle, destination)
  finally:
    await deployed.close()
  digest = write_bundle_atomic(bundle, args.bundle)
  print(json.dumps(
    _summary(
      bundle=bundle,
      destination=destination,
      plan=plan,
      s3=s3,
      bundle_digest=digest,
    ),
    ensure_ascii=False,
    indent=2,
    sort_keys=True,
  ))


def _require_available_backup(args: argparse.Namespace) -> dict[str, Any]:
  response = _session(args).client("rds").describe_db_snapshots(
    DBSnapshotIdentifier=args.backup_snapshot_id,
  )
  snapshots = response.get("DBSnapshots") or []
  if len(snapshots) != 1:
    raise MigrationPreconditionError("Backup snapshot could not be resolved uniquely.")
  snapshot = snapshots[0]
  if (
    snapshot.get("Status") != "available"
    or snapshot.get("DBInstanceIdentifier") != args.rds_instance
  ):
    raise MigrationPreconditionError(
      "Backup snapshot must be available and belong to the deployed RDS instance.",
    )
  created = snapshot["SnapshotCreateTime"]
  created_timestamp = (
    created.replace(tzinfo=timezone.utc) if created.tzinfo is None else created
  ).timestamp()
  if created_timestamp < args.bundle.stat().st_mtime:
    raise MigrationPreconditionError(
      "Backup snapshot predates the approved migration bundle.",
    )
  return {
    "id": str(snapshot["DBSnapshotIdentifier"]),
    "status": str(snapshot["Status"]),
    "createdAt": created.isoformat(),
  }


async def _apply(args: argparse.Namespace) -> None:
  actual_bundle_digest = hashlib.sha256(args.bundle.read_bytes()).hexdigest()
  if actual_bundle_digest != args.expected_bundle_sha256:
    raise MigrationPreconditionError(
      "Expected bundle SHA256 does not match the reviewed dry-run bundle.",
    )
  bundle = read_bundle(args.bundle)
  if bundle.batch_id != args.expected_batch_id:
    raise MigrationPreconditionError("Expected batch ID does not match the bundle.")
  backup = _require_available_backup(args)
  s3 = verify_s3_objects(_session(args).client("s3"), bundle)
  if s3.missing:
    raise MigrationPreconditionError(
      f"Migration S3 objects are missing: {list(s3.missing)}.",
    )
  deployed = await _connect_deployed(args)
  try:
    result = await import_bundle(
      deployed,
      bundle,
      expected_batch_id=args.expected_batch_id,
    )
    destination = await load_destination_state(deployed, bundle)
    post_plan = build_migration_plan(bundle, destination)
    if any(post_plan.insert_counts.values()):
      raise MigrationPreconditionError(
        f"Post-import verification still has inserts: {dict(post_plan.insert_counts)}.",
      )
  finally:
    await deployed.close()
  print(json.dumps(
    {
      "batchId": result.batch_id,
      "backup": backup,
      "destinationUserId": str(result.destination_user_id),
      "inserted": dict(result.inserted),
      "skipped": dict(result.skipped),
      "postImportInsertCounts": dict(post_plan.insert_counts),
      "s3": {
        "checked": s3.checked,
        "existing": s3.existing,
        "missing": list(s3.missing),
      },
    },
    ensure_ascii=False,
    indent=2,
    sort_keys=True,
  ))


async def _verify(args: argparse.Namespace) -> None:
  bundle = read_bundle(args.bundle)
  s3 = verify_s3_objects(_session(args).client("s3"), bundle)
  deployed = await _connect_deployed(args)
  try:
    destination = await load_destination_state(deployed, bundle)
    plan = build_migration_plan(bundle, destination)
  finally:
    await deployed.close()
  print(json.dumps(
    _summary(
      bundle=bundle,
      destination=destination,
      plan=plan,
      s3=s3,
      bundle_digest=hashlib.sha256(args.bundle.read_bytes()).hexdigest(),
    ),
    ensure_ascii=False,
    indent=2,
    sort_keys=True,
  ))


def _parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser()
  parser.add_argument("command", choices=("dry-run", "apply", "verify"))
  parser.add_argument("--email", default=DEFAULT_EMAIL)
  parser.add_argument("--aws-profile", default=DEFAULT_PROFILE)
  parser.add_argument("--region", default=DEFAULT_REGION)
  parser.add_argument("--config-secret-id", default=DEFAULT_CONFIG_SECRET)
  parser.add_argument("--rds-instance", default=DEFAULT_RDS_INSTANCE)
  parser.add_argument(
    "--local-env-file",
    type=Path,
    default=Path("/Users/yeoduchi/302-group5-final-project/services/backend/.env"),
  )
  parser.add_argument("--bundle", type=Path, default=DEFAULT_BUNDLE)
  parser.add_argument("--expected-batch-id")
  parser.add_argument("--expected-bundle-sha256")
  parser.add_argument("--backup-snapshot-id")
  return parser


async def _main() -> None:
  args = _parser().parse_args()
  if args.command == "dry-run":
    await _dry_run(args)
    return
  if args.command == "apply":
    if (
      not args.expected_batch_id
      or not args.expected_bundle_sha256
      or not args.backup_snapshot_id
    ):
      raise MigrationPreconditionError(
        "apply requires --expected-batch-id, --expected-bundle-sha256, "
        "and --backup-snapshot-id.",
      )
    await _apply(args)
    return
  await _verify(args)


if __name__ == "__main__":
  asyncio.run(_main())
