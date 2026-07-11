"""Synthetic controls for spike/mask_v3.py (coverage-first mask geometry).

Fully synthetic — no samples/ photos, no models: a 478-slot landmark array
where only the indices mask_v3 reads are populated (an ellipse standing in
for FACE_OVAL), plus skin-toned bgr fixtures. Every threshold in mask_v3
gets a positive control (a defect that MUST trip it) and an identity /
negative control, per the lab rule that an untripped ruler is decoration.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.detect_face import FACE_OVAL, NOSE_BOTTOM  # noqa: E402
from spike import mask_v3  # noqa: E402

# Fixture geometry: ellipse face in a tall frame so the corridor has room.
H, W = 520, 400
CX, CY, RX, RY = 200.0, 170.0, 110.0, 140.0
FW, FH = 2 * RX, 2 * RY          # 220, 280 (oval extents = face measurements)
CHIN_Y = CY + RY                 # 310
NOSE_Y = 150.0
SKIN_BGR = (150, 170, 205)       # same skin tone as the hybrid-ruler fixture


def _landmarks() -> np.ndarray:
    """478-slot array; FACE_OVAL points on an ellipse (10° apart, index 10 at
    the top), so JAW_OVAL / CHIN_TIP / jaw angles land automatically."""
    lm = np.zeros((478, 2), np.float32)
    for i, idx in enumerate(FACE_OVAL):
        ang = math.radians(-90.0 + i * 10.0)
        lm[idx] = (CX + RX * math.cos(ang), CY + RY * math.sin(ang))
    lm[NOSE_BOTTOM] = (CX, NOSE_Y)
    return lm


LM = _landmarks()


def _canvas(garment_y: float | None = None) -> dict:
    return mask_v3.build_canvas(LM, (H, W), FW, FH,
                                garment_boundary_y=garment_y)


def _skin_bgr(noise_sigma: float = 3.0, seed: int = 20260711) -> np.ndarray:
    rng = np.random.RandomState(seed)
    img = np.full((H, W, 3), SKIN_BGR, np.float32)
    img += rng.normal(0, noise_sigma, img.shape).astype(np.float32)
    return np.clip(img, 0, 255).astype(np.uint8)


def _skin_stats(bgr: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Forehead-patch stand-in for skin_reference_pixels (mean + cov in Lab)."""
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2Lab).astype(np.float32)
    patch = lab[40:90, 150:250].reshape(-1, 3).astype(np.float64)
    return patch.mean(axis=0), np.cov(patch.T)


def _empty() -> np.ndarray:
    return np.zeros((H, W), bool)


# --------------------------------------------------------------------------
# g. canvas geometry
# --------------------------------------------------------------------------

def test_face_region_starts_below_nose():
    c = _canvas()
    cut_y = NOSE_Y + 0.01 * FW  # 152.2
    assert not c["face_region"][int(cut_y) - 1, int(CX)]   # above the cut
    assert c["face_region"][int(cut_y) + 3, int(CX)]       # just below it
    assert not c["face_region"][:int(NOSE_Y)].any()


def test_silhouette_tube_reaches_outside_oval():
    """The point of the tube: beard ON the silhouette edge (outside the
    landmark oval) must be inside the canvas — the oval alone was the ring."""
    c = _canvas()
    oval = np.zeros((H, W), np.uint8)
    cv2.fillPoly(oval, [LM[FACE_OVAL].astype(np.int32)], 1)
    outside_tube = c["silhouette_tube"] & (oval == 0)
    assert outside_tube.any()
    # Concrete pixel ~7 px OUTSIDE the oval at jaw-angle height (tube = 8.8).
    assert not oval[240, 98]
    assert c["silhouette_tube"][240, 98]
    assert c["canvas"][240, 98]


def test_corridor_rails_converge_with_depth():
    c = _canvas()
    w330 = int(c["neck_corridor"][330].sum())
    w400 = int(c["neck_corridor"][400].sum())
    assert w400 < w330  # rails converge, never diverge
    # Analytic widths: (xr - xl) - 2*0.03*(y - 240); rasterization tolerance.
    assert abs(w330 - 185.2) <= 2.5
    assert abs(w400 - 181.0) <= 2.5


def test_corridor_floor_default_and_clip():
    c = _canvas()
    assert c["garment_boundary_y"] is None
    assert c["corridor_floor_y"] == pytest.approx(
        min(H - 1, CHIN_Y + 0.35 * FH))  # 408
    assert c["neck_corridor"][405].any()
    assert not c["neck_corridor"][410:].any()


def test_build_canvas_deterministic():
    a, b = _canvas(), _canvas()
    for key in ("face_region", "silhouette_tube", "neck_corridor", "canvas"):
        assert np.array_equal(a[key], b[key])
    assert a["corridor_floor_y"] == b["corridor_floor_y"]


# --------------------------------------------------------------------------
# a. neck beard connected to jaw beard -> included (the old clip cut this)
# --------------------------------------------------------------------------

def test_jaw_connected_neck_beard_included():
    c = _canvas()
    face_and_tube = c["face_region"] | c["silhouette_tube"]
    growth = _empty()
    growth[280:381, 190:211] = True   # chin beard flowing across the jaw
    seed = _empty()
    seed[300, 200] = True             # single strong seed on the chin
    out = mask_v3.hysteresis_mask(growth, seed, _empty(), c["canvas"],
                                  face_and_tube)
    assert out[290, 200]              # face part kept
    assert out[335, 200]              # just below the jaw: old clip cut here
    assert out[370, 200]              # deep neck part of the SAME component
    assert not out[~c["canvas"]].any()


# --------------------------------------------------------------------------
# b. isolated neck patch: dual-seed rule
# --------------------------------------------------------------------------

def test_isolated_neck_patch_requires_dual_seed():
    c = _canvas()
    face_and_tube = c["face_region"] | c["silhouette_tube"]
    growth = _empty()
    growth[345:366, 180:221] = True   # blob fully inside the corridor,
    assert not (growth & face_and_tube).any()  # >8.8 px from the jaw line
    seed = _empty()
    seed[355, 200] = True
    # One signal confident, second silent -> EXCLUDED (mole/shadow risk).
    out = mask_v3.hysteresis_mask(growth, seed, _empty(), c["canvas"],
                                  face_and_tube)
    assert not out.any()
    # Both signals confident -> the whole blob is included.
    dual = _empty()
    dual[355, 200] = True
    out2 = mask_v3.hysteresis_mask(growth, seed, dual, c["canvas"],
                                   face_and_tube)
    assert out2.sum() == growth.sum()


# --------------------------------------------------------------------------
# e. Adam's apple: growth evidence, no seed -> excluded; no garment trip
# --------------------------------------------------------------------------

def test_seedless_growth_excluded():
    c = _canvas()
    growth = _empty()
    growth[340:370, 185:216] = True   # permissive evidence over soft shading
    out = mask_v3.hysteresis_mask(growth, _empty(), _empty(), c["canvas"],
                                  c["face_region"] | c["silhouette_tube"])
    assert not out.any()


def test_adams_apple_shading_does_not_trip_garment():
    """Soft low-frequency shading (max ~0.45 L/px after low-pass) must stay
    under the 1 L/px gradient floor — the floor exists for exactly this."""
    c = _canvas()
    bgr = _skin_bgr().astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    blob = 15.0 * np.exp(-(((yy - 350) ** 2) + ((xx - 200) ** 2))
                         / (2 * 20.0 ** 2))
    bgr = np.clip(bgr - blob[..., None], 0, 255).astype(np.uint8)
    mean, cov = _skin_stats(bgr)
    y = mask_v3.garment_boundary(bgr, c["neck_corridor"], CHIN_Y, FH,
                                 mean, cov)
    assert y is None


# --------------------------------------------------------------------------
# c. necklace: occluder_guard flags it; hysteresis without seeds excludes it
# --------------------------------------------------------------------------

def test_necklace_flagged_by_occluder_guard():
    c = _canvas()
    bgr = _skin_bgr()
    chain = np.zeros((H, W), np.uint8)
    cv2.line(bgr, (110, 360), (290, 360), (30, 25, 20), 4)   # dark metal
    cv2.line(chain, (110, 360), (290, 360), 1, 4)
    mean, cov = _skin_stats(bgr)
    guard = mask_v3.occluder_guard(bgr, c["canvas"], mean, cov, FW)
    assert guard[360, 200]                                   # chain flagged
    # Seedless chain never survives hysteresis either (belt AND suspenders).
    out = mask_v3.hysteresis_mask(chain > 0, _empty(), _empty(), c["canvas"],
                                  c["face_region"] | c["silhouette_tube"])
    assert not out.any()


def test_occluder_ignores_specks_and_clean_skin():
    c = _canvas()
    bgr = _skin_bgr()
    mean, cov = _skin_stats(bgr)
    # Identity: clean skin must produce an empty guard (noise speckle stays
    # under the (0.06*fw)^2 component-size gate).
    assert not mask_v3.occluder_guard(bgr, c["canvas"], mean, cov, FW).any()
    # A mole-sized non-skin speck (25 px << 174 px) must NOT be flagged.
    bgr2 = bgr.copy()
    bgr2[350:355, 150:155] = (30, 25, 20)
    guard = mask_v3.occluder_guard(bgr2, c["canvas"], mean, cov, FW)
    assert not guard[350:355, 150:155].any()


# --------------------------------------------------------------------------
# d. collar: garment boundary found; corridor floor stops there
# --------------------------------------------------------------------------

def test_collar_sets_garment_boundary_and_floor():
    c = _canvas()
    bgr = _skin_bgr()
    bgr[380:, :] = (30, 30, 30)       # dark garment from y=380 down
    mean, cov = _skin_stats(bgr)
    y = mask_v3.garment_boundary(bgr, c["neck_corridor"], CHIN_Y, FH,
                                 mean, cov)
    assert y is not None
    assert 360.0 <= y <= 380.0        # top of the boundary, above the fabric
    c2 = _canvas(garment_y=y)
    assert c2["garment_boundary_y"] == pytest.approx(y)
    assert c2["corridor_floor_y"] == pytest.approx(y)  # beat the 408 default
    assert not c2["neck_corridor"][int(y) + 2:].any()


# --------------------------------------------------------------------------
# f. no garment (all skin) -> None; floor = chin + 0.35*fh
# --------------------------------------------------------------------------

def test_all_skin_returns_none_and_default_floor():
    c = _canvas()
    bgr = _skin_bgr()
    mean, cov = _skin_stats(bgr)
    y = mask_v3.garment_boundary(bgr, c["neck_corridor"], CHIN_Y, FH,
                                 mean, cov)
    assert y is None
    c2 = _canvas(garment_y=y)
    assert c2["corridor_floor_y"] == pytest.approx(CHIN_Y + 0.35 * FH)


def test_lighting_step_on_skin_returns_none():
    """A hard lighting step (trips the gradient gate) with SKIN below must
    NOT close the corridor — this isolates the non-skin-below condition."""
    bgr = _skin_bgr().astype(np.float32)
    bgr[380:] = np.clip(bgr[380:] * 1.10 + 8.0, 0, 255)  # ~+20 L, same chroma
    bgr = bgr.astype(np.uint8)
    # Skin stats sampled from BOTH lighting regimes, as a forehead+cheek
    # sample spanning shaded/lit skin would be: below-step is inside the
    # skin distribution even though the step itself is sharp.
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2Lab).astype(np.float64)
    patch = np.concatenate([lab[40:90, 150:250].reshape(-1, 3),
                            lab[420:470, 150:250].reshape(-1, 3)])
    mean, cov = patch.mean(axis=0), np.cov(patch.T)
    c = _canvas()
    # Sanity: the step really is gradient-hot (otherwise this tests nothing).
    low = cv2.GaussianBlur(
        cv2.cvtColor(bgr, cv2.COLOR_BGR2Lab)[..., 0].astype(np.float32),
        (0, 0), sigmaX=max(2.0, 0.02 * FH))
    grad = np.abs(cv2.Sobel(low, cv2.CV_32F, 0, 1, ksize=3)) / 8.0
    assert grad[380, 100:300].mean() > mask_v3.GARMENT_GRAD_FLOOR
    y = mask_v3.garment_boundary(bgr, c["neck_corridor"], CHIN_Y, FH,
                                 mean, cov)
    assert y is None


# --------------------------------------------------------------------------
# clipping + full-pipeline determinism
# --------------------------------------------------------------------------

def test_hysteresis_clipped_to_canvas():
    c = _canvas()
    growth = _empty()
    growth[100:451, 195:206] = True   # spills above the nose and past the floor
    seed = _empty()
    seed[300, 200] = True
    out = mask_v3.hysteresis_mask(growth, seed, _empty(), c["canvas"],
                                  c["face_region"] | c["silhouette_tube"])
    assert out[300, 200]
    assert not out[100, 200]          # above nose cut: outside canvas
    assert not out[450, 200]          # below corridor floor: outside canvas
    assert not out[~c["canvas"]].any()


def test_appearance_helpers_deterministic():
    c = _canvas()
    bgr = _skin_bgr()
    bgr[380:, :] = (30, 30, 30)
    cv2.line(bgr, (110, 350), (290, 350), (30, 25, 20), 4)
    mean, cov = _skin_stats(bgr)
    y1 = mask_v3.garment_boundary(bgr, c["neck_corridor"], CHIN_Y, FH,
                                  mean, cov)
    y2 = mask_v3.garment_boundary(bgr, c["neck_corridor"], CHIN_Y, FH,
                                  mean, cov)
    assert y1 == y2
    g1 = mask_v3.occluder_guard(bgr, c["canvas"], mean, cov, FW)
    g2 = mask_v3.occluder_guard(bgr, c["canvas"], mean, cov, FW)
    assert np.array_equal(g1, g2)
