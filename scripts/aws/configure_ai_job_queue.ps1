param(
  [string]$Profile = "aura-dev",
  [string]$Region = "ap-northeast-2",
  [ValidatePattern("^[A-Za-z0-9_-]{1,80}$")]
  [string]$QueueName = "aura-ai-jobs-dev",
  [ValidatePattern("^[A-Za-z0-9_-]{1,80}$")]
  [string]$DlqQueueName = "aura-ai-jobs-dlq-dev",
  [ValidateRange(60, 43200)]
  [int]$VisibilityTimeoutSeconds = 900,
  [ValidateRange(60, 1209600)]
  [int]$MessageRetentionSeconds = 345600,
  [ValidateRange(0, 20)]
  [int]$ReceiveWaitTimeSeconds = 20,
  [ValidateRange(1, 1000)]
  [int]$MaxReceiveCount = 3,
  [ValidateRange(60, 1209600)]
  [int]$DlqRetentionSeconds = 1209600,
  [switch]$AllowRestrictExistingDlq,
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

if ($QueueName -eq $DlqQueueName) {
  throw "QueueName and DlqQueueName must be different."
}
if ($DlqRetentionSeconds -lt $MessageRetentionSeconds) {
  throw "DlqRetentionSeconds must be at least MessageRetentionSeconds."
}

$accountId = aws sts get-caller-identity `
  --region $Region `
  --profile $Profile `
  --query Account `
  --output text
if ($LASTEXITCODE -ne 0 -or -not $accountId) {
  throw "Failed to resolve the AWS account ID."
}
$accountId = "$accountId".Trim()

function Get-AuraQueueUrl {
  param([Parameter(Mandatory = $true)][string]$Name)

  $stderrPath = Join-Path (
    [System.IO.Path]::GetTempPath()
  ) "aura-sqs-lookup-$([guid]::NewGuid()).stderr"
  $previousErrorActionPreference = $ErrorActionPreference
  $nativePreferenceVariable = Get-Variable `
    -Name PSNativeCommandUseErrorActionPreference `
    -ErrorAction SilentlyContinue
  if ($nativePreferenceVariable) {
    $previousNativeErrorPreference = $PSNativeCommandUseErrorActionPreference
  }
  $errorText = ""
  try {
    # Keep native stdout and stderr separate, and classify the AWS exit code
    # ourselves on both Windows PowerShell 5.1 and PowerShell 7.
    $ErrorActionPreference = "Continue"
    if ($nativePreferenceVariable) {
      $PSNativeCommandUseErrorActionPreference = $false
    }
    $urlOutput = aws sqs get-queue-url `
      --queue-name $Name `
      --queue-owner-aws-account-id $accountId `
      --region $Region `
      --profile $Profile `
      --query QueueUrl `
      --output text 2> $stderrPath
    $exitCode = $LASTEXITCODE
    if (Test-Path -LiteralPath $stderrPath) {
      $stderrContent = Get-Content -LiteralPath $stderrPath -Raw
      if ($null -ne $stderrContent) {
        $errorText = "$stderrContent".Trim()
      }
    }
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
    if ($nativePreferenceVariable) {
      $PSNativeCommandUseErrorActionPreference = $previousNativeErrorPreference
    }
    if (Test-Path -LiteralPath $stderrPath) {
      Remove-Item -LiteralPath $stderrPath -Force
    }
  }

  if ($exitCode -ne 0) {
    if ($errorText -match "NonExistentQueue|QueueDoesNotExist") {
      return $null
    }
    throw "Failed to resolve SQS queue $Name. AWS CLI error: $errorText"
  }
  $url = (@($urlOutput) -join [Environment]::NewLine).Trim()
  if (-not $url -or $url -eq "None") {
    throw "AWS returned no URL for existing SQS queue $Name."
  }
  return "$url".Trim()
}

function New-AuraQueue {
  param([Parameter(Mandatory = $true)][string]$Name)

  $url = aws sqs create-queue `
    --queue-name $Name `
    --region $Region `
    --profile $Profile `
    --query QueueUrl `
    --output text
  if ($LASTEXITCODE -ne 0 -or -not $url) {
    throw "Failed to create or resolve SQS queue $Name."
  }
  # AWS requires at least one second before a newly created queue is used.
  Start-Sleep -Seconds 1
  return "$url".Trim()
}

function Get-AuraQueueAttributes {
  param([Parameter(Mandatory = $true)][string]$QueueUrl)

  $json = aws sqs get-queue-attributes `
    --queue-url $QueueUrl `
    --attribute-names All `
    --region $Region `
    --profile $Profile `
    --query Attributes `
    --output json
  if ($LASTEXITCODE -ne 0 -or -not $json) {
    throw "Failed to read SQS attributes for $QueueUrl."
  }
  return $json | ConvertFrom-Json
}

function Set-AuraQueueAttributes {
  param(
    [Parameter(Mandatory = $true)][string]$QueueUrl,
    [Parameter(Mandatory = $true)][string]$AttributesPath
  )

  aws sqs set-queue-attributes `
    --queue-url $QueueUrl `
    --attributes "file://$AttributesPath" `
    --region $Region `
    --profile $Profile
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to update SQS attributes for $QueueUrl."
  }
}

function Assert-AuraValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [AllowNull()][object]$Actual,
    [Parameter(Mandatory = $true)][string]$Expected
  )

  if ("$Actual" -ne $Expected) {
    throw "$Name is '$Actual'; expected '$Expected'."
  }
}

function Assert-AuraMinimum {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [AllowNull()][object]$Actual,
    [Parameter(Mandatory = $true)][int]$Minimum
  )

  if ($null -eq $Actual -or [int]$Actual -lt $Minimum) {
    throw "$Name is '$Actual'; expected at least '$Minimum'."
  }
}

$queueUrl = Get-AuraQueueUrl -Name $QueueName
$dlqUrl = Get-AuraQueueUrl -Name $DlqQueueName
$dlqWasCreated = $false
$missingQueues = @()
if (-not $queueUrl) {
  $missingQueues += $QueueName
}
if (-not $dlqUrl) {
  $missingQueues += $DlqQueueName
}

if ($missingQueues.Count -gt 0 -and -not $Apply) {
  throw "Missing SQS queue(s): $($missingQueues -join ', '). Re-run with -Apply to create and configure them."
}

if ($Apply -and -not $dlqUrl) {
  $dlqUrl = New-AuraQueue -Name $DlqQueueName
  $dlqWasCreated = $true
}

$currentDlqAttributes = Get-AuraQueueAttributes -QueueUrl $dlqUrl
$existingAllowPolicy = $null
if ($currentDlqAttributes.RedriveAllowPolicy) {
  $existingAllowPolicy = $currentDlqAttributes.RedriveAllowPolicy | ConvertFrom-Json
}
$existingPermission = "allowAll"
if ($existingAllowPolicy) {
  $existingPermission = "$($existingAllowPolicy.redrivePermission)"
}
if ($existingPermission -notin @("allowAll", "byQueue", "denyAll")) {
  throw "DLQ has unsupported redrivePermission '$existingPermission'."
}
if (
  $Apply `
  -and -not $dlqWasCreated `
  -and $existingPermission -eq "allowAll" `
  -and -not $AllowRestrictExistingDlq
) {
  throw (
    "Existing DLQ $DlqQueueName currently permits all source queues. " +
    "Refusing to replace that shared/default policy with byQueue automatically. " +
    "Use a dedicated DLQ, or verify that restricting it is safe and re-run with " +
    "-AllowRestrictExistingDlq -Apply."
  )
}

if ($Apply -and -not $queueUrl) {
  $queueUrl = New-AuraQueue -Name $QueueName
}

$currentQueueAttributes = Get-AuraQueueAttributes -QueueUrl $queueUrl
$queueArn = "$($currentQueueAttributes.QueueArn)"
$dlqArn = "$($currentDlqAttributes.QueueArn)"
$expectedArnPrefix = "arn:aws:sqs:${Region}:${accountId}:"

if (-not $queueArn.StartsWith($expectedArnPrefix, [StringComparison]::Ordinal)) {
  throw "Source queue does not belong to the selected account and region."
}
if (-not $dlqArn.StartsWith($expectedArnPrefix, [StringComparison]::Ordinal)) {
  throw "DLQ does not belong to the selected account and region."
}

$sourceAttachmentPending = $false
if ($Apply) {
  # Never lower existing retention or visibility values: lowering retention can
  # remove older messages, and lowering visibility can increase duplicate work.
  $sourceRetention = [Math]::Max(
    [int]$currentQueueAttributes.MessageRetentionPeriod,
    $MessageRetentionSeconds
  )
  $sourceVisibility = [Math]::Max(
    [int]$currentQueueAttributes.VisibilityTimeout,
    $VisibilityTimeoutSeconds
  )
  $dlqRetention = [Math]::Max(
    [int]$currentDlqAttributes.MessageRetentionPeriod,
    [Math]::Max($DlqRetentionSeconds, $sourceRetention)
  )

  $allowedSourceArns = @()
  if ($existingPermission -eq "byQueue") {
    $allowedSourceArns += @($existingAllowPolicy.sourceQueueArns)
  }
  $allowedSourceArns += $queueArn
  $allowedSourceArns = @($allowedSourceArns | Sort-Object -Unique -CaseSensitive)
  if ($allowedSourceArns.Count -gt 10) {
    throw "SQS RedriveAllowPolicy supports at most 10 source queue ARNs."
  }

  $redrivePolicy = [ordered]@{
    deadLetterTargetArn = $dlqArn
    maxReceiveCount = "$MaxReceiveCount"
  } | ConvertTo-Json -Compress
  $redriveAllowPolicy = [ordered]@{
    redrivePermission = "byQueue"
    sourceQueueArns = @($allowedSourceArns)
  } | ConvertTo-Json -Compress

  $sourceBaseAttributes = [ordered]@{
    VisibilityTimeout = "$sourceVisibility"
    ReceiveMessageWaitTimeSeconds = "$ReceiveWaitTimeSeconds"
  } | ConvertTo-Json -Compress
  $sourceProtectedAttributes = [ordered]@{
    MessageRetentionPeriod = "$sourceRetention"
    RedrivePolicy = $redrivePolicy
  } | ConvertTo-Json -Compress
  $dlqAttributes = [ordered]@{
    MessageRetentionPeriod = "$dlqRetention"
    RedriveAllowPolicy = $redriveAllowPolicy
  } | ConvertTo-Json -Compress

  $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "aura-ai-queue-$([guid]::NewGuid())"
  New-Item -ItemType Directory -Path $tempDir | Out-Null
  try {
    $sourceBaseAttributesPath = Join-Path $tempDir "source-base-attributes.json"
    $sourceProtectedAttributesPath = Join-Path $tempDir "source-protected-attributes.json"
    $dlqAttributesPath = Join-Path $tempDir "dlq-attributes.json"
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText(
      $sourceBaseAttributesPath,
      $sourceBaseAttributes,
      $utf8NoBom
    )
    [System.IO.File]::WriteAllText(
      $sourceProtectedAttributesPath,
      $sourceProtectedAttributes,
      $utf8NoBom
    )
    [System.IO.File]::WriteAllText($dlqAttributesPath, $dlqAttributes, $utf8NoBom)

    # A source queue cannot designate a DLQ whose allow policy excludes it.
    # Apply and observe both the allow policy and retention dependency before
    # attaching or changing the source redrive policy.
    Set-AuraQueueAttributes -QueueUrl $dlqUrl -AttributesPath $dlqAttributesPath
    Set-AuraQueueAttributes `
      -QueueUrl $queueUrl `
      -AttributesPath $sourceBaseAttributesPath

    $dlqAttemptLimit = 14
    $dlqPolicyReady = $false
    $dlqRetentionReady = $false
    $lastDlqVerificationError = $null
    for ($dlqAttempt = 1; $dlqAttempt -le $dlqAttemptLimit; $dlqAttempt++) {
      try {
        $verifiedDlqBeforeSource = Get-AuraQueueAttributes -QueueUrl $dlqUrl
        if (-not $verifiedDlqBeforeSource.RedriveAllowPolicy) {
          throw "DLQ has no RedriveAllowPolicy."
        }
        $verifiedAllowBeforeSource = `
          $verifiedDlqBeforeSource.RedriveAllowPolicy | ConvertFrom-Json
        Assert-AuraValue `
          -Name "redrivePermission" `
          -Actual $verifiedAllowBeforeSource.redrivePermission `
          -Expected "byQueue"
        foreach ($requiredSourceArn in $allowedSourceArns) {
          if (@($verifiedAllowBeforeSource.sourceQueueArns) -notcontains $requiredSourceArn) {
            throw "DLQ RedriveAllowPolicy does not include source queue $requiredSourceArn."
          }
        }
        $dlqPolicyReady = $true
        $dlqRetentionReady = (
          [int]$verifiedDlqBeforeSource.MessageRetentionPeriod -ge $dlqRetention
        )
        if ($dlqRetentionReady) {
          break
        }
      } catch {
        $lastDlqVerificationError = $_
      }
      if ($dlqAttempt -lt $dlqAttemptLimit) {
        Start-Sleep -Seconds 5
      }
    }
    if (-not $dlqPolicyReady) {
      throw "DLQ allow policy did not propagate: $lastDlqVerificationError"
    }

    if ($dlqRetentionReady) {
      Set-AuraQueueAttributes `
        -QueueUrl $queueUrl `
        -AttributesPath $sourceProtectedAttributesPath
    } else {
      $sourceAttachmentPending = $true
      Write-Warning (
        "DLQ retention is still propagating, so the source RedrivePolicy was not " +
        "attached or changed. Wait up to 15 minutes and re-run with -Apply."
      )
    }
  } finally {
    Remove-Item -LiteralPath $tempDir -Recurse -Force
  }
}

$requiredAllowedSourceArns = @($queueArn)
$requiredVisibilityTimeout = $VisibilityTimeoutSeconds
if ($Apply) {
  $requiredAllowedSourceArns = @($allowedSourceArns)
  $requiredVisibilityTimeout = $sourceVisibility
}
$attemptLimit = 1
if ($Apply) {
  # SQS attribute propagation can be eventual.
  $attemptLimit = 14
}

for ($attempt = 1; $attempt -le $attemptLimit; $attempt++) {
  try {
    $verifiedQueue = Get-AuraQueueAttributes -QueueUrl $queueUrl
    $verifiedDlq = Get-AuraQueueAttributes -QueueUrl $dlqUrl

    if (-not $verifiedDlq.RedriveAllowPolicy) {
      throw "DLQ has no RedriveAllowPolicy."
    }
    $verifiedAllow = $verifiedDlq.RedriveAllowPolicy | ConvertFrom-Json
    Assert-AuraValue `
      -Name "redrivePermission" `
      -Actual $verifiedAllow.redrivePermission `
      -Expected "byQueue"
    foreach ($requiredSourceArn in $requiredAllowedSourceArns) {
      if (@($verifiedAllow.sourceQueueArns) -notcontains $requiredSourceArn) {
        throw "DLQ RedriveAllowPolicy does not include source queue $requiredSourceArn."
      }
    }

    Assert-AuraMinimum `
      -Name "VisibilityTimeout" `
      -Actual $verifiedQueue.VisibilityTimeout `
      -Minimum $requiredVisibilityTimeout
    Assert-AuraValue `
      -Name "ReceiveMessageWaitTimeSeconds" `
      -Actual $verifiedQueue.ReceiveMessageWaitTimeSeconds `
      -Expected "$ReceiveWaitTimeSeconds"

    if (-not $sourceAttachmentPending) {
      if (-not $verifiedQueue.RedrivePolicy) {
        throw "Source queue has no RedrivePolicy."
      }
      $verifiedRedrive = $verifiedQueue.RedrivePolicy | ConvertFrom-Json
      Assert-AuraValue `
        -Name "deadLetterTargetArn" `
        -Actual $verifiedRedrive.deadLetterTargetArn `
        -Expected $dlqArn
      Assert-AuraValue `
        -Name "maxReceiveCount" `
        -Actual $verifiedRedrive.maxReceiveCount `
        -Expected "$MaxReceiveCount"
    }
    break
  } catch {
    if ($attempt -eq $attemptLimit) {
      throw
    }
    Start-Sleep -Seconds 5
  }
}

$retentionPropagationPending = $false
$requiredSourceRetention = $MessageRetentionSeconds
$requiredDlqRetention = [Math]::Max(
  $DlqRetentionSeconds,
  [int]$verifiedQueue.MessageRetentionPeriod
)
if ($Apply) {
  $requiredSourceRetention = $sourceRetention
  $requiredDlqRetention = $dlqRetention
}

if (
  [int]$verifiedQueue.MessageRetentionPeriod -lt $requiredSourceRetention `
  -or [int]$verifiedDlq.MessageRetentionPeriod -lt $requiredDlqRetention
) {
  if (-not $Apply) {
    Assert-AuraMinimum `
      -Name "MessageRetentionPeriod" `
      -Actual $verifiedQueue.MessageRetentionPeriod `
      -Minimum $requiredSourceRetention
    Assert-AuraMinimum `
      -Name "DLQ MessageRetentionPeriod" `
      -Actual $verifiedDlq.MessageRetentionPeriod `
      -Minimum $requiredDlqRetention
  }
  $retentionPropagationPending = $true
  if ($sourceAttachmentPending) {
    Write-Warning (
      "SQS MessageRetentionPeriod propagation can take up to 15 minutes. " +
      "Re-run with -Apply to attach and validate the source RedrivePolicy."
    )
  } else {
    Write-Warning (
      "SQS MessageRetentionPeriod propagation can take up to 15 minutes. " +
      "Re-run without -Apply to validate."
    )
  }
}

$retentionStatus = "VALIDATED"
if ($retentionPropagationPending) {
  $retentionStatus = "PROPAGATION_PENDING"
}

$mode = "VALIDATED"
if ($Apply) {
  if ($sourceAttachmentPending) {
    $mode = "PENDING_RETRY_REQUIRED"
  } elseif ($retentionPropagationPending) {
    $mode = "APPLIED_POLICY_VALIDATED_RETENTION_PENDING"
  } else {
    $mode = "APPLIED_AND_VALIDATED"
  }
}
$sourceAttachmentStatus = "VALIDATED"
if ($Apply) {
  if ($sourceAttachmentPending) {
    $sourceAttachmentStatus = "PENDING_DLQ_RETENTION"
  } else {
    $sourceAttachmentStatus = "APPLIED_AND_VALIDATED"
  }
}
Write-Output "MODE=$mode"
Write-Output "QUEUE_NAME=$QueueName"
Write-Output "QUEUE_URL=$queueUrl"
Write-Output "QUEUE_ARN=$queueArn"
Write-Output "DLQ_NAME=$DlqQueueName"
Write-Output "DLQ_URL=$dlqUrl"
Write-Output "DLQ_ARN=$dlqArn"
Write-Output "MAX_RECEIVE_COUNT=$MaxReceiveCount"
Write-Output "SOURCE_ATTACHMENT_STATUS=$sourceAttachmentStatus"
Write-Output "RETENTION_STATUS=$retentionStatus"
$retryRequired = 0
if ($sourceAttachmentPending) {
  $retryRequired = 1
}
Write-Output "RETRY_REQUIRED=$retryRequired"
if ($sourceAttachmentPending) {
  throw "Source RedrivePolicy was not applied. Wait for DLQ retention and re-run with -Apply."
}
