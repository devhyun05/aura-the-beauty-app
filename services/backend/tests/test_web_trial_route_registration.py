import ast
from pathlib import Path


def test_web_trial_face_analysis_routes_are_registered() -> None:
  router_path = Path(__file__).parents[1] / "app" / "api" / "router.py"
  module = ast.parse(router_path.read_text())
  imported_api_modules = {
    alias.name
    for node in ast.walk(module)
    if isinstance(node, ast.ImportFrom) and node.module == "app.api"
    for alias in node.names
  }
  included_routers = {
    ast.unparse(node.args[0])
    for node in ast.walk(module)
    if (
      isinstance(node, ast.Call)
      and isinstance(node.func, ast.Attribute)
      and node.func.attr == "include_router"
      and node.args
    )
  }

  assert "web_trial" in imported_api_modules
  assert "web_trial.router" in included_routers
