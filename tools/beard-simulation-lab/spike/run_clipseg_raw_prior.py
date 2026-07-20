"""Raw CLIPSeg beard prior spike.

This shows CLIPSeg's own "beard stubble" heatmap without feeding it back into
the C1 deterministic mask. It is a diagnostic artifact for interpreting C2.
"""

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

from engine.detect_face import detect_face  # noqa: E402
from engine.image_io import is_supported_image_path, read_image_bgr  # noqa: E402
from engine.lower_face_roi import build_lower_face_crop  # noqa: E402

LAB_ROOT = Path(__file__).resolve().parents[1]
HF_CACHE_DIR = LAB_ROOT / ".hf-cache"
os.environ.setdefault("HF_HOME", str(HF_CACHE_DIR))
os.environ.setdefault("HF_HUB_CACHE", str(HF_CACHE_DIR / "hub"))


def _annotate(tile: np.ndarray, lines: list[str]) -> np.ndarray:
    out = tile.copy()
    y = 24
    for index, line in enumerate(lines):
        scale = 0.56 if index == 0 else 0.45
        thickness = 2 if index == 0 else 1
        cv2.putText(out, line, (8, y), cv2.FONT_HERSHEY_SIMPLEX,
                    scale, (0, 0, 0), thickness + 2, cv2.LINE_AA)
        cv2.putText(out, line, (8, y), cv2.FONT_HERSHEY_SIMPLEX,
                    scale, (245, 245, 245), thickness, cv2.LINE_AA)
        y += 18
    return out


def _heat_tile(heat: np.ndarray, tile_size: tuple[int, int]) -> np.ndarray:
    heat_u8 = np.clip(heat * 255, 0, 255).astype(np.uint8)
    colored = cv2.applyColorMap(heat_u8, cv2.COLORMAP_TURBO)
    return cv2.resize(colored, tile_size)


def _overlay_tile(crop_bgr: np.ndarray, heat: np.ndarray, tile_size: tuple[int, int]) -> np.ndarray:
    heat_u8 = np.clip(heat * 255, 0, 255).astype(np.uint8)
    colored = cv2.applyColorMap(heat_u8, cv2.COLORMAP_TURBO)
    overlay = cv2.addWeighted(crop_bgr, 0.62, colored, 0.38, 0)
    return cv2.resize(overlay, tile_size)


def _normalized_heat(logits: np.ndarray) -> np.ndarray:
    heat = 1.0 / (1.0 + np.exp(-logits.astype(np.float32)))
    heat -= float(heat.min())
    heat /= max(float(heat.max()), 1e-6)
    return heat.astype(np.float32)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", default=str(LAB_ROOT / "samples"))
    parser.add_argument("--out", default=str(LAB_ROOT / "outputs" / "clipseg_raw_prior_v1"))
    parser.add_argument("--prompt", default="beard stubble")
    args = parser.parse_args()

    try:
        import torch
        from transformers import CLIPSegForImageSegmentation, CLIPSegProcessor
    except ImportError as exc:
        raise RuntimeError(
            "Raw CLIPSeg spike requires torch and transformers."
        ) from exc

    samples = sorted(
        p for p in Path(args.samples).iterdir()
        if is_supported_image_path(p)
    ) if Path(args.samples).exists() else []
    if not samples:
        print(f"no sample photos in {args.samples}")
        return 1

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    model_name = "CIDAS/clipseg-rd64-refined"
    processor = CLIPSegProcessor.from_pretrained(model_name)
    model = CLIPSegForImageSegmentation.from_pretrained(model_name)
    model.eval()

    rows: list[np.ndarray] = []
    metrics: dict[str, dict] = {}
    tile_w = 360

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

        crop = build_lower_face_crop(
            bgr, detection.landmarks, detection.face_width, detection.face_height)
        rgb = cv2.cvtColor(crop.bgr, cv2.COLOR_BGR2RGB)
        t0 = time.perf_counter()
        inputs = processor(text=[args.prompt], images=[rgb], return_tensors="pt")
        with torch.no_grad():
            logits = model(**inputs).logits.squeeze().detach().cpu().numpy()
        heat = cv2.resize(
            _normalized_heat(logits),
            (crop.bgr.shape[1], crop.bgr.shape[0]),
            interpolation=cv2.INTER_LINEAR,
        )
        runtime_s = time.perf_counter() - t0

        roi = crop.roi_mask > 0.5
        editable = (crop.roi_mask * (1 - crop.protect_mask)) > 0.5
        protect = crop.protect_mask > 0.5
        metrics[photo.name] = {
            "runtime_s": round(runtime_s, 3),
            "prompt": args.prompt,
            "mean": round(float(heat[roi].mean()), 4) if roi.any() else 0.0,
            "editableMean": round(float(heat[editable].mean()), 4) if editable.any() else 0.0,
            "protectMean": round(float(heat[protect].mean()), 4) if protect.any() else 0.0,
            "coverageGt050": round(float(((heat > 0.50) & roi).sum() / max(roi.sum(), 1)), 4),
            "coverageGt065": round(float(((heat > 0.65) & roi).sum() / max(roi.sum(), 1)), 4),
            "coverageGt080": round(float(((heat > 0.80) & roi).sum() / max(roi.sum(), 1)), 4),
        }

        h = int(crop.bgr.shape[0] * tile_w / crop.bgr.shape[1])
        tile_size = (tile_w, h)
        input_tile = cv2.resize(crop.bgr, tile_size)
        heat_tile = _heat_tile(heat, tile_size)
        overlay_tile = _overlay_tile(crop.bgr, heat, tile_size)
        row = cv2.hconcat([
            _annotate(input_tile, [photo.name, "Input crop"]),
            _annotate(heat_tile, [
                "CLIPSeg raw heat",
                f"mean {metrics[photo.name]['mean']:.3f}",
                f">.65 {metrics[photo.name]['coverageGt065']:.3f}",
            ]),
            _annotate(overlay_tile, [
                "Raw prior overlay",
                f"protect mean {metrics[photo.name]['protectMean']:.3f}",
                f"{runtime_s:.2f}s",
            ]),
        ])
        rows.append(row)
        print(
            f"  {photo.name}: mean={metrics[photo.name]['mean']} "
            f">.65={metrics[photo.name]['coverageGt065']} "
            f"protect={metrics[photo.name]['protectMean']}"
        )

    if rows:
        max_w = max(row.shape[1] for row in rows)
        rows = [
            cv2.copyMakeBorder(row, 0, 8, 0, max_w - row.shape[1], cv2.BORDER_CONSTANT)
            for row in rows
        ]
        cv2.imwrite(str(out_dir / "clipseg_raw_grid.png"), cv2.vconcat(rows))
    (out_dir / "clipseg_raw_metrics.json").write_text(json.dumps(metrics, indent=2))
    print(f"\nraw CLIPSeg grid: {out_dir / 'clipseg_raw_grid.png'}")
    print(f"metrics:          {out_dir / 'clipseg_raw_metrics.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
