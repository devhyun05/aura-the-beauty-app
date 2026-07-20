from pydantic import Field

from app.schemas.base import CamelModel


class BeardSurveyAnswersRequest(CamelModel):
  a1: int | None = None
  shave: int | None = None
  freq: int | None = None
  cover: int | None = None
  plan: int | None = None
  areas: list[int] = Field(default_factory=list)


class BeardAnalysisRequest(CamelModel):
  image_key: str = Field(alias="imageKey")
  bucket: str | None = None
  content_type: str | None = Field(default=None, alias="contentType")
  guard_passed: bool = Field(default=True, alias="guardPassed")
  survey: BeardSurveyAnswersRequest = Field(default_factory=BeardSurveyAnswersRequest)
