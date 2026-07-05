import json

import pytest

from app.core.settings import Settings
from app.services.auradin_agent.embedding_client import BedrockEmbeddingClient, HashEmbeddingClient
from app.services.auradin_agent.retrieval_service import build_semantic_scores
from app.services.auradin_agent.session_manager import (
  clear_sessions,
  create_session_persisted,
  get_session_persisted,
)
from app.services.auradin_agent.vector_index import EmbeddingVectorIndex


class FakeBedrockBody:
  def __init__(self, payload: dict) -> None:
    self.payload = payload

  def read(self) -> bytes:
    return json.dumps(self.payload).encode("utf-8")


class FakeBedrockRuntime:
  def __init__(self) -> None:
    self.request: dict | None = None

  def invoke_model(self, **kwargs):
    self.request = kwargs
    return {"body": FakeBedrockBody({"embedding": [0.25, 0.75]})}


class FakeDb:
  is_connected = True

  def __init__(self) -> None:
    self.rows: dict[str, dict] = {}

  async def execute(self, _query: str, *args):
    if args:
      self.rows[str(args[0])] = json.loads(args[1])
    return "OK"

  async def fetchrow(self, _query: str, *args):
    state = self.rows.get(str(args[0]))
    return {"state": state} if state else None


def test_bedrock_embedding_client_uses_titan_body_and_parses_embedding() -> None:
  runtime = FakeBedrockRuntime()
  client = BedrockEmbeddingClient(
    model_id="amazon.titan-embed-text-v2:0",
    region_name="ap-northeast-2",
    aws_access_key_id="AKIAEXAMPLE",
    aws_secret_access_key="secret",
    fallback=HashEmbeddingClient(dimension=4),
  )
  client._runtime_client = runtime

  embedding = client.embed_text("글로시 핑크 립")

  assert embedding == [0.25, 0.75]
  assert runtime.request is not None
  assert runtime.request["modelId"] == "amazon.titan-embed-text-v2:0"
  assert json.loads(runtime.request["body"]) == {"inputText": "글로시 핑크 립"}


def test_settings_accept_aws_profile_as_credential_source() -> None:
  settings = Settings(aws_profile_name="aura-dev")

  status = settings.public_config_status()

  assert settings.aws_credentials_configured is True
  assert settings.aws_credential_source == "profile"
  assert status["items"]["awsCredentialsOrRole"]["source"] == "profile"


def test_hash_vector_index_uses_hash_query_even_when_aws_is_configured(
  tmp_path,
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  chunks = [
    {
      "catalogItemId": "product-1",
      "chunkId": "chunk-1",
      "text": "glossy pink lip tint",
    },
  ]
  index_path = tmp_path / "index.json"
  EmbeddingVectorIndex.build(
    chunks,
    embedding_client=HashEmbeddingClient(dimension=32),
    metadata={"backend": "hash", "dimension": 32, "modelId": "hash-fallback"},
  ).save(index_path)

  def fail_if_bedrock_client_is_built(_settings):
    raise AssertionError("Bedrock client should not be used with a hash vector index.")

  monkeypatch.setattr(
    "app.services.auradin_agent.retrieval_service.build_embedding_client",
    fail_if_bedrock_client_is_built,
  )

  scores, backend = build_semantic_scores(
    type("Catalog", (), {"chunks": chunks})(),
    "glossy pink",
    settings=Settings(
      auradin_vector_index_path=str(index_path),
      aws_access_key_id="AKIAEXAMPLE",
      aws_secret_access_key="secret",
      bedrock_embedding_model_id="amazon.titan-embed-text-v2:0",
    ),
  )

  assert backend == "embedding_file_hash"
  assert scores["product-1"] > 0


@pytest.mark.asyncio
async def test_postgres_session_store_can_restore_search_state() -> None:
  clear_sessions()
  db = FakeDb()
  settings = Settings(
    auradin_session_store="postgres",
    database_url="postgres://example",
  )

  created = await create_session_persisted(
    prompt="데일리로 쓸 만한 제품 추천해줘",
    settings=settings,
    db=db,
  )
  session_id = created["sessionId"]

  clear_sessions()
  restored = await get_session_persisted(session_id, settings=settings, db=db)

  assert restored is not None
  assert restored["sessionId"] == session_id
  assert restored["phase"] == "question"
