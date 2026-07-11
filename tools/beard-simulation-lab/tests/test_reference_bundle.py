"""Controls for the anchor reference bundle + normalized threshold transfer.

Fully synthetic (no sample photos): a 960px frame with a hand-built
478-landmark array where only the indices the module reads are meaningful.
fw=640 matches our selfie corpus (fw ~650) — the strand black-hat kernel is
then 7px, the regime the module documents as well-behaved.

Every QC gate has a positive control (a defect that MUST trip it) and the
clean fixture is the shared identity control. The mandated false-positive
proof (<= 1% excess area on hair-free skin) runs on three fixtures spanning
the spec's grain range (sigma 4..7) with strong illumination gradients.
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.detect_face import (  # noqa: E402
    BROW_MID,
    FACE_OVAL,
    FOREHEAD_MID,
    NOSE_BOTTOM,
    UPPER_CHEEKS,
)
from eval import reference_bundle as rb  # noqa: E402

FW = 640.0
SIZE = 960
SKIN_BGR = (150, 170, 205)

# Anchor geometry of the synthetic face (frame coords).
CHEEK_L = (300, 400)
CHEEK_R = (660, 400)
FOREHEAD_C = (480, 220)          # midpoint of FOREHEAD_MID and BROW_MID below
CHEEK_RAD = int(0.045 * FW)      # 28
FOREHEAD_RAD = int(0.04 * FW)    # 25


def _landmarks() -> np.ndarray:
    """478 landmarks; only the indices reference_bundle reads are meaningful.
    Face oval = ellipse with x-extent exactly FW so face_width is honest."""
    lm = np.zeros((478, 2), np.float32)
    for i, idx in enumerate(FACE_OVAL):
        t = 2.0 * np.pi * i / len(FACE_OVAL)
        lm[idx] = (480 + 320 * np.cos(t), 480 + 400 * np.sin(t))
    lm[UPPER_CHEEKS[0]] = CHEEK_L
    lm[UPPER_CHEEKS[1]] = CHEEK_R
    lm[FOREHEAD_MID] = (480, 180)
    lm[BROW_MID] = (480, 260)     # forehead disk (r=25 at y=220) stays above
    lm[NOSE_BOTTOM] = (480, 520)  # cheek disks (y<=428) stay above
    return lm


def _fixture(seed: int, noise_sigma: float, grad_amp: float) -> np.ndarray:
    """Hair-free skin per the spec: base tone + per-pixel grain (sigma 4..7)
    + strong illumination gradient + 1-2px pore dots, depth 6-10 L, ~1.5%."""
    rng = np.random.RandomState(seed)
    base = np.full((SIZE, SIZE, 3), SKIN_BGR, np.float32)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
    base += (grad_amp * (xx / SIZE - 0.5)
             + 0.6 * grad_amp * (yy / SIZE - 0.5))[..., None]
    base += rng.normal(0, noise_sigma, base.shape).astype(np.float32)
    n_pores = int(0.015 * SIZE * SIZE / 2)   # each pore covers 1-4 px
    for _ in range(n_pores):
        y, x = rng.randint(2, SIZE - 2), rng.randint(2, SIZE - 2)
        depth, r = rng.uniform(6, 10), rng.randint(1, 3)
        base[y:y + r, x:x + r] -= depth
    return np.clip(base, 0, 255).astype(np.uint8)


def _whiteout(img: np.ndarray, center: tuple[int, int], rad: int) -> None:
    """Clip a whole patch to specular white — the clipping QC must drop it."""
    x, y = center
    img[y - rad - 2:y + rad + 3, x - rad - 2:x + rad + 3] = 255


FP_FIXTURES = ((1, 4.0, 30.0), (2, 5.5, 45.0), (3, 7.0, 60.0))


# ------------------------------------------------------------------ ladder --

def test_level1_both_cheeks_and_anchor_placement():
    img = _fixture(2, 5.5, 45.0)
    lm = _landmarks()
    b = rb.build_reference_bundle(img, lm, FW)
    assert b is not None
    assert b.ladder_level == 1
    assert b.patches_used == ["cheek_left", "cheek_right"]
    assert not b.single_anchor
    assert b.n_valid >= rb.nmin_for(FW)
    assert b.n_valid == int(b.anchor_mask_full.sum()) == len(b.lab_pixels)
    assert b.lab_pixels.dtype == np.float32
    assert b.lab_mean.shape == (3,) and b.lab_cov.shape == (3, 3)
    # Placement: every anchor pixel inside one of the cheek disks, above the
    # nose-bottom line (level 1 never touches the forehead).
    ys, xs = np.nonzero(b.anchor_mask_full)
    assert ys.max() < lm[NOSE_BOTTOM][1]
    d_l = np.hypot(ys - CHEEK_L[1], xs - CHEEK_L[0])
    d_r = np.hypot(ys - CHEEK_R[1], xs - CHEEK_R[0])
    assert (np.minimum(d_l, d_r) <= CHEEK_RAD + 1).all()


def test_lab_pixels_use_opencv_uint8_convention():
    img = _fixture(2, 5.5, 45.0)
    b = rb.build_reference_bundle(img, _landmarks(), FW)
    ref = cv2.cvtColor(np.full((1, 1, 3), SKIN_BGR, np.uint8),
                       cv2.COLOR_BGR2Lab)[0, 0].astype(np.float32)
    assert np.abs(b.lab_mean[0] - ref[0]) < 10.0   # L: gradient + pores drift
    assert np.abs(b.lab_mean[1:] - ref[1:]).max() < 5.0


def test_clipped_cheek_rescued_by_forehead_level2():
    # Mild gradient: the forehead verification is a Mahalanobis <= 3 check
    # against the cheek model (sigma = grain MAD ~3 L), so a strong shading
    # difference between forehead and cheek CORRECTLY fails it (measured:
    # grad 45/960px -> ~14 L offset -> inlier frac 0.06). Rescue is only for
    # foreheads that really are the same skin under the same light.
    img = _fixture(2, 5.5, 10.0)
    _whiteout(img, CHEEK_L, CHEEK_RAD)   # specular blowout on one cheek
    b = rb.build_reference_bundle(img, _landmarks(), FW)
    assert b is not None
    assert b.ladder_level == 2
    assert b.patches_used == ["cheek_right", "forehead"]
    assert not b.single_anchor


def test_forehead_inlier_rejection_forces_abstain():
    """Off-skin forehead (bangs stand-in: plausible texture, wrong color) must
    fail the cheek-model verification, and with one cheek dead the remaining
    lone cheek is below Nmin -> None. The level-2 test above is the control:
    same dead cheek, honest forehead, and the bundle survives."""
    rng = np.random.RandomState(99)
    img = _fixture(2, 5.5, 10.0)
    _whiteout(img, CHEEK_L, CHEEK_RAD)
    x, y, r = *FOREHEAD_C, FOREHEAD_RAD + 4
    region = img[y - r:y + r, x - r:x + r].astype(np.float32)
    region[:] = (80.0, 190.0, 110.0)                  # green: far in Lab
    region += rng.normal(0, 5.5, region.shape)        # keep coherence/QC quiet
    img[y - r:y + r, x - r:x + r] = np.clip(region, 0, 255).astype(np.uint8)
    assert rb.build_reference_bundle(img, _landmarks(), FW) is None


def test_abstain_when_both_cheeks_dead():
    """No cheeks -> forehead is unverifiable -> None. There must be no
    complement-of-zone (or forehead-only) escape hatch."""
    img = _fixture(2, 5.5, 45.0)
    _whiteout(img, CHEEK_L, CHEEK_RAD)
    _whiteout(img, CHEEK_R, CHEEK_RAD)
    assert rb.build_reference_bundle(img, _landmarks(), FW) is None


def test_nmin_geometric_enforcement():
    """One healthy cheek + dead forehead: ~0.0054*fw^2 valid px < Nmin =
    0.008*fw^2, so the builder must abstain rather than serve a thin anchor."""
    img = _fixture(2, 5.5, 45.0)
    _whiteout(img, CHEEK_L, CHEEK_RAD)
    _whiteout(img, FOREHEAD_C, FOREHEAD_RAD)
    assert rb.build_reference_bundle(img, _landmarks(), FW) is None


def test_coherent_stripes_trip_the_coherence_qc():
    """Directional structure (hair wisp crossing the cheek) must be dropped by
    the coherence gate, demoting the bundle to the forehead rescue level."""
    img = _fixture(2, 5.5, 10.0)   # mild gradient: forehead must be verifiable
    x, y, r = *CHEEK_L, CHEEK_RAD + 2
    for row in range(y - r, y + r, 3):
        cv2.line(img, (x - r, row), (x + r, row), (60, 70, 90), 1)
    b = rb.build_reference_bundle(img, _landmarks(), FW)
    assert b is not None
    assert b.ladder_level == 2
    assert "cheek_left" not in b.patches_used


def test_ladder_level3_single_anchor_direct():
    """Level 3 is geometrically unreachable with the spec disk radii (a lone
    cheek holds ~0.0064*fw^2 < 0.008*fw^2), so the branch is proven directly:
    it must fire only when the lone cheek clears Nmin, and must flag itself."""
    nmin = rb.nmin_for(FW)   # 3276.8
    assert rb.select_patch_ladder(
        {"cheek_left": 5000, "cheek_right": 0}, False, nmin) \
        == (3, ["cheek_left"], True)
    # Below Nmin: abstain, never a thin single anchor.
    assert rb.select_patch_ladder(
        {"cheek_left": 3000, "cheek_right": 0}, False, nmin) is None


def test_ladder_share_rule_and_ordering():
    nmin = rb.nmin_for(FW)
    # Balanced cheeks -> level 1.
    assert rb.select_patch_ladder(
        {"cheek_left": 2000, "cheek_right": 1800}, True, nmin)[0] == 1
    # One starved cheek (<25% share) invalidates level 1; verified forehead
    # rescues at level 2 with the HEALTHY cheek.
    assert rb.select_patch_ladder(
        {"cheek_left": 5000, "cheek_right": 300, "forehead": 2000},
        True, nmin) == (2, ["cheek_left", "forehead"], False)
    # Same but no forehead: falls through to single-anchor level 3.
    assert rb.select_patch_ladder(
        {"cheek_left": 5000, "cheek_right": 300}, False, nmin) \
        == (3, ["cheek_left"], True)
    # Unverified forehead pixels must not count, whatever the dict says.
    assert rb.select_patch_ladder(
        {"cheek_left": 5000, "cheek_right": 0, "forehead": 2000},
        False, nmin) == (3, ["cheek_left"], True)


def test_bundle_determinism():
    img = _fixture(3, 7.0, 60.0)
    a = rb.build_reference_bundle(img, _landmarks(), FW)
    b = rb.build_reference_bundle(img.copy(), _landmarks(), FW)
    assert a.lab_pixels.tobytes() == b.lab_pixels.tobytes()
    assert np.array_equal(a.anchor_mask_full, b.anchor_mask_full)
    assert a.patches_used == b.patches_used and a.ladder_level == b.ladder_level


# ------------------------------------------- normalized-excess transfer -----

def _bundle_and_stats(img: np.ndarray):
    lm = _landmarks()
    bundle = rb.build_reference_bundle(img, lm, FW)
    assert bundle is not None
    return bundle, rb.anchor_blackhat_stats(img, lm, FW, bundle)


def test_false_positive_bound_on_hair_free_fixtures():
    """MANDATORY proof: on hair-free skin (grain + gradient + pores) the
    excess map must fire on <= 1% of pixels. Pores are the trap — depth 6-10
    dots are exactly what a naive threshold reads as stubble."""
    for seed, ns, ga in FP_FIXTURES:
        img = _fixture(seed, ns, ga)
        _, stats = _bundle_and_stats(img)
        exc = rb.normalized_excess(img, FW, stats)
        assert exc.dtype == np.float32
        frac = float((exc > 0).mean())
        assert frac <= 0.01, (seed, ns, ga, frac)


def test_dark_strands_fire_on_crop():
    """Positive control: depth-60 strands (spec floor is 40) must light up on
    >50% of their own pixels — scored on a CROP whose origin differs from the
    full frame the anchor stats came from (normalization is local)."""
    img = _fixture(2, 5.5, 45.0)
    _, stats = _bundle_and_stats(img)
    res = img.copy()
    strand = np.zeros((SIZE, SIZE), np.uint8)
    tone = tuple(c - 60 for c in SKIN_BGR)
    for x in range(240, 720, 24):
        cv2.line(res, (x, 560), (x + 12, 680), tone, 1)
        cv2.line(strand, (x, 560), (x + 12, 680), 1, 1)
    crop = res[500:900, 200:760]
    smask = strand[500:900, 200:760] > 0
    exc = rb.normalized_excess(crop, FW, stats)
    assert exc.shape == crop.shape[:2]
    hit = float((exc[smask] > 0).mean())
    assert hit > 0.5, hit
    # And the same crop without strands stays quiet (identity control).
    exc0 = rb.normalized_excess(img[500:900, 200:760], FW, stats)
    assert float((exc0 > 0).mean()) <= 0.01


def test_zmap_determinism():
    img = _fixture(1, 4.0, 30.0)
    _, stats = _bundle_and_stats(img)
    e1 = rb.normalized_excess(img, FW, stats)
    e2 = rb.normalized_excess(img.copy(), FW, stats)
    assert e1.tobytes() == e2.tobytes()


def test_bin_fallback_flags_low_conf():
    """A thin anchor (150 px cannot give 4 bins of 100) must fall back to the
    global stats on the starved bins and say so."""
    img = _fixture(2, 5.5, 45.0)
    mask = np.zeros((SIZE, SIZE), bool)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    mask[(yy - 400) ** 2 + (xx - 300) ** 2 <= 7 ** 2] = True   # ~150 px
    thin = rb.ReferenceBundle(
        anchor_mask_full=mask,
        lab_pixels=np.zeros((int(mask.sum()), 3), np.float32),
        lab_mean=np.zeros(3, np.float32), lab_cov=np.eye(3, dtype=np.float32),
        n_valid=int(mask.sum()), patches_used=["cheek_left"],
        ladder_level=3, single_anchor=True)
    stats = rb.anchor_blackhat_stats(img, _landmarks(), FW, thin)
    assert stats.any_low_conf
    for s in stats.scales.values():
        # Invariant: low_conf exactly where the bin is starved, and starved
        # bins carry the global stats.
        assert np.array_equal(s.bin_low_conf, s.bin_n < 100)
        assert s.bin_low_conf.any()
        assert (s.bin_med[s.bin_low_conf] == s.global_med).all()
        assert (s.bin_sigma[s.bin_low_conf] == s.global_sigma).all()


def test_healthy_bins_do_not_flag_low_conf():
    img = _fixture(2, 5.5, 45.0)
    _, stats = _bundle_and_stats(img)
    for s in stats.scales.values():
        assert np.array_equal(s.bin_low_conf, s.bin_n < 100)
        assert (~s.bin_low_conf).any()   # the fixture must feed real bins


# ------------------------------------------------- grain reference ring -----

def test_grain_reference_ring_geometry():
    shape = (200, 200)
    fw = 100.0   # ring = 3..10 px outside the edit
    edit = np.zeros(shape, bool)
    edit[80:120, 80:120] = True
    evidence = np.zeros(shape, bool)
    evidence[100, 74] = True   # dist 6: inside the ring, but it is evidence
    ring = rb.grain_reference_mask(edit, evidence, shape, fw)
    assert ring.dtype == np.bool_
    assert not ring[edit].any()          # never inside the edit
    assert not ring[100, 78]             # dist 2 < 0.03*fw: edit halo
    assert ring[100, 73]                 # dist 7: in the ring
    assert ring[74, 100]                 # symmetric ring pixel
    assert not ring[100, 74]             # evidence is excluded
    assert not ring[100, 60]             # dist 20 > 0.10*fw: too far


def test_grain_reference_ring_guards():
    shape = (64, 64)
    empty = np.zeros(shape, bool)
    assert not rb.grain_reference_mask(empty, empty, shape, 100.0).any()
    try:
        rb.grain_reference_mask(np.zeros((32, 32), bool), empty, shape, 100.0)
        assert False, "shape mismatch must raise"
    except ValueError:
        pass
