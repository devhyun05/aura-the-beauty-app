from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.settings import get_settings
from app.services.auradin_agent.catalog_loader import read_jsonl
from app.services.auradin_agent.embedding_client import (
  BedrockEmbeddingClient,
  HashEmbeddingClient,
  build_embedding_client,
)
from app.services.auradin_agent.vector_index import EmbeddingVectorIndex


def build_index(
  *,
  run_date: str,
  backend: str,
  catalog_path: Path,
  chunks_path: Path,
  output_path: Path,
  limit: int | None = None,
) -> dict[str, object]:
  settings = get_settings()
  catalog_rows = read_jsonl(catalog_path)
  chunks = read_jsonl(chunks_path)
  if not catalog_rows or not chunks:
    raise ValueError("catalog/chunk staging artifacts must be non-empty")
  catalog_ids = {str(row.get("id") or "") for row in catalog_rows}
  chunk_catalog_ids = {str(row.get("catalogItemId") or "") for row in chunks}
  if "" in catalog_ids or "" in chunk_catalog_ids or catalog_ids != chunk_catalog_ids:
    raise ValueError("catalog/chunk ID sets differ")
  if limit:
    chunks = chunks[:limit]

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
      "runDate": run_date,
    },
  )
  index.save(output_path)

  return {
    "backend": backend,
    "chunkCount": len(chunks),
    "modelId": model_label,
    "runDate": run_date,
    "catalogPath": str(catalog_path),
    "chunksPath": str(chunks_path),
    "outputPath": str(output_path),
  }


def main() -> None:
  parser = argparse.ArgumentParser(
    description="Build the Auradin MVP product knowledge embedding vector index.",
  )
  parser.add_argument("--run-date", required=True)
  parser.add_argument("--backend", choices=["hash", "bedrock"], default="hash")
  parser.add_argument("--catalog-path", type=Path, required=True)
  parser.add_argument("--chunks-path", type=Path, required=True)
  parser.add_argument("--output-path", "--output", dest="output_path", type=Path, required=True)
  parser.add_argument("--limit", type=int, default=None)
  args = parser.parse_args()
  env_run_date = os.environ.get("AURADIN_RUN_DATE")
  if env_run_date and env_run_date != args.run_date:
    parser.error("AURADIN_RUN_DATE must match --run-date when provided")
  if args.run_date not in args.output_path.name:
    parser.error("--output-path filename must carry --run-date")

  print(
    json.dumps(
      build_index(
        run_date=args.run_date,
        backend=args.backend,
        catalog_path=args.catalog_path,
        chunks_path=args.chunks_path,
        output_path=args.output_path,
        limit=args.limit,
      ),
      ensure_ascii=False,
      indent=2,
      sort_keys=True,
    ),
  )


if __name__ == "__main__":
  main()
