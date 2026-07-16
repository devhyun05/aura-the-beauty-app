import argparse
import asyncio
import logging
import signal
from typing import Any

from app.core.errors import AppError
from app.core.settings import Settings, get_settings
from app.db.session import Database, database
from app.services.ai_job_queue import build_sqs_client
from app.services.notification_schema import ensure_notification_schema
from app.workers.job_dispatcher import AIJobDispatcher, AIJobWorkerError, parse_ai_job_message


DEFAULT_MAX_MESSAGES = 1
DEFAULT_WAIT_TIME_SECONDS = 20
DEFAULT_VISIBILITY_TIMEOUT_SECONDS = 900

logger = logging.getLogger(__name__)


class SQSAIJobWorker:
  def __init__(
    self,
    settings: Settings,
    db: Database,
    *,
    client: Any | None = None,
    dispatcher: AIJobDispatcher | None = None,
    queue_url: str | None = None,
    max_messages: int = DEFAULT_MAX_MESSAGES,
    wait_time_seconds: int = DEFAULT_WAIT_TIME_SECONDS,
    visibility_timeout_seconds: int = DEFAULT_VISIBILITY_TIMEOUT_SECONDS,
  ) -> None:
    self.settings = settings
    self.db = db
    self.queue_url = (queue_url or settings.sqs_ai_job_queue_url or "").strip()
    self.client = client or build_sqs_client(settings)
    self.dispatcher = dispatcher or AIJobDispatcher(settings, db)
    self.max_messages = max_messages
    self.wait_time_seconds = wait_time_seconds
    self.visibility_timeout_seconds = visibility_timeout_seconds

    if not self.queue_url:
      raise AppError(
        503,
        "AI_JOB_QUEUE_NOT_CONFIGURED",
        "SQS_AI_JOB_QUEUE_URL is required to run the AI job worker.",
      )

  async def poll_once(self) -> int:
    response = await asyncio.to_thread(
      self.client.receive_message,
      QueueUrl=self.queue_url,
      MaxNumberOfMessages=self.max_messages,
      WaitTimeSeconds=self.wait_time_seconds,
      VisibilityTimeout=self.visibility_timeout_seconds,
      MessageAttributeNames=["All"],
      AttributeNames=["ApproximateReceiveCount"],
    )
    messages = response.get("Messages", [])

    for raw_message in messages:
      await self.handle_message(raw_message)

    return len(messages)

  async def handle_message(self, raw_message: dict[str, Any]) -> bool:
    message_id = raw_message.get("MessageId")
    receipt_handle = raw_message.get("ReceiptHandle")
    body = raw_message.get("Body")

    if not receipt_handle or not isinstance(body, str):
      logger.warning(
        "[aura:ai-job-worker] message:invalid-envelope messageId=%s",
        message_id,
      )
      return False

    try:
      message = parse_ai_job_message(body)
      await self.dispatcher.dispatch(message)
    except AIJobWorkerError:
      logger.exception(
        "[aura:ai-job-worker] message:failed messageId=%s",
        message_id,
      )
      return False
    except Exception:
      logger.exception(
        "[aura:ai-job-worker] message:unexpected-failure messageId=%s",
        message_id,
      )
      return False

    await asyncio.to_thread(
      self.client.delete_message,
      QueueUrl=self.queue_url,
      ReceiptHandle=receipt_handle,
    )
    logger.info(
      "[aura:ai-job-worker] message:deleted messageId=%s",
      message_id,
    )
    return True

  async def run_forever(self, stop_event: asyncio.Event | None = None) -> None:
    logger.info("[aura:ai-job-worker] started queueUrl=%s", self.queue_url)
    shutdown_requested = stop_event or asyncio.Event()

    while not shutdown_requested.is_set():
      await self.poll_once()


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(description="Run the AURA AI SQS worker.")
  parser.add_argument("--once", action="store_true", help="Poll SQS once and exit.")
  parser.add_argument("--log-level", default="INFO", help="Python logging level.")
  parser.add_argument("--max-messages", type=int, default=DEFAULT_MAX_MESSAGES)
  parser.add_argument("--wait-time-seconds", type=int, default=DEFAULT_WAIT_TIME_SECONDS)
  parser.add_argument("--visibility-timeout-seconds", type=int, default=DEFAULT_VISIBILITY_TIMEOUT_SECONDS)
  return parser


async def run_worker(args: argparse.Namespace) -> None:
  settings = get_settings()
  await database.connect()
  await ensure_notification_schema(database)
  stop_event = asyncio.Event()
  loop = asyncio.get_running_loop()
  registered_signals: list[signal.Signals] = []

  def request_shutdown() -> None:
    if not stop_event.is_set():
      logger.info("[aura:ai-job-worker] shutdown-requested")
    stop_event.set()

  for signal_name in (signal.SIGINT, signal.SIGTERM):
    try:
      loop.add_signal_handler(signal_name, request_shutdown)
      registered_signals.append(signal_name)
    except (NotImplementedError, RuntimeError):
      logger.debug(
        "[aura:ai-job-worker] signal-handler-unavailable signal=%s",
        signal_name.name,
      )

  try:
    worker = SQSAIJobWorker(
      settings,
      database,
      max_messages=args.max_messages,
      wait_time_seconds=args.wait_time_seconds,
      visibility_timeout_seconds=args.visibility_timeout_seconds,
    )

    if args.once:
      await worker.poll_once()
      return

    await worker.run_forever(stop_event)
  finally:
    for signal_name in registered_signals:
      loop.remove_signal_handler(signal_name)
    await database.close()


def main() -> None:
  parser = build_parser()
  args = parser.parse_args()
  logging.basicConfig(
    level=getattr(logging, args.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
  )

  try:
    asyncio.run(run_worker(args))
  except KeyboardInterrupt:
    logger.info("[aura:ai-job-worker] stopped")
  except AppError as exc:
    logger.error("%s: %s", exc.code, exc.message)
    raise SystemExit(1) from exc


if __name__ == "__main__":
  main()
