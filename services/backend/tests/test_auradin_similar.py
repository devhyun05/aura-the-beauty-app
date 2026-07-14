"""B6 §10.3-2 similar 계약 — rankedCache 내 λ=0.9 재랭킹(재검색 0), phase 가드(results에서만),
의향 3종(색 유지/더 저렴/다른 브랜드) 반영, 세션 λ 불변, 후보 0은 이전 결과 유지."""

from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app
from app.services.auradin_agent.session_manager import clear_sessions


def _client(**settings_overrides) -> TestClient:
  clear_sessions()
  # refine 테스트와 동일 픽스처: '글리터'는 기본 θ에선 질문을 타므로 즉답 종료를 강제(θ=0)해
  # 결과 세션을 확보한다. 질문 phase가 필요한 테스트는 이 override 없이 만든다.
  settings_overrides.setdefault("auradin_score_gap_threshold", 0.0)
  return TestClient(create_app(Settings(database_url=None, **settings_overrides)))


def _question_client() -> TestClient:
  clear_sessions()
  return TestClient(create_app(Settings(database_url=None)))


def _create(client: TestClient, prompt: str) -> str:
  created = client.post("/api/search/sessions", json={"prompt": prompt})
  assert created.status_code == 200
  return created.json()["data"]["sessionId"]


def _turn(client: TestClient, session_id: str) -> dict:
  return client.get(f"/api/search/sessions/{session_id}").json()["data"]


def _similar_log(turn: dict) -> dict:
  entries = [log["similar"] for log in turn.get("logs", []) if log.get("similar")]
  assert entries, "similar log entry must exist"
  return entries[-1]


def test_similar_reranks_cache_at_fixed_lambda_without_research() -> None:
  """similar는 기준 제품 시그니처 부스트로 캐시를 λ=0.9 재랭킹한다 — 재검색 0 (§10.3-2)."""
  client = _client()
  session_id = _create(client, "글리터 추천해줘")
  before = _turn(client, session_id)
  assert before["phase"] == "results"
  base = before["result"]["products"][0]

  response = client.post(
    f"/api/search/sessions/{session_id}/similar", json={"productId": base["id"]},
  )
  assert response.status_code == 200
  ack = response.json()["data"]
  assert ack["phase"] == "searching"  # refine과 같은 ack/poll 계약

  turn = _turn(client, session_id)
  assert turn["phase"] == "results"
  log = _similar_log(turn)
  assert log["usedCache"] is True  # rankedCache 재랭킹 — 재검색 없음
  assert log["lambda"] == 0.9
  assert log["productId"] == base["id"]

  products = turn["result"]["products"]
  assert products, "similar must serve products"
  assert all(p["id"] != base["id"] for p in products)  # 기준 제품 자신은 제외
  assert "비슷한" in turn["result"]["headerLabel"]


def test_similar_rejected_outside_results_phase() -> None:
  """M1 phase 계약: question 단계 similar는 409 거절 — 상태 비파괴 (F13 가드와 동일)."""
  client = _question_client()
  session_id = _create(client, "글리터 추천해줘")
  before = _turn(client, session_id)
  assert before["phase"] == "question"

  response = client.post(
    f"/api/search/sessions/{session_id}/similar", json={"productId": "anything"},
  )
  assert response.status_code == 409
  assert response.json()["error"]["code"] == "SESSION_NOT_SIMILARABLE"

  turn = _turn(client, session_id)
  assert turn["phase"] == "question"  # 거절은 상태를 바꾸지 않는다
  assert turn["question"] == before["question"]


def test_similar_unknown_product_is_rejected_without_mutation() -> None:
  """카탈로그 밖 제품(예: 라이브 발견 픽)은 422 — 세션 결과는 그대로."""
  client = _client()
  session_id = _create(client, "글리터 추천해줘")
  before_ids = [p["id"] for p in _turn(client, session_id)["result"]["products"]]

  response = client.post(
    f"/api/search/sessions/{session_id}/similar", json={"productId": "no-such-product"},
  )
  assert response.status_code == 422
  assert response.json()["error"]["code"] == "UNKNOWN_PRODUCT"

  turn = _turn(client, session_id)
  assert [p["id"] for p in turn["result"]["products"]] == before_ids


def test_similar_requires_product_and_valid_intent() -> None:
  client = _client()
  session_id = _create(client, "글리터 추천해줘")
  base_id = _turn(client, session_id)["result"]["products"][0]["id"]

  assert (
    client.post(f"/api/search/sessions/{session_id}/similar", json={"productId": ""}).status_code
    == 400
  )
  invalid = client.post(
    f"/api/search/sessions/{session_id}/similar",
    json={"productId": base_id, "intent": "cheapest_ever"},
  )
  assert invalid.status_code == 400
  assert invalid.json()["error"]["code"] == "INVALID_SIMILAR_INTENT"
  assert (
    client.post("/api/search/sessions/missing/similar", json={"productId": base_id}).status_code
    == 404
  )


def test_similar_intent_cheaper_serves_only_cheaper_products() -> None:
  """의향 '더 저렴' — 기준 제품보다 싼 후보만. 없으면 이전 결과 유지 + 정직한 notice (§9)."""
  client = _client()
  session_id = _create(client, "글리터 추천해줘")
  before = _turn(client, session_id)
  base = max(before["result"]["products"], key=lambda p: p["price"])
  before_ids = [p["id"] for p in before["result"]["products"]]

  response = client.post(
    f"/api/search/sessions/{session_id}/similar",
    json={"productId": base["id"], "intent": "cheaper"},
  )
  assert response.status_code == 200

  turn = _turn(client, session_id)
  assert turn["phase"] == "results"
  assert _similar_log(turn)["intent"] == "cheaper"
  notice = turn["result"].get("refineNotice")
  if notice:
    # 후보셋에 더 싼 비슷한 후보가 없던 경우 — 조용한 완화 금지 계약.
    assert notice["kind"] == "similar_no_match"
    assert [p["id"] for p in turn["result"]["products"]] == before_ids
  else:
    for product in turn["result"]["products"]:
      assert 0 < product["price"] < base["price"]
      assert product["id"] != base["id"]


def test_similar_intent_other_brand_excludes_base_brand() -> None:
  """의향 '다른 브랜드' — 기준 제품 브랜드는 결과에서 제외된다."""
  client = _client()
  session_id = _create(client, "글리터 추천해줘")
  base = _turn(client, session_id)["result"]["products"][0]

  response = client.post(
    f"/api/search/sessions/{session_id}/similar",
    json={"productId": base["id"], "intent": "other_brand"},
  )
  assert response.status_code == 200

  turn = _turn(client, session_id)
  assert turn["phase"] == "results"
  assert _similar_log(turn)["intent"] == "other_brand"
  if not turn["result"].get("refineNotice"):
    for product in turn["result"]["products"]:
      assert product["brandName"] != base["brandName"]


def test_similar_intent_keep_color_is_recorded_and_serves_results() -> None:
  """의향 '색 유지' — 색 필터(색 정보 있을 때) 또는 정직한 caveat/notice로 반영된다."""
  client = _client()
  session_id = _create(client, "글리터 추천해줘")
  base = _turn(client, session_id)["result"]["products"][0]

  response = client.post(
    f"/api/search/sessions/{session_id}/similar",
    json={"productId": base["id"], "intent": "keep_color"},
  )
  assert response.status_code == 200

  turn = _turn(client, session_id)
  assert turn["phase"] == "results"
  assert _similar_log(turn)["intent"] == "keep_color"
  assert turn["result"]["products"], "keep_color must keep serving results (or prior results)"


def test_similar_does_not_mutate_session_lambda_or_cache() -> None:
  """similar의 λ=0.9는 일회성 — 이후 dial refine은 세션 기본 λ에서 시작한다 (§7 누적 계약 보존)."""
  client = _client()
  session_id = _create(client, "글리터 추천해줘")
  base_id = _turn(client, session_id)["result"]["products"][0]["id"]

  assert (
    client.post(
      f"/api/search/sessions/{session_id}/similar", json={"productId": base_id},
    ).status_code
    == 200
  )
  refined = client.post(f"/api/search/sessions/{session_id}/refine", json={"dial": "more_diverse"})
  assert refined.status_code == 200

  turn = _turn(client, session_id)
  refine_logs = [log["refine"] for log in turn.get("logs", []) if log.get("refine")]
  assert refine_logs, "refine log entry must exist"
  # settings 기본 λ(0.7) − step(0.15): similar의 0.9가 세션에 남았다면 0.75가 됐을 것.
  assert abs(refine_logs[-1]["lambda"] - (0.7 - 0.15)) < 1e-6
  assert refine_logs[-1]["usedCache"] is True  # rankedCache도 원본 그대로
