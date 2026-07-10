from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

from app.core.settings import get_settings
from app.services.hair_catalog import HAIR_STYLE_BY_ID
from app.services.s3 import S3Service


def approve_styles(manifest_path: Path, style_ids: list[str], reviewer: str) -> dict:
  manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
  unknown = sorted(set(style_ids) - set(HAIR_STYLE_BY_ID))
  if unknown:
    raise ValueError(f"Unknown style ids: {', '.join(unknown)}")

  reviewed_at = datetime.now(timezone.utc).isoformat()
  entries_by_id = {entry.get("styleId"): entry for entry in manifest.get("styles", [])}
  for style_id in style_ids:
    entry = entries_by_id.get(style_id)
    if not entry:
      raise ValueError(f"Style is missing from manifest: {style_id}")
    for key, hash_key in (
      ("referenceFile", "referenceSha256"),
      ("previewFile", "previewSha256"),
    ):
      asset_path = manifest_path.parent / str(entry.get(key) or "")
      if not asset_path.is_file():
        raise FileNotFoundError(asset_path)
      expected_hash = str(entry.get(hash_key) or "")
      if not expected_hash or hashlib.sha256(asset_path.read_bytes()).hexdigest() != expected_hash:
        raise ValueError(f"Asset checksum does not match manifest: {asset_path.name}")
    entry["reviewStatus"] = "approved"
    entry["reviewedAt"] = reviewed_at
    entry["reviewer"] = reviewer

  manifest_path.write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
  )
  return manifest


def upload_manifest(manifest: dict) -> None:
  settings = get_settings()
  bucket = settings.hair_style_asset_bucket or settings.s3_bucket_name
  if not bucket:
    raise RuntimeError("HAIR_STYLE_ASSET_BUCKET or S3_BUCKET_NAME is required for upload.")
  S3Service(settings).put_catalog_object(
    bucket=bucket,
    object_key=f"{settings.hair_style_asset_prefix.rstrip('/')}/manifest.json",
    body=json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
    content_type="application/json",
    cache_control="no-cache",
  )


if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("--manifest", type=Path, required=True)
  parser.add_argument("--style-id", action="append", required=True)
  parser.add_argument("--reviewer", required=True)
  parser.add_argument("--upload", action="store_true")
  args = parser.parse_args()
  approved = approve_styles(args.manifest, args.style_id, args.reviewer)
  if args.upload:
    upload_manifest(approved)
