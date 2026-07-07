from __future__ import annotations

import argparse
import asyncio
import hashlib
import io
from dataclasses import dataclass
from typing import Any

import boto3
from botocore.config import Config
from PIL import Image, ImageOps

from app.core.settings import Settings, get_settings
from app.db.connection_config import connect_database


OPTIMIZED_MEDIA_KIND = "analysis-preview"
OPTIMIZED_PREFIX = "uploads/optimized/analysis-previews"
JPEG_CONTENT_TYPE = "image/jpeg"
CACHE_CONTROL = "public, max-age=31536000, immutable"


@dataclass(frozen=True)
class OptimizedImage:
  bytes_data: bytes
  checksum_sha256: str
  height: int
  width: int


def s3_client(settings: Settings):
  kwargs: dict[str, Any] = {
    "config": Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
    "endpoint_url": f"https://s3.{settings.aws_region}.amazonaws.com",
    "region_name": settings.aws_region,
  }

  if settings.aws_access_key_id and settings.aws_secret_access_key:
    kwargs.update(
      {
        "aws_access_key_id": settings.aws_access_key_id,
        "aws_secret_access_key": settings.aws_secret_access_key,
      },
    )

  return boto3.client("s3", **kwargs)


def cdn_url_for(settings: Settings, object_key: str) -> str | None:
  cdn_base_url = settings.effective_cdn_base_url
  return f"{cdn_base_url}/{object_key}" if cdn_base_url else None


def object_key_for(source_media_id: str) -> str:
  return f"{OPTIMIZED_PREFIX}/{source_media_id}.jpg"


def optimize_image_bytes(
  original_bytes: bytes,
  *,
  max_edge: int,
  quality: int,
) -> OptimizedImage:
  image = Image.open(io.BytesIO(original_bytes))
  image = ImageOps.exif_transpose(image)

  if image.mode in {"RGBA", "LA"} or "transparency" in image.info:
    flattened = Image.new("RGB", image.size, (255, 255, 255))
    alpha = image.convert("RGBA").getchannel("A")
    flattened.paste(image.convert("RGBA"), mask=alpha)
    image = flattened
  elif image.mode != "RGB":
    image = image.convert("RGB")

  image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)

  output = io.BytesIO()
  image.save(
    output,
    format="JPEG",
    optimize=True,
    progressive=True,
    quality=quality,
  )
  bytes_data = output.getvalue()

  return OptimizedImage(
    bytes_data=bytes_data,
    checksum_sha256=hashlib.sha256(bytes_data).hexdigest(),
    height=image.height,
    width=image.width,
  )


async def fetch_target_reports(conn, *, limit: int, force: bool) -> list[dict[str, Any]]:
  force_filter = "" if force else "and (r.preview_media_id is null or r.preview_media_id = r.source_media_id or pm.media_kind is distinct from $1)"
  limit_clause = f"limit {limit}" if limit > 0 else ""
  args = [] if force else [OPTIMIZED_MEDIA_KIND]
  rows = await conn.fetch(
    f"""
    select
      r.id as report_id,
      r.user_id,
      r.preview_media_id,
      r.source_media_id,
      sm.owner_user_id,
      sm.source,
      sm.bucket,
      sm.object_key,
      sm.content_type,
      sm.byte_size,
      pm.media_kind as preview_media_kind
    from analysis_reports r
    join media_assets sm on sm.id = r.source_media_id
    left join media_assets pm on pm.id = r.preview_media_id
    where r.deleted_at is null
      and sm.deleted_at is null
      and sm.status = 'active'
      and sm.bucket is not null
      and sm.object_key is not null
      and coalesce(sm.content_type, '') like 'image/%'
      {force_filter}
    order by r.created_at desc
    {limit_clause}
    """,
    *args,
  )
  return [dict(row) for row in rows]


async def upsert_optimized_media(
  conn,
  *,
  row: dict[str, Any],
  settings: Settings,
  object_key: str,
  optimized: OptimizedImage,
) -> str:
  media = await conn.fetchrow(
    """
    insert into media_assets (
      owner_user_id,
      media_kind,
      source,
      bucket,
      object_key,
      cdn_url,
      content_type,
      byte_size,
      width,
      height,
      checksum_sha256,
      original_filename,
      is_original,
      status
    )
    values ($1, $2, 'generated', $3, $4, $5, $6, $7, $8, $9, $10, $11, false, 'active')
    on conflict (bucket, object_key) do update set
      cdn_url = excluded.cdn_url,
      content_type = excluded.content_type,
      byte_size = excluded.byte_size,
      width = excluded.width,
      height = excluded.height,
      checksum_sha256 = excluded.checksum_sha256,
      deleted_at = null,
      status = 'active'
    returning id
    """,
    row["owner_user_id"],
    OPTIMIZED_MEDIA_KIND,
    row["bucket"],
    object_key,
    cdn_url_for(settings, object_key),
    JPEG_CONTENT_TYPE,
    len(optimized.bytes_data),
    optimized.width,
    optimized.height,
    optimized.checksum_sha256,
    f"{row['source_media_id']}.jpg",
  )
  return str(media["id"])


async def run(args: argparse.Namespace) -> int:
  settings = get_settings()
  client = s3_client(settings)
  conn, _ = await connect_database()

  try:
    rows = await fetch_target_reports(conn, limit=args.limit, force=args.force)
    print(
      f"target_reports={len(rows)} mode={'execute' if args.execute else 'dry-run'} "
      f"max_edge={args.max_edge} quality={args.quality}",
    )

    optimized_count = 0
    skipped_count = 0
    original_total = 0
    optimized_total = 0

    for index, row in enumerate(rows, 1):
      source_media_id = str(row["source_media_id"])
      object_key = object_key_for(source_media_id)
      original_size = int(row["byte_size"] or 0)
      original_total += original_size

      try:
        body = client.get_object(Bucket=row["bucket"], Key=row["object_key"])["Body"].read()
        optimized = optimize_image_bytes(
          body,
          max_edge=args.max_edge,
          quality=args.quality,
        )
      except Exception as error:
        skipped_count += 1
        print(
          f"[{index}/{len(rows)}] skip failed report={row['report_id']} "
          f"source_media={source_media_id} error={error}",
        )
        continue

      optimized_size = len(optimized.bytes_data)

      if not args.force and original_size and optimized_size >= original_size:
        skipped_count += 1
        print(
          f"[{index}/{len(rows)}] skip not-smaller report={row['report_id']} "
          f"original={original_size} optimized={optimized_size}",
        )
        continue

      optimized_count += 1
      optimized_total += optimized_size
      print(
        f"[{index}/{len(rows)}] optimize report={row['report_id']} "
        f"{original_size}->{optimized_size} key={object_key}",
      )

      if not args.execute:
        continue

      client.put_object(
        Body=optimized.bytes_data,
        Bucket=row["bucket"],
        CacheControl=CACHE_CONTROL,
        ContentType=JPEG_CONTENT_TYPE,
        Key=object_key,
      )
      optimized_media_id = await upsert_optimized_media(
        conn,
        row=row,
        settings=settings,
        object_key=object_key,
        optimized=optimized,
      )
      await conn.execute(
        "update analysis_reports set preview_media_id = $1 where id = $2",
        optimized_media_id,
        row["report_id"],
      )

    print(
      "summary "
      f"optimized={optimized_count} skipped={skipped_count} "
      f"original_total={original_total} optimized_total={optimized_total}",
    )
    return 0
  finally:
    await conn.close()


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Create lightweight S3 JPEG previews for analysis report images and attach them to analysis_reports.preview_media_id.",
  )
  parser.add_argument("--execute", action="store_true", help="Upload optimized JPEGs to S3 and update RDS.")
  parser.add_argument("--force", action="store_true", help="Rebuild previews even when a report already points at an analysis-preview asset.")
  parser.add_argument("--limit", type=int, default=0, help="Limit report count; 0 means all targets.")
  parser.add_argument("--max-edge", type=int, default=960)
  parser.add_argument("--quality", type=int, default=76)
  args = parser.parse_args()

  if args.max_edge < 320:
    parser.error("--max-edge must be at least 320")

  if not 1 <= args.quality <= 100:
    parser.error("--quality must be 1..100")

  return args


def main() -> None:
  raise SystemExit(asyncio.run(run(parse_args())))


if __name__ == "__main__":
  main()
