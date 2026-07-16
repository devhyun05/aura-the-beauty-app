"""KMA regional weather snapshots for scheduled product re-ranking.

Only coarse Korean province codes are accepted.  The adapter never accepts or
stores device latitude/longitude and is not imported by mobile API handlers.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
import re
from typing import Any, Awaitable, Callable
from zoneinfo import ZoneInfo

import httpx

from app.core.settings import Settings
from app.services.product_catalog import validate_external_https_url
from app.services.product_trend_quota import TrendCallQuotaLedger
from app.services.product_trend_regions import (
  KMA_REGION_GRIDS,
  LOCAL_TREND_REGION_CODES,
  NATIONAL_REGION_CODE,
  TREND_REGION_LABELS,
)


KST = ZoneInfo("Asia/Seoul")
logger = logging.getLogger(__name__)
KMA_HOSTS = ("apis.data.go.kr",)
KMA_BASE_HOURS = (2, 5, 8, 11, 14, 17, 20, 23)
# Representative KMA grid cells for the 17 first-level administrative regions.
# These are coarse server-side region constants, never device coordinates.
@dataclass(frozen=True)
class WeatherRegionSnapshot:
  region_code: str
  region_label: str
  forecast_at: datetime
  source_updated_at: datetime
  temperature_c: float | None
  humidity_percent: float | None
  precipitation_probability: float | None
  precipitation_mm: float | None
  wind_speed_mps: float | None
  weather_code: str | None = None
  source_name: str = "KMA Short-term Forecast"

  def is_stale(self, *, now: datetime, max_age: timedelta = timedelta(hours=4)) -> bool:
    return self.source_updated_at < now - max_age

  @property
  def summary(self) -> str:
    values = []
    if self.temperature_c is not None:
      values.append(f"기온 {self.temperature_c:g}°C")
    if self.humidity_percent is not None:
      values.append(f"습도 {self.humidity_percent:g}%")
    if self.precipitation_probability is not None:
      values.append(f"강수확률 {self.precipitation_probability:g}%")
    if self.wind_speed_mps is not None:
      values.append(f"풍속 {self.wind_speed_mps:g}m/s")
    return " · ".join(values) or "기상청 예보 갱신 대기 중"


KmaRequester = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]


def latest_kma_base_time(now: datetime) -> tuple[str, str, datetime]:
  local_now = (now if now.tzinfo else now.replace(tzinfo=timezone.utc)).astimezone(KST)
  available_at = local_now - timedelta(minutes=10)
  candidates = [hour for hour in KMA_BASE_HOURS if hour <= available_at.hour]
  if candidates:
    base = available_at.replace(hour=max(candidates), minute=0, second=0, microsecond=0)
  else:
    previous_day = available_at - timedelta(days=1)
    base = previous_day.replace(hour=KMA_BASE_HOURS[-1], minute=0, second=0, microsecond=0)
  return base.strftime("%Y%m%d"), base.strftime("%H%M"), base.astimezone(timezone.utc)


def _forecast_datetime(item: dict[str, Any]) -> datetime | None:
  raw_date = str(item.get("fcstDate") or "")
  raw_time = str(item.get("fcstTime") or "").zfill(4)
  try:
    return datetime.strptime(raw_date + raw_time, "%Y%m%d%H%M").replace(tzinfo=KST).astimezone(timezone.utc)
  except ValueError:
    return None


def _number(value: Any) -> float | None:
  try:
    return float(str(value).strip())
  except (TypeError, ValueError):
    return None


def _precipitation_mm(value: Any) -> float | None:
  raw = str(value or "").strip()
  if not raw or raw in {"강수없음", "없음"}:
    return 0.0
  match = re.search(r"\d+(?:\.\d+)?", raw.replace(",", ""))
  return float(match.group(0)) if match else None


def normalize_kma_forecast(
  region_code: str,
  payload: dict[str, Any],
  *,
  now: datetime,
  source_updated_at: datetime,
) -> WeatherRegionSnapshot | None:
  region = KMA_REGION_GRIDS.get(region_code)
  if region is None:
    return None
  response = payload.get("response") if isinstance(payload.get("response"), dict) else {}
  header = response.get("header") if isinstance(response.get("header"), dict) else {}
  if str(header.get("resultCode") or "") not in {"0", "00"}:
    return None
  body = response.get("body") if isinstance(response.get("body"), dict) else {}
  items_container = body.get("items") if isinstance(body.get("items"), dict) else {}
  items = items_container.get("item")
  if not isinstance(items, list):
    return None

  by_forecast: dict[datetime, dict[str, Any]] = {}
  for item in items:
    if not isinstance(item, dict):
      continue
    forecast_at = _forecast_datetime(item)
    category = str(item.get("category") or "").strip()
    if forecast_at is None or category not in {"TMP", "REH", "POP", "PCP", "WSD", "PTY", "SKY"}:
      continue
    by_forecast.setdefault(forecast_at, {})[category] = item.get("fcstValue")
  if not by_forecast:
    return None
  current = now if now.tzinfo else now.replace(tzinfo=timezone.utc)
  future = [value for value in by_forecast if value >= current]
  forecast_at = min(future) if future else max(by_forecast)
  values = by_forecast[forecast_at]
  precipitation_type = str(values.get("PTY") or "0").strip()
  sky_state = str(values.get("SKY") or "").strip()
  weather_code = {
    "1": "rain",
    "2": "rain_snow",
    "3": "snow",
    "4": "shower",
  }.get(precipitation_type)
  if weather_code is None:
    weather_code = {"1": "clear", "3": "cloudy", "4": "overcast"}.get(sky_state)
  return WeatherRegionSnapshot(
    region_code=region_code,
    region_label=TREND_REGION_LABELS[region_code],
    forecast_at=forecast_at,
    source_updated_at=source_updated_at,
    temperature_c=_number(values.get("TMP")),
    humidity_percent=_number(values.get("REH")),
    precipitation_probability=_number(values.get("POP")),
    precipitation_mm=_precipitation_mm(values.get("PCP")),
    wind_speed_mps=_number(values.get("WSD")),
    weather_code=weather_code,
  )


def aggregate_national_weather(
  snapshots: list[WeatherRegionSnapshot],
  *,
  now: datetime,
) -> WeatherRegionSnapshot | None:
  fresh = [snapshot for snapshot in snapshots if not snapshot.is_stale(now=now)]
  if not fresh:
    return None

  def average(attribute: str) -> float | None:
    values = [getattr(snapshot, attribute) for snapshot in fresh if getattr(snapshot, attribute) is not None]
    return round(sum(values) / len(values), 2) if values else None

  weather_priority = {"shower": 6, "rain_snow": 5, "snow": 4, "rain": 3, "overcast": 2, "cloudy": 1, "clear": 0}
  national_weather_code = max(
    (snapshot.weather_code for snapshot in fresh if snapshot.weather_code),
    key=lambda value: weather_priority.get(value, -1),
    default=None,
  )

  return WeatherRegionSnapshot(
    region_code=NATIONAL_REGION_CODE,
    region_label=TREND_REGION_LABELS[NATIONAL_REGION_CODE],
    forecast_at=max(snapshot.forecast_at for snapshot in fresh),
    source_updated_at=min(snapshot.source_updated_at for snapshot in fresh),
    temperature_c=average("temperature_c"),
    humidity_percent=average("humidity_percent"),
    precipitation_probability=average("precipitation_probability"),
    precipitation_mm=average("precipitation_mm"),
    wind_speed_mps=average("wind_speed_mps"),
    weather_code=national_weather_code,
  )


class KmaWeatherProvider:
  def __init__(
    self,
    settings: Settings,
    *,
    quota_ledger: TrendCallQuotaLedger | None,
    requester: KmaRequester | None = None,
  ) -> None:
    self.settings = settings
    self.quota_ledger = quota_ledger
    self._requester = requester or self._request_json

  def _endpoint(self) -> str:
    return validate_external_https_url(
      str(self.settings.kma_weather_endpoint),
      KMA_HOSTS,
      kind="KMA short-term forecast",
    )

  async def _request_json(self, endpoint: str, params: dict[str, Any]) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(2):
      try:
        async with httpx.AsyncClient(timeout=self.settings.kma_weather_http_timeout_seconds) as client:
          response = await client.get(endpoint, params=params)
          response.raise_for_status()
          result = response.json()
          return result if isinstance(result, dict) else {}
      except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as error:
        last_error = error
        status = error.response.status_code if isinstance(error, httpx.HTTPStatusError) else None
        if attempt == 1 or status not in {429, 500, 502, 503, 504, None}:
          raise
        await asyncio.sleep(0.2)
    raise RuntimeError("KMA retry loop exited unexpectedly") from last_error

  async def collect_regions(
    self,
    *,
    now: datetime,
    region_codes: tuple[str, ...] = LOCAL_TREND_REGION_CODES,
  ) -> list[WeatherRegionSnapshot]:
    if (
      not self.settings.kma_weather_enabled
      or not self.settings.kma_weather_endpoint
      or not self.settings.kma_weather_service_key
      or self.quota_ledger is None
    ):
      return []
    endpoint = self._endpoint()
    base_date, base_time, source_updated_at = latest_kma_base_time(now)
    snapshots: list[WeatherRegionSnapshot] = []
    for region_code in tuple(dict.fromkeys(region_codes)):
      region = KMA_REGION_GRIDS.get(region_code)
      if region is None:
        continue
      try:
        allowed = await self.quota_ledger.reserve(
          "kma",
          at=now,
          monthly_limit=self.settings.kma_weather_monthly_call_limit,
          amount=2,
        )
      except Exception:  # noqa: BLE001 - no quota proof means no external call.
        logger.warning("KMA quota reservation failed; ending collection", exc_info=True)
        break
      if not allowed:
        break
      try:
        payload = await self._requester(endpoint, {
          "serviceKey": self.settings.kma_weather_service_key,
          "pageNo": 1,
          "numOfRows": 1000,
          "dataType": "JSON",
          "base_date": base_date,
          "base_time": base_time,
          "nx": region[0],
          "ny": region[1],
        })
      except (httpx.HTTPError, ValueError):
        logger.warning("KMA region=%s failed after retry; continuing", region_code, exc_info=True)
        continue
      snapshot = normalize_kma_forecast(
        region_code,
        payload,
        now=now,
        source_updated_at=source_updated_at,
      )
      if snapshot is not None:
        snapshots.append(snapshot)
    national = aggregate_national_weather(snapshots, now=now)
    return [*snapshots, national] if national is not None else snapshots
