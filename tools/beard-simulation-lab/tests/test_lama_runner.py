"""Determinism harness for the big-lama runner — the amended contract's teeth.

Same input bytes must give same output bytes, per environment. Coverage per
Codex #8: (a) three consecutive runs in one process, (b) A/B/A shape
alternation (catches TorchScript shape re-specialization), (c) fresh
subprocess vs in-process, (d) multiple sizes including the production 512
ceiling, (e) different mask topologies, (f) the PNG-encoded bytes, not just
the raw array. Skipped wholesale when the weights are not fetched, so the
suite stays green on machines without the 205MB download.
"""
from __future__ import annotations

import hashlib
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from spike import lama_runner  # noqa: E402

pytestmark = pytest.mark.skipif(
    not lama_runner.weights_available(),
    reason="big-lama weights not fetched (scripts/fetch_lama.py)",
)


def _fixture_pair(size: int = 160, topology: str = "blob") -> tuple[np.ndarray, np.ndarray]:
    """Deterministic synthetic skin-ish image + mask (no file deps)."""
    rng = np.random.RandomState(20260711)
    base = np.full((size, size, 3), (150, 170, 205), np.float32)  # BGR skin-ish
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    base[..., :] += (yy / size * 30 - 15)[..., None]  # vertical shading
    base += rng.normal(0, 6, base.shape).astype(np.float32)  # grain
    img = np.clip(base, 0, 255).astype(np.uint8)
    mask = np.zeros((size, size), np.uint8)
    if topology == "blob":
        mask[size // 3 : 2 * size // 3, size // 4 : 3 * size // 4] = 255
    elif topology == "two_blobs":
        mask[size // 8 : size // 4, size // 8 : size // 3] = 255
        mask[5 * size // 8 : 7 * size // 8, size // 2 : 7 * size // 8] = 255
    elif topology == "ring":
        cy = cx = size // 2
        dist = np.hypot(yy - cy, xx - cx)
        mask[(dist > size // 6) & (dist < size // 4)] = 255
    return img, mask


def test_three_consecutive_runs_byte_identical():
    img, mask = _fixture_pair()
    outs = [lama_runner.inpaint(img, mask) for _ in range(3)]
    assert np.array_equal(outs[0], outs[1])
    assert np.array_equal(outs[1], outs[2])


def test_aba_shape_alternation_byte_identical():
    """Interleave a different input shape — output for A must not drift."""
    img_a, mask_a = _fixture_pair(160)
    img_b, mask_b = _fixture_pair(224)
    first = lama_runner.inpaint(img_a, mask_a)
    lama_runner.inpaint(img_b, mask_b)
    again = lama_runner.inpaint(img_a, mask_a)
    assert np.array_equal(first, again)


@pytest.mark.parametrize("size", [160, 264, 512])
def test_sizes_deterministic(size):
    img, mask = _fixture_pair(size)
    a = lama_runner.inpaint(img, mask)
    b = lama_runner.inpaint(img, mask)
    assert np.array_equal(a, b)


@pytest.mark.parametrize("topology", ["two_blobs", "ring"])
def test_mask_topologies_deterministic(topology):
    img, mask = _fixture_pair(160, topology)
    a = lama_runner.inpaint(img, mask)
    b = lama_runner.inpaint(img, mask)
    assert np.array_equal(a, b)
    outside = mask == 0
    assert np.array_equal(a[outside], img[outside])


def test_png_encoded_bytes_identical():
    img, mask = _fixture_pair()
    enc = []
    for _ in range(2):
        out = lama_runner.inpaint(img, mask)
        ok, buf = cv2.imencode(".png", out)
        assert ok
        enc.append(hashlib.sha256(buf.tobytes()).hexdigest())
    assert enc[0] == enc[1]


def test_fresh_subprocess_byte_identical():
    img, mask = _fixture_pair()
    here = hashlib.sha256(lama_runner.inpaint(img, mask).tobytes()).hexdigest()
    code = (
        "import sys, hashlib; sys.path.insert(0, sys.argv[1])\n"
        "from spike import lama_runner\n"  # first torch touch: pins env/threads
        "from tests.test_lama_runner import _fixture_pair\n"
        "img, mask = _fixture_pair()\n"
        "print(hashlib.sha256(lama_runner.inpaint(img, mask).tobytes()).hexdigest())\n"
    )
    lab = str(Path(__file__).resolve().parents[1])
    proc = subprocess.run(
        [sys.executable, "-c", code, lab], capture_output=True, text=True, timeout=300, cwd=lab
    )
    assert proc.returncode == 0, proc.stderr[-2000:]
    assert proc.stdout.strip().splitlines()[-1] == here


def test_outside_mask_bytes_untouched():
    img, mask = _fixture_pair()
    out = lama_runner.inpaint(img, mask)
    outside = mask == 0
    assert np.array_equal(out[outside], img[outside])


def test_empty_mask_short_circuits():
    img, _ = _fixture_pair()
    out = lama_runner.inpaint(img, np.zeros(img.shape[:2], np.uint8))
    assert np.array_equal(out, img)


def test_non_mod8_dims_rejected_without_optin():
    img, mask = _fixture_pair(157)  # not divisible by 8
    with pytest.raises(ValueError, match="mod-8"):
        lama_runner.inpaint(img, mask)
    out = lama_runner.inpaint(img, mask, allow_reflect_pad=True)
    assert out.shape == img.shape
    outside = mask == 0
    assert np.array_equal(out[outside], img[outside])


def test_fill_actually_changes_and_is_plausible():
    img, mask = _fixture_pair()
    out = lama_runner.inpaint(img, mask)
    inside = mask > 0
    assert not np.array_equal(out[inside], img[inside])
    diff = np.abs(out[inside].astype(np.int16) - img[inside].astype(np.int16)).mean()
    assert diff < 60, f"fill wildly off the surrounding skin (mean |diff| {diff:.1f})"


def test_concurrent_identical_calls_byte_identical():
    """Deterministic flag is process-global; the forward lock must make
    concurrent same-input calls agree (Codex #9)."""
    from concurrent.futures import ThreadPoolExecutor

    img, mask = _fixture_pair()
    ref = lama_runner.inpaint(img, mask)
    with ThreadPoolExecutor(max_workers=4) as ex:
        outs = list(ex.map(lambda _: lama_runner.inpaint(img, mask), range(4)))
    for out in outs:
        assert np.array_equal(out, ref)


def test_foreign_omp_env_refused():
    """Importing the runner under a mismatched OMP/MKL pin must hard-fail —
    a silently accepted foreign thread count breaks byte reproducibility."""
    code = "import sys; sys.path.insert(0, sys.argv[1]); from spike import lama_runner"
    lab = str(Path(__file__).resolve().parents[1])
    import os

    env = dict(os.environ, OMP_NUM_THREADS="8")
    proc = subprocess.run([sys.executable, "-c", code, lab],
                          capture_output=True, text=True, timeout=120, env=env)
    assert proc.returncode != 0
    assert "determinism contract violation" in proc.stderr


def test_manifest_pin_is_mandatory():
    """get_model must have verified the pin (it loaded in earlier tests)."""
    assert lama_runner._WEIGHTS_SHA is not None
    meta = lama_runner.run_metadata()
    assert meta["weights_sha256"] == lama_runner._WEIGHTS_SHA
    assert meta["threads"] == lama_runner.LAMA_THREADS
