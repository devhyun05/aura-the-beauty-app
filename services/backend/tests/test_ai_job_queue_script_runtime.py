from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = PROJECT_ROOT / "scripts/aws/configure_ai_job_queue.ps1"
ACCOUNT_ID = "123456789012"
REGION = "ap-northeast-2"
SOURCE_NAME = "aura-ai-jobs-test"
DLQ_NAME = "aura-ai-jobs-dlq-test"

pytestmark = pytest.mark.skipif(
  os.name != "nt" or shutil.which("powershell") is None,
  reason="PowerShell runtime contract test runs on Windows.",
)


def _queue_url(name: str) -> str:
  return f"https://sqs.{REGION}.amazonaws.com/{ACCOUNT_ID}/{name}"


def _queue_arn(name: str) -> str:
  return f"arn:aws:sqs:{REGION}:{ACCOUNT_ID}:{name}"


def _queue(
  name: str,
  *,
  retention: int = 345600,
  allow_policy: dict | None = None,
  redrive_policy: dict | None = None,
) -> dict:
  attributes = {
    "QueueArn": _queue_arn(name),
    "VisibilityTimeout": "900",
    "MessageRetentionPeriod": str(retention),
    "ReceiveMessageWaitTimeSeconds": "20",
    "ApproximateNumberOfMessages": "0",
    "ApproximateNumberOfMessagesNotVisible": "0",
  }
  if allow_policy is not None:
    attributes["RedriveAllowPolicy"] = json.dumps(
      allow_policy,
      separators=(",", ":"),
    )
  if redrive_policy is not None:
    attributes["RedrivePolicy"] = json.dumps(
      redrive_policy,
      separators=(",", ":"),
    )
  return {
    "url": _queue_url(name),
    "attributes": attributes,
  }


def _write_fake_aws(tmp_path: Path) -> Path:
  fake_path = tmp_path / "fake_aws.py"
  fake_path.write_text(
    """
import json
import os
import sys
from pathlib import Path

args = sys.argv[1:]
state_path = Path(os.environ["AURA_FAKE_AWS_STATE"])
state = json.loads(state_path.read_text(encoding="utf-8"))
call = {"args": args}
state.setdefault("calls", []).append(call)


def value(flag):
  return args[args.index(flag) + 1]


def save_and_exit(code=0):
  state_path.write_text(json.dumps(state), encoding="utf-8")
  raise SystemExit(code)


if args[:2] == ["sts", "get-caller-identity"]:
  print(state["accountId"])
  save_and_exit()

if args[:2] == ["sqs", "get-queue-url"]:
  name = value("--queue-name")
  queue = state["queues"].get(name)
  if queue is None:
    print(
      "An error occurred (AWS.SimpleQueueService.NonExistentQueue) "
      "when calling the GetQueueUrl operation: queue does not exist",
      file=sys.stderr,
    )
    save_and_exit(255)
  print(queue["url"])
  save_and_exit()

if args[:2] == ["sqs", "create-queue"]:
  name = value("--queue-name")
  queue = state["queues"].setdefault(
    name,
    {
      "url": f"https://sqs.{state['region']}.amazonaws.com/{state['accountId']}/{name}",
      "attributes": {
        "QueueArn": (
          f"arn:aws:sqs:{state['region']}:{state['accountId']}:{name}"
        ),
        "VisibilityTimeout": "30",
        "MessageRetentionPeriod": "345600",
        "ReceiveMessageWaitTimeSeconds": "0",
      },
    },
  )
  call["createdQueue"] = name
  print(queue["url"])
  save_and_exit()

if args[:2] == ["sqs", "get-queue-attributes"]:
  url = value("--queue-url")
  queue = next(
    queue for queue in state["queues"].values() if queue["url"] == url
  )
  print(json.dumps(queue["attributes"]))
  save_and_exit()

if args[:2] == ["sqs", "set-queue-attributes"]:
  url = value("--queue-url")
  queue_name, queue = next(
    (name, queue)
    for name, queue in state["queues"].items()
    if queue["url"] == url
  )
  attributes_path = value("--attributes").removeprefix("file://")
  requested = json.loads(Path(attributes_path).read_text(encoding="utf-8"))
  applied = dict(requested)
  if (
    queue_name == state["dlqName"]
    and not state["propagateDlqRetention"]
  ):
    applied.pop("MessageRetentionPeriod", None)
  queue["attributes"].update(applied)
  call.update(
    {
      "queueUrl": url,
      "requestedAttributes": requested,
      "appliedAttributes": applied,
    }
  )
  save_and_exit()

print(f"unsupported fake aws call: {args}", file=sys.stderr)
save_and_exit(2)
""".strip()
    + "\n",
    encoding="utf-8",
  )
  cmd_path = tmp_path / "aws.cmd"
  cmd_path.write_text(
    f'@"{sys.executable}" "{fake_path}" %*\n',
    encoding="utf-8",
  )
  return cmd_path


def _run_apply(tmp_path: Path, state: dict) -> tuple[subprocess.CompletedProcess, dict]:
  _write_fake_aws(tmp_path)
  state_path = tmp_path / "state.json"
  state_path.write_text(json.dumps(state), encoding="utf-8")
  harness_path = tmp_path / "run_queue_script.ps1"
  harness_path.write_text(
    """
function global:Start-Sleep {
  param([int]$Seconds)
}
& $env:AURA_QUEUE_SCRIPT `
  -Profile fake `
  -Region $env:AURA_REGION `
  -QueueName $env:AURA_SOURCE_NAME `
  -DlqQueueName $env:AURA_DLQ_NAME `
  -MessageRetentionSeconds 600000 `
  -DlqRetentionSeconds 1209600 `
  -Apply
""".strip()
    + "\n",
    encoding="utf-8",
  )
  env = os.environ.copy()
  env.update(
    {
      "PATH": f"{tmp_path}{os.pathsep}{env['PATH']}",
      "AURA_FAKE_AWS_STATE": str(state_path),
      "AURA_QUEUE_SCRIPT": str(SCRIPT_PATH),
      "AURA_REGION": REGION,
      "AURA_SOURCE_NAME": SOURCE_NAME,
      "AURA_DLQ_NAME": DLQ_NAME,
    }
  )
  result = subprocess.run(
    [
      "powershell",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      str(harness_path),
    ],
    cwd=PROJECT_ROOT,
    env=env,
    capture_output=True,
    text=True,
    timeout=30,
    check=False,
  )
  return result, json.loads(state_path.read_text(encoding="utf-8"))


def _state(*, propagate_retention: bool, include_source: bool = True) -> dict:
  source_arn = _queue_arn(SOURCE_NAME)
  queues = {
    DLQ_NAME: _queue(
      DLQ_NAME,
      allow_policy={
        "redrivePermission": "byQueue",
        "sourceQueueArns": [source_arn],
      },
    ),
  }
  if include_source:
    queues[SOURCE_NAME] = _queue(
      SOURCE_NAME,
      redrive_policy={
        "deadLetterTargetArn": _queue_arn(DLQ_NAME),
        "maxReceiveCount": "9",
      },
    )
  return {
    "accountId": ACCOUNT_ID,
    "region": REGION,
    "dlqName": DLQ_NAME,
    "propagateDlqRetention": propagate_retention,
    "queues": queues,
    "calls": [],
  }


def _mutating_calls(state: dict) -> list[dict]:
  return [
    call
    for call in state["calls"]
    if call["args"][:2] in (
      ["sqs", "create-queue"],
      ["sqs", "set-queue-attributes"],
    )
  ]


def test_existing_allow_all_dlq_refuses_before_source_creation(tmp_path: Path) -> None:
  state = _state(propagate_retention=True, include_source=False)
  state["queues"][DLQ_NAME]["attributes"].pop("RedriveAllowPolicy")

  result, final_state = _run_apply(tmp_path, state)

  assert result.returncode != 0
  assert "Refusing to replace that shared/default policy" in result.stderr
  assert _mutating_calls(final_state) == []
  assert SOURCE_NAME not in final_state["queues"]


def test_pending_dlq_retention_leaves_source_retention_and_redrive_untouched(
  tmp_path: Path,
) -> None:
  state = _state(propagate_retention=False)
  original_source = json.loads(json.dumps(state["queues"][SOURCE_NAME]["attributes"]))

  result, final_state = _run_apply(tmp_path, state)

  assert result.returncode != 0
  assert "RETRY_REQUIRED=1" in result.stdout
  source_attributes = final_state["queues"][SOURCE_NAME]["attributes"]
  assert source_attributes["MessageRetentionPeriod"] == original_source[
    "MessageRetentionPeriod"
  ]
  assert source_attributes["RedrivePolicy"] == original_source["RedrivePolicy"]
  source_sets = [
    call
    for call in _mutating_calls(final_state)
    if call.get("queueUrl") == _queue_url(SOURCE_NAME)
  ]
  assert len(source_sets) == 1
  assert "MessageRetentionPeriod" not in source_sets[0]["requestedAttributes"]
  assert "RedrivePolicy" not in source_sets[0]["requestedAttributes"]


def test_ready_dlq_retention_applies_source_retention_and_redrive(tmp_path: Path) -> None:
  state = _state(propagate_retention=True)

  result, final_state = _run_apply(tmp_path, state)

  assert result.returncode == 0, result.stderr
  assert "RETRY_REQUIRED=0" in result.stdout
  source_attributes = final_state["queues"][SOURCE_NAME]["attributes"]
  assert source_attributes["MessageRetentionPeriod"] == "600000"
  redrive = json.loads(source_attributes["RedrivePolicy"])
  assert redrive == {
    "deadLetterTargetArn": _queue_arn(DLQ_NAME),
    "maxReceiveCount": "3",
  }


def test_existing_by_queue_sources_are_preserved_case_sensitively(tmp_path: Path) -> None:
  state = _state(propagate_retention=True)
  other_upper = _queue_arn("SharedSource")
  other_lower = _queue_arn("sharedsource")
  state["queues"][DLQ_NAME]["attributes"]["RedriveAllowPolicy"] = json.dumps(
    {
      "redrivePermission": "byQueue",
      "sourceQueueArns": [_queue_arn(SOURCE_NAME), other_upper, other_lower],
    },
    separators=(",", ":"),
  )

  result, final_state = _run_apply(tmp_path, state)

  assert result.returncode == 0, result.stderr
  dlq_attributes = final_state["queues"][DLQ_NAME]["attributes"]
  allow_policy = json.loads(dlq_attributes["RedriveAllowPolicy"])
  assert set(allow_policy["sourceQueueArns"]) == {
    _queue_arn(SOURCE_NAME),
    other_upper,
    other_lower,
  }
