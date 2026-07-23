from uuid import uuid4

import pytest
from fastapi import BackgroundTasks

from app.api import users as users_api
from app.core.errors import AppError
from app.core.security import AuthContext
from app.core.settings import Settings
from app.schemas.users import AccountDeletionRequest
from app.services.account_deletion import (
  AccountDeletionResult,
  _collect_makeup_recommendation_objects,
  _delete_unlinked_account_data,
  delete_cognito_identity,
)
from app.services.account_identity import hash_auth_subject
from app.services.users import ensure_user


def build_auth_context() -> AuthContext:
  return AuthContext(
    subject="cognito-user-subject",
    provider="google",
    email="user@example.com",
    name="AURA User",
    claims={"sub": "cognito-user-subject", "token_use": "access"},
  )


class DeletedIdentityDatabase:
  async def fetchrow(self, query: str, *args):
    assert "insert into users" in query
    assert "from account_deletion_tombstones" in query
    assert args[-1] == hash_auth_subject("google", "cognito-user-subject")
    return None


class UnlinkedAccountDataConnection:
  def __init__(
    self,
    *,
    has_auradin_events: bool,
    has_face3d_receipts: bool,
  ) -> None:
    self.has_auradin_events = has_auradin_events
    self.has_face3d_receipts = has_face3d_receipts
    self.executed: list[tuple[str, tuple]] = []
    self.table_checks: list[str] = []

  async def fetchval(self, query: str, *_args):
    self.table_checks.append(query)
    if "face3d_calibration_receipt_consumptions" in query:
      return self.has_face3d_receipts
    if "auradin_events" in query:
      return self.has_auradin_events
    raise AssertionError(f"Unexpected table check: {query}")

  async def execute(self, query: str, *args):
    self.executed.append((query, args))
    return "DELETE 1"


def test_auth_subject_hash_is_stable_and_does_not_store_raw_identity() -> None:
  digest = hash_auth_subject("google", "cognito-user-subject")

  assert digest == hash_auth_subject("google", "cognito-user-subject")
  assert len(digest) == 64
  assert "cognito-user-subject" not in digest


@pytest.mark.asyncio
async def test_unlinked_face3d_receipts_and_auradin_events_are_deleted() -> None:
  user_id = uuid4()
  connection = UnlinkedAccountDataConnection(
    has_auradin_events=True,
    has_face3d_receipts=True,
  )

  await _delete_unlinked_account_data(
    connection,
    auth=build_auth_context(),
    settings=Settings(),
    user_id=user_id,
  )

  face3d_delete = next(
    call
    for call in connection.executed
    if "delete from face3d_calibration_receipt_consumptions" in call[0]
  )
  assert face3d_delete[1] == (f"subj_user_{user_id}",)

  auradin_delete = next(
    call
    for call in connection.executed
    if "delete from auradin_events" in call[0]
  )
  assert auradin_delete[1] == (
    [
      "cognito-user-subject",
      "user:v1:cognito:cognito-user-subject",
    ],
  )


@pytest.mark.asyncio
async def test_unlinked_account_cleanup_skips_tables_missing_from_older_installs() -> None:
  connection = UnlinkedAccountDataConnection(
    has_auradin_events=False,
    has_face3d_receipts=False,
  )

  await _delete_unlinked_account_data(
    connection,
    auth=build_auth_context(),
    settings=Settings(),
    user_id=uuid4(),
  )

  assert len(connection.table_checks) == 2
  assert connection.executed == []


def test_makeup_recommendation_account_assets_are_limited_to_managed_prefix_and_bucket() -> None:
  report_id = uuid4()
  settings = Settings(
    s3_bucket_name="aura-media",
    makeup_private_asset_prefix="private/generated-makeup-recommendations",
  )
  objects = _collect_makeup_recommendation_objects(
    [
      {"report_id": report_id, "storage_bucket": "aura-media", "object_key": "uploads/generated-makeup-recommendations/report/look.webp"},
      {"report_id": report_id, "storage_bucket": "aura-media", "object_key": "private/generated-makeup-recommendations/report/look.webp"},
      {"report_id": report_id, "storage_bucket": "other-bucket", "object_key": "private/generated-makeup-recommendations/report/other.webp"},
      {"report_id": report_id, "storage_bucket": "aura-media", "object_key": "backups/database.sql"},
    ],
    settings,
  )

  assert {object_key for _, _, object_key in objects} == {
    "uploads/generated-makeup-recommendations/report/look.webp",
    "private/generated-makeup-recommendations/report/look.webp",
  }

@pytest.mark.asyncio
async def test_deleted_identity_cannot_be_recreated_by_a_still_valid_token() -> None:
  with pytest.raises(AppError) as exc_info:
    await ensure_user(DeletedIdentityDatabase(), build_auth_context())

  assert exc_info.value.status_code == 403
  assert exc_info.value.code == "ACCOUNT_DELETED"


@pytest.mark.asyncio
async def test_cognito_deletion_is_skipped_when_pool_is_not_configured() -> None:
  deleted = await delete_cognito_identity(build_auth_context(), Settings(cognito_user_pool_id=None))

  assert deleted is False


@pytest.mark.asyncio
async def test_delete_account_response_and_media_cleanup_task(monkeypatch) -> None:
  outbox_id = uuid4()

  async def fake_ensure_user(_db, _auth):
    return {"id": uuid4()}

  async def fake_delete_user_account(_db, *, auth, reason, settings, user_id):
    assert auth.subject == "cognito-user-subject"
    assert settings.s3_bucket_name is None
    assert reason == "privacy_concerns"
    assert user_id is not None
    return AccountDeletionResult(media_count=1, outbox_ids=(outbox_id,))

  async def fake_delete_cognito_identity(_auth, _settings):
    return True

  monkeypatch.setattr(users_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(users_api, "delete_user_account", fake_delete_user_account)
  monkeypatch.setattr(users_api, "delete_cognito_identity", fake_delete_cognito_identity)

  background_tasks = BackgroundTasks()
  response = await users_api.delete_my_account(
    background_tasks,
    payload=AccountDeletionRequest(reason="privacy_concerns"),
    auth=build_auth_context(),
    db=object(),
    settings=Settings(cognito_user_pool_id="ap-northeast-2_example"),
  )

  assert response["data"] == {
    "deleted": True,
    "identityDeleted": True,
    "mediaDeletionPending": 1,
  }
  assert len(background_tasks.tasks) == 1
