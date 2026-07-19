import pytest

from app.core.settings import Settings
from app.services import makeup_recommendation as makeup_service
from app.services import makeup_recommendation_products as product_service
from app.services import shopping_products as shopping_service


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
    calls.append({
      "category": category,
      "legacyNaverEnabled": _settings.legacy_naver_product_search,
      "embeddingModel": _settings.effective_embedding_model_id,
      **kwargs,
    })
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
    Settings(legacy_naver_product_search=True),
    recommendation,
    context,
    answers,
  )

  assert len(calls) == 15
  assert {call["category"] for call in calls} == {"base", "brow", "shadow", "cheek", "lip"}
  assert all(call["legacyNaverEnabled"] is False for call in calls)
  assert all(call["embeddingModel"] == "" for call in calls)
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


@pytest.mark.parametrize(
  "source",
  ["database", "database_matched_semantic", "auradin_catalog", "auradin_catalog_matched_semantic"],
)
def test_makeup_product_source_allowlist_accepts_only_server_catalogs(source: str) -> None:
  assert product_service._is_trusted_product_source(source) is True
  assert product_service._is_trusted_product_source("naver_shopping") is False
  assert product_service._is_trusted_product_source("fallback") is False


@pytest.mark.parametrize(
  ("field", "value"),
  [
    ("imageUrl", None),
    ("imageUrl", "javascript:alert(1)"),
    ("purchaseUrl", None),
    ("purchaseUrl", "http://shop.example.com/product"),
  ],
)
def test_makeup_product_mapping_requires_https_image_and_purchase_urls(
  field: str,
  value: str | None,
) -> None:
  product = {
    "id": "catalog-lip",
    "brandName": "Verified Brand",
    "productName": "Verified Lip",
    "imageUrl": "https://cdn.example.com/lip.png",
    "purchaseUrl": "https://shop.example.com/lip",
  }
  product[field] = value
  assert product_service._map_product(product, "lip", {}) is None


@pytest.mark.asyncio
async def test_product_enrichment_discards_untrusted_live_search_products(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def fake_build(_db, catalog_settings, _category, **_kwargs):
    assert catalog_settings.legacy_naver_product_search is False
    return ({
      "products": [{
        "id": "live-result",
        "brandName": "Request-time result",
        "productName": "Must not be saved",
        "imageUrl": "https://cdn.example.com/live.png",
        "purchaseUrl": "https://shop.example.com/live",
      }],
    }, "naver_shopping")

  monkeypatch.setattr(product_service, "build_product_recommendation_data", fake_build)
  recommendation = makeup_service.deterministic_recommendation_v2(
    {"selection": {"situation": {"label": "Daily"}}},
    [],
  )
  enriched = await product_service.enrich_makeup_recommendation_products(
    object(), Settings(), recommendation, {}, [],
  )

  assert all(
    guide["products"] == []
    for look in enriched["looks"]
    for guide in look["areaGuides"]
  )


def _make_area_product_profile(
  answer: dict | None = None,
  questions: list[dict] | None = None,
  *,
  personal_color_usable: bool = True,
) -> dict:
  personal_color = (
    {
      "usable": True,
      "tone": {"topLabel": "\uc5ec\ub984 \ub77c\uc774\ud2b8"},
      "axes": {"temperature": {"label": "\ucfe8"}},
      "bestPalettes": [{
        "label": "\ucfe8 \ub77c\uc774\ud2b8 \ubba4\ud2b8",
        "exemplars": ["\ub85c\uc988"],
      }],
    }
    if personal_color_usable
    else {"usable": False}
  )
  context = {
    "analysisReport": {
      "personalColor": "\uc5ec\ub984 \ucfe8",
      "skinType": "\uac74\uc131",
      "measurementInsights": {"personalColor": personal_color},
    },
    "selection": {"situation": {"label": "\uba74\uc811"}},
  }
  look = {"title": "Clean look", "summary": "Polished"}
  guide = {
    "label": "\ub9bd",
    "goal": "\ucc28\ubd84\ud55c \ud608\uc0c9",
    "color": {"name": "\ub85c\uc988", "hex": "#AA6677"},
    "texture": "\uc0c8\ud2f4",
    "applicationPlan": {
      "steps": [{
        "productType": "\ub9bd \ud2f4\ud2b8",
        "colors": [{"role": "\ud3ec\uc778\ud2b8", "name": "\ub85c\uc988", "hex": "#AA6677"}],
      }],
    },
  }
  return product_service._build_product_profile(
    context,
    [answer] if answer else [],
    look,
    guide,
    questions,
  )


def _fully_matching_specs(*, include_context_features: bool = True) -> dict:
  return {
    "colors": ["\ub85c\uc988"],
    "effects": ["\uc0c8\ud2f4"],
    "features": ["\ub871\ub798\uc2a4\ud305", "\ubc00\ucc29"] if include_context_features else [],
    "productTypes": ["\ub9bd\ud2f4\ud2b8"],
    "skinTypes": ["\uac74\uc131"],
    "tones": ["\ucfe8\ud1a4"],
  }


@pytest.mark.parametrize(
  ("answer", "questions"),
  [
    ({"label": "\ub871\ub798\uc2a4\ud305"}, []),
    ({"optionLabel": "\ub871\ub798\uc2a4\ud305"}, []),
    (
      {"questionId": "lasting", "optionId": "long"},
      [{
        "id": "lasting",
        "options": [{"id": "long", "label": "\ub871\ub798\uc2a4\ud305"}],
      }],
    ),
  ],
)
def test_product_profile_normalizes_answer_shapes_and_answer_score(
  answer: dict,
  questions: list[dict],
) -> None:
  answer = {**answer, "additionalConstraints": "\ubc00\ucc29"}
  profile = _make_area_product_profile(answer, questions)
  without_answer = _make_area_product_profile()

  assert profile["matchSignals"]["context"]["answers"] == [
    "\ub871\ub798\uc2a4\ud305",
    "\ubc00\ucc29",
  ]
  with_score, matched = shopping_service._score_product_match(
    _fully_matching_specs(), "lip", 0, profile,
  )
  without_score, _ = shopping_service._score_product_match(
    _fully_matching_specs(), "lip", 0, without_answer,
  )

  assert with_score == 95
  assert without_score == 89
  assert with_score - without_score == shopping_service.MAKEUP_AREA_MATCH_WEIGHTS[
    "situationAnswers"
  ]
  assert "\uc0c1\ud669\u00b7\ub2f5\ubcc0: \ub871\ub798\uc2a4\ud305" in matched


def test_product_score_uses_only_quality_gated_personal_color() -> None:
  usable_profile = _make_area_product_profile()
  blocked_profile = _make_area_product_profile(personal_color_usable=False)
  specs = _fully_matching_specs(include_context_features=False)

  usable_score, _ = shopping_service._score_product_match(specs, "lip", 0, usable_profile)
  blocked_score, _ = shopping_service._score_product_match(specs, "lip", 0, blocked_profile)

  assert usable_profile["matchSignals"]["personalColor"]["usable"] is True
  assert blocked_profile["matchSignals"]["personalColor"] == {
    "usable": False,
    "terms": [],
  }
  assert usable_score - blocked_score == shopping_service.MAKEUP_AREA_MATCH_WEIGHTS[
    "personalColor"
  ]


def test_recipe_evidence_dominates_context_only_product() -> None:
  profile = _make_area_product_profile(
    {"label": "\ub871\ub798\uc2a4\ud305"},
    personal_color_usable=False,
  )
  recipe_only = {
    "colors": ["\ub85c\uc988"],
    "effects": ["\uc0c8\ud2f4"],
    "features": [],
    "productTypes": ["\ub9bd\ud2f4\ud2b8"],
    "skinTypes": [],
    "tones": [],
  }
  context_only = {
    "colors": [],
    "effects": [],
    "features": ["\ub871\ub798\uc2a4\ud305"],
    "productTypes": [],
    "skinTypes": [],
    "tones": [],
  }

  recipe_score, recipe_evidence = shopping_service._score_product_match(
    recipe_only, "lip", 0, profile,
  )
  context_score, _ = shopping_service._score_product_match(
    context_only, "lip", 0, profile,
  )

  assert shopping_service.MAKEUP_AREA_MATCH_WEIGHTS == {
    "recipeColors": 22,
    "recipeProductType": 16,
    "recipeFinish": 12,
    "personalColor": 8,
    "skinType": 6,
    "situationAnswers": 6,
  }
  assert recipe_score == 75
  assert context_score == 31
  assert recipe_score > context_score
  assert "\ub808\uc2dc\ud53c \uc0c9\uc0c1: \ub85c\uc988" in recipe_evidence
  assert "\uc81c\ud488 \uc720\ud615: \ub9bd\ud2f4\ud2b8" in recipe_evidence
  assert "\ub808\uc2dc\ud53c \uc9c8\uac10: \uc0c8\ud2f4" in recipe_evidence


def test_structured_db_score_and_reason_override_stale_catalog_values() -> None:
  profile = _make_area_product_profile({
    "label": "\ub871\ub798\uc2a4\ud305",
    "additionalConstraints": "\ubc00\ucc29",
  })
  row = {
    "id": "verified-lip",
    "category": "lip",
    "brand_name": "Verified Brand",
    "product_name": "\ub85c\uc988 \uc0c8\ud2f4 \ub9bd\ud2f4\ud2b8 \ucfe8\ud1a4 \ub871\ub798\uc2a4\ud305",
    "shade_name": "\ub85c\uc988",
    "tags": [],
    "palette": ["#AA6677"],
    "price_krw": 23000,
    "trusted_image_url": "https://cdn.example.com/lip.png",
    "trusted_purchase_url": "https://shop.example.com/lip",
    "product_payload": {
      "matchRate": 40,
      "reason": "stale catalog reason",
      "colors": ["\ub85c\uc988"],
      "effects": ["\uc0c8\ud2f4"],
      "features": ["\ub871\ub798\uc2a4\ud305", "\ubc00\ucc29"],
      "skinTypes": ["\uac74\uc131"],
    },
  }

  product = shopping_service._map_db_product(row, 0, profile)

  assert product is not None
  assert product["matchRate"] == 95
  assert product["reason"] != "stale catalog reason"
  assert "\ucd94\ucc9c \ub808\uc2dc\ud53c \uae30\uc900\uc73c\ub85c" in product["reason"]
  assert "\ub808\uc2dc\ud53c \uc0c9\uc0c1: \ub85c\uc988" in product["reason"]


@pytest.mark.asyncio
async def test_disabled_semantic_scoring_preserves_structured_recipe_order() -> None:
  products = [
    {"id": "recipe", "category": "lip", "matchRate": 95},
    {"id": "context", "category": "lip", "matchRate": 31},
  ]
  ranked, applied = await shopping_service._apply_semantic_product_scores(
    products,
    Settings(bedrock_embedding_model_id=None),
    _make_area_product_profile(),
  )

  assert applied is False
  assert [product["id"] for product in ranked] == ["recipe", "context"]
  recipe_with_bad_semantic = shopping_service._combine_match_rate(
    95, 0, semantic_weight=shopping_service.STRUCTURED_SEMANTIC_MATCH_WEIGHT,
    minimum=20,
  )
  context_with_good_semantic = shopping_service._combine_match_rate(
    31, 100, semantic_weight=shopping_service.STRUCTURED_SEMANTIC_MATCH_WEIGHT,
    minimum=20,
  )
  assert recipe_with_bad_semantic > context_with_good_semantic
  assert context_with_good_semantic == 38
  assert context_with_good_semantic < 62
  structured_reason = "\ucd94\ucc9c \ub808\uc2dc\ud53c \uadfc\uac70"
  semantic_reason = shopping_service._semantic_reason(
    {"reason": structured_reason}, 90,
  )
  assert semantic_reason.startswith(structured_reason)
  assert "\ucd94\ucc9c \ub808\uc2dc\ud53c\uc640 \uc0c1\ud488 \uc815\ubcf4\uc758 \uc758\ubbf8 \uc720\uc0ac\ub3c4" in semantic_reason
