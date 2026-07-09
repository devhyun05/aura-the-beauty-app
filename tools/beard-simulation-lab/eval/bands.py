"""Anatomical recall bands for beard detection (evaluation protocol v2).

Diagnosis on our own selfies showed that "the model misses the philtrum, the
soul patch and the jaw edge" is really two different failures stacked:

  - ~6.4% of ground-truth beard pixels sit inside the dilated lip protect mask
  - ~10.4% sit outside the lower-face ROI

i.e. our own plumbing deletes them before any model gets to vote. To tell that
apart from genuine model misses, the bands below are defined purely from face
landmarks -- they never reference roi_mask or protect_mask. Recall is then
reported per band, so "did stage 1 actually recover the philtrum?" is a number
rather than an impression.

Bands (full-image coords, mutually exclusive, in priority order):
  philtrum   above the upper lip, under the nose, between the mouth corners
  soul_patch below the lower lip, between the mouth corners
  jaw_edge   the face-oval silhouette strip below mouth level, PLUS the
             under-jaw area outside the oval (beard running onto the neck --
             on our broad-labelled selfies this alone held ~15% of the GT)
  core       everything else on the lower face

`band_recall` also reports an `unassigned` bucket, so ground-truth pixels can
never be silently dropped by a band-definition mistake.
"""

from __future__ import annotations

import cv2
import numpy as np

from engine.detect_face import (
    CHIN_TIP,
    FACE_OVAL,
    LIPS_OUTER,
    MOUTH_CORNERS,
    NOSE_BOTTOM,
)

BAND_NAMES = ("philtrum", "soul_patch", "jaw_edge", "core")


def _fill(shape: tuple[int, int], points: np.ndarray) -> np.ndarray:
    m = np.zeros(shape, dtype=np.uint8)
    cv2.fillPoly(m, [points.astype(np.int32)], 1)
    return m.astype(bool)


def build_bands(
    shape: tuple[int, int],
    landmarks: np.ndarray,
    face_width: float,
    face_height: float,
    jaw_edge_ratio: float = 0.06,
) -> dict[str, np.ndarray]:
    """Return {band_name: bool mask (H, W)} over the full image."""
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

    lips = landmarks[LIPS_OUTER]
    lip_top = float(lips[:, 1].min())
    lip_bottom = float(lips[:, 1].max())
    nose_y = float(landmarks[NOSE_BOTTOM][1])
    chin_y = float(landmarks[CHIN_TIP][1])
    mx_l = float(landmarks[MOUTH_CORNERS[0]][0])
    mx_r = float(landmarks[MOUTH_CORNERS[1]][0])
    x_lo, x_hi = min(mx_l, mx_r), max(mx_l, mx_r)

    lip_poly = _fill((h, w), lips)

    # Lower face = inside the face oval, below the nose. This is the universe
    # the bands partition; it is deliberately wider than the pipeline ROI.
    oval = landmarks[FACE_OVAL]
    oval_mask = _fill((h, w), oval)
    below_nose = yy >= nose_y - 0.03 * face_height
    lower_face = oval_mask & below_nose

    # Jaw edge: the oval silhouette strip below mouth level, plus the under-jaw
    # region outside the oval (beard continuing onto the neck). Without the
    # second term ~15% of the ground truth on broad-labelled selfies lands in
    # no band at all.
    k = max(3, int(jaw_edge_ratio * face_width) | 1)
    kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    grown = cv2.dilate(oval_mask.astype(np.uint8), kern).astype(bool)
    shrunk = cv2.erode(oval_mask.astype(np.uint8), kern).astype(bool)
    silhouette = grown & ~shrunk & (yy > lip_bottom)

    oval_x0, oval_x1 = float(oval[:, 0].min()), float(oval[:, 0].max())
    margin = 0.05 * face_width
    under_jaw = (
        ~oval_mask
        & (yy > lip_bottom)
        & (yy <= chin_y + 0.30 * face_height)
        & (xx >= oval_x0 - margin)
        & (xx <= oval_x1 + margin)
    )
    jaw_edge = (silhouette | under_jaw) & (yy <= chin_y + 0.30 * face_height)

    between_corners = (xx >= x_lo) & (xx <= x_hi)
    philtrum = (yy < lip_top) & (yy >= nose_y) & between_corners & ~lip_poly
    soul_patch = (
        (yy > lip_bottom)
        & (yy <= lip_bottom + 0.5 * (chin_y - lip_bottom))
        & between_corners
        & ~lip_poly
    )

    # Priority: philtrum > soul_patch > jaw_edge > core.
    soul_patch = soul_patch & ~philtrum
    jaw_edge = jaw_edge & ~philtrum & ~soul_patch & ~lip_poly
    core = lower_face & ~philtrum & ~soul_patch & ~jaw_edge & ~lip_poly

    return {
        "philtrum": philtrum,
        "soul_patch": soul_patch,
        "jaw_edge": jaw_edge,
        "core": core,
    }


def band_recall(
    gt: np.ndarray, pred: np.ndarray, bands: dict[str, np.ndarray]
) -> dict[str, dict]:
    """Per-band recall AND precision, plus an `unassigned` bucket for GT that
    fell in no band -- a band-definition mistake must show up as a number, not
    as quietly missing pixels.

    Precision is not decoration. C1 scores 0.911 recall in `jaw_edge` at only
    0.330 precision: it is firing on the face/background silhouette, not on
    beard, so that recall is right for the wrong reason and widening the ROI
    outward would spray false positives. Conversely C1 reaches 0.947 precision
    in `philtrum` at 0.485 recall -- shy but accurate, i.e. safe to lower its
    threshold there. Neither fact is visible from recall alone.

    Both metrics are None where the denominator is empty (0.0 would drag every
    average down).
    """
    out: dict[str, dict] = {}
    covered = np.zeros_like(gt, dtype=bool)
    for name, band in bands.items():
        covered |= band
        g = gt & band
        p = pred & band
        n, pn = int(g.sum()), int(p.sum())
        hit = int((g & pred).sum())
        out[name] = {
            "gtPixels": n,
            "recall": (hit / n) if n else None,
            "precision": (hit / pn) if pn else None,
        }

    leftover = gt & ~covered
    n = int(leftover.sum())
    out["unassigned"] = {
        "gtPixels": n,
        "recall": (int((leftover & pred).sum()) / n) if n else None,
        "precision": None,
        "pctOfGt": round(100.0 * n / max(int(gt.sum()), 1), 2),
    }
    return out
