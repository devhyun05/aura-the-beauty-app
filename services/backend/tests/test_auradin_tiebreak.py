"""A2(F4) — 동점 타이브레이크 중립화 회귀.

계약: 동점 순서는 ① 재시작·프로세스와 무관하게 재현되고(SHA-256 고정 다이제스트,
Python hash() 금지 — 프로세스 salt), ② brandName과 무상관이어야 한다.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
import subprocess
import sys

from app.services.auradin_agent.ranking import _stable_tiebreak, rank_candidates


def _tied_items() -> list[dict]:
  # 속성·오퍼 동일 → 최종점수 완전 동점. 브랜드명은 한글 자모 역순(구 정렬이면 'ㅎ' 우선)으로 배치.
  return [
    {
      "id": item_id,
      "brandName": brand,
      "attributes": {},
      "liveOffer": {"priceKrw": 10000, "purchaseUrl": "https://x", "imageUrl": "https://y"},
    }
    for item_id, brand in (("item-a", "힌스"), ("item-b", "3CE"), ("item-c", "롬앤"), ("item-d", "어뮤즈"))
  ]


def _ranked_ids() -> list[str]:
  ranked = rank_candidates(_tied_items(), hard_filters=[], soft_preferences=[])
  scores = {row["score"] for row in ranked}
  assert len(scores) == 1, "픽스처가 동점이 아니면 타이브레이크 검증이 아님"
  return [row["item"]["id"] for row in ranked]


def test_tiebreak_follows_stable_digest_not_brand_name():
  ids = _ranked_ids()
  expected = sorted(
    ("item-a", "item-b", "item-c", "item-d"),
    key=lambda item_id: hashlib.sha256(item_id.encode()).hexdigest()[:16],
    reverse=True,
  )
  assert ids == list(expected)
  # brandName 정렬('힌스' 최우선)과 결과가 다름을 고정 — 상관 제거의 직접 증거.
  brand_order = ["item-a", "item-d", "item-c", "item-b"]
  assert ids != brand_order


def test_tiebreak_is_reproducible_across_processes():
  # PYTHONHASHSEED가 달라도 동일 순서 — hash() 미사용의 실행 증거.
  code = (
    "import runpy;"
    "namespace=runpy.run_path('tests/test_auradin_tiebreak.py');"
    "print(','.join(namespace['_ranked_ids']()))"
  )
  runs = set()
  for seed in ("0", "424242"):
    out = subprocess.run(
      [sys.executable, "-c", code],
      capture_output=True, text=True, check=True,
      env={"PYTHONHASHSEED": seed, "PATH": "/usr/bin:/bin", "AURADIN_RUN_DATE": "20260708"},
      cwd=Path(__file__).resolve().parents[1],
    )
    runs.add(out.stdout.strip())
  assert len(runs) == 1
  assert runs.pop() == ",".join(_ranked_ids())


def test_stable_tiebreak_matches_sha256_prefix():
  assert _stable_tiebreak("naver-123") == hashlib.sha256(b"naver-123").hexdigest()[:16]
