from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlparse
from uuid import UUID

import boto3

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.media_uploads import SENSITIVE_UPLOAD_MAX_BYTES, sanitize_sensitive_image
from app.services.s3 import PRIVATE_USER_MEDIA_OBJECT_PREFIX, S3Service


MEDIA_ASSET_RESOURCE = "media_asset"
MAKEUP_RECOMMENDATION_ASSET_RESOURCE = "makeup_recommendation_asset"
LEGACY_SENSITIVE_MEDIA_KINDS = (
  "capture",
  "face-analysis-source",
  "filter-extraction",
  "makeup_feedback",
  "analysis-preview",
)
LEGACY_IMAGE_CONTENT_TYPES = frozenset(
  {"image/heic", "image/heif", "image/jpeg", "image/jpg", "image/png", "image/webp"},
)
MIGRATABLE_STATUSES = frozenset({"planned", "copied", "failed"})
VERIFIABLE_STATUSES = frozenset({"switched", "verified"})
ROLLBACK_STATUSES = frozenset(
  {"copied", "switched", "verified", "failed", "rollback_pending"},
)


class MigrationObjectStore(Protocol):
  def private_media_bucket(self) -> str: ...

  def get_object_bytes(
    self,
    *,
    bucket: str,
    object_key: str,
    max_bytes: int | None = None,
  ) -> tuple[bytes, str]: ...

  def get_object_identity(self, *, bucket: str, object_key: str) -> dict[str, str | None]: ...

  def put_private_object(
    self,
    *,
    bucket: str,
    object_key: str,
    body: bytes,
    content_type: str,
    tags: dict[str, str] | None = None,
  ) -> None: ...

  def delete_object_permanently(self, *, bucket: str, object_key: str) -> None: ...


class InvalidationVerifier(Protocol):
  def require_completed(
    self,
    *,
    distribution_id: str,
    invalidation_id: str,
    expected_paths: tuple[str, ...],
  ) -> None: ...


class CloudFrontInvalidationVerifier:
  def __init__(self, settings: Settings) -> None:
    session = (
      boto3.Session(profile_name=settings.aws_profile_name)
      if settings.aws_profile_name
      else boto3.Session()
    )
    kwargs: dict[str, str] = {}
    if settings.aws_access_key_id and settings.aws_secret_access_key:
      kwargs.update(
        {
          "aws_access_key_id": settings.aws_access_key_id,
          "aws_secret_access_key": settings.aws_secret_access_key,
        },
      )
    self._client = session.client("cloudfront", **kwargs)
    self._expected_cdn_host = urlparse(settings.effective_cdn_base_url or "").hostname

  def require_completed(
    self,
    *,
    distribution_id: str,
    invalidation_id: str,
    expected_paths: tuple[str, ...],
  ) -> None:
    if self._expected_cdn_host:
      distribution = (self._client.get_distribution(Id=distribution_id).get("Distribution") or {})
      config = distribution.get("DistributionConfig") or {}
      distribution_hosts = {
        str(distribution.get("DomainName") or "").lower(),
        *(str(alias).lower() for alias in ((config.get("Aliases") or {}).get("Items") or [])),
      }
      if self._expected_cdn_host.lower() not in distribution_hosts:
        raise RuntimeError("CloudFront distribution does not match the configured legacy CDN host.")
    response = self._client.get_invalidation(
      DistributionId=distribution_id,
      Id=invalidation_id,
    )
    invalidation = response.get("Invalidation") or {}
    if invalidation.get("Status") != "Completed":
      raise RuntimeError("CloudFront invalidation is not completed.")
    invalidated_paths = set(
      ((invalidation.get("InvalidationBatch") or {}).get("Paths") or {}).get("Items") or [],
    )
    missing = sorted(set(expected_paths) - invalidated_paths)
    if missing:
      raise RuntimeError(
        f"CloudFront invalidation does not cover {len(missing)} required legacy path(s).",
      )


@dataclass(frozen=True)
class MigrationCandidate:
  resource_type: str
  resource_id: UUID
  owner_user_id: UUID
  media_kind: str
  source_bucket: str
  source_object_key: str
  source_cdn_url: str | None
  source_state: dict[str, Any]
  byte_size: int | None = None


@dataclass(frozen=True)
class MigrationSkip:
  resource_type: str
  resource_id: str
  reason: str


@dataclass(frozen=True)
class MigrationPlan:
  candidates: tuple[MigrationCandidate, ...]
  skipped: tuple[MigrationSkip, ...]

  @property
  def total_bytes(self) -> int:
    return sum(candidate.byte_size or 0 for candidate in self.candidates)


@dataclass(frozen=True)
class BatchResult:
  batch_id: UUID
  attempted: int
  succeeded: int
  failed: int
  skipped: int = 0


def _json_object(value: object) -> dict[str, Any]:
  if isinstance(value, dict):
    return dict(value)
  if isinstance(value, str) and value.strip():
    try:
      parsed = json.loads(value)
    except json.JSONDecodeError:
      return {}
    return dict(parsed) if isinstance(parsed, dict) else {}
  return {}


def _json_array(value: object) -> list[dict[str, Any]]:
  parsed: object = value
  if isinstance(value, str) and value.strip():
    try:
      parsed = json.loads(value)
    except json.JSONDecodeError:
      return []
  if not isinstance(parsed, list):
    return []
  return [dict(item) for item in parsed if isinstance(item, dict)]


def _serialize_json(value: dict[str, Any]) -> str:
  return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _resolve_owner(
  declared_owner: object,
  reference_owner_ids: object,
) -> tuple[UUID | None, str | None]:
  owners: set[UUID] = set()
  if declared_owner:
    owners.add(UUID(str(declared_owner)))
  if isinstance(reference_owner_ids, (list, tuple)):
    for owner in reference_owner_ids:
      if owner:
        owners.add(UUID(str(owner)))
  if len(owners) == 1:
    return next(iter(owners)), None
  if not owners:
    return None, "owner_missing"
  return None, "owner_conflict"


def _source_state_for_media_asset(row: dict[str, Any]) -> dict[str, Any]:
  state = {
    key: row.get(key)
    for key in (
      "owner_user_id",
      "bucket",
      "object_key",
      "cdn_url",
      "thumbnail_bucket",
      "thumbnail_object_key",
      "thumbnail_cdn_url",
      "thumbnail_content_type",
      "thumbnail_byte_size",
      "thumbnail_width",
      "thumbnail_height",
      "content_type",
      "byte_size",
      "width",
      "height",
      "checksum_sha256",
    )
  }
  state["completed_upload_sessions"] = _json_array(row.get("completed_upload_sessions"))
  return state


def _source_state_for_recommendation_asset(row: dict[str, Any]) -> dict[str, Any]:
  return {
    key: row.get(key)
    for key in (
      "storage_bucket",
      "object_key",
      "image_url",
      "content_type",
      "is_private",
    )
  }


async def _fetch_legacy_media_asset_rows(
  connection: Any,
  *,
  private_bucket: str,
  limit: int,
) -> list[dict[str, Any]]:
  rows = await connection.fetch(
    """
    select media.*,
      ownership.reference_owner_ids,
      upload_snapshot.completed_upload_sessions
    from media_assets media
    left join lateral (
      select array_agg(distinct owner_id) as reference_owner_ids
      from (
        select upload.owner_user_id as owner_id
        from media_upload_sessions upload
        where upload.media_asset_id = media.id
        union
        select capture.user_id
        from photo_captures capture
        where capture.media_id = media.id
        union
        select report.user_id
        from analysis_reports report
        where report.deleted_at is null
          and media.id in (report.source_media_id, report.preview_media_id)
        union
        select report.user_id
        from filter_extraction_reports report
        where report.result_media_id = media.id
        union
        select report.user_id
        from makeup_feedback_reports report
        where report.uploaded_media_id = media.id
      ) owner_refs
      where owner_id is not null
    ) ownership on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', upload.id,
          'bucket', upload.bucket,
          'object_key', upload.object_key,
          'cdn_url', upload.cdn_url,
          'content_type', upload.content_type,
          'expected_byte_size', upload.expected_byte_size,
          'width', upload.width,
          'height', upload.height,
          'thumbnail_bucket', upload.thumbnail_bucket,
          'thumbnail_object_key', upload.thumbnail_object_key,
          'thumbnail_cdn_url', upload.thumbnail_cdn_url,
          'thumbnail_content_type', upload.thumbnail_content_type,
          'thumbnail_expected_byte_size', upload.thumbnail_expected_byte_size,
          'thumbnail_width', upload.thumbnail_width,
          'thumbnail_height', upload.thumbnail_height
        ) order by upload.id
      ) as completed_upload_sessions
      from media_upload_sessions upload
      where upload.media_asset_id = media.id and upload.status = 'completed'
    ) upload_snapshot on true
    where media.media_kind = any($1::text[])
      and media.status = 'active'
      and media.deleted_at is null
      and media.bucket is not null
      and media.object_key is not null
      and not exists (
        select 1
        from private_media_migration_items migration
        where migration.resource_type = 'media_asset'
          and migration.resource_id = media.id
          and migration.status = 'rolled_back'
      )
      and (
        media.bucket <> $2
        or media.object_key not like $3
        or media.cdn_url is not null
        or media.thumbnail_cdn_url is not null
      )
    order by media.created_at, media.id
    limit $4
    """,
    list(LEGACY_SENSITIVE_MEDIA_KINDS),
    private_bucket,
    f"{PRIVATE_USER_MEDIA_OBJECT_PREFIX}%",
    limit,
  )
  return [dict(row) for row in rows]


async def _fetch_legacy_recommendation_asset_rows(
  connection: Any,
  *,
  private_bucket: str,
  limit: int,
) -> list[dict[str, Any]]:
  rows = await connection.fetch(
    """
    select asset.*, report.user_id as owner_user_id
    from makeup_recommendation_assets asset
    join makeup_recommendation_reports report on report.id = asset.report_id
    where asset.is_private = true
      and asset.status = 'completed'
      and asset.storage_bucket is not null
      and asset.object_key is not null
      and not exists (
        select 1
        from private_media_migration_items migration
        where migration.resource_type = 'makeup_recommendation_asset'
          and migration.resource_id = asset.id
          and migration.status = 'rolled_back'
      )
      and (
        asset.storage_bucket <> $1
        or asset.object_key not like $2
        or asset.image_url is not null
      )
    order by asset.created_at, asset.id
    limit $3
    """,
    private_bucket,
    f"{PRIVATE_USER_MEDIA_OBJECT_PREFIX}%",
    limit,
  )
  return [dict(row) for row in rows]


async def plan_private_media_migration(
  connection: Any,
  settings: Settings,
  *,
  limit: int = 500,
  include_personalized_recommendations: bool = True,
) -> MigrationPlan:
  if limit <= 0:
    raise ValueError("limit must be positive")
  private_bucket = S3Service(settings).private_media_bucket()
  candidates: list[MigrationCandidate] = []
  skipped: list[MigrationSkip] = []

  media_rows = await _fetch_legacy_media_asset_rows(
    connection,
    private_bucket=private_bucket,
    # Invalid legacy ownership rows are reported but not migrated. Scan a
    # wider bounded window so a small group of bad rows cannot consume every
    # operational batch forever.
    limit=max(limit * 10, 1_000),
  )
  for row in media_rows:
    if len(candidates) >= limit:
      break
    owner, owner_error = _resolve_owner(row.get("owner_user_id"), row.get("reference_owner_ids"))
    if owner is None:
      skipped.append(
        MigrationSkip(MEDIA_ASSET_RESOURCE, str(row["id"]), owner_error or "owner_invalid"),
      )
      continue
    candidates.append(
      MigrationCandidate(
        resource_type=MEDIA_ASSET_RESOURCE,
        resource_id=UUID(str(row["id"])),
        owner_user_id=owner,
        media_kind=str(row["media_kind"]),
        source_bucket=str(row["bucket"]),
        source_object_key=str(row["object_key"]),
        source_cdn_url=str(row["cdn_url"]) if row.get("cdn_url") else None,
        source_state=_source_state_for_media_asset(row),
        byte_size=int(row["byte_size"]) if row.get("byte_size") is not None else None,
      ),
    )

  remaining = max(0, limit - len(candidates))
  if include_personalized_recommendations and remaining:
    recommendation_rows = await _fetch_legacy_recommendation_asset_rows(
      connection,
      private_bucket=private_bucket,
      limit=remaining,
    )
    for row in recommendation_rows:
      if not row.get("owner_user_id"):
        skipped.append(
          MigrationSkip(MAKEUP_RECOMMENDATION_ASSET_RESOURCE, str(row["id"]), "owner_missing"),
        )
        continue
      candidates.append(
        MigrationCandidate(
          resource_type=MAKEUP_RECOMMENDATION_ASSET_RESOURCE,
          resource_id=UUID(str(row["id"])),
          owner_user_id=UUID(str(row["owner_user_id"])),
          media_kind="personalized-makeup-recommendation",
          source_bucket=str(row["storage_bucket"]),
          source_object_key=str(row["object_key"]),
          source_cdn_url=str(row["image_url"]) if row.get("image_url") else None,
          source_state=_source_state_for_recommendation_asset(row),
          byte_size=None,
        ),
      )

  return MigrationPlan(tuple(candidates), tuple(skipped))


def _safe_path_component(value: str) -> str:
  normalized = re.sub(r"[^a-z0-9_-]+", "-", value.strip().lower()).strip("-")
  return normalized or "media"


def target_object_key(candidate: MigrationCandidate, checksum_sha256: str) -> str:
  return (
    f"{PRIVATE_USER_MEDIA_OBJECT_PREFIX}users/{candidate.owner_user_id}/"
    f"{_safe_path_component(candidate.media_kind)}/legacy/"
    f"{candidate.resource_type}/{candidate.resource_id}/{checksum_sha256}.jpg"
  )


async def _ensure_ledger_item(
  connection: Any,
  *,
  batch_id: UUID,
  candidate: MigrationCandidate,
) -> dict[str, Any]:
  inserted = await connection.fetchrow(
    """
    insert into private_media_migration_items (
      batch_id, resource_type, resource_id, owner_user_id, media_kind,
      source_bucket, source_object_key, source_cdn_url, source_state
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    on conflict (resource_type, resource_id) do nothing
    returning *
    """,
    batch_id,
    candidate.resource_type,
    candidate.resource_id,
    candidate.owner_user_id,
    candidate.media_kind,
    candidate.source_bucket,
    candidate.source_object_key,
    candidate.source_cdn_url,
    _serialize_json(candidate.source_state),
  )
  if inserted is not None:
    return dict(inserted)
  existing = await connection.fetchrow(
    """
    select * from private_media_migration_items
    where resource_type = $1 and resource_id = $2
    """,
    candidate.resource_type,
    candidate.resource_id,
  )
  if existing is None:
    raise RuntimeError("Migration ledger item could not be created or loaded.")
  existing_item = dict(existing)
  if UUID(str(existing_item["batch_id"])) != batch_id:
    raise RuntimeError(
      "This resource already belongs to another migration batch; resume with its original batch id.",
    )
  immutable_matches = (
    str(existing_item["owner_user_id"]) == str(candidate.owner_user_id)
    and existing_item["media_kind"] == candidate.media_kind
    and existing_item["source_bucket"] == candidate.source_bucket
    and existing_item["source_object_key"] == candidate.source_object_key
  )
  if not immutable_matches:
    raise RuntimeError("Migration candidate changed after it was added to the batch ledger.")
  return existing_item


async def _mark_failed(connection: Any, item_id: UUID, error: Exception) -> None:
  await connection.execute(
    """
    update private_media_migration_items
    set status = 'failed', last_error = $2, updated_at = now()
    where id = $1 and status in ('planned', 'copied', 'failed')
    """,
    item_id,
    f"{error.__class__.__name__}: {error}"[:500],
  )


async def _record_error(connection: Any, item_id: UUID, error: Exception) -> None:
  await connection.execute(
    """
    update private_media_migration_items
    set last_error = $2, updated_at = now()
    where id = $1 and status not in ('completed', 'rolled_back')
    """,
    item_id,
    f"{error.__class__.__name__}: {error}"[:500],
  )


async def _switch_media_asset(
  connection: Any,
  *,
  item: dict[str, Any],
  target_bucket: str,
  target_key: str,
  checksum: str,
  content_type: str,
  byte_size: int,
  width: int,
  height: int,
) -> None:
  resource_id = item["resource_id"]
  current = await connection.fetchrow(
    "select * from media_assets where id = $1 for update",
    resource_id,
  )
  if current is None:
    raise RuntimeError("Media asset disappeared before cutover.")
  current = dict(current)
  source_state = _json_object(item.get("source_state"))
  already_switched = current.get("bucket") == target_bucket and current.get("object_key") == target_key
  if not already_switched:
    drift_fields = (
      "owner_user_id",
      "bucket",
      "object_key",
      "cdn_url",
      "thumbnail_bucket",
      "thumbnail_object_key",
      "thumbnail_cdn_url",
      "thumbnail_content_type",
      "thumbnail_byte_size",
      "thumbnail_width",
      "thumbnail_height",
      "content_type",
      "byte_size",
      "width",
      "height",
      "checksum_sha256",
    )
    for field in drift_fields:
      expected = source_state.get(field)
      actual = current.get(field)
      if field == "owner_user_id":
        expected = str(expected) if expected is not None else None
        actual = str(actual) if actual is not None else None
      if actual != expected:
        raise RuntimeError(f"Media asset {field} changed after migration planning.")
    if current.get("media_kind") != item["media_kind"]:
      raise RuntimeError("Media asset kind changed after migration planning.")
  if not already_switched:
    await connection.execute(
      """
      update media_assets
      set owner_user_id = $2,
          bucket = $3,
          object_key = $4,
          cdn_url = null,
          thumbnail_bucket = null,
          thumbnail_object_key = null,
          thumbnail_cdn_url = null,
          thumbnail_content_type = null,
          thumbnail_byte_size = null,
          thumbnail_width = null,
          thumbnail_height = null,
          content_type = $5,
          byte_size = $6,
          width = $7,
          height = $8,
          checksum_sha256 = $9
      where id = $1
      """,
      resource_id,
      item["owner_user_id"],
      target_bucket,
      target_key,
      content_type,
      byte_size,
      width,
      height,
      checksum,
    )
    await connection.execute(
      """
      update media_upload_sessions
      set bucket = $2,
          object_key = $3,
          cdn_url = null,
          content_type = $4,
          expected_byte_size = $5,
          width = $6,
          height = $7,
          thumbnail_bucket = null,
          thumbnail_object_key = null,
          thumbnail_cdn_url = null,
          thumbnail_content_type = null,
          thumbnail_expected_byte_size = null,
          thumbnail_width = null,
          thumbnail_height = null
      where media_asset_id = $1 and status = 'completed'
      """,
      resource_id,
      target_bucket,
      target_key,
      content_type,
      byte_size,
      width,
      height,
    )


async def _switch_recommendation_asset(
  connection: Any,
  *,
  item: dict[str, Any],
  target_bucket: str,
  target_key: str,
  content_type: str,
) -> None:
  current = await connection.fetchrow(
    """
    select asset.*, report.user_id as owner_user_id
    from makeup_recommendation_assets asset
    join makeup_recommendation_reports report on report.id = asset.report_id
    where asset.id = $1
    for update of asset
    """,
    item["resource_id"],
  )
  if current is None:
    raise RuntimeError("Recommendation asset disappeared before cutover.")
  current = dict(current)
  if str(current["owner_user_id"]) != str(item["owner_user_id"]):
    raise RuntimeError("Recommendation asset owner changed after migration planning.")
  source_state = _json_object(item.get("source_state"))
  already_switched = (
    current.get("storage_bucket") == target_bucket and current.get("object_key") == target_key
  )
  if not already_switched:
    for field in ("storage_bucket", "object_key", "image_url", "content_type", "is_private"):
      if current.get(field) != source_state.get(field):
        raise RuntimeError(f"Recommendation asset {field} changed after migration planning.")
  if not already_switched:
    await connection.execute(
      """
      update makeup_recommendation_assets
      set storage_bucket = $2,
          object_key = $3,
          image_url = null,
          content_type = $4,
          is_private = true,
          updated_at = now()
      where id = $1
      """,
      item["resource_id"],
      target_bucket,
      target_key,
      content_type,
    )


async def migrate_candidate(
  connection: Any,
  settings: Settings,
  *,
  batch_id: UUID,
  candidate: MigrationCandidate,
  object_store: MigrationObjectStore | None = None,
) -> str:
  store = object_store or S3Service(settings)
  item = await _ensure_ledger_item(connection, batch_id=batch_id, candidate=candidate)
  status = str(item["status"])
  if status in {"switched", "verified", "cleanup_pending", "completed"}:
    return status
  if status == "rolled_back":
    raise RuntimeError("Rolled-back items require a new resource version before remigration.")
  if status not in MIGRATABLE_STATUSES:
    raise RuntimeError(f"Unsupported migration state: {status}")

  item_id = UUID(str(item["id"]))
  await connection.execute(
    """
    update private_media_migration_items
    set attempts = attempts + 1, last_error = null, updated_at = now()
    where id = $1
    """,
    item_id,
  )
  try:
    source_identity_before = store.get_object_identity(
      bucket=str(item["source_bucket"]),
      object_key=str(item["source_object_key"]),
    )
    if source_identity_before.get("exists") == "false":
      raise RuntimeError("Legacy source object is missing before migration.")
    source_bytes, source_content_type = store.get_object_bytes(
      bucket=str(item["source_bucket"]),
      object_key=str(item["source_object_key"]),
      max_bytes=SENSITIVE_UPLOAD_MAX_BYTES,
    )
    source_identity_after = store.get_object_identity(
      bucket=str(item["source_bucket"]),
      object_key=str(item["source_object_key"]),
    )
    if source_identity_after.get("exists") == "false":
      raise RuntimeError("Legacy source object disappeared while it was being copied.")
    if source_identity_before != source_identity_after:
      raise RuntimeError("Legacy source changed while it was being copied.")
    source_state = _json_object(item.get("source_state"))
    normalized_s3_content_type = source_content_type.split(";", 1)[0].strip().lower()
    normalized_db_content_type = str(source_state.get("content_type") or "").split(";", 1)[0].strip().lower()
    expected_content_type = (
      normalized_s3_content_type
      if normalized_s3_content_type in LEGACY_IMAGE_CONTENT_TYPES
      else normalized_db_content_type
    )
    if expected_content_type not in LEGACY_IMAGE_CONTENT_TYPES:
      raise RuntimeError("Legacy source has no reviewed image content type.")
    sanitized = sanitize_sensitive_image(
      source_bytes,
      expected_content_type=expected_content_type,
    )
    source_checksum = hashlib.sha256(source_bytes).hexdigest()
    expected_source_checksum = str(source_state.get("checksum_sha256") or "").strip().lower()
    if expected_source_checksum and expected_source_checksum != source_checksum:
      raise RuntimeError("Legacy source checksum does not match the database record.")
    target_checksum = hashlib.sha256(sanitized.body).hexdigest()
    target_bucket = store.private_media_bucket()
    ledger_candidate = MigrationCandidate(
      resource_type=str(item["resource_type"]),
      resource_id=UUID(str(item["resource_id"])),
      owner_user_id=UUID(str(item["owner_user_id"])),
      media_kind=str(item["media_kind"]),
      source_bucket=str(item["source_bucket"]),
      source_object_key=str(item["source_object_key"]),
      source_cdn_url=str(item["source_cdn_url"]) if item.get("source_cdn_url") else None,
      source_state=source_state,
    )
    target_key = target_object_key(ledger_candidate, target_checksum)
    await connection.execute(
      """
      update private_media_migration_items
      set target_bucket = $2,
          target_object_key = $3,
          source_checksum_sha256 = $4,
          source_etag = $5,
          source_version_id = $6,
          target_checksum_sha256 = $7,
          updated_at = now()
      where id = $1 and status in ('planned', 'copied', 'failed')
      """,
      item_id,
      target_bucket,
      target_key,
      source_checksum,
      source_identity_after.get("etag"),
      source_identity_after.get("version_id"),
      target_checksum,
    )
    store.put_private_object(
      bucket=target_bucket,
      object_key=target_key,
      body=sanitized.body,
      content_type=sanitized.content_type,
      tags={
        "aura-migration-batch": str(batch_id),
        "aura-resource-id": str(candidate.resource_id),
        "aura-source-checksum": source_checksum,
      },
    )
    target_bytes, _ = store.get_object_bytes(
      bucket=target_bucket,
      object_key=target_key,
      max_bytes=SENSITIVE_UPLOAD_MAX_BYTES,
    )
    if hashlib.sha256(target_bytes).hexdigest() != target_checksum:
      raise RuntimeError("Private target checksum verification failed.")
    await connection.execute(
      """
      update private_media_migration_items
      set target_bucket = $2,
          target_object_key = $3,
          source_checksum_sha256 = $4,
          source_etag = $5,
          source_version_id = $6,
          target_checksum_sha256 = $7,
          status = 'copied',
          copied_at = coalesce(copied_at, now()),
          updated_at = now()
      where id = $1
      """,
      item_id,
      target_bucket,
      target_key,
      source_checksum,
      source_identity_after.get("etag"),
      source_identity_after.get("version_id"),
      target_checksum,
    )

    async with connection.transaction():
      refreshed = await connection.fetchrow(
        "select * from private_media_migration_items where id = $1 for update",
        item_id,
      )
      if refreshed is None:
        raise RuntimeError("Migration ledger item disappeared before cutover.")
      item = dict(refreshed)
      if item["status"] in {"switched", "verified", "cleanup_pending", "completed"}:
        return str(item["status"])
      if item["status"] != "copied":
        raise RuntimeError(f"Migration item is not cutover-safe: {item['status']}")
      if item["resource_type"] == MEDIA_ASSET_RESOURCE:
        await _switch_media_asset(
          connection,
          item=item,
          target_bucket=target_bucket,
          target_key=target_key,
          checksum=target_checksum,
          content_type=sanitized.content_type,
          byte_size=len(sanitized.body),
          width=sanitized.width,
          height=sanitized.height,
        )
      else:
        await _switch_recommendation_asset(
          connection,
          item=item,
          target_bucket=target_bucket,
          target_key=target_key,
          content_type=sanitized.content_type,
        )
      await connection.execute(
        """
        update private_media_migration_items
        set status = 'switched', switched_at = coalesce(switched_at, now()), updated_at = now()
        where id = $1
        """,
        item_id,
      )
    return "switched"
  except Exception as error:
    await _mark_failed(connection, item_id, error)
    raise


async def execute_private_media_migration(
  connection: Any,
  settings: Settings,
  *,
  batch_id: UUID,
  plan: MigrationPlan,
  object_store: MigrationObjectStore | None = None,
) -> BatchResult:
  succeeded = 0
  failed = 0
  for candidate in plan.candidates:
    try:
      await migrate_candidate(
        connection,
        settings,
        batch_id=batch_id,
        candidate=candidate,
        object_store=object_store,
      )
      succeeded += 1
    except Exception:  # each ledger item records its own retryable failure.
      failed += 1
  return BatchResult(
    batch_id=batch_id,
    attempted=len(plan.candidates),
    succeeded=succeeded,
    failed=failed,
    skipped=len(plan.skipped),
  )


async def _batch_items(connection: Any, batch_id: UUID, statuses: set[str]) -> list[dict[str, Any]]:
  rows = await connection.fetch(
    """
    select * from private_media_migration_items
    where batch_id = $1 and status = any($2::text[])
    order by created_at, id
    """,
    batch_id,
    sorted(statuses),
  )
  return [dict(row) for row in rows]


async def _require_batch_statuses(
  connection: Any,
  batch_id: UUID,
  *,
  allowed: set[str],
  operation: str,
) -> dict[str, int]:
  rows = await connection.fetch(
    """
    select status, count(*)::integer as item_count
    from private_media_migration_items
    where batch_id = $1
    group by status
    """,
    batch_id,
  )
  counts = {str(row["status"]): int(row["item_count"]) for row in rows}
  if not counts:
    raise RuntimeError(f"Cannot {operation} an unknown or empty migration batch.")
  unexpected = sorted(set(counts) - allowed)
  if unexpected:
    raise RuntimeError(
      f"Cannot {operation} a partial batch with pending states: {', '.join(unexpected)}.",
    )
  return counts


async def _resource_matches_target(connection: Any, item: dict[str, Any]) -> bool:
  if item["resource_type"] == MEDIA_ASSET_RESOURCE:
    row = await connection.fetchrow(
      "select owner_user_id, bucket, object_key, cdn_url, thumbnail_cdn_url from media_assets where id = $1",
      item["resource_id"],
    )
    return bool(
      row
      and str(row["owner_user_id"]) == str(item["owner_user_id"])
      and row["bucket"] == item["target_bucket"]
      and row["object_key"] == item["target_object_key"]
      and row["cdn_url"] is None
      and row["thumbnail_cdn_url"] is None
    )
  row = await connection.fetchrow(
    """
    select asset.storage_bucket, asset.object_key, asset.image_url, asset.is_private,
      report.user_id as owner_user_id
    from makeup_recommendation_assets asset
    join makeup_recommendation_reports report on report.id = asset.report_id
    where asset.id = $1
    """,
    item["resource_id"],
  )
  return bool(
    row
    and str(row["owner_user_id"]) == str(item["owner_user_id"])
    and row["storage_bucket"] == item["target_bucket"]
    and row["object_key"] == item["target_object_key"]
    and row["image_url"] is None
    and row["is_private"] is True
  )


async def verify_private_media_batch(
  connection: Any,
  settings: Settings,
  *,
  batch_id: UUID,
  object_store: MigrationObjectStore | None = None,
) -> BatchResult:
  store = object_store or S3Service(settings)
  await _require_batch_statuses(
    connection,
    batch_id,
    allowed={"switched", "verified"},
    operation="verify",
  )
  items = await _batch_items(connection, batch_id, set(VERIFIABLE_STATUSES))
  succeeded = 0
  failed = 0
  for item in items:
    item_id = UUID(str(item["id"]))
    try:
      if item.get("target_bucket") != store.private_media_bucket():
        raise RuntimeError("Migration target is not the configured private bucket.")
      if not str(item.get("target_object_key") or "").startswith(PRIVATE_USER_MEDIA_OBJECT_PREFIX):
        raise RuntimeError("Migration target is outside the private user-media prefix.")
      if not await _resource_matches_target(connection, item):
        raise RuntimeError("Database resource does not match the private target.")
      payload, _ = store.get_object_bytes(
        bucket=str(item["target_bucket"]),
        object_key=str(item["target_object_key"]),
        max_bytes=SENSITIVE_UPLOAD_MAX_BYTES,
      )
      if hashlib.sha256(payload).hexdigest() != item.get("target_checksum_sha256"):
        raise RuntimeError("Private target checksum changed after cutover.")
      await connection.execute(
        """
        update private_media_migration_items
        set status = 'verified', verified_at = coalesce(verified_at, now()),
            last_error = null, updated_at = now()
        where id = $1
        """,
        item_id,
      )
      succeeded += 1
    except Exception as error:
      await _record_error(connection, item_id, error)
      failed += 1
  return BatchResult(batch_id, len(items), succeeded, failed)


def cloudfront_paths_for_item(item: dict[str, Any]) -> tuple[str, ...]:
  state = _json_object(item.get("source_state"))
  paths: list[str] = []
  for value in (
    item.get("source_cdn_url"),
    state.get("cdn_url"),
    state.get("thumbnail_cdn_url"),
    state.get("image_url"),
  ):
    if not value:
      continue
    parsed = urlparse(str(value))
    if parsed.scheme in {"http", "https"} and parsed.path:
      paths.append(parsed.path if parsed.path.startswith("/") else f"/{parsed.path}")
  if item.get("source_object_key"):
    paths.append(f"/{str(item['source_object_key']).lstrip('/')}")
  thumbnail_key = state.get("thumbnail_object_key")
  if thumbnail_key:
    paths.append(f"/{str(thumbnail_key).lstrip('/')}")
  return tuple(dict.fromkeys(paths))


async def batch_cloudfront_paths(connection: Any, batch_id: UUID) -> tuple[str, ...]:
  items = await _batch_items(
    connection,
    batch_id,
    {"switched", "verified", "cleanup_pending", "completed"},
  )
  paths: list[str] = []
  for item in items:
    paths.extend(cloudfront_paths_for_item(item))
  return tuple(dict.fromkeys(paths))


async def _assert_legacy_location_unreferenced(
  connection: Any,
  *,
  bucket: str,
  object_key: str,
) -> None:
  row = await connection.fetchrow(
    """
    select exists (
      select 1
      from media_assets media
      where media.deleted_at is null
        and (
          (media.bucket = $1 and media.object_key = $2)
          or (media.thumbnail_bucket = $1 and media.thumbnail_object_key = $2)
        )
      union all
      select 1
      from media_upload_sessions upload
      where upload.status in ('pending', 'completed')
        and (
          (upload.bucket = $1 and upload.object_key = $2)
          or (upload.thumbnail_bucket = $1 and upload.thumbnail_object_key = $2)
        )
      union all
      select 1
      from makeup_recommendation_assets recommendation
      where recommendation.status = 'completed'
        and recommendation.storage_bucket = $1
        and recommendation.object_key = $2
    ) as is_referenced
    """,
    bucket,
    object_key,
  )
  if row and bool(row["is_referenced"]):
    raise RuntimeError("Legacy object is still referenced by another live database record.")


async def cleanup_private_media_batch(
  connection: Any,
  settings: Settings,
  *,
  batch_id: UUID,
  cloudfront_distribution_id: str,
  cloudfront_invalidation_id: str,
  object_store: MigrationObjectStore | None = None,
  invalidation_verifier: InvalidationVerifier | None = None,
) -> tuple[BatchResult, tuple[str, ...]]:
  if not cloudfront_distribution_id.strip():
    raise ValueError("A CloudFront distribution id is required before source deletion.")
  if not cloudfront_invalidation_id.strip():
    raise ValueError("A completed CloudFront invalidation id is required before source deletion.")
  store = object_store or S3Service(settings)
  status_counts = await _require_batch_statuses(
    connection,
    batch_id,
    allowed={"verified", "cleanup_pending", "completed"},
    operation="clean up",
  )
  invalidated_paths = list(await batch_cloudfront_paths(connection, batch_id))
  if not invalidated_paths:
    raise RuntimeError("Cleanup refused because the batch has no legacy CloudFront path manifest.")
  verifier = invalidation_verifier or CloudFrontInvalidationVerifier(settings)
  verifier.require_completed(
    distribution_id=cloudfront_distribution_id.strip(),
    invalidation_id=cloudfront_invalidation_id.strip(),
    expected_paths=tuple(invalidated_paths),
  )
  manifest_hash = hashlib.sha256("\n".join(invalidated_paths).encode("utf-8")).hexdigest()
  items = await _batch_items(connection, batch_id, {"verified", "cleanup_pending"})
  succeeded = 0
  failed = 0
  for item in items:
    item_id = UUID(str(item["id"]))
    try:
      await connection.execute(
        """
        update private_media_migration_items
        set status = 'cleanup_pending',
            cloudfront_distribution_id = $2,
            cloudfront_invalidation_id = $3,
            cloudfront_path_manifest_sha256 = $4,
            cloudfront_invalidated_at = coalesce(cloudfront_invalidated_at, now()),
            updated_at = now()
        where id = $1 and status in ('verified', 'cleanup_pending')
        """,
        item_id,
        cloudfront_distribution_id.strip(),
        cloudfront_invalidation_id.strip(),
        manifest_hash,
      )
      source_state = _json_object(item.get("source_state"))
      locations = [
        (item.get("source_bucket"), item.get("source_object_key")),
        (source_state.get("thumbnail_bucket"), source_state.get("thumbnail_object_key")),
      ]
      for bucket, object_key in dict.fromkeys(
        (str(bucket), str(object_key))
        for bucket, object_key in locations
        if bucket and object_key
      ):
        if bucket == item.get("target_bucket") and object_key == item.get("target_object_key"):
          continue
        await _assert_legacy_location_unreferenced(
          connection,
          bucket=bucket,
          object_key=object_key,
        )
        if bucket == item.get("source_bucket") and object_key == item.get("source_object_key"):
          current_identity = store.get_object_identity(bucket=bucket, object_key=object_key)
          if current_identity.get("exists") != "false" and (
            current_identity.get("etag") != item.get("source_etag")
            or current_identity.get("version_id") != item.get("source_version_id")
          ):
            raise RuntimeError("Legacy source changed after migration verification; deletion refused.")
          if current_identity.get("exists") == "false":
            continue
        store.delete_object_permanently(bucket=bucket, object_key=object_key)
      await connection.execute(
        """
        update private_media_migration_items
        set status = 'completed', cleaned_at = coalesce(cleaned_at, now()),
            last_error = null, updated_at = now()
        where id = $1
        """,
        item_id,
      )
      succeeded += 1
    except Exception as error:
      await _record_error(connection, item_id, error)
      failed += 1
  return (
    BatchResult(
      batch_id,
      len(items) + (status_counts.get("completed") or 0),
      succeeded + (status_counts.get("completed") or 0),
      failed,
      skipped=status_counts.get("completed") or 0,
    ),
    tuple(dict.fromkeys(invalidated_paths)),
  )


async def _restore_media_asset(connection: Any, item: dict[str, Any], state: dict[str, Any]) -> None:
  current = await connection.fetchrow(
    "select bucket, object_key from media_assets where id = $1 for update",
    item["resource_id"],
  )
  if current is None:
    raise RuntimeError("Media asset disappeared before rollback.")
  if current["bucket"] != item.get("target_bucket") or current["object_key"] != item.get("target_object_key"):
    raise RuntimeError("Media asset changed after migration; rollback refused.")
  restored_owner = UUID(str(state["owner_user_id"])) if state.get("owner_user_id") else None
  await connection.execute(
    """
    update media_assets
    set owner_user_id = $2,
        bucket = $3, object_key = $4, cdn_url = $5,
        thumbnail_bucket = $6, thumbnail_object_key = $7, thumbnail_cdn_url = $8,
        thumbnail_content_type = $9, thumbnail_byte_size = $10,
        thumbnail_width = $11, thumbnail_height = $12,
        content_type = $13, byte_size = $14, width = $15, height = $16,
        checksum_sha256 = $17
    where id = $1
    """,
    item["resource_id"],
    restored_owner,
    state.get("bucket"),
    state.get("object_key"),
    state.get("cdn_url"),
    state.get("thumbnail_bucket"),
    state.get("thumbnail_object_key"),
    state.get("thumbnail_cdn_url"),
    state.get("thumbnail_content_type"),
    state.get("thumbnail_byte_size"),
    state.get("thumbnail_width"),
    state.get("thumbnail_height"),
    state.get("content_type"),
    state.get("byte_size"),
    state.get("width"),
    state.get("height"),
    state.get("checksum_sha256"),
  )
  await connection.execute(
    """
    update media_upload_sessions
    set bucket = $2, object_key = $3, cdn_url = $4,
        content_type = coalesce($5, content_type), expected_byte_size = $6,
        width = $7, height = $8,
        thumbnail_bucket = $9, thumbnail_object_key = $10,
        thumbnail_cdn_url = $11, thumbnail_content_type = $12,
        thumbnail_expected_byte_size = $13,
        thumbnail_width = $14, thumbnail_height = $15
    where media_asset_id = $1 and status = 'completed'
    """,
    item["resource_id"],
    state.get("bucket"),
    state.get("object_key"),
    state.get("cdn_url"),
    state.get("content_type"),
    state.get("byte_size"),
    state.get("width"),
    state.get("height"),
    state.get("thumbnail_bucket"),
    state.get("thumbnail_object_key"),
    state.get("thumbnail_cdn_url"),
    state.get("thumbnail_content_type"),
    state.get("thumbnail_byte_size"),
    state.get("thumbnail_width"),
    state.get("thumbnail_height"),
  )


async def _restore_recommendation_asset(connection: Any, item: dict[str, Any], state: dict[str, Any]) -> None:
  current = await connection.fetchrow(
    "select storage_bucket, object_key from makeup_recommendation_assets where id = $1 for update",
    item["resource_id"],
  )
  if current is None:
    raise RuntimeError("Recommendation asset disappeared before rollback.")
  if current["storage_bucket"] != item.get("target_bucket") or current["object_key"] != item.get("target_object_key"):
    raise RuntimeError("Recommendation asset changed after migration; rollback refused.")
  await connection.execute(
    """
    update makeup_recommendation_assets
    set storage_bucket = $2, object_key = $3, image_url = $4,
        content_type = $5, is_private = $6, updated_at = now()
    where id = $1
    """,
    item["resource_id"],
    state.get("storage_bucket"),
    state.get("object_key"),
    state.get("image_url"),
    state.get("content_type"),
    bool(state.get("is_private")),
  )


async def rollback_private_media_batch(
  connection: Any,
  settings: Settings,
  *,
  batch_id: UUID,
  object_store: MigrationObjectStore | None = None,
) -> BatchResult:
  store = object_store or S3Service(settings)
  await _require_batch_statuses(
    connection,
    batch_id,
    allowed={*ROLLBACK_STATUSES, "rolled_back"},
    operation="roll back",
  )
  items = await _batch_items(connection, batch_id, set(ROLLBACK_STATUSES))
  succeeded = 0
  failed = 0
  for item in items:
    item_id = UUID(str(item["id"]))
    try:
      if item["status"] in {"switched", "verified"}:
        state = _json_object(item.get("source_state"))
        async with connection.transaction():
          locked = await connection.fetchrow(
            "select * from private_media_migration_items where id = $1 for update",
            item_id,
          )
          if locked is None or locked["status"] not in {"switched", "verified"}:
            raise RuntimeError("Migration item is no longer rollback-safe.")
          if item["resource_type"] == MEDIA_ASSET_RESOURCE:
            await _restore_media_asset(connection, item, state)
          else:
            await _restore_recommendation_asset(connection, item, state)
          await connection.execute(
            """
            update private_media_migration_items
            set status = 'rollback_pending', last_error = null, updated_at = now()
            where id = $1 and status in ('switched', 'verified')
            """,
            item_id,
          )
      elif item["status"] in {"copied", "failed"}:
        await connection.execute(
          """
          update private_media_migration_items
          set status = 'rollback_pending', last_error = null, updated_at = now()
          where id = $1 and status in ('copied', 'failed')
          """,
          item_id,
        )
      if (
        item.get("target_bucket")
        and item.get("target_object_key")
        and (
          item.get("target_bucket") != item.get("source_bucket")
          or item.get("target_object_key") != item.get("source_object_key")
        )
      ):
        store.delete_object_permanently(
          bucket=str(item["target_bucket"]),
          object_key=str(item["target_object_key"]),
        )
      await connection.execute(
        """
        update private_media_migration_items
        set status = 'rolled_back', rolled_back_at = coalesce(rolled_back_at, now()),
            last_error = null, updated_at = now()
        where id = $1 and status = 'rollback_pending'
        """,
        item_id,
      )
      succeeded += 1
    except Exception as error:
      await _record_error(connection, item_id, error)
      failed += 1
  return BatchResult(batch_id, len(items), succeeded, failed)


def build_plan_report(plan: MigrationPlan) -> dict[str, Any]:
  by_kind: dict[str, int] = {}
  by_resource: dict[str, int] = {}
  skip_reasons: dict[str, int] = {}
  for candidate in plan.candidates:
    by_kind[candidate.media_kind] = by_kind.get(candidate.media_kind, 0) + 1
    by_resource[candidate.resource_type] = by_resource.get(candidate.resource_type, 0) + 1
  for skipped in plan.skipped:
    skip_reasons[skipped.reason] = skip_reasons.get(skipped.reason, 0) + 1
  return {
    "mode": "dry-run",
    "candidateCount": len(plan.candidates),
    "knownSourceBytes": plan.total_bytes,
    "candidateKinds": dict(sorted(by_kind.items())),
    "candidateResources": dict(sorted(by_resource.items())),
    "skippedCount": len(plan.skipped),
    "skipReasons": dict(sorted(skip_reasons.items())),
  }
