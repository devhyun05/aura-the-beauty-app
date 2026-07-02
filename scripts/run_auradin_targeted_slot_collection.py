from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import sys
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.auradin_catalog.brand_aliases import BRAND_PRIORITY  # noqa: E402
from app.services.auradin_catalog.candidate_normalizer import normalize_naver_fixture  # noqa: E402
from app.services.auradin_catalog.category_queries import (  # noqa: E402
  COLLECTABLE_CATEGORIES,
  DEFAULT_CATEGORY_QUERIES,
)
from app.services.auradin_catalog.enrichment_queue import (  # noqa: E402
  build_brand_category_top_queue,
)
from app.services.auradin_catalog.naver_collect import (  # noqa: E402
  NaverQuery,
  collect_naver_shop_fixture_payload,
)
from app.services.auradin_catalog.popularity_ranker import dedupe_and_rank_candidates  # noqa: E402
from app.services.auradin_catalog.quality import validate_candidate_rows, validate_enrichment_queue  # noqa: E402


EXTRA_CATEGORY_QUERY_TEMPLATES: dict[str, tuple[str, ...]] = {
  "lip": ("{brand} 립", "{brand} 립컬러"),
  "shadow": ("{brand} 팔레트", "{brand} 아이팔레트"),
  "base": ("{brand} 파데", "{brand} 컨실러", "{brand} 톤업"),
  "cheek": ("{brand} 볼터치", "{brand} 블러쉬"),
  "liner": ("{brand} 펜라이너", "{brand} 젤라이너"),
  "brow": ("{brand} 브로우카라", "{brand} 아이브로우 펜슬", "{brand} 눈썹", "{brand} 오토브로우"),
}


def _default_run_date() -> str:
  return (datetime.now(tz=UTC) + timedelta(hours=9)).strftime("%Y%m%d")


def _default_collected_at(run_date: str) -> str:
  return f"{run_date[:4]}-{run_date[4:6]}-{run_date[6:8]}T00:00:00+09:00"


def _split_csv(value: str | None) -> list[str] | None:
  if not value:
    return None

  items = [item.strip() for item in value.split(",") if item.strip()]

  return items or None


def _load_env_file(path: Path) -> None:
  if not path.exists():
    return

  for line in path.read_text(encoding="utf-8").splitlines():
    stripped = line.strip()

    if not stripped or stripped.startswith("#") or "=" not in stripped:
      continue

    key, value = stripped.split("=", 1)
    key = key.strip()

    if not key or key in os.environ:
      continue

    os.environ[key] = value.strip().strip('"').strip("'")


def _load_local_env() -> None:
  _load_env_file(REPO_ROOT / ".env")
  _load_env_file(BACKEND_ROOT / ".env")


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


def _candidate_counts(candidates: list[dict[str, Any]]) -> Counter[tuple[str, str]]:
  return Counter(
    (
      str(row.get("brandNormalized") or ""),
      str(row.get("category") or ""),
    )
    for row in candidates
  )


def _build_target_queries(
  candidates: list[dict[str, Any]],
  *,
  brands: list[str],
  categories: list[str],
  top_n: int,
  max_queries: int,
) -> tuple[list[NaverQuery], list[dict[str, Any]]]:
  counts = _candidate_counts(candidates)
  queries: list[NaverQuery] = []
  slots: list[dict[str, Any]] = []
  seen_queries: set[tuple[str, str, str]] = set()

  for brand in brands:
    for category in categories:
      current_count = counts[(brand, category)]
      gap = max(0, top_n - current_count)

      if gap <= 0:
        continue

      slot_queries: list[str] = []
      templates = [
        *DEFAULT_CATEGORY_QUERIES.get(category, ()),
        *EXTRA_CATEGORY_QUERY_TEMPLATES.get(category, ()),
      ]

      for template in templates:
        query = template.format(brand=brand)
        key = (brand, category, query)

        if key in seen_queries:
          continue

        seen_queries.add(key)
        slot_queries.append(query)
        queries.append(NaverQuery(brand=brand, category=category, query=query))

        if max_queries > 0 and len(queries) >= max_queries:
          break

      slots.append(
        {
          "brand": brand,
          "category": category,
          "candidateCountBefore": current_count,
          "gapBefore": gap,
          "queries": " | ".join(slot_queries),
        },
      )

      if max_queries > 0 and len(queries) >= max_queries:
        break

    if max_queries > 0 and len(queries) >= max_queries:
      break

  return queries, slots


def _coverage_rows(
  candidates: list[dict[str, Any]],
  queue_rows: list[dict[str, Any]],
  *,
  brands: list[str],
  categories: list[str],
  top_n: int,
) -> list[dict[str, Any]]:
  candidate_counts = _candidate_counts(candidates)
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
      rows.append(
        {
          "brand": brand,
          "category": category,
          "candidateCount": candidate_count,
          "queuedCount": queued_count,
          "targetCount": top_n,
          "gap": gap,
          "status": "ready" if gap == 0 else "partial" if queued_count else "missing",
        },
      )

  return rows


def _write_coverage_csv(path: Path, coverage_rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  fieldnames = ["brand", "category", "candidateCount", "queuedCount", "targetCount", "gap", "status"]

  with path.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(coverage_rows)


def _write_query_csv(path: Path, slot_rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  fieldnames = ["brand", "category", "candidateCountBefore", "gapBefore", "queries"]

  with path.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(slot_rows)


def _write_report(
  path: Path,
  *,
  base_candidates_path: Path,
  raw_path: Path,
  merged_candidates_path: Path,
  queue_path: Path,
  coverage_path: Path,
  query_path: Path,
  base_count: int,
  raw_count: int,
  extra_candidate_count: int,
  merged_count: int,
  query_count: int,
  slot_rows: list[dict[str, Any]],
  coverage_rows: list[dict[str, Any]],
  rejects: dict[str, int],
  candidate_quality: dict[str, Any],
  queue_quality: dict[str, Any],
  top_n: int,
  naverpay_filter: str | None,
) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  status_counts = Counter(str(row["status"]) for row in coverage_rows)
  total_gap = sum(int(row["gap"]) for row in coverage_rows)
  lines = [
    f"# Auradin Targeted Brand x Category Top{top_n} Collection",
    "",
    f"- Base candidates: `{base_candidates_path}`",
    f"- Targeted raw Naver rows: `{raw_path}`",
    f"- Merged candidates: `{merged_candidates_path}`",
    f"- Output queue: `{queue_path}`",
    f"- Coverage CSV: `{coverage_path}`",
    f"- Query CSV: `{query_path}`",
    f"- Base candidate rows: {base_count}",
    f"- Targeted query count: {query_count}",
    f"- Targeted raw rows: {raw_count}",
    f"- Targeted accepted candidates: {extra_candidate_count}",
    f"- Merged ranked candidates: {merged_count}",
    f"- Queue rows: {sum(int(row['queuedCount']) for row in coverage_rows)}",
    f"- Remaining gap rows: {total_gap}",
    f"- Slot status counts: `{json.dumps(dict(sorted(status_counts.items())), ensure_ascii=False)}`",
    f"- Naver filter: `{naverpay_filter or 'none'}`",
    f"- Candidate quality passed: `{candidate_quality['passed']}`",
    f"- Queue quality passed: `{queue_quality['passed']}`",
    "",
    "Targeted slots before collection:",
    "",
  ]
  lines.extend(
    f"- {row['brand']} / {row['category']}: before {row['candidateCountBefore']}/{top_n}, "
    f"gap {row['gapBefore']}, queries `{row['queries']}`"
    for row in slot_rows
  )
  lines.extend(["", "Reject reasons:", ""])
  lines.extend(f"- {reason}: {count}" for reason, count in sorted(rejects.items()))
  lines.extend(["", "Remaining underfilled slots:", ""])
  underfilled = [row for row in coverage_rows if int(row["gap"]) > 0]

  if underfilled:
    lines.extend(
      f"- {row['brand']} / {row['category']}: queued {row['queuedCount']}/{top_n}, "
      f"gap {row['gap']}, status `{row['status']}`"
      for row in underfilled
    )
  else:
    lines.append("- None")

  lines.extend(
    [
      "",
      "Safety notes:",
      "",
      "- Naver Shopping API was used for product candidate metadata only.",
      "- No raw detail HTML, raw reviews, or original product images were stored.",
      "- Detail collection remains a separate Phase D fetch with no login/captcha bypass.",
    ],
  )
  path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Run targeted Naver API collection for underfilled brand x category top-N slots.",
  )
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument("--base-candidates", type=Path)
  parser.add_argument("--top-n", type=int, default=10)
  parser.add_argument("--brands")
  parser.add_argument("--categories")
  parser.add_argument("--display", type=int, default=100)
  parser.add_argument("--max-queries", type=int, default=0)
  parser.add_argument("--request-delay-seconds", type=float, default=0.5)
  parser.add_argument("--timeout-seconds", type=float, default=10.0)
  parser.add_argument("--naverpay-only", action="store_true")
  parser.add_argument("--dry-run", action="store_true")

  return parser.parse_args()


async def run() -> int:
  args = parse_args()

  if args.top_n <= 0:
    print("--top-n must be greater than 0", file=sys.stderr)
    return 2

  _load_local_env()
  base_candidates_path = (
    args.base_candidates
    or REPO_ROOT / "data" / "auradin" / "processed" / f"product_candidates_{args.date}.jsonl"
  )
  raw_path = REPO_ROOT / "data" / "auradin" / "raw" / f"naver_candidates_targeted_top{args.top_n}_{args.date}.jsonl"
  merged_candidates_path = (
    REPO_ROOT
    / "data"
    / "auradin"
    / "processed"
    / f"product_candidates_brand_category_top{args.top_n}_{args.date}.jsonl"
  )
  queue_path = (
    REPO_ROOT
    / "data"
    / "auradin"
    / "processed"
    / f"enrichment_queue_brand_category_top{args.top_n}_{args.date}.jsonl"
  )
  coverage_path = REPO_ROOT / "reports" / "auradin" / f"brand_category_top{args.top_n}_coverage_{args.date}.csv"
  query_path = REPO_ROOT / "reports" / "auradin" / f"brand_category_top{args.top_n}_target_queries_{args.date}.csv"
  report_path = REPO_ROOT / "reports" / "auradin" / f"brand_category_top{args.top_n}_targeted_collection_{args.date}.md"
  brands = _ordered_brands(_split_csv(args.brands))
  categories = _split_csv(args.categories) or list(COLLECTABLE_CATEGORIES)
  base_candidates = _read_jsonl(base_candidates_path)
  queries, slot_rows = _build_target_queries(
    base_candidates,
    brands=brands,
    categories=categories,
    top_n=args.top_n,
    max_queries=args.max_queries,
  )

  if args.dry_run:
    print(
      json.dumps(
        {
          "queryCount": len(queries),
          "queries": [query.__dict__ for query in queries],
          "slotRows": slot_rows,
        },
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
      ),
    )
    return 0

  client_id = os.environ.get("NAVER_SHOPPING_CLIENT_ID") or os.environ.get("NAVER_CLIENT_ID")
  client_secret = (
    os.environ.get("NAVER_SHOPPING_CLIENT_SECRET") or os.environ.get("NAVER_CLIENT_SECRET")
  )

  if not client_id or not client_secret:
    print(
      "Missing NAVER_SHOPPING_CLIENT_ID/NAVER_SHOPPING_CLIENT_SECRET.",
      file=sys.stderr,
    )
    return 2

  naverpay_filter = "naverpay" if args.naverpay_only else None
  fixture_payload = await collect_naver_shop_fixture_payload(
    client_id=client_id,
    client_secret=client_secret,
    queries=queries,
    display=args.display,
    filter_value=naverpay_filter,
    request_delay_seconds=args.request_delay_seconds,
    timeout_seconds=args.timeout_seconds,
  )
  raw_rows, extra_candidates, rejects = normalize_naver_fixture(
    fixture_payload,
    collected_at=_default_collected_at(args.date),
  )
  merged_candidates = dedupe_and_rank_candidates([*base_candidates, *extra_candidates])
  queue_rows = build_brand_category_top_queue(
    merged_candidates,
    fetched_at=_default_collected_at(args.date),
    per_group_limit=args.top_n,
    brands=brands,
    categories=categories,
  )
  coverage_rows = _coverage_rows(
    merged_candidates,
    queue_rows,
    brands=brands,
    categories=categories,
    top_n=args.top_n,
  )
  candidate_quality = validate_candidate_rows(merged_candidates)
  queue_quality = validate_enrichment_queue(queue_rows)

  _write_jsonl(raw_path, raw_rows)
  _write_jsonl(merged_candidates_path, merged_candidates)
  _write_jsonl(queue_path, queue_rows)
  _write_coverage_csv(coverage_path, coverage_rows)
  _write_query_csv(query_path, slot_rows)
  _write_report(
    report_path,
    base_candidates_path=base_candidates_path,
    raw_path=raw_path,
    merged_candidates_path=merged_candidates_path,
    queue_path=queue_path,
    coverage_path=coverage_path,
    query_path=query_path,
    base_count=len(base_candidates),
    raw_count=len(raw_rows),
    extra_candidate_count=len(extra_candidates),
    merged_count=len(merged_candidates),
    query_count=len(queries),
    slot_rows=slot_rows,
    coverage_rows=coverage_rows,
    rejects=dict(rejects),
    candidate_quality=candidate_quality,
    queue_quality=queue_quality,
    top_n=args.top_n,
    naverpay_filter=naverpay_filter,
  )
  print(
    json.dumps(
      {
        "acceptedTargetedCandidates": len(extra_candidates),
        "coverage": str(coverage_path.relative_to(REPO_ROOT)),
        "gapRows": sum(int(row["gap"]) for row in coverage_rows),
        "mergedCandidates": len(merged_candidates),
        "queryCount": len(queries),
        "queue": str(queue_path.relative_to(REPO_ROOT)),
        "queueRows": len(queue_rows),
        "rawRows": len(raw_rows),
        "report": str(report_path.relative_to(REPO_ROOT)),
        "slotStatusCounts": dict(Counter(str(row["status"]) for row in coverage_rows)),
      },
      ensure_ascii=False,
      indent=2,
      sort_keys=True,
    ),
  )

  return 0


if __name__ == "__main__":
  raise SystemExit(asyncio.run(run()))
