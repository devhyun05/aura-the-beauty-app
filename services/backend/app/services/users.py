from typing import Any

from app.core.security import AuthContext
from app.db.session import Database


SUPPORTED_PROVIDERS = {"google", "kakao", "naver", "apple"}


def normalize_provider(provider: str) -> str:
  return provider if provider in SUPPORTED_PROVIDERS else "google"


def default_nickname(auth: AuthContext) -> str:
  return auth.name or auth.email or "AURA User"


async def ensure_user(db: Database, auth: AuthContext) -> dict[str, Any]:
  provider = normalize_provider(auth.provider)
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