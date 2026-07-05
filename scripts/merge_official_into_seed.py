#!/usr/bin/env python3
"""Merge official-brand-page metadata back into the refined Auradin seed.

Reads the refined seed (data/auradin/catalog/catalog_items_seed_{date}.jsonl) and
an official-metadata collection (fields keyed by candidateId), then:
  1. unions any official shadeOptions into the matching seed row,
  2. re-runs the same calibrated derivation + aggregation (from
     refine_auradin_seed_derivation), so new shades get honest attributes,
  3. applies official ROW-LEVEL fields (finish/undertone/texture/sellingPoints/
     suitableFor) as an override ONLY when the official confidence beats what the
     shade aggregation produced — and re-derives eligibility against the 0.65 cutoff.

No confidence is fabricated: an official value only becomes hard-filter eligible
if the collector already assigned it >= 0.65 from the brand page. Matching is by
candidateId against sourceCandidateId and mergedFromCandidateIds.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]

# Reuse the exact derivation/aggregation the refined seed was built with.
_spec = importlib.util.spec_from_file_location(
  "refine_auradin", REPO_ROOT / "scripts" / "refine_auradin_seed_derivation.py"
)
refine = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(refine)

HARD_FILTER_CUTOFF = refine.HARD_FILTER_CONFIDENCE_CUTOFF
ROW_LEVEL_FIELDS = ("finish", "texture", "undertone", "suitableFor", "sellingPoints")


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
  return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _candidate_ids(row: dict[str, Any]) -> set[str]:
  ids = set(row.get("mergedFromCandidateIds") or [])
  if row.get("sourceCandidateId"):
    ids.add(row["sourceCandidateId"])
  return ids


def _official_field(official: dict[str, Any], name: str) -> dict[str, Any] | None:
  field = (official.get("fields") or {}).get(name)
  if isinstance(field, dict) and field.get("value") not in (None, "", []):
    return field
  return None


def merge(seed_path: Path, official_path: Path, out_path: Path) -> dict[str, Any]:
  seed = _read_jsonl(seed_path)
  official = _read_jsonl(official_path)

  # candidateId -> official row (keep the highest-matchScore if duplicated)
  by_cand: dict[str, dict[str, Any]] = {}
  for o in official:
    cid = o.get("candidateId")
    if not cid:
      continue
    if cid not in by_cand or float(o.get("matchScore") or 0) > float(by_cand[cid].get("matchScore") or 0):
      by_cand[cid] = o

  stats = {"rows_matched": 0, "shadeOptions_added": 0, "field_overrides": {f: 0 for f in ROW_LEVEL_FIELDS}}

  for row in seed:
    officials = [by_cand[c] for c in _candidate_ids(row) if c in by_cand]
    if not officials:
      continue
    stats["rows_matched"] += 1

    # 1) union official shadeOptions, then re-derive from the enriched shade list
    shades = list(row.get("shadeOptions") or [])
    for o in officials:
      sfield = _official_field(o, "shadeOptions")
      if sfield and isinstance(sfield.get("value"), list):
        for shade in sfield["value"]:
          if isinstance(shade, dict):
            shades.append(shade)
            stats["shadeOptions_added"] += 1
    row["shadeOptions"] = refine.clean_shade_options(
      shades, brand=row.get("brandName") or "", product_name=row.get("productName") or "", stat=refine._clean_stat()
    )
    row["shadeOptions"] = refine.derive_shade_options(
      row["shadeOptions"], brand=row.get("brandName") or "", category=row.get("category") or ""
    )
    refine.reaggregate_row(row)

    # 2) apply official row-level fields where they beat the shade aggregation
    attrs = row.setdefault("attributes", {})
    conf = row.setdefault("attributeConfidence", {})
    elig = row.setdefault("hardFilterEligible", {})
    evidence = row.setdefault("evidence", [])
    for name in ROW_LEVEL_FIELDS:
      best = None
      for o in officials:
        f = _official_field(o, name)
        if f and float(f.get("confidence") or 0) > float((best or {}).get("confidence") or 0):
          best = f
      if not best:
        continue
      new_conf = float(best.get("confidence") or 0)
      if new_conf <= float(conf.get(name) or 0):
        continue
      value = best["value"]
      if name in ("suitableFor", "sellingPoints"):
        merged_list = list(dict.fromkeys((attrs.get(name) or []) + (value if isinstance(value, list) else [value])))
        attrs[name] = merged_list
      else:
        attrs[name] = value
      conf[name] = round(new_conf, 2)
      elig[name] = bool(attrs[name]) and new_conf >= HARD_FILTER_CUTOFF
      evidence.append({
        "field": name, "value": value, "confidence": round(new_conf, 2),
        "sourceType": best.get("sourceType") or "official_brand_page",
        "sourceUrl": best.get("sourceUrl") or row.get("officialSourceUrl"),
        "rawText": (best.get("rawText") or "")[:160],
      })
      stats["field_overrides"][name] += 1

  out_path.parent.mkdir(parents=True, exist_ok=True)
  out_path.write_text(
    "".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in seed), encoding="utf-8"
  )
  return {"seedRows": len(seed), "officialRows": len(official), **stats, "output": str(out_path)}


def _coverage(rows: list[dict[str, Any]]) -> dict[str, int]:
  fields = ("colorFamily", "undertone", "finish", "texture", "intensity", "suitableFor", "sellingPoints")
  return {f: sum(1 for r in rows if (r.get("hardFilterEligible") or {}).get(f)) for f in fields}


def main() -> None:
  p = argparse.ArgumentParser(description=__doc__)
  p.add_argument("--date", default="20260706")
  p.add_argument("--seed", type=Path)
  p.add_argument("--official", type=Path)
  args = p.parse_args()

  seed_path = args.seed or REPO_ROOT / "data/auradin/catalog" / f"catalog_items_seed_{args.date}.jsonl"
  official_path = args.official or REPO_ROOT / "data/auradin/detail/official_expanded" / f"official_metadata_{args.date}.jsonl"
  out_path = REPO_ROOT / "data/auradin/catalog" / f"catalog_items_seed_{args.date}_enriched.jsonl"

  before = _coverage(_read_jsonl(seed_path))
  result = merge(seed_path, official_path, out_path)
  after = _coverage(_read_jsonl(out_path))

  print(json.dumps(result, ensure_ascii=False, indent=2))
  print("\nhard-filter eligible (before -> after):")
  for f in before:
    delta = after[f] - before[f]
    print(f"  {f:<14} {before[f]:>4} -> {after[f]:>4}  ({'+' if delta >= 0 else ''}{delta})")


if __name__ == "__main__":
  main()
