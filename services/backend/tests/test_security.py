import pytest

from app.core import security
from app.core.errors import AppError
from app.core.security import get_current_user, verify_cognito_token
from app.core.settings import Settings


@pytest.mark.asyncio
async def test_get_current_user_uses_dev_context_when_auth_is_not_required() -> None:
  auth = await get_current_user(None, Settings(dev_user_sub="dev-sub", dev_user_email="dev@example.com"))

  assert auth.subject == "dev-sub"
  assert auth.provider == "google"
  assert auth.email == "dev@example.com"
  assert auth.claims["token_use"] == "dev"


@pytest.mark.asyncio
async def test_get_current_user_requires_bearer_token_when_auth_is_required() -> None:
  with pytest.raises(AppError) as exc_info:
    await get_current_user(None, Settings(auth_required=True))

  assert exc_info.value.status_code == 401
  assert exc_info.value.code == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_verify_cognito_token_maps_google_id_token_claims(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_get_jwks(_: Settings) -> list[dict]:
    return [{"kid": "key-1"}]

  def fake_header(_: str) -> dict:
    return {"kid": "key-1"}

  def fake_decode(*args, **kwargs) -> dict:
    assert kwargs["issuer"] == "https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_pool"
    return {
      "aud": "client-id",
      "email": "jun@example.com",
      "identities": '[{"providerName":"Google"}]',
      "name": "Jun",
      "sub": "google-sub",
      "token_use": "id",
    }

  monkeypatch.setattr(security, "_get_jwks", fake_get_jwks)
  monkeypatch.setattr(security.jwt, "get_unverified_header", fake_header)
  monkeypatch.setattr(security.jwt, "decode", fake_decode)

  auth = await verify_cognito_token(
    "jwt-token",
    Settings(
      auth_required=True,
      aws_region="ap-northeast-2",
      cognito_user_pool_id="ap-northeast-2_pool",
      cognito_app_client_id="client-id",
    ),
  )

  assert auth.subject == "google-sub"
  assert auth.provider == "google"
  assert auth.email == "jun@example.com"
  assert auth.name == "Jun"


@pytest.mark.asyncio
async def test_verify_cognito_token_accepts_access_token_client_id(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_get_jwks(_: Settings) -> list[dict]:
    return [{"kid": "key-1"}]

  monkeypatch.setattr(security, "_get_jwks", fake_get_jwks)
  monkeypatch.setattr(security.jwt, "get_unverified_header", lambda _: {"kid": "key-1"})
  monkeypatch.setattr(
    security.jwt,
    "decode",
    lambda *args, **kwargs: {
      "client_id": "client-id",
      "cognito:username": "Google_google-sub",
      "sub": "google-sub",
      "token_use": "access",
    },
  )

  auth = await verify_cognito_token(
    "jwt-token",
    Settings(cognito_user_pool_id="ap-northeast-2_pool", cognito_app_client_id="client-id"),
  )

  assert auth.subject == "google-sub"
  assert auth.provider == "google"


@pytest.mark.asyncio
async def test_verify_cognito_token_rejects_wrong_app_client(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_get_jwks(_: Settings) -> list[dict]:
    return [{"kid": "key-1"}]

  monkeypatch.setattr(security, "_get_jwks", fake_get_jwks)
  monkeypatch.setattr(security.jwt, "get_unverified_header", lambda _: {"kid": "key-1"})
  monkeypatch.setattr(
    security.jwt,
    "decode",
    lambda *args, **kwargs: {"aud": "other-client", "sub": "google-sub", "token_use": "id"},
  )

  with pytest.raises(AppError) as exc_info:
    await verify_cognito_token(
      "jwt-token",
      Settings(cognito_user_pool_id="ap-northeast-2_pool", cognito_app_client_id="client-id"),
    )

  assert exc_info.value.status_code == 401
  assert exc_info.value.code == "INVALID_TOKEN"
