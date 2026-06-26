from app.ops.smoke_api import build_targets, evaluate_response, format_report, normalize_base_url


def test_normalize_base_url_accepts_service_root_or_api_base() -> None:
  assert normalize_base_url("https://api.example.com/") == "https://api.example.com"
  assert normalize_base_url("https://api.example.com/api") == "https://api.example.com"


def test_build_targets_checks_root_and_api_health_paths() -> None:
  targets = dict(build_targets("http://localhost:8000/api"))

  assert targets["rootHealth"] == "http://localhost:8000/health"
  assert targets["apiHealth"] == "http://localhost:8000/api/health"
  assert targets["config"] == "http://localhost:8000/api/health/config"
  assert targets["database"] == "http://localhost:8000/api/health/db"


def test_evaluate_database_health_can_require_db_ok() -> None:
  body = {"data": {"status": "not_configured"}, "meta": {}, "error": None}

  relaxed = evaluate_response("database", 200, body, require_db=False)
  strict = evaluate_response("database", 200, body, require_db=True)

  assert relaxed["ok"] is True
  assert strict["ok"] is False
  assert "not_configured" in strict["message"]


def test_evaluate_config_collects_missing_values_without_secrets() -> None:
  body = {
    "data": {"missing": ["databaseUrl", "s3BucketName"]},
    "meta": {},
    "error": None,
  }

  result = evaluate_response("config", 200, body, require_db=False)

  assert result["ok"] is True
  assert result["missingConfig"] == ["databaseUrl", "s3BucketName"]


def test_format_report_lists_missing_config() -> None:
  report = {
    "ok": True,
    "baseUrl": "http://localhost:8000",
    "requireDb": False,
    "missingConfig": ["databaseUrl"],
    "results": [
      {
        "name": "config",
        "statusCode": 200,
        "ok": True,
        "message": "ok",
        "url": "http://localhost:8000/api/health/config",
      },
    ],
  }

  rendered = format_report(report)

  assert "API smoke check: ok" in rendered
  assert "- databaseUrl" in rendered
