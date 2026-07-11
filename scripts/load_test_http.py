from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import time
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import httpx


@dataclass(frozen=True)
class LoadTestResult:
  url: str
  total_requests: int
  concurrency: int
  successes: int
  failures: int
  error_rate: float
  duration_seconds: float
  requests_per_second: float
  latency_ms_avg: float
  latency_ms_p50: float
  latency_ms_p95: float
  latency_ms_p99: float
  latency_ms_max: float
  status_counts: dict[str, int]
  error_counts: dict[str, int]


def percentile(values: list[float], quantile: float) -> float:
  if not values:
    return 0.0
  ordered = sorted(values)
  index = max(0, math.ceil(quantile * len(ordered)) - 1)
  return ordered[index]


async def run_load_test(
  *,
  url: str,
  total_requests: int,
  concurrency: int,
  timeout_seconds: float,
  headers: dict[str, str] | None = None,
) -> LoadTestResult:
  queue: asyncio.Queue[int] = asyncio.Queue()
  for request_id in range(total_requests):
    queue.put_nowait(request_id)

  latencies_ms: list[float] = []
  status_counts: Counter[str] = Counter()
  error_counts: Counter[str] = Counter()

  limits = httpx.Limits(
    max_connections=concurrency,
    max_keepalive_connections=concurrency,
  )
  timeout = httpx.Timeout(timeout_seconds)

  async with httpx.AsyncClient(headers=headers, limits=limits, timeout=timeout) as client:

    async def worker() -> None:
      while not queue.empty():
        try:
          queue.get_nowait()
        except asyncio.QueueEmpty:
          return

        started_at = time.perf_counter()
        try:
          response = await client.get(url)
          status_counts[str(response.status_code)] += 1
        except Exception as error:
          error_counts[error.__class__.__name__] += 1
        finally:
          latencies_ms.append((time.perf_counter() - started_at) * 1000)
          queue.task_done()

    started_at = time.perf_counter()
    await asyncio.gather(*(worker() for _ in range(concurrency)))
    duration_seconds = time.perf_counter() - started_at

  successes = sum(
    count for status, count in status_counts.items() if 200 <= int(status) < 400
  )
  failures = total_requests - successes
  average = sum(latencies_ms) / len(latencies_ms) if latencies_ms else 0.0

  return LoadTestResult(
    url=url,
    total_requests=total_requests,
    concurrency=concurrency,
    successes=successes,
    failures=failures,
    error_rate=failures / total_requests if total_requests else 0.0,
    duration_seconds=duration_seconds,
    requests_per_second=total_requests / duration_seconds if duration_seconds else 0.0,
    latency_ms_avg=average,
    latency_ms_p50=percentile(latencies_ms, 0.50),
    latency_ms_p95=percentile(latencies_ms, 0.95),
    latency_ms_p99=percentile(latencies_ms, 0.99),
    latency_ms_max=max(latencies_ms, default=0.0),
    status_counts=dict(sorted(status_counts.items())),
    error_counts=dict(sorted(error_counts.items())),
  )


def rounded_result(result: LoadTestResult) -> dict[str, Any]:
  payload = asdict(result)
  for key, value in payload.items():
    if isinstance(value, float):
      payload[key] = round(value, 3)
  return payload


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Run a bounded asynchronous HTTP GET load test.")
  parser.add_argument("--url", required=True)
  parser.add_argument("--requests", type=int, required=True, dest="total_requests")
  parser.add_argument("--concurrency", type=int, required=True)
  parser.add_argument("--timeout-seconds", type=float, default=10.0)
  parser.add_argument(
    "--bearer-token-env",
    help="Read a bearer token from this environment variable without printing it.",
  )
  parser.add_argument("--output", type=Path)
  args = parser.parse_args()

  if args.total_requests < 1:
    parser.error("--requests must be at least 1")
  if args.concurrency < 1:
    parser.error("--concurrency must be at least 1")
  if args.concurrency > args.total_requests:
    parser.error("--concurrency cannot exceed --requests")
  if args.timeout_seconds <= 0:
    parser.error("--timeout-seconds must be greater than 0")
  return args


async def async_main(args: argparse.Namespace) -> int:
  headers = None
  if args.bearer_token_env:
    token = os.environ.get(args.bearer_token_env, "").strip()
    if not token:
      raise SystemExit(f"Environment variable {args.bearer_token_env} is empty.")
    headers = {"Authorization": f"Bearer {token}"}

  result = await run_load_test(
    url=args.url,
    total_requests=args.total_requests,
    concurrency=args.concurrency,
    timeout_seconds=args.timeout_seconds,
    headers=headers,
  )
  payload = rounded_result(result)
  rendered = json.dumps(payload, ensure_ascii=True, indent=2)
  print(rendered)

  if args.output:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(rendered + "\n", encoding="utf-8")
  return 0 if result.failures == 0 else 1


def main() -> None:
  raise SystemExit(asyncio.run(async_main(parse_args())))


if __name__ == "__main__":
  main()
