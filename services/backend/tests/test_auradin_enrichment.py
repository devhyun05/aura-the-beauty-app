"""§11 6/7단계 enrich 계약 — 라이브 Naver 발견 슬롯(헤지 근거) + Bedrock reasonCopy(발명 금지·폴백)."""

import json

from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app
from app.services.auradin_agent import enrichment
from app.services.auradin_agent.enrichment import (
  BedrockReasonCopyClient,
  copy_is_faithful,
  fallback_copy,
)
from app.services.auradin_agent.session_manager import clear_sessions


PRODUCT = {
  "id": "auradin-mvp-test",
  "brandName": "클리오",
  "productName": "프로 아이 팔레트",
  "shadeName": "",
  "category": "shadow",
  "tags": ["아이섀도우", "쉬머"],
  "reason": {
    "matchedOn": ["아이섀도우", "20,000원 이하"],
    "inferred": ["쉬머 단서"],
    "caveat": ["색·마감은 제품명·옵션 단서 기반이라 확정 아님"],
  },
}


def _client(**settings_overrides) -> TestClient:
  clear_sessions()
  settings_overrides.setdefault("legacy_naver_product_search", True)
  return TestClient(create_app(Settings(database_url=None, **settings_overrides)))


def _results(client: TestClient, prompt: str) -> dict:
  created = client.post("/api/search/sessions", json={"prompt": prompt})
  assert created.status_code == 200
  session_id = created.json()["data"]["sessionId"]
  turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]
  # 질문이 나오면 '상관 없어요'(noop)로 통과 — 하드 조건은 그대로 유지된 채 결과로.
  for _ in range(4):
    if turn["phase"] != "question":
      break
    question = turn["question"]
    option = question["options"][-1]
    client.post(
      f"/api/search/sessions/{session_id}/answer",
      json={"questionId": question["id"], "optionId": option["id"]},
    )
    turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]
  assert turn["phase"] == "results", turn.get("error")
  return session_id, turn


def _naver_item(
  *,
  product_id: str,
  title: str,
  brand: str,
  lprice: str,
  category3: str = "아이섀도",
) -> dict:
  return {
    "title": f"<b>{title}</b>",
    "link": f"https://smartstore.naver.com/item/{product_id}",
    "image": f"https://shopping-phinf.pstatic.net/{product_id}.jpg",
    "lprice": lprice,
    "productId": product_id,
    "brand": brand,
    "maker": brand,
    "mallName": f"{brand} 스토어",
    "category1": "화장품/미용",
    "category2": "색조메이크업",
    "category3": category3,
    "category4": "",
  }


# ---------------------------------------------------------------------------
# copy_is_faithful / fallback_copy — §9 카피 게이트 단위 검증
# ---------------------------------------------------------------------------


def test_copy_faithful_when_only_structured_reason_is_used() -> None:
  assert copy_is_faithful("아이섀도우 조건에 맞고, 쉬머 계열로 보여요. 톤은 확정이 아니에요.", PRODUCT)


def test_copy_rejected_on_banned_claim_terms() -> None:
  assert not copy_is_faithful("공식 매장 제품이에요", PRODUCT)
  assert not copy_is_faithful("정확한 호수까지 매칭했어요", PRODUCT)
  assert not copy_is_faithful("퍼스널컬러 매칭 확정!", PRODUCT)


def test_copy_rejected_on_invented_attribute_label() -> None:
  # '버건디'는 구조화 근거·태그·제품명 어디에도 없다 → 발명 → 폐기 (§9).
  assert not copy_is_faithful("버건디 컬러가 잘 어울려요", PRODUCT)
  # '매트'도 이 제품 근거엔 없다 (쉬머 제품).
  assert not copy_is_faithful("매트 마감이라 데일리로 좋아요", PRODUCT)


def test_fallback_copy_joins_matched_on() -> None:
  assert fallback_copy(PRODUCT) == "아이섀도우 · 20,000원 이하"


# ---------------------------------------------------------------------------
# 서빙 경로 — 자격증명 없으면 graceful fallback (턴키)
# ---------------------------------------------------------------------------


def test_no_credentials_serves_fallback_copy_and_curated_only() -> None:
  client = _client()
  _, turn = _results(client, "글리터 추천해줘")
  assert turn["phase"] == "results"

  enrichment_status = turn["result"]["enrichment"]
  assert enrichment_status["liveDiscovery"]["status"] == "no_credentials"
  assert enrichment_status["reasonCopy"]["backend"] == "fallback"

  for product in turn["result"]["products"]:
    assert product["source"] == "curated"
    assert product["reasonCopy"]  # reasonCopy는 항상 존재 (§6 가산 계약)
    assert product["reasonCopySource"] == "fallback"
    assert product["reasonCopy"] == " · ".join(product["reason"]["matchedOn"])


# ---------------------------------------------------------------------------
# 2a. 라이브 Naver 발견 슬롯 — 헤지 근거 + 하드 조건 준수 (§2/§9)
# ---------------------------------------------------------------------------


def _patch_naver(monkeypatch, items, calls=None):
  async def fake_fetch(settings, query, *, display=20):
    if calls is not None:
      calls.append(query)
    return items

  monkeypatch.setattr(enrichment, "_fetch_raw_naver_items", fake_fetch)


def test_live_discovery_replaces_slot_with_hedged_naver_pick(monkeypatch) -> None:
  calls: list[str] = []
  _patch_naver(
    monkeypatch,
    [
      _naver_item(product_id="1001", title="페리페라 올테이크 무드 팔레트 쉬머", brand="페리페라", lprice="18000"),
      _naver_item(product_id="1002", title="어메이징브랜드 글리터 섀도우", brand="듣도못한브랜드", lprice="9000"),
      _naver_item(product_id="1003", title="클리오 프로 아이 팔레트 기획 세트", brand="클리오", lprice="21000"),
    ],
    calls,
  )
  client = _client(
    naver_shopping_client_id="test-id",
    naver_shopping_client_secret="test-secret",
  )
  session_id, turn = _results(client, "2만원 이하 글리터 추천해줘")
  assert turn["phase"] == "results"

  live_status = turn["result"]["enrichment"]["liveDiscovery"]
  assert live_status["status"] == "filled"
  assert live_status["pickedId"] == "naver-1001"

  products = turn["result"]["products"]
  discovery = next(p for p in products if p["role"] == "discovery")
  assert discovery["source"] == "live_naver"
  assert discovery["id"] == "naver-1001"
  assert discovery["category"] == "shadow"
  assert 0 < discovery["price"] <= 20000  # §9: 명시 가격 조건은 라이브 후보에도 그대로
  assert discovery["purchaseUrl"].startswith("https://smartstore.naver.com/")
  assert discovery["imageUrl"]

  # §6/§9: 라이브 근거는 헤지 — matchedOn은 검증 가능한 것만, 속성은 전부 inferred 단서.
  reason = discovery["reason"]
  assert set(reason["matchedOn"]) <= {"아이섀도우", "20,000원 이하"}
  assert all(entry.endswith("단서") for entry in reason["inferred"])
  assert any("네이버" in caveat for caveat in reason["caveat"])
  assert any("글리터" in caveat for caveat in reason["caveat"])  # 해석 caveat 관통

  # anchor/diverse는 큐레이션 유지.
  assert [p["source"] for p in products].count("live_naver") == 1

  # dial refine 후에는 같은 라이브 상품을 다시 끼우지 않는다. 캐시 안에 새 적격
  # 라이브 후보가 없으므로 큐레이션 discovery를 유지하며 Naver 재호출도 하지 않는다.
  refined = client.post(f"/api/search/sessions/{session_id}/refine", json={"dial": "more_diverse"})
  assert refined.status_code == 200
  turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]
  assert all(p["source"] == "curated" for p in turn["result"]["products"])
  assert all(p["id"] != "naver-1001" for p in turn["result"]["products"])
  assert len(calls) == 1


def test_refine_uses_next_unseen_live_candidate_from_session_cache(monkeypatch) -> None:
  calls: list[str] = []
  _patch_naver(
    monkeypatch,
    [
      _naver_item(
        product_id="1101",
        title="페리페라 올테이크 무드 팔레트 쉬머",
        brand="페리페라",
        lprice="18000",
      ),
      # 같은 제품의 다른 판매 오퍼 — ID가 달라도 normalized product key
      # 이력으로 다음 refine에서 '새 카드'처럼 재등장하면 안 된다.
      _naver_item(
        product_id="1101-duplicate",
        title="페리페라 올테이크 무드 팔레트 쉬머",
        brand="페리페라",
        lprice="17500",
      ),
      _naver_item(
        product_id="1102",
        title="웨이크메이크 소프트 블러링 아이 팔레트 쉬머",
        brand="웨이크메이크",
        lprice="19000",
      ),
    ],
    calls,
  )
  client = _client(
    naver_shopping_client_id="test-id",
    naver_shopping_client_secret="test-secret",
  )
  session_id, turn = _results(client, "2만원 이하 글리터 추천해줘")
  first_live = next(product for product in turn["result"]["products"] if product["source"] == "live_naver")

  refined = client.post(
    f"/api/search/sessions/{session_id}/refine",
    json={"dial": "more_diverse"},
  )
  assert refined.status_code == 200
  turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]
  second_live = next(product for product in turn["result"]["products"] if product["source"] == "live_naver")

  assert second_live["id"] != first_live["id"]
  assert {first_live["id"], second_live["id"]} == {"naver-1101", "naver-1102"}
  assert second_live["id"] != "naver-1101-duplicate"
  assert len(calls) == 1  # 두 번째 후보도 첫 응답의 세션 캐시에서 선택


def test_live_discovery_fills_multiple_slots_and_dedupes(monkeypatch) -> None:
  """큐레이션이 얇으면(<3) 남는 Top3 슬롯을 라이브로 마저 채운다 + 같은 상품명은 하나만 (#7).

  '5천원 이하 라이너'는 채널 잠금이 없어(라이브 naver 채널 통과 가능) 큐레이션 1개만 나오는 얇은 질의.
  """
  _patch_naver(
    monkeypatch,
    [
      _naver_item(product_id="3001", title="클리오 샤프소 젤 라이너 다크브라운", brand="클리오", lprice="4500", category3="아이라이너"),
      _naver_item(product_id="3002", title="페리페라 잉크 더 라이너 블랙", brand="페리페라", lprice="3900", category3="아이라이너"),
      # 3002와 동일 상품명(다른 리스팅·가격) → 이름 중복 제거로 하나만 채택.
      _naver_item(product_id="3003", title="페리페라 잉크 더 라이너 블랙", brand="페리페라", lprice="4100", category3="아이라이너"),
      # 가격 초과 → §9 하드조건은 라이브에도 그대로 적용되어 제외.
      _naver_item(product_id="3004", title="클리오 워터프루프 펜 라이너 롱래스팅", brand="클리오", lprice="9000", category3="아이라이너"),
    ],
  )
  client = _client(
    naver_shopping_client_id="test-id",
    naver_shopping_client_secret="test-secret",
  )
  _, turn = _results(client, "5천원 이하 라이너")
  assert turn["phase"] == "results"

  live_status = turn["result"]["enrichment"]["liveDiscovery"]
  assert live_status["status"] == "filled"
  assert live_status["filledCount"] == 2  # 큐레이션 1 + 라이브 2 = Top3

  products = turn["result"]["products"]
  assert len(products) == 3
  assert [p["role"] for p in products] == ["anchor", "diverse", "discovery"]

  live_ids = {p["id"] for p in products if p["source"] == "live_naver"}
  assert len(live_ids) == 2
  assert "naver-3001" in live_ids  # 서로 다른 상품은 채워진다
  assert "naver-3004" not in live_ids  # §9: 가격 하드조건은 라이브에도 그대로
  # 같은 상품명(3002·3003) 중 정확히 하나만 — 조용한 중복 없음.
  assert len({"naver-3002", "naver-3003"} & live_ids) == 1

  for product in products:  # 라이브·큐레이션 모두 구매가능 + 가격 조건 준수
    assert product["imageUrl"] and product["purchaseUrl"] and product["price"] > 0
    assert product["price"] <= 5000


def test_live_discovery_no_match_keeps_curated(monkeypatch) -> None:
  # 전부 가격 초과 → §9 조용한 완화 금지: 교체하지 않고 큐레이션 발견 유지(폴백).
  _patch_naver(
    monkeypatch,
    [_naver_item(product_id="2001", title="페리페라 팔레트", brand="페리페라", lprice="99000")],
  )
  client = _client(
    naver_shopping_client_id="test-id",
    naver_shopping_client_secret="test-secret",
  )
  _, turn = _results(client, "2만원 이하 글리터 추천해줘")
  assert turn["result"]["enrichment"]["liveDiscovery"]["status"] == "no_match"
  assert all(p["source"] == "curated" for p in turn["result"]["products"])


def test_live_discovery_disabled_never_calls_naver(monkeypatch) -> None:
  called = []
  _patch_naver(monkeypatch, [], called)
  client = _client(
    naver_shopping_client_id="test-id",
    naver_shopping_client_secret="test-secret",
    auradin_live_discovery_enabled=False,
  )
  _, turn = _results(client, "글리터 추천해줘")
  assert turn["result"]["enrichment"]["liveDiscovery"]["status"] == "disabled"
  assert not called


# ---------------------------------------------------------------------------
# 2b. Bedrock reasonCopy — 가드레일 인라인 + 충실성 게이트 (§6/§9)
# ---------------------------------------------------------------------------


class FakeBedrockBody:
  def __init__(self, payload: dict) -> None:
    self._payload = payload

  def read(self) -> bytes:
    return json.dumps(self._payload, ensure_ascii=False).encode("utf-8")


class FakeBedrockRuntime:
  def __init__(self, copy_text: str) -> None:
    self.copy_text = copy_text
    self.invocations: list[dict] = []

  def invoke_model(self, **kwargs):
    self.invocations.append(kwargs)
    return {
      "body": FakeBedrockBody(
        {"content": [{"type": "text", "text": json.dumps({"reasonCopy": self.copy_text}, ensure_ascii=False)}]},
      ),
    }


def _patch_bedrock(monkeypatch, fake: FakeBedrockRuntime) -> None:
  monkeypatch.setattr(BedrockReasonCopyClient, "_bedrock_runtime_client", lambda self: fake)


def test_bedrock_copy_attaches_guardrail_kwargs_inline(monkeypatch) -> None:
  fake = FakeBedrockRuntime("조건에 맞는 제품이에요. 자세한 근거는 카드에서 확인할 수 있어요.")
  _patch_bedrock(monkeypatch, fake)
  client = _client(
    aws_access_key_id="test-key",
    aws_secret_access_key="test-secret",
    bedrock_guardrail_id="gr-test",
    bedrock_guardrail_version="1",
  )
  _, turn = _results(client, "글리터 추천해줘")

  status = turn["result"]["enrichment"]["reasonCopy"]
  assert status["backend"] == "bedrock"
  assert status["generated"] == len(turn["result"]["products"])
  for product in turn["result"]["products"]:
    assert product["reasonCopySource"] == "bedrock"
    assert product["reasonCopy"] == fake.copy_text

  # §11 "가드레일은 LLM 통합에 내장" — invoke_model에 인라인 splat.
  assert fake.invocations
  for invocation in fake.invocations:
    assert invocation["guardrailIdentifier"] == "gr-test"
    assert invocation["guardrailVersion"] == "1"
    # §9: 프롬프트 입력은 구조화 근거·읽기 전용 제품 정보만.
    body = json.loads(invocation["body"])
    assert "matchedOn" in body["messages"][0]["content"][0]["text"]


def test_unfaithful_bedrock_copy_falls_back_to_structured_reason(monkeypatch) -> None:
  fake = FakeBedrockRuntime("공식 매장에서 파는 정확한 호수예요")  # §9 금지 표현
  _patch_bedrock(monkeypatch, fake)
  client = _client(aws_access_key_id="test-key", aws_secret_access_key="test-secret")
  _, turn = _results(client, "글리터 추천해줘")

  for product in turn["result"]["products"]:
    assert product["reasonCopySource"] == "fallback"
    assert product["reasonCopy"] == " · ".join(product["reason"]["matchedOn"])
  assert turn["result"]["enrichment"]["reasonCopy"]["generated"] == 0
