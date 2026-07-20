import pytest
from botocore.credentials import Credentials

from app.core.settings import Settings
from app.services.beard_lambda import BeardLambdaClient


FUNCTION_URL = "https://beardfn.lambda-url.us-west-2.on.aws/"


class _FakeSession:
  def __init__(self, credentials: Credentials) -> None:
    self._credentials = credentials

  def get_credentials(self) -> Credentials:
    return self._credentials


class _FakeResponse:
  status_code = 200

  def json(self) -> dict:
    return {"ok": True}


def _authorization_header(captured: dict) -> str:
  headers = {key.lower(): value for key, value in captured["headers"].items()}

  return headers["authorization"]


async def _run_signed_invoke(monkeypatch: pytest.MonkeyPatch, settings: Settings) -> dict:
  captured: dict = {}
  credentials = Credentials("AKIAFAKEEXAMPLE", "fake-secret-key")

  def fake_session_factory(**kwargs):
    captured["session_kwargs"] = kwargs
    return _FakeSession(credentials)

  class _FakeAsyncClient:
    def __init__(self, *args, **kwargs) -> None:
      captured["timeout"] = kwargs.get("timeout")

    async def __aenter__(self):
      return self

    async def __aexit__(self, *exc) -> bool:
      return False

    async def post(self, url, *, content, headers):
      captured["url"] = url
      captured["content"] = content
      captured["headers"] = dict(headers)
      return _FakeResponse()

  monkeypatch.setattr("app.services.beard_lambda.boto3.Session", fake_session_factory)
  monkeypatch.setattr("app.services.beard_lambda.httpx.AsyncClient", _FakeAsyncClient)

  captured["result"] = await BeardLambdaClient(settings).upload_url("user-1")

  return captured


@pytest.mark.asyncio
async def test_beard_lambda_signs_with_named_aws_profile(monkeypatch: pytest.MonkeyPatch) -> None:
  captured = await _run_signed_invoke(
    monkeypatch,
    Settings(
      aws_profile_name="beard-dev",
      beard_lambda_function_url=FUNCTION_URL,
      beard_lambda_region="us-west-2",
    ),
  )

  assert captured["session_kwargs"] == {"profile_name": "beard-dev"}
  assert captured["url"] == FUNCTION_URL
  assert captured["timeout"] == 10.0

  authorization = _authorization_header(captured)

  assert authorization.startswith("AWS4-HMAC-SHA256 ")
  assert "/us-west-2/lambda/aws4_request" in authorization


@pytest.mark.asyncio
async def test_beard_lambda_signs_with_explicit_access_keys(monkeypatch: pytest.MonkeyPatch) -> None:
  captured = await _run_signed_invoke(
    monkeypatch,
    Settings(
      aws_access_key_id="AKIAEXAMPLE",
      aws_secret_access_key="secret",
      beard_lambda_function_url=FUNCTION_URL,
      beard_lambda_region="us-west-2",
    ),
  )

  assert captured["session_kwargs"] == {
    "aws_access_key_id": "AKIAEXAMPLE",
    "aws_secret_access_key": "secret",
  }

  authorization = _authorization_header(captured)

  assert authorization.startswith("AWS4-HMAC-SHA256 ")
  assert "/us-west-2/lambda/aws4_request" in authorization


@pytest.mark.asyncio
async def test_beard_lambda_signs_with_default_credential_chain(monkeypatch: pytest.MonkeyPatch) -> None:
  captured = await _run_signed_invoke(
    monkeypatch,
    Settings(
      aws_use_iam_role=True,
      beard_lambda_function_url=FUNCTION_URL,
      beard_lambda_region="us-west-2",
    ),
  )

  # Default provider chain: no explicit session kwargs.
  assert captured["session_kwargs"] == {}

  authorization = _authorization_header(captured)

  assert authorization.startswith("AWS4-HMAC-SHA256 ")
  assert "/us-west-2/lambda/aws4_request" in authorization
