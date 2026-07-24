import re
from pathlib import Path

from scripts.calculate_worker_capacity import (
  ALARM_DETECTION_SECONDS,
  MAX_WORKERS,
  MIN_WORKERS,
  build_report,
  first_scale_out_worker_count,
  simulate_completion_times,
  summarize,
)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
AUTOSCALING_SCRIPT_PATH = PROJECT_ROOT / "scripts/aws/configure_ai_worker_autoscaling.ps1"
STEP_PATTERN = re.compile(
  r"MetricIntervalLowerBound = (?P<lower>\d+)\s+"
  r"(?:MetricIntervalUpperBound = (?P<upper>\d+)\s+)?"
  r"ScalingAdjustment = (?P<adjustment>\d+)",
)


def test_simulate_completion_times_assigns_fifo_jobs_to_available_workers() -> None:
  completions = simulate_completion_times(
    job_count=5,
    duration_seconds=10,
    worker_available_at=[0, 0],
  )

  assert completions == [10, 10, 20, 20, 30]
  assert summarize(completions).last_seconds == 30


def test_first_scale_out_model_uses_earliest_metric_sample_upper_bound() -> None:
  assert first_scale_out_worker_count(0) == 2
  assert first_scale_out_worker_count(1) == 4
  assert first_scale_out_worker_count(4) == 4
  assert first_scale_out_worker_count(5) == 6
  assert first_scale_out_worker_count(9) == 6
  assert first_scale_out_worker_count(10) == 8
  assert first_scale_out_worker_count(20) == 8


def test_report_discloses_repeated_alarm_capacity_ceiling() -> None:
  report = build_report((3,))

  assert report["autoscalingModel"] == {
    "adjustmentType": "ChangeInCapacity",
    "scope": "first_alarm_breach",
    "minWorkers": 2,
    "maxWorkers": 8,
    "alarmDetectionSeconds": 60,
    "taskStartupDelaysSeconds": (60, 90),
    "persistentAlarmWorkerCeiling": 8,
    "queueDepthAssumption": "all_burst_jobs_visible_at_earliest_metric_sample",
  }
  assert report["modelScope"]["method"] == "deterministic_each_job_uses_measured_p95"
  assert report["modelScope"]["includedJobTypes"] == [
    "analysis", "feedback", "filter_extraction",
  ]
  assert "makeup_recommendation" in report["modelScope"]["excludedJobTypes"]
  assert (
    "first_scale_out_4_workers_alarm_60s_startup_60s"
    in report["scenarios"]["analysis"]["3"]
  )


def test_report_includes_alarm_detection_before_task_startup() -> None:
  report = build_report((20,))
  startup_60 = report["scenarios"]["analysis"]["20"][
    "first_scale_out_8_workers_alarm_60s_startup_60s"
  ]
  startup_90 = report["scenarios"]["analysis"]["20"][
    "first_scale_out_8_workers_alarm_60s_startup_90s"
  ]

  assert startup_60 == {
    "first_seconds": 37.9,
    "p50_seconds": 157.9,
    "p95_seconds": 339.6,
    "last_seconds": 339.6,
    "average_seconds": 200.4,
    "worker_last_seconds": 402.2,
  }
  assert startup_90 == {
    "first_seconds": 37.9,
    "p50_seconds": 187.9,
    "p95_seconds": 339.6,
    "last_seconds": 339.6,
    "average_seconds": 218.4,
    "worker_last_seconds": 402.2,
  }
  assert report["scenarioFields"]["first/p50/p95/last/average_seconds"] == "user_ready"
  assert (
    report["scenarioFields"]["worker_last_seconds"]
    == "worker_completion_and_final_message_deletion"
  )


def test_capacity_model_matches_powershell_autoscaling_policy() -> None:
  script = AUTOSCALING_SCRIPT_PATH.read_text(encoding="utf-8")
  steps = [
    (
      int(match.group("lower")),
      int(match.group("upper")) if match.group("upper") else None,
      int(match.group("adjustment")),
    )
    for match in STEP_PATTERN.finditer(script)
  ]

  assert f"[int]$MinCapacity = {MIN_WORKERS}" in script
  assert f"[int]$MaxCapacity = {MAX_WORKERS}" in script
  assert steps == [
    (0, 4, 2),
    (4, 9, 4),
    (9, None, 6),
  ]
  assert f"--period {ALARM_DETECTION_SECONDS}" in script
  assert "--threshold 1" in script
  assert 'AdjustmentType = "ChangeInCapacity"' in script
  assert "--evaluation-periods 1" in script
  assert "--datapoints-to-alarm 1" in script
