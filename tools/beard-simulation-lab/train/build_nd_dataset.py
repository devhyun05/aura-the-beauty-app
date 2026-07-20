"""Stage 4 dataset: ND facial-hair masks -> lower-face crop + zone target.

For each Notre Dame annotation id we run the SAME front end used at inference
(detect_face quality gate -> build_lower_face_crop), so the model trains on
exactly the crops it will later see. The target is the beard zone
(beard u mustache u shadow) intersected with the detection `keep` scope, which
matches how the selfie REGION GT is scored. ND masks are painted areas, already
zone-like, so no strand->region transform is needed here.

Cache layout (gitignored, regenerable):
    outputs/nd_cache/<split>/<id>.jpg   256x256 BGR crop
    outputs/nd_cache/<split>/<id>.png   256x256 uint8 {0,255} target

The 9 selfies are a different source and never enter this cache.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.detect_face import detect_face  # noqa: E402
from engine.lower_face_roi import build_lower_face_crop  # noqa: E402
from engine.nd_annotations import (  # noqa: E402
    list_annotation_ids, load_annotation, to_engine_channels,
)

LAB = Path(__file__).resolve().parents[1]
IMG_DIR = LAB / "external" / "CelebAMask-HQ" / "CelebA-HQ-img"
OUT = LAB / "outputs" / "nd_cache"
CANVAS, TILE = 1024, 256
VAL_EVERY = 10  # deterministic id-level split: every 10th usable id -> val


def build_one(image_id: str) -> tuple[np.ndarray, np.ndarray] | None:
    jpg = IMG_DIR / f"{image_id}.jpg"
    bgr = cv2.imread(str(jpg), cv2.IMREAD_COLOR)
    if bgr is None:
        return None
    if bgr.shape[:2] != (CANVAS, CANVAS):
        bgr = cv2.resize(bgr, (CANVAS, CANVAS), interpolation=cv2.INTER_AREA)
    det = detect_face(bgr)
    if det is None or not det.quality.passed:
        return None
    crop = build_lower_face_crop(bgr, det.landmarks, det.face_width, det.face_height)
    gt = to_engine_channels(load_annotation(image_id))
    zone = np.maximum(gt["hard"], gt["shadow"])  # beard u mustache u shadow
    x0, y0, x1, y1 = crop.bbox
    zone_crop = zone[y0:y1, x0:x1]
    dp = getattr(crop, "detect_protect_mask", None)
    dp = crop.protect_mask if dp is None else dp
    keep = crop.roi_mask * (1 - dp)
    target = (zone_crop > 0.5) & (keep > 0.5)
    img = cv2.resize(crop.bgr, (TILE, TILE), interpolation=cv2.INTER_AREA)
    tgt = cv2.resize(target.astype(np.uint8) * 255, (TILE, TILE),
                     interpolation=cv2.INTER_NEAREST)
    return img, tgt


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="0 = all")
    args = ap.parse_args()
    ids = list_annotation_ids()
    if args.limit:
        ids = ids[:args.limit]
    for sub in ("train", "val"):
        (OUT / sub).mkdir(parents=True, exist_ok=True)

    ok = fail = pos = 0
    usable = 0
    for image_id in ids:
        built = build_one(image_id)
        if built is None:
            fail += 1
            continue
        img, tgt = built
        split = "val" if usable % VAL_EVERY == 0 else "train"
        usable += 1
        cv2.imwrite(str(OUT / split / f"{image_id}.jpg"), img)
        cv2.imwrite(str(OUT / split / f"{image_id}.png"), tgt)
        ok += 1
        pos += int((tgt > 127).any())
        if ok % 200 == 0:
            print(f"  {ok} built ({fail} skipped)")
    print(f"done: {ok} built, {fail} skipped (gate/missing), "
          f"{pos}/{ok} have beard pixels")
    print(f"cache -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
