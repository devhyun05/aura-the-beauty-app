from fastapi import APIRouter, Body, Depends, Header, Query, Response

from app.core.errors import AppError
from app.core.responses import success
from app.core.settings import Settings, get_settings
from app.db.session import Database, require_database
from app.schemas.media import CompleteUploadRequest, PresignedUploadRequest
from app.schemas.consulting_partner import (
  PartnerBookingStatusUpdate,
  PartnerLoginRequest,
  PartnerSummaryCompleteRequest,
  PartnerSummaryGenerateRequest,
)
from app.schemas.consulting import ConsultingTextMessageSend
from app.schemas.consulting_call import (
  ConsultingCallJoinRequest,
  ConsultingCaptionTranslateRequest,
  ConsultingTranscriptionStartRequest,
)
from app.services.s3 import S3Service
from app.services import consulting_call, consulting_partner
from app.services.consulting_realtime import consulting_realtime_manager
from app.services.consulting_message_store import create_consulting_message


router = APIRouter(prefix="/consulting/partner", tags=["consulting-partner"])
PARTNER_ACCOUNT_ISSUE_CONFIRMATION = "issue-default-partner-accounts"


def _set_sensitive_response_headers(response: Response) -> None:
  response.headers["Cache-Control"] = "no-store"
  response.headers["Pragma"] = "no-cache"


def _extract_bearer_token(authorization: str | None, session_token: str | None) -> str | None:
  if session_token:
    return session_token.strip()
  if authorization and authorization.lower().startswith("bearer "):
    return authorization.split(" ", 1)[1].strip()
  return None


async def get_partner_account(
  authorization: str | None = Header(default=None),
  session_token: str | None = Header(default=None, alias="X-Partner-Session"),
  db: Database = Depends(require_database),
) -> dict:
  token = _extract_bearer_token(authorization, session_token)
  if not token:
    raise AppError(401, "PARTNER_AUTH_REQUIRED", "파트너 로그인이 필요합니다.")

  account = await consulting_partner.account_for_token(db, token)
  if account is None:
    raise AppError(401, "PARTNER_SESSION_INVALID", "파트너 세션이 만료되었거나 올바르지 않습니다.")

  return account


@router.post("/login")
async def login_partner(
  payload: PartnerLoginRequest,
  db: Database = Depends(require_database),
) -> dict:
  return success(await consulting_partner.login(db, payload.email, payload.password))


@router.post("/dev/issue-accounts")
async def issue_dev_partner_accounts(
  confirmation: str | None = Header(default=None, alias="X-Partner-Issue-Confirmation"),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(require_database),
) -> dict:
  if settings.environment.strip().lower() in {"prod", "production"}:
    raise AppError(403, "PARTNER_ACCOUNT_ISSUE_DISABLED", "운영 환경에서는 개발용 파트너 계정 발급을 사용할 수 없습니다.")
  if confirmation != PARTNER_ACCOUNT_ISSUE_CONFIRMATION:
    raise AppError(400, "PARTNER_ACCOUNT_ISSUE_CONFIRMATION_REQUIRED", "파트너 계정 발급 확인 헤더가 필요합니다.")
  return success({"accounts": await consulting_partner.issue_default_partner_accounts(db)})


@router.get("/me")
async def get_partner_me(
  account: dict = Depends(get_partner_account),
) -> dict:
  return success({"user": await consulting_partner.current_user(account)})


@router.get("/business-profile")
async def get_partner_business_profile(
  account: dict = Depends(get_partner_account),
) -> dict:
  return success({"business": await consulting_partner.business_profile(account)})


@router.get("/experts")
async def get_partner_experts(
  account: dict = Depends(get_partner_account),
) -> dict:
  return success({"experts": [await consulting_partner.expert_profile(account)]})


@router.get("/dashboard")
async def get_partner_dashboard(
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  return success({"summary": await consulting_partner.dashboard_summary(db, account)})


@router.get("/bookings")
async def get_partner_bookings(
  query: str | None = Query(default=None),
  status: str | None = Query(default=None),
  date_from: str | None = Query(default=None, alias="dateFrom"),
  date_to: str | None = Query(default=None, alias="dateTo"),
  expert_id: str | None = Query(default=None, alias="expertId"),
  sort: str | None = Query(default=None),
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  records = await consulting_partner.list_bookings(
    db,
    account,
    {
      "query": query,
      "status": status,
      "date_from": date_from,
      "date_to": date_to,
      "expert_id": expert_id,
      "sort": sort,
    },
  )
  return success({"bookings": records})


@router.get("/bookings/{booking_id}")
async def get_partner_booking_detail(
  booking_id: str,
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  return success({"detail": await consulting_partner.booking_detail(db, account, booking_id)})


@router.patch("/bookings/{booking_id}/status")
async def update_partner_booking_status(
  booking_id: str,
  payload: PartnerBookingStatusUpdate,
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  booking = await consulting_partner.update_booking_status(
    db,
    account,
    booking_id,
    payload.status,
    payload.operator_note,
  )
  await consulting_realtime_manager.broadcast(
    booking_id,
    {
      "type": "booking.status",
      "bookingId": booking_id,
      "status": booking["status"],
      "message": _customer_booking_status_message(booking["status"]),
    },
  )
  return success({"booking": booking})


@router.post("/bookings/{booking_id}/status")
async def update_partner_booking_status_post(
  booking_id: str,
  payload: PartnerBookingStatusUpdate,
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  """Accept POST as well for proxies that reject PATCH before it reaches FastAPI."""
  return await update_partner_booking_status(booking_id, payload, account, db)


@router.patch("/bookings/{booking_id}")
async def update_partner_booking(
  booking_id: str,
  payload: dict = Body(default_factory=dict),
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  booking = await consulting_partner.update_booking_details(db, account, booking_id, payload)
  await consulting_realtime_manager.broadcast(
    booking_id,
    {
      "type": "booking.status",
      "bookingId": booking_id,
      "status": booking["status"],
      "message": _customer_booking_status_message(booking["status"]),
    },
  )
  return success({"booking": booking})


@router.post("/bookings/{booking_id}/payment")
async def mark_partner_booking_payment_paid(
  booking_id: str,
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  booking = await consulting_partner.mark_booking_payment_paid(db, account, booking_id)
  await consulting_realtime_manager.broadcast(
    booking_id,
    {
      "type": "booking.status",
      "bookingId": booking_id,
      "status": booking["status"],
      "message": "입금 확인이 완료되었습니다. 전문가의 예약 확정을 기다려 주세요.",
    },
  )
  return success({"booking": booking})


def _customer_booking_status_message(status: str) -> str:
  if status in {"confirmed", "scheduled"}:
    return "예약이 완료되었습니다. 예약일에 전문가가 먼저 화상 상담을 시작하니, 안내된 시간에 연락을 기다려 주세요."
  if status == "contacting":
    return "입금 확인과 일정 조율을 진행하고 있습니다. 전문가의 안내 메시지를 확인해 주세요."
  if status == "in_progress":
    return "전문가가 상담을 시작했습니다. 화상 상담에 입장할 수 있어요."
  if status == "completed":
    return "상담이 완료되었습니다. 상담 요약을 확인해 주세요."
  if status in {"cancelled", "canceled", "no_show", "refund_requested"}:
    return "예약 상태가 변경되었습니다. 채팅방의 안내를 확인해 주세요."
  return "예약 신청이 접수되었습니다. 전문가가 확인 후 안내드릴게요."


@router.post("/chat/threads/{thread_id}/messages")
async def send_partner_chat_text_message(
  thread_id: str,
  payload: ConsultingTextMessageSend,
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  """Durable HTTP fallback so an expert can still send text during WS recovery."""
  detail = await consulting_partner.chat_thread_detail(db, account, thread_id)
  booking = detail["booking"]
  if booking["status"] in {"cancelled", "no_show", "refund_requested", "completed"}:
    raise AppError(409, "CONSULTING_BOOKING_CLOSED", "종료된 예약에는 새 메시지를 보낼 수 없어요.")
  message, inserted = await create_consulting_message(
    db,
    booking_id=thread_id,
    body=payload.body.strip(),
    client_message_id=payload.client_message_id,
    media=[],
    sender_name=detail["expert"]["name"],
    sender_type="expert",
    sender_user_id=None,
  )
  if inserted:
    await consulting_realtime_manager.broadcast(thread_id, message)
  return success({"message": message})


@router.get("/bookings/{booking_id}/call")
async def get_partner_call_state(
  booking_id: str,
  account: dict = Depends(get_partner_account),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(require_database),
) -> dict:
  return success({"call": await consulting_call.get_partner_call_state(db, account, booking_id, settings)})


@router.get("/settings")
async def get_partner_settings(
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  return success({"settings": await consulting_partner.get_manager_settings(db, account)})


@router.patch("/settings")
async def update_partner_settings(
  payload: dict = Body(default_factory=dict),
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  return success({"settings": await consulting_partner.update_manager_settings(db, account, payload)})


@router.post("/bookings/{booking_id}/call/join")
async def join_partner_call(
  booking_id: str,
  payload: ConsultingCallJoinRequest,
  response: Response,
  account: dict = Depends(get_partner_account),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(require_database),
) -> dict:
  _set_sensitive_response_headers(response)
  call = await consulting_call.join_partner_call(
    db,
    account,
    booking_id,
    payload.language_code,
    settings,
  )
  await consulting_realtime_manager.broadcast(
    booking_id,
    {
      "type": "call.status",
      "bookingId": booking_id,
      "callSessionId": call.get("call_session_id"),
      "status": "started",
      "message": "전문가가 화상 상담을 시작했습니다. 지금 입장해 주세요.",
    },
  )
  return success({"call": call})


@router.post("/bookings/{booking_id}/call/end")
async def end_partner_call(
  booking_id: str,
  account: dict = Depends(get_partner_account),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(require_database),
) -> dict:
  call = await consulting_call.end_partner_call(db, account, booking_id, settings)
  await consulting_realtime_manager.broadcast(
    booking_id,
    {
      "type": "call.status",
      "bookingId": booking_id,
      "callSessionId": call.get("call_session_id"),
      "status": "ended",
      "message": "전문가가 화상 상담을 종료했습니다.",
    },
  )
  return success({"call": call})


@router.post("/bookings/{booking_id}/call/transcription/start")
async def start_partner_call_transcription(
  booking_id: str,
  payload: ConsultingTranscriptionStartRequest,
  account: dict = Depends(get_partner_account),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(require_database),
) -> dict:
  return success(
    {
      "call": await consulting_call.start_partner_transcription(
        db,
        account,
        booking_id,
        payload.language_code,
        payload.transcription_consent_accepted,
        settings,
      ),
    },
  )


@router.post("/bookings/{booking_id}/call/transcription/stop")
async def stop_partner_call_transcription(
  booking_id: str,
  account: dict = Depends(get_partner_account),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(require_database),
) -> dict:
  return success({"call": await consulting_call.stop_partner_transcription(db, account, booking_id, settings)})


@router.post("/bookings/{booking_id}/call/captions/translate")
async def translate_partner_call_caption(
  booking_id: str,
  payload: ConsultingCaptionTranslateRequest,
  account: dict = Depends(get_partner_account),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(require_database),
) -> dict:
  translated = await consulting_call.translate_partner_caption(
    db,
    account,
    booking_id,
    result_id=payload.result_id,
    source_language_code=payload.source_language_code,
    content=payload.content,
    settings=settings,
  )
  await consulting_realtime_manager.broadcast(
    booking_id,
    {
      "type": "caption.translation",
      "bookingId": booking_id,
      "resultId": translated["result_id"],
      "sourceLanguageCode": translated["source_language_code"],
      "targetLanguageCode": translated["target_language_code"],
      "translatedContent": translated["translated_content"],
    },
  )
  return success(translated)


@router.get("/customers")
async def get_partner_customers(
  query: str | None = Query(default=None),
  tag: str | None = Query(default=None),
  status: str | None = Query(default=None),
  sort: str | None = Query(default=None),
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  return success(
    {
      "customers": await consulting_partner.customers(
        db,
        account,
        {"query": query, "tag": tag, "status": status, "sort": sort},
      ),
    },
  )


@router.get("/customers/{customer_id}")
async def get_partner_customer_detail(
  customer_id: str,
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  return success({"detail": await consulting_partner.customer_detail(db, account, customer_id)})


@router.get("/chat/threads")
async def get_partner_chat_threads(
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  return success({"threads": await consulting_partner.chat_threads_for_account(db, account)})


@router.get("/chat/threads/{thread_id}")
async def get_partner_chat_thread_detail(
  thread_id: str,
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  return success({"detail": await consulting_partner.chat_thread_detail(db, account, thread_id)})


@router.post("/chat/threads/{thread_id}/read")
async def mark_partner_chat_thread_read(
  thread_id: str,
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  return success({"detail": await consulting_partner.mark_chat_thread_read(db, account, thread_id)})


@router.get("/summaries/{booking_id}")
async def get_partner_booking_summary(
  booking_id: str,
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  await consulting_partner.booking_detail(db, account, booking_id)
  return success({"summary": await consulting_partner.consultation_summary_for_booking(db, booking_id)})


@router.post("/summaries/{booking_id}/generate")
async def generate_partner_booking_summary(
  booking_id: str,
  payload: PartnerSummaryGenerateRequest,
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  return success(
    await consulting_partner.generate_consultation_summary(
      db,
      account,
      booking_id,
      payload.transcript,
      payload.expert_comment,
      payload.visible_to_customer,
    ),
  )


@router.post("/summaries/{booking_id}/complete")
async def complete_partner_booking_summary(
  booking_id: str,
  payload: PartnerSummaryCompleteRequest,
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  return success(
    {
      "summary": await consulting_partner.complete_consultation_summary(
        db,
        account,
        booking_id,
        payload.transcript,
        payload.expert_comment,
        payload.customer_summary,
        payload.recommendations,
        payload.visible_to_customer,
        payload.delivered_report_ids,
        payload.send_review_request,
      ),
    },
  )


@router.post("/media/presigned-upload")
async def create_partner_presigned_upload(
  payload: PresignedUploadRequest,
  _: dict = Depends(get_partner_account),
  settings: Settings = Depends(get_settings),
) -> dict:
  return success(
    {
      "upload": S3Service(settings).create_presigned_upload(
        media_kind=payload.media_kind,
        content_type=payload.content_type,
        original_filename=payload.original_filename,
      ),
    },
  )


@router.post("/media/complete-upload")
async def complete_partner_upload(
  payload: CompleteUploadRequest,
  _: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  media = await db.fetchrow(
    """
    insert into media_assets (
      owner_user_id,
      media_kind,
      source,
      bucket,
      object_key,
      cdn_url,
      thumbnail_bucket,
      thumbnail_object_key,
      thumbnail_cdn_url,
      thumbnail_content_type,
      thumbnail_byte_size,
      thumbnail_width,
      thumbnail_height,
      content_type,
      byte_size,
      width,
      height,
      checksum_sha256,
      original_filename
    )
    values (null, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    returning *
    """,
    payload.media_kind,
    payload.source,
    payload.bucket,
    payload.object_key,
    payload.cdn_url,
    payload.thumbnail_bucket,
    payload.thumbnail_object_key,
    payload.thumbnail_cdn_url,
    payload.thumbnail_content_type,
    payload.thumbnail_byte_size,
    payload.thumbnail_width,
    payload.thumbnail_height,
    payload.content_type,
    payload.byte_size,
    payload.width,
    payload.height,
    payload.checksum_sha256,
    payload.original_filename,
  )
  return success({"media": dict(media)})


@router.get("/shared-reports")
async def get_partner_shared_reports(
  customer_id: str | None = Query(default=None, alias="customerId"),
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  return success({"reports": await consulting_partner.shared_reports(db, account, customer_id)})


@router.get("/reports/{report_id}")
async def get_partner_report_detail(
  report_id: str,
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  return success(await consulting_partner.report_detail(db, account, report_id))
