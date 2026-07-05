from __future__ import annotations

import argparse
import html
import json
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

try:
  import certifi
except ImportError:  # pragma: no cover - depends on local Python distribution.
  certifi = None


REPO_ROOT = Path(__file__).resolve().parents[1]

COLLECTOR_VERSION = "auradin-official-metadata-v1"
UTC = timezone.utc
TEXT_SNIPPET_LIMIT = 260

OFFICIAL_SOURCES = {
  "라카": {
    "brandAliases": ("라카", "laka"),
    "delaySeconds": 2.0,
    "sitemapUrl": "https://laka.co.kr/sitemap.xml",
  },
  "롬앤": {
    "brandAliases": ("롬앤", "romand", "rom&nd", "rom nd"),
    "delaySeconds": 10.0,
    "sitemapUrl": "https://romand.co.kr/sitemap.xml",
  },
  "뮤드": {
    "brandAliases": ("뮤드", "mude"),
    "delaySeconds": 10.0,
    "sitemapUrl": "https://mude.co.kr/sitemap.xml",
  },
  "네이밍": {
    "brandAliases": ("네이밍", "naming"),
    "delaySeconds": 2.0,
    "sitemapUrl": "https://naming.co.kr/sitemap.xml",
  },
  "에뛰드": {
    "brandAliases": ("에뛰드", "etude"),
    "delaySeconds": 2.0,
    "sitemapUrl": "https://www.etude.com/wp-sitemap-posts-product-1.xml",
  },
  "에스쁘아": {
    "brandAliases": ("에스쁘아", "espoir"),
    "delaySeconds": 0.2,
    "titleIndex": True,
    "sitemapUrl": "https://www.espoir.com/sitemap.xml",
  },
  "투쿨포스쿨": {
    "brandAliases": ("투쿨포스쿨", "too cool for school", "toocoolforschool", "tcfs"),
    "delaySeconds": 2.0,
    "sitemapUrl": "https://toocoolforschool.com/sitemap.xml",
  },
  "하트퍼센트": {
    "brandAliases": ("하트퍼센트", "heartpercent", "heart percent"),
    "delaySeconds": 2.0,
    "sitemapUrl": "https://heartpercent.co.kr/sitemap.xml",
  },
  "데이지크": {
    "brandAliases": ("데이지크", "dasique"),
    "delaySeconds": 0.6,
    "sitemapUrl": "https://dasique.com/sitemap.xml",
    "sitemapIndex": True,
  },
  "더샘": {
    "brandAliases": ("더샘", "the saem", "thesaem", "the saem cosmetic"),
    "delaySeconds": 0.8,
    "sitemapUrl": "http://www.thesaemcosmetic.com/sitemap.xml",
    "titleIndex": True,
  },
  "3CE": {
    "brandAliases": ("3CE", "3ce", "쓰리씨이", "stylenanda"),
    "delaySeconds": 0.15,
    "sitemapUrl": "https://www.3cecosmetics.com/sitemap.xml",
  },
  "VDL": {
    "brandAliases": ("VDL", "vdl", "브이디엘"),
    "delaySeconds": 0.2,
    "htmlIndex": True,
    "sitemapUrl": "https://www.vdlcosmetics.com/index.jsp",
  },
  "클리오": {
    "brandAliases": ("클리오", "clio"),
    "delaySeconds": 0.05,
    "extraHtmlIndexUrls": (
      "https://clubclio.co.kr/shop/brandsList/all/brand/1",
      "https://clubclio.co.kr/shop/goodsList/120702000000000",
      "https://clubclio.co.kr/shop/goodsList/120703000000000",
      "https://clubclio.co.kr/shop/goodsList/120704000000000",
    ),
    "optionDataUrlTemplate": "https://clubclio.co.kr/controller/product/loadOptionDatas/{product_id}",
    "sitemapUrl": "https://clubclio.co.kr/sitemap.xml",
    "titleIndex": True,
    "urlRewrites": (("https://ncloud.meta-commerce.co.kr", "https://clubclio.co.kr"),),
  },
  "페리페라": {
    "brandAliases": ("페리페라", "peripera"),
    "delaySeconds": 0.05,
    "extraHtmlIndexUrls": (
      "https://clubclio.co.kr/shop/brandsList/all/brand/2",
      "https://clubclio.co.kr/shop/goodsList/120702000000000",
      "https://clubclio.co.kr/shop/goodsList/120703000000000",
      "https://clubclio.co.kr/shop/goodsList/120704000000000",
    ),
    "optionDataUrlTemplate": "https://clubclio.co.kr/controller/product/loadOptionDatas/{product_id}",
    "sitemapUrl": "https://clubclio.co.kr/sitemap.xml",
    "titleIndex": True,
    "urlRewrites": (("https://ncloud.meta-commerce.co.kr", "https://clubclio.co.kr"),),
  },
  "정샘물 뷰티": {
    "brandAliases": ("정샘물 뷰티", "정샘물", "jungsaemmool", "jsmbeauty"),
    "delaySeconds": 0.2,
    "extraIndexUrls": (
      "https://www.jsmbeauty.com/shop/shopbrand.html?xcode=017&type=Y",
      "https://www.jsmbeauty.com/shop/shopbrand.html?xcode=003&mcode=002&type=X",
    ),
    "htmlIndex": True,
    "sitemapUrl": "https://www.jsmbeauty.com",
    "titleIndex": True,
  },
}

SITEMAP_PRODUCT_URL_MARKERS = (
  "/product/",
  "/products/",
  "/all-products/",
  "/product/item.php",
  "/product/detail.jsp",
  "/shop/category/",
  "/shop/goodsView/",
  "/shop/shop_prd_view.do",
  "/shop/shopdetail.html",
)

PRODUCT_BLOCKLIST = (
  "brush",
  "case",
  "kit",
  "mini",
  "set",
  "공식몰",
  "기획",
  "단독",
  "듀오",
  "립",
  "립스틱",
  "마스카라",
  "블러셔",
  "블러쉬",
  "브러쉬",
  "브러시",
  "세트",
  "쉐딩",
  "증정",
  "틴트",
  "팔레트",
  "하이라이터",
)

URL_MATCH_BLOCKLIST = (
  "공식몰",
  "기획",
  "단독",
  "듀오",
  "세트",
  "증정",
)

SHADE_REJECT_MARKERS = (
  "new",
  "best",
  "md추천",
  "recommend",
  "같이 구매",
  "공식",
  "광택",
  "구매",
  "권장",
  "데일리 메이크업",
  "데일리 컬러",
  "데일리 치크",
  "배송",
  "배송비",
  "베스트셀러",
  "부드러운 발색",
  "뷰티",
  "생기",
  "마스카라",
  "섀도우",
  "스토어",
  "실크 블러셔",
  "아이메이크업",
  "아이템",
  "입술",
  "젠더리스",
  "추천",
  "취향",
  "치크",
  "큐레이션",
  "톤온톤",
  "투명",
  "퍼스널 컬러",
  "할인",
  "shipping",
  "shipping to",
)

COLOR_RULES = {
  "pink": ("핑크", "pink", "피오니", "베이비핑크", "페탈", "petal", "blush"),
  "rose": ("로즈", "로지", "rose", "말린장미", "장미"),
  "coral": ("코랄", "coral", "살구", "파파야", "papaya", "salmon", "소프트살몬"),
  "red": ("레드", "red", "체리", "cherry"),
  "orange": ("오렌지", "orange", "브릭", "brick", "burnt", "망고", "mango", "애프리콧", "apricot", "탠저린", "tangerine", "홍시", "칠리", "chili"),
  "mauve": ("모브", "mauve"),
  "brown": ("브라운", "brown", "초코", "카카오", "카라멜", "토프", "도토리", "땅콩", "토스트", "sienna", "sepia", "toast", "tan", "hazel", "acorn", "mocha", "chestnut", "blonde", "갈색", "흑갈색"),
  "nude": ("누드", "nude", "베이지", "beige", "nudi", "bei", "차이", "chai", "아이보리", "ivory", "포슬린", "porcelain", "바닐라", "vanilla", "리넨", "linen", "란제리", "lingerie", "샌드", "sand", "페어", "fair", "내추럴", "natural", "오트", "oat"),
  "peach": ("피치", "peach", "복숭아"),
  "plum": ("플럼", "plum", "베리", "berry", "와인", "포도", "그레이프", "grape", "라벤더", "lavender", "라일락", "lilac", "퍼플", "purple", "violet"),
  "black": ("블랙", "black", "흑색", "흑심", "느와르", "noir", "ebony"),
  "gray": ("그레이", "gray", "grey", "애쉬", "ash", "회갈색"),
}

SHADE_CODE_COLOR_PREFIXES = {
  "BE": "nude",
  "BR": "brown",
  "CR": "coral",
  "MV": "mauve",
  "OR": "orange",
  "PK": "pink",
  "PP": "plum",
  "PU": "plum",
  "RD": "red",
  "RS": "rose",
}

UNDERTONE_RULES_EXPLICIT = {
  "warm": ("웜톤", "봄웜", "가을웜", "웜블랜딩", "웜 블랜딩", "warm tone", "warm"),
  "cool": ("쿨톤", "여름쿨", "겨울쿨", "쿨블랜딩", "쿨 블랜딩", "cool tone", "cool"),
  "neutral": ("뉴트럴", "neutral"),
}

UNDERTONE_RULES_PROXY = {
  "warm": ("코랄", "오렌지", "피치", "브릭", "허니", "살구", "파파야", "탠저린", "홍시", "애프리콧", "sienna", "burnt", "카라멜", "샌드", "진저"),
  "cool": ("모브", "플럼", "베리", "포도", "그레이프", "라벤더", "라일락", "페탈", "로지", "애쉬", "그레이"),
  "neutral": ("누드", "베이지", "mlbb", "도토리", "땅콩", "토스트", "브라운", "아이보리", "nudi", "bei", "sepia", "내추럴", "포슬린", "바닐라", "리넨", "오트", "토프"),
}

SHADE_SIGNAL_MARKERS = tuple(
  sorted(
    {
      marker.lower()
      for rules in (COLOR_RULES, UNDERTONE_RULES_EXPLICIT, UNDERTONE_RULES_PROXY)
      for markers in rules.values()
      for marker in markers
    },
  ),
)

GENERIC_COLOR_TOKENS = {
  "레드",
  "로즈",
  "브릭",
  "코랄",
  "핑크",
  "피치",
  "브라운",
  "베이지",
  "모브",
  "플럼",
  "베리",
  "오렌지",
  "누드",
  "red",
  "rose",
  "brick",
  "coral",
  "pink",
  "peach",
  "brown",
  "beige",
  "mauve",
  "plum",
  "berry",
  "orange",
  "nude",
}

MATCH_SYNONYM_PHRASES = {
  "글로우 팟": "glow pot",
  "글로우 래스팅": "글로우래스팅",
  "눈토리얼 아이 팔레트": "eye palette",
  "리틀 블러쉬 팔레트": "little blush palette",
  "리틀 섀도우 팔레트": "little shadow palette",
  "무드 섀도우 팔레트": "mood shadow palette eyeshadow palette",
  "블렌딩 무드 치크": "blending mood cheek",
  "섀도우 팔레트": "eyeshadow palette",
  "수플레 컬러 팟": "souffle color pot",
  "실키 베일 블러쉬": "silky veil blush",
  "아이 코어": "아이코어",
  "리얼 아이 팔레트": "리얼아이팔레트",
  "쥬시 듀이 글로우 틴트": "juicy dewy glow tint",
  "쥬시 듀이 틴트": "juicy dewy lip tint",
  "츄잉 글로우 팟": "chewing glow pot",
  "탕후루 탱글 틴트": "tanghulu tanghulu tint",
  "틴토리 솜 블러셔": "tintory blush",
  "톤 페어링": "톤페어링",
  "프로 아이 팔레트": "pro eye palette",
  "글레이즈 립 틴트": "glaze lip tint",
  "뉴 테이크 아이섀도우 팔레트": "new take eyeshadow palette",
  "뉴 테이크 페이스 블러셔": "new take face blusher",
  "레이지 팝 립 스테인": "lazy pop lip stain",
  "멀티 아이 컬러 팔레트": "multi eye color palette",
  "미스티 립 베어": "misty lip bare",
  "바운시 블러 밤": "bouncy blur balm",
  "벨벳 립 틴트 플러쉬": "velvet lip tint plush",
  "블러 워터 틴트": "blur water tint",
  "블러 웨어": "블러웨어",
  "블러 웨어 블러쉬": "블러웨어블러쉬",
  "블러 벨벳": "블러벨벳",
  "블러쉬 라이터": "blushlighter",
  "블러링 리퀴드 립": "blurring liquid lip",
  "립 틴트": "립틴트",
  "피팅 블러": "피팅블러",
  "시럽 레이어링 틴트": "syrup layering tint",
  "아이 스위치 스틱": "eye switch stick",
  "아이 스위치": "eye switch",
  "컬러 그리드 아이섀도우": "color grid eyeshadow",
  "페이스 블러쉬": "face blush",
  "페이스 블러셔": "face blusher",
}

MATCH_SHADE_SYNONYM_PHRASES = {
  "꼬숩땅콩": "peanut nut",
  "라이트라벤더": "light lavender",
  "러브하트": "love heart",
  "로즈밀크티": "rose milk tea",
  "로즈 밀크 티": "rose milk tea",
  "모브 베어": "mauve bear",
  "모브": "mauve",
  "뮤티드 넛츠": "muted nuts",
  "뮤티드 넛": "muted nuts",
  "브라운 베어": "brown bear",
  "비올렛 니트": "violet knit",
  "아몬드바닐라": "almond vanilla",
  "아몬드 바닐라": "almond vanilla",
  "웜블랜딩": "warm blending",
  "웜 블랜딩": "warm blending",
  "쿨블랜딩": "cool blending",
  "쿨 블랜딩": "cool blending",
  "트윙클 머메이드": "twinkle mermaid",
}

COUNTRY_NORMALIZATION = {
  "대한민국": "Korea",
  "한국": "Korea",
  "국내": "Korea",
  "korea": "Korea",
  "south korea": "Korea",
  "china": "China",
  "중국": "China",
  "japan": "Japan",
  "일본": "Japan",
  "italy": "Italy",
  "이탈리아": "Italy",
  "france": "France",
  "프랑스": "France",
  "usa": "United States",
  "united states": "United States",
  "미국": "United States",
}

FINISH_RULES = {
  "matte": ("매트", "보송", "무광", "matte"),
  "velvet": ("벨벳", "velvet", "블러", "blur"),
  "satin": ("새틴", "satin", "세미매트", "semi-matte"),
  "sheer": ("쉬어", "투명", "맑은", "sheer"),
  "shimmer": ("쉬머", "펄", "글리터", "shimmer", "glitter"),
  "glossy": ("글로우", "광택", "글로스", "glossy", "gloss", "dewy", "듀이", "물", "글레이즈"),
}

TEXTURE_RULES = {
  "tint": ("틴트", "tint"),
  "balm": ("밤", "balm"),
  "lipstick": ("립스틱", "lipstick", "립 매트"),
  "gloss": ("글로스", "gloss", "글레이즈"),
  "cream": ("크림", "cream", "컨실러", "concealer", "프라이머", "primer", "파운데이션", "foundation", "선 베이스", "선베이스"),
  "powder": ("파우더", "powder", "팔레트", "섀도우", "팩트", "블러셔", "블러쉬", "치크", "blush", "cheek", "쉐이더", "셰이더", "shader"),
  "pencil": ("펜슬", "pencil"),
  "liquid": ("리퀴드", "liquid"),
  "cushion": ("쿠션", "cushion"),
  "mascara": ("마스카라", "mascara", "브로우 카라", "brow cara", "brow mascara"),
  "liner": ("라이너", "liner", "아이라이너"),
}

INTENSITY_RULES = {
  "sheer": ("쉬어", "투명", "맑은", "자연스러운", "은은한", "데일리", "누드", "베어", "라이트", "light", "pale", "페어", "fair", "포슬린", "porcelain", "클리어", "clear"),
  "medium": ("중간", "선명", "buildable", "내추럴", "natural", "미디엄", "medium", "베이지", "beige", "리넨", "linen"),
  "bold": ("고발색", "진한", "intense", "vivid", "딥", "볼드", "deep", "dark", "다크", "블랙", "black", "흑색", "흑심", "진저", "ginger"),
}

SELLING_POINT_RULES = {
  "long_lasting": ("지속", "래스팅", "롱웨어", "픽싱", "고정", "long lasting", "lasting", "fixing", "fix"),
  "moisturizing": ("보습", "촉촉", "수분", "moistur", "hydrating"),
  "glow": ("광택", "글로우", "윤광", "glow", "dewy", "glass", "글레이즈"),
  "blur": ("블러", "blur"),
  "waterproof": ("워터프루프", "파워프루프", "수퍼프루프", "슈퍼프루프", "프루프", "방수", "waterproof", "proof"),
  "lightweight": ("가벼", "라이트", "lightweight"),
  "high_pigment": ("고발색", "선명", "vivid", "pigment"),
  "vegan": ("비건", "vegan"),
}

SUITABLE_FOR_RULES = {
  "warm_tone": ("웜톤", "봄웜", "가을웜", "warm tone"),
  "cool_tone": ("쿨톤", "여름쿨", "겨울쿨", "cool tone"),
  "daily_makeup": ("데일리", "daily"),
  "natural_makeup": ("자연스러운", "내추럴", "natural"),
}


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


def _squash(value: Any) -> str:
  return re.sub(r"\s+", " ", str(value or "")).strip()


def _short(value: Any, limit: int = TEXT_SNIPPET_LIMIT) -> str:
  return _squash(value)[:limit]


def _normalize_text(value: Any) -> str:
  original_text = urllib.parse.unquote(_squash(value).lower())
  text = original_text
  text = re.sub(r"\[[^\]]+\]|\([^)]*\)", " ", text)
  text = re.sub(r"[^0-9a-z가-힣]+", " ", text)

  synonyms = [
    synonym
    for phrase, synonym in {**MATCH_SYNONYM_PHRASES, **MATCH_SHADE_SYNONYM_PHRASES}.items()
    if phrase in original_text
  ]

  if synonyms:
    text = f"{text} {' '.join(synonyms)}"

  return _squash(text)


def _tokens(
  value: Any,
  brand_aliases: tuple[str, ...],
  *,
  blocklist: tuple[str, ...] = PRODUCT_BLOCKLIST,
) -> set[str]:
  normalized = _normalize_text(value)
  tokens = {
    token
    for token in normalized.split()
    if len(token) > 1
    and token not in {alias.lower() for alias in brand_aliases}
    and token not in blocklist
  }
  return tokens


def _quote_url(url: str) -> str:
  parsed = urllib.parse.urlsplit(url)
  path = urllib.parse.quote(urllib.parse.unquote(parsed.path), safe="/")
  query = urllib.parse.quote(urllib.parse.unquote(parsed.query), safe="=&?/:+%")
  return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, path, query, parsed.fragment))


def _fetch_text(url: str, *, timeout_seconds: float, user_agent: str) -> tuple[str, dict[str, Any]]:
  request = urllib.request.Request(
    _quote_url(url),
    headers={
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": user_agent,
    },
  )
  context = None

  if urllib.parse.urlparse(url).scheme == "https" and certifi is not None:
    context = ssl.create_default_context(cafile=certifi.where())

  try:
    with urllib.request.urlopen(request, timeout=timeout_seconds, context=context) as response:
      body = response.read()
      charset = response.headers.get_content_charset() or "utf-8"
      return body.decode(charset, errors="replace"), {
        "contentLength": len(body),
        "httpStatus": int(response.status),
        "urlEffective": response.geturl(),
      }
  except Exception as exc:
    return "", {
      "contentLength": 0,
      "error": f"{type(exc).__name__}: {exc}",
      "httpStatus": None,
      "urlEffective": url,
    }


def _product_id_from_url(url: str) -> str:
  match = re.search(r"/shop/goodsView/(\d+)", urllib.parse.urlsplit(url).path)
  return match.group(1) if match else ""


def _fetch_option_data_for_source(
  source: dict[str, Any],
  product_url: str,
  *,
  timeout_seconds: float,
  user_agent: str,
) -> tuple[str, dict[str, Any] | None]:
  template = source.get("optionDataUrlTemplate")
  product_id = _product_id_from_url(product_url)

  if not template or not product_id:
    return "", None

  option_url = str(template).format(product_id=product_id)
  option_text, option_fetch = _fetch_text(
    option_url,
    timeout_seconds=timeout_seconds,
    user_agent=user_agent,
  )

  if not option_text:
    return "", {"optionDataUrl": option_url, "fetch": option_fetch}

  return f"\n<script>{option_text}</script>", {"optionDataUrl": option_url, "fetch": option_fetch}


def _extract_sitemap_product_urls(text: str) -> list[str]:
  urls = [
    html.unescape(match.group(1).strip())
    for match in re.finditer(r"<loc>(.*?)</loc>", text, flags=re.I | re.S)
  ]
  return [
    url
    for url in urls
    if any(marker in url for marker in SITEMAP_PRODUCT_URL_MARKERS)
  ]


def _extract_sitemap_child_urls(text: str) -> list[str]:
  urls = [
    html.unescape(match.group(1).strip())
    for match in re.finditer(r"<loc>(.*?)</loc>", text, flags=re.I | re.S)
  ]
  return [
    url
    for url in urls
    if "sitemap" in urllib.parse.urlparse(url).path.lower()
    and not any(marker in url for marker in SITEMAP_PRODUCT_URL_MARKERS)
  ][:8]


def _extract_sitemap_product_entries(text: str) -> list[dict[str, Any]]:
  entries: list[dict[str, Any]] = []

  for block_match in re.finditer(r"<url\b[^>]*>(.*?)</url>", text, flags=re.I | re.S):
    block = block_match.group(1)
    loc_match = re.search(r"<loc>(.*?)</loc>", block, flags=re.I | re.S)

    if not loc_match:
      continue

    url = html.unescape(loc_match.group(1).strip())

    if not any(marker in url for marker in SITEMAP_PRODUCT_URL_MARKERS):
      continue

    image_titles = [
      _squash(html.unescape(match.group(1)))
      for match in re.finditer(r"<image:title>(.*?)</image:title>", block, flags=re.I | re.S)
    ]
    match_text = _squash(" ".join([urllib.parse.unquote(url), *image_titles]))
    entries.append(
      {
        "fetchSummary": None,
        "matchText": match_text or urllib.parse.unquote(url),
        "pageText": None,
        "sitemapImageTitles": image_titles,
        "url": url,
      },
    )

  return entries


def _rewrite_url_for_source(url: str, source: dict[str, Any]) -> str:
  rewritten = url

  for source_prefix, target_prefix in source.get("urlRewrites", ()):
    if rewritten.startswith(source_prefix):
      rewritten = f"{target_prefix}{rewritten[len(source_prefix):]}"

  return rewritten


def _canonical_product_url(url: str) -> str:
  parsed = urllib.parse.urlsplit(url)

  if parsed.path.endswith("/shop/shopdetail.html"):
    query = urllib.parse.parse_qs(parsed.query)
    branduid = (query.get("branduid") or [""])[0]

    if branduid:
      return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, f"branduid={branduid}", ""))

  return url


def _extract_html_product_entries(text: str, *, base_url: str, source: dict[str, Any]) -> list[dict[str, Any]]:
  entries: list[dict[str, Any]] = []
  seen: set[str] = set()

  for match in re.finditer(r"<a\b[^>]*href=(['\"])(.*?)\1[^>]*>(.*?)</a>", text, flags=re.I | re.S):
    href = html.unescape(match.group(2).strip())

    if not href:
      continue

    absolute_url = urllib.parse.urljoin(base_url, href)
    absolute_url = _rewrite_url_for_source(absolute_url, source)
    absolute_url = _canonical_product_url(absolute_url)

    if not any(marker in absolute_url for marker in SITEMAP_PRODUCT_URL_MARKERS):
      continue

    if absolute_url in seen:
      continue

    seen.add(absolute_url)
    anchor_html = match.group(0)
    product_inner_start = text.rfind('<div class="product__inner"', 0, match.start())
    product_inner_end = text.find("</div><!-- //product__inner -->", match.end())
    item_start = text.rfind('<div class="item"', 0, match.start())
    item_end = text.find('<div class="item"', match.end())

    if product_inner_start != -1 and product_inner_end != -1:
      context_start = product_inner_start
      context_end = product_inner_end + len("</div><!-- //product__inner -->")
    elif item_start != -1 and item_end != -1:
      context_start = item_start
      context_end = item_end
    elif item_start != -1:
      context_start = item_start
      context_end = min(len(text), match.end() + 900)
    else:
      context_start = max(0, match.start() - 500)
      context_end = min(len(text), match.end() + 500)

    context = text[context_start:context_end]
    alt_titles = [
      _squash(html.unescape(item))
      for item in re.findall(r"(?:alt|title)=['\"]([^'\"]+)['\"]", anchor_html + context, flags=re.I)
    ]
    plain_context = _plain_text_from_html(anchor_html + context)
    match_text = _squash(" ".join([urllib.parse.unquote(absolute_url), *alt_titles, plain_context]))
    entries.append(
      {
        "fetchSummary": None,
        "matchText": match_text or urllib.parse.unquote(absolute_url),
        "pageText": None,
        "sitemapImageTitles": alt_titles,
        "url": absolute_url,
      },
    )

  return entries


def _discover_sitemap_product_entries(
  sitemap_text: str,
  *,
  source: dict[str, Any],
  source_url: str,
  timeout_seconds: float,
  user_agent: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
  entries = (
    _extract_html_product_entries(sitemap_text, base_url=source_url, source=source)
    if source.get("htmlIndex")
    else _extract_sitemap_product_entries(sitemap_text)
  )
  child_fetches: list[dict[str, Any]] = []

  if entries and not source.get("sitemapIndex"):
    return [
      {
        **entry,
        "url": _rewrite_url_for_source(str(entry.get("url") or ""), source),
      }
      for entry in entries
    ], child_fetches

  for child_url in _extract_sitemap_child_urls(sitemap_text):
    child_text, child_fetch = _fetch_text(
      child_url,
      timeout_seconds=timeout_seconds,
      user_agent=user_agent,
    )
    child_fetches.append({"sitemapUrl": child_url, "fetch": child_fetch})

    if child_text:
      entries.extend(_extract_sitemap_product_entries(child_text))

  seen: set[str] = set()
  deduped: list[dict[str, Any]] = []

  for entry in entries:
    url = str(entry.get("url") or "")
    url = _rewrite_url_for_source(url, source)

    if not url or url in seen:
      continue

    seen.add(url)
    deduped.append({**entry, "url": url})

  return deduped, child_fetches


def _dedupe_product_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
  seen: set[str] = set()
  deduped: list[dict[str, Any]] = []

  for entry in entries:
    url = str(entry.get("url") or "")

    if not url or url in seen:
      continue

    seen.add(url)
    deduped.append(entry)

  return deduped


def _extract_meta_content(page_text: str, names: tuple[str, ...]) -> dict[str, str]:
  result: dict[str, str] = {}

  for match in re.finditer(r"<meta\b[^>]*>", page_text, flags=re.I):
    tag = match.group(0)
    name_match = re.search(r'(?:name|property)=["\']([^"\']+)["\']', tag, flags=re.I)
    content_match = re.search(r'content=["\']([^"\']*)["\']', tag, flags=re.I | re.S)

    if not name_match or not content_match:
      continue

    name = name_match.group(1).lower()

    if name in names:
      result[name] = html.unescape(content_match.group(1))

  title_match = re.search(r"<title[^>]*>(.*?)</title>", page_text, flags=re.I | re.S)

  if title_match:
    result["title"] = html.unescape(re.sub(r"<[^>]+>", " ", title_match.group(1)))

  return result


def _extract_jsonld_product_name(page_text: str) -> str:
  for match in re.finditer(
    r"<script\b[^>]*type=['\"]application/ld\+json['\"][^>]*>(.*?)</script>",
    page_text,
    flags=re.I | re.S,
  ):
    raw_json = html.unescape(match.group(1).strip())

    try:
      payload = json.loads(raw_json)
    except json.JSONDecodeError:
      continue

    candidates = payload if isinstance(payload, list) else [payload]

    for candidate in candidates:
      if not isinstance(candidate, dict):
        continue

      product_type = str(candidate.get("@type") or "").lower()
      product_name = candidate.get("name")

      if "product" in product_type and isinstance(product_name, str):
        return _squash(product_name)

  return ""


def _is_generic_official_title(value: Any) -> bool:
  normalized = _normalize_text(value)
  return any(marker in normalized for marker in ("공식쇼핑몰", "공식 쇼핑몰", "공식몰", "official shop"))


def _first_specific_name(*values: Any, fallback: str = "") -> str:
  for value in values:
    normalized = _squash(value)

    if normalized and not _is_generic_official_title(normalized):
      return normalized

  for value in values:
    normalized = _squash(value)

    if normalized:
      return normalized

  return fallback


def _infer_by_rules(text: str, rules: dict[str, tuple[str, ...]]) -> str | None:
  lowered = text.lower()

  for value, markers in rules.items():
    if any(marker.lower() in lowered for marker in markers):
      return value

  return None


def _collect_tags(text: str, rules: dict[str, tuple[str, ...]]) -> list[str]:
  lowered = text.lower()
  return [
    tag
    for tag, markers in rules.items()
    if any(marker.lower() in lowered for marker in markers)
  ]


def _plausible_shade_token(token: str, product_tokens: set[str], brand_aliases: tuple[str, ...]) -> bool:
  normalized = _normalize_text(token)

  if not normalized or len(normalized) > 32:
    return False

  lowered = normalized.lower()

  if any(alias.lower() in normalized for alias in brand_aliases):
    return False

  if any(blocked in normalized for blocked in PRODUCT_BLOCKLIST):
    return False

  if any(reject in lowered for reject in SHADE_REJECT_MARKERS):
    return False

  if normalized in product_tokens:
    return False

  if re.fullmatch(r"\d+|[a-z]{1,2}", normalized):
    return False

  has_shade_signal = any(marker in lowered for marker in SHADE_SIGNAL_MARKERS)
  has_numbered_shade = bool(re.search(r"(?:^|[#\s])\d{1,3}(?:호|번)?(?:\s|$)", normalized))

  return bool(re.search(r"[가-힣a-z]", normalized)) and (has_shade_signal or has_numbered_shade)


def _plain_text_from_html(page_text: str) -> str:
  text = re.sub(r"<script\b.*?</script>", " ", page_text, flags=re.I | re.S)
  text = re.sub(r"<style\b.*?</style>", " ", text, flags=re.I | re.S)
  text = re.sub(r"<[^>]+>", " ", text)
  return _squash(html.unescape(text))


def _clean_option_name(raw: Any) -> str:
  text = urllib.parse.unquote(html.unescape(str(raw or "")))
  text = re.sub(r"<\d+>", " ", text)
  text = re.sub(r"<[^>]+>", " ", text)
  text = re.split(r"\+|#\$%|\|\|\||/추가구매|추가구매", text)[0]
  text = re.sub(r"\[[^\]]+\]|\([^)]*\)", " ", text)
  text = re.sub(r"^★?예약판매★?\s*", " ", text)
  text = re.sub(r"^(?:NEW|AD)[!♥\s]*", " ", text, flags=re.I)
  text = re.sub(r"\+\s*[\d,]+\s*원", " ", text)
  text = re.sub(r"\$\s*\d+(?:\.\d+)?", " ", text)
  text = re.sub(r"\b\d+(?:\.\d+)?\s*(?:g|ml|colors?|컬러|종)\b", " ", text, flags=re.I)
  text = text.replace("*", " ")
  text = re.sub(r"\b품절\b|\b일시품절\b|\bsold\s*out\b", " ", text, flags=re.I)
  text = text.replace("_", " ").replace("-", " ")
  text = re.sub(r"\b(?:단품|본품|기획|증정|미니|선택|옵션|색상|컬러|color|type)\b", " ", text, flags=re.I)
  text = re.sub(r"[\(\[\{]+$", " ", text)
  return _squash(text)


def _parse_shade_name(raw: Any) -> tuple[str | None, str]:
  cleaned = _clean_option_name(raw)
  match = re.match(r"^(#?\d{1,3}|[A-Z]{1,4}\d{1,4})\s*[.\s호-]*\s*(.+)$", cleaned, flags=re.I)

  if match:
    shade_number = match.group(1).upper().lstrip("#")
    return shade_number, _squash(match.group(2))

  match = re.match(r"^(.+?)\s+(\d{1,3})호$", cleaned)

  if match:
    return match.group(2), _squash(match.group(1))

  return None, cleaned


def _plausible_structured_option(raw: Any, product_tokens: set[str], brand_aliases: tuple[str, ...]) -> bool:
  shade_number, shade_name = _parse_shade_name(raw)
  normalized = _normalize_text(shade_name)

  if not normalized or len(normalized) > 42:
    return False

  if any(alias.lower() in normalized for alias in brand_aliases):
    return False

  if normalized in product_tokens:
    return False

  if any(reject in normalized.lower() for reject in SHADE_REJECT_MARKERS):
    return False

  if any(blocked in normalized for blocked in PRODUCT_BLOCKLIST):
    return False

  if re.fullmatch(r"p\d{4}\s*[0-9a-z]+", normalized):
    return False

  if re.fullmatch(r"[0-9a-z]{5,}", normalized) and not re.search(r"[가-힣]", normalized):
    return False

  has_shade_signal = any(marker in normalized.lower() for marker in SHADE_SIGNAL_MARKERS)
  has_structured_number = bool(shade_number)

  return bool(re.search(r"[가-힣a-z]", normalized)) and (has_shade_signal or has_structured_number)


def _plausible_trusted_structured_option(raw: Any, product_tokens: set[str], brand_aliases: tuple[str, ...]) -> bool:
  _, shade_name = _parse_shade_name(raw)
  normalized = _normalize_text(shade_name)

  if not normalized or len(normalized) > 42:
    return False

  if any(alias.lower() in normalized for alias in brand_aliases):
    return False

  if normalized in product_tokens:
    return False

  if any(reject in normalized.lower() for reject in SHADE_REJECT_MARKERS):
    return False

  if any(blocked in normalized for blocked in PRODUCT_BLOCKLIST):
    return False

  if re.fullmatch(r"p\d{4}\s*[0-9a-z]+", normalized):
    return False

  if re.fullmatch(r"[0-9a-z]{5,}", normalized) and not re.search(r"[가-힣]", normalized):
    return False

  if re.fullmatch(r"\d+|[a-z]{1,2}", normalized):
    return False

  if normalized in {"신제품순", "판매순", "리뷰많은순", "평점순", "높은가격순", "낮은가격순"}:
    return False

  return bool(re.search(r"[가-힣a-z]", normalized))


def _shade_payload_from_name(raw: Any, *, source_type: str, confidence: float) -> dict[str, Any]:
  shade_number, shade_name = _parse_shade_name(raw)
  option_name = _squash(" ".join(part for part in [shade_number, shade_name] if part))
  color_family = _infer_by_rules(shade_name, COLOR_RULES)
  undertone = _infer_by_rules(shade_name, UNDERTONE_RULES_EXPLICIT)
  undertone_confidence = 0.72 if undertone else 0

  if not color_family and shade_number:
    code_match = re.match(r"([A-Z]{2,3})\d+", shade_number.upper())

    if code_match:
      color_family = SHADE_CODE_COLOR_PREFIXES.get(code_match.group(1))

  if not undertone:
    undertone = _infer_by_rules(shade_name, UNDERTONE_RULES_PROXY)
    undertone_confidence = 0.62 if undertone else 0

  return {
    "colorFamily": color_family,
    "confidence": round(confidence, 2),
    "optionName": option_name or shade_name,
    "shadeName": shade_name,
    "shadeNumber": shade_number,
    "sourceType": source_type,
    "undertone": undertone,
    "undertoneConfidence": undertone_confidence,
  }


def _merge_shade_options(options: list[dict[str, Any]]) -> list[dict[str, Any]]:
  seen: set[str] = set()
  merged: list[dict[str, Any]] = []

  for option in options:
    shade_name = str(option.get("shadeName") or option.get("optionName") or "")
    key = re.sub(r"\s+", "", _normalize_text(shade_name))

    if not key or key in seen:
      continue

    seen.add(key)
    merged.append(option)

  compact_names = [
    re.sub(r"\s+", "", _normalize_text(option.get("shadeName") or ""))
    for option in merged
  ]
  filtered: list[dict[str, Any]] = []

  for option, compact_name in zip(merged, compact_names):
    if compact_name in {re.sub(r"\s+", "", value.lower()) for value in GENERIC_COLOR_TOKENS} and any(
      compact_name in other and compact_name != other for other in compact_names
    ):
      continue

    filtered.append(option)

  return filtered[:40]


def _extract_shade_options(
  *,
  keywords: str,
  product_name: str,
  brand_aliases: tuple[str, ...],
) -> list[dict[str, Any]]:
  product_tokens = _tokens(product_name, brand_aliases)
  seen: set[str] = set()
  options: list[dict[str, Any]] = []

  for raw in [part.strip() for part in keywords.split(",") if part.strip()]:
    key = re.sub(r"\s+", "", _normalize_text(raw))

    if key in seen or not _plausible_shade_token(raw, product_tokens, brand_aliases):
      continue

    seen.add(key)
    color_family = _infer_by_rules(raw, COLOR_RULES)
    undertone = _infer_by_rules(raw, UNDERTONE_RULES_EXPLICIT)
    undertone_confidence = 0.72 if undertone else 0

    if not undertone:
      undertone = _infer_by_rules(raw, UNDERTONE_RULES_PROXY)
      undertone_confidence = 0.6 if undertone else 0

    options.append(
      {
        "colorFamily": color_family,
        "confidence": 0.8,
        "optionName": raw,
        "shadeName": raw,
        "shadeNumber": None,
        "sourceType": "official_brand_page_meta_keywords",
        "undertone": undertone,
        "undertoneConfidence": undertone_confidence,
      },
    )

  return _merge_shade_options(options)


def _extract_woocommerce_variation_options(
  *,
  page_text: str,
  product_name: str,
  brand_aliases: tuple[str, ...],
) -> list[dict[str, Any]]:
  product_tokens = _tokens(product_name, brand_aliases)
  options: list[dict[str, Any]] = []

  for match in re.finditer(r"data-product_variations=(['\"])(.*?)\1", page_text, flags=re.I | re.S):
    raw_json = html.unescape(match.group(2))

    try:
      variations = json.loads(raw_json)
    except json.JSONDecodeError:
      continue

    if not isinstance(variations, list):
      continue

    for variation in variations:
      if not isinstance(variation, dict):
        continue

      attributes = variation.get("attributes")

      if not isinstance(attributes, dict):
        continue

      for raw_value in attributes.values():
        cleaned = _clean_option_name(raw_value)

        if _plausible_structured_option(cleaned, product_tokens, brand_aliases):
          options.append(
            _shade_payload_from_name(
              cleaned,
              source_type="official_brand_page_option_json",
              confidence=0.82,
            ),
          )

  return _merge_shade_options(options)


def _iter_cafe24_option_values(value: Any) -> list[str]:
  values: list[str] = []

  if isinstance(value, dict):
    raw_original = value.get("option_value_orginal") or value.get("option_value_original")

    if isinstance(raw_original, list) and raw_original:
      values.append(str(raw_original[0]))
    elif isinstance(value.get("option_value"), str):
      values.append(str(value.get("option_value")))

    for child in value.values():
      values.extend(_iter_cafe24_option_values(child))

  elif isinstance(value, list):
    for child in value:
      values.extend(_iter_cafe24_option_values(child))

  return values


def _extract_cafe24_option_stock_options(
  *,
  page_text: str,
  product_name: str,
  brand_aliases: tuple[str, ...],
) -> list[dict[str, Any]]:
  product_tokens = _tokens(product_name, brand_aliases)
  options: list[dict[str, Any]] = []

  for match in re.finditer(r"option_stock_data\s*=\s*(['\"])(.*?)\1\s*;", page_text, flags=re.I | re.S):
    raw_json = html.unescape(match.group(2))

    try:
      option_data = json.loads(raw_json)
    except json.JSONDecodeError:
      continue

    for raw_value in _iter_cafe24_option_values(option_data):
      cleaned = _clean_option_name(raw_value)

      if _plausible_structured_option(cleaned, product_tokens, brand_aliases):
        options.append(
          _shade_payload_from_name(
            cleaned,
            source_type="official_brand_page_option_json",
            confidence=0.82,
          ),
        )

  return _merge_shade_options(options)


def _extract_hidden_color_text_options(
  *,
  page_text: str,
  product_name: str,
  brand_aliases: tuple[str, ...],
) -> list[dict[str, Any]]:
  product_tokens = _tokens(product_name, brand_aliases)
  options: list[dict[str, Any]] = []

  for match in re.finditer(
    r"id=['\"]colorText_[^'\"]+['\"][^>]*value=['\"]([^'\"]+)['\"]",
    page_text,
    flags=re.I | re.S,
  ):
    cleaned = _clean_option_name(match.group(1))

    if _plausible_structured_option(cleaned, product_tokens, brand_aliases):
      options.append(
        _shade_payload_from_name(
          cleaned,
          source_type="official_brand_page_option_html",
          confidence=0.82,
        ),
      )

  return _merge_shade_options(options)


def _extract_makeshop_option_values(
  *,
  page_text: str,
  product_name: str,
  brand_aliases: tuple[str, ...],
) -> list[dict[str, Any]]:
  product_tokens = _tokens(product_name, brand_aliases)
  options: list[dict[str, Any]] = []
  raw_values: list[tuple[str, bool]] = []

  for match in re.finditer(r"\b(?:opt_value|opt_values)\s*:\s*'([^']*)'", page_text, flags=re.I | re.S):
    raw_values.extend((part.strip(), True) for part in html.unescape(match.group(1)).split(",") if part.strip())

  for select_match in re.finditer(
    r"<select\b[^>]*id=['\"]m_color_select['\"][^>]*>(.*?)</select>",
    page_text,
    flags=re.I | re.S,
  ):
    raw_values.extend(
      (_plain_text_from_html(match.group(1)), True)
      for match in re.finditer(r"<option\b[^>]*>(.*?)</option>", select_match.group(1), flags=re.I | re.S)
    )

  for match in re.finditer(r"<option\b[^>]*(?:title|value)=['\"]([^'\"]+)['\"][^>]*>", page_text, flags=re.I | re.S):
    raw_values.append((html.unescape(match.group(1)), False))

  for match in re.finditer(r"<option\b[^>]*>(.*?)</option>", page_text, flags=re.I | re.S):
    raw_values.append((_plain_text_from_html(match.group(1)), False))

  for match in re.finditer(
    r"id=['\"][^'\"]+_optionnm['\"][^>]*value=['\"]([^'\"]+)['\"]",
    page_text,
    flags=re.I | re.S,
  ):
    raw_values.append((html.unescape(match.group(1)), True))

  seen: set[str] = set()

  for raw_value, trusted in raw_values:
    cleaned = _clean_option_name(raw_value)
    key = re.sub(r"\s+", "", _normalize_text(cleaned))

    if not key or key in seen:
      continue

    seen.add(key)

    if _plausible_structured_option(cleaned, product_tokens, brand_aliases) or (
      trusted and _plausible_trusted_structured_option(cleaned, product_tokens, brand_aliases)
    ):
      options.append(
        _shade_payload_from_name(
          cleaned,
          source_type="official_brand_page_option_html",
          confidence=0.82,
        ),
      )

  return _merge_shade_options(options)


def _extract_clubclio_option_data_options(
  *,
  page_text: str,
  product_name: str,
  brand_aliases: tuple[str, ...],
) -> list[dict[str, Any]]:
  product_tokens = _tokens(product_name, brand_aliases)
  options: list[dict[str, Any]] = []

  for match in re.finditer(r"var\s+devOptionData\s*=\s*", page_text):
    payload_start = match.end()
    brace_start = page_text.find("{", payload_start)

    if brace_start == -1:
      continue

    try:
      payload, _ = json.JSONDecoder().raw_decode(page_text[brace_start:])
    except json.JSONDecodeError:
      continue

    if not isinstance(payload, dict):
      continue

    for item in payload.get("options") or []:
      if not isinstance(item, dict):
        continue

      raw_value = item.get("option_div") or item.get("option_name") or ""

      for part in re.split(r"\s*,\s*", str(raw_value)):
        cleaned = _clean_option_name(part)

        if not cleaned:
          continue

        if _plausible_trusted_structured_option(cleaned, product_tokens, brand_aliases):
          options.append(
            _shade_payload_from_name(
              cleaned,
              source_type="official_brand_page_option_json",
              confidence=0.82,
            ),
          )

  return _merge_shade_options(options)


def _strip_product_name_from_offer(raw_name: str, product_name: str, brand_aliases: tuple[str, ...]) -> str:
  text = _squash(raw_name)
  names = [product_name]

  if " - " in product_name:
    names.append(product_name.split(" - ", 1)[0])

  for alias in brand_aliases:
    names.append(alias)

  for name in sorted({_squash(name) for name in names if _squash(name)}, key=len, reverse=True):
    text = re.sub(re.escape(name), " ", text, flags=re.I)

  text = re.sub(r"\bNAMING\.?\b", " ", text, flags=re.I)
  return _squash(text)


def _iter_jsonld_payloads(page_text: str) -> list[Any]:
  payloads: list[Any] = []

  for match in re.finditer(
    r"<script\b[^>]*type=['\"]application/ld\+json['\"][^>]*>(.*?)</script>",
    page_text,
    flags=re.I | re.S,
  ):
    raw_json = html.unescape(match.group(1).strip())

    try:
      payloads.append(json.loads(raw_json))
    except json.JSONDecodeError:
      continue

  return payloads


def _extract_jsonld_offer_options(
  *,
  page_text: str,
  product_name: str,
  brand_aliases: tuple[str, ...],
) -> list[dict[str, Any]]:
  product_tokens = _tokens(product_name, brand_aliases)
  options: list[dict[str, Any]] = []

  for payload in _iter_jsonld_payloads(page_text):
    candidates = payload if isinstance(payload, list) else [payload]

    for candidate in candidates:
      if not isinstance(candidate, dict):
        continue

      product_type = str(candidate.get("@type") or "").lower()

      if "product" not in product_type:
        continue

      offers = candidate.get("offers") or []

      if isinstance(offers, dict):
        offers = [offers]

      for offer in offers:
        if not isinstance(offer, dict):
          continue

        raw_offer_name = offer.get("name")

        if not isinstance(raw_offer_name, str):
          continue

        cleaned = _clean_option_name(
          _strip_product_name_from_offer(raw_offer_name, product_name, brand_aliases),
        )

        if not cleaned:
          continue

        if _plausible_trusted_structured_option(cleaned, product_tokens, brand_aliases):
          options.append(
            _shade_payload_from_name(
              cleaned,
              source_type="official_brand_page_option_json",
              confidence=0.82,
            ),
          )

  return _merge_shade_options(options)


def _extract_structured_option_shades(
  *,
  page_text: str,
  product_name: str,
  brand_aliases: tuple[str, ...],
) -> list[dict[str, Any]]:
  return _merge_shade_options(
    _extract_woocommerce_variation_options(
      page_text=page_text,
      product_name=product_name,
      brand_aliases=brand_aliases,
    )
    + _extract_cafe24_option_stock_options(
      page_text=page_text,
      product_name=product_name,
      brand_aliases=brand_aliases,
    )
    + _extract_hidden_color_text_options(
      page_text=page_text,
      product_name=product_name,
      brand_aliases=brand_aliases,
    )
    + _extract_makeshop_option_values(
      page_text=page_text,
      product_name=product_name,
      brand_aliases=brand_aliases,
    )
    + _extract_clubclio_option_data_options(
      page_text=page_text,
      product_name=product_name,
      brand_aliases=brand_aliases,
    )
    + _extract_jsonld_offer_options(
      page_text=page_text,
      product_name=product_name,
      brand_aliases=brand_aliases,
    ),
  )


def _extract_title_single_shade_options(
  *,
  title: str,
  product_name: str,
  brand_aliases: tuple[str, ...],
) -> list[dict[str, Any]]:
  normalized_title = _squash(title)

  if not normalized_title:
    return []

  lowered = normalized_title.lower()

  if re.search(r"\b\d{1,2}\s*[~-]\s*\d{1,2}\b", lowered) or "collection" in lowered:
    return []

  candidates: list[str] = []

  for pattern in (
    r"(?:^|[-#/])\s*(\d{1,3})\s+([A-Za-z][A-Za-z\s&]{2,32})$",
    r"(?:^|[-#/])\s*(\d{1,3})\s*호?\s*([가-힣A-Za-z][가-힣A-Za-z\s&]{1,32})$",
    r"#\s*(\d{1,3})\s*([가-힣A-Za-z][가-힣A-Za-z\s&]{1,32})",
  ):
    match = re.search(pattern, normalized_title, flags=re.I)

    if match:
      candidates.append(_squash(f"{match.group(1)} {match.group(2)}"))

  product_tokens = _tokens(product_name, brand_aliases)
  options: list[dict[str, Any]] = []

  for candidate in candidates:
    if _plausible_structured_option(candidate, product_tokens, brand_aliases):
      options.append(
        _shade_payload_from_name(
          candidate,
          source_type="official_brand_page_title",
          confidence=0.74,
        ),
      )

  return _merge_shade_options(options)


def _extract_made_in_country(page_text: str) -> tuple[str | None, str]:
  plain_text = _plain_text_from_html(page_text)
  country_pattern = (
    r"대한민국|한국|국내|Korea|South Korea|중국|China|일본|Japan|이탈리아|Italy|프랑스|France|미국|USA|United States"
  )
  match = re.search(
    rf"(제조국|제조\s*국가|원산지)\s*[:：]?\s*({country_pattern})",
    plain_text,
    flags=re.I,
  )

  if not match:
    match = re.search(
      r"(제조사\s*/\s*제조국\s*/\s*제조판매업자|제조사.{0,40}?제조국.{0,40}?).{0,120}?"
      rf"({country_pattern})",
      plain_text,
      flags=re.I,
    )

  if not match:
    match = re.search(
      rf"(COUNTRY\s+OF\s+MANUFACTURE|Country\s+of\s+manufacture|Made\s+in)\s*[:：]?\s*({country_pattern})",
      plain_text,
      flags=re.I,
    )

  if not match:
    return None, ""

  raw_country = _squash(match.group(2))
  normalized = COUNTRY_NORMALIZATION.get(raw_country.lower()) or COUNTRY_NORMALIZATION.get(raw_country) or raw_country
  return normalized, _squash(f"{match.group(1)} {raw_country}")


def _extract_inline_product_name(page_text: str) -> str:
  patterns = (
    r'"sname"\s*:\s*"([^"]+)"',
    r"'sname'\s*:\s*'([^']+)'",
    r"sname\s*:\s*['\"]([^'\"]+)['\"]",
    r"<h[1-3][^>]*>\s*([^<]{3,80})\s*</h[1-3]>",
  )

  for pattern in patterns:
    match = re.search(pattern, page_text, flags=re.I | re.S)

    if match:
      return _squash(html.unescape(match.group(1)))

  return ""


def _field_payload(
  value: Any,
  confidence: float,
  raw_text: str,
  source_url: str,
  *,
  source_type: str = "official_brand_page",
) -> dict[str, Any]:
  return {
    "confidence": round(confidence, 2),
    "rawText": _short(raw_text),
    "sourceType": source_type,
    "sourceUrl": source_url,
    "value": value,
  }


def _aggregate_from_options(options: list[dict[str, Any]], key: str) -> tuple[Any, float]:
  values = [option.get(key) for option in options if option.get(key)]

  if not values:
    return None, 0

  value, count = Counter(values).most_common(1)[0]
  coverage = count / max(1, len(options))

  if key == "undertone":
    confidences = [
      float(option.get("undertoneConfidence") or 0)
      for option in options
      if option.get("undertone") == value
    ]
    confidence = max(confidences or [0])
  else:
    confidence = 0.68 if coverage >= 0.35 else 0.62

  return value, confidence


def _contains_compact(text: str, phrase: str) -> bool:
  return re.sub(r"\s+", "", phrase.lower()) in re.sub(r"\s+", "", text.lower())


PRODUCT_LINE_GROUPS = (
  ("피팅블러", "블러벨벳", "글레이즈", "메탈세럼", "시스루", "글로우래스팅"),
  ("아이코어", "리얼아이팔레트", "애교살"),
  ("블러웨어", "톤페어링", "컬러피스", "아티스트쿠션블러쉬"),
  ("크리스탈글램밤", "크리스탈글램틴트", "볼륨메이트", "무드블러밤"),
  ("에센셜립치크", "에센셜블러쉬", "선샤인치크", "글림온치크"),
  ("프로싱글섀도우", "소프트블렌딩", "프로아이팔레트", "뮤즈마스터", "쉐이드앤섀도우", "에센셜섀도우"),
  ("잉크무드글로이", "오버블러", "잉크더에어리벨벳", "잉크에어리벨벳", "무드글로이"),
  ("블러리톡치크", "시럽피톡치크", "톡블러쉬키캡", "맑게물든선샤인치크"),
  ("잉크포켓", "올테이크무드라이크", "올테이크무드", "무드인쉐이드"),
)


def _score_match_text(row: dict[str, Any], candidate_text: str, brand_aliases: tuple[str, ...]) -> float:
  row_text = _normalize_text(row.get("productName"))
  url_text = _normalize_text(candidate_text)
  row_tokens = _tokens(row.get("productName"), brand_aliases, blocklist=URL_MATCH_BLOCKLIST)
  url_tokens = _tokens(candidate_text, brand_aliases, blocklist=URL_MATCH_BLOCKLIST)

  if not row_tokens or not url_tokens:
    return 0

  overlap = len(row_tokens & url_tokens)
  union = len(row_tokens | url_tokens)
  score = overlap / union

  if overlap >= 2:
    score += 0.25

  if row.get("category") == "lip" and any(token in url_tokens for token in {"틴트", "립스틱", "글로스", "립", "gloss", "tint"}):
    score += 0.08

  if row.get("category") == "cheek" and any(token in url_tokens for token in {"치크", "블러쉬", "블러셔"}):
    score += 0.08

  if row.get("category") == "shadow" and any(token in url_tokens for token in {"아이", "섀도우", "팔레트"}):
    score += 0.08

  for product_type in ("틴트", "글로스", "립스틱", "블러쉬", "블러셔", "섀도우", "팔레트"):
    if product_type in row_text and product_type in url_text:
      score += 0.08

  if "틴트" in row_text and "글로스" in url_text and "틴트" not in url_text:
    score -= 0.18

  if "글로스" in row_text and "틴트" in url_text and "글로스" not in url_text:
    score -= 0.18

  if any(marker in url_text for marker in ("케이스", "공용기", "브러쉬", "브러시")) and not any(
    marker in row_text for marker in ("케이스", "공용기", "브러쉬", "브러시")
  ):
    score -= 0.28

  for line_group in PRODUCT_LINE_GROUPS:
    row_lines = [line for line in line_group if _contains_compact(row_text, line)]
    candidate_lines = [line for line in line_group if _contains_compact(url_text, line)]

    if row_lines and candidate_lines and not set(row_lines) & set(candidate_lines):
      score -= 0.45
    elif row_lines and not candidate_lines:
      score -= 0.28

  return round(score, 3)


def _score_match(row: dict[str, Any], url: str, brand_aliases: tuple[str, ...]) -> float:
  return _score_match_text(row, urllib.parse.unquote(url), brand_aliases)


def _best_url_match(row: dict[str, Any], urls: list[str], brand_aliases: tuple[str, ...]) -> tuple[str, float]:
  scored = sorted(
    ((_score_match(row, url, brand_aliases), url) for url in urls),
    reverse=True,
  )

  if not scored or scored[0][0] < 0.42:
    return "", scored[0][0] if scored else 0

  return scored[0][1], scored[0][0]


def _best_entry_match(
  row: dict[str, Any],
  entries: list[dict[str, Any]],
  brand_aliases: tuple[str, ...],
) -> tuple[dict[str, Any] | None, float]:
  scored = sorted(
    (
      (_score_match_text(row, str(entry.get("matchText") or entry.get("url") or ""), brand_aliases), entry)
      for entry in entries
    ),
    key=lambda item: item[0],
    reverse=True,
  )

  if not scored or scored[0][0] < 0.42:
    return None, scored[0][0] if scored else 0

  return scored[0][1], scored[0][0]


def _parse_official_page(
  row: dict[str, Any],
  *,
  page_text: str,
  source_url: str,
  brand_aliases: tuple[str, ...],
  match_score: float,
  fetched_at: str,
) -> dict[str, Any]:
  meta = _extract_meta_content(
    page_text,
    ("keywords", "og:title", "og:description", "description", "product:price:amount"),
  )
  inline_product_name = _extract_inline_product_name(page_text)
  jsonld_product_name = _extract_jsonld_product_name(page_text)
  official_name = _first_specific_name(
    meta.get("og:title"),
    jsonld_product_name,
    inline_product_name,
    meta.get("title"),
    fallback=urllib.parse.unquote(source_url),
  )
  keywords = meta.get("keywords") or ""
  plain_text = _plain_text_from_html(page_text)
  base_evidence_hint = _squash(" ".join([official_name, keywords]))
  evidence_text = " ".join(
    part
    for part in [
      official_name,
      keywords,
      meta.get("og:description") or meta.get("description") or "",
      jsonld_product_name,
      inline_product_name,
      plain_text[:1600] if len(base_evidence_hint) < 40 else "",
    ]
    if part
  )
  keyword_shade_options = _extract_shade_options(
    keywords=keywords,
    product_name=f"{official_name} {row.get('productName') or ''}",
    brand_aliases=brand_aliases,
  )
  structured_shade_options = _extract_structured_option_shades(
    page_text=page_text,
    product_name=f"{official_name} {row.get('productName') or ''}",
    brand_aliases=brand_aliases,
  )
  title_shade_options = _extract_title_single_shade_options(
    title=official_name,
    product_name=f"{official_name} {row.get('productName') or ''}",
    brand_aliases=brand_aliases,
  )
  shade_options = _merge_shade_options(structured_shade_options + keyword_shade_options + title_shade_options)
  fields: dict[str, Any] = {}

  if shade_options:
    shade_source_type = (
      str(Counter(str(option.get("sourceType") or "official_brand_page_option_json") for option in structured_shade_options).most_common(1)[0][0])
      if structured_shade_options
      else "official_brand_page_title"
      if title_shade_options
      else "official_brand_page_meta_keywords"
    )
    fields["shadeOptions"] = _field_payload(
      shade_options,
      0.82 if structured_shade_options else 0.74 if title_shade_options else 0.8,
      ", ".join(str(option.get("optionName") or "") for option in shade_options[:16]),
      source_url,
      source_type=shade_source_type,
    )

  color_family, color_confidence = _aggregate_from_options(shade_options, "colorFamily")

  if color_family:
    fields["colorFamily"] = _field_payload(
      color_family,
      color_confidence,
      ", ".join(str(option.get("optionName") or "") for option in shade_options[:16]),
      source_url,
      source_type=shade_source_type if shade_options else "official_brand_page",
    )

  undertone, undertone_confidence = _aggregate_from_options(shade_options, "undertone")

  if undertone:
    fields["undertone"] = _field_payload(
      undertone,
      undertone_confidence,
      ", ".join(str(option.get("optionName") or "") for option in shade_options[:16]),
      source_url,
      source_type=shade_source_type if shade_options else "official_brand_page",
    )

  for field, rules, confidence in (
    ("finish", FINISH_RULES, 0.72),
    ("texture", TEXTURE_RULES, 0.72),
    ("intensity", INTENSITY_RULES, 0.62),
  ):
    value = _infer_by_rules(evidence_text, rules)

    if value:
      fields[field] = _field_payload(value, confidence, evidence_text, source_url)

  selling_points = _collect_tags(evidence_text, SELLING_POINT_RULES)

  if selling_points:
    fields["sellingPoints"] = _field_payload(selling_points, 0.7, evidence_text, source_url)

  suitable_for = _collect_tags(evidence_text, SUITABLE_FOR_RULES)

  if suitable_for:
    fields["suitableFor"] = _field_payload(suitable_for, 0.7, evidence_text, source_url)

  made_in_country, made_in_country_raw = _extract_made_in_country(page_text)

  if made_in_country:
    fields["madeInCountry"] = _field_payload(
      made_in_country,
      0.72,
      made_in_country_raw,
      source_url,
      source_type="official_brand_page_product_info",
    )

  return {
    "brand": row.get("brand"),
    "candidateId": row.get("candidateId"),
    "collectionStatus": "collected_partial" if fields else "not_found",
    "collectorVersion": COLLECTOR_VERSION,
    "category": row.get("category"),
    "fetchedAt": fetched_at,
    "fields": fields,
    "matchScore": match_score,
    "officialProductName": official_name,
    "officialSourceUrl": source_url,
    "productName": row.get("productName"),
    "rawStored": False,
  }


def _match_text_from_page(page_text: str, fallback_url: str) -> str:
  meta = _extract_meta_content(
    page_text,
    ("keywords", "og:title", "og:description", "description", "title"),
  )
  focused_parts = [
    meta.get("og:title"),
    _extract_jsonld_product_name(page_text),
    _extract_inline_product_name(page_text),
    meta.get("title"),
  ]
  focused_text = _squash(" ".join(part for part in focused_parts if part))

  if focused_text:
    return focused_text

  parts = [
    meta.get("keywords"),
    meta.get("og:description"),
    meta.get("description"),
  ]
  return _squash(" ".join(part for part in parts if part)) or urllib.parse.unquote(fallback_url)


def _metadata_payload_strength(value: Any) -> int:
  if isinstance(value, list):
    return len(value)

  if isinstance(value, dict):
    return len(value)

  return 1 if value not in (None, "", []) else 0


def _metadata_row_quality(row: dict[str, Any]) -> tuple[int, int, float, float, int]:
  fields = row.get("fields") if isinstance(row.get("fields"), dict) else {}
  field_count = len(fields)
  payload_strength = sum(
    _metadata_payload_strength(payload.get("value") if isinstance(payload, dict) else None)
    for payload in fields.values()
  )
  confidence_sum = sum(
    float(payload.get("confidence") or 0)
    for payload in fields.values()
    if isinstance(payload, dict)
  )
  match_score = float(row.get("matchScore") or 0)
  status_rank = {
    "collected_partial": 2,
    "not_found": 1,
    "blocked": 0,
  }.get(str(row.get("collectionStatus") or ""), 0)
  return field_count, payload_strength, confidence_sum, match_score, status_rank


def _merge_metadata_rows_preserving_best(
  existing_rows: list[dict[str, Any]],
  refreshed_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
  merged: dict[str, dict[str, Any]] = {}

  for row in existing_rows + refreshed_rows:
    candidate_id = str(row.get("candidateId") or "")

    if not candidate_id:
      continue

    current = merged.get(candidate_id)

    if current is None or _metadata_row_quality(row) >= _metadata_row_quality(current):
      merged[candidate_id] = row

  return list(merged.values())


def collect_official_metadata(
  *,
  limited_results_path: Path,
  output_path: Path,
  report_path: Path,
  brands: set[str],
  max_rows_per_brand: int,
  timeout_seconds: float,
  user_agent: str,
  fetched_at: str,
  merge_existing: bool,
  skip_existing_with_fields: bool,
) -> dict[str, Any]:
  rows = _read_jsonl(limited_results_path)
  outputs: list[dict[str, Any]] = []
  existing_with_fields: set[str] = set()

  if skip_existing_with_fields and output_path.exists():
    existing_with_fields = {
      str(row.get("candidateId") or "")
      for row in _read_jsonl(output_path)
      if isinstance(row.get("fields"), dict) and row.get("fields")
    }
  report: dict[str, Any] = {
    "brands": {},
    "inputRows": len(rows),
    "limitedResultsPath": str(limited_results_path),
  }
  title_index_cache: dict[str, list[dict[str, Any]]] = {}

  for brand, source in OFFICIAL_SOURCES.items():
    if brands and brand not in brands:
      continue

    brand_rows = [
      row
      for row in rows
      if row.get("brand") == brand
      and str(row.get("candidateId") or "") not in existing_with_fields
    ]
    brand_rows = sorted(brand_rows, key=lambda row: -float(row.get("priorityScore") or 0))[:max_rows_per_brand]

    if not brand_rows:
      continue

    sitemap_text, sitemap_fetch = _fetch_text(
      source["sitemapUrl"],
      timeout_seconds=timeout_seconds,
      user_agent=user_agent,
    )
    product_entries, child_sitemap_fetches = _discover_sitemap_product_entries(
      sitemap_text,
      source=source,
      source_url=source["sitemapUrl"],
      timeout_seconds=timeout_seconds,
      user_agent=user_agent,
    ) if sitemap_text else ([], [])

    extra_index_fetches: list[dict[str, Any]] = []

    for extra_index_url in source.get("extraIndexUrls", ()):
      extra_text, extra_fetch = _fetch_text(
        extra_index_url,
        timeout_seconds=timeout_seconds,
        user_agent=user_agent,
      )
      extra_index_fetches.append({"indexUrl": extra_index_url, "fetch": extra_fetch})

      if not extra_text:
        continue

      extra_entries, extra_child_fetches = _discover_sitemap_product_entries(
        extra_text,
        source=source,
        source_url=extra_index_url,
        timeout_seconds=timeout_seconds,
        user_agent=user_agent,
      )
      product_entries.extend(extra_entries)
      child_sitemap_fetches.extend(extra_child_fetches)

    for extra_index_url in source.get("extraHtmlIndexUrls", ()):
      extra_text, extra_fetch = _fetch_text(
        extra_index_url,
        timeout_seconds=timeout_seconds,
        user_agent=user_agent,
      )
      extra_index_fetches.append({"indexUrl": extra_index_url, "fetch": extra_fetch})

      if not extra_text:
        continue

      product_entries.extend(
        _extract_html_product_entries(extra_text, base_url=extra_index_url, source=source),
      )

    product_entries = _dedupe_product_entries(product_entries)
    product_urls = [str(entry.get("url") or "") for entry in product_entries]
    brand_report = {
      "candidateRows": len(brand_rows),
      "childSitemaps": len(child_sitemap_fetches),
      "collected": 0,
      "extraIndexes": len(extra_index_fetches),
      "fetch": sitemap_fetch,
      "indexedUrls": 0,
      "matched": 0,
      "productUrls": len(product_urls),
      "sitemapUrl": source["sitemapUrl"],
    }

    if not product_urls:
      report["brands"][brand] = brand_report
      continue

    last_fetch_at = 0.0

    if source.get("titleIndex"):
      cache_key = json.dumps(
        {
          "sitemapUrl": source.get("sitemapUrl"),
          "extraHtmlIndexUrls": source.get("extraHtmlIndexUrls", ()),
          "extraIndexUrls": source.get("extraIndexUrls", ()),
          "urlRewrites": source.get("urlRewrites", ()),
        },
        ensure_ascii=False,
        sort_keys=True,
      )

      if cache_key in title_index_cache:
        product_entries = title_index_cache[cache_key]
        brand_report["indexedUrls"] = len(product_entries)
      else:
        product_entries = []

        for product_url in product_urls:
          elapsed = time.monotonic() - last_fetch_at
          delay = float(source["delaySeconds"])

          if elapsed < delay:
            time.sleep(delay - elapsed)

          page_text, page_fetch = _fetch_text(
            product_url,
            timeout_seconds=timeout_seconds,
            user_agent=user_agent,
          )
          last_fetch_at = time.monotonic()

          if not page_text:
            continue

          product_entries.append(
            {
              "fetchSummary": page_fetch,
              "matchText": _match_text_from_page(page_text, product_url),
              "pageText": page_text,
              "url": product_url,
            },
          )

        title_index_cache[cache_key] = product_entries
        brand_report["indexedUrls"] = len(product_entries)

    for row in brand_rows:
      official_entry, match_score = _best_entry_match(row, product_entries, source["brandAliases"])
      official_url = str((official_entry or {}).get("url") or "")

      if not official_url:
        outputs.append(
          {
            "brand": brand,
            "candidateId": row.get("candidateId"),
            "collectionStatus": "not_found",
            "collectorVersion": COLLECTOR_VERSION,
            "fetchedAt": fetched_at,
            "fields": {},
            "matchScore": match_score,
            "officialSourceUrl": None,
            "productName": row.get("productName"),
            "rawStored": False,
          },
        )
        continue

      brand_report["matched"] += 1
      page_text = str((official_entry or {}).get("pageText") or "")
      page_fetch = (official_entry or {}).get("fetchSummary") or {}

      if not page_text:
        elapsed = time.monotonic() - last_fetch_at
        delay = float(source["delaySeconds"])

        if elapsed < delay:
          time.sleep(delay - elapsed)

        page_text, page_fetch = _fetch_text(
          official_url,
          timeout_seconds=timeout_seconds,
          user_agent=user_agent,
        )
        last_fetch_at = time.monotonic()

      if not page_text:
        outputs.append(
          {
            "brand": brand,
            "candidateId": row.get("candidateId"),
            "collectionStatus": "blocked",
            "collectorVersion": COLLECTOR_VERSION,
            "fetchSummary": page_fetch,
            "fields": {},
            "fetchedAt": fetched_at,
            "matchScore": match_score,
            "officialSourceUrl": official_url,
            "productName": row.get("productName"),
            "rawStored": False,
          },
        )
        continue

      option_text, option_fetch = _fetch_option_data_for_source(
        source,
        official_url,
        timeout_seconds=timeout_seconds,
        user_agent=user_agent,
      )

      if option_fetch:
        page_fetch = {**page_fetch, "optionDataFetch": option_fetch}

      if option_text:
        page_text = f"{page_text}\n{option_text}"

      parsed = _parse_official_page(
        row,
        page_text=page_text,
        source_url=official_url,
        brand_aliases=source["brandAliases"],
        match_score=match_score,
        fetched_at=fetched_at,
      )
      parsed["fetchSummary"] = page_fetch
      outputs.append(parsed)

      if parsed["fields"]:
        brand_report["collected"] += 1

    report["brands"][brand] = brand_report

  if merge_existing and output_path.exists():
    outputs = _merge_metadata_rows_preserving_best(_read_jsonl(output_path), outputs)

  outputs = sorted(
    outputs,
    key=lambda row: (str(row.get("brand") or ""), str(row.get("category") or ""), str(row.get("productName") or "")),
  )

  _write_jsonl(output_path, outputs)
  _write_report(report_path, output_path, report, outputs)

  return {
    "brands": report["brands"],
    "output": str(output_path.resolve().relative_to(REPO_ROOT)),
    "report": str(report_path.resolve().relative_to(REPO_ROOT)),
    "rows": len(outputs),
    "withFields": sum(1 for row in outputs if row.get("fields")),
  }


def _write_report(
  report_path: Path,
  output_path: Path,
  report: dict[str, Any],
  rows: list[dict[str, Any]],
) -> None:
  report_path.parent.mkdir(parents=True, exist_ok=True)
  status_counts = Counter(str(row.get("collectionStatus")) for row in rows)
  field_counts = Counter(
    field
    for row in rows
    for field in (row.get("fields") or {})
  )
  brand_counts = Counter(str(row.get("brand") or "") for row in rows)
  brand_with_fields = Counter(str(row.get("brand") or "") for row in rows if row.get("fields"))
  lines = [
    "# Auradin Official Metadata Collection",
    "",
    f"- Output: `{output_path}`",
    f"- Rows: {len(rows)}",
    f"- Rows with fields: {sum(1 for row in rows if row.get('fields'))}",
    f"- Collection status: `{json.dumps(dict(sorted(status_counts.items())), ensure_ascii=False)}`",
    f"- Field counts: `{json.dumps(dict(sorted(field_counts.items())), ensure_ascii=False)}`",
    "",
    "## Output Brand Rows",
    "",
    "| Brand | Rows | Rows with fields |",
    "|---|---:|---:|",
  ]

  for brand, count in sorted(brand_counts.items()):
    lines.append(f"| {brand} | {count} | {brand_with_fields.get(brand, 0)} |")

  lines.extend(
    [
      "",
      "## Current Run Source Attempts",
      "",
      "This section lists only the sources attempted in the latest collector run. Output rows may also include preserved rows from `--merge-existing`.",
      "",
    ],
  )

  for brand, brand_report in report.get("brands", {}).items():
    lines.extend(
      [
        f"### {brand}",
        "",
        f"- Sitemap: `{brand_report.get('sitemapUrl')}`",
        f"- Child sitemaps fetched: {brand_report.get('childSitemaps', 0)}",
        f"- Extra index pages fetched: {brand_report.get('extraIndexes', 0)}",
        f"- Product URLs discovered: {brand_report.get('productUrls')}",
        f"- Product URLs title-indexed: {brand_report.get('indexedUrls', 0)}",
        f"- Candidate rows: {brand_report.get('candidateRows')}",
        f"- Matched rows: {brand_report.get('matched')}",
        f"- Collected rows: {brand_report.get('collected')}",
        "",
      ],
    )

  lines.extend(
    [
      "## Safety Notes",
      "",
      "- Official product pages and sitemaps were parsed in memory only.",
      "- Raw HTML, raw reviews, ingredients, and product images were not stored.",
      "- Board/review/member/admin/API paths were not fetched.",
      "- Values from official keyword metadata are still stored with confidence and evidence, not as unconditional truth.",
    ],
  )
  report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Collect limited Auradin metadata from official brand sitemaps and public product pages.",
  )
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument("--limited-results", type=Path)
  parser.add_argument("--output", type=Path)
  parser.add_argument("--report", type=Path)
  parser.add_argument("--brands", default="롬앤,뮤드,라카,네이밍,에뛰드,에스쁘아,투쿨포스쿨,하트퍼센트,데이지크,더샘,3CE,VDL,클리오,페리페라,정샘물 뷰티")
  parser.add_argument("--max-rows-per-brand", type=int, default=15)
  parser.add_argument("--merge-existing", action="store_true")
  parser.add_argument("--skip-existing-with-fields", action="store_true")
  parser.add_argument("--timeout-seconds", type=float, default=20.0)
  parser.add_argument(
    "--user-agent",
    default="AuradinCatalogResearchBot/1.0 (+https://local.dev/aura; limited metadata audit; no raw HTML storage)",
  )
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  limited_results_path = (
    args.limited_results
    or REPO_ROOT / "data" / "auradin" / "detail" / "normalized" / f"limited_detail_results_{args.date}.jsonl"
  )
  output_path = (
    args.output
    or REPO_ROOT / "data" / "auradin" / "detail" / "official" / f"official_metadata_{args.date}.jsonl"
  )
  report_path = (
    args.report
    or REPO_ROOT / "reports" / "auradin" / f"official_metadata_collection_{args.date}.md"
  )
  brands = {brand.strip() for brand in args.brands.split(",") if brand.strip()}
  result = collect_official_metadata(
    limited_results_path=limited_results_path,
    output_path=output_path,
    report_path=report_path,
    brands=brands,
    max_rows_per_brand=args.max_rows_per_brand,
    timeout_seconds=args.timeout_seconds,
    user_agent=args.user_agent,
    fetched_at=_default_fetched_at(args.date),
    merge_existing=args.merge_existing,
    skip_existing_with_fields=args.skip_existing_with_fields,
  )
  print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
