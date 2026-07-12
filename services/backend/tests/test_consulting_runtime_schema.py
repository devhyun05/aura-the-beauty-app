import pytest

from app.services.consulting_schema import ensure_consulting_runtime_schema


class FakeDatabase:
  is_connected = True

  def __init__(self) -> None:
    self.query = ""

  async def execute(self, query: str, *_args) -> str:
    self.query = query
    return "OK"


@pytest.mark.asyncio
async def test_runtime_schema_guarantees_conversation_lifecycle_columns() -> None:
  db = FakeDatabase()

  await ensure_consulting_runtime_schema(db)  # type: ignore[arg-type]

  assert "add column if not exists conversation_id uuid" in db.query
  assert "add column if not exists customer_left_at timestamptz" in db.query
  assert "add column if not exists expert_left_at timestamptz" in db.query
  assert "alter column conversation_id set not null" in db.query
  assert "idx_consulting_bookings_open_conversation" in db.query
