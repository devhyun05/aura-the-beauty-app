from __future__ import annotations

import hashlib
import re
from typing import Any

from .attribute_evaluator import evaluate_attribute
from .preference_policy import EXPLICIT_PREFERENCE_SOURCES, resolve_preferences
from .quality_policy import quality_caveats
from .taste_profile import CAP_PROFILE, PROFILE_ANCHOR_TOP_K, profile_raw_score
from .title_keyword_extractor import normalize_product_name


ATTRIBUTE_LABELS = {
  "colorFamily": {
    "pink": "핑크",
    "rose": "로즈",
    "coral": "코랄",
    "red": "레드",
    "orange": "오렌지",
    "mauve": "모브",
    "brown": "브라운",
    "nude": "누드",
    "peach": "피치",
    "burgundy": "버건디",
    "plum": "플럼",
  },
  "finish": {
    "glossy": "글로시",
    "matte": "매트",
    "velvet": "벨벳",
    "satin": "새틴",
    "sheer": "시어",
    "shimmer": "쉬머",
  },
  "texture": {
    "balm": "밤",
    "tint": "틴트",
    "gloss": "글로스",
    "cream": "크림",
    "powder": "파우더",
    "liquid": "리퀴드",
    "palette": "팔레트",
  },
  "intensity": {
    "sheer": "은은한 발색",
    "medium": "데일리 발색",
    "bold": "선명한 발색",
  },
  "undertone": {
    "cool": "쿨톤 단서",
    "warm": "웜톤 단서",
    "neutral": "뉴트럴 단서",
  },
}

CATEGORY_LABELS = {
  "lip": "립",
  "cheek": "블러셔/치크",
  "shadow": "아이섀도우",
  "base": "베이스",
  "brow": "브로우",
  "liner": "라이너",
}

# §5 랭킹 가중치 (튜너블). evidencedMatch(rule+evidence)를 주력으로,
# semantic은 낮게 둔다 — 현행 hash 임베딩은 max~0.13이라 상한을 눌러 매치율을 왜곡한다.
# Bedrock 실임베딩 전환(§11 6단계) 시 semantic 비중을 다시 올린다.
SCORE_WEIGHTS = {
  "rule": 0.40,
  "semantic": 0.08,
  "preference": 0.22,
  "evidence": 0.20,
  "liveOffer": 0.10,
}
SCORE_WEIGHTS_V2 = {
  "rule": 0.15,
  "semantic": 0.10,
  "preference": 0.35,
  "evidence": 0.30,
  "liveOffer": 0.10,
}

W_PREFERENCE = SCORE_WEIGHTS["preference"]
CAP_PROMPT = 0.11
CAP_REPORT = 0.02

# A4 intentionally starts with the only product-level opposite pair approved by
# the M1 plan.  Tone conflicts are source-resolution concerns; inferred tone must
# never become a hard product veto.
EXPLICIT_OPPOSITES: dict[str, dict[str, frozenset[str]]] = {
  "finish": {
    "glossy": frozenset({"matte"}),
    "matte": frozenset({"glossy"}),
  },
}

# §6 근거를 확정/추론으로 가를 때 훑는 속성 (undertone은 항상 caveat로 처리)
_REASON_FIELDS = ("finish", "texture", "colorFamily", "intensity")


def price_delta_matches(filter_delta: dict[str, Any], price: int) -> bool:
  """priceKrw 연산자 공용 판정 (A7) — lt/lte/gt/gte/between. 미지원 op는 fail-closed."""
  op = str(filter_delta.get("op") or "").strip()
  if op == "between":
    price_range = filter_delta.get("priceRange") or {}
    lower = int(price_range.get("lowerKrw") or 0)
    upper = int(price_range.get("upperKrw") or 0)
    low_ok = price >= lower if price_range.get("lowerInclusive", True) else price > lower
    high_ok = price <= upper if price_range.get("upperInclusive", True) else price < upper
    return low_ok and high_ok
  number_value = int(filter_delta.get("numberValue") or 0)
  if op == "lte":
    return price <= number_value
  if op == "lt":
    return price < number_value
  if op == "gte":
    return price >= number_value
  if op == "gt":
    return price > number_value
  return False


def price_filter_label(filter_delta: dict[str, Any]) -> str:
  """op별 정직한 가격 라벨 — 기존 'N원 이하' 고정(gte인데 '이하' 표시) 결함 수정."""
  op = str(filter_delta.get("op") or "").strip()
  if op == "between":
    price_range = filter_delta.get("priceRange") or {}
    lower = int(price_range.get("lowerKrw") or 0)
    upper = int(price_range.get("upperKrw") or 0)
    lower_text = f"{lower:,}원" if price_range.get("lowerInclusive", True) else f"{lower:,}원 초과"
    upper_text = f"{upper:,}원" if price_range.get("upperInclusive", True) else f"{upper:,}원 미만"
    return f"{lower_text}~{upper_text}"
  number_value = int(filter_delta.get("numberValue") or 0)
  suffix = {"lte": "이하", "lt": "미만", "gte": "이상", "gt": "초과"}.get(op, "이하")
  return f"{number_value:,}원 {suffix}"


def _clean(value: Any) -> str:
  return str(value or "").strip()


def _as_list(value: Any) -> list[Any]:
  return value if isinstance(value, list) else []


def _item_value(item: dict[str, Any], attribute: str) -> Any:
  attrs = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
  if attribute == "category":
    # category는 top-level 필드 — attrs에 없다. 없으면 rule_score가 조용히 0이 된다
    # (retrieval_service._item_values와 동일하게 처리).
    return item.get("category")
  if attribute == "priceTier":
    return item.get("liveOffer", {}).get("priceTier")
  if attribute == "channel":
    retail = item.get("retailPresence") if isinstance(item.get("retailPresence"), dict) else {}
    live_offer = item.get("liveOffer") if isinstance(item.get("liveOffer"), dict) else {}
    channels = ["naver"] if _clean(live_offer.get("purchaseUrl")) else []
    if retail.get("oliveYoung", {}).get("listed") is True:
      channels.append("oliveyoung")
    if retail.get("departmentStore", {}).get("listed") is True:
      channels.append("department_store")
    return channels
  if attribute in {"suitableFor", "sellingPoints", "occasion"}:
    if attribute == "occasion":
      return attrs.get("suitableFor", []) + attrs.get("sellingPoints", [])
    return attrs.get(attribute, [])
  return attrs.get(attribute)


def _matches(item: dict[str, Any], attribute: str, values: list[str]) -> bool:
  item_value = _item_value(item, attribute)
  if isinstance(item_value, list):
    return any(value in item_value for value in values)
  return item_value in values


def clamp01(value: float) -> float:
  return max(0.0, min(1.0, float(value)))


def score_weights(*, score_weights_v2: bool = False) -> dict[str, float]:
  """Return the flag-selected B8 weights without mutating the legacy baseline."""
  return SCORE_WEIGHTS_V2 if score_weights_v2 else SCORE_WEIGHTS


def _confidence(value: Any, *, default: float = 0.5) -> float:
  """Confidence contract: missing/None -> default, explicit 0.0 stays zero."""
  if value is None:
    return default
  try:
    number = float(value)
  except (TypeError, ValueError):
    return default
  if number != number or number in {float("inf"), float("-inf")}:
    return default
  return clamp01(number)


def _weight(value: Any) -> float:
  if value is None:
    return 1.0
  try:
    number = float(value)
  except (TypeError, ValueError):
    return 1.0
  if number != number or number in {float("inf"), float("-inf")}:
    return 1.0
  return max(0.0, number)


def _resolved_list(resolution: dict[str, Any] | list[dict[str, Any]] | None) -> list[dict[str, Any]]:
  if isinstance(resolution, dict):
    preferences = resolution.get("resolvedPreferences")
    return preferences if isinstance(preferences, list) else []
  return resolution if isinstance(resolution, list) else []


def _evidence_score(item: dict[str, Any]) -> float:
  evidence_types = set(item.get("evidenceSourceTypes") or [])
  score = 0.2
  if any(source.startswith("official") for source in evidence_types):
    score += 0.35
  if any("oliveyoung" in source for source in evidence_types):
    score += 0.25
  if any(source in evidence_types for source in ("prior_detail", "structured_extraction")):
    score += 0.15
  # 라이브 NAVER 오퍼 = 실재·구매가능의 실질 근거(공식 상세보다 약하나 무시할 근거는 아님).
  # 이 축을 0으로 두면 NAVER 시드 전 품목이 근거 바닥(0.2)에 깔려 매치율이 부당하게 눌린다.
  # 단, 오퍼만으로 evidence_floor(0.45)를 넘겨선 안 된다 — 그러면 §5 floor가 관련성 대신
  # 구매가능성만으로 뚫려 무의미해진다(0.2+0.2=0.4 < 0.45 유지).
  if "naver_live_offer" in evidence_types:
    score += 0.2
  if "retail_presence_from_live_offer" in evidence_types:
    score += 0.12
  if any(
    source in evidence_types
    for source in ("shade_option_text_inferred", "shade_option_tone_inferred")
  ):
    score += 0.1
  if "title_residual_rule_inferred" in evidence_types:
    score += 0.05
  return min(score, 1.0)


def _live_offer_score(item: dict[str, Any]) -> float:
  live_offer = item.get("liveOffer") if isinstance(item.get("liveOffer"), dict) else {}
  score = 0.0
  if live_offer.get("imageUrl"):
    score += 0.34
  if live_offer.get("purchaseUrl") or live_offer.get("offerId"):
    score += 0.33
  if int(live_offer.get("priceKrw") or 0) > 0:
    score += 0.33
  return min(score, 1.0)


def preference_deltas(
  item: dict[str, Any],
  resolution: dict[str, Any] | list[dict[str, Any]] | None,
  *,
  score_weights_v2: bool = False,
) -> dict[str, Any]:
  """R2a source-capped preference deltas in final-score units."""
  preference_weight = score_weights(score_weights_v2=score_weights_v2)["preference"]
  raw = {"prompt": 0.0, "report": 0.0}
  labels: list[str] = []
  item_confidence = (
    item.get("attributeConfidence") if isinstance(item.get("attributeConfidence"), dict) else {}
  )
  for preference in _resolved_list(resolution):
    attribute = _clean(preference.get("attribute"))
    source = _clean(preference.get("source"))
    values = [_clean(value) for value in _as_list(preference.get("values")) if _clean(value)]
    avoid_values = [_clean(value) for value in _as_list(preference.get("avoidValues")) if _clean(value)]
    # categoryScope가 있는 선호는 해당 카테고리 제품에만 적용한다(예: skin-type→
    # finish는 베이스/파우더에만). 범위 밖 제품은 이 선호를 건너뛴다.
    category_scope = [
      _clean(value) for value in _as_list(preference.get("categoryScope")) if _clean(value)
    ]
    if category_scope and _clean(item.get("category")) not in category_scope:
      continue
    sign = 0
    matched_value = ""
    if values and _matches(item, attribute, values):
      sign = 1
      matched_value = next((value for value in values if _matches(item, attribute, [value])), values[0])
      label = ATTRIBUTE_LABELS.get(attribute, {}).get(matched_value, matched_value)
      if label and label not in labels:
        labels.append(label)
    elif avoid_values and _matches(item, attribute, avoid_values):
      sign = -1
    if sign == 0:
      continue  # unknown/no match is neutral, never negative

    bucket = "report" if source == "report" else "prompt" if source in EXPLICIT_PREFERENCE_SOURCES else None
    if bucket is None:
      continue
    raw[bucket] += (
      sign
      * _weight(preference.get("weight"))
      * _confidence(preference.get("confidence"))
      * _confidence(item_confidence.get(attribute))
    )

  # R2a caps stay in final-score units under both weight sets. Only the raw
  # preference-component conversion follows the active W_PREF.
  prompt_delta = max(-CAP_PROMPT, min(CAP_PROMPT, raw["prompt"] * preference_weight))
  report_delta = max(-CAP_REPORT, min(CAP_REPORT, raw["report"] * preference_weight))
  return {
    "promptPreferenceDelta": prompt_delta,
    "reportPreferenceDelta": report_delta,
    "rawPromptPreference": raw["prompt"],
    "rawReportPreference": raw["report"],
    "matchedLabels": labels,
  }


def _known_hard_match(item: dict[str, Any], filter_delta: dict[str, Any]) -> bool:
  if _clean(filter_delta.get("mode")) == "soft" or _clean(filter_delta.get("source")) == "report":
    return False
  attribute = _clean(filter_delta.get("attribute"))
  op = _clean(filter_delta.get("op"))
  if not attribute or op in {"", "noop"}:
    return False
  if attribute == "priceKrw":
    price = int((item.get("liveOffer") or {}).get("priceKrw") or 0)
    return price > 0 and price_delta_matches(filter_delta, price)
  values = [_clean(value) for value in _as_list(filter_delta.get("values")) if _clean(value)]
  evaluation = evaluate_attribute(item, attribute, values)
  return evaluation["knowledge"] == "known" and evaluation["valueMatches"]


def evaluate_explicit_preference_match(
  item: dict[str, Any],
  resolution: dict[str, Any] | list[dict[str, Any]] | None,
  *,
  hard_filters: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
  """F18 primitive reused by floor and R2a; report-only never opens floor."""
  resolution_dict = resolution if isinstance(resolution, dict) else {}
  provenance_by_preference = resolution_dict.get("provenanceByPreference")
  if not isinstance(provenance_by_preference, dict):
    provenance_by_preference = {}
  matched_preference_ids: list[str] = []
  for preference in _resolved_list(resolution):
    if _clean(preference.get("source")) not in EXPLICIT_PREFERENCE_SOURCES:
      continue
    values = [_clean(value) for value in _as_list(preference.get("values")) if _clean(value)]
    if values and _matches(item, _clean(preference.get("attribute")), values):
      matched_preference_ids.append(_clean(preference.get("preferenceId")))

  matched_hard = [
    {
      "attribute": _clean(filter_delta.get("attribute")),
      "source": _clean(filter_delta.get("source")),
      "op": _clean(filter_delta.get("op")),
      "values": [_clean(value) for value in _as_list(filter_delta.get("values")) if _clean(value)],
    }
    for filter_delta in (hard_filters or [])
    if _known_hard_match(item, filter_delta)
  ]
  return {
    "matchedExplicitPref": bool(matched_preference_ids),
    "matchedKnownHardConstraint": bool(matched_hard),
    "provenance": {
      "matchedPreferenceIds": matched_preference_ids,
      "matchedPreferences": [
        provenance_by_preference[preference_id]
        for preference_id in matched_preference_ids
        if preference_id in provenance_by_preference
      ],
      "matchedHardConstraints": matched_hard,
    },
  }


def compute_score_components(
  *,
  rule_score: float,
  semantic_score: float,
  evidence_score: float,
  live_offer_score: float,
  prompt_preference_delta: float,
  report_preference_delta: float,
  score_weights_v2: bool = False,
) -> dict[str, float]:
  """Single unrounded R2a score function; every delta is in final-score units."""
  weights = score_weights(score_weights_v2=score_weights_v2)
  preference_weight = weights["preference"]
  preference_base = 0.5 * preference_weight
  score_before_clamp = (
    weights["rule"] * rule_score
    + weights["semantic"] * semantic_score
    + preference_base
    + prompt_preference_delta
    + report_preference_delta
    + weights["evidence"] * evidence_score
    + weights["liveOffer"] * live_offer_score
  )
  return {
    "preferenceBase": preference_base,
    "promptPreferenceDelta": prompt_preference_delta,
    "reportPreferenceDelta": report_preference_delta,
    "answerScore": clamp01(
      0.5 + (prompt_preference_delta + report_preference_delta) / preference_weight,
    ),
    "scoreBeforeClamp": score_before_clamp,
    "score": clamp01(score_before_clamp),
  }


def _rule_score(item: dict[str, Any], filters: list[dict[str, Any]]) -> float:
  if not filters:
    return 0.55

  matched = 0
  total = 0
  for filter_delta in filters:
    attribute = _clean(filter_delta.get("attribute"))
    op = _clean(filter_delta.get("op"))
    if op == "noop":
      continue
    if attribute == "priceKrw":
      total += 1
      price = int(item.get("liveOffer", {}).get("priceKrw") or 0)
      if price_delta_matches(filter_delta, price):
        matched += 1
      continue

    values = [_clean(value) for value in _as_list(filter_delta.get("values")) if _clean(value)]
    if _clean(filter_delta.get("source")) == "question" and _clean(filter_delta.get("mode")) != "soft":
      evaluation = evaluate_attribute(item, attribute, values)
      if evaluation["knowledge"] == "unknown":
        continue  # F11: unknown passes and stays neutral; it is not a failed rule match.
      total += 1
      if evaluation["valueMatches"]:
        matched += 1
      continue

    total += 1
    if values and _matches(item, attribute, values):
      matched += 1

  if total == 0:
    return 0.55
  return matched / total


def rank_candidates(
  items: list[dict[str, Any]],
  *,
  hard_filters: list[dict[str, Any]],
  soft_preferences: list[dict[str, Any]],
  semantic_scores: dict[str, float] | None = None,
  score_weights_v2: bool = False,
) -> list[dict[str, Any]]:
  ranked: list[dict[str, Any]] = []
  semantic_scores = semantic_scores or {}
  preference_resolution = resolve_preferences(soft_preferences)

  for item in items:
    rule_score = _rule_score(item, hard_filters)
    # F12: 빈 점수 맵은 no_match/unavailable의 실제 0점이다. 상태는 retrievalStatus로 보존한다.
    semantic_score = float(semantic_scores.get(item["id"], 0.0))
    evidence_score = _evidence_score(item)
    live_offer_score = _live_offer_score(item)
    deltas = preference_deltas(
      item,
      preference_resolution,
      score_weights_v2=score_weights_v2,
    )
    explicit_match = evaluate_explicit_preference_match(
      item,
      preference_resolution,
      hard_filters=hard_filters,
    )
    preference_conflict = evaluate_preference_conflict(item, preference_resolution)
    score_components = compute_score_components(
      rule_score=rule_score,
      semantic_score=semantic_score,
      evidence_score=evidence_score,
      live_offer_score=live_offer_score,
      prompt_preference_delta=float(deltas["promptPreferenceDelta"]),
      report_preference_delta=float(deltas["reportPreferenceDelta"]),
      score_weights_v2=score_weights_v2,
    )
    # rank_candidates is the current ranked-row serialization boundary: calculate
    # from raw values once, then round public numbers.  Exact arithmetic remains
    # testable through compute_score_components().
    components = {
      "ruleScore": round(rule_score, 4),
      "semanticScore": round(semantic_score, 4),
      "preferenceBase": round(score_components["preferenceBase"], 4),
      "promptPreferenceDelta": round(score_components["promptPreferenceDelta"], 4),
      "reportPreferenceDelta": round(score_components["reportPreferenceDelta"], 4),
      "answerScore": round(score_components["answerScore"], 4),
      "evidenceScore": round(evidence_score, 4),
      "liveOfferScore": round(live_offer_score, 4),
      "scoreBeforeClamp": round(score_components["scoreBeforeClamp"], 6),
      # Internal cache precision. This key is not exposed by to_result_product;
      # keeping it inside components lets the existing compact rankedCache retain
      # exact MMR/gap ordering without a session-manager schema change.
      "_scoreRaw": score_components["score"],
      "_scoreWeightsV2": score_weights_v2,
      "matchedExplicitPref": explicit_match["matchedExplicitPref"],
      "matchedKnownHardConstraint": explicit_match["matchedKnownHardConstraint"],
      "preferenceProvenance": explicit_match["provenance"],
      "preferenceResolutionId": preference_resolution["resolutionId"],
      # Cache the assessment, not the full shared resolution on every catalog
      # row. This preserves A4 through compact rankedCache without multiplying
      # identical provenance payloads hundreds of times.
      "preferenceConflict": preference_conflict,
    }
    ranked.append(
      {
        "item": item,
        "score": round(score_components["score"], 6),
        "_scoreRaw": score_components["score"],
        "components": components,
        "matchedExplicitPref": explicit_match["matchedExplicitPref"],
        "matchedKnownHardConstraint": explicit_match["matchedKnownHardConstraint"],
        "preferenceProvenance": explicit_match["provenance"],
        "preferenceResolutionId": preference_resolution["resolutionId"],
        "preferenceConflict": preference_conflict,
        "matchedLabels": deltas["matchedLabels"],
      },
    )

  # 동점 타이브레이크는 중립·재현 가능해야 한다 — brandName 정렬은 특정 브랜드를 체계적으로
  # 우대하고, Python hash()는 프로세스 salt로 재시작마다 순서가 바뀐다. SHA-256(id) 고정 다이제스트 사용.
  return sorted(
    ranked,
    key=lambda row: (_row_score_raw(row), _stable_tiebreak(row["item"]["id"])),
    reverse=True,
  )


def _stable_tiebreak(item_id: Any) -> str:
  return hashlib.sha256(str(item_id).encode("utf-8")).hexdigest()[:16]


def _row_score_raw(row: dict[str, Any]) -> float:
  if row.get("_scoreRaw") is not None:
    return float(row["_scoreRaw"])
  components = row.get("components") if isinstance(row.get("components"), dict) else {}
  if components.get("_scoreRaw") is not None:
    return float(components["_scoreRaw"])
  return float(row.get("score") or 0.0)


def top_score_gap(ranked: list[dict[str, Any]]) -> float:
  if len(ranked) < 2:
    return 1.0
  first = _row_score_raw(ranked[0])
  second = _row_score_raw(ranked[1])
  return max(0.0, first - second)


def _resolution_from_row(row: dict[str, Any]) -> dict[str, Any] | None:
  components = row.get("components") if isinstance(row.get("components"), dict) else {}
  resolution = components.get("preferenceResolution")
  return resolution if isinstance(resolution, dict) else None


def evaluate_preference_conflict(
  item: dict[str, Any],
  resolution: dict[str, Any] | list[dict[str, Any]] | None,
) -> dict[str, Any]:
  """A4 explicit-source conflict policy; report preferences have no veto power."""
  eligible = item.get("hardFilterEligible") if isinstance(item.get("hardFilterEligible"), dict) else {}
  direct_matches: list[str] = []
  confirmed_conflicts: list[str] = []
  inferred_conflicts: list[str] = []
  resolution_dict = resolution if isinstance(resolution, dict) else {}
  provenance_by_preference = resolution_dict.get("provenanceByPreference")
  if not isinstance(provenance_by_preference, dict):
    provenance_by_preference = {}
  explicit_preferences = [
    preference
    for preference in _resolved_list(resolution)
    if _clean(preference.get("source")) in EXPLICIT_PREFERENCE_SOURCES
  ]
  accepted_by_group: dict[tuple[str, Any], set[str]] = {}
  for preference_index, preference in enumerate(explicit_preferences):
    attribute = _clean(preference.get("attribute"))
    preference_id = _clean(preference.get("preferenceId"))
    preference_provenance = provenance_by_preference.get(preference_id)
    group_id = (
      preference_provenance.get("inputIndex")
      if isinstance(preference_provenance, dict)
      else preference_id or preference_index
    )
    accepted_by_group.setdefault((attribute, group_id), set()).update(
      _clean(value)
      for value in _as_list(preference.get("values"))
      if _clean(value)
    )

  for preference_index, preference in enumerate(explicit_preferences):
    attribute = _clean(preference.get("attribute"))
    preference_id = _clean(preference.get("preferenceId"))
    preference_provenance = provenance_by_preference.get(preference_id)
    group_id = (
      preference_provenance.get("inputIndex")
      if isinstance(preference_provenance, dict)
      else preference_id or preference_index
    )
    values = [_clean(value) for value in _as_list(preference.get("values")) if _clean(value)]
    avoid_values = [_clean(value) for value in _as_list(preference.get("avoidValues")) if _clean(value)]

    if values and _matches(item, attribute, values):
      direct_matches.append(preference_id)

    conflict_values = list(avoid_values)
    for value in values:
      conflict_values.extend(
        opposite
        for opposite in EXPLICIT_OPPOSITES.get(attribute, {}).get(value, frozenset())
        if opposite not in accepted_by_group.get((attribute, group_id), set())
      )
    conflict_values = sorted(set(conflict_values))
    if not conflict_values or not _matches(item, attribute, conflict_values):
      continue
    target = f"{attribute}:{next(value for value in conflict_values if _matches(item, attribute, [value]))}"
    # Inferred/unknown attributes must not be treated as negative evidence.
    if eligible.get(attribute) is True:
      confirmed_conflicts.append(target)
    else:
      inferred_conflicts.append(target)

  return {
    "directMatch": bool(direct_matches),
    "confirmedConflict": bool(confirmed_conflicts),
    "inferredConflict": bool(inferred_conflicts),
    "directPreferenceIds": direct_matches,
    "confirmedConflicts": confirmed_conflicts,
    "inferredConflicts": inferred_conflicts,
  }


def guard_conflicting_candidates(
  ranked: list[dict[str, Any]],
  resolution: dict[str, Any] | list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
  """Drop confirmed contradictions without ever reinserting them as unlabeled fallback.

  Direct positive matches stay first, neutral candidates follow, and inferred
  opposites are retained last with an explicit caveat (unknown != negative).
  """
  guarded: list[tuple[int, int, dict[str, Any]]] = []
  for index, row in enumerate(ranked):
    components = row.get("components") if isinstance(row.get("components"), dict) else {}
    cached_assessment = row.get("preferenceConflict") or components.get("preferenceConflict")
    if resolution is None and isinstance(cached_assessment, dict):
      assessment = cached_assessment
    else:
      row_resolution = resolution if resolution is not None else _resolution_from_row(row)
      assessment = evaluate_preference_conflict(row["item"], row_resolution)
    if assessment["confirmedConflict"]:
      continue
    guarded_row = {**row, "preferenceConflict": assessment}
    if assessment["inferredConflict"]:
      guarded_row["guardCaveats"] = ["반대 속성 단서가 있으나 정보가 확정되지 않아 후순위로 유지"]
    priority = 0 if assessment["directMatch"] else 2 if assessment["inferredConflict"] else 1
    guarded.append((priority, index, guarded_row))
  return [row for _priority, _index, row in sorted(guarded, key=lambda entry: (entry[0], entry[1]))]


def passes_floor(
  row: dict[str, Any],
  *,
  s_floor: float = 0.5,
  evidence_floor: float = 0.45,
  hard_filters: list[dict[str, Any]] | None = None,
) -> bool:
  """§5 floor 게이트 — 정당화 미달 후보를 정렬 전 컷.

  하드필터는 이미 pre-rank 적용됨. 랭크셋 안에서 최소 정당화(요청 매칭 / 의미 유사 /
  근거 품질) 중 하나라도 넘는 후보만 통과시켜 부익부·무근거 후보를 배제한다.
  임계값은 §13 열린 결정 — 슬라이스에서 캘리브레이션한다.
  """
  components = row.get("components") if isinstance(row.get("components"), dict) else {}
  matched_preference = components.get("matchedExplicitPref") is True
  strong_semantic = float(components.get("semanticScore", 0.0) or 0.0) >= s_floor
  strong_evidence = float(components.get("evidenceScore", 0.0) or 0.0) >= evidence_floor
  matched_known_hard = components.get("matchedKnownHardConstraint") is True
  provenance = components.get("preferenceProvenance")
  matched_hard_constraints = (
    provenance.get("matchedHardConstraints")
    if isinstance(provenance, dict) and isinstance(provenance.get("matchedHardConstraints"), list)
    else []
  )
  matched_known_topic = any(
    _clean(match.get("attribute")) in {"category", "priceKrw"}
    for match in matched_hard_constraints
    if isinstance(match, dict)
  )
  # Pair the topic lock with its own known match. A known finish match must not
  # accidentally validate an unmatched category lock merely because both are
  # represented by the aggregate matchedKnownHardConstraint boolean.
  hard_topic_match = (
    _has_hard_topic_lock(hard_filters)
    and matched_known_hard
    and matched_known_topic
  )
  return matched_preference or strong_semantic or strong_evidence or hard_topic_match


def _attribute_signature(item: dict[str, Any]) -> set[str]:
  # §10.3-3: colorFamily/finish/texture에 priceTier·category 추가 — 속성 커버리지가
  # 낮은 슬라이스에서 유사도가 '브랜드 다양성'으로 퇴화(F5)하는 것을 완화한다.
  attrs = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
  signature: set[str] = set()
  for field in ("colorFamily", "finish", "texture"):
    value = _clean(attrs.get(field))
    if value:
      signature.add(f"{field}:{value}")
  category = _clean(item.get("category"))
  if category:
    signature.add(f"category:{category}")
  price_tier = _clean((item.get("liveOffer") or {}).get("priceTier"))
  if price_tier:
    signature.add(f"priceTier:{price_tier}")
  return signature


def normalized_brand(value: Any) -> str:
  """브랜드 동일성 비교용 정규화 — 유사도 페널티·B6 '다른 브랜드' 필터 공용."""
  return re.sub(r"[^0-9a-z가-힣]+", "", _clean(value).lower())


def _similarity(item_a: dict[str, Any], item_b: dict[str, Any]) -> float:
  """MMR용 유사도 — 속성 Jaccard + 동일 브랜드 페널티(0~1)."""
  sig_a = _attribute_signature(item_a)
  sig_b = _attribute_signature(item_b)
  union = sig_a | sig_b
  jaccard = len(sig_a & sig_b) / len(union) if union else 0.0
  brand_a = normalized_brand(item_a.get("brandName"))
  brand_b = normalized_brand(item_b.get("brandName"))
  same_brand = bool(brand_a) and brand_a == brand_b
  return min(1.0, jaccard + (0.34 if same_brand else 0.0))


def attribute_similarity(item_a: dict[str, Any], item_b: dict[str, Any]) -> float:
  """B6 §10.3-2: 기준 제품 대비 속성 시그니처 유사도(0~1) — similar 액션의
  임시 soft preference 부스트로 쓰인다 (시그니처는 §10.3-3 확장분 포함)."""
  return _similarity(item_a, item_b)


def mmr_rerank(
  ranked: list[dict[str, Any]],
  *,
  lambda_: float = 0.7,
  top_n: int | None = None,
  preselected: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
  """§5 MMR 재랭킹: λ·relevance − (1−λ)·max_sim(이미 뽑힌 것).

  λ는 §7 refine 다이얼에 노출된다 (more_similar → λ↑, more_diverse → λ↓).
  ``preselected`` rows influence similarity but are never returned. ``top_n``
  is the number of *new* picks returned, including when seeds are present.
  """
  if not ranked:
    return []
  context = list(preselected or [])
  seeded_ids = {_clean(row.get("item", {}).get("id")) for row in context}
  remaining = [row for row in ranked if _clean(row.get("item", {}).get("id")) not in seeded_ids]
  selected: list[dict[str, Any]] = []
  limit = max(0, int(top_n)) if top_n is not None else len(remaining)
  while remaining and len(selected) < limit:
    if not context and not selected:
      selected.append(remaining.pop(0))
      continue
    best_index = 0
    best_value: float | None = None
    for index, row in enumerate(remaining):
      relevance = _row_score_raw(row)
      max_sim = max(
        (_similarity(row["item"], picked["item"]) for picked in [*context, *selected]),
        default=0.0,
      )
      value = lambda_ * relevance - (1.0 - lambda_) * max_sim
      if best_value is None or value > best_value:
        best_value = value
        best_index = index
    selected.append(remaining.pop(best_index))
  return selected


def normalized_product_key(item: dict[str, Any]) -> str:
  """Brand+product identity used before curated-seeded live MMR."""
  brand = _clean(item.get("brandName"))
  product = _clean(item.get("productName"))
  normalized_brand = re.sub(r"[^0-9a-z가-힣]+", "", brand.lower())
  normalized_product = re.sub(
    r"[^0-9a-z가-힣]+",
    "",
    normalize_product_name(product, brand).lower(),
  )
  return f"{normalized_brand}|{normalized_product}" if normalized_brand and normalized_product else ""


def dedupe_ranked_candidates(
  ranked: list[dict[str, Any]],
  *,
  against: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
  """Stable ID/name dedupe for curated+live candidate pools."""
  seen_ids = {_clean(row.get("item", {}).get("id")) for row in (against or [])}
  seen_keys = {
    key
    for row in (against or [])
    if (key := normalized_product_key(row.get("item", {})))
  }
  deduped: list[dict[str, Any]] = []
  for row in ranked:
    item = row.get("item") if isinstance(row.get("item"), dict) else {}
    item_id = _clean(item.get("id"))
    product_key = normalized_product_key(item)
    if item_id and item_id in seen_ids:
      continue
    if product_key and product_key in seen_keys:
      continue
    deduped.append(row)
    if item_id:
      seen_ids.add(item_id)
    if product_key:
      seen_keys.add(product_key)
  return deduped


def conditional_mmr_picks(
  ranked: list[dict[str, Any]],
  *,
  curated_seeds: list[dict[str, Any]],
  lambda_: float = 0.7,
  top_n: int,
) -> list[dict[str, Any]]:
  """Return new, deduped picks while curated rows act only as MMR context."""
  candidates = dedupe_ranked_candidates(ranked, against=curated_seeds)
  return mmr_rerank(
    candidates,
    lambda_=lambda_,
    top_n=top_n,
    preselected=curated_seeds,
  )


def assign_roles(
  reranked: list[dict[str, Any]],
  *,
  top_n: int = 3,
) -> list[tuple[dict[str, Any], str, str]]:
  """§5 3역할 배치.

  anchor = MMR 1위(가장 잘 근거된 정답), diverse = MMR 2위(대비 픽),
  discovery = anchor와 다른 브랜드의 최상위 픽. 라이브 Naver가 없는 슬라이스에선
  '발견' 슬롯을 큐레이션의 '다른 브랜드/티어' 픽으로 대체한다 (라이브 API는 §11 7단계).
  """
  if not reranked:
    return []
  anchor = reranked[0]
  anchor_brand = _clean(anchor["item"].get("brandName"))
  rest = reranked[1:]
  diverse = rest[0] if rest else None
  discovery = next(
    (row for row in rest if row is not diverse and _clean(row["item"].get("brandName")) != anchor_brand),
    None,
  )
  if discovery is None:  # 폴백: 브랜드가 전부 같으면 남은 것 중 다음 distinct
    discovery = next((row for row in rest if row is not diverse), None)

  roled: list[tuple[dict[str, Any], str, str]] = [(anchor, "anchor", "curated")]
  if diverse is not None:
    roled.append((diverse, "diverse", "curated"))
  if discovery is not None:
    roled.append((discovery, "discovery", "curated"))
  return roled[:top_n]


def select_anchor_with_profile(
  reranked: list[dict[str, Any]],
  taste_profile: dict[str, Any] | None,
  *,
  enabled: bool = False,
  explicit_attributes: frozenset[str] | set[str] = frozenset(),
  top_k: int = PROFILE_ANCHOR_TOP_K,
) -> dict[str, Any]:
  """B7 §7.3 — profileScore의 **유일한** 랭킹 개입 지점 (anchor-only, 새도 지원).

  MMR 상위 K개 한정으로 ``_row_score_raw + clip(profile_raw, ±CAP_PROFILE)``이
  가장 큰 행을 anchor 후보로 고른다. ``enabled=False``(새도 모드)면 순위는 절대
  바꾸지 않고 wouldBeAnchor만 계산해 로깅용으로 돌려준다. ``enabled=True``면
  reranked[0]과 스왑한다 — diverse/discovery 선정(assign_roles)·floor(passes_floor)·
  전체 정렬에는 profile 인자 자체가 없어 구조적으로 격리된다.
  """
  if not reranked or not isinstance(taste_profile, dict) or not taste_profile:
    return {"reranked": reranked, "profileAnchor": None}
  window = reranked[: max(1, int(top_k))]
  candidates: list[dict[str, Any]] = []
  best_index = 0
  best_adjusted: float | None = None
  for index, row in enumerate(window):
    raw = profile_raw_score(
      row.get("item") or {},
      taste_profile,
      explicit_attributes=explicit_attributes,
    )
    delta = max(-CAP_PROFILE, min(CAP_PROFILE, raw))
    adjusted = _row_score_raw(row) + delta
    candidates.append(
      {
        "id": _clean((row.get("item") or {}).get("id")),
        "baseScore": round(_row_score_raw(row), 6),
        "profileDelta": round(delta, 6),
        "adjustedScore": round(adjusted, 6),
      },
    )
    # 동점은 현행 anchor(선순위) 유지 — 새도/실적용 모두 결정론적.
    if best_adjusted is None or adjusted > best_adjusted:
      best_adjusted = adjusted
      best_index = index

  shadow = {
    "enabled": bool(enabled),
    "topK": len(window),
    "anchorId": candidates[0]["id"],
    "wouldBeAnchorId": candidates[best_index]["id"],
    "wouldBeAnchorIndex": best_index,
    "swapped": False,
    "profileDeltas": candidates,
  }
  if not enabled or best_index == 0:
    return {"reranked": reranked, "profileAnchor": shadow}
  swapped = list(reranked)
  swapped[0], swapped[best_index] = swapped[best_index], swapped[0]
  shadow["swapped"] = True
  return {"reranked": swapped, "profileAnchor": shadow}


def _has_hard_topic_lock(hard_filters: list[dict[str, Any]] | None) -> bool:
  """사용자가 category/priceKrw를 명시적으로 잠갔는가 — 잠갔다면 랭크셋 전체가 on-topic."""
  for filter_delta in hard_filters or []:
    if _clean(filter_delta.get("mode")) == "soft":
      continue
    attribute = _clean(filter_delta.get("attribute"))
    op = _clean(filter_delta.get("op"))
    if attribute in {"category", "priceKrw"} and op not in {"", "noop"}:
      return True
  return False


def build_slice_result(
  ranked: list[dict[str, Any]],
  *,
  lambda_: float = 0.7,
  s_floor: float = 0.5,
  hard_filters: list[dict[str, Any]] | None = None,
  extra_caveats: list[str] | None = None,
  top_n: int = 3,
  taste_profile: dict[str, Any] | None = None,
  profile_score_enabled: bool = False,
  profile_explicit_attributes: frozenset[str] | set[str] | None = None,
) -> dict[str, Any]:
  """floor → MMR → (B7 anchor-only profile) → 3역할 → 구조화 근거 합성 (§5/§6 계약 검증 진입점).

  ``taste_profile``은 floor·MMR·역할 함수의 입력이 아니다 — MMR이 끝난 뒤
  select_anchor_with_profile 한 지점에서만 소비된다 (§7.3 구조적 격리).
  """
  # A4 must run before floor/MMR.  In particular the hard-topic fallback below
  # may only draw from guarded rows; otherwise a rejected contradiction silently
  # returns without its conflict label.
  guarded = guard_conflicting_candidates(ranked)
  floored = [
    row
    for row in guarded
    if passes_floor(row, s_floor=s_floor, hard_filters=hard_filters)
  ]
  floored = dedupe_ranked_candidates(floored)
  floor_count = len(floored)
  # The old topic-lock fallback reinserted every guarded row when fewer than
  # top_n survived and thereby bypassed F18. Known category/price matches now
  # open the floor inside passes_floor itself; an unmatched/unknown row must not
  # be silently restored afterward. Keep the response field for compatibility.
  floor_fallback = False
  # F17: 역할 배치는 상위 소수만 소비하는데 floor 통과 전체를 O(n³) 재랭킹하면
  # 카탈로그 확장(618→2천+) 시 지연이 직결된다 — 역할 수 대비 여유 있는 12로 캡.
  reranked = mmr_rerank(floored, lambda_=lambda_, top_n=max(12, top_n * 4))
  profile_anchor = None
  if taste_profile:
    # B7: flag off(새도)면 wouldBeAnchor 계산·로깅만, on이면 anchor 스왑.
    selection = select_anchor_with_profile(
      reranked,
      taste_profile,
      enabled=profile_score_enabled,
      explicit_attributes=frozenset(profile_explicit_attributes or ()),
    )
    reranked = selection["reranked"]
    profile_anchor = selection["profileAnchor"]
  roled = assign_roles(reranked, top_n=top_n)
  products = [
    to_result_product(
      row,
      index,
      role=role,
      source=source,
      hard_filters=hard_filters,
      extra_caveats=[*(extra_caveats or []), *(row.get("guardCaveats") or [])],
    )
    for index, (row, role, source) in enumerate(roled)
  ]
  return {
    "rankedCount": len(ranked),
    "guardedCount": len(guarded),
    "floorCount": floor_count,
    "floorFallback": floor_fallback,
    "topScoreGap": round(top_score_gap(reranked), 6),
    "lambda": lambda_,
    "sFloor": s_floor,
    "profileAnchor": profile_anchor,
    "products": products,
  }


def _build_reason(
  item: dict[str, Any],
  *,
  hard_filters: list[dict[str, Any]] | None = None,
  extra_caveats: list[str] | None = None,
) -> dict[str, list[str]]:
  """§6 구조화 근거 — hardFilterEligible + attributeConfidence로 확정/추론/한계 분기.

  matchedOn: 확정 근거(명시 하드조건 + eligible·고신뢰 속성)
  inferred : 추론·헤지(eligible 아니거나 저신뢰 속성 단서)
  caveat   : 정직한 한계(톤·색 참고용, 상위에서 넘겨준 해석 주의)
  """
  attrs = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
  eligible = item.get("hardFilterEligible") if isinstance(item.get("hardFilterEligible"), dict) else {}
  confidence = item.get("attributeConfidence") if isinstance(item.get("attributeConfidence"), dict) else {}

  matched_on: list[str] = []
  inferred: list[str] = []
  caveat: list[str] = list(extra_caveats or [])

  category = _clean(item.get("category"))
  if category:
    matched_on.append(CATEGORY_LABELS.get(category, category))

  price = int((item.get("liveOffer") or {}).get("priceKrw") or 0)
  for filter_delta in hard_filters or []:
    if _clean(filter_delta.get("attribute")) != "priceKrw" or _clean(filter_delta.get("op")) == "noop":
      continue
    if price > 0 and price_delta_matches(filter_delta, price):
      matched_on.append(price_filter_label(filter_delta))

  for field in _REASON_FIELDS:
    value = _clean(attrs.get(field))
    if not value:
      continue
    label = ATTRIBUTE_LABELS.get(field, {}).get(value, value)
    if bool(eligible.get(field)) and float(confidence.get(field) or 0.0) >= 0.6:
      matched_on.append(label)
    else:
      inferred.append(f"{label} 단서")

  if _clean(attrs.get("undertone")):
    caveat.append("톤은 제품 단서 기반 참고용이며 확정 아님")
  if inferred:
    caveat.append("색·마감은 제품명·옵션 단서 기반이라 확정 아님")
  for quality_caveat in quality_caveats(item):
    if quality_caveat not in caveat:
      caveat.append(quality_caveat)

  return {"matchedOn": matched_on, "inferred": inferred, "caveat": caveat}


def _shade_name(item: dict[str, Any]) -> str:
  shade_options = _as_list(item.get("shadeOptions"))
  if shade_options and isinstance(shade_options[0], dict):
    return _clean(shade_options[0].get("shadeName") or shade_options[0].get("optionName"))
  color_family = item.get("attributes", {}).get("colorFamily")
  return ATTRIBUTE_LABELS["colorFamily"].get(color_family, "") if color_family else ""


def _shade_id(item: dict[str, Any]) -> str | None:
  shade_options = _as_list(item.get("shadeOptions"))
  if shade_options and isinstance(shade_options[0], dict):
    value = _clean(shade_options[0].get("shadeId"))
    return value or None
  return None


def _tags(item: dict[str, Any], matched_labels: list[str]) -> list[str]:
  attrs = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
  tags = [label for label in matched_labels if label]
  for field in ("finish", "texture", "colorFamily", "intensity"):
    value = attrs.get(field)
    label = ATTRIBUTE_LABELS.get(field, {}).get(value)
    if label and label not in tags:
      tags.append(label)
  for value in _as_list(attrs.get("sellingPoints"))[:2]:
    if _clean(value) and _clean(value) not in tags:
      tags.append(_clean(value))
  return tags[:5]


def to_result_product(
  row: dict[str, Any],
  rank_index: int,
  *,
  role: str | None = None,
  source: str = "curated",
  hard_filters: list[dict[str, Any]] | None = None,
  extra_caveats: list[str] | None = None,
) -> dict[str, Any]:
  item = row["item"]
  live_offer = item.get("liveOffer") if isinstance(item.get("liveOffer"), dict) else {}
  tags = _tags(item, row.get("matchedLabels", []))
  soft_only_fields = [
    field
    for field, eligible in (item.get("hardFilterEligible") or {}).items()
    if not eligible and item.get("attributes", {}).get(field)
  ]
  # §6 구조화 근거 (matchedOn/inferred/caveat) — 자유 문장 금지.
  reason = _build_reason(item, hard_filters=hard_filters, extra_caveats=extra_caveats)
  components = row.get("components") if isinstance(row.get("components"), dict) else {}
  if components.get("_scoreWeightsV2"):
    # R3 display score is deliberately independent from ranking score. Confirmed
    # evidence saturates at three chips so catalogue richness cannot dominate.
    confirmed_score = min(len(reason["matchedOn"]), 3) / 3
    display_score = (
      0.45 * clamp01(float(components.get("answerScore") or 0.0))
      + 0.40 * clamp01(float(components.get("evidenceScore") or 0.0))
      + 0.15 * confirmed_score
    )
    match_rate = max(1, min(99, int(round(display_score * 100))))
  else:
    match_rate = max(1, min(99, int(round(float(row["score"]) * 100))))
  return {
    "id": item["id"],
    "externalSource": (
      "auradin_catalog"
      if str(item.get("id") or "").startswith("auradin-seed-")
      else "auradin_search"
      if source == "live_naver"
      else None
    ),
    "role": role,  # §5 3역할: anchor | diverse | discovery (미배치 시 None)
    "source": source,  # curated | live_naver
    "brandName": item.get("brandName"),
    "productName": item.get("productName"),
    "shadeId": _shade_id(item),
    "shadeName": _shade_name(item),
    "category": item.get("category"),
    "matchRate": match_rate,
    "price": int(live_offer.get("priceKrw") or 0),
    "priceKrw": int(live_offer.get("priceKrw") or 0),
    "tags": tags,
    "imageUrl": live_offer.get("imageUrl"),
    "purchaseUrl": live_offer.get("purchaseUrl"),
    "offerId": live_offer.get("offerId"),
    "palette": item.get("palette") or [],
    "productInfo": {
      "brand": item.get("brandName"),
      "origin": item.get("brandOrigin", {}).get("brandCountry"),
      "maker": item.get("brandOrigin", {}).get("madeInCountry"),
      "features": item.get("attributes", {}).get("sellingPoints", []),
      "colors": [item.get("attributes", {}).get("colorFamily")] if item.get("attributes", {}).get("colorFamily") else [],
      "tones": [item.get("attributes", {}).get("undertone")] if item.get("attributes", {}).get("undertone") else [],
    },
    "reason": reason,
    "evidenceSummary": [
      "가격/이미지/구매 URL 확인",
      "입점 여부는 positive evidence만 사용",
      "색상/톤 단서는 낮은 신뢰도일 수 있어 확정 표현을 피함",
    ],
    "softOnlyFields": soft_only_fields,
    "rank": rank_index + 1,
  }
