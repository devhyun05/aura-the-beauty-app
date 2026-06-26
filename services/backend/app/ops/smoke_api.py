import argparse
import json
from typing import Any

import httpx


CHECKS = (
  ("rootHealth", "/health"),
  ("apiHealth", "/api/health"),
  ("config", "/api/health/config"),
  ("database", "/api/health/db"),
)


def normalize_base_url(base_url: str) -> str:
  normalized = base_url.rstrip("/")

  if normalized.endswith("/api"):
    normalized = normalized[:-4]

  return normalized


def build_targets(base_url: str) -> list[tuple[str, str]]:
  root = normalize_base_url(base_url)

  return [(name, f"{root}{path}") for name, path in CHECKS]


def response_json(response: httpx.Response) -> dict[str, Any] | None:
  try:
    body = response.json()
  except ValueError:
    return None

  return body if isinstance(body, dict) else None


def evaluate_response(
  name: str,
  status_code: int,
  body: dict[str, Any] | None,
  require_db: bool,
) -> dict[str, Any]:
  ok = status_code == 200 and body is not None and body.get("error") is None
  message = "ok" if ok else "HTTP response did not match the API envelope."

  if ok and name == "database" and require_db:
    db_status = body.get("data", {}).get("status")
    ok = db_status == "ok"
    message = "ok" if ok else f"Database health is {db_status!r}, expected 'ok'."

  return {
    "name": name,
    "statusCode": status_code,
    "ok": ok,
    "message": message,
    "missingConfig": body.get("data", {}).get("missing", []) if name == "config" and body else [],
  }


def run_smoke_check(base_url: str, timeout: float = 5.0, require_db: bool = False) -> dict[str, Any]:
  results = []

  with httpx.Client(timeout=timeout) as client:
    for name, url in build_targets(base_url):
      try:
        response = client.get(url)
        result = evaluate_response(name, response.status_code, response_json(response), require_db)
      except httpx.HTTPError as exc:
        result = {
          "name": name,
          "statusCode": None,
          "ok": False,
          "message": f"{exc.__class__.__name__}: {exc}",
          "missingConfig": [],
        }

      result["url"] = url
      results.append(result)

  missing_config = []
  for result in results:
    if result["name"] == "config":
      missing_config = result["missingConfig"]

  return {
    "ok": all(result["ok"] for result in results),
    "baseUrl": normalize_base_url(base_url),
    "requireDb": require_db,
    "results": results,
    "missingConfig": missing_config,
  }


def format_report(report: dict[str, Any]) -> str:
  status = "ok" if report["ok"] else "failed"
  lines = [f"API smoke check: {status}", f"Base URL: {report['baseUrl']}"]

  for result in report["results"]:
    result_status = "ok" if result["ok"] else "failed"
    lines.append(f"- {result['name']}: {result_status} ({result['statusCode']}) {result['url']}")

    if not result["ok"]:
      lines.append(f"  {result['message']}")

  if report["missingConfig"]:
    lines.append("Missing config values:")
    lines.extend(f"- {name}" for name in report["missingConfig"])

  return "\n".join(lines)


def main() -> None:
  parser = argparse.ArgumentParser(description="Run backend API smoke checks.")
  parser.add_argument("--base-url", required=True, help="Service root URL or API base URL.")
  parser.add_argument("--timeout", type=float, default=5.0, help="HTTP timeout in seconds.")
  parser.add_argument("--require-db", action="store_true", help="Require /api/health/db to report status=ok.")
  parser.add_argument("--json", action="store_true", help="Print the full report as JSON.")
  args = parser.parse_args()

  report = run_smoke_check(args.base_url, timeout=args.timeout, require_db=args.require_db)

  if args.json:
    print(json.dumps(report, indent=2))
  else:
    print(format_report(report))

  if not report["ok"]:
    raise SystemExit(1)


if __name__ == "__main__":
  main()
