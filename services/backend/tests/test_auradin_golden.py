"""§11 5단계 골든 스위트 — 의도 보존 + 카피 충실성 + refine 회귀망.

6개 골든 질의를 실서빙 경로(세션 API, 질문은 noop 통과)로 돌려 §5/§6/§7/§9 계약을 고정한다:
- 의도 보존: top3 카테고리 잠금(드리프트 0)·role 3종·reason 3칸·명시 필터 유지.
- 카피 충실성: reasonCopy가 구조화 근거에 없는 속성/금지 표현을 실으면 전 질의에서 폐기된다.
- refine: dial은 재검색 없이 λ만 바꾸고, 극단 λ에서 top3 구성이 실제로 달라진다.
"""

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app
from app.services.auradin_agent.enrichment import BedrockReasonCopyClient, copy_is_faithful
from app.services.auradin_agent.session_manager import clear_sessions

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from auradin_glitter_slice import GOLDEN_QUERIES, run_golden  # noqa: E402

GOLDEN_EXPECTATIONS = {
  "글리터 추천해줘": {"category": "shadow"},
  "플럼 립 추천해줘": {"category": "lip"},
  "올리브영에서 살 수 있는 매트 립": {"category": "lip", "filterLabels": ["올리브영"]},
  "데일리로 쓸 만한 블러셔 추천해줘": {"category": "cheek"},
  "2만원 이하 촉촉한 립 틴트": {"category": "lip", "filterLabels": ["20,000원 이하"], "priceMax": 20000},
  "은은한 쉬머 아이섀도우 팔레트": {"category": "shadow"},
  "커버 좋은 쿠션 추천해줘": {"category": "base"},
  "자연스러운 브로우 펜슬 추천해줘": {"category": "brow"},
  "또렷한 아이라이너 추천해줘": {"category": "liner"},
}

REASON_KEYS = {"matchedOn", "inferred", "caveat"}


def _client(**settings_overrides) -> TestClient:
  clear_sessions()
  return TestClient(create_app(Settings(database_url=None, **settings_overrides)))


def _run_to_results(client: TestClient, prompt: str) -> tuple[str, dict]:
  created = client.post("/api/search/sessions", json={"prompt": prompt})
  assert created.status_code == 200
  session_id = created.json()["data"]["sessionId"]
  turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]
  # 질문은 '상관 없어요'(noop)로 통과 — 명시 필터가 조용히 바뀌지 않음을 함께 검증한다.
  for _ in range(4):
    if turn["phase"] != "question":
      break
    question = turn["question"]
    client.post(
      f"/api/search/sessions/{session_id}/answer",
      json={"questionId": question["id"], "optionId": question["options"][-1]["id"]},
    )
    turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]
  assert turn["phase"] == "results", f"{prompt} → {turn.get('error')}"
  return session_id, turn


# ---------------------------------------------------------------------------
# 의도 보존 (§3/§4/§5/§6/§9)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("prompt", GOLDEN_QUERIES)
def test_golden_intent_preserved_through_serving(prompt: str) -> None:
  expected = GOLDEN_EXPECTATIONS[prompt]
  client = _client()
  _, turn = _run_to_results(client, prompt)
  products = turn["result"]["products"]

  # §5 3역할 + §4 Top3
  assert [p["role"] for p in products] == ["anchor", "diverse", "discovery"]

  # 드리프트 0: 카테고리 잠금 유지
  assert all(p["category"] == expected["category"] for p in products), prompt

  # §6 구조화 근거 3칸 + reasonCopy(가산 필드) 항상 존재
  for product in products:
    assert set(product["reason"].keys()) == REASON_KEYS
    assert product["reasonCopy"]

  # §9: 명시 필터는 noop 답변을 거쳐도 조용히 사라지지 않는다
  applied_labels = [f["label"] for f in turn["appliedFilters"]]
  for label in expected.get("filterLabels", []):
    assert label in applied_labels, f"{prompt}: {label} not in {applied_labels}"
  if "priceMax" in expected:
    assert all(0 < p["price"] <= expected["priceMax"] for p in products)


def test_golden_runner_snapshots_are_stable_and_structured() -> None:
  """멀티쿼리 골든 러너 — 동일 입력 → 동일 스냅샷(결정성), 구조화 근거 완비."""
  first = run_golden()
  second = run_golden()
  assert json.dumps(first, sort_keys=True, ensure_ascii=False) == json.dumps(
    second, sort_keys=True, ensure_ascii=False,
  )
  for snapshot in first:
    assert snapshot["products"], snapshot["query"]
    for product in snapshot["products"]:
      assert set(product["reason"].keys()) == REASON_KEYS


# ---------------------------------------------------------------------------
# 카피 충실성 (§6/§9) — 전 골든 질의에서 발명 카피가 걸러진다
# ---------------------------------------------------------------------------


class _FakeBody:
  def __init__(self, payload: dict) -> None:
    self._payload = payload

  def read(self) -> bytes:
    return json.dumps(self._payload, ensure_ascii=False).encode("utf-8")


class _EchoBedrock:
  """요청 payload의 matchedOn 첫 항목만 되돌려주는 충실한 가짜 — §9 무발명 카피."""

  def invoke_model(self, **kwargs):
    body = json.loads(kwargs["body"])
    prompt_text = body["messages"][0]["content"][0]["text"]
    payload, _ = json.JSONDecoder().raw_decode(prompt_text[prompt_text.index("{") :])
    matched = payload["reason"]["matchedOn"] or [payload["productName"]]
    copy = f"{' · '.join(matched)} 조건에 맞아 골랐어요."
    return {"body": _FakeBody({"content": [{"type": "text", "text": json.dumps({"reasonCopy": copy}, ensure_ascii=False)}]})}


class _InventingBedrock:
  """구조화 근거에 없는 속성·보증 표현을 섞는 가짜 — 반드시 걸러져야 한다."""

  def invoke_model(self, **kwargs):
    copy = "버건디 무드의 공식 베스트셀러예요"
    return {"body": _FakeBody({"content": [{"type": "text", "text": json.dumps({"reasonCopy": copy}, ensure_ascii=False)}]})}


@pytest.mark.parametrize("prompt", GOLDEN_QUERIES)
def test_golden_faithful_copy_passes_everywhere(prompt: str, monkeypatch) -> None:
  monkeypatch.setattr(BedrockReasonCopyClient, "_bedrock_runtime_client", lambda self: _EchoBedrock())
  client = _client(aws_access_key_id="k", aws_secret_access_key="s")
  _, turn = _run_to_results(client, prompt)
  for product in turn["result"]["products"]:
    assert product["reasonCopySource"] == "bedrock"
    assert copy_is_faithful(product["reasonCopy"], product)


@pytest.mark.parametrize("prompt", GOLDEN_QUERIES)
def test_golden_inventing_copy_is_rejected_everywhere(prompt: str, monkeypatch) -> None:
  monkeypatch.setattr(BedrockReasonCopyClient, "_bedrock_runtime_client", lambda self: _InventingBedrock())
  client = _client(aws_access_key_id="k", aws_secret_access_key="s")
  _, turn = _run_to_results(client, prompt)
  for product in turn["result"]["products"]:
    assert product["reasonCopySource"] == "fallback"  # §9: 발명 카피는 서빙되지 않는다
    assert "버건디" not in product["reasonCopy"]
    assert "공식" not in product["reasonCopy"]


# ---------------------------------------------------------------------------
# refine 골든 (§7) — 재검색 없이 λ가 실제로 다양성을 바꾼다
# ---------------------------------------------------------------------------


def test_golden_refine_dial_changes_diversity_without_research() -> None:
  changed_any = False
  for prompt in GOLDEN_QUERIES:
    client = _client()
    session_id, _ = _run_to_results(client, prompt)

    # 극단 λ 두 방향 — more_similar ×2 → λ 0.95, more_diverse ×5 → λ 0.05
    for _ in range(2):
      assert client.post(f"/api/search/sessions/{session_id}/refine", json={"dial": "more_similar"}).status_code == 200
    similar_turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]
    similar_ids = [p["id"] for p in similar_turn["result"]["products"]]

    for _ in range(7):
      assert client.post(f"/api/search/sessions/{session_id}/refine", json={"dial": "more_diverse"}).status_code == 200
    diverse_turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]
    diverse_ids = [p["id"] for p in diverse_turn["result"]["products"]]

    # 재검색 없음: 모든 refine 로그가 캐시 재랭킹이었다
    refine_logs = [log["refine"] for log in diverse_turn.get("logs", []) if log.get("refine")]
    assert refine_logs and all(log["usedCache"] for log in refine_logs)
    assert diverse_turn["result"]["diagnostics"]["lambda"] == 0.05
    assert similar_turn["result"]["diagnostics"]["lambda"] == 0.95

    # anchor는 두 극단 모두 동일(최고 relevance 고정), 나머지 슬롯이 다양성 축
    assert similar_ids[0] == diverse_ids[0]
    if similar_ids != diverse_ids:
      changed_any = True

  # λ 극단 사이에서 top3 구성이 최소 한 질의에서는 실제로 달라진다 — 다이얼이 죽은 노브가 아님
  assert changed_any
