from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.auradin_catalog.brand_aliases import BRAND_PRIORITY  # noqa: E402
from app.services.auradin_catalog.category_queries import (  # noqa: E402
  COLLECTABLE_CATEGORIES,
  DEFAULT_CATEGORY_QUERIES,
)
from app.services.auradin_catalog.enrichment_queue import (  # noqa: E402
  build_brand_category_top_queue,
)
from app.services.auradin_catalog.quality import validate_enrichment_queue  # noqa: E402


def _default_run_date() -> str:
  return (datetime.now(tz=UTC) + timedelta(hours=9)).strftime("%Y%m%d")


def _default_fetched_at(run_date: str) -> str:
  return f"{run_date[:4]}-{run_date[4:6]}-{run_date[6:8]}T00:00:00+09:00"


def _split_csv(value: str | None) -> list[str] | None:
  if not value:
    return None

  items = [item.strip() for item in value.split(",") if item.strip()]

  return items or None


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
  rows: list[dict[str, Any]] = []

  for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
    stripped = line.strip()

    if not stripped:
      continue

    value = json.loads(stripped)

    if not isinstance(value, dict):
      raise ValueError(f"Expected JSON object at {path}:{line_number}")

    rows.append(value)

  return rows


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(
    "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
    encoding="utf-8",
  )


def _ordered_brands(brands: list[str] | None) -> list[str]:
  return sorted(
    brands or list(BRAND_PRIORITY),
    key=lambda brand: BRAND_PRIORITY.get(brand, 999),
  )


def _coverage_rows(
  candidates: list[dict[str, Any]],
  queue_rows: list[dict[str, Any]],
  *,
  brands: list[str],
  categories: list[str],
  top_n: int,
) -> list[dict[str, Any]]:
  candidate_counts = Counter(
    (
      str(row.get("brandNormalized") or ""),
      str(row.get("category") or ""),
    )
    for row in candidates
  )
  queued_counts = Counter(
    (
      str(row.get("brand") or ""),
      str(row.get("category") or ""),
    )
    for row in queue_rows
  )
  rows: list[dict[str, Any]] = []

  for brand in brands:
    for category in categories:
      candidate_count = candidate_counts[(brand, category)]
      queued_count = queued_counts[(brand, category)]
      gap = max(0, top_n - queued_count)
      status = "ready" if gap == 0 else "partial" if queued_count else "missing"
      queries = [template.format(brand=brand) for template in DEFAULT_CATEGORY_QUERIES.get(category, ())]
      rows.append(
        {
          "brand": brand,
          "category": category,
          "candidateCount": candidate_count,
          "queuedCount": queued_count,
          "targetCount": top_n,
          "gap": gap,
          "status": status,
          "recommendedQueries": " | ".join(queries),
        },
      )

  return rows


def _write_coverage_csv(path: Path, coverage_rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  fieldnames = [
    "brand",
    "category",
    "candidateCount",
    "queuedCount",
    "targetCount",
    "gap",
    "status",
    "recommendedQueries",
  ]

  with path.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(coverage_rows)


def _write_summary(
  path: Path,
  *,
  input_path: Path,
  queue_path: Path,
  coverage_path: Path,
  candidates: list[dict[str, Any]],
  queue_rows: list[dict[str, Any]],
  coverage_rows: list[dict[str, Any]],
  top_n: int,
  quality: dict[str, Any],
) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  status_counts = Counter(str(row["status"]) for row in coverage_rows)
  target_rows = len(coverage_rows) * top_n
  total_gap = sum(int(row["gap"]) for row in coverage_rows)
  category_counts = Counter(str(row.get("category") or "") for row in queue_rows)
  lines = [
    f"# Auradin Brand x Category Top{top_n} Queue Summary",
    "",
    f"- Input candidates: `{input_path}`",
    f"- Output queue: `{queue_path}`",
    f"- Coverage CSV: `{coverage_path}`",
    f"- Candidate rows read: {len(candidates)}",
    f"- Target slots: {len(coverage_rows)}",
    f"- Target rows: {target_rows}",
    f"- Queue rows built: {len(queue_rows)}",
    f"- Remaining gap rows: {total_gap}",
    f"- Slot status counts: `{json.dumps(dict(sorted(status_counts.items())), ensure_ascii=False)}`",
    f"- Queue category counts: `{json.dumps(dict(sorted(category_counts.items())), ensure_ascii=False)}`",
    f"- Queue quality passed: `{quality['passed']}`",
    "",
    "Underfilled slots:",
    "",
  ]
  underfilled = [row for row in coverage_rows if int(row["gap"]) > 0]

  if underfilled:
    lines.extend(
      f"- {row['brand']} / {row['category']}: queued {row['queuedCount']}/{top_n}, "
      f"gap {row['gap']}, queries `{row['recommendedQueries']}`"
      for row in underfilled
    )
  else:
    lines.append("- None")

  lines.extend(
    [
      "",
      "Safety notes:",
      "",
      "- This command only reshapes already-collected Naver candidate metadata.",
      "- No product detail HTML, raw reviews, or original images are stored.",
      "- Detail extraction must run as a separate Phase D command.",
    ],
  )
  path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Build an Auradin brand x category top-N enrichment queue from product candidates.",
  )
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument("--input", type=Path)
  parser.add_argument("--output", type=Path)
  parser.add_argument("--coverage-csv", type=Path)
  parser.add_argument("--report", type=Path)
  parser.add_argument("--top-n", type=int, default=10)
  parser.add_argument("--brands")
  parser.add_argument("--categories")

  return parser.parse_args()


def main() -> int:
  args = parse_args()

  if args.top_n <= 0:
    print("--top-n must be greater than 0", file=sys.stderr)
    return 2

  input_path = (
    args.input
    or REPO_ROOT / "data" / "auradin" / "processed" / f"product_candidates_{args.date}.jsonl"
  )
  output_path = (
    args.output
    or REPO_ROOT
    / "data"
    / "auradin"
    / "processed"
    / f"enrichment_queue_brand_category_top{args.top_n}_{args.date}.jsonl"
  )
  coverage_path = (
    args.coverage_csv
    or REPO_ROOT / "reports" / "auradin" / f"brand_category_top{args.top_n}_coverage_{args.date}.csv"
  )
  report_path = (
    args.report
    or REPO_ROOT / "reports" / "auradin" / f"brand_category_top{args.top_n}_queue_{args.date}.md"
  )
  brands = _ordered_brands(_split_csv(args.brands))
  categories = _split_csv(args.categories) or list(COLLECTABLE_CATEGORIES)
  candidates = _read_jsonl(input_path)
  queue_rows = build_brand_category_top_queue(
    candidates,
    fetched_at=_default_fetched_at(args.date),
    per_group_limit=args.top_n,
    brands=brands,
    categories=categories,
  )
  coverage_rows = _coverage_rows(
    candidates,
    queue_rows,
    brands=brands,
    categories=categories,
    top_n=args.top_n,
  )
  quality = validate_enrichment_queue(queue_rows)

  _write_jsonl(output_path, queue_rows)
  _write_coverage_csv(coverage_path, coverage_rows)
  _write_summary(
    report_path,
    input_path=input_path,
    queue_path=output_path,
    coverage_path=coverage_path,
    candidates=candidates,
    queue_rows=queue_rows,
    coverage_rows=coverage_rows,
    top_n=args.top_n,
    quality=quality,
  )
  print(
    json.dumps(
      {
        "coverage": str(coverage_path.relative_to(REPO_ROOT)),
        "gapRows": sum(int(row["gap"]) for row in coverage_rows),
        "queue": str(output_path.relative_to(REPO_ROOT)),
        "queueRows": len(queue_rows),
        "qualityPassed": quality["passed"],
        "report": str(report_path.relative_to(REPO_ROOT)),
        "slotStatusCounts": dict(Counter(str(row["status"]) for row in coverage_rows)),
      },
      ensure_ascii=False,
      indent=2,
      sort_keys=True,
    ),
  )

  return 0 if quality["passed"] else 1


if __name__ == "__main__":
  raise SystemExit(main())
