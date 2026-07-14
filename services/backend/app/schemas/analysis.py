from uuid import UUID

from pydantic import Field

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
  photo_capture_id: UUID | None = Field(default=None, alias="photoCaptureId")
  uploaded_media_id: UUID | None = Field(default=None, alias="uploadedMediaId")
  source: str = "camera"
  source_label: str | None = Field(default=None, alias="sourceLabel")
  run_immediately: bool = Field(default=False, alias="runImmediately")
  request_payload: dict = Field(default_factory=dict, alias="requestPayload")


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
