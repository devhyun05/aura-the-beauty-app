import json
import sys
from pathlib import Path

import pytest

import scripts.merge_auradin_seed_supplement as merger


def _row(item_id: str, brand: str, product: str) -> dict:
  return {
    "catalogItemId": item_id,
    "brandName": brand,
    "productName": product,
  }


def _write(path: Path, rows: list[dict], *, formatted: bool = False) -> list[str]:
  lines = [
    json.dumps(row, ensure_ascii=False, separators=(", ", ": ") if formatted else (",", ":"))
    for row in rows
  ]
  path.write_text("".join(f"{line}\n" for line in lines), encoding="utf-8")
  return lines


def test_merge_preserves_base_row_text_and_allows_legacy_internal_duplicates(tmp_path: Path) -> None:
  base = tmp_path / "base.jsonl"
  supplement = tmp_path / "supplement.jsonl"
  output = tmp_path / "merged.jsonl"
  report = tmp_path / "report.md"
  base_lines = _write(
    base,
    [
      _row("legacy-1", "기존", "같은 상품"),
      _row("legacy-2", "기존", "같은 상품"),
    ],
    formatted=True,
  )
  _write(supplement, [_row("new-1", "신규", "새 상품")])

  summary = merger.merge_seed_files(
    base_seed=base,
    supplement=supplement,
    output=output,
    report=report,
  )

  assert output.read_text(encoding="utf-8").splitlines()[:2] == base_lines
  assert summary["baseCount"] == 2
  assert summary["supplementCount"] == 1
  assert summary["mergedCount"] == 3
  assert "New-involved ID/key collisions: `0`" in report.read_text(encoding="utf-8")


def test_merge_main_returns_one_for_id_collision(tmp_path: Path, monkeypatch) -> None:
  base = tmp_path / "base.jsonl"
  supplement = tmp_path / "supplement.jsonl"
  _write(base, [_row("same", "기존", "상품 A")])
  _write(supplement, [_row("same", "신규", "상품 B")])
  monkeypatch.setattr(
    sys,
    "argv",
    [
      "merge",
      "--base-seed",
      str(base),
      "--supplement",
      str(supplement),
      "--output",
      str(tmp_path / "out.jsonl"),
      "--report",
      str(tmp_path / "report.md"),
    ],
  )

  assert merger.main() == 1


def test_merge_rejects_new_to_base_and_new_to_new_collisions() -> None:
  base = [_row("base", "브랜드", "상품 A")]

  colliding_supplements = (
    [_row("new", "브랜드", "상품 A")],  # 신규↔기존 정규화 키 충돌
    [
      _row("new-1", "신규", "상품 B"),  # 신규↔신규 정규화 키 충돌
      _row("new-2", "신규", "상품 B"),
    ],
    [
      _row("dup-id", "신규A", "상품 C"),  # 신규↔신규 catalogItemId 충돌
      _row("dup-id", "신규B", "상품 D"),
    ],
  )
  for supplement_rows in colliding_supplements:
    with pytest.raises(merger.SeedMergeError):
      merger.validate_supplement_collisions(base, supplement_rows)
