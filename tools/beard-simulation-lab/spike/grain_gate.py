"""Stage 3 core: the grain gate -- codifying the "알갱이 테스트".

Zoom (Stage 2) recovers real beard but also sprays smooth skin; the two are
separated by grain. Beard -- strands and stubble dots -- carries high-frequency
micro-texture; clean skin and geometric shade are smooth. So gate any zone
response by local grain, measured RELATIVE TO THIS PERSON'S OWN CLEAN SKIN
(forehead + upper cheeks), the same self-referential trick C1's shadow channel
uses for colour. Nothing here is tuned on the eval set: the threshold is
g0_median + 3*MAD of the clean-skin grain, fully determined per image.
"""

from __future__ import annotations

import cv2
import numpy as np

from engine.detect_face import BROW_MID, FOREHEAD_MID, UPPER_CHEEKS


def grain_map(bgr: np.ndarray, sigma: float = 2.0, win: int = 7) -> np.ndarray:
    """Local RMS of the high-frequency luminance -- a texture-energy map."""
    lum = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    hp = lum - cv2.GaussianBlur(lum, (0, 0), sigma)
    energy = cv2.boxFilter(hp * hp, -1, (win, win))
    return np.sqrt(np.maximum(energy, 0.0))


def _disk(mask: np.ndarray, center: np.ndarray, r: int) -> None:
    cv2.circle(mask, (int(center[0]), int(center[1])), r, 1.0, -1)


def clean_skin_grain(bgr: np.ndarray, grain: np.ndarray, landmarks: np.ndarray,
                     face_width: float) -> tuple[float, float]:
    """(median, MAD) of grain over the forehead/upper-cheek clean-skin sample."""
    h, w = bgr.shape[:2]
    mask = np.zeros((h, w), np.float32)
    patch_r = max(4, int(0.05 * face_width))
    forehead = (landmarks[FOREHEAD_MID] + landmarks[BROW_MID]) / 2
    _disk(mask, forehead, patch_r)
    for idx in UPPER_CHEEKS:
        _disk(mask, landmarks[idx], int(patch_r * 0.8))
    vals = grain[mask > 0.5]
    if vals.size == 0:
        return 0.0, 0.0
    med = float(np.median(vals))
    mad = float(np.median(np.abs(vals - med)))
    return med, mad


def grain_gate(bgr: np.ndarray, landmarks: np.ndarray, face_width: float,
               n_mad: float = 3.0) -> np.ndarray:
    """Boolean map: local grain exceeds clean skin by n_mad robust sigmas.

    Returns full-image-sized bool. Floors the margin so a near-flat clean-skin
    sample (tiny MAD) can't make the gate fire on everything.
    """
    grain = grain_map(bgr)
    med, mad = clean_skin_grain(bgr, grain, landmarks, face_width)
    thresh = med + n_mad * max(mad, 0.15 * med)  # MAD floor: never trivially open
    return grain > thresh


def hysteresis(heat: np.ndarray, keep: np.ndarray,
               t_low: float, high_frac: float = 0.55) -> np.ndarray:
    """Keep only low-threshold blobs that contain a high-confidence seed.

    Spray is diffuse low-confidence response that never reaches the seed level;
    real beard has confident cores. Grow the filled zone from t_low but drop any
    blob without a seed -- a principled zone filter needing no external signal
    (unlike grain, which tracked resolution, not hair).

    The seed is RELATIVE to each image's own peak (high_frac * max within keep),
    not an absolute confidence: CLIPSeg is not calibrated across images (peak
    raw sigmoid ranges 0.17-0.90 here), so an absolute seed rejects whole
    low-confidence images. A relative seed just asks "the most confident beard
    cores in THIS image", which is scale-free.
    """
    inside = heat[keep]
    if inside.size == 0:
        return np.zeros(heat.shape, dtype=bool)
    t_high = float(inside.max()) * high_frac
    low = ((heat > t_low) & keep).astype(np.uint8)
    seed = (heat > t_high) & keep
    n, labels = cv2.connectedComponents(low, connectivity=8)
    out = np.zeros(heat.shape, dtype=bool)
    for lab in range(1, n):
        blob = labels == lab
        if (blob & seed).any():
            out |= blob
    return out


def zone_grain_filter(zone: np.ndarray, gate: np.ndarray,
                      min_grain_frac: float = 0.12) -> np.ndarray:
    """Accept/reject whole connected blobs by grain, keeping survivors FILLED.

    The pixel-level gate is wrong against a filled-REGION target: it punches the
    smooth gaps between hairs into confetti (psd05 IoU 0.724 -> 0.044). A human
    applies the grain test to a *region* -- "does this dark patch have grain?" --
    not to each pixel. So: for each connected blob of the zone, if enough of it
    is grainy it is real beard and we keep the whole filled blob; if it is smooth
    (geometric shade, sprayed cheek) we drop it entirely.
    """
    zone = zone.astype(np.uint8)
    n, labels = cv2.connectedComponents(zone, connectivity=8)
    out = np.zeros_like(zone, dtype=bool)
    for lab in range(1, n):
        blob = labels == lab
        area = int(blob.sum())
        if area == 0:
            continue
        if (blob & gate).sum() / area >= min_grain_frac:
            out |= blob
    return out
