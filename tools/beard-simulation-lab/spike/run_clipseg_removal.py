"""End-to-end beard removal on our own selfies, using CLIPSeg as the segmenter.

Why not the existing `clipseg_prior` hook: it adds the prior only where C1
already fired (`shadow > 0.05`), and on Korean selfies C1 barely fires, so the
prior is a no-op (measured: C1 and C1+prior score identically, IoU 0.304).

Here CLIPSeg supplies the *region* (-> shadow channel, which the corrector
inpaints on the low-frequency layer) while C1's black-hat `hard` channel keeps
the *strand* detail (which the corrector attenuates on the high-frequency
layer). ROI and the lips/nostril protect mask still come from C1, so the
existing safety behaviour is preserved. engine/ is not modified.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.beard_segmentation import BeardMasks, fit_skin_model, segment_beard  # noqa: E402
from engine.beard_shadow_corrector import correct_crop  # noqa: E402
from engine.blend import composite_full, derive_soft_blend  # noqa: E402
from engine.detect_face import detect_face  # noqa: E402
from engine.lower_face_roi import (  # noqa: E402
    build_lower_face_crop,
    skin_reference_pixels,
)
from eval.bench_models import clipseg_heat  # noqa: E402
from eval.run_owndomain_eval import _fit, discover_pairs  # noqa: E402

MODEL = "CIDAS/clipseg-rd64-refined"
PROMPT = ["beard stubble"]
OUT_DIR = Path(__file__).resolve().parents[1] / "outputs" / "clipseg_removal"

# Operating point from eval/bench_models.py (best IoU on our own selfies).
HEAT_THR = 0.12
STAGES = {"mild": (0.35, 0.30), "medium": (0.60, 0.55), "strong": (0.85, 0.85)}


def refine_edges(heat: np.ndarray, bgr: np.ndarray, face_width: float) -> np.ndarray:
    """CLIPSeg sees 352x352 through ViT-B/16, so its heatmap carries only ~22x22
    of real spatial detail: upsampled to our crop it has staircase edges, and
    correcting through it smudges the chin. A guided filter re-snaps the mask to
    the photo's own edges without any training."""
    guide = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    radius = max(4, int(face_width / 40))
    return cv2.ximgproc.guidedFilter(guide, heat.astype(np.float32), radius, 1e-3)


def clipseg_masks(crop, skin_model, refine: bool = True) -> tuple[BeardMasks, BeardMasks]:
    """Return (c1_masks, clipseg_masks) for the same crop."""
    c1 = segment_beard(crop, skin_model)
    heat = clipseg_heat(MODEL, crop.bgr, PROMPT)
    if refine:
        heat = refine_edges(heat, crop.bgr, crop.face_width)

    # Soft-threshold the heat so faint background response does not bleed in,
    # then rescale so the surviving region keeps full strength.
    region = np.clip((heat - HEAT_THR) / (1.0 - HEAT_THR), 0, 1).astype(np.float32)
    keep = crop.roi_mask * (1.0 - crop.protect_mask)

    # `hard` drives high-frequency attenuation (hair_w = hard * hair_attenuation,
    # capped at 0.85) and the residual-dot inpaint (which triggers at hard > 0.45).
    # A weak factor here leaves the stubble dots visible, so keep it high.
    shadow = np.maximum(c1.shadow, region) * keep
    hard = np.maximum(c1.hard, region * 0.9) * keep
    stats = {**c1.stats, "clipsegRegionMean": float(region.mean())}
    return c1, BeardMasks(hard=hard, shadow=shadow, protect=c1.protect, stats=stats)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="strong", choices=sorted(STAGES))
    args = ap.parse_args()
    shadow_strength, hair_attenuation = STAGES[args.stage]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, img_path, _ in discover_pairs():
        bgr = _fit(cv2.imread(str(img_path), cv2.IMREAD_COLOR))
        det = detect_face(bgr)
        if det is None or not det.quality.passed:
            print(f"{name}: gate rejected")
            continue
        skin = fit_skin_model(skin_reference_pixels(bgr, det.landmarks, det.face_width))
        crop = build_lower_face_crop(bgr, det.landmarks, det.face_width, det.face_height)

        c1, cs = clipseg_masks(crop, skin)
        panels = [bgr]
        for label, masks in (("C1", c1), ("CLIPSeg", cs)):
            corrected = correct_crop(crop, masks, shadow_strength, hair_attenuation,
                                     stubble_inpaint=(args.stage == "strong"))
            blend = derive_soft_blend(crop, masks)
            full = composite_full(bgr, corrected, crop, blend)
            panels.append(full)
            del label

        h = 420
        panels = [cv2.resize(p, (int(p.shape[1] * h / p.shape[0]), h)) for p in panels]
        cv2.imwrite(str(OUT_DIR / f"removal_{name}.jpg"), cv2.hconcat(panels))
        print(f"{name}: written (original | C1 removal | CLIPSeg removal)")

    print(f"\nstage={args.stage}  outputs -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
