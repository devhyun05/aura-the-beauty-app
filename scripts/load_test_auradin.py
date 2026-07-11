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


DEFAULT_PROMPT = "쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하"


@dataclass(frozen=True)
class RequestSample:
  name: str
  latency_ms: float
  status_code: int | None
  error: str | None = None


@dataclass(frozen=True)
class JourneyResult:
  session_id: str | None
  phase: str
  answered_questions: int
  duration_ms: float
  samples: tuple[RequestSample, ...]
  error: str | None = None


def percentile(values: list[float], quantile: float) -> float:
  if not values:
    return 0.0
  ordered = sorted(values)
  index = max(0, math.ceil(quantile * len(ordered)) - 1)
  return ordered[index]


def _round(value: float) -> float:
  return round(value, 3)


def summarize_samples(samples: list[RequestSample]) -> dict[str, Any]:
  latencies = [sample.latency_ms for sample in samples]
  status_counts = Counter(
    str(sample.status_code) if sample.status_code is not None else "error"
    for sample in samples
  )
  error_counts = Counter(sample.error for sample in samples if sample.error)
  successes = sum(
    1
    for sample in samples
    if sample.status_code is not None and 200 <= sample.status_code < 400
  )
  return {
    "requests": len(samples),
    "successes": successes,
    "failures": len(samples) - successes,
    "latencyMsAvg": _round(sum(latencies) / len(latencies)) if latencies else 0.0,
    "latencyMsP50": _round(percentile(latencies, 0.50)),
    "latencyMsP95": _round(percentile(latencies, 0.95)),
    "latencyMsP99": _round(percentile(latencies, 0.99)),
    "latencyMsMax": _round(max(latencies, default=0.0)),
    "statusCounts": dict(sorted(status_counts.items())),
    "errorCounts": dict(sorted(error_counts.items())),
  }


def choose_answer_option(question: dict[str, Any]) -> dict[str, Any] | None:
  options = question.get("options")
  if not isinstance(options, list):
    return None
  return next(
    (
      option
      for option in options
      if isinstance(option, dict)
      and isinstance(option.get("filterDelta"), dict)
      and option["filterDelta"].get("op") != "noop"
    ),
    next((option for option in options if isinstance(option, dict)), None),
  )


async def timed_json_request(
  client: httpx.AsyncClient,
  *,
  name: str,
  method: str,
  path: str,
  body: dict[str, Any] | None = None,
) -> tuple[dict[str, Any] | None, RequestSample]:
  started_at = time.perf_counter()
  try:
    response = await client.request(method, path, json=body)
    latency_ms = (time.perf_counter() - started_at) * 1000
    try:
      payload = response.json()
    except ValueError:
      payload = None
    data = payload.get("data") if isinstance(payload, dict) else None
    error = None if 200 <= response.status_code < 400 else f"HTTP_{response.status_code}"
    return (
      data if isinstance(data, dict) else None,
      RequestSample(name, latency_ms, response.status_code, error),
    )
  except Exception as error:  # noqa: BLE001 - 부하 결과에 오류 종류를 집계한다.
    latency_ms = (time.perf_counter() - started_at) * 1000
    return None, RequestSample(name, latency_ms, None, error.__class__.__name__)


async def run_auradin_journey(
  client: httpx.AsyncClient,
  *,
  prompt: str,
  max_answers: int,
) -> JourneyResult:
  started_at = time.perf_counter()
  samples: list[RequestSample] = []
  session_id: str | None = None
  phase = "not_started"
  answered_questions = 0
  journey_error: str | None = None

  try:
    created, sample = await timed_json_request(
      client,
      name="create",
      method="POST",
      path="/api/search/sessions",
      body={"prompt": prompt, "source": "loadTest"},
    )
    samples.append(sample)
    if not created or not created.get("sessionId"):
      raise RuntimeError(sample.error or "SESSION_ID_MISSING")
    session_id = str(created["sessionId"])

    while True:
      turn, sample = await timed_json_request(
        client,
        name="get_turn",
        method="GET",
        path=f"/api/search/sessions/{session_id}",
      )
      samples.append(sample)
      if not turn:
        raise RuntimeError(sample.error or "TURN_MISSING")

      phase = str(turn.get("phase") or "unknown")
      if phase != "question" or answered_questions >= max_answers:
        break

      question = turn.get("question")
      option = choose_answer_option(question) if isinstance(question, dict) else None
      if not isinstance(question, dict) or not question.get("id") or not option or not option.get("id"):
        raise RuntimeError("QUESTION_OPTION_MISSING")

      _, sample = await timed_json_request(
        client,
        name="answer",
        method="POST",
        path=f"/api/search/sessions/{session_id}/answer",
        body={"questionId": question["id"], "optionId": option["id"]},
      )
      samples.append(sample)
      if sample.error:
        raise RuntimeError(sample.error)
      answered_questions += 1
  except Exception as error:  # noqa: BLE001 - 한 여정 실패가 전체 측정을 중단하지 않게 한다.
    journey_error = str(error)
    phase = "error"

  duration_ms = (time.perf_counter() - started_at) * 1000
  if session_id:
    _, cancel_sample = await timed_json_request(
      client,
      name="cancel_cleanup",
      method="POST",
      path=f"/api/search/sessions/{session_id}/cancel",
    )
    samples.append(cancel_sample)

  return JourneyResult(
    session_id=session_id,
    phase=phase,
    answered_questions=answered_questions,
    duration_ms=duration_ms,
    samples=tuple(samples),
    error=journey_error,
  )


async def run_probe_load(
  client: httpx.AsyncClient,
  *,
  path: str,
  total_requests: int,
  concurrency: int,
  interval_seconds: float,
) -> list[RequestSample]:
  queue: asyncio.Queue[int] = asyncio.Queue()
  for request_id in range(total_requests):
    queue.put_nowait(request_id)
  samples: list[RequestSample] = []

  async def worker() -> None:
    while True:
      try:
        queue.get_nowait()
      except asyncio.QueueEmpty:
        return
      try:
        _, sample = await timed_json_request(
          client,
          name="probe",
          method="GET",
          path=path,
        )
        samples.append(sample)
        if interval_seconds > 0:
          await asyncio.sleep(interval_seconds)
      finally:
        queue.task_done()

  await asyncio.gather(*(worker() for _ in range(concurrency)))
  return samples


async def run_mixed_load(
  *,
  base_url: str,
  token: str | None,
  prompt: str,
  journeys: int,
  journey_concurrency: int,
  max_answers: int,
  probe_path: str,
  probe_requests: int,
  probe_concurrency: int,
  probe_interval_seconds: float,
  timeout_seconds: float,
) -> dict[str, Any]:
  headers = {"Authorization": f"Bearer {token}"} if token else None
  limits = httpx.Limits(
    max_connections=max(10, journey_concurrency + probe_concurrency + 5),
    max_keepalive_connections=max(10, journey_concurrency + probe_concurrency),
  )
  timeout = httpx.Timeout(timeout_seconds)
  started_at = time.perf_counter()

  async with httpx.AsyncClient(
    base_url=base_url.rstrip("/"),
    headers=headers,
    limits=limits,
    timeout=timeout,
  ) as client:
    journey_queue: asyncio.Queue[int] = asyncio.Queue()
    for journey_id in range(journeys):
      journey_queue.put_nowait(journey_id)
    journey_results: list[JourneyResult] = []

    async def journey_worker() -> None:
      while True:
        try:
          journey_queue.get_nowait()
        except asyncio.QueueEmpty:
          return
        try:
          journey_results.append(
            await run_auradin_journey(client, prompt=prompt, max_answers=max_answers),
          )
        finally:
          journey_queue.task_done()

    probe_task = asyncio.create_task(
      run_probe_load(
        client,
        path=probe_path,
        total_requests=probe_requests,
        concurrency=probe_concurrency,
        interval_seconds=probe_interval_seconds,
      ),
    )
    journey_tasks = [
      asyncio.create_task(journey_worker())
      for _ in range(min(journeys, journey_concurrency))
    ]
    if journey_tasks:
      await asyncio.gather(*journey_tasks)
    probe_samples = await probe_task

  duration_seconds = time.perf_counter() - started_at
  journey_samples = [sample for result in journey_results for sample in result.samples]
  step_summaries = {
    name: summarize_samples([sample for sample in journey_samples if sample.name == name])
    for name in sorted({sample.name for sample in journey_samples})
  }
  journey_durations = [result.duration_ms for result in journey_results]

  return {
    "baseUrl": base_url.rstrip("/"),
    "durationSeconds": _round(duration_seconds),
    "configuration": {
      "journeys": journeys,
      "journeyConcurrency": journey_concurrency,
      "maxAnswers": max_answers,
      "probePath": probe_path,
      "probeRequests": probe_requests,
      "probeConcurrency": probe_concurrency,
      "probeIntervalMs": _round(probe_interval_seconds * 1000),
    },
    "journeys": {
      "completed": len(journey_results),
      "phaseCounts": dict(sorted(Counter(result.phase for result in journey_results).items())),
      "errorCounts": dict(
        sorted(Counter(result.error for result in journey_results if result.error).items()),
      ),
      "answeredQuestions": sum(result.answered_questions for result in journey_results),
      "durationMsP50": _round(percentile(journey_durations, 0.50)),
      "durationMsP95": _round(percentile(journey_durations, 0.95)),
      "durationMsMax": _round(max(journey_durations, default=0.0)),
      "requestSteps": step_summaries,
      "sessionIds": [result.session_id for result in journey_results if result.session_id],
    },
    "probe": summarize_samples(probe_samples),
  }


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Run Auradin user journeys while measuring a normal API probe path.",
  )
  parser.add_argument("--base-url", required=True)
  parser.add_argument("--prompt", default=DEFAULT_PROMPT)
  parser.add_argument("--journeys", type=int, default=0)
  parser.add_argument("--journey-concurrency", type=int, default=1)
  parser.add_argument("--max-answers", type=int, default=3)
  parser.add_argument("--probe-path", default="/api/analysis/reports")
  parser.add_argument("--probe-requests", type=int, default=1000)
  parser.add_argument("--probe-concurrency", type=int, default=20)
  parser.add_argument("--probe-interval-ms", type=float, default=100.0)
  parser.add_argument("--timeout-seconds", type=float, default=90.0)
  parser.add_argument("--bearer-token-env")
  parser.add_argument("--output", type=Path)
  args = parser.parse_args()

  if args.journeys < 0:
    parser.error("--journeys cannot be negative")
  if args.journey_concurrency < 1:
    parser.error("--journey-concurrency must be at least 1")
  if args.max_answers < 0:
    parser.error("--max-answers cannot be negative")
  if args.probe_requests < 1:
    parser.error("--probe-requests must be at least 1")
  if args.probe_concurrency < 1 or args.probe_concurrency > args.probe_requests:
    parser.error("--probe-concurrency must be between 1 and --probe-requests")
  if args.probe_interval_ms < 0:
    parser.error("--probe-interval-ms cannot be negative")
  if args.timeout_seconds <= 0:
    parser.error("--timeout-seconds must be greater than 0")
  return args


async def async_main(args: argparse.Namespace) -> int:
  token = None
  if args.bearer_token_env:
    token = os.environ.get(args.bearer_token_env, "").strip()
    if not token:
      raise SystemExit(f"Environment variable {args.bearer_token_env} is empty.")

  result = await run_mixed_load(
    base_url=args.base_url,
    token=token,
    prompt=args.prompt,
    journeys=args.journeys,
    journey_concurrency=args.journey_concurrency,
    max_answers=args.max_answers,
    probe_path=args.probe_path,
    probe_requests=args.probe_requests,
    probe_concurrency=args.probe_concurrency,
    probe_interval_seconds=args.probe_interval_ms / 1000,
    timeout_seconds=args.timeout_seconds,
  )
  rendered = json.dumps(result, ensure_ascii=False, indent=2)
  print(rendered)
  if args.output:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(rendered + "\n", encoding="utf-8")

  failed_journeys = sum(result["journeys"]["errorCounts"].values())
  return 0 if result["probe"]["failures"] == 0 and failed_journeys == 0 else 1


def main() -> None:
  raise SystemExit(asyncio.run(async_main(parse_args())))


if __name__ == "__main__":
  main()
