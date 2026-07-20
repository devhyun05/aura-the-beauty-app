"""Positive/negative controls for the jaw-silhouette ruler (Codex #10).

Fully synthetic: a skin-bright face-like blob on a darker background whose
lower boundary IS the landmark jaw polyline (an ellipse arc placed at the
JAW_OVAL indices of a zero-filled (478,2) landmark array), plus seeded grain
and a global blur so the silhouette is a smooth, realistic edge. Every FROZEN
gate has a defect that MUST trip it and a clean input that MUST pass it; no
photo files are touched, so the suite runs on any machine.
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.detect_face import JAW_OVAL  # noqa: E402
from eval import silhouette_ruler as sr  # noqa: E402

FW = 280.0
SIZE = 420
CX, CY = 210, 170        # jaw ellipse centre
AX, BY = 140, 170        # semi-axes: jaw spans x 70..350, chin at y 340
SKIN = (150, 170, 205)   # BGR, gray ~178
BG = 45.0                # gray background
BLUR_SIGMA = 3.0         # edge profile ~sigma 3px: wide enough that a mild
#                          0.009*fw warp stays a SHIFT failure, not a shape one
NOISE_SIGMA = 4.0
CHIN_Y = 340.0


def _jaw_points(n: int) -> np.ndarray:
    """n points on the lower ellipse arc, left ear -> chin -> right ear."""
    t = np.linspace(np.pi, 0.0, n)
    return np.stack([CX + AX * np.cos(t), CY + BY * np.sin(t)],
                    axis=1).astype(np.float32)


def _landmarks() -> np.ndarray:
    lm = np.zeros((478, 2), np.float32)
    lm[JAW_OVAL] = _jaw_points(len(JAW_OVAL))
    return lm


def _face_mask() -> np.ndarray:
    """Filled face blob: dense jaw arc closed over the top."""
    poly = np.concatenate([_jaw_points(65),
                           [[CX + AX, 28.0], [CX - AX, 28.0]]])
    mask = np.zeros((SIZE, SIZE), np.uint8)
    cv2.fillPoly(mask, [np.round(poly).astype(np.int32)], 1)
    return mask


def _beard_ring(x_half: float | None) -> np.ndarray:
    """Beard straddling the silhouette: face boundary -12px (inside) to +5px
    (outside), so the tap window (+-7px) holds no skin/background edge and the
    residual beard->background step sits at +5px ~ 0.018*fw off the polyline."""
    face = _face_mask()
    k = cv2.getStructuringElement  # noqa: E731 shorthand
    inner = cv2.erode(face, k(cv2.MORPH_ELLIPSE, (25, 25)))    # -12px
    outer = cv2.dilate(face, k(cv2.MORPH_ELLIPSE, (11, 11)))   # +5px
    ring = (outer > 0) & (inner == 0)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    ring &= yy > CY - 5  # jaw only; keep the synthetic top closure clean
    if x_half is not None:
        ring &= np.abs(xx - CX) <= x_half
    return ring


def _render(beard_x_half: float | None = None,
            second_edge: bool = False) -> np.ndarray:
    """Deterministic fixture: fill, optional defect paint, ONE seeded grain
    field, global blur. Same seed everywhere so variants differ only where
    painted (byte-identical elsewhere after the shared blur support)."""
    rng = np.random.RandomState(20260711)
    noise = rng.normal(0.0, NOISE_SIGMA, (SIZE, SIZE, 3)).astype(np.float32)
    img = np.full((SIZE, SIZE, 3), BG, np.float32)
    img[_face_mask() > 0] = np.array(SKIN, np.float32)
    if second_edge:
        # Rival edge INSIDE the tap window: brighten the background strip
        # starting +6px below the contour over the central stretch. After the
        # global blur this yields two opposite-signed |profile| peaks ~6px
        # apart with comparable magnitude -> the dominance test must fire.
        d_out = cv2.distanceTransform(1 - _face_mask(), cv2.DIST_L2, 3)
        yy, xx = np.mgrid[0:SIZE, 0:SIZE]
        strip = (d_out > 6) & (d_out < 60) & (np.abs(xx - CX) <= 40) \
            & (yy > CY)
        img[strip] = 160.0
    if beard_x_half is not None:
        img[_beard_ring(beard_x_half)] = np.array((30, 30, 32), np.float32)
    img += noise
    img = cv2.GaussianBlur(img, (0, 0), BLUR_SIGMA)
    return np.clip(img, 0, 255).astype(np.uint8)


def _warp_out(img: np.ndarray, shift_px: float, half: float = 0.125 * FW,
              feather: float = 0.01 * FW) -> np.ndarray:
    """Push the chin contour outward (down) by shift_px over a central
    plateau of +-half with a raised-cosine feather; the y-weight plateau
    covers contour +- tap window so the local edge translates rigidly and the
    far background stays fixed (cv2.remap, spec control (a))."""
    h, w = img.shape[:2]
    xs = np.arange(w, dtype=np.float32)
    ys = np.arange(h, dtype=np.float32)
    wx = np.clip((half + feather - np.abs(xs - CX)) / feather, 0.0, 1.0)
    wx = 0.5 - 0.5 * np.cos(np.pi * wx)
    wy = np.clip((42.0 - np.abs(ys - (CHIN_Y - 4.0))) / 12.0, 0.0, 1.0)
    wy = 0.5 - 0.5 * np.cos(np.pi * wy)
    mapx = np.tile(xs, (h, 1))
    mapy = np.tile(ys[:, None], (1, w)) - shift_px * (wy[:, None] * wx[None, :])
    return cv2.remap(img, mapx.astype(np.float32), mapy.astype(np.float32),
                     cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def _contour_band(half_px: int) -> np.ndarray:
    band = np.zeros((SIZE, SIZE), np.uint8)
    pts = np.round(_jaw_points(65)).astype(np.int32)
    cv2.polylines(band, [pts], False, 1, thickness=2 * half_px + 1)
    return band


def _score(orig: np.ndarray, result: np.ndarray) -> dict:
    return sr.score_silhouette(orig, result, _landmarks(), FW)


# --- negative / identity controls -------------------------------------------

def test_identity_passes():
    img = _render()
    m = _score(img, img.copy())
    assert m["silhouetteVerdict"] == "pass", m
    assert m["jawShiftP95"] <= 0.0005, m
    assert m["jawProfileCorr"] >= 0.99, m
    assert m["supportFrac"] >= 0.90, m


def test_determinism():
    img = _render()
    res = _warp_out(img, 0.02 * FW)
    assert _score(img, res) == _score(img, res)


def test_color_only_shift_passes():
    # Spec control (b): interior brightness change, zero geometry change.
    # The lift is feathered with the SAME sigma as the fixture edge so the
    # added profile component is shape-identical -> corr stays ~1.
    img = _render()
    lift = cv2.GaussianBlur(_face_mask().astype(np.float32), (0, 0),
                            BLUR_SIGMA) * 25.0
    res = np.clip(img.astype(np.float32) + lift[..., None],
                  0, 255).astype(np.uint8)
    m = _score(img, res)
    assert m["silhouetteVerdict"] == "pass", m
    assert m["jawShiftP95"] <= sr.FROZEN["jawShiftP95Max"], m


# --- shift gates -------------------------------------------------------------

def test_warp_control_hard_fails():
    # Spec control (a): contour pushed out 0.02*fw over ~0.25*fw -> the shape
    # visibly changed; the shift hard gate MUST fire.
    img = _render()
    m = _score(img, _warp_out(img, 0.02 * FW))
    assert m["jawShiftP95"] > sr.FROZEN["jawShiftP95Hard"], m
    assert m["supportFrac"] >= sr.FROZEN["supportFracMin"], m
    assert m["silhouetteVerdict"] == "hard-fail", m


def test_mild_warp_abstains():
    # 0.009*fw sits in the (0.006, 0.012] uncertainty band: refuse, don't ship,
    # but don't call a sub-pixel-grade wobble a deformation either.
    img = _render()
    m = _score(img, _warp_out(img, 0.009 * FW))
    assert sr.FROZEN["jawShiftP95Max"] < m["jawShiftP95"] \
        <= sr.FROZEN["jawShiftP95Hard"], m
    assert m["silhouetteVerdict"] == "abstain", m


# --- profile-correlation gates ----------------------------------------------

def test_blur_edge_trips_corr():
    # Spec control (c): edge POSITION kept, profile flattened by blurring a
    # band around the contour. Shift stays ~0, so only the corr gate can see
    # it -> verdict must not be pass.
    # sigma 10 (measured sweep): sigma 8 still correlates 0.92 with the sharp
    # peak (window truncation), sigma >=11 flattens so far the peak locator
    # wanders to the window edge and the SHIFT hard gate fires first. At 10
    # corr=0.79 trips the corr gate with margin while shift stays sub-hard.
    img = _render()
    soft = cv2.GaussianBlur(img, (0, 0), 10.0)
    m = cv2.GaussianBlur(_contour_band(14).astype(np.float32), (0, 0),
                         2.0)[..., None]
    res = np.clip(img * (1.0 - m) + soft * m, 0, 255).astype(np.uint8)
    s = _score(img, res)
    assert s["jawProfileCorr"] < sr.FROZEN["jawProfileCorrMin"], s
    # position gate stays quiet(ish): a flattened peak wobbles sub-pixel but
    # never looks like a 0.012*fw deformation -- corr is the gate that fires.
    assert s["jawShiftP95"] <= sr.FROZEN["jawShiftP95Hard"], s
    assert s["silhouetteVerdict"] != "pass", s


def test_polarity_flip_hard_fails_corr():
    # Gray inverted in the contour band: peak position unchanged (|profile|
    # identical) but the SIGNED profile negates -> corr ~ -1, the clearest
    # "edge was rebuilt, not preserved" defect the hard corr gate exists for.
    img = _render()
    band = _contour_band(12) > 0
    res = img.copy()
    res[band] = 255 - res[band]
    m = _score(img, res)
    assert m["jawProfileCorr"] < sr.FROZEN["jawProfileCorrHard"], m
    assert m["silhouetteVerdict"] == "hard-fail", m


# --- hair-obscured classification + to-landmark gate --------------------------

def test_second_edge_classified_obscured():
    # Dominance positive control: a rival comparable edge 6px off the contour
    # must demote those points to hair-obscured (identity keeps nObscured 0
    # on the clean fixture per test_identity_passes' supportFrac bound).
    img = _render(second_edge=True)
    m = _score(img, img.copy())
    assert m["nObscured"] >= 10, m


def test_beard_good_reconstruction_passes():
    # Beard buries the central silhouette in ORIG; result restores skin up to
    # the landmark polyline exactly -> obscured points land on the polyline,
    # stable points untouched: the ruler must NOT punish correct erasing.
    orig, res = _render(beard_x_half=40), _render()
    m = _score(orig, res)
    assert m["nObscured"] >= 10, m
    assert m["jawToLandmarkP95"] <= sr.FROZEN["jawToLandmarkP95Max"], m
    assert m["silhouetteVerdict"] == "pass", m


def test_beard_bad_reconstruction_trips_to_landmark():
    # Same beard, but LaMa "rebuilt" the jaw 0.02*fw below the landmarks
    # (warp confined INSIDE the obscured stretch so stable metrics stay
    # clean): only jawToLandmarkP95 can catch this -> abstain, not pass.
    orig = _render(beard_x_half=40)
    res = _warp_out(_render(), 0.02 * FW, half=30.0)
    m = _score(orig, res)
    assert m["jawToLandmarkP95"] > sr.FROZEN["jawToLandmarkP95Max"], m
    assert m["silhouetteVerdict"] == "abstain", m


# --- support gates ------------------------------------------------------------

def test_full_beard_low_support_abstains():
    # Whole silhouette buried: even a perfect result cannot be verified
    # against the original -> supportFrac gate must force abstain.
    orig = _render(beard_x_half=1e9)  # ring everywhere along the jaw
    res = _render()
    m = _score(orig, res)
    assert m["supportFrac"] < sr.FROZEN["supportFracMin"], m
    assert m["silhouetteVerdict"] == "abstain", m


def test_tiny_crop_abstains():
    # Polyline almost entirely outside the crop -> <20 valid samples: the
    # ruler is blind and must say so (abstain, supportFrac 0), never pass.
    img = _render()
    crop = img[:60, :60]
    m = sr.score_silhouette(crop, crop.copy(), _landmarks(), FW)
    assert m["silhouetteVerdict"] == "abstain", m
    assert m["supportFrac"] == 0.0 and m["nStable"] == 0, m
