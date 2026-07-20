"""Jaw-silhouette preservation ruler (Codex #10 formulation).

The neck-inclusive eraser mask crosses the jaw contour, so the old below-jaw
byte-identity guard is retired: LaMa now legitimately repaints pixels on BOTH
sides of the silhouette, and no byte-level check can say whether the face
shape survived. Face-shape preservation is the ONE property every human
checkpoint praised, so it becomes a measured gate here.

How it works:

1. The JAW_OVAL landmark polyline (ear -> chin -> ear, crop coordinates) is
   arc-length resampled at 0.01*fw. At each sample point we take the local
   tangent (finite difference) and its unit normal.
2. Along each normal we read the directional derivative of gray (Sobel gx,gy
   dotted with the normal, bilinear taps) at offsets -0.025*fw..+0.025*fw.
   The strongest |profile| peak is where the image says the silhouette is.
3. Classification uses the ORIGINAL only: a point is "stable" when the peak
   sits within 0.01*fw of the polyline and no comparable second peak exists;
   otherwise it is "hair-obscured" (the silhouette is buried in beard, so the
   original edge position is not trustworthy as a reference).
4. Stable points gate positional shift (orig peak vs result peak) and profile
   shape (weighted Pearson of the SIGNED profiles). Hair-obscured points gate
   where the RECONSTRUCTED contour landed: it must reappear near the landmark
   polyline (jawToLandmarkP95), because the landmarks are the only reference
   the beard did not corrupt.

Verdict discipline matches eval/hybrid_rulers.py: clear deformation of a core
invariant is a hard-fail; measurement uncertainty (low support, mid-band
values) is an abstain, never a silent pass. The FROZEN thresholds are the
Codex #10 spec values, validated on the synthetic positive/negative controls
in tests/test_silhouette_ruler.py ONLY (a ruler that never tripped on a known
defect is decoration; thresholds tuned on eval outputs are gate tuning).
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB))

from engine.detect_face import JAW_OVAL  # noqa: E402

# --- geometry constants (all in fw units unless noted) ----------------------
SAMPLE_SPACING = 0.010    # arc-length step between contour probes
PROFILE_HALF = 0.025      # normal-profile half-window
# 21 taps -> 0.0025*fw pitch; with parabolic sub-tap refinement the peak
# locator resolves ~0.001*fw, which the 0.006 shift gate needs (11 taps at
# 0.005*fw pitch would quantize AT the gate).
N_TAPS = 21
STABLE_MAX_OFFSET = 0.010  # orig peak farther than this from the polyline => obscured
MIN_PEAK_SEP = 0.0075      # closer secondary maxima are the same edge's shoulder
DOMINANCE = 0.6            # secondary peak >= 0.6x primary => silhouette ambiguous
MIN_VALID_SAMPLES = 20     # below this the contour is mostly outside the crop

# Frozen verdict gates (Codex #10). pass needs ALL of the first three;
# uncertainty bands abstain; clear deformation hard-fails.
FROZEN = {
    "jawShiftP95Max": 0.006,      # stable-edge displacement, pass ceiling
    "jawShiftP95Hard": 0.012,     # beyond this (with support) the shape moved
    "jawProfileCorrMin": 0.90,    # signed-profile shape match, pass floor
    "jawProfileCorrHard": 0.75,   # below this the edge was rebuilt, not kept
    "jawToLandmarkP95Max": 0.010, # reconstructed contour vs landmark polyline
    "supportFracMin": 0.30,       # fewer stable points => measurement is blind
}

_EPS = 1e-9


def _resample_jaw(landmarks: np.ndarray, fw: float
                  ) -> tuple[np.ndarray, np.ndarray]:
    """Arc-length resample of the JAW_OVAL polyline; returns (points, unit
    normals). Normal sign is arbitrary but IDENTICAL for orig and result, so
    every signed comparison stays consistent."""
    pts = np.asarray(landmarks, dtype=np.float64)[JAW_OVAL]
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    arc = np.concatenate([[0.0], np.cumsum(seg)])
    total = float(arc[-1])
    if total <= _EPS:  # degenerate landmarks (e.g. zero-filled)
        return np.zeros((0, 2)), np.zeros((0, 2))
    n = max(int(round(total / (SAMPLE_SPACING * fw))) + 1, 2)
    si = np.linspace(0.0, total, n)
    samples = np.stack([np.interp(si, arc, pts[:, 0]),
                        np.interp(si, arc, pts[:, 1])], axis=1)
    tang = np.gradient(samples, axis=0)
    tang /= np.maximum(np.linalg.norm(tang, axis=1, keepdims=True), _EPS)
    normals = np.stack([tang[:, 1], -tang[:, 0]], axis=1)
    return samples, normals


def _grad_maps(bgr: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    return gx, gy


def _profiles(bgr: np.ndarray, samples: np.ndarray, normals: np.ndarray,
              offsets: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(n_samples, n_taps) directional-derivative profiles + per-sample
    validity (every tap must sit >=1px inside the frame: Sobel border)."""
    gx, gy = _grad_maps(bgr)
    h, w = bgr.shape[:2]
    mapx = (samples[:, 0:1] + offsets[None, :] * normals[:, 0:1]
            ).astype(np.float32)
    mapy = (samples[:, 1:2] + offsets[None, :] * normals[:, 1:2]
            ).astype(np.float32)
    px = cv2.remap(gx, mapx, mapy, cv2.INTER_LINEAR,
                   borderMode=cv2.BORDER_REPLICATE)
    py = cv2.remap(gy, mapx, mapy, cv2.INTER_LINEAR,
                   borderMode=cv2.BORDER_REPLICATE)
    prof = px * normals[:, 0:1].astype(np.float32) \
        + py * normals[:, 1:2].astype(np.float32)
    valid = ((mapx >= 1.0) & (mapx <= w - 2.0)
             & (mapy >= 1.0) & (mapy <= h - 2.0)).all(axis=1)
    return prof, valid


def _peak(row: np.ndarray, offsets: np.ndarray, pitch: float
          ) -> tuple[float, float, int]:
    """Strongest |profile| peak: (sub-tap offset px, magnitude, tap index).
    Parabolic refinement of the 3-tap neighbourhood; delta clipped to half a
    tap so a degenerate parabola cannot throw the peak out of its cell."""
    a = np.abs(row)
    i = int(np.argmax(a))
    delta = 0.0
    if 0 < i < a.size - 1:
        denom = float(a[i - 1] - 2.0 * a[i] + a[i + 1])
        if abs(denom) > _EPS:
            delta = float(np.clip(0.5 * (a[i - 1] - a[i + 1]) / denom,
                                  -0.5, 0.5))
    return float(offsets[i] + delta * pitch), float(a[i]), i


def _local_maxima(a: np.ndarray) -> np.ndarray:
    """Indices of local maxima of |profile|, endpoints included (an edge
    sliding out of the window shows up as an end-tap maximum)."""
    idx = [j for j in range(1, a.size - 1)
           if a[j] >= a[j - 1] and a[j] >= a[j + 1]]
    if a.size >= 2 and a[0] >= a[1]:
        idx.append(0)
    if a.size >= 2 and a[-1] >= a[-2]:
        idx.append(a.size - 1)
    return np.asarray(sorted(idx), dtype=int)


def _is_stable(row: np.ndarray, offsets: np.ndarray, fw: float,
               peak_off: float, peak_idx: int) -> bool:
    """Stable = single dominant peak on the polyline (ORIGINAL image only).
    A far peak means the silhouette edge is not where the landmarks say; a
    comparable second peak means beard texture offers a rival edge -- either
    way the original cannot anchor a shift measurement."""
    if abs(peak_off) > STABLE_MAX_OFFSET * fw:
        return False
    a = np.abs(row)
    for j in _local_maxima(a):
        if (abs(float(offsets[j] - offsets[peak_idx])) > MIN_PEAK_SEP * fw
                and a[j] >= DOMINANCE * a[peak_idx]):
            return False
    return True


def _pearson(a: np.ndarray, b: np.ndarray) -> float | None:
    a = a - a.mean()
    b = b - b.mean()
    na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
    if na < _EPS or nb < _EPS:
        return None  # flat profile: correlation undefined, not "zero match"
    return float(np.dot(a, b) / (na * nb))


def _judge(shift: float | None, corr: float | None, to_lm: float | None,
           support: float) -> str:
    """Frozen verdict fold. Hard-fail = clear deformation (core invariant);
    abstain = uncertainty band, low support, or an off-landmark
    reconstruction where the beard hid the true contour."""
    if corr is not None and corr < FROZEN["jawProfileCorrHard"]:
        return "hard-fail"
    if (shift is not None and shift > FROZEN["jawShiftP95Hard"]
            and support >= FROZEN["supportFracMin"]):
        return "hard-fail"
    if support < FROZEN["supportFracMin"]:
        return "abstain"
    if shift is None or corr is None:
        return "abstain"
    if (shift > FROZEN["jawShiftP95Max"]
            or corr < FROZEN["jawProfileCorrMin"]
            or (to_lm is not None and to_lm > FROZEN["jawToLandmarkP95Max"])):
        return "abstain"
    return "pass"


def _r4(v: float | None) -> float | None:
    return None if v is None else round(float(v), 4)


def score_silhouette(orig_bgr: np.ndarray, result_bgr: np.ndarray,
                     landmarks_crop: np.ndarray, face_width: float) -> dict:
    """Score jaw-silhouette preservation of result vs orig.

    landmarks_crop: (478, 2) FaceMesh landmarks in CROP pixel coordinates
    (only JAW_OVAL indices are read). Returns jawShiftP95 / jawProfileCorr /
    jawToLandmarkP95 / supportFrac (floats, 4dp, fw units; None when the
    supporting point class is empty), silhouetteVerdict, nStable, nObscured.
    """
    if orig_bgr.shape != result_bgr.shape:
        raise ValueError("orig/result shape mismatch")
    fw = float(face_width)

    def _abstain_blind() -> dict:
        return {"jawShiftP95": None, "jawProfileCorr": None,
                "jawToLandmarkP95": None, "supportFrac": 0.0,
                "silhouetteVerdict": "abstain", "nStable": 0, "nObscured": 0}

    samples, normals = _resample_jaw(landmarks_crop, fw)
    if samples.shape[0] == 0:
        return _abstain_blind()

    offsets = np.linspace(-PROFILE_HALF * fw, PROFILE_HALF * fw, N_TAPS)
    pitch = float(offsets[1] - offsets[0])
    prof_o, valid = _profiles(orig_bgr, samples, normals, offsets)
    prof_r, _ = _profiles(result_bgr, samples, normals, offsets)
    keep = np.nonzero(valid)[0]
    if keep.size < MIN_VALID_SAMPLES:
        # Contour mostly outside the crop: the ruler is blind, not satisfied.
        return _abstain_blind()

    shifts: list[float] = []          # stable: |orig peak - result peak|
    corrs: list[float] = []           # stable: signed-profile Pearson
    weights: list[float] = []         # stable: orig peak magnitude
    to_landmark: list[float] = []     # obscured: |result peak| vs polyline
    n_stable = 0
    for i in keep:
        row_o, row_r = prof_o[i], prof_r[i]
        off_o, mag_o, idx_o = _peak(row_o, offsets, pitch)
        off_r, _, _ = _peak(row_r, offsets, pitch)
        if _is_stable(row_o, offsets, fw, off_o, idx_o):
            n_stable += 1
            shifts.append(abs(off_o - off_r) / fw)
            c = _pearson(row_o, row_r)
            if c is not None:
                corrs.append(c)
                weights.append(mag_o)
        else:
            to_landmark.append(abs(off_r) / fw)

    n_valid = int(keep.size)
    support = n_stable / n_valid
    shift_p95 = float(np.percentile(shifts, 95)) if shifts else None
    wsum = float(np.sum(weights))
    corr = (float(np.dot(corrs, weights) / wsum)
            if corrs and wsum > _EPS else None)
    to_lm_p95 = (float(np.percentile(to_landmark, 95))
                 if to_landmark else None)

    return {
        "jawShiftP95": _r4(shift_p95),
        "jawProfileCorr": _r4(corr),
        "jawToLandmarkP95": _r4(to_lm_p95),
        "supportFrac": _r4(support),
        "silhouetteVerdict": _judge(shift_p95, corr, to_lm_p95, support),
        "nStable": n_stable,
        "nObscured": n_valid - n_stable,
    }
