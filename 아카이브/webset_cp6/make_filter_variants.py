#!/usr/bin/env python3
"""Checkpoint 6 deterministic filter/compression variants.

Pre-registered in docs/beard-simulation/CHECKPOINT6_PROTOCOL.md (Appendix A).
Frozen parameters below MUST NOT change after the protocol manifest commit.

Three variants per input image:
  beauty : beauty-filter approximation — 2-pass strong bilateral + LAB L-lift
  jpeg40 : JPEG re-compression at quality 40 (decoded back, saved lossless)
  down06 : 0.6x downscale (INTER_AREA) then restore to original size (INTER_CUBIC)

Safety: refuses to process sealed checkpoint material (paths under webset_cp6,
IMG_4* holdout filenames) unless --checkpoint-build is passed. Dev verification
must run only on copies of dev photos (e.g. pic3.png) in the scratchpad.

Usage:
  python make_filter_variants.py --out OUTDIR IMAGE [IMAGE ...]
  python make_filter_variants.py --checkpoint-build --out OUTDIR IMAGE ...
"""

from __future__ import annotations

import argparse
import pathlib
import sys

import cv2
import numpy as np

# ---- FROZEN PARAMETERS (pre-registered; do not edit after manifest commit) ----
BEAUTY_BILATERAL_D = 9
BEAUTY_BILATERAL_SIGMA_COLOR = 75.0
BEAUTY_BILATERAL_SIGMA_SPACE = 75.0
BEAUTY_BILATERAL_PASSES = 2
BEAUTY_L_LIFT = 6            # additive lift on LAB L channel (0-255 scale)
JPEG_QUALITY = 40
DOWNSCALE_FACTOR = 0.6
# -------------------------------------------------------------------------------

SEALED_DIR_TOKEN = "webset_cp6"
SEALED_NAME_PREFIX = "IMG_4"


def variant_beauty(img: np.ndarray) -> np.ndarray:
    out = img
    for _ in range(BEAUTY_BILATERAL_PASSES):
        out = cv2.bilateralFilter(
            out,
            BEAUTY_BILATERAL_D,
            BEAUTY_BILATERAL_SIGMA_COLOR,
            BEAUTY_BILATERAL_SIGMA_SPACE,
        )
    lab = cv2.cvtColor(out, cv2.COLOR_BGR2LAB)
    l_ch = lab[:, :, 0].astype(np.int16) + BEAUTY_L_LIFT
    lab[:, :, 0] = np.clip(l_ch, 0, 255).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def variant_jpeg40(img: np.ndarray) -> np.ndarray:
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
    if not ok:
        raise RuntimeError("JPEG encode failed")
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def variant_down06(img: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    dw = max(1, int(round(w * DOWNSCALE_FACTOR)))
    dh = max(1, int(round(h * DOWNSCALE_FACTOR)))
    small = cv2.resize(img, (dw, dh), interpolation=cv2.INTER_AREA)
    return cv2.resize(small, (w, h), interpolation=cv2.INTER_CUBIC)


VARIANTS = {
    "beauty": variant_beauty,
    "jpeg40": variant_jpeg40,
    "down06": variant_down06,
}


def is_sealed(path: pathlib.Path) -> bool:
    resolved = path.resolve()
    if SEALED_DIR_TOKEN in resolved.parts:
        return True
    return resolved.name.startswith(SEALED_NAME_PREFIX)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("images", nargs="+", type=pathlib.Path)
    ap.add_argument("--out", required=True, type=pathlib.Path)
    ap.add_argument(
        "--checkpoint-build",
        action="store_true",
        help="Unlock sealed material (webset_cp6 / IMG_4*). "
        "Only for protocol step 6.3 panel build.",
    )
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    written = []
    for src in args.images:
        if is_sealed(src) and not args.checkpoint_build:
            print(f"REFUSED (sealed material, need --checkpoint-build): {src}", file=sys.stderr)
            return 2
        img = cv2.imread(str(src), cv2.IMREAD_COLOR)
        if img is None:
            print(f"ERROR: cannot read {src}", file=sys.stderr)
            return 1
        for name, fn in VARIANTS.items():
            dst = args.out / f"{src.stem}__{name}.png"
            if not cv2.imwrite(str(dst), fn(img)):
                print(f"ERROR: cannot write {dst}", file=sys.stderr)
                return 1
            written.append(dst)
    for p in written:
        print(p)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
