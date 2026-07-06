from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from .knowledge_chunk_builder import build_knowledge_chunks, build_mvp_catalog


# Refined seed (deduped to unique products, calibrated hard-filter attributes).
# Override with AURADIN_RUN_DATE to serve a different snapshot (e.g. 20260703).
RUN_DATE = os.environ.get("AURADIN_RUN_DATE", "20260706")


def _resolve_data_root() -> Path:
  """`data/auradin`를 담은 루트를 찾는다 — 체크아웃 깊이·컨테이너 레이아웃 무관.

  기존 `parents[5]`는 repo 레이아웃 깊이에 하드코딩돼 컨테이너(`/app/app/...`)에서
  IndexError로 import를 깨뜨렸다(로컬만 통과, 배포는 검색 전멸). 이제:
  1) `AURADIN_DATA_ROOT` env가 있으면 그 밑(`<root>/data/auradin`)을 쓴다 (Docker에서 지정).
  2) 없으면 이 파일에서 위로 올라가며 `data/auradin`이 있는 첫 디렉터리를 repo root로 삼는다.
  """
  env_root = os.environ.get("AURADIN_DATA_ROOT")
  if env_root:
    return Path(env_root)
  here = Path(__file__).resolve()
  for parent in here.parents:
    if (parent / "data" / "auradin").is_dir():
      return parent
  # 폴백: services/backend/app/services/auradin_agent → services/backend 위(=repo)로 근사.
  return here.parents[min(5, len(here.parents) - 1)]


REPO_ROOT = _resolve_data_root()
SEED_CATALOG_PATH = REPO_ROOT / "data" / "auradin" / "catalog" / f"catalog_items_seed_{RUN_DATE}.jsonl"
MVP_CATALOG_PATH = REPO_ROOT / "data" / "auradin" / "catalog" / f"catalog_items_mvp_{RUN_DATE}.jsonl"
MVP_CHUNK_PATH = (
  REPO_ROOT
  / "data"
  / "auradin"
  / "knowledge"
  / f"product_knowledge_chunks_mvp_{RUN_DATE}.jsonl"
)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
  rows: list[dict[str, Any]] = []
  if not path.exists():
    return rows

  for line in path.read_text(encoding="utf-8").splitlines():
    if not line.strip():
      continue
    rows.append(json.loads(line))
  return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(
    "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
    encoding="utf-8",
  )


def is_purchasable(item: dict[str, Any]) -> bool:
  live_offer = item.get("liveOffer") if isinstance(item.get("liveOffer"), dict) else {}
  return bool(
    int(live_offer.get("priceKrw") or 0) > 0
    and str(live_offer.get("purchaseUrl") or "").strip()
    and str(live_offer.get("imageUrl") or "").strip()
  )


class AuradinCatalog:
  def __init__(self, items: list[dict[str, Any]], chunks: list[dict[str, Any]] | None = None) -> None:
    self.items = [item for item in items if is_purchasable(item)]
    self.chunks = chunks or []
    self.by_id = {item["id"]: item for item in self.items}

  def get(self, item_id: str) -> dict[str, Any] | None:
    return self.by_id.get(item_id)

  def by_ids(self, item_ids: list[str]) -> list[dict[str, Any]]:
    return [item for item_id in item_ids if (item := self.by_id.get(item_id))]


def load_mvp_catalog(
  catalog_path: Path = MVP_CATALOG_PATH,
  seed_path: Path = SEED_CATALOG_PATH,
  chunk_path: Path = MVP_CHUNK_PATH,
) -> AuradinCatalog:
  items = read_jsonl(catalog_path)
  if not items:
    items = build_mvp_catalog(read_jsonl(seed_path))

  chunks = read_jsonl(chunk_path)
  if not chunks:
    chunks = build_knowledge_chunks(items)

  return AuradinCatalog(items, chunks)


@lru_cache(maxsize=1)
def get_catalog() -> AuradinCatalog:
  return load_mvp_catalog()


def reset_catalog_cache() -> None:
  get_catalog.cache_clear()

