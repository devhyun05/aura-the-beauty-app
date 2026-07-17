param(
  [string]$Profile = "aura-dev",
  [string]$Region = "ap-northeast-2",
  [Parameter(Mandatory = $true)]
  [string]$EcsLogGroupName,
  [string]$WorkerLogGroupName = "",
  [Parameter(Mandatory = $true)]
  [string]$AiJobQueueName,
  [ValidatePattern("^[a-z0-9-]+$")]
  [string]$Environment = "dev",
  [string]$AlarmSnsTopicArn = "",
  [int]$MonthlyApi5xxThreshold = 1,
  [int]$CalendarEntryFailureThreshold = 3,
  [int]$CorrectionParentMismatchThreshold = 1,
  [ValidateRange(0.01, 100)]
  [double]$FeedbackSuccessRateThreshold = 90,
  [ValidateRange(1, 1000000)]
  [int]$FeedbackMinimumAttempts = 5,
  [ValidateRange(60, 86400)]
  [int]$AiJobMaxAgeSeconds = 900
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($MonthlyApi5xxThreshold -lt 1) {
  throw "MonthlyApi5xxThreshold must be at least 1."
}
if ($CalendarEntryFailureThreshold -lt 1) {
  throw "CalendarEntryFailureThreshold must be at least 1."
}
if ($CorrectionParentMismatchThreshold -lt 1) {
  throw "CorrectionParentMismatchThreshold must be at least 1."
}

if (-not $WorkerLogGroupName) {
  $WorkerLogGroupName = $EcsLogGroupName
}

function Assert-AuraLogGroupExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LogGroupName
  )

  $logGroupsJson = aws logs describe-log-groups `
    --log-group-name-prefix $LogGroupName `
    --region $Region `
    --profile $Profile `
    --output json
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to inspect CloudWatch log group $LogGroupName."
  }

  $logGroups = $logGroupsJson | ConvertFrom-Json
  $exactLogGroup = @($logGroups.logGroups) | Where-Object {
    $_.logGroupName -eq $LogGroupName
  } | Select-Object -First 1
  if (-not $exactLogGroup) {
    throw "CloudWatch log group $LogGroupName does not exist in $Region."
  }
}

@($EcsLogGroupName, $WorkerLogGroupName) | Select-Object -Unique | ForEach-Object {
  Assert-AuraLogGroupExists -LogGroupName $_
}

$accountId = aws sts get-caller-identity `
  --region $Region `
  --profile $Profile `
  --query Account `
  --output text
if ($LASTEXITCODE -ne 0 -or -not $accountId) {
  throw "Failed to resolve the active AWS account."
}

$aiJobQueueUrl = aws sqs get-queue-url `
  --queue-name $AiJobQueueName `
  --queue-owner-aws-account-id $accountId `
  --region $Region `
  --profile $Profile `
  --query QueueUrl `
  --output text
if ($LASTEXITCODE -ne 0 -or -not $aiJobQueueUrl -or $aiJobQueueUrl -eq "None") {
  throw "SQS queue $AiJobQueueName does not exist in the selected account and region."
}

if ($AlarmSnsTopicArn) {
  $topicArnParts = $AlarmSnsTopicArn.Split(":", 6)
  if (
    $topicArnParts.Count -ne 6 -or
    $topicArnParts[0] -ne "arn" -or
    $topicArnParts[2] -ne "sns" -or
    $topicArnParts[3] -ne $Region -or
    $topicArnParts[4] -ne $accountId -or
    -not $topicArnParts[5]
  ) {
    throw "AlarmSnsTopicArn must be an SNS topic in the selected account and region."
  }
}

$metricNamespace = "AURA/MakeupJourney/$Environment"
$namePrefix = "aura-$Environment-makeup-journey"
$dashboardName = "$namePrefix-operations"
$periodSeconds = 300

# The application logger prepends a tag before its compact JSON payload, so these
# filters deliberately use exact unstructured terms instead of a JSON filter.
# This also avoids the per-log-group quota for regex metric filters.
$metricFilters = @(
  [pscustomobject]@{
    FilterName = "$namePrefix-monthly-api-5xx"
    LogGroupName = $EcsLogGroupName
    MetricName = "MonthlyApi5xxCount"
    Pattern = '"[aura:makeup-journey-http]" "makeup_journey_http_request" "calendar" "server_error"'
  },
  [pscustomobject]@{
    FilterName = "$namePrefix-calendar-entry-client-errors"
    LogGroupName = $EcsLogGroupName
    MetricName = "CalendarEntryFailureCount"
    Pattern = '"[aura:makeup-journey-http]" "makeup_journey_http_request" "calendar" "client_error"'
  },
  [pscustomobject]@{
    FilterName = "$namePrefix-calendar-entry-server-errors"
    LogGroupName = $EcsLogGroupName
    MetricName = "CalendarEntryFailureCount"
    Pattern = '"[aura:makeup-journey-http]" "makeup_journey_http_request" "calendar" "server_error"'
  },
  [pscustomobject]@{
    FilterName = "$namePrefix-correction-parent-mismatch"
    LogGroupName = $EcsLogGroupName
    MetricName = "CorrectionParentMismatchCount"
    Pattern = '"[aura:makeup-journey-health]" "makeup_journey_correction_parent_rejected"'
  },
  [pscustomobject]@{
    FilterName = "$namePrefix-feedback-generation-completed"
    LogGroupName = $WorkerLogGroupName
    MetricName = "FeedbackGenerationCompletedCount"
    Pattern = '"[aura:makeup-feedback-generation]" "makeup_feedback_generation" "completed"'
  },
  [pscustomobject]@{
    FilterName = "$namePrefix-feedback-generation-failed"
    LogGroupName = $WorkerLogGroupName
    MetricName = "FeedbackGenerationFailedCount"
    Pattern = '"[aura:makeup-feedback-generation]" "makeup_feedback_generation" "failed"'
  }
)

# When API and worker logs are split, worker failures stay in the worker log
# group while SQS publish failures are emitted by the API process. If both
# processes share one log group, the existing worker filter already observes
# both and a second identical filter would double-count failures.
if ($WorkerLogGroupName -ne $EcsLogGroupName) {
  $metricFilters += [pscustomobject]@{
    FilterName = "$namePrefix-feedback-generation-api-failed"
    LogGroupName = $EcsLogGroupName
    MetricName = "FeedbackGenerationFailedCount"
    Pattern = '"[aura:makeup-feedback-generation]" "makeup_feedback_generation" "failed"'
  }
}

foreach ($filter in $metricFilters) {
  $metricTransformation = (
    "metricName=$($filter.MetricName)," +
    "metricNamespace=$metricNamespace," +
    "metricValue=1,defaultValue=0,unit=Count"
  )
  aws logs put-metric-filter `
    --log-group-name $filter.LogGroupName `
    --filter-name $filter.FilterName `
    --filter-pattern $filter.Pattern `
    --metric-transformations $metricTransformation `
    --region $Region `
    --profile $Profile
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to configure metric filter $($filter.FilterName)."
  }
}

function Set-AuraCountAlarm {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Description,
    [Parameter(Mandatory = $true)]
    [string]$MetricName,
    [Parameter(Mandatory = $true)]
    [int]$Threshold,
    [Parameter(Mandatory = $true)]
    [int]$EvaluationPeriods,
    [Parameter(Mandatory = $true)]
    [int]$DatapointsToAlarm
  )

  $arguments = @(
    "cloudwatch", "put-metric-alarm",
    "--alarm-name", $Name,
    "--alarm-description", $Description,
    "--namespace", $metricNamespace,
    "--metric-name", $MetricName,
    "--statistic", "Sum",
    "--unit", "Count",
    "--period", "$periodSeconds",
    "--evaluation-periods", "$EvaluationPeriods",
    "--datapoints-to-alarm", "$DatapointsToAlarm",
    "--threshold", "$Threshold",
    "--comparison-operator", "GreaterThanOrEqualToThreshold",
    "--treat-missing-data", "notBreaching",
    "--region", $Region,
    "--profile", $Profile
  )
  if ($AlarmSnsTopicArn) {
    $arguments += @(
      "--alarm-actions", $AlarmSnsTopicArn,
      "--ok-actions", $AlarmSnsTopicArn
    )
  }

  & aws @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to configure CloudWatch alarm $Name."
  }
}

Set-AuraCountAlarm `
  -Name "$namePrefix-monthly-api-5xx" `
  -Description "The Makeup Journey monthly calendar API returned a server error." `
  -MetricName "MonthlyApi5xxCount" `
  -Threshold $MonthlyApi5xxThreshold `
  -EvaluationPeriods 1 `
  -DatapointsToAlarm 1

Set-AuraCountAlarm `
  -Name "$namePrefix-calendar-entry-failures" `
  -Description "Calendar entry requests repeatedly returned a client or server error." `
  -MetricName "CalendarEntryFailureCount" `
  -Threshold $CalendarEntryFailureThreshold `
  -EvaluationPeriods 2 `
  -DatapointsToAlarm 2

Set-AuraCountAlarm `
  -Name "$namePrefix-correction-parent-mismatch" `
  -Description "A correction feedback request was rejected by its parent-report contract." `
  -MetricName "CorrectionParentMismatchCount" `
  -Threshold $CorrectionParentMismatchThreshold `
  -EvaluationPeriods 1 `
  -DatapointsToAlarm 1

function New-AuraMetricQuery {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Id,
    [Parameter(Mandatory = $true)]
    [string]$MetricName,
    [Parameter(Mandatory = $true)]
    [int]$Period
  )

  return @{
    Id = $Id
    MetricStat = @{
      Metric = @{
        Namespace = $metricNamespace
        MetricName = $MetricName
      }
      Period = $Period
      Stat = "Sum"
      Unit = "Count"
    }
    ReturnData = $false
  }
}

$successRateExpression = (
  "IF((FILL(completed,0)+FILL(failed,0)) >= $FeedbackMinimumAttempts," +
  "100*FILL(completed,0)/(FILL(completed,0)+FILL(failed,0)),100)"
)
$successRateMetrics = @(
  (New-AuraMetricQuery -Id "completed" -MetricName "FeedbackGenerationCompletedCount" -Period $periodSeconds),
  (New-AuraMetricQuery -Id "failed" -MetricName "FeedbackGenerationFailedCount" -Period $periodSeconds),
  @{
    Id = "successrate"
    Expression = $successRateExpression
    Label = "Feedback generation success rate (%)"
    ReturnData = $true
  }
)

$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) (
  "aura-makeup-journey-observability-" + [guid]::NewGuid().ToString("N")
)
New-Item -ItemType Directory -Path $tempDir | Out-Null

try {
  $successRateMetricsPath = Join-Path $tempDir "feedback-success-rate-metrics.json"
  [System.IO.File]::WriteAllText(
    $successRateMetricsPath,
    ($successRateMetrics | ConvertTo-Json -Depth 20),
    [System.Text.UTF8Encoding]::new($false)
  )

  $successRateThresholdText = $FeedbackSuccessRateThreshold.ToString(
    [System.Globalization.CultureInfo]::InvariantCulture
  )
  $successRateAlarmName = "$namePrefix-feedback-success-rate-low"
  $successRateAlarmArguments = @(
    "cloudwatch", "put-metric-alarm",
    "--alarm-name", $successRateAlarmName,
    "--alarm-description", "Feedback generation success rate stayed below its threshold after the minimum sample gate.",
    "--metrics", "file://$successRateMetricsPath",
    "--evaluation-periods", "3",
    "--datapoints-to-alarm", "2",
    "--threshold", $successRateThresholdText,
    "--comparison-operator", "LessThanThreshold",
    "--treat-missing-data", "notBreaching",
    "--region", $Region,
    "--profile", $Profile
  )
  if ($AlarmSnsTopicArn) {
    $successRateAlarmArguments += @(
      "--alarm-actions", $AlarmSnsTopicArn,
      "--ok-actions", $AlarmSnsTopicArn
    )
  }

  & aws @successRateAlarmArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to configure CloudWatch alarm $successRateAlarmName."
  }

  $queueAgeAlarmName = "$namePrefix-ai-job-oldest-age-high"
  $queueAgeAlarmArguments = @(
    "cloudwatch", "put-metric-alarm",
    "--alarm-name", $queueAgeAlarmName,
    "--alarm-description", "The oldest visible AI job remained queued beyond the processing-age threshold.",
    "--namespace", "AWS/SQS",
    "--metric-name", "ApproximateAgeOfOldestMessage",
    "--statistic", "Maximum",
    "--unit", "Seconds",
    "--period", "$periodSeconds",
    "--evaluation-periods", "3",
    "--datapoints-to-alarm", "2",
    "--threshold", "$AiJobMaxAgeSeconds",
    "--comparison-operator", "GreaterThanOrEqualToThreshold",
    "--dimensions", "Name=QueueName,Value=$AiJobQueueName",
    "--treat-missing-data", "notBreaching",
    "--region", $Region,
    "--profile", $Profile
  )
  if ($AlarmSnsTopicArn) {
    $queueAgeAlarmArguments += @(
      "--alarm-actions", $AlarmSnsTopicArn,
      "--ok-actions", $AlarmSnsTopicArn
    )
  }

  & aws @queueAgeAlarmArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to configure CloudWatch alarm $queueAgeAlarmName."
  }

  $dashboardBody = @{
    widgets = @(
      @{
        type = "metric"
        x = 0
        y = 0
        width = 12
        height = 6
        properties = @{
          title = "Makeup Journey critical signals"
          region = $Region
          view = "timeSeries"
          stacked = $false
          period = $periodSeconds
          stat = "Sum"
          metrics = @(
            @($metricNamespace, "MonthlyApi5xxCount", @{ label = "Monthly API 5xx" }),
            @($metricNamespace, "CalendarEntryFailureCount", @{ label = "Calendar entry failures" }),
            @($metricNamespace, "CorrectionParentMismatchCount", @{ label = "Correction parent mismatch" }),
            @($metricNamespace, "FeedbackGenerationFailedCount", @{ label = "Feedback generation failures" })
          )
        }
      },
      @{
        type = "metric"
        x = 12
        y = 0
        width = 12
        height = 6
        properties = @{
          title = "Feedback generation success rate"
          region = $Region
          view = "timeSeries"
          period = $periodSeconds
          yAxis = @{ left = @{ min = 0; max = 100 } }
          metrics = @(
            @(@{ expression = $successRateExpression; id = "successrate"; label = "Success rate (%)" }),
            @($metricNamespace, "FeedbackGenerationCompletedCount", @{ id = "completed"; visible = $false }),
            @($metricNamespace, "FeedbackGenerationFailedCount", @{ id = "failed"; visible = $false })
          )
        }
      },
      @{
        type = "metric"
        x = 0
        y = 6
        width = 12
        height = 6
        properties = @{
          title = "Feedback generation volume"
          region = $Region
          view = "timeSeries"
          stacked = $false
          period = $periodSeconds
          stat = "Sum"
          metrics = @(
            @($metricNamespace, "FeedbackGenerationCompletedCount", @{ label = "Completed" }),
            @($metricNamespace, "FeedbackGenerationFailedCount", @{ label = "Failed" })
          )
        }
      },
      @{
        type = "metric"
        x = 12
        y = 6
        width = 12
        height = 6
        properties = @{
          title = "AI job oldest queue age"
          region = $Region
          view = "timeSeries"
          period = $periodSeconds
          stat = "Maximum"
          annotations = @{
            horizontal = @(
              @{ label = "Alarm threshold"; value = $AiJobMaxAgeSeconds }
            )
          }
          metrics = @(
            @("AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", $AiJobQueueName, @{ label = "Oldest visible job age (seconds)" })
          )
        }
      }
    )
  }
  $dashboardPath = Join-Path $tempDir "dashboard.json"
  [System.IO.File]::WriteAllText(
    $dashboardPath,
    ($dashboardBody | ConvertTo-Json -Depth 30),
    [System.Text.UTF8Encoding]::new($false)
  )

  aws cloudwatch put-dashboard `
    --dashboard-name $dashboardName `
    --dashboard-body "file://$dashboardPath" `
    --region $Region `
    --profile $Profile
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to configure CloudWatch dashboard $dashboardName."
  }
}
finally {
  Remove-Item -Recurse -Force $tempDir
}

Write-Output "API_LOG_GROUP=$EcsLogGroupName"
Write-Output "WORKER_LOG_GROUP=$WorkerLogGroupName"
Write-Output "AI_JOB_QUEUE=$AiJobQueueName"
Write-Output "AI_JOB_QUEUE_URL=$aiJobQueueUrl"
Write-Output "METRIC_NAMESPACE=$metricNamespace"
Write-Output "DASHBOARD=$dashboardName"
Write-Output "ALARMS=$namePrefix-monthly-api-5xx,$namePrefix-calendar-entry-failures,$namePrefix-correction-parent-mismatch,$namePrefix-feedback-success-rate-low,$namePrefix-ai-job-oldest-age-high"
