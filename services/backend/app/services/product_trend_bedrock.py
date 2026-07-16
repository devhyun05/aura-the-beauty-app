"""Cost-bounded Bedrock classification for genuinely new trend phrases.

Bedrock does not collect trends and does not rank products.  It is used only
when local burst detection produced a new phrase whose product attributes are
ambiguous.  A durable quota reservation is mandatory before invocation.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime
import json
import logging
import re
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.settings import Settings
from app.services.product_trend_discovery import (
  BurstPhraseCandidate,
  NaverContentDocument,
  keyword_is_safe_beauty_phrase,
)
from app.services.product_trend_quota import TrendCallQuotaLedger


logger = logging.getLogger(__name__)
_PRODUCT_CATEGORIES = {"base", "shadow", "brow", "cheek", "lip", "liner"}
_BENEFIT_TAGS = {
  "hydrating", "moisturizing", "lightweight", "oil_control", "waterproof", "longwear",
  "transfer_resistant",
}
_FINISHES = {"glossy", "sheer", "shimmer", "matte", "velvet", "satin", "natural"}
_CODE_FENCE_PATTERN = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)
_SYSTEM_INSTRUCTION = (
  "You classify evidence-backed Korean makeup trend phrases. Return JSON only. "
  "Never invent evidence, products, brands, sales claims, or keywords."
)
_PROMPT_INSTRUCTION = "Classify only candidates supported by their cited evidence. Omit uncertain items.\n"
# Account conservatively for role/message framing that Bedrock adds around the
# two text blocks. UTF-8 byte length is an upper bound on tokenizer pieces.
_MESSAGE_ENVELOPE_BYTE_RESERVE = 64


@dataclass(frozen=True)
class BedrockTrendClassification:
  keyword: str
  categories: tuple[str, ...]
  benefit_tags: tuple[str, ...]
  finishes: tuple[str, ...]
  evidence_ids: tuple[str, ...]
  confidence: float


@dataclass(frozen=True)
class BedrockTrendClassificationResult:
  status: str
  invoked: bool
  items: tuple[BedrockTrendClassification, ...] = ()
  input_tokens: int = 0
  output_tokens: int = 0


def candidate_needs_bedrock(candidate: BurstPhraseCandidate, *, known_vocabulary: set[str]) -> bool:
  normalized_vocabulary = {value.strip().casefold() for value in known_vocabulary if value.strip()}
  is_new = candidate.keyword.casefold() not in normalized_vocabulary
  has_unclear_attributes = not candidate.categories or (not candidate.finishes and not candidate.benefit_tags)
  return is_new and has_unclear_attributes and keyword_is_safe_beauty_phrase(candidate.keyword)


def _response_text(response: dict[str, Any]) -> str:
  output = response.get("output") if isinstance(response.get("output"), dict) else {}
  message = output.get("message") if isinstance(output.get("message"), dict) else {}
  content = message.get("content") if isinstance(message.get("content"), list) else []
  for item in content:
    if isinstance(item, dict) and isinstance(item.get("text"), str):
      return item["text"]
  return ""


def _validated_items(
  raw_text: str,
  *,
  candidates: dict[str, BurstPhraseCandidate],
  valid_evidence_ids: set[str],
) -> tuple[BedrockTrendClassification, ...]:
  cleaned = _CODE_FENCE_PATTERN.sub("", raw_text.strip())
  try:
    payload = json.loads(cleaned)
  except json.JSONDecodeError:
    return ()
  raw_items = payload.get("items") if isinstance(payload, dict) else None
  if not isinstance(raw_items, list):
    return ()
  items: list[BedrockTrendClassification] = []
  seen: set[str] = set()
  for raw in raw_items[:len(candidates)]:
    if not isinstance(raw, dict):
      continue
    keyword = " ".join(str(raw.get("keyword") or "").split())
    candidate = candidates.get(keyword.casefold())
    if candidate is None or keyword.casefold() in seen:
      continue
    categories = tuple(dict.fromkeys(
      str(value).strip().casefold()
      for value in raw.get("categories", [])[:6]
      if str(value).strip().casefold() in _PRODUCT_CATEGORIES
    )) if isinstance(raw.get("categories"), list) else ()
    benefit_tags = tuple(dict.fromkeys(
      str(value).strip().casefold()
      for value in raw.get("benefitTags", [])[:8]
      if str(value).strip().casefold() in _BENEFIT_TAGS
    )) if isinstance(raw.get("benefitTags"), list) else ()
    finishes = tuple(dict.fromkeys(
      str(value).strip().casefold()
      for value in raw.get("finishes", raw.get("finish", []))[:6]
      if str(value).strip().casefold() in _FINISHES
    )) if isinstance(raw.get("finishes", raw.get("finish", [])), list) else ()
    evidence_ids = tuple(dict.fromkeys(
      str(value).strip()
      for value in raw.get("evidenceIds", [])[:12]
      if str(value).strip() in valid_evidence_ids and str(value).strip() in candidate.evidence_ids
    )) if isinstance(raw.get("evidenceIds"), list) else ()
    try:
      confidence = float(raw.get("confidence", 0))
    except (TypeError, ValueError):
      confidence = 0.0
    if not categories or not evidence_ids or confidence < 0.5 or confidence > 1.0:
      continue
    items.append(BedrockTrendClassification(
      keyword=candidate.keyword,
      categories=categories,
      benefit_tags=benefit_tags,
      finishes=finishes,
      evidence_ids=evidence_ids,
      confidence=round(confidence, 4),
    ))
    seen.add(keyword.casefold())
  return tuple(items)


def _input_payload(
  candidates: list[BurstPhraseCandidate],
  evidence: list[dict[str, str]],
) -> dict[str, Any]:
  available_ids = {item["id"] for item in evidence}
  return {
    "allowedCategories": sorted(_PRODUCT_CATEGORIES),
    "allowedBenefitTags": sorted(_BENEFIT_TAGS),
    "allowedFinishes": sorted(_FINISHES),
    "candidates": [
      {
        "keyword": candidate.keyword,
        "evidenceIds": [
          evidence_id for evidence_id in candidate.evidence_ids
          if evidence_id in available_ids
        ],
      }
      for candidate in candidates
    ],
    "evidence": evidence,
    "responseSchema": {
      "items": [{
        "keyword": "exact candidate keyword",
        "categories": ["allowed category"],
        "benefitTags": ["allowed benefit tag"],
        "finishes": ["allowed finish"],
        "evidenceIds": ["provided evidence id"],
        "confidence": "number from 0 to 1",
      }],
    },
  }


def _render_prompt(
  candidates: list[BurstPhraseCandidate],
  evidence: list[dict[str, str]],
) -> str:
  return _PROMPT_INSTRUCTION + json.dumps(
    _input_payload(candidates, evidence),
    ensure_ascii=False,
    separators=(",", ":"),
  )


def _request_input_bytes(prompt: str) -> int:
  return (
    len(_SYSTEM_INSTRUCTION.encode("utf-8"))
    + len(prompt.encode("utf-8"))
    + _MESSAGE_ENVELOPE_BYTE_RESERVE
  )


def _bounded_classification_prompt(
  candidates: list[BurstPhraseCandidate],
  documents: list[NaverContentDocument],
  *,
  input_token_limit: int,
) -> tuple[str, list[BurstPhraseCandidate], list[dict[str, str]]] | None:
  """Build valid JSON whose conservative byte bound fits the token budget.

  Evidence text is reduced first, followed by lower-priority evidence and
  candidates. The function never slices serialized JSON, so a bounded request
  remains parseable and every retained candidate keeps at least one cited
  evidence record.
  """

  referenced_ids = {evidence_id for candidate in candidates for evidence_id in candidate.evidence_ids}
  source_documents = [
    document for document in documents
    if document.evidence_id in referenced_ids
  ][:48]
  if not source_documents:
    return None
  title_limit = 160
  summary_limit = 240

  def evidence_rows() -> list[dict[str, str]]:
    return [
      {
        "id": document.evidence_id,
        "sourceType": document.source_type,
        "title": document.title[:title_limit],
        "summary": document.summary[:summary_limit] if summary_limit else "",
      }
      for document in source_documents
    ]

  selected = list(candidates)
  while selected and source_documents:
    evidence = evidence_rows()
    available_ids = {item["id"] for item in evidence}
    selected = [
      candidate for candidate in selected
      if any(evidence_id in available_ids for evidence_id in candidate.evidence_ids)
    ]
    if not selected:
      return None
    used_ids = {evidence_id for candidate in selected for evidence_id in candidate.evidence_ids}
    evidence = [item for item in evidence if item["id"] in used_ids]
    prompt = _render_prompt(selected, evidence)
    if _request_input_bytes(prompt) <= input_token_limit:
      return prompt, selected, evidence

    if summary_limit > 120:
      summary_limit = 120
      continue
    if summary_limit > 60:
      summary_limit = 60
      continue
    if summary_limit > 0:
      summary_limit = 0
      continue
    if title_limit > 96:
      title_limit = 96
      continue
    if title_limit > 48:
      title_limit = 48
      continue

    retained_ids = {item["id"] for item in evidence}
    removable_id = next((
      document.evidence_id
      for document in reversed(source_documents)
      if all(
        document.evidence_id not in candidate.evidence_ids
        or len(set(candidate.evidence_ids) & retained_ids) > 1
        for candidate in selected
      )
    ), None)
    if removable_id is not None:
      source_documents = [
        document for document in source_documents
        if document.evidence_id != removable_id
      ]
      continue

    selected.pop()
    used_ids = {evidence_id for candidate in selected for evidence_id in candidate.evidence_ids}
    source_documents = [
      document for document in source_documents
      if document.evidence_id in used_ids
    ]
  return None


class BedrockTrendClassifier:
  def __init__(
    self,
    settings: Settings,
    *,
    quota_ledger: TrendCallQuotaLedger | None,
    runtime_client: Any | None = None,
  ) -> None:
    self.settings = settings
    self.quota_ledger = quota_ledger
    self._runtime_client = runtime_client

  def _client(self) -> Any:
    if self._runtime_client is not None:
      return self._runtime_client
    kwargs: dict[str, Any] = {
      "region_name": self.settings.effective_bedrock_analysis_region,
      "config": Config(
        connect_timeout=self.settings.product_trend_bedrock_timeout_seconds,
        read_timeout=self.settings.product_trend_bedrock_timeout_seconds,
        retries={"max_attempts": 1, "mode": "standard"},
      ),
    }
    if self.settings.aws_profile_name:
      return boto3.Session(profile_name=self.settings.aws_profile_name).client("bedrock-runtime", **kwargs)
    return boto3.client("bedrock-runtime", **kwargs)

  def _invoke(self, prompt: str) -> dict[str, Any]:
    return self._client().converse(
      modelId=str(self.settings.product_trend_bedrock_model_id),
      system=[{"text": _SYSTEM_INSTRUCTION}],
      messages=[{"role": "user", "content": [{"text": prompt}]}],
      inferenceConfig={
        "maxTokens": self.settings.product_trend_bedrock_output_token_limit,
        "temperature": 0,
      },
    )

  async def classify_if_needed(
    self,
    candidates: list[BurstPhraseCandidate],
    documents: list[NaverContentDocument],
    *,
    known_vocabulary: set[str],
    now: datetime,
  ) -> BedrockTrendClassificationResult:
    ambiguous = [
      candidate for candidate in candidates
      if candidate_needs_bedrock(candidate, known_vocabulary=known_vocabulary)
    ][:12]
    if not ambiguous:
      return BedrockTrendClassificationResult(status="not_needed", invoked=False)
    if (
      not self.settings.product_trend_bedrock_enabled
      or not str(self.settings.product_trend_bedrock_model_id or "").strip()
      or self.quota_ledger is None
    ):
      return BedrockTrendClassificationResult(status="disabled", invoked=False)

    bounded = _bounded_classification_prompt(
      ambiguous,
      documents,
      input_token_limit=self.settings.product_trend_bedrock_input_token_limit,
    )
    if bounded is None:
      return BedrockTrendClassificationResult(status="input_too_large", invoked=False)
    prompt, ambiguous, evidence = bounded
    try:
      reserved = await self.quota_ledger.reserve(
        "bedrock",
        at=now,
        daily_limit=self.settings.product_trend_bedrock_daily_call_limit,
        monthly_limit=self.settings.product_trend_bedrock_monthly_call_limit,
        amount=1,
      )
    except Exception:  # noqa: BLE001 - AI spend must fail closed on ledger outages.
      logger.warning("Bedrock trend quota reservation failed", exc_info=True)
      return BedrockTrendClassificationResult(status="quota_unavailable", invoked=False)
    if not reserved:
      return BedrockTrendClassificationResult(status="quota_exhausted", invoked=False)
    try:
      response = await asyncio.to_thread(self._invoke, prompt)
    except (BotoCoreError, ClientError, TimeoutError, RuntimeError, ValueError):
      logger.warning("Bedrock trend classification failed after quota reservation", exc_info=True)
      return BedrockTrendClassificationResult(status="failed", invoked=True)
    usage = response.get("usage") if isinstance(response.get("usage"), dict) else {}
    items = _validated_items(
      _response_text(response),
      candidates={candidate.keyword.casefold(): candidate for candidate in ambiguous},
      valid_evidence_ids={str(item["id"]) for item in evidence},
    )
    return BedrockTrendClassificationResult(
      status="ready" if items else "invalid_output",
      invoked=True,
      items=items,
      input_tokens=int(usage.get("inputTokens") or 0),
      output_tokens=int(usage.get("outputTokens") or 0),
    )
