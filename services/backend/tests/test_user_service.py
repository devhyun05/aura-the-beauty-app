import pytest

from app.core.security import AuthContext
from app.services.account_identity import hash_auth_subject
from app.services.users import ensure_user


class FakeDb:
  def __init__(self) -> None:
    self.calls: list[tuple[str, tuple[object, ...]]] = []

  async def fetchrow(self, query: str, *args):
    self.calls.append((query, args))
    return {
      "id": "user-1",
      "auth_provider": args[0],
      "oauth_sub": args[1],
      "email": args[2],
      "name": args[3],
      "nickname": args[4],
    }


@pytest.mark.asyncio
async def test_ensure_user_uses_one_atomic_upsert() -> None:
  db = FakeDb()
  auth = AuthContext(
    subject="cognito-sub-1",
    provider="google",
    email="load-test@example.com",
    name="Load Test",
    claims={},
  )

  user = await ensure_user(db, auth)

  assert user["id"] == "user-1"
  assert len(db.calls) == 1
  query, args = db.calls[0]
  assert "insert into users" in query
  assert "on conflict (auth_provider, oauth_sub)" in query
  assert "where oauth_sub is not null and deleted_at is null" in query
  assert "do update set" in query
  assert "from account_deletion_tombstones" in query
  assert "where not exists" in query
  assert args == (
    "google",
    "cognito-sub-1",
    "load-test@example.com",
    "Load Test",
    "Load Test",
    hash_auth_subject("google", "cognito-sub-1"),
  )
