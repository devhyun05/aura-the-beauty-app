"""Report-bound discovery of real products with image color evidence.

Naver Shopping is used only to discover live, purchasable candidates. Its
search order is never treated as recommendation evidence. Non-base candidates
must additionally pass a deterministic CIEDE2000 comparison between the saved
report color and colors extracted from the product listing image. The resulting
items are persisted by the existing report snapshot worker, so reopening a
report does not run a new search or silently change its products.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
import colorsys
import hashlib
import html
import math
import re
from typing import Any, Iterable, Mapping
from urllib.parse import urlparse

import httpx
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.settings import Settings
from app.services.product_color import delta_e_ciede2000, normalize_hex_color, srgb_hex_to_lab
from app.services.shopping_products import _safe_naver_result_url


DISCOVERY_CONTRACT_VERSION = "makeup-report-live-product-evidence-v2"
DISCOVERY_SOURCE = "naver_shopping_search"
NAVER_SHOPPING_API_URL = "https://openapi.naver.com/v1/search/shop.json"
IMAGE_EVIDENCE_TYPE = "listing_image_palette_ciede2000"
BASE_EVIDENCE_TYPE = "live_listing_product_family"
MAX_CONCURRENT_IMAGE_REQUESTS = 8

_HTML_TAG = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")
_SAFE_QUERY = re.compile(r"[^0-9a-zA-Z가-힣\s]+")
_COLOR_TOKEN = re.compile(r"[0-9a-zA-Z가-힣]+")
_PRODUCT_KEY_SAFE = re.compile(r"[^0-9a-zA-Z가-힣]+")
_PRODUCT_BUNDLE_COUNT = re.compile(r"(?<![0-9a-zA-Z가-힣])\d+\s*\+\s*\d+(?![0-9a-zA-Z가-힣])")
_PRODUCT_QUANTITY = re.compile(
  r"(?<![0-9a-zA-Z가-힣])(?:x\s*)?\d+(?:\.\d+)?\s*(?:개입|개|그램|밀리리터|g|ml)(?![0-9a-zA-Z가-힣])",
  re.IGNORECASE,
)

CATEGORY_SEARCH_TERMS: dict[str, tuple[str, ...]] = {
  "base": ("쿠션", "파운데이션", "컨실러", "프라이머", "베이스", "파우더"),
  "shadow": ("아이섀도우", "아이섀도", "섀도우", "섀도", "아이팔레트", "아이 팔레트"),
  "liner": ("아이라이너", "아이 라이너", "라이너"),
  "brow": ("아이브로우", "아이 브로우", "브로우", "눈썹"),
  "cheek": ("블러셔", "블러쉬", "블러시", "치크"),
  "lip": ("립틴트", "립 틴트", "틴트", "립스틱", "립글로스", "립 글로스", "립밤"),
}

CATEGORY_QUERY_LABELS = {
  "base": "쿠션 파운데이션",
  "shadow": "아이섀도우",
  "liner": "아이라이너",
  "brow": "아이브로우",
  "cheek": "블러셔",
  "lip": "립 틴트",
}

COLOR_FAMILY_QUERY_TERMS: dict[str, tuple[str, ...]] = {
  "black": ("블랙", "검정", "black"),
  "brown": ("브라운", "갈색", "brown"),
  "coral": ("코랄", "coral"),
  "gray": ("그레이", "회색", "gray", "grey"),
  "mauve": ("모브", "mauve"),
  "nude": ("누드", "nude"),
  "orange": ("오렌지", "orange"),
  "peach": ("피치", "peach"),
  "pink": ("핑크", "pink"),
  "plum": ("플럼", "plum"),
  "purple": ("퍼플", "보라", "purple", "violet"),
  "red": ("레드", "빨강", "red"),
  "rose": ("로즈", "rose"),
  "beige": ("베이지", "beige"),
  "gold": ("골드", "gold"),
}


@dataclass(frozen=True)
class PaletteColorMatch:
  target_hex: str
  observed_hex: str
  delta_e: float
  coverage: float


@dataclass(frozen=True)
class ListingImageColorEvidence:
  color_hex: str
  delta_e: float
  coverage: float
  target_hex: str
  observed_palette_hexes: tuple[str, ...]
  matches: tuple[PaletteColorMatch, ...]


def _clean_text(value: Any, limit: int = 240) -> str:
  decoded = html.unescape(str(value or ""))
  return _SPACE.sub(" ", _HTML_TAG.sub("", decoded)).strip()[:limit]


def _safe_query_text(value: Any, limit: int = 80) -> str:
  return _SPACE.sub(" ", _SAFE_QUERY.sub(" ", _clean_text(value, limit * 2))).strip()[:limit]


def _parse_price(value: Any) -> int | None:
  try:
    parsed = int(str(value or "").replace(",", ""))
  except (TypeError, ValueError):
    return None
  return parsed if parsed > 0 else None


def _product_offer_family_key(item: Mapping[str, Any]) -> str:
  """Identify the same cosmetic product across seller/pack-count listings."""

  title = _clean_text(item.get("productName") or item.get("title"), 240).casefold()
  title = _PRODUCT_BUNDLE_COUNT.sub(" ", title)
  title = _PRODUCT_QUANTITY.sub(" ", title)
  normalized = _SPACE.sub(" ", _PRODUCT_KEY_SAFE.sub(" ", title)).strip()
  category = _clean_text(item.get("category"), 30).casefold()
  return f"{category}:{normalized}" if normalized else ""


def _offer_preference(item: Mapping[str, Any]) -> tuple[float, float, float, str]:
  price = item.get("price") if isinstance(item.get("price"), Mapping) else {}
  try:
    amount = float(price.get("amount"))
  except (TypeError, ValueError):
    amount = math.inf
  try:
    match_rate = float(item.get("matchRate"))
  except (TypeError, ValueError):
    match_rate = 0.0
  try:
    color_distance = float(item.get("colorDistance"))
  except (TypeError, ValueError):
    color_distance = math.inf
  return amount, -match_rate, color_distance, str(item.get("productId") or "")


def dedupe_lowest_price_product_offers(
  items: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
  """Keep one verified offer per product family, preferring lowest total price.

  The first family's ranking position is retained, while the displayed item,
  price and purchase URL come from its cheapest verified seller/pack listing.
  Internal catalog identities stay keyed by productId and are never collapsed
  merely because two licensed products happen to share a display name.
  """

  selected: list[dict[str, Any]] = []
  positions: dict[tuple[str, str], int] = {}
  for item in items:
    external_source = str(item.get("externalSource") or "")
    identity = (
      external_source,
      _product_offer_family_key(item) if external_source else str(item.get("productId") or ""),
    )
    if not identity[1]:
      continue
    position = positions.get(identity)
    if position is None:
      positions[identity] = len(selected)
      selected.append(item)
      continue
    if _offer_preference(item) < _offer_preference(selected[position]):
      selected[position] = item
  return selected


def _target_colors(target: Mapping[str, Any]) -> list[dict[str, str]]:
  raw_colors = target.get("colors")
  values = raw_colors if isinstance(raw_colors, list) else []
  if not values and target.get("colorHex"):
    values = [{"hex": target.get("colorHex"), "name": target.get("colorName")}]
  colors: list[dict[str, str]] = []
  for value in values:
    if not isinstance(value, Mapping):
      continue
    try:
      color_hex = normalize_hex_color(str(value.get("hex") or ""))
    except ValueError:
      continue
    if color_hex not in {item["hex"] for item in colors}:
      colors.append({"hex": color_hex, "name": _clean_text(value.get("name"), 80)})
  return colors


def build_report_product_query(category: str, target: Mapping[str, Any]) -> str:
  """Build a bounded query from server-authored recipe fields only."""

  label = CATEGORY_QUERY_LABELS.get(category, "화장품")
  if category == "base":
    qualifiers = [target.get("finish"), target.get("texture"), target.get("coverage")]
  else:
    family = str(target.get("colorFamily") or "").casefold()
    family_term = (COLOR_FAMILY_QUERY_TERMS.get(family) or (family,))[0]
    qualifiers = [target.get("colorName"), family_term, target.get("finish")]
  return _safe_query_text(" ".join(str(value or "") for value in [*qualifiers, label, "화장품"]))


def build_report_product_queries(category: str, target: Mapping[str, Any]) -> list[str]:
  """Build independent searches so a palette may match only part of a recipe."""

  primary = build_report_product_query(category, target)
  if category != "shadow":
    return [primary] if primary else []

  queries = [primary]
  for color in _target_colors(target):
    color_name = _safe_query_text(color.get("name"), 40)
    if color_name:
      queries.append(_safe_query_text(f"{color_name} 아이섀도우 팔레트 화장품"))
  family = str(target.get("colorFamily") or "").casefold()
  family_term = (COLOR_FAMILY_QUERY_TERMS.get(family) or (family,))[0]
  if family_term:
    queries.append(_safe_query_text(f"{family_term} 아이섀도우 팔레트 화장품"))
  return list(dict.fromkeys(query for query in queries if query))[:4]


def _listing_matches_category(item: Mapping[str, Any], category: str) -> bool:
  haystack = " ".join(
    _clean_text(item.get(key), 180).casefold()
    for key in ("title", "category1", "category2", "category3", "category4")
  )
  return any(term.casefold() in haystack for term in CATEGORY_SEARCH_TERMS.get(category, ()))


def _explicit_color_term_match(title: str, target: Mapping[str, Any]) -> bool:
  normalized = title.casefold()
  family = str(target.get("colorFamily") or "").casefold()
  terms = set(COLOR_FAMILY_QUERY_TERMS.get(family, ()))
  color_name = _clean_text(target.get("colorName"), 80)
  terms.update(
    token for token in _COLOR_TOKEN.findall(color_name)
    if len(token) >= 2 and token.casefold() not in {"소프트", "라이트", "딥", "뮤티드", "내추럴"}
  )
  return any(term.casefold() in normalized for term in terms if term)


def _candidate_color_allowed(rgb: tuple[int, int, int], category: str) -> bool:
  red, green, blue = (channel / 255.0 for channel in rgb)
  hue, saturation, value = colorsys.rgb_to_hsv(red, green, blue)
  del hue
  if min(rgb) >= 244 or value <= 0.025:
    return False
  if category in {"liner", "brow"}:
    return value <= 0.88
  if category == "shadow":
    # Muted beige/taupe pans can have low saturation. The category/title gate
    # and the later Delta-E check provide the actual recommendation evidence.
    return saturation >= 0.035 and 0.08 <= value <= 0.98
  if category in {"lip", "cheek"}:
    return saturation >= 0.10 and value >= 0.08
  return saturation >= 0.04 and 0.18 <= value <= 0.96


def extract_listing_image_color_evidence(
  image_bytes: bytes,
  *,
  category: str,
  target_colors: Iterable[Mapping[str, str]],
) -> ListingImageColorEvidence | None:
  """Extract a palette and one-to-one report-target matches from real pixels."""

  try:
    with Image.open(BytesIO(image_bytes)) as opened:
      image = ImageOps.exif_transpose(opened).convert("RGBA")
      background = Image.new("RGBA", image.size, (255, 255, 255, 255))
      image = Image.alpha_composite(background, image).convert("RGB")
      image.thumbnail((112, 112), Image.Resampling.LANCZOS)
      quantized = image.quantize(colors=20, method=Image.Quantize.MEDIANCUT).convert("RGB")
  except (OSError, UnidentifiedImageError, ValueError):
    return None

  color_counts = quantized.getcolors(maxcolors=20) or []
  total_pixels = max(1, quantized.width * quantized.height)
  targets: list[tuple[str, tuple[float, float, float]]] = []
  for raw in target_colors:
    try:
      color_hex = normalize_hex_color(str(raw.get("hex") or ""))
      targets.append((color_hex, srgb_hex_to_lab(color_hex)))
    except (ValueError, TypeError):
      continue
  if not targets:
    return None

  palette: list[tuple[str, tuple[float, float, float], float]] = []
  for count, rgb in color_counts:
    if count / total_pixels < 0.004 or not _candidate_color_allowed(rgb, category):
      continue
    candidate_hex = f"#{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}"
    palette.append((candidate_hex, srgb_hex_to_lab(candidate_hex), count / total_pixels))
  if not palette:
    return None

  # A palette pan may satisfy at most one report target, and vice versa. Greedy
  # minimum-distance assignment avoids claiming that one large background or
  # one pan matched every requested shadow color.
  pairs = sorted(
    (
      PaletteColorMatch(
        target_hex=target_hex,
        observed_hex=candidate_hex,
        delta_e=delta_e_ciede2000(target_lab, candidate_lab),
        coverage=coverage,
      )
      for target_hex, target_lab in targets
      for candidate_hex, candidate_lab, coverage in palette
    ),
    key=lambda match: (match.delta_e, -match.coverage, match.target_hex, match.observed_hex),
  )
  selected: list[PaletteColorMatch] = []
  used_targets: set[str] = set()
  used_observed: set[str] = set()
  for match in pairs:
    if match.target_hex in used_targets or match.observed_hex in used_observed:
      continue
    selected.append(match)
    used_targets.add(match.target_hex)
    used_observed.add(match.observed_hex)
  selected.sort(key=lambda match: (match.delta_e, -match.coverage, match.target_hex))
  if not selected:
    return None

  best = selected[0]
  observed_palette = tuple(
    color_hex
    for color_hex, _lab, _coverage in sorted(palette, key=lambda item: (-item[2], item[0]))[:12]
  )
  return ListingImageColorEvidence(
    color_hex=best.observed_hex,
    delta_e=best.delta_e,
    coverage=best.coverage,
    target_hex=best.target_hex,
    observed_palette_hexes=observed_palette,
    matches=tuple(selected),
  )


async def _fetch_listing_image_evidence(
  client: httpx.AsyncClient,
  image_url: str,
  *,
  category: str,
  target_colors: list[dict[str, str]],
  max_image_bytes: int,
  semaphore: asyncio.Semaphore,
) -> ListingImageColorEvidence | None:
  image_host = (urlparse(image_url).hostname or "").casefold()
  if not (image_host == "pstatic.net" or image_host.endswith(".pstatic.net")):
    return None
  try:
    async with semaphore:
      response = await client.get(image_url, headers={"Accept": "image/*"})
    response.raise_for_status()
    content_type = response.headers.get("content-type", "").casefold()
    if not content_type.startswith("image/") or len(response.content) > max_image_bytes:
      return None
    return await asyncio.to_thread(
      extract_listing_image_color_evidence,
      response.content,
      category=category,
      target_colors=target_colors,
    )
  except (httpx.HTTPError, OSError, ValueError):
    return None


def _seller_name(item: Mapping[str, Any], purchase_url: str) -> str:
  return _clean_text(item.get("mallName"), 100) or (urlparse(purchase_url).hostname or "외부 판매처")


def _brand_name(item: Mapping[str, Any]) -> str:
  return _clean_text(item.get("brand") or item.get("maker") or item.get("mallName"), 100) or "브랜드 확인"


def _stable_product_id(item: Mapping[str, Any], purchase_url: str) -> str:
  product_id = _clean_text(item.get("productId"), 100)
  if product_id:
    return f"naver-{product_id}"
  return f"naver-{hashlib.sha256(purchase_url.encode('utf-8')).hexdigest()[:20]}"


def _evidence_confidence(
  evidence: ListingImageColorEvidence,
  *,
  max_delta_e: float,
  explicit_color_term: bool,
  verified_match_count: int,
  target_color_count: int,
) -> float:
  closeness = max(0.0, 1.0 - evidence.delta_e / max_delta_e)
  coverage = min(1.0, evidence.coverage / 0.12)
  palette_ratio = min(1.0, verified_match_count / max(1, min(target_color_count, 3)))
  return round(min(
    0.97,
    0.60 + 0.18 * closeness + 0.06 * coverage + 0.08 * palette_ratio
    + (0.05 if explicit_color_term else 0),
  ), 3)


def _color_match_rate(
  evidence: ListingImageColorEvidence,
  *,
  max_delta_e: float,
  explicit_color_term: bool,
  verified_match_count: int,
  target_color_count: int,
) -> int:
  closeness = max(0.0, 1.0 - evidence.delta_e / max_delta_e)
  palette_ratio = min(1.0, verified_match_count / max(1, min(target_color_count, 3)))
  return round(min(
    99.0,
    48.0 + closeness * 35.0 + palette_ratio * 11.0 + (5.0 if explicit_color_term else 0.0),
  ))


async def _map_naver_candidate(
  client: httpx.AsyncClient,
  settings: Settings,
  item: Mapping[str, Any],
  *,
  category: str,
  target: Mapping[str, Any],
  captured_at: datetime,
  semaphore: asyncio.Semaphore,
) -> dict[str, Any] | None:
  if not _listing_matches_category(item, category):
    return None
  purchase_url = _safe_naver_result_url(item.get("link"))
  image_url = _safe_naver_result_url(item.get("image"))
  price = _parse_price(item.get("lprice"))
  title = _clean_text(item.get("title"), 220)
  if not purchase_url or not image_url or not price or not title:
    return None

  product_id = _stable_product_id(item, purchase_url)
  seller_name = _seller_name(item, purchase_url)
  seller_domain = (urlparse(purchase_url).hostname or "").casefold()
  explicit_color_term = _explicit_color_term_match(title, target)
  color_evidence: ListingImageColorEvidence | None = None

  if category != "base":
    target_colors = _target_colors(target)
    color_evidence = await _fetch_listing_image_evidence(
      client,
      image_url,
      category=category,
      target_colors=target_colors,
      max_image_bytes=settings.makeup_report_product_discovery_max_image_bytes,
      semaphore=semaphore,
    )
    max_delta_e = (
      settings.makeup_report_shadow_palette_max_delta_e
      if category == "shadow"
      else settings.product_ar_max_delta_e
    )
    verified_matches = [
      match for match in color_evidence.matches
      if match.delta_e <= max_delta_e
    ] if color_evidence is not None else []
    # Shadow palettes are intentionally partial-match: one genuinely similar
    # pan is sufficient; additional independently matched pans raise ranking.
    if color_evidence is None or not verified_matches:
      return None
    evidence_type = IMAGE_EVIDENCE_TYPE
    evidence_confidence = _evidence_confidence(
      color_evidence,
      max_delta_e=max_delta_e,
      explicit_color_term=explicit_color_term,
      verified_match_count=len(verified_matches),
      target_color_count=len(target_colors),
    )
    match_rate = _color_match_rate(
      color_evidence,
      max_delta_e=max_delta_e,
      explicit_color_term=explicit_color_term,
      verified_match_count=len(verified_matches),
      target_color_count=len(target_colors),
    )
    if category == "shadow":
      reason_codes = ["REPORT_PALETTE_PARTIAL_MATCH", "LIVE_OFFER_VERIFIED", "CATEGORY_MATCH"]
      reason_labels = [
        f"팔레트 이미지에서 보고서 섀도우 색상 {len(verified_matches)}/{len(target_colors)}개와 가까운 팬을 확인했어요 (최소 ΔE {color_evidence.delta_e:.1f})",
        "현재 네이버 쇼핑에서 이미지·가격·구매 링크를 확인한 실제 상품이에요",
      ]
    else:
      reason_codes = ["REPORT_COLOR_IMAGE_MATCH", "LIVE_OFFER_VERIFIED", "CATEGORY_MATCH"]
      reason_labels = [
        f"상품 이미지에서 확인한 색상이 보고서의 {_clean_text(target.get('colorName'), 80) or '추천 색상'}과 가까워요 (ΔE {color_evidence.delta_e:.1f})",
        "현재 네이버 쇼핑에서 이미지·가격·구매 링크를 확인한 실제 상품이에요",
      ]
  else:
    evidence_type = BASE_EVIDENCE_TYPE
    evidence_confidence = 0.8
    match_rate = 82
    reason_codes = ["VERIFIED_PRODUCT_TYPE", "LIVE_OFFER_VERIFIED", "CATEGORY_MATCH"]
    reason_labels = [
      "보고서에 적힌 베이스 제품 유형과 맞는 실제 판매 상품이에요",
      "현재 네이버 쇼핑에서 이미지·가격·구매 링크를 확인했어요",
    ]

  captured_iso = captured_at.isoformat()
  return {
    "productId": product_id,
    "shadeId": None,
    "brandName": _brand_name(item),
    "productName": title,
    "category": category,
    "shadeName": None,
    "shadeHex": color_evidence.color_hex if color_evidence else None,
    "palette": (
      [match.observed_hex for match in verified_matches]
      if color_evidence else []
    ),
    "finish": None,
    "imageUrl": image_url,
    "purchaseUrl": purchase_url,
    "price": {"amount": price, "currency": "KRW", "updatedAt": captured_iso},
    "offer": {
      "offerId": f"external-{product_id}",
      "sellerName": seller_name,
      "sellerDomain": seller_domain,
      "availability": "external",
      "affiliateType": "none",
      "disclosureLabel": "네이버 쇼핑 판매처",
    },
    "viewerState": {"liked": False},
    "sourceUpdatedAt": captured_iso,
    "status": "active",
    "canLike": False,
    "canUnlike": False,
    "externalSource": DISCOVERY_SOURCE,
    "sponsored": False,
    "sponsorshipType": "organic",
    "reasonCodes": reason_codes,
    "reasonLabels": reason_labels,
    "matchRate": match_rate,
    "semanticMatchRate": None,
    "recommendationBasis": (
      "verifiedLiveProductFamily"
      if category == "base"
      else "verifiedListingImagePalettePartial"
      if category == "shadow"
      else "verifiedListingImageColor"
    ),
    "colorDistance": round(color_evidence.delta_e, 4) if color_evidence else None,
    "verification": {
      "contractVersion": DISCOVERY_CONTRACT_VERSION,
      "provider": "naver_shopping",
      "evidenceType": evidence_type,
      "evidenceConfidence": evidence_confidence,
      "capturedAt": captured_iso,
      "reportTargetHex": color_evidence.target_hex if color_evidence else None,
      "observedColorHex": color_evidence.color_hex if color_evidence else None,
      "colorDistance": round(color_evidence.delta_e, 4) if color_evidence else None,
      "imagePixelCoverage": round(color_evidence.coverage, 5) if color_evidence else None,
      "explicitColorTerm": explicit_color_term,
      "matchPolicy": "partial_palette_any_v1" if category == "shadow" else "single_color_v1",
      "maxColorDistance": max_delta_e if color_evidence else None,
      "observedPaletteHexes": list(color_evidence.observed_palette_hexes) if color_evidence else [],
      "matchedTargetHexes": [match.target_hex for match in verified_matches] if color_evidence else [],
      "matchedColorHexes": [match.observed_hex for match in verified_matches] if color_evidence else [],
      "colorDistances": [round(match.delta_e, 4) for match in verified_matches] if color_evidence else [],
      "matchedColorCount": len(verified_matches) if color_evidence else 0,
      "targetColorCount": len(target_colors) if color_evidence else 0,
    },
    "_ruleScore": float(match_rate),
  }


async def _discover_category(
  client: httpx.AsyncClient,
  settings: Settings,
  *,
  category: str,
  target: Mapping[str, Any],
  per_category_limit: int,
  semaphore: asyncio.Semaphore,
  captured_at: datetime,
) -> list[dict[str, Any]]:
  queries = build_report_product_queries(category, target)
  if not queries:
    return []
  responses = await asyncio.gather(*(
    client.get(
      NAVER_SHOPPING_API_URL,
      headers={
        "X-Naver-Client-Id": settings.naver_shopping_client_id or "",
        "X-Naver-Client-Secret": settings.naver_shopping_client_secret or "",
      },
      params={
        "display": settings.makeup_report_product_discovery_candidates_per_category,
        "exclude": "used:rental:cbshop",
        "query": query,
        "sort": "sim",
        "start": 1,
      },
    )
    for query in queries
  ))
  items: list[dict[str, Any]] = []
  seen_raw: set[str] = set()
  for response in responses:
    response.raise_for_status()
    payload = response.json()
    raw_items = payload.get("items") if isinstance(payload, dict) else None
    for item in raw_items or []:
      if not isinstance(item, dict):
        continue
      identity = _clean_text(item.get("productId"), 100) or _clean_text(item.get("link"), 500)
      if not identity or identity in seen_raw:
        continue
      seen_raw.add(identity)
      items.append(item)
  mapped = await asyncio.gather(*(
    _map_naver_candidate(
      client,
      settings,
      item,
      category=category,
      target=target,
      captured_at=captured_at,
      semaphore=semaphore,
    )
    for item in items
  ), return_exceptions=True)
  candidates = dedupe_lowest_price_product_offers(
    item for item in mapped if isinstance(item, dict)
  )
  candidates.sort(
    key=lambda item: (
      -float(item.get("matchRate") or 0),
      float(item.get("colorDistance")) if item.get("colorDistance") is not None else math.inf,
      str(item.get("productId") or ""),
    ),
  )
  deduped: list[dict[str, Any]] = []
  seen: set[str] = set()
  for item in candidates:
    product_id = str(item.get("productId") or "")
    if not product_id or product_id in seen:
      continue
    seen.add(product_id)
    deduped.append(item)
  return deduped[:per_category_limit]


async def discover_report_products(
  settings: Settings,
  *,
  targets_by_category: Mapping[str, Mapping[str, Any]],
  per_category_limit: int,
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, Any]]:
  """Return real, evidence-gated candidates and non-fallback execution metadata."""

  configured = bool(settings.naver_shopping_client_id and settings.naver_shopping_client_secret)
  categories = list(targets_by_category)
  empty = {category: [] for category in categories}
  meta = {
    "contractVersion": DISCOVERY_CONTRACT_VERSION,
    "provider": "naver_shopping",
    "configured": configured,
    "applied": False,
    "queriedCategories": categories,
    "verifiedItems": 0,
    "error": None,
  }
  if not settings.makeup_report_product_discovery_enabled or not configured or not categories:
    return empty, meta

  captured_at = datetime.now(timezone.utc)
  semaphore = asyncio.Semaphore(MAX_CONCURRENT_IMAGE_REQUESTS)
  try:
    timeout = httpx.Timeout(settings.makeup_report_product_discovery_timeout_seconds)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
      results = await asyncio.wait_for(
        asyncio.gather(*(
          _discover_category(
            client,
            settings,
            category=category,
            target=target,
            per_category_limit=per_category_limit,
            semaphore=semaphore,
            captured_at=captured_at,
          )
          for category, target in targets_by_category.items()
        ), return_exceptions=True),
        timeout=settings.makeup_report_product_discovery_timeout_seconds,
      )
  except TimeoutError:
    return empty, {**meta, "error": "timeout"}
  except (httpx.HTTPError, ValueError):
    return empty, {**meta, "error": "provider_unavailable"}

  output: dict[str, list[dict[str, Any]]] = {}
  errors = 0
  for category, result in zip(categories, results):
    if isinstance(result, Exception):
      output[category] = []
      errors += 1
    else:
      output[category] = result
  verified_items = sum(len(items) for items in output.values())
  return output, {
    **meta,
    "applied": verified_items > 0,
    "verifiedItems": verified_items,
    "error": "partial_provider_failure" if errors else None,
  }


def is_verified_report_discovery_item(item: Mapping[str, Any]) -> bool:
  """Fail closed when replaying persisted external items from a snapshot."""

  if item.get("externalSource") != DISCOVERY_SOURCE:
    return False
  if item.get("recommendationBasis") not in {
    "verifiedListingImageColor",
    "verifiedListingImagePalettePartial",
    "verifiedLiveProductFamily",
  }:
    return False
  verification = item.get("verification")
  if not isinstance(verification, Mapping):
    return False
  image_url = _safe_naver_result_url(item.get("imageUrl"))
  image_host = (urlparse(image_url or "").hostname or "").casefold()
  if (
    not str(item.get("productId") or "").startswith("naver-")
    or verification.get("contractVersion") != DISCOVERY_CONTRACT_VERSION
    or verification.get("provider") != "naver_shopping"
    or verification.get("evidenceType") not in {IMAGE_EVIDENCE_TYPE, BASE_EVIDENCE_TYPE}
    or not image_url
    or not (image_host == "pstatic.net" or image_host.endswith(".pstatic.net"))
    or not _safe_naver_result_url(item.get("purchaseUrl"))
  ):
    return False
  try:
    confidence = float(verification.get("evidenceConfidence"))
    match_rate = float(item.get("matchRate"))
    captured_at = datetime.fromisoformat(str(verification.get("capturedAt") or "").replace("Z", "+00:00"))
    price = item.get("price") if isinstance(item.get("price"), Mapping) else {}
    price_amount = int(price.get("amount"))
  except (TypeError, ValueError):
    return False
  if (
    captured_at.tzinfo is None
    or price_amount <= 0
    or not (0.60 <= confidence <= 1.0 and 0 <= match_rate <= 100)
  ):
    return False
  if verification.get("evidenceType") == IMAGE_EVIDENCE_TYPE:
    try:
      color_distance = float(verification.get("colorDistance"))
      normalize_hex_color(str(verification.get("observedColorHex") or ""))
      normalize_hex_color(str(verification.get("reportTargetHex") or ""))
    except (TypeError, ValueError):
      return False
    if not math.isfinite(color_distance) or color_distance < 0:
      return False
    if item.get("recommendationBasis") == "verifiedListingImagePalettePartial":
      try:
        matched_count = int(verification.get("matchedColorCount"))
        target_count = int(verification.get("targetColorCount"))
        matched_targets = list(verification.get("matchedTargetHexes") or [])
        matched_colors = list(verification.get("matchedColorHexes") or [])
        distances = [float(value) for value in verification.get("colorDistances") or []]
        max_distance = float(verification.get("maxColorDistance"))
        for color_hex in [*matched_targets, *matched_colors]:
          normalize_hex_color(str(color_hex))
      except (TypeError, ValueError):
        return False
      if (
        verification.get("matchPolicy") != "partial_palette_any_v1"
        or matched_count < 1
        or target_count < matched_count
        or len(matched_targets) != matched_count
        or len(matched_colors) != matched_count
        or len(distances) != matched_count
        or any(not math.isfinite(value) or value < 0 or value > max_distance for value in distances)
      ):
        return False
  return True
