"""§11 3단계 백엔드 Phase1 — 슬라이스 파이프라인이 서빙 경로(세션 API)에 배선됐는지 검증.

- 서빙 결과가 §5/§8 role/source + §6 구조화 근거를 실어 나른다.
- 점수갭 즉답 종료: 결정적 질의는 질문 스킵 → 결과 직행, 모호/동점 질의는 질문 유지.
"""

from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app
from app.services.auradin_agent.session_manager import clear_sessions

VALID_ROLES = {"anchor", "diverse", "discovery"}
REASON_KEYS = {"matchedOn", "inferred", "caveat"}


def _first_turn(prompt: str, **settings_overrides):
  clear_sessions()
  client = TestClient(create_app(Settings(database_url=None, **settings_overrides)))
  created = client.post("/api/search/sessions", json={"prompt": prompt})
  assert created.status_code == 200
  session_id = created.json()["data"]["sessionId"]
  return client.get(f"/api/search/sessions/{session_id}").json()["data"]


def test_decisive_query_skips_question_and_serves_roles_and_reason() -> None:
  """결정적 질의(글리터: shadow 잠금 + 갭≥θ) → 질문 없이 결과, role/source/구조화 근거 노출."""
  turn = _first_turn("글리터 추천해줘")
  assert turn["phase"] == "results"

  # 점수갭 즉답 종료가 실제로 발동했는지 로그로 확인
  early = [log.get("earlyTermination") for log in turn.get("logs", []) if log.get("earlyTermination")]
  assert early and early[0]["reason"] == "decisive_score_gap"

  products = turn["result"]["products"]
  assert len(products) == 3
  assert [p["role"] for p in products] == ["anchor", "diverse", "discovery"]
  for product in products:
    assert product["role"] in VALID_ROLES
    assert product["source"] == "curated"  # 라이브 Naver는 §11 7단계
    assert product["category"] == "shadow"  # 립/틴트 드리프트 0
    assert isinstance(product["reason"], dict)
    assert set(product["reason"].keys()) == REASON_KEYS
    assert "아이섀도우" in product["reason"]["matchedOn"]

  # 매치율 정직화: 근거 완비 anchor는 높고(≥85), 스프레드가 존재
  assert products[0]["matchRate"] >= 85


def test_glitter_serving_reason_carries_interpretation_caveat() -> None:
  """§6/§9: '글리터'→쉬머 해석이 서빙 근거의 caveat에 정직하게 실린다."""
  turn = _first_turn("글리터 추천해줘")
  anchor = turn["result"]["products"][0]
  assert any("글리터" in c for c in anchor["reason"]["caveat"])


def test_ambiguous_query_still_asks_question() -> None:
  """모호 질의는 즉답 종료가 오발동하지 않고 질문을 유지한다 (아키네이터 퍼널)."""
  turn = _first_turn("데일리로 쓸 만한 제품 추천해줘")
  assert turn["phase"] == "question"


def test_tied_top_query_still_asks_question() -> None:
  """상위가 동점(작은 갭)인 하드 질의는 즉답 종료 안 함 — 질문이 실제로 좁혀준다."""
  turn = _first_turn("올리브영 매트 립")
  assert turn["phase"] == "question"


def test_score_gap_termination_can_be_disabled_by_high_threshold() -> None:
  """θ를 크게 올리면 결정적 질의도 질문을 탄다 — 노브가 실제로 동작함을 증명."""
  turn = _first_turn("글리터 추천해줘", auradin_score_gap_threshold=0.99)
  assert turn["phase"] == "question"
