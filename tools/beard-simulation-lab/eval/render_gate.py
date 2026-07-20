"""Mandatory visual gate: render what the detector actually did, per photo.

Rule 5 of the plan's discipline list. A stage is not adopted until a human has
looked at these. Mean IoU hid a spraying collapse (pic1 scored recall 1.000 at
precision 0.280 by painting the whole lower face); one glance at the overlay
made it obvious.

Colours are given in BGR because that is what cv2 writes -- the first version of
this overlay declared "orange" and rendered blue.

    GREEN (0,230,0)  found      = GT and predicted
    RED   (0,0,255)  MISSED     = GT, not predicted   <- recall loss
    BLUE  (255,90,0) false pos  = predicted, not GT   <- precision loss

Usage:
    python eval/render_gate.py --tag stage1 [--ids pic1,psd04]
    python eval/render_gate.py --tag baseline --engine-rev bd707a0   # (checkout first)
"""

from __future__ import annotations

import argparse
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
from eval.run_owndomain_eval import (  # noqa: E402
    _fit,
    _restore,
    discover_pairs,
    load_gt_mask,
)

OUT_DIR = Path(__file__).resolve().parents[1] / "outputs" / "visual_gate"
FOUND, MISSED, FALSE_POS = (0, 230, 0), (0, 0, 255), (255, 90, 0)  # BGR
OP = {"c1": 0.05, "clipseg": 0.12}


def overlay(img: np.ndarray, gt: np.ndarray, pred: np.ndarray) -> np.ndarray:
    out = img.astype(np.float32).copy()
    layers = ((pred & ~gt, FALSE_POS, 0.40), (gt & ~pred, MISSED, 0.80),
              (gt & pred, FOUND, 0.60))
    for mask, colour, alpha in layers:
        for c in range(3):
            out[..., c] = np.where(mask, (1 - alpha) * out[..., c] + alpha * colour[c],
                                   out[..., c])
    return out.astype(np.uint8)


def _titled(img: np.ndarray, title: str, sub: str, height: int = 430) -> np.ndarray:
    w = int(img.shape[1] * height / img.shape[0])
    img = cv2.resize(img, (w, height), interpolation=cv2.INTER_CUBIC)
    bar = np.full((70, w, 3), 22, np.uint8)
    cv2.putText(bar, title, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.72, (255, 255, 255), 2)
    cv2.putText(bar, sub, (10, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (200, 200, 200), 1)
    return cv2.vconcat([bar, img])


def _pad(tiles: list[np.ndarray]) -> list[np.ndarray]:
    w = max(t.shape[1] for t in tiles)
    return [cv2.copyMakeBorder(t, 0, 0, 0, w - t.shape[1], cv2.BORDER_CONSTANT,
                               value=(22, 22, 22)) for t in tiles]


def predictions(bgr: np.ndarray) -> tuple | None:
    det = detect_face(bgr)
    if det is None or not det.quality.passed:
        return None
    skin = fit_skin_model(skin_reference_pixels(bgr, det.landmarks, det.face_width))
    crop = build_lower_face_crop(bgr, det.landmarks, det.face_width, det.face_height)
    shape = bgr.shape[:2]
    dp = getattr(crop, "detect_protect_mask", None)
    dp = crop.protect_mask if dp is None else dp
    keep = _restore(crop.roi_mask * (1 - dp), crop.bbox, shape) > 0.5

    from eval.bench_models import clipseg_heat

    masks = segment_beard(crop, skin)
    c1 = _restore(np.maximum(masks.hard, masks.shadow), crop.bbox, shape)
    cs = _restore(clipseg_heat("CIDAS/clipseg-rd64-refined", crop.bgr, ["beard stubble"]),
                  crop.bbox, shape)
    return crop, keep, {"c1": c1 > OP["c1"], "clipseg": cs > OP["clipseg"]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", required=True)
    ap.add_argument("--ids", default="", help="comma-separated subset; default all")
    args = ap.parse_args()
    wanted = {s for s in args.ids.split(",") if s}

    out = OUT_DIR / args.tag
    out.mkdir(parents=True, exist_ok=True)
    print(f"{'id':8} {'model':9} {'recall':>7} {'prec':>7} {'IoU':>7}")

    for name, img_path, mask_path in discover_pairs():
        if wanted and name not in wanted:
            continue
        bgr = _fit(cv2.imread(str(img_path), cv2.IMREAD_COLOR))
        got = predictions(bgr)
        if got is None:
            print(f"{name:8} gate rejected")
            continue
        crop, keep, preds = got
        gt = load_gt_mask(mask_path, bgr.shape[:2])
        x0, y0, x1, y1 = crop.bbox

        tiles = []
        for model, pred in preds.items():
            pred = pred & keep
            inter = float((gt & pred).sum())
            r = inter / max(gt.sum(), 1)
            p = inter / max(pred.sum(), 1)
            iou = inter / max((gt | pred).sum(), 1)
            print(f"{name:8} {model:9} {r:>7.3f} {p:>7.3f} {iou:>7.3f}")
            tile = overlay(bgr, gt, pred)[y0:y1, x0:x1]
            tiles.append(_titled(
                tile, f"{model}",
                f"R {r:.3f}  P {p:.3f}  IoU {iou:.3f}   "
                f"GREEN=found  RED=MISSED  BLUE=false-pos"))
        cv2.imwrite(str(out / f"gate_{name}.jpg"), cv2.hconcat(_pad(tiles)))

    print(f"\noutputs -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
