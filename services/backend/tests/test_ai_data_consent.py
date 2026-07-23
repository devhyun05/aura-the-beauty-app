from datetime import datetime, timezone
from uuid import UUID

import pytest

from app.core.errors import AppError
from app.services import privacy_consents


USER_ID = UUID("11111111-1111-1111-1111-111111111111")


def _consent_rows(*, accepted: bool = True, version: str | None = None) -> list[dict]:
  current_version = version or privacy_consents.AI_DATA_CONSENT_VERSION
  accepted_at = datetime(2026, 7, 23, tzinfo=timezone.utc) if accepted else None
  revoked_at = None if accepted else datetime(2026, 7, 23, tzinfo=timezone.utc)
  return [
    {
      "id": UUID(f"{index}1111111-1111-1111-1111-111111111111"),
      "purpose": purpose,
      "accepted": accepted,
      "version": current_version,
      "accepted_at": accepted_at,
      "revoked_at": revoked_at,
    }
    for index, purpose in enumerate(privacy_consents.AI_DATA_CONSENT_TYPES, start=1)
  ]


@pytest.mark.asyncio
async def test_get_ai_data_consent_requires_every_current_purpose() -> None:
  class DB:
    async def fetch(self, query: str, *args):
      assert "distinct on (consent_type)" in query
      assert args == (USER_ID, list(privacy_consents.AI_DATA_CONSENT_TYPES))
      return _consent_rows()

  consent = await privacy_consents.get_ai_data_consent(DB(), user_id=USER_ID)

  assert consent["accepted"] is True
  assert consent["version"] == privacy_consents.AI_DATA_CONSENT_VERSION
  assert len(consent["consentIds"]) == len(privacy_consents.AI_DATA_CONSENT_TYPES)
  assert all(
    consent["purposes"][purpose]["accepted"] is True
    for purpose in privacy_consents.AI_DATA_CONSENT_TYPES
  )


@pytest.mark.asyncio
async def test_get_ai_data_consent_rejects_missing_or_stale_purpose() -> None:
  class DB:
    async def fetch(self, _query: str, *_args):
      rows = _consent_rows()
      rows[-1]["version"] = "ai-photo-processing-v0"
      return rows

  consent = await privacy_consents.get_ai_data_consent(DB(), user_id=USER_ID)

  assert consent["accepted"] is False
  assert consent["consentIds"] == []


@pytest.mark.asyncio
async def test_set_ai_data_consent_appends_all_purpose_records(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  executed: list[tuple[str, tuple]] = []

  class DB:
    async def execute(self, query: str, *args):
      executed.append((query, args))

  expected = {"accepted": True}

  async def fake_get(_db, *, user_id):
    assert user_id == USER_ID
    return expected

  monkeypatch.setattr(privacy_consents, "get_ai_data_consent", fake_get)
  result = await privacy_consents.set_ai_data_consent(
    DB(),
    accepted=True,
    user_id=USER_ID,
  )

  assert result is expected
  assert len(executed) == len(privacy_consents.AI_DATA_CONSENT_TYPES)
  assert [args[1] for _query, args in executed] == list(privacy_consents.AI_DATA_CONSENT_TYPES)
  assert all("insert into user_consents" in query for query, _args in executed)
  assert all(args[2] == privacy_consents.AI_DATA_CONSENT_VERSION for _query, args in executed)
  assert all(args[3] is True for _query, args in executed)


@pytest.mark.asyncio
async def test_require_current_ai_data_consent_returns_snapshot_or_403(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  accepted = {
    "accepted": True,
    "version": privacy_consents.AI_DATA_CONSENT_VERSION,
  }

  async def fake_accepted(_db, *, user_id):
    assert user_id == USER_ID
    return accepted

  monkeypatch.setattr(privacy_consents, "get_ai_data_consent", fake_accepted)
  assert (
    await privacy_consents.require_current_ai_data_consent(object(), user_id=USER_ID)
    is accepted
  )

  async def fake_rejected(_db, *, user_id):
    assert user_id == USER_ID
    return {"accepted": False}

  monkeypatch.setattr(privacy_consents, "get_ai_data_consent", fake_rejected)
  with pytest.raises(AppError) as exc_info:
    await privacy_consents.require_current_ai_data_consent(object(), user_id=USER_ID)

  assert exc_info.value.status_code == 403
  assert exc_info.value.code == "AI_DATA_CONSENT_REQUIRED"
