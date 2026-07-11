import json
import stat

import pytest
from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app
from app.services.consulting_partner import (
  _verify_password,
  rotate_existing_partner_credentials,
)
from scripts import rotate_partner_credentials


class PartnerAccountDatabase:
  def __init__(self) -> None:
    self.password_records: list[tuple[str, str]] = []
    self.executions: list[tuple[str, tuple]] = []

  async def execute(self, query: str, *args):
    self.executions.append((query, args))
    return "OK"

  async def fetch(self, _query: str, *_args):
    return [
      {
        "id": "account-1",
        "expert_id": "expert-1",
        "email": "security@example.com",
        "expert_name": "Security Expert",
      },
    ]

  async def fetchrow(self, query: str, *args):
    if "update consulting_partner_accounts" in query:
      self.password_records.append((args[1], args[2]))
      return {"id": "account-1", "expert_id": "expert-1", "email": "security@example.com"}
    raise AssertionError(f"Unexpected query: {query}")


def test_partner_account_issue_http_endpoint_is_removed() -> None:
  client = TestClient(create_app(Settings(database_url=None)))

  response = client.post(
    "/api/consulting/partner/dev/issue-accounts",
    headers={"X-Partner-Issue-Confirmation": "issue-default-partner-accounts"},
  )

  assert response.status_code == 404


@pytest.mark.asyncio
async def test_partner_credentials_are_random_and_revoke_existing_sessions() -> None:
  db = PartnerAccountDatabase()

  first = await rotate_existing_partner_credentials(db)
  second = await rotate_existing_partner_credentials(db)

  first_password = first[0]["temporary_password"]
  second_password = second[0]["temporary_password"]
  assert first_password != second_password
  assert len(first_password) >= 32
  assert len(second_password) >= 32

  first_hash, first_salt = db.password_records[0]
  second_hash, second_salt = db.password_records[1]
  assert first_salt != second_salt
  assert first_hash.startswith("pbkdf2_sha256$")
  assert second_hash.startswith("pbkdf2_sha256$")
  assert _verify_password(first_password, first_salt, first_hash)
  assert _verify_password(second_password, second_salt, second_hash)

  session_revocations = [
    args
    for query, args in db.executions
    if "delete from consulting_partner_sessions" in query
  ]
  assert session_revocations == [("account-1",), ("account-1",)]


def test_legacy_partner_password_hashes_are_rejected_until_credentials_are_rotated() -> None:
  assert not _verify_password("legacy-password", "legacy-salt", "0" * 64)


def test_rotation_script_writes_credentials_to_owner_only_file(
  tmp_path,
  monkeypatch: pytest.MonkeyPatch,
  capsys: pytest.CaptureFixture[str],
) -> None:
  output_path = tmp_path / "partner-credentials.json"

  async def fake_rotate_credentials():
    return [{"email": "partner@example.com", "temporary_password": "secret-value"}]

  monkeypatch.setattr(rotate_partner_credentials, "rotate_credentials", fake_rotate_credentials)
  monkeypatch.setattr(
    "sys.argv",
    [
      "rotate_partner_credentials.py",
      "--confirm",
      "rotate-partner-credentials",
      "--output",
      str(output_path),
    ],
  )

  assert rotate_partner_credentials.main() == 0
  assert stat.S_IMODE(output_path.stat().st_mode) == 0o600
  assert json.loads(output_path.read_text())["accounts"][0]["temporary_password"] == "secret-value"
  assert "secret-value" not in capsys.readouterr().out


def test_rotation_script_does_not_rotate_when_output_file_already_exists(
  tmp_path,
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  output_path = tmp_path / "partner-credentials.json"
  output_path.write_text("existing")
  rotation_started = False

  async def fake_rotate_credentials():
    nonlocal rotation_started
    rotation_started = True
    return []

  monkeypatch.setattr(rotate_partner_credentials, "rotate_credentials", fake_rotate_credentials)
  monkeypatch.setattr(
    "sys.argv",
    [
      "rotate_partner_credentials.py",
      "--confirm",
      "rotate-partner-credentials",
      "--output",
      str(output_path),
    ],
  )

  with pytest.raises(FileExistsError):
    rotate_partner_credentials.main()

  assert rotation_started is False
  assert output_path.read_text() == "existing"
