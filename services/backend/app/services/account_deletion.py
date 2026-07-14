import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import asyncpg
import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.errors import AppError
from app.core.security import AuthContext
from app.core.settings import Settings
from app.db.session import Database
from app.services.account_identity import hash_auth_subject, normalize_auth_provider
from app.services.auradin_agent.session_manager import purge_in_memory_owner_sessions


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AccountDeletionResult:
  media_count: int
  outbox_ids: tuple[UUID, ...]


async def ensure_account_deletion_schema(db: Database) -> None:
  if db.pool is None:
    return

  async with db.pool.acquire() as connection:
    await connection.execute(
      """
      create table if not exists account_deletion_tombstones (
        subject_hash text primary key,
        auth_provider text not null,
        deleted_at timestamptz not null default now()
      );

      create index if not exists idx_account_deletion_tombstones_deleted_at
        on account_deletion_tombstones (deleted_at);
      """,
    )


def _collect_media_objects(media_rows: list[asyncpg.Record]) -> list[tuple[UUID, str, str]]:
  objects: dict[tuple[str, str], tuple[UUID, str, str]] = {}

  for row in media_rows:
    media_id = row["id"]

    for bucket_field, key_field in (
      ("bucket", "object_key"),
      ("thumbnail_bucket", "thumbnail_object_key"),
    ):
      bucket = row[bucket_field]
      object_key = row[key_field]

      if bucket and object_key:
        objects[(bucket, object_key)] = (media_id, bucket, object_key)

  return list(objects.values())


async def delete_user_account(
  db: Database,
  *,
  auth: AuthContext,
  reason: str | None = None,
  user_id: UUID | str,
) -> AccountDeletionResult:
  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Database is not connected.")

  provider = normalize_auth_provider(auth.provider)
  subject_hash = hash_auth_subject(provider, auth.subject)
  outbox_ids: list[UUID] = []

  async with db.pool.acquire() as connection:
    async with connection.transaction():
      user = await connection.fetchrow(
        """
        select id
        from users
        where id = $1
          and deleted_at is null
        for update
        """,
        user_id,
      )

      if user is None:
        raise AppError(404, "USER_NOT_FOUND", "User account was not found.")

      media_rows = await connection.fetch(
        """
        select
          id,
          bucket,
          object_key,
          thumbnail_bucket,
          thumbnail_object_key
        from media_assets
        where owner_user_id = $1
          and deleted_at is null
        for update
        """,
        user_id,
      )
      media_objects = _collect_media_objects(media_rows)
      media_ids = [row["id"] for row in media_rows]

      # Reviews use ON DELETE SET NULL so remove authored content before deleting the user.
      audit_metadata = {
        "authProvider": provider,
        "mediaAssetCount": len(media_rows),
        "mediaObjectCount": len(media_objects),
      }

      if reason:
        audit_metadata["reason"] = reason

      await connection.execute(
        "delete from consulting_expert_reviews where author_user_id = $1",
        user_id,
      )
      # Auradin sessions intentionally have no user FK because they can run in
      # memory/no-DB mode. Purge the authenticated owner explicitly.
      await connection.execute(
        "delete from auradin_search_sessions where state ->> 'ownerSubject' = $1",
        auth.subject,
      )
      await connection.execute(
        """
        insert into account_deletion_tombstones (subject_hash, auth_provider, deleted_at)
        values ($1, $2, now())
        on conflict (subject_hash)
        do update set auth_provider = excluded.auth_provider, deleted_at = excluded.deleted_at
        """,
        subject_hash,
        provider,
      )
      await connection.execute("delete from users where id = $1", user_id)

      if media_ids:
        await connection.execute(
          """
          update media_assets
          set owner_user_id = null,
              status = 'deletion_pending',
              cdn_url = null,
              thumbnail_cdn_url = null,
              original_filename = null,
              checksum_sha256 = null
          where id = any($1::uuid[])
          """,
          media_ids,
        )

      for media_asset_id, bucket, object_key in media_objects:
        outbox = await connection.fetchrow(
          """
          insert into media_deletion_outbox (
            report_id,
            media_asset_id,
            bucket,
            object_key,
            reason,
            status,
            next_attempt_at
          )
          values (null, $1, $2, $3, 'account_deleted', 'pending', now())
          returning id
          """,
          media_asset_id,
          bucket,
          object_key,
        )

        if outbox:
          outbox_ids.append(outbox["id"])

      await connection.execute(
        """
        insert into audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        values (null, 'account.deleted', 'user', $1, $2::jsonb)
        """,
        user_id,
        json.dumps(audit_metadata),
      )

  purge_in_memory_owner_sessions(auth.subject)

  return AccountDeletionResult(
    media_count=len(media_rows),
    outbox_ids=tuple(outbox_ids),
  )


def _create_cognito_client(settings: Settings):
  client_kwargs: dict[str, Any] = {"region_name": settings.aws_region}

  if settings.aws_profile_name:
    return boto3.Session(profile_name=settings.aws_profile_name).client(
      "cognito-idp",
      **client_kwargs,
    )

  if (
    settings.aws_access_key_id
    and settings.aws_secret_access_key
    and not settings.aws_use_iam_role
  ):
    client_kwargs.update(
      {
        "aws_access_key_id": settings.aws_access_key_id,
        "aws_secret_access_key": settings.aws_secret_access_key,
      },
    )

  return boto3.client("cognito-idp", **client_kwargs)


def _admin_delete_cognito_user(
  settings: Settings,
  username: str,
) -> None:
  _create_cognito_client(settings).admin_delete_user(
    UserPoolId=settings.cognito_user_pool_id,
    Username=username,
  )


async def delete_cognito_identity(
  auth: AuthContext,
  settings: Settings,
) -> bool:
  if not settings.cognito_user_pool_id:
    return False

  username = auth.claims.get("cognito:username") or auth.claims.get("username")

  if not isinstance(username, str) or not username.strip():
    return False

  try:
    await asyncio.to_thread(_admin_delete_cognito_user, settings, username)
    return True
  except ClientError as exc:
    error_code = exc.response.get("Error", {}).get("Code")

    if error_code == "UserNotFoundException":
      return True

    logger.warning(
      "[aura:account-deletion] cognito-delete:failed errorCode=%s",
      error_code or exc.__class__.__name__,
    )
  except BotoCoreError as exc:
    logger.warning(
      "[aura:account-deletion] cognito-delete:failed reason=%s",
      exc.__class__.__name__,
    )

  return False
