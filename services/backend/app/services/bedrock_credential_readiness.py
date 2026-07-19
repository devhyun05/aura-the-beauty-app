import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from time import monotonic
from typing import Any

import boto3

from app.core.settings import Settings


logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class BedrockCredentialReadiness:
  status: str
  credential_source: str | None = None
  reason: str | None = None
  valid_for_seconds: float | None = None

  @property
  def ready(self) -> bool:
    return self.status == "ready"

  def public_status(self) -> dict[str, str]:
    if self.ready:
      return {
        "status": "ready",
        "credential_source": self.credential_source or "provider_chain",
      }

    return {
      "status": "not_ready",
      "reason": self.reason or "credential_resolution_failed",
    }


def _credential_source(settings: Settings) -> str:
  if settings.aws_profile_name:
    return "profile"
  if settings.aws_use_iam_role:
    return "iam_role"
  if settings.aws_access_key_id and settings.aws_secret_access_key:
    return "static"
  return "provider_chain"


def _build_boto3_session(settings: Settings):
  common: dict[str, str] = {"region_name": settings.effective_bedrock_analysis_region}
  if settings.aws_profile_name:
    return boto3.Session(profile_name=settings.aws_profile_name, **common)
  if settings.aws_use_iam_role:
    return boto3.Session(**common)
  if settings.aws_access_key_id and settings.aws_secret_access_key:
    return boto3.Session(
      aws_access_key_id=settings.aws_access_key_id,
      aws_secret_access_key=settings.aws_secret_access_key,
      **common,
    )
  return boto3.Session(**common)


def _normalize_expiry(credentials: Any) -> datetime | None:
  expiry = getattr(credentials, "_expiry_time", None)
  if expiry is None:
    return None
  if not isinstance(expiry, datetime):
    raise ValueError("credential expiry is not a datetime")
  if expiry.tzinfo is None:
    expiry = expiry.replace(tzinfo=timezone.utc)
  return expiry.astimezone(timezone.utc)


def _resolve_credentials(settings: Settings) -> BedrockCredentialReadiness:
  try:
    credentials = _build_boto3_session(settings).get_credentials()
    if credentials is None:
      return BedrockCredentialReadiness(status="not_ready", reason="credentials_unavailable")

    # Triggers deferred/profile/container/instance-role providers without making
    # a Bedrock API or model invocation. The original object retains expiry data.
    frozen = credentials.get_frozen_credentials()
    if not frozen.access_key or not frozen.secret_key:
      return BedrockCredentialReadiness(status="not_ready", reason="credentials_unavailable")

    now = datetime.now(timezone.utc)
    expiry = _normalize_expiry(credentials)
    if expiry is not None and expiry <= now:
      return BedrockCredentialReadiness(status="not_ready", reason="credentials_expired")

    return BedrockCredentialReadiness(
      status="ready",
      credential_source=_credential_source(settings),
      valid_for_seconds=(expiry - now).total_seconds() if expiry is not None else None,
    )
  except Exception as exc:  # noqa: BLE001 - provider failures are normalized and never exposed
    logger.warning(
      "[aura:bedrock-readiness] credential resolution failed type=%s",
      exc.__class__.__name__,
    )
    return BedrockCredentialReadiness(status="not_ready", reason="credential_resolution_failed")


class BedrockCredentialReadinessProbe:
  def __init__(
    self,
    *,
    timeout_seconds: float = 5.0,
    success_cache_seconds: float = 30.0,
    failure_cache_seconds: float = 5.0,
  ) -> None:
    self.timeout_seconds = timeout_seconds
    self.success_cache_seconds = success_cache_seconds
    self.failure_cache_seconds = failure_cache_seconds
    self._cache: tuple[float, BedrockCredentialReadiness] | None = None
    self._lock = asyncio.Lock()

  async def check(self, settings: Settings) -> BedrockCredentialReadiness:
    cached = self._cached_result()
    if cached is not None:
      return cached

    async with self._lock:
      cached = self._cached_result()
      if cached is not None:
        return cached

      try:
        result = await asyncio.wait_for(
          asyncio.to_thread(_resolve_credentials, settings),
          timeout=self.timeout_seconds,
        )
      except TimeoutError:
        result = BedrockCredentialReadiness(
          status="not_ready",
          reason="credential_resolution_timeout",
        )

      cache_seconds = self.failure_cache_seconds
      if result.ready:
        cache_seconds = self.success_cache_seconds
        if result.valid_for_seconds is not None:
          cache_seconds = min(cache_seconds, max(0.0, result.valid_for_seconds - 1.0))

      self._cache = (monotonic() + cache_seconds, result)
      return result

  def _cached_result(self) -> BedrockCredentialReadiness | None:
    if self._cache is None:
      return None
    expires_at, result = self._cache
    if monotonic() >= expires_at:
      self._cache = None
      return None
    return result
