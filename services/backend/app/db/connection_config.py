import base64
import json
from dataclasses import dataclass
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.settings import Settings, get_settings


class DatabaseConfigurationError(RuntimeError):
  pass


class DatabaseSecretError(DatabaseConfigurationError):
  pass


@dataclass(frozen=True)
class DatabaseConnectionConfig:
  source: str
  dsn: str | None = None
  user: str | None = None
  password: str | None = None
  host: str | None = None
  port: int | None = None
  database: str | None = None
  ssl: str | None = None

  @property
  def uses_secret(self) -> bool:
    return self.source == "secrets_manager"

  def asyncpg_kwargs(self) -> dict[str, Any]:
    if self.dsn:
      return {"dsn": self.dsn}

    return {
      "user": self.user,
      "password": self.password,
      "host": self.host,
      "port": self.port,
      "database": self.database,
      "ssl": self.ssl,
    }


_secret_cache: dict[tuple[str, str], dict[str, Any]] = {}


def clear_database_secret_cache() -> None:
  _secret_cache.clear()


def resolve_database_connection_config(
  settings: Settings | None = None,
  *,
  refresh_secret: bool = False,
) -> DatabaseConnectionConfig | None:
  settings = settings or get_settings()

  if settings.database_url:
    return DatabaseConnectionConfig(source="database_url", dsn=settings.database_url)

  if not settings.database_secret_id:
    return None

  secret = get_database_secret(settings, refresh=refresh_secret)
  username = get_required_secret_text(secret, "username", secret_id=settings.database_secret_id)
  password = get_required_secret_text(secret, "password", secret_id=settings.database_secret_id)
  host = get_optional_secret_text(secret, "host") or settings.db_host
  database = (
    get_optional_secret_text(secret, "dbname")
    or get_optional_secret_text(secret, "database")
    or settings.db_name
  )
  port = get_optional_secret_port(secret) or settings.db_port
  sslmode = get_optional_secret_text(secret, "sslmode") or settings.db_sslmode

  if not host:
    raise DatabaseConfigurationError(
      "DB_HOST is required when DATABASE_SECRET_ID does not include a host.",
    )

  if not database:
    raise DatabaseConfigurationError(
      "DB_NAME is required when DATABASE_SECRET_ID does not include dbname or database.",
    )

  return DatabaseConnectionConfig(
    source="secrets_manager",
    user=username,
    password=password,
    host=host,
    port=port,
    database=database,
    ssl=normalize_sslmode(sslmode),
  )


def get_database_secret(settings: Settings, *, refresh: bool = False) -> dict[str, Any]:
  if not settings.database_secret_id:
    raise DatabaseConfigurationError("DATABASE_SECRET_ID is required to read the database secret.")

  cache_key = (settings.aws_region, settings.database_secret_id)

  if not refresh and cache_key in _secret_cache:
    return _secret_cache[cache_key]

  client_kwargs: dict[str, Any] = {"region_name": settings.aws_region}

  if settings.aws_access_key_id and settings.aws_secret_access_key:
    client_kwargs.update(
      {
        "aws_access_key_id": settings.aws_access_key_id,
        "aws_secret_access_key": settings.aws_secret_access_key,
      },
    )

  client = boto3.client("secretsmanager", **client_kwargs)

  try:
    response = client.get_secret_value(SecretId=settings.database_secret_id)
  except (BotoCoreError, ClientError) as error:
    raise DatabaseSecretError(
      f"Failed to read DATABASE_SECRET_ID from Secrets Manager: {error.__class__.__name__}.",
    ) from error

  secret_payload = response.get("SecretString")

  if secret_payload is None and response.get("SecretBinary") is not None:
    secret_payload = base64.b64decode(response["SecretBinary"]).decode("utf-8")

  if not secret_payload:
    raise DatabaseSecretError("DATABASE_SECRET_ID did not return SecretString or SecretBinary.")

  try:
    secret = json.loads(secret_payload)
  except json.JSONDecodeError as error:
    raise DatabaseSecretError("DATABASE_SECRET_ID value must be a JSON object.") from error

  if not isinstance(secret, dict):
    raise DatabaseSecretError("DATABASE_SECRET_ID value must be a JSON object.")

  _secret_cache[cache_key] = secret
  return secret


def get_required_secret_text(secret: dict[str, Any], key: str, *, secret_id: str) -> str:
  value = get_optional_secret_text(secret, key)

  if value is None:
    raise DatabaseSecretError(f"DATABASE_SECRET_ID {secret_id} is missing required key: {key}.")

  return value


def get_optional_secret_text(secret: dict[str, Any], key: str) -> str | None:
  value = secret.get(key)

  if value is None:
    return None

  normalized = str(value).strip()
  return normalized or None


def get_optional_secret_port(secret: dict[str, Any]) -> int | None:
  value = secret.get("port")

  if value is None:
    return None

  try:
    return int(value)
  except (TypeError, ValueError) as error:
    raise DatabaseSecretError("DATABASE_SECRET_ID port must be a number.") from error


def normalize_sslmode(sslmode: str | None) -> str | bool | None:
  if not sslmode:
    return None

  normalized = sslmode.strip().lower()

  if normalized in {"disable", "false", "none"}:
    return None

  if normalized in {"allow", "prefer", "require", "verify-ca", "verify-full", "true"}:
    return "require" if normalized == "true" else normalized

  raise DatabaseConfigurationError(
    "DB_SSLMODE must be one of disable, allow, prefer, require, verify-ca, or verify-full.",
  )


async def connect_database(
  settings: Settings | None = None,
  *,
  refresh_secret: bool = False,
) -> tuple[Any, DatabaseConnectionConfig]:
  import asyncpg

  config = resolve_database_connection_config(settings, refresh_secret=refresh_secret)

  if config is None:
    raise DatabaseConfigurationError("DATABASE_URL or DATABASE_SECRET_ID is required.")

  connection = await asyncpg.connect(**config.asyncpg_kwargs())
  return connection, config
