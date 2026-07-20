"""Beard simulation contracts (v1) — Python mirror.

Source of truth lives next to the mobile feature:
apps/mobile/src/features/beard-simulation/contracts/types.ts (+ validate.ts).
Both sides are validated against the shared fixtures in that package's
fixtures/ directory. Keep validation semantics identical when editing.
"""

from __future__ import annotations

import re
from typing import Any

STAGES = ("mild", "medium", "strong")
REGIONS = ("mustache", "chin", "mouth_side", "jaw")
SHAVING_STATES = ("clean", "stubble", "short", "dense")
GOALS = ("shadow_reduction", "density_reduction", "full_visualization")
MASK_ENCODING = "png-gray8"
MASK_KEYS = ("hardHair", "beardShadow", "protect", "softBlend")

# Max tolerated hair/shadow intrusion into the protect mask before pre-reject.
PROTECT_OVERLAP_REJECT_RATIO = 0.02

_SURVEY_ALLOWED_KEYS = {
    "shavingState",
    "goal",
    "concernRegions",
    "shavingFrequencyPerWeek",
    "makeupCoverUsed",
    "consultPlanned",
}

# Data policy: no health information may enter the survey schema.
_FORBIDDEN_KEY_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in (
        r"irritat",
        r"trouble",
        r"allerg",
        r"sensitiv",
        r"skin.?condition",
        r"medical",
    )
]

# Consult questions must never phrase device/procedure recommendations.
FORBIDDEN_CONSULT_PATTERNS = [
    re.compile(r"추천(합니다|드립니다|해\s*드)"),
    re.compile(r"효과가?\s*(확실|보장)"),
    re.compile(r"보장"),
    re.compile(r"가장\s*좋은\s*(레이저|기기|시술)\s*(은|는)\s*[^?]*(입니다|예요|이에요)"),
]


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _in_unit_range(value: Any) -> bool:
    return _is_number(value) and 0 <= value <= 1


def validate_survey(survey: Any) -> tuple[bool, list[str]]:
    errors: list[str] = []
    if not isinstance(survey, dict):
        return False, ["survey must be an object"]

    for key in survey:
        if key not in _SURVEY_ALLOWED_KEYS:
            errors.append(f'survey has unknown key "{key}" (schema is closed)')
        if any(p.search(key) for p in _FORBIDDEN_KEY_PATTERNS):
            errors.append(f'survey key "{key}" looks like health data — forbidden')

    if survey.get("shavingState") not in SHAVING_STATES:
        errors.append(f"invalid shavingState: {survey.get('shavingState')}")
    if survey.get("goal") not in GOALS:
        errors.append(f"invalid goal: {survey.get('goal')}")
    regions = survey.get("concernRegions")
    if not isinstance(regions, list):
        errors.append("concernRegions must be an array")
    else:
        errors.extend(
            f"invalid concernRegion: {region}" for region in regions if region not in REGIONS
        )
    freq = survey.get("shavingFrequencyPerWeek")
    if not _is_number(freq) or not 0 <= freq <= 21:
        errors.append("shavingFrequencyPerWeek must be a number in [0, 21]")
    if not isinstance(survey.get("makeupCoverUsed"), bool):
        errors.append("makeupCoverUsed must be boolean")
    if not isinstance(survey.get("consultPlanned"), bool):
        errors.append("consultPlanned must be boolean")

    return len(errors) == 0, errors


def validate_request(request: Any) -> tuple[bool, list[str]]:
    errors: list[str] = []
    if not isinstance(request, dict):
        return False, ["request must be an object"]
    if not isinstance(request.get("requestId"), str) or not request["requestId"]:
        errors.append("requestId must be a non-empty string")
    if not isinstance(request.get("photoRef"), str) or not request["photoRef"]:
        errors.append("photoRef must be a non-empty string")
    stages = request.get("stages")
    if not isinstance(stages, list) or not stages:
        errors.append("stages must be a non-empty array")
    else:
        errors.extend(f"invalid stage: {stage}" for stage in stages if stage not in STAGES)
    errors.extend(validate_survey(request.get("survey"))[1])
    return len(errors) == 0, errors


def validate_mask_package(pkg: Any) -> tuple[bool, list[str]]:
    errors: list[str] = []
    if not isinstance(pkg, dict):
        return False, ["maskPackage must be an object"]
    if not _is_number(pkg.get("imageWidth")) or pkg["imageWidth"] <= 0:
        errors.append("imageWidth must be a positive number")
    if not _is_number(pkg.get("imageHeight")) or pkg["imageHeight"] <= 0:
        errors.append("imageHeight must be a positive number")
    if pkg.get("encoding") != MASK_ENCODING:
        errors.append(f'encoding must be "{MASK_ENCODING}", got {pkg.get("encoding")}')
    masks = pkg.get("masks")
    if not isinstance(masks, dict):
        errors.append("masks must be an object")
    else:
        for key in MASK_KEYS:
            ref = masks.get(key)
            if not isinstance(ref, str) or not ref:
                errors.append(f"masks.{key} must be a non-empty artifact ref")
    regions = pkg.get("regions")
    if not isinstance(regions, list):
        errors.append("regions must be an array")
    else:
        errors.extend(
            f'invalid region "{region}" (sideburn is excluded from MVP)'
            for region in regions
            if region not in REGIONS
        )
    stats = pkg.get("stats")
    if not isinstance(stats, dict):
        errors.append("stats must be an object")
    else:
        if not _in_unit_range(stats.get("hardHairMean")):
            errors.append("stats.hardHairMean must be in [0, 1]")
        if not _in_unit_range(stats.get("beardShadowMean")):
            errors.append("stats.beardShadowMean must be in [0, 1]")
        overlap = stats.get("protectOverlapRatio")
        if not _in_unit_range(overlap):
            errors.append("stats.protectOverlapRatio must be in [0, 1]")
        elif overlap > PROTECT_OVERLAP_REJECT_RATIO:
            errors.append(
                f"protectOverlapRatio {overlap} exceeds reject threshold "
                f"{PROTECT_OVERLAP_REJECT_RATIO} — package must be rejected upstream"
            )
    return len(errors) == 0, errors


def validate_consult_questions(questions: Any) -> tuple[bool, list[str]]:
    errors: list[str] = []
    if not isinstance(questions, list):
        return False, ["consultQuestions must be an array"]
    for question in questions:
        if not isinstance(question, str) or not question.strip():
            errors.append("consult question must be a non-empty string")
            continue
        if not question.rstrip().endswith("?"):
            errors.append(f'consult question must be a question: "{question}"')
        for pattern in FORBIDDEN_CONSULT_PATTERNS:
            if pattern.search(question):
                errors.append(
                    "consult question contains recommendation/guarantee phrasing: "
                    f'"{question}"'
                )
    return len(errors) == 0, errors


def validate_result(result: Any) -> tuple[bool, list[str]]:
    errors: list[str] = []
    if not isinstance(result, dict):
        return False, ["result must be an object"]
    if not isinstance(result.get("requestId"), str) or not result["requestId"]:
        errors.append("requestId must be a non-empty string")
    if not isinstance(result.get("createdAt"), str) or not result["createdAt"]:
        errors.append("createdAt must be a non-empty ISO string")
    analysis = result.get("analysis")
    if not isinstance(analysis, dict):
        errors.append("analysis must be an object")
    else:
        if not _in_unit_range(analysis.get("densityScore")):
            errors.append("analysis.densityScore must be in [0, 1]")
        if not _in_unit_range(analysis.get("shadowScore")):
            errors.append("analysis.shadowScore must be in [0, 1]")
    errors.extend(validate_mask_package(result.get("maskPackage"))[1])
    stages = result.get("stages")
    if not isinstance(stages, list):
        errors.append("stages must be an array")
    else:
        for stage_result in stages:
            if not isinstance(stage_result, dict):
                errors.append("stage result must be an object")
                continue
            if stage_result.get("stage") not in STAGES:
                errors.append(f"invalid stage: {stage_result.get('stage')}")
            guard = stage_result.get("guard")
            if not isinstance(guard, dict) or not isinstance(guard.get("passed"), bool):
                errors.append("stage result must carry a guard report")
            elif guard["passed"] is not True:
                errors.append(
                    "stages[] may only contain guard-passed results; "
                    "failures belong in failures[]"
                )
    if not isinstance(result.get("failures"), list):
        errors.append("failures must be an array")
    errors.extend(validate_consult_questions(result.get("consultQuestions"))[1])
    disclaimers = result.get("disclaimers")
    if not isinstance(disclaimers, list) or not disclaimers:
        errors.append("disclaimers must be a non-empty array")
    return len(errors) == 0, errors


VALIDATORS = {
    "request": validate_request,
    "result": validate_result,
    "maskPackage": validate_mask_package,
    "consultQuestions": validate_consult_questions,
}
