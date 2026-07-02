import pytest

from app.core.settings import Settings
from app.db import connection_config
from app.db.connection_config import (
  DatabaseConfigurationError,
  resolve_database_connection_config,
)


def test_database_url_keeps_existing_connection_path() -> None:
  config = resolve_database_connection_config(
    Settings(database_url="postgresql://user:pass@localhost:5432/app"),
  )

  assert config is not None
  assert config.source == "database_url"
  assert config.asyncpg_kwargs() == {"dsn": "postgresql://user:pass@localhost:5432/app"}


def test_database_secret_uses_parameter_connection(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(
    connection_config,
    "get_database_secret",
    lambda _settings, refresh=False: {"username": "aura_admin", "password": "p@ss/#:<word>"},
  )

  config = resolve_database_connection_config(
    Settings(
      database_secret_id="rds-secret",
      db_host="db.example.com",
      db_name="postgres",
      db_sslmode="require",
    ),
  )

  assert config is not None
  assert config.source == "secrets_manager"
  assert config.asyncpg_kwargs() == {
    "user": "aura_admin",
    "password": "p@ss/#:<word>",
    "host": "db.example.com",
    "port": 5432,
    "database": "postgres",
    "ssl": "require",
  }


def test_database_secret_can_supply_host_port_and_database(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  monkeypatch.setattr(
    connection_config,
    "get_database_secret",
    lambda _settings, refresh=False: {
      "username": "aura_admin",
      "password": "secret",
      "host": "db.example.com",
      "port": "5433",
      "dbname": "app",
    },
  )

  config = resolve_database_connection_config(
    Settings(database_secret_id="rds-secret", db_sslmode="disable"),
  )

  assert config is not None
  assert config.asyncpg_kwargs()["host"] == "db.example.com"
  assert config.asyncpg_kwargs()["port"] == 5433
  assert config.asyncpg_kwargs()["database"] == "app"
  assert config.asyncpg_kwargs()["ssl"] is None


def test_database_secret_requires_host_when_secret_omits_it(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  monkeypatch.setattr(
    connection_config,
    "get_database_secret",
    lambda _settings, refresh=False: {"username": "aura_admin", "password": "secret"},
  )

  with pytest.raises(DatabaseConfigurationError, match="DB_HOST"):
    resolve_database_connection_config(
      Settings(database_secret_id="rds-secret", db_name="postgres"),
    )
