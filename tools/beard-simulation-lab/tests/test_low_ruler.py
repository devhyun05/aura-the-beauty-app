"""Ruler tests for the low-band stain metric, before it judges any eraser.

Synthetic images with answers known by construction: a stain half-lifted must
score ~0.5; untouched ~1.0; fully lifted ~0; flat-white past S must trip
overLift while stainResidual reads 0 (two-sided, anti-gaming); a too-small
stain is N/A, never a pass; flattening an anatomy fold must crash
structure_preservation while a pure brightness shift must not.
"""

from __future__ import annotations

import cv2
import numpy as np

from eval.ghost_ruler import (
    LowVerdict, low_lab, score_low_band, structure_preservation,
)

SHAPE = (360, 360)
FACE_W = 300.0
RECT = (slice(140, 260), slice(80, 280))   # stain plateau, comfortably > 64px


def _flat(value: float = 150.0) -> np.ndarray:
    return np.full((*SHAPE, 3), value, np.float32)


def _with_stain(depth: float) -> np.ndarray:
    """Skin with a smooth low-band stain `depth` BGR units deep."""
    img = _flat()
    img[RECT] -= depth
    img = cv2.GaussianBlur(img, (0, 0), 12.0)
    return np.clip(img, 0, 255).astype(np.uint8)


def _zone() -> np.ndarray:
    z = np.zeros(SHAPE, bool)
    z[120:280, 60:300] = True
    return z


def _setup(depth: float = 24.0):
    clean = np.clip(_flat(), 0, 255).astype(np.uint8)
    orig = _with_stain(depth)
    s_lab = low_lab(clean, FACE_W)
    o_l = low_lab(orig, FACE_W)[..., 0]
    stain = (s_lab[..., 0] - o_l) > 2.0
    return clean, orig, s_lab[..., 0], s_lab[..., 1:], o_l, stain & _zone()


def test_untouched_stain_scores_one() -> None:
    clean, orig, s_l, s_ab, o_l, stain = _setup()
    v = score_low_band(orig, s_l, o_l, stain, _zone(), FACE_W, s_ab)
    assert v.stainPx > 5000
    assert 0.85 <= v.stainResidual <= 1.05
    assert v.stainQ90R > 0.85


def test_half_lifted_stain_scores_half() -> None:
    clean, orig, s_l, s_ab, o_l, stain = _setup(depth=24.0)
    half = _with_stain(12.0)
    v = score_low_band(half, s_l, o_l, stain, _zone(), FACE_W, s_ab)
    assert abs(v.stainResidual - 0.5) < 0.12
    assert abs(v.stainQ90R - 0.5) < 0.15


def test_fully_lifted_stain_scores_zero_without_overlift() -> None:
    clean, orig, s_l, s_ab, o_l, stain = _setup()
    v = score_low_band(clean, s_l, o_l, stain, _zone(), FACE_W, s_ab)
    assert v.stainResidual < 0.05
    assert v.overLiftQ90 < 1.0


def test_flat_white_trips_overlift_not_residual() -> None:
    """Brightening PAST S games stainResidual to 0; overLift must catch it."""
    clean, orig, s_l, s_ab, o_l, stain = _setup()
    white = clean.astype(np.float32)
    white[_zone()] += 15.0
    white = np.clip(white, 0, 255).astype(np.uint8)
    v = score_low_band(white, s_l, o_l, stain, _zone(), FACE_W, s_ab)
    assert v.stainResidual < 0.05
    assert v.overLiftQ90 > 8.0


def test_untouched_original_never_trips_overlift() -> None:
    """S undershooting bright skin must not charge the (non-)edit: only NEW
    overshoot counts. Untouched original vs a too-dark S -> overLift ~ 0."""
    clean, orig, s_l, s_ab, o_l, stain = _setup()
    s_dark = s_l - 10.0                     # S wrongly darker than real skin
    v = score_low_band(orig, s_dark, o_l, stain, _zone(), FACE_W)
    assert v.overLiftQ90 < 0.5


def test_small_stain_is_none_not_pass() -> None:
    clean, orig, s_l, s_ab, o_l, stain = _setup()
    tiny = np.zeros(SHAPE, bool)
    tiny[150:154, 100:104] = True
    v = score_low_band(clean, s_l, o_l, stain & tiny, _zone(), FACE_W)
    assert v.stainResidual is None and v.stainQ90R is None


def test_chroma_residual_orders_correctly() -> None:
    """A result keeping the stain's color cast must score worse ab than clean."""
    clean, orig, s_l, s_ab, o_l, stain = _setup()
    tinted = clean.astype(np.float32)
    tinted[RECT][..., 0] += 14.0    # blue cast inside the stain area
    tinted = np.clip(cv2.GaussianBlur(tinted, (0, 0), 12.0), 0, 255).astype(np.uint8)
    v_clean = score_low_band(clean, s_l, o_l, stain, _zone(), FACE_W, s_ab)
    v_tint = score_low_band(tinted, s_l, o_l, stain, _zone(), FACE_W, s_ab)
    assert v_tint.abResidualQ90 > v_clean.abResidualQ90 + 2.0


def _fold_image() -> np.ndarray:
    """Skin with a dark horizontal fold (anatomy, not beard)."""
    img = _flat()
    img[196:204, 60:300] -= 30.0
    img = cv2.GaussianBlur(img, (0, 0), 4.0)
    return np.clip(img, 0, 255).astype(np.uint8)


def _band() -> np.ndarray:
    b = np.zeros(SHAPE, bool)
    b[180:220, 60:300] = True
    return b


def test_structure_identity_and_brightness_shift_score_high() -> None:
    orig = _fold_image()
    assert structure_preservation(orig, orig, _band(), FACE_W) > 0.95
    brighter = np.clip(orig.astype(np.float32) + 10.0, 0, 255).astype(np.uint8)
    assert structure_preservation(orig, brighter, _band(), FACE_W) > 0.9


def test_structure_flattened_fold_scores_low() -> None:
    orig = _fold_image()
    flat = np.clip(_flat(), 0, 255).astype(np.uint8)
    assert structure_preservation(orig, flat, _band(), FACE_W) < 0.5


def test_structure_small_band_is_none() -> None:
    orig = _fold_image()
    tiny = np.zeros(SHAPE, bool)
    tiny[200:203, 100:110] = True
    assert structure_preservation(orig, orig, tiny, FACE_W) is None
