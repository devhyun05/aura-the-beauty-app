import argparse
import json
from typing import Any

from app.core.settings import Settings, get_settings


PROFILE_ITEMS = {
  "local": (
    "databaseUrl",
  ),
  "aws": (
    "authRequired",
    "databaseUrl",
    "cognitoUserPoolId",
    "cognitoAppClientId",
    "googleOauthClientId",
    "s3BucketName",
    "cdnBaseUrl",
    "openAIApiKey",
    "openAIAnalysisModelId",
    "openAIImageModelId",
    "aiJobExecutionMode",
    "sqsAiJobQueueUrl",
    "awsCredentialsOrRole",
  ),
  "all": (
    "authRequired",
    "databaseUrl",
    "cognitoUserPoolId",
    "cognitoAppClientId",
    "googleOauthClientId",
    "s3BucketName",
    "cdnBaseUrl",
    "openAIApiKey",
    "openAIAnalysisModelId",
    "openAIImageModelId",
    "aiJobExecutionMode",
    "sqsAiJobQueueUrl",
    "awsCredentialsOrRole",
  ),
}


def config_items(settings: Settings) -> dict[str, dict[str, Any]]:
  status = settings.public_config_status()
  items = dict(status["items"])
  items["authRequired"] = {
    "configured": settings.auth_required,
    "requiredWhen": "Deployed API should require Cognito JWT verification.",
  }

  return items


def build_setup_report(settings: Settings, profile: str = "local") -> dict[str, Any]:
  if profile not in PROFILE_ITEMS:
    raise ValueError(f"Unknown setup profile: {profile}")

  items = config_items(settings)
  selected = {
    name: items[name]
    for name in PROFILE_ITEMS[profile]
    if name in items
  }
  missing = [name for name, item in selected.items() if not item["configured"]]

  return {
    "ok": not missing,
    "profile": profile,
    "environment": settings.environment,
    "awsRegion": settings.aws_region,
    "items": selected,
    "missing": missing,
    "notes": profile_notes(profile),
  }


def profile_notes(profile: str) -> list[str]:
  notes = [
    "This command prints readiness flags only; it does not print secret values.",
    "Use docs/backend/SETUP_REQUIRED.md for where to create or find each value.",
  ]

  if profile == "local":
    notes.append("After DATABASE_URL or DATABASE_SECRET_ID is set, run init_db, seed_db, then check_schema.")
  elif profile == "aws":
    notes.append("For ECS, prefer AWS_USE_IAM_ROLE=true with an attached task role.")
    notes.append("Set EXPO_PUBLIC_API_BASE_URL in the mobile app after CloudFront is ready.")

  return notes


def format_report(report: dict[str, Any]) -> str:
  status = "ok" if report["ok"] else "needs values"
  lines = [
    f"Setup status: {status}",
    f"Profile: {report['profile']}",
    f"Environment: {report['environment']}",
    f"AWS region: {report['awsRegion']}",
  ]

  lines.append("Required values:")
  for name, item in report["items"].items():
    item_status = "configured" if item["configured"] else "missing"
    lines.append(f"- {name}: {item_status}")

    source = item.get("source")
    if source:
      lines.append(f"  source: {source}")

    lines.append(f"  needed: {item['requiredWhen']}")

  if report["missing"]:
    lines.append("Missing now:")
    lines.extend(f"- {name}" for name in report["missing"])

  lines.append("Notes:")
  lines.extend(f"- {note}" for note in report["notes"])

  return "\n".join(lines)


def main() -> None:
  parser = argparse.ArgumentParser(description="Print backend setup readiness without exposing secrets.")
  parser.add_argument(
    "--profile",
    choices=sorted(PROFILE_ITEMS),
    default="local",
    help="Setup scope to check.",
  )
  parser.add_argument("--json", action="store_true", help="Print the full report as JSON.")
  args = parser.parse_args()

  report = build_setup_report(get_settings(), profile=args.profile)

  if args.json:
    print(json.dumps(report, indent=2))
  else:
    print(format_report(report))

  if not report["ok"]:
    raise SystemExit(1)


if __name__ == "__main__":
  main()
