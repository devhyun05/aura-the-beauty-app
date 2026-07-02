from __future__ import annotations

from collections import Counter
from typing import Any


CANDIDATE_REQUIRED_FIELDS = (
  "id",
  "source",
  "naverProductId",
  "title",
  "link",
  "imageUrl",
  "lprice",
  "brandNormalized",
  "category",
  "query",
  "queryRank",
  "collectedAt",
)

QUEUE_REQUIRED_FIELDS = (
  "id",
  "candidateId",
  "brand",
  "productName",
  "category",
  "targetFields",
  "sourceUrls",
  "evidence",
  "confidence",
  "fetchedAt",
  "parserVersion",
)


def _missing_fields(row: dict[str, Any], fields: tuple[str, ...]) -> list[str]:
  return [field for field in fields if row.get(field) in (None, "", [])]


def validate_candidate_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
  missing = Counter()
  ids = Counter(str(row.get("id")) for row in rows)

  for row in rows:
    missing.update(_missing_fields(row, CANDIDATE_REQUIRED_FIELDS))

  duplicate_ids = sorted(candidate_id for candidate_id, count in ids.items() if count > 1)

  return {
    "rowCount": len(rows),
    "duplicateIds": duplicate_ids,
    "missingFields": dict(sorted(missing.items())),
    "passed": not duplicate_ids and not missing,
  }


def validate_enrichment_queue(rows: list[dict[str, Any]]) -> dict[str, Any]:
  missing = Counter()

  for row in rows:
    missing.update(_missing_fields(row, QUEUE_REQUIRED_FIELDS))

  blocked_raw_payload_fields = sorted(
    field
    for row in rows
    for field in row
    if field.lower() in {"rawhtml", "raw_html", "rawreview", "raw_reviews", "originalimage"}
  )

  return {
    "rowCount": len(rows),
    "blockedRawPayloadFields": blocked_raw_payload_fields,
    "missingFields": dict(sorted(missing.items())),
    "passed": not missing and not blocked_raw_payload_fields,
  }
