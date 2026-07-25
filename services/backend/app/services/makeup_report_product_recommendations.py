"""Recommend real products from a saved MakeupRecommendation V2 recipe.

The recipe is already structured by the recommendation pipeline. This module
never asks an LLM to invent products and never treats generated user-image
pixels as product shade evidence. Licensed shades and report-bound Naver
Shopping candidates that pass listing-image color verification are ranked as
primary evidence sources and persisted by the snapshot worker.
"""

from __future__ import annotations

import asyncio
from collections import OrderedDict, defaultdict
from concurrent.futures import Future, ThreadPoolExecutor
import colorsys
import hashlib
import ipaddress
import json
import logging
import math
import re
from threading import BoundedSemaphore, Lock
import time
from typing import Any, Iterable
from urllib.parse import urlparse
from uuid import UUID

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.services.embeddings import embed_text, embedding_match_percent
from app.services.makeup_recommendation_recipe import enrich_makeup_application_plans
from app.services.makeup_report_product_discovery import (
  DISCOVERY_CONTRACT_VERSION,
  discover_report_products,
)
from app.services.product_catalog import (
  ELIGIBLE_EVIDENCE_TYPES,
  map_catalog_product,
  offer_freshness_sql,
)
from app.services.product_color import delta_e_ciede2000, normalize_hex_color, srgb_hex_to_lab
from app.services.s3 import S3Service


logger = logging.getLogger(__name__)

ALGORITHM_VERSION = "makeup_report_verified_discovery_v7"
EMBEDDING_CACHE_VERSION = "bounded_process_lru_v1"
EMBEDDING_CACHE_MAX_ENTRIES = 512
EMBEDDING_CACHE_SUCCESS_TTL_SECONDS = 6 * 60 * 60
EMBEDDING_CACHE_FAILURE_TTL_SECONDS = 60
SEMANTIC_WEIGHT = 0.10
MAX_RERANK_CANDIDATES_PER_CATEGORY = 8
SEMANTIC_RERANK_TIMEOUT_SECONDS = 7.0
MAX_CONCURRENT_EMBEDDING_CALLS = 8
MAX_INTERNAL_ROWS_PER_CATEGORY = 200
MIN_VERIFIED_SHADE_EVIDENCE_CONFIDENCE = 0.60
DEFAULT_CATEGORIES = ("base", "shadow", "liner", "brow", "cheek", "lip")
CATEGORY_LABELS = {
  "base": "베이스",
  "shadow": "아이섀도우",
  "liner": "아이라이너",
  "brow": "아이브로우",
  "cheek": "치크",
  "lip": "립",
}
AREA_TO_CATEGORIES = {
  "base": ("base",),
  "eye": ("shadow", "liner"),
  "brow": ("brow",),
  "cheek": ("cheek",),
  "lip": ("lip",),
}

_EMBEDDING_CACHE: OrderedDict[str, tuple[float, list[float] | None]] = OrderedDict()
_EMBEDDING_CACHE_LOCK = Lock()
_EMBEDDING_INFLIGHT: dict[str, Future[list[float] | None]] = {}
_EMBEDDING_EXECUTOR = ThreadPoolExecutor(
  max_workers=MAX_CONCURRENT_EMBEDDING_CALLS,
  thread_name_prefix="makeup-report-embedding",
)
_EMBEDDING_PROVIDER_SLOTS = BoundedSemaphore(MAX_CONCURRENT_EMBEDDING_CALLS)

_FINISH_ALIASES = {
  "matte": ("matte", "매트"),
  "glow": ("glow", "gloss", "dewy", "글로우", "광채", "윤기", "촉촉"),
  "shimmer": ("shimmer", "쉬머", "펄"),
  "satin": ("satin", "새틴"),
  "cream": ("cream", "크림"),
  "powder": ("powder", "파우더"),
  "velvet": ("velvet", "벨벳"),
  "sheer": ("sheer", "시어", "투명"),
  "natural": ("natural", "내추럴", "자연"),
}
_TEXTURE_ALIASES = {
  "liquid": ("liquid", "리퀴드"),
  "cream": ("cream", "크림"),
  "powder": ("powder", "파우더"),
  "balm": ("balm", "밤"),
  "gel": ("gel", "젤"),
  "pencil": ("pencil", "펜슬"),
  "stick": ("stick", "스틱"),
}
_PRODUCT_TYPE_ALIASES = {
  "primer": ("primer", "프라이머", "메이크업 베이스"),
  "foundation": ("foundation", "파운데이션"),
  "cushion": ("cushion", "쿠션"),
  "concealer": ("concealer", "컨실러"),
  "powder": ("powder", "파우더"),
  "shadow": (
    "shadow", "eye shadow", "eyeshadow", "섀도", "섀도우", "아이섀도", "아이섀도우",
    "아이 팔레트", "아이팔레트", "아이 컬러", "아이컬러", "애교살", "프로타주",
  ),
  "liner": (
    "eyeliner", "eye liner", "liner", "아이라이너", "아이 라이너", "라이너",
  ),
  "brow": ("brow", "eyebrow", "eye brow", "브로우", "아이브로우"),
  "blush": ("blush", "blusher", "블러셔", "블러쉬", "블러시", "치크"),
  "tint": ("tint", "틴트"),
  "lipstick": ("lipstick", "립스틱"),
  "lip_gloss": ("lip gloss", "립글로스", "글로스"),
  "lip_balm": ("lip balm", "립밤"),
}
_DEFAULT_PRODUCT_TYPES = {
  "base": ("primer", "foundation", "cushion", "concealer", "powder"),
  "shadow": ("shadow",),
  "liner": ("liner",),
  "brow": ("brow",),
  "cheek": ("blush",),
  "lip": ("tint", "lipstick", "lip_gloss", "lip_balm"),
}
_COVERAGE_ALIASES = {
  "sheer": ("sheer", "시어", "얇게", "가벼운 커버"),
  "light": ("light coverage", "라이트 커버", "내추럴 커버"),
  "medium": ("medium", "미디엄", "중간 커버"),
  "full": ("full coverage", "풀 커버", "고커버"),
}
_SKIN_ALIASES = {
  "dry": ("dry", "건성"),
  "oily": ("oily", "지성"),
  "combination": ("combination", "복합성"),
  "sensitive": ("sensitive", "민감"),
  "normal": ("normal", "중성"),
}
_COLOR_NAME_ALIASES = {
  "rose": ("rose", "로즈"),
  "pink": ("pink", "핑크"),
  "peach": ("peach", "피치", "복숭아"),
  "coral": ("coral", "코랄"),
  "red": ("red", "레드", "빨강"),
  "orange": ("orange", "오렌지"),
  "brown": ("brown", "브라운", "갈색"),
  "beige": ("beige", "베이지"),
  "nude": ("nude", "누드"),
  "mauve": ("mauve", "모브"),
  "plum": ("plum", "플럼"),
  "purple": ("purple", "violet", "퍼플", "보라"),
  "gray": ("gray", "grey", "그레이", "회색"),
  "black": ("black", "블랙", "검정"),
  "gold": ("gold", "골드", "금색"),
}
_EMBEDDING_COLOR_FAMILIES = frozenset({*_COLOR_NAME_ALIASES, "green", "blue"})


def _json_object(value: Any) -> dict[str, Any]:
  if isinstance(value, str):
    try:
      value = json.loads(value)
    except json.JSONDecodeError:
      return {}
  return value if isinstance(value, dict) else {}


def _json_list(value: Any) -> list[Any]:
  if isinstance(value, str):
    try:
      value = json.loads(value)
    except json.JSONDecodeError:
      return []
  return value if isinstance(value, list) else []


def normalize_makeup_report_recommendation(recommendation: Any) -> dict[str, Any]:
  """Return the canonical recipe projection used for hashing and matching.

  Early V2 reports persisted only guide-level ``steps``/``products``. The
  shared recipe enricher deterministically backfills complete application
  plans without mutating the stored report, so snapshot hashes and live
  matching see the same target recipe.
  """

  return enrich_makeup_application_plans(_json_object(recommendation))


def _clean(value: Any, limit: int = 240) -> str:
  return " ".join(str(value or "").split())[:limit]


def _safe_https_url(value: Any) -> str | None:
  candidate = _clean(value, 2048)
  parsed = urlparse(candidate)
  if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
    return None
  hostname = (parsed.hostname or "").rstrip(".").casefold()
  if not hostname or hostname == "localhost" or hostname.endswith((".localhost", ".local")):
    return None
  try:
    address = ipaddress.ip_address(hostname)
  except ValueError:
    address = None
  if address and not address.is_global:
    return None
  return parsed.geturl()


def _canonical_values(value: Any, aliases: dict[str, tuple[str, ...]]) -> list[str]:
  normalized = _clean(value, 1200).casefold()
  return [canonical for canonical, terms in aliases.items() if any(term in normalized for term in terms)]


def _canonical_one(value: Any, aliases: dict[str, tuple[str, ...]]) -> str | None:
  values = _canonical_values(value, aliases)
  return values[0] if values else None


def _product_type_alias_matches(normalized: str, alias: str) -> bool:
  folded = alias.casefold()
  if not folded.isascii():
    # Korean product-type compounds normally have no whitespace/token boundary
    # (for example, 아이브로우펜슬), so preserve deliberate substring matching.
    return folded in normalized
  phrase = re.escape(folded).replace(r"\ ", r"[\s_-]+")
  # ASCII aliases require lexical boundaries. In particular, `brow` must not
  # match `brown`, while `brow-pencil`, `eye brow`, and `eyebrow` remain valid
  # through explicit aliases above.
  return re.search(rf"(?<![0-9a-z]){phrase}(?![0-9a-z])", normalized) is not None


def _canonical_product_types(value: Any) -> list[str]:
  normalized = _clean(value, 1200).casefold()
  return [
    canonical
    for canonical, terms in _PRODUCT_TYPE_ALIASES.items()
    if any(_product_type_alias_matches(normalized, term) for term in terms)
  ]


def _broad_color_family(name: Any, color_hex: Any) -> str | None:
  named = _canonical_one(name, _COLOR_NAME_ALIASES)
  if named:
    return named
  try:
    normalized = str(color_hex or "").strip().lstrip("#")
    red, green, blue = (int(normalized[index:index + 2], 16) / 255 for index in (0, 2, 4))
  except (TypeError, ValueError):
    return None
  hue, saturation, value = colorsys.rgb_to_hsv(red, green, blue)
  if value < 0.18:
    return "black"
  if saturation < 0.12:
    return "gray"
  degrees = hue * 360
  if value < 0.50 and (degrees < 50 or degrees >= 345):
    return "brown"
  if degrees < 15 or degrees >= 345:
    return "red"
  if degrees < 45:
    return "orange"
  if degrees < 70:
    return "gold"
  if degrees < 165:
    return "green"
  if degrees < 255:
    return "blue"
  if degrees < 290:
    return "purple"
  if degrees < 345:
    return "pink"
  return None


def parse_categories(value: str | None) -> list[str]:
  raw = [part.strip() for part in (value or ",".join(DEFAULT_CATEGORIES)).split(",") if part.strip()]
  categories = list(dict.fromkeys(raw))
  invalid = [category for category in categories if category not in DEFAULT_CATEGORIES]
  if invalid or not categories:
    raise AppError(
      422,
      "INVALID_MAKEUP_PRODUCT_CATEGORY",
      "categories must contain only base, shadow, liner, brow, cheek, or lip.",
      {"invalidCategories": invalid},
    )
  return categories


def _asset_delivery_url(asset: dict[str, Any], settings: Settings, s3: S3Service | None) -> str | None:
  if str(asset.get("status") or "") != "completed":
    return None
  if not bool(asset.get("is_private")):
    return _safe_https_url(asset.get("image_url"))
  if not s3 or not asset.get("storage_bucket") or not asset.get("object_key"):
    return None
  try:
    return s3.create_presigned_download(
      bucket=str(asset["storage_bucket"]),
      object_key=str(asset["object_key"]),
      expires_in=settings.makeup_private_url_ttl_seconds,
    )
  except Exception:  # noqa: BLE001 - a picker image must not block report selection.
    logger.warning("[aura:products] makeup-report-picker:presign-failed", exc_info=True)
    return None


def _look_palette_and_targets(look: dict[str, Any]) -> tuple[list[str], list[str]]:
  palette: list[str] = []
  targets: list[str] = []
  for guide in _json_list(look.get("areaGuides")):
    if not isinstance(guide, dict):
      continue
    area = _clean(guide.get("area"), 30)
    categories = AREA_TO_CATEGORIES.get(area, ())
    if categories == ("base",):
      if "base" not in targets:
        targets.append("base")
      continue
    if not categories:
      continue
    color = _json_object(guide.get("color"))
    try:
      color_hex = normalize_hex_color(str(color.get("hex") or ""))
    except ValueError:
      continue
    for category in categories:
      if category not in targets:
        targets.append(category)
    if color_hex not in palette:
      palette.append(color_hex)
  return palette[:5], targets


def resolve_report_look(
  recommendation: Any,
  look_id: str | None,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
  """Normalize a report and deterministically select one complete owned look."""

  normalized = normalize_makeup_report_recommendation(recommendation)
  looks = [look for look in _json_list(normalized.get("looks")) if isinstance(look, dict)]
  valid_looks = [
    look for look in looks
    if set(DEFAULT_CATEGORIES).issubset(_look_palette_and_targets(look)[1])
  ]
  if look_id:
    requested_look = _clean(look_id, 80)
    selected = next(
      (look for look in valid_looks if _clean(look.get("id") or look.get("role"), 80) == requested_look),
      None,
    )
  else:
    selected = next(
      (look for look in valid_looks if _clean(look.get("role"), 40) == "anchor"),
      valid_looks[0] if valid_looks else None,
    )
  return normalized, selected


def _look_projection(
  look: dict[str, Any],
  *,
  asset: dict[str, Any],
  report_image_status: Any,
  settings: Settings,
  s3: S3Service,
) -> dict[str, Any] | None:
  look_id = _clean(look.get("id") or look.get("role"), 80)
  if not look_id:
    return None
  palette, targets = _look_palette_and_targets(look)
  if not set(DEFAULT_CATEGORIES).issubset(targets):
    return None
  return {
    "lookId": look_id,
    "role": _clean(look.get("role"), 40),
    "title": _clean(look.get("title"), 100),
    "summary": _clean(look.get("summary"), 300),
    "imageStatus": _clean(asset.get("status") or report_image_status, 40),
    "imageUrl": _asset_delivery_url(asset, settings, s3),
    "palette": palette,
    "targets": targets,
  }


def _report_projection(
  report: dict[str, Any],
  recommendation: dict[str, Any],
  *,
  asset_by_look: dict[tuple[str, str], dict[str, Any]],
  settings: Settings,
  s3: S3Service,
) -> dict[str, Any] | None:
  looks: list[dict[str, Any]] = []
  for look in _json_list(recommendation.get("looks")):
    if not isinstance(look, dict):
      continue
    look_id = _clean(look.get("id") or look.get("role"), 80)
    projected = _look_projection(
      look,
      asset=asset_by_look.get((str(report["id"]), look_id), {}),
      report_image_status=report.get("image_status"),
      settings=settings,
      s3=s3,
    )
    if projected:
      looks.append(projected)
  if not looks:
    return None
  return {
    "reportId": str(report["id"]),
    "scenarioText": _clean(report.get("scenario_text"), 500),
    "createdAt": report.get("created_at"),
    "imageStatus": _clean(report.get("image_status"), 40),
    "looks": looks,
  }


async def list_owned_makeup_reports(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  limit: int,
  offset: int,
) -> dict[str, Any]:
  """Return a small report picker projection with one bulk asset query."""

  reports = await db.fetch(
    """
    select id, scenario_text, recommendation, image_status, created_at
    from makeup_recommendation_reports
    where user_id=$1 and schema_version='makeup-recommendation-v2'
    order by created_at desc
    limit $2 offset $3
    """,
    user_id,
    limit,
    offset,
  )
  report_ids = [report["id"] for report in reports]
  assets = await db.fetch(
    """
    select report_id,look_id,role,status,image_url,storage_bucket,object_key,is_private
    from makeup_recommendation_assets
    where report_id=any($1::uuid[])
    order by report_id,case role when 'anchor' then 1 when 'bold' then 2 else 3 end
    """,
    report_ids,
  ) if report_ids else []
  asset_by_look = {
    (str(asset.get("report_id")), str(asset.get("look_id") or "")): dict(asset)
    for asset in assets
  }
  # S3Service supports explicit keys, profiles, IAM roles and boto's default
  # credential chain. Presign failures degrade the thumbnail to null.
  s3 = S3Service(settings)
  items: list[dict[str, Any]] = []
  for report in reports:
    recommendation = normalize_makeup_report_recommendation(report.get("recommendation"))
    # 이미지 생성 상태와 무관하게 구조화 레시피가 유효하면 제품 매칭에 사용할 수
    # 있다. 이미지 실패가 추천 보고서 자체와 제품 추천까지 무효화하지 않는다.
    projected = _report_projection(
      dict(report),
      recommendation,
      asset_by_look=asset_by_look,
      settings=settings,
      s3=s3,
    )
    if projected:
      items.append(projected)
  return {"reports": items, "limit": limit, "offset": offset}


def _target_plan_steps(guide: dict[str, Any], category: str) -> list[dict[str, Any]]:
  plan = _json_object(guide.get("applicationPlan"))
  steps = [step for step in _json_list(plan.get("steps")) if isinstance(step, dict)]
  if category not in {"shadow", "liner"}:
    return steps
  selected: list[dict[str, Any]] = []
  for step in steps:
    types = set(_canonical_product_types(step.get("productType")))
    if category == "liner" and "liner" in types:
      selected.append(step)
    elif category == "shadow" and "shadow" in types and "liner" not in types:
      selected.append(step)
  return selected


def _normalized_target_color(value: Any) -> dict[str, str] | None:
  color = _json_object(value)
  try:
    color_hex = normalize_hex_color(str(color.get("hex") or ""))
  except ValueError:
    return None
  return {
    "role": _clean(color.get("role"), 80),
    "name": _clean(color.get("name"), 80),
    "hex": color_hex,
  }


def _target_colors(
  guide: dict[str, Any],
  steps: list[dict[str, Any]],
  category: str,
) -> list[dict[str, str]]:
  guide_color = _normalized_target_color(guide.get("color"))
  step_colors = [
    normalized
    for step in steps
    for raw_color in _json_list(step.get("colors"))
    if (normalized := _normalized_target_color(raw_color)) is not None
  ]
  if category == "liner":
    candidates = step_colors or ([guide_color] if guide_color else [])
  elif category == "shadow":
    candidates = [*([guide_color] if guide_color else []), *step_colors]
  else:
    candidates = [guide_color] if guide_color else []
  colors: list[dict[str, str]] = []
  seen_hexes: set[str] = set()
  for color in candidates:
    if color is None or color["hex"] in seen_hexes:
      continue
    seen_hexes.add(color["hex"])
    colors.append(color)
  return colors


def _target_color_family(color: dict[str, str], category: str) -> str | None:
  named = _canonical_one(color.get("name"), _COLOR_NAME_ALIASES)
  # Generated eye-plan names retain the parent shadow name (for example,
  # "딥 로즈 라이너"). For liner, only an explicit neutral/dark name should
  # override the actual structured color value.
  if category == "liner" and named not in {"black", "brown", "gray"}:
    return _broad_color_family(None, color.get("hex"))
  return _broad_color_family(color.get("name"), color.get("hex"))


def _guide_target(guide: dict[str, Any], context: dict[str, Any], category: str) -> dict[str, Any]:
  steps = _target_plan_steps(guide, category)
  product_type_text = " ".join(_clean(step.get("productType"), 120) for step in steps)
  allowed_types = set(_DEFAULT_PRODUCT_TYPES[category])
  product_types = [
    value for value in _canonical_product_types(product_type_text)
    if value in allowed_types
  ] or list(_DEFAULT_PRODUCT_TYPES[category])
  plan_text = " ".join(
    [
      _clean(guide.get("texture"), 100),
      product_type_text,
      *[_clean(step.get("finishCheck"), 160) for step in steps],
    ],
  )
  analysis = _json_object(context.get("analysisReport"))
  colors = [] if category == "base" else _target_colors(guide, steps, category)
  target_labs = [srgb_hex_to_lab(color["hex"]) for color in colors]
  color_families = list(dict.fromkeys(
    family for color in colors
    if (family := _target_color_family(color, category)) is not None
  ))
  primary_color = colors[0] if colors else None
  return {
    "category": category,
    "colorName": primary_color.get("name") if primary_color else None,
    "colorHex": primary_color.get("hex") if primary_color else None,
    "colors": colors,
    "colorFamily": color_families[0] if color_families else None,
    "colorFamilies": color_families,
    "targetLab": target_labs[0] if target_labs else None,
    "targetLabs": target_labs,
    "finish": _canonical_one(plan_text, _FINISH_ALIASES),
    "texture": _canonical_one(plan_text, _TEXTURE_ALIASES),
    "productTypes": product_types,
    "coverage": _canonical_one(plan_text, _COVERAGE_ALIASES),
    "skinType": _canonical_one(analysis.get("skinType"), _SKIN_ALIASES),
  }


def _target_response(target: dict[str, Any]) -> dict[str, Any]:
  return {
    key: value
    for key, value in target.items()
    if key not in {"targetLab", "targetLabs", "skinType"} and value not in (None, [], "")
  }


def _metadata_text(row: dict[str, Any]) -> str:
  payload = _json_object(row.get("product_payload"))
  return " ".join(
    part for part in (
      _clean(row.get("product_name"), 180),
      _clean(row.get("shade_name"), 100),
      " ".join(_clean(value, 80) for value in (row.get("tags") or []) if value),
      _clean(json.dumps(payload, ensure_ascii=False), 700),
    ) if part
  )


def _finish_similarity(target: str | None, candidate: str | None) -> float:
  if not target or not candidate:
    return 0.0
  if target == candidate:
    return 1.0
  families = ({"glow", "shimmer", "sheer"}, {"matte", "powder", "velvet"}, {"cream", "satin", "natural"})
  return 0.5 if any(target in family and candidate in family for family in families) else 0.0


def _embedding_text(
  *,
  category: str,
  color_family: str | None = None,
  finish: str | None = None,
  texture: str | None = None,
  product_types: Iterable[str] = (),
) -> str:
  """Build the only text shape that may leave the service for embeddings.

  Every value is a canonical enum produced by a local allowlist. Product,
  brand and shade names, catalog payloads, report prose and user data are
  intentionally impossible to pass through this helper.
  """

  safe_product_types: set[str] = set()
  raw_product_types = [product_types] if isinstance(product_types, str) else product_types
  for value in raw_product_types:
    normalized = _clean(value, 120).casefold()
    if normalized in _PRODUCT_TYPE_ALIASES:
      safe_product_types.add(normalized)
    else:
      safe_product_types.update(_canonical_product_types(normalized))

  fields = (
    ("category", category if category in DEFAULT_CATEGORIES else None),
    ("color_family", color_family if color_family in _EMBEDDING_COLOR_FAMILIES else None),
    ("finish", finish if finish in _FINISH_ALIASES else None),
    ("texture", texture if texture in _TEXTURE_ALIASES else None),
    (
      "product_type",
      ",".join(sorted(safe_product_types)),
    ),
  )
  return " ".join(f"{key}={value}" for key, value in fields if value)[:500]


def _internal_candidate(
  row: dict[str, Any],
  target: dict[str, Any],
  *,
  max_delta_e: float,
) -> dict[str, Any] | None:
  category = target["category"]
  metadata = _metadata_text(row)
  candidate_finish = _canonical_one(row.get("finish"), _FINISH_ALIASES)
  candidate_texture = _canonical_one(metadata, _TEXTURE_ALIASES)
  candidate_types = set(_canonical_product_types(metadata))
  candidate_coverage = _canonical_one(row.get("coverage") or metadata, _COVERAGE_ALIASES)
  candidate_skin = set(_canonical_values(metadata, _SKIN_ALIASES))
  try:
    evidence = max(0.0, min(1.0, float(row.get("evidence_confidence") or 0)))
  except (TypeError, ValueError):
    return None
  if evidence < MIN_VERIFIED_SHADE_EVIDENCE_CONFIDENCE or row.get("reviewed_at") is None:
    return None
  distance: float | None = None

  if category == "base":
    score = 25.0 + evidence * 10.0
    reasons = ["VERIFIED_PRODUCT_EVIDENCE"]
    labels = ["검증된 제품·판매 정보가 있는 베이스 제품군이에요"]
  else:
    reasons = ["VERIFIED_SHADE_EVIDENCE"]
    labels = ["검증된 제품·shade·판매 정보가 있는 상품이에요"]
    target_labs = target.get("targetLabs") or [target.get("targetLab")]
    target_labs = [value for value in target_labs if value]
    try:
      candidate_lab = (float(row["lab_l"]), float(row["lab_a"]), float(row["lab_b"]))
    except (KeyError, TypeError, ValueError):
      return None
    if not target_labs:
      return None
    distance = min(delta_e_ciede2000(target_lab, candidate_lab) for target_lab in target_labs)
    if distance > max_delta_e:
      return None
    score = max(0.0, 1.0 - distance / max_delta_e) * 55.0 + evidence * 10.0
    reasons.insert(0, "CLOSE_REPORT_COLOR")
    labels.insert(0, "보고서의 추천 색상과 가까운 검증 shade예요")

  finish_match = _finish_similarity(target.get("finish"), candidate_finish)
  if finish_match:
    score += 15.0 * finish_match
    reasons.append("MATCHING_FINISH")
    labels.append("보고서의 추천 피니시와 잘 맞아요")
  if set(target.get("productTypes") or []) & candidate_types:
    score += 15.0 if category != "base" else 25.0
    reasons.append("MATCHING_PRODUCT_TYPE")
    labels.append("보고서에 적힌 제품 유형과 맞아요")
  if target.get("texture") and target["texture"] == candidate_texture:
    score += 10.0
    reasons.append("MATCHING_TEXTURE")
    labels.append("보고서의 추천 제형과 맞아요")
  if target.get("coverage") and target["coverage"] == candidate_coverage:
    score += 10.0 if category != "base" else 20.0
    reasons.append("MATCHING_COVERAGE")
    labels.append("원하는 커버 범위와 맞아요")
  if category == "base" and target.get("skinType") in candidate_skin:
    score += 15.0
    reasons.append("MATCHING_SKIN_TYPE")
    labels.append("분석된 피부 타입과 맞는 베이스예요")

  item = map_catalog_product(row, liked=bool(row.get("liked")))
  item.update({
    "canLike": True,
    "canUnlike": bool(row.get("liked")),
    "reasonCodes": reasons,
    "reasonLabels": labels,
    "matchRate": round(min(100.0, score)),
    "semanticMatchRate": None,
    "recommendationBasis": "verifiedProductFamily" if category == "base" else "verifiedShade",
    "_ruleScore": min(100.0, score),
    "_semanticText": _embedding_text(
      category=category,
      color_family=(
        None
        if category == "base"
        else _broad_color_family(row.get("color_family"), row.get("srgb_hex"))
      ),
      finish=candidate_finish,
      texture=candidate_texture,
      product_types=candidate_types,
    ),
  })
  if category == "base":
    # A report's base hex is a finish recipe, not a measured foundation shade.
    # Keep the recommendation at product-family level and do not imply a shade
    # or shade-specific purchase link was selected for the user.
    item.update({"shadeId": None, "shadeName": None, "shadeHex": None, "colorDistance": None})
  if distance is not None:
    item["colorDistance"] = round(distance, 4)
  return item


def _query_text(target: dict[str, Any]) -> str:
  # Every value below is an allowlisted enum/key.  Raw reports, user IDs,
  # questions, answers and free text never enter the embedding request.
  return _embedding_text(
    category=str(target.get("category") or ""),
    color_family=target.get("colorFamily"),
    finish=target.get("finish"),
    texture=target.get("texture"),
    product_types=target.get("productTypes") or [],
  )


def _embedding_cache_key(settings: Settings, text: str) -> str:
  digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
  return f"{settings.effective_embedding_model_id}:{settings.embedding_dimension}:{digest}"


def _complete_embedding_call(key: str, future: Future[list[float] | None]) -> None:
  try:
    vector = future.result()
  except Exception:  # pragma: no cover - embed_text already degrades provider failures.
    logger.warning("[aura:products] makeup-report:embedding-worker-failed", exc_info=True)
    vector = None
  completed_at = time.monotonic()
  ttl = EMBEDDING_CACHE_SUCCESS_TTL_SECONDS if vector else EMBEDDING_CACHE_FAILURE_TTL_SECONDS
  with _EMBEDDING_CACHE_LOCK:
    if _EMBEDDING_INFLIGHT.get(key) is future:
      _EMBEDDING_INFLIGHT.pop(key, None)
    _EMBEDDING_CACHE[key] = (completed_at + ttl, vector)
    _EMBEDDING_CACHE.move_to_end(key)
    while len(_EMBEDDING_CACHE) > EMBEDDING_CACHE_MAX_ENTRIES:
      _EMBEDDING_CACHE.popitem(last=False)
  _EMBEDDING_PROVIDER_SLOTS.release()


async def _cached_embedding(
  settings: Settings,
  text: str,
  semaphore: asyncio.Semaphore,
) -> tuple[list[float] | None, bool, str | None]:
  key = _embedding_cache_key(settings, text)
  now = time.monotonic()
  future: Future[list[float] | None] | None = None
  created = False
  with _EMBEDDING_CACHE_LOCK:
    cached = _EMBEDDING_CACHE.get(key)
    if cached and cached[0] > now:
      _EMBEDDING_CACHE.move_to_end(key)
      return cached[1], True, None
    if cached:
      _EMBEDDING_CACHE.pop(key, None)
    future = _EMBEDDING_INFLIGHT.get(key)
    if future is None:
      if not _EMBEDDING_PROVIDER_SLOTS.acquire(blocking=False):
        return None, False, "embedding_capacity_saturated"
      try:
        future = _EMBEDDING_EXECUTOR.submit(embed_text, text, settings)
      except Exception:
        _EMBEDDING_PROVIDER_SLOTS.release()
        raise
      _EMBEDDING_INFLIGHT[key] = future
      created = True
  if created:
    # The callback owns cache publication and the provider slot. It still runs
    # when a request timeout cancels its asyncio waiter, so at most the fixed
    # global number of Bedrock calls can outlive a response.
    future.add_done_callback(lambda completed, cache_key=key: _complete_embedding_call(cache_key, completed))
  async with semaphore:
    # Shield the shared single-flight future. Cancelling one request must not
    # cancel the provider work that another request is already awaiting.
    vector = await asyncio.shield(asyncio.wrap_future(future))
  return vector, not created, None


def _cosine(first: list[float], second: list[float]) -> float | None:
  if not first or len(first) != len(second):
    return None
  first_norm = math.sqrt(sum(value * value for value in first))
  second_norm = math.sqrt(sum(value * value for value in second))
  if not first_norm or not second_norm:
    return None
  return sum(left * right for left, right in zip(first, second)) / (first_norm * second_norm)


async def _semantic_rerank(
  candidates: list[dict[str, Any]],
  target: dict[str, Any],
  settings: Settings,
  semaphore: asyncio.Semaphore,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
  if not candidates:
    return candidates, {"applied": False, "cacheHits": 0, "cacheMisses": 0, "degradedReason": None}
  if not settings.effective_embedding_model_id or not settings.aws_credentials_configured:
    return candidates, {
      "applied": False,
      "cacheHits": 0,
      "cacheMisses": 0,
      "degradedReason": "embedding_not_configured",
    }
  query_vector, query_hit, query_degraded = await _cached_embedding(
    settings, _query_text(target), semaphore,
  )
  if not query_vector:
    return candidates, {
      "applied": False,
      "cacheHits": int(query_hit),
      "cacheMisses": int(not query_hit),
      "degradedReason": query_degraded or "embedding_unavailable",
    }
  results = await asyncio.gather(*(
    _cached_embedding(settings, str(candidate.get("_semanticText") or ""), semaphore)
    for candidate in candidates
  ))
  applied = False
  cache_hits = int(query_hit)
  cache_misses = int(not query_hit)
  missing_candidate_vector = False
  candidate_degraded_reason: str | None = None
  for candidate, (vector, hit, degraded_reason) in zip(candidates, results):
    cache_hits += int(hit)
    cache_misses += int(not hit)
    if not vector:
      missing_candidate_vector = True
      candidate_degraded_reason = candidate_degraded_reason or degraded_reason
      continue
    similarity = _cosine(query_vector, vector or [])
    if similarity is None:
      continue
    semantic_rate = embedding_match_percent(similarity)
    candidate["semanticMatchRate"] = semantic_rate
    candidate["matchRate"] = round(
      float(candidate.get("_ruleScore") or 0) * (1 - SEMANTIC_WEIGHT)
      + semantic_rate * SEMANTIC_WEIGHT,
    )
    applied = True
  if missing_candidate_vector:
    # Never mix semantically scored and unscored candidates in one category.
    # Capacity/provider degradation falls back to the original deterministic
    # rule order for the whole group.
    for candidate in candidates:
      candidate["semanticMatchRate"] = None
      candidate["matchRate"] = round(float(candidate.get("_ruleScore") or 0))
    candidates.sort(
      key=lambda item: (-float(item.get("_ruleScore") or 0), str(item.get("productId") or "")),
    )
    return candidates, {
      "applied": False,
      "cacheHits": cache_hits,
      "cacheMisses": cache_misses,
      "degradedReason": candidate_degraded_reason or "candidate_embeddings_unavailable",
    }
  candidates.sort(key=lambda item: (-float(item.get("matchRate") or 0), str(item.get("productId") or "")))
  return candidates, {
    "applied": applied,
    "cacheHits": cache_hits,
    "cacheMisses": cache_misses,
    "degradedReason": None if applied else "candidate_embeddings_unavailable",
  }


async def _bounded_semantic_rerank(
  candidates: list[dict[str, Any]],
  target: dict[str, Any],
  settings: Settings,
  semaphore: asyncio.Semaphore,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
  try:
    return await asyncio.wait_for(
      _semantic_rerank(candidates, target, settings, semaphore),
      timeout=SEMANTIC_RERANK_TIMEOUT_SECONDS,
    )
  except TimeoutError:
    # Bedrock is supplemental. A slow model must never turn already-valid
    # licensed/rule candidates into a failed or >mobile-timeout response.
    candidates.sort(
      key=lambda item: (-float(item.get("_ruleScore") or 0), str(item.get("productId") or "")),
    )
    return candidates, {
      "applied": False,
      "cacheHits": 0,
      "cacheMisses": 0,
      "degradedReason": "embedding_timeout",
    }


async def _fetch_internal_candidates(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  categories: list[str],
  product_ids: list[UUID] | None = None,
) -> list[dict[str, Any]]:
  return await db.fetch(
    f"""
    with eligible as (
      select p.id as product_id,p.brand_name,p.product_name,p.category::text as category,
        p.tags,p.product_payload,p.catalog_version,p.updated_at as source_updated_at,
        s.id as shade_id,s.shade_name,s.product_region,s.srgb_hex,s.lab_l,s.lab_a,s.lab_b,
        s.color_family,s.finish,s.coverage,s.opacity,s.evidence_type,s.evidence_confidence,s.reviewed_at,
        a.asset_url as image_url,
        o.id as offer_id,o.seller_name,o.seller_domain,o.purchase_url,o.currency,o.price_amount,
        o.price_updated_at,o.availability_status,o.affiliate_type,o.disclosure_label,
        (viewer_like.product_id is not null) as liked,
        row_number() over (
          partition by s.product_region
          order by s.evidence_confidence desc,s.reviewed_at desc nulls last,s.id
        ) as category_position
      from product_shades s
      join products p on p.id=s.product_id
      join lateral (
        select candidate.* from product_assets candidate
        where candidate.product_id=p.id and candidate.is_active=true
          and candidate.asset_type='packshot' and candidate.license_status='valid'
          and candidate.allowed_uses @> array['mobile_display','recommendation']::text[]
          and (candidate.valid_from is null or candidate.valid_from<=now())
          and (candidate.valid_until is null or candidate.valid_until>now())
          and (
            (s.product_region='base' and candidate.shade_id is null)
            or (s.product_region<>'base' and (candidate.shade_id is null or candidate.shade_id=s.id))
          )
        order by case when candidate.shade_id=s.id then 0 else 1 end,
          candidate.reviewed_at desc nulls last limit 1
      ) a on true
      join lateral (
        select candidate.* from product_offers candidate
        where candidate.product_id=p.id and candidate.is_active=true
          and candidate.availability_status in ('in_stock','limited')
          and candidate.license_status='valid'
          and candidate.allowed_uses @> array['mobile_display']::text[]
          and (candidate.valid_until is null or candidate.valid_until>now())
          and (
            (s.product_region='base' and candidate.shade_id is null)
            or (s.product_region<>'base' and (candidate.shade_id is null or candidate.shade_id=s.id))
          )
          {offer_freshness_sql('candidate', '$4')}
        order by case when candidate.shade_id=s.id then 0 else 1 end,
          candidate.price_updated_at desc nulls last limit 1
      ) o on true
      left join user_product_likes viewer_like on viewer_like.user_id=$2 and viewer_like.product_id=p.id
      where s.product_region=any($1::text[])
        and ($7::uuid[] is null or p.id=any($7::uuid[]))
        and p.category::text=s.product_region
        and p.is_active=true and p.catalog_status='published' and p.license_status='valid'
        and p.allowed_uses @> array['mobile_display','recommendation']::text[]
        and (p.license_valid_from is null or p.license_valid_from<=now())
        and (p.license_valid_until is null or p.license_valid_until>now())
        and s.is_active=true and s.license_status='valid'
        and s.allowed_uses @> array['mobile_display','recommendation']::text[]
        and s.evidence_type=any($3::text[])
        and s.evidence_confidence >= $6
        and s.reviewed_at is not null and s.reviewed_at <= now()
        and (
          s.product_region='base'
          or (s.lab_l is not null and s.lab_a is not null and s.lab_b is not null)
        )
        and (s.license_valid_from is null or s.license_valid_from<=now())
        and (s.license_valid_until is null or s.license_valid_until>now())
    )
    select * from eligible where $7::uuid[] is not null or category_position<=$5
    """,
    categories,
    user_id,
    sorted(ELIGIBLE_EVIDENCE_TYPES),
    settings.product_offer_max_age_hours,
    MAX_INTERNAL_ROWS_PER_CATEGORY,
    MIN_VERIFIED_SHADE_EVIDENCE_CONFIDENCE,
    product_ids,
  )


def _strip_private_fields(item: dict[str, Any]) -> dict[str, Any]:
  return {key: value for key, value in item.items() if not key.startswith("_")}


def _dedupe_product_candidates(candidates: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
  deduped: list[dict[str, Any]] = []
  seen: set[tuple[str, str]] = set()
  for candidate in candidates:
    identity = (
      str(candidate.get("externalSource") or "internal"),
      str(candidate.get("productId") or ""),
    )
    if not identity[1] or identity in seen:
      continue
    seen.add(identity)
    deduped.append(candidate)
  return deduped


async def get_makeup_report_product_recommendations(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  report_id: UUID,
  look_id: str | None,
  categories: list[str],
  per_category_limit: int,
) -> dict[str, Any]:
  report = await db.fetchrow(
    """
    select id,scenario_text,recommendation,context_snapshot,schema_version,image_status,created_at
    from makeup_recommendation_reports
    where id=$1 and user_id=$2
    """,
    report_id,
    user_id,
  )
  if report is None:
    raise AppError(404, "MAKEUP_RECOMMENDATION_NOT_FOUND", "The makeup recommendation report was not found.")
  if str(report.get("schema_version") or "") != "makeup-recommendation-v2":
    raise AppError(409, "MAKEUP_RECOMMENDATION_SCHEMA_UNSUPPORTED", "Only a V2 makeup recommendation can be matched to products.")
  recommendation, selected = resolve_report_look(report.get("recommendation"), look_id)
  if selected is None:
    raise AppError(422, "MAKEUP_RECOMMENDATION_LOOK_INVALID", "lookId does not belong to this report.")

  assets = await db.fetch(
    """
    select report_id,look_id,role,status,image_url,storage_bucket,object_key,is_private
    from makeup_recommendation_assets
    where report_id=$1
    order by case role when 'anchor' then 1 when 'bold' then 2 else 3 end
    """,
    report_id,
  )
  asset_by_look = {
    (str(asset.get("report_id")), str(asset.get("look_id") or "")): dict(asset)
    for asset in assets
  }
  report_projection = _report_projection(
    dict(report),
    recommendation,
    asset_by_look=asset_by_look,
    settings=settings,
    s3=S3Service(settings),
  )
  if report_projection is None:
    raise AppError(409, "MAKEUP_RECOMMENDATION_RECIPE_INCOMPLETE", "The report has no selectable looks.")
  selected_look_projection = next(
    look for look in report_projection["looks"] if look["lookId"] == _clean(selected.get("id") or selected.get("role"), 80)
  )

  context = _json_object(report.get("context_snapshot"))
  target_by_category: dict[str, dict[str, Any]] = {}
  for guide in _json_list(selected.get("areaGuides")):
    if not isinstance(guide, dict):
      continue
    guide_categories = AREA_TO_CATEGORIES.get(_clean(guide.get("area"), 30), ())
    for category in guide_categories:
      if category not in categories:
        continue
      target = _guide_target(guide, context, category)
      if category != "base" and target.get("targetLab") is None:
        continue
      target_by_category[category] = target
  missing_guides = [category for category in categories if category not in target_by_category]
  if missing_guides:
    raise AppError(
      409,
      "MAKEUP_RECOMMENDATION_RECIPE_INCOMPLETE",
      "The selected look does not contain every requested product area.",
      {"missingCategories": missing_guides},
    )

  # The licensed, measured-shade database is the fast and strongest evidence
  # source. Live shopping search is deliberately deferred until its per-
  # category shortage is known; it is never called for a sufficient category.
  internal_rows = await _fetch_internal_candidates(
    db,
    settings,
    user_id=user_id,
    categories=categories,
  )
  rows_by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
  for row in internal_rows:
    rows_by_category[str(row.get("product_region") or "")].append(dict(row))

  internal_by_category: dict[str, list[dict[str, Any]]] = {}
  for category in categories:
    candidates = [
      candidate
      for row in rows_by_category.get(category, [])
      if (candidate := _internal_candidate(
        row,
        target_by_category[category],
        max_delta_e=settings.product_ar_max_delta_e,
      )) is not None
    ]
    candidates.sort(key=lambda item: (-float(item["_ruleScore"]), str(item.get("productId") or "")))
    # Licensed measured shades retain strict score/Delta-E order. Report-bound
    # discovery candidates are independently color-gated before entering this
    # list; Naver search order itself never contributes to the final ranking.
    internal_by_category[category] = _dedupe_product_candidates(
      candidates,
    )[:MAX_RERANK_CANDIDATES_PER_CATEGORY]

  desired_count = min(per_category_limit, MAX_RERANK_CANDIDATES_PER_CATEGORY)
  shortages = {
    category: max(0, desired_count - len(internal_by_category[category]))
    for category in categories
  }
  shortage_targets = {
    category: target_by_category[category]
    for category in categories
    if shortages[category] > 0
  }
  if shortage_targets:
    discovered_by_category, discovery_meta = await discover_report_products(
      settings,
      targets_by_category=shortage_targets,
      per_category_limit=desired_count,
    )
  else:
    discovered_by_category = {}
    discovery_meta = {
      "contractVersion": DISCOVERY_CONTRACT_VERSION,
      "provider": "naver_shopping",
      "configured": bool(
        settings.naver_shopping_client_id and settings.naver_shopping_client_secret
      ),
      "applied": False,
      "queriedCategories": [],
      "verifiedItems": 0,
      "error": None,
      "skippedReason": "database_sufficient",
    }
  discovery_meta = {
    **discovery_meta,
    "databaseFirst": True,
    "databaseEligibleItems": sum(len(items) for items in internal_by_category.values()),
    "databaseSufficientCategories": [
      category for category in categories if shortages[category] == 0
    ],
    "shortageCategories": [
      category for category in categories if shortages[category] > 0
    ],
    "requestedItemsPerCategory": desired_count,
    "supplementedItems": sum(
      min(shortages[category], len(discovered_by_category.get(category, [])))
      for category in categories
    ),
  }

  candidate_groups: dict[str, list[dict[str, Any]]] = {}
  for category in categories:
    discovered = []
    for item in discovered_by_category.get(category, [])[:shortages[category]]:
      candidate = dict(item)
      candidate["_semanticText"] = _embedding_text(
        category=category,
        color_family=target_by_category[category].get("colorFamily"),
        finish=target_by_category[category].get("finish"),
        texture=target_by_category[category].get("texture"),
        product_types=target_by_category[category].get("productTypes") or (),
      )
      discovered.append(candidate)
    combined = [*internal_by_category[category], *discovered]
    combined.sort(key=lambda item: (-float(item.get("_ruleScore") or 0), str(item.get("productId") or "")))
    candidate_groups[category] = _dedupe_product_candidates(combined)[:MAX_RERANK_CANDIDATES_PER_CATEGORY]

  semaphore = asyncio.Semaphore(8)
  reranked_results = await asyncio.gather(*(
    _bounded_semantic_rerank(
      candidate_groups[category], target_by_category[category], settings, semaphore,
    )
    for category in categories
  ))

  groups: list[dict[str, Any]] = []
  embedding_stats = {"applied": False, "cacheHits": 0, "cacheMisses": 0}
  degraded_reasons: set[str] = set()
  for category, (candidates, semantic_meta) in zip(categories, reranked_results):
    embedding_stats["applied"] = bool(embedding_stats["applied"] or semantic_meta["applied"])
    embedding_stats["cacheHits"] += int(semantic_meta["cacheHits"])
    embedding_stats["cacheMisses"] += int(semantic_meta["cacheMisses"])
    if semantic_meta.get("degradedReason"):
      degraded_reasons.add(str(semantic_meta["degradedReason"]))

    selected_items = candidates[:per_category_limit]
    selected_sources = {str(item.get("externalSource") or "licensed") for item in selected_items}
    group_source = (
      "licensedCatalog"
      if selected_sources == {"licensed"}
      else "verifiedLiveDiscovery"
      if selected_sources == {"naver_shopping_search"}
      else "verifiedCatalogAndLiveDiscovery"
      if selected_items
      else "none"
    )
    groups.append({
      "category": category,
      "label": CATEGORY_LABELS[category],
      "status": "ready" if selected_items else "empty",
      "target": _target_response(target_by_category[category]),
      "items": [_strip_private_fields(item) for item in selected_items],
      "source": group_source,
      "degraded": False,
      "degradedReason": None,
    })

  nonempty = sum(bool(group["items"]) for group in groups)
  status = "noEligibleProducts" if nonempty == 0 else "ready" if nonempty == len(groups) else "partial"
  embedding = {
    **embedding_stats,
    "modelId": settings.effective_embedding_model_id or None,
    "semanticWeight": SEMANTIC_WEIGHT,
    "cache": EMBEDDING_CACHE_VERSION,
    "cacheMaxEntries": EMBEDDING_CACHE_MAX_ENTRIES,
    "candidateLimitPerCategory": MAX_RERANK_CANDIDATES_PER_CATEGORY,
    "degradedReason": ",".join(sorted(degraded_reasons)) or None,
  }
  return {
    "status": status,
    "report": report_projection,
    "selectedLook": selected_look_projection,
    "groups": groups,
    "ranking": {
      "strategy": ALGORITHM_VERSION,
      "embeddingApplied": embedding["applied"],
      "embeddingModelId": embedding["modelId"],
      "semanticWeight": embedding["semanticWeight"],
      "candidateLimitPerCategory": embedding["candidateLimitPerCategory"],
      "cache": embedding["cache"],
      "cacheHits": embedding["cacheHits"],
      "cacheMisses": embedding["cacheMisses"],
      "degradedReason": embedding["degradedReason"],
      "discovery": discovery_meta,
      "fallback": {
        "mode": "none",
        "reasonCodes": [],
        "supplementalAuradinApplied": False,
      },
    },
    "algorithmVersion": ALGORITHM_VERSION,
  }
