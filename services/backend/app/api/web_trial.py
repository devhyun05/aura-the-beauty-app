import asyncio
import base64
import binascii
import hashlib
import hmac
import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Literal
from uuid import UUID, uuid4

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from fastapi import APIRouter, Depends, Header, Response
from fastapi import Request
from pydantic import Field, StrictBool

from app.core.errors import AppError
from app.core.responses import success
from app.core.settings import Settings, get_settings
from app.schemas.base import CamelModel
from app.services.openai_analysis import OpenAIAnalysisService


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/web-trial", tags=["web-trial"])
_WEB_TRIAL_PUBLIC_KEY_SPKI_B64 = (
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEhxTFA2GwL+0Fw3Fir2EJqMkNeTh6"
  "NVE1psvcG0hsrhKwLIglI/oZroZow/jajwf81tQxaogi0ggsd5fWmHUbEA=="
)
_WEB_TRIAL_PUBLIC_KEY = serialization.load_der_public_key(
  base64.b64decode(_WEB_TRIAL_PUBLIC_KEY_SPKI_B64),
)


class WebTrialFaceAnalysisCreate(CamelModel):
  image_base64: str = Field(alias="imageBase64", min_length=16)
  content_type: Literal["image/jpeg", "image/png"] = Field(alias="contentType")
  consent_accepted: StrictBool = Field(alias="consentAccepted")


@dataclass
class WebTrialJob:
  client_id: str
  created_at: float
  status: Literal["queued", "processing", "completed", "failed"] = "queued"
  result: dict | None = None
  error_code: str | None = None
  error_message: str | None = None


_jobs: dict[UUID, WebTrialJob] = {}
_job_tasks: set[asyncio.Task] = set()
_request_times: defaultdict[str, deque[float]] = defaultdict(deque)


def _verify_signed_request(
  *,
  body: bytes,
  client_id: str,
  method: str,
  path: str,
  signature: str | None,
  timestamp: str | None,
) -> bool:
  try:
    unix_timestamp = int(timestamp or "")
  except ValueError:
    return False
  if abs(round(time.time()) - unix_timestamp) > 300:
    return False
  try:
    raw_signature = base64.b64decode(signature or "", validate=True)
  except (binascii.Error, ValueError):
    return False
  if len(raw_signature) != 64:
    return False
  canonical_path = path.removeprefix("/api/").lstrip("/")
  body_hash = hashlib.sha256(body).hexdigest()
  message = (
    f"{unix_timestamp}\n{method.upper()}\n{canonical_path}\n{client_id}\n{body_hash}"
  ).encode()
  r = int.from_bytes(raw_signature[:32], "big")
  s = int.from_bytes(raw_signature[32:], "big")
  try:
    _WEB_TRIAL_PUBLIC_KEY.verify(
      encode_dss_signature(r, s),
      message,
      ec.ECDSA(hashes.SHA256()),
    )
  except (InvalidSignature, ValueError):
    return False
  return True


def _authorize(
  *,
  body: bytes = b"",
  client_id: str | None,
  method: str = "GET",
  path: str = "/api/web-trial",
  provided_key: str | None,
  signature: str | None = None,
  settings: Settings,
  timestamp: str | None = None,
) -> str:
  if not settings.web_trial_enabled:
    raise AppError(
      503,
      "WEB_TRIAL_UNAVAILABLE",
      "웹 얼굴 분석 체험을 잠시 이용할 수 없어요.",
    )
  normalized_client_id = (client_id or "").strip()
  if len(normalized_client_id) < 16 or len(normalized_client_id) > 128:
    raise AppError(400, "WEB_TRIAL_CLIENT_REQUIRED", "웹 체험 기기 정보를 확인하지 못했어요.")
  configured_key = (settings.web_trial_api_key or "").strip()
  shared_key_valid = bool(
    configured_key
    and provided_key
    and hmac.compare_digest(provided_key, configured_key)
  )
  signed_request_valid = _verify_signed_request(
    body=body,
    client_id=normalized_client_id,
    method=method,
    path=path,
    signature=signature,
    timestamp=timestamp,
  )
  if not shared_key_valid and not signed_request_valid:
    raise AppError(401, "WEB_TRIAL_UNAUTHORIZED", "웹 체험 요청을 확인하지 못했어요.")
  return normalized_client_id


def _decode_image(payload: WebTrialFaceAnalysisCreate, settings: Settings) -> bytes:
  if payload.consent_accepted is not True:
    raise AppError(
      403,
      "AI_DATA_CONSENT_REQUIRED",
      "외부 AI 사진 처리 동의가 필요해요.",
    )
  try:
    image_bytes = base64.b64decode(payload.image_base64, validate=True)
  except (binascii.Error, ValueError) as exc:
    raise AppError(422, "WEB_TRIAL_IMAGE_INVALID", "사진 데이터를 읽지 못했어요.") from exc
  if not image_bytes or len(image_bytes) > settings.web_trial_max_image_bytes:
    raise AppError(
      413,
      "WEB_TRIAL_IMAGE_TOO_LARGE",
      "분석용 사진은 5MB 이하로 준비해 주세요.",
    )
  signature_valid = (
    payload.content_type == "image/jpeg"
    and image_bytes.startswith(b"\xff\xd8\xff")
  ) or (
    payload.content_type == "image/png"
    and image_bytes.startswith(b"\x89PNG\r\n\x1a\n")
  )
  if not signature_valid:
    raise AppError(
      422,
      "WEB_TRIAL_IMAGE_TYPE_MISMATCH",
      "JPEG 또는 PNG 얼굴 사진만 사용할 수 있어요.",
    )
  return image_bytes


def _prune_state(settings: Settings) -> None:
  now = time.monotonic()
  cutoff = now - settings.web_trial_result_ttl_seconds
  for job_id, job in list(_jobs.items()):
    if job.created_at < cutoff and job.status in {"completed", "failed"}:
      _jobs.pop(job_id, None)
  request_cutoff = now - 3_600
  for client_id, timestamps in list(_request_times.items()):
    while timestamps and timestamps[0] < request_cutoff:
      timestamps.popleft()
    if not timestamps:
      _request_times.pop(client_id, None)


def _enforce_rate_limit(client_id: str, settings: Settings) -> None:
  _prune_state(settings)
  timestamps = _request_times[client_id]
  if len(timestamps) >= settings.web_trial_rate_limit_per_hour:
    raise AppError(
      429,
      "WEB_TRIAL_RATE_LIMITED",
      "체험 횟수를 모두 사용했어요. 잠시 후 다시 시도해 주세요.",
      {"retryAfterSeconds": max(1, round(3_600 - (time.monotonic() - timestamps[0])))},
    )
  active_jobs = sum(job.status in {"queued", "processing"} for job in _jobs.values())
  if active_jobs >= settings.web_trial_max_concurrent_jobs:
    raise AppError(
      503,
      "WEB_TRIAL_BUSY",
      "현재 분석 요청이 많아요. 잠시 후 다시 시도해 주세요.",
    )
  timestamps.append(time.monotonic())


async def _run_face_analysis_job(
  job_id: UUID,
  image_bytes: bytes,
  content_type: str,
  settings: Settings,
) -> None:
  job = _jobs[job_id]
  job.status = "processing"
  try:
    result = await OpenAIAnalysisService(settings).analyze_text_bytes({
      "contentType": content_type,
      "profileGender": "unspecified",
      "source": "web_trial",
      "task": "face_makeup_recommendation_report_v1",
    }, image_bytes)
    job.result = result
    job.status = "completed"
  except AppError as exc:
    logger.warning("[aura:web-trial] analysis:failed code=%s", exc.code)
    job.error_code = exc.code
    job.error_message = "AI 얼굴 분석을 완료하지 못했어요. 다시 시도해 주세요."
    job.status = "failed"
  except Exception as exc:  # noqa: BLE001 - do not expose provider internals.
    logger.exception("[aura:web-trial] analysis:failed reason=%s", exc.__class__.__name__)
    job.error_code = "WEB_TRIAL_ANALYSIS_FAILED"
    job.error_message = "AI 얼굴 분석을 완료하지 못했어요. 다시 시도해 주세요."
    job.status = "failed"


@router.post("/face-analysis/jobs", status_code=202)
async def create_web_trial_face_analysis(
  payload: WebTrialFaceAnalysisCreate,
  request: Request,
  response: Response,
  x_aura_web_trial_key: str | None = Header(default=None, alias="X-Aura-Web-Trial-Key"),
  x_aura_web_trial_client: str | None = Header(default=None, alias="X-Aura-Web-Trial-Client"),
  x_aura_web_trial_signature: str | None = Header(
    default=None,
    alias="X-Aura-Web-Trial-Signature",
  ),
  x_aura_web_trial_timestamp: str | None = Header(
    default=None,
    alias="X-Aura-Web-Trial-Timestamp",
  ),
  settings: Settings = Depends(get_settings),
) -> dict:
  client_id = _authorize(
    body=await request.body(),
    client_id=x_aura_web_trial_client,
    method=request.method,
    path=request.url.path,
    provided_key=x_aura_web_trial_key,
    signature=x_aura_web_trial_signature,
    settings=settings,
    timestamp=x_aura_web_trial_timestamp,
  )
  image_bytes = _decode_image(payload, settings)
  _enforce_rate_limit(client_id, settings)

  job_id = uuid4()
  _jobs[job_id] = WebTrialJob(client_id=client_id, created_at=time.monotonic())
  task = asyncio.create_task(
    _run_face_analysis_job(job_id, image_bytes, payload.content_type, settings),
  )
  _job_tasks.add(task)
  task.add_done_callback(_job_tasks.discard)
  response.headers["Cache-Control"] = "no-store"
  return success({"job": {"id": job_id, "status": "queued"}})


@router.get("/face-analysis/jobs/{job_id}")
async def read_web_trial_face_analysis(
  job_id: UUID,
  request: Request,
  response: Response,
  x_aura_web_trial_key: str | None = Header(default=None, alias="X-Aura-Web-Trial-Key"),
  x_aura_web_trial_client: str | None = Header(default=None, alias="X-Aura-Web-Trial-Client"),
  x_aura_web_trial_signature: str | None = Header(
    default=None,
    alias="X-Aura-Web-Trial-Signature",
  ),
  x_aura_web_trial_timestamp: str | None = Header(
    default=None,
    alias="X-Aura-Web-Trial-Timestamp",
  ),
  settings: Settings = Depends(get_settings),
) -> dict:
  client_id = _authorize(
    client_id=x_aura_web_trial_client,
    method=request.method,
    path=request.url.path,
    provided_key=x_aura_web_trial_key,
    signature=x_aura_web_trial_signature,
    settings=settings,
    timestamp=x_aura_web_trial_timestamp,
  )
  _prune_state(settings)
  job = _jobs.get(job_id)
  if job is None or not hmac.compare_digest(job.client_id, client_id):
    raise AppError(404, "WEB_TRIAL_JOB_NOT_FOUND", "분석 요청을 찾지 못했어요.")
  response.headers["Cache-Control"] = "no-store"
  return success({
    "job": {
      "errorCode": job.error_code,
      "errorMessage": job.error_message,
      "id": job_id,
      "result": job.result,
      "status": job.status,
    },
  })
