"""Attach verified catalog products to generated makeup area guides."""

import asyncio
from copy import deepcopy
import logging
from typing import Any
from urllib.parse import urlparse

from app.core.settings import Settings
from app.db.session import Database
from app.schemas.makeup_recommendation import GeneratedMakeupRecommendationV2
from app.services.shopping_products import build_product_recommendation_data


logger = logging.getLogger(__name__)

AREA_CATEGORY = {
  "base": "base",
  "brow": "brow",
  "eye": "shadow",
  "cheek": "cheek",
  "lip": "lip",
}
MAX_PRODUCTS_PER_AREA = 1
TRUSTED_PRODUCT_SOURCE_PREFIXES = ("database", "auradin_catalog")


def _is_trusted_product_source(source: Any) -> bool:
  normalized = _clean_text(source)
  return any(
    normalized == prefix or normalized.startswith(f"{prefix}_")
    for prefix in TRUSTED_PRODUCT_SOURCE_PREFIXES
  )


def _clean_text(value: Any) -> str:
  return " ".join(str(value or "").split()).strip()


def _clean_https_url(value: Any) -> str | None:
  cleaned = _clean_text(value)
  if not cleaned:
    return None
  parsed = urlparse(cleaned)
  return cleaned if parsed.scheme == "https" and bool(parsed.netloc) else None


def _text_list(value: Any) -> list[str]:
  return [_clean_text(item) for item in value if _clean_text(item)] if isinstance(value, list) else []


def _unique_text(values: list[Any], limit: int) -> list[str]:
  unique: list[str] = []
  seen: set[str] = set()
  for value in values:
    cleaned = _clean_text(value)
    key = cleaned.casefold()
    if not cleaned or key in seen:
      continue
    seen.add(key)
    unique.append(cleaned)
    if len(unique) >= limit:
      break
  return unique


def _application_plan_profile(guide: dict[str, Any]) -> dict[str, Any]:
  plan = guide.get("applicationPlan") if isinstance(guide.get("applicationPlan"), dict) else {}
  steps = plan.get("steps") if isinstance(plan.get("steps"), list) else []
  product_types = _unique_text(
    [step.get("productType") for step in steps if isinstance(step, dict)],
    8,
  )
  colors = _unique_text(
    [
      " ".join(
        part for part in (
          _clean_text(color.get("role")),
          _clean_text(color.get("name")),
          _clean_text(color.get("hex")),
        ) if part
      )
      for step in steps if isinstance(step, dict)
      for color in (step.get("colors") if isinstance(step.get("colors"), list) else [])
      if isinstance(color, dict)
    ],
    12,
  )
  palette = _unique_text(
    [
      color.get("hex")
      for step in steps if isinstance(step, dict)
      for color in (step.get("colors") if isinstance(step.get("colors"), list) else [])
      if isinstance(color, dict)
    ],
    12,
  )
  placements = _unique_text(
    [_clean_text(step.get("placement"))[:100] for step in steps if isinstance(step, dict)],
    6,
  )
  techniques = _unique_text(
    [_clean_text(step.get("technique"))[:100] for step in steps if isinstance(step, dict)],
    6,
  )
  copy = _clean_text(
    " ".join(
      [
        f"제품유형 {', '.join(product_types)}" if product_types else "",
        f"레이어색 {', '.join(colors)}" if colors else "",
        f"범위 {' / '.join(placements)}" if placements else "",
        f"기법 {' / '.join(techniques)}" if techniques else "",
      ],
    ),
  )[:1400]
  return {
    "copy": copy,
    "query": copy[:900],
    "productTypes": product_types,
    "colors": colors,
    "palette": [value for value in palette if value.startswith("#")],
    "placements": placements,
    "techniques": techniques,
  }

def _measurement_product_profile(analysis: dict[str, Any]) -> dict[str, Any]:
  insights = (
    analysis.get("measurementInsights")
    if isinstance(analysis.get("measurementInsights"), dict)
    else {}
  )
  personal_color = (
    insights.get("personalColor")
    if isinstance(insights.get("personalColor"), dict)
    else {}
  )
  if personal_color.get("usable") is not True:
    return {"summary": "", "tags": [], "toneLabel": "", "usable": False}

  tone = (
    personal_color.get("tone")
    if isinstance(personal_color.get("tone"), dict)
    else {}
  )
  tone_label = _clean_text(tone.get("topLabel"))
  axes = (
    personal_color.get("axes")
    if isinstance(personal_color.get("axes"), dict)
    else {}
  )
  axis_labels = [
    _clean_text(axis.get("label"))
    for axis in axes.values()
    if isinstance(axis, dict) and _clean_text(axis.get("label"))
  ]
  best_palettes = (
    personal_color.get("bestPalettes")
    if isinstance(personal_color.get("bestPalettes"), list)
    else []
  )
  palette_labels = [
    _clean_text(palette.get("label"))
    for palette in best_palettes
    if isinstance(palette, dict) and _clean_text(palette.get("label"))
  ]
  exemplars = [
    _clean_text(exemplar)
    for palette in best_palettes
    if isinstance(palette, dict)
    for exemplar in (
      palette.get("exemplars")
      if isinstance(palette.get("exemplars"), list)
      else []
    )
    if _clean_text(exemplar)
  ]
  tags = _unique_text([tone_label, *axis_labels, *palette_labels, *exemplars], 20)
  return {
    "summary": " ".join(tags)[:600],
    "tags": tags,
    "toneLabel": tone_label,
    "usable": True,
  }


def _answer_profile(
  answers: list[dict[str, Any]],
  questions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
  """Normalize persisted and request-time answer shapes into the same evidence."""
  option_labels: dict[tuple[str, str], str] = {}
  for question in questions or []:
    if not isinstance(question, dict):
      continue
    question_id = _clean_text(question.get("id"))
    options = question.get("options") if isinstance(question.get("options"), list) else []
    for option in options:
      if not isinstance(option, dict):
        continue
      option_id = _clean_text(option.get("id"))
      option_label = _clean_text(option.get("label"))
      if question_id and option_id and option_label:
        option_labels[(question_id, option_id)] = option_label

  selected: list[str] = []
  free_text: list[str] = []
  constraints: list[str] = []
  for answer in answers:
    if not isinstance(answer, dict):
      continue
    direct_labels = [
      _clean_text(answer.get("label")),
      _clean_text(answer.get("optionLabel")),
    ]
    if not any(direct_labels):
      direct_labels.append(option_labels.get((
        _clean_text(answer.get("questionId")),
        _clean_text(answer.get("optionId")),
      ), ""))
    selected.extend(direct_labels)
    free_text.append(_clean_text(answer.get("freeText")))
    constraints.append(_clean_text(answer.get("additionalConstraints")))
  selected = _unique_text(selected, 12)
  free_text = _unique_text(free_text, 12)
  constraints = _unique_text(constraints, 12)
  return {
    "copy": " ".join([*selected, *free_text, *constraints]),
    "selected": selected,
    "freeText": free_text,
    "constraints": constraints,
  }


def _build_product_profile(
  context_snapshot: dict[str, Any],
  answers: list[dict[str, Any]],
  look: dict[str, Any],
  guide: dict[str, Any],
  questions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
  selection = context_snapshot.get("selection") if isinstance(context_snapshot.get("selection"), dict) else {}
  situation = selection.get("situation") if isinstance(selection.get("situation"), dict) else {}
  keyword = selection.get("keyword") if isinstance(selection.get("keyword"), dict) else {}
  color = guide.get("color") if isinstance(guide.get("color"), dict) else {}
  application = _application_plan_profile(guide)
  analysis = context_snapshot.get("analysisReport") if isinstance(context_snapshot.get("analysisReport"), dict) else {}
  measurement = _measurement_product_profile(analysis)
  answer_profile = _answer_profile(answers, questions)
  answer_text = answer_profile["copy"]
  title = _clean_text(look.get("title"))
  guide_copy = " ".join(
    part for part in (
      _clean_text(guide.get("label")),
      _clean_text(guide.get("goal")),
      _clean_text(color.get("name")),
      _clean_text(guide.get("texture")),
      _clean_text(guide.get("placement")),
      _clean_text(guide.get("technique")),
      application["copy"],
      _clean_text(guide.get("reason")),
    ) if part
  )
  context_copy = " ".join(
    part for part in (
      _clean_text(situation.get("label")),
      _clean_text(keyword.get("label")),
      _clean_text(selection.get("customSituationText")),
      _clean_text(look.get("summary")),
      guide_copy,
      answer_text,
      _clean_text(analysis.get("personalColor")),
      _clean_text(analysis.get("skinType")),
      measurement["summary"],
    ) if part
  )
  tags = [
    *_text_list(look.get("appliedConditions")),
    *_text_list(keyword.get("tags")),
    _clean_text(color.get("name")),
    _clean_text(guide.get("texture")),
    *application["productTypes"],
    *application["colors"],
    *measurement["tags"],
  ]
  tags = [tag for tag in tags if tag]
  return {
    "recommendedMood": title,
    "personalColor": _clean_text(" ".join(
      part for part in (
        _clean_text(analysis.get("personalColor")), measurement["toneLabel"],
      ) if part
    )),
    "skinType": _clean_text(analysis.get("skinType")),
    "toneSummary": measurement["summary"],
    "matchSignals": {
      # Structured signals keep low-priority context words from counting like an
      # exact generated recipe shade or product-type match.
      "recipe": {
        "colors": _unique_text([
          _clean_text(color.get("name")),
          *application["colors"],
        ], 16),
        "finishes": _unique_text([_clean_text(guide.get("texture"))], 4),
        "productTypes": application["productTypes"],
      },
      "personalColor": {
        "usable": measurement["usable"],
        "terms": measurement["tags"] if measurement["usable"] else [],
      },
      "skinType": _clean_text(analysis.get("skinType")),
      "context": {
        "situation": _unique_text([
          _clean_text(situation.get("label")),
          _clean_text(keyword.get("label")),
          _clean_text(selection.get("customSituationText")),
        ], 6),
        "answers": _unique_text([
          *answer_profile["selected"],
          *answer_profile["freeText"],
          *answer_profile["constraints"],
        ], 16),
      },
    },
    "summary": context_copy,
    "shortSummary": guide_copy,
    "tags": tags,
    "makeupGuideline": {
      "area": _clean_text(guide.get("label")),
      "title": _clean_text(guide.get("goal")),
      "color": _clean_text(color.get("name")),
      "texture": _clean_text(guide.get("texture")),
      "howTo": _clean_text(" ".join([_clean_text(guide.get("technique")), *application["techniques"]])),
      "professionalPoint": _clean_text(" ".join([_clean_text(guide.get("placement")), *application["placements"]])),
      "productReason": _clean_text(guide.get("reason")),
      "applicationPlan": {
        "productTypes": application["productTypes"],
        "colors": application["colors"],
      },
    },
    "recommendedMakeups": [{
      "title": title,
      "description": context_copy,
      "tags": tags,
      "palette": _unique_text([_clean_text(color.get("hex")), *application["palette"]], 12),
    }],
  }


def _map_product(
  product: dict[str, Any],
  area: str,
  expected_category: str,
  guide: dict[str, Any],
) -> dict[str, Any] | None:
  if _clean_text(product.get("category")).casefold() != expected_category.casefold():
    return None
  product_id = _clean_text(product.get("id"))
  product_name = _clean_text(product.get("productName"))
  image_url = _clean_https_url(product.get("imageUrl"))
  purchase_url = _clean_https_url(product.get("purchaseUrl"))
  if not product_id or not product_name or not image_url or not purchase_url:
    return None
  price = product.get("price")
  match_rate = product.get("matchRate")
  return {
    "id": product_id[:160],
    "area": area,
    "brandName": (_clean_text(product.get("brandName")) or "브랜드 정보 없음")[:100],
    "productName": product_name[:200],
    "shadeName": (_clean_text(product.get("shadeName")) or None),
    "reason": (_clean_text(product.get("reason")) or _clean_text(guide.get("reason")) or "이 상황과 무드에 어울리는 추천 제품이에요.")[:240],
    "price": max(0, int(price)) if isinstance(price, int | float) else None,
    "imageUrl": image_url,
    "purchaseUrl": purchase_url,
    "matchRate": max(0, min(100, int(match_rate))) if isinstance(match_rate, int | float) else None,
  }

def _map_products(
  raw_products: Any,
  area: str,
  expected_category: str,
  guide: dict[str, Any],
) -> list[dict[str, Any]]:
  if not isinstance(raw_products, list):
    return []
  products: list[dict[str, Any]] = []
  for raw in raw_products:
    if not isinstance(raw, dict):
      continue
    mapped = _map_product(raw, area, expected_category, guide)
    if mapped is None:
      continue
    products.append(mapped)
    if len(products) >= MAX_PRODUCTS_PER_AREA:
      break
  return products


# 생성된 guide의 질감/피니시를 후보 제품과 매칭하기 위한 키워드 사전.
# 카탈로그에 제품별 색(hex) 데이터가 없어 색 매칭은 불가하므로, 제품명·specs에
# 실제로 존재하는 질감/피니시 신호만으로 후보 순위를 조정한다(강제 다양성 없음).
_TEXTURE_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
  ("velvet", ("벨벳", "velvet")),
  ("matte", ("매트", "matte")),
  ("glossy", ("글로시", "글로스", "글로우", "글래스", "윤기", "촉촉", "물광", "glossy", "gloss", "glow", "dewy")),
  ("satin", ("새틴", "satin")),
  ("sheer", ("쉬어", "시어", "sheer")),
  ("shimmer", ("쉬머", "글리터", "펄", "shimmer", "glitter", "pearl")),
  ("tint", ("틴트", "tint")),
  ("cushion", ("쿠션", "cushion")),
  ("powder", ("파우더", "powder")),
  ("cream", ("크림", "cream")),
  ("blur", ("블러", "blur")),
)


def _texture_tokens(text: str) -> set[str]:
  lowered = _clean_text(text).casefold()
  if not lowered:
    return set()
  return {
    canonical
    for canonical, variants in _TEXTURE_KEYWORDS
    if any(variant.casefold() in lowered for variant in variants)
  }


def _rank_products_by_texture(
  raw_products: Any,
  guide: dict[str, Any],
) -> list[dict[str, Any]]:
  """생성된 guide의 질감/피니시에 맞는 후보를 앞으로 정렬한다.

  색 데이터가 없어 색 매칭은 하지 않는다. 동점(질감 신호 없음/동일)은 원래 순서를
  유지하므로, 맞는 게 없으면 기존 인기순 그대로다(억지 다양성 아님).
  """
  if not isinstance(raw_products, list) or len(raw_products) <= 1:
    return raw_products if isinstance(raw_products, list) else []
  color = guide.get("color") if isinstance(guide.get("color"), dict) else {}
  wanted = _texture_tokens(
    " ".join(
      _clean_text(part)
      for part in (guide.get("texture"), guide.get("technique"), color.get("name"))
    ),
  )
  if not wanted:
    return raw_products

  def _match_score(product: Any) -> int:
    if not isinstance(product, dict):
      return 0
    info = product.get("productInfo") if isinstance(product.get("productInfo"), dict) else {}
    tags = product.get("tags") if isinstance(product.get("tags"), list) else []
    haystack = " ".join(
      [
        _clean_text(product.get("productName")),
        _clean_text(info.get("finish")),
        _clean_text(info.get("texture")),
        " ".join(_clean_text(tag) for tag in tags),
      ],
    )
    return len(wanted & _texture_tokens(haystack))

  # sorted는 안정 정렬 → 동점은 기존 인기순 유지.
  return sorted(raw_products, key=lambda product: -_match_score(product))


async def enrich_makeup_recommendation_products(
  db: Database,
  settings: Settings,
  recommendation: dict[str, Any],
  context_snapshot: dict[str, Any],
  answers: list[dict[str, Any]],
  questions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
  """Match each generated area guide to verified catalog records without inventing products."""
  enriched = deepcopy(recommendation)
  looks = enriched.get("looks") if isinstance(enriched.get("looks"), list) else []
  jobs: list[tuple[dict[str, Any], dict[str, Any], str, str, Any]] = []

  # 부위별 semantic 매칭(생성된 보고서 내용 + 색/피니시를 임베딩)이 의도된 설계이므로
  # 임베딩은 켜 둔다. 텍스처 키워드 랭킹(_rank_products_by_texture)은 임베딩이 적용되지
  # 않았을 때(모델 미설정·호출 실패)만 fallback으로 쓴다.
  catalog_settings = settings.model_copy(update={
    # Never mix request-time shopping search results into a saved makeup report.
    "legacy_naver_product_search": False,
  })
  for look in looks:
    if not isinstance(look, dict):
      continue
    guides = look.get("areaGuides") if isinstance(look.get("areaGuides"), list) else []
    for guide in guides:
      if not isinstance(guide, dict):
        continue
      area = _clean_text(guide.get("area"))
      category = AREA_CATEGORY.get(area)
      if not category:
        guide["products"] = []
        continue
      profile = _build_product_profile(context_snapshot, answers, look, guide, questions)
      color = guide.get("color") if isinstance(guide.get("color"), dict) else {}
      application = _application_plan_profile(guide)
      query = _clean_text(" ".join(
        part for part in (
          _clean_text(color.get("name")),
          _clean_text(guide.get("texture")),
          _clean_text(guide.get("label")),
          application["query"],
        ) if part
      ))[:1000]
      job = build_product_recommendation_data(
        db,
        catalog_settings,
        category,
        profile_override=profile,
        query_override=query or None,
      )
      jobs.append((look, guide, area, category, job))

  if not jobs:
    return GeneratedMakeupRecommendationV2.model_validate(enriched).model_dump(by_alias=True)

  results = await asyncio.gather(*(job for *_metadata, job in jobs), return_exceptions=True)
  sources: set[str] = set()
  for (look, guide, area, category, _job), result in zip(jobs, results):
    products: list[dict[str, Any]] = []
    if isinstance(result, Exception):
      logger.warning(
        "[aura:makeup-recommendation] product-enrichment:failed area=%s error=%s",
        area,
        result.__class__.__name__,
      )
    else:
      recommendation_data, source = result
      if _is_trusted_product_source(source):
        sources.add(source)
        raw_products = recommendation_data.get("products") if isinstance(recommendation_data, dict) else []
        # 임베딩 semantic 랭킹이 적용됐으면 그 순서를 존중하고, 아니면 텍스처로 정렬(fallback).
        if not str(source).endswith("_semantic"):
          raw_products = _rank_products_by_texture(raw_products, guide)
        products = _map_products(raw_products, area, category, guide)
      else:
        logger.warning(
          "[aura:makeup-recommendation] product-enrichment:untrusted-source area=%s source=%s",
          area,
          source,
        )
    guide["products"] = products
    look["products"] = [
      product
      for item in look.get("areaGuides", [])
      if isinstance(item, dict)
      for product in item.get("products", [])
      if isinstance(product, dict)
    ][:12]

  logger.info(
    "[aura:makeup-recommendation] product-enrichment:completed sources=%s products=%s",
    sorted(sources),
    sum(
      len(guide.get("products", []))
      for look in looks if isinstance(look, dict)
      for guide in look.get("areaGuides", []) if isinstance(guide, dict)
    ),
  )
  return GeneratedMakeupRecommendationV2.model_validate(enriched).model_dump(by_alias=True)