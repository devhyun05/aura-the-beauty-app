from __future__ import annotations

import asyncio
from ipaddress import ip_address
import logging
import secrets
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, Query, Request, Response

from app.core.errors import AppError
from app.core.responses import success
from app.core.settings import Settings, get_settings
from app.db.session import Database, get_database, require_database
from app.schemas.report_lab import ReportLabSessionCancelRequest, ReportLabStageRunRequest
from app.services.report_lab_fixtures import (
  list_report_lab_fixtures,
  load_report_lab_fixture,
)
from app.services.report_lab_runner import ReportLabRunnerResult, run_report_lab_fixture_stage
from app.services.report_lab_rate_limit import ReportLabLoopbackRateLimiter
from app.services.report_lab_runs import (
  cached_report_lab_result,
  cancel_report_lab_session,
  complete_report_lab_run,
  fail_report_lab_run,
  find_cached_report_lab_run,
  issue_report_lab_session,
  list_report_lab_runs,
  prune_expired_report_lab_runs,
  reserve_report_lab_runs,
)


router = APIRouter(prefix="/lab", tags=["report-lab"])
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1"})
logger = logging.getLogger(__name__)


def _set_private_response_headers(response: Response) -> None:
  response.headers["Cache-Control"] = "private, no-store"
  response.headers["Pragma"] = "no-cache"
  response.headers["Referrer-Policy"] = "no-referrer"


def _require_loopback_request(request: Request, settings: Settings) -> None:
  if not settings.lab_mode:
    raise AppError(404, "REPORT_LAB_DISABLED", "Report Lab is disabled.")

  peer = request.client.host if request.client is not None else ""
  try:
    is_loopback = ip_address(peer).is_loopback
  except ValueError:
    is_loopback = False

  authority = request.headers.get("host", "")
  try:
    parsed_authority = urlsplit(f"//{authority}")
    authority_host = parsed_authority.hostname
    authority_port = parsed_authority.port
  except ValueError:
    authority_host = None
    authority_port = None

  if (
    not is_loopback
    or "@" in authority
    or authority_host not in LOOPBACK_HOSTS
    or authority_port not in {None, 8000}
  ):
    raise AppError(403, "REPORT_LAB_LOOPBACK_REQUIRED", "Report Lab accepts loopback requests only.")

  # Browser requests always carry Origin. Keep no-Origin CLI diagnostics usable,
  # but reject every browser origin except the one fixed local Report Lab UI.
  origin = request.headers.get("origin")
  if origin is not None and origin != settings.report_lab_cors_origin:
    raise AppError(
      403,
      "REPORT_LAB_ORIGIN_FORBIDDEN",
      "Report Lab accepts browser requests only from its configured local origin.",
    )


async def require_report_lab_request(
  request: Request,
  settings: Settings = Depends(get_settings),
) -> None:
  _require_loopback_request(request, settings)


async def require_report_lab_mutation(
  request: Request,
  settings: Settings = Depends(get_settings),
) -> None:
  _require_loopback_request(request, settings)
  content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
  if content_type != "application/json":
    raise AppError(
      415,
      "REPORT_LAB_JSON_REQUIRED",
      "Report Lab mutations require an application/json request.",
    )
  limiter = getattr(request.app.state, "report_lab_rate_limiter", None)
  if not isinstance(limiter, ReportLabLoopbackRateLimiter):
    limiter = ReportLabLoopbackRateLimiter()
    request.app.state.report_lab_rate_limiter = limiter
  peer = request.client.host if request.client is not None else ""
  await limiter.check(peer)


def _raw_response_allowed(settings: Settings, supplied_token: str | None) -> bool:
  configured_secret = settings.report_lab_raw_response_admin_token
  configured = configured_secret.get_secret_value() if configured_secret is not None else ""
  supplied = supplied_token or ""
  return (
    bool(configured)
    and len(supplied) <= 4_096
    and secrets.compare_digest(configured, supplied)
  )


def _run_response(
  run_id: object,
  result: ReportLabRunnerResult,
  *,
  client_request_id: UUID,
  batch_ordinal: int,
  include_raw_response: bool,
  cached_from_run_id: UUID | None = None,
) -> dict[str, Any]:
  response: dict[str, Any] = {
    "runId": str(run_id),
    "clientRequestId": str(client_request_id),
    "batchOrdinal": batch_ordinal,
    "status": result.status,
    "runner": result.runner,
    "provider": result.provider,
    "model": result.model,
    "inputHash": result.input_hash,
    "cacheHit": cached_from_run_id is not None,
    "cachedFromRunId": str(cached_from_run_id) if cached_from_run_id is not None else None,
    "normalizedOutput": result.normalized_output,
    "validationErrors": result.validation_errors,
    "latencyMs": result.latency_ms,
    "tokenUsage": result.token_usage,
    "externalProviderRuns": result.external_provider_runs,
  }
  if include_raw_response:
    response["rawResponse"] = result.raw_response
  return response


def _history_run_response(row: dict[str, Any]) -> dict[str, Any]:
  """Project persisted runs without raw responses, prompt bodies, or secrets."""

  return {
    "runId": str(row["id"]),
    "sessionId": str(row["session_id"]),
    "clientRequestId": str(row["client_request_id"]),
    "batchOrdinal": row["batch_ordinal"],
    "fixtureId": row["fixture_id"],
    "stage": row["stage"],
    "status": row["status"],
    "schemaVersion": row["schema_version"],
    "promptVersion": row["prompt_version"],
    "provider": row["provider"],
    "model": row["model"],
    "inputHash": row["input_hash"],
    "cacheHit": row["cache_hit"],
    "cachedFromRunId": (
      str(row["cached_from_run_id"]) if row.get("cached_from_run_id") is not None else None
    ),
    "normalizedOutput": row.get("normalized_output") or {},
    "validationErrors": row.get("validation_errors") or [],
    "latencyMs": row.get("latency_ms"),
    "tokenUsage": row.get("token_usage"),
    "externalProviderRuns": row["external_provider_runs"],
    "startedAt": row.get("started_at"),
    "completedAt": row.get("completed_at"),
  }


@router.get("/health")
async def report_lab_health(
  response: Response,
  _guard: None = Depends(require_report_lab_request),
  db: Database = Depends(get_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  _set_private_response_headers(response)
  return success(
    {
      "status": "ok",
      "labMode": True,
      "buildSha": settings.report_lab_commit_sha,
      "database": "connected" if db.is_connected else "not_configured",
      "provider": "disabled",
      "imageGenerationProvider": "disabled",
      "externalProviderRuns": 0,
      "fixturePrincipalId": str(settings.report_lab_fixture_principal_id),
      "fixtures": list_report_lab_fixtures(settings),
    },
  )


@router.post("/analysis/session")
async def create_report_lab_session(
  response: Response,
  _guard: None = Depends(require_report_lab_mutation),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  """Issue one opaque browser-session identifier before any rows are reserved."""

  _set_private_response_headers(response)
  await prune_expired_report_lab_runs(db)
  session_id = uuid4()
  await issue_report_lab_session(
    db,
    session_id=session_id,
    principal_id=settings.report_lab_fixture_principal_id,
    retention_days=settings.report_lab_retention_days,
  )
  return success({"sessionId": str(session_id)})


@router.post("/analysis/stage-run")
async def run_report_lab_stage(
  payload: ReportLabStageRunRequest,
  response: Response,
  _guard: None = Depends(require_report_lab_mutation),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
  admin_token: str | None = Header(default=None, alias="X-Aura-Lab-Admin-Token"),
) -> dict:
  _set_private_response_headers(response)
  if payload.repeat_count > settings.report_lab_max_runs_per_request:
    raise AppError(
      422,
      "REPORT_LAB_REPEAT_LIMIT_EXCEEDED",
      "repeatCount exceeds the configured per-request limit.",
      {"maxRunsPerRequest": settings.report_lab_max_runs_per_request},
    )

  # Physical TTL applies to prompt overrides as well as result rows. Prune on
  # every normal execution, not only on setup/session/cancel paths, so a page
  # kept open for more than seven days cannot indefinitely retain old prompts.
  await prune_expired_report_lab_runs(db)
  fixture = load_report_lab_fixture(settings, payload.fixture_id)
  principal_id = settings.report_lab_fixture_principal_id
  # The first result supplies the immutable reservation metadata. For repeat
  # requests it is also the first real execution; subsequent rows execute the
  # validator independently instead of copying one result N times.
  first_result = await run_report_lab_fixture_stage(
    fixture,
    stage=payload.stage,
    overrides=payload.overrides,
    build_sha=settings.report_lab_commit_sha,
  )
  cached_row = None if payload.bypass_cache else await find_cached_report_lab_run(
    db,
    fixture_id=fixture.fixture_id,
    principal_id=principal_id,
    stage=payload.stage,
    schema_version=first_result.schema_version,
    input_hash=first_result.input_hash,
  )
  session_id = payload.session_id
  reserved = await reserve_report_lab_runs(
    db,
    session_id=session_id,
    client_request_id=payload.client_request_id,
    repeat_count=payload.repeat_count,
    session_budget_runs=settings.report_lab_session_budget_runs,
    fixture_id=fixture.fixture_id,
    principal_id=principal_id,
    stage=payload.stage,
    schema_version=first_result.schema_version,
    input_hash=first_result.input_hash,
    overrides=payload.overrides,
    retention_days=settings.report_lab_retention_days,
  )
  include_raw_response = _raw_response_allowed(settings, admin_token)
  runs: list[dict[str, Any]] = []
  pending_run_ids = {UUID(str(row["id"])) for row in reserved}
  try:
    for index, row in enumerate(reserved):
      cached_from_run_id = UUID(str(cached_row["id"])) if cached_row is not None else None
      result = (
        cached_report_lab_result(cached_row)
        if cached_row is not None
        else first_result
        if index == 0
        else await run_report_lab_fixture_stage(
          fixture,
          stage=payload.stage,
          overrides=payload.overrides,
          build_sha=settings.report_lab_commit_sha,
        )
      )
      run_id = UUID(str(row["id"]))
      completed = await complete_report_lab_run(
        db,
        run_id,
        result,
        cached_from_run_id=cached_from_run_id,
      )
      if completed is None:
        raise AppError(409, "REPORT_LAB_RUN_STATE_CONFLICT", "Report Lab run state changed unexpectedly.")
      pending_run_ids.discard(run_id)
      runs.append(
        _run_response(
          run_id,
          result,
          client_request_id=UUID(str(row["client_request_id"])),
          batch_ordinal=int(row["batch_ordinal"]),
          include_raw_response=include_raw_response,
          cached_from_run_id=cached_from_run_id,
        ),
      )
  except asyncio.CancelledError:
    try:
      await asyncio.shield(cancel_report_lab_session(
        db,
        session_id,
        principal_id=principal_id,
      ))
    except Exception:
      logger.exception("[aura:report-lab] cancellation cleanup failed")
    raise
  except Exception:
    cleanup_results = await asyncio.gather(*(
      fail_report_lab_run(db, run_id, code="REPORT_LAB_RUN_FAILED")
      for run_id in pending_run_ids
    ), return_exceptions=True)
    if any(isinstance(result, BaseException) for result in cleanup_results):
      logger.error("[aura:report-lab] one or more failure cleanup updates failed")
    raise

  data: dict[str, Any] = {
    "sessionId": str(session_id),
    "clientRequestId": str(payload.client_request_id),
    "runs": runs,
  }
  if len(runs) == 1:
    data.update(runs[0])
  return success(data)


@router.post("/analysis/runs/cancel")
async def cancel_report_lab_runs(
  payload: ReportLabSessionCancelRequest,
  response: Response,
  _guard: None = Depends(require_report_lab_mutation),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  _set_private_response_headers(response)
  cancelled = await cancel_report_lab_session(
    db,
    payload.session_id,
    principal_id=settings.report_lab_fixture_principal_id,
  )
  await prune_expired_report_lab_runs(db)
  return success({"sessionId": str(payload.session_id), "cancelledRuns": cancelled})


@router.get("/analysis/runs")
async def get_report_lab_runs(
  response: Response,
  session_id: UUID = Query(alias="sessionId"),
  client_request_id: UUID | None = Query(default=None, alias="clientRequestId"),
  limit: int = Query(default=50, ge=1, le=100),
  _guard: None = Depends(require_report_lab_request),
  db: Database = Depends(require_database),
) -> dict:
  _set_private_response_headers(response)
  rows = await list_report_lab_runs(
    db,
    session_id=session_id,
    client_request_id=client_request_id,
    limit=limit,
  )
  return success(
    {
      "sessionId": str(session_id),
      "clientRequestId": str(client_request_id) if client_request_id is not None else None,
      "runs": [_history_run_response(row) for row in rows],
    },
  )
