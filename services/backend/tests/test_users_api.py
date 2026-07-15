import pytest

from app.api.users import attach_avatar_media, get_auth_avatar_url
from app.core.security import AuthContext


class AvatarDatabase:
  def __init__(self, avatar_media: dict | None = None) -> None:
    self.avatar_media = avatar_media
    self.calls: list[tuple[str, tuple[object, ...]]] = []

  async def fetchrow(self, query: str, *args):
    self.calls.append((query, args))
    return self.avatar_media


def build_auth(picture: object) -> AuthContext:
  return AuthContext(
    subject="cognito-user-1",
    provider="google",
    email="user@example.com",
    name="User",
    claims={"picture": picture},
  )


def test_get_auth_avatar_url_accepts_only_https_claims() -> None:
  assert get_auth_avatar_url(build_auth("https://example.com/avatar.jpg")) == (
    "https://example.com/avatar.jpg"
  )
  assert get_auth_avatar_url(build_auth("http://example.com/avatar.jpg")) is None
  assert get_auth_avatar_url(build_auth("file:///tmp/avatar.jpg")) is None
  assert get_auth_avatar_url(build_auth(None)) is None


@pytest.mark.asyncio
async def test_attach_avatar_media_uses_google_picture_when_upload_is_missing() -> None:
  db = AvatarDatabase()

  result = await attach_avatar_media(
    db,
    {"id": "user-1", "avatar_media_id": None},
    fallback_avatar_url="https://example.com/google-avatar.jpg",
  )

  assert result["avatar_media"] is None
  assert result["avatar_url"] == "https://example.com/google-avatar.jpg"
  assert db.calls == []


@pytest.mark.asyncio
async def test_attach_avatar_media_prefers_uploaded_avatar() -> None:
  db = AvatarDatabase({
    "id": "media-1",
    "bucket": "media-bucket",
    "object_key": "avatars/user-1.jpg",
    "cdn_url": "https://cdn.example.com/avatar.jpg",
    "content_type": "image/jpeg",
  })

  result = await attach_avatar_media(
    db,
    {"id": "user-1", "avatar_media_id": "media-1"},
    fallback_avatar_url="https://example.com/google-avatar.jpg",
  )

  assert result["avatar_url"] == "https://cdn.example.com/avatar.jpg"
  assert result["avatar_media"]["id"] == "media-1"
  assert len(db.calls) == 1
