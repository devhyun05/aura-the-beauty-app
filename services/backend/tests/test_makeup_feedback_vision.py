from __future__ import annotations

import io
from dataclasses import replace

import numpy as np
import pytest
from PIL import Image

from app.services.makeup_feedback_vision import (
  BEDROCK_REGION_MAX_BYTES,
  BEDROCK_REGION_MAX_EDGE,
  DETECTOR_MAX_EDGE,
  REGION_NAMES,
  FaceDetectorResult,
  FaceObservation,
  FacePose,
  MakeupFeedbackVisionError,
  NormalizedBox,
  NormalizedPoint,
  prepare_makeup_feedback_vision,
)


def _pattern_image_bytes(
  width: int = 900,
  height: int = 1100,
  *,
  low: int = 55,
  high: int = 195,
) -> bytes:
  y, x = np.indices((height, width))
  checker = ((x // 6 + y // 6) % 2).astype(np.uint8)
  base = np.where(checker == 0, low, high).astype(np.uint8)
  pixels = np.stack(
    (
      np.clip(base.astype(np.int16) + 8, 0, 255).astype(np.uint8),
      base,
      np.clip(base.astype(np.int16) - 8, 0, 255).astype(np.uint8),
    ),
    axis=-1,
  )
  output = io.BytesIO()
  Image.fromarray(pixels, mode="RGB").save(output, format="PNG")
  return output.getvalue()


def _solid_image_bytes(
  color: tuple[int, int, int],
  width: int = 900,
  height: int = 1100,
) -> bytes:
  output = io.BytesIO()
  Image.new("RGB", (width, height), color).save(output, format="PNG")
  return output.getvalue()


def _face(
  *,
  bbox: NormalizedBox | None = None,
  pose: FacePose | None = None,
) -> FaceObservation:
  return FaceObservation(
    bbox=bbox or NormalizedBox(left=0.2, top=0.1, right=0.8, bottom=0.9),
    landmarks={
      "forehead": NormalizedPoint(0.50, 0.14),
      "chin": NormalizedPoint(0.50, 0.86),
      "nose_bridge": NormalizedPoint(0.50, 0.42),
      "nose_tip": NormalizedPoint(0.50, 0.56),
      "face_right": NormalizedPoint(0.22, 0.54),
      "face_left": NormalizedPoint(0.78, 0.54),
      "left_eye_outer": NormalizedPoint(0.69, 0.38),
      "left_eye_inner": NormalizedPoint(0.55, 0.39),
      "left_eye_top": NormalizedPoint(0.62, 0.36),
      "left_eye_bottom": NormalizedPoint(0.62, 0.41),
      "right_eye_outer": NormalizedPoint(0.31, 0.38),
      "right_eye_inner": NormalizedPoint(0.45, 0.39),
      "right_eye_top": NormalizedPoint(0.38, 0.36),
      "right_eye_bottom": NormalizedPoint(0.38, 0.41),
      "left_cheek": NormalizedPoint(0.67, 0.62),
      "right_cheek": NormalizedPoint(0.33, 0.62),
      "lip_left": NormalizedPoint(0.59, 0.72),
      "lip_right": NormalizedPoint(0.41, 0.72),
      "lip_top": NormalizedPoint(0.50, 0.69),
      "lip_bottom": NormalizedPoint(0.50, 0.75),
    },
    pose=pose or FacePose(yaw_deg=0, pitch_deg=0, roll_deg=0),
    confidence=0.98,
  )


def _detector_result(*faces: FaceObservation) -> FaceDetectorResult:
  return FaceDetectorResult(available=True, faces=tuple(faces))


def _issue_codes(result) -> set[str]:
  return {issue.code for issue in result.quality_issues}


def test_prepares_full_and_landmark_regions_for_one_good_face() -> None:
  face = _face()
  result = prepare_makeup_feedback_vision(
    _pattern_image_bytes(),
    detector=lambda _image: _detector_result(face),
  )

  assert result.detector_available is True
  assert result.face_count == 1
  assert result.width == 900
  assert result.height == 1100
  assert result.hard_retake is False
  assert result.quality_issues == ()
  assert set(result.regions) == set(REGION_NAMES)
  assert result.regions["left_eye"].source_box[0] > result.regions["right_eye"].source_box[0]
  assert result.regions["left_cheek"].source_box[0] > result.regions["right_cheek"].source_box[0]

  for region in result.regions.values():
    assert region.content_type == "image/jpeg"
    assert len(region.body) <= BEDROCK_REGION_MAX_BYTES
    assert max(region.width, region.height) <= BEDROCK_REGION_MAX_EDGE
    with Image.open(io.BytesIO(region.body)) as opened:
      assert opened.size == (region.width, region.height)

  metadata = result.as_metadata()
  assert metadata["detectorAvailable"] is True
  assert metadata["faceCount"] == 1
  assert metadata["hardRetake"] is False
  assert set(metadata["regions"]) == set(REGION_NAMES)
  assert metadata["regions"]["lips"]["byteSize"] == len(result.regions["lips"].body)



def test_detector_receives_resized_copy_while_regions_keep_original_coordinates() -> None:
  detector_sizes: list[tuple[int, int]] = []

  def detector(image: Image.Image) -> FaceDetectorResult:
    detector_sizes.append(image.size)
    return _detector_result(_face())

  result = prepare_makeup_feedback_vision(
    _solid_image_bytes((120, 120, 120), width=2400, height=1800),
    detector=detector,
  )

  assert detector_sizes == [(DETECTOR_MAX_EDGE, 1200)]
  assert result.width == 2400
  assert result.height == 1800
  assert result.regions["full"].source_box == (0, 0, 2400, 1800)



def test_detector_unavailable_is_soft_and_still_returns_full_region() -> None:
  result = prepare_makeup_feedback_vision(
    _pattern_image_bytes(),
    detector=lambda _image: FaceDetectorResult(
      available=False,
      error="mediapipe_unavailable",
    ),
  )

  assert result.detector_available is False
  assert result.face_count == 0
  assert result.hard_retake is False
  assert _issue_codes(result) == {"detectorUnavailable"}
  assert result.quality_issues[0].severity == "soft"
  assert set(result.regions) == {"full"}


def test_detector_exception_is_converted_to_soft_unavailable_issue() -> None:
  def broken_detector(_image: Image.Image) -> FaceDetectorResult:
    raise RuntimeError("native detector failed")

  result = prepare_makeup_feedback_vision(
    _pattern_image_bytes(),
    detector=broken_detector,
  )

  assert result.detector_available is False
  assert result.hard_retake is False
  assert _issue_codes(result) == {"detectorUnavailable"}
  assert result.quality_issues[0].details == {"reason": "detector_failed:RuntimeError"}


@pytest.mark.parametrize(
  ("faces", "expected_code"),
  [
    ((), "noFace"),
    ((_face(), replace(_face(), bbox=NormalizedBox(0.05, 0.2, 0.35, 0.75))), "multipleFaces"),
  ],
)
def test_face_count_failures_require_retake(
  faces: tuple[FaceObservation, ...],
  expected_code: str,
) -> None:
  result = prepare_makeup_feedback_vision(
    _pattern_image_bytes(),
    detector=lambda _image: _detector_result(*faces),
  )

  assert result.hard_retake is True
  assert expected_code in _issue_codes(result)
  assert set(result.regions) == {"full"}


def test_low_resolution_and_severe_blur_require_retake() -> None:
  result = prepare_makeup_feedback_vision(
    _solid_image_bytes((128, 128, 128), width=320, height=420),
    detector=lambda _image: _detector_result(_face()),
  )

  assert result.hard_retake is True
  assert {"resolutionTooLow", "severeBlur"}.issubset(_issue_codes(result))


@pytest.mark.parametrize(
  ("low", "high", "expected_code"),
  [
    (3, 31, "underexposed"),
    (224, 252, "overexposed"),
  ],
)
def test_extreme_exposure_requires_retake(low: int, high: int, expected_code: str) -> None:
  result = prepare_makeup_feedback_vision(
    _pattern_image_bytes(low=low, high=high),
    detector=lambda _image: _detector_result(_face()),
  )

  assert result.hard_retake is True
  assert expected_code in _issue_codes(result)


def test_small_face_and_extreme_pose_require_retake() -> None:
  face = _face(
    bbox=NormalizedBox(left=0.44, top=0.38, right=0.56, bottom=0.62),
    pose=FacePose(yaw_deg=35, pitch_deg=-30, roll_deg=25),
  )
  result = prepare_makeup_feedback_vision(
    _pattern_image_bytes(),
    detector=lambda _image: _detector_result(face),
  )

  assert result.hard_retake is True
  assert {
    "faceTooSmall",
    "extremeYaw",
    "extremePitch",
    "extremeRoll",
  }.issubset(_issue_codes(result))


def test_region_encoder_limits_noisy_full_image_by_edge_and_bytes() -> None:
  rng = np.random.default_rng(20260713)
  pixels = rng.integers(0, 256, size=(1900, 2400, 3), dtype=np.uint8)
  source = io.BytesIO()
  Image.fromarray(pixels, mode="RGB").save(source, format="PNG")

  result = prepare_makeup_feedback_vision(
    source.getvalue(),
    detector=lambda _image: FaceDetectorResult(available=False, error="disabled_for_test"),
  )
  full = result.regions["full"]

  assert max(full.width, full.height) <= BEDROCK_REGION_MAX_EDGE
  assert len(full.body) <= BEDROCK_REGION_MAX_BYTES


def test_region_encoding_does_not_apply_color_adjustment() -> None:
  source_color = (171, 103, 61)
  result = prepare_makeup_feedback_vision(
    _solid_image_bytes(source_color),
    detector=lambda _image: FaceDetectorResult(available=False, error="disabled_for_test"),
  )

  with Image.open(io.BytesIO(result.regions["full"].body)) as opened:
    encoded_color = opened.convert("RGB").getpixel((opened.width // 2, opened.height // 2))

  assert all(abs(actual - expected) <= 2 for actual, expected in zip(encoded_color, source_color, strict=True))


def test_invalid_image_bytes_raise_stable_vision_error() -> None:
  with pytest.raises(MakeupFeedbackVisionError, match="invalid or unsupported"):
    prepare_makeup_feedback_vision(b"not-an-image")
