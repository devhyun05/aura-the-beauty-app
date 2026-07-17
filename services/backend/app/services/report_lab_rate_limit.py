from __future__ import annotations

import asyncio
from collections import deque
import time
from typing import Callable

from app.core.errors import AppError


class ReportLabLoopbackRateLimiter:
  """Small in-process sliding-window guard for the two loopback addresses.

  Report Lab has no remote callers or proxy trust. Keeping at most the IPv4 and
  IPv6 loopback buckets makes the limiter memory-bounded as well as rate-bounded.
  The database-backed 50-run session budget remains the durable primary limit.
  """

  def __init__(
    self,
    *,
    max_requests: int = 30,
    window_seconds: float = 60,
    clock: Callable[[], float] = time.monotonic,
  ) -> None:
    if max_requests < 1 or window_seconds <= 0:
      raise ValueError("Report Lab rate-limit bounds must be positive.")
    self._max_requests = max_requests
    self._window_seconds = window_seconds
    self._clock = clock
    self._events: dict[str, deque[float]] = {}
    self._lock = asyncio.Lock()

  async def check(self, peer: str) -> None:
    if peer not in {"127.0.0.1", "::1"}:
      raise AppError(403, "REPORT_LAB_LOOPBACK_REQUIRED", "Report Lab accepts loopback requests only.")
    now = self._clock()
    cutoff = now - self._window_seconds
    async with self._lock:
      events = self._events.setdefault(peer, deque())
      while events and events[0] <= cutoff:
        events.popleft()
      if len(events) >= self._max_requests:
        raise AppError(
          429,
          "REPORT_LAB_RATE_LIMITED",
          "The local Report Lab request rate limit was exceeded.",
          {"maxRequests": self._max_requests, "windowSeconds": self._window_seconds},
        )
      events.append(now)
