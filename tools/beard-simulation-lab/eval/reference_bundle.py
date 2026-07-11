"""Anatomical reference anchors + normalized black-hat threshold transfer.

Why this exists: the old "clean = complement of the zone" reference COLLAPSES
on hairy photos. Measured failure: on a full-beard selfie the complement
shrank to ~2.6k px of mostly hair-adjacent skin and the per-scale black-hat
thresholds fell from ~15 to ~2, so the ghost ruler started reading normal
skin as surviving hair. Anchors that sit on anatomy that CANNOT grow beard
(upper cheeks, mid-forehead) cannot collapse that way, no matter how hairy
the photo is. Design cross-validated as Codex #10 (2026-07-11).

Two hard rules encoded here:

1. NEVER fall back to complement-of-zone. The fallback ladder ends in None
   (reference abstain) — a missing reference is a refusal, not an excuse to
   grab whatever pixels are left over.
2. Cheek statistics are NOT transferred to the jaw raw. Pore scale, wrinkle
   load and illumination all differ between cheek and jaw, so a raw black-hat
   threshold fit on the cheek is statistically invalid there. The transfer
   pipeline normalizes each black-hat map by local contrast (low-pass L) and
   by a local high-frequency NOISE floor first, then z-scores against the
   anchor distribution binned by local brightness — only the normalized,
   dimensionless quantity crosses anatomy.

MEASURED DEVIATION from the Codex #10 letter (kept because the spec's own
mandatory proof test is the ground truth): the noise floor was specified as
"local RMS of (gray - blur(fw/30)), boxFilter window 7". A box RMS is not a
noise FLOOR at structure pixels — a 1px strand fills ~14% of the 7x7 window,
so nf grows ~linearly with strand depth and the strand's z-score SATURATES at
~1.5-1.8 for any depth (measured on the synthetic fixtures at fw 480/560/640;
depth 40 and 100 score the same). z_thr=4.5 is then unreachable and the
mandated positive control (strands must fire on >50% of their pixels) fails
by construction. Replaced with the robust classical estimator
sigma = 1.4826 * local median(|highpass|) over the same window 7, which
ignores structure filling <50% of the window. Re-measured: strand median z
8.8-11.9 (fires on 86-100% of strand pixels at depth 40-60) while the
hair-free false-positive area stays at 0.08-0.21% <= 1% on all three
mandated fixtures.

SMALL-fw REGIME (previously a documented known limit, now fixed — measured
dev9 v3): at fw <= ~376 the 3px strand kernel returns EXACTLY 0 on smooth
(denoised/beauty-filtered) anchor skin at >50% of pixels, so median and MAD
both collapse to 0, sigma hits the _SIG_EPS floor, and any nonzero crop q
scores z in the millions — nz>0 covered 0.40-0.67 of the pic1-4 crops. Two
repairs, both to the STATISTICS (the maps are untouched):

1. Quantile-consistent robust sigma: sigma = max(1.4826*MAD, (p95-med)/1.645).
   The two estimators agree on Gaussian data (psd corpus, fw ~650: sigma
   changes <2x and fired area only drops), but the p95 term stays anchored to
   the real tail when the distribution degenerates to a spike-at-zero, which
   MAD cannot see. Measured: pic1-4 fired fraction 0.40-0.67 -> 0.03-0.50.

2. Bounded dark-side extrapolation (_L_SHADOW_MARGIN): the remaining pic2
   firing was ~solid on a near-black garment (local L 11-52 vs anchor range
   [155,192]) where the Weber denominator max(lp,8)*nf bottoms out and a
   1-2 gray-level fabric ripple reads as huge q. The anchor transfer's claim
   is only meaningful on skin-like luminance: pixels with lp more than 70
   gray levels below the darkest anchor score 0. 70 is generous — measured
   GT-region beard shadow sits at most 67 below the anchor low edge (psd03
   deep chin shadow; p05 over dev9), garments 80-140 below. Measured after
   both: pic1-4 fired fraction 0.007-0.068, psd unchanged-to-better.

CODEX #14 ROUND (2026-07-12) — typed abstains + two factorial-confirmed
surgical fixes (controlled-degradation harness: eval/run_reference_factorial):

1. build_reference_bundle returns a typed ReferenceAbstain instead of None.
   rawCapacity < Nmin is classified insufficient_face_resolution: a capture
   problem (shooting gate fw>=320), never a QC-relaxation candidate.
2. Fix (i): the forehead-VERIFY sigma floor on a/b only is 1.5 (L stays 0.5).
   Factorial: bilateral smoothing / JPEG chroma subsampling collapse the
   cheek a/b MAD to 0 on degraded pic3/psd03 and the 0.5 floor rejected
   color-identical foreheads at inlier 0.00. A ~20-L differently-lit
   forehead stays rejected (L floor unchanged; regression-tested).
3. Fix (ii): clipping is two-tier. Channel-only saturation (bright exposure:
   R >= 250 while gray < 250 — factorial clip arm: gain 1.15 saturates 9.2%
   of the frame in one channel vs 1.5% in gray) removes a pixel from the
   COLOR model (lab_pixels/mean/cov) but keeps it in the gray black-hat
   support (anchor_mask_full) the ladder and anchor stats use.
   Nmin and the coherence gate are UNCHANGED this round.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from scipy.ndimage import median_filter

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB))

from engine.detect_face import (  # noqa: E402
    BROW_MID,
    FACE_OVAL,
    FOREHEAD_MID,
    NOSE_BOTTOM,
    UPPER_CHEEKS,
)
from engine.texture import coherence_map  # noqa: E402
from eval.ghost_ruler import LOW_SIGMA_RATIO, blackhat_maps  # noqa: E402

# --- anchor geometry (x face width) -----------------------------------------
_CHEEK_R = 0.045          # primary anchors: the two upper-cheek disks
_FOREHEAD_R = 0.04        # optional rescue anchor between FOREHEAD_MID/BROW_MID

# --- per-patch QC ------------------------------------------------------------
_CLIP_LEVEL = 250         # >= this in gray or any channel = clipping/specular
_COH_MAX = 0.6            # coherence gate at fw <= _COH_FW_LO (see _coh_max_for)
_COH_MAX_HI = 0.75        # coherence gate at fw >= _COH_FW_HI
_COH_FW_LO = 480.0        # measured dev9: clean-cheek coherence medians are
_COH_FW_HI = 640.0        #   0.25-0.33 at fw 273-376 but 0.31-0.59 at fw
                          #   636-697 — coherence_map's FIXED 2px highpass +
                          #   7px window measures an ever-smaller physical
                          #   patch as fw grows, and at sub-pore scale clean
                          #   skin/demosaicing is locally directional. A flat
                          #   0.6 sat BELOW the cheek median on psd02/05 and
                          #   killed ~45% of visibly clean disks (3 of the 4
                          #   dev abstains). The gate therefore ramps with fw.
_MAHA_TRIM_CUT = 3.0      # a patch pixel is an outlier if maha > this
                          #   (chi_3 ~p96 on clean Gaussian-ish grain)
_MAHA_DROP = 0.15         # CAP on the trimmed fraction (was an unconditional
                          #   top-15% cut, which discarded clean pixels on
                          #   every patch and, stacked on the coherence gate,
                          #   made Nmin geometrically unreachable on real
                          #   photos — dev9: psd03 missed Nmin by 6%)
_PATCH_MODEL_MIN = 32     # fewer survivors than this cannot carry a robust fit
_CHEEK_MODEL_MIN = 64     # min pooled cheek px to verify the forehead against
_FOREHEAD_MAHA = 3.0      # forehead px is a skin-inlier if maha <= this
_FOREHEAD_MIN_INLIER = 0.70  # below this the whole forehead patch is bangs/
                          #   shadow and gets discarded, not trimmed
_AB_SIGMA_FLOOR = 1.5     # forehead-VERIFY sigma floor on a/b only (Codex #14
                          #   fix i, factorial-confirmed 2026-07-12): beauty-
                          #   filter smoothing + JPEG chroma subsampling
                          #   collapse the cheek a/b MAD to 0 (measured
                          #   sigma 1.48 -> 0.00 on degraded pic3/psd03),
                          #   and the old 0.5 floor turned the verification
                          #   into a razor (inlier 0.00 on color-identical
                          #   foreheads). 1.5 ~= one uint8 Lab quantization
                          #   step * 1.4826 — the smallest honest spread a
                          #   quantized chroma channel can show. The L floor
                          #   stays 0.5: a REAL lighting-difference forehead
                          #   (IMG_4578, ~20 L offset) must stay rejected —
                          #   guarded by the factorial regression test.

# --- validity ----------------------------------------------------------------
_NMIN_FLOOR = 768.0
_NMIN_RATIO = 0.008       # Nmin = max(768, 0.008 * fw^2)
_PATCH_MIN_SHARE = 0.25   # ladder levels 1-2: each patch >= 25% of the total

# --- normalized-excess transfer ----------------------------------------------
_MAD_SIGMA = 1.4826       # Gaussian-consistent MAD -> sigma factor
_LUMA_SIGMA = 8.0         # local low-pass L (engine/texture.py convention)
_MIN_LUMA = 8.0           # never contrast-normalize by near-black
_NF_WIN = 7               # noise-floor estimation window
_NF_EPS = 0.5             # gray levels; below any real sensor's noise floor,
                          #   so the floor only bites on synthetic flat fields
_SIG_EPS = 1e-6
_Q_HI = 0.95              # upper quantile for the tail-consistent sigma term
_Q_HI_Z = 1.645           # Phi^-1(0.95): (p95-med)/1.645 == sigma on a Gaussian
_L_SHADOW_MARGIN = 70.0   # gray levels BELOW the darkest anchor still judged
                          #   (dev9-measured: beard-shadow skin bottoms out
                          #   <= 67 below the anchor low edge, near-black
                          #   garments sit 80-140 below — see module docstring)
_L_BINS = 4
_BIN_MIN_N = 100          # thinner anchor bins fall back to the global stats
Z_THR = 4.5


# ==============================================================================
# Reference bundle
# ==============================================================================

@dataclass
class ReferenceBundle:
    """Anchor-based clean-skin reference for one photo (FULL-frame coords).

    Two-tier clipping (Codex #14 fix ii, factorial-confirmed): a pixel whose
    gray is honest but with one SATURATED channel (bright exposure: R hits
    >= 250 first on skin) has valid gray-based black-hat texture but invalid
    COLOR. Such pixels stay in anchor_mask_full (the gray/black-hat support
    the ladder and anchor_blackhat_stats use) but are excluded from
    lab_pixels / lab_mean / lab_cov (anchor_mask_color). On photos without
    channel saturation the two masks are identical."""

    anchor_mask_full: np.ndarray   # (H, W) bool, final valid anchor pixels
                                   #   (gray/black-hat support tier)
    lab_pixels: np.ndarray         # (N, 3) float32, OpenCV uint8-range Lab
                                   #   (color tier: channel-sat px excluded)
    lab_mean: np.ndarray           # (3,) float32
    lab_cov: np.ndarray            # (3, 3) float32
    n_valid: int
    patches_used: list[str]        # subset of cheek_left / cheek_right / forehead
    ladder_level: int              # 1 both cheeks (+verified forehead) |
                                   # 2 cheek+forehead | 3 single cheek |
                                   # 4 pooled, share rule waived (low_conf)
    single_anchor: bool
    low_conf: bool = False         # True only at ladder level 4: Nmin is met
                                   #   but the 25% per-patch share rule is not —
                                   #   recorded degradation instead of abstain
    cheek_sigma: tuple[float, float, float] | None = None
                                   # diagnostic: PRE-floor robust sigma
                                   #   (1.4826*MAD, Lab) of the pooled cheek
                                   #   px — beauty-filter smoothing shows up
                                   #   here as a/b collapse toward 0
    anchor_mask_color: np.ndarray | None = None
                                   # color-valid subset of anchor_mask_full
                                   #   (source of lab_pixels); None never
                                   #   happens from the builder


# --- typed abstain reasons (Codex #14 task 1) --------------------------------
# rawCapacity < Nmin is a CAPTURE problem (fw below the shooting gate), not a
# QC problem: even a QC that rejected nothing could not reach Nmin, so these
# photos are classified insufficient_face_resolution and are NOT candidates
# for any QC relaxation.
REASON_RESOLUTION = "insufficient_face_resolution"
REASON_FOREHEAD = "forehead_verify_rejected"   # ladder would pass WITH forehead
REASON_CLIP = "clip_rejected"                  # largest QC loss: clip/specular
REASON_COHERENCE = "coherence_rejected"        # largest QC loss: coherence gate
REASON_MAHA = "maha_rejected"                  # largest QC loss: maha trim/thin
REASON_NMIN = "nmin_not_met"                   # shortfall with no dominant gate
REASON_COLOR_STARVED = "color_model_starved"   # Nmin met on gray support but
                                               #   too few color-valid px to
                                               #   carry the Lab model


@dataclass
class ReferenceAbstain:
    """Typed reference-abstain record: WHY the bundle could not be built.

    Returned by build_reference_bundle instead of a bare None so callers and
    reports can distinguish capture-gate failures (insufficient face
    resolution — retake) from QC-eaten anchors (candidate for surgical QC
    fixes). All counts are FULL-frame anchor-patch pixels."""

    reason: str                     # one of the REASON_* constants
    raw_capacity: int               # pre-QC px over all anchor patches
    nmin: float                     # Nmin the ladder was judged against
    clip_rejected: int              # raw anchor px lost to the clip gate
    coherence_rejected: int         # raw anchor px lost to the coherence gate
    maha_rejected: int              # patch-model px lost to maha trim + thin-patch drops
    forehead_inlier: float | None   # inlier fraction when verification ran
    counts: dict[str, int] = field(default_factory=dict)      # post-QC counts
    raw_counts: dict[str, int] = field(default_factory=dict)  # pre-QC counts
    cheek_sigma: tuple[float, float, float] | None = None
                                    # PRE-floor cheek-pool robust sigma (Lab)

    def as_json(self) -> dict:
        """JSON-safe camelCase dict for report propagation."""
        return {
            "reason": self.reason,
            "rawCapacity": int(self.raw_capacity),
            "nmin": float(self.nmin),
            "clipRejected": int(self.clip_rejected),
            "coherenceRejected": int(self.coherence_rejected),
            "mahaRejected": int(self.maha_rejected),
            "foreheadInlier": (None if self.forehead_inlier is None
                               else round(float(self.forehead_inlier), 3)),
            "counts": {k: int(v) for k, v in self.counts.items()},
            "rawCounts": {k: int(v) for k, v in self.raw_counts.items()},
            "cheekSigma": (None if self.cheek_sigma is None else
                           [round(float(v), 3) for v in self.cheek_sigma]),
        }


def nmin_for(face_width: float) -> float:
    """Minimum valid anchor pixels; scales with the face so a far-away face
    cannot pass on a handful of pixels the way the old complement did."""
    return max(_NMIN_FLOOR, _NMIN_RATIO * face_width * face_width)


def _coh_max_for(face_width: float) -> float:
    """Scale-aware coherence gate: 0.6 at fw <= 480 ramping to 0.75 at
    fw >= 640. coherence_map's scale is fixed in PIXELS (2px highpass, 7px
    window), so what it calls "directional" drifts with resolution; the
    measured clean-cheek medians (see the constants block) drift with it.
    Directional defects the gate exists for — hairline wisps, shadow edges,
    drawn stripes — measure 0.9+ at any fw and stay rejected."""
    t = (face_width - _COH_FW_LO) / (_COH_FW_HI - _COH_FW_LO)
    return _COH_MAX + (_COH_MAX_HI - _COH_MAX) * float(np.clip(t, 0.0, 1.0))


def _disk(shape: tuple[int, int], center: np.ndarray, radius: int) -> np.ndarray:
    m = np.zeros(shape, np.uint8)
    cv2.circle(m, (int(center[0]), int(center[1])), radius, 1, -1)
    return m.astype(bool)


def _robust_model(pixels: np.ndarray,
                  floor: float | np.ndarray = 0.5,
                  ) -> tuple[np.ndarray, np.ndarray]:
    """Per-channel (median, MAD-derived sigma). Sigma floored (default 0.5
    Lab units, below any real skin's spread) so a synthetically flat patch
    cannot turn the Mahalanobis distance into a divide-by-zero oracle.
    `floor` may be per-channel: the forehead verification floors a/b at
    _AB_SIGMA_FLOOR (smoothing/JPEG collapse the chroma MAD to 0 — Codex #14
    fix i) while keeping the L floor at 0.5."""
    med = np.median(pixels, axis=0)
    mad = np.median(np.abs(pixels - med), axis=0)
    return med, np.maximum(_MAD_SIGMA * mad, floor)


def _maha(pixels: np.ndarray, med: np.ndarray, sigma: np.ndarray) -> np.ndarray:
    return np.sqrt((((pixels - med) / sigma) ** 2).sum(axis=1))


def _qc_patch(lab: np.ndarray, usable: np.ndarray,
              patch: np.ndarray) -> np.ndarray:
    """Clip/specular + coherence pre-filter (in `usable`), then fit a robust
    Lab model on the patch itself and drop Mahalanobis OUTLIERS (stray hairs,
    a mole, a glasses rim crossing the disk): maha > 3 (chi_3 ~p96), capped
    at the top 15%. This trims what is actually outlying instead of the old
    unconditional top-15% cut, which threw away clean pixels on every patch
    (measured dev9: stacked on the coherence gate it left psd03 at 94% of
    Nmin — an abstain caused by the trim, not the photo)."""
    m = patch & usable
    n = int(m.sum())
    if n < _PATCH_MODEL_MIN:
        return np.zeros_like(m)
    px = lab[m]
    med, sigma = _robust_model(px)
    d = _maha(px, med, sigma)
    keep_n = int(np.ceil((1.0 - _MAHA_DROP) * n))
    # Cap: never trim more than _MAHA_DROP even under heavy contamination
    # (the ladder/share rules judge what is left, not this cut). Value-based
    # keep => deterministic; ties at the cut are kept.
    d_sorted = np.sort(d, kind="stable")
    cut = max(_MAHA_TRIM_CUT, float(d_sorted[keep_n - 1]))
    keep = d <= cut
    ys, xs = np.nonzero(m)
    out = np.zeros_like(m)
    out[ys[keep], xs[keep]] = True
    return out


def select_patch_ladder(counts: dict[str, int], forehead_ok: bool,
                        nmin: float) -> tuple[int, list[str], bool] | None:
    """Validity ladder over post-QC patch pixel counts.

    (1) both cheeks — recruiting the verified forehead ONLY when the cheeks
    alone fall short of Nmin -> (2) one cheek + verified forehead -> (3) one
    cheek alone meeting Nmin (single_anchor=True) -> (4) all alive patches
    pooled: Nmin met but the 25% share rule is not — accepted as a RECORDED
    low_conf degradation (dev9: 4/9 normal selfies abstained; abstain is for
    occluded/extreme photos, not share imbalance on an otherwise sufficient
    anchor) -> None.

    Level 1 may recruit the forehead because Nmin(0.008*fw^2) is ~66% of
    the two disks' raw capacity (0.0127*fw^2): on small faces the Nmin FLOOR
    (768) can be unreachable from the cheeks alone (dev9 pic1, fw 273:
    cheeks 731 px post-QC under the old trim, forehead 270 px verified at
    inlier 1.00 — pooled it passes, and there was no level that pooled it).
    When the cheeks alone meet Nmin the forehead is NOT added: anchors stay
    on the safest anatomy unless more support is actually needed. The
    forehead still only enters via the cheek-model verification;
    forehead-only remains impossible at every level.

    Levels 1-2 require each patch >= 25% of the pair total, so one dying
    patch cannot hide behind the other (level 1 applies this to the CHEEK
    pair; the recruited forehead only adds pixels). NOTE: with the spec
    radii a lone cheek disk holds ~0.0064*fw^2 px < Nmin = 0.008*fw^2
    (capacity; QC only lowers it), so level 3 is geometrically unreachable
    today — it exists (and is tested directly) for larger anchor
    geometries, not as a live escape hatch.
    """
    nl = int(counts.get("cheek_left", 0))
    nr = int(counts.get("cheek_right", 0))
    nf = int(counts.get("forehead", 0)) if forehead_ok else 0

    if nl > 0 and nr > 0 and min(nl, nr) / (nl + nr) >= _PATCH_MIN_SHARE:
        if nl + nr >= nmin:
            return 1, ["cheek_left", "cheek_right"], False
        if nf > 0 and nl + nr + nf >= nmin:
            return 1, ["cheek_left", "cheek_right", "forehead"], False

    cheeks = sorted((("cheek_left", nl), ("cheek_right", nr)),
                    key=lambda t: -t[1])
    if nf > 0:
        for name, n in cheeks:
            if n <= 0:
                continue
            total = n + nf
            if total >= nmin and min(n, nf) / total >= _PATCH_MIN_SHARE:
                return 2, [name, "forehead"], False

    for name, n in cheeks:
        if n >= nmin:
            return 3, [name], True

    # Degraded pool: every alive patch (forehead only if verified, and only
    # alongside at least one alive cheek — the verification itself needed
    # >= _CHEEK_MODEL_MIN cheek px). Nmin is still HARD; only the share
    # rule is waived, and the bundle is flagged low_conf for it.
    if nl + nr > 0 and nl + nr + nf >= nmin:
        names = [name for name, n in
                 (("cheek_left", nl), ("cheek_right", nr), ("forehead", nf))
                 if n > 0]
        return 4, names, False
    return None


def _classify_abstain(raw_capacity: int, nmin: float, counts: dict[str, int],
                      forehead_qc_n: int, forehead_inlier: float | None,
                      clip_rej: int, coh_rej: int, maha_rej: int) -> str:
    """Final abstain reason, checked in Codex #14 investigation order:

    1. rawCapacity < Nmin — geometry alone forbids the bundle (fw below the
       fw>=320 shooting gate); no QC change can help: insufficient_face_resolution.
    2. The forehead verification failed AND re-running the ladder with the
       forehead's post-QC pixels counted would have passed: the verification
       was the killing gate (forehead_verify_rejected).
    3. Otherwise the largest QC rejection bucket (clip / coherence / maha).
    4. Fallback: nmin_not_met (shortfall without a dominant gate — e.g. the
       oval/nose-line clipping of the disks on an extreme pose).
    """
    if raw_capacity < nmin:
        return REASON_RESOLUTION
    if (forehead_inlier is not None and forehead_inlier < _FOREHEAD_MIN_INLIER
            and forehead_qc_n > 0):
        retry = select_patch_ladder({**counts, "forehead": forehead_qc_n},
                                    True, nmin)
        if retry is not None:
            return REASON_FOREHEAD
    buckets = {REASON_CLIP: clip_rej, REASON_COHERENCE: coh_rej,
               REASON_MAHA: maha_rej}
    top = max(buckets, key=lambda k: buckets[k])
    return top if buckets[top] > 0 else REASON_NMIN


def build_reference_bundle(bgr_full: np.ndarray, landmarks: np.ndarray,
                           face_width: float,
                           ) -> ReferenceBundle | ReferenceAbstain:
    """Anchor extraction + QC + ladder. On failure returns a typed
    ReferenceAbstain (Codex #14 task 1) instead of a bare None — the caller
    must still abstain (there is deliberately no weaker fallback), but the
    record says WHY: rawCapacity < Nmin is a capture problem
    (insufficient_face_resolution), everything else names the gate that ate
    the anchors."""
    h, w = bgr_full.shape[:2]
    gray = cv2.cvtColor(bgr_full, cv2.COLOR_BGR2GRAY)
    lab = cv2.cvtColor(bgr_full, cv2.COLOR_BGR2Lab).astype(np.float32)
    coh = coherence_map(bgr_full)

    oval = np.zeros((h, w), np.uint8)
    cv2.fillPoly(oval, [landmarks[FACE_OVAL].astype(np.int32)], 1)
    oval = oval.astype(bool)

    # Shared pixel-level QC: clipping/specular + directional coherence
    # (scale-aware threshold — see _coh_max_for). Clipping is TWO-TIER
    # (Codex #14 fix ii, factorial clip arm: exposure gain 1.15 saturated
    # 9.2% of the frame in ONE channel vs 1.5% in gray and killed the psd03
    # bundle): gray-saturated px are dead for everything, but channel-only
    # saturation invalidates COLOR while the gray black-hat texture is real.
    gray_clip = gray >= _CLIP_LEVEL
    chan_clip = bgr_full.max(axis=2) >= _CLIP_LEVEL
    coh_bad = coh > _coh_max_for(face_width)
    usable_color = ~gray_clip & ~chan_clip & ~coh_bad   # Lab-model tier
    usable_gray = ~gray_clip & ~coh_bad                 # black-hat support tier

    yy = np.arange(h, dtype=np.float32)[:, None]
    cheek_r = max(2, int(_CHEEK_R * face_width))
    nose_y = float(landmarks[NOSE_BOTTOM][1])
    brow_y = float(landmarks[BROW_MID][1])

    # Anchor disks, clipped to the face-oval interior; cheeks must stay above
    # the nose bottom and the forehead above the brow (the simple stand-ins
    # for "never overlap eyes / nose / silhouette").
    raw = {
        "cheek_left": _disk((h, w), landmarks[UPPER_CHEEKS[0]], cheek_r)
        & oval & (yy < nose_y),
        "cheek_right": _disk((h, w), landmarks[UPPER_CHEEKS[1]], cheek_r)
        & oval & (yy < nose_y),
        "forehead": _disk(
            (h, w), (landmarks[FOREHEAD_MID] + landmarks[BROW_MID]) / 2.0,
            max(2, int(_FOREHEAD_R * face_width))) & oval & (yy < brow_y),
    }
    # Color tier: robust Lab model + maha outlier trim, as before. Channel-
    # only-saturated px (color-invalid, gray-valid) bypass the maha trim —
    # their Lab is untrustworthy by definition, so trimming on it would be
    # circular — and join only the SUPPORT tier.
    qc_color = {name: _qc_patch(lab, usable_color, m) for name, m in raw.items()}
    chan_only = chan_clip & usable_gray
    qc = {name: (qc_color[name] | (m & chan_only)) for name, m in raw.items()}

    # --- abstain accounting (typed reasons; costs nothing on success) -------
    raw_counts = {name: int(m.sum()) for name, m in raw.items()}
    raw_any = raw["cheek_left"] | raw["cheek_right"] | raw["forehead"]
    clip_rej = int((raw_any & gray_clip).sum())     # SUPPORT-tier clip loss
    coh_rej = int((raw_any & ~gray_clip & coh_bad).sum())
    maha_rej = sum(int((m & usable_color).sum()) - int(qc_color[n].sum())
                   for n, m in raw.items())

    # Forehead verification: the forehead is where bangs live, so it is only
    # trusted if it agrees with the CHEEK skin model. No cheek pixels means no
    # verification means no forehead (the ladder has no forehead-only level).
    # Forehead verification runs on the COLOR tier only: channel-saturated
    # px have no trustworthy Lab and can neither carry nor pass the check.
    forehead_ok = False
    forehead_inlier: float | None = None
    cheek_sigma: tuple[float, float, float] | None = None
    forehead_qc_n = int(qc["forehead"].sum())
    cheek_pool = qc_color["cheek_left"] | qc_color["cheek_right"]
    if cheek_pool.any():
        # Diagnostic (Codex #14): PRE-floor robust sigma of the cheek pool —
        # beauty-filter smoothing collapses the a/b MAD toward 0 here, which
        # is what turns the forehead verification into a razor.
        cp = lab[cheek_pool]
        cmed = np.median(cp, axis=0)
        craw = _MAD_SIGMA * np.median(np.abs(cp - cmed), axis=0)
        cheek_sigma = tuple(float(v) for v in craw)
    if int(cheek_pool.sum()) >= _CHEEK_MODEL_MIN and qc_color["forehead"].any():
        # Fix (i): a/b sigma floor 1.5 — quantized/smoothed chroma cannot be
        # judged tighter than one Lab quantization step. L floor stays 0.5 so
        # a genuinely differently-lit forehead is still rejected.
        med, sigma = _robust_model(
            lab[cheek_pool],
            floor=np.array([0.5, _AB_SIGMA_FLOOR, _AB_SIGMA_FLOOR],
                           np.float32))
        d = _maha(lab[qc_color["forehead"]], med, sigma)
        forehead_inlier = float((d <= _FOREHEAD_MAHA).mean())
        forehead_ok = forehead_inlier >= _FOREHEAD_MIN_INLIER
    if not forehead_ok:
        qc["forehead"] = np.zeros((h, w), bool)
        qc_color["forehead"] = np.zeros((h, w), bool)

    counts = {name: int(m.sum()) for name, m in qc.items()}
    nmin = nmin_for(face_width)
    picked = select_patch_ladder(counts, forehead_ok, nmin)
    if picked is None:
        return ReferenceAbstain(
            reason=_classify_abstain(
                sum(raw_counts.values()), nmin, counts, forehead_qc_n,
                forehead_inlier, clip_rej, coh_rej, maha_rej),
            raw_capacity=sum(raw_counts.values()), nmin=nmin,
            clip_rejected=clip_rej, coherence_rejected=coh_rej,
            maha_rejected=maha_rej, forehead_inlier=forehead_inlier,
            counts=counts, raw_counts=raw_counts, cheek_sigma=cheek_sigma)
    level, names, single = picked

    mask = np.zeros((h, w), bool)
    color_mask = np.zeros((h, w), bool)
    for name in names:
        mask |= qc[name]
        color_mask |= qc_color[name]
    if int(color_mask.sum()) < _CHEEK_MODEL_MIN:
        # Nmin met on gray support alone, but almost every pixel is channel-
        # saturated: no honest Lab model can be fit. Abstain rather than
        # serve a color reference made of clipped pixels.
        return ReferenceAbstain(
            reason=REASON_COLOR_STARVED,
            raw_capacity=sum(raw_counts.values()), nmin=nmin,
            clip_rejected=clip_rej, coherence_rejected=coh_rej,
            maha_rejected=maha_rej, forehead_inlier=forehead_inlier,
            counts=counts, raw_counts=raw_counts, cheek_sigma=cheek_sigma)
    px = lab[color_mask]
    return ReferenceBundle(
        anchor_mask_full=mask,
        lab_pixels=px.astype(np.float32),
        lab_mean=px.mean(axis=0).astype(np.float32),
        lab_cov=np.cov(px.T).astype(np.float32),
        n_valid=int(mask.sum()),
        patches_used=names,
        ladder_level=level,
        single_anchor=single,
        low_conf=(level == 4),
        cheek_sigma=cheek_sigma,
        anchor_mask_color=color_mask,
    )


# ==============================================================================
# Normalized black-hat threshold transfer (anchor -> anywhere)
# ==============================================================================

@dataclass
class AnchorScaleStats:
    """Per-black-hat-scale anchor distribution of the normalized excess q."""

    bin_med: np.ndarray       # (4,) effective per-L-bin median (post-fallback)
    bin_sigma: np.ndarray     # (4,) effective robust sigma (post-fallback):
                              #   max(MAD-derived, p95-tail-derived) — _robust_sigma
    bin_n: np.ndarray         # (4,) int anchor samples per bin
    bin_low_conf: np.ndarray  # (4,) bool: bin was too thin, global stats used
    global_med: float
    global_sigma: float


@dataclass
class AnchorBlackhatStats:
    l_edges: np.ndarray                  # (5,) L-bin edges over the anchor range
    scales: dict[str, AnchorScaleStats]  # keyed like eval.ghost_ruler._SCALES
    n_anchor: int

    @property
    def any_low_conf(self) -> bool:
        return any(bool(s.bin_low_conf.any()) for s in self.scales.values())


def _normalized_maps(bgr: np.ndarray,
                     fw: float) -> tuple[dict[str, np.ndarray], np.ndarray]:
    """Contrast- and noise-normalized black-hat maps + the local low-pass L.

    q = (blackhat / max(lowpass L, 8)) / noise_floor. Both normalizations are
    LOCAL, which is what lets the anchor stats (full frame) score a crop with
    a different origin: nothing here depends on absolute position.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    lp = cv2.GaussianBlur(gray, (0, 0), _LUMA_SIGMA)
    hp = gray - cv2.GaussianBlur(gray, (0, 0), max(2.0, fw / LOW_SIGMA_RATIO))
    # Robust local noise floor — see the module docstring for why this is a
    # windowed median (structure-robust) and not the spec'd box RMS.
    nf = _MAD_SIGMA * median_filter(np.abs(hp), size=_NF_WIN)
    nf = np.maximum(nf, _NF_EPS)
    denom = np.maximum(lp, _MIN_LUMA) * nf
    qs = {name: bh / denom for name, bh in blackhat_maps(bgr, fw).items()}
    return qs, lp


def _robust_sigma(vals: np.ndarray, med: float) -> float:
    """max(1.4826*MAD, (p95-med)/1.645, eps). On Gaussian data the first two
    agree; when the distribution is a spike-at-zero (3px black-hat on smooth
    small-fw skin: median = MAD = 0) only the quantile term still measures
    the tail that z_thr must clear — see the module docstring."""
    mad = _MAD_SIGMA * float(np.median(np.abs(vals - med)))
    qhi = (float(np.quantile(vals, _Q_HI)) - med) / _Q_HI_Z
    return max(mad, qhi, _SIG_EPS)


def _bin_index(l_edges: np.ndarray, lp: np.ndarray) -> np.ndarray:
    """L-bin per pixel; values outside the anchor L range clamp to the edge
    bins (a jaw darker than any anchor is still judged, just by the darkest
    anchor bin — abstaining there would blind the ruler exactly where beard
    shadow lives). The dark-side clamp is BOUNDED at _L_SHADOW_MARGIN below
    the anchor range by normalized_excess; beyond that (near-black garment,
    void) the pixel scores 0 instead of being judged."""
    return np.clip(np.searchsorted(l_edges, lp, side="right") - 1, 0, _L_BINS - 1)


def anchor_blackhat_stats(bgr_full: np.ndarray, landmarks: np.ndarray,
                          fw: float, bundle: ReferenceBundle) -> AnchorBlackhatStats:
    """Fit the anchor distribution of the normalized excess q, binned by local
    low-pass L (4 equal-width bins over the anchor L range). Bins with < 100
    anchor samples fall back to the global anchor stats and are flagged
    low-conf. `landmarks` is part of the stable API for parity with the
    builder; the anchor support comes from the bundle."""
    del landmarks  # anchor support is frozen in the bundle
    mask = bundle.anchor_mask_full
    qs, lp = _normalized_maps(bgr_full, fw)
    lv = lp[mask]
    lo, hi = float(lv.min()), float(lv.max())
    if hi - lo < 1e-3:                      # degenerate flat anchors
        lo, hi = lo - 0.5, hi + 0.5
    edges = np.linspace(lo, hi, _L_BINS + 1)
    idx = _bin_index(edges, lv)

    scales: dict[str, AnchorScaleStats] = {}
    for name, q in qs.items():
        vals = q[mask].astype(np.float64)
        gmed = float(np.median(vals))
        gsig = _robust_sigma(vals, gmed)
        med = np.full(_L_BINS, gmed)
        sig = np.full(_L_BINS, gsig)
        n = np.zeros(_L_BINS, np.int64)
        low = np.ones(_L_BINS, bool)
        for b in range(_L_BINS):
            v = vals[idx == b]
            n[b] = v.size
            if v.size >= _BIN_MIN_N:
                m = float(np.median(v))
                med[b] = m
                sig[b] = _robust_sigma(v, m)
                low[b] = False
        scales[name] = AnchorScaleStats(
            bin_med=med, bin_sigma=sig, bin_n=n, bin_low_conf=low,
            global_med=gmed, global_sigma=gsig)
    return AnchorBlackhatStats(l_edges=edges, scales=scales,
                               n_anchor=int(mask.sum()))


def normalized_excess(bgr_any: np.ndarray, fw: float,
                      stats: AnchorBlackhatStats,
                      z_thr: float = Z_THR) -> np.ndarray:
    """Hair-grade darkness vs the ANCHOR distribution, as a float32 map:
    0 below z_thr, (z - z_thr) above, max over black-hat scales.

    `bgr_any` may be a crop with a different origin than the full frame the
    stats came from — every normalization inside is local.

    Dark-side validity bound: pixels whose local low-pass L sits more than
    _L_SHADOW_MARGIN gray levels below the darkest anchor score 0. The
    bottom L-bin clamp still judges everything down to that bound (beard
    shadow lives there), but beyond it the transfer claim is vacuous and the
    Weber denominator max(lp,8)*nf is what gets measured, not hair — on a
    near-black garment a 1-2 gray-level fabric ripple scored z >> z_thr and
    inflated the pic2 crop's fired area to ~0.5 (see module docstring)."""
    qs, lp = _normalized_maps(bgr_any, fw)
    idx = _bin_index(stats.l_edges, lp)
    valid = lp >= float(stats.l_edges[0]) - _L_SHADOW_MARGIN
    out: np.ndarray | None = None
    for name, q in qs.items():
        s = stats.scales[name]
        z = (q - s.bin_med[idx]) / s.bin_sigma[idx]
        e = np.maximum(z - z_thr, 0.0)
        out = e if out is None else np.maximum(out, e)
    out[~valid] = 0.0
    return out.astype(np.float32)


# ==============================================================================
# Grain reference helper (policy: anchors are TRUST-based, not texture-equal)
# ==============================================================================

_RING_IN = 0.03    # x fw: closer pixels share the edit's own halo
_RING_OUT = 0.10   # x fw: farther pixels are different anatomy


def grain_reference_mask(edit_mask: np.ndarray, evidence_low_mask: np.ndarray,
                         crop_shape: tuple[int, int],
                         fw: float) -> np.ndarray:
    """FIRST-priority grain reference: the local ring 0.03-0.10*fw OUTSIDE the
    edit, minus evidence pixels. Geometry only — cheek anchors are trusted for
    COLOR/darkness, but their pore texture is not the jaw's, so texture rulers
    must prefer this local ring and only the CALLER may fall back to anchors
    (and flag it) when the ring is starved."""
    if edit_mask.shape != crop_shape or evidence_low_mask.shape != crop_shape:
        raise ValueError("masks must match crop_shape")
    if not edit_mask.any():
        return np.zeros(crop_shape, bool)
    dist = cv2.distanceTransform((~edit_mask).astype(np.uint8), cv2.DIST_L2, 3)
    ring = (dist >= _RING_IN * fw) & (dist <= _RING_OUT * fw)
    return ring & ~evidence_low_mask
