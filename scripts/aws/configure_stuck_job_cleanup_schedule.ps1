param(
  [Parameter(Mandatory = $true)]
  [string]$ImageUri,
  [string]$Profile = "aura-dev",
  [string]$Region = "ap-northeast-2",
  [string]$ClusterName = "aura-backend-dev",
  [string]$SourceServiceName = "aura-backend-api",
  [string]$TaskFamily = "aura-stuck-job-cleanup",
  [string]$RuleName = "aura-stuck-job-cleanup-dev",
  [string]$RoleName = "aura-eventbridge-ecs-role",
  [int]$TimeoutMinutes = 120
)

$ErrorActionPreference = "Stop"
$tempDir = Join-Path $env:TEMP "aura-stuck-job-cleanup"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

if ($TimeoutMinutes -lt 1) {
  throw "TimeoutMinutes must be at least 1."
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

$sourceTask = aws ecs describe-task-definition `
  --task-definition $service.taskDefinition `
  --region $Region `
  --profile $Profile `
  --query taskDefinition `
  --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $sourceTask.containerDefinitions) {
  throw "Failed to read source ECS task definition."
}

$container = $sourceTask.containerDefinitions[0] | ConvertTo-Json -Depth 30 | ConvertFrom-Json
$container.name = $TaskFamily
$container.image = $ImageUri
$cleanupCommand = @(
  "python",
  "-m",
  "app.ops.cleanup_stuck_jobs",
  "--timeout-minutes",
  "$TimeoutMinutes"
)
if ($container.PSObject.Properties["command"]) {
  $container.command = $cleanupCommand
} else {
  $container | Add-Member -NotePropertyName command -NotePropertyValue $cleanupCommand
}
$container.PSObject.Properties.Remove("portMappings")
$container.PSObject.Properties.Remove("healthCheck")
$container.logConfiguration.options."awslogs-stream-prefix" = "stuck-cleanup"

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
if ($LASTEXITCODE -ne 0) { throw "Failed to register cleanup task definition." }

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
  --policy-name "aura-run-stuck-job-cleanup" `
  --policy-document "file://$rolePolicyPath" `
  --profile $Profile
if ($LASTEXITCODE -ne 0) { throw "Failed to configure the EventBridge ECS role policy." }

$ruleArn = aws events put-rule `
  --name $RuleName `
  --description "Reconcile stuck AI reports and remove expired Auradin sessions." `
  --schedule-expression "rate(30 minutes)" `
  --state ENABLED `
  --region $Region `
  --profile $Profile `
  --query RuleArn `
  --output text
if ($LASTEXITCODE -ne 0) { throw "Failed to create the EventBridge cleanup rule." }

$clusterArn = aws ecs describe-clusters `
  --clusters $ClusterName `
  --region $Region `
  --profile $Profile `
  --query "clusters[0].clusterArn" `
  --output text
if ($LASTEXITCODE -ne 0) { throw "Failed to resolve the ECS cluster ARN." }

$network = $service.networkConfiguration.awsvpcConfiguration
$targetPath = Join-Path $tempDir "eventbridge-target.json"
$target = @(@{
  Id = "stuck-job-cleanup"
  Arn = $clusterArn
  RoleArn = $roleArn
  EcsParameters = @{
    TaskDefinitionArn = $taskDefinitionArn
    TaskCount = 1
    LaunchType = "FARGATE"
    NetworkConfiguration = @{
      awsvpcConfiguration = @{
        Subnets = @($network.subnets)
        SecurityGroups = @($network.securityGroups)
        AssignPublicIp = $network.assignPublicIp
      }
    }
  }
})
$targetJson = "[" + ($target[0] | ConvertTo-Json -Depth 20) + "]"
[System.IO.File]::WriteAllText(
  $targetPath,
  $targetJson,
  [System.Text.UTF8Encoding]::new($false)
)
aws events put-targets `
  --rule $RuleName `
  --targets "file://$targetPath" `
  --region $Region `
  --profile $Profile
if ($LASTEXITCODE -ne 0) { throw "Failed to attach the cleanup ECS task to EventBridge." }

Write-Output "RULE_ARN=$ruleArn"
Write-Output "TASK_DEFINITION_ARN=$taskDefinitionArn"
Write-Output "IMAGE_URI=$ImageUri"
Write-Output "SCHEDULE=rate(30 minutes)"
Write-Output "TIMEOUT_MINUTES=$TimeoutMinutes"
