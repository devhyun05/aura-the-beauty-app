"""Synthetic controls for spike/mask_v3.py (v4 face-only mask geometry).

Fully synthetic — no samples/ photos, no models: a 478-slot landmark array
where only the indices mask_v3 reads are populated (an ellipse standing in
for FACE_OVAL). Every geometric rule in mask_v3 gets a positive control
plus an identity/negative control, per the lab rule that an untripped
ruler is decoration.

REMOVED with the v4 scope cut (Codex #13 — neck/garment/occluder handling
left the product path; the capture gate rejects those photos instead):
corridor rail/floor tests, garment_boundary / garment_floor_cols tests,
occluder_guard tests, and the corridor-only dual-seed hysteresis tests.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.detect_face import FACE_OVAL, NOSE_BOTTOM  # noqa: E402
from spike import mask_v3  # noqa: E402

# Fixture geometry: ellipse face in a tall frame.
H, W = 520, 400
CX, CY, RX, RY = 200.0, 170.0, 110.0, 140.0
FW = 2 * RX                      # 220 (oval extent = face width)
CHIN_Y = CY + RY                 # 310
NOSE_Y = 150.0
TOP_Y = NOSE_Y - mask_v3.CANVAS_TOP_BUFFER_FW * FW   # 144.5


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


def _canvas() -> dict:
    return mask_v3.build_canvas(LM, (H, W), FW)


def _oval_fill() -> np.ndarray:
    oval = np.zeros((H, W), np.uint8)
    cv2.fillPoly(oval, [LM[FACE_OVAL].astype(np.int32)], 1)
    return oval > 0


def _empty() -> np.ndarray:
    return np.zeros((H, W), bool)


# --------------------------------------------------------------------------
# canvas geometry
# --------------------------------------------------------------------------

def test_canvas_top_buffer():
    """Codex #13: canvas top = NOSE_BOTTOM_y − 0.025fw. The buffer absorbs
    the measured ±0.02fw landmark jitter, so the top philtrum band can
    never fall out of the canvas; nostril safety is the DETECTED aperture
    guard's job (hybrid_recon), never the canvas's."""
    assert mask_v3.CANVAS_TOP_BUFFER_FW == 0.025
    c = _canvas()
    top_row = int(math.floor(TOP_Y)) + 1          # 145: first row > TOP_Y
    assert not c["canvas"][:top_row].any()        # buffered line and above
    assert c["canvas"][top_row, int(CX)]          # very next row: in
    # The buffer really sits ABOVE the raw landmark (positive buffer).
    assert top_row < NOSE_Y


def test_canvas_terminates_at_jaw():
    """The composite write canvas must END at the per-column jaw line —
    the v4 contract that makes belowJawIdentical a byte gate again."""
    c = _canvas()
    assert not (c["canvas"] & c["below_jaw"]).any()
    # Just below the chin: out of the write canvas...
    assert c["below_jaw"][int(CHIN_Y) + 2, int(CX)]
    assert not c["canvas"][int(CHIN_Y) + 2, int(CX)]
    # ...but inside the model (LaMa hole) context band.
    assert c["model_canvas"][int(CHIN_Y) + 2, int(CX)]


def test_model_canvas_context_band_capped():
    """model_canvas may cross the jaw by <= MODEL_JAW_CONTEXT_FW·fw ONLY
    (Codex #13 allows 0.01..0.02fw)."""
    assert 0.01 <= mask_v3.MODEL_JAW_CONTEXT_FW <= 0.02
    c = _canvas()
    yy = np.mgrid[0:H, 0:W][0].astype(np.float32)
    depth = yy - c["jaw_y_col"][None, :]
    cap = mask_v3.MODEL_JAW_CONTEXT_FW * FW
    band = c["model_canvas"] & c["below_jaw"]
    assert band.any()                             # the band exists
    assert float(depth[band].max()) <= cap + 1e-3  # and never exceeds the cap
    assert not (c["model_canvas"] & (depth > cap)).any()


def test_tube_face_side_reaches_outside_oval():
    """The point of the tube: beard ON the silhouette edge (outside the
    landmark oval but ABOVE the jaw curve) must be inside the write canvas."""
    c = _canvas()
    oval = _oval_fill()
    outside = c["canvas"] & ~oval
    assert outside.any()
    # Concrete pixel just outside the jaw-polyline endpoint (ear side),
    # above the jaw line: (row 190, col 314) is ~7 px from the endpoint.
    assert not oval[190, 314]
    assert c["silhouette_tube_face"][190, 314]
    assert c["canvas"][190, 314]


def test_build_canvas_deterministic():
    a, b = _canvas(), _canvas()
    for key in ("face_region", "silhouette_tube_face", "canvas",
                "model_canvas", "below_jaw"):
        assert np.array_equal(a[key], b[key])
    assert np.array_equal(a["jaw_y_col"], b["jaw_y_col"])


# --------------------------------------------------------------------------
# seeded hysteresis
# --------------------------------------------------------------------------

def test_seeded_component_included():
    c = _canvas()
    growth = _empty()
    growth[200:301, 190:211] = True   # chin-ward evidence strip
    seed = _empty()
    seed[250, 200] = True             # single strong seed
    out = mask_v3.hysteresis_mask(growth, seed, c["canvas"])
    assert out[210, 200]
    assert out[300, 200]
    assert not out[~c["canvas"]].any()


def test_seedless_growth_excluded():
    c = _canvas()
    growth = _empty()
    growth[200:240, 185:216] = True   # permissive evidence, no seed
    out = mask_v3.hysteresis_mask(growth, _empty(), c["canvas"])
    assert not out.any()


def test_hysteresis_clipped_to_canvas():
    c = _canvas()
    growth = _empty()
    growth[100:451, 195:206] = True   # spills above the nose and below the jaw
    seed = _empty()
    seed[250, 200] = True
    out = mask_v3.hysteresis_mask(growth, seed, c["canvas"])
    assert out[250, 200]
    assert not out[100, 200]          # above the buffered nose cut
    assert not out[330, 200]          # below the jaw: outside the write canvas
    assert not out[~c["canvas"]].any()


def test_hysteresis_deterministic():
    c = _canvas()
    growth = _empty()
    growth[200:301, 190:211] = True
    seed = _empty()
    seed[250, 200] = True
    a = mask_v3.hysteresis_mask(growth, seed, c["canvas"])
    b = mask_v3.hysteresis_mask(growth, seed, c["canvas"])
    assert np.array_equal(a, b)
