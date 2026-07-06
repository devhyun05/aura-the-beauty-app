"""§11 레인 A 2단계 얇은 수직 슬라이스 — "글리터 추천해줘" 계약 검증.

§5(floor → relevance → MMR → 3역할)과 §6(구조화 근거)을 실데이터로 코드 강제한다.
완료 정의: "글리터" 의도가 shadow/shimmer로 잠기고, top3에 립/틴트 드리프트 없음.
질문 루프(§7/§8)는 슬라이스 범위 밖 — 랭킹 파이프라인을 직접 구동한다.
"""

from app.core.settings import Settings
from app.services.auradin_agent.catalog_loader import load_mvp_catalog
from app.services.auradin_agent.intent_parser import parse_intent
from app.services.auradin_agent.ranking import build_slice_result
from app.services.auradin_agent.retrieval_service import retrieve_and_rank

GLITTER_CAVEAT = "'글리터'는 카탈로그 기준 아이섀도우·쉬머 계열로 해석했어요"


def _run_glitter_slice() -> dict:
  catalog = load_mvp_catalog()
  intent = parse_intent("글리터 추천해줘")
  retrieval = retrieve_and_rank(catalog, intent, [], settings=Settings(database_url=None))
  slice_result = build_slice_result(
    retrieval["ranked"],
    lambda_=0.7,
    s_floor=0.5,
    hard_filters=retrieval["hardFilters"],
    extra_caveats=[GLITTER_CAVEAT],
  )
  return {"intent": intent, "retrieval": retrieval, "slice": slice_result}


def test_glitter_intent_locks_to_shadow_and_shimmer() -> None:
  """완료 정의 1: '글리터' 의도가 shadow(하드) + shimmer(soft)로 잠긴다."""
  intent = parse_intent("글리터 추천해줘")
  assert intent["category"] == "shadow"
  assert any(f["attribute"] == "category" and f["values"] == ["shadow"] for f in intent["lockedFilters"])
  assert any(
    s["attribute"] == "finish" and "shimmer" in s["values"] for s in intent["softPreferences"]
  )


def test_glitter_top3_has_no_lip_or_tint_drift() -> None:
  """완료 정의 2: top3 전원 shadow — 립/틴트 드리프트 0."""
  products = _run_glitter_slice()["slice"]["products"]
  assert len(products) == 3
  assert all(p["category"] == "shadow" for p in products)


def test_glitter_three_roles_assigned_with_distinct_discovery() -> None:
  """§5 3역할: anchor/diverse/discovery, discovery는 anchor와 다른 브랜드(큐레이션 대체 발견)."""
  products = _run_glitter_slice()["slice"]["products"]
  roles = [p["role"] for p in products]
  assert roles == ["anchor", "diverse", "discovery"]
  assert all(p["source"] == "curated" for p in products)  # 라이브 Naver는 §11 7단계
  by_role = {p["role"]: p for p in products}
  assert by_role["discovery"]["brandName"] != by_role["anchor"]["brandName"]


def test_glitter_top3_is_diversified() -> None:
  """§5 MMR: top3에 (브랜드, 색) 중복 없음 (pure-sort의 근접 중복 제거)."""
  products = _run_glitter_slice()["slice"]["products"]
  brands = [p["brandName"] for p in products]
  assert len(set(brands)) == 3
  signatures = {(p["brandName"], p["shadeName"]) for p in products}
  assert len(signatures) == 3


def test_glitter_reason_is_structured_three_bucket() -> None:
  """§6 구조화 근거: reason은 matchedOn/inferred/caveat 3칸 구조 (자유 문장 금지)."""
  products = _run_glitter_slice()["slice"]["products"]
  for product in products:
    reason = product["reason"]
    assert isinstance(reason, dict)
    assert set(reason.keys()) == {"matchedOn", "inferred", "caveat"}
    # 카테고리는 명시 하드조건 → 확정 근거에 노출
    assert "아이섀도우" in reason["matchedOn"]
    # '글리터'→쉬머 해석은 정직하게 caveat로 노출 (§9 억지 매칭 금지)
    assert GLITTER_CAVEAT in reason["caveat"]


def test_floor_gate_cuts_unjustified_candidates() -> None:
  """§5 floor 게이트: 정당화 미달 후보가 정렬 전 컷된다."""
  slice_result = _run_glitter_slice()["slice"]
  assert slice_result["floorCount"] < slice_result["rankedCount"]


def test_category_hard_filter_contributes_to_score() -> None:
  """실버그 회귀: category 하드 필터가 rule_score에 기여해야 한다.

  _item_value가 top-level category를 못 읽어 rule_score=0이던 버그 → 매치율 조용히 반토막.
  수정 후 shadow 잠금 질의의 anchor는 rule 만점 + 정직하게 높은 매치율.
  """
  data = _run_glitter_slice()
  ranked = data["retrieval"]["ranked"]
  assert ranked, "shadow 후보가 있어야 한다"
  anchor_row = ranked[0]
  assert anchor_row["components"]["ruleScore"] == 1.0  # category 매칭 인식
  anchor_product = data["slice"]["products"][0]
  assert anchor_product["matchRate"] >= 85  # before: 40


def test_blusher_prompt_does_not_self_inject_velvet_finish() -> None:
  """실버그 회귀: '블러'(velvet 단서)가 '블러셔/블러쉬' 안에서 오탐되면 안 된다.

  치크 질의마다 finish=velvet 소프트 선호가 자동 주입돼 랭킹·발견 질의를 오염시켰다.
  """
  for prompt in ("데일리로 쓸 만한 블러셔 추천해줘", "피치 크림 블러쉬"):
    intent = parse_intent(prompt)
    finish_prefs = [s for s in intent["softPreferences"] if s["attribute"] == "finish"]
    assert not any("velvet" in s["values"] for s in finish_prefs), prompt

  # 진짜 벨벳/블러 의도는 계속 잡힌다
  intent = parse_intent("블러 처리된 벨벳 립")
  finish_prefs = [s for s in intent["softPreferences"] if s["attribute"] == "finish"]
  assert any("velvet" in s["values"] for s in finish_prefs)


def test_plum_query_now_matches_catalog() -> None:
  """실버그 회귀: '플럼'이 burgundy(0개)가 아니라 plum(카탈로그 존재)으로 매칭된다."""
  intent = parse_intent("플럼 립 추천")
  color_prefs = [s for s in intent["softPreferences"] if s["attribute"] == "colorFamily"]
  assert color_prefs and color_prefs[0]["values"] == ["plum"]

  catalog = load_mvp_catalog()
  plum_matches = [
    item
    for item in catalog.items
    if (item.get("attributes") or {}).get("colorFamily") == "plum"
  ]
  assert len(plum_matches) > 0
