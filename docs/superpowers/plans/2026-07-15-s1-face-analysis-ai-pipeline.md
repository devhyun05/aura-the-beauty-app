# S1 + 3D Face Analysis AI Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정면 S1 사진과 기존 2D·3D·퍼스널 컬러 카메라 측정으로 1차 보고서를 즉시 만들고, 카메라가 측정하지 않는 항목만 AI가 보완한 뒤 L1·L2·L3 결과를 같은 보고서에 점진적으로 추가한다.

**Architecture:** 백엔드가 기존 측정을 공통 봉투로 정규화하고 권위 키·AI 보완 키·범위 밖 키를 결정한 뒤, `ai_measurement → L1 규칙 → ai_perception → ai_consulting` 순서로 실행한다. 각 AI 단계는 입력 해시 기반 실행 이력에 저장하고 완료 때마다 `analysis_reports.detail_payload.result.faceAnalysisV2`를 갱신한다. 모바일은 서버가 생성 직후 반환한 카메라 기반 프로필로 보고서를 열고, 단계 상태가 끝날 때까지 상세 조회를 폴링해 AI 섹션을 덧붙인다.

**Tech Stack:** FastAPI, Python 3.12, Pydantic v2, asyncpg/PostgreSQL JSONB, Bedrock/OpenAI Responses API, Expo React Native, TypeScript 6, React Navigation, Tamagui.

## Global Constraints

- 제품 범위는 정면 무표정 S1 사진과 현재 ARKit `FACE3D` 측정뿐이다. S2~S7·드레이핑 필요 항목은 `unmeasured`로 남긴다.
- 유효한 카메라 실측은 항상 AI 추정보다 우선하며 AI는 권위 키를 재측정하거나 덮어쓸 수 없다.
- L1은 결정적 서버 코드로 계산하고, 사진을 받는 AI 단계는 `ai_measurement`와 `ai_perception`뿐이다. `ai_consulting`에는 사진을 다시 보내지 않는다.
- 기존 `detail_payload.request.measurements`와 기존 결과 필드는 보존해 구버전 모바일·보고서를 깨뜨리지 않는다.
- AI 단계 하나가 실패해도 카메라 측정과 이미 완료된 섹션은 유지한다.
- 민감도 2는 기본 비노출·사용자 옵트인, 민감도 3은 내부 근거 전용으로 직접 노출하지 않는다.
- 의료 진단, 나이·민족·건강 추론, 시술 유도, 외모 비하 표현을 생성하거나 표시하지 않는다.
- 모바일에 새 UI·아이콘 라이브러리를 추가하지 않고 기존 테마 토큰과 Tamagui 패턴을 사용한다.
- DB 변경은 `docs/backend/schema.sql`과 `docs/backend/aws-postgresql-schema.dbml`을 함께 갱신한다.
- 모바일 변경 후 `npm --prefix apps/mobile run typecheck`를 통과시킨다.
- 기능 플래그 `FACE_ANALYSIS_V2_ENABLED`는 기본 `false`로 추가하고, 테스트·개발 환경에서 명시적으로 활성화한다. 플래그가 꺼졌거나 측정 스키마가 없으면 현재 단일 분석 흐름을 그대로 사용한다.

---

## File Structure

### Backend contracts and deterministic domain logic

- Create `services/backend/app/schemas/face_analysis_v2.py`: 닫힌 Pydantic 계약, 단계 상태, AI 출력, 보고서 집계 타입.
- Create `services/backend/app/services/face_analysis_measurements.py`: 카메라 측정 정규화, 측정 레지스트리, 커버리지 계획, 병합 우선순위, 민감도 필터.
- Create `services/backend/app/services/face_analysis_rules.py`: 동일 입력에 항상 같은 L1 라벨을 반환하는 규칙 엔진.
- Create `services/backend/app/services/face_analysis_stage_runs.py`: 단계 실행 생성·캐시 조회·완료·실패 저장소.
- Create `services/backend/app/services/face_analysis_ai.py`: 단계별 프롬프트, 허용 키 제한, Pydantic 검증과 1회 구조 재시도.
- Create `services/backend/app/services/face_analysis_pipeline.py`: 단계 오케스트레이션, 부분 실패, 집계 저장, 기존 결과 필드 투영.
- Create `services/backend/app/services/face_analysis_schema.py`: `analysis_stage_runs` 런타임 스키마 보장.

### Backend integration and persistence

- Modify `services/backend/app/services/openai_analysis.py`: 이미지 포함/미포함 공용 구조화 JSON 호출 진입점 추가.
- Modify `services/backend/app/api/analysis.py`: 보고서 생성 시 카메라 1차 프로필 저장, V2 파이프라인 실행, 단계 재시도 API, 목록 경량화.
- Modify `services/backend/app/workers/job_dispatcher.py`: 기존 워커 진입점에서 V2 파이프라인을 동일하게 실행.
- Modify `services/backend/app/core/settings.py`: 기능 플래그와 단계 타임아웃 설정.
- Modify `services/backend/.env.example` and `services/backend/README.md`: V2 플래그·단계 설정과 개발 검증 방법 문서화.
- Modify `services/backend/app/main.py`: 런타임 스키마 보장 호출.
- Modify `docs/backend/schema.sql` and `docs/backend/aws-postgresql-schema.dbml`: 실행 이력 테이블·제약·인덱스·FK 문서화.

### Mobile parsing and progressive report UI

- Create `apps/mobile/src/features/face-analysis/services/faceAnalysisV2.ts`: 서버 V2 응답의 엄격한 파서와 공개 가능한 항목 필터.
- Create `apps/mobile/src/features/face-analysis/services/faceAnalysisV2.test.ts`: 매핑, 구버전 폴백, 상태, 민감도 계약.
- Create `apps/mobile/src/features/face-analysis/services/faceAnalysisV2Presentation.ts`: 섹션·배지·재시도 표시 모델.
- Create `apps/mobile/src/features/face-analysis/components/AIAnalysisPipelineSection.tsx`: AI 추가 측정·L1·L2·L3의 점진적 섹션.
- Modify `apps/mobile/src/shared/types/faceAnalysis.ts`: 보고서에 `faceAnalysisV2` 추가.
- Modify `apps/mobile/src/shared/services/faceAnalysisService.ts`: V2 파싱, 카메라 1차 보고서 조기 반환, 상세 폴링 지원.
- Modify `apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportDetailScreen.tsx`: AI 파이프라인 폴링과 섹션 삽입.
- Modify `apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportDetailScreen.test.tsx`: 새 섹션의 컴파일 계약.
- Modify `scripts/mobile/run-face-analysis-measurements-contract.mjs`: TypeScript 6 단독 컴파일과 새 순수 계약 테스트 실행.
- Modify `scripts/mobile/run-face-capture-upload-contract.mjs`: TypeScript 6 `--ignoreConfig` 호환.

---

### Task 1: Restore the Mobile Contract-Test Baseline

**Files:**
- Modify: `scripts/mobile/run-face-analysis-measurements-contract.mjs:27-41`
- Modify: `scripts/mobile/run-face-capture-upload-contract.mjs:31-43`

**Interfaces:**
- Consumes: TypeScript 6 CLI and the existing pure TypeScript contract tests.
- Produces: repeatable `test:face-analysis-measurements` and `test:face-capture-upload` commands used by later tasks.

- [ ] **Step 1: Reproduce the TypeScript 6 runner failure**

Run: `npm --prefix apps/mobile run test:face-analysis-measurements`

Expected: FAIL with `TS5112: tsconfig.json is present but will not be loaded if files are specified on commandline. Use '--ignoreConfig' to skip this error.`

- [ ] **Step 2: Make both standalone compilers explicit**

Add `--ignoreConfig` immediately after `tscPath` in both scripts:

```js
run(process.execPath, [
  tscPath,
  '--ignoreConfig',
  '--module',
  'commonjs',
  '--target',
  'ES2020',
  '--esModuleInterop',
  '--strict',
  '--skipLibCheck',
]);
```

Keep the capture runner's existing argument set, adding only `--ignoreConfig`; do not add or remove strictness there.

- [ ] **Step 3: Verify both runners**

Run: `npm --prefix apps/mobile run test:face-analysis-measurements && npm --prefix apps/mobile run test:face-capture-upload`

Expected: both commands exit 0 and the upload runner prints `Face request contract verified`.

- [ ] **Step 4: Commit**

```bash
git add scripts/mobile/run-face-analysis-measurements-contract.mjs scripts/mobile/run-face-capture-upload-contract.mjs
git commit -m "test(mobile): support TypeScript 6 contract runners"
```

---

### Task 2: Define the Closed Face Analysis V2 Contracts

**Files:**
- Create: `services/backend/app/schemas/face_analysis_v2.py`
- Create: `services/backend/tests/test_face_analysis_v2_schema.py`

**Interfaces:**
- Consumes: `app.schemas.base.CamelModel` and Pydantic v2.
- Produces: `MetricEnvelope`, `MeasurementCoveragePlan`, `Insight`, `DerivedResult`, `PersonalColorPerception`, `PerceptionResult`, `ConsultingResult`, `StageState`, `FaceAnalysisPipelineState`, `FaceAnalysisV2`, and `FaceAnalysisStageRetryRequest`.

- [ ] **Step 1: Write schema tests that reject invalid source/status combinations and unknown AI keys**

```python
import pytest
from pydantic import ValidationError

from app.schemas.face_analysis_v2 import (
  FaceAnalysisStageRetryRequest,
  MetricEnvelope,
  MeasurementSource,
  MeasurementStatus,
)


def test_ai_metric_must_be_estimated_from_s1() -> None:
  metric = MetricEnvelope.model_validate({
    "value": "visible",
    "confidence": 0.82,
    "source": "ai",
    "status": "estimated",
    "shots": ["S1"],
    "sensitivity": 1,
    "warnings": [],
  })
  assert metric.source is MeasurementSource.AI
  assert metric.status is MeasurementStatus.ESTIMATED


@pytest.mark.parametrize("patch", [
  {"status": "measured"},
  {"shots": ["FACE3D"]},
])
def test_ai_metric_rejects_non_estimated_or_non_s1(patch: dict) -> None:
  payload = {
    "value": "visible", "confidence": 0.82, "source": "ai",
    "status": "estimated", "shots": ["S1"], "sensitivity": 1,
    "warnings": [], **patch,
  }
  with pytest.raises(ValidationError):
    MetricEnvelope.model_validate(payload)


def test_retry_accepts_only_ai_stages() -> None:
  assert FaceAnalysisStageRetryRequest.model_validate(
    {"stage": "aiConsulting"},
  ).stage.value == "ai_consulting"
  with pytest.raises(ValidationError):
    FaceAnalysisStageRetryRequest.model_validate({"stage": "l1"})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd services/backend && python -m pytest tests/test_face_analysis_v2_schema.py -q`

Expected: FAIL during collection with `ModuleNotFoundError: app.schemas.face_analysis_v2`.

- [ ] **Step 3: Implement the closed schema**

Use `ConfigDict(extra="forbid", populate_by_name=True)` on the V2 base model. Define the core contract exactly as follows; build the nested perception and consulting fields from the approved design rather than accepting arbitrary dictionaries:

```python
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
  def validate_ai_provenance(self) -> "MetricEnvelope":
    if self.source is MeasurementSource.AI:
      if self.status not in {
        MeasurementStatus.ESTIMATED,
        MeasurementStatus.UNMEASURED,
        MeasurementStatus.BLOCKED,
      }:
        raise ValueError("AI metrics must be estimated, blocked, or unmeasured")
      if self.status in {MeasurementStatus.ESTIMATED, MeasurementStatus.BLOCKED} and self.shots != [MeasurementShot.S1]:
        raise ValueError("Estimated or blocked AI metrics must use the S1 shot")
      if self.status is MeasurementStatus.UNMEASURED and self.shots not in ([], [MeasurementShot.S1]):
        raise ValueError("Unmeasured AI metrics may only refer to S1")
    if self.status in {MeasurementStatus.UNMEASURED, MeasurementStatus.BLOCKED} and self.value is not None:
      raise ValueError("Unavailable metrics cannot contain a value")
    return self
```

Define the closed aggregate types used by all later tasks:

```python
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
  rejected_authoritative_keys: list[str] = Field(default_factory=list, alias="rejectedAuthoritativeKeys")
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
      aiMeasurement=StageState.pending(), aiPerception=StageState.pending(),
      aiConsulting=StageState.pending(), overall="processing",
    )


class FaceAnalysisV2(FaceAnalysisV2Model):
  schema_version: Literal["aura-face-analysis-v2"] = Field(
    default="aura-face-analysis-v2", alias="schemaVersion",
  )
  coverage: MeasurementCoveragePlan
  ai_measurements: dict[str, MetricEnvelope] = Field(alias="aiMeasurements")
  face_profile: dict[str, MetricEnvelope] = Field(alias="faceProfile")
  derived: DerivedResult
  perception: PerceptionResult | None
  consulting: ConsultingResult | None
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
```

- [ ] **Step 4: Add representative nested-contract tests**

```python
def test_insight_rejects_confidence_above_one() -> None:
  with pytest.raises(ValidationError):
    Insight.model_validate({
      "label": "soft", "description": "soft contour", "confidence": 1.1,
      "rationaleMetricKeys": ["contour.outlineStrength"], "sensitivity": 1,
    })


def test_personal_color_is_provisional_or_insufficient() -> None:
  with pytest.raises(ValidationError):
    PersonalColorPerception.model_validate({
      "status": "confirmed", "season": "spring", "subtype": None,
      "borderTone": None, "rationaleMetricKeys": ["personalColor.tone.top"],
    })


def test_v2_serializes_camel_case_contract(valid_v2: FaceAnalysisV2) -> None:
  payload = valid_v2.model_dump(by_alias=True, mode="json")
  assert payload["schemaVersion"] == "aura-face-analysis-v2"
  assert "faceProfile" in payload
  assert "pipeline" in payload
```

- [ ] **Step 5: Run tests and commit**

Run: `cd services/backend && python -m pytest tests/test_face_analysis_v2_schema.py -q`

Expected: PASS.

```bash
git add services/backend/app/schemas/face_analysis_v2.py services/backend/tests/test_face_analysis_v2_schema.py
git commit -m "feat(analysis): define face analysis v2 contracts"
```

---

### Task 3: Normalize Camera Measurements, Plan Coverage, and Merge AI Estimates

**Files:**
- Create: `services/backend/app/services/face_analysis_measurements.py`
- Create: `services/backend/tests/test_face_analysis_measurements.py`
- Reference: `apps/mobile/src/features/face-analysis/services/faceAnalysisMeasurements.ts`

**Interfaces:**
- Consumes: raw `request_payload["measurements"]` and `MetricEnvelope`.
- Produces: `normalize_camera_measurements(measurements) -> dict[str, MetricEnvelope]`, `build_measurement_coverage(profile) -> MeasurementCoveragePlan`, `merge_measurements(camera, ai, coverage) -> MergeResult`, and `filter_metrics_for_audience(metrics, include_sensitive) -> dict`.

- [ ] **Step 1: Write failing precedence and scope tests**

```python
from app.services.face_analysis_measurements import (
  build_measurement_coverage,
  merge_measurements,
  normalize_camera_measurements,
)


def test_camera_metric_cannot_be_overwritten_by_ai() -> None:
  camera = normalize_camera_measurements({
    "schemaVersion": "aura-face-analysis-measurements-v1",
    "face3d": {"metrics": {"noseTipProjection": {
      "value": 0.14, "unit": "ratio", "confidence": 0.93,
    }}},
  })
  coverage = build_measurement_coverage(camera)
  result = merge_measurements(camera, {
    "face3d.noseTipProjection": {
      "value": "high", "unit": "label", "confidence": 0.99,
      "source": "ai", "status": "estimated", "shots": ["S1"],
      "sensitivity": 1, "warnings": [],
    },
  }, coverage)
  assert result.profile["face3d.noseTipProjection"].value == 0.14
  assert result.profile["face3d.noseTipProjection"].source.value == "depth"
  assert result.rejected_authoritative_keys == ["face3d.noseTipProjection"]


def test_s2_to_s7_metrics_are_never_ai_targets() -> None:
  coverage = build_measurement_coverage({})
  assert "profile.fullSideProfile" in coverage.out_of_scope_keys
  assert "profile.fullSideProfile" not in coverage.missing_observable_keys
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd services/backend && python -m pytest tests/test_face_analysis_measurements.py -q`

Expected: FAIL with missing service module.

- [ ] **Step 3: Implement explicit registries and canonical paths**

Create immutable registries. Camera normalization must use current wire sections and preserve low-confidence/blocked distinctions:

```python
AI_OBSERVABLE_METRICS: dict[str, tuple[int, str]] = {
  "eyes.innerCornerOpenness": (1, "label"),
  "eyes.irisExposure": (1, "label"),
  "eyes.irisToAperture": (1, "label"),
  "eyes.upperLidCurve": (1, "label"),
  "eyes.lowerLidCurve": (1, "label"),
  "eyes.scleraIrisContrast": (1, "score"),
  "brows.lengthType": (0, "label"),
  "brows.archPosition": (0, "label"),
  "brows.archHeight": (0, "label"),
  "brows.heightAsymmetry": (2, "label"),
  "brows.hairTexture": (1, "label"),
  "brows.density": (1, "label"),
  "eyes.heightAsymmetry": (2, "label"),
  "lashes.direction": (1, "label"),
  "lashes.density": (1, "label"),
  "eyes.eyelidType": (1, "label"),
  "eyes.eyelidThickness": (1, "label"),
  "eyes.eyelidStability": (2, "label"),
  "eyes.epicanthalFold": (2, "label"),
  "eyes.aegyoSal": (1, "label"),
  "lips.upperThicknessType": (0, "label"),
  "lips.lowerThicknessType": (0, "label"),
  "lips.cupidsBowShape": (0, "label"),
  "lips.cornerImpression": (1, "label"),
  "nose.nostrilExposure": (1, "label"),
  "nose.nostrilAsymmetry": (2, "label"),
  "nose.tipSkinThickness": (2, "label"),
  "nose.alarFleshiness": (2, "label"),
  "philtrum.visualLength": (1, "label"),
  "philtrum.definition": (1, "label"),
  "contour.foreheadWidthType": (1, "label"),
  "contour.cheekboneWidthType": (1, "label"),
  "contour.chinWidthType": (1, "label"),
  "contour.jawAngleType": (1, "label"),
  "contour.outlineStrength": (1, "label"),
  "contour.fiveEyeBalanceSupplement": (2, "label"),
  "asymmetry.regionalObservations": (2, "label"),
  "color.browTone": (1, "label"),
  "color.irisTone": (1, "label"),
  "skin.toneUniformity": (1, "score"),
  "skin.rednessMap": (2, "label"),
  "skin.darkCircleColor": (1, "label"),
  "skin.lipLineColor": (1, "label"),
  "skin.relativeContrast": (1, "label"),
  "skin.texture": (1, "label"),
  "skin.pores": (1, "label"),
  "skin.sebumDryness": (1, "label"),
  "skin.shineDistribution": (1, "label"),
  "skin.shineType": (1, "label"),
  "skin.thicknessImpression": (2, "label"),
  "skin.elasticityImpression": (2, "label"),
  "skin.pigmentationDistribution": (2, "label"),
  "skin.marksAndScarsMap": (2, "label"),
}

OUT_OF_SCOPE_METRICS = frozenset({
  "profile.fullSideProfile",
  "profile.hairlineGeometry",
  "head.cranialRatios",
  "ears.sizeAndAngle",
  "neck.lengthAndThickness",
  "neck.trapezius",
  "neck.jawConnection",
  "body.faceToHeightRatio",
  "smile.eyeChange",
  "smile.mouthCornerChange",
  "teeth.dynamicExposure",
  "gums.dynamicExposure",
  "draping.temperatureResponse",
  "draping.valueResponse",
  "draping.chromaResponse",
  "draping.clarityResponse",
})
```

Normalize the four camera sections under stable prefixes: `verticalThirds.*` from landmark/pixel, `geometry2d.*` from landmark/pixel, `face3d.*` from depth, and `personalColor.*` from pixel. A camera value is authoritative only when finite/non-empty, its section status is successful, and its confidence meets the section threshold; otherwise produce `blocked` with the original reason and warnings.

- [ ] **Step 4: Implement deterministic merge and display filtering**

```python
@dataclass(frozen=True)
class MergeResult:
  profile: dict[str, MetricEnvelope]
  rejected_authoritative_keys: list[str]
  rejected_unknown_keys: list[str]


def merge_measurements(camera, ai, coverage):
  merged = dict(camera)
  rejected_authoritative: list[str] = []
  rejected_unknown: list[str] = []
  allowed = set(coverage.missing_observable_keys)
  authoritative = set(coverage.authoritative_keys)
  for key, raw_metric in ai.items():
    if key in authoritative:
      rejected_authoritative.append(key)
      continue
    if key not in allowed:
      rejected_unknown.append(key)
      continue
    metric = MetricEnvelope.model_validate(raw_metric)
    merged[key] = metric if metric.confidence >= 0.55 else metric.model_copy(
      update={"value": None, "status": "blocked", "reason": "confidence_below_threshold"},
    )
  return MergeResult(merged, sorted(rejected_authoritative), sorted(rejected_unknown))
```

`filter_metrics_for_audience` must return sensitivity 0–1 by default, add 2 only when `include_sensitive=True`, and always remove 3.

`with_explicit_unmeasured` represents S2–S7/draping-only keys as `source="ai"`, `status="unmeasured"`, `shots=[]`, confidence 0, and an exact `required_shot_missing` reason; these entries are server coverage markers and are never sent to the AI as targets.

- [ ] **Step 5: Verify all branches and commit**

```python
def test_blocked_camera_metric_stays_camera_owned_and_records_reason() -> None:
  camera = {"geometry2d.leftEyeOpenness": MetricEnvelope.model_validate({
    "value": None, "confidence": 0.2, "source": "pixel", "status": "blocked",
    "shots": ["S1"], "sensitivity": 1, "reason": "pose_gate_failed", "warnings": [],
  })}
  coverage = build_measurement_coverage(camera)
  assert "geometry2d.leftEyeOpenness" in coverage.authoritative_keys
  assert coverage.blocked_keys[0].key == "geometry2d.leftEyeOpenness"
  assert coverage.blocked_keys[0].reason == "pose_gate_failed"
  assert "geometry2d.leftEyeOpenness" not in coverage.missing_observable_keys


def test_low_confidence_ai_is_blocked_and_unknown_key_is_rejected() -> None:
  coverage = build_measurement_coverage({})
  result = merge_measurements({}, {
    "skin.texture": ai_metric("smooth", confidence=0.2),
    "unknown.metric": ai_metric("value", confidence=0.9),
  }, coverage)
  assert result.profile["skin.texture"].status is MeasurementStatus.BLOCKED
  assert result.rejected_unknown_keys == ["unknown.metric"]


def test_sensitivity_three_never_leaves_display_filter() -> None:
  metrics = {"internal.score": ai_metric("high", confidence=0.9, sensitivity=3)}
  assert filter_metrics_for_audience(metrics, include_sensitive=False) == {}
  assert filter_metrics_for_audience(metrics, include_sensitive=True) == {}
```

Run: `cd services/backend && python -m pytest tests/test_face_analysis_measurements.py tests/test_face_analysis_v2_schema.py -q`

Expected: PASS.

```bash
git add services/backend/app/services/face_analysis_measurements.py services/backend/tests/test_face_analysis_measurements.py
git commit -m "feat(analysis): normalize and merge face measurements"
```

---

### Task 4: Implement the Deterministic L1 Rule Engine

**Files:**
- Create: `services/backend/app/services/face_analysis_rules.py`
- Create: `services/backend/tests/test_face_analysis_rules.py`

**Interfaces:**
- Consumes: `dict[str, MetricEnvelope]` merged face profile.
- Produces: `derive_face_analysis(profile, rules_version="s1-l1-v1") -> DerivedResult`.

- [ ] **Step 1: Write failing table-driven tests**

```python
from app.services.face_analysis_rules import derive_face_analysis


def test_face_shape_uses_camera_width_and_length_ratios(metric_factory) -> None:
  profile = {
    "verticalThirds.faceAspectRatio": metric_factory(1.42, source="pixel"),
    "geometry2d.jawWidthRatio": metric_factory(0.72, source="pixel"),
    "geometry2d.lowerFaceWidthRatio": metric_factory(0.78, source="pixel"),
  }
  result = derive_face_analysis(profile)
  assert result.rules_version == "s1-l1-v1"
  assert result.face_shape.label == "긴 타원형"
  assert set(result.face_shape.rationale_metric_keys) == set(profile)


def test_l1_is_deterministic(metric_factory) -> None:
  profile = {"face3d.centralProjectionScore": metric_factory(0.61, source="depth")}
  assert derive_face_analysis(profile).model_dump() == derive_face_analysis(profile).model_dump()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd services/backend && python -m pytest tests/test_face_analysis_rules.py -q`

Expected: FAIL with missing module.

- [ ] **Step 3: Implement versioned threshold tables and evidence-aware labels**

Use pure functions only. Every derived insight must include `label`, `confidence`, `rationaleMetricKeys`, and `sensitivity`. Implement these groups: face shape; vertical thirds and five-eye balance; eye/brow; iris exposure; undertone/value/chroma/contrast; redness/dark-circle color; nose/philtrum/lip proportion; internal asymmetry; cheekbone and E-line when supporting metrics exist.

```python
from collections.abc import Sequence


RULES_VERSION = "s1-l1-v1"


def _label_band(value: float, bands: Sequence[tuple[float, str]], fallback: str) -> str:
  return next((label for upper, label in bands if value < upper), fallback)


def derive_face_analysis(profile: dict[str, MetricEnvelope], rules_version: str = RULES_VERSION) -> DerivedResult:
  return DerivedResult(
    rules_version=rules_version,
    face_shape=_derive_face_shape(profile),
    vertical_balance=_derive_vertical_balance(profile),
    eye_brow=_derive_eye_brow(profile),
    iris_exposure=_derive_iris_exposure(profile),
    color_axes=_derive_color_axes(profile),
    skin_color=_derive_skin_color(profile),
    nose_philtrum_lips=_derive_nose_philtrum_lips(profile),
    asymmetry=_derive_asymmetry(profile, sensitivity=3),
    cheekbone_and_eline=_derive_cheekbone_and_eline(profile),
  )
```

When evidence is missing, return an insight with `label="측정 보류"`, confidence 0, and the absent keys as rationale; do not invent a label.

- [ ] **Step 4: Verify boundary, missing-evidence, and sensitivity behavior**

Run: `cd services/backend && python -m pytest tests/test_face_analysis_rules.py tests/test_face_analysis_measurements.py -q`

Expected: PASS including exact boundary cases and sensitivity 3 for the internal asymmetry aggregate.

- [ ] **Step 5: Commit**

```bash
git add services/backend/app/services/face_analysis_rules.py services/backend/tests/test_face_analysis_rules.py
git commit -m "feat(analysis): add deterministic L1 face rules"
```

---

### Task 5: Persist AI Stage Runs and Input-Hash Cache

**Files:**
- Create: `services/backend/app/services/face_analysis_schema.py`
- Create: `services/backend/app/services/face_analysis_stage_runs.py`
- Create: `services/backend/tests/test_face_analysis_stage_runs.py`
- Modify: `services/backend/app/main.py:10-30`
- Modify: `services/backend/app/db/check_schema.py:13-70`
- Modify: `services/backend/app/db/init_db.py:200-230`
- Modify: `services/backend/tests/test_db_scripts.py`
- Modify: `docs/backend/schema.sql:179-225, 910-945`
- Modify: `docs/backend/aws-postgresql-schema.dbml:191-230`

**Interfaces:**
- Consumes: `Database`, report UUID, `StageName`, model/schema/prompt versions, canonical input.
- Produces: `compute_stage_input_hash(value: object) -> str`, `find_completed_stage_run(db, report_id, stage, input_hash, schema_version, prompt_version, model)`, `start_stage_run(db, report_id, stage, input_hash, schema_version, prompt_version, model)`, `complete_stage_run(db, run_id, normalized_output, raw_response)`, and `fail_stage_run(db, run_id, error_payload)`.

- [ ] **Step 1: Write failing repository and schema-contract tests**

Test canonical hashing with differently ordered dictionaries, exact cache query keys, append-only retry rows, one processing row per report/stage, and required SQL/DBML fragments:

```python
def test_input_hash_is_key_order_independent() -> None:
  assert compute_stage_input_hash({"b": 2, "a": 1}) == compute_stage_input_hash({"a": 1, "b": 2})


async def test_cache_is_scoped_to_report_stage_schema_prompt_and_model(fake_db) -> None:
  await find_completed_stage_run(
    fake_db, report_id=REPORT_ID, stage=StageName.AI_MEASUREMENT,
    input_hash="abc", schema_version="aura-face-analysis-v2",
    prompt_version="measurement-v1", model="model-a",
  )
  query, args = fake_db.fetchrow_calls[0]
  assert "report_id = $1" in query and "status = 'completed'" in query
  assert args == (REPORT_ID, "ai_measurement", "abc", "aura-face-analysis-v2", "measurement-v1", "model-a")
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd services/backend && python -m pytest tests/test_face_analysis_stage_runs.py tests/test_db_scripts.py -q`

Expected: FAIL because the table and repository do not exist.

- [ ] **Step 3: Add the idempotent table to SQL, DBML, init migration, and runtime schema**

Use the same SQL in the schema document and runtime ensure service:

```sql
create table if not exists analysis_stage_runs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references analysis_reports(id) on delete cascade,
  stage text not null check (stage in ('ai_measurement', 'ai_perception', 'ai_consulting')),
  status text not null check (status in ('pending', 'processing', 'completed', 'partial', 'failed')),
  schema_version text not null,
  prompt_version text not null,
  model text not null,
  input_hash text not null,
  normalized_output jsonb not null default '{}'::jsonb,
  raw_response jsonb not null default '{}'::jsonb,
  error_payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 1 check (attempt_count >= 1),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_analysis_stage_runs_report_stage_created
  on analysis_stage_runs (report_id, stage, created_at desc);
create index if not exists idx_analysis_stage_runs_completed_cache
  on analysis_stage_runs (stage, input_hash, schema_version, prompt_version, model)
  where status = 'completed';
create unique index if not exists uq_analysis_stage_runs_one_processing
  on analysis_stage_runs (report_id, stage) where status = 'processing';
```

Add `analysis_stage_runs` to `EXPECTED_TABLES`; add the same migration to `POST_SCHEMA_MIGRATIONS`; call `ensure_face_analysis_schema(database)` during app lifespan.

- [ ] **Step 4: Implement canonical hashing and append-only run transitions**

```python
def compute_stage_input_hash(value: object) -> str:
  encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
  return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
```

`start_stage_run` inserts a new row with `attempt_count = coalesce(max(previous.attempt_count), 0) + 1`; a unique-processing conflict must re-read and return the current processing row rather than starting duplicate work. Completion and failure updates must match both `id` and `status='processing'`.

- [ ] **Step 5: Run focused and DB-document tests**

Run: `cd services/backend && python -m pytest tests/test_face_analysis_stage_runs.py tests/test_db_scripts.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/backend/app/services/face_analysis_schema.py services/backend/app/services/face_analysis_stage_runs.py services/backend/app/main.py services/backend/app/db/check_schema.py services/backend/app/db/init_db.py services/backend/tests/test_face_analysis_stage_runs.py services/backend/tests/test_db_scripts.py docs/backend/schema.sql docs/backend/aws-postgresql-schema.dbml
git commit -m "feat(analysis): persist versioned AI stage runs"
```

---

### Task 6: Add Provider-Neutral Structured AI Stage Calls

**Files:**
- Modify: `services/backend/app/services/openai_analysis.py:51-710`
- Create: `services/backend/app/services/face_analysis_ai.py`
- Create: `services/backend/tests/test_face_analysis_ai.py`
- Modify: `services/backend/app/core/settings.py:30-90`

**Interfaces:**
- Consumes: provider settings, S1 image bytes, coverage/profile/derived/perception contracts.
- Produces: `OpenAIAnalysisService.read_source_image_bytes(payload)`, `OpenAIAnalysisService.analyze_structured_json(developer_prompt, user_prompt, json_schema, source_image_bytes, max_tokens)`, `FaceAnalysisAI.measure(source_image_bytes, coverage, camera_profile)`, `FaceAnalysisAI.perceive(source_image_bytes, profile, derived)`, and `FaceAnalysisAI.consult(profile, derived, perception)`.

- [ ] **Step 1: Write failing tests for image boundaries and validation retry**

```python
async def test_consulting_never_sends_image(fake_structured_client) -> None:
  ai = FaceAnalysisAI(fake_structured_client)
  await ai.consult(profile=PROFILE, derived=DERIVED, perception=PERCEPTION)
  assert fake_structured_client.calls[0]["source_image_bytes"] is None


async def test_measurement_rejects_authoritative_and_unknown_keys(fake_structured_client) -> None:
  fake_structured_client.responses = [{
    "metrics": {
      "face3d.noseTipProjection": AI_METRIC,
      "unknown.metric": AI_METRIC,
      "skin.texture": AI_METRIC,
    },
    "photoQuality": {"usable": True, "warnings": []},
  }]
  result = await FaceAnalysisAI(fake_structured_client).measure(
    source_image_bytes=b"jpeg", coverage=COVERAGE, camera_profile=PROFILE,
  )
  assert list(result.metrics) == ["skin.texture"]
  assert result.rejected_authoritative_keys == ["face3d.noseTipProjection"]
  assert result.rejected_unknown_keys == ["unknown.metric"]
```

```python
async def test_invalid_stage_output_gets_one_repair_attempt(fake_structured_client) -> None:
  fake_structured_client.responses = [{"metrics": []}, {"metrics": []}]
  with pytest.raises(AppError) as error:
    await FaceAnalysisAI(fake_structured_client).measure(
      source_image_bytes=b"jpeg", coverage=COVERAGE, camera_profile=PROFILE,
    )
  assert error.value.code == "FACE_ANALYSIS_STAGE_OUTPUT_INVALID"
  assert len(fake_structured_client.calls) == 2
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd services/backend && python -m pytest tests/test_face_analysis_ai.py -q`

Expected: FAIL with missing `FaceAnalysisAI`.

- [ ] **Step 3: Add the provider-neutral structured method**

Add one public method to the existing service while reusing `_read_source_image_bytes`, provider clients, content type inference, and JSON parsing:

```python
async def read_source_image_bytes(self, payload: dict[str, Any]) -> bytes:
  return await asyncio.to_thread(self._read_source_image_bytes, payload)


async def analyze_structured_json(
  self,
  *,
  developer_prompt: str,
  user_prompt: str,
  json_schema: dict[str, Any],
  source_image_bytes: bytes | None,
  max_tokens: int,
) -> dict[str, Any]:
  return await asyncio.to_thread(
    self._analyze_structured_json_sync,
    developer_prompt,
    user_prompt,
    json_schema,
    source_image_bytes,
    max_tokens,
  )
```

For OpenAI, pass `text={"format": {"type": "json_schema", "name": "face_analysis_stage", "strict": True, "schema": json_schema}, "verbosity": "low"}`. For Bedrock, embed the JSON schema in the prompt, demand one JSON object, parse it, and rely on Pydantic validation. Never log the prompt, image, raw response, or full profile.

- [ ] **Step 4: Implement stage-specific prompts and schemas**

Set exact versions and constraints:

```python
MEASUREMENT_PROMPT_VERSION = "s1-measurement-v1"
PERCEPTION_PROMPT_VERSION = "s1-perception-v1"
CONSULTING_PROMPT_VERSION = "s1-consulting-v1"
FORBIDDEN_INFERENCES = (
  "medical diagnosis, disease, age, ethnicity, health status, cosmetic procedures, attractiveness score"
)
```

Measurement prompt receives only `missingObservableKeys`, `authoritativeKeys`, compact camera evidence, and S1 image. Perception prompt receives filtered full profile, L1 derived values, and S1 image and explicitly forbids new measurement keys. Consulting prompt receives sensitivity-filtered profile, L1, L2, and no image; it must produce makeup spatial guidance, product/color guidance, look rationale, hair, fashion, photography, and rationale metric keys.

Validate output through `MeasurementStageOutput`, `PerceptionResult`, or `ConsultingResult`. On validation error, issue exactly one repair request containing the validation error locations but no user identifiers.

- [ ] **Step 5: Add settings and verify**

```python
face_analysis_v2_enabled: bool = False
face_analysis_stage_timeout_seconds: float = Field(default=45.0, ge=5.0, le=180.0)
face_analysis_stage_max_attempts: int = Field(default=2, ge=1, le=3)
```

Add the corresponding uppercase variables with comments to `services/backend/.env.example`, and document that V2 is opt-in, accepts only `aura-face-analysis-measurements-v1`, and falls back to the legacy analyzer when disabled.

Run: `cd services/backend && python -m pytest tests/test_face_analysis_ai.py tests/test_openai_analysis.py -q`

Expected: PASS with exactly one repair attempt in the invalid-output test.

- [ ] **Step 6: Commit**

```bash
git add services/backend/app/services/openai_analysis.py services/backend/app/services/face_analysis_ai.py services/backend/app/core/settings.py services/backend/tests/test_face_analysis_ai.py services/backend/.env.example services/backend/README.md
git commit -m "feat(analysis): add structured AI face stages"
```

---

### Task 7: Orchestrate Stages, Persist Progressive Snapshots, and Project Legacy Fields

**Files:**
- Create: `services/backend/app/services/face_analysis_pipeline.py`
- Create: `services/backend/tests/test_face_analysis_pipeline.py`

**Interfaces:**
- Consumes: Tasks 2–6 contracts/services and the existing `analysis_reports.detail_payload`.
- Produces: `initialize_face_analysis_v2(request_payload)`, `FaceAnalysisPipeline.run(report_id, request_payload, source_image_bytes)`, `persist_face_analysis_v2(db, report_id, result)`, and `project_legacy_analysis_result(v2)`.

- [ ] **Step 1: Write failing orchestration tests**

Cover these exact paths:

```python
async def test_pipeline_persists_after_every_stage(pipeline_fixture) -> None:
  result = await pipeline_fixture.pipeline.run(
    report_id=REPORT_ID,
    request_payload=REQUEST_WITH_MEASUREMENTS,
    source_image_bytes=b"jpeg",
  )
  assert pipeline_fixture.persisted_sections == [
    {"coverage", "faceProfile", "derived", "pipeline"},
    {"coverage", "aiMeasurements", "faceProfile", "derived", "pipeline"},
    {"coverage", "aiMeasurements", "faceProfile", "derived", "perception", "pipeline"},
    {"coverage", "aiMeasurements", "faceProfile", "derived", "perception", "consulting", "pipeline"},
  ]
  assert result.pipeline.overall == "completed"


async def test_measurement_failure_keeps_camera_profile_and_l1(pipeline_fixture) -> None:
  pipeline_fixture.ai.measure.side_effect = AppError(502, "BAD_STAGE", "bad")
  result = await pipeline_fixture.pipeline.run(
    report_id=REPORT_ID,
    request_payload=REQUEST_WITH_MEASUREMENTS,
    source_image_bytes=b"jpeg",
  )
  assert result.face_profile["face3d.noseTipProjection"].source.value == "depth"
  assert result.derived.rules_version == "s1-l1-v1"
  assert result.pipeline.ai_measurement.status.value == "failed"
```

```python
async def test_cache_hit_skips_ai_invocation(pipeline_fixture) -> None:
  pipeline_fixture.stage_runs.cached_output = MEASUREMENT_OUTPUT
  await pipeline_fixture.pipeline.run(
    report_id=REPORT_ID, request_payload=REQUEST_WITH_MEASUREMENTS,
    source_image_bytes=b"jpeg",
  )
  pipeline_fixture.ai.measure.assert_not_awaited()


async def test_l2_failure_blocks_l3_without_erasing_request(pipeline_fixture) -> None:
  pipeline_fixture.ai.perceive.side_effect = AppError(502, "BAD_L2", "bad")
  result = await pipeline_fixture.pipeline.run(
    report_id=REPORT_ID, request_payload=REQUEST_WITH_MEASUREMENTS,
    source_image_bytes=b"jpeg",
  )
  pipeline_fixture.ai.consult.assert_not_awaited()
  assert result.pipeline.ai_consulting.error_code == "DEPENDENCY_FAILED"
  assert pipeline_fixture.last_detail_payload["request"]["measurements"] == REQUEST_WITH_MEASUREMENTS["measurements"]


async def test_stage_timeout_is_sanitized(pipeline_fixture) -> None:
  pipeline_fixture.ai.measure.side_effect = TimeoutError()
  result = await pipeline_fixture.pipeline.run(
    report_id=REPORT_ID, request_payload=REQUEST_WITH_MEASUREMENTS,
    source_image_bytes=b"jpeg",
  )
  assert result.pipeline.ai_measurement.error_code == "STAGE_TIMEOUT"
  assert "jpeg" not in json.dumps(pipeline_fixture.stage_runs.last_error)
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd services/backend && python -m pytest tests/test_face_analysis_pipeline.py -q`

Expected: FAIL with missing pipeline module.

- [ ] **Step 3: Implement initialization and JSONB-safe persistence**

```python
def initialize_face_analysis_v2(request_payload: dict[str, Any]) -> FaceAnalysisV2:
  camera = normalize_camera_measurements(request_payload.get("measurements"))
  coverage = build_measurement_coverage(camera)
  profile = with_explicit_unmeasured(camera, coverage.out_of_scope_keys)
  derived = derive_face_analysis(profile)
  return FaceAnalysisV2(
    coverage=coverage,
    ai_measurements={},
    face_profile=profile,
    derived=derived,
    perception=None,
    consulting=None,
    pipeline=FaceAnalysisPipelineState.pending(),
  )
```

Persist using one SQL expression that updates only `result.faceAnalysisV2`, preserving `request`, legacy `result` keys, and image-generation progress:

```sql
update analysis_reports
set detail_payload = jsonb_set(
  jsonb_set(
    coalesce(detail_payload, '{}'::jsonb),
    '{result}',
    coalesce(detail_payload->'result', '{}'::jsonb),
    true
  ),
  '{result,faceAnalysisV2}', $2::jsonb, true
)
where id = $1
```

The inner `jsonb_set` creates `result` first because PostgreSQL cannot create a missing intermediate path.

- [ ] **Step 4: Implement cached stage execution and partial failure**

For every stage: compute input hash from photo hash/reference + schema/prompt/model + normalized inputs; return cached completed output for the same report; otherwise start a run, execute under `asyncio.timeout`, validate, complete run, update stage state, and persist. On failure, write a sanitized `{code, reason}` payload and persist completed earlier sections.

Run L1 once before AI measurement for the immediate camera snapshot and again after accepted AI measurements. If L2 fails, mark L3 failed with `errorCode="DEPENDENCY_FAILED"` without invoking it. L3 must receive `filter_metrics_for_audience(face_profile, include_sensitive=False)`.

- [ ] **Step 5: Implement deterministic legacy projection**

`project_legacy_analysis_result` maps V2 into the existing keys required by `faceAnalysisService.ts` and image generation:

```python
return {
  "faceShape": v2.derived.face_shape.label,
  "personalColor": _personal_color_label(v2),
  "skinType": _skin_type_label(v2.perception),
  "toneSummary": _tone_summary(v2),
  "recommendedMood": v2.consulting.overall_mood,
  "summary": v2.consulting.summary,
  "shortSummary": v2.consulting.short_summary,
  "skinAnalysisSummary": _skin_summary(v2.perception),
  "baseMakeupGuide": v2.consulting.makeup.base,
  "makeupGuideline": v2.consulting.makeup.model_dump(by_alias=True, exclude={"base"}),
  "recommendedMakeups": [v2.consulting.recommended_look.model_dump(by_alias=True)],
  "tags": v2.consulting.tags,
}
```

Every helper must use measured/derived data or a neutral `측정 보류` value; it may not call AI or invent a second analysis.

- [ ] **Step 6: Verify and commit**

Run: `cd services/backend && python -m pytest tests/test_face_analysis_pipeline.py tests/test_face_analysis_rules.py tests/test_face_analysis_stage_runs.py -q`

Expected: PASS.

```bash
git add services/backend/app/services/face_analysis_pipeline.py services/backend/tests/test_face_analysis_pipeline.py
git commit -m "feat(analysis): orchestrate progressive face analysis stages"
```

---

### Task 8: Integrate V2 with the Analysis API, Worker, Retry, Deletion, and List Payload

**Files:**
- Modify: `services/backend/app/api/analysis.py:54-78, 179-210, 365-520, 572-747, 750-810`
- Modify: `services/backend/app/workers/job_dispatcher.py:190-225`
- Modify: `services/backend/tests/test_analysis_measurements_payload.py`
- Modify: `services/backend/tests/test_ai_job_worker.py`
- Create: `services/backend/tests/test_face_analysis_api.py`

**Interfaces:**
- Consumes: `initialize_face_analysis_v2`, `FaceAnalysisPipeline`, `project_legacy_analysis_result`, and retry request schema.
- Produces: progressive `POST /analysis/jobs`, `GET /analysis/jobs/{id}`, `GET /analysis/reports/{id}`, and `POST /analysis/reports/{id}/stages/retry` behavior.

- [ ] **Step 1: Write failing API contract tests**

```python
def test_create_job_returns_camera_snapshot_before_background_stage_runs(client, fake_db) -> None:
  response = client.post("/api/analysis/jobs", json=REQUEST_BODY_WITH_MEASUREMENTS)
  assert response.status_code == 200
  v2 = response.json()["data"]["job"]["detailPayload"]["result"]["faceAnalysisV2"]
  assert v2["faceProfile"]["face3d.noseTipProjection"]["source"] == "depth"
  assert v2["pipeline"]["overall"] == "processing"


def test_list_strips_heavy_v2_fields_but_keeps_pipeline(client) -> None:
  report = client.get("/api/analysis/reports").json()["data"]["reports"][0]
  v2 = report["detailPayload"]["result"]["faceAnalysisV2"]
  assert set(v2) == {"schemaVersion", "pipeline"}


def test_retry_is_owner_scoped_and_accepts_failed_stage_only(client) -> None:
  response = client.post(f"/api/analysis/reports/{REPORT_ID}/stages/retry", json={"stage": "aiConsulting"})
  assert response.status_code == 202
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd services/backend && python -m pytest tests/test_face_analysis_api.py -q`

Expected: FAIL because V2 initialization and retry route are not wired.

- [ ] **Step 3: Initialize the camera snapshot synchronously at report creation**

When the flag is enabled and `requestPayload.measurements.schemaVersion == "aura-face-analysis-measurements-v1"`, call `initialize_face_analysis_v2` before INSERT and store:

```python
initial_detail = {"request": payload.request_payload}
if should_run_face_analysis_v2(settings, payload.request_payload):
  initial_v2 = initialize_face_analysis_v2(payload.request_payload)
  initial_v2.pipeline.overall = "processing"
  initial_detail["result"] = {"faceAnalysisV2": initial_v2.model_dump(by_alias=True)}
```

Return this inserted row so the mobile can render camera results without waiting for AI.

- [ ] **Step 4: Use V2 in both inline and SQS worker execution**

In `run_analysis_job_background`, call the V2 pipeline when eligible. Use its legacy projection for the existing report columns and recommended-image flow. If V2 cannot produce consulting-compatible legacy fields, call the current `analyze_text` once as a compatibility fallback and retain the partial `faceAnalysisV2` snapshot. When the flag is off, execute the current path unchanged.

Read the owned source image once with `read_source_image_bytes(payload.request_payload)`, pass the same bytes to measurement and perception, and pass them to `prepare_generation_source` so the new pipeline does not add duplicate S3 reads. Preserve the current image-generation prewarm and background behavior.

Replace full `build_analysis_detail_payload` overwrites with a merge helper that preserves `faceAnalysisV2` during image-generation progress and preserves `request.measurements` during every update.

- [ ] **Step 5: Add owner-scoped retry and deletion behavior**

The retry route must:

1. query by `report_id` and authenticated `user_id`;
2. reject processing/completed stages with 409 `ANALYSIS_STAGE_NOT_RETRYABLE`;
3. persist `pipeline.retryRequestedStage`, enqueue the same report without recreating it, and make `job_dispatcher.py` process an otherwise terminal report when that marker exists;
4. declare the route with `@router.post("/reports/{report_id}/stages/retry", status_code=202)` and return `success({"report": normalize_analysis_report_row(report), "stage": payload.stage.value})`.

The existing report deletion must rely on the new `ON DELETE CASCADE` for hard deletion; for soft deletion, stage rows stay inaccessible because all reads join an owned, non-deleted report. Assert both properties explicitly:

```python
assert "references analysis_reports(id) on delete cascade" in schema_sql.lower()
assert client.get(f"/api/analysis/reports/{SOFT_DELETED_REPORT_ID}").status_code == 404
assert client.post(
  f"/api/analysis/reports/{OTHER_USERS_REPORT_ID}/stages/retry",
  json={"stage": "aiConsulting"},
).status_code == 404
```

- [ ] **Step 6: Keep list responses small**

Replace the single `#- '{request,measurements}'` projection with nested JSONB deletion that retains only V2 schema and pipeline:

```sql
jsonb_set(
  r.detail_payload #- '{request,measurements}',
  '{result,faceAnalysisV2}',
  jsonb_build_object(
    'schemaVersion', r.detail_payload #> '{result,faceAnalysisV2,schemaVersion}',
    'pipeline', r.detail_payload #> '{result,faceAnalysisV2,pipeline}'
  ),
  true
) as detail_payload
```

Guard missing `faceAnalysisV2` with a `case` so legacy list payloads remain unchanged.

- [ ] **Step 7: Verify API, worker, media ownership, and measurement preservation**

Run: `cd services/backend && python -m pytest tests/test_face_analysis_api.py tests/test_analysis_measurements_payload.py tests/test_ai_job_worker.py tests/test_ai_media_authorization.py -q`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add services/backend/app/api/analysis.py services/backend/app/workers/job_dispatcher.py services/backend/tests/test_face_analysis_api.py services/backend/tests/test_analysis_measurements_payload.py services/backend/tests/test_ai_job_worker.py
git commit -m "feat(analysis): expose progressive face analysis reports"
```

---

### Task 9: Parse and Model V2 Safely on Mobile

**Files:**
- Create: `apps/mobile/src/features/face-analysis/services/faceAnalysisV2.ts`
- Create: `apps/mobile/src/features/face-analysis/services/faceAnalysisV2.test.ts`
- Create: `apps/mobile/src/features/face-analysis/services/faceAnalysisV2Presentation.ts`
- Modify: `apps/mobile/src/shared/types/faceAnalysis.ts:23-46`
- Modify: `apps/mobile/src/shared/services/faceAnalysisService.ts:77-120, 557-600`
- Modify: `scripts/mobile/run-face-analysis-measurements-contract.mjs:15-45`

**Interfaces:**
- Consumes: unknown `detailPayload.result.faceAnalysisV2` from camelized backend JSON.
- Produces: `FaceAnalysisV2`, `parseFaceAnalysisV2(value)`, `getVisibleFaceAnalysisMetrics(v2, includeSensitive)`, and `getFaceAnalysisV2Sections(v2)`.

- [ ] **Step 1: Write failing parser and presentation tests**

```ts
const parsed = parseFaceAnalysisV2(validPayload);
expectEqual(parsed?.schemaVersion, 'aura-face-analysis-v2', 'v2 schema');
expectEqual(parsed?.faceProfile['face3d.noseTipProjection'].source, 'depth', 'camera source');

const hidden = getVisibleFaceAnalysisMetrics(parsed!, false);
expectEqual('internal.asymmetryScore' in hidden, false, 'sensitivity 3 hidden');

const sections = getFaceAnalysisV2Sections(parsed!);
expectEqual(sections.aiMeasurement.kind, 'processing', 'progressive measurement state');
expectEqual(sections.consulting.kind, 'pending', 'downstream pending section');

expectEqual(parseFaceAnalysisV2({schemaVersion: 'legacy'}), undefined, 'legacy fallback');
```

- [ ] **Step 2: Add the new test to the standalone runner and verify failure**

Add these entries:

```js
'face-analysis/services/faceAnalysisV2.ts',
'face-analysis/services/faceAnalysisV2Presentation.ts',
'face-analysis/services/faceAnalysisV2.test.ts',
```

Run: `npm --prefix apps/mobile run test:face-analysis-measurements`

Expected: FAIL because the V2 modules do not exist.

- [ ] **Step 3: Implement strict, defensive parsing**

Define explicit unions matching Task 2. Parse only finite confidence `0..1`, known sources/statuses/shots, sensitivity 0–3, known stage states, and the exact schema version. Drop invalid individual metrics while preserving the rest of the report; return `undefined` only when the top-level schema/pipeline is unusable.

```ts
export type FaceAnalysisV2 = {
  schemaVersion: 'aura-face-analysis-v2';
  coverage: MeasurementCoveragePlan;
  aiMeasurements: Record<string, MetricEnvelope>;
  faceProfile: Record<string, MetricEnvelope>;
  derived: DerivedResult;
  perception?: PerceptionResult;
  consulting?: ConsultingResult;
  pipeline: FaceAnalysisPipelineState;
};

export function getVisibleFaceAnalysisMetrics(
  result: FaceAnalysisV2,
  includeSensitive: boolean,
): Record<string, MetricEnvelope> {
  return Object.fromEntries(
    Object.entries(result.faceProfile).filter(([, metric]) =>
      metric.sensitivity <= (includeSensitive ? 2 : 1),
    ),
  );
}
```

- [ ] **Step 4: Map V2 into the report without breaking legacy responses**

Add `faceAnalysisV2?: FaceAnalysisV2` to `FaceAnalysisReport`. Extend `BackendAnalysisResult` with `faceAnalysisV2?: unknown`, then map:

```ts
faceAnalysisV2: parseFaceAnalysisV2(result.faceAnalysisV2),
```

Keep every existing fallback field and `measurements` mapping unchanged.

- [ ] **Step 5: Verify contract and typecheck**

Run: `npm --prefix apps/mobile run test:face-analysis-measurements && npm --prefix apps/mobile run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/face-analysis/services/faceAnalysisV2.ts apps/mobile/src/features/face-analysis/services/faceAnalysisV2.test.ts apps/mobile/src/features/face-analysis/services/faceAnalysisV2Presentation.ts apps/mobile/src/shared/types/faceAnalysis.ts apps/mobile/src/shared/services/faceAnalysisService.ts scripts/mobile/run-face-analysis-measurements-contract.mjs
git commit -m "feat(mobile): parse progressive face analysis results"
```

---

### Task 10: Open the Camera Report Early and Continue Polling AI Stages

**Files:**
- Modify: `apps/mobile/src/shared/services/faceAnalysisService.ts:451-515, 741-840`
- Modify: `apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.tsx:440-505`
- Modify: `apps/mobile/src/features/face-analysis/services/faceAnalysisV2.test.ts`
- Create: `services/backend/scripts/evaluate_face_analysis_v2.py`
- Create: `services/backend/tests/test_face_analysis_eval.py`
- Modify: `.gitignore`
- Modify: `apps/mobile/src/features/face-analysis/screens/FaceAnalysisLoadingScreen.tsx:111-176`
- Modify: `apps/mobile/src/features/face-analysis/screens/FaceAnalysisLoadingScreen.test.tsx`

**Interfaces:**
- Consumes: create-job response with a V2 camera snapshot and existing legacy completion responses.
- Produces: `hasRenderableCameraReport(job)`, early return from `createFaceAnalysisReportFromCapture`, and copy that describes AI continuation in the report.

- [ ] **Step 1: Write failing readiness tests**

```ts
expectEqual(
  hasRenderableCameraReport({
    id: 'report-id',
    detailPayload: {result: {faceAnalysisV2: cameraSnapshot}},
    status: 'processing',
  }),
  true,
  'camera snapshot is report-ready',
);
expectEqual(
  hasRenderableCameraReport({id: 'legacy', status: 'processing'}),
  false,
  'legacy processing job still waits for text',
);
```

- [ ] **Step 2: Run the contract to verify failure**

Run: `npm --prefix apps/mobile run test:face-analysis-measurements`

Expected: FAIL because `hasRenderableCameraReport` is absent.

- [ ] **Step 3: Return as soon as the camera snapshot is stored**

In the polling loop, check V2 readiness before legacy text completeness:

```ts
export function hasRenderableCameraReport(job: BackendAnalysisJob): boolean {
  const v2 = parseFaceAnalysisV2(job.detailPayload?.result?.faceAnalysisV2);
  return Boolean(job.id && v2 && Object.keys(v2.faceProfile).length > 0);
}

if (hasRenderableCameraReport(currentJob) || hasCompleteBackendReportText(currentJob)) {
  return mapBackendJobToFaceAnalysisReport(currentJob, capture);
}
```

This makes `FaceAnalysisLoadingRouteScreen` set the selected report and navigate to detail after the create response. Keep the old wait behavior when V2 is absent.

- [ ] **Step 4: Update loading copy without changing navigation ownership**

Change the hero description to `카메라 측정을 먼저 정리하고, AI 분석은 보고서에서 이어서 완성해요.` and the completion state so it means “1차 보고서 준비 완료”, not “all AI stages complete”. Keep `replace('FaceAnalysisReportDetail')` and all duplicate-POST protections unchanged.

- [ ] **Step 5: Verify contract and typecheck**

Run: `npm --prefix apps/mobile run test:face-analysis-measurements && npm --prefix apps/mobile run typecheck`

Expected: PASS; the old non-V2 job tests still wait for legacy completion.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/shared/services/faceAnalysisService.ts apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.tsx apps/mobile/src/features/face-analysis/services/faceAnalysisV2.test.ts apps/mobile/src/features/face-analysis/screens/FaceAnalysisLoadingScreen.tsx apps/mobile/src/features/face-analysis/screens/FaceAnalysisLoadingScreen.test.tsx
git commit -m "feat(mobile): open camera-first analysis reports"
```

---

### Task 11: Render AI Measurement, L1, L2, and L3 Sections Progressively

**Files:**
- Create: `apps/mobile/src/features/face-analysis/components/AIAnalysisPipelineSection.tsx`
- Modify: `apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportDetailScreen.tsx:490-540, 722-860`
- Modify: `apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportDetailScreen.test.tsx`
- Modify: `apps/mobile/src/features/face-analysis/services/faceAnalysisV2Presentation.ts`
- Modify: `apps/mobile/src/features/face-analysis/services/faceAnalysisV2.test.ts`

**Interfaces:**
- Consumes: parsed `FaceAnalysisV2` and `getFaceAnalysisReportById`.
- Produces: source badges, pending/partial/failed/completed sections, sensitivity opt-in, stage retry callback, and polling until pipeline terminal state.

- [ ] **Step 1: Write failing pure presentation tests**

Test exact labels and visibility:

```ts
expectEqual(getMetricSourceLabel(depthMetric), '카메라 실측', 'depth badge');
expectEqual(getMetricSourceLabel(aiMetric), 'AI 추정', 'ai badge');
expectEqual(getMetricSourceLabel(blockedMetric), '측정 보류', 'blocked badge');
expectEqual(getMetricSourceLabel(unmeasuredMetric), '미측정', 'unmeasured badge');

const view = getFaceAnalysisV2Sections(partialPayload);
expectEqual(view.aiMeasurement.kind, 'partial', 'partial remains visible');
expectEqual(view.perception.kind, 'completed', 'completed L2 remains visible');
expectEqual(view.consulting.kind, 'failed', 'failed L3 retry card');
```

- [ ] **Step 2: Run contract to verify failure**

Run: `npm --prefix apps/mobile run test:face-analysis-measurements`

Expected: FAIL on missing presentation functions.

- [ ] **Step 3: Implement the focused component with existing tokens**

The component renders in this order:

1. `AI 추가 측정` — AI source metrics only, per-item source/status/confidence.
2. `통합 구조·색상 분석` — L1 derived insights.
3. `피부·외관·인상 분석` — L2 grouped by skin, feature impression, lines/planes, gestalt, volume, provisional personal color.
4. `맞춤 컨설팅` — L3 makeup, color/product, hair, fashion, photography.

Use `ReportSection` through a render prop or move the existing private section shell to a small shared local component; do not duplicate its styling. Pending uses existing skeleton/surface colors, failed shows the stage error message and `다시 시도`, partial keeps accepted cards plus a short warning. Confidence is displayed as rounded percent only for AI estimates; camera cards keep their existing measurement-specific confidence display.

```tsx
<AIAnalysisPipelineSection
  includeSensitive={showSensitiveDetails}
  onChangeSensitive={setShowSensitiveDetails}
  onRetryStage={onRetryStage}
  result={report.faceAnalysisV2}
/>
```

The sensitivity switch appears only when sensitivity-2 items exist, defaults off on every screen entry, and is labeled `민감한 세부 관찰 보기`. Sensitivity-3 items are filtered before props reach any card.

- [ ] **Step 4: Insert the component after existing camera measurement detail**

Place it after the current `MEASUREMENT DETAIL` section and before the recommended makeup card. Existing camera sections remain unchanged and must not be restated in AI cards.

- [ ] **Step 5: Expand detail polling from images to the full pipeline**

Poll when either recommended images are pending or `faceAnalysisV2.pipeline.overall === 'processing'`. On each result, replace the report in load state. Stop on `completed|partial|failed`, on unmount, or after the existing timeout. Use one timer so image and pipeline polling cannot race.

```ts
const shouldPollReport =
  pendingRecommendedMakeupImageCount > 0 ||
  report.faceAnalysisV2?.pipeline.overall === 'processing';
```

Add an authenticated service call for `POST /analysis/reports/{id}/stages/retry`; after a 202 response, immediately refresh the detail and resume polling.

- [ ] **Step 6: Verify presentation contract and typecheck**

Run: `npm --prefix apps/mobile run test:face-analysis-measurements && npm --prefix apps/mobile run typecheck`

Expected: PASS with no broad `any`, unused imports, or new UI dependencies.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/features/face-analysis/components/AIAnalysisPipelineSection.tsx apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportDetailScreen.tsx apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportDetailScreen.test.tsx apps/mobile/src/features/face-analysis/services/faceAnalysisV2Presentation.ts apps/mobile/src/features/face-analysis/services/faceAnalysisV2.test.ts apps/mobile/src/shared/services/faceAnalysisService.ts
git commit -m "feat(mobile): append progressive AI analysis sections"
```

---

### Task 12: Harden Observability, Privacy, and End-to-End Regression Coverage

**Files:**
- Modify: `services/backend/app/services/face_analysis_pipeline.py`
- Modify: `services/backend/app/services/face_analysis_ai.py`
- Modify: `services/backend/tests/test_face_analysis_pipeline.py`
- Modify: `services/backend/tests/test_face_analysis_api.py`
- Modify: `services/backend/tests/test_ai_media_authorization.py`
- Modify: `apps/mobile/src/features/face-analysis/services/faceAnalysisV2.test.ts`
- Modify: `docs/superpowers/specs/2026-07-15-s1-face-analysis-ai-pipeline-design.md` only if implementation names differ from the approved contract.

**Interfaces:**
- Consumes: completed backend/mobile implementation.
- Produces: sanitized structured logs, full privacy regression tests, and a verified release gate.

- [ ] **Step 1: Add failing log/privacy regression tests**

Capture logs and assert they contain only aggregate metadata:

```python
assert event == {
  "reportId": str(REPORT_ID),
  "stageRunId": str(STAGE_RUN_ID),
  "stage": "ai_measurement",
  "status": "completed",
  "inputHash": INPUT_HASH,
  "schemaVersion": "aura-face-analysis-v2",
  "promptVersion": "s1-measurement-v1",
  "model": "model-a",
  "durationMs": 123,
  "attemptCount": 1,
  "cacheHit": False,
  "requestedMetricCount": 4,
  "returnedMetricCount": 4,
  "acceptedMetricCount": 3,
  "rejectedAuthoritativeKeyCount": 1,
  "unmeasuredCount": 0,
  "validationErrorCode": None,
  "inputTokens": 410,
  "outputTokens": 220,
  "inputImageCount": 1,
}
assert "imageUrl" not in caplog.text
assert "faceProfile" not in caplog.text
assert "rawResponse" not in caplog.text
```

Add these exact boundary assertions to the Python and TypeScript test files:

```python
assert retry_other_users_report.status_code == 404
assert detail_other_users_report.status_code == 404
assert "file://" not in json.dumps(trusted_stage_input)
assert all(metric["sensitivity"] <= 1 for metric in consulting_prompt_profile.values())
assert all(metric["sensitivity"] < 3 for metric in serialized_report_profile.values())
with pytest.raises(ValidationError):
  PerceptionResult.model_validate({**VALID_PERCEPTION, "medicalDiagnosis": "acne"})
```

```ts
expectEqual(
  Object.values(getVisibleFaceAnalysisMetrics(parsed!, true)).some(metric => metric.sensitivity === 3),
  false,
  'internal metrics never render',
);
```

- [ ] **Step 2: Run the focused suite to verify the new assertions fail**

Run: `cd services/backend && python -m pytest tests/test_face_analysis_pipeline.py tests/test_face_analysis_api.py tests/test_ai_media_authorization.py -q`

Expected: FAIL until aggregate logging and final filters are wired.

- [ ] **Step 3: Add aggregate structured logs and final boundary filters**

Emit one log event at each stage transition with the exact aggregate keys above. Hashes and UUIDs are allowed; image URLs, local paths, complete measurements, prompts, and raw AI output are forbidden. Extract only token and image counts from provider usage metadata; keep generated text out of logs. Apply sensitivity filtering twice: before L3 prompt creation and before API serialization/mobile presentation.

- [ ] **Step 4: Add the repeatable AI evaluation harness**

The script reads `manifest.json` from the directory named by `FACE_ANALYSIS_EVAL_DIR`. The manifest contains records with `caseId`, `imagePath`, `measurementsPath`, `expectedObservableKeys`, and `forbiddenKeys`; paths are resolved inside that directory and are never logged. For each case, run three repetitions and emit aggregate JSON containing:

```json
{
  "caseCount": 12,
  "structuredOutputSuccessRate": 1.0,
  "authoritativeKeyViolationRate": 0.0,
  "forbiddenKeyHallucinationRate": 0.0,
  "validRationaleKeyRate": 1.0,
  "labelStabilityRate": 0.92,
  "safetyViolationRate": 0.0
}
```

`test_face_analysis_eval.py` uses two synthetic manifests and a fake AI service to verify every rate calculation without real faces or network access. Add `/services/backend/.local/face-analysis-eval/` to `.gitignore`; the real evaluation directory must contain only consented, anonymized S1 cases.

- [ ] **Step 5: Run the complete backend regression suite**

Run: `cd services/backend && python -m pytest -q`

Expected: all backend tests PASS.

- [ ] **Step 6: Run the complete relevant mobile verification**

Run:

```bash
npm --prefix apps/mobile run test:face-analysis-measurements
npm --prefix apps/mobile run test:face-capture-upload
npm --prefix apps/mobile run test:face3d
npm --prefix apps/mobile run test:face-geometry
npm --prefix apps/mobile run test:personal-color
npm --prefix apps/mobile run typecheck
```

Expected: every command exits 0.

- [ ] **Step 7: Review the final diff for scope and schema parity**

Run:

```bash
git diff --check
git status --short
rg -n "analysis_stage_runs|aura-face-analysis-v2" docs/backend/schema.sql docs/backend/aws-postgresql-schema.dbml services/backend/app apps/mobile/src
```

Expected: no whitespace errors; SQL and DBML both contain `analysis_stage_runs`; server and mobile both use `aura-face-analysis-v2`; only planned files are modified.

- [ ] **Step 8: Commit hardening**

```bash
git add .gitignore services/backend/app/services/face_analysis_pipeline.py services/backend/app/services/face_analysis_ai.py services/backend/scripts/evaluate_face_analysis_v2.py services/backend/tests/test_face_analysis_pipeline.py services/backend/tests/test_face_analysis_api.py services/backend/tests/test_ai_media_authorization.py services/backend/tests/test_face_analysis_eval.py apps/mobile/src/features/face-analysis/services/faceAnalysisV2.test.ts
git commit -m "test(analysis): harden staged face analysis boundaries"
```

---

## Release Verification

- [ ] Enable `FACE_ANALYSIS_V2_ENABLED=true` only in a development environment with valid Bedrock/OpenAI credentials.
- [ ] Populate `services/backend/.local/face-analysis-eval/manifest.json`, then run `cd services/backend && FACE_ANALYSIS_EVAL_DIR="$PWD/.local/face-analysis-eval" python scripts/evaluate_face_analysis_v2.py` and require 0 authoritative-key/safety violations before rollout.
- [ ] Submit one owned S1 capture containing all current measurements and confirm the create response already contains camera-source `faceProfile` metrics.
- [ ] Confirm the report opens before AI finishes and shows the existing vertical-thirds, 2D geometry, 3D, and personal-color sections.
- [ ] Confirm `ai_measurement`, L2, and L3 sections appear in order without duplicating camera measurements.
- [ ] Confirm a forced L3 failure leaves camera/L1/L2 sections visible and the L3 retry starts only `ai_consulting`.
- [ ] Re-enter the report from history and confirm all completed AI sections restore from the backend.
- [ ] Confirm list responses contain pipeline state but omit full measurements/profile/perception/consulting payloads.
- [ ] Confirm report deletion makes its stage runs unreachable and hard deletion cascades them.
- [ ] Confirm no AI output overwrote a camera `landmark`, `pixel`, or `depth` metric.
