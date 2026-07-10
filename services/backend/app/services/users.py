from typing import Any

from app.core.errors import AppError
from app.core.security import AuthContext
from app.db.session import Database
from app.services.account_identity import hash_auth_subject, normalize_auth_provider


def default_nickname(auth: AuthContext) -> str:
  return auth.name or auth.email or "AURA User"


async def ensure_user(db: Database, auth: AuthContext) -> dict[str, Any]:
  provider = normalize_auth_provider(auth.provider)
  row = await db.fetchrow(
    """
    select *
    from users
    where auth_provider = $1
      and oauth_sub = $2
      and deleted_at is null
    limit 1
    """,
    provider,
    auth.subject,
  )

  if row:
    return await db.fetchrow(
      """
      update users
      set email = coalesce($2, email),
          name = coalesce($3, name),
          nickname = coalesce(nullif(nickname, ''), $4)
      where id = $1
      returning *
      """,
      row["id"],
      auth.email,
      auth.name,
      default_nickname(auth),
    ) or row

  deleted_identity = await db.fetchrow(
    """
    select subject_hash
    from account_deletion_tombstones
    where subject_hash = $1
    """,
    hash_auth_subject(provider, auth.subject),
  )

  if deleted_identity:
    raise AppError(
      403,
      "ACCOUNT_DELETED",
      "This account has been deleted.",
    )

  return await db.fetchrow(
    """
    insert into users (auth_provider, oauth_sub, email, name, nickname)
    values ($1, $2, $3, $4, $5)
    returning *
    """,
    provider,
    auth.subject,
    auth.email,
    auth.name,
    default_nickname(auth),
  ) or {}
