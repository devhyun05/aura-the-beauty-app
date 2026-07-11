from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
from pathlib import Path

from openai import OpenAI
from PIL import Image, ImageOps

from app.core.settings import get_settings
from app.services.hair_catalog import HAIR_CATALOG_VERSION, HAIR_STYLES
from app.services.s3 import S3Service


BASE_PROMPT = (
  "Create a photorealistic but fully synthetic, non-identifiable adult salon mannequin. "
  "Gender-neutral presentation, centered front-facing head and shoulders, neutral expression, "
  "plain light-gray studio background, even soft lighting, dark natural hair, no jewelry, no text, "
  "no logo, no watermark. This person must not resemble any real person or celebrity."
)


def _reference_prompt(style_prompt: str) -> str:
  return (
    "Change only the hairstyle of this fully synthetic salon mannequin. "
    f"Hairstyle: {style_prompt}. Keep the exact same synthetic face, expression, pose, hair color, "
    "background, framing, clothing, and lighting. Front view, realistic salon reference, no text, "
    "no logo, no watermark."
  )


def _decode_image(response) -> bytes:
  encoded = response.data[0].b64_json if response.data else None
  if not encoded:
    raise RuntimeError("OpenAI returned no image data.")
  return base64.b64decode(encoded)


def _write_webp(path: Path, payload: bytes, *, size: tuple[int, int] | None = None) -> None:
  with Image.open(BytesIO(payload)) as opened:
    image = ImageOps.exif_transpose(opened).convert("RGB")
    if size is not None:
      image = ImageOps.fit(image, size, method=Image.Resampling.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="WEBP", method=6, quality=90)


def _generate_base(client: OpenAI, model: str, path: Path, force: bool) -> None:
  if path.exists() and not force:
    return
  response = client.images.generate(
    model=model,
    prompt=BASE_PROMPT,
    background="opaque",
    n=1,
    output_compression=90,
    output_format="webp",
    quality="medium",
    size="1024x1536",
  )
  _write_webp(path, _decode_image(response))


def _generate_reference(
  client: OpenAI,
  *,
  base_path: Path,
  model: str,
  output_path: Path,
  style_prompt: str,
  force: bool,
) -> str:
  prompt = _reference_prompt(style_prompt)
  if not output_path.exists() or force:
    with base_path.open("rb") as base_file:
      response = client.images.edit(
        model=model,
        image=base_file,
        prompt=prompt,
        background="opaque",
        n=1,
        output_compression=90,
        output_format="webp",
        quality="medium",
        size="1024x1536",
      )
    _write_webp(output_path, _decode_image(response))
  return prompt


def _upload_assets(output_dir: Path, manifest: dict, bucket: str, prefix: str) -> None:
  s3 = S3Service(get_settings())
  for entry in manifest["styles"]:
    for kind in ("reference", "preview"):
      filename = entry[f"{kind}File"]
      s3.put_catalog_object(
        bucket=bucket,
        object_key=f"{prefix}/{filename}",
        body=(output_dir / filename).read_bytes(),
        content_type="image/webp",
      )
  s3.put_catalog_object(
    bucket=bucket,
    object_key=f"{prefix}/manifest.json",
    body=json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
    content_type="application/json",
    cache_control="no-cache",
  )


def main(output_dir: Path, *, force: bool, upload: bool) -> None:
  settings = get_settings()
  if not settings.openai_api_key:
    raise RuntimeError("OPENAI_API_KEY is required to generate hair style assets.")

  output_dir.mkdir(parents=True, exist_ok=True)
  manifest_path = output_dir / "manifest.json"
  existing_manifest = (
    json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest_path.exists()
    else {}
  )
  model_changed = (
    bool(existing_manifest.get("generatorModel"))
    and existing_manifest.get("generatorModel") != settings.openai_image_model_id
  )
  client = OpenAI(api_key=settings.openai_api_key, timeout=180)
  base_path = output_dir / "mannequin-base.webp"
  _generate_base(client, settings.openai_image_model_id, base_path, force or model_changed)

  generated_at = datetime.now(timezone.utc).isoformat()
  existing_entries = {
    entry.get("styleId"): entry
    for entry in existing_manifest.get("styles", [])
    if isinstance(entry, dict)
  }
  entries = []
  for style in HAIR_STYLES:
    reference_file = f"{style.style_id}-reference.webp"
    preview_file = f"{style.style_id}-preview.webp"
    reference_path = output_dir / reference_file
    previous = existing_entries.get(style.style_id) or {}
    expected_prompt_hash = hashlib.sha256(_reference_prompt(style.prompt).encode("utf-8")).hexdigest()
    regenerate_reference = (
      force
      or model_changed
      or previous.get("model") != settings.openai_image_model_id
      or previous.get("promptSha256") != expected_prompt_hash
    )
    prompt = _generate_reference(
      client,
      base_path=base_path,
      model=settings.openai_image_model_id,
      output_path=reference_path,
      style_prompt=style.prompt,
      force=regenerate_reference,
    )
    _write_webp(preview_path := output_dir / preview_file, reference_path.read_bytes(), size=(480, 600))
    prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    reference_hash = hashlib.sha256(reference_path.read_bytes()).hexdigest()
    preview_hash = hashlib.sha256(preview_path.read_bytes()).hexdigest()
    preserves_review = (
      not regenerate_reference
      and previous.get("model") == settings.openai_image_model_id
      and previous.get("promptSha256") == prompt_hash
      and previous.get("referenceSha256") == reference_hash
      and previous.get("previewSha256") == preview_hash
    )
    generation_history = [
      item
      for item in previous.get("generationHistory", [])
      if isinstance(item, dict)
    ]
    generation_event = {
      "generatedAt": generated_at,
      "model": settings.openai_image_model_id,
      "promptSha256": prompt_hash,
      "referenceSha256": reference_hash,
      "previewSha256": preview_hash,
    }
    history_changed = not generation_history or any(
      generation_history[-1].get(key) != generation_event[key]
      for key in ("model", "promptSha256", "referenceSha256", "previewSha256")
    )
    if regenerate_reference or history_changed:
      generation_history.append(generation_event)
    entry = {
      "styleId": style.style_id,
      "name": style.name,
      "model": settings.openai_image_model_id,
      "promptSha256": prompt_hash,
      "referenceSha256": reference_hash,
      "previewSha256": preview_hash,
      "referenceFile": reference_file,
      "previewFile": preview_path.name,
      "generatedAt": previous.get("generatedAt", generated_at) if preserves_review else generated_at,
      "reviewStatus": previous.get("reviewStatus", "pending_human_review") if preserves_review else "pending_human_review",
      "generationHistory": generation_history,
    }
    if preserves_review:
      for key in ("reviewedAt", "reviewer"):
        if previous.get(key):
          entry[key] = previous[key]
    entries.append(entry)

  manifest = {
    "catalogVersion": HAIR_CATALOG_VERSION,
    "generatorModel": settings.openai_image_model_id,
    "generatedAt": generated_at,
    "syntheticMannequin": True,
    "styles": entries,
  }
  manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

  if upload:
    bucket = settings.hair_style_asset_bucket or settings.s3_bucket_name
    if not bucket:
      raise RuntimeError("HAIR_STYLE_ASSET_BUCKET or S3_BUCKET_NAME is required for upload.")
    _upload_assets(output_dir, manifest, bucket, settings.hair_style_asset_prefix.rstrip("/"))


if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("--output-dir", type=Path, default=Path("output/hair-styles/v1"))
  parser.add_argument("--force", action="store_true")
  parser.add_argument("--upload", action="store_true")
  args = parser.parse_args()
  main(args.output_dir, force=args.force, upload=args.upload)
