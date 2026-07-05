from __future__ import annotations

import argparse
import csv
import html
import json
import os
import random
import re
import sys
import time
import urllib.parse
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
  sys.path.insert(0, str(SCRIPT_DIR))

from collect_auradin_official_metadata import (  # noqa: E402
  FINISH_RULES,
  INTENSITY_RULES,
  REPO_ROOT,
  SELLING_POINT_RULES,
  SUITABLE_FOR_RULES,
  TEXTURE_RULES,
  _aggregate_from_options,
  _collect_tags,
  _extract_meta_content,
  _fetch_text,
  _field_payload,
  _infer_by_rules,
  _merge_shade_options,
  _plausible_structured_option,
  _shade_payload_from_name,
  _short,
  _squash,
  _tokens,
)
from collect_auradin_naver_offer_metadata import (  # noqa: E402
  _fetch_naver_offers,
  _load_local_env,
  _match_score,
)


COLLECTOR_VERSION = "auradin-oliveyoung-metadata-v1"
DEFAULT_NAVER_OFFER_METADATA_PATH = (
  REPO_ROOT / "data" / "auradin" / "detail" / "retail_expanded" / "naver_offer_metadata_20260703.jsonl"
)
DEFAULT_MANUAL_VERIFIED_METADATA_PATH = (
  REPO_ROOT / "data" / "auradin" / "detail" / "retail_expanded" / "manual_verified_metadata_20260703.jsonl"
)
DEFAULT_PRIOR_OLIVEYOUNG_METADATA_PATH = (
  REPO_ROOT / "data" / "auradin" / "detail" / "retail_expanded" / "oliveyoung_metadata_20260703.jsonl"
)
DEFAULT_DISCOVERY_METADATA_PATHS = (
  DEFAULT_NAVER_OFFER_METADATA_PATH,
  DEFAULT_MANUAL_VERIFIED_METADATA_PATH,
  DEFAULT_PRIOR_OLIVEYOUNG_METADATA_PATH,
)
HIGH_VALUE_CATEGORIES = {"cheek", "lip", "shadow"}
SECURITY_CHALLENGE_MARKERS = (
  "access denied",
  "forbidden",
  "captcha",
  "cloudflare",
  "enable javascript and cookies",
  "보안문자",
  "비정상적인 접근",
  "자동화된 접근",
  "접근이 제한",
  "서비스 이용이 제한",
  "잠시만 기다려 주세요",
  "접속 정보를 확인",
  "403 forbidden",
)
UTC = timezone.utc


def _default_run_date() -> str:
  return (datetime.now(tz=UTC) + timedelta(hours=9)).strftime("%Y%m%d")


def _default_fetched_at(run_date: str) -> str:
  return f"{run_date[:4]}-{run_date[4:6]}-{run_date[6:8]}T00:00:00+09:00"


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
  rows: list[dict[str, Any]] = []

  for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
    stripped = line.strip()

    if not stripped:
      continue

    row = json.loads(stripped)

    if not isinstance(row, dict):
      raise ValueError(f"Expected JSON object at {path}:{line_number}")

    rows.append(row)

  return rows


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(
    "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
    encoding="utf-8",
  )


def _display_path(path: Path) -> str:
  try:
    return str(path.resolve().relative_to(REPO_ROOT))
  except ValueError:
    return str(path)


def _extract_goods_no(url: str) -> str:
  parsed = urllib.parse.urlparse(str(url or ""))
  query = urllib.parse.parse_qs(parsed.query)

  for key in ("goodsNo", "goodsno", "sndVal", "sndval"):
    for value in query.get(key, []):
      match = re.search(r"A\d{12,}", value)

      if match:
        return match.group(0)

  match = re.search(r"A\d{12,}", str(url or ""))
  return match.group(0) if match else ""


def _oliveyoung_url(goods_no: str) -> str:
  return f"https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={goods_no}"


def _is_oliveyoung_domain_or_mall(*values: Any) -> bool:
  combined = " ".join(str(value or "") for value in values).lower()
  return "oliveyoung" in combined or "올리브영" in combined


def _read_discovery_metadata(paths: list[Path]) -> dict[str, list[dict[str, Any]]]:
  rows_by_id: dict[str, list[dict[str, Any]]] = defaultdict(list)

  for path in paths:
    if not path.exists():
      continue

    for row in _read_jsonl(path):
      candidate_id = str(row.get("candidateId") or "")

      if candidate_id:
        rows_by_id[candidate_id].append(row)

  return rows_by_id


def _query_for_row(row: dict[str, Any]) -> str:
  brand = str(row.get("brand") or "")
  product_name = _squash(row.get("productName"))
  product_name = re.sub(r"\([^)]*(?:점|백화점|신세계|롯데|현대|증정|무료배송)[^)]*\)", " ", product_name)
  product_name = re.sub(r"\[[^]]*(?:점|백화점|신세계|롯데|현대|증정|무료배송)[^]]*\]", " ", product_name)
  product_name = re.sub(r"^\([^)]*\)\s*", "", product_name)
  product_name = re.sub(r"^\[[^]]*\]\s*", "", product_name)
  product_name = product_name.replace("이런 상품 어때요?", "")
  product_name = re.sub(r"\[(?:NEW|단독|컬러출시|기획|증정)[^]]*\]", " ", product_name, flags=re.I)
  product_name = re.sub(r"\b(?:본품|리필|증정|기획|단독|택1|세트|무료배송)\b", " ", product_name, flags=re.I)
  product_name = re.sub(r"\s+\d+\s*개(?:\s+\d+(?:\.\d+)?\s*(?:g|ml))?\s*$", " ", product_name, flags=re.I)
  product_name = re.sub(r"\s+\d+(?:\.\d+)?\s*(?:g|ml)\s*$", " ", product_name, flags=re.I)

  for alias in _brand_aliases(row):
    product_name = re.sub(rf"^(?:{re.escape(alias)})\s+", " ", product_name, flags=re.I)

  return _squash(f"{brand} {product_name} 올리브영")[:100]


def _discovery_payload(
  *,
  goods_no: str,
  source_url: str,
  discovery_source: str,
  match_score: float,
  raw_text: str,
  mall_name: str = "",
  product_id: Any = None,
) -> dict[str, Any]:
  return {
    "discoverySource": discovery_source,
    "goodsNo": goods_no,
    "mallName": mall_name,
    "matchScore": round(float(match_score or 0), 2),
    "productId": product_id,
    "rawText": _short(raw_text, 220),
    "sourceUrl": source_url,
  }


def _candidate_priority(row: dict[str, Any]) -> tuple[int, int, str, str, str]:
  fields = row.get("fields") if isinstance(row.get("fields"), dict) else {}
  missing_core = sum(
    1
    for field in ("shadeOptions", "colorFamily", "undertone", "finish", "texture")
    if not ((fields.get(field) or {}).get("value"))
  )
  olive_unknown = (fields.get("oliveYoungListed") or {}).get("status") != "collected"
  high_value = str(row.get("category") or "") in HIGH_VALUE_CATEGORIES
  return (
    -int(olive_unknown),
    -int(high_value),
    -missing_core,
    str(row.get("brand") or ""),
    str(row.get("productName") or ""),
  )


def _append_discovery(
  discoveries: list[dict[str, Any]],
  seen: set[tuple[str, str]],
  discovery: dict[str, Any],
) -> None:
  source_url = str(discovery.get("sourceUrl") or "")
  goods_no = str(discovery.get("goodsNo") or "")
  key = (goods_no, source_url)

  if not source_url or key in seen:
    return

  seen.add(key)
  discoveries.append(discovery)


def _discover_from_purchase_url(row: dict[str, Any]) -> list[dict[str, Any]]:
  fields = row.get("fields") if isinstance(row.get("fields"), dict) else {}
  purchase_url = str((fields.get("purchaseUrl") or {}).get("value") or "")
  goods_no = _extract_goods_no(purchase_url)

  if not goods_no:
    return []

  return [
    _discovery_payload(
      goods_no=goods_no,
      source_url=_oliveyoung_url(goods_no),
      discovery_source="purchase_url_goods_no",
      match_score=1.0,
      raw_text=purchase_url,
      mall_name="올리브영",
    ),
  ]


def _offer_to_discovery(row: dict[str, Any], offer: dict[str, Any], source_type: str) -> dict[str, Any] | None:
  mall_name = _squash(offer.get("mallName"))
  link = str(offer.get("link") or "")
  domain = urllib.parse.urlparse(link).netloc.lower()

  if not _is_oliveyoung_domain_or_mall(mall_name, domain, link):
    return None

  score = _match_score(row, offer)
  goods_no = _extract_goods_no(link)
  title = _squash(offer.get("title"))
  source_url = _oliveyoung_url(goods_no) if goods_no else link

  return _discovery_payload(
    goods_no=goods_no,
    source_url=source_url,
    discovery_source=source_type,
    match_score=score,
    raw_text=f"mallName={mall_name}; title={title}; link={link}; matchScore={score}",
    mall_name=mall_name,
    product_id=offer.get("productId"),
  )


def _discover_from_naver_offer_metadata(row: dict[str, Any], metadata: dict[str, Any] | None) -> list[dict[str, Any]]:
  if not metadata:
    return []

  discoveries: list[dict[str, Any]] = []
  seen: set[tuple[str, str]] = set()

  for list_name in ("matchedPositiveOffers", "matchedOffers"):
    offers = metadata.get(list_name)

    if not isinstance(offers, list):
      continue

    for offer in offers:
      if not isinstance(offer, dict):
        continue

      discovery = _offer_to_discovery(row, offer, f"naver_offer_metadata_{list_name}")

      if discovery:
        _append_discovery(discoveries, seen, discovery)

  field_payload = ((metadata.get("fields") or {}).get("oliveYoungListed") or {}) if isinstance(metadata.get("fields"), dict) else {}
  source_url = str(field_payload.get("sourceUrl") or "")
  goods_no = _extract_goods_no(source_url)

  if goods_no:
    _append_discovery(
      discoveries,
      seen,
      _discovery_payload(
        goods_no=goods_no,
        source_url=_oliveyoung_url(goods_no),
        discovery_source="naver_offer_metadata_field",
        match_score=0.72,
        raw_text=field_payload.get("rawText") or source_url,
        mall_name="올리브영",
      ),
    )

  metadata_source = str(metadata.get("parserVersion") or metadata.get("collectorVersion") or "metadata")
  discovery_source = "metadata_retail_source_url"

  if "manual" in metadata_source:
    discovery_source = "manual_verified_retail_source_url"
  elif "oliveyoung" in metadata_source:
    discovery_source = "prior_oliveyoung_metadata"
  elif "naver" in metadata_source:
    discovery_source = "naver_offer_metadata_retail_source_url"

  for key in ("retailSourceUrl", "oliveYoungSourceUrl", "sourceUrl"):
    source_url = str(metadata.get(key) or "")
    goods_no = _extract_goods_no(source_url)

    if not goods_no or not _is_oliveyoung_domain_or_mall(source_url):
      continue

    match_score = float(metadata.get("matchScore") or 0.74)

    if discovery_source == "prior_oliveyoung_metadata":
      match_score = max(match_score, 0.86)

    _append_discovery(
      discoveries,
      seen,
      _discovery_payload(
        goods_no=goods_no,
        source_url=_oliveyoung_url(goods_no),
        discovery_source=discovery_source,
        match_score=match_score,
        raw_text=f"{key}={source_url}; metadataSource={metadata_source}",
        mall_name="올리브영",
      ),
    )

  return discoveries


def _metadata_has_oliveyoung_goods(metadata_rows: list[dict[str, Any]]) -> bool:
  for metadata in metadata_rows:
    text = json.dumps(metadata, ensure_ascii=False)

    if re.search(r"A\d{12,}", text) and _is_oliveyoung_domain_or_mall(text):
      return True

  return False


def _discover_from_naver_search(
  row: dict[str, Any],
  *,
  client_id: str,
  client_secret: str,
  display: int,
  timeout_seconds: float,
) -> tuple[list[dict[str, Any]], str]:
  query = _query_for_row(row)
  offers = _fetch_naver_offers(
    client_id=client_id,
    client_secret=client_secret,
    query=query,
    display=display,
    timeout_seconds=timeout_seconds,
  )
  discoveries: list[dict[str, Any]] = []
  seen: set[tuple[str, str]] = set()

  for offer in offers:
    if not isinstance(offer, dict):
      continue

    discovery = _offer_to_discovery(row, offer, "naver_shopping_search")

    if discovery:
      _append_discovery(discoveries, seen, discovery)

  return discoveries, query


def _best_discovery(discoveries: list[dict[str, Any]]) -> dict[str, Any] | None:
  if not discoveries:
    return None

  return max(
    discoveries,
    key=lambda item: (
      int(bool(item.get("goodsNo"))),
      float(item.get("matchScore") or 0),
      int(str(item.get("discoverySource") or "").startswith("purchase_url")),
    ),
  )


def _decode_js_string(value: str) -> str:
  try:
    return str(json.loads(f'"{value}"'))
  except json.JSONDecodeError:
    return html.unescape(value.replace(r"\/", "/").replace(r"\"", '"'))


def _extract_escaped_values(page_text: str, key: str) -> list[str]:
  patterns = (
    rf'\\"{re.escape(key)}\\":\\"((?:\\\\.|[^"\\])*)\\"',
    rf'"{re.escape(key)}":"((?:\\.|[^"\\])*)"',
  )
  values: list[str] = []
  seen: set[str] = set()

  for pattern in patterns:
    for raw_value in re.findall(pattern, page_text):
      value = _squash(_decode_js_string(raw_value))

      if value and value not in seen:
        seen.add(value)
        values.append(value)

  return values


def _extract_oliveyoung_options(
  *,
  page_text: str,
  product_name: str,
  brand_aliases: tuple[str, ...],
) -> list[dict[str, Any]]:
  product_tokens = _tokens(product_name, brand_aliases)
  options: list[dict[str, Any]] = []

  for option_name in _extract_escaped_values(page_text, "optionName"):
    if not _plausible_structured_option(option_name, product_tokens, brand_aliases):
      continue

    options.append(
      _shade_payload_from_name(
        option_name,
        source_type="oliveyoung_product_option_json",
        confidence=0.82,
      ),
    )

  return _merge_shade_options(options)


def _brand_aliases(row: dict[str, Any]) -> tuple[str, ...]:
  brand = str(row.get("brand") or "")
  aliases = {brand, brand.lower()}

  if brand == "3CE":
    aliases.update({"3ce", "stylenanda"})
  elif brand == "정샘물 뷰티":
    aliases.update({"정샘물", "jsm", "jungsaemmool"})
  elif brand == "투쿨포스쿨":
    aliases.update({"too cool for school", "toocoolforschool"})
  elif brand == "하트퍼센트":
    aliases.update({"heartpercent", "heart percent"})

  return tuple(alias for alias in aliases if alias)


def _is_security_challenge_page(page_text: str) -> bool:
  lowered = _squash(page_text).lower()
  return any(marker in lowered for marker in SECURITY_CHALLENGE_MARKERS)


class BrowserRenderer:
  def __init__(
    self,
    *,
    enabled: bool,
    headless: bool,
    page_settle_ms: int,
    timeout_seconds: float,
    user_agent: str,
    user_data_dir: Path | None,
  ) -> None:
    self.enabled = enabled
    self.headless = headless
    self.page_settle_ms = page_settle_ms
    self.timeout_seconds = timeout_seconds
    self.user_agent = user_agent
    self.user_data_dir = user_data_dir
    self._playwright: Any = None
    self._browser: Any = None
    self._context: Any = None
    self.unavailable_reason = ""

  def __enter__(self) -> "BrowserRenderer":
    if not self.enabled:
      return self

    try:
      from playwright.sync_api import sync_playwright  # type: ignore
    except Exception as exc:  # noqa: BLE001 - dependency availability is reported in collector output.
      self.unavailable_reason = f"{type(exc).__name__}: {exc}"
      self.enabled = False
      return self

    try:
      self._playwright = sync_playwright().start()

      if self.user_data_dir:
        self.user_data_dir.mkdir(parents=True, exist_ok=True)
        self._context = self._playwright.chromium.launch_persistent_context(
          str(self.user_data_dir),
          headless=self.headless,
          locale="ko-KR",
          user_agent=self.user_agent,
          viewport={"height": 900, "width": 1365},
        )
      else:
        self._browser = self._playwright.chromium.launch(headless=self.headless)
        self._context = self._browser.new_context(
          locale="ko-KR",
          user_agent=self.user_agent,
          viewport={"height": 900, "width": 1365},
        )
    except Exception as exc:  # noqa: BLE001
      self.unavailable_reason = f"{type(exc).__name__}: {exc}"
      self.enabled = False
      self.close()

    return self

  def __exit__(self, *_args: Any) -> None:
    self.close()

  def close(self) -> None:
    for item in (self._context, self._browser):
      try:
        if item:
          item.close()
      except Exception:  # noqa: BLE001 - cleanup best effort only.
        pass

    try:
      if self._playwright:
        self._playwright.stop()
    except Exception:  # noqa: BLE001
      pass

    self._context = None
    self._browser = None
    self._playwright = None

  def fetch(self, url: str) -> tuple[str, dict[str, Any]]:
    if not self.enabled or not self._context:
      return "", {
        "contentLength": 0,
        "error": self.unavailable_reason or "browser_unavailable",
        "httpStatus": None,
        "urlEffective": url,
      }

    page = self._context.new_page()
    page.set_default_timeout(int(self.timeout_seconds * 1000))

    try:
      response = page.goto(url, wait_until="domcontentloaded", timeout=int(self.timeout_seconds * 1000))
      page.wait_for_timeout(self.page_settle_ms)
      content = page.content()
      http_status = response.status if response else None
      effective_url = page.url

      if http_status in {401, 403, 429}:
        return "", {
          "contentLength": len(content),
          "error": f"http_status:{http_status}",
          "httpStatus": http_status,
          "urlEffective": effective_url,
        }

      if _is_security_challenge_page(content):
        return "", {
          "contentLength": len(content),
          "error": "security_challenge",
          "httpStatus": http_status,
          "urlEffective": effective_url,
        }

      return content, {
        "contentLength": len(content),
        "httpStatus": http_status,
        "urlEffective": effective_url,
      }
    except Exception as exc:  # noqa: BLE001
      return "", {
        "contentLength": 0,
        "error": f"{type(exc).__name__}: {exc}",
        "httpStatus": None,
        "urlEffective": url,
      }
    finally:
      page.close()


def _parse_oliveyoung_page(
  row: dict[str, Any],
  *,
  page_text: str,
  source_url: str,
  goods_no: str,
  fetched_at: str,
  discovery: dict[str, Any] | None = None,
  fetch_method: str = "http",
) -> dict[str, Any]:
  meta = _extract_meta_content(page_text, ("og:title", "og:description", "description"))
  title = meta.get("og:title") or meta.get("title") or str(row.get("productName") or "")
  option_names = _extract_escaped_values(page_text, "optionName")
  short_name_values = _extract_escaped_values(page_text, "shortName")
  category_values = (
    _extract_escaped_values(page_text, "middleCategoryName")
    + _extract_escaped_values(page_text, "lowerCategoryName")
    + _extract_escaped_values(page_text, "leafCategoryName")
  )
  evidence_text = _squash(" ".join([title, *short_name_values[:2], *category_values[:4], *option_names[:12]]))
  shade_options = _extract_oliveyoung_options(
    page_text=page_text,
    product_name=f"{title} {row.get('productName') or ''}",
    brand_aliases=_brand_aliases(row),
  )
  fields: dict[str, Any] = {
    "oliveYoungListed": _oliveyoung_listed_payload(
      goods_no=goods_no,
      source_url=source_url,
      discovery=discovery,
      title=title,
      source_type="oliveyoung_public_product_page",
    ),
  }

  if shade_options:
    fields["shadeOptions"] = _field_payload(
      shade_options,
      0.82,
      ", ".join(str(option.get("optionName") or "") for option in shade_options[:16]),
      source_url,
      source_type="oliveyoung_product_option_json",
    )
    color_family, color_confidence = _aggregate_from_options(shade_options, "colorFamily")

    if color_family:
      fields["colorFamily"] = _field_payload(
        color_family,
        color_confidence,
        ", ".join(str(option.get("optionName") or "") for option in shade_options[:16]),
        source_url,
        source_type="oliveyoung_product_option_json",
      )

    undertone, undertone_confidence = _aggregate_from_options(shade_options, "undertone")

    if undertone:
      fields["undertone"] = _field_payload(
        undertone,
        undertone_confidence,
        ", ".join(str(option.get("optionName") or "") for option in shade_options[:16]),
        source_url,
        source_type="oliveyoung_product_option_json",
      )

  for field, rules, confidence in (
    ("finish", FINISH_RULES, 0.68),
    ("texture", TEXTURE_RULES, 0.68),
    ("intensity", INTENSITY_RULES, 0.6),
  ):
    value = _infer_by_rules(evidence_text, rules)

    if value:
      fields[field] = _field_payload(
        value,
        confidence,
        evidence_text,
        source_url,
        source_type="oliveyoung_product_page_text",
      )

  selling_points = _collect_tags(evidence_text, SELLING_POINT_RULES)

  if selling_points:
    fields["sellingPoints"] = _field_payload(
      selling_points,
      0.66,
      evidence_text,
      source_url,
      source_type="oliveyoung_product_page_text",
    )

  suitable_for = _collect_tags(evidence_text, SUITABLE_FOR_RULES)

  if suitable_for:
    fields["suitableFor"] = _field_payload(
      suitable_for,
      0.66,
      evidence_text,
      source_url,
      source_type="oliveyoung_product_page_text",
    )

  return {
    "brand": row.get("brand"),
    "candidateId": row.get("candidateId"),
    "category": row.get("category"),
    "collectionStatus": "collected_partial" if fields else "not_found",
    "collectorVersion": COLLECTOR_VERSION,
    "fetchedAt": fetched_at,
    "fields": fields,
    "fetchMethod": fetch_method,
    "goodsNo": goods_no,
    "matchScore": (discovery or {}).get("matchScore"),
    "oliveYoungProductName": title,
    "oliveYoungSourceUrl": source_url,
    "productName": row.get("productName"),
    "rawStored": False,
  }


def _oliveyoung_listed_payload(
  *,
  goods_no: str,
  source_url: str,
  discovery: dict[str, Any] | None,
  title: str = "",
  source_type: str = "oliveyoung_goods_no_discovery",
) -> dict[str, Any]:
  match_score = float((discovery or {}).get("matchScore") or 0)
  confidence = 0.88 if match_score >= 0.95 else max(0.66, min(0.84, 0.55 + match_score * 0.3))
  raw_text = _squash(
    f"goodsNo={goods_no}; title={_short(title, 120)}; "
    f"discoverySource={(discovery or {}).get('discoverySource')}; matchScore={match_score}",
  )
  return _field_payload(
    True,
    confidence,
    raw_text,
    source_url,
    source_type=source_type,
  )


def _write_targets_csv(path: Path, targets: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)

  fieldnames = [
    "candidateId",
    "brand",
    "category",
    "rankInBrandCategory",
    "productName",
    "query",
    "selectedDiscoverySource",
    "selectedGoodsNo",
    "selectedMatchScore",
    "selectedSourceUrl",
    "candidateDiscoveryCount",
    "currentOliveYoungStatus",
    "missingCoreFields",
  ]

  with path.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(targets)


def collect_oliveyoung_metadata(
  *,
  limited_results_path: Path,
  output_path: Path,
  report_path: Path,
  targets_output_path: Path,
  discovery_metadata_paths: list[Path],
  max_rows: int,
  min_match_score: float,
  naver_display: int,
  naver_delay_seconds: float,
  timeout_seconds: float,
  delay_seconds: float,
  delay_jitter_seconds: float,
  block_backoff_seconds: float,
  block_backoff_jitter_seconds: float,
  max_block_backoff_seconds: float,
  browser_fallback: bool,
  browser_headless: bool,
  browser_only: bool,
  browser_page_settle_ms: int,
  browser_timeout_seconds: float,
  browser_user_data_dir: Path | None,
  progress_interval: int,
  stop_on_block_streak: int,
  user_agent: str,
  fetched_at: str,
  merge_existing: bool,
  skip_existing_with_fields: bool,
) -> dict[str, Any]:
  _load_local_env()
  rows = _read_jsonl(limited_results_path)
  discovery_by_id = _read_discovery_metadata(discovery_metadata_paths)
  client_id = os.environ.get("NAVER_SHOPPING_CLIENT_ID") or os.environ.get("NAVER_CLIENT_ID")
  client_secret = os.environ.get("NAVER_SHOPPING_CLIENT_SECRET") or os.environ.get("NAVER_CLIENT_SECRET")
  candidates: list[dict[str, Any]] = []
  existing_with_fields: set[str] = set()

  if skip_existing_with_fields and output_path.exists():
    existing_with_fields = {
      str(row.get("candidateId") or "")
      for row in _read_jsonl(output_path)
      if isinstance(row.get("fields"), dict) and row.get("fields")
    }

  for row in sorted(
    rows,
    key=lambda item: (
      -int(_metadata_has_oliveyoung_goods(discovery_by_id.get(str(item.get("candidateId") or ""), []))),
      *_candidate_priority(item),
    ),
  ):
    candidate_id = str(row.get("candidateId") or "")

    if candidate_id in existing_with_fields:
      continue

    candidates.append(row)

  candidates = candidates[:max_rows] if max_rows > 0 else candidates
  outputs: list[dict[str, Any]] = []
  fetch_counts: Counter[str] = Counter()
  discovery_counts: Counter[str] = Counter()
  selected_discovery_counts: Counter[str] = Counter()
  last_fetch_at = 0.0
  last_naver_search_at = 0.0
  target_rows: list[dict[str, Any]] = []
  consecutive_detail_blocks = 0
  last_block_backoff_seconds = 0.0
  stop_reason = ""

  def emit_progress(index: int) -> None:
    if progress_interval <= 0 or index % progress_interval != 0:
      return

    print(
      json.dumps(
        {
          "processed": index,
          "consecutiveDetailBlocks": consecutive_detail_blocks,
          "lastBlockBackoffSeconds": round(last_block_backoff_seconds, 2),
          "statuses": dict(Counter(str(item.get("collectionStatus")) for item in outputs)),
          "total": len(candidates),
          "withFields": sum(1 for item in outputs if item.get("fields")),
        },
        ensure_ascii=False,
        sort_keys=True,
      ),
      file=sys.stderr,
      flush=True,
    )

  with BrowserRenderer(
    enabled=browser_fallback or browser_only,
    headless=browser_headless,
    page_settle_ms=browser_page_settle_ms,
    timeout_seconds=browser_timeout_seconds,
    user_agent=user_agent,
    user_data_dir=browser_user_data_dir,
  ) as browser:
    for index, row in enumerate(candidates, start=1):
      candidate_id = str(row.get("candidateId") or "")
      query = _query_for_row(row)
      discoveries: list[dict[str, Any]] = []
      seen_discoveries: set[tuple[str, str]] = set()

      for discovery in _discover_from_purchase_url(row):
        _append_discovery(discoveries, seen_discoveries, discovery)

      for metadata in discovery_by_id.get(candidate_id, []):
        for discovery in _discover_from_naver_offer_metadata(row, metadata):
          _append_discovery(discoveries, seen_discoveries, discovery)

      naver_search_error = ""
      local_selected = _best_discovery(discoveries)
      should_search_naver = not (local_selected and local_selected.get("goodsNo"))

      if should_search_naver and client_id and client_secret:
        try:
          elapsed = time.monotonic() - last_naver_search_at

          if elapsed < naver_delay_seconds:
            time.sleep(naver_delay_seconds - elapsed)

          search_discoveries, query = _discover_from_naver_search(
            row,
            client_id=client_id,
            client_secret=client_secret,
            display=naver_display,
            timeout_seconds=timeout_seconds,
          )

          for discovery in search_discoveries:
            _append_discovery(discoveries, seen_discoveries, discovery)

          last_naver_search_at = time.monotonic()
        except Exception as exc:  # noqa: BLE001
          naver_search_error = f"{type(exc).__name__}: {_short(exc)}"
          fetch_counts[f"naver_search_{type(exc).__name__}"] += 1

          if "429" in naver_search_error:
            time.sleep(max(2.0, naver_delay_seconds * 3))
      elif should_search_naver:
        naver_search_error = "missing_naver_credentials"
      else:
        naver_search_error = "skipped_existing_local_goods_no"

      for discovery in discoveries:
        discovery_counts[str(discovery.get("discoverySource") or "unknown")] += 1

      selected = _best_discovery(discoveries)
      fields = row.get("fields") if isinstance(row.get("fields"), dict) else {}
      missing_core = [
        field
        for field in ("shadeOptions", "colorFamily", "undertone", "finish", "texture")
        if not ((fields.get(field) or {}).get("value"))
      ]
      target_rows.append(
        {
          "candidateId": candidate_id,
          "brand": row.get("brand"),
          "category": row.get("category"),
          "rankInBrandCategory": row.get("rankInBrandCategory"),
          "productName": row.get("productName"),
          "query": query,
          "selectedDiscoverySource": (selected or {}).get("discoverySource") or "",
          "selectedGoodsNo": (selected or {}).get("goodsNo") or "",
          "selectedMatchScore": (selected or {}).get("matchScore") or "",
          "selectedSourceUrl": (selected or {}).get("sourceUrl") or "",
          "candidateDiscoveryCount": len(discoveries),
          "currentOliveYoungStatus": ((fields.get("oliveYoungListed") or {}).get("status") or ""),
          "missingCoreFields": ",".join(missing_core),
        },
      )

      if not selected:
        outputs.append(
          {
            "brand": row.get("brand"),
            "candidateId": candidate_id,
            "category": row.get("category"),
            "collectionStatus": "not_found",
            "collectorVersion": COLLECTOR_VERSION,
            "discoveryCandidates": discoveries[:8],
            "failureReason": naver_search_error or "no_oliveyoung_goods_no",
            "fields": {},
            "fetchedAt": fetched_at,
            "productName": row.get("productName"),
            "query": query,
            "rawStored": False,
          },
        )
        emit_progress(index)
        continue

      selected_discovery_counts[str(selected.get("discoverySource") or "unknown")] += 1
      goods_no = str(selected.get("goodsNo") or "")
      source_url = str(selected.get("sourceUrl") or "")
      match_score = float(selected.get("matchScore") or 0)

      if not goods_no:
        outputs.append(
          {
            "brand": row.get("brand"),
            "candidateId": candidate_id,
            "category": row.get("category"),
            "collectionStatus": "not_found",
            "collectorVersion": COLLECTOR_VERSION,
            "discoveryCandidates": discoveries[:8],
            "failureReason": "no_goods_no",
            "fields": {},
            "fetchedAt": fetched_at,
            "oliveYoungSourceUrl": source_url,
            "productName": row.get("productName"),
            "query": query,
            "rawStored": False,
          },
        )
        emit_progress(index)
        continue

      if match_score < min_match_score:
        outputs.append(
          {
            "brand": row.get("brand"),
            "candidateId": candidate_id,
            "category": row.get("category"),
            "collectionStatus": "low_match_score",
            "collectorVersion": COLLECTOR_VERSION,
            "discoveryCandidates": discoveries[:8],
            "failureReason": f"match_score_below_{min_match_score}",
            "fields": {},
            "fetchedAt": fetched_at,
            "goodsNo": goods_no,
            "matchScore": match_score,
            "oliveYoungSourceUrl": source_url,
            "productName": row.get("productName"),
            "query": query,
            "rawStored": False,
          },
        )
        emit_progress(index)
        continue

      target_delay_seconds = delay_seconds

      if delay_jitter_seconds > 0:
        target_delay_seconds += random.uniform(0, delay_jitter_seconds)

      elapsed = time.monotonic() - last_fetch_at

      if elapsed < target_delay_seconds:
        time.sleep(target_delay_seconds - elapsed)

      if browser_only:
        page_text = ""
        fetch_summary = {
          "contentLength": 0,
          "error": "skipped_browser_only",
          "httpStatus": None,
          "urlEffective": source_url,
        }
        fetch_counts["http_skipped_browser_only"] += 1
        fetch_method = "browser"
      else:
        page_text, fetch_summary = _fetch_text(
          source_url,
          timeout_seconds=timeout_seconds,
          user_agent=user_agent,
        )
        http_status = fetch_summary.get("httpStatus")
        fetch_counts[f"http_{http_status or fetch_summary.get('error') or 'unknown'}"] += 1
        fetch_method = "http"

      last_fetch_at = time.monotonic()

      if page_text and _is_security_challenge_page(page_text):
        page_text = ""
        fetch_summary = {**fetch_summary, "error": "security_challenge"}
        fetch_counts["http_security_challenge"] += 1

      browser_fetch_summary: dict[str, Any] | None = None

      if not page_text and (browser_fallback or browser_only):
        page_text, browser_fetch_summary = browser.fetch(source_url)
        fetch_method = "browser"
        fetch_counts[f"browser_{browser_fetch_summary.get('httpStatus') or browser_fetch_summary.get('error') or 'unknown'}"] += 1

      if not page_text:
        failure_reason = (
          str((browser_fetch_summary or {}).get("error") or "")
          or str(fetch_summary.get("error") or "")
          or "empty_page"
        )
        fields = {
          "oliveYoungListed": _oliveyoung_listed_payload(
            goods_no=goods_no,
            source_url=source_url,
            discovery=selected,
            source_type=f"oliveyoung_goods_no_discovery:{selected.get('discoverySource') or 'unknown'}",
          ),
        }
        block_backoff_sleep_seconds = 0.0
        next_consecutive_detail_blocks = consecutive_detail_blocks + 1

        if block_backoff_seconds > 0:
          block_backoff_sleep_seconds = block_backoff_seconds * next_consecutive_detail_blocks

          if max_block_backoff_seconds > 0:
            block_backoff_sleep_seconds = min(block_backoff_sleep_seconds, max_block_backoff_seconds)

          if block_backoff_jitter_seconds > 0:
            block_backoff_sleep_seconds += random.uniform(0, block_backoff_jitter_seconds)

        outputs.append(
          {
            "brand": row.get("brand"),
            "blockBackoffSleepSeconds": round(block_backoff_sleep_seconds, 2),
            "candidateId": candidate_id,
            "category": row.get("category"),
            "collectionStatus": "blocked",
            "collectorVersion": COLLECTOR_VERSION,
            "discoveryCandidates": discoveries[:8],
            "failureReason": failure_reason,
            "fetchSummary": fetch_summary,
            "browserFetchSummary": browser_fetch_summary,
            "fields": fields,
            "fetchedAt": fetched_at,
            "goodsNo": goods_no,
            "matchScore": match_score,
            "oliveYoungSourceUrl": source_url,
            "productName": row.get("productName"),
            "query": query,
            "rawStored": False,
          },
        )
        consecutive_detail_blocks = next_consecutive_detail_blocks
        last_block_backoff_seconds = block_backoff_sleep_seconds
        emit_progress(index)

        if stop_on_block_streak > 0 and consecutive_detail_blocks >= stop_on_block_streak:
          stop_reason = f"stop_on_block_streak:{consecutive_detail_blocks}"
          break

        if block_backoff_sleep_seconds > 0:
          fetch_counts["block_backoff_applied"] += 1
          time.sleep(block_backoff_sleep_seconds)

        continue

      consecutive_detail_blocks = 0
      last_block_backoff_seconds = 0.0
      parsed = _parse_oliveyoung_page(
        row,
        page_text=page_text,
        source_url=source_url,
        goods_no=goods_no,
        fetched_at=fetched_at,
        discovery=selected,
        fetch_method=fetch_method,
      )
      parsed["browserFetchSummary"] = browser_fetch_summary
      parsed["discoveryCandidates"] = discoveries[:8]
      parsed["fetchSummary"] = fetch_summary
      parsed["query"] = query
      outputs.append(parsed)
      emit_progress(index)

  if merge_existing and output_path.exists():
    refreshed_ids = {str(row.get("candidateId") or "") for row in outputs}
    preserved = [
      row
      for row in _read_jsonl(output_path)
      if str(row.get("candidateId") or "") not in refreshed_ids
    ]
    outputs = preserved + outputs

  outputs = sorted(
    outputs,
    key=lambda row: (str(row.get("brand") or ""), str(row.get("category") or ""), str(row.get("productName") or "")),
  )
  _write_targets_csv(targets_output_path, target_rows)
  _write_jsonl(output_path, outputs)
  _write_report(
    report_path,
    output_path,
    targets_output_path,
    discovery_metadata_paths,
    outputs,
    candidates,
    fetch_counts,
    discovery_counts,
    selected_discovery_counts,
    browser_unavailable_reason=browser.unavailable_reason,
    stop_reason=stop_reason,
  )

  return {
    "candidateRows": len(candidates),
    "output": _display_path(output_path),
    "report": _display_path(report_path),
    "rows": len(outputs),
    "targetsOutput": _display_path(targets_output_path),
    "stopReason": stop_reason,
    "withFields": sum(1 for row in outputs if row.get("fields")),
  }


def _write_report(
  report_path: Path,
  output_path: Path,
  targets_output_path: Path,
  discovery_metadata_paths: list[Path],
  rows: list[dict[str, Any]],
  candidates: list[dict[str, Any]],
  fetch_counts: Counter[str],
  discovery_counts: Counter[str],
  selected_discovery_counts: Counter[str],
  *,
  browser_unavailable_reason: str,
  stop_reason: str,
) -> None:
  report_path.parent.mkdir(parents=True, exist_ok=True)
  status_counts = Counter(str(row.get("collectionStatus")) for row in rows)
  field_counts = Counter(field for row in rows for field in (row.get("fields") or {}))
  detail_field_rows = sum(
    1
    for row in rows
    if any(field != "oliveYoungListed" for field in (row.get("fields") or {}))
  )
  brand_counts = Counter(str(row.get("brand") or "") for row in rows)
  lines = [
    "# Auradin OliveYoung Metadata Collection",
    "",
    f"- Output: `{output_path}`",
    f"- Target queue: `{targets_output_path}`",
    f"- Discovery metadata inputs: `{', '.join(_display_path(path) for path in discovery_metadata_paths)}`",
    f"- Candidate rows attempted this run: {len(candidates)}",
    f"- Rows: {len(rows)}",
    f"- Rows with fields: {sum(1 for row in rows if row.get('fields'))}",
    f"- Rows with non-presence detail fields: {detail_field_rows}",
    f"- Collection status: `{json.dumps(dict(sorted(status_counts.items())), ensure_ascii=False)}`",
    f"- Fetch status: `{json.dumps(dict(sorted(fetch_counts.items())), ensure_ascii=False)}`",
    f"- Discovery candidates by source: `{json.dumps(dict(sorted(discovery_counts.items())), ensure_ascii=False)}`",
    f"- Selected discovery by source: `{json.dumps(dict(sorted(selected_discovery_counts.items())), ensure_ascii=False)}`",
    f"- Browser fallback unavailable reason: `{browser_unavailable_reason or ''}`",
    f"- Stop reason: `{stop_reason}`",
    f"- Field counts: `{json.dumps(dict(sorted(field_counts.items())), ensure_ascii=False)}`",
    "",
    "## Brand Rows",
    "",
    "| Brand | Rows |",
    "|---|---:|",
  ]

  for brand, count in sorted(brand_counts.items()):
    lines.append(f"| {brand} | {count} |")

  lines.extend(
    [
      "",
      "## Notes",
      "",
      "- Product-level OliveYoung presence is confirmed only when a `goodsNo` or OliveYoung URL is matched from purchase URLs, Naver offer metadata, or Naver Shopping search.",
      "- Detail collection uses public OliveYoung product detail pages via normal HTTP fetch, then ordinary browser rendering when enabled.",
      "- Login, captcha, security challenge, 403, 429, and blocked pages are recorded as `blocked`; no bypass flow is implemented.",
      "- Raw HTML, review text, ingredient text, images, colorHex/colorLab, and manufacturing country are not stored or collected in this OliveYoung-focused output.",
      "- `oliveYoungListed=false` is not emitted; absence of product-level evidence remains unknown rather than a negative listing claim.",
    ],
  )
  report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Collect limited Auradin metadata from public OliveYoung product pages.")
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument("--limited-results", type=Path)
  parser.add_argument("--output", type=Path)
  parser.add_argument("--report", type=Path)
  parser.add_argument("--targets-output", type=Path)
  parser.add_argument("--naver-offer-metadata", type=Path)
  parser.add_argument(
    "--discovery-metadata",
    action="append",
    default=[],
    type=Path,
    help="Additional local metadata JSONL file to use for OliveYoung goodsNo discovery.",
  )
  parser.add_argument("--max-rows", type=int, default=80)
  parser.add_argument("--min-match-score", type=float, default=0.5)
  parser.add_argument("--naver-display", type=int, default=20)
  parser.add_argument("--naver-delay-seconds", type=float, default=0.8)
  parser.add_argument("--timeout-seconds", type=float, default=20.0)
  parser.add_argument("--delay-seconds", type=float, default=2.0)
  parser.add_argument(
    "--delay-jitter-seconds",
    type=float,
    default=0.0,
    help="Add up to this many random seconds to each product-detail delay.",
  )
  parser.add_argument(
    "--block-backoff-seconds",
    type=float,
    default=0.0,
    help="After each blocked product-detail fetch, sleep this many seconds times the consecutive block count.",
  )
  parser.add_argument(
    "--block-backoff-jitter-seconds",
    type=float,
    default=0.0,
    help="Add up to this many random seconds to each block backoff sleep.",
  )
  parser.add_argument(
    "--max-block-backoff-seconds",
    type=float,
    default=0.0,
    help="Cap block backoff sleep at this many seconds; 0 means no cap.",
  )
  parser.add_argument("--browser-fallback", action="store_true")
  parser.add_argument(
    "--browser-headful",
    action="store_true",
    help="Launch a visible Chromium window instead of headless mode.",
  )
  parser.add_argument(
    "--browser-only",
    action="store_true",
    help="Skip raw HTTP detail fetches and open product detail pages only through the browser renderer.",
  )
  parser.add_argument("--browser-page-settle-ms", type=int, default=1500)
  parser.add_argument("--browser-timeout-seconds", type=float, default=20.0)
  parser.add_argument(
    "--browser-user-data-dir",
    type=Path,
    help="Use a dedicated clean Playwright profile directory for browser session continuity.",
  )
  parser.add_argument("--progress-interval", type=int, default=50)
  parser.add_argument(
    "--stop-on-block-streak",
    type=int,
    default=0,
    help="Stop the run after this many consecutive blocked detail-page browser fetches.",
  )
  parser.add_argument(
    "--user-agent",
    default="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  )
  parser.add_argument("--merge-existing", action="store_true")
  parser.add_argument("--skip-existing-with-fields", action="store_true")
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  limited_results_path = args.limited_results or REPO_ROOT / "data" / "auradin" / "detail" / "normalized" / f"limited_detail_results_{args.date}.jsonl"
  output_path = args.output or REPO_ROOT / "data" / "auradin" / "detail" / "retail_expanded" / f"oliveyoung_metadata_{args.date}.jsonl"
  report_path = args.report or REPO_ROOT / "reports" / "auradin" / f"oliveyoung_metadata_collection_{args.date}.md"
  targets_output_path = args.targets_output or REPO_ROOT / "data" / "auradin" / "detail" / "targets" / f"oliveyoung_focus_targets_{args.date}.csv"
  discovery_metadata_paths = list(DEFAULT_DISCOVERY_METADATA_PATHS)

  for discovery_metadata_path in args.discovery_metadata:
    if discovery_metadata_path not in discovery_metadata_paths:
      discovery_metadata_paths.append(discovery_metadata_path)

  if args.naver_offer_metadata:
    discovery_metadata_paths = [
      args.naver_offer_metadata if path == DEFAULT_NAVER_OFFER_METADATA_PATH else path
      for path in discovery_metadata_paths
    ]

    if args.naver_offer_metadata not in discovery_metadata_paths:
      discovery_metadata_paths.insert(0, args.naver_offer_metadata)

  result = collect_oliveyoung_metadata(
    limited_results_path=limited_results_path,
    output_path=output_path,
    report_path=report_path,
    targets_output_path=targets_output_path,
    discovery_metadata_paths=discovery_metadata_paths,
    max_rows=args.max_rows,
    min_match_score=args.min_match_score,
    naver_display=args.naver_display,
    naver_delay_seconds=args.naver_delay_seconds,
    timeout_seconds=args.timeout_seconds,
    delay_seconds=args.delay_seconds,
    delay_jitter_seconds=args.delay_jitter_seconds,
    block_backoff_seconds=args.block_backoff_seconds,
    block_backoff_jitter_seconds=args.block_backoff_jitter_seconds,
    max_block_backoff_seconds=args.max_block_backoff_seconds,
    browser_fallback=args.browser_fallback,
    browser_headless=not args.browser_headful,
    browser_only=args.browser_only,
    browser_page_settle_ms=args.browser_page_settle_ms,
    browser_timeout_seconds=args.browser_timeout_seconds,
    browser_user_data_dir=args.browser_user_data_dir,
    progress_interval=args.progress_interval,
    stop_on_block_streak=args.stop_on_block_streak,
    user_agent=args.user_agent,
    fetched_at=_default_fetched_at(args.date),
    merge_existing=args.merge_existing,
    skip_existing_with_fields=args.skip_existing_with_fields,
  )
  print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
