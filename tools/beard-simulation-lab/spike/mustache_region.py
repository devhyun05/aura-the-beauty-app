"""Mustache region activation — Codex #13 agreed spec (initial FREEZE).

Problem this solves: the strict evidence mask erases mustache hair pixel by
pixel, so partial evidence leaves a half-erased mustache (worse than none).
This module decides, per mustache SUBREGION, whether the mustache is
PRESENT — and if so the caller fills the WHOLE subregion(s) under LaMa
(edit = R ∩ face_canvas − lip_guard − aperture_guard).

Signal separation contract (Codex #13 task 1): the decision consumes the
SEPARATED signals — semantic = raw CLIPSeg sigmoid heat (never the
C1∪shadow∪CLIPSeg max-union), texture = anchor-normalized black-hat excess
(eval.reference_bundle.normalized_excess). The max-union hid which signal
fired; a mustache call requires BOTH independent families.

Subregions (task 2): the band nose-bottom → upper lip, split at the mouth
corner x's: left lobe / center (philtrum) / right lobe. Lobes extend
LOBE_EXT_FW past the corners (mustache ends hang beside the mouth).

Firing rules (task 3, FROZEN — do not tune without a Codex round):
  semantic   = raw_clipseg > SEMANTIC_THR (0.06, == eval CLIPSEG_THR onset)
  texture    = normalized_excess > 0
  coincident = dilate(semantic, 0.006fw) ∩ texture
  A: |coincident ∩ R| ≥ max(8 px, 0.5%·|R|) AND coincident present in ≥2 of
     R's 3 x-thirds (spatial spread — a single spot is not a mustache).
  B: |strict_edit ∩ R| ≥ 3%·|R| AND ≥3 hair-like texture components whose
     centers span ≥ 0.04fw AND |semantic ∩ R| ≥ 1%·|R|.

False-fire principles (task 5), encoded structurally:
  - Lab darkness alone can NEVER fire: texture enters only through
    coincident (needs semantic nearby) or rule B (needs semantic ≥1%·|R|).
  - A single dot (mole/pore) can NEVER fire: rule A rejects a lone compact
    coincident component (MOLE_MAX_SIDE_FW, bbox max side) and needs 2 of 3
    x-thirds; rule B needs ≥3 spread components.
  - Negative (beardless) kill-set validation: 보류 — 무수염 negative 세트
    대기 (2026-07-12). Synthetic negatives only, in tests/test_mustache_region.

Activation resolution (task 4): ≥2 subregions fired (both lobes, or a lobe
plus the center) → the WHOLE mustache activates; exactly one fired → that
subregion only; none → no region fill (strict mask stands alone).
"""
from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB))

from engine.detect_face import LIPS_OUTER, MOUTH_CORNERS, NOSE_BOTTOM  # noqa: E402
from spike.mask_v3 import CANVAS_TOP_BUFFER_FW  # noqa: E402

# --- Frozen rule constants (Codex #13). All fw-relative. --------------------
SEMANTIC_THR = 0.06            # raw CLIPSeg sigmoid onset (== CLIPSEG_THR)
COINCIDENT_DILATE_FW = 0.006   # semantic halo that texture must land in
RULE_A_MIN_PX = 8
RULE_A_MIN_FRAC = 0.005        # 0.5% of |R|
RULE_A_MIN_THIRDS = 2          # coincident must appear in >=2 of 3 x-thirds
RULE_B_STRICT_FRAC = 0.03      # strict edit mask already covers 3% of |R|
RULE_B_MIN_COMPONENTS = 3      # hair-like texture components in R
RULE_B_SPAN_FW = 0.04          # their centers must span this much
RULE_B_SEMANTIC_FRAC = 0.01    # independent semantic co-signal, 1% of |R|
MOLE_MAX_SIDE_FW = 0.03        # lone coincident component whose bbox MAX
                               #   SIDE is under this is a mole/pore ->
                               #   reject. (Renamed from MOLE_MAX_DIAG_FW
                               #   2026-07-12: the implementation always
                               #   measured max(bbox w, h), not the diagonal;
                               #   the name now matches the implementation —
                               #   value and behavior unchanged, max-side is
                               #   the more conservative reading and frozen
                               #   constants are not retuned.)
LOBE_EXT_FW = 0.08             # lobe outer x extent past the mouth corner

SUBREGIONS = ("L", "C", "R")


@dataclass
class MustacheDecision:
    fired: dict = field(default_factory=dict)       # name -> bool
    rules: dict = field(default_factory=dict)       # name -> "A"/"B"/None
    detail: dict = field(default_factory=dict)      # name -> measurements
    activated: tuple = ()                           # subregion names filled


def mustache_subregions(landmarks: np.ndarray, shape: tuple[int, ...],
                        fw: float) -> dict[str, np.ndarray]:
    """Left lobe / center / right lobe masks in crop coords.

    Band: y in (nose_bottom − CANVAS_TOP_BUFFER_FW·fw, max mouth-corner y],
    minus the raw lip polygon (the lip guard re-subtracts with its margin at
    fill time); x in [left corner − LOBE_EXT, right corner + LOBE_EXT].
    Split at the mouth corner x's. All landmark indices are MediaPipe."""
    h, w = int(shape[0]), int(shape[1])
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

    nose_y = float(landmarks[NOSE_BOTTOM][1])
    top_y = nose_y - CANVAS_TOP_BUFFER_FW * fw
    cxs = [float(landmarks[i][0]) for i in MOUTH_CORNERS]
    cys = [float(landmarks[i][1]) for i in MOUTH_CORNERS]
    xl, xr = min(cxs), max(cxs)
    bot_y = max(cys)

    lip = np.zeros((h, w), np.uint8)
    cv2.fillPoly(lip, [landmarks[LIPS_OUTER].astype(np.int32)], 1)

    band = ((yy > top_y) & (yy <= bot_y) & (lip == 0)
            & (xx >= xl - LOBE_EXT_FW * fw) & (xx <= xr + LOBE_EXT_FW * fw))
    return {"L": band & (xx < xl),
            "C": band & (xx >= xl) & (xx <= xr),
            "R": band & (xx > xr)}


def region_signals(semantic_heat: np.ndarray, nz: np.ndarray, fw: float,
                   ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(semantic, texture, coincident) bool maps from the SEPARATED fields:
    semantic_heat = raw CLIPSeg sigmoid (smoothed, pre-union), nz =
    anchor-normalized black-hat excess z-map."""
    semantic = semantic_heat > SEMANTIC_THR
    texture = nz > 0
    dk = max(3, int(COINCIDENT_DILATE_FW * fw) | 1)
    sem_d = cv2.dilate(semantic.astype(np.uint8),
                       cv2.getStructuringElement(cv2.MORPH_ELLIPSE,
                                                 (dk, dk))) > 0
    return semantic, texture, sem_d & texture


def _x_thirds_hit(pix: np.ndarray, region: np.ndarray) -> int:
    """How many of region's 3 x-extent thirds contain a pix pixel."""
    cols = np.nonzero(region.any(axis=0))[0]
    if cols.size == 0:
        return 0
    edges = np.linspace(float(cols.min()), float(cols.max()) + 1.0, 4)
    xs = np.nonzero(pix.any(axis=0))[0].astype(np.float64)
    return int(sum(bool(((xs >= edges[i]) & (xs < edges[i + 1])).any())
                   for i in range(3)))


def fires_rule_a(region: np.ndarray, coincident: np.ndarray, fw: float,
                 ) -> tuple[bool, dict]:
    """A: coincident mass + spatial spread inside R."""
    co = coincident & region
    area = float(region.sum())
    need = max(float(RULE_A_MIN_PX), RULE_A_MIN_FRAC * area)
    d = {"coincidentPx": int(co.sum()), "needPx": int(np.ceil(need))}
    if co.sum() < need:
        return False, d
    # Mole/pore guard (principle 5): one lone compact component never fires.
    n, _, stats, _ = cv2.connectedComponentsWithStats(co.astype(np.uint8),
                                                      connectivity=8)
    if n - 1 == 1:
        side = max(int(stats[1, cv2.CC_STAT_WIDTH]),
                   int(stats[1, cv2.CC_STAT_HEIGHT]))
        d["loneComponentSidePx"] = side
        if side < MOLE_MAX_SIDE_FW * fw:
            d["moleRejected"] = True
            return False, d
    d["thirdsHit"] = _x_thirds_hit(co, region)
    return d["thirdsHit"] >= RULE_A_MIN_THIRDS, d


def fires_rule_b(region: np.ndarray, strict_edit: np.ndarray,
                 semantic: np.ndarray, texture: np.ndarray, fw: float,
                 ) -> tuple[bool, dict]:
    """B: the strict mask already committed to R + hair-like texture spread
    + independent semantic co-signal."""
    area = float(region.sum())
    d = {"strictPx": int((strict_edit & region).sum()),
         "semanticPx": int((semantic & region).sum())}
    if area == 0 or d["strictPx"] < RULE_B_STRICT_FRAC * area:
        return False, d
    if d["semanticPx"] < RULE_B_SEMANTIC_FRAC * area:
        return False, d
    tex = (texture & region).astype(np.uint8)
    n, _, _, cents = cv2.connectedComponentsWithStats(tex, connectivity=8)
    d["textureComponents"] = n - 1
    if n - 1 < RULE_B_MIN_COMPONENTS:
        return False, d
    c = cents[1:]
    span = float(np.hypot(c[:, 0].max() - c[:, 0].min(),
                          c[:, 1].max() - c[:, 1].min()))
    d["componentSpanFw"] = round(span / fw, 4)
    return span >= RULE_B_SPAN_FW * fw, d


def resolve_activation(fired: dict[str, bool]) -> tuple[str, ...]:
    """≥2 fired (both lobes, or lobe+center) → whole mustache; exactly one
    confident subregion → that subregion only; none → nothing."""
    hits = tuple(k for k in SUBREGIONS if fired.get(k))
    if len(hits) >= 2:
        return SUBREGIONS
    return hits


def decide(subregions: dict[str, np.ndarray], semantic: np.ndarray,
           texture: np.ndarray, coincident: np.ndarray,
           strict_edit: np.ndarray, fw: float) -> MustacheDecision:
    dec = MustacheDecision()
    for name in SUBREGIONS:
        reg = subregions[name]
        a, da = fires_rule_a(reg, coincident, fw)
        b, db = (False, {})
        if not a:
            b, db = fires_rule_b(reg, strict_edit, semantic, texture, fw)
        dec.fired[name] = bool(a or b)
        dec.rules[name] = "A" if a else ("B" if b else None)
        dec.detail[name] = {"regionPx": int(reg.sum()), "A": da, "B": db}
    dec.activated = resolve_activation(dec.fired)
    return dec


def activation_fill(subregions: dict[str, np.ndarray],
                    activated: tuple[str, ...], canvas: np.ndarray,
                    lip_guard: np.ndarray, aperture_guard: np.ndarray,
                    ) -> np.ndarray:
    """Task 4 fill: edit = R ∩ face_canvas − lip_guard − aperture_guard."""
    fill = np.zeros(canvas.shape, bool)
    for name in activated:
        fill |= subregions[name]
    return fill & canvas & ~lip_guard & ~aperture_guard
