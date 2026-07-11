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
    insert into users (auth_provider, oauth_sub, email, name, nickname)
    select $1, $2, $3, $4, $5
    where not exists (
      select 1
      from account_deletion_tombstones
      where subject_hash = $6
    )
    on conflict (auth_provider, oauth_sub)
      where oauth_sub is not null and deleted_at is null
    do update set
      email = coalesce(excluded.email, users.email),
      name = coalesce(excluded.name, users.name),
      nickname = coalesce(nullif(users.nickname, ''), excluded.nickname)
    returning *
    """,
    provider,
    auth.subject,
    auth.email,
    auth.name,
    default_nickname(auth),
    hash_auth_subject(provider, auth.subject),
  )
  if row is None:
    raise AppError(
      403,
      "ACCOUNT_DELETED",
      "This account has been deleted.",
    )
  return row
