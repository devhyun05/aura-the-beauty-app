#!/usr/bin/env python3
"""Build the media postprocess Lambda zip from source.

The zip is a deployment artifact, not source code. Commit this script, then let
each deploy environment or CI job recreate the zip before calling AWS Lambda.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BUILD_DIR = REPO_ROOT / ".lambda-build" / "media-postprocess"
DEFAULT_OUTPUT = REPO_ROOT / "dist" / "lambda" / "aura-media-postprocess.zip"
DEFAULT_PILLOW_VERSION = "10.4.0"
DEFAULT_PYTHON_VERSION = "3.11"
DEFAULT_ABI = "cp311"
DEFAULT_PLATFORM = "manylinux2014_x86_64"


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Package the media postprocess Lambda zip.")
  parser.add_argument("--build-dir", type=Path, default=DEFAULT_BUILD_DIR)
  parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
  parser.add_argument("--pillow-version", default=DEFAULT_PILLOW_VERSION)
  parser.add_argument("--python-version", default=DEFAULT_PYTHON_VERSION)
  parser.add_argument("--abi", default=DEFAULT_ABI)
  parser.add_argument("--platform", default=DEFAULT_PLATFORM)
  parser.add_argument("--python", default=sys.executable)
  return parser.parse_args()


def resolve_inside_repo(path: Path) -> Path:
  resolved = path.resolve()

  try:
    resolved.relative_to(REPO_ROOT)
  except ValueError as exc:
    raise SystemExit(f"Refusing to write outside repository: {resolved}") from exc

  return resolved


def clean_build_dir(build_dir: Path) -> None:
  if build_dir.exists():
    shutil.rmtree(build_dir)

  build_dir.mkdir(parents=True)


def install_dependencies(args: argparse.Namespace, package_dir: Path) -> None:
  subprocess.run(
    [
      args.python,
      "-m",
      "pip",
      "install",
      "--upgrade",
      "--target",
      str(package_dir),
      "--platform",
      args.platform,
      "--implementation",
      "cp",
      "--python-version",
      args.python_version,
      "--abi",
      args.abi,
      "--only-binary=:all:",
      f"Pillow=={args.pillow_version}",
    ],
    check=True,
  )


def copy_lambda_sources(package_dir: Path) -> None:
  source_app = REPO_ROOT / "services" / "backend" / "app"
  target_app = package_dir / "app"
  target_lambdas = target_app / "lambdas"

  target_app.mkdir(parents=True, exist_ok=True)
  shutil.copy2(source_app / "__init__.py", target_app / "__init__.py")
  shutil.copytree(source_app / "lambdas", target_lambdas)


def write_zip(package_dir: Path, output: Path) -> None:
  output.parent.mkdir(parents=True, exist_ok=True)

  if output.exists():
    output.unlink()

  with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(package_dir.rglob("*")):
      if path.is_file():
        archive.write(path, path.relative_to(package_dir).as_posix())


def main() -> None:
  args = parse_args()
  build_dir = resolve_inside_repo(args.build_dir)
  output = resolve_inside_repo(args.output)
  package_dir = build_dir / "package"

  clean_build_dir(build_dir)
  package_dir.mkdir(parents=True)
  install_dependencies(args, package_dir)
  copy_lambda_sources(package_dir)
  write_zip(package_dir, output)

  print(output)


if __name__ == "__main__":
  main()