import asyncio
import json
from typing import Any

import boto3

from app.core.errors import AppError
from app.core.settings import Settings


class BedrockService:
  def __init__(self, settings: Settings) -> None:
    self.settings = settings

  def _client(self):
    return boto3.client("bedrock-runtime", region_name=self.settings.aws_region)

  async def analyze_image(self, payload: dict[str, Any]) -> dict[str, Any]:
    if not self.settings.bedrock_model_id:
      raise AppError(503, "BEDROCK_NOT_CONFIGURED", "BEDROCK_MODEL_ID is required.")

    def invoke() -> dict[str, Any]:
      response = self._client().invoke_model(
        modelId=self.settings.bedrock_model_id,
        body=json.dumps(payload),
        contentType="application/json",
        accept="application/json",
      )
      body = response["body"].read().decode("utf-8")
      return json.loads(body)

    return await asyncio.to_thread(invoke)
