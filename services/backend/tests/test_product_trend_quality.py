from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services.product_trend_quality import (
  collection_freshness_status,
  collection_input_fingerprint,
  evaluate_auto_publish_quality,
  evaluate_trend_source_freshness,
  weather_changed_meaningfully,
)


NOW = datetime(2026, 7, 16, 6, 0, tzinfo=timezone.utc)


def _items() -> list[dict]:
  categories = ("base", "lip", "shadow", "cheek")
  return [
    {
      "productId": f"product-{index}",
      "position": index,
      "brandName": f"brand-{index % 6}",
      "category": categories[index % len(categories)],
      "reasonCodes": ["TREND_KEYWORD_MATCH"],
      "sponsorshipType": "organic",
      "eligibilityValid": True,
    }
    for index in range(12)
  ]


def test_auto_publish_gate_passes_but_shadow_mode_does_not_publish() -> None:
  decision = evaluate_auto_publish_quality(
    items=_items(),
    signal_groups=("naver_content", "datalab", "app_engagement"),
    source_updated_at=NOW - timedelta(hours=1),
    datalab_updated_at=NOW - timedelta(hours=10),
    weather_updated_at=NOW - timedelta(hours=2),
    average_confidence=0.8,
    input_fingerprint="new",
    shadow_mode=True,
    now=NOW,
  )
  assert decision.passed is True
  assert decision.should_publish is False
  assert decision.reasons == ()


def test_auto_publish_gate_blocks_duplicate_stale_and_overconcentrated_inputs() -> None:
  items = _items()
  for item in items:
    item["category"] = "lip"
  decision = evaluate_auto_publish_quality(
    items=items,
    signal_groups=("naver_content",),
    source_updated_at=NOW - timedelta(hours=7),
    datalab_updated_at=NOW - timedelta(hours=40),
    weather_updated_at=NOW - timedelta(hours=5),
    average_confidence=0.4,
    input_fingerprint="same",
    previous_fingerprint="same",
    previous_product_ids=[item["productId"] for item in items],
    shadow_mode=False,
    now=NOW,
  )
  assert decision.passed is False
  assert decision.should_publish is False
  assert {
    "INDEPENDENT_SIGNAL_GROUPS",
    "CONTENT_FRESHNESS",
    "DATALAB_FRESHNESS",
    "WEATHER_FRESHNESS",
    "AVERAGE_CONFIDENCE",
    "CATEGORY_DIVERSITY",
    "NEW_FINGERPRINT",
    "MEANINGFUL_CHANGE",
  }.issubset(decision.reasons)


def test_collection_fingerprint_is_deterministic_and_weather_sensitive() -> None:
  arguments = {
    "locale": "ko-KR",
    "region_code": "KR-11",
    "trend_keywords": ["글로우 립", "워터프루프"],
    "source_updated_at": NOW,
    "weather": {"temperatureC": 30, "humidityPercent": 80, "precipitationType": "rain"},
    "items": _items(),
  }
  assert collection_input_fingerprint(**arguments) == collection_input_fingerprint(**arguments)
  changed = {**arguments, "weather": {**arguments["weather"], "temperatureC": 22}}
  assert collection_input_fingerprint(**arguments) != collection_input_fingerprint(**changed)


def test_weather_change_thresholds_are_explicit() -> None:
  previous = {"temperatureC": 24, "humidityPercent": 55, "windSpeedMps": 1, "precipitationType": "none"}
  assert weather_changed_meaningfully({**previous, "temperatureC": 26}, previous) is False
  assert weather_changed_meaningfully({**previous, "humidityPercent": 72}, previous) is True
  assert weather_changed_meaningfully({**previous, "precipitationType": "rain"}, previous) is True


def test_stored_collection_freshness_reuses_publish_slas_and_rejects_future_values() -> None:
  checks = evaluate_trend_source_freshness(
    source_updated_at=NOW - timedelta(hours=6),
    datalab_updated_at=NOW - timedelta(hours=36),
    weather_updated_at=NOW - timedelta(hours=4),
    now=NOW,
  )
  assert all(checks.values())
  assert collection_freshness_status(
    source_updated_at=NOW - timedelta(hours=1),
    source_payload={
      "collector": {"datalabUpdatedAt": (NOW - timedelta(hours=12)).isoformat()},
      "weatherUpdatedAt": (NOW - timedelta(hours=2)).isoformat(),
    },
    now=NOW,
  ) == "fresh"
  assert collection_freshness_status(
    source_updated_at=NOW - timedelta(hours=7),
    source_payload={
      "collector": {"datalabUpdatedAt": (NOW - timedelta(hours=12)).isoformat()},
      "weatherUpdatedAt": (NOW - timedelta(hours=2)).isoformat(),
    },
    now=NOW,
  ) == "stale"
  assert evaluate_trend_source_freshness(
    source_updated_at=NOW + timedelta(seconds=1),
    datalab_updated_at=NOW,
    weather_updated_at=NOW,
    now=NOW,
  )["CONTENT_FRESHNESS"] is False
