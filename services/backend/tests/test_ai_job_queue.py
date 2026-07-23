import json
from uuid import UUID

import pytest
from fastapi import BackgroundTasks

from app.api import analysis as analysis_api
from app.api import feedback as feedback_api
from app.api import filter_extractions as filter_extractions_api
from app.core.errors import AppError
from app.core.settings import Settings
from app.schemas.analysis import AnalysisJobCreate, FilterExtractionAnalyzeRequest
from app.services.ai_job_queue import AIJobQueuePublisher


REPORT_ID = UUID("11111111-1111-1111-1111-111111111111")
USER_ID = UUID("22222222-2222-2222-2222-222222222222")
QUEUE_URL = "https://sqs.ap-northeast-2.amazonaws.com/123456789012/aura-ai-jobs"


def test_ai_job_queue_publisher_sends_analysis_job_message(monkeypatch: pytest.MonkeyPatch) -> None:
  calls: dict[str, object] = {}

  class FakeSQSClient:
    def send_message(self, **kwargs):
      calls["send_message"] = kwargs
      return {"MessageId": "msg-123"}

  def fake_boto3_client(service_name: str, **kwargs):
    calls["service_name"] = service_name
    calls["client_kwargs"] = kwargs
    return FakeSQSClient()

  monkeypatch.setattr("app.services.ai_job_queue.boto3.client", fake_boto3_client)

  result = AIJobQueuePublisher(
    Settings(ai_job_execution_mode="sqs", sqs_ai_job_queue_url=QUEUE_URL),
  ).publish_analysis_job(REPORT_ID, USER_ID)

  send_message = calls["send_message"]
  body = json.loads(send_message["MessageBody"])

  assert calls["service_name"] == "sqs"
  assert calls["client_kwargs"]["region_name"] == "ap-northeast-2"
  assert send_message["QueueUrl"] == QUEUE_URL
  assert body == {
    "version": 1,
    "jobType": "analysis",
    "jobId": str(REPORT_ID),
    "userId": str(USER_ID),
  }
  assert "requestPayload" not in body
  assert send_message["MessageAttributes"]["jobType"]["StringValue"] == "analysis"
  assert send_message["MessageAttributes"]["jobId"]["StringValue"] == str(REPORT_ID)
  assert result["messageId"] == "msg-123"


def test_ai_job_queue_publisher_adds_fifo_options(monkeypatch: pytest.MonkeyPatch) -> None:
  calls: dict[str, object] = {}

  class FakeSQSClient:
    def send_message(self, **kwargs):
      calls["send_message"] = kwargs
      return {"MessageId": "fifo-msg-123"}

  monkeypatch.setattr("app.services.ai_job_queue.boto3.client", lambda *_args, **_kwargs: FakeSQSClient())

  AIJobQueuePublisher(
    Settings(ai_job_execution_mode="sqs", sqs_ai_job_queue_url=f"{QUEUE_URL}.fifo"),
  ).publish_analysis_job(REPORT_ID, USER_ID)

  send_message = calls["send_message"]

  assert send_message["MessageGroupId"] == "analysis"
  assert send_message["MessageDeduplicationId"] == f"analysis:{REPORT_ID}"


def test_ai_job_queue_publisher_requires_queue_url() -> None:
  with pytest.raises(AppError) as exc_info:
    AIJobQueuePublisher(Settings(ai_job_execution_mode="sqs")).publish_analysis_job(REPORT_ID, USER_ID)

  assert exc_info.value.code == "AI_JOB_QUEUE_NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_dispatch_analysis_job_inline_adds_background_task() -> None:
  background_tasks = BackgroundTasks()

  await analysis_api.dispatch_analysis_job(
    db=object(),
    background_tasks=background_tasks,
    report_id=REPORT_ID,
    user_id=USER_ID,
    payload=AnalysisJobCreate(requestPayload={"source": "test"}),
    settings=Settings(ai_job_execution_mode="inline"),
  )

  assert len(background_tasks.tasks) == 1
  assert background_tasks.tasks[0].func is analysis_api.run_analysis_job_background


@pytest.mark.asyncio
async def test_dispatch_analysis_job_sqs_publishes_without_background_task(monkeypatch: pytest.MonkeyPatch) -> None:
  calls: dict[str, object] = {}

  class FakePublisher:
    def __init__(self, settings: Settings) -> None:
      calls["settings"] = settings

    def publish_analysis_job(self, report_id: UUID, user_id: UUID):
      calls["report_id"] = report_id
      calls["user_id"] = user_id
      return {"messageId": "msg-123"}

  monkeypatch.setattr(analysis_api, "AIJobQueuePublisher", FakePublisher)
  background_tasks = BackgroundTasks()

  await analysis_api.dispatch_analysis_job(
    db=object(),
    background_tasks=background_tasks,
    report_id=REPORT_ID,
    user_id=USER_ID,
    payload=AnalysisJobCreate(requestPayload={"source": "test"}),
    settings=Settings(ai_job_execution_mode="sqs", sqs_ai_job_queue_url=QUEUE_URL),
  )

  assert len(background_tasks.tasks) == 0
  assert calls["report_id"] == REPORT_ID
  assert calls["user_id"] == USER_ID


@pytest.mark.asyncio
async def test_dispatch_analysis_job_sqs_failure_marks_report_failed(monkeypatch: pytest.MonkeyPatch) -> None:
  class FakeDB:
    def __init__(self) -> None:
      self.executed = []

    async def execute(self, *args):
      self.executed.append(args)
      return "UPDATE 1"

  class FakePublisher:
    def __init__(self, _settings: Settings) -> None:
      pass

    def publish_analysis_job(self, _report_id: UUID, _user_id: UUID):
      raise AppError(503, "AI_JOB_QUEUE_NOT_CONFIGURED", "Queue missing.")

  monkeypatch.setattr(analysis_api, "AIJobQueuePublisher", FakePublisher)
  fake_db = FakeDB()

  with pytest.raises(AppError) as exc_info:
    await analysis_api.dispatch_analysis_job(
      db=fake_db,
      background_tasks=BackgroundTasks(),
      report_id=REPORT_ID,
      user_id=USER_ID,
      payload=AnalysisJobCreate(requestPayload={"source": "test"}),
      settings=Settings(ai_job_execution_mode="sqs"),
    )

  assert exc_info.value.code == "AI_JOB_QUEUE_NOT_CONFIGURED"
  assert fake_db.executed
  assert "update analysis_reports" in fake_db.executed[0][0]


@pytest.mark.asyncio
async def test_analysis_completion_notification_precedes_slow_post_processing(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  events: list[str] = []

  class FakeDB:
    async def execute(self, *_args):
      return "UPDATE 1"

    async def fetchrow(self, query, *_args):
      if "select user_id" in query:
        return {"user_id": USER_ID}
      events.append("report-persisted")
      return {"id": REPORT_ID, "user_id": USER_ID}

  class FakeAnalysisService:
    def __init__(self, _settings: Settings) -> None:
      pass

    async def analyze_text(self, _request_payload, on_anchor=None):
      return {
        "recommendedMakeups": [{"title": "Daily look"}],
        "shortSummary": "Report ready",
      }

  async def fake_create_notification(_db, _settings, **kwargs):
    events.append("notification")
    assert kwargs["user_id"] == USER_ID
    assert kwargs["notification_type"] == "analysis_report_completed"

  async def fake_update_embedding(_db, _report):
    events.append("embedding")
    return True

  async def fake_require_consent(_db, *, user_id):
    assert user_id == USER_ID
    return {"accepted": True}

  monkeypatch.setattr(analysis_api, "OpenAIAnalysisService", FakeAnalysisService)
  monkeypatch.setattr(
    analysis_api,
    "create_and_send_notification",
    fake_create_notification,
  )
  monkeypatch.setattr(
    analysis_api,
    "update_analysis_report_embedding",
    fake_update_embedding,
  )
  monkeypatch.setattr(
    analysis_api,
    "require_current_ai_data_consent",
    fake_require_consent,
  )

  await analysis_api.run_analysis_job_background(
    REPORT_ID,
    AnalysisJobCreate(requestPayload={"source": "test"}),
    Settings(
      face_analysis_v2_enabled=False,
      image_generation_provider="disabled",
    ),
    db=FakeDB(),
  )

  assert events == ["report-persisted", "notification", "embedding"]


@pytest.mark.asyncio
async def test_analysis_worker_stops_before_provider_when_consent_was_revoked(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class FakeDB:
    def __init__(self) -> None:
      self.executed: list[tuple] = []

    async def execute(self, *args):
      self.executed.append(args)
      return "UPDATE 1"

    async def fetchrow(self, query, *_args):
      assert "select user_id" in query
      return {"user_id": USER_ID}

  async def fake_require_consent(_db, *, user_id):
    assert user_id == USER_ID
    raise AppError(
      403,
      "AI_DATA_CONSENT_REQUIRED",
      "AI consent was revoked.",
    )

  class ProviderMustNotStart:
    def __init__(self, _settings):
      raise AssertionError("External AI provider must not start after revocation.")

  monkeypatch.setattr(
    analysis_api,
    "require_current_ai_data_consent",
    fake_require_consent,
  )
  monkeypatch.setattr(analysis_api, "OpenAIAnalysisService", ProviderMustNotStart)
  fake_db = FakeDB()

  await analysis_api.run_analysis_job_background(
    REPORT_ID,
    AnalysisJobCreate(requestPayload={"source": "test"}),
    Settings(face_analysis_v2_enabled=False),
    db=fake_db,
  )

  assert any("status = 'failed'" in query for query, *_args in fake_db.executed)


def test_ai_job_queue_publisher_sends_feedback_job_message(monkeypatch: pytest.MonkeyPatch) -> None:
  calls: dict[str, object] = {}

  class FakeSQSClient:
    def send_message(self, **kwargs):
      calls["send_message"] = kwargs
      return {"MessageId": "feedback-msg-123"}

  monkeypatch.setattr(
    "app.services.ai_job_queue.boto3.client",
    lambda *_args, **_kwargs: FakeSQSClient(),
  )

  result = AIJobQueuePublisher(
    Settings(ai_job_execution_mode="sqs", sqs_ai_job_queue_url=QUEUE_URL),
  ).publish_feedback_job(REPORT_ID, USER_ID)

  send_message = calls["send_message"]
  body = json.loads(send_message["MessageBody"])

  assert body == {
    "version": 1,
    "jobType": "feedback",
    "jobId": str(REPORT_ID),
    "userId": str(USER_ID),
  }
  assert send_message["MessageAttributes"]["jobType"]["StringValue"] == "feedback"
  assert result["messageId"] == "feedback-msg-123"


@pytest.mark.asyncio
async def test_dispatch_feedback_job_inline_adds_background_task() -> None:
  background_tasks = BackgroundTasks()
  request_payload = {"source": "test"}

  await feedback_api.dispatch_feedback_job(
    db=object(),
    background_tasks=background_tasks,
    report_id=REPORT_ID,
    user_id=USER_ID,
    request_payload=request_payload,
    settings=Settings(ai_job_execution_mode="inline"),
  )

  assert len(background_tasks.tasks) == 1
  assert background_tasks.tasks[0].func is feedback_api.run_feedback_job_background
  assert background_tasks.tasks[0].args[0] == REPORT_ID
  assert background_tasks.tasks[0].args[1] == USER_ID
  assert background_tasks.tasks[0].args[2] == request_payload
  assert isinstance(background_tasks.tasks[0].args[3], Settings)


@pytest.mark.asyncio
async def test_dispatch_feedback_job_sqs_publishes_without_background_task(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: dict[str, object] = {}

  class FakePublisher:
    def __init__(self, settings: Settings) -> None:
      calls["settings"] = settings

    def publish_feedback_job(self, report_id: UUID, user_id: UUID):
      calls["report_id"] = report_id
      calls["user_id"] = user_id
      return {"messageId": "feedback-msg-123"}

  monkeypatch.setattr(feedback_api, "AIJobQueuePublisher", FakePublisher)
  background_tasks = BackgroundTasks()

  await feedback_api.dispatch_feedback_job(
    db=object(),
    background_tasks=background_tasks,
    report_id=REPORT_ID,
    user_id=USER_ID,
    request_payload={"source": "test"},
    settings=Settings(ai_job_execution_mode="sqs", sqs_ai_job_queue_url=QUEUE_URL),
  )

  assert len(background_tasks.tasks) == 0
  assert calls["report_id"] == REPORT_ID
  assert calls["user_id"] == USER_ID


@pytest.mark.asyncio
async def test_dispatch_feedback_job_sqs_failure_marks_report_failed(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class FakeDB:
    def __init__(self) -> None:
      self.executed: list[tuple] = []

    async def execute(self, *args):
      self.executed.append(args)
      return "UPDATE 1"

  class FakePublisher:
    def __init__(self, _settings: Settings) -> None:
      pass

    def publish_feedback_job(self, _report_id: UUID, _user_id: UUID):
      raise AppError(503, "AI_JOB_QUEUE_NOT_CONFIGURED", "Queue missing.")

  monkeypatch.setattr(feedback_api, "AIJobQueuePublisher", FakePublisher)
  fake_db = FakeDB()

  with pytest.raises(AppError) as exc_info:
    await feedback_api.dispatch_feedback_job(
      db=fake_db,
      background_tasks=BackgroundTasks(),
      report_id=REPORT_ID,
      user_id=USER_ID,
      request_payload={"source": "test"},
      settings=Settings(ai_job_execution_mode="sqs"),
    )

  assert exc_info.value.code == "AI_JOB_QUEUE_NOT_CONFIGURED"
  assert "update makeup_feedback_reports" in fake_db.executed[0][0]
  assert "where id = $1 and user_id = $2" in fake_db.executed[0][0]
  assert fake_db.executed[0][1:3] == (REPORT_ID, USER_ID)
  failed_payload = json.loads(fake_db.executed[0][3])
  assert failed_payload["error"]["message"] == "Queue missing."


@pytest.mark.asyncio
async def test_run_feedback_job_background_completes_report(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: dict[str, object] = {}

  class FakeDB:
    def __init__(self) -> None:
      self.executed: list[tuple] = []
      self.fetchrow_calls: list[tuple] = []

    async def execute(self, *args):
      self.executed.append(args)
      return "UPDATE 1"

    async def fetchrow(self, *args):
      self.fetchrow_calls.append(args)
      return {"id": REPORT_ID, "status": "completed", "user_id": USER_ID}

  async def fake_build_result(request_payload, settings):
    calls["request_payload"] = request_payload
    calls["settings"] = settings
    return {"score": 87, "modelVersion": "feedback-test-v1"}, "bedrock_completed", None

  async def fake_create_notification(_db, _settings, **kwargs):
    calls["notification"] = kwargs

  async def fake_require_consent(_db, *, user_id):
    assert user_id == USER_ID
    return {"accepted": True}

  monkeypatch.setattr(
    feedback_api,
    "build_makeup_feedback_result_for_request",
    fake_build_result,
  )
  monkeypatch.setattr(
    feedback_api,
    "create_and_send_notification",
    fake_create_notification,
  )
  monkeypatch.setattr(
    feedback_api,
    "require_current_ai_data_consent",
    fake_require_consent,
  )
  fake_db = FakeDB()
  settings = Settings()
  request_payload = {"source": "worker-test"}

  await feedback_api.run_feedback_job_background(
    REPORT_ID,
    USER_ID,
    request_payload,
    settings,
    db=fake_db,
  )

  assert "status = 'processing'" in fake_db.executed[0][0]
  assert fake_db.executed[0][1:3] == (REPORT_ID, USER_ID)
  assert "status = 'completed'" in fake_db.fetchrow_calls[0][0]
  assert "where id = $1 and user_id = $2" in fake_db.fetchrow_calls[0][0]
  assert fake_db.fetchrow_calls[0][1:3] == (REPORT_ID, USER_ID)
  assert fake_db.fetchrow_calls[0][3] == 87
  completed_payload = json.loads(fake_db.fetchrow_calls[0][5])
  assert completed_payload["request"] == request_payload
  assert completed_payload["analysisStatus"] == "bedrock_completed"
  assert calls["request_payload"] == request_payload
  assert calls["settings"] is settings
  assert calls["notification"]["user_id"] == USER_ID
  assert calls["notification"]["notification_type"] == "makeup_feedback_completed"

def test_ai_job_queue_publisher_sends_filter_extraction_message(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: dict[str, object] = {}

  class FakeSQSClient:
    def send_message(self, **kwargs):
      calls["send_message"] = kwargs
      return {"MessageId": "filter-msg-123"}

  monkeypatch.setattr(
    "app.services.ai_job_queue.boto3.client",
    lambda *_args, **_kwargs: FakeSQSClient(),
  )

  result = AIJobQueuePublisher(
    Settings(ai_job_execution_mode="sqs", sqs_ai_job_queue_url=QUEUE_URL),
  ).publish_filter_extraction_job(REPORT_ID, USER_ID)

  send_message = calls["send_message"]
  body = json.loads(send_message["MessageBody"])

  assert body == {
    "version": 1,
    "jobType": "filter_extraction",
    "jobId": str(REPORT_ID),
    "userId": str(USER_ID),
  }
  assert send_message["MessageAttributes"]["jobType"]["StringValue"] == "filter_extraction"
  assert result["messageId"] == "filter-msg-123"


@pytest.mark.asyncio
async def test_dispatch_filter_extraction_job_inline_adds_background_task() -> None:
  background_tasks = BackgroundTasks()
  payload = FilterExtractionAnalyzeRequest(
    runAi=True,
    requestPayload={"source": "worker-test"},
  )

  await filter_extractions_api.dispatch_filter_extraction_job(
    db=object(),
    background_tasks=background_tasks,
    report_id=REPORT_ID,
    user_id=USER_ID,
    payload=payload,
    settings=Settings(ai_job_execution_mode="inline"),
  )

  assert len(background_tasks.tasks) == 1
  assert background_tasks.tasks[0].func is filter_extractions_api.run_filter_extraction_job_background
  assert background_tasks.tasks[0].args[0] == REPORT_ID
  assert background_tasks.tasks[0].args[1] is payload


@pytest.mark.asyncio
async def test_dispatch_filter_extraction_job_sqs_publishes_without_background_task(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: dict[str, object] = {}

  class FakePublisher:
    def __init__(self, settings: Settings) -> None:
      calls["settings"] = settings

    def publish_filter_extraction_job(self, report_id: UUID, user_id: UUID):
      calls["report_id"] = report_id
      calls["user_id"] = user_id
      return {"messageId": "filter-msg-123"}

  monkeypatch.setattr(filter_extractions_api, "AIJobQueuePublisher", FakePublisher)
  background_tasks = BackgroundTasks()

  await filter_extractions_api.dispatch_filter_extraction_job(
    db=object(),
    background_tasks=background_tasks,
    report_id=REPORT_ID,
    user_id=USER_ID,
    payload=FilterExtractionAnalyzeRequest(runAi=True),
    settings=Settings(ai_job_execution_mode="sqs", sqs_ai_job_queue_url=QUEUE_URL),
  )

  assert len(background_tasks.tasks) == 0
  assert calls["report_id"] == REPORT_ID
  assert calls["user_id"] == USER_ID


@pytest.mark.asyncio
async def test_run_filter_extraction_job_background_completes_report(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: dict[str, object] = {}

  class FakeDB:
    def __init__(self) -> None:
      self.executed: list[tuple] = []
      self.fetchrow_calls: list[tuple] = []

    async def execute(self, *args):
      self.executed.append(args)
      return "UPDATE 1"

    async def fetchrow(self, *args):
      self.fetchrow_calls.append(args)
      return {"id": REPORT_ID, "status": "completed", "user_id": USER_ID}

  extraction_payload = {
    "loading_steps": [],
    "extracted_makeup_look": {
      "title": "Soft reference look",
      "subtitle": "Worker result",
      "tags": ["soft"],
      "accuracy": 92,
    },
  }

  async def fake_build_result(payload, settings):
    calls["payload"] = payload
    calls["settings"] = settings
    return extraction_payload, "bedrock_completed", None

  async def fake_enrich_products(db, settings, payload):
    calls["db"] = db
    assert payload is extraction_payload
    return payload, "database"

  async def fake_create_notification(_db, _settings, **kwargs):
    calls["notification"] = kwargs

  async def fake_require_consent(_db, *, user_id):
    assert user_id == USER_ID
    return {"accepted": True}

  monkeypatch.setattr(
    filter_extractions_api,
    "build_reference_makeup_extraction_payload_for_request",
    fake_build_result,
  )
  monkeypatch.setattr(
    filter_extractions_api,
    "enrich_reference_makeup_products",
    fake_enrich_products,
  )
  monkeypatch.setattr(
    filter_extractions_api,
    "create_and_send_notification",
    fake_create_notification,
  )
  monkeypatch.setattr(
    filter_extractions_api,
    "require_current_ai_data_consent",
    fake_require_consent,
  )
  fake_db = FakeDB()
  settings = Settings()
  payload = FilterExtractionAnalyzeRequest(
    referenceImageId="reference-1",
    runAi=True,
    requestPayload={"source": "worker-test"},
  )

  await filter_extractions_api.run_filter_extraction_job_background(
    REPORT_ID,
    payload,
    settings,
    db=fake_db,
  )

  assert "status = 'processing'" in fake_db.executed[0][0]
  assert "status = 'completed'" in fake_db.fetchrow_calls[-1][0]
  completed_payload = json.loads(fake_db.fetchrow_calls[-1][-1])
  assert completed_payload["request"] == {"source": "worker-test"}
  assert completed_payload["referenceImageId"] == "reference-1"
  assert completed_payload["runAi"] is True
  assert completed_payload["aiStatus"] == "bedrock_completed"
  assert completed_payload["productSource"] == "database"
  assert completed_payload["result"] == extraction_payload
  assert calls["payload"] is payload
  assert calls["settings"] is settings
  assert calls["db"] is fake_db
  assert calls["notification"]["user_id"] == USER_ID
  assert calls["notification"]["notification_type"] == "filter_extraction_completed"


@pytest.mark.asyncio
async def test_run_filter_extraction_job_background_marks_provider_failure_failed(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: dict[str, object] = {}

  class FakeDB:
    def __init__(self) -> None:
      self.executed: list[tuple] = []

    async def execute(self, *args):
      self.executed.append(args)
      return "UPDATE 1"

    async def fetchrow(self, query, *_args):
      if "select user_id" in query:
        return {"user_id": USER_ID}
      raise AssertionError("A failed AI job must not be stored as completed.")

  async def fail_build_result(_payload, _settings):
    raise AppError(
      502,
      "BEDROCK_INVOCATION_FAILED",
      "Reference makeup extraction provider request failed.",
    )

  async def fail_enrich(*_args, **_kwargs):
    raise AssertionError("Product enrichment must not run after AI failure.")

  async def fail_notification(*_args, **_kwargs):
    calls["notification"] = True

  async def fake_require_consent(_db, *, user_id):
    assert user_id == USER_ID
    return {"accepted": True}

  monkeypatch.setattr(
    filter_extractions_api,
    "build_reference_makeup_extraction_payload_for_request",
    fail_build_result,
  )
  monkeypatch.setattr(filter_extractions_api, "enrich_reference_makeup_products", fail_enrich)
  monkeypatch.setattr(filter_extractions_api, "create_and_send_notification", fail_notification)
  monkeypatch.setattr(
    filter_extractions_api,
    "require_current_ai_data_consent",
    fake_require_consent,
  )
  fake_db = FakeDB()

  await filter_extractions_api.run_filter_extraction_job_background(
    REPORT_ID,
    FilterExtractionAnalyzeRequest(runAi=True),
    Settings(),
    db=fake_db,
  )

  assert "status = 'processing'" in fake_db.executed[0][0]
  assert "status = 'failed'" in fake_db.executed[1][0]
  failed_payload = json.loads(fake_db.executed[1][2])
  assert failed_payload["error"]["message"] == (
    "Reference makeup extraction provider request failed."
  )
  assert "notification" not in calls
