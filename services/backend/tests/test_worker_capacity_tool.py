from scripts.calculate_worker_capacity import (
  autoscaled_worker_count,
  simulate_completion_times,
  summarize,
)


def test_simulate_completion_times_assigns_fifo_jobs_to_available_workers() -> None:
  completions = simulate_completion_times(
    job_count=5,
    duration_seconds=10,
    worker_available_at=[0, 0],
  )

  assert completions == [10, 10, 20, 20, 30]
  assert summarize(completions).last_seconds == 30


def test_autoscaling_model_accounts_for_one_inflight_message() -> None:
  assert autoscaled_worker_count(1) == 1
  assert autoscaled_worker_count(5) == 2
  assert autoscaled_worker_count(6) == 3
