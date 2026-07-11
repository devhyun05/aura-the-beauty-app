"""Guarded-LaMa hybrid v1 — PRODUCTION configuration (no GT anywhere).

Pipeline: CLIPSeg raw-sigmoid zone ∪ soft black-hat evidence ∪ frozen-grade
candidates -> anatomy-guarded mask (narrow lip hole, nostril cores out,
jaw+0.06fw clip ∩ roi) -> deterministic LaMa fill (<=512 inference) composited
as-is inside the mask, bytes outside identical.

Single-source decision (oracle kill test 2026-07-11): LaMa's own low AND high
band inside the mask. Donor re-grain is OFF — the corrected quilt still loses
the visual gate to LaMa's native texture (grid mottle; psd04 nDonors=1);
re-grain returns only as a grainMatch-gated follow-up.

The GT REGION masks are used by the RULERS for scoring dev photos, never by
this pipeline — tuning the mask with GT would tune a pipeline that does not
exist in service (Codex #8).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB))

from engine.beard_segmentation import fit_skin_model, segment_beard  # noqa: E402
from engine.detect_face import (  # noqa: E402
    FACE_OVAL, JAW_OVAL, LIPS_OUTER, NOSE_BOTTOM, detect_face,
)
from engine.lower_face_roi import build_lower_face_crop, skin_reference_pixels  # noqa: E402
from eval.ghost_ruler import (  # noqa: E402
    LOW_SIGMA_RATIO, blackhat_maps, clean_thresholds, excess_map,
    find_candidates,
)
from eval.measure_ghost import _apply_exclusions, build_soft_high_weight  # noqa: E402
from eval.measure_waxiness import CLIPSEG_MODEL, CLIPSEG_THR  # noqa: E402
from eval.run_owndomain_eval import _fit  # noqa: E402
from spike import lama_runner  # noqa: E402
from spike.oracle_kill import _mod8_window, _smoothstep, label  # noqa: E402

OUT = LAB / "outputs" / "ghost" / "hybrid"

# dev9 candidate config — frozen BEFORE the one-shot dev9 run (Codex #9 Q5).
# Recorded verbatim into every report.json.
CONFIG = {
    "lamaMaxDim": 512,
    # fw fraction below the JAW_OVAL polyline that stays maskable; ∩ roi
    # bounds it further. NOTE (Codex #9): roi is a geometric proxy
    # (face-oval pushed down 0.08*face_height), NOT a neck segmentation —
    # this is a dev9 candidate, not an R5 "guarantee".
    "underJawMargin": 0.06,
    "softHighThr": 0.3,
    # Zone edit threshold on the C1∪CLIPSeg union field. Serving ZONE_THR=0.5
    # measured 6.6% GT recall on dev9 — unusable for "아예 깨끗" (R1/R4).
    # Sweep on dev9 GT (scoring-only use): 0.06->70%, 0.03->83%, 0.01->91%
    # recall. 0.03 adopted: over-mask under LaMa costs texture, not anatomy
    # (lip hole / nostril cores / jaw clip carry the anatomy risk).
    "zoneEditThr": 0.03,
    # model_mask = edit_mask closed + dilated this much: LaMa sees a slightly
    # larger hole so boundary stubble doesn't condition the fill, but the
    # composite writes edit_mask pixels ONLY (Codex #9 Q4).
    "modelMaskDilate": 0.004,
    "hairHaloDilate": 0.003,
}


def production_zone_soft(crop, skin) -> np.ndarray:
    """Serving zone field in [0,1], crop coords: C1 detector ∪ CLIPSeg
    raw-sigmoid region (thr 0.06 onset, fw/45 smoothing) — the adopted
    clipseg_masks union, but WITHOUT the wide protect-mask carving:
    under-lip beard must stay maskable (Codex #8 Q2); lips get a narrow
    hard hole later instead."""
    from eval.bench_models import clipseg_heat

    c1 = segment_beard(crop, skin)
    heat = clipseg_heat(CLIPSEG_MODEL, crop.bgr, ["beard stubble"],
                        normalize=False)
    heat = cv2.GaussianBlur(heat, (0, 0), sigmaX=max(2.0, crop.face_width / 45))
    region = np.clip((heat - CLIPSEG_THR) / (1.0 - CLIPSEG_THR), 0, 1)
    # NOT roi-scoped here: the editable-region guard (roi ∪ cheek extension)
    # is applied at mask build; scoping the field to roi would zero the
    # evidence exactly where the extension needs it (pic3 mustache flanks).
    union = np.maximum(np.maximum(c1.hard, c1.shadow), region)
    return union.astype(np.float32)


def prepare_unlabeled(name: str, img_path: Path) -> dict | None:
    """prepare_photo counterpart with the CLIPSeg zone in place of GT."""
    bgr = _fit(cv2.imread(str(img_path), cv2.IMREAD_COLOR))
    if bgr is None:
        return None
    det = detect_face(bgr)
    if det is None or not det.quality.passed:
        return None
    skin = fit_skin_model(skin_reference_pixels(bgr, det.landmarks,
                                                det.face_width))
    crop = build_lower_face_crop(bgr, det.landmarks, det.face_width,
                                 det.face_height)
    fw = crop.face_width

    zone_soft = production_zone_soft(crop, skin)
    # Edit-threshold zone, NOT the serving ZONE_THR=0.5: key_zone/cand_zone
    # derive from this, and at 0.5 (6.6% GT recall) the soft-high evidence
    # and candidates never reach the mustache flanks they must cover
    # (measured pic3: flank stubble in-roi but outside every evidence zone).
    zone = zone_soft > CONFIG["zoneEditThr"]

    pk = max(3, int(0.012 * fw) | 1)
    protect_d = cv2.dilate(crop.protect_mask, np.ones((pk, pk), np.float32)) > 0.5

    maps = blackhat_maps(crop.bgr, fw)
    # Clean calibration support. Excluding the (dilated) 0.03-threshold zone
    # is purest, but on hairy/small crops it starves the calibration: pic1
    # kept 2.6k px and the thresholds collapsed to strand=2.0 (vs a sane 15),
    # reading the whole fill's normal texture as hair. Deterministic ladder:
    # raise the EXCLUSION threshold until enough clean survives; the ladder
    # level is recorded — higher levels admit borderline stubble into the
    # reference, so downstream dark gates read conservative, not inflated.
    rk = max(3, int(0.015 * fw) | 1)
    roi_er = cv2.erode((crop.roi_mask > 0.5).astype(np.uint8),
                       np.ones((rk, rk), np.uint8)) > 0
    k15 = np.ones((15, 15), np.uint8)
    roi_px = float((crop.roi_mask > 0.5).sum())
    clean = None
    clean_ladder = None
    for excl_thr in (CONFIG["zoneEditThr"], 0.06, 0.12, 0.20, 0.50):
        cand_clean = roi_er & ~protect_d & ~(
            cv2.dilate((zone_soft > excl_thr).astype(np.uint8), k15) > 0)
        if cand_clean.sum() >= max(1500, 0.10 * roi_px):
            clean, clean_ladder = cand_clean, excl_thr
            break
    if clean is None:
        return None
    thr = clean_thresholds(maps, clean)
    if thr is None:
        return None
    excess = excess_map(maps, thr)

    # Key zone: zone + upward-only extension (under-lip shadow band recall),
    # undilated protect subtraction — mirrors prepare_photo's key semantics.
    key_zone = zone.copy()
    for s in range(1, max(4, int(0.03 * fw)) + 1):
        key_zone[:-s] |= zone[s:]
    # No roi scoping (the editable guard at mask build owns the boundary);
    # undilated protect subtraction mirrors prepare_photo's key semantics.
    key_zone &= crop.protect_mask < 0.5

    cand_zone = key_zone & ~protect_d
    cands = _apply_exclusions(name, find_candidates(excess, cand_zone, fw))

    return dict(bgr=bgr, det=det, skin=skin, crop=crop, zone=zone,
                zone_soft=zone_soft, thr=thr, maps=maps, clean=clean,
                clean_ladder=clean_ladder, key_zone=key_zone,
                cand_zone=cand_zone, cands_ext=cands, name=name)


def _anatomy_guards(crop) -> dict:
    """Shared guard masks: narrow lip hole, nostril cores, below-jaw region.
    Applied to BOTH edit and model masks — the model must keep seeing the
    lips/jaw as context, or the fill loses the anatomy it must respect."""
    h, w = crop.bgr.shape[:2]
    fw = crop.face_width
    yy = np.arange(h, dtype=np.float32)[:, None]

    lip_pts = crop.landmarks[LIPS_OUTER].astype(np.int32)
    lip = np.zeros((h, w), np.uint8)
    cv2.fillPoly(lip, [lip_pts], 1)
    lip = cv2.dilate(lip, np.ones((5, 5), np.uint8)) > 0

    lips_top = float(crop.landmarks[LIPS_OUTER][:, 1].min())
    nostril = (crop.protect_mask > 0.5) & (yy < lips_top - 2)
    ndist = cv2.distanceTransform((~nostril).astype(np.uint8), cv2.DIST_L2, 3)
    nostril_core = ndist < max(4.0, 0.025 * fw)

    jaw = crop.landmarks[JAW_OVAL].astype(np.float32)
    order = np.argsort(jaw[:, 0])
    jaw_y = np.interp(np.arange(w, dtype=np.float32),
                      jaw[order, 0], jaw[order, 1]).astype(np.float32)
    below_jaw = yy >= jaw_y[None, :] + CONFIG["underJawMargin"] * fw

    # Editable region: roi ∪ (below the nose line ∩ inside the face oval).
    # The roi's upper boundary cuts through mustache-flank stubble that grows
    # up the cheek (measured pic3: 3.4k residual hair px OUTSIDE roi vs 0.65k
    # inside the mask) — the same structural miss the under-jaw margin fixed
    # below. The face-oval fill keeps hairline/背景 out; the nose line and the
    # nostril cores keep the nose out.
    oval = np.zeros((h, w), np.uint8)
    cv2.fillPoly(oval, [crop.landmarks[FACE_OVAL].astype(np.int32)], 1)
    below_nose = yy > float(crop.landmarks[NOSE_BOTTOM][1]) + 0.01 * fw
    editable = (crop.roi_mask > 0.5) | ((oval > 0) & below_nose)

    return {"lip": lip, "nostril_core": nostril_core, "below_jaw": below_jaw,
            "editable": editable}


def _apply_guards(mask: np.ndarray, crop, guards: dict) -> np.ndarray:
    return (mask & ~guards["lip"] & ~guards["nostril_core"]
            & ~guards["below_jaw"] & guards["editable"])


def build_mask(ctx: dict) -> tuple[np.ndarray, np.ndarray, dict]:
    """edit_mask (composite region) + model_mask (LaMa's hole, slightly
    larger for boundary context). No blanket dilation of the edit mask
    (Codex #8 Q1/#9 Q4); strict hair components alone get a small halo."""
    crop = ctx["crop"]
    fw = crop.face_width

    w_soft = build_soft_high_weight(ctx)
    mask = (ctx["zone_soft"] > CONFIG["zoneEditThr"]) \
        | (w_soft > CONFIG["softHighThr"])
    hk = max(3, int(CONFIG["hairHaloDilate"] * fw) | 1)
    for c in ctx["cands_ext"]:
        comp = np.zeros(mask.shape, np.uint8)
        comp[c.px[:, 0], c.px[:, 1]] = 1
        mask |= cv2.dilate(comp, np.ones((hk, hk), np.uint8)) > 0

    ck = max(3, int(0.01 * fw) | 1)
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE,
                            np.ones((ck, ck), np.uint8)) > 0

    guards = _anatomy_guards(crop)
    edit_mask = _apply_guards(mask, crop, guards)

    mk = max(3, int(CONFIG["modelMaskDilate"] * fw) | 1)
    model_mask = cv2.dilate(edit_mask.astype(np.uint8),
                            np.ones((mk, mk), np.uint8)) > 0
    model_mask = _apply_guards(model_mask, crop, guards)

    info = {"maskFrac": round(float(edit_mask.mean()), 4),
            "zoneFrac": round(float(ctx["zone"].mean()), 4),
            "modelMaskFrac": round(float(model_mask.mean()), 4),
            "config": CONFIG}
    return edit_mask, model_mask, {"mask": info, **guards}


def run_lama(ctx: dict, edit_mask: np.ndarray, model_mask: np.ndarray,
             ) -> tuple[np.ndarray, dict]:
    """Deterministic LaMa fill for the crop (mod-8 real-pixel window, <=512
    inference). The model inpaints model_mask (context margin included); the
    composite writes edit_mask pixels ONLY."""
    crop, bgr = ctx["crop"], ctx["bgr"]
    x0, y0, x1, y1 = crop.bbox
    fh, fwd = bgr.shape[:2]
    nx0, nx1 = _mod8_window(x0, x1, fwd)
    ny0, ny1 = _mod8_window(y0, y1, fh)
    win = bgr[ny0:ny1, nx0:nx1]
    oy, ox = y0 - ny0, x0 - nx0
    wmask = np.zeros(win.shape[:2], np.uint8)
    wmask[oy:oy + model_mask.shape[0],
          ox:ox + model_mask.shape[1]] = model_mask.astype(np.uint8) * 255

    hh, ww = win.shape[:2]
    scale = min(1.0, CONFIG["lamaMaxDim"] / max(hh, ww))
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

    fill_crop = fill[oy:oy + edit_mask.shape[0], ox:ox + edit_mask.shape[1]]
    result = crop.bgr.copy()
    result[edit_mask] = fill_crop[edit_mask]
    return result, {"lamaSeconds": round(dt, 2),
                    "inferenceScale": round(scale, 3),
                    "windowHW": [hh, ww]}


def quick_metrics(ctx: dict, result: np.ndarray, mask: np.ndarray,
                  guards: dict) -> dict:
    """Cheap always-on diagnostics; the full ruler suite lives in
    eval/hybrid_rulers.py (gates frozen from positive controls)."""
    crop = ctx["crop"]
    fw = crop.face_width
    sig = max(2.0, fw / LOW_SIGMA_RATIO)

    def hi(img):
        f = img.astype(np.float32)
        return f - cv2.GaussianBlur(f, (0, 0), sigmaX=sig)

    core = cv2.erode(mask.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    m: dict = {}
    if core.any() and ctx["clean"].any():
        r_fill = float(np.sqrt(np.mean(hi(result)[core] ** 2)))
        r_clean = float(np.sqrt(np.mean(hi(crop.bgr)[ctx["clean"]] ** 2)))
        m["grainRatio"] = round(r_fill / max(r_clean, 1e-6), 3)
        lo_o = cv2.GaussianBlur(cv2.cvtColor(crop.bgr, cv2.COLOR_BGR2GRAY)
                                .astype(np.float32), (0, 0), sig)
        lo_r = cv2.GaussianBlur(cv2.cvtColor(result, cv2.COLOR_BGR2GRAY)
                                .astype(np.float32), (0, 0), sig)
        lift = (lo_r - lo_o)[core]
        m["fillLiftLQ50"] = round(float(np.percentile(lift, 50)), 2)
        m["fillLiftLQ90"] = round(float(np.percentile(lift, 90)), 2)
    m["outsideMaskIdentical"] = bool(
        np.array_equal(result[~mask], crop.bgr[~mask]))
    m["belowJawIdentical"] = bool(np.array_equal(
        result[guards["below_jaw"]], crop.bgr[guards["below_jaw"]]))
    m["lipIdentical"] = bool(np.array_equal(
        result[guards["lip"]], crop.bgr[guards["lip"]]))
    return m


def run_photo(name: str, img_path: Path, out_dir: Path) -> dict | None:
    """Per-stage timings recorded separately (Codex #9 Q3): the model is
    preloaded by main(), so lamaSeconds here is warm inference."""
    t0 = time.perf_counter()
    ctx = prepare_unlabeled(name, img_path)
    t_prep = time.perf_counter()
    if ctx is None:
        print(f"{name}: face gate / calibration failed")
        return None
    edit_mask, model_mask, guards = build_mask(ctx)
    t_mask = time.perf_counter()
    rec: dict = {"id": name, **guards["mask"]}
    if not edit_mask.any():
        rec["skip"] = "empty mask"
        print(f"{name}: empty mask, untouched")
        return rec
    result, linfo = run_lama(ctx, edit_mask, model_mask)
    rec.update(linfo)
    from eval.ghost_ruler import score_result
    from eval.hybrid_rulers import score_photo
    crop = ctx["crop"]
    rec["cleanLadder"] = ctx["clean_ladder"]
    rec["cleanPx"] = int(ctx["clean"].sum())
    rec.update(score_photo(crop.bgr, result, edit_mask, ctx["clean"],
                           ctx["thr"], guards, crop.face_width))
    # Ghost gate is scoped to candidates the mask INTENDED to erase; fringe
    # (in-editable, out-of-mask) flags mask under-coverage, policy-outside
    # (below jaw margin / protected) is by design — recorded, never gated.
    in_mask, fringe, policy = [], 0, 0
    for c in ctx["cands_ext"]:
        if float(edit_mask[c.px[:, 0], c.px[:, 1]].mean()) > 0.5:
            in_mask.append(c)
        elif (float(guards["editable"][c.px[:, 0], c.px[:, 1]].mean()) > 0.5
              and float(guards["below_jaw"][c.px[:, 0], c.px[:, 1]].mean()) < 0.5):
            fringe += 1
        else:
            policy += 1
    gv = score_result(result, in_mask, ctx["thr"], crop.face_width)
    rec["ghost"] = {"weightedQ90R": gv.weightedQ90R,
                    "survival": gv.survivalRate, "nCands": gv.nCandidates,
                    "fringeCands": fringe, "policyCands": policy}
    # Frozen ghost gate (Codex #9 Q5).
    if ((gv.weightedQ90R is not None and gv.weightedQ90R > 0.10)
            or (gv.survivalRate is not None and gv.survivalRate > 0.05)):
        rec["abstains"] = rec.get("abstains", []) + ["ghost"]
        if rec.get("verdict") == "pass":
            rec["verdict"] = "abstain"
    rec["timings"] = {"prepSeconds": round(t_prep - t0, 2),
                      "maskSeconds": round(t_mask - t_prep, 2),
                      "lamaSeconds": linfo["lamaSeconds"],
                      "totalSeconds": round(time.perf_counter() - t0, 2)}

    crop = ctx["crop"]
    cv2.imwrite(str(out_dir / f"{name}_result.png"), result)
    panel = np.hstack([label(crop.bgr, "ORIG"), label(result, "LAMA")])
    cv2.imwrite(str(out_dir / f"{name}_panel.png"), panel)
    ov = crop.bgr.copy()
    ov[edit_mask] = (0.6 * ov[edit_mask]
                     + 0.4 * np.array([0, 255, 0])).astype(np.uint8)
    ring = model_mask & ~edit_mask
    ov[ring] = (0.6 * ov[ring] + 0.4 * np.array([0, 160, 255])).astype(np.uint8)
    cv2.imwrite(str(out_dir / f"{name}_mask.png"), ov)
    print(f"{name}: {json.dumps(rec)}")
    return rec


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("photos", nargs="*",
                    help="dev photo names (default: all dev9) or image paths")
    ap.add_argument("--tag", default="dev9")
    args = ap.parse_args()
    out_dir = OUT / args.tag
    out_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.perf_counter()
    lama_runner.get_model()  # preload: per-photo lamaSeconds stays warm
    model_load_s = round(time.perf_counter() - t0, 2)

    from eval.run_owndomain_eval import discover_pairs
    pairs = {n: p for n, p, _ in discover_pairs()}
    names = args.photos or sorted(pairs)
    rows = []
    for name in names:
        path = Path(name) if Path(name).exists() else pairs.get(name)
        if path is None:
            print(f"unknown photo {name}")
            continue
        r = run_photo(Path(name).stem if Path(name).exists() else name,
                      Path(path), out_dir)
        if r:
            rows.append(r)
    (out_dir / "report.json").write_text(json.dumps(
        {"meta": lama_runner.run_metadata(), "config": CONFIG,
         "modelLoadSeconds": model_load_s, "photos": rows}, indent=2))
    print(f"\n-> {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
