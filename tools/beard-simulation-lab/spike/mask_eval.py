"""Mask-only evaluation harness for the philtrum / mouth-side mask fix
(Codex #12 stages 0-1). NO LaMa: prepare_unlabeled + build_mask only.

Measures, per photo (dev9 + 4 fresh newbeards):
  (a) philtrumCoverage  — anatomical philtrum region (nose-bottom y .. upper
      lip top y, mouth-corner x range): edit ∩ region / (region − nostril
      guard), in %.
  (b) mouthSideCoverage — bands 0.02..0.08fw OUTSIDE each mouth corner,
      lip-top..lip-bottom rows.
  (c) true lip / nostril intrusion px (edit ∩ raw LIPS_OUTER polygon, edit ∩
      r=0.012fw NOSTRILS disks) — must be 0.
  (d) top gap: uncovered rows between the nose bottom and the first canvas
      row (philtrum columns).
  (e) landmark perturbation ±0.02fw (x and y separately): change in (a).

BEFORE numbers reproduce the pre-fix pipeline on the same harness:
legacy guards (protect-mask-seeded distance dilation) + the old
BELOW_NOSE_MARGIN_FW=0.01 canvas top cut, monkeypatched for the call only.
"""
from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path

import cv2
import numpy as np

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB))

from engine.detect_face import LIPS_OUTER, MOUTH_CORNERS, NOSE_BOTTOM, NOSTRILS  # noqa: E402
from eval.run_owndomain_eval import discover_pairs  # noqa: E402
from spike import mask_v3  # noqa: E402
from spike.hybrid_recon import (  # noqa: E402
    NOSTRIL_GUARD_R_FW, build_mask, prepare_unlabeled, provenance_sheet,
)
from spike.oracle_kill import label  # noqa: E402

OUT = LAB / "outputs" / "ghost" / "hybrid" / "maskfix_b1"
NEWBEARD_DIR = LAB.parents[1] / "newbeards"
# nb1/2/4/6/7/10/12 are checkpoint-spent — NEVER reuse (Codex discipline).
NEWBEARDS = ("newbeard3.jpg", "newbeard5.jpg", "newbeard8.webp",
             "newbeard11.png")
PERTURB_FW = 0.02
BAND_IN_FW, BAND_OUT_FW = 0.02, 0.08
LEGACY_BELOW_NOSE_MARGIN_FW = 0.01


def regions(crop) -> dict:
    """Anatomical measurement regions + TRUE no-paint targets, crop coords."""
    h, w = crop.bgr.shape[:2]
    lm = crop.landmarks
    fw = crop.face_width
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

    nose_y = float(lm[NOSE_BOTTOM][1])
    lip_top = float(lm[LIPS_OUTER][:, 1].min())
    lip_bot = float(lm[LIPS_OUTER][:, 1].max())
    xl = float(min(lm[MOUTH_CORNERS[0]][0], lm[MOUTH_CORNERS[1]][0]))
    xr = float(max(lm[MOUTH_CORNERS[0]][0], lm[MOUTH_CORNERS[1]][0]))

    philtrum = (yy > nose_y) & (yy < lip_top) & (xx >= xl) & (xx <= xr)
    band_rows = (yy >= lip_top) & (yy <= lip_bot)
    mouth_side = band_rows & (
        ((xx >= xr + BAND_IN_FW * fw) & (xx <= xr + BAND_OUT_FW * fw))
        | ((xx <= xl - BAND_IN_FW * fw) & (xx >= xl - BAND_OUT_FW * fw)))

    true_lip = np.zeros((h, w), np.uint8)
    cv2.fillPoly(true_lip, [lm[LIPS_OUTER].astype(np.int32)], 1)
    true_nostril = np.zeros((h, w), np.uint8)
    nr = max(2, int(round(NOSTRIL_GUARD_R_FW * fw)))
    for idx in NOSTRILS:
        cx, cy = (int(round(float(v))) for v in lm[idx])
        cv2.circle(true_nostril, (cx, cy), nr, 1, -1)

    return {"philtrum": philtrum, "mouth_side": mouth_side,
            "true_lip": true_lip > 0, "true_nostril": true_nostril > 0,
            "nose_y": nose_y}


def _coverage(edit: np.ndarray, region: np.ndarray) -> float | None:
    denom = int(region.sum())
    if denom == 0:
        return None
    return round(100.0 * float((edit & region).sum()) / denom, 1)


def _top_gap(canvas: np.ndarray, philtrum: np.ndarray, nose_y: float,
             fw: float) -> dict:
    """Uncovered rows between the nose bottom and the first canvas row,
    per philtrum column; 0 means the canvas starts right under the nose."""
    cols = np.nonzero(philtrum.any(axis=0))[0]
    gaps = []
    for c in cols:
        ys = np.nonzero(canvas[:, c])[0]
        ys = ys[ys > nose_y]
        if ys.size:
            gaps.append(max(0.0, float(ys.min()) - np.floor(nose_y) - 1.0))
    if not gaps:
        return {"topGapMaxPx": None, "topGapMedianPx": None}
    return {"topGapMaxPx": round(float(np.max(gaps)), 1),
            "topGapMedianPx": round(float(np.median(gaps)), 1),
            "topGapMaxFw": round(float(np.max(gaps)) / fw, 4)}


def measure(edit: np.ndarray, guards: dict, reg: dict, fw: float) -> dict:
    """Coverage denominators use the TRUE anatomy (region − true nostril
    disks) for BOTH arms — subtracting each arm's own nostril guard would
    hide exactly the blockage being measured (the legacy guard IS the
    philtrum hole; fabrication trap)."""
    phil = reg["philtrum"] & ~reg["true_nostril"]
    m = {"philtrumCoverage": _coverage(edit, phil),
         "mouthSideCoverage": _coverage(edit, reg["mouth_side"]),
         # structural ceiling: what the mask LAYER allows (canvas minus
         # guards/occluder), evidence aside — the stage-1 fix target
         "philtrumEditable": _coverage(
             guards["canvas"] & ~guards["lip"] & ~guards["nostril_core"]
             & ~guards["occluder"], phil),
         "mouthSideEditable": _coverage(
             guards["canvas"] & ~guards["lip"] & ~guards["nostril_core"]
             & ~guards["occluder"], reg["mouth_side"]),
         "trueLipIntrusionPx": int((edit & reg["true_lip"]).sum()),
         "trueNostrilIntrusionPx": int((edit & reg["true_nostril"]).sum()),
         "guardExcludedEnergyFrac":
             guards["mask"]["guardExcludedEnergyFrac"],
         "maskFrac": guards["mask"]["maskFrac"]}
    m.update(_top_gap(guards["canvas"], reg["philtrum"], reg["nose_y"], fw))
    if "provenance" in guards:
        prov = guards["provenance"]
        from spike.hybrid_recon import PROV_NAMES
        m["philtrumProvenancePx"] = {
            PROV_NAMES[c]: int((prov[phil] == c).sum())
            for c in sorted(PROV_NAMES)}
        m["mouthSideProvenancePx"] = {
            PROV_NAMES[c]: int((prov[reg["mouth_side"]] == c).sum())
            for c in sorted(PROV_NAMES)}
    return m


def _build_legacy(ctx: dict):
    """Pre-fix pipeline: legacy guards + the old canvas top cut."""
    old = mask_v3.BELOW_NOSE_MARGIN_FW
    mask_v3.BELOW_NOSE_MARGIN_FW = LEGACY_BELOW_NOSE_MARGIN_FW
    try:
        return build_mask(ctx, legacy_guards=True)
    finally:
        mask_v3.BELOW_NOSE_MARGIN_FW = old


def _perturbed(ctx: dict, reg: dict) -> dict:
    """Rebuild the mask with ALL landmarks shifted ±0.02fw (x, y separately);
    philtrum coverage measured against the ORIGINAL anatomy region and the
    ORIGINAL nostril-guard denominator, so only mask geometry moves."""
    fw = ctx["crop"].face_width
    d = PERTURB_FW * fw
    denom = reg["philtrum"] & ~reg["true_nostril"]
    out = {}
    for tag, (dx, dy) in (("x+", (d, 0)), ("x-", (-d, 0)),
                          ("y+", (0, d)), ("y-", (0, -d))):
        crop2 = copy.copy(ctx["crop"])
        crop2.landmarks = ctx["crop"].landmarks + np.array([dx, dy],
                                                           np.float32)
        ctx2 = dict(ctx)
        ctx2["crop"] = crop2
        edit2, _, _ = build_mask(ctx2)
        out[tag] = _coverage(edit2, denom)
    return out


def _tint(bgr, mask_b, color):
    o = bgr.copy()
    o[mask_b] = (0.55 * o[mask_b] + 0.45 * np.array(color)).astype(np.uint8)
    return o


def run_photo(name: str, path: Path, out_dir: Path) -> dict:
    ctx = prepare_unlabeled(name, path)
    if ctx is None:
        # Re-detect just to record the precise gate reason (honest exclusion
        # logging — "landmark failure" photos leave the kill denominator).
        from engine.detect_face import detect_face
        from eval.run_owndomain_eval import _fit
        bgr = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if bgr is None:
            reason = "unreadable image"
        else:
            det = detect_face(_fit(bgr))
            reason = ("no face detected" if det is None
                      else f"quality gate: {det.quality.reject_reason}")
        return {"id": name, "excluded": reason}
    if "abstain" in ctx:
        return {"id": name, "excluded": ctx["abstain"]}
    crop = ctx["crop"]
    fw = crop.face_width
    reg = regions(crop)

    edit_b, _, g_b = _build_legacy(ctx)
    edit_a, _, g_a = build_mask(ctx)

    rec = {"id": name,
           "before": measure(edit_b, g_b, reg, fw),
           "after": measure(edit_a, g_a, reg, fw)}
    rec["perturb"] = _perturbed(ctx, reg)

    # 5-layer sheet: ORIG / region overlay / edit BEFORE / edit AFTER /
    # guards AFTER; plus the provenance sheet.
    reg_ov = _tint(crop.bgr, reg["philtrum"], (255, 0, 255))
    reg_ov = _tint(reg_ov, reg["mouth_side"], (255, 255, 0))
    sheet = np.hstack([
        label(crop.bgr, "ORIG"),
        label(reg_ov, "REGIONS"),
        label(_tint(crop.bgr, edit_b, (0, 128, 255)), "EDIT:BEFORE"),
        label(_tint(crop.bgr, edit_a, (0, 255, 0)), "EDIT:AFTER"),
        label(_tint(crop.bgr, g_a["lip"] | g_a["nostril_core"], (0, 0, 255)),
              "GUARDS:AFTER"),
    ])
    cv2.imwrite(str(out_dir / f"{name}_maskfix.png"), sheet)
    cv2.imwrite(str(out_dir / f"{name}_provenance.png"),
                provenance_sheet(crop.bgr, g_a["provenance"]))
    print(f"{name}: {json.dumps(rec)}")
    return rec


def table(rows: list[dict]) -> str:
    lines = ["| photo | philtrum % (b→a) | philtrum editable % (b→a) | "
             "mouthSide % (b→a) | mouthSide editable % (b→a) | "
             "lip/nostril px | topGap px (b→a) | guardExclFrac (b→a) | "
             "perturb min % |",
             "|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        if "excluded" in r:
            lines.append(
                f"| {r['id']} | EXCLUDED: {r['excluded']} | | | | | | | |")
            continue
        b, a, p = r["before"], r["after"], r["perturb"]
        pv = [v for v in p.values() if v is not None]
        lines.append(
            f"| {r['id']} | {b['philtrumCoverage']} → "
            f"{a['philtrumCoverage']} | {b['philtrumEditable']} → "
            f"{a['philtrumEditable']} | {b['mouthSideCoverage']} → "
            f"{a['mouthSideCoverage']} | {b['mouthSideEditable']} → "
            f"{a['mouthSideEditable']} | {a['trueLipIntrusionPx']}/"
            f"{a['trueNostrilIntrusionPx']} | {b['topGapMaxPx']} → "
            f"{a['topGapMaxPx']} | {b['guardExcludedEnergyFrac']} → "
            f"{a['guardExcludedEnergyFrac']} | "
            f"{min(pv) if pv else None} |")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("photos", nargs="*", help="subset of photo names")
    ap.add_argument("--tag", default="maskfix_b1")
    args = ap.parse_args()
    out_dir = LAB / "outputs" / "ghost" / "hybrid" / args.tag
    out_dir.mkdir(parents=True, exist_ok=True)

    photos: list[tuple[str, Path]] = [(n, p) for n, p, _ in discover_pairs()]
    photos += [(Path(n).stem, NEWBEARD_DIR / n) for n in NEWBEARDS]
    if args.photos:
        photos = [(n, p) for n, p in photos if n in args.photos]

    rows = [run_photo(n, p, out_dir) for n, p in photos]
    (out_dir / "report.json").write_text(json.dumps(
        {"perturbFw": PERTURB_FW, "bandFw": [BAND_IN_FW, BAND_OUT_FW],
         "photos": rows}, indent=2))
    md = table(rows)
    (out_dir / "table.md").write_text(md + "\n")
    print("\n" + md)
    print(f"\n-> {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
