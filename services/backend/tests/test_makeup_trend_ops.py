import json
from pathlib import Path
from uuid import UUID

import pytest

from app.core.settings import Settings
from app.services import makeup_recommendation, makeup_recommendation_image
from app.services.makeup_ai_observability import build_ai_metric
from app.services.makeup_trend_import import (
  TrendImportValidationError,
  import_trend_items,
  parse_trend_import_payload,
)


def _item(**overrides):
  value = {
    "text": "  투명   베리 글레이즈  ",
    "seedPrompt": "얇은 베리 색과 투명 광택을 연결한다.",
    "sourceUrl": "https://example.com/trend",
    "sourcePublishedAt": "2026-07-01T00:00:00Z",
    "market": "ko-KR",
    "locale": "ko_kr",
    "evidence": "원문이 해당 색과 질감을 트렌드로 제시했다.",
    "asOf": "2026-07-16T00:00:00Z",
    "expiresAt": "2026-10-14T00:00:00Z",
    "confidence": "a",
    "situations": ["date"],
  }
  value.update(overrides)
  return value


def test_import_normalizes_nfkc_whitespace_and_defaults_to_draft() -> None:
  items = parse_trend_import_payload({"items": [_item(text="Ｔｒｅｎｄ   Berry")]})
  assert len(items) == 1
  assert items[0].text == "Trend Berry"
  assert items[0].normalized_text == "trend berry"
  assert items[0].locale == "ko-KR"
  assert items[0].market == "KR"
  assert items[0].review_status == "draft"
  assert items[0].source_name == "example.com"


def test_import_composite_dedupe_merges_situation_mapping() -> None:
  first = _item(situations=["date"], tags=["berry"])
  second = _item(text="투명 베리   글레이즈", situations=["camera_content"], tags=["glaze"])
  items = parse_trend_import_payload([first, second], approve=True)
  assert len(items) == 1
  assert items[0].situation_keys == ("date", "camera_content")
  assert items[0].tags == ("berry", "glaze")
  assert items[0].review_status == "approved"


def test_import_rejects_missing_provenance_and_invalid_freshness() -> None:
  with pytest.raises(TrendImportValidationError, match="sourceUrl"):
    parse_trend_import_payload([_item(sourceUrl="")])
  with pytest.raises(TrendImportValidationError, match="expiresAt"):
    parse_trend_import_payload([_item(expiresAt="2026-07-15T00:00:00Z")])
  with pytest.raises(TrendImportValidationError, match="unknown keys"):
    parse_trend_import_payload([_item(situations=["custom"])])


class _Connection:
  def __init__(self) -> None:
    self.executions = []

  async def fetch(self, _query, keys):
    return [{"id": UUID(int=index + 1), "key": key} for index, key in enumerate(keys)]

  async def fetchrow(self, _query, *args):
    self.keyword_args = args
    return {"id": UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), "review_status": args[11]}

  async def execute(self, query, *args):
    self.executions.append((query, args))


class _Database:
  def __init__(self) -> None:
    self.connection = _Connection()

  async def run_in_transaction(self, operation):
    return await operation(self.connection)


@pytest.mark.asyncio
async def test_draft_mapping_is_disabled_and_explicit_approval_activates() -> None:
  draft_db = _Database()
  draft = parse_trend_import_payload([_item()])
  draft_result = await import_trend_items(draft_db, draft)
  assert draft_result == {"status": "draft", "imported": 1, "skippedApproved": 0, "mappings": 1}
  assert draft_db.connection.executions[0][1][-1] == "disabled"

  approved_db = _Database()
  approved = parse_trend_import_payload([_item()], approve=True)
  await import_trend_items(approved_db, approved)
  assert approved_db.connection.executions[0][1][-1] == "active"


def test_emf_contract_has_low_cardinality_dimensions_and_no_input_data() -> None:
  payload = build_ai_metric(
    provider="bedrock",
    operation="generate_json",
    model_id="claude-model",
    status="error",
    latency_ms=123.456,
    error_code="BEDROCK_REQUEST_TIMEOUT",
  )
  assert payload["ErrorCount"] == 1
  assert payload["LatencyMs"] == 123.46
  serialized = json.dumps(payload)
  assert "prompt" not in serialized.lower()
  assert payload["_aws"]["CloudWatchMetrics"][0]["Namespace"] == "Aura/MakeupRecommendation"


@pytest.mark.asyncio
async def test_bedrock_boundary_emits_model_latency_and_success(monkeypatch) -> None:
  emitted = []
  monkeypatch.setattr(makeup_recommendation, "_converse", lambda *_args, **_kwargs: {"ok": True})
  monkeypatch.setattr(makeup_recommendation, "emit_ai_metric", lambda **kwargs: emitted.append(kwargs))
  result = await makeup_recommendation.generate_json(Settings(), "claude-test", "system", "prompt")
  assert result == {"ok": True}
  assert emitted[0]["provider"] == "bedrock"
  assert emitted[0]["operation"] == "generate_json"
  assert emitted[0]["model_id"] == "claude-test"
  assert emitted[0]["status"] == "success"
  assert emitted[0]["latency_ms"] >= 0


@pytest.mark.asyncio
async def test_openai_image_boundary_emits_model_latency_and_success(monkeypatch) -> None:
  emitted = []
  sentinel = object()
  monkeypatch.setattr(makeup_recommendation_image, "_generate_asset_sync", lambda *_args, **_kwargs: sentinel)
  monkeypatch.setattr(makeup_recommendation_image, "emit_ai_metric", lambda **kwargs: emitted.append(kwargs))
  settings = Settings(openai_image_model_id="gpt-image-test")
  result = await makeup_recommendation_image.generate_recommendation_asset(
    settings,
    UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
    "scenario",
    {},
    "anchor",
  )
  assert result is sentinel
  assert emitted[0]["provider"] == "openai"
  assert emitted[0]["operation"] == "generate_recommendation_asset"
  assert emitted[0]["model_id"] == "gpt-image-test"
  assert emitted[0]["status"] == "success"
  assert emitted[0]["latency_ms"] >= 0

def test_dashboard_script_is_locally_verifiable_and_configures_alarms() -> None:
  repo_root = Path(__file__).resolve().parents[3]
  source = (repo_root / "scripts/aws/configure_makeup_recommendation_observability.ps1").read_text(encoding="utf-8")
  assert "ValidateOnly" in source
  assert "put-dashboard" in source
  assert source.count("Set-MakeupAlarm -Name") == 3
  assert "Aura/MakeupRecommendation" in source
