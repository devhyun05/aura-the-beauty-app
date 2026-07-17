import pytest
from pydantic import ValidationError

from app.core.settings import Settings


def lab_settings(**overrides) -> Settings:
  return Settings(
    _env_file=None,
    lab_mode=True,
    ai_provider="disabled",
    image_generation_provider="disabled",
    **overrides,
  )


def test_report_lab_is_off_by_default() -> None:
  assert Settings(_env_file=None).lab_mode is False


@pytest.mark.parametrize(
  "overrides",
  [
    {"environment": "production"},
    {"ai_provider": "bedrock"},
    {"image_generation_provider": "openai"},
    {"database_secret_id": "remote-secret"},
    {"database_url": "postgresql://aura_report_lab:x@db.example.com:55432/aura_report_lab"},
    {"database_url": "postgresql://aura_report_lab:x@127.0.0.1:5432/aura_report_lab"},
    {"database_url": "postgresql://aura_report_lab:x@127.0.0.1:55432/production"},
    {"report_lab_max_runs_per_request": 4},
    {"report_lab_session_budget_runs": 51},
    {"report_lab_retention_days": 8},
    {"report_lab_fixture_principal_id": "00000000-0000-4000-8000-000000000099"},
  ],
)
def test_report_lab_rejects_nonlocal_or_provider_enabled_configuration(overrides: dict) -> None:
  base = {
    "lab_mode": True,
    "ai_provider": "disabled",
    "image_generation_provider": "disabled",
  }
  base.update(overrides)
  with pytest.raises(ValidationError):
    Settings(_env_file=None, **base)


def test_report_lab_accepts_the_dedicated_loopback_database() -> None:
  settings = lab_settings(
    database_url=(
      "postgresql://aura_report_lab:local-password@"
      "127.0.0.1:55432/aura_report_lab"
    ),
  )

  assert settings.report_lab_model_provider == "disabled"
  assert settings.report_lab_cors_origin == "http://127.0.0.1:5173"


def test_report_lab_accepts_only_the_bound_dynamic_test_port() -> None:
  settings = lab_settings(
    environment="test",
    report_lab_test_db_port=60432,
    database_url=(
      "postgresql://aura_report_lab:local-password@"
      "127.0.0.1:60432/aura_report_lab"
    ),
  )

  assert settings.report_lab_test_db_port == 60432

  with pytest.raises(ValidationError):
    lab_settings(
      environment="test",
      report_lab_test_db_port=60432,
      database_url=(
        "postgresql://aura_report_lab:local-password@"
        "127.0.0.1:60433/aura_report_lab"
      ),
    )


def test_report_lab_test_port_is_forbidden_in_local_mode() -> None:
  with pytest.raises(ValidationError):
    lab_settings(report_lab_test_db_port=60432)


def test_report_lab_integer_limits_accept_environment_style_strings() -> None:
  settings = lab_settings(
    report_lab_max_runs_per_request="5",
    report_lab_session_budget_runs="50",
    report_lab_retention_days="7",
  )

  assert settings.report_lab_max_runs_per_request == 5
  assert settings.report_lab_session_budget_runs == 50
  assert settings.report_lab_retention_days == 7


def test_report_lab_admin_token_is_secret_in_settings_repr() -> None:
  settings = lab_settings(report_lab_raw_response_admin_token="do-not-print")

  assert "do-not-print" not in repr(settings)
