"""Guarded-LaMa hybrid v3 — coverage-first PRODUCTION configuration (no GT).

User directive (2026-07-11): erase ALL visible beard — neck and face
silhouette included; texture/boundary detailing layers on top later. The
below-jaw clip is RETIRED as a mask bound; face-shape safety moved to the
silhouette ruler, and geometry misses are coverage failures now, not policy
exclusions (Codex #10). Hair evidence lives in anchor-normalized z-space
(eval.reference_bundle — the complement-of-zone clean collapsed on hairy
photos); the mask canvas is face ∪ silhouette tube ∪ neck corridor with
garment/occluder guards and evidence hysteresis (spike.mask_v3).

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
    CHIN_TIP, FACE_OVAL, JAW_OVAL, LIPS_OUTER, NOSE_BOTTOM, detect_face,
)
from engine.lower_face_roi import build_lower_face_crop, skin_reference_pixels  # noqa: E402
from eval.fill_color_ruler import score_fill_color  # noqa: E402
from eval.ghost_ruler import (  # noqa: E402
    LOW_SIGMA_RATIO, blackhat_maps, clean_thresholds, excess_map,
    find_candidates,
)
from eval.measure_ghost import _apply_exclusions  # noqa: E402
from eval.measure_waxiness import CLIPSEG_MODEL, CLIPSEG_THR  # noqa: E402
from eval.reference_bundle import (  # noqa: E402
    anchor_blackhat_stats, build_reference_bundle, normalized_excess,
)
from eval.run_owndomain_eval import _fit  # noqa: E402
from eval.silhouette_ruler import score_silhouette  # noqa: E402
from spike import lama_runner  # noqa: E402
from spike.mask_v3 import (  # noqa: E402
    build_canvas, garment_boundary, garment_floor_cols, hysteresis_mask,
    occluder_guard,
)
from spike.oracle_kill import _mod8_window, _smoothstep, label  # noqa: E402

OUT = LAB / "outputs" / "ghost" / "hybrid"

# v3 coverage-first config — frozen BEFORE the one-shot dev9 run (Codex
# #9/#10 discipline). Recorded verbatim into every report.json.
CONFIG = {
    "lamaMaxDim": 512,
    # Zone edit threshold on the C1∪CLIPSeg union field. Serving ZONE_THR=0.5
    # measured 6.6% GT recall on dev9 — unusable for "아예 깨끗" (R1/R4).
    # Sweep on dev9 GT (scoring-only use): 0.06->70%, 0.03->83%, 0.01->91%
    # recall. 0.03 adopted: over-mask under LaMa costs texture, not anatomy.
    "zoneEditThr": 0.03,
    # Coverage-first canvas (Codex #10): the crop's under-jaw extension must
    # reach the neck-corridor floor (chin + 0.35*face_height).
    "underJawExtend": 0.38,
    # Hysteresis seeds — two INDEPENDENT signals (reviewer risk: passing one
    # field twice silently disables the dual-seed neck protection):
    # CLIPSeg union field high-confidence, and anchor-normalized black-hat
    # z well above the excess onset (z_thr 4.5 + 3.0).
    "seedClipseg": 0.5,
    "seedZ": 3.0,
    # Face/neck SPLIT line (not a clip): jaw_y + this*fw. The v2 face-side
    # fill up to this line was the best result of the whole project (psd04
    # jaw-margin panel); v3 keeps it verbatim and adds a separate
    # evidence-tight neck pass below it. A single hole spanning face+neck
    # washed the silhouette away (v3smoke) and the sequential giant-hole
    # split painted the chin gray (v3split) — small neck holes with intact
    # context are LaMa's best regime.
    "faceNeckSplit": 0.06,
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
    """prepare_photo counterpart, v3: CLIPSeg zone in place of GT, and the
    anatomical ReferenceBundle in place of the complement-of-zone clean
    (which collapsed on hairy photos: pic1 kept 2.6k px and black-hat
    thresholds fell 15->2, reading normal skin as hair). All hair evidence
    now lives in anchor-normalized z-space (eval.reference_bundle)."""
    bgr = _fit(cv2.imread(str(img_path), cv2.IMREAD_COLOR))
    if bgr is None:
        return None
    det = detect_face(bgr)
    if det is None or not det.quality.passed:
        return None

    # FULL-frame call by contract (reviewer trap #2): anchors live on the
    # upper cheeks/forehead, outside the crop.
    bundle = build_reference_bundle(bgr, det.landmarks, det.face_width)
    if bundle is None:
        return dict(name=name, abstain="reference abstain (no valid anchors)")
    stats = anchor_blackhat_stats(bgr, det.landmarks, det.face_width, bundle)

    skin = fit_skin_model(skin_reference_pixels(bgr, det.landmarks,
                                                det.face_width))
    crop = build_lower_face_crop(bgr, det.landmarks, det.face_width,
                                 det.face_height,
                                 under_jaw_extend=CONFIG["underJawExtend"])
    fw = crop.face_width

    zone_soft = production_zone_soft(crop, skin)
    zone = zone_soft > CONFIG["zoneEditThr"]
    # normalization is local, so the CROP may be scored against the
    # full-frame anchor stats directly
    nz = normalized_excess(crop.bgr, fw, stats)

    pk = max(3, int(0.012 * fw) | 1)
    protect_d = cv2.dilate(crop.protect_mask, np.ones((pk, pk), np.float32)) > 0.5

    # Low-evidence skin: grain-reference ring source + fillColor exclusion
    # complement. NOT a calibration set (that job moved to the anchors).
    lowev = (zone_soft < CONFIG["zoneEditThr"]) & (nz <= 0) & ~protect_d

    # Candidates for the ghost gate, in z-space (q95_orig is a z quantile;
    # the result is scored on the same stats, so the ratio stays unitless).
    # Upward-only extension keeps the under-lip shadow band recall.
    key_zone = zone.copy()
    for s in range(1, max(4, int(0.03 * fw)) + 1):
        key_zone[:-s] |= zone[s:]
    key_zone |= nz > 0
    key_zone &= crop.protect_mask < 0.5
    cand_zone = key_zone & ~protect_d
    cands = _apply_exclusions(name, find_candidates(nz, cand_zone, fw))

    return dict(bgr=bgr, det=det, skin=skin, crop=crop, bundle=bundle,
                stats=stats, nz=nz, zone=zone, zone_soft=zone_soft,
                lowev=lowev, protect_d=protect_d, cand_zone=cand_zone,
                cands_ext=cands, name=name)


def _anatomy_guards(crop) -> dict:
    """Narrow lip hole + nostril cores. v3 retired the below-jaw guard —
    the mask now legitimately crosses the jaw (coverage-first); silhouette
    safety moved from geometry to the silhouette ruler."""
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

    return {"lip": lip, "nostril_core": nostril_core}


def build_mask(ctx: dict) -> tuple[np.ndarray, np.ndarray, dict]:
    """v3 coverage-first mask: canvas = face ∪ silhouette tube ∪ neck
    corridor (spike.mask_v3), evidence hysteresis with two independent seed
    signals, garment/occluder guards. edit_mask is what the composite writes;
    model_mask (slightly dilated) is LaMa's hole."""
    crop, bundle = ctx["crop"], ctx["bundle"]
    fw = crop.face_width
    fh = ctx["det"].face_height
    shape = crop.bgr.shape[:2]

    # Two-pass canvas (reviewer trap #4): geometry first, then the garment
    # boundary from pixels, then rebuild with the found floor.
    canvas0 = build_canvas(crop.landmarks, shape, fw, fh)
    chin_y = float(crop.landmarks[CHIN_TIP][1])
    # Per-column floor first (V-necks/slanted necklines — row-persistence
    # returned None on psd04's hoodie and the corridor ran onto fabric with
    # CLIPSeg+z dual seeds both firing on the dark neckline); scalar
    # detector as fallback.
    gy = garment_floor_cols(crop.bgr, canvas0["neck_corridor"], chin_y, fh,
                            bundle.lab_mean, bundle.lab_cov)
    if gy is None:
        gy = garment_boundary(crop.bgr, canvas0["neck_corridor"], chin_y, fh,
                              bundle.lab_mean, bundle.lab_cov)
    canvas = build_canvas(crop.landmarks, shape, fw, fh, garment_boundary_y=gy)

    # Hysteresis evidence: seeds from two INDEPENDENT signals; dual seed =
    # both fire co-located (small dilation each, then AND).
    clip_strong = ctx["zone_soft"] > CONFIG["seedClipseg"]
    z_strong = ctx["nz"] > CONFIG["seedZ"]
    k3 = np.ones((3, 3), np.uint8)
    dual = (cv2.dilate(clip_strong.astype(np.uint8), k3) > 0) \
        & (cv2.dilate(z_strong.astype(np.uint8), k3) > 0)
    seed = clip_strong | z_strong
    growth = ctx["zone"] | (ctx["nz"] > 0) | seed
    face_and_tube = canvas["face_region"] | canvas["silhouette_tube"]

    # FACE side: the proven v2 recipe — everything above jaw + split margin.
    jaw_y = _jaw_line(crop)
    yy = np.arange(shape[0], dtype=np.float32)[:, None]
    above_split = yy <= jaw_y[None, :] + CONFIG["faceNeckSplit"] * fw
    face_mask = hysteresis_mask(growth, seed, dual, canvas["canvas"],
                                face_and_tube) & above_split

    # Strict hair components get a small halo (never a blanket dilation).
    hk = max(3, int(CONFIG["hairHaloDilate"] * fw) | 1)
    for c in ctx["cands_ext"]:
        comp = np.zeros(shape, np.uint8)
        comp[c.px[:, 0], c.px[:, 1]] = 1
        face_mask |= (cv2.dilate(comp, np.ones((hk, hk), np.uint8)) > 0) \
            & canvas["canvas"] & above_split

    # NECK side: evidence-TIGHT band below the split — only where hair
    # z-excess actually is, grown by a small closing. Components must carry
    # a dual seed OR touch the face mask through the split line: a giant
    # neck hole washed the silhouette away and grayed the chin (v3smoke /
    # v3split); a thin band with intact context around it is LaMa's best
    # regime and is exactly what the psd04 under-jaw ring needs.
    neck_ev = (ctx["nz"] > 0) & ~above_split & canvas["canvas"]
    neck_ev = cv2.morphologyEx(neck_ev.astype(np.uint8), cv2.MORPH_CLOSE,
                               np.ones((hk * 2 + 1, hk * 2 + 1),
                                       np.uint8)) > 0
    n, labels = cv2.connectedComponents(neck_ev.astype(np.uint8), 8)
    face_touch = cv2.dilate(face_mask.astype(np.uint8),
                            np.ones((5, 5), np.uint8)) > 0
    keep = np.zeros(n, bool)
    for i in range(1, n):
        comp = labels == i
        if (dual[comp].any()
                or (comp & face_touch).any()):
            keep[i] = True
    neck_mask = keep[labels]

    ck = max(3, int(0.01 * fw) | 1)
    face_mask = cv2.morphologyEx(face_mask.astype(np.uint8), cv2.MORPH_CLOSE,
                                 np.ones((ck, ck), np.uint8)) > 0
    face_mask &= above_split
    mask = face_mask | neck_mask

    guards = _anatomy_guards(crop)
    # Occluder candidates must EXCLUDE beard-evidence pixels first: dense
    # beard and shaded neck skin are the pixels farthest from the bright
    # cheek-anchor color model, so a raw non-skin test eats the very beard
    # we're here to erase (measured psd04: occluderFrac 0.545, 96% of the
    # mask deleted). Codex #10: skin likelihood must never hard-gate the
    # beard mask — the guard is for fabric/chains, which carry no evidence.
    occl = occluder_guard(crop.bgr, canvas["canvas"] & ~growth,
                          bundle.lab_mean, bundle.lab_cov, fw)
    occl &= ~growth
    guards["occluder"] = occl
    guards["canvas"] = canvas["canvas"]

    pre_guard = mask.copy()

    def _guard(mk: np.ndarray) -> np.ndarray:
        return (mk & ~guards["lip"] & ~guards["nostril_core"] & ~occl
                & canvas["canvas"])

    edit_mask = _guard(mask)
    mk = max(3, int(CONFIG["modelMaskDilate"] * fw) | 1)
    model_mask = _guard(cv2.dilate(edit_mask.astype(np.uint8),
                                   np.ones((mk, mk), np.uint8)) > 0)
    guards["above_split"] = above_split

    info = {"maskFrac": round(float(edit_mask.mean()), 4),
            "zoneFrac": round(float(ctx["zone"].mean()), 4),
            "modelMaskFrac": round(float(model_mask.mean()), 4),
            "corridorFloorY": round(float(canvas["corridor_floor_y"]), 1),
            "garmentY": None if gy is None else round(float(np.median(gy)), 1),
            "occluderFrac": round(float(occl.mean()), 4),
            "guardExcludedEnergyFrac": round(
                float((pre_guard & ~edit_mask).sum())
                / max(float(pre_guard.sum()), 1.0), 4),
            "seedPx": int(seed.sum()), "dualSeedPx": int(dual.sum()),
            "config": CONFIG}
    return edit_mask, model_mask, {"mask": info, **guards,
                                   "growth": growth,
                                   "face_and_tube": face_and_tube}


def _jaw_line(crop) -> np.ndarray:
    """Per-column jaw y from the JAW_OVAL polyline (crop coords)."""
    jaw = crop.landmarks[JAW_OVAL].astype(np.float32)
    order = np.argsort(jaw[:, 0])
    w = crop.bgr.shape[1]
    return np.interp(np.arange(w, dtype=np.float32),
                     jaw[order, 0], jaw[order, 1]).astype(np.float32)


def _fill_window(ctx: dict, part_mask: np.ndarray,
                 frame_override: np.ndarray | None = None,
                 ) -> tuple[np.ndarray, dict]:
    """LaMa fill for ONE window: tight bbox around part_mask + 0.12fw real
    context (Codex #10 Q7-3 — always shrinking the whole expanded crop to 512
    wastes effective resolution), mod-8 aligned in the full frame, <=512
    inference. Returns a crop-sized float fill (valid where part_mask) + info.

    frame_override: full-frame image to condition on instead of the original
    (the sequential silhouette-split pass fills the face side on a frame
    whose neck is already cleaned)."""
    crop = ctx["crop"]
    bgr = ctx["bgr"] if frame_override is None else frame_override
    fw = crop.face_width
    cx0, cy0, cx1, cy1 = crop.bbox
    fh, fwd = bgr.shape[:2]
    ys, xs = np.nonzero(part_mask)
    m = int(0.12 * fw)
    # window in full-frame coords, clamped, mod-8 with real pixels
    wy0, wy1 = _mod8_window(max(0, cy0 + ys.min() - m),
                            min(fh, cy0 + ys.max() + 1 + m), fh)
    wx0, wx1 = _mod8_window(max(0, cx0 + xs.min() - m),
                            min(fwd, cx0 + xs.max() + 1 + m), fwd)
    win = bgr[wy0:wy1, wx0:wx1]
    wmask = np.zeros(win.shape[:2], np.uint8)
    # place part_mask into window coords (intersection of crop and window)
    iy0, iy1 = max(cy0, wy0), min(cy1, wy1)
    ix0, ix1 = max(cx0, wx0), min(cx1, wx1)
    wmask[iy0 - wy0:iy1 - wy0, ix0 - wx0:ix1 - wx0] = \
        part_mask[iy0 - cy0:iy1 - cy0, ix0 - cx0:ix1 - cx0].astype(np.uint8) * 255

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
        fill_win = cv2.resize(out_small, (ww, hh), interpolation=cv2.INTER_CUBIC)
    else:
        fill_win = lama_runner.inpaint(win, wmask)
    dt = time.perf_counter() - t0

    fill = np.zeros((*part_mask.shape, 3), np.float32)
    fill[iy0 - cy0:iy1 - cy0, ix0 - cx0:ix1 - cx0] = \
        fill_win[iy0 - wy0:iy1 - wy0, ix0 - wx0:ix1 - wx0]
    return fill, {"lamaSeconds": round(dt, 2), "inferenceScale": round(scale, 3),
                  "windowHW": [hh, ww]}


def run_lama(ctx: dict, edit_mask: np.ndarray, model_mask: np.ndarray,
             ) -> tuple[np.ndarray, dict]:
    """Deterministic LaMa fill: the model inpaints model_mask (context margin
    included); the composite writes edit_mask pixels ONLY.

    Face/neck sequential fill at the split line (jaw + faceNeckSplit*fw):
    the FACE side runs first on the original frame -- byte-for-byte the v2
    behavior that produced the project's best result -- then the NECK side
    (an evidence-tight band) runs conditioned on the cleaned face, so it
    cannot continue hair patterns from an already-erased chin. One hole
    spanning both sides washed the silhouette away (measured v3smoke:
    corr 0.69) and a giant sequential split grayed the chin (v3split);
    the fix is mask separation, never threshold relaxation (Codex #10)."""
    crop = ctx["crop"]
    fw = crop.face_width
    fh_img = crop.bgr.shape[0]

    jaw_y = _jaw_line(crop)
    yy = np.arange(fh_img, dtype=np.float32)[:, None]
    above = yy <= jaw_y[None, :] + CONFIG["faceNeckSplit"] * fw
    face_model = model_mask & above
    neck_model = model_mask & ~above

    if not (face_model.any() and neck_model.any()):
        fill, info = _fill_window(ctx, model_mask)
        result = crop.bgr.copy()
        result[edit_mask] = np.clip(np.rint(fill[edit_mask]), 0,
                                    255).astype(np.uint8)
        return result, {**info, "windows": 1}

    # Pass 1: face side on the original frame (v2-proven regime).
    fill_f, inf_f = _fill_window(ctx, face_model)
    face_edit = edit_mask & above
    work = ctx["bgr"].copy()
    cx0, cy0, cx1, cy1 = crop.bbox
    work_crop = work[cy0:cy1, cx0:cx1]
    work_crop[face_edit] = np.clip(np.rint(fill_f[face_edit]), 0,
                                   255).astype(np.uint8)

    # Pass 2: neck band conditioned on the cleaned face.
    fill_n, inf_n = _fill_window(ctx, neck_model, frame_override=work)
    neck_edit = edit_mask & ~above
    result = crop.bgr.copy()
    result[face_edit] = work_crop[face_edit]
    result[neck_edit] = np.clip(np.rint(fill_n[neck_edit]), 0,
                                255).astype(np.uint8)
    return result, {"lamaSeconds": round(inf_f["lamaSeconds"]
                                         + inf_n["lamaSeconds"], 2),
                    "inferenceScale": min(inf_f["inferenceScale"],
                                          inf_n["inferenceScale"]),
                    "windowHW": [inf_f["windowHW"], inf_n["windowHW"]],
                    "windows": 2}


def run_photo(name: str, img_path: Path, out_dir: Path) -> dict | None:
    """Per-stage timings recorded separately (Codex #9 Q3): the model is
    preloaded by main(), so lamaSeconds here is warm inference."""
    t0 = time.perf_counter()
    ctx = prepare_unlabeled(name, img_path)
    t_prep = time.perf_counter()
    if ctx is None:
        print(f"{name}: face gate failed")
        return None
    if "abstain" in ctx:
        rec = {"id": name, "verdict": "abstain", "abstains": [ctx["abstain"]]}
        print(f"{name}: {ctx['abstain']}")
        return rec
    edit_mask, model_mask, guards = build_mask(ctx)
    t_mask = time.perf_counter()
    rec: dict = {"id": name, **guards["mask"]}
    if not edit_mask.any():
        rec["skip"] = "empty mask"
        print(f"{name}: empty mask, untouched")
        return rec
    result, linfo = run_lama(ctx, edit_mask, model_mask)
    rec.update(linfo)
    from eval.hybrid_rulers import score_photo
    crop = ctx["crop"]
    fw = crop.face_width
    bundle = ctx["bundle"]
    rec["reference"] = {"ladder": bundle.ladder_level,
                        "nValid": bundle.n_valid,
                        "patches": bundle.patches_used,
                        "singleAnchor": bundle.single_anchor}

    nz_result = normalized_excess(result, fw, ctx["stats"])
    rec.update(score_photo(crop.bgr, result, edit_mask, ctx["lowev"],
                           None, guards, fw, excess_result=nz_result))

    # Silhouette ruler replaces the retired below-jaw byte gate: the mask now
    # crosses the jaw, so face-shape preservation is measured, not masked.
    sil = score_silhouette(crop.bgr, result, crop.landmarks, fw)
    rec["silhouette"] = sil
    if sil["silhouetteVerdict"] == "hard-fail":
        rec["hardFails"] = rec.get("hardFails", []) + ["silhouette"]
        rec["verdict"] = "hard-fail"
    elif sil["silhouetteVerdict"] == "abstain":
        rec["abstains"] = rec.get("abstains", []) + ["silhouette"]
        if rec.get("verdict") == "pass":
            rec["verdict"] = "abstain"

    # Fill color harmony (independent of the L-only fillLift breaker).
    # anchor_cov: ab block of the bundle Lab covariance (reviewer trap #3 —
    # [:2,:2] would be L,a).
    exclude = (ctx["zone"] | (ctx["nz"] > 0) | guards["lip"]
               | guards["nostril_core"] | guards["occluder"])
    fc = score_fill_color(crop.bgr, result, edit_mask, exclude, fw,
                          anchor_cov=bundle.lab_cov[1:, 1:].astype(np.float64))
    rec["fillColor"] = fc
    if fc["fillColorVerdict"] == "abstain":
        rec["abstains"] = rec.get("abstains", []) + ["fillColor"]
        if rec.get("verdict") == "pass":
            rec["verdict"] = "abstain"

    # Ghost gate in anchor-z space, scoped to candidates the mask INTENDED
    # to erase; fringe (in-canvas, out-of-mask) = coverage shortfall flag.
    # v3 has no policy-outside class: geometry misses ARE coverage failures.
    in_mask, fringe, out_canvas = [], 0, 0
    for c in ctx["cands_ext"]:
        if float(edit_mask[c.px[:, 0], c.px[:, 1]].mean()) > 0.5:
            in_mask.append(c)
        elif float(guards["canvas"][c.px[:, 0], c.px[:, 1]].mean()) > 0.5:
            fringe += 1
        else:
            out_canvas += 1
    rs, ws = [], []
    for c in in_mask:
        vals = nz_result[c.px[:, 0], c.px[:, 1]]
        rs.append(float(np.percentile(vals, 95)) / max(c.q95_orig, 1e-6))
        ws.append(c.weight)
    ghost: dict = {"nCands": len(in_mask), "fringeCands": fringe,
                   "outCanvasCands": out_canvas}
    if in_mask:
        rs_a, ws_a = np.array(rs), np.array(ws)
        order = np.argsort(rs_a)
        cum = np.cumsum(ws_a[order]) / ws_a.sum()
        ghost["weightedQ90R"] = round(float(rs_a[order][
            np.searchsorted(cum, 0.90, side="left").clip(0, len(rs_a) - 1)]), 3)
        ghost["survival"] = round(float(ws_a[rs_a > 0.35].sum() / ws_a.sum()), 3)
        if ghost["weightedQ90R"] > 0.10 or ghost["survival"] > 0.05:
            rec["abstains"] = rec.get("abstains", []) + ["ghost"]
            if rec.get("verdict") == "pass":
                rec["verdict"] = "abstain"
    rec["ghost"] = ghost
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

    # 5-layer inspection sheet (Codex #10 Q7-1): the mask must be eyeballed
    # on these layers BEFORE trusting any run — growth / seeds / final edit /
    # guards / canvas.
    def _tint(mask_b, color):
        o = crop.bgr.copy()
        o[mask_b] = (0.55 * o[mask_b] + 0.45 * np.array(color)).astype(np.uint8)
        return o

    layers = np.hstack([
        label(_tint(guards["growth"], (0, 255, 255)), "GROWTH"),
        label(_tint(ctx["zone_soft"] > CONFIG["seedClipseg"], (255, 0, 255)),
              "SEED:CLIP"),
        label(_tint(ctx["nz"] > CONFIG["seedZ"], (255, 255, 0)), "SEED:Z"),
        label(_tint(edit_mask, (0, 255, 0)), "EDIT"),
        label(_tint(guards["occluder"] | guards["lip"]
                    | guards["nostril_core"], (0, 0, 255)), "GUARDS"),
        label(_tint(guards["canvas"], (255, 128, 0)), "CANVAS"),
    ])
    cv2.imwrite(str(out_dir / f"{name}_layers.png"), layers)
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
