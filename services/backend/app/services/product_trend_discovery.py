"""Batch-only discovery of rising Korean beauty phrases from Naver content.

The module discovers candidates from live documents.  It contains safety and
beauty ontology terms, but intentionally contains no seasonal themes, trend
keywords, product ids, or publish fallback fixtures.
"""

from __future__ import annotations

import asyncio
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import hashlib
import html
import logging
from math import sqrt
import re
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse, urlunparse
from zoneinfo import ZoneInfo

import httpx

from app.core.settings import Settings
from app.services.product_catalog import validate_external_https_url
from app.services.product_trend_quota import TrendCallQuotaLedger


NAVER_TREND_HOSTS = ("openapi.naver.com", "naverapihub.apigw.ntruss.com")
logger = logging.getLogger(__name__)
CONTENT_SOURCES = ("news", "blog", "cafe")
KST = ZoneInfo("Asia/Seoul")
_HTML_TAG_PATTERN = re.compile(r"<[^>]+>")
_TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣+#&-]+")
_SPACE_PATTERN = re.compile(r"\s+")
_BLOCKED_TERMS = {
  "19금", "성인", "도박", "담배", "주류", "대출", "알바", "숙박", "마사지",
  "다이어트약", "공동구매", "공구", "협찬", "광고", "특가", "체험단",
}
_STOPWORDS = {
  "그리고", "하지만", "위한", "통한", "대한", "있는", "없는", "하는", "되는", "이번",
  "최근", "요즘", "오늘", "내일", "관련", "추천", "제품", "상품", "화장품", "메이크업",
  "뷰티", "공개", "출시", "사용", "후기", "정리", "방법", "완성", "뉴스", "블로그",
}
_COSMETIC_ANCHORS = {
  "화장", "메이크업", "뷰티", "립", "틴트", "립스틱", "립글로스", "베이스", "쿠션",
  "파운데이션", "파데", "컨실러", "프라이머", "아이", "섀도우", "팔레트", "브로우",
  "아이브로우", "눈썹", "치크", "블러셔", "아이라이너", "아이라인", "피부", "물광",
  "글로우", "매트", "블러", "워터프루프", "지속력", "마스카라", "픽서", "파우더",
}
_CATEGORY_ALIASES = {
  "base": ("베이스", "쿠션", "파운데이션", "파데", "컨실러", "프라이머", "피부", "파우더"),
  "shadow": ("아이섀도우", "섀도우", "팔레트", "쉬머", "글리터"),
  "brow": ("브로우", "아이브로우", "눈썹"),
  "cheek": ("치크", "블러셔", "블러쉬"),
  "lip": ("립", "틴트", "립스틱", "립글로스"),
  "liner": ("라이너", "아이라이너", "아이라인", "마스카라"),
}
_FINISH_ALIASES = {
  "글로우": "glossy", "글로시": "glossy", "물광": "glossy", "윤광": "glossy",
  "쉬머": "shimmer", "글리터": "shimmer", "매트": "matte", "블러": "velvet",
  "벨벳": "velvet",
}
_BENEFIT_ALIASES = {
  "촉촉": "hydrating", "수분": "hydrating", "보습": "moisturizing", "가벼운": "lightweight",
  "얇은": "lightweight", "지속력": "longwear", "롱래스팅": "longwear",
  "워터프루프": "waterproof", "유분": "oil_control", "피지": "oil_control",
  "번짐": "transfer_resistant",
}


@dataclass(frozen=True)
class NaverContentDocument:
  evidence_id: str
  source_type: str
  title: str
  summary: str
  published_at: datetime
  seed_query: str

  @property
  def searchable_text(self) -> str:
    return f"{self.title} {self.summary}".strip()


@dataclass(frozen=True)
class BurstPhraseCandidate:
  keyword: str
  document_count: int
  source_count: int
  z_score: float
  momentum: float
  categories: tuple[str, ...]
  finishes: tuple[str, ...]
  benefit_tags: tuple[str, ...]
  evidence_ids: tuple[str, ...]

  @property
  def confidence_score(self) -> float:
    evidence = min(1.0, self.document_count / 12)
    diversity = min(1.0, self.source_count / len(CONTENT_SOURCES))
    burst = min(1.0, self.z_score / 6)
    return round(0.35 * evidence + 0.25 * diversity + 0.4 * burst, 4)


@dataclass(frozen=True)
class DailyContentPhraseObservation:
  """Aggregate-only phrase evidence that is safe to persist as a baseline.

  The shape deliberately contains no document title, summary, URL, or raw body.
  ``baseline_7d`` and ``baseline_28d`` are zero-filled daily document averages,
  matching the numeric baseline columns in ``trend_source_observations``.
  """

  keyword: str
  document_count: int
  source_count: int
  baseline_7d: float
  baseline_28d: float
  daily_baseline_counts: tuple[int, ...]
  categories: tuple[str, ...]
  finishes: tuple[str, ...]
  benefit_tags: tuple[str, ...]
  evidence_ids: tuple[str, ...]


NaverContentRequester = Callable[[str, dict[str, str], dict[str, Any]], Awaitable[dict[str, Any]]]


def trend_collection_due(
  last_completed_at: datetime | None,
  *,
  now: datetime,
  interval_hours: int,
) -> bool:
  """Return whether an independently scheduled trend collection stage is due."""

  if last_completed_at is None:
    return True
  last = last_completed_at if last_completed_at.tzinfo else last_completed_at.replace(tzinfo=timezone.utc)
  current = now if now.tzinfo else now.replace(tzinfo=timezone.utc)
  return current >= last + timedelta(hours=interval_hours)


def _clean_text(value: Any, *, limit: int) -> str:
  decoded = html.unescape(_HTML_TAG_PATTERN.sub(" ", str(value or "")))
  return _SPACE_PATTERN.sub(" ", decoded).strip()[:limit]


def _published_at(value: Any) -> datetime | None:
  raw = str(value or "").strip()
  if not raw:
    return None
  try:
    if re.fullmatch(r"\d{8}", raw):
      parsed = datetime.strptime(raw, "%Y%m%d").replace(tzinfo=KST).astimezone(timezone.utc)
    else:
      parsed = parsedate_to_datetime(raw)
  except (TypeError, ValueError, OverflowError):
    return None
  return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _canonical_url(value: Any) -> str:
  raw = str(value or "").strip()
  parsed = urlparse(raw)
  if parsed.scheme not in {"http", "https"} or not parsed.hostname:
    return ""
  return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path, "", parsed.query, ""))[:1000]


def normalize_naver_content_items(
  source_type: str,
  seed_query: str,
  payload: dict[str, Any],
  *,
  collected_at: datetime,
) -> list[NaverContentDocument]:
  if source_type not in CONTENT_SOURCES:
    return []
  items = payload.get("items")
  if not isinstance(items, list):
    return []
  documents: list[NaverContentDocument] = []
  seen: set[str] = set()
  for raw in items[:100]:
    if not isinstance(raw, dict):
      continue
    title = _clean_text(raw.get("title"), limit=160)
    summary = _clean_text(raw.get("description"), limit=320)
    canonical_url = _canonical_url(raw.get("originallink") or raw.get("link"))
    identity = f"{source_type}\0{canonical_url}\0{title.casefold()}"
    evidence_id = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]
    published_at = _published_at(raw.get("pubDate") or raw.get("postdate"))
    if (
      not title
      or published_at is None
      or published_at > collected_at + timedelta(minutes=5)
      or evidence_id in seen
    ):
      continue
    seen.add(evidence_id)
    documents.append(NaverContentDocument(
      evidence_id=evidence_id,
      source_type=source_type,
      title=title,
      summary=summary,
      published_at=published_at,
      seed_query=_clean_text(seed_query, limit=48),
    ))
  return documents


def deduplicate_documents(documents: list[NaverContentDocument]) -> list[NaverContentDocument]:
  selected: dict[str, NaverContentDocument] = {}
  title_ids: set[str] = set()
  for document in sorted(documents, key=lambda value: value.published_at, reverse=True):
    title_id = hashlib.sha256(document.title.casefold().encode("utf-8")).hexdigest()[:24]
    if document.evidence_id in selected or title_id in title_ids:
      continue
    selected[document.evidence_id] = document
    title_ids.add(title_id)
  return list(selected.values())


def _naver_headers(settings: Settings, endpoint: str) -> dict[str, str]:
  host = (urlparse(endpoint).hostname or "").casefold()
  if host == "naverapihub.apigw.ntruss.com":
    client_id = settings.naver_api_hub_client_id
    client_secret = settings.naver_api_hub_client_secret
    return {
      "X-NCP-APIGW-API-KEY-ID": client_id or "",
      "X-NCP-APIGW-API-KEY": client_secret or "",
    } if client_id and client_secret else {}
  return {
    "X-Naver-Client-Id": settings.naver_shopping_client_id or "",
    "X-Naver-Client-Secret": settings.naver_shopping_client_secret or "",
  } if settings.naver_shopping_client_id and settings.naver_shopping_client_secret else {}


class NaverContentTrendProvider:
  """Collect news/blog/cafe evidence for scheduler-owned trend jobs only."""

  def __init__(
    self,
    settings: Settings,
    *,
    quota_ledger: TrendCallQuotaLedger | None,
    requester: NaverContentRequester | None = None,
  ) -> None:
    self.settings = settings
    self.quota_ledger = quota_ledger
    self._requester = requester or self._request_json

  def _endpoints(self) -> dict[str, str]:
    values = {
      "news": self.settings.naver_trend_news_endpoint,
      "blog": self.settings.naver_trend_blog_endpoint,
      "cafe": self.settings.naver_trend_cafe_endpoint,
    }
    endpoints: dict[str, str] = {}
    for source, value in values.items():
      if not value:
        continue
      endpoints[source] = validate_external_https_url(str(value), NAVER_TREND_HOSTS, kind=f"Naver {source} trend")
    return endpoints

  async def _request_json(self, endpoint: str, headers: dict[str, str], params: dict[str, Any]) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(self.settings.naver_trend_http_max_attempts):
      try:
        async with httpx.AsyncClient(timeout=self.settings.naver_trend_http_timeout_seconds) as client:
          response = await client.get(endpoint, headers=headers, params=params)
          response.raise_for_status()
          payload = response.json()
          return payload if isinstance(payload, dict) else {}
      except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as error:
        last_error = error
        status = error.response.status_code if isinstance(error, httpx.HTTPStatusError) else None
        exhausted = attempt + 1 >= self.settings.naver_trend_http_max_attempts
        if exhausted or status not in {429, 500, 502, 503, 504, None}:
          raise
        await asyncio.sleep(0.2 * (2 ** attempt))
    raise RuntimeError("Naver content retry loop exited unexpectedly") from last_error

  async def collect(self, seed_queries: tuple[str, ...], *, now: datetime) -> list[NaverContentDocument]:
    if not self.settings.naver_trend_content_enabled or self.quota_ledger is None:
      return []
    endpoints = self._endpoints()
    queries = tuple(dict.fromkeys(
      cleaned for value in seed_queries if (cleaned := _clean_text(value, limit=48))
    ))
    queries = queries[:self.settings.naver_trend_content_max_seed_queries]
    documents: list[NaverContentDocument] = []
    for query in queries:
      for source, endpoint in endpoints.items():
        headers = _naver_headers(self.settings, endpoint)
        if not headers:
          continue
        try:
          allowed = await self.quota_ledger.reserve(
            "naver",
            at=now,
            monthly_limit=self.settings.naver_trend_monthly_call_limit,
            amount=self.settings.naver_trend_http_max_attempts,
          )
        except Exception:  # noqa: BLE001 - external calls must fail closed on ledger outages.
          logger.warning("Naver content quota reservation failed; ending collection", exc_info=True)
          return deduplicate_documents(documents)
        if not allowed:
          return deduplicate_documents(documents)
        try:
          payload = await self._requester(
            endpoint,
            headers,
            {"query": query, "display": 100, "start": 1, "sort": "date"},
          )
        except (httpx.HTTPError, ValueError):
          logger.warning("Naver content source=%s failed after retry; continuing", source, exc_info=True)
          continue
        documents.extend(normalize_naver_content_items(source, query, payload, collected_at=now))
    return deduplicate_documents(documents)


def infer_categories(keyword: str) -> tuple[str, ...]:
  lowered = keyword.casefold()
  return tuple(
    category for category, aliases in _CATEGORY_ALIASES.items()
    if any(alias in lowered for alias in aliases)
  )


def _infer_aliases(keyword: str, aliases: dict[str, str]) -> tuple[str, ...]:
  lowered = keyword.casefold()
  return tuple(dict.fromkeys(value for alias, value in aliases.items() if alias in lowered))


def keyword_is_safe_beauty_phrase(keyword: str) -> bool:
  lowered = keyword.casefold()
  tokens = _TOKEN_PATTERN.findall(keyword)
  return bool(
    2 <= len(keyword) <= 48
    and 2 <= len(tokens) <= 4
    and not any(term in lowered for term in _BLOCKED_TERMS)
    and any(anchor in lowered for anchor in _COSMETIC_ANCHORS)
  )


def _document_phrases(document: NaverContentDocument) -> set[str]:
  tokens = [
    token.casefold()
    for token in _TOKEN_PATTERN.findall(document.searchable_text)
    if (len(token) > 1 or token.casefold() in _COSMETIC_ANCHORS)
    and token.casefold() not in _STOPWORDS
  ]
  phrases: set[str] = set()
  for width in range(2, 5):
    for index in range(0, len(tokens) - width + 1):
      phrase = " ".join(tokens[index:index + width])
      if keyword_is_safe_beauty_phrase(phrase):
        phrases.add(phrase)
  return phrases


def _baseline_daily_phrase_counts(
  baseline_documents: list[NaverContentDocument],
  *,
  now: datetime,
  baseline_days: int,
  baseline_phrase_counts: dict[str, list[int] | tuple[int, ...]] | None,
) -> defaultdict[str, Counter[int]]:
  recent_cutoff = now - timedelta(hours=24)
  baseline_cutoff = recent_cutoff - timedelta(days=baseline_days)
  baseline = [
    item for item in deduplicate_documents(baseline_documents)
    if baseline_cutoff <= item.published_at < recent_cutoff
  ]
  daily: defaultdict[str, Counter[int]] = defaultdict(Counter)
  for document in baseline:
    day_index = (document.published_at.date() - baseline_cutoff.date()).days
    for phrase in _document_phrases(document):
      daily[phrase][day_index] += 1
  for phrase, raw_counts in (baseline_phrase_counts or {}).items():
    normalized_phrase = " ".join(str(phrase).casefold().split())
    if not keyword_is_safe_beauty_phrase(normalized_phrase) or not isinstance(raw_counts, (list, tuple)):
      continue
    counts = list(raw_counts)[-baseline_days:]
    offset = baseline_days - len(counts)
    for index, value in enumerate(counts):
      try:
        count = max(0, int(value))
      except (TypeError, ValueError):
        continue
      daily[normalized_phrase][offset + index] += count
  return daily


def extract_daily_content_phrase_observations(
  recent_documents: list[NaverContentDocument],
  baseline_documents: list[NaverContentDocument],
  *,
  now: datetime,
  baseline_phrase_counts: dict[str, list[int] | tuple[int, ...]] | None = None,
  baseline_days: int = 28,
  limit: int = 200,
) -> list[DailyContentPhraseObservation]:
  """Return top safe 24h phrases, including phrases below the burst gate.

  These observations are intended to be stored daily with ``status='observed'``
  so a phrase has a real zero-filled history before it becomes a qualified
  burst. Only aggregate counts and opaque document hashes leave this function.
  """

  if baseline_days < 7 or limit <= 0:
    return []
  recent_cutoff = now - timedelta(hours=24)
  recent = [
    item for item in deduplicate_documents(recent_documents)
    if recent_cutoff <= item.published_at <= now
  ]
  recent_docs: defaultdict[str, set[str]] = defaultdict(set)
  recent_sources: defaultdict[str, set[str]] = defaultdict(set)
  evidence: defaultdict[str, list[str]] = defaultdict(list)
  for document in recent:
    for phrase in _document_phrases(document):
      recent_docs[phrase].add(document.evidence_id)
      recent_sources[phrase].add(document.source_type)
      if len(evidence[phrase]) < 12:
        evidence[phrase].append(document.evidence_id)

  daily = _baseline_daily_phrase_counts(
    baseline_documents,
    now=now,
    baseline_days=baseline_days,
    baseline_phrase_counts=baseline_phrase_counts,
  )
  observations: list[DailyContentPhraseObservation] = []
  for phrase, document_ids in recent_docs.items():
    counts = tuple(daily[phrase].get(index, 0) for index in range(baseline_days))
    observations.append(DailyContentPhraseObservation(
      keyword=phrase,
      document_count=len(document_ids),
      source_count=len(recent_sources[phrase]),
      baseline_7d=round(sum(counts[-7:]) / 7, 4),
      baseline_28d=round(sum(counts) / baseline_days, 4),
      daily_baseline_counts=counts,
      categories=infer_categories(phrase),
      finishes=_infer_aliases(phrase, _FINISH_ALIASES),
      benefit_tags=_infer_aliases(phrase, _BENEFIT_ALIASES),
      evidence_ids=tuple(evidence[phrase]),
    ))
  observations.sort(
    key=lambda value: (-value.document_count, -value.source_count, value.keyword),
  )
  return observations[:limit]


def extract_burst_phrases(
  recent_documents: list[NaverContentDocument],
  baseline_documents: list[NaverContentDocument],
  *,
  now: datetime,
  baseline_phrase_counts: dict[str, list[int] | tuple[int, ...]] | None = None,
  min_documents: int = 5,
  min_sources: int = 2,
  min_z_score: float = 2.5,
  baseline_days: int = 28,
  limit: int = 24,
) -> list[BurstPhraseCandidate]:
  """Compare unique 24h documents with zero-filled daily baseline counts."""

  recent_cutoff = now - timedelta(hours=24)
  recent = [item for item in deduplicate_documents(recent_documents) if recent_cutoff <= item.published_at <= now]
  recent_docs: defaultdict[str, set[str]] = defaultdict(set)
  recent_sources: defaultdict[str, set[str]] = defaultdict(set)
  evidence: defaultdict[str, list[str]] = defaultdict(list)
  for document in recent:
    for phrase in _document_phrases(document):
      recent_docs[phrase].add(document.evidence_id)
      recent_sources[phrase].add(document.source_type)
      if len(evidence[phrase]) < 12:
        evidence[phrase].append(document.evidence_id)
  daily = _baseline_daily_phrase_counts(
    baseline_documents,
    now=now,
    baseline_days=baseline_days,
    baseline_phrase_counts=baseline_phrase_counts,
  )

  candidates: list[BurstPhraseCandidate] = []
  for phrase, document_ids in recent_docs.items():
    document_count = len(document_ids)
    source_count = len(recent_sources[phrase])
    if document_count < min_documents or source_count < min_sources:
      continue
    counts = [daily[phrase].get(index, 0) for index in range(baseline_days)]
    mean = sum(counts) / max(1, baseline_days)
    variance = sum((value - mean) ** 2 for value in counts) / max(1, baseline_days)
    denominator = max(1.0, sqrt(variance), sqrt(mean + 1.0))
    z_score = (document_count - mean) / denominator
    if z_score < min_z_score:
      continue
    momentum = (document_count - mean) / max(1.0, mean)
    candidates.append(BurstPhraseCandidate(
      keyword=phrase,
      document_count=document_count,
      source_count=source_count,
      z_score=round(z_score, 4),
      momentum=round(momentum, 4),
      categories=infer_categories(phrase),
      finishes=_infer_aliases(phrase, _FINISH_ALIASES),
      benefit_tags=_infer_aliases(phrase, _BENEFIT_ALIASES),
      evidence_ids=tuple(evidence[phrase]),
    ))
  candidates.sort(key=lambda value: (-value.z_score, -value.source_count, -value.document_count, value.keyword))

  # Avoid presenting the same burst as nested 2/3/4-gram variants.
  selected: list[BurstPhraseCandidate] = []
  for candidate in candidates:
    candidate_tokens = set(candidate.keyword.split())
    duplicates_existing = False
    for existing in selected:
      existing_tokens = set(existing.keyword.split())
      overlap = len(candidate_tokens & existing_tokens) / len(candidate_tokens | existing_tokens)
      if min(len(candidate_tokens), len(existing_tokens)) >= 2 and overlap >= 0.67:
        duplicates_existing = True
        break
    if duplicates_existing:
      continue
    selected.append(candidate)
    if len(selected) >= limit:
      break
  return selected
