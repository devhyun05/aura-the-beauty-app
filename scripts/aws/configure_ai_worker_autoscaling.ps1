param(
  [string]$Profile = "aura-dev",
  [string]$Region = "ap-northeast-2",
  [string]$ClusterName = "aura-backend-dev",
  [string]$ServiceName = "aura-ai-worker",
  [string]$QueueName = "aura-ai-jobs-dev",
  [int]$MinCapacity = 1,
  [int]$MaxCapacity = 3
)

$ErrorActionPreference = "Stop"
$resourceId = "service/$ClusterName/$ServiceName"
$scaleOutPolicyName = "aura-ai-worker-scale-out"
$scaleInPolicyName = "aura-ai-worker-scale-in"
$tempDir = Join-Path $env:TEMP "aura-ai-worker-autoscaling"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

if ($MinCapacity -lt 1 -or $MaxCapacity -lt $MinCapacity) {
  throw "Capacity range must satisfy 1 <= MinCapacity <= MaxCapacity."
}

aws application-autoscaling register-scalable-target `
  --service-namespace ecs `
  --resource-id $resourceId `
  --scalable-dimension ecs:service:DesiredCount `
  --min-capacity $MinCapacity `
  --max-capacity $MaxCapacity `
  --region $Region `
  --profile $Profile

if ($LASTEXITCODE -ne 0) {
  throw "Failed to register ECS Worker scalable target."
}

$scaleOutConfigPath = Join-Path $tempDir "scale-out-policy.json"
$scaleOutConfig = @{
  AdjustmentType = "ChangeInCapacity"
  Cooldown = 60
  MetricAggregationType = "Maximum"
  StepAdjustments = @(
    @{
      MetricIntervalLowerBound = 0
      MetricIntervalUpperBound = 4
      ScalingAdjustment = 1
    },
    @{
      MetricIntervalLowerBound = 4
      ScalingAdjustment = 2
    }
  )
}
[System.IO.File]::WriteAllText(
  $scaleOutConfigPath,
  ($scaleOutConfig | ConvertTo-Json -Depth 10),
  [System.Text.UTF8Encoding]::new($false)
)

$scaleOutPolicyArn = aws application-autoscaling put-scaling-policy `
  --policy-name $scaleOutPolicyName `
  --service-namespace ecs `
  --resource-id $resourceId `
  --scalable-dimension ecs:service:DesiredCount `
  --policy-type StepScaling `
  --step-scaling-policy-configuration "file://$scaleOutConfigPath" `
  --region $Region `
  --profile $Profile `
  --query PolicyARN `
  --output text

if ($LASTEXITCODE -ne 0) {
  throw "Failed to configure ECS Worker scale-out policy."
}

$scaleInConfigPath = Join-Path $tempDir "scale-in-policy.json"
$scaleInConfig = @{
  AdjustmentType = "ChangeInCapacity"
  Cooldown = 900
  MetricAggregationType = "Maximum"
  StepAdjustments = @(
    @{
      MetricIntervalUpperBound = 0
      ScalingAdjustment = -1
    }
  )
}
[System.IO.File]::WriteAllText(
  $scaleInConfigPath,
  ($scaleInConfig | ConvertTo-Json -Depth 10),
  [System.Text.UTF8Encoding]::new($false)
)

$scaleInPolicyArn = aws application-autoscaling put-scaling-policy `
  --policy-name $scaleInPolicyName `
  --service-namespace ecs `
  --resource-id $resourceId `
  --scalable-dimension ecs:service:DesiredCount `
  --policy-type StepScaling `
  --step-scaling-policy-configuration "file://$scaleInConfigPath" `
  --region $Region `
  --profile $Profile `
  --query PolicyARN `
  --output text

if ($LASTEXITCODE -ne 0) {
  throw "Failed to configure ECS Worker scale-in policy."
}

aws cloudwatch put-metric-alarm `
  --alarm-name "aura-ai-worker-scale-out" `
  --alarm-description "Scale out the AURA AI Worker when one or more jobs are waiting in SQS." `
  --namespace "AWS/SQS" `
  --metric-name "ApproximateNumberOfMessagesVisible" `
  --statistic "Maximum" `
  --period 60 `
  --evaluation-periods 1 `
  --datapoints-to-alarm 1 `
  --threshold 1 `
  --comparison-operator GreaterThanOrEqualToThreshold `
  --dimensions "Name=QueueName,Value=$QueueName" `
  --treat-missing-data notBreaching `
  --alarm-actions $scaleOutPolicyArn `
  --region $Region `
  --profile $Profile

if ($LASTEXITCODE -ne 0) {
  throw "Failed to configure ECS Worker scale-out alarm."
}

$scaleInMetricsPath = Join-Path $tempDir "scale-in-metrics.json"
$scaleInMetrics = @(
  @{
    Id = "visible"
    MetricStat = @{
      Metric = @{
        Namespace = "AWS/SQS"
        MetricName = "ApproximateNumberOfMessagesVisible"
        Dimensions = @(@{ Name = "QueueName"; Value = $QueueName })
      }
      Period = 60
      Stat = "Maximum"
    }
    ReturnData = $false
  },
  @{
    Id = "inflight"
    MetricStat = @{
      Metric = @{
        Namespace = "AWS/SQS"
        MetricName = "ApproximateNumberOfMessagesNotVisible"
        Dimensions = @(@{ Name = "QueueName"; Value = $QueueName })
      }
      Period = 60
      Stat = "Maximum"
    }
    ReturnData = $false
  },
  @{
    Id = "total"
    Expression = "FILL(visible, 0) + FILL(inflight, 0)"
    Label = "Visible and in-flight AI jobs"
    ReturnData = $true
  }
)
[System.IO.File]::WriteAllText(
  $scaleInMetricsPath,
  ($scaleInMetrics | ConvertTo-Json -Depth 20),
  [System.Text.UTF8Encoding]::new($false)
)

aws cloudwatch put-metric-alarm `
  --alarm-name "aura-ai-worker-scale-in" `
  --alarm-description "Scale in the AURA AI Worker after the queue and in-flight work remain empty for 15 minutes." `
  --metrics "file://$scaleInMetricsPath" `
  --evaluation-periods 15 `
  --datapoints-to-alarm 15 `
  --threshold 1 `
  --comparison-operator LessThanThreshold `
  --treat-missing-data breaching `
  --alarm-actions $scaleInPolicyArn `
  --region $Region `
  --profile $Profile

if ($LASTEXITCODE -ne 0) {
  throw "Failed to configure ECS Worker scale-in alarm."
}

Write-Output "RESOURCE_ID=$resourceId"
Write-Output "CAPACITY_RANGE=$MinCapacity..$MaxCapacity"
Write-Output "SCALE_OUT_POLICY_ARN=$scaleOutPolicyArn"
Write-Output "SCALE_IN_POLICY_ARN=$scaleInPolicyArn"
