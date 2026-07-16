from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class FaceAnalysisV2Model(BaseModel):
  model_config = ConfigDict(populate_by_name=True, extra="forbid")


class MeasurementSource(StrEnum):
  LANDMARK = "landmark"
  PIXEL = "pixel"
  DEPTH = "depth"
  AI = "ai"


class MeasurementStatus(StrEnum):
  MEASURED = "measured"
  ESTIMATED = "estimated"
  UNMEASURED = "unmeasured"
  BLOCKED = "blocked"


class MeasurementShot(StrEnum):
  S1 = "S1"
  FACE3D = "FACE3D"


MetricValue = float | str | bool | list[str] | dict[str, float]


class MetricEnvelope(FaceAnalysisV2Model):
  value: MetricValue | None
  unit: Literal["mm", "deg", "ratio", "lab", "score", "label"] | None = None
  confidence: Annotated[float, Field(ge=0, le=1)]
  source: MeasurementSource
  status: MeasurementStatus
  shots: list[MeasurementShot]
  sensitivity: Literal[0, 1, 2, 3]
  reason: str | None = None
  warnings: list[str] = Field(default_factory=list)
  derived_from: list[str] = Field(default_factory=list, alias="derivedFrom")

  @model_validator(mode="after")
  def validate_provenance(self) -> "MetricEnvelope":
    if self.source is MeasurementSource.AI:
      if self.status not in {
        MeasurementStatus.ESTIMATED,
        MeasurementStatus.UNMEASURED,
        MeasurementStatus.BLOCKED,
      }:
        raise ValueError("AI metrics must be estimated, blocked, or unmeasured")
      if (
        self.status in {MeasurementStatus.ESTIMATED, MeasurementStatus.BLOCKED}
        and self.shots != [MeasurementShot.S1]
      ):
        raise ValueError("Estimated or blocked AI metrics must use S1")
      if (
        self.status is MeasurementStatus.UNMEASURED
        and self.shots not in ([], [MeasurementShot.S1])
      ):
        raise ValueError("Unmeasured AI metrics may only refer to S1")

    if self.status in {MeasurementStatus.UNMEASURED, MeasurementStatus.BLOCKED}:
      if self.value is not None:
        raise ValueError("Unavailable metrics cannot contain a value")

    return self


class BlockedMetricKey(FaceAnalysisV2Model):
  key: str
  reason: str


class MeasurementCoveragePlan(FaceAnalysisV2Model):
  authoritative_keys: list[str] = Field(alias="authoritativeKeys")
  missing_observable_keys: list[str] = Field(alias="missingObservableKeys")
  out_of_scope_keys: list[str] = Field(alias="outOfScopeKeys")
  blocked_keys: list[BlockedMetricKey] = Field(alias="blockedKeys")


class Insight(FaceAnalysisV2Model):
  label: str
  description: str
  confidence: Annotated[float, Field(ge=0, le=1)]
  rationale_metric_keys: list[str] = Field(alias="rationaleMetricKeys")
  sensitivity: Literal[0, 1, 2, 3]


class DerivedResult(FaceAnalysisV2Model):
  rules_version: str = Field(alias="rulesVersion")
  face_shape: Insight = Field(alias="faceShape")
  vertical_balance: Insight = Field(alias="verticalBalance")
  eye_brow: Insight = Field(alias="eyeBrow")
  iris_exposure: Insight = Field(alias="irisExposure")
  color_axes: Insight = Field(alias="colorAxes")
  skin_color: Insight = Field(alias="skinColor")
  nose_philtrum_lips: Insight = Field(alias="nosePhiltrumLips")
  asymmetry: Insight
  cheekbone_and_eline: Insight = Field(alias="cheekboneAndEline")


class SkinPerception(FaceAnalysisV2Model):
  texture: Insight
  pores: Insight
  sebum_dryness: Insight = Field(alias="sebumDryness")
  shine_distribution: Insight = Field(alias="shineDistribution")
  shine_type: Insight = Field(alias="shineType")
  pigmentation: Insight
  redness: Insight
  dark_circles: Insight = Field(alias="darkCircles")
  tone_uniformity: Insight = Field(alias="toneUniformity")


class FeatureImpression(FaceAnalysisV2Model):
  eye_impression: Insight = Field(alias="eyeImpression")
  eyelid_weight: Insight = Field(alias="eyelidWeight")
  under_eye_zone: Insight = Field(alias="underEyeZone")
  brow_impression: Insight = Field(alias="browImpression")
  lip_impression: Insight = Field(alias="lipImpression")


class LinesAndPlanes(FaceAnalysisV2Model):
  line_shape: Insight = Field(alias="lineShape")
  line_weight: Insight = Field(alias="lineWeight")
  dimensionality: Insight
  contour_definition: Insight = Field(alias="contourDefinition")
  nose_shadow_effect: Insight = Field(alias="noseShadowEffect")
  nose_cheek_connection: Insight = Field(alias="noseCheekConnection")
  lower_face_impression: Insight = Field(alias="lowerFaceImpression")
  jawline_definition: Insight = Field(alias="jawlineDefinition")


class GestaltPerception(FaceAnalysisV2Model):
  perceptual_center: Insight = Field(alias="perceptualCenter")
  feature_presence_ranking: Insight = Field(alias="featurePresenceRanking")
  detail_density: Insight = Field(alias="detailDensity")
  negative_space: Insight = Field(alias="negativeSpace")
  center_vs_outer: Insight = Field(alias="centerVsOuter")
  clarity_vs_softness: Insight = Field(alias="clarityVsSoftness")
  overall_mood: Insight = Field(alias="overallMood")
  standout_features: list[Insight] = Field(alias="standoutFeatures")


class VolumePerception(FaceAnalysisV2Model):
  upper_lower_distribution: Insight = Field(alias="upperLowerDistribution")
  visible_hollows: list[Insight] = Field(alias="visibleHollows")
  mouth_corner_impression: Insight = Field(alias="mouthCornerImpression")


class PersonalColorPerception(FaceAnalysisV2Model):
  status: Literal["provisional", "insufficient"]
  season: str | None
  subtype: str | None
  border_tone: str | None = Field(alias="borderTone")
  rationale_metric_keys: list[str] = Field(alias="rationaleMetricKeys")


class PerceptionResult(FaceAnalysisV2Model):
  skin: SkinPerception
  feature_impression: FeatureImpression = Field(alias="featureImpression")
  lines_and_planes: LinesAndPlanes = Field(alias="linesAndPlanes")
  gestalt: GestaltPerception
  volume: VolumePerception
  personal_color: PersonalColorPerception = Field(alias="personalColor")


class MakeupConsulting(FaceAnalysisV2Model):
  base: str
  brow: str
  eyeshadow: str
  eyeliner: str
  blush: str
  contour: str
  highlight: str
  lip: str


class ConsultingAdvice(FaceAnalysisV2Model):
  summary: str
  items: list[str]
  rationale_metric_keys: list[str] = Field(alias="rationaleMetricKeys")


class RecommendedLook(FaceAnalysisV2Model):
  title: Annotated[str, Field(max_length=12)]
  subtitle: Annotated[str, Field(max_length=16)]
  description: Annotated[str, Field(max_length=82)]
  tags: Annotated[list[str], Field(min_length=2, max_length=2)]


class ConsultingResult(FaceAnalysisV2Model):
  makeup: MakeupConsulting
  color_and_product: ConsultingAdvice = Field(alias="colorAndProduct")
  hair: ConsultingAdvice
  fashion: ConsultingAdvice
  photography: ConsultingAdvice
  recommended_look: RecommendedLook = Field(alias="recommendedLook")
  overall_mood: Annotated[str, Field(max_length=18)] = Field(alias="overallMood")
  summary: str
  short_summary: str = Field(alias="shortSummary")
  tags: list[str]


class MeasurementPhotoQuality(FaceAnalysisV2Model):
  usable: bool
  warnings: list[str]


class MeasurementStageOutput(FaceAnalysisV2Model):
  metrics: dict[str, MetricEnvelope]
  photo_quality: MeasurementPhotoQuality = Field(alias="photoQuality")
  rejected_authoritative_keys: list[str] = Field(
    default_factory=list,
    alias="rejectedAuthoritativeKeys",
  )
  rejected_unknown_keys: list[str] = Field(default_factory=list, alias="rejectedUnknownKeys")


class StageName(StrEnum):
  AI_MEASUREMENT = "ai_measurement"
  AI_PERCEPTION = "ai_perception"
  AI_CONSULTING = "ai_consulting"


class StageStatus(StrEnum):
  PENDING = "pending"
  PROCESSING = "processing"
  COMPLETED = "completed"
  PARTIAL = "partial"
  FAILED = "failed"


class StageState(FaceAnalysisV2Model):
  status: StageStatus
  run_id: str | None = Field(default=None, alias="runId")
  error_code: str | None = Field(default=None, alias="errorCode")
  updated_at: str | None = Field(default=None, alias="updatedAt")
  cache_hit: bool = Field(default=False, alias="cacheHit")

  @classmethod
  def pending(cls) -> "StageState":
    return cls(status=StageStatus.PENDING)


class FaceAnalysisPipelineState(FaceAnalysisV2Model):
  ai_measurement: StageState = Field(alias="aiMeasurement")
  ai_perception: StageState = Field(alias="aiPerception")
  ai_consulting: StageState = Field(alias="aiConsulting")
  overall: Literal["processing", "partial", "completed", "failed"]
  retry_requested_stage: StageName | None = Field(default=None, alias="retryRequestedStage")

  @classmethod
  def pending(cls) -> "FaceAnalysisPipelineState":
    return cls(
      ai_measurement=StageState.pending(),
      ai_perception=StageState.pending(),
      ai_consulting=StageState.pending(),
      overall="processing",
    )


class FaceAnalysisV2(FaceAnalysisV2Model):
  schema_version: Literal["aura-face-analysis-v2"] = Field(
    default="aura-face-analysis-v2",
    alias="schemaVersion",
  )
  coverage: MeasurementCoveragePlan
  ai_measurements: dict[str, MetricEnvelope] = Field(alias="aiMeasurements")
  face_profile: dict[str, MetricEnvelope] = Field(alias="faceProfile")
  derived: DerivedResult
  perception: PerceptionResult | None = None
  consulting: ConsultingResult | None = None
  pipeline: FaceAnalysisPipelineState


class FaceAnalysisStageRetryRequest(FaceAnalysisV2Model):
  stage: StageName

  @field_validator("stage", mode="before")
  @classmethod
  def normalize_stage_alias(cls, value: object) -> object:
    return {
      "aiMeasurement": "ai_measurement",
      "aiPerception": "ai_perception",
      "aiConsulting": "ai_consulting",
    }.get(value, value)
