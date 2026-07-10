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

from .beard_segmentation import (
    BeardMasks, SkinModel, confidence_ramp, local_skin_reference,
)
from .lower_face_roi import LowerFaceCrop
from .texture import build_grain_field, grain_map, relative_grain_map

# Never remove all high-frequency signal — a fully flat patch reads as
# "plastic skin" and fails the 제모/면도 distinction reviewers check for.
MAX_HIGH_ATTENUATION = 0.85

# Black-hat kernel for strand detection, as a fraction of face width. Sits
# between C1's small (0.007) and medium (0.015) probes: wide enough to swallow a
# hair, narrow enough that a solid beard blob is not "thin".
_STRAND_KERNEL_RATIO = 0.010
# Keep only the darkest tail of the black-hat response inside the zone.
# 94 left the mid-dark hairs standing ("아예 안 지워진 것처럼 보여"); 90 widens
# the net to the top 10% while _MAX_STRAND_COVERAGE still rejects solid masses.
_STRAND_PERCENTILE = 90.0
# Above this the "strands" are really a solid mass; inpainting it would be the
# directional smear we are removing. Fall through to the shadow/high branches.
_MAX_STRAND_COVERAGE = 0.35
_ZONE_FLOOR = 0.20  # only look for strands where the detector says beard

# The local reference keeps illumination, but its CHROMA must stay believable
# skin. On psd05 the field drifted 11-13 ab-units from the person's global skin
# chroma across the whole zone (healthy photos sit under 6) and full-strength
# correction painted that drift as an orange stain. Trust the local field's
# shading; cap how far its colour may wander from the global skin model.
_MAX_REF_AB_DEV = 6.0

# How much of the luminance gap to the skin reference we close. The old 0.75
# guarded against flattening the jaw's shading, but that fear belonged to the
# global skin target: the LOCAL reference field keeps the illumination
# gradient by construction, so closing the gap fully follows the face's own
# shading instead of erasing it. At 0.75 the exposed stubble-mean stayed ~10
# gray levels under the inter-hair skin and read as a grey band (psd04).
DEFAULT_LUMA_SHIFT = 1.0


def _odd(value: float) -> int:
    return max(3, int(value) | 1)


def _bgr_to_lab(bgr: np.ndarray) -> np.ndarray:
    """float32 BGR 0..255 -> Lab on the uint8 scale (L 0..255, a/b centred 128).

    Via the float path, never through uint8: quantizing an intermediate layer
    injects 0.577 RMS of noise (1/sqrt(3)) against skin whose own high-frequency
    content is 0.29-0.35 -- measured, and the reason the old low-layer inpaint
    raised grain instead of smoothing it.
    """
    lab = cv2.cvtColor(np.clip(bgr, 0, 255) / 255.0, cv2.COLOR_BGR2Lab)
    out = np.empty_like(lab)
    out[..., 0] = lab[..., 0] * 2.55
    out[..., 1] = lab[..., 1] + 128.0
    out[..., 2] = lab[..., 2] + 128.0
    return out


def _lab_to_bgr(lab_u8scale: np.ndarray) -> np.ndarray:
    lab = np.empty_like(lab_u8scale)
    lab[..., 0] = lab_u8scale[..., 0] / 2.55
    lab[..., 1] = lab_u8scale[..., 1] - 128.0
    lab[..., 2] = lab_u8scale[..., 2] - 128.0
    return cv2.cvtColor(lab, cv2.COLOR_Lab2BGR) * 255.0


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
    local_ref_lab: np.ndarray  # smooth local skin Lab field, illumination kept
    grain: np.ndarray | None = None   # unit-RMS field quilted from own skin
    ref_rel_grain: float | None = None  # clean skin's texture contrast (target)
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
    crop: LowerFaceCrop, masks: BeardMasks, skin_model: SkinModel | None = None
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

    # Where the beard's colour should go. Not an inpaint: cv2.inpaint diffuses
    # neighbouring colour across a binarized `union > 0.22` mask, which printed
    # the mask's own straight edge into the photo and wiped the skin inside it
    # flat. This field is a normalized Gaussian average of the person's nearby
    # clean skin, so it is smooth, edge-free, and keeps the illumination gradient.
    local_ref_lab = local_skin_reference(crop, masks.hard, skin_model)
    if skin_model is not None:
        dev = local_ref_lab[..., 1:] - skin_model.mean[1:]
        norm = np.linalg.norm(dev, axis=-1, keepdims=True)
        scale = np.minimum(1.0, _MAX_REF_AB_DEV / np.maximum(norm, 1e-6))
        clamped = float((scale < 1.0).mean())
        local_ref_lab = local_ref_lab.copy()
        local_ref_lab[..., 1:] = skin_model.mean[1:] + dev * scale
        stats["refChromaClamped"] = clamped

    # Re-grain material: this person's own clean-skin texture. The canonical
    # reference patches (forehead, upper cheeks) live OUTSIDE the lower-face
    # crop, so `skin_ref_mask` is empty on real crops (the plan's F4 risk) --
    # fall back to the in-crop skin the detector itself called beard-free,
    # eroded away from mask and protect boundaries. If even that is too small
    # or flat, the field is None and re-grain degrades to off (in stats).
    sample = crop.skin_ref_mask
    if float((sample > 0.5).sum()) < 32 * 32:
        union = np.maximum(masks.hard, masks.shadow)
        clean = ((union < 0.10) * crop.roi_mask * (1 - crop.protect_mask))
        sample = cv2.erode(clean.astype(np.float32), np.ones((9, 9), np.float32))
    grain = build_grain_field(crop.bgr, sample)
    ref_rel_grain = None
    ref_px = sample > 0.5
    if grain is not None and ref_px.any():
        if float(np.median(grain_map(crop.bgr)[ref_px])) >= 0.05:
            ref_rel_grain = float(np.median(relative_grain_map(crop.bgr)[ref_px]))
    stats["grainBankOk"] = bool(grain is not None and ref_rel_grain is not None)

    return CorrectionContext(strand=strand, clean_full=clean_full,
                             local_ref_lab=local_ref_lab, grain=grain,
                             ref_rel_grain=ref_rel_grain, stats=stats)


def correct_crop(
    crop: LowerFaceCrop,
    masks: BeardMasks,
    shadow_strength: float,
    hair_attenuation: float,
    stubble_inpaint: bool = False,
    *,
    strand_strength: float | None = None,
    luma_shift_frac: float = DEFAULT_LUMA_SHIFT,
    regrain: bool = False,
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

    # B: shadow is low-frequency colour. Move the low layer's chroma home to the
    # local skin reference, and its luminance only partway, so the jaw keeps its
    # own shading instead of being lit flat. Confidence is saturated first:
    # where the detector is sure, the stage strength alone decides how far the
    # colour moves (raw confidence here plus raw union in the composite alpha
    # squared the confidence and left the exposed stubble-mean as a grey band).
    conf_shadow = confidence_ramp(masks.shadow)
    conf_hard = confidence_ramp(masks.hard)
    shadow_w = np.clip(conf_shadow * shadow_strength
                       + conf_hard * shadow_strength * 0.6, 0, 1)
    low_lab = _bgr_to_lab(low)
    delta = ctx.local_ref_lab - low_lab
    low_lab[..., 0] += delta[..., 0] * shadow_w * luma_shift_frac
    low_lab[..., 1] += delta[..., 1] * shadow_w
    low_lab[..., 2] += delta[..., 2] * shadow_w
    low_out = _lab_to_bgr(low_lab)

    # C: stubble is high-frequency.
    hair_w = np.clip(conf_hard * hair_attenuation, 0, MAX_HIGH_ATTENUATION)[..., None]
    high_out = high * (1 - hair_w)

    # Inside a dark stubble band the high layer is not zero-mean: the blur that
    # made `low` pulled the brighter surroundings in, so `high` carries the
    # band's average darkness (-5 gray on psd04), whose attenuated residual
    # prints straight into the result as a grey band. Texture's job is detail,
    # not tone -- hand the local mean back to the (shifted) low layer by
    # removing it, gated on zone confidence so pixels outside the beard keep
    # their exact high layer.
    conf_zone = np.maximum(conf_hard, conf_shadow)[..., None]
    debt = cv2.GaussianBlur(high_out, (0, 0), sigmaX=max(2.0, crop.face_width / 30))
    high_out = high_out - debt * conf_zone

    out = low_out + high_out

    # D: re-grain. Attenuating the hair also removed the pores that lived on
    # the same pixels, and nothing above puts texture back -- the matte-patch
    # look. Refill by ENERGY shortfall, not linearly: grain adds in quadrature,
    # so the injection is sqrt(target^2 - current^2) -- self-limiting where
    # texture survived, full strength where the zone went flat. The target
    # scales with local luminance (texture contrast is what the eye keys on),
    # so shaded skin gets a quiet grain. Luminance-only, zone-gated.
    if regrain and ctx.grain is not None and ctx.ref_rel_grain:
        lum = (out[..., 0] * 0.114 + out[..., 1] * 0.587 + out[..., 2] * 0.299)
        hp = lum - cv2.GaussianBlur(lum, (0, 0), 2.0)
        cur2 = cv2.boxFilter(hp * hp, -1, (7, 7))
        base = cv2.GaussianBlur(lum, (0, 0), 8.0)
        target = ctx.ref_rel_grain * np.maximum(base, 8.0)
        add = np.sqrt(np.maximum(target * target - cur2, 0.0))
        out = out + (ctx.grain * add * conf_zone[..., 0])[..., None]

    return np.clip(out, 0, 255).astype(np.uint8)
