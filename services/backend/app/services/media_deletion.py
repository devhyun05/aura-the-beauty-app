import json
import logging
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

import asyncpg

from app.core.settings import Settings
from app.db.session import Database
from app.services.s3 import (
  PRIVATE_USER_MEDIA_OBJECT_PREFIX,
  PUBLIC_MAKEUP_RECOMMENDATION_OBJECT_PREFIX,
  S3Service,
  is_makeup_recommendation_object_key,
  is_private_golden_mask_object_key,
  is_private_hair_object_key,
  is_private_user_media_object_key,
  media_location_log_token,
)


logger = logging.getLogger(__name__)
GOLDEN_MASK_UNATTACHED_DELETION_REASON = "golden_mask_unattached_deleted"

DELETABLE_REPORT_OBJECT_PREFIXES = (
  "uploads/capture/",
  "uploads/face-analysis/",
  "uploads/face-analysis-source/",
  "uploads/generated-makeup/",
  "uploads/golden-mask/",
  PUBLIC_MAKEUP_RECOMMENDATION_OBJECT_PREFIX,
  "uploads/photo-captures/",
  "uploads/recommended-makeups/",
  PRIVATE_USER_MEDIA_OBJECT_PREFIX,
)


@dataclass(frozen=True)
class MediaObjectRef:
  bucket: str
  object_key: str
  media_asset_id: UUID | None = None


async def ensure_media_deletion_schema(db: Database) -> None:
  if db.pool is None:
    return

  async with db.pool.acquire() as connection:
    await ensure_media_deletion_schema_connection(connection)


async def ensure_media_deletion_schema_connection(
  connection: asyncpg.Connection,
) -> None:
  await connection.execute(
    """
    create extension if not exists pgcrypto;

    alter table analysis_reports
      add column if not exists deleted_at timestamptz;

    create table if not exists media_deletion_outbox (
      id uuid primary key default gen_random_uuid(),
      report_id uuid,
      media_asset_id uuid,
      bucket text not null,
      object_key text not null,
      reason text not null,
      status text not null default 'pending',
      attempts integer not null default 0,
      last_error text,
      next_attempt_at timestamptz not null default now(),
      locked_at timestamptz,
      processed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create unique index if not exists idx_media_deletion_outbox_report_object
      on media_deletion_outbox (report_id, bucket, object_key);

    create index if not exists idx_media_deletion_outbox_status_due
      on media_deletion_outbox (status, next_attempt_at, created_at);

    create index if not exists idx_analysis_reports_user_active_analyzed
      on analysis_reports (user_id, analyzed_at desc)
      where deleted_at is null;

    create or replace function aura_require_active_media_reference()
    returns trigger
    language plpgsql
    as $aura_media_reference$
    declare
      media_reference_id uuid;
    begin
      media_reference_id := nullif(to_jsonb(new) ->> TG_ARGV[0], '')::uuid;
      if media_reference_id is null then
        return new;
      end if;

      perform 1
      from media_assets
      where id = media_reference_id
        and status = 'active'
        and deleted_at is null
      for key share;

      if not found then
        raise exception 'Referenced media is not active.'
          using errcode = '23503';
      end if;
      return new;
    end;
    $aura_media_reference$;

    create or replace function aura_require_active_photo_capture_media()
    returns trigger
    language plpgsql
    as $aura_capture_media_reference$
    declare
      capture_reference_id uuid;
    begin
      capture_reference_id := nullif(to_jsonb(new) ->> TG_ARGV[0], '')::uuid;
      if capture_reference_id is null then
        return new;
      end if;

      -- A report can consume media indirectly through photo_captures. Lock the
      -- media row here as well so report attachment and deletion serialize at
      -- the same active -> deletion_pending boundary as direct media FKs.
      perform 1
      from photo_captures capture
      join media_assets media on media.id = capture.media_id
      where capture.id = capture_reference_id
        and media.status = 'active'
        and media.deleted_at is null
      for key share of media;

      if not found then
        raise exception 'Referenced capture media is not active.'
          using errcode = '23503';
      end if;
      return new;
    end;
    $aura_capture_media_reference$;
    """,
  )
  await connection.execute(
    """
    do $aura_media_triggers$
    declare
      target record;
      trigger_name text;
      schema_name text := current_schema();
    begin
      for target in
        select *
        -- media_upload_sessions.media_asset_id is claim bookkeeping rather
        -- than a consuming reference; it is assigned in the same CTE that
        -- inserts media_assets and therefore must not use this pre-insert guard.
        from (values
          ('users', 'avatar_media_id'),
          ('photo_captures', 'media_id'),
          ('analysis_reports', 'source_media_id'),
          ('analysis_reports', 'preview_media_id'),
          ('analysis_reports', 'golden_mask_media_id'),
          ('hair_analyses', 'source_media_id'),
          ('hair_analyses', 'mask_media_id'),
          ('hair_simulations', 'result_media_id'),
          ('saved_makeup_styles', 'source_media_id'),
          ('saved_makeup_styles', 'thumbnail_media_id'),
          ('products', 'image_media_id'),
          ('product_recommendation_runs', 'look_media_id'),
          ('product_assets', 'media_id'),
          ('ar_filters', 'preview_media_id'),
          ('filter_extraction_reports', 'result_media_id'),
          ('makeup_feedback_reports', 'uploaded_media_id'),
          ('makeup_recommendation_assets', 'input_media_id'),
          ('home_hero_banners', 'image_media_id'),
          ('home_trend_items', 'image_media_id'),
          ('home_filter_store_items', 'image_media_id'),
          ('home_recommended_looks', 'image_media_id'),
          ('community_thread_media', 'media_id'),
          ('consulting_message_media', 'media_id')
        ) as references_to_media(table_name, column_name)
      loop
        if to_regclass(format('%I.%I', schema_name, target.table_name)) is null
          or not exists (
            select 1
            from information_schema.columns
            where table_schema = schema_name
              and table_name = target.table_name
              and column_name = target.column_name
          ) then
          continue;
        end if;

        trigger_name := 'trg_aura_active_' || substring(
          md5(target.table_name || ':' || target.column_name),
          1,
          16
        );
        execute format(
          'drop trigger if exists %I on %I.%I',
          trigger_name,
          schema_name,
          target.table_name
        );
        execute format(
          'create trigger %I before insert or update of %I on %I.%I '
          || 'for each row execute function aura_require_active_media_reference(%L)',
          trigger_name,
          target.column_name,
          schema_name,
          target.table_name,
          target.column_name
        );
      end loop;
    end;
    $aura_media_triggers$;
    """,
  )
  await connection.execute(
    """
    do $aura_capture_media_triggers$
    declare
      target record;
      trigger_name text;
      schema_name text := current_schema();
    begin
      for target in
        select *
        from (values
          ('analysis_reports', 'photo_capture_id'),
          ('filter_extraction_reports', 'photo_capture_id'),
          ('makeup_feedback_reports', 'photo_capture_id')
        ) as references_to_capture(table_name, column_name)
      loop
        if to_regclass(format('%I.%I', schema_name, target.table_name)) is null
          or not exists (
            select 1
            from information_schema.columns
            where table_schema = schema_name
              and table_name = target.table_name
              and column_name = target.column_name
          ) then
          continue;
        end if;

        trigger_name := 'trg_aura_capture_' || substring(
          md5(target.table_name || ':' || target.column_name),
          1,
          16
        );
        execute format(
          'drop trigger if exists %I on %I.%I',
          trigger_name,
          schema_name,
          target.table_name
        );
        execute format(
          'create trigger %I before insert or update of %I on %I.%I '
          || 'for each row execute function aura_require_active_photo_capture_media(%L)',
          trigger_name,
          target.column_name,
          schema_name,
          target.table_name,
          target.column_name
        );
      end loop;
    end;
    $aura_capture_media_triggers$;
    """,
  )


def collect_report_media_refs(
  report: dict[str, Any],
  *,
  cdn_base_url: str | None,
  default_bucket: str | None,
) -> list[MediaObjectRef]:
  refs: dict[tuple[str, str], MediaObjectRef] = {}

  def add_ref(
    bucket: str | None,
    object_key: str | None,
    media_asset_id: UUID | str | None = None,
  ) -> None:
    normalized_bucket = bucket or default_bucket
    normalized_key = normalize_object_key(object_key)

    if not normalized_bucket or not normalized_key:
      return

    if not is_report_owned_object_key(normalized_key):
      return

    normalized_media_id = (
      UUID(str(media_asset_id))
      if media_asset_id
      else None
    )
    refs[(normalized_bucket, normalized_key)] = MediaObjectRef(
      bucket=normalized_bucket,
      object_key=normalized_key,
      media_asset_id=normalized_media_id,
    )

  for prefix in ("source", "preview", "golden_mask", "capture"):
    add_ref(
      report.get(f"{prefix}_media_bucket"),
      report.get(f"{prefix}_media_object_key"),
      report.get(f"{prefix}_media_id"),
    )

  detail_payload = decode_json_object(report.get("detail_payload"))

  for bucket, object_key in extract_report_object_keys(
    detail_payload,
    cdn_base_url=cdn_base_url,
    default_bucket=default_bucket,
  ):
    add_ref(bucket, object_key)

  return list(refs.values())


def decode_json_object(value: object) -> dict[str, Any]:
  if isinstance(value, dict):
    return value

  if isinstance(value, str) and value.strip():
    try:
      decoded = json.loads(value)
    except json.JSONDecodeError:
      return {}

    return decoded if isinstance(decoded, dict) else {}

  return {}


def extract_report_object_keys(
  value: object,
  *,
  cdn_base_url: str | None,
  default_bucket: str | None,
) -> set[tuple[str | None, str]]:
  object_refs: set[tuple[str | None, str]] = set()

  def visit(node: object, parent_key: str | None = None) -> None:
    if isinstance(node, dict):
      for key, nested_value in node.items():
        visit(nested_value, key)
      return

    if isinstance(node, list):
      for nested_value in node:
        visit(nested_value, parent_key)
      return

    if not isinstance(node, str):
      return

    bucket, object_key = parse_s3_reference(
      node,
      cdn_base_url=cdn_base_url,
      default_bucket=default_bucket,
    )

    if not object_key and is_object_key_field(parent_key):
      bucket = default_bucket
      object_key = normalize_object_key(node)

    if object_key and is_report_owned_object_key(object_key):
      object_refs.add((bucket or default_bucket, object_key))

  visit(value)

  return object_refs


def is_object_key_field(key: str | None) -> bool:
  return key in {
    "imageObjectKey",
    "objectKey",
    "previewObjectKey",
    "sourceObjectKey",
  }


def is_report_owned_object_key(object_key: str) -> bool:
  return object_key.startswith(DELETABLE_REPORT_OBJECT_PREFIXES)


def normalize_object_key(value: str | None) -> str | None:
  normalized = value.strip().lstrip("/") if isinstance(value, str) else ""

  return normalized or None


def parse_s3_reference(
  value: str,
  *,
  cdn_base_url: str | None,
  default_bucket: str | None,
) -> tuple[str | None, str | None]:
  normalized = value.strip()

  if normalized.startswith("s3://"):
    without_scheme = normalized.removeprefix("s3://")
    bucket, separator, object_key = without_scheme.partition("/")

    if separator and object_key:
      return bucket, normalize_object_key(object_key)

  if cdn_base_url and normalized.startswith(cdn_base_url.rstrip("/") + "/"):
    return (
      default_bucket,
      normalize_object_key(normalized.removeprefix(cdn_base_url.rstrip("/") + "/")),
    )

  if normalized.startswith(("http://", "https://")):
    parsed = urlparse(normalized)
    return default_bucket, normalize_object_key(parsed.path)

  return default_bucket, normalize_object_key(normalized)


async def enqueue_unreferenced_report_media_deletions(
  connection: asyncpg.Connection,
  *,
  report_id: UUID,
  refs: Iterable[MediaObjectRef],
  reason: str = "analysis_report_deleted",
) -> tuple[list[UUID], int]:
  outbox_ids: list[UUID] = []
  skipped_referenced_count = 0

  for ref in refs:
    # Lock every live alias of the object.  Combined with the active-reference
    # trigger installed by ensure_media_deletion_schema_connection(), this
    # makes the active -> deletion_pending transition the serialization point:
    # new report rows cannot attach the object after this transaction commits.
    locked_media_rows = await connection.fetch(
      """
      select id
      from media_assets
      where bucket = $1
        and object_key = $2
        and deleted_at is null
      for update
      """,
      ref.bucket,
      ref.object_key,
    )
    if await is_media_object_referenced(
      connection,
      bucket=ref.bucket,
      object_key=ref.object_key,
      excluding_report_id=report_id,
    ):
      skipped_referenced_count += 1
      continue

    locked_media_ids = [row["id"] for row in locked_media_rows]
    if locked_media_ids:
      await connection.execute(
        """
        update media_assets
        set status = 'deletion_pending',
            cdn_url = null,
            thumbnail_cdn_url = null
        where id = any($1::uuid[])
          and status = 'active'
          and deleted_at is null
        """,
        locked_media_ids,
      )

    outbox_row = await connection.fetchrow(
      """
      insert into media_deletion_outbox (
        report_id,
        media_asset_id,
        bucket,
        object_key,
        reason,
        status,
        next_attempt_at
      )
      values ($1, $2, $3, $4, $5, 'pending', now())
      on conflict (report_id, bucket, object_key)
      do update set
        media_asset_id = coalesce(media_deletion_outbox.media_asset_id, excluded.media_asset_id),
        status = case
          when media_deletion_outbox.status = 'completed' then 'completed'
          else 'pending'
        end,
        last_error = case
          when media_deletion_outbox.status = 'completed' then media_deletion_outbox.last_error
          else null
        end,
        next_attempt_at = case
          when media_deletion_outbox.status = 'completed' then media_deletion_outbox.next_attempt_at
          else now()
        end,
        updated_at = now()
      returning id, status
      """,
      report_id,
      ref.media_asset_id,
      ref.bucket,
      ref.object_key,
      reason,
    )

    if outbox_row and outbox_row["status"] != "completed":
      outbox_ids.append(outbox_row["id"])

  return outbox_ids, skipped_referenced_count


async def enqueue_unattached_media_deletion(
  connection: asyncpg.Connection,
  *,
  ref: MediaObjectRef,
  reason: str,
) -> tuple[UUID, bool]:
  """Queue one owner-validated, unattached media object for permanent deletion.

  The caller must hold a row lock on ``ref.media_asset_id``. That lock makes the
  read-then-insert path idempotent without adding a second outbox uniqueness
  constraint, while the outbox processor still performs its normal reference
  check immediately before deleting S3 data.
  """
  if ref.media_asset_id is None:
    raise ValueError("Unattached media deletion requires a media asset id.")

  existing = await connection.fetchrow(
    """
    select id, status
    from media_deletion_outbox
    where report_id is null
      and media_asset_id = $1
      and reason = $2
    order by created_at desc
    limit 1
    """,
    ref.media_asset_id,
    reason,
  )
  if existing is not None:
    if existing["status"] in {"completed", "processing"}:
      return existing["id"], False

    updated = await connection.fetchrow(
      """
      update media_deletion_outbox
      set bucket = $2,
          object_key = $3,
          status = 'pending',
          last_error = null,
          next_attempt_at = now(),
          updated_at = now()
      where id = $1
      returning id
      """,
      existing["id"],
      ref.bucket,
      ref.object_key,
    )
    if updated is None:
      raise RuntimeError("Golden Mask deletion outbox row could not be resumed.")
    return updated["id"], True

  inserted = await connection.fetchrow(
    """
    insert into media_deletion_outbox (
      report_id,
      media_asset_id,
      bucket,
      object_key,
      reason,
      status,
      next_attempt_at
    )
    values (null, $1, $2, $3, $4, 'pending', now())
    returning id
    """,
    ref.media_asset_id,
    ref.bucket,
    ref.object_key,
    reason,
  )
  if inserted is None:
    raise RuntimeError("Golden Mask deletion outbox row could not be created.")
  return inserted["id"], True


async def is_media_object_referenced(
  connection: asyncpg.Connection,
  *,
  bucket: str,
  object_key: str,
  excluding_report_id: UUID | None = None,
) -> bool:
  media_ids = await connection.fetch(
    """
    select id
    from media_assets
    where bucket = $1
      and object_key = $2
      and deleted_at is null
    """,
    bucket,
    object_key,
  )
  media_id_values = [row["id"] for row in media_ids]

  if media_id_values:
    referenced_by_media_id = await connection.fetchval(
      """
      select exists (
        select 1
        from users
        where avatar_media_id = any($1::uuid[])
          and deleted_at is null
        union all
        select 1
        from analysis_reports
        where deleted_at is null
          and ($2::uuid is null or id <> $2::uuid)
          and (
            source_media_id = any($1::uuid[])
            or preview_media_id = any($1::uuid[])
            or golden_mask_media_id = any($1::uuid[])
          )
        union all
        select 1
        from saved_makeup_styles
        where archived_at is null
          and (
            source_media_id = any($1::uuid[])
            or thumbnail_media_id = any($1::uuid[])
          )
        union all
        select 1
        from products
        where is_active = true
          and image_media_id = any($1::uuid[])
        union all
        select 1
        from product_recommendation_runs
        where look_media_id = any($1::uuid[])
        union all
        select 1
        from ar_filters
        where preview_media_id = any($1::uuid[])
        union all
        select 1
        from hair_analyses
        where source_media_id = any($1::uuid[])
          or mask_media_id = any($1::uuid[])
        union all
        select 1
        from hair_simulations
        where result_media_id = any($1::uuid[])
        union all
        select 1
        from filter_extraction_reports
        where result_media_id = any($1::uuid[])
        union all
        select 1
        from makeup_feedback_reports
        where uploaded_media_id = any($1::uuid[])
        union all
        select 1
        from makeup_recommendation_assets
        where input_media_id = any($1::uuid[])
        union all
        select 1
        from product_assets
        where media_id = any($1::uuid[])
        union all
        select 1
        from community_thread_media
        where media_id = any($1::uuid[])
        union all
        select 1
        from consulting_message_media
        where media_id = any($1::uuid[])
        union all
        select 1
        from home_hero_banners
        where is_active = true
          and image_media_id = any($1::uuid[])
        union all
        select 1
        from home_trend_items
        where is_active = true
          and image_media_id = any($1::uuid[])
        union all
        select 1
        from home_filter_store_items
        where is_active = true
          and image_media_id = any($1::uuid[])
        union all
        select 1
        from home_recommended_looks
        where is_active = true
          and image_media_id = any($1::uuid[])
        union all
        select 1
        from photo_captures pc
        where pc.media_id = any($1::uuid[])
          and (
            exists (
              select 1
              from analysis_reports ar
              where ar.photo_capture_id = pc.id
                and ar.deleted_at is null
                and ($2::uuid is null or ar.id <> $2::uuid)
            )
            or exists (
              select 1
              from filter_extraction_reports fer
              where fer.photo_capture_id = pc.id
            )
            or exists (
              select 1
              from makeup_feedback_reports mfr
              where mfr.photo_capture_id = pc.id
            )
          )
      )
      """,
      media_id_values,
      excluding_report_id,
    )

    if referenced_by_media_id:
      return True

  referenced_by_payload = await connection.fetchval(
    """
    select exists (
      select 1
      from analysis_reports
      where deleted_at is null
        and ($1::uuid is null or id <> $1::uuid)
        and position($2 in coalesce(detail_payload::text, '')) > 0
      union all
      select 1
      from saved_makeup_styles
      where archived_at is null
        and position($2 in coalesce(style_payload::text, '')) > 0
      union all
      select 1
      from product_recommendation_runs
      where position($2 in coalesce(recommendation_payload::text, '')) > 0
      union all
      select 1
      from ar_filters
      where position($2 in coalesce(filter_payload::text, '')) > 0
      union all
      select 1
      from filter_extraction_reports
      where position($2 in coalesce(result_payload::text, '')) > 0
      union all
      select 1
      from makeup_feedback_reports
      where position($2 in coalesce(feedback_payload::text, '')) > 0
      union all
      select 1
      from home_filter_store_items
      where is_active = true
        and position($2 in coalesce(target_payload::text, '')) > 0
      union all
      select 1
      from home_recommended_looks
      where is_active = true
        and position($2 in coalesce(target_payload::text, '')) > 0
    )
    """,
    excluding_report_id,
    object_key,
  )

  return bool(referenced_by_payload)


async def process_media_deletion_outbox_items(
  db: Database,
  settings: Settings,
  outbox_ids: Iterable[UUID],
) -> None:
  if db.pool is None:
    return

  outbox_id_list = list(dict.fromkeys(outbox_ids))
  outbox_id_list.extend(
    await fetch_due_media_deletion_outbox_ids(
      db,
      excluding_ids=outbox_id_list,
      limit=max(0, 20 - len(outbox_id_list)),
    ),
  )

  for outbox_id in outbox_id_list:
    try:
      await process_media_deletion_outbox_item(db, settings, outbox_id)
    except Exception:  # noqa: BLE001 - outbox state records per-item failures.
      logger.exception(
        "[aura:media-deletion] outbox:item-crashed outboxId=%s",
        outbox_id,
      )


async def fetch_due_media_deletion_outbox_ids(
  db: Database,
  *,
  excluding_ids: list[UUID],
  limit: int,
) -> list[UUID]:
  if db.pool is None or limit <= 0:
    return []

  async with db.pool.acquire() as connection:
    rows = await connection.fetch(
      """
      select id
      from media_deletion_outbox
      where status in ('pending', 'failed', 'blocked')
        and next_attempt_at <= now()
        and not (id = any($1::uuid[]))
      order by created_at
      limit $2
      """,
      excluding_ids,
      limit,
    )

  return [row["id"] for row in rows]


async def process_media_deletion_outbox_item(
  db: Database,
  settings: Settings,
  outbox_id: UUID,
) -> None:
  if db.pool is None:
    return

  async with db.pool.acquire() as connection:
    outbox = await connection.fetchrow(
      """
      update media_deletion_outbox
      set status = 'processing',
          attempts = attempts + 1,
          locked_at = now(),
          updated_at = now()
      where id = $1
        and status in ('pending', 'failed', 'blocked')
        and next_attempt_at <= now()
      returning *
      """,
      outbox_id,
    )

  if not outbox:
    return

  bucket = outbox["bucket"]
  object_key = outbox["object_key"]
  report_id = outbox["report_id"]

  try:
    async with db.pool.acquire() as connection:
      referenced = await is_media_object_referenced(
        connection,
        bucket=bucket,
        object_key=object_key,
        excluding_report_id=report_id,
      )

    if referenced:
      await mark_media_deletion_outbox_blocked(
        db,
        outbox_id,
        "MEDIA_OBJECT_STILL_REFERENCED",
      )
      return

    s3 = S3Service(settings)
    permanently_delete = (
      is_private_hair_object_key(object_key)
      or is_private_golden_mask_object_key(object_key)
      or is_private_user_media_object_key(object_key)
      or is_makeup_recommendation_object_key(object_key, settings)
    )
    delete = s3.delete_object_permanently if permanently_delete else s3.delete_object
    delete(bucket=bucket, object_key=object_key)

    async with db.pool.acquire() as connection:
      async with connection.transaction():
        await connection.execute(
          """
          update media_assets
          set status = 'deleted',
              deleted_at = coalesce(deleted_at, now())
          where bucket = $1
            and object_key = $2
            and deleted_at is null
          """,
          bucket,
          object_key,
        )
        await connection.execute(
          """
          update media_deletion_outbox
          set status = 'completed',
              processed_at = now(),
              last_error = null,
              updated_at = now()
          where id = $1
          """,
          outbox_id,
        )
  except Exception as exc:  # noqa: BLE001 - persist retry metadata.
    logger.warning(
      "[aura:media-deletion] s3-delete:failed outboxId=%s location=%s reason=%s",
      outbox_id,
      media_location_log_token(bucket=str(bucket), object_key=str(object_key)),
      exc.__class__.__name__,
    )
    await mark_media_deletion_outbox_failed(db, outbox_id, exc.__class__.__name__)


async def mark_media_deletion_outbox_blocked(
  db: Database,
  outbox_id: UUID,
  reason: str,
) -> None:
  if db.pool is None:
    return

  async with db.pool.acquire() as connection:
    async with connection.transaction():
      outbox = await connection.fetchrow(
        """
        select bucket, object_key
        from media_deletion_outbox
        where id = $1
        for update
        """,
        outbox_id,
      )
      if outbox is None:
        return

      # A reference won the race or was discovered after enqueue.  Restore the
      # delivery eligibility that enqueue revoked before exposing the object
      # through any owner-scoped read path again.
      await connection.execute(
        """
        update media_assets
        set status = 'active'
        where bucket = $1
          and object_key = $2
          and status = 'deletion_pending'
          and deleted_at is null
        """,
        outbox["bucket"],
        outbox["object_key"],
      )
      await connection.execute(
        """
        update media_deletion_outbox
        set status = 'blocked',
            last_error = $2,
            next_attempt_at = now() + interval '1 hour',
            updated_at = now()
        where id = $1
        """,
        outbox_id,
        reason,
      )


async def mark_media_deletion_outbox_failed(
  db: Database,
  outbox_id: UUID,
  message: str,
) -> None:
  if db.pool is None:
    return

  async with db.pool.acquire() as connection:
    await connection.execute(
      """
      update media_deletion_outbox
      set status = 'failed',
          last_error = $2,
          next_attempt_at = $3::timestamptz + (least(attempts, 6) * interval '5 minutes'),
          updated_at = now()
      where id = $1
      """,
      outbox_id,
      message,
      datetime.now(timezone.utc),
    )
