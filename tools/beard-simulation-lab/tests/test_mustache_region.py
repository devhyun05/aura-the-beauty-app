"""Synthetic controls for spike/mustache_region.py (Codex #13 spec).

Fully synthetic — no photos, no models: the ellipse-face 478-slot landmark
fixture (as test_mask_guards), plus hand-placed semantic/texture fields.
Every FROZEN rule gets a fire control AND a no-fire control, and each
false-fire principle (task 5) has its own negative:
  - Lab darkness alone (texture-only) must NOT fire,
  - semantic-only must NOT fire,
  - a single mole/pore dot must NOT fire,
  - rule B without spread components / without semantic must NOT fire.
무수염 실사 negative kill 검증은 보류(세트 대기) — 여기는 합성 negative만.
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
from spike import mustache_region as mr  # noqa: E402
from spike.hybrid_recon import build_mask  # noqa: E402

H, W = 520, 400
CX, CY, RX, RY = 200.0, 170.0, 110.0, 140.0
FW, FH = 2 * RX, 2 * RY
NOSE_Y = 150.0
MOUTH_CY, LIP_RX, LIP_RY = 188.0, 45.0, 16.0
NOSTRIL_DX, NOSTRIL_Y = 24.0, 146.0
SKIN_BGR = (150, 170, 205)
APERTURE_AXES = (4, 2)


def _landmarks() -> np.ndarray:
    lm = np.zeros((478, 2), np.float32)
    for i, idx in enumerate(FACE_OVAL):
        ang = math.radians(-90.0 + i * 10.0)
        lm[idx] = (CX + RX * math.cos(ang), CY + RY * math.sin(ang))
    lm[NOSE_BOTTOM] = (CX, NOSE_Y)
    for i, idx in enumerate(LIPS_OUTER):
        ang = math.radians(180.0 + i * 18.0)
        lm[idx] = (CX + LIP_RX * math.cos(ang),
                   MOUTH_CY + LIP_RY * math.sin(ang))
    lm[NOSTRILS[0]] = (CX - NOSTRIL_DX, NOSTRIL_Y)
    lm[NOSTRILS[1]] = (CX + NOSTRIL_DX, NOSTRIL_Y)
    return lm


LM = _landmarks()
SUBR = mr.mustache_subregions(LM, (H, W), FW)
XL, XR = CX - LIP_RX, CX + LIP_RX          # mouth corners x: 155, 245


def _empty() -> np.ndarray:
    return np.zeros((H, W), bool)


def _dots(points: list[tuple[int, int]], size: int = 2) -> np.ndarray:
    m = _empty()
    for y, x in points:
        m[y:y + size, x:x + size] = True
    return m


# Texture dots spread over >=2 x-thirds of each lobe (lobe L x ~ 138..154,
# thirds ~5.5 px wide at this geometry).
L_DOTS = [(155, 141), (170, 146), (160, 151)]
R_DOTS = [(155, 249), (170, 254), (160, 259)]


def _semantic_band(val: float = 0.2) -> np.ndarray:
    """Raw-heat field covering the whole mustache band (> SEMANTIC_THR)."""
    heat = np.zeros((H, W), np.float32)
    heat[145:189, 130:271] = val
    return heat


def _signals(heat: np.ndarray, nz: np.ndarray):
    return mr.region_signals(heat, nz, FW)


# --------------------------------------------------------------------------
# geometry
# --------------------------------------------------------------------------

def test_subregion_geometry():
    """Band nose-bottom..mouth-corner level, split at the corner x's, lip
    polygon excluded, subregions pairwise disjoint."""
    lip = np.zeros((H, W), np.uint8)
    cv2.fillPoly(lip, [LM[LIPS_OUTER].astype(np.int32)], 1)
    all_r = _empty()
    for name in mr.SUBREGIONS:
        reg = SUBR[name]
        assert reg.any()
        assert not (reg & (lip > 0)).any()          # never on the lip
        assert not (reg & all_r).any()              # disjoint
        all_r |= reg
        ys, xs = np.nonzero(reg)
        assert ys.min() >= NOSE_Y - mr.CANVAS_TOP_BUFFER_FW * FW - 1
        assert ys.max() <= MOUTH_CY + 1              # corner y level
    assert (np.nonzero(SUBR["L"])[1] < XL).all()
    assert (np.nonzero(SUBR["R"])[1] > XR).all()
    xs_c = np.nonzero(SUBR["C"])[1]
    assert xs_c.min() >= XL and xs_c.max() <= XR
    # lobes extend LOBE_EXT_FW past the corners, no further
    assert np.nonzero(SUBR["L"])[1].min() >= XL - mr.LOBE_EXT_FW * FW - 1
    assert np.nonzero(SUBR["R"])[1].max() <= XR + mr.LOBE_EXT_FW * FW + 1


# --------------------------------------------------------------------------
# rule A
# --------------------------------------------------------------------------

def test_rule_a_fires_on_coincident_spread():
    semantic, texture, coincident = _signals(_semantic_band(),
                                             _dots(L_DOTS) * 5.0)
    fired, d = mr.fires_rule_a(SUBR["L"], coincident, FW)
    assert fired, d
    assert d["thirdsHit"] >= mr.RULE_A_MIN_THIRDS


def test_rule_a_single_third_no_fire():
    """Enough pixels but all in one x-third: no spatial spread, no fire."""
    dots = _dots([(150, 140), (160, 140), (170, 140)], size=2)
    _, _, coincident = _signals(_semantic_band(), dots * 5.0)
    fired, d = mr.fires_rule_a(SUBR["L"], coincident, FW)
    assert not fired, d


def test_rule_a_below_min_px_no_fire():
    dots = _dots([(155, 141), (170, 151)], size=1)   # 2 px < 8
    _, _, coincident = _signals(_semantic_band(), dots * 5.0)
    fired, d = mr.fires_rule_a(SUBR["L"], coincident, FW)
    assert not fired, d


def test_mole_single_dot_no_fire():
    """Principle 5: a lone compact dot (mole/pore) under broad semantic must
    not fire either rule."""
    nz = _dots([(165, 145)], size=3) * 8.0            # 9 px >= min mass
    heat = _semantic_band()
    semantic, texture, coincident = _signals(heat, nz)
    fired_a, da = mr.fires_rule_a(SUBR["L"], coincident, FW)
    assert not fired_a and da.get("moleRejected"), da
    # rule B: 1 component < 3, and strict edit is empty anyway
    fired_b, db = mr.fires_rule_b(SUBR["L"], _empty(), semantic, texture, FW)
    assert not fired_b


def test_mole_guard_measures_bbox_max_side():
    """MOLE_MAX_SIDE_FW is the bbox MAX SIDE, not the diagonal (2026-07-12
    rename, behavior preserved): a lone 5x5 blob has side 5 < 0.03fw=6.6 and
    is mole-rejected — under a diagonal rule (hypot(5,5)=7.07 > 6.6) it
    would slip through."""
    assert not hasattr(mr, "MOLE_MAX_DIAG_FW")        # old name retired
    nz = _dots([(160, 145)], size=5) * 8.0            # 25 px lone blob
    _, _, coincident = _signals(_semantic_band(), nz)
    fired, d = mr.fires_rule_a(SUBR["L"], coincident, FW)
    assert not fired and d.get("moleRejected"), d
    assert d["loneComponentSidePx"] == 5
    assert math.hypot(5, 5) > mr.MOLE_MAX_SIDE_FW * FW  # diag rule differs


def test_mole_guard_elongated_lone_component_not_mole():
    """A lone hair-like streak (bbox max side > 0.03fw) is NOT dismissed as
    a mole; with x-thirds spread it fires rule A."""
    nz = _empty().astype(np.float32)
    nz[150:153, 139:155] = 8.0                        # 3x16 streak in L lobe
    _, _, coincident = _signals(_semantic_band(), nz)
    fired, d = mr.fires_rule_a(SUBR["L"], coincident, FW)
    assert not d.get("moleRejected"), d
    assert fired, d


def test_texture_only_lab_darkness_no_fire():
    """Principle 5: Lab-darkness/texture alone (semantic silent) must not
    fire — even with a committed strict mask."""
    nz = np.zeros((H, W), np.float32)
    nz[SUBR["L"]] = 6.0                               # saturated texture
    semantic, texture, coincident = _signals(np.zeros((H, W), np.float32), nz)
    assert not coincident.any()
    fired_a, _ = mr.fires_rule_a(SUBR["L"], coincident, FW)
    fired_b, db = mr.fires_rule_b(SUBR["L"], SUBR["L"].copy(), semantic,
                                  texture, FW)
    assert not fired_a and not fired_b, db


def test_semantic_only_no_fire():
    """CLIPSeg belief without any texture evidence must not fire."""
    semantic, texture, coincident = _signals(_semantic_band(),
                                             np.zeros((H, W), np.float32))
    fired_a, _ = mr.fires_rule_a(SUBR["L"], coincident, FW)
    fired_b, _ = mr.fires_rule_b(SUBR["L"], SUBR["L"].copy(), semantic,
                                 texture, FW)
    assert not fired_a and not fired_b


# --------------------------------------------------------------------------
# rule B
# --------------------------------------------------------------------------

def _rule_b_setup():
    """C-region rule-B scenario with coincident kept EMPTY: semantic band at
    the very top, texture dots 11 px below it (beyond the 0.006fw halo)."""
    heat = np.zeros((H, W), np.float32)
    heat[145:150, 160:241] = 0.2                      # >=1% of |C|
    nz = _dots([(160, 170), (162, 200), (161, 230)], size=2) * 5.0
    strict = SUBR["C"] & (np.mgrid[0:H, 0:W][0] < 165)  # >=3% of |C|
    return heat, nz, strict


def test_rule_b_fires():
    heat, nz, strict = _rule_b_setup()
    semantic, texture, coincident = _signals(heat, nz)
    assert not (coincident & SUBR["C"]).any()         # A is silent by design
    fired_a, _ = mr.fires_rule_a(SUBR["C"], coincident, FW)
    assert not fired_a
    fired_b, d = mr.fires_rule_b(SUBR["C"], strict, semantic, texture, FW)
    assert fired_b, d
    assert d["textureComponents"] >= mr.RULE_B_MIN_COMPONENTS
    assert d["componentSpanFw"] >= mr.RULE_B_SPAN_FW


def test_rule_b_needs_semantic():
    _, nz, strict = _rule_b_setup()
    semantic, texture, _ = _signals(np.zeros((H, W), np.float32), nz)
    fired, d = mr.fires_rule_b(SUBR["C"], strict, semantic, texture, FW)
    assert not fired, d


def test_rule_b_needs_three_spread_components():
    heat, _, strict = _rule_b_setup()
    semantic = heat > mr.SEMANTIC_THR
    # only 2 components
    tex2 = _dots([(160, 170), (161, 230)], size=2)
    fired, d = mr.fires_rule_b(SUBR["C"], strict, semantic, tex2, FW)
    assert not fired, d
    # 3 components but centers bunched under 0.04fw (8.8 px)
    tex3 = _dots([(160, 198), (160, 202), (163, 200)], size=2)
    fired, d = mr.fires_rule_b(SUBR["C"], strict, semantic, tex3, FW)
    assert not fired, d


def test_rule_b_needs_strict_commitment():
    heat, nz, _ = _rule_b_setup()
    semantic, texture, _ = _signals(heat, nz)
    fired, d = mr.fires_rule_b(SUBR["C"], _empty(), semantic, texture, FW)
    assert not fired, d


# --------------------------------------------------------------------------
# activation resolution + fill
# --------------------------------------------------------------------------

def test_resolve_activation():
    assert mr.resolve_activation({"L": True, "C": False, "R": True}) \
        == ("L", "C", "R")
    assert mr.resolve_activation({"L": True, "C": True, "R": False}) \
        == ("L", "C", "R")
    assert mr.resolve_activation({"L": False, "C": True, "R": True}) \
        == ("L", "C", "R")
    assert mr.resolve_activation({"L": True, "C": False, "R": False}) == ("L",)
    assert mr.resolve_activation({"L": False, "C": True, "R": False}) == ("C",)
    assert mr.resolve_activation({"L": False, "C": False, "R": False}) == ()


def test_activation_fill_respects_guards_and_canvas():
    canvas = np.ones((H, W), bool)
    canvas[:, :145] = False                           # clip part of L lobe
    lip = np.zeros((H, W), np.uint8)
    cv2.fillPoly(lip, [LM[LIPS_OUTER].astype(np.int32)], 1)
    lip = cv2.dilate(lip, np.ones((5, 5), np.uint8)) > 0
    aperture = _dots([(146, 175), (146, 223)], size=3)
    fill = mr.activation_fill(SUBR, ("L", "C", "R"), canvas, lip, aperture)
    assert fill.any()
    assert not (fill & lip).any()
    assert not (fill & aperture).any()
    assert not (fill & ~canvas).any()
    expect = (SUBR["L"] | SUBR["C"] | SUBR["R"]) & canvas & ~lip & ~aperture
    assert np.array_equal(fill, expect)
    # single-lobe activation fills that lobe only
    fill_l = mr.activation_fill(SUBR, ("L",), canvas, lip, aperture)
    assert not (fill_l & SUBR["R"]).any()
    assert not (fill_l & SUBR["C"]).any()


# --------------------------------------------------------------------------
# build_mask integration (spike.hybrid_recon)
# --------------------------------------------------------------------------

def _skin_bgr() -> np.ndarray:
    rng = np.random.RandomState(20260712)
    img = np.full((H, W, 3), SKIN_BGR, np.float32)
    img += rng.normal(0, 3.0, img.shape).astype(np.float32)
    img = np.clip(img, 0, 255).astype(np.uint8)
    for idx in NOSTRILS:                              # detectable apertures
        cv2.ellipse(img, (int(LM[idx][0]), int(LM[idx][1])),
                    APERTURE_AXES, 0, 0, 360, (25, 25, 25), -1)
    return img


def _ctx(nz: np.ndarray, heat: np.ndarray,
         coincident_floor: bool = True) -> dict:
    """coincident_floor paints a chin patch of weak agreeing evidence
    (semantic 0.2 + nz 0.5, both sub-seed) so photo-wide coincident mass
    clears the PROVISIONAL 300px global no-op floor — the fixtures here test
    the mustache ACTIVATION rules, not the no-op (tests/test_coincident_gate
    owns that). The patch sits outside the L/C/R subregions and seeds
    nothing, so rule evaluation and the strict mask are unaffected."""
    crop = SimpleNamespace(bgr=_skin_bgr(), face_width=FW, landmarks=LM.copy(),
                           protect_mask=np.zeros((H, W), np.float32))
    nz = nz.copy()
    heat = heat.copy()
    if coincident_floor:
        heat[230:270, 170:230] = np.maximum(heat[230:270, 170:230], 0.2)
        nz[235:265, 180:220] = np.maximum(nz[235:265, 180:220], 0.5)
    return dict(crop=crop, det=SimpleNamespace(face_height=FH),
                zone_soft=np.zeros((H, W), np.float32),
                zone=np.zeros((H, W), bool), nz=nz,
                semantic_heat=heat, cands_ext=[])


def test_build_mask_activates_full_mustache():
    """Both lobes fire rule A (dots too weak to seed the strict mask) →
    the WHOLE mustache band is filled, guards and canvas respected."""
    nz = (_dots(L_DOTS) | _dots(R_DOTS)).astype(np.float32) * 1.0  # < seedZ
    ctx = _ctx(nz, _semantic_band())
    edit, model, info = build_mask(ctx)
    must = info["mask"]["mustache"]
    assert must["fired"]["L"] and must["fired"]["R"]
    assert must["rules"]["L"] == "A" and must["rules"]["R"] == "A"
    assert must["activated"] == ["L", "C", "R"]       # lobes → full mustache
    assert must["negativeKill"] == "보류: 세트 대기"
    fill = mr.activation_fill(SUBR, ("L", "C", "R"), info["canvas"],
                              info["lip"], info["aperture"])
    assert (edit & fill).sum() == fill.sum()          # fill fully edited
    assert model[fill].all()
    # philtrum center actually erasable now
    assert edit[160, int(CX)]


def test_build_mask_single_lobe_only():
    """Only one confident lobe → that lobe alone is filled."""
    nz = _dots(L_DOTS).astype(np.float32) * 1.0
    ctx = _ctx(nz, _semantic_band())
    edit, _, info = build_mask(ctx)
    must = info["mask"]["mustache"]
    assert must["activated"] == ["L"]
    assert (edit & SUBR["L"] & info["canvas"]
            & ~info["lip"] & ~info["aperture"]).any()
    assert not (edit & SUBR["R"]).any()
    assert not (edit & SUBR["C"]).any()


def test_build_mask_no_signal_no_activation():
    ctx = _ctx(np.zeros((H, W), np.float32), np.zeros((H, W), np.float32))
    edit, _, info = build_mask(ctx)
    must = info["mask"]["mustache"]
    assert must["activated"] == []
    assert not edit.any()
    assert info["mask"]["noOp"]["triggered"] is False   # floor patch clears it
    # without the coincident floor the global no-op takes the whole photo
    ctx0 = _ctx(np.zeros((H, W), np.float32), np.zeros((H, W), np.float32),
                coincident_floor=False)
    edit0, _, info0 = build_mask(ctx0)
    assert not edit0.any()
    assert info0["mask"]["noOp"]["triggered"] is True
    assert info0["mask"]["noOp"]["provisional"] is True
