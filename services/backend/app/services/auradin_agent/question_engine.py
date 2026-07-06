from __future__ import annotations

import math
from collections import Counter
from typing import Any

from .ranking import top_score_gap
from .retrieval_service import matches_filter

# 점수갭 즉답 종료가 반응하는 하드 조건 (명시 category/price/channel)
HARD_CONSTRAINT_ATTRIBUTES = {"category", "priceKrw", "channel"}


ATTRIBUTE_PRIORITY = {
  "finish": 1.2,
  "texture": 1.15,
  "priceTier": 1.1,
  "category": 1.05,
  "channel": 0.95,
  "colorFamily": 0.9,
  "intensity": 0.55,
  "undertone": 0.45,
  "suitableFor": 0.4,
}

ATTRIBUTE_LABELS = {
  "category": {
    "lip": "립",
    "cheek": "블러셔/치크",
    "shadow": "아이섀도우",
  },
  "priceTier": {
    "under_15k": "1만 5천원 이하",
    "15k_25k": "1만 5천~2만 5천원",
    "25k_40k": "2만 5천~4만원",
    "over_40k": "4만원 이상",
  },
  "channel": {
    "oliveyoung": "올리브영에서 바로 보기",
    "department_store": "백화점/계열몰 위주",
    "naver": "구매 링크만 있으면 괜찮아요",
  },
  "finish": {
    "glossy": "촉촉한 광택감",
    "matte": "보송한 매트",
    "velvet": "블러/벨벳",
    "satin": "새틴",
    "sheer": "맑고 투명한 느낌",
    "shimmer": "은은한 쉬머",
  },
  "texture": {
    "tint": "틴트",
    "balm": "밤",
    "gloss": "글로스",
    "cream": "크림",
    "powder": "파우더",
    "liquid": "리퀴드",
    "palette": "팔레트",
  },
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
}

QUESTION_TITLES = {
  "category": "어느 부위를 먼저 찾아볼까요?",
  "priceTier": "예산은 어느 정도가 편해요?",
  "channel": "구매처는 어느 쪽이 좋아요?",
  "finish": "마무리감은 어느 쪽이 좋아요?",
  "texture": "제형은 어떤 쪽이 편해요?",
  "colorFamily": "색감은 어느 쪽이 더 끌려요?",
}

HARD_ATTRIBUTES = {"category", "priceTier", "channel", "finish", "texture"}
SOFT_ATTRIBUTES = {"colorFamily"}


def _clean(value: Any) -> str:
  return str(value or "").strip()


def _as_list(value: Any) -> list[Any]:
  return value if isinstance(value, list) else []


def _value_for(item: dict[str, Any], attribute: str) -> str | None:
  attrs = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
  if attribute == "category":
    return _clean(item.get("category"))
  if attribute == "priceTier":
    return _clean(item.get("liveOffer", {}).get("priceTier"))
  if attribute == "channel":
    retail = item.get("retailPresence") if isinstance(item.get("retailPresence"), dict) else {}
    if retail.get("oliveYoung", {}).get("listed") is True:
      return "oliveyoung"
    if retail.get("departmentStore", {}).get("listed") is True:
      return "department_store"
    return "naver"
  value = attrs.get(attribute)
  if isinstance(value, list):
    return _clean(value[0]) if value else None
  return _clean(value) or None


def _confidence_for(item: dict[str, Any], attribute: str) -> float:
  if attribute in {"category", "priceTier"}:
    return 0.9
  if attribute == "channel":
    retail = item.get("retailPresence") if isinstance(item.get("retailPresence"), dict) else {}
    if retail.get("oliveYoung", {}).get("listed") is True:
      return float(retail.get("oliveYoung", {}).get("confidence") or 0.8)
    if retail.get("departmentStore", {}).get("listed") is True:
      return float(retail.get("departmentStore", {}).get("confidence") or 0.8)
    return 0.65
  confidence = item.get("attributeConfidence") if isinstance(item.get("attributeConfidence"), dict) else {}
  return float(confidence.get(attribute) or 0)


def _hard_eligible_for(item: dict[str, Any], attribute: str) -> bool:
  if attribute in {"category", "priceTier", "channel"}:
    return True
  hard = item.get("hardFilterEligible") if isinstance(item.get("hardFilterEligible"), dict) else {}
  return bool(hard.get(attribute))


def _entropy(counter: Counter[str]) -> float:
  total = sum(counter.values())
  if total <= 0:
    return 0.0
  entropy = 0.0
  for count in counter.values():
    probability = count / total
    entropy -= probability * math.log2(probability)
  return entropy


def _locked_attributes(intent: dict[str, Any]) -> set[str]:
  locked = {
    _clean(filter_delta.get("attribute"))
    for filter_delta in intent.get("lockedFilters", [])
    if filter_delta.get("locked")
  }
  if "priceKrw" in locked:
    locked.add("priceTier")
  return locked


def _candidate_items(ranked: list[dict[str, Any]], limit: int = 40) -> list[dict[str, Any]]:
  return [row["item"] for row in ranked[:limit]]


def analyze_attributes(
  ranked: list[dict[str, Any]],
  *,
  asked_attributes: list[str],
  intent: dict[str, Any],
) -> list[dict[str, Any]]:
  items = _candidate_items(ranked)
  asked = set(asked_attributes)
  locked = _locked_attributes(intent)
  analyses: list[dict[str, Any]] = []

  for attribute in ("category", "priceTier", "finish", "texture", "channel", "colorFamily"):
    values = [_value_for(item, attribute) for item in items]
    known_values = [value for value in values if value]
    counter = Counter(known_values)
    total = len(items)
    coverage = len(known_values) / total if total else 0
    confidence = (
      sum(_confidence_for(item, attribute) for item in items if _value_for(item, attribute))
      / max(len(known_values), 1)
    )
    dominant_share = max(counter.values()) / max(sum(counter.values()), 1) if counter else 1
    hard_ratio = (
      sum(1 for item in items if _value_for(item, attribute) and _hard_eligible_for(item, attribute))
      / max(len(known_values), 1)
    )
    question_mode = "hard" if attribute in HARD_ATTRIBUTES and hard_ratio >= 0.45 else "soft"
    actionability = 1.0 if question_mode == "hard" else 0.62
    gain = (
      _entropy(counter)
      * coverage
      * confidence
      * ATTRIBUTE_PRIORITY.get(attribute, 0.5)
      * actionability
    )
    excluded_reason = None
    if attribute in asked:
      excluded_reason = "already_asked"
    elif attribute in locked and attribute not in {"finish", "texture", "colorFamily"}:
      excluded_reason = "locked_by_prompt"
    elif len(counter) < 2:
      excluded_reason = "single_value"
    elif dominant_share >= 0.85:
      excluded_reason = "dominant_value"
    elif question_mode == "hard" and coverage < 0.45:
      excluded_reason = "low_hard_coverage"
    elif question_mode == "soft" and coverage < 0.25:
      excluded_reason = "low_soft_coverage"
    elif confidence < 0.5:
      excluded_reason = "low_confidence"

    analyses.append(
      {
        "attribute": attribute,
        "gain": round(gain, 6),
        "coverage": round(coverage, 4),
        "confidence": round(confidence, 4),
        "uxPriority": ATTRIBUTE_PRIORITY.get(attribute, 0.5),
        "actionability": actionability,
        "questionMode": question_mode,
        "valueDistribution": dict(counter),
        "excludedReason": excluded_reason,
      },
    )

  return sorted(analyses, key=lambda row: row["gain"], reverse=True)


def _filter_delta(attribute: str, value: str, mode: str, confidence: float) -> dict[str, Any]:
  return {
    "attribute": attribute,
    "op": "eq",
    "values": [value],
    "source": "question",
    "locked": False,
    "confidence": confidence,
    "mode": mode,
  }


def _expected_count(items: list[dict[str, Any]], filter_delta: dict[str, Any], mode: str) -> int:
  if filter_delta.get("op") == "noop" or mode == "soft":
    return len(items)
  return sum(1 for item in items if matches_filter(item, filter_delta))


def build_question(
  ranked: list[dict[str, Any]],
  analysis: dict[str, Any],
  *,
  question_count: int,
) -> dict[str, Any] | None:
  attribute = analysis["attribute"]
  distribution = analysis.get("valueDistribution") or {}
  mode = analysis.get("questionMode") or "soft"
  items = _candidate_items(ranked)
  values = [
    value
    for value, _count in sorted(distribution.items(), key=lambda row: row[1], reverse=True)
    if value in ATTRIBUTE_LABELS.get(attribute, {}) and not (attribute == "channel" and value == "naver")
  ][:3]
  options: list[dict[str, Any]] = []

  for value in values:
    delta = _filter_delta(attribute, value, mode, float(analysis.get("confidence") or 0.6))
    expected_count = _expected_count(items, delta, mode)
    if expected_count <= 0:
      continue
    options.append(
      {
        "id": f"{attribute}-{value}",
        "label": ATTRIBUTE_LABELS.get(attribute, {}).get(value, value),
        "expectedCandidateCount": expected_count,
        "filterDelta": delta,
        "mode": mode,
      },
    )

  if len(options) < 2:
    return None

  options.append(
    {
      "id": f"{attribute}-noop",
      "label": "상관 없어요",
      "expectedCandidateCount": len(items),
      "filterDelta": {
        "attribute": attribute,
        "op": "noop",
        "source": "question",
        "locked": False,
        "confidence": 1,
        "mode": "soft",
      },
      "mode": "soft",
    },
  )
  return {
    "id": f"q-{question_count + 1}-{attribute}",
    "attribute": attribute,
    "type": mode,
    "title": QUESTION_TITLES.get(attribute, "조금 더 좁혀볼까요?"),
    "expectedCandidateCount": len(items),
    "options": options,
  }


def propose_question(
  ranked: list[dict[str, Any]],
  *,
  asked_attributes: list[str],
  intent: dict[str, Any],
  question_count: int,
  last_answer_was_noop: bool,
  score_gap_threshold: float | None = None,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
  analyses = analyze_attributes(ranked, asked_attributes=asked_attributes, intent=intent)
  viable = [analysis for analysis in analyses if not analysis.get("excludedReason")]
  best = viable[0] if viable else None
  locked = _locked_attributes(intent)
  if intent.get("broad") and "category" not in locked:
    category_analysis = next(
      (analysis for analysis in viable if analysis.get("attribute") == "category"),
      None,
    )
    if category_analysis:
      best = category_analysis
  candidate_count = len(ranked)
  top_scores = [round(float(row["score"]), 6) for row in ranked[:3]]
  score_gap = top_score_gap(ranked)
  decision_log = {
    "step": question_count + 1,
    "candidateCountBefore": candidate_count,
    "topScoresBefore": top_scores,
    "scoreGap": round(score_gap, 6),
    "proposedAttributes": analyses,
  }

  # §11 점수갭 즉답 종료 — 하드 조건이 있고 anchor 갭이 결정적이면 질문 없이 결과로.
  # (§0-B: 질문은 정체성이 아니라 후보 좁히는 수단 — 좁힐 게 명확하면 스킵.)
  if (
    score_gap_threshold is not None
    and locked & HARD_CONSTRAINT_ATTRIBUTES
    and score_gap >= score_gap_threshold
  ):
    decision_log["earlyTermination"] = {"reason": "decisive_score_gap", "gap": round(score_gap, 6)}
    return None, decision_log

  if question_count >= 3 or not best or candidate_count == 0:
    return None, decision_log

  should_ask = False
  if intent.get("broad") and question_count < 1:
    should_ask = True
  elif intent.get("broad") and question_count < 2 and not last_answer_was_noop:
    should_ask = best["gain"] >= 0.08
  elif intent.get("requiresQuestion") and question_count < 1:
    should_ask = best["gain"] >= 0.04
  elif candidate_count > 8:
    should_ask = best["gain"] >= (0.18 if last_answer_was_noop else 0.1)

  if not should_ask:
    return None, decision_log

  question = build_question(ranked, best, question_count=question_count)
  if not question:
    return None, decision_log

  decision_log["selectedQuestion"] = {
    "questionId": question["id"],
    "attribute": question["attribute"],
    "type": question["type"],
  }
  return question, decision_log
