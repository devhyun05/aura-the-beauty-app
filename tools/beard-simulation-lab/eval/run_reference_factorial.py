"""Controlled-degradation factorial for the reference bundle (Codex #14 task 2).

Two photos that PASS the reference builder today (pic3, psd03) are degraded
synthetically and re-run through detect_face + build_reference_bundle, so
each gate's failure point is observed under CONTROLLED conditions instead of
being inferred from wild photos:

  factorial grid  : bilateral smoothing {none, b1, b2, b3}
                  x downscale to fw {orig, 480, 320, 250}
                  x JPEG quality {none, 90, 60, 30}
  clip arm        : exposure gain {1.0, 1.15, 1.3, 1.5} (no other degradation)
                    — pushes the R channel into >=250 saturation first on
                    skin, the IMG_4569 mechanism (gray stays < 250).

Hypotheses under test (from the wild-photo diagnosis):
  H1 smoothing  -> cheek a/b MAD collapses toward 0 -> sigma floor 0.5 makes
                   the forehead verification a razor (forehead_verify_rejected)
  H2 low fw     -> rawCapacity < Nmin: no QC change can help
                   (insufficient_face_resolution)
  H3 bright exposure -> R-channel-only saturation eats cheek px via the clip
                   gate (clip_rejected) while gray-based stats would be fine

Application order: downscale -> bilateral -> JPEG (device pipeline order:
resolution first, beauty filter on the stored frame, then encode).

Writes outputs/reference_factorial/<tag>/report.json (never overwrites other
outputs) and prints a compact table. Scoring-only harness: no frozen
constant is tuned here.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB))

from engine.detect_face import detect_face  # noqa: E402
from eval import reference_bundle as rb  # noqa: E402
from eval.run_owndomain_eval import PSD_DIR, SAMPLES, _fit  # noqa: E402

OUT = LAB / "outputs" / "reference_factorial"

PHOTOS = [
    ("pic3", SAMPLES / "pic3.png"),
    ("psd03",
     PSD_DIR / "group_03_레이어_그룹__layer_01_smartobject_이미지_레이어.png"),
]

SMOOTH_LEVELS = ["none", "b1", "b2", "b3"]
FW_TARGETS = ["orig", 480, 320, 250]
JPEG_LEVELS = ["none", 90, 60, 30]
GAIN_LEVELS = [1.0, 1.15, 1.3, 1.5]


def smooth(img: np.ndarray, level: str) -> np.ndarray:
    """Beauty-filter stand-in: edge-preserving bilateral, 3 strengths."""
    if level == "none":
        return img
    if level == "b1":
        return cv2.bilateralFilter(img, 9, 30, 30)
    if level == "b2":
        return cv2.bilateralFilter(img, 9, 75, 75)
    if level == "b3":                       # heavy: two passes of b2
        return cv2.bilateralFilter(cv2.bilateralFilter(img, 9, 75, 75),
                                   9, 75, 75)
    raise ValueError(level)


def jpeg(img: np.ndarray, q) -> np.ndarray:
    if q == "none":
        return img
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, int(q)])
    assert ok
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def downscale_to_fw(img: np.ndarray, fw0: float, target) -> np.ndarray:
    if target == "orig" or fw0 <= target:
        return img
    s = float(target) / fw0
    return cv2.resize(img, (max(8, int(img.shape[1] * s)),
                            max(8, int(img.shape[0] * s))),
                      interpolation=cv2.INTER_AREA)


def run_bundle(img: np.ndarray) -> dict:
    """detect + build; returns a flat outcome record."""
    det = detect_face(img)
    if det is None or not det.quality.passed:
        reason = ("no_face" if det is None else det.quality.reject_reason)
        return {"outcome": "face_gate", "faceGate": reason}
    out = rb.build_reference_bundle(img, det.landmarks, det.face_width)
    rec: dict = {"fwDetected": round(float(det.face_width), 1)}
    if isinstance(out, rb.ReferenceAbstain):
        rec.update({"outcome": "abstain", **out.as_json()})
    else:
        rec.update({
            "outcome": "ok", "ladder": out.ladder_level,
            "nValid": out.n_valid, "patches": out.patches_used,
            "nmin": round(rb.nmin_for(det.face_width), 1),
            "cheekSigma": (None if out.cheek_sigma is None else
                           [round(float(v), 3) for v in out.cheek_sigma]),
        })
    return rec


def _fmt(rec: dict) -> str:
    cs = rec.get("cheekSigma")
    cs_s = "-" if not cs else f"{cs[0]:.2f}/{cs[1]:.2f}/{cs[2]:.2f}"
    fi = rec.get("foreheadInlier")
    fi_s = "-" if fi is None else f"{fi:.2f}"
    if rec["outcome"] == "ok":
        return (f"OK L{rec['ladder']} n={rec['nValid']}/{rec['nmin']:.0f} "
                f"sigmaLab={cs_s}")
    if rec["outcome"] == "face_gate":
        return f"FACE_GATE {rec['faceGate']}"
    return (f"ABSTAIN {rec['reason']} raw={rec['rawCapacity']}/"
            f"{rec['nmin']:.0f} qc={sum(rec['counts'].values())} "
            f"clip={rec['clipRejected']} coh={rec['coherenceRejected']} "
            f"maha={rec['mahaRejected']} fInl={fi_s} sigmaLab={cs_s}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default=time.strftime("%Y%m%d_%H%M%S"))
    ap.add_argument("--photos", nargs="*", default=None)
    args = ap.parse_args()
    out_dir = OUT / args.tag
    out_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for name, path in PHOTOS:
        if args.photos and name not in args.photos:
            continue
        base = _fit(cv2.imread(str(path), cv2.IMREAD_COLOR))
        det0 = detect_face(base)
        assert det0 is not None and det0.quality.passed, name
        fw0 = float(det0.face_width)
        print(f"\n=== {name} (fw {fw0:.0f}) ===")

        # --- factorial grid ---------------------------------------------
        for tgt in FW_TARGETS:
            down = downscale_to_fw(base, fw0, tgt)
            for sm in SMOOTH_LEVELS:
                smoothed = smooth(down, sm)
                for q in JPEG_LEVELS:
                    img = jpeg(smoothed, q)
                    rec = {"photo": name, "arm": "factorial",
                           "fwTarget": tgt, "smooth": sm, "jpegQ": q,
                           **run_bundle(img)}
                    rows.append(rec)
                    print(f"  fw={tgt!s:>4} sm={sm:>4} q={q!s:>4} | "
                          f"{_fmt(rec)}")

        # --- clip arm (H3): exposure gain, R saturates first --------------
        for g in GAIN_LEVELS:
            img = np.clip(base.astype(np.float32) * g, 0, 255).astype(np.uint8)
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            rec = {"photo": name, "arm": "clip", "gain": g,
                   "framePctChanSat": round(float(
                       (img.max(axis=2) >= 250).mean()) * 100, 2),
                   "framePctGraySat": round(float(
                       (gray >= 250).mean()) * 100, 2),
                   **run_bundle(img)}
            rows.append(rec)
            print(f"  gain={g:<4} chanSat={rec['framePctChanSat']:>5}% "
                  f"graySat={rec['framePctGraySat']:>5}% | {_fmt(rec)}")

    (out_dir / "report.json").write_text(json.dumps(
        {"grid": {"smooth": SMOOTH_LEVELS, "fw": FW_TARGETS,
                  "jpeg": JPEG_LEVELS, "gain": GAIN_LEVELS},
         "rows": rows}, indent=2, ensure_ascii=False))
    print(f"\n-> {out_dir / 'report.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
