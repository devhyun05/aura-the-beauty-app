"""Benchmark candidate beard-segmentation models on our own selfies.

Compares, on the SAME 9 hand-labeled pairs, the SAME lower-face ROI, and the
SAME IoU/precision/recall definitions:

  - C1                 our deterministic rules (reference)
  - clipseg-rd64       public model, several text prompts + a prompt ensemble
  - clipseg-rd16       smaller CLIPSeg variant (on-device candidate)

Also records params / weight size / CPU latency per image, because the model we
pick has to fit on an iPhone. engine/ is never modified: CLIPSeg is called
directly here so prompts can vary.

Threshold caveat: CLIPSeg heatmaps are min-max normalized per image, so an
absolute threshold is not calibrated. We therefore report each config at its
BEST threshold as well as at fixed ones.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.beard_segmentation import fit_skin_model, segment_beard  # noqa: E402
from engine.detect_face import detect_face  # noqa: E402
from engine.lower_face_roi import (  # noqa: E402
    build_lower_face_crop,
    skin_reference_pixels,
)
from eval.run_owndomain_eval import (  # noqa: E402
    _fit,
    _restore,
    _score,
    discover_pairs,
    load_gt_mask,
)

OUT_DIR = Path(__file__).resolve().parents[1] / "outputs" / "bench_models"
THRESHOLDS = (0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5)

PROMPTS = {
    "p_stubble": ["beard stubble"],
    "p_beard": ["beard"],
    "p_facialhair": ["facial hair"],
    "p_mustache_beard": ["mustache and beard"],
    "p_ensemble": ["beard", "beard stubble", "facial hair", "mustache",
                   "unshaven face", "five o'clock shadow"],
}

_CACHE: dict = {}


def load_clipseg(name: str):
    if name not in _CACHE:
        from transformers import CLIPSegForImageSegmentation, CLIPSegProcessor
        proc = CLIPSegProcessor.from_pretrained(name)
        model = CLIPSegForImageSegmentation.from_pretrained(name)
        model.eval()
        params = sum(p.numel() for p in model.parameters())
        _CACHE[name] = (proc, model, params)
    return _CACHE[name]


def clipseg_heat(model_name: str, bgr_crop: np.ndarray, prompts: list[str],
                 normalize: bool = True) -> np.ndarray:
    """Mean sigmoid heatmap over prompts, resized to the crop.

    normalize=True is the historical min-max rescale (kept as default so existing
    callers and their thresholds are unchanged). It turned out to HURT: min-max
    rescales every image's peak to 1.0, so a nearly beardless face's faint noise
    blooms to full confidence -- amplifying exactly the cross-image
    miscalibration that makes CLIPSeg spray. Raw sigmoid (normalize=False) beats
    it on both mean IoU (0.491 -> 0.507) and worst-case IoU (0.239 -> 0.329)
    against REGION GT, so the protocol operating config uses normalize=False.
    """
    import torch

    proc, model, _ = load_clipseg(model_name)
    rgb = cv2.cvtColor(bgr_crop, cv2.COLOR_BGR2RGB)
    inputs = proc(text=prompts, images=[rgb] * len(prompts), return_tensors="pt",
                  padding=True, truncation=True)
    with torch.no_grad():
        logits = model(**inputs).logits
    heat = torch.sigmoid(logits)
    if heat.ndim == 3:
        heat = heat.mean(0)
    heat = heat.squeeze().numpy().astype(np.float32)
    if normalize:
        heat -= heat.min()
        heat /= max(heat.max(), 1e-6)
    return cv2.resize(heat, (bgr_crop.shape[1], bgr_crop.shape[0]))


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pairs = discover_pairs()
    print(f"{len(pairs)} pairs\n")

    configs: list[tuple[str, str, list[str] | None]] = [("c1", "-", None)]
    for key, prompts in PROMPTS.items():
        configs.append((f"rd64:{key}", "CIDAS/clipseg-rd64-refined", prompts))
    configs.append(("rd16:p_ensemble", "CIDAS/clipseg-rd16", PROMPTS["p_ensemble"]))

    # per config -> per threshold -> list of scores; plus latency
    scores: dict = {c[0]: {f"{t}": [] for t in THRESHOLDS} for c in configs}
    latency: dict = {c[0]: [] for c in configs}
    params: dict = {}

    for name, img_path, mask_path in pairs:
        bgr = _fit(cv2.imread(str(img_path), cv2.IMREAD_COLOR))
        gt = load_gt_mask(mask_path, bgr.shape[:2])
        det = detect_face(bgr)
        if det is None or not det.quality.passed:
            print(f"{name}: gate rejected, skipped")
            continue
        skin = fit_skin_model(skin_reference_pixels(bgr, det.landmarks, det.face_width))
        crop = build_lower_face_crop(bgr, det.landmarks, det.face_width, det.face_height)
        shape = bgr.shape[:2]
        editable = _restore(crop.roi_mask * (1 - crop.protect_mask), crop.bbox, shape) > 0.5
        gt_roi = gt & editable

        for cfg, model_name, prompts in configs:
            t0 = time.perf_counter()
            if cfg == "c1":
                m = segment_beard(crop, skin)
                pred = np.maximum(_restore(m.hard, crop.bbox, shape),
                                  _restore(m.shadow, crop.bbox, shape))
            else:
                heat = clipseg_heat(model_name, crop.bgr, prompts)
                pred = _restore(heat, crop.bbox, shape)
                params[cfg] = load_clipseg(model_name)[2]
            latency[cfg].append(time.perf_counter() - t0)
            for t in THRESHOLDS:
                scores[cfg][f"{t}"].append(_score((pred > t) & editable, gt_roi))
        print(f"  {name} done")

    def agg(cfg: str, thr: str, key: str):
        v = [s[key] for s in scores[cfg][thr] if s[key] is not None]
        return float(np.mean(v)) if v else None

    print(f"\n{'config':20} {'best thr':>9} {'IoU':>7} {'Prec':>7} {'Rec':>7} "
          f"{'params':>9} {'sec/img':>8}")
    summary = {}
    for cfg, _, _ in configs:
        best = max(THRESHOLDS, key=lambda t: agg(cfg, f"{t}", "iou") or -1)
        bt = f"{best}"
        iou, p, r = (agg(cfg, bt, k) for k in ("iou", "precision", "recall"))
        pn = params.get(cfg)
        pstr = f"{pn/1e6:.0f}M" if pn else "-"
        lat = float(np.mean(latency[cfg])) if latency[cfg] else 0.0
        g = lambda v: f"{v:.3f}" if v is not None else "  -  "  # noqa: E731
        print(f"{cfg:20} {bt:>9} {g(iou):>7} {g(p):>7} {g(r):>7} {pstr:>9} {lat:>8.2f}")
        summary[cfg] = {"bestThr": best, "iou": iou, "precision": p, "recall": r,
                        "params": pn, "secPerImage": round(lat, 3),
                        "byThreshold": {f"{t}": {k: agg(cfg, f"{t}", k)
                                                 for k in ("iou", "precision", "recall")}
                                        for t in THRESHOLDS}}
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2))
    print(f"\noutputs -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
