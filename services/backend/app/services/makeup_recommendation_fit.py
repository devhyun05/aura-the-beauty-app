from __future__ import annotations

import colorsys
from copy import deepcopy
from typing import Any, Literal

from app.services.makeup_recommendation_match import attach_match_assessment


GenerationSource = Literal["claude", "deterministic_fallback"]

FIT_SCORING_VERSION = "makeup-fit-v1"
LOOK_MAP_VERSION = "makeup-look-map-v1"
IMAGE_FIT_VALIDATION_VERSION = "makeup-image-fit-v1"
FIT_DIMENSION_WEIGHTS = {
  "situation": 25,
  "preference": 20,
  "personalColor": 20,
  "faceStructure": 15,
  "skinCompatibility": 10,
  "lookCoherence": 10,
}
FIT_EVIDENCE_SOURCES = {
  "situation": "situation",
  "preference": "preference",
  "personalColor": "personal_color",
  "faceStructure": "face_structure",
  "skinCompatibility": "skin_type",
  "lookCoherence": "look_coherence",
}
FALLBACK_DIMENSION_SCORES = {
  "situation": 72,
  "preference": 64,
  "personalColor": 58,
  "faceStructure": 48,
  "skinCompatibility": 52,
  "lookCoherence": 72,
}
FALLBACK_DIMENSION_REASONS = {
  "situation": "\uc120\ud0dd \uc0c1\ud669\uc744 \uc81c\ubaa9\u00b7\uc694\uc57d\u00b7\ubd80\uc704\ubcc4 \uc774\uc720\uc5d0 \uc5f0\uacb0\ud588\uc9c0\ub9cc \uc815\ubc00 \ubaa8\ub378 \ud3c9\uac00 \uc5c6\uc774 \ubcf4\uc218\uc801\uc73c\ub85c \uc0b0\uc815\ud588\uc2b5\ub2c8\ub2e4.",
  "preference": "\uc9c1\uc811 \uc785\ub825\uacfc \uc5ed\uc9c8\ubb38 \ub2f5\ubcc0\uc744 \ubc18\uc601 \uc870\uac74\uc73c\ub85c \ubcf4\uc874\ud588\uc9c0\ub9cc \uc138\ubd80 \uc120\ud638 \ucd5c\uc801\ud654\ub294 \uc81c\ud55c\ub418\uc5b4 \ubcf4\uc218\uc801\uc73c\ub85c \uc0b0\uc815\ud588\uc2b5\ub2c8\ub2e4.",
  "personalColor": "\ud37c\uc2a4\ub110\uceec\ub7ec \uadfc\uac70\ub97c \ubcf4\uc874\ud588\uc9c0\ub9cc fallback \uace0\uc815 \ud314\ub808\ud2b8\uc758 \uc815\ubc00 \uc0c9\uc0c1 \ucd5c\uc801\ud654\ub294 \uc81c\ud55c\ub418\uc5b4 \ubcf4\uc218\uc801\uc73c\ub85c \uc0b0\uc815\ud588\uc2b5\ub2c8\ub2e4.",
  "faceStructure": "\uc5bc\uad74\ud615\u00b7\uad6c\uc870 \uadfc\uac70\ub97c \ubcf4\uc874\ud588\uc9c0\ub9cc fallback\uc758 \ubd80\uc704\ubcc4 \uae30\ud558 \ubcf4\uc815\uc740 \uc81c\ud55c\ub418\uc5b4 \ubcf4\uc218\uc801\uc73c\ub85c \uc0b0\uc815\ud588\uc2b5\ub2c8\ub2e4.",
  "skinCompatibility": "\ud53c\ubd80 \ud0c0\uc785 \uadfc\uac70\ub97c \ubcf4\uc874\ud588\uc9c0\ub9cc \uc81c\ud615 \uc801\ud569\uc131\uc744 \uc815\ubc00 \ubaa8\ub378\uc774 \uc7ac\ud3c9\uac00\ud558\uc9c0 \uc54a\uc544 \ubcf4\uc218\uc801\uc73c\ub85c \uc0b0\uc815\ud588\uc2b5\ub2c8\ub2e4.",
  "lookCoherence": "\uc774\ubbf8\uc9c0 \ube0c\ub9ac\ud504\uc640 \ubd80\uc704\ubcc4 \uc0c9\u00b7\uc9c8\uac10\uc758 \ub0b4\ubd80 \uc77c\uad00\uc131\uc744 \uc11c\ubc84 \uaddc\uce59\uc73c\ub85c \ud655\uc778\ud588\uc2b5\ub2c8\ub2e4.",
}


def _object(value: Any) -> dict[str, Any]:
  return value if isinstance(value, dict) else {}


def _clean(value: Any, limit: int) -> str:
  return " ".join(str(value or "").split())[:limit]


def _first_nonempty(*values: tuple[str, Any] | None) -> tuple[str, str] | None:
  for item in values:
    if item is None:
      continue
    path, value = item
    cleaned = _clean(value, 160)
    if cleaned:
      return path, cleaned
  return None


def _answer_descriptor(
  answers: list[dict[str, Any]],
  questions: list[dict[str, Any]],
) -> tuple[str, str] | None:
  question_by_id = {
    str(question.get("id") or ""): question
    for question in questions
    if isinstance(question, dict)
  }
  for index, answer in enumerate(answers):
    if not isinstance(answer, dict):
      continue
    for key in ("optionLabel", "freeText", "additionalConstraints", "label"):
      value = _clean(answer.get(key), 160)
      if value:
        return f"answers[{index}].{key}", value
    option_id = _clean(answer.get("optionId"), 160)
    question_id = _clean(answer.get("questionId"), 160)
    if option_id and question_id:
      question = _object(question_by_id.get(question_id))
      option = next(
        (
          item
          for item in question.get("options", [])
          if isinstance(item, dict) and _clean(item.get("id"), 160) == option_id
        ),
        None,
      )
      option_label = _clean(_object(option).get("label"), 160)
      if option_label:
        return f"questions[{question_id}].options[{option_id}].label", option_label
    if option_id:
      return f"answers[{index}].optionId", option_id
  return None


def _palette_label(value: dict[str, Any]) -> str:
  tone = _object(value.get("tone"))
  return _clean(tone.get("topLabel") or tone.get("topCode") or value.get("source"), 160)


def _dimension_descriptors(
  context_snapshot: dict[str, Any],
  answers: list[dict[str, Any]],
  questions: list[dict[str, Any]],
  look: dict[str, Any],
) -> dict[str, tuple[str, str] | None]:
  analysis = _object(context_snapshot.get("analysisReport"))
  selection = _object(context_snapshot.get("selection"))
  normalized_custom = _object(selection.get("normalizedCustom"))
  measurement_insights = _object(analysis.get("measurementInsights"))
  measured_color = _object(measurement_insights.get("personalColor"))
  face_structure = _object(measurement_insights.get("faceStructure"))

  situation = _first_nonempty(
    ("context.selection.keyword.label", _object(selection.get("keyword")).get("label")),
    ("context.selection.customSituationLabel", selection.get("customSituationLabel")),
    ("context.selection.customSituationText", selection.get("customSituationText")),
    ("context.selection.situation.label", _object(selection.get("situation")).get("label")),
    ("context.selection.normalizedCustom.situationIntent", normalized_custom.get("situationIntent")),
    ("context.selection.editorialPreset.label", _object(selection.get("editorialPreset")).get("label")),
  )
  preference = _answer_descriptor(answers, questions) or _first_nonempty(
    ("context.selection.normalizedCustom.desiredImpression", normalized_custom.get("desiredImpression")),
    ("context.selection.normalizedCustom.constraints", ", ".join(
      _clean(item, 80)
      for item in normalized_custom.get("constraints", [])[:6]
      if _clean(item, 80)
    ) if isinstance(normalized_custom.get("constraints"), list) else None),
  )
  personal_color = _first_nonempty(
    ("context.analysisReport.personalColor", analysis.get("personalColor")),
    (
      "context.analysisReport.measurementInsights.personalColor.tone",
      _palette_label(measured_color) if measured_color.get("usable") is True else None,
    ),
  )
  face = _first_nonempty(
    ("context.analysisReport.faceShape", analysis.get("faceShape")),
    (
      "context.analysisReport.measurementInsights.faceStructure.actionableGuidance",
      "\ud488\uc9c8 \ud1b5\uacfc \uc5bc\uad74 \uad6c\uc870 \ud589\ub3d9 \uac00\uc774\ub4dc" if face_structure.get("usable") is True else None,
    ),
  )
  skin = _first_nonempty(
    ("context.analysisReport.skinType", analysis.get("skinType")),
    ("context.analysisReport.skinAnalysisSummary", analysis.get("skinAnalysisSummary")),
  )
  guides = look.get("areaGuides") if isinstance(look.get("areaGuides"), list) else []
  coherence = (
    "look.imageBrief+look.areaGuides[*].color+texture",
    "\ucd94\ucc9c \uc774\ubbf8\uc9c0 \ube0c\ub9ac\ud504\uc640 5\uac1c \ubd80\uc704 \uc0c9\uc0c1\u00b7\uc9c8\uac10",
  ) if len(guides) >= 5 else None
  return {
    "situation": situation,
    "preference": preference,
    "personalColor": personal_color,
    "faceStructure": face,
    "skinCompatibility": skin,
    "lookCoherence": coherence,
  }


def compute_fit_overall_score(
  dimensions: dict[str, dict[str, Any]],
  *,
  generation_source: GenerationSource,
) -> int:
  weighted_sum = 0.0
  available_weight = 0
  for key, weight in FIT_DIMENSION_WEIGHTS.items():
    dimension = _object(dimensions.get(key))
    score = dimension.get("score")
    if dimension.get("available") is not True or isinstance(score, bool) or not isinstance(score, (int, float)):
      continue
    if not 0 <= float(score) <= 100:
      continue
    weighted_sum += float(score) * weight
    available_weight += weight
  overall = round(weighted_sum / available_weight) if available_weight else 0
  if generation_source == "deterministic_fallback":
    return min(74, overall)
  return max(0, min(100, overall))


def _bounded_score(value: float) -> int:
  return max(0, min(100, round(value)))


def _normalized_box(value: Any) -> dict[str, float] | None:
  box = _object(value)
  coordinates: dict[str, float] = {}
  for key in ("left", "top", "right", "bottom"):
    coordinate = box.get(key)
    if isinstance(coordinate, bool) or not isinstance(coordinate, (int, float)):
      return None
    coordinates[key] = float(coordinate)
  if (
    not 0 <= coordinates["left"] < coordinates["right"] <= 1
    or not 0 <= coordinates["top"] < coordinates["bottom"] <= 1
  ):
    return None
  return coordinates


def _normalized_point(value: Any) -> dict[str, float] | None:
  point = _object(value)
  coordinates: dict[str, float] = {}
  for key in ("x", "y"):
    coordinate = point.get(key)
    if isinstance(coordinate, bool) or not isinstance(coordinate, (int, float)):
      return None
    coordinates[key] = float(coordinate)
  if not all(0 <= coordinate <= 1 for coordinate in coordinates.values()):
    return None
  return coordinates


def _valid_crop_area_count(crop_metadata: Any) -> int:
  areas = _object(_object(crop_metadata).get("areas"))
  valid_count = 0
  for area in ("base", "brow", "eye", "cheek", "lip"):
    regions = areas.get(area)
    if not isinstance(regions, list) or not regions:
      continue
    if all(
      isinstance(region, dict) and _normalized_box(region.get("box")) is not None
      for region in regions
    ):
      valid_count += 1
  return valid_count


def _alignment_geometry_score(alignment_metadata: Any) -> int | None:
  alignment = _object(alignment_metadata)
  source = _object(alignment.get("source"))
  generated = _object(alignment.get("generated"))
  source_box = _normalized_box(source.get("faceBox"))
  generated_box = _normalized_box(generated.get("faceBox"))
  source_eyes = _object(source.get("eyeCenters"))
  generated_eyes = _object(generated.get("eyeCenters"))
  source_left_eye = _normalized_point(source_eyes.get("imageLeft"))
  source_right_eye = _normalized_point(source_eyes.get("imageRight"))
  generated_left_eye = _normalized_point(generated_eyes.get("imageLeft"))
  generated_right_eye = _normalized_point(generated_eyes.get("imageRight"))
  source_roll = source.get("rollDeg")
  generated_roll = generated.get("rollDeg")
  if (
    source_box is None
    or generated_box is None
    or source_left_eye is None
    or source_right_eye is None
    or generated_left_eye is None
    or generated_right_eye is None
    or isinstance(source_roll, bool)
    or not isinstance(source_roll, (int, float))
    or isinstance(generated_roll, bool)
    or not isinstance(generated_roll, (int, float))
  ):
    return None

  source_center = (
    (source_box["left"] + source_box["right"]) / 2,
    (source_box["top"] + source_box["bottom"]) / 2,
  )
  generated_center = (
    (generated_box["left"] + generated_box["right"]) / 2,
    (generated_box["top"] + generated_box["bottom"]) / 2,
  )
  center_distance = (
    (source_center[0] - generated_center[0]) ** 2
    + (source_center[1] - generated_center[1]) ** 2
  ) ** 0.5
  center_score = max(0.0, 100 - center_distance * 400)

  source_width = source_box["right"] - source_box["left"]
  source_height = source_box["bottom"] - source_box["top"]
  generated_width = generated_box["right"] - generated_box["left"]
  generated_height = generated_box["bottom"] - generated_box["top"]
  width_ratio_error = abs(generated_width / source_width - 1)
  height_ratio_error = abs(generated_height / source_height - 1)
  size_score = max(0.0, 100 - (width_ratio_error + height_ratio_error) * 180)

  source_eye_distance = (
    (source_right_eye["x"] - source_left_eye["x"]) ** 2
    + (source_right_eye["y"] - source_left_eye["y"]) ** 2
  ) ** 0.5
  generated_eye_distance = (
    (generated_right_eye["x"] - generated_left_eye["x"]) ** 2
    + (generated_right_eye["y"] - generated_left_eye["y"]) ** 2
  ) ** 0.5
  eye_score = (
    max(0.0, 100 - abs(generated_eye_distance / source_eye_distance - 1) * 220)
    if source_eye_distance > 0
    else 0.0
  )
  roll_score = max(0.0, 100 - abs(float(generated_roll) - float(source_roll)) * 6.7)
  return _bounded_score(
    center_score * 0.35
    + size_score * 0.35
    + eye_score * 0.2
    + roll_score * 0.1,
  )


def build_post_image_fit_assessment(
  look: dict[str, Any],
  *,
  generation_source: GenerationSource,
  image_status: str,
  provenance: Any,
) -> dict[str, Any] | None:
  """Replace plan-only coherence with evidence from the generated image asset.

  MediaPipe-derived metadata can verify face detection and geometry, but it does
  not verify that requested makeup colors or textures appear in the pixels.
  """

  assessment = _object(look.get("fitAssessment"))
  dimensions = deepcopy(_object(assessment.get("dimensions")))
  if image_status != "completed" or "lookCoherence" not in dimensions:
    return None

  asset_provenance = _object(provenance)
  previous_dimension = _object(dimensions.get("lookCoherence"))
  previous_validation = _object(assessment.get("imageValidation"))
  previous_score = previous_dimension.get("score")
  saved_plan_score = previous_validation.get("planScore")
  plan_score = (
    float(saved_plan_score)
    if (
      not isinstance(saved_plan_score, bool)
      and isinstance(saved_plan_score, (int, float))
      and 0 <= float(saved_plan_score) <= 100
    )
    else (
      float(previous_score)
      if (
        previous_dimension.get("available") is True
        and not isinstance(previous_score, bool)
        and isinstance(previous_score, (int, float))
        and 0 <= float(previous_score) <= 100
      )
      else 50.0
    )
  )
  has_dimensions = (
    isinstance(asset_provenance.get("width"), int)
    and asset_provenance.get("width", 0) > 0
    and isinstance(asset_provenance.get("height"), int)
    and asset_provenance.get("height", 0) > 0
  )
  valid_crop_areas = _valid_crop_area_count(asset_provenance.get("cropMetadata"))
  crop_coverage = valid_crop_areas / 5
  geometry_score = _alignment_geometry_score(asset_provenance.get("alignmentMetadata"))
  semantic_metadata = _object(asset_provenance.get("semanticColorMetadata"))
  raw_semantic_score = semantic_metadata.get("score")
  semantic_area_count = semantic_metadata.get("validAreaCount")
  semantic_verified = (
    semantic_metadata.get("status") == "completed"
    and not isinstance(raw_semantic_score, bool)
    and isinstance(raw_semantic_score, (int, float))
    and 0 <= float(raw_semantic_score) <= 100
    and isinstance(semantic_area_count, int)
    and not isinstance(semantic_area_count, bool)
    and semantic_area_count >= 3
    and valid_crop_areas >= 3
  )
  semantic_score = (
    _bounded_score(float(raw_semantic_score))
    if semantic_verified
    else None
  )
  raw_generation_attempt = asset_provenance.get("generationAttempt")
  generation_attempt = (
    raw_generation_attempt
    if isinstance(raw_generation_attempt, int) and not isinstance(raw_generation_attempt, bool) and raw_generation_attempt > 0
    else None
  )

  technical_score = 60.0
  if has_dimensions:
    technical_score += 10
  technical_score += crop_coverage * 10
  validation_source = "generated_asset"
  if semantic_verified:
    if geometry_score is not None:
      technical_score += geometry_score * 0.2
    validation_source = "generated_semantic_color"
    coherence_score = _bounded_score(
      plan_score * 0.30
      + technical_score * 0.25
      + float(semantic_score) * 0.45
    )
    reason = (
      f"생성 이미지의 MediaPipe 얼굴 부위 {semantic_area_count}/5개에서 실제 색상·채도·명도를 읽어 "
      f"부위별 레시피 색과 LOOK MAP 색상 좌표를 비교했습니다(색상 일치 {semantic_score}점). "
      "질감·블렌딩·제품 동일성은 이 검증 범위에 포함하지 않습니다."
    )
    label = "생성 이미지 실제 색상·채도·명도 + 얼굴 부위 검증"
  elif geometry_score is not None:
    technical_score += geometry_score * 0.2
    validation_source = "source_generated_alignment"
    coherence_score = _bounded_score(plan_score * 0.45 + technical_score * 0.55)
    reason = (
      "생성된 실제 이미지의 저장·디코딩 완료와 MediaPipe 얼굴 부위 검출, 원본과 생성본의 얼굴 중심·크기·눈 간격·기울기 정렬을 확인했습니다. "
      "색상·질감이 이미지 픽셀에 정확히 구현됐는지는 별도 비전 모델로 판정하지 않았습니다."
    )
    label = "생성 이미지 실제 자산 + MediaPipe 얼굴 정렬 검증"
  elif valid_crop_areas:
    validation_source = "generated_face_metadata"
    coherence_score = _bounded_score(plan_score * 0.65 + technical_score * 0.35)
    reason = (
      f"생성된 실제 이미지의 저장·디코딩 완료와 MediaPipe 얼굴 부위 {valid_crop_areas}/5개 검출을 확인했습니다. "
      "원본 얼굴과의 정렬 및 색상·질감 구현은 이 검증에서 판정하지 않았습니다."
    )
    label = "생성 이미지 실제 자산 + MediaPipe 얼굴 부위 검출"
  else:
    coherence_score = _bounded_score(plan_score * 0.75 + technical_score * 0.25)
    reason = (
      "생성된 실제 이미지가 정상 저장·디코딩된 사실만 확인했습니다. MediaPipe 얼굴 검출을 사용할 수 없어 얼굴 정렬과 메이크업 색상·질감 구현은 판정하지 않았습니다."
    )
    label = "생성 이미지 실제 자산 완료 · MediaPipe 검증 불가"

  dimensions["lookCoherence"] = {
    "available": True,
    "score": coherence_score,
    "reason": reason,
  }
  evidence = [
    deepcopy(item)
    for item in assessment.get("evidence", [])
    if isinstance(item, dict) and item.get("source") != "look_coherence"
  ]
  evidence.append({
    "source": "look_coherence",
    "label": label,
    "reason": f"imageAsset.provenance 실제 생성 결과 근거: {reason}",
  })
  updated = {
    **assessment,
    "scoringVersion": FIT_SCORING_VERSION,
    "dimensions": dimensions,
    "evidence": evidence,
    "imageValidation": {
      "version": IMAGE_FIT_VALIDATION_VERSION,
      "stage": "post_image",
      "validationSource": validation_source,
      "assetStatus": "completed",
      "actualAssetVerified": True,
      "validCropAreaCount": valid_crop_areas,
      "cropAreaCount": 5,
      "geometryScore": geometry_score,
      "planScore": _bounded_score(plan_score),
      "technicalScore": _bounded_score(technical_score),
      "generationAttempt": generation_attempt,
      "semanticMakeupVerified": semantic_verified,
      "limitation": "추가 비전 모델 호출 없이 자산 상태와 MediaPipe 얼굴 기하 메타데이터만 검증했습니다.",
    },
  }
  if semantic_verified:
    semantic_limitation = str(
      semantic_metadata.get("limitation")
      or "색상·채도·명도만 검증했으며 질감과 블렌딩은 검증하지 않았습니다."
    )
    updated["imageValidation"].update({
      "semanticColorVersion": semantic_metadata.get("version"),
      "semanticColorScore": semantic_score,
      "semanticAreaCount": semantic_area_count,
      "semanticBaselineCompared": False,
      "semanticAreaScores": [
        {"area": item.get("area"), "score": item.get("score")}
        for item in semantic_metadata.get("areas", [])
        if isinstance(item, dict)
      ],
      "verifiedSignals": semantic_metadata.get("verifiedSignals", []),
      "lookMapColorScore": semantic_metadata.get("lookMapColorScore"),
      "actualLookMapColorProjection": semantic_metadata.get(
        "actualLookMapColorProjection"
      ),
      "textureVerified": False,
      "limitation": semantic_limitation,
    })
  updated["overallScore"] = compute_fit_overall_score(
    dimensions,
    generation_source=generation_source,
  )
  return updated


def _fit_assessment(
  raw_assessment: Any,
  context_snapshot: dict[str, Any],
  answers: list[dict[str, Any]],
  questions: list[dict[str, Any]],
  look: dict[str, Any],
  *,
  generation_source: GenerationSource,
) -> dict[str, Any]:
  raw_dimensions = _object(_object(raw_assessment).get("dimensions"))
  descriptors = _dimension_descriptors(context_snapshot, answers, questions, look)
  dimensions: dict[str, dict[str, Any]] = {}
  evidence: list[dict[str, str]] = []

  for key in FIT_DIMENSION_WEIGHTS:
    descriptor = descriptors[key]
    if descriptor is None:
      dimensions[key] = {
        "available": False,
        "score": None,
        "reason": "\ud604\uc7ac \ucd94\ucc9c \uc785\ub825\uc5d0 \uc774 \uc801\ud569\ub3c4 \ucd95\uc744 \ud3c9\uac00\ud560 \uadfc\uac70\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.",
      }
      continue

    if generation_source == "deterministic_fallback":
      score: Any = FALLBACK_DIMENSION_SCORES[key]
      reason = FALLBACK_DIMENSION_REASONS[key]
    else:
      raw_dimension = _object(raw_dimensions.get(key))
      raw_score = raw_dimension.get("score")
      score = (
        raw_score
        if (
          not isinstance(raw_score, bool)
          and isinstance(raw_score, (int, float))
          and 0 <= float(raw_score) <= 100
        )
        else FALLBACK_DIMENSION_SCORES[key]
      )
      reason = _clean(raw_dimension.get("reason"), 400) or FALLBACK_DIMENSION_REASONS[key]

    path, label = descriptor
    dimensions[key] = {"available": True, "score": score, "reason": reason}
    evidence.append({
      "source": FIT_EVIDENCE_SOURCES[key],
      "label": label,
      "reason": _clean(f"{path} \uadfc\uac70: {reason}", 500),
    })

  return {
    "scoringVersion": FIT_SCORING_VERSION,
    "overallScore": compute_fit_overall_score(dimensions, generation_source=generation_source),
    "dimensions": dimensions,
    "evidence": evidence,
  }


def _hex_rgb(value: Any) -> tuple[float, float, float] | None:
  text = _clean(value, 7)
  if len(text) != 7 or not text.startswith("#"):
    return None
  try:
    return tuple(int(text[index:index + 2], 16) / 255 for index in (1, 3, 5))
  except ValueError:
    return None


def derive_deterministic_look_map(
  look: dict[str, Any],
  context_snapshot: dict[str, Any],
) -> dict[str, Any]:
  colors: list[tuple[float, float, float]] = []
  textures: list[str] = []
  for guide in look.get("areaGuides", []):
    if not isinstance(guide, dict):
      continue
    rgb = _hex_rgb(_object(guide.get("color")).get("hex"))
    if rgb is not None:
      colors.append(rgb)
    texture = _clean(guide.get("texture"), 80).casefold()
    if texture:
      textures.append(texture)

  hsv = [colorsys.rgb_to_hsv(*rgb) for rgb in colors]
  average_saturation = sum(item[1] for item in hsv) / len(hsv) if hsv else 0.35
  average_darkness = sum(1 - item[2] for item in hsv) / len(hsv) if hsv else 0.25
  value_spread = (max((item[2] for item in hsv), default=0.5) - min((item[2] for item in hsv), default=0.5))
  texture_text = " ".join(textures)
  expressive_texture = sum(token in texture_text for token in ("\uc26c\uba38", "\uae00\ub9ac\ud130", "\uba54\ud0c8", "\ubca8\ubcb3", "\uc120\uba85", "\ub525"))
  glam_texture = sum(token in texture_text for token in ("\uae00\ub85c\uc6b0", "\uc26c\uba38", "\uc0c8\ud2f4", "\ubca8\ubcb3", "\uad11"))

  selection = _object(context_snapshot.get("selection"))
  situation_text = " ".join(
    _clean(value, 100).casefold()
    for value in (
      _object(selection.get("situation")).get("label"),
      _object(selection.get("keyword")).get("label"),
      selection.get("customSituationText"),
      selection.get("customSituationLabel"),
    )
    if _clean(value, 100)
  )
  formal_bonus = 10 if any(token in situation_text for token in ("\uba74\uc811", "\ubc1c\ud45c", "\uc6e8\ub529", "\uacb0\ud63c", "\ud589\uc0ac", "\ud30c\ud2f0")) else 0

  personality = round(12 + average_saturation * 58 + value_spread * 18 + min(12, expressive_texture * 4))
  glam = round(14 + average_darkness * 30 + min(24, glam_texture * 5) + formal_bonus)
  personality = max(0, min(100, personality))
  glam = max(0, min(100, glam))
  saturation_label = "\ub192\uc740" if average_saturation >= 0.55 else "\uc911\uac04" if average_saturation >= 0.32 else "\ub0ae\uc740"
  return {
    "version": LOOK_MAP_VERSION,
    "naturalityToPersonality": personality,
    "casualToGlam": glam,
    "rationale": (
      f"5\uac1c \ubd80\uc704\uc758 {saturation_label} \ud3c9\uade0 \ucc44\ub3c4, \uba85\ub3c4 \ub300\ube44, {len(textures)}\uac1c \uc9c8\uac10 \ud45c\ud604\uacfc "
      "\uc120\ud0dd \uc0c1\ud669\uc744 \uc11c\ubc84 \uaddc\uce59\uc73c\ub85c \uacc4\uc0b0\ud55c \uc704\uce58\uc785\ub2c8\ub2e4."
    ),
  }


def finalize_recommendation_metadata(
  recommendation: dict[str, Any],
  context_snapshot: dict[str, Any],
  answers: list[dict[str, Any]],
  questions: list[dict[str, Any]] | None = None,
  *,
  generation_source: GenerationSource,
) -> dict[str, Any]:
  finalized = deepcopy(recommendation)
  finalized["generationSource"] = generation_source
  looks = finalized.get("looks") if isinstance(finalized.get("looks"), list) else []
  finalized_looks: list[Any] = []
  for raw_look in looks:
    if not isinstance(raw_look, dict):
      finalized_looks.append(raw_look)
      continue
    look = dict(raw_look)
    if generation_source == "deterministic_fallback" or not isinstance(look.get("lookMap"), dict):
      look["lookMap"] = derive_deterministic_look_map(look, context_snapshot)
    else:
      look_map = _object(look.get("lookMap"))
      look["lookMap"] = {**look_map, "version": LOOK_MAP_VERSION}
    look["fitAssessment"] = _fit_assessment(
      look.get("fitAssessment"),
      context_snapshot,
      answers,
      questions or [],
      look,
      generation_source=generation_source,
    )
    finalized_looks.append(look)
  finalized["looks"] = finalized_looks
  return attach_match_assessment(
    finalized,
    context_snapshot,
    answers,
    questions or [],
    generation_source=generation_source,
  )
