"""Ruler suite for the guarded-LaMa hybrid (v1) — Codex #9 formulation.

Every ruler here ships with a synthetic-defect positive control in
tests/test_hybrid_rulers.py; the FROZEN thresholds below were calibrated on
those controls ONLY, before the one-shot dev9 run (a ruler that has never
tripped on a known defect is decoration, and thresholds tuned on dev9 results
are gate tuning).

Verdicts: each gate returns its measurements; `judge()` folds them into
pass / abstain / hard-fail. v1 discipline: a failed gate means ABSTAIN
(refuse the edit), never auto-correction.
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB))

from engine.texture import coherence_map, relative_grain_map  # noqa: E402
from eval.ghost_ruler import LOW_SIGMA_RATIO, blackhat_maps, excess_map  # noqa: E402

EPS = 1e-4

# Frozen gates (Codex #9 Q5 step 1 + controls-calibrated step 3).
FROZEN = {
    "grainG50": (0.75, 1.30),       # abstain outside
    "grainG50Hard": (0.67, 1.50),   # regression hard-stop outside
    "grainG90Max": 1.45,
    "grainG90Hard": 1.60,
    "fillLiftQ90Max": 15.0,         # coarse tone circuit breaker (L)
    "fillLiftQ10Min": -5.0,
    # Controls-calibrated (see test_hybrid_rulers.py):
    "newDarkAreaMax": 0.010,        # hair-grade excess px / mask px
    "newDarkCohMax": 0.55,          # excess-weighted coherence (strands)
    "newBrightAreaMax": 0.004,      # +12L low-band component px / mask px
    "lipLeakRedMax": 6.0,           # Q95 new redness (Lab a) in the lip ring
    "brightBandMax": 3.0,           # Q95 |grad| of low-band delta at seam (L/px)
}


def _low_l(bgr: np.ndarray, fw: float) -> np.ndarray:
    sig = max(2.0, fw / LOW_SIGMA_RATIO)
    lum = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    return cv2.GaussianBlur(lum, (0, 0), sigmaX=sig)


def grain_gate(orig: np.ndarray, result: np.ndarray, edit_mask: np.ndarray,
               clean: np.ndarray, fw: float) -> dict:
    """Two-sided texture-contrast match (deficit = waxy, excess = regenerated
    stubble). Core C = eroded mask; reference R = clean skin >=0.03fw away, in
    C's own row band, local-L matched; upper fallback flagged low-confidence."""
    ek = max(3, int(0.01 * fw) | 1)
    core = cv2.erode(edit_mask.astype(np.uint8), np.ones((ek, ek), np.uint8)) > 0
    if not core.any():
        return {"grainG50": None, "grainG90": None, "grainLowConf": True}

    dist = cv2.distanceTransform((~edit_mask).astype(np.uint8), cv2.DIST_L2, 3)
    far = dist >= 0.03 * fw
    rows = np.nonzero(core.any(axis=1))[0]
    band = np.zeros_like(core)
    band[rows.min():rows.max() + 1] = True

    lo = _low_l(orig, fw)
    med_l = float(np.median(lo[core]))
    ref = clean & far & band & (np.abs(lo - med_l) < 10.0)
    low_conf = False
    if ref.sum() < 400:
        ref = clean & far
        low_conf = True
    if ref.sum() < 100:
        return {"grainG50": None, "grainG90": None, "grainLowConf": True}

    e_res = relative_grain_map(result)
    e_ref = relative_grain_map(orig)[ref]
    ec = e_res[core]
    g50 = float(np.exp(np.median(np.log(ec + EPS))
                       - np.median(np.log(e_ref + EPS))))
    g90 = float(np.percentile(ec, 90) / max(np.percentile(e_ref, 90), EPS))
    return {"grainG50": round(g50, 3), "grainG90": round(g90, 3),
            "grainLowConf": low_conf}


def new_dark_gate(result: np.ndarray, edit_mask: np.ndarray, thr: dict | None,
                  fw: float, excess_override: np.ndarray | None = None) -> dict:
    """Hair-grade darkness INSIDE the fill. The fill must contain no hair —
    any black-hat excess there is either a survivor or a LaMa-regenerated
    strand, and every pre-hybrid ruler was blind to the second kind.

    excess_override: v3 path — the anchor-normalized z-excess map from
    eval.reference_bundle (complement-of-zone thresholds collapsed on hairy
    photos; anchor z-space replaces them)."""
    if excess_override is not None:
        exc = excess_override
    else:
        maps_r = blackhat_maps(result, fw)
        exc = excess_map(maps_r, thr)
    inside = (exc > 0) & edit_mask
    area = float(inside.sum()) / max(float(edit_mask.sum()), 1.0)
    coh = coherence_map(result)
    wcoh = (float((coh[inside] * exc[inside]).sum()
                  / max(exc[inside].sum(), EPS)) if inside.any() else 0.0)
    return {"newDarkArea": round(area, 4), "newDarkCoh": round(wcoh, 3)}


def new_bright_gate(orig: np.ndarray, result: np.ndarray,
                    edit_mask: np.ndarray, fw: float) -> dict:
    """Bright hallucinated structure (teeth-like patch, hot spot): connected
    +12L low-band components inside the fill, size-thresholded."""
    d_low = _low_l(result, fw) - _low_l(orig, fw)
    hot = ((d_low > 12.0) & edit_mask).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(hot, connectivity=8)
    min_px = max(9, int((0.008 * fw) ** 2))
    area = sum(int(stats[i, cv2.CC_STAT_AREA]) for i in range(1, n)
               if stats[i, cv2.CC_STAT_AREA] >= min_px)
    return {"newBrightArea": round(area / max(float(edit_mask.sum()), 1.0), 4)}


def lip_leak_gate(orig: np.ndarray, result: np.ndarray, lip: np.ndarray,
                  fw: float) -> dict:
    """New lip-colored extension in the ring just outside the protected lip
    polygon (LaMa 'growing' the lips — the #9 top failure bet)."""
    dist = cv2.distanceTransform((~lip).astype(np.uint8), cv2.DIST_L2, 3)
    ring = (dist > 0) & (dist <= 0.02 * fw)
    if not ring.any():
        return {"lipLeakRed": None}
    a_o = cv2.cvtColor(orig, cv2.COLOR_BGR2Lab)[..., 1].astype(np.float32)
    a_r = cv2.cvtColor(result, cv2.COLOR_BGR2Lab)[..., 1].astype(np.float32)
    new_red = np.maximum(a_r - a_o, 0.0)[ring]
    return {"lipLeakRed": round(float(np.percentile(new_red, 95)), 2)}


def bright_band_gate(orig: np.ndarray, result: np.ndarray,
                     edit_mask: np.ndarray, fw: float) -> dict:
    """Introduced low-band discontinuity at the seam (checkpoint-4's 'sudden
    bright bands'): gradient magnitude of the low-band delta in the boundary
    band. A clean edit changes tone smoothly; a band has a cliff."""
    d_low = _low_l(result, fw) - _low_l(orig, fw)
    gx = cv2.Sobel(d_low, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(d_low, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.hypot(gx, gy)
    inner = cv2.distanceTransform(edit_mask.astype(np.uint8), cv2.DIST_L2, 3)
    outer = cv2.distanceTransform((~edit_mask).astype(np.uint8), cv2.DIST_L2, 3)
    band = (inner <= 0.02 * fw) & (outer <= 0.02 * fw)
    if not band.any():
        return {"brightBand": None}
    return {"brightBand": round(float(np.percentile(mag[band], 95)), 2)}


def fill_lift_gate(orig: np.ndarray, result: np.ndarray,
                   edit_mask: np.ndarray, fw: float) -> dict:
    ek = max(3, int(0.01 * fw) | 1)
    core = cv2.erode(edit_mask.astype(np.uint8), np.ones((ek, ek), np.uint8)) > 0
    if not core.any():
        return {"fillLiftLQ90": None, "fillLiftLQ10": None}
    lift = (_low_l(result, fw) - _low_l(orig, fw))[core]
    return {"fillLiftLQ90": round(float(np.percentile(lift, 90)), 2),
            "fillLiftLQ10": round(float(np.percentile(lift, 10)), 2)}


_BYTE_GUARDS = (("lip", "lipIdentical"), ("nostril_core", "nostrilIdentical"),
                ("below_jaw", "belowJawIdentical"),
                ("occluder", "occluderIdentical"))


def score_photo(orig: np.ndarray, result: np.ndarray, edit_mask: np.ndarray,
                clean: np.ndarray, thr: dict | None, guards: dict, fw: float,
                excess_result: np.ndarray | None = None) -> dict:
    """Byte gates run for whichever guard masks the caller supplies —
    v3 retired below_jaw (the mask now legitimately crosses the jaw) and
    added the occluder guard; the gate list follows the guards dict."""
    m: dict = {}
    m.update(grain_gate(orig, result, edit_mask, clean, fw))
    m.update(new_dark_gate(result, edit_mask, thr, fw,
                           excess_override=excess_result))
    m.update(new_bright_gate(orig, result, edit_mask, fw))
    m.update(lip_leak_gate(orig, result, guards["lip"], fw))
    m.update(bright_band_gate(orig, result, edit_mask, fw))
    m.update(fill_lift_gate(orig, result, edit_mask, fw))
    m["outsideIdentical"] = bool(np.array_equal(result[~edit_mask],
                                                orig[~edit_mask]))
    for key, label in _BYTE_GUARDS:
        if key in guards:
            m[label] = bool(np.array_equal(result[guards[key]],
                                           orig[guards[key]]))
    m.update(judge(m))
    return m


def judge(m: dict) -> dict:
    """pass / abstain / hard-fail per the frozen gates."""
    hard, abstain = [], []
    for k in ("outsideIdentical", "lipIdentical", "nostrilIdentical",
              "belowJawIdentical", "occluderIdentical"):
        if m.get(k) is False:
            hard.append(k)

    # Low-confidence grain numbers may ABSTAIN but never hard-fail: a
    # degraded reference (fallback ring, garment-dominated crop) measuring
    # G50=0.16 on a visually fine fill is uncertainty, not proof (Codex #11
    # — pic2's black track-jacket crop hard-failed on a distorted reference).
    grain_low = bool(m.get("grainLowConf"))
    g50, g90 = m.get("grainG50"), m.get("grainG90")
    if g50 is not None:
        lo, hi = FROZEN["grainG50Hard"]
        if not lo <= g50 <= hi:
            (abstain if grain_low else hard).append("grainG50")
        else:
            lo, hi = FROZEN["grainG50"]
            if not lo <= g50 <= hi:
                abstain.append("grainG50")
    if g90 is not None:
        if g90 > FROZEN["grainG90Hard"]:
            (abstain if grain_low else hard).append("grainG90")
        elif g90 > FROZEN["grainG90Max"]:
            abstain.append("grainG90")

    if (v := m.get("fillLiftLQ90")) is not None and v > FROZEN["fillLiftQ90Max"]:
        abstain.append("fillLiftLQ90")
    if (v := m.get("fillLiftLQ10")) is not None and v < FROZEN["fillLiftQ10Min"]:
        abstain.append("fillLiftLQ10")
    # OR-judgement (Codex #9): strands trip coherence, stubble dots trip area —
    # either alone is a hair failure.
    if m.get("newDarkArea", 0) > FROZEN["newDarkAreaMax"]:
        abstain.append("newDarkArea")
    elif (m.get("newDarkArea", 0) > FROZEN["newDarkAreaMax"] / 2
          and m.get("newDarkCoh", 0) > FROZEN["newDarkCohMax"]):
        abstain.append("newDarkCoh")
    if m.get("newBrightArea", 0) > FROZEN["newBrightAreaMax"]:
        abstain.append("newBrightArea")
    if (v := m.get("lipLeakRed")) is not None and v > FROZEN["lipLeakRedMax"]:
        abstain.append("lipLeakRed")
    if (v := m.get("brightBand")) is not None and v > FROZEN["brightBandMax"]:
        abstain.append("brightBand")

    verdict = "hard-fail" if hard else ("abstain" if abstain else "pass")
    return {"verdict": verdict, "hardFails": hard, "abstains": abstain}
