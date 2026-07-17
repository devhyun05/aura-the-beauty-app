from __future__ import annotations

import json
import re
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = PROJECT_ROOT / "scripts/aws/configure_makeup_journey_observability.ps1"


def _script() -> str:
  return SCRIPT_PATH.read_text(encoding="utf-8")


def _filter_matches(pattern: str, message: str) -> bool:
  required_terms = re.findall(r'"([^"]+)"', pattern)
  return bool(required_terms) and all(term in message for term in required_terms)


def test_operational_script_isolates_environment_and_validates_api_and_worker_logs() -> None:
  script = _script()

  assert "[string]$EcsLogGroupName" in script
  assert '[string]$WorkerLogGroupName = ""' in script
  assert '[Parameter(Mandatory = $true)]\n  [string]$AiJobQueueName' in script
  assert "$WorkerLogGroupName = $EcsLogGroupName" in script
  assert "@($EcsLogGroupName, $WorkerLogGroupName)" in script
  assert "Select-Object -Unique" in script
  assert "Assert-AuraLogGroupExists -LogGroupName $_" in script
  assert "aws logs describe-log-groups" in script
  assert "--log-group-name-prefix $LogGroupName" in script
  assert "$_.logGroupName -eq $LogGroupName" in script
  assert "aws logs put-metric-filter" in script
  assert "--log-group-name $filter.LogGroupName" in script
  assert '$metricNamespace = "AURA/MakeupJourney/$Environment"' in script
  assert script.count("AURA/MakeupJourney") == 1
  assert "metricNamespace=$metricNamespace" in script
  assert '"--namespace", $metricNamespace' in script
  assert "Namespace = $metricNamespace" in script
  assert "metricValue=1,defaultValue=0,unit=Count" in script

  queue_lookup_start = script.index("$aiJobQueueUrl = aws sqs get-queue-url")
  queue_lookup = script[queue_lookup_start : script.index("\n\n", queue_lookup_start)]
  assert "--queue-name $AiJobQueueName" in queue_lookup
  assert "--queue-owner-aws-account-id $accountId" in queue_lookup
  assert "--region $Region" in queue_lookup
  assert "--profile $Profile" in queue_lookup
  assert "--query QueueUrl" in queue_lookup
  assert "selected account and region" in script


def test_makeup_journey_metric_filters_match_the_emitted_log_contract_exactly() -> None:
  script = _script()
  record_pattern = re.compile(
    r"\[pscustomobject\]@\{\s*"
    r'FilterName = "(?P<filter>[^"]+)"\s*'
    r"LogGroupName = (?P<log_group>\$\w+)\s*"
    r'MetricName = "(?P<metric>[^"]+)"\s*'
    r"Pattern = '(?P<pattern>[^']+)'\s*\}",
    re.MULTILINE,
  )
  records = [match.groupdict() for match in record_pattern.finditer(script)]

  assert records == [
    {
      "filter": "$namePrefix-monthly-api-5xx",
      "log_group": "$EcsLogGroupName",
      "metric": "MonthlyApi5xxCount",
      "pattern": (
        '"[aura:makeup-journey-http]" "makeup_journey_http_request" '
        '"calendar" "server_error"'
      ),
    },
    {
      "filter": "$namePrefix-calendar-entry-client-errors",
      "log_group": "$EcsLogGroupName",
      "metric": "CalendarEntryFailureCount",
      "pattern": (
        '"[aura:makeup-journey-http]" "makeup_journey_http_request" '
        '"calendar" "client_error"'
      ),
    },
    {
      "filter": "$namePrefix-calendar-entry-server-errors",
      "log_group": "$EcsLogGroupName",
      "metric": "CalendarEntryFailureCount",
      "pattern": (
        '"[aura:makeup-journey-http]" "makeup_journey_http_request" '
        '"calendar" "server_error"'
      ),
    },
    {
      "filter": "$namePrefix-correction-parent-mismatch",
      "log_group": "$EcsLogGroupName",
      "metric": "CorrectionParentMismatchCount",
      "pattern": (
        '"[aura:makeup-journey-health]" '
        '"makeup_journey_correction_parent_rejected"'
      ),
    },
    {
      "filter": "$namePrefix-feedback-generation-completed",
      "log_group": "$WorkerLogGroupName",
      "metric": "FeedbackGenerationCompletedCount",
      "pattern": (
        '"[aura:makeup-feedback-generation]" '
        '"makeup_feedback_generation" "completed"'
      ),
    },
    {
      "filter": "$namePrefix-feedback-generation-failed",
      "log_group": "$WorkerLogGroupName",
      "metric": "FeedbackGenerationFailedCount",
      "pattern": (
        '"[aura:makeup-feedback-generation]" '
        '"makeup_feedback_generation" "failed"'
      ),
    },
    {
      "filter": "$namePrefix-feedback-generation-api-failed",
      "log_group": "$EcsLogGroupName",
      "metric": "FeedbackGenerationFailedCount",
      "pattern": (
        '"[aura:makeup-feedback-generation]" '
        '"makeup_feedback_generation" "failed"'
      ),
    },
  ]
  assert "%" not in " ".join(record["pattern"] for record in records)
  assert "if ($WorkerLogGroupName -ne $EcsLogGroupName)" in script
  assert (
    script.index("if ($WorkerLogGroupName -ne $EcsLogGroupName)")
    < script.index('$namePrefix-feedback-generation-api-failed')
  )


def test_metric_filters_separate_successes_and_each_failure_signal() -> None:
  script = _script()
  patterns = re.findall(r"Pattern = '([^']+)'", script)
  assert len(patterns) == 7

  def log(tag: str, payload: dict[str, str | int]) -> str:
    return f"[aura:{tag}] {json.dumps(payload, separators=(',', ':'))}"

  calendar_5xx = log(
    "makeup-journey-http",
    {
      "metricName": "makeup_journey_http_request",
      "outcome": "server_error",
      "route": "calendar",
      "statusCode": 503,
    },
  )
  calendar_4xx = log(
    "makeup-journey-http",
    {
      "metricName": "makeup_journey_http_request",
      "outcome": "client_error",
      "route": "calendar",
      "statusCode": 401,
    },
  )
  calendar_success = log(
    "makeup-journey-http",
    {
      "metricName": "makeup_journey_http_request",
      "outcome": "success",
      "route": "calendar",
      "statusCode": 200,
    },
  )
  correction_parent = log(
    "makeup-journey-health",
    {
      "metricName": "makeup_journey_correction_parent_rejected",
      "errorCode": "FEEDBACK_PARENT_NOT_COMPLETED",
    },
  )
  generation_completed = log(
    "makeup-feedback-generation",
    {
      "metricName": "makeup_feedback_generation",
      "feedbackKind": "correction",
      "outcome": "completed",
    },
  )
  generation_failed = log(
    "makeup-feedback-generation",
    {
      "metricName": "makeup_feedback_generation",
      "feedbackKind": "initial",
      "outcome": "failed",
    },
  )

  assert [_filter_matches(pattern, calendar_5xx) for pattern in patterns] == [
    True,
    False,
    True,
    False,
    False,
    False,
    False,
  ]
  assert [_filter_matches(pattern, calendar_4xx) for pattern in patterns] == [
    False,
    True,
    False,
    False,
    False,
    False,
    False,
  ]
  assert not any(_filter_matches(pattern, calendar_success) for pattern in patterns)
  assert [_filter_matches(pattern, correction_parent) for pattern in patterns] == [
    False,
    False,
    False,
    True,
    False,
    False,
    False,
  ]
  assert [_filter_matches(pattern, generation_completed) for pattern in patterns] == [
    False,
    False,
    False,
    False,
    True,
    False,
    False,
  ]
  assert [_filter_matches(pattern, generation_failed) for pattern in patterns] == [
    False,
    False,
    False,
    False,
    False,
    True,
    True,
  ]


def test_makeup_journey_alarms_cover_critical_counts_failure_ratio_and_queue_age() -> None:
  script = _script()

  expected_count_alarm_blocks = (
    (
      'Name "$namePrefix-monthly-api-5xx"',
      'MetricName "MonthlyApi5xxCount"',
      "Threshold $MonthlyApi5xxThreshold",
      "EvaluationPeriods 1",
      "DatapointsToAlarm 1",
    ),
    (
      'Name "$namePrefix-calendar-entry-failures"',
      'MetricName "CalendarEntryFailureCount"',
      "Threshold $CalendarEntryFailureThreshold",
      "EvaluationPeriods 2",
      "DatapointsToAlarm 2",
    ),
    (
      'Name "$namePrefix-correction-parent-mismatch"',
      'MetricName "CorrectionParentMismatchCount"',
      "Threshold $CorrectionParentMismatchThreshold",
      "EvaluationPeriods 1",
      "DatapointsToAlarm 1",
    ),
  )
  for expected_fields in expected_count_alarm_blocks:
    alarm_name = expected_fields[0].split('"')[1]
    block_start = script.index(f'Set-AuraCountAlarm `\n  -Name "{alarm_name}"')
    block = script[block_start : script.index("\n\n", block_start)]
    for expected_field in expected_fields:
      assert f"-{expected_field}" in block

  assert '$successRateAlarmName = "$namePrefix-feedback-success-rate-low"' in script
  assert '"--metrics", "file://$successRateMetricsPath"' in script
  assert '"--comparison-operator", "LessThanThreshold"' in script
  assert '$queueAgeAlarmName = "$namePrefix-ai-job-oldest-age-high"' in script
  assert script.count('"--evaluation-periods", "3"') == 2
  assert script.count('"--datapoints-to-alarm", "2"') == 2
  assert '"--treat-missing-data", "notBreaching"' in script
  assert "--alarm-actions" in script and "--ok-actions" in script


def test_feedback_success_rate_alarm_is_zero_filled_and_sample_gated() -> None:
  script = _script()

  assert "FILL(completed,0)+FILL(failed,0)" in script
  assert ">= $FeedbackMinimumAttempts" in script
  assert "100*FILL(completed,0)/(FILL(completed,0)+FILL(failed,0))" in script
  assert 'MetricName = "FeedbackGenerationCompletedCount"' in script
  assert 'MetricName = "FeedbackGenerationFailedCount"' in script
  assert 'Id = "successrate"' in script
  assert "$FeedbackSuccessRateThreshold.ToString(" in script
  assert "[System.Globalization.CultureInfo]::InvariantCulture" in script


def test_sqs_oldest_age_alarm_remains_actionable_after_an_isolated_burst() -> None:
  script = _script()

  for removed_contract in (
    "FeedbackJobAcceptedCount",
    "feedback-job-accepted",
    "terminalThroughput",
    "terminalrate",
    "FeedbackMinimumAcceptedJobs",
  ):
    assert removed_contract not in script

  queue_alarm_start = script.index("$queueAgeAlarmArguments = @(")
  queue_alarm = script[queue_alarm_start : script.index("  if ($AlarmSnsTopicArn)", queue_alarm_start)]
  assert '"--namespace", "AWS/SQS"' in queue_alarm
  assert '"--metric-name", "ApproximateAgeOfOldestMessage"' in queue_alarm
  assert '"--statistic", "Maximum"' in queue_alarm
  assert '"--period", "$periodSeconds"' in queue_alarm
  assert '"--evaluation-periods", "3"' in queue_alarm
  assert '"--datapoints-to-alarm", "2"' in queue_alarm
  assert '"--threshold", "$AiJobMaxAgeSeconds"' in queue_alarm
  assert '"--dimensions", "Name=QueueName,Value=$AiJobQueueName"' in queue_alarm
  assert '"--comparison-operator", "GreaterThanOrEqualToThreshold"' in queue_alarm
  assert '[int]$AiJobMaxAgeSeconds = 900' in script

  queue_actions_start = script.index("  if ($AlarmSnsTopicArn)", queue_alarm_start)
  queue_actions = script[queue_actions_start : script.index("  & aws @queueAgeAlarmArguments")]
  assert "$queueAgeAlarmArguments += @(" in queue_actions
  assert '"--alarm-actions", $AlarmSnsTopicArn' in queue_actions
  assert '"--ok-actions", $AlarmSnsTopicArn' in queue_actions

  def alarm_fires(oldest_message_ages: list[int], threshold: int = 900) -> bool:
    return sum(age >= threshold for age in oldest_message_ages[-3:]) >= 2

  # A single burst needs no later acceptance event: the same visible message keeps aging.
  assert not alarm_fires([0, 300, 600])
  assert alarm_fires([600, 900, 1200])


def test_operational_setup_is_rerunnable_and_publishes_the_dashboard() -> None:
  script = _script()

  assert script.count("put-metric-filter") == 1
  assert script.count('"cloudwatch", "put-metric-alarm"') == 3
  assert "aws cloudwatch put-dashboard" in script
  assert 'title = "Makeup Journey critical signals"' in script
  assert 'title = "Feedback generation success rate"' in script
  assert 'title = "Feedback generation volume"' in script
  assert 'title = "AI job oldest queue age"' in script
  assert 'Write-Output "API_LOG_GROUP=$EcsLogGroupName"' in script
  assert 'Write-Output "WORKER_LOG_GROUP=$WorkerLogGroupName"' in script
  assert 'Write-Output "AI_JOB_QUEUE=$AiJobQueueName"' in script
  assert 'Write-Output "AI_JOB_QUEUE_URL=$aiJobQueueUrl"' in script
  assert "[guid]::NewGuid()" in script
  assert "Remove-Item -Recurse -Force $tempDir" in script
  assert "delete-metric-filter" not in script
  assert "delete-alarms" not in script
  assert "delete-dashboards" not in script
