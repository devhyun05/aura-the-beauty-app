param(
  [string]$Profile = "aura-dev",
  [string]$Region = "ap-northeast-2",
  [string]$ClusterName = "aura-backend-dev",
  [string]$SourceServiceName = "aura-backend-api",
  [string]$SourceContainerName = "",
  [string]$TaskFamily = "aura-trend-now-refresh",
  [string]$RuleName = "aura-trend-now-refresh-dev",
  [string]$HealthRuleName = "aura-trend-now-health-dev",
  [string]$RoleName = "aura-eventbridge-ecs-role",
  [string]$ScheduleExpression = "rate(3 hours)",
  [string]$HealthScheduleExpression = "rate(15 minutes)",
  [string]$HealthAlarmName = "aura-trend-now-health-task-failed-dev",
  [string]$AlarmSnsTopicArn = ""
)

$ErrorActionPreference = "Stop"
$tempDir = Join-Path $env:TEMP ("aura-trend-now-refresh-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

try {
if (-not $ScheduleExpression -or -not $HealthScheduleExpression) {
  throw "Both refresh and health ScheduleExpression values are required."
}

$accountId = aws sts get-caller-identity --profile $Profile --query Account --output text
if ($LASTEXITCODE -ne 0) { throw "Failed to resolve the AWS account ID." }

$service = aws ecs describe-services `
  --cluster $ClusterName `
  --services $SourceServiceName `
  --region $Region `
  --profile $Profile `
  --query "services[0]" `
  --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $service.taskDefinition) {
  throw "Failed to read source ECS service $SourceServiceName."
}
if (-not $service.networkConfiguration.awsvpcConfiguration) {
  throw "Source ECS service must use awsvpc networking."
}

$sourceTask = aws ecs describe-task-definition `
  --task-definition $service.taskDefinition `
  --region $Region `
  --profile $Profile `
  --query taskDefinition `
  --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $sourceTask.containerDefinitions) {
  throw "Failed to read source ECS task definition."
}
if (-not $sourceTask.executionRoleArn -or -not $sourceTask.taskRoleArn) {
  throw "Source ECS task must define both executionRoleArn and taskRoleArn."
}

$sourceContainer = $null
if ($SourceContainerName) {
  $sourceContainer = @($sourceTask.containerDefinitions | Where-Object { $_.name -eq $SourceContainerName })[0]
  if (-not $sourceContainer) {
    throw "Container $SourceContainerName was not found in the source task definition."
  }
} else {
  if (@($sourceTask.containerDefinitions).Count -ne 1) {
    throw "SourceServiceName has multiple containers; pass SourceContainerName explicitly."
  }
  $sourceContainer = @($sourceTask.containerDefinitions)[0]
}

$container = $sourceContainer | ConvertTo-Json -Depth 30 | ConvertFrom-Json
$runningTaskArn = aws ecs list-tasks `
  --cluster $ClusterName `
  --service-name $SourceServiceName `
  --desired-status RUNNING `
  --region $Region `
  --profile $Profile `
  --query "taskArns[0]" `
  --output text
if ($LASTEXITCODE -ne 0 -or -not $runningTaskArn -or $runningTaskArn -eq "None") {
  throw "A running source ECS task is required to pin the deployed image digest."
}
$runningTask = aws ecs describe-tasks `
  --cluster $ClusterName `
  --tasks $runningTaskArn `
  --region $Region `
  --profile $Profile `
  --query "tasks[0]" `
  --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $runningTask) {
  throw "Failed to inspect the running source ECS task."
}
if ($runningTask.taskDefinitionArn -ne $service.taskDefinition) {
  throw "The selected running task does not use the ECS service task definition. Wait for the deployment to stabilize before pinning its image."
}
$runningContainer = @($runningTask.containers | Where-Object { $_.name -eq $sourceContainer.name })[0]
if (-not $runningContainer -or -not $runningContainer.imageDigest) {
  throw "The running source container does not expose an image digest."
}
$imageBase = [regex]::Replace($sourceContainer.image, '@sha256:[0-9a-fA-F]{64}$', '')
$imageBase = [regex]::Replace($imageBase, ':[^/:]+$', '')
$container.image = "${imageBase}@$($runningContainer.imageDigest)"
$taskRoleEnvironment = @(
  @($container.environment) |
    Where-Object { $_ -and $_.name -ne "PRODUCT_TREND_TASK_ROLE_ARN" }
)
$taskRoleEnvironment += @{
  name = "PRODUCT_TREND_TASK_ROLE_ARN"
  value = $sourceTask.taskRoleArn
}
if ($container.PSObject.Properties["environment"]) {
  $container.environment = $taskRoleEnvironment
} else {
  $container | Add-Member -NotePropertyName environment -NotePropertyValue $taskRoleEnvironment
}
$forbiddenCredentialNames = @(
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_SECURITY_TOKEN"
)
$credentialEntries = @($container.environment) + @($container.secrets)
$inlineCredentialNames = @(
  $credentialEntries |
    Where-Object { $_ -and $forbiddenCredentialNames -contains $_.name } |
    ForEach-Object { $_.name }
)
if ($inlineCredentialNames.Count -gt 0) {
  throw "The source container includes forbidden inline AWS credentials: $($inlineCredentialNames -join ', '). Use the ECS task role instead."
}
$refreshCommand = @(
  "python",
  "-m",
  "app.ops.refresh_trend_now_products",
  "--trigger",
  "scheduled",
  "--auto-publish"
)
if ($container.PSObject.Properties["command"]) {
  $container.command = $refreshCommand
} else {
  $container | Add-Member -NotePropertyName command -NotePropertyValue $refreshCommand
}
$container.PSObject.Properties.Remove("portMappings")
$container.PSObject.Properties.Remove("healthCheck")
$container.PSObject.Properties.Remove("dependsOn")
if ($container.logConfiguration -and $container.logConfiguration.options) {
  $container.logConfiguration.options."awslogs-stream-prefix" = "trend-now-refresh"
}

$taskDefinition = @{
  family = $TaskFamily
  taskRoleArn = $sourceTask.taskRoleArn
  executionRoleArn = $sourceTask.executionRoleArn
  networkMode = $sourceTask.networkMode
  containerDefinitions = @($container)
  requiresCompatibilities = @("FARGATE")
  cpu = $sourceTask.cpu
  memory = $sourceTask.memory
}
if ($sourceTask.runtimePlatform) { $taskDefinition.runtimePlatform = $sourceTask.runtimePlatform }
if ($sourceTask.ephemeralStorage) { $taskDefinition.ephemeralStorage = $sourceTask.ephemeralStorage }
if ($sourceTask.volumes) { $taskDefinition.volumes = @($sourceTask.volumes) }

$taskDefinitionPath = Join-Path $tempDir "task-definition.json"
[System.IO.File]::WriteAllText(
  $taskDefinitionPath,
  ($taskDefinition | ConvertTo-Json -Depth 30),
  [System.Text.UTF8Encoding]::new($false)
)

$taskDefinitionArn = aws ecs register-task-definition `
  --cli-input-json "file://$taskDefinitionPath" `
  --region $Region `
  --profile $Profile `
  --query "taskDefinition.taskDefinitionArn" `
  --output text
if ($LASTEXITCODE -ne 0) { throw "Failed to register the trend refresh task definition." }

$trustPolicyPath = Join-Path $tempDir "eventbridge-trust-policy.json"
$trustPolicy = @{
  Version = "2012-10-17"
  Statement = @(@{
    Effect = "Allow"
    Principal = @{ Service = "events.amazonaws.com" }
    Action = "sts:AssumeRole"
  })
}
[System.IO.File]::WriteAllText(
  $trustPolicyPath,
  ($trustPolicy | ConvertTo-Json -Depth 10),
  [System.Text.UTF8Encoding]::new($false)
)

$roleArn = aws iam list-roles `
  --profile $Profile `
  --query "Roles[?RoleName=='$RoleName'].Arn | [0]" `
  --output text
if ($LASTEXITCODE -ne 0) { throw "Failed to inspect the EventBridge ECS role." }
if (-not $roleArn -or $roleArn -eq "None") {
  $roleArn = aws iam create-role `
    --role-name $RoleName `
    --assume-role-policy-document "file://$trustPolicyPath" `
    --profile $Profile `
    --query "Role.Arn" `
    --output text
  if ($LASTEXITCODE -ne 0) { throw "Failed to create the EventBridge ECS role." }
  Start-Sleep -Seconds 10
}
aws iam update-assume-role-policy `
  --role-name $RoleName `
  --policy-document "file://$trustPolicyPath" `
  --profile $Profile
if ($LASTEXITCODE -ne 0) { throw "Failed to enforce the EventBridge role trust policy." }

$rolePolicyPath = Join-Path $tempDir "eventbridge-role-policy.json"
$rolePolicy = @{
  Version = "2012-10-17"
  Statement = @(
    @{
      Effect = "Allow"
      Action = "ecs:RunTask"
      Resource = "arn:aws:ecs:${Region}:${accountId}:task-definition/${TaskFamily}:*"
    },
    @{
      Effect = "Allow"
      Action = "iam:PassRole"
      Resource = @($sourceTask.executionRoleArn, $sourceTask.taskRoleArn)
      Condition = @{
        StringEquals = @{
          "iam:PassedToService" = "ecs-tasks.amazonaws.com"
        }
      }
    }
  )
}
[System.IO.File]::WriteAllText(
  $rolePolicyPath,
  ($rolePolicy | ConvertTo-Json -Depth 10),
  [System.Text.UTF8Encoding]::new($false)
)
aws iam put-role-policy `
  --role-name $RoleName `
  --policy-name "aura-run-trend-now-refresh" `
  --policy-document "file://$rolePolicyPath" `
  --profile $Profile
if ($LASTEXITCODE -ne 0) { throw "Failed to configure the EventBridge ECS role policy." }

$ruleArn = aws events put-rule `
  --name $RuleName `
  --description "Refresh and safely auto-publish regional trend-now product collections." `
  --schedule-expression $ScheduleExpression `
  --state ENABLED `
  --region $Region `
  --profile $Profile `
  --query RuleArn `
  --output text
if ($LASTEXITCODE -ne 0) { throw "Failed to create the EventBridge trend refresh rule." }

$clusterArn = aws ecs describe-clusters `
  --clusters $ClusterName `
  --region $Region `
  --profile $Profile `
  --query "clusters[0].clusterArn" `
  --output text
if ($LASTEXITCODE -ne 0) { throw "Failed to resolve the ECS cluster ARN." }

$network = $service.networkConfiguration.awsvpcConfiguration
$targetPath = Join-Path $tempDir "eventbridge-target.json"
$target = @{
  Id = "trend-now-refresh"
  Arn = $clusterArn
  RoleArn = $roleArn
  EcsParameters = @{
    TaskDefinitionArn = $taskDefinitionArn
    TaskCount = 1
    LaunchType = "FARGATE"
    PlatformVersion = "LATEST"
    NetworkConfiguration = @{
      awsvpcConfiguration = @{
        Subnets = @($network.subnets)
        SecurityGroups = @($network.securityGroups)
        AssignPublicIp = $network.assignPublicIp
      }
    }
  }
  RetryPolicy = @{
    MaximumEventAgeInSeconds = 3600
    MaximumRetryAttempts = 1
  }
}
$targetJson = "[" + ($target | ConvertTo-Json -Depth 20) + "]"
[System.IO.File]::WriteAllText(
  $targetPath,
  $targetJson,
  [System.Text.UTF8Encoding]::new($false)
)
$refreshTargetResult = aws events put-targets `
  --rule $RuleName `
  --targets "file://$targetPath" `
  --region $Region `
  --profile $Profile `
  --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $refreshTargetResult.FailedEntryCount -gt 0) {
  throw "Failed to attach the trend refresh ECS task to EventBridge."
}

$healthRuleArn = aws events put-rule `
  --name $HealthRuleName `
  --description "Check 15-minute trend-now serving health and transactionally restore the last eligible revision." `
  --schedule-expression $HealthScheduleExpression `
  --state ENABLED `
  --region $Region `
  --profile $Profile `
  --query RuleArn `
  --output text
if ($LASTEXITCODE -ne 0) { throw "Failed to create the EventBridge trend health rule." }

$healthTargetPath = Join-Path $tempDir "eventbridge-health-target.json"
$healthInput = @{
  containerOverrides = @(@{
    name = $sourceContainer.name
    command = @("python", "-m", "app.ops.check_trend_now_health")
  })
} | ConvertTo-Json -Depth 10 -Compress
$healthTarget = @{
  Id = "trend-now-health"
  Arn = $clusterArn
  RoleArn = $roleArn
  InputTransformer = @{
    InputTemplate = $healthInput
  }
  EcsParameters = @{
    TaskDefinitionArn = $taskDefinitionArn
    TaskCount = 1
    LaunchType = "FARGATE"
    PlatformVersion = "LATEST"
    NetworkConfiguration = @{
      awsvpcConfiguration = @{
        Subnets = @($network.subnets)
        SecurityGroups = @($network.securityGroups)
        AssignPublicIp = $network.assignPublicIp
      }
    }
  }
  RetryPolicy = @{
    MaximumEventAgeInSeconds = 900
    MaximumRetryAttempts = 1
  }
}
[System.IO.File]::WriteAllText(
  $healthTargetPath,
  "[" + ($healthTarget | ConvertTo-Json -Depth 20) + "]",
  [System.Text.UTF8Encoding]::new($false)
)
$healthTargetResult = aws events put-targets `
  --rule $HealthRuleName `
  --targets "file://$healthTargetPath" `
  --region $Region `
  --profile $Profile `
  --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $healthTargetResult.FailedEntryCount -gt 0) {
  throw "Failed to attach the trend health ECS task to EventBridge."
}

$healthLogGroup = [string]$container.logConfiguration.options."awslogs-group"
if (-not $healthLogGroup) {
  throw "The source container must use awslogs so trend health task failures can be alarmed."
}
$healthMetricNamespace = "AURA/TrendNow"
$healthMetricName = "HealthTaskFailureCount"
$healthMetricFilterName = "$HealthRuleName-task-failures"
aws logs put-metric-filter `
  --log-group-name $healthLogGroup `
  --filter-name $healthMetricFilterName `
  --filter-pattern '{ $.event = "trend_now_health_task_failed" }' `
  --metric-transformations "metricName=$healthMetricName,metricNamespace=$healthMetricNamespace,metricValue=1" `
  --region $Region `
  --profile $Profile
if ($LASTEXITCODE -ne 0) { throw "Failed to configure the trend health task failure metric." }

$alarmArguments = @(
  "cloudwatch", "put-metric-alarm",
  "--alarm-name", $HealthAlarmName,
  "--alarm-description", "Trend-now health ECS task logged a blocked rollback or nonzero application failure.",
  "--namespace", $healthMetricNamespace,
  "--metric-name", $healthMetricName,
  "--statistic", "Sum",
  "--period", "300",
  "--evaluation-periods", "1",
  "--datapoints-to-alarm", "1",
  "--threshold", "1",
  "--comparison-operator", "GreaterThanOrEqualToThreshold",
  "--treat-missing-data", "notBreaching",
  "--region", $Region,
  "--profile", $Profile
)
if ($AlarmSnsTopicArn) {
  $expectedTopicPrefix = "arn:aws:sns:${Region}:${accountId}:"
  if (-not $AlarmSnsTopicArn.StartsWith($expectedTopicPrefix)) {
    throw "AlarmSnsTopicArn must belong to the selected AWS account and region."
  }
  $alarmArguments += @("--alarm-actions", $AlarmSnsTopicArn)
}
& aws @alarmArguments
if ($LASTEXITCODE -ne 0) { throw "Failed to configure the trend health task failure alarm." }

Write-Output "RULE_ARN=$ruleArn"
Write-Output "HEALTH_RULE_ARN=$healthRuleArn"
Write-Output "TASK_DEFINITION_ARN=$taskDefinitionArn"
Write-Output "SOURCE_TASK_DEFINITION_ARN=$($service.taskDefinition)"
Write-Output "SOURCE_CONTAINER_NAME=$($sourceContainer.name)"
Write-Output "IMAGE_URI=$($container.image)"
Write-Output "SCHEDULE=$ScheduleExpression"
Write-Output "HEALTH_SCHEDULE=$HealthScheduleExpression"
Write-Output "HEALTH_FAILURE_ALARM=$HealthAlarmName"
Write-Output "HEALTH_LOG_GROUP=$healthLogGroup"
} finally {
  if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir
  }
}
