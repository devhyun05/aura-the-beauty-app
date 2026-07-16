import pytest

from app.ops.cleanup_expired_auradin_sessions import (
  cleanup_expired_auradin_sessions,
  find_expired_auradin_sessions,
  print_expired_auradin_session_result,
)
from app.services.auradin_agent import session_manager


class FakeDB:
  def __init__(self) -> None:
    self.execute_queries: list[str] = []
    self.fetch_queries: list[str] = []
    self.fetch_args: list[tuple[object, ...]] = []

  async def execute(self, query: str, *args: object) -> str:
    assert not args
    self.execute_queries.append(" ".join(query.split()))
    return "OK"

  async def fetch(self, query: str, *args: object) -> list[dict[str, str]]:
    self.fetch_queries.append(" ".join(query.split()))
    self.fetch_args.append(args)
    return [{"session_id": "auradin-expired-1"}]


@pytest.mark.asyncio
async def test_find_expired_sessions_only_reads_expired_auradin_rows(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  monkeypatch.setattr(session_manager, "_POSTGRES_TABLE_READY", False)
  db = FakeDB()

  result = await find_expired_auradin_sessions(db)

  assert result.session_ids == ("auradin-expired-1",)
  assert any("create table if not exists auradin_search_sessions" in query for query in db.execute_queries)
  assert any("idx_auradin_search_sessions_expires_at" in query for query in db.execute_queries)
  assert len(db.fetch_queries) == 1
  query = db.fetch_queries[0]
  assert query.startswith("select session_id")
  assert "where expires_at < now()" in query
  assert "user_product_likes" not in query
  assert "products" not in query
  assert "limit $1" in query
  assert db.fetch_args[0] == (500,)


@pytest.mark.asyncio
async def test_cleanup_deletes_only_expired_auradin_rows(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  monkeypatch.setattr(session_manager, "_POSTGRES_TABLE_READY", False)
  db = FakeDB()

  result = await cleanup_expired_auradin_sessions(db)

  assert result.total == 1
  query = db.fetch_queries[0]
  assert query.startswith("with expired as")
  assert "where expires_at < now()" in query
  assert "limit $1" in query
  assert "for update skip locked" in query
  assert "returning sessions.session_id" in query
  assert "user_product_likes" not in query
  assert "products" not in query
  assert db.fetch_args[0] == (500,)


def test_print_result_reports_count_without_dumping_session_ids(capsys) -> None:
  result = type("Result", (), {"total": 2})()

  print_expired_auradin_session_result(result, dry_run=False)

  output = capsys.readouterr().out
  assert "mode=execute" in output
  assert "expired=2" in output
  assert "session_id" not in output
