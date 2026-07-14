from uuid import UUID

from pydantic import Field

from app.schemas.base import CamelModel


class MakeupStyleCreate(CamelModel):
  style_type: str = Field(default="look", alias="styleType")
  source_analysis_report_id: UUID | None = Field(default=None, alias="sourceAnalysisReportId")
  source_filter_extraction_id: UUID | None = Field(default=None, alias="sourceFilterExtractionId")
  source_media_id: UUID | None = Field(default=None, alias="sourceMediaId")
  thumbnail_media_id: UUID | None = Field(default=None, alias="thumbnailMediaId")
  title: str
  mood_label: str | None = Field(default=None, alias="moodLabel")
  short_description: str | None = Field(default=None, alias="shortDescription")
  tags: list[str] | None = None
  style_payload: dict = Field(default_factory=dict, alias="stylePayload")