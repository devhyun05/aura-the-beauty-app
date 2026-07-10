from fastapi import APIRouter, Depends, Header, Query

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
from app.services.media_uploads import (
  bind_legacy_thumbnail_session,
  complete_upload_session,
  issue_upload_session,
  resolve_legacy_upload_session_id,
)
from app.services import consulting_partner


router = APIRouter(prefix="/consulting/partner", tags=["consulting-partner"])
PARTNER_ACCOUNT_ISSUE_CONFIRMATION = "issue-default-partner-accounts"


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
  return success({"booking": booking})


@router.get("/customers")
async def get_partner_customers(
  query: str | None = Query(default=None),
  tag: str | None = Query(default=None),
  sort: str | None = Query(default=None),
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
) -> dict:
  return success(
    {
      "customers": await consulting_partner.customers(
        db,
        account,
        {"query": query, "tag": tag, "sort": sort},
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
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  upload = await issue_upload_session(
    db,
    settings,
    payload,
    partner_account_id=account["id"],
  )
  return success({"upload": upload})


@router.post("/media/complete-upload")
async def complete_partner_upload(
  payload: CompleteUploadRequest,
  account: dict = Depends(get_partner_account),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  upload_id = payload.upload_id
  if upload_id is None:
    upload_id = await resolve_legacy_upload_session_id(
      db,
      settings,
      bucket=payload.bucket or "",
      object_key=payload.object_key or "",
      partner_account_id=account["id"],
    )
    if payload.thumbnail_bucket and payload.thumbnail_object_key:
      await bind_legacy_thumbnail_session(
        db,
        settings,
        upload_id,
        thumbnail_bucket=payload.thumbnail_bucket,
        thumbnail_object_key=payload.thumbnail_object_key,
        partner_account_id=account["id"],
      )
  media = await complete_upload_session(
    db,
    settings,
    upload_id,
    partner_account_id=account["id"],
  )
  return success({"media": media})


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
