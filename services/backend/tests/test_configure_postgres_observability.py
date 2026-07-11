from __future__ import annotations

from collections.abc import Mapping

import pytest

import app.ops.configure_postgres_observability as observability_module
from app.ops.configure_postgres_observability import configure_postgres_observability, run


class FakeDB:
  def __init__(self, row: Mapping[str, object] | None) -> None:
    self.row = row
    self.executed_queries: list[str] = []
    self.fetch_queries: list[str] = []
    self.closed = False

  async def execute(self, query: str) -> None:
    self.executed_queries.append(" ".join(query.split()))

  async def fetchrow(self, query: str) -> Mapping[str, object] | None:
    self.fetch_queries.append(" ".join(query.split()))
    return self.row

  async def close(self) -> None:
    self.closed = True


def status_row() -> dict[str, object]:
  return {
    "extname": "pg_stat_statements",
    "extversion": "1.11",
    "shared_preload_libraries": "rdsutils,pg_stat_statements",
    "track_io_timing": "on",
    "tracked_statement_count": 42,
  }


@pytest.mark.asyncio
async def test_configure_installs_and_verifies_pg_stat_statements() -> None:
  db = FakeDB(status_row())

  result = await configure_postgres_observability(db)

  assert db.executed_queries == ["create extension if not exists pg_stat_statements"]
  assert "from pg_extension" in db.fetch_queries[0]
  assert "from pg_stat_statements" in db.fetch_queries[0]
  assert result.extension_name == "pg_stat_statements"
  assert result.tracked_statement_count == 42


@pytest.mark.asyncio
async def test_configure_fails_when_extension_is_not_visible() -> None:
  db = FakeDB(None)

  with pytest.raises(RuntimeError, match="was not installed"):
    await configure_postgres_observability(db)


@pytest.mark.asyncio
async def test_run_closes_database_connection(monkeypatch: pytest.MonkeyPatch) -> None:
  db = FakeDB(status_row())

  async def fake_connect_database() -> tuple[FakeDB, object]:
    return db, object()

  monkeypatch.setattr(observability_module, "connect_database", fake_connect_database)

  result = await run()

  assert result == 0
  assert db.closed is True
