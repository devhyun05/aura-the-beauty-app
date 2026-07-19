import asyncio
import json
from datetime import datetime, timezone
from uuid import UUID

import pytest

from app.api import makeup_recommendations as makeup_api
from app.core.settings import Settings


REPORT_ID = UUID("11111111-1111-1111-1111-111111111111")
SOURCE_MEDIA_ID = UUID("22222222-2222-2222-2222-222222222222")
FIXED_NOW = datetime(2026, 7, 19, 0, 0, tzinfo=timezone.utc)
CROP_METADATA = {
  "version": "makeup-face-crops-v1",
  "imageSize": {"width": 1024, "height": 1024},
  "areas": {},
}


def _frame(
  *,
  width: int,
  height: int,
  left_eye_x: float,
  right_eye_x: float,
) -> dict:
  return {
    "imageSize": {"width": width, "height": height},
    "faceBox": {
      "left": 0.25,
      "top": 0.14,
      "right": 0.75,
      "bottom": 0.86,
      "rawLandmarks": [{"x": 0.1, "y": 0.2}],
    },
    "eyeCenters": {
      "imageLeft": {"x": left_eye_x, "y": 0.4, "z": -0.02},
      "imageRight": {"x": right_eye_x, "y": 0.41, "z": -0.01},
      "raw": [{"x": 0.1, "y": 0.2}],
    },
    "rollDeg": 1.25,
    "landmarks": [{"x": 0.1, "y": 0.2}],
  }


def _detected_alignment() -> dict:
  return {
    "version": makeup_api.MAKEUP_ALIGNMENT_METADATA_VERSION,
    "source": _frame(
      width=900,
      height=1200,
      left_eye_x=0.38,
      right_eye_x=0.62,
    ),
    "generated": _frame(
      width=1024,
      height=1024,
      left_eye_x=0.39,
      right_eye_x=0.61,
    ),
    "rawLandmarks": [{"x": 0.1, "y": 0.2}],
  }


def _private_anchor(*, provenance: dict | None = None) -> dict:
  return {
    "look_id": "anchor",
    "role": "anchor",
    "status": "completed",
    "image_url": None,
    "storage_bucket": "assets",
    "object_key": "private/generated-makeup-recommendations/report/anchor.webp",
    "content_type": "image/webp",
    "is_private": True,
    "input_media_id": SOURCE_MEDIA_ID,
    "model_id": "gpt-image-2",
    "prompt_version": "makeup-image-v2",
    "provenance": {
      "modelId": "gpt-image-2",
      "cropMetadata": CROP_METADATA,
      **(provenance or {}),
    },
  }


def _personalized_report() -> dict:
  return {
    "id": REPORT_ID,
    "schema_version": "makeup-recommendation-v2",
    "image_mode": "personalized",
    "recommendation": {
      "contextSummary": ["condition"],
      "looks": [{"id": "anchor", "role": "anchor"}],
    },
    "context_snapshot": {},
  }


class AlignmentBackfillDB:
  def __init__(
    self,
    *,
    owner_matches: bool = True,
    source_bucket: str = "assets",
    generated_bucket: str = "assets",
  ) -> None:
    self.asset = _private_anchor()
    self.owner_matches = owner_matches
    self.source_bucket = source_bucket
    self.generated_bucket = generated_bucket
    self.fetchrow_calls: list[tuple[str, tuple]] = []

  async def fetch(self, query: str, *args):
    assert "makeup_recommendation_assets" in query
    assert args == (REPORT_ID,)
    return [{**self.asset, "provenance": dict(self.asset["provenance"])}]

  async def fetchrow(self, query: str, *args):
    self.fetchrow_calls.append((query, args))
    assert args[:3] == (
      REPORT_ID,
      "anchor",
      makeup_api.MAKEUP_ALIGNMENT_BACKFILL_MARKER_KEY,
    )
    provenance = self.asset["provenance"]
    marker_key = str(args[2])

    if len(args) == 5:
      assert "asset.role = 'anchor'" in query
      assert "asset.status = 'completed'" in query
      assert "asset.is_private" in query
      assert "source.owner_user_id = report.user_id" in query
      assert "source.status = 'active'" in query
      assert "source.deleted_at is null" in query
      assert "report.image_mode = 'personalized'" in query
      if not self.owner_matches:
        return None
      expected_marker = json.loads(args[4]) if args[4] is not None else None
      if expected_marker is None:
        if marker_key in provenance:
          return None
      elif provenance.get(marker_key) != expected_marker:
        return None
      claim_marker = json.loads(args[3])
      provenance[marker_key] = claim_marker
      return {
        "provenance": dict(provenance),
        "source_bucket": self.source_bucket,
        "source_object_key": "uploads/face-analysis/source.jpg",
        "generated_bucket": self.generated_bucket,
        "generated_object_key": self.asset["object_key"],
      }

    assert len(args) == 6
    assert "jsonb_build_object('alignmentMetadata'" in query
    assert "source.owner_user_id = report.user_id" in query
    result_marker = json.loads(args[3])
    alignment_json = args[4]
    claim_marker = json.loads(args[5])
    if provenance.get(marker_key) != claim_marker:
      return None
    provenance[marker_key] = result_marker
    if alignment_json is not None:
      provenance["alignmentMetadata"] = json.loads(alignment_json)
    return {"provenance": dict(provenance)}


def _patch_delivery(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(
    makeup_api.S3Service,
    "create_presigned_download",
    lambda _self, **_kwargs: "https://signed.example.com/anchor.webp",
  )


@pytest.mark.asyncio
async def test_existing_personalized_anchor_lazily_backfills_minimal_alignment(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  db = AlignmentBackfillDB()
  reads: list[tuple[str, str, int | None]] = []
  detections: list[tuple[bytes, bytes]] = []

  def fake_get_object_bytes(self, *, bucket, object_key, max_bytes=None):
    reads.append((bucket, object_key, max_bytes))
    if object_key == "uploads/face-analysis/source.jpg":
      return b"source-image", "image/jpeg"
    return b"generated-image", "image/webp"

  def fake_detect(source_bytes: bytes, generated_bytes: bytes):
    detections.append((source_bytes, generated_bytes))
    return {
      "cropMetadata": {"mustNot": "overwrite-existing-crop"},
      "alignmentMetadata": _detected_alignment(),
      "rawLandmarks": [{"x": 0.1, "y": 0.2}],
    }

  monkeypatch.setattr(makeup_api, "_alignment_backfill_now", lambda: FIXED_NOW)
  monkeypatch.setattr(makeup_api.S3Service, "get_object_bytes", fake_get_object_bytes)
  monkeypatch.setattr(
    makeup_api,
    "extract_personalized_makeup_face_metadata",
    fake_detect,
  )
  _patch_delivery(monkeypatch)

  response = await makeup_api._recommendation_report_response(
    _personalized_report(),
    db=db,
    settings=Settings(s3_bucket_name="assets"),
  )

  assert reads == [
    (
      "assets",
      "uploads/face-analysis/source.jpg",
      makeup_api.MAKEUP_ALIGNMENT_BACKFILL_MAX_BYTES,
    ),
    (
      "assets",
      "private/generated-makeup-recommendations/report/anchor.webp",
      makeup_api.MAKEUP_ALIGNMENT_BACKFILL_MAX_BYTES,
    ),
  ]
  assert detections == [(b"source-image", b"generated-image")]
  assert len(db.fetchrow_calls) == 2
  provenance = response["recommendation"]["looks"][0]["imageAsset"]["provenance"]
  assert provenance["cropMetadata"] == CROP_METADATA
  assert provenance["alignmentMetadata"] == {
    "version": makeup_api.MAKEUP_ALIGNMENT_METADATA_VERSION,
    "source": {
      "imageSize": {"width": 900, "height": 1200},
      "faceBox": {"left": 0.25, "top": 0.14, "right": 0.75, "bottom": 0.86},
      "eyeCenters": {
        "imageLeft": {"x": 0.38, "y": 0.4},
        "imageRight": {"x": 0.62, "y": 0.41},
      },
      "rollDeg": 1.25,
    },
    "generated": {
      "imageSize": {"width": 1024, "height": 1024},
      "faceBox": {"left": 0.25, "top": 0.14, "right": 0.75, "bottom": 0.86},
      "eyeCenters": {
        "imageLeft": {"x": 0.39, "y": 0.4},
        "imageRight": {"x": 0.61, "y": 0.41},
      },
      "rollDeg": 1.25,
    },
  }
  assert provenance[makeup_api.MAKEUP_ALIGNMENT_BACKFILL_MARKER_KEY] == {
    "version": makeup_api.MAKEUP_ALIGNMENT_BACKFILL_MARKER_VERSION,
    "status": "completed",
    "attemptedAt": "2026-07-19T00:00:00Z",
  }
  assert "landmark" not in json.dumps(provenance).lower()


@pytest.mark.asyncio
async def test_no_face_is_soft_cached_and_concurrent_gets_share_one_claim(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  db = AlignmentBackfillDB()
  calls = {"read": 0, "detect": 0}

  def fake_get_object_bytes(self, *, bucket, object_key, max_bytes=None):
    calls["read"] += 1
    return (
      (b"source-image", "image/jpeg")
      if object_key == "uploads/face-analysis/source.jpg"
      else (b"generated-image", "image/webp")
    )

  def fake_detect(_source_bytes: bytes, _generated_bytes: bytes):
    calls["detect"] += 1
    return {}

  monkeypatch.setattr(makeup_api, "_alignment_backfill_now", lambda: FIXED_NOW)
  monkeypatch.setattr(makeup_api.S3Service, "get_object_bytes", fake_get_object_bytes)
  monkeypatch.setattr(
    makeup_api,
    "extract_personalized_makeup_face_metadata",
    fake_detect,
  )
  _patch_delivery(monkeypatch)

  responses = await asyncio.gather(
    makeup_api._recommendation_report_response(
      _personalized_report(),
      db=db,
      settings=Settings(s3_bucket_name="assets"),
    ),
    makeup_api._recommendation_report_response(
      _personalized_report(),
      db=db,
      settings=Settings(s3_bucket_name="assets"),
    ),
  )
  third_response = await makeup_api._recommendation_report_response(
    _personalized_report(),
    db=db,
    settings=Settings(s3_bucket_name="assets"),
  )

  assert calls == {"read": 2, "detect": 1}
  assert len(db.fetchrow_calls) == 2
  expected_marker = {
    "version": makeup_api.MAKEUP_ALIGNMENT_BACKFILL_MARKER_VERSION,
    "status": "no-face",
    "attemptedAt": "2026-07-19T00:00:00Z",
    "retryAfter": "2026-07-20T00:00:00Z",
  }
  concurrent_markers = [
    response["recommendation"]["looks"][0]["imageAsset"]["provenance"][
      makeup_api.MAKEUP_ALIGNMENT_BACKFILL_MARKER_KEY
    ]
    for response in responses
  ]
  assert expected_marker in concurrent_markers
  assert all(marker["status"] in {"processing", "no-face"} for marker in concurrent_markers)
  third_provenance = (
    third_response["recommendation"]["looks"][0]["imageAsset"]["provenance"]
  )
  assert third_provenance[makeup_api.MAKEUP_ALIGNMENT_BACKFILL_MARKER_KEY] == expected_marker
  for response in [*responses, third_response]:
    provenance = response["recommendation"]["looks"][0]["imageAsset"]["provenance"]
    assert "alignmentMetadata" not in provenance
    assert provenance["cropMetadata"] == CROP_METADATA


@pytest.mark.asyncio
async def test_owner_mismatch_cannot_claim_or_read_source_media(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  db = AlignmentBackfillDB(owner_matches=False)
  reads: list[str] = []

  monkeypatch.setattr(
    makeup_api.S3Service,
    "get_object_bytes",
    lambda _self, **kwargs: reads.append(str(kwargs["object_key"])),
  )
  _patch_delivery(monkeypatch)

  response = await makeup_api._recommendation_report_response(
    _personalized_report(),
    db=db,
    settings=Settings(s3_bucket_name="assets"),
  )

  assert reads == []
  assert len(db.fetchrow_calls) == 1
  provenance = response["recommendation"]["looks"][0]["imageAsset"]["provenance"]
  assert makeup_api.MAKEUP_ALIGNMENT_BACKFILL_MARKER_KEY not in provenance
  assert "alignmentMetadata" not in provenance


@pytest.mark.asyncio
@pytest.mark.parametrize(
  ("source_bucket", "generated_bucket"),
  [
    ("outside", "assets"),
    ("assets", "outside"),
  ],
)
async def test_unmanaged_source_or_generated_location_is_a_soft_failure(
  monkeypatch: pytest.MonkeyPatch,
  source_bucket: str,
  generated_bucket: str,
) -> None:
  db = AlignmentBackfillDB(
    source_bucket=source_bucket,
    generated_bucket=generated_bucket,
  )
  reads: list[str] = []

  monkeypatch.setattr(makeup_api, "_alignment_backfill_now", lambda: FIXED_NOW)
  monkeypatch.setattr(
    makeup_api.S3Service,
    "get_object_bytes",
    lambda _self, **kwargs: reads.append(str(kwargs["object_key"])),
  )
  _patch_delivery(monkeypatch)

  response = await makeup_api._recommendation_report_response(
    _personalized_report(),
    db=db,
    settings=Settings(s3_bucket_name="assets"),
  )

  assert reads == []
  assert len(db.fetchrow_calls) == 2
  provenance = response["recommendation"]["looks"][0]["imageAsset"]["provenance"]
  assert provenance[makeup_api.MAKEUP_ALIGNMENT_BACKFILL_MARKER_KEY] == {
    "version": makeup_api.MAKEUP_ALIGNMENT_BACKFILL_MARKER_VERSION,
    "status": "failed",
    "attemptedAt": "2026-07-19T00:00:00Z",
    "retryAfter": "2026-07-19T00:15:00Z",
  }
  assert "alignmentMetadata" not in provenance
  assert provenance["cropMetadata"] == CROP_METADATA


def test_alignment_sanitizer_rejects_reversed_screen_eye_order() -> None:
  metadata = _detected_alignment()
  metadata["generated"]["eyeCenters"] = {
    "imageLeft": {"x": 0.7, "y": 0.4},
    "imageRight": {"x": 0.3, "y": 0.4},
  }

  assert makeup_api._minimal_alignment_metadata(metadata) is None