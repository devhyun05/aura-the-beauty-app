import base64
from uuid import UUID

import pytest

from app.api import web_trial
from app.core.errors import AppError
from app.core.settings import Settings


JPEG_BYTES = b"\xff\xd8\xff\xe0aura-web-trial"


def _settings(**overrides) -> Settings:
  return Settings(
    database_url=None,
    s3_bucket_name="media-bucket",
    web_trial_api_key="test-web-trial-key",
    web_trial_enabled=True,
    **overrides,
  )


@pytest.fixture(autouse=True)
def clear_web_trial_state():
  web_trial._jobs.clear()
  web_trial._job_tasks.clear()
  web_trial._request_times.clear()
  yield
  web_trial._jobs.clear()
  web_trial._job_tasks.clear()
  web_trial._request_times.clear()


def test_web_trial_rejects_missing_shared_secret() -> None:
  with pytest.raises(AppError) as exc_info:
    web_trial._authorize(
      client_id="client-digest-1234567890",
      provided_key=None,
      settings=_settings(),
    )

  assert exc_info.value.status_code == 401
  assert exc_info.value.code == "WEB_TRIAL_UNAUTHORIZED"


def test_web_trial_requires_explicit_ai_consent() -> None:
  payload = web_trial.WebTrialFaceAnalysisCreate(
    consentAccepted=False,
    contentType="image/jpeg",
    imageBase64=base64.b64encode(JPEG_BYTES).decode(),
  )

  with pytest.raises(AppError) as exc_info:
    web_trial._decode_image(payload, _settings())

  assert exc_info.value.status_code == 403
  assert exc_info.value.code == "AI_DATA_CONSENT_REQUIRED"


@pytest.mark.parametrize(
  ("content_type", "image_bytes"),
  [
    ("image/jpeg", b"not-a-jpeg"),
    ("image/png", JPEG_BYTES),
  ],
)
def test_web_trial_rejects_invalid_image_signature(
  content_type: str,
  image_bytes: bytes,
) -> None:
  payload = web_trial.WebTrialFaceAnalysisCreate(
    consentAccepted=True,
    contentType=content_type,
    imageBase64=base64.b64encode(image_bytes).decode(),
  )

  with pytest.raises(AppError) as exc_info:
    web_trial._decode_image(payload, _settings())

  assert exc_info.value.code == "WEB_TRIAL_IMAGE_TYPE_MISMATCH"


@pytest.mark.asyncio
async def test_web_trial_analysis_deletes_temporary_source(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: list[tuple[str, str]] = []

  class FakeS3:
    def __init__(self, _settings: Settings) -> None:
      pass

    def put_private_object(self, **kwargs) -> None:
      calls.append(("put", kwargs["object_key"]))

    def delete_object_permanently(self, **kwargs) -> None:
      calls.append(("delete", kwargs["object_key"]))

  class FakeAnalysis:
    def __init__(self, _settings: Settings) -> None:
      pass

    async def analyze_text(self, payload):
      assert payload["source"] == "web_trial"
      return {"personalColor": {"label": "여름 라이트"}, "faceShape": "둥근형"}

  monkeypatch.setattr(web_trial, "S3Service", FakeS3)
  monkeypatch.setattr(web_trial, "OpenAIAnalysisService", FakeAnalysis)
  job_id = UUID("11111111-1111-1111-1111-111111111111")
  web_trial._jobs[job_id] = web_trial.WebTrialJob(
    client_id="client-digest-1234567890",
    created_at=0,
  )

  await web_trial._run_face_analysis_job(
    job_id,
    JPEG_BYTES,
    "image/jpeg",
    _settings(),
  )

  job = web_trial._jobs[job_id]
  assert job.status == "completed"
  assert job.result == {
    "personalColor": {"label": "여름 라이트"},
    "faceShape": "둥근형",
  }
  assert [name for name, _key in calls] == ["put", "delete"]
  assert calls[0][1] == calls[1][1]


@pytest.mark.asyncio
async def test_web_trial_analysis_failure_still_deletes_source(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: list[str] = []

  class FakeS3:
    def __init__(self, _settings: Settings) -> None:
      pass

    def put_private_object(self, **kwargs) -> None:
      calls.append("put")

    def delete_object_permanently(self, **kwargs) -> None:
      calls.append("delete")

  class FailingAnalysis:
    def __init__(self, _settings: Settings) -> None:
      pass

    async def analyze_text(self, _payload):
      raise AppError(502, "AI_INVOCATION_FAILED", "provider detail")

  monkeypatch.setattr(web_trial, "S3Service", FakeS3)
  monkeypatch.setattr(web_trial, "OpenAIAnalysisService", FailingAnalysis)
  job_id = UUID("22222222-2222-2222-2222-222222222222")
  web_trial._jobs[job_id] = web_trial.WebTrialJob(
    client_id="client-digest-1234567890",
    created_at=0,
  )

  await web_trial._run_face_analysis_job(
    job_id,
    JPEG_BYTES,
    "image/jpeg",
    _settings(),
  )

  assert web_trial._jobs[job_id].status == "failed"
  assert web_trial._jobs[job_id].error_code == "AI_INVOCATION_FAILED"
  assert calls == ["put", "delete"]


def test_web_trial_rate_limit_is_per_client() -> None:
  settings = _settings(web_trial_rate_limit_per_hour=1)
  web_trial._enforce_rate_limit("client-one-123456789", settings)

  with pytest.raises(AppError) as exc_info:
    web_trial._enforce_rate_limit("client-one-123456789", settings)

  assert exc_info.value.code == "WEB_TRIAL_RATE_LIMITED"
  web_trial._enforce_rate_limit("client-two-123456789", settings)
