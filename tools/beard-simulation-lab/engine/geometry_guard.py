"""Geometry guard — the checks that make a result trustworthy.

Order matters:
1. mask_protect_overlap runs BEFORE any correction (pre-reject; cheapest and
   the primary defense — a mask that touches lips/nostrils never gets to run).
2. Post-correction checks compare re-detected landmarks against the input:
   landmark drift (lips/jaw, normalized by interocular), jawline-band IoU,
   seam score along the blend boundary, and identity embedding distance
   (optional extra — insightface; 'warn' mode passes with a logged warning,
   'require' fails when the model is unavailable).

Every check is a pure function over arrays/landmarks so the pytest synthetic
cases can prove the guard actually rejects (no face detector involved).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from .contracts import PROTECT_OVERLAP_REJECT_RATIO
from .detect_face import JAW_OVAL, LIPS_OUTER

DEFAULT_THRESHOLDS = {
    "mask_protect_overlap": PROTECT_OVERLAP_REJECT_RATIO,
    "landmark_drift": 0.015,   # mean drift / interocular
    # Redundant-but-noisier secondary to landmark_drift: the jaw is a corrected
    # region so its re-detected landmarks jitter with appearance (not geometry —
    # landmark_drift, normalized, is the real geometry guard). A gross reshape
    # drops IoU to ~0.5-0.7, so 0.80 tolerates appearance jitter yet still trips
    # on genuine changes.
    "jawline_iou": 0.80,       # minimum
    "identity_distance": 0.70, # max cosine distance (ArcFace-style embeddings)
    "seam_score": 1.35,        # max gradient ratio along blend boundary
}


@dataclass
class GuardCheck:
    id: str
    passed: bool
    value: float
    threshold: float

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "passed": self.passed,
            "value": round(float(self.value), 6),
            "threshold": self.threshold,
        }


@dataclass
class GuardReport:
    passed: bool
    checks: list[GuardCheck] = field(default_factory=list)
    mitigations_applied: list[str] = field(default_factory=list)
    reject_reason: str | None = None

    def to_dict(self) -> dict:
        payload = {
            "passed": self.passed,
            "checks": [c.to_dict() for c in self.checks],
            "mitigationsApplied": self.mitigations_applied,
        }
        if self.reject_reason:
            payload["rejectReason"] = self.reject_reason
        return payload


def check_mask_protect_overlap(
    hard: np.ndarray,
    shadow: np.ndarray,
    protect: np.ndarray,
    threshold: float = DEFAULT_THRESHOLDS["mask_protect_overlap"],
    confidence_floor: float = 0.3,
) -> GuardCheck:
    union = np.maximum(hard, shadow) > confidence_floor
    protect_area = max(float((protect > 0.5).sum()), 1.0)
    overlap = float((union & (protect > 0.5)).sum() / protect_area)
    return GuardCheck("mask_protect_overlap", overlap <= threshold, overlap, threshold)


def check_landmark_drift(
    before: np.ndarray,
    after: np.ndarray,
    interocular: float,
    threshold: float = DEFAULT_THRESHOLDS["landmark_drift"],
) -> GuardCheck:
    idx = LIPS_OUTER + JAW_OVAL
    drift = np.linalg.norm(after[idx] - before[idx], axis=1).mean()
    value = float(drift / max(interocular, 1e-6))
    return GuardCheck("landmark_drift", value <= threshold, value, threshold)


def _jaw_band_mask(landmarks: np.ndarray, shape: tuple[int, int], band_px: int) -> np.ndarray:
    mask = np.zeros(shape, dtype=np.uint8)
    pts = landmarks[JAW_OVAL].astype(np.int32)
    cv2.polylines(mask, [pts], isClosed=False, color=255, thickness=band_px)
    return mask > 0


def check_jawline_iou(
    before: np.ndarray,
    after: np.ndarray,
    shape: tuple[int, int],
    face_height: float,
    threshold: float = DEFAULT_THRESHOLDS["jawline_iou"],
) -> GuardCheck:
    band_px = max(3, int(0.04 * face_height))
    a = _jaw_band_mask(before, shape, band_px)
    b = _jaw_band_mask(after, shape, band_px)
    inter = float((a & b).sum())
    union = max(float((a | b).sum()), 1.0)
    iou = inter / union
    return GuardCheck("jawline_iou", iou >= threshold, iou, threshold)


def check_seam_score(
    original: np.ndarray,
    result: np.ndarray,
    soft_blend: np.ndarray,
    threshold: float = DEFAULT_THRESHOLDS["seam_score"],
) -> GuardCheck:
    """Gradient energy along the blend boundary ring must not spike — a halo
    or hard seam shows up as new gradients where the mask fades."""
    ring = (soft_blend > 0.05) & (soft_blend < 0.4)
    if ring.sum() < 20:
        return GuardCheck("seam_score", True, 0.0, threshold)

    def grad_mag(img: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
        gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        return np.sqrt(gx * gx + gy * gy)

    g0 = float(grad_mag(original)[ring].mean())
    g1 = float(grad_mag(result)[ring].mean())
    value = g1 / max(g0, 1e-6)
    return GuardCheck("seam_score", value <= threshold, value, threshold)


def check_identity(
    original: np.ndarray,
    result: np.ndarray,
    mode: str = "warn",
    threshold: float = DEFAULT_THRESHOLDS["identity_distance"],
) -> GuardCheck | None:
    """Cosine distance between face embeddings. mode: off | warn | require."""
    if mode == "off":
        return None
    try:
        distance = _identity_distance(original, result)
    except RuntimeError:
        if mode == "require":
            return GuardCheck("identity_distance", False, -1.0, threshold)
        return GuardCheck("identity_distance", True, -1.0, threshold)
    return GuardCheck("identity_distance", distance <= threshold, distance, threshold)


_FACE_ANALYSIS = None


def _identity_distance(original: np.ndarray, result: np.ndarray) -> float:
    global _FACE_ANALYSIS
    try:
        from insightface.app import FaceAnalysis
    except ImportError as exc:
        raise RuntimeError(
            "identity check requires extras: pip install insightface onnxruntime"
        ) from exc
    if _FACE_ANALYSIS is None:
        _FACE_ANALYSIS = FaceAnalysis(allowed_modules=["detection", "recognition"])
        _FACE_ANALYSIS.prepare(ctx_id=-1)
    faces_a = _FACE_ANALYSIS.get(original)
    faces_b = _FACE_ANALYSIS.get(result)
    if not faces_a or not faces_b:
        raise RuntimeError("identity model found no face")
    ea = faces_a[0].normed_embedding
    eb = faces_b[0].normed_embedding
    return float(1.0 - np.dot(ea, eb))


def run_post_checks(
    original: np.ndarray,
    result: np.ndarray,
    landmarks_before: np.ndarray,
    landmarks_after: np.ndarray | None,
    interocular: float,
    face_height: float,
    soft_blend_full: np.ndarray,
    identity_mode: str = "warn",
    thresholds: dict | None = None,
) -> GuardReport:
    th = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    checks: list[GuardCheck] = []

    if landmarks_after is None:
        return GuardReport(
            passed=False, checks=checks, reject_reason="guard:face_lost_after_edit"
        )

    checks.append(check_landmark_drift(
        landmarks_before, landmarks_after, interocular, th["landmark_drift"]))
    checks.append(check_jawline_iou(
        landmarks_before, landmarks_after, original.shape[:2], face_height,
        th["jawline_iou"]))
    checks.append(check_seam_score(original, result, soft_blend_full, th["seam_score"]))
    identity = check_identity(original, result, identity_mode, th["identity_distance"])
    if identity is not None:
        checks.append(identity)

    failed = [c for c in checks if not c.passed]
    return GuardReport(
        passed=not failed,
        checks=checks,
        reject_reason=f"guard:{failed[0].id}" if failed else None,
    )
