import json
import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.api.analysis import run_analysis_job_background
from app.api.feedback import run_feedback_job_background
from app.api.filter_extractions import run_filter_extraction_job_background
from app.core.settings import Settings
from app.db.session import Database
from app.schemas.analysis import AnalysisJobCreate, FilterExtractionAnalyzeRequest


SUPPORTED_AI_JOB_MESSAGE_VERSION = 1
TERMINAL_JOB_STATUSES = {"completed", "failed"}

logger = logging.getLogger(__name__)


class AIJobWorkerError(Exception):
  """Base error for worker message handling."""


class AIJobMessageParseError(AIJobWorkerError):
  """Raised when an SQS body cannot be converted into a worker job."""


class AIJobUnsupportedTypeError(AIJobWorkerError):
  """Raised when the worker receives a valid message for an unknown job type."""


class AIJobHandlerNotImplementedError(AIJobWorkerError):
  """Raised for job types whose worker handler is intentionally not wired yet."""


@dataclass(frozen=True)
class ParsedAIJobMessage:
  version: int
  job_type: str
  job_id: UUID
  user_id: UUID
  payload: dict[str, Any]


def _parse_uuid(value: object, field_name: str) -> UUID:
  if not isinstance(value, str) or not value.strip():
    raise AIJobMessageParseError(f"{field_name} is required.")

  try:
    return UUID(value)
  except ValueError as exc:
    raise AIJobMessageParseError(f"{field_name} must be a UUID.") from exc


def parse_ai_job_message(body: str) -> ParsedAIJobMessage:
  try:
    payload = json.loads(body)
  except json.JSONDecodeError as exc:
    raise AIJobMessageParseError("SQS message body must be valid JSON.") from exc

  if not isinstance(payload, dict):
    raise AIJobMessageParseError("SQS message body must be a JSON object.")

  version = payload.get("version")

  if version != SUPPORTED_AI_JOB_MESSAGE_VERSION:
    raise AIJobMessageParseError("Unsupported AI job message version.")

  job_type = payload.get("jobType")

  if not isinstance(job_type, str) or not job_type.strip():
    raise AIJobMessageParseError("jobType is required.")

  return ParsedAIJobMessage(
    version=version,
    job_type=job_type.strip(),
    job_id=_parse_uuid(payload.get("jobId"), "jobId"),
    user_id=_parse_uuid(payload.get("userId"), "userId"),
    payload=payload,
  )


def decode_detail_payload(value: object) -> dict[str, Any]:
  if isinstance(value, dict):
    return value

  if isinstance(value, str) and value.strip():
    try:
      decoded = json.loads(value)
    except json.JSONDecodeError:
      return {}

    return decoded if isinstance(decoded, dict) else {}

  return {}


def build_analysis_payload_from_report(report: dict[str, Any]) -> AnalysisJobCreate:
  detail_payload = decode_detail_payload(report.get("detail_payload"))
  request_payload = detail_payload.get("request")

  if not isinstance(request_payload, dict):
    request_payload = {}

  return AnalysisJobCreate(
    photo_capture_id=report.get("photo_capture_id"),
    source_media_id=report.get("source_media_id"),
    preview_media_id=report.get("preview_media_id"),
    title=report.get("title") or "AI makeup analysis",
    report_title=report.get("report_title"),
    environment_label=report.get("environment_label"),
    run_immediately=True,
    request_payload=request_payload,
  )


def build_feedback_request_payload_from_report(report: dict[str, Any]) -> dict[str, Any]:
  feedback_payload = decode_detail_payload(report.get("feedback_payload"))
  request_payload = feedback_payload.get("request")

  return request_payload if isinstance(request_payload, dict) else {}


def build_filter_extraction_payload_from_report(
  report: dict[str, Any],
) -> FilterExtractionAnalyzeRequest:
  result_payload = decode_detail_payload(report.get("result_payload"))
  request_payload = result_payload.get("request")

  if not isinstance(request_payload, dict):
    request_payload = {}

  return FilterExtractionAnalyzeRequest(
    photo_capture_id=report.get("photo_capture_id"),
    result_media_id=report.get("result_media_id"),
    reference_image_id=result_payload.get("referenceImageId"),
    title=report.get("title") or "Reference makeup",
    subtitle=report.get("subtitle"),
    run_ai=result_payload.get("runAi") is True,
    request_payload=request_payload,
  )


class AIJobDispatcher:
  def __init__(self, settings: Settings, db: Database) -> None:
    self.settings = settings
    self.db = db

  async def dispatch(self, message: ParsedAIJobMessage) -> None:
    if message.job_type == "analysis":
      await self.dispatch_analysis(message)
      return
    if message.job_type == "feedback":
      await self.dispatch_feedback(message)
      return
    if message.job_type == "filter_extraction":
      await self.dispatch_filter_extraction(message)
      return
    raise AIJobUnsupportedTypeError(f"Unsupported AI job type: {message.job_type}")

  async def dispatch_analysis(self, message: ParsedAIJobMessage) -> None:
    logger.info(
      "[aura:ai-job-worker] analysis:received jobId=%s userId=%s",
      message.job_id,
      message.user_id,
    )
    report = await self.db.fetchrow(
      """
      select
        id,
        user_id,
        photo_capture_id,
        source_media_id,
        preview_media_id,
        status,
        title,
        report_title,
        environment_label,
        detail_payload
      from analysis_reports
      where id = $1
        and user_id = $2
        and deleted_at is null
      """,
      message.job_id,
      message.user_id,
    )

    if report is None:
      logger.warning(
        "[aura:ai-job-worker] analysis:missing jobId=%s userId=%s",
        message.job_id,
        message.user_id,
      )
      return

    status = report.get("status")

    if status in TERMINAL_JOB_STATUSES:
      logger.info(
        "[aura:ai-job-worker] analysis:terminal-skip jobId=%s status=%s",
        message.job_id,
        status,
      )
      return

    payload = build_analysis_payload_from_report(report)
    await run_analysis_job_background(
      message.job_id,
      payload,
      self.settings,
      db=self.db,
      await_image_generation=True,
    )

  async def dispatch_feedback(self, message: ParsedAIJobMessage) -> None:
    logger.info(
      "[aura:ai-job-worker] feedback:received jobId=%s userId=%s",
      message.job_id,
      message.user_id,
    )
    report = await self.db.fetchrow(
      """
      select
        id,
        user_id,
        status,
        feedback_payload
      from makeup_feedback_reports
      where id = $1
        and user_id = $2
      """,
      message.job_id,
      message.user_id,
    )

    if report is None:
      logger.warning(
        "[aura:ai-job-worker] feedback:missing jobId=%s userId=%s",
        message.job_id,
        message.user_id,
      )
      return

    status = report.get("status")

    if status in TERMINAL_JOB_STATUSES:
      logger.info(
        "[aura:ai-job-worker] feedback:terminal-skip jobId=%s status=%s",
        message.job_id,
        status,
      )
      return

    request_payload = build_feedback_request_payload_from_report(report)
    await run_feedback_job_background(
      message.job_id,
      request_payload,
      self.settings,
      db=self.db,
    )

  async def dispatch_filter_extraction(self, message: ParsedAIJobMessage) -> None:
    logger.info(
      "[aura:ai-job-worker] filter-extraction:received jobId=%s userId=%s",
      message.job_id,
      message.user_id,
    )
    report = await self.db.fetchrow(
      """
      select
        id,
        user_id,
        photo_capture_id,
        result_media_id,
        status,
        title,
        subtitle,
        result_payload
      from filter_extraction_reports
      where id = $1
        and user_id = $2
      """,
      message.job_id,
      message.user_id,
    )

    if report is None:
      logger.warning(
        "[aura:ai-job-worker] filter-extraction:missing jobId=%s userId=%s",
        message.job_id,
        message.user_id,
      )
      return

    status = report.get("status")

    if status in TERMINAL_JOB_STATUSES:
      logger.info(
        "[aura:ai-job-worker] filter-extraction:terminal-skip jobId=%s status=%s",
        message.job_id,
        status,
      )
      return

    payload = build_filter_extraction_payload_from_report(report)
    await run_filter_extraction_job_background(
      message.job_id,
      payload,
      self.settings,
      db=self.db,
    )
