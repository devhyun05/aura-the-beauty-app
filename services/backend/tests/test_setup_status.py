from app.core.settings import Settings
from app.ops.setup_status import build_setup_report, format_report


def test_local_setup_status_requires_database_url() -> None:
  report = build_setup_report(Settings(), profile="local")

  assert report["ok"] is False
  assert report["missing"] == ["databaseUrl"]


def test_local_setup_status_passes_with_database_url() -> None:
  report = build_setup_report(
    Settings(database_url="postgresql://user:pass@localhost:5432/app"),
    profile="local",
  )

  assert report["ok"] is True
  assert report["missing"] == []


def test_aws_setup_status_requires_deployment_values() -> None:
  report = build_setup_report(
    Settings(database_url="postgresql://user:pass@db:5432/app"),
    profile="aws",
  )

  assert report["ok"] is False
  assert "authRequired" in report["missing"]
  assert "cognitoUserPoolId" in report["missing"]
  assert "awsCredentialsOrRole" in report["missing"]


def test_aws_setup_status_accepts_iam_role_and_cloudfront_domain() -> None:
  report = build_setup_report(
    Settings(
      auth_required=True,
      database_url="postgresql://user:pass@db:5432/app",
      cognito_user_pool_id="ap-northeast-2_example",
      cognito_app_client_id="client-id",
      google_oauth_client_id="google-client-id.apps.googleusercontent.com",
      s3_bucket_name="aura-media",
      cloudfront_domain="d123.cloudfront.net",
      bedrock_model_id="anthropic.example",
      aws_use_iam_role=True,
    ),
    profile="aws",
  )

  assert report["ok"] is True
  assert report["missing"] == []
  assert report["items"]["awsCredentialsOrRole"]["source"] == "iam_role"


def test_format_report_does_not_print_secret_values() -> None:
  report = build_setup_report(
    Settings(database_url="postgresql://secret-user:secret-pass@localhost:5432/app"),
    profile="local",
  )

  rendered = format_report(report)

  assert "Setup status: ok" in rendered
  assert "postgresql://" not in rendered
  assert "secret-pass" not in rendered
