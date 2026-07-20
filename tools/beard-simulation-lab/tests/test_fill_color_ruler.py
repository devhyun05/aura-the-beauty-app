"""Positive controls for the fill-color (chroma harmony) ruler — Codex #10.

Synthetic skin fixture with an illumination gradient + grain, edit-mask blob
in the middle. The FROZEN thresholds in eval/fill_color_ruler.py were
calibrated on THESE controls only, then frozen: identity passes with margin,
the LaMa-signature defects (neutral pull, warm cast) trip, and a shared
illumination gradient must NOT trip (the affine ring plane absorbs it — a
naive ring-mean reference would fail that control). No file/model
dependencies; fully synthetic, runs on any machine.
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from eval import fill_color_ruler as fc  # noqa: E402

FW = 320.0
SIZE = 400


def _fixture():
    """Skin-toned frame, illumination gradient + grain, central fill blob."""
    rng = np.random.RandomState(20260711)
    base = np.full((SIZE, SIZE, 3), (150, 170, 205), np.float32)  # BGR tan
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
    base += ((yy / SIZE * 24 - 12) + (xx / SIZE * 10 - 5))[..., None]
    base += rng.normal(0, 5, base.shape).astype(np.float32)  # grain
    orig = np.clip(base, 0, 255).astype(np.uint8)

    edit_mask = np.zeros((SIZE, SIZE), bool)
    edit_mask[150:300, 80:320] = True
    exclude = np.zeros((SIZE, SIZE), bool)
    return orig, edit_mask, exclude


def _lab_edit(img: np.ndarray, mask: np.ndarray, fn) -> np.ndarray:
    """Apply fn to the float uint8-Lab rows of img inside mask."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2Lab).astype(np.float32)
    lab[mask] = fn(lab[mask])
    return cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8),
                        cv2.COLOR_Lab2BGR)


# ---------------------------------------------------------------- control a
def test_identity_passes():
    orig, em, ex = _fixture()
    m = fc.score_fill_color(orig, orig.copy(), em, ex, FW)
    assert m["fillColorVerdict"] == "pass", m
    assert m["fillColorLowConf"] is False
    assert m["fillDeltaAb50"] <= 0.5, m  # ~0: plane matches its own skin


# ---------------------------------------------------------------- control b
def test_neutral_pull_trips_process_hard_stop():
    """50% pull of a,b toward 128 inside the fill = the LaMa gray skew."""
    orig, em, ex = _fixture()
    res = _lab_edit(orig, em, lambda v: np.concatenate(
        [v[:, :1], 128.0 + (v[:, 1:] - 128.0) * 0.5], axis=1))
    m = fc.score_fill_color(orig, res, em, ex, FW)
    assert m["fillColorVerdict"] == "abstain" and m["neutralPull50"] > 2.0, (
        "PROCESS HARD-STOP: the 50% neutral-pull control did not trip the "
        "fill-color ruler. The chroma gate is decoration — stop the pipeline "
        f"and recalibrate before any real run. metrics={m}")
    assert m["fillDeltaAb50"] > fc.FROZEN["fillDeltaAb50Max"], m


# ---------------------------------------------------------------- control c
def test_warm_cast_trips_delta_ab():
    """+6 Lab-a cast inside the fill must trip the fillDeltaAb gates."""
    orig, em, ex = _fixture()
    res = _lab_edit(orig, em,
                    lambda v: v + np.array([0.0, 6.0, 0.0], np.float32))
    m = fc.score_fill_color(orig, res, em, ex, FW)
    assert m["fillDeltaAb50"] > fc.FROZEN["fillDeltaAb50Max"], m
    assert m["fillColorVerdict"] == "abstain", m


# ---------------------------------------------------------------- control d
def test_shared_illumination_gradient_passes():
    """Same strong multiplicative light ramp on fill AND ring, no new chroma
    story: the affine plane must absorb it (a naive ring-mean would abstain
    here, charging the lighting to the fill)."""
    orig, em, ex = _fixture()
    xx = np.mgrid[0:SIZE, 0:SIZE][1].astype(np.float32)
    ramp = (0.75 + 0.5 * xx / SIZE)[..., None]
    res = np.clip(orig.astype(np.float32) * ramp, 0, 255).astype(np.uint8)
    m = fc.score_fill_color(orig, res, em, ex, FW)
    assert m["fillColorVerdict"] == "pass", m
    assert m["fillDeltaAb50"] <= 1.5, m


# ---------------------------------------------------------------- control e
def test_ring_starvation_is_low_conf_abstain():
    """Tiny isolated component whose ring is fully excluded: lowConf abstain,
    no numbers, no crash."""
    orig, _, _ = _fixture()
    em = np.zeros((SIZE, SIZE), bool)
    em[200:212, 200:212] = True  # 144 px: above the 64 px floor
    ex = cv2.dilate(em.astype(np.uint8), np.ones((61, 61), np.uint8)) > 0
    ex &= ~em  # exclude the entire 0.02..0.08*fw ring band
    m = fc.score_fill_color(orig, orig.copy(), em, ex, FW)
    assert m["fillColorLowConf"] is True, m
    assert m["fillColorVerdict"] == "abstain", m
    assert m["fillDeltaAb50"] is None and m["fillColorCorePx"] == 0, m


# ---------------------------------------------------------------- control f
def test_determinism():
    orig, em, ex = _fixture()
    res = _lab_edit(orig, em,
                    lambda v: v + np.array([0.0, 6.0, 0.0], np.float32))
    m1 = fc.score_fill_color(orig, res, em, ex, FW)
    m2 = fc.score_fill_color(orig, res, em, ex, FW)
    assert m1 == m2, (m1, m2)


# ------------------------------------------------------------------- extras
def test_anchor_cov_regularizes_not_replaces():
    """anchor_cov widens the covariance (25% weight) — distances shrink, an
    identity photo still passes, and the dict shape is unchanged."""
    orig, em, ex = _fixture()
    plain = fc.score_fill_color(orig, orig.copy(), em, ex, FW)
    anch = fc.score_fill_color(orig, orig.copy(), em, ex, FW,
                               anchor_cov=np.eye(2) * 25.0)
    assert anch["fillColorVerdict"] == "pass", anch
    assert anch["fillColorD90"] <= plain["fillColorD90"] + 1e-9, (plain, anch)
    assert set(anch) == set(plain)


def test_sub_floor_components_ignored():
    """A lone < 64 px speck yields no evidence: abstain + lowConf, no crash."""
    orig, _, _ = _fixture()
    em = np.zeros((SIZE, SIZE), bool)
    em[200:206, 200:206] = True  # 36 px
    m = fc.score_fill_color(orig, orig.copy(), em,
                            np.zeros((SIZE, SIZE), bool), FW)
    assert m["fillColorVerdict"] == "abstain", m
    assert m["fillColorLowConf"] is True and m["fillColorCorePx"] == 0, m
