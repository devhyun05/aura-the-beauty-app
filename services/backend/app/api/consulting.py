from fastapi import APIRouter, Depends, Query

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.db.session import Database, require_database
from app.schemas.consulting import (
  AdminBookingSummaryUpsert,
  AdminExpertCreate,
  BookingCreate,
  MembershipSubscribe,
  PaymentCreate,
  ReviewCreate,
)
from app.services import consulting
from app.services.users import ensure_user


router = APIRouter(prefix="/consulting", tags=["consulting"])


def _mask_author(nickname: str | None) -> str:
  name = (nickname or "").strip() or "익명"
  if len(name) <= 1:
    return name
  return name[:-1] + "*"


# -----------------------------------------------------------------------------
# Read-only catalog
# -----------------------------------------------------------------------------
@router.get("/home")
async def get_consulting_home(
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  return success(await consulting.get_home(db, user["id"]))


@router.get("/categories")
async def get_consulting_categories(
  db: Database = Depends(require_database),
) -> dict:
  return success({"categories": await consulting.list_categories(db)})


@router.get("/experts")
async def get_consulting_experts(
  category: str | None = Query(default=None),
  db: Database = Depends(require_database),
) -> dict:
  experts = await consulting.list_experts(db, category)
  return success({"experts": experts})


@router.get("/experts/{expert_id}")
async def get_consulting_expert(
  expert_id: str,
  db: Database = Depends(require_database),
) -> dict:
  return success({"expert": await consulting.get_expert(db, expert_id)})


@router.get("/experts/{expert_id}/slots")
async def get_consulting_expert_slots(
  expert_id: str,
  duration_id: str | None = Query(default=None, alias="durationId"),
  db: Database = Depends(require_database),
) -> dict:
  return success({"days": await consulting.get_expert_slots(db, expert_id, duration_id)})


@router.get("/membership/plans")
async def get_consulting_membership_plans(
  db: Database = Depends(require_database),
) -> dict:
  return success({"plans": await consulting.list_membership_plans(db)})


# -----------------------------------------------------------------------------
# Bookings
# -----------------------------------------------------------------------------
@router.get("/bookings")
async def get_consulting_bookings(
  status: str | None = Query(default=None),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  records = await consulting.list_bookings(db, user["id"], status)
  return success({"records": records})


@router.get("/bookings/{booking_id}")
async def get_consulting_booking(
  booking_id: str,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  return success({"record": await consulting.get_booking(db, user["id"], booking_id)})


@router.post("/bookings")
async def create_consulting_booking(
  payload: BookingCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  return success({"record": await consulting.create_booking(db, user["id"], payload)})


@router.patch("/bookings/{booking_id}")
async def update_consulting_booking(
  booking_id: str,
  payload: BookingCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  return success({"record": await consulting.update_booking(db, user["id"], booking_id, payload)})


@router.post("/bookings/{booking_id}/cancel")
async def cancel_consulting_booking(
  booking_id: str,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  return success({"record": await consulting.cancel_booking(db, user["id"], booking_id)})


@router.delete("/bookings/{booking_id}")
async def delete_consulting_booking(
  booking_id: str,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  await consulting.delete_canceled_booking(db, user["id"], booking_id)
  return success({"deleted": True, "booking_id": booking_id})


@router.get("/bookings/{booking_id}/summary")
async def get_consulting_booking_summary(
  booking_id: str,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  return success({"summary": await consulting.get_booking_summary(db, user["id"], booking_id)})


@router.post("/bookings/{booking_id}/reviews")
async def create_consulting_review(
  booking_id: str,
  payload: ReviewCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  review = await consulting.create_review(
    db,
    user["id"],
    _mask_author(user.get("nickname")),
    booking_id,
    payload,
  )
  return success({"review": review})


# -----------------------------------------------------------------------------
# Admin operations
# -----------------------------------------------------------------------------
@router.post("/admin/experts")
async def create_consulting_admin_expert(
  payload: AdminExpertCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  await ensure_user(db, auth)
  return success({"expert": await consulting.create_admin_expert(db, payload)})


@router.post("/admin/bookings/{booking_id}/complete")
async def complete_consulting_admin_booking(
  booking_id: str,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  await ensure_user(db, auth)
  return success({"record": await consulting.complete_booking(db, booking_id)})


@router.put("/admin/bookings/{booking_id}/summary")
async def upsert_consulting_admin_booking_summary(
  booking_id: str,
  payload: AdminBookingSummaryUpsert,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  await ensure_user(db, auth)
  return success({"record": await consulting.upsert_booking_summary(db, booking_id, payload)})


# -----------------------------------------------------------------------------
# Membership & payments
# -----------------------------------------------------------------------------
@router.get("/membership/me")
async def get_consulting_membership_me(
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  return success({"membership": await consulting.get_my_membership(db, user["id"])})


@router.post("/membership/subscribe")
async def subscribe_consulting_membership(
  payload: MembershipSubscribe,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  return success({"membership": await consulting.subscribe_membership(db, user["id"], payload)})


@router.post("/payments")
async def create_consulting_payment(
  payload: PaymentCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  return success({"payment": await consulting.create_payment(db, user["id"], payload)})
