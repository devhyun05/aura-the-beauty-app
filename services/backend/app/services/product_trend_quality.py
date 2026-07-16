"""Deterministic quality gates for automated trend collection publishing.

This module deliberately has no network or database dependency. The scheduler can
therefore evaluate the exact same policy in shadow mode and publish mode, and the
decision (including every failed reason) can be stored in the immutable audit log.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
from typing import Any, Iterable


AUTO_PUBLISH_POLICY_VERSION = "trend-now-autopublish-v1"


def _as_utc_datetime(value: Any) -> datetime | None:
  if isinstance(value, datetime):
    parsed = value
  elif isinstance(value, str) and value.strip():
    try:
      parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
      return None
  else:
    return None
  return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def evaluate_trend_source_freshness(
  *,
  source_updated_at: datetime | str | None,
  datalab_updated_at: datetime | str | None,
  weather_updated_at: datetime | str | None,
  now: datetime | None = None,
) -> dict[str, bool]:
  """Apply the production content/DataLab/weather SLAs without network or DB I/O."""
  reference = _as_utc_datetime(now or datetime.now(timezone.utc))
  assert reference is not None

  def is_fresh(value: datetime | str | None, maximum_age: timedelta) -> bool:
    timestamp = _as_utc_datetime(value)
    return bool(timestamp and reference - maximum_age <= timestamp <= reference)

  return {
    "CONTENT_FRESHNESS": is_fresh(source_updated_at, timedelta(hours=6)),
    "DATALAB_FRESHNESS": is_fresh(datalab_updated_at, timedelta(hours=36)),
    "WEATHER_FRESHNESS": is_fresh(weather_updated_at, timedelta(hours=4)),
  }


def collection_freshness_status(
  *,
  source_updated_at: datetime | str | None,
  source_payload: dict[str, Any] | str | None,
  now: datetime | None = None,
) -> str:
  """Re-evaluate a stored collection instead of relabelling old evidence as fresh."""
  payload: dict[str, Any]
  if isinstance(source_payload, str):
    try:
      decoded = json.loads(source_payload)
    except json.JSONDecodeError:
      decoded = {}
    payload = decoded if isinstance(decoded, dict) else {}
  else:
    payload = source_payload if isinstance(source_payload, dict) else {}
  collector = payload.get("collector")
  collector = collector if isinstance(collector, dict) else {}
  checks = evaluate_trend_source_freshness(
    source_updated_at=source_updated_at,
    datalab_updated_at=collector.get("datalabUpdatedAt"),
    weather_updated_at=payload.get("weatherUpdatedAt"),
    now=now,
  )
  return "fresh" if all(checks.values()) else "stale"


@dataclass(frozen=True)
class PublishQualityDecision:
  policy_version: str
  passed: bool
  should_publish: bool
  shadow_mode: bool
  reasons: tuple[str, ...]
  metrics: dict[str, Any]

  def as_dict(self) -> dict[str, Any]:
    payload = asdict(self)
    payload.update(
      {
        "policyVersion": payload.pop("policy_version"),
        "shouldPublish": payload.pop("should_publish"),
        "shadowMode": payload.pop("shadow_mode"),
        "reasons": list(self.reasons),
      }
    )
    return payload


def collection_input_fingerprint(
  *,
  locale: str,
  region_code: str,
  trend_keywords: Iterable[str],
  source_updated_at: datetime,
  weather: dict[str, Any] | None,
  items: Iterable[dict[str, Any]],
) -> str:
  """Hash only normalized inputs, so retries do not create duplicate revisions."""

  payload = {
    "locale": locale,
    "regionCode": region_code,
    "trendKeywords": sorted({str(value).strip().casefold() for value in trend_keywords if str(value).strip()}),
    "sourceUpdatedAt": source_updated_at.astimezone(timezone.utc).replace(microsecond=0).isoformat(),
    "weather": {
      key: (weather or {}).get(key)
      for key in (
        "temperatureC",
        "humidityPercent",
        "precipitationProbabilityPercent",
        "weatherCode",
        "windSpeedMps",
        "forecastAt",
      )
    },
    "items": [
      {
        "productId": str(item.get("productId") or ""),
        "shadeId": str(item.get("shadeId") or ""),
        "position": int(item.get("position") or 0),
        "reasonCodes": sorted(str(value) for value in item.get("reasonCodes") or []),
      }
      for item in items
    ],
  }
  encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str).encode()
  return hashlib.sha256(encoded).hexdigest()


def weather_changed_meaningfully(
  current: dict[str, Any] | None,
  previous: dict[str, Any] | None,
) -> bool:
  if not current or not previous:
    return bool(current) != bool(previous)

  def number(payload: dict[str, Any], key: str) -> float | None:
    try:
      return float(payload[key]) if payload.get(key) is not None else None
    except (TypeError, ValueError):
      return None

  pairs = (
    ("temperatureC", 3.0),
    ("humidityPercent", 15.0),
    ("precipitationProbabilityPercent", 30.0),
    ("windSpeedMps", 4.0),
  )
  for key, threshold in pairs:
    left, right = number(current, key), number(previous, key)
    if left is not None and right is not None and abs(left - right) >= threshold:
      return True
  current_code = current.get("weatherCode") or current.get("precipitationType") or "none"
  previous_code = previous.get("weatherCode") or previous.get("precipitationType") or "none"
  return str(current_code) != str(previous_code)


def evaluate_auto_publish_quality(
  *,
  items: list[dict[str, Any]],
  signal_groups: Iterable[str],
  source_updated_at: datetime | None,
  datalab_updated_at: datetime | None,
  weather_updated_at: datetime | None,
  average_confidence: float,
  input_fingerprint: str,
  previous_fingerprint: str | None = None,
  previous_product_ids: Iterable[str] = (),
  weather_context_changed: bool = False,
  shadow_mode: bool,
  now: datetime | None = None,
  minimum_items: int = 12,
  policy_version: str = AUTO_PUBLISH_POLICY_VERSION,
) -> PublishQualityDecision:
  """Apply the v1 production policy and return an auditable decision."""

  reference = now or datetime.now(timezone.utc)
  reference = reference if reference.tzinfo else reference.replace(tzinfo=timezone.utc)
  top = items[:12]
  group_count = len({str(value).strip() for value in signal_groups if str(value).strip()})
  brand_counts = Counter(str(item.get("brandName") or item.get("brand_name") or "").strip() for item in top)
  category_counts = Counter(str(item.get("category") or "").strip() for item in items)
  current_ids = [str(item.get("productId") or "") for item in top if item.get("productId")]
  previous_ids = [str(value) for value in previous_product_ids if str(value)]
  changed_top12 = len(set(current_ids).symmetric_difference(set(previous_ids))) // 2 if previous_ids else 0
  # A replacement changes two set members. Account for pure additions/removals too.
  if previous_ids:
    changed_top12 = max(
      len(set(current_ids) - set(previous_ids)),
      len(set(previous_ids) - set(current_ids)),
    )
  max_category_share = max(category_counts.values(), default=0) / max(1, len(items))
  has_no_sponsored_items = all(
    str(item.get("sponsorshipType") or "organic") != "sponsored"
    for item in items
  )
  eligible = all(item.get("eligibilityValid", True) is True for item in items)

  freshness_checks = evaluate_trend_source_freshness(
    source_updated_at=source_updated_at,
    datalab_updated_at=datalab_updated_at,
    weather_updated_at=weather_updated_at,
    now=reference,
  )

  checks = {
    "MINIMUM_PRODUCTS": len(items) >= minimum_items,
    "INDEPENDENT_SIGNAL_GROUPS": group_count >= 2,
    **freshness_checks,
    "AVERAGE_CONFIDENCE": average_confidence >= 0.65,
    "BRAND_DIVERSITY": bool(top) and max(brand_counts.values(), default=0) <= 2,
    "CATEGORY_DIVERSITY": len([key for key in category_counts if key]) >= 4 and max_category_share <= 0.40,
    "NO_SPONSORED_ITEMS": has_no_sponsored_items,
    "ELIGIBILITY_VALID": eligible,
    "NEW_FINGERPRINT": not previous_fingerprint or input_fingerprint != previous_fingerprint,
    "MEANINGFUL_CHANGE": not previous_ids or changed_top12 >= 2 or weather_context_changed,
    "CHANGE_SAFETY": changed_top12 <= 8 or group_count >= 3,
  }
  reasons = tuple(code for code, passed in checks.items() if not passed)
  passed = not reasons
  metrics = {
    "itemCount": len(items),
    "signalGroupCount": group_count,
    "averageConfidence": round(float(average_confidence), 4),
    "top12BrandMax": max(brand_counts.values(), default=0),
    "categoryCount": len([key for key in category_counts if key]),
    "maxCategoryShare": round(max_category_share, 4),
    "changedTop12": changed_top12,
    "inputFingerprint": input_fingerprint,
  }
  return PublishQualityDecision(
    policy_version=policy_version,
    passed=passed,
    should_publish=passed and not shadow_mode,
    shadow_mode=shadow_mode,
    reasons=reasons,
    metrics=metrics,
  )
