"""Batch pipeline that turns normalized trends into cached seasonal rows."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
import hashlib
import json
from math import log1p
import re
from typing import Any
from uuid import UUID, uuid4

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.services.product_catalog import offer_freshness_sql
from app.services.product_operators import (
  SEASONAL_EDITOR,
  SEASONAL_PUBLISHER,
  SEASONAL_REVIEWER,
  require_product_operator,
)
from app.services.product_trend_sources import TrendSnapshot, TrendSourceAdapter, collect_trend_snapshot
from app.services.product_trend_quality import collection_input_fingerprint
from app.services.product_trend_learning import (
  ActiveRankingModel,
  score_ranking_candidate,
  select_deterministic_exploration,
)
from app.services.product_trend_regions import (
  NATIONAL_REGION_CODE,
  TREND_REGION_LABELS,
  normalize_trend_region_code,
)


_TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣+#&-]+")
_GENERIC_TOKENS = {"메이크업", "화장품", "상품", "제품", "여름", "겨울", "트렌드", "추천"}
_REASON_LABELS = {
  "TREND_CATEGORY_MATCH": "주목받는 메이크업 카테고리와 맞아요",
  "TREND_KEYWORD_MATCH": "최근 트렌드 키워드와 상품 정보가 맞아요",
  "TREND_FINISH_MATCH": "트렌드 피니시와 맞아요",
  "TREND_COLOR_MATCH": "트렌드 색상 계열과 맞아요",
  "TREND_TAG_MATCH": "트렌드 특성과 상품 태그가 맞아요",
  "WEATHER_ATTRIBUTE_MATCH": "현재 지역 날씨에 맞는 사용감과 기능이에요",
  "APP_ENGAGEMENT_RISE": "최근 앱에서 관심이 빠르게 늘고 있어요",
  "POPULAR_FALLBACK": "트렌드 상품이 부족해 앱 인기 상품으로 채웠어요",
  "CONTROLLED_EXPLORATION": "새로운 인기 가능성을 안전한 범위에서 확인하고 있어요",
}


def _text(value: Any) -> str:
  return " ".join(str(value or "").strip().split())


def _tokens(*values: Any) -> set[str]:
  return {
    token.casefold()
    for value in values
    for token in _TOKEN_PATTERN.findall(_text(value))
    if token and token.casefold() not in _GENERIC_TOKENS
  }


def _list(value: Any) -> list[str]:
  if isinstance(value, str):
    try:
      decoded = json.loads(value)
    except json.JSONDecodeError:
      decoded = None
    value = decoded if isinstance(decoded, list) else [value]
  return [_text(item) for item in value or [] if _text(item)] if isinstance(value, (list, tuple)) else []


def _payload_tags(value: Any) -> list[str]:
  if isinstance(value, str):
    try:
      value = json.loads(value)
    except json.JSONDecodeError:
      return []
  if not isinstance(value, dict):
    return []
  attributes = value.get("attributes") if isinstance(value.get("attributes"), dict) else {}
  return _list(value.get("tags")) + _list(value.get("features")) + [
    _text(attributes.get("texture")),
    _text(attributes.get("undertone")),
  ]


def _engagement_score(candidate: dict[str, Any]) -> float:
  likes = max(0, int(candidate.get("liked_count") or candidate.get("likedCount") or 0))
  opens = max(0, int(candidate.get("open_count") or candidate.get("openCount") or 0))
  outbounds = max(0, int(candidate.get("outbound_count") or candidate.get("outboundCount") or 0))
  return log1p(likes) * 0.55 + log1p(opens) * 0.2 + log1p(outbounds) * 0.4


def _signal_relevance_score(signal: Any, candidate: dict[str, Any]) -> tuple[float, list[str]]:
  category = _text(candidate.get("category"))
  product_name = _text(candidate.get("product_name") or candidate.get("productName"))
  brand_name = _text(candidate.get("brand_name") or candidate.get("brandName"))
  finish = _text(candidate.get("finish")).casefold()
  color_family = _text(candidate.get("color_family") or candidate.get("colorFamily")).casefold()
  tags = _list(candidate.get("tags")) + _payload_tags(candidate.get("product_payload"))
  searchable_tokens = _tokens(product_name, brand_name, *tags, finish, color_family)
  score = 0.0
  reasons: list[str] = []
  if category in signal.categories:
    score += 4.0
    reasons.append("TREND_CATEGORY_MATCH")
  keyword_tokens = _tokens(signal.keyword)
  overlap = keyword_tokens & searchable_tokens
  if overlap:
    score += min(3.0, len(overlap) * 1.25)
    reasons.append("TREND_KEYWORD_MATCH")
  if finish and finish in {value.casefold() for value in signal.finishes}:
    score += 1.8
    reasons.append("TREND_FINISH_MATCH")
  if color_family and color_family in {value.casefold() for value in signal.color_families}:
    score += 1.4
    reasons.append("TREND_COLOR_MATCH")
  if _tokens(*signal.tags) & searchable_tokens:
    score += 1.2
    reasons.append("TREND_TAG_MATCH")
  return score * (0.55 + signal.confidence_score * 0.45), reasons


def _trend_relevance_components(
  snapshot: TrendSnapshot,
  candidate: dict[str, Any],
) -> tuple[dict[str, float], list[str]]:
  """Keep content and DataLab magnitudes in separate RRF inputs."""

  values = {"content": 0.0, "datalab": 0.0}
  best_relevance = 0.0
  best_reasons: list[str] = []
  has_explicit_source_magnitude = any(
    signal.content_momentum > 0 or signal.datalab_momentum > 0
    for signal in snapshot.signals
  )
  for signal in snapshot.signals:
    relevance, reasons = _signal_relevance_score(signal, candidate)
    if relevance > best_relevance:
      best_relevance = relevance
      best_reasons = reasons
    # Third-party/manual adapters predate source magnitudes. Preserve their
    # behavior as a content-style rank while cached production snapshots always
    # provide explicit independent magnitudes.
    content_momentum = signal.content_momentum
    if not has_explicit_source_magnitude:
      content_momentum = 1.0
    if content_momentum > 0:
      values["content"] = max(
        values["content"],
        relevance * (1.0 + log1p(content_momentum)),
      )
    if signal.datalab_momentum > 0:
      values["datalab"] = max(
        values["datalab"],
        relevance * (1.0 + log1p(signal.datalab_momentum)),
      )
  return values, best_reasons


def _trend_relevance_score(snapshot: TrendSnapshot, candidate: dict[str, Any]) -> tuple[float, list[str]]:
  values, reasons = _trend_relevance_components(snapshot, candidate)
  return max(values.values(), default=0.0), reasons


def _score_candidate(snapshot: TrendSnapshot, candidate: dict[str, Any]) -> tuple[float, list[str]]:
  """Backward-compatible scalar used by focused tests and diagnostics."""

  relevance, reasons = _trend_relevance_score(snapshot, candidate)
  return relevance + _engagement_score(candidate), reasons


def _evidence_values(candidate: dict[str, Any]) -> dict[str, list[Any]]:
  value = candidate.get("attribute_evidence") or candidate.get("attributeEvidence")
  if isinstance(value, str):
    try:
      value = json.loads(value)
    except json.JSONDecodeError:
      return {}
  if not isinstance(value, list):
    return {}
  attributes: defaultdict[str, list[Any]] = defaultdict(list)
  for row in value:
    if not isinstance(row, dict):
      continue
    try:
      confidence = float(row.get("confidenceScore") or row.get("confidence_score") or 0)
    except (TypeError, ValueError):
      continue
    if confidence < 0.8 or str(row.get("status") or "verified") != "verified":
      continue
    key = _text(row.get("attributeKey") or row.get("attribute_key")).casefold()
    if key:
      attributes[key].append(row.get("attributeValue", row.get("attribute_value")))
  return dict(attributes)


def _truthy_attribute(attributes: dict[str, list[Any]], *keys: str) -> bool:
  for key in keys:
    for value in attributes.get(key, []):
      if isinstance(value, dict):
        value = value.get("value", value.get("enabled"))
      if value is True or str(value).strip().casefold() in {"true", "1", "yes", "high"}:
        return True
  return False


def _weather_attribute_score(candidate: dict[str, Any], weather: dict[str, Any] | None) -> float:
  """Map objective forecast conditions to independently evidenced attributes."""

  if not weather:
    return 0.0
  attributes = _evidence_values(candidate)
  if not attributes:
    return 0.0
  try:
    temperature = float(weather.get("temperatureC")) if weather.get("temperatureC") is not None else None
    humidity = float(weather.get("humidityPercent")) if weather.get("humidityPercent") is not None else None
    precipitation = float(weather.get("precipitationProbabilityPercent") or 0)
  except (TypeError, ValueError):
    return 0.0
  conditions: list[bool] = []
  if temperature is not None and temperature >= 27:
    conditions.append(_truthy_attribute(attributes, "lightweight", "oil_control", "longwear"))
  if humidity is not None and humidity >= 70:
    conditions.append(_truthy_attribute(attributes, "oil_control", "longwear", "transfer_resistant"))
  if humidity is not None and humidity <= 40:
    conditions.append(_truthy_attribute(attributes, "hydrating", "moisturizing"))
  if precipitation >= 50 or str(weather.get("weatherCode") or "").casefold() in {"rain", "snow", "shower"}:
    conditions.append(_truthy_attribute(attributes, "waterproof", "longwear", "transfer_resistant"))
  return sum(1.0 for matched in conditions if matched) / len(conditions) if conditions else 0.0


def _evidence_quality_score(candidate: dict[str, Any]) -> float:
  value = candidate.get("attribute_evidence") or candidate.get("attributeEvidence")
  if isinstance(value, str):
    try:
      value = json.loads(value)
    except json.JSONDecodeError:
      return 0.0
  if not isinstance(value, list):
    return 0.0
  confidence_values: list[float] = []
  for row in value:
    if not isinstance(row, dict) or str(row.get("status") or "verified") != "verified":
      continue
    try:
      confidence = float(row.get("confidenceScore") or row.get("confidence_score") or 0)
    except (TypeError, ValueError):
      continue
    if 0.8 <= confidence <= 1.0:
      confidence_values.append(confidence)
  if not confidence_values:
    return 0.0
  return sum(confidence_values) / len(confidence_values)


def _app_signal_score(candidate: dict[str, Any]) -> float:
  try:
    value = float(candidate.get("app_signal_score") or candidate.get("appSignalScore") or 0)
  except (TypeError, ValueError):
    value = 0.0
  # This rank measures acceleration, not lifetime popularity. Long-term
  # privacy-safe aggregates are used only by the shortage fallback below.
  return max(0.0, value)


def _rrf_scores(component_values: dict[str, dict[str, float]], *, k: int = 60) -> dict[str, float]:
  """Combine independent ranks without comparing incompatible source magnitudes."""

  fused: defaultdict[str, float] = defaultdict(float)
  for values in component_values.values():
    positive_values = {
      product_id: value for product_id, value in values.items() if value > 0
    }
    if not positive_values:
      continue
    ranked = sorted(positive_values.items(), key=lambda row: (-row[1], row[0]))
    for rank, (product_id, _value) in enumerate(ranked, start=1):
      fused[product_id] += 1.0 / (k + rank)
  return dict(fused)


def _diversify(
  ranked: list[tuple[float, dict[str, Any], list[str]]],
  *,
  limit: int,
  initial: list[tuple[float, dict[str, Any], list[str]]] | None = None,
) -> list[tuple[float, dict[str, Any], list[str]]]:
  if limit <= 0:
    return []
  initial = list(initial or [])[:limit]
  if not ranked:
    return initial
  categories = list(dict.fromkeys(_text(candidate.get("category")) for _, candidate, _ in ranked))
  brand_limit = 2
  by_category: defaultdict[str, list[tuple[float, dict[str, Any], list[str]]]] = defaultdict(list)
  for row in ranked:
    by_category[_text(row[1].get("category"))].append(row)
  selected = initial
  product_ids = {
    _text(candidate.get("product_id") or candidate.get("productId"))
    for _, candidate, _ in selected
  }
  brand_counts = Counter(
    _text(candidate.get("brand_name") or candidate.get("brandName"))
    for _, candidate, _ in selected
  )
  positions: Counter[str] = Counter()

  def take(row: tuple[float, dict[str, Any], list[str]], enforce_brand: bool = True) -> bool:
    candidate = row[1]
    product_id = _text(candidate.get("product_id") or candidate.get("productId"))
    brand = _text(candidate.get("brand_name") or candidate.get("brandName"))
    if not product_id or product_id in product_ids or (enforce_brand and brand_counts[brand] >= brand_limit):
      return False
    selected.append(row)
    product_ids.add(product_id)
    brand_counts[brand] += 1
    return True

  while len(selected) < limit:
    added = False
    for category in categories:
      rows = by_category[category]
      while positions[category] < len(rows):
        row = rows[positions[category]]
        positions[category] += 1
        if take(row):
          added = True
          break
      if len(selected) >= limit:
        break
    if not added:
      break
  if len(selected) < limit:
    for row in ranked:
      take(row, enforce_brand=False)
      if len(selected) >= limit:
        break
  return selected


def match_trends_to_products(
  snapshot: TrendSnapshot,
  candidates: list[dict[str, Any]],
  *,
  limit: int,
  weather: dict[str, Any] | None = None,
  ranking_model: ActiveRankingModel | None = None,
  exploration_key: str | None = None,
) -> list[dict[str, Any]]:
  """Fuse independent source ranks, enforce diversity, then fill by popularity."""

  scored: list[tuple[str, dict[str, Any], list[str], dict[str, float]]] = []
  popular: list[tuple[float, dict[str, Any], list[str]]] = []
  for candidate in candidates:
    product_id = _text(candidate.get("product_id") or candidate.get("productId"))
    trend_values, reasons = _trend_relevance_components(snapshot, candidate)
    weather_score = _weather_attribute_score(candidate, weather)
    app_score = _app_signal_score(candidate)
    evidence_score = _evidence_quality_score(candidate)
    learned_score = score_ranking_candidate(candidate, ranking_model) or 0.0
    if weather_score > 0:
      reasons.append("WEATHER_ATTRIBUTE_MATCH")
    if app_score > 0:
      reasons.append("APP_ENGAGEMENT_RISE")
    scored.append((product_id, candidate, list(dict.fromkeys(reasons)), {
      "content": trend_values["content"],
      "datalab": trend_values["datalab"],
      "weather": weather_score,
      "app": app_score,
      "evidence": evidence_score,
      "learned": learned_score,
    }))
    popular.append((_engagement_score(candidate), candidate, ["POPULAR_FALLBACK"]))
  component_names = ["content", "datalab", "weather", "app", "evidence"]
  if ranking_model is not None:
    component_names.append("learned")
  component_values = {
    component: {product_id: values[component] for product_id, _candidate, _reasons, values in scored}
    for component in component_names
  }
  fused = _rrf_scores(component_values)
  matched = [
    (fused.get(product_id, 0.0), candidate, reasons)
    for product_id, candidate, reasons, _values in scored
    if any(code.startswith("TREND_") for code in reasons)
  ]
  matched.sort(key=lambda row: (-row[0], _text(row[1].get("product_id") or row[1].get("productId"))))
  selected = _diversify(matched, limit=limit)
  selected_ids = {_text(row[1].get("product_id") or row[1].get("productId")) for row in selected}
  if len(selected) < limit:
    popular = [row for row in popular if _text(row[1].get("product_id") or row[1].get("productId")) not in selected_ids]
    popular.sort(key=lambda row: (-row[0], _text(row[1].get("product_id") or row[1].get("productId"))))
    selected = _diversify(popular, limit=limit, initial=selected)
  model_version = ranking_model.model_version if ranking_model is not None else "rrf_v1"
  if (
    exploration_key
    and selected
    and select_deterministic_exploration(
      exploration_key,
      model_version=model_version,
    )
  ):
    selected_ids = {
      _text(row[1].get("product_id") or row[1].get("productId"))
      for row in selected
    }
    top_thirty = sorted(
      scored,
      key=lambda row: (-fused.get(row[0], 0.0), row[0]),
    )[:30]
    exploration_pool = [
      (fused.get(product_id, 0.0), candidate, reasons or ["POPULAR_FALLBACK"])
      for product_id, candidate, reasons, _values in top_thirty
      if product_id not in selected_ids
    ]

    def preserves_published_diversity(
      row: tuple[float, dict[str, Any], list[str]],
    ) -> bool:
      trial = [*selected[:-1], row]
      brands = Counter(
        _text(candidate.get("brand_name") or candidate.get("brandName"))
        for _score, candidate, _reasons in trial
      )
      if max(brands.values(), default=0) > 2:
        return False
      if len(trial) < 12:
        return True
      categories = Counter(
        _text(candidate.get("category"))
        for _score, candidate, _reasons in trial
      )
      return len([category for category in categories if category]) >= 4 and (
        max(categories.values(), default=0) / len(trial) <= 0.40
      )

    exploration_pool = [row for row in exploration_pool if preserves_published_diversity(row)]
    exploration_pool.sort(
      key=lambda row: (-row[0], _text(row[1].get("product_id") or row[1].get("productId")))
    )
    if exploration_pool:
      digest = hashlib.sha256(f"{model_version}:{exploration_key}".encode()).digest()
      exploration = exploration_pool[int.from_bytes(digest[:4], "big") % len(exploration_pool)]
      exploration = (
        exploration[0],
        exploration[1],
        list(dict.fromkeys([*exploration[2], "CONTROLLED_EXPLORATION"])),
      )
      selected[-1] = exploration
  items = []
  for position, (score, candidate, reasons) in enumerate(selected[:limit]):
    reason_codes = list(dict.fromkeys(reasons)) or ["POPULAR_FALLBACK"]
    items.append({
      "productId": _text(candidate.get("product_id") or candidate.get("productId")),
      "shadeId": _text(candidate.get("shade_id") or candidate.get("shadeId")) or None,
      "position": position,
      "reasonCode": reason_codes[0],
      "reasonCodes": reason_codes,
      "reasonLabels": [_REASON_LABELS[code] for code in reason_codes if code in _REASON_LABELS],
      "matchScore": round(score, 4),
      "scoreComponents": {
        "rrf": round(score, 6),
        "trend": round(max(
          component_values["content"].get(_text(candidate.get("product_id") or candidate.get("productId")), 0),
          component_values["datalab"].get(_text(candidate.get("product_id") or candidate.get("productId")), 0),
        ), 6),
        "content": round(component_values["content"].get(_text(candidate.get("product_id") or candidate.get("productId")), 0), 6),
        "datalab": round(component_values["datalab"].get(_text(candidate.get("product_id") or candidate.get("productId")), 0), 6),
        "weather": round(component_values["weather"].get(_text(candidate.get("product_id") or candidate.get("productId")), 0), 6),
        "app": round(component_values["app"].get(_text(candidate.get("product_id") or candidate.get("productId")), 0), 6),
        "evidence": round(component_values["evidence"].get(_text(candidate.get("product_id") or candidate.get("productId")), 0), 6),
        "learned": round(component_values.get("learned", {}).get(_text(candidate.get("product_id") or candidate.get("productId")), 0), 6),
      },
      "rankingModelVersion": model_version,
      "sponsorshipType": (
        "affiliate" if _text(candidate.get("sponsorship_type")) == "affiliate" else "organic"
      ),
      "brandName": _text(candidate.get("brand_name") or candidate.get("brandName")),
      "category": _text(candidate.get("category")),
      "eligibilityValid": True,
    })
  return items


async def fetch_seasonal_product_candidates(
  db: Database,
  settings: Settings,
  *,
  limit: int = 500,
  region_code: str = NATIONAL_REGION_CODE,
) -> list[dict[str, Any]]:
  if not db.is_connected:
    return []
  rows = await db.fetch(
    f"""
    select p.id as product_id,p.brand_name,p.product_name,p.category::text as category,
      p.tags,p.product_payload,s.id as shade_id,s.color_family,s.finish,
      attr.attribute_evidence,coalesce(sig.app_signal_score,0)::double precision as app_signal_score,
      coalesce(sig.like_count,0)::int as liked_count,
      coalesce(sig.open_count,0)::int as open_count,
      coalesce(sig.outbound_count,0)::int as outbound_count,
      coalesce(sig.history_impression_count,0)::bigint as history_impression_count,
      coalesce(sig.history_product_open_count,0)::bigint as history_product_open_count,
      coalesce(sig.history_like_count,0)::bigint as history_like_count,
      coalesce(sig.history_unlike_count,0)::bigint as history_unlike_count,
      coalesce(sig.history_seller_outbound_count,0)::bigint as history_seller_outbound_count,
      coalesce(sig.history_hide_count,0)::bigint as history_hide_count,
      coalesce(sig.history_position_adjusted_score,0)::double precision as history_position_adjusted_score,
      coalesce((
        select o.affiliate_type from product_offers o
        where o.product_id=p.id and o.is_active=true
          and o.availability_status in ('in_stock','limited') and o.license_status='valid'
          and o.affiliate_type<>'sponsored'
          and o.allowed_uses @> array['mobile_display']::text[]
          and (o.valid_until is null or o.valid_until>now())
          {offer_freshness_sql("o", "$1")}
        order by case when o.affiliate_type='none' then 0 else 1 end,
          o.price_updated_at desc nulls last,o.id
        limit 1
      ),'none') as sponsorship_type
    from products p
    left join lateral (
      select x.id,x.color_family,x.finish from product_shades x
      where x.product_id=p.id and x.is_active=true and x.license_status='valid'
        and x.allowed_uses @> array['mobile_display','recommendation']::text[]
        and (x.license_valid_from is null or x.license_valid_from<=now())
        and (x.license_valid_until is null or x.license_valid_until>now())
      order by x.reviewed_at desc nulls last,x.id limit 1
    ) s on true
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'attributeKey',x.attribute_key,
        'attributeValue',x.attribute_value,
        'confidenceScore',x.confidence_score,
        'status',x.status
      ) order by x.attribute_key,x.confidence_score desc) as attribute_evidence
      from product_attribute_evidence x
      where x.product_id=p.id and x.status='verified' and x.confidence_score>=0.8
        and (x.expires_at is null or x.expires_at>now())
    ) attr on true
    left join lateral (
      select coalesce(sum(x.position_adjusted_score) filter (
        where x.bucket_started_at>=date_trunc('hour',now())-interval '24 hours'
          and x.bucket_started_at<date_trunc('hour',now())
      ),0)-coalesce(sum(x.position_adjusted_score) filter (
        where x.bucket_started_at>=date_trunc('hour',now())-interval '48 hours'
          and x.bucket_started_at<date_trunc('hour',now())-interval '24 hours'
      ),0) as app_signal_score,
        coalesce(sum(x.like_count),0) as like_count,
        coalesce(sum(x.product_open_count),0) as open_count,
        coalesce(sum(x.seller_outbound_count),0) as outbound_count,
        coalesce(sum(x.impression_count) filter (
          where x.bucket_started_at>=date_trunc('hour',now())-interval '24 hours'
            and x.bucket_started_at<date_trunc('hour',now())
        ),0) as history_impression_count,
        coalesce(sum(x.product_open_count) filter (
          where x.bucket_started_at>=date_trunc('hour',now())-interval '24 hours'
            and x.bucket_started_at<date_trunc('hour',now())
        ),0) as history_product_open_count,
        coalesce(sum(x.like_count) filter (
          where x.bucket_started_at>=date_trunc('hour',now())-interval '24 hours'
            and x.bucket_started_at<date_trunc('hour',now())
        ),0) as history_like_count,
        coalesce(sum(x.unlike_count) filter (
          where x.bucket_started_at>=date_trunc('hour',now())-interval '24 hours'
            and x.bucket_started_at<date_trunc('hour',now())
        ),0) as history_unlike_count,
        coalesce(sum(x.seller_outbound_count) filter (
          where x.bucket_started_at>=date_trunc('hour',now())-interval '24 hours'
            and x.bucket_started_at<date_trunc('hour',now())
        ),0) as history_seller_outbound_count,
        coalesce(sum(x.hide_count) filter (
          where x.bucket_started_at>=date_trunc('hour',now())-interval '24 hours'
            and x.bucket_started_at<date_trunc('hour',now())
        ),0) as history_hide_count,
        coalesce(sum(x.position_adjusted_score) filter (
          where x.bucket_started_at>=date_trunc('hour',now())-interval '24 hours'
            and x.bucket_started_at<date_trunc('hour',now())
        ),0) as history_position_adjusted_score
      from product_signal_hourly x
      where x.product_id=p.id and x.is_privacy_eligible=true
        and x.region_code=any(array[$3::text,'KR-00']::text[])
        and x.bucket_started_at>=date_trunc('hour',now())-interval '28 days'
    ) sig on true
    where p.is_active=true and p.catalog_status='published' and p.license_status='valid'
      and p.allowed_uses @> array['mobile_display','recommendation']::text[]
      and (p.license_valid_from is null or p.license_valid_from<=now())
      and (p.license_valid_until is null or p.license_valid_until>now())
      and exists (
        select 1 from product_assets a where a.product_id=p.id and a.is_active=true
          and a.asset_type='packshot' and a.license_status='valid'
          and a.allowed_uses @> array['mobile_display','recommendation']::text[]
          and (a.valid_from is null or a.valid_from<=now()) and (a.valid_until is null or a.valid_until>now())
      )
      and exists (
        select 1 from product_offers o where o.product_id=p.id and o.is_active=true
          and o.availability_status in ('in_stock','limited') and o.license_status='valid'
          and o.affiliate_type<>'sponsored'
          and o.allowed_uses @> array['mobile_display']::text[]
          and (o.valid_until is null or o.valid_until>now())
          {offer_freshness_sql("o", "$1")}
      )
    order by coalesce(sig.app_signal_score,0) desc,p.id
    limit $2
    """,
    settings.product_offer_max_age_hours,
    limit,
    normalize_trend_region_code(region_code),
  )
  return [dict(row) for row in rows]


async def fetch_region_weather(
  db: Database,
  *,
  region_code: str,
) -> dict[str, Any] | None:
  if not db.is_connected:
    return None
  row = await db.fetchrow(
    """
    select region_code,region_label,source_name,source_updated_at,forecast_at,expires_at,
      temperature_c,humidity_percent,precipitation_probability_percent,
      precipitation_mm,wind_speed_mps,weather_code,weather_summary
    from weather_region_snapshots
    where region_code=$1 and expires_at>now()
    order by forecast_at desc,source_updated_at desc limit 1
    """,
    normalize_trend_region_code(region_code),
  )
  if not row:
    return None
  value = dict(row)
  return {
    "regionCode": value.get("region_code"),
    "regionLabel": value.get("region_label"),
    "sourceName": value.get("source_name"),
    "sourceUpdatedAt": value.get("source_updated_at"),
    "forecastAt": value.get("forecast_at"),
    "expiresAt": value.get("expires_at"),
    "temperatureC": value.get("temperature_c"),
    "humidityPercent": value.get("humidity_percent"),
    "precipitationProbabilityPercent": value.get("precipitation_probability_percent"),
    "precipitationMm": value.get("precipitation_mm"),
    "windSpeedMps": value.get("wind_speed_mps"),
    "weatherCode": value.get("weather_code"),
    "weatherSummary": value.get("weather_summary"),
  }


async def _require_publish_actors(connection: Any, *, created_by: UUID, reviewed_by: UUID, published_by: UUID) -> None:
  if published_by in {created_by, reviewed_by}:
    raise AppError(422, "SEASONAL_TWO_PERSON_REQUIRED", "Seasonal reviewer/publisher separation is required.")
  for actor_id, role in ((created_by, SEASONAL_EDITOR), (reviewed_by, SEASONAL_REVIEWER), (published_by, SEASONAL_PUBLISHER)):
    await require_product_operator(
      connection,
      user_id=actor_id,
      roles={role},
      error_code="INVALID_SEASONAL_ACTOR",
      message=f"Seasonal trend publishing requires an active {role} grant.",
    )


async def persist_trend_collection(
  db: Database,
  snapshot: TrendSnapshot,
  items: list[dict[str, Any]],
  *,
  publish: bool,
  created_by: UUID | None = None,
  reviewed_by: UUID | None = None,
  published_by: UUID | None = None,
  region_code: str = NATIONAL_REGION_CODE,
  algorithm_version: str = "trend_now_rrf_v1",
  input_fingerprint: str | None = None,
  freshness_status: str = "fresh",
  auto_publish_policy_version: str | None = None,
  pipeline_run_id: UUID | None = None,
  service_principal_id: UUID | None = None,
  weather: dict[str, Any] | None = None,
  quality_gate_results: dict[str, Any] | None = None,
  offer_max_age_hours: int = 168,
  now: datetime | None = None,
) -> UUID:
  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Seasonal trend collection persistence requires a database.")
  generated_at = now or datetime.now(timezone.utc)
  if snapshot.is_stale:
    raise AppError(422, "STALE_TREND_SOURCE", "A stale trend source cannot create a collection.")
  if publish and not items:
    raise AppError(422, "SEASONAL_PRODUCTS_REQUIRED", "A published trend collection requires eligible products.")
  requested_items: list[dict[str, str | None]] = []
  if publish:
    try:
      requested_items = [{
        "productId": str(UUID(item["productId"])),
        "shadeId": str(UUID(item["shadeId"])) if item.get("shadeId") else None,
      } for item in items]
    except (KeyError, TypeError, ValueError, AttributeError) as error:
      raise AppError(
        422,
        "INVALID_SEASONAL_PRODUCT_REFERENCE",
        "Published trend items require valid product and optional shade UUIDs.",
      ) from error
    product_ids = [item["productId"] for item in requested_items]
    if len(set(product_ids)) != len(product_ids):
      raise AppError(
        422,
        "SEASONAL_DUPLICATE_PRODUCTS",
        "A published trend collection cannot contain the same product more than once.",
      )
  automated_publish = publish and service_principal_id is not None
  if publish and not automated_publish and not all((created_by, reviewed_by, published_by)):
    raise AppError(422, "SEASONAL_ACTORS_REQUIRED", "Publishing requires editor, reviewer and publisher actor IDs.")
  if automated_publish and not all((pipeline_run_id, auto_publish_policy_version, input_fingerprint)):
    raise AppError(
      422,
      "SEASONAL_AUTOMATION_EVIDENCE_REQUIRED",
      "Automated publishing requires a pipeline run, policy version and input fingerprint.",
    )
  collection_id = uuid4()
  normalized_region = normalize_trend_region_code(region_code)
  slug = (
    f"trend-now-{snapshot.locale.casefold().replace('_', '-')}-"
    f"{normalized_region.casefold()}"
  )
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      latest_revision = await connection.fetchrow(
        "select id,revision,status from product_seasonal_collections where slug=$1 order by revision desc limit 1 for update",
        slug,
      )
      previous_published = await connection.fetchrow(
        """select id,revision,status from product_seasonal_collections
        where slug=$1 and status='published' order by revision desc limit 1 for update""",
        slug,
      )
      revision = int((latest_revision or {}).get("revision") or 0) + 1
      if publish and not automated_publish:
        await _require_publish_actors(
          connection,
          created_by=created_by,  # type: ignore[arg-type]
          reviewed_by=reviewed_by,  # type: ignore[arg-type]
          published_by=published_by,  # type: ignore[arg-type]
        )
      if automated_publish:
        principal = await connection.fetchrow(
          """
          select id from product_recommendation_service_principals
          where id=$1 and status='active' and 'seasonal_auto_publisher'=any(roles)
          for update
          """,
          service_principal_id,
        )
        if not principal:
          raise AppError(
            403,
            "INVALID_SEASONAL_SERVICE_PRINCIPAL",
            "Automated publishing requires an active seasonal_auto_publisher service principal.",
          )
      if publish:
        eligible_count = await connection.fetchval(
          f"""
          with requested as (
            select (item->>'productId')::uuid as product_id,
              nullif(item->>'shadeId','')::uuid as shade_id
            from jsonb_array_elements($1::jsonb) item
          )
          select count(*)::int from requested r
          join products p on p.id=r.product_id
          where p.is_active=true
            and p.catalog_status='published' and p.license_status='valid'
            and p.allowed_uses @> array['mobile_display','recommendation']::text[]
            and (p.license_valid_from is null or p.license_valid_from<=now())
            and (p.license_valid_until is null or p.license_valid_until>now())
            and (r.shade_id is null or exists (
              select 1 from product_shades s
              where s.id=r.shade_id and s.product_id=p.id and s.is_active=true
                and s.license_status='valid'
                and s.allowed_uses @> array['mobile_display','recommendation']::text[]
                and (s.license_valid_from is null or s.license_valid_from<=now())
                and (s.license_valid_until is null or s.license_valid_until>now())
            ))
            and exists (
              select 1 from product_assets a where a.product_id=p.id and a.is_active=true
                and a.asset_type='packshot' and a.license_status='valid'
                and a.allowed_uses @> array['mobile_display','recommendation']::text[]
                and (a.shade_id is null or a.shade_id=r.shade_id)
                and (a.valid_from is null or a.valid_from<=now())
                and (a.valid_until is null or a.valid_until>now())
            )
            and exists (
              select 1 from product_offers o where o.product_id=p.id and o.is_active=true
                and o.availability_status in ('in_stock','limited') and o.license_status='valid'
                and o.affiliate_type<>'sponsored'
                and o.allowed_uses @> array['mobile_display']::text[]
                and (o.shade_id is null or o.shade_id=r.shade_id)
                and (o.valid_until is null or o.valid_until>now())
                {offer_freshness_sql("o", "$2")}
            )
          """,
          json.dumps(requested_items),
          offer_max_age_hours,
        )
        if int(eligible_count or 0) != len(requested_items):
          raise AppError(
            409,
            "SEASONAL_PRODUCT_ELIGIBILITY_CHANGED",
            "A product became unavailable during publish validation; the previous collection was preserved.",
          )
      status = "published" if publish else "draft"
      source_payload = {
        "sourceName": snapshot.source_name,
        "sourceUpdatedAt": snapshot.source_updated_at.isoformat(),
        "providerStatus": "collected",
        "trendMetric": snapshot.source_metadata.get("metric", "trend_signal"),
        "collector": snapshot.source_metadata,
        "contentReviewReference": "automated-normalize-validate-v1",
        "weatherSummary": (weather or {}).get("weatherSummary"),
        "weatherUpdatedAt": (
          (weather or {}).get("sourceUpdatedAt").isoformat()
          if isinstance((weather or {}).get("sourceUpdatedAt"), datetime)
          else (weather or {}).get("sourceUpdatedAt")
        ),
        "bedrockUsed": bool(snapshot.source_metadata.get("bedrockUsed")),
        "weather": {
          key: value.isoformat() if isinstance(value, datetime) else value
          for key, value in (weather or {}).items()
          if key in {
            "regionCode",
            "temperatureC",
            "humidityPercent",
            "precipitationProbabilityPercent",
            "precipitationMm",
            "windSpeedMps",
            "weatherCode",
          }
        } or None,
      }
      source_labels = [snapshot.source_name]
      weather_source = str((weather or {}).get("sourceName") or "").strip()
      if weather_source and weather_source not in source_labels:
        source_labels.append(weather_source)
      if publish and previous_published:
        await connection.execute(
          """update product_seasonal_collections set status='suspended',
            suspension_reason='superseded_by_trend_refresh',updated_at=now()
            where slug=$1 and status='published'""",
          slug,
        )
      await connection.execute(
        """insert into product_seasonal_collections (
          id,slug,title,summary,locale,region_code,region_label,trend_window,source_name,source_updated_at,
          source_labels,source_payload,trend_keywords,reason_codes,confidence_score,
          valid_from,valid_until,reviewed_at,published_at,status,revision,
          algorithm_version,input_fingerprint,freshness_status,auto_publish_policy_version,
          pipeline_run_id,published_by_service_principal_id,next_evaluation_at,
          created_by,reviewed_by,published_by,previous_revision_id
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,
          case when $18::text='published' then now() else null end,
          case when $18::text='published' then now() else null end,$18,$19,$20,$21,$22,$23,
          $24,$25,$26,$27,$28,$29,$30)""",
        collection_id,
        slug,
        snapshot.title,
        snapshot.summary,
        snapshot.locale,
        normalized_region,
        TREND_REGION_LABELS[normalized_region],
        snapshot.trend_window,
        snapshot.source_name,
        snapshot.source_updated_at,
        source_labels,
        json.dumps(source_payload),
        snapshot.trend_keywords,
        snapshot.reason_codes,
        snapshot.confidence_score,
        generated_at,
        generated_at + timedelta(days=7),
        status,
        revision,
        algorithm_version,
        input_fingerprint,
        freshness_status,
        auto_publish_policy_version,
        pipeline_run_id,
        service_principal_id if automated_publish else None,
        generated_at + timedelta(hours=3),
        None if automated_publish else created_by,
        None if automated_publish else reviewed_by if publish else None,
        None if automated_publish else published_by if publish else None,
        (
          previous_published.get("id")
          if publish and previous_published
          else latest_revision.get("id") if latest_revision else None
        ),
      )
      for item in items:
        await connection.execute(
          """insert into product_seasonal_collection_items (
            collection_id,product_id,shade_id,position,reason_code,reason_codes,match_score,
            score_components,ranking_model_version,sponsorship_type
          ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)""",
          collection_id,
          UUID(item["productId"]),
          UUID(item["shadeId"]) if item.get("shadeId") else None,
          item["position"],
          item["reasonCode"],
          item["reasonCodes"],
          item["matchScore"],
          json.dumps(item.get("scoreComponents") or {}),
          item.get("rankingModelVersion") or algorithm_version,
          item["sponsorshipType"],
        )
      if automated_publish:
        await connection.execute(
          """
          insert into seasonal_auto_publish_audit_log (
            pipeline_run_id,collection_id,previous_collection_id,service_principal_id,
            policy_version,decision,input_fingerprint,gate_results,reason_codes
          ) values ($1,$2,$3,$4,$5,'published',$6,$7::jsonb,$8)
          """,
          pipeline_run_id,
          collection_id,
          previous_published.get("id") if previous_published else None,
          service_principal_id,
          auto_publish_policy_version,
          input_fingerprint,
          json.dumps(quality_gate_results or {}),
          list((quality_gate_results or {}).get("reasons") or []),
        )
        await connection.execute(
          """update product_recommendation_service_principals
          set last_used_at=now(),updated_at=now() where id=$1""",
          service_principal_id,
        )
  from app.services.product_recommendations import clear_seasonal_recommendation_cache
  clear_seasonal_recommendation_cache()
  return collection_id


async def refresh_seasonal_trend_collection(
  db: Database,
  settings: Settings,
  *,
  locale: str = "ko-KR",
  limit: int = 18,
  apply: bool = False,
  publish: bool = False,
  created_by: UUID | None = None,
  reviewed_by: UUID | None = None,
  published_by: UUID | None = None,
  adapters: tuple[TrendSourceAdapter, ...] | None = None,
  region_code: str = NATIONAL_REGION_CODE,
  algorithm_version: str = "trend_now_rrf_v1",
  auto_publish_policy_version: str | None = None,
  pipeline_run_id: UUID | None = None,
  service_principal_id: UUID | None = None,
  quality_gate_results: dict[str, Any] | None = None,
  now: datetime | None = None,
) -> dict[str, Any]:
  snapshot = await collect_trend_snapshot(settings, locale=locale, now=now, adapters=adapters)
  normalized_region = normalize_trend_region_code(region_code)
  weather = await fetch_region_weather(db, region_code=normalized_region)
  candidates = await fetch_seasonal_product_candidates(
    db,
    settings,
    region_code=normalized_region,
  )
  items = match_trends_to_products(snapshot, candidates, limit=limit, weather=weather)
  fingerprint = collection_input_fingerprint(
    locale=snapshot.locale,
    region_code=normalized_region,
    trend_keywords=snapshot.trend_keywords,
    source_updated_at=snapshot.source_updated_at,
    weather=weather,
    items=items,
  )
  collection_id = None
  if apply:
    collection_id = await persist_trend_collection(
      db,
      snapshot,
      items,
      publish=publish,
      created_by=created_by,
      reviewed_by=reviewed_by,
      published_by=published_by,
      region_code=normalized_region,
      algorithm_version=algorithm_version,
      input_fingerprint=fingerprint,
      auto_publish_policy_version=auto_publish_policy_version,
      pipeline_run_id=pipeline_run_id,
      service_principal_id=service_principal_id,
      weather=weather,
      quality_gate_results=quality_gate_results,
      offer_max_age_hours=settings.product_offer_max_age_hours,
      now=now,
    )
  return {
    "mode": "apply" if apply else "dry-run",
    "status": "published" if apply and publish else "draft" if apply else "preview",
    "collectionId": str(collection_id) if collection_id else None,
    "slug": f"trend-now-{snapshot.locale.casefold().replace('_', '-')}-{normalized_region.casefold()}",
    "title": snapshot.title,
    "summary": snapshot.summary,
    "trendWindow": snapshot.trend_window,
    "locale": snapshot.locale,
    "sourceName": snapshot.source_name,
    "sourceUpdatedAt": snapshot.source_updated_at.isoformat(),
    "trendKeywords": snapshot.trend_keywords,
    "reasonCodes": snapshot.reason_codes,
    "confidenceScore": snapshot.confidence_score,
    "regionCode": normalized_region,
    "regionLabel": TREND_REGION_LABELS[normalized_region],
    "weather": weather,
    "algorithmVersion": algorithm_version,
    "inputFingerprint": fingerprint,
    "candidateCount": len(candidates),
    "itemCount": len(items),
    "items": items,
  }
