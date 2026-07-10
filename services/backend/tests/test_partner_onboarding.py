import pytest
from fastapi.testclient import TestClient

from app.api import consulting as consulting_api
from app.api import consulting_partner as partner_api
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings
from app.db.session import require_database
from app.main import create_app
from app.services import consulting_partner


def admin_auth() -> AuthContext:
  return AuthContext(
    subject="admin-subject",
    provider="cognito",
    email="admin@example.com",
    name="Admin",
    claims={"sub": "admin-subject", "cognito:groups": ["admin"]},
  )


class OnboardingDatabase:
  def __init__(self, fetchrow_result: dict | None = None) -> None:
    self.fetchrow_result = fetchrow_result
    self.fetchrow_calls: list[tuple[str, tuple]] = []

  async def execute(self, _query: str, *_args):
    return "OK"

  async def fetchrow(self, query: str, *args):
    self.fetchrow_calls.append((query, args))
    return self.fetchrow_result


def test_consultant_can_submit_signup_application(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_submit(_db, payload):
    return {
      "id": "application-1",
      "email": payload.email,
      "name": payload.name,
      "status": "submitted",
    }

  app = create_app(Settings(database_url=None))
  app.dependency_overrides[require_database] = lambda: object()
  monkeypatch.setattr(partner_api.consulting_partner, "submit_partner_application", fake_submit)
  client = TestClient(app)

  response = client.post(
    "/api/consulting/partner/applications",
    json={
      "email": "artist@example.com",
      "name": "Artist",
      "title": "Makeup consultant",
    },
  )

  assert response.status_code == 201
  assert response.json()["data"]["application"]["status"] == "submitted"


def test_approved_consultant_can_change_temporary_password_after_login(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def fake_change(_db, account_id, password):
    assert account_id == "11111111-1111-1111-1111-111111111111"
    assert password == "StrongPassword123!"
    return {"id": account_id, "status": "active", "password_change_required": False}

  app = create_app(Settings(auth_required=True, database_url=None))
  app.dependency_overrides[partner_api.get_partner_session_account] = lambda: {
    "id": "11111111-1111-1111-1111-111111111111",
    "status": "invited",
    "password_change_required": True,
  }
  app.dependency_overrides[require_database] = lambda: object()
  monkeypatch.setattr(partner_api.consulting_partner, "change_partner_password", fake_change)
  client = TestClient(app)

  response = client.post(
    "/api/consulting/partner/me/password",
    json={"newPassword": "StrongPassword123!"},
  )

  assert response.status_code == 200
  assert response.json()["data"]["account"]["status"] == "active"


def test_invited_consultant_cannot_access_workspace_before_password_change() -> None:
  app = create_app(Settings(auth_required=True, database_url=None))
  app.dependency_overrides[partner_api.get_partner_session_account] = lambda: {
    "id": "11111111-1111-1111-1111-111111111111",
    "status": "invited",
    "password_change_required": True,
  }
  app.dependency_overrides[require_database] = lambda: object()
  client = TestClient(app)

  response = client.get("/api/consulting/partner/dashboard")

  assert response.status_code == 403
  assert response.json()["error"]["code"] == "PARTNER_PASSWORD_CHANGE_REQUIRED"


def test_admin_can_approve_application_and_receive_temporary_password(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: list[tuple] = []

  async def fake_ensure_user(_db, auth):
    return {"id": auth.subject}

  async def fake_approve(_db, application_id, expert_id, reviewer_subject):
    calls.append((application_id, expert_id, reviewer_subject))
    return {
      "application": {"status": "approved"},
      "account": {
        "temporary_password": "temporary-password",
        "password_change_required": True,
      },
    }

  app = create_app(Settings(auth_required=True, database_url=None))
  app.dependency_overrides[get_current_user] = admin_auth
  app.dependency_overrides[require_database] = lambda: object()
  monkeypatch.setattr(consulting_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(consulting_partner, "approve_partner_application", fake_approve)
  client = TestClient(app)
  application_id = "11111111-1111-1111-1111-111111111111"

  response = client.post(
    f"/api/consulting/admin/partner-applications/{application_id}/approve",
    json={"expertId": "expert-1"},
  )

  assert response.status_code == 200
  assert response.json()["data"]["application"]["status"] == "approved"
  assert response.json()["data"]["account"]["temporaryPassword"] == "temporary-password"
  assert response.json()["data"]["account"]["passwordChangeRequired"] is True
  assert calls == [(application_id, "expert-1", "admin-subject")]


@pytest.mark.asyncio
async def test_approval_hashes_temporary_password_and_revokes_sessions() -> None:
  db = OnboardingDatabase(
    {
      "id": "application-1",
      "email": "artist@example.com",
      "status": "approved",
      "expert_id": "expert-1",
      "account_id": "account-1",
      "account_status": "invited",
    },
  )

  approved = await consulting_partner.approve_partner_application(
    db,
    "11111111-1111-1111-1111-111111111111",
    "expert-1",
    "admin-subject",
  )

  query, args = db.fetchrow_calls[-1]
  temporary_password = approved["account"]["temporary_password"]
  assert temporary_password not in args
  assert consulting_partner._verify_password(temporary_password, args[4], args[3])
  assert "delete from consulting_partner_sessions" in query


@pytest.mark.asyncio
async def test_temporary_password_change_activates_invited_account() -> None:
  db = OnboardingDatabase(
    {
      "id": "account-1",
      "email": "artist@example.com",
      "expert_id": "expert-1",
      "status": "active",
    },
  )
  account_id = "11111111-1111-1111-1111-111111111111"
  account = await consulting_partner.change_partner_password(db, account_id, "StrongPassword123!")

  query, args = db.fetchrow_calls[-1]
  assert account["status"] == "active"
  assert args[0] == account_id
  assert args[1].startswith("pbkdf2_sha256$")
  assert "status = 'active'" in query
  assert "password_change_required = true" in query


@pytest.mark.asyncio
async def test_invited_account_can_only_enter_password_change_flow() -> None:
  password = "TemporaryPassword123!"
  salt = "temporary-salt"
  db = OnboardingDatabase(
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "expert_id": "expert-1",
      "email": "artist@example.com",
      "role": "expert",
      "workspace_scope": "expert_personal",
      "status": "invited",
      "password_change_required": True,
      "expert_name": "Artist",
      "password_salt": salt,
      "password_hash": consulting_partner._password_hash(password, salt),
    },
  )

  result = await consulting_partner.login(db, "artist@example.com", password)

  login_query, _ = db.fetchrow_calls[-1]
  assert "a.status in ('invited', 'active')" in login_query
  assert result["user"]["password_change_required"] is True
  assert result["user"]["application_status"] == "approved"
