from __future__ import annotations

import io
import math
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

try:
  import mediapipe as mp
  from mediapipe.tasks import python as mp_tasks
  from mediapipe.tasks.python import vision as mp_tasks_vision
except Exception:  # noqa: BLE001 - MediaPipe is an optional runtime capability for this module.
  mp = None
  mp_tasks = None
  mp_tasks_vision = None


MAX_INPUT_PIXELS = 25_000_000
MIN_IMAGE_SHORT_EDGE = 480
MIN_IMAGE_LONG_EDGE = 640
MIN_FACE_WIDTH_RATIO = 0.24
MIN_FACE_AREA_RATIO = 0.09
MAX_FACE_WIDTH_RATIO = 0.96
MAX_FACE_AREA_RATIO = 0.86
UNDEREXPOSED_MEAN = 48.0
OVEREXPOSED_MEAN = 212.0
SHADOW_PIXEL_MAX = 20
HIGHLIGHT_PIXEL_MIN = 235
MAX_SHADOW_RATIO = 0.62
MAX_HIGHLIGHT_RATIO = 0.62
MIN_BLUR_SCORE = 18.0
MAX_ABS_YAW_DEG = 28.0
MAX_ABS_PITCH_DEG = 24.0
MAX_ABS_ROLL_DEG = 20.0
QUALITY_SAMPLE_MAX_EDGE = 1024
DETECTOR_MAX_EDGE = 1600
BEDROCK_REGION_MAX_EDGE = 1568
BEDROCK_REGION_MAX_BYTES = 3_500_000
REGION_JPEG_QUALITIES = (90, 84, 76, 68, 60, 52, 44)
LOCAL_FACE_LANDMARKER_MODEL_PATH = (
  Path(__file__).resolve().parents[2] / "models" / "face_landmarker.task"
)

REGION_NAMES = (
  "full",
  "left_eye",
  "right_eye",
  "left_cheek",
  "right_cheek",
  "lips",
)
MAKEUP_CROP_METADATA_VERSION = "makeup-face-crops-v1"
MAKEUP_ALIGNMENT_METADATA_VERSION = "makeup-face-alignment-v1"

# MediaPipe names left/right anatomically. Product regions are intentionally
# screen-relative, so image-left uses the official RIGHT feature connections.
# These tuples are the unique endpoints from FaceLandmarksConnections in the
# 478-point MediaPipe Tasks Face Landmarker model.
_MEDIAPIPE_SCREEN_REGION_INDICES = {
  "left_eye": (33, 7, 163, 144, 145, 153, 154, 155, 133, 246, 161, 160, 159, 158, 157, 173),
  "right_eye": (263, 249, 390, 373, 374, 380, 381, 382, 362, 466, 388, 387, 386, 385, 384, 398),
  "left_brow": (46, 53, 52, 65, 55, 70, 63, 105, 66, 107),
  "right_brow": (276, 283, 282, 295, 285, 300, 293, 334, 296, 336),
}

_MEDIAPIPE_LANDMARK_INDICES = {
  "forehead": 10,
  "chin": 152,
  "nose_tip": 1,
  "nose_bridge": 168,
  "face_right": 234,
  "face_left": 454,
  "left_eye_outer": 33,
  "left_eye_inner": 133,
  "left_eye_top": 159,
  "left_eye_bottom": 145,
  "right_eye_outer": 263,
  "right_eye_inner": 362,
  "right_eye_top": 386,
  "right_eye_bottom": 374,
  "left_cheek": 205,
  "right_cheek": 425,
  "lip_left": 61,
  "lip_right": 291,
  "lip_top": 13,
  "lip_bottom": 14,
}


class MakeupFeedbackVisionError(ValueError):
  pass


@dataclass(frozen=True)
class NormalizedPoint:
  x: float
  y: float
  z: float | None = None

  def clamped(self) -> NormalizedPoint:
    return NormalizedPoint(
      x=min(1.0, max(0.0, float(self.x))),
      y=min(1.0, max(0.0, float(self.y))),
      z=float(self.z) if self.z is not None else None,
    )

  def as_dict(self) -> dict[str, float]:
    value = {"x": round(self.x, 6), "y": round(self.y, 6)}
    if self.z is not None:
      value["z"] = round(self.z, 6)
    return value


@dataclass(frozen=True)
class NormalizedBox:
  left: float
  top: float
  right: float
  bottom: float

  @property
  def width(self) -> float:
    return max(0.0, self.right - self.left)

  @property
  def height(self) -> float:
    return max(0.0, self.bottom - self.top)

  @property
  def area(self) -> float:
    return self.width * self.height

  def clamped(self) -> NormalizedBox:
    left = min(1.0, max(0.0, float(self.left)))
    top = min(1.0, max(0.0, float(self.top)))
    right = min(1.0, max(left, float(self.right)))
    bottom = min(1.0, max(top, float(self.bottom)))
    return NormalizedBox(left=left, top=top, right=right, bottom=bottom)

  def as_dict(self) -> dict[str, float]:
    return {
      "left": round(self.left, 6),
      "top": round(self.top, 6),
      "right": round(self.right, 6),
      "bottom": round(self.bottom, 6),
    }


@dataclass(frozen=True)
class FacePose:
  yaw_deg: float
  pitch_deg: float
  roll_deg: float

  def as_dict(self) -> dict[str, float]:
    return {
      "yawDeg": round(self.yaw_deg, 3),
      "pitchDeg": round(self.pitch_deg, 3),
      "rollDeg": round(self.roll_deg, 3),
    }


@dataclass(frozen=True)
class FaceObservation:
  bbox: NormalizedBox
  landmarks: Mapping[str, NormalizedPoint]
  pose: FacePose | None = None
  confidence: float | None = None
  region_points: Mapping[str, tuple[NormalizedPoint, ...]] = field(default_factory=dict)


@dataclass(frozen=True)
class FaceDetectorResult:
  available: bool
  faces: tuple[FaceObservation, ...] = ()
  error: str | None = None


FaceDetector = Callable[[Image.Image], FaceDetectorResult]


@dataclass(frozen=True)
class VisionQualityIssue:
  code: str
  severity: Literal["soft", "hard"]
  message: str
  details: Mapping[str, Any] | None = None

  @property
  def hard(self) -> bool:
    return self.severity == "hard"

  def as_dict(self) -> dict[str, Any]:
    value: dict[str, Any] = {
      "code": self.code,
      "severity": self.severity,
      "message": self.message,
    }
    if self.details:
      value["details"] = dict(self.details)
    return value


@dataclass(frozen=True)
class MakeupFeedbackRegion:
  name: str
  body: bytes
  content_type: str
  width: int
  height: int
  source_box: tuple[int, int, int, int]

  def as_metadata(self) -> dict[str, Any]:
    return {
      "name": self.name,
      "contentType": self.content_type,
      "byteSize": len(self.body),
      "width": self.width,
      "height": self.height,
      "sourceBox": {
        "left": self.source_box[0],
        "top": self.source_box[1],
        "right": self.source_box[2],
        "bottom": self.source_box[3],
      },
    }


@dataclass(frozen=True)
class MakeupFeedbackVisionResult:
  detector_available: bool
  face_count: int
  width: int
  height: int
  face_box: NormalizedBox | None
  landmarks: Mapping[str, NormalizedPoint]
  pose: FacePose | None
  regions: Mapping[str, MakeupFeedbackRegion]
  quality_issues: tuple[VisionQualityIssue, ...]
  hard_retake: bool
  metrics: Mapping[str, float | int | None]

  def as_metadata(self) -> dict[str, Any]:
    return {
      "detectorAvailable": self.detector_available,
      "faceCount": self.face_count,
      "width": self.width,
      "height": self.height,
      "faceBox": self.face_box.as_dict() if self.face_box else None,
      "landmarks": {name: point.as_dict() for name, point in self.landmarks.items()},
      "pose": self.pose.as_dict() if self.pose else None,
      "regions": {name: region.as_metadata() for name, region in self.regions.items()},
      "qualityIssues": [issue.as_dict() for issue in self.quality_issues],
      "hardRetake": self.hard_retake,
      "metrics": dict(self.metrics),
    }


def _load_rgb_image(image_bytes: bytes) -> Image.Image:
  if not image_bytes:
    raise MakeupFeedbackVisionError("The makeup feedback image is empty.")

  try:
    with Image.open(io.BytesIO(image_bytes)) as opened:
      if opened.width * opened.height > MAX_INPUT_PIXELS:
        raise MakeupFeedbackVisionError("The makeup feedback image exceeds the pixel limit.")
      image = ImageOps.exif_transpose(opened)
      image.load()
  except MakeupFeedbackVisionError:
    raise
  except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError) as exc:
    raise MakeupFeedbackVisionError("The makeup feedback image is invalid or unsupported.") from exc

  if image.mode == "RGB":
    return image.copy()
  if image.mode in {"RGBA", "LA"}:
    rgba = image.convert("RGBA")
    background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    return Image.alpha_composite(background, rgba).convert("RGB")
  return image.convert("RGB")


def _point(landmarks: Sequence[Any], index: int) -> NormalizedPoint:
  raw = landmarks[index]
  return NormalizedPoint(float(raw.x), float(raw.y), float(raw.z)).clamped()


def _estimate_pose(landmarks: Mapping[str, NormalizedPoint]) -> FacePose | None:
  required = (
    "left_eye_outer",
    "left_eye_inner",
    "right_eye_outer",
    "right_eye_inner",
    "face_right",
    "face_left",
    "nose_tip",
    "chin",
  )
  if any(name not in landmarks for name in required):
    return None

  image_left_eye = _mean_point((landmarks["left_eye_outer"], landmarks["left_eye_inner"]))
  image_right_eye = _mean_point((landmarks["right_eye_outer"], landmarks["right_eye_inner"]))
  eye_mid = _mean_point((image_left_eye, image_right_eye))
  nose = landmarks["nose_tip"]
  chin = landmarks["chin"]
  image_left_x = min(landmarks["face_right"].x, landmarks["face_left"].x)
  image_right_x = max(landmarks["face_right"].x, landmarks["face_left"].x)
  face_span = max(1e-6, image_right_x - image_left_x)
  nose_horizontal_ratio = (nose.x - image_left_x) / face_span
  eye_to_chin = max(1e-6, chin.y - eye_mid.y)
  nose_vertical_ratio = (nose.y - eye_mid.y) / eye_to_chin

  return FacePose(
    yaw_deg=(nose_horizontal_ratio - 0.5) * 90.0,
    pitch_deg=(nose_vertical_ratio - 0.48) * 100.0,
    roll_deg=math.degrees(
      math.atan2(
        image_right_eye.y - image_left_eye.y,
        image_right_eye.x - image_left_eye.x,
      ),
    ),
  )


def _face_detector_result(detected: Any) -> FaceDetectorResult:
  observations: list[FaceObservation] = []
  for raw_landmarks in list(detected.face_landmarks or []):
    all_x = [float(value.x) for value in raw_landmarks]
    all_y = [float(value.y) for value in raw_landmarks]
    bbox = NormalizedBox(
      left=min(all_x),
      top=min(all_y),
      right=max(all_x),
      bottom=max(all_y),
    ).clamped()
    named_landmarks = {
      name: _point(raw_landmarks, index)
      for name, index in _MEDIAPIPE_LANDMARK_INDICES.items()
    }
    region_points = {
      name: tuple(_point(raw_landmarks, index) for index in indices)
      for name, indices in _MEDIAPIPE_SCREEN_REGION_INDICES.items()
    }
    observations.append(
      FaceObservation(
        bbox=bbox,
        landmarks=named_landmarks,
        pose=_estimate_pose(named_landmarks),
        region_points=region_points,
      ),
    )
  return FaceDetectorResult(available=True, faces=tuple(observations))


def _default_face_detector_batch(
  images: Sequence[Image.Image],
) -> tuple[FaceDetectorResult, ...]:
  if not images:
    return ()
  if mp is None or mp_tasks is None or mp_tasks_vision is None:
    return tuple(
      FaceDetectorResult(available=False, error="mediapipe_unavailable")
      for _image in images
    )

  from app.core.settings import get_settings

  configured_model_path = Path(get_settings().face_landmarker_model_path)
  model_path = (
    configured_model_path
    if configured_model_path.exists()
    else LOCAL_FACE_LANDMARKER_MODEL_PATH
  )
  if not model_path.exists():
    return tuple(
      FaceDetectorResult(available=False, error="face_landmarker_model_missing")
      for _image in images
    )

  try:
    options = mp_tasks_vision.FaceLandmarkerOptions(
      base_options=mp_tasks.BaseOptions(model_asset_path=str(model_path)),
      running_mode=mp_tasks_vision.RunningMode.IMAGE,
      num_faces=3,
      min_face_detection_confidence=0.5,
    )
    with mp_tasks_vision.FaceLandmarker.create_from_options(options) as detector:
      results: list[FaceDetectorResult] = []
      for image in images:
        try:
          detected = detector.detect(
            mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(image)),
          )
          results.append(_face_detector_result(detected))
        except Exception as exc:  # noqa: BLE001 - one image must not hide the other result.
          results.append(
            FaceDetectorResult(
              available=False,
              error=f"mediapipe_detection_failed:{exc.__class__.__name__}",
            ),
          )
      return tuple(results)
  except Exception as exc:  # noqa: BLE001 - detector failure is a soft runtime capability issue.
    return tuple(
      FaceDetectorResult(
        available=False,
        error=f"mediapipe_detection_failed:{exc.__class__.__name__}",
      )
      for _image in images
    )


def _default_face_detector(image: Image.Image) -> FaceDetectorResult:
  return _default_face_detector_batch((image,))[0]


def _run_detector(image: Image.Image, detector: FaceDetector | None) -> FaceDetectorResult:
  try:
    result = (detector or _default_face_detector)(image)
  except Exception as exc:  # noqa: BLE001 - injected/native detector exceptions stay soft.
    return FaceDetectorResult(
      available=False,
      error=f"detector_failed:{exc.__class__.__name__}",
    )

  if not isinstance(result, FaceDetectorResult):
    return FaceDetectorResult(available=False, error="detector_invalid_result")
  if not result.available:
    return FaceDetectorResult(available=False, error=result.error or "detector_unavailable")
  return result


def _mean_point(points: Sequence[NormalizedPoint]) -> NormalizedPoint:
  count = max(1, len(points))
  return NormalizedPoint(
    x=sum(point.x for point in points) / count,
    y=sum(point.y for point in points) / count,
  )


def _pixel_box(box: NormalizedBox, width: int, height: int) -> tuple[int, int, int, int]:
  clamped = box.clamped()
  left = max(0, min(width - 1, int(math.floor(clamped.left * width))))
  top = max(0, min(height - 1, int(math.floor(clamped.top * height))))
  right = max(left + 1, min(width, int(math.ceil(clamped.right * width))))
  bottom = max(top + 1, min(height, int(math.ceil(clamped.bottom * height))))
  return left, top, right, bottom


def _centered_box(
  center: NormalizedPoint,
  width: float,
  height: float,
) -> NormalizedBox:
  return NormalizedBox(
    left=center.x - width / 2,
    top=center.y - height / 2,
    right=center.x + width / 2,
    bottom=center.y + height / 2,
  ).clamped()


def _feature_box(
  points: Sequence[NormalizedPoint],
  *,
  fallback_center: NormalizedPoint,
  minimum_width: float,
  minimum_height: float,
  width_multiplier: float,
  height_multiplier: float,
) -> NormalizedBox:
  if not points:
    return _centered_box(fallback_center, minimum_width, minimum_height)

  center = _mean_point(points)
  span_x = max(point.x for point in points) - min(point.x for point in points)
  span_y = max(point.y for point in points) - min(point.y for point in points)
  return _centered_box(
    center,
    max(minimum_width, span_x * width_multiplier),
    max(minimum_height, span_y * height_multiplier),
  )


def _landmark_points(
  landmarks: Mapping[str, NormalizedPoint],
  names: Sequence[str],
) -> list[NormalizedPoint]:
  return [landmarks[name] for name in names if name in landmarks]


def _face_feature_points(
  face: FaceObservation,
  region_name: str,
  fallback_landmark_names: Sequence[str],
) -> list[NormalizedPoint]:
  region_points = face.region_points.get(region_name)
  if region_points:
    return list(region_points)
  return _landmark_points(face.landmarks, fallback_landmark_names)


def _face_region_boxes(face: FaceObservation) -> dict[str, NormalizedBox]:
  bbox = face.bbox.clamped()
  face_width = max(0.01, bbox.width)
  face_height = max(0.01, bbox.height)
  fallback = {
    "left_eye": NormalizedPoint(bbox.left + face_width * 0.32, bbox.top + face_height * 0.37),
    "right_eye": NormalizedPoint(bbox.left + face_width * 0.68, bbox.top + face_height * 0.37),
    "left_cheek": NormalizedPoint(bbox.left + face_width * 0.32, bbox.top + face_height * 0.64),
    "right_cheek": NormalizedPoint(bbox.left + face_width * 0.68, bbox.top + face_height * 0.64),
    "lips": NormalizedPoint(bbox.left + face_width * 0.5, bbox.top + face_height * 0.76),
  }

  return {
    "left_eye": _feature_box(
      _face_feature_points(
        face,
        "left_eye",
        ("left_eye_outer", "left_eye_inner", "left_eye_top", "left_eye_bottom"),
      ),
      fallback_center=fallback["left_eye"],
      minimum_width=face_width * 0.25,
      minimum_height=face_height * 0.105,
      width_multiplier=1.45,
      height_multiplier=1.75,
    ),
    "right_eye": _feature_box(
      _face_feature_points(
        face,
        "right_eye",
        ("right_eye_outer", "right_eye_inner", "right_eye_top", "right_eye_bottom"),
      ),
      fallback_center=fallback["right_eye"],
      minimum_width=face_width * 0.25,
      minimum_height=face_height * 0.105,
      width_multiplier=1.45,
      height_multiplier=1.75,
    ),
    "left_cheek": _feature_box(
      _landmark_points(face.landmarks, ("left_cheek",)),
      fallback_center=fallback["left_cheek"],
      minimum_width=face_width * 0.34,
      minimum_height=face_height * 0.28,
      width_multiplier=1.0,
      height_multiplier=1.0,
    ),
    "right_cheek": _feature_box(
      _landmark_points(face.landmarks, ("right_cheek",)),
      fallback_center=fallback["right_cheek"],
      minimum_width=face_width * 0.34,
      minimum_height=face_height * 0.28,
      width_multiplier=1.0,
      height_multiplier=1.0,
    ),
    "lips": _feature_box(
      _landmark_points(
        face.landmarks,
        ("lip_left", "lip_right", "lip_top", "lip_bottom"),
      ),
      fallback_center=fallback["lips"],
      minimum_width=face_width * 0.38,
      minimum_height=face_height * 0.19,
      width_multiplier=1.55,
      height_multiplier=2.2,
    ),
  }


def _brow_region_boxes(face: FaceObservation) -> dict[str, NormalizedBox]:
  bbox = face.bbox.clamped()
  face_width = max(0.01, bbox.width)
  face_height = max(0.01, bbox.height)
  fallback = {
    "left_brow": NormalizedPoint(bbox.left + face_width * 0.32, bbox.top + face_height * 0.22),
    "right_brow": NormalizedPoint(bbox.left + face_width * 0.68, bbox.top + face_height * 0.22),
  }
  return {
    name: _feature_box(
      _face_feature_points(face, name, ()),
      fallback_center=fallback[name],
      minimum_width=face_width * 0.24,
      minimum_height=face_height * 0.075,
      width_multiplier=1.12,
      height_multiplier=1.25,
    )
    for name in ("left_brow", "right_brow")
  }


def _screen_ordered_pair(
  left_region_id: str,
  left_box: NormalizedBox,
  right_region_id: str,
  right_box: NormalizedBox,
) -> tuple[tuple[str, NormalizedBox], tuple[str, NormalizedBox]]:
  boxes = sorted((left_box, right_box), key=lambda box: (box.left + box.right) / 2)
  return (
    (left_region_id, boxes[0]),
    (right_region_id, boxes[1]),
  )


def _makeup_crop_metadata(
  image: Image.Image,
  face: FaceObservation,
) -> dict[str, Any]:
  feature_boxes = _face_region_boxes(face)
  brow_boxes = _brow_region_boxes(face)
  area_regions: dict[str, tuple[tuple[str, NormalizedBox], ...]] = {
    "base": (("face", face.bbox.clamped()),),
    "brow": _screen_ordered_pair(
      "left_brow",
      brow_boxes["left_brow"],
      "right_brow",
      brow_boxes["right_brow"],
    ),
    "eye": _screen_ordered_pair(
      "left_eye",
      feature_boxes["left_eye"],
      "right_eye",
      feature_boxes["right_eye"],
    ),
    "cheek": _screen_ordered_pair(
      "left_cheek",
      feature_boxes["left_cheek"],
      "right_cheek",
      feature_boxes["right_cheek"],
    ),
    "lip": (("lips", feature_boxes["lips"]),),
  }
  return {
    "version": MAKEUP_CROP_METADATA_VERSION,
    "imageSize": {"width": image.width, "height": image.height},
    "areas": {
      area: [
        {"regionId": region_id, "box": box.as_dict()}
        for region_id, box in regions
      ]
      for area, regions in area_regions.items()
    },
  }


def _alignment_eye_centers(
  face: FaceObservation,
) -> tuple[NormalizedPoint, NormalizedPoint] | None:
  left_points = _face_feature_points(
    face,
    "left_eye",
    ("left_eye_outer", "left_eye_inner", "left_eye_top", "left_eye_bottom"),
  )
  right_points = _face_feature_points(
    face,
    "right_eye",
    ("right_eye_outer", "right_eye_inner", "right_eye_top", "right_eye_bottom"),
  )
  if not left_points or not right_points:
    return None
  centers = sorted(
    (_mean_point(left_points), _mean_point(right_points)),
    key=lambda point: point.x,
  )
  return centers[0].clamped(), centers[1].clamped()


def _alignment_frame_metadata(
  image: Image.Image,
  face: FaceObservation,
) -> dict[str, Any] | None:
  eye_centers = _alignment_eye_centers(face)
  if eye_centers is None:
    return None
  image_left, image_right = eye_centers
  roll_deg = math.degrees(
    math.atan2(
      image_right.y - image_left.y,
      image_right.x - image_left.x,
    ),
  )
  return {
    "imageSize": {"width": image.width, "height": image.height},
    "faceBox": face.bbox.clamped().as_dict(),
    "eyeCenters": {
      "imageLeft": image_left.as_dict(),
      "imageRight": image_right.as_dict(),
    },
    "rollDeg": round(roll_deg, 6),
  }


def extract_makeup_face_crop_metadata(
  image_bytes: bytes,
  *,
  detector: FaceDetector | None = None,
) -> dict[str, Any] | None:
  """Return normalized facial-area crops without retaining raw landmarks."""

  image = _load_rgb_image(image_bytes)
  detector_image = _fit_max_edge(image, DETECTOR_MAX_EDGE)
  detector_result = _run_detector(detector_image, detector)
  if not detector_result.available or len(detector_result.faces) != 1:
    return None
  return _makeup_crop_metadata(image, detector_result.faces[0])


def extract_personalized_makeup_face_metadata(
  source_image_bytes: bytes,
  generated_image_bytes: bytes,
  *,
  detector: FaceDetector | None = None,
) -> dict[str, dict[str, Any]]:
  """Return generated crops and source/generated alignment without raw landmarks.

  The default path runs both EXIF-upright images through one FaceLandmarker
  instance. Missing or ambiguous faces remain a soft omission.
  """

  source_image = _load_rgb_image(source_image_bytes)
  generated_image = _load_rgb_image(generated_image_bytes)
  detector_images = (
    _fit_max_edge(source_image, DETECTOR_MAX_EDGE),
    _fit_max_edge(generated_image, DETECTOR_MAX_EDGE),
  )
  if detector is None:
    source_result, generated_result = _default_face_detector_batch(detector_images)
  else:
    source_result, generated_result = (
      _run_detector(image, detector)
      for image in detector_images
    )

  metadata: dict[str, dict[str, Any]] = {}
  generated_face = (
    generated_result.faces[0]
    if generated_result.available and len(generated_result.faces) == 1
    else None
  )
  if generated_face is not None:
    metadata["cropMetadata"] = _makeup_crop_metadata(
      generated_image,
      generated_face,
    )

  source_face = (
    source_result.faces[0]
    if source_result.available and len(source_result.faces) == 1
    else None
  )
  if source_face is None or generated_face is None:
    return metadata
  source_alignment = _alignment_frame_metadata(source_image, source_face)
  generated_alignment = _alignment_frame_metadata(generated_image, generated_face)
  if source_alignment is not None and generated_alignment is not None:
    metadata["alignmentMetadata"] = {
      "version": MAKEUP_ALIGNMENT_METADATA_VERSION,
      "source": source_alignment,
      "generated": generated_alignment,
    }
  return metadata


def _fit_max_edge(image: Image.Image, maximum_edge: int) -> Image.Image:
  current_max = max(image.size)
  if current_max <= maximum_edge:
    return image.copy()
  scale = maximum_edge / current_max
  size = (
    max(1, int(round(image.width * scale))),
    max(1, int(round(image.height * scale))),
  )
  return image.resize(size, Image.Resampling.LANCZOS)


def _encode_jpeg(image: Image.Image, quality: int) -> bytes:
  for optimize in (True, False):
    output = io.BytesIO()
    try:
      image.save(
        output,
        format="JPEG",
        quality=quality,
        optimize=optimize,
        subsampling=0,
      )
      return output.getvalue()
    except OSError:
      if not optimize:
        raise

  raise MakeupFeedbackVisionError("The image region could not be encoded as JPEG.")


def _encode_region(
  name: str,
  image: Image.Image,
  source_box: tuple[int, int, int, int],
) -> MakeupFeedbackRegion:
  candidate = _fit_max_edge(image, BEDROCK_REGION_MAX_EDGE)
  last_body = b""

  for _ in range(9):
    for quality in REGION_JPEG_QUALITIES:
      last_body = _encode_jpeg(candidate, quality)
      if len(last_body) <= BEDROCK_REGION_MAX_BYTES:
        return MakeupFeedbackRegion(
          name=name,
          body=last_body,
          content_type="image/jpeg",
          width=candidate.width,
          height=candidate.height,
          source_box=source_box,
        )

    next_size = (
      max(64, int(round(candidate.width * 0.82))),
      max(64, int(round(candidate.height * 0.82))),
    )
    if next_size == candidate.size:
      break
    candidate = candidate.resize(next_size, Image.Resampling.LANCZOS)

  raise MakeupFeedbackVisionError(
    f"The {name} crop could not be reduced below the Bedrock byte limit.",
  )


def _build_regions(
  image: Image.Image,
  face: FaceObservation | None,
) -> dict[str, MakeupFeedbackRegion]:
  width, height = image.size
  full_box = (0, 0, width, height)
  regions = {"full": _encode_region("full", image, full_box)}
  if face is None:
    return regions

  for name, normalized_box in _face_region_boxes(face).items():
    source_box = _pixel_box(normalized_box, width, height)
    regions[name] = _encode_region(name, image.crop(source_box), source_box)
  return regions


def _quality_sample(image: Image.Image, face: FaceObservation | None) -> Image.Image:
  sample = image
  if face is not None and face.bbox.area > 0:
    sample = image.crop(_pixel_box(face.bbox, image.width, image.height))
  return _fit_max_edge(sample, QUALITY_SAMPLE_MAX_EDGE)


def _image_quality_metrics(image: Image.Image, face: FaceObservation | None) -> dict[str, float]:
  sample = _quality_sample(image, face)
  gray = np.asarray(sample.convert("L"), dtype=np.float32)
  mean = float(np.mean(gray))
  shadow_ratio = float(np.mean(gray <= SHADOW_PIXEL_MAX))
  highlight_ratio = float(np.mean(gray >= HIGHLIGHT_PIXEL_MIN))

  if gray.shape[0] < 3 or gray.shape[1] < 3:
    blur_score = 0.0
  else:
    center = gray[1:-1, 1:-1]
    laplacian = (
      gray[:-2, 1:-1]
      + gray[2:, 1:-1]
      + gray[1:-1, :-2]
      + gray[1:-1, 2:]
      - 4.0 * center
    )
    blur_score = float(np.var(laplacian))

  return {
    "exposureMean": round(mean, 4),
    "shadowRatio": round(shadow_ratio, 6),
    "highlightRatio": round(highlight_ratio, 6),
    "blurScore": round(blur_score, 4),
  }


def _hard_issue(
  code: str,
  message: str,
  details: Mapping[str, Any] | None = None,
) -> VisionQualityIssue:
  return VisionQualityIssue(code=code, severity="hard", message=message, details=details)


def prepare_makeup_feedback_vision(
  image_bytes: bytes,
  *,
  detector: FaceDetector | None = None,
) -> MakeupFeedbackVisionResult:
  """Prepare one camera or gallery image for grounded makeup feedback analysis.

  The input is expected to have passed the media sanitization step. This function
  performs no color, white-balance, contrast, or beauty-filter adjustment.
  """

  image = _load_rgb_image(image_bytes)
  width, height = image.size
  detector_image = _fit_max_edge(image, DETECTOR_MAX_EDGE)
  detector_result = _run_detector(detector_image, detector)
  faces = detector_result.faces if detector_result.available else ()
  face = faces[0] if len(faces) == 1 else None
  face_box = face.bbox.clamped() if face else None
  pose = face.pose or _estimate_pose(face.landmarks) if face else None
  issues: list[VisionQualityIssue] = []
  metrics: dict[str, float | int | None] = {
    "shortEdge": min(width, height),
    "longEdge": max(width, height),
    "faceWidthRatio": round(face_box.width, 6) if face_box else None,
    "faceAreaRatio": round(face_box.area, 6) if face_box else None,
    "yawDeg": round(pose.yaw_deg, 3) if pose else None,
    "pitchDeg": round(pose.pitch_deg, 3) if pose else None,
    "rollDeg": round(pose.roll_deg, 3) if pose else None,
  }

  if min(width, height) < MIN_IMAGE_SHORT_EDGE or max(width, height) < MIN_IMAGE_LONG_EDGE:
    issues.append(
      _hard_issue(
        "resolutionTooLow",
        "The image resolution is too low for reliable makeup feedback.",
        {"width": width, "height": height},
      ),
    )

  if not detector_result.available:
    issues.append(
      VisionQualityIssue(
        code="detectorUnavailable",
        severity="soft",
        message="Face landmarks could not be checked on this runtime.",
        details={"reason": detector_result.error or "unknown"},
      ),
    )
  elif not faces:
    issues.append(_hard_issue("noFace", "No face was detected in the image."))
  elif len(faces) > 1:
    issues.append(
      _hard_issue(
        "multipleFaces",
        "More than one face was detected in the image.",
        {"faceCount": len(faces)},
      ),
    )
  elif face_box is not None:
    if face_box.width < MIN_FACE_WIDTH_RATIO or face_box.area < MIN_FACE_AREA_RATIO:
      issues.append(
        _hard_issue(
          "faceTooSmall",
          "The face is too small for reliable regional makeup feedback.",
          {
            "faceWidthRatio": round(face_box.width, 6),
            "faceAreaRatio": round(face_box.area, 6),
          },
        ),
      )
    if face_box.width > MAX_FACE_WIDTH_RATIO or face_box.area > MAX_FACE_AREA_RATIO:
      issues.append(
        _hard_issue(
          "faceTooLarge",
          "The face is too close to the image edge for complete makeup feedback.",
          {
            "faceWidthRatio": round(face_box.width, 6),
            "faceAreaRatio": round(face_box.area, 6),
          },
        ),
      )

    if pose is not None:
      if abs(pose.yaw_deg) > MAX_ABS_YAW_DEG:
        issues.append(
          _hard_issue(
            "extremeYaw",
            "The face is turned too far sideways.",
            {"yawDeg": round(pose.yaw_deg, 3)},
          ),
        )
      if abs(pose.pitch_deg) > MAX_ABS_PITCH_DEG:
        issues.append(
          _hard_issue(
            "extremePitch",
            "The face is tilted too far up or down.",
            {"pitchDeg": round(pose.pitch_deg, 3)},
          ),
        )
      if abs(pose.roll_deg) > MAX_ABS_ROLL_DEG:
        issues.append(
          _hard_issue(
            "extremeRoll",
            "The head is tilted too far sideways.",
            {"rollDeg": round(pose.roll_deg, 3)},
          ),
        )

  image_metrics = _image_quality_metrics(image, face)
  metrics.update(image_metrics)
  exposure_mean = image_metrics["exposureMean"]
  shadow_ratio = image_metrics["shadowRatio"]
  highlight_ratio = image_metrics["highlightRatio"]
  blur_score = image_metrics["blurScore"]

  if exposure_mean < UNDEREXPOSED_MEAN or shadow_ratio > MAX_SHADOW_RATIO:
    issues.append(
      _hard_issue(
        "underexposed",
        "The face is too dark for reliable color and detail feedback.",
        {"exposureMean": exposure_mean, "shadowRatio": shadow_ratio},
      ),
    )
  if exposure_mean > OVEREXPOSED_MEAN or highlight_ratio > MAX_HIGHLIGHT_RATIO:
    issues.append(
      _hard_issue(
        "overexposed",
        "The face is too bright for reliable color and detail feedback.",
        {"exposureMean": exposure_mean, "highlightRatio": highlight_ratio},
      ),
    )
  if blur_score < MIN_BLUR_SCORE:
    issues.append(
      _hard_issue(
        "severeBlur",
        "The face is too blurred for reliable regional makeup feedback.",
        {"blurScore": blur_score},
      ),
    )

  regions = _build_regions(image, face)
  hard_retake = any(issue.hard for issue in issues)

  return MakeupFeedbackVisionResult(
    detector_available=detector_result.available,
    face_count=len(faces),
    width=width,
    height=height,
    face_box=face_box,
    landmarks=dict(face.landmarks) if face else {},
    pose=pose,
    regions=regions,
    quality_issues=tuple(issues),
    hard_retake=hard_retake,
    metrics=metrics,
  )
