from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.auradin_agent.catalog_loader import read_jsonl, write_jsonl
from app.services.auradin_agent.knowledge_chunk_builder import (
  build_knowledge_chunks,
  build_mvp_catalog,
  build_quality_summary,
)


RUN_DATE = "20260715"


def _markdown_table(mapping: dict[str, Any], key_label: str, value_label: str) -> str:
  if not mapping:
    return f"| {key_label} | {value_label} |\n|---|---:|\n| 없음 | 0 |\n"

  lines = [f"| {key_label} | {value_label} |", "|---|---:|"]
  for key, value in sorted(mapping.items()):
    lines.append(f"| {key} | {value} |")
  return "\n".join(lines) + "\n"


def build_quality_report(
  summary: dict[str, Any],
  output_paths: dict[str, Path],
  *,
  run_date: str,
  seed_sha256: str,
) -> str:
  return "\n".join(
    [
      f"# Auradin MVP Preprocessing Quality ({run_date})",
      "",
      "## Outputs",
      "",
      f"- Catalog MVP: `{output_paths['catalog']}`",
      f"- Knowledge chunks MVP: `{output_paths['chunks']}`",
      f"- Seed SHA-256: `{seed_sha256}`",
      "",
      "## Row Counts",
      "",
      f"- Seed rows read: {summary['seedRows']}",
      f"- MVP catalog rows: {summary['mvpCatalogRows']}",
      f"- MVP chunk rows: {summary['chunkRows']}",
      "",
      "## Category Counts",
      "",
      _markdown_table(summary["categoryCounts"], "Category", "Rows"),
      "## Filled Attribute Counts",
      "",
      _markdown_table(summary["fieldCounts"], "Field", "Rows"),
      "## Hard-Filter Eligible Counts",
      "",
      _markdown_table(summary["hardFilterEligibleCounts"], "Field", "Rows"),
      "## Title Residual Keyword Counts",
      "",
      _markdown_table(summary["residualKeywordCounts"], "Field", "Inferred keywords"),
      "## Quality Flags",
      "",
      _markdown_table(summary["qualityFlagCounts"], "Flag", "Rows"),
      "## Safety Notes",
      "",
      "- `imageUrl`, `purchaseUrl`, and `priceKrw` are required before a row is promoted into the MVP catalog.",
      "- Title residual keywords are retained as `title_residual_rule_inferred` evidence and are not promoted to hard filters.",
      "- Unknown retail presence remains unknown. It is not converted into a negative listing claim.",
      "- Serving categories are `lip`, `cheek`, `shadow`, `base`, `brow`, and `liner`.",
      "- Low-confidence color, undertone, intensity, and suitable-for values should be used as soft preferences or display-only evidence.",
      "",
    ],
  )


def run(
  run_date: str = RUN_DATE,
  *,
  seed_path: Path,
  catalog_output: Path,
  chunk_output: Path,
  report_output: Path | None = None,
) -> dict[str, Any]:
  seed_path = seed_path.expanduser().resolve()
  catalog_output = catalog_output.expanduser().resolve()
  chunk_output = chunk_output.expanduser().resolve()
  report_output = (report_output or REPO_ROOT / "reports" / "auradin" / f"mvp_preprocessing_quality_{run_date}.md").resolve()
  if run_date not in catalog_output.name or run_date not in chunk_output.name:
    raise ValueError("catalog/chunk output filenames must carry --run-date")
  seed_sha256 = hashlib.sha256(seed_path.read_bytes()).hexdigest()

  seed_rows = read_jsonl(seed_path)
  catalog_items = build_mvp_catalog(seed_rows)
  chunks = build_knowledge_chunks(catalog_items)
  summary = build_quality_summary(len(seed_rows), catalog_items, chunks)

  write_jsonl(catalog_output, catalog_items)
  write_jsonl(chunk_output, chunks)
  report_output.parent.mkdir(parents=True, exist_ok=True)
  report_output.write_text(
    build_quality_report(
      summary,
      {"catalog": catalog_output, "chunks": chunk_output},
      run_date=run_date,
      seed_sha256=seed_sha256,
    ),
    encoding="utf-8",
  )
  common_parent = Path(os.path.commonpath([catalog_output.parent, chunk_output.parent]))
  sidecar_path = common_parent / ".auradin_preprocessing.json"
  sidecar_path.write_text(
    json.dumps(
      {
        "runDate": run_date,
        "seedPath": str(seed_path.relative_to(REPO_ROOT)),
        "seedSha256": seed_sha256,
        "catalogPath": str(catalog_output.relative_to(REPO_ROOT)),
        "chunksPath": str(chunk_output.relative_to(REPO_ROOT)),
        "catalogCount": len(catalog_items),
        "chunkCount": len(chunks),
      },
      ensure_ascii=False,
      indent=2,
      sort_keys=True,
    ) + "\n",
    encoding="utf-8",
  )

  return {
    "catalogOutput": str(catalog_output),
    "chunkOutput": str(chunk_output),
    "reportOutput": str(report_output),
    "sidecarOutput": str(sidecar_path),
    "seedSha256": seed_sha256,
    **summary,
  }


def main() -> None:
  parser = argparse.ArgumentParser()
  parser.add_argument("--run-date", default=RUN_DATE)
  parser.add_argument("--seed-path", type=Path, required=True)
  parser.add_argument("--catalog-output", type=Path, required=True)
  parser.add_argument("--chunks-output", type=Path, required=True)
  parser.add_argument("--report-output", type=Path)
  args = parser.parse_args()
  print(
    json.dumps(
      run(
        args.run_date,
        seed_path=args.seed_path,
        catalog_output=args.catalog_output,
        chunk_output=args.chunks_output,
        report_output=args.report_output,
      ),
      ensure_ascii=False,
      indent=2,
      sort_keys=True,
    ),
  )


if __name__ == "__main__":
  main()
