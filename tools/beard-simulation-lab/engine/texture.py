"""Texture measurement: is the corrected skin still skin, or is it wax?

The corrector's failure mode is subtractive. It removes up to 85% of the
high-frequency layer inside the hair mask, and the person's own pores live in
those same pixels, so what is left reads as plastic. Nothing in the pipeline
measured that, so nothing stopped it.

`waxiness_score` is the ruler. It compares the grain energy of the corrected
beard zone against the grain energy of THIS person's clean skin (forehead and
upper cheeks), in the same photo:

    waxiness = median grain in zone / median grain in clean skin

The ratio form matters. An earlier attempt (spike/grain_gate.py) thresholded
absolute grain and failed, because absolute high-frequency energy tracks how
sharply the photo was shot, not what the skin looks like: clean forehead skin on
a 4K selfie is grainier than beard on a soft one. Within one photo that
confound divides out.

The score is two-sided, which is the point:

    >> 1.0   hair is still there (strands are texture)
    ~= 1.0   hair gone, skin texture intact          <- the target
    << 1.0   skin was flattened -- the waxy look

Report-only. It is not a guard (GuardCheckId is a fixed enum), it is what a
human reads next to the before/after image.
"""

from __future__ import annotations

import cv2
import numpy as np

from .detect_face import BROW_MID, FOREHEAD_MID, UPPER_CHEEKS

# Fixed, because the score is a within-image ratio: both sides are measured with
# the same filter, so its scale cancels.
_HP_SIGMA = 2.0
_RMS_WIN = 7

# Below this the reference carries no measurable texture and the ratio is
# meaningless. Not 1e-6: float32 rounding inside GaussianBlur leaves ~1e-5 of
# grain on a perfectly flat image, and since that noise appears in BOTH the zone
# and the reference it divides out to a confident-looking 1.0. Real clean-skin
# grain on our photos measures 0.57-4.06, so 0.05 sits two orders below any true
# signal and three above the rounding floor.
_MIN_REF_GRAIN = 0.05

_LUMA_SIGMA = 8.0   # local mean luminance for the contrast normalization
_MIN_LUMA = 8.0     # never divide by near-black


def grain_map(bgr: np.ndarray, sigma: float = _HP_SIGMA,
              win: int = _RMS_WIN) -> np.ndarray:
    """Local RMS of the high-frequency luminance -- a texture-energy map."""
    lum = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    hp = lum - cv2.GaussianBlur(lum, (0, 0), sigma)
    energy = cv2.boxFilter(hp * hp, -1, (win, win))
    return np.sqrt(np.maximum(energy, 0.0))


def relative_grain_map(bgr: np.ndarray) -> np.ndarray:
    """grain_map divided by the local mean luminance -- texture CONTRAST.

    Absolute grain scales with brightness, and the beard zone is by definition
    darker than the forehead we compare it against. Measured that way the
    original psd05 scores 0.32, as if its stubble were already flattened. Divide
    by the local mean and the confound cancels: the same stubble on a dark jaw
    and a bright cheek reads the same.
    """
    lum = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    base = cv2.GaussianBlur(lum, (0, 0), _LUMA_SIGMA)
    return grain_map(bgr) / np.maximum(base, _MIN_LUMA)


def coherence_map(bgr: np.ndarray) -> np.ndarray:
    """Structure-tensor coherence in [0, 1]: how DIRECTIONAL the local texture is.

        0 -> isotropic (skin grain, sensor noise)
        1 -> one dominant direction (a smear, a strand)

    Waxiness alone cannot tell skin from artifact, because both are
    high-frequency energy: the shadow branch RAISES zone grain on 6 of 9 dev
    photos. This map was added to test whether that rise was directional smear.
    It is not -- isolating the branch moved streak by -0.000 on average (up on
    only 3 of 9). The rise is isotropic, and its source is the uint8 round-trip
    of the low layer before cv2.inpaint: quantization error measures 0.577 RMS
    (exactly 1/sqrt(3), uniform error over one gray level) against a low layer
    whose own high-frequency content is only 0.29-0.35.

    Kept because it earned its place as the control that killed that hypothesis,
    and because re-grain must stay isotropic: a badly synthesized grain field
    would show up here and nowhere else.
    """
    lum = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    hp = lum - cv2.GaussianBlur(lum, (0, 0), _HP_SIGMA)
    gx = cv2.Sobel(hp, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(hp, cv2.CV_32F, 0, 1, ksize=3)
    k = (_RMS_WIN, _RMS_WIN)
    jxx = cv2.boxFilter(gx * gx, -1, k)
    jyy = cv2.boxFilter(gy * gy, -1, k)
    jxy = cv2.boxFilter(gx * gy, -1, k)
    # (λ1 − λ2) / (λ1 + λ2) for the 2x2 structure tensor.
    num = np.sqrt(np.maximum((jxx - jyy) ** 2 + 4.0 * jxy * jxy, 0.0))
    return num / np.maximum(jxx + jyy, 1e-6)


_GRAIN_PATCH = 32
_GRAIN_STRIDE = 16  # half-overlap so the jitter can never open a hole


def build_grain_field(bgr: np.ndarray, sample_mask: np.ndarray,
                      seed: int = 0) -> np.ndarray | None:
    """Unit-RMS, zero-mean grain field tiled from THIS person's own clean skin.

    Quilting: 32px patches of high-passed luminance from `sample_mask`, placed
    on a jittered half-overlap grid under a Hann window, with seeded flips and
    rotations so the tiling never repeats visibly. Everything is seeded --
    the product path must be reproducible, and determinism is under test.
    Returns None when the sample area is too small or carries no texture;
    callers must treat that as "skip re-grain", not as an error.
    """
    h, w = bgr.shape[:2]
    lum = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    hp = lum - cv2.GaussianBlur(lum, (0, 0), _HP_SIGMA)
    ok = sample_mask > 0.5
    ys, xs = np.where(ok)
    P = _GRAIN_PATCH
    if ys.size < P * P:
        return None
    patches = []
    for y in range(int(ys.min()), max(int(ys.max()) - P, int(ys.min())) + 1, P // 2):
        for x in range(int(xs.min()), max(int(xs.max()) - P, int(xs.min())) + 1, P // 2):
            m = ok[y:y + P, x:x + P]
            if m.shape == (P, P) and float(m.mean()) > 0.98:
                p = hp[y:y + P, x:x + P]
                rms = float(np.sqrt(np.mean(p * p)))
                if rms > 1e-3:
                    patches.append(((p - p.mean()) / rms).astype(np.float32))
    if not patches:
        return None

    rng = np.random.default_rng(seed)
    win = (np.hanning(P)[:, None] * np.hanning(P)[None, :]).astype(np.float32)
    acc = np.zeros((h + 2 * P, w + 2 * P), np.float32)
    wsum = np.zeros_like(acc)
    for gy in range(0, h + P, _GRAIN_STRIDE):
        for gx in range(0, w + P, _GRAIN_STRIDE):
            p = patches[int(rng.integers(len(patches)))]
            p = np.rot90(p, int(rng.integers(4)))
            if rng.integers(2):
                p = p[:, ::-1]
            jy = gy + int(rng.integers(-P // 4, P // 4 + 1))
            jx = gx + int(rng.integers(-P // 4, P // 4 + 1))
            jy = min(max(jy, 0), h + P)
            jx = min(max(jx, 0), w + P)
            acc[jy:jy + P, jx:jx + P] += p * win
            wsum[jy:jy + P, jx:jx + P] += win
    field = acc[P:P + h, P:P + w] / np.maximum(wsum[P:P + h, P:P + w], 1e-3)
    field -= field.mean()
    rms = float(np.sqrt(np.mean(field * field)))
    if rms < 1e-6:
        return None
    return (field / rms).astype(np.float32)


def clean_skin_mask(shape: tuple[int, int], landmarks: np.ndarray,
                    face_width: float) -> np.ndarray:
    """Forehead + upper-cheek disks: this person's beard-free reference skin."""
    mask = np.zeros(shape, np.uint8)
    patch_r = max(4, int(0.05 * face_width))
    forehead = (landmarks[FOREHEAD_MID] + landmarks[BROW_MID]) / 2
    cv2.circle(mask, (int(forehead[0]), int(forehead[1])), patch_r, 1, -1)
    for idx in UPPER_CHEEKS:
        p = landmarks[idx]
        cv2.circle(mask, (int(p[0]), int(p[1])), int(patch_r * 0.8), 1, -1)
    return mask.astype(bool)


def clean_skin_grain(grain: np.ndarray, clean: np.ndarray) -> tuple[float, float]:
    """(median, MAD) of grain over the clean-skin sample. (0, 0) if empty."""
    vals = grain[clean]
    if vals.size == 0:
        return 0.0, 0.0
    med = float(np.median(vals))
    return med, float(np.median(np.abs(vals - med)))


def _ratio_to_clean(field: np.ndarray, bgr: np.ndarray, zone: np.ndarray,
                    landmarks: np.ndarray, face_width: float) -> float | None:
    """median(field[zone]) / median(field[clean skin]), or None if undefined.

    None, never 0.0: an undefined ratio is not a perfect score, and averaging a
    silent zero across photos would hide exactly the case we care about. The
    validity floor is checked on ABSOLUTE grain -- a relative field is ~0.004 on
    real skin, so testing it against a grain-scale floor would reject every photo.
    """
    if not zone.any():
        return None
    clean = clean_skin_mask(bgr.shape[:2], landmarks, face_width)
    if not clean.any():
        return None
    if float(np.median(grain_map(bgr)[clean])) < _MIN_REF_GRAIN:
        return None
    ref = float(np.median(field[clean]))
    if ref <= 1e-9:
        return None
    return float(np.median(field[zone]) / ref)


def waxiness_score(bgr: np.ndarray, zone: np.ndarray, landmarks: np.ndarray,
                   face_width: float) -> float | None:
    """Texture contrast in the zone, relative to this person's clean skin."""
    return _ratio_to_clean(relative_grain_map(bgr), bgr, zone, landmarks, face_width)


def streak_score(bgr: np.ndarray, zone: np.ndarray, landmarks: np.ndarray,
                 face_width: float) -> float | None:
    """Directionality of the zone's texture, relative to clean skin.

    ~1.0 means the zone's texture is as isotropic as the person's own skin.
    Above 1.0 means something in there is oriented -- an inpainting streak. Read
    it next to `waxiness_score`, which cannot tell smear from grain on its own.
    """
    return _ratio_to_clean(coherence_map(bgr), bgr, zone, landmarks, face_width)


def chroma_delta_ab(bgr: np.ndarray, zone: np.ndarray, landmarks: np.ndarray,
                    face_width: float) -> float | None:
    """Mean (a,b) distance from the person's clean-skin chroma, in Lab.

    Chroma only. L legitimately differs across the face (the jaw is in shade),
    so pulling L toward the reference would flatten the face's own modelling;
    the beard's visible signature is a bluish-grey CAST, which lives in a and b.
    Lower is more natural. Used to judge the cast-correction step.
    """
    if not zone.any():
        return None
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2Lab).astype(np.float32)
    clean = clean_skin_mask(bgr.shape[:2], landmarks, face_width)
    if not clean.any():
        return None
    ref_ab = lab[clean][:, 1:].mean(axis=0)
    d = lab[zone][:, 1:] - ref_ab
    return float(np.sqrt((d * d).sum(axis=1)).mean())
