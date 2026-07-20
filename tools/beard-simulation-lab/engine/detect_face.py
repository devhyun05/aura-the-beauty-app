"""MediaPipe FaceMesh wrapper + photo quality gate.

Uses the legacy FaceMesh solution (468/478 landmarks, bundled model — no
network download) which is enough for lower-face geometry. Landmarks are
returned in pixel coordinates as float32 (N, 2).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

# FaceMesh topology indices (canonical, stable across mediapipe releases).
LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375,
              291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
             397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
             172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
LEFT_EYE_CORNERS = (33, 133)
RIGHT_EYE_CORNERS = (362, 263)
NOSE_TIP = 1
NOSE_BOTTOM = 2
NOSTRILS = (98, 327)
CHIN_TIP = 152
MOUTH_CORNERS = (61, 291)
FOREHEAD_MID = 151
BROW_MID = 9
UPPER_CHEEKS = (117, 346)

# Jaw section of FACE_OVAL (ear → chin → ear), used for the jawline band.
JAW_OVAL = [361, 288, 397, 365, 379, 378, 400, 377, 152,
            148, 176, 149, 150, 136, 172, 58, 132]


@dataclass
class QualityGateReport:
    passed: bool
    checks: dict[str, dict] = field(default_factory=dict)
    reject_reason: str | None = None


@dataclass
class FaceDetection:
    landmarks: np.ndarray  # (N, 2) float32, pixel coords
    face_width: float
    face_height: float
    interocular: float
    quality: QualityGateReport


def _eye_center(landmarks: np.ndarray, corners: tuple[int, int]) -> np.ndarray:
    return landmarks[list(corners)].mean(axis=0)


def detect_landmarks(bgr: np.ndarray) -> np.ndarray | None:
    import mediapipe as mp

    with mp.solutions.face_mesh.FaceMesh(
        static_image_mode=True,
        refine_landmarks=True,
        max_num_faces=1,
        min_detection_confidence=0.5,
    ) as mesh:
        result = mesh.process(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    if not result.multi_face_landmarks:
        return None
    h, w = bgr.shape[:2]
    points = result.multi_face_landmarks[0].landmark
    return np.array([[p.x * w, p.y * h] for p in points], dtype=np.float32)


def measure_face(landmarks: np.ndarray) -> tuple[float, float, float]:
    oval = landmarks[FACE_OVAL]
    face_width = float(oval[:, 0].max() - oval[:, 0].min())
    face_height = float(oval[:, 1].max() - oval[:, 1].min())
    interocular = float(
        np.linalg.norm(
            _eye_center(landmarks, LEFT_EYE_CORNERS)
            - _eye_center(landmarks, RIGHT_EYE_CORNERS)
        )
    )
    return face_width, face_height, interocular


def run_quality_gate(
    bgr: np.ndarray,
    landmarks: np.ndarray | None,
    min_face_ratio: float = 0.18,
    max_roll_deg: float = 20.0,
    max_yaw_offset: float = 0.35,
    # Phone cameras apply skin smoothing and the pipeline downscales before
    # measuring, so usable selfies land around Laplacian variance 15-40; a
    # document-grade 35 false-rejects them. 8 still catches real motion blur (<5).
    min_blur_var: float = 8.0,
) -> QualityGateReport:
    checks: dict[str, dict] = {}

    def fail(reason: str) -> QualityGateReport:
        return QualityGateReport(passed=False, checks=checks, reject_reason=reason)

    if landmarks is None:
        checks["face_found"] = {"passed": False}
        return fail("no_face_detected")
    checks["face_found"] = {"passed": True}

    h, w = bgr.shape[:2]
    face_width, _, interocular = measure_face(landmarks)

    face_ratio = face_width / w
    checks["face_size"] = {"passed": face_ratio >= min_face_ratio, "value": face_ratio}
    if face_ratio < min_face_ratio:
        return fail("face_too_small")

    left_eye = _eye_center(landmarks, LEFT_EYE_CORNERS)
    right_eye = _eye_center(landmarks, RIGHT_EYE_CORNERS)
    roll = float(np.degrees(np.arctan2(right_eye[1] - left_eye[1],
                                       right_eye[0] - left_eye[0])))
    checks["roll"] = {"passed": abs(roll) <= max_roll_deg, "value": roll}
    if abs(roll) > max_roll_deg:
        return fail("head_tilted")

    eye_mid = (left_eye + right_eye) / 2
    yaw_offset = float((landmarks[NOSE_TIP][0] - eye_mid[0]) / max(interocular, 1e-6))
    checks["yaw"] = {"passed": abs(yaw_offset) <= max_yaw_offset, "value": yaw_offset}
    if abs(yaw_offset) > max_yaw_offset:
        return fail("face_not_frontal")

    x0, x1 = int(max(landmarks[:, 0].min(), 0)), int(min(landmarks[:, 0].max(), w))
    y0, y1 = int(max(landmarks[:, 1].min(), 0)), int(min(landmarks[:, 1].max(), h))
    face_crop = bgr[y0:y1, x0:x1]
    gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
    blur_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    checks["blur"] = {"passed": blur_var >= min_blur_var, "value": blur_var}
    if blur_var < min_blur_var:
        return fail("photo_too_blurry")

    brightness = float(gray.mean())
    brightness_ok = 40.0 <= brightness <= 235.0
    checks["brightness"] = {"passed": brightness_ok, "value": brightness}
    if not brightness_ok:
        return fail("bad_lighting")

    return QualityGateReport(passed=True, checks=checks)


def detect_face(bgr: np.ndarray) -> FaceDetection | None:
    """Detect + gate. Returns None only when no face at all was found."""
    landmarks = detect_landmarks(bgr)
    quality = run_quality_gate(bgr, landmarks)
    if landmarks is None:
        return None
    face_width, face_height, interocular = measure_face(landmarks)
    return FaceDetection(
        landmarks=landmarks,
        face_width=face_width,
        face_height=face_height,
        interocular=interocular,
        quality=quality,
    )
