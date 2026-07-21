from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

import pytest

from app.api import feedback as feedback_api
from app.core.settings import Settings

from app.services.makeup_feedback_analysis import (
  FEEDBACK_TOPICS,
  MODEL_VERSION,
  normalize_makeup_feedback_result,
)
from app.services.makeup_feedback_vision import (
  MAX_ABS_PITCH_DEG,
  MAX_ABS_ROLL_DEG,
  MAX_ABS_YAW_DEG,
  MAX_FACE_AREA_RATIO,
  MAX_FACE_WIDTH_RATIO,
  MAX_HIGHLIGHT_RATIO,
  MAX_SHADOW_RATIO,
  MIN_BLUR_SCORE,
  MIN_FACE_AREA_RATIO,
  MIN_FACE_WIDTH_RATIO,
  MIN_IMAGE_LONG_EDGE,
  MIN_IMAGE_SHORT_EDGE,
  OVEREXPOSED_MEAN,
  UNDEREXPOSED_MEAN,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_PATH = (
  REPOSITORY_ROOT
  / "contracts"
  / "makeup-feedback"
  / "camera-server-quality-v1.json"
)


def _fixture() -> dict:
  return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_camera_bbox_and_pose_contract_is_stricter_than_server_hard_retake() -> None:
  limits = _fixture()["camera"]["contractLimits"]

  assert MIN_FACE_WIDTH_RATIO < limits["minFaceWidthRatio"]
  assert limits["maxFaceWidthRatio"] < MAX_FACE_WIDTH_RATIO
  assert MIN_FACE_AREA_RATIO < limits["minFaceAreaRatio"]
  assert limits["maxFaceAreaRatio"] < MAX_FACE_AREA_RATIO
  assert limits["maxAbsYawDeg"] < MAX_ABS_YAW_DEG
  assert limits["maxAbsPitchDeg"] < MAX_ABS_PITCH_DEG
  assert limits["maxAbsRollDeg"] < MAX_ABS_ROLL_DEG
  assert limits["minImageShortSidePx"] == MIN_IMAGE_SHORT_EDGE
  assert limits["minImageLongSidePx"] == MIN_IMAGE_LONG_EDGE

  # Device and server metrics share units and quality direction. Camera safety
  # margins are conservative; exact thresholds require paired device calibration
  # because their sampling implementations can differ.
  assert UNDEREXPOSED_MEAN < limits["minExposureMean"]
  assert limits["maxExposureMean"] < OVEREXPOSED_MEAN
  assert limits["maxShadowRatio"] < MAX_SHADOW_RATIO
  assert limits["maxHighlightRatio"] < MAX_HIGHLIGHT_RATIO
  assert MIN_BLUR_SCORE < limits["minBlurScore"]


def test_camera_pass_fixture_is_strictly_inside_every_server_boundary() -> None:
  frame = _fixture()["camera"]["passFrame"]
  quality = frame["imageQuality"]
  pose = frame["mediaPipe"]

  assert frame["faceCount"] == 1
  assert min(frame["imageWidth"], frame["imageHeight"]) > MIN_IMAGE_SHORT_EDGE
  assert max(frame["imageWidth"], frame["imageHeight"]) > MIN_IMAGE_LONG_EDGE
  assert MIN_FACE_WIDTH_RATIO < quality["faceWidthRatio"] < MAX_FACE_WIDTH_RATIO
  assert MIN_FACE_AREA_RATIO < quality["faceAreaRatio"] < MAX_FACE_AREA_RATIO
  assert abs(pose["yawDeg"]) < MAX_ABS_YAW_DEG
  assert abs(pose["pitchDeg"]) < MAX_ABS_PITCH_DEG
  assert abs(pose["rollDeg"]) < MAX_ABS_ROLL_DEG
  assert UNDEREXPOSED_MEAN < quality["exposureMean"] < OVEREXPOSED_MEAN
  assert quality["shadowRatio"] < MAX_SHADOW_RATIO
  assert quality["highlightRatio"] < MAX_HIGHLIGHT_RATIO
  assert quality["blurScore"] > MIN_BLUR_SCORE


def test_blocked_fixtures_cover_required_camera_failure_classes() -> None:
  blocked_cases = _fixture()["camera"]["blockedCases"]
  categories = {case["category"] for case in blocked_cases}

  assert {"faceCount", "pose", "exposure", "blur", "resolution"} <= categories
  assert {case["expectedReason"] for case in blocked_cases} >= {
    "no_face",
    "multiple_faces",
    "not_forward",
    "pitch_out_of_range",
    "underexposed",
    "overexposed",
    "blurred",
    "image_resolution_too_low",
  }


def test_mocked_bedrock_response_normalizes_to_mobile_completed_contract() -> None:
  fixture = _fixture()
  selection = fixture["selection"]
  request_payload = fixture["requestPayload"]

  assert selection["photoSource"] == request_payload["source"] == "camera"
  assert (
    selection["feedbackContext"]["originalGoalText"]
    == request_payload["feedbackContext"]["originalGoalText"]
  )

  result = normalize_makeup_feedback_result(
    fixture["bedrockResponse"],
    request_payload,
  )

  assert result["analysisDecision"] == "completed"
  assert result["captureQuality"] == {
    "usable": True,
    "detectorAvailable": True,
    "colorConfidence": "high",
    "issues": [],
  }
  assert result["modelVersion"] == MODEL_VERSION
  assert result["score"] == 89
  assert result["scoreRange"] == [86, 92]
  assert result["scoreConfidence"] == 0.74
  assert result["scoreEvidenceIds"] == [
    "foundation-observation-1",
    "brow-observation-1",
    "lash-observation-1",
    "eyeliner-observation-1",
    "eyeshadow-observation-1",
    "blush-observation-1",
    "highlight-observation-1",
    "shading-observation-1",
    "lip-observation-1",
  ]
  assert result["scoreBreakdown"]["formula"].endswith("= 89/100")
  assert [item["topicId"] for item in result["evaluations"]] == [
    topic["id"] for topic in FEEDBACK_TOPICS
  ]
  assert len(result["evaluations"]) == 11
  assert result["evaluations"][-1]["topicId"] == "lip"

@pytest.mark.asyncio
async def test_pass_fixture_normalizes_and_worker_persists_completed_payload(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  fixture = _fixture()
  request_payload = fixture["requestPayload"]
  normalized_result = normalize_makeup_feedback_result(
    fixture["bedrockResponse"],
    request_payload,
  )
  report_id = UUID("33333333-3333-3333-3333-333333333333")
  user_id = UUID("44444444-4444-4444-4444-444444444444")
  notification_calls: list[dict] = []

  class FakeDB:
    def __init__(self) -> None:
      self.executed: list[tuple] = []
      self.fetchrow_calls: list[tuple] = []

    async def execute(self, *args):
      self.executed.append(args)
      return "UPDATE 1"

    async def fetchrow(self, *args):
      self.fetchrow_calls.append(args)
      return {"id": report_id, "status": "completed", "user_id": user_id}

  settings = Settings()

  async def fake_build_result(actual_request_payload, actual_settings):
    assert actual_request_payload == request_payload
    assert actual_settings is settings
    return normalized_result, "bedrock_completed", None

  async def fake_create_notification(_db, _settings, **kwargs):
    notification_calls.append(kwargs)

  monkeypatch.setattr(
    feedback_api,
    "build_makeup_feedback_result_for_request",
    fake_build_result,
  )
  monkeypatch.setattr(
    feedback_api,
    "create_and_send_notification",
    fake_create_notification,
  )
  fake_db = FakeDB()

  await feedback_api.run_feedback_job_background(
    report_id,
    user_id,
    request_payload,
    settings,
    db=fake_db,
  )

  assert len(fake_db.executed) == 1
  assert "status = 'processing'" in fake_db.executed[0][0]
  assert "user_id = $2" in fake_db.executed[0][0]
  assert len(fake_db.fetchrow_calls) == 1
  completed_call = fake_db.fetchrow_calls[0]
  assert "status = 'completed'" in completed_call[0]
  assert completed_call[1] == report_id
  assert completed_call[2] == user_id
  assert completed_call[3] == normalized_result["score"] == 89
  assert completed_call[4] == MODEL_VERSION
  completed_payload = json.loads(completed_call[5])
  assert completed_payload["request"] == request_payload
  assert completed_payload["result"] == normalized_result
  assert completed_payload["analysisStatus"] == "bedrock_completed"
  assert completed_payload["analysisError"] is None
  assert notification_calls[0]["user_id"] == user_id
  assert notification_calls[0]["notification_type"] == "makeup_feedback_completed"
