"""One-shot holdout for the ERASER (not the detector). Run ONCE, never tune.

Every adopt/reject in Steps 0-4 was decided on the same 9 dev photos. hold1-3
were shot and labelled afterwards and are spent here a single time to check
whether the eraser generalizes. Config is FROZEN to what dev already chose:

    mask   = adopted CLIPSeg raw-sigmoid zone (thr 0.06) + C1 strands
    stage  = medium  (the stage the user selected from the dev review)
    all Step 2.5 / 3 / 4 engine changes at their committed defaults

Pre-registered gate (fixed BEFORE looking, so the photos cannot be tuned):
    G1 waxinessLocal(medium) in [0.7, 1.6] on >= 2/3   -- textured, not waxy, not hairy
    G2 chromaDeltaAb(medium) < original                -- the bluish cast is reduced
    G3 tonalSeam(medium)     <= 18.0                    -- no worse than the dev seam band
    G4 guard post-checks pass (or warn) on all 3       -- no geometry/seam regression
    G5 visual: no matte patch, no visible boundary, lips intact  -- read from the sheet

mild and strong are rendered for context only; the gate is medium.
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.beard_segmentation import fit_skin_model, segment_beard  # noqa: E402
from engine.beard_shadow_corrector import build_correction_context, correct_crop  # noqa: E402
from engine.blend import composite_full, derive_soft_blend  # noqa: E402
from engine.detect_face import detect_face, detect_landmarks  # noqa: E402
from engine.geometry_guard import run_post_checks  # noqa: E402
from engine.lower_face_roi import build_lower_face_crop, skin_reference_pixels  # noqa: E402
from engine.pipeline import load_stage_config  # noqa: E402
from engine.texture import chroma_delta_ab, tonal_seam_step, waxiness_score  # noqa: E402
from eval.measure_waxiness import (  # noqa: E402
    CONFIGS, ZONE_THR, clipseg_masks, _zone_full,
)
from eval.run_owndomain_eval import _fit, _restore, discover_holdout_pairs  # noqa: E402

LAB = Path(__file__).resolve().parents[1]
OUT = LAB / "outputs" / "waxiness" / "holdout_oneshot"
GATE_STAGE = "medium"


def _wax_local(img, zone, near_full):
    from engine.texture import grain_map, relative_grain_map
    if not zone.any() or near_full.sum() < 32 * 32:
        return None
    if float(np.median(grain_map(img)[near_full])) < 0.05:
        return None
    rel = relative_grain_map(img)
    ref = float(np.median(rel[near_full]))
    return float(np.median(rel[zone]) / ref) if ref > 1e-9 else None


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    pairs = discover_holdout_pairs()
    if not pairs:
        print("no holdout pairs found")
        return 1

    rows = []
    for name, ip, _mp in pairs:
        bgr = _fit(cv2.imread(str(ip), cv2.IMREAD_COLOR))
        det = detect_face(bgr)
        if det is None or not det.quality.passed:
            print(f"{name}: FACE GATE REJECTED")
            continue
        shape = bgr.shape[:2]
        skin = fit_skin_model(skin_reference_pixels(bgr, det.landmarks, det.face_width))
        crop = build_lower_face_crop(bgr, det.landmarks, det.face_width, det.face_height)
        masks = clipseg_masks(crop, segment_beard(crop, skin))
        ctx = build_correction_context(crop, masks, skin)
        zone = _zone_full(crop, masks, shape)
        lm, fw = det.landmarks, det.face_width

        union = np.maximum(masks.hard, masks.shadow)
        near = ((union < 0.10) * crop.roi_mask * (1 - crop.protect_mask))
        near = cv2.erode(near.astype(np.float32), np.ones((9, 9), np.float32))
        near_full = _restore(near, crop.bbox, shape) > 0.5

        x0, y0, x1, y1 = crop.bbox
        panels, stage_metrics = [bgr], {}
        for stage in ("mild", "medium", "strong"):
            p = load_stage_config(CONFIGS, stage)
            corrected = correct_crop(crop, masks, p["shadow_strength"],
                                     p["hair_attenuation"], p.get("stubble_inpaint", False),
                                     strand_strength=p.get("strand_strength"),
                                     luma_shift_frac=p.get("luma_shift_frac", 0.75),
                                     regrain=p.get("regrain", False), context=ctx)
            soft = derive_soft_blend(crop, masks, p.get("feather_ratio", 0.035))
            result = composite_full(bgr, corrected, crop, soft, p.get("global_strength", 1.0))
            soft_full = np.zeros(shape, np.float32)
            soft_full[y0:y1, x0:x1] = soft
            rep = run_post_checks(
                original=bgr, result=result, landmarks_before=det.landmarks,
                landmarks_after=detect_landmarks(result), interocular=det.interocular,
                face_height=det.face_height, soft_blend_full=soft_full, identity_mode="warn")
            stage_metrics[stage] = {
                "waxLocal": _wax_local(result, zone, near_full),
                "wax": waxiness_score(result, zone, lm, fw),
                "chroma": chroma_delta_ab(result, zone, lm, fw),
                "seam": tonal_seam_step(bgr, result, zone, fw),
                "guard": rep.passed, "reject": rep.reject_reason,
            }
            panels.append(result)

        rows.append((name, chroma_delta_ab(bgr, zone, lm, fw), stage_metrics))

        # review sheet: 4-up crop with the gate stage's metrics on the bar.
        h = 420
        tiles = []
        labels = ("ORIGINAL", "MILD", "MEDIUM", "STRONG")
        for label, img in zip(labels, panels):
            t = cv2.resize(img[y0:y1, x0:x1],
                           (int((x1 - x0) * h / (y1 - y0)), h))
            bar = np.full((54, t.shape[1], 3), 22, np.uint8)
            cv2.putText(bar, label, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                        (255, 255, 255), 2)
            if label != "ORIGINAL":
                m = stage_metrics[label.lower()]
                sub = (f"wax {m['waxLocal']:.2f}" if m['waxLocal'] else "wax n/a") + \
                      f"  seam {m['seam']:.1f}" if m['seam'] is not None else ""
                cv2.putText(bar, sub, (8, 44), cv2.FONT_HERSHEY_SIMPLEX, 0.42,
                            (200, 200, 200), 1)
            tiles.append(cv2.vconcat([bar, t]))
        cv2.imwrite(str(OUT / f"holdout_{name}.jpg"), cv2.hconcat(tiles))

    # ---- report + pre-registered gate --------------------------------------
    print(f"\n{'='*64}\nONE-SHOT HOLDOUT ERASER  (frozen: medium, adopted CLIPSeg mask)\n{'='*64}")
    print(f"{'id':7} {'orig_dE':>8} | medium: {'waxLocal':>9} {'chroma':>8} "
          f"{'seam':>6} {'guard':>6}")
    g1 = g2 = g3 = g4 = 0
    for name, orig_dE, sm in rows:
        m = sm[GATE_STAGE]
        wl = m["waxLocal"]
        print(f"{name:7} {orig_dE:8.2f} | {'':7} {wl if wl else float('nan'):9.2f} "
              f"{m['chroma']:8.2f} {m['seam']:6.1f} {str(m['guard']):>6}")
        if wl is not None and 0.7 <= wl <= 1.6:
            g1 += 1
        if m["chroma"] < orig_dE:
            g2 += 1
        if m["seam"] is not None and m["seam"] <= 18.0:
            g3 += 1
        if m["guard"]:
            g4 += 1
    n = len(rows)
    print(f"\nGATE (pre-registered):")
    print(f"  G1 waxLocal in [0.7,1.6]      : {g1}/{n}  (need >=2)  "
          f"{'PASS' if g1 >= 2 else 'FAIL'}")
    print(f"  G2 chroma < original          : {g2}/{n}  (need {n})  "
          f"{'PASS' if g2 == n else 'FAIL'}")
    print(f"  G3 seam <= 18.0               : {g3}/{n}  (need {n})  "
          f"{'PASS' if g3 == n else 'FAIL'}")
    print(f"  G4 guard passes              : {g4}/{n}  (need {n})  "
          f"{'PASS' if g4 == n else 'FAIL'}")
    print(f"  G5 visual (matte/seam/lips)  : read outputs/waxiness/holdout_oneshot/")
    print(f"\noutputs -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
