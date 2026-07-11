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
from dataclasses import dataclass, field
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
    ReferenceAbstain, anchor_blackhat_stats, build_reference_bundle,
    normalized_excess,
)
from eval.run_owndomain_eval import _fit  # noqa: E402
from eval.silhouette_ruler import score_silhouette  # noqa: E402
from spike import lama_runner, mask_v3, mustache_region  # noqa: E402
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

# --- Aperture detector robustness gates (Codex #14 Q4, 2026-07-12). --------
# ADDITIVE pass conditions on top of the frozen per-component gates above —
# a photo that failed detection before can only keep failing (no fabricated
# pass), a photo that passed must also satisfy these. Bounds calibrated on
# the n=18 non-holdout pair detections (scratchpad calib_aperture 2026-07-12):
#   L/R area ratio      measured max 2.68  -> bound 5.0   (1.9x margin)
#   nose-x asymmetry    measured max 0.062 -> bound 0.12fw (1.9x margin)
#   centroid gap        measured 0.091..0.158fw -> bounds 0.05 / 0.30fw
#   contrast persistence: {36,40} is the largest set ALL 18 pass (44 loses
#     IMG_4578, 32 loses psd02/IMG_4578) — so the pair must hold at both.
#   ROI-shift consensus: measured min 3/4 hits -> floor 3 of 4.
APERTURE_AREA_RATIO_MAX = 5.0   # max(areaL,areaR)/min(...)
APERTURE_X_ASYM_MAX_FW = 0.12   # |(nose_x-cxL) - (cxR-nose_x)|
APERTURE_GAP_MIN_FW = 0.05      # cxR - cxL lower bound
APERTURE_GAP_MAX_FW = 0.30      # cxR - cxL upper bound
APERTURE_CONTRAST_SET = (36.0, 40.0)  # pair must hold at every threshold
APERTURE_PERTURB_FW = 0.005     # ROI shift magnitude (floor 2 px)
APERTURE_PERTURB_MIN_HITS = 3   # of the 4 shifted ROIs

# Typed rejection reasons (Codex #14 Q4): detection failure always abstains
# the photo (never a fabricated guard); the reason names the failed gate.
APERTURE_REJECT_ROI = "aperture_roi_degenerate"
APERTURE_REJECT_NO_PAIR = "aperture_no_pair"
APERTURE_REJECT_DY = "aperture_pair_misaligned"
APERTURE_REJECT_RATIO = "aperture_area_ratio"
APERTURE_REJECT_ASYM = "aperture_x_asymmetry"
APERTURE_REJECT_GAP = "aperture_gap_out_of_range"
APERTURE_REJECT_CONTRAST = "aperture_unstable_contrast"
APERTURE_REJECT_PERTURB = "aperture_unstable_roi"

# --- Component dual-signal gate + global coincident no-op (2026-07-12). ----
# Diagnostic basis (scratchpad diag_false_fire, re-verified): bare-skin
# IMG_4564 carried a 14,549 px strict false fire — nz>3 pore speckle (3,452
# px seeds, 0 px semantic support) + c1_shadow jaw band (4,549 px) — with
# ZERO coincident pixels; morphology (halo dilate + close) amplified 40.6%
# of it from no signal. coincident = dilate(raw CLIPSeg > SEMANTIC_THR,
# 0.006fw) ∩ (nz > 0), the single definition in
# spike.mustache_region.region_signals.
# (b2) Component gate: every CLOSED strict component (hysteresis growth +
# cand halos + close bridges) must contain >= 1 coincident px, else the
# whole component is dropped. Measured: 4564 100% suppressed / pic3 0.00pp /
# psd03 0.00pp GT-recall loss (component-level, vs the CATASTROPHIC region
# gates: full anatomy gating cost pic3 -36pp). Post-morphology placement is
# load-bearing: the pre-morphology variant re-measured -19.5pp on psd03.
COMP_COINCIDENT_MIN_PX = 1
# (c) PROVISIONAL global no-op: total canvas coincident below this ABSOLUTE
# floor AND no mustache subregion fired (frozen rules A/B silent) -> the
# whole photo is a no-op (strict mask AND activation fill both suppressed).
# 2026-07-12 repair: the original mass-only trigger suppressed GT-positive
# pic1 WHOLE (coincident 179 < 300 with ALL 4 strict components coincident-
# supported and rules A/B/A fired; b3 editPx 18,273 / GT recall 99.6 -> 0)
# — a provisional low-mass heuristic must never override the FROZEN rule-A/B
# presence standard, so a rule fire now overrides the floor (recorded in
# noOp as overriddenByMustacheRules, never triggered). Negative basis
# re-measured after the repair: 4564 (coincident 0, 43/43 components
# dropped, fired F/F/F) still no-ops; 4567 (legacy-guard bypass measurement
# 2026-07-12: coincident 39, 19/21 components dropped, fired F/F/F — the
# historical 11,279px activation false fire does NOT reproduce under the
# current frozen rules) still no-ops. Floor value unchanged at 300 absolute
# (n=4 mass basis: 4564=0, 4567=39, pic3=1473, psd03=509 px; psd03 margin
# just 1.7x; the fw²-normalized variant annihilated psd03 (-86pp recall)
# and is BANNED). Still PROVISIONAL: dense-beard low-coincident positives
# need a wider-set re-validation before product adoption.
GLOBAL_COINCIDENT_NOOP_PX = 300

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
    if isinstance(bundle, ReferenceAbstain):
        # Typed reason (Codex #14): insufficient_face_resolution is a capture
        # problem (retake), the QC reasons name the gate that ate the anchors.
        return dict(name=name,
                    abstain=f"reference abstain ({bundle.reason})",
                    referenceAbstain=bundle.as_json())
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


@dataclass
class ApertureDetection:
    """Typed aperture-detection result (Codex #14 Q4).

    ok=False NEVER comes with a guard: the caller must abstain the photo
    (retake class ABSTAIN_LOWER_FACE) — a fabricated guard would hide the
    exact failure this detector exists to catch."""
    ok: bool
    reject: str | None            # APERTURE_REJECT_* when not ok
    core: np.ndarray | None       # detected aperture pair, undilated
    halo: np.ndarray | None       # core + APERTURE_DILATE_FW guard halo
    confidence: float             # ROI-shift consensus fraction (incl. base)
    checks: dict = field(default_factory=dict)  # measured gate values


def _aperture_pair_scan(bgr: np.ndarray, landmarks: np.ndarray, fw: float,
                        contrast: float, shift: tuple[int, int] = (0, 0),
                        ) -> tuple[np.ndarray | None, str | None, dict]:
    """One detection scan: dark compact pair in the (optionally shifted)
    nose-bottom ROI at the given darkness contrast. Returns (pair mask in
    full-image coords | None, typed reject reason, measured checks).

    Per-component gates (frozen, Codex #13): area in [min², max²],
    compactness, own side of the nose center. Pair gates: vertical
    alignment (frozen) + the calibrated robustness gates (Codex #14 Q4):
    L/R area ratio, nose-x symmetry, centroid gap bounds."""
    h, w = bgr.shape[:2]
    nose_x, nose_y = (float(v) for v in landmarks[NOSE_BOTTOM])
    al = landmarks[list(NOSTRILS)].astype(np.float64)
    sx, sy = shift

    x0 = int(max(0, np.floor(al[:, 0].min() - APERTURE_ROI_PAD_FW * fw))) + sx
    x1 = int(min(w, np.ceil(al[:, 0].max() + APERTURE_ROI_PAD_FW * fw) + 1)) + sx
    y0 = int(max(0, np.floor(min(al[:, 1].min(), nose_y)
                             - APERTURE_ROI_UP_FW * fw))) + sy
    y1 = int(min(h, np.ceil(nose_y + APERTURE_ROI_DOWN_FW * fw) + 1)) + sy
    x0, x1 = max(0, x0), min(w, x1)
    y0, y1 = max(0, y0), min(h, y1)
    if x1 - x0 < 4 or y1 - y0 < 3:
        return None, APERTURE_REJECT_ROI, {"roi": [x0, y0, x1, y1]}

    roi_l = cv2.cvtColor(bgr[y0:y1, x0:x1],
                         cv2.COLOR_BGR2Lab)[..., 0].astype(np.float32)
    med = float(np.median(roi_l))
    dark = roi_l < med - contrast
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
    checks: dict = {"roi": [x0, y0, x1, y1], "contrast": contrast}
    if "L" not in best or "R" not in best:
        checks["sidesFound"] = sorted(best)
        return None, APERTURE_REJECT_NO_PAIR, checks
    li, ri = best["L"][0], best["R"][0]
    a_l, a_r = float(best["L"][1]), float(best["R"][1])
    cxl, cxr = float(cents[li, 0]) + x0, float(cents[ri, 0]) + x0
    checks.update({
        "areaL": int(a_l), "areaR": int(a_r),
        "areaRatio": round(max(a_l, a_r) / max(min(a_l, a_r), 1.0), 2),
        "dyFw": round(abs(float(cents[li, 1] - cents[ri, 1])) / fw, 4),
        "gapFw": round((cxr - cxl) / fw, 4),
        "xAsymFw": round(abs((nose_x - cxl) - (cxr - nose_x)) / fw, 4),
    })
    if checks["dyFw"] > APERTURE_MAX_DY_FW:
        return None, APERTURE_REJECT_DY, checks
    if checks["areaRatio"] > APERTURE_AREA_RATIO_MAX:
        return None, APERTURE_REJECT_RATIO, checks
    if checks["xAsymFw"] > APERTURE_X_ASYM_MAX_FW:
        return None, APERTURE_REJECT_ASYM, checks
    if not APERTURE_GAP_MIN_FW <= checks["gapFw"] <= APERTURE_GAP_MAX_FW:
        return None, APERTURE_REJECT_GAP, checks

    pair = np.zeros((h, w), bool)
    pair[y0:y1, x0:x1] = (labels == li) | (labels == ri)
    return pair, None, checks


def detect_nostril_apertures(bgr: np.ndarray, landmarks: np.ndarray,
                             fw: float) -> ApertureDetection:
    """Detect the two nostril APERTURES as a skin-contrasting dark compact
    pair in the nose-bottom ROI (Codex #13 base + #14 Q4 robustness).

    Pipeline: base scan at APERTURE_CONTRAST_L (frozen) with the calibrated
    geometry gates (area ratio / nose-x symmetry / gap bounds) → the pair
    must PERSIST at every darkness threshold in APERTURE_CONTRAST_SET →
    the pair must survive >= APERTURE_PERTURB_MIN_HITS of the 4 shifted
    ROIs (±APERTURE_PERTURB_FW·fw in x and y). Any failure returns
    ok=False with a typed reason — the caller abstains, a guard is never
    fabricated. confidence = (base + shifted hits) / 5."""
    core, reject, checks = _aperture_pair_scan(bgr, landmarks, fw,
                                               APERTURE_CONTRAST_L)
    if core is None:
        return ApertureDetection(False, reject, None, None, 0.0, checks)

    persist = {}
    for c in APERTURE_CONTRAST_SET:
        if c == APERTURE_CONTRAST_L:
            persist[c] = True
            continue
        m, _, _ = _aperture_pair_scan(bgr, landmarks, fw, c)
        persist[c] = m is not None
    checks["contrastPersist"] = {str(k): v for k, v in persist.items()}
    if not all(persist.values()):
        return ApertureDetection(False, APERTURE_REJECT_CONTRAST,
                                 None, None, 0.0, checks)

    d = max(2, int(round(APERTURE_PERTURB_FW * fw)))
    hits = 0
    for sh in ((d, 0), (-d, 0), (0, d), (0, -d)):
        m, _, _ = _aperture_pair_scan(bgr, landmarks, fw,
                                      APERTURE_CONTRAST_L, shift=sh)
        hits += int(m is not None)
    checks["perturbHits"] = f"{hits}/4"
    confidence = round((1 + hits) / 5.0, 2)
    if hits < APERTURE_PERTURB_MIN_HITS:
        return ApertureDetection(False, APERTURE_REJECT_PERTURB,
                                 None, None, confidence, checks)

    dk = max(3, int(APERTURE_DILATE_FW * fw) | 1)
    halo = cv2.dilate(core.astype(np.uint8), cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (dk, dk))) > 0
    return ApertureDetection(True, None, core, halo, confidence, checks)


def _anatomy_guards(crop, legacy: bool = False) -> dict:
    """Tight anatomical no-paint guards (Codex #12 lips; #13 apertures).

    lip      = true LIPS_OUTER polygon + 0.004fw dilation
    aperture = detect_nostril_apertures() pair halo (core + 0.004fw), or
               None when detection fails — the caller ABSTAINS the photo
               (retake class "lower_face_uncertain") with the typed reason
               in "aperture_detection"; a fabricated guard would hide
               exactly the failure it exists to catch. These masks are
               final — no re-dilation after this point — and are exactly
               what eval.hybrid_rulers byte-identity gates check.

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
        return {"lip": lip, "aperture": nostril_core,
                "aperture_detection": None}

    lip_poly = np.zeros((h, w), np.uint8)
    cv2.fillPoly(lip_poly, [crop.landmarks[LIPS_OUTER].astype(np.int32)], 1)
    lk = max(3, int(LIP_GUARD_DILATE_FW * fw) | 1)
    lip = cv2.dilate(lip_poly, cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (lk, lk))) > 0

    det = detect_nostril_apertures(crop.bgr, crop.landmarks, fw)
    return {"lip": lip, "aperture": det.halo if det.ok else None,
            "aperture_detection": det}


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
    if guards["aperture"] is None:
        det = guards["aperture_detection"]
        return None, None, {"abstain": ABSTAIN_LOWER_FACE,
                            "apertureReject": det.reject,
                            "apertureChecks": det.checks}

    canvas = build_canvas(crop.landmarks, shape, fw)

    # Independent-signal coincidence (diag 2026-07-12): coincident =
    # dilate(raw CLIPSeg > SEMANTIC_THR, 0.006fw) ∩ (nz > 0) — the single
    # definition lives in spike.mustache_region.region_signals. Synthetic-ctx
    # callers (guard tests) without a semantic field skip every coincident
    # stage (component gate, global no-op, mustache activation).
    semantic = texture = coincident = co_canvas = None
    noop_info: dict | None = None
    if ctx.get("semantic_heat") is not None:
        semantic, texture, coincident = mustache_region.region_signals(
            ctx["semantic_heat"], ctx["nz"], fw)
        co_canvas = coincident & canvas["canvas"]
        co_total = int(co_canvas.sum())
        # PROVISIONAL (n=4 mass basis, psd03 margin 1.7x): absolute px floor
        # ONLY — the fw² variant killed psd03 recall (-86pp). lowMass is the
        # floor check; "triggered" is FINALIZED after the mustache decision
        # below (2026-07-12 repair): the frozen rule-A/B presence standard
        # overrides the provisional floor, see the constant's comment.
        noop_info = {"triggered": False,
                     "lowMass": co_total < GLOBAL_COINCIDENT_NOOP_PX,
                     "coincidentPx": co_total,
                     "floorPx": GLOBAL_COINCIDENT_NOOP_PX,
                     "provisional": True,
                     "reason": None}

    # Hysteresis evidence: a component survives iff it carries one strong
    # seed from EITHER independent signal (CLIPSeg union / anchor-z).
    seed = (ctx["zone_soft"] > CONFIG["seedClipseg"]) \
        | (ctx["nz"] > CONFIG["seedZ"])
    growth = ctx["zone"] | (ctx["nz"] > 0) | seed
    mask = hysteresis_mask(growth, seed, canvas["canvas"])

    # Strict hair components get a small halo (never a blanket dilation).
    # cands_ext no longer joins the composite unconditionally (Codex #14):
    # the component dual-signal gate below subsumes every candidate — an
    # isolated candidate whose closed component carries no coincident px
    # drops with its component.
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

    # (b2) Component dual-signal gate on the CLOSED strict components (diag
    # 2026-07-12, the measured-and-adopted lever: 4564 100% suppressed /
    # pic3 0.00pp / psd03 0.00pp): every connected component must contain
    # >= 1 coincident px (independent semantic+texture agreement) or the
    # WHOLE component — hysteresis growth, cand halos and close bridges
    # alike — drops. Placement is deliberately POST-morphology: the
    # pre-morphology variant re-measured -19.5pp psd03 GT recall (close
    # legitimately seals GT-beard fragments onto coincident-carrying cores),
    # while gating the closed components keeps the 4564 kill total (every
    # closed component there carries 0 coincident) and nothing after this
    # point re-dilates the edit mask, so a dropped component cannot be
    # resurrected by morphology.
    comp_gate: dict | None = None
    if co_canvas is not None:
        n_lbl, labels = cv2.connectedComponents(mask.astype(np.uint8),
                                                connectivity=8)
        co_per = np.bincount(labels[co_canvas], minlength=n_lbl)
        keep = co_per >= COMP_COINCIDENT_MIN_PX
        keep[0] = False
        gated = keep[labels]
        comp_gate = {"components": int(n_lbl - 1),
                     "droppedComponents": int((n_lbl - 1)
                                              - int(keep[1:].sum())),
                     "droppedPx": int(mask.sum()) - int(gated.sum())}
        mask = gated

    def _guard(mk: np.ndarray, cv_mask: np.ndarray) -> np.ndarray:
        return mk & ~guards["lip"] & ~guards["aperture"] & cv_mask

    # Mustache region activation (Codex #13): decide presence per subregion
    # on the SEPARATED signals (raw CLIPSeg semantic + anchor-z texture, both
    # required); on activation the subregion is filled WHOLE (partial-erase
    # ban) — fill = R ∩ canvas − lip − aperture. Synthetic-ctx callers
    # (guard tests) that carry no semantic field skip the stage.
    mustache_info: dict | None = None
    if coincident is not None:
        strict_edit = _guard(mask, canvas["canvas"])
        subr = mustache_region.mustache_subregions(
            crop.landmarks, shape, fw)
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

    # (c) PROVISIONAL global no-op, FINALIZED here (2026-07-12 repair): the
    # photo-wide mass floor only takes the photo when the FROZEN mustache
    # rules A/B found no presence in ANY subregion — a provisional low-mass
    # heuristic never overrides the frozen positive-evidence standard (the
    # mass-only trigger suppressed GT-positive pic1 whole; see the constant
    # comment for the measured basis, incl. 4567 re-measured F/F/F under the
    # current rules via the legacy-guard bypass). When triggered, NOTHING is
    # edited — strict mask AND activation fill are both suppressed; when
    # overridden, the low mass is still recorded for the report.
    if noop_info is not None and noop_info["lowMass"]:
        fired_any = mustache_info is not None and any(
            mustache_info["fired"].values())
        if fired_any:
            noop_info["overriddenByMustacheRules"] = True
            noop_info["reason"] = (
                f"canvas coincident {noop_info['coincidentPx']}px < "
                f"{GLOBAL_COINCIDENT_NOOP_PX}px absolute floor, but frozen "
                f"mustache rules fired {mustache_info['rules']} -> floor "
                "overridden, photo edits (PROVISIONAL floor never "
                "suppresses rule-A/B positives; 2026-07-12 repair)")
        else:
            noop_info["triggered"] = True
            noop_info["reason"] = (
                f"canvas coincident {noop_info['coincidentPx']}px < "
                f"{GLOBAL_COINCIDENT_NOOP_PX}px absolute floor and no "
                "mustache subregion fired -> photo-wide no-op "
                "(PROVISIONAL, n=4 diag 2026-07-12)")
            mask = np.zeros(shape, bool)
            if mustache_info is not None:
                mustache_info["fillPxDecided"] = mustache_info["fillPx"]
                mustache_info["fillPx"] = 0
                mustache_info["suppressedByNoOp"] = True

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

    ap_det = guards.get("aperture_detection")
    info = {"maskFrac": round(float(edit_mask.mean()), 4),
            "provenancePx": {PROV_NAMES[c]: int(counts[c])
                             for c in sorted(PROV_NAMES)},
            "zoneFrac": round(float(ctx["zone"].mean()), 4),
            "modelMaskFrac": round(float(model_mask.mean()), 4),
            "guardExcludedEnergyFrac": round(
                float((pre_guard & ~edit_mask).sum())
                / max(float(pre_guard.sum()), 1.0), 4),
            "seedPx": int(seed.sum()),
            "componentGate": comp_gate,
            "noOp": noop_info,
            "aperture": (None if ap_det is None else
                         {"confidence": ap_det.confidence,
                          "checks": ap_det.checks}),
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
        if "referenceAbstain" in ctx:   # typed reason -> report (Codex #14)
            rec["referenceAbstain"] = ctx["referenceAbstain"]
        print(f"{name}: {ctx['abstain']}")
        return rec
    edit_mask, model_mask, guards = build_mask(ctx)
    if edit_mask is None:
        # Aperture pair undetected → photo-level abstain (retake class),
        # with the typed detector rejection reason (Codex #14 Q4).
        rec = {"id": name, "verdict": "abstain",
               "abstains": [guards["abstain"]],
               "retakeClass": guards["abstain"],
               "apertureReject": guards.get("apertureReject"),
               "apertureChecks": guards.get("apertureChecks")}
        print(f"{name}: abstain ({guards['abstain']}, "
              f"{guards.get('apertureReject')})")
        return rec
    t_mask = time.perf_counter()
    rec: dict = {"id": name, **guards["mask"]}
    if not edit_mask.any():
        noop = (rec.get("noOp") or {}).get("triggered")
        rec["skip"] = ("global coincident no-op (PROVISIONAL)" if noop
                       else "empty mask")
        print(f"{name}: {rec['skip']}, untouched")
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
