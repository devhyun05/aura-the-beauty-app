"""Image loading helpers shared by the local beard-simulation lab."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

SUPPORTED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".heic", ".heif"}


def is_supported_image_path(path: Path) -> bool:
    return path.suffix.lower() in SUPPORTED_IMAGE_SUFFIXES


def read_image_bgr(path: str | Path) -> np.ndarray | None:
    """Read common lab image formats as BGR."""
    image_path = Path(path)
    bgr = cv2.imread(str(image_path))
    if bgr is not None:
        return bgr

    if image_path.suffix.lower() not in {".heic", ".heif"}:
        return None

    try:
        import pillow_heif
        from PIL import Image

        pillow_heif.register_heif_opener()
        rgb = np.array(Image.open(image_path).convert("RGB"))
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    except Exception:
        return None
