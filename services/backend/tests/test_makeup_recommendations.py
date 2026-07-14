import json
from uuid import UUID

import pytest
from botocore.config import Config
from botocore.exceptions import ClientError, ReadTimeoutError
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient

from app.api import makeup_recommendations as makeup_api
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings
from app.db.session import require_database
from app.main import create_app
from app.db.check_schema import EXPECTED_COLUMNS, EXPECTED_TABLES
from app.services.ai_job_queue import AIJobQueuePublisher
from app.services import makeup_recommendation as makeup_service
from app.core.errors import AppError
from app.services.makeup_recommendation import (
  _bedrock_app_error,
  _converse,
  apply_refinement_contract,
  generate_questions,
  generate_recommendation,
  generate_scenarios,
  generate_shared_scenarios,
)
from app.services.makeup_recommendation_image import (
  generate_recommendation_image,
  generate_recommendation_images,
)
from app.workers import job_dispatcher
from app.workers.job_dispatcher import AIJobDispatcher, ParsedAIJobMessage


USER_ID = UUID("11111111-1111-1111-1111-111111111111")
REPORT_ID = UUID("22222222-2222-2222-2222-222222222222")
REFINED_REPORT_ID = UUID("33333333-3333-3333-3333-333333333333")


class FakeBedrockClient:
  def __init__(self):
    self.calls: list[dict] = []

  def converse(self, **kwargs):
    self.calls.append(kwargs)
    return {
      "output": {
        "message": {
          "content": [
            {
              "text": "```json\n{\"items\":[{\"id\":\"fresh-1\",\"text\":\"퇴근 후 약속\",\"tags\":[\"차분\"]}]}\n```",
            },
          ],
        },
      },
    }


def test_converse_uses_bounded_bedrock_timeout_and_retries(monkeypatch: pytest.MonkeyPatch) -> None:
  client = FakeBedrockClient()
  captured_kwargs: dict = {}

  def fake_boto_client(*_args, **kwargs):
    captured_kwargs.update(kwargs)
    return client

  monkeypatch.setattr("app.services.makeup_recommendation.boto3.client", fake_boto_client)

  _converse(Settings(), "model-id", "system", "prompt")

  config = captured_kwargs.get("config")
  assert isinstance(config, Config)
  assert config.read_timeout <= 55
  assert config.retries == {"max_attempts": 1, "mode": "standard"}


def test_converse_accepts_json_code_fence(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr("app.services.makeup_recommendation.boto3.client", lambda *_args, **_kwargs: FakeBedrockClient())

  result = _converse(Settings(), "model-id", "system", "prompt")

  assert result["items"][0]["text"] == "퇴근 후 약속"


def test_converse_uses_bounded_three_look_recommendation_payload(monkeypatch: pytest.MonkeyPatch) -> None:
  client = FakeBedrockClient()
  monkeypatch.setattr("app.services.makeup_recommendation.boto3.client", lambda *_args, **_kwargs: client)

  _converse(Settings(), "model-id", "system", "prompt")

  assert 3000 <= client.calls[0]["inferenceConfig"]["maxTokens"] <= 4000
  assert client.calls[0]["inferenceConfig"]["temperature"] <= 0.5


def test_bedrock_access_denial_keeps_safe_provider_diagnostics() -> None:
  provider_error = ClientError(
    {
      "Error": {"Code": "AccessDeniedException", "Message": "role is not authorized"},
      "ResponseMetadata": {"RequestId": "request-123"},
    },
    "Converse",
  )

  error = _bedrock_app_error(provider_error)

  assert error.status_code == 503
  assert error.code == "BEDROCK_ACCESS_DENIED"
  assert error.details == {
    "providerCode": "AccessDeniedException",
    "providerRequestId": "request-123",
  }
  assert "role is not authorized" not in error.message


def test_bedrock_read_timeout_is_reported_as_timeout() -> None:
  error = _bedrock_app_error(ReadTimeoutError(endpoint_url="https://bedrock-runtime.example.com"))

  assert error.status_code == 504
  assert error.code == "BEDROCK_REQUEST_TIMEOUT"
  assert error.details == {"providerCode": "ReadTimeoutError"}


def test_product_only_refinement_preserves_makeup_and_replaces_products() -> None:
  previous = {
    "looks": [
      {
        "id": role,
        "role": role,
        "title": f"old-{role}",
        "steps": [{"area": "base", "instruction": "keep"}],
        "products": [{"productName": "old"}],
        "imageUrl": f"https://old/{role}.png",
      }
      for role in ("anchor", "bold", "discovery")
    ],
  }
  generated = {
    "looks": [
      {
        "id": f"new-{role}",
        "role": role,
        "title": f"changed-{role}",
        "steps": [{"area": "base", "instruction": "changed"}],
        "products": [{"productName": "new"}],
      }
      for role in ("anchor", "bold", "discovery")
    ],
  }

  result = apply_refinement_contract(previous, generated, "replaceProducts")

  assert result["looks"][0]["title"] == "old-anchor"
  assert result["looks"][0]["steps"][0]["instruction"] == "keep"
  assert result["looks"][0]["products"][0]["productName"] == "new"
  assert "imageUrl" not in result["looks"][0]


class RecommendationDatabase:
  def __init__(self) -> None:
    self.insert_args: tuple | None = None
    self.executed: list[tuple[str, tuple]] = []

  async def fetchrow(self, query: str, *args):
    if "insert into makeup_recommendation_reports" in query:
      self.insert_args = args
      return {"id": REPORT_ID}
    raise AssertionError(f"Unexpected query: {query}")

  async def execute(self, query: str, *args):
    self.executed.append((query, args))
    return "UPDATE 1"


class RecommendationReportDatabase:
  def __init__(self, image_status: str = "failed") -> None:
    self.image_status = image_status
    self.executed: list[tuple[str, tuple]] = []
    self.fetchrow_queries: list[tuple[str, tuple]] = []

  async def fetch(self, query: str, *args):
    assert "from makeup_recommendation_reports" in query
    assert args == (USER_ID, 20, 0)
    return [
      {
        "id": REPORT_ID,
        "scenario_text": "퇴근 후 약속",
        "recommendation": {"looks": []},
        "image_status": "completed",
        "image_url": "https://cdn.example.com/anchor.png",
        "created_at": "2026-07-14T00:00:00Z",
        "updated_at": "2026-07-14T00:00:00Z",
      },
    ]

  async def fetchrow(self, query: str, *args):
    self.fetchrow_queries.append((query, args))
    if "select id, image_status" in query:
      return {"id": REPORT_ID, "image_status": self.image_status}
    if "set image_status = 'pending'" in query and "returning id" in query:
      return {"id": REPORT_ID} if self.image_status == "failed" else None
    raise AssertionError(f"Unexpected query: {query}")

  async def execute(self, query: str, *args):
    self.executed.append((query, args))
    return "UPDATE 1"


class RefinementDatabase:
  async def fetchrow(self, query: str, *args):
    if "from makeup_recommendation_reports" in query:
      assert args == (REPORT_ID, USER_ID)
      return {
        "id": REPORT_ID,
        "scenario_text": "퇴근 후 약속",
        "scenario_tags": ["차분"],
        "questions": [],
        "answers": [],
        "recommendation": {"looks": []},
      }
    if "insert into makeup_recommendation_reports" in query:
      return {"id": REFINED_REPORT_ID}
    raise AssertionError(f"Unexpected query: {query}")


def auth_context() -> AuthContext:
  return AuthContext(
    subject="makeup-user",
    provider="cognito",
    email="makeup@example.com",
    name="Makeup User",
    claims={"sub": "makeup-user"},
  )


@pytest.mark.parametrize("path", ["/api/makeup-recommendations/scenarios", "/api/makeup-recommendations/questions"])
def test_generation_endpoints_require_auth(path: str) -> None:
  client = TestClient(create_app(Settings(auth_required=True, database_url=None)))

  response = client.post(path, json={})

  assert response.status_code == 401


def test_scenario_endpoint_uses_shared_library_for_authenticated_user(monkeypatch: pytest.MonkeyPatch) -> None:
  db = SharedScenarioDatabase()
  app = create_app(Settings(database_url=None))
  app.dependency_overrides[get_current_user] = auth_context
  app.dependency_overrides[require_database] = lambda: db
  captured: dict = {}

  async def fake_ensure_user(_db, _auth):
    return {"id": USER_ID}

  async def fake_limit(passed_db, user_id):
    captured.update({"limitDb": passed_db, "limitUserId": user_id})

  async def fake_shared(_settings, passed_db, count, exclude_texts, user_id):
    captured.update({"db": passed_db, "count": count, "excludeTexts": exclude_texts, "userId": user_id})
    return {"items": [{"id": "shared-1", "text": "새벽 서점의 온도", "seedPrompt": "차분한 브라운", "tags": []}]}

  monkeypatch.setattr(makeup_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(makeup_api, "enforce_scenario_generation_limit", fake_limit)
  monkeypatch.setattr(makeup_api, "generate_shared_scenarios", fake_shared)

  response = TestClient(app).post(
    "/api/makeup-recommendations/scenarios",
    json={"count": 6, "excludeTexts": ["공항 출국 레전드"]},
  )

  assert response.status_code == 200
  assert response.json()["data"]["items"][0]["text"] == "새벽 서점의 온도"
  assert captured == {
    "limitDb": db,
    "limitUserId": USER_ID,
    "db": db,
    "count": 6,
    "excludeTexts": ["공항 출국 레전드"],
    "userId": USER_ID,
  }


class GenerationLimitDatabase:
  def __init__(self, request_count: int) -> None:
    self.request_count = request_count
    self.queries: list[tuple[str, tuple]] = []

  async def fetchrow(self, query: str, *args):
    self.queries.append((query, args))
    return {"request_count": self.request_count}


@pytest.mark.asyncio
async def test_generation_limit_rejects_fourth_live_window() -> None:
  db = GenerationLimitDatabase(request_count=4)

  with pytest.raises(AppError) as exc_info:
    await makeup_service.enforce_scenario_generation_limit(db, USER_ID)

  assert exc_info.value.status_code == 429
  assert exc_info.value.code == "MAKEUP_SCENARIO_RATE_LIMITED"
  assert db.queries[0][1] == (USER_ID,)
  assert "least(makeup_scenario_generation_limits.request_count + 1, 4)" in db.queries[0][0]


def test_scenario_route_checks_limit_before_generation(monkeypatch: pytest.MonkeyPatch) -> None:
  db = SharedScenarioDatabase()
  app = create_app(Settings(database_url=None))
  app.dependency_overrides[get_current_user] = auth_context
  app.dependency_overrides[require_database] = lambda: db
  generated = False

  async def fake_ensure_user(_db, _auth):
    return {"id": USER_ID}

  async def reject_limit(_db, _user_id):
    raise AppError(429, "MAKEUP_SCENARIO_RATE_LIMITED", "잠시 후 카드를 더 만들어 주세요.")

  async def fake_shared(*_args, **_kwargs):
    nonlocal generated
    generated = True
    return {"items": []}

  monkeypatch.setattr(makeup_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(makeup_api, "enforce_scenario_generation_limit", reject_limit, raising=False)
  monkeypatch.setattr(makeup_api, "generate_shared_scenarios", fake_shared)

  response = TestClient(app).post("/api/makeup-recommendations/scenarios", json={"count": 6})

  assert response.status_code == 429
  assert response.json()["error"]["code"] == "MAKEUP_SCENARIO_RATE_LIMITED"
  assert generated is False


def test_recommendation_saves_report_without_face_analysis(monkeypatch: pytest.MonkeyPatch) -> None:
  db = RecommendationDatabase()
  app = create_app(
    Settings(
      database_url=None,
      bedrock_recommendation_model_id="anthropic.claude-sonnet-4-6",
    ),
  )
  app.dependency_overrides[get_current_user] = auth_context
  app.dependency_overrides[require_database] = lambda: db

  async def fake_ensure_user(_db, _auth):
    return {"id": USER_ID}

  async def fake_recommendation(*_args, **_kwargs):
    return {
      "title": "잔잔한 저녁",
      "summary": "부드러운 음영과 맑은 입술",
      "steps": [],
      "products": [],
    }

  async def fake_image_job(*_args, **_kwargs):
    return None

  monkeypatch.setattr(makeup_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(makeup_api, "generate_recommendation", fake_recommendation)
  monkeypatch.setattr(makeup_api, "run_recommendation_image_job", fake_image_job)
  client = TestClient(app)

  response = client.post(
    "/api/makeup-recommendations",
    json={
      "scenarioText": "퇴근 후 약속",
      "scenarioTags": ["차분"],
      "questions": [{"id": "finish", "title": "표현", "options": []}],
      "answers": [{"questionId": "finish", "optionId": "soft", "label": "은은하게"}],
      "personalColor": "winter",
      "faceShape": "oval",
    },
  )

  assert response.status_code == 200
  assert response.json()["data"]["reportId"] == str(REPORT_ID)
  assert response.json()["data"]["imageStatus"] == "pending"
  assert db.insert_args is not None
  assert db.insert_args[0] == USER_ID
  assert json.loads(db.insert_args[2]) == ["차분"]
  assert "winter" not in str(db.insert_args)
  assert "oval" not in str(db.insert_args)
  assert "anthropic.claude-sonnet-4-6" in db.insert_args


def test_recommendation_survives_image_queue_failure(monkeypatch: pytest.MonkeyPatch) -> None:
  db = RecommendationDatabase()
  app = create_app(
    Settings(
      database_url=None,
      ai_job_execution_mode="sqs",
      sqs_ai_job_queue_url="https://sqs.example.com/jobs",
    ),
  )
  app.dependency_overrides[get_current_user] = auth_context
  app.dependency_overrides[require_database] = lambda: db

  async def fake_ensure_user(_db, _auth):
    return {"id": USER_ID}

  async def fake_recommendation(*_args, **_kwargs):
    return {"looks": []}

  class FailingPublisher:
    def __init__(self, _settings):
      pass

    def publish_makeup_recommendation_job(self, *_args):
      raise AppError(502, "AI_JOB_QUEUE_PUBLISH_FAILED", "queue failed")

  monkeypatch.setattr(makeup_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(makeup_api, "generate_recommendation", fake_recommendation)
  monkeypatch.setattr(makeup_api, "AIJobQueuePublisher", FailingPublisher)
  response = TestClient(app).post(
    "/api/makeup-recommendations",
    json={"scenarioText": "퇴근 후 약속", "questions": [], "answers": []},
  )

  assert response.status_code == 200
  assert response.json()["data"]["imageStatus"] == "failed"
  assert any("image_status = 'failed'" in query for query, _args in db.executed)


def test_user_can_list_saved_recommendation_reports(monkeypatch: pytest.MonkeyPatch) -> None:
  db = RecommendationReportDatabase()
  app = create_app(Settings(database_url=None))
  app.dependency_overrides[get_current_user] = auth_context
  app.dependency_overrides[require_database] = lambda: db

  async def fake_ensure_user(_db, _auth):
    return {"id": USER_ID}

  monkeypatch.setattr(makeup_api, "ensure_user", fake_ensure_user)
  response = TestClient(app).get("/api/makeup-recommendations?limit=20&offset=0")

  assert response.status_code == 200
  assert response.json()["data"]["reports"][0]["scenarioText"] == "퇴근 후 약속"


def test_user_can_poll_owned_report_with_camel_case_image_state(monkeypatch: pytest.MonkeyPatch) -> None:
  recommendation = {
    "looks": [
      {"id": role, "role": role, "title": role, "summary": role}
      for role in ("anchor", "bold", "discovery")
    ],
  }

  class PollDatabase:
    async def fetchrow(self, query: str, *args):
      assert "from makeup_recommendation_reports" in query
      assert args == (REPORT_ID, USER_ID)
      return {
        "id": REPORT_ID,
        "scenario_text": "퇴근 후 약속",
        "scenario_tags": json.dumps(["차분"], ensure_ascii=False),
        "questions": json.dumps([{"id": "mood"}], ensure_ascii=False),
        "answers": json.dumps([{"questionId": "mood", "optionId": "soft"}], ensure_ascii=False),
        "recommendation": json.dumps(recommendation, ensure_ascii=False),
        "image_status": "processing",
        "image_url": None,
        "image_error": None,
        "created_at": "2026-07-14T00:00:00Z",
        "updated_at": "2026-07-14T00:00:10Z",
      }

  db = PollDatabase()
  app = create_app(Settings(database_url=None))
  app.dependency_overrides[get_current_user] = auth_context
  app.dependency_overrides[require_database] = lambda: db

  async def fake_ensure_user(_db, _auth):
    return {"id": USER_ID}

  monkeypatch.setattr(makeup_api, "ensure_user", fake_ensure_user)

  response = TestClient(app).get(f"/api/makeup-recommendations/{REPORT_ID}")

  assert response.status_code == 200
  assert response.json()["data"]["scenarioText"] == "퇴근 후 약속"
  assert response.json()["data"]["imageStatus"] == "processing"
  assert response.json()["data"]["scenarioTags"] == ["차분"]
  assert response.json()["data"]["questions"] == [{"id": "mood"}]
  assert response.json()["data"]["answers"] == [{"questionId": "mood", "optionId": "soft"}]
  assert response.json()["data"]["recommendation"] == recommendation
  assert "image_error" not in response.json()["data"]


def test_failed_report_image_can_be_retried(monkeypatch: pytest.MonkeyPatch) -> None:
  db = RecommendationReportDatabase()
  app = create_app(Settings(database_url=None))
  app.dependency_overrides[get_current_user] = auth_context
  app.dependency_overrides[require_database] = lambda: db
  dispatched: dict = {}

  async def fake_ensure_user(_db, _auth):
    return {"id": USER_ID}

  async def fake_dispatch(**kwargs):
    dispatched.update(kwargs)

  monkeypatch.setattr(makeup_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(makeup_api, "dispatch_recommendation_image_job", fake_dispatch)
  response = TestClient(app).post(f"/api/makeup-recommendations/{REPORT_ID}/image/retry")

  assert response.status_code == 200
  assert response.json()["data"]["imageStatus"] == "pending"
  assert dispatched["report_id"] == REPORT_ID
  assert any(
    "image_status = 'pending'" in query and "image_status = 'failed'" in query
    for query, _args in db.fetchrow_queries
  )


@pytest.mark.parametrize(
  ("image_status", "expected_code"),
  [
    ("pending", "MAKEUP_RECOMMENDATION_IMAGE_PENDING"),
    ("processing", "MAKEUP_RECOMMENDATION_IMAGE_PROCESSING"),
  ],
)
def test_active_report_image_cannot_enqueue_a_duplicate_retry(
  monkeypatch: pytest.MonkeyPatch,
  image_status: str,
  expected_code: str,
) -> None:
  db = RecommendationReportDatabase(image_status=image_status)
  app = create_app(Settings(database_url=None))
  app.dependency_overrides[get_current_user] = auth_context
  app.dependency_overrides[require_database] = lambda: db
  dispatched = False

  async def fake_ensure_user(_db, _auth):
    return {"id": USER_ID}

  async def fake_dispatch(**_kwargs):
    nonlocal dispatched
    dispatched = True

  monkeypatch.setattr(makeup_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(makeup_api, "dispatch_recommendation_image_job", fake_dispatch)

  response = TestClient(app).post(f"/api/makeup-recommendations/{REPORT_ID}/image/retry")

  assert response.status_code == 409
  assert response.json()["error"]["code"] == expected_code
  assert dispatched is False


def test_refinement_creates_a_new_saved_report(monkeypatch: pytest.MonkeyPatch) -> None:
  db = RefinementDatabase()
  app = create_app(Settings(database_url=None))
  app.dependency_overrides[get_current_user] = auth_context
  app.dependency_overrides[require_database] = lambda: db
  generated = {
    "looks": [
      {"id": role, "role": role, "title": role, "summary": role}
      for role in ("anchor", "bold", "discovery")
    ],
  }

  async def fake_ensure_user(_db, _auth):
    return {"id": USER_ID}

  async def fake_generate(*_args, **_kwargs):
    return generated

  async def fake_dispatch(**_kwargs):
    return None

  monkeypatch.setattr(makeup_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(makeup_api, "generate_recommendation", fake_generate)
  monkeypatch.setattr(makeup_api, "dispatch_recommendation_image_job", fake_dispatch)
  response = TestClient(app).post(
    f"/api/makeup-recommendations/{REPORT_ID}/refine",
    json={"refinement": "natural"},
  )

  assert response.status_code == 200
  assert response.json()["data"]["reportId"] == str(REFINED_REPORT_ID)
  assert response.json()["data"]["recommendation"] == generated
  assert response.json()["data"]["imageStatus"] == "pending"


def test_makeup_report_is_part_of_schema_contract() -> None:
  assert "makeup_recommendation_reports" in EXPECTED_TABLES
  assert EXPECTED_COLUMNS["makeup_recommendation_reports"] >= {
    "recommendation",
    "image_status",
    "image_url",
    "recommendation_model_id",
    "parent_report_id",
    "refinement_type",
  }
  assert "makeup_scenario_library" in EXPECTED_TABLES
  assert EXPECTED_COLUMNS["makeup_scenario_library"] >= {
    "normalized_text",
    "seed_prompt",
    "status",
    "usage_count",
    "model_id",
    "last_served_at",
  }
  assert "makeup_scenario_generation_limits" in EXPECTED_TABLES
  assert EXPECTED_COLUMNS["makeup_scenario_generation_limits"] >= {
    "user_id",
    "window_started_at",
    "request_count",
  }


def test_makeup_prompt_contract_accepts_full_generated_seed_prompt() -> None:
  prompt = "가" * 240

  question = makeup_api.MakeupQuestionRequest.model_validate({"scenarioText": prompt, "scenarioLabel": "공항 출국 레전드"})
  recommendation = makeup_api.MakeupRecommendationRequest.model_validate({"scenarioText": prompt, "scenarioLabel": "공항 출국 레전드"})

  assert question.scenario_text == prompt
  assert question.scenario_label == "공항 출국 레전드"
  assert recommendation.scenario_text == prompt
  assert recommendation.scenario_label == "공항 출국 레전드"


@pytest.mark.asyncio
async def test_scenarios_retry_until_they_are_new_and_unique(monkeypatch: pytest.MonkeyPatch) -> None:
  responses = iter(
    [
      {
        "items": [
          {"id": "old", "text": "이미 본 카드", "seedPrompt": "이미 본 카드의 메이크업", "tags": ["기존"]},
          {"id": "fresh-1", "text": "조용한 약속", "seedPrompt": "차분한 저녁 약속 메이크업", "tags": ["차분"]},
          {"id": "fresh-1-copy", "text": "조용한 약속", "seedPrompt": "차분한 저녁 약속 메이크업", "tags": ["차분"]},
        ],
      },
      {
        "items": [
          {"id": "fresh-2", "text": "기분 전환", "seedPrompt": "산뜻한 색으로 기분을 바꾸는 메이크업", "tags": ["산뜻"]},
          {"id": "fresh-3", "text": "오랜만의 외출", "seedPrompt": "오랜만의 외출에 어울리는 맑은 메이크업", "tags": ["맑음"]},
        ],
      },
    ],
  )

  async def fake_generate_json(*_args, **_kwargs):
    return next(responses)

  monkeypatch.setattr("app.services.makeup_recommendation.generate_json", fake_generate_json)

  result = await generate_scenarios(Settings(), 3, ["이미 본 카드"])

  assert [item["text"] for item in result["items"]] == ["조용한 약속", "기분 전환", "오랜만의 외출"]
  assert result["items"][0]["seedPrompt"] == "차분한 저녁 약속 메이크업"


@pytest.mark.asyncio
async def test_scenarios_reject_near_duplicate_paraphrases(monkeypatch: pytest.MonkeyPatch) -> None:
  responses = iter(
    [
      {
        "items": [
          {
            "id": "near-duplicate",
            "text": "공항 출국 사진 레전드",
            "seedPrompt": "공항 사진에서 또렷하게 보이는 메이크업",
            "tags": ["공항", "사진"],
          },
          {
            "id": "fresh-1",
            "text": "새벽 서점의 온도",
            "seedPrompt": "차분한 브라운과 낮은 채도의 지적인 메이크업",
            "tags": ["차분", "브라운"],
          },
        ],
      },
      {
        "items": [
          {
            "id": "fresh-2",
            "text": "첫 회의의 여유",
            "seedPrompt": "첫 회의에서 단정하고 여유롭게 보이는 메이크업",
            "tags": ["업무", "단정"],
          },
        ],
      },
    ],
  )

  async def fake_generate_json(*_args, **_kwargs):
    return next(responses)

  monkeypatch.setattr("app.services.makeup_recommendation.generate_json", fake_generate_json)

  result = await generate_scenarios(Settings(), 2, ["공항 출국 레전드"])

  assert [item["text"] for item in result["items"]] == ["새벽 서점의 온도", "첫 회의의 여유"]


@pytest.mark.asyncio
async def test_scenario_prompt_uses_curated_copy_direction(monkeypatch: pytest.MonkeyPatch) -> None:
  captured: dict[str, str] = {}

  async def fake_generate_json(_settings, _model_id, system, prompt):
    captured["system"] = system
    captured["prompt"] = prompt
    return {
      "items": [
        {
          "id": "fresh",
          "text": "첫 회의의 여유",
          "seedPrompt": "첫 회의에서 단정하고 여유롭게 보이는 메이크업",
          "tags": ["업무", "단정"],
        },
      ],
    }

  monkeypatch.setattr("app.services.makeup_recommendation.generate_json", fake_generate_json)

  await generate_scenarios(Settings(), 1, [])

  assert "공항 출국 레전드" in captured["prompt"]
  assert "점 하나 찍고 컴백" in captured["prompt"]
  assert "증명사진 잘 나오기" in captured["prompt"]
  assert "나다운 프로필 사진" in captured["prompt"]
  assert "성수동 느좋 감성" in captured["prompt"]
  assert "generic" in captured["system"].casefold()


@pytest.mark.asyncio
async def test_makeup_generators_route_to_configured_model_ids(monkeypatch: pytest.MonkeyPatch) -> None:
  calls: list[str] = []

  async def fake_generate_json(_settings, model_id, _system, prompt):
    calls.append(model_id)
    if '"items"' in prompt:
      return {
        "items": [{
          "id": "scenario",
          "text": "첫 회의의 여유",
          "seedPrompt": "첫 회의에서 단정하고 여유롭게 보이는 메이크업",
          "tags": ["업무"],
        }],
      }
    if '"questions"' in prompt and "Return exactly this shape" not in prompt:
      return {
        "questions": [{
          "id": "mood",
          "title": "어떤 방향이 좋아요?",
          "options": [
            {"id": "soft", "label": "은은하게"},
            {"id": "clear", "label": "또렷하게"},
            {"id": "bold", "label": "과감하게"},
            {"id": "ai_pick", "label": "AI가 골라줘"},
          ],
        }],
      }
    areas = ("base", "brow", "eye", "cheek", "lip")
    return {
      "looks": [
        {
          "id": role,
          "role": role,
          "title": role,
          "summary": f"{role} summary",
          "reasons": ["선택한 조건 반영"],
          "appliedConditions": ["퇴근 후 약속"],
          "durationMinutes": 20,
          "difficulty": "medium",
          "steps": [
            {"order": index, "area": area, "instruction": f"{area} 표현"}
            for index, area in enumerate(areas, start=1)
          ],
          "products": [
            {
              "area": area,
              "brandName": "브랜드",
              "productName": f"{area} 제품",
              "shadeName": "01",
              "reason": "조화로운 색",
            }
            for area in areas[:3]
          ],
        }
        for role in ("anchor", "bold", "discovery")
      ],
    }

  monkeypatch.setattr("app.services.makeup_recommendation.generate_json", fake_generate_json)
  settings = Settings(
    bedrock_scenario_model_id="scenario-haiku",
    bedrock_question_model_id="question-haiku",
    bedrock_recommendation_model_id="recommendation-sonnet",
  )

  await generate_scenarios(settings, 1, [])
  await generate_questions(settings, "퇴근 후 약속", [])
  await generate_recommendation(settings, "퇴근 후 약속", [], [], [])

  assert calls == ["scenario-haiku", "question-haiku", "recommendation-sonnet"]


@pytest.mark.asyncio
async def test_question_prompt_asks_for_story_direction_instead_of_makeup_specs(monkeypatch: pytest.MonkeyPatch) -> None:
  captured: dict[str, str] = {}

  async def fake_generate_json(_settings, _model_id, system, prompt):
    captured["system"] = system
    captured["prompt"] = prompt
    return {
      "questions": [{
        "id": "presence",
        "title": "평소보다 얼마나 과감해질까요?",
        "options": [
          {"id": "familiar", "label": "평소의 나답게"},
          {"id": "different", "label": "조금 낯설게"},
          {"id": "bold", "label": "확실히 달라지게"},
          {"id": "ai_pick", "label": "AI가 골라줘"},
        ],
      }],
    }

  monkeypatch.setattr("app.services.makeup_recommendation.generate_json", fake_generate_json)

  await generate_questions(
    Settings(),
    "사진에서 또렷하되 과하게 꾸민 느낌은 피하는 메이크업",
    ["공항", "사진"],
    "공항 출국 레전드",
  )

  assert "어디에서 어떻게 보이고 싶은지" in captured["system"]
  assert "어떤 분위기가 끌리는지" in captured["system"]
  assert "평소보다 얼마나 과감해지고 싶은지" in captured["system"]
  assert "시간과 난이도를 어느 정도 감수할지" in captured["system"]
  assert "색상, 질감, 강조 부위" in captured["system"]
  assert "정확히 4개" in captured["system"]
  assert "서로 배타적" in captured["system"]
  assert "피부톤" in captured["system"]
  assert "언더톤" in captured["system"]
  assert "퍼스널컬러" in captured["system"]
  assert "밝은 톤/중간 톤/어두운 톤/쿨 톤/웜 톤" in captured["system"]
  assert "재미" in captured["system"]
  assert "공항 출국 레전드" in captured["prompt"]
  assert "exactly 4 options" in captured["prompt"]


@pytest.mark.asyncio
async def test_generated_scenario_ids_do_not_depend_on_repeated_model_ids(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_generate_json(*_args, **_kwargs):
    return {
      "items": [
        {
          "id": "scenario-1",
          "text": "새벽 서점의 온도",
          "seedPrompt": "차분한 브라운과 낮은 채도의 지적인 메이크업",
          "tags": ["차분"],
        },
        {
          "id": "scenario-1",
          "text": "첫 회의의 여유",
          "seedPrompt": "첫 회의에서 단정하고 여유롭게 보이는 메이크업",
          "tags": ["업무"],
        },
      ],
    }

  monkeypatch.setattr("app.services.makeup_recommendation.generate_json", fake_generate_json)

  result = await generate_scenarios(Settings(), 2, [])

  ids = [item["id"] for item in result["items"]]
  assert len(set(ids)) == 2
  assert all(value.startswith("generated-") for value in ids)


@pytest.mark.asyncio
async def test_scenarios_reject_exact_duplicates_with_generic_only_copy(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_generate_json(*_args, **_kwargs):
    return {
      "items": [
        {
          "id": "generic-1",
          "text": "오늘 하루",
          "seedPrompt": "가볍고 편안한 데일리 메이크업",
          "tags": ["데일리"],
        },
        {
          "id": "generic-2",
          "text": "오늘 하루",
          "seedPrompt": "가볍고 편안한 데일리 메이크업",
          "tags": ["데일리"],
        },
        {
          "id": "fresh",
          "text": "첫 회의의 여유",
          "seedPrompt": "첫 회의에서 단정하고 여유롭게 보이는 메이크업",
          "tags": ["업무"],
        },
      ],
    }

  monkeypatch.setattr("app.services.makeup_recommendation.generate_json", fake_generate_json)

  result = await generate_scenarios(Settings(), 2, [])

  assert [item["text"] for item in result["items"]] == ["오늘 하루", "첫 회의의 여유"]


@pytest.mark.asyncio
async def test_scenarios_reject_unsafe_copy_before_it_can_be_shared(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_generate_json(*_args, **_kwargs):
    return {
      "items": [
        {
          "id": "unsafe",
          "text": "못생긴 얼굴 탈출",
          "seedPrompt": "반드시 얼굴을 작고 하얗게 바꿔주는 메이크업",
          "tags": ["외모 변화"],
        },
        {
          "id": "safe",
          "text": "첫 회의의 여유",
          "seedPrompt": "첫 회의에서 단정하고 여유롭게 보이는 메이크업",
          "tags": ["업무", "단정"],
        },
      ],
    }

  monkeypatch.setattr("app.services.makeup_recommendation.generate_json", fake_generate_json)

  result = await generate_scenarios(Settings(), 1, [])

  assert [item["text"] for item in result["items"]] == ["첫 회의의 여유"]


class SharedScenarioDatabase:
  def __init__(self, rows: list[dict] | None = None) -> None:
    self.rows = list(rows or [])
    self.executed: list[tuple[str, tuple]] = []

  async def fetch(self, query: str, *args):
    assert "from makeup_scenario_library" in query
    return list(self.rows)

  async def fetchrow(self, query: str, *args):
    assert "insert into makeup_scenario_library" in query
    row = {
      "id": UUID(f"00000000-0000-0000-0000-{len(self.rows) + 1:012d}"),
      "text": args[0],
      "seed_prompt": args[2],
      "tags": json.loads(args[3]),
    }
    self.rows.append(row)
    return row

  async def execute(self, query: str, *args):
    self.executed.append((query, args))
    return "UPDATE 1"


class CapturingScenarioDatabase:
  def __init__(self, result: dict | None = None) -> None:
    self.result = result
    self.last_query = ""
    self.last_args: tuple = ()

  async def fetchrow(self, query: str, *args):
    self.last_query = query
    self.last_args = args
    return self.result


@pytest.mark.asyncio
async def test_persist_statement_serializes_and_caps_ai_rows() -> None:
  db = CapturingScenarioDatabase()
  item = {
    "id": "generated-safe",
    "text": "첫 발표의 집중",
    "seedPrompt": "단정한 음영과 선명한 립 포인트",
    "tags": ["업무"],
  }

  result = await makeup_service._persist_generated_scenario(db, item, "model-id", USER_ID)

  assert result is None
  query = db.last_query.casefold()
  assert "pg_advisory_xact_lock" in query
  assert "count(*)" in query
  assert "source = 'ai'" in query
  assert "ai_count < 2000" in query
  assert "ai_count >= 2000" in query
  assert "status = 'active'" in query
  assert "last_served_at < now() - interval '7 days'" in query
  assert "for update skip locked" in query
  assert db.last_args[0] == item["text"]
  assert db.last_args[-1] == USER_ID


@pytest.mark.asyncio
async def test_unstored_generated_card_is_returned_with_ephemeral_id(monkeypatch: pytest.MonkeyPatch) -> None:
  class FullRecentLibraryDatabase(SharedScenarioDatabase):
    async def fetchrow(self, _query: str, *_args):
      return None

  db = FullRecentLibraryDatabase()

  async def fake_generate(_settings, _count, _exclude_texts):
    return {
      "items": [
        {
          "id": "generated-ephemeral",
          "text": "오후 네 시 티룸",
          "seedPrompt": "차분한 로즈 음영과 촉촉한 입술",
          "tags": ["차분"],
        },
      ],
    }

  monkeypatch.setattr("app.services.makeup_recommendation.generate_scenarios", fake_generate)

  result = await generate_shared_scenarios(Settings(), db, 1, [], USER_ID)

  assert result["items"] == [
    {
      "id": "generated-ephemeral",
      "text": "오후 네 시 티룸",
      "seedPrompt": "차분한 로즈 음영과 촉촉한 입술",
      "tags": ["차분"],
    },
  ]


@pytest.mark.asyncio
async def test_shared_scenarios_mix_library_with_fresh_generation_and_persist(monkeypatch: pytest.MonkeyPatch) -> None:
  stored_texts = [
    "새벽 서점의 온도",
    "첫 회의의 여유",
    "비 오는 창가",
    "한강 노을 산책",
    "일요일 브런치",
    "밤 기차의 여운",
    "전시 오프닝",
    "퇴근 후 재즈바",
    "겨울 아침 햇살",
    "옥상 영화제",
  ]
  stored_rows = [
    {
      "id": UUID(f"10000000-0000-0000-0000-{index + 1:012d}"),
      "text": text,
      "seed_prompt": f"공유 메이크업 방향 {index + 1}",
      "tags": ["공유"],
    }
    for index, text in enumerate(stored_texts)
  ]
  db = SharedScenarioDatabase(stored_rows)
  generated_counts: list[int] = []
  fresh_texts = ["눈 내린 극장 앞", "여름밤 루프탑", "첫 발표의 집중", "오후 네 시 티룸"]

  async def fake_generate(_settings, count, _exclude_texts):
    generated_counts.append(count)
    return {
      "items": [
        {
          "id": f"generated-{index + 1}",
          "text": fresh_texts[index],
          "seedPrompt": f"새 메이크업 방향 {index + 1}",
          "tags": ["신규"],
        }
        for index in range(count)
      ],
    }

  monkeypatch.setattr("app.services.makeup_recommendation.generate_scenarios", fake_generate)

  result = await generate_shared_scenarios(
    Settings(bedrock_scenario_model_id="global.anthropic.claude-haiku-4-5-20251001-v1:0"),
    db,
    12,
    [],
    USER_ID,
  )

  assert generated_counts == [4]
  assert len(result["items"]) == 12
  assert [item["text"] for item in result["items"][:8]] == stored_texts[:8]
  assert [item["text"] for item in result["items"][8:]] == fresh_texts
  assert len(db.rows) == 14
  assert all(str(item["id"]) for item in result["items"])
  assert any("usage_count = usage_count + 1" in query for query, _args in db.executed)
  assert any("last_served_at = now()" in query for query, _args in db.executed)


@pytest.mark.asyncio
async def test_shared_scenarios_skip_excluded_and_near_duplicate_library_cards(monkeypatch: pytest.MonkeyPatch) -> None:
  db = SharedScenarioDatabase(
    [
      {
        "id": UUID("20000000-0000-0000-0000-000000000001"),
        "text": "공항 출국 사진 레전드",
        "seed_prompt": "공항에서 또렷하게 보이는 메이크업",
        "tags": ["공항"],
      },
      {
        "id": UUID("20000000-0000-0000-0000-000000000002"),
        "text": "새벽 서점의 온도",
        "seed_prompt": "차분한 브라운 메이크업",
        "tags": ["차분"],
      },
    ],
  )

  async def fake_generate(_settings, count, _exclude_texts):
    fresh_texts = ["눈 내린 극장 앞", "여름밤 루프탑", "첫 발표의 집중", "오후 네 시 티룸"]
    return {
      "items": [
        {
          "id": f"fresh-{index}",
          "text": fresh_texts[index],
          "seedPrompt": f"새 장면 메이크업 {index}",
          "tags": ["신규"],
        }
        for index in range(count)
      ],
    }

  monkeypatch.setattr("app.services.makeup_recommendation.generate_scenarios", fake_generate)

  result = await generate_shared_scenarios(Settings(), db, 5, ["공항 출국 레전드"], USER_ID)

  assert "공항 출국 사진 레전드" not in [item["text"] for item in result["items"]]
  assert "새벽 서점의 온도" in [item["text"] for item in result["items"]]


@pytest.mark.asyncio
async def test_shared_scenarios_never_reactivate_or_return_disabled_cards(monkeypatch: pytest.MonkeyPatch) -> None:
  disabled_row = {
    "id": UUID("30000000-0000-0000-0000-000000000001"),
    "text": "차단된 카드",
    "seed_prompt": "차단된 메이크업 방향",
    "tags": [],
    "status": "disabled",
  }

  class DisabledScenarioDatabase(SharedScenarioDatabase):
    async def fetchrow(self, query: str, *args):
      assert "insert into makeup_scenario_library" in query
      return disabled_row

  db = DisabledScenarioDatabase([disabled_row])

  async def fake_generate(_settings, _count, _exclude_texts):
    return {
      "items": [
        {
          "id": "regenerated-disabled",
          "text": "차단된 카드",
          "seedPrompt": "차단된 메이크업 방향",
          "tags": [],
        },
      ],
    }

  monkeypatch.setattr("app.services.makeup_recommendation.generate_scenarios", fake_generate)

  with pytest.raises(AppError) as exc_info:
    await generate_shared_scenarios(Settings(), db, 1, [], USER_ID)

  assert exc_info.value.code == "BEDROCK_INSUFFICIENT_SCENARIOS"


@pytest.mark.asyncio
async def test_shared_scenarios_reject_partial_fresh_generation(monkeypatch: pytest.MonkeyPatch) -> None:
  stored_texts = [
    "새벽 서점의 온도",
    "첫 회의의 여유",
    "비 오는 창가",
    "한강 노을 산책",
    "일요일 브런치",
    "밤 기차의 여운",
    "전시 오프닝",
    "퇴근 후 재즈바",
    "겨울 아침 햇살",
    "옥상 영화제",
    "낮잠 뒤 산책",
    "오래된 LP 바",
  ]
  db = SharedScenarioDatabase(
    [
      {
        "id": UUID(f"40000000-0000-0000-0000-{index + 1:012d}"),
        "text": text,
        "seed_prompt": f"메이크업 방향 {index + 1}",
        "tags": [],
        "status": "active",
      }
      for index, text in enumerate(stored_texts)
    ],
  )

  async def fake_generate(_settings, _count, _exclude_texts):
    return {
      "items": [
        {
          "id": "only-fresh",
          "text": "눈 내린 극장 앞",
          "seedPrompt": "차가운 광택과 또렷한 립의 메이크업",
          "tags": ["겨울"],
        },
      ],
    }

  monkeypatch.setattr("app.services.makeup_recommendation.generate_scenarios", fake_generate)

  with pytest.raises(AppError) as exc_info:
    await generate_shared_scenarios(Settings(), db, 12, [], USER_ID)

  assert exc_info.value.code == "BEDROCK_INSUFFICIENT_SCENARIOS"
  assert exc_info.value.details == {"requestedFresh": 4, "generatedFresh": 1}


@pytest.mark.asyncio
async def test_questions_reject_malformed_option_counts(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_generate_json(*_args, **_kwargs):
    return {
      "questions": [
        {
          "id": "mood",
          "title": "어떤 분위기가 좋아요?",
          "options": [
            {"id": "fresh", "label": "맑게"},
            {"id": "calm", "label": "차분하게"},
            {"id": "bold", "label": "또렷하게"},
            {"id": "soft", "label": "부드럽게"},
          ],
        },
      ],
    }

  monkeypatch.setattr("app.services.makeup_recommendation.generate_json", fake_generate_json)

  with pytest.raises(AppError) as exc_info:
    await generate_questions(Settings(), "퇴근 후 약속", ["차분"])

  assert exc_info.value.code == "BEDROCK_INVALID_QUESTIONS"


@pytest.mark.asyncio
async def test_questions_reject_more_than_four_options(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_generate_json(*_args, **_kwargs):
    return {
      "questions": [
        {
          "id": "story_direction",
          "title": "오늘의 반전은 어느 쪽이에요?",
          "options": [
            {"id": "quiet", "label": "조용히 시선 끌기"},
            {"id": "entrance", "label": "등장부터 장면 만들기"},
            {"id": "afterimage", "label": "돌아선 뒤 여운 남기기"},
            {"id": "closeup", "label": "가까이서 반전 보이기"},
            {"id": "ai_pick", "label": "AI가 골라줘"},
          ],
        },
      ],
    }

  monkeypatch.setattr("app.services.makeup_recommendation.generate_json", fake_generate_json)

  with pytest.raises(AppError) as exc_info:
    await generate_questions(Settings(), "퇴근 후 약속", ["반전"])

  assert exc_info.value.code == "BEDROCK_INVALID_QUESTIONS"


@pytest.mark.asyncio
async def test_questions_reject_skin_tone_and_undertone_axes(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_generate_json(*_args, **_kwargs):
    return {
      "questions": [
        {
          "id": "skin_tone",
          "title": "피부톤은 어디에 가까워요?",
          "options": [
            {"id": "light", "label": "밝은 톤"},
            {"id": "cool", "label": "쿨 톤"},
            {"id": "warm", "label": "웜 톤"},
            {"id": "ai_pick", "label": "AI가 골라줘"},
          ],
        },
      ],
    }

  monkeypatch.setattr("app.services.makeup_recommendation.generate_json", fake_generate_json)

  with pytest.raises(AppError) as exc_info:
    await generate_questions(Settings(), "공항 출국 레전드", ["사진"])

  assert exc_info.value.code == "BEDROCK_INVALID_QUESTIONS"


@pytest.mark.asyncio
async def test_recommendation_requires_three_distinct_roles(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_generate_json(*_args, **_kwargs):
    return {
      "looks": [
        {
          "id": "only-one",
          "role": "anchor",
          "title": "한 가지",
          "summary": "한 가지만 생성됨",
          "reasons": ["이유"],
          "appliedConditions": ["조건"],
          "durationMinutes": 10,
          "difficulty": "easy",
          "steps": [{"order": 1, "area": "base", "instruction": "얇게 바르기"}],
          "products": [],
        },
      ],
    }

  monkeypatch.setattr("app.services.makeup_recommendation.generate_json", fake_generate_json)

  with pytest.raises(AppError) as exc_info:
    await generate_recommendation(Settings(), "퇴근 후 약속", [], [], [])

  assert exc_info.value.code == "BEDROCK_INVALID_RECOMMENDATION"


def test_makeup_recommendation_image_can_be_queued(monkeypatch: pytest.MonkeyPatch) -> None:
  sent: dict = {}

  class FakeSQS:
    def send_message(self, **kwargs):
      sent.update(kwargs)
      return {"MessageId": "makeup-image-1"}

  monkeypatch.setattr("app.services.ai_job_queue.boto3.client", lambda *_args, **_kwargs: FakeSQS())
  result = AIJobQueuePublisher(
    Settings(sqs_ai_job_queue_url="https://sqs.ap-northeast-2.amazonaws.com/123/jobs"),
  ).publish_makeup_recommendation_job(REPORT_ID, USER_ID)

  assert json.loads(sent["MessageBody"])["jobType"] == "makeup_recommendation"
  assert result["messageId"] == "makeup-image-1"


@pytest.mark.asyncio
async def test_recommendation_image_is_generated_and_uploaded(monkeypatch: pytest.MonkeyPatch) -> None:
  uploaded: dict = {}

  class FakeImages:
    def generate(self, **_kwargs):
      return type("Response", (), {"data": [type("Image", (), {"b64_json": "aW1hZ2U="})()]})()

  class FakeOpenAI:
    def __init__(self, **_kwargs):
      self.images = FakeImages()

  class FakeS3:
    def put_object(self, **kwargs):
      uploaded.update(kwargs)

  monkeypatch.setattr("app.services.makeup_recommendation_image.OpenAI", FakeOpenAI)
  monkeypatch.setattr("app.services.makeup_recommendation_image.boto3.client", lambda *_args, **_kwargs: FakeS3())

  image_url = await generate_recommendation_image(
    Settings(
      openai_api_key="test-key",
      s3_bucket_name="makeup-bucket",
      cdn_base_url="https://cdn.example.com",
      openai_image_model_id="gpt-image-2",
    ),
    REPORT_ID,
    "퇴근 후 약속",
    {"title": "잔잔한 저녁", "summary": "부드러운 음영", "steps": []},
  )

  assert image_url.startswith("https://cdn.example.com/uploads/generated-makeup-recommendations/")
  assert uploaded["Bucket"] == "makeup-bucket"
  assert uploaded["Body"] == b"image"


@pytest.mark.asyncio
async def test_all_three_recommendation_looks_receive_images(monkeypatch: pytest.MonkeyPatch) -> None:
  uploads: list[dict] = []

  class FakeImages:
    def generate(self, **_kwargs):
      return type("Response", (), {"data": [type("Image", (), {"b64_json": "aW1hZ2U="})()]})()

  class FakeOpenAI:
    def __init__(self, **_kwargs):
      self.images = FakeImages()

  class FakeS3:
    def put_object(self, **kwargs):
      uploads.append(kwargs)

  monkeypatch.setattr("app.services.makeup_recommendation_image.OpenAI", FakeOpenAI)
  monkeypatch.setattr("app.services.makeup_recommendation_image.boto3.client", lambda *_args, **_kwargs: FakeS3())
  looks = [
    {"id": role, "role": role, "title": role, "summary": role, "steps": []}
    for role in ("anchor", "bold", "discovery")
  ]

  generated = await generate_recommendation_images(
    Settings(openai_api_key="key", s3_bucket_name="bucket", cdn_base_url="https://cdn.example.com"),
    REPORT_ID,
    "퇴근 후 약속",
    looks,
  )

  assert len(uploads) == 3
  assert [look["role"] for look in generated] == ["anchor", "bold", "discovery"]
  assert all(look["imageUrl"].startswith("https://cdn.example.com/") for look in generated)


@pytest.mark.asyncio
async def test_inline_image_generation_is_scheduled_as_background_task() -> None:
  background_tasks = BackgroundTasks()

  await makeup_api.dispatch_recommendation_image_job(
    db=object(),
    background_tasks=background_tasks,
    report_id=REPORT_ID,
    user_id=USER_ID,
    settings=Settings(ai_job_execution_mode="inline"),
  )

  assert len(background_tasks.tasks) == 1
  assert background_tasks.tasks[0].func is makeup_api.run_recommendation_image_job


@pytest.mark.asyncio
async def test_worker_dispatches_makeup_recommendation_image(monkeypatch: pytest.MonkeyPatch) -> None:
  called: dict = {}

  async def fake_run(report_id, user_id, settings, *, db):
    called.update(report_id=report_id, user_id=user_id, settings=settings, db=db)

  monkeypatch.setattr(job_dispatcher, "run_recommendation_image_job", fake_run)
  db = object()
  settings = Settings()
  dispatcher = AIJobDispatcher(settings, db)  # type: ignore[arg-type]

  await dispatcher.dispatch(
    ParsedAIJobMessage(
      version=1,
      job_type="makeup_recommendation",
      job_id=REPORT_ID,
      user_id=USER_ID,
      payload={},
    ),
  )

  assert called == {"report_id": REPORT_ID, "user_id": USER_ID, "settings": settings, "db": db}


@pytest.mark.asyncio
async def test_image_job_persists_three_generated_look_urls(monkeypatch: pytest.MonkeyPatch) -> None:
  class FakeDB:
    def __init__(self) -> None:
      self.executed: list[tuple[str, tuple]] = []

    async def fetchrow(self, _query: str, *_args):
      return {
        "id": REPORT_ID,
        "user_id": USER_ID,
        "scenario_text": "퇴근 후 약속",
        "recommendation": {
          "looks": [{"id": role, "role": role} for role in ("anchor", "bold", "discovery")],
        },
        "image_status": "pending",
      }

    async def execute(self, query: str, *args):
      self.executed.append((query, args))
      return "UPDATE 1"

  async def fake_generate_images(_settings, _report_id, _scenario_text, looks):
    return [{**look, "imageUrl": f"https://cdn.example.com/{look['role']}.png"} for look in looks]

  monkeypatch.setattr(makeup_api, "generate_recommendation_images", fake_generate_images)
  db = FakeDB()

  await makeup_api.run_recommendation_image_job(REPORT_ID, USER_ID, Settings(), db=db)  # type: ignore[arg-type]

  completed_query, completed_args = db.executed[-1]
  assert "recommendation = $2::jsonb" in completed_query
  saved_recommendation = json.loads(completed_args[1])
  assert len(saved_recommendation["looks"]) == 3
  assert saved_recommendation["looks"][2]["imageUrl"].endswith("discovery.png")


@pytest.mark.asyncio
async def test_image_job_ignores_duplicate_delivery_when_atomic_claim_fails(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class FakeDB:
    def __init__(self) -> None:
      self.claim_query = ""
      self.executed = False

    async def fetchrow(self, query: str, *_args):
      self.claim_query = query
      return None

    async def execute(self, _query: str, *_args):
      self.executed = True
      return "UPDATE 1"

  generated = False

  async def fake_generate_images(*_args, **_kwargs):
    nonlocal generated
    generated = True
    return []

  monkeypatch.setattr(makeup_api, "generate_recommendation_images", fake_generate_images)
  db = FakeDB()

  await makeup_api.run_recommendation_image_job(REPORT_ID, USER_ID, Settings(), db=db)  # type: ignore[arg-type]

  assert "update makeup_recommendation_reports" in db.claim_query
  assert "image_status = 'pending'" in db.claim_query
  assert "updated_at < now() - interval '15 minutes'" in db.claim_query
  assert "returning" in db.claim_query
  assert generated is False
  assert db.executed is False
