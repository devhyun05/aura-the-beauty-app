from datetime import datetime, timedelta, timezone

import pytest

from app.api.beard import _advance_job, _map_beard_job
from app.core.errors import AppError
from app.core.settings import Settings
from app.services.beard_lambda import BeardLambdaClient


class _FakeDatabase:
  def __init__(self, responses: list[dict]) -> None:
    self._responses = list(responses)
    self.calls: list[tuple] = []

  async def fetchrow(self, query: str, *args):
    self.calls.append((query, args))

    return self._responses.pop(0)


class _FakeBeardLambdaClient:
  def __init__(self, *, simulate_response=None, result_response=None) -> None:
    self._simulate_response = simulate_response
    self._result_response = result_response
    self.simulate_calls: list[tuple] = []
    self.result_calls: list[tuple] = []

  async def simulate(self, input_key, output_key=None):
    self.simulate_calls.append((input_key, output_key))

    return self._simulate_response

  async def result(self, command_id, output_key):
    self.result_calls.append((command_id, output_key))

    return self._result_response


def _job_row(**overrides) -> dict:
  row = {
    "id": "11111111-1111-1111-1111-111111111111",
    "user_id": "22222222-2222-2222-2222-222222222222",
    "status": "pending",
    "path": "photo",
    "input_key": "uploads/beard/in.jpg",
    "output_key": None,
    "flux_command_id": None,
    "instance_state": None,
    "result_url": None,
    "error_message": None,
    "error_details": {},
    "survey_payload": {},
    "attempt_count": 0,
    "created_at": datetime.now(timezone.utc),
    "updated_at": datetime.now(timezone.utc),
  }
  row.update(overrides)

  return row


@pytest.mark.asyncio
async def test_beard_lambda_not_configured_when_function_url_unset() -> None:
  with pytest.raises(AppError) as exc_info:
    await BeardLambdaClient(Settings()).simulate("uploads/beard/in.jpg")

  assert exc_info.value.status_code == 503
  assert exc_info.value.code == "BEARD_LAMBDA_NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_advance_job_pending_transitions_to_processing() -> None:
  job = _job_row(status="pending")
  next_row = _job_row(status="processing", flux_command_id="cmd-1", output_key="out.jpg")
  db = _FakeDatabase([next_row])
  client = _FakeBeardLambdaClient(
    simulate_response={"status": "processing", "commandId": "cmd-1", "outputKey": "out.jpg"},
  )

  advanced = await _advance_job(client, db, job)

  assert advanced["status"] == "processing"
  assert client.simulate_calls == [("uploads/beard/in.jpg", None)]
  # commandId and outputKey are persisted in that positional order.
  assert db.calls[0][1][1] == "cmd-1"
  assert db.calls[0][1][2] == "out.jpg"


@pytest.mark.asyncio
async def test_advance_job_pending_stays_pending_while_warming() -> None:
  job = _job_row(status="pending")
  next_row = _job_row(status="pending", instance_state="Pending")
  db = _FakeDatabase([next_row])
  client = _FakeBeardLambdaClient(
    simulate_response={"status": "warming", "instanceState": "Pending"},
  )

  advanced = await _advance_job(client, db, job)

  assert advanced["status"] == "pending"
  assert advanced["instance_state"] == "Pending"
  assert client.simulate_calls == [("uploads/beard/in.jpg", None)]


@pytest.mark.asyncio
async def test_advance_job_processing_completes_on_ssm_success() -> None:
  job = _job_row(status="processing", flux_command_id="cmd-1", output_key="out.jpg")
  next_row = _job_row(status="completed", result_url="https://cdn.example.com/out.jpg")
  db = _FakeDatabase([next_row])
  client = _FakeBeardLambdaClient(
    result_response={"status": "Success", "resultUrl": "https://cdn.example.com/out.jpg"},
  )

  advanced = await _advance_job(client, db, job)

  assert advanced["status"] == "completed"
  assert advanced["result_url"] == "https://cdn.example.com/out.jpg"
  assert client.result_calls == [("cmd-1", "out.jpg")]


@pytest.mark.asyncio
async def test_advance_job_processing_fails_on_ssm_failure() -> None:
  job = _job_row(status="processing", flux_command_id="cmd-1", output_key="out.jpg")
  next_row = _job_row(status="failed", error_message="boom")
  db = _FakeDatabase([next_row])
  client = _FakeBeardLambdaClient(
    result_response={"status": "Failed", "errorMessage": "boom"},
  )

  advanced = await _advance_job(client, db, job)

  assert advanced["status"] == "failed"
  assert advanced["error_message"] == "boom"


@pytest.mark.asyncio
async def test_advance_job_stall_timeout_forces_failure_without_calling_lambda() -> None:
  stale_created_at = datetime.now(timezone.utc) - timedelta(minutes=7)
  job = _job_row(status="pending", created_at=stale_created_at)
  failed_row = _job_row(status="failed", error_message="BEARD_JOB_TIMEOUT")
  db = _FakeDatabase([failed_row])
  client = _FakeBeardLambdaClient(simulate_response={"status": "processing"})

  advanced = await _advance_job(client, db, job)

  assert advanced["status"] == "failed"
  assert advanced["error_message"] == "BEARD_JOB_TIMEOUT"
  # The stall guard must not hit the Lambda.
  assert client.simulate_calls == []
  # The forced-failure message is persisted.
  assert db.calls[0][1][1] == "BEARD_JOB_TIMEOUT"


@pytest.mark.asyncio
async def test_advance_job_terminal_status_is_noop() -> None:
  job = _job_row(status="completed", result_url="https://cdn.example.com/out.jpg")
  db = _FakeDatabase([])
  client = _FakeBeardLambdaClient()

  advanced = await _advance_job(client, db, job)

  assert advanced is job
  assert client.simulate_calls == []
  assert client.result_calls == []
  assert db.calls == []


def test_map_beard_job_drops_server_only_fields() -> None:
  row = _job_row(status="processing", flux_command_id="cmd-secret")
  row["error_details"] = {"trace": "secret"}

  mapped = _map_beard_job(row)

  assert set(mapped.keys()) == {
    "id",
    "status",
    "path",
    "instanceState",
    "resultUrl",
    "errorMessage",
    "createdAt",
    "updatedAt",
  }
  assert "flux_command_id" not in mapped
  assert "fluxCommandId" not in mapped
  assert "error_details" not in mapped
