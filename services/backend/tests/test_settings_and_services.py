from io import BytesIO

import pytest

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.openai_analysis import OpenAIAnalysisService
from app.services.s3 import S3Service
from app.services import shopping_products
from app.services.shopping_products import _apply_semantic_product_scores, _map_naver_item


class FakeS3Client:
  def generate_presigned_url(self, operation: str, Params: dict, ExpiresIn: int) -> str:
    assert operation == "put_object"
    assert Params["Bucket"] == "aura-dev-bucket"
    assert Params["ContentType"] == "image/jpeg"
    assert Params["CacheControl"] == "public, max-age=31536000, immutable"
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
  assert upload["cache_control"] == "public, max-age=31536000, immutable"
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


def test_analysis_normalization_keeps_one_daily_recommended_makeup() -> None:
  result = OpenAIAnalysisService(Settings())._normalize_analysis_result(
    {
      "personalColor": "봄웜",
      "faceShape": "계란형",
      "toneSummary": "맑은 코랄",
      "recommendedMood": "데일리 코랄",
      "recommendedMakeups": [
        {"title": "데일리 코랄", "subtitle": "맑은 생기", "description": "첫 룩", "tags": ["코랄"]},
        {"title": "두 번째", "subtitle": "로지", "description": "두 번째 룩", "tags": ["로즈"]},
      ],
    },
  )

  assert len(result["recommendedMakeups"]) == 1
  assert result["recommendedMakeups"][0]["title"] == "데일리 코랄"


def test_makeup_image_size_uses_auto_to_preserve_source_composition() -> None:
  service = OpenAIAnalysisService(Settings(openai_image_size="1024x1024"))

  assert service._resolve_makeup_image_size() == "auto"


def test_gpt_image_2_edit_params_omit_input_fidelity() -> None:
  service = OpenAIAnalysisService(Settings(openai_image_model_id="gpt-image-2"))

  params = service._build_image_edit_params(object(), "apply makeup", "auto")

  assert params["model"] == "gpt-image-2"
  assert params["quality"] == "low"
  assert params["output_format"] == "jpeg"
  assert params["output_compression"] == 80
  assert "response_format" not in params
  assert "input_fidelity" not in params


def test_gpt_image_1_edit_params_keep_high_input_fidelity() -> None:
  service = OpenAIAnalysisService(Settings(openai_image_model_id="gpt-image-1"))

  params = service._build_image_edit_params(object(), "apply makeup", "auto")

  assert "response_format" not in params
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
  assert captured["CacheControl"] == "public, max-age=31536000, immutable"
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


def test_source_image_is_downscaled_before_openai_edit() -> None:
  image_module = pytest.importorskip("PIL.Image")
  source_image = image_module.new("RGB", (1800, 1200), (232, 188, 172))
  source_buffer = BytesIO()
  source_image.save(source_buffer, format="JPEG", quality=95)
  service = OpenAIAnalysisService(
    Settings(openai_image_input_max_edge=512, openai_image_input_quality=70),
  )

  optimized_bytes, content_type = service._prepare_source_image_for_generation(
    source_buffer.getvalue(),
    "image/jpeg",
  )

  assert content_type == "image/jpeg"

  with image_module.open(BytesIO(optimized_bytes)) as optimized_image:
    assert max(optimized_image.size) == 512
    assert optimized_image.mode == "RGB"


def test_generated_image_is_downscaled_before_s3_upload() -> None:
  image_module = pytest.importorskip("PIL.Image")
  generated_image = image_module.new("RGB", (1600, 1000), (212, 168, 154))
  generated_buffer = BytesIO()
  generated_image.save(generated_buffer, format="JPEG", quality=95)
  service = OpenAIAnalysisService(
    Settings(openai_image_output_max_edge=640, openai_image_output_compression=70),
  )

  optimized_bytes = service._optimize_generated_image_for_upload(generated_buffer.getvalue())

  with image_module.open(BytesIO(optimized_bytes)) as optimized_image:
    assert max(optimized_image.size) == 640



def test_public_config_status_treats_guardrail_as_optional_by_default() -> None:
  status = Settings().public_config_status()

  assert status["items"]["bedrockGuardrail"]["configured"] is True
  assert status["bedrockGuardrailConfigured"] is False
  assert "bedrockGuardrail" not in status["missing"]


def test_public_config_status_requires_guardrail_when_enabled() -> None:
  status = Settings(bedrock_guardrail_required=True).public_config_status()

  assert status["items"]["bedrockGuardrail"]["configured"] is False
  assert "bedrockGuardrail" in status["missing"]

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


def test_s3_client_uses_named_aws_profile(monkeypatch: pytest.MonkeyPatch) -> None:
  captured = {}

  class FakeSession:
    def __init__(self, profile_name: str):
      captured["profile_name"] = profile_name

    def client(self, service_name: str, **kwargs):
      captured["service_name"] = service_name
      captured["kwargs"] = kwargs
      return object()

  monkeypatch.setattr("app.services.s3.boto3.Session", FakeSession)

  S3Service(Settings(aws_profile_name="aura-dev", aws_region="ap-northeast-2"))._client()

  assert captured["profile_name"] == "aura-dev"
  assert captured["service_name"] == "s3"
  assert captured["kwargs"]["region_name"] == "ap-northeast-2"
  assert "aws_access_key_id" not in captured["kwargs"]
  assert "aws_secret_access_key" not in captured["kwargs"]


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


def test_naver_cheek_item_rejects_non_cosmetic_shoes() -> None:
  product = _map_naver_item(
    {
      "brand": "패션브랜드",
      "category1": "패션잡화",
      "category2": "신발",
      "category3": "운동화",
      "image": "https://example.com/shoes.jpg",
      "link": "https://smartstore.naver.com/example/products/999",
      "lprice": "39000",
      "mallName": "슈즈스토어",
      "productId": "999",
      "title": "블러셔 컬러 데일리 운동화 신발",
    },
    "cheek",
    0,
  )

  assert product is None


def test_naver_cheek_item_rejects_fashion_color_blush() -> None:
  product = _map_naver_item(
    {
      "brand": "패션브랜드",
      "category1": "",
      "category2": "",
      "category3": "",
      "image": "https://example.com/fashion-blush.jpg",
      "link": "https://smartstore.naver.com/example/products/998",
      "lprice": "79000",
      "maker": "패션브랜드",
      "mallName": "스타일스토어",
      "productId": "998",
      "title": "벨라 V 블러쉬 로즈쿼츠핑크 스니커즈",
    },
    "cheek",
    0,
  )

  assert product is None


def test_naver_liner_item_rejects_fashion_liner() -> None:
  product = _map_naver_item(
    {
      "brand": "패션브랜드",
      "category1": "",
      "category2": "",
      "category3": "",
      "image": "https://example.com/fashion-liner.jpg",
      "link": "https://smartstore.naver.com/example/products/997",
      "lprice": "69000",
      "maker": "패션브랜드",
      "mallName": "스타일스토어",
      "productId": "997",
      "title": "밀리 버튼 라이너 베이지 재킷",
    },
    "liner",
    0,
  )

  assert product is None


def test_naver_base_item_rejects_uncategorized_living_cushion() -> None:
  product = _map_naver_item(
    {
      "brand": "리빙브랜드",
      "category1": "",
      "category2": "",
      "category3": "",
      "image": "https://example.com/living-cushion.jpg",
      "link": "https://smartstore.naver.com/example/products/996",
      "lprice": "19000",
      "mallName": "홈스토어",
      "productId": "996",
      "title": "베이지 톤업 쿠션 커버 소파 방석",
    },
    "base",
    0,
  )

  assert product is None


def test_naver_cheek_item_accepts_cosmetic_blusher() -> None:
  product = _map_naver_item(
    {
      "brand": "롬앤",
      "category1": "화장품/미용",
      "category2": "색조메이크업",
      "category3": "블러셔",
      "image": "https://example.com/blusher.jpg",
      "link": "https://smartstore.naver.com/example/products/1000",
      "lprice": "12000",
      "mallName": "롬앤 공식스토어",
      "productId": "1000",
      "title": "롬앤 베러 댄 치크 피치 블러셔",
    },
    "cheek",
    0,
  )

  assert product is not None
  assert product["category"] == "cheek"
  assert product["productName"] == "롬앤 베러 댄 치크 피치 블러셔"


def test_naver_liner_query_excludes_brow_products() -> None:
  assert "브로우" not in shopping_products.CATEGORY_CONFIG["liner"]["query"]
  assert shopping_products.CATEGORY_GUIDE_KEYS["liner"] == ("makeupGuideline.eyeliner",)


def test_product_makeup_look_uses_first_generated_makeup_card() -> None:
  look = shopping_products._build_makeup_look(
    {
      "personalColor": "봄웜 라이트",
      "recommendedMakeups": [
        {
          "description": "로즈 베이지 립과 피치 블러셔로 맑게 정돈한 룩",
          "imageUrl": "https://cdn.example.com/generated-makeup/first.jpg",
          "palette": ["#C96F72", "#F0AAA0"],
          "tags": ["로즈 베이지", "피치"],
          "title": "로즈 베이지 클린 룩",
        },
      ],
      "skinAnalysisSummary": "피부는 전반적으로 균일하며 약간의 유분감이 관찰됩니다.",
    },
  )

  assert look["title"] == "로즈 베이지 클린 룩"
  assert look["description"] == "로즈 베이지 립과 피치 블러셔로 맑게 정돈한 룩"
  assert look["imageUrl"] == "https://cdn.example.com/generated-makeup/first.jpg"
  assert look["palette"] == ["#C96F72", "#F0AAA0"]
  assert "로즈 베이지" in look["tags"]


def test_product_makeup_look_uses_selected_generated_makeup_card() -> None:
  look = shopping_products._build_makeup_look(
    {
      "recommendedMakeups": [
        {
          "description": "피치 립과 치크",
          "imageUrl": "https://cdn.example.com/generated-makeup/first.jpg",
          "tags": ["피치"],
          "title": "피치 클린 룩",
        },
        {
          "description": "브라운 라인과 로즈 립",
          "imageUrl": "https://cdn.example.com/generated-makeup/second.jpg",
          "tags": ["브라운", "로즈"],
          "title": "브라운 로즈 룩",
        },
      ],
      "selectedRecommendedMakeupIndex": 1,
    },
  )

  assert look["title"] == "브라운 로즈 룩"
  assert look["imageUrl"] == "https://cdn.example.com/generated-makeup/second.jpg"
  assert "브라운" in look["tags"]
  assert "#C96F72" in look["palette"]
  assert "#8B5F55" in look["palette"]


def test_product_makeup_look_options_include_generated_cards() -> None:
  options = shopping_products._build_makeup_look_options(
    {
      "recommendedMakeups": [
        {
          "imageUrl": "https://cdn.example.com/generated-makeup/first.jpg",
          "tags": ["피치"],
          "title": "피치 클린 룩",
        },
        {
          "imageUrl": "https://cdn.example.com/generated-makeup/second.jpg",
          "tags": ["로즈"],
          "title": "브라운 로즈 룩",
        },
      ],
    },
  )

  assert [option["index"] for option in options] == [0, 1]
  assert options[1]["title"] == "브라운 로즈 룩"
  assert "#ED8F73" in options[0]["palette"]
  assert "#C96F72" in options[1]["palette"]


def test_product_profile_text_includes_generated_makeup_terms() -> None:
  text = shopping_products._profile_text(
    {
      "recommendedMakeups": [
        {
          "description": "코랄 립과 피치 블러셔를 중심으로 한 아이돌 메이크업",
          "tags": ["코랄", "피치"],
          "title": "코랄 아이돌 룩",
        },
      ],
    },
    "lip",
  )

  assert "코랄 아이돌 룩" in text
  assert "피치 블러셔" in text


@pytest.mark.asyncio
async def test_naver_category_fetch_uses_fallback_query_when_first_query_is_empty() -> None:
  calls = []

  class FakeResponse:
    def __init__(self, items):
      self._items = items

    def raise_for_status(self):
      return None

    def json(self):
      return {"items": self._items}

  class FakeClient:
    async def get(self, url, *, headers, params):
      calls.append(params["query"])

      if len(calls) == 1:
        return FakeResponse([])

      return FakeResponse(
        [
          {
            "brand": "롬앤",
            "category1": "화장품/미용",
            "category2": "색조메이크업",
            "category3": "블러셔",
            "image": "https://example.com/blusher.jpg",
            "link": "https://smartstore.naver.com/example/products/1000",
            "lprice": "12000",
            "mallName": "롬앤 공식스토어",
            "productId": "1000",
            "title": "롬앤 베러 댄 치크 피치 블러셔",
          },
        ],
      )

  products = await shopping_products._fetch_naver_category_products(
    FakeClient(),
    Settings(
      naver_shopping_client_id="client-id",
      naver_shopping_client_secret="client-secret",
    ),
    "cheek",
  )

  assert len(calls) >= 2
  assert products[0]["productName"] == "롬앤 베러 댄 치크 피치 블러셔"


@pytest.mark.asyncio
async def test_semantic_product_scores_rerank_by_report_embedding(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  monkeypatch.setattr(
    shopping_products,
    "_bedrock_embedding_client",
    lambda settings: object(),
  )

  def fake_embedding(client, settings, text: str):
    if text.startswith("추천 카테고리"):
      return [1.0, 0.0]

    if "코랄" in text and "베이지" in text:
      return [1.0, 0.0]

    return [0.0, 1.0]

  monkeypatch.setattr(
    shopping_products,
    "_invoke_bedrock_text_embedding",
    fake_embedding,
  )
  products = [
    {
      "id": "rule-high",
      "brandName": "테스트",
      "productName": "쿨톤 플럼 립",
      "category": "lip",
      "matchRate": 96,
      "tags": ["쿨톤", "플럼"],
      "productInfo": {"colors": ["플럼"], "tones": ["쿨톤"]},
      "reason": "규칙 점수는 높은 상품",
    },
    {
      "id": "semantic-high",
      "brandName": "테스트",
      "productName": "코랄 베이지 립",
      "category": "lip",
      "matchRate": 70,
      "tags": ["코랄", "베이지"],
      "productInfo": {"colors": ["코랄", "베이지"], "tones": ["웜톤"]},
      "reason": "보고서 톤과 가까운 상품",
    },
  ]

  ranked_products, semantic_applied = await _apply_semantic_product_scores(
    products,
    Settings(bedrock_embedding_model_id="amazon.titan-embed-text-v2:0"),
    {
      "makeupGuideline": {"lip": "코랄 베이지 립을 매트하게 정돈해요."},
      "personalColor": "봄웜 라이트",
      "recommendedMood": "코랄 베이지 데일리 룩",
      "toneSummary": "맑은 웜 아이보리 톤",
    },
  )

  assert semantic_applied is True
  assert ranked_products[0]["id"] == "semantic-high"
  assert ranked_products[0]["semanticMatchRate"] == 100
  assert ranked_products[0]["matchRate"] > ranked_products[1]["matchRate"]
