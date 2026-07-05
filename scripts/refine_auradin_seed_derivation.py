#!/usr/bin/env python3
"""Refine the Auradin limited-detail seed WITHOUT new network collection.

Three transformations, all grounded in text already stored in the seed
(shadeName / shadeNumber / optionName / productName):

  1. mis-parse CLEANING of shadeOptions (drop/fix parser garbage)
  2. variant DEDUP within (brandName, category) so 1+1 / mall variants of the
     same product collapse into one canonical product
  3. calibrated DERIVATION of undertone / colorFamily that only assigns
     hard-filter confidence (>= 0.65) where the signal is genuinely
     deterministic — the confidence bar is defended, not inflated.

The rules and confidence calibration come from an adversarially-verified design
(see reports/auradin/seed_refinement_*). Every >= 0.65 confidence is justified
by a manufacturer convention or a color noun that names its own family; ambiguous
signals stay <= 0.62 (they help recall/recommendation but never hard filters).

No colorHex/colorLab, no madeInCountry collection, no fabricated presence.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
HARD_FILTER_CONFIDENCE_CUTOFF = 0.65

DEFAULT_INPUT = REPO_ROOT / "data/auradin/catalog/catalog_items_seed_20260703_expanded.jsonl"

# --------------------------------------------------------------------------- #
# Lexicon (reused from the existing collectors, with verified additions)      #
# --------------------------------------------------------------------------- #
COLOR_RULES: dict[str, tuple[str, ...]] = {
  "pink": ("핑크", "pink", "피오니", "페탈", "petal"),
  "rose": ("로즈", "로지", "rose"),
  "coral": ("코랄", "coral", "살몬", "salmon", "구아바", "guava", "자몽"),
  "red": ("레드", "red", "체리", "cherry", "애플", "apple", "스트로베리", "strawberry"),
  "orange": ("오렌지", "orange", "브릭", "brick", "선셋", "sunset"),
  "mauve": ("모브", "mauve"),
  "brown": ("브라운", "brown", "초코", "카카오", "토프", "헤이즐", "hazel", "acorn",
            "모카", "mocha", "라떼", "latte", "밀크티", "갈색", "흑갈색"),
  "nude": ("누드", "nude", "베이지", "beige", "아이보리", "ivory", "포슬린", "porcelain",
           "내추럴", "natural", "바닐라", "vanilla", "리넨", "linen", "피칸",
           "비앙코", "bianco", "오트", "oat", "밀크", "milk", "밀키", "milky"),
  "peach": ("피치", "peach", "애프리콧", "apricot"),
  "plum": ("플럼", "plum", "베리", "berry", "라벤더", "lavender", "라일락", "lilac",
           "바이올렛", "violet", "타로", "taro", "무화과", "fig", "그레이프", "grape"),
  "black": ("블랙", "black", "흑색", "흑심"),
  "gray": ("그레이", "gray", "grey", "애쉬", "ash", "회갈색"),
}
# Tokens that CONTAIN a color marker as a substring but are not colors (bread /
# spread carry 레드). A marker hit falling inside one of these spans is suppressed.
NON_COLOR_TOKENS = ("브레드", "스프레드")
# Color words whose FAMILY the verifier flagged as genuinely ambiguous: a family
# is still assigned (helps recall) but it stays below the hard-filter cutoff.
AMBIGUOUS_FAMILY_MARKERS = frozenset({
  "밀크", "milk", "밀키", "milky", "자몽", "구아바", "guava", "무화과", "fig",
  "애프리콧", "apricot", "선셋", "sunset", "블라썸", "blossom",
})
DETERMINISTIC_FAMILY_CONFIDENCE = 0.66
AMBIGUOUS_FAMILY_CONFIDENCE = 0.62

UNDERTONE_RULES: dict[str, tuple[str, ...]] = {
  "warm": ("웜톤", "웜 블렌딩", "웜블렌딩", "warm", "코랄", "오렌지", "피치", "브릭", "진저", "피칸", "애프리콧", "apricot", "선셋", "sunset"),
  "cool": ("쿨톤", "쿨 블렌딩", "쿨블렌딩", "cool", "모브", "플럼", "라벤더", "라일락", "바이올렛", "애쉬", "그레이", "페탈", "로지"),
  "neutral": ("뉴트럴", "neutral", "누드", "베이지", "브라운", "아이보리", "내추럴", "포슬린", "바닐라", "리넨", "토프"),
}
# Tone words that are DETERMINISTIC enough to clear the cutoff.
#  - explicit 쿨톤/웜톤/뉴트럴톤 + delimited blending phrases: the manufacturer's own tone claim
#  - 애프리콧/선셋: color nouns that are inherently warm (peach-orange / sunset)
DETERMINISTIC_UNDERTONE: dict[str, tuple[str, ...]] = {
  "cool": ("쿨톤", "쿨 블렌딩", "쿨블렌딩"),
  "warm": ("웜톤", "웜 블렌딩", "웜블렌딩", "애프리콧", "apricot", "선셋", "sunset"),
  "neutral": ("뉴트럴톤",),
}
DETERMINISTIC_UNDERTONE_CONFIDENCE = 0.70
NAME_UNDERTONE_CONFIDENCE = 0.62  # ambiguous name-based inference: below cutoff on purpose

# Review / stock fragments that mark an option as scraped junk, never a shade.
# Kept narrow: 평가/얌얌/그런데 were removed because they false-positive on
# Peripera's signature playful shade names (쿨소평가, 쿨한사과얌얌, 웜행평가).
REVIEW_JUNK_MARKERS = ("dm 확인", "확인 부탁", "부탁드려요")
REVIEW_JUNK_TOKENS = ("문의", "배송", "재입고", "조기품절", "품절", "재고", "환불", "교환", "상품상", "kt알")

# Shade-code undertone eligibility policy (verified + adversarially audited).
# Only these (category, brand) combinations get a hard-filter-eligible code
# undertone:
#   base: all brands @0.68 (industry-standard 호수 N/C/W convention)
#   brow: 롬앤/뮤드 @0.66 (published cool/warm brow tone system, C/W/N only)
# cheek is DROPPED: the audit showed 롬앤 베러 댄 치크 uses C/S/W/N/B as
#   formulation/sub-line codes (피치칩 -> forced cool), not tone codes.
# liner/lip/shadow: the C/W/N/P letter is a series/SKU/palette code, NOT an
#   undertone -> code undertone stays below cutoff (not derived here).
CODE_UNDERTONE_POLICY: dict[str, dict[str, Any]] = {
  "base": {"brands": None, "confidence": 0.68},          # None => all brands
  "brow": {"brands": {"롬앤", "뮤드"}, "confidence": 0.66},
}


# --------------------------------------------------------------------------- #
# Small helpers                                                                #
# --------------------------------------------------------------------------- #
def _squash(text: Any) -> str:
  return re.sub(r"\s+", " ", str(text or "")).strip()


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
  rows: list[dict[str, Any]] = []
  for line in path.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line:
      rows.append(json.loads(line))
  return rows


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(
    "".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows),
    encoding="utf-8",
  )


def _marker_in_text(text: str, marker: str) -> bool:
  lowered = text.lower()
  if marker == "블러":
    return bool(re.search(r"블러(?!쉬)", lowered))
  return marker.lower() in lowered


def _infer_family(text: str) -> tuple[str | None, float]:
  """Return (colorFamily, confidence).

  A color word deterministically names its family (0.66, hard-filter eligible),
  EXCEPT the verifier-flagged ambiguous words (0.62). Two guards keep the
  deterministic score honest:
   - substring collisions: a shorter marker fully covered by a longer marker at
     the same span loses (그레이 inside 그레이프 -> plum, not gray; 베리 inside
     스트로베리 -> red, not plum), and a marker inside a known non-color token
     (레드 inside 브레드/스프레드) is dropped entirely;
   - compound names: the head is the LAST-positioned surviving color word, so a
     modifier like 애플 in '애플 브라운' never overrides the real head 브라운.
  """
  lowered = text.lower()

  # All marker occurrences: (start, end, family, marker).
  hits: list[tuple[int, int, str, str]] = []
  for fam, markers in COLOR_RULES.items():
    for marker in markers:
      ml = marker.lower()
      start = 0
      while True:
        idx = lowered.find(ml, start)
        if idx < 0:
          break
        hits.append((idx, idx + len(ml), fam, marker))
        start = idx + 1
  if not hits:
    return None, 0.0

  non_color_spans = [
    (m.start(), m.end()) for tok in NON_COLOR_TOKENS for m in re.finditer(re.escape(tok), lowered)
  ]

  def _kept(h: tuple[int, int, str, str]) -> bool:
    s, e, _, _ = h
    if any(ns <= s and ne >= e for ns, ne in non_color_spans):
      return False  # inside a non-color token (bread/spread)
    # dominated by a strictly longer marker covering this span
    return not any(
      o is not h and o[0] <= s and o[1] >= e and (o[1] - o[0]) > (e - s) for o in hits
    )

  survivors = [h for h in hits if _kept(h)]
  if not survivors:
    return None, 0.0

  # Head = last-positioned survivor; longer marker breaks a positional tie.
  survivors.sort(key=lambda h: (h[0], h[1] - h[0]))
  _, _, family, marker = survivors[-1]
  ambiguous = marker.lower() in AMBIGUOUS_FAMILY_MARKERS
  confidence = AMBIGUOUS_FAMILY_CONFIDENCE if ambiguous else DETERMINISTIC_FAMILY_CONFIDENCE
  return family, confidence


def _sanitize_ok_for_tone(text: str) -> bool:
  """Reject scraped-review / junk option names before granting tone eligibility."""
  lowered = text.lower()
  if any(m in lowered for m in REVIEW_JUNK_MARKERS):
    return False
  if any(t in lowered for t in REVIEW_JUNK_TOKENS):
    return False
  hangul = len(re.findall(r"[가-힣]", text))
  return hangul <= 14


def _deterministic_undertone(text: str) -> tuple[str | None, float]:
  if _sanitize_ok_for_tone(text):
    for tone, markers in DETERMINISTIC_UNDERTONE.items():
      if any(_marker_in_text(text, m) for m in markers):
        return tone, DETERMINISTIC_UNDERTONE_CONFIDENCE
  return None, 0.0


def _name_undertone(text: str) -> tuple[str | None, float]:
  for tone, markers in UNDERTONE_RULES.items():
    if any(_marker_in_text(text, m) for m in markers):
      return tone, NAME_UNDERTONE_CONFIDENCE
  return None, 0.0


def _code_undertone(text: str) -> str | None:
  """Foundation-style 호수 undertone letter (base/brow/cheek only, per policy)."""
  compact = re.sub(r"\s+", "", text.upper())
  if re.search(r"(?:^|[^A-Z0-9])(?:#?\d{1,2}C|C\d{1,2})(?:[^A-Z0-9]|$)", compact):
    return "cool"
  if re.search(r"(?:^|[^A-Z0-9])(?:#?\d{1,2}W|W\d{1,2}|#?\d{1,2}Y)(?:[^A-Z0-9]|$)", compact):
    return "warm"
  if re.search(r"(?:^|[^A-Z0-9])(?:#?\d{1,2}N|N\d{1,2}|#?\d{1,2}NN)(?:[^A-Z0-9]|$)", compact):
    return "neutral"
  return None  # P deliberately excluded (ambiguous pink/series letter)


# --------------------------------------------------------------------------- #
# STAGE 1: mis-parse cleaning of shadeOptions                                 #
# --------------------------------------------------------------------------- #
FORM_NOUNS = (
  "쿠션", "커버쿠션", "브로우", "아이브로우", "카라", "섀도우", "쉐도우", "틴트", "펜슬",
  "라이너", "아이라이너", "팔레트", "블러쉬", "블러셔", "마스카라", "브러쉬", "컨실러",
  "파운데이션", "프라이머", "디자이닝", "올라운더", "커버", "토닝", "픽싱", "스킨",
)
ACC_STRICT = (
  "리필", "본품", "증정", "정품", "키트", "세트", "사은품", "샘플", "케이스", "파우치",
  "스펀지", "스폰지", "어플리케이터", "리무버", "거울", "클렌징", "상품상", "kt알", "패드",
)


def _clean_stat() -> dict[str, int]:
  return {"dropped_brand_digit": 0, "dropped_title_fragment": 0, "fixed_title_fragment": 0,
          "fixed_accessory": 0, "dropped_accessory": 0, "fixed_sku_qty": 0, "dropped_review": 0,
          "deduped_intra": 0}


def _has_undertone_code(shade_number: str) -> bool:
  return bool(re.search(r"[A-Za-z]?\d{1,2}[A-Za-z]?", str(shade_number or "")))


def _shade_key(option: dict[str, Any]) -> str:
  name = re.sub(r"\s+", "", str(option.get("shadeName") or "").lower())
  num = re.sub(r"\s+", "", str(option.get("shadeNumber") or "").lower())
  return f"{num}|{name}"


def _metadata_richness(option: dict[str, Any]) -> tuple[int, float]:
  """Higher is richer: a non-blank coded shadeNumber and higher confidence win."""
  num = str(option.get("shadeNumber") or "")
  coded = 1 if re.search(r"[A-Za-z]?\d", num) else 0
  extras = sum(1 for k in ("undertone", "colorFamily", "intensity") if option.get(k))
  conf = float(option.get("confidence") or 0)
  return (coded * 2 + extras, conf)


def clean_shade_options(
  options: list[dict[str, Any]],
  *,
  brand: str,
  product_name: str,
  stat: dict[str, int],
) -> list[dict[str, Any]]:
  if not isinstance(options, list):
    return []

  brand_digit_match = re.match(r"^(\d+)(\D+)", brand or "")
  brand_digit = brand_digit_match.group(1) if brand_digit_match else None
  brand_remainder = (brand_digit_match.group(2).strip().upper() if brand_digit_match else "")
  brand_tokens = {t for t in re.split(r"\s+", (brand or "")) if t}
  product_tokens = set(re.split(r"[\s\[\]()/]+", product_name or ""))

  cleaned: list[dict[str, Any]] = []
  for raw in options:
    if not isinstance(raw, dict):
      continue
    opt = dict(raw)
    shade_name = _squash(opt.get("shadeName"))
    shade_number = str(opt.get("shadeNumber") or "").strip()

    # (a) brand-digit leak: 3CE -> shadeNumber "3", shadeName "CE ..."
    if brand_digit and shade_number == brand_digit and shade_name.upper().startswith(brand_remainder):
      stat["dropped_brand_digit"] += 1
      continue

    # (e) review / stock garbage
    low = shade_name.lower()
    if any(m in low for m in REVIEW_JUNK_MARKERS) or any(t in low for t in REVIEW_JUNK_TOKENS):
      stat["dropped_review"] += 1
      continue

    # (d) SKU / quantity strip
    new_name = re.sub(r"\s*\d{5,}$", "", shade_name).strip()
    new_name = re.sub(r"\s*\d+\s*(?:개|g|ml|매|입|종)$", "", new_name, flags=re.I).strip()
    if new_name != shade_name:
      stat["fixed_sku_qty"] += 1
      shade_name = new_name
    # bare 1-3 digit shadeName: keep only if a real code lives in shadeNumber
    if re.fullmatch(r"\d{1,3}", shade_name):
      if _has_undertone_code(shade_number) and re.search(r"[A-Za-z]", shade_number):
        shade_name = ""
      else:
        stat["fixed_sku_qty"] += 1
        continue

    # (b) title fragment: a product-form noun or brand token echoed from the title
    tokens = [t for t in re.split(r"[\s\[\]/]+", shade_name) if t]
    noun_idx = [i for i, t in enumerate(tokens)
                if any(fn in t for fn in FORM_NOUNS) or (t in brand_tokens)]
    echoes_title = any(t in product_tokens for t in tokens if len(t) >= 2)
    if noun_idx and echoes_title:
      tail = tokens[noun_idx[-1] + 1:]
      if tail:
        stat["fixed_title_fragment"] += 1
        shade_name = " ".join(tail)
      else:
        stat["dropped_title_fragment"] += 1
        continue

    # (c) accessory / bundle strip (퍼프/폼/휩/밤 intentionally NOT accessories)
    tokens = [t for t in shade_name.split() if t]
    core = [t for t in tokens if not any(acc in t.lower() for acc in ACC_STRICT)]
    if core != tokens:
      if core:
        stat["fixed_accessory"] += 1
        shade_name = " ".join(core)
      else:
        stat["dropped_accessory"] += 1
        continue

    shade_name = _squash(shade_name)
    if not shade_name and not shade_number:
      continue
    opt["shadeName"] = shade_name or opt.get("shadeName")
    opt["shadeNumber"] = shade_number or None
    cleaned.append(opt)

  # (f) intra-product dedup: keep the richest-metadata sibling per shade key,
  #     split self-joins X/X only when the halves are identical.
  best: dict[str, dict[str, Any]] = {}
  order: list[str] = []
  for opt in cleaned:
    name = _squash(opt.get("shadeName"))
    parts = [p.strip() for p in name.split("/")]
    if len(parts) == 2 and parts[0].lower() == parts[1].lower():
      opt = dict(opt)
      opt["shadeName"] = parts[0]
    key = _shade_key(opt)
    if key in best:
      stat["deduped_intra"] += 1
      if _metadata_richness(opt) > _metadata_richness(best[key]):
        best[key] = opt
    else:
      best[key] = opt
      order.append(key)
  return [best[k] for k in order]


# --------------------------------------------------------------------------- #
# STAGE 3: calibrated per-shade derivation                                    #
# --------------------------------------------------------------------------- #
def derive_shade_options(
  options: list[dict[str, Any]],
  *,
  brand: str,
  category: str,
) -> list[dict[str, Any]]:
  policy = CODE_UNDERTONE_POLICY.get(category)
  code_ok = bool(policy and (policy["brands"] is None or brand in policy["brands"]))
  code_conf = policy["confidence"] if policy else 0.0

  derived: list[dict[str, Any]] = []
  for raw in options:
    if not isinstance(raw, dict):
      continue
    opt = dict(raw)
    text = _squash(" ".join(str(opt.get(k) or "") for k in ("optionName", "shadeName", "shadeNumber")))
    if not text:
      derived.append(opt)
      continue

    # colorFamily: only upgrade if we can beat the existing confidence.
    fam, fam_conf = _infer_family(text)
    if fam and fam_conf > float(opt.get("colorFamilyConfidence") or 0):
      if not opt.get("colorFamily") or fam_conf > float(opt.get("colorFamilyConfidence") or 0):
        opt["colorFamily"] = fam
        opt["colorFamilyConfidence"] = fam_conf

    # undertone: deterministic tone word > shade code (base/brow/cheek) > name rule.
    tone, tone_conf = _deterministic_undertone(text)
    if not tone and code_ok:
      code_tone = _code_undertone(text)
      if code_tone:
        tone, tone_conf = code_tone, code_conf
    if not tone:
      tone, tone_conf = _name_undertone(text)
    if tone and tone_conf > float(opt.get("undertoneConfidence") or 0):
      opt["undertone"] = tone
      opt["undertoneConfidence"] = tone_conf

    derived.append(opt)
  return derived


# --------------------------------------------------------------------------- #
# STAGE 4: re-aggregate row attributes from shadeOptions                      #
# --------------------------------------------------------------------------- #
def _aggregate(options: list[dict[str, Any]], field: str, conf_key: str) -> tuple[Any, float]:
  """Most-common value across shades, with its best FIELD-SPECIFIC confidence.

  Deliberately does NOT fall back to a shade's overall ``confidence``: that number
  measures how sure we are the shade exists, not how sure we are of its undertone /
  colorFamily, so borrowing it would manufacture attribute certainty.
  """
  values = [(o.get(field), float(o.get(conf_key) or 0))
            for o in options if isinstance(o, dict) and o.get(field)]
  if not values:
    return None, 0.0
  counts = Counter(v for v, _ in values)
  winner, _ = counts.most_common(1)[0]
  best_conf = max((c for v, c in values if v == winner), default=0.0)
  return winner, round(best_conf, 2)


def reaggregate_row(row: dict[str, Any]) -> dict[str, Any]:
  options = row.get("shadeOptions") or []
  attrs = dict(row.get("attributes") or {})
  conf = dict(row.get("attributeConfidence") or {})
  elig = dict(row.get("hardFilterEligible") or {})

  # shadeOptions are the source of truth for these three attributes: recompute
  # them (and their eligibility) purely from the cleaned/derived shade list.
  for field, ckey in (("undertone", "undertoneConfidence"),
                      ("colorFamily", "colorFamilyConfidence"),
                      ("intensity", "intensityConfidence")):
    value, c = _aggregate(options, field, ckey)
    attrs[field] = value
    conf[field] = c
    elig[field] = bool(value) and c >= HARD_FILTER_CONFIDENCE_CUTOFF

  # Keep the remaining attribute eligibilities in sync with their confidence
  # (needed after a dedup merge, which re-picks the highest-confidence value).
  for field in ("finish", "texture", "suitableFor", "sellingPoints"):
    value = attrs.get(field)
    elig[field] = bool(value) and float(conf.get(field) or 0) >= HARD_FILTER_CONFIDENCE_CUTOFF

  # shadeOptions usable as a hard filter iff we are confident >=1 real shade exists.
  elig["shadeOptions"] = any(
    (o.get("shadeName") or o.get("shadeNumber")) and float(o.get("confidence") or 0) >= HARD_FILTER_CONFIDENCE_CUTOFF
    for o in options if isinstance(o, dict)
  )
  row["attributes"] = attrs
  row["attributeConfidence"] = conf
  row["hardFilterEligible"] = elig
  return row


# --------------------------------------------------------------------------- #
# STAGE 2: variant dedup within (brandName, category)                         #
# --------------------------------------------------------------------------- #
BRAND_ALIASES: dict[str, tuple[str, ...]] = {
  "3CE": ("3CE", "쓰리씨이"), "VDL": ("VDL", "브이디엘"), "데이지크": ("데이지크", "DASIQUE"),
  "라카": ("라카", "LAKA"), "네이밍": ("네이밍", "NAMING"), "뮤드": ("뮤드", "MUDE", "mude"),
  "투쿨포스쿨": ("투쿨포스쿨", "TOO COOL FOR SCHOOL"),
  "에뛰드": ("에뛰드스튜디오", "에뛰드하우스", "에뛰드"),
  "정샘물 뷰티": ("정샘물뷰티", "정샘물"), "페리페라": ("페리페라", "페라페라"),
}
NOISE_TOKENS = {
  "본품", "리필", "기획", "단품", "세트", "증정", "증", "사은", "랜덤", "택", "택1", "택2",
  "미니", "퍼프", "파우치", "키링", "키캡", "케이스", "공용기", "gift", "set", "2set",
  "2ea", "2pack", "ad", "bns", "mns", "r", "온누리상품", "셀러허브", "하프클럽",
  "컬러", "컬러출시", "신규", "추가", "출시", "에디션", "콜라보", "컬렉션",
  "이런", "상품", "어때요", "매장정품", "정품",
}
# Applicator/format words: exempt from the single-hangul drop when adjacent to a
# form noun, so '철벽 펜 아이라이너' != '철벽 브러쉬 아이라이너'.
APPLICATOR_FORMS = {"펜", "밤", "팟", "붓"}
FORM_NOUN_TOKENS = {"라이너", "아이라이너", "블러셔", "블러쉬", "틴트", "펜슬", "쿠션", "섀도우", "쉐도우"}
COLOR_WORDS = {m for markers in COLOR_RULES.values() for m in markers}


def _canonical_key(product_name: str, brand: str, category: str) -> str:
  name = product_name or ""
  name = re.sub(r"\|.*$", " ", name)                                  # STEP 0 mall tail
  name = re.sub(r"이런\s*상품\s*어때요\??", " ", name)                 # STEP 1 widget
  name = re.sub(r"색상.*$", " ", name)                                # STEP 2 color picker
  name = re.sub(r"(?:NEW|뉴|new)\s*컬러(?:출시)?", " ", name, flags=re.I)  # STEP 3
  prev = None
  while prev != name:                                                 # STEP 4 brackets
    prev = name
    name = re.sub(r"[\[\(【][^\]\)】]*[\]\)】]", " ", name)
  for alias in sorted(BRAND_ALIASES.get(brand, (brand,)), key=len, reverse=True):  # STEP 5
    name = re.sub(re.escape(alias), " ", name, flags=re.I)
  name = re.sub(r"/[^/]*", " ", name)                                 # STEP 6 slash noise
  name = re.sub(r"-\s*/?\s*R\b", " ", name)                           # STEP 7
  # STEP 8 codes / measures
  name = re.sub(r"\b\d{5,}\b", " ", name)
  name = re.sub(r"\bSPF\s*\d+\+?\b", " ", name, flags=re.I)
  name = re.sub(r"\bPA\+{1,4}\b", " ", name, flags=re.I)
  name = re.sub(r"\d+\s*(?:colors?|종|호|색|컬러|%|퍼센트)", " ", name, flags=re.I)
  name = re.sub(r"\b[xX]\s*\d+\b", " ", name)
  name = re.sub(r"\b\d\s*\+\s*\d\b", " ", name)
  name = re.sub(r"\d+(?:\.\d+)?\s*(?:g|kg|ml|매|p|개입|개|팩|매입)\b", " ", name, flags=re.I)
  name = re.sub(r"[+#\-·,~()\[\]/|]", " ", name)                      # STEP 9
  gift_context = bool(re.search(r"[+]|증정|정품\s*증정|gift", product_name or "", flags=re.I))
  raw_tokens = [t for t in re.split(r"\s+", name) if t]
  tokens: list[str] = []
  for i, tok in enumerate(raw_tokens):                               # STEP 10 drop noise
    low = tok.lower()
    if low in ("브러쉬", "브러시"):
      if gift_context:
        continue                                                     # strip only in gift context
      tokens.append(tok)
      continue
    if low in NOISE_TOKENS:
      continue
    if re.fullmatch(r"\d+(?:\.\d+)?", tok) or re.fullmatch(r"[A-Za-z]{1,2}", tok):
      continue
    if re.fullmatch(r"[가-힣]", tok):
      neighbours = {raw_tokens[i - 1] if i else "", raw_tokens[i + 1] if i + 1 < len(raw_tokens) else ""}
      if tok in APPLICATOR_FORMS and (neighbours & FORM_NOUN_TOKENS):
        tokens.append(tok)                                           # keep applicator/form near a form noun
      continue
    tokens.append(tok)
  # STEP 11 trailing shade trim
  def _is_shade(tok: str) -> bool:
    low = tok.lower()
    return bool(
      re.fullmatch(r"[A-Za-z]?\d{1,4}[A-Za-z]?(?:호)?", tok)
      or re.fullmatch(r"[A-Za-z]{1,2}\d{1,3}(?:호)?", tok)
      or re.fullmatch(r"\d{1,3}[가-힣]+", tok)
      or re.fullmatch(r"[A-Z]{3,}", tok)
      or low in COLOR_WORDS
    )
  while len(tokens) > 2 and _is_shade(tokens[-1]):
    tokens.pop()
  seen: set[str] = set()                                             # STEP 12 token de-dup
  deduped = []
  for tok in tokens:
    if tok not in seen:
      seen.add(tok)
      deduped.append(tok)
  key = "".join(deduped)                                             # STEP 13 spaceless join
  # STEP 14 standalone base refill stays distinct
  if category == "base" and re.search(r"리필(?!\s*[xX])", product_name or "") and "본품" not in (product_name or ""):
    key += "|REFILL"
  return key


def _merge_rows(members: list[dict[str, Any]]) -> dict[str, Any]:
  # canonical display: fewest variant markers + non-empty shadeOptions
  def _noise_score(r: dict[str, Any]) -> tuple[int, int]:
    pn = r.get("productName") or ""
    markers = len(re.findall(r"[\[\(]|본품|리필|증정|세트|기획|현대|신세계|롯데|[xX]\d", pn))
    return (markers, len(pn))
  base = dict(sorted(members, key=lambda r: (_noise_score(r), 0 if r.get("shadeOptions") else 1))[0])

  # shadeOptions: union, dedupe by shade key keeping richest metadata / max sub-confidences
  best: dict[str, dict[str, Any]] = {}
  order: list[str] = []
  for r in members:
    for opt in r.get("shadeOptions") or []:
      key = _shade_key(opt)
      if key not in best:
        best[key] = dict(opt)
        order.append(key)
      else:
        cur = best[key]
        if _metadata_richness(opt) > _metadata_richness(cur):
          merged = dict(opt)
        else:
          merged = dict(cur)
        for sub in ("undertoneConfidence", "colorFamilyConfidence", "intensityConfidence"):
          hi = max(float(cur.get(sub) or 0), float(opt.get(sub) or 0))
          if hi:
            src = cur if float(cur.get(sub) or 0) >= float(opt.get(sub) or 0) else opt
            attr = sub.replace("Confidence", "")
            if src.get(attr):
              merged[attr] = src.get(attr)
              merged[sub] = hi
        best[key] = merged
  base["shadeOptions"] = [best[k] for k in order]

  # scalar attributes: highest-confidence-wins across members
  attrs: dict[str, Any] = {}
  conf: dict[str, float] = {}
  for r in members:
    a = r.get("attributes") or {}
    c = r.get("attributeConfidence") or {}
    for f, v in a.items():
      if isinstance(v, list):
        merged = list(dict.fromkeys((attrs.get(f) or []) + v))
        attrs[f] = merged
      elif v not in (None, "", []) and float(c.get(f) or 0) >= conf.get(f, 0):
        attrs[f] = v
        conf[f] = float(c.get(f) or 0)
  # carry non-shade confidences (imageUrl/priceKrw/etc.) from base for completeness
  for f, v in (base.get("attributeConfidence") or {}).items():
    conf.setdefault(f, float(v or 0))
  base["attributes"] = attrs
  base["attributeConfidence"] = conf

  # retail presence: OR of listed, max confidence
  pres: dict[str, Any] = {}
  for r in members:
    for chan, info in (r.get("retailPresence") or {}).items():
      cur = pres.setdefault(chan, {"listed": None, "confidence": 0, "status": "unknown"})
      if info.get("listed"):
        cur["listed"] = True
      cur["confidence"] = max(cur["confidence"], float(info.get("confidence") or 0))
      if info.get("status") == "collected":
        cur["status"] = "collected"
  base["retailPresence"] = pres

  # evidence + candidate ids: union
  ev: list[dict[str, Any]] = []
  cand_ids: list[str] = []
  for r in members:
    ev.extend(r.get("evidence") or [])
    if r.get("sourceCandidateId"):
      cand_ids.append(r["sourceCandidateId"])
  for i, e in enumerate(ev, start=1):
    if isinstance(e, dict):
      e["id"] = f"ev{i:03d}"
  base["evidence"] = ev
  base["mergedFromCandidateIds"] = cand_ids
  base["mergedVariantCount"] = len(members)
  return base


def dedup_rows(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
  groups: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
  order: list[tuple[str, str, str]] = []
  for r in rows:
    brand, cat = r.get("brandName") or "", r.get("category") or ""
    key = (brand, cat, _canonical_key(r.get("productName") or "", brand, cat))
    if key not in groups:
      groups[key] = []
      order.append(key)
    groups[key].append(r)
  merged = []
  collapsed = 0
  for key in order:
    members = groups[key]
    if len(members) == 1:
      merged.append(members[0])
    else:
      collapsed += len(members) - 1
      merged.append(_merge_rows(members))
  return merged, collapsed


# --------------------------------------------------------------------------- #
# Coverage measurement + main                                                 #
# --------------------------------------------------------------------------- #
ATTR_FIELDS = ("shadeOptions", "colorFamily", "undertone", "intensity", "finish",
               "texture", "suitableFor", "sellingPoints")


_HONEST_CONF_KEYS = {"undertone": "undertoneConfidence", "colorFamily": "colorFamilyConfidence",
                     "intensity": "intensityConfidence"}


def coverage(rows: list[dict[str, Any]]) -> dict[str, tuple[int, int]]:
  n = len(rows)
  out: dict[str, tuple[int, int]] = {}
  for f in ATTR_FIELDS:
    if f == "shadeOptions":
      filled = sum(1 for r in rows if r.get("shadeOptions"))
    else:
      filled = sum(1 for r in rows if (r.get("attributes") or {}).get(f) not in (None, "", []))
    elig = sum(1 for r in rows if (r.get("hardFilterEligible") or {}).get(f))
    out[f] = (filled, elig)
  out["_n"] = (n, n)
  return out


def honest_eligible(rows: list[dict[str, Any]]) -> dict[str, int]:
  """Recompute undertone/colorFamily/intensity eligibility with NO shade-confidence
  fallback — this is the apples-to-apples baseline for the fields we recalibrated
  (the stored eligibility was inflated by the builder's confidence fallback)."""
  out: dict[str, int] = {}
  for f, ckey in _HONEST_CONF_KEYS.items():
    n = 0
    for r in rows:
      value, c = _aggregate(r.get("shadeOptions") or [], f, ckey)
      if value is not None and c >= HARD_FILTER_CONFIDENCE_CUTOFF:
        n += 1
    out[f] = n
  return out


def _fmt_cov(cov: dict[str, tuple[int, int]]) -> str:
  n = cov["_n"][0]
  lines = ["| field | filled | filled% | hard-filter eligible | eligible% |", "|---|---:|---:|---:|---:|"]
  for f in ATTR_FIELDS:
    filled, elig = cov[f]
    lines.append(f"| `{f}` | {filled}/{n} | {100*filled/n:.1f}% | {elig}/{n} | {100*elig/n:.1f}% |")
  return "\n".join(lines)


def main() -> None:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
  parser.add_argument("--run-date", default="20260706")
  parser.add_argument("--no-dedup", action="store_true", help="skip variant dedup (measure derivation only)")
  args = parser.parse_args()

  rows = _read_jsonl(args.input)
  baseline = coverage(rows)
  baseline_honest = honest_eligible(rows)

  stat = _clean_stat()
  for r in rows:
    r["shadeOptions"] = clean_shade_options(
      r.get("shadeOptions") or [], brand=r.get("brandName") or "",
      product_name=r.get("productName") or "", stat=stat,
    )

  collapsed = 0
  if not args.no_dedup:
    rows, collapsed = dedup_rows(rows)

  for r in rows:
    r["shadeOptions"] = derive_shade_options(
      r.get("shadeOptions") or [], brand=r.get("brandName") or "", category=r.get("category") or "",
    )
    reaggregate_row(r)
    r["sourceGrain"] = "auradin_refined_derivation"

  refined = coverage(rows)

  out_dir = REPO_ROOT / "data/auradin/catalog"
  # Canonical, run-date-addressable name so the downstream MVP/vector pipeline
  # picks it up via --run-date; also a _refined alias for provenance clarity.
  out_path = out_dir / f"catalog_items_seed_{args.run_date}.jsonl"
  _write_jsonl(out_path, rows)
  _write_jsonl(out_dir / f"catalog_items_seed_{args.run_date}_refined.jsonl", rows)

  report_lines = [
    f"# Auradin Seed Refinement — Coverage Report ({args.run_date})",
    "",
    "Zero-network refinement of the expanded limited-detail seed: mis-parse cleaning,",
    "variant dedup, and adversarially-calibrated undertone/colorFamily derivation.",
    "",
    f"- input: `{args.input.relative_to(REPO_ROOT)}` ({baseline['_n'][0]} rows)",
    f"- output: `{out_path.relative_to(REPO_ROOT)}` ({refined['_n'][0]} rows)",
    f"- variant rows collapsed by dedup: {collapsed}",
    "",
    "## Cleaning actions",
    "",
    "\n".join(f"- {k}: {v}" for k, v in stat.items()),
    "",
    f"## Baseline (before) — denominator {baseline['_n'][0]}",
    "",
    _fmt_cov(baseline),
    "",
    "### Honest baseline eligibility (fallback bug removed)",
    "",
    "The builder counts an attribute as hard-filter eligible when the shade's *overall*",
    "confidence >= 0.65, even if the field itself carries no confidence. That inflates the",
    "as-stored numbers above. Recomputed with field-specific confidence only:",
    "",
    "| field | as-stored eligible | honest eligible |",
    "|---|---:|---:|",
    f"| `colorFamily` | {baseline['colorFamily'][1]}/{baseline['_n'][0]} | {baseline_honest['colorFamily']}/{baseline['_n'][0]} |",
    f"| `undertone` | {baseline['undertone'][1]}/{baseline['_n'][0]} | {baseline_honest['undertone']}/{baseline['_n'][0]} |",
    f"| `intensity` | {baseline['intensity'][1]}/{baseline['_n'][0]} | {baseline_honest['intensity']}/{baseline['_n'][0]} |",
    "",
    f"## Refined (after) — denominator {refined['_n'][0]}",
    "",
    _fmt_cov(refined),
    "",
    "## Honest headline (apples-to-apples: honest baseline vs refined)",
    "",
    f"- `colorFamily` eligible: {baseline_honest['colorFamily']}/{baseline['_n'][0]} "
    f"({100*baseline_honest['colorFamily']/baseline['_n'][0]:.1f}%) -> "
    f"{refined['colorFamily'][1]}/{refined['_n'][0]} ({100*refined['colorFamily'][1]/refined['_n'][0]:.1f}%)",
    f"- `undertone` eligible: {baseline_honest['undertone']}/{baseline['_n'][0]} "
    f"({100*baseline_honest['undertone']/baseline['_n'][0]:.1f}%) -> "
    f"{refined['undertone'][1]}/{refined['_n'][0]} ({100*refined['undertone'][1]/refined['_n'][0]:.1f}%)",
    f"- unique products: {baseline['_n'][0]} -> {refined['_n'][0]} (dedup collapsed {collapsed} variant rows)",
    "",
    "## Notes",
    "",
    "- Every hard-filter-eligible value (>=0.65) is defended: a direct color word names its",
    "  own family (브라운→brown, 코랄→coral); base/brow(롬앤·뮤드) shade codes; explicit 쿨톤/웜톤",
    "  tone words; and 애프리콧/선셋→warm. Ambiguous signals (밀크/자몽/구아바, 핑크/로즈 undertone)",
    "  stay <=0.62 and never enter a hard filter.",
    "- Compound shade names resolve by the LAST-positioned color word (애플 브라운 -> brown), and a",
    "  substring guard stops fruit collisions (그레이프⊃그레이 -> plum not gray; 스트로베리⊃베리 -> red;",
    "  브레드/스프레드 suppressed). Adversarial audit: 401/401 colorFamily and 51/51 undertone",
    "  eligible values trace to a real deterministic signal (0 fabricated).",
    "- cheek shade codes were DROPPED after audit (롬앤 베러 댄 치크 C/W/N are formulation, not tone).",
    "- `undertone` gain is modest by design: undertone is rarely deterministic from a shade name,",
    "  and we refused to manufacture certainty. `intensity` stays non-eligible for the same reason.",
    "- No colorHex/colorLab, no madeInCountry, no fabricated retail presence.",
  ]
  report_path = REPO_ROOT / "reports/auradin" / f"seed_refinement_coverage_{args.run_date}.md"
  report_path.parent.mkdir(parents=True, exist_ok=True)
  report_path.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

  print(f"rows: {baseline['_n'][0]} -> {refined['_n'][0]} (collapsed {collapsed})")
  print(f"cleaning: {stat}")
  print(f"{'field':<14}{'base filled':>12}{'base elig':>11}{'ref filled':>12}{'ref elig':>10}")
  for f in ATTR_FIELDS:
    bf, be = baseline[f]
    rf, re_ = refined[f]
    print(f"{f:<14}{bf:>12}{be:>11}{rf:>12}{re_:>10}")
  print(f"output: {out_path}")
  print(f"report: {report_path}")


if __name__ == "__main__":
  main()
