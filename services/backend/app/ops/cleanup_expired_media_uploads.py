from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import UUID

from app.core.media_policy import (
  GOLDEN_MASK_CONTENT_TYPE,
  GOLDEN_MASK_MEDIA_KIND,
)
from app.core.settings import Settings, get_settings
from app.lambdas.media_postprocess import should_process_object_key, thumbnail_key_for
from app.services.media_deletion import (
  GOLDEN_MASK_UNATTACHED_DELETION_REASON,
  MediaObjectRef,
  enqueue_unattached_media_deletion,
  is_media_object_referenced,
  process_media_deletion_outbox_items,
)


DEFAULT_BATCH_SIZE = 500
GOLDEN_MASK_ORPHAN_RETENTION_DAYS = 8
logger = logging.getLogger(__name__)


class MediaObjectDeleter(Protocol):
  def delete_object(self, *, bucket: str, object_key: str) -> None: ...


@dataclass(frozen=True)
class ExpiredMediaUploadResult:
  candidate_upload_ids: tuple[str, ...]
  cleaned_upload_ids: tuple[str, ...] = ()
  failed_upload_ids: tuple[str, ...] = ()
  candidate_golden_mask_media_ids: tuple[str, ...] = ()
  queued_golden_mask_media_ids: tuple[str, ...] = ()
  failed_golden_mask_media_ids: tuple[str, ...] = ()

  @property
  def total(self) -> int:
    return len(self.candidate_upload_ids) + len(self.candidate_golden_mask_media_ids)

  @property
  def has_failures(self) -> bool:
    return bool(self.failed_upload_ids or self.failed_golden_mask_media_ids)


async def _find_expired_rows(db: Any, *, batch_size: int) -> list[dict[str, Any]]:
  rows = await db.fetch(
    """
    select id, bucket, object_key, thumbnail_bucket, thumbnail_object_key
    from media_upload_sessions
    where status = 'pending'
      and expires_at <= now()
    order by expires_at
    limit $1
    """,
    batch_size,
  )
  return [dict(row) for row in rows]


async def _find_expired_unattached_golden_masks(
  db: Any,
  *,
  batch_size: int,
  retention_days: int,
) -> list[dict[str, Any]]:
  rows = await db.fetch(
    """
    select media.id
    from media_assets media
    where media.media_kind = $1
      and media.content_type = $2
      and media.status = 'active'
      and media.deleted_at is null
      and media.created_at <= now() - make_interval(days => $3)
      and not exists (
        select 1
        from analysis_reports report
        where report.golden_mask_media_id = media.id
          and report.deleted_at is null
      )
    order by media.created_at
    limit $4
    """,
    GOLDEN_MASK_MEDIA_KIND,
    GOLDEN_MASK_CONTENT_TYPE,
    retention_days,
    batch_size,
  )
  return [dict(row) for row in rows]


async def _queue_expired_unattached_golden_mask(
  db: Any,
  *,
  media_id: UUID,
  retention_days: int,
) -> UUID | None:
  async def queue(connection) -> UUID | None:
    media = await connection.fetchrow(
      """
      select id, bucket, object_key
      from media_assets
      where id = $1
        and media_kind = $2
        and content_type = $3
        and status = 'active'
        and deleted_at is null
        and created_at <= now() - make_interval(days => $4)
      for update
      """,
      media_id,
      GOLDEN_MASK_MEDIA_KIND,
      GOLDEN_MASK_CONTENT_TYPE,
      retention_days,
    )
    if media is None or not media.get("bucket") or not media.get("object_key"):
      return None

    bucket = str(media["bucket"])
    object_key = str(media["object_key"])
    if await is_media_object_referenced(
      connection,
      bucket=bucket,
      object_key=object_key,
    ):
      return None

    updated = await connection.fetchrow(
      """
      update media_assets
      set status = 'deletion_pending'
      where id = $1
        and status = 'active'
        and deleted_at is null
      returning id
      """,
      media_id,
    )
    if updated is None:
      return None

    outbox_id, _ = await enqueue_unattached_media_deletion(
      connection,
      ref=MediaObjectRef(
        bucket=bucket,
        object_key=object_key,
        media_asset_id=media_id,
      ),
      reason=GOLDEN_MASK_UNATTACHED_DELETION_REASON,
    )
    return outbox_id

  return await db.run_in_transaction(queue)


def _object_locations(row: dict[str, Any]) -> tuple[tuple[str, str], ...]:
  bucket = str(row["bucket"])
  object_key = str(row["object_key"])
  locations: list[tuple[str, str]] = [(bucket, object_key)]

  if should_process_object_key(object_key):
    locations.append((bucket, thumbnail_key_for(object_key)))

  thumbnail_bucket = row.get("thumbnail_bucket")
  thumbnail_object_key = row.get("thumbnail_object_key")
  if thumbnail_bucket and thumbnail_object_key:
    locations.append((str(thumbnail_bucket), str(thumbnail_object_key)))

  return tuple(dict.fromkeys(locations))


async def find_expired_media_uploads(
  db: Any,
  *,
  batch_size: int = DEFAULT_BATCH_SIZE,
  golden_mask_retention_days: int = GOLDEN_MASK_ORPHAN_RETENTION_DAYS,
) -> ExpiredMediaUploadResult:
  rows = await _find_expired_rows(db, batch_size=batch_size)
  golden_mask_rows = await _find_expired_unattached_golden_masks(
    db,
    batch_size=batch_size,
    retention_days=golden_mask_retention_days,
  )
  return ExpiredMediaUploadResult(
    candidate_upload_ids=tuple(str(row["id"]) for row in rows),
    candidate_golden_mask_media_ids=tuple(
      str(row["id"])
      for row in golden_mask_rows
    ),
  )


async def cleanup_expired_media_uploads(
  db: Any,
  *,
  s3: MediaObjectDeleter,
  batch_size: int = DEFAULT_BATCH_SIZE,
  golden_mask_retention_days: int = GOLDEN_MASK_ORPHAN_RETENTION_DAYS,
  settings: Settings | None = None,
) -> ExpiredMediaUploadResult:
  rows = await _find_expired_rows(db, batch_size=batch_size)
  candidate_ids = tuple(str(row["id"]) for row in rows)
  cleaned_ids: list[str] = []
  failed_ids: list[str] = []

  for row in rows:
    upload_id = str(row["id"])
    try:
      for bucket, object_key in _object_locations(row):
        await asyncio.to_thread(
          s3.delete_object,
          bucket=bucket,
          object_key=object_key,
        )

      updated = await db.fetchrow(
        """
        update media_upload_sessions
        set status = 'expired'
        where id = $1
          and status = 'pending'
          and expires_at <= now()
        returning id
        """,
        upload_id,
      )
      if updated is not None:
        cleaned_ids.append(upload_id)
    except Exception:  # noqa: BLE001 - leave the row pending so the next scheduled run retries.
      failed_ids.append(upload_id)
      logger.exception("[aura:media-upload-cleanup] failed upload_id=%s", upload_id)

  golden_mask_rows = await _find_expired_unattached_golden_masks(
    db,
    batch_size=batch_size,
    retention_days=golden_mask_retention_days,
  )
  candidate_golden_mask_ids = tuple(str(row["id"]) for row in golden_mask_rows)
  queued_golden_mask_ids: list[str] = []
  failed_golden_mask_ids: list[str] = []
  outbox_ids: list[UUID] = []

  for row in golden_mask_rows:
    media_id = UUID(str(row["id"]))
    try:
      outbox_id = await _queue_expired_unattached_golden_mask(
        db,
        media_id=media_id,
        retention_days=golden_mask_retention_days,
      )
      if outbox_id is not None:
        queued_golden_mask_ids.append(str(media_id))
        outbox_ids.append(outbox_id)
    except Exception:  # noqa: BLE001 - leave active so the next scheduled run retries.
      failed_golden_mask_ids.append(str(media_id))
      logger.exception(
        "[aura:media-upload-cleanup] golden-mask-orphan-failed media_id=%s",
        media_id,
      )

  if outbox_ids:
    await process_media_deletion_outbox_items(
      db,
      settings or get_settings(),
      outbox_ids,
    )

  return ExpiredMediaUploadResult(
    candidate_upload_ids=candidate_ids,
    cleaned_upload_ids=tuple(cleaned_ids),
    failed_upload_ids=tuple(failed_ids),
    candidate_golden_mask_media_ids=candidate_golden_mask_ids,
    queued_golden_mask_media_ids=tuple(queued_golden_mask_ids),
    failed_golden_mask_media_ids=tuple(failed_golden_mask_ids),
  )


def print_expired_media_upload_result(
  result: ExpiredMediaUploadResult,
  *,
  dry_run: bool,
) -> None:
  mode = "dry-run" if dry_run else "execute"
  print(
    f"[aura:media-upload-cleanup] mode={mode} candidates={result.total} "
    f"cleaned={len(result.cleaned_upload_ids)} failed={len(result.failed_upload_ids)}",
  )
  for upload_id in result.candidate_upload_ids:
    if dry_run:
      outcome = "candidate"
    elif upload_id in result.failed_upload_ids:
      outcome = "failed"
    elif upload_id in result.cleaned_upload_ids:
      outcome = "cleaned"
    else:
      outcome = "skipped"
    print(f"[aura:media-upload-cleanup] {mode} upload_id={upload_id} outcome={outcome}")
  for media_id in result.candidate_golden_mask_media_ids:
    if dry_run:
      outcome = "candidate"
    elif media_id in result.failed_golden_mask_media_ids:
      outcome = "failed"
    elif media_id in result.queued_golden_mask_media_ids:
      outcome = "queued"
    else:
      outcome = "referenced-or-raced"
    print(
      f"[aura:media-upload-cleanup] {mode} "
      f"golden_mask_media_id={media_id} outcome={outcome}",
    )
