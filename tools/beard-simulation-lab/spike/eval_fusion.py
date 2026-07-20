"""Stage 3 A/B: does the grain gate turn zoom's recall into usable IoU?

Three methods, all scored against REGION GT at one global operating point each
(best mean IoU over the sweep, never per-image):

    full          baseline: whole-crop CLIPSeg raw sigmoid
    full x grain  baseline gated by the clean-skin-relative grain gate
    zoom x grain  Stage-2 zoom (recall source) gated by grain

Adopt only if BOTH mean and worst IoU beat `full`.
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
from spike.grain_gate import hysteresis  # noqa: E402

PROMPTS = ["beard stubble"]
SWEEP = np.round(np.arange(0.02, 0.61, 0.02), 2)
GATE_IDS = {"pic4", "pic2", "psd01", "psd05"}
OUT = Path(__file__).resolve().parents[1] / "outputs" / "visual_gate" / "stage3_fusion"
METHODS = ("full", "full_hyst", "zoom_hyst")


def _iou_r_p(pred, gt):
    inter = float((pred & gt).sum())
    return (inter / max((pred | gt).sum(), 1),
            inter / max(gt.sum(), 1), inter / max(pred.sum(), 1))


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    per: dict[str, dict] = {}
    for name, ip, mp in discover_pairs():
        bgr = _fit(cv2.imread(str(ip), cv2.IMREAD_COLOR))
        det = detect_face(bgr)
        if det is None or not det.quality.passed:
            continue
        shape = bgr.shape[:2]
        gt, _ = load_region_gt(load_gt_mask(mp, shape),
                               det.landmarks, det.face_width, det.face_height)
        crop = build_lower_face_crop(bgr, det.landmarks, det.face_width, det.face_height)
        dp = getattr(crop, "detect_protect_mask", None)
        dp = crop.protect_mask if dp is None else dp
        keep = _restore(crop.roi_mask * (1 - dp), crop.bbox, shape) > 0.5
        full = _restore(full_raw_heat(crop.bgr, PROMPTS), crop.bbox, shape)
        zoom = _restore(zoom_heat(crop.bgr, PROMPTS), crop.bbox, shape)
        per[name] = {"full": full, "zoom": zoom, "gt": gt,
                     "keep": keep, "bbox": crop.bbox, "bgr": bgr}
        print(f"  computed {name}")

    def pred_of(d, method, t):
        if method == "full":
            return (d["full"] > t) & d["keep"]
        if method == "full_hyst":
            return hysteresis(d["full"], d["keep"], t)
        return hysteresis(d["zoom"], d["keep"], t)

    def best(method):
        b = (-1.0, 0.0, [])
        for t in SWEEP:
            ious = [_iou_r_p(pred_of(d, method, t), d["gt"])[0] for d in per.values()]
            m = float(np.mean(ious))
            if m > b[0]:
                b = (m, float(t), ious)
        return b

    print(f"\n{'method':12} {'thr':>5} {'meanIoU':>8} {'worstIoU':>9}")
    res = {}
    for method in METHODS:
        m, t, ious = best(method)
        res[method] = (m, t, float(np.min(ious)), ious)
        print(f"{method:12} {t:>5.2f} {m:>8.3f} {min(ious):>9.3f}")

    ids = list(per.keys())
    print(f"\n{'id':7} " + " ".join(f"{m:>11}" for m in METHODS))
    for i, name in enumerate(ids):
        print(f"{name:7} " + " ".join(f"{res[m][3][i]:>11.3f}" for m in METHODS))

    for name in GATE_IDS & set(per):
        d = per[name]
        x0, y0, x1, y1 = d["bbox"]
        tiles = []
        for method in METHODS:
            t = res[method][1]
            pred = pred_of(d, method, t)
            iou, r, p = _iou_r_p(pred, d["gt"])
            o = d["bgr"].astype(np.float32).copy()
            for m, col, a in ((pred & ~d["gt"], (255, 90, 0), 0.40),
                              (d["gt"] & ~pred, (0, 0, 255), 0.80),
                              (d["gt"] & pred, (0, 230, 0), 0.60)):
                for c in range(3):
                    o[..., c] = np.where(m, (1 - a) * o[..., c] + a * col[c], o[..., c])
            til = o.astype(np.uint8)[y0:y1, x0:x1]
            H = 430
            til = cv2.resize(til, (int(til.shape[1] * H / til.shape[0]), H))
            bar = np.full((66, til.shape[1], 3), 22, np.uint8)
            cv2.putText(bar, method, (8, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.putText(bar, f"IoU {iou:.3f} R {r:.3f} P {p:.3f}", (8, 54),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.44, (200, 200, 200), 1)
            tiles.append(cv2.vconcat([bar, til]))
        w = max(t.shape[1] for t in tiles)
        tiles = [cv2.copyMakeBorder(t, 0, 0, 0, w - t.shape[1],
                                    cv2.BORDER_CONSTANT, value=(22, 22, 22)) for t in tiles]
        cv2.imwrite(str(OUT / f"fusion_{name}.jpg"), cv2.hconcat(tiles))
    print(f"\noutputs -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
