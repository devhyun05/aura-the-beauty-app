from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.settings import get_settings
from app.db.connection_config import connect_database
from app.ops.cleanup_expired_auradin_sessions import (
  cleanup_expired_auradin_sessions,
  find_expired_auradin_sessions,
  print_expired_auradin_session_result,
)
from app.ops.cleanup_expired_media_uploads import (
  cleanup_expired_media_uploads,
  find_expired_media_uploads,
  print_expired_media_upload_result,
)
from app.services.s3 import S3Service

DEFAULT_TIMEOUT_MINUTES = 120
ERROR_CODE = "STUCK_JOB_TIMEOUT"
ERROR_MESSAGE = "AI processing exceeded the recovery window."


@dataclass(frozen=True)
class CleanupResult:
  analysis_report_ids: tuple[str, ...]
  feedback_report_ids: tuple[str, ...]
  filter_extraction_report_ids: tuple[str, ...]
  # 이미지 생성이 completed 이후 detach 태스크에서 고착된 보고서(상태는
  # completed지만 imageGenerationStatus=processing). 기본값으로 하위호환.
  image_stuck_report_ids: tuple[str, ...] = ()

  @property
  def total(self) -> int:
    return (
      len(self.analysis_report_ids)
      + len(self.feedback_report_ids)
      + len(self.filter_extraction_report_ids)
      + len(self.image_stuck_report_ids)
    )


def _ids(rows: list[dict[str, Any]]) -> tuple[str, ...]:
  return tuple(str(row["id"]) for row in rows)


async def find_stuck_jobs(db: Any, *, cutoff: datetime) -> CleanupResult:
  # processing만 회수한다. pending은 SQS 모드에서 워커 dequeue 전까지 정상적으로
  # 유지되는 상태라, cutoff로 실패 처리하면 backlog 시 대기 중 잡을 죽이고
  # 워커가 terminal-skip(job_dispatcher TERMINAL_JOB_STATUSES)해 영구 유실된다.
  # dispatch 전 크래시로 갇힌 pending 회수는 SQS-safe한 별도 신호(publish 시각
  # 등)가 필요 — 후속 과제로 남긴다.
  analysis_rows = await db.fetch(
    """
    select id
    from analysis_reports
    where status = 'processing'
      and updated_at < $1
    order by updated_at
    """,
    cutoff,
  )
  image_stuck_rows = await db.fetch(
    """
    select id
    from analysis_reports
    where status = 'completed'
      and detail_payload->'result'->>'imageGenerationStatus' = 'processing'
      and coalesce(analyzed_at, updated_at) < $1
    order by updated_at
    """,
    cutoff,
  )
  feedback_rows = await db.fetch(
    """
    select id
    from makeup_feedback_reports
    where status = 'processing'
      and created_at < $1
    order by created_at
    """,
    cutoff,
  )
  filter_rows = await db.fetch(
    """
    select id
    from filter_extraction_reports
    where status = 'processing'
      and created_at < $1
    order by created_at
    """,
    cutoff,
  )
  return CleanupResult(
    analysis_report_ids=_ids(analysis_rows),
    feedback_report_ids=_ids(feedback_rows),
    filter_extraction_report_ids=_ids(filter_rows),
    image_stuck_report_ids=_ids(image_stuck_rows),
  )


async def cleanup_stuck_jobs(db: Any, *, cutoff: datetime) -> CleanupResult:
  error_details = {"code": ERROR_CODE, "cutoff": cutoff.isoformat()}

  analysis_rows = await db.fetch(
    """
    update analysis_reports
    set status = 'failed',
        error_message = $2,
        detail_payload = (coalesce(detail_payload, '{}'::jsonb) - 'error')
          || jsonb_build_object(
            'error', jsonb_build_object('message', $2::text, 'details', $3::jsonb)
          )
    where status = 'processing'
      and updated_at < $1
    returning id
    """,
    cutoff,
    ERROR_MESSAGE,
    json.dumps(error_details),
  )
  # 이미지 고착: 보고서 본문은 이미 completed라 상태는 유지하고, 무한 대기하는
  # imageGenerationStatus만 failed로 내려 클라이언트가 이미지 대기를 멈추게 한다.
  image_stuck_rows = await db.fetch(
    """
    update analysis_reports
    set detail_payload = jsonb_set(
          detail_payload,
          '{result,imageGenerationStatus}',
          '"failed"'::jsonb,
          true
        )
    where status = 'completed'
      and detail_payload->'result'->>'imageGenerationStatus' = 'processing'
      and coalesce(analyzed_at, updated_at) < $1
    returning id
    """,
    cutoff,
  )
  feedback_rows = await db.fetch(
    """
    update makeup_feedback_reports
    set status = 'failed',
        completed_at = now(),
        feedback_payload = (coalesce(feedback_payload, '{}'::jsonb) - 'error')
          || jsonb_build_object(
            'error', jsonb_build_object('message', $2::text, 'details', $3::jsonb)
          )
    where status = 'processing'
      and created_at < $1
    returning id
    """,
    cutoff,
    ERROR_MESSAGE,
    json.dumps(error_details),
  )
  filter_rows = await db.fetch(
    """
    update filter_extraction_reports
    set status = 'failed',
        completed_at = now(),
        result_payload = (coalesce(result_payload, '{}'::jsonb) - 'error')
          || jsonb_build_object(
            'error', jsonb_build_object('message', $2::text, 'details', $3::jsonb)
          )
    where status = 'processing'
      and created_at < $1
    returning id
    """,
    cutoff,
    ERROR_MESSAGE,
    json.dumps(error_details),
  )
  return CleanupResult(
    analysis_report_ids=_ids(analysis_rows),
    feedback_report_ids=_ids(feedback_rows),
    filter_extraction_report_ids=_ids(filter_rows),
    image_stuck_report_ids=_ids(image_stuck_rows),
  )


def print_result(result: CleanupResult, *, dry_run: bool, cutoff: datetime) -> None:
  mode = "dry-run" if dry_run else "execute"
  print(
    f"[aura:stuck-cleanup] mode={mode} cutoff={cutoff.isoformat()} "
    f"analysis={len(result.analysis_report_ids)} "
    f"feedback={len(result.feedback_report_ids)} "
    f"filter_extraction={len(result.filter_extraction_report_ids)} "
    f"image_stuck={len(result.image_stuck_report_ids)} "
    f"total={result.total}",
  )
  for job_type, report_ids in (
    ("analysis", result.analysis_report_ids),
    ("feedback", result.feedback_report_ids),
    ("filter_extraction", result.filter_extraction_report_ids),
    ("image_stuck", result.image_stuck_report_ids),
  ):
    for report_id in report_ids:
      print(f"[aura:stuck-cleanup] {mode} type={job_type} report_id={report_id}")


async def run(args: argparse.Namespace) -> int:
  cutoff = datetime.now(timezone.utc) - timedelta(minutes=args.timeout_minutes)
  db, _ = await connect_database()

  try:
    if args.dry_run:
      result = await find_stuck_jobs(db, cutoff=cutoff)
      expired_session_result = await find_expired_auradin_sessions(db)
      expired_upload_result = await find_expired_media_uploads(db)
    else:
      result = await cleanup_stuck_jobs(db, cutoff=cutoff)
      expired_session_result = await cleanup_expired_auradin_sessions(db)
      expired_upload_result = await cleanup_expired_media_uploads(
        db,
        s3=S3Service(get_settings()),
      )
    print_result(result, dry_run=args.dry_run, cutoff=cutoff)
    print_expired_auradin_session_result(expired_session_result, dry_run=args.dry_run)
    print_expired_media_upload_result(expired_upload_result, dry_run=args.dry_run)
    return 1 if expired_upload_result.has_failures else 0
  finally:
    await db.close()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description=(
      "Mark AI reports that exceeded the recovery window as failed and remove expired "
      "Auradin sessions and incomplete media uploads."
    ),
  )
  parser.add_argument(
    "--timeout-minutes",
    type=int,
    default=DEFAULT_TIMEOUT_MINUTES,
    help=f"Processing age required for cleanup (default: {DEFAULT_TIMEOUT_MINUTES}).",
  )
  parser.add_argument(
    "--dry-run",
    action="store_true",
    help="List cleanup candidates without updating the database.",
  )
  args = parser.parse_args(argv)

  if args.timeout_minutes < 1:
    parser.error("--timeout-minutes must be at least 1")
  return args


def main() -> None:
  raise SystemExit(asyncio.run(run(parse_args())))


if __name__ == "__main__":
  main()
