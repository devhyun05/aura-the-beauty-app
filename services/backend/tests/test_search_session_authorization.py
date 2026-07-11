import pytest
from fastapi.testclient import TestClient

from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings
from app.main import create_app
from app.services.auradin_agent.session_manager import clear_sessions


def auth_context(subject: str) -> AuthContext:
  return AuthContext(
    subject=subject,
    provider="cognito",
    email=f"{subject}@example.com",
    name=subject,
    claims={"sub": subject, "token_use": "access"},
  )


ANONYMOUS_REQUESTS = (
  ("POST", "/api/search/sessions", {"prompt": "립 추천해줘"}),
  ("GET", "/api/search/sessions/session-1", None),
  (
    "POST",
    "/api/search/sessions/session-1/answer",
    {"questionId": "question-1", "optionId": "option-1"},
  ),
  ("POST", "/api/search/sessions/session-1/refine", {"prompt": "2만원 이하"}),
  ("POST", "/api/search/sessions/session-1/cancel", None),
)


@pytest.mark.parametrize(("method", "path", "payload"), ANONYMOUS_REQUESTS)
def test_search_session_endpoints_require_login(
  method: str,
  path: str,
  payload: dict | None,
) -> None:
  clear_sessions()
  client = TestClient(create_app(Settings(auth_required=True, database_url=None)))

  response = client.request(method, path, json=payload)

  assert response.status_code == 401
  assert response.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.parametrize(
  ("method", "path_suffix", "payload"),
  (
    ("GET", "", None),
    (
      "POST",
      "/answer",
      {"questionId": "question-1", "optionId": "option-1"},
    ),
    ("POST", "/refine", {"prompt": "2만원 이하"}),
    ("POST", "/cancel", None),
  ),
)
def test_other_user_cannot_access_or_mutate_search_session(
  method: str,
  path_suffix: str,
  payload: dict | None,
) -> None:
  clear_sessions()
  app = create_app(Settings(auth_required=True, database_url=None))
  app.dependency_overrides[get_current_user] = lambda: auth_context("owner-user")
  client = TestClient(app)
  created = client.post("/api/search/sessions", json={"prompt": "립 추천해줘"})
  assert created.status_code == 200
  session_id = created.json()["data"]["sessionId"]

  app.dependency_overrides[get_current_user] = lambda: auth_context("other-user")
  response = client.request(
    method,
    f"/api/search/sessions/{session_id}{path_suffix}",
    json=payload,
  )

  assert response.status_code == 404
  assert response.json()["error"]["code"] == "SESSION_NOT_FOUND"

  app.dependency_overrides[get_current_user] = lambda: auth_context("owner-user")
  owner_response = client.get(f"/api/search/sessions/{session_id}")
  assert owner_response.status_code == 200
  assert owner_response.json()["data"]["phase"] != "cancelled"
