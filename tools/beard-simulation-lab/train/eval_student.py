"""Evaluate the trained student on the 9 selfies, same yardstick as CLIPSeg.

Student heat is produced on the lower-face crop (resized to 256, the training
tile), restored to image space, clamped to keep, swept against REGION GT. Prints
mean/worst IoU next to the adopted CLIPSeg raw-sigmoid config and saves a visual
gate. This is the cross-domain test: ND-trained model on Korean selfies.
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.detect_face import detect_face  # noqa: E402
from engine.lower_face_roi import build_lower_face_crop  # noqa: E402
from eval.bench_models import clipseg_heat  # noqa: E402
from eval.gt_region import load_region_gt  # noqa: E402
from eval.run_owndomain_eval import (  # noqa: E402
    _fit, _restore, discover_pairs, load_gt_mask,
)
from train.unet import UNet  # noqa: E402

LAB = Path(__file__).resolve().parents[1]
CKPT = LAB / "outputs" / "student" / "unet_best.pt"
OUT = LAB / "outputs" / "visual_gate" / "stage4_student"
SWEEP = np.round(np.arange(0.02, 0.91, 0.02), 2)
TILE = 256


def _iou_r_p(pred, gt):
    inter = float((pred & gt).sum())
    return (inter / max((pred | gt).sum(), 1),
            inter / max(gt.sum(), 1), inter / max(pred.sum(), 1))


def load_model():
    ck = torch.load(CKPT, map_location="cpu")
    model = UNet(base=ck.get("base", 16))
    model.load_state_dict(ck["state"])
    model.eval()
    return model


@torch.no_grad()
def student_heat(model, crop_bgr) -> np.ndarray:
    rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    small = cv2.resize(rgb, (TILE, TILE), interpolation=cv2.INTER_AREA)
    x = torch.from_numpy(small.transpose(2, 0, 1))[None]
    heat = torch.sigmoid(model(x)).squeeze().numpy().astype(np.float32)
    return cv2.resize(heat, (crop_bgr.shape[1], crop_bgr.shape[0]))


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    model = load_model()
    per = {}
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
        stu = _restore(student_heat(model, crop.bgr), crop.bbox, shape)
        cli = _restore(clipseg_heat("CIDAS/clipseg-rd64-refined", crop.bgr,
                                    ["beard stubble"], normalize=False), crop.bbox, shape)
        per[name] = {"student": stu, "clipseg": cli, "gt": gt, "keep": keep,
                     "bbox": crop.bbox, "bgr": bgr}
        print(f"  computed {name}")

    def best(method):
        b = (-1.0, 0.0, [])
        for t in SWEEP:
            ious = [_iou_r_p((d[method] > t) & d["keep"], d["gt"])[0] for d in per.values()]
            m = float(np.mean(ious))
            if m > b[0]:
                b = (m, float(t), ious)
        return b

    print(f"\n{'method':9} {'thr':>5} {'meanIoU':>8} {'worstIoU':>9}")
    res = {}
    for method in ("clipseg", "student"):
        m, t, ious = best(method)
        res[method] = (m, t, ious)
        print(f"{method:9} {t:>5.2f} {m:>8.3f} {min(ious):>9.3f}")

    ids = list(per.keys())
    print(f"\n{'id':7} {'clipseg':>8} {'student':>8} {'delta':>7}")
    for i, name in enumerate(ids):
        c, s = res["clipseg"][2][i], res["student"][2][i]
        print(f"{name:7} {c:>8.3f} {s:>8.3f} {s - c:>+7.3f}")

    for name in per:
        d = per[name]
        x0, y0, x1, y1 = d["bbox"]
        tiles = []
        for method in ("clipseg", "student"):
            t = res[method][1]
            pred = (d[method] > t) & d["keep"]
            iou, r, p = _iou_r_p(pred, d["gt"])
            o = d["bgr"].astype(np.float32).copy()
            for m, col, a in ((pred & ~d["gt"], (255, 90, 0), 0.40),
                              (d["gt"] & ~pred, (0, 0, 255), 0.80),
                              (d["gt"] & pred, (0, 230, 0), 0.60)):
                for c in range(3):
                    o[..., c] = np.where(m, (1 - a) * o[..., c] + a * col[c], o[..., c])
            til = o.astype(np.uint8)[y0:y1, x0:x1]
            H = 380
            til = cv2.resize(til, (int(til.shape[1] * H / til.shape[0]), H))
            bar = np.full((60, til.shape[1], 3), 22, np.uint8)
            cv2.putText(bar, f"{method} thr{t:.2f}", (8, 24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
            cv2.putText(bar, f"IoU {iou:.3f} R {r:.3f} P {p:.3f}", (8, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (200, 200, 200), 1)
            tiles.append(cv2.vconcat([bar, til]))
        w = max(t.shape[1] for t in tiles)
        tiles = [cv2.copyMakeBorder(t, 0, 0, 0, w - t.shape[1],
                                    cv2.BORDER_CONSTANT, value=(22, 22, 22)) for t in tiles]
        cv2.imwrite(str(OUT / f"student_{name}.jpg"), cv2.hconcat(tiles))
    print(f"\noutputs -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
