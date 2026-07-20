"""Stage 2 technique 1: tile-zoom ensemble for CLIPSeg.

CLIPSeg sees 352x352 (~22x22 effective patches). On a whole lower-face crop
that is too coarse to tell "hair here" from "a face region where hair could be",
so on faint beards it sprays the entire lower face (pic4: recall 0.804 at
precision 0.281). Showing it magnified tiles attacks that root cause directly:
each tile fills the 352 input with a smaller area, so a patch covers real skin
texture and the model can answer "is there actually hair here".

We compose RAW sigmoid, never the min-max-normalized `clipseg_heat`: per-tile
normalization would rescale each tile to its own max and destroy cross-tile
comparability (a clean tile's faint noise would bloom to 1.0). Tiles are blended
with a 2D Hanning window so seams don't create ridges.

This is a spike -- it imports the model loader but touches no engine code.
"""

from __future__ import annotations

import cv2
import numpy as np


def _raw_heat(bgr_crop: np.ndarray, prompts: list[str]) -> np.ndarray:
    """Mean sigmoid over prompts, NO normalization, resized to the crop."""
    import torch

    from eval.bench_models import load_clipseg

    proc, model, _ = load_clipseg("CIDAS/clipseg-rd64-refined")
    rgb = cv2.cvtColor(bgr_crop, cv2.COLOR_BGR2RGB)
    inputs = proc(text=prompts, images=[rgb] * len(prompts),
                  return_tensors="pt", padding=True, truncation=True)
    with torch.no_grad():
        logits = model(**inputs).logits
    heat = torch.sigmoid(logits)
    if heat.ndim == 3:
        heat = heat.mean(0)
    heat = heat.squeeze().numpy().astype(np.float32)
    return cv2.resize(heat, (bgr_crop.shape[1], bgr_crop.shape[0]))


def _hann2d(h: int, w: int) -> np.ndarray:
    wy = np.hanning(max(h, 3))[:, None]
    wx = np.hanning(max(w, 3))[None, :]
    win = (wy @ wx).astype(np.float32)
    return np.clip(win, 1e-3, None)  # never zero, so edges still contribute


def zoom_heat(bgr_crop: np.ndarray, prompts: list[str],
              grid: int = 2, overlap: float = 0.35) -> np.ndarray:
    """Overlapping grid x grid tiles, each inferred large, Hanning-blended.

    grid=2, overlap=0.35 -> each tile is ~0.68 of the crop side, upscaled to
    352 by the processor, ~1.5x effective resolution.
    """
    h, w = bgr_crop.shape[:2]
    step_y = h / (grid - overlap * (grid - 1)) if grid > 1 else h
    step_x = w / (grid - overlap * (grid - 1)) if grid > 1 else w
    tile_h = int(round(step_y / (1 - overlap))) if grid > 1 else h
    tile_w = int(round(step_x / (1 - overlap))) if grid > 1 else w
    tile_h, tile_w = min(tile_h, h), min(tile_w, w)

    acc = np.zeros((h, w), np.float32)
    wsum = np.zeros((h, w), np.float32)
    for iy in range(grid):
        for ix in range(grid):
            y0 = int(round(iy * step_y)) if grid > 1 else 0
            x0 = int(round(ix * step_x)) if grid > 1 else 0
            y0 = min(y0, h - tile_h)
            x0 = min(x0, w - tile_w)
            tile = bgr_crop[y0:y0 + tile_h, x0:x0 + tile_w]
            th = _raw_heat(tile, prompts)
            win = _hann2d(tile.shape[0], tile.shape[1])
            acc[y0:y0 + tile_h, x0:x0 + tile_w] += th * win
            wsum[y0:y0 + tile_h, x0:x0 + tile_w] += win
    return acc / np.maximum(wsum, 1e-6)


def full_raw_heat(bgr_crop: np.ndarray, prompts: list[str]) -> np.ndarray:
    """Baseline for the A/B: one pass over the whole crop, raw sigmoid."""
    return _raw_heat(bgr_crop, prompts)
