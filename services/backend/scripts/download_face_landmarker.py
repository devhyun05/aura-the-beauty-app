from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import ssl
import tempfile
from urllib.request import urlopen

import certifi


MODEL_URL = (
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
  "face_landmarker/float16/1/face_landmarker.task"
)
MODEL_SHA256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"


def download_model(output: Path) -> None:
  output.parent.mkdir(parents=True, exist_ok=True)
  context = ssl.create_default_context(cafile=certifi.where())
  with urlopen(MODEL_URL, timeout=60, context=context) as response:  # noqa: S310 - fixed HTTPS source.
    payload = response.read()

  digest = hashlib.sha256(payload).hexdigest()
  if digest != MODEL_SHA256:
    raise RuntimeError(f"Face Landmarker checksum mismatch: {digest}")

  with tempfile.NamedTemporaryFile(dir=output.parent, delete=False) as temporary:
    temporary.write(payload)
    temporary_path = Path(temporary.name)
  temporary_path.replace(output)
  output.chmod(0o644)


if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("--output", type=Path, required=True)
  args = parser.parse_args()
  download_model(args.output)
