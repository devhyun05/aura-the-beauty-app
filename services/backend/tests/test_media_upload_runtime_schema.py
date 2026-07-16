import pytest

import app.main as main_module
from app.db.init_db import POST_SCHEMA_MIGRATIONS
from app.services.media_upload_schema import (
  MEDIA_UPLOAD_SESSIONS_SCHEMA_SQL,
  ensure_media_upload_schema,
)


class FakeDatabase:
  def __init__(self, *, is_connected: bool = True) -> None:
    self.is_connected = is_connected
    self.queries: list[str] = []

  async def execute(self, query: str, *_args) -> str:
    self.queries.append(query)
    return "OK"


@pytest.mark.asyncio
async def test_runtime_schema_uses_idempotent_media_upload_ddl() -> None:
  db = FakeDatabase()

  await ensure_media_upload_schema(db)  # type: ignore[arg-type]
  await ensure_media_upload_schema(db)  # type: ignore[arg-type]

  assert db.queries == [MEDIA_UPLOAD_SESSIONS_SCHEMA_SQL, MEDIA_UPLOAD_SESSIONS_SCHEMA_SQL]
  assert "create table if not exists media_upload_sessions" in MEDIA_UPLOAD_SESSIONS_SCHEMA_SQL
  assert "fk_media_upload_sessions_owner_user" in MEDIA_UPLOAD_SESSIONS_SCHEMA_SQL
  assert "fk_media_upload_sessions_partner_account" in MEDIA_UPLOAD_SESSIONS_SCHEMA_SQL
  assert "fk_media_upload_sessions_media_asset" in MEDIA_UPLOAD_SESSIONS_SCHEMA_SQL
  assert "alter column status set default 'pending'" in MEDIA_UPLOAD_SESSIONS_SCHEMA_SQL
  assert "create index if not exists idx_media_upload_sessions_owner_status" in MEDIA_UPLOAD_SESSIONS_SCHEMA_SQL
  assert "create index if not exists idx_media_upload_sessions_partner_status" in MEDIA_UPLOAD_SESSIONS_SCHEMA_SQL
  assert "create index if not exists idx_media_upload_sessions_pending_expires" in MEDIA_UPLOAD_SESSIONS_SCHEMA_SQL


@pytest.mark.asyncio
async def test_runtime_schema_skips_when_database_is_disconnected() -> None:
  db = FakeDatabase(is_connected=False)

  await ensure_media_upload_schema(db)  # type: ignore[arg-type]

  assert db.queries == []


def test_init_db_reuses_runtime_media_upload_schema_sql() -> None:
  assert POST_SCHEMA_MIGRATIONS['schema.sql:media-upload-sessions-v1'] is MEDIA_UPLOAD_SESSIONS_SCHEMA_SQL


@pytest.mark.asyncio
async def test_app_lifespan_ensures_media_upload_schema_at_startup(monkeypatch) -> None:
  calls: list[str] = []

  async def record(name: str) -> None:
    calls.append(name)

  async def fake_connect() -> None:
    await record("connect")

  async def fake_close() -> None:
    await record("close")

  async def fake_consulting_schema(_db) -> None:
    await record("consulting")

  async def fake_media_upload_schema(_db) -> None:
    await record("media_upload")

  async def fake_media_deletion_schema(_db) -> None:
    await record("media_deletion")

  async def fake_account_deletion_schema(_db) -> None:
    await record("account_deletion")

  async def fake_hair_schema(_db) -> None:
    await record("hair")

  async def fake_flush_search_turn_event_tasks(*, timeout: float) -> int:
    return 0

  monkeypatch.setattr(main_module.database, "connect", fake_connect)
  monkeypatch.setattr(main_module.database, "close", fake_close)
  monkeypatch.setattr(main_module, "ensure_consulting_runtime_schema", fake_consulting_schema)
  monkeypatch.setattr(main_module, "ensure_media_upload_schema", fake_media_upload_schema)
  monkeypatch.setattr(main_module, "ensure_media_deletion_schema", fake_media_deletion_schema)
  monkeypatch.setattr(main_module, "ensure_account_deletion_schema", fake_account_deletion_schema)
  monkeypatch.setattr(main_module, "ensure_hair_schema", fake_hair_schema)

  monkeypatch.setattr(main_module, "resolve_and_validate_snapshot", lambda _settings: object())
  monkeypatch.setattr(main_module, "bind_process_snapshot", lambda _snapshot: None)
  monkeypatch.setattr(main_module, "reset_catalog_cache", lambda: None)
  monkeypatch.setattr(main_module, "flush_search_turn_event_tasks", fake_flush_search_turn_event_tasks)

  app = main_module.create_app()
  async with main_module.lifespan(app):
    await record("yield")

  assert calls == [
    "connect",
    "consulting",
    "media_upload",
    "media_deletion",
    "account_deletion",
    "hair",
    "yield",
    "close",
  ]
