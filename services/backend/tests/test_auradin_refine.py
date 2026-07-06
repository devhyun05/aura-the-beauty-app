"""§7 refine 계약 — dial은 재검색 없이 λ 재랭킹, prompt는 refine-출처만 교체, 후보 0은 이전 결과 유지."""

from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app
from app.services.auradin_agent.session_manager import clear_sessions


def _client(**settings_overrides) -> TestClient:
  clear_sessions()
  return TestClient(create_app(Settings(database_url=None, **settings_overrides)))


def _create(client: TestClient, prompt: str) -> str:
  created = client.post("/api/search/sessions", json={"prompt": prompt})
  assert created.status_code == 200
  return created.json()["data"]["sessionId"]


def _turn(client: TestClient, session_id: str) -> dict:
  return client.get(f"/api/search/sessions/{session_id}").json()["data"]


def _refine_log(turn: dict) -> dict:
  entries = [log["refine"] for log in turn.get("logs", []) if log.get("refine")]
  assert entries, "refine log entry must exist"
  return entries[-1]


def test_dial_reranks_cached_candidates_without_research() -> None:
  """dial 다이얼은 λ만 조절해 캐시된 후보를 재랭킹한다 — 재검색 0 (§7)."""
  client = _client()
  session_id = _create(client, "글리터 추천해줘")
  before = _turn(client, session_id)
  assert before["phase"] == "results"
  anchor_before = before["result"]["products"][0]["id"]

  refined = client.post(f"/api/search/sessions/{session_id}/refine", json={"dial": "more_diverse"})
  assert refined.status_code == 200

  turn = _turn(client, session_id)
  assert turn["phase"] == "results"
  log = _refine_log(turn)
  assert log["usedCache"] is True  # 재검색 없이 캐시 재랭킹
  assert abs(log["lambda"] - (0.7 - 0.15)) < 1e-6  # settings 기본 λ − step
  assert turn["result"]["diagnostics"]["lambda"] == log["lambda"]

  products = turn["result"]["products"]
  assert len(products) == 3
  assert [p["role"] for p in products] == ["anchor", "diverse", "discovery"]
  # anchor(최고 relevance)는 λ 변화와 무관하게 유지된다 — MMR 1위 고정.
  assert products[0]["id"] == anchor_before


def test_dial_accumulates_lambda_and_clamps() -> None:
  """다이얼 반복은 세션 λ에 누적되고 [0.05, 0.95]로 클램프된다."""
  client = _client()
  session_id = _create(client, "글리터 추천해줘")
  for _ in range(10):
    response = client.post(f"/api/search/sessions/{session_id}/refine", json={"dial": "more_diverse"})
    assert response.status_code == 200
  turn = _turn(client, session_id)
  assert _refine_log(turn)["lambda"] == 0.05


def test_prompt_refine_merges_price_and_keeps_original_category() -> None:
  """prompt refine은 §3 파서로 hard 병합 — 원 프롬프트 category 잠금은 불변."""
  client = _client()
  session_id = _create(client, "글리터 추천해줘")

  refined = client.post(f"/api/search/sessions/{session_id}/refine", json={"prompt": "2만원 이하로"})
  assert refined.status_code == 200
  turn = _turn(client, session_id)
  assert turn["phase"] == "results"

  applied = turn["appliedFilters"]
  price = next((f for f in applied if "20,000원 이하" in f["label"]), None)
  assert price is not None and price["source"] == "refine"
  for product in turn["result"]["products"]:
    assert product["category"] == "shadow"  # 원 프롬프트 잠금 유지
    assert 0 < product["price"] <= 20000


def test_second_refine_replaces_only_refine_sourced_filter() -> None:
  """같은 attribute의 refine-출처 필터만 교체 — 누적되지 않는다 (§7)."""
  client = _client()
  session_id = _create(client, "글리터 추천해줘")
  client.post(f"/api/search/sessions/{session_id}/refine", json={"prompt": "2만원 이하로"})
  client.post(f"/api/search/sessions/{session_id}/refine", json={"prompt": "3만원 이하로"})

  turn = _turn(client, session_id)
  price_filters = [f for f in turn["appliedFilters"] if "원 이하" in f["label"]]
  assert [f["label"] for f in price_filters] == ["30,000원 이하"]
  assert price_filters[0]["source"] == "refine"


def test_zero_candidate_refine_keeps_previous_results() -> None:
  """후보 0 refine은 조용한 완화 금지 — 이전 결과 유지 + recoveryOptions (§7/§9)."""
  client = _client()
  session_id = _create(client, "글리터 추천해줘")
  before = _turn(client, session_id)
  before_ids = [p["id"] for p in before["result"]["products"]]

  refined = client.post(f"/api/search/sessions/{session_id}/refine", json={"prompt": "1000원 이하로"})
  assert refined.status_code == 200

  turn = _turn(client, session_id)
  assert turn["phase"] == "results"
  assert [p["id"] for p in turn["result"]["products"]] == before_ids  # 이전 결과 그대로
  notice = turn["result"]["refineNotice"]
  assert notice["recoveryOptions"]

  # 실패한 refine 필터는 롤백된다 — 다음 dial refine이 오염되지 않는다.
  after_dial = client.post(f"/api/search/sessions/{session_id}/refine", json={"dial": "more_similar"})
  assert after_dial.status_code == 200
  turn = _turn(client, session_id)
  assert turn["phase"] == "results"
  assert len(turn["result"]["products"]) == 3
  assert all("1,000원 이하" not in f["label"] for f in turn["appliedFilters"])


def test_refine_requires_prompt_or_valid_dial() -> None:
  client = _client()
  session_id = _create(client, "글리터 추천해줘")
  assert client.post(f"/api/search/sessions/{session_id}/refine", json={}).status_code == 400
  assert (
    client.post(f"/api/search/sessions/{session_id}/refine", json={"dial": "spin"}).status_code == 400
  )
  assert client.post("/api/search/sessions/missing/refine", json={"dial": "more_diverse"}).status_code == 404
