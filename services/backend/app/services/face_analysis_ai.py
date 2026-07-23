import json
import logging
from collections.abc import Mapping
from typing import Any, Protocol, TypeVar

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


MEASUREMENT_PROMPT_VERSION = "s1-measurement-v1"
# 한국어 출력 지시문 추가로 계약이 바뀌므로 버전 상향(스테이지 캐시 무효화).
PERCEPTION_PROMPT_VERSION = "s1-perception-v2"
# 성별(v3) + 한국어 출력(v4) 지시문으로 계약이 바뀌므로 버전 상향(스테이지 캐시 무효화).
CONSULTING_PROMPT_VERSION = "s1-consulting-v4"
# 사용자에게 보이는 라벨·설명·추천 문장은 모두 한국어여야 한다(단일 경로와 동일 원칙).
# enum status 코드·metric 키만 영문 유지. perceive/consult 두 스테이지가 리포트의
# 자유 텍스트(피부 라벨·부위 노트·요약·메이크업 가이드)를 전부 생성하므로 여기에 건다.
_KOREAN_OUTPUT_DIRECTIVE = (
  "Write every label, description, summary, recommendation, and look title/subtitle as "
  "concise natural Korean (한국어) — short phrases, no filler. Keep only enum status codes "
  "and metric keys in English."
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
  ) -> OutputModel:
    validation_errors: list[dict[str, Any]] = []
    current_prompt = user_prompt
    for attempt in range(2):
      response = await self.client.analyze_structured_json(
        developer_prompt=developer_prompt,
        user_prompt=current_prompt,
        json_schema=model_type.model_json_schema(by_alias=True),
        source_image_bytes=source_image_bytes,
        max_tokens=max_tokens,
        stage=stage,
      )
      try:
        return model_type.model_validate(response)
      except ValidationError as exc:
        validation_errors = [
          {"location": list(error["loc"]), "type": error["type"]}
          for error in exc.errors(include_input=False, include_url=False)
        ]
        if attempt == 0:
          # 1차 검증 실패의 실제 사유를 남긴다 — "왜 재시도했나"(스테이지 지연 +15초의
          # 주범)를 추정 없이 확인하려는 관측성 로그. 예: consult 룩 title max_length 초과.
          logger.warning(
            "[aura:face-analysis-v2] stage=%s retry-on-validation errors=%s",
            stage or "-",
            json.dumps(validation_errors, ensure_ascii=False),
          )
          current_prompt = (
            f"{user_prompt}\nThe previous JSON failed validation. Correct only the structure and return "
            f"one JSON object. Validation errors: {json.dumps(validation_errors)}"
          )
    raise AppError(
      502,
      "FACE_ANALYSIS_STAGE_OUTPUT_INVALID",
      "Face analysis stage returned invalid structured output.",
      {"validationErrors": validation_errors},
    )

  async def measure(
    self,
    *,
    source_image_bytes: bytes,
    coverage: MeasurementCoveragePlan,
    camera_profile: dict[str, MetricEnvelope],
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
        f"photo. Never infer {FORBIDDEN_INFERENCES}. Return schema-valid JSON only."
      ),
      user_prompt=(
        "Estimate only missingObservableKeys. Never remeasure authoritativeKeys. Use source=ai, "
        "status=estimated, shots=[S1], or return unmeasured when visibility is insufficient.\n"
        + json.dumps(prompt_payload, ensure_ascii=False, separators=(",", ":"))
      ),
      source_image_bytes=source_image_bytes,
      # 성공 런도 출력이 2700~2800(상한 2800)에 붙어 절단 위험 → 헤드룸 확보.
      max_tokens=3200,
      stage="measure",
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
      # perceive는 인사이트 다수를 출력해 영문에서도 ~2600 토큰(상한 3200에 근접).
      # 한국어는 토큰이 더 무거워 상한을 넘겨 절단됐다 → 헤드룸 크게 확보.
      max_tokens=4800,
      stage="perceive",
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
    perception: PerceptionResult | dict[str, Any],
    profile_gender: str | None = None,
    anchor: Mapping[str, Any] | None = None,
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
        "perception": _jsonable(perception),
        **({"anchor": anchor_payload} if anchor_payload else {}),
      },
    )
    # 계정 성별을 메이크업 방향의 기준으로 쓴다(사진 성별 추론 금지) — analyze_text
    # 경로와 동일 원칙. 미지정/불명은 성별을 추정하지 않는 중성 표현.
    gender_directive = _CONSULT_GENDER_DIRECTIVES.get(
      profile_gender or "",
      _CONSULT_GENDER_DIRECTIVES["unspecified"],
    )
    return await self._invoke_validated(
      model_type=ConsultingResult,
      developer_prompt=(
        "You are a practical K-beauty, hair, fashion, and photography consultant. Base every "
        f"recommendation on supplied evidence. Never infer {FORBIDDEN_INFERENCES}. "
        f"{gender_directive} "
        "Keep face shape and vertical facial thirds as separate facts. Never describe a dominant "
        "or elongated upper, middle, or lower third as balanced, and never use one as evidence that "
        "the other is balanced. Summary and shortSummary must preserve the supplied derived labels "
        "without combining contradictory traits. "
        "When an anchor is supplied, keep recommendedMood exactly as overallMood and use the "
        "anchor labels consistently throughout the advice. "
        f"{_KOREAN_OUTPUT_DIRECTIVE} Return JSON only."
      ),
      user_prompt=json.dumps(
        model_payload,
        ensure_ascii=False,
        separators=(",", ":"),
      ),
      source_image_bytes=None,
      # 한국어 + 1회 재검증(룩 title 길이 등) 대비 헤드룸.
      max_tokens=3200,
      stage="consult",
    )
    recommended_mood = anchor_payload.get("recommendedMood")
    return (
      output.model_copy(update={"overall_mood": recommended_mood})
      if recommended_mood
      else output
    )
