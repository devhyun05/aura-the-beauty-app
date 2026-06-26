from fastapi.testclient import TestClient

from app.main import create_app


def test_users_me_returns_database_not_configured_without_database() -> None:
  client = TestClient(create_app())

  response = client.get("/api/users/me")

  assert response.status_code == 503
  body = response.json()
  assert body["data"] is None
  assert body["error"]["code"] == "DATABASE_NOT_CONFIGURED"


def test_presigned_upload_returns_s3_not_configured_without_bucket() -> None:
  client = TestClient(create_app())

  response = client.post(
    "/api/media/presigned-upload",
    json={
      "mediaKind": "capture",
      "contentType": "image/jpeg",
      "source": "camera",
      "originalFilename": "capture.jpg",
    },
  )

  assert response.status_code == 503
  body = response.json()
  assert body["data"] is None
  assert body["error"]["code"] == "S3_NOT_CONFIGURED"
