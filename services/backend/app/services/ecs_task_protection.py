import asyncio
import os
from typing import Any

import httpx


DEFAULT_PROTECTION_EXPIRY_MINUTES = 30
DEFAULT_REQUEST_TIMEOUT_SECONDS = 2.0
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_RETRY_DELAY_SECONDS = 0.2


class ECSTaskProtectionError(RuntimeError):
  pass


class ECSTaskScaleInProtector:
  def __init__(
    self,
    *,
    agent_uri: str | None = None,
    ecs_runtime: bool | None = None,
    expiry_minutes: int = DEFAULT_PROTECTION_EXPIRY_MINUTES,
    request_timeout_seconds: float = DEFAULT_REQUEST_TIMEOUT_SECONDS,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    retry_delay_seconds: float = DEFAULT_RETRY_DELAY_SECONDS,
    client: httpx.AsyncClient | None = None,
  ) -> None:
    resolved_agent_uri = (
      os.getenv("ECS_AGENT_URI", "")
      if agent_uri is None
      else agent_uri
    )
    resolved_ecs_runtime = (
      bool(os.getenv("ECS_CONTAINER_METADATA_URI_V4", "").strip())
      or os.getenv("AWS_EXECUTION_ENV", "").strip()
      in {"AWS_ECS_FARGATE", "AWS_ECS_EC2"}
      if ecs_runtime is None
      else ecs_runtime
    )
    if resolved_ecs_runtime and not resolved_agent_uri.strip():
      raise ECSTaskProtectionError(
        "ECS_AGENT_URI is required for task scale-in protection in ECS.",
      )
    self.endpoint = (
      f"{resolved_agent_uri.strip().rstrip('/')}/task-protection/v1/state"
      if resolved_agent_uri.strip()
      else ""
    )
    self.expiry_minutes = expiry_minutes
    self.request_timeout_seconds = request_timeout_seconds
    self.max_attempts = max_attempts
    self.retry_delay_seconds = retry_delay_seconds
    self.client = client

    if not 1 <= self.expiry_minutes <= 2_880:
      raise ValueError("expiry_minutes must be between 1 and 2880.")
    if self.request_timeout_seconds <= 0:
      raise ValueError("request_timeout_seconds must be greater than zero.")
    if self.max_attempts < 1:
      raise ValueError("max_attempts must be at least one.")
    if self.retry_delay_seconds < 0:
      raise ValueError("retry_delay_seconds must not be negative.")

  async def enable(self) -> bool:
    if not self.endpoint:
      return False
    await self._set_protection(True)
    return True

  async def disable(self) -> None:
    if not self.endpoint:
      return
    await self._set_protection(False)

  async def _set_protection(self, protection_enabled: bool) -> None:
    body: dict[str, Any] = {"ProtectionEnabled": protection_enabled}
    if protection_enabled:
      body["ExpiresInMinutes"] = self.expiry_minutes

    response = await self._put_with_retry(body)
    try:
      payload = response.json()
    except ValueError as exc:
      raise ECSTaskProtectionError(
        "ECS task protection agent returned invalid JSON.",
      ) from exc

    if not isinstance(payload, dict) or "error" in payload or "failure" in payload:
      raise ECSTaskProtectionError(
        "ECS task protection agent returned a failure payload.",
      )

    protection = payload.get("protection")
    if (
      not isinstance(protection, dict)
      or protection.get("ProtectionEnabled") is not protection_enabled
    ):
      raise ECSTaskProtectionError(
        "ECS task protection agent did not confirm the requested state.",
      )

  async def _put_with_retry(self, body: dict[str, Any]) -> httpx.Response:
    last_error: Exception | None = None

    for attempt in range(1, self.max_attempts + 1):
      try:
        response = await self._put(body)
      except httpx.TransportError as exc:
        last_error = exc
      else:
        if response.status_code == 200:
          return response
        last_error = ECSTaskProtectionError(
          f"ECS task protection agent returned HTTP {response.status_code}.",
        )
        if response.status_code != 429 and response.status_code < 500:
          raise last_error

      if attempt < self.max_attempts:
        await asyncio.sleep(self.retry_delay_seconds * attempt)

    raise ECSTaskProtectionError(
      "ECS task protection agent request failed after retries.",
    ) from last_error

  async def _put(self, body: dict[str, Any]) -> httpx.Response:
    if self.client is not None:
      return await self.client.put(self.endpoint, json=body)

    timeout = httpx.Timeout(self.request_timeout_seconds)
    async with httpx.AsyncClient(
      timeout=timeout,
      trust_env=False,
      follow_redirects=False,
    ) as client:
      return await client.put(self.endpoint, json=body)
