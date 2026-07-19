"""§3/§9 — 얼굴분석 리포트 → undertone 소프트 선호. hard filter 금지, 후보 드롭 0, 참고 칩 노출."""

from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app
from app.services.auradin_agent.report_profile import (
  infer_skin_type,
  infer_undertone,
  personal_color_to_soft_preferences,
  report_context_to_soft_preferences,
  skin_type_to_soft_preferences,
)
from app.services.auradin_agent.session_manager import clear_sessions, create_session, get_session


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


def test_infer_skin_type_maps_korean_and_english() -> None:
  assert infer_skin_type("건성") == "dry"
  assert infer_skin_type("수분 부족 지성") == "oily"
  assert infer_skin_type("복합성") == "combination"
  assert infer_skin_type("Dry Skin") == "dry"
  assert infer_skin_type("") is None
  assert infer_skin_type("알 수 없음") is None


def test_skin_type_expands_to_finish_soft_preference() -> None:
  """C4 — 레거시 _target_terms의 피부타입→마감 확장 이관 (카탈로그 finish 어휘 기준)."""
  dry = skin_type_to_soft_preferences("건성")
  assert len(dry) == 1
  assert dry[0]["attribute"] == "finish"
  assert dry[0]["values"] == ["glossy"]  # 촉촉/윤광 — texture에는 moist류 값이 없어 finish=glossy가 정본
  assert dry[0]["source"] == "report"
  assert dry[0]["weight"] == 0.4  # CAP_REPORT 지배라 넛지 이상이 될 수 없음
  assert "mode" not in dry[0] and "locked" not in dry[0]  # §9 hard 경로 차단 동일 계약

  oily = skin_type_to_soft_preferences("지성")
  assert oily[0]["values"] == ["matte", "velvet"]  # 매트 + 세미매트(벨벳) 소프트 선호
  assert skin_type_to_soft_preferences("복합성")[0]["values"] == ["matte", "velvet"]
  assert skin_type_to_soft_preferences("") == []

  # finish 넛지는 베이스/파우더 카테고리에만 적용된다(립·아이 등 색조 제외).
  assert dry[0]["categoryScope"] == ["base", "powder"]
  assert skin_type_to_soft_preferences("알 수 없음") == []


def test_report_confidence_gate_blocks_low_confidence_signals() -> None:
  """§9.2 — conf<0.5 리포트 신호는 주입 0. 부재(None)는 기존 기본값으로 주입 유지."""
  assert personal_color_to_soft_preferences("여름 쿨", confidence=0.3) == []
  assert personal_color_to_soft_preferences("여름 쿨", confidence=0.0) == []
  kept = personal_color_to_soft_preferences("여름 쿨", confidence=0.5)
  assert kept and kept[0]["confidence"] == 0.5
  default = personal_color_to_soft_preferences("여름 쿨")
  assert default and default[0]["confidence"] == 0.55  # 무회귀 — 기존 기본값 유지

  assert skin_type_to_soft_preferences("건성", confidence=0.49) == []
  kept_skin = skin_type_to_soft_preferences("건성", confidence=0.8)
  assert kept_skin and kept_skin[0]["confidence"] == 0.8


def test_report_context_merges_personal_color_and_skin_type() -> None:
  prefs = report_context_to_soft_preferences({"personalColor": "봄 웜", "skinType": "건성"})
  by_attribute = {pref["attribute"]: pref for pref in prefs}
  assert by_attribute["undertone"]["values"] == ["warm"]
  assert by_attribute["finish"]["values"] == ["glossy"]
  assert all(pref["source"] == "report" for pref in prefs)

  # 신호별 confidence 게이트 — skinType만 저신뢰면 skinType만 빠진다.
  gated = report_context_to_soft_preferences(
    {"personalColor": "봄 웜", "skinType": "건성", "skinTypeConfidence": 0.2},
  )
  assert [pref["attribute"] for pref in gated] == ["undertone"]

  # 공통 confidence는 신호별 값이 없을 때 둘 다에 적용된다.
  assert report_context_to_soft_preferences(
    {"personalColor": "봄 웜", "skinType": "건성", "confidence": 0.3},
  ) == []
  assert report_context_to_soft_preferences(None) == []
  assert report_context_to_soft_preferences({}) == []


def test_session_merges_skin_type_report_preferences() -> None:
  """create_session이 report_context.skinType을 finish soft 선호로 병합한다 (C4 배선)."""
  clear_sessions()
  state = create_session(
    prompt="립 추천해줘",
    owner_subject="local-dev-user",
    report_context={"personalColor": "여름 쿨", "skinType": "지성"},
    settings=Settings(database_url=None),
  )
  report_prefs = [
    pref for pref in state["intent"].get("softPreferences", []) if pref.get("source") == "report"
  ]
  by_attribute = {pref["attribute"]: pref for pref in report_prefs}
  assert by_attribute["undertone"]["values"] == ["cool"]
  assert by_attribute["finish"]["values"] == ["matte", "velvet"]


def _client(**overrides) -> TestClient:
  clear_sessions()
  overrides.setdefault("legacy_naver_product_search", True)
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
  base_intent = get_session(base_id, owner_subject="local-dev-user")["intent"]

  client2 = _client()
  rep_id = _create(client2, prompt, context={"personalColor": "여름 쿨"})
  rep_turn = _turn(client2, rep_id)
  rep_intent = get_session(rep_id, owner_subject="local-dev-user")["intent"]

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
