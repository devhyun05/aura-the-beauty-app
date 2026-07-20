"""A/B: full-crop CLIPSeg vs tile-zoom, scored against REGION GT.

Both are raw sigmoid on the same scale, so a shared threshold sweep is a fair
comparison. We pick ONE global operating point per method (best mean IoU over
the sweep) -- never per-image, which would be cheating -- then report mean and
worst-case IoU. Adoption rule (plan): zoom is adopted only if BOTH mean and
worst IoU improve.
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.detect_face import detect_face  # noqa: E402
from engine.lower_face_roi import build_lower_face_crop  # noqa: E402
from eval.gt_region import load_region_gt  # noqa: E402
from eval.run_owndomain_eval import (  # noqa: E402
    _fit, _restore, discover_pairs, load_gt_mask,
)
from spike.clipseg_zoom import full_raw_heat, zoom_heat  # noqa: E402

PROMPTS = ["beard stubble"]
SWEEP = np.round(np.arange(0.02, 0.61, 0.02), 2)
GATE_IDS = {"pic4", "pic2", "psd05"}  # spray / timid / good
OUT = Path(__file__).resolve().parents[1] / "outputs" / "visual_gate" / "stage2_zoom"


def _iou_r_p(pred: np.ndarray, gt: np.ndarray) -> tuple[float, float, float]:
    inter = float((pred & gt).sum())
    return (inter / max((pred | gt).sum(), 1),
            inter / max(gt.sum(), 1),
            inter / max(pred.sum(), 1))


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    per: dict[str, dict] = {}  # id -> {"full": heat, "zoom": heat, "gt", "keep", "bbox", "bgr"}
    for name, ip, mp in discover_pairs():
        bgr = _fit(cv2.imread(str(ip), cv2.IMREAD_COLOR))
        det = detect_face(bgr)
        if det is None or not det.quality.passed:
            continue
        gt, _ = load_region_gt(load_gt_mask(mp, bgr.shape[:2]),
                               det.landmarks, det.face_width, det.face_height)
        crop = build_lower_face_crop(bgr, det.landmarks, det.face_width, det.face_height)
        dp = getattr(crop, "detect_protect_mask", None)
        dp = crop.protect_mask if dp is None else dp
        keep = _restore(crop.roi_mask * (1 - dp), crop.bbox, bgr.shape[:2]) > 0.5
        full = _restore(full_raw_heat(crop.bgr, PROMPTS), crop.bbox, bgr.shape[:2])
        zoom = _restore(zoom_heat(crop.bgr, PROMPTS), crop.bbox, bgr.shape[:2])
        per[name] = {"full": full, "zoom": zoom, "gt": gt, "keep": keep,
                     "bbox": crop.bbox, "bgr": bgr}
        print(f"  computed {name}")

    def best_point(method: str) -> tuple[float, float, float, list]:
        best = (-1.0, 0.0, [])  # mean_iou, thr, per_image_iou
        for t in SWEEP:
            ious = []
            for d in per.values():
                pred = (d[method] > t) & d["keep"]
                ious.append(_iou_r_p(pred, d["gt"])[0])
            m = float(np.mean(ious))
            if m > best[0]:
                best = (m, float(t), ious)
        mean_iou, thr, ious = best
        return mean_iou, thr, float(np.min(ious)), ious

    print(f"\n{'method':8} {'thr':>5} {'meanIoU':>8} {'worstIoU':>9}")
    res = {}
    for method in ("full", "zoom"):
        mean_iou, thr, worst, ious = best_point(method)
        res[method] = (mean_iou, thr, worst, ious)
        print(f"{method:8} {thr:>5.2f} {mean_iou:>8.3f} {worst:>9.3f}")

    print(f"\n{'id':7} {'full IoU':>8} {'zoom IoU':>8} {'delta':>7}")
    ids = list(per.keys())
    for i, name in enumerate(ids):
        f, z = res["full"][3][i], res["zoom"][3][i]
        print(f"{name:7} {f:>8.3f} {z:>8.3f} {z - f:>+7.3f}")

    # visual gate on the three diagnostic photos, at each method's own best thr
    for name in GATE_IDS & set(per):
        d = per[name]
        x0, y0, x1, y1 = d["bbox"]
        tiles = []
        for method in ("full", "zoom"):
            thr = res[method][1]
            pred = (d[method] > thr) & d["keep"]
            iou, r, p = _iou_r_p(pred, d["gt"])
            o = d["bgr"].astype(np.float32).copy()
            for m, col, a in ((pred & ~d["gt"], (255, 90, 0), 0.40),
                              (d["gt"] & ~pred, (0, 0, 255), 0.80),
                              (d["gt"] & pred, (0, 230, 0), 0.60)):
                for c in range(3):
                    o[..., c] = np.where(m, (1 - a) * o[..., c] + a * col[c], o[..., c])
            t = o.astype(np.uint8)[y0:y1, x0:x1]
            H = 430
            t = cv2.resize(t, (int(t.shape[1] * H / t.shape[0]), H))
            bar = np.full((66, t.shape[1], 3), 22, np.uint8)
            cv2.putText(bar, f"{method}  thr{thr:.2f}", (8, 26),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.62, (255, 255, 255), 2)
            cv2.putText(bar, f"IoU {iou:.3f}  R {r:.3f}  P {p:.3f}", (8, 54),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.46, (200, 200, 200), 1)
            tiles.append(cv2.vconcat([bar, t]))
        w = max(t.shape[1] for t in tiles)
        tiles = [cv2.copyMakeBorder(t, 0, 0, 0, w - t.shape[1],
                                    cv2.BORDER_CONSTANT, value=(22, 22, 22)) for t in tiles]
        cv2.imwrite(str(OUT / f"zoom_{name}.jpg"), cv2.hconcat(tiles))
    print(f"\noutputs -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
