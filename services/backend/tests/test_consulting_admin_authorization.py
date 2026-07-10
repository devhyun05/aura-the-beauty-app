import pytest
from fastapi.testclient import TestClient

from app.api import consulting as consulting_api
from app.core.errors import AppError
from app.core.security import AuthContext, cognito_groups, get_current_user, require_consulting_admin
from app.core.settings import Settings
from app.db.session import require_database
from app.main import create_app
from app.services import consulting


def auth_context(groups=None) -> AuthContext:
  claims = {"sub": "security-test-user", "token_use": "access"}
  if groups is not None:
    claims["cognito:groups"] = groups
  return AuthContext(
    subject="security-test-user",
    provider="google",
    email="security@example.com",
    name="Security Test",
    claims=claims,
  )


class UnusedDatabase:
  async def fetchrow(self, *_args, **_kwargs):
    raise AssertionError("Forbidden requests must not reach the database.")


ADMIN_REQUESTS = (
  ("POST", "/api/consulting/admin/experts", {"name": "Expert", "title": "Artist", "signatureLine": "Hello", "durations": []}),
  ("POST", "/api/consulting/admin/bookings/booking-1/complete", None),
  ("PATCH", "/api/consulting/admin/bookings/booking-1/status", {"status": "completed"}),
  ("PUT", "/api/consulting/admin/bookings/booking-1/summary", {}),
  ("GET", "/api/consulting/admin/partner-applications", None),
  (
    "POST",
    "/api/consulting/admin/partner-applications/11111111-1111-1111-1111-111111111111/approve",
    {"expertId": "expert-1"},
  ),
  (
    "POST",
    "/api/consulting/admin/partner-applications/11111111-1111-1111-1111-111111111111/reject",
    {},
  ),
  (
    "POST",
    "/api/consulting/admin/partner-applications/11111111-1111-1111-1111-111111111111/needs-update",
    {},
  ),
)


@pytest.mark.parametrize(("method", "path", "payload"), ADMIN_REQUESTS)
def test_regular_user_cannot_call_consulting_admin_endpoints(method: str, path: str, payload: dict | None) -> None:
  app = create_app(Settings(auth_required=True))
  app.dependency_overrides[get_current_user] = lambda: auth_context(["user"])
  app.dependency_overrides[require_database] = lambda: UnusedDatabase()
  client = TestClient(app)

  response = client.request(method, path, json=payload)

  assert response.status_code == 403
  body = response.json()
  assert body["data"] is None
  assert body["error"]["code"] == "CONSULTING_ADMIN_FORBIDDEN"


@pytest.mark.parametrize("group", ["admin", "operator", "business_manager", "ADMIN"])
def test_consulting_admin_dependency_accepts_authorized_groups(group: str) -> None:
  auth = auth_context([group])

  assert require_consulting_admin(auth) is auth


def test_consulting_admin_dependency_accepts_single_string_group_claim() -> None:
  auth = auth_context("operator")

  assert cognito_groups(auth) == frozenset({"operator"})
  assert require_consulting_admin(auth) is auth


def test_consulting_admin_dependency_rejects_missing_group_claim() -> None:
  with pytest.raises(AppError) as exc_info:
    require_consulting_admin(auth_context())

  assert exc_info.value.status_code == 403
  assert exc_info.value.code == "CONSULTING_ADMIN_FORBIDDEN"


def test_operator_can_complete_booking(monkeypatch: pytest.MonkeyPatch) -> None:
  calls: list[tuple[str, object]] = []

  async def fake_ensure_user(_db, auth):
    calls.append(("ensure_user", auth.subject))
    return {"id": "admin-user"}

  async def fake_complete_booking(_db, booking_id: str):
    calls.append(("complete_booking", booking_id))
    return {"id": booking_id, "status": "completed"}

  app = create_app(Settings(auth_required=True))
  app.dependency_overrides[get_current_user] = lambda: auth_context(["operator"])
  app.dependency_overrides[require_database] = lambda: object()
  monkeypatch.setattr(consulting_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(consulting, "complete_booking", fake_complete_booking)
  client = TestClient(app)

  response = client.post("/api/consulting/admin/bookings/booking-1/complete")

  assert response.status_code == 200
  assert response.json()["data"]["record"]["status"] == "completed"
  assert calls == [("ensure_user", "security-test-user"), ("complete_booking", "booking-1")]
