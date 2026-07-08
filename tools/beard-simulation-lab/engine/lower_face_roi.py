"""Lower-face ROI, protect mask, region split, and skin reference patches.

Everything downstream operates on a LowerFaceCrop — corrector functions accept
only this type, which is what structurally enforces the "no full-face img2img"
rule: there is no code path that hands the full frame to a correction step.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .detect_face import (
    BROW_MID,
    CHIN_TIP,
    FACE_OVAL,
    FOREHEAD_MID,
    LIPS_OUTER,
    MOUTH_CORNERS,
    NOSE_BOTTOM,
    NOSTRILS,
    UPPER_CHEEKS,
)

REGION_NAMES = ("mustache", "chin", "mouth_side", "jaw")


@dataclass
class LowerFaceCrop:
    """Crop of the lower face plus all masks, in crop coordinates."""

    bgr: np.ndarray               # (h, w, 3) uint8 crop
    bbox: tuple[int, int, int, int]  # x0, y0, x1, y1 in full-image coords
    roi_mask: np.ndarray          # float32 0..1
    protect_mask: np.ndarray      # float32 0..1 (lips + nostrils, dilated)
    skin_ref_mask: np.ndarray     # float32 0..1 (forehead/upper-cheek patches, may
                                  #   extend above bbox → clipped to crop)
    region_masks: dict[str, np.ndarray]  # name -> float32 0..1
    face_width: float
    landmarks: np.ndarray         # full 468 set, crop coords


def _fill_polygon(shape: tuple[int, int], points: np.ndarray) -> np.ndarray:
    mask = np.zeros(shape, dtype=np.uint8)
    cv2.fillPoly(mask, [points.astype(np.int32)], 255)
    return mask.astype(np.float32) / 255.0


def _disk(mask: np.ndarray, center: np.ndarray, radius: int) -> None:
    cv2.circle(mask, (int(center[0]), int(center[1])), radius, 1.0, -1)


def build_lower_face_crop(
    bgr: np.ndarray,
    landmarks: np.ndarray,
    face_width: float,
    face_height: float,
    under_jaw_extend: float = 0.08,
    protect_dilate_ratio: float = 0.045,
) -> LowerFaceCrop:
    h, w = bgr.shape[:2]
    nose_bottom_y = landmarks[NOSE_BOTTOM][1]
    top_y = nose_bottom_y - 0.03 * face_height

    # ROI polygon: face-oval points below the nose, chin points pushed down a
    # little so under-jaw beard is included, closed across the top.
    oval = landmarks[FACE_OVAL]
    lower = oval[oval[:, 1] >= top_y].copy()
    lower = lower[np.argsort(np.arctan2(lower[:, 1] - lower[:, 1].mean(),
                                        lower[:, 0] - lower[:, 0].mean()))]
    chin_y = landmarks[CHIN_TIP][1]
    push = lower[:, 1] > (nose_bottom_y + chin_y) / 2
    lower[push, 1] += under_jaw_extend * face_height

    roi_full = _fill_polygon((h, w), lower)

    # Protect mask: outer-lip polygon dilated + nostril disks.  The upper
    # dilation is capped so mustache pixels immediately above the lip are still
    # measurable, while lower/side dilation keeps the lips protected.
    lip_base = _fill_polygon((h, w), landmarks[LIPS_OUTER])
    k = max(3, int(protect_dilate_ratio * face_width) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    protect_full = cv2.dilate(lip_base, kernel)
    lip_top_y_full = float(landmarks[LIPS_OUTER][:, 1].min())
    upper_cap = max(1, int(round(0.018 * face_width)))
    yy_full = np.arange(h, dtype=np.float32)[:, None]
    protect_full = np.where(
        yy_full >= lip_top_y_full - upper_cap,
        protect_full,
        lip_base,
    ).astype(np.float32)
    nostril_r = max(2, int(0.028 * face_width))
    for idx in (*NOSTRILS, NOSE_BOTTOM):
        _disk(protect_full, landmarks[idx], nostril_r)
    protect_full = np.clip(protect_full, 0.0, 1.0)

    # Skin reference patches (clean-skin sample for the per-person color model):
    # forehead center + both upper cheeks.
    skin_ref_full = np.zeros((h, w), dtype=np.float32)
    patch_r = max(4, int(0.05 * face_width))
    forehead = (landmarks[FOREHEAD_MID] + landmarks[BROW_MID]) / 2
    _disk(skin_ref_full, forehead, patch_r)
    for idx in UPPER_CHEEKS:
        _disk(skin_ref_full, landmarks[idx], int(patch_r * 0.8))

    # Crop bbox: ROI bounds + margin, but always including the skin patches'
    # vertical extent is NOT required — the skin model is fit on the full-image
    # mask before cropping (see pipeline) so the crop can stay tight.
    ys, xs = np.nonzero(roi_full > 0)
    margin = int(0.06 * face_width)
    x0 = max(int(xs.min()) - margin, 0)
    x1 = min(int(xs.max()) + margin, w)
    y0 = max(int(ys.min()) - margin, 0)
    y1 = min(int(ys.max()) + margin, h)

    crop_landmarks = landmarks - np.array([x0, y0], dtype=np.float32)
    lips = crop_landmarks[LIPS_OUTER]
    lip_top_y = lips[:, 1].min()
    lip_bottom_y = lips[:, 1].max()
    mouth_l = crop_landmarks[MOUTH_CORNERS[0]][0]
    mouth_r = crop_landmarks[MOUTH_CORNERS[1]][0]
    mouth_cx = (mouth_l + mouth_r) / 2
    mouth_half = abs(mouth_r - mouth_l) / 2

    roi = roi_full[y0:y1, x0:x1]
    ch, cw = roi.shape
    yy, xx = np.mgrid[0:ch, 0:cw].astype(np.float32)

    mustache = ((yy < lip_top_y) & (np.abs(xx - mouth_cx) < mouth_half * 1.5)).astype(np.float32)
    chin = ((yy > lip_bottom_y) & (np.abs(xx - mouth_cx) < mouth_half * 1.2)).astype(np.float32)
    mouth_side = ((yy >= lip_top_y) & (yy <= lip_bottom_y)).astype(np.float32)
    base = np.clip(mustache + chin + mouth_side, 0, 1)
    jaw = np.clip(roi - base, 0, 1)

    protect = protect_full[y0:y1, x0:x1]
    region_masks = {
        "mustache": mustache * roi * (1 - protect),
        "chin": chin * roi * (1 - protect),
        "mouth_side": mouth_side * roi * (1 - protect),
        "jaw": jaw * (1 - protect),
    }

    return LowerFaceCrop(
        bgr=bgr[y0:y1, x0:x1].copy(),
        bbox=(x0, y0, x1, y1),
        roi_mask=roi,
        protect_mask=protect,
        skin_ref_mask=skin_ref_full[y0:y1, x0:x1],
        region_masks=region_masks,
        face_width=face_width,
        landmarks=crop_landmarks,
    )


def skin_reference_pixels(bgr: np.ndarray, landmarks: np.ndarray, face_width: float) -> np.ndarray:
    """Full-image skin reference sample (forehead + upper cheeks), as Lab pixels.

    Fit on the full image (not the crop) because the forehead patch usually
    lies above the lower-face crop.
    """
    h, w = bgr.shape[:2]
    mask = np.zeros((h, w), dtype=np.float32)
    patch_r = max(4, int(0.05 * face_width))
    forehead = (landmarks[FOREHEAD_MID] + landmarks[BROW_MID]) / 2
    _disk(mask, forehead, patch_r)
    for idx in UPPER_CHEEKS:
        _disk(mask, landmarks[idx], int(patch_r * 0.8))
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2Lab).astype(np.float32)
    return lab[mask > 0.5]
