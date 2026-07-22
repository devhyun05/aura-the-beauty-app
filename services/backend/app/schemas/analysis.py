from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator

from app.core.casing import to_camel
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
  # `/filter-extractions/analyze` is a production AI endpoint: omitting runAi
  # means real AI, while an explicit false is rejected by the route.
  run_ai: bool = Field(default=True, alias="runAi")
  request_payload: dict = Field(default_factory=dict, alias="requestPayload")
