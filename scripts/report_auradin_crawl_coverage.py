"""AURADIN 브랜드 × 세부 카테고리 커버리지 리포터 (네트워크 없음).

수집된 후보/카탈로그 jsonl을 읽어 브랜드 × 세부 카테고리(subcategory) 채움을 목표 대비 집계하고,
미달 슬롯(gap)을 표로 낸다. Codex가 각 웨이브 후 다음에 무엇을 더 수집해야 할지 판단하는 근거.

subcategory 필드가 없는 과거 데이터는 제목/상품명으로 추론해 버킷팅한다.
`--metric purchasable`는 liveOffer(가격+구매링크+이미지)를 갖춘 서빙 가능 항목만 센다.

사용:
  python scripts/report_auradin_crawl_coverage.py --date 20260708
  python scripts/report_auradin_crawl_coverage.py --input data/auradin/catalog/catalog_items_mvp_20260706.jsonl --metric purchasable
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.auradin_agent.catalog_loader import is_purchasable  # noqa: E402
from app.services.auradin_agent.ranking import normalized_product_key  # noqa: E402
from app.services.auradin_catalog.brand_aliases import BRAND_PRIORITY  # noqa: E402
from app.services.auradin_catalog.category_queries import (  # noqa: E402
  COLLECTABLE_CATEGORIES,
  SUBCATEGORIES,
  SUBCATEGORIES_BY_CATEGORY,
  infer_subcategory,
)


def _display_path(path: Path) -> str:
  try:
    return str(path.resolve().relative_to(REPO_ROOT))
  except ValueError:
    return str(path)


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
  rows: list[dict[str, Any]] = []
  for line in path.read_text(encoding="utf-8").splitlines():
    stripped = line.strip()
    if not stripped:
      continue
    value = json.loads(stripped)
    if isinstance(value, dict):
      rows.append(value)
  return rows


def _brand_of(row: dict[str, Any]) -> str:
  return str(row.get("brandName") or row.get("brandNormalized") or "").strip()


def _title_of(row: dict[str, Any]) -> str:
  return str(row.get("rawTitle") or row.get("productName") or row.get("title") or "").strip()


def _subcategory_of(row: dict[str, Any]) -> str | None:
  existing = row.get("subcategory")
  if isinstance(existing, str) and existing in SUBCATEGORIES:
    return existing
  category = str(row.get("category") or "").strip()
  if category not in SUBCATEGORIES_BY_CATEGORY:
    return None
  return infer_subcategory(category, _title_of(row), str(row.get("query") or ""))


def _counts(rows: list[dict[str, Any]], *, purchasable_only: bool) -> Counter[tuple[str, str]]:
  counts: Counter[tuple[str, str]] = Counter()
  for row in rows:
    if purchasable_only and not is_purchasable(row):
      continue
    brand = _brand_of(row)
    subcategory = _subcategory_of(row)
    if brand and subcategory:
      counts[(brand, subcategory)] += 1
  return counts


def _ordered_brands(rows: list[dict[str, Any]]) -> list[str]:
  present = {_brand_of(row) for row in rows if _brand_of(row)}
  ranked = sorted(present, key=lambda brand: BRAND_PRIORITY.get(brand, 999))
  return ranked


def build_coverage(
  rows: list[dict[str, Any]],
  *,
  target: int,
  minimum: int,
  purchasable_only: bool,
) -> dict[str, Any]:
  counts = _counts(rows, purchasable_only=purchasable_only)
  brands = _ordered_brands(rows) or sorted(BRAND_PRIORITY, key=lambda b: BRAND_PRIORITY[b])
  slots: list[dict[str, Any]] = []
  status_counts: Counter[str] = Counter()

  for brand in brands:
    for category in COLLECTABLE_CATEGORIES:
      for subcategory_id in SUBCATEGORIES_BY_CATEGORY.get(category, ()):
        count = counts.get((brand, subcategory_id), 0)
        if count >= target:
          status = "full"
        elif count >= minimum:
          status = "min_ok"
        elif count > 0:
          status = "partial"
        else:
          status = "empty"
        status_counts[status] += 1
        slots.append(
          {
            "brand": brand,
            "category": category,
            "subcategory": subcategory_id,
            "label": SUBCATEGORIES[subcategory_id]["label"],
            "count": count,
            "target": target,
            "gapToMin": max(0, minimum - count),
            "status": status,
          },
        )

  gap_slots = [slot for slot in slots if slot["gapToMin"] > 0]
  return {
    "target": target,
    "minimum": minimum,
    "metric": "purchasable" if purchasable_only else "count",
    "brands": brands,
    "totalRows": len(rows),
    "bucketedRows": int(sum(counts.values())),
    "statusCounts": dict(sorted(status_counts.items())),
    "belowMinSlots": len(gap_slots),
    "slots": slots,
  }


def _row_id(row: dict[str, Any]) -> str:
  return str(row.get("catalogItemId") or row.get("id") or "").strip()


def _live_offer(row: dict[str, Any]) -> dict[str, Any]:
  value = row.get("liveOffer")
  return value if isinstance(value, dict) else {}


def diff_catalogs(prev_rows: list[dict[str, Any]], next_rows: list[dict[str, Any]]) -> dict[str, Any]:
  """Compare membership as a product-key multiset and mutable fields by row ID."""
  previous_keys = Counter(
    key for row in prev_rows if (key := normalized_product_key(row))
  )
  next_keys = Counter(
    key for row in next_rows if (key := normalized_product_key(row))
  )
  added = sorted((next_keys - previous_keys).elements())
  removed = sorted((previous_keys - next_keys).elements())

  previous_by_id = {_row_id(row): row for row in prev_rows if _row_id(row)}
  next_by_id = {_row_id(row): row for row in next_rows if _row_id(row)}
  shared_ids = previous_by_id.keys() & next_by_id.keys()
  price_changed = 0
  price_tier_moved = 0
  for row_id in shared_ids:
    previous_offer = _live_offer(previous_by_id[row_id])
    next_offer = _live_offer(next_by_id[row_id])
    if previous_offer.get("priceKrw") != next_offer.get("priceKrw"):
      price_changed += 1
    if previous_offer.get("priceTier") != next_offer.get("priceTier"):
      price_tier_moved += 1

  return {
    "added": added,
    "removed": removed,
    "priceChanged": price_changed,
    "priceTierMoved": price_tier_moved,
    "staleCount": sum(1 for row in next_rows if row.get("collectionStatus") == "stale"),
  }


def _write_report(
  path: Path,
  coverage: dict[str, Any],
  *,
  source: str,
  catalog_diff: dict[str, Any] | None = None,
  compare_source: str | None = None,
) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  lines: list[str] = [
    f"# AURADIN 크롤 커버리지 — {source}",
    "",
    f"- metric: **{coverage['metric']}** · 목표 슬롯당 {coverage['target']}개 (최소 {coverage['minimum']})",
    f"- 총 rows: {coverage['totalRows']} · 버킷된 rows: {coverage['bucketedRows']}",
    f"- 슬롯 상태: `{json.dumps(coverage['statusCounts'], ensure_ascii=False)}`",
    f"- 최소 미달 슬롯: **{coverage['belowMinSlots']}**",
    "",
    "## 최소(10) 미달 슬롯 — 추가 수집 대상",
    "",
  ]
  gap_slots = [slot for slot in coverage["slots"] if slot["gapToMin"] > 0]
  if gap_slots:
    lines.append("| 브랜드 | 세부 카테고리 | 라벨 | 현재 | 최소까지 | 상태 |")
    lines.append("|---|---|---|--:|--:|---|")
    for slot in gap_slots:
      lines.append(
        f"| {slot['brand']} | {slot['subcategory']} | {slot['label']} | "
        f"{slot['count']} | {slot['gapToMin']} | {slot['status']} |",
      )
  else:
    lines.append("- 없음 — 모든 슬롯이 최소 목표를 충족.")
  lines.append("")
  if catalog_diff is not None:
    lines.extend(
      [
        "## 스냅샷 diff",
        "",
        f"- 비교 기준: `{compare_source or ''}`",
        f"- `added` 정규화 키(multiset): `{json.dumps(catalog_diff['added'], ensure_ascii=False)}`",
        f"- `removed` 정규화 키(multiset): `{json.dumps(catalog_diff['removed'], ensure_ascii=False)}`",
        f"- `priceChanged` 행(catalogItemId): **{catalog_diff['priceChanged']}**",
        f"- `priceTierMoved` 행(catalogItemId): **{catalog_diff['priceTierMoved']}**",
        f"- `staleCount`: **{catalog_diff['staleCount']}**",
        "",
      ],
    )
  path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Report AURADIN brand x subcategory crawl coverage (no network).")
  parser.add_argument("--input", type=Path, help="집계할 jsonl (기본: mvp 카탈로그).")
  parser.add_argument("--date", default="20260706", help="--input 미지정 시 mvp 카탈로그 날짜.")
  parser.add_argument("--per-subcategory", type=int, default=15)
  parser.add_argument("--min", type=int, default=10, dest="minimum")
  parser.add_argument("--metric", choices=("count", "purchasable"), default="count")
  parser.add_argument("--compare-to", type=Path, help="스냅샷 diff 기준이 되는 이전 catalog jsonl.")
  parser.add_argument("--report", type=Path)
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  input_path = (
    args.input.resolve()
    if args.input
    else REPO_ROOT / "data" / "auradin" / "catalog" / f"catalog_items_mvp_{args.date}.jsonl"
  )
  if not input_path.exists():
    print(f"input not found: {input_path}", file=sys.stderr)
    return 2

  rows = _read_jsonl(input_path)
  compare_path = args.compare_to.resolve() if args.compare_to else None
  if compare_path is not None and not compare_path.exists():
    print(f"compare input not found: {compare_path}", file=sys.stderr)
    return 2
  coverage = build_coverage(
    rows,
    target=args.per_subcategory,
    minimum=args.minimum,
    purchasable_only=args.metric == "purchasable",
  )
  source = _display_path(input_path)
  report_path = args.report or REPO_ROOT / "reports" / "auradin" / f"crawl_coverage_{input_path.stem}.md"
  catalog_diff = diff_catalogs(_read_jsonl(compare_path), rows) if compare_path is not None else None
  compare_source = _display_path(compare_path) if compare_path is not None else None
  _write_report(
    report_path,
    coverage,
    source=source,
    catalog_diff=catalog_diff,
    compare_source=compare_source,
  )

  print(
    json.dumps(
      {
        "source": source,
        "report": _display_path(report_path),
        "metric": coverage["metric"],
        "totalRows": coverage["totalRows"],
        "bucketedRows": coverage["bucketedRows"],
        "statusCounts": coverage["statusCounts"],
        "belowMinSlots": coverage["belowMinSlots"],
        **({"diff": catalog_diff, "compareTo": compare_source} if catalog_diff is not None else {}),
      },
      ensure_ascii=False,
      indent=2,
      sort_keys=True,
    ),
  )
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
