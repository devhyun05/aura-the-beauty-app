"""Oracle-mask LaMa kill experiment (Codex #8 Q7 — cheapest kill first).

Question: with a PERFECT mask (REGION GT), does the hybrid mechanism produce
service-grade output, or do the three killers recur — mouth hallucination,
chin over-brightness, mottle? Fail here => NO-GO before any CLIPSeg plumbing
or ruler work is paid for.

Arms per photo (panel is NOT blinded — this is the operator's mechanism
check, not a user checkpoint):
  ORIG | LAMA (fill as-is, <=512 inference, fill upscaled back)
       | HYB  (LaMa low band + corrected donor high band: donor selection
              targets the LaMa low, not the beard-stained original low)

Mask policy here is the Codex #8 corrected one: GT zone + upward-only
extension, a NARROW lip hole (actual lip polygon + ~2px, not the wide 0.045fw
protect moat), nostril cores out, hard jaw clip (column-wise polyline from
JAW_OVAL — nothing below the jaw is ever masked or edited).
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB))

from engine.detect_face import JAW_OVAL, LIPS_OUTER  # noqa: E402
from eval.ghost_ruler import LOW_SIGMA_RATIO  # noqa: E402
from eval.gt_region import load_region_gt  # noqa: E402
from eval.measure_ghost import excess_map, prepare_photo  # noqa: E402
from eval.run_owndomain_eval import discover_pairs, load_gt_mask  # noqa: E402
from spike import lama_runner  # noqa: E402
from spike.zone_recon import quilt_high_field_v2  # noqa: E402

OUT = LAB / "outputs" / "ghost" / "oracle_kill"
LAMA_MAX_DIM = 512


def _smoothstep(t: np.ndarray) -> np.ndarray:
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _mod8_window(a0: int, a1: int, limit: int) -> tuple[int, int]:
    """Expand [a0, a1) to a multiple-of-8 length using real in-frame pixels."""
    need = (-(a1 - a0)) % 8
    grow_hi = min(need, limit - a1)
    a1 += grow_hi
    a0 -= min(need - grow_hi, a0)
    if (a1 - a0) % 8:
        a1 -= (a1 - a0) % 8  # frame smaller than needed: shrink instead
    return a0, a1


def oracle_mask(ctx: dict, gt_path: Path,
                under_jaw_margin: float = 0.0) -> np.ndarray:
    """GT REGION + upward extension, narrow lip hole, nostril cores out,
    hard jaw clip. Crop coordinates.

    under_jaw_margin (fw fraction): a hard clip exactly at the jaw polyline
    leaves any under-jaw stubble untouched right below a cleaned chin — a
    sharp shaved/hairy boundary (seen on psd04). A small margin follows the
    validated roi under_jaw_extend band; the roi_mask intersection still
    guarantees the neck proper is never entered (R5)."""
    crop, det, bgr = ctx["crop"], ctx["det"], ctx["bgr"]
    fw = crop.face_width
    x0, y0, x1, y1 = crop.bbox
    gt_full, _ = load_region_gt(load_gt_mask(gt_path, bgr.shape[:2]),
                                det.landmarks, det.face_width, det.face_height)
    gt_crop = gt_full[y0:y1, x0:x1] > 0.5
    # Upward-only extension (same rationale as the key zone: GT under-paints
    # the under-lip shadow band; downward would walk onto the jaw shadow).
    mask = gt_crop.copy()
    for s in range(1, max(4, int(0.03 * fw)) + 1):
        mask[:-s] |= gt_crop[s:]

    h, w = mask.shape
    yy = np.arange(h, dtype=np.float32)[:, None]

    # Narrow lip hole: actual polygon + ~2px raster safety. NOT the wide
    # protect moat (Codex #8: the moat structurally reintroduces the
    # under-lip miss; hallucination is caught by rulers/abstain instead).
    lip_pts = crop.landmarks[LIPS_OUTER].astype(np.int32)
    lip = np.zeros((h, w), np.uint8)
    cv2.fillPoly(lip, [lip_pts], 1)
    lip = cv2.dilate(lip, np.ones((5, 5), np.uint8)) > 0
    mask &= ~lip

    # Nostril cores (policy: nostril hairs stay; same radius as run_photo).
    lips_top = float(crop.landmarks[LIPS_OUTER][:, 1].min())
    nostril = (crop.protect_mask > 0.5) & (yy < lips_top - 2)
    ndist = cv2.distanceTransform((~nostril).astype(np.uint8), cv2.DIST_L2, 3)
    mask &= ndist >= max(4.0, 0.025 * fw)

    # Hard jaw clip, column-wise (R5: nothing below the jaw silhouette).
    jaw = crop.landmarks[JAW_OVAL].astype(np.float32)
    order = np.argsort(jaw[:, 0])
    jaw_y = np.interp(np.arange(w, dtype=np.float32),
                      jaw[order, 0], jaw[order, 1]).astype(np.float32)
    mask &= yy < jaw_y[None, :] + under_jaw_margin * fw

    mask &= crop.roi_mask > 0.5
    return mask


def run_lama_crop(ctx: dict, mask: np.ndarray) -> tuple[np.ndarray, dict]:
    """LaMa fill for the lower-face crop: mod-8 window with real frame pixels,
    <=512 inference, fill upscaled back and composited inside the mask only."""
    crop, bgr = ctx["crop"], ctx["bgr"]
    x0, y0, x1, y1 = crop.bbox
    fh, fwd = bgr.shape[:2]
    nx0, nx1 = _mod8_window(x0, x1, fwd)
    ny0, ny1 = _mod8_window(y0, y1, fh)
    win = bgr[ny0:ny1, nx0:nx1]
    wmask = np.zeros(win.shape[:2], np.uint8)
    wmask[y0 - ny0:y0 - ny0 + mask.shape[0],
          x0 - nx0:x0 - nx0 + mask.shape[1]] = mask.astype(np.uint8) * 255

    hh, ww = win.shape[:2]
    scale = min(1.0, LAMA_MAX_DIM / max(hh, ww))
    t0 = time.perf_counter()
    if scale < 1.0:
        th = max(8, int(hh * scale) // 8 * 8)
        tw = max(8, int(ww * scale) // 8 * 8)
        small = cv2.resize(win, (tw, th), interpolation=cv2.INTER_AREA)
        smask = (cv2.resize(wmask.astype(np.float32), (tw, th),
                            interpolation=cv2.INTER_AREA) > 64).astype(np.uint8)
        out_small = lama_runner.inpaint(small, smask)
        fill = cv2.resize(out_small, (ww, hh), interpolation=cv2.INTER_CUBIC)
    else:
        fill = lama_runner.inpaint(win, wmask)
    dt = time.perf_counter() - t0

    res = win.copy()
    res[wmask > 0] = fill[wmask > 0]
    crop_res = res[y0 - ny0:y0 - ny0 + mask.shape[0],
                   x0 - nx0:x0 - nx0 + mask.shape[1]]
    info = {"lamaSeconds": round(dt, 2), "inferenceScale": round(scale, 3),
            "windowHW": [hh, ww], "maskFrac": round(float(mask.mean()), 4)}
    return crop_res, info


def hybrid_compose(ctx: dict, lama_img: np.ndarray, mask: np.ndarray,
                   ) -> tuple[np.ndarray | None, dict]:
    """HYB arm: LaMa low band + corrected donor high band, dual-width seams."""
    crop = ctx["crop"]
    fw = crop.face_width
    sig = max(2.0, fw / LOW_SIGMA_RATIO)
    img = crop.bgr.astype(np.float32)
    orig_low = cv2.GaussianBlur(img, (0, 0), sigmaX=sig)
    orig_high = img - orig_low
    lama_low = cv2.GaussianBlur(lama_img.astype(np.float32), (0, 0), sigmaX=sig)
    lama_low_l = cv2.cvtColor(np.clip(lama_low, 0, 255).astype(np.uint8),
                              cv2.COLOR_BGR2GRAY).astype(np.float32)

    hair_excess = excess_map(ctx["maps"], ctx["thr"]) > 0
    donor, qinfo = quilt_high_field_v2(crop.bgr, ctx["clean"], fw,
                                       forbid=hair_excess,
                                       target_low_l=lama_low_l, rehipass=True)
    if donor is None:
        return None, {"abstain": "no donors", "quilt": qinfo}

    dt = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 3)
    w_low = _smoothstep(dt / max(2.0, 0.03 * fw))[..., None]
    w_high = _smoothstep(dt / max(2.0, 0.01 * fw))[..., None]
    out = (orig_low * (1 - w_low) + lama_low * w_low
           + orig_high * (1 - w_high) + donor * w_high)
    out = np.clip(np.rint(out), 0, 255).astype(np.uint8)
    # Bytes outside the mask are the original by construction (weights are 0
    # there and the band split sums back exactly); enforce anyway.
    out[~mask] = crop.bgr[~mask]

    l_shift = (lama_low_l - cv2.cvtColor(
        np.clip(orig_low, 0, 255).astype(np.uint8),
        cv2.COLOR_BGR2GRAY).astype(np.float32))[mask]
    info = {"quilt": qinfo,
            "fillLiftLQ50": round(float(np.percentile(l_shift, 50)), 2),
            "fillLiftLQ90": round(float(np.percentile(l_shift, 90)), 2)}
    return out, info


def label(img: np.ndarray, text: str) -> np.ndarray:
    out = img.copy()
    cv2.rectangle(out, (0, 0), (170, 34), (0, 0, 0), -1)
    cv2.putText(out, text, (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                (255, 255, 255), 2, cv2.LINE_AA)
    return out


def main() -> int:
    photos = sys.argv[1:] or ["pic1", "pic3", "psd01", "psd04"]
    OUT.mkdir(parents=True, exist_ok=True)
    pairs = {n: (p, g) for n, p, g in discover_pairs()}
    report = {}
    for name in photos:
        img_path, gt_path = pairs[name]
        ctx = prepare_photo(name, img_path, gt_path)
        if ctx is None:
            print(f"{name}: prepare_photo failed")
            continue
        mask = oracle_mask(ctx, gt_path)
        lama_img, linfo = run_lama_crop(ctx, mask)
        hyb_img, hinfo = hybrid_compose(ctx, lama_img, mask)
        info = {**linfo, **hinfo}

        crop = ctx["crop"]
        panel = np.hstack([label(crop.bgr, "ORIG"),
                           label(lama_img, "LAMA"),
                           label(hyb_img if hyb_img is not None else crop.bgr,
                                 "HYB")])
        cv2.imwrite(str(OUT / f"{name}_panel.png"), panel)
        cv2.imwrite(str(OUT / f"{name}_lama.png"), lama_img)
        if hyb_img is not None:
            cv2.imwrite(str(OUT / f"{name}_hyb.png"), hyb_img)
        ov = crop.bgr.copy()
        ov[mask] = (0.6 * ov[mask] + 0.4 * np.array([0, 255, 0])).astype(np.uint8)
        cv2.imwrite(str(OUT / f"{name}_mask.png"), ov)

        report[name] = info
        print(f"{name}: {json.dumps(info)}")
    (OUT / "report.json").write_text(json.dumps(
        {"meta": lama_runner.run_metadata(), "photos": report}, indent=2))
    print(f"\npanels -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
