import pytest

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.bedrock import BedrockService
from app.services.s3 import S3Service


class FakeS3Client:
  def generate_presigned_url(self, operation: str, Params: dict, ExpiresIn: int) -> str:
    assert operation == "put_object"
    assert Params["Bucket"] == "aura-dev-bucket"
    assert Params["ContentType"] == "image/jpeg"
    assert ExpiresIn == 900

    return f"https://upload.example.com/{Params['Key']}"


class FakeS3Service(S3Service):
  def _client(self):
    return FakeS3Client()


def test_effective_cdn_base_url_prefers_explicit_url() -> None:
  settings = Settings(cdn_base_url="https://cdn.example.com/", cloudfront_domain="ignored.cloudfront.net")

  assert settings.effective_cdn_base_url == "https://cdn.example.com"


def test_effective_cdn_base_url_wraps_cloudfront_domain() -> None:
  settings = Settings(cloudfront_domain="d123.cloudfront.net/")

  assert settings.effective_cdn_base_url == "https://d123.cloudfront.net"


def test_s3_presigned_upload_uses_cdn_url_and_file_extension() -> None:
  settings = Settings(
    s3_bucket_name="aura-dev-bucket",
    cdn_base_url="https://cdn.example.com",
  )

  upload = FakeS3Service(settings).create_presigned_upload(
    media_kind="capture",
    content_type="image/jpeg",
    original_filename="face.JPG",
  )

  assert upload["bucket"] == "aura-dev-bucket"
  assert upload["object_key"].startswith("uploads/capture/")
  assert upload["object_key"].endswith(".jpg")
  assert upload["cdn_url"] == f"https://cdn.example.com/{upload['object_key']}"
  assert upload["method"] == "PUT"


def test_s3_presigned_upload_requires_bucket() -> None:
  with pytest.raises(AppError) as exc_info:
    S3Service(Settings()).create_presigned_upload("capture", "image/jpeg", None)

  assert exc_info.value.code == "S3_NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_bedrock_requires_model_id() -> None:
  with pytest.raises(AppError) as exc_info:
    await BedrockService(Settings()).analyze_image({})

  assert exc_info.value.code == "BEDROCK_NOT_CONFIGURED"


def test_public_config_status_accepts_iam_role_for_aws_credentials() -> None:
  settings = Settings(aws_use_iam_role=True)

  status = settings.public_config_status()

  assert status["items"]["awsCredentialsOrRole"]["configured"] is True
  assert status["items"]["awsCredentialsOrRole"]["source"] == "iam_role"
  assert "awsCredentialsOrRole" not in status["missing"]


def test_public_config_status_accepts_access_key_pair_for_aws_credentials() -> None:
  settings = Settings(aws_access_key_id="AKIAEXAMPLE", aws_secret_access_key="secret")

  status = settings.public_config_status()

  assert status["items"]["awsCredentialsOrRole"]["configured"] is True
  assert status["items"]["awsCredentialsOrRole"]["source"] == "access_key"
  assert "awsCredentialsOrRole" not in status["missing"]