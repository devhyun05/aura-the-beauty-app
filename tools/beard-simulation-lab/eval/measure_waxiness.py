"""Measure the eraser, not the detector: waxiness + chroma + wall time.

Runs the real correction path (segment -> correct_crop -> derive_soft_blend ->
composite_full) on the dev photos and scores the FINAL COMPOSITE -- the image a
person actually sees -- rather than the intermediate crop.

Everything is measured inside the beard zone and normalized by the same
person's clean skin, so:

    original  >> 1.0   (hair is texture)
    target    ~= 1.0
    waxy      << 1.0

Dev photos only. The holdout is one-shot and belongs to the final gate.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.beard_segmentation import BeardMasks, fit_skin_model, segment_beard  # noqa: E402
from engine.beard_shadow_corrector import (  # noqa: E402
    build_correction_context, correct_crop,
)
from engine.blend import composite_full, derive_soft_blend  # noqa: E402
from engine.detect_face import detect_face  # noqa: E402
from engine.lower_face_roi import (  # noqa: E402
    build_lower_face_crop, skin_reference_pixels,
)
from engine.pipeline import load_stage_config  # noqa: E402
from engine.texture import chroma_delta_ab, streak_score, waxiness_score  # noqa: E402
from eval.run_owndomain_eval import _fit, _restore, discover_pairs  # noqa: E402

LAB = Path(__file__).resolve().parents[1]
CONFIGS = LAB / "configs"
STAGES = ("mild", "medium", "strong")
# The correction's strength is proportional to the mask value, so measuring over
# a permissive zone lets weakly-edited pixels dominate the median and hides what
# the eraser did. 0.5 = the core the eraser actually rewrites.
ZONE_THR = 0.50

# The adopted detection config (raw sigmoid, no min-max), operating point 0.06.
CLIPSEG_MODEL = "CIDAS/clipseg-rd64-refined"
CLIPSEG_THR = 0.06


def clipseg_masks(crop, c1: BeardMasks) -> BeardMasks:
    """The masks we actually intend to ship: CLIPSeg supplies the zone, C1 the
    strands. Measuring the eraser under the weak C1 mask alone would flatter it
    -- C1 barely fires on Korean stubble, so the corrector does almost nothing
    and looks innocent. The mushing is latent and only surfaces once the mask is
    broad and confident, which is exactly what the adopted detector produces.
    """
    from eval.bench_models import clipseg_heat

    heat = clipseg_heat(CLIPSEG_MODEL, crop.bgr, ["beard stubble"], normalize=False)
    region = np.clip((heat - CLIPSEG_THR) / (1.0 - CLIPSEG_THR), 0, 1).astype(np.float32)
    dp = crop.detect_protect_mask
    dp = crop.protect_mask if dp is None else dp
    keep = crop.roi_mask * (1.0 - dp)
    return BeardMasks(hard=np.maximum(c1.hard, region * 0.9) * keep,
                      shadow=np.maximum(c1.shadow, region) * keep,
                      protect=c1.protect, stats=c1.stats)


def _zone_full(crop, masks, shape) -> np.ndarray:
    union = np.maximum(masks.hard, masks.shadow) * crop.roi_mask
    union = union * (1 - crop.protect_mask)
    return _restore(union, crop.bbox, shape) > ZONE_THR


def measure_one(name: str, img_path: Path, out_dir: Path,
                mask_source: str = "clipseg") -> dict | None:
    bgr = _fit(cv2.imread(str(img_path), cv2.IMREAD_COLOR))
    det = detect_face(bgr)
    if det is None or not det.quality.passed:
        return None
    shape = bgr.shape[:2]
    skin = fit_skin_model(skin_reference_pixels(bgr, det.landmarks, det.face_width))
    crop = build_lower_face_crop(bgr, det.landmarks, det.face_width, det.face_height)
    t0 = time.perf_counter()
    masks = segment_beard(crop, skin)
    if mask_source == "clipseg":
        masks = clipseg_masks(crop, masks)
    seg_s = time.perf_counter() - t0

    zone = _zone_full(crop, masks, shape)
    lm, fw = det.landmarks, det.face_width
    def score(img: np.ndarray) -> dict:
        return {"waxiness": waxiness_score(img, zone, lm, fw),
                "streak": streak_score(img, zone, lm, fw),
                "chromaDeltaAb": chroma_delta_ab(img, zone, lm, fw)}

    t0 = time.perf_counter()
    ctx = build_correction_context(crop, masks)
    rec_ctx_s = time.perf_counter() - t0

    rec: dict = {
        "id": name, "zonePx": int(zone.sum()), "segSeconds": round(seg_s, 3),
        "ctxSeconds": round(rec_ctx_s, 3),
        "strandCoverage": ctx.stats.get("strandCoverage"),
        "strandSkipped": ctx.stats.get("strandSkipped"),
        "original": score(bgr), "stages": {},
    }

    panels = [bgr]
    for stage in STAGES:
        p = load_stage_config(CONFIGS, stage)
        t0 = time.perf_counter()
        corrected = correct_crop(crop, masks, p["shadow_strength"],
                                 p["hair_attenuation"], p.get("stubble_inpaint", False),
                                 strand_strength=p.get("strand_strength"), context=ctx)
        corr_s = time.perf_counter() - t0
        soft = derive_soft_blend(crop, masks, p.get("feather_ratio", 0.035))
        result = composite_full(bgr, corrected, crop, soft, p.get("global_strength", 1.0))
        rec["stages"][stage] = {**score(result), "correctSeconds": round(corr_s, 3)}
        panels.append(result)

    x0, y0, x1, y1 = crop.bbox
    tiles = []
    for label, img in zip(("ORIGINAL", *[s.upper() for s in STAGES]), panels):
        t = img[y0:y1, x0:x1]
        h = 380
        t = cv2.resize(t, (int(t.shape[1] * h / t.shape[0]), h))
        bar = np.full((58, t.shape[1], 3), 22, np.uint8)
        wax = (rec["original"] if label == "ORIGINAL"
               else rec["stages"][label.lower()])["waxiness"]
        cv2.putText(bar, label, (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
        cv2.putText(bar, f"waxiness {wax:.2f}" if wax else "waxiness n/a", (8, 48),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (200, 200, 200), 1)
        tiles.append(cv2.vconcat([bar, t]))
    w = max(t.shape[1] for t in tiles)
    tiles = [cv2.copyMakeBorder(t, 0, 0, 0, w - t.shape[1], cv2.BORDER_CONSTANT,
                                value=(22, 22, 22)) for t in tiles]
    cv2.imwrite(str(out_dir / f"wax_{name}.jpg"), cv2.hconcat(tiles))
    return rec


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", required=True, help="subdir under outputs/waxiness")
    ap.add_argument("--masks", choices=("clipseg", "c1"), default="clipseg",
                    help="clipseg = the mask we intend to ship (default)")
    args = ap.parse_args()
    out_dir = LAB / "outputs" / "waxiness" / args.tag
    out_dir.mkdir(parents=True, exist_ok=True)

    records = [r for r in (measure_one(n, p, out_dir, args.masks)
                           for n, p, _ in discover_pairs()) if r is not None]
    print(f"mask source: {args.masks}\n")

    def col(key: str, stage: str | None = None) -> list[float]:
        vals = [(r["stages"][stage] if stage else r["original"])[key] for r in records]
        return [v for v in vals if v is not None]

    f = lambda v: f"{v:.3f}" if v is not None else "  n/a"  # noqa: E731
    for metric in ("waxiness", "streak", "chromaDeltaAb"):
        print(f"--- {metric} (zone core > {ZONE_THR}) ---")
        print(f"{'id':7} {'orig':>7} " + " ".join(f"{s:>8}" for s in STAGES))
        for r in records:
            vals = [r["original"][metric], *[r["stages"][s][metric] for s in STAGES]]
            print(f"{r['id']:7} {f(vals[0]):>7} " + " ".join(f"{f(x):>8}" for x in vals[1:]))
        means = [np.mean(col(metric)), *[np.mean(col(metric, s)) for s in STAGES]]
        print(f"{'MEAN':7} {means[0]:>7.3f} " + " ".join(f"{m:>8.3f}" for m in means[1:]) + "\n")

    mono = sum(
        all(v is not None for v in (r["original"]["waxiness"],
                                    *[r["stages"][s]["waxiness"] for s in STAGES]))
        and r["original"]["waxiness"] >= r["stages"]["mild"]["waxiness"]
        >= r["stages"]["medium"]["waxiness"] >= r["stages"]["strong"]["waxiness"]
        for r in records)
    print(f"waxiness monotone (orig >= mild >= medium >= strong): {mono}/{len(records)}")
    t_corr = [r["stages"][s]["correctSeconds"] for r in records for s in STAGES]
    t_seg = [r["segSeconds"] for r in records]
    t_ctx = [r.get("ctxSeconds", 0.0) for r in records]
    print(f"\ntiming: segment {np.mean(t_seg):.3f}s/photo   "
          f"context {np.mean(t_ctx):.3f}s/photo (max {max(t_ctx):.3f})   "
          f"correct {np.mean(t_corr):.3f}s/stage (max {max(t_corr):.3f})")
    print("strand coverage: " + "  ".join(
        f"{r['id']}={r.get('strandCoverage') or 0:.3f}"
        + ("(SKIP)" if r.get("strandSkipped") else "") for r in records))

    (out_dir / "waxiness.json").write_text(json.dumps(records, indent=2))
    print(f"\noutputs -> {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
