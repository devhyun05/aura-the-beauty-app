"""Mask-only evaluation harness v2 — mask v4 (neck removed + aperture guard
+ mustache activation), Codex #13 denominator redefinition. NO LaMa:
prepare_unlabeled + build_mask only.

v2 measurement contract (Codex #13):
  (a) coverage denominator = the ACTIVATED anatomical mustache subregions
      (spike.mustache_region L/C/R). Non-activated subregions are reported
      SEPARATELY (info), never mixed into the kill denominator. Primary
      coverage subtracts the contractual no-paint guards (lip + detected
      aperture) from the denominator; the RAW-anatomy number is reported
      alongside so the guard share stays visible (no silent denominator
      shrinkage).
  (b) mouth-side bands (0.02..0.08fw outside the corners, lip rows) enter
      the denominator ONLY for photos with actual beard evidence there:
      GT green px > 0 (labelled real photos) or, for unlabelled photos,
      independent coincident evidence (semantic ∩ texture) mass >= the
      frozen rule-A floor. Ineligible photos are listed as n/a, not 100%.
  (c) perturbation verdict = ABSOLUTE coverage of the perturbed-landmark
      mask against the ORIGINAL activated denominator, all four of
      x±0.02fw / y±0.02fw — not a drop-rate. Kill: every direction >= 95%.
  (d) aperture-guard verification is INDEPENDENT of the guard's own
      definition (no circular re-use of the detected mask): dark pixels
      (gray < 60, absolute 8-bit) inside the nose-bottom ROI are counted
      and their edited px reported. The detector uses Lab median-relative
      contrast; this check deliberately does not.
  (e) abstains are aggregated BY REASON (aperture failure -> retake class
      "lower_face_uncertain", face gate, reference abstain, ...).

Photo pool = dev real photos (GT-labelled) + generated (AI) reference
photos; the two groups are aggregated separately (real numbers decide,
gen numbers are reference only).
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

from engine.detect_face import (  # noqa: E402
    LIPS_OUTER, MOUTH_CORNERS, NOSE_BOTTOM, NOSTRILS,
)
from eval.run_owndomain_eval import PSD_DIR, SAMPLES, load_gt_mask  # noqa: E402
from spike import mustache_region  # noqa: E402
from spike.hybrid_recon import (  # noqa: E402
    APERTURE_ROI_DOWN_FW, APERTURE_ROI_PAD_FW, APERTURE_ROI_UP_FW,
    build_mask, prepare_unlabeled, provenance_sheet,
)
from spike.oracle_kill import label  # noqa: E402

ARCHIVE = LAB.parents[1] / "아카이브"

PERTURB_FW = 0.02
BAND_IN_FW, BAND_OUT_FW = 0.02, 0.08
DARK_GRAY_THR = 60          # (d) absolute darkness, independent of detector
COVERAGE_KILL = 95.0        # kill floor, %, activated regions + perturb abs

# ---- photo pool -------------------------------------------------------------
# real: GT-labelled dev photos. pic1 is CONDITIONAL (dense full beard —
# known-hard capture class); it runs and reports but is flagged.
REAL_POOL: list[tuple[str, str, str | None]] = [
    # (name, image path, GT path or None)
    ("pic3", str(SAMPLES / "pic3.png"), str(SAMPLES / "green3.png")),
    ("pic4", str(SAMPLES / "pic4.PNG"), str(SAMPLES / "green4.png")),
    ("psd03",
     str(PSD_DIR / "group_03_레이어_그룹__layer_01_smartobject_이미지_레이어.png"),
     str(PSD_DIR / "group_03_레이어_그룹__layer_02_pixel_픽셀_레이어.png")),
    ("psd05",
     str(PSD_DIR / "group_05_레이어_그룹__layer_01_smartobject_이미지_레이어.png"),
     str(PSD_DIR / "group_05_레이어_그룹__layer_02_pixel_픽셀_레이어.png")),
    ("pic1(cond)", str(SAMPLES / "pic1.png"), str(SAMPLES / "green1.png")),
]


def gen_pool() -> list[tuple[str, str, None]]:
    names = [f"{i:02d}.png" for i in (*range(1, 7), *range(8, 14),
                                      *range(16, 21))]
    names += [f"2-{i}.png" for i in range(1, 7)]
    names += [f"3-{i}.png" for i in (*range(1, 16), *range(17, 21))]
    names += ["4-2.png"]
    asian = sorted(p.name for p in ARCHIVE.glob("asian_*.jpg")
                   if "laughing" not in p.name)
    names += asian
    return [(Path(n).stem, str(ARCHIVE / n), None) for n in names]


# ---- measurement regions ----------------------------------------------------

def mouth_side_band(crop) -> np.ndarray:
    h, w = crop.bgr.shape[:2]
    lm = crop.landmarks
    fw = crop.face_width
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    lip_top = float(lm[LIPS_OUTER][:, 1].min())
    lip_bot = float(lm[LIPS_OUTER][:, 1].max())
    xl = float(min(lm[MOUTH_CORNERS[0]][0], lm[MOUTH_CORNERS[1]][0]))
    xr = float(max(lm[MOUTH_CORNERS[0]][0], lm[MOUTH_CORNERS[1]][0]))
    rows = (yy >= lip_top) & (yy <= lip_bot)
    return rows & (((xx >= xr + BAND_IN_FW * fw) & (xx <= xr + BAND_OUT_FW * fw))
                   | ((xx <= xl - BAND_IN_FW * fw)
                      & (xx >= xl - BAND_OUT_FW * fw)))


def true_lip(crop) -> np.ndarray:
    h, w = crop.bgr.shape[:2]
    m = np.zeros((h, w), np.uint8)
    cv2.fillPoly(m, [crop.landmarks[LIPS_OUTER].astype(np.int32)], 1)
    return m > 0


def aperture_roi_box(crop) -> tuple[int, int, int, int] | None:
    """Same ROI geometry as detect_nostril_apertures (constants shared), but
    the darkness measure below is absolute gray — NOT the detector's Lab
    median-relative rule, so the check cannot inherit the guard's blind spots
    (Codex #13 anti-circularity)."""
    h, w = crop.bgr.shape[:2]
    lm = crop.landmarks
    fw = crop.face_width
    nose_y = float(lm[NOSE_BOTTOM][1])
    al = lm[list(NOSTRILS)].astype(np.float64)
    x0 = int(max(0, np.floor(al[:, 0].min() - APERTURE_ROI_PAD_FW * fw)))
    x1 = int(min(w, np.ceil(al[:, 0].max() + APERTURE_ROI_PAD_FW * fw) + 1))
    y0 = int(max(0, np.floor(min(al[:, 1].min(), nose_y)
                             - APERTURE_ROI_UP_FW * fw)))
    y1 = int(min(h, np.ceil(nose_y + APERTURE_ROI_DOWN_FW * fw) + 1))
    if x1 - x0 < 4 or y1 - y0 < 3:
        return None
    return x0, y0, x1, y1


def aperture_dark_check(crop, edit: np.ndarray,
                        aperture_guard: np.ndarray) -> dict:
    box = aperture_roi_box(crop)
    if box is None:
        return {"roi": None, "darkPx": None, "darkEditedPx": None}
    x0, y0, x1, y1 = box
    gray = cv2.cvtColor(crop.bgr[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
    dark = np.zeros(crop.bgr.shape[:2], bool)
    dark[y0:y1, x0:x1] = gray < DARK_GRAY_THR
    n_dark = int(dark.sum())
    return {"roi": [x0, y0, x1, y1],
            "darkPx": n_dark,
            "darkEditedPx": int((edit & dark).sum()),
            "darkGuardCoveredPct": (None if n_dark == 0 else round(
                100.0 * float((dark & aperture_guard).sum()) / n_dark, 1))}


def _cov(edit: np.ndarray, region: np.ndarray) -> float | None:
    denom = int(region.sum())
    if denom == 0:
        return None
    return round(100.0 * float((edit & region).sum()) / denom, 1)


def load_gt_crop(gt_path: str | None, ctx: dict) -> np.ndarray | None:
    if gt_path is None:
        return None
    gt = load_gt_mask(Path(gt_path), ctx["bgr"].shape[:2])
    x0, y0, x1, y1 = ctx["crop"].bbox
    return gt[y0:y1, x0:x1]


def mouth_side_eligibility(band: np.ndarray, gt_crop: np.ndarray | None,
                           ctx: dict) -> tuple[bool, str, int]:
    """(b): band enters the denominator only with actual beard evidence.
    GT photos: green px in band > 0. Unlabelled: coincident (semantic ∩
    texture, frozen mustache signals) mass >= rule-A floor."""
    if gt_crop is not None:
        n = int((gt_crop & band).sum())
        return n > 0, f"GT px={n}", n
    fw = ctx["crop"].face_width
    _, _, coincident = mustache_region.region_signals(
        ctx["semantic_heat"], ctx["nz"], fw)
    n = int((coincident & band).sum())
    need = int(np.ceil(max(float(mustache_region.RULE_A_MIN_PX),
                           mustache_region.RULE_A_MIN_FRAC
                           * float(band.sum()))))
    return n >= need, f"coincident px={n} (need>={need})", n


# ---- per-photo measurement --------------------------------------------------

def measure_mustache(edit: np.ndarray, guards: dict, subr: dict,
                     activated: tuple[str, ...]) -> dict:
    no_paint = guards["lip"] | guards["aperture"]
    act = np.zeros(edit.shape, bool)
    for name in activated:
        act |= subr[name]
    per = {}
    for name in mustache_region.SUBREGIONS:
        r = subr[name]
        per[name] = {"activated": name in activated,
                     "regionPx": int(r.sum()),
                     "coverage": _cov(edit, r & ~no_paint),
                     "coverageRaw": _cov(edit, r)}
    return {"activatedCoverage": _cov(edit, act & ~no_paint),
            "activatedCoverageRaw": _cov(edit, act),
            "activatedPx": int(act.sum()),
            "subregions": per}


def perturb_abs(ctx: dict, denom: np.ndarray) -> dict:
    """(c) absolute coverage of the perturbed mask on the ORIGINAL activated
    denominator; landmark-shift directions x±/y± 0.02fw. An aperture-detect
    failure under perturbation is recorded as 'abstain' (counts as a fail
    against the >=95% absolute kill floor)."""
    fw = ctx["crop"].face_width
    d = PERTURB_FW * fw
    out = {}
    for tag, (dx, dy) in (("x+", (d, 0)), ("x-", (-d, 0)),
                          ("y+", (0, d)), ("y-", (0, -d))):
        crop2 = copy.copy(ctx["crop"])
        crop2.landmarks = ctx["crop"].landmarks + np.array([dx, dy],
                                                           np.float32)
        ctx2 = dict(ctx)
        ctx2["crop"] = crop2
        edit2, _, _ = build_mask(ctx2)
        out[tag] = "abstain" if edit2 is None else _cov(edit2, denom)
    return out


def _tint(bgr, mask_b, color):
    o = bgr.copy()
    o[mask_b] = (0.55 * o[mask_b] + 0.45 * np.array(color)).astype(np.uint8)
    return o


def run_photo(name: str, path: str, gt_path: str | None, group: str,
              out_dir: Path) -> dict:
    rec: dict = {"id": name, "group": group}
    p = Path(path)
    if not p.exists():
        rec["abstain"] = f"missing file: {p.name}"
        rec["abstainClass"] = "missing_file"
        return rec
    ctx = prepare_unlabeled(name, p)
    if ctx is None:
        from engine.detect_face import detect_face
        from eval.run_owndomain_eval import _fit
        bgr = cv2.imread(str(p), cv2.IMREAD_COLOR)
        if bgr is None:
            rec["abstain"], rec["abstainClass"] = "unreadable image", "io"
        else:
            det = detect_face(_fit(bgr))
            rec["abstain"] = ("no face detected" if det is None
                              else f"quality gate: {det.quality.reject_reason}")
            rec["abstainClass"] = "face_gate"
        return rec
    if "abstain" in ctx:
        rec["abstain"] = ctx["abstain"]
        rec["abstainClass"] = "reference"
        return rec

    crop = ctx["crop"]
    fw = crop.face_width
    edit, _, g = build_mask(ctx)
    if edit is None:
        # aperture pair undetected -> product path abstains: RETAKE class
        rec["abstain"] = g["abstain"]
        rec["abstainClass"] = "aperture_retake"
        return rec

    mus = g["mask"]["mustache"]
    rec["mustache"] = {"fired": mus["fired"], "rules": mus["rules"],
                       "activated": mus["activated"],
                       "fillPx": mus["fillPx"]}
    subr = mustache_region.mustache_subregions(crop.landmarks,
                                               crop.bgr.shape[:2], fw)
    activated = tuple(mus["activated"])
    rec["coverage"] = measure_mustache(edit, g, subr, activated)

    # (b) mouth-side, evidence-gated denominator
    band = mouth_side_band(crop)
    gt_crop = load_gt_crop(gt_path, ctx)
    elig, reason, ev_px = mouth_side_eligibility(band, gt_crop, ctx)
    no_paint = g["lip"] | g["aperture"]
    rec["mouthSide"] = {"eligible": elig, "evidence": reason,
                        "coverage": (_cov(edit, band & ~no_paint)
                                     if elig else None),
                        "coverageRaw": _cov(edit, band) if elig else None,
                        "bandPx": int(band.sum())}
    if gt_crop is not None:
        rec["gtRecallCropPct"] = _cov(edit, gt_crop & g["canvas"])

    # intrusion: true lip polygon + (d) independent aperture darkness
    rec["lipIntrusionPx"] = int((edit & true_lip(crop)).sum())
    rec["apertureDark"] = aperture_dark_check(crop, edit, g["aperture"])

    # (c) perturbation, absolute coverage on the ORIGINAL denominator
    if activated:
        act = np.zeros(edit.shape, bool)
        for n_ in activated:
            act |= subr[n_]
        rec["perturbAbs"] = perturb_abs(ctx, act & ~no_paint)
        vals = [v for v in rec["perturbAbs"].values()
                if isinstance(v, (int, float))]
        n_abst = sum(1 for v in rec["perturbAbs"].values() if v == "abstain")
        rec["perturbMinAbs"] = min(vals) if vals else None
        rec["perturbPass"] = (n_abst == 0 and bool(vals)
                              and min(vals) >= COVERAGE_KILL)
    else:
        rec["perturbAbs"] = None
        rec["perturbMinAbs"] = None
        rec["perturbPass"] = None  # n/a — no activation to hold

    rec["maskFrac"] = g["mask"]["maskFrac"]

    # inspection sheet: ORIG | subregions | edit | guards+dark
    reg_ov = crop.bgr.copy()
    for n_, col in (("L", (255, 0, 255)), ("C", (255, 128, 0)),
                    ("R", (0, 255, 255))):
        reg_ov = _tint(reg_ov, subr[n_], col)
    reg_ov = _tint(reg_ov, band, (255, 255, 0))
    dark_ov = _tint(crop.bgr, no_paint, (0, 0, 255))
    box = aperture_roi_box(crop)
    if box is not None:
        x0, y0, x1, y1 = box
        cv2.rectangle(dark_ov, (x0, y0), (x1 - 1, y1 - 1), (255, 0, 255), 1)
    sheet = np.hstack([
        label(crop.bgr, "ORIG"), label(reg_ov, "REGIONS"),
        label(_tint(crop.bgr, edit, (0, 255, 0)), "EDIT"),
        label(dark_ov, "GUARDS+ROI"),
    ])
    cv2.imwrite(str(out_dir / f"{name}_maskv4.png"), sheet)
    cv2.imwrite(str(out_dir / f"{name}_provenance.png"),
                provenance_sheet(crop.bgr, g["provenance"]))
    return rec


# ---- tables / aggregation ---------------------------------------------------

def _fmt(v) -> str:
    return "n/a" if v is None else str(v)


def table(rows: list[dict]) -> str:
    lines = ["| photo | grp | fired L/C/R (rule) | activated | actCov% "
             "(raw) | mouthSide% (evidence) | lip px | apDark edit/total px "
             "| perturb min abs % | abstain |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        if "abstain" in r:
            lines.append(f"| {r['id']} | {r['group']} | | | | | | | | "
                         f"{r['abstainClass']}: {r['abstain']} |")
            continue
        m = r["mustache"]
        fired = "/".join(
            (m["rules"][k] or "-") if m["fired"][k] else "·"
            for k in mustache_region.SUBREGIONS)
        act = "".join(m["activated"]) or "none"
        c = r["coverage"]
        ms = r["mouthSide"]
        ms_s = (f"{_fmt(ms['coverage'])} ({ms['evidence']})" if ms["eligible"]
                else f"n/a ({ms['evidence']})")
        ad = r["apertureDark"]
        pert = ("n/a" if r["perturbAbs"] is None else
                f"{_fmt(r['perturbMinAbs'])}"
                + ("" if all(v != "abstain" for v in r["perturbAbs"].values())
                   else " (+abstain)"))
        lines.append(
            f"| {r['id']} | {r['group']} | {fired} | {act} | "
            f"{_fmt(c['activatedCoverage'])} ({_fmt(c['activatedCoverageRaw'])})"
            f" | {ms_s} | {r['lipIntrusionPx']} | "
            f"{_fmt(ad['darkEditedPx'])}/{_fmt(ad['darkPx'])} | {pert} | |")
    return "\n".join(lines)


def aggregate(rows: list[dict]) -> dict:
    ok = [r for r in rows if "abstain" not in r]
    abst: dict[str, int] = {}
    for r in rows:
        if "abstain" in r:
            abst[r["abstainClass"]] = abst.get(r["abstainClass"], 0) + 1
    act_rows = [r for r in ok if r["mustache"]["activated"]]
    covs = [r["coverage"]["activatedCoverage"] for r in act_rows
            if r["coverage"]["activatedCoverage"] is not None]
    ms = [r["mouthSide"]["coverage"] for r in ok
          if r["mouthSide"]["eligible"]
          and r["mouthSide"]["coverage"] is not None]
    pert = [r for r in act_rows if r["perturbPass"] is not None]
    return {
        "n": len(rows), "measured": len(ok), "abstainsByClass": abst,
        "mustacheActivated": len(act_rows),
        "activatedCoverageMin": min(covs) if covs else None,
        "activatedCoverageMean": (round(float(np.mean(covs)), 1)
                                  if covs else None),
        "coverageKillPass": (sum(1 for c in covs if c >= COVERAGE_KILL),
                             len(covs)),
        "mouthSideEligible": len(ms),
        "mouthSideCoverageMin": min(ms) if ms else None,
        "lipIntrusionPhotos": sum(1 for r in ok if r["lipIntrusionPx"] > 0),
        "lipIntrusionTotalPx": sum(r["lipIntrusionPx"] for r in ok),
        "apertureDarkEditedPhotos": sum(
            1 for r in ok
            if (r["apertureDark"]["darkEditedPx"] or 0) > 0),
        "apertureDarkEditedTotalPx": sum(
            (r["apertureDark"]["darkEditedPx"] or 0) for r in ok),
        "perturbPass": (sum(1 for r in pert if r["perturbPass"]), len(pert)),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("photos", nargs="*", help="subset of photo names")
    ap.add_argument("--tag", default="maskv4_b2")
    args = ap.parse_args()
    out_dir = LAB / "outputs" / "ghost" / "hybrid" / args.tag
    out_dir.mkdir(parents=True, exist_ok=True)

    pool = ([(n, p, g, "real") for n, p, g in REAL_POOL]
            + [(n, p, g, "gen") for n, p, g in gen_pool()])
    if args.photos:
        pool = [t for t in pool if t[0] in args.photos]

    rows = []
    for n, p, gt, grp in pool:
        r = run_photo(n, p, gt, grp, out_dir)
        rows.append(r)
        print(f"{n}: {json.dumps(r, ensure_ascii=False, default=str)}",
              flush=True)

    agg = {grp: aggregate([r for r in rows if r["group"] == grp])
           for grp in ("real", "gen")}
    (out_dir / "report.json").write_text(json.dumps(
        {"perturbFw": PERTURB_FW, "bandFw": [BAND_IN_FW, BAND_OUT_FW],
         "darkGrayThr": DARK_GRAY_THR, "coverageKill": COVERAGE_KILL,
         "aggregate": agg, "photos": rows},
        indent=2, ensure_ascii=False))
    md = (table([r for r in rows if r["group"] == "real"])
          + "\n\n" + table([r for r in rows if r["group"] == "gen"])
          + "\n\n```json\n" + json.dumps(agg, indent=2, ensure_ascii=False)
          + "\n```")
    (out_dir / "table.md").write_text(md + "\n")
    print("\n" + md)
    print(f"\n-> {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
