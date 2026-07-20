"""Segmentation spike — C1 / C2 / C3 side-by-side over real sample photos.

C1: deterministic (black-hat + per-person skin model)         — always runs
C2: C1 + CLIPSeg "beard" prior                                — needs extras
C3: face parsing (SegFormer CelebAMask-HQ), beard-class probe — needs extras

Usage:
  .venv/bin/python spike/run_spike.py            # samples/ → outputs/spike/
  .venv/bin/python spike/run_spike.py --with-c2 --with-c3

Judgment criteria per photo (record in the grid):
  ① protect-overlap  ② dense-beard boundary coverage
  ③ dark-skin degradation  ④ per-photo runtime
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

from engine.beard_segmentation import (  # noqa: E402
    BeardMasks,
    clipseg_beard_prior,
    fit_skin_model,
    segment_beard,
)
from engine.detect_face import detect_face  # noqa: E402
from engine.image_io import is_supported_image_path, read_image_bgr  # noqa: E402
from engine.lower_face_roi import build_lower_face_crop, skin_reference_pixels  # noqa: E402

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


def _placeholder(shape: tuple[int, int], text: str) -> np.ndarray:
    img = np.full((shape[0], shape[1], 3), 40, dtype=np.uint8)
    cv2.putText(img, text, (10, shape[0] // 2), cv2.FONT_HERSHEY_SIMPLEX,
                0.6, (200, 200, 200), 1)
    return img


def _annotate(tile: np.ndarray, lines: list[str]) -> np.ndarray:
    out = tile.copy()
    y = 22
    for index, line in enumerate(lines):
        scale = 0.48 if index else 0.56
        thickness = 1 if index else 2
        cv2.putText(out, line, (8, y), cv2.FONT_HERSHEY_SIMPLEX,
                    scale, (0, 0, 0), thickness + 2, cv2.LINE_AA)
        cv2.putText(out, line, (8, y), cv2.FONT_HERSHEY_SIMPLEX,
                    scale, (245, 245, 245), thickness, cv2.LINE_AA)
        y += 18
    return out


def _format_regions(regions: dict[str, float] | None) -> str:
    regions = regions or {}
    return (
        f"M {regions.get('mustache', 0.0):.2f} "
        f"C {regions.get('chin', 0.0):.2f} "
        f"J {regions.get('jaw', 0.0):.2f}"
    )


def _load_labels(path: str | None) -> dict[str, dict]:
    if not path:
        return {}
    payload = json.loads(Path(path).read_text())
    return payload.get("labels", payload)


def _rect_mask(shape: tuple[int, int], rect: list[float]) -> np.ndarray:
    h, w = shape
    x0, y0, x1, y1 = rect
    xa = int(np.clip(round(x0 * w), 0, w))
    xb = int(np.clip(round(x1 * w), 0, w))
    ya = int(np.clip(round(y0 * h), 0, h))
    yb = int(np.clip(round(y1 * h), 0, h))
    mask = np.zeros(shape, dtype=bool)
    if xb > xa and yb > ya:
        mask[ya:yb, xa:xb] = True
    return mask


def _label_metrics(union: np.ndarray, label_entry: dict | None) -> dict:
    if not label_entry:
        return {}
    recalls: dict[str, float] = {}
    means: list[float] = []
    hits = total = 0
    for name in ("mustache", "chin"):
        rect = label_entry.get(name)
        if not rect:
            continue
        mask = _rect_mask(union.shape, rect)
        count = int(mask.sum())
        if count < 1:
            continue
        region_hits = int(((union > 0.3) & mask).sum())
        recalls[name] = region_hits / count
        means.append(float(union[mask].mean()))
        hits += region_hits
        total += count
    if total < 1:
        return {}
    return {
        "labelRecallGt03": round(hits / total, 4),
        "labelCoverageMean": round(float(np.mean(means)) if means else 0.0, 4),
        "mustacheRecall": round(recalls.get("mustache", 0.0), 4),
        "chinRecall": round(recalls.get("chin", 0.0), 4),
    }


def _stats_payload(masks: BeardMasks) -> dict:
    stats = masks.stats
    return {
        "protectOverlap": round(stats["protectOverlapRatio"], 4),
        "preProtectOverlap": round(stats["preProtectOverlapRatio"], 4),
        "hardMean": round(stats["hardHairMean"], 4),
        "shadowMean": round(stats["beardShadowMean"], 4),
        "strandCoverage": round(stats.get("strandCoverage", 0.0), 4),
        "stubbleDotMean": round(stats.get("stubbleDotMean", 0.0), 4),
        "shortHairMean": round(stats.get("shortHairMean", 0.0), 4),
        "shadowBlueGrayMean": round(stats.get("shadowBlueGrayMean", 0.0), 4),
        "localRefCandidateRatio": round(stats.get("localRefCandidateRatio", 0.0), 4),
        "hardComponentCount": stats.get("hardComponentCount"),
        "hardComponentKept": stats.get("hardComponentKept"),
        "hardBoundaryComponentDropped": stats.get("hardBoundaryComponentDropped"),
        "blackhatKernels": stats.get("blackhatKernels"),
        "regionCoverage": {
            k: round(v, 4)
            for k, v in stats.get("regionCoverage", {}).items()
        },
        "regionHardCoverage": {
            k: round(v, 4)
            for k, v in stats.get("regionHardCoverage", {}).items()
        },
        "regionShadowCoverage": {
            k: round(v, 4)
            for k, v in stats.get("regionShadowCoverage", {}).items()
        },
        "regionEditableArea": {
            k: round(v, 4)
            for k, v in stats.get("regionEditableArea", {}).items()
        },
    }


def _annotated_mask_tile(
    crop_bgr: np.ndarray,
    hard: np.ndarray,
    shadow: np.ndarray,
    protect: np.ndarray,
    tile_size: tuple[int, int],
    lines: list[str],
) -> np.ndarray:
    tile = cv2.resize(_overlay(crop_bgr, hard, shadow, protect), tile_size)
    return _annotate(tile, lines)


def _face_parsing_probe(bgr_crop: np.ndarray) -> np.ndarray:
    """C3: where does a CelebAMask-HQ parser put the beard? (expected: nowhere
    consistent — this candidate exists to be cheaply falsified)."""
    import torch
    from transformers import AutoModelForSemanticSegmentation, SegformerImageProcessor

    name = "jonathandinu/face-parsing"
    processor = SegformerImageProcessor.from_pretrained(name)
    model = AutoModelForSemanticSegmentation.from_pretrained(name)
    rgb = cv2.cvtColor(bgr_crop, cv2.COLOR_BGR2RGB)
    inputs = processor(images=rgb, return_tensors="pt")
    with torch.no_grad():
        logits = model(**inputs).logits
    seg = logits.argmax(dim=1)[0].numpy().astype(np.uint8)
    seg = cv2.resize(seg, (bgr_crop.shape[1], bgr_crop.shape[0]),
                     interpolation=cv2.INTER_NEAREST)
    # 'hair' class id in this checkpoint is 13 — visualize where it lands.
    return (seg == 13).astype(np.float32)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", default=str(LAB_ROOT / "samples"))
    parser.add_argument("--out", default=str(LAB_ROOT / "outputs" / "spike"))
    parser.add_argument("--labels", help="optional normalized crop rectangle labels JSON")
    parser.add_argument("--with-c2", action="store_true", help="CLIPSeg prior (extras)")
    parser.add_argument("--with-c3", action="store_true", help="face parsing probe (extras)")
    args = parser.parse_args()

    samples = sorted(
        p for p in Path(args.samples).iterdir()
        if is_supported_image_path(p)
    ) if Path(args.samples).exists() else []
    if not samples:
        print(f"no sample photos in {args.samples} — add consented photos first "
              "(see docs/beard-simulation/DATA_POLICY_KO.md)")
        return 1

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    labels = _load_labels(args.labels)
    rows: list[np.ndarray] = []
    metrics: dict[str, dict] = {}
    tile_w = 320

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
            print(f"  {photo.name}: rejected ({reason})")
            continue

        skin_model = fit_skin_model(
            skin_reference_pixels(bgr, detection.landmarks, detection.face_width))
        crop = build_lower_face_crop(
            bgr, detection.landmarks, detection.face_width, detection.face_height)
        label_entry = labels.get(photo.name)

        tiles = []
        h = int(crop.bgr.shape[0] * tile_w / crop.bgr.shape[1])
        tiles.append(cv2.resize(crop.bgr, (tile_w, h)))

        entry: dict = {}
        t0 = time.perf_counter()
        c1 = segment_beard(crop, skin_model)
        entry["c1"] = {
            "runtime_s": round(time.perf_counter() - t0, 3),
            **_stats_payload(c1),
            **_label_metrics(np.maximum(c1.hard, c1.shadow), label_entry),
        }
        tile_size = (tile_w, h)
        tiles.append(_annotated_mask_tile(
            crop.bgr,
            c1.hard,
            np.zeros_like(c1.shadow),
            crop.protect_mask,
            tile_size,
            [
                "C1 hard",
                f"H {entry['c1']['hardMean']:.3f} S {entry['c1']['strandCoverage']:.3f}",
                f"dot {entry['c1']['stubbleDotMean']:.3f} line {entry['c1']['shortHairMean']:.3f}",
                f"comp {entry['c1']['hardComponentKept']}/{entry['c1']['hardComponentCount']} "
                f"bd {entry['c1']['hardBoundaryComponentDropped']}",
            ],
        ))
        tiles.append(_annotated_mask_tile(
            crop.bgr,
            np.zeros_like(c1.hard),
            c1.shadow,
            crop.protect_mask,
            tile_size,
            [
                "C1 shadow",
                f"S {entry['c1']['shadowMean']:.3f} BG {entry['c1']['shadowBlueGrayMean']:.3f}",
                f"local-ref {entry['c1']['localRefCandidateRatio']:.2f}",
                _format_regions(entry["c1"]["regionShadowCoverage"]),
            ],
        ))
        tiles.append(_annotated_mask_tile(
            crop.bgr,
            c1.hard,
            c1.shadow,
            crop.protect_mask,
            tile_size,
            [
                "C1 union",
                f"H {entry['c1']['hardMean']:.3f} S {entry['c1']['shadowMean']:.3f}",
                f"preP {entry['c1']['preProtectOverlap']:.3f}",
                _format_regions(entry["c1"]["regionCoverage"]),
            ],
        ))

        if args.with_c2:
            try:
                t0 = time.perf_counter()
                prior = clipseg_beard_prior(crop.bgr)
                c2 = segment_beard(crop, skin_model, clipseg_prior=prior)
                entry["c2"] = {
                    "runtime_s": round(time.perf_counter() - t0, 3),
                    **_stats_payload(c2),
                    **_label_metrics(np.maximum(c2.hard, c2.shadow), label_entry),
                }
                tiles.append(_annotated_mask_tile(
                    crop.bgr,
                    c2.hard,
                    c2.shadow,
                    crop.protect_mask,
                    tile_size,
                    [
                        "C2 CLIPSeg",
                        f"H {entry['c2']['hardMean']:.3f} S {entry['c2']['shadowMean']:.3f}",
                        f"preP {entry['c2']['preProtectOverlap']:.3f}",
                        _format_regions(entry["c2"]["regionCoverage"]),
                    ],
                ))
            except RuntimeError as exc:
                entry["c2"] = {"error": str(exc)}
                tiles.append(_placeholder((h, tile_w), "C2: extras missing"))
        else:
            tiles.append(_placeholder((h, tile_w), "C2: --with-c2"))

        if args.with_c3:
            try:
                t0 = time.perf_counter()
                hair = _face_parsing_probe(crop.bgr)
                entry["c3"] = {
                    "runtime_s": round(time.perf_counter() - t0, 3),
                    "hairClassCoverage": round(float(hair.mean()), 4),
                }
                tiles.append(_annotated_mask_tile(
                    crop.bgr,
                    hair,
                    np.zeros_like(hair),
                    crop.protect_mask,
                    tile_size,
                    [
                        "C3 face parse",
                        f"hair {entry['c3']['hairClassCoverage']:.3f}",
                    ],
                ))
            except Exception as exc:  # extras missing or model download failure
                entry["c3"] = {"error": str(exc)}
                tiles.append(_placeholder((h, tile_w), "C3: extras missing"))
        else:
            tiles.append(_placeholder((h, tile_w), "C3: --with-c3"))

        metrics[photo.name] = entry
        row = cv2.hconcat(tiles)
        cv2.putText(row, photo.name, (8, 24), cv2.FONT_HERSHEY_SIMPLEX,
                    0.7, (0, 255, 255), 2)
        rows.append(row)
        print(
            f"  {photo.name}: "
            f"C1 hard={entry['c1']['hardMean']} "
            f"shadow={entry['c1']['shadowMean']} "
            f"preP={entry['c1']['preProtectOverlap']}"
        )

    if rows:
        max_w = max(r.shape[1] for r in rows)
        rows = [cv2.copyMakeBorder(r, 0, 8, 0, max_w - r.shape[1], cv2.BORDER_CONSTANT)
                for r in rows]
        grid = cv2.vconcat(rows)
        cv2.imwrite(str(out_dir / "spike_grid.png"), grid)
    (out_dir / "spike_metrics.json").write_text(json.dumps(metrics, indent=2))
    print(f"\nspike grid: {out_dir / 'spike_grid.png'}")
    print(f"metrics:    {out_dir / 'spike_metrics.json'}")
    print(
        "columns: [crop | C1 hard | C1 shadow | C1 union | C2 | C3]  "
        "overlay: hard=red shadow=blue protect=green"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
