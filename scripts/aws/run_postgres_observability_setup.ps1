param(
  [Parameter(Mandatory = $true)]
  [string]$ImageUri,
  [string]$Profile = "aura-dev",
  [string]$Region = "ap-northeast-2",
  [string]$ClusterName = "aura-backend-dev",
  [string]$SourceServiceName = "aura-backend-api",
  [string]$TaskFamily = "aura-postgres-observability-setup"
)

$ErrorActionPreference = "Stop"
$tempDir = Join-Path $env:TEMP "aura-postgres-observability-setup"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

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
$command = @("python", "-m", "app.ops.configure_postgres_observability")
if ($container.PSObject.Properties["command"]) {
  $container.command = $command
} else {
  $container | Add-Member -NotePropertyName command -NotePropertyValue $command
}
$container.PSObject.Properties.Remove("portMappings")
$container.PSObject.Properties.Remove("healthCheck")
$container.logConfiguration.options."awslogs-stream-prefix" = "postgres-observability-setup"

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
if ($sourceTask.runtimePlatform) {
  $taskDefinition.runtimePlatform = $sourceTask.runtimePlatform
}

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
if ($LASTEXITCODE -ne 0 -or -not $taskDefinitionArn) {
  throw "Failed to register the PostgreSQL observability setup task."
}

$network = $service.networkConfiguration.awsvpcConfiguration
$networkConfiguration = @{
  awsvpcConfiguration = @{
    subnets = @($network.subnets)
    securityGroups = @($network.securityGroups)
    assignPublicIp = $network.assignPublicIp
  }
}
$networkPath = Join-Path $tempDir "network-configuration.json"
[System.IO.File]::WriteAllText(
  $networkPath,
  ($networkConfiguration | ConvertTo-Json -Depth 10),
  [System.Text.UTF8Encoding]::new($false)
)

$taskArn = aws ecs run-task `
  --cluster $ClusterName `
  --task-definition $taskDefinitionArn `
  --launch-type FARGATE `
  --network-configuration "file://$networkPath" `
  --count 1 `
  --region $Region `
  --profile $Profile `
  --query "tasks[0].taskArn" `
  --output text
if ($LASTEXITCODE -ne 0 -or -not $taskArn -or $taskArn -eq "None") {
  throw "Failed to start the PostgreSQL observability setup task."
}

aws ecs wait tasks-stopped `
  --cluster $ClusterName `
  --tasks $taskArn `
  --region $Region `
  --profile $Profile
if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL observability setup task did not stop normally."
}

$task = aws ecs describe-tasks `
  --cluster $ClusterName `
  --tasks $taskArn `
  --region $Region `
  --profile $Profile `
  --query "tasks[0]" `
  --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $task) {
  throw "Failed to inspect the PostgreSQL observability setup task."
}

$taskContainer = @($task.containers) | Where-Object {
  $_.name -eq $TaskFamily
} | Select-Object -First 1
if (-not $taskContainer -or $taskContainer.exitCode -ne 0) {
  $reason = if ($taskContainer.reason) { $taskContainer.reason } else { $task.stoppedReason }
  throw "PostgreSQL observability setup failed: $reason"
}

$taskId = ($taskArn -split "/")[-1]
$logGroup = $container.logConfiguration.options."awslogs-group"
$logStreamPrefix = $container.logConfiguration.options."awslogs-stream-prefix"
$logStreamName = "$logStreamPrefix/$TaskFamily/$taskId"
Start-Sleep -Seconds 3
$logMessages = aws logs get-log-events `
  --log-group-name $logGroup `
  --log-stream-name $logStreamName `
  --start-from-head `
  --region $Region `
  --profile $Profile `
  --query "events[].message" `
  --output text
if ($LASTEXITCODE -ne 0) {
  throw "Setup succeeded, but its CloudWatch log could not be read."
}

Write-Output "TASK_DEFINITION_ARN=$taskDefinitionArn"
Write-Output "TASK_ARN=$taskArn"
Write-Output "EXIT_CODE=$($taskContainer.exitCode)"
Write-Output "LOG_STREAM=$logStreamName"
Write-Output "LOG_MESSAGES=$logMessages"
