from datetime import datetime, timedelta, timezone
import re
from uuid import uuid4

import pytest

from app.core.settings import Settings
from app.core.errors import AppError
from app.services.product_seasonal_pipeline import (
  fetch_seasonal_product_candidates,
  match_trends_to_products,
  persist_trend_collection,
)
from app.services.product_trend_learning import ActiveRankingModel, select_deterministic_exploration
from app.services.product_trend_sources import (
  MCPTrendSourceAdapter,
  TrendSignal,
  TrendSnapshot,
  collect_trend_snapshot,
  normalize_trend_snapshot,
)


NOW = datetime(2026, 7, 16, 12, tzinfo=timezone.utc)


def _snapshot(*signals: TrendSignal) -> TrendSnapshot:
  return TrendSnapshot(
    title="실시간 뷰티 트렌드",
    summary="검증된 트렌드",
    trend_window="최근 28일",
    locale="ko-KR",
    source_name="test-source",
    source_updated_at=NOW,
    signals=signals,
    source_metadata={"provider": "test"},
  )


def test_mcp_trend_normalize_filters_unsafe_and_infers_attributes() -> None:
  snapshot = normalize_trend_snapshot(
    {
      "sourceUpdatedAt": NOW.isoformat(),
      "trends": [
        {"keyword": "글로우 립", "confidenceScore": 1.4},
        {"keyword": "장마철 워터프루프", "categories": ["liner", "unknown"]},
        {"keyword": "성인 광고 공동구매", "categories": ["lip"]},
        {"keyword": "노트북 특가"},
      ],
    },
    adapter_name="mcp",
    locale="ko-KR",
    now=NOW,
    max_age_days=30,
  )
  assert snapshot is not None
  assert snapshot.trend_keywords == ["글로우 립", "장마철 워터프루프"]
  assert snapshot.signals[0].categories == ("lip",)
  assert snapshot.signals[0].finishes == ("glossy",)
  assert snapshot.signals[0].confidence_score == 1.0
  assert snapshot.signals[1].categories == ("liner",)


@pytest.mark.asyncio
async def test_mcp_adapter_accepts_structured_tool_content() -> None:
  calls = []

  async def call_tool(name: str, arguments: dict) -> dict:
    calls.append((name, arguments))
    return {
      "structuredContent": {
        "sourceUpdatedAt": NOW.isoformat(),
        "trends": [{"keyword": "아이돌 물광 피부", "confidenceScore": 0.88}],
      }
    }

  adapter = MCPTrendSourceAdapter(
    Settings(
      product_trend_mcp_url="https://trends.example.com/mcp",
      product_trend_mcp_allowed_hosts="trends.example.com",
    ),
    tool_caller=call_tool,
  )
  payload = await adapter.collect(locale="ko-KR", now=NOW)
  assert payload is not None
  assert payload["sourceName"] == "MCP:collect_beauty_trends"
  assert calls[0][0] == "collect_beauty_trends"
  assert calls[0][1]["category"] == "beauty/makeup"


@pytest.mark.asyncio
async def test_mcp_failure_and_stale_source_fall_through_to_fresh_adapter() -> None:
  class Broken:
    name = "broken-mcp"

    async def collect(self, *, locale: str, now: datetime):
      raise ValueError("tool unavailable")

  class Stale:
    name = "stale-source"

    async def collect(self, *, locale: str, now: datetime):
      return {
        "sourceUpdatedAt": (now - timedelta(days=31)).isoformat(),
        "trends": [{"keyword": "글로우 립"}],
      }

  class Fresh:
    name = "curated-fallback"

    async def collect(self, *, locale: str, now: datetime):
      return {
        "sourceUpdatedAt": now.isoformat(),
        "sourceName": self.name,
        "trends": [{"keyword": "여름 지속력 베이스", "confidenceScore": 0.6}],
      }

  snapshot = await collect_trend_snapshot(
    Settings(product_seasonal_source_max_age_days=30),
    now=NOW,
    adapters=(Broken(), Stale(), Fresh()),  # type: ignore[arg-type]
  )
  assert snapshot.source_name == "curated-fallback"
  assert snapshot.is_stale is False
  assert snapshot.trend_keywords == ["여름 지속력 베이스"]


def test_trend_matching_uses_product_attributes_and_enforces_diversity() -> None:
  snapshot = _snapshot(TrendSignal(
    keyword="글로우 립 로즈",
    categories=("lip",),
    color_families=("rose",),
    finishes=("glossy",),
    tags=("longwear",),
    reason_codes=("SOCIAL_TREND_RISE",),
    confidence_score=0.9,
  ))
  candidates = [
    {
      "product_id": f"product-{index}",
      "brand_name": "Same Brand" if index < 4 else f"Brand {index}",
      "product_name": f"로즈 글로우 틴트 {index}",
      "category": "lip" if index < 5 else "base",
      "color_family": "rose",
      "finish": "glossy",
      "tags": ["longwear"],
      "liked_count": 10 - index,
      "open_count": 4,
      "outbound_count": 2,
    }
    for index in range(7)
  ]
  items = match_trends_to_products(snapshot, candidates, limit=5)
  assert len(items) == 5
  assert len({item["productId"] for item in items}) == 5
  assert all(item["reasonCode"].startswith("TREND_") for item in items[:4])
  selected_same_brand = sum(item["productId"] in {"product-0", "product-1", "product-2", "product-3"} for item in items)
  assert selected_same_brand <= 2


def test_product_shortage_is_filled_with_popular_products() -> None:
  snapshot = _snapshot(TrendSignal(
    keyword="글로우 립",
    categories=("lip",),
    color_families=(),
    finishes=("glossy",),
    tags=(),
    reason_codes=("SHOPPING_CLICK_RISE",),
    confidence_score=0.8,
  ))
  candidates = [
    {"product_id": "trend-lip", "brand_name": "A", "product_name": "글로우 립", "category": "lip", "finish": "glossy"},
    {"product_id": "popular-base", "brand_name": "B", "product_name": "쿠션", "category": "base", "liked_count": 40},
    {"product_id": "popular-brow", "brand_name": "C", "product_name": "브로우", "category": "brow", "outbound_count": 20},
  ]
  items = match_trends_to_products(snapshot, candidates, limit=3)
  assert len(items) == 3
  assert items[0]["productId"] == "trend-lip"
  assert {item["reasonCode"] for item in items[1:]} == {"POPULAR_FALLBACK"}


def test_rrf_records_independent_weather_and_app_components() -> None:
  snapshot = _snapshot(TrendSignal(
    keyword="장마철 워터프루프 라이너",
    categories=("liner",),
    color_families=(),
    finishes=(),
    tags=("waterproof",),
    reason_codes=("NAVER_CONTENT_BURST",),
    confidence_score=0.9,
  ))
  items = match_trends_to_products(
    snapshot,
    [{
      "product_id": "liner-1",
      "brand_name": "Rain Brand",
      "product_name": "워터프루프 라이너",
      "category": "liner",
      "app_signal_score": 3.0,
      "attribute_evidence": [{
        "attributeKey": "waterproof",
        "attributeValue": True,
        "confidenceScore": 0.92,
        "status": "verified",
      }],
    }],
    limit=1,
    weather={"precipitationProbabilityPercent": 80, "weatherCode": "rain"},
  )
  assert items[0]["reasonCodes"] == [
    "TREND_CATEGORY_MATCH",
    "TREND_KEYWORD_MATCH",
    "WEATHER_ATTRIBUTE_MATCH",
    "APP_ENGAGEMENT_RISE",
  ]
  assert items[0]["scoreComponents"]["weather"] == 1.0
  assert items[0]["scoreComponents"]["app"] > 0
  assert items[0]["rankingModelVersion"] == "rrf_v1"


def test_rrf_keeps_content_datalab_weather_app_and_evidence_as_independent_ranks() -> None:
  snapshot = _snapshot(TrendSignal(
    keyword="물광 워터프루프 베이스",
    categories=("base",),
    color_families=(),
    finishes=("glossy",),
    tags=("waterproof",),
    reason_codes=("NAVER_CONTENT_BURST", "SEARCH_INTEREST_RISE"),
    confidence_score=0.9,
    content_momentum=3.1,
    datalab_momentum=0.42,
  ))
  model = ActiveRankingModel(
    id=uuid4(),
    model_version="logistic-v2",
    model_type="logistic",
    coefficients={
      "intercept": 0.0,
      "weights": {
        "logImpressions": 0.1,
        "openRate": 1.0,
        "likeRate": 1.0,
        "outboundRate": 1.0,
        "negativeRate": -1.0,
        "positionAdjustedRate": 0.1,
      },
      "means": {},
      "scales": {},
    },
  )
  [item] = match_trends_to_products(
    snapshot,
    [{
      "product_id": "base-1",
      "brand_name": "Evidence Brand",
      "product_name": "물광 워터프루프 베이스",
      "category": "base",
      "finish": "glossy",
      "app_signal_score": 5.0,
      "history_impression_count": 100,
      "history_product_open_count": 20,
      "history_like_count": 10,
      "history_seller_outbound_count": 3,
      "attribute_evidence": [{
        "attributeKey": "waterproof",
        "attributeValue": True,
        "confidenceScore": 0.95,
        "status": "verified",
      }],
    }],
    limit=1,
    weather={"precipitationProbabilityPercent": 80, "weatherCode": "rain"},
    ranking_model=model,
  )
  assert all(
    item["scoreComponents"][key] > 0
    for key in ("content", "datalab", "weather", "app", "evidence", "learned")
  )
  assert item["rankingModelVersion"] == "logistic-v2"


def test_deterministic_exploration_never_selects_outside_overall_top_thirty() -> None:
  snapshot = _snapshot(TrendSignal(
    keyword="글로우 립",
    categories=("lip",),
    color_families=(),
    finishes=("glossy",),
    tags=(),
    reason_codes=("NAVER_CONTENT_BURST",),
    confidence_score=0.9,
  ))
  candidates = [{
    "product_id": f"product-{index:02d}",
    "brand_name": f"Brand {index:02d}",
    "product_name": f"글로우 립 {index:02d}",
    "category": "lip",
    "finish": "glossy",
    "app_signal_score": 40 - index,
  } for index in range(40)]
  baseline = match_trends_to_products(snapshot, candidates, limit=40)
  top_thirty_ids = {item["productId"] for item in baseline[:30]}
  key = next(
    f"revision-{index}"
    for index in range(10_000)
    if select_deterministic_exploration(f"revision-{index}", model_version="rrf_v1")
  )
  [explored] = match_trends_to_products(
    snapshot,
    candidates,
    limit=1,
    exploration_key=key,
  )
  assert "CONTROLLED_EXPLORATION" in explored["reasonCodes"]
  assert explored["productId"] in top_thirty_ids


class _CandidateQueryDb:
  is_connected = True

  def __init__(self) -> None:
    self.query = ""

  async def fetch(self, query: str, *_args):
    self.query = query
    return []


@pytest.mark.asyncio
async def test_app_rank_query_uses_privacy_safe_recent_vs_prior_rise() -> None:
  db = _CandidateQueryDb()
  await fetch_seasonal_product_candidates(db, Settings(), region_code="KR-00")  # type: ignore[arg-type]

  assert "x.is_privacy_eligible=true" in db.query
  assert "interval '24 hours'" in db.query
  assert "interval '48 hours'" in db.query
  assert ")-coalesce(sum(x.position_adjusted_score)" in db.query
  assert "sum(x.impression_count) filter" in db.query
  assert "as history_impression_count" in db.query
  assert db.query.count("x.bucket_started_at<date_trunc('hour',now())") >= 8


class _AsyncContext:
  def __init__(self, value) -> None:
    self.value = value

  async def __aenter__(self):
    return self.value

  async def __aexit__(self, *_args):
    return None


class _DraftConnection:
  def __init__(self) -> None:
    self.executed: list[tuple[str, tuple]] = []

  def transaction(self):
    return _AsyncContext(self)

  async def fetchrow(self, _query: str, *_args):
    return None

  async def execute(self, query: str, *args):
    self.executed.append((query, args))
    return "INSERT 0 1"


class _DraftPool:
  def __init__(self, connection: _DraftConnection) -> None:
    self.connection = connection

  def acquire(self):
    return _AsyncContext(self.connection)


class _DraftDb:
  def __init__(self, connection: _DraftConnection) -> None:
    self.pool = _DraftPool(connection)


@pytest.mark.asyncio
async def test_publish_rejects_duplicate_products_before_persistence() -> None:
  product_id = str(uuid4())
  with pytest.raises(AppError) as error:
    await persist_trend_collection(
      _DraftDb(_DraftConnection()),  # type: ignore[arg-type]
      _snapshot(TrendSignal(
        keyword="글로우 립",
        categories=("lip",),
        color_families=(),
        finishes=("glossy",),
        tags=(),
        reason_codes=("NAVER_CONTENT_BURST",),
        confidence_score=0.9,
      )),
      [{"productId": product_id}, {"productId": product_id}],
      publish=True,
    )
  assert error.value.code == "SEASONAL_DUPLICATE_PRODUCTS"


class _PublishConnection(_DraftConnection):
  def __init__(self) -> None:
    super().__init__()
    self.eligibility_query = ""
    self.eligibility_args: tuple = ()

  async def fetchrow(self, query: str, *args):
    if "from product_recommendation_service_principals" in query:
      return {"id": args[0]}
    return None

  async def fetchval(self, query: str, *args):
    self.eligibility_query = query
    self.eligibility_args = args
    return 1


@pytest.mark.asyncio
async def test_automated_publish_revalidates_selected_shade_and_audit_placeholders() -> None:
  connection = _PublishConnection()
  product_id = uuid4()
  shade_id = uuid4()
  principal_id = uuid4()
  pipeline_run_id = uuid4()
  await persist_trend_collection(
    _DraftDb(connection),  # type: ignore[arg-type]
    _snapshot(TrendSignal(
      keyword="글로우 립",
      categories=("lip",),
      color_families=(),
      finishes=("glossy",),
      tags=(),
      reason_codes=("NAVER_CONTENT_BURST",),
      confidence_score=0.9,
    )),
    [{
      "productId": str(product_id),
      "shadeId": str(shade_id),
      "position": 0,
      "reasonCode": "TREND_CATEGORY_MATCH",
      "reasonCodes": ["TREND_CATEGORY_MATCH"],
      "matchScore": 0.1,
      "scoreComponents": {"rrf": 0.1},
      "rankingModelVersion": "rrf_v1",
      "sponsorshipType": "organic",
    }],
    publish=True,
    service_principal_id=principal_id,
    pipeline_run_id=pipeline_run_id,
    auto_publish_policy_version="policy-v1",
    input_fingerprint="b" * 64,
  )

  assert "from jsonb_array_elements($1::jsonb)" in connection.eligibility_query
  assert "s.id=r.shade_id and s.product_id=p.id" in connection.eligibility_query
  assert "a.shade_id is null or a.shade_id=r.shade_id" in connection.eligibility_query
  assert "o.shade_id is null or o.shade_id=r.shade_id" in connection.eligibility_query
  assert str(product_id) in connection.eligibility_args[0]
  assert str(shade_id) in connection.eligibility_args[0]
  audit_query, audit_args = next(
    (query, args) for query, args in connection.executed
    if "insert into seasonal_auto_publish_audit_log" in query
  )
  placeholders = [int(value) for value in re.findall(r"\$(\d+)", audit_query)]
  assert max(placeholders) == len(audit_args) == 8


@pytest.mark.asyncio
async def test_draft_persistence_keeps_region_fingerprint_and_score_components() -> None:
  connection = _DraftConnection()
  product_id = uuid4()
  await persist_trend_collection(
    _DraftDb(connection),  # type: ignore[arg-type]
    _snapshot(TrendSignal(
      keyword="글로우 립",
      categories=("lip",),
      color_families=(),
      finishes=("glossy",),
      tags=(),
      reason_codes=("NAVER_CONTENT_BURST",),
      confidence_score=0.9,
    )),
    [{
      "productId": str(product_id),
      "shadeId": None,
      "position": 0,
      "reasonCode": "TREND_CATEGORY_MATCH",
      "reasonCodes": ["TREND_CATEGORY_MATCH"],
      "matchScore": 0.1,
      "scoreComponents": {"rrf": 0.1},
      "rankingModelVersion": "rrf_v1",
      "sponsorshipType": "organic",
    }],
    publish=False,
    region_code="KR-11",
    input_fingerprint="a" * 64,
  )
  collection_query, collection_args = connection.executed[0]
  assert "region_code,region_label" in collection_query
  assert "input_fingerprint" in collection_query
  assert collection_args[5:7] == ("KR-11", "서울")
  placeholders = [int(value) for value in re.findall(r"\$(\d+)", collection_query)]
  assert max(placeholders) == len(collection_args) == 30
  item_query, item_args = connection.executed[1]
  assert "score_components,ranking_model_version" in item_query
  assert item_args[-3:] == ('{"rrf": 0.1}', "rrf_v1", "organic")
