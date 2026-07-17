"""Low-cardinality CloudWatch EMF for makeup recommendation AI boundaries."""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Literal


logger = logging.getLogger("aura.makeup_recommendation.metrics")
NAMESPACE = "Aura/MakeupRecommendation"
SERVICE = "MakeupRecommendation"


def build_ai_metric(
  *,
  provider: Literal["bedrock", "openai"],
  operation: Literal["generate_json", "generate_recommendation_asset"],
  model_id: str,
  status: Literal["success", "error"],
  latency_ms: float,
  error_code: str | None = None,
) -> dict[str, Any]:
  dimensions = ["Service", "Provider", "Operation", "ModelId", "Status"]
  return {
    "_aws": {
      "Timestamp": int(time.time() * 1000),
      "CloudWatchMetrics": [{
        "Namespace": NAMESPACE,
        "Dimensions": [["Service"], ["Service", "Provider", "Operation"], dimensions],
        "Metrics": [
          {"Name": "RequestCount", "Unit": "Count"},
          {"Name": "ErrorCount", "Unit": "Count"},
          {"Name": "LatencyMs", "Unit": "Milliseconds"},
        ],
      }],
    },
    "Service": SERVICE,
    "Provider": provider,
    "Operation": operation,
    "ModelId": (model_id or "not-configured")[:200],
    "Status": status,
    "ErrorCode": (error_code or "none")[:100],
    "RequestCount": 1,
    "ErrorCount": 1 if status == "error" else 0,
    "LatencyMs": max(0, round(latency_ms, 2)),
  }


def emit_ai_metric(**kwargs: Any) -> dict[str, Any]:
  payload = build_ai_metric(**kwargs)
  logger.info(json.dumps(payload, ensure_ascii=True, separators=(",", ":")))
  return payload
