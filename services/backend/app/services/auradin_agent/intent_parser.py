"""§3 의도 파서 — 결정론 룰 (M1 Stage 1 / A7·F10).

원칙: **모르면 하드를 만들지 않는다.** 가격은 방향 표현이 확인될 때만 hard filter가 되고,
부정("말고/빼고/싫어")은 절 단위 스팬으로 분리해 avoid로만 반영한다. 하드 필터의 유일한
생산자는 이 파서이며(RFC 계약), 여기서 소비된 스팬·부정 스팬은 시맨틱 질의에서 제외된다.
"""

from __future__ import annotations

import re
from typing import Any


SUPPORTED_CATEGORIES = {"lip", "cheek", "shadow", "base", "brow", "liner"}

# 색조/베이스 6종이 AURADIN 서빙 범위. 그 밖(네일·향수·스킨케어·헤어)은 조용히 넓히지 않고 안내한다(§9).
OUT_OF_SCOPE_TERMS = {
  "nail": ("네일", "매니큐어", "젤네일", "nail"),
  "perfume": ("향수", "퍼퓸", "오드퍼퓸", "오드뚜왈렛", "fragrance", "perfume"),
  "skincare": ("스킨케어", "토너", "세럼", "앰플", "선크림", "클렌징", "skincare", "toner", "serum"),
  "hair": ("샴푸", "헤어", "트리트먼트", "린스", "hair", "shampoo"),
}

CATEGORY_TERMS = {
  "lip": ("립", "틴트", "립스틱", "글로스", "입술", "lip", "tint", "gloss"),
  "cheek": ("블러셔", "블러쉬", "치크", "볼터치", "blush", "cheek"),
  # 글리터/반짝/스파클은 아이섀도우 의도로 해석한다 (완료정의: shadow로 잠금).
  # 카테고리 잠금은 완화가 아니라 추론이므로 §9 위배 아님 — caveat로 투명하게 노출.
  "shadow": ("섀도우", "쉐도우", "아이섀도", "아이섀도우", "팔레트", "글리터", "반짝", "스파클", "shadow", "palette", "glitter", "sparkle"),
  "base": ("베이스", "쿠션", "파운데이션", "파데", "foundation", "cushion", "base"),
  "brow": ("브로우", "아이브로우", "눈썹", "brow", "eyebrow"),
  "liner": ("아이라이너", "라이너", "아이라인", "liner", "eyeliner"),
}

COLOR_TERMS = {
  "pink": ("핑크", "pink"),
  "rose": ("로즈", "rose"),
  "coral": ("코랄", "coral", "자몽"),
  "red": ("레드", "red", "체리"),
  "orange": ("오렌지", "orange"),
  "mauve": ("모브", "mauve", "뮤트"),
  "brown": ("브라운", "brown", "라떼"),
  "nude": ("누드", "nude", "베이지"),
  "peach": ("피치", "peach", "살구"),
  "burgundy": ("버건디", "burgundy"),
  # data 카논은 "plum"(35개), "burgundy"는 0개 — 플럼/베리/와인은 plum으로 정렬해야 매칭된다.
  "plum": ("플럼", "plum", "베리", "berry", "와인", "wine"),
}

FINISH_TERMS = {
  "glossy": ("글로시", "광택", "촉촉", "물먹", "탕후루", "gloss", "glossy"),
  "matte": ("매트", "보송", "matte"),
  "velvet": ("벨벳", "블러", "velvet", "blur"),
  "satin": ("새틴", "satin"),
  "shimmer": ("쉬머", "펄", "은은한 펄", "글리터", "반짝", "스파클", "shimmer", "pearl", "glitter", "sparkle"),
}

TEXTURE_TERMS = {
  "tint": ("틴트", "tint"),
  "balm": ("밤", "balm"),
  "gloss": ("글로스", "gloss"),
  "cream": ("크림", "cream"),
  "powder": ("파우더", "powder"),
  "liquid": ("리퀴드", "liquid"),
  "palette": ("팔레트", "palette"),
}

UNDERTONE_TERMS = {
  "cool": ("쿨톤", "쿨", "cool"),
  "warm": ("웜톤", "웜", "warm"),
  "neutral": ("뉴트럴", "neutral"),
}

INTENSITY_TERMS = {
  "sheer": (
    "진하지 않은",
    "진하지 않게",
    "진하지",
    "은은하게",
    "은은한",
    "은은",
    "자연스러운",
    "자연",
    "맑은",
    "맑",
    "시어",
    "연한",
    "sheer",
    "light",
  ),
  "medium": ("데일리", "daily", "무난"),
  "bold": ("고발색", "선명", "강한", "딥", "bold", "deep"),
}

OCCASION_TERMS = {
  "daily": ("데일리", "매일", "daily"),
  "interview": ("면접", "출근", "오피스", "interview", "office"),
}

SOFT_ATTRIBUTE_TERMS: dict[str, dict[str, tuple[str, ...]]] = {
  "colorFamily": COLOR_TERMS,
  "undertone": UNDERTONE_TERMS,
  "finish": FINISH_TERMS,
  "texture": TEXTURE_TERMS,
  "intensity": INTENSITY_TERMS,
  "occasion": OCCASION_TERMS,
}
SOFT_ATTRIBUTE_WEIGHTS = {
  "colorFamily": 0.9,
  "undertone": 0.6,
  "finish": 0.9,
  "texture": 0.75,
  "intensity": 0.7,
  "occasion": 0.65,
}

# ---------------------------------------------------------------- 부정 스팬

# 이중부정은 avoid도 positive도 아닌 중립 — 절째 제거한다 ("매트는 안 싫고" → 매트 중립).
_DOUBLE_NEGATION = re.compile(r"(\S+[은는이가도도]?\s*)?(안\s*싫\S*|싫지\s*않\S*|제외하지\s*않\S*|빼지\s*않\S*)")
# 부정 마커 — 마커 직전 절이 negated span이 된다.
_NEGATION_MARKER = re.compile(r"(말고는|말고|빼고|제외하고|제외|싫어요|싫어|싫고|싫은데|싫음|안\s*좋아\S*)")
_CLAUSE_BOUNDARY = re.compile(r"[,.!?]|그리고|이면서|인데")
# "A 말고는 다 싫어/괜찮아" — 같은 '말고'가 정반대 의미인 역쌍 (Codex 리뷰 회귀 케이스)
_EXCEPT_ALL_DISLIKE = re.compile(
  r"(\S+)\s*말고는\s*(?:다|전부|모두)\s*"
  r"(?:싫(?:어(?:요)?|다)?|별로(?:야|예요)?|안\s*좋(?:아|다)?)",
)
_EXCEPT_ALL_OK = re.compile(
  r"(\S+)\s*말고는\s*(?:다|전부|모두)\s*"
  r"(?:괜찮(?:아(?:요)?|다)?|좋(?:아(?:요)?|다)?)",
)
_ALTERNATIVE_HINTS = ("다른", "딴")


def split_negation_spans(text: str) -> dict[str, Any]:
  """원문을 positive/negated 스팬으로 분해한다.

  반환: {"positive": str, "negated": [str], "onlyPositive": str|None,
          "onlyAvoid": str|None}
  onlyPositive는 "A 말고는 다 싫어"(=A만 원함) 특례의 A.
  onlyAvoid는 "A 말고는 다 괜찮아"(=A만 피함) 특례의 A.
  """
  working = str(text or "")

  only_positive: str | None = None
  match = _EXCEPT_ALL_DISLIKE.search(working)
  if match:
    only_positive = match.group(1)
    working = working.replace(match.group(0), " ")

  only_avoid: str | None = None
  except_all_ok = _EXCEPT_ALL_OK.search(working)
  if except_all_ok:
    # "A 말고는 다 괜찮아" = A만 피함
    only_avoid = except_all_ok.group(1)
    negated_seed = [only_avoid]
    working = working.replace(except_all_ok.group(0), " ")
  else:
    negated_seed = []

  # 이중부정 중립화 — 절째 제거 (avoid도 positive도 아님)
  working = _DOUBLE_NEGATION.sub(" ", working)

  negated: list[str] = list(negated_seed)
  positive_parts: list[str] = []
  cursor = 0
  for marker in _NEGATION_MARKER.finditer(working):
    clause = working[cursor:marker.start()]
    # 절 경계 이후만 negated — 경계 앞은 positive로 보존
    boundary = None
    for b in _CLAUSE_BOUNDARY.finditer(clause):
      boundary = b
    if boundary is not None:
      positive_parts.append(clause[: boundary.end()])
      negated.append(clause[boundary.end():])
    else:
      negated.append(clause)
    cursor = marker.end()
  positive_parts.append(working[cursor:])
  positive = " ".join(part.strip() for part in positive_parts if part.strip())
  return {
    "positive": positive,
    "negated": [span.strip() for span in negated if span.strip()],
    "onlyPositive": only_positive,
    "onlyAvoid": only_avoid,
  }


# ---------------------------------------------------------------- 가격 문법

_PRICE_OR_MARKERS = ("거나", "또는", "둘 중", "도 괜찮고", "아니면", "혹은")

# 방향 어휘 — 순서 중요: 긴 표현 먼저 (부정 보수 판정은 별도)
_DIRECTION_PATTERNS: tuple[tuple[str, str], ...] = (
  (r"안\s*넘(?:는|게|도록)?|넘지\s*않(?:게|도록)?", "lte"),
  (r"이하|까지|안쪽|이내|안으로|언더|under", "lte"),
  (r"최대", "lte"),
  (r"보다\s*(?:싸(?:게|도록)?|저렴(?:하게)?)", "lt"),
  (r"미만", "lt"),
  (r"이상|부터", "gte"),
  (r"최소|적어도", "gte"),
  (r"초과|넘(?:는|게|어)|보다\s*비싼|보다\s*비싸(?:게|도록)?", "gt"),
)
# 방향 뒤 짧은 창의 부정 표현 → De Morgan 보수 (이상은 부담돼 → lt)
_COMPLEMENT_AFTER = re.compile(
  r"^(?:(?:은|는|이|가|도|건|게|것은|거는|가격은)\s*)?"
  # 어간만 소비하면 "부담돼"의 "돼"가 semantic residual에 남는다.
  # 공백 전까지의 부정 서술어 전체를 가격 문법으로 소비한다.
  r"(?:부담\S*|싫\S*|별로\S*|안\s*돼\S*|말고|빼고|제외하고|제외)",
)
_COMPLEMENT_MAP = {"lte": "gt", "lt": "gte", "gte": "lt", "gt": "lte"}


def _parse_amount(raw: str) -> int | None:
  """'2만', '1만5천', '5천', '15000' → 원 단위 정수."""
  normalized = raw.replace(",", "").replace(" ", "")
  match = re.fullmatch(r"(\d+(?:\.\d+)?)만(?:(\d+)천)?원?", normalized)
  if match:
    amount = int(float(match.group(1)) * 10000)
    if match.group(2):
      amount += int(match.group(2)) * 1000
    return amount
  match = re.fullmatch(r"(\d+)천원?", normalized)
  if match:
    return int(match.group(1)) * 1000
  match = re.fullmatch(r"(\d{4,7})원?", normalized)
  if match:
    return int(match.group(1))
  return None


_AMOUNT_TOKEN = (
  r"\d+(?:\.\d+)?\s*만(?:\s*\d+\s*천)?\s*원?|"
  r"\d+\s*천\s*원?|"
  r"(?:\d{1,3}(?:,\d{3})+|\d{4,7})\s*원"
)
_PRICE_OR_CONNECTOR = re.compile(
  r"[,，]?\s*(?:아니면|혹은|또는|둘\s*중|도\s*괜찮고|거나)\s*",
)


def parse_price_constraints(text: str) -> dict[str, Any]:
  """가격 표현 → {"constraints": [delta...], "consumed": [span...], "orDetected": bool}.

  방향 표현이 확인될 때만 hard를 만들고(F10 수정의 본질 — 모르면 추측 금지),
  OR marker가 있으면 AND 공집합 대신 hard 미생성으로 fail-closed한다.
  """
  # 원문을 보존해야 consumed span이 canonical residual에서 정확히 제거된다.
  # 숫자 천 단위 쉼표는 _AMOUNT_TOKEN/_parse_amount가 직접 처리한다.
  normalized = str(text or "")
  constraints: list[dict[str, Any]] = []
  consumed: list[str] = []

  # 가격 OR은 *두 가격 표현 사이*의 connector만 인정한다. 문장 앞의
  # 카테고리 OR("립 또는 블러셔 중 2만원 이하")가 정상 가격 hard를
  # 지우면 안 된다.
  amount_spans = list(re.finditer(_AMOUNT_TOKEN, normalized))
  or_detected = False
  for left, right in zip(amount_spans, amount_spans[1:]):
    between = normalized[left.end():right.start()]
    connector = _PRICE_OR_CONNECTOR.search(between)
    bound_suffix = re.search(
      r"(?:이하|이상|미만|초과)\s*(?:나|이나)",
      between,
    )
    if connector or any(marker in between for marker in _PRICE_OR_MARKERS) or bound_suffix:
      or_detected = True
      if connector:
        consumed.append(connector.group(0))
      elif bound_suffix:
        # 방향어는 개별 경계 span이 소비하므로 접속 조사만 추가한다.
        suffix = re.search(r"(?:이)?나", bound_suffix.group(0))
        if suffix:
          consumed.append(suffix.group(0))
      break

  # 1) 명시 범위: "1~2만원", "2만원부터 3만원(까지|미만)", "N에서 M"
  range_pattern = re.compile(
    rf"({_AMOUNT_TOKEN}|\d+)\s*(?:~|-|에서)\s*({_AMOUNT_TOKEN})|"
    rf"({_AMOUNT_TOKEN})\s*부터\s*({_AMOUNT_TOKEN})\s*(까지|미만)?",
  )
  working = normalized
  for match in range_pattern.finditer(normalized):
    if match.group(1) is not None:
      low_raw, high_raw, upper_word = match.group(1), match.group(2), None
    else:
      low_raw, high_raw, upper_word = match.group(3), match.group(4), match.group(5)
    high = _parse_amount(high_raw.strip())
    low = _parse_amount(low_raw.strip())
    if low is None and high is not None and re.fullmatch(r"\d+", low_raw.strip()):
      # "1~2만원" — 좌측 숫자는 우측 단위를 공유
      if "만" in high_raw:
        low = int(float(low_raw.strip()) * 10000)
    if low is None or high is None or low > high:
      continue
    constraints.append(_between(low, high, upper_inclusive=(upper_word != "미만")))
    consumed.append(match.group(0))
    working = working.replace(match.group(0), " ")

  # 2) "N만원대" = [N만, (N+1)만)
  for match in re.finditer(r"(\d+)\s*만\s*원?\s*대", working):
    base = int(match.group(1)) * 10000
    constraints.append(_between(base, base + 10000, upper_inclusive=False))
    consumed.append(match.group(0))
    working = working.replace(match.group(0), " ")

  # 3) 단일 경계: 금액 + 방향 (방향 없으면 hard 미생성)
  for match in re.finditer(rf"({_AMOUNT_TOKEN})", working):
    amount = _parse_amount(match.group(1).strip())
    if amount is None:
      continue
    tail = working[match.end(): match.end() + 14]
    op = None
    matched_direction = ""
    matched_prefix = ""
    for pattern, direction in _DIRECTION_PATTERNS:
      direction_match = re.match(rf"\s*(?:{pattern})", tail)
      if direction_match:
        op = direction
        matched_direction = direction_match.group(0)
        break
    # "보다 싸게/비싼"은 금액 앞이 아니라 뒤 — 위 tail 검사로 처리됨. 앞쪽 "최대/최소 N원"도 지원.
    if op is None:
      head = working[max(0, match.start() - 8): match.start()]
      prefix_match = re.search(r"(최대|최소|적어도)\s*$", head)
      if prefix_match and prefix_match.group(1) == "최대":
        op = "lte"
        matched_prefix = prefix_match.group(0)
      elif prefix_match:
        op = "gte"
        matched_prefix = prefix_match.group(0)
    if op is None:
      continue  # 방향 미상 — hard 미생성 (질문 엔진의 가격 질문이 자연 커버)
    if or_detected:
      connector = re.match(
        r"\s*(?:나|거나|또는|도\s*괜찮(?:고|아(?:요)?))",
        tail[len(matched_direction):],
      )
      if connector:
        matched_direction += connector.group(0)
    # De Morgan 보수: 방향 직후 부정 ("2만원 이상은 부담돼" → lt 20000)
    remainder = tail[len(matched_direction):]
    stripped_remainder = remainder.lstrip()
    complement = _COMPLEMENT_AFTER.match(stripped_remainder[:10])
    if complement:
      op = _COMPLEMENT_MAP[op]
      consumed_length = len(remainder) - len(stripped_remainder) + complement.end()
      matched_direction += remainder[:consumed_length]
    constraints.append(_single_bound(op, amount))
    consumed.append(matched_prefix + match.group(0) + matched_direction)

  if or_detected:
    # OR 문법 fail-closed — 한쪽만 파싱됐어도 AND/단일 조건으로 축소하지 않는다.
    # 현 filterDelta에는 disjunction 표현력이 없으므로 clarification이 소비한다.
    return {"constraints": [], "consumed": consumed, "orDetected": True}
  return {"constraints": constraints, "consumed": consumed, "orDetected": False}


def _single_bound(op: str, amount: int) -> dict[str, Any]:
  return {
    "attribute": "priceKrw",
    "op": op,
    "numberValue": amount,
    "source": "prompt",
    "locked": True,
    "confidence": 0.9,
    "mode": "hard",
  }


def _between(lower: int, upper: int, *, upper_inclusive: bool, lower_inclusive: bool = True) -> dict[str, Any]:
  return {
    "attribute": "priceKrw",
    "op": "between",
    "priceRange": {
      "lowerKrw": lower,
      "upperKrw": upper,
      "lowerInclusive": lower_inclusive,
      "upperInclusive": upper_inclusive,
    },
    "source": "prompt",
    "locked": True,
    "confidence": 0.9,
    "mode": "hard",
  }


# ---------------------------------------------------------------- 공통 헬퍼


def _contains(text: str, terms: tuple[str, ...]) -> bool:
  lowered = text.lower()
  return any(term.lower() in lowered for term in terms)


def _filter(attribute: str, op: str, *, values: list[str] | None = None, number_value: int | None = None) -> dict[str, Any]:
  payload: dict[str, Any] = {
    "attribute": attribute,
    "op": op,
    "source": "prompt",
    "locked": True,
    "confidence": 0.9,
    "mode": "hard",
  }
  if values is not None:
    payload["values"] = values
  if number_value is not None:
    payload["numberValue"] = number_value
  return payload


def _soft(
  attribute: str,
  values: list[str],
  *,
  weight: float = 1.0,
  confidence: float = 0.7,
  avoid_values: list[str] | None = None,
) -> dict[str, Any]:
  payload: dict[str, Any] = {
    "attribute": attribute,
    "values": values,
    "source": "prompt",
    "confidence": confidence,
    "weight": weight,
  }
  if avoid_values:
    payload["avoidValues"] = avoid_values
  return payload


def _categories_in(text: str) -> list[str]:
  """등장 위치 순서의 카테고리 목록 (사전 순서가 아니라 문자 위치 — '립이나 블러셔' 다중 감지)."""
  found: list[tuple[int, str]] = []
  lowered = text.lower()
  for category, terms in CATEGORY_TERMS.items():
    positions = [lowered.find(term.lower()) for term in terms if term.lower() in lowered]
    if positions:
      found.append((min(p for p in positions if p >= 0), category))
  return [category for _pos, category in sorted(found)]


def _parse_out_of_scope(text: str) -> str | None:
  for name, terms in OUT_OF_SCOPE_TERMS.items():
    if _contains(text, terms):
      return name
  return None


def _finish_safe_text(text: str) -> str:
  # 실버그 가드: '블러'(velvet 단서)가 '블러셔/블러쉬/블러시'(치크 카테고리어) 안에서
  # 오탐되지 않게, finish 매칭용 텍스트에서 카테고리어를 마스킹한다.
  return re.sub(r"블러[셔쉬시]", " ", text)


def _matched_values(text: str, mapping: dict[str, tuple[str, ...]], *, finish_guard: bool = False) -> list[str]:
  scan = _finish_safe_text(text) if finish_guard else text
  return [value for value, terms in mapping.items() if _contains(scan, terms)]


# ---------------------------------------------------------------- 본체


def parse_intent(
  prompt: str,
  *,
  report_id: str | None = None,
  source: str | None = None,
  context: dict[str, Any] | None = None,
) -> dict[str, Any]:
  text = str(prompt or "").strip()
  locked_filters: list[dict[str, Any]] = []
  soft_preferences: list[dict[str, Any]] = []

  # 가격 보수 부정의 "싫어/말고"는 일반 속성 부정 마커가 아니다. 예를 들어
  # "립이나 블러셔 2만원 미만은 싫어"에서 카테고리까지 avoid로 바뀌지 않도록,
  # 결정론적으로 확정된 가격 문법 span을 일반 부정 스캐너 입력에서 먼저 제거한다.
  price = parse_price_constraints(text)
  negation_source = text
  for span in sorted(price["consumed"], key=len, reverse=True):
    negation_source = negation_source.replace(span, " ")

  spans = split_negation_spans(negation_source)
  positive_text = spans["positive"]
  negated_text = " ".join(spans["negated"])
  positive_oos = _parse_out_of_scope(positive_text)

  # --- 카테고리 (부정 스팬 규칙 — 계획 Stage 1-a) ---
  positive_categories = _categories_in(positive_text)
  negated_categories = _categories_in(negated_text)
  avoid_categories: list[str] = []
  category: str | None = None

  if spans["onlyPositive"]:
    # "A 말고는 다 싫어" = A만 원함
    only = _categories_in(spans["onlyPositive"])
    if len(only) == 1:
      category = only[0]

  if spans.get("onlyAvoid"):
    # "립 말고는 다 괜찮아" — 립만 피하고 나머지 카테고리를 다시 묻는다.
    avoid_categories = _categories_in(str(spans["onlyAvoid"]))

  if category is None:
    if negated_categories and positive_categories:
      distinct_positive = [c for c in positive_categories if c not in negated_categories]
      if len(distinct_positive) == 1:
        category = distinct_positive[0]  # "립 말고 블러셔" — 치환
      avoid_categories = list(negated_categories)
      # distinct_positive 복수 → 잠금 없이 질문 (아래 broad 처리)
    elif negated_categories:
      if (
        spans.get("onlyAvoid")
        or len(negated_categories) > 1
        or positive_oos is not None
        or any(hint in positive_text for hint in _ALTERNATIVE_HINTS)
      ):
        # "립 말고 다른 거", "립 말고 블러셔도 싫어", "립 말고는 다 괜찮아",
        # "립 말고 향수" — negated 카테고리를 다시 잠그지 않는다.
        avoid_categories = list(negated_categories)
      else:
        # 수식어 대조("글리터 강한 아이섀도우 말고 은은한 쉬머") — 카테고리 자체는 유지
        category = negated_categories[0]
    elif len(positive_categories) == 1:
      category = positive_categories[0]
    elif len(positive_categories) > 1:
      # "립이나 블러셔" — 첫 토큰 잠금 금지, 카테고리 질문으로
      category = None

  # OOS: positive 스팬 기준 — "립 말고 향수"는 지원 카테고리 존재와 무관하게 OOS
  unsupported_category = None
  if positive_oos:
    unsupported_category = positive_oos
  if unsupported_category is None and category is None and not positive_categories and not negated_categories:
    unsupported_category = _parse_out_of_scope(text)

  if category in SUPPORTED_CATEGORIES:
    locked_filters.append(_filter("category", "eq", values=[category]))

  # --- 가격 (A7 — 방향 필수·De Morgan 보수·범위·OR fail-closed) ---
  locked_filters.extend(price["constraints"])

  # --- 채널 ---
  if _contains(positive_text, ("올리브영", "olive young", "oliveyoung")):
    locked_filters.append(_filter("channel", "eq", values=["oliveyoung"]))
  elif _contains(positive_text, ("백화점", "department", "현대", "롯데백화점", "신세계")):
    locked_filters.append(_filter("channel", "eq", values=["department_store"]))

  # --- 속성 soft: positive 스팬에서 positive, negated 스팬에서 avoid ---
  for attribute, mapping in SOFT_ATTRIBUTE_TERMS.items():
    finish_guard = attribute == "finish"
    values = _matched_values(positive_text, mapping, finish_guard=finish_guard)
    avoid = _matched_values(negated_text, mapping, finish_guard=finish_guard)
    avoid = [value for value in avoid if value not in values]
    if values or avoid:
      soft_preferences.append(
        _soft(
          attribute,
          values,
          weight=SOFT_ATTRIBUTE_WEIGHTS.get(attribute, 0.7),
          avoid_values=avoid or None,
        ),
      )

  if _contains(text, ("글리터 강한", "강한 글리터", "과한 글리터")):
    soft_preferences.append(
      _soft("finish", ["shimmer"], weight=0.8, confidence=0.65, avoid_values=["glitter"]),
    )

  # --- 시맨틱 residual: positive 텍스트에서 consumed 스팬(가격·카테고리·채널·속성어) 제거 ---
  residual = positive_text
  # 가격 span이 접속어 span을 포함할 수 있으므로("이하나") 긴 표현부터
  # 제거해야 짧은 "나"가 먼저 사라지며 가격 문법이 residual에 부활하지 않는다.
  for span in sorted(price["consumed"], key=len, reverse=True):
    residual = residual.replace(span, " ")
  consumed_terms: list[str] = []
  if category:
    consumed_terms.extend(CATEGORY_TERMS.get(category, ()))
  for preference in soft_preferences:
    mapping = SOFT_ATTRIBUTE_TERMS.get(preference["attribute"], {})
    for value in preference.get("values") or []:
      consumed_terms.extend(mapping.get(value, ()))
  consumed_terms.extend(("올리브영", "백화점", "추천해줘", "추천", "찾아줘", "찾아", "보여줘"))
  for term in sorted(set(consumed_terms), key=len, reverse=True):
    residual = re.sub(re.escape(term), " ", residual, flags=re.IGNORECASE)
  residual = " ".join(residual.split())

  has_hard_detail = any(f["attribute"] in {"category", "priceKrw", "channel"} for f in locked_filters)
  has_descriptive_detail = bool(soft_preferences)
  broad = not has_hard_detail and not has_descriptive_detail
  if category is None and _contains(text, ("추천", "제품", "데일리", "쓸 만한", "찾아")):
    broad = True

  return {
    "prompt": text,
    "reportId": report_id,
    "source": source or "freePrompt",
    "context": context or {},
    "category": category,
    "unsupportedCategory": unsupported_category,
    "lockedFilters": locked_filters,
    "softPreferences": soft_preferences,
    "avoidCategories": avoid_categories,
    "negatedSpans": spans["negated"],
    "positiveResidual": residual,
    "priceOrDetected": price["orDetected"],
    "broad": broad,
    "requiresQuestion": broad or bool(soft_preferences),
  }
