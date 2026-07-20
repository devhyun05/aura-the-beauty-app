"""Loader for the Notre Dame facial-hair annotations (FG 2025).

Source: https://github.com/kaganozturk/Effects-of-Facial-Hair-on-Face-Recognition
Local:  tools/beard-simulation-lab/external/facial_hair_annotations/  (gitignored)

Release layout (2,350 folders named by CelebAMask-HQ image id):
  <id>/<id>_label.png      labelme color-indexed mask, 1024x1024
  <id>/<id>_label_viz.png  grayscale visualization (NOT usable as training image)
  <id>/label_names.txt     classes present, one per line, starting "_background_"

Decoding gotcha this module exists to encapsulate: the color->class mapping is
PER-FOLDER ordinal (labelme VOC palette in label_names.txt order), not global.
Class distribution: beard 1,857 / mustache 1,649 / shadow 500.

The release contains masks only — source RGB images must be fetched separately
from CelebAMask-HQ (research-only license; matches by folder id). Everything
derived from this data is lab/research-only, never a product artifact.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

# labelme / PASCAL-VOC palette for class indices 1..3 (RGB order).
_VOC_PALETTE_RGB = {
    1: (128, 0, 0),
    2: (0, 128, 0),
    3: (128, 128, 0),
}

ND_CLASSES = ("beard", "mustache", "shadow")


def default_annotations_root() -> Path:
    return Path(__file__).resolve().parents[1] / "external" / "facial_hair_annotations"


def list_annotation_ids(root: Path | None = None) -> list[str]:
    root = root or default_annotations_root()
    if not root.is_dir():
        return []
    return sorted(
        p.name for p in root.iterdir() if p.is_dir() and (p / "label_names.txt").exists()
    )


def load_annotation(
    image_id: str, root: Path | None = None
) -> dict[str, np.ndarray]:
    """Return {class_name: float32 binary mask (H, W)} for one image id.

    Only classes present in the folder's label_names.txt are returned;
    "_background_" is skipped.
    """
    root = root or default_annotations_root()
    folder = root / image_id
    names = (folder / "label_names.txt").read_text().splitlines()
    label_bgr = cv2.imread(str(folder / f"{image_id}_label.png"), cv2.IMREAD_COLOR)
    if label_bgr is None:
        raise FileNotFoundError(folder / f"{image_id}_label.png")

    masks: dict[str, np.ndarray] = {}
    for index, name in enumerate(names):
        if index == 0 or name == "_background_":
            continue
        rgb = _VOC_PALETTE_RGB.get(index)
        if rgb is None:
            raise ValueError(f"{image_id}: class index {index} beyond known palette")
        bgr = np.array(rgb[::-1], dtype=np.uint8)
        masks[name] = (label_bgr == bgr).all(axis=2).astype(np.float32)
    return masks


def to_engine_channels(masks: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Map ND classes onto our contract channels:
    hard  = beard ∪ mustache   (strand/dense facial hair)
    shadow = shadow            (five o'clock shadow)
    """
    shape = next(iter(masks.values())).shape if masks else (0, 0)
    hard = np.zeros(shape, dtype=np.float32)
    for name in ("beard", "mustache"):
        if name in masks:
            hard = np.maximum(hard, masks[name])
    shadow = masks.get("shadow", np.zeros(shape, dtype=np.float32))
    return {"hard": hard, "shadow": shadow}


def dataset_summary(root: Path | None = None) -> dict:
    root = root or default_annotations_root()
    counts = {name: 0 for name in ND_CLASSES}
    ids = list_annotation_ids(root)
    for image_id in ids:
        names = (root / image_id / "label_names.txt").read_text().splitlines()
        for name in names:
            if name in counts:
                counts[name] += 1
    return {"total": len(ids), "classCounts": counts}
