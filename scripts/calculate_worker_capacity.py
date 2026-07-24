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
MIN_WORKERS = 2
MAX_WORKERS = 8
ALARM_DETECTION_SECONDS = 60
TASK_STARTUP_DELAYS_SECONDS = (60, 90)


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


def summarize_scenario(
  *,
  job_count: int,
  duration_seconds: float,
  worker_available_at: list[float],
  user_ready_seconds: float,
) -> dict:
  user_ready_times = simulate_completion_times(
    job_count=job_count,
    duration_seconds=duration_seconds,
    worker_available_at=worker_available_at,
    user_ready_seconds=user_ready_seconds,
  )
  worker_completion_times = simulate_completion_times(
    job_count=job_count,
    duration_seconds=duration_seconds,
    worker_available_at=worker_available_at,
    user_ready_seconds=duration_seconds,
  )
  return {
    **asdict(summarize(user_ready_times)),
    "worker_last_seconds": summarize(worker_completion_times).last_seconds,
  }


def first_scale_out_worker_count(job_count: int) -> int:
  # SQS one-minute metric samples are not phase-aligned with a traffic burst.
  # Use the conservative upper bound where the earliest sample still sees the
  # whole burst. A later sample can see fewer short jobs and scale out less.
  visible_jobs = job_count
  if visible_jobs == 0:
    return MIN_WORKERS
  if visible_jobs <= 4:
    adjustment = 2
  elif visible_jobs <= 9:
    adjustment = 4
  else:
    adjustment = 6
  return min(MAX_WORKERS, MIN_WORKERS + adjustment)


def build_report(job_counts: tuple[int, ...]) -> dict:
  report: dict = {
    "durationProfilesSeconds": DURATION_PROFILES_SECONDS,
    "modelScope": {
      "method": "deterministic_each_job_uses_measured_p95",
      "includedJobTypes": list(DURATION_PROFILES_SECONDS),
      "excludedJobTypes": {
        "makeup_recommendation": (
          "No standalone measured worker-duration profile is available yet."
        ),
      },
    },
    "autoscalingModel": {
      "adjustmentType": "ChangeInCapacity",
      "scope": "first_alarm_breach",
      "minWorkers": MIN_WORKERS,
      "maxWorkers": MAX_WORKERS,
      "alarmDetectionSeconds": ALARM_DETECTION_SECONDS,
      "taskStartupDelaysSeconds": TASK_STARTUP_DELAYS_SECONDS,
      "persistentAlarmWorkerCeiling": MAX_WORKERS,
      "queueDepthAssumption": "all_burst_jobs_visible_at_earliest_metric_sample",
    },
    "scenarioFields": {
      "first/p50/p95/last/average_seconds": "user_ready",
      "worker_last_seconds": "worker_completion_and_final_message_deletion",
    },
    "scenarios": {},
  }

  for job_type, profile in DURATION_PROFILES_SECONDS.items():
    duration = profile["worker_p95"]
    user_ready = profile["user_ready_p95"]
    job_type_scenarios: dict[str, dict] = {}

    for job_count in job_counts:
      scenarios: dict[str, dict] = {}
      for worker_count in (2, 4, 6, 8):
        scenarios[f"warm_{worker_count}_workers"] = summarize_scenario(
          job_count=job_count,
          duration_seconds=duration,
          worker_available_at=[0.0] * worker_count,
          user_ready_seconds=user_ready,
        )

      target_workers = first_scale_out_worker_count(job_count)
      for startup_delay in TASK_STARTUP_DELAYS_SECONDS:
        scaled_worker_available_at = ALARM_DETECTION_SECONDS + startup_delay
        scenario_name = (
          f"first_scale_out_{target_workers}_workers_"
          f"alarm_{ALARM_DETECTION_SECONDS}s_startup_{startup_delay}s"
        )
        scenarios[scenario_name] = summarize_scenario(
          job_count=job_count,
          duration_seconds=duration,
          worker_available_at=[0.0] * MIN_WORKERS
          + [scaled_worker_available_at] * (target_workers - MIN_WORKERS),
          user_ready_seconds=user_ready,
        )

      job_type_scenarios[str(job_count)] = scenarios

    report["scenarios"][job_type] = job_type_scenarios

  return report


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description=(
      "Estimate FIFO AI job user-ready and worker-completion timelines "
      "from measured p95 durations."
    ),
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
