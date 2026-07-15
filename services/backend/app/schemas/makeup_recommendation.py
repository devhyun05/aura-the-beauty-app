from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel


class MakeupRecommendationProfile(CamelModel):
  face_shape: str | None = Field(default=None, alias="faceShape", max_length=120)
  skin_type: str | None = Field(default=None, alias="skinType", max_length=120)
  tone_summary: str | None = Field(default=None, alias="toneSummary", max_length=240)
  recommended_mood: str | None = Field(default=None, alias="recommendedMood", max_length=120)
  summary: str | None = Field(default=None, max_length=500)


class MakeupRecommendationGenerate(CamelModel):
  prompt: str = Field(min_length=1, max_length=500)
  source_image_url: str = Field(alias="sourceImageUrl", min_length=1, max_length=2048)
  conditions: list[str] = Field(default_factory=list, max_length=12)
  personal_color: str | None = Field(default=None, alias="personalColor", max_length=120)
  profile: MakeupRecommendationProfile | None = None
  refinement: Literal["natural", "hip", "differentColor", "replaceProducts"] | None = None
