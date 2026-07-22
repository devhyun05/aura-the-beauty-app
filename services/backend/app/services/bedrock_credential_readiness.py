import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from time import monotonic
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import UnauthorizedSSOTokenError

from app.core.settings import Settings


logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class BedrockCredentialReadiness:
  status: str
  credential_source: str | None = None
  reason: str | None = None
  valid_for_seconds: float | None = None
  credential_sources: tuple[str, ...] = ()
  failed_credential_source: str | None = None

  @property
  def ready(self) -> bool:
    return self.status == "ready"

  def public_status(self) -> dict[str, object]:
    if self.ready:
      status: dict[str, object] = {
        "status": "ready",
        "credential_source": self.credential_source or "provider_chain",
      }
      if len(self.credential_sources) > 1:
        status["credential_sources"] = list(self.credential_sources)
      return status

    status: dict[str, object] = {
      "status": "not_ready",
      "reason": self.reason or "credential_resolution_failed",
    }
    if self.failed_credential_source and len(self.credential_sources) > 1:
      status["failed_credential_source"] = self.failed_credential_source
    if len(self.credential_sources) > 1:
      status["credential_sources"] = list(self.credential_sources)
    return status


def _credential_source(settings: Settings) -> str:
  if settings.aws_profile_name:
    return "profile"
  if settings.aws_use_iam_role:
    return "iam_role"
  if settings.aws_access_key_id and settings.aws_secret_access_key:
    return "static"
  return "provider_chain"


def _provider_chain_source(settings: Settings) -> str:
  return "iam_role" if settings.aws_use_iam_role else "provider_chain"


def _generation_credential_sources(settings: Settings) -> tuple[str, ...]:
  """Return each credential path used by the current generation services.

  Makeup recommendation explicitly uses ``AWS_PROFILE_NAME`` when configured,
  otherwise boto3's provider chain. Face analysis, feedback, and reference
  extraction pass configured static keys directly and otherwise use the
  provider chain. Readiness must therefore validate both paths when a local
  setup configures a profile and static keys together.
  """

  recommendation_source = (
    "profile" if settings.aws_profile_name else _provider_chain_source(settings)
  )
  analysis_source = (
    "static"
    if settings.aws_access_key_id and settings.aws_secret_access_key
    else _provider_chain_source(settings)
  )
  return tuple(dict.fromkeys((recommendation_source, analysis_source)))


def _build_boto3_session(settings: Settings, credential_source: str | None = None):
  common: dict[str, str] = {"region_name": settings.effective_bedrock_analysis_region}
  source = credential_source or _credential_source(settings)
  if source == "profile":
    return boto3.Session(profile_name=settings.aws_profile_name, **common)
  if source == "static":
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


def _validate_static_identity(session: Any) -> None:
  """Validate configured long-lived keys without invoking a billed model."""

  identity = session.client(
    "sts",
    config=Config(
      connect_timeout=2,
      read_timeout=2,
      retries={"max_attempts": 0},
    ),
  ).get_caller_identity()
  if not identity.get("Account") or not identity.get("Arn"):
    raise ValueError("AWS identity response is incomplete")


def _resolve_credentials(settings: Settings) -> BedrockCredentialReadiness:
  credential_sources = _generation_credential_sources(settings)
  valid_for_seconds: list[float] = []

  for credential_source in credential_sources:
    try:
      session = _build_boto3_session(settings, credential_source)
      credentials = session.get_credentials()
      if credentials is None:
        return BedrockCredentialReadiness(
          status="not_ready",
          reason="credentials_unavailable",
          credential_sources=credential_sources,
          failed_credential_source=credential_source,
        )

      # Triggers deferred/profile/container/instance-role providers without making
      # a Bedrock API or model invocation. The original object retains expiry data.
      frozen = credentials.get_frozen_credentials()
      if not frozen.access_key or not frozen.secret_key:
        return BedrockCredentialReadiness(
          status="not_ready",
          reason="credentials_unavailable",
          credential_sources=credential_sources,
          failed_credential_source=credential_source,
        )

      now = datetime.now(timezone.utc)
      expiry = _normalize_expiry(credentials)
      if expiry is not None and expiry <= now:
        return BedrockCredentialReadiness(
          status="not_ready",
          reason="credentials_expired",
          credential_sources=credential_sources,
          failed_credential_source=credential_source,
        )
      if credential_source == "static":
        _validate_static_identity(session)
      if expiry is not None:
        valid_for_seconds.append((expiry - now).total_seconds())
    except Exception as exc:  # noqa: BLE001 - provider failures are normalized and never exposed
      logger.warning(
        "[aura:bedrock-readiness] credential resolution failed source=%s type=%s",
        credential_source,
        exc.__class__.__name__,
      )
      return BedrockCredentialReadiness(
        status="not_ready",
        reason=(
          "credentials_expired"
          if isinstance(exc, UnauthorizedSSOTokenError)
          else "credentials_invalid"
          if credential_source == "static"
          else "credential_resolution_failed"
        ),
        credential_sources=credential_sources,
        failed_credential_source=credential_source,
      )

  return BedrockCredentialReadiness(
    status="ready",
    credential_source=_credential_source(settings),
    valid_for_seconds=min(valid_for_seconds) if valid_for_seconds else None,
    credential_sources=credential_sources,
  )


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
