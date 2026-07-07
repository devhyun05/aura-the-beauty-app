from app.services.auradin_agent.session_manager import (
  answer_session,
  clear_sessions,
  create_session,
  to_search_turn,
)


def _answer_first_non_noop(state: dict) -> dict:
  turn = to_search_turn(state)
  question = turn["question"]
  option = next(option for option in question["options"] if option["filterDelta"]["op"] != "noop")
  answer_session(state["sessionId"], question_id=question["id"], option_id=option["id"])
  return to_search_turn(state)


def test_specific_lip_prompt_asks_question_and_preserves_price_filter() -> None:
  clear_sessions()
  state = create_session(prompt="쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하")
  turn = to_search_turn(state)

  assert turn["phase"] == "question"
  assert turn["question"]["attribute"] != "priceTier"
  assert any(filter_["attribute"] == "priceKrw" for filter_ in state["hardFilters"])

  after = _answer_first_non_noop(state)

  assert after["phase"] in {"question", "results"}
  assert state["logs"][-2]["candidateCountAfter"] != state["logs"][-2]["candidateCountBefore"]


def test_broad_prompt_starts_with_category_question_and_does_not_repeat_attribute() -> None:
  clear_sessions()
  state = create_session(prompt="데일리로 쓸 만한 제품 추천해줘")
  turn = to_search_turn(state)

  assert turn["phase"] == "question"
  assert turn["question"]["attribute"] == "category"

  _answer_first_non_noop(state)
  second = to_search_turn(state)

  assert second["phase"] == "question"
  assert second["question"]["attribute"] != "category"


def test_noop_answer_does_not_reduce_candidate_count() -> None:
  clear_sessions()
  state = create_session(prompt="데일리로 쓸 만한 제품 추천해줘")
  turn = to_search_turn(state)
  question = turn["question"]
  noop_option = next(option for option in question["options"] if option["filterDelta"]["op"] == "noop")

  before = len(state["currentCandidateIds"])
  answer_session(state["sessionId"], question_id=question["id"], option_id=noop_option["id"])
  after = len(state["currentCandidateIds"])

  assert after == before


def test_unsupported_perfume_prompt_returns_recoverable_failure() -> None:
  # base/brow/liner은 이제 서빙 대상 — 향수/네일/스킨케어만 범위 밖.
  clear_sessions()
  state = create_session(prompt="향수 추천해줘")
  turn = to_search_turn(state)

  assert turn["phase"] == "failed"
  assert turn["error"]["code"] == "unsupported_category"
  assert turn["error"]["recoverable"] is True
