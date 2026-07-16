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
_jwks_cache: dict[str, dict[str, Any]] = {}
CONSULTING_ADMIN_GROUPS = frozenset({"admin", "operator", "business_manager"})


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
  cache_entry = _jwks_cache.get(jwks_url)

  if cache_entry and cache_entry["expires_at"] > now:
    return cache_entry["keys"]

  try:
    async with httpx.AsyncClient(timeout=10) as client:
      response = await client.get(jwks_url)
      response.raise_for_status()
      payload = response.json()
  except httpx.HTTPError as exc:
    raise AppError(
      status_code=503,
      code="COGNITO_JWKS_UNAVAILABLE",
      message="Unable to fetch Cognito signing keys.",
    ) from exc

  keys = payload.get("keys", [])

  if not isinstance(keys, list):
    keys = []

  _jwks_cache[jwks_url] = {
    "keys": keys,
    "expires_at": now + JWKS_CACHE_TTL_SECONDS,
  }

  return keys


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
      options={"verify_at_hash": False, "verify_aud": False},
    )
  except JWTError as exc:
    raise AppError(401, "INVALID_TOKEN", "JWT verification failed.") from exc

  token_use = claims.get("token_use")

  if token_use not in {"id", "access"}:
    raise AppError(401, "INVALID_TOKEN", "JWT token_use must be id or access.")

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


async def get_optional_current_user(
  credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
  settings: Settings = Depends(get_settings),
) -> AuthContext | None:
  """Resolve a viewer when present while keeping genuinely public reads public.

  Supplying an invalid bearer token still fails closed. In local auth-disabled
  mode the configured development identity remains available, matching the
  behavior of authenticated endpoints.
  """

  if not settings.auth_required:
    return _dev_auth_context(settings)
  if credentials is None or not credentials.credentials:
    return None
  return await verify_cognito_token(credentials.credentials, settings)


def cognito_groups(auth: AuthContext) -> frozenset[str]:
  groups = auth.claims.get("cognito:groups")
  if isinstance(groups, str):
    groups = [groups]
  if not isinstance(groups, list):
    return frozenset()
  return frozenset(str(group).strip().lower() for group in groups if str(group).strip())


def require_consulting_admin(
  auth: AuthContext = Depends(get_current_user),
) -> AuthContext:
  if not cognito_groups(auth).intersection(CONSULTING_ADMIN_GROUPS):
    raise AppError(
      403,
      "CONSULTING_ADMIN_FORBIDDEN",
      "Consulting administrator or operator access is required.",
    )
  return auth
