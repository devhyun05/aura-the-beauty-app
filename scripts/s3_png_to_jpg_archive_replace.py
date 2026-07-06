#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import mimetypes
import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import boto3
from botocore.config import Config


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV_PATH = REPO_ROOT / "services" / "backend" / ".env"
DEFAULT_ARCHIVE_ROOT = Path.home() / "Downloads"
SKIP_KEY_MARKERS = (
  "/mask",
  "mask/",
  "_mask",
  "-mask",
  "/icon",
  "icon/",
  "appicon",
  "app-icon",
  "/logo",
  "logo/",
  "watermark",
  "smoothregion",
  "regionmask",
)


@dataclass(frozen=True)
class PngObject:
  key: str
  size: int
  etag: str
  last_modified: str


@dataclass(frozen=True)
class ImageInfo:
  width: int
  height: int
  has_alpha: bool


def parse_env(path: Path) -> dict[str, str]:
  values: dict[str, str] = {}

  if not path.exists():
    return values

  for line in path.read_text(errors="ignore").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
      continue

    key, value = line.split("=", 1)
    values[key.strip()] = value.strip().strip('"').strip("'")

  return values


def s3_client(env: dict[str, str]):
  region = env.get("AWS_REGION") or env.get("AWS_DEFAULT_REGION") or "ap-northeast-2"
  kwargs = {
    "config": Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
    "region_name": region,
  }

  if env.get("AWS_ACCESS_KEY_ID") and env.get("AWS_SECRET_ACCESS_KEY"):
    kwargs.update(
      {
        "aws_access_key_id": env["AWS_ACCESS_KEY_ID"],
        "aws_secret_access_key": env["AWS_SECRET_ACCESS_KEY"],
      },
    )

  return boto3.client("s3", **kwargs)


def iter_png_objects(client, bucket: str, prefix: str | None) -> Iterable[PngObject]:
  paginator = client.get_paginator("list_objects_v2")
  paginate_kwargs = {"Bucket": bucket}

  if prefix:
    paginate_kwargs["Prefix"] = prefix

  for page in paginator.paginate(**paginate_kwargs):
    for obj in page.get("Contents", []):
      key = obj["Key"]

      if key.lower().endswith(".png"):
        yield PngObject(
          key=key,
          size=int(obj.get("Size", 0)),
          etag=str(obj.get("ETag", "")).strip('"'),
          last_modified=obj.get("LastModified", "").isoformat()
          if obj.get("LastModified")
          else "",
        )


def safe_relative_path(key: str) -> Path:
  parts = [part for part in key.split("/") if part and part not in {".", ".."}]
  return Path(*parts)


def run_sips_info(path: Path) -> ImageInfo:
  result = subprocess.run(
    [
      "sips",
      "-g",
      "pixelWidth",
      "-g",
      "pixelHeight",
      "-g",
      "hasAlpha",
      str(path),
    ],
    check=True,
    capture_output=True,
    text=True,
  )
  width = 0
  height = 0
  has_alpha = False

  for line in result.stdout.splitlines():
    stripped = line.strip()

    if stripped.startswith("pixelWidth:"):
      width = int(stripped.split(":", 1)[1].strip())
    elif stripped.startswith("pixelHeight:"):
      height = int(stripped.split(":", 1)[1].strip())
    elif stripped.startswith("hasAlpha:"):
      has_alpha = stripped.split(":", 1)[1].strip().lower() == "yes"

  if width <= 0 or height <= 0:
    raise ValueError(f"Could not read image dimensions for {path}")

  return ImageInfo(width=width, height=height, has_alpha=has_alpha)


def png_alpha_is_fully_opaque(path: Path) -> bool:
  """True when every pixel's alpha is 255 (the alpha channel carries no
  transparency and can be flattened to JPEG with no visual change)."""
  try:
    from PIL import Image
  except ImportError as exc:  # pragma: no cover - depends on local env
    raise RuntimeError(
      "--flatten-opaque-alpha requires Pillow. Install it with 'pip install Pillow'.",
    ) from exc

  with Image.open(path) as image:
    if image.mode not in {"RGBA", "LA", "PA"}:
      return True

    alpha = image.convert("RGBA").getchannel("A")
    low, _high = alpha.getextrema()
    return low == 255


def should_skip_key(key: str) -> str | None:
  normalized = key.lower()

  for marker in SKIP_KEY_MARKERS:
    if marker in normalized:
      return f"key_marker:{marker}"

  return None


def convert_to_jpeg(source: Path, target: Path, max_edge: int, quality: int) -> None:
  target.parent.mkdir(parents=True, exist_ok=True)
  args = ["sips", "-s", "format", "jpeg", "-s", "formatOptions", str(quality)]
  info = run_sips_info(source)

  if max(info.width, info.height) > max_edge:
    args.extend(["--resampleHeightWidthMax", str(max_edge)])

  args.extend([str(source), "--out", str(target)])
  subprocess.run(args, check=True, capture_output=True, text=True)


def write_json(path: Path, value: object) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def object_metadata(client, bucket: str, key: str) -> dict[str, str]:
  head = client.head_object(Bucket=bucket, Key=key)
  metadata = {
    "CacheControl": head.get("CacheControl", ""),
    "ContentDisposition": head.get("ContentDisposition", ""),
    "ContentEncoding": head.get("ContentEncoding", ""),
    "ContentLanguage": head.get("ContentLanguage", ""),
    "ContentType": head.get("ContentType", ""),
  }
  return {key: value for key, value in metadata.items() if value}


def upload_jpeg(client, bucket: str, key: str, path: Path, metadata: dict[str, str]) -> None:
  extra_args = {
    "ContentType": "image/jpeg",
  }

  if metadata.get("CacheControl"):
    extra_args["CacheControl"] = metadata["CacheControl"]
  else:
    extra_args["CacheControl"] = "public, max-age=31536000, immutable"

  for passthrough_key in ("ContentDisposition", "ContentEncoding", "ContentLanguage"):
    if metadata.get(passthrough_key):
      extra_args[passthrough_key] = metadata[passthrough_key]

  client.upload_file(str(path), bucket, key, ExtraArgs=extra_args)


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Archive S3 PNG files, convert photo-like PNGs to JPEG, and replace S3 object bytes while preserving keys.",
  )
  parser.add_argument("--env", type=Path, default=DEFAULT_ENV_PATH)
  parser.add_argument("--bucket")
  parser.add_argument("--prefix", default="")
  parser.add_argument("--archive-root", type=Path, default=DEFAULT_ARCHIVE_ROOT)
  parser.add_argument("--max-edge", type=int, default=1600)
  parser.add_argument("--quality", type=int, default=85)
  parser.add_argument("--limit", type=int, default=0)
  parser.add_argument("--execute", action="store_true")
  parser.add_argument("--include-alpha", action="store_true")
  parser.add_argument(
    "--flatten-opaque-alpha",
    action="store_true",
    help="Convert PNGs whose alpha channel is fully opaque (alpha == 255 everywhere); "
    "these carry no transparency and flatten to JPEG losslessly.",
  )
  parser.add_argument("--include-skipped-key-markers", action="store_true")
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  env = parse_env(args.env)
  bucket = args.bucket or env.get("S3_BUCKET_NAME")

  if not bucket:
    print("S3 bucket is required. Set S3_BUCKET_NAME or pass --bucket.", file=sys.stderr)
    return 2

  if not 1 <= args.quality <= 100:
    print("--quality must be 1..100", file=sys.stderr)
    return 2

  if args.max_edge < 256:
    print("--max-edge must be at least 256", file=sys.stderr)
    return 2

  timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
  archive_dir = args.archive_root / f"aura-s3-png-archive-{timestamp}"
  originals_dir = archive_dir / "original-png"
  converted_dir = archive_dir / "converted-jpg"
  manifest_path = archive_dir / "manifest.csv"
  summary_path = archive_dir / "summary.json"

  client = s3_client(env)
  objects = list(iter_png_objects(client, bucket, args.prefix or None))

  if args.limit:
    objects = objects[: args.limit]

  archive_dir.mkdir(parents=True, exist_ok=True)
  rows: list[dict[str, object]] = []
  summary = {
    "bucket": bucket,
    "prefix": args.prefix,
    "archive_dir": str(archive_dir),
    "execute": args.execute,
    "max_edge": args.max_edge,
    "quality": args.quality,
    "png_count": len(objects),
    "converted_count": 0,
    "skipped_count": 0,
    "uploaded_count": 0,
    "original_total_bytes": 0,
    "converted_total_bytes": 0,
  }

  print(f"bucket={bucket}")
  print(f"prefix={args.prefix or '(all)'}")
  print(f"archive_dir={archive_dir}")
  print(f"png_count={len(objects)}")
  print(f"mode={'execute' if args.execute else 'dry-run'}")

  for index, obj in enumerate(objects, 1):
    rel = safe_relative_path(obj.key)
    original_path = originals_dir / rel
    jpg_rel = rel.with_suffix(".jpg")
    converted_path = converted_dir / jpg_rel
    row: dict[str, object] = {
      "index": index,
      "key": obj.key,
      "etag": obj.etag,
      "last_modified": obj.last_modified,
      "original_bytes": obj.size,
      "width": "",
      "height": "",
      "has_alpha": "",
      "converted_bytes": "",
      "action": "",
      "reason": "",
    }
    summary["original_total_bytes"] += obj.size

    original_path.parent.mkdir(parents=True, exist_ok=True)
    client.download_file(bucket, obj.key, str(original_path))
    metadata = object_metadata(client, bucket, obj.key)
    write_json(original_path.with_suffix(original_path.suffix + ".metadata.json"), metadata)
    skip_reason = should_skip_key(obj.key)

    try:
      info = run_sips_info(original_path)
    except Exception as exc:
      row["action"] = "skipped"
      row["reason"] = f"read_failed:{exc}"
      summary["skipped_count"] += 1
      rows.append(row)
      print(f"[{index}/{len(objects)}] skip read failed: {obj.key}")
      continue

    row["width"] = info.width
    row["height"] = info.height
    row["has_alpha"] = info.has_alpha

    if skip_reason and not args.include_skipped_key_markers:
      row["action"] = "skipped"
      row["reason"] = skip_reason
      summary["skipped_count"] += 1
      rows.append(row)
      print(f"[{index}/{len(objects)}] skip key marker: {obj.key}")
      continue

    if info.has_alpha and not args.include_alpha:
      opaque_alpha = args.flatten_opaque_alpha and png_alpha_is_fully_opaque(original_path)

      if not opaque_alpha:
        row["action"] = "skipped"
        row["reason"] = "has_alpha"
        summary["skipped_count"] += 1
        rows.append(row)
        print(f"[{index}/{len(objects)}] skip alpha: {obj.key}")
        continue

      row["reason"] = "opaque_alpha_flattened"

    try:
      convert_to_jpeg(original_path, converted_path, args.max_edge, args.quality)
    except Exception as exc:
      row["action"] = "skipped"
      row["reason"] = f"convert_failed:{exc}"
      summary["skipped_count"] += 1
      rows.append(row)
      print(f"[{index}/{len(objects)}] skip convert failed: {obj.key}")
      continue

    converted_size = converted_path.stat().st_size
    row["converted_bytes"] = converted_size

    if converted_size >= obj.size:
      row["action"] = "skipped"
      row["reason"] = "no_size_savings"
      summary["skipped_count"] += 1
      rows.append(row)
      print(
        f"[{index}/{len(objects)}] skip no size savings: {obj.key} "
        f"{obj.size} -> {converted_size}",
      )
      continue

    summary["converted_count"] += 1
    summary["converted_total_bytes"] += converted_size

    if args.execute:
      upload_jpeg(client, bucket, obj.key, converted_path, metadata)
      row["action"] = "uploaded"
      summary["uploaded_count"] += 1
      print(
        f"[{index}/{len(objects)}] uploaded jpeg bytes: {obj.key} "
        f"{obj.size} -> {converted_size}",
      )
    else:
      row["action"] = "converted_dry_run"
      print(
        f"[{index}/{len(objects)}] converted dry-run: {obj.key} "
        f"{obj.size} -> {converted_size}",
      )

    rows.append(row)

  with manifest_path.open("w", newline="") as manifest_file:
    writer = csv.DictWriter(
      manifest_file,
      fieldnames=[
        "index",
        "key",
        "etag",
        "last_modified",
        "original_bytes",
        "width",
        "height",
        "has_alpha",
        "converted_bytes",
        "action",
        "reason",
      ],
    )
    writer.writeheader()
    writer.writerows(rows)

  write_json(summary_path, summary)
  print(f"manifest={manifest_path}")
  print(f"summary={summary_path}")
  print(json.dumps(summary, ensure_ascii=False, indent=2))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
