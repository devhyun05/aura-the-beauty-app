import json

from app.ops.export_openapi import build_openapi_schema, write_openapi_schema


def test_build_openapi_schema_contains_core_backend_paths() -> None:
  schema = build_openapi_schema()

  assert schema["info"]["title"] == "AI AR Makeup Backend"
  assert "/health" in schema["paths"]
  assert "/api/health/config" in schema["paths"]
  assert "/api/media/presigned-upload" in schema["paths"]
  assert "/api/analysis/jobs" in schema["paths"]


def test_write_openapi_schema_outputs_json_file(tmp_path) -> None:
  output = tmp_path / "openapi.json"

  result = write_openapi_schema(output, {"openapi": "3.1.0", "info": {"title": "test"}})

  assert result == output
  assert json.loads(output.read_text(encoding="utf-8"))["info"]["title"] == "test"
