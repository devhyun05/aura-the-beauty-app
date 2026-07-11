from __future__ import annotations

import json
import time
from typing import Literal


MetricUnit = Literal["Count", "Milliseconds", "Seconds"]


def emit_hair_metric(
  component: str,
  metric_name: str,
  value: int | float,
  *,
  unit: MetricUnit = "Count",
  properties: dict[str, str | int | float | bool] | None = None,
) -> None:
  payload = {
    "_aws": {
      "Timestamp": int(time.time() * 1000),
      "CloudWatchMetrics": [
        {
          "Namespace": "AURA/HairSimulation",
          "Dimensions": [["Component"]],
          "Metrics": [{"Name": metric_name, "Unit": unit}],
        },
      ],
    },
    "Component": component,
    "event": metric_name,
    metric_name: value,
    **(properties or {}),
  }
  print(json.dumps(payload, separators=(",", ":")), flush=True)
