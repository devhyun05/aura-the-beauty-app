from __future__ import annotations

from typing import Any, Literal, TypedDict


MakeupJourneyObservedRoute = Literal[
  "calendar",
  "makeup_journey",
  "feedback_jobs",
]

MAKEUP_JOURNEY_CORRECTION_PARENT_ERROR_CODES = frozenset(
  {
    "FEEDBACK_PARENT_NOT_ALLOWED",
    "FEEDBACK_PARENT_REQUIRED",
    "FEEDBACK_REPORT_NOT_FOUND",
    "FEEDBACK_PARENT_NOT_COMPLETED",
    "FEEDBACK_PARENT_DATE_MISSING",
  }
)


class MakeupJourneyHttpMetric(TypedDict):
  durationMs: int
  metricName: Literal["makeup_journey_http_request"]
  method: str
  outcome: Literal["success", "client_error", "server_error"]
  route: MakeupJourneyObservedRoute
  statusCode: int


class MakeupFeedbackGenerationMetric(TypedDict):
  feedbackKind: Literal["initial", "correction"]
  metricName: Literal["makeup_feedback_generation"]
  outcome: Literal["completed", "failed"]


def classify_makeup_journey_observed_route(
  path: str,
  api_prefix: str,
) -> MakeupJourneyObservedRoute | None:
  normalized_prefix = api_prefix.rstrip("/")
  journey_prefix = f"{normalized_prefix}/makeup-journey"

  if path == f"{journey_prefix}/calendar":
    return "calendar"
  if path.startswith(f"{journey_prefix}/"):
    return "makeup_journey"
  if path == f"{normalized_prefix}/feedback/jobs":
    return "feedback_jobs"
  return None


def build_makeup_journey_http_metric(
  *,
  duration_ms: int,
  method: str,
  route: MakeupJourneyObservedRoute,
  status_code: int,
) -> MakeupJourneyHttpMetric:
  outcome: Literal["success", "client_error", "server_error"]
  if status_code >= 500:
    outcome = "server_error"
  elif status_code >= 400:
    outcome = "client_error"
  else:
    outcome = "success"

  return {
    "durationMs": max(duration_ms, 0),
    "metricName": "makeup_journey_http_request",
    "method": method.upper(),
    "outcome": outcome,
    "route": route,
    "statusCode": status_code,
  }


def build_makeup_journey_correction_parent_metric(
  *,
  error_code: str,
  status_code: int,
) -> dict[str, str | int] | None:
  if error_code not in MAKEUP_JOURNEY_CORRECTION_PARENT_ERROR_CODES:
    return None
  return {
    "errorCode": error_code,
    "metricName": "makeup_journey_correction_parent_rejected",
    "statusCode": status_code,
  }


def build_makeup_feedback_generation_metric(
  request_payload: dict[str, Any],
  *,
  outcome: Literal["completed", "failed"],
) -> MakeupFeedbackGenerationMetric:
  raw_context = request_payload.get("makeupJourneyContext")
  context = raw_context if isinstance(raw_context, dict) else {}
  feedback_kind: Literal["initial", "correction"] = (
    "correction" if context.get("feedbackKind") == "correction" else "initial"
  )
  return {
    "feedbackKind": feedback_kind,
    "metricName": "makeup_feedback_generation",
    "outcome": outcome,
  }
