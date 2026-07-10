"""The one-shot holdout check. FROZEN thresholds -- no sweeping here, ever.

Stages 0-4 made every adopt/reject call against the same 9 dev photos, so those
numbers are optimistic by construction. These 3 photos were shot and labelled
afterwards. Choosing an operating point on them would convert them into another
dev set, so the thresholds below are the ones already fixed on dev:

    clipseg raw-sigmoid  thr 0.06   (adopted config)
    student  U-Net       thr 0.02   (its dev-best)

Scored on the REGION ground truth, clamped to the detection keep scope, exactly
as the dev protocol scores.
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.detect_face import detect_face  # noqa: E402
from engine.lower_face_roi import build_lower_face_crop  # noqa: E402
from eval.bench_models import clipseg_heat  # noqa: E402
from eval.gt_region import load_region_gt  # noqa: E402
from eval.run_owndomain_eval import (  # noqa: E402
    _fit, _restore, discover_holdout_pairs, load_gt_mask,
)

FROZEN = {"clipseg": 0.06, "student": 0.02}
OUT = Path(__file__).resolve().parents[1] / "outputs" / "visual_gate" / "holdout"


def _iou_r_p(pred, gt):
    inter = float((pred & gt).sum())
    return (inter / max((pred | gt).sum(), 1),
            inter / max(gt.sum(), 1), inter / max(pred.sum(), 1))


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        from train.eval_student import load_model, student_heat
        model = load_model()
    except Exception as exc:  # noqa: BLE001
        print(f"student unavailable ({exc}); scoring clipseg only")
        model = None

    rows = []
    for name, ip, mp in discover_holdout_pairs():
        bgr = _fit(cv2.imread(str(ip), cv2.IMREAD_COLOR))
        det = detect_face(bgr)
        if det is None or not det.quality.passed:
            print(f"{name}: face gate REJECTED")
            continue
        shape = bgr.shape[:2]
        gt, clipped = load_region_gt(load_gt_mask(mp, shape),
                                     det.landmarks, det.face_width, det.face_height)
        crop = build_lower_face_crop(bgr, det.landmarks, det.face_width, det.face_height)
        dp = getattr(crop, "detect_protect_mask", None)
        dp = crop.protect_mask if dp is None else dp
        keep = _restore(crop.roi_mask * (1 - dp), crop.bbox, shape) > 0.5

        preds = {"clipseg": _restore(
            clipseg_heat("CIDAS/clipseg-rd64-refined", crop.bgr, ["beard stubble"],
                         normalize=False), crop.bbox, shape)}
        if model is not None:
            preds["student"] = _restore(student_heat(model, crop.bgr), crop.bbox, shape)

        tiles, scores = [], {}
        for method, heat in preds.items():
            pred = (heat > FROZEN[method]) & keep
            iou, r, p = _iou_r_p(pred, gt)
            scores[method] = (iou, r, p)
            o = bgr.astype(np.float32).copy()
            for m, col, a in ((pred & ~gt, (255, 90, 0), 0.40),
                              (gt & ~pred, (0, 0, 255), 0.80),
                              (gt & pred, (0, 230, 0), 0.60)):
                for c in range(3):
                    o[..., c] = np.where(m, (1 - a) * o[..., c] + a * col[c], o[..., c])
            x0, y0, x1, y1 = crop.bbox
            til = o.astype(np.uint8)[y0:y1, x0:x1]
            H = 400
            til = cv2.resize(til, (int(til.shape[1] * H / til.shape[0]), H))
            bar = np.full((62, til.shape[1], 3), 22, np.uint8)
            cv2.putText(bar, f"{method} thr{FROZEN[method]:.2f} (frozen)", (8, 24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 2)
            cv2.putText(bar, f"IoU {iou:.3f} R {r:.3f} P {p:.3f}", (8, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (200, 200, 200), 1)
            tiles.append(cv2.vconcat([bar, til]))
        w = max(t.shape[1] for t in tiles)
        tiles = [cv2.copyMakeBorder(t, 0, 0, 0, w - t.shape[1],
                                    cv2.BORDER_CONSTANT, value=(22, 22, 22)) for t in tiles]
        cv2.imwrite(str(OUT / f"holdout_{name}.jpg"), cv2.hconcat(tiles))
        rows.append((name, int(gt.sum()), clipped, scores))

    methods = list(FROZEN) if model is not None else ["clipseg"]
    print(f"\n{'id':7} {'gtPx':>8} {'clip':>6} " +
          " ".join(f"{m+' IoU':>12} {'R':>6} {'P':>6}" for m in methods))
    for name, gtpx, clipped, sc in rows:
        line = f"{name:7} {gtpx:>8} {clipped:>6} "
        for m in methods:
            iou, r, p = sc[m]
            line += f"{iou:>12.3f} {r:>6.3f} {p:>6.3f} "
        print(line)
    for m in methods:
        ious = [sc[m][0] for _, _, _, sc in rows]
        if ious:
            print(f"\n{m}: holdout mean IoU {np.mean(ious):.3f}  worst {min(ious):.3f}")
    print(f"\noutputs -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
