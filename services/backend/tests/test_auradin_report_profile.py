"""§3/§9 — 얼굴분석 리포트 → undertone 소프트 선호. hard filter 금지, 후보 드롭 0, 참고 칩 노출."""

from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app
from app.services.auradin_agent.report_profile import (
  infer_undertone,
  personal_color_to_soft_preferences,
)
from app.services.auradin_agent.session_manager import clear_sessions, get_session


def test_infer_undertone_maps_korean_personal_color() -> None:
  assert infer_undertone("봄 웜 라이트") == "warm"
  assert infer_undertone("가을 웜 뮤트") == "warm"
  assert infer_undertone("여름 쿨") == "cool"
  assert infer_undertone("겨울 쿨 브라이트") == "cool"
  assert infer_undertone("뉴트럴") == "neutral"
  assert infer_undertone("") is None
  assert infer_undertone("알 수 없음") is None


def test_soft_pref_is_never_a_hard_filter() -> None:
  """§9: 방출 delta는 mode/locked 없음 → apply_hard_filters가 절대 못 집는다."""
  prefs = personal_color_to_soft_preferences("여름 쿨")
  assert len(prefs) == 1
  delta = prefs[0]
  assert delta["attribute"] == "undertone"
  assert delta["values"] == ["cool"]
  assert delta["source"] == "report"
  assert "mode" not in delta  # hard 경로 차단
  assert "locked" not in delta
  # 뉴트럴/불명은 톤 편향 안 줌
  assert personal_color_to_soft_preferences("뉴트럴") == []
  assert personal_color_to_soft_preferences("") == []


def _client(**overrides) -> TestClient:
  clear_sessions()
  return TestClient(create_app(Settings(database_url=None, **overrides)))


def _create(client: TestClient, prompt: str, **body) -> str:
  created = client.post("/api/search/sessions", json={"prompt": prompt, **body})
  assert created.status_code == 200, created.text
  return created.json()["data"]["sessionId"]


def _turn(client: TestClient, session_id: str) -> dict:
  return client.get(f"/api/search/sessions/{session_id}").json()["data"]


def test_report_tone_lifts_matching_candidate_without_dropping_any() -> None:
  """warm 리포트 첨부가 후보를 하나도 떨구지 않으면서(soft) 랭킹에만 반영된다."""
  client = _client()
  base = _create(client, "플럼 립 추천해줘")
  base_turn = _turn(client, base)
  # 질문이 나오면 통과시켜 결과까지
  for _ in range(4):
    if base_turn["phase"] != "question":
      break
    q = base_turn["question"]
    client.post(f"/api/search/sessions/{base}/answer", json={"questionId": q["id"], "optionId": q["options"][-1]["id"]})
    base_turn = _turn(client, base)
  base_count = base_turn.get("result", {}).get("diagnostics", {}).get("rankedCount")

  client2 = _client()
  withrep = _create(client2, "플럼 립 추천해줘", context={"personalColor": "여름 쿨"})
  rep_turn = _turn(client2, withrep)
  for _ in range(4):
    if rep_turn["phase"] != "question":
      break
    q = rep_turn["question"]
    client2.post(f"/api/search/sessions/{withrep}/answer", json={"questionId": q["id"], "optionId": q["options"][-1]["id"]})
    rep_turn = _turn(client2, withrep)

  # §9: soft-pref이므로 후보 수(rankedCount)는 리포트 유무와 무관하게 동일 — 드롭 0.
  rep_count = rep_turn.get("result", {}).get("diagnostics", {}).get("rankedCount")
  assert rep_count == base_count

  # 결과 칩에 "쿨톤 참고"가 source=report로 노출.
  labels = [(f["label"], f["source"]) for f in rep_turn["appliedFilters"]]
  assert ("쿨톤 참고", "report") in labels


def test_report_attachment_does_not_change_question_behavior() -> None:
  """구체 프롬프트에 리포트를 얹어도 질문 동작이 바뀌면 안 된다 — 리포트는 재랭킹만.

  phase 비교만으로는 부족하다(모호성 경로로 어차피 질문이 뜰 수 있음) —
  파서가 정한 requiresQuestion을 리포트 병합이 뒤집지 않는 것 자체를 확인한다.
  """
  prompt = "립 2만원 이하 올리브영에서 추천해줘"
  client = _client()
  base_id = _create(client, prompt)
  base_turn = _turn(client, base_id)
  base_intent = get_session(base_id)["intent"]

  client2 = _client()
  rep_id = _create(client2, prompt, context={"personalColor": "여름 쿨"})
  rep_turn = _turn(client2, rep_id)
  rep_intent = get_session(rep_id)["intent"]

  assert rep_intent["requiresQuestion"] == base_intent["requiresQuestion"]
  assert rep_intent["broad"] == base_intent["broad"]
  assert rep_turn["phase"] == base_turn["phase"]


def test_report_only_empty_prompt_asks_category_scope_question() -> None:
  """리포트만 있고 broad 시드면 '어느 부위' 카테고리 스코프 질문이 먼저 뜬다 (§4 스코프)."""
  client = _client()
  session_id = _create(client, "추천해줘", context={"personalColor": "여름 쿨"})
  turn = _turn(client, session_id)
  assert turn["phase"] == "question"
  assert turn["question"]["attribute"] == "category"
  labels = [o["label"] for o in turn["question"]["options"]]
  assert "립" in labels and "상관 없어요" in labels
