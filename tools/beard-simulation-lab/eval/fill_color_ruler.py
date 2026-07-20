"""fillColor ruler: chroma harmony of the LaMa fill vs its LOCAL skin ring.

The user contract demands color harmony ("색이 조화롭게") and the existing
fillLift gate is L-only: a fill can hold luminance while drifting gray —
LaMa (Places2-trained) has a known desaturation/gray skew on skin. This
module is the independent chroma gate (Codex #10 spec, implemented exactly).

Reference discipline: the reference is the LOCAL skin ring around each edit
component, never an anatomical anchor — neck lighting differs from upper-face
lighting, so an anchor reference would charge lighting to the fill. Anchors
enter ONLY as a covariance regularizer (anchor_cov, 25% weight). Illumination
inside the ring is absorbed by a robust affine plane per Lab channel fitted
on the ring's low-pass Lab; a naive ring-mean fails the gradient control in
tests/test_fill_color_ruler.py.

Ring pixels are OUTSIDE the edit mask and byte-identical between orig and
result by pipeline contract, so they are sampled from result_bgr: one
low-pass buffer serves ring and core consistently (orig_bgr is kept in the
API for contract symmetry and future byte-identity auditing).

Verdicts are pass / abstain only: color is a per-photo abstain (Codex #10);
the process-level hard-stop lives in the tests (neutral-pull control).
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB))

from eval.ghost_ruler import low_lab  # noqa: E402  (sigma = fw/30 low band)

# Frozen gates (Codex #10; calibrated on the synthetic controls in
# tests/test_fill_color_ruler.py, then frozen — identity passes with margin,
# neutral-pull and warm-cast trip, a shared illumination gradient does not).
FROZEN = {
    "fillDeltaAb50Max": 3.0,   # median ab error vs the local ring plane (Lab)
    "fillDeltaAb90Max": 6.0,
    "fillColorD90Max": 4.0,    # Mahalanobis in ab, covariance floored below
}

_MIN_COMP_PX = 64          # smaller edit islands are seam specks, not fills
_MIN_CORE_PX = 256         # pooled-evidence floor: below -> abstain + lowConf
_RING_IN = 0.02            # x fw: ring band outside the component
_RING_OUT = 0.08
_RING_CLEAN_Z = 4.0        # self-clean: drop ring px > 4 robust sigmas (Lab)
_COV_FLOOR = 4.0           # eigenvalue floor (Lab^2): keeps D honest where an
                           # ultra-smooth ring drives residual covariance -> 0
_RING_COV_W = 0.75         # ring is the reference; anchor is regularizer only
_NEUTRAL = 128.0           # uint8-Lab neutral chroma point (low_lab offsets ab)


def _min_ring_px(fw: float) -> int:
    return int(max(256, 0.002 * fw * fw))


def _fit_plane(vals: np.ndarray, u: np.ndarray, v: np.ndarray,
               ) -> tuple[np.ndarray, np.ndarray]:
    """Robust affine fit value ~ b0 + b1*u + b2*v (IRLS, Huber c=1.345).

    Linear-terms-only variant of spike/zone_recon.py _fit_quadratic. Returns
    (beta, final residuals) so the caller can build the ring noise covariance
    from what the illumination model can NOT explain — raw ab covariance
    would be inflated by the very gradient the plane exists to absorb.
    """
    A = np.stack([np.ones_like(u), u, v], 1)
    t = vals.astype(np.float64)
    wgt = np.ones(len(t))
    beta = np.zeros(3)
    for _ in range(5):
        AW = A * wgt[:, None]
        beta = np.linalg.solve(AW.T @ A + np.eye(3) * 1e-3, AW.T @ t)
        res = t - A @ beta
        s = max(np.median(np.abs(res)) * 1.4826, 1e-3)
        wgt = np.minimum(1.0, 1.345 / np.maximum(np.abs(res) / s, 1e-6))
    return beta, t - A @ beta


def _self_clean(vals: np.ndarray) -> np.ndarray:
    """Keep ring px within 4 robust sigmas of the ring's own Lab center.

    Diagonal median/MAD Mahalanobis — cheap, and enough to shed the beard
    evidence / shadow / occluder pixels the caller's exclude_mask missed.
    """
    med = np.median(vals, axis=0)
    mad = np.median(np.abs(vals - med), axis=0)
    z = (vals - med) / (1.4826 * mad + 1e-3)
    return np.sqrt((z ** 2).sum(axis=1)) <= _RING_CLEAN_Z


def _floored_cov(resid_ab: np.ndarray,
                 anchor_cov: np.ndarray | None) -> np.ndarray:
    """0.75 ring + 0.25 anchor ab covariance, eigenvalues floored at 4 Lab^2."""
    cov = np.cov(resid_ab, rowvar=False)
    if anchor_cov is not None:
        cov = (_RING_COV_W * cov
               + (1.0 - _RING_COV_W) * np.asarray(anchor_cov, np.float64))
    cov = (cov + cov.T) / 2.0
    evals, evecs = np.linalg.eigh(cov)
    return (evecs * np.maximum(evals, _COV_FLOOR)) @ evecs.T


def _r3(x: float | None) -> float | None:
    return None if x is None else round(float(x), 3)


def score_fill_color(orig_bgr: np.ndarray, result_bgr: np.ndarray,
                     edit_mask: np.ndarray, exclude_mask: np.ndarray,
                     face_width: float,
                     anchor_cov: np.ndarray | None = None) -> dict:
    """Chroma-harmony metrics of the fill vs its local skin ring.

    Per connected component (8-conn, >=64 px): core = 0.01*fw erosion, ring =
    0.02..0.08*fw outside the component minus exclude_mask / other components
    / non-skin (self-cleaned). Deltas are measured low-pass Lab minus the
    per-channel affine plane fitted on the ring, pooled over every confident
    core pixel. neutralPull50 > 0 means the fill moved toward gray.
    """
    fw = float(face_width)
    del orig_bgr  # ring px are byte-identical by pipeline contract (see doc)
    lab_low = low_lab(result_bgr, fw)
    n, labels = cv2.connectedComponents(edit_mask.astype(np.uint8),
                                        connectivity=8)

    low_conf = False
    dab_all: list[np.ndarray] = []
    maha_all: list[np.ndarray] = []
    pull_all: list[np.ndarray] = []
    ek = max(3, int(0.01 * fw) | 1)

    for comp_id in range(1, n):
        comp = labels == comp_id
        if int(comp.sum()) < _MIN_COMP_PX:
            continue
        core = cv2.erode(comp.astype(np.uint8),
                         np.ones((ek, ek), np.uint8)) > 0
        if not core.any():
            core, low_conf = comp, True  # thin fill: measure it, but say so

        # Ring: distance OUTSIDE the component; other components are inside
        # edit_mask and drop out with it.
        dist = cv2.distanceTransform((~comp).astype(np.uint8), cv2.DIST_L2, 3)
        ring = ((dist >= _RING_IN * fw) & (dist <= _RING_OUT * fw)
                & ~edit_mask & ~exclude_mask)
        rys, rxs = np.nonzero(ring)
        rvals = lab_low[rys, rxs].astype(np.float64)
        if len(rvals):
            keep = _self_clean(rvals)
            rys, rxs, rvals = rys[keep], rxs[keep], rvals[keep]
        if len(rvals) < _min_ring_px(fw):
            low_conf = True  # starved ring: no distance numbers from this one
            continue

        cys, cxs = np.nonzero(core)
        cy0, cx0 = float(cys.mean()), float(cxs.mean())
        u_r, v_r = (rxs - cx0) / fw, (rys - cy0) / fw
        u_c, v_c = (cxs - cx0) / fw, (cys - cy0) / fw

        pred = np.empty((len(cys), 3))
        resid_ab = np.empty((len(rys), 2))
        for ch in range(3):
            beta, resid = _fit_plane(rvals[:, ch], u_r, v_r)
            pred[:, ch] = beta[0] + beta[1] * u_c + beta[2] * v_c
            if ch:
                resid_ab[:, ch - 1] = resid

        meas = lab_low[cys, cxs].astype(np.float64)
        d_ab = meas[:, 1:] - pred[:, 1:]
        dab_all.append(np.hypot(d_ab[:, 0], d_ab[:, 1]))

        inv = np.linalg.inv(_floored_cov(resid_ab, anchor_cov))
        maha_all.append(np.sqrt(np.maximum(((d_ab @ inv) * d_ab).sum(1), 0.0)))

        c_pred = np.hypot(pred[:, 1] - _NEUTRAL, pred[:, 2] - _NEUTRAL)
        c_meas = np.hypot(meas[:, 1] - _NEUTRAL, meas[:, 2] - _NEUTRAL)
        pull_all.append(c_pred - c_meas)  # positive = moved toward gray

    total = int(sum(len(d) for d in dab_all))
    if total:
        dab = np.concatenate(dab_all)
        maha = np.concatenate(maha_all)
        pull = np.concatenate(pull_all)
        m = {
            "fillDeltaAb50": _r3(np.percentile(dab, 50)),
            "fillDeltaAb90": _r3(np.percentile(dab, 90)),
            "fillColorD50": _r3(np.percentile(maha, 50)),
            "fillColorD90": _r3(np.percentile(maha, 90)),
            "neutralPull50": _r3(np.median(pull)),
        }
    else:
        m = {"fillDeltaAb50": None, "fillDeltaAb90": None,
             "fillColorD50": None, "fillColorD90": None,
             "neutralPull50": None}

    low_conf = low_conf or total < _MIN_CORE_PX
    if low_conf:
        # A component-level unknown must not be covered by other components'
        # pooled pass (Codex #11 — pic4 shipped fillColorLowConf=true with
        # verdict=pass): unknown color anywhere in the fill is an abstain.
        verdict = "abstain"
    elif (m["fillDeltaAb50"] <= FROZEN["fillDeltaAb50Max"]
          and m["fillDeltaAb90"] <= FROZEN["fillDeltaAb90Max"]
          and m["fillColorD90"] <= FROZEN["fillColorD90Max"]):
        verdict = "pass"
    else:
        verdict = "abstain"  # per-photo abstain; no hard-fail class for color

    m["fillColorCorePx"] = total
    m["fillColorLowConf"] = bool(low_conf)
    m["fillColorVerdict"] = verdict
    return m
