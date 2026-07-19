import asyncio
import base64
import json
import logging
import math
import re
import secrets
import time
from pathlib import Path
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.errors import AppError
from app.core.settings import Settings
from app.lambdas.media_postprocess import MediaPostprocessError, process_image_bytes
from app.services.bedrock_guardrails import build_bedrock_guardrail_invoke_kwargs
from app.services.makeup_feedback_goal_intent import localize_makeup_feedback_intensity_terms
from app.services.makeup_feedback_vision import (
  MakeupFeedbackVisionError,
  MakeupFeedbackVisionResult,
  prepare_makeup_feedback_vision,
)


logger = logging.getLogger(__name__)

MODEL_VERSION = "makeup-feedback:bedrock-v8-whole-face-harmony"

BEDROCK_GUARDRAIL_TAG_PREFIX = "amazon-bedrock-guardrails-guardContent"
BEDROCK_GUARDRAIL_TAG_SUFFIX_BYTES = 10
BEDROCK_GUARDRAIL_VALIDATED_MARKER = "validated"

PROMPT_DIRECTORY = Path(__file__).with_name("prompts")
SYSTEM_PROMPT_PATH = PROMPT_DIRECTORY / "makeup_feedback_system.md"
USER_PROMPT_TEMPLATE_PATH = PROMPT_DIRECTORY / "makeup_feedback_user.md"
PROMPT_HEADER_COMMENT_PATTERN = re.compile(r"\A\s*<!--.*?-->\s*", re.DOTALL)
PROMPT_PLACEHOLDER_PATTERN = re.compile(r"\{\{([^{}]+)\}\}")
USER_PROMPT_PLACEHOLDERS = frozenset(
  {
    "GOAL_INTENT_TYPE_JSON",
    "ORIGINAL_GOAL_TEXT_JSON",
    "OUTPUT_CONTRACT_JSON",
    "PROFILE_GENDER_JSON",
    "REQUEST_METADATA_JSON",
    "TOPIC_COUNT",
    "TOPIC_ID_LIST",
    "TOPIC_LABEL_LIST",
    "USER_GOAL_TEXT_JSON",
  },
)

FEEDBACK_TOPICS: list[dict[str, str]] = [
  {"id": "brow", "label": "눈썹", "kind": "eye"},
  {"id": "lash", "label": "속눈썹", "kind": "eye"},
  {"id": "lens", "label": "렌즈", "kind": "eye"},
  {"id": "eyeliner", "label": "아이라인", "kind": "eye"},
  {"id": "eyeshadow", "label": "아이섀도", "kind": "eye"},
  {"id": "aegyosal", "label": "애교살", "kind": "eye"},
  {"id": "foundation", "label": "파운데이션", "kind": "cheek"},
  {"id": "blush", "label": "블러셔", "kind": "cheek"},
  {"id": "highlight", "label": "하이라이터", "kind": "cheek"},
  {"id": "shading", "label": "섀딩", "kind": "cheek"},
  {"id": "lip", "label": "립", "kind": "lip"},
]

TOPIC_BY_ID = {topic["id"]: topic for topic in FEEDBACK_TOPICS}
VALID_ANALYSIS_DECISIONS = {"completed", "retake_required"}
VALID_COLOR_CONFIDENCES = {"low", "medium", "high"}
COLOR_CONFIDENCE_RANK = {"low": 0, "medium": 1, "high": 2}
LIGHTING_SENSITIVE_SCORE_CONFIDENCE_CAP = 0.74
SCORE_IMPACT_WEIGHTS = {"low": 1.0, "medium": 2.0, "high": 3.0}
HIGH_IMPACT_IMPROVEMENT_SCORE_CEILING = 90
EVIDENCE_CALIBRATION_SCORE_CONFIDENCE_CAP = 0.65
VALID_STATUSES = {
  "strength",
  "improvement",
  "optional",
  "not_assessable",
  "not_applicable",
}
VALID_SCORE_IMPACTS = {"high", "medium", "low"}
VALID_INTENSITIES = {"light", "medium", "bold"}
VALID_VISIBILITIES = {"clear", "partial", "not_visible"}
ASSESSABLE_STATUSES = {"strength", "improvement", "optional"}
NON_ACTIONABLE_STATUSES = {"not_assessable", "not_applicable"}
SCORE_EVIDENCE_STATUSES = {"strength", "improvement"}
# These two criteria are owned by the server prompt rather than inferred from
# user prose. They keep application craftsmanship and full-face coherence in
# every analysis while user-specific criteria still have to be traceable to the
# trusted goal text.
COMMON_BASELINE_CRITERIA = {
  "baseline-application": {
    "criterion": "경계·균일도·적용 위치 등 관찰 가능한 적용 완성도가 정돈되었는가",
    "derivedFrom": "공통 기준: 적용 완성도",
  },
  "baseline-coherence": {
    "criterion": "얼굴 전체에서 부위 간 색·마감·시각적 비중이 내부적으로 조화를 이루는가",
    "derivedFrom": "공통 기준: 전체 조화",
  },
}
REQUEST_METADATA_FIELDS = (
  "source",
  "sourceLabel",
  "source_label",
  "contentType",
  "content_type",
  "width",
  "height",
  "task",
)
VISION_REGION_ORDER = (
  "full",
  "left_eye",
  "right_eye",
  "left_cheek",
  "right_cheek",
  "lips",
)
VISION_REGION_LABELS = {
  "full": "full face overview",
  "left_eye": "subject's left eye",
  "right_eye": "subject's right eye",
  "left_cheek": "subject's left cheek",
  "right_cheek": "subject's right cheek",
  "lips": "lip detail",
}
VISION_QUALITY_ISSUE_MESSAGES = {
  "detectorUnavailable": "얼굴 랜드마크 검사를 사용할 수 없어 일부 품질 판단이 제한됩니다.",
  "resolutionTooLow": "사진 해상도가 낮아 메이크업 세부 표현을 확인하기 어렵습니다.",
  "noFace": "사진에서 얼굴을 찾지 못했습니다.",
  "multipleFaces": "사진에 여러 얼굴이 보여 분석 대상을 정할 수 없습니다.",
  "faceTooSmall": "얼굴이 너무 작게 보여 세부 메이크업을 확인하기 어렵습니다.",
  "faceTooLarge": "얼굴이 화면에 너무 가깝거나 일부가 잘렸습니다.",
  "underexposed": "얼굴이 너무 어둡게 촬영되었습니다.",
  "overexposed": "얼굴이 너무 밝게 촬영되었습니다.",
  "severeBlur": "얼굴이 흔들리거나 흐리게 촬영되었습니다.",
  "extremeYaw": "얼굴이 옆으로 너무 많이 돌아가 있습니다.",
  "extremePitch": "얼굴이 위아래로 너무 많이 기울어져 있습니다.",
  "extremeRoll": "고개가 좌우로 너무 많이 기울어져 있습니다.",
  "captureQualityInsufficient": "사진 품질이 충분하지 않아 메이크업을 안정적으로 확인하기 어렵습니다.",
  "modelVisibilityInsufficient": "얼굴은 감지됐지만 가림이나 구도 때문에 핵심 메이크업 영역을 충분히 확인하기 어렵습니다.",
}
VISION_QUALITY_MAX_ISSUES = 6
VISION_QUALITY_ISSUE_PRIORITY = (
  "noFace",
  "multipleFaces",
  "resolutionTooLow",
  "faceTooSmall",
  "faceTooLarge",
  "underexposed",
  "overexposed",
  "severeBlur",
  "extremeYaw",
  "extremePitch",
  "extremeRoll",
  "detectorUnavailable",
)
VISION_QUALITY_ISSUE_RANK = {
  code: index
  for index, code in enumerate(VISION_QUALITY_ISSUE_PRIORITY)
}

BEDROCK_REGION_TOTAL_RAW_BYTES = 14 * 1024 * 1024
BEDROCK_REQUEST_BODY_MAX_BYTES = 24_000_000
VISION_REGION_PRIORITY_GROUPS = (
  ("full",),
  ("left_eye", "right_eye"),
  ("lips",),
  ("left_cheek", "right_cheek"),
)

def _clean_text(value: Any, fallback: str = "") -> str:
  if isinstance(value, str):
    normalized = " ".join(value.split()).strip()
    return normalized or fallback

  return fallback


def _more_conservative_color_confidence(*values: Any) -> str:
  valid_values = [
    value
    for value in values
    if isinstance(value, str) and value in COLOR_CONFIDENCE_RANK
  ]
  if not valid_values:
    return "low"
  return min(valid_values, key=COLOR_CONFIDENCE_RANK.__getitem__)


def _has_lighting_sensitive_observation(result: dict[str, Any]) -> bool:
  evaluations = result.get("evaluations")
  if not isinstance(evaluations, list):
    return False

  return any(
    observation.get("lightingSensitive") is True
    for evaluation in evaluations
    if isinstance(evaluation, dict)
    for observation in (
      evaluation.get("observations")
      if isinstance(evaluation.get("observations"), list)
      else []
    )
    if isinstance(observation, dict)
  )


def _prompt_template_error(
  code: str,
  message: str,
  template_path: Path,
  details: dict[str, Any] | None = None,
) -> AppError:
  return AppError(
    500,
    code,
    message,
    {"templatePath": str(template_path), **(details or {})},
  )


def render_prompt_template(
  template_path: Path,
  values: dict[str, str],
  *,
  required_placeholders: frozenset[str] | set[str],
) -> str:
  try:
    template = template_path.read_text(encoding="utf-8")
  except (OSError, UnicodeError) as exc:
    raise _prompt_template_error(
      "FEEDBACK_PROMPT_TEMPLATE_READ_FAILED",
      "The makeup feedback prompt template could not be read as UTF-8.",
      template_path,
      {"reason": exc.__class__.__name__},
    ) from exc

  template = PROMPT_HEADER_COMMENT_PATTERN.sub("", template, count=1)

  placeholder_matches = list(PROMPT_PLACEHOLDER_PATTERN.finditer(template))
  found_placeholders = {match.group(1).strip() for match in placeholder_matches}
  required = set(required_placeholders)
  invalid_values = sorted(name for name, value in values.items() if not isinstance(value, str))
  unknown = sorted(found_placeholders - set(values))
  missing = sorted(required - found_placeholders)
  missing_values = sorted(required - set(values))
  text_without_placeholders = PROMPT_PLACEHOLDER_PATTERN.sub("", template)
  malformed = "{{" in text_without_placeholders or "}}" in text_without_placeholders

  if unknown or missing or missing_values or invalid_values or malformed:
    raise _prompt_template_error(
      "FEEDBACK_PROMPT_TEMPLATE_INVALID",
      "The makeup feedback prompt template has invalid placeholders.",
      template_path,
      {
        "malformed": malformed,
        "invalidValues": invalid_values,
        "missing": missing,
        "missingValues": missing_values,
        "unknown": unknown,
      },
    )

  rendered = PROMPT_PLACEHOLDER_PATTERN.sub(
    lambda match: values[match.group(1).strip()],
    template,
  ).strip()

  if not rendered:
    raise _prompt_template_error(
      "FEEDBACK_PROMPT_TEMPLATE_INVALID",
      "The makeup feedback prompt template is empty.",
      template_path,
    )

  return rendered


def _clean_topic_id(value: Any) -> str | None:
  if isinstance(value, str) and value in TOPIC_BY_ID:
    return value

  return None


def _clamp_score(value: int) -> int:
  return max(0, min(100, value))


def _get_feedback_context(payload: dict[str, Any]) -> dict[str, str]:
  raw_context = payload.get("feedbackContext") or payload.get("feedback_context")
  context = raw_context if isinstance(raw_context, dict) else {}
  user_goal_text = _clean_text(
    context.get("normalizedGoalText")
    or context.get("normalized_goal_text")
    or context.get("userGoalText")
    or context.get("user_goal_text")
    or payload.get("userGoalText")
    or payload.get("user_goal_text"),
  )

  if not user_goal_text:
    raise AppError(
      400,
      "FEEDBACK_GOAL_REQUIRED",
      "A feedback goal is required before makeup analysis.",
    )

  original_goal_text = _clean_text(
    context.get("originalGoalText")
    or context.get("original_goal_text")
    or payload.get("originalGoalText")
    or payload.get("original_goal_text"),
    user_goal_text,
  )
  goal_intent_type = _clean_text(
    context.get("goalIntentType")
    or context.get("goal_intent_type")
    or payload.get("goalIntentType")
    or payload.get("goal_intent_type"),
    "valid_context",
  )
  profile_gender = _clean_text(
    context.get("profileGender")
    or context.get("profile_gender")
    or payload.get("profileGender")
    or payload.get("profile_gender"),
    "unknown",
  )
  analysis_goal_text = _clean_text(
    context.get("analysisGoalText")
    or context.get("analysis_goal_text"),
  )

  return {
    "analysisGoalText": analysis_goal_text,
    "goalIntentType": goal_intent_type,
    "originalGoalText": original_goal_text,
    "profileGender": profile_gender,
    "userGoalText": user_goal_text,
  }


def _vision_capture_quality(
  vision_result: MakeupFeedbackVisionResult,
) -> dict[str, Any]:
  affected_topic_ids = [topic["id"] for topic in FEEDBACK_TOPICS]
  issues: list[dict[str, Any]] = []
  seen_codes: set[str] = set()

  ordered_quality_issues = sorted(
    enumerate(vision_result.quality_issues),
    key=lambda item: (
      VISION_QUALITY_ISSUE_RANK.get(item[1].code, len(VISION_QUALITY_ISSUE_RANK)),
      item[0],
    ),
  )

  for _, issue in ordered_quality_issues:
    code = _clean_text(issue.code, "visionQualityIssue")

    if code in seen_codes:
      continue

    seen_codes.add(code)
    issues.append(
      {
        "code": code,
        "message": VISION_QUALITY_ISSUE_MESSAGES.get(
          code,
          VISION_QUALITY_ISSUE_MESSAGES["captureQualityInsufficient"],
        ),
        "affectedTopicIds": affected_topic_ids.copy(),
      },
    )

    if len(issues) == VISION_QUALITY_MAX_ISSUES:
      break

  if vision_result.hard_retake and not issues:
    issues.append(
      {
        "code": "captureQualityInsufficient",
        "message": VISION_QUALITY_ISSUE_MESSAGES["captureQualityInsufficient"],
        "affectedTopicIds": affected_topic_ids.copy(),
      },
    )

  issue_codes = {issue["code"] for issue in issues}

  if vision_result.hard_retake or issue_codes & {"underexposed", "overexposed"}:
    color_confidence = "low"
  elif issues:
    color_confidence = "medium"
  else:
    color_confidence = "high"

  return {
    "usable": not vision_result.hard_retake,
    "detectorAvailable": vision_result.detector_available,
    "colorConfidence": color_confidence,
    "issues": issues,
  }


def _capture_quality_for_model_result(
  parsed: dict[str, Any],
  vision_result: MakeupFeedbackVisionResult,
) -> dict[str, Any]:
  capture_quality = _vision_capture_quality(vision_result)
  model_capture_quality = parsed.get("captureQuality")
  model_color_confidence = (
    model_capture_quality.get("colorConfidence")
    if isinstance(model_capture_quality, dict)
    else None
  )
  capture_quality["colorConfidence"] = _more_conservative_color_confidence(
    capture_quality["colorConfidence"],
    model_color_confidence,
  )

  if _has_lighting_sensitive_observation(parsed):
    capture_quality["colorConfidence"] = _more_conservative_color_confidence(
      capture_quality["colorConfidence"],
      "medium",
    )

  if parsed.get("analysisDecision") != "retake_required":
    return capture_quality

  model_issue = {
    "code": "modelVisibilityInsufficient",
    "message": VISION_QUALITY_ISSUE_MESSAGES["modelVisibilityInsufficient"],
    "affectedTopicIds": [topic["id"] for topic in FEEDBACK_TOPICS],
  }
  capture_quality["usable"] = False
  capture_quality["issues"] = [
    model_issue,
    *[
      issue
      for issue in capture_quality["issues"]
      if issue["code"] != model_issue["code"]
    ],
  ][:VISION_QUALITY_MAX_ISSUES]
  return capture_quality



def _select_bedrock_regions(
  vision_result: MakeupFeedbackVisionResult,
) -> list[tuple[str, Any]]:
  selected_names: set[str] = set()
  selected_bytes = 0

  for priority_group in VISION_REGION_PRIORITY_GROUPS:
    group_regions = [
      (name, vision_result.regions[name])
      for name in priority_group
      if name in vision_result.regions
    ]
    group_bytes = sum(len(region.body) for _, region in group_regions)

    if selected_bytes + group_bytes > BEDROCK_REGION_TOTAL_RAW_BYTES:
      logger.info(
        "[aura:feedback-bedrock] region-budget:skip names=%s bytes=%s selectedBytes=%s limitBytes=%s",
        [name for name, _ in group_regions],
        group_bytes,
        selected_bytes,
        BEDROCK_REGION_TOTAL_RAW_BYTES,
      )
      continue

    selected_names.update(name for name, _ in group_regions)
    selected_bytes += group_bytes

  return [
    (name, vision_result.regions[name])
    for name in VISION_REGION_ORDER
    if name in selected_names
  ]


def _build_bedrock_region_content(
  selected_regions: list[tuple[str, Any]],
) -> list[dict[str, Any]]:
  content: list[dict[str, Any]] = []

  for name, region in selected_regions:
    content.extend(
      [
        {
          "type": "text",
          "text": f"Image region: {name} ({VISION_REGION_LABELS[name]})",
        },
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": region.content_type,
            "data": base64.b64encode(region.body).decode("ascii"),
          },
        },
      ],
    )

  if not content:
    raise AppError(
      500,
      "FEEDBACK_VISION_REGIONS_EMPTY",
      "No prepared image region is available for makeup feedback analysis.",
    )

  return content


def _build_vision_context_text(
  vision_result: MakeupFeedbackVisionResult,
  selected_regions: list[tuple[str, Any]],
) -> str:
  context: dict[str, Any] = {
    "detectorAvailable": vision_result.detector_available,
    "faceCount": vision_result.face_count,
    "qualityIssues": [
      {
        "code": issue.code,
        "severity": issue.severity,
        "message": issue.message,
      }
      for issue in vision_result.quality_issues
    ],
    "regionNames": [name for name, _ in selected_regions],
  }

  if vision_result.pose is not None:
    context["pose"] = vision_result.pose.as_dict()

  return (
    "Server vision context (raw landmark coordinates intentionally omitted):\n"
    + json.dumps(context, ensure_ascii=False, separators=(",", ":"))
  )


def _evidence_region_ids_for_topic(
  topic_id: str,
  available_region_ids: set[str],
) -> list[str]:
  topic = TOPIC_BY_ID.get(topic_id)
  kind = topic.get("kind") if topic else None
  candidates = {
    "eye": ("left_eye", "right_eye"),
    "cheek": ("left_cheek", "right_cheek"),
    "lip": ("lips",),
  }.get(kind, ())
  region_ids = ["full"] if "full" in available_region_ids else []
  region_ids.extend(
    region_id
    for region_id in candidates
    if region_id in available_region_ids
  )

  if region_ids:
    return region_ids

  return [sorted(available_region_ids)[0]] if available_region_ids else []


def _attach_vision_evidence(
  result: dict[str, Any],
  vision_result: MakeupFeedbackVisionResult,
  selected_regions: list[tuple[str, Any]],
) -> dict[str, Any]:
  evidence_regions: list[dict[str, Any]] = []
  available_region_ids = {name for name, _ in selected_regions}

  for name, region in selected_regions:
    left, top, right, bottom = region.source_box
    evidence_regions.append(
      {
        "id": name,
        "box": {
          "left": left / vision_result.width,
          "top": top / vision_result.height,
          "right": right / vision_result.width,
          "bottom": bottom / vision_result.height,
        },
      },
    )

  result["analysisImageSize"] = {
    "width": vision_result.width,
    "height": vision_result.height,
  }
  result["evidenceRegions"] = evidence_regions

  for evaluation in result.get("evaluations", []):
    if not isinstance(evaluation, dict):
      continue

    region_ids = _evidence_region_ids_for_topic(
      str(evaluation.get("topicId") or ""),
      available_region_ids,
    )
    for observation in evaluation.get("observations", []):
      if isinstance(observation, dict):
        observation["evidenceRegionIds"] = region_ids.copy()

  return result

def _build_vision_retake_result(
  vision_result: MakeupFeedbackVisionResult,
) -> dict[str, Any]:
  return {
    "analysisDecision": "retake_required",
    "captureQuality": _vision_capture_quality(vision_result),
    "score": None,
    "scoreRange": None,
    "scoreConfidence": 0.0,
    "scoreEvidenceIds": [],
    "scoreLabel": "재촬영 필요",
    "scoreReason": "사진 품질이 충분하지 않아 신뢰할 수 있는 메이크업 점수를 제공하지 않습니다.",
    "modelVersion": MODEL_VERSION,
  }


def _invalid_live_result(
  field: str,
  reason: str,
  details: dict[str, Any] | None = None,
) -> AppError:
  return AppError(
    502,
    "FEEDBACK_BEDROCK_OUTPUT_INVALID",
    "Bedrock feedback analysis returned an invalid result.",
    {"field": field, "reason": reason, **(details or {})},
  )


def _require_mapping(value: Any, field: str) -> dict[str, Any]:
  if not isinstance(value, dict):
    raise _invalid_live_result(field, "must be an object")

  return value


def _require_text(mapping: dict[str, Any], key: str, field: str) -> str:
  if key not in mapping:
    raise _invalid_live_result(field, "is required")

  value = _clean_text(mapping.get(key))

  if not value:
    raise _invalid_live_result(field, "must be a non-empty string")

  return value


def _require_enum(
  mapping: dict[str, Any],
  key: str,
  field: str,
  allowed: set[str],
) -> str:
  value = mapping.get(key)

  if not isinstance(value, str) or value not in allowed:
    raise _invalid_live_result(field, "has an unsupported value", {"allowed": sorted(allowed)})

  return value


def _require_bool(value: Any, field: str) -> bool:
  if not isinstance(value, bool):
    raise _invalid_live_result(field, "must be a boolean")

  return value


def _require_nullable_text(mapping: dict[str, Any], key: str, field: str) -> str | None:
  if key not in mapping:
    raise _invalid_live_result(field, "is required")

  value = mapping.get(key)

  if value is None:
    return None

  normalized = _clean_text(value)

  if not normalized:
    raise _invalid_live_result(field, "must be null or a non-empty string")

  return normalized


def _require_text_list(
  value: Any,
  field: str,
  *,
  min_items: int = 0,
  max_items: int = 6,
  unique: bool = False,
) -> list[str]:
  if not isinstance(value, list) or not min_items <= len(value) <= max_items:
    raise _invalid_live_result(
      field,
      f"must contain {min_items} to {max_items} items",
    )

  items = [_clean_text(item) for item in value]

  if any(not item for item in items):
    raise _invalid_live_result(field, "must contain only non-empty strings")

  if unique and len(set(items)) != len(items):
    raise _invalid_live_result(field, "must not contain duplicates")

  return items


def _require_score(value: Any, field: str = "score") -> int:
  if isinstance(value, bool) or not isinstance(value, (int, float)):
    raise _invalid_live_result(field, "must be a finite number")

  numeric_value = float(value)

  if not math.isfinite(numeric_value):
    raise _invalid_live_result(field, "must be a finite number")

  return _clamp_score(round(numeric_value))


def _require_score_range(mapping: dict[str, Any]) -> list[int] | None:
  if "scoreRange" not in mapping:
    raise _invalid_live_result("scoreRange", "is required")

  value = mapping.get("scoreRange")

  if value is None:
    return None

  if not isinstance(value, list) or len(value) != 2:
    raise _invalid_live_result("scoreRange", "must be null or a two-item array")

  lower = _require_score(value[0], "scoreRange[0]")
  upper = _require_score(value[1], "scoreRange[1]")

  if lower > upper:
    raise _invalid_live_result("scoreRange", "lower bound must not exceed upper bound")

  return [lower, upper]


def _require_score_reason(mapping: dict[str, Any]) -> str:
  score_reason = _require_text(mapping, "scoreReason", "scoreReason")
  sentences = [part.strip() for part in re.split(r"[.!?。！？]+", score_reason) if part.strip()]

  if not 1 <= len(sentences) <= 2:
    raise _invalid_live_result("scoreReason", "must contain 1 or 2 sentences")

  return score_reason


def _require_confidence(value: Any, field: str) -> float:
  if isinstance(value, bool) or not isinstance(value, (int, float)):
    raise _invalid_live_result(field, "must be a number from 0.0 to 1.0")

  numeric_value = float(value)

  if not math.isfinite(numeric_value) or not 0.0 <= numeric_value <= 1.0:
    raise _invalid_live_result(field, "must be a number from 0.0 to 1.0")

  return numeric_value


def _require_action_steps(value: Any, field: str, status: str) -> list[str]:
  if not isinstance(value, list):
    raise _invalid_live_result(field, "must be an array")

  steps = [_clean_text(item) for item in value]

  if any(not step for step in steps):
    raise _invalid_live_result(field, "must contain only non-empty strings")

  if status in NON_ACTIONABLE_STATUSES and steps:
    raise _invalid_live_result(field, f"must be empty when status is {status}")

  if status in ASSESSABLE_STATUSES and not 1 <= len(steps) <= 3:
    raise _invalid_live_result(field, "must contain 1 to 3 steps for an assessable status")

  return steps


def _build_points(evaluations: list[dict[str, Any]]) -> list[dict[str, Any]]:
  return [
    {
      "id": f"{item['topicId']}-point",
      "topicId": item["topicId"],
      "topicLabel": item["topicLabel"],
      "title": item["title"],
      "description": item["description"],
      "actionSteps": item["actionSteps"],
      "actionLabel": "보완 포인트",
      "kind": item["kind"],
    }
    for item in evaluations
    if item["status"] in {"improvement", "optional"}
  ]


def _build_strengths(evaluations: list[dict[str, Any]]) -> list[dict[str, Any]]:
  strengths = []

  for index, item in enumerate(evaluations):
    if item["status"] != "strength":
      continue

    strengths.append(
      {
        "id": f"{item['topicId']}-strength",
        "topicId": item["topicId"],
        "topicLabel": item["topicLabel"],
        "title": item["title"],
        "description": item["description"],
        "actionSteps": item["actionSteps"],
        "icon": "sparkle" if index % 2 == 0 else "heart",
        "kind": item["kind"],
      },
    )

  return strengths


def _normalize_observations(value: Any, field: str) -> list[dict[str, Any]]:
  if not isinstance(value, list) or len(value) > 3:
    raise _invalid_live_result(field, "must be an array with at most 3 items")

  observations: list[dict[str, Any]] = []
  seen_ids: set[str] = set()

  for index, raw_value in enumerate(value):
    item_field = f"{field}[{index}]"
    item = _require_mapping(raw_value, item_field)
    observation_id = _require_text(item, "id", f"{item_field}.id")

    if observation_id in seen_ids:
      raise _invalid_live_result(f"{item_field}.id", "must not be duplicated")

    seen_ids.add(observation_id)
    observations.append(
      {
        "id": observation_id,
        "claim": _require_text(item, "claim", f"{item_field}.claim"),
        "evidenceLocation": _require_text(
          item,
          "evidenceLocation",
          f"{item_field}.evidenceLocation",
        ),
        "lightingSensitive": _require_bool(
          item.get("lightingSensitive"),
          f"{item_field}.lightingSensitive",
        ),
      },
    )

  return observations


def _normalize_dynamic_criteria(value: Any) -> list[dict[str, str]]:
  if not isinstance(value, list) or not 3 <= len(value) <= 6:
    raise _invalid_live_result(
      "interpretedGoal.dynamicCriteria",
      "must contain the two common baselines and 1 to 4 user criteria",
    )

  criteria: list[dict[str, str]] = []
  seen_ids: set[str] = set()

  for index, raw_value in enumerate(value):
    field = f"interpretedGoal.dynamicCriteria[{index}]"
    item = _require_mapping(raw_value, field)
    criterion_id = _require_text(item, "id", f"{field}.id")

    if criterion_id in seen_ids:
      raise _invalid_live_result(f"{field}.id", "must not be duplicated")

    seen_ids.add(criterion_id)
    criteria.append(
      {
        "id": criterion_id,
        "criterion": _require_text(item, "criterion", f"{field}.criterion"),
        "derivedFrom": _require_text(item, "derivedFrom", f"{field}.derivedFrom"),
      },
    )

  missing_baseline_ids = [
    criterion_id
    for criterion_id in COMMON_BASELINE_CRITERIA
    if criterion_id not in seen_ids
  ]
  if missing_baseline_ids:
    raise _invalid_live_result(
      "interpretedGoal.dynamicCriteria",
      "must include every server-owned common baseline criterion",
      {"missingBaselineIds": missing_baseline_ids},
    )

  return criteria


def _normalize_capture_quality(raw_quality: Any) -> dict[str, Any]:
  quality = _require_mapping(raw_quality, "captureQuality")
  usable = _require_bool(quality.get("usable"), "captureQuality.usable")
  detector_available = _require_bool(
    quality.get("detectorAvailable"),
    "captureQuality.detectorAvailable",
  )
  color_confidence = _require_enum(
    quality,
    "colorConfidence",
    "captureQuality.colorConfidence",
    VALID_COLOR_CONFIDENCES,
  )
  raw_issues = quality.get("issues")

  if not isinstance(raw_issues, list) or len(raw_issues) > VISION_QUALITY_MAX_ISSUES:
    raise _invalid_live_result(
      "captureQuality.issues",
      f"must be an array with at most {VISION_QUALITY_MAX_ISSUES} items",
    )

  issues: list[dict[str, Any]] = []
  seen_codes: set[str] = set()

  for index, raw_issue in enumerate(raw_issues):
    field = f"captureQuality.issues[{index}]"
    issue = _require_mapping(raw_issue, field)
    code = _require_text(issue, "code", f"{field}.code")

    if code in seen_codes:
      raise _invalid_live_result(f"{field}.code", "must not be duplicated")

    seen_codes.add(code)
    affected_topic_ids = _require_text_list(
      issue.get("affectedTopicIds"),
      f"{field}.affectedTopicIds",
      max_items=len(FEEDBACK_TOPICS),
      unique=True,
    )
    unknown_topic_ids = sorted(set(affected_topic_ids) - set(TOPIC_BY_ID))

    if unknown_topic_ids:
      raise _invalid_live_result(
        f"{field}.affectedTopicIds",
        "references unknown feedback topic ids",
        {"unknownIds": unknown_topic_ids},
      )

    issues.append(
      {
        "code": code,
        "message": _require_text(issue, "message", f"{field}.message"),
        "affectedTopicIds": affected_topic_ids,
      },
    )

  if not usable and not issues:
    raise _invalid_live_result(
      "captureQuality.issues",
      "must contain at least one issue when the image is not usable",
    )

  return {
    "usable": usable,
    "detectorAvailable": detector_available,
    "colorConfidence": color_confidence,
    "issues": issues,
  }


def _normalize_evaluations(
  raw_evaluations: Any,
  criterion_ids: set[str],
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
  if not isinstance(raw_evaluations, list):
    raise _invalid_live_result("evaluations", "must be an array")

  expected_count = len(FEEDBACK_TOPICS)

  if len(raw_evaluations) != expected_count:
    raise _invalid_live_result(
      "evaluations",
      f"must contain exactly {expected_count} items",
      {"actualCount": len(raw_evaluations), "expectedCount": expected_count},
    )

  item_by_topic: dict[str, dict[str, Any]] = {}
  observation_ids: set[str] = set()
  evaluation_by_observation_id: dict[str, dict[str, Any]] = {}

  for index, raw_value in enumerate(raw_evaluations):
    field_prefix = f"evaluations[{index}]"
    raw_item = _require_mapping(raw_value, field_prefix)
    raw_topic_id = raw_item.get("topicId")
    topic_id = _clean_topic_id(raw_topic_id)

    if topic_id is None:
      raise _invalid_live_result(
        f"{field_prefix}.topicId",
        "must be one of the configured feedback topics",
        {"allowed": [topic["id"] for topic in FEEDBACK_TOPICS]},
      )

    if topic_id in item_by_topic:
      raise _invalid_live_result(
        f"{field_prefix}.topicId",
        "must not be duplicated",
        {"topicId": topic_id},
      )

    topic = TOPIC_BY_ID[topic_id]
    topic_label = _require_text(raw_item, "topicLabel", f"{field_prefix}.topicLabel")

    if topic_label != topic["label"]:
      raise _invalid_live_result(
        f"{field_prefix}.topicLabel",
        "must match the configured topic label",
        {"expected": topic["label"], "topicId": topic_id},
      )

    status = _require_enum(raw_item, "status", f"{field_prefix}.status", VALID_STATUSES)
    score_impact = _require_enum(
      raw_item,
      "scoreImpact",
      f"{field_prefix}.scoreImpact",
      VALID_SCORE_IMPACTS,
    )

    if status == "optional" and score_impact != "low":
      logger.warning(
        "[aura:feedback-bedrock] output:repaired field=%s from=optional to=improvement scoreImpact=%s topicId=%s",
        f"{field_prefix}.status",
        score_impact,
        topic_id,
      )
      status = "improvement"
    visibility = _require_enum(
      raw_item,
      "visibility",
      f"{field_prefix}.visibility",
      VALID_VISIBILITIES,
    )
    visibility_reason = _require_nullable_text(
      raw_item,
      "visibilityReason",
      f"{field_prefix}.visibilityReason",
    )
    observations = _normalize_observations(
      raw_item.get("observations"),
      f"{field_prefix}.observations",
    )
    goal_criterion_ids = _require_text_list(
      raw_item.get("goalCriterionIds"),
      f"{field_prefix}.goalCriterionIds",
      min_items=1 if status in ASSESSABLE_STATUSES else 0,
      max_items=6,
      unique=True,
    )
    action_steps = _require_action_steps(
      raw_item.get("actionSteps"),
      f"{field_prefix}.actionSteps",
      status,
    )

    if visibility == "clear" and visibility_reason is not None:
      raise _invalid_live_result(
        f"{field_prefix}.visibilityReason",
        "must be null when visibility is clear",
      )

    if visibility in {"partial", "not_visible"} and visibility_reason is None:
      visibility_reason = (
        f"사진에서 {topic_label} 영역이 일부만 보여 제한적으로 평가했습니다."
        if visibility == "partial"
        else f"사진에서 {topic_label} 영역이 충분히 보이지 않아 해당 항목을 평가하지 않았습니다."
      )
      logger.warning(
        "[aura:feedback-bedrock] output:repaired field=%s visibility=%s topicId=%s",
        f"{field_prefix}.visibilityReason",
        visibility,
        topic_id,
      )

    if status in ASSESSABLE_STATUSES:
      if visibility == "not_visible":
        raise _invalid_live_result(
          f"{field_prefix}.visibility",
          "cannot be not_visible for an assessable status",
        )

      if not observations:
        raise _invalid_live_result(
          f"{field_prefix}.observations",
          "must contain at least one observation for an assessable status",
        )

    if status in NON_ACTIONABLE_STATUSES:
      if observations:
        raise _invalid_live_result(
          f"{field_prefix}.observations",
          f"must be empty when status is {status}",
        )

      if goal_criterion_ids:
        raise _invalid_live_result(
          f"{field_prefix}.goalCriterionIds",
          f"must be empty when status is {status}",
        )

      if score_impact != "low":
        raise _invalid_live_result(
          f"{field_prefix}.scoreImpact",
          f"must be low when status is {status}",
        )

    if status == "not_assessable" and visibility == "clear":
      raise _invalid_live_result(
        f"{field_prefix}.visibility",
        "must be partial or not_visible when status is not_assessable",
      )

    unknown_criterion_ids = sorted(set(goal_criterion_ids) - criterion_ids)

    if unknown_criterion_ids:
      raise _invalid_live_result(
        f"{field_prefix}.goalCriterionIds",
        "references unknown interpretedGoal.dynamicCriteria ids",
        {"unknownIds": unknown_criterion_ids},
      )

    current_observation_ids = {item["id"] for item in observations}
    duplicate_observation_ids = sorted(observation_ids & current_observation_ids)

    if duplicate_observation_ids:
      raise _invalid_live_result(
        f"{field_prefix}.observations",
        "observation ids must be unique across all evaluations",
        {"duplicateIds": duplicate_observation_ids},
      )

    observation_ids.update(current_observation_ids)
    normalized_item = {
      "id": f"{topic_id}-{status}",
      "topicId": topic_id,
      "topicLabel": topic_label,
      "status": status,
      "visibility": visibility,
      "visibilityReason": visibility_reason,
      "observations": observations,
      "goalCriterionIds": goal_criterion_ids,
      "title": _require_text(raw_item, "title", f"{field_prefix}.title"),
      "description": _require_text(raw_item, "description", f"{field_prefix}.description"),
      "actionSteps": action_steps,
      "scoreImpact": score_impact,
      "kind": topic["kind"],
      "confidence": _require_confidence(raw_item.get("confidence"), f"{field_prefix}.confidence"),
    }
    item_by_topic[topic_id] = normalized_item

    for observation_id in current_observation_ids:
      evaluation_by_observation_id[observation_id] = normalized_item

  missing_topics = [topic["id"] for topic in FEEDBACK_TOPICS if topic["id"] not in item_by_topic]

  if missing_topics:
    raise _invalid_live_result(
      "evaluations",
      "must include every configured feedback topic exactly once",
      {"missingTopics": missing_topics},
    )

  return (
    [item_by_topic[topic["id"]] for topic in FEEDBACK_TOPICS],
    evaluation_by_observation_id,
  )


def _normalize_interpreted_goal(raw_goal: Any, payload: dict[str, Any]) -> dict[str, Any]:
  goal = _require_mapping(raw_goal, "interpretedGoal")
  dynamic_criteria = _normalize_dynamic_criteria(goal.get("dynamicCriteria"))
  feedback_context = _get_feedback_context(payload)
  trusted_goal_text = (
    feedback_context["analysisGoalText"]
    or feedback_context["originalGoalText"]
  )
  normalized_trusted_goal = " ".join(trusted_goal_text.casefold().split())

  for index, criterion in enumerate(dynamic_criteria):
    normalized_derived_from = " ".join(
      criterion["derivedFrom"].casefold().split(),
    )

    baseline_contract = COMMON_BASELINE_CRITERIA.get(criterion["id"])
    if baseline_contract is not None:
      if criterion["criterion"] != baseline_contract["criterion"]:
        raise _invalid_live_result(
          f"interpretedGoal.dynamicCriteria[{index}].criterion",
          "must match the server-owned common baseline criterion",
        )
      if criterion["derivedFrom"] != baseline_contract["derivedFrom"]:
        raise _invalid_live_result(
          f"interpretedGoal.dynamicCriteria[{index}].derivedFrom",
          "must match the server-owned common baseline source",
        )
      continue

    if criterion["derivedFrom"] in {
      item["derivedFrom"] for item in COMMON_BASELINE_CRITERIA.values()
    }:
      raise _invalid_live_result(
        f"interpretedGoal.dynamicCriteria[{index}].id",
        "must use the matching server-owned common baseline id",
      )

    if normalized_derived_from not in normalized_trusted_goal:
      raise _invalid_live_result(
        f"interpretedGoal.dynamicCriteria[{index}].derivedFrom",
        "must be a substring of the trusted analysis goal text",
      )

  intensity = _require_enum(goal, "intensity", "interpretedGoal.intensity", VALID_INTENSITIES)

  return {
    "label": localize_makeup_feedback_intensity_terms(
      _require_text(goal, "label", "interpretedGoal.label"),
    ),
    "intensity": intensity,
    "reason": localize_makeup_feedback_intensity_terms(
      _require_text(goal, "reason", "interpretedGoal.reason"),
    ),
    "explicitFacts": _require_text_list(
      goal.get("explicitFacts"),
      "interpretedGoal.explicitFacts",
      min_items=1,
      max_items=6,
    ),
    "unknowns": _require_text_list(
      goal.get("unknowns"),
      "interpretedGoal.unknowns",
      max_items=6,
    ),
    "assumptions": _require_text_list(
      goal.get("assumptions"),
      "interpretedGoal.assumptions",
      max_items=4,
    ),
    "dynamicCriteria": dynamic_criteria,
  }


def _normalize_summary(raw_summary: Any) -> dict[str, str]:
  summary = _require_mapping(raw_summary, "summary")

  return {
    "strengthSummary": _require_text(summary, "strengthSummary", "summary.strengthSummary"),
    "improvementSummary": _require_text(summary, "improvementSummary", "summary.improvementSummary"),
  }


def _evidence_score_calibration_band(
  evaluations: list[dict[str, Any]],
) -> tuple[int, int] | None:
  """Return a broad coherence band without replacing the model's judgment.

  The model still chooses the score after considering the image and goal.  This
  guard only catches scores that contradict the same response's assessable
  evidence distribution. Optional advice and unassessable/non-applicable areas
  never move the band. Confidence widens the band instead of becoming a score
  penalty, and makeup intensity itself is deliberately not an input.
  """
  assessable = [
    evaluation
    for evaluation in evaluations
    if evaluation["status"] in SCORE_EVIDENCE_STATUSES
  ]
  # A single focused area (for example, "립만 봐줘") has no distribution from
  # which to infer a reliable consistency ceiling. Keep the model score intact.
  if len(assessable) < 2:
    return None

  weighted_total = 0.0
  weighted_strength = 0.0
  impact_total = 0.0
  confidence_total = 0.0

  for evaluation in assessable:
    impact_weight = SCORE_IMPACT_WEIGHTS[evaluation["scoreImpact"]]
    confidence = float(evaluation["confidence"])
    # Keep very uncertain evidence from disappearing entirely while allowing
    # its uncertainty to widen the accepted range below.
    evidence_weight = impact_weight * max(0.25, confidence)
    weighted_total += evidence_weight
    impact_total += impact_weight
    confidence_total += impact_weight * confidence
    if evaluation["status"] == "strength":
      weighted_strength += evidence_weight

  if weighted_total <= 0 or impact_total <= 0:
    return None

  fulfillment_ratio = weighted_strength / weighted_total
  average_confidence = confidence_total / impact_total
  center = round(20 + 75 * fulfillment_ratio)
  half_width = round(10 + 10 * (1 - average_confidence))
  lower = max(0, center - half_width)
  upper = min(100, center + half_width)

  has_confident_high_impact_improvement = any(
    evaluation["status"] == "improvement"
    and evaluation["scoreImpact"] == "high"
    and evaluation["confidence"] >= 0.5
    for evaluation in assessable
  )
  if has_confident_high_impact_improvement:
    upper = min(upper, HIGH_IMPACT_IMPROVEMENT_SCORE_CEILING)
    lower = min(lower, upper)

  return lower, upper


def _calibrate_score_and_range(
  score: int,
  score_range: list[int],
  evaluations: list[dict[str, Any]],
) -> tuple[int, list[int]]:
  calibration_band = _evidence_score_calibration_band(evaluations)
  if calibration_band is None:
    return score, score_range

  _band_lower, band_upper = calibration_band
  # The evidence distribution is a one-way overstatement guard.  It can cap a
  # score that is inconsistent with its own improvement evidence, but it must
  # never raise a cautious model score because the contract has no explicit
  # partial-fulfillment value from which to justify that increase.
  if score <= band_upper:
    return score, score_range

  calibrated_score = band_upper
  original_lower, original_upper = score_range
  range_width = max(
    original_upper - original_lower,
    score - calibrated_score,
    5,
  )
  calibrated_range = [
    max(0, calibrated_score - range_width),
    calibrated_score,
  ]

  if calibrated_score != score or calibrated_range != score_range:
    logger.warning(
      "[aura:feedback-bedrock] output:repaired field=scoreCalibration "
      "score=%s->%s scoreRange=%s->%s band=%s",
      score,
      calibrated_score,
      score_range,
      calibrated_range,
      calibration_band,
    )

  return calibrated_score, calibrated_range


def _build_calibrated_score_reason(
  evaluations: list[dict[str, Any]],
) -> str:
  strengths = [
    evaluation
    for evaluation in evaluations
    if evaluation["status"] == "strength"
  ]
  improvements = sorted(
    (
      evaluation
      for evaluation in evaluations
      if evaluation["status"] == "improvement"
    ),
    key=lambda evaluation: (
      SCORE_IMPACT_WEIGHTS[evaluation["scoreImpact"]],
      float(evaluation["confidence"]),
    ),
    reverse=True,
  )
  if not improvements:
    return "사진에서 확인된 근거 분포에 맞춰 종합 점수를 보수적으로 계산했어요."

  primary_title = _clean_text(
    re.sub(r"[.!?。！？]+", " ", improvements[0]["title"]),
    improvements[0]["topicLabel"],
  )
  strength_prefix = (
    f"사진에서 {len(strengths)}개 강점이 확인됐지만, "
    if strengths
    else "사진에서 "
  )
  return (
    f"{strength_prefix}{primary_title} 등 {len(improvements)}개 보완 근거의 "
    "영향도를 반영해 점수를 보수적으로 계산했어요."
  )


def _repair_score_evidence_ids(
  score_evidence_ids: list[str],
  evaluations: list[dict[str, Any]],
  evaluation_by_observation_id: dict[str, dict[str, Any]],
) -> tuple[list[str], list[str]]:
  evaluation_by_topic_id = {
    evaluation["topicId"]: evaluation
    for evaluation in evaluations
  }
  repaired_ids: list[str] = []
  unresolved_ids: list[str] = []

  for evidence_id in score_evidence_ids:
    if evidence_id in evaluation_by_observation_id:
      repaired_ids.append(evidence_id)
      continue

    topic_id = next(
      (
        topic["id"]
        for topic in FEEDBACK_TOPICS
        if evidence_id.startswith(f"{topic['id']}-")
        or evidence_id.startswith(f"{topic['id']}_")
      ),
      None,
    )
    evaluation = evaluation_by_topic_id.get(topic_id) if topic_id else None
    replacement_id = next(
      (
        observation["id"]
        for observation in evaluation["observations"]
        if evaluation["status"] in SCORE_EVIDENCE_STATUSES
      ),
      None,
    ) if evaluation else None

    if replacement_id:
      if replacement_id not in repaired_ids:
        repaired_ids.append(replacement_id)
      logger.warning(
        "[aura:feedback-bedrock] output:repaired field=scoreEvidenceIds from=%s to=%s topicId=%s",
        evidence_id,
        replacement_id,
        topic_id,
      )
      continue

    unresolved_ids.append(evidence_id)

  return repaired_ids, unresolved_ids


def normalize_makeup_feedback_result(result: dict[str, Any] | None, payload: dict[str, Any]) -> dict[str, Any]:
  raw_result = _require_mapping(result, "result")
  source = _clean_text(payload.get("source"), "camera")
  analysis_decision = _require_enum(
    raw_result,
    "analysisDecision",
    "analysisDecision",
    VALID_ANALYSIS_DECISIONS,
  )
  capture_quality = _normalize_capture_quality(raw_result.get("captureQuality"))
  interpreted_goal = _normalize_interpreted_goal(
    raw_result.get("interpretedGoal"),
    payload,
  )
  criterion_ids = {item["id"] for item in interpreted_goal["dynamicCriteria"]}
  evaluations, evaluation_by_observation_id = _normalize_evaluations(
    raw_result.get("evaluations"),
    criterion_ids,
  )
  score_range = _require_score_range(raw_result)
  score_confidence = _require_confidence(raw_result.get("scoreConfidence"), "scoreConfidence")
  score_evidence_ids = _require_text_list(
    raw_result.get("scoreEvidenceIds"),
    "scoreEvidenceIds",
    min_items=1 if analysis_decision == "completed" else 0,
    max_items=16,
    unique=True,
  )
  score_reason = _require_score_reason(raw_result)

  if "score" not in raw_result:
    raise _invalid_live_result("score", "is required")

  raw_score = raw_result.get("score")

  if analysis_decision == "completed":
    if not capture_quality["usable"]:
      raise _invalid_live_result(
        "captureQuality.usable",
        "must be true when analysisDecision is completed",
      )

    score = _require_score(raw_score)

    if score_range is None:
      raise _invalid_live_result(
        "scoreRange",
        "must be a two-item array when analysisDecision is completed",
      )

    if not score_range[0] <= score <= score_range[1]:
      raise _invalid_live_result(
        "scoreRange",
        "must include score",
        {"score": score},
      )
  else:
    if capture_quality["usable"]:
      raise _invalid_live_result(
        "captureQuality.usable",
        "must be false when analysisDecision is retake_required",
      )

    if raw_score is not None:
      raise _invalid_live_result("score", "must be null when a retake is required")

    if score_range is not None:
      raise _invalid_live_result("scoreRange", "must be null when a retake is required")

    if score_confidence != 0.0:
      raise _invalid_live_result("scoreConfidence", "must be 0.0 when a retake is required")

    if score_evidence_ids:
      raise _invalid_live_result("scoreEvidenceIds", "must be empty when a retake is required")

    score = None

  score_evidence_ids, unknown_score_evidence_ids = _repair_score_evidence_ids(
    score_evidence_ids,
    evaluations,
    evaluation_by_observation_id,
  )

  if unknown_score_evidence_ids:
    raise _invalid_live_result(
      "scoreEvidenceIds",
      "references unknown observation ids",
      {"unknownIds": unknown_score_evidence_ids},
    )

  disallowed_score_evidence_ids = [
    observation_id
    for observation_id in score_evidence_ids
    if evaluation_by_observation_id[observation_id]["status"]
    not in SCORE_EVIDENCE_STATUSES
  ]

  if disallowed_score_evidence_ids:
    raise _invalid_live_result(
      "scoreEvidenceIds",
      "must reference only strength or improvement observations",
      {
        "disallowedIds": disallowed_score_evidence_ids,
        "allowedStatuses": sorted(SCORE_EVIDENCE_STATUSES),
      },
    )

  lighting_sensitive_observation_ids = {
    observation["id"]
    for evaluation in evaluations
    for observation in evaluation["observations"]
    if observation["lightingSensitive"]
  }
  lighting_sensitive_score_evidence_ids = sorted(
    set(score_evidence_ids) & lighting_sensitive_observation_ids,
  )
  if (
    lighting_sensitive_score_evidence_ids
    and score_confidence > LIGHTING_SENSITIVE_SCORE_CONFIDENCE_CAP
  ):
    logger.warning(
      "[aura:feedback-bedrock] output:repaired field=scoreConfidence "
      "reason=lighting-sensitive-evidence from=%s to=%s evidenceIds=%s",
      score_confidence,
      LIGHTING_SENSITIVE_SCORE_CONFIDENCE_CAP,
      lighting_sensitive_score_evidence_ids,
    )
    score_confidence = LIGHTING_SENSITIVE_SCORE_CONFIDENCE_CAP

  if analysis_decision == "completed" and score is not None and score_range is not None:
    uncalibrated_score = score
    score, score_range = _calibrate_score_and_range(
      score,
      score_range,
      evaluations,
    )
    if (
      score < uncalibrated_score
      and score_confidence > EVIDENCE_CALIBRATION_SCORE_CONFIDENCE_CAP
    ):
      logger.warning(
        "[aura:feedback-bedrock] output:repaired field=scoreConfidence "
        "reason=evidence-score-disagreement from=%s to=%s",
        score_confidence,
        EVIDENCE_CALIBRATION_SCORE_CONFIDENCE_CAP,
      )
      score_confidence = EVIDENCE_CALIBRATION_SCORE_CONFIDENCE_CAP
    if score < uncalibrated_score:
      score_reason = _build_calibrated_score_reason(evaluations)

  points = _build_points(evaluations)
  strengths = _build_strengths(evaluations)

  return {
    "analysisDecision": analysis_decision,
    "captureQuality": capture_quality,
    "scoreRange": score_range,
    "scoreConfidence": score_confidence,
    "scoreEvidenceIds": score_evidence_ids,
    "score": score,
    "scoreLabel": _require_text(raw_result, "scoreLabel", "scoreLabel"),
    "scoreReason": score_reason,
    "interpretedGoal": interpreted_goal,
    "summary": _normalize_summary(raw_result.get("summary")),
    "photoSourceLabel": "앨범에서 선택한 사진" if source == "gallery" else "카메라로 촬영한 사진",
    "summaryBadges": [
      {"id": "strength-count", "label": f"잘한 항목 {len(strengths)}개"},
      {"id": "improvement-count", "label": f"보완 항목 {len(points)}개"},
      {"id": "topic-count", "label": f"{len(FEEDBACK_TOPICS)}개 항목 분석"},
    ],
    "annotations": [],
    "evaluations": evaluations,
    "points": points,
    "strengths": strengths,
    "modelVersion": MODEL_VERSION,
  }


def _build_output_contract() -> dict[str, Any]:
  return {
    "analysisDecision": "completed | retake_required",
    "captureQuality": {
      "usable": True,
      "detectorAvailable": True,
      "colorConfidence": "low | medium | high",
      "issues": [
        {
          "code": "vision quality issue code",
          "message": "human-readable quality issue",
          "affectedTopicIds": ["brow"],
        },
      ],
    },
    "score": 0,
    "scoreRange": [0, 0],
    "scoreConfidence": 0.0,
    "scoreEvidenceIds": ["brow-obs-1"],
    "scoreLabel": "종합 점수",
    "scoreReason": "관찰 근거와 동적 목적 기준을 연결한 점수 또는 재촬영 근거 1~2문장",
    "interpretedGoal": {
      "label": "사용자 목적을 짧게 요약",
      "intensity": "light | medium | bold",
      "reason": "이렇게 해석한 이유를 자연스러운 한국어로 설명하고 intensity 영문 enum은 쓰지 않음",
      "explicitFacts": ["사용자가 실제로 제공한 조건"],
      "unknowns": [],
      "assumptions": [],
      "dynamicCriteria": [
        {
          "id": "baseline-application",
          "criterion": "경계·균일도·적용 위치 등 관찰 가능한 적용 완성도가 정돈되었는가",
          "derivedFrom": "공통 기준: 적용 완성도",
        },
        {
          "id": "baseline-coherence",
          "criterion": "얼굴 전체에서 부위 간 색·마감·시각적 비중이 내부적으로 조화를 이루는가",
          "derivedFrom": "공통 기준: 전체 조화",
        },
        {
          "id": "goal-1",
          "criterion": "이번 요청에만 적용되는 동적 평가 기준",
          "derivedFrom": "기준을 직접 유도한 사용자 원문",
        },
      ],
    },
    "evaluations": [
      {
        "topicId": "brow",
        "topicLabel": "눈썹",
        "status": "strength | improvement | optional | not_assessable | not_applicable",
        "visibility": "clear | partial | not_visible",
        "visibilityReason": None,
        "observations": [
          {
            "id": "brow-obs-1",
            "claim": "사진에서 실제로 확인한 사실",
            "evidenceLocation": "관찰한 구체적인 위치",
            "lightingSensitive": False,
          },
        ],
        "goalCriterionIds": ["goal-1"],
        "title": "사진 관찰을 반영한 짧은 제목",
        "description": "관찰과 사용자 목적에 근거한 한국어 피드백 1~2문장",
        "actionSteps": [
          "관찰한 상태를 개선하거나 유지하기 위한 구체적인 실행 단계",
        ],
        "scoreImpact": "high | medium | low",
        "confidence": 0.0,
      },
    ],
    "summary": {
      "strengthSummary": "strength 항목만 근거로 한 잘한 점 요약 1문장. strength가 없으면 새 칭찬 없이 중립적으로 작성",
      "improvementSummary": "improvement와 optional 항목만 근거로 한 보완할 점 요약 1문장. 두 상태가 모두 없으면 새 보완점 없이 중립적으로 작성",
    },
  }


def _build_user_prompt_values(payload: dict[str, Any]) -> dict[str, str]:
  feedback_context = _get_feedback_context(payload)
  metadata = {
    key: value
    for key, value in payload.items()
    if key in REQUEST_METADATA_FIELDS
  }
  topic_id_list = "\n".join(
    f"- {topic['id']}: {topic['label']} (kind: {topic['kind']})"
    for topic in FEEDBACK_TOPICS
  )
  topic_label_list = "\n".join(f"- {topic['label']}" for topic in FEEDBACK_TOPICS)
  analysis_goal_text = feedback_context["analysisGoalText"]
  prompt_original_goal_text = analysis_goal_text or feedback_context["originalGoalText"]
  prompt_user_goal_text = (
    f"메이크업 상황: {analysis_goal_text}"
    if analysis_goal_text
    else feedback_context["userGoalText"]
  )

  return {
    "GOAL_INTENT_TYPE_JSON": json.dumps(feedback_context["goalIntentType"], ensure_ascii=False),
    "ORIGINAL_GOAL_TEXT_JSON": json.dumps(prompt_original_goal_text, ensure_ascii=False),
    "OUTPUT_CONTRACT_JSON": json.dumps(_build_output_contract(), ensure_ascii=False, indent=2),
    "PROFILE_GENDER_JSON": json.dumps(feedback_context["profileGender"], ensure_ascii=False),
    "REQUEST_METADATA_JSON": json.dumps(metadata, ensure_ascii=False),
    "TOPIC_COUNT": str(len(FEEDBACK_TOPICS)),
    "TOPIC_ID_LIST": topic_id_list,
    "TOPIC_LABEL_LIST": topic_label_list,
    "USER_GOAL_TEXT_JSON": json.dumps(prompt_user_goal_text, ensure_ascii=False),
  }


class MakeupFeedbackBedrockService:
  def __init__(
    self,
    settings: Settings,
    *,
    system_prompt_path: Path | None = None,
    user_prompt_template_path: Path | None = None,
  ) -> None:
    self.settings = settings
    self.analysis_status = "bedrock_completed"
    self.system_prompt_path = system_prompt_path or SYSTEM_PROMPT_PATH
    self.user_prompt_template_path = user_prompt_template_path or USER_PROMPT_TEMPLATE_PATH

  def _s3_client(self):
    client_kwargs = {
      "region_name": self.settings.aws_region,
      "config": Config(connect_timeout=30, read_timeout=60, retries={"max_attempts": 1}),
    }

    if self.settings.aws_access_key_id and self.settings.aws_secret_access_key:
      client_kwargs.update(
        {
          "aws_access_key_id": self.settings.aws_access_key_id,
          "aws_secret_access_key": self.settings.aws_secret_access_key,
        },
      )

    return boto3.client("s3", **client_kwargs)

  def _bedrock_runtime_client(self):
    client_kwargs = {
      "region_name": self.settings.effective_bedrock_analysis_region,
      "config": Config(connect_timeout=30, read_timeout=180, retries={"max_attempts": 1}),
    }

    if self.settings.aws_access_key_id and self.settings.aws_secret_access_key:
      client_kwargs.update(
        {
          "aws_access_key_id": self.settings.aws_access_key_id,
          "aws_secret_access_key": self.settings.aws_secret_access_key,
        },
      )

    return boto3.client("bedrock-runtime", **client_kwargs)

  def _infer_content_type(self, payload: dict[str, Any]) -> str:
    content_type = payload.get("contentType") or payload.get("content_type")

    if isinstance(content_type, str) and content_type.startswith("image/"):
      return content_type

    object_key = _clean_text(payload.get("objectKey") or payload.get("object_key"))
    normalized = object_key.lower()

    if normalized.endswith(".png"):
      return "image/png"

    if normalized.endswith(".webp"):
      return "image/webp"

    return "image/jpeg"

  def _read_image_bytes(self, payload: dict[str, Any]) -> bytes:
    bucket = _clean_text(payload.get("bucket"))
    object_key = _clean_text(payload.get("objectKey") or payload.get("object_key")).lstrip("/")

    if not bucket or not object_key:
      raise AppError(400, "FEEDBACK_SOURCE_IMAGE_REQUIRED", "A feedback source image must be uploaded before analysis.")

    started_at = time.monotonic()
    logger.info("[aura:feedback-bedrock] image-read:start bucket=%s key=%s", bucket, object_key)
    image_object = self._s3_client().get_object(Bucket=bucket, Key=object_key)
    image_bytes = image_object["Body"].read()
    logger.info(
      "[aura:feedback-bedrock] image-read:success bytes=%s durationMs=%s",
      len(image_bytes),
      round((time.monotonic() - started_at) * 1000),
    )

    return image_bytes

  def _build_system_prompt(self) -> str:
    return render_prompt_template(
      self.system_prompt_path,
      {},
      required_placeholders=frozenset(),
    )

  def _build_prompt(self, payload: dict[str, Any]) -> str:
    return render_prompt_template(
      self.user_prompt_template_path,
      _build_user_prompt_values(payload),
      required_placeholders=USER_PROMPT_PLACEHOLDERS,
    )

  def _extract_output_text(self, response_payload: dict[str, Any]) -> str:
    content = response_payload.get("content")

    if isinstance(content, list):
      return "\n".join(
        str(part.get("text") or "")
        for part in content
        if isinstance(part, dict) and part.get("type") == "text"
      ).strip()

    completion = response_payload.get("completion")

    if isinstance(completion, str):
      return completion.strip()

    return ""

  def _parse_json_output(self, output_text: str) -> dict[str, Any]:
    normalized = output_text.strip()
    fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", normalized, re.DOTALL)

    if fence_match:
      normalized = fence_match.group(1).strip()

    try:
      parsed = json.loads(normalized)
    except json.JSONDecodeError as exc:
      raise AppError(502, "FEEDBACK_BEDROCK_OUTPUT_PARSE_FAILED", "Bedrock feedback analysis did not return valid JSON.") from exc

    if not isinstance(parsed, dict):
      raise AppError(502, "FEEDBACK_BEDROCK_OUTPUT_INVALID", "Bedrock feedback analysis returned an unexpected result shape.")

    return parsed

  def _analyze_sync(
    self,
    payload: dict[str, Any],
    vision_result: MakeupFeedbackVisionResult,
  ) -> dict[str, Any]:
    model_id = self.settings.effective_analysis_model_id

    if not model_id:
      raise AppError(503, "BEDROCK_ANALYSIS_NOT_CONFIGURED", "A Bedrock Claude model ID or inference profile ID is required.")

    selected_regions = _select_bedrock_regions(vision_result)
    content = [
      {"type": "text", "text": self._build_prompt(payload)},
      {
        "type": "text",
        "text": _build_vision_context_text(vision_result, selected_regions),
      },
      *_build_bedrock_region_content(selected_regions),
    ]
    guardrail_kwargs = build_bedrock_guardrail_invoke_kwargs(self.settings)

    if guardrail_kwargs:
      tag_suffix = secrets.token_hex(BEDROCK_GUARDRAIL_TAG_SUFFIX_BYTES)
      tag_name = f"{BEDROCK_GUARDRAIL_TAG_PREFIX}_{tag_suffix}"
      content.append(
        {
          "type": "text",
          "text": f"<{tag_name}>{BEDROCK_GUARDRAIL_VALIDATED_MARKER}</{tag_name}>",
        },
      )

    request_payload = {
      "anthropic_version": "bedrock-2023-05-31",
      "max_tokens": 6400,
      "temperature": 0.2,
      "system": self._build_system_prompt(),
      "messages": [{"role": "user", "content": content}],
    }

    if guardrail_kwargs:
      request_payload["amazon-bedrock-guardrailConfig"] = {"tagSuffix": tag_suffix}

    request_body = json.dumps(
      request_payload,
      ensure_ascii=False,
      separators=(",", ":"),
    )
    request_bytes = len(request_body.encode("utf-8"))

    if request_bytes >= BEDROCK_REQUEST_BODY_MAX_BYTES:
      raise AppError(
        500,
        "FEEDBACK_BEDROCK_REQUEST_TOO_LARGE",
        "The prepared makeup feedback request exceeds the Bedrock size limit.",
        {
          "requestBytes": request_bytes,
          "limitBytes": BEDROCK_REQUEST_BODY_MAX_BYTES,
        },
      )

    started_at = time.monotonic()
    logger.info(
      "[aura:feedback-bedrock] analyze:start model=%s region=%s requestBytes=%s regionNames=%s",
      model_id,
      self.settings.effective_bedrock_analysis_region,
      request_bytes,
      [name for name, _ in selected_regions],
    )
    response = self._bedrock_runtime_client().invoke_model(
      modelId=model_id,
      body=request_body,
      accept="application/json",
      contentType="application/json",
      **guardrail_kwargs,
    )
    response_payload = json.loads(response["body"].read())

    if response_payload.get("amazon-bedrock-guardrailAction") == "INTERVENED":
      logger.warning("[aura:feedback-bedrock] analyze:guardrail-intervened")
      raise AppError(
        502,
        "FEEDBACK_BEDROCK_GUARDRAIL_INTERVENED",
        "Bedrock guardrail intervened during feedback analysis.",
      )

    if response_payload.get("stop_reason") == "max_tokens":
      raise AppError(
        502,
        "FEEDBACK_BEDROCK_OUTPUT_TRUNCATED",
        "Bedrock feedback analysis stopped before the response was complete.",
      )
    output_text = self._extract_output_text(response_payload)

    if not output_text:
      raise AppError(502, "FEEDBACK_BEDROCK_EMPTY_OUTPUT", "Bedrock feedback analysis returned an empty response.")

    parsed = self._parse_json_output(output_text)
    parsed["captureQuality"] = _capture_quality_for_model_result(parsed, vision_result)
    logger.info(
      "[aura:feedback-bedrock] analyze:success durationMs=%s",
      round((time.monotonic() - started_at) * 1000),
    )

    normalized_result = normalize_makeup_feedback_result(parsed, payload)
    return _attach_vision_evidence(normalized_result, vision_result, selected_regions)

  async def analyze(self, payload: dict[str, Any]) -> dict[str, Any]:
    self.analysis_status = "bedrock_completed"
    _get_feedback_context(payload)
    image_bytes = await asyncio.to_thread(self._read_image_bytes, payload)

    try:
      processed = await asyncio.to_thread(process_image_bytes, image_bytes)
    except MediaPostprocessError as exc:
      raise AppError(
        400,
        "FEEDBACK_SOURCE_IMAGE_INVALID",
        "The feedback source image is invalid or unsupported.",
      ) from exc

    logger.info(
      "[aura:feedback-bedrock] image-sanitize:success bytes=%s->%s contentType=%s exifRemoved=%s",
      len(image_bytes),
      len(processed.body),
      processed.content_type,
      processed.exif_removed,
    )

    try:
      vision_result = await asyncio.to_thread(
        prepare_makeup_feedback_vision,
        processed.body,
      )
    except MakeupFeedbackVisionError as exc:
      raise AppError(
        400,
        "FEEDBACK_SOURCE_IMAGE_INVALID",
        "The feedback source image is invalid or unsupported.",
      ) from exc

    logger.info(
      "[aura:feedback-bedrock] vision:complete detectorAvailable=%s faceCount=%s hardRetake=%s issues=%s regionNames=%s",
      vision_result.detector_available,
      vision_result.face_count,
      vision_result.hard_retake,
      [issue.code for issue in vision_result.quality_issues],
      list(vision_result.regions),
    )

    if vision_result.hard_retake:
      self.analysis_status = "vision_retake_required"
      logger.info("[aura:feedback-bedrock] vision:retake-required bedrockSkipped=true")
      return _build_vision_retake_result(vision_result)

    return await asyncio.to_thread(
      self._analyze_sync,
      payload,
      vision_result,
    )

async def build_makeup_feedback_result_for_request(
  payload: dict[str, Any],
  settings: Settings,
) -> tuple[dict[str, Any], str, dict[str, Any] | None]:
  if settings.analysis_provider != "bedrock":
    raise AppError(
      503,
      "FEEDBACK_ANALYSIS_PROVIDER_UNSUPPORTED",
      "Makeup feedback analysis requires the Bedrock provider.",
      {"provider": settings.analysis_provider},
    )

  service = MakeupFeedbackBedrockService(settings)

  try:
    result = await service.analyze(payload)
    return result, service.analysis_status, None
  except AppError as exc:
    logger.warning("[aura:feedback-bedrock] analyze:app-error code=%s details=%s", exc.code, exc.details)
    raise
  except (BotoCoreError, ClientError) as exc:
    logger.warning("[aura:feedback-bedrock] analyze:aws-error reason=%s message=%s", exc.__class__.__name__, str(exc))
    raise AppError(
      502,
      "FEEDBACK_BEDROCK_INVOCATION_FAILED",
      "Bedrock makeup feedback analysis failed.",
      {"reason": exc.__class__.__name__},
    ) from exc
  except Exception as exc:  # noqa: BLE001 - convert unexpected worker errors into a stable failure payload.
    logger.exception("[aura:feedback-bedrock] analyze:failed")
    raise AppError(
      502,
      "FEEDBACK_BEDROCK_FAILED",
      "Makeup feedback analysis failed.",
      {"reason": exc.__class__.__name__},
    ) from exc
