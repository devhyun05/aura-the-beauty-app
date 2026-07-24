from fastapi import APIRouter, Depends, Response

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.db.session import Database, require_database
from app.schemas.privacy_consent import AiDataConsentUpdate
from app.services.privacy_consents import get_ai_data_consent, set_ai_data_consent
from app.services.users import ensure_user


router = APIRouter(prefix="/privacy", tags=["privacy"])


@router.get("/ai-consent")
async def read_ai_data_consent(
  response: Response,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  response.headers["Cache-Control"] = "private, no-store"
  return success({
    "consent": await get_ai_data_consent(db, user_id=user["id"]),
  })


@router.put("/ai-consent")
async def update_ai_data_consent(
  payload: AiDataConsentUpdate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)

  async def persist_consent(connection) -> dict:
    return await set_ai_data_consent(
      connection,  # type: ignore[arg-type]
      accepted=payload.accepted,
      user_id=user["id"],
    )

  consent = await db.run_in_transaction(persist_consent)
  return success({"consent": consent})
