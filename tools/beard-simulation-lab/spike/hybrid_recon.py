"""Guarded-LaMa hybrid v4 — face-only PRODUCTION configuration (no GT).

SCOPE DECISION (user, 2026-07-12 / Codex #13): neck beard, occluders and
harsh shadows are rejected at the CAPTURE gate — this pipeline edits
well-lit frontal FACES only. Everything neck/garment (corridor, collar
detectors, dual-seed neck rule, sequential face/neck LaMa windows,
occluder pixel subtraction) is removed from the product path; obvious
occlusion or landmark/aperture instability now refuses the WHOLE photo
(abstain → retake) instead of silently carving pixels out of the mask.

Mask contract (Codex #13):
- canvas = buffered sub-nose FACE_OVAL ∪ face side of the jawline tube
  (spike.mask_v3); the composite (edit mask) TERMINATES at the jaw line,
- the LaMa model mask may cross the jaw by ≤ MODEL_JAW_CONTEXT_FW·fw as
  context cleanup only — the composite never writes below the jaw,
- canvas top = NOSE_BOTTOM_y − 0.025fw (absorbs ±0.02fw landmark jitter);
  the nostril APERTURES inside that band are protected by a DETECTED
  aperture guard (dark compact pair in the nose-bottom ROI). Detection
  failure is never papered over with a fabricated guard: the photo
  abstains with retake class "lower_face_uncertain".

Single-source decision (oracle kill test 2026-07-11): LaMa's own low AND
high band inside the mask. Donor re-grain is OFF.

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
    LIPS_OUTER, NOSE_BOTTOM, NOSTRILS, detect_face,
)
from engine.lower_face_roi import build_lower_face_crop, skin_reference_pixels  # noqa: E402
from eval.fill_color_ruler import score_fill_color  # noqa: E402
from eval.ghost_ruler import find_candidates  # noqa: E402
from eval.measure_ghost import _apply_exclusions  # noqa: E402
from eval.measure_waxiness import CLIPSEG_MODEL, CLIPSEG_THR  # noqa: E402
from eval.reference_bundle import (  # noqa: E402
    anchor_blackhat_stats, build_reference_bundle, normalized_excess,
)
from eval.run_owndomain_eval import _fit  # noqa: E402
from eval.silhouette_ruler import score_silhouette  # noqa: E402
from spike import lama_runner, mask_v3  # noqa: E402
from spike.mask_v3 import build_canvas, hysteresis_mask  # noqa: E402
from spike.oracle_kill import _mod8_window, label  # noqa: E402

OUT = LAB / "outputs" / "ghost" / "hybrid"

# v4 face-only config (Codex #13). Recorded verbatim into every report.json.
CONFIG = {
    "lamaMaxDim": 512,
    # Zone edit threshold on the C1∪CLIPSeg union field. Serving ZONE_THR=0.5
    # measured 6.6% GT recall on dev9 — unusable for "아예 깨끗" (R1/R4).
    # Sweep on dev9 GT (scoring-only use): 0.06->70%, 0.03->83%, 0.01->91%
    # recall. 0.03 adopted: over-mask under LaMa costs texture, not anatomy.
    "zoneEditThr": 0.03,
    # Crop under-jaw extension (×face_height). v3 used 0.38 to reach the
    # neck-corridor floor; the corridor is gone and the mask now ends at the
    # jaw, so the crop only needs the jaw tube + model context + ruler bands
    # below the jaw. Dev check 2026-07-12 (spike -> scratchpad script over
    # dev9): min below-jaw clearance in-crop is 0.06fw margin + extend·fh;
    # 0.12 gives >=0.20fw clearance under the lowest jaw pixel on every dev
    # photo (need ~0.05fw: 0.015 model context + 0.02 seam band + 0.03
    # grain/fillColor ring), with landmark-jitter headroom; 0.08-0.15 all
    # passed, 0.12 keeps a 2x safety factor without dragging chest pixels in.
    "underJawExtend": 0.12,
    # Hysteresis seeds — either independent signal may seed a component:
    # CLIPSeg union field high-confidence, or anchor-normalized black-hat
    # z well above the excess onset (z_thr 4.5 + 3.0). The v3 corridor-only
    # dual-seed rule left with the corridor.
    "seedClipseg": 0.5,
    "seedZ": 3.0,
    # model_mask = edit_mask closed + dilated this much: LaMa sees a slightly
    # larger hole so boundary stubble doesn't condition the fill, but the
    # composite writes edit_mask pixels ONLY (Codex #9 Q4). Below the jaw the
    # hole may additionally extend mask_v3.MODEL_JAW_CONTEXT_FW (0.015fw).
    "modelMaskDilate": 0.004,
    "hairHaloDilate": 0.003,
}

# --- Anatomy guards (Codex #12 stage-1 redesign; #13 aperture guard). ------
# The inviolable contract is the TRUE lip vermilion and the TRUE nostril
# APERTURES; the philtrum (mustache) and mouth-side bands are first-class
# edit regions. Guards are built from raw landmarks + real detection, are
# FINAL once built (no downstream re-dilation), and are exactly the masks
# the byte-identity gates in eval.hybrid_rulers check.
LIP_GUARD_DILATE_FW = 0.004    # vermilion polygon + thin blend margin

# --- Nostril aperture guard (Codex #13). -----------------------------------
# The old r=0.012fw disks sat on the NOSTRILS landmarks — the ALAE (nose
# wings), which do NOT cover the dark apertures (review-confirmed). The
# guard is now DETECTED: in a nose-bottom ROI, each side must show one
# skin-contrasting dark compact component; the pair (size/side/alignment/
# compactness gated) is dilated slightly and becomes the guard. No pair →
# no fabricated guard → the photo abstains ("lower_face_uncertain").
APERTURE_ROI_PAD_FW = 0.02     # ROI x-pad beyond the alae landmarks
APERTURE_ROI_UP_FW = 0.035     # ROI top above min(alae y, nose bottom y)
APERTURE_ROI_DOWN_FW = 0.015   # ROI bottom below the nose bottom
APERTURE_CONTRAST_L = 40.0     # component must be this far under ROI median
                               #   L (8-bit Lab L, ≈16 L*): apertures are
                               #   near-black vs philtrum skin
APERTURE_MIN_AREA_FW = 0.008   # component area >= (0.008fw)^2 (floor 4 px)
APERTURE_MAX_AREA_FW = 0.06    # and <= (0.06fw)^2 — bigger blobs are beard
                               #   shadow, not an aperture
APERTURE_MIN_FILL = 0.30       # area / bbox area: compactness gate
APERTURE_MAX_DY_FW = 0.03      # L/R centroid vertical misalignment cap
APERTURE_SPLIT_HALF_FW = 0.005  # center strip excluded so a shadow can't
                               #   merge both apertures into one component
APERTURE_DILATE_FW = 0.004     # guard halo (spec allows 0.003..0.005)

ABSTAIN_LOWER_FACE = "lower_face_uncertain"  # retake classification

# Provenance codes (Codex #12 stage 0): per-pixel reason a pixel was NOT
# edited (0 = edited). Recorded by build_mask, sheeted by run_photo.
PROV_EDIT, PROV_OUT_CANVAS, PROV_NO_EVIDENCE = 0, 1, 2
PROV_HYSTERESIS, PROV_LIP, PROV_APERTURE = 3, 4, 5
PROV_NAMES = {PROV_EDIT: "edit", PROV_OUT_CANVAS: "outCanvas",
              PROV_NO_EVIDENCE: "noEvidence",
              PROV_HYSTERESIS: "hysteresisDrop", PROV_LIP: "lipGuard",
              PROV_APERTURE: "apertureGuard"}
PROV_COLORS = {PROV_EDIT: (0, 200, 0), PROV_OUT_CANVAS: (40, 40, 40),
               PROV_NO_EVIDENCE: (160, 160, 160),
               PROV_HYSTERESIS: (0, 255, 255), PROV_LIP: (0, 0, 255),
               PROV_APERTURE: (255, 0, 255)}


def production_zone_soft(crop, skin) -> dict:
    """Serving zone signals in crop coords, SEPARATED (Codex #13 task 1).

    The historical max-union (C1 ∪ shadow ∪ CLIPSeg) survives as "union" —
    the hysteresis growth/seed field keeps its calibration — but the parts
    are now preserved and returned alongside it, because the mustache
    activation rules need to know WHICH family fired:
      semantic : raw CLIPSeg sigmoid heat (fw/45 smoothed, PRE-threshold,
                 PRE-normalization — spike.mustache_region thresholds it at
                 the 0.06 onset itself),
      c1_hard / c1_shadow : the pixel-statistics texture detector fields
                 (the anchor-z normalized_excess is computed separately in
                 prepare_unlabeled and travels as ctx["nz"]).
    Not roi-scoped: the editable-region guard is applied at mask build;
    scoping the field to roi would zero the evidence exactly where the
    extension needs it (pic3 mustache flanks)."""
    from eval.bench_models import clipseg_heat

    c1 = segment_beard(crop, skin)
    heat = clipseg_heat(CLIPSEG_MODEL, crop.bgr, ["beard stubble"],
                        normalize=False)
    heat = cv2.GaussianBlur(heat, (0, 0), sigmaX=max(2.0, crop.face_width / 45))
    region = np.clip((heat - CLIPSEG_THR) / (1.0 - CLIPSEG_THR), 0, 1)
    union = np.maximum(np.maximum(c1.hard, c1.shadow), region)
    return {"union": union.astype(np.float32),
            "semantic": heat.astype(np.float32),
            "c1_hard": c1.hard.astype(np.float32),
            "c1_shadow": c1.shadow.astype(np.float32)}


def prepare_unlabeled(name: str, img_path: Path) -> dict | None:
    """prepare_photo counterpart, v4: CLIPSeg zone in place of GT, and the
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

    zone_parts = production_zone_soft(crop, skin)
    zone_soft = zone_parts["union"]
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
                semantic_heat=zone_parts["semantic"], zone_parts=zone_parts,
                lowev=lowev, protect_d=protect_d, cand_zone=cand_zone,
                cands_ext=cands, name=name)


def detect_nostril_apertures(bgr: np.ndarray, landmarks: np.ndarray,
                             fw: float) -> np.ndarray | None:
    """Detect the two nostril APERTURES as skin-contrasting dark compact
    components in a nose-bottom ROI; return their union dilated by
    APERTURE_DILATE_FW as the guard mask, or None when no valid pair exists
    (caller must then ABSTAIN — a guard is never fabricated).

    Per-component gates: area within [APERTURE_MIN_AREA_FW², max²],
    compactness (bbox fill ratio), centroid on its own side of the nose
    center; pair gate: one component per side + vertical alignment."""
    h, w = bgr.shape[:2]
    nose_x, nose_y = (float(v) for v in landmarks[NOSE_BOTTOM])
    al = landmarks[list(NOSTRILS)].astype(np.float64)

    x0 = int(max(0, np.floor(al[:, 0].min() - APERTURE_ROI_PAD_FW * fw)))
    x1 = int(min(w, np.ceil(al[:, 0].max() + APERTURE_ROI_PAD_FW * fw) + 1))
    y0 = int(max(0, np.floor(min(al[:, 1].min(), nose_y)
                             - APERTURE_ROI_UP_FW * fw)))
    y1 = int(min(h, np.ceil(nose_y + APERTURE_ROI_DOWN_FW * fw) + 1))
    if x1 - x0 < 4 or y1 - y0 < 3:
        return None

    roi_l = cv2.cvtColor(bgr[y0:y1, x0:x1],
                         cv2.COLOR_BGR2Lab)[..., 0].astype(np.float32)
    med = float(np.median(roi_l))
    dark = roi_l < med - APERTURE_CONTRAST_L
    # center strip out: a philtrum/columella shadow must not merge L and R
    split = max(1, int(round(APERTURE_SPLIT_HALF_FW * fw)))
    cx_roi = int(round(nose_x)) - x0
    dark[:, max(0, cx_roi - split):cx_roi + split + 1] = False

    n, labels, stats, cents = cv2.connectedComponentsWithStats(
        dark.astype(np.uint8), connectivity=8)
    min_px = max(4, int((APERTURE_MIN_AREA_FW * fw) ** 2))
    max_px = int((APERTURE_MAX_AREA_FW * fw) ** 2)
    best: dict[str, tuple[int, float]] = {}   # side -> (label, area)
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if not min_px <= area <= max_px:
            continue
        bw, bh = int(stats[i, cv2.CC_STAT_WIDTH]), int(stats[i, cv2.CC_STAT_HEIGHT])
        if area / float(max(bw * bh, 1)) < APERTURE_MIN_FILL:
            continue
        side = "L" if cents[i, 0] + x0 < nose_x else "R"
        if side not in best or area > best[side][1]:
            best[side] = (i, area)
    if "L" not in best or "R" not in best:
        return None
    li, ri = best["L"][0], best["R"][0]
    if abs(float(cents[li, 1] - cents[ri, 1])) > APERTURE_MAX_DY_FW * fw:
        return None

    guard = np.zeros((h, w), np.uint8)
    pair = (labels == li) | (labels == ri)
    guard[y0:y1, x0:x1] = pair.astype(np.uint8)
    dk = max(3, int(APERTURE_DILATE_FW * fw) | 1)
    guard = cv2.dilate(guard, cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (dk, dk)))
    return guard > 0


def _anatomy_guards(crop, legacy: bool = False) -> dict | None:
    """Tight anatomical no-paint guards (Codex #12 lips; #13 apertures).

    lip      = true LIPS_OUTER polygon + 0.004fw dilation
    aperture = detect_nostril_apertures() pair, dilated 0.004fw

    Returns None when the aperture pair cannot be detected — the caller
    ABSTAINS the photo (retake class "lower_face_uncertain"); a fabricated
    guard would hide exactly the failure it exists to catch. These masks
    are final — no re-dilation after this point — and are exactly what
    eval.hybrid_rulers byte-identity gates check.

    legacy=True reproduces the pre-Codex-#12 guards verbatim (protect-mask
    seeded distance dilation, key "nostril_core"); it exists ONLY so
    spike.mask_eval can measure before/after on the same harness.
    """
    h, w = crop.bgr.shape[:2]
    fw = crop.face_width

    if legacy:  # pre-Codex-#12 guards, kept for measurement only
        yy = np.arange(h, dtype=np.float32)[:, None]
        lip_pts = crop.landmarks[LIPS_OUTER].astype(np.int32)
        lip = np.zeros((h, w), np.uint8)
        cv2.fillPoly(lip, [lip_pts], 1)
        lip = cv2.dilate(lip, np.ones((5, 5), np.uint8)) > 0
        lips_top = float(crop.landmarks[LIPS_OUTER][:, 1].min())
        nostril = (crop.protect_mask > 0.5) & (yy < lips_top - 2)
        ndist = cv2.distanceTransform((~nostril).astype(np.uint8),
                                      cv2.DIST_L2, 3)
        nostril_core = ndist < max(4.0, 0.025 * fw)
        return {"lip": lip, "aperture": nostril_core}

    lip_poly = np.zeros((h, w), np.uint8)
    cv2.fillPoly(lip_poly, [crop.landmarks[LIPS_OUTER].astype(np.int32)], 1)
    lk = max(3, int(LIP_GUARD_DILATE_FW * fw) | 1)
    lip = cv2.dilate(lip_poly, cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (lk, lk))) > 0

    aperture = detect_nostril_apertures(crop.bgr, crop.landmarks, fw)
    if aperture is None:
        return None
    return {"lip": lip, "aperture": aperture}


def build_mask(ctx: dict, legacy_guards: bool = False,
               ) -> tuple[np.ndarray | None, np.ndarray | None, dict]:
    """v4 face-only mask: canvas = buffered sub-nose oval ∪ face side of the
    jawline tube (spike.mask_v3), seeded evidence hysteresis, lip + detected
    aperture guards. edit_mask (what the composite writes) TERMINATES at the
    jaw; model_mask (LaMa's hole) may cross it by MODEL_JAW_CONTEXT_FW only.

    Returns (None, None, {"abstain": ...}) when the aperture pair cannot be
    detected — photo-level abstain replaces both the fabricated guard AND
    the v3 per-pixel occluder subtraction.

    The returned dict additionally carries "provenance": a uint8 per-pixel
    map of WHY each pixel is not edited (PROV_* codes), plus per-code pixel
    counts in the "mask" info. legacy_guards reproduces the pre-Codex-#12
    guards for before/after measurement only (spike.mask_eval)."""
    crop = ctx["crop"]
    fw = crop.face_width
    shape = crop.bgr.shape[:2]

    guards = _anatomy_guards(crop, legacy=legacy_guards)
    if guards is None:
        return None, None, {"abstain": ABSTAIN_LOWER_FACE}

    canvas = build_canvas(crop.landmarks, shape, fw)

    # Hysteresis evidence: a component survives iff it carries one strong
    # seed from EITHER independent signal (CLIPSeg union / anchor-z).
    seed = (ctx["zone_soft"] > CONFIG["seedClipseg"]) \
        | (ctx["nz"] > CONFIG["seedZ"])
    growth = ctx["zone"] | (ctx["nz"] > 0) | seed
    mask = hysteresis_mask(growth, seed, canvas["canvas"])

    # Strict hair components get a small halo (never a blanket dilation).
    hk = max(3, int(CONFIG["hairHaloDilate"] * fw) | 1)
    for c in ctx["cands_ext"]:
        comp = np.zeros(shape, np.uint8)
        comp[c.px[:, 0], c.px[:, 1]] = 1
        mask |= (cv2.dilate(comp, np.ones((hk, hk), np.uint8)) > 0) \
            & canvas["canvas"]

    ck = max(3, int(0.01 * fw) | 1)
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE,
                            np.ones((ck, ck), np.uint8)) > 0
    mask &= canvas["canvas"]

    def _guard(mk: np.ndarray, cv_mask: np.ndarray) -> np.ndarray:
        return mk & ~guards["lip"] & ~guards["aperture"] & cv_mask

    # Mustache region activation (Codex #13): decide presence per subregion
    # on the SEPARATED signals (raw CLIPSeg semantic + anchor-z texture, both
    # required); on activation the subregion is filled WHOLE (partial-erase
    # ban) — fill = R ∩ canvas − lip − aperture. Synthetic-ctx callers
    # (guard tests) that carry no semantic field skip the stage.
    mustache_info: dict | None = None
    if ctx.get("semantic_heat") is not None:
        from spike import mustache_region

        strict_edit = _guard(mask, canvas["canvas"])
        subr = mustache_region.mustache_subregions(
            crop.landmarks, shape, fw)
        semantic, texture, coincident = mustache_region.region_signals(
            ctx["semantic_heat"], ctx["nz"], fw)
        dec = mustache_region.decide(subr, semantic, texture, coincident,
                                     strict_edit, fw)
        fill = mustache_region.activation_fill(
            subr, dec.activated, canvas["canvas"], guards["lip"],
            guards["aperture"])
        mask |= fill
        mustache_info = {"fired": dec.fired, "rules": dec.rules,
                         "activated": list(dec.activated),
                         "fillPx": int(fill.sum()),
                         "detail": dec.detail,
                         # 무수염 negative kill 검증: 보류 — negative 세트 대기
                         "negativeKill": "보류: 세트 대기"}

    pre_guard = mask.copy()

    edit_mask = _guard(mask, canvas["canvas"])
    mk = max(3, int(CONFIG["modelMaskDilate"] * fw) | 1)
    mdl = cv2.dilate(edit_mask.astype(np.uint8),
                     np.ones((mk, mk), np.uint8)) > 0
    # Jaw-context band: the HOLE may continue below the jaw so boundary
    # stubble doesn't condition the fill (downward-only extension, capped
    # by model_canvas at jaw + MODEL_JAW_CONTEXT_FW); the composite never
    # writes there (edit_mask ⊆ canvas ends at the jaw).
    ext = max(1, int(round(mask_v3.MODEL_JAW_CONTEXT_FW * fw)))
    for s in range(1, ext + 1):
        mdl[s:] |= edit_mask[:-s]
    model_mask = _guard(mdl, canvas["model_canvas"])

    guards["canvas"] = canvas["canvas"]
    guards["model_canvas"] = canvas["model_canvas"]
    guards["below_jaw"] = canvas["below_jaw"]

    # Provenance (Codex #12 stage 0): why is each pixel NOT edited. Guard
    # footprints are painted regardless of evidence (that is the map's whole
    # point: seeing what the guards would eat); edit wins, out-of-canvas
    # wins over guards that morphologically spilled outside.
    prov = np.full(shape, PROV_NO_EVIDENCE, np.uint8)
    prov[growth & ~mask] = PROV_HYSTERESIS
    prov[guards["aperture"]] = PROV_APERTURE
    prov[guards["lip"]] = PROV_LIP
    prov[~canvas["canvas"]] = PROV_OUT_CANVAS
    prov[edit_mask] = PROV_EDIT
    counts = np.bincount(prov.ravel(), minlength=len(PROV_NAMES))
    guards["provenance"] = prov

    info = {"maskFrac": round(float(edit_mask.mean()), 4),
            "provenancePx": {PROV_NAMES[c]: int(counts[c])
                             for c in sorted(PROV_NAMES)},
            "zoneFrac": round(float(ctx["zone"].mean()), 4),
            "modelMaskFrac": round(float(model_mask.mean()), 4),
            "guardExcludedEnergyFrac": round(
                float((pre_guard & ~edit_mask).sum())
                / max(float(pre_guard.sum()), 1.0), 4),
            "seedPx": int(seed.sum()),
            "mustache": mustache_info,
            "config": CONFIG}
    return edit_mask, model_mask, {"mask": info, **guards, "growth": growth}


def _fill_window(ctx: dict, part_mask: np.ndarray,
                 ) -> tuple[np.ndarray, dict]:
    """LaMa fill for ONE window: tight bbox around part_mask + 0.12fw real
    context (Codex #10 Q7-3 — always shrinking the whole expanded crop to 512
    wastes effective resolution), mod-8 aligned in the full frame, <=512
    inference. Returns a crop-sized float fill (valid where part_mask) + info."""
    crop = ctx["crop"]
    bgr = ctx["bgr"]
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
    """Deterministic LaMa fill, single FACE window (v4): the model inpaints
    model_mask (context margin + jaw-context band included); the composite
    writes edit_mask pixels ONLY — never below the jaw. The v3 face/neck
    sequential two-window structure left with the neck scope."""
    crop = ctx["crop"]
    fill, info = _fill_window(ctx, model_mask)
    result = crop.bgr.copy()
    result[edit_mask] = np.clip(np.rint(fill[edit_mask]), 0,
                                255).astype(np.uint8)
    return result, {**info, "windows": 1}


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
    if edit_mask is None:
        # Aperture pair undetected → photo-level abstain (retake class).
        rec = {"id": name, "verdict": "abstain",
               "abstains": [guards["abstain"]],
               "retakeClass": guards["abstain"]}
        print(f"{name}: abstain ({guards['abstain']})")
        return rec
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
                        "singleAnchor": bundle.single_anchor,
                        # degraded references must be visible in the record
                        # (Codex #11: level-4 was silently a normal pass)
                        "lowConf": bool(getattr(bundle, "low_conf", False)),
                        "statsLowConf": bool(getattr(ctx["stats"],
                                                     "any_low_conf", False))}

    nz_result = normalized_excess(result, fw, ctx["stats"])
    rec.update(score_photo(crop.bgr, result, edit_mask, ctx["lowev"],
                           None, guards, fw, excess_result=nz_result))

    # Silhouette ruler: face-shape preservation is measured, not masked.
    sil = score_silhouette(crop.bgr, result, crop.landmarks, fw)
    rec["silhouette"] = sil
    # ADVISORY for checkpoint-5 (Codex #11): the ruler as built cannot
    # discriminate — its stable points include hair edges, so erasing the
    # beard reads as contour change (user-praised v2 == airbrushed one-hole
    # on psd04, and identity abstains on hair-buried jaws). Recorded, never
    # folded into the verdict; the human judges 얼굴형 directly against ORIG.
    # Permanent redesign spec (hair-free stable points, contour-path
    # tracking, no hard-fail without identity-pass) is Sprint-B backlog.
    rec["silhouetteAdvisory"] = True

    # Fill color harmony (independent of the L-only fillLift breaker).
    # anchor_cov: ab block of the bundle Lab covariance (reviewer trap #3 —
    # [:2,:2] would be L,a).
    exclude = (ctx["zone"] | (ctx["nz"] > 0) | guards["lip"]
               | guards["aperture"])
    fc = score_fill_color(crop.bgr, result, edit_mask, exclude, fw,
                          anchor_cov=bundle.lab_cov[1:, 1:].astype(np.float64))
    rec["fillColor"] = fc
    if fc["fillColorVerdict"] == "abstain":
        rec["abstains"] = rec.get("abstains", []) + ["fillColor"]
        if rec.get("verdict") == "pass":
            rec["verdict"] = "abstain"

    # Ghost gate in anchor-z space, scoped to candidates the mask INTENDED
    # to erase; fringe (in-canvas, out-of-mask) = coverage shortfall flag.
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
        label(_tint(guards["lip"] | guards["aperture"], (0, 0, 255)),
              "GUARDS"),
        label(_tint(guards["canvas"], (255, 128, 0)), "CANVAS"),
    ])
    cv2.imwrite(str(out_dir / f"{name}_layers.png"), layers)

    # Provenance sheet (Codex #12 stage 0): color-coded reason-not-edited
    # map next to the original, so mask drop causes are eyeballable per run.
    cv2.imwrite(str(out_dir / f"{name}_provenance.png"),
                provenance_sheet(crop.bgr, guards["provenance"]))
    print(f"{name}: {json.dumps(rec)}")
    return rec


def provenance_sheet(bgr: np.ndarray, prov: np.ndarray) -> np.ndarray:
    """ORIG | color-coded provenance map (PROV_COLORS), shared by run_photo
    and spike.mask_eval."""
    sheet = np.zeros((*prov.shape, 3), np.uint8)
    for code, color in PROV_COLORS.items():
        sheet[prov == code] = color
    return np.hstack([label(bgr, "ORIG"),
                      label(sheet, "PROVENANCE")])


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
