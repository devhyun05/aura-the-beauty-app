from __future__ import annotations

import csv
import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .candidate_normalizer import normalize_naver_fixture
from .enrichment_queue import build_enrichment_queue
from .popularity_ranker import dedupe_and_rank_candidates
from .quality import validate_candidate_rows, validate_enrichment_queue


@dataclass(frozen=True)
class PipelineResult:
  run_date: str
  raw_path: Path
  processed_path: Path
  queue_path: Path
  quality_csv_path: Path
  naver_summary_path: Path
  queue_summary_path: Path
  raw_count: int
  candidate_count: int
  queue_count: int
  rejects: dict[str, int]
  candidate_quality: dict[str, Any]
  queue_quality: dict[str, Any]


def _load_json(path: Path) -> dict[str, Any]:
  return json.loads(path.read_text(encoding="utf-8"))


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(
    "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
    encoding="utf-8",
  )


def _write_quality_csv(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  fieldnames = ["dataset", "rowCount", "passed", "issues"]

  with path.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)


def _category_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
  counts = Counter(str(row.get("category") or "unknown") for row in rows)

  return dict(sorted(counts.items()))


def _write_naver_summary(
  path: Path,
  *,
  run_date: str,
  phase_label: str,
  source_label: str,
  raw_count: int,
  candidate_rows: list[dict[str, Any]],
  rejects: dict[str, int],
  candidate_quality: dict[str, Any],
) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  category_counts = _category_counts(candidate_rows)
  lines = [
    f"# Auradin Naver Collection Summary ({run_date})",
    "",
    f"Phase: {phase_label}.",
    "",
    f"- Source: `{source_label}`",
    f"- Raw rows: {raw_count}",
    f"- Accepted product candidates: {len(candidate_rows)}",
    f"- Rejected rows: {sum(rejects.values())}",
    f"- Category counts: `{json.dumps(category_counts, ensure_ascii=False, sort_keys=True)}`",
    f"- Candidate quality passed: `{candidate_quality['passed']}`",
    "",
    "Reject reasons:",
    "",
  ]
  lines.extend(f"- {reason}: {count}" for reason, count in sorted(rejects.items()))
  lines.extend(
    [
      "",
      "Safety notes:",
      "",
      "- No official mall, Olive Young, Naver detail page, review, login, cart, order, or mypage crawl was performed.",
      "- No raw HTML, raw reviews, or original product image files were stored.",
      "- Product images are stored as source URLs only.",
    ],
  )
  path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_queue_summary(
  path: Path,
  *,
  run_date: str,
  phase_label: str,
  queue_rows: list[dict[str, Any]],
  queue_quality: dict[str, Any],
) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  category_counts = _category_counts(queue_rows)
  lines = [
    f"# Auradin Enrichment Queue Summary ({run_date})",
    "",
    f"Phase: {phase_label}.",
    "",
    f"- Enrichment queue rows: {len(queue_rows)}",
    f"- Category counts: `{json.dumps(category_counts, ensure_ascii=False, sort_keys=True)}`",
    f"- Queue quality passed: `{queue_quality['passed']}`",
    "",
    "Next runnable crawl gate:",
    "",
    "1. Review `data/auradin/processed/enrichment_queue_YYYYMMDD.jsonl`.",
    "2. Verify target-domain robots/terms before any detail crawl.",
    "3. Run Phase C staging/enrichment with raw HTML/review/image storage disabled.",
    "",
    "Safety notes:",
    "",
    "- Queue rows carry `sourceUrls`, `fetchedAt`, `evidence`, `confidence`, and `parserVersion`.",
    "- Low-confidence metadata remains marked `needsManualReview=true`.",
    "- No raw HTML, raw reviews, or original product image files were stored.",
  ]
  path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_fixture_payload_pipeline(
  *,
  fixture: dict[str, Any],
  output_root: Path,
  report_root: Path,
  run_date: str,
  collected_at: str,
  phase_a_label: str = "Phase 0 fixture smoke for Phase A candidate collection",
  phase_b_label: str = "Phase 0 fixture smoke for Phase B enrichment queue generation",
  source_label: str = "fixture",
) -> PipelineResult:
  raw_rows, normalized_candidates, rejects = normalize_naver_fixture(
    fixture,
    collected_at=collected_at,
  )
  ranked_candidates = dedupe_and_rank_candidates(normalized_candidates)
  queue_rows = build_enrichment_queue(
    ranked_candidates,
    fetched_at=collected_at,
  )
  candidate_quality = validate_candidate_rows(ranked_candidates)
  queue_quality = validate_enrichment_queue(queue_rows)

  raw_path = output_root / "raw" / f"naver_candidates_{run_date}.jsonl"
  processed_path = output_root / "processed" / f"product_candidates_{run_date}.jsonl"
  queue_path = output_root / "processed" / f"enrichment_queue_{run_date}.jsonl"
  quality_csv_path = report_root / f"fixture_quality_{run_date}.csv"
  naver_summary_path = report_root / f"naver_collection_summary_{run_date}.md"
  queue_summary_path = report_root / f"enrichment_queue_summary_{run_date}.md"

  _write_jsonl(raw_path, raw_rows)
  _write_jsonl(processed_path, ranked_candidates)
  _write_jsonl(queue_path, queue_rows)
  _write_quality_csv(
    quality_csv_path,
    [
      {
        "dataset": "product_candidates",
        "rowCount": candidate_quality["rowCount"],
        "passed": candidate_quality["passed"],
        "issues": json.dumps(candidate_quality, ensure_ascii=False, sort_keys=True),
      },
      {
        "dataset": "enrichment_queue",
        "rowCount": queue_quality["rowCount"],
        "passed": queue_quality["passed"],
        "issues": json.dumps(queue_quality, ensure_ascii=False, sort_keys=True),
      },
    ],
  )
  _write_naver_summary(
    naver_summary_path,
    run_date=run_date,
    phase_label=phase_a_label,
    source_label=source_label,
    raw_count=len(raw_rows),
    candidate_rows=ranked_candidates,
    rejects=dict(rejects),
    candidate_quality=candidate_quality,
  )
  _write_queue_summary(
    queue_summary_path,
    run_date=run_date,
    phase_label=phase_b_label,
    queue_rows=queue_rows,
    queue_quality=queue_quality,
  )

  return PipelineResult(
    run_date=run_date,
    raw_path=raw_path,
    processed_path=processed_path,
    queue_path=queue_path,
    quality_csv_path=quality_csv_path,
    naver_summary_path=naver_summary_path,
    queue_summary_path=queue_summary_path,
    raw_count=len(raw_rows),
    candidate_count=len(ranked_candidates),
    queue_count=len(queue_rows),
    rejects=dict(rejects),
    candidate_quality=candidate_quality,
    queue_quality=queue_quality,
  )


def run_fixture_pipeline(
  *,
  fixture_path: Path,
  output_root: Path,
  report_root: Path,
  run_date: str,
  collected_at: str,
) -> PipelineResult:
  return run_fixture_payload_pipeline(
    fixture=_load_json(fixture_path),
    output_root=output_root,
    report_root=report_root,
    run_date=run_date,
    collected_at=collected_at,
  )
