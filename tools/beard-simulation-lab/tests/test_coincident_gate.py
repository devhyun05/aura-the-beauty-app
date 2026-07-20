"""Synthetic controls for the 2026-07-12 coincident gates (spike.hybrid_recon):

(b2) component dual-signal gate — every growth-hysteresis component (PRE
     morphology) and every cands_ext candidate needs >= 1 coincident px
     (dilate(raw CLIPSeg > 0.06, 0.006fw) ∩ nz>0) or the WHOLE component
     drops. Diagnosed on bare-skin IMG_4564: 14,549 strict px from pore
     speckle seeds + a jaw shadow band, ZERO coincident — 100% suppressed at
     0.00pp pic3/psd03 GT-recall cost.
(c)  PROVISIONAL global no-op — canvas coincident total < 300 px (ABSOLUTE;
     the fw² variant killed psd03 by -86pp) AND no mustache subregion fired
     suppresses the whole photo: strict mask AND mustache activation fill.
     2026-07-12 repair: a frozen rule-A/B fire OVERRIDES the provisional
     floor (mass-only triggering suppressed GT-positive pic1 whole —
     coincident 179 < 300, 4/4 components supported, fired A/B/A).

Fully synthetic — the ellipse-face fixture of test_mask_guards; no photos,
no models.
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
    FACE_OVAL, LIPS_OUTER, NOSE_BOTTOM, NOSTRILS,
)
from spike.hybrid_recon import (  # noqa: E402
    COMP_COINCIDENT_MIN_PX, GLOBAL_COINCIDENT_NOOP_PX, build_mask,
)

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
         zone: np.ndarray | None = None,
         zone_soft: np.ndarray | None = None,
         cands: list | None = None) -> dict:
    crop = SimpleNamespace(bgr=_skin_bgr(), face_width=FW, landmarks=LM.copy(),
                           protect_mask=np.zeros((H, W), np.float32))
    return dict(
        crop=crop, det=SimpleNamespace(face_height=FH),
        zone=(zone if zone is not None else np.zeros((H, W), bool)),
        zone_soft=(zone_soft if zone_soft is not None
                   else np.zeros((H, W), np.float32)),
        nz=nz, semantic_heat=heat, cands_ext=(cands or []))


# Bare-skin false-fire replica (IMG_4564 morphology): nz>seedZ pore speckle
# dots + a c1_shadow-style chin band grown from one of them; SEMANTIC SILENT.
SPECKLES = [(200, 130), (212, 155), (232, 262), (256, 155), (272, 232)]


def _speckle_nz(val: float = 10.0) -> np.ndarray:
    nz = np.zeros((H, W), np.float32)
    for y, x in SPECKLES:
        nz[y:y + 3, x:x + 3] = val
    return nz


def test_bare_skin_speckle_and_shadow_zero_edit():
    """4564-class synthetic: speckle seeds + shadow growth band, semantic
    0 everywhere -> coincident 0 -> b2 drops every component AND the global
    no-op takes the photo. editPx must be exactly 0."""
    nz = _speckle_nz()
    zone = np.zeros((H, W), bool)
    zone[270:285, 160:250] = True          # shadow band touching (272,232)
    zone_soft = np.where(zone, 0.2, 0.0).astype(np.float32)  # sub-seed
    ctx = _ctx(nz, np.zeros((H, W), np.float32), zone=zone,
               zone_soft=zone_soft)
    edit, model, info = build_mask(ctx)
    assert int(edit.sum()) == 0
    assert int(model.sum()) == 0
    gate = info["mask"]["componentGate"]
    assert gate["components"] >= len(SPECKLES)   # speckles seeded components
    assert gate["droppedComponents"] == gate["components"]
    assert gate["droppedPx"] > 0
    noop = info["mask"]["noOp"]
    assert noop["triggered"] is True and noop["coincidentPx"] == 0
    assert noop["provisional"] is True and noop["reason"]
    assert info["mask"]["mustache"]["fired"] == {"L": False, "C": False,
                                                 "R": False}


def test_component_gate_keeps_coincident_component_drops_speckle():
    """b2 in isolation (no-op cleared): a chin blob with agreeing semantic
    keeps its component; coincident-free speckles drop even though they
    carry seed-strength nz."""
    nz = _speckle_nz()
    nz[230:260, 185:215] = 10.0            # true-beard blob, 900 px
    heat = np.zeros((H, W), np.float32)
    heat[225:265, 180:220] = 0.3           # semantic agrees on the blob only
    ctx = _ctx(nz, heat)
    edit, _, info = build_mask(ctx)
    noop = info["mask"]["noOp"]
    assert noop["triggered"] is False
    assert noop["coincidentPx"] >= 900
    assert edit[245, 200]                  # blob survives
    for y, x in SPECKLES:
        assert not edit[y:y + 3, x:x + 3].any(), (y, x)   # speckles dropped
    gate = info["mask"]["componentGate"]
    assert gate["droppedComponents"] >= len(SPECKLES) - 1
    assert gate["components"] - gate["droppedComponents"] >= 1


def test_global_noop_absolute_floor_boundary():
    """Exactly at the 300 px floor the photo edits; one px under it — with
    the mustache rules silent (all evidence is a chin blob outside the
    L/C/R band, so the rule-fire override cannot apply) — the whole photo
    is a no-op (strict suppressed)."""
    heat = np.zeros((H, W), np.float32)
    heat[225:275, 165:235] = 0.3
    ys, xs = np.mgrid[235:250, 180:220]
    order = list(zip(ys.ravel().tolist(), xs.ravel().tolist()))

    def run(n_px: int):
        nz = np.zeros((H, W), np.float32)
        for y, x in order[:n_px]:
            nz[y, x] = 10.0
        return build_mask(_ctx(nz, heat))

    edit_at, _, info_at = run(GLOBAL_COINCIDENT_NOOP_PX)        # == 300
    assert info_at["mask"]["noOp"]["triggered"] is False
    assert info_at["mask"]["noOp"]["lowMass"] is False
    assert info_at["mask"]["noOp"]["coincidentPx"] == GLOBAL_COINCIDENT_NOOP_PX
    assert int(edit_at.sum()) > 0

    edit_under, _, info_under = run(GLOBAL_COINCIDENT_NOOP_PX - 1)  # == 299
    assert not any(info_under["mask"]["mustache"]["fired"].values())
    assert info_under["mask"]["noOp"]["lowMass"] is True
    assert info_under["mask"]["noOp"]["triggered"] is True
    assert int(edit_under.sum()) == 0


def test_global_noop_overridden_by_mustache_rule_fire():
    """pic1-class regression control (2026-07-12 repair): sub-floor total
    coincident mass (24 px << 300) but rule A fires in BOTH lobes — the
    frozen presence standard overrides the provisional floor, so the photo
    must edit (activation fill intact), with the low mass still recorded.
    Under the pre-repair mass-only trigger this photo was suppressed whole
    (GT-positive pic1: coincident 179, fired A/B/A, editPx 18,273 -> 0)."""
    heat = np.zeros((H, W), np.float32)
    heat[145:189, 130:271] = 0.2           # semantic band over the mustache
    # 3 dots per lobe, spread over >=2 x-thirds; nz=1.0 stays sub-seed so
    # the strict mask is empty — the edit, if any, is pure activation fill.
    nz = np.zeros((H, W), np.float32)
    for y, x in [(155, 141), (170, 146), (160, 151),      # L lobe
                 (155, 249), (170, 254), (160, 259)]:     # R lobe
        nz[y:y + 2, x:x + 2] = 1.0
    edit, model, info = build_mask(_ctx(nz, heat))
    noop = info["mask"]["noOp"]
    assert noop["lowMass"] is True
    assert noop["coincidentPx"] < GLOBAL_COINCIDENT_NOOP_PX
    assert noop["triggered"] is False                     # overridden
    assert noop["overriddenByMustacheRules"] is True
    assert noop["reason"] and "overridden" in noop["reason"]
    mus = info["mask"]["mustache"]
    assert mus["fired"]["L"] and mus["fired"]["R"]
    assert mus["activated"] == ["L", "C", "R"]
    assert mus["fillPx"] > 0 and "suppressedByNoOp" not in mus
    assert int(edit.sum()) > 0
    assert int(model.sum()) > 0


def test_cands_ext_obeys_component_gate():
    """cands_ext no longer merges on canvas membership alone (Codex #14):
    an isolated candidate without coincident support drops with its closed
    component; one with support still merges (dilated + closed)."""
    heat = np.zeros((H, W), np.float32)
    heat[225:275, 165:235] = 0.3
    nz = np.zeros((H, W), np.float32)
    nz[235:265, 180:220] = 0.5             # sub-seed texture: coincident 1200
    cand_in = SimpleNamespace(px=np.array([[240, x] for x in range(190, 200)]))
    cand_out = SimpleNamespace(px=np.array([[200, x] for x in range(138, 148)]))
    ctx = _ctx(nz, heat, cands=[cand_in, cand_out])
    edit, _, info = build_mask(ctx)
    assert edit[240, 195]                          # supported cand merged
    assert not edit[198:206, 136:150].any()        # unsupported cand dropped
    assert info["mask"]["componentGate"]["droppedComponents"] >= 1
    assert COMP_COINCIDENT_MIN_PX == 1             # frozen gate strength


def test_no_semantic_field_skips_gates():
    """Synthetic guard-test ctxs without a semantic field must keep the old
    behavior: no component gate, no no-op (both reported as None)."""
    ctx = _ctx(np.full((H, W), 10.0, np.float32), np.zeros((H, W), np.float32))
    del ctx["semantic_heat"]
    ctx["zone"] = np.ones((H, W), bool)
    ctx["zone_soft"] = np.ones((H, W), np.float32)
    edit, _, info = build_mask(ctx)
    assert info["mask"]["componentGate"] is None
    assert info["mask"]["noOp"] is None
    assert int(edit.sum()) > 0
