from fastapi import APIRouter, Depends

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.db.session import Database, require_database
from app.schemas.users import ProfileUpdate
from app.services.users import ensure_user


router = APIRouter(prefix="/users", tags=["users"])


async def attach_avatar_media(db: Database, user: dict) -> dict:
  data = dict(user)
  avatar_media_id = data.get("avatar_media_id")

  if not avatar_media_id:
    data["avatar_media"] = None
    data["avatar_url"] = None
    return data

  avatar_media = await db.fetchrow(
    """
    select id, bucket, object_key, cdn_url, content_type
    from media_assets
    where id = $1
      and owner_user_id = $2
      and deleted_at is null
    """,
    avatar_media_id,
    data["id"],
  )

  avatar_media_data = dict(avatar_media) if avatar_media else None
  data["avatar_media"] = avatar_media_data
  data["avatar_url"] = avatar_media_data.get("cdn_url") if avatar_media_data else None

  return data


@router.get("/me")
async def get_me(
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)

  return success({"user": await attach_avatar_media(db, user), "auth": {"provider": auth.provider}})


@router.patch("/me/profile")
async def update_my_profile(
  payload: ProfileUpdate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  data = payload.model_dump(exclude_unset=True, by_alias=False)
  allowed_fields = [
    "avatar_media_id",
    "nickname",
    "phone",
    "birth_date",
    "gender",
    "interest",
    "personal_color",
    "skin_type",
    "skin_tone",
    "tags",
  ]
  updates = {key: value for key, value in data.items() if key in allowed_fields}

  avatar_media_id = updates.get("avatar_media_id")

  if avatar_media_id is not None:
    avatar_media = await db.fetchrow(
      """
      select id
      from media_assets
      where id = $1
        and owner_user_id = $2
        and media_kind = 'profile-avatar'
        and deleted_at is null
      """,
      avatar_media_id,
      user["id"],
    )

    if avatar_media is None:
      updates.pop("avatar_media_id", None)

  if not updates:
    return success({"user": await attach_avatar_media(db, user)})

  assignments = []
  values = [user["id"]]

  for index, (key, value) in enumerate(updates.items(), start=2):
    assignments.append(f"{key} = ${index}")
    values.append(value)

  query = f"""
    update users
    set {", ".join(assignments)}
    where id = $1
    returning *
  """
  updated_user = await db.fetchrow(query, *values)

  return success({"user": await attach_avatar_media(db, updated_user)})
