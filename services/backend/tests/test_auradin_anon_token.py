"""A5 — POST /search/events/token 익명 opaque token 발급 계약 (익명식별 RFC §2.1).

서버는 token을 저장하지 않는다(stateless) — 검증 대상은 발급 형식뿐이다:
128-bit 이상 무작위 base64url, 매 호출 유일, HMAC으로 anon:v1 owner 파생 가능.
"""

from __future__ import annotations

import base64
import re
from typing import Any

from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app
from app.services.auradin_agent.event_logger import derive_event_owner


def _settings(**overrides: Any) -> Settings:
  values: dict[str, Any] = {
    "database_url": None,
    "auradin_session_store": "memory",
    "auradin_anon_token_secret": "test-secret",
  }
  values.update(overrides)
  return Settings(**values)


def _issue_token(client: TestClient) -> str:
  response = client.post("/api/search/events/token")
  assert response.status_code == 200
  body = response.json()
  assert body["error"] is None
  token = body["data"]["token"]
  assert isinstance(token, str)
  return token


def test_issued_token_is_random_urlsafe_with_at_least_128_bits() -> None:
  client = TestClient(create_app(_settings()))

  first = _issue_token(client)
  second = _issue_token(client)

  # RFC §2.1-1 — opaque base64url token (기기식별자 파생값이 아닌 서버 무작위 발급).
  assert re.fullmatch(r"[A-Za-z0-9_-]+", first)
  raw = base64.urlsafe_b64decode(first + "=" * (-len(first) % 4))
  assert len(raw) * 8 >= 128
  # 매 호출 새 무작위 token — 서버가 저장하지 않으므로 재발급 = 새 익명 ID (RFC §2.1-5).
  assert first != second


def test_issued_token_derives_contract_anon_owner_via_hmac() -> None:
  settings = _settings()
  client = TestClient(create_app(settings))

  token = _issue_token(client)
  owner = derive_event_owner(None, settings, anon_token=token)

  # 발급 token은 이벤트 계약 owner(anon:v1:*)로 파생되고, 원문은 owner에 남지 않는다.
  assert owner is not None and owner.startswith("anon:v1:")
  assert token not in owner
