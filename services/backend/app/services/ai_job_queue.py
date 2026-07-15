import json
import logging
from dataclasses import dataclass
from uuid import UUID

import boto3

from app.core.errors import AppError
from app.core.settings import Settings


AI_JOB_MESSAGE_VERSION = 1
SUPPORTED_AI_JOB_TYPES = {"analysis", "feedback", "filter_extraction", "makeup_recommendation"}

logger = logging.getLogger(__name__)


def build_sqs_client(settings: Settings):
  client_kwargs = {"region_name": settings.aws_region}

  if settings.aws_profile_name:
    return boto3.Session(profile_name=settings.aws_profile_name).client("sqs", **client_kwargs)

  if (
    settings.aws_access_key_id
    and settings.aws_secret_access_key
    and not settings.aws_use_iam_role
  ):
    client_kwargs.update(
      {
        "aws_access_key_id": settings.aws_access_key_id,
        "aws_secret_access_key": settings.aws_secret_access_key,
      },
    )

  return boto3.client("sqs", **client_kwargs)


@dataclass(frozen=True)
class AIJobQueueMessage:
  job_type: str
  job_id: UUID
  user_id: UUID

  def body(self) -> dict[str, int | str]:
    return {
      "version": AI_JOB_MESSAGE_VERSION,
      "jobType": self.job_type,
      "jobId": str(self.job_id),
      "userId": str(self.user_id),
    }


class AIJobQueuePublisher:
  def __init__(self, settings: Settings) -> None:
    self.settings = settings

  def _client(self):
    return build_sqs_client(self.settings)

  def publish_analysis_job(self, report_id: UUID, user_id: UUID) -> dict[str, str | None]:
    return self.publish(
      AIJobQueueMessage(
        job_type="analysis",
        job_id=report_id,
        user_id=user_id,
      ),
    )

  def publish_feedback_job(self, report_id: UUID, user_id: UUID) -> dict[str, str | None]:
    return self.publish(
      AIJobQueueMessage(
        job_type="feedback",
        job_id=report_id,
        user_id=user_id,
      ),
    )

  def publish_filter_extraction_job(self, report_id: UUID, user_id: UUID) -> dict[str, str | None]:
    return self.publish(
      AIJobQueueMessage(
        job_type="filter_extraction",
        job_id=report_id,
        user_id=user_id,
      ),
    )

  def publish_makeup_recommendation_job(self, report_id: UUID, user_id: UUID) -> dict[str, str | None]:
    return self.publish(
      AIJobQueueMessage(
        job_type="makeup_recommendation",
        job_id=report_id,
        user_id=user_id,
      ),
    )

  def publish(self, message: AIJobQueueMessage) -> dict[str, str | None]:
    if message.job_type not in SUPPORTED_AI_JOB_TYPES:
      raise AppError(
        400,
        "AI_JOB_TYPE_UNSUPPORTED",
        "Unsupported AI job type.",
        {"jobType": message.job_type},
      )

    queue_url = (self.settings.sqs_ai_job_queue_url or "").strip()

    if not queue_url:
      raise AppError(
        503,
        "AI_JOB_QUEUE_NOT_CONFIGURED",
        "SQS_AI_JOB_QUEUE_URL is required when AI_JOB_EXECUTION_MODE=sqs.",
      )

    params: dict[str, object] = {
      "QueueUrl": queue_url,
      "MessageBody": json.dumps(message.body(), separators=(",", ":")),
      "MessageAttributes": {
        "jobType": {"DataType": "String", "StringValue": message.job_type},
        "jobId": {"DataType": "String", "StringValue": str(message.job_id)},
      },
    }

    if queue_url.endswith(".fifo"):
      params["MessageGroupId"] = message.job_type
      params["MessageDeduplicationId"] = f"{message.job_type}:{message.job_id}"

    try:
      response = self._client().send_message(**params)
    except Exception as exc:
      logger.exception(
        "[aura:ai-job-queue] publish:failed jobType=%s jobId=%s",
        message.job_type,
        message.job_id,
      )
      raise AppError(
        502,
        "AI_JOB_QUEUE_PUBLISH_FAILED",
        "AI job queue publish failed.",
        {"reason": exc.__class__.__name__},
      ) from exc

    return {
      "messageId": response.get("MessageId"),
      "jobType": message.job_type,
      "jobId": str(message.job_id),
    }
