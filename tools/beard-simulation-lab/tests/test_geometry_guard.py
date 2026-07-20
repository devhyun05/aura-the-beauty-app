"""Synthetic guard cases — prove each check actually rejects.

No face detector involved: checks are pure functions over arrays/landmarks,
so we fabricate the failure and assert the guard catches it.
"""

import cv2
import numpy as np

from engine import pipeline
from engine.beard_segmentation import BeardMasks
from engine.detect_face import JAW_OVAL, LIPS_OUTER
from engine.geometry_guard import (
    check_identity,
    check_jawline_iou,
    check_landmark_drift,
    check_mask_protect_overlap,
    check_seam_score,
)
from engine.lower_face_roi import LowerFaceCrop

RNG = np.random.default_rng(7)
INTEROCULAR = 100.0


def _landmarks() -> np.ndarray:
    pts = RNG.uniform(50, 450, size=(468, 2)).astype(np.float32)
    return pts


# --- mask ↔ protect intersection (primary pre-reject defense)

def test_protect_overlap_rejects_lip_intrusion() -> None:
    hard = np.zeros((200, 200), dtype=np.float32)
    shadow = np.zeros_like(hard)
    protect = np.zeros_like(hard)
    protect[80:120, 60:140] = 1.0          # lips
    hard[100:130, 60:140] = 0.9            # mask invades lower lip half
    check = check_mask_protect_overlap(hard, shadow, protect)
    assert not check.passed
    assert check.value > 0.2


def test_protect_overlap_passes_when_disjoint() -> None:
    hard = np.zeros((200, 200), dtype=np.float32)
    shadow = np.zeros_like(hard)
    protect = np.zeros_like(hard)
    protect[80:120, 60:140] = 1.0
    hard[140:180, 60:140] = 0.9            # chin area, clear of lips
    check = check_mask_protect_overlap(hard, shadow, protect)
    assert check.passed
    assert check.value == 0.0


def test_pipeline_rejects_large_preprotect_overlap(monkeypatch, tmp_path) -> None:
    img = _smooth_image()
    photo = tmp_path / "photo.png"
    cv2.imwrite(str(photo), img)
    roi = np.ones((200, 200), dtype=np.float32)
    protect = np.zeros_like(roi)
    protect[80:120, 60:140] = 1.0
    crop = LowerFaceCrop(
        bgr=img,
        bbox=(0, 0, 200, 200),
        roi_mask=roi,
        protect_mask=protect,
        skin_ref_mask=np.zeros_like(roi),
        region_masks={"mustache": roi.copy(), "chin": roi * 0, "mouth_side": roi * 0, "jaw": roi * 0},
        face_width=150.0,
        landmarks=np.zeros((468, 2), dtype=np.float32),
    )
    masks = BeardMasks(
        hard=np.zeros_like(roi),
        shadow=np.zeros_like(roi),
        protect=protect,
        stats={"preProtectOverlapRatio": 0.45, "protectOverlapRatio": 0.0},
    )

    class Quality:
        passed = True
        checks = {"face_found": {"passed": True}}
        reject_reason = None

    class Detection:
        quality = Quality()
        landmarks = np.zeros((468, 2), dtype=np.float32)
        face_width = 150.0
        face_height = 180.0
        interocular = 60.0

    monkeypatch.setattr(pipeline, "read_image_bgr", lambda _path: img)
    monkeypatch.setattr(pipeline, "detect_face", lambda _bgr: Detection())
    monkeypatch.setattr(pipeline, "skin_reference_pixels", lambda *_args: np.ones((60, 3), dtype=np.float32))
    monkeypatch.setattr(pipeline, "fit_skin_model", lambda _pixels: object())
    monkeypatch.setattr(pipeline, "build_lower_face_crop", lambda *_args: crop)
    monkeypatch.setattr(pipeline, "segment_beard", lambda *_args, **_kwargs: masks)

    outcome = pipeline.run_pipeline(photo, stages=["mild"], out_root=tmp_path / "runs")

    assert outcome.rejected
    assert outcome.reject_reason == "guard:mask_preprotect_overlap"


# --- landmark drift (synthetic "the edit moved the lips")

def test_landmark_drift_rejects_moved_lips() -> None:
    before = _landmarks()
    after = before.copy()
    after[LIPS_OUTER] += INTEROCULAR * 0.05   # lips shifted 5% of interocular
    check = check_landmark_drift(before, after, INTEROCULAR)
    assert not check.passed


def test_landmark_drift_passes_identity() -> None:
    before = _landmarks()
    check = check_landmark_drift(before, before.copy(), INTEROCULAR)
    assert check.passed
    assert check.value == 0.0


# --- jawline band IoU (synthetic "the edit reshaped the jaw")

def test_jawline_iou_rejects_shifted_jaw() -> None:
    before = _landmarks()
    after = before.copy()
    after[JAW_OVAL] += np.array([0.0, 30.0], dtype=np.float32)
    check = check_jawline_iou(before, after, (500, 500), face_height=300.0)
    assert not check.passed


def test_jawline_iou_passes_identity() -> None:
    before = _landmarks()
    check = check_jawline_iou(before, before.copy(), (500, 500), face_height=300.0)
    assert check.passed
    assert check.value == 1.0


# --- seam score (synthetic halo along the blend boundary)

def _smooth_image() -> np.ndarray:
    base = np.tile(np.linspace(90, 170, 200, dtype=np.float32), (200, 1))
    return cv2.cvtColor(base.astype(np.uint8), cv2.COLOR_GRAY2BGR)


def _radial_soft_blend(shape: tuple[int, int]) -> np.ndarray:
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]].astype(np.float32)
    d = np.sqrt((yy - shape[0] / 2) ** 2 + (xx - shape[1] / 2) ** 2)
    return np.clip(1.0 - d / 80.0, 0, 1)


def test_seam_score_rejects_hard_edge_at_boundary() -> None:
    original = _smooth_image()
    soft = _radial_soft_blend(original.shape[:2])
    result = original.copy()
    ring = (soft > 0.05) & (soft < 0.4)
    result[ring] = (255, 255, 255)          # burned-in halo exactly on the ring
    check = check_seam_score(original, result, soft)
    assert not check.passed


def test_seam_score_passes_unchanged() -> None:
    original = _smooth_image()
    soft = _radial_soft_blend(original.shape[:2])
    check = check_seam_score(original, original.copy(), soft)
    assert check.passed


# --- identity check plumbing (extras may be absent in the core env)

def test_identity_off_mode_returns_none() -> None:
    img = _smooth_image()
    assert check_identity(img, img, mode="off") is None


def test_identity_warn_mode_never_blocks_without_model() -> None:
    img = _smooth_image()
    check = check_identity(img, img, mode="warn")
    assert check is not None
    assert check.passed  # warn mode: missing model/undetectable face won't block
