"""Coverage-first mask geometry for the v3 eraser (Codex #10 spec).

WHY: the previous pipeline clipped the edit mask at the jaw (the
`below_jaw` byte-identity guard), which structurally guaranteed that neck
beard and beard sitting ON the face silhouette survived every erase — the
user-visible "stubble ring". v3 inverts the priority: the CANVAS (where the
eraser may paint) must cover the neck corridor and BOTH sides of the
silhouette; precision is then recovered by seeded hysteresis and explicit
occluder subtraction, never by shrinking the canvas again.

Division of labour (keeps this module signal-agnostic):
- build_canvas / hysteresis_mask are pure geometry over bool evidence
  FIELDS that the caller has already thresholded (CLIPSeg prior, black-hat
  excess, ...). This module never runs CLIPSeg or LaMa itself.
- garment_boundary / occluder_guard are the only appearance-based helpers.
  They exist because the neck, unlike the face, has no landmark floor:
  clothing and jewellery are the failure modes geometry alone cannot see.
  Both are conservative — garment_boundary returns None when uncertain
  (coverage-first: the caller keeps the 0.35·fh floor), and occluder_guard
  only FLAGS regions; subtraction + byte checks stay with the caller.
- Lip/nostril protection also stays with the caller (blend-side guards).

All ratios are in face-width (fw) / face-height (fh) units so behaviour is
resolution independent. Every threshold below has a synthetic positive
control in tests/test_mask_v3.py (a defect that MUST trip it) plus an
identity/negative control — a ruler that never tripped on a known defect
is decoration.
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB))

from engine.detect_face import CHIN_TIP, FACE_OVAL, JAW_OVAL, NOSE_BOTTOM  # noqa: E402

# Visible mandible corners in the FaceMesh topology (members of JAW_OVAL).
JAW_ANGLE_LEFT = 172   # subject's right / image-left on a frontal face
JAW_ANGLE_RIGHT = 397

# --- Frozen geometry ratios (Codex #10). ---------------------------------
BELOW_NOSE_MARGIN_FW = 0.01    # face_region starts this far below nose bottom
TUBE_RADIUS_FW = 0.04          # silhouette tube half-width around JAW_OVAL
RAIL_CONVERGE_SLOPE = 0.03     # corridor rails move inward 0.03·fw per 1.0·fw descent
CORRIDOR_FLOOR_FH = 0.35       # default corridor depth below the chin
# --- Garment-boundary detector. -------------------------------------------
GARMENT_SEARCH_START_FH = 0.08  # never call the chin shadow itself a collar
GARMENT_GRAD_MAD_K = 5.0        # row qualifies above med + K·MAD of row grads
GARMENT_GRAD_FLOOR = 1.0        # L/px absolute floor: on a flat corridor MAD≈0,
                                #   so without a floor sensor noise would qualify
GARMENT_PERSIST_FRAC = 0.60     # step must span >=60% of the corridor width
GARMENT_MIN_ROWS = 10           # fewer searchable rows than this -> uncertain (None)
GARMENT_MIN_COLS = 8            # rows with a thinner corridor are skipped
# --- Non-skin / occluder. --------------------------------------------------
NONSKIN_MAHALANOBIS = 4.0       # Lab Mahalanobis vs the caller's skin stats
OCCLUDER_MIN_SIDE_FW = 0.06     # component must exceed (0.06·fw)^2 px — chains,
                                #   collars, mask fabric; smaller blobs are moles/
                                #   shadow speckle and are left to the evidence fields
_COV_EPS = 1e-3                 # regularizer: synthetic fixtures can have singular cov


def _mahalanobis_field(bgr: np.ndarray, skin_lab_mean: np.ndarray,
                       skin_lab_cov: np.ndarray) -> np.ndarray:
    """Per-pixel Lab Mahalanobis distance to the caller's skin model."""
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2Lab).astype(np.float64)
    mean = np.asarray(skin_lab_mean, np.float64).reshape(3)
    cov = np.asarray(skin_lab_cov, np.float64).reshape(3, 3) + _COV_EPS * np.eye(3)
    icov = np.linalg.inv(cov)
    d = lab.reshape(-1, 3) - mean
    m = np.sqrt(np.maximum(np.einsum("ij,jk,ik->i", d, icov, d), 0.0))
    return m.reshape(bgr.shape[:2]).astype(np.float32)


def _columnwise_jaw_y(jaw_pts: np.ndarray, shape: tuple[int, int],
                      chin_y: float) -> np.ndarray:
    """Lowest rasterized jaw-polyline y per image column, gaps interpolated.

    The corridor top must follow the actual jaw curve, not a horizontal
    chord: a chord at chin height would re-open the exact under-jaw gap the
    old clip left near the mandible corners.
    """
    h, w = shape
    line = np.zeros((h, w), np.uint8)
    cv2.polylines(line, [jaw_pts.astype(np.int32)], False, 1, 1)
    ys, xs = np.nonzero(line)
    if xs.size == 0:  # degenerate landmarks; corridor collapses to below-chin
        return np.full(w, chin_y, np.float32)
    col_max = np.full(w, -1.0, np.float32)
    np.maximum.at(col_max, xs, ys.astype(np.float32))
    known = np.nonzero(col_max >= 0)[0]
    return np.interp(np.arange(w), known, col_max[known]).astype(np.float32)


def build_canvas(landmarks_crop: np.ndarray, shape: tuple[int, ...],
                 face_width: float, face_height: float,
                 garment_boundary_y: float | None = None) -> dict:
    """Erasable-area geometry: face below the nose + silhouette tube + neck corridor.

    `garment_boundary_y` is optional because this function is bgr-free; the
    caller obtains it from garment_boundary() and passes it in so the
    corridor floor can stop at the collar. Returns bool masks plus the
    resolved `corridor_floor_y` and the `garment_boundary_y` it was given.
    """
    h, w = int(shape[0]), int(shape[1])
    fw = float(face_width)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

    nose_y = float(landmarks_crop[NOSE_BOTTOM][1])
    chin_y = float(landmarks_crop[CHIN_TIP][1])

    # Face region: whole FACE_OVAL filled, then cut below the nose. Filling
    # only the sub-nose oval points would close the polygon with a chord at
    # arbitrary landmark heights (the philtrum-slicing bug lower_face_roi
    # already paid for once).
    oval = np.zeros((h, w), np.uint8)
    cv2.fillPoly(oval, [landmarks_crop[FACE_OVAL].astype(np.int32)], 1)
    face_region = (oval > 0) & (yy > nose_y + BELOW_NOSE_MARGIN_FW * fw)

    # Silhouette tube: BOTH sides of the jaw polyline. This is the piece
    # that lets beard lying outside the oval (on the visual silhouette) be
    # masked at all — the oval alone clips it, which was the stubble ring.
    jaw_pts = landmarks_crop[JAW_OVAL]
    inv = np.ones((h, w), np.uint8)
    cv2.polylines(inv, [jaw_pts.astype(np.int32)], False, 0, 1)
    dist = cv2.distanceTransform(inv, cv2.DIST_L2, 5)
    silhouette_tube = dist <= TUBE_RADIUS_FW * fw

    # Corridor floor: coverage-first default 0.35·fh under the chin, pulled
    # up only by a confidently detected garment (or the image edge).
    # garment_boundary_y may be a scalar (row-persistent collar) or a (w,)
    # per-column curve (garment_floor_cols — V-necks/slanted necklines).
    default_floor = min(float(h - 1),
                        chin_y + CORRIDOR_FLOOR_FH * float(face_height))
    if garment_boundary_y is None:
        floor_col = np.full(w, default_floor, np.float32)
    else:
        gb = np.asarray(garment_boundary_y, np.float32)
        floor_col = np.minimum(np.broadcast_to(gb, (w,)).astype(np.float32),
                               default_floor)
    corridor_floor_y = float(np.median(floor_col))

    # Neck corridor: trapezoid hanging from the jaw. Rails start at the
    # mandible corners and converge inward with depth (necks narrow; a
    # straight-down box would sweep shoulder/background at the bottom).
    xl, yl = (float(v) for v in landmarks_crop[JAW_ANGLE_LEFT])
    xr, yr = (float(v) for v in landmarks_crop[JAW_ANGLE_RIGHT])
    if xl > xr:  # mirrored landmark set; keep rails on their image sides
        (xl, yl), (xr, yr) = (xr, yr), (xl, yl)
    left_rail = xl + RAIL_CONVERGE_SLOPE * (yy - yl)
    right_rail = xr - RAIL_CONVERGE_SLOPE * (yy - yr)
    jaw_y_col = _columnwise_jaw_y(jaw_pts, (h, w), chin_y)
    neck_corridor = ((xx >= left_rail) & (xx <= right_rail)
                     & (yy >= jaw_y_col[None, :])
                     & (yy <= floor_col[None, :]))

    return {
        "face_region": face_region,
        "silhouette_tube": silhouette_tube,
        "neck_corridor": neck_corridor,
        "canvas": face_region | silhouette_tube | neck_corridor,
        "corridor_floor_y": corridor_floor_y,
        "garment_boundary_y": (None if garment_boundary_y is None
                               else float(np.median(
                                   np.asarray(garment_boundary_y)))),
    }


def garment_boundary(bgr_crop: np.ndarray, corridor_cols_mask: np.ndarray,
                     chin_y: float, face_height: float,
                     skin_lab_mean: np.ndarray,
                     skin_lab_cov: np.ndarray) -> float | None:
    """Top y of the first collar-grade horizontal boundary below the chin.

    A row qualifies only if BOTH hold:
    1. persistent step: the low-passed luminance vertical gradient exceeds a
       robust threshold (med + 5·MAD of corridor row means, floored at
       1 L/px) on >= 60% of that row's corridor columns AND in the row mean
       — soft neck shading (Adam's apple) stays far below the floor;
    2. non-skin below: the band under the step has median Lab Mahalanobis
       > 4 vs the caller's skin stats — a mere lighting step on skin must
       NOT close the corridor.

    Returns None whenever uncertain (too few rows/columns, nothing
    qualifies): coverage-first, the caller then keeps the 0.35·fh floor.
    `corridor_cols_mask` may be (h, w) bool (per-row corridor columns) or
    (w,) bool (same columns for every row).
    """
    h, w = bgr_crop.shape[:2]
    fh = float(face_height)
    mask = np.asarray(corridor_cols_mask, bool)
    if mask.ndim == 1:
        mask = np.repeat(mask[None, :], h, axis=0)

    lab = cv2.cvtColor(bgr_crop, cv2.COLOR_BGR2Lab).astype(np.float32)
    # Low-pass before differencing: stubble/texture must not read as a step.
    low = cv2.GaussianBlur(lab[..., 0], (0, 0), sigmaX=max(2.0, 0.02 * fh))
    # ksize=3 Sobel responds 8·s to a ramp of slope s -> normalize to L/px.
    grad = np.abs(cv2.Sobel(low, cv2.CV_32F, 0, 1, ksize=3)) / 8.0

    counts = mask.sum(axis=1)
    row_mean = np.where(counts > 0,
                        np.where(mask, grad, 0.0).sum(axis=1)
                        / np.maximum(counts, 1), 0.0)

    y_start = int(np.ceil(float(chin_y) + GARMENT_SEARCH_START_FH * fh))
    rows = np.arange(h)
    valid = (rows >= y_start) & (counts >= GARMENT_MIN_COLS)
    if valid.sum() < GARMENT_MIN_ROWS:
        return None

    vals = row_mean[valid]
    med = float(np.median(vals))
    mad = float(np.median(np.abs(vals - med)))
    thr = max(med + GARMENT_GRAD_MAD_K * mad, GARMENT_GRAD_FLOOR)

    maha = _mahalanobis_field(bgr_crop, skin_lab_mean, skin_lab_cov)
    band = max(3, int(0.04 * fh))  # rows sampled under a candidate step
    for y in rows[valid]:
        if row_mean[y] <= thr:
            continue
        cols = mask[y]
        if float((grad[y, cols] > thr).mean()) < GARMENT_PERSIST_FRAC:
            continue
        y2 = min(y + 2, h - 1)
        y3 = min(y2 + band, h)
        below = maha[y2:y3][:, cols]
        if below.size == 0:
            continue
        if float(np.median(below)) > NONSKIN_MAHALANOBIS:
            return float(y)
    return None


def garment_floor_cols(bgr_crop: np.ndarray, corridor_cols_mask: np.ndarray,
                       chin_y: float, face_height: float,
                       skin_lab_mean: np.ndarray,
                       skin_lab_cov: np.ndarray) -> np.ndarray | None:
    """Per-COLUMN garment floor (w,) — the row-persistence detector above
    requires the collar edge to sit on one row, so any V-neck / slanted
    neckline returns None and the corridor runs onto the fabric (measured
    psd04: hoodie edited because CLIPSeg+z dual seeds both fired on the dark
    neckline). Here each corridor column takes its FIRST qualifying step
    (strong low-pass vertical gradient with non-skin below); columns without
    a crossing inherit the median, and the curve is median-filtered. Returns
    None when fewer than half the corridor columns cross (uncertain →
    coverage-first, caller keeps the 0.35·fh floor)."""
    h, w = bgr_crop.shape[:2]
    fh = float(face_height)
    mask = np.asarray(corridor_cols_mask, bool)
    if mask.ndim == 1:
        mask = np.repeat(mask[None, :], h, axis=0)

    lab = cv2.cvtColor(bgr_crop, cv2.COLOR_BGR2Lab).astype(np.float32)
    low = cv2.GaussianBlur(lab[..., 0], (0, 0), sigmaX=max(2.0, 0.02 * fh))
    grad = np.abs(cv2.Sobel(low, cv2.CV_32F, 0, 1, ksize=3)) / 8.0

    y_start = int(np.ceil(float(chin_y) + GARMENT_SEARCH_START_FH * fh))
    if y_start >= h - 3:
        return None
    counts = mask.sum(axis=1)
    valid_rows = (np.arange(h) >= y_start) & (counts >= GARMENT_MIN_COLS)
    if valid_rows.sum() < GARMENT_MIN_ROWS:
        return None
    row_mean = np.where(mask, grad, 0.0).sum(axis=1) / np.maximum(counts, 1)
    vals = row_mean[valid_rows]
    med = float(np.median(vals))
    mad = float(np.median(np.abs(vals - med)))
    thr = max(med + GARMENT_GRAD_MAD_K * mad, GARMENT_GRAD_FLOOR)

    maha = _mahalanobis_field(bgr_crop, skin_lab_mean, skin_lab_cov)
    band = max(3, int(0.04 * fh))
    cols = np.nonzero(mask[y_start:].any(axis=0))[0]
    if len(cols) < GARMENT_MIN_COLS:
        return None
    floor = np.full(w, np.nan, np.float32)
    for c in cols:
        ys = np.nonzero((grad[y_start:, c] > thr) & mask[y_start:, c])[0]
        for dy in ys:
            y = y_start + int(dy)
            y2 = min(y + 2, h - 1)
            below = maha[y2:min(y2 + band, h), c]
            if below.size and float(np.median(below)) > NONSKIN_MAHALANOBIS:
                floor[c] = y
                break
    crossed = ~np.isnan(floor[cols])
    if crossed.mean() < 0.5:
        return None
    fill = float(np.nanmedian(floor[cols]))
    floor = np.where(np.isnan(floor), fill, floor)
    # median-filter the curve so one noisy column cannot spike the floor
    k = 9
    pad = np.pad(floor, k // 2, mode="edge")
    floor = np.array([np.median(pad[i:i + k]) for i in range(w)], np.float32)
    return floor


def hysteresis_mask(growth: np.ndarray, seed_strong: np.ndarray,
                    seed_strong_dual: np.ndarray, canvas: np.ndarray,
                    face_and_tube: np.ndarray) -> np.ndarray:
    """Seeded hysteresis over caller-thresholded evidence fields.

    A growth connected-component (8-conn, clipped to the canvas) survives iff
    it contains a seed_strong pixel AND either:
    - it touches face_region|silhouette_tube (jaw-connected beard), or
    - it is corridor-only (touches neither) and ALSO contains a
      seed_strong_dual pixel — the independent-neck rule. Isolated neck
      blobs are where Adam's-apple shadows and moles live, so one signal's
      confidence is not enough there; requiring a second independent
      signal's strong seed keeps this module agnostic to WHICH signals the
      caller fused.

    All inputs are bool fields of the same shape; output is clipped to canvas.
    """
    growth_c = growth & canvas
    n, labels = cv2.connectedComponents(growth_c.astype(np.uint8),
                                        connectivity=8)

    def _hits(field: np.ndarray) -> np.ndarray:
        out = np.zeros(n, bool)
        hit = labels[field & growth_c]
        if hit.size:
            out[np.unique(hit)] = True
        out[0] = False  # background label never counts
        return out

    has_seed = _hits(seed_strong)
    has_dual = _hits(seed_strong_dual)
    touches_face = _hits(face_and_tube)
    include = has_seed & (touches_face | has_dual)
    include[0] = False
    return include[labels]


def occluder_guard(bgr_crop: np.ndarray, canvas: np.ndarray,
                   skin_lab_mean: np.ndarray, skin_lab_cov: np.ndarray,
                   fw: float) -> np.ndarray:
    """Large connected non-skin regions inside the canvas.

    Chains/necklaces/collars/mask fabric are non-skin AND big; per-pixel
    skin-model outliers (moles, specular dots, shadow speckle) are small
    and must NOT be flagged — the size gate is what separates them. The
    caller subtracts this mask from the edit mask and byte-checks it after
    the erase (guards live outside this module by design).
    """
    non_skin = ((_mahalanobis_field(bgr_crop, skin_lab_mean, skin_lab_cov)
                 > NONSKIN_MAHALANOBIS) & canvas)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(
        non_skin.astype(np.uint8), connectivity=8)
    min_px = max(9, int((OCCLUDER_MIN_SIDE_FW * float(fw)) ** 2))
    keep = np.zeros(n, bool)
    for i in range(1, n):
        keep[i] = stats[i, cv2.CC_STAT_AREA] >= min_px
    return keep[labels]
