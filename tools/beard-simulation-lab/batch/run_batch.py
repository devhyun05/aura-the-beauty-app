"""Batch runner + HTML grid report — the primary tuning tool.

Runs the full pipeline (3 stages) over every photo in samples/ and renders a
single scrollable HTML page: one row per photo, columns
[original | mask overlay | mild | medium | strong], guard badges inline.
Also emits summary.json (pass rates, mitigation counts) and a human-review
CSV (the 3 blind-review questions per photo).

Usage:
  .venv/bin/python batch/run_batch.py
  .venv/bin/python batch/run_batch.py --stages mild,strong --samples path/
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.pipeline import run_pipeline  # noqa: E402

LAB_ROOT = Path(__file__).resolve().parents[1]

REVIEW_QUESTIONS = [
    "본인이라고 믿기는가 (y/n)",
    "제모된 느낌인가, 면도 직후 느낌인가 (removal/shaved)",
    "피부가 뭉개져 보이는가 (y/n)",
]

_PAGE = """<!doctype html><meta charset="utf-8">
<title>beard-sim batch {ts}</title>
<style>
 body{{font:13px -apple-system,sans-serif;background:#111;color:#ddd;margin:16px}}
 table{{border-collapse:collapse}} td,th{{padding:4px 6px;vertical-align:top}}
 img{{max-width:260px;display:block}} .pass{{color:#6f6}} .fail{{color:#f66}}
 .badge{{font-size:11px}} caption{{text-align:left;font-size:15px;padding:8px 0}}
</style>
<table>
<caption>batch {ts} — {n} photos | stage pass rates: {rates}</caption>
<tr><th>photo</th><th>original</th><th>masks</th>{stage_headers}</tr>
{rows}
</table>"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", default=str(LAB_ROOT / "samples"))
    parser.add_argument("--stages", default="mild,medium,strong")
    parser.add_argument("--out", default=None)
    args = parser.parse_args()
    stages = args.stages.split(",")

    samples = sorted(
        p for p in Path(args.samples).iterdir()
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
    ) if Path(args.samples).exists() else []
    if not samples:
        print(f"no sample photos in {args.samples}")
        return 1

    ts = time.strftime("%Y%m%d-%H%M%S")
    batch_dir = Path(args.out) if args.out else LAB_ROOT / "outputs" / "batch" / ts
    batch_dir.mkdir(parents=True, exist_ok=True)
    runs_dir = batch_dir / "runs"

    rows_html: list[str] = []
    summary: dict = {"photos": {}, "stagePass": {s: 0 for s in stages},
                     "rejected": 0, "mitigationCounts": {}}

    for photo in samples:
        print(f"processing {photo.name} ...")
        outcome = run_pipeline(photo, stages=stages, out_root=runs_dir,
                               request_id=photo.stem)
        rel = f"runs/{photo.stem}"
        if outcome.rejected:
            summary["rejected"] += 1
            summary["photos"][photo.name] = {"rejected": outcome.reject_reason}
            rows_html.append(
                f"<tr><td>{photo.name}</td><td colspan={2 + len(stages)} "
                f"class=fail>REJECTED: {outcome.reject_reason}</td></tr>")
            continue

        result = outcome.result
        assert result is not None
        cells = [
            f"<td>{photo.name}<br><span class=badge>{result['analysis']['beardType']}"
            f" d={result['analysis']['densityScore']} s={result['analysis']['shadowScore']}</span></td>",
            f"<td><img src='{rel}/input.png'></td>",
            f"<td><img src='{rel}/mask_overlay.png'></td>",
        ]
        by_stage = {s["stage"]: s for s in result["stages"]}
        failed = {f["stage"]: f for f in result["failures"]}
        photo_summary: dict = {}
        for stage in stages:
            if stage in by_stage:
                summary["stagePass"][stage] += 1
                guard = by_stage[stage]["guard"]
                mitigations = guard["mitigationsApplied"]
                for m in mitigations:
                    summary["mitigationCounts"][m] = summary["mitigationCounts"].get(m, 0) + 1
                badge = "PASS" + (f" ({','.join(mitigations)})" if mitigations else "")
                cells.append(
                    f"<td><img src='{rel}/result_{stage}.png'>"
                    f"<span class='badge pass'>{badge}</span></td>")
                photo_summary[stage] = {"pass": True, "mitigations": mitigations}
            else:
                reason = failed.get(stage, {}).get("reason", "?")
                cells.append(f"<td><span class='badge fail'>FAIL {reason}</span></td>")
                photo_summary[stage] = {"pass": False, "reason": reason}
        summary["photos"][photo.name] = photo_summary
        rows_html.append("<tr>" + "".join(cells) + "</tr>")

    n_ok = len(samples) - summary["rejected"]
    rates = " ".join(
        f"{s}:{summary['stagePass'][s]}/{n_ok}" for s in stages) if n_ok else "-"
    (batch_dir / "report.html").write_text(_PAGE.format(
        ts=ts, n=len(samples), rates=rates,
        stage_headers="".join(f"<th>{s}</th>" for s in stages),
        rows="\n".join(rows_html)))
    (batch_dir / "summary.json").write_text(json.dumps(summary, indent=2,
                                                       ensure_ascii=False))

    with open(batch_dir / "review_sheet.csv", "w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["photo", "stage", *REVIEW_QUESTIONS])
        for photo in samples:
            for stage in stages:
                writer.writerow([photo.name, stage, "", "", ""])

    print(f"\nreport:       {batch_dir / 'report.html'}")
    print(f"summary:      {batch_dir / 'summary.json'}")
    print(f"review sheet: {batch_dir / 'review_sheet.csv'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
