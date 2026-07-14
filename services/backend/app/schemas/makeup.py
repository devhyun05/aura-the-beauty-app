import json
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.base import CamelModel


class MakeupStyleCreate(CamelModel):
  client_request_id: UUID = Field(alias="clientRequestId")
  style_type: Literal["look", "filter", "recipe"] = Field(default="look", alias="styleType")
  source_analysis_report_id: UUID | None = Field(default=None, alias="sourceAnalysisReportId")
  source_filter_extraction_id: UUID | None = Field(default=None, alias="sourceFilterExtractionId")
  source_media_id: UUID | None = Field(default=None, alias="sourceMediaId")
  thumbnail_media_id: UUID | None = Field(default=None, alias="thumbnailMediaId")
  title: str = Field(min_length=1, max_length=80)
  mood_label: str | None = Field(default=None, alias="moodLabel", max_length=80)
  short_description: str | None = Field(default=None, alias="shortDescription", max_length=500)
  tags: list[str] | None = Field(default=None, max_length=20)
  style_payload: dict = Field(default_factory=dict, alias="stylePayload")

  @field_validator("title")
  @classmethod
  def validate_title(cls, value: str) -> str:
    normalized = value.strip()
    if not normalized:
      raise ValueError("title must not be blank")
    return normalized

  @field_validator("tags")
  @classmethod
  def validate_tags(cls, value: list[str] | None) -> list[str] | None:
    if value is None:
      return None
    normalized = [tag.strip() for tag in value]
    if any(not tag or len(tag) > 40 for tag in normalized):
      raise ValueError("tags must be non-empty and at most 40 characters")
    return list(dict.fromkeys(normalized))

  @field_validator("style_payload")
  @classmethod
  def validate_payload_size(cls, value: dict) -> dict:
    # Recipe state is compact structured data. Bounding it prevents a saved
    # style request from being used as an arbitrary JSON storage endpoint.
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()
    if len(encoded) > 64 * 1024:
      raise ValueError("stylePayload exceeds 64 KiB")
    return value


class MakeupStyleUpdate(CamelModel):
  title: str | None = Field(default=None, min_length=1, max_length=80)
  archived: bool | None = None
