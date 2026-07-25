from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Protocol
from uuid import UUID, uuid4

from app.core.errors import AppError
from app.schemas.report_exports import LongImageExportSessionRequest
from app.services.report_export_long_image import ReportExportPage, stitch_report_pages


REPORT_EXPORT_TTL_SECONDS = 3600
REPORT_EXPORT_PAGE_MAX_BYTES = 12 * 1024 * 1024


class ReportExportS3(Protocol):
  def create_presigned_upload(self, media_kind: str, content_type: str, original_filename: str, expires_in: int) -> dict[str, Any]: ...
  def get_object_metadata(self, *, bucket: str, object_key: str) -> dict[str, Any]: ...
  def get_object_bytes(self, *, bucket: str, object_key: str, max_bytes: int | None = None) -> tuple[bytes, str]: ...
  def put_private_object(self, *, bucket: str, object_key: str, body: bytes, content_type: str, tags: dict[str, str] | None = None) -> None: ...
  def create_presigned_download(self, *, bucket: str, object_key: str, expires_in: int = 900) -> str: ...
  def delete_object(self, *, bucket: str, object_key: str) -> None: ...


async def create_long_image_export_session(
  db: Any,
  payload: LongImageExportSessionRequest,
  *,
  owner_user_id: UUID,
  s3: ReportExportS3,
) -> dict[str, Any]:
  session_id = uuid4()
  uploads: list[dict[str, Any]] = []
  manifest: list[dict[str, Any]] = []
  for page in payload.pages:
    filename = f"{session_id}-{page.index:03d}.jpg"
    upload = s3.create_presigned_upload(
      "report-export-page",
      "image/jpeg",
      filename,
      REPORT_EXPORT_TTL_SECONDS,
    )
    manifest.append({
      "index": page.index,
      "bucket": upload["bucket"],
      "objectKey": upload["object_key"],
      "byteSize": page.byte_size,
      "width": page.width,
      "height": page.height,
      "contentType": "image/jpeg",
    })
    uploads.append({
      "index": page.index,
      "uploadUrl": upload["upload_url"],
      "method": upload.get("method", "PUT"),
      "headers": upload.get("headers") or {
        "Content-Type": "image/jpeg",
        "Cache-Control": upload.get("cache_control", "private, no-store"),
      },
    })

  row = await db.fetchrow(
    """
    insert into report_export_sessions (
      id, owner_user_id, report_type, target_width, page_manifest, status, expires_at
    ) values ($1, $2, $3, $4, $5::jsonb, 'pending', now() + ($6::int * interval '1 second'))
    returning id, expires_at
    """,
    session_id,
    owner_user_id,
    payload.report_type,
    payload.target_width,
    json.dumps(manifest, separators=(",", ":")),
    REPORT_EXPORT_TTL_SECONDS,
  )
  if row is None:
    raise AppError(503, "REPORT_EXPORT_SESSION_CREATE_FAILED", "Report export session could not be created.")
  return {
    "sessionId": str(session_id),
    "uploads": uploads,
    "expiresAt": row.get("expires_at"),
  }


def _manifest(value: Any) -> list[dict[str, Any]]:
  if isinstance(value, str):
    value = json.loads(value)
  if not isinstance(value, list):
    raise AppError(409, "REPORT_EXPORT_MANIFEST_INVALID", "Report export manifest is invalid.")
  return [dict(item) for item in value if isinstance(item, dict)]


async def complete_long_image_export_session(
  db: Any,
  session_id: UUID,
  *,
  owner_user_id: UUID,
  s3: ReportExportS3,
) -> dict[str, Any]:
  row = await db.fetchrow(
    """
    select * from report_export_sessions
    where id = $1 and owner_user_id = $2 and expires_at > now()
    """,
    session_id,
    owner_user_id,
  )
  if row is None:
    raise AppError(404, "REPORT_EXPORT_NOT_FOUND", "Report export session was not found.")
  if row.get("status") == "completed" and row.get("result_object_key"):
    return _completed_result(row, s3)
  claimed = await db.fetchrow(
    """
    update report_export_sessions set status = 'processing', updated_at = now()
    where id = $1 and owner_user_id = $2 and status in ('pending', 'failed') and expires_at > now()
    returning *
    """,
    session_id,
    owner_user_id,
  )
  if claimed is None:
    raise AppError(409, "REPORT_EXPORT_BUSY", "Report export is already being prepared.")

  pages: list[ReportExportPage] = []
  page_locations: list[tuple[str, str]] = []
  try:
    for item in _manifest(claimed.get("page_manifest")):
      bucket = str(item.get("bucket") or "")
      object_key = str(item.get("objectKey") or "")
      expected_size = int(item.get("byteSize") or 0)
      metadata = s3.get_object_metadata(bucket=bucket, object_key=object_key)
      if int(metadata.get("byte_size") or 0) != expected_size:
        raise AppError(409, "REPORT_EXPORT_PAGE_SIZE_MISMATCH", "A report export page upload is incomplete.")
      content, content_type = s3.get_object_bytes(
        bucket=bucket,
        object_key=object_key,
        max_bytes=REPORT_EXPORT_PAGE_MAX_BYTES,
      )
      if content_type.split(";", 1)[0].lower() not in {"image/jpeg", "image/jpg"}:
        raise AppError(409, "REPORT_EXPORT_PAGE_TYPE_MISMATCH", "A report export page is not JPEG.")
      pages.append(ReportExportPage(
        index=int(item["index"]),
        content=content,
        expected_width=int(item.get("width") or 0),
        expected_height=int(item.get("height") or 0),
      ))
      page_locations.append((bucket, object_key))

    try:
      stitched = await asyncio.to_thread(
        stitch_report_pages,
        pages,
        target_width=int(claimed.get("target_width") or 1440),
      )
    except ValueError as error:
      raise AppError(422, "REPORT_EXPORT_IMAGE_INVALID", str(error)) from error
    bucket = page_locations[0][0]
    result_key = f"uploads/report-export-result/{session_id}.jpg"
    s3.put_private_object(
      bucket=bucket,
      object_key=result_key,
      body=stitched.content,
      content_type="image/jpeg",
      tags={"temporary": "true", "expires": str(int(datetime.now(timezone.utc).timestamp()) + REPORT_EXPORT_TTL_SECONDS)},
    )
    completed = await db.fetchrow(
      """
      update report_export_sessions
      set status = 'completed', result_bucket = $3, result_object_key = $4,
          result_width = $5, result_height = $6, result_byte_size = $7,
          completed_at = now(), updated_at = now(), error_code = null
      where id = $1 and owner_user_id = $2
      returning *
      """,
      session_id,
      owner_user_id,
      bucket,
      result_key,
      stitched.width,
      stitched.height,
      stitched.byte_size,
    )
    if completed is None:
      raise AppError(503, "REPORT_EXPORT_COMPLETE_FAILED", "Report export could not be finalized.")
    for page_bucket, page_key in page_locations:
      try:
        s3.delete_object(bucket=page_bucket, object_key=page_key)
      except Exception:
        pass
    return _completed_result(completed, s3)
  except Exception as error:
    await db.execute(
      "update report_export_sessions set status = 'failed', error_code = $3, updated_at = now() where id = $1 and owner_user_id = $2",
      session_id,
      owner_user_id,
      getattr(error, "code", type(error).__name__)[:100],
    )
    raise


def _completed_result(row: dict[str, Any], s3: ReportExportS3) -> dict[str, Any]:
  return {
    "sessionId": str(row["id"]),
    "downloadUrl": s3.create_presigned_download(
      bucket=str(row["result_bucket"]),
      object_key=str(row["result_object_key"]),
      expires_in=REPORT_EXPORT_TTL_SECONDS,
    ),
    "width": int(row["result_width"]),
    "height": int(row["result_height"]),
    "byteSize": int(row["result_byte_size"]),
    "expiresAt": row.get("expires_at"),
  }


async def delete_long_image_export_session(
  db: Any,
  session_id: UUID,
  *,
  owner_user_id: UUID,
  s3: ReportExportS3,
) -> bool:
  row = await db.fetchrow(
    "delete from report_export_sessions where id = $1 and owner_user_id = $2 returning *",
    session_id,
    owner_user_id,
  )
  if row is None:
    return False
  locations = [
    (str(item.get("bucket") or ""), str(item.get("objectKey") or ""))
    for item in _manifest(row.get("page_manifest"))
  ]
  if row.get("result_bucket") and row.get("result_object_key"):
    locations.append((str(row["result_bucket"]), str(row["result_object_key"])))
  for bucket, key in locations:
    if not bucket or not key:
      continue
    try:
      s3.delete_object(bucket=bucket, object_key=key)
    except Exception:
      pass
  return True


async def cleanup_expired_long_image_export_sessions(
  db: Any,
  *,
  s3: ReportExportS3,
  limit: int = 100,
) -> dict[str, int]:
  rows = await db.fetch(
    """
    delete from report_export_sessions
    where id in (
      select id from report_export_sessions
      where expires_at <= now()
      order by expires_at
      limit $1
    )
    returning *
    """,
    max(1, min(limit, 500)),
  )
  failed = 0
  for row in rows:
    locations = [
      (str(item.get("bucket") or ""), str(item.get("objectKey") or ""))
      for item in _manifest(row.get("page_manifest"))
    ]
    if row.get("result_bucket") and row.get("result_object_key"):
      locations.append((str(row["result_bucket"]), str(row["result_object_key"])))
    session_failed = False
    for bucket, object_key in locations:
      if not bucket or not object_key:
        continue
      try:
        s3.delete_object(bucket=bucket, object_key=object_key)
      except Exception:
        session_failed = True
    failed += int(session_failed)
  return {"deleted": len(rows), "failed": failed}


async def find_expired_long_image_export_sessions(db: Any) -> dict[str, int]:
  row = await db.fetchrow(
    "select count(*)::int as count from report_export_sessions where expires_at <= now()",
  )
  return {"expired": int((row or {}).get("count") or 0)}
