from fastapi.testclient import TestClient

from app.db.session import require_database
from app.main import create_app


class ValidationOnlyDatabase:
  async def fetchrow(self, *_args, **_kwargs):
    return None

  async def fetch(self, *_args, **_kwargs):
    return []

  async def execute(self, *_args, **_kwargs):
    return "OK"


def make_validation_client() -> TestClient:
  app = create_app()
  app.dependency_overrides[require_database] = lambda: ValidationOnlyDatabase()

  return TestClient(app)


def test_invalid_uuid_path_returns_validation_error() -> None:
  client = make_validation_client()

  response = client.get("/api/analysis/jobs/not-a-uuid")

  assert response.status_code == 422
  body = response.json()
  assert body["data"] is None
  assert body["error"]["code"] == "VALIDATION_ERROR"


def test_presigned_upload_rejects_unsafe_media_kind() -> None:
  client = TestClient(create_app())

  response = client.post(
    "/api/media/presigned-upload",
    json={
      "mediaKind": "../capture",
      "contentType": "image/jpeg",
      "originalFilename": "capture.jpg",
    },
  )

  assert response.status_code == 422
  body = response.json()
  assert body["error"]["code"] == "VALIDATION_ERROR"


def test_photo_capture_requires_uuid_media_id() -> None:
  client = make_validation_client()

  response = client.post(
    "/api/photo-captures",
    json={
      "mediaId": "not-a-uuid",
      "captureType": "face_analysis",
      "source": "camera",
    },
  )

  assert response.status_code == 422
  body = response.json()
  assert body["error"]["code"] == "VALIDATION_ERROR"