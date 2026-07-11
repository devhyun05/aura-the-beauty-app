from __future__ import annotations

import argparse
import heapq
import json
import math
from dataclasses import asdict, dataclass


DURATION_PROFILES_SECONDS = {
  "analysis": {
    "samples": 44,
    "worker_p50": 50.998,
    "worker_p95": 100.561,
    "user_ready_p50": 26.594,
    "user_ready_p95": 37.941,
  },
  "feedback": {
    "samples": 45,
    "worker_p50": 27.807,
    "worker_p95": 33.952,
    "user_ready_p50": 27.807,
    "user_ready_p95": 33.952,
  },
  "filter_extraction": {
    "samples": 3,
    "worker_p50": 69.228,
    "worker_p95": 74.746,
    "user_ready_p50": 69.228,
    "user_ready_p95": 74.746,
  },
}
DEFAULT_JOB_COUNTS = (5, 10, 20)


@dataclass(frozen=True)
class CompletionSummary:
  first_seconds: float
  p50_seconds: float
  p95_seconds: float
  last_seconds: float
  average_seconds: float


def nearest_rank(values: list[float], quantile: float) -> float:
  ordered = sorted(values)
  index = max(0, math.ceil(len(ordered) * quantile) - 1)
  return ordered[index]


def simulate_completion_times(
  *,
  job_count: int,
  duration_seconds: float,
  worker_available_at: list[float],
  user_ready_seconds: float | None = None,
) -> list[float]:
  workers = [(available_at, index) for index, available_at in enumerate(worker_available_at)]
  heapq.heapify(workers)
  user_ready_seconds = duration_seconds if user_ready_seconds is None else user_ready_seconds
  completions: list[float] = []

  for _ in range(job_count):
    available_at, worker_index = heapq.heappop(workers)
    completed_at = available_at + duration_seconds
    completions.append(available_at + user_ready_seconds)
    heapq.heappush(workers, (completed_at, worker_index))

  return sorted(completions)


def summarize(completions: list[float]) -> CompletionSummary:
  return CompletionSummary(
    first_seconds=round(completions[0], 1),
    p50_seconds=round(nearest_rank(completions, 0.50), 1),
    p95_seconds=round(nearest_rank(completions, 0.95), 1),
    last_seconds=round(completions[-1], 1),
    average_seconds=round(sum(completions) / len(completions), 1),
  )


def autoscaled_worker_count(job_count: int) -> int:
  # The always-on worker usually receives one message before the 60-second
  # SQS metric is evaluated, leaving four visible messages for a five-job burst.
  if job_count <= 1:
    return 1
  if job_count <= 5:
    return 2
  return 3


def build_report(job_counts: tuple[int, ...]) -> dict:
  report: dict = {"durationProfilesSeconds": DURATION_PROFILES_SECONDS, "scenarios": {}}

  for job_type, profile in DURATION_PROFILES_SECONDS.items():
    duration = profile["worker_p95"]
    user_ready = profile["user_ready_p95"]
    job_type_scenarios: dict[str, dict] = {}

    for job_count in job_counts:
      scenarios: dict[str, dict] = {}
      for worker_count in (1, 2, 3):
        completions = simulate_completion_times(
          job_count=job_count,
          duration_seconds=duration,
          worker_available_at=[0.0] * worker_count,
          user_ready_seconds=user_ready,
        )
        scenarios[f"warm_{worker_count}_workers"] = asdict(summarize(completions))

      target_workers = autoscaled_worker_count(job_count)
      for delay in (60.0, 90.0):
        completions = simulate_completion_times(
          job_count=job_count,
          duration_seconds=duration,
          worker_available_at=[0.0] + [delay] * (target_workers - 1),
          user_ready_seconds=user_ready,
        )
        scenarios[f"autoscale_{target_workers}_workers_delay_{int(delay)}s"] = asdict(
          summarize(completions),
        )

      job_type_scenarios[str(job_count)] = scenarios

    report["scenarios"][job_type] = job_type_scenarios

  return report


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Estimate FIFO AI job completion times from measured p95 durations.",
  )
  parser.add_argument(
    "--job-counts",
    default=",".join(str(value) for value in DEFAULT_JOB_COUNTS),
    help="Comma-separated simultaneous job counts.",
  )
  args = parser.parse_args()
  try:
    args.job_counts = tuple(int(value.strip()) for value in args.job_counts.split(","))
  except ValueError as error:
    parser.error(f"--job-counts must contain integers: {error}")
  if not args.job_counts or any(value < 1 for value in args.job_counts):
    parser.error("--job-counts values must be at least 1")
  return args


def main() -> None:
  args = parse_args()
  print(json.dumps(build_report(args.job_counts), indent=2))


if __name__ == "__main__":
  main()
