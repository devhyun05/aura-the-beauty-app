"""Deterministic CPU runner for the traced big-lama TorchScript inpainter.

Contract (spike v3, user-amended 2026-07-11): generative nets are allowed IF
inference is deterministic — same input bytes -> same output bytes, per
environment (torch/python/numpy versions, thread count, weights SHA recorded).
Diffusion remains banned; this is a single-pass Fourier-convolution net with
no sampling.

Determinism mechanism (Codex #8 hardened), in order of importance:
1. Pinned intra-op thread count. oneDNN GEMM reductions split differently at
   different thread counts — the pin IS the mechanism. OMP/MKL env vars are
   pinned too (MKL takes precedence over OMP); they only bite if this module
   is imported before torch's first parallel op, so service bootstraps must
   import spike.lama_runner FIRST.
2. TorchScript profiling executor disabled BEFORE load (it re-specializes the
   graph after warmup, so run 1 vs run 3 can differ), and jit.freeze with
   optimize_numerics=False (the default True allows numerics-changing fusion).
3. torch.use_deterministic_algorithms(True) enforced around the forward
   (set-and-restore, so unrelated torch users in the same process keep their
   own setting).
4. CPU only. MPS is banned (no determinism guarantees; service target is a
   server CPU anyway).

Verified by tests/test_lama_runner.py: 3 consecutive runs, A/B/A shape
alternation, fresh subprocess, multiple sizes/mask topologies, and the PNG
encode of the result must all be byte-identical.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("MKL_NUM_THREADS", "4")

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import torch  # noqa: E402

LAB = Path(__file__).resolve().parents[1]
WEIGHTS = LAB / "external" / "models" / "big-lama" / "big-lama.pt"
MANIFEST = LAB / "spike" / "lama_manifest.json"

LAMA_THREADS = 4

torch._C._jit_set_profiling_executor(False)
torch._C._jit_set_profiling_mode(False)
torch.set_num_threads(LAMA_THREADS)
try:
    torch.set_num_interop_threads(1)
except RuntimeError:
    # Too late to set (parallel work already started elsewhere in the process).
    # Only tolerable if the effective value is already what the contract pins.
    if torch.get_num_interop_threads() != 1:
        raise RuntimeError(
            "determinism contract violation: interop threads "
            f"{torch.get_num_interop_threads()} != 1 and can no longer be set — "
            "import spike.lama_runner before any other torch work"
        )

_MODEL = None
_WEIGHTS_SHA: str | None = None


def _sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def weights_available() -> bool:
    return WEIGHTS.exists()


def get_model() -> torch.jit.ScriptModule:
    """Load (once) the traced big-lama. Manifest pin is mandatory: no manifest,
    no sha256 field, or a hash mismatch are all hard failures."""
    global _MODEL, _WEIGHTS_SHA
    if _MODEL is not None:
        return _MODEL
    if not WEIGHTS.exists():
        raise FileNotFoundError(f"{WEIGHTS} missing — run scripts/fetch_lama.py")
    if not MANIFEST.exists():
        raise RuntimeError(f"{MANIFEST} missing — weights may not be loaded unpinned")
    pinned = json.loads(MANIFEST.read_text()).get("sha256")
    if not pinned:
        raise RuntimeError(f"{MANIFEST} has no sha256 pin — refusing to load")
    digest = _sha256_of(WEIGHTS)
    if digest != pinned:
        raise RuntimeError(f"weights sha256 {digest} != manifest pin {pinned}")
    _WEIGHTS_SHA = digest
    model = torch.jit.load(str(WEIGHTS), map_location="cpu")
    model.eval()
    model = torch.jit.freeze(model, optimize_numerics=False)
    _MODEL = model
    return _MODEL


def run_metadata() -> dict:
    import platform

    return {
        "torch": torch.__version__,
        "numpy": np.__version__,
        "opencv": cv2.__version__,
        "python": platform.python_version(),
        "platform": platform.platform(),
        "machine": platform.machine(),
        "threads": torch.get_num_threads(),
        "interop_threads": torch.get_num_interop_threads(),
        "weights_sha256": _WEIGHTS_SHA,
        "device": "cpu",
    }


def inpaint(bgr: np.ndarray, mask: np.ndarray, *, allow_reflect_pad: bool = False) -> np.ndarray:
    """Inpaint mask>0 pixels of a BGR uint8 image. Returns BGR uint8, same shape.

    Dims must be mod-8: callers align crops to mod-8 using REAL pixels from the
    surrounding frame (never synthetic padding — a replicated neck shadow at
    the crop edge smears darkness into the fill). allow_reflect_pad=True is an
    escape hatch for synthetic tests only.
    """
    assert bgr.dtype == np.uint8 and bgr.ndim == 3, "bgr uint8 HxWx3 expected"
    h, w = bgr.shape[:2]
    mask_bin = (np.asarray(mask) > 0).astype(np.float32)
    assert mask_bin.shape == (h, w), "mask must match image HxW"
    if not mask_bin.any():
        return bgr.copy()

    pad_b = (8 - h % 8) % 8
    pad_r = (8 - w % 8) % 8
    img = bgr
    if pad_b or pad_r:
        if not allow_reflect_pad:
            raise ValueError(
                f"dims {h}x{w} not mod-8 — align the crop with real frame pixels, "
                "or pass allow_reflect_pad=True (synthetic tests only)"
            )
        img = cv2.copyMakeBorder(img, 0, pad_b, 0, pad_r, cv2.BORDER_REFLECT101)
        mask_bin = cv2.copyMakeBorder(mask_bin, 0, pad_b, 0, pad_r, cv2.BORDER_CONSTANT, value=0.0)

    torch.set_num_threads(LAMA_THREADS)  # idempotent; guards against env leakage
    assert torch.get_num_threads() == LAMA_THREADS

    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    t_img = torch.from_numpy(rgb.transpose(2, 0, 1))[None]
    t_mask = torch.from_numpy(mask_bin)[None, None]

    model = get_model()
    was_det = torch.are_deterministic_algorithms_enabled()
    torch.use_deterministic_algorithms(True)
    try:
        with torch.inference_mode():
            out = model(t_img, t_mask)
    finally:
        torch.use_deterministic_algorithms(was_det)

    res = out[0].permute(1, 2, 0).numpy()
    res = np.clip(np.rint(res * 255.0), 0, 255).astype(np.uint8)
    res = cv2.cvtColor(res, cv2.COLOR_RGB2BGR)[:h, :w]

    # Explicit composite: outside-mask bytes are the original by construction,
    # independent of whether the traced model composites internally.
    final = bgr.copy()
    inside = mask_bin[:h, :w] > 0
    final[inside] = res[inside]
    return final
