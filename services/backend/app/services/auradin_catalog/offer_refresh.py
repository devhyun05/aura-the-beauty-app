from __future__ import annotations

import copy
import hashlib
import json
import re
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from app.services.auradin_agent.knowledge_chunk_builder import price_tier_for
from app.services.auradin_agent.ranking import normalized_product_key

from .brand_aliases import BRAND_ALIASES, normalize_brand


NAVER_SHOPPING_API_URL = "https://openapi.naver.com/v1/search/shop.json"
_HTML_B_TAG = re.compile(r"</?b>", flags=re.IGNORECASE)
_TOKEN = re.compile(r"[0-9a-z]+|[가-힣]+", flags=re.IGNORECASE)


@dataclass(frozen=True)
class OfferMatchResult:
  status: str
  matched_offer: dict[str, Any] | None
  match_level: str
  score: float
  runner_up_score: float
  query: str = ""
  fetched_at: str = ""
  results_sha: str = ""

  def __post_init__(self) -> None:
    if self.status not in {"matched", "no_match", "ambiguous"}:
      raise ValueError(f"unsupported offer match status: {self.status}")


def _clean(value: object) -> str:
  return str(value or "").strip()


def _clean_title(value: object) -> str:
  return re.sub(r"\s+", " ", _HTML_B_TAG.sub("", _clean(value))).strip()


def _canonical_json_sha(value: object) -> str:
  payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
  return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def build_offer_query(seed_row: dict[str, Any]) -> str:
  return re.sub(
    r"\s+",
    " ",
    f"{_clean(seed_row.get('brandName'))} {_clean(seed_row.get('productName'))}",
  ).strip()[:90]


def _brand_aliases(brand: str) -> tuple[str, ...]:
  canonical = normalize_brand(brand) or brand
  for known_brand, aliases in BRAND_ALIASES.items():
    if known_brand.casefold() == canonical.casefold():
      return tuple({known_brand, *aliases})
  return (brand,) if brand else ()


def _without_brand_tokens(text: str, brand: str) -> str:
  cleaned = text
  for alias in sorted(_brand_aliases(brand), key=len, reverse=True):
    if alias:
      cleaned = re.sub(re.escape(alias), " ", cleaned, flags=re.IGNORECASE)
  return re.sub(r"\s+", " ", cleaned).strip()


def _tokens(text: str) -> set[str]:
  return {token.casefold() for token in _TOKEN.findall(text) if token}


def _offer_brand_matches(seed_row: dict[str, Any], offer: dict[str, Any]) -> bool:
  seed_brand = _clean(seed_row.get("brandName"))
  seed_canonical = normalize_brand(seed_brand)
  offer_brand = _clean(offer.get("brand")) or _clean(offer.get("maker"))
  searchable = offer_brand or _clean_title(offer.get("title"))
  offer_canonical = normalize_brand(searchable)

  if seed_canonical:
    return offer_canonical == seed_canonical

  compact_seed = re.sub(r"[^0-9a-z가-힣]+", "", seed_brand.casefold())
  compact_offer = re.sub(r"[^0-9a-z가-힣]+", "", searchable.casefold())
  return bool(compact_seed and compact_seed in compact_offer)


def score_offer_against_seed(seed_row: dict[str, Any], offer: dict[str, Any]) -> float:
  """Score title identity using the seed field contract, excluding brand tokens."""
  seed_brand = _clean(seed_row.get("brandName"))
  seed_product = _clean(seed_row.get("productName"))
  offer_title = _clean_title(offer.get("title"))
  if not seed_product or not offer_title:
    return 0.0

  seed_key = normalized_product_key({"brandName": seed_brand, "productName": seed_product})
  offer_key = normalized_product_key({"brandName": seed_brand, "productName": offer_title})
  if seed_key and seed_key == offer_key:
    return 1.0

  seed_tokens = _tokens(_without_brand_tokens(seed_product, seed_brand))
  offer_tokens = _tokens(_without_brand_tokens(offer_title, seed_brand))
  if not seed_tokens:
    return 0.0
  return len(seed_tokens & offer_tokens) / len(seed_tokens)


def extract_variant_signature(title: str) -> dict[str, str | int | bool]:
  cleaned = _clean_title(title).casefold()
  volume_match = re.search(r"(?<![0-9.])(\d+(?:\.\d+)?)\s*(ml|g|kg)(?![a-z])", cleaned)
  volume = f"{volume_match.group(1)}{volume_match.group(2)}" if volume_match else ""

  count = 1
  plus_match = re.search(r"\b(\d+)\s*\+\s*(\d+)\b", cleaned)
  count_match = re.search(r"(?<!\d)(\d+)\s*(?:개입|개|입|매|팩|pack|ea|p)\b", cleaned)
  times_match = re.search(r"(?:\b[x×]\s*(\d+)\b|\b(\d+)\s*[x×]\b)", cleaned)
  if plus_match:
    count = int(plus_match.group(1)) + int(plus_match.group(2))
  elif count_match:
    count = int(count_match.group(1))
  elif times_match:
    count = int(times_match.group(1) or times_match.group(2))

  return {
    "volume": volume,
    "count": count,
    "isRefill": bool(re.search(r"리필|refill", cleaned)),
    "isMini": bool(re.search(r"미니|mini|샘플|sample", cleaned)),
    "isSet": bool(re.search(r"세트|기획|set|\d+\s*\+\s*\d+", cleaned)),
  }


def match_offer_for_seed(
  seed_row: dict[str, Any],
  offers: list[dict[str, Any]],
  *,
  margin: float = 0.15,
  min_score: float = 0.5,
) -> OfferMatchResult:
  source_id = _clean(seed_row.get("sourceCandidateId"))
  listing_id = source_id.removeprefix("naver-")
  if listing_id:
    for offer in offers:
      if _clean(offer.get("productId")) == listing_id:
        return OfferMatchResult("matched", offer, "listing_id", 1.0, 0.0)

  if not offers:
    return OfferMatchResult("no_match", None, "", 0.0, 0.0)

  scored = sorted(
    ((score_offer_against_seed(seed_row, offer), index, offer) for index, offer in enumerate(offers)),
    key=lambda row: (-row[0], row[1]),
  )
  best_score, _, best_offer = scored[0]
  runner_up_score = scored[1][0] if len(scored) > 1 else 0.0
  brand_matches = _offer_brand_matches(seed_row, best_offer)
  variant_matches = extract_variant_signature(_clean(seed_row.get("productName"))) == extract_variant_signature(
    _clean_title(best_offer.get("title")),
  )

  if best_score < min_score or not brand_matches or not variant_matches:
    return OfferMatchResult("no_match", None, "", best_score, runner_up_score)
  if best_score - runner_up_score < margin:
    return OfferMatchResult("ambiguous", best_offer, "title_variant", best_score, runner_up_score)
  return OfferMatchResult("matched", best_offer, "title_variant", best_score, runner_up_score)


def fetch_offers_with_retry(
  query: str,
  *,
  client_id: str,
  client_secret: str,
  max_attempts: int = 3,
  backoff_base: float = 2.0,
  delay_seconds: float = 1.0,
) -> list[dict[str, Any]] | None:
  if max_attempts < 1:
    raise ValueError("max_attempts must be at least 1")

  params = urllib.parse.urlencode(
    {"display": 100, "exclude": "used:rental:cbshop", "query": query, "sort": "sim", "start": 1},
  )
  request = urllib.request.Request(
    f"{NAVER_SHOPPING_API_URL}?{params}",
    headers={
      "X-Naver-Client-Id": client_id,
      "X-Naver-Client-Secret": client_secret,
      "User-Agent": "auradin-offer-refresh/1.0",
    },
  )

  for attempt in range(max_attempts):
    if delay_seconds > 0:
      time.sleep(delay_seconds)
    try:
      with urllib.request.urlopen(request, timeout=10.0) as response:
        payload = json.loads(response.read().decode("utf-8"))
      items = payload.get("items")
      return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []
    except Exception:  # noqa: BLE001 - the caller distinguishes exhausted fetches from empty results.
      if attempt + 1 >= max_attempts:
        return None
      if backoff_base > 0:
        time.sleep(backoff_base * (2**attempt))
  return None


def _offer_price(offer: dict[str, Any]) -> int:
  live_offer = offer.get("liveOffer") if isinstance(offer.get("liveOffer"), dict) else {}
  value = offer.get("lprice", live_offer.get("priceKrw"))
  try:
    return int(value or 0)
  except (TypeError, ValueError):
    return 0


def _offer_url(offer: dict[str, Any], naver_key: str, live_key: str) -> str:
  live_offer = offer.get("liveOffer") if isinstance(offer.get("liveOffer"), dict) else {}
  return _clean(offer.get(naver_key) or live_offer.get(live_key))


def _url_identity(value: object) -> tuple[str, str]:
  raw = _clean(value)
  if not raw:
    return "", ""
  parsed = urllib.parse.urlsplit(raw if "://" in raw else f"//{raw}")
  return parsed.netloc.casefold(), parsed.path or "/"


def compute_offer_diff(old_row: dict[str, Any], new_offer: dict[str, Any]) -> dict[str, float | bool]:
  old_offer = old_row.get("liveOffer") if isinstance(old_row.get("liveOffer"), dict) else {}
  old_price = int(old_offer.get("priceKrw") or 0)
  new_price = _offer_price(new_offer)
  price_delta_pct = ((new_price - old_price) / old_price * 100.0) if old_price else 0.0
  old_tier = _clean(old_offer.get("priceTier")) or price_tier_for(old_price)
  return {
    "priceDeltaPct": price_delta_pct,
    "priceTierChanged": old_tier != price_tier_for(new_price),
    "linkChanged": _url_identity(old_offer.get("purchaseUrl"))
    != _url_identity(_offer_url(new_offer, "link", "purchaseUrl")),
    "imageChanged": _clean(old_offer.get("imageUrl")) != _offer_url(new_offer, "image", "imageUrl"),
  }


def _decision_for(review_decisions: dict[str, Any], catalog_item_id: str) -> str:
  value = review_decisions.get(catalog_item_id)
  if isinstance(value, dict):
    value = value.get("decision")
  return _clean(value)


def _review_row(
  row: dict[str, Any],
  result: OfferMatchResult,
  *,
  reason: str,
) -> dict[str, Any]:
  old_offer = row.get("liveOffer") if isinstance(row.get("liveOffer"), dict) else {}
  new_offer = result.matched_offer or {}
  new_price = _offer_price(new_offer)
  old_price = int(old_offer.get("priceKrw") or 0)
  delta = ((new_price - old_price) / old_price * 100.0) if old_price and new_price else 0.0
  return {
    "catalogItemId": _clean(row.get("catalogItemId") or row.get("id")),
    "brand": _clean(row.get("brandName")),
    "productName": _clean(row.get("productName")),
    "reason": reason,
    "matchLevel": result.match_level,
    "matchScore": result.score,
    "runnerUpScore": result.runner_up_score,
    "prevPriceKrw": old_price,
    "newPriceKrw": new_price,
    "deltaPct": delta,
    "prevUrl": _clean(old_offer.get("purchaseUrl")),
    "newUrl": _offer_url(new_offer, "link", "purchaseUrl"),
  }


def _apply_matched_offer(
  old_row: dict[str, Any],
  result: OfferMatchResult,
  *,
  run_ts: str,
) -> dict[str, Any]:
  offer = result.matched_offer
  if not isinstance(offer, dict):
    raise ValueError("matched result must carry matched_offer")
  new_price = _offer_price(offer)
  if new_price <= 0:
    raise ValueError("matched offer must have a positive price")
  product_id = _clean(offer.get("productId"))
  if not product_id:
    raise ValueError("matched offer must have productId")
  results_sha = _clean(result.results_sha) or _canonical_json_sha(offer)
  if re.fullmatch(r"[0-9a-f]{64}", results_sha) is None:
    raise ValueError("matched offer results_sha must be a lowercase SHA-256 hex digest")

  next_row = copy.deepcopy(old_row)
  next_live_offer = next_row.get("liveOffer")
  if not isinstance(next_live_offer, dict):
    next_live_offer = {}
    next_row["liveOffer"] = next_live_offer
  next_live_offer["priceKrw"] = new_price
  next_live_offer["priceTier"] = price_tier_for(new_price)
  next_live_offer["purchaseUrl"] = _offer_url(offer, "link", "purchaseUrl")
  next_live_offer["imageUrl"] = _offer_url(offer, "image", "imageUrl")
  next_row["updatedAt"] = run_ts
  next_row["offerRefreshEvidence"] = {
    "productId": product_id,
    "query": _clean(result.query) or build_offer_query(old_row),
    "fetchedAt": _clean(result.fetched_at) or run_ts,
    "matchLevel": result.match_level,
    "matchScore": result.score,
    "resultsSha": results_sha,
  }
  return next_row


def apply_refresh_to_seed(
  seed_rows: list[dict[str, Any]],
  results: dict[str, OfferMatchResult | None],
  *,
  run_ts: str,
  stale_state: dict[str, Any],
  review_decisions: dict[str, Any],
  price_gate_pct: float = 60.0,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
  next_rows: list[dict[str, Any]] = []
  review_queue: list[dict[str, Any]] = []
  next_state = copy.deepcopy(stale_state)

  for old_row in seed_rows:
    catalog_item_id = _clean(old_row.get("catalogItemId") or old_row.get("id"))
    result = results.get(catalog_item_id)
    decision = _decision_for(review_decisions, catalog_item_id)

    if decision not in {"", "accept_new", "keep_old", "mark_stale"}:
      raise ValueError(f"unsupported review decision for {catalog_item_id}: {decision}")
    if result is None:
      next_rows.append(copy.deepcopy(old_row))
      continue

    if result.status == "no_match":
      previous = next_state.get(catalog_item_id)
      previous_count = int(previous.get("consecutiveNoMatch") or 0) if isinstance(previous, dict) else 0
      next_state[catalog_item_id] = {
        "consecutiveNoMatch": previous_count + 1,
        "lastCheckedAt": run_ts,
      }
      if decision == "mark_stale":
        next_row = copy.deepcopy(old_row)
        next_row["collectionStatus"] = "stale"
        next_rows.append(next_row)
      elif decision == "keep_old":
        next_state[catalog_item_id] = {"consecutiveNoMatch": 0, "lastCheckedAt": run_ts}
        next_rows.append(copy.deepcopy(old_row))
      elif decision == "accept_new":
        raise ValueError(f"accept_new requires a matched offer for {catalog_item_id}")
      else:
        next_rows.append(copy.deepcopy(old_row))
        if previous_count + 1 >= 2:
          review_queue.append(_review_row(old_row, result, reason="possible_stale"))
      continue

    next_state[catalog_item_id] = {"consecutiveNoMatch": 0, "lastCheckedAt": run_ts}
    if decision == "mark_stale":
      raise ValueError(f"mark_stale requires a no_match result for {catalog_item_id}")
    offer = result.matched_offer or {}
    diff = compute_offer_diff(old_row, offer)
    reason = "ambiguous" if result.status == "ambiguous" else "price_jump"
    requires_review = result.status == "ambiguous" or abs(float(diff["priceDeltaPct"])) >= price_gate_pct

    if requires_review and decision != "accept_new":
      next_rows.append(copy.deepcopy(old_row))
      if decision != "keep_old":
        review_queue.append(_review_row(old_row, result, reason=reason))
      continue

    if decision == "keep_old":
      next_rows.append(copy.deepcopy(old_row))
      continue
    next_rows.append(_apply_matched_offer(old_row, result, run_ts=run_ts))

  return next_rows, review_queue, next_state
