"""Positive controls for the hybrid ruler suite (Codex #9 Q5 step 2).

Six synthetic defects on a deterministic skin-textured fixture; the FROZEN
thresholds in eval/hybrid_rulers.py were calibrated so identity passes with
margin and every control trips its ruler. No file/model dependencies — this
runs everywhere the base suite runs.
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from eval import hybrid_rulers as hb  # noqa: E402
from eval.ghost_ruler import blackhat_maps, clean_thresholds  # noqa: E402

FW = 320.0
SIZE = 400


def _fixture():
    """Skin-toned image with realistic grain + fixture masks."""
    rng = np.random.RandomState(20260711)
    base = np.full((SIZE, SIZE, 3), (150, 170, 205), np.float32)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
    base += ((yy / SIZE * 24 - 12) + (xx / SIZE * 10 - 5))[..., None]
    base += rng.normal(0, 5, base.shape).astype(np.float32)  # grain
    orig = np.clip(base, 0, 255).astype(np.uint8)

    edit_mask = np.zeros((SIZE, SIZE), bool)
    edit_mask[150:300, 80:320] = True

    lip = np.zeros((SIZE, SIZE), bool)
    lip[100:130, 150:250] = True
    edit_mask &= ~lip

    guards = {"lip": lip,
              "nostril_core": np.zeros((SIZE, SIZE), bool),
              "below_jaw": np.zeros((SIZE, SIZE), bool)}
    guards["nostril_core"][60:80, 180:220] = True
    guards["below_jaw"][380:, :] = True
    edit_mask &= ~guards["nostril_core"] & ~guards["below_jaw"]

    clean = np.ones((SIZE, SIZE), bool) & ~edit_mask & ~lip
    clean[:40] = False
    thr = clean_thresholds(blackhat_maps(orig, FW), clean)
    return orig, edit_mask, clean, thr, guards


def _score(orig, result, edit_mask, clean, thr, guards):
    return hb.score_photo(orig, result, edit_mask, clean, thr, guards, FW)


def test_identity_passes():
    orig, em, clean, thr, guards = _fixture()
    m = _score(orig, orig.copy(), em, clean, thr, guards)
    assert m["verdict"] == "pass", m
    assert 0.9 <= m["grainG50"] <= 1.1


def test_waxy_blur_trips_grain_deficit():
    orig, em, clean, thr, guards = _fixture()
    res = orig.copy()
    blurred = cv2.GaussianBlur(orig, (0, 0), 6.0)
    res[em] = blurred[em]
    m = _score(orig, res, em, clean, thr, guards)
    assert m["grainG50"] < hb.FROZEN["grainG50"][0], m
    assert m["verdict"] != "pass"


def test_noise_excess_trips_grain_excess():
    orig, em, clean, thr, guards = _fixture()
    rng = np.random.RandomState(7)
    res = orig.astype(np.float32)
    res[em] += rng.normal(0, 14, res[em].shape).astype(np.float32)
    res = np.clip(res, 0, 255).astype(np.uint8)
    m = _score(orig, res, em, clean, thr, guards)
    assert m["grainG90"] > hb.FROZEN["grainG90Max"], m
    assert m["verdict"] != "pass"


def test_stubble_strands_trip_new_dark():
    orig, em, clean, thr, guards = _fixture()
    res = orig.copy()
    for i, x in enumerate(range(100, 300, 10)):
        cv2.line(res, (x, 170 + (i % 3) * 20), (x + 3, 205 + (i % 3) * 20),
                 (60, 70, 90), 1)
    m = _score(orig, res, em, clean, thr, guards)
    assert m["newDarkArea"] > hb.FROZEN["newDarkAreaMax"], m
    assert m["verdict"] != "pass"


def test_bright_patch_trips_new_bright():
    orig, em, clean, thr, guards = _fixture()
    res = orig.astype(np.float32)
    res[200:240, 150:230] += 30.0  # teeth-like hot patch inside the fill
    res = np.clip(res, 0, 255).astype(np.uint8)
    m = _score(orig, res, em, clean, thr, guards)
    assert m["newBrightArea"] > hb.FROZEN["newBrightAreaMax"], m
    assert m["verdict"] != "pass"


def test_lip_extension_trips_lip_leak():
    orig, em, clean, thr, guards = _fixture()
    res = orig.copy()
    ring = np.zeros((SIZE, SIZE), np.uint8)
    cv2.rectangle(ring, (150, 130), (250, 134), 1, -1)  # just under the lip
    lab = cv2.cvtColor(res, cv2.COLOR_BGR2Lab)
    lab[..., 1] = np.where(ring > 0, np.minimum(lab[..., 1] + 25, 255),
                           lab[..., 1])
    res = cv2.cvtColor(lab, cv2.COLOR_Lab2BGR)
    m = _score(orig, res, em, clean, thr, guards)
    assert m["lipLeakRed"] > hb.FROZEN["lipLeakRedMax"], m
    assert m["verdict"] != "pass"


def test_chin_bright_band_trips():
    orig, em, clean, thr, guards = _fixture()
    res = orig.astype(np.float32)
    res[150:300, 80:200] += 12.0  # hard-edged bright band inside the fill
    res = np.clip(res, 0, 255).astype(np.uint8)
    m = _score(orig, res, em, clean, thr, guards)
    assert (m["brightBand"] > hb.FROZEN["brightBandMax"]
            or m["fillLiftLQ90"] > hb.FROZEN["fillLiftQ90Max"]), m
    assert m["verdict"] != "pass"


def test_byte_identity_gates_hard_fail():
    orig, em, clean, thr, guards = _fixture()
    res = orig.copy()
    ys, xs = np.nonzero(guards["lip"])
    res[ys[0], xs[0]] = res[ys[0], xs[0]] ^ 1
    m = _score(orig, res, em, clean, thr, guards)
    assert m["verdict"] == "hard-fail"
    assert "lipIdentical" in m["hardFails"]
