"""External evaluation of C1 segmentation against the Notre Dame FG2025
facial-hair annotations (docs/beard-simulation/PLAN_ND_EVAL_CODEX.md).

PURPOSE IS MEASUREMENT, NOT IMPROVEMENT. engine/ is evaluated as-is; this
script never imports anything mutable from it beyond the public seg functions.

Flow per id:
  CelebA-HQ jpg → detect_face (quality gate) → build_lower_face_crop
  → segment_beard → restore crop-space hard/shadow onto a 1024² canvas
  → compare against GT (hard = beard∪mustache, shadow = shadow)
  → IoU / precision / recall over channel × threshold × scope.

Resumable: existing ids in results.jsonl are skipped so a crashed run resumes.
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

from engine.beard_segmentation import fit_skin_model, segment_beard  # noqa: E402
from engine.detect_face import detect_face  # noqa: E402
from engine.lower_face_roi import (  # noqa: E402
    build_lower_face_crop,
    skin_reference_pixels,
)
from engine.nd_annotations import (  # noqa: E402
    default_annotations_root,
    list_annotation_ids,
    load_annotation,
    to_engine_channels,
)

LAB_ROOT = Path(__file__).resolve().parents[1]
IMG_DIR = LAB_ROOT / "external" / "CelebAMask-HQ" / "CelebA-HQ-img"
OUT_DIR = LAB_ROOT / "outputs" / "nd_eval"

CHANNELS = ("hard", "shadow", "union")
THRESHOLDS = (0.2, 0.3, 0.4, 0.5)
SCOPES = ("full", "roi")
CANVAS = 1024

# Report/headline metric: union channel, roi scope, threshold 0.3.
HEADLINE = ("union", "0.3", "roi")


def _restore_to_canvas(mask: np.ndarray, bbox: tuple[int, int, int, int]) -> np.ndarray:
    canvas = np.zeros((CANVAS, CANVAS), dtype=np.float32)
    x0, y0, x1, y1 = bbox
    h, w = mask.shape
    # Guard against off-by-one if crop bbox exceeds the (already 1024) image.
    x1 = min(x1, x0 + w, CANVAS)
    y1 = min(y1, y0 + h, CANVAS)
    canvas[y0:y1, x0:x1] = mask[: y1 - y0, : x1 - x0]
    return canvas


def _score(pred_bin: np.ndarray, gt_bin: np.ndarray) -> dict:
    inter = float(np.logical_and(pred_bin, gt_bin).sum())
    union = float(np.logical_or(pred_bin, gt_bin).sum())
    pred_area = float(pred_bin.sum())
    gt_area = float(gt_bin.sum())
    return {
        "iou": (inter / union) if union > 0 else None,
        "precision": (inter / pred_area) if pred_area > 0 else None,
        "recall": (inter / gt_area) if gt_area > 0 else None,
    }


def _metrics_for(
    pred: dict[str, np.ndarray],
    gt: dict[str, np.ndarray],
    editable: np.ndarray,
) -> dict:
    pred_union = np.maximum(pred["hard"], pred["shadow"])
    gt_union = np.maximum(gt["hard"], gt["shadow"])
    pred_maps = {"hard": pred["hard"], "shadow": pred["shadow"], "union": pred_union}
    gt_maps = {"hard": gt["hard"] > 0.5, "shadow": gt["shadow"] > 0.5, "union": gt_union > 0.5}
    scope_masks = {"full": np.ones((CANVAS, CANVAS), bool), "roi": editable > 0.5}

    out: dict = {}
    for channel in CHANNELS:
        out[channel] = {}
        for thr in THRESHOLDS:
            pred_bin_base = pred_maps[channel] > thr
            out[channel][f"{thr}"] = {}
            for scope in SCOPES:
                sm = scope_masks[scope]
                out[channel][f"{thr}"][scope] = _score(
                    pred_bin_base & sm, gt_maps[channel] & sm)
    return out


def evaluate_id(image_id: str, anno_root: Path) -> dict:
    img_path = IMG_DIR / f"{image_id}.jpg"
    bgr = cv2.imread(str(img_path))
    if bgr is None:
        return {"id": image_id, "status": "load_failed", "reason": "imread_none"}
    if bgr.shape[0] != CANVAS or bgr.shape[1] != CANVAS:
        bgr = cv2.resize(bgr, (CANVAS, CANVAS), interpolation=cv2.INTER_AREA)

    detection = detect_face(bgr)
    if detection is None or not detection.quality.passed:
        reason = detection.quality.reject_reason if detection else "no_face_detected"
        return {"id": image_id, "status": "gate_rejected", "reason": reason}

    skin_model = fit_skin_model(
        skin_reference_pixels(bgr, detection.landmarks, detection.face_width))
    crop = build_lower_face_crop(
        bgr, detection.landmarks, detection.face_width, detection.face_height)
    masks = segment_beard(crop, skin_model)

    pred = {
        "hard": _restore_to_canvas(masks.hard, crop.bbox),
        "shadow": _restore_to_canvas(masks.shadow, crop.bbox),
    }
    editable = _restore_to_canvas(
        crop.roi_mask * (1 - crop.protect_mask), crop.bbox)

    gt_masks = load_annotation(image_id, anno_root)
    gt = to_engine_channels(gt_masks)

    metrics = _metrics_for(pred, gt, editable)
    headline = metrics[HEADLINE[0]][HEADLINE[1]][HEADLINE[2]]
    return {
        "id": image_id,
        "status": "processed",
        "gtClasses": sorted(gt_masks.keys()),
        "headlineIoU": headline["iou"],
        "metrics": metrics,
    }


def _load_done(results_path: Path) -> set[str]:
    if not results_path.exists():
        return set()
    done = set()
    for line in results_path.read_text().splitlines():
        if line.strip():
            done.add(json.loads(line)["id"])
    return done


def _agg(values: list[float]) -> dict:
    vals = [v for v in values if v is not None]
    if not vals:
        return {"n": 0, "mean": None, "median": None}
    return {
        "n": len(vals),
        "mean": round(float(np.mean(vals)), 4),
        "median": round(float(np.median(vals)), 4),
    }


def build_summary(records: list[dict], runtime: float) -> dict:
    processed = [r for r in records if r["status"] == "processed"]
    gate = [r for r in records if r["status"] == "gate_rejected"]
    load_failed = [r for r in records if r["status"] == "load_failed"]

    gate_reasons: dict[str, int] = {}
    for r in gate:
        gate_reasons[r["reason"]] = gate_reasons.get(r["reason"], 0) + 1

    def per_channel(subset: list[dict]) -> dict:
        table: dict = {}
        for channel in CHANNELS:
            table[channel] = {}
            for thr in THRESHOLDS:
                table[channel][f"{thr}"] = {}
                for scope in SCOPES:
                    for metric in ("iou", "precision", "recall"):
                        vals = [
                            r["metrics"][channel][f"{thr}"][scope][metric]
                            for r in subset
                        ]
                        table[channel][f"{thr}"].setdefault(scope, {})[metric] = _agg(vals)
        return table

    shadow_subset = [r for r in processed if "shadow" in r.get("gtClasses", [])]
    beard_only = [
        r for r in processed
        if "beard" in r.get("gtClasses", []) and "shadow" not in r.get("gtClasses", [])
    ]
    mustache_only = [
        r for r in processed
        if r.get("gtClasses") == ["mustache"]
    ]

    total = len(records)
    reconciliation_ok = (len(processed) + len(gate) + len(load_failed)) == total
    return {
        "total": total,
        "processed": len(processed),
        "gateRejected": gate_reasons,
        "gateRejectedTotal": len(gate),
        "loadFailed": len(load_failed),
        "reconciliationOk": reconciliation_ok,
        "runtimeSec": round(runtime, 1),
        "perChannel": per_channel(processed),
        "subsets": {
            "shadow500": {"n": len(shadow_subset), "perChannel": per_channel(shadow_subset)},
            "beardOnly": {"n": len(beard_only), "perChannel": per_channel(beard_only)},
            "mustacheOnly": {"n": len(mustache_only), "perChannel": per_channel(mustache_only)},
        },
    }


def _overlay_tiles(image_id: str, anno_root: Path, size: int = 300) -> list[np.ndarray] | None:
    """[original | GT green | pred red | intersection yellow] for the report."""
    bgr = cv2.imread(str(IMG_DIR / f"{image_id}.jpg"))
    if bgr is None:
        return None
    if bgr.shape[0] != CANVAS:
        bgr = cv2.resize(bgr, (CANVAS, CANVAS))
    detection = detect_face(bgr)
    if detection is None or not detection.quality.passed:
        return None
    skin_model = fit_skin_model(
        skin_reference_pixels(bgr, detection.landmarks, detection.face_width))
    crop = build_lower_face_crop(
        bgr, detection.landmarks, detection.face_width, detection.face_height)
    masks = segment_beard(crop, skin_model)
    pred = np.maximum(
        _restore_to_canvas(masks.hard, crop.bbox),
        _restore_to_canvas(masks.shadow, crop.bbox))
    gt = to_engine_channels(load_annotation(image_id, anno_root))
    gt_union = np.maximum(gt["hard"], gt["shadow"]) > 0.5
    pred_bin = pred > 0.3

    def tint(base, mask, color):
        out = base.astype(np.float32).copy()
        for c in range(3):
            out[..., c] = np.where(mask, 0.4 * out[..., c] + 0.6 * color[c], out[..., c])
        return out.astype(np.uint8)

    inter = pred_bin & gt_union
    tiles = [
        bgr,
        tint(bgr, gt_union, (0, 200, 0)),
        tint(bgr, pred_bin, (0, 0, 220)),
        tint(bgr, inter, (0, 220, 220)),
    ]
    return [cv2.resize(t, (size, size)) for t in tiles]


def write_report(records: list[dict], anno_root: Path) -> None:
    processed = [r for r in records if r["status"] == "processed" and r["headlineIoU"] is not None]
    processed.sort(key=lambda r: r["headlineIoU"])
    worst = processed[:10]
    best = processed[-10:][::-1]

    rows = []
    for label, group in (("WORST 10", worst), ("BEST 10", best)):
        rows.append(f'<tr><td colspan=5 class=sec>{label} (union IoU, roi, thr 0.3)</td></tr>')
        for r in group:
            tiles = _overlay_tiles(r["id"], anno_root)
            if tiles is None:
                continue
            strip = cv2.hconcat(tiles)
            path = OUT_DIR / f"tile_{r['id']}.jpg"
            cv2.imwrite(str(path), strip)
            rows.append(
                f'<tr><td>{r["id"]}<br>IoU {r["headlineIoU"]:.3f}<br>'
                f'{",".join(r.get("gtClasses", []))}</td>'
                f'<td colspan=4><img src="tile_{r["id"]}.jpg"></td></tr>')

    html = (
        "<!doctype html><meta charset=utf-8><title>ND eval</title>"
        "<style>body{font:13px sans-serif;background:#111;color:#ddd;padding:12px}"
        "table{border-collapse:collapse}td{padding:4px;border-bottom:1px solid #333;vertical-align:top}"
        "img{max-width:1200px}.sec{font-size:15px;color:#6cf;padding-top:14px}"
        "caption{text-align:left;padding:8px 0}</style>"
        "<table><caption>columns per row: original | GT(green) | pred(red) | intersection(yellow)</caption>"
        + "\n".join(rows) + "</table>")
    (OUT_DIR / "report.html").write_text(html)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="0 = all ids")
    parser.add_argument("--anno-root", default=str(default_annotations_root()))
    args = parser.parse_args()

    anno_root = Path(args.anno_root)
    ids = list_annotation_ids(anno_root)
    if not ids:
        print(f"no ND annotations under {anno_root}")
        return 1
    if args.limit:
        ids = ids[: args.limit]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results_path = OUT_DIR / "results.jsonl"
    done = _load_done(results_path)
    todo = [i for i in ids if i not in done]
    print(f"ids={len(ids)} done={len(done)} todo={len(todo)}")

    started = time.perf_counter()
    with open(results_path, "a") as fh:
        for n, image_id in enumerate(todo, 1):
            try:
                record = evaluate_id(image_id, anno_root)
            except Exception as exc:  # never let one bad id kill the whole run
                record = {"id": image_id, "status": "load_failed", "reason": f"exc:{exc}"}
            fh.write(json.dumps(record) + "\n")
            fh.flush()
            if n % 100 == 0 or n == len(todo):
                print(f"  {n}/{len(todo)} last={image_id} status={record['status']}")

    records = [json.loads(line) for line in results_path.read_text().splitlines() if line.strip()]
    records = [r for r in records if r["id"] in set(ids)]
    runtime = time.perf_counter() - started
    summary = build_summary(records, runtime)
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2))
    write_report(records, anno_root)

    h = summary["perChannel"]["union"]["0.3"]["roi"]
    s = summary["subsets"]["shadow500"]["perChannel"]["shadow"]["0.3"]["roi"]
    print(f"\nreconciliationOk={summary['reconciliationOk']} "
          f"processed={summary['processed']} gate={summary['gateRejectedTotal']} "
          f"loadFailed={summary['loadFailed']}")
    print(f"union roi thr0.3  IoU={h['iou']['mean']} P={h['precision']['mean']} R={h['recall']['mean']}")
    print(f"shadow500 shadow roi thr0.3  IoU={s['iou']['mean']} R={s['recall']['mean']} (n={summary['subsets']['shadow500']['n']})")
    print(f"outputs → {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
