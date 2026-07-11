import json
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import analysis as analysis_api
from app.api import feedback as feedback_api
from app.api import filter_extractions as filter_extractions_api
from app.core.errors import AppError
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings
from app.db.session import require_database
from app.main import create_app
from app.services.owned_media import resolve_owned_source_media, trusted_media_request_payload


OWNER_USER_ID = UUID("11111111-1111-1111-1111-111111111111")


def owner_auth() -> AuthContext:
  return AuthContext(
    subject="owner-subject",
    provider="cognito",
    email="owner@example.com",
    name="Owner",
    claims={"sub": "owner-subject"},
  )


async def ensure_owner(_db, _auth) -> dict:
  return {"id": OWNER_USER_ID, "gender": None}


class RejectingMediaDatabase:
  async def fetchrow(self, _query: str, *_args):
    return None


class OwnedMediaDatabase:
  def __init__(self, direct_media: dict | None, capture_media: dict | None = None) -> None:
    self.direct_media = direct_media
    self.capture_media = capture_media
    self.calls: list[tuple[str, tuple]] = []

  async def fetchrow(self, query: str, *args):
    self.calls.append((query, args))
    if "from media_assets" in query:
      return self.direct_media
    if "from photo_captures capture" in query:
      return self.capture_media
    raise AssertionError(f"Unexpected query: {query}")


class AnalysisCreateDatabase:
  def __init__(self, owned_media: dict) -> None:
    self.owned_media = owned_media
    self.insert_args: tuple | None = None

  async def fetchrow(self, query: str, *args):
    if "from media_assets" in query:
      return self.owned_media if args == (self.owned_media["id"], OWNER_USER_ID) else None
    if "insert into analysis_reports" in query:
      self.insert_args = args
      return {
        "id": uuid4(),
        "user_id": OWNER_USER_ID,
        "status": "pending",
        "detail_payload": args[-1],
      }
    raise AssertionError(f"Unexpected query: {query}")


def media_row(media_id: UUID | None = None) -> dict:
  resolved_media_id = media_id or uuid4()
  return {
    "id": resolved_media_id,
    "bucket": "media-bucket",
    "object_key": f"uploads/capture/{resolved_media_id}.jpg",
    "cdn_url": f"https://cdn.example.com/uploads/capture/{resolved_media_id}.jpg",
    "content_type": "image/jpeg",
    "width": 1200,
    "height": 1600,
  }


@pytest.fixture
def protected_ai_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
  app = create_app(
    Settings(
      auth_required=True,
      database_url=None,
      s3_bucket_name="media-bucket",
    ),
  )
  app.dependency_overrides[get_current_user] = owner_auth
  app.dependency_overrides[require_database] = lambda: RejectingMediaDatabase()
  monkeypatch.setattr(analysis_api, "ensure_user", ensure_owner)
  monkeypatch.setattr(feedback_api, "ensure_user", ensure_owner)
  monkeypatch.setattr(filter_extractions_api, "ensure_user", ensure_owner)
  return TestClient(app)


@pytest.mark.parametrize(
  ("path", "payload"),
  [
    (
      "/api/analysis/jobs",
      {
        "runImmediately": True,
        "requestPayload": {
          "bucket": "victim-bucket",
          "objectKey": "private/victim.jpg",
        },
      },
    ),
    (
      "/api/feedback/jobs",
      {
        "runImmediately": True,
        "requestPayload": {
          "bucket": "victim-bucket",
          "objectKey": "private/victim.jpg",
        },
      },
    ),
    (
      "/api/filter-extractions/analyze",
      {
        "runAi": True,
        "requestPayload": {
          "bucket": "victim-bucket",
          "objectKey": "private/victim.jpg",
        },
      },
    ),
  ],
)
def test_ai_routes_reject_client_only_s3_locations(
  protected_ai_client: TestClient,
  path: str,
  payload: dict,
) -> None:
  response = protected_ai_client.post(path, json=payload)

  assert response.status_code == 400
  assert response.json()["error"]["code"] == "SOURCE_MEDIA_REQUIRED"


def test_analysis_rejects_media_id_not_owned_by_current_user(
  protected_ai_client: TestClient,
) -> None:
  response = protected_ai_client.post(
    "/api/analysis/jobs",
    json={
      "runImmediately": True,
      "sourceMediaId": str(uuid4()),
      "requestPayload": {
        "bucket": "victim-bucket",
        "objectKey": "private/victim.jpg",
      },
    },
  )

  assert response.status_code == 404
  assert response.json()["error"]["code"] == "MEDIA_NOT_FOUND"


def test_analysis_uses_database_location_for_owned_media(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  owned_media = media_row()
  db = AnalysisCreateDatabase(owned_media)
  app = create_app(
    Settings(
      auth_required=True,
      database_url=None,
      s3_bucket_name="media-bucket",
    ),
  )
  app.dependency_overrides[get_current_user] = owner_auth
  app.dependency_overrides[require_database] = lambda: db
  monkeypatch.setattr(analysis_api, "ensure_user", ensure_owner)

  response = TestClient(app).post(
    "/api/analysis/jobs",
    json={
      "sourceMediaId": str(owned_media["id"]),
      "requestPayload": {
        "bucket": "victim-bucket",
        "objectKey": "private/victim.jpg",
        "task": "face_makeup_recommendation_report_v1",
      },
    },
  )

  assert response.status_code == 200
  assert db.insert_args is not None
  stored_request = json.loads(db.insert_args[-1])["request"]
  assert stored_request["bucket"] == "media-bucket"
  assert stored_request["objectKey"] == owned_media["object_key"]
  assert stored_request["mediaId"] == str(owned_media["id"])
  assert stored_request["task"] == "face_makeup_recommendation_report_v1"


@pytest.mark.asyncio
async def test_owned_media_and_capture_must_reference_same_file() -> None:
  db = OwnedMediaDatabase(media_row(), media_row())

  with pytest.raises(AppError) as exc_info:
    await resolve_owned_source_media(
      db,
      owner_user_id=OWNER_USER_ID,
      media_id=uuid4(),
      photo_capture_id=uuid4(),
      required=True,
    )

  assert exc_info.value.code == "MEDIA_CAPTURE_MISMATCH"


@pytest.mark.asyncio
async def test_owned_media_lookup_is_bound_to_user_and_active_state() -> None:
  owned_media = media_row()
  db = OwnedMediaDatabase(owned_media)

  resolved = await resolve_owned_source_media(
    db,
    owner_user_id=OWNER_USER_ID,
    media_id=owned_media["id"],
    photo_capture_id=None,
    required=True,
  )

  assert resolved == owned_media
  query, args = db.calls[0]
  assert "owner_user_id = $2" in query
  assert "status = 'active'" in query
  assert "deleted_at is null" in query
  assert args == (owned_media["id"], OWNER_USER_ID)


def test_trusted_payload_replaces_client_location_with_database_location() -> None:
  owned_media = media_row()

  payload = trusted_media_request_payload(
    Settings(s3_bucket_name="media-bucket"),
    {
      "bucket": "victim-bucket",
      "contentType": "image/gif",
      "objectKey": "private/victim.jpg",
      "imageUrl": "s3://victim-bucket/private/victim.jpg",
      "sourceUri": "file:///private/device-photo.jpg",
      "task": "face_makeup_recommendation_report_v1",
    },
    owned_media,
  )

  assert payload["bucket"] == "media-bucket"
  assert payload["contentType"] == owned_media["content_type"]
  assert payload["objectKey"] == owned_media["object_key"]
  assert payload["mediaId"] == str(owned_media["id"])
  assert payload["task"] == "face_makeup_recommendation_report_v1"
  assert "imageUrl" not in payload
  assert "sourceUri" not in payload


def test_database_media_location_must_be_inside_managed_bucket_and_prefix() -> None:
  poisoned_media = {
    **media_row(),
    "bucket": "victim-bucket",
    "object_key": "private/victim.jpg",
  }

  with pytest.raises(AppError) as exc_info:
    trusted_media_request_payload(
      Settings(s3_bucket_name="media-bucket"),
      {},
      poisoned_media,
    )

  assert exc_info.value.code == "S3_TARGET_NOT_MANAGED"
