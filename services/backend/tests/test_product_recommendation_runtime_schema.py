import pytest

from app.services.product_recommendation_schema import ensure_product_recommendation_runtime_schema


class _Context:
  def __init__(self, value) -> None:
    self.value = value

  async def __aenter__(self):
    return self.value

  async def __aexit__(self, *_args):
    return None


class _Connection:
  def __init__(
    self,
    *,
    likes_definition: str | None,
    source_definition: str | None = None,
    external_definition: str | None = None,
    likes_table_exists: bool = True,
    events_table_exists: bool = True,
  ) -> None:
    self.likes_definition = likes_definition
    self.source_definition = source_definition
    self.external_definition = external_definition
    self.likes_table_exists = likes_table_exists
    self.events_table_exists = events_table_exists
    self.executed: list[str] = []

  def transaction(self):
    return _Context(self)

  async def fetchval(self, query: str):
    if "to_regclass('public.external_product_likes')" in query:
      return self.likes_table_exists
    if "to_regclass('public.product_engagement_events')" in query:
      return self.events_table_exists
    if "conrelid='external_product_likes'" in query:
      return self.likes_definition
    if "conname='chk_product_engagement_source'" in query:
      return self.source_definition
    if "conname='chk_product_engagement_external_source'" in query:
      return self.external_definition
    raise AssertionError(f"Unexpected query: {query}")

  async def execute(self, query: str):
    self.executed.append(query)
    return "OK"


class _Pool:
  def __init__(self, connection: _Connection) -> None:
    self.connection = connection

  def acquire(self):
    return _Context(self.connection)


class _Database:
  is_connected = True

  def __init__(self, connection: _Connection) -> None:
    self.connection = connection
    self.pool = _Pool(self.connection)


@pytest.mark.asyncio
async def test_runtime_schema_adds_catalog_source_and_external_event_identity() -> None:
  connection = _Connection(
    likes_definition="CHECK ((external_source = 'naver_shopping_search'::text))",
    source_definition="CHECK (((event_type = 'search_submit') OR (product_id IS NOT NULL)))",
  )
  db = _Database(connection)

  await ensure_product_recommendation_runtime_schema(db)  # type: ignore[arg-type]

  executed = "\n".join(connection.executed)
  assert "lock table external_product_likes" in executed
  assert "'auradin_catalog'" in executed
  assert "insert into external_product_likes" in executed
  assert "external_product_id like 'auradin-seed-%'" in executed
  assert "delete from external_product_likes" in executed
  assert "add column if not exists external_source text" in executed
  assert "external_product_id is not null" in executed
  assert "chk_product_engagement_external_source" in executed
  assert "idx_product_engagement_external_product_type" in executed


@pytest.mark.asyncio
async def test_runtime_schema_does_not_replace_current_constraints() -> None:
  connection = _Connection(
    likes_definition=(
      "CHECK ((external_source = ANY "
      "(ARRAY['naver_shopping_search','auradin_search','auradin_catalog'])))"
    ),
    source_definition=(
      "CHECK (((event_type = 'search_submit' AND product_id IS NULL AND shade_id IS NULL "
      "AND external_source IS NULL AND external_product_id IS NULL) OR "
      "(event_type <> 'search_submit' AND product_id IS NOT NULL)))"
    ),
    external_definition=(
      "CHECK ((external_source = ANY "
      "(ARRAY['naver_shopping_search','auradin_search','auradin_catalog'])))"
    ),
  )
  db = _Database(connection)

  await ensure_product_recommendation_runtime_schema(db)  # type: ignore[arg-type]

  executed = "\n".join(connection.executed)
  assert "drop constraint" not in executed
  assert "add column if not exists external_source text" in executed
  assert "idx_product_engagement_external_product_type" in executed


@pytest.mark.asyncio
async def test_runtime_schema_skips_tables_that_do_not_exist() -> None:
  connection = _Connection(
    likes_definition=None,
    likes_table_exists=False,
    events_table_exists=False,
  )
  db = _Database(connection)

  await ensure_product_recommendation_runtime_schema(db)  # type: ignore[arg-type]

  assert connection.executed == []
