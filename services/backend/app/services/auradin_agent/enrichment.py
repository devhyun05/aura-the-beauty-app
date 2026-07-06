"""§11 6/7단계 — 비동기 enrich: 라이브 Naver 발견 슬롯(§2 Tier2) + Bedrock reasonCopy(§6).

랭킹(§5)은 순수·동기·테스트 가능하게 유지하고, 이 모듈은 `*_persisted` 세션 레이어에서
`_advance` 뒤 `phase=="results"`일 때 `state["result"]["products"]`를 **가산** 수정한다.

§9 정직성 불변식 (하드 룰):
- LLM은 후보/필터/속성을 발명하지 않는다 — 구조화 `reason`이 권위값, LLM은 카피 재작성만.
  발명·금지표현이 감지되면(`copy_is_faithful`) 카피를 버리고 matchedOn join으로 폴백.
- Naver 발견 카드는 하드 조건(`matches_filter`)을 그대로 통과해야 하고, 속성은 전부
  제목 추론(hardFilterEligible=False) → 근거가 자동으로 헤지(inferred/caveat)된다.
- 자격증명이 없으면 조용히 skip (턴키: 있으면 자동 ON, 없으면 graceful fallback).
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from datetime import UTC, datetime
from typing import Any

import httpx

from app.core.settings import Settings
from app.services.auradin_catalog.candidate_normalizer import normalize_naver_item
from app.services.auradin_catalog.metadata_extractor import infer_title_metadata
from app.services.bedrock_guardrails import build_bedrock_guardrail_invoke_kwargs

from .knowledge_chunk_builder import build_mvp_catalog_item
from .ranking import ATTRIBUTE_LABELS, CATEGORY_LABELS, rank_candidates, to_result_product
from .retrieval_service import matches_filter


logger = logging.getLogger(__name__)

LIVE_NAVER_CAVEAT = "네이버 쇼핑 실시간 검색 결과이며 브랜드 공식 정보가 아닐 수 있어요"
# §9: 결과 카피 금지 표현 — 감지 시 해당 카피 폐기(구조화 근거는 그대로 서빙).
BANNED_COPY_TERMS = ("공식", "정확한 호수", "퍼스널컬러 매칭 확정", "퍼스널컬러 확정", "100%")
MAX_COPY_LENGTH = 220
COPY_CACHE_LIMIT = 30

# 발견 슬롯 Naver 검색어의 카테고리 축 (shopping_products.CATEGORY_CONFIG 질의 미러)
CATEGORY_SEARCH_TERMS = {"lip": "립 틴트 립스틱", "cheek": "블러셔 치크", "shadow": "아이섀도우 팔레트"}


def _clean(value: Any) -> str:
  return str(value or "").strip()


# ---------------------------------------------------------------------------
# 2b. reasonCopy — 구조화 근거 → 자연 한국어 카피 (가산 필드, §6/§9)
# ---------------------------------------------------------------------------


def _label_vocabulary() -> set[str]:
  labels: set[str] = set()
  for mapping in ATTRIBUTE_LABELS.values():
    labels.update(mapping.values())
  return labels


_LABEL_VOCABULARY = _label_vocabulary()


def copy_is_faithful(copy: str, product: dict[str, Any]) -> bool:
  """§9 카피 충실성 게이트 — 구조화 근거에 없는 속성 라벨·금지 표현이 있으면 False.

  WS3 골든 스위트와 WS5 라이브 신뢰성 하네스가 같은 판정을 재사용한다.
  """
  text = _clean(copy)
  if not text or len(text) > MAX_COPY_LENGTH:
    return False
  if any(term in text for term in BANNED_COPY_TERMS):
    return False

  reason = product.get("reason") if isinstance(product.get("reason"), dict) else {}
  allowed_text = " ".join(
    [
      " ".join(reason.get("matchedOn") or []),
      " ".join(reason.get("inferred") or []),
      " ".join(reason.get("caveat") or []),
      " ".join(product.get("tags") or []),
      _clean(product.get("productName")),
      _clean(product.get("brandName")),
      _clean(product.get("shadeName")),
    ],
  )
  for label in _LABEL_VOCABULARY:
    if label in text and label not in allowed_text:
      return False
  return True


def fallback_copy(product: dict[str, Any]) -> str:
  reason = product.get("reason") if isinstance(product.get("reason"), dict) else {}
  matched = [label for label in reason.get("matchedOn") or [] if _clean(label)]
  return " · ".join(matched) if matched else _clean(product.get("productName"))


def _copy_prompt(product: dict[str, Any]) -> str:
  reason = product.get("reason") if isinstance(product.get("reason"), dict) else {}
  payload = {
    "brandName": product.get("brandName"),
    "productName": product.get("productName"),
    "category": CATEGORY_LABELS.get(_clean(product.get("category")), product.get("category")),
    "priceKrw": product.get("price"),
    "tags": product.get("tags") or [],
    "reason": {
      "matchedOn": reason.get("matchedOn") or [],
      "inferred": reason.get("inferred") or [],
      "caveat": reason.get("caveat") or [],
    },
  }
  return f"""아래는 화장품 추천 카드의 구조화 근거야. 이걸 읽기 좋은 한국어 추천 카피 1~2문장(120자 이내)으로 다시 써.

규칙 (반드시 지켜):
- matchedOn(확정 근거)·inferred(추론 단서)·caveat(한계)에 있는 내용만 사용해. 새로운 속성·색상·효능·브랜드를 만들어내지 마.
- inferred 내용은 "~로 보여요"처럼 추측 표현을 유지하고, 확정처럼 말하지 마.
- "공식", "정확한 호수", "퍼스널컬러 매칭 확정" 같은 보증·확정 표현 금지.
- 존댓말로, 과장 없이.

제품 정보(읽기 전용):
{json.dumps(payload, ensure_ascii=False, indent=2)}

JSON만 반환해: {{"reasonCopy": "..."}}"""


def _extract_output_text(response_payload: dict[str, Any]) -> str:
  # makeup_feedback_conference._extract_output_text 미러 (Claude messages body)
  content = response_payload.get("content")
  if isinstance(content, list):
    return "\n".join(
      str(part.get("text") or "")
      for part in content
      if isinstance(part, dict) and part.get("type") == "text"
    ).strip()
  completion = response_payload.get("completion")
  return completion.strip() if isinstance(completion, str) else ""


def _parse_copy_output(output_text: str) -> str | None:
  normalized = output_text.strip()
  fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", normalized, re.DOTALL)
  if fence_match:
    normalized = fence_match.group(1).strip()
  try:
    parsed = json.loads(normalized)
  except json.JSONDecodeError:
    return None
  if not isinstance(parsed, dict):
    return None
  return _clean(parsed.get("reasonCopy")) or None


class ReasonCopyClient:
  """비활성/자격증명 없음 폴백 — generate가 None이면 호출부가 matchedOn join을 쓴다."""

  backend = "fallback"

  async def generate(self, product: dict[str, Any]) -> str | None:
    return None


class BedrockReasonCopyClient(ReasonCopyClient):
  backend = "bedrock"

  def __init__(self, settings: Settings) -> None:
    self.settings = settings

  def _bedrock_runtime_client(self):
    # makeup_feedback_conference 패턴 — enrich는 서빙 경로라 read timeout을 짧게 잡는다.
    import boto3
    from botocore.config import Config

    client_kwargs: dict[str, Any] = {
      "region_name": self.settings.effective_bedrock_analysis_region,
      "config": Config(connect_timeout=5, read_timeout=15, retries={"max_attempts": 1}),
    }
    if self.settings.aws_access_key_id and self.settings.aws_secret_access_key:
      client_kwargs.update(
        {
          "aws_access_key_id": self.settings.aws_access_key_id,
          "aws_secret_access_key": self.settings.aws_secret_access_key,
        },
      )
    return boto3.client("bedrock-runtime", **client_kwargs)

  def _generate_sync(self, product: dict[str, Any]) -> str | None:
    model_id = self.settings.effective_analysis_model_id
    if not model_id:
      return None

    started_at = time.monotonic()
    response = self._bedrock_runtime_client().invoke_model(
      modelId=model_id,
      body=json.dumps(
        {
          "anthropic_version": "bedrock-2023-05-31",
          "max_tokens": 300,
          "temperature": 0.3,
          "system": "당신은 화장품 추천 근거를 자연스러운 한국어 카피로 다듬는 에디터입니다. 반드시 JSON만 반환합니다.",
          "messages": [
            {"role": "user", "content": [{"type": "text", "text": _copy_prompt(product)}]},
          ],
        },
        ensure_ascii=False,
      ),
      accept="application/json",
      contentType="application/json",
      # §11 6단계: 가드레일은 LLM 통합에 내장 — 미설정이면 빈 dict (턴키).
      **build_bedrock_guardrail_invoke_kwargs(self.settings),
    )
    response_payload = json.loads(response["body"].read())
    if response_payload.get("amazon-bedrock-guardrailAction") == "INTERVENED":
      logger.info("[aura:auradin-copy] guardrail intervened — fallback to structured reason")
      return None
    copy = _parse_copy_output(_extract_output_text(response_payload))
    logger.info(
      "[aura:auradin-copy] generate model=%s durationMs=%s ok=%s",
      model_id,
      round((time.monotonic() - started_at) * 1000),
      bool(copy),
    )
    return copy

  async def generate(self, product: dict[str, Any]) -> str | None:
    try:
      return await asyncio.to_thread(self._generate_sync, product)
    except Exception as exc:  # noqa: BLE001 - enrich 실패는 서빙을 깨지 않는다 (graceful fallback).
      logger.warning("[aura:auradin-copy] generate failed reason=%s", exc.__class__.__name__)
      return None


def build_copy_client(settings: Settings) -> ReasonCopyClient:
  # embedding_client.build_embedding_client 팩토리+fallback 패턴 미러.
  if not settings.auradin_copy_enabled:
    return ReasonCopyClient()
  if settings.analysis_provider != "bedrock":
    return ReasonCopyClient()
  if not settings.effective_analysis_model_id or not settings.aws_credentials_configured:
    return ReasonCopyClient()
  return BedrockReasonCopyClient(settings)


async def _enrich_reason_copy(
  state: dict[str, Any],
  settings: Settings,
  products: list[dict[str, Any]],
) -> dict[str, Any]:
  client = build_copy_client(settings)
  cache = state.setdefault("reasonCopyCache", {})
  status = {"backend": client.backend, "generated": 0, "cached": 0, "fallback": 0}

  missing: list[dict[str, Any]] = []
  for product in products:
    if product.get("reasonCopy"):
      continue
    cached = cache.get(product.get("id"))
    if cached and copy_is_faithful(cached, product):
      product["reasonCopy"] = cached
      product["reasonCopySource"] = "bedrock"
      status["cached"] += 1
    else:
      missing.append(product)

  if client.backend == "bedrock" and missing:
    copies = await asyncio.gather(*(client.generate(product) for product in missing))
    for product, copy in zip(missing, copies):
      if isinstance(copy, str) and copy_is_faithful(copy, product):
        product["reasonCopy"] = copy
        product["reasonCopySource"] = "bedrock"
        cache[product["id"]] = copy
        status["generated"] += 1

  while len(cache) > COPY_CACHE_LIMIT:
    cache.pop(next(iter(cache)))
  return status


def _apply_fallback_copies(state: dict[str, Any]) -> None:
  # reasonCopy는 결과 계약에서 항상 존재 — 비활성/실패/타임아웃이면 matchedOn join (§6).
  result = state.get("result") if isinstance(state.get("result"), dict) else {}
  for product in result.get("products") or []:
    if not product.get("reasonCopy"):
      product["reasonCopy"] = fallback_copy(product)
      product["reasonCopySource"] = "fallback"


# ---------------------------------------------------------------------------
# 2a. 발견 슬롯 라이브 Naver broaden (§2 Tier2 / §5 discovery)
# ---------------------------------------------------------------------------


async def _fetch_raw_naver_items(settings: Settings, query: str, *, display: int = 20) -> list[dict[str, Any]]:
  # shopping_products._fetch_naver_category_products와 같은 API·파라미터 — 원 item이 필요해 직접 호출.
  if not settings.naver_shopping_client_id or not settings.naver_shopping_client_secret:
    return []
  headers = {
    "X-Naver-Client-Id": settings.naver_shopping_client_id,
    "X-Naver-Client-Secret": settings.naver_shopping_client_secret,
  }
  async with httpx.AsyncClient(timeout=4.0) as client:
    response = await client.get(
      "https://openapi.naver.com/v1/search/shop.json",
      headers=headers,
      params={
        "display": display,
        "exclude": "used:rental:cbshop",
        "filter": "naverpay",
        "query": query,
        "sort": "sim",
        "start": 1,
      },
    )
    response.raise_for_status()
    items = response.json().get("items")
    return items if isinstance(items, list) else []


def _discovery_query(state: dict[str, Any], category: str) -> str:
  parts = [CATEGORY_SEARCH_TERMS.get(category, "화장품")]
  for preference in state.get("softPreferences") or []:
    attribute = _clean(preference.get("attribute"))
    values = preference.get("values") or []
    if attribute in {"colorFamily", "finish", "texture"} and values:
      label = ATTRIBUTE_LABELS.get(attribute, {}).get(_clean(values[0]))
      if label and label not in parts:
        parts.append(label)
  return " ".join(parts[:4])


def _needs_live_discovery(result: dict[str, Any], settings: Settings) -> tuple[bool, str]:
  """§2: Tier1이 얇을 때만 broaden — assign_roles 폴백(전부 같은 브랜드) 조건 재사용."""
  products = result.get("products") or []
  if not products:
    return False, "no_products"
  if any(product.get("source") == "live_naver" for product in products):
    return False, "already_live"
  if len(products) < 3:
    return True, "missing_discovery_slot"
  anchor_brand = _clean(products[0].get("brandName"))
  discovery = next((p for p in products if p.get("role") == "discovery"), None)
  if discovery is not None and _clean(discovery.get("brandName")) == anchor_brand:
    return True, "discovery_brand_fallback"
  floor_count = int((result.get("diagnostics") or {}).get("floorCount") or 0)
  if floor_count < int(settings.auradin_live_discovery_min_pool):
    return True, "thin_floor_pool"
  return False, "curated_breadth_ok"


def _live_catalog_item(
  raw_item: dict[str, Any],
  *,
  query: str,
  query_rank: int,
  category: str,
  collected_at: str,
) -> dict[str, Any] | None:
  candidate, _reject = normalize_naver_item(
    raw_item,
    collected_at=collected_at,
    query=query,
    query_rank=query_rank,
    requested_category=category,
  )
  if not candidate:
    return None

  metadata, evidence, confidence = infer_title_metadata(
    title=candidate["rawTitle"],
    category=candidate["category"],
    source_url=candidate["link"],
  )
  attributes = {
    field: metadata.get(field)
    for field in ("colorFamily", "undertone", "intensity", "finish", "texture")
    if metadata.get(field)
  }
  shade_options = (
    [{"shadeName": metadata["shadeName"], "shadeSource": "title_inferred"}]
    if metadata.get("shadeName")
    else []
  )
  seed = {
    "catalogItemId": candidate["id"],  # naver-* id 유지 — live 항목임이 id에서도 드러난다
    "sourceCandidateId": candidate["id"],
    "sourceGrain": "live_naver_discovery",
    "brandName": candidate["brandNormalized"],
    "productName": candidate["title"],
    "rawTitle": candidate["rawTitle"],
    "category": candidate["category"],
    "shadeOptions": shade_options,
    "attributes": attributes,
    "attributeConfidence": confidence,
    # §9: 라이브 항목의 속성은 전부 제목 추론 → hard filter 부적격, 근거는 자동 헤지.
    "hardFilterEligible": {field: False for field in attributes},
    "evidence": evidence,
    "retailPresence": {},
    "liveOffer": {
      "priceKrw": int(candidate["lprice"]),
      "purchaseUrl": candidate["link"],
      "imageUrl": candidate["imageUrl"],
    },
    "collectionStatus": "live",
    "updatedAt": collected_at,
  }
  catalog_item = build_mvp_catalog_item(seed)
  if not catalog_item:
    return None
  if catalog_item.get("qualityFlags"):
    return None  # 세트/리필/미니 등 노이즈 컷
  return catalog_item


async def _enrich_live_discovery(
  state: dict[str, Any],
  settings: Settings,
  result: dict[str, Any],
  extra_caveats: list[str] | None,
) -> dict[str, Any]:
  if not settings.auradin_live_discovery_enabled:
    return {"status": "disabled"}
  if not settings.naver_shopping_client_id or not settings.naver_shopping_client_secret:
    return {"status": "no_credentials"}

  needed, gate_reason = _needs_live_discovery(result, settings)
  if not needed:
    return {"status": "skipped_gate", "gate": gate_reason}

  products = result.get("products") or []
  category = _clean(products[0].get("category")) if products else ""
  if category not in CATEGORY_SEARCH_TERMS:
    return {"status": "unsupported_category", "gate": gate_reason}

  query = _discovery_query(state, category)
  hard_filters = [f for f in state.get("hardFilters") or [] if _clean(f.get("mode")) != "soft"]
  existing_ids = {product.get("id") for product in products}
  anchor_brand = _clean(products[0].get("brandName"))

  cache = state.get("liveDiscoveryCache") if isinstance(state.get("liveDiscoveryCache"), dict) else {}
  if cache.get("query") == query and isinstance(cache.get("items"), list):
    catalog_items = cache["items"]
  else:
    try:
      raw_items = await _fetch_raw_naver_items(settings, query)
    except Exception as exc:  # noqa: BLE001 - 라이브 실패는 큐레이션 결과를 깨지 않는다.
      logger.warning("[aura:auradin-live] naver fetch failed reason=%s", exc.__class__.__name__)
      return {"status": "fetch_error", "gate": gate_reason, "query": query}
    collected_at = datetime.now(UTC).isoformat()
    catalog_items = [
      item
      for rank, raw_item in enumerate(raw_items, start=1)
      if (
        item := _live_catalog_item(
          raw_item,
          query=query,
          query_rank=rank,
          category=category,
          collected_at=collected_at,
        )
      )
    ]
    state["liveDiscoveryCache"] = {"query": query, "items": catalog_items}

  # §9: 명시 하드 조건은 라이브 후보에도 그대로 — 조용한 완화 금지.
  eligible = [
    item
    for item in catalog_items
    if item["id"] not in existing_ids and all(matches_filter(item, f) for f in hard_filters)
  ]
  if not eligible:
    return {"status": "no_match", "gate": gate_reason, "query": query, "fetched": len(catalog_items)}

  ranked = rank_candidates(
    eligible,
    hard_filters=hard_filters,
    soft_preferences=state.get("softPreferences") or [],
  )
  # 발견 슬롯의 결: anchor와 다른 브랜드 우선 (같은 브랜드뿐이면 최상위).
  row = next(
    (r for r in ranked if _clean(r["item"].get("brandName")) != anchor_brand),
    ranked[0],
  )
  caveats = [LIVE_NAVER_CAVEAT, *(extra_caveats or [])]
  discovery_product = to_result_product(
    row,
    2,
    role="discovery",
    source="live_naver",
    hard_filters=hard_filters,
    extra_caveats=caveats,
  )

  discovery_index = next(
    (index for index, product in enumerate(products) if product.get("role") == "discovery"),
    None,
  )
  if discovery_index is not None:
    products[discovery_index] = discovery_product
  elif len(products) < 3:
    products.append(discovery_product)
  else:
    return {"status": "no_slot", "gate": gate_reason, "query": query}

  return {
    "status": "replaced",
    "gate": gate_reason,
    "query": query,
    "pickedId": discovery_product["id"],
    "fetched": len(catalog_items),
  }


# ---------------------------------------------------------------------------
# 오케스트레이터 — *_persisted 레이어가 phase=="results"일 때 await
# ---------------------------------------------------------------------------


async def _enrich(state: dict[str, Any], settings: Settings, extra_caveats: list[str] | None) -> None:
  result = state["result"]
  live_status = await _enrich_live_discovery(state, settings, result, extra_caveats)
  copy_status = await _enrich_reason_copy(state, settings, result.get("products") or [])
  result["enrichment"] = {"liveDiscovery": live_status, "reasonCopy": copy_status}


async def enrich_results(
  state: dict[str, Any],
  *,
  settings: Settings,
  extra_caveats: list[str] | None = None,
) -> None:
  """결과를 가산 보강한다 — 실패·타임아웃이어도 서빙 결과는 항상 유효(§9, 턴키)."""
  if state.get("phase") != "results" or not isinstance(state.get("result"), dict):
    return
  try:
    await asyncio.wait_for(
      _enrich(state, settings, extra_caveats),
      timeout=float(settings.auradin_enrich_timeout_seconds),
    )
  except TimeoutError:
    logger.warning("[aura:auradin-enrich] timed out after %ss", settings.auradin_enrich_timeout_seconds)
    state["result"].setdefault("enrichment", {"liveDiscovery": {"status": "timeout"}, "reasonCopy": {"backend": "timeout"}})
  except Exception:  # noqa: BLE001 - enrich는 어떤 경우에도 결과 서빙을 깨지 않는다.
    logger.exception("[aura:auradin-enrich] failed")
    state["result"].setdefault("enrichment", {"liveDiscovery": {"status": "error"}, "reasonCopy": {"backend": "error"}})
  finally:
    _apply_fallback_copies(state)
