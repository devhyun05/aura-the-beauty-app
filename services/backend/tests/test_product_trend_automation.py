from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timedelta, timezone
import json

import httpx
import pytest

from app.core.settings import Settings
from app.services.product_trend_bedrock import BedrockTrendClassifier
from app.services.product_trend_discovery import (
  BurstPhraseCandidate,
  NaverContentDocument,
  NaverContentTrendProvider,
  deduplicate_documents,
  extract_daily_content_phrase_observations,
  extract_burst_phrases,
  normalize_naver_content_items,
  trend_collection_due,
)
from app.services.product_trend_quota import InMemoryTrendCallQuotaLedger
from app.services.product_trend_sources import NaverTrendSourceAdapter, collect_trend_snapshot
from app.services.product_trends import (
  NaverSearchTrendProvider,
  NaverTrendMomentumService,
  SearchTrendRequest,
  TrendRequest,
  TrendMomentum,
  keyword_batches,
  series_momentum,
)
from app.services.product_weather import (
  KmaWeatherProvider,
  aggregate_national_weather,
  latest_kma_base_time,
  normalize_kma_forecast,
)


NOW = datetime(2026, 7, 16, 12, tzinfo=timezone.utc)


def _document(index: int, *, source: str, title: str | None = None) -> NaverContentDocument:
  return NaverContentDocument(
    evidence_id=f"evidence-{index}",
    source_type=source,
    title=title or f"토끼혀 립 컬러 유행 사례 {index}",
    summary="새로운 립 표현이 여러 뷰티 채널에서 언급되고 있어요.",
    published_at=NOW - timedelta(hours=index),
    seed_query="립",
  )


def test_scheduler_due_supports_independent_six_and_twelve_hour_stages() -> None:
  assert trend_collection_due(None, now=NOW, interval_hours=6)
  assert not trend_collection_due(NOW - timedelta(hours=5, minutes=59), now=NOW, interval_hours=6)
  assert trend_collection_due(NOW - timedelta(hours=6), now=NOW, interval_hours=6)
  assert not trend_collection_due(NOW - timedelta(hours=11), now=NOW, interval_hours=12)


@pytest.mark.asyncio
async def test_quota_reserves_worst_case_http_attempts_without_crossing_cap() -> None:
  ledger = InMemoryTrendCallQuotaLedger()
  assert await ledger.reserve("naver_search", at=NOW, monthly_limit=3, amount=2)
  assert not await ledger.reserve("naver_search", at=NOW, monthly_limit=3, amount=2)


def test_naver_content_normalization_hashes_identity_and_removes_html_duplicates() -> None:
  payload = {
    "items": [
      {
        "title": "<b>토끼혀 립</b> 트렌드",
        "description": "요즘 <b>립</b> 표현",
        "link": "https://blog.naver.com/a/1?x=1#fragment",
        "postdate": "20260716",
      },
      {
        "title": "<b>토끼혀 립</b> 트렌드",
        "description": "중복",
        "link": "https://blog.naver.com/a/1?x=1#other",
        "postdate": "20260716",
      },
    ],
  }
  documents = normalize_naver_content_items("blog", "립", payload, collected_at=NOW)
  assert len(documents) == 1
  assert documents[0].title == "토끼혀 립 트렌드"
  assert "blog.naver.com" not in documents[0].evidence_id
  assert len(documents[0].evidence_id) == 24
  assert deduplicate_documents([documents[0], documents[0]]) == documents


def test_burst_phrase_requires_unique_documents_source_diversity_and_safety() -> None:
  recent = [
    _document(index, source=("news", "blog", "cafe")[index % 3])
    for index in range(6)
  ]
  recent.extend(
    _document(20 + index, source=("news", "blog")[index % 2], title="광고 공동구매 립 특가")
    for index in range(6)
  )
  baseline = [
    NaverContentDocument(
      evidence_id="old-1",
      source_type="blog",
      title="클래식 레드 립 컬러",
      summary="기존 표현",
      published_at=NOW - timedelta(days=10),
      seed_query="립",
    ),
  ]
  candidates = extract_burst_phrases(recent, baseline, now=NOW)
  assert any(candidate.keyword == "토끼혀 립" for candidate in candidates)
  selected = next(candidate for candidate in candidates if candidate.keyword == "토끼혀 립")
  assert selected.document_count == 6
  assert selected.source_count == 3
  assert selected.z_score >= 2.5
  assert selected.categories == ("lip",)
  assert all("광고" not in candidate.keyword and "특가" not in candidate.keyword for candidate in candidates)


def test_burst_phrase_accepts_persisted_zero_filled_baseline_counts_without_raw_documents() -> None:
  recent = [
    _document(index, source=("news", "blog", "cafe")[index % 3])
    for index in range(6)
  ]
  without_baseline = extract_burst_phrases(recent, [], now=NOW)
  with_persisted_baseline = extract_burst_phrases(
    recent,
    [],
    now=NOW,
    baseline_phrase_counts={"토끼혀 립": [6] * 28},
  )
  assert any(candidate.keyword == "토끼혀 립" for candidate in without_baseline)
  assert all(candidate.keyword != "토끼혀 립" for candidate in with_persisted_baseline)


def test_daily_phrase_observations_include_safe_non_bursts_and_baseline_averages_only() -> None:
  recent = [
    NaverContentDocument(
      evidence_id=f"opaque-{index}",
      source_type=("news", "blog")[index % 2],
      title=f"토끼혀 립 사례 {index}",
      summary="뷰티 표현",
      published_at=NOW - timedelta(hours=index + 1),
      seed_query="립",
    )
    for index in range(3)
  ]
  recent.append(NaverContentDocument(
    evidence_id="unsafe",
    source_type="cafe",
    title="광고 공동구매 립",
    summary="특가 판매",
    published_at=NOW - timedelta(hours=2),
    seed_query="립",
  ))
  observations = extract_daily_content_phrase_observations(
    recent,
    [],
    now=NOW,
    baseline_phrase_counts={"토끼혀 립": [0] * 21 + [1] * 7},
  )
  selected = next(item for item in observations if item.keyword == "토끼혀 립")
  assert selected.document_count == 3
  assert selected.source_count == 2
  assert selected.baseline_7d == 1
  assert selected.baseline_28d == 0.25
  assert len(selected.daily_baseline_counts) == 28
  assert all("광고" not in item.keyword and "특가" not in item.keyword for item in observations)
  assert set(asdict(selected)) == {
    "keyword", "document_count", "source_count", "baseline_7d", "baseline_28d",
    "daily_baseline_counts", "categories", "finishes", "benefit_tags", "evidence_ids",
  }


@pytest.mark.asyncio
async def test_naver_content_provider_uses_dynamic_seeds_and_shared_monthly_quota() -> None:
  calls: list[tuple[str, dict, dict]] = []
  quota_providers: list[str] = []

  class Ledger(InMemoryTrendCallQuotaLedger):
    async def reserve(self, provider: str, **kwargs) -> bool:
      quota_providers.append(provider)
      return await super().reserve(provider, **kwargs)

  async def request(endpoint: str, headers: dict, params: dict) -> dict:
    calls.append((endpoint, headers, params))
    source = "news" if "news" in endpoint else "blog" if "blog" in endpoint else "cafe"
    return {"items": [{
      "title": f"{source} 토끼혀 립",
      "description": "뷰티 트렌드",
      "link": f"https://example.com/{source}",
      "pubDate": "Thu, 16 Jul 2026 20:00:00 +0900",
    }]}

  provider = NaverContentTrendProvider(
    Settings(
      naver_trend_content_enabled=True,
      naver_api_hub_client_id="id",
      naver_api_hub_client_secret="secret",
      naver_trend_news_endpoint="https://naverapihub.apigw.ntruss.com/search/news",
      naver_trend_blog_endpoint="https://naverapihub.apigw.ntruss.com/search/blog",
      naver_trend_cafe_endpoint="https://naverapihub.apigw.ntruss.com/search/cafe",
      naver_trend_monthly_call_limit=6,
    ),
    quota_ledger=Ledger(),
    requester=request,
  )
  documents = await provider.collect(("카탈로그에서 온 립", "두 번째 동적 씨드"), now=NOW)
  assert len(calls) == 3
  assert {call[2]["query"] for call in calls} == {"카탈로그에서 온 립"}
  assert len(documents) == 3
  assert all(call[1]["X-NCP-APIGW-API-KEY-ID"] == "id" for call in calls)
  assert quota_providers == ["naver"] * 4


def test_keyword_batching_and_momentum_compare_each_keyword_to_itself() -> None:
  batches = keyword_batches(tuple(f"키워드 {index}" for index in range(12)))
  assert [len(batch) for batch in batches] == [5, 5, 2]
  momentum = series_momentum({
    "title": "토끼혀 립",
    "data": [
      {"period": f"2026-07-{day:02d}", "ratio": 10 if day <= 7 else 30}
      for day in range(1, 15)
    ],
  }, source="naver_search")
  assert momentum is not None
  assert momentum.previous_average == 10
  assert momentum.recent_average == 30
  assert momentum.momentum == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("first_failure", ("timeout", "rate_limit"))
async def test_naver_datalab_retries_timeout_and_429(monkeypatch, first_failure: str) -> None:
  calls = 0
  request = httpx.Request("POST", "https://naverapihub.apigw.ntruss.com/search/v1/trend")

  class Client:
    async def __aenter__(self):
      return self

    async def __aexit__(self, *_args):
      return None

    async def post(self, *_args, **_kwargs):
      nonlocal calls
      calls += 1
      if calls == 1 and first_failure == "timeout":
        raise httpx.ReadTimeout("timeout", request=request)
      if calls == 1:
        return httpx.Response(429, request=request)
      return httpx.Response(200, request=request, json={"results": []})

  async def no_sleep(_seconds: float) -> None:
    return None

  monkeypatch.setattr("app.services.product_trends.httpx.AsyncClient", lambda **_kwargs: Client())
  monkeypatch.setattr("app.services.product_trends.asyncio.sleep", no_sleep)
  provider = NaverSearchTrendProvider(Settings(naver_trend_http_max_attempts=2))
  result = await provider._post_json(str(request.url), {"x": "y"}, {})
  assert result == {"results": []}
  assert calls == 2


@pytest.mark.asyncio
async def test_search_and_shopping_validation_send_no_more_than_five_per_request() -> None:
  search_batches: list[tuple[str, ...]] = []
  shopping_batches: list[tuple[str, ...]] = []
  quota_providers: list[str] = []

  class Ledger(InMemoryTrendCallQuotaLedger):
    async def reserve(self, provider: str, **kwargs) -> bool:
      quota_providers.append(provider)
      return await super().reserve(provider, **kwargs)

  class Search:
    async def get_keyword_trends(self, request: SearchTrendRequest) -> dict:
      search_batches.append(request.keywords)
      return {"series": [{
        "title": keyword,
        "data": [{"period": f"2026-07-{day:02d}", "ratio": day} for day in range(1, 15)],
      } for keyword in request.keywords]}

  class Shopping:
    async def get_keyword_trends(self, request: TrendRequest) -> dict:
      shopping_batches.append(request.keywords)
      return {"series": [{
        "title": keyword,
        "data": [{"period": f"2026-07-{day:02d}", "ratio": day} for day in range(1, 15)],
      } for keyword in request.keywords]}

  service = NaverTrendMomentumService(
    Settings(
      naver_search_trend_endpoint="https://naverapihub.apigw.ntruss.com/search/v1/trend",
      naver_shopping_insight_enabled=True,
      naver_shopping_insight_endpoint="https://naverapihub.apigw.ntruss.com/shopping/v1/category/keywords",
    ),
    quota_ledger=Ledger(),
    search_provider=Search(),  # type: ignore[arg-type]
    shopping_provider=Shopping(),  # type: ignore[arg-type]
  )
  result = await service.collect(
    tuple(f"키워드 {index}" for index in range(11)),
    start_date="2026-06-18",
    end_date="2026-07-16",
    shopping_category="50000002",
    now=NOW,
  )
  assert [len(batch) for batch in search_batches] == [5, 5, 1]
  assert [len(batch) for batch in shopping_batches] == [5, 5, 1]
  assert len(result) == 22
  assert set(quota_providers) == {"naver"}


def _kma_payload() -> dict:
  items = []
  for category, value in (("TMP", "29"), ("REH", "78"), ("POP", "70"), ("PCP", "1.0mm"), ("WSD", "2.5")):
    items.append({
      "category": category,
      "fcstDate": "20260716",
      "fcstTime": "2200",
      "fcstValue": value,
    })
  return {"response": {"header": {"resultCode": "00"}, "body": {"items": {"item": items}}}}


def test_kma_base_time_normalization_and_national_aggregate() -> None:
  base_date, base_time, source_updated_at = latest_kma_base_time(datetime(2026, 7, 16, 17, 15, tzinfo=timezone.utc))
  assert (base_date, base_time) == ("20260717", "0200")
  seoul = normalize_kma_forecast("KR-11", _kma_payload(), now=NOW, source_updated_at=NOW)
  busan = normalize_kma_forecast("KR-26", _kma_payload(), now=NOW, source_updated_at=NOW)
  assert seoul is not None and seoul.humidity_percent == 78 and seoul.precipitation_mm == 1
  national = aggregate_national_weather([seoul, busan], now=NOW)  # type: ignore[list-item]
  assert national is not None
  assert national.region_code == "KR-00"
  assert national.temperature_c == 29
  assert national.summary == "기온 29°C · 습도 78% · 강수확률 70% · 풍속 2.5m/s"
  assert national.is_stale(now=NOW + timedelta(hours=4, seconds=1))
  assert source_updated_at.tzinfo is not None


@pytest.mark.asyncio
async def test_kma_provider_accepts_only_region_codes_and_adds_national_snapshot() -> None:
  calls = []
  quota_providers: list[str] = []

  class Ledger(InMemoryTrendCallQuotaLedger):
    async def reserve(self, provider: str, **kwargs) -> bool:
      quota_providers.append(provider)
      return await super().reserve(provider, **kwargs)

  async def request(_endpoint: str, params: dict) -> dict:
    calls.append(params)
    return _kma_payload()

  provider = KmaWeatherProvider(
    Settings(
      kma_weather_enabled=True,
      kma_weather_endpoint="https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst",
      kma_weather_service_key="service-key",
    ),
    quota_ledger=Ledger(),
    requester=request,
  )
  snapshots = await provider.collect_regions(now=NOW, region_codes=("KR-11", "invalid", "KR-26"))
  assert [snapshot.region_code for snapshot in snapshots] == ["KR-11", "KR-26", "KR-00"]
  assert len(calls) == 2
  assert all("latitude" not in params and "longitude" not in params for params in calls)
  assert quota_providers == ["kma", "kma"]


def _ambiguous_candidate() -> BurstPhraseCandidate:
  return BurstPhraseCandidate(
    keyword="토끼혀 립",
    document_count=6,
    source_count=3,
    z_score=5,
    momentum=5,
    categories=("lip",),
    finishes=(),
    benefit_tags=(),
    evidence_ids=("evidence-0", "evidence-1"),
  )


@pytest.mark.asyncio
async def test_bedrock_runs_once_for_new_ambiguous_candidate_and_validates_evidence() -> None:
  quota_providers: list[str] = []

  class Ledger(InMemoryTrendCallQuotaLedger):
    async def reserve(self, provider: str, **kwargs) -> bool:
      quota_providers.append(provider)
      return await super().reserve(provider, **kwargs)

  class Runtime:
    def __init__(self) -> None:
      self.calls = 0

    def converse(self, **_kwargs) -> dict:
      self.calls += 1
      content = json.dumps({"items": [{
        "keyword": "토끼혀 립",
        "categories": ["lip", "not-a-category"],
        "benefitTags": ["hydrating", "invented"],
        "finishes": ["glossy"],
        "evidenceIds": ["evidence-0", "invented-evidence"],
        "confidence": 0.9,
      }]}, ensure_ascii=False)
      return {
        "output": {"message": {"content": [{"text": content}]}},
        "usage": {"inputTokens": 200, "outputTokens": 80},
      }

  runtime = Runtime()
  classifier = BedrockTrendClassifier(
    Settings(
      product_trend_bedrock_enabled=True,
      product_trend_bedrock_model_id="test-model",
    ),
    quota_ledger=Ledger(),
    runtime_client=runtime,
  )
  documents = [_document(0, source="news"), _document(1, source="blog")]
  first = await classifier.classify_if_needed(
    [_ambiguous_candidate()], documents, known_vocabulary=set(), now=NOW,
  )
  second = await classifier.classify_if_needed(
    [_ambiguous_candidate()], documents, known_vocabulary=set(), now=NOW + timedelta(hours=1),
  )
  assert first.status == "ready" and first.invoked
  assert first.items[0].categories == ("lip",)
  assert first.items[0].benefit_tags == ("hydrating",)
  assert first.items[0].evidence_ids == ("evidence-0",)
  assert first.input_tokens == 200 and first.output_tokens == 80
  assert second.status == "quota_exhausted" and not second.invoked
  assert runtime.calls == 1
  assert quota_providers == ["bedrock", "bedrock"]


@pytest.mark.asyncio
async def test_bedrock_is_not_called_for_known_or_locally_unambiguous_candidate() -> None:
  class Runtime:
    def converse(self, **_kwargs) -> dict:
      raise AssertionError("Bedrock should not be called")

  candidate = BurstPhraseCandidate(
    **{**_ambiguous_candidate().__dict__, "finishes": ("glossy",), "benefit_tags": ("hydrating",)},
  )
  classifier = BedrockTrendClassifier(
    Settings(product_trend_bedrock_enabled=True, product_trend_bedrock_model_id="test-model"),
    quota_ledger=InMemoryTrendCallQuotaLedger(),
    runtime_client=Runtime(),
  )
  result = await classifier.classify_if_needed([candidate], [], known_vocabulary=set(), now=NOW)
  assert result.status == "not_needed" and not result.invoked


@pytest.mark.asyncio
async def test_bedrock_prunes_evidence_to_a_parseable_hard_input_byte_bound() -> None:
  captured: dict = {}

  class Runtime:
    def converse(self, **kwargs) -> dict:
      captured.update(kwargs)
      prompt = kwargs["messages"][0]["content"][0]["text"]
      payload = json.loads(prompt.split("\n", 1)[1])
      first = payload["candidates"][0]
      return {
        "output": {"message": {"content": [{"text": json.dumps({"items": [{
          "keyword": first["keyword"],
          "categories": ["lip"],
          "benefitTags": [],
          "finishes": [],
          "evidenceIds": [first["evidenceIds"][0]],
          "confidence": 0.8,
        }]}, ensure_ascii=False)}]}},
        "usage": {"inputTokens": 300, "outputTokens": 50},
      }

  candidates = [
    BurstPhraseCandidate(
      keyword=f"토끼혀 립 {index}",
      document_count=6,
      source_count=3,
      z_score=4,
      momentum=3,
      categories=(),
      finishes=(),
      benefit_tags=(),
      evidence_ids=(f"bounded-{index}",),
    )
    for index in range(12)
  ]
  documents = [
    NaverContentDocument(
      evidence_id=f"bounded-{index}",
      source_type=("news", "blog", "cafe")[index % 3],
      title="매우 긴 토끼혀 립 근거 " + "가" * 500,
      summary="나" * 2_000,
      published_at=NOW - timedelta(hours=1),
      seed_query="립",
    )
    for index in range(12)
  ]
  limit = 1_600
  classifier = BedrockTrendClassifier(
    Settings(
      product_trend_bedrock_enabled=True,
      product_trend_bedrock_model_id="test-model",
      product_trend_bedrock_input_token_limit=limit,
    ),
    quota_ledger=InMemoryTrendCallQuotaLedger(),
    runtime_client=Runtime(),
  )
  result = await classifier.classify_if_needed(candidates, documents, known_vocabulary=set(), now=NOW)
  prompt = captured["messages"][0]["content"][0]["text"]
  system = captured["system"][0]["text"]
  payload = json.loads(prompt.split("\n", 1)[1])
  assert result.status == "ready" and result.invoked
  assert len(system.encode("utf-8")) + len(prompt.encode("utf-8")) < limit
  assert 0 < len(payload["candidates"]) < len(candidates)


@pytest.mark.asyncio
async def test_bedrock_does_not_spend_quota_when_minimum_safe_payload_cannot_fit() -> None:
  quota_calls = 0

  class Ledger(InMemoryTrendCallQuotaLedger):
    async def reserve(self, provider: str, **kwargs) -> bool:
      nonlocal quota_calls
      quota_calls += 1
      return await super().reserve(provider, **kwargs)

  class Runtime:
    def converse(self, **_kwargs) -> dict:
      raise AssertionError("over-budget Bedrock input must not be invoked")

  classifier = BedrockTrendClassifier(
    Settings(
      product_trend_bedrock_enabled=True,
      product_trend_bedrock_model_id="test-model",
      product_trend_bedrock_input_token_limit=256,
    ),
    quota_ledger=Ledger(),
    runtime_client=Runtime(),
  )
  result = await classifier.classify_if_needed(
    [_ambiguous_candidate()],
    [_document(0, source="news")],
    known_vocabulary=set(),
    now=NOW,
  )
  assert result.status == "input_too_large" and not result.invoked
  assert quota_calls == 0


@pytest.mark.asyncio
async def test_live_naver_adapter_uses_discovered_phrase_instead_of_curated_theme() -> None:
  documents = [_document(index, source=("news", "blog", "cafe")[index % 3]) for index in range(6)]

  class Content:
    async def collect(self, seed_queries: tuple[str, ...], *, now: datetime):
      assert seed_queries == ("DB 카탈로그 립",)
      return documents

  class Momentum:
    async def collect(self, keywords: tuple[str, ...], **_kwargs):
      return [TrendMomentum(
        keyword="토끼혀 립",
        source="naver_search",
        recent_average=30,
        previous_average=10,
        momentum=2,
        latest_period="2026-07-16",
      )]

  adapter = NaverTrendSourceAdapter(
    Settings(),
    seed_keywords=("DB 카탈로그 립",),
    content_provider=Content(),  # type: ignore[arg-type]
    momentum_service=Momentum(),  # type: ignore[arg-type]
  )
  payload = await adapter.collect(locale="ko-KR", now=NOW)
  assert payload is not None
  assert payload["trends"][0]["keyword"] == "토끼혀 립"
  assert "SEARCH_INTEREST_RISE" in payload["trends"][0]["reasonCodes"]
  assert payload["sourceMetadata"]["provider"] == "naver_live_beauty_trends"


@pytest.mark.asyncio
async def test_default_collection_never_manufactures_a_curated_publish_snapshot() -> None:
  with pytest.raises(RuntimeError, match="No safe seasonal trend source"):
    await collect_trend_snapshot(Settings(), now=NOW)
