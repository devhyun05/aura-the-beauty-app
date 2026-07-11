from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
from io import BytesIO
import json
from pathlib import Path

from PIL import Image
import pytest
from pydantic import ValidationError

from app.api.hair import _normalize_simulation
from app.core.errors import AppError
from app.core.settings import Settings
from app.ops.review_hair_style_assets import approve_styles
from app.services.hair_catalog import (
  HAIR_CATALOG_VERSION,
  HAIR_STYLES,
  list_hair_styles,
  recommend_hair_styles,
)
from app.services.hair_jobs import decode_hair_job
from app.services.hair_processing import HairProcessingService, create_openai_safety_identifier
from app.services.hair_schema import HAIR_SCHEMA_SQL
from app.services.s3 import S3Service, is_private_hair_object_key


def _image_bytes(mode: str, color, size: tuple[int, int] = (160, 200)) -> bytes:
  image = Image.new(mode, size, color)
  buffer = BytesIO()
  image.save(buffer, format="PNG")
  return buffer.getvalue()


def test_hair_catalog_contains_twelve_stable_camel_case_styles() -> None:
  styles = list_hair_styles(Settings(cdn_base_url="https://cdn.example.com"))

  assert len(styles) == 12
  assert len({style["styleId"] for style in styles}) == 12
  assert all(style["catalogVersion"] == HAIR_CATALOG_VERSION for style in styles)
  assert all(style["previewUrl"].endswith("-preview.webp") for style in styles)
  assert all("style_id" not in style and "face_shapes" not in style for style in styles)


def test_hair_recommendations_are_deterministic_and_diverse() -> None:
  analysis = {"faceShape": "round", "currentLength": "long", "hairline": "high"}

  first = recommend_hair_styles(analysis)
  second = recommend_hair_styles(analysis)

  assert first == second
  assert len(first) == 3
  assert len({item["styleId"] for item in first}) == 3
  selected_lengths = {
    next(style.length for style in HAIR_STYLES if style.style_id == item["styleId"])
    for item in first
  }
  assert len(selected_lengths) >= 2
  assert all(0 <= item["score"] <= 1 for item in first)


def test_hair_mask_quality_rejects_empty_and_accepts_upper_hair_region() -> None:
  processing = HairProcessingService(Settings())
  source = _image_bytes("RGB", "white")
  empty_mask = _image_bytes("L", 0)
  mask = Image.new("L", (160, 200), 0)
  for x in range(35, 125):
    for y in range(8, 72):
      mask.putpixel((x, y), 255)
  buffer = BytesIO()
  mask.save(buffer, format="PNG")

  assert processing.validate_hair_mask(source, empty_mask)["passed"] is False
  quality = processing.validate_hair_mask(source, buffer.getvalue())
  assert quality["passed"] is True
  assert 0.1 < quality["coverage"] < 0.3


def test_edit_mask_makes_hair_transparent_and_preserves_non_hair_pixels() -> None:
  processing = HairProcessingService(Settings())
  source = _image_bytes("RGB", "white", (96, 128))
  mask = Image.new("L", (96, 128), 0)
  for x in range(28, 68):
    for y in range(4, 42):
      mask.putpixel((x, y), 255)
  buffer = BytesIO()
  mask.save(buffer, format="PNG")

  edit_mask = processing.prepare_edit_mask(source, buffer.getvalue())
  with Image.open(BytesIO(edit_mask)) as opened:
    alpha = opened.getchannel("A")
    assert alpha.getpixel((48, 16)) < 32
    assert alpha.getpixel((4, 120)) > 240


def test_identical_image_passes_non_hair_quality_gate(monkeypatch: pytest.MonkeyPatch) -> None:
  processing = HairProcessingService(Settings())
  monkeypatch.setattr(processing, "_detect_face_boxes", lambda _image: [(18, 20, 78, 104)])
  landmarks = [
    [
      (0.3, 0.2),
      (0.4, 0.3),
      (0.5, 0.4),
      (0.5, 0.7),
      (0.2, 0.5),
      (0.6, 0.3),
      (0.7, 0.5),
      (0.8, 0.5),
    ],
  ]
  monkeypatch.setattr(processing, "_detect_face_landmarks", lambda _image: landmarks)
  source = _image_bytes("RGB", "white", (96, 128))
  opaque_mask = _image_bytes("RGBA", (255, 255, 255, 255), (96, 128))

  quality = processing.evaluate_quality(source, source, opaque_mask)

  assert quality["passed"] is True
  assert quality["outsideEditMeanDifference"] == 0
  assert quality["landmarkMeanDrift"] == 0


def test_quality_gate_rejects_face_landmark_drift(monkeypatch: pytest.MonkeyPatch) -> None:
  processing = HairProcessingService(Settings())
  monkeypatch.setattr(processing, "_detect_face_boxes", lambda _image: [(18, 20, 78, 104)])
  detections = iter(
    [
      [[(0.3, 0.2)] * 8],
      [[(0.4, 0.3)] * 8],
    ],
  )
  monkeypatch.setattr(processing, "_detect_face_landmarks", lambda _image: next(detections))
  source = _image_bytes("RGB", "white", (96, 128))
  opaque_mask = _image_bytes("RGBA", (255, 255, 255, 255), (96, 128))

  quality = processing.evaluate_quality(source, source, opaque_mask)

  assert quality["passed"] is False
  assert quality["landmarkMeanDrift"] > quality["landmarkMeanDriftThreshold"]


def test_hair_job_message_contract_and_safety_identifier() -> None:
  job_type, job_id = decode_hair_job(
    {
      "Body": json.dumps(
        {
          "schemaVersion": "aura-hair-job-v1",
          "jobType": "simulation",
          "jobId": "18e8c4c5-bf14-4dbc-8ca9-443ea597fd21",
        },
      ),
    },
  )

  assert job_type == "simulation"
  assert str(job_id) == "18e8c4c5-bf14-4dbc-8ca9-443ea597fd21"
  safety_id = create_openai_safety_identifier(job_id)
  assert len(safety_id) == 64
  assert str(job_id) not in safety_id


def test_hair_settings_reject_invalid_generation_quality() -> None:
  with pytest.raises(ValidationError):
    Settings(hair_generation_quality="ultra")


def test_hair_upload_is_private_and_has_no_cdn_url(monkeypatch: pytest.MonkeyPatch) -> None:
  captured: dict = {}

  class Client:
    def generate_presigned_url(self, _operation: str, *, Params: dict, ExpiresIn: int) -> str:
      captured.update(Params)
      assert ExpiresIn == 900
      return "https://upload.example.com/private"

  service = S3Service(Settings(s3_bucket_name="private-bucket", cdn_base_url="https://cdn.example.com"))
  monkeypatch.setattr(service, "_client", lambda: Client())

  upload = service.create_presigned_upload(
    media_kind="hair-analysis-source",
    content_type="image/heic",
    original_filename="capture.heic",
  )

  assert upload["cdn_url"] is None
  assert upload["cache_control"] == "private, no-store"
  assert captured["CacheControl"] == "private, no-store"
  assert is_private_hair_object_key(str(upload["object_key"])) is True
  assert is_private_hair_object_key("uploads/community/photo.jpg") is False


def test_hair_s3_read_rejects_oversized_object(monkeypatch: pytest.MonkeyPatch) -> None:
  class Body:
    closed = False

    def close(self) -> None:
      self.closed = True

  body = Body()

  class Client:
    def get_object(self, **_kwargs):
      return {"Body": body, "ContentLength": 11, "ContentType": "image/jpeg"}

  service = S3Service(Settings())
  monkeypatch.setattr(service, "_client", lambda: Client())

  with pytest.raises(AppError) as exc_info:
    service.get_object_bytes(bucket="private-bucket", object_key="source.heic", max_bytes=10)

  assert exc_info.value.code == "S3_OBJECT_TOO_LARGE"
  assert body.closed is True


def test_expired_unsaved_simulation_never_returns_download_url() -> None:
  simulation = _normalize_simulation(
    {
      "id": "simulation-id",
      "analysis_id": "analysis-id",
      "style_id": HAIR_STYLES[0].style_id,
      "status": "completed",
      "result_bucket": "private-bucket",
      "result_object_key": "result.jpg",
      "saved_at": None,
      "quality_payload": {},
      "expires_at": datetime.now(timezone.utc) - timedelta(seconds=1),
      "created_at": datetime.now(timezone.utc),
      "completed_at": datetime.now(timezone.utc),
    },
    Settings(),
  )

  assert simulation["status"] == "expired"
  assert simulation["resultUrl"] is None


def test_hair_delete_removes_all_versions_for_exact_object(monkeypatch: pytest.MonkeyPatch) -> None:
  deleted: list[dict] = []

  class Paginator:
    def paginate(self, **_kwargs):
      return [
        {
          "Versions": [
            {"Key": "uploads/hair-simulation-result/result.jpg", "VersionId": "v2"},
            {"Key": "uploads/hair-simulation-result/result.jpg.backup", "VersionId": "other"},
          ],
          "DeleteMarkers": [
            {"Key": "uploads/hair-simulation-result/result.jpg", "VersionId": "marker"},
          ],
        },
      ]

  class Client:
    def get_bucket_versioning(self, **_kwargs):
      return {"Status": "Enabled"}

    def get_paginator(self, operation: str):
      assert operation == "list_object_versions"
      return Paginator()

    def delete_objects(self, **kwargs):
      deleted.extend(kwargs["Delete"]["Objects"])
      return {}

  service = S3Service(Settings(s3_bucket_name="private-bucket"))
  monkeypatch.setattr(service, "_client", lambda: Client())

  service.delete_object_permanently(
    bucket="private-bucket",
    object_key="uploads/hair-simulation-result/result.jpg",
  )

  assert deleted == [
    {"Key": "uploads/hair-simulation-result/result.jpg", "VersionId": "v2"},
    {"Key": "uploads/hair-simulation-result/result.jpg", "VersionId": "marker"},
  ]


def test_hair_schema_has_idempotency_status_and_expiry_constraints() -> None:
  assert "uq_hair_analyses_user_request" in HAIR_SCHEMA_SQL
  assert "uq_hair_simulations_user_request" in HAIR_SCHEMA_SQL
  assert "'queued', 'processing', 'completed', 'failed', 'expired'" in HAIR_SCHEMA_SQL
  assert "expires_at timestamptz not null" in HAIR_SCHEMA_SQL


def test_style_review_requires_assets_and_records_reviewer(tmp_path: Path) -> None:
  style = HAIR_STYLES[0]
  reference = f"{style.style_id}-reference.webp"
  preview = f"{style.style_id}-preview.webp"
  reference_payload = b"reference"
  preview_payload = b"preview"
  (tmp_path / reference).write_bytes(reference_payload)
  (tmp_path / preview).write_bytes(preview_payload)
  manifest_path = tmp_path / "manifest.json"
  manifest_path.write_text(
    json.dumps(
      {
        "catalogVersion": HAIR_CATALOG_VERSION,
        "styles": [
          {
            "styleId": style.style_id,
            "referenceFile": reference,
            "previewFile": preview,
            "referenceSha256": hashlib.sha256(reference_payload).hexdigest(),
            "previewSha256": hashlib.sha256(preview_payload).hexdigest(),
            "reviewStatus": "pending_human_review",
          },
        ],
      },
    ),
    encoding="utf-8",
  )

  approved = approve_styles(manifest_path, [style.style_id], "qa@example.com")

  entry = approved["styles"][0]
  assert entry["reviewStatus"] == "approved"
  assert entry["reviewer"] == "qa@example.com"
  assert entry["reviewedAt"]

  (tmp_path / reference).write_bytes(b"tampered")
  with pytest.raises(ValueError, match="checksum"):
    approve_styles(manifest_path, [style.style_id], "qa@example.com")
