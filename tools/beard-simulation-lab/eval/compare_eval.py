"""Compare two ND-eval results.jsonl on the union-roi and shadow500 operating
points. Restricts to the candidate's processed id set so subset (--limit) runs
compare fairly against the full baseline. Read-only over the harness."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


def _load(path: Path) -> dict[str, dict]:
    out = {}
    for line in Path(path).read_text().splitlines():
        if line.strip():
            r = json.loads(line)
            out[r["id"]] = r
    return out


def _agg(records: list[dict], channel: str, thr: str, scope: str, metric: str) -> float | None:
    vals = [
        r["metrics"][channel][thr][scope][metric]
        for r in records
        if r["status"] == "processed" and r["metrics"][channel][thr][scope][metric] is not None
    ]
    return float(np.mean(vals)) if vals else None


def _rows(records: list[dict]) -> dict:
    processed = [r for r in records if r["status"] == "processed"]
    shadow = [r for r in processed if "shadow" in r.get("gtClasses", [])]
    out = {}
    for name, ch, subset in [
        ("union roi thr0.3", "union", processed),
        ("union roi thr0.2", "union", processed),
        ("shadow500 roi thr0.3", "shadow", shadow),
    ]:
        thr = name.split("thr")[1]
        out[name] = {
            "n": len(subset),
            "IoU": _agg(subset, ch, thr, "roi", "iou"),
            "P": _agg(subset, ch, thr, "roi", "precision"),
            "R": _agg(subset, ch, thr, "roi", "recall"),
        }
    return out


def _fmt(v):
    return f"{v:.3f}" if v is not None else "  -  "


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--candidate", required=True)
    args = ap.parse_args()

    base = _load(Path(args.baseline))
    cand = _load(Path(args.candidate))
    ids = set(cand.keys()) & set(base.keys())
    base_r = [base[i] for i in ids]
    cand_r = [cand[i] for i in ids]

    br, cr = _rows(base_r), _rows(cand_r)
    print(f"restricted to {len(ids)} common ids\n")
    print(f"{'operating point':22} {'IoU':>16} {'Precision':>16} {'Recall':>16}")
    for key in br:
        b, c = br[key], cr[key]
        def cell(m):
            db = c[m]; bb = b[m]
            d = (db - bb) if (db is not None and bb is not None) else None
            return f"{_fmt(bb)}->{_fmt(db)} ({'+' if (d or 0)>=0 else ''}{_fmt(d) if d is not None else '-'})"
        print(f"{key:22} {cell('IoU'):>16} {cell('P'):>16} {cell('R'):>16}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
