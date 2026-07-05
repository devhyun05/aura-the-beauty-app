from __future__ import annotations

from typing import Any


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

CATEGORY_LABELS = {"lip": "립", "cheek": "블러셔/치크", "shadow": "아이섀도우"}

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

# §6 근거를 확정/추론으로 가를 때 훑는 속성 (undertone은 항상 caveat로 처리)
_REASON_FIELDS = ("finish", "texture", "colorFamily", "intensity")


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
    channels = ["naver"]
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


def _evidence_score(item: dict[str, Any]) -> float:
  evidence_types = set(item.get("evidenceSourceTypes") or [])
  score = 0.2
  if any(source.startswith("official") for source in evidence_types):
    score += 0.35
  if any("oliveyoung" in source for source in evidence_types):
    score += 0.25
  if any(source in evidence_types for source in ("prior_detail", "structured_extraction")):
    score += 0.15
  if "title_residual_rule_inferred" in evidence_types:
    score += 0.05
  return min(score, 1.0)


def _live_offer_score(item: dict[str, Any]) -> float:
  live_offer = item.get("liveOffer") if isinstance(item.get("liveOffer"), dict) else {}
  score = 0.0
  if live_offer.get("imageUrl"):
    score += 0.34
  if live_offer.get("purchaseUrl"):
    score += 0.33
  if int(live_offer.get("priceKrw") or 0) > 0:
    score += 0.33
  return min(score, 1.0)


def _preference_score(item: dict[str, Any], preferences: list[dict[str, Any]]) -> tuple[float, list[str]]:
  if not preferences:
    return 0.5, []

  total_weight = 0.0
  matched_weight = 0.0
  labels: list[str] = []
  for preference in preferences:
    attribute = _clean(preference.get("attribute"))
    values = [_clean(value) for value in _as_list(preference.get("values")) if _clean(value)]
    avoid_values = [_clean(value) for value in _as_list(preference.get("avoidValues")) if _clean(value)]
    weight = float(preference.get("weight") or 1.0)
    total_weight += weight

    if values and _matches(item, attribute, values):
      matched_weight += weight
      label_value = next((value for value in values if _matches(item, attribute, [value])), values[0])
      labels.append(ATTRIBUTE_LABELS.get(attribute, {}).get(label_value, label_value))

    if avoid_values and _matches(item, attribute, avoid_values):
      matched_weight -= weight * 0.5

  if total_weight <= 0:
    return 0.5, labels
  return max(0.0, min(1.0, matched_weight / total_weight)), labels


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
    total += 1
    if attribute == "priceKrw":
      price = int(item.get("liveOffer", {}).get("priceKrw") or 0)
      number_value = int(filter_delta.get("numberValue") or 0)
      if op == "lte" and price <= number_value:
        matched += 1
      elif op == "gte" and price >= number_value:
        matched += 1
      continue

    values = [_clean(value) for value in _as_list(filter_delta.get("values")) if _clean(value)]
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
) -> list[dict[str, Any]]:
  ranked: list[dict[str, Any]] = []
  semantic_scores = semantic_scores or {}

  for item in items:
    preference_score, matched_labels = _preference_score(item, soft_preferences)
    rule_score = _rule_score(item, hard_filters)
    semantic_score = semantic_scores.get(item["id"], 0.5 if not semantic_scores else 0.0)
    evidence_score = _evidence_score(item)
    live_offer_score = _live_offer_score(item)
    final_score = (
      SCORE_WEIGHTS["rule"] * rule_score
      + SCORE_WEIGHTS["semantic"] * semantic_score
      + SCORE_WEIGHTS["preference"] * preference_score
      + SCORE_WEIGHTS["evidence"] * evidence_score
      + SCORE_WEIGHTS["liveOffer"] * live_offer_score
    )
    ranked.append(
      {
        "item": item,
        "score": round(final_score, 6),
        "components": {
          "ruleScore": round(rule_score, 4),
          "semanticScore": round(semantic_score, 4),
          "answerScore": round(preference_score, 4),
          "evidenceScore": round(evidence_score, 4),
          "liveOfferScore": round(live_offer_score, 4),
        },
        "matchedLabels": matched_labels,
      },
    )

  return sorted(ranked, key=lambda row: (row["score"], row["item"].get("brandName", "")), reverse=True)


def top_score_gap(ranked: list[dict[str, Any]]) -> float:
  if len(ranked) < 2:
    return 1.0
  return max(0.0, float(ranked[0]["score"]) - float(ranked[1]["score"]))


def passes_floor(row: dict[str, Any], *, s_floor: float = 0.5, evidence_floor: float = 0.45) -> bool:
  """§5 floor 게이트 — 정당화 미달 후보를 정렬 전 컷.

  하드필터는 이미 pre-rank 적용됨. 랭크셋 안에서 최소 정당화(요청 매칭 / 의미 유사 /
  근거 품질) 중 하나라도 넘는 후보만 통과시켜 부익부·무근거 후보를 배제한다.
  임계값은 §13 열린 결정 — 슬라이스에서 캘리브레이션한다.
  """
  components = row.get("components") if isinstance(row.get("components"), dict) else {}
  # answerScore는 soft-pref 없을 때 중립 0.5 → 0.5 초과는 '실제 매칭'을 의미.
  matched_preference = float(components.get("answerScore") or 0.0) > 0.5
  strong_semantic = float(components.get("semanticScore") or 0.0) >= s_floor
  strong_evidence = float(components.get("evidenceScore") or 0.0) >= evidence_floor
  return matched_preference or strong_semantic or strong_evidence


def _attribute_signature(item: dict[str, Any]) -> set[str]:
  attrs = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
  signature: set[str] = set()
  for field in ("colorFamily", "finish", "texture"):
    value = _clean(attrs.get(field))
    if value:
      signature.add(f"{field}:{value}")
  return signature


def _similarity(item_a: dict[str, Any], item_b: dict[str, Any]) -> float:
  """MMR용 유사도 — 속성 Jaccard + 동일 브랜드 페널티(0~1)."""
  sig_a = _attribute_signature(item_a)
  sig_b = _attribute_signature(item_b)
  union = sig_a | sig_b
  jaccard = len(sig_a & sig_b) / len(union) if union else 0.0
  brand_a = _clean(item_a.get("brandName"))
  same_brand = bool(brand_a) and brand_a == _clean(item_b.get("brandName"))
  return min(1.0, jaccard + (0.34 if same_brand else 0.0))


def mmr_rerank(
  ranked: list[dict[str, Any]],
  *,
  lambda_: float = 0.7,
  top_n: int | None = None,
) -> list[dict[str, Any]]:
  """§5 MMR 재랭킹: λ·relevance − (1−λ)·max_sim(이미 뽑힌 것).

  λ는 §7 refine 다이얼에 노출된다 (more_similar → λ↑, more_diverse → λ↓).
  1위(최고 relevance)는 anchor 후보로 확정하고, 이후 다양성 균형으로 선택한다.
  """
  if not ranked:
    return []
  remaining = list(ranked)
  selected: list[dict[str, Any]] = [remaining.pop(0)]
  limit = top_n if top_n is not None else len(ranked)
  while remaining and len(selected) < limit:
    best_index = 0
    best_value: float | None = None
    for index, row in enumerate(remaining):
      relevance = float(row["score"])
      max_sim = max(
        (_similarity(row["item"], picked["item"]) for picked in selected),
        default=0.0,
      )
      value = lambda_ * relevance - (1.0 - lambda_) * max_sim
      if best_value is None or value > best_value:
        best_value = value
        best_index = index
    selected.append(remaining.pop(best_index))
  return selected


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


def build_slice_result(
  ranked: list[dict[str, Any]],
  *,
  lambda_: float = 0.7,
  s_floor: float = 0.5,
  hard_filters: list[dict[str, Any]] | None = None,
  extra_caveats: list[str] | None = None,
  top_n: int = 3,
) -> dict[str, Any]:
  """floor → MMR → 3역할 → 구조화 근거 합성 (§5/§6 계약 검증 진입점)."""
  floored = [row for row in ranked if passes_floor(row, s_floor=s_floor)]
  reranked = mmr_rerank(floored, lambda_=lambda_)
  roled = assign_roles(reranked, top_n=top_n)
  products = [
    to_result_product(
      row,
      index,
      role=role,
      source=source,
      hard_filters=hard_filters,
      extra_caveats=extra_caveats,
    )
    for index, (row, role, source) in enumerate(roled)
  ]
  return {
    "rankedCount": len(ranked),
    "floorCount": len(floored),
    "topScoreGap": round(top_score_gap(reranked), 6),
    "lambda": lambda_,
    "sFloor": s_floor,
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
    if _clean(filter_delta.get("attribute")) == "priceKrw" and _clean(filter_delta.get("op")) == "lte":
      limit = int(filter_delta.get("numberValue") or 0)
      if limit and 0 < price <= limit:
        matched_on.append(f"{limit:,}원 이하")

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

  return {"matchedOn": matched_on, "inferred": inferred, "caveat": caveat}


def _shade_name(item: dict[str, Any]) -> str:
  shade_options = _as_list(item.get("shadeOptions"))
  if shade_options and isinstance(shade_options[0], dict):
    return _clean(shade_options[0].get("shadeName") or shade_options[0].get("optionName"))
  color_family = item.get("attributes", {}).get("colorFamily")
  return ATTRIBUTE_LABELS["colorFamily"].get(color_family, "") if color_family else ""


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
  match_rate = max(1, min(99, int(round(float(row["score"]) * 100))))
  tags = _tags(item, row.get("matchedLabels", []))
  soft_only_fields = [
    field
    for field, eligible in (item.get("hardFilterEligible") or {}).items()
    if not eligible and item.get("attributes", {}).get(field)
  ]
  # §6 구조화 근거 (matchedOn/inferred/caveat) — 자유 문장 금지.
  reason = _build_reason(item, hard_filters=hard_filters, extra_caveats=extra_caveats)
  return {
    "id": item["id"],
    "role": role,  # §5 3역할: anchor | diverse | discovery (미배치 시 None)
    "source": source,  # curated | live_naver
    "brandName": item.get("brandName"),
    "productName": item.get("productName"),
    "shadeName": _shade_name(item),
    "category": item.get("category"),
    "matchRate": match_rate,
    "price": int(live_offer.get("priceKrw") or 0),
    "priceKrw": int(live_offer.get("priceKrw") or 0),
    "tags": tags,
    "imageUrl": live_offer.get("imageUrl"),
    "purchaseUrl": live_offer.get("purchaseUrl"),
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

