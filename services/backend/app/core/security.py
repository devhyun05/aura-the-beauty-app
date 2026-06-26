import json
import time
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.errors import AppError
from app.core.settings import Settings, get_settings


bearer_scheme = HTTPBearer(auto_error=False)

JWKS_CACHE_TTL_SECONDS = 600
_jwks_cache: dict[str, Any] = {"expires_at": 0, "keys": []}


@dataclass(frozen=True)
class AuthContext:
  subject: str
  provider: str
  email: str | None
  name: str | None
  claims: dict[str, Any]


def _dev_auth_context(settings: Settings) -> AuthContext:
  return AuthContext(
    subject=settings.dev_user_sub,
    provider="google",
    email=settings.dev_user_email,
    name=settings.dev_user_name,
    claims={"token_use": "dev", "sub": settings.dev_user_sub},
  )


async def _get_jwks(settings: Settings) -> list[dict[str, Any]]:
  jwks_url = settings.cognito_jwks_url

  if not jwks_url:
    raise AppError(
      status_code=500,
      code="COGNITO_NOT_CONFIGURED",
      message="COGNITO_USER_POOL_ID and AWS_REGION are required for JWT verification.",
    )

  now = time.time()

  if _jwks_cache["keys"] and _jwks_cache["expires_at"] > now:
    return _jwks_cache["keys"]

  async with httpx.AsyncClient(timeout=10) as client:
    response = await client.get(jwks_url)
    response.raise_for_status()
    payload = response.json()

  _jwks_cache["keys"] = payload.get("keys", [])
  _jwks_cache["expires_at"] = now + JWKS_CACHE_TTL_SECONDS

  return _jwks_cache["keys"]


def _parse_provider(claims: dict[str, Any]) -> str:
  identities = claims.get("identities")

  if isinstance(identities, str):
    try:
      identities = json.loads(identities)
    except json.JSONDecodeError:
      identities = None

  if isinstance(identities, list) and identities:
    provider = identities[0].get("providerName") or identities[0].get("providerType")

    if isinstance(provider, str) and provider:
      return provider.lower()

  username = claims.get("cognito:username")

  if isinstance(username, str) and "_" in username:
    return username.split("_", 1)[0].lower()

  return "google"


def _get_claim_text(claims: dict[str, Any], *keys: str) -> str | None:
  for key in keys:
    value = claims.get(key)

    if isinstance(value, str) and value:
      return value

  return None


async def verify_cognito_token(token: str, settings: Settings) -> AuthContext:
  try:
    unverified_header = jwt.get_unverified_header(token)
  except JWTError as exc:
    raise AppError(401, "INVALID_TOKEN", "Invalid JWT header.") from exc

  kid = unverified_header.get("kid")
  keys = await _get_jwks(settings)
  key = next((item for item in keys if item.get("kid") == kid), None)

  if not key:
    raise AppError(401, "INVALID_TOKEN", "JWT signing key was not found.")

  issuer = settings.cognito_issuer

  if not issuer:
    raise AppError(500, "COGNITO_NOT_CONFIGURED", "Cognito issuer is not configured.")

  try:
    claims = jwt.decode(
      token,
      key,
      algorithms=["RS256"],
      issuer=issuer,
      options={"verify_aud": False},
    )
  except JWTError as exc:
    raise AppError(401, "INVALID_TOKEN", "JWT verification failed.") from exc

  token_client_id = claims.get("aud") or claims.get("client_id")

  if settings.cognito_app_client_id and token_client_id != settings.cognito_app_client_id:
    raise AppError(401, "INVALID_TOKEN", "JWT was not issued for this app client.")

  subject = _get_claim_text(claims, "sub")

  if not subject:
    raise AppError(401, "INVALID_TOKEN", "JWT subject is missing.")

  return AuthContext(
    subject=subject,
    provider=_parse_provider(claims),
    email=_get_claim_text(claims, "email"),
    name=_get_claim_text(claims, "name", "given_name"),
    claims=claims,
  )


async def get_current_user(
  credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
  settings: Settings = Depends(get_settings),
) -> AuthContext:
  if not settings.auth_required:
    return _dev_auth_context(settings)

  if credentials is None or not credentials.credentials:
    raise AppError(401, "UNAUTHORIZED", "Authorization bearer token is required.")

  return await verify_cognito_token(credentials.credentials, settings)
