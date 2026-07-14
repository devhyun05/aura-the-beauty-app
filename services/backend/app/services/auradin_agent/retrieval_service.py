from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.core.settings import Settings, get_settings

from .attribute_evaluator import evaluate_attribute, hard_question_keeps
from .catalog_loader import AuradinCatalog
from .embedding_client import HashEmbeddingClient, build_embedding_client
from .ranking import ATTRIBUTE_LABELS, CATEGORY_LABELS, price_delta_matches, price_filter_label, rank_candidates
from .vector_index import EmbeddingVectorIndex, FileVectorIndex, load_vector_index_metadata


class FilterDeltaContractViolation(ValueError):
  """내부 생성 filterDelta가 계약을 위반 — 사용자 입력 모호성이 아니라 코드 버그(500)."""


# question hard/soft filterDelta 공용 attribute/op allowlist — 알 수 없는 조합은
# 어느 소비처에서도 fail-open하지 않는다.
_HARD_ATTRIBUTES = {
  "category", "priceKrw", "channel", "priceTier",
  "colorFamily", "finish", "texture", "intensity", "undertone", "occasion",
}
_PRICE_OPS = {"lt", "lte", "gt", "gte", "between"}
_VALUE_OPS = {"eq", "in"}
_CONSTRAINT_FIELDS = {"values", "numberValue", "priceRange"}
_PRICE_RANGE_FIELDS = {"lowerKrw", "upperKrw", "lowerInclusive", "upperInclusive"}


def _present_constraint_fields(filter_delta: dict[str, Any]) -> set[str]:
  # forbidden은 값이 None이어도 키 존재 자체가 계약 위반이다. 생산자가 두 shape를
  # 섞어 직렬화한 버그를 조용히 정규화하지 않는다.
  return {key for key in _CONSTRAINT_FIELDS if key in filter_delta}


def _require_only_constraint_fields(filter_delta: dict[str, Any], allowed: set[str]) -> None:
  forbidden = _present_constraint_fields(filter_delta) - allowed
  if forbidden:
    raise FilterDeltaContractViolation(
      f"{filter_delta.get('op')!r} forbids constraint fields: {sorted(forbidden)!r}",
    )


def validate_filter_delta(filter_delta: dict[str, Any]) -> None:
  """delta 병합 시점 1회 사전 검증 (fail-closed) — 계획 Stage 1-c.

  Python bool은 int의 서브클래스라 숫자 필드에서 명시적으로 거절한다.
  """
  op = str(filter_delta.get("op") or "").strip()
  if op == "noop":
    attribute = str(filter_delta.get("attribute") or "").strip()
    if attribute and attribute not in _HARD_ATTRIBUTES:
      raise FilterDeltaContractViolation(f"unknown attribute: {attribute!r}")
    _require_only_constraint_fields(filter_delta, set())
    return
  attribute = str(filter_delta.get("attribute") or "").strip()
  if attribute not in _HARD_ATTRIBUTES:
    raise FilterDeltaContractViolation(f"unknown attribute: {attribute!r}")

  if attribute == "priceKrw":
    if op not in _PRICE_OPS:
      raise FilterDeltaContractViolation(f"unknown price op: {op!r}")
    if op == "between":
      _require_only_constraint_fields(filter_delta, {"priceRange"})
      price_range = filter_delta.get("priceRange")
      if not isinstance(price_range, dict):
        raise FilterDeltaContractViolation("between requires priceRange")
      unknown_range_fields = set(price_range) - _PRICE_RANGE_FIELDS
      if unknown_range_fields:
        raise FilterDeltaContractViolation(
          f"between priceRange has unknown fields: {sorted(unknown_range_fields)!r}",
        )
      missing_range_fields = _PRICE_RANGE_FIELDS - set(price_range)
      if missing_range_fields:
        raise FilterDeltaContractViolation(
          f"between priceRange misses fields: {sorted(missing_range_fields)!r}",
        )
      lower, upper = price_range.get("lowerKrw"), price_range.get("upperKrw")
      for bound in (lower, upper):
        if isinstance(bound, bool) or not isinstance(bound, int) or bound <= 0:
          raise FilterDeltaContractViolation(f"invalid price bound: {bound!r}")
      for key in ("lowerInclusive", "upperInclusive"):
        if not isinstance(price_range.get(key), bool):
          raise FilterDeltaContractViolation(f"{key} must be boolean")
      if lower > upper:
        raise FilterDeltaContractViolation("inverted price range")
      if lower == upper and not (price_range["lowerInclusive"] and price_range["upperInclusive"]):
        raise FilterDeltaContractViolation("empty price range (equal bounds, open)")
    else:
      _require_only_constraint_fields(filter_delta, {"numberValue"})
      number_value = filter_delta.get("numberValue")
      if isinstance(number_value, bool) or not isinstance(number_value, int) or number_value <= 0:
        raise FilterDeltaContractViolation(f"invalid numberValue: {number_value!r}")
    return

  if op not in _VALUE_OPS:
    raise FilterDeltaContractViolation(f"unknown op for {attribute}: {op!r}")
  _require_only_constraint_fields(filter_delta, {"values"})
  values = filter_delta.get("values")
  if not isinstance(values, list) or not values or not all(str(v or "").strip() for v in values):
    raise FilterDeltaContractViolation(f"{attribute} requires non-empty values")


def validate_hard_filters(hard_filters: list[dict[str, Any]]) -> None:
  lower: int | None = None
  lower_inclusive = True
  upper: int | None = None
  upper_inclusive = True

  for filter_delta in hard_filters:
    validate_filter_delta(filter_delta)
    if str(filter_delta.get("attribute") or "").strip() != "priceKrw":
      continue
    op = str(filter_delta.get("op") or "").strip()
    if op == "noop":
      continue
    if op == "between":
      price_range = filter_delta["priceRange"]
      candidate_lower = int(price_range["lowerKrw"])
      candidate_lower_inclusive = bool(price_range["lowerInclusive"])
      candidate_upper = int(price_range["upperKrw"])
      candidate_upper_inclusive = bool(price_range["upperInclusive"])
    else:
      boundary = int(filter_delta["numberValue"])
      candidate_lower = boundary if op in {"gt", "gte"} else None
      candidate_lower_inclusive = op == "gte"
      candidate_upper = boundary if op in {"lt", "lte"} else None
      candidate_upper_inclusive = op == "lte"

    if candidate_lower is not None and (
      lower is None or candidate_lower > lower or (
        candidate_lower == lower and not candidate_lower_inclusive and lower_inclusive
      )
    ):
      lower = candidate_lower
      lower_inclusive = candidate_lower_inclusive
    if candidate_upper is not None and (
      upper is None or candidate_upper < upper or (
        candidate_upper == upper and not candidate_upper_inclusive and upper_inclusive
      )
    ):
      upper = candidate_upper
      upper_inclusive = candidate_upper_inclusive

    if lower is not None and upper is not None and (
      lower > upper or (lower == upper and not (lower_inclusive and upper_inclusive))
    ):
      raise FilterDeltaContractViolation("merged price filters form an empty range")


@dataclass
class SemanticResult:
  """F12 — 빈 결과(실패)와 중립(정보 없음)을 구분하는 시맨틱 검색 반환 계약."""

  scores: dict[str, float] = field(default_factory=dict)
  status: str = "ok"  # ok | no_match | unavailable | incompatible
  backend: str = "lexical_file"
  degradedReason: str | None = None


def _clean(value: Any) -> str:
  return str(value or "").strip()


def _as_list(value: Any) -> list[Any]:
  return value if isinstance(value, list) else []


def _item_values(item: dict[str, Any], attribute: str) -> list[str]:
  attrs = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
  if attribute == "category":
    return [_clean(item.get("category"))]
  if attribute == "priceTier":
    return [_clean(item.get("liveOffer", {}).get("priceTier"))]
  if attribute == "channel":
    retail = item.get("retailPresence") if isinstance(item.get("retailPresence"), dict) else {}
    live_offer = item.get("liveOffer") if isinstance(item.get("liveOffer"), dict) else {}
    values = ["naver"] if _clean(live_offer.get("purchaseUrl")) else []
    if retail.get("oliveYoung", {}).get("listed") is True:
      values.append("oliveyoung")
    if retail.get("departmentStore", {}).get("listed") is True:
      values.append("department_store")
    return values
  value = attrs.get(attribute)
  if isinstance(value, list):
    return [_clean(item) for item in value if _clean(item)]
  return [_clean(value)] if _clean(value) else []


def matches_filter(item: dict[str, Any], filter_delta: dict[str, Any]) -> bool:
  op = _clean(filter_delta.get("op"))
  if op == "noop":
    return True

  attribute = _clean(filter_delta.get("attribute"))
  if attribute == "priceKrw":
    price = int(item.get("liveOffer", {}).get("priceKrw") or 0)
    # lt/lte/gt/gte/between 공용 판정 — 미지원 op는 fail-closed (구현은 fail-open이 F10 확산 경로였음)
    return price_delta_matches(filter_delta, price)

  values = [_clean(value) for value in _as_list(filter_delta.get("values")) if _clean(value)]
  if not values:
    return False  # fail-closed — 빈 values의 하드 필터는 사전 검증이 거른다

  item_values = _item_values(item, attribute)
  if op in {"eq", "in"}:
    return any(value in item_values for value in values)
  return False  # fail-closed


def apply_hard_filters(items: list[dict[str, Any]], hard_filters: list[dict[str, Any]]) -> list[dict[str, Any]]:
  filtered = items
  for filter_delta in hard_filters:
    if _clean(filter_delta.get("mode")) == "soft":
      continue
    # F11: a hard clarification answer may only exclude a *known* mismatch.
    # Unknown catalogue metadata is not negative evidence. Price is always
    # evaluated from the purchasable offer and therefore remains strict.
    if (
      _clean(filter_delta.get("source")) == "question"
      and _clean(filter_delta.get("attribute")) != "priceKrw"
    ):
      values = [
        _clean(value)
        for value in _as_list(filter_delta.get("values"))
        if _clean(value)
      ]
      filtered = [
        item
        for item in filtered
        if hard_question_keeps(
          evaluate_attribute(item, _clean(filter_delta.get("attribute")), values),
        )
      ]
    else:
      filtered = [item for item in filtered if matches_filter(item, filter_delta)]
  return filtered


def _korean_value_labels(attribute: str, values: list[Any]) -> list[str]:
  """시맨틱 질의는 카탈로그 청크와 어휘가 겹쳐야 한다 — enum이 아니라 한국어 라벨로 직렬화."""
  if attribute == "category":
    return [CATEGORY_LABELS.get(_clean(value), _clean(value)) for value in values if _clean(value)]
  mapping = ATTRIBUTE_LABELS.get(attribute, {})
  return [mapping.get(_clean(value), _clean(value)) for value in values if _clean(value)]


def build_query_text(
  intent: dict[str, Any],
  answers: list[dict[str, Any]],
  *,
  hard_filters: list[dict[str, Any]] | None = None,
  soft_preferences: list[dict[str, Any]] | None = None,
  refine_residuals: list[str] | None = None,
) -> str:
  """F15·F16 canonical query — 병합된 hard/soft 상태의 결정론 직렬화 + positive residual.

  구 구현은 원문 전체를 직렬화해 부정 스팬("매트는 싫고"의 '매트')이 임베딩을 오염시키고,
  noop 답변이 attribute=None으로 새어들며, 반복 refine은 최신 prompt만 반영했다.
  새 계약: ① noop 제외(병합 리스트에 없음) ② avoidValues·negated span 미포함
  ③ refine residual을 ordered source로 누적 ④ 원문 대신 positive residual만.
  """
  del answers  # 답변 delta는 병합된 hard/soft에 이미 반영 — noop이 새어들던 직렬화 제거
  merged_hard = hard_filters if hard_filters is not None else intent.get("lockedFilters", [])
  merged_soft = soft_preferences if soft_preferences is not None else intent.get("softPreferences", [])

  parts: list[str] = []
  for filter_delta in merged_hard:
    if _clean(filter_delta.get("op")) == "noop":
      continue
    attribute = _clean(filter_delta.get("attribute"))
    if attribute == "priceKrw":
      parts.append(price_filter_label(filter_delta))
      continue
    parts.extend(_korean_value_labels(attribute, _as_list(filter_delta.get("values"))))
  for preference in merged_soft:
    # R2a authority boundary: report can contribute only through its capped
    # final-score delta. Letting it rewrite the semantic query adds an uncapped
    # second path (and can open the floor through semanticScore).
    if _clean(preference.get("source")) == "report":
      continue
    attribute = _clean(preference.get("attribute"))
    parts.extend(_korean_value_labels(attribute, _as_list(preference.get("values"))))
    # avoidValues는 직렬화하지 않는다 — "매트는 싫고"의 매트가 매트를 끌어당기는 결함 제거

  residuals: list[str] = []
  seen: set[str] = set()
  for residual in [str(intent.get("positiveResidual") or "")] + [str(r or "") for r in (refine_residuals or [])]:
    normalized = " ".join(residual.split())
    if normalized and normalized not in seen:
      seen.add(normalized)
      residuals.append(normalized)

  deduped_parts: list[str] = []
  for part in parts:
    if part and part not in deduped_parts:
      deduped_parts.append(part)
  return " ".join([*deduped_parts, *residuals]).strip()


def split_answer_deltas(answers: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
  hard_filters: list[dict[str, Any]] = []
  soft_preferences: list[dict[str, Any]] = []
  for answer in answers:
    delta = answer.get("filterDelta") if isinstance(answer.get("filterDelta"), dict) else {}
    validate_filter_delta(delta)
    if delta.get("op") == "noop":
      continue
    if delta.get("mode") == "soft":
      soft_preferences.append(
        {
          "attribute": delta.get("attribute"),
          "values": delta.get("values") or [],
          "source": "question",
          "confidence": delta.get("confidence", 0.65),
          "weight": 1.0,
        },
      )
    else:
      hard_filters.append(delta)
  return hard_filters, soft_preferences


def retrieve_and_rank(
  catalog: AuradinCatalog,
  intent: dict[str, Any],
  answers: list[dict[str, Any]] | None = None,
  settings: Settings | None = None,
  *,
  extra_hard_filters: list[dict[str, Any]] | None = None,
  extra_soft_preferences: list[dict[str, Any]] | None = None,
  extra_query_text: str | list[str] | None = None,
) -> dict[str, Any]:
  answers = answers or []
  settings = settings or get_settings()
  answer_hard_filters, answer_soft_preferences = split_answer_deltas(answers)
  # §7 refine 출처 필터는 원 프롬프트/답변 출처 뒤에 가산 — 원 출처는 불변.
  hard_filters = [*intent.get("lockedFilters", []), *answer_hard_filters, *(extra_hard_filters or [])]
  soft_preferences = [*intent.get("softPreferences", []), *answer_soft_preferences, *(extra_soft_preferences or [])]
  # 계약 위반 delta는 적용 전에 전량 거절 — fail-closed (계획 Stage 1-c)
  validate_hard_filters(hard_filters)
  candidates_before = list(catalog.items)
  candidates = apply_hard_filters(candidates_before, hard_filters)
  refine_residuals = [str(r or "") for r in (extra_query_text or [])] if isinstance(extra_query_text, list) else (
    [str(extra_query_text)] if _clean(extra_query_text) else []
  )
  query_text = build_query_text(
    intent,
    answers,
    hard_filters=hard_filters,
    soft_preferences=soft_preferences,
    refine_residuals=refine_residuals,
  )
  semantic = build_semantic_scores(catalog, query_text, settings=settings)
  ranked = rank_candidates(
    candidates,
    hard_filters=hard_filters,
    soft_preferences=soft_preferences,
    semantic_scores=semantic.scores,
    score_weights_v2=bool(settings.auradin_score_weights_v2),
  )
  return {
    "candidateCountBefore": len(candidates_before),
    "candidateCountAfterFilters": len(candidates),
    "hardFilters": hard_filters,
    "softPreferences": soft_preferences,
    "queryText": query_text,
    "retrievalBackend": semantic.backend,
    "retrievalStatus": semantic.status,
    "retrievalDegradedReason": semantic.degradedReason,
    "ranked": ranked,
  }


def _default_vector_index_path(
  settings: Settings | None = None,
  catalog: AuradinCatalog | None = None,
) -> Path:
  if catalog is not None and catalog.snapshot is not None:
    return catalog.snapshot.vector_path
  from .snapshot_manifest import resolve_and_validate_snapshot

  return resolve_and_validate_snapshot(settings or get_settings()).vector_path


def _configured_vector_index_path(settings: Settings, catalog: AuradinCatalog | None = None) -> Path:
  if settings.auradin_vector_index_path:
    return Path(settings.auradin_vector_index_path).expanduser()

  return _default_vector_index_path(settings, catalog)


def build_semantic_scores(
  catalog: AuradinCatalog,
  query_text: str,
  *,
  settings: Settings,
) -> SemanticResult:
  backend = (settings.auradin_retrieval_backend or "auto").strip().lower()
  if backend not in {"auto", "lexical", "embedding"}:
    backend = "auto"

  index_path = _configured_vector_index_path(settings, catalog)
  degraded_reason: str | None = None
  if backend in {"auto", "embedding"}:
    try:
      if index_path.exists():
        metadata = load_vector_index_metadata(index_path)
        index_model_id = str(metadata.get("modelId") or "").strip()
        if index_model_id == "hash-fallback":
          embedding_client = HashEmbeddingClient(
            dimension=int(metadata.get("dimension") or settings.embedding_dimension or 1024),
          )
          retrieval_label = "embedding_file_hash"
        elif index_model_id and index_model_id != settings.effective_embedding_model_id:
          if backend == "embedding":
            return SemanticResult(
              status="incompatible",
              backend="embedding_incompatible_model",
              degradedReason="embedding_model_mismatch",
            )
          scores = FileVectorIndex(catalog.chunks).search(query_text)
          return SemanticResult(
            scores=scores,
            status="ok" if scores else "no_match",
            backend="lexical_model_mismatch",
            degradedReason="embedding_model_mismatch",
          )
        else:
          embedding_client = build_embedding_client(settings)
          retrieval_label = "embedding_file_bedrock"

        scores = EmbeddingVectorIndex.load(
          index_path,
          chunks=catalog.chunks,
          embedding_client=embedding_client,
        ).search(query_text)
        return SemanticResult(
          scores=scores,
          status="ok" if scores else "no_match",
          backend=retrieval_label,
        )

      if settings.auradin_vector_index_autobuild:
        embedding_client = build_embedding_client(settings)
        index = EmbeddingVectorIndex.build(
          catalog.chunks,
          embedding_client=embedding_client,
          metadata={
            "source": "runtime_autobuild",
            "modelId": settings.effective_embedding_model_id or "hash-fallback",
          },
        )
        index.save(index_path)
        scores = index.search(query_text)
        return SemanticResult(
          scores=scores,
          status="ok" if scores else "no_match",
          backend="embedding_autobuild",
        )
      degraded_reason = "embedding_index_missing"
    except Exception as exc:
      degraded_reason = f"embedding_{type(exc).__name__}"
      if backend == "embedding":
        return SemanticResult(
          status="unavailable",
          backend="embedding_failed",
          degradedReason=degraded_reason,
        )

  if backend == "embedding":
    return SemanticResult(
      status="unavailable",
      backend="embedding_missing",
      degradedReason=degraded_reason or "embedding_index_missing",
    )

  scores = FileVectorIndex(catalog.chunks).search(query_text)
  return SemanticResult(
    scores=scores,
    status="ok" if scores else "no_match",
    backend="lexical_file",
    degradedReason=degraded_reason,
  )
