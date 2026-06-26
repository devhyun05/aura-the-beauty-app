import argparse
import json
from pathlib import Path
from typing import Any

from app.main import create_app


DEFAULT_OUTPUT = Path("docs/backend/openapi.json")


def build_openapi_schema() -> dict[str, Any]:
  app = create_app()

  return app.openapi()


def write_openapi_schema(output_path: Path, schema: dict[str, Any] | None = None) -> Path:
  payload = schema or build_openapi_schema()
  output_path.parent.mkdir(parents=True, exist_ok=True)
  output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

  return output_path


def main() -> None:
  parser = argparse.ArgumentParser(description="Export the backend OpenAPI schema to a JSON file.")
  parser.add_argument(
    "--output",
    type=Path,
    default=DEFAULT_OUTPUT,
    help="Output JSON file path. Defaults to docs/backend/openapi.json.",
  )
  args = parser.parse_args()

  output = write_openapi_schema(args.output)
  print(f"Exported OpenAPI schema to {output}")


if __name__ == "__main__":
  main()
