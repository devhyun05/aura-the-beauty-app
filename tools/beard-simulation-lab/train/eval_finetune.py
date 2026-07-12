"""Base vs fine-tuned LaMa on dev material — the cp7-verdict yardstick.

Runs the CURRENT pipeline front end (prepare_unlabeled + build_mask, shared
by both arms) on dev-demoted photos, fills the same (image, mask) twice —
once with the pinned base big-lama, once with a fine-tuned weights file —
and writes [ORIG | base | fine-tuned] sheets + simple fill metrics:

  texRatio : relative_grain_map median in the hole, result/original
             (1.0 = texture preserved; cp6 factorial wax cases sat at 0.2-0.4)
  dL50     : median L shift in the hole (over-brightening — the 4574 failure)
  dAb50    : median chroma distance in the hole vs original

The human-confirmed cp7 failure cases (medium_cp7_09 etc., demoted to dev at
unseal) are first-class eval photos: the question is whether the fine-tune
reduces the jaw/lip deformation and gray-wax the judge rejected 8/8.

Usage: eval_finetune.py --weights outputs/finetune/lama_face_v01/weights_last.pt
       [--photos p1 p2 ...] (default: demoted cp7 fill cases + dev psd03/pic3)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import cv2
import numpy as np

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB))

from engine.texture import relative_grain_map  # noqa: E402
from spike import hybrid_recon as HR  # noqa: E402
from spike import lama_runner  # noqa: E402
from spike.oracle_kill import label  # noqa: E402

REPO = LAB.parents[1]
OUT = LAB / "outputs" / "finetune"
DEFAULT_PHOTOS = [
    REPO / "아카이브/webset_cp7/medium_cp7_09.jpg",
    REPO / "아카이브/webset_cp7/stubble_cp7_01.jpg",
    REPO / "아카이브/webset_cp7/stubble_cp7_05.jpg",
    REPO / "아카이브/webset_cp7/cp7_run/variants/medium_cp7_09__jpeg40.png",
    LAB / "samples/pic3.png",
]


def _swap_weights(path: Path) -> None:
    """Point lama_runner at a different pinned weights file (dev eval only)."""
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    man = path.parent / f"{path.stem}_pin.json"
    man.write_text(json.dumps({"sha256": sha}))
    lama_runner.WEIGHTS = path
    lama_runner.MANIFEST = man
    lama_runner._MODEL = None
    lama_runner._WEIGHTS_SHA = None


def _metrics(orig: np.ndarray, fill: np.ndarray, hole: np.ndarray) -> dict:
    g_o = relative_grain_map(orig)[hole]
    g_f = relative_grain_map(fill)[hole]
    lab_o = cv2.cvtColor(orig, cv2.COLOR_BGR2Lab).astype(np.float32)
    lab_f = cv2.cvtColor(fill, cv2.COLOR_BGR2Lab).astype(np.float32)
    dl = lab_f[..., 0] - lab_o[..., 0]
    dab = np.hypot(lab_f[..., 1] - lab_o[..., 1], lab_f[..., 2] - lab_o[..., 2])
    return {"texRatio": round(float(np.median(g_f) / max(np.median(g_o), 1e-6)), 3),
            "dL50": round(float(np.median(dl[hole])), 2),
            "dAb50": round(float(np.median(dab[hole])), 2)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", required=True, type=Path)
    ap.add_argument("--photos", nargs="*", type=Path, default=DEFAULT_PHOTOS)
    ap.add_argument("--tag", default=None)
    args = ap.parse_args()
    tag = args.tag or args.weights.parent.name
    out = OUT / f"eval_{tag}"
    out.mkdir(parents=True, exist_ok=True)

    rows = []
    for p in args.photos:
        stem = p.stem
        ctx = HR.prepare_unlabeled(stem, p)
        if ctx is None or "abstain" in ctx:
            print(f"{stem}: entry abstain — skipped "
                  f"({(ctx or {}).get('abstain')})")
            continue
        edit_mask, model_mask, guards = HR.build_mask(ctx)
        if edit_mask is None or not edit_mask.any():
            print(f"{stem}: no mask — skipped")
            continue
        crop = ctx["crop"]

        _swap_weights(LAB / "external/models/big-lama/big-lama.pt")
        base_fill, _ = HR.run_lama(ctx, edit_mask, model_mask)
        _swap_weights(args.weights)
        ft_fill, _ = HR.run_lama(ctx, edit_mask, model_mask)

        mb = _metrics(crop.bgr, base_fill, edit_mask)
        mf = _metrics(crop.bgr, ft_fill, edit_mask)
        rows.append({"photo": stem, "base": mb, "ft": mf,
                     "editPx": int(edit_mask.sum())})
        sheet = np.hstack([label(crop.bgr, "ORIG"),
                           label(base_fill, "BASE"),
                           label(ft_fill, "FINETUNE")])
        cv2.imwrite(str(out / f"{stem}.png"), sheet)
        print(f"{stem}: base {mb} | ft {mf}", flush=True)

    (out / "metrics.json").write_text(json.dumps(rows, indent=2) + "\n")
    print(f"-> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
