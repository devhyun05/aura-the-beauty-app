"""Provenance manifest 생성기 — supplement 승격 승인 체인용 (런북 §5).

각 입력 파일의 SHA-256을 계산해 {"files": {경로: sha256}} 형식으로 기록한다.
경로 키는 저장소 루트 기준 상대경로로 정규화하고, 저장소 밖 파일은 절대경로로 남긴다.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def main(argv: list[str] | None = None) -> int:
  parser = argparse.ArgumentParser(description="Build a provenance manifest for supplement promotions.")
  parser.add_argument("--files", nargs="+", required=True, type=Path)
  parser.add_argument("--output", required=True, type=Path)
  args = parser.parse_args(argv)
  files: dict[str, str] = {}
  for raw in args.files:
    path = (raw if raw.is_absolute() else REPO_ROOT / raw).resolve()
    try:
      key = path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
      key = str(path)
    files[key] = hashlib.sha256(path.read_bytes()).hexdigest()
  args.output.parent.mkdir(parents=True, exist_ok=True)
  args.output.write_text(
    json.dumps({"files": files}, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
  )
  print(f"[provenance] {len(files)} files -> {args.output}")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
