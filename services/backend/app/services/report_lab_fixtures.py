from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Any

from app.core.errors import AppError
from app.core.settings import BACKEND_ROOT, Settings


DEFAULT_REPORT_LAB_FIXTURE_ID = "synthetic-balanced-v1"
REPORT_LAB_SYNTHETIC_SCOPE = "numeric-free-json-only"
DEFAULT_REPORT_LAB_FIXTURE_ROOT = BACKEND_ROOT / "app" / "lab_fixtures" / "face-report"
REPORT_VIEW_FIXTURE_ROOT = (
  BACKEND_ROOT.parents[1] / "packages" / "face-report-contract" / "fixtures"
).resolve()
REPORT_VIEW_FIXTURES = {
  "synthetic-summer-muted-v1": (
    "synthetic-summer-muted-v1.json",
    "8a0886474cc3a167480a12abe67fd16c3e7e121c498dec88c9f5742a59c31320",
  ),
}
MAX_FIXTURE_BYTES = 2 * 1024 * 1024


@dataclass(frozen=True)
class ReportLabFixture:
  fixture_id: str
  schema_version: str
  provenance: dict[str, Any]
  request_payload: dict[str, Any]
  stage_outputs: dict[str, dict[str, Any]]
  report_view: dict[str, Any]
  report_view_sha256: str


def report_lab_fixture_root(settings: Settings) -> Path:
  configured = (settings.report_lab_fixture_root or "").strip()
  return Path(configured).expanduser().resolve() if configured else DEFAULT_REPORT_LAB_FIXTURE_ROOT.resolve()


def _json_object(path: Path, *, max_bytes: int = MAX_FIXTURE_BYTES) -> dict[str, Any]:
  try:
    if path.stat().st_size > max_bytes:
      raise AppError(422, "REPORT_LAB_FIXTURE_TOO_LARGE", "Report Lab fixture is too large.")
    payload = json.loads(path.read_text(encoding="utf-8"))
  except AppError:
    raise
  except (OSError, json.JSONDecodeError) as exc:
    raise AppError(422, "REPORT_LAB_FIXTURE_INVALID", "Report Lab fixture JSON is invalid.") from exc
  if not isinstance(payload, dict):
    raise AppError(422, "REPORT_LAB_FIXTURE_INVALID", "Report Lab fixture must be a JSON object.")
  return payload


def _safe_child(root: Path, value: object, *, field: str) -> Path:
  raw = str(value or "").strip()
  relative = Path(raw)
  if not raw or relative.is_absolute() or ".." in relative.parts:
    raise AppError(422, "REPORT_LAB_FIXTURE_PATH_INVALID", f"{field} must be an allowlisted relative path.")
  resolved = (root / relative).resolve()
  try:
    resolved.relative_to(root.resolve())
  except ValueError as exc:
    raise AppError(422, "REPORT_LAB_FIXTURE_PATH_INVALID", f"{field} escapes the fixture root.") from exc
  return resolved


def _load_report_view_fixture(fixture_id: object) -> tuple[dict[str, Any], str]:
  allowlisted = REPORT_VIEW_FIXTURES.get(str(fixture_id or ""))
  if allowlisted is None:
    raise AppError(
      422,
      "REPORT_LAB_REPORT_VIEW_INVALID",
      "Report view fixture is not allowlisted.",
    )
  filename, expected_sha256 = allowlisted
  path = (REPORT_VIEW_FIXTURE_ROOT / filename).resolve()
  if path.parent != REPORT_VIEW_FIXTURE_ROOT:
    raise AppError(422, "REPORT_LAB_REPORT_VIEW_INVALID", "Report view fixture path is invalid.")
  try:
    payload_bytes = path.read_bytes()
  except OSError as exc:
    raise AppError(422, "REPORT_LAB_REPORT_VIEW_INVALID", "Report view fixture is missing.") from exc
  digest = hashlib.sha256(payload_bytes).hexdigest()
  if digest != expected_sha256:
    raise AppError(
      422,
      "REPORT_LAB_REPORT_VIEW_INVALID",
      "Report view fixture integrity check failed.",
    )
  try:
    payload = json.loads(payload_bytes)
  except json.JSONDecodeError as exc:
    raise AppError(422, "REPORT_LAB_REPORT_VIEW_INVALID", "Report view fixture JSON is invalid.") from exc
  if not isinstance(payload, dict) or payload.get("schemaVersion") != "aura-face-report-view-v1":
    raise AppError(422, "REPORT_LAB_REPORT_VIEW_INVALID", "Report view schema is unsupported.")
  return payload, digest


def _catalog_rows(settings: Settings) -> tuple[Path, list[dict[str, Any]]]:
  root = report_lab_fixture_root(settings)
  catalog = _json_object(root / "catalog.json")
  if catalog.get("schemaVersion") != "aura-report-lab-fixture-catalog-v1":
    raise AppError(422, "REPORT_LAB_FIXTURE_CATALOG_INVALID", "Unsupported Report Lab fixture catalog.")
  rows = catalog.get("fixtures")
  if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
    raise AppError(422, "REPORT_LAB_FIXTURE_CATALOG_INVALID", "Report Lab fixture catalog rows are invalid.")
  return root, rows


def list_report_lab_fixtures(settings: Settings) -> list[dict[str, Any]]:
  _, rows = _catalog_rows(settings)
  result: list[dict[str, Any]] = []
  for row in rows:
    fixture_id = str(row.get("fixtureId") or "").strip()
    if not fixture_id:
      continue
    result.append(
      {
        "fixtureId": fixture_id,
        "label": str(row.get("label") or fixture_id),
        "synthetic": row.get("synthetic") is True,
        "syntheticScope": str(row.get("syntheticScope") or ""),
        "provenance": row.get("provenance") if isinstance(row.get("provenance"), dict) else {},
      },
    )
  return result


def load_report_lab_fixture(settings: Settings, fixture_id: str) -> ReportLabFixture:
  root, rows = _catalog_rows(settings)
  row = next((item for item in rows if item.get("fixtureId") == fixture_id), None)
  if row is None:
    raise AppError(404, "REPORT_LAB_FIXTURE_NOT_FOUND", "Report Lab fixture was not found.")
  if (
    row.get("synthetic") is not True
    or row.get("syntheticScope") != REPORT_LAB_SYNTHETIC_SCOPE
  ):
    raise AppError(
      403,
      "REPORT_LAB_FIXTURE_NOT_SYNTHETIC",
      "Only approved deterministic JSON fixtures are enabled.",
    )

  fixture_path = _safe_child(root, row.get("file"), field="fixture.file")
  payload = _json_object(fixture_path)
  if (
    payload.get("fixtureId") != fixture_id
    or payload.get("synthetic") is not True
    or payload.get("syntheticScope") != REPORT_LAB_SYNTHETIC_SCOPE
  ):
    raise AppError(422, "REPORT_LAB_FIXTURE_INVALID", "Fixture identity or synthetic provenance is invalid.")
  if payload.get("schemaVersion") != "aura-report-lab-fixture-v1":
    raise AppError(422, "REPORT_LAB_FIXTURE_INVALID", "Unsupported Report Lab fixture schema.")
  provenance = payload.get("provenance")
  if (
    not isinstance(provenance, dict)
    or provenance.get("imageState") != "omitted-no-approved-provenance"
  ):
    raise AppError(
      422,
      "REPORT_LAB_FIXTURE_IMAGE_FORBIDDEN",
      "Current Report Lab fixtures must declare the approved no-image state.",
    )

  outputs = payload.get("stageOutputs")
  if not isinstance(outputs, dict) or any(not isinstance(value, dict) for value in outputs.values()):
    raise AppError(422, "REPORT_LAB_FIXTURE_INVALID", "Fixture stageOutputs must be JSON objects.")
  request_payload = payload.get("requestPayload")
  if not isinstance(request_payload, dict):
    raise AppError(422, "REPORT_LAB_FIXTURE_INVALID", "Fixture requestPayload must be a JSON object.")
  report_view, report_view_sha256 = _load_report_view_fixture(
    payload.get("reportViewFixtureId"),
  )

  if "imageFile" in payload:
    raise AppError(
      422,
      "REPORT_LAB_FIXTURE_IMAGE_FORBIDDEN",
      "Current Report Lab fixtures are JSON-only and cannot reference image files.",
    )

  return ReportLabFixture(
    fixture_id=fixture_id,
    schema_version=str(payload["schemaVersion"]),
    provenance=provenance,
    request_payload=request_payload,
    stage_outputs=outputs,
    report_view=report_view,
    report_view_sha256=report_view_sha256,
  )
