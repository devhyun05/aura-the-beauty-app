"""Synthetic controls for the Codex #12 guard redesign (spike.hybrid_recon),
updated for the Codex #13 DETECTED aperture guard (the r=0.012fw alae disks
are retired; the guard is the detected dark aperture pair + 0.004fw halo,
and detection failure ABSTAINS the photo instead of fabricating a guard).

Fully synthetic — no photos, no models: a 478-slot landmark array (ellipse
FACE_OVAL as in test_mask_v3, plus a lip polygon and nostril points), skin
bgr with two PAINTED dark aperture blobs, and saturated evidence fields so
build_mask's edit mask equals "canvas minus guards". Controls:
  (i)   philtrum coverage >= 95% (the old guards blocked up to 98.6% of it),
  (ii)  ZERO edit pixels on the true lip polygon / painted apertures,
  (iii) no guard re-dilation: guard areas byte-match their tight definitions,
  (iv)  canvas top gap 0 under the nose bottom,
  (v)   no detectable aperture pair -> build_mask abstains (never fabricates).
"""
from __future__ import annotations

import math
import sys
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.detect_face import (  # noqa: E402
    FACE_OVAL, LIPS_OUTER, MOUTH_CORNERS, NOSE_BOTTOM, NOSTRILS,
)
from spike import hybrid_recon  # noqa: E402
from spike.hybrid_recon import (  # noqa: E402
    ABSTAIN_LOWER_FACE, APERTURE_DILATE_FW, APERTURE_REJECT_ASYM,
    APERTURE_REJECT_CONTRAST, APERTURE_REJECT_GAP, APERTURE_REJECT_NO_PAIR,
    APERTURE_REJECT_PERTURB, APERTURE_REJECT_RATIO, LIP_GUARD_DILATE_FW,
    PROV_EDIT, PROV_OUT_CANVAS, _anatomy_guards, build_mask,
    detect_nostril_apertures,
)

H, W = 520, 400
CX, CY, RX, RY = 200.0, 170.0, 110.0, 140.0
FW, FH = 2 * RX, 2 * RY
NOSE_Y = 150.0
# Face-realistic vertical proportions (philtrum height ~0.10fw): lip-ellipse
# top at y=172, nostrils ~0.11fw off-center just above the nose bottom.
MOUTH_CY, LIP_RX, LIP_RY = 188.0, 45.0, 16.0
NOSTRIL_DX, NOSTRIL_Y = 24.0, 146.0
SKIN_BGR = (150, 170, 205)


def _landmarks() -> np.ndarray:
    lm = np.zeros((478, 2), np.float32)
    for i, idx in enumerate(FACE_OVAL):
        ang = math.radians(-90.0 + i * 10.0)
        lm[idx] = (CX + RX * math.cos(ang), CY + RY * math.sin(ang))
    lm[NOSE_BOTTOM] = (CX, NOSE_Y)
    # Lip polygon: ellipse, 20 points, ordered; MOUTH_CORNERS (61, 291) are
    # LIPS_OUTER members so the corners land automatically.
    for i, idx in enumerate(LIPS_OUTER):
        ang = math.radians(180.0 + i * 18.0)
        lm[idx] = (CX + LIP_RX * math.cos(ang),
                   MOUTH_CY + LIP_RY * math.sin(ang))
    lm[NOSTRILS[0]] = (CX - NOSTRIL_DX, NOSTRIL_Y)
    lm[NOSTRILS[1]] = (CX + NOSTRIL_DX, NOSTRIL_Y)
    return lm


LM = _landmarks()


# Painted aperture blobs (the DETECTED guard's ground truth): dark filled
# ellipses at the nostril landmark positions, well inside the detector's
# nose-bottom ROI and its area/compactness gates at FW=220.
APERTURE_AXES = (4, 2)
APERTURE_BGR = (25, 25, 25)


def _skin_bgr(with_apertures: bool = True) -> np.ndarray:
    rng = np.random.RandomState(20260712)
    img = np.full((H, W, 3), SKIN_BGR, np.float32)
    img += rng.normal(0, 3.0, img.shape).astype(np.float32)
    img = np.clip(img, 0, 255).astype(np.uint8)
    if with_apertures:
        for idx in NOSTRILS:
            cv2.ellipse(img, (int(LM[idx][0]), int(LM[idx][1])),
                        APERTURE_AXES, 0, 0, 360, APERTURE_BGR, -1)
    return img


def _true_apertures() -> np.ndarray:
    blobs = np.zeros((H, W), np.uint8)
    for idx in NOSTRILS:
        cv2.ellipse(blobs, (int(LM[idx][0]), int(LM[idx][1])),
                    APERTURE_AXES, 0, 0, 360, 1, -1)
    return blobs > 0


def _ctx() -> dict:
    """Minimal build_mask ctx: saturated evidence everywhere, so the edit
    mask is exactly canvas minus guards (occluder is empty by construction:
    it only looks at canvas & ~growth)."""
    bgr = _skin_bgr()
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2Lab).astype(np.float64)
    patch = lab[40:90, 150:250].reshape(-1, 3)
    crop = SimpleNamespace(bgr=bgr, face_width=FW, landmarks=LM.copy(),
                           protect_mask=np.zeros((H, W), np.float32))
    return dict(
        crop=crop,
        det=SimpleNamespace(face_height=FH),
        bundle=SimpleNamespace(lab_mean=patch.mean(axis=0),
                               lab_cov=np.cov(patch.T)),
        zone_soft=np.ones((H, W), np.float32),
        nz=np.full((H, W), 10.0, np.float32),
        zone=np.ones((H, W), bool),
        cands_ext=[],
    )


def _philtrum_region() -> np.ndarray:
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    lip_top = float(LM[LIPS_OUTER][:, 1].min())
    xl = float(min(LM[MOUTH_CORNERS[0]][0], LM[MOUTH_CORNERS[1]][0]))
    xr = float(max(LM[MOUTH_CORNERS[0]][0], LM[MOUTH_CORNERS[1]][0]))
    return (yy > NOSE_Y) & (yy < lip_top) & (xx >= xl) & (xx <= xr)


def _true_lip() -> np.ndarray:
    lip = np.zeros((H, W), np.uint8)
    cv2.fillPoly(lip, [LM[LIPS_OUTER].astype(np.int32)], 1)
    return lip > 0


def test_philtrum_coverage_at_least_95pct():
    """(i) With saturated evidence the philtrum must be >=95% editable —
    the old protect-mask-seeded guards blocked up to 98.6% of it."""
    ctx = _ctx()
    edit, _, guards = build_mask(ctx)
    region = _philtrum_region() & ~guards["aperture"]
    cov = float((edit & region).sum()) / float(region.sum())
    assert cov >= 0.95, f"philtrum coverage {cov:.3f} < 0.95"


def test_mouth_side_bands_editable():
    """Mouth-corner side bands (0.02..0.08fw outside the corners) are
    first-class edit regions too."""
    ctx = _ctx()
    edit, _, _ = build_mask(ctx)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    lip_top = float(LM[LIPS_OUTER][:, 1].min())
    lip_bot = float(LM[LIPS_OUTER][:, 1].max())
    xl = float(min(LM[MOUTH_CORNERS[0]][0], LM[MOUTH_CORNERS[1]][0]))
    xr = float(max(LM[MOUTH_CORNERS[0]][0], LM[MOUTH_CORNERS[1]][0]))
    band = ((yy >= lip_top) & (yy <= lip_bot)
            & (((xx >= xr + 0.02 * FW) & (xx <= xr + 0.08 * FW))
               | ((xx <= xl - 0.02 * FW) & (xx >= xl - 0.08 * FW))))
    cov = float((edit & band).sum()) / float(band.sum())
    assert cov >= 0.95, f"mouth-side coverage {cov:.3f} < 0.95"


def test_zero_intrusion_on_true_lip_and_apertures():
    """(ii) The inviolable contract: not one edit pixel on the raw lip
    polygon or the painted aperture blobs."""
    ctx = _ctx()
    edit, model, _ = build_mask(ctx)
    assert int((edit & _true_lip()).sum()) == 0
    assert int((edit & _true_apertures()).sum()) == 0
    # model_mask (LaMa hole) is guard-subtracted too
    assert int((model & _true_lip()).sum()) == 0
    assert int((model & _true_apertures()).sum()) == 0


def test_guards_not_redilated():
    """(iii) Guards are final at construction: the returned masks byte-match
    the tight definitions (lip polygon + 0.004fw ellipse dilation; DETECTED
    aperture pair + 0.004fw halo) — downstream re-dilation breaks equality."""
    ctx = _ctx()
    _, _, guards = build_mask(ctx)

    lip_poly = np.zeros((H, W), np.uint8)
    cv2.fillPoly(lip_poly, [LM[LIPS_OUTER].astype(np.int32)], 1)
    lk = max(3, int(LIP_GUARD_DILATE_FW * FW) | 1)
    expect_lip = cv2.dilate(lip_poly, cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (lk, lk))) > 0
    assert np.array_equal(guards["lip"], expect_lip)

    # The aperture guard byte-matches the detector's own output, which in
    # turn is exactly the painted blobs + the APERTURE_DILATE_FW halo.
    direct = detect_nostril_apertures(ctx["crop"].bgr, LM, FW)
    assert direct.ok and direct.reject is None
    assert np.array_equal(guards["aperture"], direct.halo)
    assert np.array_equal(direct.core, _true_apertures())
    dk = max(3, int(APERTURE_DILATE_FW * FW) | 1)
    expect_ap = cv2.dilate(_true_apertures().astype(np.uint8),
                           cv2.getStructuringElement(
                               cv2.MORPH_ELLIPSE, (dk, dk))) > 0
    assert np.array_equal(guards["aperture"], expect_ap)

    # Area sanity: the lip guard stays a thin margin (< the area a 0.02fw
    # dilation would give).
    fat = cv2.dilate(lip_poly, cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (int(0.02 * FW) | 1, int(0.02 * FW) | 1))) > 0
    assert guards["lip"].sum() < fat.sum()


def test_aperture_detection_failure_abstains():
    """(v) No dark aperture pair in the image -> the aperture guard is None
    and build_mask abstains with the typed reason (never fabricated)."""
    ctx = _ctx()
    ctx["crop"].bgr = _skin_bgr(with_apertures=False)
    g = _anatomy_guards(ctx["crop"])
    assert g["aperture"] is None
    assert g["aperture_detection"].reject == APERTURE_REJECT_NO_PAIR
    edit, model, info = build_mask(ctx)
    assert edit is None and model is None
    assert info["abstain"] == ABSTAIN_LOWER_FACE
    assert info["apertureReject"] == APERTURE_REJECT_NO_PAIR


def test_canvas_top_gap_zero():
    """(iv) No uncovered band between the nose bottom and the canvas."""
    ctx = _ctx()
    _, _, guards = build_mask(ctx)
    canvas = guards["canvas"]
    region = _philtrum_region()
    cols = np.nonzero(region.any(axis=0))[0]
    for c in cols:
        ys = np.nonzero(canvas[:, c])[0]
        ys = ys[ys > NOSE_Y]
        assert ys.size, f"column {c}: no canvas below the nose"
        gap = float(ys.min()) - math.floor(NOSE_Y) - 1.0
        assert gap <= 0.0, f"column {c}: top gap {gap} px"


def test_provenance_partition():
    """Provenance map: code 0 == edit mask exactly; out-of-canvas is code 1."""
    ctx = _ctx()
    edit, _, guards = build_mask(ctx)
    prov = guards["provenance"]
    assert np.array_equal(prov == PROV_EDIT, edit)
    assert np.array_equal(prov == PROV_OUT_CANVAS, ~guards["canvas"])
    counts = guards["mask"]["provenancePx"]
    assert counts["edit"] == int(edit.sum())
    assert sum(counts.values()) == H * W


def test_legacy_guards_reproduce_old_blockage():
    """The legacy switch really reproduces the defect (before-measurement
    fidelity): with the old protect-mask-seeded guards the philtrum is
    mostly blocked."""
    ctx = _ctx()
    # protect mask as lower_face_roi built it: dilated lips + 3 nose disks
    protect = np.zeros((H, W), np.float32)
    cv2.fillPoly(protect, [LM[LIPS_OUTER].astype(np.int32)], 1.0)
    k = max(3, int(0.045 * FW) | 1)
    protect = cv2.dilate(protect,
                         cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    nostril_r = max(2, int(0.028 * FW))
    for idx in (*NOSTRILS, NOSE_BOTTOM):
        cv2.circle(protect, (int(LM[idx][0]), int(LM[idx][1])),
                   nostril_r, 1.0, -1)
    ctx["crop"].protect_mask = np.clip(protect, 0, 1)

    edit_new, _, g_new = build_mask(ctx)
    edit_old, _, _ = build_mask(ctx, legacy_guards=True)
    region = _philtrum_region() & ~g_new["aperture"]
    cov_old = float((edit_old & region).sum()) / float(region.sum())
    cov_new = float((edit_new & region).sum()) / float(region.sum())
    # The synthetic fixture reproduces the STRUCTURE of the defect (nose-disk
    # + dilated-lip carving of the philtrum); the exact 98.6% number belongs
    # to real geometry and is measured by spike.mask_eval on photos.
    assert cov_old <= 0.65, f"legacy repro too permissive: {cov_old:.3f}"
    assert cov_new >= 0.95
    assert cov_new - cov_old >= 0.30


def test_no_nose_bottom_seed_in_guards():
    """NOSE_BOTTOM must not seed any guard: a pixel just under the nose
    bottom (philtrum top) is guard-free."""
    ctx = _ctx()
    guards = _anatomy_guards(ctx["crop"])
    assert guards is not None
    y, x = int(NOSE_Y) + 3, int(CX)
    assert not guards["lip"][y, x]
    assert not guards["aperture"][y, x]


# ---------------------------------------------------------------------------
# Aperture detector robustness (Codex #14 Q4): every ADDITIVE gate has a
# reject control with its typed reason; a clean pair keeps full confidence.
# Bounds are the calibrated envelope (n=18 non-holdout detections): area
# ratio <=5.0, x-asym <=0.12fw, gap in [0.05, 0.30]fw, pair persistence at
# contrasts {36, 40}, ROI-shift consensus >=3/4.
# ---------------------------------------------------------------------------

def _blob_img(blobs: list[tuple[int, int, int, int]],
              color=(25, 25, 25)) -> np.ndarray:
    """Skin image (no default apertures) + custom dark ellipses
    (cx, cy, ax, ay)."""
    img = _skin_bgr(with_apertures=False)
    for cx, cy, ax, ay in blobs:
        cv2.ellipse(img, (cx, cy), (ax, ay), 0, 0, 360, color, -1)
    return img


def test_aperture_clean_pair_full_confidence():
    det = detect_nostril_apertures(_skin_bgr(), LM, FW)
    assert det.ok and det.reject is None
    assert det.confidence == 1.0
    assert det.checks["perturbHits"] == "4/4"
    assert all(det.checks["contrastPersist"].values())


def test_aperture_area_ratio_rejects():
    """One big + one tiny aperture (ratio ~9 > 5.0) -> typed reject."""
    img = _blob_img([(176, 146, 5, 3), (224, 146, 1, 1)])
    det = detect_nostril_apertures(img, LM, FW)
    assert not det.ok and det.reject == APERTURE_REJECT_RATIO
    assert det.checks["areaRatio"] > 5.0
    assert det.halo is None and det.core is None


def test_aperture_x_asymmetry_rejects():
    """Pair heavily off the nose center (asym ~0.16fw > 0.12fw)."""
    lm = LM.copy()
    lm[NOSTRILS[0]] = (CX - 45.0, NOSTRIL_Y)
    lm[NOSTRILS[1]] = (CX + 45.0, NOSTRIL_Y)
    img = _blob_img([(158, 146, 4, 2), (206, 146, 4, 2)])
    det = detect_nostril_apertures(img, lm, FW)
    assert not det.ok and det.reject == APERTURE_REJECT_ASYM
    assert det.checks["xAsymFw"] > 0.12


def test_aperture_gap_too_small_rejects():
    """Pair squeezed to a 0.036fw gap (< 0.05fw floor)."""
    img = _blob_img([(196, 146, 2, 2), (204, 146, 2, 2)])
    det = detect_nostril_apertures(img, LM, FW)
    assert not det.ok and det.reject == APERTURE_REJECT_GAP
    assert det.checks["gapFw"] < 0.05


def _gray_for_lab_l(l_target: float) -> int:
    for g in range(255, -1, -1):
        l_val = float(cv2.cvtColor(np.full((1, 1, 3), g, np.uint8),
                                   cv2.COLOR_BGR2Lab)[0, 0, 0])
        if l_val <= l_target:
            return g
    return 0


def test_aperture_contrast_instability_rejects():
    """A mid-dark flood (L = ROI median - 38) is invisible at contrast 40
    but at 36 merges with the left aperture into an over-max-area blob:
    the pair does not PERSIST across the contrast set -> typed reject.
    Tested at the VARIANT level (base pipeline): the public API may still
    rescue this fixture via the tone fallback (larger area cap) — that
    boundary move is the explicit subject of the rescue test below."""
    img = _blob_img([(176, 146, 4, 2), (224, 146, 4, 2)])
    med0 = float(np.median(cv2.cvtColor(img[138:155, 171:230],
                                        cv2.COLOR_BGR2Lab)[..., 0]))
    g = _gray_for_lab_l(med0 - 38.0)
    img[138:145, 171:196] = (g, g, g)   # 7x25 band touching the left blob
    det = hybrid_recon._detect_apertures_variant(img, LM, FW, fallback=False)
    assert not det.ok and det.reject == APERTURE_REJECT_CONTRAST
    assert det.checks["contrastPersist"]["36.0"] is False


def test_aperture_small_flood_rescued_by_tone_fallback():
    """Boundary move (cp6 postmortem, recorded): a SMALL mid-dark flood that
    breaks base persistence (merged blob > 0.06fw cap) but stays under the
    fallback cap (0.085fw) is now rescued by the tone-adaptive fallback,
    flagged toneFallback — the guard covers the merged region (over-guarding
    is the safe direction; abstain was the old outcome)."""
    img = _blob_img([(176, 146, 4, 2), (224, 146, 4, 2)])
    med0 = float(np.median(cv2.cvtColor(img[138:155, 171:230],
                                        cv2.COLOR_BGR2Lab)[..., 0]))
    g = _gray_for_lab_l(med0 - 38.0)
    img[138:145, 171:196] = (g, g, g)   # 7x25 band touching the left blob
    det = detect_nostril_apertures(img, LM, FW)
    assert det.ok and det.checks.get("toneFallback") is True


def test_aperture_dark_skin_tone_fallback():
    """cp6 postmortem repair (medium_wikimedia_g02 class): on dark skin the
    ROI median sits near the aperture level, so median-40 selects nothing
    and the base scan finds no pair — the tone-adaptive fallback must
    recover the same, clearly visible pair (flagged toneFallback)."""
    img = _skin_bgr().astype(np.float32)
    img = np.clip(img * 0.15, 0, 255).astype(np.uint8)   # deep darkening:
    # ROI median lands near the aperture level (g02 measured median L=11)
    det = detect_nostril_apertures(img, LM, FW)
    assert det.ok and det.checks.get("toneFallback") is True
    assert det.core is not None and det.halo is not None


def test_aperture_roi_perturb_consensus_rejects():
    """Blobs straddling the ROI's left/right edges survive the base scan but
    vanish under x-shifts: consensus 2/4 < 3/4 -> typed reject."""
    img = _blob_img([(171, 141, 2, 2), (229, 141, 2, 2)])
    det = detect_nostril_apertures(img, LM, FW)
    assert not det.ok and det.reject == APERTURE_REJECT_PERTURB
    hits = int(det.checks["perturbHits"].split("/")[0])
    assert hits < 3
    assert det.confidence < 1.0
