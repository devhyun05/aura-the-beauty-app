import asyncio
import json
from uuid import UUID

import pytest

from app.core.errors import AppError
from app.core.settings import Settings
from app.workers.ai_job_worker import SQSAIJobWorker
from app.workers.job_dispatcher import (
  AIJobDispatcher,
  AIJobHandlerNotImplementedError,
  AIJobMessageParseError,
  ParsedAIJobMessage,
  parse_ai_job_message,
)


REPORT_ID = UUID("11111111-1111-1111-1111-111111111111")
USER_ID = UUID("22222222-2222-2222-2222-222222222222")
PHOTO_CAPTURE_ID = UUID("33333333-3333-3333-3333-333333333333")
SOURCE_MEDIA_ID = UUID("44444444-4444-4444-4444-444444444444")
PREVIEW_MEDIA_ID = UUID("55555555-5555-5555-5555-555555555555")
QUEUE_URL = "https://sqs.ap-northeast-2.amazonaws.com/123456789012/aura-ai-jobs"


def _message_body(**overrides) -> str:
  body = {
    "version": 1,
    "jobType": "analysis",
    "jobId": str(REPORT_ID),
    "userId": str(USER_ID),
  }
  body.update(overrides)
  return json.dumps(body)


def _analysis_report_row(**overrides) -> dict:
  row = {
    "id": REPORT_ID,
    "user_id": USER_ID,
    "photo_capture_id": PHOTO_CAPTURE_ID,
    "source_media_id": SOURCE_MEDIA_ID,
    "preview_media_id": PREVIEW_MEDIA_ID,
    "status": "pending",
    "title": "AI makeup analysis",
    "report_title": "Daily face diagnosis",
    "environment_label": "window light",
    "detail_payload": json.dumps({"request": {"source": "worker-test"}}),
  }
  row.update(overrides)
  return row


def test_parse_ai_job_message_accepts_analysis_payload() -> None:
  message = parse_ai_job_message(_message_body())

  assert message.version == 1
  assert message.job_type == "analysis"
  assert message.job_id == REPORT_ID
  assert message.user_id == USER_ID


@pytest.mark.parametrize(
  "body",
  [
    "not-json",
    "[]",
    _message_body(version=2),
    _message_body(jobType=""),
    _message_body(jobId="not-a-uuid"),
    _message_body(userId="not-a-uuid"),
  ],
)
def test_parse_ai_job_message_rejects_invalid_payloads(body: str) -> None:
  with pytest.raises(AIJobMessageParseError):
    parse_ai_job_message(body)


class FakeAnalysisDB:
  def __init__(self, row: dict | None) -> None:
    self.row = row
    self.fetchrow_calls: list[tuple] = []

  async def fetchrow(self, query: str, *args):
    self.fetchrow_calls.append((query, *args))
    return self.row


@pytest.mark.asyncio
async def test_dispatcher_analysis_handler_runs_analysis_job(monkeypatch: pytest.MonkeyPatch) -> None:
  calls: dict[str, object] = {}

  async def fake_run_analysis_job_background(report_id, payload, settings, *, db):
    calls["report_id"] = report_id
    calls["payload"] = payload
    calls["settings"] = settings
    calls["db"] = db

  monkeypatch.setattr(
    "app.workers.job_dispatcher.run_analysis_job_background",
    fake_run_analysis_job_background,
  )
  fake_db = FakeAnalysisDB(_analysis_report_row())
  settings = Settings()
  dispatcher = AIJobDispatcher(settings, db=fake_db)

  await dispatcher.dispatch(parse_ai_job_message(_message_body()))

  payload = calls["payload"]

  assert fake_db.fetchrow_calls[0][1:] == (REPORT_ID, USER_ID)
  assert calls["report_id"] == REPORT_ID
  assert calls["settings"] is settings
  assert calls["db"] is fake_db
  assert payload.photo_capture_id == PHOTO_CAPTURE_ID
  assert payload.source_media_id == SOURCE_MEDIA_ID
  assert payload.preview_media_id == PREVIEW_MEDIA_ID
  assert payload.report_title == "Daily face diagnosis"
  assert payload.environment_label == "window light"
  assert payload.request_payload == {"source": "worker-test"}


@pytest.mark.asyncio
async def test_dispatcher_skips_terminal_analysis_jobs(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_run_analysis_job_background(*_args, **_kwargs):
    raise AssertionError("terminal jobs should not be rerun")

  monkeypatch.setattr(
    "app.workers.job_dispatcher.run_analysis_job_background",
    fake_run_analysis_job_background,
  )
  dispatcher = AIJobDispatcher(Settings(), db=FakeAnalysisDB(_analysis_report_row(status="completed")))

  await dispatcher.dispatch(parse_ai_job_message(_message_body()))


@pytest.mark.asyncio
async def test_dispatcher_skips_missing_analysis_jobs(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_run_analysis_job_background(*_args, **_kwargs):
    raise AssertionError("missing jobs should not be run")

  monkeypatch.setattr(
    "app.workers.job_dispatcher.run_analysis_job_background",
    fake_run_analysis_job_background,
  )
  dispatcher = AIJobDispatcher(Settings(), db=FakeAnalysisDB(None))

  await dispatcher.dispatch(parse_ai_job_message(_message_body()))


class FakeSQSClient:
  def __init__(self, messages: list[dict] | None = None) -> None:
    self.messages = messages or []
    self.receive_message_kwargs: dict | None = None
    self.deleted: list[dict] = []

  def receive_message(self, **kwargs):
    self.receive_message_kwargs = kwargs
    return {"Messages": self.messages}

  def delete_message(self, **kwargs):
    self.deleted.append(kwargs)
    return {}


class SuccessDispatcher:
  def __init__(self) -> None:
    self.messages: list[ParsedAIJobMessage] = []

  async def dispatch(self, message: ParsedAIJobMessage) -> None:
    self.messages.append(message)


class FailingDispatcher:
  async def dispatch(self, _message: ParsedAIJobMessage) -> None:
    raise AIJobHandlerNotImplementedError("not wired")


@pytest.mark.asyncio
async def test_worker_poll_once_receives_with_long_polling_options() -> None:
  sqs_client = FakeSQSClient()
  worker = SQSAIJobWorker(
    Settings(sqs_ai_job_queue_url=QUEUE_URL),
    db=object(),
    client=sqs_client,
    dispatcher=SuccessDispatcher(),
    max_messages=1,
    wait_time_seconds=20,
    visibility_timeout_seconds=900,
  )

  received = await worker.poll_once()

  assert received == 0
  assert sqs_client.receive_message_kwargs == {
    "QueueUrl": QUEUE_URL,
    "MaxNumberOfMessages": 1,
    "WaitTimeSeconds": 20,
    "VisibilityTimeout": 900,
    "MessageAttributeNames": ["All"],
    "AttributeNames": ["ApproximateReceiveCount"],
  }


@pytest.mark.asyncio
async def test_worker_deletes_message_after_successful_dispatch() -> None:
  sqs_client = FakeSQSClient(
    [
      {
        "MessageId": "msg-123",
        "ReceiptHandle": "receipt-123",
        "Body": _message_body(),
      },
    ],
  )
  dispatcher = SuccessDispatcher()
  worker = SQSAIJobWorker(
    Settings(sqs_ai_job_queue_url=QUEUE_URL),
    db=object(),
    client=sqs_client,
    dispatcher=dispatcher,
  )

  received = await worker.poll_once()

  assert received == 1
  assert dispatcher.messages[0].job_id == REPORT_ID
  assert sqs_client.deleted == [
    {
      "QueueUrl": QUEUE_URL,
      "ReceiptHandle": "receipt-123",
    },
  ]


@pytest.mark.asyncio
async def test_worker_keeps_message_when_dispatch_fails() -> None:
  sqs_client = FakeSQSClient(
    [
      {
        "MessageId": "msg-123",
        "ReceiptHandle": "receipt-123",
        "Body": _message_body(),
      },
    ],
  )
  worker = SQSAIJobWorker(
    Settings(sqs_ai_job_queue_url=QUEUE_URL),
    db=object(),
    client=sqs_client,
    dispatcher=FailingDispatcher(),
  )

  received = await worker.poll_once()

  assert received == 1
  assert sqs_client.deleted == []


@pytest.mark.asyncio
async def test_worker_finishes_current_poll_then_stops_after_shutdown_request() -> None:
  stop_event = asyncio.Event()

  class StopAfterCurrentPollWorker(SQSAIJobWorker):
    poll_count = 0

    async def poll_once(self) -> int:
      self.poll_count += 1
      stop_event.set()
      return 0

  worker = StopAfterCurrentPollWorker(
    Settings(sqs_ai_job_queue_url=QUEUE_URL),
    db=object(),
    client=FakeSQSClient(),
  )

  await worker.run_forever(stop_event)

  assert worker.poll_count == 1


def test_worker_requires_queue_url() -> None:
  with pytest.raises(AppError) as exc_info:
    SQSAIJobWorker(Settings(), db=object(), client=FakeSQSClient())

  assert exc_info.value.code == "AI_JOB_QUEUE_NOT_CONFIGURED"

def _feedback_report_row(**overrides) -> dict:
  row = {
    "id": REPORT_ID,
    "user_id": USER_ID,
    "status": "pending",
    "feedback_payload": json.dumps({"request": {"source": "worker-feedback-test"}}),
  }
  row.update(overrides)
  return row


@pytest.mark.asyncio
async def test_dispatcher_feedback_handler_runs_feedback_job(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: dict[str, object] = {}

  async def fake_run_feedback_job_background(report_id, user_id, request_payload, settings, *, db):
    calls["report_id"] = report_id
    calls["user_id"] = user_id
    calls["request_payload"] = request_payload
    calls["settings"] = settings
    calls["db"] = db

  monkeypatch.setattr(
    "app.workers.job_dispatcher.run_feedback_job_background",
    fake_run_feedback_job_background,
  )
  fake_db = FakeAnalysisDB(_feedback_report_row())
  settings = Settings()
  dispatcher = AIJobDispatcher(settings, db=fake_db)

  await dispatcher.dispatch(parse_ai_job_message(_message_body(jobType="feedback")))

  assert fake_db.fetchrow_calls[0][1:] == (REPORT_ID, USER_ID)
  assert calls["report_id"] == REPORT_ID
  assert calls["user_id"] == USER_ID
  assert calls["request_payload"] == {"source": "worker-feedback-test"}
  assert calls["settings"] is settings
  assert calls["db"] is fake_db


@pytest.mark.asyncio
async def test_dispatcher_skips_terminal_feedback_jobs(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def fake_run_feedback_job_background(*_args, **_kwargs):
    raise AssertionError("terminal feedback jobs should not be rerun")

  monkeypatch.setattr(
    "app.workers.job_dispatcher.run_feedback_job_background",
    fake_run_feedback_job_background,
  )
  dispatcher = AIJobDispatcher(Settings(), db=FakeAnalysisDB(_feedback_report_row(status="completed")))

  await dispatcher.dispatch(parse_ai_job_message(_message_body(jobType="feedback")))


@pytest.mark.asyncio
async def test_dispatcher_skips_missing_feedback_jobs(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def fake_run_feedback_job_background(*_args, **_kwargs):
    raise AssertionError("missing feedback jobs should not be run")

  monkeypatch.setattr(
    "app.workers.job_dispatcher.run_feedback_job_background",
    fake_run_feedback_job_background,
  )
  dispatcher = AIJobDispatcher(Settings(), db=FakeAnalysisDB(None))

  await dispatcher.dispatch(parse_ai_job_message(_message_body(jobType="feedback")))

def _filter_extraction_report_row(**overrides) -> dict:
  row = {
    "id": REPORT_ID,
    "user_id": USER_ID,
    "photo_capture_id": PHOTO_CAPTURE_ID,
    "result_media_id": SOURCE_MEDIA_ID,
    "status": "pending",
    "title": "Reference makeup",
    "subtitle": "Worker test",
    "result_payload": json.dumps(
      {
        "request": {"source": "worker-filter-test"},
        "referenceImageId": "reference-1",
        "runAi": True,
      },
    ),
  }
  row.update(overrides)
  return row


@pytest.mark.asyncio
async def test_dispatcher_filter_extraction_handler_runs_job(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: dict[str, object] = {}

  async def fake_run_filter_extraction_job_background(report_id, payload, settings, *, db):
    calls["report_id"] = report_id
    calls["payload"] = payload
    calls["settings"] = settings
    calls["db"] = db

  monkeypatch.setattr(
    "app.workers.job_dispatcher.run_filter_extraction_job_background",
    fake_run_filter_extraction_job_background,
  )
  fake_db = FakeAnalysisDB(_filter_extraction_report_row())
  settings = Settings()
  dispatcher = AIJobDispatcher(settings, db=fake_db)

  await dispatcher.dispatch(parse_ai_job_message(_message_body(jobType="filter_extraction")))

  payload = calls["payload"]
  assert fake_db.fetchrow_calls[0][1:] == (REPORT_ID, USER_ID)
  assert calls["report_id"] == REPORT_ID
  assert payload.photo_capture_id == PHOTO_CAPTURE_ID
  assert payload.result_media_id == SOURCE_MEDIA_ID
  assert payload.reference_image_id == "reference-1"
  assert payload.run_ai is True
  assert payload.request_payload == {"source": "worker-filter-test"}
  assert calls["settings"] is settings
  assert calls["db"] is fake_db


@pytest.mark.asyncio
async def test_dispatcher_skips_terminal_filter_extraction_jobs(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def fake_run_filter_extraction_job_background(*_args, **_kwargs):
    raise AssertionError("terminal filter extraction jobs should not be rerun")

  monkeypatch.setattr(
    "app.workers.job_dispatcher.run_filter_extraction_job_background",
    fake_run_filter_extraction_job_background,
  )
  dispatcher = AIJobDispatcher(
    Settings(),
    db=FakeAnalysisDB(_filter_extraction_report_row(status="completed")),
  )

  await dispatcher.dispatch(parse_ai_job_message(_message_body(jobType="filter_extraction")))


@pytest.mark.asyncio
async def test_dispatcher_skips_missing_filter_extraction_jobs(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def fake_run_filter_extraction_job_background(*_args, **_kwargs):
    raise AssertionError("missing filter extraction jobs should not be run")

  monkeypatch.setattr(
    "app.workers.job_dispatcher.run_filter_extraction_job_background",
    fake_run_filter_extraction_job_background,
  )
  dispatcher = AIJobDispatcher(Settings(), db=FakeAnalysisDB(None))

  await dispatcher.dispatch(parse_ai_job_message(_message_body(jobType="filter_extraction")))
