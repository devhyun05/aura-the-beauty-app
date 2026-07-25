"""Safe local-to-deployed migration for every persisted, visible report type."""

from __future__ import annotations

from dataclasses import dataclass
from copy import deepcopy
from datetime import date, datetime
import base64
import hashlib
import json
from pathlib import Path
import os
import tempfile
from typing import Any, Iterable, Mapping
from uuid import UUID


class MigrationPreconditionError(RuntimeError):
  """Raised before writes when source and destination cannot be mapped safely."""


class MigrationCollisionError(MigrationPreconditionError):
  """Raised when a source UUID is already used by unrelated deployed data."""


@dataclass(frozen=True)
class S3ObjectReference:
  bucket: str
  object_key: str
  checksum_sha256: str | None = None


@dataclass(frozen=True)
class MigrationBundle:
  batch_id: str
  source_user_id: UUID
  auth_provider: str
  oauth_sub: str
  email: str
  rows: Mapping[str, tuple[dict[str, Any], ...]]
  s3_objects: tuple[S3ObjectReference, ...]
  static_references: Mapping[str, frozenset[str]] | None = None


@dataclass(frozen=True)
class DestinationState:
  user_id: UUID
  auth_provider: str
  oauth_sub: str
  email: str
  existing_rows: Mapping[str, Mapping[str, dict[str, Any]]]
  available_static_ids: Mapping[str, frozenset[str]]


@dataclass(frozen=True)
class MigrationPlan:
  batch_id: str
  destination_user_id: UUID
  insert_counts: Mapping[str, int]
  skip_counts: Mapping[str, int]


@dataclass(frozen=True)
class S3Verification:
  checked: int
  existing: int
  missing: tuple[str, ...]


@dataclass(frozen=True)
class ImportResult:
  batch_id: str
  destination_user_id: UUID
  inserted: Mapping[str, int]
  skipped: Mapping[str, int]


def stable_batch_id(
  auth_provider: str,
  oauth_sub: str,
  report_ids: list[UUID],
) -> str:
  payload = (
    f"{auth_provider}\0{oauth_sub}\0"
    + ",".join(sorted(str(report_id) for report_id in report_ids))
  ).encode()
  return "local-makeup-reports:" + hashlib.sha256(payload).hexdigest()


def _ids(rows: Iterable[Mapping[str, Any]], field: str = "id") -> set[str]:
  return {
    str(row[field])
    for row in rows
    if row.get(field) is not None
  }


def _select(
  snapshot: Mapping[str, tuple[dict[str, Any], ...]],
  table: str,
  field: str,
  allowed: set[str],
) -> tuple[dict[str, Any], ...]:
  return tuple(
    row
    for row in snapshot.get(table, ())
    if row.get(field) is not None and str(row[field]) in allowed
  )


def _require_reference(
  *,
  table: str,
  row: Mapping[str, Any],
  field: str,
  available: set[str],
) -> None:
  value = row.get(field)
  if value is not None and str(value) not in available:
    raise MigrationPreconditionError(
      f"{table}.{field} references a row outside the reviewed bundle: {value}.",
    )


def _validate_bundle_references(
  rows: Mapping[str, tuple[dict[str, Any], ...]],
) -> None:
  media_ids = _ids(rows.get("media_assets", ()))
  capture_ids = _ids(rows.get("photo_captures", ()))
  analysis_ids = _ids(rows.get("analysis_reports", ()))
  session_ids = _ids(rows.get("makeup_recommendation_sessions", ()))
  recommendation_ids = _ids(rows.get("makeup_recommendation_reports", ()))
  feedback_ids = _ids(rows.get("makeup_feedback_reports", ()))
  sessions_by_id = {
    str(row["id"]): row
    for row in rows.get("makeup_recommendation_sessions", ())
  }
  recommendations_by_id = {
    str(row["id"]): row
    for row in rows.get("makeup_recommendation_reports", ())
  }
  feedback_by_id = {
    str(row["id"]): row
    for row in rows.get("makeup_feedback_reports", ())
  }

  for row in rows.get("photo_captures", ()):
    _require_reference(
      table="photo_captures",
      row=row,
      field="media_id",
      available=media_ids,
    )
  for row in rows.get("analysis_reports", ()):
    _require_reference(
      table="analysis_reports",
      row=row,
      field="photo_capture_id",
      available=capture_ids,
    )
    for field in ("source_media_id", "preview_media_id", "golden_mask_media_id"):
      _require_reference(
        table="analysis_reports",
        row=row,
        field=field,
        available=media_ids,
      )
  for row in rows.get("analysis_stage_runs", ()):
    _require_reference(
      table="analysis_stage_runs",
      row=row,
      field="report_id",
      available=analysis_ids,
    )
  for row in rows.get("face_length_measurement_snapshots", ()):
    _require_reference(
      table="face_length_measurement_snapshots",
      row=row,
      field="report_id",
      available=analysis_ids,
    )
  for row in rows.get("filter_extraction_reports", ()):
    _require_reference(
      table="filter_extraction_reports",
      row=row,
      field="photo_capture_id",
      available=capture_ids,
    )
    _require_reference(
      table="filter_extraction_reports",
      row=row,
      field="result_media_id",
      available=media_ids,
    )
    request = _json_object(_json_object(row.get("result_payload")).get("request"))
    image_url = str(request.get("cdnUrl") or request.get("sourceUrl") or "")
    if not image_url.startswith(("https://", "http://")):
      raise MigrationPreconditionError(
        f"filter_extraction_reports {row.get('id')} has no remote report image URL.",
      )
  for row in rows.get("makeup_feedback_reports", ()):
    _require_reference(
      table="makeup_feedback_reports",
      row=row,
      field="photo_capture_id",
      available=capture_ids,
    )
    _require_reference(
      table="makeup_feedback_reports",
      row=row,
      field="uploaded_media_id",
      available=media_ids,
    )
    _require_reference(
      table="makeup_feedback_reports",
      row=row,
      field="parent_feedback_report_id",
      available=feedback_ids,
    )
    request = _json_object(_json_object(row.get("feedback_payload")).get("request"))
    image_url = str(request.get("cdnUrl") or request.get("sourceUrl") or "")
    if not image_url.startswith(("https://", "http://")):
      raise MigrationPreconditionError(
        f"makeup_feedback_reports {row.get('id')} has no remote report image URL.",
      )
    parent_id = row.get("parent_feedback_report_id")
    if parent_id is not None:
      parent = feedback_by_id[str(parent_id)]
      if (
        parent.get("status") != "completed"
        or parent.get("score") is None
        or str(parent.get("entry_date")) != str(row.get("entry_date"))
      ):
        raise MigrationPreconditionError(
          f"makeup_feedback_reports {row.get('id')} has an invalid correction parent.",
        )
  for row in rows.get("makeup_recommendation_sessions", ()):
    _require_reference(
      table="makeup_recommendation_sessions",
      row=row,
      field="analysis_report_id",
      available=analysis_ids,
    )
    _require_reference(
      table="makeup_recommendation_sessions",
      row=row,
      field="report_id",
      available=recommendation_ids,
    )
    if row.get("report_id") is not None:
      linked_report = recommendations_by_id[str(row["report_id"])]
      if str(linked_report.get("session_id") or "") != str(row["id"]):
        raise MigrationPreconditionError(
          f"makeup_recommendation_sessions {row.get('id')} has a mismatched report link.",
        )
  for row in rows.get("makeup_recommendation_reports", ()):
    _require_reference(
      table="makeup_recommendation_reports",
      row=row,
      field="session_id",
      available=session_ids,
    )
    _require_reference(
      table="makeup_recommendation_reports",
      row=row,
      field="source_analysis_report_id",
      available=analysis_ids,
    )
    _require_reference(
      table="makeup_recommendation_reports",
      row=row,
      field="parent_report_id",
      available=recommendation_ids,
    )
    if row.get("session_id") is not None:
      linked_session = sessions_by_id[str(row["session_id"])]
      if str(linked_session.get("report_id") or "") != str(row["id"]):
        raise MigrationPreconditionError(
          f"makeup_recommendation_reports {row.get('id')} has a mismatched session link.",
        )
  for row in rows.get("makeup_recommendation_assets", ()):
    _require_reference(
      table="makeup_recommendation_assets",
      row=row,
      field="report_id",
      available=recommendation_ids,
    )
    _require_reference(
      table="makeup_recommendation_assets",
      row=row,
      field="input_media_id",
      available=media_ids,
    )
  for row in rows.get("product_recommendation_runs", ()):
    _require_reference(
      table="product_recommendation_runs",
      row=row,
      field="source_analysis_report_id",
      available=analysis_ids,
    )
    _require_reference(
      table="product_recommendation_runs",
      row=row,
      field="source_makeup_report_id",
      available=recommendation_ids,
    )
    _require_reference(
      table="product_recommendation_runs",
      row=row,
      field="look_media_id",
      available=media_ids,
    )
    if row.get("source_style_id") is not None:
      raise MigrationPreconditionError(
        "product_recommendation_runs.source_style_id is not supported by this bundle.",
      )


def build_bundle_from_snapshot(
  *,
  source_user_id: UUID,
  auth_provider: str,
  oauth_sub: str,
  email: str,
  snapshot: Mapping[str, tuple[dict[str, Any], ...]],
) -> MigrationBundle:
  reports = tuple(snapshot.get("makeup_recommendation_reports", ()))
  report_ids = _ids(reports)
  visible_analyses = tuple(
    row
    for row in snapshot.get("analysis_reports", ())
    if str(row.get("status") or "") == "completed"
    and row.get("deleted_at") is None
  )
  extraction_reports = tuple(
    row
    for row in snapshot.get("filter_extraction_reports", ())
    if str(row.get("status") or "") == "completed"
  )
  feedback_reports = tuple(
    sorted(
      (
        row
        for row in snapshot.get("makeup_feedback_reports", ())
        if str(row.get("status") or "") == "completed"
        and row.get("score") is not None
      ),
      key=lambda row: (
        row.get("parent_feedback_report_id") is not None,
        str(row.get("created_at") or ""),
        str(row.get("id") or ""),
      ),
    ),
  )
  report_session_ids = _ids(reports, "session_id")
  sessions = tuple(
    row
    for row in snapshot.get("makeup_recommendation_sessions", ())
    if str(row.get("id") or "") in report_session_ids
    or str(row.get("report_id") or "") in report_ids
  )
  session_analysis_ids = _ids(sessions, "analysis_report_id")
  report_analysis_ids = _ids(reports, "source_analysis_report_id")
  analysis_ids = (
    session_analysis_ids
    | report_analysis_ids
    | _ids(visible_analyses)
  )
  analyses = _select(snapshot, "analysis_reports", "id", analysis_ids)
  capture_ids = (
    _ids(analyses, "photo_capture_id")
    | _ids(extraction_reports, "photo_capture_id")
    | _ids(feedback_reports, "photo_capture_id")
  )
  captures = _select(snapshot, "photo_captures", "id", capture_ids)
  assets = _select(
    snapshot,
    "makeup_recommendation_assets",
    "report_id",
    report_ids,
  )
  product_runs = tuple(
    row
    for row in snapshot.get("product_recommendation_runs", ())
    if (
      str(row.get("source_makeup_report_id") or "") in report_ids
      or str(row.get("source_analysis_report_id") or "") in analysis_ids
    )
  )
  media_ids = (
    _ids(analyses, "source_media_id")
    | _ids(analyses, "preview_media_id")
    | _ids(analyses, "golden_mask_media_id")
    | _ids(captures, "media_id")
    | _ids(assets, "input_media_id")
    | _ids(product_runs, "look_media_id")
    | _ids(extraction_reports, "result_media_id")
    | _ids(feedback_reports, "uploaded_media_id")
  )
  media = _select(snapshot, "media_assets", "id", media_ids)
  analysis_stages = _select(
    snapshot,
    "analysis_stage_runs",
    "report_id",
    analysis_ids,
  )
  face_snapshots = _select(
    snapshot,
    "face_length_measurement_snapshots",
    "report_id",
    analysis_ids,
  )

  rows = {
    "media_assets": media,
    "photo_captures": captures,
    "analysis_reports": analyses,
    "analysis_stage_runs": analysis_stages,
    "face_length_measurement_snapshots": face_snapshots,
    "filter_extraction_reports": extraction_reports,
    "makeup_feedback_reports": feedback_reports,
    "makeup_recommendation_sessions": sessions,
    "makeup_recommendation_reports": reports,
    "makeup_recommendation_assets": assets,
    "product_recommendation_runs": product_runs,
  }
  object_by_location: dict[tuple[str, str], S3ObjectReference] = {}
  for row in media:
    for bucket_field, key_field in (
      ("bucket", "object_key"),
      ("thumbnail_bucket", "thumbnail_object_key"),
    ):
      bucket = str(row.get(bucket_field) or "")
      key = str(row.get(key_field) or "")
      if bucket and key:
        object_by_location.setdefault(
          (bucket, key),
          S3ObjectReference(
            bucket=bucket,
            object_key=key,
            checksum_sha256=(
              str(row.get("checksum_sha256"))
              if bucket_field == "bucket" and row.get("checksum_sha256")
              else None
            ),
          ),
        )
  for row in assets:
    bucket = str(row.get("storage_bucket") or "")
    key = str(row.get("object_key") or "")
    if bucket and key:
      object_by_location.setdefault(
        (bucket, key),
        S3ObjectReference(bucket=bucket, object_key=key),
      )

  static_references = {
    "makeup_situations": frozenset(
      _ids(sessions, "situation_id") | _ids(reports, "situation_id"),
    ),
    "makeup_scenario_library": frozenset(
      _ids(sessions, "keyword_id") | _ids(reports, "keyword_id"),
    ),
  }
  _validate_bundle_references(rows)
  return MigrationBundle(
    batch_id=stable_batch_id(
      auth_provider,
      oauth_sub,
      [
        UUID(value)
        for value in (
          report_ids
          | _ids(visible_analyses)
          | _ids(extraction_reports)
          | _ids(feedback_reports)
        )
      ],
    ),
    source_user_id=source_user_id,
    auth_provider=auth_provider,
    oauth_sub=oauth_sub,
    email=email,
    rows=rows,
    s3_objects=tuple(object_by_location.values()),
    static_references=static_references,
  )


def bundle_to_json(bundle: MigrationBundle) -> str:
  return json.dumps(
    {
      "contractVersion": "aura.makeup-recommendation-migration.v1",
      "batchId": bundle.batch_id,
      "sourceUserId": str(bundle.source_user_id),
      "authProvider": bundle.auth_provider,
      "oauthSub": bundle.oauth_sub,
      "email": bundle.email,
      "rows": {
        table: list(rows)
        for table, rows in bundle.rows.items()
      },
      "s3Objects": [
        {
          "bucket": item.bucket,
          "objectKey": item.object_key,
          "checksumSha256": item.checksum_sha256,
        }
        for item in bundle.s3_objects
      ],
      "staticReferences": (
        {
          table: sorted(values)
          for table, values in bundle.static_references.items()
        }
        if bundle.static_references is not None
        else None
      ),
    },
    ensure_ascii=False,
    sort_keys=True,
    separators=(",", ":"),
  )


def bundle_from_json(value: str) -> MigrationBundle:
  payload = json.loads(value)
  if payload.get("contractVersion") != "aura.makeup-recommendation-migration.v1":
    raise MigrationPreconditionError("Unsupported migration bundle contract.")
  static_payload = payload.get("staticReferences")
  return MigrationBundle(
    batch_id=str(payload["batchId"]),
    source_user_id=UUID(str(payload["sourceUserId"])),
    auth_provider=str(payload["authProvider"]),
    oauth_sub=str(payload["oauthSub"]),
    email=str(payload["email"]),
    rows={
      str(table): tuple(dict(row) for row in rows)
      for table, rows in dict(payload["rows"]).items()
    },
    s3_objects=tuple(
      S3ObjectReference(
        bucket=str(item["bucket"]),
        object_key=str(item["objectKey"]),
        checksum_sha256=(
          str(item["checksumSha256"])
          if item.get("checksumSha256")
          else None
        ),
      )
      for item in payload.get("s3Objects", [])
    ),
    static_references=(
      {
        str(table): frozenset(str(item) for item in items)
        for table, items in dict(static_payload).items()
      }
      if isinstance(static_payload, dict)
      else None
    ),
  )


_MARKER_FIELDS = {
  "analysis_reports": "detail_payload",
  "filter_extraction_reports": "result_payload",
  "makeup_feedback_reports": "feedback_payload",
  "makeup_recommendation_sessions": "context_snapshot",
  "makeup_recommendation_reports": "context_snapshot",
  "makeup_recommendation_assets": "provenance",
  "product_recommendation_runs": "consent_snapshot",
}


def _source_row_id(table: str, row: Mapping[str, Any]) -> str:
  key = "report_id" if table == "face_length_measurement_snapshots" else "id"
  value = str(row.get(key) or "")
  if not value:
    raise MigrationPreconditionError(f"{table} row is missing {key}.")
  return value


def _json_object(value: Any) -> dict[str, Any]:
  if isinstance(value, str):
    try:
      value = json.loads(value)
    except json.JSONDecodeError:
      return {}
  return deepcopy(value) if isinstance(value, dict) else {}


def prepare_row_for_insert(
  table: str,
  row: Mapping[str, Any],
  *,
  bundle: MigrationBundle,
  destination_user_id: UUID,
) -> dict[str, Any]:
  prepared = deepcopy(dict(row))
  destination_id = str(destination_user_id)
  if "user_id" in prepared:
    prepared["user_id"] = destination_id
  if "owner_user_id" in prepared:
    prepared["owner_user_id"] = destination_id

  marker_field = _MARKER_FIELDS.get(table)
  if marker_field:
    marked = _json_object(prepared.get(marker_field))
    marked["migration"] = {
      "batchId": bundle.batch_id,
      "sourceEnvironment": "local",
      "sourceId": _source_row_id(table, row),
    }
    prepared[marker_field] = marked

  if table == "makeup_recommendation_sessions":
    prepared["report_id"] = None
  elif table == "makeup_recommendation_reports":
    prepared["session_id"] = None
    prepared["parent_report_id"] = None
  return prepared


def _migration_marker(row: Mapping[str, Any]) -> Mapping[str, Any]:
  for field in (
    "context_snapshot",
    "provenance",
    "detail_payload",
    "result_payload",
    "feedback_payload",
    "consent_snapshot",
  ):
    value = row.get(field)
    if isinstance(value, Mapping):
      marker = value.get("migration")
      if isinstance(marker, Mapping):
        return marker
  return {}


def build_migration_plan(
  bundle: MigrationBundle,
  destination: DestinationState,
) -> MigrationPlan:
  if (
    bundle.auth_provider != destination.auth_provider
    or bundle.oauth_sub != destination.oauth_sub
  ):
    raise MigrationPreconditionError(
      "Source and destination authentication identity do not match.",
    )
  if bundle.email.casefold() != destination.email.casefold():
    raise MigrationPreconditionError("Destination email does not match the source account.")

  insert_counts: dict[str, int] = {}
  skip_counts: dict[str, int] = {}
  for table, rows in bundle.rows.items():
    existing_by_id = destination.existing_rows.get(table, {})
    inserted = 0
    skipped = 0
    for row in rows:
      source_id = _source_row_id(table, row)
      existing = existing_by_id.get(source_id)
      if existing is None:
        inserted += 1
        continue
      marker = _migration_marker(existing)
      if (
        marker.get("sourceEnvironment") == "local"
        and marker.get("sourceId") == source_id
      ):
        for owner_field in ("user_id", "owner_user_id"):
          if (
            existing.get(owner_field) is not None
            and str(existing[owner_field]) != str(destination.user_id)
          ):
            raise MigrationCollisionError(
              f"{table} UUID {source_id} is marked as migrated but belongs to another user.",
            )
        skipped += 1
        continue
      if table not in _MARKER_FIELDS:
        expected = prepare_row_for_insert(
          table,
          row,
          bundle=bundle,
          destination_user_id=destination.user_id,
        )
        if expected == existing:
          skipped += 1
          continue
      raise MigrationCollisionError(
        f"{table} UUID {source_id} already belongs to unrelated deployed data.",
      )
    insert_counts[table] = inserted
    skip_counts[table] = skipped

  return MigrationPlan(
    batch_id=bundle.batch_id,
    destination_user_id=destination.user_id,
    insert_counts=insert_counts,
    skip_counts=skip_counts,
  )


_MIGRATION_TABLES = (
  "media_assets",
  "photo_captures",
  "analysis_reports",
  "analysis_stage_runs",
  "face_length_measurement_snapshots",
  "filter_extraction_reports",
  "makeup_feedback_reports",
  "makeup_recommendation_sessions",
  "makeup_recommendation_reports",
  "makeup_recommendation_assets",
  "product_recommendation_runs",
)

_PRIMARY_KEYS = {
  "face_length_measurement_snapshots": "report_id",
}

_INSERT_ORDER = _MIGRATION_TABLES


def _json_safe(value: Any) -> Any:
  if isinstance(value, dict):
    return {str(key): _json_safe(item) for key, item in value.items()}
  if isinstance(value, (list, tuple)):
    return [_json_safe(item) for item in value]
  if isinstance(value, (UUID, datetime, date)):
    return str(value)
  if isinstance(value, bytes):
    return value.hex()
  return value


def _decoded_json_row(value: Any) -> dict[str, Any]:
  if isinstance(value, str):
    value = json.loads(value)
  if not isinstance(value, dict):
    raise MigrationPreconditionError("Database row did not serialize as a JSON object.")
  return _json_safe(value)


async def _fetch_json_rows(
  connection: Any,
  query: str,
  *args: Any,
) -> tuple[dict[str, Any], ...]:
  records = await connection.fetch(query, *args)
  return tuple(_decoded_json_row(record["row"]) for record in records)


async def export_bundle(
  connection: Any,
  *,
  email: str,
) -> MigrationBundle:
  users = await connection.fetch(
    """
    select id,auth_provider::text as auth_provider,oauth_sub,email::text as email
    from users
    where lower(email::text)=lower($1) and deleted_at is null
    order by created_at
    """,
    email,
  )
  if len(users) != 1:
    raise MigrationPreconditionError(
      f"Expected exactly one active local user for {email}; found {len(users)}.",
    )
  user = users[0]
  if not user["auth_provider"] or not user["oauth_sub"]:
    raise MigrationPreconditionError("Local user is missing authentication identity.")
  user_id = UUID(str(user["id"]))
  snapshot = {
    "makeup_recommendation_reports": await _fetch_json_rows(
      connection,
      """
      select to_jsonb(row_value.*) as row
      from makeup_recommendation_reports row_value
      where user_id=$1
      order by created_at,id
      """,
      user_id,
    ),
    "makeup_recommendation_sessions": await _fetch_json_rows(
      connection,
      """
      select to_jsonb(row_value.*) as row
      from makeup_recommendation_sessions row_value
      where user_id=$1
      order by created_at,id
      """,
      user_id,
    ),
    "analysis_reports": await _fetch_json_rows(
      connection,
      """
      select to_jsonb(row_value.*) as row
      from analysis_reports row_value
      where user_id=$1
      order by created_at,id
      """,
      user_id,
    ),
    "photo_captures": await _fetch_json_rows(
      connection,
      """
      select to_jsonb(row_value.*) as row
      from photo_captures row_value
      where user_id=$1
      order by created_at,id
      """,
      user_id,
    ),
    "media_assets": await _fetch_json_rows(
      connection,
      """
      select to_jsonb(row_value.*) as row
      from media_assets row_value
      where owner_user_id=$1
      order by created_at,id
      """,
      user_id,
    ),
    "makeup_recommendation_assets": await _fetch_json_rows(
      connection,
      """
      select to_jsonb(asset.*) as row
      from makeup_recommendation_assets asset
      join makeup_recommendation_reports report on report.id=asset.report_id
      where report.user_id=$1
      order by asset.created_at,asset.id
      """,
      user_id,
    ),
    "product_recommendation_runs": await _fetch_json_rows(
      connection,
      """
      select to_jsonb(row_value.*) as row
      from product_recommendation_runs row_value
      where user_id=$1
        and (
          source_makeup_report_id is not null
          or source_analysis_report_id is not null
        )
      order by created_at,id
      """,
      user_id,
    ),
    "analysis_stage_runs": await _fetch_json_rows(
      connection,
      """
      select to_jsonb(stage.*) as row
      from analysis_stage_runs stage
      join analysis_reports report on report.id=stage.report_id
      where report.user_id=$1
      order by stage.created_at,stage.id
      """,
      user_id,
    ),
    "face_length_measurement_snapshots": await _fetch_json_rows(
      connection,
      """
      select to_jsonb(snapshot_row.*) as row
      from face_length_measurement_snapshots snapshot_row
      join analysis_reports report on report.id=snapshot_row.report_id
      where report.user_id=$1
      order by snapshot_row.created_at,snapshot_row.report_id
      """,
      user_id,
    ),
    "filter_extraction_reports": await _fetch_json_rows(
      connection,
      """
      select to_jsonb(row_value.*) as row
      from filter_extraction_reports row_value
      where user_id=$1
      order by created_at,id
      """,
      user_id,
    ),
    "makeup_feedback_reports": await _fetch_json_rows(
      connection,
      """
      select to_jsonb(row_value.*) as row
      from makeup_feedback_reports row_value
      where user_id=$1
      order by created_at,id
      """,
      user_id,
    ),
  }
  bundle = build_bundle_from_snapshot(
    source_user_id=user_id,
    auth_provider=str(user["auth_provider"]),
    oauth_sub=str(user["oauth_sub"]),
    email=str(user["email"]),
    snapshot=snapshot,
  )
  if not any(
    bundle.rows[table]
    for table in (
      "analysis_reports",
      "filter_extraction_reports",
      "makeup_feedback_reports",
      "makeup_recommendation_reports",
    )
  ):
    raise MigrationPreconditionError("Local account has no visible saved reports.")
  return bundle


def write_bundle_atomic(bundle: MigrationBundle, path: Path) -> str:
  serialized = bundle_to_json(bundle)
  digest = hashlib.sha256(serialized.encode()).hexdigest()
  path.parent.mkdir(parents=True, exist_ok=True)
  descriptor, temporary_name = tempfile.mkstemp(
    prefix=f".{path.name}.",
    dir=path.parent,
    text=True,
  )
  try:
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
      handle.write(serialized)
      handle.flush()
      os.fsync(handle.fileno())
    os.replace(temporary_name, path)
  except BaseException:
    try:
      os.unlink(temporary_name)
    except FileNotFoundError:
      pass
    raise
  return digest


def read_bundle(path: Path) -> MigrationBundle:
  return bundle_from_json(path.read_text(encoding="utf-8"))


async def _table_columns(connection: Any, table: str) -> frozenset[str]:
  rows = await connection.fetch(
    """
    select column_name
    from information_schema.columns
    where table_schema='public' and table_name=$1
    """,
    table,
  )
  return frozenset(str(row["column_name"]) for row in rows)


async def load_destination_state(
  connection: Any,
  bundle: MigrationBundle,
  *,
  lock_user: bool = False,
) -> DestinationState:
  suffix = " for share" if lock_user else ""
  user = await connection.fetchrow(
    """
    select id,auth_provider::text as auth_provider,oauth_sub,email::text as email
    from users
    where auth_provider::text=$1 and oauth_sub=$2 and deleted_at is null
    """ + suffix,
    bundle.auth_provider,
    bundle.oauth_sub,
  )
  if user is None:
    raise MigrationPreconditionError(
      "Destination user for the source authentication identity does not exist.",
    )
  destination_user_id = UUID(str(user["id"]))
  for row in bundle.rows.get("media_assets", ()):
    if not row.get("bucket") or not row.get("object_key"):
      continue
    conflicting_id = await connection.fetchval(
      """
      select id from media_assets
      where bucket=$1 and object_key=$2 and id<>$3
      """,
      row["bucket"],
      row["object_key"],
      UUID(str(row["id"])),
    )
    if conflicting_id is not None:
      raise MigrationCollisionError(
        f"media_assets storage key already belongs to deployed UUID {conflicting_id}.",
      )
  for row in bundle.rows.get("makeup_recommendation_sessions", ()):
    if not row.get("idempotency_key"):
      continue
    conflicting_id = await connection.fetchval(
      """
      select id from makeup_recommendation_sessions
      where user_id=$1 and idempotency_key=$2 and id<>$3
      """,
      destination_user_id,
      row["idempotency_key"],
      UUID(str(row["id"])),
    )
    if conflicting_id is not None:
      raise MigrationCollisionError(
        f"makeup_recommendation_sessions idempotency key belongs to {conflicting_id}.",
      )
  for row in bundle.rows.get("makeup_recommendation_reports", ()):
    if not row.get("session_id"):
      continue
    conflicting_id = await connection.fetchval(
      """
      select id from makeup_recommendation_reports
      where session_id=$1 and id<>$2
      """,
      UUID(str(row["session_id"])),
      UUID(str(row["id"])),
    )
    if conflicting_id is not None:
      raise MigrationCollisionError(
        f"makeup_recommendation_reports session belongs to {conflicting_id}.",
      )
  for row in bundle.rows.get("makeup_recommendation_assets", ()):
    conflicting_id = await connection.fetchval(
      """
      select id from makeup_recommendation_assets
      where report_id=$1 and look_id=$2 and id<>$3
      """,
      UUID(str(row["report_id"])),
      row["look_id"],
      UUID(str(row["id"])),
    )
    if conflicting_id is not None:
      raise MigrationCollisionError(
        f"makeup_recommendation_assets report/look belongs to {conflicting_id}.",
      )
  for row in bundle.rows.get("product_recommendation_runs", ()):
    if (
      row.get("strategy") != "makeup_report_v1"
      or not row.get("source_makeup_report_id")
      or not row.get("source_look_id")
    ):
      continue
    conflicting_id = await connection.fetchval(
      """
      select id from product_recommendation_runs
      where strategy='makeup_report_v1'
        and source_makeup_report_id=$1
        and source_look_id=$2
        and revision=$3
        and id<>$4
      """,
      UUID(str(row["source_makeup_report_id"])),
      row["source_look_id"],
      row["revision"],
      UUID(str(row["id"])),
    )
    if conflicting_id is not None:
      raise MigrationCollisionError(
        f"product_recommendation_runs makeup revision belongs to {conflicting_id}.",
      )
  existing_rows: dict[str, dict[str, dict[str, Any]]] = {}
  for table in _MIGRATION_TABLES:
    source_rows = bundle.rows.get(table, ())
    columns = await _table_columns(connection, table)
    missing_columns = {
      key
      for row in source_rows
      for key in row
      if key not in columns
    }
    if missing_columns:
      raise MigrationPreconditionError(
        f"Destination {table} is missing columns: {sorted(missing_columns)}.",
      )
    primary_key = _PRIMARY_KEYS.get(table, "id")
    ids = [
      UUID(_source_row_id(table, row))
      for row in source_rows
    ]
    if not ids:
      existing_rows[table] = {}
      continue
    found = await _fetch_json_rows(
      connection,
      f"""
      select to_jsonb(row_value.*) as row
      from {table} row_value
      where {primary_key}=any($1::uuid[])
      """,
      ids,
    )
    existing_rows[table] = {
      _source_row_id(table, row): row
      for row in found
    }

  static_ids: dict[str, frozenset[str]] = {}
  for table, values in (bundle.static_references or {}).items():
    if table not in {"makeup_situations", "makeup_scenario_library"}:
      raise MigrationPreconditionError(f"Unsupported static reference table: {table}.")
    if not values:
      static_ids[table] = frozenset()
      continue
    rows = await connection.fetch(
      f"select id from {table} where id=any($1::uuid[])",
      [UUID(value) for value in values],
    )
    static_ids[table] = frozenset(str(row["id"]) for row in rows)
    missing = set(values) - set(static_ids[table])
    if missing:
      raise MigrationPreconditionError(
        f"Destination {table} is missing referenced IDs: {sorted(missing)}.",
      )
  return DestinationState(
    user_id=destination_user_id,
    auth_provider=str(user["auth_provider"]),
    oauth_sub=str(user["oauth_sub"]),
    email=str(user["email"]),
    existing_rows=existing_rows,
    available_static_ids=static_ids,
  )


def verify_s3_objects(s3_client: Any, bundle: MigrationBundle) -> S3Verification:
  missing: list[str] = []
  existing = 0
  for item in bundle.s3_objects:
    try:
      response = s3_client.head_object(Bucket=item.bucket, Key=item.object_key)
      expected_checksum = (item.checksum_sha256 or "").lower()
      metadata = response.get("Metadata") or {}
      actual_checksum = str(
        metadata.get("checksum-sha256")
        or metadata.get("checksum_sha256")
        or "",
      ).lower()
      if not actual_checksum and response.get("ChecksumSHA256"):
        actual_checksum = base64.b64decode(
          str(response["ChecksumSHA256"]),
        ).hex()
      if (
        expected_checksum
        and actual_checksum
        and expected_checksum != actual_checksum
      ):
        raise MigrationPreconditionError(
          f"S3 checksum mismatch for s3://{item.bucket}/{item.object_key}.",
        )
      existing += 1
    except Exception as error:  # boto clients expose several provider-specific errors.
      missing.append(f"s3://{item.bucket}/{item.object_key} ({type(error).__name__})")
  return S3Verification(
    checked=len(bundle.s3_objects),
    existing=existing,
    missing=tuple(missing),
  )


async def _insert_json_row(
  connection: Any,
  table: str,
  row: Mapping[str, Any],
) -> None:
  await connection.execute(
    f"""
    insert into {table}
    select (jsonb_populate_record(null::{table}, $1::jsonb)).*
    """,
    json.dumps(row, ensure_ascii=False, sort_keys=True),
  )


async def import_bundle(
  connection: Any,
  bundle: MigrationBundle,
  *,
  expected_batch_id: str,
) -> ImportResult:
  if bundle.batch_id != expected_batch_id:
    raise MigrationPreconditionError("Bundle batch ID does not match the approved dry-run.")

  async with connection.transaction():
    destination = await load_destination_state(connection, bundle, lock_user=True)
    plan = build_migration_plan(bundle, destination)
    inserted_ids: dict[str, set[str]] = {}
    for table in _INSERT_ORDER:
      existing = destination.existing_rows.get(table, {})
      inserted_ids[table] = set()
      for source_row in bundle.rows.get(table, ()):
        source_id = _source_row_id(table, source_row)
        if source_id in existing:
          continue
        prepared = prepare_row_for_insert(
          table,
          source_row,
          bundle=bundle,
          destination_user_id=destination.user_id,
        )
        await _insert_json_row(connection, table, prepared)
        inserted_ids[table].add(source_id)

    for source_row in bundle.rows.get("makeup_recommendation_sessions", ()):
      source_id = _source_row_id("makeup_recommendation_sessions", source_row)
      if source_id not in inserted_ids["makeup_recommendation_sessions"]:
        continue
      report_id = source_row.get("report_id")
      if report_id:
        await connection.execute(
          """
          update makeup_recommendation_sessions
          set report_id=$2
          where id=$1 and user_id=$3 and report_id is null
          """,
          UUID(source_id),
          UUID(str(report_id)),
          destination.user_id,
        )
    for source_row in bundle.rows.get("makeup_recommendation_reports", ()):
      source_id = _source_row_id("makeup_recommendation_reports", source_row)
      if source_id not in inserted_ids["makeup_recommendation_reports"]:
        continue
      await connection.execute(
        """
        update makeup_recommendation_reports
        set session_id=$2,parent_report_id=$3
        where id=$1 and user_id=$4
          and session_id is null and parent_report_id is null
        """,
        UUID(source_id),
        UUID(str(source_row["session_id"])) if source_row.get("session_id") else None,
        (
          UUID(str(source_row["parent_report_id"]))
          if source_row.get("parent_report_id")
          else None
        ),
        destination.user_id,
      )

    actual_inserted = {
      table: len(ids)
      for table, ids in inserted_ids.items()
    }
    if actual_inserted != dict(plan.insert_counts):
      raise MigrationPreconditionError(
        f"Inserted counts changed inside transaction: {actual_inserted} != {dict(plan.insert_counts)}.",
      )
    return ImportResult(
      batch_id=bundle.batch_id,
      destination_user_id=destination.user_id,
      inserted=actual_inserted,
      skipped=dict(plan.skip_counts),
    )
