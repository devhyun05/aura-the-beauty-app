"""Free experiment: does an off-the-shelf public model (CLIPSeg) beat our
hand-written rules (C1) at finding facial hair on OUR OWN Korean selfies?

Both are scored against the same hand-painted green masks, restricted to the
same lower-face ROI, with the same IoU / precision / recall definitions.
CLIPSeg is used as a standalone segmenter here (not as C1's prior).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.beard_segmentation import (  # noqa: E402
    clipseg_beard_prior,
    fit_skin_model,
    segment_beard,
)
from engine.detect_face import detect_face  # noqa: E402
from engine.lower_face_roi import (  # noqa: E402
    build_lower_face_crop,
    skin_reference_pixels,
)
from eval.run_owndomain_eval import (  # noqa: E402
    _fit,
    _restore,
    _score,
    discover_pairs,
    load_gt_mask,
)

OUT_DIR = Path(__file__).resolve().parents[1] / "outputs" / "clipseg_compare"
THRESHOLDS = (0.2, 0.3, 0.4, 0.5)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pairs = discover_pairs()
    print(f"{len(pairs)} pairs\n")

    rows, tiles = [], []
    for name, img_path, mask_path in pairs:
        bgr = _fit(cv2.imread(str(img_path), cv2.IMREAD_COLOR))
        gt = load_gt_mask(mask_path, bgr.shape[:2])
        det = detect_face(bgr)
        if det is None or not det.quality.passed:
            print(f"{name}: gate rejected")
            continue

        skin = fit_skin_model(skin_reference_pixels(bgr, det.landmarks, det.face_width))
        crop = build_lower_face_crop(bgr, det.landmarks, det.face_width, det.face_height)
        masks = segment_beard(crop, skin)
        shape = bgr.shape[:2]
        editable = _restore(crop.roi_mask * (1 - crop.protect_mask), crop.bbox, shape) > 0.5

        c1 = np.maximum(_restore(masks.hard, crop.bbox, shape),
                        _restore(masks.shadow, crop.bbox, shape))

        # CLIPSeg on the same lower-face crop, resized back into the crop box.
        heat = clipseg_beard_prior(crop.bgr)
        heat = cv2.resize(heat, (crop.bgr.shape[1], crop.bgr.shape[0]))
        clip = _restore(heat.astype(np.float32), crop.bbox, shape)

        row = {"id": name, "c1": {}, "clipseg": {}}
        for thr in THRESHOLDS:
            row["c1"][f"{thr}"] = _score((c1 > thr) & editable, gt & editable)
            row["clipseg"][f"{thr}"] = _score((clip > thr) & editable, gt & editable)
        rows.append(row)

        def tint(base, m, color):
            o = base.astype(np.float32).copy()
            for c in range(3):
                o[..., c] = np.where(m, 0.4 * o[..., c] + 0.6 * color[c], o[..., c])
            return o.astype(np.uint8)

        strip = [bgr, tint(bgr, gt, (0, 200, 0)),
                 tint(bgr, (c1 > 0.3) & editable, (0, 0, 220)),
                 tint(bgr, (clip > 0.3) & editable, (220, 120, 0))]
        h = 300
        strip = [cv2.resize(t, (int(t.shape[1] * h / t.shape[0]), h)) for t in strip]
        cv2.imwrite(str(OUT_DIR / f"cmp_{name}.jpg"), cv2.hconcat(strip))
        a = row["c1"]["0.3"]
        b = row["clipseg"]["0.3"]
        f = lambda v: f"{v:.3f}" if v is not None else "  -  "  # noqa: E731
        print(f'{name:8}  C1: IoU {f(a["iou"])} P {f(a["precision"])} R {f(a["recall"])}   |   '
              f'CLIPSeg: IoU {f(b["iou"])} P {f(b["precision"])} R {f(b["recall"])}')

    def mean(model: str, thr: str, key: str):
        v = [r[model][thr][key] for r in rows if r[model][thr][key] is not None]
        return float(np.mean(v)) if v else None

    print("\n=== MEAN over %d selfies (roi) ===" % len(rows))
    print(f"{'model':10} {'thr':>5} {'IoU':>8} {'Precision':>10} {'Recall':>8}")
    best = {}
    for model in ("c1", "clipseg"):
        for thr in THRESHOLDS:
            i, p, r = (mean(model, f"{thr}", k) for k in ("iou", "precision", "recall"))
            g = lambda v: f"{v:.3f}" if v is not None else "  -  "  # noqa: E731
            print(f"{model:10} {thr:>5} {g(i):>8} {g(p):>10} {g(r):>8}")
            if i is not None and i > best.get(model, (0, None))[0]:
                best[model] = (i, thr)
        print()

    summary = {"pairs": len(rows), "bestByIoU": {k: {"iou": v[0], "thr": v[1]}
                                                for k, v in best.items()}, "rows": rows}
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2))
    print("best IoU  ->  " + "   ".join(
        f"{k}: {v[0]:.3f} @thr{v[1]}" for k, v in best.items()))
    print(f"\noutputs -> {OUT_DIR}  (cmp_*.jpg: original | GT green | C1 red | CLIPSeg orange)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
