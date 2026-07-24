import asyncio
import json

import httpx
import pytest

from app.core.settings import Settings
from app.services.ecs_task_protection import (
  ECSTaskProtectionError,
  ECSTaskScaleInProtector,
)
from app.workers.ai_job_worker import SQSAIJobWorker
from app.workers.job_dispatcher import (
  AIJobHandlerNotImplementedError,
  ParsedAIJobMessage,
)


QUEUE_URL = "https://sqs.ap-northeast-2.amazonaws.com/123456789012/aura-ai-jobs"


def _message(index: int = 1) -> dict:
  return {
    "MessageId": f"message-{index}",
    "ReceiptHandle": f"receipt-{index}",
    "Body": json.dumps(
      {
        "version": 1,
        "jobType": "analysis",
        "jobId": f"11111111-1111-1111-1111-{index:012d}",
        "userId": "22222222-2222-2222-2222-222222222222",
      },
    ),
  }


class RecordingSQSClient:
  def __init__(
    self,
    events: list[str],
    messages: list[dict],
    *,
    stop_event: asyncio.Event | None = None,
  ) -> None:
    self.events = events
    self.messages = messages
    self.stop_event = stop_event
    self.deleted: list[dict] = []

  def receive_message(self, **_kwargs):
    self.events.append("receive")
    if self.stop_event is not None:
      self.stop_event.set()
    return {"Messages": self.messages}

  def delete_message(self, **kwargs):
    message_id = kwargs["ReceiptHandle"].replace("receipt", "message")
    self.events.append(f"delete:{message_id}")
    self.deleted.append(kwargs)
    return {}


class RecordingDispatcher:
  def __init__(
    self,
    events: list[str],
    *,
    fail: bool = False,
    stop_event: asyncio.Event | None = None,
  ) -> None:
    self.events = events
    self.fail = fail
    self.stop_event = stop_event
    self.messages: list[ParsedAIJobMessage] = []

  async def dispatch(self, message: ParsedAIJobMessage) -> None:
    index = str(message.job_id).split("-")[-1]
    self.events.append(f"dispatch:{int(index)}")
    self.messages.append(message)
    if self.stop_event is not None:
      self.stop_event.set()
    if self.fail:
      raise AIJobHandlerNotImplementedError("not wired")


class RecordingTaskProtector:
  def __init__(
    self,
    events: list[str],
    *,
    enabled: bool = True,
    enable_error: Exception | None = None,
    disable_error: Exception | None = None,
  ) -> None:
    self.events = events
    self.enabled = enabled
    self.enable_error = enable_error
    self.disable_error = disable_error

  async def enable(self) -> bool:
    self.events.append("protect:on")
    if self.enable_error is not None:
      raise self.enable_error
    return self.enabled

  async def disable(self) -> None:
    self.events.append("protect:off")
    if self.disable_error is not None:
      raise self.disable_error


def _worker(
  *,
  sqs_client: RecordingSQSClient,
  dispatcher: RecordingDispatcher,
  task_protector: RecordingTaskProtector,
  max_messages: int = 1,
) -> SQSAIJobWorker:
  return SQSAIJobWorker(
    Settings(sqs_ai_job_queue_url=QUEUE_URL),
    db=object(),
    client=sqs_client,
    dispatcher=dispatcher,
    task_protector=task_protector,
    max_messages=max_messages,
  )


@pytest.mark.asyncio
async def test_worker_protects_task_until_successful_message_deletion() -> None:
  events: list[str] = []
  sqs_client = RecordingSQSClient(events, [_message()])
  dispatcher = RecordingDispatcher(events)
  task_protector = RecordingTaskProtector(events)
  worker = _worker(
    sqs_client=sqs_client,
    dispatcher=dispatcher,
    task_protector=task_protector,
  )

  received = await worker.poll_once()

  assert received == 1
  assert events == [
    "receive",
    "protect:on",
    "dispatch:1",
    "delete:message-1",
    "protect:off",
  ]


@pytest.mark.asyncio
async def test_worker_releases_protection_after_dispatch_failure() -> None:
  events: list[str] = []
  sqs_client = RecordingSQSClient(events, [_message()])
  worker = _worker(
    sqs_client=sqs_client,
    dispatcher=RecordingDispatcher(events, fail=True),
    task_protector=RecordingTaskProtector(events),
  )

  received = await worker.poll_once()

  assert received == 1
  assert sqs_client.deleted == []
  assert events == [
    "receive",
    "protect:on",
    "dispatch:1",
    "protect:off",
  ]


@pytest.mark.asyncio
async def test_worker_fails_closed_before_ai_when_protection_cannot_start() -> None:
  events: list[str] = []
  sqs_client = RecordingSQSClient(events, [_message()])
  worker = _worker(
    sqs_client=sqs_client,
    dispatcher=RecordingDispatcher(events),
    task_protector=RecordingTaskProtector(
      events,
      enable_error=ECSTaskProtectionError("denied"),
    ),
  )

  with pytest.raises(ECSTaskProtectionError, match="denied"):
    await worker.poll_once()

  assert sqs_client.deleted == []
  assert events == ["receive", "protect:on"]


@pytest.mark.asyncio
async def test_worker_exits_after_disable_failure_without_reprocessing() -> None:
  events: list[str] = []
  sqs_client = RecordingSQSClient(events, [_message()])
  worker = _worker(
    sqs_client=sqs_client,
    dispatcher=RecordingDispatcher(events),
    task_protector=RecordingTaskProtector(
      events,
      disable_error=ECSTaskProtectionError("disable failed"),
    ),
  )

  with pytest.raises(ECSTaskProtectionError, match="disable failed"):
    await worker.poll_once()

  assert len(sqs_client.deleted) == 1
  assert events[-1] == "protect:off"


@pytest.mark.asyncio
async def test_worker_protects_an_entire_received_batch_once() -> None:
  events: list[str] = []
  messages = [_message(1), _message(2)]
  sqs_client = RecordingSQSClient(events, messages)
  worker = _worker(
    sqs_client=sqs_client,
    dispatcher=RecordingDispatcher(events),
    task_protector=RecordingTaskProtector(events),
    max_messages=2,
  )

  received = await worker.poll_once()

  assert received == 2
  assert events == [
    "receive",
    "protect:on",
    "dispatch:1",
    "delete:message-1",
    "dispatch:2",
    "delete:message-2",
    "protect:off",
  ]


@pytest.mark.asyncio
async def test_worker_does_not_start_ai_after_shutdown_during_receive() -> None:
  events: list[str] = []
  stop_event = asyncio.Event()
  sqs_client = RecordingSQSClient(events, [_message()], stop_event=stop_event)
  worker = _worker(
    sqs_client=sqs_client,
    dispatcher=RecordingDispatcher(events),
    task_protector=RecordingTaskProtector(events),
  )

  received = await worker.poll_once(stop_event)

  assert received == 1
  assert sqs_client.deleted == []
  assert events == ["receive"]


@pytest.mark.asyncio
async def test_worker_finishes_current_message_then_stops_batch() -> None:
  events: list[str] = []
  stop_event = asyncio.Event()
  sqs_client = RecordingSQSClient(events, [_message(1), _message(2)])
  worker = _worker(
    sqs_client=sqs_client,
    dispatcher=RecordingDispatcher(events, stop_event=stop_event),
    task_protector=RecordingTaskProtector(events),
    max_messages=2,
  )

  received = await worker.poll_once(stop_event)

  assert received == 2
  assert events == [
    "receive",
    "protect:on",
    "dispatch:1",
    "delete:message-1",
    "protect:off",
  ]


@pytest.mark.asyncio
async def test_task_protector_skips_outside_ecs() -> None:
  protector = ECSTaskScaleInProtector(agent_uri="", ecs_runtime=False)

  assert await protector.enable() is False
  await protector.disable()


def test_task_protector_fails_closed_when_agent_uri_is_missing_in_ecs() -> None:
  with pytest.raises(ECSTaskProtectionError, match="ECS_AGENT_URI"):
    ECSTaskScaleInProtector(
      agent_uri="",
      ecs_runtime=True,
    )


@pytest.mark.asyncio
async def test_task_protector_sends_verified_enable_and_disable_requests() -> None:
  request_bodies: list[dict] = []

  def handler(request: httpx.Request) -> httpx.Response:
    body = json.loads(request.content)
    request_bodies.append(body)
    return httpx.Response(
      200,
      json={
        "protection": {
          "ProtectionEnabled": body["ProtectionEnabled"],
        },
      },
    )

  async with httpx.AsyncClient(
    transport=httpx.MockTransport(handler),
    trust_env=False,
    follow_redirects=False,
  ) as client:
    protector = ECSTaskScaleInProtector(
      agent_uri="http://169.254.170.2/v4/example",
      ecs_runtime=True,
      expiry_minutes=30,
      client=client,
    )
    assert await protector.enable() is True
    await protector.disable()

  assert request_bodies == [
    {
      "ProtectionEnabled": True,
      "ExpiresInMinutes": 30,
    },
    {
      "ProtectionEnabled": False,
    },
  ]


@pytest.mark.asyncio
async def test_worker_does_not_protect_an_empty_receive() -> None:
  events: list[str] = []
  worker = _worker(
    sqs_client=RecordingSQSClient(events, []),
    dispatcher=RecordingDispatcher(events),
    task_protector=RecordingTaskProtector(events),
  )

  received = await worker.poll_once()

  assert received == 0
  assert events == ["receive"]


@pytest.mark.asyncio
async def test_worker_releases_protection_when_shutdown_arrives_after_enable() -> None:
  events: list[str] = []
  stop_event = asyncio.Event()

  class StopOnEnableProtector(RecordingTaskProtector):
    async def enable(self) -> bool:
      result = await super().enable()
      stop_event.set()
      return result

  worker = _worker(
    sqs_client=RecordingSQSClient(events, [_message()]),
    dispatcher=RecordingDispatcher(events),
    task_protector=StopOnEnableProtector(events),
  )

  received = await worker.poll_once(stop_event)

  assert received == 1
  assert events == ["receive", "protect:on", "protect:off"]


@pytest.mark.asyncio
async def test_task_protector_retries_transient_agent_failures() -> None:
  attempts: list[int] = []
  statuses = [500, 429, 200]

  def handler(request: httpx.Request) -> httpx.Response:
    status = statuses[len(attempts)]
    attempts.append(status)
    if status == 200:
      return httpx.Response(
        200,
        json={"protection": {"ProtectionEnabled": True}},
      )
    return httpx.Response(status, json={"error": "temporary"})

  async with httpx.AsyncClient(
    transport=httpx.MockTransport(handler),
    trust_env=False,
    follow_redirects=False,
  ) as client:
    protector = ECSTaskScaleInProtector(
      agent_uri="http://169.254.170.2/v4/example",
      client=client,
      max_attempts=3,
      retry_delay_seconds=0,
    )

    assert await protector.enable() is True

  assert attempts == [500, 429, 200]


@pytest.mark.asyncio
async def test_task_protector_does_not_retry_a_permanent_agent_failure() -> None:
  attempts = 0

  def handler(_request: httpx.Request) -> httpx.Response:
    nonlocal attempts
    attempts += 1
    return httpx.Response(400, json={"error": "invalid request"})

  async with httpx.AsyncClient(
    transport=httpx.MockTransport(handler),
    trust_env=False,
    follow_redirects=False,
  ) as client:
    protector = ECSTaskScaleInProtector(
      agent_uri="http://169.254.170.2/v4/example",
      client=client,
      max_attempts=3,
      retry_delay_seconds=0,
    )

    with pytest.raises(ECSTaskProtectionError, match="HTTP 400"):
      await protector.enable()

  assert attempts == 1


@pytest.mark.asyncio
async def test_task_protector_rejects_an_unconfirmed_state() -> None:
  def handler(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(
      200,
      json={"protection": {"ProtectionEnabled": False}},
    )

  async with httpx.AsyncClient(
    transport=httpx.MockTransport(handler),
    trust_env=False,
    follow_redirects=False,
  ) as client:
    protector = ECSTaskScaleInProtector(
      agent_uri="http://169.254.170.2/v4/example",
      client=client,
    )

    with pytest.raises(ECSTaskProtectionError, match="did not confirm"):
      await protector.enable()


@pytest.mark.asyncio
async def test_task_protector_rejects_invalid_json() -> None:
  def handler(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, text="not-json")

  async with httpx.AsyncClient(
    transport=httpx.MockTransport(handler),
    trust_env=False,
    follow_redirects=False,
  ) as client:
    protector = ECSTaskScaleInProtector(
      agent_uri="http://169.254.170.2/v4/example",
      client=client,
    )

    with pytest.raises(ECSTaskProtectionError, match="invalid JSON"):
      await protector.enable()


@pytest.mark.asyncio
async def test_task_protector_rejects_a_failure_payload() -> None:
  def handler(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(
      200,
      json={"failure": {"reason": "not protected"}},
    )

  async with httpx.AsyncClient(
    transport=httpx.MockTransport(handler),
    trust_env=False,
    follow_redirects=False,
  ) as client:
    protector = ECSTaskScaleInProtector(
      agent_uri="http://169.254.170.2/v4/example",
      client=client,
    )

    with pytest.raises(ECSTaskProtectionError, match="failure payload"):
      await protector.enable()
