from copy import deepcopy
from datetime import UTC, datetime, timedelta
import json
from uuid import UUID

import pytest
from fastapi import BackgroundTasks

from app.api import analysis as analysis_api
from app.api import filter_extractions as filter_extractions_api
from app.api import media as media_api
from app.core.security import AuthContext
from app.core.settings import Settings
from app.schemas.analysis import AnalysisJobCreate, FilterExtractionAnalyzeRequest
from app.schemas.media import CompleteUploadRequest
from app.services.face3d_calibration_receipts import (
  compute_face3d_profile_binding_sha256,
  sign_face3d_calibration_receipt,
)


USER_ID = UUID("11111111-1111-1111-1111-111111111111")
MEDIA_ID = UUID("22222222-2222-2222-2222-222222222222")
REPORT_ID = UUID("33333333-3333-3333-3333-333333333333")
UPLOAD_ID = UUID("44444444-4444-4444-4444-444444444444")
QUEUE_URL = "https://sqs.ap-northeast-2.amazonaws.com/123456789012/aura-ai-jobs"
FACE3D_APPROVAL_SHA = "a" * 64
FACE3D_SIGNING_KEY_ID = "face3d-calibration-test-v1"
FACE3D_SIGNING_SECRET = "face3d-calibration-test-secret"

FACE3D_METRIC_KEYS = [
  "noseTipProjection",
  "chinProjection",
  "upperLipToELine",
  "lowerLipToELine",
  "centralProjectionScore",
  "noseLength",
  "nasalBridgeStraightness",
  "nasalAxisDeviation",
  "alarWidth",
  "malarProjectionLeft",
  "malarProjectionRight",
]


def face3d_profile() -> dict:
  return {
    "gateVersion": "face3d-gate-v1",
    "metrics": {
      key: {
        "confidence": 0.91,
        "mad": 0.002,
        "unit": "normalized",
        "validFrameCount": 30,
        "value": 0.1 + (index * 0.01),
      }
      for index, key in enumerate(FACE3D_METRIC_KEYS)
    },
    "schemaVersion": "aura.face3d-profile.v1",
    "source": "arkit_face_mesh",
    "targetFrameCount": 30,
    "topologyFingerprint": "face3d-g2-test-topology",
    "validFrameCount": 30,
    "warnings": [],
  }


def calibrated_face3d_profile(now: datetime) -> dict:
  profile = {
    "aggregation": "median_mad",
    "calibrationReceipt": None,
    "captureNonce": "capture-nonce-api-001",
    "captureWindowMs": 420,
    "collectionPolicyId": "unified-micro-burst-5of8-v1",
    "completionRatio": 1.0,
    "confidenceCalibrationStatus": "calibrated",
    "gateVersion": "face3d-gate-v2",
    "metrics": {
      key: {
        "confidence": 0.91,
        "mad": 0.002,
        "unit": "normalized",
        "validFrameCount": 8,
        "value": 0.1 + (index * 0.01),
        "valueMm": 2.0 + index,
        "valueMmConfidence": 0.88,
        "valueMmMad": 0.04,
        "valueMmValidFrameCount": 8,
      }
      for index, key in enumerate(FACE3D_METRIC_KEYS)
    },
    "profileBindingSha256": None,
    "sampleMode": "micro_burst",
    "schemaVersion": "aura.face3d-profile.v3",
    "sensorProvenance": {
      "depthDataObservedRatio": 1.0,
      "deviceModel": "test-device",
      "faceTrackingSupported": True,
      "trueDepthHardware": True,
    },
    "source": "arkit_face_mesh",
    "targetFrameCount": 8,
    "topologyFingerprint": "face3d-g2-api-topology",
    "validFrameCount": 8,
    "warnings": [],
  }
  binding = compute_face3d_profile_binding_sha256(profile)
  profile["profileBindingSha256"] = binding
  receipt = {
    "appBuild": "test-build-1",
    "approvalArtifactSha256": FACE3D_APPROVAL_SHA,
    "captureNonce": profile["captureNonce"],
    "collectionPolicyId": profile["collectionPolicyId"],
    "expiresAtUtc": (now + timedelta(hours=1)).isoformat(),
    "gateVersion": profile["gateVersion"],
    "issuedAtUtc": (now - timedelta(minutes=1)).isoformat(),
    "profileBindingSha256": binding,
    "receiptId": "receipt-api-001",
    "reportContextId": f"report_source_media_{MEDIA_ID}",
    "signatureAlgorithm": "hmac-sha256-v1",
    "signingKeyId": FACE3D_SIGNING_KEY_ID,
    "subjectContextId": f"subj_user_{USER_ID}",
  }
  receipt["signature"] = sign_face3d_calibration_receipt(
    receipt,
    FACE3D_SIGNING_SECRET,
  )
  profile["calibrationReceipt"] = receipt
  return profile


def auth_context() -> AuthContext:
  return AuthContext(
    subject="merged-journey-user",
    provider="google",
    email="merged-journey@example.com",
    name="Merged Journey",
    claims={},
  )


def owned_media() -> dict:
  return {
    "id": MEDIA_ID,
    "bucket": "media-bucket",
    "object_key": "uploads/capture/owned-photo.jpg",
    "cdn_url": "https://cdn.example.com/uploads/capture/owned-photo.jpg",
    "content_type": "image/jpeg",
    "width": 1200,
    "height": 1600,
  }


async def ensure_test_user(_db, _auth) -> dict:
  return {"id": USER_ID}


async def resolve_test_media(*_args, **_kwargs) -> dict:
  return owned_media()


class AnalysisDatabase:
  def __init__(self) -> None:
    self.insert_args: tuple | None = None

  async def fetchrow(self, query: str, *args):
    assert "insert into analysis_reports" in query
    self.insert_args = args
    return {
      "id": REPORT_ID,
      "user_id": USER_ID,
      "status": "pending",
      "detail_payload": args[-1],
    }


class TransactionalAnalysisDatabase:
  def __init__(self) -> None:
    self.operations: list[str] = []
    self.receipt_consumed = False
    self.transaction_calls = 0
    self.insert_args: tuple | None = None

  async def run_in_transaction(self, operation):
    self.transaction_calls += 1
    self.operations.append("transaction:start")
    result = await operation(self)
    self.operations.append("transaction:commit")
    return result

  async def execute(self, query: str, *_args):
    normalized = " ".join(query.split()).lower()
    if "create table if not exists face3d_calibration_receipt_consumptions" in normalized:
      self.operations.append("receipt-schema")
    elif "create index if not exists idx_face3d_calibration_receipts_context" in normalized:
      self.operations.append("receipt-index")
    else:
      raise AssertionError(f"unexpected execute query: {normalized}")
    return "OK"

  async def fetchrow(self, query: str, *args):
    normalized = " ".join(query.split()).lower()
    if "insert into face3d_calibration_receipt_consumptions" in normalized:
      self.operations.append("receipt-consume")
      if self.receipt_consumed:
        return None
      self.receipt_consumed = True
      return {"receipt_id": args[0]}
    if "insert into analysis_reports" in normalized:
      self.operations.append("report-insert")
      self.insert_args = args
      return {
        "id": REPORT_ID,
        "user_id": USER_ID,
        "status": "pending",
        "detail_payload": args[-1],
      }
    raise AssertionError(f"unexpected fetchrow query: {normalized}")


class FilterExtractionDatabase:
  def __init__(self) -> None:
    self.insert_args: tuple | None = None

  async def fetchrow(self, query: str, *args):
    assert "insert into filter_extraction_reports" in query
    self.insert_args = args
    return {
      "id": REPORT_ID,
      "user_id": USER_ID,
      "status": "pending",
      "result_payload": args[-1],
    }


@pytest.mark.asyncio
async def test_owned_analysis_media_is_queued_after_trusted_payload_rewrite(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: dict[str, object] = {}
  face3d = face3d_profile()

  class Publisher:
    def __init__(self, _settings: Settings) -> None:
      pass

    def publish_analysis_job(self, report_id: UUID, user_id: UUID) -> dict:
      calls["queued"] = (report_id, user_id)
      return {"messageId": "analysis-message"}

  monkeypatch.setattr(analysis_api, "ensure_user", ensure_test_user)
  monkeypatch.setattr(analysis_api, "resolve_owned_source_media", resolve_test_media)
  monkeypatch.setattr(analysis_api, "AIJobQueuePublisher", Publisher)
  db = AnalysisDatabase()
  background_tasks = BackgroundTasks()

  response = await analysis_api.create_analysis_job(
    AnalysisJobCreate.model_validate(
      {
        "runImmediately": True,
        "sourceMediaId": str(MEDIA_ID),
        "requestPayload": {
          "bucket": "untrusted-bucket",
          "face3d": face3d,
          "measurements": {
            "captureId": str(REPORT_ID),
            "face3d": face3d,
            "schemaVersion": "aura.face-analysis-measurements.v1",
          },
          "objectKey": "untrusted/object.jpg",
          "task": "face_makeup_recommendation_report_v1",
        },
      },
    ),
    background_tasks,
    auth=auth_context(),
    db=db,
    settings=Settings(
      ai_job_execution_mode="sqs",
      sqs_ai_job_queue_url=QUEUE_URL,
      s3_bucket_name="media-bucket",
    ),
  )

  assert response["data"]["job"]["status"] == "pending"
  assert calls["queued"] == (REPORT_ID, USER_ID)
  assert len(background_tasks.tasks) == 0
  assert db.insert_args is not None
  stored_request = response["data"]["job"]["detailPayload"]["request"]
  assert stored_request["bucket"] == "media-bucket"
  assert stored_request["objectKey"] == "uploads/capture/owned-photo.jpg"
  assert stored_request["mediaId"] == str(MEDIA_ID)
  assert list(stored_request["face3d"]["metrics"].keys()) == FACE3D_METRIC_KEYS
  assert list(stored_request["measurements"]["face3d"]["metrics"].keys()) == FACE3D_METRIC_KEYS
  assert db.insert_args is not None
  inserted_request = json.loads(db.insert_args[-1])["request"]
  assert inserted_request["face3d"] == face3d
  assert inserted_request["measurements"]["face3d"] == face3d


@pytest.mark.asyncio
async def test_calibrated_face3d_receipt_is_consumed_atomically_with_report(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  monkeypatch.setattr(analysis_api, "ensure_user", ensure_test_user)
  monkeypatch.setattr(analysis_api, "resolve_owned_source_media", resolve_test_media)
  profile = calibrated_face3d_profile(datetime.now(UTC))
  db = TransactionalAnalysisDatabase()

  response = await analysis_api.create_analysis_job(
    AnalysisJobCreate.model_validate(
      {
        "runImmediately": False,
        "sourceMediaId": str(MEDIA_ID),
        "requestPayload": {
          "face3d": deepcopy(profile),
          "measurements": {
            "captureId": str(REPORT_ID),
            "face3d": deepcopy(profile),
            "schemaVersion": "aura.face-analysis-measurements.v1",
          },
          "task": "face_makeup_recommendation_report_v1",
        },
      },
    ),
    BackgroundTasks(),
    auth=auth_context(),
    db=db,
    settings=Settings(
      face3d_calibration_approval_artifact_sha256=FACE3D_APPROVAL_SHA,
      face3d_calibration_promotion_enabled=True,
      face3d_calibration_receipt_hmac_secret=FACE3D_SIGNING_SECRET,
      face3d_calibration_receipt_signing_key_id=FACE3D_SIGNING_KEY_ID,
      s3_bucket_name="media-bucket",
    ),
  )

  assert response["data"]["job"]["status"] == "pending"
  assert db.transaction_calls == 1
  assert db.operations == [
    "transaction:start",
    "receipt-schema",
    "receipt-index",
    "receipt-consume",
    "report-insert",
    "transaction:commit",
  ]
  assert db.insert_args is not None
  stored_request = json.loads(db.insert_args[-1])["request"]
  assert (
    stored_request["measurements"]["face3d"]["serverCalibrationReceiptStatus"]
    == "verified"
  )
  assert stored_request["face3d"]["serverCalibrationReceiptStatus"] == "verified"
  response_request = response["data"]["job"]["detailPayload"]["request"]
  assert (
    "serverCalibrationReceiptStatus"
    not in response_request["measurements"]["face3d"]
  )
  assert "calibrationReceipt" not in response_request["measurements"]["face3d"]
  assert "serverCalibrationReceiptStatus" not in response_request["face3d"]


@pytest.mark.asyncio
async def test_owned_reference_media_is_queued_without_running_ai_in_api(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: dict[str, object] = {}

  class Publisher:
    def __init__(self, _settings: Settings) -> None:
      pass

    def publish_filter_extraction_job(self, report_id: UUID, user_id: UUID) -> dict:
      calls["queued"] = (report_id, user_id)
      return {"messageId": "filter-message"}

  async def fail_if_ai_runs_in_api(*_args, **_kwargs):
    raise AssertionError("Reference AI must run in the worker, not the API request.")

  monkeypatch.setattr(filter_extractions_api, "ensure_user", ensure_test_user)
  monkeypatch.setattr(
    filter_extractions_api,
    "resolve_owned_source_media",
    resolve_test_media,
  )
  monkeypatch.setattr(filter_extractions_api, "AIJobQueuePublisher", Publisher)
  monkeypatch.setattr(
    filter_extractions_api,
    "build_reference_makeup_extraction_payload_for_request",
    fail_if_ai_runs_in_api,
  )
  db = FilterExtractionDatabase()
  background_tasks = BackgroundTasks()

  response = await filter_extractions_api.analyze_filter_extraction(
    FilterExtractionAnalyzeRequest.model_validate(
      {
        "resultMediaId": str(MEDIA_ID),
        "runAi": True,
        "requestPayload": {
          "bucket": "untrusted-bucket",
          "objectKey": "untrusted/reference.jpg",
        },
      },
    ),
    background_tasks,
    auth=auth_context(),
    db=db,
    settings=Settings(
      ai_job_execution_mode="sqs",
      sqs_ai_job_queue_url=QUEUE_URL,
      s3_bucket_name="media-bucket",
    ),
  )

  assert response["data"]["job"]["status"] == "pending"
  assert calls["queued"] == (REPORT_ID, USER_ID)
  assert len(background_tasks.tasks) == 0
  assert db.insert_args is not None


@pytest.mark.asyncio
async def test_secure_upload_session_uses_server_location_for_lambda_thumbnail(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: dict[str, object] = {}
  media = {
    **owned_media(),
    "thumbnail_object_key": None,
  }

  async def complete_session(_db, _settings, upload_id, *, owner_user_id):
    calls["complete"] = (upload_id, owner_user_id)
    return media

  async def resolve_thumbnail(_client, **kwargs):
    calls["resolve"] = kwargs
    return None

  async def update_thumbnail(_db, _media_id, thumbnail):
    return {**media, "thumbnail_object_key": thumbnail.object_key}

  class S3Service:
    def __init__(self, _settings) -> None:
      pass

    def client(self):
      return "s3-client"

  monkeypatch.setattr(media_api, "ensure_user", ensure_test_user)
  monkeypatch.setattr(media_api, "complete_upload_session", complete_session)
  monkeypatch.setattr(
    media_api,
    "resolve_postprocessed_thumbnail_metadata",
    resolve_thumbnail,
  )
  monkeypatch.setattr(media_api, "update_media_thumbnail_metadata", update_thumbnail)
  monkeypatch.setattr(media_api, "S3Service", S3Service)
  background_tasks = BackgroundTasks()

  response = await media_api.complete_upload(
    CompleteUploadRequest.model_validate({"uploadId": str(UPLOAD_ID)}),
    background_tasks,
    auth=auth_context(),
    db=object(),
    settings=Settings(
      s3_bucket_name="media-bucket",
      cloudfront_domain="cdn.example.com",
    ),
  )

  assert calls["complete"] == (UPLOAD_ID, USER_ID)
  assert calls["resolve"] == {
    "bucket": "media-bucket",
    "source_object_key": "uploads/capture/owned-photo.jpg",
    "cdn_base_url": "https://cdn.example.com",
  }
  assert response["data"]["media"]["thumbnailObjectKey"] == (
    "uploads/capture/thumbnails/owned-photo.jpg"
  )
  assert len(background_tasks.tasks) == 1
  assert background_tasks.tasks[0].kwargs["bucket"] == "media-bucket"
  assert background_tasks.tasks[0].kwargs["object_key"] == (
    "uploads/capture/owned-photo.jpg"
  )
