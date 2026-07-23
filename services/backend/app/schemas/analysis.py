from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import ConfigDict, Field, StrictBool, field_validator, model_validator

from app.core.casing import to_camel
from app.core.media_policy import GOLDEN_MASK_MAX_BYTES, GOLDEN_MASK_SCHEMA_VERSION
from app.schemas.base import CamelModel


class AnalysisJobCreate(CamelModel):
  photo_capture_id: UUID | None = Field(default=None, alias="photoCaptureId")
  source_media_id: UUID | None = Field(default=None, alias="sourceMediaId")
  preview_media_id: UUID | None = Field(default=None, alias="previewMediaId")
  title: str = "AI makeup analysis"
  report_title: str | None = Field(default=None, alias="reportTitle")
  environment_label: str | None = Field(default=None, alias="environmentLabel")
  run_immediately: bool = Field(default=False, alias="runImmediately")
  request_payload: dict = Field(default_factory=dict, alias="requestPayload")


class GoldenMaskAttachRequest(CamelModel):
  media_id: UUID = Field(alias="mediaId")
  schema_version: Literal[GOLDEN_MASK_SCHEMA_VERSION] = Field(alias="schemaVersion")
  capture_id: str = Field(alias="captureId", min_length=1, max_length=200)
  byte_size: int = Field(alias="byteSize", ge=1, le=GOLDEN_MASK_MAX_BYTES)
  vertex_count: int = Field(alias="vertexCount", ge=1, le=4_096)
  index_count: int = Field(alias="indexCount", ge=3, le=32_768)
  uv_count: int = Field(alias="uvCount", ge=1, le=4_096)
  topology_fingerprint: str = Field(
    alias="topologyFingerprint",
    pattern=r"^[0-9a-fA-F]{64}$",
  )
  created_at: datetime = Field(alias="createdAt")
  true_depth_hardware: StrictBool = Field(alias="trueDepthHardware")

  @field_validator("index_count")
  @classmethod
  def validate_triangle_indices(cls, value: int) -> int:
    if value % 3 != 0:
      raise ValueError("indexCount must contain complete triangles.")
    return value

  @field_validator("topology_fingerprint")
  @classmethod
  def normalize_topology_fingerprint(cls, value: str) -> str:
    return value.lower()

  @field_validator("created_at")
  @classmethod
  def validate_created_at_timezone(cls, value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
      raise ValueError("createdAt must include a timezone.")
    return value

  @model_validator(mode="after")
  def validate_mesh_provenance(self):
    if self.uv_count != self.vertex_count:
      raise ValueError("uvCount must match vertexCount.")
    if self.true_depth_hardware is not True:
      raise ValueError("trueDepthHardware must be true.")
    return self

  def metadata_payload(self) -> dict:
    payload = self.model_dump(
      mode="json",
      by_alias=True,
      exclude={"media_id"},
      exclude_none=True,
    )
    payload["source"] = "arkit_face_mesh"
    return payload


class FeedbackJobCreate(CamelModel):
  entry_date: date | None = Field(default=None, alias="entryDate")
  feedback_kind: Literal["initial", "correction"] = Field(default="initial", alias="feedbackKind")
  parent_feedback_report_id: UUID | None = Field(default=None, alias="parentFeedbackReportId")
  photo_capture_id: UUID | None = Field(default=None, alias="photoCaptureId")
  uploaded_media_id: UUID | None = Field(default=None, alias="uploadedMediaId")
  source: str = "camera"
  source_label: str | None = Field(default=None, alias="sourceLabel")
  run_immediately: bool = Field(default=False, alias="runImmediately")
  request_payload: dict = Field(default_factory=dict, alias="requestPayload")

  @field_validator("entry_date", mode="before")
  @classmethod
  def validate_entry_date(cls, value: object) -> object:
    if value is None:
      return None
    if not isinstance(value, str):
      raise ValueError("entryDate must use YYYY-MM-DD format")
    try:
      parsed = date.fromisoformat(value)
    except ValueError as exc:
      raise ValueError("entryDate must use YYYY-MM-DD format") from exc
    if parsed.isoformat() != value:
      raise ValueError("entryDate must use YYYY-MM-DD format")
    return value


class FeedbackJobResponseModel(CamelModel):
  model_config = ConfigDict(
    populate_by_name=True,
    alias_generator=to_camel,
    extra="allow",
  )


class FeedbackJobRecord(FeedbackJobResponseModel):
  id: UUID
  user_id: UUID
  photo_capture_id: UUID | None
  uploaded_media_id: UUID | None
  entry_date: date
  feedback_kind: Literal["initial", "correction"]
  parent_feedback_report_id: UUID | None
  source: Literal["camera", "gallery", "seed", "generated"]
  source_label: str | None
  score: int | None = Field(ge=0, le=100)
  status: Literal["pending", "processing", "completed", "failed", "cancelled"]
  model_version: str | None
  feedback_payload: dict[str, Any]
  created_at: datetime
  completed_at: datetime | None


class FeedbackJobCreateResponseData(FeedbackJobResponseModel):
  job: FeedbackJobRecord


class FeedbackJobCreateResponse(FeedbackJobResponseModel):
  data: FeedbackJobCreateResponseData
  meta: dict[str, Any]
  error: None


class FeedbackConferenceMessagesCreate(CamelModel):
  report_id: UUID | None = Field(default=None, alias="reportId")
  result: dict = Field(default_factory=dict)
  request_payload: dict = Field(default_factory=dict, alias="requestPayload")
  preview_context: dict = Field(default_factory=dict, alias="previewContext")


class FeedbackConferencePreviewCreate(CamelModel):
  report_id: UUID | None = Field(default=None, alias="reportId")
  request_payload: dict = Field(default_factory=dict, alias="requestPayload")


class FilterExtractionJobCreate(CamelModel):
  photo_capture_id: UUID | None = Field(default=None, alias="photoCaptureId")
  result_media_id: UUID | None = Field(default=None, alias="resultMediaId")
  title: str = "Extracted makeup filter"
  subtitle: str | None = None
  request_payload: dict = Field(default_factory=dict, alias="requestPayload")

class FilterExtractionAnalyzeRequest(CamelModel):
  photo_capture_id: UUID | None = Field(default=None, alias="photoCaptureId")
  result_media_id: UUID | None = Field(default=None, alias="resultMediaId")
  reference_image_id: str | None = Field(default=None, alias="referenceImageId")
  title: str = "Reference makeup"
  subtitle: str | None = None
  run_ai: bool = Field(default=False, alias="runAi")
  request_payload: dict = Field(default_factory=dict, alias="requestPayload")
