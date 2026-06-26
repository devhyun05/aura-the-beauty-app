from fastapi import APIRouter, Depends

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.db.session import Database, require_database
from app.schemas.users import ProfileUpdate
from app.services.users import ensure_user


router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
async def get_me(
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)

  return success({"user": user, "auth": {"provider": auth.provider}})


@router.patch("/me/profile")
async def update_my_profile(
  payload: ProfileUpdate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  data = payload.model_dump(exclude_unset=True, by_alias=False)
  allowed_fields = [
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

  if not updates:
    return success({"user": user})

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

  return success({"user": updated_user})
