"""Deterministic correction — frequency separation on the lower-face crop.

Split the crop into a low-frequency (color/shading) and high-frequency
(texture) layer:
- shadow is a low-frequency color problem → inpaint the low layer under the
  beard mask (smooth skin-colored base) and lerp toward it by confidence ×
  stage strength;
- stubble is high-frequency → attenuate the high layer inside the hard-hair
  mask; skin texture outside hair pixels is untouched.

Only accepts LowerFaceCrop-shaped arrays; the full frame never reaches this
module (structural no-full-face-img2img rule).
"""

from __future__ import annotations

import cv2
import numpy as np

from .beard_segmentation import BeardMasks
from .lower_face_roi import LowerFaceCrop

# Never remove all high-frequency signal — a fully flat patch reads as
# "plastic skin" and fails the 제모/면도 distinction reviewers check for.
MAX_HIGH_ATTENUATION = 0.85


def correct_crop(
    crop: LowerFaceCrop,
    masks: BeardMasks,
    shadow_strength: float,
    hair_attenuation: float,
    stubble_inpaint: bool = False,
) -> np.ndarray:
    img = crop.bgr.astype(np.float32)
    fw = crop.face_width
    sigma = max(2.0, fw / 30)

    low = cv2.GaussianBlur(img, (0, 0), sigmaX=sigma)
    high = img - low

    # Smooth skin-colored base under the beard: inpaint the low layer.
    union = np.maximum(masks.shadow, masks.hard)
    inpaint_mask = ((union > 0.22).astype(np.uint8)) * 255
    inpaint_mask = cv2.dilate(
        inpaint_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    radius = max(3, int(fw / 40))
    low_u8 = np.clip(low, 0, 255).astype(np.uint8)
    low_inpainted = cv2.inpaint(low_u8, inpaint_mask, radius, cv2.INPAINT_TELEA)
    low_inpainted = low_inpainted.astype(np.float32)

    shadow_w = np.clip(masks.shadow * shadow_strength
                       + masks.hard * shadow_strength * 0.6, 0, 1)[..., None]
    low_out = low * (1 - shadow_w) + low_inpainted * shadow_w

    hair_w = np.clip(masks.hard * hair_attenuation, 0, MAX_HIGH_ATTENUATION)[..., None]
    high_out = high * (1 - hair_w)

    out = np.clip(low_out + high_out, 0, 255).astype(np.uint8)

    if stubble_inpaint:
        out = _stubble_inpaint(out, masks, fw, hair_attenuation)
    return out


def _stubble_inpaint(
    bgr: np.ndarray, masks: BeardMasks, face_width: float, strength: float
) -> np.ndarray:
    """Strong stage: remove residual dark dots with a full-res Telea pass,
    blended back by hard-hair confidence so surrounding skin is untouched."""
    dot_mask = ((masks.hard > 0.45).astype(np.uint8)) * 255
    if dot_mask.sum() == 0:
        return bgr
    radius = max(2, int(face_width / 120))
    inpainted = cv2.inpaint(bgr, dot_mask, radius, cv2.INPAINT_TELEA)
    w = np.clip(masks.hard * strength, 0, 1)[..., None]
    return np.clip(bgr * (1 - w) + inpainted * w, 0, 255).astype(np.uint8)
