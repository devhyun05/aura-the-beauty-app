import re
from typing import Any, Literal
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator, model_validator

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


MAKEUP_RECOMMENDATION_EVENT_NAMES = (
  "makeup_recommendation_opened",
  "analysis_report_selected",
  "makeup_situation_selected",
  "makeup_keyword_selected",
  "custom_situation_submitted",
  "recommendation_question_answered",
  "recommendation_generation_started",
  "recommendation_text_completed",
  "recommendation_image_completed",
  "recommendation_image_failed",
  "recommendation_area_opened",
  "recommendation_ar_applied",
)


class MakeupRecommendationEventMetadata(CamelModel):
  model_config = ConfigDict(populate_by_name=True, extra="forbid")

  id: str | None = Field(default=None, min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$")
  category: str | None = Field(default=None, min_length=1, max_length=80, pattern=r"^[A-Za-z0-9._:-]+$")
  model_version: str | None = Field(
    default=None,
    alias="modelVersion",
    min_length=1,
    max_length=120,
    pattern=r"^[A-Za-z0-9._:/-]+$",
  )
  duration_ms: int | None = Field(default=None, alias="durationMs", ge=0, le=86_400_000)
  status: str | None = Field(default=None, min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")


class MakeupRecommendationEventRequest(CamelModel):
  model_config = ConfigDict(populate_by_name=True, extra="forbid")

  event_name: Literal[
    "makeup_recommendation_opened",
    "analysis_report_selected",
    "makeup_situation_selected",
    "makeup_keyword_selected",
    "custom_situation_submitted",
    "recommendation_question_answered",
    "recommendation_generation_started",
    "recommendation_text_completed",
    "recommendation_image_completed",
    "recommendation_image_failed",
    "recommendation_area_opened",
    "recommendation_ar_applied",
  ] = Field(alias="eventName")
  metadata: MakeupRecommendationEventMetadata = Field(default_factory=MakeupRecommendationEventMetadata)

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


class MakeupRecommendationSessionCreate(CamelModel):
  analysis_report_id: UUID = Field(alias="analysisReportId")
  situation_id: UUID | None = Field(default=None, alias="situationId")
  keyword_id: UUID | None = Field(default=None, alias="keywordId")
  editorial_preset_id: str | None = Field(default=None, alias="editorialPresetId", max_length=80)
  custom_situation_text: str | None = Field(default=None, alias="customSituationText", max_length=240)
  custom_situation_label: str | None = Field(default=None, alias="customSituationLabel", max_length=80)
  image_mode: Literal["personalized", "generic"] = Field(default="generic", alias="imageMode")

  @field_validator("custom_situation_text", "custom_situation_label")
  @classmethod
  def normalize_custom_situation(cls, value: str | None) -> str | None:
    if value is None:
      return None
    normalized = " ".join(value.split())
    return normalized or None

  @field_validator("editorial_preset_id")
  @classmethod
  def normalize_editorial_preset_id(cls, value: str | None) -> str | None:
    if value is None:
      return None
    normalized = value.strip()
    if normalized and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", normalized):
      return normalized
    raise ValueError("editorialPresetId must be a lowercase kebab-case id.")

  @model_validator(mode="after")
  def selects_keyword_custom_or_editorial_exactly_once(self):
    selection_count = sum(
      value is not None
      for value in (self.keyword_id, self.custom_situation_text, self.editorial_preset_id)
    )
    if selection_count != 1:
      raise ValueError(
        "Exactly one of keywordId, customSituationText, and editorialPresetId is required.",
      )
    if self.keyword_id is not None and self.situation_id is None:
      raise ValueError("situationId is required when keywordId is selected.")
    if self.custom_situation_label is not None and self.custom_situation_text is None:
      raise ValueError("customSituationLabel requires customSituationText.")
    return self


class MakeupRecommendationSessionAnswer(CamelModel):
  question_id: str = Field(alias="questionId", min_length=1, max_length=80)
  option_id: str | None = Field(default=None, alias="optionId", min_length=1, max_length=80)
  free_text: str | None = Field(default=None, alias="freeText", max_length=240)
  additional_constraints: str | None = Field(default=None, alias="additionalConstraints", max_length=240)

  @field_validator("free_text", "additional_constraints")
  @classmethod
  def normalize_optional_text(cls, value: str | None) -> str | None:
    if value is None:
      return None
    normalized = " ".join(value.split())
    return normalized or None

  @model_validator(mode="after")
  def selects_option_or_free_text(self):
    if (self.option_id is None) == (self.free_text is None):
      raise ValueError("Exactly one of optionId and freeText is required.")
    return self


class MakeupRecommendationImageRetryRequest(CamelModel):
  look_id: str | None = Field(default=None, alias="lookId", min_length=1, max_length=80)


class NormalizedCustomSituation(CamelModel):
  situation_intent: str = Field(alias="situationIntent", min_length=1, max_length=240)
  desired_impression: str | None = Field(default=None, alias="desiredImpression", max_length=160)
  constraints: list[str] = Field(default_factory=list, max_length=8)

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
  id: str | None = Field(default=None, min_length=1, max_length=160)
  area: Literal["base", "brow", "eye", "cheek", "lip"]
  brand_name: str = Field(alias="brandName", min_length=1, max_length=100)
  product_name: str = Field(alias="productName", min_length=1, max_length=200)
  shade_name: str | None = Field(default=None, alias="shadeName", max_length=100)
  reason: str = Field(min_length=1, max_length=240)
  price: int | None = Field(default=None, ge=0)
  image_url: str | None = Field(default=None, alias="imageUrl", max_length=2000)
  purchase_url: str | None = Field(default=None, alias="purchaseUrl", max_length=2000)
  match_rate: int | None = Field(default=None, alias="matchRate", ge=0, le=100)


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

class GeneratedMakeupColor(CamelModel):
  name: str = Field(min_length=1, max_length=80)
  hex: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")


class GeneratedMakeupAreaGuideStep(CamelModel):
  order: int = Field(ge=1, le=10)
  instruction: str = Field(min_length=1, max_length=400)

class GeneratedMakeupAreaGuide(CamelModel):
  area: Literal["base", "brow", "eye", "cheek", "lip", "contour"]
  label: str = Field(min_length=1, max_length=80)
  goal: str = Field(min_length=1, max_length=180)
  color: GeneratedMakeupColor
  texture: str = Field(min_length=1, max_length=100)
  placement: str = Field(min_length=1, max_length=300)
  technique: str = Field(min_length=1, max_length=300)
  steps: list[GeneratedMakeupAreaGuideStep] = Field(min_length=1, max_length=5)
  reason: str = Field(min_length=1, max_length=300)
  avoid: list[str] = Field(default_factory=list, max_length=6)
  products: list[GeneratedMakeupProduct] = Field(default_factory=list, max_length=4)
  ar_supported: bool = Field(alias="arSupported")
  @model_validator(mode="before")
  @classmethod
  def normalizes_early_v2_shape(cls, value):
    if not isinstance(value, dict):
      return value
    normalized = dict(value)
    area = str(normalized.get("area") or "")
    defaults = {
      "base": ("베이스", "뉴트럴 베이지", "#D9B49A"),
      "brow": ("브로우", "내추럴 브라운", "#795548"),
      "eye": ("아이", "소프트 토프", "#9B7F74"),
      "cheek": ("치크", "로지 피치", "#D98E8E"),
      "lip": ("립", "뮤티드 로즈", "#A85D68"),
      "contour": ("컨투어", "뉴트럴 토프", "#8B756A"),
    }
    label, color_name, color_hex = defaults.get(area, (area or "메이크업", "뉴트럴", "#8B756A"))
    normalized.setdefault("label", label)
    if not isinstance(normalized.get("color"), dict):
      legacy_colors = normalized.get("colors")
      legacy_color = (
        next((item for item in legacy_colors if isinstance(item, dict)), None)
        if isinstance(legacy_colors, list)
        else None
      )
      normalized["color"] = legacy_color or {"name": color_name, "hex": color_hex}
    if isinstance(normalized.get("avoid"), str):
      normalized["avoid"] = [normalized["avoid"]] if normalized["avoid"].strip() else []
    raw_steps = normalized.get("steps")
    if isinstance(raw_steps, list):
      normalized["steps"] = [
        step if isinstance(step, dict) else {"order": index, "instruction": str(step)}
        for index, step in enumerate(raw_steps, start=1)
        if (isinstance(step, dict) and str(step.get("instruction") or "").strip())
        or (not isinstance(step, dict) and str(step).strip())
      ]
    return normalized


class GeneratedMakeupLookV2(CamelModel):
  id: str = Field(min_length=1, max_length=80)
  role: Literal["anchor", "bold", "discovery"]
  title: str = Field(min_length=1, max_length=100)
  summary: str = Field(min_length=1, max_length=300)
  reasons: list[str] = Field(min_length=1, max_length=4)
  applied_conditions: list[str] = Field(alias="appliedConditions", min_length=1, max_length=10)
  duration_minutes: int = Field(alias="durationMinutes", ge=5, le=120)
  difficulty: Literal["easy", "medium", "advanced"]
  area_guides: list[GeneratedMakeupAreaGuide] = Field(alias="areaGuides", min_length=5, max_length=6)
  steps: list[GeneratedMakeupStep] = Field(default_factory=list, max_length=10)
  products: list[GeneratedMakeupProduct] = Field(default_factory=list, max_length=12)
  image_brief: str | None = Field(default=None, alias="imageBrief", max_length=800)

  @model_validator(mode="after")
  def includes_areas_and_legacy_projection(self):
    required = {"base", "brow", "eye", "cheek", "lip"}
    if not required.issubset({guide.area for guide in self.area_guides}):
      raise ValueError("Each v2 look must include base, brow, eye, cheek, and lip area guides.")
    if not self.steps:
      self.steps = [
        GeneratedMakeupStep(
          order=index,
          area=guide.area,
          instruction=(" ".join(step.instruction for step in guide.steps).strip() or guide.technique)[:400],
        )
        for index, guide in enumerate(
          [guide for guide in self.area_guides if guide.area in required],
          start=1,
        )
      ]
    if not self.products:
      self.products = [product for guide in self.area_guides for product in guide.products][:12]
    return self


class GeneratedMakeupRecommendationV2(CamelModel):
  context_summary: list[str] = Field(alias="contextSummary", min_length=1, max_length=8)
  looks: list[GeneratedMakeupLookV2] = Field(min_length=3, max_length=3)

  @model_validator(mode="after")
  def includes_three_distinct_roles(self):
    if [look.role for look in self.looks] != ["anchor", "bold", "discovery"]:
      raise ValueError("V2 recommendation roles must be ordered anchor, bold, discovery.")
    return self
