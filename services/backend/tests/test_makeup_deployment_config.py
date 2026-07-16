from pathlib import Path

from app.core.settings import Settings


PROJECT_ROOT = Path(__file__).resolve().parents[3]


def test_seoul_makeup_model_defaults_use_global_inference_profiles() -> None:
  env_example = (PROJECT_ROOT / "services/backend/.env.example").read_text()
  workflow = (PROJECT_ROOT / ".github/workflows/deploy-backend-ecs.yml").read_text()

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
