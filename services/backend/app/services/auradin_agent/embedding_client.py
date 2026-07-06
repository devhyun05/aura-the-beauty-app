from __future__ import annotations

import hashlib
import json
import math
from typing import Any

from app.core.settings import Settings


class EmbeddingClient:
  def embed_text(self, text: str) -> list[float]:
    raise NotImplementedError


class HashEmbeddingClient(EmbeddingClient):
  def __init__(self, dimension: int = 128) -> None:
    self.dimension = dimension

  def embed_text(self, text: str) -> list[float]:
    vector = [0.0] * self.dimension
    for token in str(text or "").lower().split():
      digest = hashlib.sha256(token.encode("utf-8")).digest()
      index = int.from_bytes(digest[:4], "big") % self.dimension
      sign = 1.0 if digest[4] % 2 == 0 else -1.0
      vector[index] += sign

    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


class BedrockEmbeddingClient(EmbeddingClient):
  def __init__(
    self,
    *,
    model_id: str,
    region_name: str,
    aws_access_key_id: str | None = None,
    aws_secret_access_key: str | None = None,
    profile_name: str | None = None,
    use_iam_role: bool = False,
    fallback: EmbeddingClient | None = None,
  ) -> None:
    self.model_id = model_id.strip()
    self.region_name = region_name.strip()
    self.aws_access_key_id = aws_access_key_id
    self.aws_secret_access_key = aws_secret_access_key
    self.profile_name = profile_name
    self.use_iam_role = use_iam_role
    self.fallback = fallback or HashEmbeddingClient()
    self._runtime_client: Any | None = None

  def _client(self) -> Any:
    import boto3

    if self._runtime_client is not None:
      return self._runtime_client

    if self.profile_name:
      self._runtime_client = boto3.Session(profile_name=self.profile_name).client(
        "bedrock-runtime",
        region_name=self.region_name,
      )
      return self._runtime_client

    kwargs: dict[str, Any] = {"region_name": self.region_name}
    if self.aws_access_key_id and self.aws_secret_access_key and not self.use_iam_role:
      kwargs.update(
        {
          "aws_access_key_id": self.aws_access_key_id,
          "aws_secret_access_key": self.aws_secret_access_key,
        },
      )

    self._runtime_client = boto3.client("bedrock-runtime", **kwargs)
    return self._runtime_client

  def _build_body(self, text: str) -> dict[str, Any]:
    if self.model_id.startswith("cohere.embed"):
      return {
        "texts": [text],
        "input_type": "search_document",
        "truncate": "END",
      }

    return {"inputText": text}

  def _parse_embedding(self, payload: dict[str, Any]) -> list[float] | None:
    embedding = payload.get("embedding")
    if isinstance(embedding, list) and embedding:
      return [float(value) for value in embedding]

    embeddings = payload.get("embeddings")
    if isinstance(embeddings, list) and embeddings and isinstance(embeddings[0], list):
      return [float(value) for value in embeddings[0]]

    return None

  def embed_text(self, text: str) -> list[float]:
    normalized_text = str(text or "").strip()
    if not self.model_id or not normalized_text:
      return self.fallback.embed_text(text)

    try:
      response = self._client().invoke_model(
        modelId=self.model_id,
        body=json.dumps(self._build_body(normalized_text), ensure_ascii=False),
        accept="application/json",
        contentType="application/json",
      )
      payload = json.loads(response["body"].read())
      embedding = self._parse_embedding(payload)
      if embedding:
        return embedding
    except Exception:
      return self.fallback.embed_text(text)

    return self.fallback.embed_text(text)


def build_embedding_client(settings: Settings) -> EmbeddingClient:
  fallback = HashEmbeddingClient(dimension=max(16, min(settings.embedding_dimension, 1024)))
  if not settings.effective_embedding_model_id or not settings.aws_credentials_configured:
    return fallback

  return BedrockEmbeddingClient(
    model_id=settings.effective_embedding_model_id,
    region_name=settings.effective_bedrock_embedding_region,
    aws_access_key_id=settings.aws_access_key_id,
    aws_secret_access_key=settings.aws_secret_access_key,
    profile_name=settings.aws_profile_name,
    use_iam_role=settings.aws_use_iam_role,
    fallback=fallback,
  )
