param(
  [string]$Profile = "aura-dev",
  [string]$Region = "ap-northeast-2",
  [string]$Environment = "dev",
  [string]$AlertTopicArn = "",
  [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"
$namespace = "Aura/MakeupRecommendation"
$service = "MakeupRecommendation"
$dashboardName = "aura-makeup-recommendation-$Environment"

$dashboard = @{
  start = "-PT6H"
  periodOverride = "inherit"
  widgets = @(
    @{
      type = "metric"; x = 0; y = 0; width = 12; height = 6
      properties = @{
        title = "AI request count by model/status"; region = $Region; view = "timeSeries"; stacked = $false
        metrics = @(@(@{expression = "SEARCH('{Aura/MakeupRecommendation,Service,Provider,Operation,ModelId,Status} MetricName=`"RequestCount`"', 'Sum', 300)"; id = "requests"}))
      }
    },
    @{
      type = "metric"; x = 12; y = 0; width = 12; height = 6
      properties = @{
        title = "AI latency p95 by model"; region = $Region; view = "timeSeries"; stacked = $false
        metrics = @(@(@{expression = "SEARCH('{Aura/MakeupRecommendation,Service,Provider,Operation,ModelId,Status} MetricName=`"LatencyMs`"', 'p95', 300)"; id = "latency"}))
      }
    },
    @{
      type = "metric"; x = 0; y = 6; width = 24; height = 6
      properties = @{
        title = "AI errors by provider/model"; region = $Region; view = "timeSeries"; stacked = $true
        metrics = @(@(@{expression = "SEARCH('{Aura/MakeupRecommendation,Service,Provider,Operation,ModelId,Status} MetricName=`"ErrorCount`"', 'Sum', 300)"; id = "errors"}))
      }
    }
  )
}

$dashboardBody = $dashboard | ConvertTo-Json -Depth 12 -Compress
$null = $dashboardBody | ConvertFrom-Json
if ($ValidateOnly) {
  Write-Output "Validated dashboard '$dashboardName' and 3 alarm definitions."
  exit 0
}

aws cloudwatch put-dashboard --dashboard-name $dashboardName --dashboard-body $dashboardBody --region $Region --profile $Profile | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to configure dashboard $dashboardName." }

function Set-MakeupAlarm {
  param(
    [string]$Name,
    [string]$MetricName,
    [double]$Threshold,
    [string]$ExtendedStatistic,
    [string[]]$Dimensions
  )
  $arguments = @(
    "cloudwatch", "put-metric-alarm", "--alarm-name", $Name,
    "--namespace", $namespace, "--metric-name", $MetricName,
    "--period", "300", "--evaluation-periods", "1", "--datapoints-to-alarm", "1",
    "--threshold", [string]$Threshold, "--comparison-operator", "GreaterThanOrEqualToThreshold",
    "--treat-missing-data", "notBreaching", "--dimensions"
  ) + $Dimensions + @("--region", $Region, "--profile", $Profile)
  if ($ExtendedStatistic) { $arguments += @("--extended-statistic", $ExtendedStatistic) } else { $arguments += @("--statistic", "Sum") }
  if ($AlertTopicArn) { $arguments += @("--alarm-actions", $AlertTopicArn, "--ok-actions", $AlertTopicArn) }
  aws @arguments | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to configure alarm $Name." }
}

Set-MakeupAlarm -Name "aura-makeup-ai-errors-$Environment" -MetricName "ErrorCount" -Threshold 3 -ExtendedStatistic "" -Dimensions @("Name=Service,Value=$service")
Set-MakeupAlarm -Name "aura-makeup-bedrock-p95-high-$Environment" -MetricName "LatencyMs" -Threshold 20000 -ExtendedStatistic "p95" -Dimensions @("Name=Service,Value=$service", "Name=Provider,Value=bedrock", "Name=Operation,Value=generate_json")
Set-MakeupAlarm -Name "aura-makeup-openai-p95-high-$Environment" -MetricName "LatencyMs" -Threshold 90000 -ExtendedStatistic "p95" -Dimensions @("Name=Service,Value=$service", "Name=Provider,Value=openai", "Name=Operation,Value=generate_recommendation_asset")

Write-Output "Configured CloudWatch dashboard '$dashboardName' and makeup AI alarms."
