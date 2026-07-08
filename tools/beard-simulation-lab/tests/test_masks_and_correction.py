"""Segmentation + correction on a fully synthetic lower-face crop.

Builds a skin-colored crop with a bluish shadow patch and dark stubble dots,
then asserts: shadow lights up where the tint is, hard lights up on the dots,
correction moves shadow pixels toward the skin reference, and recomposition
leaves everything outside the blend mask bit-identical.
"""

import numpy as np

from engine.beard_segmentation import (
    _CLIPSEG_CACHE,
    _component_filter,
    _load_clipseg_components,
    fit_skin_model,
    segment_beard,
)
from engine.beard_shadow_corrector import correct_crop
from engine.blend import composite_full, derive_soft_blend
from engine.detect_face import (
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
from engine.lower_face_roi import LowerFaceCrop, build_lower_face_crop

import cv2

SKIN_BGR = np.array([150, 170, 210], dtype=np.float32)  # warm light skin
SIZE = 320
FACE_WIDTH = 280.0
RNG = np.random.default_rng(3)


def _synthetic_crop() -> tuple[LowerFaceCrop, np.ndarray]:
    img = np.ones((SIZE, SIZE, 3), dtype=np.float32) * SKIN_BGR
    img += RNG.normal(0, 3, img.shape)  # mild skin texture noise

    # Bluish beard shadow: darker + shifted toward blue, lower-left block.
    shadow_zone = (slice(180, 300), slice(30, 150))
    img[shadow_zone] += np.array([25, -20, -45], dtype=np.float32)

    # Stubble: sparse dark dots, lower-right block.
    dot_zone_pts = RNG.integers(0, 100, size=(160, 2))
    for dy, dx in dot_zone_pts:
        cv2.circle(img, (190 + int(dx), 190 + int(dy)), 1, (35, 30, 40), -1)

    img = np.clip(img, 0, 255).astype(np.uint8)

    roi = np.zeros((SIZE, SIZE), dtype=np.float32)
    roi[100:310, 10:310] = 1.0
    protect = np.zeros_like(roi)
    protect[110:150, 120:200] = 1.0        # "lips"
    skin_ref = np.zeros_like(roi)
    skin_ref[20:60, 100:220] = 1.0         # clean patch, top

    region_masks = {
        "mustache": np.zeros_like(roi),
        "chin": roi * 0,
        "mouth_side": roi * 0,
        "jaw": roi.copy(),
    }
    crop = LowerFaceCrop(
        bgr=img,
        bbox=(0, 0, SIZE, SIZE),
        roi_mask=roi,
        protect_mask=protect,
        skin_ref_mask=skin_ref,
        region_masks=region_masks,
        face_width=FACE_WIDTH,
        landmarks=np.zeros((468, 2), dtype=np.float32),
    )
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2Lab).astype(np.float32)
    ref_pixels = lab[skin_ref > 0.5]
    return crop, ref_pixels


def test_shadow_branch_finds_tinted_zone() -> None:
    crop, ref = _synthetic_crop()
    masks = segment_beard(crop, fit_skin_model(ref))
    shadow_zone_mean = masks.shadow[190:290, 40:140].mean()
    clean_zone_mean = masks.shadow[110:170, 230:300].mean()
    assert shadow_zone_mean > 0.25
    assert shadow_zone_mean > clean_zone_mean * 3


def test_hard_branch_finds_stubble_dots() -> None:
    crop, ref = _synthetic_crop()
    masks = segment_beard(crop, fit_skin_model(ref))
    dot_zone_mean = masks.hard[195:285, 195:285].mean()
    clean_zone_mean = masks.hard[110:170, 230:300].mean()
    assert dot_zone_mean > clean_zone_mean * 3


def test_masks_are_zero_inside_protect() -> None:
    crop, ref = _synthetic_crop()
    masks = segment_beard(crop, fit_skin_model(ref))
    assert masks.hard[crop.protect_mask > 0.5].max() == 0.0
    assert masks.shadow[crop.protect_mask > 0.5].max() == 0.0
    soft = derive_soft_blend(crop, masks)
    assert soft[crop.protect_mask > 0.5].max() == 0.0


def test_boundary_elongated_component_is_removed_but_center_is_kept() -> None:
    roi = np.zeros((120, 120), dtype=np.float32)
    roi[10:110, 10:110] = 1.0
    protect = np.zeros_like(roi)
    confidence = np.zeros_like(roi)
    confidence[108:110, 20:100] = 0.9  # jaw/neck silhouette-like boundary line
    confidence[56:59, 42:78] = 0.9     # central stubble-like line

    filtered, kept, total, boundary_dropped = _component_filter(
        confidence, roi, protect, face_width=100.0)

    assert total == 2
    assert kept == 1
    assert boundary_dropped == 1
    assert filtered[56:59, 42:78].max() > 0.2
    assert filtered[108:110, 20:100].max() == 0.0


def _landmarks_for_lower_face() -> np.ndarray:
    pts = np.zeros((468, 2), dtype=np.float32)
    center = np.array([250.0, 255.0], dtype=np.float32)
    angles = np.linspace(-0.1, 2 * np.pi - 0.1, len(FACE_OVAL), endpoint=False)
    for idx, angle in zip(FACE_OVAL, angles):
        pts[idx] = center + np.array([120.0 * np.cos(angle), 145.0 * np.sin(angle)])
    lip_rect = np.array([
        [212, 220], [220, 244], [240, 255], [260, 255], [280, 244],
        [288, 220], [276, 213], [260, 209], [240, 209], [224, 213],
    ], dtype=np.float32)
    lip_points = np.vstack([lip_rect, lip_rect])
    for idx, point in zip(LIPS_OUTER, lip_points):
        pts[idx] = point
    pts[MOUTH_CORNERS[0]] = [212, 232]
    pts[MOUTH_CORNERS[1]] = [288, 232]
    pts[NOSE_BOTTOM] = [250, 180]
    for idx, x in zip(NOSTRILS, (232, 268)):
        pts[idx] = [x, 178]
    pts[CHIN_TIP] = [250, 380]
    pts[FOREHEAD_MID] = [250, 80]
    pts[BROW_MID] = [250, 120]
    for idx, x in zip(UPPER_CHEEKS, (190, 310)):
        pts[idx] = [x, 170]
    return pts


def test_protect_dilation_is_capped_above_lip_but_keeps_lower_lip_margin() -> None:
    bgr = np.zeros((500, 500, 3), dtype=np.uint8)
    landmarks = _landmarks_for_lower_face()
    crop = build_lower_face_crop(bgr, landmarks, face_width=200.0, face_height=300.0)
    lips = crop.landmarks[LIPS_OUTER]
    top_y = int(np.floor(lips[:, 1].min()))
    bottom_y = int(np.ceil(lips[:, 1].max()))
    cx = int(round(crop.landmarks[list(MOUTH_CORNERS)].mean(axis=0)[0]))
    upper_cap = int(round(0.018 * crop.face_width))

    assert crop.protect_mask[max(top_y - upper_cap - 3, 0), cx] == 0.0
    assert crop.protect_mask[min(bottom_y + 3, crop.protect_mask.shape[0] - 1), cx] > 0.5
    assert crop.region_masks["mustache"].sum() > 0


def test_clipseg_component_loader_uses_process_cache() -> None:
    _CLIPSEG_CACHE["processor"] = None
    _CLIPSEG_CACHE["model"] = None
    calls = {"processor": 0, "model": 0}

    class FakeProcessor:
        @classmethod
        def from_pretrained(cls, _name):
            calls["processor"] += 1
            return cls()

    class FakeModel:
        @classmethod
        def from_pretrained(cls, _name):
            calls["model"] += 1
            return cls()

        def eval(self):
            return self

    first = _load_clipseg_components(FakeProcessor, FakeModel)
    second = _load_clipseg_components(FakeProcessor, FakeModel)

    assert first == second
    assert calls == {"processor": 1, "model": 1}
    _CLIPSEG_CACHE["processor"] = None
    _CLIPSEG_CACHE["model"] = None


def test_correction_moves_shadow_toward_skin() -> None:
    crop, ref = _synthetic_crop()
    model = fit_skin_model(ref)
    masks = segment_beard(crop, model)
    corrected = correct_crop(crop, masks, shadow_strength=0.85, hair_attenuation=0.85)

    zone = (slice(200, 280), slice(50, 130))
    before_dist = np.abs(crop.bgr[zone].astype(np.float32) - SKIN_BGR).mean()
    after_dist = np.abs(corrected[zone].astype(np.float32) - SKIN_BGR).mean()
    assert after_dist < before_dist * 0.7


def test_composite_untouched_outside_blend_mask() -> None:
    crop, ref = _synthetic_crop()
    masks = segment_beard(crop, fit_skin_model(ref))
    corrected = correct_crop(crop, masks, shadow_strength=0.6, hair_attenuation=0.6)
    soft = derive_soft_blend(crop, masks)

    full = np.ones((400, 400, 3), dtype=np.uint8) * 90
    full[0:SIZE, 0:SIZE] = crop.bgr
    out = composite_full(full, corrected, crop, soft)

    outside = soft == 0.0
    assert np.array_equal(out[0:SIZE, 0:SIZE][outside], full[0:SIZE, 0:SIZE][outside])
    assert np.array_equal(out[SIZE:, :], full[SIZE:, :])
