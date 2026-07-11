from __future__ import annotations

import argparse
import asyncio
import logging

from app.core.settings import get_settings
from app.db.session import database
from app.services.hair_schema import ensure_hair_schema
from app.services.hair_observability import emit_hair_metric
from app.services.s3 import S3Service


logger = logging.getLogger(__name__)


async def cleanup_expired_hair_media(limit: int = 100) -> dict[str, int]:
  settings = get_settings()
  if database.pool is None:
    raise RuntimeError("Database is not connected.")

  rows = await database.fetch(
    """
    select distinct media.id as media_id, media.bucket, media.object_key
    from media_assets media
    join (
      select source_media_id as media_id
      from hair_analyses where expires_at <= now()
      union
      select mask_media_id as media_id
      from hair_analyses where expires_at <= now() and mask_media_id is not null
      union
      select result_media_id as media_id
      from hair_simulations
      where saved_at is null and expires_at <= now() and result_media_id is not null
      union
      select orphan.id as media_id
      from media_assets orphan
      where orphan.media_kind in (
          'hair-analysis-source', 'hair-analysis-mask', 'hair-simulation-result'
        )
        and orphan.created_at <= now() - make_interval(hours => $1)
        and not exists (
          select 1 from hair_analyses analysis
          where analysis.source_media_id = orphan.id or analysis.mask_media_id = orphan.id
        )
        and not exists (
          select 1 from hair_simulations simulation
          where simulation.result_media_id = orphan.id
        )
    ) expired on expired.media_id = media.id
    where media.deleted_at is null
    limit $2
    """,
    settings.hair_source_retention_hours,
    max(1, min(limit, 1000)),
  )

  deleted = 0
  failed = 0
  s3 = S3Service(settings)
  for row in rows:
    try:
      if row.get("bucket") and row.get("object_key"):
        await asyncio.to_thread(
          s3.delete_object_permanently,
          bucket=row["bucket"],
          object_key=row["object_key"],
        )
      await database.execute(
        "update media_assets set status = 'deleted', deleted_at = coalesce(deleted_at, now()) where id = $1",
        row["media_id"],
      )
      deleted += 1
    except Exception:  # noqa: BLE001 - leave the row active for the next scheduled run.
      failed += 1
      logger.exception("[aura:hair-cleanup] media-delete-failed mediaId=%s", row["media_id"])

  await database.execute(
    """
    update hair_simulations
    set status = 'expired', updated_at = now()
    where saved_at is null and expires_at <= now() and status <> 'expired'
    """,
  )
  await database.execute(
    """
    update hair_analyses
    set status = 'expired', analysis_payload = '{}'::jsonb,
        recommended_style_ids = '{}', updated_at = now()
    where expires_at <= now() and status <> 'expired'
    """,
  )
  emit_hair_metric("cleanup", "HairMediaDeleted", deleted)
  if failed:
    emit_hair_metric("cleanup", "HairMediaDeleteFailed", failed)
  return {"deleted": deleted, "failed": failed, "scanned": len(rows)}


async def main(limit: int) -> None:
  logging.basicConfig(level=logging.INFO)
  await database.connect()
  try:
    await ensure_hair_schema(database)
    result = await cleanup_expired_hair_media(limit)
    logger.info("[aura:hair-cleanup] completed %s", result)
  finally:
    await database.close()


if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("--limit", type=int, default=500)
  args = parser.parse_args()
  asyncio.run(main(args.limit))
