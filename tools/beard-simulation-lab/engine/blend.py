"""soft_blend derivation and final recomposition.

soft_blend is DERIVED (contract): feather(max(hard, shadow) × roi − protect).
Recomposition pastes the corrected crop back into the untouched original —
outside the blend mask the result is bit-identical to the input by
construction.
"""

from __future__ import annotations

import cv2
import numpy as np

from .beard_segmentation import BeardMasks, confidence_ramp
from .lower_face_roi import LowerFaceCrop


def derive_soft_blend(
    crop: LowerFaceCrop, masks: BeardMasks, feather_ratio: float = 0.035
) -> np.ndarray:
    union = np.maximum(masks.hard, masks.shadow) * crop.roi_mask
    union = union * (1 - crop.protect_mask)
    # The alpha's job is the SPATIAL seam, not confidence weighting -- the
    # corrector already weighted every edit by mask confidence, so multiplying
    # raw union in again squares it (0.57 mean alpha inside psd04's zone core,
    # which threw away half the correction). Saturate to a clean interior first.
    core = (confidence_ramp(union) > 0.5).astype(np.uint8)

    # Feather INWARD from the zone edge, not outward. An outward Gaussian left
    # alpha ~0.5 sitting exactly on the visible boundary -- a half-applied edit
    # whose tone step read as a band along the jaw (the seam the user saw; the
    # Sobel-based seam_score guard missed it because a smooth tonal step has low
    # gradient). A distance ramp makes the edit zero AT the boundary and reach
    # full strength `ramp_px` inside, so there is no step to see, and because
    # the ramp depends only on distance -- not on the heat value -- the blocky
    # CLIPSeg upsampling can no longer print itself into the interior.
    ramp_px = max(4.0, feather_ratio * crop.face_width)
    dist = cv2.distanceTransform(core, cv2.DIST_L2, 3)
    t = np.clip(dist / ramp_px, 0, 1)
    soft = (t * t * (3 - 2 * t)).astype(np.float32)
    # Feathering must never leak into the protect area.
    soft = soft * (1 - crop.protect_mask)
    return np.clip(soft, 0, 1).astype(np.float32)


def composite_full(
    original_bgr: np.ndarray,
    corrected_crop: np.ndarray,
    crop: LowerFaceCrop,
    soft_blend: np.ndarray,
    global_strength: float = 1.0,
) -> np.ndarray:
    out = original_bgr.copy()
    x0, y0, x1, y1 = crop.bbox
    region = out[y0:y1, x0:x1].astype(np.float32)
    w = np.clip(soft_blend * global_strength, 0, 1)[..., None]
    blended = region * (1 - w) + corrected_crop.astype(np.float32) * w
    out[y0:y1, x0:x1] = np.clip(blended, 0, 255).astype(np.uint8)
    return out


def erode_masks(masks: BeardMasks, face_width: float, ratio: float = 0.01) -> BeardMasks:
    """Guard mitigation step: pull the masks inward."""
    k = max(3, int(ratio * face_width) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    return BeardMasks(
        hard=cv2.erode(masks.hard, kernel),
        shadow=cv2.erode(masks.shadow, kernel),
        protect=masks.protect,
        stats=dict(masks.stats),
    )
