from typing import Any

from app.core.errors import AppError
from app.core.security import AuthContext
from app.db.session import Database
from app.services.account_identity import auth_subject_hashes, normalize_auth_provider


PROFILE_PLACEHOLDER_VALUES = {"Local Dev", "dev@example.com"}


def default_nickname(auth: AuthContext) -> str:
  return auth.name or auth.email or "AURA User"


def _profile_text(value: Any) -> str:
  normalized = str(value or "").strip()
  return "" if normalized in PROFILE_PLACEHOLDER_VALUES else normalized


def profile_is_completed(user: dict[str, Any]) -> bool:
  """Return whether the fields required by the mobile profile setup exist.

  OAuth email presence only proves that authentication succeeded.  The mobile
  onboarding form also requires a name, nickname, birth date, and a gender
  choice, so expose that state explicitly instead of making each client infer
  it from a local flag.
  """

  return all(
    (
      _profile_text(user.get("email")),
      _profile_text(user.get("name")),
      _profile_text(user.get("nickname")),
      user.get("birth_date"),
      user.get("gender"),
    )
  )


def _with_profile_completion(user: Any) -> dict[str, Any] | None:
  if user is None:
    return None

  data = dict(user)
  data["profile_completed"] = profile_is_completed(data)
  return data


async def ensure_user(db: Database, auth: AuthContext) -> dict[str, Any]:
  provider = normalize_auth_provider(auth.provider)
  row = await db.fetchrow(
    """
    with matching_user as (
      select id
      from users
      where oauth_sub = $2
        and deleted_at is null
        and (
          auth_provider = $1::auth_provider
          or (
            $1::text = 'apple'
            and auth_provider = 'google'::auth_provider
          )
        )
        and not exists (
          select 1
          from account_deletion_tombstones
          where subject_hash = any($6::text[])
        )
      order by
        case when auth_provider = $1::auth_provider then 0 else 1 end,
        created_at asc
      limit 1
    ), reused_user as (
      update users
      set auth_provider = $1::auth_provider,
          email = coalesce($3, users.email),
          name = coalesce($4, users.name),
          nickname = coalesce(nullif(users.nickname, ''), $5)
      where id = (select id from matching_user)
      returning *
    ), upserted_user as (
      insert into users (auth_provider, oauth_sub, email, name, nickname)
      select $1::auth_provider, $2, $3, $4, $5
      where not exists (
        select 1
        from account_deletion_tombstones
        where subject_hash = any($6::text[])
      )
        and not exists (select 1 from reused_user)
      on conflict (auth_provider, oauth_sub)
        where oauth_sub is not null and deleted_at is null
      do update set
        email = coalesce(excluded.email, users.email),
        name = coalesce(excluded.name, users.name),
        nickname = coalesce(nullif(users.nickname, ''), excluded.nickname)
      returning *
    ), resolved_user as (
      select * from reused_user
      union all
      select * from upserted_user
    ), initial_product_consents as (
      insert into user_consents (
        user_id,consent_type,version,accepted,accepted_at,metadata
      )
      select resolved_user.id,purpose::consent_type,'product-personalization-v1',true,now(),
        '{"source":"signup_terms"}'::jsonb
      from resolved_user
      cross join (values ('engagement_personalization'),('color_cohort')) consent(purpose)
      where not exists (
        select 1 from user_consents existing
        where existing.user_id=resolved_user.id and existing.consent_type::text=purpose
      )
      returning id
    )
    select * from resolved_user
    """,
    provider,
    auth.subject,
    auth.email,
    auth.name,
    default_nickname(auth),
    auth_subject_hashes(provider, auth.subject),
  )
  if row is None:
    raise AppError(
      403,
      "ACCOUNT_DELETED",
      "This account has been deleted.",
  )
  return _with_profile_completion(row) or {}
