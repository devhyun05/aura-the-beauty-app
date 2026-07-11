import json
from typing import Literal
from uuid import UUID

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.errors import AppError
from app.core.settings import Settings


HairJobType = Literal["analysis", "simulation"]


class HairJobQueue:
  def __init__(self, settings: Settings) -> None:
    self.settings = settings

  def _client(self):
    kwargs = {
      "region_name": self.settings.aws_region,
      "config": Config(retries={"max_attempts": 2, "mode": "standard"}),
    }

    if self.settings.aws_profile_name:
      return boto3.Session(profile_name=self.settings.aws_profile_name).client("sqs", **kwargs)

    if (
      self.settings.aws_access_key_id
      and self.settings.aws_secret_access_key
      and not self.settings.aws_use_iam_role
    ):
      kwargs.update(
        {
          "aws_access_key_id": self.settings.aws_access_key_id,
          "aws_secret_access_key": self.settings.aws_secret_access_key,
        },
      )

    return boto3.client("sqs", **kwargs)

  def enqueue(self, job_type: HairJobType, job_id: UUID | str) -> str:
    if not self.settings.hair_jobs_queue_url:
      raise AppError(
        503,
        "HAIR_QUEUE_NOT_CONFIGURED",
        "HAIR_JOBS_QUEUE_URL is required for hair analysis and simulation jobs.",
      )

    try:
      response = self._client().send_message(
        QueueUrl=self.settings.hair_jobs_queue_url,
        MessageBody=json.dumps(
          {
            "schemaVersion": "aura-hair-job-v1",
            "jobType": job_type,
            "jobId": str(job_id),
          },
        ),
      )
    except (BotoCoreError, ClientError) as error:
      raise AppError(503, "HAIR_QUEUE_UNAVAILABLE", "Hair job could not be queued.") from error

    message_id = response.get("MessageId")
    if not message_id:
      raise AppError(503, "HAIR_QUEUE_EMPTY_RESPONSE", "Hair queue returned no message id.")

    return str(message_id)

  def receive(self) -> list[dict]:
    if not self.settings.hair_jobs_queue_url:
      raise RuntimeError("HAIR_JOBS_QUEUE_URL is required for the hair worker.")

    response = self._client().receive_message(
      QueueUrl=self.settings.hair_jobs_queue_url,
      MaxNumberOfMessages=1,
      WaitTimeSeconds=max(0, min(20, self.settings.hair_worker_wait_time_seconds)),
      VisibilityTimeout=max(30, self.settings.hair_worker_visibility_timeout_seconds),
      AttributeNames=["ApproximateReceiveCount"],
    )
    return list(response.get("Messages") or [])

  def delete(self, receipt_handle: str) -> None:
    if not self.settings.hair_jobs_queue_url:
      raise RuntimeError("HAIR_JOBS_QUEUE_URL is required for the hair worker.")

    self._client().delete_message(
      QueueUrl=self.settings.hair_jobs_queue_url,
      ReceiptHandle=receipt_handle,
    )

  def change_visibility(self, receipt_handle: str, timeout_seconds: int | None = None) -> None:
    if not self.settings.hair_jobs_queue_url:
      raise RuntimeError("HAIR_JOBS_QUEUE_URL is required for the hair worker.")
    self._client().change_message_visibility(
      QueueUrl=self.settings.hair_jobs_queue_url,
      ReceiptHandle=receipt_handle,
      VisibilityTimeout=max(
        30,
        timeout_seconds or self.settings.hair_worker_visibility_timeout_seconds,
      ),
    )


def decode_hair_job(message: dict) -> tuple[HairJobType, UUID]:
  try:
    payload = json.loads(message["Body"])
    job_type = payload["jobType"]
    job_id = UUID(str(payload["jobId"]))
  except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
    raise ValueError("Invalid hair job message.") from error

  if payload.get("schemaVersion") != "aura-hair-job-v1" or job_type not in {
    "analysis",
    "simulation",
  }:
    raise ValueError("Unsupported hair job message.")

  return job_type, job_id
