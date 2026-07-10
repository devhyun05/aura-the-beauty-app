"""Tests for the waxiness ruler, before it is used to judge anything.

Every measurement bug that cost time on this project lived in the ruler, not in
the thing being measured. So the ratio is pinned against synthetic images whose
answer is known by construction: same texture on both sides -> 1.0, flat zone ->
0.0, double-amplitude zone -> 2.0.
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.texture import (
    chroma_delta_ab, coherence_map, grain_map, streak_score, waxiness_score,
)

# Landmarks only need the three indices clean_skin_mask reads.
FOREHEAD_MID, BROW_MID, UPPER_CHEEKS = 151, 9, (117, 346)
SHAPE = (240, 240)
FACE_W = 200.0  # -> patch radius 10


def _landmarks() -> np.ndarray:
    """Put the clean-skin disks in the TOP strip, the zone in the BOTTOM."""
    lm = np.zeros((468, 2), np.float32)
    lm[FOREHEAD_MID] = (120, 30)
    lm[BROW_MID] = (120, 30)
    lm[UPPER_CHEEKS[0]] = (60, 30)
    lm[UPPER_CHEEKS[1]] = (180, 30)
    return lm


def _zone() -> np.ndarray:
    z = np.zeros(SHAPE, bool)
    z[150:230, 30:210] = True
    return z


def _canvas(top_amp: float, zone_amp: float, seed: int = 7) -> np.ndarray:
    """Uniform grey with band-limited noise: `top_amp` everywhere, `zone_amp`
    inside the zone (the zone's noise replaces, not adds)."""
    rng = np.random.default_rng(seed)
    base = np.full((*SHAPE, 3), 140.0, np.float32)
    noise = rng.standard_normal(SHAPE).astype(np.float32)
    field = base + (noise * top_amp)[..., None]
    z = _zone()
    zone_noise = rng.standard_normal(SHAPE).astype(np.float32)
    field[z] = (base + (zone_noise * zone_amp)[..., None])[z]
    return np.clip(field, 0, 255).astype(np.uint8)


def test_equal_texture_scores_one() -> None:
    score = waxiness_score(_canvas(6.0, 6.0), _zone(), _landmarks(), FACE_W)
    assert score == pytest.approx(1.0, abs=0.15)


def test_flat_zone_scores_near_zero() -> None:
    """The waxy face: zone flattened, clean skin untouched."""
    score = waxiness_score(_canvas(6.0, 0.0), _zone(), _landmarks(), FACE_W)
    assert score is not None and score < 0.1


def test_double_amplitude_zone_scores_two() -> None:
    """Hair still present reads ABOVE 1.0 -- the metric is two-sided."""
    score = waxiness_score(_canvas(6.0, 12.0), _zone(), _landmarks(), FACE_W)
    assert score == pytest.approx(2.0, abs=0.2)


def test_score_is_monotone_in_zone_amplitude() -> None:
    lm, z = _landmarks(), _zone()
    scores = [waxiness_score(_canvas(6.0, a), z, lm, FACE_W) for a in (1.0, 3.0, 6.0, 10.0)]
    assert all(a < b for a, b in zip(scores, scores[1:]))


def test_empty_zone_is_none_not_zero() -> None:
    """An undefined ratio is not a perfect score; a silent 0.0 averaged across
    photos would hide the very failure this metric exists to catch."""
    empty = np.zeros(SHAPE, bool)
    assert waxiness_score(_canvas(6.0, 6.0), empty, _landmarks(), FACE_W) is None
    assert chroma_delta_ab(_canvas(6.0, 6.0), empty, _landmarks(), FACE_W) is None


def test_flat_clean_skin_is_none_not_infinity() -> None:
    """No reference grain -> the ratio is undefined, not enormous."""
    flat = np.full((*SHAPE, 3), 140, np.uint8)
    assert waxiness_score(flat, _zone(), _landmarks(), FACE_W) is None


def test_grain_map_is_zero_on_a_flat_image() -> None:
    assert grain_map(np.full((*SHAPE, 3), 140, np.uint8)).max() == pytest.approx(0.0, abs=1e-4)


def test_waxiness_is_not_fooled_by_a_darker_zone() -> None:
    """The confound that made the ORIGINAL psd05 score 0.32, as if its stubble
    were already erased: the beard zone is darker than the forehead, and absolute
    grain scales with brightness. Same texture CONTRAST must score 1.0 in both."""
    lm, z = _landmarks(), _zone()
    img = _canvas(6.0, 6.0).astype(np.float32)
    img[z] *= 0.5           # half as bright, and its noise halves with it
    dark = np.clip(img, 0, 255).astype(np.uint8)

    assert waxiness_score(dark, z, lm, FACE_W) == pytest.approx(1.0, abs=0.2)
    # the absolute-grain version this replaced would have scored ~0.5
    ratio = np.median(grain_map(dark)[z]) / np.median(grain_map(dark)[~z][:1000])
    assert ratio < 0.75


def test_streak_score_separates_a_smear_from_isotropic_grain() -> None:
    """Waxiness counts an inpainting streak as texture. Coherence does not."""
    lm, z = _landmarks(), _zone()
    grainy = _canvas(6.0, 6.0)
    assert streak_score(grainy, z, lm, FACE_W) == pytest.approx(1.0, abs=0.3)

    streaked = _canvas(6.0, 0.0).astype(np.float32)   # flat zone...
    cols = np.arange(SHAPE[1], dtype=np.float32)
    stripes = 10.0 * np.sin(cols / 1.7)[None, :]      # ...plus vertical stripes
    streaked[z] = (streaked + stripes[..., None])[z]
    streaked = np.clip(streaked, 0, 255).astype(np.uint8)
    assert streak_score(streaked, z, lm, FACE_W) > 1.8


def test_coherence_is_bounded_and_low_on_noise() -> None:
    c = coherence_map(_canvas(6.0, 6.0))
    assert c.min() >= 0.0 and c.max() <= 1.0 + 1e-5
    assert float(np.median(c)) < 0.75  # isotropic noise is not directional


def test_chroma_delta_ignores_luminance_but_sees_a_cast() -> None:
    """L differs across a face by shading; only a/b carry the beard's cast."""
    lm, z = _landmarks(), _zone()
    darker = _canvas(6.0, 6.0)
    darker[z] = np.clip(darker[z].astype(np.int16) - 40, 0, 255).astype(np.uint8)
    assert chroma_delta_ab(darker, z, lm, FACE_W) < 4.0  # pure luminance shift

    blue = _canvas(6.0, 6.0)
    blue[..., 0][z] = np.clip(blue[..., 0][z].astype(np.int16) + 40, 0, 255).astype(np.uint8)
    assert chroma_delta_ab(blue, z, lm, FACE_W) > 8.0    # bluish cast
