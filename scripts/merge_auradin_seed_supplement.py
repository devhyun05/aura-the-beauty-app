from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.auradin_agent.ranking import normalized_product_key  # noqa: E402


class SeedMergeError(ValueError):
  pass


def _read_rows_with_source(path: Path) -> tuple[list[str], list[dict[str, Any]]]:
  source_rows: list[str] = []
  parsed_rows: list[dict[str, Any]] = []
  for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
    if not line.strip():
      continue
    try:
      parsed = json.loads(line)
    except json.JSONDecodeError as exc:
      raise SeedMergeError(f"invalid JSONL at {path}:{line_number}") from exc
    if not isinstance(parsed, dict):
      raise SeedMergeError(f"JSONL row must be an object at {path}:{line_number}")
    source_rows.append(line)
    parsed_rows.append(parsed)
  return source_rows, parsed_rows


def _identity_sets(rows: list[dict[str, Any]]) -> tuple[set[str], set[str]]:
  ids = {
    str(row.get("catalogItemId") or "").strip()
    for row in rows
    if str(row.get("catalogItemId") or "").strip()
  }
  keys = {key for row in rows if (key := normalized_product_key(row))}
  return ids, keys


def validate_supplement_collisions(
  base_rows: list[dict[str, Any]],
  supplement_rows: list[dict[str, Any]],
) -> None:
  base_ids, base_keys = _identity_sets(base_rows)
  seen_new_ids: set[str] = set()
  seen_new_keys: set[str] = set()
  for index, row in enumerate(supplement_rows, start=1):
    item_id = str(row.get("catalogItemId") or "").strip()
    product_key = normalized_product_key(row)
    if not item_id or not product_key:
      raise SeedMergeError(f"supplement row {index} requires catalogItemId and normalized key")
    if item_id in base_ids or item_id in seen_new_ids:
      raise SeedMergeError(f"supplement catalogItemId collision: {item_id}")
    if product_key in base_keys or product_key in seen_new_keys:
      raise SeedMergeError(f"supplement normalized key collision: {product_key}")
    seen_new_ids.add(item_id)
    seen_new_keys.add(product_key)


def merge_seed_files(
  *,
  base_seed: Path,
  supplement: Path,
  output: Path,
  report: Path,
) -> dict[str, Any]:
  base_source, base_rows = _read_rows_with_source(base_seed)
  _supplement_source, supplement_rows = _read_rows_with_source(supplement)
  validate_supplement_collisions(base_rows, supplement_rows)

  merged_lines = [
    *base_source,
    *(json.dumps(row, ensure_ascii=False, sort_keys=True) for row in supplement_rows),
  ]
  output.parent.mkdir(parents=True, exist_ok=True)
  temporary = output.with_name(f".{output.name}.tmp")
  temporary.write_text("".join(f"{line}\n" for line in merged_lines), encoding="utf-8")
  temporary.replace(output)

  output_source, output_rows = _read_rows_with_source(output)
  if output_source[:len(base_source)] != base_source:
    raise SeedMergeError("base seed row text changed during merge")
  if len(output_rows) != len(base_rows) + len(supplement_rows):
    raise SeedMergeError("merged row count does not equal base plus supplement")
  validate_supplement_collisions(output_rows[:len(base_rows)], output_rows[len(base_rows):])

  output_sha = hashlib.sha256(output.read_bytes()).hexdigest()
  summary = {
    "baseCount": len(base_rows),
    "supplementCount": len(supplement_rows),
    "mergedCount": len(output_rows),
    "baseRowsPreserved": True,
    "outputSha256": output_sha,
  }
  report.parent.mkdir(parents=True, exist_ok=True)
  report.write_text(
    "\n".join(
      [
        "# Auradin Seed Supplement Merge",
        "",
        f"- Base rows: {summary['baseCount']}",
        f"- Supplement rows: {summary['supplementCount']}",
        f"- Merged rows: {summary['mergedCount']}",
        "- Base row text preserved: `true`",
        "- New-involved ID/key collisions: `0`",
        f"- Output SHA-256: `{output_sha}`",
        "",
      ],
    ),
    encoding="utf-8",
  )
  return summary


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Merge an Auradin seed supplement without changing base rows.")
  parser.add_argument("--base-seed", type=Path, required=True)
  parser.add_argument("--supplement", type=Path, required=True)
  parser.add_argument("--output", type=Path, required=True)
  parser.add_argument("--report", type=Path, required=True)
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  try:
    summary = merge_seed_files(
      base_seed=args.base_seed,
      supplement=args.supplement,
      output=args.output,
      report=args.report,
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
    return 0
  except (OSError, SeedMergeError) as exc:
    print(f"seed merge failed: {exc}", file=sys.stderr)
    return 1


if __name__ == "__main__":
  raise SystemExit(main())
