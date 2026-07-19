"""Regression coverage for verified product enrichment on V2 refinements."""

import json
from copy import deepcopy
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.api import makeup_recommendations as makeup_api
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings
from app.db.session import require_database
from app.main import create_app
from app.services import makeup_recommendation as makeup_service


USER_ID = UUID("11111111-1111-1111-1111-111111111111")
REPORT_ID = UUID("66666666-6666-6666-6666-666666666666")
REFINED_REPORT_ID = UUID("77777777-7777-7777-7777-777777777777")


def _auth_context() -> AuthContext:
  return AuthContext(
    subject="refine-product-user",
    provider="cognito",
    email="refine-products@example.com",
    name="Refine Product User",
    claims={"sub": "refine-product-user"},
  )


def _questions() -> list[dict]:
  return [
    {
      "id": "change_level",
      "title": "How much change?",
      "options": [
        {"id": "balanced", "label": "Balanced change"},
        {"id": "bold", "label": "Bold change"},
        {"id": "familiar", "label": "Familiar change"},
        {"id": "ai_pick", "label": "AI pick"},
      ],
    },
    {
      "id": "finish",
      "title": "Preferred finish?",
      "options": [
        {"id": "glow", "label": "Glow finish"},
        {"id": "matte", "label": "Matte finish"},
        {"id": "satin", "label": "Satin finish"},
        {"id": "ai_pick", "label": "AI pick"},
      ],
    },
  ]


def _answers() -> list[dict]:
  return [
    {
      "questionId": "change_level",
      "optionId": "balanced",
      "label": "Balanced change",
    },
    {
      "questionId": "finish",
      "optionId": "glow",
      "optionLabel": "Glow finish",
    },
  ]


def _context() -> dict:
  return {
    "selection": {
      "situation": {"key": "interview", "label": "Interview"},
      "keyword": {"label": "Trustworthy", "tags": ["clean"]},
    },
    "analysisReport": {
      "personalColor": "Warm spring",
      "skinType": "combination",
      "baseMakeupGuide": "retired advice",
      "recommendedMood": "retired mood",
      "detail": {
        "makeupGuideline": {"base": "retired detail"},
        "faceShape": "oval",
      },
    },
  }


def _recommendation(marker: str, *, old_products: bool) -> dict:
  recommendation = makeup_service.deterministic_recommendation_v2(
    _context(),
    _answers(),
    _questions(),
  )
  recommendation["generationSource"] = "claude"
  for look in recommendation["looks"]:
    look["summary"] = f"{marker} summary"
    for guide in look["areaGuides"]:
      guide["goal"] = f"{marker}-{guide['area']}-goal"
      guide["products"] = (
        [{"id": f"old-{guide['area']}", "productName": f"old-{guide['area']}"}]
        if old_products
        else []
      )
    look["products"] = [
      product
      for guide in look["areaGuides"]
      for product in guide["products"]
    ]
  return recommendation


class _RefineDatabase:
  def __init__(self, previous: dict, questions: list[dict], answers: list[dict]) -> None:
    self.previous = previous
    self.questions = questions
    self.answers = answers
    self.insert_args: tuple | None = None
    self.executed: list[tuple[str, tuple]] = []

  async def fetchrow(self, query: str, *args):
    if "from makeup_recommendation_reports" in query:
      assert args == (REPORT_ID, USER_ID)
      return {
        "id": REPORT_ID,
        "scenario_text": "Interview",
        "scenario_tags": ["interview"],
        "questions": self.questions,
        "answers": self.answers,
        "recommendation": self.previous,
        "source_analysis_report_id": None,
        "situation_id": None,
        "keyword_id": None,
        "context_snapshot": _context(),
        "schema_version": "makeup-recommendation-v2",
        "image_mode": "generic",
      }
    if "insert into makeup_recommendation_reports" in query:
      self.insert_args = args
      return {"id": REFINED_REPORT_ID}
    raise AssertionError(query)

  async def execute(self, query: str, *args):
    self.executed.append((query, args))
    return "INSERT 0 3"


def _catalog_product(area: str) -> dict:
  return {
    "id": f"catalog-{area}",
    "area": area,
    "brandName": "Verified Brand",
    "productName": f"verified-{area}",
    "shadeName": None,
    "reason": "Verified recipe match",
    "price": 20000,
    "imageUrl": f"https://images.example.com/{area}.webp",
    "purchaseUrl": f"https://shop.example.com/{area}",
    "matchRate": 91,
  }


@pytest.mark.parametrize(
  ("refinement", "expected_goal_prefix"),
  [
    ("natural", "generated"),
    ("replaceProducts", "previous"),
  ],
)
def test_v2_refinement_reenriches_verified_products_after_contract(
  monkeypatch: pytest.MonkeyPatch,
  refinement: str,
  expected_goal_prefix: str,
) -> None:
  questions = _questions()
  answers = _answers()
  previous = _recommendation("previous", old_products=True)
  generated = _recommendation("generated", old_products=False)
  db = _RefineDatabase(previous, questions, answers)
  captured: dict = {}

  async def fake_ensure_user(_db, _auth):
    return {"id": USER_ID}

  async def fake_generate(*_args, **_kwargs):
    return deepcopy(generated)

  async def fake_enrich(
    _db,
    _settings,
    recommendation,
    context_snapshot,
    persisted_answers,
    persisted_questions,
  ):
    captured["context"] = deepcopy(context_snapshot)
    captured["answers"] = deepcopy(persisted_answers)
    captured["questions"] = deepcopy(persisted_questions)
    captured["goals"] = [
      guide["goal"]
      for look in recommendation["looks"]
      for guide in look["areaGuides"]
    ]
    enriched = deepcopy(recommendation)
    for look in enriched["looks"]:
      for guide in look["areaGuides"]:
        guide["products"] = [_catalog_product(guide["area"])]
      look["products"] = [
        product
        for guide in look["areaGuides"]
        for product in guide["products"]
      ]
    return enriched

  async def fake_dispatch(**_kwargs):
    return "pending"

  monkeypatch.setattr(makeup_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(makeup_api, "generate_recommendation_v2", fake_generate)
  monkeypatch.setattr(makeup_api, "enrich_makeup_recommendation_products", fake_enrich)
  monkeypatch.setattr(makeup_api, "dispatch_recommendation_image_job", fake_dispatch)

  app = create_app(Settings(database_url=None))
  app.dependency_overrides[get_current_user] = _auth_context
  app.dependency_overrides[require_database] = lambda: db
  response = TestClient(app).post(
    f"/api/makeup-recommendations/{REPORT_ID}/refine",
    json={"refinement": refinement},
  )

  assert response.status_code == 200
  recommendation = response.json()["data"]["recommendation"]
  assert all(
    guide["products"][0]["productName"] == f"verified-{guide['area']}"
    for look in recommendation["looks"]
    for guide in look["areaGuides"]
  )
  assert all(goal.startswith(expected_goal_prefix) for goal in captured["goals"])
  assert captured["questions"] == questions
  assert captured["answers"][:2] == answers
  assert captured["answers"][-1]["refinement"] == refinement
  assert captured["answers"][0]["label"] == "Balanced change"
  assert captured["answers"][1]["optionLabel"] == "Glow finish"
  assert "baseMakeupGuide" not in captured["context"]["analysisReport"]
  assert "recommendedMood" not in captured["context"]["analysisReport"]
  assert "makeupGuideline" not in captured["context"]["analysisReport"]["detail"]
  assert recommendation["generationSource"] == "claude"
  assert all("lookMap" in look and "fitAssessment" in look for look in recommendation["looks"])

  assert db.insert_args is not None
  saved_answers = json.loads(db.insert_args[4])
  saved_recommendation = json.loads(db.insert_args[5])
  saved_context = json.loads(db.insert_args[16])
  assert saved_answers == captured["answers"]
  assert saved_recommendation["generationSource"] == "claude"
  assert all(
    guide["products"][0]["id"] == f"catalog-{guide['area']}"
    for look in saved_recommendation["looks"]
    for guide in look["areaGuides"]
  )
  assert saved_context == captured["context"]
