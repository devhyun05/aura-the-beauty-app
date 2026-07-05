from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import json

from .embedding_client import EmbeddingClient


def tokenize(text: str) -> list[str]:
  raw_tokens = re.findall(r"[0-9a-zA-Z가-힣]+", str(text or "").lower())
  tokens: list[str] = []
  for token in raw_tokens:
    if len(token) >= 2:
      tokens.append(token)
  return tokens


class FileVectorIndex:
  def __init__(self, chunks: list[dict[str, Any]]) -> None:
    self.chunks = chunks
    self.chunk_tokens: dict[str, Counter[str]] = {}
    for chunk in chunks:
      chunk_id = str(chunk.get("chunkId") or "")
      self.chunk_tokens[chunk_id] = Counter(tokenize(str(chunk.get("text") or "")))

  def search(self, query_text: str, *, top_k: int = 80) -> dict[str, float]:
    query_tokens = Counter(tokenize(query_text))
    if not query_tokens:
      return {}

    query_norm = math.sqrt(sum(value * value for value in query_tokens.values()))
    scored_chunks: list[tuple[str, str, float]] = []
    for chunk in self.chunks:
      chunk_id = str(chunk.get("chunkId") or "")
      catalog_item_id = str(chunk.get("catalogItemId") or "")
      chunk_tokens = self.chunk_tokens.get(chunk_id, Counter())
      if not chunk_tokens:
        continue

      dot = sum(query_tokens[token] * chunk_tokens.get(token, 0) for token in query_tokens)
      if dot <= 0:
        continue

      chunk_norm = math.sqrt(sum(value * value for value in chunk_tokens.values()))
      score = dot / max(query_norm * chunk_norm, 1e-9)
      chunk_type = str(chunk.get("chunkType") or "")
      if chunk_type == "shade_color":
        score *= 1.08
      elif chunk_type == "finish_texture":
        score *= 1.12
      elif chunk_type == "suitability_claims":
        score *= 1.04
      scored_chunks.append((catalog_item_id, chunk_id, min(1.0, score)))

    scored_chunks.sort(key=lambda row: row[2], reverse=True)
    product_scores: dict[str, list[float]] = defaultdict(list)
    for catalog_item_id, _chunk_id, score in scored_chunks[:top_k]:
      product_scores[catalog_item_id].append(score)

    aggregated: dict[str, float] = {}
    for catalog_item_id, scores in product_scores.items():
      scores.sort(reverse=True)
      aggregated[catalog_item_id] = min(1.0, scores[0] + (0.1 * scores[1] if len(scores) > 1 else 0))
    return aggregated


def load_vector_index_metadata(path: Path) -> dict[str, Any]:
  payload = json.loads(path.read_text(encoding="utf-8"))
  metadata = payload.get("metadata") if isinstance(payload, dict) else {}
  if not isinstance(metadata, dict):
    metadata = {}

  if "dimension" not in metadata:
    vector_rows = payload.get("vectors") if isinstance(payload, dict) else []
    if isinstance(vector_rows, list):
      first_vector = next(
        (
          row.get("vector")
          for row in vector_rows
          if isinstance(row, dict) and isinstance(row.get("vector"), list)
        ),
        None,
      )
      if first_vector:
        metadata = {**metadata, "dimension": len(first_vector)}

  return metadata


def cosine_similarity(left: list[float], right: list[float]) -> float:
  if not left or not right:
    return 0.0

  size = min(len(left), len(right))
  dot = sum(left[index] * right[index] for index in range(size))
  left_norm = math.sqrt(sum(value * value for value in left[:size]))
  right_norm = math.sqrt(sum(value * value for value in right[:size]))
  if left_norm <= 0 or right_norm <= 0:
    return 0.0

  return dot / max(left_norm * right_norm, 1e-9)


class EmbeddingVectorIndex:
  def __init__(
    self,
    *,
    chunks: list[dict[str, Any]],
    chunk_vectors: dict[str, list[float]],
    embedding_client: EmbeddingClient,
    metadata: dict[str, Any] | None = None,
  ) -> None:
    self.chunks = chunks
    self.chunk_vectors = chunk_vectors
    self.embedding_client = embedding_client
    self.metadata = metadata or {}

  @classmethod
  def build(
    cls,
    chunks: list[dict[str, Any]],
    *,
    embedding_client: EmbeddingClient,
    metadata: dict[str, Any] | None = None,
  ) -> "EmbeddingVectorIndex":
    chunk_vectors: dict[str, list[float]] = {}
    for chunk in chunks:
      chunk_id = str(chunk.get("chunkId") or "")
      if not chunk_id:
        continue
      chunk_vectors[chunk_id] = embedding_client.embed_text(str(chunk.get("text") or ""))

    return cls(
      chunks=chunks,
      chunk_vectors=chunk_vectors,
      embedding_client=embedding_client,
      metadata=metadata,
    )

  @classmethod
  def load(
    cls,
    path: Path,
    *,
    chunks: list[dict[str, Any]],
    embedding_client: EmbeddingClient,
  ) -> "EmbeddingVectorIndex":
    payload = json.loads(path.read_text(encoding="utf-8"))
    vector_rows = payload.get("vectors") if isinstance(payload, dict) else []
    chunk_vectors: dict[str, list[float]] = {}
    if isinstance(vector_rows, list):
      for row in vector_rows:
        if not isinstance(row, dict):
          continue
        chunk_id = str(row.get("chunkId") or "")
        vector = row.get("vector")
        if chunk_id and isinstance(vector, list):
          chunk_vectors[chunk_id] = [float(value) for value in vector]

    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    return cls(
      chunks=chunks,
      chunk_vectors=chunk_vectors,
      embedding_client=embedding_client,
      metadata=metadata,
    )

  def save(self, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
      "metadata": self.metadata,
      "vectors": [
        {
          "chunkId": chunk_id,
          "vector": vector,
        }
        for chunk_id, vector in sorted(self.chunk_vectors.items())
      ],
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True), encoding="utf-8")

  def search(self, query_text: str, *, top_k: int = 80) -> dict[str, float]:
    query_vector = self.embedding_client.embed_text(query_text)
    if not query_vector:
      return {}

    scored_chunks: list[tuple[str, str, float]] = []
    for chunk in self.chunks:
      chunk_id = str(chunk.get("chunkId") or "")
      catalog_item_id = str(chunk.get("catalogItemId") or "")
      chunk_vector = self.chunk_vectors.get(chunk_id)
      if not catalog_item_id or not chunk_vector:
        continue

      score = cosine_similarity(query_vector, chunk_vector)
      if score <= 0:
        continue
      scored_chunks.append((catalog_item_id, chunk_id, min(1.0, score)))

    scored_chunks.sort(key=lambda row: row[2], reverse=True)
    product_scores: dict[str, list[float]] = defaultdict(list)
    for catalog_item_id, _chunk_id, score in scored_chunks[:top_k]:
      product_scores[catalog_item_id].append(score)

    aggregated: dict[str, float] = {}
    for catalog_item_id, scores in product_scores.items():
      scores.sort(reverse=True)
      aggregated[catalog_item_id] = min(1.0, scores[0] + (0.1 * scores[1] if len(scores) > 1 else 0))

    return aggregated
