param(
  [string]$Profile = "aura-dev",
  [string]$Region = "ap-northeast-2",
  [string]$DbInstanceIdentifier = "aura-dev-postgres-1",
  [string]$AlertTopicName = "aura-ops-alerts-dev",
  [ValidateRange(1, 35)]
  [int]$BackupRetentionDays = 7,
  [ValidateRange(1, 100)]
  [double]$CpuThresholdPercent = 70,
  [long]$FreeableMemoryThresholdBytes = 104857600,
  [long]$FreeStorageThresholdBytes = 5368709120,
  [double]$ConnectionThreshold = 60,
  [switch]$CreatePreChangeSnapshot,
  [switch]$SchedulePendingOsUpdate
)

$ErrorActionPreference = "Stop"
$snapshotIdentifier = ""

if ($FreeableMemoryThresholdBytes -lt 1) {
  throw "FreeableMemoryThresholdBytes must be positive."
}
if ($FreeStorageThresholdBytes -lt 1) {
  throw "FreeStorageThresholdBytes must be positive."
}
if ($ConnectionThreshold -lt 1) {
  throw "ConnectionThreshold must be positive."
}

$accountId = aws sts get-caller-identity `
  --profile $Profile `
  --query Account `
  --output text
if ($LASTEXITCODE -ne 0 -or -not $accountId) {
  throw "Failed to resolve the AWS account ID."
}

$db = aws rds describe-db-instances `
  --db-instance-identifier $DbInstanceIdentifier `
  --region $Region `
  --profile $Profile `
  --query "DBInstances[0]" `
  --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $db -or $db.DBInstanceStatus -ne "available") {
  throw "RDS instance $DbInstanceIdentifier must exist and be available."
}
$expectedArnPrefix = "arn:aws:rds:${Region}:${accountId}:db:"
if (-not $db.DBInstanceArn.StartsWith($expectedArnPrefix, [StringComparison]::Ordinal)) {
  throw "RDS instance does not belong to the expected account and region."
}

if ($CreatePreChangeSnapshot) {
  $timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
  $snapshotIdentifier = "$DbInstanceIdentifier-pre-stability-$timestamp"

  aws rds create-db-snapshot `
    --db-instance-identifier $DbInstanceIdentifier `
    --db-snapshot-identifier $snapshotIdentifier `
    --tags Key=Project,Value=aura Key=Environment,Value=dev Key=Purpose,Value=pre-rds-stability-change `
    --region $Region `
    --profile $Profile | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to create pre-change snapshot $snapshotIdentifier."
  }

  aws rds wait db-snapshot-available `
    --db-snapshot-identifier $snapshotIdentifier `
    --region $Region `
    --profile $Profile
  if ($LASTEXITCODE -ne 0) {
    throw "Snapshot $snapshotIdentifier did not become available."
  }
}

aws rds modify-db-instance `
  --db-instance-identifier $DbInstanceIdentifier `
  --backup-retention-period $BackupRetentionDays `
  --deletion-protection `
  --copy-tags-to-snapshot `
  --enable-performance-insights `
  --performance-insights-retention-period 7 `
  --database-insights-mode standard `
  --apply-immediately `
  --region $Region `
  --profile $Profile | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to configure RDS stability settings."
}

aws rds wait db-instance-available `
  --db-instance-identifier $DbInstanceIdentifier `
  --region $Region `
  --profile $Profile
if ($LASTEXITCODE -ne 0) {
  throw "RDS instance did not return to the available state."
}

$topicArn = aws sns create-topic `
  --name $AlertTopicName `
  --tags Key=Project,Value=aura Key=Environment,Value=dev `
  --region $Region `
  --profile $Profile `
  --query TopicArn `
  --output text
if ($LASTEXITCODE -ne 0 -or -not $topicArn) {
  throw "Failed to create or resolve SNS topic $AlertTopicName."
}

function Set-AuraRdsAlarm {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Description,
    [Parameter(Mandatory = $true)]
    [string]$MetricName,
    [Parameter(Mandatory = $true)]
    [ValidateSet("Average", "Maximum", "Minimum", "Sum")]
    [string]$Statistic,
    [Parameter(Mandatory = $true)]
    [ValidateSet(
      "GreaterThanOrEqualToThreshold",
      "LessThanOrEqualToThreshold"
    )]
    [string]$ComparisonOperator,
    [Parameter(Mandatory = $true)]
    [double]$Threshold,
    [int]$Period = 300,
    [int]$EvaluationPeriods = 2,
    [int]$DatapointsToAlarm = 2
  )

  aws cloudwatch put-metric-alarm `
    --alarm-name $Name `
    --alarm-description $Description `
    --namespace "AWS/RDS" `
    --metric-name $MetricName `
    --statistic $Statistic `
    --period $Period `
    --evaluation-periods $EvaluationPeriods `
    --datapoints-to-alarm $DatapointsToAlarm `
    --threshold $Threshold `
    --comparison-operator $ComparisonOperator `
    --dimensions "Name=DBInstanceIdentifier,Value=$DbInstanceIdentifier" `
    --treat-missing-data notBreaching `
    --alarm-actions $topicArn `
    --ok-actions $topicArn `
    --region $Region `
    --profile $Profile
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to configure CloudWatch alarm $Name."
  }
}

Set-AuraRdsAlarm `
  -Name "aura-rds-cpu-high" `
  -Description "AURA RDS CPU remained at or above 70 percent." `
  -MetricName "CPUUtilization" `
  -Statistic "Average" `
  -ComparisonOperator "GreaterThanOrEqualToThreshold" `
  -Threshold $CpuThresholdPercent `
  -EvaluationPeriods 3 `
  -DatapointsToAlarm 2

Set-AuraRdsAlarm `
  -Name "aura-rds-free-memory-low" `
  -Description "AURA RDS freeable memory remained at or below 100 MiB." `
  -MetricName "FreeableMemory" `
  -Statistic "Average" `
  -ComparisonOperator "LessThanOrEqualToThreshold" `
  -Threshold $FreeableMemoryThresholdBytes

Set-AuraRdsAlarm `
  -Name "aura-rds-free-storage-low" `
  -Description "AURA RDS free storage remained at or below 5 GiB." `
  -MetricName "FreeStorageSpace" `
  -Statistic "Average" `
  -ComparisonOperator "LessThanOrEqualToThreshold" `
  -Threshold $FreeStorageThresholdBytes

Set-AuraRdsAlarm `
  -Name "aura-rds-connections-high" `
  -Description "AURA RDS connection count remained at or above 60." `
  -MetricName "DatabaseConnections" `
  -Statistic "Average" `
  -ComparisonOperator "GreaterThanOrEqualToThreshold" `
  -Threshold $ConnectionThreshold

Set-AuraRdsAlarm `
  -Name "aura-rds-deadlock-detected" `
  -Description "AURA RDS reported at least one PostgreSQL deadlock." `
  -MetricName "Deadlocks" `
  -Statistic "Sum" `
  -ComparisonOperator "GreaterThanOrEqualToThreshold" `
  -Threshold 1 `
  -EvaluationPeriods 1 `
  -DatapointsToAlarm 1

$osUpdateStatus = "not-requested"
if ($SchedulePendingOsUpdate) {
  $pending = aws rds describe-pending-maintenance-actions `
    --resource-identifier $db.DBInstanceArn `
    --region $Region `
    --profile $Profile `
    --query "PendingMaintenanceActions[0]" `
    --output json | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to inspect pending RDS maintenance actions."
  }

  $systemUpdate = @($pending.PendingMaintenanceActionDetails) | Where-Object {
    $_.Action -eq "system-update"
  } | Select-Object -First 1

  if (-not $systemUpdate) {
    $osUpdateStatus = "no-pending-system-update"
  } elseif ($systemUpdate.OptInStatus -eq "next-maintenance") {
    $osUpdateStatus = "already-scheduled"
  } else {
    aws rds apply-pending-maintenance-action `
      --resource-identifier $db.DBInstanceArn `
      --apply-action "system-update" `
      --opt-in-type "next-maintenance" `
      --region $Region `
      --profile $Profile | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to schedule the pending RDS system update."
    }
    $osUpdateStatus = "scheduled-next-maintenance"
  }
}

$updatedDb = aws rds describe-db-instances `
  --db-instance-identifier $DbInstanceIdentifier `
  --region $Region `
  --profile $Profile `
  --query "DBInstances[0]" `
  --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $updatedDb) {
  throw "Failed to verify the updated RDS instance."
}

Write-Output "DB_INSTANCE_IDENTIFIER=$DbInstanceIdentifier"
Write-Output "DB_STATUS=$($updatedDb.DBInstanceStatus)"
Write-Output "BACKUP_RETENTION_DAYS=$($updatedDb.BackupRetentionPeriod)"
Write-Output "DELETION_PROTECTION=$($updatedDb.DeletionProtection)"
Write-Output "COPY_TAGS_TO_SNAPSHOT=$($updatedDb.CopyTagsToSnapshot)"
Write-Output "PERFORMANCE_INSIGHTS_ENABLED=$($updatedDb.PerformanceInsightsEnabled)"
Write-Output "PERFORMANCE_INSIGHTS_RETENTION_DAYS=$($updatedDb.PerformanceInsightsRetentionPeriod)"
Write-Output "DATABASE_INSIGHTS_MODE=$($updatedDb.DatabaseInsightsMode)"
Write-Output "PRE_CHANGE_SNAPSHOT=$snapshotIdentifier"
Write-Output "OS_UPDATE_STATUS=$osUpdateStatus"
Write-Output "SNS_TOPIC_ARN=$topicArn"
