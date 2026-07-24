from __future__ import annotations

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = PROJECT_ROOT / "scripts/aws/configure_ai_job_queue.ps1"


def _script() -> str:
  return SCRIPT_PATH.read_text(encoding="utf-8")


def test_queue_script_uses_safe_200_user_defaults() -> None:
  script = _script()

  assert '[string]$QueueName = "aura-ai-jobs-dev"' in script
  assert '[string]$DlqQueueName = "aura-ai-jobs-dlq-dev"' in script
  assert "[int]$VisibilityTimeoutSeconds = 900" in script
  assert "[int]$MessageRetentionSeconds = 345600" in script
  assert "[int]$ReceiveWaitTimeSeconds = 20" in script
  assert "[int]$MaxReceiveCount = 3" in script
  assert "[int]$DlqRetentionSeconds = 1209600" in script


def test_queue_script_is_validation_only_unless_apply_is_explicit() -> None:
  script = _script()

  assert "[switch]$Apply" in script
  assert "$missingQueues.Count -gt 0 -and -not $Apply" in script
  assert "Re-run with -Apply to create and configure them." in script
  assert "if ($Apply)" in script
  assert "purge-queue" not in script
  assert "delete-queue" not in script
  assert "start-message-move-task" not in script


def test_queue_lookup_only_treats_nonexistent_queue_as_missing() -> None:
  script = _script()
  lookup_function = script.split("function Get-AuraQueueUrl", maxsplit=1)[1].split(
    "function New-AuraQueue",
    maxsplit=1,
  )[0]

  assert "--output text 2> $stderrPath" in lookup_function
  assert 'if ($errorText -match "NonExistentQueue|QueueDoesNotExist")' in lookup_function
  assert "Failed to resolve SQS queue" in lookup_function
  assert "2>$null" not in lookup_function
  assert "$previousErrorActionPreference = $ErrorActionPreference" in lookup_function
  assert '$ErrorActionPreference = "Continue"' in lookup_function
  assert "$ErrorActionPreference = $previousErrorActionPreference" in lookup_function
  assert "$PSNativeCommandUseErrorActionPreference = $false" in lookup_function
  assert "Get-Content -LiteralPath $stderrPath -Raw" in lookup_function
  assert "Remove-Item -LiteralPath $stderrPath -Force" in lookup_function


def test_queue_script_requires_opt_in_before_restricting_existing_allow_all_dlq() -> None:
  script = _script()

  guard = script.index("-and -not $AllowRestrictExistingDlq")
  source_create = script.index("New-AuraQueue -Name $QueueName")
  first_mutation = script.index(
    "Set-AuraQueueAttributes -QueueUrl $dlqUrl -AttributesPath $dlqAttributesPath",
  )

  assert "[switch]$AllowRestrictExistingDlq" in script
  assert "$dlqWasCreated = $false" in script
  assert "$dlqWasCreated = $true" in script
  assert '$existingPermission = "allowAll"' in script
  assert "Refusing to replace that shared/default policy" in script
  assert guard < source_create < first_mutation


def test_queue_script_configures_and_verifies_redrive_contract() -> None:
  script = _script()

  assert "aws sqs set-queue-attributes" in script
  assert "RedrivePolicy = $redrivePolicy" in script
  assert 'maxReceiveCount = "$MaxReceiveCount"' in script
  assert 'redrivePermission = "byQueue"' in script
  assert "sourceQueueArns = @($allowedSourceArns)" in script
  assert "get-queue-attributes" in script
  assert "deadLetterTargetArn" in script
  assert "DLQ RedriveAllowPolicy does not include source queue" in script
  assert "Sort-Object -Unique -CaseSensitive" in script
  assert script.count("foreach ($requiredSourceArn") == 2
  assert "$requiredAllowedSourceArns = @($allowedSourceArns)" in script


def test_queue_script_never_reduces_retention_or_visibility() -> None:
  script = _script()

  assert "$dlqRetention = [Math]::Max(" in script
  assert "$sourceRetention = [Math]::Max(" in script
  assert "[int]$currentQueueAttributes.MessageRetentionPeriod" in script
  assert 'MessageRetentionPeriod = "$sourceRetention"' in script
  assert "$sourceVisibility = [Math]::Max(" in script
  assert "[int]$currentQueueAttributes.VisibilityTimeout" in script
  assert 'VisibilityTimeout = "$sourceVisibility"' in script
  assert "[int]$currentDlqAttributes.MessageRetentionPeriod" in script
  assert "[Math]::Max($DlqRetentionSeconds, $sourceRetention)" in script
  assert 'MessageRetentionPeriod = "$dlqRetention"' in script
  assert "$requiredDlqRetention = [Math]::Max(" in script
  assert "lower existing retention or visibility" in script
  assert "Assert-AuraMinimum" in script
  assert "$requiredVisibilityTimeout = $sourceVisibility" in script


def test_queue_script_allows_dlq_before_attaching_source_redrive_policy() -> None:
  script = _script()

  dlq_apply = script.index(
    "Set-AuraQueueAttributes -QueueUrl $dlqUrl -AttributesPath $dlqAttributesPath",
  )
  source_base_apply = script.index("-AttributesPath $sourceBaseAttributesPath")
  dlq_verify = script.index(
    "$verifiedDlqBeforeSource = Get-AuraQueueAttributes -QueueUrl $dlqUrl",
  )
  retention_verify = script.index(
    "[int]$verifiedDlqBeforeSource.MessageRetentionPeriod -ge $dlqRetention",
  )
  retention_ready_branch = script.rindex("if ($dlqRetentionReady)")
  source_protected_apply = script.index("-AttributesPath $sourceProtectedAttributesPath")
  source_base_block = script.split("$sourceBaseAttributes = ", maxsplit=1)[1].split(
    "$sourceProtectedAttributes = ",
    maxsplit=1,
  )[0]
  source_protected_block = script.split("$sourceProtectedAttributes = ", maxsplit=1)[1].split(
    "$dlqAttributes = ",
    maxsplit=1,
  )[0]

  assert dlq_apply < source_base_apply < dlq_verify
  assert dlq_verify < retention_verify < retention_ready_branch < source_protected_apply
  assert "$sourceBaseAttributes" in script
  assert "MessageRetentionPeriod" not in source_base_block
  assert 'MessageRetentionPeriod = "$sourceRetention"' in source_protected_block
  assert "RedrivePolicy = $redrivePolicy" in source_protected_block



def test_queue_script_reports_eventual_retention_propagation() -> None:
  script = _script()

  assert "$dlqAttemptLimit = 14" in script
  assert "$attemptLimit = 14" in script
  assert "propagation can take up to 15 minutes" in script
  assert "APPLIED_POLICY_VALIDATED_RETENTION_PENDING" in script
  assert 'Write-Output "RETENTION_STATUS=$retentionStatus"' in script
  assert '$mode = "PENDING_RETRY_REQUIRED"' in script
  assert '$sourceAttachmentStatus = "PENDING_DLQ_RETENTION"' in script
  assert 'Write-Output "SOURCE_ATTACHMENT_STATUS=$sourceAttachmentStatus"' in script
  assert 'Write-Output "RETRY_REQUIRED=$retryRequired"' in script
  assert "Source RedrivePolicy was not applied." in script
  assert "re-run with -Apply" in script


def test_queue_script_waits_after_fresh_queue_creation() -> None:
  script = _script()
  create_function = script.split("function New-AuraQueue", maxsplit=1)[1].split(
    "function Get-AuraQueueAttributes",
    maxsplit=1,
  )[0]
  assert "Start-Sleep -Seconds 1" in create_function
