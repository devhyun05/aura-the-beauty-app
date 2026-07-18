import json
from pathlib import Path
import re

from app.core.settings import Settings


PROJECT_ROOT = Path(__file__).resolve().parents[3]


def test_seoul_makeup_model_defaults_use_global_inference_profiles() -> None:
  env_example = (PROJECT_ROOT / "services/backend/.env.example").read_text(encoding="utf-8")
  workflow = (PROJECT_ROOT / ".github/workflows/deploy-backend-ecs.yml").read_text(encoding="utf-8")

  expected = {
    "BEDROCK_SCENARIO_MODEL_ID": "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    "BEDROCK_QUESTION_MODEL_ID": "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    "BEDROCK_RECOMMENDATION_MODEL_ID": "global.anthropic.claude-sonnet-4-6",
  }

  for name, model_id in expected.items():
    assert f"{name}={model_id}" in env_example
    assert f"{name}: ${{{{ vars.{name} || '{model_id}' }}}}" in workflow
    assert f"{name}=${{{{ env.{name} }}}}" in workflow

  settings = Settings(bedrock_model_id="anthropic.claude-3-5-sonnet-20241022-v2:0")
  assert settings.effective_scenario_model_id == expected["BEDROCK_SCENARIO_MODEL_ID"]
  assert settings.effective_question_model_id == expected["BEDROCK_QUESTION_MODEL_ID"]
  assert settings.effective_recommendation_model_id == expected["BEDROCK_RECOMMENDATION_MODEL_ID"]


def test_makeup_journey_deploy_smoke_covers_every_public_route() -> None:
  workflow = (PROJECT_ROOT / ".github/workflows/deploy-backend-ecs.yml").read_text(
    encoding="utf-8",
  )

  for path in (
    "/api/makeup-journey/analytics/events",
    "/api/makeup-journey/settings",
    "/api/makeup-journey/calendar",
    "/api/makeup-journey/days/{entry_date}",
    "/api/makeup-journey/trends",
    "/api/makeup-journey/days/{entry_date}/note",
    "/api/makeup-journey/days/{entry_date}/missions/generate",
    "/api/makeup-journey/days/{entry_date}/missions",
    "/api/makeup-journey/missions/{mission_id}",
  ):
    assert f'.paths["{path}"]' in workflow


def test_makeup_journey_deploy_smoke_executes_runtime_auth_boundary() -> None:
  workflow = (PROJECT_ROOT / ".github/workflows/deploy-backend-ecs.yml").read_text(
    encoding="utf-8",
  )

  assert "verify_makeup_journey_auth_boundary()" in workflow
  assert '"$base_url/api/makeup-journey/settings?deployment=$GITHUB_SHA"' in workflow
  assert 'expected_status="401"' in workflow
  assert 'expected_code="UNAUTHORIZED"' in workflow
  assert 'expected_status="404"' in workflow
  assert 'expected_code="MAKEUP_JOURNEY_DISABLED"' in workflow
  assert "jq -e --arg code \"$expected_code\" '.error.code == $code'" in workflow
  assert "&& verify_makeup_journey_auth_boundary \\" in workflow
  assert "if: ${{ steps.smoke-api.outcome == 'failure' }}" in workflow


def test_makeup_journey_eas_profiles_keep_production_closed_by_default() -> None:
  eas = json.loads((PROJECT_ROOT / "apps/mobile/eas.json").read_text(encoding="utf-8"))

  assert eas["build"]["development"]["env"]["EXPO_PUBLIC_MAKEUP_JOURNEY_ENABLED"] == "1"
  assert eas["build"]["production"]["env"]["EXPO_PUBLIC_MAKEUP_JOURNEY_ENABLED"] == "0"
  rollout = eas["build"]["production-makeup-journey"]
  assert rollout["extends"] == "production"
  assert rollout["env"] == {
    "EXPO_PUBLIC_MAKEUP_JOURNEY_ENABLED": "1",
    "EXPO_PUBLIC_UNIFIED_FACE_CAPTURE": "1",
  }


def test_dev_deploy_enables_face_analysis_v2_for_api_and_worker() -> None:
  workflow = (PROJECT_ROOT / ".github/workflows/deploy-backend-ecs.yml").read_text(
    encoding="utf-8",
  )

  assert (
    "FACE_ANALYSIS_V2_ENABLED: ${{ vars.FACE_ANALYSIS_V2_ENABLED "
    "|| (github.ref_name == 'dev' && 'true') || 'false' }}"
  ) in workflow
  assert workflow.count("FACE_ANALYSIS_V2_ENABLED=${{ env.FACE_ANALYSIS_V2_ENABLED }}") == 2


def test_api_task_validation_allows_every_workflow_managed_environment_variable() -> None:
  workflow = (PROJECT_ROOT / ".github/workflows/deploy-backend-ecs.yml").read_text(
    encoding="utf-8",
  )
  render_block = workflow.split(
    "      - name: Render ECS task definition",
    maxsplit=1,
  )[1].split("      - name: Validate and register ECS task definition", maxsplit=1)[0]
  validation_block = workflow.split(
    "      - name: Validate and register ECS task definition",
    maxsplit=1,
  )[1].split("      - name: Apply and verify production database schema", maxsplit=1)[0]

  rendered_names = set(
    re.findall(
      r"^\s+([A-Z0-9_]+)=\$\{\{ env\.\1 \}\}$",
      render_block,
      flags=re.MULTILINE,
    ),
  )
  validation_names = set(
    re.findall(r'^\s+"([A-Z0-9_]+)",?$', validation_block, flags=re.MULTILINE),
  )

  assert rendered_names
  assert rendered_names <= validation_names


def test_backend_ci_is_a_path_scoped_pull_request_gate() -> None:
  workflow = (PROJECT_ROOT / ".github/workflows/backend-ci.yml").read_text(
    encoding="utf-8",
  )

  assert "pull_request:" in workflow
  assert "workflow_dispatch:" in workflow
  for branch in ("dev", "main"):
    assert f"      - {branch}\n" in workflow
  for path in (
    "services/backend/**",
    "docs/backend/**",
    "scripts/aws/**",
    "apps/mobile/eas.json",
    ".github/workflows/backend-ci.yml",
    ".github/workflows/deploy-backend-ecs.yml",
  ):
    assert f'      - "{path}"' in workflow


def test_makeup_journey_postgres_contract_runs_in_ci_with_an_isolated_database() -> None:
  deploy_workflow = (PROJECT_ROOT / ".github/workflows/deploy-backend-ecs.yml").read_text(
    encoding="utf-8",
  )
  backend_ci_workflow = (PROJECT_ROOT / ".github/workflows/backend-ci.yml").read_text(
    encoding="utf-8",
  )
  postgres_test = (
    PROJECT_ROOT / "services/backend/tests/test_makeup_journey_postgres.py"
  ).read_text(encoding="utf-8")

  assert deploy_workflow.count("image: pgvector/pgvector:pg16") == 2
  assert "image: postgres:16" not in deploy_workflow
  assert deploy_workflow.count(
    "AURA_TEST_DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/postgres",
  ) == 2
  assert backend_ci_workflow.count("image: pgvector/pgvector:pg16") == 1
  assert "image: postgres:16" not in backend_ci_workflow
  assert backend_ci_workflow.count(
    "AURA_TEST_DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/postgres",
  ) == 1
  assert 'os.getenv("AURA_TEST_DATABASE_URL")' in postgres_test
  assert 'create database "{database_name}"' in postgres_test
  assert 'drop database if exists "{database_name}"' in postgres_test
  assert "apply_schema(isolated_url)" in postgres_test
  assert "check_schema(isolated_url)" in postgres_test
