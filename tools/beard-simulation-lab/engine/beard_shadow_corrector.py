"""Deterministic correction on the lower-face crop.

Three operations, in the order the smear demands:

A. Strands are removed FIRST, on the native uint8 crop, by inpainting only the
   thin dark structures. The frequency split then sees strand-free pixels, so
   hair darkness is never blurred into the low layer to begin with.
B. Shadow is a low-frequency colour problem -> the low layer is pulled toward a
   skin-coloured base under the beard mask.
C. Stubble is high-frequency -> the high layer is attenuated inside the hair
   mask. Skin texture outside hair pixels is untouched.

The expensive parts (strand detection, inpaint, frequency split) depend only on
the photo, not on the stage. The guard's mitigation ladder calls the corrector
up to four times per stage across three stages, so they are hoisted into a
`CorrectionContext` built once and the per-stage call is pure blending.

Only accepts LowerFaceCrop-shaped arrays; the full frame never reaches this
module (structural no-full-face-img2img rule).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from .beard_segmentation import BeardMasks
from .lower_face_roi import LowerFaceCrop

# Never remove all high-frequency signal — a fully flat patch reads as
# "plastic skin" and fails the 제모/면도 distinction reviewers check for.
MAX_HIGH_ATTENUATION = 0.85

# Black-hat kernel for strand detection, as a fraction of face width. Sits
# between C1's small (0.007) and medium (0.015) probes: wide enough to swallow a
# hair, narrow enough that a solid beard blob is not "thin".
_STRAND_KERNEL_RATIO = 0.010
# Keep only the darkest tail of the black-hat response inside the zone.
_STRAND_PERCENTILE = 94.0
# Above this the "strands" are really a solid mass; inpainting it would be the
# directional smear we are removing. Fall through to the shadow/high branches.
_MAX_STRAND_COVERAGE = 0.35
_ZONE_FLOOR = 0.20  # only look for strands where the detector says beard


def _odd(value: float) -> int:
    return max(3, int(value) | 1)


@dataclass
class CorrectionContext:
    """Photo-scoped, stage-independent. Built once, blended many times.

    Holds only what is expensive: one black-hat and two Telea passes. The
    frequency split is a Gaussian blur and stays per-stage, because the split
    must be taken of the stage's own strand-blended base -- blurring is linear
    but the strand weight is not, so it cannot be hoisted without changing the
    result.
    """

    strand: np.ndarray         # float32 0..1, thin dark structures in the zone
    clean_full: np.ndarray     # float32 BGR, strand-inpainted crop
    low_inpainted: np.ndarray  # skin-coloured base under the beard
    stats: dict = field(default_factory=dict)


def _strand_mask(crop: LowerFaceCrop, masks: BeardMasks) -> tuple[np.ndarray, dict]:
    """Thin dark structures inside the beard zone.

    Derived from the crop's own luminance rather than from `masks.hard`, because
    `hard` does not reliably carry strands: segment_beard solidifies it into
    blobs once strand coverage passes 0.28, and the shipping configuration
    replaces it with CLIPSeg's broad zone. Morphological thinning of a blob
    yields its fringe, not hair. A black-hat on the image finds what is actually
    thin and dark, whatever the mask happens to mean.
    """
    fw = crop.face_width
    lum = cv2.cvtColor(crop.bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    k = _odd(fw * _STRAND_KERNEL_RATIO)
    bh = cv2.morphologyEx(
        lum, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))

    zone = np.maximum(masks.hard, masks.shadow) * crop.roi_mask
    zone = zone * (1 - crop.protect_mask)
    inside = bh[zone > _ZONE_FLOOR]
    if inside.size < 64:
        return np.zeros_like(bh), {"strandCoverage": 0.0, "strandSkipped": False}

    thr = float(np.percentile(inside, _STRAND_PERCENTILE))
    if thr <= 1e-3:
        return np.zeros_like(bh), {"strandCoverage": 0.0, "strandSkipped": False}
    strand = np.clip((bh - thr) / max(thr, 1e-3), 0, 1).astype(np.float32)
    strand = strand * (zone > _ZONE_FLOOR) * (1 - crop.protect_mask)

    roi_area = max(float(crop.roi_mask.sum()), 1.0)
    coverage = float((strand > 0.5).sum() / roi_area)
    if coverage > _MAX_STRAND_COVERAGE:
        # Not strands: a solid mass. Inpainting it would smear the chin.
        return np.zeros_like(bh), {"strandCoverage": coverage, "strandSkipped": True}
    return strand, {"strandCoverage": coverage, "strandSkipped": False}


def build_correction_context(
    crop: LowerFaceCrop, masks: BeardMasks
) -> CorrectionContext:
    fw = crop.face_width
    strand, stats = _strand_mask(crop, masks)

    # Inpaint on the NATIVE uint8 crop. The old code inpainted the float low
    # layer via a uint8 round-trip, injecting 0.577 RMS of quantization noise
    # (1/sqrt(3)) against a layer whose own high-frequency content is 0.29-0.35.
    if strand.max() > 0:
        strand_u8 = ((strand > 0.5).astype(np.uint8)) * 255
        strand_u8 = cv2.dilate(
            strand_u8, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
        radius = max(2, int(fw / 150))
        clean_u8 = cv2.inpaint(crop.bgr, strand_u8, radius, cv2.INPAINT_TELEA)
    else:
        clean_u8 = crop.bgr
    clean_full = clean_u8.astype(np.float32)

    # Skin-coloured base under the beard. Built from the strand-free crop, so
    # hair darkness is no longer blurred into it before the fill. Replaced
    # wholesale in Step 2 -- it still carries the uint8 round-trip.
    low = cv2.GaussianBlur(clean_full, (0, 0), sigmaX=max(2.0, fw / 30))
    union = np.maximum(masks.shadow, masks.hard)
    inpaint_mask = ((union > 0.22).astype(np.uint8)) * 255
    inpaint_mask = cv2.dilate(
        inpaint_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    low_u8 = np.clip(low, 0, 255).astype(np.uint8)
    low_inpainted = cv2.inpaint(
        low_u8, inpaint_mask, max(3, int(fw / 40)), cv2.INPAINT_TELEA).astype(np.float32)

    return CorrectionContext(strand=strand, clean_full=clean_full,
                             low_inpainted=low_inpainted, stats=stats)


def correct_crop(
    crop: LowerFaceCrop,
    masks: BeardMasks,
    shadow_strength: float,
    hair_attenuation: float,
    stubble_inpaint: bool = False,
    *,
    strand_strength: float | None = None,
    context: CorrectionContext | None = None,
) -> np.ndarray:
    """Stage application. Pure blending over a `context` when one is supplied.

    `stubble_inpaint` is kept for callers that predate strand removal: it used to
    trigger a separate full-res Telea pass over `hard > 0.45`. Strand removal now
    does that job for every stage, so the flag only selects a strength.
    """
    ctx = context if context is not None else build_correction_context(crop, masks)
    if strand_strength is None:
        strand_strength = 0.9 if stubble_inpaint else hair_attenuation

    img = crop.bgr.astype(np.float32)
    # A: strands out first, weighted by confidence. Where no strand was found
    # the base is the input, so skin between the hairs is untouched.
    w_strand = np.clip(ctx.strand * strand_strength, 0, 1)[..., None]
    base = img * (1 - w_strand) + ctx.clean_full * w_strand

    # The split is taken of the strand-free base: hair darkness never enters the
    # low layer, which is the third smear source the old ordering created.
    low = cv2.GaussianBlur(base, (0, 0), sigmaX=max(2.0, crop.face_width / 30))
    high = base - low

    # B: shadow is low-frequency colour.
    shadow_w = np.clip(masks.shadow * shadow_strength
                       + masks.hard * shadow_strength * 0.6, 0, 1)[..., None]
    low_out = low * (1 - shadow_w) + ctx.low_inpainted * shadow_w

    # C: stubble is high-frequency.
    hair_w = np.clip(masks.hard * hair_attenuation, 0, MAX_HIGH_ATTENUATION)[..., None]
    high_out = high * (1 - hair_w)

    return np.clip(low_out + high_out, 0, 255).astype(np.uint8)
