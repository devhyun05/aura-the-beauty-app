"""Spike v2: GUARDED zone-wide two-band reconstruction.

Checkpoint-② verdict: replacement beat the current pipeline blind (4/4) but
was rejected for service -- the low-band stain survived 87-110% (probe) and
the keyed donor patches read as "rubbed with a dirty eraser". Cross-validated
redesign (conditional GO, 2026-07-11):

  zone-wide TARGET estimation + evidence/confidence-weighted correction.
  NOT zone-wide unconditional replacement.

Explicit NO-GOs honored here:
  - no uncapped fallback-S applied zone-wide: the target S carries a
    confidence field (annular support, multi-scale normalized convolution,
    pseudo-hole validation) and low-confidence photos ABSTAIN;
  - CLIPSeg is not used to saturate any weight (the GT zone is the oracle);
  - the v1 random-rotation quilt is replaced (same-y-band donors, no
    rotations, deterministic lowest-cost choice) before being used wider.

Anatomy guard: the low-band lift is gated by HAIR EVIDENCE (soft black-hat
density), not by S alone -- a hairless mentolabial fold gets no lift even
where S disagrees -- plus a landmark fold band where lift is halved and the
structure_preservation ruler must stay high.

Variants: A = current medium | B = v1 keyed replacement | C = v2 guarded
reconstruction. Blinded X/Y/Z panels; mapping sealed until the human verdict.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.beard_segmentation import fit_skin_model  # noqa: E402
from engine.detect_face import CHIN_TIP, LIPS_OUTER, NOSE_BOTTOM  # noqa: E402
from engine.lower_face_roi import skin_reference_pixels  # noqa: E402
from eval.ghost_ruler import (  # noqa: E402
    Candidate, LOW_SIGMA_RATIO, excess_map, low_lab, score_low_band,
    score_result, structure_preservation,
)
from eval.measure_ghost import (  # noqa: E402
    build_broad_key, build_soft_high_weight, prepare_photo, run_stages,
)
from eval.run_owndomain_eval import discover_pairs  # noqa: E402
from spike.oracle_replacement import (  # noqa: E402
    controls_for, quilt_high_field, robust_chroma_ref,
)

LAB = Path(__file__).resolve().parents[1]
OUT = LAB / "outputs" / "ghost" / "zone_recon"

_NC_SIGMAS = (0.04, 0.08, 0.16)   # x fw, small-to-large progressive fill
# Abstain when S's own uncertainty is comparable to the correction it
# prescribes: holeErrQ90 > max(floor, ratio * needed-lift-Q90). A fixed 6L cut
# was measured to reject psd03 for honest jaw-silhouette shading texture
# (~7L median self-prediction error, ring hair contamination 1.3%) while the
# prescribed lift there is 60L -- uncertainty 4x smaller than the signal.
_HOLE_ERR_FLOOR = 5.0
# Q90(hole error) vs Q90(needed lift) compares tail against tail; requiring
# the uncertainty tail to stay under half the need tail double-counts and
# abstained psd05 whose S-driven lift was ~11L against ~7.8L Q90 error while
# the MEDIAN error was far lower. Abstain is for S quality; output quality
# failures are the gates' job.
_HOLE_ERR_NEED_RATIO = 1.0
_WINSOR_Q = 98.0                  # per-photo cap quantile for the lift D
_FOLD_BAND_CAP = 0.5              # max w_low inside the mentolabial band


# --------------------------------------------------------------------------
# donor high-band field, v2

def quilt_high_field_v2(bgr: np.ndarray, clean: np.ndarray, fw: float,
                        forbid: np.ndarray | None = None,
                        target_low_l: np.ndarray | None = None,
                        rehipass: bool = False,
                        ) -> tuple[np.ndarray | None, dict]:
    """Deterministic donor micro-texture field.

    v1's 32px random-rotation quilt read as 'scales/stamps' in the panels.
    v2: patch size scales with the face, donors come from the SAME horizontal
    band (skin texture varies vertically: cheek vs chin), no rotations, and
    each cell takes the donor minimizing |low-band L difference| -- shading-
    matched, deterministic, index tie-broken.

    target_low_l (hybrid v3, Codex #8): over a LaMa fill, matching donors to
    the ORIGINAL low band is wrong -- the original low still holds the beard
    stain, so dark donors win and re-create chin mottle / dark stamps. Pass
    the low-band L of the FILLED image so cells match the brightness the fill
    will actually have. Donor brightness (dband) still comes from the original
    -- donors live on untouched clean skin. rehipass strips any low-frequency
    the overlap-averaged quilt synthesized, so the field stays strictly high
    band.
    """
    img = bgr.astype(np.float32)
    low = cv2.GaussianBlur(img, (0, 0), sigmaX=max(2.0, fw / LOW_SIGMA_RATIO))
    high = img - low
    l_low = cv2.cvtColor(np.clip(low, 0, 255).astype(np.uint8),
                         cv2.COLOR_BGR2GRAY).astype(np.float32)

    patch = max(16, int(0.045 * fw)) & ~1
    half = patch // 2
    # Donor hygiene: 'clean' still hosts stray hairs outside the GT+dilation
    # margin (under-jaw fringe), and the L-matching below actively PREFERS
    # dark donors for dark cells -- which is exactly where those hairs live.
    # Measured on psd03: fully-replaced candidates still scored ghost r~1.0
    # because the donor stamped hairs back. Any black-hat-excess pixel poisons
    # its whole patch.
    donor_ok = clean
    if forbid is not None:
        donor_ok = clean & ~(cv2.dilate(forbid.astype(np.uint8),
                                        np.ones((5, 5), np.uint8)) > 0)
    er = cv2.erode(donor_ok.astype(np.uint8), np.ones((patch, patch), np.uint8))
    dys, dxs = np.nonzero(er)
    if len(dys) == 0:
        return None, {"nDonors": 0}
    stride_d = max(4, patch // 2)
    keep = (dys % stride_d == 0) & (dxs % stride_d == 0)
    dcy, dcx = dys[keep], dxs[keep]
    if len(dcy) == 0:
        dcy, dcx = dys[:1], dxs[:1]
    dband = l_low[dcy, dcx]

    h, w = clean.shape
    tgt_low = l_low if target_low_l is None else target_low_l.astype(np.float32)
    win = np.hanning(patch)[:, None] * np.hanning(patch)[None, :]
    acc = np.zeros((h, w, 3), np.float32)
    wacc = np.zeros((h, w), np.float32)
    dy_used = []
    step = half
    for pass_off in (0, step // 2):
        for cy in range(pass_off, h, step):
            for cx in range(pass_off, w, step):
                y_pen = np.abs(dcy - cy).astype(np.float32)
                y_pen = np.where(y_pen <= 0.15 * fw, 0.0, y_pen / fw * 40.0)
                cost = np.abs(dband - tgt_low[min(cy, h - 1), min(cx, w - 1)]) + y_pen
                j = int(np.argmin(cost))    # deterministic: first minimum
                sy, sx = int(dcy[j]) - half, int(dcx[j]) - half
                p = high[sy:sy + patch, sx:sx + patch]
                y0, x0 = cy - half, cx - half
                ty0, tx0 = max(y0, 0), max(x0, 0)
                ty1, tx1 = min(y0 + patch, h), min(x0 + patch, w)
                if ty1 <= ty0 or tx1 <= tx0:
                    continue
                pw = win[ty0 - y0:ty1 - y0, tx0 - x0:tx1 - x0]
                acc[ty0:ty1, tx0:tx1] += (p[ty0 - y0:ty1 - y0, tx0 - x0:tx1 - x0]
                                          * pw[..., None])
                wacc[ty0:ty1, tx0:tx1] += pw
                dy_used.append(abs(int(dcy[j]) - cy))
    field = acc / np.maximum(wacc[..., None], 1e-6)
    field[wacc < 1e-4] = 0.0
    if rehipass:
        field -= cv2.GaussianBlur(field, (0, 0),
                                  sigmaX=max(2.0, fw / LOW_SIGMA_RATIO))
        field[wacc < 1e-4] = 0.0
    # Overlap-averaging independent patches shrinks the variance (the re-grain
    # "energy shortfall" lesson): rescale so the field's RMS on clean skin
    # matches the person's real micro-texture RMS, or the replaced area reads
    # as wax.
    rms_field = float(np.sqrt(np.mean(field[clean] ** 2)))
    rms_clean = float(np.sqrt(np.mean(high[clean] ** 2)))
    # Gain capped at 1.3: a 1.7x boost re-darkened donor pores enough to
    # re-trip the ghost ruler on the blurry photo (measured pic4 0.67 -> 1.0).
    gain = min(1.3, rms_clean / max(rms_field, 1e-3))
    field *= gain
    info = {"nDonors": int(len(dcy)), "patch": patch,
            "donorDyMean": float(np.mean(dy_used)) if dy_used else None,
            "holeFrac": float((wacc < 1e-4).mean()), "rmsGain": gain}
    return field.astype(np.float32), info


# --------------------------------------------------------------------------
# reconstruction target S with confidence

def _fit_quadratic(vals: np.ndarray, ys: np.ndarray, xs: np.ndarray,
                   shape: tuple[int, int], fw: float) -> np.ndarray:
    h, w = shape
    cy, cx = h / 2, w / 2
    u, v = (xs - cx) / fw, (ys - cy) / fw
    A = np.stack([np.ones_like(u), u, v, u * u, u * v, v * v], 1)
    t = vals.astype(np.float64)
    wgt = np.ones(len(t))
    beta = None
    for _ in range(5):
        AW = A * wgt[:, None]
        beta = np.linalg.solve(AW.T @ A + np.eye(6) * 1e-3, AW.T @ t)
        res = t - A @ beta
        s = max(np.median(np.abs(res)) * 1.4826, 1e-3)
        wgt = np.minimum(1.0, 1.345 / np.maximum(np.abs(res) / s, 1e-6))
    gy, gx = np.mgrid[0:h, 0:w]
    U, V = (gx - cx) / fw, (gy - cy) / fw
    return (beta[0] + beta[1] * U + beta[2] * V + beta[3] * U * U
            + beta[4] * U * V + beta[5] * V * V).astype(np.float32)


def _nc_progressive(resid: np.ndarray, support: np.ndarray, fw: float,
                    ) -> tuple[np.ndarray, np.ndarray]:
    """Multi-scale normalized convolution, small sigma wins where supported.

    Progressive confidence blending removes the hard first-valid-sigma
    boundaries of v1: R = sum_i w'_i v_i with w_i = den/(den+eps),
    w'_i = w_i * prod_{j<i}(1 - w_j). Returns (residual, confidence in 0..1).
    """
    m = support.astype(np.float32)
    out = np.zeros_like(resid, np.float32)
    remaining = np.ones_like(resid, np.float32)
    for ratio in _NC_SIGMAS:
        sig = max(2.0, ratio * fw)
        num = cv2.GaussianBlur(resid * m, (0, 0), sig)
        den = cv2.GaussianBlur(m, (0, 0), sig)
        v = num / np.maximum(den, 1e-6)
        wgt = den / (den + 0.02)
        out += remaining * wgt * v
        remaining *= (1.0 - wgt)
    return out, 1.0 - remaining


def shading_field_v2(lab_low: np.ndarray, clean: np.ndarray, zone: np.ndarray,
                     fw: float) -> tuple[np.ndarray | None, np.ndarray | None, dict]:
    """Counterfactual skin field S (L,a,b) + confidence + validation info.

    Support is an explicit ANNULUS around the zone (v1 silently used all
    clean pixels). Pseudo-hole validation: rebuild with grid holes punched in
    the support and measure the error at the holes -- if S cannot predict
    skin it HAS seen, it cannot be trusted where it hasn't (abstain upstream).
    """
    rk = max(3, int(0.25 * fw) | 1)
    ring = ((cv2.dilate(zone.astype(np.uint8),
                        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (rk, rk))) > 0)
            & ~zone & clean)
    # Directional support (v2.1): the ring segment BELOW the zone's inferior
    # contour sits in the jaw/neck shadow and dragged S dark at the chin (the
    # pic2 "턱 안 지워짐" root cause) -- excluded from BOTH the quadratic fit
    # and the NC residual. Upper and same-row lateral support carry the
    # illumination.
    bottom, bvalid = inferior_contour(zone, fw)
    yy_r = np.arange(zone.shape[0], dtype=np.float32)[:, None]
    below = (yy_r > (bottom[None, :] + 2.0)) & bvalid[None, :]
    info: dict = {"ringPx": int(ring.sum()),
                  "ringBelowExcluded": int((ring & below).sum())}
    ring = ring & ~below
    if ring.sum() < 800:
        info["gate"] = "insufficient ring"
        return None, None, info

    ys, xs = np.nonzero(ring)
    S = np.empty_like(lab_low)
    conf = None
    for ch in range(3):
        P = _fit_quadratic(lab_low[..., ch][ys, xs], ys.astype(np.float64),
                           xs.astype(np.float64), lab_low.shape[:2], fw)
        resid, c = _nc_progressive((lab_low[..., ch] - P) * ring, ring, fw)
        S[..., ch] = P + resid
        if ch == 0:
            conf = c

    # pseudo-hole validation on the L channel
    hole_r = max(3, int(0.03 * fw))
    holes = np.zeros(ring.shape, bool)
    # a fragmented ring (dense beard, below-sector excluded) can miss every
    # grid point -- densify rather than abstain for a measurement gap
    for hole_step in (max(hole_r * 4, int(0.12 * fw)),
                      max(hole_r * 2, int(0.05 * fw))):
        holes_u8 = np.zeros(ring.shape, np.uint8)
        for hy in range(hole_step // 2, ring.shape[0], hole_step):
            for hx in range(hole_step // 2, ring.shape[1], hole_step):
                if ring[hy, hx]:
                    cv2.circle(holes_u8, (hx, hy), hole_r, 1, -1)
        holes = (holes_u8 > 0) & ring
        if holes.sum() >= 64:
            break
    info["holePx"] = int(holes.sum())
    if holes.sum() >= 64:
        sup2 = ring & ~holes
        ys2, xs2 = np.nonzero(sup2)
        P2 = _fit_quadratic(lab_low[..., 0][ys2, xs2], ys2.astype(np.float64),
                            xs2.astype(np.float64), lab_low.shape[:2], fw)
        r2, _ = _nc_progressive((lab_low[..., 0] - P2) * sup2, sup2, fw)
        err = np.abs((P2 + r2) - lab_low[..., 0])[holes]
        info["holeErrQ90L"] = float(np.percentile(err, 90))
    else:
        info["holeErrQ90L"] = None
    info["confP10zone"] = float(np.percentile(conf[zone], 10)) if zone.any() else 0.0
    info["gate"] = "ok"
    return S, conf, info


def fold_band(crop, fw: float) -> np.ndarray:
    """Landmark band over the mentolabial fold (crop coords)."""
    lips = crop.landmarks[LIPS_OUTER]
    lip_y = float(lips[:, 1].max())
    chin_y = float(crop.landmarks[CHIN_TIP][1])
    cx = float(lips[:, 0].mean())
    d = max(chin_y - lip_y, 1.0)
    band = np.zeros(crop.bgr.shape[:2], bool)
    y0, y1 = int(lip_y + 0.10 * d), int(lip_y + 0.45 * d)
    x0, x1 = int(cx - 0.22 * fw), int(cx + 0.22 * fw)
    band[max(y0, 0):min(y1, band.shape[0]),
         max(x0, 0):min(x1, band.shape[1])] = True
    return band & (crop.roi_mask > 0.5)


def anatomy_cap(crop, fw: float) -> np.ndarray:
    """Per-pixel cap on the low-band lift: mentolabial fold insurance only.

    v2.1: the protect-distance ramp is GONE from here -- it zeroed the whole
    low-band prescription at the lips and the dark ring it left was
    checkpoint-3's top complaint (39-50% of residual stain mass). Lip
    adjacency is now handled by the separated lift in compose_v2 (hair-scale
    component passes, broad component ramps in over 0.04 fw of LIP-only
    distance). The fold keeps a mild cap; the envelope target carries the
    rest of the anatomy.
    """
    h, w = crop.bgr.shape[:2]
    cap = np.ones((h, w), np.float32)
    cap[fold_band(crop, fw)] = 0.85
    return cap


def smoothstep(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def lip_distance(crop, fw: float) -> np.ndarray:
    """Distance (px) from the LIP protect component only (not nostrils)."""
    lips_top = float(crop.landmarks[LIPS_OUTER][:, 1].min())
    yy = np.arange(crop.bgr.shape[0])[:, None]
    lip = (crop.protect_mask > 0.5) & (yy >= lips_top - 2)
    return cv2.distanceTransform((~lip).astype(np.uint8), cv2.DIST_L2, 3)


def inferior_contour(zone: np.ndarray, fw: float) -> np.ndarray:
    """Smoothed per-column bottom row of the zone, extended to all columns.

    A global horizontal cut at zone.max(y) would just draw a NEW horizontal
    finish line (cross-validated objection); the taper and the S-support
    exclusion both follow the actual jaw-shaped contour instead.
    """
    h, w = zone.shape
    zc = cv2.morphologyEx(zone.astype(np.uint8), cv2.MORPH_CLOSE,
                          np.ones((5, 5), np.uint8)) > 0
    cols = np.where(zc.any(0))[0]
    bottom = np.full(w, np.nan, np.float32)
    ys = np.arange(h)
    for x in cols:
        bottom[x] = ys[zc[:, x]].max()
    # extend to gap columns with nearest defined value, then smooth
    idx = np.where(~np.isnan(bottom))[0]
    bottom = np.interp(np.arange(w), idx, bottom[idx])
    k = max(3, int(0.05 * fw) | 1)
    bottom = cv2.GaussianBlur(bottom.reshape(1, -1), (k, 1), 0).ravel()
    # validity: the contour means nothing outside the zone's own column range
    # (edge extrapolation classified the LATERAL cheek ring as "below" and cut
    # 67% of pic2's support -> abstain, measured)
    valid = np.zeros(w, bool)
    m = int(0.02 * fw)
    valid[max(int(cols.min()) - m, 0):min(int(cols.max()) + m + 1, w)] = True
    return bottom, valid


def nose_band_weight(crop, fw: float) -> np.ndarray:
    """1.0 inside the nose-shadow band under the nostrils, fading to 0 below.

    Inside this band the lift keeps only its hair-scale component (broad
    shadow-flattening removed): the envelope window (0.05 fw) is wider than
    the nose shadow, so E reaches bright cheek skin and would flatten the
    shadow -- with the nostril protect disks left dark inside, that rendered
    as hard-edged blobs under the nose (visual gate). A flat cap instead
    traded the mustache stain away (0.19 -> 0.41 measured); scale separation
    keeps both.
    """
    h, w = crop.bgr.shape[:2]
    y_nose = float(crop.landmarks[NOSE_BOTTOM][1])
    cx = float(crop.landmarks[LIPS_OUTER][:, 0].mean())
    yy = np.arange(h, dtype=np.float32)[:, None]
    fade = 1.0 - np.clip((yy - y_nose) / max(4.0, 0.06 * fw), 0.0, 1.0)
    cols = np.zeros((1, w), np.float32)
    x0, x1 = max(int(cx - 0.14 * fw), 0), min(int(cx + 0.14 * fw), w)
    cols[0, x0:x1] = 1.0
    return (fade * cols).astype(np.float32)


# --------------------------------------------------------------------------
# guarded composition

def compose_v2(ctx: dict, w_high: np.ndarray) -> tuple[np.ndarray | None, dict]:
    crop = ctx["crop"]
    fw = crop.face_width
    zone_ext = ctx["zone"] | ctx["cand_zone"]

    img = crop.bgr.astype(np.float32)
    low = cv2.GaussianBlur(img, (0, 0), sigmaX=max(2.0, fw / LOW_SIGMA_RATIO))
    high = img - low
    lab_low = cv2.cvtColor(np.clip(low, 0, 255) / 255.0, cv2.COLOR_BGR2Lab)
    lab_low[..., 0] *= 2.55
    lab_low[..., 1:] += 128.0

    S, conf, sinfo = shading_field_v2(lab_low, ctx["clean"], zone_ext, fw)
    diag: dict = {"s": sinfo}
    if S is None or sinfo["holeErrQ90L"] is None:
        diag["abstain"] = True
        return None, diag

    # The L target is min(S, between-hairs envelope). S is ring-fitted and
    # blind to interior anatomy (nose shadow, philtrum) -- lifting to S alone
    # airbrushed them (visual gate). The envelope E = smoothed local max of
    # the ORIGINAL low band follows anatomy by construction: inside the nose
    # shadow the brightest between-hairs skin is still shadow-dark. The user
    # verdict that defined "erased" is exactly this: the eye reads skin color
    # as the bright skin BETWEEN hairs (checkpoint-2.5 probe).
    k_env = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (max(3, int(0.05 * fw) | 1),) * 2)
    # Lip/nostril brightness must not leak into the envelope through the
    # max-dilation (a pink-lip-bright target just above the lip line IS the
    # pale halo): zero the protect region before dilating -- zeros never win
    # a max.
    l_masked = lab_low[..., 0] * (crop.protect_mask < 0.5)
    E = cv2.GaussianBlur(cv2.dilate(l_masked, k_env), (0, 0),
                         max(2.0, 0.02 * fw))
    # The envelope only means something where the window actually contains
    # visible skin between hairs. In a dense core (or a blur-smeared photo)
    # E is just the brightest HAIR, and min(S,E) freezes the stain in place:
    # there the ring-fitted S is the right target -- erased dense beard should
    # look like the surrounding skin. Blend by hair coverage.
    hairfrac = cv2.GaussianBlur((w_high > 0.3).astype(np.float32), (0, 0),
                                0.04 * fw)
    lam = np.clip(1.5 * (1.0 - hairfrac), 0.0, 1.0)
    t_l = np.minimum(S[..., 0], lam * E + (1.0 - lam) * S[..., 0])

    d_pre = np.maximum(t_l - lab_low[..., 0], 0.0)
    stain_pre = zone_ext & (d_pre > 2.0)
    need_q90 = float(np.percentile(d_pre[stain_pre], 90)) \
        if stain_pre.sum() >= 64 else 0.0
    diag["needQ90L"] = need_q90
    # S's ring-prediction uncertainty only matters where S actually DECIDES
    # the target; where the envelope is the binding bound the target is
    # measured from the photo itself and carries no ring uncertainty.
    s_limited = stain_pre & ((S[..., 0] < E - 0.5) | (lam < 0.7))
    diag["sLimitedFrac"] = float(s_limited.sum() / max(stain_pre.sum(), 1))
    if s_limited.sum() >= 64:
        need_s = float(np.percentile(d_pre[s_limited], 90))
        if sinfo["holeErrQ90L"] > max(_HOLE_ERR_FLOOR,
                                      _HOLE_ERR_NEED_RATIO * need_s) \
                and diag["sLimitedFrac"] > 0.2:
            diag["abstain"] = True
            return None, diag
    diag["abstain"] = False

    # Mahalanobis-cap S's chroma against the clean distribution (a wrong S must
    # not drag color outside the person's own skin manifold).
    skin = fit_skin_model(skin_reference_pixels(ctx["bgr"], ctx["det"].landmarks, fw))
    ab = lab_low[..., 1:][ctx["clean"]]
    if len(ab) > 500:
        cov = np.cov(ab.T) + np.eye(2) * 0.5
        icov = np.linalg.inv(cov)
        d = S[..., 1:] - skin.mean[1:]
        m2 = np.einsum("...i,ij,...j->...", d, icov, d)
        scale = np.minimum(1.0, 3.0 / np.maximum(np.sqrt(m2), 1e-6))[..., None]
        S = S.copy()
        S[..., 1:] = skin.mean[1:] + d * scale

    # Hair evidence drives the lift; S alone never does (fold guard #1).
    # Normalization is by the MEDIAN density inside the stain (not the zone
    # q95): the diffuse stain lives BETWEEN hair cores, and q95-normalizing
    # diluted the lift to w~0.4 there (measured stainResidual 0.76-0.87 =
    # the v1 triple-dilution failure repeating). sqrt lifts the valleys;
    # the fold band cap + structure ruler + only-lighten guard the risk.
    # Guard composition is MIN-of-caps, not a product: multiplying four
    # mostly-one-but-0.7-somewhere factors delivered 19% of the intended lift
    # (measured; the third recurrence of the dilution failure). The envelope
    # target already carries anatomy, so:
    #   - no evidence factor (T is self-limiting on clean skin, D ~ 0);
    #   - S confidence applies only where S actually binds the target;
    #   - anatomy caps shrink to insurance: mild fold cap + lip adjacency;
    #   - the seam ramp is the only shape factor, and it is narrow.
    dt = cv2.distanceTransform(zone_ext.astype(np.uint8), cv2.DIST_L2, 3)
    ramp = np.clip(dt / 4.0, 0.0, 1.0)

    band = fold_band(crop, fw)
    w_conf = np.where(S[..., 0] < E - 0.5, conf, 1.0).astype(np.float32)
    guard = np.minimum(w_conf, anatomy_cap(crop, fw))

    # Base weight: NO protect-distance ramp here anymore (v2.1) -- lip
    # adjacency is handled by the separated lift below, so the base only
    # carries the seam ramp, S-confidence, the fold cap and hard protects.
    w_base = (ramp * guard
              * (crop.roi_mask > 0.5) * (1 - crop.protect_mask))
    w_base = np.clip(w_base, 0.0, 1.0)

    # Nose band: NO low-band edit at all. Every softer treatment (flat cap,
    # scale-separated lift) still rendered blobs or a hard seam against the
    # nostril protect disks (visual gates); hairs there are handled by the
    # high-band donor, and residual shadow under the nose reads natural.
    nose_w = nose_band_weight(crop, fw)
    w_base = w_base * (1.0 - nose_w)

    bottom, _ = inferior_contour(zone_ext, fw)

    D = np.maximum(t_l - lab_low[..., 0], 0.0)
    stain = zone_ext & (D > 2.0)
    if stain.sum() >= 64:
        dcap = float(np.percentile(D[stain], _WINSOR_Q))
        D = np.minimum(D, dcap)
        diag["winsorCapL"] = dcap

    # Separated lift (v2.1): the hair-scale component D_hp passes EVERYWHERE;
    # the broad component ramps out near the lips (0.04 fw of LIP-only
    # distance) and toward the jaw-shaped inferior contour (last 0.05 fw).
    # One rule for both complaints: the previous hard ramps zeroed BOTH
    # components and left the dark lip ring (checkpoint-3 top complaint) /
    # killed pic2's chin stain (taper regression, measured resid 0.88);
    # full broad lift to the boundary put clean skin hard against the jaw
    # shadow ("턱 끝 마감 이상"). D_eff <= D by construction.
    d_lip = lip_distance(crop, fw)
    alpha_lip = smoothstep(d_lip / max(6.0, 0.04 * fw))
    yy_c = np.arange(zone_ext.shape[0], dtype=np.float32)[:, None]
    alpha_chin = smoothstep((bottom[None, :] - yy_c) / max(6.0, 0.05 * fw))
    alpha = alpha_lip * alpha_chin
    d_hp = np.clip(D - cv2.GaussianBlur(D, (0, 0), 0.05 * fw), 0.0, D)
    d_eff = d_hp + alpha * (D - d_hp)

    # The final image is judged (by ruler AND eye) after re-low-passing, and
    # a mustache-band lift is NARROWER than the low-pass kernel: adding w*D
    # pointwise delivered only ~1/3 of it after the re-blur spread it out
    # (measured). Van-Cittert deconvolution makes blur(lift) ~ target land;
    # only-lighten and a 2x cap bound the ringing (3x re-tripped the ghost
    # ruler around hair cores, measured psd03 0.0 -> 0.53).
    target_lift = w_base * d_eff
    sig = max(2.0, fw / LOW_SIGMA_RATIO)
    lift = target_lift.copy()
    for _ in range(3):
        lift = lift + (target_lift - cv2.GaussianBlur(lift, (0, 0), sig))
        lift = np.clip(lift, 0.0, None) * (w_base > 1e-4)
    lift = np.minimum(lift, 2.0 * target_lift + 2.0)
    l_out = lab_low[..., 0] + lift                          # only lighten

    # Chroma moves on its own weight (v2.1): full-D logic does not apply to
    # ab, and near the lips the color shift ramps with alpha so lip-adjacent
    # tone is preserved.
    w_ab = w_base * alpha
    lab2 = lab_low.copy()
    lab2[..., 0] = l_out
    lab2[..., 1:] += (S[..., 1:] - lab_low[..., 1:]) * w_ab[..., None]
    lab2[..., 0] /= 2.55
    lab2[..., 1:] -= 128.0
    low_out = cv2.cvtColor(lab2, cv2.COLOR_Lab2BGR) * 255.0

    w_low = np.maximum(w_base * (d_eff / np.maximum(D, 1e-6)), w_ab)

    hair_excess = excess_map(ctx["maps"], ctx["thr"]) > 0
    donor, qinfo = quilt_high_field_v2(crop.bgr, ctx["clean"], fw,
                                       forbid=hair_excess)
    diag["quilt"] = qinfo
    if donor is None:
        diag["abstain"] = True
        return None, diag
    high_out = high * (1 - w_high[..., None]) + donor * w_high[..., None]

    # The ramps live INSIDE the weights (edited == img where all are 0), so
    # the composite scope is a binary support mask -- weighting twice
    # (scope * w) squared the lift down to w^2*D, the v0 triple-dilution
    # failure repeating (measured stainResidual 0.84 at wLowMean 0.66).
    scope = (((lift > 0.01) | (w_ab > 1e-4) | (w_high > 1e-4))
             .astype(np.float32))[..., None]
    edited = low_out + high_out
    result = np.clip(img * (1 - scope) + edited * scope, 0, 255).astype(np.uint8)

    # Prescription audit (v2.1, DIAGNOSTIC only, cross-validated design): the
    # stain ruler is blind where the target itself is dark (pic2 chin). A =
    # how far the original sits below the same-row lateral clean envelope;
    # valid only where left/right references agree.
    lat = np.full(zone_ext.shape[0], np.nan, np.float32)
    l_low = lab_low[..., 0]
    for y in range(0, zone_ext.shape[0], 2):
        row_z = np.where(zone_ext[y])[0]
        if len(row_z) == 0:
            continue
        lref = l_low[y][ctx["clean"][y] & (np.arange(zone_ext.shape[1]) < row_z.min())]
        rref = l_low[y][ctx["clean"][y] & (np.arange(zone_ext.shape[1]) > row_z.max())]
        if len(lref) >= 8 and len(rref) >= 8:
            lm, rm = float(np.median(lref)), float(np.median(rref))
            if abs(lm - rm) < 6.0:
                lat[y] = (lm + rm) / 2.0
    valid_rows = ~np.isnan(lat)
    if valid_rows.sum() >= 8:
        latf = np.where(valid_rows, lat, 0.0)[:, None]
        A = np.maximum(latf - l_low - 3.0, 0.0) * zone_ext \
            * valid_rows[:, None] * (nose_w < 0.3)
        a_sum = float(A.sum())
        if a_sum > 1e-3:
            diag["prescriptionCoverageEnergy"] = float(A[D > 2.0].sum() / a_sum)
            diag["targetSuspiciousDarkEnergy"] = float(A[D <= 2.0].sum() / a_sum)

    diag["S_L"] = t_l
    diag["S_ab"] = S[..., 1:]
    diag["origLowL"] = lab_low[..., 0]
    diag["stain"] = stain
    diag["zoneExt"] = zone_ext
    diag["band"] = band
    diag["lipDist"] = d_lip
    diag["bottomContour"] = bottom
    diag["wLowMeanStain"] = float(w_low[stain].mean()) if stain.any() else None
    return result, diag


def compose_v1_b(ctx: dict) -> np.ndarray:
    """v1 variant B (checkpoint-② best), rebuilt for side-by-side panels."""
    crop = ctx["crop"]
    fw = crop.face_width
    key = build_broad_key(ctx)
    allowed = ((crop.roi_mask > 0.5) & (crop.protect_mask < 0.5)
               & (cv2.dilate(ctx["zone"].astype(np.uint8),
                             np.ones((7, 7), np.uint8)) > 0))
    key_f = cv2.GaussianBlur(cv2.dilate(key.astype(np.float32),
                                        np.ones((3, 3), np.float32)), (0, 0), 1.0)
    key_f = np.clip(key_f, 0, 1) * allowed
    img = crop.bgr.astype(np.float32)
    low = cv2.GaussianBlur(img, (0, 0), sigmaX=max(2.0, fw / LOW_SIGMA_RATIO))
    high = img - low
    donor, _ = quilt_high_field(crop.bgr, ctx["clean"], fw), None
    lab_low = cv2.cvtColor(np.clip(low, 0, 255) / 255.0, cv2.COLOR_BGR2Lab)
    lab_low[..., 0] *= 2.55
    lab_low[..., 1:] += 128.0
    skin = fit_skin_model(skin_reference_pixels(ctx["bgr"], ctx["det"].landmarks, fw))
    ref_ab = robust_chroma_ref(lab_low, ctx["clean"], fw, skin.mean[1:])
    wz = cv2.GaussianBlur(ctx["zone"].astype(np.float32), (0, 0), 8.0)
    wz = wz * ctx["zone"] * (crop.roi_mask > 0.5) * (1 - crop.protect_mask)
    scope = np.clip(np.maximum(wz, key_f), 0, 1)[..., None]
    lab2 = lab_low.copy()
    lab2[..., 1:] += (ref_ab - lab_low[..., 1:]) * wz[..., None]
    lab2[..., 0] /= 2.55
    lab2[..., 1:] -= 128.0
    low_out = cv2.cvtColor(lab2, cv2.COLOR_Lab2BGR) * 255.0
    high_out = high * (1 - key_f[..., None]) + donor * key_f[..., None]
    return np.clip(img * (1 - scope) + (low_out + high_out) * scope,
                   0, 255).astype(np.uint8)


# --------------------------------------------------------------------------

def run_photo(name: str, img_path: Path, gt_path: Path,
              pair: bool = False, out_dir: Path = OUT) -> dict | None:
    ctrl = controls_for(name)
    ctx = prepare_photo(name, img_path, gt_path)
    if ctx is None:
        return None
    crop = ctx["crop"]
    fw = crop.face_width
    H, W = crop.bgr.shape[:2]
    for c in ctrl:
        if not (0 <= c["x"] < W and 0 <= c["y"] < H):
            raise SystemExit(f"{name}: control out of crop bounds: {c}")

    w_high = build_soft_high_weight(ctx)
    # Frozen (human-audited) candidates are hairs by definition: force full
    # replacement on them -- a gate-grade hair left half-replaced is the
    # attenuation failure all over again (psd03 candSat 0.65 -> ghost 0.57).
    cand_core = np.zeros(w_high.shape, np.float32)
    for c in ctx["cands_ext"]:
        cand_core[c.px[:, 0], c.px[:, 1]] = 1.0
    cand_core = cv2.dilate(cand_core, np.ones((3, 3), np.float32))
    w_high = np.maximum(w_high, cand_core * (crop.protect_mask < 0.5)
                        * (crop.roi_mask > 0.5))
    # Nostril adjacency is out of scope (user: nostril hairs stay): the soft
    # key fires on nostril shadows (narrow+dark) and the donor flattened the
    # nostril silhouettes into beige rings (visual gate). The nostril protect
    # components are the ones above the lip line.
    lips_top = float(crop.landmarks[LIPS_OUTER][:, 1].min())
    yy_g = np.arange(w_high.shape[0])[:, None]
    nostril = (crop.protect_mask > 0.5) & (yy_g < lips_top - 2)
    ndist = cv2.distanceTransform((~nostril).astype(np.uint8), cv2.DIST_L2, 3)
    # Candidate-core-preserving feather (v2.1, cross-validated): full veto
    # inside nr, weak support feathers in over nr..2nr, but REAL hair cores
    # outside the veto are restored to w=1 -- an inward feather alone just
    # moved the half-treated annulus outward ("콧구멍에 뭔가 붙여놓음").
    nr = max(4.0, 0.025 * crop.face_width)
    nostril_core = ndist < nr
    w_high *= np.clip((ndist - nr) / nr, 0.0, 1.0)
    w_high = np.maximum(w_high, cand_core * (~nostril_core)
                        * (crop.protect_mask < 0.5) * (crop.roi_mask > 0.5))
    c_img, diag = compose_v2(ctx, w_high)
    out: dict = {"id": name, "diag": {k: v for k, v in diag.items()
                                      if not isinstance(v, np.ndarray)},
                 "variants": {}}
    if c_img is None:
        out["abstain"] = True
        print(f"{name}: ABSTAIN ({diag.get('s')})")
        return out
    out["abstain"] = False

    a_img = run_stages(ctx)["medium"]
    if pair:
        # checkpoint-4 protocol: A/C only, two-way blind on FRESH photos.
        variant_list = (("A", a_img), ("C", c_img))
        letters = "XY"
    else:
        b_img = compose_v1_b(ctx)
        variant_list = (("A", a_img), ("B", b_img), ("C", c_img))
        letters = "XYZ"

    # Nostril veto core is out of scope by policy (nostril hairs stay), but
    # dropping a WHOLE component for touching the core is metric gaming
    # (cross-validated objection): components are trimmed to their outside-
    # core pixels and re-scored; only the vetoed ENERGY is excluded, and the
    # excluded fraction is recorded, never silent.
    excess_orig = excess_map(ctx["maps"], ctx["thr"])
    cands, total_e, dropped_e = [], 0.0, 0.0
    for c in ctx["cands_ext"]:
        total_e += c.weight
        inside = nostril_core[c.px[:, 0], c.px[:, 1]]
        if not inside.any():
            cands.append(c)
            continue
        px_out = c.px[~inside]
        kept_w = float(excess_orig[px_out[:, 0], px_out[:, 1]].sum()) \
            if len(px_out) else 0.0
        dropped_e += c.weight - kept_w
        if len(px_out) >= 4 and kept_w > 0:
            vals = excess_orig[px_out[:, 0], px_out[:, 1]]
            cands.append(Candidate(label=c.label, px=px_out, weight=kept_w,
                                   q95_orig=float(np.percentile(vals, 95))))
    out["diag"]["nostrilExcludedEnergyFrac"] = dropped_e / max(total_e, 1e-6)
    zone_ext = diag["zoneExt"]
    yy, xx = np.mgrid[0:H, 0:W]

    def jaw_gradient_change(res):
        g0 = cv2.cvtColor(crop.bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
        g1 = cv2.cvtColor(res, cv2.COLOR_BGR2GRAY).astype(np.float32)
        s = 0.10 * fw

        def mag(g):
            m = cv2.GaussianBlur(g, (0, 0), s)
            gx = cv2.Sobel(m, cv2.CV_32F, 1, 0)
            gy = cv2.Sobel(m, cv2.CV_32F, 0, 1)
            return np.sqrt(gx * gx + gy * gy)

        a, b = mag(g0)[zone_ext], mag(g1)[zone_ext]
        return float((b.mean() - a.mean()) / max(a.mean(), 1e-6))

    def seam_metrics(res):
        """Complaint-shaped seam rulers (v2.1): lip-ring gradient ratio and
        the low-band jump across the inferior contour, both vs the original
        (1.0 = unchanged; large = a NEW seam the edit created)."""
        rl = low_lab(res, fw)[..., 0]
        ol = diag["origLowL"]
        ringm = ((diag["lipDist"] > 2) & (diag["lipDist"] < 0.05 * fw)
                 & (crop.roi_mask > 0.5))

        def gmag(a):
            return cv2.magnitude(cv2.Sobel(a, cv2.CV_32F, 1, 0),
                                 cv2.Sobel(a, cv2.CV_32F, 0, 1))

        lip_ratio = float(gmag(rl)[ringm].mean()
                          / max(gmag(ol)[ringm].mean(), 1e-6)) \
            if ringm.sum() >= 64 else None
        bot = diag["bottomContour"]
        k = 4
        cols_z = np.where(zone_ext.any(0))[0]
        ybi = np.clip(bot[cols_z].astype(int), k, H - k - 1)
        jr = np.abs(rl[ybi + k, cols_z] - rl[ybi - k, cols_z])
        jo = np.abs(ol[ybi + k, cols_z] - ol[ybi - k, cols_z])
        inf_ratio = float(jr.mean() / max(jo.mean(), 1e-6)) \
            if len(cols_z) >= 16 else None
        return lip_ratio, inf_ratio

    for tag, res in variant_list:
        v = score_result(res, cands, ctx["thr"], fw)
        lv = score_low_band(res, diag["S_L"], diag["origLowL"], diag["stain"],
                            zone_ext, fw, diag["S_ab"])
        drift = []
        for c in ctrl:
            mm = (yy - c["y"]) ** 2 + (xx - c["x"]) ** 2 <= c["r"] ** 2
            d = np.abs(res.astype(np.int16) - crop.bgr.astype(np.int16))[mm]
            drift.append(float(np.percentile(d, 95)) if d.size else None)
        lip_ratio, inf_ratio = seam_metrics(res)
        out["variants"][tag] = {
            "ghostQ90R": v.weightedQ90R, "survival": v.survivalRate,
            "excessArea": v.excessAreaRatio,
            "stainResidual": lv.stainResidual, "stainQ90R": lv.stainQ90R,
            "overLiftQ90": lv.overLiftQ90, "abResidualQ90": lv.abResidualQ90,
            "structureBand": structure_preservation(crop.bgr, res,
                                                    diag["band"], fw),
            "lipSeamRatio": lip_ratio, "inferiorSeamRatio": inf_ratio,
            "jawGradChange": jaw_gradient_change(res),
            "controlDriftP95": drift,
        }

    # pic4-style diagnosis: how much frozen-candidate energy got a saturated key
    wsum, wkeyed = 0.0, 0.0
    for c in cands:
        wsum += c.weight
        if float(w_high[c.px[:, 0], c.px[:, 1]].mean()) >= 0.9:
            wkeyed += c.weight
    out["diag"]["candEnergySaturated"] = wkeyed / max(wsum, 1e-6)
    lap = cv2.Laplacian(cv2.cvtColor(crop.bgr, cv2.COLOR_BGR2GRAY), cv2.CV_32F)
    out["diag"]["blurVarLapClean"] = float(lap[ctx["clean"]].var()) \
        if ctx["clean"].any() else None

    # blinded panels
    order = [t for t, _ in variant_list]
    seed = int(hashlib.sha256(name.encode()).hexdigest(), 16) % (2 ** 32)
    np.random.default_rng(seed).shuffle(order)
    imgs = dict(variant_list)
    zys, zxs = np.nonzero(zone_ext)
    zy0, zy1 = int(zys.min()), int(zys.max())
    zx0, zx1 = int(zxs.min()), int(zxs.max())
    zym, zxm = (zy0 + zy1) // 2, (zx0 + zx1) // 2
    regions = {
        "full": (0, H, 0, W),
        "upper": (max(zy0 - 10, 0), min(zym + 10, H), max(zx0 - 10, 0),
                  min(zx1 + 10, W)),
        "lower_left": (max(zym - 10, 0), min(zy1 + 10, H), max(zx0 - 10, 0), zxm),
        "lower_right": (max(zym - 10, 0), min(zy1 + 10, H), zxm, min(zx1 + 10, W)),
    }
    pdir = out_dir / "panels"
    pdir.mkdir(parents=True, exist_ok=True)
    for rname, (ry0, ry1, rx0, rx1) in regions.items():
        tiles = []
        for lbl, im in [("ORIG", crop.bgr)] + [(x, imgs[v]) for x, v in
                                               zip(letters, order)]:
            t = im[ry0:ry1, rx0:rx1]
            if rname != "full":
                t = cv2.resize(t, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST)
            bar = np.full((30, t.shape[1], 3), 22, np.uint8)
            cv2.putText(bar, lbl, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                        (255, 255, 255), 2)
            tiles.append(cv2.vconcat([bar, t]))
        cv2.imwrite(str(pdir / f"{name}_{rname}.png"), cv2.hconcat(tiles))
    out["blindOrder"] = {x: v for x, v in zip(letters, order)}
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("photos", nargs="+")
    ap.add_argument("--pair", action="store_true",
                    help="checkpoint-4 mode: A/C only, X/Y letters")
    ap.add_argument("--tag", default=None,
                    help="output subfolder (규율 8: no overwriting runs)")
    args = ap.parse_args()
    out_dir = OUT / args.tag if args.tag else OUT
    out_dir.mkdir(parents=True, exist_ok=True)
    pairs = {n: (p, g) for n, p, g in discover_pairs()}
    results = []
    for name in args.photos:
        if name not in pairs:
            print(f"unknown photo {name}")
            continue
        r = run_photo(name, *pairs[name], pair=args.pair, out_dir=out_dir)
        if r:
            results.append(r)
            pub = {k: v for k, v in r.items() if k != "blindOrder"}
            print(json.dumps(pub, indent=2, default=str))
    (out_dir / "spike.json").write_text(json.dumps(
        [{k: v for k, v in r.items() if k != "blindOrder"} for r in results],
        indent=2, default=str))
    # Sealed OUTSIDE the panels/output folder the judge browses
    # (cross-validated one-shot protocol).
    seal = LAB / "spike" / f"blind_mapping_{args.tag or 'zone_recon'}.json"
    seal.write_text(json.dumps(
        {r["id"]: r["blindOrder"] for r in results if "blindOrder" in r},
        indent=2))
    print(f"\npanels -> {out_dir / 'panels'}   (blinded; mapping sealed at "
          f"{seal})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
