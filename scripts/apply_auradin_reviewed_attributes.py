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
import re
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


def accepted_values_as_decisions(
  review_rows: list[dict[str, Any]],
  *,
  only_fields: set[str] | None = None,
) -> list[dict[str, Any]]:
  """Every gate-accepted field as a VALUE-ONLY decision (no human verdict needed).

  Used by ``--auto-fill-values`` to collect grounded colorFamily/etc. without a
  human spotcheck. ``promotionCandidate`` is forced False: the evidenceSpan gate
  already guarantees the value is not invented, but hardFilter eligibility still
  requires the human spotcheck path (merge_review_decisions). This does NOT
  reproduce the seed-coverage fabrication trap, which was specifically about
  inflating hardFilter eligibility via an overall-confidence fallback.

  ``only_fields`` restricts which attribute fields are collected (e.g. just
  ``{"colorFamily"}``).
  """

  decisions: list[dict[str, Any]] = []
  for result in review_rows:
    item_id = str(result.get("catalogItemId") or "").strip()
    if not item_id:
      continue
    fields = result.get("fields") if isinstance(result.get("fields"), dict) else {}
    for field, payload in fields.items():
      if only_fields is not None and field not in only_fields:
        continue
      if not isinstance(payload, dict) or payload.get("status") != "accepted":
        continue
      decisions.append(
        {
          "catalogItemId": item_id,
          "field": field,
          "value": str(payload.get("value")).strip(),
          "confidence": float(payload.get("confidence") or 0.0),
          "evidenceSpan": str(payload.get("evidenceSpan") or ""),
          "promotionCandidate": False,  # value-only; hardFilter needs human spotcheck
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
  source_label: str = "llm_b3_reviewed",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
  """Apply decisions to copies of the seed rows. Ids/count invariant.

  ``source_label`` is recorded as the evidence sourceType so machine-auto-filled
  values (``llm_b3_autofilled``) are distinguishable from human-reviewed ones.
  """

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
        "sourceType": source_label,
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


def _normalize_join_key(value: Any) -> str:
  """Lowercase + strip brackets/whitespace for a stable brand/name join key."""

  text = str(value or "").lower()
  text = re.sub(r"[\[\]()]", "", text)
  return re.sub(r"\s+", "", text)


def index_structured_color(structured_rows: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
  """Build colorFamily lookup indexes from structured detail rows.

  Returns two indexes because imageUrl alone joins very few seed rows (the
  detail imageUrl and the offer imageUrl often differ); a normalized
  brand+productName key recovers roughly ten times as many real matches.
  """

  by_image: dict[str, str] = {}
  by_brand_name: dict[str, str] = {}
  for row in structured_rows:
    color = str(row.get("colorFamily") or "").strip()
    if not color:
      continue
    image_url = str(row.get("imageUrl") or "").strip()
    if image_url:
      by_image.setdefault(image_url, color)
    brand = _normalize_join_key(row.get("brand"))
    name = _normalize_join_key(row.get("productName"))
    if brand and name:
      by_brand_name.setdefault(f"{brand}|{name}", color)
  return {"byImage": by_image, "byBrandName": by_brand_name}


def _lookup_structured_color(row: dict[str, Any], index: dict[str, dict[str, str]]) -> str | None:
  """imageUrl first (most precise), then normalized brand+productName."""

  live_offer = row.get("liveOffer") if isinstance(row.get("liveOffer"), dict) else {}
  image_url = str(live_offer.get("imageUrl") or "").strip()
  if image_url and image_url in index["byImage"]:
    return index["byImage"][image_url]
  brand = _normalize_join_key(row.get("brandName"))
  name = _normalize_join_key(row.get("productName"))
  if brand and name:
    return index["byBrandName"].get(f"{brand}|{name}")
  return None


def apply_structured_detail(
  seed_rows: list[dict[str, Any]],
  structured_index: dict[str, dict[str, str]],
  *,
  run_date: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
  """Fill MISSING colorFamily from detail evidence (join by image URL, then brand+name).

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
    color = _lookup_structured_color(row, structured_index)
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


IMAGE_VISION_CONFIDENCE = 0.40


def load_image_inferred(
  vision_rows: list[dict[str, Any]],
  *,
  min_confidence: float = 0.8,
  allowed_basis: set[str] | None = None,
  allowed_families: set[str] | None = None,
) -> dict[str, str]:
  """catalogItemId -> colorFamily from a vision run, gated by basis/confidence.

  Vision output is the least-reliable source (an inference from the product
  photo, not text/detail evidence), so it is gated hard: only rows the model
  judged from an actual swatch at high confidence are accepted, and results are
  applied value-only with an ``image_vision_inferred`` provenance so a human can
  scrutinise them. Never hardFilter-promoted.
  """

  allowed_basis = allowed_basis if allowed_basis is not None else {"swatch"}
  inferred: dict[str, str] = {}
  for row in vision_rows:
    item_id = str(row.get("catalogItemId") or "").strip()
    family = str(row.get("colorFamily") or "").strip()
    basis = str(row.get("basis") or "").strip()
    try:
      conf = float(row.get("confidence") or 0)
    except (TypeError, ValueError):
      conf = 0.0
    if not item_id or not family or family == "none":
      continue
    if allowed_families is not None and family not in allowed_families:
      continue
    if basis not in allowed_basis or conf < min_confidence:
      continue
    inferred.setdefault(item_id, family)
  return inferred


def apply_image_inferred(
  seed_rows: list[dict[str, Any]],
  inferred: dict[str, str],
  *,
  run_date: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
  """Fill MISSING colorFamily from gated vision inference (value-only)."""

  new_rows = [copy.deepcopy(row) for row in seed_rows]
  by_id = {_seed_id(r): r for r in new_rows}
  filled = 0
  for item_id, family in inferred.items():
    row = by_id.get(item_id)
    if row is None:
      continue
    attributes = _ensure_dict(row, "attributes")
    if str(attributes.get("colorFamily") or "").strip():
      continue  # never overwrite text/detail evidence with a weaker image guess
    attributes["colorFamily"] = family
    confidence = _ensure_dict(row, "attributeConfidence")
    confidence["colorFamily"] = IMAGE_VISION_CONFIDENCE
    hard_filter = _ensure_dict(row, "hardFilterEligible")
    hard_filter["colorFamily"] = False
    evidence = row.get("evidence")
    if not isinstance(evidence, list):
      evidence = []
      row["evidence"] = evidence
    evidence.append(
      {
        "field": "colorFamily",
        "value": family,
        "sourceType": "image_vision_inferred",
        "confidence": IMAGE_VISION_CONFIDENCE,
        "hardFilterEligible": False,
        "runDate": run_date,
      }
    )
    filled += 1
  return new_rows, {"filled": filled}


def apply_color_map(
  seed_rows: list[dict[str, Any]],
  color_map: list[dict[str, Any]],
  *,
  run_date: str,
  default_source: str = "external_color_map",
  default_confidence: float = 0.55,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
  """Fill MISSING colorFamily from a generic {catalogItemId, colorFamily, ...} map.

  Used for external, already-interpreted sources (e.g. glowpick shade names read
  and interpreted by the operator). Value-only: never hardFilter-promoted. Each
  row may carry its own ``sourceType``/``confidence``/``note``; the note is kept
  as evidence so a human reviewer can trace the interpretation.
  """

  new_rows = [copy.deepcopy(row) for row in seed_rows]
  by_id = {_seed_id(r): r for r in new_rows}
  filled = 0
  for entry in color_map:
    item_id = str(entry.get("catalogItemId") or "").strip()
    family = str(entry.get("colorFamily") or "").strip()
    if not item_id or not family or family == "none":
      continue
    row = by_id.get(item_id)
    if row is None:
      continue
    attributes = _ensure_dict(row, "attributes")
    if str(attributes.get("colorFamily") or "").strip():
      continue  # never overwrite existing text/detail evidence
    try:
      conf = float(entry.get("confidence") or default_confidence)
    except (TypeError, ValueError):
      conf = default_confidence
    attributes["colorFamily"] = family
    confidence = _ensure_dict(row, "attributeConfidence")
    confidence["colorFamily"] = conf
    hard_filter = _ensure_dict(row, "hardFilterEligible")
    hard_filter["colorFamily"] = False
    evidence = row.get("evidence")
    if not isinstance(evidence, list):
      evidence = []
      row["evidence"] = evidence
    evidence.append(
      {
        "field": "colorFamily",
        "value": family,
        "sourceType": str(entry.get("sourceType") or default_source),
        "confidence": conf,
        "hardFilterEligible": False,
        "note": entry.get("note"),
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
  parser.add_argument(
    "--auto-fill-values",
    action="store_true",
    help="사람 spotcheck 없이 gate-accepted 값을 value-only로 채움 "
    "(evidenceSpan 게이트로 날조는 막지만 hardFilter 승격은 안 함).",
  )
  parser.add_argument(
    "--fields",
    default=None,
    help="auto-fill 대상 필드 제한 (쉼표구분, 예: colorFamily). 기본: 전체 accepted 필드",
  )
  parser.add_argument(
    "--image-inferred",
    type=Path,
    help="비전 추론 jsonl(catalogItemId/colorFamily/confidence/basis). 가장 약한 소스 — "
    "swatch 근거 고신뢰만, value-only, image_vision_inferred provenance.",
  )
  parser.add_argument("--image-min-confidence", type=float, default=0.8)
  parser.add_argument("--image-basis", default="swatch", help="허용 basis(쉼표구분). 기본 swatch")
  parser.add_argument(
    "--color-map",
    type=Path,
    action="append",
    help="외부 해석 색 소스 jsonl(catalogItemId/colorFamily[/sourceType/confidence/note]). "
    "예: glowpick 호수명 해석. value-only. 여러 번 지정 가능.",
  )
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
    structured_index = index_structured_color(structured)
    rows, structured_report = apply_structured_detail(rows, structured_index, run_date=args.run_date)
    reports["structuredDetail"] = {
      **structured_report,
      "colorByImageCount": len(structured_index["byImage"]),
      "colorByBrandNameCount": len(structured_index["byBrandName"]),
    }

  if args.review_queue:
    review_rows = read_jsonl(args.review_queue)
    if args.auto_fill_values:
      only_fields = {f.strip() for f in args.fields.split(",") if f.strip()} if args.fields else None
      decisions = accepted_values_as_decisions(review_rows, only_fields=only_fields)
      rows, reviewed_report = apply_reviewed_to_seed(
        rows, decisions, run_date=args.run_date, source_label="llm_b3_autofilled"
      )
      reports["autoFilled"] = {**reviewed_report, "acceptedValues": len(decisions)}
    else:
      if not args.spotcheck:
        parser.error("--review-queue requires --spotcheck (or --auto-fill-values)")
      with args.spotcheck.open(encoding="utf-8") as handle:
        spotcheck_rows = list(csv.DictReader(handle))
      verdicts = load_spotcheck_verdicts(spotcheck_rows)
      decisions = merge_review_decisions(review_rows, verdicts)
      rows, reviewed_report = apply_reviewed_to_seed(rows, decisions, run_date=args.run_date)
      reports["reviewed"] = {**reviewed_report, "approvedDecisions": len(decisions)}

  # External interpreted color sources (e.g. glowpick shade names) — real
  # manufacturer shade data, stronger than an image guess, so applied before it.
  if args.color_map:
    color_reports = []
    for path in args.color_map:
      color_map = read_jsonl(path)
      rows, cm_report = apply_color_map(rows, color_map, run_date=args.run_date)
      color_reports.append({"source": path.name, **cm_report, "entries": len(color_map)})
    reports["colorMap"] = color_reports

  # Weakest source last — only fills what text/detail/LLM/color-map could not.
  if args.image_inferred:
    vision_rows = read_jsonl(args.image_inferred)
    allowed_basis = {b.strip() for b in args.image_basis.split(",") if b.strip()}
    inferred = load_image_inferred(
      vision_rows,
      min_confidence=args.image_min_confidence,
      allowed_basis=allowed_basis,
    )
    rows, image_report = apply_image_inferred(rows, inferred, run_date=args.run_date)
    reports["imageInferred"] = {
      **image_report,
      "acceptedAfterGate": len(inferred),
      "minConfidence": args.image_min_confidence,
      "allowedBasis": sorted(allowed_basis),
    }

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
