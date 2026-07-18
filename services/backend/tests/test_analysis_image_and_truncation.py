"""Stage 1 회귀 테스트 — 분석 이미지 다운스케일 + Bedrock 절단(stop_reason) 관측.

배경: 분석 경로는 S3 원본을 그대로 base64로 보내 대형 사진이면 Bedrock 이미지
한도 초과로 실패했고, max_tokens 절단은 stop_reason을 확인하지 않아 원인 없이
검증 실패(FACE_ANALYSIS_AI_INCOMPLETE)로만 보였다.
"""

import json
from io import BytesIO

import pytest
from PIL import Image

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.openai_analysis import OpenAIAnalysisService


def _service(**overrides) -> OpenAIAnalysisService:
    return OpenAIAnalysisService(Settings(**overrides))


def _png_bytes(width: int, height: int) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (width, height), (200, 160, 140)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_prepare_source_image_for_analysis_downscales_large_photo():
    service = _service()
    max_edge = service.settings.openai_image_input_max_edge

    optimized_bytes, content_type = service._prepare_source_image_for_analysis(
        _png_bytes(max_edge * 3, max_edge * 2),
        "image/png",
    )

    assert content_type == "image/jpeg"
    with Image.open(BytesIO(optimized_bytes)) as optimized:
        assert max(optimized.size) <= max_edge


def test_prepare_source_image_for_analysis_rejects_oversize_output(monkeypatch):
    service = _service()
    oversize = b"x" * (service._ANALYSIS_IMAGE_MAX_BYTES + 1)
    monkeypatch.setattr(
        service,
        "_convert_image_for_speed",
        lambda image_bytes, **kwargs: (oversize, "image/jpeg"),
    )

    with pytest.raises(AppError) as exc_info:
        service._prepare_source_image_for_analysis(b"raw", "image/jpeg")

    assert exc_info.value.status_code == 413
    assert exc_info.value.code == "SOURCE_IMAGE_TOO_LARGE"


class _FakeBedrockClient:
    def __init__(self, response_payload: dict):
        self.response_payload = response_payload
        self.request_bodies: list[dict] = []

    def invoke_model(self, **kwargs):
        self.request_bodies.append(json.loads(kwargs["body"]))
        return {"body": BytesIO(json.dumps(self.response_payload).encode("utf-8"))}


def _bedrock_service(fake_client: _FakeBedrockClient) -> OpenAIAnalysisService:
    service = _service(
        ai_provider="bedrock",
        bedrock_analysis_model_id="test-analysis-model",
    )
    service._bedrock_runtime_client = lambda: fake_client  # type: ignore[method-assign]
    # 이미지 변환은 이 테스트의 관심사가 아니므로 통과시킨다.
    service._prepare_source_image_for_analysis = (  # type: ignore[method-assign]
        lambda image_bytes, content_type: (image_bytes, content_type)
    )
    return service


def test_bedrock_truncation_attaches_stop_reason_to_failure():
    # 절단으로 필수 필드가 빠진 (그러나 파싱은 되는) 부분 JSON.
    fake = _FakeBedrockClient(
        {
            "stop_reason": "max_tokens",
            "content": [{"type": "text", "text": json.dumps({"faceShape": "계란형"})}],
        }
    )
    service = _bedrock_service(fake)

    with pytest.raises(AppError) as exc_info:
        service._analyze_image_with_bedrock_sync({}, b"image-bytes")

    assert exc_info.value.code == "FACE_ANALYSIS_AI_INCOMPLETE"
    assert exc_info.value.details.get("stopReason") == "max_tokens"


def test_bedrock_request_uses_configured_max_tokens():
    fake = _FakeBedrockClient(
        {
            "stop_reason": "end_turn",
            "content": [{"type": "text", "text": json.dumps({"faceShape": "계란형"})}],
        }
    )
    service = _bedrock_service(fake)

    with pytest.raises(AppError):
        # 필수 필드 부족으로 검증 실패하지만, 요청 본문은 이미 기록됐다.
        service._analyze_image_with_bedrock_sync({}, b"image-bytes")

    assert fake.request_bodies, "invoke_model이 호출되어야 한다"
    assert (
        fake.request_bodies[0]["max_tokens"]
        == service.settings.bedrock_analysis_max_tokens
    )
    assert service.settings.bedrock_analysis_max_tokens >= 4000
