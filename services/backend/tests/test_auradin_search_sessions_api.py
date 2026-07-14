import pytest
from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app
from app.services.auradin_agent.session_manager import clear_sessions


@pytest.mark.parametrize(
  ("outcome", "expected_status", "expected_code"),
  [
    ("duplicate", 200, None),
    ("expired", 410, "SESSION_EXPIRED"),
    ("conflict", 409, "ANSWER_CONFLICT"),
    ("stale_question", 409, "STALE_QUESTION"),
    ("invalid_option", 422, "INVALID_OPTION"),
    ("session_not_answerable", 409, "SESSION_NOT_ANSWERABLE"),
  ],
)
def test_answer_outcomes_have_stable_http_contract(
  monkeypatch: pytest.MonkeyPatch,
  outcome: str,
  expected_status: int,
  expected_code: str | None,
) -> None:
  """서비스 판정과 HTTP 상태를 분리해 모바일의 복구 분기가 흔들리지 않게 고정한다."""
  from app.api import search_sessions as route

  async def fake_answer(*_args, **_kwargs):
    return outcome, {"sessionId": "contract-session", "phase": "question"}

  monkeypatch.setattr(route, "answer_session_persisted", fake_answer)
  client = TestClient(create_app(Settings(database_url=None)))
  response = client.post(
    "/api/search/sessions/contract-session/answer",
    json={"questionId": "q-1", "optionId": "o-1"},
  )

  assert response.status_code == expected_status
  if expected_code is None:
    assert response.json()["error"] is None
    assert response.json()["data"]["phase"] == "searching"
  else:
    assert response.json()["error"]["code"] == expected_code


@pytest.mark.parametrize(
  ("error_name", "expected_status", "expected_code"),
  [
    ("reuse", 409, "IDEMPOTENCY_KEY_REUSED"),
    ("expired", 410, "SESSION_EXPIRED"),
  ],
)
def test_create_idempotency_errors_have_stable_http_contract(
  monkeypatch: pytest.MonkeyPatch,
  error_name: str,
  expected_status: int,
  expected_code: str,
) -> None:
  from app.api import search_sessions as route
  from app.services.auradin_agent.session_manager import (
    IdempotencyKeyReuseError,
    IdempotentSessionExpiredError,
  )

  async def fake_create(**_kwargs):
    if error_name == "reuse":
      raise IdempotencyKeyReuseError
    raise IdempotentSessionExpiredError

  monkeypatch.setattr(route, "create_session_persisted", fake_create)
  client = TestClient(create_app(Settings(database_url=None)))
  response = client.post(
    "/api/search/sessions",
    json={
      "prompt": "립 추천",
      "clientRequestId": "13fd041b-8e2f-4d03-a97d-fb95ecdbfe91",
    },
  )

  assert response.status_code == expected_status
  assert response.json()["error"]["code"] == expected_code


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


def test_question_answer_applied_filter_chips_use_option_labels() -> None:
  """질문 답변으로 생긴 칩은 선택지 한국어 라벨을 써야 한다 — 'priceTier: under_15k' 같은 원시 노출 금지."""
  clear_sessions()
  client = TestClient(create_app(Settings(database_url=None)))

  created = client.post("/api/search/sessions", json={"prompt": "립 추천해줘"})
  session_id = created.json()["data"]["sessionId"]
  turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]

  answered_labels: list[str] = []
  for _ in range(3):
    if turn["phase"] != "question":
      break
    question = turn["question"]
    option = next(
      option for option in question["options"] if option["filterDelta"]["op"] != "noop"
    )
    answered_labels.append(option["label"])
    client.post(
      f"/api/search/sessions/{session_id}/answer",
      json={"questionId": question["id"], "optionId": option["id"]},
    )
    turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]

  assert answered_labels, "질문이 하나도 안 나오면 이 테스트는 시나리오를 못 덮는다"
  chip_labels = [chip["label"] for chip in turn["appliedFilters"]]
  for label in answered_labels:
    assert label in chip_labels
  for chip in chip_labels:
    assert not chip.split(":")[0].strip().isascii() or ":" not in chip, (
      f"원시 attribute 라벨이 칩에 노출됨: {chip!r}"
    )


def test_cancel_session_marks_cancelled_and_rejects_further_actions() -> None:
  """사용자가 검색 도중 이탈 → cancel이 세션을 종료하고 이후 answer/refine을 조용히 무시한다."""
  clear_sessions()
  client = TestClient(create_app(Settings(database_url=None)))

  created = client.post("/api/search/sessions", json={"prompt": "립 추천해줘"})
  session_id = created.json()["data"]["sessionId"]
  question = client.get(f"/api/search/sessions/{session_id}").json()["data"]["question"]

  cancelled = client.post(f"/api/search/sessions/{session_id}/cancel")
  assert cancelled.status_code == 200
  assert cancelled.json()["data"]["phase"] == "cancelled"
  # cancel 재전송도 멱등 200이며 새 mutation/version 증가를 만들지 않는다.
  duplicate_cancel = client.post(f"/api/search/sessions/{session_id}/cancel")
  assert duplicate_cancel.status_code == 200
  assert duplicate_cancel.json()["data"]["phase"] == "cancelled"

  turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]
  assert turn["phase"] == "cancelled"
  assert turn["error"]["code"] == "cancelled"
  assert turn["error"]["recoverable"] is True

  # 취소 후 늦게 도착한 답변은 상태를 되살리지 않는다 (조용히 무시).
  option = next(o for o in question["options"] if o["filterDelta"]["op"] != "noop")
  client.post(
    f"/api/search/sessions/{session_id}/answer",
    json={"questionId": question["id"], "optionId": option["id"]},
  )
  assert client.get(f"/api/search/sessions/{session_id}").json()["data"]["phase"] == "cancelled"

  # 존재하지 않는 세션 취소 → 404.
  assert client.post("/api/search/sessions/does-not-exist/cancel").status_code == 404


def test_search_session_api_reports_unsupported_category() -> None:
  clear_sessions()
  client = TestClient(create_app(Settings(database_url=None)))

  # base/brow/liner은 서빙 대상으로 열렸다 — 향수/네일/스킨케어/헤어만 범위 밖.
  created = client.post("/api/search/sessions", json={"prompt": "향수 추천해줘"})
  session_id = created.json()["data"]["sessionId"]
  turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]

  assert turn["phase"] == "failed"
  assert turn["error"]["code"] == "unsupported_category"
  assert turn["error"]["recoverable"] is True
