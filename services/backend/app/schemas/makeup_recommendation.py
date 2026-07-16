from typing import Any, Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.base import CamelModel


FORBIDDEN_QUESTION_AXES = (
  "피부톤",
  "피부색",
  "피부밝기",
  "언더톤",
  "퍼스널컬러",
  "얼굴형",
  "쿨톤",
  "웜톤",
  "밝은톤",
  "중간톤",
  "어두운톤",
)


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


class MakeupScenarioRequest(CamelModel):
  count: int = Field(default=8, ge=3, le=12)
  exclude_texts: list[str] = Field(default_factory=list, alias="excludeTexts", max_length=100)


class MakeupQuestionRequest(CamelModel):
  scenario_text: str = Field(alias="scenarioText", min_length=1, max_length=240)
  scenario_label: str | None = Field(default=None, alias="scenarioLabel", max_length=80)
  scenario_tags: list[str] = Field(default_factory=list, alias="scenarioTags", max_length=8)


class MakeupRecommendationRequest(CamelModel):
  scenario_text: str = Field(alias="scenarioText", min_length=1, max_length=240)
  scenario_label: str | None = Field(default=None, alias="scenarioLabel", max_length=80)
  scenario_tags: list[str] = Field(default_factory=list, alias="scenarioTags", max_length=8)
  questions: list[dict[str, Any]] = Field(default_factory=list, max_length=6)
  answers: list[dict[str, Any]] = Field(default_factory=list, max_length=6)


class MakeupRecommendationRefinementRequest(CamelModel):
  refinement: Literal["natural", "hip", "differentColor", "replaceProducts"]


class MakeupRecommendationResponse(CamelModel):
  report_id: UUID = Field(alias="reportId")
  recommendation: dict[str, Any]
  image_status: str = Field(alias="imageStatus")


class GeneratedQuestionOption(CamelModel):
  id: str = Field(min_length=1, max_length=80)
  label: str = Field(min_length=1, max_length=80)


class GeneratedQuestion(CamelModel):
  id: str = Field(min_length=1, max_length=80)
  title: str = Field(min_length=1, max_length=160)
  options: list[GeneratedQuestionOption] = Field(min_length=4, max_length=4)

  @model_validator(mode="after")
  def includes_delegate_option_and_unique_choices(self):
    if len({option.id for option in self.options}) != len(self.options):
      raise ValueError("Question option ids must be unique.")
    if len({option.label.casefold() for option in self.options}) != len(self.options):
      raise ValueError("Question option labels must be unique.")
    delegate = self.options[-1]
    if delegate.id != "ai_pick" or delegate.label != "AI가 골라줘":
      raise ValueError("The last option must be the exact AI delegation option.")
    content = "".join([self.title, *[option.label for option in self.options]]).replace(" ", "").casefold()
    if any(axis in content for axis in FORBIDDEN_QUESTION_AXES):
      raise ValueError("Questions must not ask users to classify skin tone, undertone, or face shape.")
    return self


class GeneratedQuestions(CamelModel):
  questions: list[GeneratedQuestion] = Field(min_length=1, max_length=3)

  @model_validator(mode="after")
  def uses_unique_question_ids(self):
    if len({question.id for question in self.questions}) != len(self.questions):
      raise ValueError("Question ids must be unique.")
    return self


class GeneratedMakeupStep(CamelModel):
  order: int = Field(ge=1, le=10)
  area: Literal["base", "brow", "eye", "cheek", "lip"]
  instruction: str = Field(min_length=1, max_length=400)


class GeneratedMakeupProduct(CamelModel):
  area: Literal["base", "brow", "eye", "cheek", "lip"]
  brand_name: str = Field(alias="brandName", min_length=1, max_length=100)
  product_name: str = Field(alias="productName", min_length=1, max_length=140)
  shade_name: str | None = Field(default=None, alias="shadeName", max_length=100)
  reason: str = Field(min_length=1, max_length=240)


class GeneratedMakeupLook(CamelModel):
  id: str = Field(min_length=1, max_length=80)
  role: Literal["anchor", "bold", "discovery"]
  title: str = Field(min_length=1, max_length=100)
  summary: str = Field(min_length=1, max_length=300)
  reasons: list[str] = Field(min_length=1, max_length=4)
  applied_conditions: list[str] = Field(alias="appliedConditions", min_length=1, max_length=8)
  duration_minutes: int = Field(alias="durationMinutes", ge=5, le=120)
  difficulty: Literal["easy", "medium", "advanced"]
  steps: list[GeneratedMakeupStep] = Field(min_length=5, max_length=8)
  products: list[GeneratedMakeupProduct] = Field(min_length=3, max_length=8)

  @model_validator(mode="after")
  def includes_every_makeup_area(self):
    if {step.area for step in self.steps} != {"base", "brow", "eye", "cheek", "lip"}:
      raise ValueError("Each look must include base, brow, eye, cheek, and lip steps.")
    return self


class GeneratedMakeupRecommendation(CamelModel):
  looks: list[GeneratedMakeupLook] = Field(min_length=3, max_length=3)

  @model_validator(mode="after")
  def includes_three_distinct_roles(self):
    if {look.role for look in self.looks} != {"anchor", "bold", "discovery"}:
      raise ValueError("Recommendation must include anchor, bold, and discovery roles.")
    return self
