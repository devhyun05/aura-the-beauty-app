import time

import pytest
from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app
from app.services.auradin_agent.session_manager import (
  _SESSIONS,
  clear_sessions,
  resolve_auradin_result_product,
)


def test_search_session_api_returns_question_then_results() -> None:
  clear_sessions()
  client = TestClient(create_app(Settings(database_url=None, legacy_naver_product_search=True)))

  created = client.post(
    "/api/search/sessions",
    json={"prompt": "쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하"},
  )
  assert created.status_code == 200
  session_id = created.json()["data"]["sessionId"]

  turn_response = client.get(f"/api/search/sessions/{session_id}")
  assert turn_response.status_code == 200
  assert turn_response.headers["cache-control"] == "private, no-store"
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


@pytest.mark.asyncio
async def test_auradin_like_resolver_is_bound_to_owner_and_active_result() -> None:
  clear_sessions()
  settings = Settings(database_url=None, legacy_naver_product_search=True)
  product_id = "owner-product-1"
  _SESSIONS["owner-session"] = {
    "sessionId": "owner-session",
    "ownerSubject": "owner-a",
    "expiresAt": time.time() + 300,
    "updatedAt": time.time(),
    "result": {
      "products": [
        {
          "id": product_id,
          "brandName": "Owner Brand",
          "productName": "Owner Lip",
          "category": "lip",
          "imageUrl": "https://cdn.example.com/owner-lip.png",
          "purchaseUrl": "https://shop.example.com/owner-lip",
          "priceKrw": 18000,
        }
      ]
    },
  }

  resolved = await resolve_auradin_result_product(
    owner_subject="owner-a",
    product_id=product_id,
    settings=settings,
    db=None,
  )
  assert resolved is not None
  assert resolved["id"] == product_id
  assert await resolve_auradin_result_product(
    owner_subject="owner-b",
    product_id=product_id,
    settings=settings,
    db=None,
  ) is None


class _AuradinSessionDatabase:
  is_connected = True

  def __init__(self) -> None:
    self.fetchrow_args = None

  async def execute(self, *_args):
    return "OK"

  async def fetchrow(self, query, *args):
    self.fetchrow_args = (query, args)
    return {
      "product": {
        "id": "postgres-product-1",
        "brandName": "Persisted",
        "productName": "Persisted Tint",
        "category": "lip",
        "imageUrl": "https://cdn.example.com/tint.png",
        "purchaseUrl": "https://shop.example.com/tint",
        "priceKrw": 19000,
      }
    }


@pytest.mark.asyncio
async def test_auradin_like_resolver_queries_owner_bound_postgres_session() -> None:
  clear_sessions()
  db = _AuradinSessionDatabase()
  resolved = await resolve_auradin_result_product(
    owner_subject="postgres-owner",
    product_id="postgres-product-1",
    settings=Settings(
      database_url=None,
      auradin_session_store="postgres",
      legacy_naver_product_search=False,
    ),
    db=db,  # type: ignore[arg-type]
  )
  assert resolved is not None
  assert resolved["id"] == "postgres-product-1"
  assert db.fetchrow_args is not None
  assert db.fetchrow_args[1] == ("postgres-owner", "postgres-product-1")
  assert "session.state->>'ownerSubject'=$1" in db.fetchrow_args[0]


def test_production_safe_auradin_uses_packaged_catalog_when_trusted_feed_is_empty() -> None:
  clear_sessions()
  client = TestClient(
    create_app(
      Settings(
        database_url=None,
        legacy_naver_product_search=False,
        auradin_live_discovery_enabled=True,
      )
    )
  )

  created = client.post("/api/search/sessions", json={"prompt": "올리브영 매트 립"})
  assert created.status_code == 200
  session_id = created.json()["data"]["sessionId"]
  turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]

  assert turn["phase"] == "results"
  assert turn["result"]["products"]
  assert {product["externalSource"] for product in turn["result"]["products"]} == {"auradin_catalog"}


def test_question_answer_applied_filter_chips_use_option_labels() -> None:
  """질문 답변으로 생긴 칩은 선택지 한국어 라벨을 써야 한다 — 'priceTier: under_15k' 같은 원시 노출 금지."""
  clear_sessions()
  client = TestClient(create_app(Settings(database_url=None, legacy_naver_product_search=True)))

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
  client = TestClient(create_app(Settings(database_url=None, legacy_naver_product_search=True)))

  created = client.post("/api/search/sessions", json={"prompt": "립 추천해줘"})
  session_id = created.json()["data"]["sessionId"]
  question = client.get(f"/api/search/sessions/{session_id}").json()["data"]["question"]

  cancelled = client.post(f"/api/search/sessions/{session_id}/cancel")
  assert cancelled.status_code == 200
  assert cancelled.json()["data"]["phase"] == "cancelled"

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
  client = TestClient(create_app(Settings(database_url=None, legacy_naver_product_search=True)))

  # base/brow/liner은 서빙 대상으로 열렸다 — 향수/네일/스킨케어/헤어만 범위 밖.
  created = client.post("/api/search/sessions", json={"prompt": "향수 추천해줘"})
  session_id = created.json()["data"]["sessionId"]
  turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]

  assert turn["phase"] == "failed"
  assert turn["error"]["code"] == "unsupported_category"
  assert turn["error"]["recoverable"] is True


def test_search_session_rejects_sensitive_context_and_oversized_prompts() -> None:
  clear_sessions()
  client = TestClient(create_app(Settings(database_url=None, legacy_naver_product_search=True)))

  sensitive = client.post(
    "/api/search/sessions",
    json={"prompt": "립 추천", "context": {"faceLandmarks": [1, 2, 3]}},
  )
  assert sensitive.status_code == 422
  assert sensitive.json()["error"]["code"] == "INVALID_SEARCH_CONTEXT"

  oversized = client.post(
    "/api/search/sessions",
    json={"prompt": "립" * 501},
  )
  assert oversized.status_code == 422
  assert oversized.json()["error"]["code"] == "SEARCH_PROMPT_TOO_LONG"
