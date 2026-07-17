import pytest

from app.core.settings import Settings
from app.services import makeup_recommendation as makeup_service
from app.services import makeup_recommendation_products as product_service


def test_bedrock_converse_uses_configured_aws_profile(monkeypatch: pytest.MonkeyPatch) -> None:
  calls: dict = {}

  class FakeClient:
    def converse_stream(self, **kwargs):
      calls["request"] = kwargs
      return {"stream": [{"contentBlockDelta": {"delta": {"text": '{"ok":true}'}}}]}

  class FakeSession:
    def client(self, service_name, **kwargs):
      calls["service"] = service_name
      calls["client_kwargs"] = kwargs
      return FakeClient()

  def fake_session(*, profile_name):
    calls["profile"] = profile_name
    return FakeSession()

  monkeypatch.setattr(makeup_service.boto3, "Session", fake_session)
  result = makeup_service._converse(
    Settings(aws_profile_name="aura-dev"),
    "test-model",
    "system",
    "prompt",
  )

  assert result == {"ok": True}
  assert calls["profile"] == "aura-dev"
  assert calls["service"] == "bedrock-runtime"
  assert calls["request"]["modelId"] == "test-model"


@pytest.mark.asyncio
async def test_product_enrichment_attaches_verified_products_to_every_area(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: list[dict] = []

  async def fake_build(_db, _settings, category, **kwargs):
    calls.append({"category": category, **kwargs})
    return ({
      "products": [{
        "id": f"catalog-{category}",
        "brandName": "Verified Brand",
        "productName": f"Verified {category}",
        "shadeName": "Rose",
        "price": 23000,
        "imageUrl": "https://cdn.example.com/product.png",
        "purchaseUrl": "https://shop.example.com/product",
        "matchRate": 91,
        "reason": "Generated area profile match",
      }, {
        "id": f"catalog-{category}-second",
        "brandName": "Second Brand",
        "productName": f"Second {category}",
        "reason": "Should be capped",
      }],
    }, "database_matched")

  monkeypatch.setattr(product_service, "build_product_recommendation_data", fake_build)
  context = {
    "analysisReport": {"personalColor": "spring warm", "skinType": "combination"},
    "selection": {
      "situation": {"key": "daily", "label": "Daily"},
      "keyword": {"label": "Office", "tags": ["clean"]},
    },
  }
  answers = [{"questionId": "impression", "optionLabel": "Fresh and polished"}]
  recommendation = makeup_service.deterministic_recommendation_v2(context, answers)

  enriched = await product_service.enrich_makeup_recommendation_products(
    object(),
    Settings(),
    recommendation,
    context,
    answers,
  )

  assert len(calls) == 15
  assert {call["category"] for call in calls} == {"base", "brow", "shadow", "cheek", "lip"}
  assert all(call["profile_override"]["summary"] for call in calls)
  assert all(
    len(guide["products"]) == 1
    for look in enriched["looks"]
    for guide in look["areaGuides"]
  )
  product = enriched["looks"][0]["areaGuides"][0]["products"][0]
  assert product["id"].startswith("catalog-")
  assert product["imageUrl"] == "https://cdn.example.com/product.png"
  assert product["purchaseUrl"] == "https://shop.example.com/product"
  assert product["matchRate"] == 91
