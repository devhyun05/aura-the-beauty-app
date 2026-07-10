"""GhostResidual: does the eraser DELETE hairs, or just fade them?

Every metric so far answered a different question. waxiness answers "is there
texture", so a 40%-contrast hair ghost counts the same as a healthy pore, and
chromaDeltaAb answers "is the tint right". Neither can say "this hair is gone".
This ruler can, and it is the single erase-performance gate for the
replacement-based eraser (cross-validated design, 2026-07-11).

How it works:

1. On the ORIGINAL crop, two black-hat scales (strand ~1-3px hairs, clump
   ~5-10px masses) are thresholded against the person's own clean skin: the
   per-scale threshold is max(p99, median + 4.5*MAD) over clean support, so a
   pixel only counts as "hair-dark" if it is darker than ~any clean-skin pore.
2. The excess map E = max over scales of (blackhat - threshold), floored at 0,
   is the "how much darker than any clean skin" field. Candidate components are
   connected regions of E > 0 inside the beard zone.
3. The RESULT is scored on the SAME candidates with the SAME thresholds --
   candidates are never re-extracted from the result, so flattening skin the
   candidates don't cover cannot improve the score (under test).
4. Per component: r = Q95(E_result) / Q95(E_original). r > 0.35 means the hair
   SURVIVED. Per photo: energy-weighted Q90 of r, energy-weighted survival
   rate, and the fraction of candidate area still darker than clean p99.

Pass thresholds live with the gate runner, not here; this module only measures.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

# Kernel ratios (x face width). A black-hat kernel must be ~2x the structure it
# should swallow: 0.010*fw ~ 7px catches 1-3px strands, 0.025*fw ~ 16px catches
# 5-10px clumps (fw~650).
_SCALES = {"strand": 0.010, "clump": 0.025}
_MAD_K = 4.5
_MIN_COMP_PX = 4          # sub-2px specks are sensor/JPEG noise, not hairs
SURVIVE_R = 0.35

# A lone, round, dark component in the zone is a mole, not stubble: hairs are
# elongated, stubble dots come in crowds. Excluded from candidates so the gate
# can never reward erasing a mole (under test).
_MOLE_CIRCULARITY = 0.55
_MOLE_MAX_ASPECT = 1.8
_MOLE_ISOLATION_R = 0.03   # x fw: neighbourhood to count company in
_MOLE_MIN_COMPANY = 4


def blackhat_maps(bgr: np.ndarray, face_width: float) -> dict[str, np.ndarray]:
    lum = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    out = {}
    for name, ratio in _SCALES.items():
        k = max(3, int(face_width * ratio) | 1)
        se = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        out[name] = cv2.morphologyEx(lum, cv2.MORPH_BLACKHAT, se)
    return out


def clean_thresholds(maps: dict[str, np.ndarray],
                     clean: np.ndarray) -> dict[str, float] | None:
    """Per-scale 'darker than any clean skin' threshold, or None if no support."""
    if clean.sum() < 256:
        return None
    thr = {}
    for name, bh in maps.items():
        vals = bh[clean]
        med = float(np.median(vals))
        mad = float(np.median(np.abs(vals - med)))
        thr[name] = max(float(np.percentile(vals, 99)), med + _MAD_K * mad)
    return thr


def excess_map(maps: dict[str, np.ndarray], thr: dict[str, float]) -> np.ndarray:
    e = None
    for name, bh in maps.items():
        cur = np.maximum(bh - thr[name], 0.0)
        e = cur if e is None else np.maximum(e, cur)
    return e.astype(np.float32)


@dataclass
class Candidate:
    label: int
    px: np.ndarray          # (N,2) row/col indices
    weight: float           # excess-darkness energy in the original
    q95_orig: float


def _is_isolated_mole(comp_mask: np.ndarray, n_labels: int, labels: np.ndarray,
                      cy: float, cx: float, face_width: float) -> bool:
    area = int(comp_mask.sum())
    contours, _ = cv2.findContours(comp_mask.astype(np.uint8), cv2.RETR_EXTERNAL,
                                   cv2.CHAIN_APPROX_NONE)
    if not contours:
        return False
    perim = cv2.arcLength(contours[0], True)
    if perim <= 0:
        return False
    circularity = 4 * np.pi * area / (perim * perim)
    (_, _), (w, h), _ = cv2.minAreaRect(contours[0]) if len(contours[0]) >= 3 \
        else ((0, 0), (1.0, 1.0), 0)
    aspect = max(w, h) / max(min(w, h), 1e-3)
    if circularity < _MOLE_CIRCULARITY or aspect > _MOLE_MAX_ASPECT:
        return False
    r = int(_MOLE_ISOLATION_R * face_width)
    y0, y1 = max(0, int(cy) - r), min(labels.shape[0], int(cy) + r + 1)
    x0, x1 = max(0, int(cx) - r), min(labels.shape[1], int(cx) + r + 1)
    neigh = labels[y0:y1, x0:x1]
    company = len(np.unique(neigh[neigh > 0])) - 1  # minus itself
    return company < _MOLE_MIN_COMPANY


def find_candidates(excess_orig: np.ndarray, zone: np.ndarray,
                    face_width: float) -> list[Candidate]:
    """Connected hair-dark components inside the zone, moles excluded."""
    seed = ((excess_orig > 0) & zone).astype(np.uint8)
    n, labels = cv2.connectedComponents(seed, connectivity=8)
    out: list[Candidate] = []
    for lab in range(1, n):
        mask = labels == lab
        if int(mask.sum()) < _MIN_COMP_PX:
            continue
        ys, xs = np.nonzero(mask)
        if _is_isolated_mole(mask, n, labels, ys.mean(), xs.mean(), face_width):
            continue
        vals = excess_orig[mask]
        out.append(Candidate(label=lab, px=np.stack([ys, xs], 1),
                             weight=float(vals.sum()),
                             q95_orig=float(np.percentile(vals, 95))))
    return out


def _weighted_quantile(values: np.ndarray, weights: np.ndarray, q: float) -> float:
    order = np.argsort(values)
    v, w = values[order], weights[order]
    cum = np.cumsum(w)
    return float(v[np.searchsorted(cum, q * cum[-1], side="left").clip(0, len(v) - 1)])


@dataclass
class GhostVerdict:
    nCandidates: int
    weightedQ90R: float | None   # energy-weighted Q90 of per-hair survival ratio
    survivalRate: float | None   # energy-weighted fraction with r > SURVIVE_R
    excessAreaRatio: float | None  # candidate px still darker than clean p99
    perComponentR: list[float]


def score_result(result_bgr: np.ndarray, candidates: list[Candidate],
                 thresholds: dict[str, float], face_width: float) -> GhostVerdict:
    """Score a result image on FROZEN candidates + thresholds from the original.

    An empty candidate list is None-verdict, never an automatic pass: no
    evidence is not good evidence.
    """
    if not candidates:
        return GhostVerdict(0, None, None, None, [])
    maps = blackhat_maps(result_bgr, face_width)
    e_res = excess_map(maps, thresholds)

    rs, ws, area_orig, area_res = [], [], 0, 0
    for c in candidates:
        vals = e_res[c.px[:, 0], c.px[:, 1]]
        r = float(np.percentile(vals, 95)) / max(c.q95_orig, 1e-6)
        rs.append(r)
        ws.append(c.weight)
        area_orig += len(vals)
        area_res += int((vals > 0).sum())
    rs_a, ws_a = np.array(rs, np.float64), np.array(ws, np.float64)
    return GhostVerdict(
        nCandidates=len(candidates),
        weightedQ90R=_weighted_quantile(rs_a, ws_a, 0.90),
        survivalRate=float(ws_a[rs_a > SURVIVE_R].sum() / ws_a.sum()),
        excessAreaRatio=area_res / max(area_orig, 1),
        perComponentR=rs,
    )


# --------------------------------------------------------------------------
# Low-band stain ruler ("색 퍼짐"). Black-hat is blind to smooth darkness: the
# spike-v1 verdict proved a result can score ghost 0.00 while leaving 100% of
# the diffused beard stain. This ruler measures the stain against a
# reconstruction target S ("skin as if no beard"), two-sided: residual stain
# AND over-lift (flat-white gaming). Cross-validated design, 2026-07-11.

LOW_SIGMA_RATIO = 30.0     # low band = GaussianBlur sigma fw/30 (spike-v1 split)
_STAIN_MIN_NEED = 2.0      # L units below which a pixel is not stain
_STAIN_MIN_PX = 64         # smaller stains are N/A, never an automatic pass
OVERLIFT_TOL = 2.0         # L of headroom above S before lift counts as "over"


def low_lab(bgr: np.ndarray, face_width: float) -> np.ndarray:
    """Low band of an image in Lab, L scaled to 0-255, ab offset +128.

    The ruler always re-low-passes the FINAL composited image: reading an
    internal low buffer would miss donor-high and clipping effects (under test
    via score_low_band taking BGR, not L fields).
    """
    low = cv2.GaussianBlur(bgr.astype(np.float32), (0, 0),
                           sigmaX=max(2.0, face_width / LOW_SIGMA_RATIO))
    lab = cv2.cvtColor(np.clip(low, 0, 255) / 255.0, cv2.COLOR_BGR2Lab)
    lab[..., 0] *= 2.55
    lab[..., 1:] += 128.0
    return lab


@dataclass
class LowVerdict:
    stainPx: int
    stainResidual: float | None   # sum(max(S-R,0)) / sum(D) over the stain
    stainQ90R: float | None       # D-weighted Q90 of per-px residual ratio
    overLiftQ90: float | None     # Q90 over zone of max(R - S - tol, 0)
    overLiftMean: float | None
    abResidualQ90: float | None   # Q90 over stain of |ab_result - S_ab|


def score_low_band(result_bgr: np.ndarray, s_l: np.ndarray,
                   orig_low_l: np.ndarray, stain: np.ndarray,
                   zone: np.ndarray, face_width: float,
                   s_ab: np.ndarray | None = None,
                   tol: float = OVERLIFT_TOL) -> LowVerdict:
    """Score a result's low band against the frozen target S from the original.

    D = max(S - orig_low, 0) is the needed lift; the stain is where D exceeds
    the noise floor. Too little stain -> None verdict (no evidence is not good
    evidence). Over-lift is measured over the whole zone: brightening past S
    anywhere is gaming, not erasing.
    """
    res_lab = low_lab(result_bgr, face_width)
    r_l = res_lab[..., 0]
    need = np.maximum(s_l - orig_low_l, 0.0)
    eff = stain & (need > _STAIN_MIN_NEED) & zone

    over = np.maximum(r_l - s_l - tol, 0.0)
    over_q90 = float(np.percentile(over[zone], 90)) if zone.sum() >= 64 else None
    over_mean = float(over[zone].mean()) if zone.sum() >= 64 else None

    if int(eff.sum()) < _STAIN_MIN_PX:
        return LowVerdict(int(eff.sum()), None, None, over_q90, over_mean, None)

    resid = np.maximum(s_l - r_l, 0.0)[eff]
    d = need[eff]
    ratio = resid / d
    ab_q90 = None
    if s_ab is not None:
        dist = np.linalg.norm(res_lab[..., 1:] - s_ab, axis=-1)[eff]
        ab_q90 = float(np.percentile(dist, 90))
    return LowVerdict(
        stainPx=int(eff.sum()),
        stainResidual=float(resid.sum() / d.sum()),
        stainQ90R=_weighted_quantile(ratio, d, 0.90),
        overLiftQ90=over_q90,
        overLiftMean=over_mean,
        abResidualQ90=ab_q90,
    )


def structure_preservation(orig_bgr: np.ndarray, result_bgr: np.ndarray,
                           band: np.ndarray, face_width: float,
                           sigma_ratios: tuple[float, ...] = (0.03, 0.08),
                           ) -> float | None:
    """Cosine similarity of smoothed gradient fields inside an anatomy band.

    Guards the mentolabial fold / jaw ridge: erasing the fold zeroes the
    result's gradients there, so similarity drops toward 0; a pure brightness
    shift leaves gradients intact (~1). Returns the worst scale, None if the
    band is too small to judge.
    """
    if band.sum() < 64:
        return None
    g0 = cv2.cvtColor(orig_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    g1 = cv2.cvtColor(result_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    worst = 1.0
    for ratio in sigma_ratios:
        s = max(1.5, ratio * face_width)
        a, b = cv2.GaussianBlur(g0, (0, 0), s), cv2.GaussianBlur(g1, (0, 0), s)
        ax, ay = cv2.Sobel(a, cv2.CV_32F, 1, 0), cv2.Sobel(a, cv2.CV_32F, 0, 1)
        bx, by = cv2.Sobel(b, cv2.CV_32F, 1, 0), cv2.Sobel(b, cv2.CV_32F, 0, 1)
        num = float((ax[band] * bx[band] + ay[band] * by[band]).sum())
        den = float(np.sqrt((ax[band] ** 2 + ay[band] ** 2).sum()
                            * (bx[band] ** 2 + by[band] ** 2).sum()))
        worst = min(worst, num / max(den, 1e-6))
    return worst
