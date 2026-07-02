from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.auradin_catalog import run_fixture_pipeline  # noqa: E402


def _default_run_date() -> str:
  # Keep this script dependency-free; the fixed offset is enough for dated output names.
  return (datetime.now(tz=UTC) + timedelta(hours=9)).strftime("%Y%m%d")


def _default_collected_at(run_date: str) -> str:
  return f"{run_date[:4]}-{run_date[4:6]}-{run_date[6:8]}T00:00:00+09:00"


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Run the Auradin product catalog candidate/enrichment pipeline on fixtures.",
  )
  parser.add_argument(
    "--fixture",
    type=Path,
    default=REPO_ROOT / "services" / "backend" / "tests" / "fixtures" / "auradin" / "naver_shop_fixture.json",
  )
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument("--output-root", type=Path, default=REPO_ROOT / "data" / "auradin")
  parser.add_argument("--report-root", type=Path, default=REPO_ROOT / "reports" / "auradin")

  return parser.parse_args()


def main() -> int:
  args = parse_args()
  result = run_fixture_pipeline(
    fixture_path=args.fixture,
    output_root=args.output_root,
    report_root=args.report_root,
    run_date=args.date,
    collected_at=_default_collected_at(args.date),
  )
  summary = {
    "candidateCount": result.candidate_count,
    "candidateQualityPassed": result.candidate_quality["passed"],
    "enrichmentQueueCount": result.queue_count,
    "queueQualityPassed": result.queue_quality["passed"],
    "outputs": {
      "raw": str(result.raw_path.relative_to(REPO_ROOT)),
      "processed": str(result.processed_path.relative_to(REPO_ROOT)),
      "queue": str(result.queue_path.relative_to(REPO_ROOT)),
      "qualityCsv": str(result.quality_csv_path.relative_to(REPO_ROOT)),
      "naverSummary": str(result.naver_summary_path.relative_to(REPO_ROOT)),
      "queueSummary": str(result.queue_summary_path.relative_to(REPO_ROOT)),
    },
    "rawCount": result.raw_count,
    "rejects": result.rejects,
  }
  print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))

  return 0 if result.candidate_quality["passed"] and result.queue_quality["passed"] else 1


if __name__ == "__main__":
  raise SystemExit(main())
