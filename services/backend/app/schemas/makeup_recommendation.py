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

AI_PICK_OPTION_ID = "ai_pick"
AI_PICK_OPTION_LABEL = "AI가 골라줘"


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
    if delegate.id != AI_PICK_OPTION_ID or delegate.label != AI_PICK_OPTION_LABEL:
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


class GeneratedMakeupApplicationColor(CamelModel):
  role: str = Field(min_length=1, max_length=80)
  name: str = Field(min_length=1, max_length=80)
  hex: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")

  @field_validator("role", "name")
  @classmethod
  def strips_nonempty_color_text(cls, value: str) -> str:
    normalized = value.strip()
    if not normalized:
      raise ValueError("application color text must not be blank.")
    return normalized


class GeneratedMakeupApplicationStep(CamelModel):
  order: int = Field(ge=1, le=10)
  title: str = Field(min_length=1, max_length=120)
  product_type: str = Field(alias="productType", min_length=1, max_length=120)
  tool: str = Field(min_length=1, max_length=180)
  colors: list[GeneratedMakeupApplicationColor] = Field(min_length=1, max_length=4)
  amount: str = Field(min_length=1, max_length=180)
  placement: str = Field(min_length=1, max_length=320)
  technique: str = Field(min_length=1, max_length=320)
  blending: str = Field(min_length=1, max_length=260)
  finish_check: str = Field(alias="finishCheck", min_length=1, max_length=260)

  @field_validator(
    "title",
    "product_type",
    "tool",
    "amount",
    "placement",
    "technique",
    "blending",
    "finish_check",
  )
  @classmethod
  def strips_nonempty_step_text(cls, value: str) -> str:
    normalized = value.strip()
    if not normalized:
      raise ValueError("application step text must not be blank.")
    return normalized


class GeneratedMakeupApplicationPlan(CamelModel):
  recipe_version: Literal["makeup-application-v1"] = Field(alias="recipeVersion")
  estimated_minutes: int = Field(alias="estimatedMinutes", ge=1, le=60)
  steps: list[GeneratedMakeupApplicationStep] = Field(min_length=2, max_length=8)
  completion_criteria: list[str] = Field(alias="completionCriteria", min_length=1, max_length=4)

  @field_validator("completion_criteria")
  @classmethod
  def validates_completion_criteria(cls, value: list[str]) -> list[str]:
    normalized = [item.strip() for item in value]
    if any(not item or len(item) > 260 for item in normalized):
      raise ValueError("completionCriteria items must contain 1 to 260 characters.")
    if len({item.casefold() for item in normalized}) != len(normalized):
      raise ValueError("completionCriteria items must be unique.")
    return normalized

  @model_validator(mode="after")
  def uses_contiguous_step_order(self):
    if [step.order for step in self.steps] != list(range(1, len(self.steps) + 1)):
      raise ValueError("applicationPlan steps must use contiguous order starting at 1.")
    return self


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
  application_order: int | None = Field(default=None, alias="applicationOrder", ge=1, le=5)
  application_plan: GeneratedMakeupApplicationPlan | None = Field(default=None, alias="applicationPlan")

  @model_validator(mode="after")
  def keeps_detailed_application_fields_paired(self):
    if (self.application_order is None) != (self.application_plan is None):
      raise ValueError("applicationOrder and applicationPlan must be provided together.")
    if self.application_plan is not None:
      minimum_steps = {"base": 4, "brow": 3, "eye": 5, "cheek": 3, "lip": 3}.get(self.area, 2)
      if len(self.application_plan.steps) < minimum_steps:
        raise ValueError(f"{self.area} applicationPlan requires at least {minimum_steps} steps.")
      distinct_color_names = {
        color.name.casefold()
        for step in self.application_plan.steps
        for color in step.colors
      }
      distinct_color_hexes = {
        color.hex.upper()
        for step in self.application_plan.steps
        for color in step.colors
      }
      if self.area == "eye" and (len(distinct_color_names) < 3 or len(distinct_color_hexes) < 3):
        raise ValueError("eye applicationPlan requires at least three distinct colors.")
      if self.area == "lip" and (len(distinct_color_names) < 2 or len(distinct_color_hexes) < 2):
        raise ValueError("lip applicationPlan requires at least two distinct colors.")
    return self

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


class GeneratedMakeupLookMap(CamelModel):
  version: Literal["makeup-look-map-v1"]
  naturality_to_personality: int = Field(alias="naturalityToPersonality", ge=0, le=100)
  casual_to_glam: int = Field(alias="casualToGlam", ge=0, le=100)
  rationale: str = Field(min_length=1, max_length=300)


class GeneratedMakeupFitDimension(CamelModel):
  available: bool
  score: int | None = Field(default=None, ge=0, le=100)
  reason: str = Field(min_length=1, max_length=400)

  @model_validator(mode="after")
  def score_matches_availability(self):
    if self.available and self.score is None:
      raise ValueError("An available fit dimension must include a score.")
    if not self.available and self.score is not None:
      raise ValueError("An unavailable fit dimension must not include a score.")
    return self


class GeneratedMakeupFitDimensions(CamelModel):
  situation: GeneratedMakeupFitDimension
  preference: GeneratedMakeupFitDimension
  personal_color: GeneratedMakeupFitDimension = Field(alias="personalColor")
  face_structure: GeneratedMakeupFitDimension = Field(alias="faceStructure")
  skin_compatibility: GeneratedMakeupFitDimension = Field(alias="skinCompatibility")
  look_coherence: GeneratedMakeupFitDimension = Field(alias="lookCoherence")


class GeneratedMakeupFitEvidence(CamelModel):
  source: Literal[
    "situation",
    "preference",
    "personal_color",
    "face_structure",
    "skin_type",
    "look_coherence",
  ]
  label: str = Field(min_length=1, max_length=160)
  reason: str = Field(min_length=1, max_length=500)


class GeneratedMakeupFitAssessment(CamelModel):
  scoring_version: Literal["makeup-fit-v1"] = Field(alias="scoringVersion")
  overall_score: int = Field(alias="overallScore", ge=0, le=100)
  dimensions: GeneratedMakeupFitDimensions
  evidence: list[GeneratedMakeupFitEvidence] = Field(min_length=1, max_length=6)

  @model_validator(mode="after")
  def evidence_covers_only_available_dimensions(self):
    availability = {
      "situation": self.dimensions.situation.available,
      "preference": self.dimensions.preference.available,
      "personal_color": self.dimensions.personal_color.available,
      "face_structure": self.dimensions.face_structure.available,
      "skin_type": self.dimensions.skin_compatibility.available,
      "look_coherence": self.dimensions.look_coherence.available,
    }
    evidence_sources = [item.source for item in self.evidence]
    if len(evidence_sources) != len(set(evidence_sources)):
      raise ValueError("Fit evidence sources must be unique.")
    if any(not availability[source] for source in evidence_sources):
      raise ValueError("Fit evidence cannot reference an unavailable dimension.")
    if any(available and source not in evidence_sources for source, available in availability.items()):
      raise ValueError("Every available fit dimension must include evidence.")
    return self


class GeneratedMakeupMatchComponent(CamelModel):
  key: Literal["preference", "situation", "colorHarmony", "skinFinish"]
  weight: int = Field(ge=1, le=100)
  score: int | None = Field(default=None, ge=0, le=100)
  evaluated: bool
  reason: str = Field(min_length=1, max_length=400)
  evidence: list[str] = Field(default_factory=list, max_length=10)

  @model_validator(mode="after")
  def score_matches_evaluation(self):
    if self.evaluated and self.score is None:
      raise ValueError("An evaluated match component must include a score.")
    if not self.evaluated and self.score is not None:
      raise ValueError("An unevaluated match component must not include a score.")
    if any(not item.strip() or len(item) > 300 for item in self.evidence):
      raise ValueError("Match evidence items must contain 1 to 300 characters.")
    return self


class GeneratedMakeupReflectedInput(CamelModel):
  source_type: str = Field(alias="sourceType", min_length=1, max_length=80)
  source_id: str = Field(alias="sourceId", min_length=1, max_length=160)
  input_label: str = Field(alias="inputLabel", min_length=1, max_length=300)
  decision_path: str = Field(alias="decisionPath", min_length=1, max_length=300)
  reflected_value: str = Field(alias="reflectedValue", min_length=1, max_length=300)


class GeneratedMakeupMatchAssessment(CamelModel):
  version: Literal["makeup-match-v1"]
  score: int | None = Field(default=None, ge=0, le=100)
  evaluated_weight: int = Field(alias="evaluatedWeight", ge=0, le=100)
  components: list[GeneratedMakeupMatchComponent] = Field(min_length=4, max_length=4)
  reflected_inputs: list[GeneratedMakeupReflectedInput] = Field(
    default_factory=list,
    alias="reflectedInputs",
    max_length=20,
  )
  generation_source: Literal["claude", "deterministic_fallback"] = Field(
    alias="generationSource",
  )

  @model_validator(mode="after")
  def validates_deterministic_match_contract(self):
    expected_weights = {
      "preference": 35,
      "situation": 25,
      "colorHarmony": 25,
      "skinFinish": 15,
    }
    if [component.key for component in self.components] != list(expected_weights):
      raise ValueError("Match components must use the canonical order.")
    if any(component.weight != expected_weights[component.key] for component in self.components):
      raise ValueError("Match component weights must use makeup-match-v1 weights.")
    evaluated = [component for component in self.components if component.evaluated]
    if self.evaluated_weight != sum(component.weight for component in evaluated):
      raise ValueError("evaluatedWeight must equal the available component weights.")
    enough_evidence = (
      self.evaluated_weight >= 60
      and len(evaluated) >= 2
      and any(component.key in {"preference", "situation"} for component in evaluated)
    )
    if enough_evidence != (self.score is not None):
      raise ValueError("Match score availability does not satisfy the evidence threshold.")
    return self


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
  look_map: GeneratedMakeupLookMap = Field(alias="lookMap")
  fit_assessment: GeneratedMakeupFitAssessment = Field(alias="fitAssessment")

  @model_validator(mode="after")
  def includes_areas_and_legacy_projection(self):
    required = {"base", "brow", "eye", "cheek", "lip"}
    required_areas = [guide.area for guide in self.area_guides if guide.area in required]
    if len(required_areas) != 5 or set(required_areas) != required:
      raise ValueError("Each v2 look must include base, brow, eye, cheek, and lip area guides.")
    required_guides = [guide for guide in self.area_guides if guide.area in required]
    has_detailed_plan = any(guide.application_plan is not None for guide in required_guides)
    if has_detailed_plan:
      expected_orders = {"base": 1, "brow": 2, "eye": 3, "cheek": 4, "lip": 5}
      if any(
        guide.application_plan is None
        or guide.application_order != expected_orders[guide.area]
        for guide in required_guides
      ):
        raise ValueError(
          "Detailed application plans must cover base, brow, eye, cheek, and lip in order 1 through 5.",
        )
      total_estimated_minutes = sum(
        guide.application_plan.estimated_minutes
        for guide in required_guides
        if guide.application_plan is not None
      )
      if total_estimated_minutes > self.duration_minutes:
        raise ValueError("Area application time cannot exceed the look duration.")
      self.area_guides = sorted(
        self.area_guides,
        key=lambda guide: guide.application_order if guide.application_order is not None else 99,
      )
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
  generation_source: Literal["claude", "deterministic_fallback"] = Field(
    alias="generationSource",
  )
  context_summary: list[str] = Field(alias="contextSummary", min_length=1, max_length=8)
  looks: list[GeneratedMakeupLookV2] = Field(min_length=3, max_length=3)
  match_assessment: GeneratedMakeupMatchAssessment | None = Field(
    default=None,
    alias="matchAssessment",
  )

  @model_validator(mode="after")
  def includes_three_distinct_roles(self):
    if [look.role for look in self.looks] != ["anchor", "bold", "discovery"]:
      raise ValueError("V2 recommendation roles must be ordered anchor, bold, discovery.")
    return self
