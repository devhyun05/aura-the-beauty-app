param(
  [string]$Region = "ap-northeast-2",
  [string]$Profile = "aura-dev",
  [string]$ClusterName = "aura-backend-dev",
  [string]$ServiceName = "aura-ai-worker",
  [string]$RoleName = "",
  [string]$PolicyName = "aura-ai-worker-task-protection",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

function Invoke-AuraAwsText {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [Parameter(Mandatory = $true)]
    [string]$FailureMessage
  )

  $output = & aws @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw $FailureMessage
  }
  return "$output".Trim()
}

function Get-AuraTaskProtectionPolicy {
  param(
    [Parameter(Mandatory = $true)]
    [string]$AccountId
  )

  return [ordered]@{
    Version = "2012-10-17"
    Statement = @(
      [ordered]@{
        Sid = "ProtectAuraAiWorkerTasks"
        Effect = "Allow"
        Action = @(
          "ecs:GetTaskProtection",
          "ecs:UpdateTaskProtection"
        )
        Resource = "arn:aws:ecs:${Region}:${AccountId}:task/${ClusterName}/*"
      }
    )
  }
}

function Assert-AuraTaskProtectionPolicy {
  param(
    [Parameter(Mandatory = $true)]
    [object]$PolicyDocument,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedResource
  )

  $statements = @($PolicyDocument.Statement)
  if ($statements.Count -ne 1) {
    throw "Task protection policy must contain exactly one statement."
  }

  $statement = $statements[0]
  if ("$($statement.Effect)" -ne "Allow") {
    throw "Task protection policy must use Effect=Allow."
  }
  if ("$($statement.Resource)" -ne $ExpectedResource) {
    throw "Task protection policy resource does not match the selected cluster."
  }

  $actualActions = @($statement.Action) | Sort-Object -Unique
  $expectedActions = @(
    "ecs:GetTaskProtection",
    "ecs:UpdateTaskProtection"
  ) | Sort-Object -Unique
  if (Compare-Object $actualActions $expectedActions) {
    throw "Task protection policy actions are incomplete or broader than expected."
  }
}

$accountId = Invoke-AuraAwsText `
  -Arguments @(
    "sts", "get-caller-identity",
    "--region", $Region,
    "--profile", $Profile,
    "--query", "Account",
    "--output", "text"
  ) `
  -FailureMessage "Unable to resolve the selected AWS account."

if ($accountId -notmatch "^\d{12}$") {
  throw "AWS account id is invalid."
}

$taskDefinitionArn = Invoke-AuraAwsText `
  -Arguments @(
    "ecs", "describe-services",
    "--cluster", $ClusterName,
    "--services", $ServiceName,
    "--region", $Region,
    "--profile", $Profile,
    "--query", "services[0].taskDefinition",
    "--output", "text"
  ) `
  -FailureMessage "Unable to resolve the AI Worker service task definition."

if (-not $taskDefinitionArn -or $taskDefinitionArn -eq "None") {
  throw "AI Worker service has no active task definition."
}

$taskRoleArn = Invoke-AuraAwsText `
  -Arguments @(
    "ecs", "describe-task-definition",
    "--task-definition", $taskDefinitionArn,
    "--region", $Region,
    "--profile", $Profile,
    "--query", "taskDefinition.taskRoleArn",
    "--output", "text"
  ) `
  -FailureMessage "Unable to resolve the AI Worker task role."

$expectedRolePrefix = "arn:aws:iam::${accountId}:role/"
if (-not $taskRoleArn.StartsWith($expectedRolePrefix, [StringComparison]::Ordinal)) {
  throw "AI Worker task role does not belong to the selected account."
}

$resolvedRoleName = $taskRoleArn.Substring($expectedRolePrefix.Length)
if ($resolvedRoleName.Contains("/")) {
  $resolvedRoleName = ($resolvedRoleName -split "/")[-1]
}
if ($RoleName -and $RoleName -ne $resolvedRoleName) {
  throw "Requested role does not match the active AI Worker task role."
}

$policy = Get-AuraTaskProtectionPolicy -AccountId $accountId
$expectedResource = "$($policy.Statement[0].Resource)"
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) (
  "aura-task-protection-" + [Guid]::NewGuid().ToString("N")
)
$policyPath = Join-Path $tempDir "policy.json"

New-Item -ItemType Directory -Path $tempDir | Out-Null
try {
  [System.IO.File]::WriteAllText(
    $policyPath,
    ($policy | ConvertTo-Json -Depth 10),
    [System.Text.UTF8Encoding]::new($false)
  )

  if ($Apply) {
    & aws iam put-role-policy `
      --role-name $resolvedRoleName `
      --policy-name $PolicyName `
      --policy-document "file://$policyPath" `
      --profile $Profile
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to apply the AI Worker task protection policy."
    }
  }

  $policyNames = @()
  $policyLookupAttempts = $(if ($Apply) { 10 } else { 1 })
  for ($attempt = 1; $attempt -le $policyLookupAttempts; $attempt++) {
    $policyNamesJson = Invoke-AuraAwsText `
      -Arguments @(
        "iam", "list-role-policies",
        "--role-name", $resolvedRoleName,
        "--profile", $Profile,
        "--query", "PolicyNames",
        "--output", "json"
      ) `
      -FailureMessage "Unable to list AI Worker task role policies."
    $policyNames = [string[]]($policyNamesJson | ConvertFrom-Json)

    if ($policyNames -contains $PolicyName) {
      break
    }
    if ($Apply -and $attempt -lt $policyLookupAttempts) {
      Start-Sleep -Seconds 2
    }
  }

  if ($policyNames -notcontains $PolicyName) {
    Write-Output ("MODE=" + $(if ($Apply) { "PENDING" } else { "READ_ONLY" }))
    Write-Output "STATUS=MISSING"
    Write-Output "ROLE_NAME=$resolvedRoleName"
    Write-Output "POLICY_NAME=$PolicyName"
    Write-Output "RESOURCE=$expectedResource"
    Write-Output "APPLY_REQUIRED=1"
    if ($Apply) {
      throw "Task protection policy did not propagate after apply."
    }
    throw "Task protection policy is not configured. Re-run with -Apply."
  }

  $appliedPolicyJson = Invoke-AuraAwsText `
    -Arguments @(
      "iam", "get-role-policy",
      "--role-name", $resolvedRoleName,
      "--policy-name", $PolicyName,
      "--profile", $Profile,
      "--output", "json"
    ) `
    -FailureMessage "Unable to read the AI Worker task protection policy."
  $appliedPolicy = $appliedPolicyJson | ConvertFrom-Json
  Assert-AuraTaskProtectionPolicy `
    -PolicyDocument $appliedPolicy.PolicyDocument `
    -ExpectedResource $expectedResource

  Write-Output ("MODE=" + $(if ($Apply) { "APPLIED" } else { "VALIDATED" }))
  Write-Output "STATUS=VALIDATED"
  Write-Output "ROLE_NAME=$resolvedRoleName"
  Write-Output "POLICY_NAME=$PolicyName"
  Write-Output "RESOURCE=$expectedResource"
  Write-Output "APPLY_REQUIRED=0"
}
finally {
  if (Test-Path -LiteralPath $tempDir) {
    Remove-Item -LiteralPath $tempDir -Recurse -Force
  }
}
