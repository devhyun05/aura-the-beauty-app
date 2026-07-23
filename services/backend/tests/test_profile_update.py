import pytest

from app.api import users as users_api
from app.core.security import AuthContext
from app.schemas.users import ProfileUpdate


def test_profile_update_accepts_required_apple_onboarding_fields() -> None:
  payload = ProfileUpdate.model_validate({
    "birthDate": "2000-01-01",
    "email": "relay@privaterelay.appleid.com",
    "gender": "unknown",
    "name": "AURA Reviewer",
    "nickname": "Reviewer",
  })

  assert payload.email == "relay@privaterelay.appleid.com"
  assert payload.name == "AURA Reviewer"


class FakeProfileDb:
  def __init__(self) -> None:
    self.calls: list[tuple[str, tuple[object, ...]]] = []

  async def fetchrow(self, query: str, *args):
    self.calls.append((query, args))
    return {
      "id": "user-1",
      "avatar_media_id": None,
      "birth_date": "2000-01-01",
      "email": "relay@privaterelay.appleid.com",
      "gender": "unknown",
      "name": "AURA Reviewer",
      "nickname": "Reviewer",
    }


@pytest.mark.asyncio
async def test_profile_update_persists_name_and_email(monkeypatch) -> None:
  async def fake_ensure_user(_db, _auth):
    return {"id": "user-1", "avatar_media_id": None}

  monkeypatch.setattr(users_api, "ensure_user", fake_ensure_user)
  db = FakeProfileDb()
  auth = AuthContext(
    subject="apple-sub",
    provider="apple",
    email="relay@privaterelay.appleid.com",
    name=None,
    claims={},
  )

  await users_api.update_my_profile(
    ProfileUpdate.model_validate({
      "birthDate": "2000-01-01",
      "email": "relay@privaterelay.appleid.com",
      "gender": "unknown",
      "name": "AURA Reviewer",
      "nickname": "Reviewer",
    }),
    auth=auth,
    db=db,
  )

  update_query, update_args = db.calls[0]
  assert "email =" in update_query
  assert "name =" in update_query
  assert "relay@privaterelay.appleid.com" in update_args
  assert "AURA Reviewer" in update_args
