"""Face-only mask geometry for the v4 eraser (Codex #13 spec).

SCOPE DECISION (user, 2026-07-12): neck beard, occluders and harsh shadows
are rejected at the CAPTURE gate — the pipeline edits well-lit frontal
faces only, and the composite terminates at the jawline. Everything the v3
module carried for the neck is REMOVED from the product path:

- neck corridor + converging rails + corridor floor,
- garment_boundary / garment_floor_cols (collar detectors),
- occluder_guard (Mahalanobis non-skin subtraction) — replaced by a
  photo-level abstain in spike.hybrid_recon (obvious occlusion or
  landmark/aperture instability refuses the WHOLE photo instead of
  silently carving pixels out of the mask),
- the corridor-only dual-seed rule in hysteresis (there is no corridor).

The research copies of those detectors live on in git history and the
spike/zone_recon.py / spike/oracle_kill.py study scripts; this module is
the PRODUCT geometry only.

Canvas (Codex #13):
- face_region = FACE_OVAL filled, cut at the buffered nose line
  (NOSE_BOTTOM_y − CANVAS_TOP_BUFFER_FW·fw — absorbs the measured
  ±0.02fw landmark jitter so the top philtrum band can never fall out
  of the canvas again),
- the FACE side of the jawline tube (dist ≤ TUBE_RADIUS_FW·fw to the
  JAW_OVAL polyline, above the per-column jaw line) so beard sitting ON
  the visual silhouette stays erasable,
- `canvas` (what the composite may WRITE) ends AT the jaw line;
  `model_canvas` may cross it by ≤ MODEL_JAW_CONTEXT_FW·fw — that band
  is LaMa-hole-only context cleanup, the composite never writes there.

All ratios are in face-width (fw) units so behaviour is resolution
independent. Every geometric rule has a synthetic control in
tests/test_mask_v3.py.
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB))

from engine.detect_face import CHIN_TIP, FACE_OVAL, JAW_OVAL, NOSE_BOTTOM  # noqa: E402

# --- Frozen geometry ratios (Codex #13). -----------------------------------
# Canvas top = NOSE_BOTTOM_y − 0.025·fw: the landmark can sit up to ~0.02fw
# BELOW the true nose bottom (measured jitter), and cutting at the raw
# landmark then leaves the top philtrum band structurally unerasable. The
# nostril APERTURES that now fall inside the canvas are protected by the
# detection-based aperture guard (hybrid_recon.detect_nostril_apertures) —
# never by shrinking the canvas.
CANVAS_TOP_BUFFER_FW = 0.025
TUBE_RADIUS_FW = 0.04          # silhouette tube half-width around JAW_OVAL
# LaMa model-mask context band below the jaw: the HOLE may cross the jaw by
# this much so boundary stubble does not condition the fill, but the
# composite (edit mask) terminates at the jaw line exactly. Codex #13
# allows ≤0.01–0.02fw; 0.015 chosen mid-range.
MODEL_JAW_CONTEXT_FW = 0.015


def _columnwise_jaw_y(jaw_pts: np.ndarray, shape: tuple[int, int],
                      chin_y: float) -> np.ndarray:
    """Lowest rasterized jaw-polyline y per image column, gaps interpolated.

    The canvas must terminate on the actual jaw CURVE, not a horizontal
    chord: a chord at chin height would either clip the mandible corners or
    leak the composite under them.
    """
    h, w = shape
    line = np.zeros((h, w), np.uint8)
    cv2.polylines(line, [jaw_pts.astype(np.int32)], False, 1, 1)
    ys, xs = np.nonzero(line)
    if xs.size == 0:  # degenerate landmarks; fall back to a chin-height cut
        return np.full(w, chin_y, np.float32)
    col_max = np.full(w, -1.0, np.float32)
    np.maximum.at(col_max, xs, ys.astype(np.float32))
    known = np.nonzero(col_max >= 0)[0]
    return np.interp(np.arange(w), known, col_max[known]).astype(np.float32)


def build_canvas(landmarks_crop: np.ndarray, shape: tuple[int, ...],
                 face_width: float) -> dict:
    """Erasable-area geometry: buffered sub-nose face oval ∪ face side of
    the jawline tube; the write canvas ends at the jaw line.

    Returns bool masks plus the per-column jaw line (`jaw_y_col`):
    - canvas       : where the composite may WRITE (ends at the jaw),
    - model_canvas : where the LaMa HOLE may extend (jaw + context band),
    - below_jaw    : strictly under the jaw line — byte-identity gate
                     region for the rulers (the composite never writes it).
    """
    h, w = int(shape[0]), int(shape[1])
    fw = float(face_width)
    yy = np.mgrid[0:h, 0:w][0].astype(np.float32)

    nose_y = float(landmarks_crop[NOSE_BOTTOM][1])
    chin_y = float(landmarks_crop[CHIN_TIP][1])
    top_y = nose_y - CANVAS_TOP_BUFFER_FW * fw

    # Face region: whole FACE_OVAL filled, then cut at the buffered nose
    # line. Filling only the sub-nose oval points would close the polygon
    # with a chord at arbitrary landmark heights (the philtrum-slicing bug
    # lower_face_roi already paid for once).
    oval = np.zeros((h, w), np.uint8)
    cv2.fillPoly(oval, [landmarks_crop[FACE_OVAL].astype(np.int32)], 1)
    face_region = (oval > 0) & (yy > top_y)

    # Jawline tube: band around the JAW_OVAL polyline. Only its FACE side
    # enters the write canvas — beard ON the silhouette edge (outside the
    # landmark oval but above the jaw curve) stays erasable, which was the
    # original point of the tube; the under-jaw side is model-context only.
    jaw_pts = landmarks_crop[JAW_OVAL]
    inv = np.ones((h, w), np.uint8)
    cv2.polylines(inv, [jaw_pts.astype(np.int32)], False, 0, 1)
    dist = cv2.distanceTransform(inv, cv2.DIST_L2, 5)
    tube = (dist <= TUBE_RADIUS_FW * fw) & (yy > top_y)

    jaw_y_col = _columnwise_jaw_y(jaw_pts, (h, w), chin_y)
    above_jaw = yy <= jaw_y_col[None, :]
    below_jaw = ~above_jaw

    canvas = (face_region | tube) & above_jaw
    model_canvas = ((face_region | tube)
                    & (yy <= jaw_y_col[None, :] + MODEL_JAW_CONTEXT_FW * fw))

    return {
        "face_region": face_region & above_jaw,
        "silhouette_tube_face": tube & above_jaw,
        "canvas": canvas,
        "model_canvas": model_canvas,
        "below_jaw": below_jaw,
        "jaw_y_col": jaw_y_col,
    }


def hysteresis_mask(growth: np.ndarray, seed_strong: np.ndarray,
                    canvas: np.ndarray) -> np.ndarray:
    """Seeded hysteresis over caller-thresholded evidence fields.

    A growth connected-component (8-conn, clipped to the canvas) survives
    iff it contains a seed_strong pixel. The v3 corridor-only dual-seed
    rule is gone WITH the corridor: every canvas pixel is now on the face
    or its silhouette tube, where a single strong seed was always enough.

    All inputs are bool fields of the same shape; output ⊆ canvas.
    """
    growth_c = growth & canvas
    n, labels = cv2.connectedComponents(growth_c.astype(np.uint8),
                                        connectivity=8)
    has_seed = np.zeros(n, bool)
    hit = labels[seed_strong & growth_c]
    if hit.size:
        has_seed[np.unique(hit)] = True
    has_seed[0] = False  # background label never counts
    return has_seed[labels]
