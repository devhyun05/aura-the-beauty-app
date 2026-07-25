from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.base import CamelModel


ReportExportType = Literal[
  "face-analysis",
  "makeup-recommendation",
  "makeup-feedback",
  "reference-makeup-extraction",
]


class LongImageExportPageRequest(CamelModel):
  index: int = Field(ge=0, lt=64)
  byte_size: int = Field(alias="byteSize", ge=1, le=12 * 1024 * 1024)
  content_type: str = Field(alias="contentType")
  width: int = Field(ge=320, le=4096)
  height: int = Field(ge=64, le=8192)

  @field_validator("content_type")
  @classmethod
  def require_jpeg(cls, value: str) -> str:
    normalized = value.split(";", 1)[0].strip().lower()
    if normalized not in {"image/jpeg", "image/jpg"}:
      raise ValueError("Report export pages must use image/jpeg.")
    return "image/jpeg"


class LongImageExportSessionRequest(CamelModel):
  report_type: ReportExportType = Field(alias="reportType")
  target_width: int = Field(default=1440, alias="targetWidth", ge=720, le=2160)
  pages: list[LongImageExportPageRequest] = Field(min_length=1, max_length=64)

  @model_validator(mode="after")
  def require_contiguous_pages(self):
    indexes = [page.index for page in self.pages]
    if indexes != list(range(len(indexes))):
      raise ValueError("Report export page indexes must be contiguous and ordered.")
    return self
