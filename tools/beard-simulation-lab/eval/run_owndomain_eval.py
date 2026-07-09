"""Own-domain evaluation: run C1 (and optionally a public model) against
hand-painted green masks on our own Korean selfies.

Purpose: the ND numbers were measured on CelebA-HQ (western celebrities, stage
lighting). This checks whether they transfer to our actual target users.

Two label sources, both "green paint = facial hair":
  samples/picN.png       + samples/greenN.png        (green on WHITE background)
  samples/302.../..layer_01..  + ..layer_02..        (green on TRANSPARENT background)

Ground truth is the union of visible hair + stubble, painted tight to the hair
(a stricter standard than the ND region-fill labels).
"""

from __future__ import annotations

import argparse
import json
import sys
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

LAB_ROOT = Path(__file__).resolve().parents[1]
SAMPLES = LAB_ROOT / "samples"
PSD_DIR = SAMPLES / "302beardPhotos_layers_separated"
OUT_DIR = LAB_ROOT / "outputs" / "owndomain_eval"

MAX_DIM = 1536  # matches the pipeline's working resolution
THRESHOLDS = (0.2, 0.3)


def discover_pairs() -> list[tuple[str, Path, Path]]:
    pairs: list[tuple[str, Path, Path]] = []
    for n in range(1, 9):
        pic = next((SAMPLES / f"pic{n}{e}" for e in (".png", ".PNG")
                    if (SAMPLES / f"pic{n}{e}").exists()), None)
        grn = next((SAMPLES / f"green{n}{e}" for e in (".png", ".PNG")
                    if (SAMPLES / f"green{n}{e}").exists()), None)
        if pic and grn:
            pairs.append((f"pic{n}", pic, grn))
    if PSD_DIR.is_dir():
        for img in sorted(PSD_DIR.glob("group_*layer_01*.png")):
            grp = img.name.split("_")[1]
            msk = next(PSD_DIR.glob(f"group_{grp}_*layer_02*.png"), None)
            if msk:
                pairs.append((f"psd{grp}", img, msk))
    return pairs


def _fit(img: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    s = MAX_DIM / max(h, w)
    if s < 1:
        return cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    return img


def load_gt_mask(path: Path, shape: tuple[int, int]) -> np.ndarray:
    """Green paint -> bool mask. Handles white-bg and transparent-bg exports."""
    m = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if m is None:
        raise FileNotFoundError(path)
    if m.ndim == 2:
        m = cv2.cvtColor(m, cv2.COLOR_GRAY2BGR)
    alpha = m[..., 3] > 0 if m.shape[2] == 4 else np.ones(m.shape[:2], bool)
    b, g, r = (m[..., i].astype(int) for i in range(3))
    green = (g > 90) & (g - r > 35) & (g - b > 35)
    mask = (green & alpha).astype(np.uint8)
    if mask.shape != shape:
        mask = cv2.resize(mask, (shape[1], shape[0]), interpolation=cv2.INTER_NEAREST)
    return mask.astype(bool)


def _restore(mask: np.ndarray, bbox, shape: tuple[int, int]) -> np.ndarray:
    canvas = np.zeros(shape, dtype=np.float32)
    x0, y0, x1, y1 = bbox
    h, w = mask.shape
    x1 = min(x1, x0 + w, shape[1])
    y1 = min(y1, y0 + h, shape[0])
    canvas[y0:y1, x0:x1] = mask[: y1 - y0, : x1 - x0]
    return canvas


def _score(pred: np.ndarray, gt: np.ndarray) -> dict:
    inter = float(np.logical_and(pred, gt).sum())
    union = float(np.logical_or(pred, gt).sum())
    pa, ga = float(pred.sum()), float(gt.sum())
    return {
        "iou": inter / union if union else None,
        "precision": inter / pa if pa else None,
        "recall": inter / ga if ga else None,
    }


def evaluate(name: str, img_path: Path, mask_path: Path) -> dict:
    bgr = _fit(cv2.imread(str(img_path), cv2.IMREAD_COLOR))
    if bgr is None:
        return {"id": name, "status": "load_failed"}
    gt = load_gt_mask(mask_path, bgr.shape[:2])

    det = detect_face(bgr)
    if det is None or not det.quality.passed:
        return {"id": name, "status": "gate_rejected",
                "reason": det.quality.reject_reason if det else "no_face"}

    skin = fit_skin_model(skin_reference_pixels(bgr, det.landmarks, det.face_width))
    crop = build_lower_face_crop(bgr, det.landmarks, det.face_width, det.face_height)
    masks = segment_beard(crop, skin)

    shape = bgr.shape[:2]
    pred_union = np.maximum(_restore(masks.hard, crop.bbox, shape),
                            _restore(masks.shadow, crop.bbox, shape))
    editable = _restore(crop.roi_mask * (1 - crop.protect_mask), crop.bbox, shape) > 0.5

    out: dict = {"id": name, "status": "processed",
                 "gtPixels": int(gt.sum()), "gtOutsideRoiPct": None, "metrics": {}}
    if gt.sum():
        out["gtOutsideRoiPct"] = round(100.0 * float((gt & ~editable).sum()) / float(gt.sum()), 1)
    for thr in THRESHOLDS:
        pb = pred_union > thr
        out["metrics"][f"{thr}"] = {
            "full": _score(pb, gt),
            "roi": _score(pb & editable, gt & editable),
        }
    out["_arrays"] = (bgr, gt, pred_union > 0.3, editable)
    return out


def make_report(records: list[dict]) -> None:
    rows = []
    for r in records:
        if r["status"] != "processed":
            rows.append(f'<tr><td>{r["id"]}</td><td colspan=4>{r["status"]}: {r.get("reason","")}</td></tr>')
            continue
        bgr, gt, pred, _ = r.pop("_arrays")

        def tint(base, m, color):
            o = base.astype(np.float32).copy()
            for c in range(3):
                o[..., c] = np.where(m, 0.4 * o[..., c] + 0.6 * color[c], o[..., c])
            return o.astype(np.uint8)

        tiles = [bgr, tint(bgr, gt, (0, 200, 0)), tint(bgr, pred, (0, 0, 220)),
                 tint(bgr, pred & gt, (0, 220, 220))]
        h = 340
        tiles = [cv2.resize(t, (int(t.shape[1] * h / t.shape[0]), h)) for t in tiles]
        cv2.imwrite(str(OUT_DIR / f"tile_{r['id']}.jpg"), cv2.hconcat(tiles))
        m = r["metrics"]["0.3"]["roi"]
        iou = f'{m["iou"]:.3f}' if m["iou"] is not None else "-"
        rec = f'{m["recall"]:.3f}' if m["recall"] is not None else "-"
        pre = f'{m["precision"]:.3f}' if m["precision"] is not None else "-"
        rows.append(f'<tr><td>{r["id"]}<br>IoU {iou}<br>R {rec}<br>P {pre}</td>'
                    f'<td colspan=4><img src="tile_{r["id"]}.jpg"></td></tr>')
    html = ("<!doctype html><meta charset=utf-8><title>own-domain eval</title>"
            "<style>body{font:13px sans-serif;background:#111;color:#ddd;padding:12px}"
            "table{border-collapse:collapse}td{padding:4px;border-bottom:1px solid #333}"
            "img{max-width:1400px}</style><table><caption>original | GT(green) | "
            "C1 pred(red) | intersection(yellow)</caption>" + "\n".join(rows) + "</table>")
    (OUT_DIR / "report.html").write_text(html)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pairs = discover_pairs()
    if not pairs:
        print("no (image, green-mask) pairs found")
        return 1
    print(f"found {len(pairs)} pairs: {[p[0] for p in pairs]}\n")

    records = [evaluate(*p) for p in pairs]
    proc = [r for r in records if r["status"] == "processed"]

    print(f"{'id':8} {'gt px':>8} {'GT outside ROI':>15} "
          f"{'IoU@.3':>8} {'P@.3':>7} {'R@.3':>7} {'IoU@.2':>8} {'R@.2':>7}")
    for r in records:
        if r["status"] != "processed":
            print(f'{r["id"]:8} {r["status"]} {r.get("reason","")}')
            continue
        a, b = r["metrics"]["0.3"]["roi"], r["metrics"]["0.2"]["roi"]
        f = lambda v: f"{v:.3f}" if v is not None else "  -  "  # noqa: E731
        print(f'{r["id"]:8} {r["gtPixels"]:>8} {str(r["gtOutsideRoiPct"])+"%":>15} '
              f'{f(a["iou"]):>8} {f(a["precision"]):>7} {f(a["recall"]):>7} '
              f'{f(b["iou"]):>8} {f(b["recall"]):>7}')

    def mean(thr, key):
        v = [r["metrics"][thr]["roi"][key] for r in proc
             if r["metrics"][thr]["roi"][key] is not None]
        return float(np.mean(v)) if v else None

    summary = {
        "pairs": len(pairs), "processed": len(proc),
        "gateRejected": [r["id"] for r in records if r["status"] == "gate_rejected"],
        "meanRoi": {t: {k: mean(t, k) for k in ("iou", "precision", "recall")}
                    for t in ("0.2", "0.3")},
    }
    print("\n=== MEAN (roi) ===")
    for t in ("0.3", "0.2"):
        m = summary["meanRoi"][t]
        g = lambda k: f'{m[k]:.3f}' if m[k] is not None else "-"  # noqa: E731
        print(f'  thr{t}:  IoU={g("iou")}  Precision={g("precision")}  Recall={g("recall")}')

    make_report(records)
    for r in records:
        r.pop("_arrays", None)
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2))
    (OUT_DIR / "results.json").write_text(json.dumps(records, indent=2))
    print(f"\noutputs -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
