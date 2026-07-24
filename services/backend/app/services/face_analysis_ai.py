import json
import logging
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Callable, Protocol, TypeVar

from pydantic import BaseModel, ValidationError

from app.core.errors import AppError
from app.schemas.face_analysis_v2 import (
  ConsultingResult,
  DerivedResult,
  MeasurementCoveragePlan,
  MeasurementStageOutput,
  MetricEnvelope,
  PerceptionResult,
)
from app.services.face_analysis_measurements import (
  filter_metric_keys_for_model,
  filter_internal_only_payload,
  filter_metrics_for_model,
)

logger = logging.getLogger(__name__)


# 봉투 축소 지시(reason/warnings 생략) 추가로 계약이 바뀌므로 버전 상향.
MEASUREMENT_PROMPT_VERSION = "s1-measurement-v2"
# raw measurement·내부 필드명 노출 금지를 복원(치명적 버그: 설명문에 metric key/각도값이
# 그대로 노출됨)하며 계약이 바뀌므로 버전 상향(스테이지 캐시 무효화).
PERCEPTION_PROMPT_VERSION = "s1-perception-v5"
# 위와 동일한 이유로 버전 상향 — 양쪽 룩과 근거 행 계약은 그대로 유지.
CONSULTING_PROMPT_VERSION = "s1-consulting-v8"
# 사용자에게 보이는 라벨·설명·추천 문장은 모두 한국어여야 한다(단일 경로와 동일 원칙).
# enum status 코드·metric 키만 영문 유지. perceive/consult 두 스테이지가 리포트의
# 자유 텍스트(피부 라벨·부위 노트·요약·메이크업 가이드)를 전부 생성하므로 여기에 건다.
_KOREAN_OUTPUT_DIRECTIVE = (
  "Write every label, description, summary, recommendation, and look title/subtitle as "
  "concise natural Korean (한국어) — short phrases, no filler. "
  "Never quote internal field or metric-key identifiers in user-facing copy — no dotted or "
  "snake_case tokens like skin.pores, brow_slope_asymmetry, canthal_tilt_asymmetry, "
  "verticalThirds.lowerNormalized. Never repeat a raw measurement value (angles in degrees, "
  "mm, percentages, color-distance numbers like dL≈61) either — always translate the "
  "evidence into a cautious visual interpretation and a useful implication instead of citing "
  "the number or key behind it. A small natural-language ordinal is fine only when it reads "
  "like everyday Korean with no unit attached (예: 3분할, 두 겹) — never pair a number with a "
  "unit, a percent sign, or a field name."
)
FORBIDDEN_INFERENCES = (
  "medical diagnosis, disease, age, ethnicity, health status, cosmetic procedures, "
  "attractiveness score"
)

# 계정 성별 → consult 방향 지시(사진 추론 금지). makeup_recommendation_context의
# normalize_makeup_profile_gender 산출값(female|male|unspecified)과 키가 일치한다.
_CONSULT_GENDER_DIRECTIVES = {
  "female": (
    "The account gender is female; use feminine makeup direction by default and never "
    "re-infer gender from the photo."
  ),
  "male": (
    "The account gender is male; use masculine grooming makeup direction by default and "
    "never re-infer gender from the photo."
  ),
  "unspecified": (
    "The account gender is unspecified; do not estimate gender from the photo and use "
    "gender-neutral makeup direction by default."
  ),
}


@dataclass(frozen=True)
class AnalysisCallMetrics:
  duration_ms: int
  input_tokens: int
  output_tokens: int
  stop_reason: str | None = None
  cache_read_input_tokens: int = 0
  cache_write_input_tokens: int = 0


@dataclass
class StageGenerationMetrics:
  input_tokens: int = 0
  output_tokens: int = 0
  provider_call_count: int = 0
  validation_retry_count: int = 0

  @property
  def total_tokens(self) -> int:
    return self.input_tokens + self.output_tokens

  def record_call(self, metrics: AnalysisCallMetrics) -> None:
    self.input_tokens += metrics.input_tokens
    self.output_tokens += metrics.output_tokens
    self.provider_call_count += 1

  def record_validation_retry(self) -> None:
    self.validation_retry_count += 1


class StructuredAnalysisClient(Protocol):
  async def analyze_structured_json(
    self,
    *,
    developer_prompt: str,
    user_prompt: str,
    json_schema: dict[str, Any],
    source_image_bytes: bytes | None,
    max_tokens: int,
    stage: str | None = None,
    on_call_metrics: Callable[[AnalysisCallMetrics], None] | None = None,
  ) -> dict[str, Any]: ...


OutputModel = TypeVar("OutputModel", bound=BaseModel)


def _jsonable(value: Any) -> Any:
  if isinstance(value, BaseModel):
    return value.model_dump(by_alias=True, mode="json")
  if isinstance(value, dict):
    return {key: _jsonable(item) for key, item in value.items()}
  if isinstance(value, list):
    return [_jsonable(item) for item in value]
  return value


class FaceAnalysisAI:
  def __init__(self, client: StructuredAnalysisClient) -> None:
    self.client = client

  async def _invoke_validated(
    self,
    *,
    model_type: type[OutputModel],
    developer_prompt: str,
    user_prompt: str,
    source_image_bytes: bytes | None,
    max_tokens: int,
    stage: str | None = None,
    semantic_validator: Callable[[OutputModel], list[dict[str, Any]]] | None = None,
    generation_metrics: StageGenerationMetrics | None = None,
  ) -> OutputModel:
    validation_errors: list[dict[str, Any]] = []
    current_prompt = user_prompt
    last_stop_reason: str | None = None

    def _record_call(metrics: AnalysisCallMetrics) -> None:
      nonlocal last_stop_reason
      last_stop_reason = metrics.stop_reason
      if generation_metrics is not None:
        generation_metrics.record_call(metrics)

    for attempt in range(2):
      response = await self.client.analyze_structured_json(
        developer_prompt=developer_prompt,
        user_prompt=current_prompt,
        json_schema=model_type.model_json_schema(by_alias=True),
        source_image_bytes=source_image_bytes,
        max_tokens=max_tokens,
        stage=stage,
        on_call_metrics=_record_call,
      )
      try:
        output = model_type.model_validate(response)
      except ValidationError as exc:
        validation_errors = [
          {"location": list(error["loc"]), "type": error["type"]}
          for error in exc.errors(include_input=False, include_url=False)
        ]
      else:
        validation_errors = (
          semantic_validator(output)
          if semantic_validator is not None
          else []
        )
        if not validation_errors:
          return output
      # 절단(stop_reason=max_tokens)으로 필드가 누락된 경우 재시도는 무의미하다 —
      # 오류 문구를 덧붙인 더 긴 프롬프트는 또 절단될 뿐이라 스테이지 지연만 배가된다
      # (관측된 +30초 낭비의 주범). 즉시 중단하고 상위 폴백에 맡긴다. 상한을 모델
      # 최대치로 둔 지금은 사실상 도달하지 않는 안전장치.
      if last_stop_reason == "max_tokens":
        logger.warning(
          "[aura:face-analysis-v2] stage=%s truncated (stop_reason=max_tokens); "
          "skipping retry",
          stage or "-",
        )
        break
      if attempt == 0:
        if generation_metrics is not None:
          generation_metrics.record_validation_retry()
        # 1차 검증 실패의 실제 사유를 남긴다 — "왜 재시도했나"(스테이지 지연 +15초의
        # 주범)를 추정 없이 확인하려는 관측성 로그. 예: consult 룩 title max_length 초과.
        logger.warning(
          "[aura:face-analysis-v2] stage=%s retry-on-validation errors=%s",
          stage or "-",
          json.dumps(validation_errors, ensure_ascii=False),
        )
        current_prompt = (
          f"{user_prompt}\nThe previous JSON failed validation. Correct its structure or "
          "user-facing meaning according to the developer instructions, then return one JSON "
          f"object. Validation errors: {json.dumps(validation_errors, ensure_ascii=False)}"
        )
    raise AppError(
      502,
      "FACE_ANALYSIS_STAGE_OUTPUT_INVALID",
      "Face analysis stage returned invalid structured output.",
      {"validationErrors": validation_errors, "stopReason": last_stop_reason},
    )

  async def measure(
    self,
    *,
    source_image_bytes: bytes,
    coverage: MeasurementCoveragePlan,
    camera_profile: dict[str, MetricEnvelope],
    generation_metrics: StageGenerationMetrics | None = None,
  ) -> MeasurementStageOutput:
    model_profile = filter_metrics_for_model(camera_profile)
    prompt_payload = {
      "missingObservableKeys": coverage.missing_observable_keys,
      "authoritativeKeys": filter_metric_keys_for_model(
        coverage.authoritative_keys,
      ),
      "cameraEvidence": _jsonable(model_profile),
    }
    output = await self._invoke_validated(
      model_type=MeasurementStageOutput,
      developer_prompt=(
        "You measure only explicitly requested visible beauty attributes in one neutral front S1 "
        f"photo. Never infer {FORBIDDEN_INFERENCES}. Return schema-valid JSON only. "
        "Keep each metric envelope minimal: omit the reason field and leave warnings empty for "
        "normal estimated metrics; set reason only when status is unmeasured or blocked."
      ),
      user_prompt=(
        "Estimate only missingObservableKeys. Never remeasure authoritativeKeys. Use source=ai, "
        "status=estimated, shots=[S1], or return unmeasured when visibility is insufficient.\n"
        + json.dumps(prompt_payload, ensure_ascii=False, separators=(",", ":"))
      ),
      source_image_bytes=source_image_bytes,
      # 상한을 모델 최대치(8192)로 둬 절단을 원천 차단한다. 상한은 실제 생성량만큼만
      # 소요되므로 시간 손해가 없고, 낮은 상한이 유발하던 절단→무의미 재시도만 제거된다.
      max_tokens=8192,
      stage="measure",
      generation_metrics=generation_metrics,
    )
    authoritative = set(coverage.authoritative_keys)
    allowed = set(coverage.missing_observable_keys)
    accepted: dict[str, MetricEnvelope] = {}
    rejected_authoritative: list[str] = []
    rejected_unknown: list[str] = []
    for key, metric in output.metrics.items():
      if key in authoritative:
        rejected_authoritative.append(key)
      elif key not in allowed:
        rejected_unknown.append(key)
      else:
        accepted[key] = metric
    return output.model_copy(
      update={
        "metrics": accepted,
        "rejected_authoritative_keys": sorted(rejected_authoritative),
        "rejected_unknown_keys": sorted(rejected_unknown),
      },
    )

  async def perceive(
    self,
    *,
    source_image_bytes: bytes,
    profile: dict[str, MetricEnvelope],
    derived: DerivedResult | dict[str, Any],
    anchor: Mapping[str, Any] | None = None,
    generation_metrics: StageGenerationMetrics | None = None,
  ) -> PerceptionResult:
    model_profile = filter_metrics_for_model(profile)
    model_derived = filter_internal_only_payload(_jsonable(derived))
    anchor_payload = {
      key: value
      for key in ("faceShape", "skinType", "recommendedMood")
      if isinstance((value := (anchor or {}).get(key)), str) and value.strip()
    }
    output = await self._invoke_validated(
      model_type=PerceptionResult,
      developer_prompt=(
        "You provide non-medical beauty perception from an S1 photo and supplied measurements. "
        f"Never infer {FORBIDDEN_INFERENCES}. Do not create measurements. "
        "Write each Insight description as ONE concise reader-facing sentence that links the "
        "visible conclusion to its rationaleMetricKeys and names its effect on the overall "
        "impression; do not write a paragraph and do not return disconnected adjectives. "
        "Return three impressionAxes only when supported: clarity (부드러운/선명한), "
        "focus (중앙/외곽), and line (곡선적/직선적). Set value from minus one for the left "
        "label to one for the right label; omit an unsupported axis instead of guessing. "
        "When anchor labels are supplied, preserve skinType as skin.sebumDryness.label and "
        "recommendedMood as gestalt.overallMood.label without reclassifying them. "
        f"{_KOREAN_OUTPUT_DIRECTIVE} Return JSON only."
      ),
      user_prompt=json.dumps(
        {
          "faceProfile": _jsonable(model_profile),
          "derived": model_derived,
          **({"anchor": anchor_payload} if anchor_payload else {}),
        },
        ensure_ascii=False,
        separators=(",", ":"),
      ),
      source_image_bytes=source_image_bytes,
      # 상한을 모델 최대치(8192)로 둬 절단을 원천 차단. 실제 출력은 설명 1문장화로
      # ~2200 토큰까지 줄어들어 상한에 닿지 않는다(상한은 시간이 아니라 절단만 좌우).
      max_tokens=8192,
      stage="perceive",
      generation_metrics=generation_metrics,
    )
    skin_type = anchor_payload.get("skinType")
    recommended_mood = anchor_payload.get("recommendedMood")
    if skin_type:
      output = output.model_copy(
        update={
          "skin": output.skin.model_copy(
            update={
              "sebum_dryness": output.skin.sebum_dryness.model_copy(
                update={"label": skin_type},
              ),
            },
          ),
        },
      )
    if recommended_mood:
      output = output.model_copy(
        update={
          "gestalt": output.gestalt.model_copy(
            update={
              "overall_mood": output.gestalt.overall_mood.model_copy(
                update={"label": recommended_mood},
              ),
            },
          ),
        },
      )
    return output

  async def consult(
    self,
    *,
    profile: Mapping[str, MetricEnvelope | dict[str, Any]],
    derived: DerivedResult | dict[str, Any],
    perception: PerceptionResult | dict[str, Any] | None = None,
    profile_gender: str | None = None,
    anchor: Mapping[str, Any] | None = None,
    generation_metrics: StageGenerationMetrics | None = None,
  ) -> ConsultingResult:
    model_profile = filter_metrics_for_model(profile)
    anchor_payload = {
      key: value
      for key in ("faceShape", "skinType", "recommendedMood")
      if isinstance((value := (anchor or {}).get(key)), str) and value.strip()
    }
    model_payload = filter_internal_only_payload(
      {
        "faceProfile": _jsonable(model_profile),
        "derived": _jsonable(derived),
        **({"perception": _jsonable(perception)} if perception is not None else {}),
        **({"anchor": anchor_payload} if anchor_payload else {}),
      },
    )
    # 계정 성별을 메이크업 방향의 기준으로 쓴다(사진 성별 추론 금지) — analyze_text
    # 경로와 동일 원칙. 미지정/불명은 성별을 추정하지 않는 중성 표현.
    gender_directive = _CONSULT_GENDER_DIRECTIVES.get(
      profile_gender or "",
      _CONSULT_GENDER_DIRECTIVES["unspecified"],
    )
    derived_payload = _jsonable(derived)
    vertical_balance = (
      derived_payload.get("verticalBalance")
      if isinstance(derived_payload, dict)
      else None
    )
    vertical_label = (
      vertical_balance.get("label")
      if isinstance(vertical_balance, dict)
      and isinstance(vertical_balance.get("label"), str)
      else ""
    )

    def validate_consulting(output: ConsultingResult) -> list[dict[str, Any]]:
      errors: list[dict[str, Any]] = []
      if output.styling_looks is None:
        errors.append(
          {
            "location": ["stylingLooks"],
            "type": "missing_required_styling_looks",
          },
        )
      else:
        for look_name, look in (
          ("natural", output.styling_looks.natural),
          ("glam", output.styling_looks.glam),
        ):
          if len({row.category for row in look.rows}) != len(look.rows):
            errors.append(
              {
                "location": ["stylingLooks", look_name, "rows"],
                "type": "duplicate_styling_row_category",
              },
            )
      if "우세" in vertical_label:
        for field, text in (
          ("summary", output.summary),
          ("shortSummary", output.short_summary),
        ):
          if "균형" in text:
            errors.append(
              {
                "location": [field],
                "type": "contradicts_vertical_balance",
                "expected": vertical_label,
              },
            )
      return errors

    output = await self._invoke_validated(
      model_type=ConsultingResult,
      developer_prompt=(
        "You are a practical K-beauty, hair, fashion, and photography consultant. Base every "
        f"recommendation on supplied evidence. Never infer {FORBIDDEN_INFERENCES}. "
        f"{gender_directive} "
        "The supplied faceProfile, derived results, and anchor are the canonical fact sheet. "
        "They are sufficient when perception is absent; never invent a missing observation. "
        "Generate both stylingLooks.natural and stylingLooks.glam. Each look must include a "
        "coherent title, subtitle, description, and practical rows whose why field explicitly "
        "connects the choice to a supplied face or color fact. Keep the two looks meaningfully "
        "different without contradicting the same measured facts. "
        "Keep face shape and vertical facial thirds as separate facts. Never describe a dominant "
        "or elongated upper, middle, or lower third as balanced, and never use one as evidence that "
        "the other is balanced. Summary and shortSummary must preserve the supplied derived labels "
        "without combining contradictory traits. "
        "When an anchor is supplied, keep recommendedMood exactly as overallMood and use the "
        "anchor labels consistently throughout the advice. "
        "Keep every user-facing string concise: one short sentence per row why/note and per "
        "advice item; do not pad descriptions. "
        f"{_KOREAN_OUTPUT_DIRECTIVE} Return JSON only."
      ),
      user_prompt=json.dumps(
        model_payload,
        ensure_ascii=False,
        separators=(",", ":"),
      ),
      source_image_bytes=None,
      # 상한을 모델 최대치(8192)로 둬 절단을 원천 차단(절단→재시도 낭비 제거).
      max_tokens=8192,
      stage="consult",
      semantic_validator=validate_consulting,
      generation_metrics=generation_metrics,
    )
    recommended_mood = anchor_payload.get("recommendedMood")
    return (
      output.model_copy(update={"overall_mood": recommended_mood})
      if recommended_mood
      else output
    )
