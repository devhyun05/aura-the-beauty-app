"""REGION ground truth: the approved label standard, applied at load time.

Decision (2026-07-10, user-approved): the label standard is the *zone* --
"경계는 정확하게, 내부는 채워서". Fill the area where this person's facial hair
actually grows (strands + stubble dots + bluish cast + the small gaps between
them), never clean cheeks/neck/geometric shade. In-zone over-paint (pores) is
acceptable; missing beard is not.

The user's source label files are NEVER modified. This module converts at load
time, so the transformation is code: documented, reversible, and testable.

Two normalizations:

1. strands -> zone: dilate then morphological-close with a face-width-scaled
   kernel. This merges the gaps between sparse hairs into one filled shape (the
   exact transform shown and approved as panel B of label_standard_pic1.jpg).
   On already-broad region labels (psd set) it is a near no-op.

2. clip above the product's upper bound (nose line): the simulation never
   edits above the nose, and some labels ran onto the upper cheeks (58% of
   psd04's unassigned GT sat above the nose line). Clipped pixels are COUNTED
   and reported, never silently dropped -- discipline rule 2.
"""

from __future__ import annotations

import cv2
import numpy as np

from engine.detect_face import NOSE_BOTTOM

# Kernel = 3% of face width: the scale demonstrated in label_standard_pic1.jpg
# (pic1 strands 5,358 px -> zone 8,167 px, x1.5) and visually approved.
KERNEL_FACE_RATIO = 0.03
TOP_MARGIN_RATIO = 0.03  # same margin the ROI uses above the nose bottom


def region_from_strands(
    gt: np.ndarray, kernel_px: int, top_y: float | None = None
) -> tuple[np.ndarray, int]:
    """Pure core: strands/blobs -> filled zone, plus count of clipped pixels.

    Returns (region_mask bool, clipped_px). `top_y` clips everything above
    that row AFTER closing, so the count reflects what the clip removed.
    """
    src = gt.astype(np.uint8)
    k = max(3, int(kernel_px) | 1)
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    zone = cv2.morphologyEx(cv2.dilate(src, ker), cv2.MORPH_CLOSE, ker)

    clipped = 0
    if top_y is not None:
        above = np.zeros_like(zone, dtype=bool)
        above[: max(0, int(top_y)), :] = True
        clipped = int((zone.astype(bool) & above).sum())
        zone = zone.copy()
        zone[above] = 0
    return zone.astype(bool), clipped


def load_region_gt(
    gt: np.ndarray,
    landmarks: np.ndarray,
    face_width: float,
    face_height: float,
) -> tuple[np.ndarray, int]:
    """Face-scaled wrapper: kernel from face width, clip line from the nose."""
    top_y = float(landmarks[NOSE_BOTTOM][1]) - TOP_MARGIN_RATIO * face_height
    return region_from_strands(
        gt, kernel_px=int(KERNEL_FACE_RATIO * face_width), top_y=top_y)
