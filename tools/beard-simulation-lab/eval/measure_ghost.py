"""GhostResidual baseline: how much of each hair survives the current eraser?

Freezes candidates + thresholds from each dev photo's ORIGINAL (hash recorded),
runs the current pipeline stages, and scores the results on those frozen
candidates. Also writes a candidate overlay per photo so a human can check that
candidates are hairs, not moles or folds (the human-in-the-loop checkpoint).

The zone for candidates is the REGION ground truth, not the detector: the
question is "did the eraser remove the hairs a human says exist".
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.beard_segmentation import fit_skin_model, segment_beard  # noqa: E402
from engine.beard_shadow_corrector import build_correction_context, correct_crop  # noqa: E402
from engine.blend import composite_full, derive_soft_blend  # noqa: E402
from engine.detect_face import detect_face  # noqa: E402
from engine.lower_face_roi import build_lower_face_crop, skin_reference_pixels  # noqa: E402
from engine.pipeline import load_stage_config  # noqa: E402
from eval.ghost_ruler import (  # noqa: E402
    blackhat_maps, clean_thresholds, excess_map, find_candidates, score_result,
)
from eval.gt_region import load_region_gt  # noqa: E402
from eval.measure_waxiness import CONFIGS, clipseg_masks  # noqa: E402
from eval.run_owndomain_eval import _fit, discover_pairs, load_gt_mask  # noqa: E402

LAB = Path(__file__).resolve().parents[1]
STAGES = ("mild", "medium", "strong")
# One-time, human-confirmed exclusions of non-hair candidates (e.g. psd05's
# alar-fold shadow, confirmed via zoom overlay). Never grown to pass a gate.
_EXCLUSIONS = LAB / "spike" / "candidate_exclusions.json"


def _apply_exclusions(name: str, cands: list) -> list:
    if not _EXCLUSIONS.exists():
        return cands
    circles = json.loads(_EXCLUSIONS.read_text()).get(name, [])
    if not circles:
        return cands
    kept = []
    for c in cands:
        cy, cx = float(c.px[:, 0].mean()), float(c.px[:, 1].mean())
        if any((cx - e["x"]) ** 2 + (cy - e["y"]) ** 2 <= e["r"] ** 2
               for e in circles):
            continue
        kept.append(c)
    return kept


def prepare_photo(name: str, img_path: Path, gt_path: Path):
    """Everything frozen from the original: crop, GT zone, candidates, thresholds."""
    bgr = _fit(cv2.imread(str(img_path), cv2.IMREAD_COLOR))
    det = detect_face(bgr)
    if det is None or not det.quality.passed:
        return None
    shape = bgr.shape[:2]
    gt_full, _ = load_region_gt(load_gt_mask(gt_path, shape), det.landmarks,
                                det.face_width, det.face_height)
    skin = fit_skin_model(skin_reference_pixels(bgr, det.landmarks, det.face_width))
    crop = build_lower_face_crop(bgr, det.landmarks, det.face_width, det.face_height)
    x0, y0, x1, y1 = crop.bbox
    zone = gt_full[y0:y1, x0:x1] > 0.5
    # The GT region reaches the nose base and the lip line, where black-hat
    # fires on nostril and lip-boundary shadows -- structures that must never
    # be "hairs to erase". Subtract the protect mask, dilated a step.
    pk = max(3, int(0.012 * crop.face_width) | 1)
    protect_d = cv2.dilate(crop.protect_mask, np.ones((pk, pk), np.float32)) > 0.5
    zone &= ~protect_d & (crop.roi_mask > 0.5)

    maps = blackhat_maps(crop.bgr, crop.face_width)
    # Clean support: inside the editable crop, outside the (dilated) beard GT.
    # Calibration must not be contaminated by lip/nostril shadow tails or the
    # ROI silhouette edge, so the protect mask is dilated and the ROI eroded --
    # a dark tail in "clean" inflates the thresholds and blinds the ruler
    # (measured: pic1's clean clump p99 was HIGHER than its zone p99).
    k = np.ones((15, 15), np.uint8)
    gt_crop = gt_full[y0:y1, x0:x1] > 0.5
    rk = max(3, int(0.015 * crop.face_width) | 1)
    roi_er = cv2.erode((crop.roi_mask > 0.5).astype(np.uint8),
                       np.ones((rk, rk), np.uint8)) > 0
    clean = (roi_er & ~protect_d & ~(cv2.dilate(gt_crop.astype(np.uint8), k) > 0))
    thr = clean_thresholds(maps, clean)
    if thr is None:
        return None
    excess = excess_map(maps, thr)
    cands = _apply_exclusions(name, find_candidates(excess, zone, crop.face_width))

    cand_px = np.zeros(zone.shape, bool)
    for c in cands:
        cand_px[c.px[:, 0], c.px[:, 1]] = True
    digest = hashlib.sha256(cand_px.tobytes()).hexdigest()[:16]
    # Edit-key zone: undilated protect. The gate zone dilates protect to keep
    # lip/nostril shadow out of the FROZEN candidates, but that band swallowed
    # real soul-patch hairs that start right under the lip (user-confirmed on
    # psd03) -- the key may reach them; lip-corner controls guard the risk.
    # The GT itself also under-paints the under-lip shadow band (measured 60%
    # gap on pic2), so the key zone extends the GT UPWARD-only (downward would
    # walk onto the jaw silhouette shadow); the REGION principle is explicit
    # that over-painting inside beats missing hair.
    key_zone = gt_crop.copy()
    up = max(4, int(0.03 * crop.face_width))
    for s in range(1, up + 1):
        key_zone[:-s] |= gt_crop[s:]
    key_zone = (cv2.dilate(key_zone.astype(np.uint8),
                           np.ones((3, 3), np.uint8)) > 0)
    key_zone &= (crop.protect_mask < 0.5) & (crop.roi_mask > 0.5)
    return dict(bgr=bgr, det=det, skin=skin, crop=crop, zone=zone, thr=thr,
                cands=cands, cand_px=cand_px, digest=digest, clean=clean,
                maps=maps, name=name, key_zone=key_zone)


def build_broad_key(ctx: dict, percentile: float = 95.0,
                    mad_k: float = 3.0) -> np.ndarray:
    """High-recall hair key for the oracle spike -- SEPARATE from the gate.

    The gate's strict p99 candidates prove failure but under-cover visible
    hair, so editing only them would make the spike fail for key reasons, not
    mechanics reasons. This key lowers the calibration to max(p95, med+3MAD),
    applies NO mole heuristic (explicit human-confirmed exclusions instead),
    and must be approved on an overlay by a human before any result is scored.

    Detection is the UNION of absolute and luminance-relative black-hat: a
    hair inside the under-lip shadow band sits on already-dark skin, so its
    absolute darkness-excess is weak and the absolute key missed it
    (user-confirmed on pic2/psd03); dividing by local base luminance measures
    contrast and recovers it. The absolute branch keeps the well-lit hairs the
    relative branch alone would trade away. Union = recall-first, which is the
    point of an oracle key; precision is guarded by the zone, the exclusions,
    and the human approval of the overlay.
    """
    lum = cv2.cvtColor(ctx["crop"].bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    base = np.maximum(cv2.GaussianBlur(lum, (0, 0), 8.0), 8.0)
    key = np.zeros(lum.shape, bool)
    for variant_maps in (ctx["maps"],
                         {s: bh / base for s, bh in ctx["maps"].items()}):
        thr = {}
        for sname, bh in variant_maps.items():
            vals = bh[ctx["clean"]]
            med = float(np.median(vals))
            mad = float(np.median(np.abs(vals - med)))
            thr[sname] = max(float(np.percentile(vals, percentile)),
                             med + mad_k * mad)
        key |= excess_map(variant_maps, thr) > 0
    key &= ctx["key_zone"]
    if _EXCLUSIONS.exists():
        circles = json.loads(_EXCLUSIONS.read_text()).get(ctx["name"], [])
        if circles:
            yy, xx = np.mgrid[0:key.shape[0], 0:key.shape[1]]
            for c in circles:
                key &= ((yy - c["y"]) ** 2 + (xx - c["x"]) ** 2) > c["r"] ** 2
    return key


def overlay(ctx: dict, out_path: Path) -> None:
    """Candidate check sheet: original | candidates painted red (zone dim blue)."""
    crop = ctx["crop"]
    vis = crop.bgr.copy()
    zb = ctx["zone"] & ~ctx["cand_px"]
    vis[zb] = (0.75 * vis[zb] + 0.25 * np.array([255, 80, 0])).astype(np.uint8)
    vis[ctx["cand_px"]] = (0, 0, 255)
    h = 520
    tiles = []
    for lbl, im in (("ORIGINAL", crop.bgr), ("candidates RED (zone tinted)", vis)):
        t = cv2.resize(im, (int(im.shape[1] * h / im.shape[0]), h))
        bar = np.full((30, t.shape[1], 3), 22, np.uint8)
        cv2.putText(bar, lbl, (8, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                    (255, 255, 255), 1)
        tiles.append(cv2.vconcat([bar, t]))
    cv2.imwrite(str(out_path), cv2.hconcat(tiles))


def run_stages(ctx: dict) -> dict[str, np.ndarray]:
    """Current shipping-intent pipeline, per stage, returned as result CROPS."""
    bgr, crop, skin = ctx["bgr"], ctx["crop"], ctx["skin"]
    masks = clipseg_masks(crop, segment_beard(crop, skin))
    cctx = build_correction_context(crop, masks, skin)
    x0, y0, x1, y1 = crop.bbox
    out = {}
    for stage in STAGES:
        p = load_stage_config(CONFIGS, stage)
        corrected = correct_crop(crop, masks, p["shadow_strength"],
                                 p["hair_attenuation"], p.get("stubble_inpaint", False),
                                 strand_strength=p.get("strand_strength"),
                                 luma_shift_frac=p.get("luma_shift_frac", 0.75),
                                 regrain=p.get("regrain", False), context=cctx)
        soft = derive_soft_blend(crop, masks, p.get("feather_ratio", 0.035))
        result = composite_full(bgr, corrected, crop, soft, p.get("global_strength", 1.0))
        out[stage] = result[y0:y1, x0:x1]
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", required=True)
    args = ap.parse_args()
    out_dir = LAB / "outputs" / "ghost" / args.tag
    out_dir.mkdir(parents=True, exist_ok=True)

    records = []
    print(f"{'id':7} {'cands':>6} {'candPx':>7} {'dense%':>7} | "
          + " | ".join(f"{s}: Q90r surv area" for s in STAGES))
    for name, img_path, gt_path in discover_pairs():
        t0 = time.perf_counter()
        ctx = prepare_photo(name, img_path, gt_path)
        if ctx is None:
            print(f"{name}: face/GT gate failed")
            continue
        overlay(ctx, out_dir / f"cands_{name}.jpg")
        results = run_stages(ctx)
        rec = {"id": name, "nCandidates": len(ctx["cands"]),
               "candidatePx": int(ctx["cand_px"].sum()),
               "density": float(ctx["cand_px"].sum() / max(ctx["zone"].sum(), 1)),
               "candidateHash": ctx["digest"], "stages": {}}
        row = (f"{name:7} {rec['nCandidates']:6d} {rec['candidatePx']:7d} "
               f"{100*rec['density']:6.1f}% |")
        for stage in STAGES:
            v = score_result(results[stage], ctx["cands"], ctx["thr"],
                             ctx["crop"].face_width)
            rec["stages"][stage] = {
                "weightedQ90R": v.weightedQ90R, "survivalRate": v.survivalRate,
                "excessAreaRatio": v.excessAreaRatio}
            row += (f"  {v.weightedQ90R:.2f} {v.survivalRate:.2f} "
                    f"{v.excessAreaRatio:.2f} |")
        print(row + f"  ({time.perf_counter()-t0:.1f}s)")
        records.append(rec)

    (out_dir / "ghost.json").write_text(json.dumps(records, indent=2))
    med = {s: float(np.median([r["stages"][s]["weightedQ90R"] for r in records]))
           for s in STAGES}
    print("\nmedian weighted Q90 r:", "  ".join(f"{s}={v:.2f}" for s, v in med.items()))
    print(f"outputs -> {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
