from __future__ import annotations

from pathlib import Path
from typing import Any

from app.core.settings import Settings, get_settings

from .catalog_loader import AuradinCatalog
from .embedding_client import HashEmbeddingClient, build_embedding_client
from .ranking import rank_candidates
from .vector_index import EmbeddingVectorIndex, FileVectorIndex, load_vector_index_metadata


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
    values = ["naver"]
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
    number_value = int(filter_delta.get("numberValue") or 0)
    if op == "lte":
      return price <= number_value
    if op == "gte":
      return price >= number_value
    return True

  values = [_clean(value) for value in _as_list(filter_delta.get("values")) if _clean(value)]
  if not values:
    return True

  item_values = _item_values(item, attribute)
  if op == "eq":
    return any(value in item_values for value in values)
  if op == "in":
    return any(value in item_values for value in values)
  return True


def apply_hard_filters(items: list[dict[str, Any]], hard_filters: list[dict[str, Any]]) -> list[dict[str, Any]]:
  filtered = items
  for filter_delta in hard_filters:
    if _clean(filter_delta.get("mode")) == "soft":
      continue
    filtered = [item for item in filtered if matches_filter(item, filter_delta)]
  return filtered


def build_query_text(intent: dict[str, Any], answers: list[dict[str, Any]]) -> str:
  filter_text = " ".join(
    f"{filter_delta.get('attribute')}={filter_delta.get('values') or filter_delta.get('numberValue')}"
    for filter_delta in intent.get("lockedFilters", [])
  )
  soft_text = " ".join(
    f"{preference.get('attribute')}={preference.get('values')}"
    for preference in intent.get("softPreferences", [])
  )
  answer_text = " ".join(
    f"{answer.get('filterDelta', {}).get('attribute')}={answer.get('filterDelta', {}).get('values')}"
    for answer in answers
  )
  return " ".join(
    part
    for part in [
      f"사용자 요청: {intent.get('prompt')}",
      f"확정 조건: {filter_text}",
      f"취향 단서: {soft_text}",
      f"답변 조건: {answer_text}",
    ]
    if part.strip()
  )


def split_answer_deltas(answers: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
  hard_filters: list[dict[str, Any]] = []
  soft_preferences: list[dict[str, Any]] = []
  for answer in answers:
    delta = answer.get("filterDelta") if isinstance(answer.get("filterDelta"), dict) else {}
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
  extra_query_text: str | None = None,
) -> dict[str, Any]:
  answers = answers or []
  settings = settings or get_settings()
  answer_hard_filters, answer_soft_preferences = split_answer_deltas(answers)
  # §7 refine 출처 필터는 원 프롬프트/답변 출처 뒤에 가산 — 원 출처는 불변.
  hard_filters = [*intent.get("lockedFilters", []), *answer_hard_filters, *(extra_hard_filters or [])]
  soft_preferences = [*intent.get("softPreferences", []), *answer_soft_preferences, *(extra_soft_preferences or [])]
  candidates_before = list(catalog.items)
  candidates = apply_hard_filters(candidates_before, hard_filters)
  query_text = build_query_text(intent, answers)
  if _clean(extra_query_text):
    query_text = f"{query_text} 추가 요청: {_clean(extra_query_text)}"
  semantic_scores, retrieval_backend = build_semantic_scores(catalog, query_text, settings=settings)
  ranked = rank_candidates(
    candidates,
    hard_filters=hard_filters,
    soft_preferences=soft_preferences,
    semantic_scores=semantic_scores,
  )
  return {
    "candidateCountBefore": len(candidates_before),
    "candidateCountAfterFilters": len(candidates),
    "hardFilters": hard_filters,
    "softPreferences": soft_preferences,
    "queryText": query_text,
    "retrievalBackend": retrieval_backend,
    "ranked": ranked,
  }


def _default_vector_index_path() -> Path:
  from .catalog_loader import REPO_ROOT, RUN_DATE

  return REPO_ROOT / "data" / "auradin" / "vector" / f"product_knowledge_vector_index_mvp_{RUN_DATE}.json"


def _configured_vector_index_path(settings: Settings) -> Path:
  if settings.auradin_vector_index_path:
    return Path(settings.auradin_vector_index_path).expanduser()

  return _default_vector_index_path()


def build_semantic_scores(
  catalog: AuradinCatalog,
  query_text: str,
  *,
  settings: Settings,
) -> tuple[dict[str, float], str]:
  backend = (settings.auradin_retrieval_backend or "auto").strip().lower()
  if backend not in {"auto", "lexical", "embedding"}:
    backend = "auto"

  index_path = _configured_vector_index_path(settings)
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
            return {}, "embedding_incompatible_model"
          return FileVectorIndex(catalog.chunks).search(query_text), "lexical_model_mismatch"
        else:
          embedding_client = build_embedding_client(settings)
          retrieval_label = "embedding_file_bedrock"

        return (
          EmbeddingVectorIndex.load(
            index_path,
            chunks=catalog.chunks,
            embedding_client=embedding_client,
          ).search(query_text),
          retrieval_label,
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
        return index.search(query_text), "embedding_autobuild"
    except Exception:
      if backend == "embedding":
        return {}, "embedding_failed"

  if backend == "embedding":
    return {}, "embedding_missing"

  return FileVectorIndex(catalog.chunks).search(query_text), "lexical_file"
