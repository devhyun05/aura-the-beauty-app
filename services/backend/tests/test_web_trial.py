import base64
import hashlib
import time
from uuid import UUID

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

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


def test_web_trial_accepts_fresh_asymmetric_signature(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  private_key = ec.generate_private_key(ec.SECP256R1())
  monkeypatch.setattr(web_trial, "_WEB_TRIAL_PUBLIC_KEY", private_key.public_key())
  body = b'{"consentAccepted":true}'
  client_id = "client-digest-1234567890"
  timestamp = str(round(time.time()))
  path = "/api/web-trial/face-analysis/jobs"
  message = (
    f"{timestamp}\nPOST\nweb-trial/face-analysis/jobs\n{client_id}\n"
    f"{hashlib.sha256(body).hexdigest()}"
  ).encode()
  der_signature = private_key.sign(message, ec.ECDSA(hashes.SHA256()))
  r, s = decode_dss_signature(der_signature)
  signature = base64.b64encode(
    r.to_bytes(32, "big") + s.to_bytes(32, "big"),
  ).decode()
  settings = _settings()
  settings.web_trial_api_key = None

  assert web_trial._authorize(
    body=body,
    client_id=client_id,
    method="POST",
    path=path,
    provided_key=None,
    signature=signature,
    settings=settings,
    timestamp=timestamp,
  ) == client_id


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
async def test_web_trial_analysis_uses_in_memory_source(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class FakeAnalysis:
    def __init__(self, _settings: Settings) -> None:
      pass

    async def analyze_text_bytes(self, payload, image_bytes):
      assert payload["source"] == "web_trial"
      assert payload["contentType"] == "image/jpeg"
      assert image_bytes == JPEG_BYTES
      return {"personalColor": {"label": "여름 라이트"}, "faceShape": "둥근형"}

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


@pytest.mark.asyncio
async def test_web_trial_analysis_failure_returns_retryable_error(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class FailingAnalysis:
    def __init__(self, _settings: Settings) -> None:
      pass

    async def analyze_text_bytes(self, _payload, _image_bytes):
      raise AppError(502, "AI_INVOCATION_FAILED", "provider detail")

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


def test_web_trial_rate_limit_is_per_client() -> None:
  settings = _settings(web_trial_rate_limit_per_hour=1)
  web_trial._enforce_rate_limit("client-one-123456789", settings)

  with pytest.raises(AppError) as exc_info:
    web_trial._enforce_rate_limit("client-one-123456789", settings)

  assert exc_info.value.code == "WEB_TRIAL_RATE_LIMITED"
  web_trial._enforce_rate_limit("client-two-123456789", settings)
