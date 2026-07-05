from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.settings import get_settings
from app.services.auradin_agent.catalog_loader import RUN_DATE, load_mvp_catalog
from app.services.auradin_agent.embedding_client import (
  BedrockEmbeddingClient,
  HashEmbeddingClient,
  build_embedding_client,
)
from app.services.auradin_agent.retrieval_service import _default_vector_index_path
from app.services.auradin_agent.vector_index import EmbeddingVectorIndex


def build_index(*, backend: str, output_path: Path, limit: int | None = None) -> dict[str, object]:
  settings = get_settings()
  catalog = load_mvp_catalog()
  chunks = catalog.chunks[:limit] if limit else catalog.chunks

  if backend == "hash":
    dimension = max(16, min(settings.embedding_dimension, 1024))
    embedding_client = HashEmbeddingClient(dimension=dimension)
    model_label = "hash-fallback"
  elif backend == "bedrock":
    embedding_client = build_embedding_client(settings)
    dimension = settings.embedding_dimension
    model_label = settings.effective_embedding_model_id or "bedrock"
    if not isinstance(embedding_client, BedrockEmbeddingClient):
      model_label = "hash-fallback-no-aws"
  else:
    raise ValueError("backend must be either hash or bedrock")

  index = EmbeddingVectorIndex.build(
    chunks,
    embedding_client=embedding_client,
    metadata={
      "backend": backend,
      "chunkCount": len(chunks),
      "dimension": dimension,
      "modelId": model_label,
      "runDate": RUN_DATE,
    },
  )
  index.save(output_path)

  return {
    "backend": backend,
    "chunkCount": len(chunks),
    "modelId": model_label,
    "outputPath": str(output_path),
  }


def main() -> None:
  parser = argparse.ArgumentParser(
    description="Build the Auradin MVP product knowledge embedding vector index.",
  )
  parser.add_argument("--backend", choices=["hash", "bedrock"], default="hash")
  parser.add_argument("--output", type=Path, default=_default_vector_index_path())
  parser.add_argument("--limit", type=int, default=None)
  args = parser.parse_args()

  print(
    json.dumps(
      build_index(backend=args.backend, output_path=args.output, limit=args.limit),
      ensure_ascii=False,
      indent=2,
      sort_keys=True,
    ),
  )


if __name__ == "__main__":
  main()
