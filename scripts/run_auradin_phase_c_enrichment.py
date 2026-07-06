from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.auradin_catalog.domain_preflight import DEFAULT_USER_AGENT  # noqa: E402
from app.services.auradin_catalog.phase_c_enrichment import run_phase_c_preflight  # noqa: E402


def _default_run_date() -> str:
  return (datetime.now(tz=UTC) + timedelta(hours=9)).strftime("%Y%m%d")


def _default_fetched_at(run_date: str) -> str:
  return f"{run_date[:4]}-{run_date[4:6]}-{run_date[6:8]}T00:00:00+09:00"


def _display_path(path: Path) -> str:
  resolved_path = path.resolve()

  try:
    return str(resolved_path.relative_to(REPO_ROOT))
  except ValueError:
    return str(resolved_path)


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description=(
      "Stage Auradin Phase C enrichment inputs from the Phase B queue. "
      "This command does not perform product detail crawling."
    ),
  )
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument("--queue", type=Path)
  parser.add_argument("--output", type=Path)
  parser.add_argument("--review-output", type=Path)
  parser.add_argument("--report", type=Path)
  parser.add_argument("--domain-preflight-report", type=Path)
  parser.add_argument("--max-items", type=int, default=20)
  parser.add_argument("--start-index", type=int, default=0)
  parser.add_argument("--request-delay-seconds", type=float, default=5.0)
  parser.add_argument("--timeout-seconds", type=float, default=10.0)
  parser.add_argument("--user-agent", default=DEFAULT_USER_AGENT)
  parser.add_argument(
    "--network-preflight",
    action="store_true",
    help="Fetch robots.txt and configured public terms URLs before staging source-adapter rows.",
  )
  parser.add_argument("--respect-robots", action="store_true", default=True)
  parser.add_argument("--no-raw-html", action="store_true", default=True)
  parser.add_argument("--no-raw-reviews", action="store_true", default=True)
  parser.add_argument("--no-image-downloads", action="store_true", default=True)
  parser.add_argument(
    "--allow-detail-crawl",
    action="store_true",
    help=(
      "Reserved for future source adapters. The current command refuses detail crawling "
      "even when this flag is present."
    ),
  )

  return parser.parse_args()


def main() -> int:
  args = parse_args()

  if args.allow_detail_crawl:
    print(
      "Phase C detail crawling is not implemented yet. "
      "Run without --allow-detail-crawl to stage the enrichment queue safely.",
      file=sys.stderr,
    )
    return 3

  queue_path = args.queue or REPO_ROOT / "data" / "auradin" / "processed" / f"enrichment_queue_{args.date}.jsonl"
  output_path = args.output or REPO_ROOT / "data" / "auradin" / "enriched" / f"enriched_products_{args.date}.jsonl"
  review_output_path = (
    args.review_output or REPO_ROOT / "data" / "auradin" / "review" / f"catalog_review_queue_{args.date}.csv"
  )
  report_path = args.report or REPO_ROOT / "reports" / "auradin" / f"enrichment_summary_{args.date}.md"
  domain_preflight_path = (
    args.domain_preflight_report
    or REPO_ROOT / "reports" / "auradin" / f"domain_preflight_{args.date}.md"
  )
  result = run_phase_c_preflight(
    queue_path=queue_path,
    enriched_path=output_path,
    review_path=review_output_path,
    report_path=report_path,
    run_date=args.date,
    fetched_at=_default_fetched_at(args.date),
    max_items=args.max_items,
    start_index=args.start_index,
    request_delay_seconds=args.request_delay_seconds,
    respect_robots=args.respect_robots,
    network_preflight=args.network_preflight,
    domain_preflight_path=domain_preflight_path if args.network_preflight else None,
    user_agent=args.user_agent,
    timeout_seconds=args.timeout_seconds,
    no_raw_html=args.no_raw_html,
    no_raw_reviews=args.no_raw_reviews,
    no_image_downloads=args.no_image_downloads,
    dry_run=True,
  )
  summary = {
    "blockedCount": result.blocked_count,
    "crawlStarted": result.crawl_started,
    "dryRun": result.dry_run,
    "detailFetchStarted": result.detail_fetch_started,
    "domainCount": result.domain_count,
    "inputQueueCount": result.input_queue_count,
    "startIndex": result.start_index,
    "outputs": {
      "domainPreflight": _display_path(result.domain_preflight_path)
      if result.domain_preflight_path
      else None,
      "enriched": _display_path(result.enriched_path),
      "report": _display_path(result.report_path),
      "review": _display_path(result.review_path),
    },
    "stagedCount": result.staged_count,
  }
  print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))

  return 0


if __name__ == "__main__":
  raise SystemExit(main())
