param(
  [string]$Profile = "aura-dev",
  [string]$Region = "ap-northeast-2",
  [string]$ClusterName = "aura-backend-dev",
  [string]$ServiceName = "aura-backend-api",
  [string]$TargetGroupName = "aura-backend-internal-tg",
  [int]$MinCapacity = 1,
  [int]$MaxCapacity = 2,
  [double]$CpuTargetPercent = 60,
  [double]$RequestsPerTarget = 1000,
  [int]$ScaleOutCooldownSeconds = 60,
  [int]$ScaleInCooldownSeconds = 600
)

$ErrorActionPreference = "Stop"
$resourceId = "service/$ClusterName/$ServiceName"
$cpuPolicyName = "aura-backend-api-cpu-target"
$requestPolicyName = "aura-backend-api-requests-target"
$tempDir = Join-Path $env:TEMP "aura-api-autoscaling"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

if ($MinCapacity -lt 1 -or $MaxCapacity -lt $MinCapacity) {
  throw "Capacity range must satisfy 1 <= MinCapacity <= MaxCapacity."
}
if ($CpuTargetPercent -le 0 -or $CpuTargetPercent -gt 100) {
  throw "CpuTargetPercent must be greater than 0 and at most 100."
}
if ($RequestsPerTarget -le 0) {
  throw "RequestsPerTarget must be greater than 0."
}
if ($ScaleOutCooldownSeconds -lt 0 -or $ScaleInCooldownSeconds -lt 0) {
  throw "Scaling cooldown values cannot be negative."
}

$service = aws ecs describe-services `
  --cluster $ClusterName `
  --services $ServiceName `
  --region $Region `
  --profile $Profile `
  --query "services[0]" `
  --output json | ConvertFrom-Json

if ($LASTEXITCODE -ne 0 -or -not $service -or $service.status -ne "ACTIVE") {
  throw "Failed to resolve active ECS service $ServiceName."
}

$targetGroup = @($service.loadBalancers) | Where-Object {
  $_.targetGroupArn -match "/$([regex]::Escape($TargetGroupName))/"
} | Select-Object -First 1

if (-not $targetGroup) {
  throw "ECS service $ServiceName is not attached to target group $TargetGroupName."
}

$targetGroupDetails = aws elbv2 describe-target-groups `
  --target-group-arns $targetGroup.targetGroupArn `
  --region $Region `
  --profile $Profile `
  --query "TargetGroups[0]" `
  --output json | ConvertFrom-Json

if ($LASTEXITCODE -ne 0 -or -not $targetGroupDetails) {
  throw "Failed to resolve target group $TargetGroupName."
}

$loadBalancerArn = @($targetGroupDetails.LoadBalancerArns) | Select-Object -First 1
if (-not $loadBalancerArn) {
  throw "Target group $TargetGroupName is not attached to an Application Load Balancer."
}

$loadBalancerMarker = "loadbalancer/"
$targetGroupMarker = "targetgroup/"
$loadBalancerMarkerIndex = $loadBalancerArn.IndexOf($loadBalancerMarker)
$targetGroupMarkerIndex = $targetGroup.targetGroupArn.IndexOf($targetGroupMarker)
if ($loadBalancerMarkerIndex -lt 0 -or $targetGroupMarkerIndex -lt 0) {
  throw "Could not derive an ALB request-count resource label from the target group."
}

$loadBalancerResource = $loadBalancerArn.Substring(
  $loadBalancerMarkerIndex + $loadBalancerMarker.Length
)
$targetGroupResource = $targetGroup.targetGroupArn.Substring($targetGroupMarkerIndex)
$resourceLabel = "$loadBalancerResource/$targetGroupResource"

aws application-autoscaling register-scalable-target `
  --service-namespace ecs `
  --resource-id $resourceId `
  --scalable-dimension ecs:service:DesiredCount `
  --min-capacity $MinCapacity `
  --max-capacity $MaxCapacity `
  --region $Region `
  --profile $Profile

if ($LASTEXITCODE -ne 0) {
  throw "Failed to register the API ECS scalable target."
}

function Set-AuraTargetTrackingPolicy {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PolicyName,
    [Parameter(Mandatory = $true)]
    [hashtable]$PredefinedMetricSpecification,
    [Parameter(Mandatory = $true)]
    [double]$TargetValue,
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath
  )

  $config = @{
    TargetValue = $TargetValue
    PredefinedMetricSpecification = $PredefinedMetricSpecification
    ScaleOutCooldown = $ScaleOutCooldownSeconds
    ScaleInCooldown = $ScaleInCooldownSeconds
    DisableScaleIn = $false
  }
  [System.IO.File]::WriteAllText(
    $ConfigPath,
    ($config | ConvertTo-Json -Depth 10),
    [System.Text.UTF8Encoding]::new($false)
  )

  $policyArn = aws application-autoscaling put-scaling-policy `
    --policy-name $PolicyName `
    --service-namespace ecs `
    --resource-id $resourceId `
    --scalable-dimension ecs:service:DesiredCount `
    --policy-type TargetTrackingScaling `
    --target-tracking-scaling-policy-configuration "file://$ConfigPath" `
    --region $Region `
    --profile $Profile `
    --query "PolicyARN" `
    --output text

  if ($LASTEXITCODE -ne 0 -or -not $policyArn) {
    throw "Failed to configure target tracking policy $PolicyName."
  }
  return $policyArn
}

$cpuPolicyArn = Set-AuraTargetTrackingPolicy `
  -PolicyName $cpuPolicyName `
  -PredefinedMetricSpecification @{
    PredefinedMetricType = "ECSServiceAverageCPUUtilization"
  } `
  -TargetValue $CpuTargetPercent `
  -ConfigPath (Join-Path $tempDir "cpu-target-policy.json")

$requestPolicyArn = Set-AuraTargetTrackingPolicy `
  -PolicyName $requestPolicyName `
  -PredefinedMetricSpecification @{
    PredefinedMetricType = "ALBRequestCountPerTarget"
    ResourceLabel = $resourceLabel
  } `
  -TargetValue $RequestsPerTarget `
  -ConfigPath (Join-Path $tempDir "request-target-policy.json")

Write-Output "RESOURCE_ID=$resourceId"
Write-Output "CAPACITY_RANGE=$MinCapacity..$MaxCapacity"
Write-Output "CPU_TARGET_PERCENT=$CpuTargetPercent"
Write-Output "REQUESTS_PER_TARGET=$RequestsPerTarget"
Write-Output "SCALE_OUT_COOLDOWN_SECONDS=$ScaleOutCooldownSeconds"
Write-Output "SCALE_IN_COOLDOWN_SECONDS=$ScaleInCooldownSeconds"
Write-Output "ALB_RESOURCE_LABEL=$resourceLabel"
Write-Output "CPU_POLICY_ARN=$cpuPolicyArn"
Write-Output "REQUEST_POLICY_ARN=$requestPolicyArn"
