"""Safe, batch-only trend source adapters for seasonal product collections.

MCP is intentionally used as a collection/automation boundary.  Mobile request
handlers never import or call these adapters; they only read published rows.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import logging
import re
from typing import Any, Awaitable, Callable, Protocol
from urllib.parse import urlparse

import httpx

from app.core.settings import Settings
from app.services.product_trends import NaverShoppingInsightProvider, TrendRequest


PRODUCT_CATEGORIES = ("base", "shadow", "brow", "cheek", "lip", "liner")
_TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣+#&-]+")
_BLOCKED_TERMS = {
  "19금", "성인", "도박", "담배", "주류", "대출", "알바", "숙박",
  "광고", "협찬", "공동구매", "공구", "마사지", "다이어트약",
}
_COSMETIC_TERMS = {
  "메이크업", "화장", "뷰티", "립", "틴트", "립스틱", "립글로스", "베이스",
  "쿠션", "파운데이션", "컨실러", "아이", "섀도우", "팔레트", "브로우",
  "아이브로우", "치크", "블러셔", "아이라이너", "라이너", "피부", "물광",
  "글로우", "매트", "블러", "워터프루프", "지속력",
}
_CATEGORY_TERMS = {
  "base": ("베이스", "쿠션", "파운데이션", "컨실러", "프라이머", "피부", "물광"),
  "shadow": ("아이섀도우", "섀도우", "팔레트", "쉬머", "글리터"),
  "brow": ("브로우", "아이브로우", "눈썹"),
  "cheek": ("치크", "블러셔", "블러쉬"),
  "lip": ("립", "틴트", "립스틱", "립글로스"),
  "liner": ("라이너", "아이라이너", "아이라인", "워터프루프"),
}
_FINISH_ALIASES = {
  "글로우": "glossy", "글로시": "glossy", "물광": "glossy", "촉촉": "sheer",
  "쉬머": "shimmer", "글리터": "shimmer", "매트": "matte", "블러": "velvet",
  "벨벳": "velvet",
}
_COLOR_ALIASES = {
  "웜": "warm", "갈웜": "warm", "봄웜": "warm", "쿨": "cool",
  "여쿨": "cool", "겨쿨": "cool", "로즈": "rose", "코랄": "coral",
  "브라운": "brown", "레드": "red", "핑크": "pink", "누드": "nude",
}
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TrendSignal:
  keyword: str
  categories: tuple[str, ...]
  color_families: tuple[str, ...]
  finishes: tuple[str, ...]
  tags: tuple[str, ...]
  reason_codes: tuple[str, ...]
  confidence_score: float


@dataclass(frozen=True)
class TrendSnapshot:
  title: str
  summary: str
  trend_window: str
  locale: str
  source_name: str
  source_updated_at: datetime
  signals: tuple[TrendSignal, ...]
  source_metadata: dict[str, Any]
  is_stale: bool = False

  @property
  def confidence_score(self) -> float:
    if not self.signals:
      return 0.0
    return round(sum(signal.confidence_score for signal in self.signals) / len(self.signals), 4)

  @property
  def trend_keywords(self) -> list[str]:
    return [signal.keyword for signal in self.signals]

  @property
  def reason_codes(self) -> list[str]:
    return list(dict.fromkeys(code for signal in self.signals for code in signal.reason_codes))


class TrendSourceAdapter(Protocol):
  name: str

  async def collect(self, *, locale: str, now: datetime) -> dict[str, Any] | None: ...


def _text(value: Any, *, max_length: int) -> str:
  value = " ".join(str(value or "").strip().split())
  return value[:max_length]


def _string_list(value: Any, *, limit: int = 8, max_length: int = 32) -> tuple[str, ...]:
  if not isinstance(value, (list, tuple)):
    return ()
  return tuple(dict.fromkeys(
    cleaned
    for item in value[:limit]
    if (cleaned := _text(item, max_length=max_length))
  ))


def _timestamp(value: Any) -> datetime | None:
  if isinstance(value, datetime):
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
  if not isinstance(value, str) or not value.strip():
    return None
  try:
    parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
  except ValueError:
    return None
  return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _infer_categories(keyword: str) -> tuple[str, ...]:
  lowered = keyword.casefold()
  return tuple(category for category, aliases in _CATEGORY_TERMS.items() if any(alias in lowered for alias in aliases))


def _infer_values(keyword: str, aliases: dict[str, str]) -> tuple[str, ...]:
  lowered = keyword.casefold()
  return tuple(dict.fromkeys(value for alias, value in aliases.items() if alias in lowered))


def _keyword_allowed(keyword: str, categories: tuple[str, ...]) -> bool:
  lowered = keyword.casefold()
  tokens = _TOKEN_PATTERN.findall(keyword)
  if len(keyword) < 2 or len(keyword) > 48 or not tokens:
    return False
  if any(term in lowered for term in _BLOCKED_TERMS):
    return False
  return bool(categories or any(term in lowered for term in _COSMETIC_TERMS))


def normalize_trend_snapshot(
  payload: dict[str, Any],
  *,
  adapter_name: str,
  locale: str,
  now: datetime,
  max_age_days: int,
) -> TrendSnapshot | None:
  """Normalize untrusted source output and drop irrelevant/adult/ad keywords."""

  source_updated_at = _timestamp(payload.get("sourceUpdatedAt"))
  if source_updated_at is None or source_updated_at > now + timedelta(minutes=5):
    return None
  raw_signals = payload.get("trends") or payload.get("signals") or payload.get("items")
  if not isinstance(raw_signals, list):
    raw_signals = [{"keyword": item} for item in payload.get("trendKeywords", [])]
  signals: list[TrendSignal] = []
  for raw in raw_signals[:24]:
    if isinstance(raw, str):
      raw = {"keyword": raw}
    if not isinstance(raw, dict):
      continue
    keyword = _text(raw.get("keyword") or raw.get("title"), max_length=48)
    explicit_categories = tuple(
      value for value in _string_list(raw.get("categories"), limit=6) if value in PRODUCT_CATEGORIES
    )
    categories = explicit_categories or _infer_categories(keyword)
    if not _keyword_allowed(keyword, categories):
      continue
    try:
      confidence = float(raw.get("confidenceScore", raw.get("confidence", 0.5)))
    except (TypeError, ValueError):
      confidence = 0.5
    confidence = max(0.0, min(1.0, confidence))
    finishes = _string_list(raw.get("finishes")) or _infer_values(keyword, _FINISH_ALIASES)
    color_families = _string_list(raw.get("colorFamilies")) or _infer_values(keyword, _COLOR_ALIASES)
    reason_codes = _string_list(raw.get("reasonCodes"), max_length=40) or ("EXTERNAL_TREND_SIGNAL",)
    signal = TrendSignal(
      keyword=keyword,
      categories=categories,
      color_families=color_families,
      finishes=finishes,
      tags=_string_list(raw.get("tags")),
      reason_codes=tuple(code.upper().replace(" ", "_") for code in reason_codes),
      confidence_score=confidence,
    )
    if signal.keyword not in {existing.keyword for existing in signals}:
      signals.append(signal)
  if not signals:
    return None
  title = _text(payload.get("title"), max_length=80) or f"{signals[0].keyword} 트렌드"
  summary = _text(payload.get("summary"), max_length=240) or "최근 뷰티 트렌드 신호와 판매 가능한 상품 정보를 함께 반영했어요."
  trend_window = _text(payload.get("trendWindow"), max_length=80) or "최근 28일"
  source_name = _text(payload.get("sourceName"), max_length=80) or adapter_name
  stale = source_updated_at < now - timedelta(days=max_age_days)
  metadata = payload.get("sourceMetadata") if isinstance(payload.get("sourceMetadata"), dict) else {}
  return TrendSnapshot(
    title=title,
    summary=summary,
    trend_window=trend_window,
    locale=_text(payload.get("locale"), max_length=12) or locale,
    source_name=source_name,
    source_updated_at=source_updated_at,
    signals=tuple(signals),
    source_metadata={key: value for key, value in metadata.items() if key in {"provider", "metric", "requestId", "tool"}},
    is_stale=stale,
  )


def _mcp_result_payload(result: dict[str, Any]) -> dict[str, Any]:
  structured = result.get("structuredContent")
  if isinstance(structured, dict):
    return structured
  content = result.get("content")
  if isinstance(content, list):
    for item in content:
      if not isinstance(item, dict) or item.get("type") != "text":
        continue
      try:
        decoded = json.loads(str(item.get("text") or ""))
      except json.JSONDecodeError:
        continue
      if isinstance(decoded, dict):
        return decoded
  return result if any(key in result for key in ("trends", "signals", "trendKeywords")) else {}


class MCPTrendSourceAdapter:
  name = "mcp"

  def __init__(
    self,
    settings: Settings,
    *,
    tool_caller: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]] | None = None,
  ) -> None:
    self.settings = settings
    self._tool_caller = tool_caller

  def _validated_url(self) -> str:
    url = str(self.settings.product_trend_mcp_url or "").strip()
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    local_http = self.settings.environment in {"local", "test"} and host in {"127.0.0.1", "localhost"}
    if (parsed.scheme != "https" and not local_http) or host not in self.settings.product_trend_mcp_hosts:
      raise ValueError("PRODUCT_TREND_MCP_URL must use an allowed HTTPS host (localhost HTTP is local/test only).")
    return url

  async def _call_http_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    headers = {"Accept": "application/json, text/event-stream"}
    if self.settings.product_trend_mcp_bearer_token:
      headers["Authorization"] = f"Bearer {self.settings.product_trend_mcp_bearer_token}"

    def decode(response: httpx.Response) -> dict[str, Any]:
      if not response.content:
        return {}
      if "text/event-stream" in response.headers.get("content-type", ""):
        for line in reversed(response.text.splitlines()):
          if not line.startswith("data:") or line[5:].strip() in {"", "[DONE]"}:
            continue
          try:
            value = json.loads(line[5:].strip())
          except json.JSONDecodeError:
            continue
          if isinstance(value, dict):
            return value
        return {}
      value = response.json()
      return value if isinstance(value, dict) else {}

    endpoint = self._validated_url()
    async with httpx.AsyncClient(timeout=self.settings.product_trend_mcp_timeout_seconds) as client:
      initialize = await client.post(
        endpoint,
        headers=headers,
        json={
          "jsonrpc": "2.0",
          "id": "seasonal-trend-initialize",
          "method": "initialize",
          "params": {
            "protocolVersion": "2025-11-25",
            "capabilities": {},
            "clientInfo": {"name": "aura-seasonal-trend-collector", "version": "1.0"},
          },
        },
      )
      initialize.raise_for_status()
      initialize_payload = decode(initialize)
      if isinstance(initialize_payload.get("error"), dict):
        raise ValueError("MCP initialize failed.")
      session_id = initialize.headers.get("Mcp-Session-Id")
      session_headers = {
        **headers,
        "MCP-Protocol-Version": str(
          (initialize_payload.get("result") or {}).get("protocolVersion") or "2025-11-25"
        ),
      }
      if session_id:
        session_headers["Mcp-Session-Id"] = session_id
      initialized = await client.post(
        endpoint,
        headers=session_headers,
        json={"jsonrpc": "2.0", "method": "notifications/initialized"},
      )
      initialized.raise_for_status()
      response = await client.post(
        endpoint,
        headers=session_headers,
        json={
          "jsonrpc": "2.0",
          "id": "seasonal-trend-collector",
          "method": "tools/call",
          "params": {"name": name, "arguments": arguments},
        },
      )
      response.raise_for_status()
    decoded = decode(response)
    if not isinstance(decoded, dict) or isinstance(decoded.get("error"), dict):
      raise ValueError("MCP trend tool returned an invalid JSON-RPC response.")
    result = decoded.get("result")
    return result if isinstance(result, dict) else {}

  async def collect(self, *, locale: str, now: datetime) -> dict[str, Any] | None:
    if not self.settings.product_trend_mcp_url:
      return None
    caller = self._tool_caller or self._call_http_tool
    result = await caller(
      self.settings.product_trend_mcp_tool,
      {
        "locale": locale,
        "category": "beauty/makeup",
        "trendWindowDays": 28,
        "asOf": now.isoformat(),
        "maxSignals": 12,
      },
    )
    payload = _mcp_result_payload(result)
    if payload:
      payload.setdefault("sourceName", f"MCP:{self.settings.product_trend_mcp_tool}")
      payload.setdefault("sourceMetadata", {"provider": "mcp", "tool": self.settings.product_trend_mcp_tool})
    return payload or None


_CURATED_SIGNALS = (
  {"keyword": "글로우 립", "categories": ["lip"], "finishes": ["glossy", "sheer"]},
  {"keyword": "여름 지속력 베이스", "categories": ["base"], "tags": ["longwear"]},
  {"keyword": "아이돌 물광 피부", "categories": ["base"], "finishes": ["glossy"]},
  {"keyword": "장마철 워터프루프", "categories": ["liner", "brow"], "tags": ["waterproof"]},
  {"keyword": "소프트 블러 메이크업", "categories": ["base", "lip", "cheek"], "finishes": ["matte", "velvet"]},
)


class NaverTrendSourceAdapter:
  name = "naver_shopping_insight"

  def __init__(self, settings: Settings) -> None:
    self.settings = settings

  async def collect(self, *, locale: str, now: datetime) -> dict[str, Any] | None:
    provider = NaverShoppingInsightProvider(self.settings)
    result = await provider.get_keyword_trends(TrendRequest(
      keywords=tuple(signal["keyword"] for signal in _CURATED_SIGNALS),
      start_date=(now - timedelta(days=28)).date().isoformat(),
      end_date=now.date().isoformat(),
      category="50000002",
    ))
    if result.get("status") != "ready":
      return None
    scores: dict[str, float] = {}
    for series in result.get("series", []):
      if not isinstance(series, dict):
        continue
      points = series.get("data") if isinstance(series.get("data"), list) else []
      ratios = [float(point.get("ratio", 0)) for point in points if isinstance(point, dict)]
      if ratios:
        scores[str(series.get("title") or series.get("keyword") or "").strip()] = sum(ratios[-7:]) / min(7, len(ratios))
    ranked = sorted(_CURATED_SIGNALS, key=lambda signal: (-scores.get(str(signal["keyword"]), 0.0), str(signal["keyword"])))
    return {
      "title": f"{ranked[0]['keyword']} 중심 실시간 트렌드",
      "summary": "최근 쇼핑 클릭 변화가 큰 메이크업 키워드와 판매 가능한 상품을 연결했어요.",
      "trendWindow": "최근 28일 쇼핑 클릭 변화",
      "locale": locale,
      "sourceName": "Naver Shopping Insight",
      "sourceUpdatedAt": now.isoformat(),
      "sourceMetadata": {"provider": self.name, "metric": result.get("metric", "relative_click_ratio")},
      "trends": [{**signal, "confidenceScore": 0.72, "reasonCodes": ["SHOPPING_CLICK_RISE"]} for signal in ranked],
    }


class CuratedTrendSourceAdapter:
  name = "curated_seasonal_fallback"

  async def collect(self, *, locale: str, now: datetime) -> dict[str, Any]:
    season = "여름" if 6 <= now.month <= 8 else "겨울" if now.month in {12, 1, 2} else "환절기"
    return {
      "title": f"{season} 메이크업 트렌드",
      "summary": "외부 트렌드 연결을 갱신하는 동안 계절 적합성과 상품 인기를 함께 반영했어요.",
      "trendWindow": f"{now.year} {season} 운영 fallback",
      "locale": locale,
      "sourceName": self.name,
      "sourceUpdatedAt": now.isoformat(),
      "sourceMetadata": {"provider": self.name, "metric": "curated_fallback"},
      "trends": [{**signal, "confidenceScore": 0.55, "reasonCodes": ["CURATED_SEASONAL_FALLBACK"]} for signal in _CURATED_SIGNALS],
    }


async def collect_trend_snapshot(
  settings: Settings,
  *,
  locale: str = "ko-KR",
  now: datetime | None = None,
  adapters: tuple[TrendSourceAdapter, ...] | None = None,
) -> TrendSnapshot:
  """Try MCP, then live Naver trends, then deterministic curated signals."""

  collected_at = now or datetime.now(timezone.utc)
  sources = adapters or (
    MCPTrendSourceAdapter(settings),
    NaverTrendSourceAdapter(settings),
    CuratedTrendSourceAdapter(),
  )
  last_error: Exception | None = None
  for adapter in sources:
    try:
      payload = await adapter.collect(locale=locale, now=collected_at)
      snapshot = normalize_trend_snapshot(
        payload or {},
        adapter_name=adapter.name,
        locale=locale,
        now=collected_at,
        max_age_days=settings.product_seasonal_source_max_age_days,
      )
      if snapshot is not None and not snapshot.is_stale:
        return snapshot
    except Exception as error:
      logger.warning(
        "Seasonal trend source %s failed validation or collection; trying the next adapter: %s",
        adapter.name,
        type(error).__name__,
      )
      last_error = error
      continue
  raise RuntimeError("No safe seasonal trend source was available.") from last_error
