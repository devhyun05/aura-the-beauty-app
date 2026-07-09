"""End-to-end photo pipeline.

quality gate → landmarks → lower-face crop → segmentation → protect pre-reject
→ deterministic correction → soft recomposition → geometry guard (with the
§8.4 mitigation ladder) → run-directory artifacts + contract-validated
result.json.
"""

from __future__ import annotations

import json
import shutil
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import yaml

from . import blend, consult
from .beard_segmentation import BeardMasks, fit_skin_model, segment_beard
from .beard_shadow_corrector import correct_crop
from .contracts import PROTECT_OVERLAP_REJECT_RATIO, validate_result
from .detect_face import detect_landmarks, detect_face
from .geometry_guard import (
    GuardCheck,
    GuardReport,
    check_mask_protect_overlap,
    run_post_checks,
)
from .image_io import read_image_bgr
from .lower_face_roi import build_lower_face_crop, skin_reference_pixels

MAX_IMAGE_DIM = 1536
PRE_PROTECT_OVERLAP_REJECT_RATIO = 0.30


DEFAULT_SURVEY = {
    "shavingState": "stubble",
    "goal": "shadow_reduction",
    "concernRegions": ["mustache", "chin"],
    "shavingFrequencyPerWeek": 5,
    "makeupCoverUsed": False,
    "consultPlanned": True,
}


@dataclass
class PipelineOutcome:
    run_dir: Path
    rejected: bool
    reject_reason: str | None
    result: dict | None  # contract-shaped BeardSimulationResult when not rejected


def load_stage_config(config_dir: Path, stage: str) -> dict:
    path = config_dir / f"{stage}.yaml"
    with open(path) as fh:
        return yaml.safe_load(fh)


def _save_gray8(path: Path, mask: np.ndarray) -> None:
    cv2.imwrite(str(path), (np.clip(mask, 0, 1) * 255).astype(np.uint8))


def _overlay(crop_bgr: np.ndarray, masks: BeardMasks) -> np.ndarray:
    vis = crop_bgr.astype(np.float32)
    vis[..., 2] = np.clip(vis[..., 2] + masks.hard * 160, 0, 255)      # hard → red
    vis[..., 0] = np.clip(vis[..., 0] + masks.shadow * 160, 0, 255)    # shadow → blue
    vis[..., 1] = np.clip(vis[..., 1] + masks.protect * 120, 0, 255)   # protect → green
    return vis.astype(np.uint8)


def _analysis_card(stats: dict) -> dict:
    density = float(np.clip(stats["hardHairMean"] * 3.0, 0, 1))
    shadow = float(np.clip(stats["beardShadowMean"] * 2.5, 0, 1))
    coverage = stats.get("regionCoverage", {})
    if stats.get("strandCoverage", 0) > 0.28:
        beard_type = "dense"
    elif density > 0.35:
        beard_type = "stubble"
    elif coverage and float(np.std(list(coverage.values()))) > 0.18:
        beard_type = "patchy"
    else:
        beard_type = "shadow_dominant"
    return {
        "beardType": beard_type,
        "densityScore": round(density, 4),
        "shadowScore": round(shadow, 4),
        "regionCoverage": {k: round(v, 4) for k, v in coverage.items()},
    }


def _shaving_state_adjust(params: dict, shaving_state: str) -> dict:
    """The single survey→pipeline coupling kept in MVP: a clean-shaven face has
    no strands to attenuate (shadow-focused), a dense beard needs caution."""
    adjusted = dict(params)
    if shaving_state == "clean":
        adjusted["hair_attenuation"] = min(params["hair_attenuation"], 0.35)
    elif shaving_state == "dense":
        adjusted["shadow_strength"] = min(params["shadow_strength"], 0.7)
    return adjusted


def _check_preprotect_overlap(stats: dict) -> GuardCheck:
    value = float(stats.get("preProtectOverlapRatio", 0.0))
    return GuardCheck(
        "mask_preprotect_overlap",
        value <= PRE_PROTECT_OVERLAP_REJECT_RATIO,
        value,
        PRE_PROTECT_OVERLAP_REJECT_RATIO,
    )


def run_pipeline(
    photo_path: str | Path,
    stages: list[str] | None = None,
    survey: dict | None = None,
    config_dir: str | Path | None = None,
    out_root: str | Path | None = None,
    request_id: str | None = None,
) -> PipelineOutcome:
    lab_root = Path(__file__).resolve().parents[1]
    config_dir = Path(config_dir) if config_dir else lab_root / "configs"
    out_root = Path(out_root) if out_root else lab_root / "outputs" / "runs"
    stages = stages or ["mild", "medium", "strong"]
    survey = {**DEFAULT_SURVEY, **(survey or {})}
    request_id = request_id or f"run-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"

    run_dir = out_root / request_id
    run_dir.mkdir(parents=True, exist_ok=True)

    photo_path = Path(photo_path)
    bgr = read_image_bgr(photo_path)
    if bgr is None:
        raise FileNotFoundError(f"cannot read image: {photo_path}")
    scale = MAX_IMAGE_DIM / max(bgr.shape[:2])
    if scale < 1.0:
        bgr = cv2.resize(bgr, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(run_dir / "input.png"), bgr)
    shutil.copy(photo_path, run_dir / f"original{photo_path.suffix or '.jpg'}")

    def reject(reason: str, extra: dict | None = None) -> PipelineOutcome:
        payload = {"rejected": True, "reason": reason, **(extra or {})}
        (run_dir / "rejected.json").write_text(json.dumps(payload, indent=2))
        return PipelineOutcome(run_dir, True, reason, None)

    detection = detect_face(bgr)
    quality = detection.quality if detection else None
    (run_dir / "quality_gate.json").write_text(json.dumps(
        quality.checks if quality else {"face_found": {"passed": False}}, indent=2))
    if detection is None or not detection.quality.passed:
        return reject(
            f"quality_gate:{detection.quality.reject_reason if detection else 'no_face_detected'}"
        )

    skin_model = fit_skin_model(
        skin_reference_pixels(bgr, detection.landmarks, detection.face_width))
    crop = build_lower_face_crop(
        bgr, detection.landmarks, detection.face_width, detection.face_height)
    masks = segment_beard(crop, skin_model)
    preprotect = _check_preprotect_overlap(masks.stats)
    if not preprotect.passed:
        return reject(
            "guard:mask_preprotect_overlap",
            {
                "value": preprotect.value,
                "threshold": preprotect.threshold,
                "protectOverlapRatio": masks.stats.get("protectOverlapRatio"),
            },
        )

    # --- protect pre-reject (primary defense; one erode retry allowed).
    pre = check_mask_protect_overlap(masks.hard, masks.shadow, crop.lips_mask)
    mask_mitigations: list[str] = []
    if not pre.passed:
        masks = blend.erode_masks(masks, crop.face_width)
        mask_mitigations.append("mask_erode")
        pre = check_mask_protect_overlap(masks.hard, masks.shadow, crop.lips_mask)
        if not pre.passed:
            return reject("guard:mask_protect_overlap", {"value": pre.value})
    masks.stats["protectOverlapRatio"] = min(
        masks.stats["protectOverlapRatio"], pre.value, PROTECT_OVERLAP_REJECT_RATIO)

    _save_gray8(run_dir / "mask_hard_hair.png", masks.hard)
    _save_gray8(run_dir / "mask_beard_shadow.png", masks.shadow)
    _save_gray8(run_dir / "mask_protect.png", crop.protect_mask)
    cv2.imwrite(str(run_dir / "mask_overlay.png"), _overlay(crop.bgr, masks))

    stage_results: list[dict] = []
    failures: list[dict] = []
    metrics: dict = {"maskStats": masks.stats, "stages": {}}

    for stage in stages:
        base_params = _shaving_state_adjust(
            load_stage_config(config_dir, stage), survey["shavingState"])
        guard_cfg = base_params.get("guard", {})
        report, result_img, soft = _run_stage_with_mitigations(
            bgr, crop, masks, base_params, detection, pre, guard_cfg)

        stage_png = f"result_{stage}.png"
        if result_img is not None:
            cv2.imwrite(str(run_dir / stage_png), result_img)
        metrics["stages"][stage] = report.to_dict()

        if report.passed:
            if soft is not None:
                _save_gray8(run_dir / f"mask_soft_blend_{stage}.png", soft)
            stage_results.append({
                "stage": stage,
                "imageRef": stage_png,
                "guard": report.to_dict(),
                "paramsUsed": {
                    k: v for k, v in base_params.items() if not isinstance(v, dict)
                },
            })
        else:
            failures.append({"stage": stage, "reason": report.reject_reason or "guard"})

    # softBlend contract artifact: from the strongest passing stage (fallback:
    # derived at default feather even if no stage passed, for inspection).
    soft_ref = None
    for stage in reversed(stages):
        candidate = run_dir / f"mask_soft_blend_{stage}.png"
        if candidate.exists():
            soft_ref = candidate.name
            break
    if soft_ref is None:
        soft = blend.derive_soft_blend(crop, masks)
        _save_gray8(run_dir / "mask_soft_blend.png", soft)
        soft_ref = "mask_soft_blend.png"

    result = {
        "requestId": request_id,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "analysis": _analysis_card(masks.stats),
        "maskPackage": {
            "imageWidth": bgr.shape[1],
            "imageHeight": bgr.shape[0],
            "encoding": "png-gray8",
            "masks": {
                "hardHair": "mask_hard_hair.png",
                "beardShadow": "mask_beard_shadow.png",
                "protect": "mask_protect.png",
                "softBlend": soft_ref,
            },
            "regions": list(crop.region_masks.keys()),
            "regionCoverage": {
                k: round(v, 4)
                for k, v in masks.stats.get("regionCoverage", {}).items()
            },
            "stats": {
                "hardHairMean": round(masks.stats["hardHairMean"], 4),
                "beardShadowMean": round(masks.stats["beardShadowMean"], 4),
                "protectOverlapRatio": round(masks.stats["protectOverlapRatio"], 4),
            },
        },
        "stages": stage_results,
        "failures": failures,
        "consultQuestions": consult.build_consult_questions(survey),
        "disclaimers": consult.DISCLAIMERS,
    }
    if mask_mitigations:
        metrics["maskMitigations"] = mask_mitigations

    valid, errors = validate_result(result)
    if not valid:
        raise AssertionError(f"pipeline produced contract-invalid result: {errors}")

    (run_dir / "result.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False))
    (run_dir / "metrics.json").write_text(
        json.dumps(metrics, indent=2, ensure_ascii=False))
    (run_dir / "params.yaml").write_text(yaml.safe_dump({
        "stages": {s: load_stage_config(config_dir, s) for s in stages},
        "survey": survey,
    }, allow_unicode=True))

    return PipelineOutcome(run_dir, False, None, result)


# §8.4 mitigation ladder: strength↓ → mask erode → feather↑ → reject.
_MITIGATIONS = [
    ("none", {}),
    ("strength_down", {"strength_scale": 0.7}),
    ("mask_erode", {"erode": True}),
    ("feather_up", {"feather_scale": 1.6}),
]


def _run_stage_with_mitigations(
    bgr: np.ndarray,
    crop,
    masks: BeardMasks,
    params: dict,
    detection,
    pre_check,
    guard_cfg: dict,
) -> tuple[GuardReport, np.ndarray | None, np.ndarray | None]:
    applied: list[str] = []
    last_report: GuardReport | None = None
    result_img = soft = None

    for name, tweak in _MITIGATIONS:
        if name != "none":
            applied.append(name)
        stage_masks = blend.erode_masks(masks, crop.face_width) if tweak.get("erode") else masks
        strength_scale = tweak.get("strength_scale", 1.0)
        feather = params.get("feather_ratio", 0.035) * tweak.get("feather_scale", 1.0)

        corrected = correct_crop(
            crop,
            stage_masks,
            shadow_strength=params["shadow_strength"] * strength_scale,
            hair_attenuation=params["hair_attenuation"] * strength_scale,
            stubble_inpaint=params.get("stubble_inpaint", False),
        )
        soft = blend.derive_soft_blend(crop, stage_masks, feather)
        result_img = blend.composite_full(
            bgr, corrected, crop, soft, params.get("global_strength", 1.0))

        soft_full = np.zeros(bgr.shape[:2], dtype=np.float32)
        x0, y0, x1, y1 = crop.bbox
        soft_full[y0:y1, x0:x1] = soft

        report = run_post_checks(
            original=bgr,
            result=result_img,
            landmarks_before=detection.landmarks,
            landmarks_after=detect_landmarks(result_img),
            interocular=detection.interocular,
            face_height=detection.face_height,
            soft_blend_full=soft_full,
            identity_mode=guard_cfg.get("identity_check", "warn"),
            thresholds=guard_cfg.get("thresholds"),
        )
        report.checks.insert(0, pre_check)
        report.mitigations_applied = list(applied)
        last_report = report
        if report.passed:
            return report, result_img, soft

    assert last_report is not None
    return last_report, result_img, soft
