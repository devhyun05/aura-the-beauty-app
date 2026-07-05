from __future__ import annotations

import argparse
import json
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


RUN_DATE = "20260703"


def _markdown_table(mapping: dict[str, Any], key_label: str, value_label: str) -> str:
  if not mapping:
    return f"| {key_label} | {value_label} |\n|---|---:|\n| 없음 | 0 |\n"

  lines = [f"| {key_label} | {value_label} |", "|---|---:|"]
  for key, value in sorted(mapping.items()):
    lines.append(f"| {key} | {value} |")
  return "\n".join(lines) + "\n"


def build_quality_report(summary: dict[str, Any], output_paths: dict[str, Path]) -> str:
  return "\n".join(
    [
      "# Auradin MVP Preprocessing Quality (20260703)",
      "",
      "## Outputs",
      "",
      f"- Catalog MVP: `{output_paths['catalog']}`",
      f"- Knowledge chunks MVP: `{output_paths['chunks']}`",
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
      "- `lip`, `cheek`, and `shadow` are the current supported result categories. Brow/base/liner prompts should use an honest fallback.",
      "- Low-confidence color, undertone, intensity, and suitable-for values should be used as soft preferences or display-only evidence.",
      "",
    ],
  )


def run(run_date: str = RUN_DATE) -> dict[str, Any]:
  seed_path = REPO_ROOT / "data" / "auradin" / "catalog" / f"catalog_items_seed_{run_date}.jsonl"
  catalog_output = REPO_ROOT / "data" / "auradin" / "catalog" / f"catalog_items_mvp_{run_date}.jsonl"
  chunk_output = (
    REPO_ROOT
    / "data"
    / "auradin"
    / "knowledge"
    / f"product_knowledge_chunks_mvp_{run_date}.jsonl"
  )
  report_output = REPO_ROOT / "reports" / "auradin" / f"mvp_preprocessing_quality_{run_date}.md"

  seed_rows = read_jsonl(seed_path)
  catalog_items = build_mvp_catalog(seed_rows)
  chunks = build_knowledge_chunks(catalog_items)
  summary = build_quality_summary(len(seed_rows), catalog_items, chunks)

  write_jsonl(catalog_output, catalog_items)
  write_jsonl(chunk_output, chunks)
  report_output.parent.mkdir(parents=True, exist_ok=True)
  report_output.write_text(
    build_quality_report(summary, {"catalog": catalog_output, "chunks": chunk_output}),
    encoding="utf-8",
  )

  return {
    "catalogOutput": str(catalog_output),
    "chunkOutput": str(chunk_output),
    "reportOutput": str(report_output),
    **summary,
  }


def main() -> None:
  parser = argparse.ArgumentParser()
  parser.add_argument("--run-date", default=RUN_DATE)
  args = parser.parse_args()
  print(json.dumps(run(args.run_date), ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
  main()
