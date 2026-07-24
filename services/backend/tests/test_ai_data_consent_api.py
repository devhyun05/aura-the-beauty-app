import asyncio
from datetime import UTC, datetime

from app.api.privacy import (
  AI_DATA_CONSENT_PURPOSES,
  AI_DATA_CONSENT_VERSION,
  AiDataConsentUpdate,
  _consent_response,
  update_ai_data_consent,
)
from app.core.security import AuthContext


def _row(purpose: str, *, accepted: bool = True, version: str = AI_DATA_CONSENT_VERSION) -> dict:
  recorded_at = datetime(2026, 7, 25, tzinfo=UTC)
  return {
    "id": f"{purpose}-id",
    "consent_type": purpose,
    "version": version,
    "accepted": accepted,
    "accepted_at": recorded_at if accepted else None,
    "revoked_at": None if accepted else recorded_at,
    "recorded_at": recorded_at,
  }


def test_consent_response_requires_all_current_purposes() -> None:
  accepted = _consent_response([_row(purpose) for purpose in AI_DATA_CONSENT_PURPOSES])
  missing = _consent_response([_row("camera_analysis"), _row("ai_processing")])
  stale = _consent_response([
    _row("camera_analysis"),
    _row("ai_processing"),
    _row("third_party_ai", version="stale"),
  ])

  assert accepted["accepted"] is True
  assert len(accepted["consent_ids"]) == 3
  assert missing["accepted"] is False
  assert stale["accepted"] is False


class FakeConsentConnection:
  def __init__(self) -> None:
    self.args = None

  async def fetch(self, _query: str, *args):
    self.args = args
    accepted = args[2]
    return [_row(purpose, accepted=accepted) for purpose in AI_DATA_CONSENT_PURPOSES]


class FakeConsentDatabase:
  def __init__(self) -> None:
    self.connection = FakeConsentConnection()

  async def fetchrow(self, _query: str, *_args):
    return {"id": "user-id", "profile_completed": True}

  async def run_in_transaction(self, operation):
    return await operation(self.connection)


def test_put_records_all_purposes_in_one_transaction() -> None:
  async def run_test() -> tuple[FakeConsentDatabase, dict]:
    db = FakeConsentDatabase()
    auth = AuthContext(
      subject="subject",
      provider="google",
      email="user@example.com",
      name="User",
      claims={},
    )
    response = await update_ai_data_consent(
      AiDataConsentUpdate(accepted=True),
      auth=auth,
      db=db,
    )
    return db, response

  db, response = asyncio.run(run_test())
  assert db.connection.args is not None
  assert db.connection.args[4] == list(AI_DATA_CONSENT_PURPOSES)
  assert response["data"]["consent"]["accepted"] is True
