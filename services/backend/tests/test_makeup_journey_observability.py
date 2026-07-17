from app.services.makeup_journey_observability import (
  build_makeup_feedback_generation_metric,
  build_makeup_journey_correction_parent_metric,
  build_makeup_journey_http_metric,
  classify_makeup_journey_observed_route,
)


def test_observability_classifies_only_journey_and_feedback_contract_routes() -> None:
  assert classify_makeup_journey_observed_route(
    "/api/makeup-journey/calendar",
    "/api",
  ) == "calendar"
  assert classify_makeup_journey_observed_route(
    "/api/makeup-journey/days/2026-07-17",
    "/api",
  ) == "makeup_journey"
  assert classify_makeup_journey_observed_route(
    "/api/feedback/jobs",
    "/api",
  ) == "feedback_jobs"
  assert classify_makeup_journey_observed_route("/api/users/me", "/api") is None


def test_observability_emits_aggregate_safe_outcomes_without_paths_or_user_data() -> None:
  metric = build_makeup_journey_http_metric(
    duration_ms=17,
    method="get",
    route="calendar",
    status_code=503,
  )

  assert metric == {
    "durationMs": 17,
    "metricName": "makeup_journey_http_request",
    "method": "GET",
    "outcome": "server_error",
    "route": "calendar",
    "statusCode": 503,
  }
  assert "path" not in metric
  assert "user" not in metric


def test_observability_distinguishes_client_failure_and_success() -> None:
  client_error = build_makeup_journey_http_metric(
    duration_ms=-1,
    method="post",
    route="feedback_jobs",
    status_code=422,
  )
  success = build_makeup_journey_http_metric(
    duration_ms=3,
    method="get",
    route="makeup_journey",
    status_code=200,
  )

  assert client_error["outcome"] == "client_error"
  assert client_error["durationMs"] == 0
  assert success["outcome"] == "success"


def test_observability_counts_only_correction_parent_contract_rejections() -> None:
  assert build_makeup_journey_correction_parent_metric(
    error_code="FEEDBACK_PARENT_NOT_COMPLETED",
    status_code=409,
  ) == {
    "errorCode": "FEEDBACK_PARENT_NOT_COMPLETED",
    "metricName": "makeup_journey_correction_parent_rejected",
    "statusCode": 409,
  }
  assert build_makeup_journey_correction_parent_metric(
    error_code="FEEDBACK_ENTRY_DATE_OUT_OF_RANGE",
    status_code=422,
  ) is None


def test_feedback_generation_metric_exposes_only_outcome_and_kind() -> None:
  metric = build_makeup_feedback_generation_metric(
    {
      "feedbackContext": {"userGoalText": "민감한 사용자 입력"},
      "makeupJourneyContext": {"feedbackKind": "correction"},
    },
    outcome="completed",
  )

  assert metric == {
    "feedbackKind": "correction",
    "metricName": "makeup_feedback_generation",
    "outcome": "completed",
  }
  assert "feedbackContext" not in metric
