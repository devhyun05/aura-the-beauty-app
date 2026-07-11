from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Protocol

from app.lambdas.media_postprocess import should_process_object_key, thumbnail_key_for


DEFAULT_BATCH_SIZE = 500
logger = logging.getLogger(__name__)


class MediaObjectDeleter(Protocol):
  def delete_object(self, *, bucket: str, object_key: str) -> None: ...


@dataclass(frozen=True)
class ExpiredMediaUploadResult:
  candidate_upload_ids: tuple[str, ...]
  cleaned_upload_ids: tuple[str, ...] = ()
  failed_upload_ids: tuple[str, ...] = ()

  @property
  def total(self) -> int:
    return len(self.candidate_upload_ids)

  @property
  def has_failures(self) -> bool:
    return bool(self.failed_upload_ids)


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
) -> ExpiredMediaUploadResult:
  rows = await _find_expired_rows(db, batch_size=batch_size)
  return ExpiredMediaUploadResult(
    candidate_upload_ids=tuple(str(row["id"]) for row in rows),
  )


async def cleanup_expired_media_uploads(
  db: Any,
  *,
  s3: MediaObjectDeleter,
  batch_size: int = DEFAULT_BATCH_SIZE,
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

  return ExpiredMediaUploadResult(
    candidate_upload_ids=candidate_ids,
    cleaned_upload_ids=tuple(cleaned_ids),
    failed_upload_ids=tuple(failed_ids),
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
