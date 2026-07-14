"""§11 3-2단계 — 실시간 questionCopy: 되묻기 질문의 표시 텍스트만 LLM 재작성.

구조(질문 id·attribute·filterDelta·expectedCandidateCount·선택지 id)는 100% 불변(§9) —
답변 매칭이 id/filterDelta에 의존하기 때문. 충실성 게이트 통과 시에만 통째로 반영하고,
드리프트·비활성·실패면 결정론적 QUESTION_TITLES/ATTRIBUTE_LABELS 텍스트를 유지한다(가산 폴리시).
"""

import json

from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app
from app.services.auradin_agent.enrichment import (
  BedrockQuestionCopyClient,
  question_copy_is_faithful,
)
from app.services.auradin_agent.question_engine import ATTRIBUTE_LABELS, QUESTION_TITLES
from app.services.auradin_agent.session_manager import clear_sessions


PROMPT = "글리터 추천해줘"  # 브로드 질의 → 첫 턴에 되묻기 질문(priceTier)


def _client(**settings_overrides) -> TestClient:
  clear_sessions()
  settings_overrides.setdefault("legacy_naver_product_search", True)
  return TestClient(create_app(Settings(database_url=None, **settings_overrides)))


def _first_question(client: TestClient, prompt: str = PROMPT) -> dict:
  created = client.post("/api/search/sessions", json={"prompt": prompt})
  assert created.status_code == 200
  session_id = created.json()["data"]["sessionId"]
  turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]
  assert turn["phase"] == "question", turn.get("error")
  return turn["question"]


class _FakeBody:
  def __init__(self, payload: dict) -> None:
    self._payload = payload

  def read(self) -> bytes:
    return json.dumps(self._payload, ensure_ascii=False).encode("utf-8")


def _prompt_payload(kwargs: dict) -> dict:
  # 프롬프트에 임베드된 읽기 전용 질문 payload(첫 JSON 객체)를 되읽어 id를 그대로 반영한다.
  body = json.loads(kwargs["body"])
  prompt_text = body["messages"][0]["content"][0]["text"]
  payload, _ = json.JSONDecoder().raw_decode(prompt_text[prompt_text.index("{") :])
  return payload


def _bedrock_body(title: str, options: list[dict]) -> dict:
  text = json.dumps({"title": title, "options": options}, ensure_ascii=False)
  return {"body": _FakeBody({"content": [{"type": "text", "text": text}]})}


class _FaithfulBedrock:
  """id·순서를 그대로 두고 라벨/제목만 다듬는 충실한 가짜 — §9 무드리프트 재작성."""

  def __init__(self) -> None:
    self.invocations: list[dict] = []

  def invoke_model(self, **kwargs):
    self.invocations.append(kwargs)
    payload = _prompt_payload(kwargs)
    options = [{"id": o["id"], "label": f"{o['currentLabel']} 쪽이요"} for o in payload["options"]]
    return _bedrock_body("예산은 어느 정도가 좋으세요?", options)


class _DriftingBedrock:
  """옵션 id를 바꿔 구조를 흔드는 가짜 — 반드시 리젝돼 결정론적 텍스트가 서빙돼야 한다."""

  def invoke_model(self, **kwargs):
    payload = _prompt_payload(kwargs)
    options = [{"id": f"{o['id']}", "label": "완전 다른 라벨"} for o in payload["options"]]
    options[0]["id"] = f"{options[0]['id']}-tampered"  # 구조 드리프트
    return _bedrock_body("완전 다른 제목", options)


def _patch(monkeypatch, fake) -> None:
  monkeypatch.setattr(BedrockQuestionCopyClient, "_bedrock_runtime_client", lambda self: fake)


# ---------------------------------------------------------------------------
# 서빙 경로 — (a) 충실 재작성 반영, (b) 드리프트 리젝, (c) 비활성 폴백
# ---------------------------------------------------------------------------


def test_question_copy_faithful_rewrites_display_keeps_structure(monkeypatch) -> None:
  base = _first_question(_client())  # 자격증명 없음 → 결정론적 기준

  fake = _FaithfulBedrock()
  _patch(monkeypatch, fake)
  client = _client(aws_access_key_id="k", aws_secret_access_key="s")
  question = _first_question(client)

  # 구조(권위값)는 100% 불변 — 질문 id/attribute/expectedCount, 선택지 id/filterDelta.
  assert question["id"] == base["id"]
  assert question["attribute"] == base["attribute"]
  assert question["expectedCandidateCount"] == base["expectedCandidateCount"]
  assert [o["id"] for o in question["options"]] == [o["id"] for o in base["options"]]
  assert [o["filterDelta"] for o in question["options"]] == [o["filterDelta"] for o in base["options"]]
  assert [o["expectedCandidateCount"] for o in question["options"]] == [
    o["expectedCandidateCount"] for o in base["options"]
  ]

  # 표시 텍스트만 재작성됐다.
  assert question["title"] == "예산은 어느 정도가 좋으세요?"
  assert question["title"] != base["title"]
  assert question["titleSource"] == "bedrock"
  for served, original in zip(question["options"], base["options"]):
    assert served["label"] == f"{original['label']} 쪽이요"

  assert fake.invocations  # 실제로 LLM을 태웠다


def test_question_copy_drift_rejected_keeps_deterministic(monkeypatch) -> None:
  base = _first_question(_client())

  _patch(monkeypatch, _DriftingBedrock())
  client = _client(aws_access_key_id="k", aws_secret_access_key="s")
  question = _first_question(client)

  # 드리프트 → 통째로 리젝 → 결정론적 텍스트 그대로 (부분 적용 없음).
  assert question["title"] == base["title"] == QUESTION_TITLES[base["attribute"]]
  assert [o["label"] for o in question["options"]] == [o["label"] for o in base["options"]]
  assert [o["id"] for o in question["options"]] == [o["id"] for o in base["options"]]
  assert "titleSource" not in question


def test_question_copy_disabled_keeps_deterministic(monkeypatch) -> None:
  fake = _FaithfulBedrock()
  _patch(monkeypatch, fake)
  client = _client(
    aws_access_key_id="k",
    aws_secret_access_key="s",
    auradin_question_copy_enabled=False,
  )
  question = _first_question(client)

  attribute = question["attribute"]
  assert question["title"] == QUESTION_TITLES[attribute]
  for option in question["options"]:
    delta = option["filterDelta"]
    if delta.get("op") == "noop":
      assert option["label"] == "상관 없어요"
    else:
      assert option["label"] == ATTRIBUTE_LABELS[attribute][delta["values"][0]]
  assert "titleSource" not in question
  assert not fake.invocations  # 비활성이면 LLM을 아예 부르지 않는다


# ---------------------------------------------------------------------------
# question_copy_is_faithful — §9 충실성 게이트 단위 검증
# ---------------------------------------------------------------------------


def _sample_question() -> dict:
  return _first_question(_client())


def test_faithful_gate_accepts_pure_rephrase() -> None:
  question = _sample_question()
  rewritten = {
    "title": "예산은 어느 쪽이 편하세요?",
    "options": [{"id": o["id"], "label": f"{o['label']} 정도"} for o in question["options"]],
  }
  assert question_copy_is_faithful(rewritten, question)


def test_faithful_gate_rejects_id_drift() -> None:
  question = _sample_question()
  options = [{"id": o["id"], "label": o["label"]} for o in question["options"]]
  options[0]["id"] = "hacked-id"
  assert not question_copy_is_faithful({"title": "예산 질문", "options": options}, question)


def test_faithful_gate_rejects_count_mismatch() -> None:
  question = _sample_question()
  options = [{"id": o["id"], "label": o["label"]} for o in question["options"][:-1]]
  assert not question_copy_is_faithful({"title": "예산 질문", "options": options}, question)


def test_faithful_gate_rejects_banned_terms() -> None:
  question = _sample_question()
  options = [{"id": o["id"], "label": o["label"]} for o in question["options"]]
  assert not question_copy_is_faithful({"title": "100% 보장하는 예산 질문", "options": options}, question)


def test_faithful_gate_rejects_value_label_swap() -> None:
  # id는 그대로여도 라벨을 같은 속성의 '다른 값'(핑크→레드)으로 바꾸면 표시가 거짓 → 리젝.
  original = {
    "options": [
      {"id": "colorFamily-pink", "label": "핑크", "filterDelta": {"attribute": "colorFamily", "op": "eq", "values": ["pink"]}},
      {"id": "colorFamily-rose", "label": "로즈", "filterDelta": {"attribute": "colorFamily", "op": "eq", "values": ["rose"]}},
    ],
  }
  rewritten = {
    "title": "색은 어느 쪽이 끌리세요?",
    "options": [
      {"id": "colorFamily-pink", "label": "레드 느낌"},  # pink 선택지인데 '레드' 라벨
      {"id": "colorFamily-rose", "label": "로즈 느낌"},
    ],
  }
  assert not question_copy_is_faithful(rewritten, original)


def test_faithful_gate_rejects_non_dict() -> None:
  assert not question_copy_is_faithful(None, _sample_question())
