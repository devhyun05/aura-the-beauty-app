"""Fetch the traced big-lama TorchScript checkpoint into external/models/big-lama/.

Policy (approved plan, spike v3 Step 1):
- Refuse to download if free disk < 1GB.
- Download via urllib straight to the target path (no HF-hub cache doubling).
- SHA256 is pinned in spike/lama_manifest.json. First fetch records the hash;
  every later fetch (and every load, see spike/lama_runner.py) verifies it.
- Two mirrors documented in the manifest because lama-cleaner release assets
  have gone stale before.

Usage: .venv/bin/python scripts/fetch_lama.py
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
import urllib.request
from pathlib import Path

LAB = Path(__file__).resolve().parents[1]
WEIGHTS = LAB / "external" / "models" / "big-lama" / "big-lama.pt"
MANIFEST = LAB / "spike" / "lama_manifest.json"

MIRRORS = [
    "https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt",
    "https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt",
]
MIN_FREE_BYTES = 1 << 30  # 1GB policy floor
MIN_SIZE_BYTES = 100 << 20  # sanity: a real checkpoint is ~200MB, not an error page


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_manifest() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text())
    return {}


def main() -> int:
    free = shutil.disk_usage(LAB).free
    if free < MIN_FREE_BYTES:
        print(f"REFUSED: free disk {free / 1e9:.2f}GB < 1GB policy floor", file=sys.stderr)
        return 2

    manifest = load_manifest()
    pinned = manifest.get("sha256")

    if WEIGHTS.exists():
        digest = sha256_of(WEIGHTS)
        if pinned and digest != pinned:
            print(f"CORRUPT: existing weights sha256 {digest} != pinned {pinned}", file=sys.stderr)
            return 3
        print(f"ok: weights present, sha256 {digest}")
        return 0

    WEIGHTS.parent.mkdir(parents=True, exist_ok=True)
    tmp = WEIGHTS.with_suffix(".pt.partial")
    last_err: Exception | None = None
    for url in MIRRORS:
        try:
            print(f"downloading {url}")
            with urllib.request.urlopen(url, timeout=60) as resp, open(tmp, "wb") as out:
                shutil.copyfileobj(resp, out, length=1 << 20)
            if tmp.stat().st_size < MIN_SIZE_BYTES:
                raise IOError(f"downloaded only {tmp.stat().st_size} bytes — not a checkpoint")
            digest = sha256_of(tmp)
            if pinned and digest != pinned:
                raise IOError(f"sha256 {digest} != pinned {pinned} (mirror tampered/changed?)")
            os.replace(tmp, WEIGHTS)
            if not pinned:
                manifest.update(
                    {
                        "artifact": "big-lama traced TorchScript (LaMa, Fourier-convolution inpainter)",
                        "source_url": url,
                        "mirrors": MIRRORS,
                        "sha256": digest,
                        "size_bytes": WEIGHTS.stat().st_size,
                        "pinned_on_first_fetch": "2026-07-11",
                        "license": {
                            "code_and_weights": "Apache-2.0 (advimman/lama, Samsung AI Center)",
                            "training_data": "Places2 — research-leaning terms; PRE-COMMERCIALIZATION LEGAL REVIEW REQUIRED",
                        },
                        "notes": "Weights live in external/ (gitignored, never committed). Loader re-verifies sha256 on every load.",
                    }
                )
                MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
                print(f"pinned sha256 {digest} in {MANIFEST}")
            print(f"ok: fetched {WEIGHTS} ({WEIGHTS.stat().st_size / 1e6:.1f}MB)")
            return 0
        except Exception as e:  # try next mirror
            last_err = e
            print(f"mirror failed: {e}", file=sys.stderr)
            tmp.unlink(missing_ok=True)
    print(f"FAILED: all mirrors exhausted ({last_err})", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
