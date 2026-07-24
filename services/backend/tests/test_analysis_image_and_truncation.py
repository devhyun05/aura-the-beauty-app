"""Stage 1 회귀 테스트 — 분석 이미지 다운스케일 + Bedrock 절단(stop_reason) 관측.

배경: 분석 경로는 S3 원본을 그대로 base64로 보내 대형 사진이면 Bedrock 이미지
한도 초과로 실패했고, max_tokens 절단은 stop_reason을 확인하지 않아 원인 없이
검증 실패(FACE_ANALYSIS_AI_INCOMPLETE)로만 보였다.
"""

import json
from io import BytesIO

import pytest
from PIL import Image

from app.api import analysis as analysis_api
from app.core.errors import AppError
from app.core.settings import Settings
from app.services.openai_analysis import FACE_ANALYSIS_TOOL_NAME, OpenAIAnalysisService


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


def _bedrock_service(
    fake_client: _FakeBedrockClient,
    *,
    tool_enforcement: bool = True,
) -> OpenAIAnalysisService:
    service = _service(
        ai_provider="bedrock",
        bedrock_analysis_model_id="test-analysis-model",
        bedrock_analysis_tool_enforcement=tool_enforcement,
    )
    service._bedrock_runtime_client = lambda: fake_client  # type: ignore[method-assign]
    # 이미지 변환은 이 테스트의 관심사가 아니므로 통과시킨다.
    service._prepare_source_image_for_analysis = (  # type: ignore[method-assign]
        lambda image_bytes, content_type: (image_bytes, content_type)
    )
    return service


def test_bedrock_analysis_request_enforces_schema_tool_choice():
    fake = _FakeBedrockClient(
        {
            "stop_reason": "end_turn",
            "content": [{"type": "text", "text": '{"faceShape":"oval"}'}],
        }
    )
    service = _bedrock_service(fake, tool_enforcement=True)

    with pytest.raises(AppError) as exc_info:
        service._analyze_image_with_bedrock_sync({}, b"image-bytes")

    assert exc_info.value.code == "BEDROCK_TOOL_USE_MISSING"
    request_body = fake.request_bodies[0]
    assert request_body["tool_choice"] == {
        "type": "tool",
        "name": "return_face_analysis_report",
    }
    assert request_body["tools"][0]["name"] == "return_face_analysis_report"
    schema = request_body["tools"][0]["input_schema"]
    required = set(schema["required"])
    assert "faceShape" in required
    assert {"personalColor", "toneSummary"}.isdisjoint(required)
    assert "recommendedMakeups" not in schema["properties"]
    assert "recommendedMakeups" not in required
    assert schema["properties"]["impressionNotes"]["properties"]["keywords"][
        "maxItems"
    ] == 5
    assert schema["properties"]["stylingLooks"]["properties"]["natural"][
        "properties"
    ]["rows"]["maxItems"] == 6


def test_analysis_validator_requires_ai_report_fields():
    service = _service()

    with pytest.raises(AppError) as exc_info:
        service._validate_analysis_result_before_normalization({})

    assert exc_info.value.code == "FACE_ANALYSIS_AI_INCOMPLETE"
    missing_fields = set(exc_info.value.details["missingFields"])
    assert {"faceShape", "skinType"} <= missing_fields
    assert {"personalColor", "toneSummary"}.isdisjoint(missing_fields)
    assert "recommendedMakeups" not in missing_fields


def test_face_report_recommended_look_image_path_is_removed():
    assert not hasattr(analysis_api, "generate_analysis_images_background")
    assert not hasattr(analysis_api, "schedule_analysis_images_background")
    assert not hasattr(OpenAIAnalysisService, "prepare_generation_source")
    assert not hasattr(OpenAIAnalysisService, "generate_recommended_makeup_images")


def test_bedrock_truncation_attaches_stop_reason_to_failure():
    # 절단으로 필수 필드가 빠진 (그러나 파싱은 되는) 부분 도구 응답.
    fake = _FakeBedrockClient(
        {
            "stop_reason": "max_tokens",
            "content": [
                {
                    "type": "tool_use",
                    "name": FACE_ANALYSIS_TOOL_NAME,
                    "input": {"faceShape": "계란형"},
                }
            ],
        }
    )
    service = _bedrock_service(fake)

    with pytest.raises(AppError) as exc_info:
        service._analyze_image_with_bedrock_sync({}, b"image-bytes")

    assert exc_info.value.code == "FACE_ANALYSIS_AI_INCOMPLETE"
    assert exc_info.value.details.get("stopReason") == "max_tokens"


def test_structured_v2_stage_truncation_attaches_stop_reason():
    # dev 라이브 경로(V2 스테이지)도 절단 시 stopReason을 관측·전파해야 한다.
    fake = _FakeBedrockClient(
        {
            "stop_reason": "max_tokens",
            # 절단된 부분 JSON — 파싱 불가.
            "content": [{"type": "text", "text": '{"metrics": {"skin.text'}],
        }
    )
    service = _bedrock_service(fake)

    with pytest.raises(AppError) as exc_info:
        service._analyze_structured_json_sync(
            developer_prompt="dev",
            user_prompt="user",
            json_schema={"type": "object"},
            source_image_bytes=None,
            max_tokens=2800,
        )

    assert exc_info.value.details.get("stopReason") == "max_tokens"


def test_structured_v2_stage_missing_tool_reports_stop_reason():
    fake = _FakeBedrockClient({"stop_reason": "max_tokens", "content": []})
    service = _bedrock_service(fake)

    with pytest.raises(AppError) as exc_info:
        service._analyze_structured_json_sync(
            developer_prompt="dev",
            user_prompt="user",
            json_schema={"type": "object"},
            source_image_bytes=None,
            max_tokens=2800,
        )

    assert exc_info.value.code == "BEDROCK_TOOL_USE_MISSING"
    assert exc_info.value.details.get("stopReason") == "max_tokens"


def test_bedrock_call_metrics_logs_tokens_and_duration(caplog):
    # Stage 7 계측: 양 경로가 동일 포맷으로 토큰·지연을 남겨 A/B 비교를 가능케 한다.
    import logging

    service = _service()
    with caplog.at_level(logging.INFO):
        service._log_bedrock_call_metrics(
            {"usage": {"input_tokens": 1200, "output_tokens": 3400}},
            context="stage",
            started_at=0.0,
        )

    metric_logs = [r.getMessage() for r in caplog.records if ":metrics" in r.getMessage()]
    assert metric_logs
    assert "inputTokens=1200" in metric_logs[0]
    assert "outputTokens=3400" in metric_logs[0]


def test_structured_v2_stage_reports_provider_usage_to_callback():
    fake = _FakeBedrockClient(
        {
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 1200, "output_tokens": 340},
            "content": [
                {
                    "type": "tool_use",
                    "name": "return_structured_output",
                    "input": {"ok": True},
                }
            ],
        }
    )
    service = _bedrock_service(fake)
    observed = []

    result = service._analyze_structured_json_sync(
        developer_prompt="dev",
        user_prompt="user",
        json_schema={"type": "object"},
        source_image_bytes=None,
        max_tokens=2800,
        stage="measure",
        on_call_metrics=observed.append,
    )

    assert result == {"ok": True}
    assert len(observed) == 1
    assert observed[0].input_tokens == 1200
    assert observed[0].output_tokens == 340


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
    assert service.settings.bedrock_analysis_max_tokens == 8192
