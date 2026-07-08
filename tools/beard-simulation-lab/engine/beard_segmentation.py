"""Beard segmentation — C1 deterministic baseline (+ optional CLIPSeg prior).

Two branches with different precision needs:
- hard hair: high-frequency dark structure → multiscale morphological
  black-hat (small stubble dots + short hair texture)
- shadow: lower-face local skin reference field in Lab, gated by darker
  blue-gray direction. The forehead/upper-cheek model remains a fallback,
  but the lower face is not compared against a single global skin color.

All outputs are float32 confidence maps in [0, 1] (contract: 8-bit gray on
disk). soft_blend is derived downstream in blend.py, never authored here.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

from .lower_face_roi import LowerFaceCrop


@dataclass
class BeardMasks:
    hard: np.ndarray    # float32 0..1, crop coords
    shadow: np.ndarray  # float32 0..1
    protect: np.ndarray
    stats: dict


@dataclass
class SkinModel:
    mean: np.ndarray      # (3,) Lab
    inv_cov: np.ndarray   # (3, 3)


def fit_skin_model(lab_pixels: np.ndarray) -> SkinModel:
    """Robust single-Gaussian fit: trim the 15% most deviant pixels once
    (brows/strand hairs inside the reference patches) and refit."""
    if len(lab_pixels) < 50:
        raise ValueError("not enough skin reference pixels")
    mean = lab_pixels.mean(axis=0)
    cov = np.cov(lab_pixels.T) + np.eye(3) * 1e-3
    inv_cov = np.linalg.inv(cov)
    diff = lab_pixels - mean
    d2 = np.einsum("ij,jk,ik->i", diff, inv_cov, diff)
    keep = lab_pixels[d2 <= np.percentile(d2, 85)]
    mean = keep.mean(axis=0)
    cov = np.cov(keep.T) + np.eye(3) * 1e-3
    return SkinModel(mean=mean, inv_cov=np.linalg.inv(cov))


def _mahalanobis_map(lab: np.ndarray, model: SkinModel) -> np.ndarray:
    diff = lab.reshape(-1, 3) - model.mean
    d2 = np.einsum("ij,jk,ik->i", diff, model.inv_cov, diff)
    return np.sqrt(np.maximum(d2, 0)).reshape(lab.shape[:2]).astype(np.float32)


def _odd_kernel(size: float, minimum: int = 3) -> int:
    return max(minimum, int(round(size)) | 1)


def _smoothstep(edge0: float, edge1: float, values: np.ndarray) -> np.ndarray:
    if abs(edge1 - edge0) < 1e-6:
        return (values >= edge1).astype(np.float32)
    t = np.clip((values - edge0) / (edge1 - edge0), 0, 1)
    return (t * t * (3 - 2 * t)).astype(np.float32)


def _normalize_feature(
    feature: np.ndarray,
    sample_mask: np.ndarray,
    percentile: float,
    mad_scale: float,
) -> np.ndarray:
    inside = feature[sample_mask > 0.5]
    if inside.size < 16:
        return np.zeros_like(feature, dtype=np.float32)
    med = float(np.median(inside))
    mad = float(np.median(np.abs(inside - med))) + 1e-6
    floor = med + mad_scale * mad
    scale = max(float(np.percentile(inside, percentile)), floor + 1.0)
    return np.clip((feature - floor) / max(scale - floor, 1e-6), 0, 1).astype(np.float32)


def _local_reference_lab(
    lab: np.ndarray,
    luma: np.ndarray,
    crop: LowerFaceCrop,
    hard_seed: np.ndarray,
    skin_model: SkinModel,
) -> tuple[np.ndarray, dict]:
    editable = crop.roi_mask * (1 - crop.protect_mask)
    roi_luma = luma[editable > 0.5]
    if roi_luma.size:
        luma_floor = float(np.percentile(roi_luma, 42))
        luma_cap = float(np.percentile(roi_luma, 98))
    else:
        luma_floor = float(skin_model.mean[0] - 12.0)
        luma_cap = float(skin_model.mean[0] + 24.0)

    # Candidate lower-face skin: editable, not hard texture, not the darkest
    # local pixels. A broad normalized blur turns those patches into a smooth
    # local reference field while preserving the illumination gradient.
    ref_mask = (
        editable
        * (hard_seed < 0.22).astype(np.float32)
        * (luma >= luma_floor).astype(np.float32)
        * (luma <= luma_cap).astype(np.float32)
    )
    ref_mask = cv2.morphologyEx(
        ref_mask,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)),
    )
    sigma = max(12.0, crop.face_width / 7.5)
    weight = cv2.GaussianBlur(ref_mask, (0, 0), sigmaX=sigma, sigmaY=sigma)
    weighted = cv2.GaussianBlur(
        lab * ref_mask[..., None], (0, 0), sigmaX=sigma, sigmaY=sigma)
    fallback = np.empty_like(lab, dtype=np.float32)
    fallback[..., 0] = skin_model.mean[0]
    fallback[..., 1] = skin_model.mean[1]
    fallback[..., 2] = skin_model.mean[2]
    local_ref = np.where(
        weight[..., None] > 1e-4,
        weighted / np.maximum(weight[..., None], 1e-4),
        fallback,
    ).astype(np.float32)
    stats = {
        "localRefCandidateRatio": float(ref_mask.sum() / max(editable.sum(), 1.0)),
        "localRefLumaFloor": luma_floor,
        "localRefLumaCap": luma_cap,
    }
    return local_ref, stats


def _component_filter(
    confidence: np.ndarray,
    roi_mask: np.ndarray,
    protect_mask: np.ndarray,
    face_width: float,
    threshold: float = 0.28,
) -> tuple[np.ndarray, int, int, int]:
    editable = roi_mask * (1 - protect_mask)
    binary = ((confidence > threshold) & (editable > 0.5)).astype(np.uint8)
    binary = cv2.dilate(
        binary, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)), iterations=1)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    keep = np.zeros_like(confidence, dtype=np.float32)
    boundary_radius = max(2, int(round(face_width * 0.025)))
    boundary_kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (boundary_radius * 2 + 1, boundary_radius * 2 + 1))
    roi_binary = (roi_mask > 0.5).astype(np.uint8)
    roi_eroded = cv2.erode(roi_binary, boundary_kernel, iterations=1)
    boundary_band = (roi_binary > 0) & (roi_eroded == 0)
    min_area = max(5, int((face_width ** 2) * 0.00009))
    kept = 0
    boundary_dropped = 0
    total = max(0, count - 1)
    for idx in range(1, count):
        area = int(stats[idx, cv2.CC_STAT_AREA])
        component = labels == idx
        mean_conf = float(confidence[component].mean()) if area else 0.0
        width = int(stats[idx, cv2.CC_STAT_WIDTH])
        height = int(stats[idx, cv2.CC_STAT_HEIGHT])
        elongated = max(width, height) / max(1, min(width, height)) >= 2.2
        component_in_roi = component & (roi_mask > 0.5)
        boundary_overlap = float((component_in_roi & boundary_band).sum() / max(component_in_roi.sum(), 1))
        if elongated and boundary_overlap >= 0.55:
            boundary_dropped += 1
            continue
        if area >= min_area or (mean_conf > 0.62 and elongated):
            keep[component] = 1.0
            kept += 1
    keep = cv2.erode(
        keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)), iterations=1)
    keep = cv2.GaussianBlur(keep, (0, 0), sigmaX=max(0.8, face_width / 350))
    return confidence * np.clip(keep, 0, 1), kept, total, boundary_dropped


def _region_prior(crop: LowerFaceCrop) -> np.ndarray:
    prior = np.zeros_like(crop.roi_mask, dtype=np.float32)
    weights = {
        "mustache": 1.0,
        "chin": 0.88,
        "mouth_side": 0.55,
        "jaw": 0.52,
    }
    for name, weight in weights.items():
        mask = crop.region_masks.get(name)
        if mask is not None:
            prior = np.maximum(prior, mask.astype(np.float32) * weight)
    return np.clip(prior, 0, 1)


def segment_beard(
    crop: LowerFaceCrop,
    skin_model: SkinModel,
    blackhat_kernel_ratio: float = 0.022,
    hard_percentile: float = 99.0,
    shadow_d0: float = 2.2,
    shadow_d1: float = 7.0,
    clipseg_prior: np.ndarray | None = None,
) -> BeardMasks:
    lab = cv2.cvtColor(crop.bgr, cv2.COLOR_BGR2Lab).astype(np.float32)
    luma = lab[..., 0]
    fw = crop.face_width
    editable = crop.roi_mask * (1 - crop.protect_mask)
    prior = _region_prior(crop)

    # --- hard hair branch: multiscale black-hat over luma.
    small_k = _odd_kernel(fw * 0.007)
    medium_k = _odd_kernel(fw * 0.015)
    large_k = _odd_kernel(fw * blackhat_kernel_ratio)
    small = cv2.morphologyEx(
        luma, cv2.MORPH_BLACKHAT,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (small_k, small_k)))
    medium = cv2.morphologyEx(
        luma, cv2.MORPH_BLACKHAT,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (medium_k, medium_k)))
    large = cv2.morphologyEx(
        luma, cv2.MORPH_BLACKHAT,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (large_k, large_k)))
    sample_mask = editable
    hard_small = _normalize_feature(small, sample_mask, 98.6, 3.0)
    hard_medium = _normalize_feature(medium, sample_mask, hard_percentile, 3.6)
    hard_large = _normalize_feature(large, sample_mask, 99.3, 4.2)
    density_seed = ((hard_small > 0.22) | (hard_medium > 0.24)).astype(np.float32)
    density = cv2.GaussianBlur(
        density_seed * editable, (0, 0), sigmaX=max(1.0, fw / 95))
    density_inside = density[editable > 0.5]
    density_scale = max(
        float(np.percentile(density_inside, 98)) if density_inside.size else 0.0,
        1e-6,
    )
    density_gate = np.clip(density / density_scale, 0, 1)
    hard = np.maximum(hard_small * 0.75, hard_medium)
    hard = np.maximum(hard, hard_large * 0.65)
    hard = hard * np.clip(0.45 + 0.75 * density_gate, 0, 1)
    stubble_dot_probe = hard_small * density_gate * np.clip(0.15 + 0.85 * prior, 0, 1)
    short_hair_probe = np.maximum(hard_medium, hard_large * 0.65) * np.clip(
        0.15 + 0.85 * prior, 0, 1)
    hard, kept_components, total_components, boundary_dropped = _component_filter(
        hard, crop.roi_mask, crop.protect_mask, fw)
    hard = hard * np.clip(0.15 + 0.85 * prior, 0, 1)
    hard = cv2.GaussianBlur(hard, (0, 0), sigmaX=max(0.8, fw / 420))

    # --- shadow branch: local lower-face skin reference + blue-gray gate.
    local_ref, local_ref_stats = _local_reference_lab(
        lab, luma, crop, hard, skin_model)
    delta = local_ref - lab
    delta_l = delta[..., 0]
    delta_a = delta[..., 1]
    delta_b = delta[..., 2]
    local_dist = np.sqrt(
        (delta_l / 10.0) ** 2 + (delta_a / 8.0) ** 2 + (delta_b / 9.0) ** 2)
    local_dist_score = _smoothstep(shadow_d0 * 0.55, shadow_d1 * 0.62, local_dist)
    darker = _smoothstep(1.0, 16.0, delta_l)
    blue_shift = _smoothstep(1.5, 14.0, delta_b)
    red_loss = _smoothstep(1.0, 9.0, delta_a)
    ref_chroma = np.sqrt((local_ref[..., 1] - 128.0) ** 2 + (local_ref[..., 2] - 128.0) ** 2)
    pix_chroma = np.sqrt((lab[..., 1] - 128.0) ** 2 + (lab[..., 2] - 128.0) ** 2)
    gray_shift = _smoothstep(2.0, 14.0, ref_chroma - pix_chroma)
    blue_gray = np.clip(
        np.maximum(blue_shift, np.maximum(red_loss * 0.45, gray_shift * 0.55)),
        0,
        1,
    )
    low_freq = cv2.GaussianBlur(
        local_dist_score * darker * blue_gray, (0, 0), sigmaX=max(2.0, fw / 55))
    shadow = low_freq * np.clip(0.2 + 0.8 * prior, 0, 1)

    # Optional dense-beard prior (spike C2): coarse heatmap multiplied in.
    if clipseg_prior is not None:
        prior = cv2.resize(clipseg_prior, (hard.shape[1], hard.shape[0]))
        prior = np.clip(prior, 0, 1).astype(np.float32)
        # Prior only ever adds region, never deletes detected strands:
        shadow = np.maximum(shadow, prior * 0.8 * (shadow > 0.05))
        hard = np.maximum(hard, prior * hard.max() * 0.5 * (hard > 0.05))

    # Dense-beard solidify: when strand coverage is high, close interior gaps.
    roi_area = max(crop.roi_mask.sum(), 1.0)
    strand_cov = float(((hard > 0.35) * crop.roi_mask).sum() / roi_area)
    if strand_cov > 0.28:
        solid = cv2.morphologyEx(
            (hard > 0.3).astype(np.float32), cv2.MORPH_CLOSE,
            cv2.getStructuringElement(
                cv2.MORPH_ELLIPSE, (large_k * 2 + 1, large_k * 2 + 1)))
        hard = np.maximum(hard, solid * 0.7)

    # Clamp to ROI and zero inside protect before artifact stats. Lips naturally
    # differ from the skin model, so measuring the unsuppressed candidate map
    # causes false guard rejects; the guard verifies the persisted masks.
    pre_protect_union = np.maximum(hard, shadow)
    hard = hard * crop.roi_mask * (1 - crop.protect_mask)
    shadow = shadow * crop.roi_mask * (1 - crop.protect_mask)
    raw_union = np.maximum(hard, shadow)
    protect_area = max(crop.protect_mask.sum(), 1.0)
    protect_overlap = float(
        ((raw_union > 0.3) * crop.protect_mask).sum() / protect_area
    )
    pre_protect_overlap = float(
        ((pre_protect_union > 0.3) * crop.protect_mask).sum() / protect_area
    )

    region_coverage = {}
    region_hard_coverage = {}
    region_shadow_coverage = {}
    region_editable_area = {}
    for name, mask in crop.region_masks.items():
        area = mask.sum()
        region_editable_area[name] = float(area / roi_area)
        if area < 1:
            continue
        region_coverage[name] = float((raw_union * mask).sum() / area)
        region_hard_coverage[name] = float((hard * mask).sum() / area)
        region_shadow_coverage[name] = float((shadow * mask).sum() / area)

    stats = {
        "hardHairMean": float((hard * crop.roi_mask).sum() / roi_area),
        "beardShadowMean": float((shadow * crop.roi_mask).sum() / roi_area),
        "protectOverlapRatio": protect_overlap,
        "regionCoverage": region_coverage,
        "regionHardCoverage": region_hard_coverage,
        "regionShadowCoverage": region_shadow_coverage,
        "regionEditableArea": region_editable_area,
        "strandCoverage": strand_cov,
        "stubbleDotMean": float((stubble_dot_probe * crop.roi_mask).sum() / roi_area),
        "shortHairMean": float((short_hair_probe * crop.roi_mask).sum() / roi_area),
        "preProtectOverlapRatio": pre_protect_overlap,
        "blackhatKernel": large_k,
        "blackhatKernels": {"small": small_k, "medium": medium_k, "large": large_k},
        "hardComponentCount": total_components,
        "hardComponentKept": kept_components,
        "hardBoundaryComponentDropped": boundary_dropped,
        "shadowBlueGrayMean": float((blue_gray * editable).sum() / max(editable.sum(), 1.0)),
        **local_ref_stats,
    }
    return BeardMasks(hard=hard, shadow=shadow, protect=crop.protect_mask, stats=stats)


_CLIPSEG_CACHE: dict[str, Any | None] = {"processor": None, "model": None}


def _load_clipseg_components(processor_cls: Any | None = None, model_cls: Any | None = None) -> tuple[Any, Any]:
    """Load CLIPSeg once per process; tests may inject fake classes."""
    if _CLIPSEG_CACHE["processor"] is None or _CLIPSEG_CACHE["model"] is None:
        if processor_cls is None or model_cls is None:
            try:
                from transformers import CLIPSegForImageSegmentation, CLIPSegProcessor
            except ImportError as exc:  # pragma: no cover - extras not installed in CI
                raise RuntimeError(
                    "CLIPSeg prior requires extras: pip install torch transformers "
                    "(see requirements-extras.txt)"
                ) from exc
            processor_cls = CLIPSegProcessor
            model_cls = CLIPSegForImageSegmentation
        name = "CIDAS/clipseg-rd64-refined"
        _CLIPSEG_CACHE["processor"] = processor_cls.from_pretrained(name)
        _CLIPSEG_CACHE["model"] = model_cls.from_pretrained(name)
        if hasattr(_CLIPSEG_CACHE["model"], "eval"):
            _CLIPSEG_CACHE["model"].eval()
    return _CLIPSEG_CACHE["processor"], _CLIPSEG_CACHE["model"]


def clipseg_beard_prior(bgr_crop: np.ndarray) -> np.ndarray:
    """Spike C2: CLIPSeg 'beard' heatmap. Requires extras (torch+transformers)."""
    try:
        import torch
    except ImportError as exc:  # pragma: no cover - extras not installed in CI
        raise RuntimeError(
            "CLIPSeg prior requires extras: pip install torch transformers "
            "(see requirements-extras.txt)"
        ) from exc

    processor, model = _load_clipseg_components()
    rgb = cv2.cvtColor(bgr_crop, cv2.COLOR_BGR2RGB)
    inputs = processor(text=["beard stubble"], images=[rgb], return_tensors="pt")
    with torch.no_grad():
        logits = model(**inputs).logits
    heat = torch.sigmoid(logits).squeeze().numpy().astype(np.float32)
    heat -= heat.min()
    heat /= max(heat.max(), 1e-6)
    return heat
