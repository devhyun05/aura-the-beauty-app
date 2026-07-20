import json
from typing import Any

import boto3
import httpx
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest

from app.core.errors import AppError
from app.core.settings import Settings


# Lambda's own execution timeout is 30s; give simulate/result headroom above it
# and keep the lightweight status/upload_url/prewarm calls on a short leash.
STATUS_TIMEOUT_SECONDS = 10.0
INVOKE_TIMEOUT_SECONDS = 35.0


class BeardLambdaClient:
  def __init__(self, settings: Settings) -> None:
    self.settings = settings

  def _session(self) -> boto3.Session:
    # Mirror S3Service._client() credential resolution: named profile first,
    # then explicit keys (unless an IAM role is requested), then the default
    # provider chain (task role / instance profile / environment).
    if self.settings.aws_profile_name:
      return boto3.Session(profile_name=self.settings.aws_profile_name)

    if (
      self.settings.aws_access_key_id
      and self.settings.aws_secret_access_key
      and not self.settings.aws_use_iam_role
    ):
      return boto3.Session(
        aws_access_key_id=self.settings.aws_access_key_id,
        aws_secret_access_key=self.settings.aws_secret_access_key,
      )

    return boto3.Session()

  def _function_url(self) -> str:
    function_url = (self.settings.beard_lambda_function_url or "").strip()

    if not function_url:
      raise AppError(
        503,
        "BEARD_LAMBDA_NOT_CONFIGURED",
        "BEARD_LAMBDA_FUNCTION_URL is required for beard-removal orchestration.",
      )

    return function_url

  async def _invoke(
    self,
    action: str,
    payload: dict[str, Any],
    timeout: float,
  ) -> dict[str, Any]:
    function_url = self._function_url()
    body_bytes = json.dumps({"action": action, **payload}).encode("utf-8")

    request = AWSRequest(
      method="POST",
      url=function_url,
      data=body_bytes,
      headers={"Content-Type": "application/json"},
    )

    credentials = self._session().get_credentials()

    if credentials is None:
      raise AppError(
        503,
        "BEARD_LAMBDA_NOT_CONFIGURED",
        "AWS credentials are required to sign beard-removal Lambda requests.",
      )

    frozen_credentials = credentials.get_frozen_credentials()
    # Service name is the literal "lambda" for a Lambda Function URL.
    SigV4Auth(frozen_credentials, "lambda", self.settings.beard_lambda_region).add_auth(request)

    try:
      async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
          function_url,
          content=body_bytes,
          headers=dict(request.headers),
        )
    except httpx.TimeoutException as exc:
      raise AppError(504, "BEARD_LAMBDA_TIMEOUT", "Beard-removal Lambda timed out.") from exc
    except httpx.TransportError as exc:
      raise AppError(502, "BEARD_LAMBDA_UNREACHABLE", "Beard-removal Lambda is unreachable.") from exc

    if response.status_code == 403:
      raise AppError(502, "BEARD_LAMBDA_FORBIDDEN", "Beard-removal Lambda rejected the signed request.")

    return response.json()

  async def upload_url(self, name: str) -> dict[str, Any]:
    return await self._invoke("upload_url", {"name": name}, STATUS_TIMEOUT_SECONDS)

  async def prewarm(self) -> dict[str, Any]:
    return await self._invoke("prewarm", {}, STATUS_TIMEOUT_SECONDS)

  async def status(self) -> dict[str, Any]:
    return await self._invoke("status", {}, STATUS_TIMEOUT_SECONDS)

  async def simulate(self, input_key: str, output_key: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"inputKey": input_key}

    if output_key is not None:
      payload["outputKey"] = output_key

    return await self._invoke("simulate", payload, INVOKE_TIMEOUT_SECONDS)

  async def result(self, command_id: str, output_key: str) -> dict[str, Any]:
    return await self._invoke(
      "result",
      {"commandId": command_id, "outputKey": output_key},
      INVOKE_TIMEOUT_SECONDS,
    )
