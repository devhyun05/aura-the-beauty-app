"""Apply human-approved color attributes back into the Auradin seed (B3 §6.4-2).

There is no existing path that writes reviewed LLM attributes into the seed
(merge_auradin_seed_supplement.py is append-only and cannot modify existing
rows). This script fills that gap, honoring the AURADIN honesty contract:

  - evidenceSpan is re-validated as a real substring of the seed row's own text.
  - A value is overwritten only when the new field-confidence is higher.
  - hardFilterEligible promotion needs confidence ≥ 0.70 AND a human "approve"
    verdict AND the extractor's promotionCandidate flag — NEVER for undertone.
  - Row count and ids are invariant (the seed is not deduped/reshaped here).

Two input sources (both optional, applied structured-first so higher-confidence
reviewed values win):
  --review-queue + --spotcheck : approved LLM extractions (value + evidenceSpan).
  --structured-detail          : already-collected detail colorFamily, joined by
                                 image URL; fills MISSING colorFamily only, at a
                                 modest confidence, and never promotes to
                                 hardFilter (below the human-spotcheck bar).

Output: a new seed JSONL (original left immutable) + a before/after report.
"""

from __future__ import annotations

import argparse
import copy
import csv
import json
import sys
from pathlib import Path
from typing import Any, Callable

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
  sys.path.insert(0, str(SCRIPTS_DIR))

from run_auradin_llm_attribute_extraction import build_input_text  # noqa: E402

HARD_FILTER_CONFIDENCE = 0.70
STRUCTURED_DETAIL_CONFIDENCE = 0.60
NON_PROMOTABLE_FIELDS = frozenset({"undertone"})
APPROVE_VERDICTS = frozenset(
  {"approve", "approved", "accept", "accepted", "ok", "yes", "y", "pass", "o", "true"}
)


# ── IO ────────────────────────────────────────────────────────────────────────

def read_jsonl(path: Path) -> list[dict[str, Any]]:
  rows: list[dict[str, Any]] = []
  for line in path.read_text(encoding="utf-8").splitlines():
    if line.strip():
      rows.append(json.loads(line))
  return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(
    "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
    encoding="utf-8",
  )


# ── review-queue + spotcheck → decisions ──────────────────────────────────────

def load_spotcheck_verdicts(rows: list[dict[str, str]]) -> dict[tuple[str, str], bool]:
  """(catalogItemId, field) -> approved. Missing/blank verdict = not approved."""

  verdicts: dict[tuple[str, str], bool] = {}
  for row in rows:
    item_id = str(row.get("catalogItemId") or "").strip()
    field = str(row.get("field") or "").strip()
    if not item_id or not field:
      continue
    verdict = str(row.get("verdict") or "").strip().lower()
    verdicts[(item_id, field)] = verdict in APPROVE_VERDICTS
  return verdicts


def merge_review_decisions(
  review_rows: list[dict[str, Any]],
  verdicts: dict[tuple[str, str], bool],
) -> list[dict[str, Any]]:
  """Cross accepted extractions with human verdicts → approved application list.

  Only fields that were gate-accepted AND carry an approve verdict survive.
  """

  decisions: list[dict[str, Any]] = []
  for result in review_rows:
    item_id = str(result.get("catalogItemId") or "").strip()
    if not item_id:
      continue
    fields = result.get("fields") if isinstance(result.get("fields"), dict) else {}
    for field, payload in fields.items():
      if not isinstance(payload, dict) or payload.get("status") != "accepted":
        continue
      if not verdicts.get((item_id, field), False):
        continue
      decisions.append(
        {
          "catalogItemId": item_id,
          "field": field,
          "value": str(payload.get("value")).strip(),
          "confidence": float(payload.get("confidence") or 0.0),
          "evidenceSpan": str(payload.get("evidenceSpan") or ""),
          "promotionCandidate": bool(payload.get("promotionCandidate")),
        }
      )
  return decisions


# ── application (pure) ────────────────────────────────────────────────────────

def _seed_id(row: dict[str, Any]) -> str:
  return str(row.get("catalogItemId") or row.get("id") or "").strip()


def _ensure_dict(row: dict[str, Any], key: str) -> dict[str, Any]:
  value = row.get(key)
  if not isinstance(value, dict):
    value = {}
    row[key] = value
  return value


def apply_reviewed_to_seed(
  seed_rows: list[dict[str, Any]],
  decisions: list[dict[str, Any]],
  *,
  run_date: str,
  input_text_fn: Callable[[dict[str, Any]], str] = build_input_text,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
  """Apply approved decisions to copies of the seed rows. Ids/count invariant."""

  new_rows = [copy.deepcopy(row) for row in seed_rows]
  by_id: dict[str, dict[str, Any]] = {_seed_id(r): r for r in new_rows}
  applied = 0
  promoted = 0
  skipped_lower_conf = 0
  skipped_span = 0
  skipped_no_row = 0

  for decision in decisions:
    row = by_id.get(decision["catalogItemId"])
    if row is None:
      skipped_no_row += 1
      continue
    field = decision["field"]
    # Gate: evidenceSpan must be a real substring of the row's own text.
    if decision["evidenceSpan"] not in input_text_fn(row):
      skipped_span += 1
      continue
    confidence = _ensure_dict(row, "attributeConfidence")
    existing_conf = float(confidence.get(field) or 0.0)
    if decision["confidence"] <= existing_conf:
      skipped_lower_conf += 1
      continue

    attributes = _ensure_dict(row, "attributes")
    hard_filter = _ensure_dict(row, "hardFilterEligible")
    attributes[field] = decision["value"]
    confidence[field] = decision["confidence"]
    promote = (
      field not in NON_PROMOTABLE_FIELDS
      and decision["promotionCandidate"]
      and decision["confidence"] >= HARD_FILTER_CONFIDENCE
    )
    hard_filter[field] = bool(promote)
    if promote:
      promoted += 1

    evidence = row.get("evidence")
    if not isinstance(evidence, list):
      evidence = []
      row["evidence"] = evidence
    evidence.append(
      {
        "field": field,
        "value": decision["value"],
        "sourceType": "llm_b3_reviewed",
        "confidence": decision["confidence"],
        "evidenceSpan": decision["evidenceSpan"],
        "hardFilterEligible": bool(promote),
        "runDate": run_date,
      }
    )
    applied += 1

  report = {
    "applied": applied,
    "hardFilterPromoted": promoted,
    "skippedLowerConfidence": skipped_lower_conf,
    "skippedEvidenceSpan": skipped_span,
    "skippedUnknownRow": skipped_no_row,
  }
  return new_rows, report


def index_structured_color(structured_rows: list[dict[str, Any]]) -> dict[str, str]:
  """imageUrl -> colorFamily for structured detail rows that carry one."""

  index: dict[str, str] = {}
  for row in structured_rows:
    color = str(row.get("colorFamily") or "").strip()
    image_url = str(row.get("imageUrl") or "").strip()
    if color and image_url:
      index.setdefault(image_url, color)
  return index


def apply_structured_detail(
  seed_rows: list[dict[str, Any]],
  color_by_image: dict[str, str],
  *,
  run_date: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
  """Fill MISSING colorFamily from detail evidence (join by image URL).

  Value-only (never hardFilter-promoted): detail-derived color is below the
  human-spotcheck bar, so it improves visibility/coverage without granting
  hard-filter eligibility.
  """

  new_rows = [copy.deepcopy(row) for row in seed_rows]
  filled = 0
  for row in new_rows:
    attributes = _ensure_dict(row, "attributes")
    if str(attributes.get("colorFamily") or "").strip():
      continue  # never overwrite an existing value
    live_offer = row.get("liveOffer") if isinstance(row.get("liveOffer"), dict) else {}
    image_url = str(live_offer.get("imageUrl") or "").strip()
    color = color_by_image.get(image_url)
    if not color:
      continue
    attributes["colorFamily"] = color
    confidence = _ensure_dict(row, "attributeConfidence")
    confidence["colorFamily"] = STRUCTURED_DETAIL_CONFIDENCE
    hard_filter = _ensure_dict(row, "hardFilterEligible")
    hard_filter["colorFamily"] = False
    evidence = row.get("evidence")
    if not isinstance(evidence, list):
      evidence = []
      row["evidence"] = evidence
    evidence.append(
      {
        "field": "colorFamily",
        "value": color,
        "sourceType": "detail_structured",
        "confidence": STRUCTURED_DETAIL_CONFIDENCE,
        "hardFilterEligible": False,
        "runDate": run_date,
      }
    )
    filled += 1
  return new_rows, {"filled": filled}


def color_family_coverage(rows: list[dict[str, Any]]) -> dict[str, int]:
  present = 0
  eligible = 0
  for row in rows:
    attributes = row.get("attributes") if isinstance(row.get("attributes"), dict) else {}
    hard_filter = row.get("hardFilterEligible") if isinstance(row.get("hardFilterEligible"), dict) else {}
    if str(attributes.get("colorFamily") or "").strip():
      present += 1
    if hard_filter.get("colorFamily") is True:
      eligible += 1
  return {"present": present, "eligible": eligible, "total": len(rows)}


def _assert_invariant(before: list[dict[str, Any]], after: list[dict[str, Any]]) -> None:
  if len(before) != len(after):
    raise RuntimeError(f"row count changed: {len(before)} -> {len(after)} (seed must not be reshaped)")
  before_ids = [_seed_id(r) for r in before]
  after_ids = [_seed_id(r) for r in after]
  if before_ids != after_ids:
    raise RuntimeError("catalogItemId set/order changed; seed must not be reshaped")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--seed", type=Path, required=True, help="대상 seed jsonl (불변; 새 파일로 출력)")
  parser.add_argument("--output", type=Path, required=True, help="적용된 새 seed jsonl 경로")
  parser.add_argument("--review-queue", type=Path, help="run_auradin_llm_attribute_extraction 출력 jsonl")
  parser.add_argument("--spotcheck", type=Path, help="사람이 verdict 기입한 spotcheck csv")
  parser.add_argument("--structured-detail", type=Path, nargs="*", help="detail/structured/*.jsonl (colorFamily 보강)")
  parser.add_argument("--run-date", required=True)
  parser.add_argument("--report", type=Path, help="before/after 커버리지 리포트 json 경로")
  args = parser.parse_args(argv)

  seed_rows = read_jsonl(args.seed)
  before = color_family_coverage(seed_rows)
  reports: dict[str, Any] = {"seedCoverageBefore": before}
  rows = seed_rows

  if args.structured_detail:
    structured: list[dict[str, Any]] = []
    for path in args.structured_detail:
      structured.extend(read_jsonl(path))
    color_by_image = index_structured_color(structured)
    rows, structured_report = apply_structured_detail(rows, color_by_image, run_date=args.run_date)
    reports["structuredDetail"] = {**structured_report, "colorByImageCount": len(color_by_image)}

  if args.review_queue:
    if not args.spotcheck:
      parser.error("--review-queue requires --spotcheck (human verdicts)")
    review_rows = read_jsonl(args.review_queue)
    with args.spotcheck.open(encoding="utf-8") as handle:
      spotcheck_rows = list(csv.DictReader(handle))
    verdicts = load_spotcheck_verdicts(spotcheck_rows)
    decisions = merge_review_decisions(review_rows, verdicts)
    rows, reviewed_report = apply_reviewed_to_seed(rows, decisions, run_date=args.run_date)
    reports["reviewed"] = {**reviewed_report, "approvedDecisions": len(decisions)}

  _assert_invariant(seed_rows, rows)
  after = color_family_coverage(rows)
  reports["seedCoverageAfter"] = after

  write_jsonl(args.output, rows)
  if args.report:
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(reports, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
  print(json.dumps({**reports, "output": str(args.output)}, ensure_ascii=False, indent=2, sort_keys=True))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
