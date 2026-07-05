from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app
from app.services.auradin_agent.session_manager import clear_sessions


def test_search_session_api_returns_question_then_results() -> None:
  clear_sessions()
  client = TestClient(create_app(Settings(database_url=None)))

  created = client.post(
    "/api/search/sessions",
    json={"prompt": "쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하"},
  )
  assert created.status_code == 200
  session_id = created.json()["data"]["sessionId"]

  turn_response = client.get(f"/api/search/sessions/{session_id}")
  assert turn_response.status_code == 200
  turn = turn_response.json()["data"]
  assert turn["phase"] == "question"
  assert turn["question"]["options"][0]["filterDelta"]["attribute"]
  assert "expectedCandidateCount" in turn["question"]["options"][0]

  for _ in range(3):
    if turn["phase"] != "question":
      break
    question = turn["question"]
    option = next(
      option for option in question["options"] if option["filterDelta"]["op"] != "noop"
    )
    answer = client.post(
      f"/api/search/sessions/{session_id}/answer",
      json={"questionId": question["id"], "optionId": option["id"]},
    )
    assert answer.status_code == 200
    turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]

  assert turn["phase"] == "results"
  assert turn["result"]["products"]
  for product in turn["result"]["products"]:
    assert product["imageUrl"]
    assert product["purchaseUrl"]
    assert product["priceKrw"] > 0


def test_search_session_api_reports_unsupported_category() -> None:
  clear_sessions()
  client = TestClient(create_app(Settings(database_url=None)))

  created = client.post("/api/search/sessions", json={"prompt": "브로우 추천해줘"})
  session_id = created.json()["data"]["sessionId"]
  turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]

  assert turn["phase"] == "failed"
  assert turn["error"]["code"] == "unsupported_category"
  assert turn["error"]["recoverable"] is True
