from scripts.load_test_http import percentile


def test_percentile_uses_nearest_rank() -> None:
  values = [10.0, 20.0, 30.0, 40.0, 50.0]

  assert percentile(values, 0.50) == 30.0
  assert percentile(values, 0.95) == 50.0
  assert percentile([], 0.99) == 0.0
