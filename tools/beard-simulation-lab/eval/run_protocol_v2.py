"""Evaluation protocol v2 — the common yardstick for the recall work.

Two things v1 could not tell apart, and this one can:

1. *Where* recall is lost, via anatomical bands (eval/bands.py): philtrum,
   soul_patch, jaw_edge, core. Those are exactly the places reported as
   "neither model finds it".
2. *Who* lost it -- the model, or our own plumbing. Every predictor is scored
   twice: `raw` (the model's own output) and `keep` (after the pipeline's
   ROI x (1 - protect) clamp). The gap between them is plumbing loss, and it is
   what Stage 1 sets out to recover.

C1 has no meaningful `raw`: segment_beard multiplies by the region prior and
clamps against protect internally, so its output is plumbed by construction.
It is reported as `keep` only, and that asymmetry is the point.

CAVEAT -- `raw` is not fully unclamped. Every predictor runs on the lower-face
crop, so its output is already confined to `crop.bbox`. `raw` therefore drops
only the ROI-polygon and protect clamps, not the crop window. This is why
`jaw_edge` shows exactly 0.000 plumbing loss while ~10% of ground truth still
sits outside the ROI: the model never looked there. Recovering jaw_edge needs a
WIDER CROP, not a looser clamp -- a different Stage 1 fix from the philtrum,
which really is being clamped away (-0.158 recall).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.beard_segmentation import fit_skin_model, segment_beard  # noqa: E402
from engine.detect_face import detect_face  # noqa: E402
from engine.lower_face_roi import (  # noqa: E402
    build_lower_face_crop,
    skin_reference_pixels,
)
from eval.bands import BAND_NAMES, band_recall, build_bands  # noqa: E402
from eval.run_owndomain_eval import (  # noqa: E402
    _fit,
    _restore,
    _score,
    discover_pairs,
    load_gt_mask,
)

OUT_DIR = Path(__file__).resolve().parents[1] / "outputs" / "protocol_v2"
SWEEP = (0.05, 0.08, 0.12, 0.15, 0.2, 0.3, 0.4)

# Per-predictor operating point (best IoU from eval/bench_models.py).
OP = {"c1": 0.05, "clipseg": 0.12}


def _clipseg(crop) -> np.ndarray:
    from eval.bench_models import clipseg_heat

    return clipseg_heat("CIDAS/clipseg-rd64-refined", crop.bgr, ["beard stubble"])


def evaluate_pair(name: str, img_path: Path, mask_path: Path) -> dict | None:
    bgr = _fit(cv2.imread(str(img_path), cv2.IMREAD_COLOR))
    det = detect_face(bgr)
    if det is None or not det.quality.passed:
        return {"id": name, "status": "gate_rejected"}

    gt = load_gt_mask(mask_path, bgr.shape[:2])
    skin = fit_skin_model(skin_reference_pixels(bgr, det.landmarks, det.face_width))
    crop = build_lower_face_crop(bgr, det.landmarks, det.face_width, det.face_height)
    shape = bgr.shape[:2]

    # `keep` is the DETECTION scope: what the segmenter is allowed to look at.
    # Stage 1 split this from the correction-side protect mask, so it follows
    # detect_protect_mask (blend still clamps the output with protect_mask).
    keep = _restore(
        crop.roi_mask * (1 - crop.detect_protect_mask), crop.bbox, shape) > 0.5
    bands = build_bands(shape, det.landmarks, det.face_width, det.face_height)

    m = segment_beard(crop, skin)
    preds = {
        # already plumbed inside segment_beard; listed under `keep` semantics
        "c1": _restore(np.maximum(m.hard, m.shadow), crop.bbox, shape),
        "clipseg": _restore(_clipseg(crop), crop.bbox, shape),
    }

    rec: dict = {"id": name, "status": "processed", "gtPixels": int(gt.sum()),
                 "predictors": {}}
    for pname, conf in preds.items():
        thr = OP[pname]
        entry: dict = {"thr": thr, "sweep": {}, "scopes": {}}
        for t in SWEEP:
            entry["sweep"][f"{t}"] = _score((conf > t) & keep, gt & keep)

        scopes = {"keep": (conf > thr) & keep}
        if pname != "c1":
            scopes["raw"] = conf > thr  # unclamped model output
        for scope, pred in scopes.items():
            entry["scopes"][scope] = {
                "overall": _score(pred, gt),
                "bands": band_recall(gt, pred, bands),
            }
        rec["predictors"][pname] = entry
    return rec


def _mean(vals: list) -> float | None:
    v = [x for x in vals if x is not None]
    return float(np.mean(v)) if v else None


def summarize(records: list[dict]) -> dict:
    proc = [r for r in records if r["status"] == "processed"]
    out: dict = {"pairs": len(records), "processed": len(proc), "predictors": {}}
    for pname in ("c1", "clipseg"):
        scopes = {}
        for scope in ("keep", "raw"):
            rows = [r["predictors"][pname]["scopes"][scope] for r in proc
                    if scope in r["predictors"][pname]["scopes"]]
            if not rows:
                continue
            scopes[scope] = {
                "overall": {k: _mean([r["overall"][k] for r in rows])
                            for k in ("iou", "precision", "recall")},
                "bands": {b: _mean([r["bands"][b]["recall"] for r in rows])
                          for b in (*BAND_NAMES, "unassigned")},
                "bandsPrecision": {b: _mean([r["bands"][b]["precision"] for r in rows])
                                   for b in BAND_NAMES},
            }
        sweep = {f"{t}": {k: _mean([r["predictors"][pname]["sweep"][f"{t}"][k] for r in proc])
                          for k in ("iou", "precision", "recall")} for t in SWEEP}
        out["predictors"][pname] = {"thr": OP[pname], "scopes": scopes, "sweep": sweep}
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="baseline", help="subdir name under outputs/protocol_v2")
    args = ap.parse_args()
    out = OUT_DIR / args.tag
    out.mkdir(parents=True, exist_ok=True)

    records = [evaluate_pair(*p) for p in discover_pairs()]
    s = summarize(records)

    print(f"processed {s['processed']}/{s['pairs']}\n")
    for pname, p in s["predictors"].items():
        print(f"--- {pname} (thr {p['thr']}) ---")
        for scope, sc in p["scopes"].items():
            o = sc["overall"]
            g = lambda v: f"{v:.3f}" if v is not None else "  -  "  # noqa: E731
            print(f"  {scope:5} overall  IoU={g(o['iou'])} P={g(o['precision'])} R={g(o['recall'])}")
            b, bp = sc["bands"], sc["bandsPrecision"]
            print("        bands R  " + "  ".join(
                f"{n}={g(b[n])}" for n in (*BAND_NAMES, "unassigned")))
            print("        bands P  " + "  ".join(
                f"{n}={g(bp[n])}" for n in BAND_NAMES))
        if "raw" in p["scopes"] and "keep" in p["scopes"]:
            rb, kb = p["scopes"]["raw"]["bands"], p["scopes"]["keep"]["bands"]
            print("        plumbing loss (raw -> keep):  " + "  ".join(
                f"{n}={(rb[n]-kb[n]):+.3f}" for n in BAND_NAMES
                if rb[n] is not None and kb[n] is not None))
        print()

    (out / "summary.json").write_text(json.dumps(s, indent=2))
    (out / "results.json").write_text(json.dumps(records, indent=2))
    print(f"outputs -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
