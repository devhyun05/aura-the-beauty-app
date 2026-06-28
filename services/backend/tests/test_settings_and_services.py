import pytest

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.openai_analysis import OpenAIAnalysisService
from app.services.s3 import S3Service
from app.services.shopping_products import _map_naver_item


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
async def test_openai_analysis_requires_source_image() -> None:
  with pytest.raises(AppError) as exc_info:
    await OpenAIAnalysisService(Settings()).analyze_image({})

  assert exc_info.value.code == "SOURCE_IMAGE_REQUIRED"


def test_makeup_image_prompt_requests_visible_idol_makeup() -> None:
  prompt = OpenAIAnalysisService(Settings())._build_makeup_image_prompt(
    {
      "personalColor": "spring warm",
      "faceShape": "oval",
      "toneSummary": "clear and warm",
      "recommendedMood": "fresh idol glow",
    },
    {
      "title": "Clear Idol Glow",
      "subtitle": "fresh K-beauty",
      "description": "tone-up base, clear eye definition, peach blush, and glossy lip",
      "tags": ["idol", "glow"],
    },
  )

  assert len(prompt) <= 2200
  assert "K-beauty idol makeup" in prompt
  assert "Generate exactly one final makeup-applied photo only" in prompt
  assert "Forbidden: split-screen" in prompt
  assert "Preserve the exact same canvas, camera distance, face size" in prompt
  assert "Do not zoom in, zoom out, crop tighter" in prompt
  assert "at least three visible makeup changes" in prompt
  assert "Recommended mood: fresh idol glow" in prompt
  assert "Before" not in prompt
  assert "After" not in prompt


def test_makeup_image_size_uses_auto_to_preserve_source_composition() -> None:
  service = OpenAIAnalysisService(Settings(openai_image_size="1024x1024"))

  assert service._resolve_makeup_image_size() == "auto"


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

def test_s3_client_uses_explicit_access_key_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
  captured = {}

  def fake_boto3_client(service_name: str, **kwargs):
    captured["service_name"] = service_name
    captured["kwargs"] = kwargs
    return object()

  monkeypatch.setattr("app.services.s3.boto3.client", fake_boto3_client)

  S3Service(
    Settings(
      aws_access_key_id="AKIAEXAMPLE",
      aws_secret_access_key="secret",
      aws_region="ap-northeast-2",
    ),
  )._client()

  assert captured["service_name"] == "s3"
  assert captured["kwargs"]["aws_access_key_id"] == "AKIAEXAMPLE"
  assert captured["kwargs"]["aws_secret_access_key"] == "secret"
  assert captured["kwargs"]["region_name"] == "ap-northeast-2"
  assert captured["kwargs"]["endpoint_url"] == "https://s3.ap-northeast-2.amazonaws.com"
  assert captured["kwargs"]["config"].signature_version == "s3v4"


def test_s3_client_omits_credentials_for_iam_role_chain(monkeypatch: pytest.MonkeyPatch) -> None:
  captured = {}

  def fake_boto3_client(service_name: str, **kwargs):
    captured["service_name"] = service_name
    captured["kwargs"] = kwargs
    return object()

  monkeypatch.setattr("app.services.s3.boto3.client", fake_boto3_client)

  S3Service(Settings(aws_region="ap-northeast-2", aws_use_iam_role=True))._client()

  assert captured["service_name"] == "s3"
  assert captured["kwargs"]["region_name"] == "ap-northeast-2"
  assert captured["kwargs"]["endpoint_url"] == "https://s3.ap-northeast-2.amazonaws.com"
  assert "aws_access_key_id" not in captured["kwargs"]
  assert "aws_secret_access_key" not in captured["kwargs"]
  assert captured["kwargs"]["config"].signature_version == "s3v4"


def test_naver_shopping_item_uses_product_detail_link_and_korean_title() -> None:
  product = _map_naver_item(
    {
      "brand": "3CE",
      "category2": "화장품/미용",
      "category3": "립메이크업",
      "image": "https://example.com/lip.jpg",
      "link": "https://openapi.naver.com/l?where=shop&query=lip&u=detail",
      "lprice": "17000",
      "mallName": "공식스토어",
      "productId": "1234",
      "title": "<b>3CE</b> Velvet Lip Tint",
    },
    "lip",
    0,
  )

  assert product is not None
  assert product["productName"] == "립 추천 상품"
  assert product["shadeName"] == ""
  assert product["purchaseUrl"] == "https://openapi.naver.com/l?where=shop&query=lip&u=detail"
