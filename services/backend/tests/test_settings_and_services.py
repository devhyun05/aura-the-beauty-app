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


def test_gpt_image_2_edit_params_omit_input_fidelity() -> None:
  service = OpenAIAnalysisService(Settings(openai_image_model_id="gpt-image-2"))

  params = service._build_image_edit_params(object(), "apply makeup", "auto")

  assert params["model"] == "gpt-image-2"
  assert params["output_format"] == "jpeg"
  assert params["output_compression"] == 80
  assert params["response_format"] == "b64_json"
  assert "input_fidelity" not in params


def test_gpt_image_1_edit_params_keep_high_input_fidelity() -> None:
  service = OpenAIAnalysisService(Settings(openai_image_model_id="gpt-image-1"))

  params = service._build_image_edit_params(object(), "apply makeup", "auto")

  assert params["response_format"] == "b64_json"
  assert params["input_fidelity"] == "high"


def test_makeup_image_upload_uses_jpeg_output_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
  captured = {}
  service = OpenAIAnalysisService(
    Settings(s3_bucket_name="aura-dev-bucket", cdn_base_url="https://cdn.example.com"),
  )

  class FakeGeneratedImageS3Client:
    def put_object(self, **kwargs):
      captured.update(kwargs)

  monkeypatch.setattr(service, "_s3_client", lambda: FakeGeneratedImageS3Client())

  upload = service._upload_generated_image(b"image-bytes", 1)

  assert captured["Bucket"] == "aura-dev-bucket"
  assert captured["Body"] == b"image-bytes"
  assert captured["ContentType"] == "image/jpeg"
  assert captured["Key"].startswith("uploads/generated-makeup/")
  assert captured["Key"].endswith("-1.jpg")
  assert upload["objectKey"] == captured["Key"]
  assert upload["imageUrl"] == f"https://cdn.example.com/{captured['Key']}"


def test_makeup_image_output_format_can_use_webp() -> None:
  service = OpenAIAnalysisService(
    Settings(openai_image_output_format="webp", openai_image_output_compression=70),
  )

  params = service._build_image_edit_params(object(), "apply makeup", "auto")

  assert params["output_format"] == "webp"
  assert params["output_compression"] == 70


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


def test_naver_lip_item_scores_against_analysis_report_terms() -> None:
  product = _map_naver_item(
    {
      "brand": "삐아",
      "category2": "화장품/미용",
      "category3": "립메이크업",
      "image": "https://example.com/bbia-lip.jpg",
      "link": "https://smartstore.naver.com/example/products/10529189729",
      "lprice": "12000",
      "maker": "지앤아이코스메틱",
      "mallName": "삐아 공식스토어",
      "productId": "10529189729",
      "title": "삐아 매트 립틴트 베이지 핑크 코랄 웜톤 쿨톤",
    },
    "lip",
    0,
    {
      "makeupGuideline": {"lip": "코랄 핑크 립을 매트하게 정돈해요."},
      "personalColor": "봄웜 라이트",
      "recommendedMood": "코랄 베이지 데일리 룩",
      "skinType": "복합성 피부",
      "toneSummary": "맑은 웜 아이보리 톤",
    },
  )

  assert product is not None
  assert product["brandName"] == "삐아"
  assert product["matchRate"] >= 90
  assert product["productInfo"]["productNumber"] == "10529189729"
  assert product["productInfo"]["maker"] == "지앤아이코스메틱"
  assert "코랄" in product["productInfo"]["colors"]
  assert "매트" in product["productInfo"]["effects"]
  assert "웜톤" in product["tags"]
  assert "코랄" in product["reason"]
