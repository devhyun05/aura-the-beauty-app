"""B7 §7.3 — 최소 개인화 루프의 user_taste_profile 계산·채점 (새도 모드).

계약(종합보고서 §7.3 단일 설계 — 비협상):
- 프로필은 **softPreferences에 절대 주입하지 않는다.** 분리된 profileScore 성분으로
  계산해 anchor 선정 단계에만 반영한다(diverse/discovery·floor·전체 정렬 미사용).
  이 모듈은 프로필 자료구조와 raw 점수만 제공하고, anchor 개입은
  ranking.select_anchor_with_profile 한 곳에서만 일어난다.
- 가중치 save=3, purchase_click=2, product_open=1, hide=-3 (초기값 — 실험 대상).
  반감기 30일 지수감쇠 — 프로필은 **세션 간** 신호만 담당한다(세션 내는 질문/refine).
- 음수 선호는 음수 weight가 아니라 avoid 맵(attrAvoid/brandAvoid)으로 — 저장되는
  weight는 전부 양수다.
- 콜드스타트: actionable 이벤트가 **복수 세션·복수 일자**에 걸쳐 5건 이상일 때만
  프로필 생성(단일 세션 반복 클릭은 (session, type, product) dedupe로 cap). 미달 시 None.
- 명시 세션 선호(프롬프트>리포트)와 같은 attribute의 프로필 신호는
  ``explicit_attributes``로 억제한다(프롬프트>리포트>프로필 위계).
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
from datetime import datetime, timezone
from typing import Any

from app.core.settings import Settings, get_settings


logger = logging.getLogger(__name__)

# §7.3 이벤트 가중치 (초기값 — 실험 대상). unsave/unhide는 actionable이 아니다.
EVENT_WEIGHTS: dict[str, float] = {
  "save": 3.0,
  "purchase_click": 2.0,
  "product_open": 1.0,
  "hide": -3.0,
}
HALF_LIFE_DAYS = 30.0

# 콜드스타트 게이트 — "이벤트 5건"이 아니라 복수 세션·복수 일자 actionable 5건 이상.
MIN_ACTIONABLE_EVENTS = 5
MIN_DISTINCT_SESSIONS = 2
MIN_DISTINCT_DAYS = 2

# anchor 개입 상한 — 최종점수 단위 (§13 R2 계약의 CAP_REPORT 0.02보다 작게).
CAP_PROFILE = 0.01
# MMR 상위 몇 개까지만 anchor 후보로 재평가하는가 (§7.3 anchor-only).
PROFILE_ANCHOR_TOP_K = 5
# 완전 지배 신호 1개당 최종점수 기여 (초기값) — cap의 절반이라 신호 2개부터 포화.
PROFILE_SIGNAL_UNIT = 0.005

_PROFILE_ATTRIBUTES = ("finish", "colorFamily", "texture")


def _normalized_brand(value: Any) -> str:
  # ranking.normalized_brand와 동일 규칙 — ranking이 이 모듈을 임포트하므로
  # (순환 방지) 정규화 규칙만 여기 복제한다. 규칙 변경 시 두 곳을 함께 고칠 것.
  return re.sub(r"[^0-9a-z가-힣]+", "", str(value or "").strip().lower())


def _coerce_datetime(value: Any) -> datetime | None:
  if isinstance(value, datetime):
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
  if isinstance(value, (int, float)):
    try:
      return datetime.fromtimestamp(float(value), tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
      return None
  if isinstance(value, str) and value.strip():
    try:
      parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
      return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
      return None
  return None


def _event_field(event: dict[str, Any], *names: str) -> Any:
  for name in names:
    value = event.get(name)
    if value not in (None, ""):
      return value
  return None


def decay_factor(occurred_at: datetime, now: datetime) -> float:
  """반감기 30일 지수감쇠 — 미래 시각은 감쇠 없음(1.0)으로 클램프."""
  age_days = max(0.0, (now - occurred_at).total_seconds() / 86400.0)
  return 0.5 ** (age_days / HALF_LIFE_DAYS)


def _percentile(sorted_values: list[float], quantile: float) -> float:
  position = (len(sorted_values) - 1) * quantile
  lower = math.floor(position)
  upper = math.ceil(position)
  if lower == upper:
    return sorted_values[lower]
  fraction = position - lower
  return sorted_values[lower] * (1.0 - fraction) + sorted_values[upper] * fraction


def _dedupe_actionable(events: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
  """(session, type, product) 단위 dedupe — 단일 세션 반복 클릭 cap.

  같은 키는 가장 최근 발생 1건만 남긴다(콜드스타트 집계·가중치 누적 공용).
  """
  latest: dict[tuple[str, str, str], dict[str, Any]] = {}
  for event in events:
    event_type = str(_event_field(event, "eventType", "event_type") or "").strip()
    if event_type not in EVENT_WEIGHTS:
      continue
    occurred_at = _coerce_datetime(_event_field(event, "occurredAt", "occurred_at")) or now
    key = (
      str(_event_field(event, "sessionId", "session_id") or "").strip(),
      event_type,
      str(_event_field(event, "productId", "product_id") or "").strip(),
    )
    normalized = {
      "eventType": event_type,
      "sessionId": key[0],
      "productId": key[2],
      "occurredAt": occurred_at,
    }
    existing = latest.get(key)
    if existing is None or occurred_at > existing["occurredAt"]:
      latest[key] = normalized
  return list(latest.values())


def cold_start_eligible(events: list[dict[str, Any]], *, now: datetime | None = None) -> bool:
  """복수 세션·복수 일자에 걸친 actionable 이벤트 5건 이상 — 미달 owner는 프로필 없음."""
  now = now or datetime.now(tz=timezone.utc)
  deduped = _dedupe_actionable(events, now)
  if len(deduped) < MIN_ACTIONABLE_EVENTS:
    return False
  sessions = {event["sessionId"] for event in deduped}
  days = {event["occurredAt"].date() for event in deduped}
  return len(sessions) >= MIN_DISTINCT_SESSIONS and len(days) >= MIN_DISTINCT_DAYS


def build_taste_profile(
  events: list[dict[str, Any]],
  *,
  catalog: Any,
  now: datetime | None = None,
) -> dict[str, Any] | None:
  """owner 1명의 이벤트 → user_taste_profile. 콜드스타트 미달·신호 0이면 None.

  ``catalog``는 ``get(product_id) -> item | None``을 제공하면 된다
  (AuradinCatalog 또는 plain dict).
  """
  now = now or datetime.now(tz=timezone.utc)
  if not cold_start_eligible(events, now=now):
    return None

  getter = catalog.get if hasattr(catalog, "get") else (lambda _key: None)
  attr_positive: dict[str, dict[str, float]] = {}
  attr_negative: dict[str, dict[str, float]] = {}
  brand_positive: dict[str, float] = {}
  brand_negative: dict[str, float] = {}
  engaged_prices: list[float] = []

  deduped = _dedupe_actionable(events, now)
  for event in deduped:
    item = getter(event["productId"]) if event["productId"] else None
    if not isinstance(item, dict):
      continue
    weight = EVENT_WEIGHTS[event["eventType"]] * decay_factor(event["occurredAt"], now)
    magnitude = abs(weight)
    if magnitude <= 0.0:
      continue
    positive = weight > 0.0

    attrs = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
    for attribute in _PROFILE_ATTRIBUTES:
      value = str(attrs.get(attribute) or "").strip()
      if not value:
        continue
      bucket = attr_positive if positive else attr_negative
      by_value = bucket.setdefault(attribute, {})
      by_value[value] = by_value.get(value, 0.0) + magnitude

    brand = _normalized_brand(item.get("brandName"))
    if brand:
      bucket = brand_positive if positive else brand_negative
      bucket[brand] = bucket.get(brand, 0.0) + magnitude

    if positive:
      price = float((item.get("liveOffer") or {}).get("priceKrw") or 0)
      if price > 0:
        engaged_prices.append(price)

  # 음수 선호는 avoid 맵으로 — 같은 값에 양·음이 다 쌓였으면 net 부호 쪽에만 남긴다.
  attr_affinity: dict[str, dict[str, float]] = {}
  attr_avoid: dict[str, dict[str, float]] = {}
  for attribute in set(attr_positive) | set(attr_negative):
    for value in set(attr_positive.get(attribute, {})) | set(attr_negative.get(attribute, {})):
      net = attr_positive.get(attribute, {}).get(value, 0.0) - attr_negative.get(attribute, {}).get(value, 0.0)
      if net > 1e-9:
        attr_affinity.setdefault(attribute, {})[value] = round(net, 4)
      elif net < -1e-9:
        attr_avoid.setdefault(attribute, {})[value] = round(-net, 4)

  brand_affinity: dict[str, float] = {}
  brand_avoid: dict[str, float] = {}
  for brand in set(brand_positive) | set(brand_negative):
    net = brand_positive.get(brand, 0.0) - brand_negative.get(brand, 0.0)
    if net > 1e-9:
      brand_affinity[brand] = round(net, 4)
    elif net < -1e-9:
      brand_avoid[brand] = round(-net, 4)

  price_band = None
  if engaged_prices:
    ordered = sorted(engaged_prices)
    price_band = {
      "p25Krw": int(round(_percentile(ordered, 0.25))),
      "p75Krw": int(round(_percentile(ordered, 0.75))),
    }

  if not attr_affinity and not attr_avoid and not brand_affinity and not brand_avoid and price_band is None:
    return None

  sessions = {event["sessionId"] for event in deduped}
  days = {event["occurredAt"].date() for event in deduped}
  return {
    "attrAffinity": attr_affinity,
    "attrAvoid": attr_avoid,
    "brandAffinity": brand_affinity,
    "brandAvoid": brand_avoid,
    "priceBand": price_band,
    "actionableEventCount": len(deduped),
    "sessionCount": len(sessions),
    "dayCount": len(days),
    "updatedAt": now.isoformat(),
  }


def profile_raw_score(
  item: dict[str, Any],
  profile: dict[str, Any] | None,
  *,
  explicit_attributes: frozenset[str] | set[str] = frozenset(),
) -> float:
  """item × profile → raw profileScore(최종점수 단위, clip 전).

  명시 세션 선호가 이미 다루는 attribute는 ``explicit_attributes``로 억제된다
  (프롬프트>리포트>프로필). 가격 억제 키는 "priceKrw", 브랜드 억제 키는 "brandName".
  """
  if not isinstance(profile, dict) or not isinstance(item, dict):
    return 0.0
  attrs = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
  attr_affinity = profile.get("attrAffinity") if isinstance(profile.get("attrAffinity"), dict) else {}
  attr_avoid = profile.get("attrAvoid") if isinstance(profile.get("attrAvoid"), dict) else {}
  signal = 0.0

  for attribute in _PROFILE_ATTRIBUTES:
    if attribute in explicit_attributes:
      continue
    value = str(attrs.get(attribute) or "").strip()
    if not value:
      continue  # 속성 미상 = 0 (unknown ≠ negative)
    affinity = attr_affinity.get(attribute) if isinstance(attr_affinity.get(attribute), dict) else {}
    avoid = attr_avoid.get(attribute) if isinstance(attr_avoid.get(attribute), dict) else {}
    total = sum(affinity.values()) + sum(avoid.values())
    if total <= 0.0:
      continue
    if value in affinity:
      signal += affinity[value] / total
    elif value in avoid:
      signal -= avoid[value] / total

  if "brandName" not in explicit_attributes:
    brand = _normalized_brand(item.get("brandName"))
    brand_affinity = profile.get("brandAffinity") if isinstance(profile.get("brandAffinity"), dict) else {}
    brand_avoid = profile.get("brandAvoid") if isinstance(profile.get("brandAvoid"), dict) else {}
    total = sum(brand_affinity.values()) + sum(brand_avoid.values())
    if brand and total > 0.0:
      if brand in brand_affinity:
        signal += brand_affinity[brand] / total
      elif brand in brand_avoid:
        signal -= brand_avoid[brand] / total

  if "priceKrw" not in explicit_attributes:
    band = profile.get("priceBand") if isinstance(profile.get("priceBand"), dict) else None
    price = float((item.get("liveOffer") or {}).get("priceKrw") or 0)
    if band and price > 0:
      lower = float(band.get("p25Krw") or 0)
      upper = float(band.get("p75Krw") or 0)
      if lower <= price <= upper:
        signal += 0.5  # 익숙한 가격대 보너스 — 밖이라고 감점하지는 않는다

  return PROFILE_SIGNAL_UNIT * signal


# ------------------------------------------------------------------ serving 측 로딩 (jsonl — 테이블은 비범위)

_PROFILE_CACHE: dict[str, tuple[float, dict[str, dict[str, Any]]]] = {}


def load_taste_profiles(path: str) -> dict[str, dict[str, Any]]:
  """배치 산출 jsonl({"ownerSubject":..., "profile": {...}}) → owner→profile 맵. mtime 캐시."""
  try:
    mtime = os.path.getmtime(path)
  except OSError:
    return {}
  cached = _PROFILE_CACHE.get(path)
  if cached is not None and cached[0] == mtime:
    return cached[1]
  profiles: dict[str, dict[str, Any]] = {}
  try:
    with open(path, encoding="utf-8") as handle:
      for line in handle:
        line = line.strip()
        if not line:
          continue
        try:
          row = json.loads(line)
        except json.JSONDecodeError:
          continue
        owner = str(row.get("ownerSubject") or row.get("owner_subject") or "").strip()
        profile = row.get("profile")
        if owner and isinstance(profile, dict):
          profiles[owner] = profile
  except OSError:
    logger.warning("[aura:auradin-profile] taste profile file unreadable (fail-open): %s", path)
    return {}
  _PROFILE_CACHE[path] = (mtime, profiles)
  return profiles


def reset_profile_cache() -> None:
  """테스트 격리용."""
  _PROFILE_CACHE.clear()


def get_taste_profile(
  owner_subject: str,
  *,
  settings: Settings | None = None,
) -> dict[str, Any] | None:
  """settings.auradin_taste_profiles_path에서 owner 프로필 조회 — 미설정/부재는 None(fail-open)."""
  settings = settings or get_settings()
  path = str(getattr(settings, "auradin_taste_profiles_path", "") or "").strip()
  owner = str(owner_subject or "").strip()
  if not path or not owner:
    return None
  return load_taste_profiles(path).get(owner)
