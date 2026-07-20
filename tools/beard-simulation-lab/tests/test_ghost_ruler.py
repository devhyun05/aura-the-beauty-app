"""Ruler tests for GhostResidual, before it judges any eraser.

Synthetic images with answers known by construction: a hair faded to 30%
contrast must score r~0.30; healthy grain must not move the score; flattening
skin the candidates don't cover must not improve it; a lone mole must not be a
candidate at all.
"""

from __future__ import annotations

import cv2
import numpy as np
import pytest

from eval.ghost_ruler import (
    blackhat_maps, clean_thresholds, excess_map, find_candidates, score_result,
)

SHAPE = (360, 360)
FACE_W = 300.0
RNG = np.random.default_rng(11)


def _skin(grain: float = 3.0) -> np.ndarray:
    img = np.full((*SHAPE, 3), 150.0, np.float32)
    img += (RNG.standard_normal(SHAPE) * grain)[..., None]
    return np.clip(img, 0, 255).astype(np.uint8)


def _draw_hairs(img: np.ndarray, contrast: float, n: int = 24,
                y0: int = 200, y1: int = 340) -> np.ndarray:
    out = img.astype(np.float32).copy()
    rng = np.random.default_rng(5)
    for i in range(n):
        x = 30 + int(rng.integers(0, 300))
        y = y0 + int(rng.integers(0, y1 - y0 - 16))
        cv2.line(out, (x, y), (x + 3, y + 12), (150 - contrast,) * 3, 1)
    return np.clip(out, 0, 255).astype(np.uint8)


def _zone() -> np.ndarray:
    z = np.zeros(SHAPE, bool)
    z[190:350, 10:350] = True
    return z


def _clean() -> np.ndarray:
    c = np.zeros(SHAPE, bool)
    c[10:160, 10:350] = True
    return c


def _setup(orig: np.ndarray):
    maps = blackhat_maps(orig, FACE_W)
    thr = clean_thresholds(maps, _clean())
    e = excess_map(maps, thr)
    cands = find_candidates(e, _zone(), FACE_W)
    return thr, cands


def test_faded_hair_scores_its_residual_contrast() -> None:
    """100-contrast hairs faded to 30 must score r ~ 0.30, not 'texture ok'."""
    orig = _draw_hairs(_skin(), contrast=100.0)
    faded = _draw_hairs(_skin(), contrast=30.0)
    thr, cands = _setup(orig)
    assert len(cands) >= 15
    v = score_result(faded, cands, thr, FACE_W)
    assert v.weightedQ90R == pytest.approx(0.30, abs=0.08)
    assert v.survivalRate < 0.35


def test_full_erase_passes_and_untouched_fails() -> None:
    orig = _draw_hairs(_skin(), contrast=100.0)
    thr, cands = _setup(orig)
    erased = score_result(_skin(), cands, thr, FACE_W)
    untouched = score_result(orig, cands, thr, FACE_W)
    assert erased.weightedQ90R < 0.10 and erased.survivalRate < 0.05
    assert untouched.weightedQ90R > 0.9 and untouched.survivalRate > 0.9


def test_healthy_grain_does_not_move_the_score() -> None:
    """Re-grained skin (isotropic, clean-skin amplitude) is not a ghost."""
    orig = _draw_hairs(_skin(), contrast=100.0)
    thr, cands = _setup(orig)
    base = score_result(_skin(), cands, thr, FACE_W)
    grainy = _skin().astype(np.float32)
    grainy += (np.random.default_rng(7).standard_normal(SHAPE) * 3.0)[..., None]
    v = score_result(np.clip(grainy, 0, 255).astype(np.uint8), cands, thr, FACE_W)
    assert abs((v.weightedQ90R or 0) - (base.weightedQ90R or 0)) < 0.03


def test_flattening_skin_outside_candidates_does_not_help() -> None:
    """The score must reward erasing HAIRS, not destroying surrounding skin."""
    orig = _draw_hairs(_skin(), contrast=100.0)
    thr, cands = _setup(orig)
    same_hairs = _draw_hairs(_skin(), contrast=100.0)
    flattened = same_hairs.copy()
    cand_px = np.zeros(SHAPE, bool)
    for c in cands:
        cand_px[c.px[:, 0], c.px[:, 1]] = True
    keep = cv2.dilate(cand_px.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    flat = np.full_like(flattened, 150)
    flattened[~keep] = flat[~keep]
    v_before = score_result(same_hairs, cands, thr, FACE_W)
    v_after = score_result(flattened, cands, thr, FACE_W)
    assert (v_after.weightedQ90R or 0) >= (v_before.weightedQ90R or 0) - 0.05


def test_empty_candidates_is_none_not_pass() -> None:
    thr = {"strand": 5.0, "clump": 5.0}
    v = score_result(_skin(), [], thr, FACE_W)
    assert v.weightedQ90R is None and v.survivalRate is None


def test_lone_mole_is_not_a_candidate() -> None:
    """A round isolated dark spot in the zone is a mole; erasing it must never
    be what passes the gate."""
    img = _skin().astype(np.float32)
    cv2.circle(img, (180, 270), 4, (60, 60, 60), -1)   # round, dark, alone
    img = np.clip(img, 0, 255).astype(np.uint8)
    thr, cands = _setup(img)
    assert len(cands) == 0


def test_mole_among_stubble_is_kept() -> None:
    """The isolation rule must not delete candidates inside a stubble crowd."""
    img = _draw_hairs(_skin(), contrast=90.0, n=40)
    imgf = img.astype(np.float32)
    cv2.circle(imgf, (180, 270), 4, (60, 60, 60), -1)
    img = np.clip(imgf, 0, 255).astype(np.uint8)
    thr, cands = _setup(img)
    assert len(cands) >= 30
