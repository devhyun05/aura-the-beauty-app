from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.auradin_catalog.naver_collect import (  # noqa: E402
  build_query_plan,
  collect_naver_shop_fixture_payload,
)
from app.services.auradin_catalog.pipeline import run_fixture_payload_pipeline  # noqa: E402


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


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Collect Auradin product candidates from Naver Shopping API and build enrichment queue outputs.",
  )
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument("--brands", help="Comma-separated brand whitelist subset.")
  parser.add_argument("--categories", help="Comma-separated category subset, e.g. lip,shadow,base.")
  parser.add_argument("--display", type=int, default=100)
  parser.add_argument("--max-queries", type=int, default=12)
  parser.add_argument(
    "--all-templates",
    action="store_true",
    help="Run every configured query template for each brand/category pair.",
  )
  parser.add_argument("--request-delay-seconds", type=float, default=1.0)
  parser.add_argument("--timeout-seconds", type=float, default=10.0)
  parser.add_argument("--output-root", type=Path, default=REPO_ROOT / "data" / "auradin")
  parser.add_argument("--report-root", type=Path, default=REPO_ROOT / "reports" / "auradin")
  parser.add_argument(
    "--dry-run",
    action="store_true",
    help="Print the Naver API query plan without calling the API.",
  )

  return parser.parse_args()


async def run() -> int:
  args = parse_args()
  _load_local_env()
  queries = build_query_plan(
    brands=_split_csv(args.brands),
    categories=_split_csv(args.categories),
    max_queries=args.max_queries,
    all_templates=args.all_templates,
  )

  if args.dry_run:
    print(
      json.dumps(
        {
          "queryCount": len(queries),
          "queries": [query.__dict__ for query in queries],
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
      "Missing NAVER_SHOPPING_CLIENT_ID/NAVER_SHOPPING_CLIENT_SECRET. "
      "Run with --dry-run to inspect the query plan without calling the API.",
      file=sys.stderr,
    )
    return 2

  fixture_payload = await collect_naver_shop_fixture_payload(
    client_id=client_id,
    client_secret=client_secret,
    queries=queries,
    display=args.display,
    request_delay_seconds=args.request_delay_seconds,
    timeout_seconds=args.timeout_seconds,
  )
  result = run_fixture_payload_pipeline(
    fixture=fixture_payload,
    output_root=args.output_root,
    report_root=args.report_root,
    run_date=args.date,
    collected_at=_default_collected_at(args.date),
    phase_a_label="Phase A live Naver Shopping API candidate collection",
    phase_b_label="Phase B popularity ranking and enrichment queue generation",
    source_label="naver_shopping_api",
  )
  summary = {
    "candidateCount": result.candidate_count,
    "candidateQualityPassed": result.candidate_quality["passed"],
    "enrichmentQueueCount": result.queue_count,
    "queryCount": len(queries),
    "queueQualityPassed": result.queue_quality["passed"],
    "rawCount": result.raw_count,
    "rejects": result.rejects,
  }
  print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))

  return 0 if result.candidate_quality["passed"] and result.queue_quality["passed"] else 1


if __name__ == "__main__":
  raise SystemExit(asyncio.run(run()))
