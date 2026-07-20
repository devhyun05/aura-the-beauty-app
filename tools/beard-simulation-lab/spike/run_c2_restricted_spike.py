"""C2 follow-up spike: raw CLIPSeg vs unrestricted/restricted C2 fusion."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.beard_segmentation import clipseg_beard_prior, fit_skin_model, segment_beard  # noqa: E402
from engine.detect_face import detect_face  # noqa: E402
from engine.image_io import is_supported_image_path, read_image_bgr  # noqa: E402
from engine.lower_face_roi import build_lower_face_crop, skin_reference_pixels  # noqa: E402
from run_spike import _annotate, _label_metrics, _load_labels, _stats_payload  # noqa: E402

LAB_ROOT = Path(__file__).resolve().parents[1]
HF_CACHE_DIR = LAB_ROOT / ".hf-cache"
os.environ.setdefault("HF_HOME", str(HF_CACHE_DIR))
os.environ.setdefault("HF_HUB_CACHE", str(HF_CACHE_DIR / "hub"))


def _overlay(crop_bgr: np.ndarray, hard: np.ndarray, shadow: np.ndarray,
             protect: np.ndarray) -> np.ndarray:
    vis = crop_bgr.astype(np.float32) * 0.75
    vis[..., 2] = np.clip(vis[..., 2] + hard * 200, 0, 255)
    vis[..., 0] = np.clip(vis[..., 0] + shadow * 200, 0, 255)
    vis[..., 1] = np.clip(vis[..., 1] + protect * 120, 0, 255)
    return vis.astype(np.uint8)


def _heat_tile(heat: np.ndarray, tile_size: tuple[int, int]) -> np.ndarray:
    heat_u8 = np.clip(heat * 255, 0, 255).astype(np.uint8)
    return cv2.resize(cv2.applyColorMap(heat_u8, cv2.COLORMAP_TURBO), tile_size)


def _mask_tile(crop_bgr: np.ndarray, masks, tile_size: tuple[int, int], lines: list[str]) -> np.ndarray:
    tile = cv2.resize(_overlay(crop_bgr, masks.hard, masks.shadow, masks.protect), tile_size)
    return _annotate(tile, lines)


def _restricted_prior(prior: np.ndarray, crop) -> np.ndarray:
    resized = cv2.resize(prior, (crop.bgr.shape[1], crop.bgr.shape[0]))
    region = np.maximum(
        crop.region_masks.get("mustache", 0),
        crop.region_masks.get("chin", 0),
    ).astype(np.float32)
    return np.clip(resized * region, 0, 1).astype(np.float32)


def _raw_prior_stats(prior: np.ndarray, crop) -> dict:
    resized = cv2.resize(prior, (crop.bgr.shape[1], crop.bgr.shape[0]))
    roi = crop.roi_mask > 0.5
    editable = (crop.roi_mask * (1 - crop.protect_mask)) > 0.5
    protect = crop.protect_mask > 0.5
    return {
        "mean": round(float(resized[roi].mean()), 4) if roi.any() else 0.0,
        "editableMean": round(float(resized[editable].mean()), 4) if editable.any() else 0.0,
        "protectMean": round(float(resized[protect].mean()), 4) if protect.any() else 0.0,
        "coverageGt065": round(float(((resized > 0.65) & roi).sum() / max(roi.sum(), 1)), 4),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", default=str(LAB_ROOT / "samples"))
    parser.add_argument("--out", default=str(LAB_ROOT / "outputs" / "spike_review_followup_c2_restricted_v1"))
    parser.add_argument("--labels", help="optional normalized crop rectangle labels JSON")
    args = parser.parse_args()

    samples = sorted(
        p for p in Path(args.samples).iterdir()
        if is_supported_image_path(p)
    ) if Path(args.samples).exists() else []
    if not samples:
        print(f"no sample photos in {args.samples}")
        return 1

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    labels = _load_labels(args.labels)
    metrics: dict[str, dict] = {}
    rows: list[np.ndarray] = []
    tile_w = 300

    for photo in samples:
        bgr = read_image_bgr(photo)
        if bgr is None:
            continue
        scale = 1536 / max(bgr.shape[:2])
        if scale < 1.0:
            bgr = cv2.resize(bgr, None, fx=scale, fy=scale)
        detection = detect_face(bgr)
        if detection is None or not detection.quality.passed:
            reason = detection.quality.reject_reason if detection else "no_face"
            metrics[photo.name] = {"rejected": reason}
            continue

        skin_model = fit_skin_model(
            skin_reference_pixels(bgr, detection.landmarks, detection.face_width))
        crop = build_lower_face_crop(
            bgr, detection.landmarks, detection.face_width, detection.face_height)
        label_entry = labels.get(photo.name)
        h = int(crop.bgr.shape[0] * tile_w / crop.bgr.shape[1])
        tile_size = (tile_w, h)

        c1 = segment_beard(crop, skin_model)
        t0 = time.perf_counter()
        prior = clipseg_beard_prior(crop.bgr)
        prior_runtime = time.perf_counter() - t0
        prior_resized = cv2.resize(prior, (crop.bgr.shape[1], crop.bgr.shape[0]))
        restricted = _restricted_prior(prior, crop)
        t0 = time.perf_counter()
        c2_full = segment_beard(crop, skin_model, clipseg_prior=prior)
        c2_full_runtime = time.perf_counter() - t0
        t0 = time.perf_counter()
        c2_restricted = segment_beard(crop, skin_model, clipseg_prior=restricted)
        c2_restricted_runtime = time.perf_counter() - t0

        metrics[photo.name] = {
            "c1": {
                **_stats_payload(c1),
                **_label_metrics(np.maximum(c1.hard, c1.shadow), label_entry),
            },
            "rawClipseg": {
                "runtime_s": round(prior_runtime, 3),
                **_raw_prior_stats(prior, crop),
            },
            "c2Full": {
                "runtime_s": round(c2_full_runtime, 3),
                **_stats_payload(c2_full),
                **_label_metrics(np.maximum(c2_full.hard, c2_full.shadow), label_entry),
            },
            "c2MustacheChin": {
                "runtime_s": round(c2_restricted_runtime, 3),
                **_stats_payload(c2_restricted),
                **_label_metrics(
                    np.maximum(c2_restricted.hard, c2_restricted.shadow),
                    label_entry,
                ),
            },
        }

        tiles = [
            _annotate(cv2.resize(crop.bgr, tile_size), [photo.name, "Input"]),
            _mask_tile(crop.bgr, c1, tile_size, [
                "C1 union",
                f"H {metrics[photo.name]['c1']['hardMean']:.3f} "
                f"S {metrics[photo.name]['c1']['shadowMean']:.3f}",
                f"preP {metrics[photo.name]['c1']['preProtectOverlap']:.3f}",
            ]),
            _annotate(_heat_tile(prior_resized, tile_size), [
                "Raw CLIPSeg",
                f"mean {metrics[photo.name]['rawClipseg']['mean']:.3f}",
                f"P {metrics[photo.name]['rawClipseg']['protectMean']:.3f}",
            ]),
            _mask_tile(crop.bgr, c2_full, tile_size, [
                "C2 full",
                f"H {metrics[photo.name]['c2Full']['hardMean']:.3f} "
                f"S {metrics[photo.name]['c2Full']['shadowMean']:.3f}",
                f"preP {metrics[photo.name]['c2Full']['preProtectOverlap']:.3f}",
            ]),
            _mask_tile(crop.bgr, c2_restricted, tile_size, [
                "C2 M+C",
                f"H {metrics[photo.name]['c2MustacheChin']['hardMean']:.3f} "
                f"S {metrics[photo.name]['c2MustacheChin']['shadowMean']:.3f}",
                f"preP {metrics[photo.name]['c2MustacheChin']['preProtectOverlap']:.3f}",
            ]),
        ]
        rows.append(cv2.hconcat(tiles))
        print(
            f"  {photo.name}: raw={prior_runtime:.3f}s "
            f"c2Full preP={metrics[photo.name]['c2Full']['preProtectOverlap']} "
            f"c2M+C preP={metrics[photo.name]['c2MustacheChin']['preProtectOverlap']}"
        )

    if rows:
        max_w = max(row.shape[1] for row in rows)
        rows = [
            cv2.copyMakeBorder(row, 0, 8, 0, max_w - row.shape[1], cv2.BORDER_CONSTANT)
            for row in rows
        ]
        cv2.imwrite(str(out_dir / "spike_grid.png"), cv2.vconcat(rows))
    (out_dir / "spike_metrics.json").write_text(json.dumps(metrics, indent=2))
    print(f"\nC2 restricted grid: {out_dir / 'spike_grid.png'}")
    print(f"metrics:            {out_dir / 'spike_metrics.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
