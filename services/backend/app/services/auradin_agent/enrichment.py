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

from .attribute_evaluator import evaluate_attribute
from .catalog_loader import get_catalog
from .knowledge_chunk_builder import build_mvp_catalog_item
from .ranking import (
  ATTRIBUTE_LABELS,
  CATEGORY_LABELS,
  conditional_mmr_picks,
  guard_conflicting_candidates,
  passes_floor,
  price_delta_matches,
  rank_candidates,
  to_result_product,
)
from .retrieval_service import apply_hard_filters


logger = logging.getLogger(__name__)

LIVE_NAVER_CAVEAT = "네이버 쇼핑 실시간 검색 결과이며 브랜드 공식 정보가 아닐 수 있어요"
# §9: 결과 카피 금지 표현 — 감지 시 해당 카피 폐기(구조화 근거는 그대로 서빙).
BANNED_COPY_TERMS = ("공식", "정확한 호수", "퍼스널컬러 매칭 확정", "퍼스널컬러 확정", "100%")
MAX_COPY_LENGTH = 220
COPY_CACHE_LIMIT = 30

# 발견 슬롯 Naver 검색어의 카테고리 축 (shopping_products.CATEGORY_CONFIG 질의 미러).
# 토큰을 많이 쌓을수록 top-sim이 리셀러 스팸(brand 공란)으로 오염된다 — 짧은 축 + 폴백 사다리.
CATEGORY_SEARCH_TERMS = {
  "lip": "립 틴트",
  "cheek": "블러셔 치크",
  "shadow": "아이섀도우 팔레트",
  "base": "쿠션 파운데이션",
  "brow": "브로우 펜슬",
  "liner": "아이라이너",
}
CATEGORY_FALLBACK_TERMS = {
  "lip": ("립스틱",),
  "cheek": ("치크 블러셔",),
  "shadow": ("아이섀도우",),
  "base": ("파운데이션", "쿠션"),
  "brow": ("아이브로우", "눈썹"),
  "liner": ("아이라이너", "라이너"),
}


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
- 발색 강도 표현("은은한 발색", "데일리 발색", "선명한 발색")과 색·마감 단어는 위 제품 정보에 그대로 있을 때만 써.
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


def _parse_json_output(output_text: str) -> dict[str, Any] | None:
  # 펜스(```json ... ```) 제거 후 dict JSON만 파싱 — reasonCopy·questionCopy 공용 파서.
  normalized = output_text.strip()
  fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", normalized, re.DOTALL)
  if fence_match:
    normalized = fence_match.group(1).strip()
  try:
    parsed = json.loads(normalized)
  except json.JSONDecodeError:
    return None
  return parsed if isinstance(parsed, dict) else None


def _parse_copy_output(output_text: str) -> str | None:
  parsed = _parse_json_output(output_text)
  if parsed is None:
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
    # 충실성 게이트 리젝(무근거 발색·마감 라벨 등)은 확률적 — 남은 제품만 1회 재시도.
    for _attempt in range(2):
      if not missing:
        break
      copies = await asyncio.gather(*(client.generate(product) for product in missing))
      still_missing: list[dict[str, Any]] = []
      for product, copy in zip(missing, copies):
        if isinstance(copy, str) and copy_is_faithful(copy, product):
          product["reasonCopy"] = copy
          product["reasonCopySource"] = "bedrock"
          cache[product["id"]] = copy
          status["generated"] += 1
        else:
          still_missing.append(product)
      missing = still_missing

  while len(cache) > COPY_CACHE_LIMIT:
    cache.pop(next(iter(cache)))
  return status


def _apply_fallback_copies(state: dict[str, Any]) -> None:
  # reasonCopy는 결과 계약에서 항상 존재 — 비활성/실패/타임아웃이면 matchedOn join (§6).
  result = state.get("result") if isinstance(state.get("result"), dict) else {}
  fallback_count = 0
  for product in result.get("products") or []:
    if not product.get("reasonCopy"):
      product["reasonCopy"] = fallback_copy(product)
      product["reasonCopySource"] = "fallback"
      fallback_count += 1
  copy_status = (result.get("enrichment") or {}).get("reasonCopy")
  if isinstance(copy_status, dict):
    copy_status["fallback"] = fallback_count


# ---------------------------------------------------------------------------
# 2c. questionCopy — 되묻기 질문 표시 텍스트 실시간 재작성 (표현만, 구조 불변) (§6/§9)
# ---------------------------------------------------------------------------
# reasonCopy와 같은 정직성 계약을 질문에 적용한다: LLM은 제목·선택지 라벨의 '자연어 표현'만
# 다듬고, 질문/선택지의 구조(id·attribute·filterDelta·expectedCandidateCount)는 절대 바꾸지
# 않는다. 답변 매칭이 질문 id + 선택지 id에 의존하므로(session_manager.answer_session) 구조가
# 권위값이다. 충실성 게이트를 통과할 때만 통째로 반영하고, 아니면 결정론적 텍스트를 유지한다.


def _question_copy_prompt(question: dict[str, Any], context: dict[str, Any]) -> str:
  options_view = [
    {
      "id": option.get("id"),
      "currentLabel": option.get("label"),
      "attribute": (option.get("filterDelta") or {}).get("attribute"),
      "values": (option.get("filterDelta") or {}).get("values") or [],
      "isNoop": (option.get("filterDelta") or {}).get("op") == "noop",
      "expectedCandidateCount": option.get("expectedCandidateCount"),
    }
    for option in question.get("options") or []
  ]
  payload = {
    "userPrompt": context.get("prompt"),
    "previousAnswers": context.get("answers") or [],
    "candidateCount": question.get("expectedCandidateCount"),
    "attribute": question.get("attribute"),
    "currentTitle": question.get("title"),
    "options": options_view,
  }
  return f"""아래는 화장품 검색을 좁히기 위한 '되묻기 질문' 하나야. 사용자 맥락(userPrompt·previousAnswers·후보 분포)에 맞춰 질문 제목과 각 선택지 라벨을 더 자연스럽고 친근한 한국어로 다시 써.

규칙 (반드시 지켜):
- 각 선택지의 id는 그대로 두고, 그 선택지가 뜻하는 속성·값(attribute/values)을 절대 바꾸지 마. 자연어 표현만 다듬어.
- 선택지 개수·순서를 그대로 유지해. 새 선택지를 추가하거나 지우지 마.
- isNoop 선택지(상관 없음)는 "상관없다"는 뜻을 유지해 — 특정 속성값으로 바꾸지 마.
- 근거에 없는 색·마감·효능·브랜드를 지어내지 마. "공식", "정확한 호수", "100%" 같은 보증·확정 표현 금지.
- 존댓말로, 과장 없이 짧게. 제목은 한 문장.

질문 정보(읽기 전용):
{json.dumps(payload, ensure_ascii=False, indent=2)}

JSON만 반환해: {{"title": "...", "options": [{{"id": "...", "label": "..."}}, ...]}}"""


def _parse_question_copy_output(output_text: str) -> dict[str, Any] | None:
  parsed = _parse_json_output(output_text)
  if parsed is None:
    return None
  title = _clean(parsed.get("title"))
  raw_options = parsed.get("options")
  if not title or not isinstance(raw_options, list):
    return None
  options: list[dict[str, str]] = []
  for option in raw_options:
    if not isinstance(option, dict):
      return None
    option_id = _clean(option.get("id"))
    label = _clean(option.get("label"))
    if not option_id or not label:
      return None
    options.append({"id": option_id, "label": label})
  return {"title": title, "options": options}


def question_copy_is_faithful(
  rewritten: dict[str, Any] | None,
  original_question: dict[str, Any],
) -> bool:
  """§9 질문 카피 충실성 게이트 — 구조(옵션 id·개수·순서)가 원본과 1:1이 아니면 False.

  copy_is_faithful과 같은 계약: LLM은 표현만 다듬고, 어떤 선택지가 어떤 속성/값을 뜻하는지
  (id·filterDelta)는 절대 바꾸지 않는다. 드리프트가 하나라도 있으면 통째로 리젝 → 결정론적 유지.
  """
  if not isinstance(rewritten, dict):
    return False
  title = _clean(rewritten.get("title"))
  rewritten_options = rewritten.get("options")
  if not title or len(title) > MAX_COPY_LENGTH or not isinstance(rewritten_options, list):
    return False
  original_options = original_question.get("options") or []
  if len(rewritten_options) != len(original_options):
    return False

  texts = [title]
  for rewritten_option, original_option in zip(rewritten_options, original_options):
    if not isinstance(rewritten_option, dict):
      return False
    # id·순서 1:1 (드리프트 0) — 답변 매칭이 여기에 의존한다.
    if _clean(rewritten_option.get("id")) != _clean(original_option.get("id")):
      return False
    label = _clean(rewritten_option.get("label"))
    if not label or len(label) > MAX_COPY_LENGTH:
      return False
    texts.append(label)
    # 라벨이 같은 속성의 '다른 값' 라벨로 바뀌면(핑크→레드) id는 그대로여도 표시가 거짓 → 리젝 (§9).
    delta = original_option.get("filterDelta") or {}
    label_map = ATTRIBUTE_LABELS.get(_clean(delta.get("attribute")), {})
    values = delta.get("values") or []
    own_value = _clean(values[0]) if values else ""
    own_label = label_map.get(own_value, "")
    for sibling_value, sibling_label in label_map.items():
      if sibling_value == own_value or not sibling_label:
        continue
      if own_label and (sibling_label in own_label or own_label in sibling_label):
        continue  # 부분 문자열 겹침은 오탐 — 스킵
      if sibling_label in label:
        return False

  # 금지 표현: 제목·선택지 라벨 어디에도 보증·확정 표현 금지 (reasonCopy와 동일 목록).
  return not any(term in text for text in texts for term in BANNED_COPY_TERMS)


class QuestionCopyClient:
  """비활성/자격증명 없음 폴백 — generate가 None이면 호출부가 결정론적 질문 텍스트를 유지한다."""

  backend = "fallback"

  async def generate(
    self,
    question: dict[str, Any],
    context: dict[str, Any],
  ) -> dict[str, Any] | None:
    return None


class BedrockQuestionCopyClient(QuestionCopyClient):
  backend = "bedrock"

  def __init__(self, settings: Settings) -> None:
    self.settings = settings

  def _bedrock_runtime_client(self):
    # BedrockReasonCopyClient와 동일 — enrich는 서빙 경로라 read timeout을 짧게 잡는다.
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

  def _generate_sync(
    self,
    question: dict[str, Any],
    context: dict[str, Any],
  ) -> dict[str, Any] | None:
    # §12: Seoul 리전은 apac 크로스리전 추론 프로파일 id가 필요 — effective_analysis_model_id가
    # inference_id를 우선 반환한다(bare model id → ValidationException). reasonCopy와 동일 경로.
    model_id = self.settings.effective_analysis_model_id
    if not model_id:
      return None

    started_at = time.monotonic()
    response = self._bedrock_runtime_client().invoke_model(
      modelId=model_id,
      body=json.dumps(
        {
          "anthropic_version": "bedrock-2023-05-31",
          "max_tokens": 400,
          "temperature": 0.3,
          "system": "당신은 화장품 검색 되묻기 질문의 문구를 자연스러운 한국어로 다듬는 에디터입니다. 선택지의 의미(속성·값)는 절대 바꾸지 않고 표현만 손봅니다. 반드시 JSON만 반환합니다.",
          "messages": [
            {"role": "user", "content": [{"type": "text", "text": _question_copy_prompt(question, context)}]},
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
      logger.info("[aura:auradin-question-copy] guardrail intervened — deterministic text kept")
      return None
    rewritten = _parse_question_copy_output(_extract_output_text(response_payload))
    logger.info(
      "[aura:auradin-question-copy] generate model=%s durationMs=%s ok=%s",
      model_id,
      round((time.monotonic() - started_at) * 1000),
      bool(rewritten),
    )
    return rewritten

  async def generate(
    self,
    question: dict[str, Any],
    context: dict[str, Any],
  ) -> dict[str, Any] | None:
    try:
      return await asyncio.to_thread(self._generate_sync, question, context)
    except Exception as exc:  # noqa: BLE001 - 질문 카피 실패는 서빙을 깨지 않는다 (graceful fallback).
      logger.warning("[aura:auradin-question-copy] generate failed reason=%s", exc.__class__.__name__)
      return None


def build_question_copy_client(settings: Settings) -> QuestionCopyClient:
  # build_copy_client 팩토리+fallback 패턴 미러 — 새 게이트 setting + AWS 자격증명에 게이트.
  if not settings.auradin_question_copy_enabled:
    return QuestionCopyClient()
  if settings.analysis_provider != "bedrock":
    return QuestionCopyClient()
  if not settings.effective_analysis_model_id or not settings.aws_credentials_configured:
    return QuestionCopyClient()
  return BedrockQuestionCopyClient(settings)


async def enrich_question(state: dict[str, Any], *, settings: Settings) -> None:
  """질문 표시 텍스트(제목·선택지 라벨)를 실시간 LLM으로 다듬는다 — 구조는 불변(§9, 가산 폴리시).

  충실성 게이트(question_copy_is_faithful)를 통과할 때만 통째로 반영한다.
  비활성·자격증명 없음·실패·타임아웃·드리프트이면 결정론적 텍스트를 그대로 유지한다(부분 적용 금지).
  """
  if state.get("phase") != "question":
    return
  question = state.get("lastQuestion")
  if not isinstance(question, dict) or not question.get("options"):
    return
  client = build_question_copy_client(settings)
  if client.backend != "bedrock":
    return
  context = {
    "prompt": state.get("prompt"),
    "answers": [
      {"label": answer.get("label"), "filterDelta": answer.get("filterDelta")}
      for answer in state.get("answers") or []
    ],
  }
  try:
    rewritten = await asyncio.wait_for(
      client.generate(question, context),
      timeout=float(settings.auradin_enrich_timeout_seconds),
    )
  except TimeoutError:
    logger.warning("[aura:auradin-question-copy] timed out after %ss", settings.auradin_enrich_timeout_seconds)
    return
  except Exception:  # noqa: BLE001 - 질문 카피 실패는 서빙을 깨지 않는다.
    logger.exception("[aura:auradin-question-copy] enrich failed")
    return
  if not question_copy_is_faithful(rewritten, question):
    return
  # 충실 → 통째로 반영. id·attribute·filterDelta·expectedCandidateCount는 절대 건드리지 않는다.
  question["title"] = rewritten["title"]
  for option, rewritten_option in zip(question["options"], rewritten["options"]):
    option["label"] = rewritten_option["label"]
  question["titleSource"] = "bedrock"


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


def _discovery_queries(state: dict[str, Any], category: str) -> list[str]:
  """검색어 사다리 — 라벨 포함 질의부터 카테고리 축만 남긴 질의까지 (§2 broaden).

  긴 질의는 리셀러 스팸(브랜드 공란 → whitelist 컷)으로 오염되기 쉬우므로,
  적격 후보가 나올 때까지 짧은 질의로 물러난다. 조건 완화가 아니다 —
  하드 필터는 결과 아이템에 그대로 적용된다 (§9).
  """
  primary = CATEGORY_SEARCH_TERMS.get(category, "화장품")
  parts = [primary]
  for preference in state.get("softPreferences") or []:
    attribute = _clean(preference.get("attribute"))
    values = preference.get("values") or []
    if attribute in {"colorFamily", "finish", "texture"} and values:
      label = ATTRIBUTE_LABELS.get(attribute, {}).get(_clean(values[0]))
      if label and label not in parts:
        parts.append(label)
  ladder = [" ".join(parts[:3]), primary, *CATEGORY_FALLBACK_TERMS.get(category, ())]
  deduped: list[str] = []
  for query in ladder:
    if query and query not in deduped:
      deduped.append(query)
  return deduped


def _needs_live_discovery(result: dict[str, Any], settings: Settings) -> tuple[bool, str]:
  """§5: 발견 슬롯은 Tier2 라이브가 주력 — 큐레이션 발견은 라이브가 없을 때의 폴백이다.

  (assign_roles docstring: "라이브 Naver가 없는 슬라이스에선 발견 슬롯을 큐레이션 픽으로 대체")
  그래서 자격증명이 있으면 항상 라이브 교체를 시도하고, 적격 후보가 없으면 큐레이션을 유지한다.
  retrieval/랭킹(anchor·diverse·질문 퍼널)은 Tier1 우선 그대로다 (§2).
  """
  products = result.get("products") or []
  if not products:
    return False, "no_products"
  if any(product.get("source") == "live_naver" for product in products):
    return False, "already_live"
  if len(products) < 3:
    return True, "missing_discovery_slot"
  return True, "discovery_slot_default"


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
    brand=candidate["brandNormalized"],
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

  queries = _discovery_queries(state, category)
  hard_filters = [f for f in state.get("hardFilters") or [] if _clean(f.get("mode")) != "soft"]
  existing_ids = {product.get("id") for product in products}

  def _eligible(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    # §9/F11: 명시 하드는 라이브에도 동일하게 적용하되, 질문에서 온
    # clarification hard는 known mismatch만 제거한다(unknown != negative).
    unseen = [item for item in items if item["id"] not in existing_ids]
    return apply_hard_filters(unseen, hard_filters)

  cache_key = " | ".join(queries)
  cache = state.get("liveDiscoveryCache") if isinstance(state.get("liveDiscoveryCache"), dict) else {}
  if cache.get("key") == cache_key and isinstance(cache.get("items"), list):
    query = str(cache.get("query") or queries[0])
    eligible = _eligible(cache["items"])
    fetched = len(cache["items"])
  else:
    eligible = []
    fetched = 0
    query = queries[0]
    for query in queries:  # 사다리: 적격 후보가 나오는 첫 질의에서 멈춘다
      try:
        raw_items = await _fetch_raw_naver_items(settings, query, display=30)
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
      fetched = len(catalog_items)
      eligible = _eligible(catalog_items)
      if eligible:
        state["liveDiscoveryCache"] = {"items": catalog_items, "key": cache_key, "query": query}
        break

  if not eligible:
    return {"status": "no_match", "gate": gate_reason, "query": query, "fetched": fetched}

  ranked = rank_candidates(
    eligible,
    hard_filters=hard_filters,
    soft_preferences=state.get("softPreferences") or [],
  )
  # A4/F18은 라이브 후보에도 동일한 순서로 적용한다. confirmed conflict는
  # 재삽입하지 않고, semantic unavailable을 0으로 둔 상태에서 floor를 통과한
  # 후보만 curated 결과를 seed로 한 조건부 MMR에 들어간다.
  guarded = guard_conflicting_candidates(ranked)
  floored = [
    row
    for row in guarded
    if passes_floor(
      row,
      s_floor=float(settings.auradin_floor_semantic),
      hard_filters=hard_filters,
    )
  ]

  # §5 발견 슬롯 = 라이브가 주력: 큐레이션 discovery는 라이브로 교체하고, Top3에 남는 빈 칸은
  # 라이브로 마저 채운다(빈 '비슷한 후보' 방지). 조건 완화가 아니라 빈 슬롯 채움 — 하드 필터는
  # _eligible에서 이미 강제. 이름 정규화 중복 제거(#7)로 히어로·후보와 같은 상품 리스팅을 배제.
  kept = [product for product in products if product.get("role") != "discovery"]
  kept_roles = {product.get("role") for product in kept}
  missing_roles = [role for role in ("anchor", "diverse", "discovery") if role not in kept_roles]

  catalog = get_catalog()
  curated_seeds = [
    {"item": item, "score": 1.0}
    for product in kept
    if (item := catalog.get(_clean(product.get("id")))) is not None
  ]
  ranked_picks = conditional_mmr_picks(
    floored,
    curated_seeds=curated_seeds,
    lambda_=float(state.get("mmrLambda") or settings.auradin_mmr_lambda),
    top_n=len(missing_roles),
  )

  caveats = [LIVE_NAVER_CAVEAT, *(extra_caveats or [])]
  picks: list[dict[str, Any]] = []
  for row in ranked_picks:
    if not missing_roles:
      break
    picks.append(
      to_result_product(
        row,
        len(kept) + len(picks),
        role=missing_roles.pop(0),
        source="live_naver",
        hard_filters=hard_filters,
        extra_caveats=[*caveats, *(row.get("guardCaveats") or [])],
      ),
    )

  if not picks:
    return {"status": "no_match", "gate": gate_reason, "query": query, "fetched": fetched}

  result["products"] = kept + picks
  return {
    "status": "filled",
    "gate": gate_reason,
    "query": query,
    "pickedId": picks[0]["id"],
    "pickedIds": [product["id"] for product in picks],
    "filledCount": len(picks),
    "fetched": fetched,
  }


def _question_filter_evaluation(
  item: dict[str, Any] | None,
  filter_delta: dict[str, Any],
) -> str:
  """Return match|unknown|violation for one final card and question hard."""
  if not item:
    return "unknown"
  attribute = _clean(filter_delta.get("attribute"))
  if attribute == "priceKrw":
    live_offer = item.get("liveOffer") if isinstance(item.get("liveOffer"), dict) else {}
    price = int(live_offer.get("priceKrw") or 0)
    if price <= 0:
      return "unknown"
    return "match" if price_delta_matches(filter_delta, price) else "violation"
  expected = [
    _clean(value)
    for value in (filter_delta.get("values") or [])
    if _clean(value)
  ]
  evaluation = evaluate_attribute(item, attribute, expected)
  if evaluation["knowledge"] == "unknown":
    return "unknown"
  return "match" if evaluation["valueMatches"] else "violation"


def _annotate_question_filter_coverage(state: dict[str, Any], result: dict[str, Any]) -> None:
  """F11 final-card diagnostics and honest unknown caveats.

  Coverage is computed after guard/floor/MMR/live replacement, so the chip and
  per-card caveat describe the products that are actually served.
  """
  question_filters = [
    filter_delta
    for filter_delta in state.get("hardFilters") or []
    if _clean(filter_delta.get("source")) == "question"
    and _clean(filter_delta.get("mode")) != "soft"
    and _clean(filter_delta.get("op")) != "noop"
  ]
  if not question_filters:
    state.pop("questionFilterCoverage", None)
    return

  catalog = get_catalog()
  raw_by_id = dict(catalog.by_id)
  live_cache = state.get("liveDiscoveryCache")
  if isinstance(live_cache, dict):
    for item in live_cache.get("items") or []:
      if isinstance(item, dict) and _clean(item.get("id")):
        raw_by_id[_clean(item.get("id"))] = item

  products = result.get("products") if isinstance(result.get("products"), list) else []
  summaries: list[dict[str, Any]] = []
  for filter_delta in question_filters:
    cards: list[dict[str, str]] = []
    for product in products:
      product_id = _clean(product.get("id"))
      status = _question_filter_evaluation(raw_by_id.get(product_id), filter_delta)
      cards.append({"productId": product_id, "status": status})
      if status == "unknown":
        reason = product.setdefault("reason", {})
        caveats = reason.setdefault("caveat", [])
        if "정보 미상이라 제외하지 않음" not in caveats:
          caveats.append("정보 미상이라 제외하지 않음")

    statuses = {card["status"] for card in cards}
    coverage = (
      "violation"
      if "violation" in statuses
      else "partial_unknown"
      if "unknown" in statuses
      else "complete"
    )
    filter_delta["coverage"] = coverage
    filter_delta["coverageCaveat"] = (
      "정보 미상 포함" if coverage == "partial_unknown" else None
    )
    summaries.append(
      {
        "attribute": _clean(filter_delta.get("attribute")),
        "coverage": coverage,
        "cards": cards,
      },
    )

  state["questionFilterCoverage"] = summaries
  result["questionFilterCoverage"] = summaries
  diagnostics = result.setdefault("diagnostics", {})
  diagnostics["questionFilterCoverage"] = summaries


# ---------------------------------------------------------------------------
# 오케스트레이터 — *_persisted 레이어가 phase=="results"일 때 await
# ---------------------------------------------------------------------------


async def _enrich(state: dict[str, Any], settings: Settings, extra_caveats: list[str] | None) -> None:
  result = state["result"]
  live_status = await _enrich_live_discovery(state, settings, result, extra_caveats)
  _annotate_question_filter_coverage(state, result)
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
