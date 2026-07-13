from uuid import uuid4

import pytest

from app.core.errors import AppError
from app.services.consulting_partner import update_expert_avatar


class AvatarDatabase:
  def __init__(self, image_url: str | None = "https://cdn.example.com/profile.jpg") -> None:
    self.image_url = image_url
    self.updated: tuple[str, str] | None = None

  async def fetchrow(self, query: str, *args):
    if "from media_upload_sessions" in query:
      return {"image_url": self.image_url} if self.image_url else None
    if "update consulting_experts" in query:
      self.updated = (str(args[0]), str(args[1]))
      return {
        "id": args[0],
        "name": "김세아",
        "image_url": args[1],
        "is_active": True,
      }
    raise AssertionError(f"Unexpected query: {query}")


def _account() -> dict:
  return {
    "id": str(uuid4()),
    "expert_id": "exp_sea",
    "email": "sea@example.com",
  }


@pytest.mark.asyncio
async def test_partner_can_apply_owned_profile_avatar() -> None:
  db = AvatarDatabase()

  expert = await update_expert_avatar(db, _account(), "exp_sea", uuid4())

  assert expert["avatar_url"] == "https://cdn.example.com/profile.jpg"
  assert db.updated == ("exp_sea", "https://cdn.example.com/profile.jpg")


@pytest.mark.asyncio
async def test_partner_cannot_update_another_expert_avatar() -> None:
  db = AvatarDatabase()

  with pytest.raises(AppError) as exc_info:
    await update_expert_avatar(db, _account(), "exp_other", uuid4())

  assert exc_info.value.status_code == 403
  assert exc_info.value.code == "PARTNER_EXPERT_FORBIDDEN"
  assert db.updated is None


@pytest.mark.asyncio
async def test_partner_avatar_requires_owned_completed_media() -> None:
  db = AvatarDatabase(image_url=None)

  with pytest.raises(AppError) as exc_info:
    await update_expert_avatar(db, _account(), "exp_sea", uuid4())

  assert exc_info.value.code == "PARTNER_AVATAR_MEDIA_NOT_FOUND"
  assert db.updated is None
