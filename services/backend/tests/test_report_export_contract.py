import pytest
from pydantic import ValidationError
from uuid import UUID

from app.schemas.report_exports import LongImageExportSessionRequest
from app.services.report_export_sessions import (
  cleanup_expired_long_image_export_sessions,
  create_long_image_export_session,
)
from app.api.report_exports import router as report_export_router
from app.services.report_export_schema import REPORT_EXPORT_SCHEMA_SQL
from app.services.s3 import PRIVATE_MEDIA_KINDS, SERVER_MANAGED_MEDIA_KINDS


def _page(index: int) -> dict[str, object]:
  return {
    "index": index,
    "byteSize": 2048,
    "contentType": "image/jpeg",
    "width": 1170,
    "height": 2400,
  }


def test_long_image_export_session_accepts_supported_report_and_contiguous_pages() -> None:
  payload = LongImageExportSessionRequest.model_validate({
    "reportType": "makeup-feedback",
    "targetWidth": 1440,
    "pages": [_page(0), _page(1)],
  })

  assert payload.target_width == 1440
  assert [page.index for page in payload.pages] == [0, 1]


def test_long_image_export_session_rejects_missing_page_index() -> None:
  with pytest.raises(ValidationError, match="contiguous"):
    LongImageExportSessionRequest.model_validate({
      "reportType": "face-analysis",
      "targetWidth": 1440,
      "pages": [_page(0), _page(2)],
    })


def test_long_image_export_session_rejects_non_jpeg_chunks() -> None:
  page = _page(0)
  page["contentType"] = "image/png"
  with pytest.raises(ValidationError, match="image/jpeg"):
    LongImageExportSessionRequest.model_validate({
      "reportType": "makeup-recommendation",
      "pages": [page],
    })


class _Database:
  def __init__(self) -> None:
    self.args: tuple[object, ...] = ()

  async def fetchrow(self, _query: str, *args: object) -> dict[str, object]:
    self.args = args
    return {"id": args[0], "expires_at": "2026-07-25T12:00:00Z"}


class _S3:
  def create_presigned_upload(
    self,
    media_kind: str,
    content_type: str,
    original_filename: str,
    expires_in: int,
  ) -> dict[str, object]:
    assert media_kind == "report-export-page"
    return {
      "bucket": "private-media",
      "object_key": f"uploads/report-export-page/{original_filename}",
      "upload_url": f"https://upload.invalid/{original_filename}",
      "method": "PUT",
      "headers": {"Content-Type": content_type},
      "expires_in": expires_in,
    }


@pytest.mark.asyncio
async def test_create_long_image_export_session_binds_private_uploads_to_owner() -> None:
  db = _Database()
  payload = LongImageExportSessionRequest.model_validate({
    "reportType": "makeup-feedback",
    "pages": [_page(0), _page(1)],
  })

  result = await create_long_image_export_session(
    db,
    payload,
    owner_user_id=UUID("11111111-1111-1111-1111-111111111111"),
    s3=_S3(),
  )

  assert len(result["uploads"]) == 2
  assert result["uploads"][1]["index"] == 1
  assert db.args[1] == UUID("11111111-1111-1111-1111-111111111111")


def test_report_export_router_exposes_session_complete_and_delete_routes() -> None:
  routes = {(route.path, tuple(sorted(route.methods or []))) for route in report_export_router.routes}
  assert ("/report-exports/long-image/sessions", ("POST",)) in routes
  assert ("/report-exports/long-image/sessions/{session_id}/complete", ("POST",)) in routes
  assert ("/report-exports/long-image/sessions/{session_id}", ("DELETE",)) in routes


def test_report_export_storage_is_temporary_private_and_owner_scoped() -> None:
  assert "report-export-page" in PRIVATE_MEDIA_KINDS
  assert "report-export-result" in PRIVATE_MEDIA_KINDS
  assert "report-export-page" in SERVER_MANAGED_MEDIA_KINDS
  assert "owner_user_id uuid not null" in REPORT_EXPORT_SCHEMA_SQL
  assert "expires_at timestamptz not null" in REPORT_EXPORT_SCHEMA_SQL


@pytest.mark.asyncio
async def test_expired_report_export_cleanup_removes_page_and_result_objects() -> None:
  class CleanupDatabase:
    async def fetch(self, _query: str, _limit: int) -> list[dict[str, object]]:
      return [{
        "id": UUID("22222222-2222-2222-2222-222222222222"),
        "page_manifest": [{"bucket": "private-media", "objectKey": "uploads/report-export-page/0.jpg"}],
        "result_bucket": "private-media",
        "result_object_key": "uploads/report-export-result/result.jpg",
      }]

  class CleanupS3:
    deleted: list[str] = []

    def delete_object(self, *, bucket: str, object_key: str) -> None:
      assert bucket == "private-media"
      self.deleted.append(object_key)

  s3 = CleanupS3()
  result = await cleanup_expired_long_image_export_sessions(CleanupDatabase(), s3=s3)
  assert result == {"deleted": 1, "failed": 0}
  assert s3.deleted == [
    "uploads/report-export-page/0.jpg",
    "uploads/report-export-result/result.jpg",
  ]
